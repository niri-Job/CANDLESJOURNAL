import asyncio
import base64 as _b64
import logging
import os
from contextlib import asynccontextmanager

import httpx
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.middleware.cors import CORSMiddleware
from jose import jwt, JWTError
from pydantic import BaseModel

from mt5_manager import MT5Manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
SYNC_INTERVAL = int(os.getenv("SYNC_INTERVAL", "60"))

manager: MT5Manager | None = None
security = HTTPBearer()
_jwks_cache: dict | None = None


def _decode_jwt_header(token: str) -> str:
    try:
        raw = token.split(".")[0]
        padded = raw + "=" * (-len(raw) % 4)
        return _b64.urlsafe_b64decode(padded).decode("utf-8", errors="replace")
    except Exception:
        return "?"


def _fetch_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache is not None:
        return _jwks_cache
    try:
        resp = httpx.get(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json", timeout=10)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        logger.info("Fetched Supabase JWKS: %d key(s)", len(_jwks_cache.get("keys", [])))
    except Exception as e:
        logger.warning("Failed to fetch JWKS: %s", e)
        _jwks_cache = {"keys": []}
    return _jwks_cache


def _get_jwk_for_kid(kid: str | None):
    keys = _fetch_jwks().get("keys", [])
    if kid:
        for k in keys:
            if k.get("kid") == kid:
                return k
    return keys[0] if keys else None


def verify_token(creds: HTTPAuthorizationCredentials = Security(security)) -> str:
    token = creds.credentials
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token header: {e}")

    alg = header.get("alg", "HS256")

    try:
        if alg == "HS256":
            payload = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
        else:
            jwk_key = _get_jwk_for_kid(header.get("kid"))
            if jwk_key is None:
                raise HTTPException(status_code=401, detail="No JWKS key available for token verification")
            payload = jwt.decode(
                token,
                jwk_key,
                algorithms=[alg],
                options={"verify_aud": False},
            )

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: no sub")
        return user_id
    except JWTError as e:
        logger.warning("JWT verify failed: %s | header: %s", e, _decode_jwt_header(token))
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


async def sync_loop():
    while True:
        await asyncio.sleep(SYNC_INTERVAL)
        if manager:
            try:
                logger.info("Starting sync cycle...")
                await manager.sync_all()
                logger.info("Sync cycle complete")
            except Exception:
                logger.exception("Sync loop error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global manager
    manager = MT5Manager()
    task = asyncio.create_task(sync_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="NIRI Sync API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://niri.live", "https://www.niri.live"],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


class ConnectRequest(BaseModel):
    login: str
    password: str
    server: str


class DisconnectRequest(BaseModel):
    login: str


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/mt5/connect")
async def connect(body: ConnectRequest, user_id: str = Security(verify_token)):
    if not manager:
        raise HTTPException(status_code=503, detail="Service not ready")

    result = await manager.test_connection(body.login, body.password, body.server)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result.get("error", "Connection failed"))

    conn = await manager.add_connection(user_id, body.login, body.password, body.server)

    asyncio.create_task(_sync_one(user_id, body.login, body.password, body.server))

    return {
        "success": True,
        "login": conn["login"],
        "server": conn["server"],
        "account_name": result.get("account_name"),
        "account_currency": result.get("account_currency"),
        "account_balance": result.get("account_balance"),
    }


async def _sync_one(user_id: str, login: str, password: str, server: str):
    if manager:
        import asyncio as _a
        loop = _a.get_event_loop()
        try:
            await loop.run_in_executor(
                None, manager._sync_one_account, user_id, login, password, server
            )
        except Exception:
            logger.exception("Initial sync failed for %s", login)


@app.delete("/mt5/disconnect")
async def disconnect(body: DisconnectRequest, user_id: str = Security(verify_token)):
    if not manager:
        raise HTTPException(status_code=503, detail="Service not ready")
    await manager.remove_connection(user_id, body.login)
    return {"success": True}


@app.get("/mt5/connections")
async def list_connections(user_id: str = Security(verify_token)):
    if not manager:
        raise HTTPException(status_code=503, detail="Service not ready")
    conns = await manager.get_connections_for_user(user_id)
    return {"connections": conns}
