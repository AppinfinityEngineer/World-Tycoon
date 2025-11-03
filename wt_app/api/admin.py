from fastapi import APIRouter, Header, HTTPException, status
from sqlalchemy import select, delete
from wt_app.core.config import settings
from wt_app.db.base import async_session
from wt_app.db.models import Waitlist, User
from wt_app.core.security import create_access_token, hash_password

router = APIRouter(prefix="/admin", tags=["admin"])

def require_admin(key: str | None) -> None:
    if not key or key != settings.admin_api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin key")

@router.post("/waitlist/promote")
async def promote_next(x_admin_key: str | None = Header(None)):
    require_admin(x_admin_key)

    async with async_session() as s:
        # 1) find smallest position in waitlist
        next_email = (await s.execute(
            select(Waitlist.email).order_by(Waitlist.position.asc()).limit(1)
        )).scalar_one_or_none()

        if not next_email:
            raise HTTPException(status_code=404, detail="No one on waitlist")

        temp_password = "Temp#" + str(abs(hash(next_email)) % 10_000_000)
        user = User(email=next_email, password_hash=hash_password(temp_password))
        s.add(user)

        await s.execute(delete(Waitlist).where(Waitlist.email == next_email))
        await s.commit()

        token = create_access_token(str(user.id))
        return {"email": next_email, "temp_password": temp_password, "access_token": token}
