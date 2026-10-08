"""Production V2.8 regressions. Every HTTP/warehouse transport is forbidden."""
import json
import os
import unittest
from copy import deepcopy
from datetime import date
from itertools import permutations
from unittest.mock import Mock, patch
from common import AiTextToReportRequest, AiReportRefineRequest
from services.analysis_pipeline import AnalysisPipeline, safe_failure
from services.analysis_catalog import AnalysisCatalog, AnalysisError
from services.analysis_intent import AnalysisIntentEnvelope, IntentRequirement, intent_tool
from services.analytical_resolver import AnalyticalResolver, compatibility_index, ResolutionIssues, intent_fingerprint
from services.hybrid_analyst_planner import apply_delta
from services.analysis_quality_service import verify_saved_report
from services.session_service import get_session, encode_session, decode_session, RedisSessionStore
from services.provider_budget import ProviderBudget
from tests.agent_fixtures import ScriptedProvider, call
from tests.analysis_fixtures import physical_metadata, result
from evals.fixture_warehouse import FixtureWarehouse

REFERENCE=date(2026,10,8)
SCENARIO_A='Top 5 món có doanh thu cao nhất trong 30 ngày gần nhất. Với mỗi món, cho tôi doanh thu, số lượng bán và tỷ trọng đóng góp doanh thu. Cuối cùng chỉ ra món dẫn đầu và khoảng cách với món đứng thứ hai.'


def requirement(**updates):
    return dict(id='r1',goal='Phân tích doanh thu sản phẩm',domain_id='products',metric_ids=['product_revenue','quantity_sold'],
        dimension_ids=['product'],analysis_kind='ranking',ranking={'limit':5,'metric_id':'product_revenue'},
        time={'kind':'rolling','amount':30,'unit':'day'},derived_features=['contribution_share','leader','top_gap'],**updates) if not updates else {**requirement(),**updates}


def envelope(*requirements,**updates):
    return {'decision':'analyze','requirements':list(requirements) or [requirement()],**updates}


def scripted(*envelopes):
    return ScriptedProvider(*[[call('submit_analysis_intent',e)] for e in envelopes])


def approve(request,proposal):
    p=proposal['proposal'];request.session_id=proposal['session_id']
    request.proposal_revision=p['revision'];request.intent_fingerprint=p['semantic_intent_fingerprint']
    request.plan_fingerprint=p['resolved_plan_fingerprint'];request.catalog_fingerprint=p['catalog_fingerprint']
    return request


class HybridTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch.dict(os.environ,{'AI_OFFLINE':'1','DATA_ANALYST_ENV':'development','DATA_ANALYST_SESSION_STORE':'memory',
            'DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN':'3','DATA_ANALYST_ENABLE_CONTRACT_REPAIR':'1','DATA_ANALYST_ONE_SHOT_CONTEXT_MAX_CHARS':'24000'}))
        for target in ('requests.sessions.Session.request','psycopg2.connect'):
            self.enterContext(patch(target,side_effect=AssertionError('External transport forbidden')))
        self.catalog=AnalysisCatalog(physical_metadata())

    def pipeline(self,provider=None,executor=None):
        return AnalysisPipeline(metadata_loader=physical_metadata,provider=provider or scripted(envelope()),executor=executor or Mock(),value_lookup=Mock(return_value=[]),owner_id='owner-a')

    def request(self,question=SCENARIO_A,**updates):
        return AiTextToReportRequest(question=question,reference_date=REFERENCE,**updates)

    def test_exact_live_failure_four_variants_no_bookkeeping_retry(self):
        variants=[envelope(requirement(lens_hint='item_sales')),
            envelope(requirement(lens_hint='product_volume')),
            envelope(requirement(lens_hint='item_sales'),requirement(id='r2',lens_hint='product_volume')),
            envelope(requirement(),analysis_breadth='comprehensive')]
        fingerprints=[]
        for variant in variants:
            p=self.pipeline(scripted(variant));proposal=p.propose(self.request());q=proposal['proposal']['analytical_queries']
            self.assertEqual(p.provider.call_count,1);p.executor.assert_not_called()
            self.assertEqual(len(q),2) # one ranking + exact full denominator
            self.assertEqual(q[0]['subject'],'products');self.assertEqual(q[0]['metrics'],['product_revenue','quantity_sold'])
            self.assertEqual(q[0]['ranking']['top_n'],5);self.assertEqual(q[0]['time']['start'],'2026-09-09')
            self.assertEqual(proposal['diagnostics']['request_anchor_verification'],'passed')
            fingerprints.append(proposal['proposal']['resolved_plan_fingerprint'])
            tool=p.provider.requests[0]['tools'][0]
            self.assertEqual(tool['name'],'submit_analysis_intent')
            for field in ('requested_operations','analysis_components','supporting_operations','subject','operation_ids','parent_id'):
                self.assertNotIn(field,tool['parameters']['properties'])
        self.assertEqual(len(set(fingerprints)),1)

    def test_minimal_compatible_partition_preserves_metric_populations(self):
        req=requirement(metric_ids=['revenue','order_count','aov'],dimension_ids=['city'],analysis_kind='aggregate',ranking=None,derived_features=[])
        resolved=AnalyticalResolver(self.catalog,REFERENCE).resolve(AnalysisIntentEnvelope.model_validate(envelope(req)))
        self.assertEqual(len(resolved['operations']),2)
        self.assertEqual(sorted(sorted(o['metrics']) for o in resolved['operations']),[['aov','revenue'],['order_count']])
        p=self.pipeline(scripted(envelope(req)));r=p.propose(self.request('Doanh thu, số đơn, giá trị đơn trung bình theo thành phố'))
        self.assertEqual(r['status'],'proposal_ready');self.assertEqual(p.provider.call_count,1)
        self.assertEqual(r['diagnostics']['requested_component_count'],1)

    def test_omitted_third_metric_detected_and_added_without_changing_first_two(self):
        first=requirement(metric_ids=['revenue','aov'],dimension_ids=['city'],analysis_kind='aggregate',ranking=None,derived_features=[],time=None)
        missing=requirement(id='r2',goal='Số lượng đơn',metric_ids=['order_count'],dimension_ids=['city'],analysis_kind='aggregate',ranking=None,derived_features=[],time=None)
        provider=scripted(envelope(first),envelope(missing));p=self.pipeline(provider)
        r=p.propose(self.request('Doanh thu, giá trị đơn trung bình và số đơn theo thành phố'))
        self.assertEqual(provider.call_count,2);self.assertEqual(r['diagnostics']['semantic_repair_count'],1)
        context=json.loads(provider.requests[1]['messages'][0]['content'])
        self.assertEqual(context['frozen_requirement_ids'],['r1']);self.assertEqual(context['affected_requirements'],[])
        self.assertEqual(len(r['proposal']['analysis_components']),2)
        self.assertTrue(any(i['code']=='explicit_metrics_missing' for i in context['validation_issues']))

    def test_wrong_but_schema_valid_metric_never_full_success(self):
        req=requirement(metric_ids=['aov'],dimension_ids=['city'],analysis_kind='aggregate',ranking=None,derived_features=[],time=None)
        p=self.pipeline(scripted(envelope(req),envelope(req),envelope(req)))
        with self.assertRaises(AnalysisError) as caught:p.propose(self.request('Doanh thu theo thành phố'))
        self.assertEqual(p.provider.call_count,3);p.executor.assert_not_called()
        failure=safe_failure(caught.exception,p.calls,p.semantic_info)
        self.assertEqual(failure['outcome'],'SYSTEM_ERROR');self.assertIsNone(failure['quality_assessment']['score'])

    def test_repair_freezes_unrelated_requirements_and_accepted_scope_fields(self):
        valid=requirement(id='r1',derived_features=[])
        bad=requirement(id='r2',metric_ids=['unknown_metric'],derived_features=[])
        fixed=requirement(id='r2',derived_features=[])
        changed={**valid,'time':{'kind':'relative','mode':'all_time'}}
        p=self.pipeline(scripted(envelope(valid,bad),envelope(changed,fixed),envelope(fixed)))
        r=p.propose(self.request('Phân tích đã chọn'))
        self.assertEqual(p.provider.call_count,3)
        intent=r['diagnostics']['semantic_intent'];self.assertEqual(len(intent['requirements']),1) # equivalent duplicate meaning
        self.assertEqual(intent['requirements'][0]['time']['amount'],30)
        second=json.loads(p.provider.requests[1]['messages'][0]['content'])
        self.assertEqual(second['frozen_requirement_ids'],['r1'])

    def test_targeted_metric_repair_cannot_drop_filter_or_change_time(self):
        bad=requirement(metric_ids=['unknown'],filters=[{'dimension':'city','value':'Hà Nội'}],derived_features=[])
        for change in ({'filters':[]},{'time':{'kind':'relative','mode':'all_time'}},{'ranking':{'limit':10,'metric_id':'product_revenue'}}):
            # Metric repair needs the ranking metric too; field must explicitly
            # be targeted, and unrelated time/filter facts remain immutable.
            good={**bad,'metric_ids':['product_revenue','quantity_sold'],**change}
            p=self.pipeline(scripted(envelope(bad),envelope(good),envelope(good)))
            with self.assertRaises(AnalysisError):p.propose(self.request('Theo lựa chọn'))
            self.assertEqual(p.provider.call_count,3);p.executor.assert_not_called()

    def test_malformed_sibling_preserves_good_requirements(self):
        a=requirement(id='r1',metric_ids=['revenue'],analysis_kind='aggregate',dimension_ids=[],ranking=None,derived_features=[],time=None)
        b=requirement(id='r2',metric_ids=['quantity_sold'],derived_features=[],ranking={'limit':5,'metric_id':'quantity_sold'},granularity='bad')
        repaired={**b,'granularity':None}
        p=self.pipeline(scripted(envelope(a,b),envelope(repaired)))
        r=p.propose(self.request('Theo lựa chọn'))
        self.assertEqual(p.provider.call_count,2);self.assertEqual(len(r['proposal']['analysis_components']),2)
        context=json.loads(p.provider.requests[1]['messages'][0]['content'])
        self.assertIn('r1',context['frozen_requirement_ids'])

    def test_ui_time_authority_and_server_breadth_ignore_provider_advice(self):
        fingerprints=[]
        for breadth in ('focused','deep','comprehensive'):
            p=self.pipeline(scripted(envelope(requirement(),analysis_breadth=breadth)))
            r=p.propose(self.request(time={'mode':'previous_month'}))
            self.assertEqual(r['proposal']['analytical_queries'][0]['time']['start'],'2026-09-01')
            self.assertEqual(r['diagnostics']['analysis_breadth'],'focused')
            fingerprints.append(r['proposal']['resolved_plan_fingerprint'])
        self.assertEqual(len(set(fingerprints)),1)

    def test_equivalent_orderings_hints_and_requirement_ids_same_fingerprint(self):
        fingerprints=set()
        for metrics in permutations(['product_revenue','quantity_sold']):
            for hint in ('item_sales','product_sales',None):
                for id in ('r1','different'):
                    req=requirement(id=id,metric_ids=list(metrics),lens_hint=hint)
                    resolved=AnalyticalResolver(self.catalog,REFERENCE).resolve(AnalysisIntentEnvelope.model_validate(envelope(req)))
                    fingerprints.add(resolved['plan_fingerprint'])
        self.assertEqual(len(fingerprints),1)

    def test_approval_fingerprints_owner_revision_catalog_fail_before_execution(self):
        p=self.pipeline();request=self.request();proposal=p.propose(request);approve(request,proposal)
        for field in ('proposal_revision','intent_fingerprint','plan_fingerprint','catalog_fingerprint'):
            original=getattr(request,field);setattr(request,field,99 if field=='proposal_revision' else 'tampered')
            with self.assertRaises(AnalysisError):p.generate(request)
            p.executor.assert_not_called();setattr(request,field,original)
        other=self.pipeline();other.owner_id='other'
        with self.assertRaises(AnalysisError):other.generate(request)
        other.executor.assert_not_called()

    def test_execution_uses_zero_provider_calls_and_true_share_denominator(self):
        warehouse=FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        p=self.pipeline(executor=warehouse);req=self.request();proposal=p.propose(req);approve(req,proposal)
        report=p.generate(req)
        self.assertEqual(p.provider.call_count,1);self.assertEqual(report['diagnostics']['provider_call_count'],0)
        shares=[e for e in report['evidence'] if e['feature']=='contribution_share']
        self.assertEqual(len(shares),2)
        self.assertTrue(all(e['values']['denominator']==600 for e in shares)) # o1 is outside 30 days; canceled o3 excluded
        for actual,expected in zip(sorted(e['values']['share_pct'] for e in shares),[100/3,200/3]):self.assertAlmostEqual(actual,expected)
        self.assertEqual(report['quality_assessment'],verify_saved_report(report,self.catalog))
        self.assertEqual(report['quality_assessment']['coverage']['completed_count'],1)
        self.assertEqual(report['quality_assessment']['status'],'verified')

    def test_no_execution_retry_for_db_or_result_contract_failure(self):
        for executor in (Mock(side_effect=RuntimeError('DB offline')),Mock(return_value=result([{'product':'X','password':'private'}]))):
            p=self.pipeline(executor=executor);req=self.request();approve(req,p.propose(req))
            with self.assertRaises(AnalysisError):p.generate(req)
            self.assertEqual(p.provider.call_count,1);self.assertEqual(executor.call_count,1)

    def test_semantic_delta_preserves_untouched_meaning_and_reuses_results(self):
        warehouse=FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        p=self.pipeline(executor=warehouse);req=self.request();approve(req,p.propose(req));report=p.generate(req)
        p.provider=ScriptedProvider([call('submit_analysis_delta',{'changes':[{'action':'update','requirement_id':'r1','changes':{'ranking':{'limit':2,'metric_id':'product_revenue'}}}]})])
        refined=p.refine(AiReportRefineRequest(session_id=req.session_id,current_report={'revision':report['revision']},feedback='Top 2'))
        self.assertEqual(p.provider.call_count,1);self.assertEqual(refined['semantic_intent']['requirements'][0]['ranking']['limit'],2)
        self.assertEqual(refined['semantic_intent']['requirements'][0]['time']['amount'],30)
        self.assertEqual(p.provider.requests[0]['tools'][0]['name'],'submit_analysis_delta')
        self.assertEqual(refined['quality_assessment']['status'],'verified')
        self.assertEqual(refined['quality_assessment'],verify_saved_report(refined,self.catalog))

    def test_partial_scope_requires_current_explicit_approval(self):
        missing=requirement(id='r2',goal='ROI marketing',metric_ids=[],dimension_ids=[],ranking=None,derived_features=[],analysis_kind=None,time=None,availability='unsupported',reason='definition_unavailable')
        p=self.pipeline(scripted(envelope(requirement(),missing)))
        req=self.request();proposal=p.propose(req);self.assertEqual(proposal['outcome'],'PARTIAL_AVAILABLE');approve(req,proposal)
        with self.assertRaises(AnalysisError) as caught:p.generate(req)
        self.assertEqual(caught.exception.category,'approval_required');p.executor.assert_not_called()

    def test_catalog_index_property_every_metric_dimension_lens(self):
        index=compatibility_index(self.catalog)
        self.assertEqual(len(index.metrics),33);self.assertEqual(len(index.lenses),38)
        for metric,definition in index.metrics.items():
            for lens in index.lenses:
                req=requirement(metric_ids=[metric],dimension_ids=[],ranking=None,derived_features=[],analysis_kind='aggregate',time=None,lens_hint=lens)
                resolved=AnalyticalResolver(self.catalog,REFERENCE).resolve(AnalysisIntentEnvelope.model_validate(envelope(req)))
                self.assertEqual(resolved['coverage'][0]['state'],'RESOLVED')
                self.assertEqual(resolved['operations'][0]['metrics'],[metric])
                agent=self.pipeline().agent(self.catalog,REFERENCE,proposal=True)
                agent.semantic.discovered.update(index.references)
                for op in resolved['operations']:agent.queries.prepare(op)
            for d in definition['dimensions']:
                self.assertIn(metric,index.dimensions[d]['metrics'])
        for domain,p in index.domains.items():
            for lens in p['analytical_lenses']:
                req=IntentRequirement(id='r1',goal='Lens default',lens_hint=lens['id'])
                try:
                    resolved=AnalyticalResolver(self.catalog,REFERENCE).resolve(AnalysisIntentEnvelope(decision='analyze',requirements=[req]))
                except ResolutionIssues:
                    self.assertFalse(lens['blueprint']['default_metric_refs']);continue
                agent=self.pipeline().agent(self.catalog,REFERENCE,proposal=True)
                agent.semantic.discovered.update(index.references)
                for op in resolved['operations']:agent.queries.prepare(op)

    def test_three_attempt_transport_budget_and_nonretryable_auth(self):
        success={'calls':[call('submit_analysis_intent',envelope())],'attempts':[]}
        for code,status,count in [('provider_timeout',None,3),('provider_connection',None,3),('provider_http',503,3),('provider_auth',401,1),('provider_access_denied',403,1),('provider_daily_quota',429,1),('provider_rate_limited',429,1)]:
            failure={'calls':None,'attempts':[{'error_category':code,'http_status':status}]}
            provider=Mock(side_effect=[failure,failure,success]);p=self.pipeline(provider)
            if count==3:
                self.assertEqual(p.propose(self.request())['status'],'proposal_ready')
            else:
                with self.assertRaises(AnalysisError):p.propose(self.request())
            self.assertEqual(provider.call_count,count);p.executor.assert_not_called()
        budget=ProviderBudget(max_calls=3)
        for _ in range(3):budget.consume()
        with self.assertRaises(AnalysisError):budget.consume()

    def test_context_and_schema_reduction(self):
        from services.analyst_decision import decision_tool
        from services.semantic_manifest_service import compact
        self.assertLess(len(compact(intent_tool())),len(compact(decision_tool(natural=True,refinement=False)))*0.65)
        p=self.pipeline();r=p.propose(self.request())
        self.assertLess(r['diagnostics']['total_context_chars'],18000)
        self.assertNotIn('blueprint',json.dumps(p.provider.requests[0]['messages']))

    def test_serialization_restores_artifacts_and_excludes_locks(self):
        p=self.pipeline();proposal=p.propose(self.request());session=get_session(proposal['session_id'])
        raw=encode_session(session);restored=decode_session(raw)
        self.assertNotIn('analysis_lock',raw);self.assertEqual(restored.plan_fingerprint,session.plan_fingerprint)
        self.assertEqual(list(restored.agent_artifacts),list(session.agent_artifacts))
        restored.analysis_lock.acquire();restored.analysis_lock.release()

    def test_report_sql_policy_fails_closed_and_rejects_sensitive_clauses(self):
        from services.report_sql_policy import require_sql_admin, validate_report_sql
        from fastapi import HTTPException
        from services.sql_service import SqlSafetyError
        with patch.dict(os.environ,{'DATA_ANALYST_REPORT_SQL_MODE':'disabled'}):
            with self.assertRaises(HTTPException):require_sql_admin(None)
        for sql in ('SELECT * FROM orders.don_hang','SELECT password FROM identity.users','SELECT ma_don_hang FROM silver.don_hang WHERE password IS NOT NULL', 'SELECT pg_sleep(1) FROM silver.don_hang'):
            with self.assertRaises(SqlSafetyError):validate_report_sql(sql,self.catalog)
        validate_report_sql('SELECT COUNT(ma_don_hang) AS count FROM silver.don_hang',self.catalog)

    def test_native_json_and_compat_single_function_have_no_execution_tools(self):
        from services.agent_provider import NativeAgentProvider
        native=NativeAgentProvider()._gemini_body('',[],[intent_tool()])
        self.assertNotIn('tools',native);self.assertEqual(native['generationConfig']['responseMimeType'],'application/json')
        compat=NativeAgentProvider()._gemini_compat_body('',[],[intent_tool()],'fixture')
        self.assertEqual(len(compat['tools']),1);self.assertEqual(compat['tools'][0]['function']['name'],'submit_analysis_intent')

    def test_query_content_tamper_blocked_before_sql_and_saved_verifier(self):
        p=self.pipeline();request=self.request();proposal=p.propose(request);approve(request,proposal)
        session=get_session(request.session_id)
        first=next(iter(session.agent_artifacts.values()))
        first.query=first.query.model_copy(update={'metrics':['quantity_sold']})
        with self.assertRaises(AnalysisError) as error:p.generate(request)
        self.assertEqual(error.exception.category,'stale_approval');p.executor.assert_not_called()
        warehouse=FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        p=self.pipeline(executor=warehouse);req=self.request();approve(req,p.propose(req));report=p.generate(req)
        for field in ('query_plans','sql_by_query'):
            modified=deepcopy(report);modified[field]={} if field=='sql_by_query' else []
            self.assertEqual(verify_saved_report(modified,self.catalog)['status'],'not_scored')
        modified=deepcopy(report)
        modified['analytical_queries'][0]['ranking']['top_n']=2
        self.assertEqual(verify_saved_report(modified,self.catalog)['status'],'not_scored')

    def test_refinement_cannot_silently_erase_original_time(self):
        warehouse=FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        p=self.pipeline(executor=warehouse);req=self.request();approve(req,p.propose(req));report=p.generate(req)
        delta={'changes':[{'action':'update','requirement_id':'r1','changes':{'ranking':{'limit':2,'metric_id':'product_revenue'},'time':{'kind':'relative','mode':'all_time'}}}]}
        changed=requirement(ranking={'limit':2,'metric_id':'product_revenue'},time={'kind':'relative','mode':'all_time'})
        p.provider=ScriptedProvider([call('submit_analysis_delta',delta)],[call('submit_analysis_intent',envelope(changed))],[call('submit_analysis_intent',envelope(changed))])
        with self.assertRaises(AnalysisError):p.refine(AiReportRefineRequest(session_id=req.session_id,current_report={'revision':report['revision']},feedback='Top 2'))
        self.assertEqual(p.provider.call_count,3)
        self.assertEqual(get_session(req.session_id).semantic_intent['requirements'][0]['time']['amount'],30)

    def test_semantic_detail_projects_only_catalog_fields(self):
        req=requirement(domain_id='orders',metric_ids=[],dimension_ids=['order_id','order_status'],analysis_kind='detail',ranking=None,derived_features=[])
        p=self.pipeline(scripted(envelope(req)))
        proposal=p.propose(self.request('Bảng chi tiết đã chọn'))
        query=proposal['proposal']['analytical_queries'][0]
        self.assertEqual(query['operation'],'detail');self.assertEqual(query['project'],['order_id','order_status'])
        self.assertEqual(query['subject'],'orders');self.assertEqual(query['limit'],100)
        bad={**req,'dimension_ids':['password']}
        p=self.pipeline(scripted(envelope(bad),envelope(bad),envelope(bad)))
        with self.assertRaises(AnalysisError):p.propose(self.request('Bảng chi tiết đã chọn'))
        p.executor.assert_not_called()

    def test_per_group_ranking_server_includes_partition_dimension(self):
        req=requirement(ranking={'limit':5,'metric_id':'product_revenue','per_group':['city']})
        p=self.pipeline(scripted(envelope(req)));proposal=p.propose(self.request('Top 5 món theo doanh thu của từng thành phố trong 30 ngày gần nhất'))
        query=proposal['proposal']['analytical_queries'][0]
        self.assertEqual(set(query['group_by']),{'city','product'});self.assertEqual(query['ranking']['per_group'],['city'])
        self.assertEqual(proposal['proposal']['analytical_queries'][1]['group_by'],['city'])

    def test_redis_cas_owner_ttl_capacity_and_stale_lock(self):
        from services.session_service import ReportSession, SESSION_TTL_SECONDS, storage
        class Client:
            def __init__(self):self.values={};self.calls=[]
            def eval(self,script,num,key,index,expected,body,ttl,owner,now,capacity):
                self.calls.append((script,ttl,capacity))
                prior=json.loads(self.values[key]) if key in self.values else None
                if prior and prior['version']!=expected or not prior and expected:return -1
                if prior and prior['owner'] is not None and prior['owner']!=owner:return -2
                if not prior and len(self.values)>=capacity:return -3
                self.values[key]=body;return 1
            def get(self,key):return self.values.get(key)
            def lock(self,*args,**kwargs):return Mock(__enter__=Mock(),__exit__=Mock(return_value=False))
        client=Client();a=RedisSessionStore(client);b=RedisSessionStore(client)
        session=ReportSession(session_id='offline',original_prompt='meaning',owner_id='owner-a')
        a.save(session,create=True);one=a.get('offline');two=b.get('offline')
        one.revision=2;a.save(one)
        with self.assertRaises(AnalysisError):b.save(two)
        with self.assertRaises(AnalysisError):
            with two.analysis_lock:pass
        current=b.get('offline');current.owner_id='owner-b'
        with self.assertRaises(AnalysisError):b.save(current)
        self.assertEqual(a.get('offline').owner_id,'owner-a')
        self.assertEqual(client.calls[0][1],SESSION_TTL_SECONDS)
        with patch('services.session_service.MAX_SESSIONS',1):
            with self.assertRaises(AnalysisError):a.save(ReportSession(session_id='second',original_prompt='meaning'),create=True)
        with patch.dict(os.environ,{'DATA_ANALYST_ENV':'production','DATA_ANALYST_SESSION_STORE':'memory'}):
            with self.assertRaises(AnalysisError):storage()


    def test_native_structured_json_recovery_model_only_on_third_attempt(self):
        from services.agent_provider import NativeAgentProvider
        from services import llm_service
        bad=envelope(requirement(granularity='fortnight'))
        bodies=[{'candidates':[{'content':{'parts':[{'text':'private reasoning','thought':True},{'text':json.dumps(value)}]}}],
                 'usageMetadata':{'promptTokenCount':100,'candidatesTokenCount':20}} for value in [bad,bad,envelope(requirement(granularity=None))]]
        responses=[Mock(ok=True,json=Mock(return_value=b)) for b in bodies]
        with patch.dict(os.environ,{'AI_OFFLINE':'0','GEMINI_API_STYLE':'native','DATA_ANALYST_INTENT_TRANSPORT':'json','DATA_ANALYST_RECOVERY_MODEL':'configured-recovery'}),patch.object(llm_service,'GEMINI_API_KEY','fixture-key'),patch.object(llm_service,'GEMINI_MODELS',['fixture-primary']),patch('services.agent_provider.requests.post',side_effect=responses) as transport:
            p=self.pipeline(NativeAgentProvider());proposal=p.propose(self.request())
            self.assertEqual(transport.call_count,3);self.assertEqual(proposal['diagnostics']['provider_call_count'],3)
            self.assertEqual(proposal['diagnostics']['model_escalation_count'],1)
            self.assertEqual(proposal['diagnostics']['targeted_resolution_count'],1)
            self.assertEqual(proposal['diagnostics']['input_tokens'],300)
            urls=[c.args[0] for c in transport.call_args_list]
            self.assertTrue(all('fixture-primary' in url for url in urls[:2]));self.assertIn('configured-recovery',urls[2])
            for c in transport.call_args_list:
                body=c.kwargs['json'];self.assertNotIn('tools',body)
                self.assertEqual(body['generationConfig']['responseMimeType'],'application/json')
                self.assertNotIn('private reasoning',json.dumps(body))
            p.executor.assert_not_called()

    def test_all_compatible_metric_dimension_shapes_compile_or_disclose_history(self):
        index=compatibility_index(self.catalog)
        p=self.pipeline();agent=p.agent(self.catalog,REFERENCE,proposal=True)
        agent.semantic.discovered.update(index.references)
        checked=0
        for metric,definition in index.metrics.items():
            for dimension in definition['dimensions']:
                for kind in ('aggregate','ranking','distribution','trend'):
                    req=requirement(metric_ids=[metric],dimension_ids=[dimension],analysis_kind=kind,derived_features=[],time=None,
                        ranking={'limit':5,'metric_id':metric} if kind=='ranking' else None,granularity='month' if kind=='trend' else None)
                    resolved=AnalyticalResolver(self.catalog,REFERENCE).resolve(AnalysisIntentEnvelope.model_validate(envelope(req)))
                    if kind=='trend' and not definition['historical']:
                        self.assertEqual(resolved['coverage'][0]['state'],'INSUFFICIENT_DATA');self.assertFalse(resolved['operations'])
                    else:
                        self.assertEqual(resolved['coverage'][0]['state'],'RESOLVED')
                        for op in resolved['operations']:agent.queries.prepare(op)
                    checked+=1
        self.assertGreater(checked,500)


    def test_descriptive_goal_cannot_block_scenario_a_or_consume_repair(self):
        # Live diagnostics name goal on all three attempts. Raw provider text
        # was not retained; these cover every local goal validation variant.
        variants=[SCENARIO_A,SCENARIO_A*15,'',None,'   ']
        variants.append('Phân tích theo lựa chọn')
        fingerprints=set()
        for goal in variants:
            req=requirement(id='top_products_revenue_30d',goal=goal)
            p=self.pipeline(scripted(envelope(req)))
            proposal=p.propose(self.request())
            self.assertEqual(p.provider.call_count,1)
            self.assertEqual(proposal['diagnostics']['contract_rejection_count'],0)
            self.assertEqual(proposal['diagnostics']['contract_repair_count'],0)
            self.assertEqual(len(proposal['proposal']['analytical_queries']),2)
            self.assertLessEqual(len(proposal['proposal']['analysis_components'][0]['business_goal']),120)
            fingerprints.add(proposal['proposal']['resolved_plan_fingerprint'])
            p.executor.assert_not_called()
        missing=requirement();missing.pop('goal')
        p=self.pipeline(scripted(envelope(missing)))
        proposal=p.propose(self.request());self.assertEqual(p.provider.call_count,1)
        fingerprints.add(proposal['proposal']['resolved_plan_fingerprint'])
        self.assertEqual(len(fingerprints),1)

    def test_long_goal_survives_execution_and_independent_saved_quality(self):
        warehouse=FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        p=self.pipeline(scripted(envelope(requirement(goal=SCENARIO_A))),executor=warehouse)
        req=self.request();approve(req,p.propose(req));report=p.generate(req)
        self.assertEqual(report['quality_assessment']['status'],'verified')
        self.assertEqual(report['quality_assessment'],verify_saved_report(report,self.catalog))
        self.assertEqual(p.provider.call_count,1)
        shares=[e for e in report['evidence'] if e['feature']=='contribution_share']
        self.assertEqual(len(shares),2);self.assertTrue(all(e['values']['denominator']==600 for e in shares))

    def test_malformed_goal_repair_includes_valid_scope_and_exact_error_type(self):
        bad=requirement(goal={'invalid':'structure'})
        fixed=requirement(goal='Doanh thu sản phẩm')
        p=self.pipeline(scripted(envelope(bad),envelope(fixed)))
        proposal=p.propose(self.request())
        self.assertEqual(p.provider.call_count,2)
        payload=json.loads(p.provider.requests[1]['messages'][0]['content'])
        issue=payload['validation_issues'][0]
        self.assertEqual(issue['field'],'goal');self.assertEqual(issue['validation_type'],'string_type')
        draft=payload['affected_requirements'][0]
        self.assertNotIn('goal',draft)
        for field in ('metric_ids','dimension_ids','ranking','time','derived_features'):
            self.assertEqual(draft[field],AnalysisIntentEnvelope.model_validate(envelope(fixed)).requirements[0].model_dump(mode='json')[field])
        self.assertEqual(proposal['status'],'proposal_ready')
        # Even without any valid sibling, fixing presentation cannot erase time.
        changed={**fixed,'time':{'kind':'relative','mode':'all_time'}}
        p=self.pipeline(scripted(envelope(bad),envelope(changed),envelope(changed)))
        with self.assertRaises(AnalysisError):p.propose(self.request())
        self.assertEqual(p.provider.call_count,3);p.executor.assert_not_called()

    def test_compat_transport_long_goal_succeeds_first_attempt_without_live_http(self):
        from services.agent_provider import NativeAgentProvider
        from services import llm_service
        for style in ('openai','native'):
            value=envelope(requirement(goal=SCENARIO_A))
            body=({'choices':[{'message':{'tool_calls':[{'id':'fixture','type':'function','function':{'name':'submit_analysis_intent','arguments':json.dumps(value)}}]}}]}
                  if style=='openai' else {'candidates':[{'content':{'parts':[{'text':json.dumps(value)}]}}]})
            with patch.dict(os.environ,{'AI_OFFLINE':'0','GEMINI_API_STYLE':style,'DATA_ANALYST_INTENT_TRANSPORT':'json'}),patch.object(llm_service,'GEMINI_API_KEY','fixture-key'),patch.object(llm_service,'GEMINI_MODELS',['fixture-model']),patch('services.agent_provider.requests.post',return_value=Mock(ok=True,json=Mock(return_value=body))) as transport:
                p=self.pipeline(NativeAgentProvider());proposal=p.propose(self.request())
                self.assertEqual(transport.call_count,1);self.assertEqual(proposal['diagnostics']['provider_call_count'],1)
                self.assertEqual(proposal['status'],'proposal_ready');p.executor.assert_not_called()



if __name__=='__main__':unittest.main()
