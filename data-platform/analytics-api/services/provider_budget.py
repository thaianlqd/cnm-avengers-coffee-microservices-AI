"""Request-owned allowance, consumed before transport or scripted invocation."""

import os
import time
from contextvars import ContextVar
from threading import Lock
from services.analysis_catalog import AnalysisError

request_deadline = ContextVar('analysis_request_deadline', default=None)
request_cancelled = ContextVar('analysis_request_cancelled', default=None)
request_observer = ContextVar('analysis_request_observer', default=None)
HTTP_DEADLINE_SECONDS = 41   # propose HTTP envelope
PLANNING_SECONDS = 40        # whole-submission planning allowance (never restarted per attempt)
PROVIDER_TOTAL_SECONDS = 30  # all provider attempts together
ATTEMPT_SECONDS = 12         # one HTTP attempt, connect included
CONNECT_SECONDS = 2
DETERMINISTIC_RESERVE = 5    # local deterministic work after the provider
MIN_RECOVERY_SECONDS = 6
PHYSICAL_CEILING = 3  # fallback + repair together never exceed three HTTP attempts per submission


def check_request_deadline():
    deadline=request_deadline.get()
    cancelled = request_cancelled.get()
    if (cancelled is not None and cancelled.is_set()) or (deadline is not None and time.monotonic() >= deadline):
        raise AnalysisError('planning_timeout','Planning request expired')


class ProviderBudget:
    # Standalone transports default to one call; planning may reserve one repair.
    max_calls = 1

    def __init__(self, diagnostics=None, max_calls=1):
        if max_calls not in (1, 2, 3):
            raise AnalysisError("provider_policy", "Planning permits at most three calls")
        self.max_calls = max_calls
        self.diagnostics = diagnostics if diagnostics is not None else {}
        self.used = 0
        self.provider_deadline = None
        self.recovery_used = False  # one transport recovery per submission
        self.physical = 0  # real HTTP attempts, whatever logical call owns them
        self.payload_hashes = []
        self.lock = Lock()
        self.deadline = None
        self.diagnostics.update(provider_call_budget=max_calls, provider_call_count=0,
                                provider_attempt_count=0, provider_call_budget_block_count=0,
                                provider_physical_attempts=0, provider_physical_ceiling=PHYSICAL_CEILING)

    def start_deadline(self):
        # One submission shares a wall-clock allowance across all three calls;
        # reserve three seconds for deterministic planning after interpretation.
        if self.deadline is None:
            self.deadline = min(time.monotonic()+PLANNING_SECONDS,request_deadline.get() or float('inf'))
        self.diagnostics.update(planning_budget_ms=PLANNING_SECONDS*1000,provider_attempt_timeout_ms=ATTEMPT_SECONDS*1000,
                                provider_recovery_timeout_ms=ATTEMPT_SECONDS*1000, provider_total_ms=PROVIDER_TOTAL_SECONDS*1000)

    def remaining(self, reserve=0):
        check_request_deadline()
        if self.deadline is None:
            return None
        seconds=self.deadline-time.monotonic()-reserve
        self.diagnostics['planning_remaining_ms']=round(max(0,seconds)*1000,2)
        if seconds <= 0:
            self.diagnostics['terminal_error']='planning_timeout'
            raise AnalysisError('planning_timeout','Planning wall-clock allowance exhausted')
        return seconds

    def http_timeout(self):
        from urllib3.util import Timeout
        remaining=self.remaining(reserve=DETERMINISTIC_RESERVE)
        if remaining is None:
            return None
        # Smallest of: one attempt, what is left of the provider total, what is left of the request
        # (minus local reserve). The primary never consumes the window reserved for a recovery.
        provider_left = (self.provider_deadline - time.monotonic()) if self.provider_deadline else PROVIDER_TOTAL_SECONDS
        total=min(ATTEMPT_SECONDS,remaining,provider_left)
        if total <= 0:
            self.diagnostics['terminal_error']='planning_timeout'
            raise AnalysisError('planning_timeout','Provider allowance exhausted')
        connect=min(CONNECT_SECONDS,total/4)
        return Timeout(total=total,connect=connect,read=total-connect)

    def recovery_available(self, delay=0, same_call=False):
        # A transport recovery inside the logical call already holds its allowance (same_call).
        try:
            remaining = self.remaining(reserve=DETERMINISTIC_RESERVE)
        except AnalysisError:
            return False
        provider_left = self.provider_deadline - time.monotonic() if self.provider_deadline else PROVIDER_TOTAL_SECONDS
        return (same_call or self.used < self.max_calls) and provider_left-delay >= MIN_RECOVERY_SECONDS and (remaining is None or remaining-delay >= MIN_RECOVERY_SECONDS)

    def transport_retry_allowed(self, attempt, delay=0, same_call=False):
        # One early resend, never a long response-window timeout. Actual elapsed
        # wall time is authoritative even for adapters omitting latency fields.
        elapsed = attempt.get('latency_ms', float('inf')) / 1000
        category = attempt.get('error_category')
        if category not in {'provider_connection','provider_timeout','provider_http','provider_unavailable','provider_rate_limited'}:
            return False
        transient = category in {'provider_connection', 'provider_timeout'} or (
            attempt.get('http_status') in {500,502,503,504} or
            attempt.get('provider_error_status') in {'UNAVAILABLE','INTERNAL'})
        if category == 'provider_rate_limited':
            transient = attempt.get('retryable') is True and 0 < attempt.get('retry_after_seconds',999) <= 2
        return transient and elapsed <= 3 and self.recovery_available(delay, same_call)

    def claim_recovery(self):
        """Atomically claim the submission's single transport recovery."""
        with self.lock:
            if self.recovery_used or not self.recovery_available(same_call=True):
                return False
            observer = request_observer.get()
            if observer is not None:
                try:
                    observer('provider_recovery_claimed', {})
                except AnalysisError:
                    return False
            self.recovery_used = True
            self.diagnostics["transport_recovery_count"] = 1
            return True

    def record_physical(self, payload=None):
        """Reserve one real HTTP attempt before it is sent (hard ceiling, same lock as consume)."""
        import hashlib, json
        with self.lock:
            # Durable reservation first: the job ledger (not this instance) is the authority and may veto the send.
            observer = request_observer.get()
            if observer is not None and self.physical < PHYSICAL_CEILING:
                observer('provider_physical_reserved', {})
            if self.physical >= PHYSICAL_CEILING:
                self.diagnostics["provider_call_budget_block_count"] += 1
                self.diagnostics["terminal_error"] = "provider_call_budget_exceeded"
                raise AnalysisError("provider_call_budget_exceeded", "Physical HTTP allowance exhausted")
            self.physical += 1
            if self.provider_deadline is None:
                self.provider_deadline = time.monotonic() + PROVIDER_TOTAL_SECONDS
            if payload is not None:
                self.payload_hashes.append(hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()[:12])
            self.diagnostics.update(provider_physical_attempts=self.physical,
                                    provider_physical_payload_hashes=list(self.payload_hashes))

    def consume(self, context_chars=None):
        with self.lock:
            self.remaining(reserve=DETERMINISTIC_RESERVE)
            if self.used >= self.max_calls:
                self.diagnostics["provider_call_budget_block_count"] += 1
                self.diagnostics["terminal_error"] = "provider_call_budget_exceeded"
                raise AnalysisError("provider_call_budget_exceeded", "Provider allowance exhausted")
            if context_chars is not None:
                from services.semantic_manifest_service import char_limit

                maximum = self.diagnostics.get("context_char_budget") or char_limit("DATA_ANALYST_ONE_SHOT_CONTEXT_MAX_CHARS", 24000, 48000)
                if context_chars > maximum:
                    self.diagnostics["terminal_error"] = "one_shot_context_budget_exceeded"
                    raise AnalysisError("one_shot_context_budget_exceeded", "Transport context exceeds allowance")
            observer = request_observer.get()
            if observer is not None:
                observer('provider_reserved', {})
            self.used += 1
            self.diagnostics.update(provider_call_count=self.used, provider_attempt_count=self.used)


