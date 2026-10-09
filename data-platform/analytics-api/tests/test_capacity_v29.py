"""Capacity qualification: scripted meaning, real compiler, independent fixtures.

No provider/warehouse transports. These qualify server behavior and arithmetic,
not live model accuracy. Keep generated data out of version control.
"""
import json
import os
import time
import unittest
from copy import deepcopy
from dataclasses import replace
from datetime import datetime, timedelta
from unittest.mock import Mock, patch

from services.analysis_catalog import AnalysisError
from services.analysis_intent import AnalysisIntentEnvelope
from services.analytical_resolver import AnalyticalResolver
from services.analytical_capacity_planner import AnalyticalCapacityContract, AnalyticalCapacityPlanner, period_count
from services.result_artifact_store import ResultArtifactStore, artifact_store, fingerprint, serialized
from services.session_service import get_session, encode_session, decode_session, ReportSession
from services.analysis_quality_service import verify_saved_report
from services.analysis_pipeline import safe_failure
from tests import test_hybrid_v28 as f
from evals.fixture_warehouse import FixtureWarehouse, DATA, ORDERS, LINES, PRODUCTS, STORES


def req(id, metrics, dimensions=(), kind='aggregate', days=90, features=(), **extra):
    fields = dict(id=id, domain_id=None, metric_ids=list(metrics), dimension_ids=list(dimensions),
        analysis_kind=kind, ranking=None, derived_features=list(features), time=dict(kind='rolling', amount=days, unit='day'))
    fields.update(extra)
    return f.requirement(**fields)


