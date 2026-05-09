"""
CandlesJournal — MetaAPI Sync Service
=====================================
Linux-compatible replacement for the Windows-only MetaTrader5 daemon.
Uses MetaAPI REST API — no MetaTrader5 Python library required.
Runs on any Linux VPS (Ubuntu 20.04+).

Requirements:
    pip install requests supabase cryptography python-dotenv

Environment (.env file):
    SUPABASE_URL             https://xxxx.supabase.co
    SUPABASE_SERVICE_KEY     service_role key (bypasses RLS)
    ENCRYPTION_KEY           same 32-char key used in Next.js ENCRYPTION_KEY
    METAAPI_TOKEN            auth token from https://app.metaapi.cloud/token
    METAAPI_PROVISIONING_URL (optional) provisioning API base — see README
    METAAPI_CLIENT_URL       (optional) history/client API base — see README
"""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone, timedelta
from typing import Optional

import requests
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# ── Config ──────────────────────────────────────────────────────────────────
SUPABASE_URL         = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
ENCRYPTION_KEY       = os.getenv("ENCRYPTION_KEY", "")
METAAPI_TOKEN        = os.getenv("METAAPI_TOKEN", "")
METAAPI_PROV_URL     = os.getenv(
    "METAAPI_PROVISIONING_URL",
    "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai",
)
METAAPI_CLIENT_URL   = os.getenv(
    "METAAPI_CLIENT_URL",
    "https://mt-client-api-v1.agiliumtrade.agiliumtrade.ai",
)

SYNC_INTERVAL_SEC    = 300   # 5 minutes between cycles
ACCOUNT_DELAY_SEC    = 3     # pause between accounts to avoid rate limits
MAX_ACCOUNTS         = 100
SERVICE_VERSION      = "2.0.0"
# Safety overlap: re-fetch this many hours before last_synced_at.
# Catches deals that appeared in broker history after the previous cycle.
# mt5_deal_id deduplication makes re-fetching safe.
SYNC_SAFETY_HOURS    = 2
HISTORY_LIMIT        = 1000  # MetaAPI max deals per REST request

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("metaapi_sync")


# ── Encryption ───────────────────────────────────────────────────────────────

def _aes_key() -> bytes:
    return ENCRYPTION_KEY.encode("utf-8").ljust(32, b"\x00")[:32]


def decrypt_password(encrypted: str) -> str:
    """Reverse of Next.js encryptPassword() in connect/route.ts (AES-256-CBC)."""
    iv_hex, enc_hex = encrypted.split(":", 1)
    iv  = bytes.fromhex(iv_hex)
    enc = bytes.fromhex(enc_hex)
    cipher = Cipher(algorithms.AES(_aes_key()), modes.CBC(iv), backend=default_backend())
    dec = cipher.decryptor()
    padded = dec.update(enc) + dec.finalize()
    pad_len = padded[-1]
    return padded[:-pad_len].decode("utf-8")


# ── Supabase ─────────────────────────────────────────────────────────────────

def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


# ── Deal normalisation ───────────────────────────────────────────────────────

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


def _parse_time(t) -> Optional[datetime]:
    """Parse MetaAPI deal time — may be ISO string or Unix timestamp."""
    if t is None:
        return None
    if isinstance(t, (int, float)):
        return datetime.fromtimestamp(t, tz=timezone.utc)
    return datetime.fromisoformat(str(t).replace("Z", "+00:00"))


def normalise_deal(deal: dict) -> Optional[dict]:
    """Convert a MetaAPI deal object to a trades table row. Returns None to skip."""
    dtype  = deal.get("type", "")
    dentry = deal.get("entryType", "")

    # Only buy/sell deals
    if dtype not in ("DEAL_TYPE_BUY", "DEAL_TYPE_SELL"):
        return None
    # Only closing entries — DEAL_ENTRY_IN opens positions, not what we want
    if dentry not in ("DEAL_ENTRY_OUT", "DEAL_ENTRY_INOUT", "DEAL_ENTRY_OUT_BY"):
        return None

    ts = _parse_time(deal.get("time"))
    if ts is None:
        return None

    deal_id = str(deal.get("id") or "")
    if not deal_id:
        return None

    symbol = (deal.get("symbol") or "").upper()
    return {
        "pair":        symbol,
        "direction":   "BUY" if dtype == "DEAL_TYPE_BUY" else "SELL",
        "lot":         float(deal.get("volume") or 0),
        "date":        ts.strftime("%Y-%m-%d"),
        "entry":       float(deal.get("price") or 0),
        "exit_price":  float(deal.get("price") or 0),
        "sl":          None,
        "tp":          None,
        "pnl":         float(deal.get("profit") or 0),
        "notes":       "Auto-synced via Quick Connect",
        "asset_class": _asset_class(symbol),
        "session":     "London",
        "setup":       "",
        "mt5_deal_id": deal_id,
    }


