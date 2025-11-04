import json, os, time, hmac, hashlib
from pathlib import Path
from typing import Tuple

DATA = Path("data")
DATA.mkdir(exist_ok=True)
SETTINGS = DATA / "settings.json"
SIG = DATA / "settings.sig"
VERSIONS = DATA / "settings_versions"
VERSIONS.mkdir(exist_ok=True)

HMAC_KEY = os.getenv("WT_SETTINGS_HMAC_KEY", "dev-hmac-key").encode("utf-8")

def _digest(raw: bytes) -> str:
    return hmac.new(HMAC_KEY, raw, hashlib.sha256).hexdigest()

def read_verified() -> dict:
    if not SETTINGS.exists():
        # sensible defaults for phase 1
        return {
            "seasonStart": int(time.time() * 1000),
            "seasonEnd":   int(time.time() * 1000) + 30*24*3600*1000,
            "signups_open": True,
            "autoTickMin": 5,
        }
    raw = SETTINGS.read_bytes()
    sig = SIG.read_text(encoding="utf-8").strip() if SIG.exists() else ""
    if _digest(raw) != sig:
        raise RuntimeError("Settings signature mismatch")
    return json.loads(raw)

def _write_atomic_bytes(path: Path, data: bytes) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)

def write_atomic(obj: dict) -> str:
    raw = json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8")
    _write_atomic_bytes(SETTINGS, raw)
    SIG.write_text(_digest(raw), encoding="utf-8")

    ver = time.strftime("%Y%m%d_%H%M%S")
    (VERSIONS / f"settings_{ver}.json").write_bytes(raw)
    (VERSIONS / f"settings_{ver}.sig").write_text(_digest(raw), encoding="utf-8")
    return ver

def list_versions() -> list:
    return sorted([p.name for p in VERSIONS.glob("settings_*.json")])

def read_version(name: str) -> Tuple[dict, str]:
    p = VERSIONS / name
    s = VERSIONS / name.replace(".json", ".sig")
    raw = p.read_bytes()
    sig = s.read_text(encoding="utf-8").strip()
    if _digest(raw) != sig:
        raise RuntimeError("Archived settings signature mismatch")
    return json.loads(raw), sig
