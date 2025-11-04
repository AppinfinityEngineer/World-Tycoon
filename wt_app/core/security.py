from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Optional, Iterable, Set

from fastapi import Depends, HTTPException, Request, status
from jose import jwt, JWTError
from passlib.context import CryptContext

from wt_app.core.config import settings  # expects: secret_key, access_token_minutes, admin_emails

# ---- password hashing (unchanged) ----
pwd = CryptContext(schemes=["argon2"], deprecated="auto")
ALGO = "HS256"

def hash_password(p: str) -> str:
    return pwd.hash(p)

def verify_password(p: str, h: str) -> bool:
    return pwd.verify(p, h)

# ---- token creation (BC + optional extra claims) ----
def create_access_token(sub: str, **claims) -> str:
    """
    Backward compatible:
      create_access_token("user-id")
    Extended:
      create_access_token("user-id", email="you@domain.com", is_admin=True)
    """
    exp = datetime.now(tz=timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    payload = {"sub": sub, "exp": exp, **claims}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGO)

# ---- request auth & admin guard ----
class CurrentUser:
    def __init__(self, sub: str, email: Optional[str], is_admin: bool):
        self.sub = sub
        self.email = (email or "").lower()
        self.is_admin = bool(is_admin)

def _to_set(v: Optional[Iterable[str] | str]) -> Set[str]:
    # supports list OR comma-separated string in settings.admin_emails
    if v is None:
        return set()
    if isinstance(v, str):
        parts = [x.strip().lower() for x in v.split(",")]
        return {x for x in parts if x}
    return {str(x).strip().lower() for x in v if str(x).strip()}

def get_current_user(request: Request) -> CurrentUser:
    # Expect Authorization: Bearer <jwt>
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

    # Common claim names we might receive
    email = payload.get("email") or payload.get("user") or payload.get("username")
    claim_admin = bool(payload.get("is_admin") or payload.get("admin") or False)

    allow = _to_set(getattr(settings, "admin_emails", None))
    allow_admin = ((email or "").lower() in allow) or (sub.lower() in allow)

    return CurrentUser(sub=sub, email=email, is_admin=(claim_admin or allow_admin))

def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return user
