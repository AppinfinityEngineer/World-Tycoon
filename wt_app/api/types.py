from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pathlib import Path
import json

router = APIRouter(prefix="/types", tags=["types"])
FILE = Path("data") / "building_types.json"

class TypeOut(BaseModel):
    key: str
    baseIncome: int = 0
    tags: list[str] = []

def _read_types() -> list[TypeOut]:
    if not FILE.exists():
        raise HTTPException(status_code=500, detail="Type registry missing")
    try:
        raw = json.loads(FILE.read_text(encoding="utf-8"))
        return [TypeOut(**r) for r in raw if isinstance(r, dict)]
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to read types")

@router.get("", response_model=list[TypeOut])
def list_types():
    return _read_types()
