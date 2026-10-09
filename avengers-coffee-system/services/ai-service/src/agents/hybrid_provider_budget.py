"""One cumulative transport-attempt budget across interpretation and ref repair."""
import os
from src.common import agent_provider_policy


class ProviderBudget:
    maximum = 3

    def __init__(self):
        self.health, self.metrics = {}, {}

    @property
    def used(self):
        return self.health.get('total_attempts', 0)

    def completion(self, messages, reason, allowance=1):
        remaining = min(allowance, self.maximum - self.used)
        if remaining <= 0:
            return None, 'turn_provider_budget_exhausted'
        self.health.update(remaining_request_budget=remaining, request_reason=reason)
        response, _, _, error = agent_provider_policy.completion(messages, [],
            preferred=os.getenv('AI_AGENT_PROVIDER', 'auto'), explicit_model=os.getenv('AI_AGENT_MODEL') or None,
            tier='standard', max_tokens=1200, required=False, metrics=self.metrics,
            turn_health=self.health, round_index=self.used)
        return response, error
