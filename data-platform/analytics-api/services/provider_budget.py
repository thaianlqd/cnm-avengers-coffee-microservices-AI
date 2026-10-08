"""Request-owned allowance, consumed before transport or scripted invocation."""

import os
from threading import Lock
from services.analysis_catalog import AnalysisError


class ProviderBudget:
    # Standalone transports default to one call; planning may reserve one repair.
    max_calls = 1

    def __init__(self, diagnostics=None, max_calls=1):
        if max_calls not in (1, 2, 3):
            raise AnalysisError("provider_policy", "Planning permits at most three calls")
        self.max_calls = max_calls
        self.diagnostics = diagnostics if diagnostics is not None else {}
        self.used = 0
        self.lock = Lock()
        self.diagnostics.update(provider_call_budget=max_calls, provider_call_count=0,
                                provider_attempt_count=0, provider_call_budget_block_count=0)

    def consume(self, context_chars=None):
        with self.lock:
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
        return self.provider(**request)


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
