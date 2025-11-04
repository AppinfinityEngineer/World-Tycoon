# wt_app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager, suppress
import asyncio

from wt_app.core.config import settings
from wt_app.db.base import init_db, async_session
from wt_app.api.auth import router as auth_router
from wt_app.api.admin import router as admin_router
from wt_app.api.stats import router as stats_router
from wt_app.api.pins import router as pins_router
from wt_app.api.events import router as events_router
from wt_app.api.types import router as types_router
from wt_app.api.economy import router as economy_router
from wt_app.core.autotick import start_auto_tick
from wt_app.api.settings import router as settings_router
from wt_app.api.offers import router as offers_router
from wt_app.api import admin_settings

# --- Lifespan handler replaces on_event("startup"/"shutdown") ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()

    # start background auto-tick loop
    task = asyncio.create_task(start_auto_tick(app))
    app.state.auto_tick_task = task

    try:
        yield
    finally:
        # stop loop gracefully on shutdown / reload
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task

app = FastAPI(title="World Tycoon", lifespan=lifespan)

# Routers
app.include_router(admin_router)
app.include_router(stats_router)
app.include_router(pins_router)
app.include_router(events_router)
app.include_router(types_router)
app.include_router(economy_router)
app.include_router(auth_router)  # auth last or anywhere—your choice
app.include_router(settings_router)
app.include_router(offers_router)
app.include_router(admin_settings.router)

# CORS (unchanged)
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

# ---- optional debug helpers, keep if you had them ----
from sqlalchemy import select, func
from wt_app.db.models import User

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
