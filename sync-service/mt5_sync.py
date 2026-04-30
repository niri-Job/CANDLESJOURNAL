"""
CandlesJournal — MT5 Quick Connect Sync Service
================================================
Runs on a VPS/server (NOT Netlify — requires MetaTrader5 terminal installed).
Polls trading_accounts for investor-connected accounts and syncs closed deals
to the trades table every 30 seconds.

Requirements:
    pip install MetaTrader5 supabase cryptography python-dotenv

Environment variables (.env file or system env):
    SUPABASE_URL            = https://xxxx.supabase.co
    SUPABASE_SERVICE_KEY    = service_role_key_here
    ENCRYPTION_KEY          = same 32-char key used in Next.js ENCRYPTION_KEY
    MT5_TERMINAL_PATH       = C:\\Program Files\\MetaTrader 5\\terminal64.exe
                              (optional — auto-detected if omitted)
"""

from __future__ import annotations

import asyncio
import binascii
import logging
import os
import time
from datetime import datetime, timezone
from typing import Optional

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from dotenv import load_dotenv
from supabase import create_client, Client

try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    MT5_AVAILABLE = False

# ── Config ──────────────────────────────────────────────────────────────────
load_dotenv()

SUPABASE_URL         = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
ENCRYPTION_KEY       = os.getenv("ENCRYPTION_KEY", "")
MT5_TERMINAL_PATH    = os.getenv("MT5_TERMINAL_PATH", "")  # optional
SYNC_INTERVAL_SEC    = 30
ACCOUNT_DELAY_SEC    = 2   # delay between accounts to avoid hammering brokers
MAX_ACCOUNTS         = 100

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("mt5_sync")


# ── Encryption helpers ───────────────────────────────────────────────────────
def _aes_key() -> bytes:
    raw = ENCRYPTION_KEY.encode("utf-8")
    return raw.ljust(32, b"\x00")[:32]


def decrypt_password(encrypted: str) -> str:
    """Reverse of the Node.js encryptPassword() in connect/route.ts."""
    iv_hex, enc_hex = encrypted.split(":", 1)
    iv  = bytes.fromhex(iv_hex)
    enc = bytes.fromhex(enc_hex)
    cipher = Cipher(algorithms.AES(_aes_key()), modes.CBC(iv), backend=default_backend())
    dec = cipher.decryptor()
    padded = dec.update(enc) + dec.finalize()
    # Remove PKCS7 padding
    pad_len = padded[-1]
    return padded[:-pad_len].decode("utf-8")


# ── Supabase client ──────────────────────────────────────────────────────────
def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


# ── Deal → trade normalisation ───────────────────────────────────────────────
def _asset_class(symbol: str) -> str:
    s = symbol.upper()
    if any(c in s for c in ["BTC", "ETH", "XRP", "LTC"]):
        return "Crypto"
    if any(c in s for c in ["XAU", "XAG", "GC", "SI"]):
        return "Metals"
    if any(c in s for c in ["US30", "NAS", "SPX", "DAX", "FTSE"]):
        return "Indices"
    if "OIL" in s or "BRENT" in s or "WTI" in s:
        return "Commodities"
    return "Forex"


def normalise_deal(deal) -> Optional[dict]:
    """Convert an MT5 deal object to a trades table row dict. Returns None to skip."""
    # Only closed/exit deals
    if deal.type not in (mt5.DEAL_TYPE_BUY, mt5.DEAL_TYPE_SELL):
        return None
    if deal.entry != mt5.DEAL_ENTRY_OUT:
        return None

    direction = "BUY" if deal.type == mt5.DEAL_TYPE_BUY else "SELL"
    ts = datetime.fromtimestamp(deal.time, tz=timezone.utc)
    date_str = ts.strftime("%Y-%m-%d")

    return {
        "pair":        deal.symbol.upper(),
        "direction":   direction,
        "lot":         float(deal.volume),
        "date":        date_str,
        "entry":       float(deal.price),
        "exit_price":  float(deal.price),   # exit deal price
        "sl":          None,
        "tp":          None,
        "pnl":         float(deal.profit),
        "notes":       "Auto-synced via Quick Connect",
        "asset_class": _asset_class(deal.symbol),
        "session":     "London",
        "setup":       "",
        "mt5_deal_id": str(deal.ticket),
    }


# ── MT5 terminal management ──────────────────────────────────────────────────
def init_mt5() -> bool:
    if not MT5_AVAILABLE:
        log.error("MetaTrader5 Python library not installed — run: pip install MetaTrader5")
        return False
    kwargs = {}
    if MT5_TERMINAL_PATH:
        kwargs["path"] = MT5_TERMINAL_PATH
    if not mt5.initialize(**kwargs):
        log.error("MT5 initialize() failed: %s", mt5.last_error())
        return False
    return True


def shutdown_mt5():
    if MT5_AVAILABLE:
        mt5.shutdown()


