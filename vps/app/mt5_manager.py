import os
import json
import asyncio
import logging
import sqlite3
import subprocess
import threading
import time
from datetime import datetime, timezone

import aiosqlite
from cryptography.fernet import Fernet
from supabase import create_client, Client

logger = logging.getLogger(__name__)

DB_PATH = os.getenv("DB_PATH", "/opt/niri-sync/connections.db")
MT5_FILES_PATH = os.getenv(
    "MT5_FILES_PATH",
    "/home/niri/.wine/drive_c/Program Files/MetaTrader 5/MQL5/Files",
)
MT5_TERMINAL = os.getenv(
    "MT5_TERMINAL",
    "/home/niri/.wine/drive_c/Program Files/MetaTrader 5/terminal64.exe",
)
WINEPREFIX = os.getenv("WINEPREFIX", "/home/niri/.wine")
DISPLAY = os.getenv("DISPLAY", ":99")

DEAL_TYPE_MAP = {0: "BUY", 1: "SELL"}

# Only one MT5 account switch at a time
_mt5_lock = threading.Lock()


class MT5Manager:
    def __init__(self):
        fernet_key = os.getenv("FERNET_KEY", "").encode()
        if not fernet_key:
            raise RuntimeError("FERNET_KEY is not set")
        self.cipher = Fernet(fernet_key)
        self.supabase: Client = create_client(
            os.getenv("SUPABASE_URL", ""),
            os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""),
        )
        self._init_db()

    def _init_db(self):
        conn = sqlite3.connect(DB_PATH)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS connections (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id       TEXT    NOT NULL,
                mt5_login     TEXT    NOT NULL,
                broker_server TEXT    NOT NULL,
                enc_password  TEXT    NOT NULL,
                created_at    TEXT    NOT NULL,
                UNIQUE(user_id, mt5_login, broker_server)
            )
        """)
        conn.commit()
        conn.close()

    def encrypt(self, plaintext: str) -> str:
        return self.cipher.encrypt(plaintext.encode()).decode()

    def decrypt(self, token: str) -> str:
        return self.cipher.decrypt(token.encode()).decode()

    # ── MT5 process management ────────────────────────────────────────────────

    def _current_mt5_login(self) -> str | None:
        """Return the login currently active in the MT5 terminal, or None."""
        account_file = os.path.join(MT5_FILES_PATH, "mt5_account.json")
        try:
            with open(account_file) as f:
                data = json.load(f)
            login = str(data.get("login", ""))
            return login if login and login != "0" else None
        except Exception:
            return None

    def _xdotool(self, *args: str) -> None:
        env = {**os.environ, "DISPLAY": DISPLAY}
        subprocess.run(["xdotool", *args], env=env, capture_output=True)

    def _attach_ea(self) -> None:
        """Attach DataExport EA via Navigator xdotool sequence."""
        logger.info("Attaching DataExport EA via Navigator...")
        # Expand Expert Advisors (arrow at x=14, y=334 in collapsed state)
        self._xdotool("mousemove", "14", "334"); time.sleep(0.5)
        self._xdotool("click", "1"); time.sleep(2)
        # Double-click DataExport (at x=82, y=388 after expansion)
        self._xdotool("mousemove", "82", "388"); time.sleep(0.5)
        self._xdotool("click", "--repeat", "2", "--delay", "200", "1"); time.sleep(3)
        # Accept the EA properties dialog
        self._xdotool("key", "Return"); time.sleep(1)
        logger.info("DataExport EA attachment attempted")

    def _restart_mt5(self, login: str, password: str, server: str) -> bool:
        """Kill the current MT5 terminal, start it with new credentials, and wait
        for the DataExport EA to write a fresh mt5_account.json with the matching
        login. Returns True on success, False on timeout."""
        logger.info("Switching MT5 → account %s on %s", login, server)

        # Graceful kill first (allows profile save), then force
        subprocess.run(["pkill", "-TERM", "-f", "terminal64.exe"], capture_output=True)
        time.sleep(3)
        subprocess.run(["pkill", "-9", "-f", "terminal64.exe"], capture_output=True)
        time.sleep(2)

        env = {
            **os.environ,
            "DISPLAY": DISPLAY,
            "WINEPREFIX": WINEPREFIX,
            "WINEDEBUG": "-all",
            "WINEDLLOVERRIDES": "mscoree,mshtml=d",
        }
        subprocess.Popen(
            ["wine", MT5_TERMINAL, "/portable", "/autotrading",
             f"/login:{login}", f"/password:{password}", f"/server:{server}",
             "/expert:DataExport"],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        account_file = os.path.join(MT5_FILES_PATH, "mt5_account.json")
        start_ts = time.time()
        logger.info("Waiting up to 120s for MT5 to connect as %s...", login)

        # Accept any "Login" confirmation dialog that MT5 may show (first connect to new server)
        for _ in range(30):
            time.sleep(1)
            env_d = {**os.environ, "DISPLAY": DISPLAY}
            win = subprocess.run(
                ["xdotool", "search", "--name", "Login"],
                env=env_d, capture_output=True, text=True,
            ).stdout.strip()
            if win:
                logger.info("Found Login dialog — pressing Enter")
                subprocess.run(["xdotool", "windowfocus", "--sync", win.splitlines()[0]],
                               env=env_d, capture_output=True)
                time.sleep(0.3)
                subprocess.run(["xdotool", "key", "Return"], env=env_d, capture_output=True)
                break

        # Poll for a fresh JSON with the matching login (EA writes every 30s)
        for _ in range(60):
            time.sleep(2)
            try:
                if os.path.getmtime(account_file) < start_ts:
                    continue
                with open(account_file) as f:
                    data = json.load(f)
                if str(data.get("login")) == str(login):
                    logger.info(
                        "MT5 connected: login=%s name=%s balance=%s %s",
                        login, data.get("name"), data.get("balance"), data.get("currency"),
                    )
                    return True
            except Exception:
                pass

        # EA didn't write a fresh file — profile may not have had it attached.
        # Attach it manually then wait one more OnTimer cycle (35s).
        logger.warning("EA not writing JSON after 120s — attaching manually")
        time.sleep(10)
        self._attach_ea()
        time.sleep(35)

        try:
            if os.path.getmtime(account_file) >= start_ts:
                with open(account_file) as f:
                    data = json.load(f)
                if str(data.get("login")) == str(login):
                    logger.info("MT5 connected after manual EA attach: %s", login)
                    return True
        except Exception:
            pass

        logger.error("MT5 failed to connect account %s within time limit", login)
        return False

    # ── Public API ────────────────────────────────────────────────────────────

    async def add_connection(self, user_id: str, login: str, password: str, server: str) -> dict:
        enc = self.encrypt(password)
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute("""
                INSERT INTO connections (user_id, mt5_login, broker_server, enc_password, created_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id, mt5_login, broker_server)
                DO UPDATE SET enc_password=excluded.enc_password
            """, (user_id, login, server, enc, datetime.now(timezone.utc).isoformat()))
            await db.commit()

        self.supabase.table("mt5_connections").upsert({
            "user_id":       user_id,
            "mt5_login":     login,
            "broker_server": server,
            "status":        "pending",
        }, on_conflict="user_id,mt5_login,broker_server").execute()

        return {"login": login, "server": server, "status": "pending"}

    async def remove_connection(self, user_id: str, login: str):
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "DELETE FROM connections WHERE user_id=? AND mt5_login=?",
                (user_id, login),
            )
            await db.commit()

        self.supabase.table("mt5_connections")\
            .update({"status": "disconnected"})\
            .eq("user_id", user_id).eq("mt5_login", login).execute()

    async def get_connections_for_user(self, user_id: str) -> list[dict]:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT mt5_login, broker_server FROM connections WHERE user_id=?",
                (user_id,),
            ) as cur:
                rows = await cur.fetchall()
        return [{"login": r["mt5_login"], "server": r["broker_server"]} for r in rows]

    async def test_connection(self, login: str, password: str, server: str) -> dict:
        loop = asyncio.get_event_loop()
        try:
            result = await asyncio.wait_for(
                loop.run_in_executor(None, self._sync_test, login, password, server),
                timeout=90,
            )
        except asyncio.TimeoutError:
            return {"success": False, "error": "Connection test timed out. Check credentials."}
        return result

    def _sync_test(self, login: str, password: str, server: str) -> dict:
        account_file = os.path.join(MT5_FILES_PATH, "mt5_account.json")
        try:
            with open(account_file) as f:
                data = json.load(f)
        except FileNotFoundError:
            return {"success": False, "error": "DataExport EA is not running. Restart MT5 service."}
        except json.JSONDecodeError as e:
            return {"success": False, "error": f"Malformed account data: {e}"}

        if str(data.get("login")) == str(login):
            return {
                "success":          True,
                "account_name":     data.get("name") or "",
                "account_currency": data.get("currency") or "USD",
                "account_balance":  float(data.get("balance", 0.0)),
            }

        # Different account running — accept connection; sync will switch MT5
        logger.warning(
            "_sync_test: login %s accepted; VPS running %s — will switch on next sync",
            login, data.get("login"),
        )
        return {"success": True, "account_name": "", "account_currency": "", "account_balance": 0.0}

    # ── Sync loop ─────────────────────────────────────────────────────────────

    async def sync_all(self):
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT user_id, mt5_login, broker_server, enc_password FROM connections"
            ) as cur:
                rows = list(await cur.fetchall())

        if not rows:
            return

        # All accounts run sequentially in one executor thread — MT5 can only
        # be logged into one account at a time, so switches are serialized.
        await asyncio.get_event_loop().run_in_executor(
            None, self._sync_all_accounts, rows
        )

    def _sync_all_accounts(self, rows) -> None:
        for row in rows:
            user_id  = row["user_id"]
            login    = row["mt5_login"]
            server   = row["broker_server"]
            password = self.decrypt(row["enc_password"])
            try:
                self._sync_one_account(user_id, login, password, server)
            except Exception:
                logger.exception("Sync failed for user %s login %s", user_id, login)

    def _sync_one_account(self, user_id: str, login: str, password: str, server: str) -> None:
        account_file = os.path.join(MT5_FILES_PATH, "mt5_account.json")
        deals_file   = os.path.join(MT5_FILES_PATH, "mt5_deals.json")

        self.supabase.table("mt5_connections")\
            .update({"status": "syncing"})\
            .eq("user_id", user_id).eq("mt5_login", login).execute()

        try:
            # Switch MT5 to this account if it isn't already running it
            with _mt5_lock:
                if self._current_mt5_login() != str(login):
                    if not self._restart_mt5(login, password, server):
                        raise RuntimeError(f"Failed to connect MT5 for account {login}")

            with open(account_file) as f:
                account_data = json.load(f)

            if str(account_data.get("login")) != str(login):
                raise RuntimeError(
                    f"Account mismatch after switch: got {account_data.get('login')}, want {login}"
                )

            try:
                with open(deals_file) as f:
                    deals_raw = json.load(f)
            except FileNotFoundError:
                deals_raw = []

            now = datetime.now(timezone.utc)
            trades = []
            for d in deals_raw:
                deal_type = d.get("type")
                if deal_type not in (0, 1):
                    continue
                trades.append({
                    "user_id":       user_id,
                    "mt5_deal_id":   str(d["ticket"]),
                    "date":          datetime.fromtimestamp(d["time"], tz=timezone.utc).isoformat(),
                    "pair":          d.get("symbol", ""),
                    "direction":     DEAL_TYPE_MAP.get(deal_type, "buy"),
                    "lot":           float(d.get("volume", 0)),
                    "entry":         float(d.get("price", 0)),
                    "exit_price":    float(d.get("price", 0)),
                    "pnl":           float(d.get("profit", 0)),
                    "account_label": login,
                })

            if trades:
                existing = self.supabase.table("trades")\
                    .select("mt5_deal_id")\
                    .eq("user_id", user_id)\
                    .not_.is_("mt5_deal_id", "null")\
                    .execute()
                existing_ids = {r["mt5_deal_id"] for r in existing.data}
                new_trades = [t for t in trades if t["mt5_deal_id"] not in existing_ids]
                if new_trades:
                    self.supabase.table("trades").insert(new_trades).execute()

            self.supabase.table("mt5_connections").update({
                "status":           "connected",
                "last_synced_at":   now.isoformat(),
                "sync_error":       None,
                "account_name":     account_data.get("name") or "",
                "account_currency": account_data.get("currency") or "USD",
                "account_balance":  float(account_data.get("balance", 0.0)),
            }).eq("user_id", user_id).eq("mt5_login", login).execute()

            logger.info("Synced %d trades for login %s", len(trades), login)

        except Exception as e:
            logger.exception("Sync error for login %s", login)
            self.supabase.table("mt5_connections").update({
                "status":     "failed",
                "sync_error": str(e)[:500],
            }).eq("user_id", user_id).eq("mt5_login", login).execute()
            raise
