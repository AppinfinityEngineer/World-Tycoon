from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from wt_app.db.base import async_session
from wt_app.db.models import User, Waitlist
from wt_app.api.deps import get_current_user

router = APIRouter(prefix="/stats", tags=["stats"])

@router.get("/overview")
async def overview(_: str = Depends(get_current_user)):
    async with async_session() as s:
        users = (await s.execute(select(func.count()).select_from(User))).scalar_one()
        waitlist = (await s.execute(select(func.count()).select_from(Waitlist))).scalar_one()
    return {"users": users, "waitlist": waitlist}
