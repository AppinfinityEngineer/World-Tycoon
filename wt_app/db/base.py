from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from wt_app.core.config import settings

engine = create_async_engine(settings.sqlite_url, future=True, echo=False)
async_session = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def init_db():
    async with engine.begin() as conn:
        # 👇 ensure models are registered with Base.metadata
        from wt_app.db import models  # noqa: F401
        await conn.run_sync(Base.metadata.create_all)
