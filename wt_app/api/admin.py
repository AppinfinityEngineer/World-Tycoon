from fastapi import APIRouter, HTTPException, Header, status
from sqlalchemy import select, delete
from wt_app.db.base import async_session
from wt_app.db.models import Waitlist, User
from wt_app.core.security import hash_password, create_access_token
from wt_app.core.config import settings

router = APIRouter(prefix="/admin", tags=["admin"])

@router.post("/promote")
async def promote_next(x_admin_key: str = Header(...)):
    if x_admin_key != settings.admin_api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin key")

    async with async_session() as s:
        # Find the first user in waitlist
        next_email = (
            await s.execute(select(Waitlist.email).order_by(Waitlist.position.asc()).limit(1))
        ).scalar_one_or_none()

        if not next_email:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No one on waitlist")

        # Create a temporary password
        temp_password = "Temp_" + str(abs(hash(next_email)) % 1_000_000)

        # Create a real user
        user = User(email=next_email, password_hash=hash_password(temp_password))
        s.add(user)

        # Remove from waitlist
        await s.execute(delete(Waitlist).where(Waitlist.email == next_email))
        await s.commit()

        # Create token
        token = create_access_token(str(user.id))
        return {
            "email": next_email,
            "temp_password": temp_password,
            "access_token": token
        }
