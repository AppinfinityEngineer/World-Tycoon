from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List
from pathlib import Path
import json, time

router = APIRouter(prefix="/events", tags=["events"])

DATA_PATH = Path("data")
DATA_PATH.mkdir(exist_ok=True)
FILE = DATA_PATH / "events.json"

class EventIn(BaseModel):
    type: str
    city: str
    note: str = ""
    cdMins: int = Field(ge=0, default=0)

class Event(EventIn):
    t: int = Field(default_factory=lambda: int(time.time() * 1000))

def _read() -> List[Event]:
    if not FILE.exists():
        return []
    try:
        raw = json.loads(FILE.read_text(encoding="utf-8"))
        return [Event(**e) for e in raw if isinstance(e, dict)]
    except Exception:
        return []

def _write(items: List[Event]) -> None:
    FILE.write_text(
        json.dumps([e.model_dump() for e in items], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

@router.get("", response_model=List[Event])
def list_events():
    return _read()[::-1]

@router.post("", response_model=Event)
def add_event(payload: EventIn):
    items = _read()
    evt = Event(**payload.model_dump())
    items.append(evt)
    items = items[-200:]
    _write(items)
    return evt

@router.delete("")
def clear_events():
    _write([])
    return {"ok": True}
