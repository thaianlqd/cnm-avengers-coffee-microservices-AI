"""Recent real transport evidence, independent of warehouse/container readiness."""
import time
import math
from collections import Counter, deque
from datetime import datetime, timezone
from threading import Lock

_lock = Lock()
_state = dict(last_success_at=None,last_failure_at=None,last_failure_category=None,
              recent_latency_ms=None,consecutive_failures=0,observed_monotonic=0,state='unknown')
FRESH_SECONDS = 300
_attempts = deque(maxlen=10000)
_truncated_until = 0.0
_CATEGORIES = {'provider_auth', 'provider_daily_quota', 'provider_access_denied', 'provider_rate_limited',
    'provider_timeout', 'provider_connection', 'provider_unavailable', 'provider_http', 'provider_bad_request',
    'provider_model_not_found', 'invalid_tool_response', 'provider_schema_rejected'}


def _prune(now):
    while _attempts and _attempts[0][0] <= now-FRESH_SECONDS:
        _attempts.popleft()


def rolling_observations(now=None):
    now = time.monotonic() if now is None else now
    with _lock:
        _prune(now)
        attempts = list(_attempts)
        complete = now >= _truncated_until
    outcomes = Counter(row[1] for row in attempts)
    latencies = [row[2] for row in attempts if row[2] is not None]
    return {'window_seconds': FRESH_SECONDS, 'observed_attempts': len(attempts),
        'successful_attempts': outcomes.pop('success', 0), 'error_buckets': dict(sorted(outcomes.items())),
        'latency_observed_attempts': len(latencies),
        'latency_histogram_ms': {str(bound): sum(value <= bound for value in latencies)
            for bound in (100, 500, 1000, 5000, 12000, 30000)},
        'sample_age_seconds': round(max(0, now-attempts[-1][0]), 3) if attempts else None,
        'window_complete': complete,
        'basis': 'Observed physical transports only; semantic correctness and sustained SLO are not measured'}


def observe_attempt(attempt):
    global _truncated_until
    now=datetime.now(timezone.utc).isoformat()
    category=attempt.get('error_category')
    category=category if category in _CATEGORIES else 'other_provider_error'
    latency=attempt.get('latency_ms')
    latency=latency if type(latency) in {float,int} and math.isfinite(latency) and 0<=latency<=86400000 else None
    with _lock:
        observed=time.monotonic()
        _prune(observed)
        if len(_attempts)==_attempts.maxlen:
            _truncated_until=max(_truncated_until,_attempts[0][0]+FRESH_SECONDS)
        _attempts.append((observed,'success' if attempt.get('status')=='success' else category,latency))
        _state.update(recent_latency_ms=latency,observed_monotonic=observed)
        if attempt.get('status') == 'success':
            _state.update(last_success_at=now,consecutive_failures=0,state='available')
        else:
            count=_state['consecutive_failures']+1
            _state.update(last_failure_at=now,last_failure_category=category,consecutive_failures=count,
                state='unavailable' if count>=2 or category in {'provider_auth','provider_daily_quota','provider_access_denied'} else 'degraded')
    from services.telemetry import event
    event('provider','completed' if attempt.get('status')=='success' else 'failed',duration_ms=latency)


def provider_health():
    from services.llm_service import provider_configuration
    configured=bool(provider_configuration().get('gemini',{}).get('configured'))
    with _lock:
        out={k:v for k,v in _state.items() if k not in {'observed_monotonic','consecutive_failures'}}
        if time.monotonic()-_state['observed_monotonic'] > FRESH_SECONDS:
            out['state']='unknown'
    # V3.2 credential pool (sanitized: no key, slot or identifier is exposed).
    from services import provider_credential_router as credentials
    pool=credentials.status()
    if out['state'] in {'unavailable','degraded'} and out.get('last_failure_category') in {'provider_rate_limited','provider_daily_quota'}:
        out['state']='rate_limited'
    if pool['recent_failover'] and out['state']=='available':
        out['state']='degraded'  # "Đang chuyển dự phòng": answered via the secondary credential
    return dict(configured=configured,credential_failover_configured=pool['secondary_configured'],
                credential_failover_recent=pool['recent_failover'],rolling=rolling_observations(),**out)
