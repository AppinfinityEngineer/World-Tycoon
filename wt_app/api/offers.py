from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Body
from fastapi import Path as ApiPath
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from pathlib import Path as FsPath
import json, time, uuid

router = APIRouter(prefix="/offers", tags=["offers"])

DATA_DIR = FsPath("data"); DATA_DIR.mkdir(exist_ok=True)
OFFERS_FILE = DATA_DIR / "offers.json"

try:
    from wt_app.api.events import EventIn, add_event  # route function is fine to call
except Exception:
    add_event = None


class OfferIn(BaseModel):
    pinId: str
    fromOwner: str
    toOwner: str
    amount: int

class OfferOut(OfferIn):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    t: int = Field(default_factory=lambda: int(time.time() * 1000))
    status: Literal["pending", "accepted", "rejected", "cancelled"] = "pending"

class OfferAction(BaseModel):
    action: Literal["accept", "reject", "cancel"]
    actor: Optional[str] = None


def _read() -> List[OfferOut]:
    if not OFFERS_FILE.exists():
        return []
    try:
        raw = json.loads(OFFERS_FILE.read_text(encoding="utf-8"))
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
    OFFERS_FILE.write_text(
        json.dumps([o.model_dump() for o in items], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


# ---------- routes ----------
@router.get("", response_model=list[OfferOut])
def list_offers(owner: Optional[str] = Query(None)):
    items = _read()
    if owner:
        items = [o for o in items if o.fromOwner == owner or o.toOwner == owner]
    items.sort(key=lambda o: int(o.t), reverse=True)
    return items

@router.post("", response_model=OfferOut)
def create_offer(payload: OfferIn):
    items = _read()
    off = OfferOut(**payload.model_dump())
    items.append(off)
    items.sort(key=lambda o: int(o.t), reverse=True)
    _write(items)

    if add_event:
        try:
            add_event(EventIn(
                type="Offer Sent — Global", city="",
                note=f"{off.fromOwner} offered {off.amount} for pin {off.pinId} (to {off.toOwner})",
                cdMins=0,
            ))
        except Exception:
            pass
    return off

@router.patch("/{offer_id}", response_model=OfferOut)
def patch_offer(
    offer_id: str = ApiPath(...),
    payload: OfferAction = Body(...),
):
    items = _read()
    try:
        idx = next(i for i, o in enumerate(items) if o.id == offer_id)
    except StopIteration:
        raise HTTPException(status_code=404, detail="Offer not found")
    off = items[idx]

    if off.status != "pending":
        raise HTTPException(status_code=400, detail="Offer already resolved")

    action = payload.action

    if action == "accept":
        # 1) Move money first (buyer -> seller)
        try:
            from wt_app.api.economy import transfer  # lazy import to avoid cycles
            transfer(off.fromOwner, off.toOwner, off.amount)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception:
            # unexpected store error
            raise HTTPException(status_code=500, detail="balance transfer failed")

        # 2) Mark offer accepted
        off.status = "accepted"
        _write(items)

        # 3) Transfer pin to buyer
        try:
            from wt_app.api.pins import _read as read_pins, _write as write_pins  # type: ignore
            pins = read_pins()
            for i, p in enumerate(pins):
                if getattr(p, "id", None) == off.pinId:
                    p.owner = off.fromOwner
                    pins[i] = p
                    break
            write_pins(pins)
        except Exception:
            pass

        # 4) Event
        if add_event:
            try:
                add_event(EventIn(
                    type="Trade Accepted — Global", city="",
                    note=f"{off.toOwner} sold pin {off.pinId} to {off.fromOwner} for {off.amount}",
                    cdMins=0,
                ))
            except Exception:
                pass

        return off

    if action == "reject":
        off.status = "rejected"
        _write(items)
        if add_event:
            try:
                add_event(EventIn(
                    type="Offer Rejected — Global", city="",
                    note=f"{off.toOwner} rejected {off.amount} for pin {off.pinId} from {off.fromOwner}",
                    cdMins=0,
                ))
            except Exception:
                pass
        return off

    if action == "cancel":
        off.status = "cancelled"
        _write(items)
        if add_event:
            try:
                add_event(EventIn(
                    type="Offer Cancelled — Global", city="",
                    note=f"{off.fromOwner} cancelled {off.amount} for pin {off.pinId}",
                    cdMins=0,
                ))
            except Exception:
                pass
        return off

    raise HTTPException(status_code=400, detail="Unknown action")
