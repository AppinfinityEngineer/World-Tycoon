from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Body
from pydantic import BaseModel, Field

# Auth (keeps your stable path)
from wt_app.core.security import get_current_user, CurrentUser

# Reuse economy helpers (no changes to economy.py)
from wt_app.api.economy import get_balance, adjust_balance

router = APIRouter(prefix="/shop", tags=["shop"])

DATA = Path("data"); DATA.mkdir(exist_ok=True)
PINS_FILE = DATA / "pins.json"
TYPES_FILE = DATA / "building_types.json"


# ---------------- fs helpers ----------------
def _read_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default

def _write_json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


# ---------------- pricing + catalog ----------------
DEFAULT_MAX_LEVEL = 5

def _catalog() -> List[dict]:
    raw = _read_json(TYPES_FILE, [])
    out: List[dict] = []
    for r in raw if isinstance(raw, list) else []:
        if not isinstance(r, dict):
            continue
        key = r.get("key")
        if not key:
            continue
        base_income = int(r.get("baseIncome", 0))
        price = int(r.get("price", 0)) or max(100, base_income * 100)
        label = r.get("label") or key.replace("_", " ").title()
        max_level = int(r.get("maxLevel", DEFAULT_MAX_LEVEL))
        out.append({
            "key": key,
            "label": label,
            "baseIncome": base_income,
            "price": price,
            "maxLevel": max_level,
        })
    return out


# ---------------- pins i/o (reuse your existing file) ----------------
def _read_pins() -> List[dict]:
    raw = _read_json(PINS_FILE, [])
    pins: List[dict] = []
    for r in raw if isinstance(raw, list) else []:
        if isinstance(r, dict):
            pins.append(r)
    return pins

def _write_pins(pins: List[dict]) -> None:
    _write_json(PINS_FILE, pins)


# ---------------- models ----------------
class TypeOut(BaseModel):
    key: str
    label: str
    baseIncome: int
    price: int
    maxLevel: int = DEFAULT_MAX_LEVEL

class TypesOut(BaseModel):
    items: List[TypeOut]

class BuyIn(BaseModel):
    # We keep this simple/safe: you buy into an EXISTING free pin slot by id,
    # and set its type+level, claiming it as the current user.
    pinId: str = Field(..., min_length=1)
    type: str = Field(..., min_length=1)
    level: int = Field(default=1, ge=1, le=DEFAULT_MAX_LEVEL)

class BuyOut(BaseModel):
    ok: bool
    pin: dict
    newBalance: int

class UpgradeIn(BaseModel):
    pinId: str = Field(..., min_length=1)

class UpgradeOut(BaseModel):
    ok: bool
    pin: dict
    newBalance: int


# ---------------- endpoints ----------------
@router.get("/types", response_model=TypesOut)
def list_types():
    return TypesOut(items=[TypeOut(**t) for t in _catalog()])


@router.post("/buy", response_model=BuyOut)
def buy_pin(payload: BuyIn, user: CurrentUser = Depends(get_current_user)):
    me = (user.email or user.sub or "").lower()
    if not me:
        raise HTTPException(status_code=401, detail="Auth required")

    types = {t["key"]: t for t in _catalog()}
    t = types.get(payload.type)
    if not t:
        raise HTTPException(status_code=400, detail="Unknown building type")

    price = int(t["price"])
    max_level = int(t.get("maxLevel", DEFAULT_MAX_LEVEL))
    level = max(1, min(int(payload.level), max_level))

    pins = _read_pins()
    try:
        idx = next(i for i, p in enumerate(pins) if str(p.get("id")) == payload.pinId)
    except StopIteration:
        raise HTTPException(status_code=404, detail="Pin not found")

    pin = pins[idx]
    # A "free" slot is either owner missing/blank, or explicitly marked free
    current_owner = (pin.get("owner") or "").strip().lower()
    if current_owner:
        raise HTTPException(status_code=409, detail="Pin is already owned")

    # funds check
    bal = int(get_balance(me))
    if bal < price:
        raise HTTPException(status_code=400, detail=f"Insufficient funds: need {price}, have {bal}")

    # charge (burn)
    adjust_balance(me, -price)

    # set ownership + type/level
    pin["owner"] = me
    pin["type"] = t["key"]
    pin["level"] = level
    # optional convenience defaults
    pin.setdefault("createdAt", int(time.time() * 1000))
    pin.setdefault("color", "#3b82f6")

    pins[idx] = pin
    _write_pins(pins)

    return BuyOut(ok=True, pin=pin, newBalance=int(get_balance(me)))


@router.post("/upgrade", response_model=UpgradeOut)
def upgrade_pin(payload: UpgradeIn, user: CurrentUser = Depends(get_current_user)):
    me = (user.email or user.sub or "").lower()
    if not me:
        raise HTTPException(status_code=401, detail="Auth required")

    pins = _read_pins()
    try:
        idx = next(i for i, p in enumerate(pins) if str(p.get("id")) == payload.pinId)
    except StopIteration:
        raise HTTPException(status_code=404, detail="Pin not found")

    pin = pins[idx]
    owner = (pin.get("owner") or "").lower()
    if owner != me:
        raise HTTPException(status_code=403, detail="Only the owner can upgrade")

    types = {t["key"]: t for t in _catalog()}
    key = (pin.get("type") or "")
    tinfo = types.get(key)
    if not tinfo:
        raise HTTPException(status_code=400, detail="Pin type not recognized")

    level = int(pin.get("level") or 1)
    max_level = int(tinfo.get("maxLevel", DEFAULT_MAX_LEVEL))
    if level >= max_level:
        raise HTTPException(status_code=409, detail="Pin already at max level")

    base_price = int(tinfo["price"])
    # Simple upgrade curve: price * nextLevel
    next_level = level + 1
    cost = base_price * next_level

    bal = int(get_balance(me))
    if bal < cost:
        raise HTTPException(status_code=400, detail=f"Insufficient funds: need {cost}, have {bal}")

    adjust_balance(me, -cost)
    pin["level"] = next_level
    pins[idx] = pin
    _write_pins(pins)

    return UpgradeOut(ok=True, pin=pin, newBalance=int(get_balance(me)))
