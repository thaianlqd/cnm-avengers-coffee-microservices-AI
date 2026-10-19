"""One robust baseline; current rules remain independent and Scan has zero AI."""
from datetime import date,timedelta
from unittest import TestCase
from unittest.mock import Mock,patch
from services.risk_watch_service import robust_anomaly,evaluate_anomaly,classify

CONFIG={'version':'3.4.0','cadence':'day','minimum_history':28,'baseline_buckets':28,
        'threshold_z':3.5,'direction':'above'}
HEALTH={'status':'healthy','completeness':'complete','certificate':{'basis':'independent fixture source contract'}}


class RobustAnomalyTests(TestCase):
    def setUp(self):self.today=date(2026,10,17)

    def rows(self,current=30):
        return [{'period':str(self.today-timedelta(days=28-i)),'fixture':10+i%5,'exposure':20} for i in range(28)]+\
               [{'period':str(self.today),'fixture':current,'exposure':20}]

    def run_baseline(self,rows=None,**kwargs):
        return robust_anomaly(self.rows() if rows is None else rows,'fixture',CONFIG,
                              source_health=kwargs.pop('source_health',HEALTH),observed_day=self.today,**kwargs)

    def test_hand_median_mad_fixture_detects_large_change_and_keeps_full_baseline(self):
        result=self.run_baseline()
        self.assertEqual(result['status'],'anomaly')
        self.assertEqual(result['n'],28)
        self.assertEqual(result['expected'],12)
        self.assertAlmostEqual(result['bounds']['upper'],12+3.5*1.4826)
        self.assertEqual(result['observed'],30)

    def test_zero_scale_short_missing_and_duplicate_buckets_never_return_green(self):
        rows=self.rows()
        for row in rows:row['fixture']=10
        self.assertEqual(self.run_baseline(rows)['status'],'not_applicable')
        self.assertEqual(self.run_baseline(self.rows()[1:])['status'],'insufficient_sample')
        self.assertEqual(self.run_baseline(self.rows()+[self.rows()[0]])['status'],'invalid_history')
        invalid=self.rows();invalid[0]['fixture']=None
        self.assertEqual(self.run_baseline(invalid)['status'],'invalid_history')

    def test_uncertified_stale_or_failed_source_cannot_enable_statistical_baseline(self):
        for health in ({},{'status':'healthy','completeness':'unknown'},
            {**HEALTH,'status':'degraded'},{**HEALTH,'certificate':None}):
            self.assertEqual(self.run_baseline(source_health=health)['status'],'unknown_source')

    def test_current_future_periods_are_excluded_without_changing_the_sample(self):
        rows=self.rows()+[{'period':str(self.today+timedelta(days=1)),'fixture':999999,'exposure':20}]
        result=self.run_baseline(rows)
        self.assertEqual(result['observed'],30)
        self.assertEqual(result['n'],28)
        self.assertEqual(result['excluded_periods'],[str(self.today+timedelta(days=1))])

    def test_rate_or_average_requires_minimum_exposure_per_bucket(self):
        rows=self.rows();rows[3]['exposure']=0
        config={**CONFIG,'minimum_exposure':10}
        result=robust_anomaly(rows,'fixture',config,source_health=HEALTH,observed_day=self.today,exposure='exposure')
        self.assertEqual(result['status'],'insufficient_sample')

    def test_unknown_source_performs_zero_baseline_queries(self):
        from types import SimpleNamespace
        catalog=SimpleNamespace(registry={'metrics':{'fixture':{'time_column':'silver.fixture.date','source':'silver.fixture'}},'timezone':'Asia/Ho_Chi_Minh'})
        signal={'id':'fixture','metric':'fixture','anomaly':{**CONFIG,'enabled':True}}
        executor=Mock(side_effect=AssertionError('unknown history cannot be queried as complete'))
        with patch('services.data_coverage_service.peek',return_value={}):
            result=evaluate_anomaly(catalog,signal,[],None,executor,self.today,[2])
        self.assertEqual(result['status'],'unknown_source')
        executor.assert_not_called()

    def test_rule_threshold_status_does_not_depend_on_anomaly(self):
        signal={'threshold':10,'operator':'gt','warning_margin':1}
        self.assertEqual(classify(12,signal),'red')
        self.assertEqual(classify(1,signal),'green')
