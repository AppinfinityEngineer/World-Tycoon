# wt_app/core/auth.py
import os, time, base64, json, hmac, hashlib
from fastapi import Request, HTTPException

SECRET = os.getenv("WT_JWT_SECRET", "")
ADMINS = {e.strip().lower() for e in os.getenv("WT_ADMIN_EMAILS", "").split(",") if e.strip()}

def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def _b64url_dec(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)

def verify_jwt(token: str) -> dict:
    try:
        header_b64, payload_b64, sig_b64 = token.split(".")
        body = f"{header_b64}.{payload_b64}".encode()
        sig = _b64url(hmac.new(SECRET.encode(), body, hashlib.sha256).digest())
        if not hmac.compare_digest(sig, sig_b64):
            raise ValueError("bad signature")
        payload = json.loads(_b64url_dec(payload_b64))
        if "exp" in payload and time.time() > payload["exp"]:
            raise ValueError("token expired")
        return payload
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token")

def actor_from_request(request: Request) -> dict:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    payload = verify_jwt(auth.split(" ",1)[1])
    email = (payload.get("email") or payload.get("sub") or "").lower().strip()
    if not email:
        raise HTTPException(status_code=401, detail="Token missing email/sub")
    return {
        "email": email,
        "is_admin": email in ADMINS,
        "payload": payload
    }

def require_admin(actor: dict):
    if not actor["is_admin"]:
        raise HTTPException(status_code=403, detail="Admin only")
