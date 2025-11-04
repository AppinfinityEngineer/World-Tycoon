from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Body, Request, Depends
from fastapi import Path as ApiPath
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Literal
from pathlib import Path as FsPath
import json, time, uuid

from wt_app.core.security import get_current_user, CurrentUser

router = APIRouter(prefix="/offers", tags=["offers"])

DATA_DIR = FsPath("data"); DATA_DIR.mkdir(exist_ok=True)
OFFERS_FILE = DATA_DIR / "offers.json"

try:
    from wt_app.api.events import EventIn, add_event
except Exception:
    add_event = None


# ---------- models ----------
class OfferIn(BaseModel):
    pinId: str
    fromOwner: Optional[str] = None  # ignored server-side
    toOwner: str
    amount: int
    @field_validator("amount")
    @classmethod
    def non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("amount must be >= 0")
        return v

class OfferOut(BaseModel):
    pinId: str
    fromOwner: str
    toOwner: str
    amount: int
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    t: int = Field(default_factory=lambda: int(time.time() * 1000))
    status: Literal["pending", "accepted", "rejected", "cancelled"] = "pending"

class OfferAction(BaseModel):
    action: Literal["accept", "reject", "cancel"]

# 👇👇 Add this block right after the model classes
try:
    OfferIn.model_rebuild()
    OfferOut.model_rebuild()
    OfferAction.model_rebuild()
except Exception:
    # harmless if already built
    pass
# ☝️☝️ This ensures Pydantic resolves forward refs when FastAPI inspects annotations


# ---------- store helpers ----------
def _read_raw() -> list[dict]:
    if not OFFERS_FILE.exists():
        return []
    try:
        return json.loads(OFFERS_FILE.read_text(encoding="utf-8")) or []
    except Exception:
        return []


def _read() -> List[OfferOut]:
    raw = _read_raw()
    out: List[OfferOut] = []
    for r in raw:
        if isinstance(r, dict):
            try:
                # normalize on load
                if "fromOwner" in r and isinstance(r["fromOwner"], str):
                    r["fromOwner"] = r["fromOwner"].strip().lower()
                if "toOwner" in r and isinstance(r["toOwner"], str):
                    r["toOwner"] = r["toOwner"].strip().lower()
                out.append(OfferOut(**r))
            except Exception:
                pass
    return out


