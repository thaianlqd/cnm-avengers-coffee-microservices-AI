"""Run4 failures stay failures; offline fixes never rewrite paid evidence (evaluation/v34/live44-20261019-r4)."""
from tests import test_hybrid_v28 as f
from tests import test_v34_ranked_companion as ranked_fixture

L30 = 'doanh thu thang 9 nam 2026 theo thanh pho'
MONTH = {'kind': 'month', 'year': 2026, 'month': 9}


class FourthRunRegressions(f.unittest.TestCase):
    setUp = f.HybridTests.setUp
    pipeline = f.HybridTests.pipeline
    request = f.HybridTests.request
    warehouse = ranked_fixture.RankedCompanionTests.warehouse

    def test_l30_unrequested_sibling_metric_is_not_a_second_requirement(self):
        def req(id, metric):
            return f.requirement(id=id, goal='Phân tích yêu cầu', domain_id='orders', metric_ids=[metric],
                dimension_ids=['city'], analysis_kind='aggregate', ranking=None, time=MONTH, derived_features=[])
        pipeline = self.pipeline(f.scripted(f.envelope(req('req_1', 'revenue'), req('req_2', 'store_revenue'))),
                                 executor=self.warehouse())
        try:
            proposal = pipeline.propose(self.request(L30, analysis_depth='focused'))
        except f.AnalysisError as error:
            self.fail('proposal failed: %s' % error)
        reqs = proposal['diagnostics']['semantic_intent']['requirements']
        self.assertEqual([m for r in reqs if r.get('availability') == 'requested' for m in r['metric_ids']], ['revenue'])


import json
from copy import deepcopy
from pathlib import Path

RUN4 = {r['id']: r for r in json.loads((Path(__file__).parent / 'fixtures/v34_live44_rerun4_failed_intents.json').read_text())['cases']}


class FourthRunCaptured(f.unittest.TestCase):
    setUp = f.HybridTests.setUp
    pipeline = f.HybridTests.pipeline
    request = f.HybridTests.request
    warehouse = ranked_fixture.RankedCompanionTests.warehouse

    def run_first_output(self, id):
        capture = RUN4[id]
        raw = deepcopy(capture['outputs'][0])
        raw.pop('clarification', None)
        pipeline = self.pipeline(f.scripted(raw), executor=self.warehouse())
        proposal = pipeline.propose(self.request(capture['question'], analysis_depth='focused'))
        self.assertEqual(pipeline.provider.call_count, 1)
        return proposal['diagnostics']['semantic_intent']['requirements']

    def test_l41_period_comparison_with_change_features_needs_no_repair_turn(self):
        req = self.run_first_output('L41')[0]
        self.assertEqual(req['comparison_time']['start'], '2026-08-01')
        self.assertEqual(req['time']['start'], '2026-09-01')
        self.assertIn('scalar', req['derived_features'])
        self.assertFalse({'change', 'change_pct'} & set(req['derived_features']))

    def test_l06_unrequested_selected_total_outside_ranking_is_discarded(self):
        req = self.run_first_output('L06')[0]
        self.assertNotIn('selected_total', req['derived_features'])
        self.assertEqual(req['metric_ids'], ['order_cancellation_rate'])
        self.assertEqual(req['dimension_ids'], ['store'])


class FourthRunUnsupportedDeclarations(FourthRunCaptured):
    def test_bare_refusal_with_locked_metrics_is_rechecked_once(self):
        capture = RUN4['L43']
        raw = deepcopy(capture['outputs'][0]); raw.pop('clarification', None)
        answer = {'decision': 'analyze', 'requirements': [f.requirement(id='req_1', goal='Xếp hạng tỷ lệ hủy', domain_id='orders',
            metric_ids=['order_cancellation_rate', 'order_count'], dimension_ids=['store'], analysis_kind='ranking',
            ranking={'limit': 5, 'metric_id': 'order_cancellation_rate', 'direction': 'top'}, time=MONTH,
            derived_features=['leader', 'top_gap'])]}
        pipeline = self.pipeline(f.scripted(raw, answer), executor=self.warehouse())
        proposal = pipeline.propose(self.request(capture['question'], analysis_depth='focused'))
        self.assertEqual(pipeline.provider.call_count, 2)
        self.assertEqual(proposal['diagnostics']['semantic_intent']['requirements'][0]['dimension_ids'], ['store'])

    def test_second_refusal_is_honored_with_the_original_category(self):
        for id, category in (('L43', 'unsupported_metric'), ('L21', 'forecast_unsupported')):
            with self.subTest(case=id):
                capture = RUN4[id]
                raw = deepcopy(capture['outputs'][0]); raw.pop('clarification', None)
                pipeline = self.pipeline(f.scripted(raw, deepcopy(raw)), executor=self.warehouse())
                with self.assertRaises(f.AnalysisError) as caught:
                    pipeline.propose(self.request(capture['question'], analysis_depth='focused'))
                self.assertEqual(caught.exception.category, category)
                self.assertLessEqual(pipeline.provider.call_count, 2)


class FourthRunL30Captured(FourthRunCaptured):
    def test_l30_captured_duplicate_sibling_requirement_is_discarded(self):
        reqs = self.run_first_output('L30')
        self.assertEqual([r['metric_ids'] for r in reqs if r['id'].startswith('req_') and r.get('availability') == 'requested'], [['revenue']])

    def test_l30_duplicate_is_discarded_even_when_model_adds_domains_and_features(self):
        capture = RUN4['L30']
        raw = deepcopy(capture['outputs'][0]); raw.pop('clarification', None)
        # The paid observer did not record these fields; the final live intent carried different domains.
        raw['requirements'][0].update(domain_id='orders', derived_features=['scalar'])
        raw['requirements'][1].update(domain_id='stores', derived_features=['scalar', 'contribution_share'])
        pipeline = self.pipeline(f.scripted(raw), executor=self.warehouse())
        proposal = pipeline.propose(self.request(capture['question'], analysis_depth='focused'))
        reqs = proposal['diagnostics']['semantic_intent']['requirements']
        self.assertEqual([r['metric_ids'] for r in reqs if r['id'].startswith('req_') and r.get('availability') == 'requested'], [['revenue']])
