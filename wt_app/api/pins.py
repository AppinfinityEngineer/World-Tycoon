# wt_app/api/pins.py

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import List, Optional, Dict

from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field

from wt_app.api.economy import get_balance, adjust_balance

router = APIRouter(prefix="/pins", tags=["pins"])

DATA_PATH = Path("data")
DATA_PATH.mkdir(exist_ok=True)

PINS_FILE = DATA_PATH / "pins.json"
TYPES_FILE = DATA_PATH / "building_types.json"


# ---------- base models ----------

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


# ---------- helpers ----------

def _read() -> List[Pin]:
    if not PINS_FILE.exists():
        return []
    try:
        raw = json.loads(PINS_FILE.read_text(encoding="utf-8"))
        return [Pin(**r) for r in raw if isinstance(r, dict)]
    except Exception:
        return []


def _write(items: List[Pin]) -> None:
    PINS_FILE.write_text(
        json.dumps([p.model_dump() for p in items], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _load_types() -> List[dict]:
    if not TYPES_FILE.exists():
        return []
    try:
        raw = json.loads(TYPES_FILE.read_text(encoding="utf-8"))
        return [t for t in raw if isinstance(t, dict)]
    except Exception:
        return []


def _type_price_map() -> Dict[str, int]:
    """
    Map buildingType -> base price.

    Supports several possible field names so we don't break if the JSON
    is tweaked: basePrice, price, cost. Fallback 100.
    """
    out: Dict[str, int] = {}
    for t in _load_types():
        key = str(t.get("key") or "").strip()
        if not key:
            continue
        price = (
            t.get("basePrice")
            or t.get("price")
            or t.get("cost")
            or 100
        )
        try:
            out[key] = int(price)
        except Exception:
            out[key] = 100
    return out


# ---------- existing endpoints ----------

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


# --- partial update (type/owner/level/color) ---

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
            # keep immutable fields intact (id, lat, lng, createdAt)
            items[i] = Pin(**data)
            _write(items)
            return items[i]

    raise HTTPException(status_code=404, detail="Pin not found")


# ---------- buy / upgrade ----------

class PinBuyIn(BaseModel):
    pinId: str = Field(..., min_length=1)
    buildingType: str = Field(..., min_length=1)
    buyer: str = Field(..., min_length=1)


@router.post("/buy", response_model=Pin)
def buy_or_upgrade_pin(payload: PinBuyIn):
    items = _read()
    target_index = None

    for i, p in enumerate(items):
        if p.id == payload.pinId:
            target_index = i
            break

    if target_index is None:
        raise HTTPException(status_code=404, detail="pin not found")

    pin = items[target_index]

    buyer = (payload.buyer or "").strip()
    if not buyer:
        raise HTTPException(status_code=400, detail="missing buyer")

    owner = (pin.owner or "").strip()
    buyer_l = buyer.lower()
    owner_l = owner.lower() if owner else ""

    price_map = _type_price_map()
    base_price = int(price_map.get(payload.buildingType, 100))

    # ---- new purchase (unowned slot) ----
    if not owner:
        price = base_price
        bal = get_balance(buyer)
        if bal < price:
            raise HTTPException(status_code=400, detail="insufficient funds")

        adjust_balance(buyer, -price)

        data = pin.model_dump()
        data["owner"] = buyer
        data["type"] = payload.buildingType
        data["level"] = 1
        pin = Pin(**data)
        items[target_index] = pin

    # ---- upgrade existing building (must be owner) ----
    elif owner_l == buyer_l:
        cur_level = int(pin.level or 1)
        if cur_level >= 5:
            raise HTTPException(status_code=400, detail="max level reached")

        new_level = cur_level + 1
        price = base_price * new_level  # simple clear rule

        bal = get_balance(buyer)
        if bal < price:
            raise HTTPException(status_code=400, detail="insufficient funds")

        adjust_balance(buyer, -price)

        data = pin.model_dump()
        # keep existing building type; Phase 1 does not support switching type via /buy
        data["level"] = new_level
        pin = Pin(**data)
        items[target_index] = pin

    # ---- someone else owns it → must use offers/trade ----
    else:
        raise HTTPException(status_code=403, detail="not your property")

    _write(items)
    return pin
