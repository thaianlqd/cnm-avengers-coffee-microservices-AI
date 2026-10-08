"""Reported comparison failure, meaningful derived views and score adversaries."""
import unittest
from copy import deepcopy
from unittest.mock import Mock
from common import AiReportRefineRequest
from services.analysis_intent import AnalysisIntentEnvelope
from services.analytical_resolver import AnalyticalResolver,ResolutionIssues
from services.analysis_quality_service import verify_saved_report
from services.verification_score import verification_score,WEIGHTS
from tests import test_hybrid_v28 as fixture
from tests.agent_fixtures import ScriptedProvider,call
from evals.fixture_warehouse import FixtureWarehouse

QUESTION='So sánh doanh thu, số đơn và giá trị đơn trung bình giữa TP.HCM và Hà Nội trong 90 ngày gần nhất.'


def meaning(kind='cross_tab'):
    return fixture.requirement(id='req_1',goal='So sánh hoạt động giữa hai thành phố',domain_id='orders',
        metric_ids=['revenue','order_count','aov'],dimension_ids=['city'],analysis_kind=kind,
        ranking=None,time=dict(kind='rolling',amount=90,unit='day'),derived_features=['group_gap'],
        filters=[dict(dimension='city',operator='in',value=['TP.HCM','Hà Nội'])])


class ComparisonScoreTests(unittest.TestCase):
    setUp=fixture.HybridTests.setUp
    pipeline=fixture.HybridTests.pipeline
    request=fixture.HybridTests.request

    def report(self,req=None,question=fixture.SCENARIO_A):
        warehouse=FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        p=self.pipeline(fixture.scripted(fixture.envelope(req or fixture.requirement())),executor=Mock(wraps=warehouse))
        request=self.request(question,analysis_context='Chỉ xét hai thành phố trên.' if req else 'Toàn bộ chi nhánh.',
            analysis_expectation='Bảng so sánh, biểu đồ phù hợp và nêu khác biệt chính.' if req else 'Biểu đồ cột và tỷ trọng doanh thu.')
        proposal=p.propose(request);fixture.approve(request,proposal)
        return p,request,p.generate(request)

    def test_reported_one_axis_cross_tab_canonicalizes_without_retry_or_scope_loss(self):
        fingerprints=[]
        for kind in ('cross_tab','comparison','aggregate'):
            p=self.pipeline(fixture.scripted(fixture.envelope(meaning(kind))))
            proposal=p.propose(self.request(QUESTION,analysis_context='Chỉ xét hai thành phố trên.',analysis_expectation='Bảng so sánh, biểu đồ phù hợp và nêu khác biệt chính.'))
            self.assertEqual(p.provider.call_count,1);p.executor.assert_not_called()
            intent=proposal['diagnostics']['semantic_intent']['requirements'][0]
            self.assertEqual(intent['analysis_kind'],'aggregate')
            self.assertEqual(intent['dimension_ids'],['city'])
            self.assertEqual(set(intent['filters'][0]['value']),{'Hồ Chí Minh','Hà Nội'})
            self.assertEqual(intent['time']['amount'],90)
            queries=proposal['proposal']['analytical_queries']
            self.assertEqual(len(queries),2) # valid-order revenue/AOV vs all-order count
            self.assertEqual({q['operation'] for q in queries},{'aggregate'})
            self.assertTrue(all(q['group_by']==['city'] for q in queries))
            fingerprints.append(proposal['proposal']['resolved_plan_fingerprint'])
        self.assertEqual(len(set(fingerprints)),1)

    def test_real_two_axis_cross_tab_is_preserved_and_missing_axes_not_invented(self):
        req=meaning();req['dimension_ids']=['city','order_type']
        resolved=AnalyticalResolver(self.catalog,fixture.REFERENCE).resolve(AnalysisIntentEnvelope.model_validate(fixture.envelope(req)))
        self.assertEqual(resolved['intent'].requirements[0].analysis_kind,'cross_tab')
        self.assertTrue(all(set(q['group_by'])=={'city','order_type'} for q in resolved['operations']))
        req['dimension_ids']=[]
        with self.assertRaises(ResolutionIssues):AnalyticalResolver(self.catalog,fixture.REFERENCE).resolve(AnalysisIntentEnvelope.model_validate(fixture.envelope(req)))

    def test_comparison_executes_correct_populations_and_three_metric_views(self):
        p,request,report=self.report(meaning(),QUESTION)
        self.assertEqual(p.provider.call_count,1)
        self.assertEqual(report['outcome'],'SUCCESS')
        self.assertEqual(len(report['charts']),3)
        observed={}
        for result in report['result_sets'].values():
            for row in result['rows']:observed.setdefault(row['city'],{}).update({k:v for k,v in row.items() if k!='city'})
        self.assertEqual(observed['Hồ Chí Minh'],dict(revenue=300,aov=150,order_count=2))
        self.assertEqual(observed['Hà Nội'],dict(revenue=400,aov=400,order_count=2))
        self.assertEqual(report['quality_assessment']['score'],90)
        self.assertEqual(report['quality_assessment'],verify_saved_report(report,self.catalog))

    def test_comparison_refines_to_one_city_by_store_without_losing_window(self):
        p,request,report=self.report(meaning(),QUESTION)
        p.provider=ScriptedProvider([call('submit_analysis_delta',dict(changes=[dict(action='update',requirement_id='req_1',changes=dict(
            dimension_ids=['store'],filters=[dict(dimension='city',value='Hà Nội')]))]))])
        refined=p.refine(AiReportRefineRequest(session_id=request.session_id,current_report={'revision':report['revision']},feedback='Chỉ giữ Hà Nội, phân tích theo chi nhánh.'))
        req=refined['semantic_intent']['requirements'][0]
        self.assertEqual(req['time']['amount'],90)
        self.assertEqual(req['dimension_ids'],['store'])
        self.assertEqual(req['filters'][0]['value'],'Hà Nội')
        self.assertEqual(p.provider.call_count,1)
        self.assertEqual(refined['quality_assessment'],verify_saved_report(refined,self.catalog))

    def test_requested_shares_have_third_view_using_full_denominator_not_topn_sum(self):
        p,request,report=self.report()
        self.assertEqual(len(report['charts']),3)
        chart=next(c for c in report['charts'] if c.get('value_transform')=='contribution_share')
        self.assertEqual(chart['unit'],'%')
        self.assertEqual(chart['denominator_selection'],'complete')
        self.assertTrue(all(r['denominator']==600 for r in chart['data']))
        self.assertEqual(sorted(r['numerator'] for r in chart['data']),[200,400])
        self.assertAlmostEqual(sum(r['value'] for r in chart['data']),100) # only two in-scope fixture products
        self.assertEqual(p.executor.call_count,2) # ranking + already-required denominator only
        self.assertEqual(report['quality_assessment']['score'],90)
        self.assertEqual(report['quality_assessment'],verify_saved_report(report,self.catalog))

    def test_share_view_tampering_and_duplicate_views_reduce_score(self):
        _,_,report=self.report()
        for mutation in ('percentage','denominator','evidence','duplicate','missing'):
            bad=deepcopy(report)
            chart=next(c for c in bad['charts'] if c.get('value_transform'))
            if mutation=='percentage':chart['data'][0]['value']=99
            elif mutation=='denominator':chart['data'][0]['denominator']=999
            elif mutation=='evidence':chart['evidence_refs']=[]
            elif mutation=='duplicate':bad['charts'].append(deepcopy(chart))
            else:bad['charts'].remove(chart)
            q=verify_saved_report(bad,self.catalog)
            self.assertLess(q['score'],90)
            self.assertEqual(q['status'],'partially_verified')

    def test_selected_share_is_not_renormalized_to_one_hundred_percent(self):
        req=fixture.requirement(ranking={'limit':1,'metric_id':'product_revenue'},derived_features=['contribution_share'])
        p,_,report=self.report(req,'Top 1 món theo doanh thu, kèm tỷ trọng doanh thu trong 30 ngày gần nhất.')
        chart=next(c for c in report['charts'] if c.get('value_transform'))
        self.assertEqual(len(chart['data']),1)
        self.assertEqual(chart['data'][0]['denominator'],600)
        self.assertEqual(chart['data'][0]['numerator'],400)
        self.assertAlmostEqual(chart['data'][0]['value'],100*400/600)
        self.assertEqual(report['quality_assessment']['score'],90)
        self.assertEqual(p.executor.call_count,2)

    def test_missing_or_tampered_stored_score_never_changes_recomputed_index(self):
        _,_,report=self.report()
        original=report['quality_assessment']
        report['quality_assessment']=dict(score=100,accuracy_assessment=dict(status='measured',reference_count=1,matched_count=1,accuracy_pct=100,reference_source='client'))
        self.assertEqual(verify_saved_report(report,self.catalog),original)
        self.assertEqual(original['accuracy_assessment']['status'],'not_measured')
        self.assertIsNone(original['confidence_probability'])


