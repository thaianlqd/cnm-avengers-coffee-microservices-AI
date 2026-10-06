"""Opaque browser ownership fallback; this is not authenticated account identity."""
import hashlib
import os
import re
import secrets
from fastapi import HTTPException

COOKIE = "analysis_browser"

def browser_owner(request, response):
    if request is None:  # Internal compatibility/test callers only.
        return None
    origin = request.headers.get("origin")
    allowed = {v.strip().rstrip("/") for v in os.getenv("DATA_ANALYST_ALLOWED_ORIGINS", "").split(",") if v.strip() and v.strip() != "*"}
    allowed.add(str(request.base_url).rstrip("/"))
    if origin and origin.rstrip("/") not in allowed:
        raise HTTPException(403, "Nguồn yêu cầu không hợp lệ.")
    token = request.cookies.get(COOKIE, "")
    if not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
        token = secrets.token_urlsafe(32)
        response.set_cookie(COOKIE, token, httponly=True, secure=request.url.scheme == "https", samesite="lax", path="/api/ai", max_age=31536000)
    return hashlib.sha256(token.encode()).hexdigest()
