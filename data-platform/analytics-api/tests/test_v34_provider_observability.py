"""Rolling transport denominators and correlation use fixed, sanitized labels."""
from collections import deque
from unittest import TestCase
from unittest.mock import patch
import json

from services import provider_health_service as health
from services import telemetry


class ProviderObservabilityTests(TestCase):
    def setUp(self):
        self.enterContext(patch.object(health, '_attempts', deque(maxlen=10000)))
        self.enterContext(patch.object(health, '_truncated_until', 0.0))
        self.enterContext(patch.dict(health._state))

    def test_success_and_every_failed_physical_attempt_have_exact_rolling_denominators(self):
        with patch.object(health.time, 'monotonic', return_value=1000):
            for attempt in [{'status': 'success', 'latency_ms': 40},
                    {'status': 'failed', 'error_category': 'provider_timeout', 'latency_ms': 12000},
                    {'status': 'failed', 'error_category': 'provider_daily_quota', 'latency_ms': 100},
                    {'status': 'failed', 'error_category': 'invalid_tool_response', 'latency_ms': 500}]:
                health.observe_attempt(attempt)
        actual = health.rolling_observations(now=1005)
        self.assertEqual(actual['observed_attempts'], 4)
        self.assertEqual(actual['successful_attempts'], 1)
        self.assertEqual(sum(actual['error_buckets'].values()), 3)
        self.assertEqual(actual['latency_histogram_ms']['500'], 3)
        self.assertEqual(actual['sample_age_seconds'], 5)
        self.assertTrue(actual['window_complete'])
        self.assertEqual(health.rolling_observations(now=1300)['observed_attempts'], 0)
        self.assertIsNone(health.rolling_observations(now=1300)['sample_age_seconds'])

    def test_untrusted_payload_never_becomes_category_or_metric_label_and_context_joins_attempt(self):
        request = telemetry.request_id.set('req_fixture'); job = telemetry.job_id.set('aj_fixture')
        self.addCleanup(telemetry.request_id.reset, request); self.addCleanup(telemetry.job_id.reset, job)
        with self.assertLogs('analytics.events', level='INFO') as logs:
            health.observe_attempt({'status': 'failed', 'error_category': 'secret prose with raw data',
                'latency_ms': float('nan'), 'credential_slot': 'private-slot', 'prompt': 'private question'})
        self.assertEqual(health.rolling_observations()['error_buckets'], {'other_provider_error': 1})
        event = json.loads(logs.records[0].getMessage())
        self.assertEqual(event['request_id'], 'req_fixture')
        self.assertEqual(event['job_id'], 'aj_fixture')
        self.assertNotIn('private', logs.output[0])
        self.assertNotIn('secret prose', json.dumps(health._state))

    def test_bounded_window_overflow_is_disclosed_and_no_paid_probe_is_created(self):
        self.enterContext(patch.object(health, '_attempts', deque(maxlen=2)))
        with patch.object(health.time, 'monotonic', return_value=1000), patch('requests.sessions.Session.request') as http:
            for _ in range(3): health.observe_attempt({'status': 'success'})
            self.assertFalse(health.rolling_observations()['window_complete'])
            http.assert_not_called()
        self.assertTrue(health.rolling_observations(now=1300)['window_complete'])


class CredentialProbeTests(TestCase):
    def setUp(self):
        from services import provider_credential_router as credentials
        self.credentials=credentials;credentials.reset_for_tests();self.addCleanup(credentials.reset_for_tests)
        self.enterContext(patch.object(credentials,'_primary_key',return_value='primary-fixture'))
        self.enterContext(patch.object(credentials,'_secondary_key',return_value='secondary-fixture'))
        self.now=[0.0]
        self.enterContext(patch.object(credentials.time,'monotonic',side_effect=lambda:self.now[0]))

    def test_expired_quota_cooldown_allows_only_one_concurrent_primary_probe_and_no_paid_background(self):
        from concurrent.futures import ThreadPoolExecutor
        c=self.credentials;c.record_failure('primary',{'error_category':'provider_rate_limited'})
        self.now[0]=61
        with patch('requests.sessions.Session.request') as http,ThreadPoolExecutor(max_workers=8) as workers:
            plans=list(workers.map(lambda _:c.credential_plan(),range(32)))
            http.assert_not_called()
        self.assertEqual(sum(plan[0][0]=='primary' for plan in plans),1)
        self.assertEqual(sum(plan[0][0]=='secondary' for plan in plans),31)
        c.record_success('primary')
        self.assertTrue(all(c.credential_plan()[0][0]=='primary' for _ in range(8)))

    def test_failed_probe_reopens_cooldown_and_abandoned_probe_lease_expires(self):
        c=self.credentials;c.record_failure('primary',{'error_category':'provider_rate_limited'})
        self.now[0]=61;self.assertEqual(c.credential_plan()[0][0],'primary')
        self.assertEqual(c.credential_plan()[0][0],'secondary')
        self.now[0]=75;self.assertEqual(c.credential_plan()[0][0],'primary')
        c.record_failure('primary',{'error_category':'provider_rate_limited'})
        self.assertEqual(c.credential_plan()[0][0],'secondary')
        self.now[0]=136;self.assertEqual(c.credential_plan()[0][0],'primary')

    def test_single_credential_cooldown_does_not_send_or_earn_extra_attempts(self):
        from services.analysis_catalog import AnalysisError
        c=self.credentials
        with patch.object(c,'_secondary_key',return_value=''),patch('requests.sessions.Session.request') as http:
            c.record_failure('primary',{'error_category':'provider_daily_quota'})
            with self.assertRaises(AnalysisError) as caught:c.credential_plan()
            self.assertEqual(caught.exception.category,'provider_rate_limited');http.assert_not_called()

    def test_secondary_success_does_not_clear_primary_cooldown_and_status_stays_sanitized(self):
        c=self.credentials;c.record_failure('primary',{'error_category':'provider_rate_limited'})
        c.record_success('secondary');self.assertEqual(c.credential_plan()[0][0],'secondary')
        status=c.status()
        self.assertEqual(set(status),{'secondary_configured','primary_limited','recent_failover','limit_category'})
        self.assertNotIn('fixture',json.dumps(status));self.assertNotIn('probe',json.dumps(status))

    def test_older_inflight_success_cannot_erase_a_newer_primary_quota_cooldown(self):
        c=self.credentials;c.record_failure('primary',{'error_category':'provider_rate_limited'})
        self.now[0]=1;c.record_success('primary')
        self.assertEqual(c.credential_plan()[0][0],'secondary')
