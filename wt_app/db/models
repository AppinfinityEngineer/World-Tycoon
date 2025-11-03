from datetime import datetime
from sqlalchemy import String, Integer, Float, Boolean, DateTime, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from wt_app.db.base import Base

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    credits: Mapped[float] = mapped_column(Float, default=5000.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

class Waitlist(Base):
    __tablename__ = "waitlist"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    position: Mapped[int] = mapped_column(Integer, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    __table_args__ = (UniqueConstraint("email", name="uq_waitlist_email"),)
