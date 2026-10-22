"""Shared circuit transport authorization and stale-probe fencing, zero HTTP."""
import json
import threading
from concurrent.futures import ThreadPoolExecutor
from contextvars import copy_context
from unittest import TestCase
from unittest.mock import patch
from services import provider_credential_router as circuit
from services.error_taxonomy import AnalysisError


class CircuitRedis:
    def __init__(self):
        self.guard = threading.RLock()
        self.values = {}
        self.now = 1_000
    def lock(self, *args, **kwargs): return self.guard
    def time(self): return self.now, 0
    def get(self, key): return self.values.get(key)
    def set(self, key, value, **kwargs): self.values[key] = value
    def eval(self, script, count, key, expected, value):
        with self.guard:
            if (self.values.get(key) or '') != expected: return 0
            self.values[key] = value
            return 1


class SharedCircuitTests(TestCase):
    def setUp(self):
        self.redis = CircuitRedis()
        self.enterContext(patch.object(circuit, '_shared_client', return_value=self.redis))
        self.enterContext(patch.object(circuit, '_primary_key', return_value='fixture-primary'))
        self.enterContext(patch.object(circuit, '_secondary_key', return_value='fixture-secondary'))
        self.http = self.enterContext(patch('requests.sessions.Session.request', side_effect=AssertionError('No HTTP')))
        circuit.reset_for_tests()
        self.addCleanup(circuit.reset_for_tests)

    def test_one_probe_across_threads_and_only_its_context_can_close_circuit(self):
        circuit.record_failure('primary', {'error_category':'provider_rate_limited'})
        self.redis.now += 61
        def plan(_):
            result = circuit.credential_plan()
            return result[0][0], copy_context()
        with ThreadPoolExecutor(8) as pool:
            results = list(pool.map(plan, range(32)))
        self.assertEqual(sum(slot == 'primary' for slot, _ in results), 1)
        circuit.record_success('primary')  # An unrelated request must not close the probe.
        self.assertEqual(circuit.credential_plan()[0][0], 'secondary')
        context = next(context for slot, context in results if slot == 'primary')
        context.run(circuit.record_success, 'primary')
        self.assertEqual(circuit.credential_plan()[0][0], 'primary')
        self.http.assert_not_called()
        self.assertNotIn('fixture', json.dumps(self.redis.values))

    def test_expired_probe_cannot_clear_or_reopen_its_successor(self):
        circuit.record_failure('primary', {'error_category':'provider_rate_limited'})
        self.redis.now += 61
        circuit.credential_plan(); stale = copy_context()
        self.redis.now += 14
        circuit.credential_plan(); successor = copy_context()
        before = self.redis.get(circuit._CIRCUIT_KEY)
        stale.run(circuit.record_success, 'primary')
        stale.run(circuit.record_failure, 'primary', {'error_category':'provider_daily_quota'})
        self.assertEqual(self.redis.get(circuit._CIRCUIT_KEY), before)
        successor.run(circuit.record_failure, 'primary', {'error_category':'provider_rate_limited'})
        self.assertTrue(circuit.status()['primary_limited'])
        self.http.assert_not_called()

    def test_redis_failure_refuses_transport_without_local_fallback(self):
        with patch.object(self.redis, 'get', side_effect=OSError('Fixture unavailable')):
            with self.assertRaises(AnalysisError) as caught:
                circuit.credential_plan()
        self.assertEqual(caught.exception.category, 'provider_unavailable')
        self.http.assert_not_called()

    def test_expired_lock_with_intervening_write_refuses_stale_transition(self):
        with patch.object(self.redis, 'eval', return_value=0):
            with self.assertRaises(AnalysisError) as caught: circuit.credential_plan()
        self.assertEqual(caught.exception.category, 'provider_unavailable')
        self.http.assert_not_called()

    def test_primary_cooldown_uses_shared_clock_and_status_is_sanitized(self):
        circuit.record_failure('primary', {'error_category':'provider_daily_quota'})
        with patch.object(circuit, '_secondary_key', return_value=''):
            with self.assertRaises(AnalysisError) as caught: circuit.credential_plan()
        self.assertEqual(caught.exception.category, 'provider_rate_limited')
        self.assertEqual(set(circuit.status()), {'secondary_configured','primary_limited','recent_failover','limit_category'})
        self.assertEqual(circuit.status()['limit_category'], 'provider_daily_quota')
        self.redis.now += 601
        self.assertEqual(circuit.credential_plan()[0][0], 'primary')
        self.http.assert_not_called()

    def test_health_is_inspectable_when_shared_circuit_is_unavailable(self):
        from services.provider_health_service import provider_health
        with patch.object(circuit, 'status', side_effect=AnalysisError('provider_unavailable', 'Fixture unavailable')):
            result = provider_health()
        self.assertFalse(result['credential_circuit_available'])
        self.assertEqual(result['state'], 'unknown')
        self.assertFalse(result['credential_failover_recent'])
        self.http.assert_not_called()

    def test_circuit_does_not_depend_on_session_job_or_planner_engines(self):
        import ast
        from pathlib import Path
        tree = ast.parse(Path(circuit.__file__).read_text())
        forbidden = {'services.session_service','services.analysis_job_service','services.hybrid_analyst_planner'}
        imports = {node.module for node in ast.walk(tree) if isinstance(node, ast.ImportFrom)}
        self.assertFalse(imports & forbidden)
