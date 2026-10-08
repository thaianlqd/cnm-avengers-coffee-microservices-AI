"""Recorded diagnostics plus adversarial fresh semantic/transport variants.

No live HTTP/AI/database connections. Product raw envelopes were not retained;
reconstructed fields below are explicit, not claimed to be exact model output.
"""
import json
import os
from copy import deepcopy
from pathlib import Path
from unittest.mock import Mock,patch
from services.analysis_intent import AnalysisIntentEnvelope,repair_tool
from services.analysis_pipeline import safe_failure
from services.analysis_catalog import AnalysisError
from services.request_anchors import metric_equivalents,request_anchors,verify_anchors
from services.analysis_quality_service import verify_saved_report
from tests import test_hybrid_v28 as fixture
from tests.agent_fixtures import ScriptedProvider,call
from evals.fixture_warehouse import FixtureWarehouse

RECORDED=json.loads((Path(__file__).parent/'fixtures/product_recovery_v284.json').read_text())
QUESTION=('Phân tích danh mục sản phẩm trong 60 ngày gần nhất: Top 10 món theo doanh thu, '
          'kèm số lượng bán và tỷ trọng doanh thu trên toàn hệ thống; cơ cấu doanh thu theo nhóm sản phẩm; '
          'xu hướng doanh thu sản phẩm theo tuần. Chỉ ra món dẫn đầu và khoảng cách với món đứng thứ hai, '
          'các sản phẩm cần điều tra thêm; không tự suy ra nguyên nhân khi chưa có bằng chứng.')


def reconstructed(record):
    reqs=[]
    for s in record['interpreted_shapes']:
        compare='compar' in s['requirement_id']
        ranking=s['analysis_kind']=='ranking' or compare
        reqs.append(fixture.requirement(id=s['requirement_id'],domain_id=None,
            metric_ids=s['metric_ids'],dimension_ids=s['dimension_ids'],analysis_kind=s['analysis_kind'],
            time={'kind':'rolling','amount':60,'unit':'day'},
            ranking={'limit':2 if compare else 10,'metric_id':'item_revenue'} if ranking else None,
            granularity='week' if s['analysis_kind']=='trend' else None,
            derived_features=['top_gap'] if compare else ['contribution_share'] if ranking else []))
    return fixture.envelope(*reqs)


