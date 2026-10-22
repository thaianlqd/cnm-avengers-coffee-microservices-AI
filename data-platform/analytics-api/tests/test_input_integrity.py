"""Input-boundary oracles. Transport and analytical execution are forbidden.

Assertions target preserved meaning, zero-call boundaries and positive controls,
not the particular implementation of the parser.
"""
import json
from copy import deepcopy
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
import time
from threading import RLock
import unittest

from services import input_integrity_service as guard
from services.preflight_service import run, overlay_physical
from services.analysis_catalog import AnalysisCatalog, CATALOG_PATH, AnalysisError
from tests.analysis_fixtures import physical_metadata


class InputIntegrityTests(unittest.TestCase):
    def setUp(self):
        for target in ('requests.sessions.Session.request','psycopg2.connect',
                       'services.sql_service.execute_read_only'):
            self.enterContext(patch(target,side_effect=AssertionError('No external/analytical call: '+target)))
        self.overlay=json.loads(CATALOG_PATH.read_text())
        self.catalog=AnalysisCatalog(overlay_physical(self.overlay),self.overlay)

    def check(self,q,**kw): return guard.validate(q,self.catalog,**kw)

    def test_unchanged_baseline_22_preflight_decisions(self):
        cases=json.loads((Path(__file__).parent/'fixtures/input_integrity/baseline_cases.json').read_text())
        for c in cases:
            with self.subTest(id=c['id'],question=c['question']):
                r=run(c['question'],catalog=self.catalog,reference=date(2026,10,21),coverage={})
                self.assertEqual(r['can_submit'],c['can_submit'],r['findings'])
                self.assertEqual((r['provider_calls'],r['warehouse_queries']),(0,0))
                if not c['can_submit'] and c['id'] not in {'S14','S18','S19'}:
                    self.assertEqual(r['capability']['decision'],'CLARIFY')

    def test_explicit_240_case_corpus(self):
        corpus=json.loads((Path(__file__).parent/'fixtures/input_integrity/corpus.json').read_text())['cases']
        self.assertEqual(len(corpus),240)
        self.assertEqual(len({c['id'] for c in corpus}),240)
        for c in corpus:
            with self.subTest(id=c['id'],question=c['question']):
                result=self.check(c['question'],context=c.get('context'))
                self.assertEqual(result['can_submit'],c['can_submit'],result['findings'])
                self.assertEqual((result['provider_calls'],result['analytical_queries'],result['lookup_queries']),(0,0,0))

    def test_60_held_out_scenarios(self):
        cases=json.loads((Path(__file__).parent/'fixtures/input_integrity/holdout.json').read_text())['cases']
        self.assertEqual(len(cases),60)
        for c in cases:
            with self.subTest(id=c['id'],question=c['question']):
                r=self.check(c['question'],context=c.get('context'))
                self.assertEqual(r['can_submit'],c['can_submit'],r['findings'])
                if c.get('reason'):self.assertIn(c['reason'],[f['code'] for f in r['findings']])

    def test_unicode_equivalence_and_hidden_controls(self):
        import unicodedata
        for form in ['NFC','NFD']:
            q=unicodedata.normalize(form,'Doanh thu tỉnh Hà Nội')
            r=self.check(q);self.assertTrue(r['can_submit'],r)
            self.assertIn('Hà Nội',[v for s in r['slots'] for v in s.get('candidates',[])])
        for control in ['\u200b','\u202e','\x00']:
            self.assertFalse(self.check('Doanh thu'+control+' tháng 9 năm 2026')['can_submit'])

    def test_unknown_is_not_absent_and_original_span_survives_unicode(self):
        for q in ['doanh thu tỉnh qzxnv','doanh thu tỉnh QZXNV','doanh thu tỉnh qzxnv 😄',
                  'doanh thu tại tỉnh','số đơn trạng thái qzxnv','doanh thu phương thức thanh toán qzxnv']:
            with self.subTest(q=q):
                r=self.check(q);self.assertFalse(r['can_submit'])
                for s in r['slots']: self.assertEqual(q[s['start']:s['end']],s['raw'])
        self.assertTrue(self.check('doanh thu')['can_submit'])
        self.assertTrue(self.check('doanh thu theo tỉnh')['can_submit'])

    def test_union_exclusion_and_unknown_sibling_never_partial_success(self):
        for q in ['doanh thu tỉnh Hà Nội và qzxnv','doanh thu Hà Nội và qzxnv tháng 9 năm 2026',
                  'doanh thu miền Nam trừ tỉnh qzxnv','doanh thu Hà Nội trừ qzxnv',
                  'doanh thu tỉnh Hà Nội hoặc qzxnv','doanh thu tỉnh Hà Nội và']:
            with self.subTest(q=q): self.assertFalse(self.check(q)['can_submit'])
        for q in ['doanh thu Hà Nội và Hồ Chí Minh tháng 9 năm 2026',
                  'doanh thu tỉnh Hà Nội và Hồ Chí Minh','doanh thu Hà Nội với nhé :v']:
            with self.subTest(q=q): self.assertTrue(self.check(q)['can_submit'],self.check(q))

    def test_raw_sign_calendar_and_top_limits(self):
        invalid=['top -5 chi nhánh theo doanh thu','top 0 cửa hàng','top 2.5 cửa hàng',
                 'bottom −7 sản phẩm','top 101 chi nhánh','doanh thu tháng 13 năm 2026',
                 'doanh thu tháng -1 năm 2026','doanh thu quý 0 năm 2026','doanh thu quý 5 năm 2026',
                 'doanh thu ngày 31/02/2026','doanh thu 2026-02-29',
                 'doanh thu từ 2026-10-01 đến 2026-09-01',
                 'doanh thu tháng 9 năm 2026 tháng 10 năm 2026']
        for q in invalid:
            with self.subTest(q=q): self.assertFalse(self.check(q)['can_submit'],self.check(q))
        valid=['top 5 chi nhánh theo doanh thu','bottom 10 sản phẩm theo doanh thu',
               'doanh thu tháng 12 năm 2026','doanh thu quý 4 năm 2026',
               'doanh thu 2024-02-29','doanh thu ngày 28/02/2026',
               'so sánh doanh thu tháng 9 năm 2026 với tháng 10 năm 2026',
               'giá trị đơn nhỏ hơn -500000',
               'dự báo doanh thu 3 tháng tới']
        for q in valid:
            with self.subTest(q=q): self.assertTrue(self.check(q)['can_submit'],self.check(q))

    def test_numeric_filter_is_bound_and_aggregate_threshold_never_becomes_row_filter(self):
        for q,operator,value in [('giá trị đơn > -500000','gt',-500000),('giá trị đơn lớn hơn -250000','gt',-250000),('giá trị đơn <= 1,5','lte',1.5)]:
            r=self.check(q);self.assertTrue(r['can_submit'],r)
            self.assertEqual(r['required_filters'],[dict(dimension='order_amount',operator=operator,value=value)])
        for q in ['doanh thu > -500000','doanh thu nhỏ hơn -500000','doanh thu tăng hơn 150%',
                  'giá trị đơn > 100 và < 200','giá trị đơn > 100 hoặc giá trị đơn < 0']:
            r=self.check(q);self.assertFalse(r['can_submit'],r)
            self.assertIn('input_condition_unsupported',[f['code'] for f in r['findings']])
        for q in ['top NaN chi nhánh','bottom Infinity sản phẩm','doanh thu tháng qzxnv năm 2026']:
            self.assertFalse(self.check(q)['can_submit'],q)
        self.assertFalse(self.check('giá trị đơn > '+('9'*500))['can_submit'])
        r=self.check('doanh thu tại cửa hàng "Tháng 13"',lookup=lambda *_:['Tháng 13'])
        self.assertTrue(r['can_submit'],r)

    def test_all_categorical_dimensions_are_inventory_driven(self):
        # Each active typed dimension is covered without a business-specific router.
        checked=[]
        for name,d in self.catalog.registry['dimensions'].items():
            if name in guard.policy()['non_entity_dimensions']:continue
            if (d.get('value_grounding') or {}).get('mode') not in {'enum','lookup'}:continue
            if d.get('lifecycle',{}).get('status')=='deprecated':continue
            head=d['business_name']
            with self.subTest(dimension=name,kind='axis'):
                self.assertTrue(self.check('phân tích theo '+head)['can_submit'])
            with self.subTest(dimension=name,kind='unknown'):
                r=self.check('lọc tại '+head+' qzxnv731')
                self.assertFalse(r['can_submit'],r)
                self.assertIn(name,[s.get('dimension') for s in r['slots']])
            checked.append(name)
        self.assertGreater(len(checked),45)

    def test_lookup_missing_cache_is_pending_not_nonexistent(self):
        r=self.check('doanh thu tại cửa hàng Quán Mặt Trăng')
        self.assertFalse(r['can_submit'])
        self.assertEqual(r['slots'][0]['reason'],'input_lookup_required')
        self.assertEqual(r['lookup_queries'],0)

    def test_explicit_lookup_requires_exact_unique_match_and_retains_constraint(self):
        q='doanh thu tại cửa hàng Quán Mặt Trăng'
        lookup=Mock(return_value=['Quán Mặt Trăng'])
        r=self.check(q,lookup=lookup)
        self.assertTrue(r['can_submit'],r)
        self.assertEqual(r['required_filters'],[dict(dimension='store',operator='eq',value='Quán Mặt Trăng')])
        self.assertEqual(r['lookup_queries'],1);lookup.assert_called_once()
        for candidates in [[],['Quán Mặt Trăng 1'],['Quán Mặt Trăng 1','Quán Mặt Trăng 2']]:
            self.assertFalse(self.check(q,lookup=lambda *_:candidates)['can_submit'])

    def test_lookup_failure_is_unavailable_not_invalid_name(self):
        r=self.check('doanh thu sản phẩm Cốc Mây',lookup=Mock(side_effect=TimeoutError()))
        self.assertEqual(r['slots'][0]['state'],'UNAVAILABLE')
        self.assertFalse(r['can_submit'])

    def test_high_cardinality_exclusion_never_invents_truncated_universe(self):
        r=self.check('doanh thu trừ cửa hàng Cốc Mây',lookup=lambda *_:['Cốc Mây'])
        self.assertFalse(r['can_submit'])
        self.assertNotIn('not_in',[f['operator'] for f in r['required_filters']])

    def test_query_span_clauses_and_context_change_identity(self):
        q='doanh thu tỉnh qzxnv'
        self.assertNotEqual(self.check(q)['fingerprint'],self.check(q+'x')['fingerprint'])
        self.assertNotEqual(self.check(q,context={'revision':1})['fingerprint'],self.check(q,context={'revision':2})['fingerprint'])
        self.assertNotEqual(self.check(q,context={'scope':'a'})['fingerprint'],self.check(q,context={'scope':'b'})['fingerprint'])

    def test_refinement_does_not_require_repeating_metric(self):
        for q in ['Chỉ lọc Hà Nội','Nhóm theo tỉnh/thành','Đổi sang donut','Chỉ xem tháng 9 năm 2026','Giữ nguyên chỉ số và thời gian, chỉ phân tích các chi nhánh tại Hà Nội']:
            self.assertTrue(self.check(q,context={'mode':'refinement','revision':1})['can_submit'],q)
        self.assertFalse(self.check('Chỉ lọc tỉnh qzxnv',context={'mode':'refinement'})['can_submit'])
        for q in ['Chỉ lọc qzxnv tháng 9 năm 2026','nhóm theo qzxnv','dsfdsfsd qzxnv','doanh thu tại qzxnv tháng 9 năm 2026','doanh thu > abcxyz tháng 9 năm 2026']:
            self.assertFalse(self.check(q,context={'mode':'refinement'})['can_submit'],q)

    def test_long_business_instructions_do_not_become_entity_values(self):
        from evals.one_click_cases import CASES
        questions=[c['question'] for c in CASES]+[
            'Doanh thu thay đổi theo tuần trong 90 ngày qua',
            'Doanh thu theo loại đơn và cơ cấu AOV theo chi nhánh tháng 8 năm 2026',
            'Top 5 sản phẩm bán chạy ở Hà Nội quý trước, so sánh doanh thu với TP.HCM và cho tôi xu hướng theo tuần.',
            'So sánh doanh thu giữa thành phố Hà Nội(cả cửa hàng chính và hệ thống kiosk) và Hồ Chí Minh',
            'Tỷ lệ giao hàng thành công của shipper ở trong hệ thống',
            'Quy mô doanh thu theo chi nhánh; không tự quy kết nguyên nhân',
        ]
        for q in questions:
            with self.subTest(question=q):self.assertTrue(self.check(q)['can_submit'],self.check(q)['findings'])
        for q in ['Doanh thu tỉnh Qzxn. Nêu rõ kết quả','Doanh thu Hà Nội và Qzxn; hiển thị xu hướng',
                  'Doanh thu tại cửa hàng "Nêu Rõ Qzxn"','Số đơn trạng thái Qzxn dùng để tính tổng']:
            with self.subTest(question=q):self.assertFalse(self.check(q)['can_submit'])

    def test_resolution_cache_never_crosses_owner_access_or_catalog(self):
        from services.access_policy import active_principal,Principal
        from dataclasses import replace
        principal=Principal(subject='fixture-a',role='DATA_ANALYST',permissions=frozenset({'analytics.read'}),
            datasets=('*',),store_ids=(),national=True,policy_version='fixture-v1',access_fingerprint='access-a',expires_at=time.time()+600)
        token=active_principal.set(principal);self.addCleanup(active_principal.reset,token)
        guard._cache.clear()
        lookup=Mock(return_value=['Quán Mặt Trăng'])
        with patch('services.metadata_service.lookup_dimension_values',lookup):
            self.assertIsNone(guard.entity_lookup(self.catalog)('store','Quán Mặt Trăng'))
            result=guard.entity_lookup(self.catalog,resolve=True)('store','Quán Mặt Trăng')
            self.assertEqual(result['queries'],1)
            self.assertEqual(guard.entity_lookup(self.catalog)('store','Quán Mặt Trăng')['queries'],0)
            active_principal.set(replace(principal,subject='fixture-b'))
            self.assertIsNone(guard.entity_lookup(self.catalog)('store','Quán Mặt Trăng'))
            active_principal.set(replace(principal,access_fingerprint='access-b'))
            self.assertIsNone(guard.entity_lookup(self.catalog)('store','Quán Mặt Trăng'))
            active_principal.set(replace(principal,national=False,store_ids=('allowed-store',)))
            r=self.check('doanh thu cửa hàng Quán Mặt Trăng',lookup=guard.entity_lookup(self.catalog,resolve=True))
            self.assertEqual(r['slots'][0]['state'],'FORBIDDEN');self.assertEqual(r['lookup_queries'],0)
            lookup.assert_called_once()

    def test_lookup_is_bounded_and_duplicate_negative_never_spends_model(self):
        look=Mock(return_value=[])
        r=self.check('doanh thu cửa hàng Quán A và Quán B và Quán C và Quán D và Quán E và Quán F',lookup=look)
        self.assertFalse(r['can_submit']);self.assertEqual(look.call_count,4)
        self.assertEqual(r['provider_calls'],0);self.assertEqual(r['analytical_queries'],0)

    def test_direct_submit_lookup_budget_is_shared_and_no_query_after_limit(self):
        from services.access_policy import Principal,active_principal
        from services.preflight_service import RateLimiter
        principal=Principal(subject='lookup-budget-fixture',role='DATA_ANALYST',permissions=frozenset({'analytics.read'}),
            datasets=('*',),store_ids=(),national=True,policy_version='fixture',access_fingerprint='budget-fixture',expires_at=time.time()+600)
        token=active_principal.set(principal);self.addCleanup(active_principal.reset,token)
        self.enterContext(patch.object(guard,'_lookup_limiter',RateLimiter(requests=2,window_seconds=60)))
        source=Mock(return_value=[])
        with patch('services.metadata_service.lookup_dimension_values',source):
            for name in ['Nhà Sao A','Nhà Sao B']:
                r=self.check('doanh thu cửa hàng '+name,lookup=guard.entity_lookup(self.catalog,resolve=True))
                self.assertFalse(r['can_submit']);self.assertEqual(r['lookup_queries'],1)
            r=self.check('doanh thu cửa hàng Nhà Sao C',lookup=guard.entity_lookup(self.catalog,resolve=True))
            self.assertEqual(r['slots'][0]['state'],'UNAVAILABLE');self.assertEqual(r['lookup_queries'],0)
            self.assertEqual(source.call_count,2)

    def test_all_planning_modes_stop_before_agent_and_invalid_job_before_enqueue(self):
        from common import AiTextToReportRequest
        from services.agent_pipeline import AnalysisPipeline
        from services.analysis_job_service import AnalysisJobs
        request=AiTextToReportRequest(question='doanh thu tỉnh qzxnv')
        for mode in ['one_shot','agent','legacy']:
            p=AnalysisPipeline(owner_id='guard-owner');p.planning_mode=mode;p.agent=Mock(side_effect=AssertionError('No provider'))
            with self.assertRaises(AnalysisError):p.guided_context(request,self.catalog,date(2026,10,21),{})
            p.agent.assert_not_called()
        repository=Mock();pool_factory=Mock()
        jobs=AnalysisJobs(repository=repository,pipeline_factory=pool_factory)
        try:
            with patch('services.preflight_service.preflight_catalog',return_value=self.catalog):
                with self.assertRaises(AnalysisError):jobs.submit(request,'guard-owner','0123456789abcdef')
            repository.create.assert_not_called();pool_factory.assert_not_called()
        finally:jobs.pool.shutdown(wait=True)


    def test_secondary_semantic_fields_cannot_hide_unknown_scope(self):
        from common import AiTextToReportRequest,AiPreflightRequest
        from services.agent_pipeline import AnalysisPipeline
        from services.analysis_job_service import AnalysisJobs
        for field in ('analysis_context','analysis_expectation','context'):
            request=AiTextToReportRequest(question='Doanh thu tháng 9 năm 2026',**{field:'Chỉ lọc tỉnh Qzxn'})
            preflight=AiPreflightRequest(question=request.prompt,**{field:getattr(request,field)})
            self.assertFalse(self.check(guard.request_text(preflight))['can_submit'])
            for mode in ('one_shot','legacy'):
                pipeline=AnalysisPipeline(owner_id='secondary-fields-fixture');pipeline.planning_mode=mode
                with self.assertRaises(AnalysisError):pipeline.guided_context(request,self.catalog,date(2026,10,21),{})
            repository=Mock();jobs=AnalysisJobs(repository=repository,pipeline_factory=Mock())
            try:
                with patch('services.preflight_service.preflight_catalog',return_value=self.catalog):
                    with self.assertRaises(AnalysisError):jobs.submit(request,'secondary-fields-fixture','0123456789abcdef')
                repository.create.assert_not_called()
            finally:jobs.pool.shutdown(wait=True)
        with self.assertRaises(ValueError):AiTextToReportRequest(question='Doanh thu',context='x'*1501)
        request=AiTextToReportRequest(question='Doanh thu tháng 9 năm 2026',analysis_context='Chỉ lọc Hà Nội')
        pipeline=AnalysisPipeline(owner_id='secondary-fields-fixture');context={}
        pipeline.guided_context(request,self.catalog,date(2026,10,21),context)
        self.assertIn(dict(dimension='city',operator='eq',value='Hà Nội'),context['required_filters'])

    def test_bound_scope_membership_ignores_order_but_not_different_members(self):
        from services.analytical_resolver import AnalyticalResolver,ResolutionIssues
        from services.analysis_intent import IntentRequirement
        expected=dict(dimension='city',operator='in',value=['Hà Nội','Hồ Chí Minh'])
        resolver=AnalyticalResolver(self.catalog,date(2026,10,21),{'required_filters':[expected]})
        req=IntentRequirement(id='r1',metric_ids=['revenue'],filters=[{**expected,'value':list(reversed(expected['value']))}])
        bound=resolver.normalize(req);self.assertEqual(len(bound.filters),1)
        from services.request_anchors import enforce_ui
        artifact=SimpleNamespace(grounded=SimpleNamespace(period={}),query=SimpleNamespace(filters=bound.filters))
        enforce_ui({'r1':artifact},{'required_filters':[expected]})
        req=IntentRequirement(id='r1',metric_ids=['revenue'],filters=[{**expected,'value':['Hà Nội','Đà Nẵng']}])
        with self.assertRaises(ResolutionIssues):resolver.normalize(req)
        artifact.query.filters=req.filters
        with self.assertRaises(AnalysisError):enforce_ui({'r1':artifact},{'required_filters':[expected]})


