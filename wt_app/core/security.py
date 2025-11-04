from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Optional, Iterable, Set

from fastapi import Depends, HTTPException, Request, status
from jose import jwt, JWTError
from passlib.context import CryptContext

from wt_app.core.config import settings  # expects: secret_key, access_token_minutes, admin_emails

# NEW: db lookup for email when token lacks it
from sqlalchemy import select
from wt_app.db.base import async_session
from wt_app.db.models import User

pwd = CryptContext(schemes=["argon2"], deprecated="auto")
ALGO = "HS256"

def hash_password(p: str) -> str:
    return pwd.hash(p)

def verify_password(p: str, h: str) -> bool:
    return pwd.verify(p, h)

def create_access_token(sub: str, **claims) -> str:
    exp = datetime.now(tz=timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    payload = {"sub": sub, "exp": exp, **claims}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGO)

class CurrentUser:
    def __init__(self, sub: str, email: Optional[str], is_admin: bool):
        self.sub = sub
        self.email = (email or "").lower()
        self.is_admin = bool(is_admin)

def _to_set(v: Optional[Iterable[str] | str]) -> Set[str]:
    if v is None:
        return set()
    if isinstance(v, str):
        parts = [x.strip().lower() for x in v.split(",")]
        return {x for x in parts if x}
    return {str(x).strip().lower() for x in v if str(x).strip()}

async def _lookup_email_by_sub(sub: str) -> Optional[str]:
    # try numeric ID, then string match
    sub_int = None
    try:
        sub_int = int(sub)
    except Exception:
        pass
    async with async_session() as s:
        if sub_int is not None:
            row = await s.execute(select(User.email).where(User.id == sub_int))
            email = row.scalar_one_or_none()
            if email:
                return str(email)
        row = await s.execute(select(User.email).where(User.id == sub))  # string id edge-case
        return row.scalar_one_or_none()

async def get_current_user(request: Request) -> CurrentUser:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    token = auth.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGO])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    sub = str(payload.get("sub") or "")
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    email = payload.get("email") or payload.get("user") or payload.get("username")
    if not email:
        email = await _lookup_email_by_sub(sub)

    claim_admin = bool(payload.get("is_admin") or payload.get("admin") or False)
    allow = _to_set(getattr(settings, "admin_emails", None))
    allow_admin = ((email or "").lower() in allow) or (sub.lower() in allow)

    return CurrentUser(sub=sub, email=email, is_admin=(claim_admin or allow_admin))

async def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user
