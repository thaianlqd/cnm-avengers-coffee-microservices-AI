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
import json
from contextvars import ContextVar
from uuid import uuid4

# Failures where repeating the same request with another credential is
# reasonable. Everything else (bad request, invalid JSON, auth of the request
# shape, semantic rejection) is not a credential problem.
FAILOVER_CATEGORIES = {"provider_rate_limited", "provider_daily_quota", "provider_timeout",
                       "provider_connection", "provider_unavailable", "provider_http"}
RETRYABLE_HTTP = {429, 500, 502, 503, 504}
_COOLDOWN = {"provider_daily_quota": 600.0, "provider_rate_limited": 60.0}

_lock = threading.Lock()
_state = {"primary_cooldown_until": 0.0, "primary_probe_until":0.0, "last_failover_at": None, "last_category": None}
_probe = ContextVar('provider_circuit_probe', default=None)
_CIRCUIT_KEY = 'analyst:{provider-circuit}:gemini-primary'


_redis_client = None
_redis_url = None


def _shared_client():
    global _redis_client, _redis_url
    mode = os.getenv('DATA_ANALYST_SESSION_STORE', 'memory')
    production = os.getenv('DATA_ANALYST_ENV') == 'production'
    if mode == 'memory' and not production:
        return None
    from services.error_taxonomy import AnalysisError
    url = os.getenv('DATA_ANALYST_REDIS_URL', '')
    if mode != 'redis' or not url:
        raise AnalysisError('provider_unavailable', 'Shared credential circuit is required')
    try:
        import redis
        with _lock:
            if _redis_client is None or _redis_url != url:
                if _redis_client is not None:
                    _redis_client.close()
                _redis_client = redis.Redis.from_url(url, decode_responses=True,
                    socket_connect_timeout=2, socket_timeout=3, retry_on_timeout=False)
                _redis_url = url
            return _redis_client
    except Exception:
        raise AnalysisError('provider_unavailable', 'Shared credential circuit unavailable') from None


def _shared_transition(action, attempt=None):
    """Server-clock circuit under one Redis lock, fenced by the probe's token.

    No credential values or fingerprints enter Redis. Storage failure refuses
    transport; a private in-process circuit never replaces shared state.
    """
    client = _shared_client()
    if client is None:
        return None
    from services.error_taxonomy import AnalysisError
    try:
        with client.lock(_CIRCUIT_KEY + ':lock', timeout=5, blocking_timeout=2):
            seconds, micros = client.time()
            now = seconds + micros / 1_000_000
            raw = client.get(_CIRCUIT_KEY)
            state = json.loads(raw) if raw else {'until':0, 'probe_until':0, 'token':None,
                'generation':0, 'last_failover_at':None, 'category':None}
            cooling = now < state['until']
            occupied = state['until'] > 0 and now < state['probe_until']
            result = {'cooling':cooling, 'occupied':occupied}
            if action == 'plan':
                _probe.set(None)
                if state['until'] > 0 and not cooling and not occupied:
                    from services.provider_budget import ATTEMPT_SECONDS
                    token = uuid4().hex
                    state.update({'token':token, 'probe_until':now + ATTEMPT_SECONDS + 1})
                    _probe.set((state['generation'], token))
            elif action == 'failure':
                token = _probe.get()
                # An expired probe cannot reopen or alter its successor's circuit.
                owned = token == (state['generation'], state['token'])
                if token is None or owned:
                    cooldown = _COOLDOWN.get((attempt or {}).get('error_category'))
                    state.update(token=None, probe_until=0, generation=state['generation']+1)
                    if cooldown:
                        state.update(until=now+cooldown, category=attempt['error_category'])
            elif action == 'success':
                if _probe.get() == (state['generation'], state['token']) and state['token'] and now < state['probe_until']:
                    state.update(until=0, probe_until=0, token=None, category=None, generation=state['generation']+1)
            elif action == 'failover':
                state['last_failover_at'] = now
            elif action == 'status':
                return {'secondary_configured':secondary_configured(), 'primary_limited':cooling,
                    'recent_failover':bool(state['last_failover_at'] and now-state['last_failover_at'] < 300),
                    'limit_category':state['category'] if cooling else None}
            else:
                raise ValueError('Unknown circuit operation')
            # A Redis lease can expire while this process is paused. Compare
            # the exact prior state atomically before publishing a transition.
            acknowledged = client.eval("""
                if (redis.call('GET', KEYS[1]) or '') ~= ARGV[1] then return 0 end
                redis.call('SET', KEYS[1], ARGV[2], 'EX', 1200)
                return 1
            """, 1, _CIRCUIT_KEY, raw or '', json.dumps(state, separators=(',', ':')))
            if acknowledged != 1:
                raise AnalysisError('provider_unavailable', 'Credential circuit changed; no transport authorized')
            return result
    except AnalysisError:
        raise
    except Exception:
        raise AnalysisError('provider_unavailable', 'Shared credential circuit unavailable; no transport authorized') from None


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
    shared = _shared_transition('plan') if primary else None
    with _lock:
        now=time.monotonic()
        cooling = shared['cooling'] if shared is not None else now < _state["primary_cooldown_until"]
        recovering=primary and _state['primary_cooldown_until']>0 and not cooling
        occupied=shared['occupied'] if shared is not None else recovering and now<_state['primary_probe_until']
        if shared is None and recovering and not occupied:
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
    if _shared_transition('failure', attempt) is not None:
        return
    cooldown = _COOLDOWN.get(attempt.get("error_category"))
    with _lock:
        _state['primary_probe_until']=0.0
        if cooldown:
            _state["primary_cooldown_until"] = time.monotonic() + cooldown
            _state["last_category"] = attempt.get("error_category")


def record_success(slot):
    if slot=='primary':
        if _shared_transition('success') is not None:
            return
        with _lock:
            # A healthy request sent before another request opened cooldown
            # cannot close that newer circuit. Only its half-open probe can.
            if _state['primary_cooldown_until']==0 or _state['primary_probe_until']>time.monotonic():
                _state.update(primary_cooldown_until=0.0,primary_probe_until=0.0,last_category=None)


def record_failover():
    if _shared_transition('failover') is not None:
        return
    with _lock:
        _state["last_failover_at"] = time.time()


def status():
    """Sanitized pool status for the UI badge. Never reveals which key is used."""
    shared = _shared_transition('status')
    if shared is not None:
        return shared
    with _lock:
        cooling = time.monotonic() < _state["primary_cooldown_until"]
        recent = _state["last_failover_at"] and time.time() - _state["last_failover_at"] < 300
        category = _state["last_category"]
    return {"secondary_configured": secondary_configured(), "primary_limited": cooling,
            "recent_failover": bool(recent), "limit_category": category if cooling else None}


def reset_for_tests():
    _probe.set(None)
    with _lock:
        _state.update(primary_cooldown_until=0.0,primary_probe_until=0.0,last_failover_at=None,last_category=None)
