# wt_app/api/pins_market.py
from __future__ import annotations
import json
from pathlib import Path
from typing import Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

# share same data folder as other api files
DATA = Path("data"); DATA.mkdir(exist_ok=True)
PINS_FILE = DATA / "pins.json"
TYPES_FILE = DATA / "building_types.json"

# economy helpers from your existing economy module
# (same functions you already have in wt_app/api/economy.py)
from wt_app.api.economy import get_balance, adjust_balance  # type: ignore

router = APIRouter(prefix="/pins", tags=["pins-market"])

# ---------- fs helpers ----------
def _read_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default

def _write_json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

def _load_pins() -> list[dict]:
    raw = _read_json(PINS_FILE, [])
    return [r for r in raw if isinstance(r, dict)]

def _save_pins(pins: list[dict]) -> None:
    _write_json(PINS_FILE, pins)

def _type_map() -> Dict[str, dict]:
    raw = _read_json(TYPES_FILE, [])
    out: Dict[str, dict] = {}
    for r in raw:
        if isinstance(r, dict) and "key" in r:
            out[str(r["key"])] = {
                "key": r["key"],
                "name": r.get("name") or r["key"],
                "baseIncome": int(r.get("baseIncome") or 0),
                "price": int(r.get("price") or 0),
            }
    return out

def _derive_price(t: Optional[dict]) -> int:
    if not t:
        return 0
    explicit = int(t.get("price") or 0)
    if explicit > 0:
        return explicit
    bi = int(t.get("baseIncome") or 0)
    return max(100, bi * 10)

# ---------- models ----------
class BuyIn(BaseModel):
    pinId: str = Field(..., min_length=1)
    owner: str = Field(..., min_length=1)     # buyer email (lowercase on FE)
    type: Optional[str] = None                # required if pin has no type

class UpgradeIn(BaseModel):
    pinId: str = Field(..., min_length=1)
    owner: str = Field(..., min_length=1)     # must own the pin

# ---------- endpoints ----------
@router.post("/buy")
def buy_pin(payload: BuyIn):
    pins = _load_pins()
    tmap = _type_map()

    # find pin
    pin = next((p for p in pins if str(p.get("id")) == payload.pinId), None)
    if not pin:
        raise HTTPException(status_code=404, detail="pin not found")

    buyer = (payload.owner or "").strip().lower()
    cur_owner = (pin.get("owner") or "").strip().lower()

    # type to apply (existing or from payload)
    type_key = (pin.get("type") or "").strip()
    if not type_key:
        type_key = (payload.type or "").strip()
        if not type_key:
            raise HTTPException(status_code=400, detail="type is required for purchase")

    t = tmap.get(type_key)
    if not t:
        raise HTTPException(status_code=400, detail="unknown building type")

    # price & basic checks
    price = _derive_price(t)
    if price <= 0:
        raise HTTPException(status_code=500, detail="invalid price config")

    # allow buying unowned or owned-by-someone-else (we’re not transferring to seller yet in MVP)
    if cur_owner == buyer:
        raise HTTPException(status_code=400, detail="already owned by you")

    # funds
    bal = get_balance(buyer)
    if bal < price:
        raise HTTPException(status_code=400, detail="insufficient funds")

    # debit buyer; we “burn” to bank/treasury in MVP
    adjust_balance(buyer, -price)

    # set ownership & type; reset level (min 1)
    pin["owner"] = buyer
    pin["type"] = type_key
    pin["level"] = max(1, int(pin.get("level") or 1))

    _save_pins(pins)
    return pin


@router.post("/upgrade")
def upgrade_pin(payload: UpgradeIn):
    pins = _load_pins()
    tmap = _type_map()

    pin = next((p for p in pins if str(p.get("id")) == payload.pinId), None)
    if not pin:
        raise HTTPException(status_code=404, detail="pin not found")

    owner = (payload.owner or "").strip().lower()
    if (pin.get("owner") or "").strip().lower() != owner:
        raise HTTPException(status_code=403, detail="you do not own this pin")

    level = int(pin.get("level") or 1)
    if level >= 5:
        raise HTTPException(status_code=400, detail="already at max level")

    t = tmap.get(str(pin.get("type") or ""))
    if not t:
        raise HTTPException(status_code=400, detail="pin has no valid type")

    base_price = _derive_price(t)
    # simple upgrade curve: price * level (L1->2 costs 1x, L2->3 2x, …)
    upgrade_cost = base_price * level

    bal = get_balance(owner)
    if bal < upgrade_cost:
        raise HTTPException(status_code=400, detail="insufficient funds")

    adjust_balance(owner, -upgrade_cost)

    pin["level"] = min(5, level + 1)
    _save_pins(pins)
    return pin
