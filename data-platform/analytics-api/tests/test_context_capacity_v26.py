"""Multi-domain context fits without hiding requested knowledge or calling AI live."""
import json
import os
import unittest
from copy import deepcopy
from datetime import date
from unittest.mock import Mock, patch
from common import AiTextToReportRequest
from services.analysis_catalog import AnalysisCatalog, AnalysisError
from services.analysis_pipeline import AnalysisPipeline, safe_failure
from services.domain_intelligence_service import DomainIntelligence
from services.one_shot_context import wire_payload
from tests.agent_fixtures import ScriptedProvider, call
from tests.analysis_fixtures import physical_metadata

QUESTION='So sánh doanh thu đơn hàng giữa thành phố hồ chí minh và thành phố hà nội(cả cửa hàng chính và hệ thống kiosk)'
CONTEXT='tập trung vào 2 thành phố Hồ Chí Minh và Hà Nội'
EXPECTATION='Đa góc nhìn, tập trung phân tích về dòng sản phẩm, đơn hàng, khách hàng, voucher và liên hệ về cả shipper'

class ContextCapacityTests(unittest.TestCase):
    def setUp(self):
        config=patch.dict(os.environ,{'AI_OFFLINE':'1','DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN':'1','DATA_ANALYST_ENABLE_CONTRACT_REPAIR':'0'})
        config.start();self.addCleanup(config.stop)
        os.environ.pop('DATA_ANALYST_ONE_SHOT_CONTEXT_MAX_CHARS',None)
        for name in ('requests.sessions.Session.request','psycopg2.connect'):
            guard=patch(name,side_effect=AssertionError('External calls forbidden'));guard.start();self.addCleanup(guard.stop)
        self.catalog=AnalysisCatalog(physical_metadata())
        self.intelligence=DomainIntelligence(self.catalog)

    def request(self,expectation=EXPECTATION):
        return AiTextToReportRequest(question=QUESTION,analysis_context=CONTEXT,analysis_expectation=expectation,time={'mode':'previous_month'},reference_date=date(2026,10,7))

    def decision(self):
        return {'decision_type':'plan','analysis_breadth':'comprehensive','requested_operations':[{'id':'revenue','lens_id':'sales_overview','metrics':['revenue'],'group_by':['city'],'filters':[{'dimension':'city','operator':'in','value':['Hồ Chí Minh','Hà Nội']}]}]}

    def pipeline(self,provider):
        return AnalysisPipeline(metadata_loader=physical_metadata,provider=provider,executor=Mock(),value_lookup=Mock(return_value=[]))

    def test_reported_six_domain_request_fits_normal_target_and_preserves_definitions(self):
        provider=ScriptedProvider([call('submit_analyst_decision',self.decision())]);p=self.pipeline(provider)
        r=p.propose(self.request());d=r['diagnostics'];payload=json.loads(provider.requests[0]['messages'][0]['content'])
        self.assertEqual(provider.call_count,1);p.executor.assert_not_called()
        self.assertLessEqual(max(d['provider_body_chars'].values()),24000)
        self.assertFalse(d['context_budget_expanded']);self.assertTrue(d['blueprint_context_shared'])
        self.assertEqual({c['id'] for c in d['strong_domain_candidates']},{'customers','orders','products','stores','delivery','promotions'})
        self.assertTrue({c['id'] for c in d['strong_domain_candidates']} <= {pack['id'] for pack in payload['domains']['packs']})
        self.assertEqual(payload['analysis_context'],CONTEXT);self.assertEqual(payload['analysis_expectation'],EXPECTATION)
        self.assertEqual(r['proposal']['analytical_queries'][0]['time']['start'],'2026-09-01')
        self.assertEqual(r['proposal']['analytical_queries'][0]['filters'][0]['value'],['Hồ Chí Minh','Hà Nội'])
        self.assert_shared_blueprints_lossless(payload)

    def assert_shared_blueprints_lossless(self,payload):
        domains=payload['domains'];sets=domains['blueprint_sets']
        refs={(kind,row[0]) for kind in ('subject','metric','dimension') for row in payload['manifest'][kind+'s']}
        for pack in domains['packs']:
            expected=self.intelligence.blueprints(self.intelligence.available()[pack['id']],refs)
            decoded={id:[deepcopy(sets[c]) if type(c) is int else c for c in row] for id,row in pack['blueprints'].items()}
            self.assertEqual(decoded,expected)
            self.assertTrue(self.intelligence.covered(self.intelligence.available()[pack['id']],refs))

    def test_eight_and_sixteen_domain_requests_expand_only_after_compaction(self):
        expectations=[EXPECTATION+'; thanh toán, đánh giá sản phẩm','; '.join(p['business_label'] for p in self.intelligence.available().values())]
        for expected_count,text in zip((8,16),expectations):
            with self.subTest(domains=expected_count):
                provider=ScriptedProvider([call('submit_analyst_decision',self.decision())]);p=self.pipeline(provider)
                r=p.propose(self.request(text));d=r['diagnostics'];payload=json.loads(provider.requests[0]['messages'][0]['content'])
                self.assertEqual(len(d['strong_domain_candidates']),expected_count)
                self.assertTrue(d['context_budget_expanded'])
                self.assertLessEqual(max(d['provider_body_chars'].values()),d['context_char_budget'])
                self.assertLessEqual(d['context_char_budget'],48000)
                self.assertLess(d['context_char_budget'],d['context_hard_char_budget'])
                self.assertEqual(provider.call_count,1);p.executor.assert_not_called()
                self.assertTrue({c['id'] for c in d['strong_domain_candidates']} <= {pack['id'] for pack in payload['domains']['packs']})
                self.assert_shared_blueprints_lossless(payload)

    def test_explicit_hard_limit_is_respected_without_calling_provider(self):
        provider=ScriptedProvider([call('submit_analyst_decision',self.decision())]);p=self.pipeline(provider)
        text='; '.join(p['business_label'] for p in self.intelligence.available().values())
        with patch.dict(os.environ,{'DATA_ANALYST_ONE_SHOT_CONTEXT_MAX_CHARS':'24000'}):
            with self.assertRaises(AnalysisError) as caught:p.propose(self.request(text))
        self.assertEqual(caught.exception.category,'one_shot_context_budget_exceeded')
        self.assertEqual(provider.call_count,0);p.executor.assert_not_called()
        failure=safe_failure(caught.exception)
        self.assertEqual(failure['issue']['category'],'PLANNING_CAPACITY')
        self.assertNotIn('chia nhỏ',failure['issue']['title'])
        self.assertTrue(any(a['type']=='retry' for a in failure['issue']['suggested_actions']))
        real_scope=safe_failure(AnalysisError('requested_scope_too_large','fixture'))
        self.assertEqual(real_scope['issue']['category'],'REQUESTED_SCOPE_TOO_LARGE')

    def test_shared_blueprint_tables_survive_one_bounded_repair(self):
        invalid=self.decision();invalid['requested_operations'][0]['metrics']=['order_count']
        provider=ScriptedProvider([call('submit_analyst_decision',invalid)],[call('submit_analyst_decision',self.decision())]);p=self.pipeline(provider)
        with patch.dict(os.environ,{'DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN':'2','DATA_ANALYST_ENABLE_CONTRACT_REPAIR':'1'}):
            r=p.propose(self.request())
        self.assertEqual(provider.call_count,2);p.executor.assert_not_called()
        second=json.loads(provider.requests[1]['messages'][0]['content'])
        self.assert_shared_blueprints_lossless(second)
        self.assertLessEqual(r['diagnostics']['repair_context_chars'],r['diagnostics']['context_char_budget'])

    def test_wire_sharing_does_not_mutate_catalog_or_original_knowledge(self):
        blueprint=['aggregate',['revenue'],['city'],[['city']],None,'',['aggregate','trend'],['day','week'],[]]
        payload={'domains':{'packs':[{'id':'orders','tier':'compact','lenses':[['sales','Revenue',['revenue'],'tc']],'blueprints':{'sales':blueprint,'other':deepcopy(blueprint)}}],'share_blueprints':True}}
        original=deepcopy(payload);wire=wire_payload(payload)
        self.assertEqual(payload,original)
        sets=wire['domains']['blueprint_sets']
        self.assertEqual([sets[c] if type(c) is int else c for c in wire['domains']['packs'][0]['blueprints']['sales']],blueprint)
        self.assertNotIn('share_blueprints',wire['domains'])

    def test_native_and_compat_transports_accept_measured_expanded_context(self):
        from services.agent_provider import NativeAgentProvider
        from services import llm_service
        from services.semantic_manifest_service import compact
        text='; '.join(p['business_label'] for p in self.intelligence.available().values())
        for style in ('native','openai'):
            with self.subTest(style=style),patch.dict(os.environ,{'AI_OFFLINE':'0','GEMINI_API_STYLE':style}),patch.object(llm_service,'GEMINI_API_KEY','fixture-key'),patch.object(llm_service,'GEMINI_MODELS',['fixture-model']):
                decision=self.decision()
                response=({'candidates':[{'content':{'parts':[{'functionCall':{'name':'submit_analyst_decision','args':decision}}]}}]}
                          if style=='native' else {'choices':[{'message':{'tool_calls':[{'id':'fixture','type':'function','function':{'name':'submit_analyst_decision','arguments':json.dumps(decision)}}]}}]})
                with patch('services.agent_provider.requests.post',return_value=Mock(ok=True,json=Mock(return_value=response))) as post:
                    p=self.pipeline(NativeAgentProvider());r=p.propose(self.request(text));d=r['diagnostics']
                    self.assertEqual(post.call_count,1);self.assertEqual(d['provider_call_count'],1)
                    self.assertTrue(d['context_budget_expanded'])
                    self.assertLessEqual(len(compact(post.call_args.kwargs['json'])),d['context_char_budget'])
                    p.executor.assert_not_called()
