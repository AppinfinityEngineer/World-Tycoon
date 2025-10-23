from fastapi import FastAPI

app = FastAPI(title="World Tycoon")

@app.get("/health")
async def health():
    return {"ok": True}

@app.get("/")
async def home():
    return {"message": "World Tycoon API is alive"}
