# wt_app/api/settings.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator
from pathlib import Path
import json, time
from typing import Optional

router = APIRouter(prefix="/settings", tags=["settings"])

DATA = Path("data"); DATA.mkdir(exist_ok=True)
FILE = DATA / "settings.json"

def _now_ms() -> int:
    return int(time.time() * 1000)

def _read() -> dict:
    if not FILE.exists():
        # default: season starts today, ends in 14 days
        now = _now_ms()
        return {"seasonStart": now, "seasonEnd": now + 14 * 24 * 3600 * 1000}
    try:
        return json.loads(FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}

def _write(obj: dict) -> None:
    FILE.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

class SeasonIn(BaseModel):
    seasonStart: Optional[int] = None  # ms epoch
    seasonEnd:   Optional[int] = None  # ms epoch

    @field_validator("seasonStart", "seasonEnd")
    @classmethod
    def non_negative(cls, v):
        if v is not None and v < 0:
            raise ValueError("must be >= 0 ms")
        return v

class SeasonOut(BaseModel):
    seasonStart: int
    seasonEnd: int
    nowMs: int

@router.get("/season", response_model=SeasonOut)
def get_season():
    s = _read()
    start = int(s.get("seasonStart") or 0)
    end = int(s.get("seasonEnd") or 0)
    if not start or not end:
        # initialize if missing
        now = _now_ms()
        start = now
        end = now + 14 * 24 * 3600 * 1000
        _write({"seasonStart": start, "seasonEnd": end})
    return SeasonOut(seasonStart=start, seasonEnd=end, nowMs=_now_ms())

@router.put("/season", response_model=SeasonOut)
def put_season(payload: SeasonIn):
    cur = _read()
    start = int(payload.seasonStart if payload.seasonStart is not None else cur.get("seasonStart") or 0)
    end   = int(payload.seasonEnd   if payload.seasonEnd   is not None else cur.get("seasonEnd")   or 0)
    if start <= 0 or end <= 0:
        raise HTTPException(status_code=400, detail="seasonStart and seasonEnd must be > 0 ms")
    if start >= end:
        raise HTTPException(status_code=400, detail="seasonStart must be before seasonEnd")
    _write({"seasonStart": start, "seasonEnd": end})
    return SeasonOut(seasonStart=start, seasonEnd=end, nowMs=_now_ms())
