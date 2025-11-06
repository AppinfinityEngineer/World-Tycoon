from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from wt_app.api.economy import get_balance, adjust_balance, DATA

router = APIRouter(prefix="/streets", tags=["streets"])

STREETS_FILE = DATA / "streets.json"
PINS_FILE = DATA / "pins.json"


# ---------- helpers ----------

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


def _load_streets() -> List[dict]:
    raw = _read_json(STREETS_FILE, [])
    return [s for s in raw if isinstance(s, dict)]


def _save_streets(items: List[dict]) -> None:
    _write_json(STREETS_FILE, items)


def _load_pins() -> List[dict]:
    raw = _read_json(PINS_FILE, [])
    return [p for p in raw if isinstance(p, dict)]


def _save_pins(items: List[dict]) -> None:
    _write_json(PINS_FILE, items)


# ---------- models ----------

class Street(BaseModel):
    id: str
    name: str
    price: int = 1000
    slots: int = 10
    coords: List[List[float]] = Field(default_factory=list)
    owner: Optional[str] = None


class StreetOut(Street):
    pass


class StreetClaimIn(BaseModel):
    streetId: str = Field(..., min_length=1)
    buyer: str = Field(..., min_length=1)


# ---------- geometry helper ----------

def _generate_slots(street: dict) -> List[dict]:
    coords = street.get("coords") or []
    pts = []
    for c in coords:
        if isinstance(c, (list, tuple)) and len(c) >= 2:
            pts.append((float(c[0]), float(c[1])))

    if not pts:
        return []

    n = int(street.get("slots") or 10)
    n = max(1, n)

    if len(pts) == 1 or n == 1:
        lat, lng = pts[0]
        return [{
            "id": uuid.uuid4().hex,
            "lat": lat,
            "lng": lng,
            "color": "#22c55e",
            "owner": None,
            "type": None,
            "level": 1,
            "streetId": street["id"],
            "streetName": street["name"],
            "createdAt": _now_ms(),
        }]

    segs = []
    total = 0.0
    for i in range(len(pts) - 1):
        (lat1, lng1), (lat2, lng2) = pts[i], pts[i + 1]
        d = ((lat2 - lat1) ** 2 + (lng2 - lng1) ** 2) ** 0.5
        if d <= 0:
            continue
        segs.append((lat1, lng1, lat2, lng2, d))
        total += d

    if not segs or total <= 0:
        lat, lng = pts[0]
        return [{
            "id": uuid.uuid4().hex,
            "lat": lat,
            "lng": lng,
            "color": "#22c55e",
            "owner": None,
            "type": None,
            "level": 1,
            "streetId": street["id"],
            "streetName": street["name"],
            "createdAt": _now_ms(),
        }]

    slots: List[dict] = []
    for i in range(n):
        t = i / max(1, n - 1)
        target = t * total
        acc = 0.0
        for (lat1, lng1, lat2, lng2, d) in segs:
            if acc + d >= target:
                local = (target - acc) / d
                lat = lat1 + (lat2 - lat1) * local
                lng = lng1 + (lng2 - lng1) * local
                slots.append({
                    "id": uuid.uuid4().hex,
                    "lat": lat,
                    "lng": lng,
                    "color": "#22c55e",
                    "owner": None,
                    "type": None,
                    "level": 1,
                    "streetId": street["id"],
                    "streetName": street["name"],
                    "createdAt": _now_ms(),
                })
                break
            acc += d

    return slots


# ---------- routes ----------

@router.get("", response_model=List[StreetOut])
def list_streets():
    return _load_streets()


@router.post("/claim", response_model=StreetOut)
def claim_street(payload: StreetClaimIn):
    streets = _load_streets()
    street = next((s for s in streets if s.get("id") == payload.streetId), None)
    if not street:
        raise HTTPException(status_code=404, detail="street not found")

    buyer = (payload.buyer or "").strip()
    if not buyer:
        raise HTTPException(status_code=400, detail="missing buyer")

    if street.get("owner"):
        raise HTTPException(status_code=409, detail="street already owned")

    price = int(street.get("price") or 0)
    if price > 0:
        bal = get_balance(buyer)
        if bal < price:
            raise HTTPException(status_code=400, detail="insufficient funds")
        adjust_balance(buyer, -price)

    street["owner"] = buyer

    pins = _load_pins()
    new_slots = _generate_slots(street)
    pins.extend(new_slots)
    _save_pins(pins)

    _save_streets(streets)

    return StreetOut(**street)
