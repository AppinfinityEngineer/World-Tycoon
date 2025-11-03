from datetime import datetime, timedelta, timezone
from passlib.context import CryptContext
from jose import jwt
from wt_app.core.config import settings

# Use Argon2
pwd = CryptContext(schemes=["argon2"], deprecated="auto")
ALGO = "HS256"

def hash_password(p: str) -> str:
    return pwd.hash(p)

def verify_password(p: str, h: str) -> bool:
    return pwd.verify(p, h)

def create_access_token(sub: str) -> str:
    exp = datetime.now(tz=timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    return jwt.encode({"sub": sub, "exp": exp}, settings.secret_key, algorithm=ALGO)