# ── MetaAPI REST Client ──────────────────────────────────────────────────────

class MetaApiClient:
    """Thin REST wrapper for MetaAPI provisioning and history APIs."""

    def __init__(self):
        self._prov = METAAPI_PROV_URL.rstrip("/")
        self._cli  = METAAPI_CLIENT_URL.rstrip("/")
        self._s    = requests.Session()
        self._s.headers.update({
            "auth-token":   METAAPI_TOKEN,
            "Content-Type": "application/json",
        })

    def _get(self, url: str, params: Optional[dict] = None) -> object:
        r = self._s.get(url, params=params, timeout=30)
        r.raise_for_status()
        return r.json()

    def _post(self, url: str, payload: Optional[dict] = None) -> dict:
        r = self._s.post(url, json=payload or {}, timeout=30)
        r.raise_for_status()
        return r.json() if r.content else {}

    def _delete(self, url: str):
        r = self._s.delete(url, timeout=30)
        if r.status_code not in (200, 204, 404):
            r.raise_for_status()

    def provision_account(self, login: str, password: str, server: str,
                           platform: str, name: str) -> str:
        """Create a MetaAPI cloud account. Returns the new account ID."""
        data = self._post(f"{self._prov}/users/current/accounts", {
            "login":       login,
            "password":    password,
            "server":      server,
            "platform":    platform.lower(),  # "mt5" or "mt4"
            "name":        name,
            "type":        "cloud-g2",
            "application": "MetaApi",
            "magic":       0,
        })
        return data["id"]

    def deploy(self, account_id: str):
        """Request MetaAPI to connect the account to the broker."""
        try:
            self._post(f"{self._prov}/users/current/accounts/{account_id}/deploy")
        except requests.HTTPError as e:
            if e.response is not None and e.response.status_code == 204:
                pass  # 204 = already deployed, not an error
            else:
                raise

    def undeploy(self, account_id: str):
        try:
            self._post(f"{self._prov}/users/current/accounts/{account_id}/undeploy")
        except Exception:
            pass  # non-fatal

    def get_account(self, account_id: str) -> dict:
        return self._get(f"{self._prov}/users/current/accounts/{account_id}")

    def delete_account(self, account_id: str):
        self.undeploy(account_id)
        time.sleep(3)
        self._delete(f"{self._prov}/users/current/accounts/{account_id}")

    def get_deals(self, account_id: str, start: datetime, end: datetime) -> list:
        """Fetch all closed deals in a time window (paginates automatically)."""
        start_iso = start.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        end_iso   = end.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        url       = (f"{self._cli}/users/current/accounts/{account_id}"
                     f"/history-deals/time/{start_iso}/{end_iso}")
        all_deals: list = []
        offset = 0
        while True:
            batch = self._get(url, params={"limit": HISTORY_LIMIT, "offset": offset})
            # API may return a list directly or {"deals": [...]}
            items = batch if isinstance(batch, list) else batch.get("deals", [])
            all_deals.extend(items)
            if len(items) < HISTORY_LIMIT:
                break
            offset += HISTORY_LIMIT
        return all_deals


# ── Supabase helpers ──────────────────────────────────────────────────────────

def write_heartbeat(supabase: Client, account_count: int):
    try:
        supabase.table("sync_service_health").upsert({
            "service_name":       "mt5_sync",
            "last_heartbeat":     datetime.now(timezone.utc).isoformat(),
            "version":            SERVICE_VERSION,
            "last_account_count": account_count,
        }, on_conflict="service_name").execute()
    except Exception as e:
        log.warning("Heartbeat write failed: %s", e)


def set_account_error(supabase: Client, user_id: str, sig: str, error: str):
    try:
        supabase.table("trading_accounts").update({
            "sync_status": "failed",
            "sync_error":  error,
        }).eq("user_id", user_id).eq("account_signature", sig).execute()
    except Exception as e:
        log.warning("Could not update account error state: %s", e)


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


