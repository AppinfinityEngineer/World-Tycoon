# wt_app/api/offers.py
from __future__ import annotations
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from pathlib import Path
import json, time, uuid

router = APIRouter(prefix="/offers", tags=["offers"])

DATA = Path("data"); DATA.mkdir(exist_ok=True)
FILE = DATA / "offers.json"
MAX_OFFERS = 500

class OfferIn(BaseModel):
    pinId: str
    fromOwner: str
    toOwner: str
    amount: int = Field(ge=1)

class OfferOut(OfferIn):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    t: int  = Field(default_factory=lambda: int(time.time() * 1000))  # createdAt ms
    status: Literal["pending","accepted","declined","withdrawn"] = "pending"

def _read() -> List[OfferOut]:
    if not FILE.exists(): return []
    try:
        raw = json.loads(FILE.read_text(encoding="utf-8"))
    except Exception:
        return []
    out: List[OfferOut] = []
    if isinstance(raw, list):
        for r in raw:
            if isinstance(r, dict):
                try:
                    out.append(OfferOut(**r))
                except Exception:
                    pass
    return out

def _write(items: List[OfferOut]) -> None:
    FILE.write_text(json.dumps([o.model_dump() for o in items], ensure_ascii=False, indent=2), encoding="utf-8")

@router.post("", response_model=OfferOut)
def create_offer(payload: OfferIn):
    items = _read()
    o = OfferOut(**payload.model_dump())
    items.append(o)
    items.sort(key=lambda x: x.t, reverse=True)
    items = items[:MAX_OFFERS]
    _write(items)
    return o

@router.get("", response_model=List[OfferOut])
def list_offers(
    owner: Optional[str] = Query(None),
    role: Optional[Literal["from","to","any"]] = Query(None, description="filter by role relative to owner"),
    status: Optional[str] = Query(None),  # e.g. pending
):
    items = _read()
    if owner:
        if role == "from":
            items = [o for o in items if o.fromOwner == owner]
        elif role == "to":
            items = [o for o in items if o.toOwner == owner]
        else:
            items = [o for o in items if o.fromOwner == owner or o.toOwner == owner]
    if status:
        items = [o for o in items if o.status == status]
    items.sort(key=lambda x: x.t, reverse=True)
    return items

class OfferAction(BaseModel):
    action: Literal["accept","decline","withdraw"]

@router.patch("/{offer_id}", response_model=OfferOut)
def act_on_offer(offer_id: str, payload: OfferAction):
    items = _read()
    for i, o in enumerate(items):
        if o.id == offer_id:
            if o.status != "pending":
                raise HTTPException(status_code=409, detail=f"Offer already {o.status}")
            if payload.action == "accept":
                o.status = "accepted"
            elif payload.action == "decline":
                o.status = "declined"
            elif payload.action == "withdraw":
                o.status = "withdrawn"
            items[i] = o
            _write(items)
            return o
    raise HTTPException(status_code=404, detail="Offer not found")