class RecoveryTests(fixture.unittest.TestCase):
    setUp=fixture.HybridTests.setUp
    pipeline=fixture.HybridTests.pipeline
    request=fixture.HybridTests.request

    def report(self,intent,*repairs,question=QUESTION):
        warehouse=FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        p=self.pipeline(fixture.scripted(intent,*repairs),executor=Mock(wraps=warehouse))
        req=self.request(question);proposal=p.propose(req);p.executor.assert_not_called()
        fixture.approve(req,proposal);report=p.generate(req)
        self.assertEqual(report['outcome'],'SUCCESS')
        self.assertEqual(report['quality_assessment'],verify_saved_report(report,self.catalog))
        self.assertEqual(report['quality_assessment']['score'],90)
        return p,proposal,report

    def test_both_recorded_diagnostic_shapes_recover_without_manual_retries(self):
        for record in RECORDED['records']:
            with self.subTest(record=record['name']):
                intent=reconstructed(record)
                compare=next(r for r in intent['requirements'] if 'compar' in r['id'])
                repair=fixture.envelope({'id':compare['id'],'derived_features':['top_gap','leader']})
                p,proposal,report=self.report(intent,repair)
                self.assertEqual(p.provider.call_count,2)
                repair_props=p.provider.requests[1]['tools'][0]['parameters']['properties']['requirements']['items']['properties']
                self.assertEqual(set(repair_props),{'id','derived_features'})
                self.assertIn(compare['id'],repair_props['id']['enum'])
                self.assertEqual(proposal['diagnostics']['root_contract_issues'][0]['code'],'explicit_features_missing')
                self.assertTrue(all(c['state']=='RESOLVED' for c in report['resolved_requirement_coverage']))
                self.assertFalse(verify_anchors(request_anchors(QUESTION,self.catalog,{}),
                    AnalysisIntentEnvelope.model_validate(report['semantic_intent']).requirements,fixture.REFERENCE,self.catalog))
                self.assertTrue(any(e['feature']=='leader' for e in report['evidence']))
                self.assertTrue(any(e['feature']=='contribution_share' for e in report['evidence']))
                for r in report['semantic_intent']['requirements']:
                    self.assertEqual(r['time']['amount'],60)
                    self.assertIn('item_revenue',r['metric_ids'])

    def test_complete_fresh_variants_need_one_interpretation(self):
        for alias in ['item_revenue','product_revenue']:
            for missing_cadence in [False,True]:
                intent=reconstructed(RECORDED['records'][0])
                for i,r in enumerate(intent['requirements']):
                    r['id']='fresh_'+str(i)
                    r['metric_ids']=[alias if m=='item_revenue' else m for m in r['metric_ids']]
                    if r['ranking']:r['ranking']['metric_id']=alias
                    if r['analysis_kind']=='trend' and missing_cadence:r['granularity']=None
                    if 'top_gap' in r['derived_features']:r['derived_features'].append('leader')
                p,_,report=self.report(intent)
                self.assertEqual(p.provider.call_count,1)
                trend=next(r for r in report['semantic_intent']['requirements'] if r['analysis_kind']=='trend')
                self.assertEqual(trend['granularity'],'week')

    def test_equivalence_requires_declared_group_and_identical_semantics(self):
        self.assertIn('product_revenue',metric_equivalents(self.catalog)['item_revenue'])
        self.assertNotIn('revenue',metric_equivalents(self.catalog)['item_revenue'])
        for field,value in [('grain','order'),('expression','COUNT(*)'),('time_column',None),
                            ('business_filters',[]),('required_non_null',['changed']),('unit','USD')]:
            with patch.dict(self.catalog.registry['metrics']['item_revenue'],{field:value}):
                self.assertEqual(metric_equivalents(self.catalog)['item_revenue'],{'item_revenue'})
        with patch.dict(self.catalog.registry,{'equivalent_metric_groups':[]}):
            self.assertEqual(metric_equivalents(self.catalog)['item_revenue'],{'item_revenue'})

    def test_order_revenue_cannot_substitute_product_revenue(self):
        intent=fixture.envelope(fixture.requirement(metric_ids=['revenue'],ranking={'limit':5,'metric_id':'revenue'},derived_features=[]))
        p=self.pipeline(fixture.scripted(intent,intent,intent))
        with self.assertRaises(AnalysisError):p.propose(self.request('Doanh thu sản phẩm theo món'))
        p.executor.assert_not_called()

    def test_partial_ranking_repair_preserves_all_other_fields(self):
        initial=fixture.envelope(fixture.requirement(ranking={'limit':5},filters=[dict(dimension='city',value='Hà Nội')]))
        fixed=fixture.envelope({'id':'r1','ranking':{'metric_id':'product_revenue'}})
        p=self.pipeline(fixture.scripted(initial,fixed));proposal=p.propose(self.request())
        self.assertEqual(p.provider.call_count,2)
        r=proposal['diagnostics']['semantic_intent']['requirements'][0]
        self.assertEqual(r['time']['amount'],30);self.assertEqual(r['filters'][0]['value'],'Hà Nội')
        self.assertEqual(r['metric_ids'],['product_revenue','quantity_sold'])
        props=p.provider.requests[1]['tools'][0]['parameters']['properties']['requirements']['items']['properties']
        self.assertEqual(set(props),{'id','ranking'})
        self.assertEqual(props['id']['enum'],['r1'])
        p.executor.assert_not_called()

    def test_valid_repair_advances_to_next_issue_in_same_request(self):
        initial=fixture.envelope(fixture.requirement(granularity='invalid',derived_features=['top_gap','contribution_share']))
        cadence=fixture.envelope({'id':'r1','granularity':None})
        leader=fixture.envelope({'id':'r1','derived_features':['top_gap','contribution_share','leader']})
        p,proposal,_=self.report(initial,cadence,leader,question=fixture.SCENARIO_A)
        self.assertEqual(p.provider.call_count,3)
        history=proposal['diagnostics']['semantic_issue_history']
        self.assertEqual(history[0][0]['field'],'granularity')
        self.assertEqual(history[1][0]['code'],'explicit_features_missing')
        self.assertEqual(json.loads(p.provider.requests[2]['messages'][0]['content'])['validation_issues'][0]['field'],'derived_features')

    def test_partial_repair_cannot_change_time_even_if_schema_bypassed(self):
        initial=fixture.envelope(fixture.requirement(ranking={'limit':5}))
        attack=fixture.envelope({'id':'r1','ranking':{'limit':5,'metric_id':'product_revenue'},'time':{'kind':'relative','mode':'all_time'}})
        p=self.pipeline(fixture.scripted(initial,attack,attack))
        with self.assertRaises(AnalysisError) as caught:p.propose(self.request())
        failure=safe_failure(caught.exception,p.calls,p.semantic_info)
        self.assertEqual(failure['outcome'],'SYSTEM_ERROR')
        text=json.dumps(failure['issue'],ensure_ascii=False)
        self.assertIn('sắp thứ tự',text);self.assertIn('ngoài phần cần sửa',text)
        self.assertIn('Giữ nguyên câu hỏi',text);self.assertIn('Doanh thu sản phẩm',text)
        self.assertEqual(p.semantic_info['root_contract_issues'][0]['code'],'ranking_metric_required')
        p.executor.assert_not_called()

    def test_global_feature_patch_is_additive_only(self):
        intent=reconstructed(RECORDED['records'][0]);compare=next(r for r in intent['requirements'] if 'compar' in r['id'])
        bad=fixture.envelope({'id':compare['id'],'derived_features':['leader']}) # drops top_gap
        p=self.pipeline(fixture.scripted(intent,bad,bad))
        with self.assertRaises(AnalysisError):p.propose(self.request(QUESTION))
        p.executor.assert_not_called()

    def test_model_context_explains_compatibility_equivalence_and_shape_rules(self):
        p=self.pipeline();p.propose(self.request())
        payload=json.loads(p.provider.requests[0]['messages'][0]['content'])
        vocab=payload['vocabulary']
        self.assertIn('compatible_dimensions',vocab['metric_columns'])
        self.assertIn(['item_revenue','product_revenue'],vocab['equivalent_metrics'])
        metric=next(m for m in vocab['metrics'] if m[0]=='product_revenue')
        self.assertIn('product',metric[-1]);self.assertIn('category',metric[-1])
        self.assertIn('ranking.metric_id',vocab['shape_rules']['ranking'])
        self.assertLess(p.semantic_info['primary_context_chars'],24000)

    def test_error_card_uses_safe_catalog_labels_and_preserves_root_cause(self):
        diag={'provider_call_count':3,'interpreted_shapes':[dict(metric_ids=['product_revenue','secret_sql'],dimension_ids=['product'])],
            'root_contract_issues':[dict(code='explicit_features_missing',field='derived_features',candidate_ids=['leader','secret'])],
            'contract_issues':[dict(code='accepted_requirement_changed',field='frozen')],
            'request_anchors':{'times':[dict(kind='rolling',amount=60,unit='day')]}}
        failure=safe_failure(AnalysisError('semantic_intent_invalid','password SELECT private'),[],diag)
        text=json.dumps(failure['issue'],ensure_ascii=False)
        for expected in ['Doanh thu sản phẩm','60 ngày','dẫn đầu','đã chặn','3 lượt','Giữ nguyên câu hỏi']:self.assertIn(expected,text)
        for private in ['secret','password','SELECT','accepted_requirement_changed']:self.assertNotIn(private,text)
        self.assertIsNone(failure['quality_assessment']['score'])

    def test_transport_timeout_then_success_recovers_inside_one_action(self):
        from services.agent_provider import NativeAgentProvider
        from services import llm_service
        import requests
        body={'candidates':[{'content':{'parts':[{'text':json.dumps(fixture.envelope())}]}}]}
        with patch.dict(os.environ,{'AI_OFFLINE':'0','GEMINI_API_STYLE':'native','DATA_ANALYST_INTENT_TRANSPORT':'json'}),patch.object(llm_service,'GEMINI_API_KEY','fixture'),patch.object(llm_service,'GEMINI_MODELS',['fixture']),patch('services.agent_provider.requests.post',side_effect=[requests.exceptions.ReadTimeout('private'),Mock(ok=True,json=Mock(return_value=body))]) as http,patch('services.hybrid_analyst_planner.time.sleep'):
            p=self.pipeline(NativeAgentProvider());proposal=p.propose(self.request())
            self.assertEqual(http.call_count,2);self.assertEqual(proposal['diagnostics']['transport_retry_count'],1)
            self.assertTrue(all(c.kwargs['timeout']==(8,60) for c in http.call_args_list))
            p.executor.assert_not_called()

    def test_native_and_compat_transports_receive_partial_repair_schema(self):
        from services.agent_provider import NativeAgentProvider
        from services import llm_service
        first=fixture.envelope(fixture.requirement(ranking={'limit':5}))
        fixed=fixture.envelope({'id':'r1','ranking':{'limit':5,'metric_id':'product_revenue'}})
        for style in ['native','openai']:
            def body(value):
                return {'candidates':[{'content':{'parts':[{'text':json.dumps(value)}]}}]} if style=='native' else {'choices':[{'message':{'tool_calls':[{'id':'fixture','function':{'name':'submit_analysis_intent','arguments':json.dumps(value)}}]}}]}
            with patch.dict(os.environ,{'AI_OFFLINE':'0','GEMINI_API_STYLE':style,'DATA_ANALYST_INTENT_TRANSPORT':'json'}),patch.object(llm_service,'GEMINI_API_KEY','fixture'),patch.object(llm_service,'GEMINI_MODELS',['fixture']),patch('services.agent_provider.requests.post',side_effect=[Mock(ok=True,json=Mock(return_value=body(v))) for v in [first,fixed]]) as http:
                p=self.pipeline(NativeAgentProvider());p.propose(self.request());self.assertEqual(http.call_count,2)
                wire=http.call_args_list[1].kwargs['json']
                schema=wire['generationConfig']['responseJsonSchema'] if style=='native' else wire['tools'][0]['function']['parameters']
                props=schema['properties']['requirements']['items']['properties']
                self.assertEqual(set(props),{'id','ranking'})
                p.executor.assert_not_called()

    def test_explicit_weekly_cadence_cannot_be_changed_by_unrelated_refinement(self):
        from services.request_anchors import refinement_anchors
        intent=fixture.envelope(fixture.requirement(metric_ids=['product_revenue'],dimension_ids=['product'],
            analysis_kind='trend',ranking=None,granularity='week',derived_features=[]))
        question='Doanh thu sản phẩm theo tuần trong 30 ngày gần nhất'
        for feedback in ['Giữ nguyên phạm vi','Đổi sang theo tháng']:
            history=[dict(feedback=feedback,delta=dict(changes=[dict(action='update',requirement_id='r1',changes=dict(granularity='month'))]))]
            if feedback.startswith('Giữ'):
                with self.assertRaises(AnalysisError):refinement_anchors(question,intent,history,self.catalog,{},fixture.REFERENCE)
            else:
                anchors,actual=refinement_anchors(question,intent,history,self.catalog,{},fixture.REFERENCE)
                self.assertEqual(actual.requirements[0].granularity,'month')
                self.assertFalse(verify_anchors(anchors,actual.requirements,fixture.REFERENCE,self.catalog))

    def test_malformed_partial_repair_is_controlled_and_can_recover(self):
        initial=fixture.envelope(fixture.requirement(ranking={'limit':5}))
        repaired=fixture.envelope({'id':'r1','ranking':{'metric_id':'product_revenue'}})
        p=self.pipeline(fixture.scripted(initial,{'decision':'analyze','requirements':None},repaired))
        self.assertEqual(p.propose(self.request())['outcome'],'SUCCESS')
        self.assertEqual(p.provider.call_count,3)
        p.executor.assert_not_called()