# ── Per-account logic ─────────────────────────────────────────────────────────

def provision_account(supabase: Client, metaapi: MetaApiClient, acct: dict
                      ) -> tuple[Optional[str], Optional[str]]:
    """
    Provision a new MetaAPI account for an investor-connected trading account.
    Returns (metaapi_account_id, error_message).
    """
    sig     = acct["account_signature"]
    user_id = acct["user_id"]
    enc_pwd = acct.get("investor_password_encrypted")

    if not enc_pwd:
        return None, "No investor password stored for this account"

    try:
        password = decrypt_password(enc_pwd)
    except Exception as e:
        return None, f"Password decryption failed: {e}"

    try:
        account_id = metaapi.provision_account(
            login    = str(acct["account_login"]),
            password = password,
            server   = acct["account_server"],
            platform = acct.get("platform", "MT5"),
            name     = acct.get("account_label") or sig,
        )
    except requests.HTTPError as e:
        body = e.response.text[:300] if e.response is not None else ""
        return None, f"MetaAPI provision failed ({e.response.status_code}): {body}"
    except Exception as e:
        return None, f"MetaAPI provision failed: {e}"

    # Persist the ID so we don't provision again next cycle
    try:
        supabase.table("trading_accounts").update({
            "metaapi_account_id": account_id,
            "sync_status":        "provisioning",
            "sync_error":         None,
        }).eq("user_id", user_id).eq("account_signature", sig).execute()
    except Exception as e:
        log.warning("  %s — failed to store metaapi_account_id in DB: %s", sig, e)

    # Kick off deployment (MetaAPI connects to the broker asynchronously)
    try:
        metaapi.deploy(account_id)
        log.info("  %s — provisioned %s, deploying (takes ~30s)…", sig, account_id)
    except Exception as e:
        log.warning("  %s — deploy call failed (will retry next cycle): %s", sig, e)

    return account_id, None


def sync_account(supabase: Client, metaapi: MetaApiClient, acct: dict
                 ) -> tuple[int, Optional[str]]:
    """
    Fetch and insert new deals for an already-provisioned MetaAPI account.
    Returns (trades_synced, error_message). error_message is None on success.
    """
    sig           = acct["account_signature"]
    user_id       = acct["user_id"]
    metaapi_id    = acct["metaapi_account_id"]
    last_sync_raw = acct.get("last_synced_at")

    # Verify account state before fetching history
    try:
        info  = metaapi.get_account(metaapi_id)
        state = info.get("state", "UNKNOWN")
    except requests.HTTPError as e:
        if e.response is not None and e.response.status_code == 404:
            # Account disappeared from MetaAPI — clear ID so it gets re-provisioned
            supabase.table("trading_accounts").update({
                "metaapi_account_id": None,
                "sync_status":        "pending",
                "sync_error":         "MetaAPI account not found — will re-provision",
            }).eq("user_id", user_id).eq("account_signature", sig).execute()
            return 0, "MetaAPI account not found — re-provisioning next cycle"
        return 0, f"MetaAPI get_account failed: {e}"
    except Exception as e:
        return 0, f"MetaAPI get_account failed: {e}"

    if state in ("DEPLOYING", "CREATED", "UNDEPLOYING"):
        log.info("  %s — MetaAPI state %s, waiting for deployment…", sig, state)
        return 0, None  # not an error — will be ready next cycle

    if state == "UNDEPLOYED":
        log.info("  %s — account undeployed, requesting redeploy…", sig)
        try:
            metaapi.deploy(metaapi_id)
        except Exception as e:
            return 0, f"Redeploy failed: {e}"
        return 0, None

    if state == "ERROR":
        return 0, "MetaAPI account is in ERROR state — check https://app.metaapi.cloud"

    if state != "DEPLOYED":
        log.info("  %s — unknown MetaAPI state '%s', skipping cycle", sig, state)
        return 0, None

    # Determine fetch window
    if last_sync_raw:
        last_sync = datetime.fromisoformat(last_sync_raw.replace("Z", "+00:00"))
        since     = last_sync - timedelta(hours=SYNC_SAFETY_HOURS)
    else:
        # First sync: fetch from start of the current calendar year
        since = datetime(datetime.now(timezone.utc).year, 1, 1, tzinfo=timezone.utc)

    until = datetime.now(timezone.utc) + timedelta(minutes=1)

    log.debug("  %s — fetching deals from %s (safety -%dh)",
              sig, since.isoformat(), SYNC_SAFETY_HOURS if last_sync_raw else 0)

    try:
        deals = metaapi.get_deals(metaapi_id, since, until)
    except Exception as e:
        # CRITICAL: do NOT update last_synced_at on failure.
        # This preserves the fetch window so missed deals are retried next cycle.
        return 0, f"get_deals failed: {e}"

    log.debug("  %s — %d raw deals in window", sig, len(deals))

    synced = 0
    for deal in deals:
        row = normalise_deal(deal)
        if row is None:
            continue

        # Dedup by mt5_deal_id — safe to re-fetch the same deals
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

    # Update last_synced_at only after a successful fetch
    supabase.table("trading_accounts").update({
        "last_synced_at": datetime.now(timezone.utc).isoformat(),
        "sync_status":    "connected",
        "sync_error":     None,
    }).eq("user_id", user_id).eq("account_signature", sig).execute()

    return synced, None


