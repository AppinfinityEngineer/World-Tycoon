from fastapi import FastAPI
from wt_app.db.base import init_db
from wt_app.api.auth import router as auth_router

app = FastAPI(title="World Tycoon")

@app.on_event("startup")
async def _startup():
    await init_db()

@app.get("/health")
async def health():
    return {"ok": True}

@app.get("/")
async def home():
    return {"message": "World Tycoon API is alive"}

app.include_router(auth_router)
