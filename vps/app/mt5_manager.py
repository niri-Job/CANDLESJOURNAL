import os
import re
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

    def _is_authorized_in_log(self, login: str, server: str, start_ts: float) -> bool:
        """Return True only if the MT5 log shows an authorization for this account
        that was written AFTER start_ts (current session), ignoring old entries."""
        from datetime import date, datetime as dt
        today = date.today()
        log_path = os.path.join(
            WINEPREFIX, "drive_c", "Program Files", "MetaTrader 5",
            "logs", today.strftime("%Y%m%d.log"),
        )
        needle = f"'{login}': authorized on {server}"
        try:
            with open(log_path, encoding="utf-16-le", errors="ignore") as f:
                content = f.read()

            # Find every occurrence of the needle and parse its timestamp.
            # Log line format: "XX\t0\tHH:MM:SS.mmm\tCategory\tMessage"
            # (tab-separated after UTF-16 decode; the code strips all whitespace patterns)
            idx = content.find(needle)
            while idx >= 0:
                line_start = content.rfind("\n", 0, idx) + 1
                line = content[line_start: idx + len(needle)]
                parts = line.split()
                # parts[2] should be "HH:MM:SS.mmm"
                if len(parts) >= 3:
                    try:
                        ts_str = parts[2]
                        h, m, rest = ts_str.split(":")
                        s, ms = rest.split(".")
                        log_ts = dt(today.year, today.month, today.day,
                                    int(h), int(m), int(s),
                                    int(ms) * 1000).timestamp()
                        if log_ts >= start_ts:
                            return True
                    except Exception:
                        pass
                idx = content.find(needle, idx + 1)
            return False
        except Exception:
            return False

    def _write_account_json(self, login: str, server: str) -> None:
        """Write a minimal mt5_account.json so niri-sync can detect the active account
        even when the DataExport EA fails to write (e.g., FileOpen fails for a new broker)."""
        account_file = os.path.join(MT5_FILES_PATH, "mt5_account.json")
        data = {
            "login": int(login),
            "name": "",
            "server": server,
            "currency": "USD",
            "balance": 0.0,
            "equity": 0.0,
            "profit": 0.0,
            "leverage": 1000,
            "timestamp": int(time.time()),
        }
        try:
            with open(account_file, "w") as f:
                json.dump(data, f)
            logger.info("Wrote fallback account.json for login %s", login)
        except Exception as exc:
            logger.warning("Could not write fallback account.json: %s", exc)

    def _update_common_ini(self, login: str, server: str) -> None:
        """Patch common.ini so MT5 starts connected to the right account/server."""
        common_ini = os.path.join(
            WINEPREFIX, "drive_c", "Program Files", "MetaTrader 5", "Config", "common.ini"
        )
        try:
            with open(common_ini, encoding="utf-8") as f:
                content = f.read()
            content = re.sub(r"(?m)^Login=.*$", f"Login={login}", content)
            content = re.sub(r"(?m)^Server=.*$", f"Server={server}", content)
            with open(common_ini, "w", encoding="utf-8") as f:
                f.write(content)
            logger.info("Updated common.ini: Login=%s Server=%s", login, server)
        except Exception as exc:
            logger.warning("Could not update common.ini: %s", exc)

    def _restart_mt5(self, login: str, password: str, server: str) -> bool:
        """Kill the current MT5 terminal, start it with new credentials, and wait
        for the DataExport EA to write a fresh mt5_account.json with the matching
        login. Returns True on success, False on timeout."""
        logger.info("Switching MT5 → account %s on %s", login, server)

        # Kill sequence — reduced waits for faster cycle time
        subprocess.run(["pkill", "-TERM", "-f", "terminal64.exe"], capture_output=True)
        time.sleep(1)
        subprocess.run(["pkill", "-9", "-f", "terminal64.exe"], capture_output=True)
        time.sleep(1)
        subprocess.run(["pkill", "-9", "-f", "wineserver"], capture_output=True)
        time.sleep(3)  # enough for wineserver to release the single-instance mutex

        self._update_common_ini(login, server)

        env = {
            **os.environ,
            "DISPLAY": DISPLAY,
            "WINEPREFIX": WINEPREFIX,
            "WINEDEBUG": "-all",
        }
        subprocess.Popen(
            ["wine", MT5_TERMINAL, "/portable", "/autotrading",
             f"/login:{login}", f"/password:{password}", f"/server:{server}",
             "/expert:DataExport"],
            env=env,
            start_new_session=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        account_file = os.path.join(MT5_FILES_PATH, "mt5_account.json")
        start_ts = time.time()
        logger.info("Waiting up to 90s for MT5 to connect as %s...", login)

        # Brief window to accept any first-connect Login dialog (10s instead of 30s —
        # the log-detection loop below fires much sooner than the old 30s xdotool wait).
        env_d = {**os.environ, "DISPLAY": DISPLAY}
        for _ in range(10):
            time.sleep(1)
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

        # Poll every 2s for up to 90s.
        # When the terminal log shows authorization, write a fallback json immediately
        # (so _current_mt5_login() picks up the right account), but CONTINUE polling
        # so the DataExport EA can overwrite with real balance/name data.
        # The EA typically fires OnTimer ~45-75s after MT5 connects; returning as soon
        # as it writes gives the dashboard real data instead of the 0-balance fallback.
        fallback_written = False
        for _ in range(45):
            time.sleep(2)
            try:
                mtime = os.path.getmtime(account_file)
                if mtime >= start_ts:
                    with open(account_file) as f:
                        data = json.load(f)
                    if str(data.get("login")) == str(login):
                        if data.get("name"):
                            # DataExport EA wrote real account data (name is non-empty).
                            # Return now so the caller reads real balance + deals.
                            logger.info(
                                "MT5 connected: login=%s name=%s balance=%s %s",
                                login, data.get("name"), data.get("balance"),
                                data.get("currency"),
                            )
                            return True
                        # account.json was updated but name is still empty.
                        # This is either our own fallback write or an Exness trial
                        # account whose MT5 name field is genuinely "".
                        # Keep polling so EA gets a chance to write a proper value.
                else:
                    # EA hasn't written yet — use log as an early signal to write
                    # fallback so _current_mt5_login() works during the wait,
                    # but DO NOT return here; keep the loop running.
                    if not fallback_written and self._is_authorized_in_log(
                            login, server, start_ts):
                        logger.info(
                            "MT5 authorized (log) for %s — writing fallback, continuing poll",
                            login,
                        )
                        self._write_account_json(login, server)
                        fallback_written = True
            except Exception:
                pass

        # Timed out waiting for real data.  If we at least know the account is
        # connected (from log detection), accept the fallback so the sync marks
        # this account as connected (even with 0 balance).
        if fallback_written:
            logger.info("EA did not write real data within 90s for %s — using fallback", login)
            return True

        # One manual EA-attach attempt then a shorter final wait
        logger.warning("EA not writing JSON after 90s — attaching manually")
        time.sleep(5)
        self._attach_ea()
        time.sleep(30)

        try:
            if os.path.getmtime(account_file) >= start_ts:
                with open(account_file) as f:
                    data = json.load(f)
                if str(data.get("login")) == str(login):
                    logger.info("MT5 connected after manual EA attach: %s", login)
                    return True
        except Exception:
            pass

        if self._is_authorized_in_log(login, server, start_ts):
            logger.info("MT5 authorized (log fallback) for %s — writing fallback JSON", login)
            self._write_account_json(login, server)
            return True

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

        # Decrypt passwords before spawning threads (cipher is not thread-safe to share).
        jobs = [
            (row["user_id"], row["mt5_login"], self.decrypt(row["enc_password"]), row["broker_server"])
            for row in rows
        ]

        # Sort so the account already running in MT5 goes first.  It needs no
        # restart and completes in seconds, freeing the _mt5_lock for the next
        # account while its own Supabase uploads run in parallel.
        current = self._current_mt5_login()
        jobs.sort(key=lambda j: 0 if j[1] == current else 1)

        loop = asyncio.get_event_loop()

        # Launch all account syncs concurrently.  _mt5_lock serialises the
        # actual MT5 switch; everything else (Supabase reads/writes) overlaps.
        results = await asyncio.gather(
            *(loop.run_in_executor(None, self._sync_one_account, *job) for job in jobs),
            return_exceptions=True,
        )
        for (uid, login, _, _), exc in zip(jobs, results):
            if isinstance(exc, Exception):
                logger.exception("Sync failed for user %s login %s", uid, login, exc_info=exc)

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

            has_real_data = bool(account_data.get("name"))
            # Only read deals.json when the DataExport EA actually ran for this
            # account.  If we only have fallback data (name=""), deals.json may
            # still contain stale trades from the *previous* account — reading
            # them would insert them with the wrong account_signature.
            deals_raw: list = []
            if has_real_data:
                try:
                    with open(deals_file) as f:
                        deals_raw = json.load(f)
                except FileNotFoundError:
                    pass

            now = datetime.now(timezone.utc)
            account_sig = f"{login}_{server}"
            trades = []
            for d in deals_raw:
                deal_type = d.get("type")
                if deal_type not in (0, 1):
                    continue
                trades.append({
                    "user_id":           user_id,
                    "mt5_deal_id":       str(d["ticket"]),
                    "date":              datetime.fromtimestamp(d["time"], tz=timezone.utc).isoformat(),
                    "pair":              d.get("symbol", ""),
                    "direction":         DEAL_TYPE_MAP.get(deal_type, "buy"),
                    "lot":               float(d.get("volume", 0)),
                    "entry":             float(d.get("price", 0)),
                    "exit_price":        float(d.get("price", 0)),
                    "pnl":               float(d.get("profit", 0)),
                    "account_label":     login,
                    "account_signature": account_sig,
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

            # Backfill account_signature on existing trades that lack it
            self.supabase.table("trades")\
                .update({"account_signature": account_sig})\
                .eq("user_id", user_id)\
                .eq("account_label", login)\
                .is_("account_signature", "null")\
                .execute()

            currency = account_data.get("currency") or "USD"
            balance  = float(account_data.get("balance", 0.0))
            acc_name = account_data.get("name") or ""
            # has_real_data was set above after reading account_data

            conn_update: dict = {
                "status":         "connected",
                "last_synced_at": now.isoformat(),
                "sync_error":     None,
            }
            # Only overwrite balance/name when the EA gave us real data.
            # If we only have fallback (name=""), preserve whatever Supabase had before
            # so the dashboard keeps showing the last known real balance.
            if has_real_data:
                conn_update["account_name"]     = acc_name
                conn_update["account_currency"] = currency
                conn_update["account_balance"]  = balance

            self.supabase.table("mt5_connections").update(conn_update)\
                .eq("user_id", user_id).eq("mt5_login", login).execute()

            # Keep trading_accounts in sync so the Dashboard account switcher works
            _ta_base = {
                "user_id": user_id, "account_signature": account_sig,
                "account_login": login, "account_server": server,
                "account_type": "real", "sync_method": "mt5_direct",
                "sync_status": "connected", "last_synced_at": now.isoformat(),
                "sync_error": None, "is_verified": True,
                "verification_status": "verified_direct",
            }
            if has_real_data:
                _ta_base["account_currency"] = currency
            _ta = _ta_base
            try:
                self.supabase.table("trading_accounts").insert(_ta).execute()
            except Exception:
                _ta_upd = {k: v for k, v in _ta.items() if k not in ("user_id", "account_signature")}
                self.supabase.table("trading_accounts").update(_ta_upd).eq("user_id", user_id).eq("account_signature", account_sig).execute()

            logger.info("Synced %d trades for login %s", len(trades), login)

        except Exception as e:
            logger.exception("Sync error for login %s", login)
            self.supabase.table("mt5_connections").update({
                "status":     "failed",
                "sync_error": str(e)[:500],
            }).eq("user_id", user_id).eq("mt5_login", login).execute()
            raise
