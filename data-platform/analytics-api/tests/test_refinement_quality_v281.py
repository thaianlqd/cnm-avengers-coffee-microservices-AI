"""Regressions for the reported Top 2 failure and misleading perfect scores."""
import json
import unittest
from copy import deepcopy
from itertools import permutations
from unittest.mock import Mock
from common import AiReportRefineRequest
from services.analysis_catalog import AnalysisError
from services.analysis_intent import AnalysisIntentEnvelope
from services.analytical_resolver import ResolutionIssues
from services.hybrid_analyst_planner import apply_delta
from services.analysis_quality_service import verify_saved_report
from services.reference_accuracy import measure_reference_accuracy, matches_reference
from services.session_service import get_session
from tests import test_hybrid_v28 as fixture
from tests.agent_fixtures import ScriptedProvider, call
from evals.fixture_warehouse import FixtureWarehouse

FEEDBACK = 'Đổi thành Top 2, giữ nguyên thời gian và phạm vi.'


def update(**fields):
    return dict(action='update',requirement_id='r1',changes=fields)


def provider(*deltas):
    return ScriptedProvider(*[[call('submit_analysis_delta',d)] for d in deltas])


class RefinementQualityTests(unittest.TestCase):
    setUp = fixture.HybridTests.setUp
    pipeline = fixture.HybridTests.pipeline
    request = fixture.HybridTests.request

    def report(self):
        warehouse = FixtureWarehouse(self.catalog.overlay)
        self.addCleanup(warehouse.close)
        p = self.pipeline(executor=Mock(wraps=warehouse))
        req = self.request()
        fixture.approve(req,p.propose(req))
        return p,req,p.generate(req)

    def refine(self,p,req,report,feedback=FEEDBACK):
        return p.refine(AiReportRefineRequest(session_id=req.session_id,current_report={'revision':report['revision']},feedback=feedback))

    def test_disjoint_and_identical_updates_are_order_independent_atomic(self):
        original = AnalysisIntentEnvelope.model_validate(fixture.envelope())
        patches = [update(ranking={'limit':2}),update(ranking={'metric_id':'product_revenue'}),
            update(time=fixture.requirement()['time']),update(ranking={'limit':2})]
        for ordered in permutations(patches):
            result = apply_delta(original,{'changes':list(ordered)}).requirements[0]
            self.assertEqual(result.ranking.limit,2)
            self.assertEqual(result.ranking.metric_id,'product_revenue')
            self.assertEqual(result.time,original.requirements[0].time)
            self.assertEqual(result.metric_ids,original.requirements[0].metric_ids)
        self.assertEqual(original.requirements[0].ranking.limit,5)

    def test_conflicting_repeated_fields_never_last_write_wins(self):
        original = AnalysisIntentEnvelope.model_validate(fixture.envelope())
        for changes in ([update(ranking={'limit':2}),update(ranking={'limit':3})],
                        [update(metric_ids=['product_revenue']),update(metric_ids=['quantity_sold'])],
                        [update(ranking={'limit':2}),dict(action='remove',requirement_id='r1')]):
            with self.assertRaises(ResolutionIssues) as caught:apply_delta(original,{'changes':changes})
            self.assertEqual(caught.exception.issues[0]['code'],'duplicate_delta')
            self.assertEqual(original.requirements[0].ranking.limit,5)

    def test_partial_ranking_preserves_metric_direction_and_group(self):
        original = AnalysisIntentEnvelope.model_validate(fixture.envelope(fixture.requirement(
            ranking=dict(limit=5,metric_id='product_revenue',direction='bottom',per_group=['city']))))
        ranked = apply_delta(original,{'changes':[update(ranking={'limit':2})]}).requirements[0].ranking
        self.assertEqual(ranked.model_dump(),dict(limit=2,metric_id='product_revenue',direction='bottom',per_group=['city']))

    def test_reported_feedback_accepts_multiple_patches_with_no_repair(self):
        p,req,report = self.report()
        p.provider = provider({'changes':[update(ranking={'limit':2}),update(time=fixture.requirement()['time']),update(filters=[])]})
        refined = self.refine(p,req,report)
        self.assertEqual(p.provider.call_count,1)
        old,new = report['semantic_intent']['requirements'][0],refined['semantic_intent']['requirements'][0]
        self.assertEqual(new['ranking']['limit'],2)
        for field in old.keys()-{'ranking'}:self.assertEqual(old[field],new[field],field)
        self.assertEqual(refined['quality_assessment'],verify_saved_report(refined,self.catalog))
        self.assertEqual(len(refined['provenance']['semantic_history']),1)

    def test_conflict_recovery_keeps_delta_protocol_and_complete_baseline(self):
        p,req,report = self.report()
        conflict = {'changes':[update(ranking={'limit':2}),update(ranking={'limit':3})]}
        p.provider = provider(conflict,{'changes':[update(ranking={'limit':2})]})
        refined = self.refine(p,req,report)
        self.assertEqual(p.provider.call_count,2)
        self.assertTrue(all(r['tools'][0]['name']=='submit_analysis_delta' for r in p.provider.requests))
        repair = json.loads(p.provider.requests[1]['messages'][0]['content'])
        self.assertEqual(AnalysisIntentEnvelope.model_validate(repair['current_intent']).model_dump(mode='json'),report['semantic_intent'])
        self.assertEqual(repair['rejected_delta'],conflict)
        self.assertEqual(refined['semantic_intent']['requirements'][0]['metric_ids'],['product_revenue','quantity_sold'])
        self.assertEqual(refined['semantic_intent']['requirements'][0]['ranking']['limit'],2)
        self.assertEqual(refined['quality_assessment'],verify_saved_report(refined,self.catalog))

    def test_bad_delta_envelope_recovers_without_full_intent_replacement(self):
        p,req,report = self.report()
        p.provider = provider({'changes':[{'action':'update','changes':{'ranking':{'limit':2}}}]},
            {'changes':[update(ranking={'limit':2})]})
        refined = self.refine(p,req,report)
        self.assertEqual(p.provider.call_count,2)
        self.assertEqual(refined['semantic_intent']['requirements'][0]['ranking']['limit'],2)
        self.assertEqual(refined['semantic_intent']['requirements'][0]['time'],report['semantic_intent']['requirements'][0]['time'])

    def test_scope_drift_never_executes_or_overwrites_previous_report(self):
        p,req,report = self.report()
        bad = {'changes':[update(ranking={'limit':2},time={'kind':'relative','mode':'all_time'})]}
        p.provider = provider(bad,bad,bad)
        p.executor.reset_mock()
        with self.assertRaises(AnalysisError):self.refine(p,req,report)
        p.executor.assert_not_called()
        self.assertEqual(p.provider.call_count,3)
        session = get_session(req.session_id)
        self.assertEqual(session.owner_id,'owner-a')
        self.assertEqual(session.semantic_intent,report['semantic_intent'])

    def test_repair_cannot_modify_untargeted_accepted_fields(self):
        p,req,report = self.report()
        # Primary has valid Top 2 but an unknown dimension; repair must retain
        # that accepted ranking instead of silently resetting it to Top 5.
        p.provider = provider({'changes':[update(ranking={'limit':2},dimension_ids=['unknown'])]},
            {'changes':[update(dimension_ids=['product'])]},
            {'changes':[update(ranking={'limit':2},dimension_ids=['product'])]})
        refined = self.refine(p,req,report)
        self.assertEqual(p.provider.call_count,3)
        self.assertEqual(refined['semantic_intent']['requirements'][0]['ranking']['limit'],2)

    def test_repeated_refinements_replay_history_and_preserve_window(self):
        p,req,report = self.report()
        for limit in (2,3,2):
            p.provider = provider({'changes':[update(ranking={'limit':limit})]})
            report = self.refine(p,req,report,feedback=f'Đổi thành Top {limit}, giữ nguyên thời gian và phạm vi.')
            self.assertEqual(report['semantic_intent']['requirements'][0]['ranking']['limit'],limit)
            self.assertEqual(report['quality_assessment'],verify_saved_report(report,self.catalog))
        self.assertEqual(len(report['provenance']['semantic_history']),3)

    def test_perfect_internal_checks_never_claim_accuracy_or_confidence(self):
        _,_,report = self.report()
        q = report['quality_assessment']
        self.assertEqual(q['score'],90)
        self.assertEqual(q['score_method']['unmeasured_points'],10)
        self.assertEqual(q['measurement_mode'],'evidence_checks')
        self.assertEqual(q['status'],'verified')
        self.assertEqual(q['accuracy_assessment']['status'],'not_measured')
        self.assertIsNone(q['accuracy_assessment']['accuracy_pct'])
        self.assertIsNone(q['confidence_probability'])
        self.assertTrue(all(c['passed']==c['total'] for c in q['verification_checks']))
        report['quality_assessment']={'score':100,'accuracy_assessment':{'status':'measured','accuracy_pct':100}}
        self.assertEqual(verify_saved_report(report,self.catalog),q)

    def test_false_claims_and_wrong_chart_ranking_reduce_observed_checks(self):
        _,_,report = self.report()
        for mutation in ('claim','chart'):
            bad = deepcopy(report)
            if mutation=='claim':bad['key_findings'][0]['value']=999999
            else:bad['charts'][0]['ranking_metric_label']='Số lượng bán'
            q = verify_saved_report(bad,self.catalog)
            self.assertEqual(q['status'],'partially_verified')
            check = next(c for c in q['verification_checks'] if c['id']==('evidence_grounding' if mutation=='claim' else 'visualization_appropriateness'))
            self.assertLess(check['passed'],check['total'])
            self.assertLess(q['score'],90)

    def test_null_metric_values_are_visible_and_reduce_data_check(self):
        warehouse = FixtureWarehouse(self.catalog.overlay)
        self.addCleanup(warehouse.close)
        def execute(sql,**kwargs):
            data = warehouse(sql,**kwargs)
            for row in data['rows']:
                if 'quantity_sold' in row:row['quantity_sold']=None
            return data
        p=self.pipeline(executor=execute)
        req=self.request();fixture.approve(req,p.propose(req));report=p.generate(req)
        q=report['quality_assessment']
        observed=next(c for c in q['verification_checks'] if c['id']=='observed_values')
        self.assertLess(observed['passed'],observed['total'])
        self.assertEqual(q['status'],'partially_verified')

    def test_export_shows_counts_and_unknown_accuracy_instead_of_perfect_score(self):
        from services.docx_service import generate_report_docx
        from docx import Document
        _,_,report=self.report()
        text=' '.join(p.text for p in Document(generate_report_docx(report)).paragraphs)
        self.assertIn('Độ chính xác đối chứng: Chưa đo',text)
        self.assertNotIn('100/100',text)
        self.assertIn('Điểm kiểm chứng tổng: 90/100',text)
        self.assertIn('Xác suất trả lời đúng: Chưa hiệu chuẩn',text)


