"""Recent real transport evidence, independent of warehouse/container readiness."""
import time
from datetime import datetime, timezone
from threading import Lock

_lock = Lock()
_state = dict(last_success_at=None,last_failure_at=None,last_failure_category=None,
              recent_latency_ms=None,consecutive_failures=0,observed_monotonic=0,state='unknown')
FRESH_SECONDS = 300


def observe_attempt(attempt):
    now=datetime.now(timezone.utc).isoformat()
    with _lock:
        _state.update(recent_latency_ms=attempt.get('latency_ms'),observed_monotonic=time.monotonic())
        if attempt.get('status') == 'success':
            _state.update(last_success_at=now,consecutive_failures=0,state='available')
        else:
            count=_state['consecutive_failures']+1
            category=attempt.get('error_category')
            _state.update(last_failure_at=now,last_failure_category=category,consecutive_failures=count,
                state='unavailable' if count>=2 or category in {'provider_auth','provider_daily_quota','provider_access_denied'} else 'degraded')


def provider_health():
    from services.llm_service import provider_configuration
    configured=bool(provider_configuration().get('gemini',{}).get('configured'))
    with _lock:
        out={k:v for k,v in _state.items() if k not in {'observed_monotonic','consecutive_failures'}}
        if time.monotonic()-_state['observed_monotonic'] > FRESH_SECONDS:
            out['state']='unknown'
    return dict(configured=configured,**out)
