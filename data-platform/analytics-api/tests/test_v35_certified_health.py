"""Production health consumes fenced worker proof; parity alone cannot close a period."""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from unittest import TestCase
from pipeline_runtime import ProjectionEvidence, snapshot_certificate, closed_period_certificate, load_evidence
from services import data_coverage_service as health


class CertifiedHealthTests(TestCase):
    def setUp(self):
        self.now = datetime.now(timezone.utc)
        self.contract = {'dataset_id': 'replica.orders.fixture', 'source_table': 'orders.fixture',
            'target_table': 'orders.fixture', 'primary_key': ['id'], 'quality_tier': 'critical',
            'columns': {'id': {'data_type': 'integer', 'nullable': False, 'projection': 'source'}},
            'expected_load_interval_seconds': 300, 'maximum_acceptable_load_lag_seconds': 900,
            'closed_periods': [{'id': 'sep', 'start': '2026-09-01', 'end': '2026-09-30',
                'clock': 'created_at', 'timezone': 'Asia/Ho_Chi_Minh', 'enabled': True,
                'attested_by': 'admin', 'attested_on': '2026-10-19',
                'authority': 'user_confirmation_20261019', 'must_revoke_before_mutation': True}]}
        observed = ProjectionEvidence(self.contract)
        observed.observe({'id': 1})
        self.observed = observed.summary()
        self.args = dict(generation=2, schema_fingerprint='a'*64, source_upper_bound=self.now,
            snapshot_started_at=self.now-timedelta(seconds=1), now=self.now)

    def project(self, *, closed=False, snapshot=False):
        certificate = snapshot_certificate(self.contract, self.observed, self.observed, **self.args) if snapshot else None
        periods = [closed_period_certificate(self.contract, self.observed, self.observed,
            period_id='sep', **self.args)] if closed else []
        proof = load_evidence(self.contract, self.observed, generation=2, schema_fingerprint='a'*64,
            snapshot=certificate, closed_periods=periods, now=self.now)
        checkpoint = {'generation': 2, 'schema_fingerprint': 'a'*64, 'last_success_at': self.now,
            'last_attempt_at': self.now, 'certificate': proof}
        self.checkpoint = checkpoint
        return self.reproject()

    def reproject(self):
        return health.dataset_health({'orders.fixture': self.contract},
            [{'name': 'silver.fixture', 'source_dependencies': ['orders.fixture']}],
            {'replica.orders.fixture': self.checkpoint}, {'orders.fixture': {'id': 'integer'}},
            {'orders.fixture': ['id']}, now=self.now)

    def test_valid_period_is_partial_globally_and_complete_only_inside_range(self):
        projected = self.project(closed=True)
        self.assertEqual(projected['datasets']['orders.fixture']['completeness'], 'partial')
        scoped = health.certified_period_health(projected, ['silver.fixture'], '2026-09-02', '2026-09-30', now=self.now)
        self.assertEqual(scoped['completeness'], 'complete')
        self.assertTrue(scoped['certificate'])
        self.assertNotEqual(health.certified_period_health(projected, ['silver.fixture'],
            '2026-08-31', '2026-09-30', now=self.now).get('completeness'), 'complete')

    def test_physical_snapshot_never_enables_closed_history(self):
        projected = self.project(snapshot=True)
        self.assertEqual(projected['datasets']['orders.fixture']['completeness'], 'complete')
        self.assertNotEqual(health.certified_period_health(projected, ['silver.fixture'],
            '2026-09-02', '2026-09-30', now=self.now).get('completeness'), 'complete')

    def test_tamper_generation_expiry_and_revocation_fail_closed(self):
        for mutation in ('tamper', 'generation', 'expiry', 'revoke'):
            self.setUp()
            self.project(closed=True)
            if mutation == 'tamper': self.checkpoint['certificate']['replica_rows'] = 99
            if mutation == 'generation': self.checkpoint['generation'] = 3
            if mutation == 'expiry': self.now += timedelta(seconds=901)
            if mutation == 'revoke': self.contract['closed_periods'][0]['enabled'] = False
            result = self.reproject()['datasets']['orders.fixture']
            self.assertIsNone(result['certificate'])
            self.assertEqual(result['quality']['status'], 'not_measured')
            self.assertNotEqual(result['status'], 'healthy')

    def test_report_generation_must_match_certificate_generation(self):
        projected = self.project(closed=True)
        epoch = {'status': 'observed', 'sources': [{'dataset_id': 'replica.orders.fixture',
            'generation': 3, 'schema_fingerprint': 'a'*64}]}
        result = health.certified_period_health(projected, ['silver.fixture'], '2026-09-02',
            '2026-09-30', now=self.now, epoch=epoch)
        self.assertNotEqual(result.get('completeness'), 'complete')
