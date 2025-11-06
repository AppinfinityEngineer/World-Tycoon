# wt_app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager, suppress
import asyncio

from wt_app.core.config import settings
from wt_app.db.base import init_db, async_session

# ⬇️ module imports instead of "from ... import router as ..."
import wt_app.api.auth as auth_api
import wt_app.api.admin as admin_api
import wt_app.api.stats as stats_api
import wt_app.api.pins as pins_api
import wt_app.api.events as events_api
import wt_app.api.types as types_api
import wt_app.api.economy as economy_api
import wt_app.api.settings as settings_api
import wt_app.api.offers as offers_api
import wt_app.api.admin_settings as admin_settings_api
from wt_app.api import shop
from wt_app.api.economy_health import router as economy_health_router
from wt_app.api.pins_market import router as pins_market_router

from wt_app.core.autotick import start_auto_tick

from sqlalchemy import select, func
from wt_app.db.models import User


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    task = asyncio.create_task(start_auto_tick(app))
    app.state.auto_tick_task = task
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(title="World Tycoon", lifespan=lifespan)

# Routers (reference .router on the modules)
app.include_router(admin_api.router)
app.include_router(stats_api.router)
app.include_router(pins_api.router)
app.include_router(events_api.router)
app.include_router(types_api.router)
app.include_router(economy_api.router)
app.include_router(auth_api.router)
app.include_router(settings_api.router)
app.include_router(offers_api.router)
app.include_router(admin_settings_api.router)
app.include_router(shop.router)
app.include_router(economy_health_router) 
app.include_router(pins_market_router)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Debug helpers
@app.get("/_debug/settings")
async def _dbg_settings():
    return {
        "signups_open": settings.signups_open,
        "max_active_users": settings.max_active_users,
        "sqlite_url": settings.sqlite_url,
    }

@app.get("/_debug/users")
async def _dbg_users():
    async with async_session() as s:
        count = (await s.execute(select(func.count()).select_from(User))).scalar_one()
        rows = (await s.execute(select(User.id, User.email))).all()
        return {"user_count": count, "users": [dict(r._mapping) for r in rows]}
