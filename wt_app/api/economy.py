# wt_app/api/economy.py
import os
import json
import time
from pathlib import Path
from typing import Dict, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/economy", tags=["economy"])

DATA = Path("data"); DATA.mkdir(exist_ok=True)
PINS_FILE = DATA / "pins.json"
TYPES_FILE = DATA / "building_types.json"
ECO_FILE = DATA / "economy.json"


# ---------- helpers ----------
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


# ---------- models ----------
class BalanceItem(BaseModel):
    owner: str
    balance: int
    updatedAt: int

class SummaryOut(BaseModel):
    lastTick: int
    intervalSec: int
    totals: List[BalanceItem]


# ---------- endpoints ----------
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
        if level < 1:
            level = 1
        if level > 5:
            level = 5
        inc = base * level
        per_owner[owner] = per_owner.get(owner, 0) + inc

    # nothing to accrue (e.g., pins without owners)
    if not per_owner:
        return summary()

    eco = _load_economy()
    for owner, inc in per_owner.items():
        cur = int(eco["balances"].get(owner, 0))
        eco["balances"][owner] = cur + int(inc)

    eco["lastTick"] = _now_ms()
    _save_economy(eco)
    return summary()
