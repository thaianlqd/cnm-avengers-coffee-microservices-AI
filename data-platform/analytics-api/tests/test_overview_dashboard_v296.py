"""Recorded successful meaning, slow transport and bounded optional views."""
import json
from copy import deepcopy
from pathlib import Path
from unittest.mock import Mock, patch
from services.agent_provider import NativeAgentProvider
from services import llm_service
from services.analysis_catalog import AnalysisError
from services.analysis_quality_service import verify_saved_report
from services.analysis_intent import AnalysisIntentEnvelope
from services.analytical_resolver import AnalyticalResolver
from evals.fixture_warehouse import FixtureWarehouse
from tests import test_hybrid_v28 as f
from tests.test_final_review_v29 import OVERVIEW_45D


def recorded():
    return json.loads(Path(__file__).with_name('fixtures').joinpath('overview_runtime_v296.json').read_text())


def expanded():
    data = recorded()
    for id, metrics, dims, kind in (
        ('ticket_mix', ['revenue','aov'], ['order_type'], 'relationship'),
        ('order_status_mix', ['order_count'], ['order_status'], 'distribution'),
        ('hour_volume', ['order_count'], ['hour'], 'aggregate')):
        r = deepcopy(data['requirements'][0])
        r.update(id=id, supporting_for='summary_aggregate', metric_ids=metrics, dimension_ids=dims,
                 analysis_kind=kind, derived_features=[], feature_metrics={})
        data['requirements'].append(r)
    return data


class OverviewDashboardTests(f.unittest.TestCase):
    setUp=f.HybridTests.setUp
    pipeline=f.HybridTests.pipeline
    request=f.HybridTests.request

    def test_slow_primary_finishes_without_a_manual_retry(self):
        clock=[100.0]
        def post(*args, **kwargs):
            self.assertGreaterEqual(kwargs['timeout'].read_timeout, 12)
            clock[0] += 12
            return Mock(ok=True,json=Mock(return_value={'candidates':[{'content':{'parts':[{'text':json.dumps(recorded())}]}}]}))
        with patch.dict(f.os.environ,{'AI_OFFLINE':'0','GEMINI_API_STYLE':'native','DATA_ANALYST_INTENT_TRANSPORT':'json'}), \
             patch.object(llm_service,'GEMINI_API_KEY','fixture'),patch.object(llm_service,'GEMINI_MODELS',['fixture']), \
             patch('services.provider_budget.time.monotonic',side_effect=lambda:clock[0]), \
             patch('services.agent_provider.requests.post',side_effect=post) as http:
            p=self.pipeline(NativeAgentProvider());proposal=p.propose(self.request(OVERVIEW_45D))
            self.assertEqual(proposal['outcome'],'SUCCESS');self.assertEqual(http.call_count,1)
            self.assertEqual(proposal['diagnostics']['provider_call_count'],1);p.executor.assert_not_called()

    def test_timeout_then_response_share_one_deadline(self):
        import requests
        clock=[100.0];seen=[]
        def post(*args, **kwargs):
            seen.append(kwargs['timeout'])
            if len(seen)==1:
                clock[0]+=16
                raise requests.exceptions.ReadTimeout('fixture')
            self.assertLessEqual(kwargs['timeout'].total,8)
            clock[0]+=5
            return Mock(ok=True,json=Mock(return_value={'candidates':[{'content':{'parts':[{'text':json.dumps(recorded())}]}}]}))
        with patch.dict(f.os.environ,{'AI_OFFLINE':'0','GEMINI_API_STYLE':'native','DATA_ANALYST_INTENT_TRANSPORT':'json'}), \
             patch.object(llm_service,'GEMINI_API_KEY','fixture'),patch.object(llm_service,'GEMINI_MODELS',['fixture']), \
             patch('services.provider_budget.time.monotonic',side_effect=lambda:clock[0]), \
             patch('services.hybrid_analyst_planner.time.sleep'),patch('services.agent_provider.requests.post',side_effect=post):
            p=self.pipeline(NativeAgentProvider());proposal=p.propose(self.request(OVERVIEW_45D))
            self.assertEqual(proposal['outcome'],'SUCCESS');self.assertEqual(len(seen),2)
            self.assertLess(clock[0]-100,24)

    def test_optional_views_are_approved_and_independently_verified(self):
        warehouse=FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        p=self.pipeline(f.scripted(expanded()),executor=Mock(wraps=warehouse))
        request=self.request(OVERVIEW_45D)
        proposal=p.propose(request);p.executor.assert_not_called()
        self.assertEqual(proposal['diagnostics']['supporting_operation_count'],3)
        self.assertEqual(proposal['diagnostics']['requested_operation_count'],5)
        f.approve(request,proposal);report=p.generate(request)
        self.assertEqual(report['outcome'],'SUCCESS');self.assertEqual(p.provider.call_count,1)
        self.assertEqual(len(report['analytical_queries']),8)
        self.assertGreaterEqual(len(report['charts']),6)
        self.assertGreaterEqual(len({c['chart_type'] for c in report['charts']}),4)
        self.assertEqual(verify_saved_report(report,self.catalog),report['quality_assessment'])
        self.assertEqual(report['quality_assessment']['score'],90)

    def test_bad_optional_scope_cannot_block_or_change_requested_work(self):
        baseline=AnalyticalResolver(self.catalog,f.REFERENCE).resolve(AnalysisIntentEnvelope.model_validate(recorded()))
        for change in ({'time':{'kind':'rolling','amount':90,'unit':'day'}},
                       {'filters':[{'dimension':'order_status','operator':'eq','value':'DA_HUY'}]},
                       {'supporting_for':'unknown'}, {'metric_ids':['not_available']}):
            data=expanded();data['requirements']=data['requirements'][:4]
            data['requirements'][-1].update(change)
            p=self.pipeline(f.scripted(data));proposal=p.propose(self.request(OVERVIEW_45D))
            self.assertEqual(proposal['outcome'],'SUCCESS');self.assertEqual(p.provider.call_count,1)
            resolved=p.calls
            self.assertEqual(proposal['diagnostics']['supporting_operation_count'],0)
            self.assertEqual(proposal['diagnostics']['requested_operation_count'],5)
            p.executor.assert_not_called()

    def test_support_cannot_satisfy_a_missing_explicit_metric(self):
        data=expanded()
        data['requirements'][0]['metric_ids']=['revenue','order_count']
        p=self.pipeline(f.scripted(data,data,data))
        with self.assertRaises(AnalysisError):p.propose(self.request(OVERVIEW_45D))
        p.executor.assert_not_called();self.assertEqual(p.provider.call_count,3)