# ── Main sync loop ────────────────────────────────────────────────────────────

def run_sync_cycle(supabase: Client, metaapi: MetaApiClient):
    result = supabase.table("trading_accounts") \
        .select("*") \
        .eq("sync_method", "investor") \
        .neq("sync_status", "disconnected") \
        .limit(MAX_ACCOUNTS) \
        .execute()
    accounts = result.data or []

    write_heartbeat(supabase, len(accounts))

    if not accounts:
        log.info("No Quick Connect accounts found — nothing to sync")
        return

    log.info("Processing %d Quick Connect account(s)", len(accounts))

    for acct in accounts:
        sig     = acct["account_signature"]
        user_id = acct["user_id"]
        log.info("Account %s (login %s @ %s)", sig,
                 acct.get("account_login"), acct.get("account_server"))

        metaapi_id = acct.get("metaapi_account_id")

        if not metaapi_id:
            # First time seeing this account — provision it with MetaAPI
            log.info("  %s — no MetaAPI account yet, provisioning…", sig)
            _, error = provision_account(supabase, metaapi, acct)
            if error:
                log.warning("  %s — provision error: %s", sig, error)
                set_account_error(supabase, user_id, sig, error)
                record_log(supabase, user_id, sig, "failed", 0, error)
            else:
                record_log(supabase, user_id, sig, "provisioning", 0, None)
        else:
            # Existing MetaAPI account — sync history
            supabase.table("trading_accounts").update({
                "sync_status": "syncing",
            }).eq("user_id", user_id).eq("account_signature", sig).execute()

            trades_synced, error = sync_account(supabase, metaapi, acct)

            if error:
                log.warning("  %s — error: %s", sig, error)
                set_account_error(supabase, user_id, sig, error)
                record_log(supabase, user_id, sig, "failed", 0, error)
            else:
                if trades_synced > 0:
                    log.info("  %s — synced %d new trade(s)", sig, trades_synced)
                else:
                    log.debug("  %s — no new trades", sig)
                record_log(supabase, user_id, sig, "success", trades_synced, None)

        time.sleep(ACCOUNT_DELAY_SEC)


def main():
    log.info("CandlesJournal MetaAPI Sync Service v%s starting", SERVICE_VERSION)
    log.info("Interval: %ds | Safety buffer: %dh | Max accounts: %d",
             SYNC_INTERVAL_SEC, SYNC_SAFETY_HOURS, MAX_ACCOUNTS)

    missing = [k for k, v in {
        "SUPABASE_URL":         SUPABASE_URL,
        "SUPABASE_SERVICE_KEY": SUPABASE_SERVICE_KEY,
        "ENCRYPTION_KEY":       ENCRYPTION_KEY,
        "METAAPI_TOKEN":        METAAPI_TOKEN,
    }.items() if not v]
    if missing:
        for k in missing:
            log.error("Required env var not set: %s", k)
        return

    supabase = get_supabase()
    metaapi  = MetaApiClient()

    log.info("Provisioning URL: %s", METAAPI_PROV_URL)
    log.info("History URL:      %s", METAAPI_CLIENT_URL)

    while True:
        try:
            run_sync_cycle(supabase, metaapi)
        except Exception as e:
            log.exception("Unexpected error in sync cycle: %s", e)
        log.debug("Sleeping %ds until next cycle…", SYNC_INTERVAL_SEC)
        time.sleep(SYNC_INTERVAL_SEC)


if __name__ == "__main__":
    main()
