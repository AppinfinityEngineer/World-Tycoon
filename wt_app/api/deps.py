from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from sqlalchemy import select

from wt_app.core.config import settings
from wt_app.db.base import async_session
from wt_app.db.models import User

import time
from collections import deque, defaultdict
from fastapi import HTTPException, Request, status

bearer = HTTPBearer(auto_error=False)

async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> User:
    if not creds:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing credentials")
    token = creds.credentials
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        sub = payload.get("sub")
        if not sub:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    async with async_session() as s:
        user = (await s.execute(select(User).where(User.id == int(sub)))).scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        return user
    
_buckets: dict[tuple[str, str], deque[float]] = defaultdict(deque)

def rate_limit(max_hits: int, window_sec: int):
    async def _guard(request: Request):
        key = (request.url.path, request.client.host if request.client else "unknown")
        now = time.time()
        q = _buckets[key]
        while q and now - q[0] > window_sec:
            q.popleft()
        if len(q) >= max_hits:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many requests")
        q.append(now)
    return _guard
