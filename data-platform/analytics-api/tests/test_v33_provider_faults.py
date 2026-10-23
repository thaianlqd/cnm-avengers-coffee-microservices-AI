"""Transport fault injection through the real NativeAgentProvider: one owner, one recovery, <= 3 physical HTTP."""
import json
import os
import unittest
from unittest.mock import Mock, patch

from services import llm_service
from services import provider_credential_router as credentials
from services.agent_provider import NativeAgentProvider
from services.analysis_catalog import AnalysisError
from services.provider_budget import ProviderBudget

TOOL = {"name": "submit_analysis_intent", "description": "x", "parameters": {"type": "object", "properties": {}}}


def http(status, headers=None):
    response = Mock(ok=status < 400, status_code=status, headers=headers or {})
    response.json.return_value = {"error": {"message": "redacted"}}
    return response


def success():
    body = {"candidates": [{"content": {"parts": [{"text": json.dumps({"decision": "analyze"})}]}}],
            "usageMetadata": {"promptTokenCount": 1, "candidatesTokenCount": 1}}
    return Mock(ok=True, status_code=200, json=Mock(return_value=body), headers={})


class FaultInjectionTests(unittest.TestCase):
    def call(self, responses, secondary="", primary="primary-key"):
        credentials.reset_for_tests()
        env = {"AI_OFFLINE": "0", "GEMINI_API_STYLE": "native", "DATA_ANALYST_GEMINI_SECONDARY_KEY": secondary}
        diag = {}
        with patch.dict(os.environ, env), patch.object(llm_service, "GEMINI_API_KEY", primary), \
                patch.object(llm_service, "GEMINI_MODELS", ["fixture"]), patch("services.agent_provider.time.sleep"), \
                patch("services.agent_provider.requests.post", side_effect=responses) as post:
            try:
                answer = NativeAgentProvider()(system="", messages=[{"role": "user", "content": "x"}], tools=[TOOL], call_budget=ProviderBudget(diag, max_calls=3))
                return answer, post, diag, None
            except AnalysisError as error:
                return None, post, diag, error

    def test_503_then_success_same_credential_when_no_secondary(self):
        answer, post, diag, _ = self.call([http(503), success()])
        self.assertTrue(answer["calls"]); self.assertEqual((post.call_count, diag["provider_physical_attempts"]), (2, 2))  # real recovery, real result
        self.assertTrue(answer["attempts"][1]["transport_resend"])
        self.assertEqual(len(set(diag["provider_physical_payload_hashes"])), 1)

    def test_503_then_secondary_success_uses_the_secondary_once(self):
        answer, post, diag, _ = self.call([http(503), success()], secondary="secondary-key")
        self.assertTrue(answer["calls"]); self.assertEqual(post.call_count, 2); self.assertTrue(answer["attempts"][1]["credential_failover"])
        self.assertEqual(diag["transport_recovery_count"], 1)

    def test_duplicate_secondary_is_not_a_new_allowance(self):
        answer, post, diag, _ = self.call([http(503), success()], secondary="primary-key")   # same key as primary
        self.assertEqual(post.call_count, 2)
        self.assertNotIn("credential_failover", answer["attempts"][1])   # a resend, not a fake second slot
        self.assertTrue(answer["attempts"][1]["transport_resend"])

    def test_both_credentials_failing_ends_after_two_attempts_with_no_third(self):
        answer, post, diag, _ = self.call([http(503), http(503), http(503), success()], secondary="secondary-key")
        self.assertIsNone(answer["calls"]); self.assertEqual((post.call_count, len(answer["attempts"])), (2, 2))

    def test_auth_and_client_errors_never_recover_even_with_a_secondary(self):
        for status in (400, 401, 403, 404):
            answer, post, diag, _ = self.call([http(status), success()], secondary="secondary-key")
            self.assertEqual(post.call_count, 1, status)
            self.assertIsNone(answer["calls"])

    def test_429_without_retry_after_does_not_resend_the_same_credential(self):
        answer, post, diag, _ = self.call([http(429), success()])
        self.assertEqual(post.call_count, 1)

    def test_physical_ceiling_is_hard_even_if_the_budget_is_asked_again(self):
        budget = ProviderBudget({}, max_calls=3)
        for _ in range(3):
            budget.record_physical({"x": 1})
        with self.assertRaises(AnalysisError):
            budget.record_physical({"x": 1})

    def test_no_attempt_starts_without_a_recovery_window(self):
        from services import provider_budget as pb
        budget = pb.ProviderBudget({}, max_calls=3)
        with patch.object(pb.time, "monotonic", return_value=500.0):
            budget.deadline = 500.0 + pb.DETERMINISTIC_RESERVE + pb.MIN_RECOVERY_SECONDS - 1
            attempt = {"error_category": "provider_http", "http_status": 503, "latency_ms": 100}
            self.assertFalse(budget.transport_retry_allowed(attempt, 0.5, same_call=True))
            budget.deadline += 2
            self.assertTrue(budget.transport_retry_allowed(attempt, 0.5, same_call=True))

    def test_fast_connect_does_not_lose_reserved_time_from_attempt(self):
        from services import provider_budget as pb
        from urllib3.util import Timeout
        budget = pb.ProviderBudget({}, max_calls=3)
        with patch.object(pb.time, 'monotonic', return_value=500.):
            budget.start_deadline()
            timeout = budget.http_timeout()
        self.assertEqual(timeout.total, 12)
        self.assertEqual(timeout.connect_timeout, 2)
        timeout.start_connect()  # urllib3 starts this clock before the socket call.
        with patch.object(Timeout, 'get_connect_duration', return_value=.25):
            self.assertEqual(timeout.read_timeout, 11.75)
        with patch.object(Timeout, 'get_connect_duration', return_value=2):
            self.assertEqual(timeout.read_timeout, 10)

    def test_response_read_remains_bounded_by_turn_and_provider_time_left(self):
        from services import provider_budget as pb
        from urllib3.util import Timeout
        budget = pb.ProviderBudget({}, max_calls=3)
        with patch.object(pb.time, 'monotonic', return_value=500.):
            budget.deadline = 500 + pb.DETERMINISTIC_RESERVE + 1.5
            budget.provider_deadline = 501.25
            timeout = budget.http_timeout()
        self.assertEqual(timeout.total, 1.25)
        timeout.start_connect()
        with patch.object(Timeout, 'get_connect_duration', return_value=.25):
            self.assertEqual(timeout.read_timeout, 1.)

    def test_secrets_never_reach_diagnostics(self):
        _, _, diag, _ = self.call([http(503), success()], secondary="secondary-SECRET")
        self.assertNotIn("SECRET", json.dumps(diag)); self.assertNotIn("primary-key", json.dumps(diag))


if __name__ == "__main__":
    unittest.main()