class ProviderTurn:
    def __init__(self, provider, diagnostics):
        self.provider = provider
        self.budget = ProviderBudget(diagnostics, max_calls=validate_single_shot_policy())

    def invoke(self, **request):
        from services.agent_provider import NativeAgentProvider

        if isinstance(self.provider, NativeAgentProvider):
            # Native transport consumes the same allowance immediately before HTTP.
            if self.provider.legacy_policy:
                raise AnalysisError("provider_policy", "Legacy transport cannot serve production planning")
            return self.provider(call_budget=self.budget, **request)
        self.budget.consume()
        response=self.provider(**request)
        self.budget.remaining()
        return response


def validate_single_shot_policy():
    """Request-owned bounded interpretation/recovery; normal use is one call."""
    maximum = os.getenv("DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN", "3").strip()
    repair = os.getenv("DATA_ANALYST_ENABLE_CONTRACT_REPAIR", "1").strip().lower()
    if maximum not in {"1", "2", "3"} or repair not in {"0", "false", "no", "1", "true", "yes"}:
        raise AnalysisError("provider_policy", "Invalid bounded planning allowance")
    if (maximum != "1") != (repair in {"1", "true", "yes"}):
        raise AnalysisError("provider_policy", "Recovery allowance requires matching repair policy")
    for flag in ("MODEL_ESCALATION", "PROVIDER_FALLBACK", "POST_RESULT_SYNTHESIS"):
        if os.getenv("DATA_ANALYST_ENABLE_" + flag, "0").strip().lower() not in {"0", "false", "no"}:
            raise AnalysisError("provider_policy", "Automatic fallback and synthesis remain disabled")
    return int(maximum)
