from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field
from typing import List, Optional
from pathlib import Path
import json, time, uuid

router = APIRouter(prefix="/pins", tags=["pins"])

DATA_PATH = Path("data")
DATA_PATH.mkdir(exist_ok=True)
FILE = DATA_PATH / "pins.json"
TFILE = DATA_PATH / "building_types.json"

def _valid_types() -> set[str]:
    try:
        raw = json.loads(TFILE.read_text(encoding="utf-8"))
        return {r["key"] for r in raw if isinstance(r, dict) and "key" in r}
    except Exception:
        return set()

def _clamp_level(v) -> int:
    try:
        i = int(v)
    except Exception:
        i = 1
    return 1 if i < 1 else 5 if i > 5 else i

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
    if not FILE.exists():
        return []
    try:
        raw = json.loads(FILE.read_text(encoding="utf-8"))
        return [Pin(**r) for r in raw if isinstance(r, dict)]
    except Exception:
        return []

def _write(items: List[Pin]) -> None:
    FILE.write_text(
        json.dumps([p.model_dump() for p in items], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

@router.get("", response_model=List[Pin])
def list_pins():
    return _read()

@router.post("", response_model=Pin)
def add_pin(payload: PinIn):
    items = _read()
    data = payload.model_dump()
    data["level"] = _clamp_level(data.get("level", 1))
    if data.get("type"):
        valid = _valid_types()
        if data["type"] not in valid:
            raise HTTPException(status_code=400, detail="Unknown type")
    pin = Pin(**data)
    items.append(pin)
    _write(items)
    return pin

@router.delete("", status_code=204)
def clear_pins():
    _write([])
    return

@router.delete("/{pin_id}", status_code=204)
def delete_pin(pin_id: str):
    items = _read()
    new_items = [p for p in items if p.id != pin_id]
    if len(new_items) == len(items):
        raise HTTPException(status_code=404, detail="Pin not found")
    _write(new_items)
    return

_ALLOWED_FIELDS = {"type", "owner", "level", "color"}

@router.patch("/{pin_id}", response_model=Pin)
def update_pin(pin_id: str, payload: dict = Body(...)):
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")
    updates = {k: v for k, v in payload.items() if k in _ALLOWED_FIELDS}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    if "level" in updates:
        updates["level"] = _clamp_level(updates["level"])
    if "type" in updates and updates["type"]:
        valid = _valid_types()
        if updates["type"] not in valid:
            raise HTTPException(status_code=400, detail="Unknown type")

    items = _read()
    for i, p in enumerate(items):
        if p.id == pin_id:
            data = p.model_dump()
            data.update(updates)
            items[i] = Pin(**data)
            _write(items)
            return items[i]
    raise HTTPException(status_code=404, detail="Pin not found")
