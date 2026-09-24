"""Authentication helpers for customer-owned AI chat sessions."""
import re
from typing import Optional

import jwt
from fastapi import HTTPException


_ANON_SESSION_RE = re.compile(
    r"^anon-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def authorize_session(session_id: str, authorization: Optional[str]) -> Optional[str]:
    """Return the verified actor id, or None for a random guest session."""
    session_id = str(session_id or "").strip()
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    if session_id.lower().startswith("anon-"):
        if not _ANON_SESSION_RE.fullmatch(session_id):
            raise HTTPException(status_code=400, detail="Invalid guest session id")
        if authorization:
            raise HTTPException(status_code=403, detail="Guest sessions cannot use an account token")
        return None

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Please sign in to use this chat session")

    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Invalid access token")

    secret = __import__("os").environ.get("JWT_SECRET", "avengers-jwt-secret")
    try:
        claims = jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Access token is invalid or expired") from exc

    actor_id = str(claims.get("sub") or "").strip()
    if not actor_id or actor_id != session_id:
        raise HTTPException(status_code=403, detail="This chat session belongs to another account")
    return actor_id
