from unittest import TestCase
from unittest.mock import patch
from services import telemetry


class MetricsExportTests(TestCase):
    def test_known_counters_histograms_and_shared_gauge_ownership(self):
        observed={'counts':[{'stage':'sql','status':'completed','count':7}],
            'duration_histograms_ms':{'sql':{'count':2,'sum_ms':150,'10':0,'50':1,'100':2}},'dropped_events':1}
        with patch('services.data_coverage_service.peek',return_value={'data_health':{'datasets':{
                'a':{'status':'healthy'},'b':{'status':'blocked'}}}}):
            result=telemetry.prometheus_export(observed)
        self.assertIn('analytics_events_total{stage="sql",status="completed"} 7',result)
        self.assertIn('analytics_stage_duration_seconds_sum{stage="sql"} 0.15',result)
        self.assertIn('analytics_stage_duration_seconds_bucket{stage="sql",le="+Inf"} 2',result)
        self.assertIn('aggregate with max, never sum',result)
        self.assertIn('analytics_source_states{state="blocked"} 1',result)

    def test_unbounded_labels_never_escape_and_missing_health_is_unknown(self):
        observed={'counts':[{'stage':'private prompt','status':'completed','count':7},
            {'stage':'sql','status':'secret-token','count':8}], 'duration_histograms_ms':{'account:private':{}}}
        with patch('services.data_coverage_service.peek',return_value=None):
            result=telemetry.prometheus_export(observed)
        self.assertNotIn('private',result);self.assertNotIn('secret-token',result)
        self.assertIn('analytics_source_observations_known 0',result)
