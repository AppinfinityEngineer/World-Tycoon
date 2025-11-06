# wt_app/api/pins.py
from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field

from wt_app.api.economy import get_balance, adjust_balance

router = APIRouter(prefix="/pins", tags=["pins"])

DATA = Path("data")
DATA.mkdir(exist_ok=True)

PINS_FILE = DATA / "pins.json"
STREETS_FILE = DATA / "streets.json"
TYPES_FILE = DATA / "building_types.json"  # local ref to building types


# ---------- helpers ----------

def _read_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _write_json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def _now_ms() -> int:
    return int(time.time() * 1000)


def _load_pins() -> List[dict]:
    raw = _read_json(PINS_FILE, [])
    return [p for p in raw if isinstance(p, dict)]


def _save_pins(pins: List[dict]) -> None:
    _write_json(PINS_FILE, pins)


def _load_types() -> List[dict]:
    raw = _read_json(TYPES_FILE, [])
    return [t for t in raw if isinstance(t, dict)]


def _load_streets() -> List[dict]:
    raw = _read_json(STREETS_FILE, [])
    return [s for s in raw if isinstance(s, dict)]


def _get_street_for_pin(pin: dict) -> Optional[dict]:
    sid = pin.get("streetId")
    if not sid:
        return None
    for s in _load_streets():
        if s.get("id") == sid:
            return s
    return None


# ---------- models ----------

class PinIn(BaseModel):
    lat: float
    lng: float
    color: str = "#22c55e"
    type: Optional[str] = None          # building type key
    owner: Optional[str] = None         # email
    level: int = 1
    streetId: Optional[str] = None      # optional future linkage
    streetName: Optional[str] = None


class Pin(PinIn):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    createdAt: int = Field(default_factory=_now_ms)


class PinBuyIn(BaseModel):
    pinId: str = Field(..., min_length=1)
    buildingType: str = Field(..., min_length=1)
    buyer: str = Field(..., min_length=1)


# ---------- core fs ops ----------

def _read() -> List[Pin]:
    raw = _read_json(PINS_FILE, [])
    items: List[Pin] = []
    for r in raw:
        if not isinstance(r, dict):
            continue
        try:
            items.append(Pin(**r))
        except Exception:
            # tolerate legacy entries
            pass
    return items


def _write(items: List[Pin]) -> None:
    _write_json(PINS_FILE, [p.model_dump() for p in items])


# ---------- CRUD endpoints ----------

@router.get("", response_model=List[Pin])
def list_pins():
    return _read()


@router.post("", response_model=Pin)
def add_pin(payload: PinIn):
    items = _read()
    pin = Pin(**payload.model_dump())
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


# partial update (type/owner/level/color)
_ALLOWED_FIELDS = {"type", "owner", "level", "color"}

@router.patch("/{pin_id}", response_model=Pin)
def update_pin(pin_id: str, payload: dict = Body(...)):
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    updates = {k: v for k, v in payload.items() if k in _ALLOWED_FIELDS}
    if not updates:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    items = _read()
    for i, p in enumerate(items):
        if p.id == pin_id:
            data = p.model_dump()
            data.update(updates)
            items[i] = Pin(**data)
            _write(items)
            return items[i]

    raise HTTPException(status_code=404, detail="Pin not found")


# ---------- Buy / Upgrade (uses /economy) ----------

@router.post("/buy", response_model=Pin)
def buy_or_upgrade_pin(payload: PinBuyIn):
    items = _read()
    pin: Optional[Pin] = next((p for p in items if p.id == payload.pinId), None)
    if not pin:
        raise HTTPException(status_code=404, detail="pin not found")

    buyer = (payload.buyer or "").strip()
    if not buyer:
        raise HTTPException(status_code=400, detail="missing buyer")
    buyer_l = buyer.lower()

    owner = (pin.owner or "").strip()
    owner_l = owner.lower() if owner else ""

    # building type lookup
    types = _load_types()
    t = next((x for x in types if x.get("key") == payload.buildingType), None)
    if not t:
        raise HTTPException(status_code=400, detail="invalid building type")

    base_price = int(t.get("basePrice") or t.get("price") or 100)

    # TODO (next branch): if pin.streetId has an owning street, enforce that here

    # --- BUY new slot ---
    if not owner:
        price = base_price
        bal = get_balance(buyer)
        if bal < price:
            raise HTTPException(status_code=400, detail="insufficient funds")
        adjust_balance(buyer, -price)
        pin.owner = buyer
        pin.type = payload.buildingType
        pin.level = 1

    # --- UPGRADE existing (must be owner) ---
    elif owner_l == buyer_l:
        cur_level = int(pin.level or 1)
        if cur_level >= 5:
            raise HTTPException(status_code=400, detail="max level reached")
        new_level = cur_level + 1
        price = base_price * new_level  # simple scaling

        bal = get_balance(buyer)
        if bal < price:
            raise HTTPException(status_code=400, detail="insufficient funds")

        adjust_balance(buyer, -price)
        pin.level = new_level

    # --- someone else owns it: use offers/trades ---
    else:
        raise HTTPException(status_code=403, detail="not your property")

    # persist updated pin
    for i, p in enumerate(items):
        if p.id == pin.id:
            items[i] = pin
            break
    _write(items)

    return pin