if __name__=='__main__':unittest.main()


class InputIntegrityHttpTests(unittest.TestCase):
    setUp=InputIntegrityTests.setUp

    def test_real_routes_stop_unknown_input_before_provider_sql_and_job_cache(self):
        from fastapi import FastAPI
        from tests.http_fixture import ASGIClient as TestClient
        from services.access_policy import active_principal,Principal
        from services.analysis_job_service import AnalysisJobs
        from services.agent_pipeline import AnalysisPipeline
        from common import AiReportRefineRequest
        from routers import ai
        principal=Principal(subject='fixture-http',role='DATA_ANALYST',permissions=frozenset({'analytics.read'}),
            datasets=('*',),store_ids=(),national=True,policy_version='test',access_fingerprint='fixture-http',expires_at=time.time()+600)
        token=active_principal.set(principal);self.addCleanup(active_principal.reset,token)
        self.enterContext(patch('services.access_policy.current_principal',return_value=principal))
        self.enterContext(patch('services.preflight_service.preflight_catalog',return_value=self.catalog))
        self.enterContext(patch.object(AnalysisPipeline,'catalog',return_value=self.catalog))
        agent=self.enterContext(patch.object(AnalysisPipeline,'agent',side_effect=AssertionError('No provider/agent')))
        repository=Mock();jobs=AnalysisJobs(repository=repository,pipeline_factory=Mock())
        self.addCleanup(jobs.pool.shutdown,wait=True)
        self.enterContext(patch('services.analysis_job_service.analysis_jobs',return_value=jobs))
        session=SimpleNamespace(owner_id=principal.bound_owner,approved=True,revision=1,analysis_lock=RLock(),
            schema_fingerprint=self.catalog.fingerprint,contract_version='2.8',agent_reference_date='2026-10-21',
            report_response={'revision':1,'marker':'unchanged'})
        self.enterContext(patch('services.session_service.get_session',return_value=session))
        self.enterContext(patch('services.agent_pipeline.get_session',return_value=session))
        app=FastAPI();app.include_router(ai.router)
        client=TestClient(app)
        q='doanh thu tỉnh qzxnv'
        r=client.post('/api/ai/preflight',json={'question':q});self.assertEqual(r.status_code,200)
        self.assertFalse(r.json()['can_submit']);self.assertEqual(r.json()['provider_calls'],0)
        r=client.post('/api/ai/propose-plan',json={'question':q});self.assertEqual(r.status_code,200)
        self.assertEqual(r.json()['outcome'],'NEEDS_INPUT',r.json())
        self.assertEqual(r.json()['diagnostics']['provider_call_count'],0)
        self.assertIn('qzxnv',r.json()['message'])
        r=client.post('/api/ai/analysis-jobs',headers={'Idempotency-Key':'0123456789abcdef'},json={'question':q})
        self.assertEqual(r.status_code,400,r.text);repository.create.assert_not_called()
        for field in ('analysis_context','analysis_expectation','context'):
            extended={'question':'Doanh thu tháng 9 năm 2026',field:'Chỉ lọc tỉnh qzxnv'}
            r=client.post('/api/ai/preflight',json=extended)
            self.assertEqual(r.status_code,200);self.assertFalse(r.json()['can_submit'])
            r=client.post('/api/ai/propose-plan',json=extended)
            self.assertEqual(r.json()['outcome'],'NEEDS_INPUT');self.assertEqual(r.json()['diagnostics']['provider_call_count'],0)
            r=client.post('/api/ai/analysis-jobs',headers={'Idempotency-Key':'0123456789abcdef'},json=extended)
            self.assertEqual(r.status_code,400);repository.create.assert_not_called()
        payload={'session_id':'fixture-session','current_report':{'revision':1},'feedback':'Chỉ lọc tỉnh qzxnv'}
        r=client.post('/api/ai/refinement-preflight',json=payload)
        self.assertEqual(r.status_code,200,r.text);self.assertFalse(r.json()['can_submit'])
        r=client.post('/api/ai/refine-report',json=payload)
        self.assertEqual(r.status_code,200,r.text);self.assertEqual(r.json()['outcome'],'NEEDS_INPUT')
        self.assertEqual(session.report_response,{'revision':1,'marker':'unchanged'});self.assertEqual(session.revision,1)
        r=client.post('/api/ai/refinement-preflight',json={**payload,'current_report':{'revision':0}})
        self.assertEqual(r.status_code,409)
        session.owner_id='other-owner'
        r=client.post('/api/ai/refinement-preflight',json=payload);self.assertEqual(r.status_code,404)
        agent.assert_not_called()

    def test_empty_free_text_cannot_enqueue_or_call_any_planning_mode(self):
        from common import AiTextToReportRequest
        from services.agent_pipeline import AnalysisPipeline
        from services.analysis_job_service import AnalysisJobs
        with self.assertRaises(ValueError):AiTextToReportRequest(question='')
        # The HTTP schema already rejects empty text. Internal callers must
        # also fail closed even if they bypass model validation deliberately.
        empty=AiTextToReportRequest.model_construct(prompt='',input_mode='free_text')
        for mode in ['one_shot','legacy','agent']:
            p=AnalysisPipeline(owner_id='empty-owner');p.planning_mode=mode
            with self.assertRaises(AnalysisError):p.guided_context(empty,self.catalog,date(2026,10,21),{})
        repository=Mock();jobs=AnalysisJobs(repository=repository)
        try:
            with patch('services.preflight_service.preflight_catalog',return_value=self.catalog):
                with self.assertRaises(AnalysisError):jobs.submit(empty,'empty-owner','0123456789abcdef')
            repository.create.assert_not_called()
        finally:jobs.pool.shutdown(wait=True)
