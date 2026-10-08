"""Observed overview variants must finish without asking for external retries."""
import json
import unittest
from copy import deepcopy
from datetime import datetime,timedelta
from pathlib import Path
from unittest.mock import Mock,patch
from common import AiReportRefineRequest
from services.analysis_intent import AnalysisIntentEnvelope,IntentRequirement
from services.analytical_resolver import AnalyticalResolver,ResolutionIssues,compatibility_index
from services.request_anchors import request_anchors,complete_unique_grouping
from services.analysis_quality_service import verify_saved_report
from services.analysis_contract import MAX_ANALYTICAL_ROWS
from services.analysis_query import validate_results
from tests import test_hybrid_v28 as fixture
from tests.agent_fixtures import ScriptedProvider,call
from evals.fixture_warehouse import FixtureWarehouse,DATA,ORDERS

RECORDED=json.loads((Path(__file__).parent/'fixtures/overview_v283.json').read_text())
QUESTION=RECORDED['question']


class OverviewTests(unittest.TestCase):
    setUp=fixture.HybridTests.setUp
    pipeline=fixture.HybridTests.pipeline
    request=fixture.HybridTests.request

    def report(self,meaning,question=QUESTION):
        warehouse=FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        p=self.pipeline(fixture.scripted(meaning),executor=Mock(wraps=warehouse))
        request=self.request(question)
        proposal=p.propose(request)
        p.executor.assert_not_called()
        self.assertEqual(p.provider.call_count,1)
        self.assertEqual(proposal['outcome'],'SUCCESS')
        fixture.approve(request,proposal)
        report=p.generate(request)
        self.assertEqual(p.provider.call_count,1)
        self.assertEqual(report['outcome'],'SUCCESS')
        self.assertEqual(report['quality_assessment']['score'],90)
        self.assertEqual(report['quality_assessment'],verify_saved_report(report,self.catalog))
        return p,request,report,proposal

    def test_exact_failed_redis_intent_succeeds_in_one_interpretation(self):
        _,_,report,proposal=self.report(RECORDED['failed_intent'])
        self.assertEqual(len(report['analytical_queries']),8)
        self.assertTrue(all(c['state']=='RESOLVED' for c in report['resolved_requirement_coverage']))
        trend=next(q for q in report['analytical_queries'] if q['operation']=='trend')
        self.assertEqual(trend['group_by'],[])
        self.assertEqual(trend['granularity'],'week')
        self.assertEqual(len(report['result_sets'][trend['id']]['rows']),3)
        totals={e['metric']:e['values']['value'] for e in report['evidence'] if e['feature']=='scalar'}
        self.assertEqual(totals['revenue'],700)
        self.assertEqual(totals['order_count'],4)
        self.assertAlmostEqual(totals['aov'],700/3)
        raw=next(s for s in proposal['diagnostics']['interpreted_shapes'] if s['analysis_kind']=='trend')
        self.assertEqual(raw['dimension_ids'],['order_created'])
        self.assertTrue(proposal['diagnostics']['semantic_normalizations'])

    def test_observed_successful_variant_remains_valid(self):
        _,_,report,_=self.report(RECORDED['successful_intent'])
        self.assertEqual(len(report['analytical_queries']),7)
        self.assertEqual(len(report['charts']),5)

    def test_missing_store_axis_comes_only_from_unique_unrepresented_question_fact(self):
        meaning=deepcopy(RECORDED['successful_intent'])
        req=next(r for r in meaning['requirements'] if r['id']=='revenue_by_store')
        req.update(dimension_ids=[],lens_hint='item_sales') # advisory hint cannot select product axis
        _,_,report,proposal=self.report(meaning)
        fixed=next(r for r in report['semantic_intent']['requirements'] if r['id']==req['id'])
        self.assertEqual(fixed['dimension_ids'],['store'])
        self.assertEqual(fixed['metric_ids'],['revenue'])
        self.assertEqual(fixed['time']['amount'],90)
        self.assertTrue(any(n['rule']=='unique_unrepresented_explicit_grouping' for n in proposal['diagnostics']['semantic_normalizations']))

    def test_repeated_exact_bad_shape_has_stable_plan_without_user_retries(self):
        fingerprints=[]
        for _ in range(5):
            p=self.pipeline(fixture.scripted(RECORDED['failed_intent']))
            proposal=p.propose(self.request(QUESTION))
            self.assertEqual(p.provider.call_count,1)
            p.executor.assert_not_called()
            fingerprints.append(proposal['proposal']['resolved_plan_fingerprint'])
        self.assertEqual(len(set(fingerprints)),1)

    def test_more_than_two_thousand_order_instants_are_aggregated_not_truncated(self):
        orders=[]
        for i in range(2010):
            orders.append({**ORDERS[0],'ma_don_hang':'bulk'+str(i),'co_so_ma':'s1' if i%2 else 's2',
                'tong_tien':100,'ngay_tao':(datetime(2026,9,1)+timedelta(minutes=20*i)).isoformat()})
        with patch.dict(DATA,{'don_hang':orders}):
            _,_,report,_=self.report(RECORDED['failed_intent'])
        trend=next(q for q in report['analytical_queries'] if q['operation']=='trend')
        rows=report['result_sets'][trend['id']]['rows']
        self.assertEqual(len(rows),5)
        self.assertEqual(sum(r['revenue'] for r in rows),201000)
        totals={e['metric']:e['values']['value'] for e in report['evidence'] if e['feature']=='scalar'}
        self.assertEqual(totals['order_count'],2010)
        self.assertEqual(totals['revenue'],201000)
        self.assertEqual(totals['aov'],100)

    def test_clock_normalization_preserves_independent_axes_expressions_and_filters(self):
        resolver=AnalyticalResolver(self.catalog,fixture.REFERENCE)
        req=IntentRequirement(id='trend',metric_ids=['revenue'],analysis_kind='trend',granularity='week',
            dimension_ids=['order_created','city','hour'],filters=[dict(dimension='order_created',operator='gte',value='2026-09-01')])
        actual=resolver.normalize(req)
        self.assertEqual(actual.dimension_ids,['city','hour'])
        self.assertEqual(actual.filters,req.filters)
        self.assertEqual(resolver.normalize(actual),actual)
        req.metric_ids=['payment_revenue'] # a different primary observation clock
        self.assertIn('order_created',resolver.normalize(req).dimension_ids)

    def test_scalar_total_feature_preserves_average_in_its_own_population(self):
        _,_,report,_=self.report(RECORDED['failed_intent'])
        for r in report['semantic_intent']['requirements']:
            if r['id'].startswith('req_total_'):self.assertEqual(r['derived_features'],['scalar'])
        aov=next(q for q in report['analytical_queries'] if q['metrics']==['aov'])
        count=next(q for q in report['analytical_queries'] if q['metrics']==['order_count'])
        self.assertNotEqual(aov['id'],count['id'])
        self.assertEqual(report['result_sets'][count['id']]['rows'][0]['order_count'],4)
        self.assertAlmostEqual(report['result_sets'][aov['id']]['rows'][0]['aov'],700/3)

    def test_grouping_completion_never_guesses_between_multiple_goals_or_axes(self):
        index=compatibility_index(self.catalog);anchors=request_anchors(QUESTION,self.catalog,{})
        intent=AnalysisIntentEnvelope.model_validate(RECORDED['successful_intent'])
        for r in intent.requirements:
            if r.ranking:r.dimension_ids=[]
        actual,changes=complete_unique_grouping(intent,anchors,index)
        self.assertEqual(actual,intent);self.assertEqual(changes,[])
        intent.requirements=[IntentRequirement(id='r1',metric_ids=['revenue'],analysis_kind='distribution')]
        actual,changes=complete_unique_grouping(intent,anchors,index)
        self.assertEqual(actual,intent);self.assertEqual(changes,[])
        for question,metric in [('Doanh thu', 'revenue'),('Doanh thu theo sản phẩm','revenue'),('Doanh thu theo thành phố','unknown')]:
            intent.requirements[0].metric_ids=[metric]
            actual,changes=complete_unique_grouping(intent,request_anchors(question,self.catalog,{}),index)
            self.assertEqual(actual,intent);self.assertEqual(changes,[])

    def test_true_overflow_still_fails_the_same_two_thousand_row_contract(self):
        from tests.test_agent_v22 import fixture_artifact,query
        a,_=fixture_artifact(query('orders','revenue','trend',granularity='week',time={'kind':'relative','mode':'all_time'}))
        self.assertEqual(a.plan.row_limit,MAX_ANALYTICAL_ROWS)
        self.assertEqual(MAX_ANALYTICAL_ROWS,2000)
        rows=[dict(period=(datetime(1980,1,7)+timedelta(weeks=i)).isoformat(),revenue=1) for i in range(2001)]
        result=dict(columns=['period','revenue'],rows=rows,truncated=False)
        verdict=validate_results(result,a.plan,a.grounded,self.catalog)
        self.assertFalse(verdict.valid)
        self.assertTrue(any('population exceeds' in e for e in verdict.errors))
        result['rows']=rows[:2000]
        self.assertTrue(validate_results(result,a.plan,a.grounded,self.catalog).valid)

    def test_refinement_after_normalization_keeps_weekly_clock_and_other_requirements(self):
        p,request,report,_=self.report(RECORDED['failed_intent'])
        p.provider=ScriptedProvider([call('submit_analysis_delta',dict(changes=[dict(action='update',requirement_id='req_store_rank',changes={'ranking':{'limit':2}})]))])
        refined=p.refine(AiReportRefineRequest(session_id=request.session_id,current_report={'revision':report['revision']},feedback='Đổi xếp hạng chi nhánh thành Top 2, giữ nguyên các phần còn lại.'))
        self.assertEqual(p.provider.call_count,1)
        self.assertEqual(refined['quality_assessment'],verify_saved_report(refined,self.catalog))
        trend=next(r for r in refined['semantic_intent']['requirements'] if r['analysis_kind']=='trend')
        self.assertEqual(trend['dimension_ids'],[]);self.assertEqual(trend['granularity'],'week')
