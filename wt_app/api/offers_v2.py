# wt_app/api/offers_v2.py
from __future__ import annotations

import os
import json
import uuid
import time
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from wt_app.api.economy import (
    DATA,              # shared data dir
    escrow_hold,
    escrow_refund,
    escrow_payout,
)

router = APIRouter(prefix="/offers", tags=["offers"])

OFFERS_FILE = DATA / "offers.json"
PINS_FILE = DATA / "pins.json"
EVENTS_FILE = DATA / "events.json"


# ---------- basic fs helpers ----------
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


# ---------- config ----------
FEE_PCT = float(os.getenv("OFFER_FEE_PCT", "0.02") or 0.02)
EXP_HRS = int(os.getenv("OFFER_EXPIRY_HOURS", "24") or 24)
MIN_OFFER = int(os.getenv("MIN_OFFER_AMOUNT", "10") or 10)
LOCK_PIN_ON_PENDING = os.getenv("LOCK_PIN_ON_PENDING", "true").lower() == "true"

VALID_STATUSES = {"PENDING", "ACCEPTED", "REJECTED", "CANCELED", "EXPIRED"}


def _normalize_status(raw: Optional[str]) -> str:
    """
    Normalize legacy + mixed-case statuses to canonical:
      PENDING, ACCEPTED, REJECTED, CANCELED, EXPIRED
    """
    if not raw:
        return "PENDING"
    up = str(raw).strip().upper()
    if up == "CANCELLED":  # UK spelling
        up = "CANCELED"
    if up in VALID_STATUSES:
        return up
    # Unknown legacy → treat as PENDING so it can still flow
    return "PENDING"


def _normalize_expires_at(raw) -> int:
    """
    Handle both ms and sec legacy values.
    """
    if raw is None:
        return 0
    try:
        v = int(raw)
    except Exception:
        return 0
    # seconds vs ms heuristic
    if 0 < v < 10_000_000_000:
        return v * 1000
    return v


# ---------- domain helpers ----------
def _load_offers() -> List[dict]:
    """
    Load offers and normalize legacy fields so v1 data works and matches OfferOut.
    Ensures EVERY offer has:
      - status in VALID_STATUSES
      - createdAt
      - expiresAt
      - history list
    """
    raw = _read_json(OFFERS_FILE, [])
    if not isinstance(raw, list):
        return []

    changed = False
    out: List[dict] = []

    for o in raw:
        if not isinstance(o, dict):
            continue

        # ---- status ----
        old_status = o.get("status")
        st = _normalize_status(old_status)
        if st != old_status:
            o["status"] = st
            changed = True

        # ---- createdAt ----
        if "createdAt" not in o:
            # try legacy t, else now
            created = int(o.get("t") or _now_ms())
            o["createdAt"] = created
            changed = True
        else:
            created = int(o.get("createdAt") or 0)

        # ---- expiresAt ----
        exp_raw = o.get("expiresAt", None)
        if exp_raw is None:
            # legacy row without expiresAt:
            # if still pending, give it a proper window; else 0 is fine
            if st == "PENDING" and created:
                exp = created + EXP_HRS * 3600 * 1000
            else:
                exp = 0
            o["expiresAt"] = int(exp)
            changed = True
        else:
            exp_norm = _normalize_expires_at(exp_raw)
            if exp_norm != exp_raw:
                o["expiresAt"] = int(exp_norm)
                changed = True

        # ---- history ----
        if "history" not in o or not isinstance(o["history"], list):
            o["history"] = []
            changed = True

        out.append(o)

    if changed:
        _write_json(OFFERS_FILE, out)

    return out


def _save_offers(items: List[dict]) -> None:
    _write_json(OFFERS_FILE, items)


def _append_event(type_: str, note: str) -> None:
    evs = _read_json(EVENTS_FILE, [])
    if not isinstance(evs, list):
        evs = []
    evs.insert(
        0,
        {
            "id": uuid.uuid4().hex,
            "t": _now_ms(),
            "type": type_,
            "city": "Global",
            "note": note,
            "cdMins": 0,
        },
    )
    _write_json(EVENTS_FILE, evs[:500])


def _load_pins() -> List[dict]:
    raw = _read_json(PINS_FILE, [])
    return [p for p in raw if isinstance(p, dict)]


