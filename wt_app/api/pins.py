from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from pathlib import Path
import json, time, uuid

router = APIRouter(prefix="/pins", tags=["pins"])

DATA_PATH = Path("data"); DATA_PATH.mkdir(exist_ok=True)
FILE = DATA_PATH / "pins.json"

class PinIn(BaseModel):
    lat: float
    lng: float
    color: str = "#22c55e"
    type: Optional[str] = None
    owner: Optional[str] = None
    level: int = 1

class Pin(PinIn):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    createdAt: int = Field(default_factory=lambda: int(time.time() * 1000))

def _read() -> List[Pin]:
    if not FILE.exists(): return []
    try:
        raw = json.loads(FILE.read_text(encoding="utf-8"))
        return [Pin(**r) for r in raw if isinstance(r, dict)]
    except Exception:
        return []

def _write(items: List[Pin]) -> None:
    FILE.write_text(json.dumps([p.model_dump() for p in items], ensure_ascii=False, indent=2), encoding="utf-8")

@router.get("", response_model=List[Pin])
def list_pins():
    return _read()

@router.post("", response_model=Pin)
def add_pin(payload: PinIn):
    items = _read()
    pin = Pin(**payload.model_dump())
    items.append(pin); _write(items)
    return pin

@router.delete("", status_code=204)
def clear_pins():
    _write([]); return

@router.delete("/{pin_id}", status_code=204)
def delete_pin(pin_id: str):
    items = _read()
    new_items = [p for p in items if p.id != pin_id]
    if len(new_items) == len(items):
        raise HTTPException(status_code=404, detail="Pin not found")
    _write(new_items); return
