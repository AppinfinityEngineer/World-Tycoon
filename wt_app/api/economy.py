from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pathlib import Path
import json, time
from typing import Dict, List

router = APIRouter(prefix="/economy", tags=["economy"])

DATA = Path("data"); DATA.mkdir(exist_ok=True)
PINS_FILE = DATA / "pins.json"
TYPES_FILE = DATA / "building_types.json"
ECO_FILE = DATA / "economy.json"

def _now_ms() -> int:
    return int(time.time() * 1000)

def _read_json(path: Path, default):
    if not path.exists(): return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default

def _write_json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

def _type_income_map() -> Dict[str, int]:
    raw = _read_json(TYPES_FILE, [])
    return {r["key"]: int(r.get("baseIncome", 0)) for r in raw if isinstance(r, dict) and "key" in r}

def _load_pins() -> List[dict]:
    raw = _read_json(PINS_FILE, [])
    return [r for r in raw if isinstance(r, dict)]

def _load_economy() -> dict:
    eco = _read_json(ECO_FILE, {})
    if "balances" not in eco: eco["balances"] = {}  # owner -> int
    if "lastTick" not in eco: eco["lastTick"] = 0
    return eco

def _save_economy(eco: dict) -> None:
    _write_json(ECO_FILE, eco)

class BalanceItem(BaseModel):
    owner: str
    balance: int
    updatedAt: int

class SummaryOut(BaseModel):
    lastTick: int
    totals: List[BalanceItem]

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
    return SummaryOut(lastTick=int(eco["lastTick"]), totals=items)

@router.post("/tick", response_model=SummaryOut)
def tick():
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
        if level < 1: level = 1
        if level > 5: level = 5
        inc = base * level
        per_owner[owner] = per_owner.get(owner, 0) + inc

    if not per_owner:
        # nothing to accrue
        eco = _load_economy()
        return summary()

    eco = _load_economy()
    for owner, inc in per_owner.items():
        cur = int(eco["balances"].get(owner, 0))
        eco["balances"][owner] = cur + int(inc)

    eco["lastTick"] = _now_ms()
    _save_economy(eco)
    return summary()
