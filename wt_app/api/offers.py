from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from pathlib import Path
import json, time, uuid

router = APIRouter(prefix="/offers", tags=["offers"])

DATA = Path("data"); DATA.mkdir(exist_ok=True)
OFFERS_FILE = DATA / "offers.json"
PINS_FILE   = DATA / "pins.json"
EVENTS_FILE = DATA / "events.json"

MAX_EVENTS = 100

# ------------------ models ------------------

class OfferIn(BaseModel):
    pinId: str
    fromOwner: str
    toOwner: str
    amount: int = Field(ge=1)

class OfferOut(OfferIn):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    t: int = Field(default_factory=lambda: int(time.time() * 1000))  # createdAt ms
    status: str = "pending"  # pending | accepted | declined | cancelled

class OfferAction(BaseModel):
    action: str  # "accept" | "decline" | "cancel"

# ------------------ storage helpers ------------------

def _read_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default

def _write_json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

def _read_offers() -> List[Dict[str, Any]]:
    raw = _read_json(OFFERS_FILE, [])
    return [r for r in raw if isinstance(r, dict)]

def _write_offers(items: List[Dict[str, Any]]) -> None:
    _write_json(OFFERS_FILE, items)

def _read_pins() -> List[Dict[str, Any]]:
    raw = _read_json(PINS_FILE, [])
    return [r for r in raw if isinstance(r, dict)]

def _write_pins(items: List[Dict[str, Any]]) -> None:
    _write_json(PINS_FILE, items)

def _append_event(ev: Dict[str, Any]) -> None:
    items = _read_json(EVENTS_FILE, [])
    if not isinstance(items, list):
        items = []
    items.append(ev)
    # newest first, keep last MAX_EVENTS
    try:
        items.sort(key=lambda r: int(r.get("t", 0)), reverse=True)
    except Exception:
        pass
    _write_json(EVENTS_FILE, items[:MAX_EVENTS])

# ------------------ routes ------------------

@router.get("", response_model=List[OfferOut])
def list_offers(owner: Optional[str] = Query(None), role: Optional[str] = Query(None)):
    """
    List offers. Optional filters:
      - owner=EMAIL (matches either fromOwner or toOwner unless role provided)
      - role=sent|received (used with owner)
    """
    items = _read_offers()
    # normalize structure (ensure required keys exist)
    out: List[OfferOut] = []
    for r in items:
        try:
            out.append(OfferOut(**r))
        except Exception:
            # skip malformed
            pass

    if owner:
        o = owner.strip()
        if role == "sent":
            out = [x for x in out if x.fromOwner == o]
        elif role == "received":
            out = [x for x in out if x.toOwner == o]
        else:
            out = [x for x in out if x.fromOwner == o or x.toOwner == o]

    # newest first
    out.sort(key=lambda r: int(r.t), reverse=True)
    return out

@router.post("", response_model=OfferOut)
def create_offer(payload: OfferIn):
    items = _read_offers()
    offer = OfferOut(**payload.model_dump())
    items.append(offer.model_dump())
    _write_offers(items)

    # optional: log an event "Offer Sent"
    _append_event({
        "id": uuid.uuid4().hex,
        "t": int(time.time() * 1000),
        "type": "Offer Sent",
        "city": "Global",
        "note": f'{offer.fromOwner} offered {offer.amount} for pin {offer.pinId[:8]} (to {offer.toOwner})',
        "cdMins": 0
    })

    return offer

@router.patch("/{offer_id}", response_model=OfferOut)
def mutate_offer(offer_id: str, body: OfferAction):
    action = (body.action or "").lower().strip()
    if action not in {"accept", "decline", "cancel"}:
        raise HTTPException(status_code=400, detail="Invalid action")

    items = _read_offers()
    idx = next((i for i, r in enumerate(items) if r.get("id") == offer_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Offer not found")

    offer = OfferOut(**items[idx])  # validate/normalize

    if offer.status != "pending":
        # idempotent-ish: return existing state
        return offer

    # mutate status
    if action == "accept":
        offer.status = "accepted"
        # ---- GAME STATE WIRING ----
        # 1) transfer pin owner -> fromOwner (buyer)
        pins = _read_pins()
        changed = False
        for p in pins:
            if (p.get("id") or "") == offer.pinId:
                p["owner"] = offer.fromOwner
                changed = True
                break
        if changed:
            _write_pins(pins)

        # 2) add event
        _append_event({
            "id": uuid.uuid4().hex,
            "t": int(time.time() * 1000),
            "type": "Trade Accepted",
            "city": "Global",
            "note": f'{offer.toOwner} sold pin {offer.pinId[:8]} to {offer.fromOwner} for {offer.amount}',
            "cdMins": 0
        })

        # 3) (optional) update balances/ledger here later
        #    e.g. debit offer.fromOwner / credit offer.toOwner

    elif action == "decline":
        offer.status = "declined"
        _append_event({
            "id": uuid.uuid4().hex,
            "t": int(time.time() * 1000),
            "type": "Offer Declined",
            "city": "Global",
            "note": f'{offer.toOwner} declined offer {offer.id[:8]} for pin {offer.pinId[:8]}',
            "cdMins": 0
        })
    else:  # cancel
        offer.status = "cancelled"
        _append_event({
            "id": uuid.uuid4().hex,
            "t": int(time.time() * 1000),
            "type": "Offer Cancelled",
            "city": "Global",
            "note": f'{offer.fromOwner} cancelled offer {offer.id[:8]} for pin {offer.pinId[:8]}',
            "cdMins": 0
        })

    # persist
    items[idx] = offer.model_dump()
    _write_offers(items)
    return offer
