import os
import asyncio
import logging
import sqlite3
from datetime import datetime, timezone
from typing import Optional

import aiosqlite
from cryptography.fernet import Fernet
from mt5linux import MetaTrader5
from supabase import create_client, Client

logger = logging.getLogger(__name__)

DB_PATH = os.getenv("DB_PATH", "/opt/niri-sync/connections.db")
MT5_HOST = os.getenv("MT5_BRIDGE_HOST", "localhost")
MT5_PORT = int(os.getenv("MT5_BRIDGE_PORT", "18812"))

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
        result = await loop.run_in_executor(None, self._sync_test, login, password, server)
        return result

    def _sync_test(self, login: str, password: str, server: str) -> dict:
        mt5 = MetaTrader5(MT5_HOST, MT5_PORT)
        try:
            ok = mt5.initialize(login=int(login), password=password, server=server)
            if not ok:
                err = mt5.last_error()
                return {"success": False, "error": f"MT5 error {err[0]}: {err[1]}"}
            info = mt5.account_info()
            mt5.shutdown()
            return {
                "success": True,
                "account_name": info.name if info else None,
                "account_currency": info.currency if info else "USD",
                "account_balance": info.balance if info else None,
            }
        except Exception as e:
            logger.exception("test_connection failed")
            return {"success": False, "error": str(e)}
        finally:
            try:
                mt5.shutdown()
            except Exception:
                pass

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
        mt5 = MetaTrader5(MT5_HOST, MT5_PORT)
        try:
            self.supabase.table("mt5_connections")\
                .update({"status": "syncing"})\
                .eq("user_id", user_id).eq("mt5_login", login).execute()

            ok = mt5.initialize(login=int(login), password=password, server=server)
            if not ok:
                err = mt5.last_error()
                raise RuntimeError(f"MT5 init failed: {err[0]} {err[1]}")

            # Fetch all deals from history
            from datetime import timedelta
            now = datetime.now(timezone.utc)
            date_from = datetime(2000, 1, 1, tzinfo=timezone.utc)
            deals = mt5.history_deals_get(date_from, now)
            if deals is None:
                deals = []

            account_info = mt5.account_info()

            trades = []
            for d in deals:
                if d.type not in (0, 1):  # DEAL_TYPE_BUY, DEAL_TYPE_SELL
                    continue
                trades.append({
                    "user_id": user_id,
                    "mt5_deal_id": str(d.ticket),
                    "open_time": datetime.fromtimestamp(d.time, tz=timezone.utc).isoformat(),
                    "close_time": datetime.fromtimestamp(d.time, tz=timezone.utc).isoformat(),
                    "symbol": d.symbol,
                    "trade_type": DEAL_TYPE_MAP.get(d.type, "buy"),
                    "volume": float(d.volume),
                    "open_price": float(d.price),
                    "close_price": float(d.price),
                    "profit": float(d.profit),
                    "commission": float(d.commission),
                    "swap": float(d.swap),
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
            if account_info:
                status_update.update({
                    "account_name": account_info.name,
                    "account_currency": account_info.currency,
                    "account_balance": float(account_info.balance),
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
        finally:
            try:
                mt5.shutdown()
            except Exception:
                pass
