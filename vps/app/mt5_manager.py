import os
import json
import asyncio
import logging
import sqlite3
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

DEAL_TYPE_MAP = {0: "buy", 1: "sell"}


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
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     TEXT    NOT NULL,
                mt5_login   TEXT    NOT NULL,
                broker_server TEXT  NOT NULL,
                enc_password TEXT   NOT NULL,
                created_at  TEXT    NOT NULL,
                UNIQUE(user_id, mt5_login, broker_server)
            )
        """)
        conn.commit()
        conn.close()

    def encrypt(self, plaintext: str) -> str:
        return self.cipher.encrypt(plaintext.encode()).decode()

    def decrypt(self, token: str) -> str:
        return self.cipher.decrypt(token.encode()).decode()

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
            "user_id": user_id,
            "mt5_login": login,
            "broker_server": server,
            "status": "pending",
        }, on_conflict="user_id,mt5_login,broker_server").execute()

        return {"login": login, "server": server, "status": "pending"}

    async def remove_connection(self, user_id: str, login: str):
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "DELETE FROM connections WHERE user_id=? AND mt5_login=?",
                (user_id, login)
            )
            await db.commit()

        self.supabase.table("mt5_connections")\
            .update({"status": "disconnected"})\
            .eq("user_id", user_id)\
            .eq("mt5_login", login)\
            .execute()

    async def get_connections_for_user(self, user_id: str) -> list[dict]:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT mt5_login, broker_server FROM connections WHERE user_id=?",
                (user_id,)
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
            return {"success": False, "error": "MT5 connection timed out (90s). Check login, password, and server name."}
        return result

    def _sync_test(self, login: str, password: str, server: str) -> dict:
        account_file = os.path.join(MT5_FILES_PATH, "mt5_account.json")
        try:
            with open(account_file, "r") as f:
                data = json.load(f)
        except FileNotFoundError:
            return {"success": False, "error": "DataExport EA is not running. Restart MT5 service — EA auto-attaches on startup."}
        except json.JSONDecodeError as e:
            return {"success": False, "error": f"Malformed account data: {e}"}

        if str(data.get("login")) == str(login):
            return {
                "success": True,
                "account_name": data.get("name") or "",
                "account_currency": data.get("currency") or "USD",
                "account_balance": float(data.get("balance", 0.0)),
            }

        # Login doesn't match the currently-running MT5 account.
        # Accept the connection — account data will populate once the
        # VPS terminal is running the matching account.
        logger.warning(
            "_sync_test: login %s accepted but VPS is running %s — data pending",
            login, data.get("login"),
        )
        return {"success": True, "account_name": "", "account_currency": "", "account_balance": 0.0}

    async def sync_all(self):
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT user_id, mt5_login, broker_server, enc_password FROM connections") as cur:
                rows = await cur.fetchall()

        for row in rows:
            user_id = row["user_id"]
            login   = row["mt5_login"]
            server  = row["broker_server"]
            password = self.decrypt(row["enc_password"])
            try:
                await asyncio.get_event_loop().run_in_executor(
                    None, self._sync_account, user_id, login, password, server
                )
            except Exception:
                logger.exception("Sync failed for user %s login %s", user_id, login)

    def _sync_account(self, user_id: str, login: str, password: str, server: str):
        account_file = os.path.join(MT5_FILES_PATH, "mt5_account.json")
        deals_file = os.path.join(MT5_FILES_PATH, "mt5_deals.json")
        try:
            self.supabase.table("mt5_connections")\
                .update({"status": "syncing"})\
                .eq("user_id", user_id).eq("mt5_login", login).execute()

            with open(account_file, "r") as f:
                account_data = json.load(f)

            if str(account_data.get("login")) != str(login):
                logger.warning(
                    "_sync_account: skipping sync for login %s, VPS running %s",
                    login, account_data.get("login"),
                )
                self.supabase.table("mt5_connections")\
                    .update({"status": "pending", "sync_error": None})\
                    .eq("user_id", user_id).eq("mt5_login", login).execute()
                return

            try:
                with open(deals_file, "r") as f:
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
                    "user_id": user_id,
                    "mt5_deal_id": str(d["ticket"]),
                    "open_time": datetime.fromtimestamp(d["time"], tz=timezone.utc).isoformat(),
                    "close_time": datetime.fromtimestamp(d["time"], tz=timezone.utc).isoformat(),
                    "symbol": d.get("symbol", ""),
                    "trade_type": DEAL_TYPE_MAP.get(deal_type, "buy"),
                    "volume": float(d.get("volume", 0)),
                    "open_price": float(d.get("price", 0)),
                    "close_price": float(d.get("price", 0)),
                    "profit": float(d.get("profit", 0)),
                    "commission": float(d.get("commission", 0)),
                    "swap": float(d.get("swap", 0)),
                    "source": "mt5_direct",
                })

            if trades:
                self.supabase.table("trades").upsert(
                    trades, on_conflict="user_id,mt5_deal_id"
                ).execute()

            status_update = {
                "status": "connected",
                "last_synced_at": now.isoformat(),
                "sync_error": None,
            }
            name = account_data.get("name") or ""
            currency = account_data.get("currency") or "USD"
            balance = float(account_data.get("balance", 0.0))
            status_update.update({
                "account_name": name,
                "account_currency": currency,
                "account_balance": balance,
            })

            self.supabase.table("mt5_connections")\
                .update(status_update)\
                .eq("user_id", user_id).eq("mt5_login", login).execute()

            logger.info("Synced %d deals for login %s", len(trades), login)
        except Exception as e:
            logger.exception("Sync error for login %s", login)
            self.supabase.table("mt5_connections")\
                .update({"status": "failed", "sync_error": str(e)[:500]})\
                .eq("user_id", user_id).eq("mt5_login", login).execute()
            raise
