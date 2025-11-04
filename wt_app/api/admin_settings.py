from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
import time

from wt_app.core.security import require_admin
from wt_app.core.settings_store import read_verified, write_atomic, list_versions, read_version

router = APIRouter(prefix="/settings", tags=["admin"])

class SettingsModel(BaseModel):
    seasonStart: int
    seasonEnd: int
    signups_open: bool = True
    autoTickMin: int = 5  # 1..60

    @field_validator("seasonEnd")
    @classmethod
    def _validate_window(cls, v, info):
        start = info.data.get("seasonStart")
        if start is None:
            return v
        if v <= start:
            raise ValueError("seasonEnd must be > seasonStart")
        # guardrails: max 120 days
        if (v - start) > 120 * 24 * 3600 * 1000:
            raise ValueError("season length too long")
        return v

    @field_validator("autoTickMin")
    @classmethod
    def _tick_bounds(cls, v):
        if not (1 <= int(v) <= 60):
            raise ValueError("autoTickMin must be 1..60")
        return int(v)

@router.get("", dependencies=[Depends(require_admin)])
def get_settings():
    return read_verified()

@router.put("", dependencies=[Depends(require_admin)])
def put_settings(payload: SettingsModel):
    cur = read_verified()
    new = {**cur, **payload.model_dump()}
    version = write_atomic(new)
    return {"version": version, "settings": new}

@router.get("/versions", dependencies=[Depends(require_admin)])
def get_versions():
    return {"versions": list_versions()}

@router.post("/rollback/{version}", dependencies=[Depends(require_admin)])
def rollback(version: str):
    name = version if version.endswith(".json") else f"settings_{version}.json"
    try:
        obj, _ = read_version(name)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    ver = write_atomic(obj)
    return {"version": ver, "settings": obj}
