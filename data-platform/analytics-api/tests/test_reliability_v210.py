"""OFFLINE_SCRIPTED: deadlines/transport boundaries, metadata and server expansion."""
import asyncio
import json
import os
import threading
import time
from copy import deepcopy
from unittest.mock import Mock, patch
import requests
from tests import test_hybrid_v28 as f
from tests.test_overview_dashboard_v296 import recorded
from tests.test_final_review_v29 import OVERVIEW_45D
from tests.test_capacity_v29 import req
from services.analysis_catalog import AnalysisCatalog, AnalysisError
from services.analysis_intent import AnalysisIntentEnvelope
from services.analytical_resolver import AnalyticalResolver
from services.provider_budget import ProviderBudget, request_deadline, request_cancelled
from services.agent_provider import NativeAgentProvider, http_failure
from services.analysis_pipeline import safe_failure
from services.readiness_service import readiness
from services.semantic_catalog_validation import validate_catalog
from services.analysis_quality_service import verify_saved_report
from evals.fixture_warehouse import FixtureWarehouse

PRODUCT_30D=('Trong 30 ngày gần nhất, xếp hạng 5 sản phẩm bán chạy nhất theo số lượng bán. '
    'Với từng sản phẩm, hiển thị số lượng bán và doanh thu sản phẩm. Nêu rõ trạng thái đơn được tính.')
PAYMENT_30D=('Trong 30 ngày gần nhất, thống kê số giao dịch và tổng số tiền giao dịch theo cổng thanh toán, '
    'đồng thời thống kê theo trạng thái giao dịch. Hiển thị xu hướng tổng số tiền giao dịch theo ngày. '
    'Không coi số tiền giao dịch là doanh thu đơn hàng.')


