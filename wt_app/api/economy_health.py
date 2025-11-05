from __future__ import annotations
from fastapi import APIRouter
from pydantic import BaseModel, Field
from pathlib import Path as FsPath
from typing import Dict
import os, json, time

router = APIRouter(prefix="/economy", tags=["economy"])

DATA = FsPath("data"); DATA.mkdir(exist_ok=True)
ECO_FILE = DATA / "economy.json"


def _interval_sec() -> int:
    """Auto-tick interval (seconds), default 5 minutes, env override WT_AUTO_TICK_MIN."""
    try:
        return int(float(os.getenv("WT_AUTO_TICK_MIN", "5")) * 60)
    except Exception:
        return 5 * 60


def _read_economy_raw() -> dict:
    if not ECO_FILE.exists():
        return {}
    try:
        return json.loads(ECO_FILE.read_text(encoding="utf-8")) or {}
    except Exception:
        return {}


def _normalize_last_tick_ms(raw: dict) -> int:
    """
    Support any of:
      - lastTick (ms)
      - last_tick_ms (ms)
      - last_tick (sec or ms)
    Returns epoch ms (int).
    """
    if "lastTick" in raw:
        v = int(raw.get("lastTick") or 0)
        # treat as ms
        return v

    if "last_tick_ms" in raw:
        v = int(raw.get("last_tick_ms") or 0)
        return v

    if "last_tick" in raw:
        v = int(raw.get("last_tick") or 0)
        # if it's small, assume seconds and convert to ms
        return v if v > 10_000_000_000 else v * 1000

    return 0


class HealthOut(BaseModel):
    lastTickTs: int = 0                 # epoch ms
    nextTickTs: int = 0                 # epoch ms
    intervalSec: int = Field(default_factory=_interval_sec)
    balances: Dict[str, int] = Field(default_factory=dict)


@router.get("/health", response_model=HealthOut)
def economy_health() -> HealthOut:
    raw = _read_economy_raw()

    # balances can be in any case; normalize keys to lowercase emails
    balances = raw.get("balances") or raw.get("BALANCES") or {}
    norm_bal = {str(k).lower(): int(v) for (k, v) in (balances or {}).items()}

    last_tick_ms = _normalize_last_tick_ms(raw)

    interval = _interval_sec()
    interval_ms = int(interval) * 1000
    now_ms = int(time.time() * 1000)

    next_tick_ms = last_tick_ms + interval_ms if last_tick_ms else 0

    # Ensure the 'next' is always in the future so the UI countdown never freezes at 00:00
    if next_tick_ms and next_tick_ms <= now_ms:
        next_tick_ms = now_ms + interval_ms

    return HealthOut(
        lastTickTs=last_tick_ms,
        nextTickTs=next_tick_ms,
        intervalSec=interval,
        balances=norm_bal,
    )
