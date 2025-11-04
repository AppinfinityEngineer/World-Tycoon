# wt_app/api/events.py
from __future__ import annotations
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from pathlib import Path
import json, time, uuid

router = APIRouter(prefix="/events", tags=["events"])

DATA_DIR = Path("data"); DATA_DIR.mkdir(exist_ok=True)
FILE = DATA_DIR / "events.json"

MAX_EVENTS = 100  # persist last 100 only

# ---------- models ----------

class EventIn(BaseModel):
    type: str
    city: str
    note: Optional[str] = None
    cdMins: int = Field(default=45, ge=0, le=600)  # cooldown minutes (UI shows countdown)

class EventOut(EventIn):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    t: int = Field(default_factory=lambda: int(time.time() * 1000))  # createdAt ms

class PageOut(BaseModel):
    total: int
    next_offset: Optional[int] = None
    items: List[EventOut]

# ---------- storage helpers ----------

def _read() -> List[EventOut]:
    if not FILE.exists():
        return []
    try:
        raw = json.loads(FILE.read_text(encoding="utf-8"))
    except Exception:
        return []
    out: List[EventOut] = []
    if isinstance(raw, list):
        for r in raw:
            if isinstance(r, dict):
                try:
                    out.append(EventOut(**r))
                except Exception:
                    # skip malformed row
                    pass
    return out

def _write(items: List[EventOut]) -> None:
    FILE.write_text(
        json.dumps([e.model_dump() for e in items], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

# ---------- routes ----------

@router.get("", response_model=PageOut)
def list_events(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    items = _read()
    # newest first
    items.sort(key=lambda r: int(r.t), reverse=True)

    total = len(items)
    page = items[offset : offset + limit]
    next_offset: Optional[int] = None
    if offset + limit < total:
        next_offset = offset + limit

    return PageOut(total=total, next_offset=next_offset, items=page)

@router.post("", response_model=EventOut)
def add_event(payload: EventIn):
    items = _read()
    ev = EventOut(**payload.model_dump())
    items.append(ev)
    # keep newest MAX_EVENTS
    items.sort(key=lambda r: int(r.t), reverse=True)
    items = items[:MAX_EVENTS]
    _write(items)
    return ev

@router.delete("", status_code=204)
def clear_events():
    _write([])
    return
