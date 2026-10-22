"""Two explicit periods stay independent through compile, report and replay."""
from copy import deepcopy
import json
from pathlib import Path
from unittest.mock import patch

from tests import test_hybrid_v28 as f
from services.time_resolution_service import parse_time
from services.analysis_intent import AnalysisIntentEnvelope
from services.analytical_resolver import AnalyticalResolver
from services.analysis_quality_service import verify_saved_report


QUESTION = 'So sánh doanh thu tháng 8 với tháng 9 năm 2026'


def intent(**changes):
    return f.envelope(f.requirement(metric_ids=['revenue'], dimension_ids=[],
        analysis_kind='aggregate', ranking=None, derived_features=[],
        time={'kind':'month','month':9,'year':2026},
        comparison_time={'kind':'month','month':8,'year':2026}, **changes))


class PeriodComparisonTests(f.unittest.TestCase):
    setUp = f.HybridTests.setUp
    pipeline = f.HybridTests.pipeline
    request = f.HybridTests.request

    def warehouse(self, baseline=100):
        from evals import fixture_warehouse as w
        data = deepcopy(w.DATA)
        data['don_hang'].append({**data['don_hang'][0], 'ma_don_hang':'august',
            'tong_tien':baseline, 'ngay_tao':'2026-08-15T10:00:00'})
        with patch.object(w,'DATA',data):
            warehouse = w.FixtureWarehouse(self.catalog.overlay)
        self.addCleanup(warehouse.close)
        return warehouse

    def test_shared_trailing_year_and_explicit_cross_year_are_not_reference_year_guesses(self):
        for text, expected in [
            (QUESTION, [(8,2026),(9,2026)]),
            ('So sánh tháng 12 với tháng 1 năm 2025', [(12,2025),(1,2025)]),
            ('So sánh tháng 12 năm 2025 với tháng 1 năm 2026', [(12,2025),(1,2026)]),
            ('Tháng 8. Tháng 9 năm 2025', [(8,None),(9,2025)])]:
            with self.subTest(text=text):
                parsed=parse_time(text,self.catalog.registry['interpretation'],self.catalog.registry['timezone'])
                self.assertEqual([(p['month'],p.get('year')) for p in parsed['recognized_time_parts']],expected)

    def test_comparison_report_uses_two_full_aggregates_and_replays_every_number(self):
        pipeline=self.pipeline(f.scripted(intent()),executor=self.warehouse())
        request=self.request(QUESTION,analysis_depth='focused')
        proposal=pipeline.propose(request)
        queries=[q for q in proposal['proposal']['analytical_queries'] if q['role']=='requested']
        self.assertEqual(len(queries),2)
        self.assertEqual({(q['time']['start'],q['time']['end']) for q in queries},
            {('2026-08-01','2026-08-31'),('2026-09-01','2026-09-30')})
        report=pipeline.generate(f.approve(request,proposal))
        comparison=next(e for e in report['evidence'] if e['feature']=='period_comparison')
        self.assertEqual({k:comparison['values'][k] for k in ('current','baseline','delta','change_pct')},
            dict(current=700,baseline=100,delta=600,change_pct=600))
        self.assertIn('2026-08-01',report['conclusion']['answer'])
        self.assertIn('2026-09-01',report['conclusion']['answer'])
        self.assertEqual(report['verification']['status'],'verified')
        self.assertEqual(pipeline.provider.call_count,1)
        bad=deepcopy(report)
        next(e for e in bad['evidence'] if e['feature']=='period_comparison')['values']['delta']=999999
        self.assertNotEqual(verify_saved_report(bad,self.catalog)['status'],'verified')

    def test_zero_baseline_has_no_invented_percentage(self):
        pipeline=self.pipeline(f.scripted(intent()),executor=self.warehouse(baseline=0))
        request=self.request(QUESTION,analysis_depth='focused')
        report=pipeline.generate(f.approve(request,pipeline.propose(request)))
        comparison=next(e for e in report['evidence'] if e['feature']=='period_comparison')
        self.assertEqual(comparison['values']['baseline'],0)
        self.assertIsNone(comparison['values']['change_pct'])
        self.assertIn('bằng 0',comparison['statement'])

    def test_recorded_empty_l41_can_use_one_repair_with_two_explicit_periods(self):
        capture=next(c for c in json.loads((Path(__file__).parent/'fixtures/v34_live44_rerun2_failed_intents.json').read_text())['cases'] if c['id']=='L41')
        first=deepcopy(capture['outputs'][0]);first.pop('clarification',None)
        fixed=intent();fixed['requirements'][0]['comparison_time']={'kind':'range','start':'2026-08-01','end':'2026-08-31'}
        pipeline=self.pipeline(f.scripted(first,fixed),executor=self.warehouse())
        request=self.request(capture['question'],analysis_depth='focused')
        report=pipeline.generate(f.approve(request,pipeline.propose(request)))
        self.assertEqual(pipeline.provider.call_count,2)
        self.assertEqual(report['verification']['status'],'verified')
        self.assertEqual(next(e for e in report['evidence'] if e['feature']=='period_comparison')['values']['delta'],600)

    def test_refinement_cannot_change_baseline_without_explicit_new_period(self):
        from services.request_anchors import refinement_anchors
        baseline=intent()
        history=[{'feedback':'Đổi màu biểu đồ', 'delta':{'changes':[{'action':'update','requirement_id':'r1',
            'changes':{'comparison_time':{'kind':'month','month':7,'year':2026}}}]}}]
        with self.assertRaises(f.AnalysisError):
            refinement_anchors(QUESTION,baseline,history,self.catalog,{},f.REFERENCE)

    def test_union_range_is_not_accepted_as_two_periods(self):
        raw=intent(); req=raw['requirements'][0]
        req.pop('comparison_time');req['time']={'kind':'range','start':'2026-08-01','end':'2026-09-30'}
        pipeline=self.pipeline(f.scripted(raw,deepcopy(raw)))
        with self.assertRaises(f.AnalysisError):pipeline.propose(self.request(QUESTION))
        pipeline.executor.assert_not_called()
        self.assertLessEqual(pipeline.provider.call_count,2)

    def test_wrong_baseline_year_or_invented_baseline_cannot_pass_request_anchors(self):
        for question,baseline in [(QUESTION,{'kind':'month','month':8,'year':2025}),
                                  ('Doanh thu tháng 9 năm 2026',{'kind':'month','month':8,'year':2026})]:
            raw=intent();raw['requirements'][0]['comparison_time']=baseline
            pipeline=self.pipeline(f.scripted(raw,deepcopy(raw)))
            with self.subTest(question=question),self.assertRaises(f.AnalysisError):pipeline.propose(self.request(question))
            pipeline.executor.assert_not_called()

    def test_overlap_and_grouped_or_ranked_shapes_are_rejected(self):
        for change in [{'comparison_time':{'kind':'month','month':9,'year':2026}},
                       {'dimension_ids':['store']}, {'analysis_kind':'detail','metric_ids':[]},
                       {'analysis_kind':'ranking','dimension_ids':['store'],
                        'ranking':{'metric_id':'revenue','limit':5}}]:
            raw=intent();raw['requirements'][0].update(change)
            with self.subTest(change=change),self.assertRaises(f.AnalysisError):
                AnalyticalResolver(self.catalog,f.REFERENCE).resolve(AnalysisIntentEnvelope.model_validate(raw))