class ReferenceAccuracyTests(unittest.TestCase):
    def test_reference_accuracy_counts_wrong_results_instead_of_self_rating(self):
        result=measure_reference_accuracy([
            dict(id='total',observed=600,expected=600),
            dict(id='share',observed=66.6666667,expected=200/3),
            dict(id='ranking',observed=['A','B'],expected=['B','A']),
            dict(id='scope',observed={'days':30},expected={'days':60}),
        ],reference_source='independent fixture assertions')
        self.assertEqual(result['assessment']['accuracy_pct'],50)
        self.assertEqual(result['assessment']['matched_count'],2)
        self.assertEqual(result['assessment']['reference_count'],4)

    def test_missing_extra_nonfinite_and_type_errors_fail_reference(self):
        for observed,expected in [(float('nan'),1),(float('inf'),float('inf')),(True,1),('1',1),({'a':1},{'a':1,'b':2}),({'a':1,'b':2},{'a':1}),([1],[1,2])]:
            self.assertFalse(matches_reference(observed,expected))
        self.assertFalse(matches_reference(100.1,100))
        self.assertTrue(matches_reference(100.001,100))

    def test_absent_reference_is_unmeasured_and_duplicate_assertions_rejected(self):
        self.assertIsNone(measure_reference_accuracy([],reference_source='fixture')['assessment']['accuracy_pct'])
        with self.assertRaises(ValueError):measure_reference_accuracy([dict(id='a',observed=1,expected=1)]*2,reference_source='fixture')