def large_data():
    stores = [dict(STORES[0],ma_chi_nhanh=f's{i}',ten_chi_nhanh=f'Chi nhánh {i}',thanh_pho='Hà Nội' if i%2 else 'Hồ Chí Minh') for i in range(350)]
    products = [dict(PRODUCTS[0],ma_san_pham=f'p{i}',ten_san_pham=f'Món {i}') for i in range(2500)]
    vouchers = [dict(ma_khuyen_mai=f'v{i}',ten_khuyen_mai='Cùng chương trình' if i<2 else f'Ưu đãi {i}') for i in range(2500)]
    orders, lines, payments = [], [], []
    for i in range(4550):
        day = (datetime(2026,7,15)+timedelta(days=7*(i//350))).isoformat()
        orders.append(dict(ORDERS[0],ma_don_hang=f'o{i}',co_so_ma=f's{i%350}',ma_voucher=f'v{i%2500}',
                           tong_tien=100+i%5,so_tien_giam=10,ngay_tao=day))
        lines.append(dict(LINES[0],id=f'l{i}',ma_don_hang=f'o{i}',ma_san_pham=f'p{i%2500}',thanh_tien=100+i%5,so_luong=2))
        payments.append(dict(ma_giao_dich=f't{i}',ma_don_hang=f'o{i}',cong_thanh_toan='MOMO',
                             so_tien=99+i%5,trang_thai='THANH_CONG',ngay_tao=day))
    return dict(chi_nhanh=stores,san_pham=products,khuyen_mai=vouchers,voucher=vouchers,
                don_hang=orders,chi_tiet_don_hang=lines,giao_dich_thanh_toan=payments)


SCENARIOS = [
    ('business_overview', f.envelope(req('kpis',['revenue','order_count','aov'],features=['scalar']),
        req('stores',['store_revenue'],['store'],features=['contribution_share']),
        req('trend',['store_revenue'],['store'],kind='trend',granularity='week'))),
    ('product_portfolio', f.envelope(req('products',['product_revenue','quantity_sold'],['product'],days=60,features=['contribution_share']),
        req('categories',['product_revenue'],['category'],days=60,features=['contribution_share']),
        req('trend',['product_revenue'],['product'],kind='trend',days=60,granularity='week'))),
    ('voucher', f.envelope(req('vouchers',['voucher_revenue','voucher_order_count','discount_amount','aov'],['promotion'],days=60,
        features=['contribution_share'],feature_metrics={'contribution_share':['voucher_revenue']}),
        req('revenue_leader',['voucher_revenue'],['promotion'],kind='ranking',days=60,features=['leader'],ranking={'limit':1,'metric_id':'voucher_revenue'}),
        req('count_leader',['voucher_order_count'],['promotion'],kind='ranking',days=60,features=['leader'],ranking={'limit':1,'metric_id':'voucher_order_count'}))),
    ('store_performance', f.envelope(req('stores',['store_revenue','store_order_count','store_aov'],['store'],features=['contribution_share'],feature_metrics={'contribution_share':['store_revenue']}),
        req('city',['store_revenue'],['city']),req('trend',['store_revenue'],['store'],kind='trend',granularity='week'))),
    ('order_payment', f.envelope(req('orders',['revenue','order_count','aov'],days=30,features=['scalar']),
        req('payments',['payment_revenue','payment_count'],days=30,features=['scalar']),
        req('order_state',['order_count'],['order_status','order_type'],days=30),
        req('payment_state',['payment_revenue'],['payment_gateway','payment_status'],days=30),
        req('trend',['revenue'],kind='trend',days=30,granularity='day'))),
]


class CapacityTests(unittest.TestCase):
    def setUp(self):
        f.HybridTests.setUp(self)
        self.enterContext(patch('services.result_artifact_store._store', None))
    pipeline = f.HybridTests.pipeline
    request = f.HybridTests.request

    def test_row_boundaries_artifact_backed_exact_population(self):
        # Exercise the complete report/verification/session path at every cliff.
        # Synthetic responses model only the requested population. Supporting
        # SQL is covered by the real fixture integration in the dashboard suite.
        self.enterContext(patch('services.analysis_expansion_service.supporting_candidates',return_value=[]))
        for n in (1,10,100,1999,2000,2001,5000,20000):
            with self.subTest(n=n):
                intent = f.envelope(req('groups',['product_revenue'],['product'],features=['contribution_share']))
                p = self.pipeline(f.scripted(intent))
                request = self.request('Phân tích doanh thu sản phẩm')
                proposal = p.propose(request); f.approve(request,proposal)
                prepared = get_session(request.session_id).agent_artifacts
                def executor(sql, **kwargs):
                    a = next(a for a in prepared.values() if a.sql == sql)
                    rows = ([dict(product=f'Product {i}'+(' label'*180 if n==5000 else ''),product_id=f'p{i}',product_revenue=i+1) for i in range(n)]
                            if a.plan.dimensions else [dict(product_revenue=n*(n+1)//2)])
                    return dict(columns=a.plan.output_columns,rows=rows,truncated=False)
                p.executor = executor
                report = p.generate(request)
                self.assertEqual(report['outcome'],'SUCCESS')
                self.assertEqual(report['quality_assessment'],verify_saved_report(report,self.catalog))
                self.assertLess(len(serialized(report)),1_000_000)
                full = next(a for a in get_session(request.session_id).agent_artifacts.values() if a.plan.dimensions)
                stored = artifact_store().get(full.result_ref)
                self.assertEqual(len(stored['rows']),n)
                self.assertEqual(sum(r['product_revenue'] for r in stored['rows']),n*(n+1)//2)
                if n==5000:self.assertGreater(full.result_ref['byte_size'],4_000_000)
                self.assertIsNone(full.result)
                shares = artifact_store().get(report['evidence_ref'])['rows'] if report.get('evidence_ref') else report['evidence']
                self.assertTrue(all(e['values']['denominator']==n*(n+1)//2 for e in shares if e['feature']=='contribution_share'))
                for c in report['charts']:
                    self.assertLessEqual(len(c['data']),500)
                self.assertEqual(p.provider.call_count,1)

    def test_session_size_1_to_10mb_and_reference_roundtrip(self):
        self.enterContext(patch('services.analysis_expansion_service.supporting_candidates',return_value=[]))
        p = self.pipeline(f.scripted(f.envelope(req('groups',['product_revenue'],['product']))))
        request = self.request('Phân tích doanh thu sản phẩm'); proposal=p.propose(request)
        session=get_session(proposal['session_id']); a=next(iter(session.agent_artifacts.values()))
        for mb in (1,3,4,5,10):
            a.result=dict(columns=a.plan.output_columns,rows=[dict(product='X'*(mb*1_000_000),product_id='p0',product_revenue=10)])
            a.result_ref=None
            body=encode_session(session)
            self.assertLess(len(body.encode()),100000)
            restored=decode_session(body); back=next(iter(restored.agent_artifacts.values()))
            self.assertIsNone(back.result)
            self.assertGreaterEqual(back.result_ref['byte_size'],mb*1_000_000)
            self.assertEqual(artifact_store().get(back.result_ref),a.result)

    def test_immutable_expiry_integrity_failure_and_bounded_paging(self):
        s=ResultArtifactStore(contract=replace(AnalyticalCapacityContract(),artifact_ttl=1))
        result=dict(columns=['store_id','value'],rows=[dict(store_id=f's{i}',value=i) for i in range(5000)])
        kwargs=dict(query_fingerprint='q',plan_fingerprint='p',schema_fingerprint='s',provenance={'dimensions':['store_id']})
        one=s.put(result,**kwargs); two=s.put(result,**kwargs)
        self.assertNotEqual(one['artifact_id'],two['artifact_id'])
        self.assertEqual(s.find('q','s')['artifact_id'],two['artifact_id'])
        self.assertIsNone(s.find('q','changed_catalog'))
        result['rows'][0]['value']=-1; self.assertEqual(s.get(one)['rows'][0]['value'],0)
        self.assertEqual(len(s.page(one,200,200)['rows']),200)
        self.assertEqual(s.page(one,filters={'store_id':'s300'})['rows'][0]['value'],300)
        for filters in ({'value':10},{'sql':'DELETE'}):
            with self.assertRaises(AnalysisError):s.page(one,filters=filters)
        tampered={**one,'content_hash':'bad'}
        with self.assertRaises(AnalysisError):s.get(tampered)
        with patch('services.result_artifact_store.time.time',return_value=time.time()+2):
            with self.assertRaises(AnalysisError):s.get(one)
            self.assertIsNone(s.find('q','s'))
        broken=ResultArtifactStore(client=Mock(set=Mock(side_effect=ConnectionError)))
        with self.assertRaises(AnalysisError) as e:broken.put(result,**kwargs)
        self.assertEqual(e.exception.category,'artifact_store_unavailable')
        failure=safe_failure(e.exception, [], {'failure_stage':None})
        self.assertEqual(failure['failure']['stage'],'ARTIFACT_PERSISTENCE')
        self.assertEqual(failure['diagnostics']['failure_stage'],'ARTIFACT_PERSISTENCE')
        self.assertFalse(failure['failure']['retry_helps'])
        self.assertEqual(failure['failure']['recommended_server_action'],'restore_storage_without_semantic_retry')
        self.assertEqual(failure['failure']['what_is_known']['provider_attempt_count'],0)

    def test_estimator_identity_filter_ranking_and_calendar(self):
        resolved=AnalyticalResolver(self.catalog,f.REFERENCE).resolve(AnalysisIntentEnvelope.model_validate(
            f.envelope(req('trend',['store_revenue'],['store'],kind='trend',granularity='week'))))
        agent=self.pipeline().agent(self.catalog,f.REFERENCE,proposal=True)
        agent.queries.enforce_discovery=False
        a=agent.queries.prepare(resolved['operations'][0])
        planner=AnalyticalCapacityPlanner(self.catalog,{'store_id':{'distinct_upper_bound':350}})
        c=planner.plan(a.plan)
        self.assertEqual(c['estimated_dimensions'],1)
        self.assertEqual(c['estimated_rows'],period_count(a.plan.period,'week')*350)
        self.assertEqual(period_count({'start':'2026-09-01','end':'2026-09-30'},'day'),30)
        huge=AnalyticalCapacityPlanner(self.catalog,{'store_id':{'distinct_upper_bound':10000}})
        with self.assertRaises(AnalysisError) as e:huge.plan(a.plan)
        self.assertEqual(e.exception.category,'capacity_requires_choice')
        failure=safe_failure(e.exception,[],{'failure_stage':'CAPACITY_PLANNING'})
        self.assertEqual(failure['outcome'],'NEEDS_INPUT')
        self.assertEqual(failure['failure']['stage'],'CAPACITY_PLANNING')
        self.assertTrue(failure['failure']['needs_user_input'])
        self.assertFalse(any(x['type']=='retry' for x in failure['issue']['suggested_actions']))

    def test_missing_cadence_uses_server_policy_explicit_day_unchanged(self):
        for cadence in (None,'day'):
            intent=AnalysisIntentEnvelope.model_validate(f.envelope(req('trend',['revenue'],kind='trend',days=730,granularity=cadence)))
            r=AnalyticalResolver(self.catalog,f.REFERENCE).resolve(intent)
            self.assertEqual(r['operations'][0]['granularity'],cadence or 'week')
        intent=AnalysisIntentEnvelope.model_validate(f.envelope(req('trend',['store_revenue'],['store'],kind='trend',days=730,granularity=None)))
        with patch('services.value_profile_service.profiles_for',return_value={'store_id':{'distinct_upper_bound':10000}}):
            r=AnalyticalResolver(self.catalog,f.REFERENCE).resolve(intent)
        self.assertEqual(r['operations'][0]['granularity'],'year')

    def test_dry_run_precedes_execution_and_failure_does_not_repair_semantics(self):
        class DryWarehouse(FixtureWarehouse):
            def __init__(self,*args,**kwargs):super().__init__(*args,**kwargs);self.valid=True;self.events=[]
            def dry_run(self,sql):self.events.append('dry');return self.valid,'OK'
            def __call__(self,*args,**kwargs):self.events.append('execute');return super().__call__(*args,**kwargs)
        warehouse=DryWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        p=self.pipeline(f.scripted(f.envelope(req('kpi',['revenue'],features=['scalar']))),executor=warehouse)
        request=self.request('Doanh thu toàn bộ');f.approve(request,p.propose(request))
        self.assertEqual(warehouse.events,[])
        report=p.generate(request)
        self.assertEqual(warehouse.events,['dry','execute']*len(report['analytical_queries']))
        self.assertEqual(p.provider.call_count,1)
        self.assertEqual(report['diagnostics']['dry_run_count'],len(report['analytical_queries']))
        warehouse.valid=False;warehouse.events=[]
        p=self.pipeline(f.scripted(f.envelope(req('kpi',['revenue'],features=['scalar']))),executor=warehouse)
        request=self.request('Doanh thu toàn bộ');f.approve(request,p.propose(request))
        with self.assertRaises(AnalysisError) as e:p.generate(request)
        self.assertEqual(e.exception.category,'dry_run_failed')
        self.assertEqual(warehouse.events,['dry']);self.assertEqual(p.provider.call_count,1)

    def test_paging_requires_owned_approved_session_and_allowed_dimensions(self):
        from routers.ai import result_page
        from fastapi import HTTPException
        session=ReportSession(session_id='s',original_prompt='q',owner_id='a',approved=True)
        with patch('services.session_service.get_session',return_value=session),patch('routers.ai.browser_owner',return_value='b'):
            with self.assertRaises(HTTPException) as e:result_page('s','q',Mock(),Mock(),0,50,None,None)
        self.assertEqual(e.exception.status_code,404)

    def test_five_large_scenarios_real_compiler_and_fixture_oracle(self):
        with patch.dict(DATA,large_data()):
            for name,intent in SCENARIOS:
                with self.subTest(name=name):
                    warehouse=FixtureWarehouse(self.catalog.overlay)
                    try:
                        p=self.pipeline(f.scripted(intent),executor=warehouse)
                        days=intent['requirements'][0]['time']['amount']
                        request=self.request(f'Phân tích dữ liệu kinh doanh trong {days} ngày gần nhất');f.approve(request,p.propose(request));report=p.generate(request)
                        self.assertEqual(report['outcome'],'SUCCESS')
                        self.assertEqual(report['quality_assessment'],verify_saved_report(report,self.catalog))
                        self.assertLess(len(encode_session(get_session(request.session_id)).encode()),1_000_000)
                        self.assertLess(len(serialized(report)),1_000_000)
                        self.assertEqual(p.provider.call_count,1)
                        for query_id,a in get_session(request.session_id).agent_artifacts.items():
                            rows=artifact_store().get(a.result_ref)['rows']
                            if a.plan.kind=='trend':self.assertLessEqual(max([len(c['data']) for c in report['charts']]+[0]),500)
                            if a.plan.kind=='aggregate' and not a.plan.dimensions and 'revenue' in a.plan.metrics:
                                eligible=[o for o in DATA['don_hang'] if a.plan.period['start']<=o['ngay_tao'][:10]<=a.plan.period['end']]
                                self.assertEqual(rows[0]['revenue'],sum(o['tong_tien'] for o in eligible))
                                if 'order_count' in rows[0]:self.assertEqual(rows[0]['order_count'],len(eligible))
                                if 'aov' in rows[0]:self.assertAlmostEqual(rows[0]['aov'],sum(o['tong_tien'] for o in eligible)/len(eligible))
                        if name in {'business_overview','product_portfolio','voucher','store_performance'}:
                            self.assertGreater(max(a.result_ref['row_count'] for a in get_session(request.session_id).agent_artifacts.values()),2000)
                    finally:warehouse.close()


if __name__=='__main__':unittest.main()
