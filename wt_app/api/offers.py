from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel, Field
from typing import List, Literal, Optional
from pathlib import Path
import json, time, uuid

router = APIRouter(prefix="/offers", tags=["offers"])

DATA = Path("data"); DATA.mkdir(exist_ok=True)
FILE = DATA / "offers.json"

class OfferIn(BaseModel):
    pinId: str
    fromOwner: str
    toOwner: str
    amount: int
    expiresAt: Optional[int] = None  # ms epoch

class Offer(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    pinId: str
    fromOwner: str
    toOwner: str
    amount: int
    status: Literal["open","accepted","declined","expired"] = "open"
    createdAt: int = Field(default_factory=lambda: int(time.time()*1000))
    expiresAt: Optional[int] = None

def _read() -> List[Offer]:
    if not FILE.exists(): return []
    try:
        raw = json.loads(FILE.read_text("utf-8"))
        return [Offer(**r) for r in raw if isinstance(r, dict)]
    except Exception:
        return []

def _write(items: List[Offer]) -> None:
    FILE.write_text(json.dumps([o.model_dump() for o in items], ensure_ascii=False, indent=2), "utf-8")

def _now_ms() -> int:
    return int(time.time()*1000)

@router.get("", response_model=List[Offer])
def list_offers(pinId: Optional[str] = None, owner: Optional[str] = None, status: Optional[str] = None):
    items = _read()
    now = _now_ms()
    changed = False
    for o in items:
        if o.status == "open" and o.expiresAt and now > o.expiresAt:
            o.status = "expired"; changed = True
    if changed: _write(items)

    if pinId:
        items = [o for o in items if o.pinId == pinId]
    if owner:
        items = [o for o in items if o.toOwner == owner or o.fromOwner == owner]
    if status:
        items = [o for o in items if o.status == status]
    items.sort(key=lambda x: x.createdAt, reverse=True)
    return items

@router.post("", response_model=Offer)
def create_offer(payload: OfferIn):
    if payload.amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    if payload.fromOwner == payload.toOwner:
        raise HTTPException(400, "Cannot make an offer to yourself")
    o = Offer(**payload.model_dump())
    items = _read()
    items.append(o)
    _write(items)
    return o

class OfferAction(BaseModel):
    action: Literal["accept","decline"]

@router.patch("/{offer_id}", response_model=Offer)
def act_on_offer(offer_id: str, body: OfferAction = Body(...)):
    items = _read()
    for i,o in enumerate(items):
        if o.id == offer_id:
            if o.status != "open":
                raise HTTPException(409, f"Offer already {o.status}")
            if body.action == "accept":
                o.status = "accepted"
                # Phase 2: transfer ownership + move balances
            elif body.action == "decline":
                o.status = "declined"
            items[i] = o
            _write(items)
            return o
    raise HTTPException(404, "Offer not found")
