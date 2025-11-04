# wt_app/api/economy.py
from __future__ import annotations
import os
import json
import time
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/economy", tags=["economy"])

DATA = Path("data"); DATA.mkdir(exist_ok=True)
PINS_FILE = DATA / "pins.json"
TYPES_FILE = DATA / "building_types.json"
ECO_FILE = DATA / "economy.json"


# ---------- helpers (fs + time) ----------
def _interval_sec() -> int:
    """Auto-tick interval (seconds), default 5 minutes, env override WT_AUTO_TICK_MIN."""
    try:
        return int(float(os.getenv("WT_AUTO_TICK_MIN", "5")) * 60)
    except Exception:
        return 300

def _now_ms() -> int:
    return int(time.time() * 1000)

def _read_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default

def _write_json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


# ---------- domain helpers ----------
def _type_income_map() -> Dict[str, int]:
    raw = _read_json(TYPES_FILE, [])
    return {
        r["key"]: int(r.get("baseIncome", 0))
        for r in raw
        if isinstance(r, dict) and "key" in r
    }

def _load_pins() -> List[dict]:
    raw = _read_json(PINS_FILE, [])
    return [r for r in raw if isinstance(r, dict)]

def _load_economy() -> dict:
    eco = _read_json(ECO_FILE, {})
    if "balances" not in eco:
        eco["balances"] = {}  # owner -> int
    if "lastTick" not in eco:
        eco["lastTick"] = 0
    return eco

def _save_economy(eco: dict) -> None:
    _write_json(ECO_FILE, eco)


# ---------- balance helpers (used by offers.accept) ----------
def get_balance(owner: str) -> int:
    eco = _load_economy()
    return int(eco["balances"].get(owner, 0))

def set_balance(owner: str, value: int) -> int:
    eco = _load_economy()
    eco["balances"][owner] = int(value)
    _save_economy(eco)
    return int(eco["balances"][owner])

def adjust_balance(owner: str, delta: int) -> int:
    eco = _load_economy()
    cur = int(eco["balances"].get(owner, 0))
    cur += int(delta)
    eco["balances"][owner] = cur
    _save_economy(eco)
    return cur

def transfer(from_owner: str, to_owner: str, amount: int) -> None:
    """Atomic-ish transfer: debit buyer, credit seller, raise on insufficient funds."""
    amount = int(amount)
    if amount <= 0:
        raise ValueError("amount must be > 0")
    eco = _load_economy()
    from_bal = int(eco["balances"].get(from_owner, 0))
    if from_bal < amount:
        raise ValueError("insufficient funds")
    eco["balances"][from_owner] = from_bal - amount
    eco["balances"][to_owner] = int(eco["balances"].get(to_owner, 0)) + amount
    _save_economy(eco)


# ---------- models ----------
class BalanceItem(BaseModel):
    owner: str
    balance: int
    updatedAt: int

class SummaryOut(BaseModel):
    lastTick: int
    intervalSec: int
    totals: List[BalanceItem]

class TransferIn(BaseModel):
    """Optional dev/test endpoint payload."""
    fromOwner: str = Field(..., min_length=1)
    toOwner: str = Field(..., min_length=1)
    amount: int = Field(..., gt=0)

class TransferOut(BaseModel):
    ok: bool
    fromBalance: int
    toBalance: int


# ---------- endpoints (kept as-is + tiny transfer for testing) ----------
@router.get("/summary", response_model=SummaryOut)
def summary():
    eco = _load_economy()
    now = _now_ms()
    items = [
        BalanceItem(owner=k, balance=int(v), updatedAt=now)
        for k, v in eco["balances"].items()
        if k
    ]
    items.sort(key=lambda x: x.balance, reverse=True)
    return SummaryOut(
        lastTick=int(eco["lastTick"]),
        intervalSec=_interval_sec(),
        totals=items,
    )


@router.post("/tick", response_model=SummaryOut)
def tick():
    """
    Accrue income per owner:
    sum(baseIncome[type] * level) across all pins for that owner.
    """
    pins = _load_pins()
    if not pins:
        raise HTTPException(status_code=400, detail="No pins available")

    income_map = _type_income_map()
    if not income_map:
        raise HTTPException(status_code=500, detail="Type registry missing or empty")

    # compute per owner tick income
    per_owner: Dict[str, int] = {}
    for p in pins:
        owner = (p.get("owner") or "").strip()
        if not owner:
            continue
        tkey = p.get("type") or ""
        base = int(income_map.get(tkey, 0))
        level = int(p.get("level") or 1)
        level = min(5, max(1, level))
        per_owner[owner] = per_owner.get(owner, 0) + (base * level)

    # nothing to accrue (e.g., pins without owners)
    if not per_owner:
        return summary()

    eco = _load_economy()
    for owner, inc in per_owner.items():
        eco["balances"][owner] = int(eco["balances"].get(owner, 0)) + int(inc)

    eco["lastTick"] = _now_ms()
    _save_economy(eco)
    return summary()


# ---- optional dev/test transfer endpoint (handy for manual QA) ----
@router.post("/transfer", response_model=TransferOut)
def transfer_api(payload: TransferIn):
    try:
        transfer(payload.fromOwner, payload.toOwner, payload.amount)
        return TransferOut(
            ok=True,
            fromBalance=get_balance(payload.fromOwner),
            toBalance=get_balance(payload.toOwner),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="transfer failed")