class VerificationScoreTests(unittest.TestCase):
    def checks(self):
        return [dict(id=id,label=id,passed=10,total=10,status='passed',summary='Observed checks') for id in WEIGHTS]

    def test_perfect_internal_checks_leave_independent_budget_unearned(self):
        scored=verification_score(self.checks())
        self.assertEqual(scored['score'],90)
        self.assertEqual(sum(p['earned_points'] for p in scored['score_breakdown']),90)
        self.assertEqual(scored['score_method']['unmeasured_points'],10)

    def test_failed_scope_has_more_effect_than_more_claims_or_charts(self):
        checks=self.checks();checks[0].update(passed=0,status='failed')
        self.assertEqual(verification_score(checks)['score'],70)
        for c in checks[1:]:c.update(passed=10000,total=10000)
        self.assertEqual(verification_score(checks)['score'],70)

    def test_one_wrong_claim_lowers_score_without_integer_rounding_it_away(self):
        checks=self.checks();e=next(c for c in checks if c['id']=='evidence_grounding')
        e.update(passed=46,total=47,status='partial')
        self.assertEqual(verification_score(checks)['score'],89.8)

    def test_not_applicable_work_is_not_penalized(self):
        checks=self.checks()
        for c in checks:
            if c['id'] in {'visualization_appropriateness','derived_features'}:c.update(passed=0,total=0,status='not_applicable')
        scored=verification_score(checks)
        self.assertEqual(scored['score'],90)
        self.assertAlmostEqual(sum(p['possible_points'] for p in scored['score_breakdown']),100,places=3)

    def test_independent_reference_counts_not_self_reported_percentage(self):
        reference=dict(status='measured',matched_count=2,reference_count=4,accuracy_pct=100,reference_source='trusted test oracle')
        scored=verification_score(self.checks(),independent_accuracy=reference)
        self.assertEqual(scored['score'],95) # counts drive 5 points, not the supplied 100%
        self.assertEqual(scored['score_method']['unmeasured_points'],0)

    def test_invalid_counts_duplicate_groups_and_missing_sources_rejected(self):
        for checks in (self.checks()+[self.checks()[0]],self.checks()[:-1]):
            with self.assertRaises(ValueError):verification_score(checks)
        checks=self.checks();checks[0]['passed']=11
        with self.assertRaises(ValueError):verification_score(checks)
        self.assertEqual(verification_score(self.checks(),independent_accuracy=dict(status='measured',matched_count=1,reference_count=1,accuracy_pct=100))['score'],90)
