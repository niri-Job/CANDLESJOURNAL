import asyncio
import logging
import os
from contextlib import asynccontextmanager

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

SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
SYNC_INTERVAL = int(os.getenv("SYNC_INTERVAL", "60"))

manager: MT5Manager | None = None
security = HTTPBearer()


def verify_token(creds: HTTPAuthorizationCredentials = Security(security)) -> str:
    try:
        payload = jwt.decode(
            creds.credentials,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: no sub")
        return user_id
    except JWTError as e:
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
                None, manager._sync_account, user_id, login, password, server
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
