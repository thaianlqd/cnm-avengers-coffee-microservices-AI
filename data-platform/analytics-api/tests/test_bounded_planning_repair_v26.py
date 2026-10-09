"""Request-owned repair budget. Scripted decisions and rows, no live calls."""
import json
import os
import unittest
from copy import deepcopy
from datetime import date
from unittest.mock import Mock, patch
from common import AiTextToReportRequest
from tests.archive_planner import ArchivedGraphPipeline as AnalysisPipeline
from services.analysis_catalog import AnalysisError
from services.provider_budget import ProviderBudget
from tests.agent_fixtures import call, ScriptedProvider
from tests.analysis_fixtures import physical_metadata, result, ranked_rows
from tests.test_natural_v26 import plan, product


class BoundedRepairTests(unittest.TestCase):
    def setUp(self):
        config = patch.dict(os.environ, {"DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN":"2", "DATA_ANALYST_ENABLE_CONTRACT_REPAIR":"1", "AI_OFFLINE":"1"})
        config.start(); self.addCleanup(config.stop)
        for name in ('requests.sessions.Session.request','psycopg2.connect'):
            guard=patch(name, side_effect=AssertionError('External calls forbidden'));guard.start();self.addCleanup(guard.stop)

    def pipeline(self, provider):
        return AnalysisPipeline(metadata_loader=physical_metadata, provider=provider, executor=Mock(return_value=result(ranked_rows(10))), value_lookup=Mock(return_value=[]))

    def request(self):
        return AiTextToReportRequest(question='Phân tích sản phẩm tại TP.HCM', reference_date=date(2026,10,7),time={'mode':'previous_quarter'})

    def test_good_decision_uses_one_call_and_approval_uses_zero(self):
        provider=ScriptedProvider([call('submit_analyst_decision',plan(product()))])
        p=self.pipeline(provider); req=self.request(); proposal=p.propose(req)
        self.assertEqual(provider.call_count,1);p.executor.assert_not_called()
        self.assertEqual(proposal['diagnostics']['provider_call_budget'],2)
        self.assertEqual(proposal['diagnostics']['contract_repair_count'],0)
        req.session_id=proposal['session_id'];r=p.generate(req)
        self.assertEqual(r['status'],'success');self.assertEqual(provider.call_count,1)
        self.assertEqual(r['diagnostics']['provider_call_count'],0)

    def test_bad_contract_repaired_once_with_smaller_context_and_no_sql(self):
        invalid=plan(product(granularity='fortnight'))
        provider=ScriptedProvider([call('submit_analyst_decision',invalid)],[call('submit_analyst_decision',plan(product()))])
        p=self.pipeline(provider);r=p.propose(self.request());d=r['diagnostics']
        self.assertEqual(provider.call_count,2);p.executor.assert_not_called()
        self.assertEqual(d['contract_repair_count'],1);self.assertIsNone(d['terminal_error'])
        self.assertLess(d['repair_context_chars'],d['total_context_chars'])
        second=json.loads(provider.requests[1]['messages'][0]['content'])
        self.assertIn('validation_issues',second);self.assertIn('rejected_decision',second)
        self.assertEqual(second['question'],self.request().prompt)
        self.assertEqual(second['ui']['required_period']['start'],'2026-07-01')
        self.assertNotIn('sql',second);self.assertNotIn('result_sets',second)

    def test_preflight_scope_conflict_repaired_before_execution(self):
        invalid=plan(product(time={'kind':'relative','mode':'previous_month'}))
        provider=ScriptedProvider([call('submit_analyst_decision',invalid)],[call('submit_analyst_decision',plan(product()))])
        p=self.pipeline(provider);r=p.propose(self.request())
        self.assertEqual(provider.call_count,2);p.executor.assert_not_called()
        self.assertEqual(r['proposal']['analytical_queries'][0]['time']['start'],'2026-07-01')
        self.assertEqual(r['diagnostics']['repaired_contract_issues'][0]['code'],'scope_conflict')

    def test_second_invalid_decision_is_terminal(self):
        bad=[call('submit_analyst_decision',plan(product(granularity='fortnight')))]
        provider=ScriptedProvider(bad,bad,bad);p=self.pipeline(provider)
        with self.assertRaises(AnalysisError) as caught:p.propose(self.request())
        self.assertEqual(caught.exception.category,'invalid_analysis_contract')
        self.assertEqual(provider.call_count,2);p.executor.assert_not_called()
        self.assertEqual(p.semantic_info['contract_rejection_count'],2)

    def test_timeout_and_server_failure_retry_but_auth_quota_and_offline_do_not(self):
        for category,status,expected in [('provider_timeout',None,2),('provider_connection',None,2),('provider_http',503,2),('invalid_tool_response',200,2),('provider_auth',401,1),('provider_rate_limited',429,1),('provider_schema',400,1),('provider_offline',None,1)]:
            with self.subTest(category=category):
                first={'calls':None,'attempts':[{'error_category':category,'http_status':status,'tokens':{'input':100,'output':0}}]}
                if category=='provider_offline':first['offline']=True
                provider=Mock(side_effect=[first, {'calls':[call('submit_analyst_decision',plan(product()))], 'attempts':[{'tokens':{'input':50,'output':20}}]}])
                p=self.pipeline(provider)
                if expected==2:
                    r=p.propose(self.request());self.assertEqual(r['diagnostics']['input_tokens'],150)
                    self.assertEqual(r['diagnostics']['output_tokens'],20)
                else:
                    with self.assertRaises(AnalysisError):p.propose(self.request())
                self.assertEqual(provider.call_count,expected);p.executor.assert_not_called()

    def test_shared_transport_allowance_blocks_third_call(self):
        b=ProviderBudget(max_calls=2);b.consume();b.consume()
        with self.assertRaises(AnalysisError):b.consume()
        self.assertEqual(b.used,2)
        with self.assertRaises(AnalysisError):ProviderBudget(max_calls=4)

    def test_repair_cannot_silently_drop_a_requested_component(self):
        bad=plan(product(),{'id':'sales','lens_id':'product_sales','granularity':'fortnight'})
        provider=ScriptedProvider([call('submit_analyst_decision',bad)],[call('submit_analyst_decision',plan(product()))])
        p=self.pipeline(provider)
        with self.assertRaises(AnalysisError) as caught:p.propose(self.request())
        self.assertEqual(caught.exception.category,'invalid_analysis_contract')
        self.assertEqual(provider.call_count,2);p.executor.assert_not_called()

    def test_valid_large_series_uses_bounded_presentation_without_provider_replan(self):
        q={'id':'many','subject':'products','operation':'trend','metrics':['quantity_sold'],'group_by':['category'],'granularity':'week'}
        provider=ScriptedProvider([call('submit_analyst_decision',plan(q))])
        p=self.pipeline(provider);req=self.request();proposal=p.propose(req)
        rows=[{'period':'2026-07-06','category':'Danh mục '+str(i),'quantity_sold':i+1} for i in range(17)]
        p.executor=Mock(return_value=result(rows));req.session_id=proposal['session_id'];r=p.generate(req)
        self.assertEqual(r['status'],'success');self.assertEqual(r['completion_status'],'complete')
        self.assertEqual(len(r['result_sets']['many']['rows']),17)
        self.assertEqual(r['charts'][0]['selection'],'display_subset')
        self.assertEqual(r['charts'][0]['population_count'],17)
        self.assertEqual(r['charts'][0]['displayed_count'],16)
        self.assertEqual(provider.call_count,1);self.assertEqual(p.executor.call_count,1)
        self.assertIn('toàn bộ dữ liệu',r['charts'][0]['capacity_note'])

    def test_four_component_repair_clears_partial_preflight_and_preserves_all_views(self):
        views=[product(),{'id':'sales','lens_id':'product_sales'},{'id':'mix','lens_id':'category_mix'},{'id':'trend','lens_id':'product_trend'}]
        bad=deepcopy(views);bad[-1]['metrics']=['not_in_catalog']
        provider=ScriptedProvider([call('submit_analyst_decision',plan(*bad))],[call('submit_analyst_decision',plan(*views))])
        p=self.pipeline(provider);r=p.propose(self.request());d=r['diagnostics']
        self.assertEqual(len(r['proposal']['analytical_queries']),4)
        self.assertEqual(d['registered_requested_operations'],4)
        self.assertEqual(provider.call_count,2);p.executor.assert_not_called()
        self.assertLess(d['repair_context_chars'],d['total_context_chars'])

    def test_native_and_compat_transports_share_two_call_budget_after_reset(self):
        from services.agent_provider import NativeAgentProvider
        from services import llm_service
        for style in ('native','openai'):
            with self.subTest(style=style),patch.dict(os.environ,{'AI_OFFLINE':'0','GEMINI_API_STYLE':style}),patch.object(llm_service,'GEMINI_API_KEY','fixture-key'),patch.object(llm_service,'GEMINI_MODELS',['fixture-model']):
                values=[plan(product(granularity='fortnight')),plan(product())]
                if style=='native':
                    bodies=[{'candidates':[{'content':{'parts':[{'functionCall':{'name':'submit_analyst_decision','args':v},'thoughtSignature':'fixture-signature'}]}}],'usageMetadata':{'promptTokenCount':100,'candidatesTokenCount':20}} for v in values]
                else:
                    bodies=[{'choices':[{'message':{'tool_calls':[{'id':'fixture','type':'function','function':{'name':'submit_analyst_decision','arguments':json.dumps(v)}}]}}],'usage':{'prompt_tokens':100,'completion_tokens':20}} for v in values]
                responses=[Mock(ok=True,json=Mock(return_value=b)) for b in bodies]
                with patch('services.agent_provider.requests.post',side_effect=responses) as post:
                    p=self.pipeline(NativeAgentProvider());r=p.propose(self.request())
                    self.assertEqual(post.call_count,2);self.assertEqual(r['diagnostics']['provider_call_count'],2)
                    self.assertEqual(r['diagnostics']['input_tokens'],200)
                    self.assertEqual(r['diagnostics']['output_tokens'],40)
                    self.assertNotIn('fixture-signature',json.dumps(post.call_args.kwargs['json']))
                    p.executor.assert_not_called()

    def test_incompatible_domain_lens_is_repaired_inside_the_same_request(self):
        cases = [
            (product(lens_id='not_delivered'), 'lens_not_delivered'),
            (product(operation='relationship', metrics=['quantity_sold', 'product_revenue']), 'lens_operation_incompatible'),
            (product(metrics=['product_revenue']), 'lens_metric_incompatible'),
            (product(operation='aggregate', group_by=['product', 'category']), 'lens_grouping_incompatible'),
            (product(lens_id='category_mix', limit=5), 'lens_complete_population_required'),
        ]
        for invalid, code in cases:
            with self.subTest(code=code):
                provider=ScriptedProvider([call('submit_analyst_decision',plan(invalid))],[call('submit_analyst_decision',plan(product()))])
                p=self.pipeline(provider);r=p.propose(self.request())
                self.assertEqual(provider.call_count,2);p.executor.assert_not_called()
                issues=r['diagnostics']['repaired_contract_issues']
                self.assertIn(code,[e['code'] for e in issues])
                self.assertTrue(all(e['path'].startswith('requested_operations.0.') for e in issues))
                feedback=json.loads(provider.requests[1]['messages'][0]['content'])
                self.assertIn('blueprint_columns',feedback['domains'])
                self.assertIn('allowed_operations',feedback['domains']['blueprint_columns'])
                self.assertLessEqual(r['diagnostics']['repair_context_chars'],24000)

    def test_one_repair_receives_all_independent_lens_errors(self):
        bad=[product(metrics=['product_revenue']),{'id':'mix','lens_id':'category_mix','operation':'trend'}]
        good=[product(),{'id':'mix','lens_id':'category_mix'}]
        provider=ScriptedProvider([call('submit_analyst_decision',plan(*bad))],[call('submit_analyst_decision',plan(*good))])
        p=self.pipeline(provider);r=p.propose(self.request())
        self.assertEqual(provider.call_count,2);p.executor.assert_not_called()
        issues=r['diagnostics']['repaired_contract_issues']
        self.assertEqual({e['code'] for e in issues},{'lens_metric_incompatible','lens_operation_incompatible'})
        self.assertEqual({e['path'].split('.')[1] for e in issues},{'0','1'})
        self.assertEqual(len(r['proposal']['analytical_queries']),2)

    def test_second_incompatible_lens_stops_at_two_provider_calls(self):
        bad=[call('submit_analyst_decision',plan(product(metrics=['product_revenue'])))]
        provider=ScriptedProvider(bad,bad,bad);p=self.pipeline(provider)
        with self.assertRaises(AnalysisError):p.propose(self.request())
        self.assertEqual(provider.call_count,2);p.executor.assert_not_called()

    def test_business_overview_preserves_all_five_components_after_lens_repair(self):
        views=[{'id':'stores','lens_id':'store_performance','metrics':['store_revenue','store_aov','purchasing_customer_count']},product(),{'id':'voucher','lens_id':'voucher_usage'},{'id':'payment','lens_id':'payment_mix'},{'id':'trend','lens_id':'sales_trend'}]
        bad=deepcopy(views);bad[0]['operation']='distribution'
        provider=ScriptedProvider([call('submit_analyst_decision',plan(*bad,breadth='comprehensive'))],[call('submit_analyst_decision',plan(*views,breadth='comprehensive'))])
        p=self.pipeline(provider)
        req=AiTextToReportRequest(question='Đánh giá tình hình kinh doanh và chỉ ra các điểm cần chú ý.',time={'mode':'previous_quarter'},reference_date=date(2026,10,7))
        r=p.propose(req)
        self.assertEqual(provider.call_count,2);p.executor.assert_not_called()
        self.assertEqual(len(r['proposal']['analytical_queries']),5)
        self.assertLessEqual(r['diagnostics']['total_context_chars'],24000)
        self.assertLess(r['diagnostics']['repair_context_chars'],r['diagnostics']['total_context_chars'])
        self.assertEqual(r['diagnostics']['repaired_contract_issues'][0]['code'],'lens_operation_incompatible')

    def test_directory_lens_cannot_authorize_an_unrelated_omitted_metric(self):
        operation={'id':'stores','lens_id':'store_performance','metrics':['favorite_count']}
        provider=ScriptedProvider([call('submit_analyst_decision',plan(operation))])
        p=self.pipeline(provider)
        req=AiTextToReportRequest(question='Đánh giá tình hình kinh doanh và chỉ ra các điểm cần chú ý.',
                                time={'mode':'previous_quarter'},reference_date=date(2026,10,7))
        with patch.dict(os.environ,{'DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN':'1',
                                    'DATA_ANALYST_ENABLE_CONTRACT_REPAIR':'0'}):
            with self.assertRaises(AnalysisError) as caught:
                p.propose(req)
        self.assertEqual(caught.exception.category,'invalid_analysis_contract')
        self.assertEqual(provider.call_count,1)
        p.executor.assert_not_called()
