"""V3.2 Gemini credential pool: bounded CREDENTIAL failover, never model or
semantic failover.

Primary = the Data Platform credential (GEMINI_API_KEY of the analytics
service). Secondary = an operator-injected credential
(DATA_ANALYST_GEMINI_SECONDARY_KEY), which deployment may map to the existing
Chatbot Gemini secret. Nothing here imports, calls or shares state with the
chatbot service; key values are never logged, returned or fingerprinted.

Policy (one logical semantic call):
  primary attempt → (only on a credential/transport failure) one secondary
  attempt with the SAME model and the SAME request body. No third attempt,
  no rotation, and a semantic/contract failure never switches credentials.
"""
import os
import threading
import time

# Failures where repeating the same request with another credential is
# reasonable. Everything else (bad request, invalid JSON, auth of the request
# shape, semantic rejection) is not a credential problem.
FAILOVER_CATEGORIES = {"provider_rate_limited", "provider_daily_quota", "provider_timeout",
                       "provider_connection", "provider_unavailable", "provider_http"}
RETRYABLE_HTTP = {429, 500, 502, 503, 504}
_COOLDOWN = {"provider_daily_quota": 600.0, "provider_rate_limited": 60.0}

_lock = threading.Lock()
_state = {"primary_cooldown_until": 0.0, "primary_probe_until":0.0, "last_failover_at": None, "last_category": None}


def _secondary_key():
    value = os.getenv("DATA_ANALYST_GEMINI_SECONDARY_KEY", "")
    # A comma-separated managed secret contributes its first account only.
    return next((k.strip() for k in value.split(",") if k.strip()), "")


def _primary_key():
    from services import llm_service
    return llm_service.GEMINI_API_KEY or ""


def secondary_configured():
    secondary = _secondary_key()
    return bool(secondary) and secondary != _primary_key()


def eligible(attempt):
    """True when this failed attempt may be repeated once with the secondary."""
    category = attempt.get("error_category")
    if category not in FAILOVER_CATEGORIES:
        return False
    status = attempt.get("http_status")
    return status is None or status in RETRYABLE_HTTP


def credential_plan():
    """Ordered credential slots for one logical call: [(slot, key), ...] (≤ 2)."""
    primary, secondary = _primary_key(), _secondary_key() if secondary_configured() else ""
    with _lock:
        now=time.monotonic()
        cooling = now < _state["primary_cooldown_until"]
        recovering=primary and _state['primary_cooldown_until']>0 and not cooling
        occupied=recovering and now<_state['primary_probe_until']
        if recovering and not occupied:
            from services.provider_budget import ATTEMPT_SECONDS
            # One lazy half-open probe, with a lease if a cancelled request
            # never reaches a transport outcome. No background paid traffic.
            _state['primary_probe_until']=now+ATTEMPT_SECONDS+1
    if (cooling or occupied) and secondary:
        # Primary is known quota-limited: go straight to the secondary (still 1 attempt).
        return [("secondary", secondary)]
    if (cooling or occupied) and primary:
        from services.analysis_catalog import AnalysisError
        raise AnalysisError('provider_rate_limited','Credential cooldown/probe in progress; no physical send')
    slots = [("primary", primary)] if primary else []
    if secondary:
        slots.append(("secondary", secondary))
    return slots


def record_failure(slot, attempt):
    if slot != "primary":
        return
    cooldown = _COOLDOWN.get(attempt.get("error_category"))
    with _lock:
        _state['primary_probe_until']=0.0
        if cooldown:
            _state["primary_cooldown_until"] = time.monotonic() + cooldown
            _state["last_category"] = attempt.get("error_category")


def record_success(slot):
    if slot=='primary':
        with _lock:
            # A healthy request sent before another request opened cooldown
            # cannot close that newer circuit. Only its half-open probe can.
            if _state['primary_cooldown_until']==0 or _state['primary_probe_until']>time.monotonic():
                _state.update(primary_cooldown_until=0.0,primary_probe_until=0.0,last_category=None)


def record_failover():
    with _lock:
        _state["last_failover_at"] = time.time()


def status():
    """Sanitized pool status for the UI badge. Never reveals which key is used."""
    with _lock:
        cooling = time.monotonic() < _state["primary_cooldown_until"]
        recent = _state["last_failover_at"] and time.time() - _state["last_failover_at"] < 300
        category = _state["last_category"]
    return {"secondary_configured": secondary_configured(), "primary_limited": cooling,
            "recent_failover": bool(recent), "limit_category": category if cooling else None}


def reset_for_tests():
    with _lock:
        _state.update(primary_cooldown_until=0.0,primary_probe_until=0.0,last_failover_at=None,last_category=None)