def _save_pins(pins: List[dict]) -> None:
    _write_json(PINS_FILE, pins)


def _get_pin(pin_id: str) -> Optional[dict]:
    for p in _load_pins():
        if str(p.get("id")) == str(pin_id):
            return p
    return None


def _set_pin_owner(pin_id: str, new_owner: str) -> None:
    pins = _load_pins()
    changed = False
    for p in pins:
        if str(p.get("id")) == str(pin_id):
            p["owner"] = new_owner
            p["lastTradeAt"] = _now_ms()
            changed = True
            break
    if changed:
        _save_pins(pins)


# ---------- models ----------
class OfferIn(BaseModel):
    pinId: str
    fromOwner: str
    toOwner: str
    amount: int = Field(..., gt=0)
    note: Optional[str] = None


class OfferOut(BaseModel):
    id: str
    pinId: str
    fromOwner: str
    toOwner: str
    amount: int
    status: str
    createdAt: int
    expiresAt: int
    note: Optional[str] = None
    history: List[dict] = Field(default_factory=list)


# ---------- GC ----------
def _gc_expire(items: List[dict]) -> int:
    now = _now_ms()
    changed = 0
    for o in items:
        st = _normalize_status(o.get("status"))
        exp = _normalize_expires_at(o.get("expiresAt"))
        if st == "PENDING" and exp and exp <= now:
            o["status"] = "EXPIRED"
            o.setdefault("history", []).append({"t": now, "a": "EXPIRED"})
            try:
                escrow_refund(o["id"], o["fromOwner"])
            except Exception:
                # swallow; log in real app
                pass
            _append_event(
                "Offer Expired",
                f"{o.get('fromOwner')} → {o.get('toOwner')} (pin {o.get('pinId')}) £{o.get('amount')}",
            )
            changed += 1
    if changed:
        _save_offers(items)
    return changed


# ---------- list offers ----------
@router.get("", response_model=List[OfferOut])
def list_offers(owner: str = Query(...), status: Optional[str] = None):
    owner_l = (owner or "").lower().strip()
    items = _load_offers()
    _gc_expire(items)

    status_filter = _normalize_status(status) if status else None
    out: List[dict] = []

    for o in items:
        st = _normalize_status(o.get("status"))
        if status_filter and st != status_filter:
            continue
        if (
            str(o.get("fromOwner", "")).lower() == owner_l
            or str(o.get("toOwner", "")).lower() == owner_l
        ):
            out.append({**o, "status": st})

    return out


# ---------- create offer (escrow) ----------
@router.post("", response_model=OfferOut)
def create_offer(payload: OfferIn):
    pin = _get_pin(payload.pinId)
    if not pin:
        raise HTTPException(status_code=404, detail="pin not found")

    seller = (payload.toOwner or "").strip()
    buyer = (payload.fromOwner or "").strip()

    if not seller or not buyer:
        raise HTTPException(status_code=400, detail="missing participants")
    if seller.lower() == buyer.lower():
        raise HTTPException(status_code=400, detail="cannot offer to self")

    if (pin.get("owner") or "").lower() != seller.lower():
        raise HTTPException(status_code=409, detail="pin owner changed")

    amount = int(payload.amount)
    if amount < MIN_OFFER:
        raise HTTPException(status_code=400, detail="amount below minimum")

    # lock pin if another pending exists
    if LOCK_PIN_ON_PENDING:
        for o in _load_offers():
            if (
                str(o.get("pinId")) == payload.pinId
                and _normalize_status(o.get("status")) == "PENDING"
            ):
                raise HTTPException(status_code=409, detail="pin has a pending offer")

    offer_id = uuid.uuid4().hex

    # move funds into escrow
    try:
        escrow_hold(offer_id, buyer=buyer, amount=amount)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="escrow hold failed")

    now = _now_ms()
    exp = now + EXP_HRS * 3600 * 1000

    offer = {
        "id": offer_id,
        "pinId": payload.pinId,
        "fromOwner": buyer,
        "toOwner": seller,
        "amount": amount,
        "status": "PENDING",
        "createdAt": now,
        "expiresAt": exp,
        "note": payload.note or "",
        "history": [{"t": now, "a": "CREATED"}],
    }

    items = _load_offers()
    items.insert(0, offer)
    _save_offers(items)

    _append_event(
        "Offer Created",
        f"{buyer} → {seller} (pin {payload.pinId}) £{amount}",
    )

    return offer


