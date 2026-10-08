"""All visible feature conflicts recover together; request time never resets."""
import asyncio
import json
import os
from unittest.mock import Mock, patch
from services.analysis_intent import AnalysisIntentEnvelope
from services.analytical_resolver import AnalyticalResolver, ResolutionIssues
from services.analysis_catalog import AnalysisError
from services.analysis_pipeline import safe_failure
from services.analysis_quality_service import verify_saved_report
from services.provider_budget import ProviderBudget, request_deadline
from evals.fixture_warehouse import FixtureWarehouse
from tests import test_hybrid_v28 as f
from tests.test_capacity_v29 import req
from tests.test_final_review_v29 import OVERVIEW_45D


def combined_draft():
    return f.envelope(req('combined',['revenue','order_count','aov'],['order_type'],days=45,
        kind='trend',granularity='week',features=['scalar','contribution_share','change_pct'],
        feature_metrics={'scalar':[], 'contribution_share':['not_in_requirement'], 'change_pct':['revenue']}))


def corrected_draft():
    return {'decision':'analyze','requirements':[
        {'id':'combined','derived_features':['change_pct'],'feature_metrics':{'change_pct':['revenue']}},
        req('repair_add_1',['revenue'],['order_type'],days=45,features=['contribution_share'],
            feature_metrics={'contribution_share':['revenue']}),
        req('repair_add_2',['revenue','order_count','aov'],days=45,features=['scalar'])]}