class ReliabilityTests(f.unittest.TestCase):
    setUp=f.HybridTests.setUp
    pipeline=f.HybridTests.pipeline
    request=f.HybridTests.request

    def native(self, post):
        from services import llm_service
        self.enterContext(patch.dict(os.environ,{'AI_OFFLINE':'0','GEMINI_API_STYLE':'native','DATA_ANALYST_INTENT_TRANSPORT':'json'}))
        self.enterContext(patch.object(llm_service,'GEMINI_API_KEY','fixture'))
        self.enterContext(patch.object(llm_service,'GEMINI_MODELS',['fixture']))
        return self.enterContext(patch('services.agent_provider.requests.post',side_effect=post))

    def response(self, meaning=None):
        return Mock(ok=True,json=Mock(return_value={'candidates':[{'content':{'parts':[{'text':json.dumps(meaning or recorded())}]}}]}))

    def test_primary_19_seconds_has_23_second_read_window_and_succeeds(self):
        clock=[100.0]
        def post(*args,**kwargs):
            self.assertGreaterEqual(kwargs['timeout'].read_timeout,23)
            clock[0]+=19
            return self.response()
        http=self.native(post)
        with patch('services.provider_budget.time.monotonic',side_effect=lambda:clock[0]):
            p=self.pipeline(NativeAgentProvider());r=p.propose(self.request(OVERVIEW_45D))
        self.assertEqual(r['status'],'proposal_ready');self.assertEqual(http.call_count,1)
        self.assertEqual(r['diagnostics']['provider_attempt_latencies'],[19000])
        p.executor.assert_not_called()

    def test_early_connection_reset_can_recover_once(self):
        http=self.native([requests.exceptions.ConnectionError('fixture'),self.response()])
        with patch('services.hybrid_analyst_planner.time.sleep'):
            p=self.pipeline(NativeAgentProvider());r=p.propose(self.request(OVERVIEW_45D))
        self.assertEqual(http.call_count,2)
        self.assertEqual(r['diagnostics']['transport_retry_count'],1)
        self.assertEqual(r['diagnostics']['semantic_repair_count'],0)

    def test_long_primary_timeout_is_transport_failure_without_resend(self):
        clock=[100.0]
        def post(*args,**kwargs):
            clock[0]+=23
            raise requests.exceptions.ReadTimeout('fixture')
        http=self.native(post)
        with patch('services.provider_budget.time.monotonic',side_effect=lambda:clock[0]):
            p=self.pipeline(NativeAgentProvider())
            with self.assertRaises(AnalysisError) as error:p.propose(self.request(OVERVIEW_45D))
        failure=safe_failure(error.exception,p.calls,p.semantic_info)
        self.assertEqual(http.call_count,1)
        self.assertEqual(failure['diagnostics']['error_category'],'provider_timeout')
        self.assertEqual(failure['failure']['stage'],'PROVIDER_TRANSPORT')
        self.assertEqual(p.semantic_info['semantic_repair_count'],0)
        self.assertEqual(p.semantic_info['db_query_count'],0)

    def test_repeated_fast_connection_failures_stop_after_one_resend(self):
        http=self.native([requests.exceptions.ConnectionError('fixture')]*3)
        with patch('services.hybrid_analyst_planner.time.sleep'):
            p=self.pipeline(NativeAgentProvider())
            with self.assertRaises(AnalysisError):p.propose(self.request())
        self.assertEqual(http.call_count,2)

    def test_repair_window_is_dynamic_and_does_not_reset_deadline(self):
        clock=[100.0]
        with patch('services.provider_budget.time.monotonic',side_effect=lambda:clock[0]):
            b=ProviderBudget({},3);b.start_deadline();b.consume()
            self.assertEqual(b.http_timeout().total,25)
            clock[0]+=19;b.start_deadline()
            self.assertTrue(b.recovery_available());b.consume()
            self.assertEqual(b.http_timeout().total,6)
            clock[0]+=1;self.assertFalse(b.recovery_available())
            clock[0]+=8
            with self.assertRaises(AnalysisError):b.consume()
            self.assertEqual(b.used,2)

    def test_provider_success_semantic_repair_uses_remaining_budget(self):
        clock=[100.0];calls=[]
        first=deepcopy(recorded());first['requirements'][0]['metric_ids'].remove('aov')
        def post(*args,**kwargs):
            calls.append(kwargs['timeout'].total);clock[0]+=3
            return self.response(first if len(calls)==1 else f.envelope(req('repair_add_1',['aov'],days=45,features=['scalar'])))
        http=self.native(post)
        with patch('services.provider_budget.time.monotonic',side_effect=lambda:clock[0]):
            p=self.pipeline(NativeAgentProvider());r=p.propose(self.request(OVERVIEW_45D))
        self.assertEqual(http.call_count,2);self.assertEqual(r['diagnostics']['semantic_repair_count'],1)
        self.assertEqual(r['diagnostics']['transport_retry_count'],0)
        self.assertLess(calls[1],calls[0])

    def test_cancellation_blocks_provider_and_persistence(self):
        cancellation=threading.Event();cancellation.set()
        token=request_cancelled.set(cancellation)
        try:
            p=self.pipeline()
            with patch('services.agent_pipeline.create_session') as create:
                with self.assertRaises(AnalysisError):p.propose(self.request())
                create.assert_not_called();self.assertEqual(p.provider.call_count,0)
        finally:request_cancelled.reset(token)

    def test_real_http_wall_clock_ceiling_and_late_worker_cancellation(self):
        from routers.ai import bounded_propose_plan
        from services.provider_budget import check_request_deadline
        late=[]
        def blocked_worker(*args):
            time.sleep(29.4)
            check_request_deadline()
            late.append('persisted')
        async def request():
            start=time.perf_counter()
            result=await bounded_propose_plan(self.request())
            self.assertLess(time.perf_counter()-start,29.25)
            self.assertEqual(result['diagnostics']['error_category'],'planning_timeout')
        with patch('routers.ai._invoke',side_effect=blocked_worker):
            asyncio.run(request())
        self.assertEqual(late,[])

    def test_invalid_json_is_format_failure_not_timeout_or_sql(self):
        http=self.native([Mock(ok=True,json=Mock(side_effect=ValueError('invalid')))]*3)
        p=self.pipeline(NativeAgentProvider())
        with self.assertRaises(AnalysisError) as error:p.propose(self.request())
        result=safe_failure(error.exception,p.calls,p.semantic_info)
        self.assertEqual(result['diagnostics']['error_category'],'provider_invalid_json')
        self.assertEqual(result['failure']['stage'],'PROVIDER_FORMAT')
        self.assertEqual(p.semantic_info['transport_retry_count'],0)
        self.assertEqual(http.call_count,3);p.executor.assert_not_called()

    def test_context_contains_protected_relevant_product_candidates(self):
        p=self.pipeline(f.scripted(f.envelope(f.requirement(ranking={'limit':5,'metric_id':'quantity_sold'},derived_features=[]))))
        r=p.propose(self.request(PRODUCT_30D))
        payload=json.loads(p.provider.requests[0]['messages'][0]['content']);packet=payload['semantic_candidate_packet']
        self.assertEqual(set(packet['explicit_metric_ids']),{'quantity_sold','product_revenue'})
        self.assertTrue({'product','order_status'}<=set(packet['explicit_dimension_ids']))
        self.assertTrue({'products','order_items'}<=set(packet['candidate_domains']))
        self.assertEqual(packet['time'],{'kind':'rolling','amount':30,'unit':'day'})
        self.assertEqual(packet['protected_input_facts']['rankings'],[{'direction':'top','limit':5,'metric_id':'quantity_sold'}])
        self.assertFalse(set(packet['candidate_domains']) & {'payments','inventory','customers','promotions'})
        self.assertNotIn('global_metric_directory',payload)
        self.assertLess(r['diagnostics']['primary_context_chars'],17602*.75)

    def test_explicit_quantity_ordering_cannot_be_replaced_by_companion_revenue(self):
        wrong=f.envelope(f.requirement(ranking={'limit':5,'metric_id':'product_revenue'},derived_features=[]))
        p=self.pipeline(f.scripted(wrong,wrong,wrong))
        with self.assertRaises(AnalysisError):p.propose(self.request(PRODUCT_30D))
        self.assertEqual(p.provider.call_count,3)
        p.executor.assert_not_called()

    def test_broad_expansion_is_metadata_owned_and_verified(self):
        warehouse=FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        p=self.pipeline(f.scripted(recorded()),executor=Mock(wraps=warehouse));request=self.request(OVERVIEW_45D)
        proposal=p.propose(request);p.executor.assert_not_called()
        self.assertEqual(proposal['diagnostics']['analysis_depth'],'comprehensive')
        self.assertEqual(proposal['diagnostics']['supporting_operation_count'],3)
        f.approve(request,proposal);report=p.generate(request)
        self.assertEqual(report['outcome'],'SUCCESS');self.assertEqual(p.provider.call_count,1)
        self.assertGreaterEqual(len(report['charts']),6)
        self.assertGreaterEqual(len({c['chart_type'] for c in report['charts']}),3)
        self.assertEqual(verify_saved_report(report,self.catalog),report['quality_assessment'])
        self.assertTrue(all(r['supporting_for'] for r in report['semantic_intent']['requirements'] if r['id'].startswith('support_')))

    def test_startup_rejects_broken_metadata_references(self):
        mutations=[lambda r:r['subjects']['orders']['metrics'].append('missing'),
            lambda r:r['metrics']['revenue']['business_filters'].append({'dimension':'missing'}),
            lambda r:r['dimensions']['product'].update(identity='missing'),
            lambda r:r['derived_features']['leader'].update(shape='unsupported_shape'),
            lambda r:r['domain_intelligence']['profiles']['orders']['metric_refs'].append('missing')]
        for mutate in mutations:
            overlay=deepcopy(self.catalog.overlay);mutate(overlay['analysis_registry'])
            with self.assertRaises(AnalysisError):validate_catalog(overlay)

    def test_payment_transactions_do_not_become_order_revenue(self):
        meaning=f.envelope(req('gateway',['payment_count','payment_revenue'],['payment_gateway'],days=30),
            req('state',['payment_count','payment_revenue'],['payment_transaction_status'],days=30),
            req('daily',['payment_revenue'],kind='trend',days=30,granularity='day'))
        p=self.pipeline(f.scripted(meaning));proposal=p.propose(self.request(PAYMENT_30D))
        queries=proposal['proposal']['analytical_queries']
        self.assertTrue(all(q['subject']=='payments' for q in queries if q['role']=='requested'))
        self.assertTrue(all(set(q['metrics'])<={'payment_count','payment_revenue'} for q in queries))
        packet=json.loads(p.provider.requests[0]['messages'][0]['content'])['semantic_candidate_packet']
        self.assertEqual(set(packet['explicit_metric_ids']),{'payment_count','payment_revenue'})
        self.assertTrue(packet['protected_input_facts']['metric_constraints'])
        self.assertEqual(p.provider.call_count,1);p.executor.assert_not_called()

    def test_duplicate_queries_keep_every_requirement_mapping(self):
        intent=AnalysisIntentEnvelope.model_validate(f.envelope(req('a',['revenue']),req('b',['revenue'])))
        resolved=AnalyticalResolver(self.catalog,f.REFERENCE).resolve(intent)
        self.assertEqual(len(resolved['operations']),1)
        self.assertEqual({c['requirement_id'] for c in resolved['coverage']},{'a','b'})
        self.assertEqual(resolved['coverage'][0]['operation_ids'],resolved['coverage'][1]['operation_ids'])

    def test_model_optional_ideas_cannot_change_metadata_support(self):
        a=deepcopy(recorded());b=deepcopy(a)
        b['requirements'].append(req('random_model_idea',['payment_revenue'],['payment_gateway'],days=45,supporting_for='summary_aggregate'))
        p=self.pipeline(f.scripted(a));q=self.pipeline(f.scripted(b))
        first=p.propose(self.request(OVERVIEW_45D));second=q.propose(self.request(OVERVIEW_45D))
        self.assertEqual(first['proposal']['resolved_plan_fingerprint'],second['proposal']['resolved_plan_fingerprint'])

    def test_value_profiles_are_cached_by_snapshot_and_do_not_share_mutations(self):
        from services.value_profile_service import profiles_for, _cache
        _cache.clear();loader=Mock(return_value={})
        first=profiles_for(self.catalog,loader);first['product']['common_values']=['tampered']
        self.assertNotEqual(profiles_for(self.catalog,loader)['product']['common_values'],['tampered'])
        self.assertEqual(loader.call_count,1)
        self.catalog.snapshot_version='new-snapshot';profiles_for(self.catalog,loader)
        self.assertEqual(loader.call_count,2)

    def test_live_qualification_reserves_hard_ceiling_and_stops_on_unknown_counts(self):
        from tools.qualify_live_dataplatform_ai import qualify
        session=Mock()
        session.post.return_value=Mock(json=Mock(return_value={'status':'proposal_ready','diagnostics':{'provider_call_count':3}}))
        result=qualify('http://fixture',session)
        self.assertEqual(result['submission_count'],2);self.assertEqual(result['LIVE_PROVIDER_REQUESTS'],6)
        self.assertTrue(all(call.args[0].endswith('/api/ai/propose-plan') for call in session.post.call_args_list))
        session.reset_mock();session.post.return_value=Mock(json=Mock(return_value={'status':'error','diagnostics':{}}))
        result=qualify('http://fixture',session)
        self.assertEqual(result['submission_count'],1);self.assertIsNone(result['LIVE_PROVIDER_REQUESTS'])

    def test_local_readiness_does_not_ping_provider(self):
        with patch('services.readiness_service.catalog_probe',return_value=True),patch('services.readiness_service.warehouse_probe',return_value=True),patch('services.agent_provider.requests.post') as http:
            result=readiness()
        self.assertEqual(result['status'],'ready');http.assert_not_called()
        self.assertIn('provider_status',result)

    def test_transport_classification_and_retry_rules(self):
        for status,category,retry in [(503,'provider_http',True),(429,'provider_rate_limited',True),(401,'provider_auth',False)]:
            attempt=http_failure(Mock(status_code=status,json=Mock(return_value={}),headers={'Retry-After':'1'}))
            self.assertEqual(attempt['error_category'],category)
            attempt['latency_ms']=100
            b=ProviderBudget({},3);b.start_deadline();b.consume()
            self.assertEqual(b.transport_retry_allowed(attempt,1 if status==429 else 0),retry)

    def test_health_failure_does_not_change_warehouse_readiness(self):
        from services import provider_health_service as health
        self.enterContext(patch.dict(health._state,last_success_at=None,last_failure_at=None,last_failure_category=None,
            recent_latency_ms=None,consecutive_failures=0,observed_monotonic=0,state='unknown'))
        with patch('services.readiness_service.catalog_probe',return_value=True),patch('services.readiness_service.warehouse_probe',return_value=True):
            self.assertEqual(readiness()['provider_status']['state'],'unknown')
            health.observe_attempt(dict(status='failed',error_category='provider_timeout',latency_ms=23000))
            local=readiness();self.assertEqual(local['status'],'ready')
            self.assertEqual(local['provider_status']['state'],'degraded')
