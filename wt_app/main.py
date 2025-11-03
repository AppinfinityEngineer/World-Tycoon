from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from wt_app.core.config import settings
from wt_app.db.base import async_session, init_db
from wt_app.api.auth import router as auth_router
from wt_app.api.admin import router as admin_router
from wt_app.api.stats import router as stats_router
from wt_app.api.pins import router as pins_router
from wt_app.api.events import router as events_router
from wt_app.api.types import router as types_router

app = FastAPI(title="World Tycoon")

app.include_router(admin_router)
app.include_router(stats_router)
app.include_router(pins_router)
app.include_router(events_router)
app.include_router(types_router)
app.include_router(auth_router)

@app.on_event("startup")
async def _startup():
    await init_db()

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
