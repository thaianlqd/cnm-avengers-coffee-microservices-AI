"""Server proof permitting inference retry, never business-operation replay."""
import math
import time


def known_no_tool_failure(result):
    if not isinstance(result, dict):
        return False
    marker = result.get('_provider_retry')
    if (not isinstance(marker, dict) or marker.get('no_tool_execution') is not True
            or result.get('error') not in {'network_timeout', 'provider_transient'}
            or result.get('_turn_status') in {'in_progress', 'outcome_unknown'}
            or result.get('tool_calls_log') or result.get('checkout_payload')):
        return False
    deadline = marker.get('retry_at')
    return (type(deadline) in {int, float} and math.isfinite(deadline) and deadline > 0)


def retry_ready(result, now=None):
    return (known_no_tool_failure(result)
            and (time.time() if now is None else now) >= result['_provider_retry']['retry_at'])