class FirstSubmissionTests(f.unittest.TestCase):
    setUp=f.HybridTests.setUp
    pipeline=f.HybridTests.pipeline
    request=f.HybridTests.request

    def test_binding_and_all_shape_errors_are_reported_together(self):
        with self.assertRaises(ResolutionIssues) as caught:
            AnalyticalResolver(self.catalog,f.REFERENCE).resolve(AnalysisIntentEnvelope.model_validate(combined_draft()))
        issues=caught.exception.issues
        self.assertEqual({i['feature'] for i in issues if i['code']=='invalid_feature_metric_targets'},
                         {'scalar','contribution_share'})
        shapes=[i for i in issues if i['code']=='feature_shape_conflict']
        self.assertEqual({i['feature'] for i in shapes},{'scalar','contribution_share'})
        self.assertTrue(all(i['protected_features']==['change_pct'] for i in shapes))

    def test_combined_observed_shape_finishes_in_one_submission_two_calls(self):
        warehouse=FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        with patch.dict(os.environ,{'DATA_ANALYST_ARTIFACT_STORE':'memory'}):
            raw=combined_draft();raw['requirements'][0]['derived_features'].remove('change_pct')
            raw['requirements'][0]['feature_metrics'].pop('change_pct')
            fixed=corrected_draft();fixed['requirements'][0].update(derived_features=[],feature_metrics={})
            p=self.pipeline(f.scripted(raw,fixed),executor=Mock(wraps=warehouse))
            request=self.request(OVERVIEW_45D)
            proposal=p.propose(request)
            self.assertEqual(p.provider.call_count,2);p.executor.assert_not_called()
            payload=json.loads(p.provider.requests[1]['messages'][0]['content'])
            self.assertEqual({i['feature'] for i in payload['validation_issues'] if i['code']=='feature_shape_conflict'},
                             {'scalar','contribution_share'})
            self.assertEqual(payload['feature_target_options'][0]['additive_metric_ids'],['revenue','order_count'])
            f.approve(request,proposal);report=p.generate(request)
            self.assertEqual(report['outcome'],'SUCCESS');self.assertEqual(p.provider.call_count,2)
            self.assertEqual(report['quality_assessment']['score'],90)
            self.assertEqual(verify_saved_report(report,self.catalog),report['quality_assessment'])
            self.assertTrue(all(c['state']=='RESOLVED' for c in report['resolved_requirement_coverage']))
            trend=next(r for r in report['semantic_intent']['requirements'] if r['id']=='combined')
            self.assertEqual(trend['dimension_ids'],['order_type']);self.assertEqual(trend['granularity'],'week')
            self.assertEqual(trend['time']['amount'],45)

    def test_valid_sibling_feature_and_scope_still_cannot_be_rewritten(self):
        for attack in ({'derived_features':[],'feature_metrics':{}},
                       {'dimension_ids':[]}, {'time':{'kind':'relative','mode':'all_time'}}):
            fix=corrected_draft();fix['requirements'][0].update(attack)
            p=self.pipeline(f.scripted(combined_draft(),fix,fix))
            with self.assertRaises(AnalysisError):p.propose(self.request(OVERVIEW_45D))
            self.assertEqual(p.provider.call_count,3);p.executor.assert_not_called()

    def test_deadline_slices_shrink_and_never_reset_on_recovery(self):
        clock=[100.0]
        with patch('services.provider_budget.time.monotonic',side_effect=lambda:clock[0]):
            budget=ProviderBudget({},max_calls=3);budget.start_deadline()
            budget.consume();self.assertEqual(budget.http_timeout().total,18)
            clock[0]+=8;budget.consume();self.assertEqual(budget.http_timeout().total,8)
            clock[0]+=14;budget.consume();self.assertEqual(budget.http_timeout().total,2)
            clock[0]+=2
            with self.assertRaises(AnalysisError) as caught:budget.http_timeout()
            self.assertEqual(caught.exception.category,'planning_timeout')
            self.assertEqual(budget.used,3)
            clock[0]+=3
            with self.assertRaises(AnalysisError):budget.remaining()

    def test_slow_native_response_cannot_create_proposal_or_start_more_calls(self):
        from services.agent_provider import NativeAgentProvider
        from services import llm_service
        clock=[100.0]
        def slow_post(*args,**kwargs):
            clock[0]+=28
            body={'candidates':[{'content':{'parts':[{'text':json.dumps(f.envelope())}]}}]}
            return Mock(ok=True,json=Mock(return_value=body))
        with patch.dict(os.environ,{'AI_OFFLINE':'0','GEMINI_API_STYLE':'native','DATA_ANALYST_INTENT_TRANSPORT':'json'}),\
             patch.object(llm_service,'GEMINI_API_KEY','fixture'),patch.object(llm_service,'GEMINI_MODELS',['fixture']),\
             patch('services.provider_budget.time.monotonic',side_effect=lambda:clock[0]),\
             patch('services.agent_provider.requests.post',side_effect=slow_post) as http,\
             patch('services.agent_pipeline.create_session') as create:
            p=self.pipeline(NativeAgentProvider())
            with self.assertRaises(AnalysisError) as caught:p.propose(self.request())
            self.assertEqual(caught.exception.category,'planning_timeout')
            self.assertEqual(http.call_count,1);create.assert_not_called();p.executor.assert_not_called()
            failure=safe_failure(caught.exception,p.calls,p.semantic_info)
            self.assertEqual(failure['outcome'],'SYSTEM_ERROR')
            self.assertFalse(failure['failure']['needs_user_input'])
            self.assertIn('30 giây',failure['message']);self.assertIsNone(failure['quality_assessment']['score'])

    def test_http_deadline_returns_controlled_failure_and_resets_context(self):
        from routers.ai import bounded_propose_plan
        async def expire(awaitable,timeout):
            self.assertEqual(timeout,29)
            self.assertIsNotNone(request_deadline.get())
            awaitable.close()
            raise asyncio.TimeoutError
        with patch('routers.ai.asyncio.wait_for',side_effect=expire):
            result=asyncio.run(bounded_propose_plan(self.request()))
        self.assertEqual(result['outcome'],'SYSTEM_ERROR')
        self.assertEqual(result['diagnostics']['error_category'],'planning_timeout')
        self.assertIsNone(request_deadline.get())

    def test_expired_request_cannot_start_pipeline_metadata_or_create_session(self):
        token=request_deadline.set(0.1)
        try:
            p=self.pipeline()
            with patch.object(p,'catalog') as catalog,patch('services.agent_pipeline.create_session') as create:
                with self.assertRaises(AnalysisError) as caught:p.propose(self.request())
            self.assertEqual(caught.exception.category,'planning_timeout')
            catalog.assert_not_called();create.assert_not_called()
        finally:request_deadline.reset(token)
