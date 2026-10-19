"""Data health is measured evidence, not a static green UI response."""
from datetime import date, datetime, timezone
from unittest import TestCase
from unittest.mock import Mock, patch
from copy import deepcopy

from services import data_coverage_service as health


class DataHealthTests(TestCase):
    def tearDown(self):
        health.set_snapshot(None)

    def test_expired_snapshot_is_unknown_and_does_not_reuse_obsolete_bounds(self):
        health.set_snapshot({'status': 'ready', 'overall': {'min_date': '2026-01-01', 'max_date': '2026-09-01'},
                             'facts': {'orders': {'completeness': 'complete'}}, 'freshness': {'stale': False}}, ttl=-1)
        with patch('services.readiness_service.warehouse_connection', side_effect=AssertionError('peek must not query')):
            current = health.peek()
        self.assertEqual(current['observation_status'], 'expired')
        self.assertEqual(current['facts'], {})
        self.assertIsNone(current['overall']['max_date'])
        self.assertIsNone(current['freshness']['stale'])

    def test_refresh_failure_does_not_return_an_expired_green_snapshot(self):
        health.set_snapshot({'status': 'ready', 'freshness': {'stale': False}}, ttl=-1)
        with patch.object(health, 'refresh', side_effect=RuntimeError('fixture offline')):
            current = health.current()
        self.assertEqual(current['status'], 'unavailable')
        self.assertEqual(current['reason'], 'health_snapshot_expired')

    def test_nonzero_violations_compute_failure_score_and_critical_count(self):
        observed = {r['rule_id']: {'checked': 100, 'violations': 0} for r in health.QUALITY_RULES}
        observed['DQ-02']['violations'] = 20
        snapshot = health.quality_summary(observed, datetime(2026, 10, 18, tzinfo=timezone.utc))
        self.assertEqual(snapshot['status'], 'failed')
        self.assertEqual(snapshot['critical_failures'], 1)
        rule = next(r for r in snapshot['tests'] if r['rule_id'] == 'DQ-02')
        self.assertEqual(rule['score'], 80)
        self.assertEqual(rule['status'], 'KHONG_DAT')
        self.assertEqual(snapshot['last_audit_time'], '2026-10-18T00:00:00+00:00')

    def test_missing_empty_or_invalid_measurement_is_never_zero_violations_or_perfect_quality(self):
        for observed in ({}, {'DQ-01': {'checked': 0, 'violations': 0}},
                         {'DQ-01': {'checked': 1, 'violations': 2}}, {'DQ-01': {'checked': True, 'violations': 0}}):
            with self.subTest(observed=observed):
                snapshot = health.quality_summary(observed)
                self.assertIsNone(snapshot['overall_score'])
                self.assertGreater(snapshot['not_measured_rules'], 0)

    def test_query_failure_is_not_measured_and_successful_checks_keep_real_denominators(self):
        statements = []
        class Cursor:
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def execute(self, sql):
                statements.append(sql)
                if 'tong_tien' in sql: raise TimeoutError('fixture timeout')
            def fetchone(self): return {'checked': 7, 'violations': 0}
        conn = Mock()
        conn.cursor = Cursor
        snapshot = health.quality_snapshot(lambda: conn)
        self.assertEqual(len(statements), 3)
        self.assertEqual(snapshot['status'], 'unknown')
        self.assertIsNone(snapshot['overall_score'])
        self.assertEqual(snapshot['tests'][0]['checked_rows'], 7)
        self.assertEqual(snapshot['tests'][1]['quality_status'], 'not_measured')
        conn.close.assert_called_once()

    def test_all_configured_checks_pass_is_not_a_full_source_completeness_certificate(self):
        snapshot = health.quality_summary({r['rule_id']: {'checked': 10, 'violations': 0} for r in health.QUALITY_RULES})
        self.assertEqual(snapshot['overall_score'], 100)
        self.assertIn('không chứng nhận', snapshot['scope'])
        self.assertNotIn('completeness', snapshot)

    def source_fixture(self):
        now=datetime(2026,10,18,tzinfo=timezone.utc)
        contract={'dataset_id':'replica.orders.fixture','target_table':'orders.fixture',
            'primary_key':['id'],'columns':{'id':{'data_type':'integer'},'amount':{'data_type':'numeric'}},
            'expected_load_interval_seconds':300}
        checkpoint={'generation':2,'schema_fingerprint':'a'*64,'last_success_at':now,'last_attempt_at':now,
                    'source_upper_bound':now,'observed_rows':0,'completeness':'complete','certificate':{'fake':True}}
        return now,{'orders.fixture':contract},{'replica.orders.fixture':checkpoint},\
            {'orders.fixture':{'id':'integer','amount':'numeric'}},{'orders.fixture':['id']}

    def test_source_load_failure_is_not_masked_by_previous_success_and_only_impacts_dependencies(self):
        now,contracts,checkpoints,physical,keys=self.source_fixture()
        views=[{'name':'silver.fixture','source_dependencies':['orders.fixture']},
               {'name':'silver.other','source_dependencies':['orders.unknown']}]
        checkpoints['replica.orders.fixture']['error_code']='fixture_timeout'
        result=health.dataset_health(contracts,views,checkpoints,physical,keys,now=now)
        self.assertEqual(result['datasets']['orders.fixture']['status'],'blocked')
        self.assertEqual(result['views']['silver.fixture']['status'],'blocked')
        self.assertEqual(result['views']['silver.other']['status'],'unknown')

    def test_schema_key_and_type_drift_are_blocked_with_previous_generation_retained(self):
        now,contracts,checkpoints,physical,keys=self.source_fixture()
        for mutation in ('type','missing','key'):
            cols,pk=deepcopy(physical),deepcopy(keys)
            if mutation=='type':cols['orders.fixture']['amount']='text'
            if mutation=='missing':cols['orders.fixture'].pop('id')
            if mutation=='key':pk['orders.fixture']=[]
            with self.subTest(mutation=mutation):
                result=health.dataset_health(contracts,[],checkpoints,cols,pk,now=now)['datasets']['orders.fixture']
                self.assertEqual(result['status'],'blocked')
                self.assertEqual(result['generation'],2)

    def test_zero_load_is_observation_and_completeness_stays_unknown_without_certified_proof(self):
        now,contracts,checkpoints,physical,keys=self.source_fixture()
        result=health.dataset_health(contracts,[],checkpoints,physical,keys,now=now)['datasets']['orders.fixture']
        self.assertEqual(result['status'],'healthy')
        self.assertEqual(result['observed_rows'],0)
        self.assertEqual(result['quality']['status'],'not_measured')
        self.assertEqual(result['completeness'],'unknown')
        self.assertIsNone(result['certificate'])

    def test_missing_checkpoint_and_stale_source_have_different_statuses(self):
        now,contracts,checkpoints,physical,keys=self.source_fixture()
        result=health.dataset_health(contracts,[],{},physical,keys,now=now)['datasets']['orders.fixture']
        self.assertEqual(result['status'],'unknown')
        from datetime import timedelta
        checkpoints['replica.orders.fixture']['last_success_at']=now-timedelta(hours=1)
        result=health.dataset_health(contracts,[],checkpoints,physical,keys,now=now)['datasets']['orders.fixture']
        self.assertEqual(result['status'],'degraded')

    def test_business_sla_is_explicit_and_does_not_certify_completeness(self):
        from datetime import timedelta
        now,contracts,checkpoints,physical,keys=self.source_fixture()
        contracts['orders.fixture'].update(source_business_owner='admin',
            maximum_acceptable_load_lag_seconds=900)
        for lag,status in ((900,'healthy'),(901,'degraded')):
            checkpoints['replica.orders.fixture']['last_success_at']=now-timedelta(seconds=lag)
            result=health.dataset_health(contracts,[],checkpoints,physical,keys,now=now)['datasets']['orders.fixture']
            self.assertEqual(result['status'],status)
            self.assertEqual(result['source_business_owner'],'admin')
            self.assertEqual(result['business_owner_status'],'assigned')
            self.assertEqual(result['maximum_acceptable_load_lag_seconds'],900)
            self.assertEqual(result['completeness'],'unknown')

    def test_blocked_required_source_stops_compiled_execution_before_pool_acquisition(self):
        from services.query_execution_batch import report_snapshot
        from services.analysis_catalog import AnalysisError
        health.set_snapshot({'data_health':{'views':{'silver.don_hang':{'status':'blocked'}}}})
        with patch('services.query_execution_batch.connection',side_effect=AssertionError('no pool acquisition')):
            with self.assertRaises(AnalysisError):
                with report_snapshot(['silver.don_hang']):pass

    def test_blocked_required_source_is_input_terminal_and_does_no_io(self):
        from services.preflight_service import run
        from services.preflight_service import preflight_catalog
        coverage={'data_health':{'views':{'silver.don_hang':{'status':'blocked','reasons':['last_load_failed']}}}}
        with patch('services.readiness_service.warehouse_connection',side_effect=AssertionError('preflight no IO')):
            result=run('Doanh thu tháng 9 năm 2026',catalog=preflight_catalog(),coverage=coverage)
        self.assertFalse(result['can_submit'])
        self.assertIn('required_source_blocked',[f['code'] for f in result['findings']])