def _write(items: List[OfferOut]) -> None:
    OFFERS_FILE.write_text(
        json.dumps([o.model_dump() for o in items], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _emit(kind: str, note: str) -> None:
    if not add_event:
        return
    try:
        add_event(EventIn(type=kind, city="", note=note, cdMins=0))
    except Exception:
        pass


def _normalize_store_on_import() -> None:
    """One-time cleanup: trim/lower owner emails in the JSON file."""
    raw = _read_raw()
    changed = False
    for r in raw:
        if not isinstance(r, dict):
            continue
        fo = r.get("fromOwner")
        to = r.get("toOwner")
        new_fo = fo.strip().lower() if isinstance(fo, str) else fo
        new_to = to.strip().lower() if isinstance(to, str) else to
        if new_fo != fo or new_to != to:
            r["fromOwner"] = new_fo
            r["toOwner"] = new_to
            changed = True
    if changed:
        OFFERS_FILE.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding="utf-8")


_normalize_store_on_import()

async def _get_user_optional(request: Request) -> Optional[CurrentUser]:
    try:
        return await get_current_user(request)
    except HTTPException:
        return None
    
# ---------- routes ----------
@router.get("", response_model=List[OfferOut])
async def list_offers(
    owner: Optional[str] = Query(None),
    mine: Optional[int] = Query(0),
    user: Optional[CurrentUser] = Depends(_get_user_optional),
):
    items = _read()

    if mine:
        # only filter by "mine" if we actually have an authenticated user
        if not user:
            return []  # no auth → no mine results, and we avoid a 401
        me = ((user.email or user.sub) or "").strip().lower()
        items = [o for o in items if o.fromOwner == me or o.toOwner == me]
    elif owner:
        owner_lc = owner.strip().lower()
        items = [o for o in items if o.fromOwner == owner_lc or o.toOwner == owner_lc]

    items.sort(key=lambda o: int(o.t), reverse=True)
    return items


@router.post("", response_model=OfferOut)
def create_offer(
    payload: OfferIn,
    user: CurrentUser = Depends(get_current_user),
):
    items = _read()

    from_owner = ((user.email or user.sub) or "").strip().lower()
    to_owner = payload.toOwner.strip().lower()

    if not to_owner:
        raise HTTPException(status_code=400, detail="toOwner required")
    if not from_owner:
        raise HTTPException(status_code=401, detail="fromOwner required")
    if from_owner == to_owner:
        raise HTTPException(status_code=400, detail="cannot offer to self")

    off = OfferOut(
        pinId=payload.pinId,
        fromOwner=from_owner,
        toOwner=to_owner,
        amount=payload.amount,
    )
    items.append(off)
    items.sort(key=lambda o: int(o.t), reverse=True)
    _write(items)

    _emit("Offer Sent — Global", f"{off.fromOwner} offered {off.amount} for pin {off.pinId} (to {off.toOwner})")
    return off


@router.patch("/{offer_id}", response_model=OfferOut)
def patch_offer(
    offer_id: str = ApiPath(...),
    payload: OfferAction = Body(...),
    user: CurrentUser = Depends(get_current_user),
):
    items = _read()
    try:
        idx = next(i for i, o in enumerate(items) if o.id == offer_id)
    except StopIteration:
        raise HTTPException(status_code=404, detail="Offer not found")

    off = items[idx]

    if off.status != "pending":
        raise HTTPException(status_code=409, detail="Offer already resolved")

    action = payload.action
    me = (user.email or user.sub or "").strip().lower()
    off_from = (off.fromOwner or "").strip().lower()
    off_to = (off.toOwner or "").strip().lower()

    # ----- accept -----
    if action == "accept":
        if me != off_to and not user.is_admin:
            raise HTTPException(status_code=403, detail=f"Only receiver may accept (me={me}, toOwner={off_to})")

        # Validate receiver still owns the pin
        try:
            from wt_app.api.pins import _read as read_pins  # type: ignore
            pins = read_pins()
            pin_owner = None
            for p in pins:
                if getattr(p, "id", None) == off.pinId:
                    po = getattr(p, "owner", None)
                    pin_owner = (po or "").strip().lower() if isinstance(po, str) else po
                    break
            if pin_owner != off_to and not user.is_admin:
                raise HTTPException(
                    status_code=409,
                    detail=f"Ownership changed; cannot accept (pin_owner={pin_owner}, expected={off_to})",
                )
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=400, detail="Pin not found")

        # Money transfer (buyer -> seller): buyer is fromOwner, seller is toOwner
        try:
            from wt_app.api.economy import transfer  # lazy import
            transfer(off_from, off_to, off.amount)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception:
            raise HTTPException(status_code=500, detail="balance transfer failed")

        # Mark accepted
        off.status = "accepted"
        items[idx] = off
        _write(items)

        # Transfer pin to buyer (sender becomes owner)
        try:
            from wt_app.api.pins import _read as read_pins, _write as write_pins  # type: ignore
            pins = read_pins()
            for i, p in enumerate(pins):
                if getattr(p, "id", None) == off.pinId:
                    p.owner = off_from
                    pins[i] = p
                    break
            write_pins(pins)
        except Exception:
            pass

        _emit("Trade Accepted — Global", f"{off_to} sold pin {off.pinId} to {off_from} for {off.amount}")
        return off

    # ----- reject -----
    if action == "reject":
        if me != off_to and not user.is_admin:
            raise HTTPException(status_code=403, detail=f"Only receiver may reject (me={me}, toOwner={off_to})")
        off.status = "rejected"
        items[idx] = off
        _write(items)
        _emit("Offer Rejected — Global", f"{off_to} rejected {off.amount} for pin {off.pinId} from {off_from}")
        return off

    # ----- cancel -----
    if action == "cancel":
        if me != off_from and not user.is_admin:
            raise HTTPException(status_code=403, detail=f"Only sender may cancel (me={me}, fromOwner={off_from})")
        off.status = "cancelled"
        items[idx] = off
        _write(items)
        _emit("Offer Cancelled — Global", f"{off_from} cancelled {off.amount} for pin {off.pinId}")
        return off

    raise HTTPException(status_code=400, detail="Unknown action")
