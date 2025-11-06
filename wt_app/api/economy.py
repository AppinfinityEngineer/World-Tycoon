from __future__ import annotations
import os
import json
import time
from pathlib import Path
from typing import Dict, List

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


def _normalize_last_tick_ms_in(eco: dict) -> int:
    """
    Accept legacy keys and units; return epoch ms.
    - lastTick (ms)
    - last_tick_ms (ms)
    - last_tick (sec or ms)
    """
    if "lastTick" in eco:
        v = int(eco.get("lastTick") or 0)
        return v
    if "last_tick_ms" in eco:
        v = int(eco.get("last_tick_ms") or 0)
        return v
    if "last_tick" in eco:
        v = int(eco.get("last_tick") or 0)
        return v if v > 10_000_000_000 else v * 1000
    return 0


def _load_economy() -> dict:
    eco = _read_json(ECO_FILE, {})

    # balances map
    if "balances" not in eco or not isinstance(eco["balances"], dict):
        eco["balances"] = {}  # owner -> int

    # escrow bucket for offers: {offer_id: amount}
    if "escrow" not in eco or not isinstance(eco["escrow"], dict):
        eco["escrow"] = {}

    # Normalize tick fields so the rest of the code can rely on eco["lastTick"] in ms
    last_ms = _normalize_last_tick_ms_in(eco)
    eco["lastTick"] = int(last_ms)
    # keep legacy mirror for old readers/tools
    eco["last_tick_ms"] = int(last_ms)

    return eco


def _save_economy(eco: dict) -> None:
    # always persist canonical + legacy tick fields
    if "lastTick" not in eco:
        eco["lastTick"] = 0
    eco["last_tick_ms"] = int(eco["lastTick"])

    # ensure required shapes before write (defensive)
    if "balances" not in eco or not isinstance(eco["balances"], dict):
        eco["balances"] = {}
    if "escrow" not in eco or not isinstance(eco["escrow"], dict):
        eco["escrow"] = {}

    _write_json(ECO_FILE, eco)


# ---------- balance helpers (used by offers / map / etc.) ----------
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


# ---------- NEW: escrow helpers for offers v2 ----------
def escrow_hold(offer_id: str, buyer: str, amount: int) -> None:
    """
    Move `amount` from buyer's balance into escrow under this offer_id.
    Raises ValueError on insufficient funds / invalid amount.
    """
    amount = int(amount)
    if amount <= 0:
        raise ValueError("invalid escrow amount")

    eco = _load_economy()
    bal = int(eco["balances"].get(buyer, 0))
    if bal < amount:
        raise ValueError("insufficient funds for escrow")

    eco["balances"][buyer] = bal - amount
    eco["escrow"][offer_id] = int(eco["escrow"].get(offer_id, 0)) + amount
    _save_economy(eco)


def escrow_refund(offer_id: str, buyer: str) -> None:
    """
    Refund escrow for offer_id back to buyer (used on reject/cancel/expire).
    No-op if nothing in escrow.
    """
    eco = _load_economy()
    amt = int(eco["escrow"].get(offer_id, 0))
    if amt > 0:
        eco["escrow"].pop(offer_id, None)
        eco["balances"][buyer] = int(eco["balances"].get(buyer, 0)) + amt
        _save_economy(eco)


def escrow_payout(offer_id: str, seller: str, fee_pct: float = 0.0) -> int:
    """
    Payout escrow for offer_id to seller, applying an optional fee percentage.
    Returns net amount credited to seller. No-op (0) if nothing in escrow.
    """
    eco = _load_economy()
    amt = int(eco["escrow"].get(offer_id, 0))
    if amt <= 0:
        return 0

    eco["escrow"].pop(offer_id, None)

    fee_pct = max(0.0, float(fee_pct or 0.0))
    fee = int(round(amt * fee_pct))
    net = max(0, amt - fee)

    eco["balances"][seller] = int(eco["balances"].get(seller, 0)) + net
    _save_economy(eco)
    return net


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
        level = min(5, max(1, level))
        per_owner[owner] = per_owner.get(owner, 0) + (base * level)

    eco = _load_economy()

    # accrual only for owners we found income for; others keep their balances
    for owner, inc in per_owner.items():
        eco["balances"][owner] = int(eco["balances"].get(owner, 0)) + int(inc)

    # record canonical + legacy last tick in ms
    eco["lastTick"] = _now_ms()
    eco["last_tick_ms"] = int(eco["lastTick"])

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
