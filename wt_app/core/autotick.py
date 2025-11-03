# wt_app/core/autotick.py
import asyncio, json, os, time
from pathlib import Path
from typing import Optional
import asyncio


DATA = Path("data"); DATA.mkdir(exist_ok=True)
LOCKS = DATA / "locks"; LOCKS.mkdir(exist_ok=True)
ECO_FILE = DATA / "economy.json"
LOCK_FILE = LOCKS / "economy.lock"

def _read_json(path: Path, default):
    if not path.exists(): return default
    try: return json.loads(path.read_text(encoding="utf-8"))
    except Exception: return default

def _write_json(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")

def _now_ms() -> int: return int(time.time() * 1000)

def get_interval_seconds() -> int:
    # env override, default 5 minutes
    return int(float(os.getenv("WT_AUTO_TICK_MIN", "5")) * 60)

def _economy_last_tick_ms() -> int:
    eco = _read_json(ECO_FILE, {})
    return int(eco.get("lastTick") or 0)

def _lock_is_stale(max_age_sec: int) -> bool:
    if not LOCK_FILE.exists(): return True
    try:
        age = time.time() - LOCK_FILE.stat().st_mtime
        return age > max_age_sec
    except Exception:
        return True

def _acquire_lock() -> bool:
    # naive file lock for single host dev; fine for our stage
    try:
        if not _lock_is_stale(600):  # 10 min stale threshold
            return False
        LOCK_FILE.write_text(str(time.time()), encoding="utf-8")
        return True
    except Exception:
        return False

def _release_lock() -> None:
    try:
        if LOCK_FILE.exists(): LOCK_FILE.unlink(missing_ok=True)
    except Exception:
        pass

async def _run_tick(client_post) -> Optional[dict]:
    try:
        res = client_post()
        if asyncio.iscoroutine(res):
            return await res
        return res
    except Exception:
        return None

async def start_auto_tick(app):
    """
    Background loop: every WT_AUTO_TICK_MIN minutes, if enough time
    passed since economy.lastTick, call /economy/tick.
    """
    await asyncio.sleep(2)  # small delay to let startup settle

    from wt_app.api.economy import tick as economy_tick

    async def post_tick():
        return economy_tick()

    while True:
        try:
            interval = get_interval_seconds()
            now = _now_ms()
            last = _economy_last_tick_ms()
            if last == 0 or (now - last) >= interval * 1000:
                if _acquire_lock():
                    try:
                        await _run_tick(post_tick)
                    finally:
                        _release_lock()
        except Exception:
            _release_lock()
        await asyncio.sleep(5)