# ---------- accept ----------
@router.post("/{offer_id}/accept", response_model=OfferOut)
def accept_offer(offer_id: str):
    items = _load_offers()
    _gc_expire(items)

    for o in items:
        if str(o.get("id")) != str(offer_id):
            continue

        st = _normalize_status(o.get("status"))
        if st != "PENDING":
            raise HTTPException(
                status_code=409,
                detail=f"offer not pending (status={st})",
            )

        pin = _get_pin(o["pinId"])
        if not pin:
            # pin vanished → auto-refund + mark rejected
            try:
                escrow_refund(o["id"], o["fromOwner"])
            except Exception:
                pass
            o["status"] = "REJECTED"
            o.setdefault("history", []).append(
                {"t": _now_ms(), "a": "AUTO_REJECT_PIN_MISSING"}
            )
            _save_offers(items)
            raise HTTPException(status_code=404, detail="pin not found")

        if (pin.get("owner") or "").lower() != o["toOwner"].lower():
            # seller changed → auto-reject + refund
            try:
                escrow_refund(o["id"], o["fromOwner"])
            except Exception:
                pass
            o["status"] = "REJECTED"
            o.setdefault("history", []).append(
                {"t": _now_ms(), "a": "AUTO_REJECT_OWNER_CHANGED"}
            )
            _save_offers(items)
            raise HTTPException(
                status_code=409,
                detail="pin owner changed; offer auto-rejected",
            )

        # escrow payout → seller, then transfer pin
        try:
            net = escrow_payout(o["id"], o["toOwner"], fee_pct=FEE_PCT)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception:
            raise HTTPException(status_code=500, detail="escrow payout failed")

        _set_pin_owner(o["pinId"], o["fromOwner"])
        o["status"] = "ACCEPTED"
        o.setdefault("history", []).append(
            {"t": _now_ms(), "a": "ACCEPTED", "net": net}
        )

        _save_offers(items)
        _append_event(
            "Trade Accepted",
            f"{o['fromOwner']} bought pin {o['pinId']} for £{o['amount']} (net to seller £{net})",
        )
        return o

    raise HTTPException(status_code=404, detail="offer not found")


# ---------- reject ----------
@router.post("/{offer_id}/reject", response_model=OfferOut)
def reject_offer(offer_id: str):
    items = _load_offers()
    _gc_expire(items)

    for o in items:
        if str(o.get("id")) != str(offer_id):
            continue

        st = _normalize_status(o.get("status"))
        if st != "PENDING":
            raise HTTPException(
                status_code=409,
                detail=f"offer not pending (status={st})",
            )

        try:
            escrow_refund(o["id"], o["fromOwner"])
        except Exception:
            pass

        o["status"] = "REJECTED"
        o.setdefault("history", []).append({"t": _now_ms(), "a": "REJECTED"})

        _save_offers(items)
        _append_event(
            "Offer Rejected",
            f"{o['toOwner']} rejected £{o['amount']} on pin {o['pinId']}",
        )
        return o

    raise HTTPException(status_code=404, detail="offer not found")


# ---------- cancel (buyer) ----------
@router.post("/{offer_id}/cancel", response_model=OfferOut)
def cancel_offer(offer_id: str):
    items = _load_offers()
    _gc_expire(items)

    for o in items:
        if str(o.get("id")) != str(offer_id):
            continue

        st = _normalize_status(o.get("status"))
        if st != "PENDING":
            raise HTTPException(
                status_code=409,
                detail=f"offer not pending (status={st})",
            )

        try:
            escrow_refund(o["id"], o["fromOwner"])
        except Exception:
            pass

        o["status"] = "CANCELED"
        o.setdefault("history", []).append({"t": _now_ms(), "a": "CANCELED"})

        _save_offers(items)
        _append_event(
            "Offer Canceled",
            f"{o['fromOwner']} canceled £{o['amount']} on pin {o['pinId']}",
        )
        return o

    raise HTTPException(status_code=404, detail="offer not found")


# ---------- manual GC ----------
@router.post("/gc")
def gc_offers():
    items = _load_offers()
    expired = _gc_expire(items)
    return {"expired": expired}