# ── Per-account sync ─────────────────────────────────────────────────────────
def sync_account(supabase: Client, acct: dict) -> tuple[int, Optional[str]]:
    """
    Sync one account.  Returns (trades_synced, error_message).
    error_message is None on success.
    """
    sig      = acct["account_signature"]
    login    = int(acct["account_login"])
    server   = acct["account_server"]
    user_id  = acct["user_id"]
    platform = acct.get("platform", "MT5")
    enc_pwd  = acct.get("investor_password_encrypted")

    if platform == "MT4":
        return 0, "MT4 not supported by MetaTrader5 Python library — use EA sync for MT4 accounts"

    if not enc_pwd:
        return 0, "No investor password stored for this account"

    try:
        password = decrypt_password(enc_pwd)
    except Exception as e:
        return 0, f"Password decryption failed: {e}"

    # Log in with investor (read-only) credentials
    ok = mt5.login(login, password=password, server=server)
    if not ok:
        err = mt5.last_error()
        if err[0] in (-2, 65537):            # IPC timeout / no connection
            return 0, "Server not reachable — broker server may be down"
        if err[0] in (10013, 10014):         # invalid credentials
            return 0, "Invalid credentials — check login and investor password"
        return 0, f"Login failed: {err}"

    try:
        # Fetch deals since last_synced_at (or last 90 days if first sync)
        last_sync_raw = acct.get("last_synced_at")
        if last_sync_raw:
            since = datetime.fromisoformat(last_sync_raw.replace("Z", "+00:00"))
        else:
            since = datetime(datetime.now(timezone.utc).year, 1, 1, tzinfo=timezone.utc)

        from_ts = int(since.timestamp())
        to_ts   = int(time.time()) + 60

        history = mt5.history_deals_get(from_ts, to_ts)
        if history is None:
            history = []

        if len(history) == 0 and acct.get("last_synced_at") is None:
            return 0, "No trade history found on this account"

        synced = 0
        for deal in history:
            row = normalise_deal(deal)
            if row is None:
                continue

            # Skip if already in DB (dedup by mt5_deal_id)
            dup = supabase.table("trades").select("id") \
                .eq("user_id", user_id) \
                .eq("mt5_deal_id", row["mt5_deal_id"]) \
                .maybe_single().execute()
            if dup.data:
                continue

            row["user_id"]           = user_id
            row["account_signature"] = sig
            row["account_label"]     = acct.get("account_label")

            ins = supabase.table("trades").insert(row).execute()
            if ins.data:
                synced += 1

        # Update last_synced_at + status on trading_accounts
        supabase.table("trading_accounts").update({
            "last_synced_at": datetime.now(timezone.utc).isoformat(),
            "sync_status":    "connected",
            "sync_error":     None,
        }).eq("user_id", user_id).eq("account_signature", sig).execute()

        return synced, None

    except Exception as e:
        return 0, str(e)
    finally:
        mt5.logout()


def record_log(supabase: Client, user_id: str, sig: str, status: str,
               trades_synced: int, error: Optional[str]):
    try:
        supabase.table("sync_logs").insert({
            "user_id":           user_id,
            "account_signature": sig,
            "sync_method":       "investor",
            "status":            status,
            "trades_synced":     trades_synced,
            "error_message":     error,
        }).execute()
    except Exception as e:
        log.warning("sync_logs insert failed: %s", e)


def set_account_error(supabase: Client, user_id: str, sig: str, error: str):
    try:
        supabase.table("trading_accounts").update({
            "sync_status": "failed",
            "sync_error":  error,
        }).eq("user_id", user_id).eq("account_signature", sig).execute()
    except Exception as e:
        log.warning("Could not update account error state: %s", e)


# ── Main sync loop ───────────────────────────────────────────────────────────
def run_sync_cycle(supabase: Client):
    """Fetch all investor accounts and sync each one."""
    result = supabase.table("trading_accounts") \
        .select("*") \
        .eq("sync_method", "investor") \
        .neq("sync_status", "disconnected") \
        .limit(MAX_ACCOUNTS) \
        .execute()

    accounts = result.data or []
    if not accounts:
        log.info("No Quick Connect accounts found — nothing to sync")
        return

    log.info("Syncing %d Quick Connect account(s)", len(accounts))

    if not init_mt5():
        for acct in accounts:
            msg = "MT5 terminal not found — install MetaTrader 5 on this server"
            log.error(msg)
            set_account_error(supabase, acct["user_id"], acct["account_signature"], msg)
            record_log(supabase, acct["user_id"], acct["account_signature"], "failed", 0, msg)
        return

    try:
        for acct in accounts:
            sig = acct["account_signature"]
            log.info("Syncing %s (login %s @ %s)", sig, acct.get("account_login"), acct.get("account_server"))

            # Mark as syncing
            supabase.table("trading_accounts").update({
                "sync_status": "syncing",
            }).eq("user_id", acct["user_id"]).eq("account_signature", sig).execute()

            trades_synced, error = sync_account(supabase, acct)

            if error:
                log.warning("  %s — error: %s", sig, error)
                set_account_error(supabase, acct["user_id"], sig, error)
                record_log(supabase, acct["user_id"], sig, "failed", 0, error)
            else:
                log.info("  %s — synced %d new trade(s)", sig, trades_synced)
                record_log(supabase, acct["user_id"], sig, "success", trades_synced, None)

            time.sleep(ACCOUNT_DELAY_SEC)
    finally:
        shutdown_mt5()


def main():
    log.info("CandlesJournal MT5 Quick Connect Sync Service starting")
    log.info("Sync interval: %ds | Max accounts: %d", SYNC_INTERVAL_SEC, MAX_ACCOUNTS)

    if not MT5_AVAILABLE:
        log.error("MetaTrader5 library missing.  Run: pip install MetaTrader5")
        log.error("This service must run on a Windows VPS with MT5 terminal installed.")
        return

    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        log.error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
        return

    if not ENCRYPTION_KEY:
        log.error("ENCRYPTION_KEY must match the value in your Next.js .env.local")
        return

    supabase = get_supabase()

    while True:
        try:
            run_sync_cycle(supabase)
        except Exception as e:
            log.exception("Unexpected error in sync cycle: %s", e)
        log.info("Sleeping %ds until next cycle…", SYNC_INTERVAL_SEC)
        time.sleep(SYNC_INTERVAL_SEC)


if __name__ == "__main__":
    main()
