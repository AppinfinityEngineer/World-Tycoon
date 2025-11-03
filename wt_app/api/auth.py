from fastapi import APIRouter, HTTPException, status, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import EmailStr
from sqlalchemy import select, func

from wt_app.db.base import async_session
from wt_app.db.models import User, Waitlist
from wt_app.core.security import hash_password, verify_password, create_access_token
from wt_app.core.config import settings
from wt_app.schemas.auth import SignupIn, LoginIn, TokenOut, WaitlistOut
from wt_app.schemas.user import UserOut
from wt_app.api.deps import get_current_user, rate_limit

router = APIRouter(prefix="/auth", tags=["auth"])

@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return UserOut(id=user.id, email=user.email)

@router.post(
    "/signup",
    responses={201: {"model": TokenOut}, 202: {"model": WaitlistOut}},
)
async def signup(payload: SignupIn, _: None = Depends(rate_limit(3, 60))):
    async with async_session() as s:
        existing_user = (
            await s.execute(select(User).where(User.email == payload.email))
        ).scalar_one_or_none()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered",
            )

        active_count = (
            await s.execute(select(func.count()).select_from(User))
        ).scalar_one()

        if (not settings.signups_open) or (active_count >= settings.max_active_users):
            wl_existing = (
                await s.execute(select(Waitlist).where(Waitlist.email == payload.email))
            ).scalar_one_or_none()
            if wl_existing:
                return JSONResponse(
                    status_code=status.HTTP_202_ACCEPTED,
                    content=WaitlistOut(position=wl_existing.position).model_dump(),
                )

            last_pos = (await s.execute(select(func.max(Waitlist.position)))).scalar_one() or 0
            wl = Waitlist(email=payload.email, position=last_pos + 1)
            s.add(wl)
            await s.commit()
            return JSONResponse(
                status_code=status.HTTP_202_ACCEPTED,
                content=WaitlistOut(position=wl.position).model_dump(),
            )

        user = User(email=payload.email, password_hash=hash_password(payload.password))
        s.add(user)
        await s.commit()

        token = create_access_token(str(user.id))
        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=TokenOut(access_token=token).model_dump(),
        )

@router.post("/login", response_model=TokenOut)
async def login(payload: LoginIn, _: None = Depends(rate_limit(5, 60))):
    async with async_session() as s:
        user = (
            await s.execute(select(User).where(User.email == payload.email))
        ).scalar_one_or_none()
        if not user or not verify_password(payload.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )
        token = create_access_token(str(user.id))
        return TokenOut(access_token=token)

@router.get("/waitlist/status")
async def waitlist_status(email: EmailStr = Query(...)):
    async with async_session() as s:
        row = (
            await s.execute(select(Waitlist.position).where(Waitlist.email == str(email)))
        ).scalar_one_or_none()
        if row is None:
            return {"in_waitlist": False}
        total = (await s.execute(select(func.count()).select_from(Waitlist))).scalar_one()
        return {"in_waitlist": True, "position": row, "total": total}
