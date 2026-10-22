"""T4 acceptance staged outside the product tree while T1 holds source fixed."""
from tests.test_v32_mission_reliability import Guarded, ScriptedProvider


class RiskSnapshotClockTests(Guarded):
    def test_bounded_risk_includes_labeled_current_snapshot_without_partial_approval(self):
        provider = ScriptedProvider()
        _, report = self.report(provider,
            question='Kiểm tra rủi ro vận hành tháng 9 năm 2026',
            analysis_mission='risk_watch', analysis_depth='deep',
            time={'mode': 'custom', 'start': '2026-09-01', 'end': '2026-09-30'},
            analysis_scope={'mode': 'selected', 'filters': [
                {'dimension': 'city', 'operator': 'in', 'value': ['Hồ Chí Minh']}]})
        self.assertEqual(provider.call_count, 0)
        snapshot_metrics = {s['metric'] for s in self.registry['risk_signals']
                            if self.registry['metrics'][s['metric']].get('historical_capability') == 'snapshot'}
        snapshots = [q for q in report['analytical_queries'] if set(q['metrics']) & snapshot_metrics]
        self.assertTrue(snapshots)
        for query in snapshots:
            self.assertEqual(query['time'], {'kind': 'relative', 'mode': 'all_time'})
            self.assertTrue(all(f['value'] == ['Hồ Chí Minh'] for f in query['filters'] if f['dimension'] == 'city'))
            charts = [c for c in report['charts'] if c.get('query_id') == query['id']]
            self.assertTrue(charts)
            self.assertTrue(all('hiện trạng' in str(c).lower() for c in charts))
