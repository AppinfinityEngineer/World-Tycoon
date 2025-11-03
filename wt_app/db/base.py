# wt_app/db/base.py
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    create_async_engine,
    async_sessionmaker,   # <-- use this
)
from sqlalchemy.orm import DeclarativeBase
from wt_app.config import settings

engine = create_async_engine(settings.sqlite_url, future=True, echo=False)

# Async session factory (clean typing, no warnings)
async_session = async_sessionmaker(engine, expire_on_commit=False)
# (optional) you can also pass class_=AsyncSession if you like:
# async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
