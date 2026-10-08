"""Final review and observed semantic failures. All provider/DB work is scripted."""
import json
import os
import unittest
from copy import deepcopy
from unittest.mock import Mock, patch
from services.analysis_catalog import AnalysisError
from services.analytical_capacity_planner import AnalyticalCapacityContract, period_count
from services.result_artifact_store import ResultArtifactStore, serialized
from services.analysis_intent import AnalysisIntentEnvelope
from services.analytical_resolver import AnalyticalResolver, ResolutionIssues
from services.request_anchors import metric_equivalents
from services import readiness_service
from evals.run_eval_v29 import rates
from tests import test_hybrid_v28 as f
from tests.test_capacity_v29 import req
from tests.analysis_fixtures import physical_metadata


class FinalReviewTests(unittest.TestCase):
    setUp = f.HybridTests.setUp
    pipeline = f.HybridTests.pipeline
    request = f.HybridTests.request

    def test_runtime_capacity_layers_agree_20k_50k_100k(self):
        from services.analysis_contract import max_analytical_rows
        for cap in (20000,50000,100000):
            with self.subTest(cap=cap), patch.dict(os.environ,{'DATA_ANALYST_CAPACITY_EXECUTION_ROWS':str(cap)}):
                p=self.pipeline();agent=p.agent(self.catalog,f.REFERENCE,proposal=True)
                resolved=AnalyticalResolver(self.catalog,f.REFERENCE).resolve(AnalysisIntentEnvelope.model_validate(
                    f.envelope(req('groups',['product_revenue'],['product']))))
                agent.queries.enforce_discovery=False
                a=agent.queries.prepare(resolved['operations'][0])
                self.assertEqual(max_analytical_rows(),cap)
                self.assertEqual(agent.queries.capacity_planner.contract.execution_rows,cap)
                self.assertEqual(a.plan.row_limit,cap)
                self.assertIn('LIMIT '+str(cap+1),a.sql)

    def test_calendar_quarters_and_other_cadences(self):
        for start,end,n in [('2026-01-01','2026-03-31',1),('2026-12-31','2026-12-31',1),
                ('2026-03-31','2026-04-01',2),('2026-01-01','2026-12-31',4),
                ('2025-10-01','2026-03-31',2),('2025-01-01','2026-12-31',8),
                ('2026-10-01','2026-12-31',1)]:
            self.assertEqual(period_count(dict(start=start,end=end),'quarter'),n)
        for cadence,expected in [('day',90),('week',14),('month',3),('year',1)]:
            self.assertEqual(period_count(dict(start='2026-01-01',end='2026-03-31'),cadence),expected)
        for cadence in ('day','week','month','quarter','year'):
            with self.assertRaises(ValueError):period_count(dict(start='2026-12-31',end='2026-01-01'),cadence)

    def readiness(self, session='redis',artifact='redis',production=True,redis=True,warehouse=True,catalog=True):
        with patch.dict(os.environ,{'DATA_ANALYST_ENV':'production' if production else 'development',
                'DATA_ANALYST_SESSION_STORE':session,'DATA_ANALYST_ARTIFACT_STORE':artifact}),\
             patch.object(readiness_service,'redis_probe',return_value=redis) as ping,\
             patch.object(readiness_service,'warehouse_probe',return_value=warehouse),\
             patch.object(readiness_service,'catalog_probe',return_value=catalog):
            from server import readiness_check
            response=readiness_check()
            return response.status_code,json.loads(response.body),ping.call_count

    def test_readiness_redis_up(self):
        code,r,_=self.readiness();self.assertEqual(code,200);self.assertEqual(r['status'],'ready')
        self.assertTrue(r['redis_available']);self.assertTrue(r['warehouse_available'])

    def test_readiness_required_redis_down(self):
        code,r,_=self.readiness(redis=False);self.assertEqual(code,503)
        self.assertEqual(r['status'],'not_ready');self.assertFalse(r['redis_available'])

    def test_readiness_memory_development_without_redis(self):
        code,r,pings=self.readiness('memory','memory',False)
        self.assertEqual(code,200);self.assertEqual(pings,0);self.assertIsNone(r['redis_available'])
        self.assertIsNone(r['warehouse_available'])

    def test_readiness_invalid_backends_and_required_dependencies(self):
        for args in (dict(session='invalid'),dict(artifact='invalid'),dict(session='memory'),
                     dict(warehouse=False),dict(catalog=False)):
            with self.subTest(args=args):self.assertEqual(self.readiness(**args)[0],503)

    def test_liveness_does_not_ping_dependencies(self):
        from server import health_check
        with patch.object(readiness_service,'redis_probe',side_effect=AssertionError('No Redis for liveness')),\
             patch.object(readiness_service,'warehouse_probe',side_effect=AssertionError('No DB for liveness')):
            self.assertEqual(health_check()['status'],'ok')

    def test_cache_pages_mutation_expiry_and_integrity(self):
        with patch.dict(os.environ,{'DATA_ANALYST_ARTIFACT_STORE':'memory'}):
            for n in (3,20000):
                store=ResultArtifactStore();ref=store.put(dict(columns=['product_id','amount'],
                    rows=[dict(product_id=str(i),amount=i) for i in range(n)]),
                    query_fingerprint='q',plan_fingerprint='p',schema_fingerprint='s',provenance={'dimensions':['product_id']})
                for offset in (0,n//2,max(0,n-2)):
                    page=store.page(ref,offset,2)
                    self.assertEqual([r['amount'] for r in page['rows']],list(range(offset,min(n,offset+2))))
                    self.assertEqual(page['artifact_bytes'],ref['byte_size'])
                self.assertEqual(store.decode_count,1)
                returned=store.get(ref);returned['rows'][0]['amount']=-1
                self.assertEqual(store.page(ref,0,1)['rows'][0]['amount'],0)
                self.assertEqual(store.page(ref,filters={'product_id':'1'})['total_rows'],1)
                for offset in (-1,):
                    with self.assertRaises(AnalysisError):store.page(ref,offset,1)
                with self.assertRaises(AnalysisError):store.page(ref,filters={'amount':1})
                with self.assertRaises(AnalysisError):store.page({**ref,'content_hash':'bad'})
                expiry,body=store._items[ref['artifact_id']];blob=json.loads(body)
                blob['result']['rows'][0]['amount']=-1
                store._items[ref['artifact_id']]=(expiry,serialized(blob))
                with self.assertRaises(AnalysisError):store.page(ref)
                store._items[ref['artifact_id']]=(expiry,body)
                with patch('services.result_artifact_store.time.time',return_value=expiry+1):
                    with self.assertRaises(AnalysisError):store.page(ref)

    def test_recovery_cohorts_primary_second_third_and_failure(self):
        def measure(events):
            cases=[{'expected':'proposal_ready'} for _ in events]
            rows=[dict(provider_calls=calls,passed=ok,status='proposal_ready' if ok else 'error') for calls,ok in events]
            return rates(cases,rows)
        r=measure([(1,True),(1,True)])
        self.assertEqual(r['primary_call_success_rate']['rate'],1)
        for key in ('second_attempt_recovery_rate','third_attempt_recovery_rate'):
            self.assertEqual(r[key],dict(status='not_exercised',numerator=0,denominator=0,rate=None))
        r=measure([(1,True),(2,True),(3,True),(3,False)])
        self.assertEqual(r['first_click_success_rate']['rate'],.75)
        self.assertEqual(r['second_attempt_recovery_rate']['denominator'],3)
        self.assertEqual(r['third_attempt_recovery_rate']['denominator'],2)
        self.assertEqual(r['third_attempt_recovery_rate']['rate'],.5)
        self.assertEqual(measure([(2,True)])['third_attempt_recovery_rate']['status'],'not_exercised')
        self.assertEqual(measure([(3,False)])['third_attempt_recovery_rate']['rate'],0)

    def test_store_alias_definition_repaired_in_one_user_request(self):
        raw=f.envelope(req('compare',['store_revenue','store_order_count','store_aov'],['store'],
            kind='cross_tab',features=['contribution_share'],feature_metrics={'contribution_share':['store_revenue']}))
        patch_meaning={'decision':'analyze','requirements':[{'id':'compare','metric_ids':['store_revenue','store_order_count','aov']}]}
        p=self.pipeline(f.scripted(raw,patch_meaning));r=p.propose(self.request('So sánh doanh thu, số đơn và giá trị đơn trung bình theo chi nhánh trong 90 ngày gần nhất.'))
        self.assertEqual(r['outcome'],'SUCCESS');self.assertEqual(p.provider.call_count,2)
        self.assertNotIn('store_aov',metric_equivalents(self.catalog)['aov'])
        payload=json.loads(p.provider.requests[1]['messages'][0]['content'])
        self.assertEqual(payload['validation_issues'][0]['requirement_id'],'compare')
        self.assertEqual(payload['validation_issues'][0]['field'],'metric_ids')
        self.assertEqual(r['diagnostics']['contract_issues'],[])

    def test_voucher_feature_shape_repaired_without_false_unsupported(self):
        raw=f.envelope(req('voucher',['voucher_revenue','voucher_order_count','discount_amount','aov'],['promotion'],
            kind='cross_tab',features=['contribution_share','leader'],
            feature_metrics={'contribution_share':['voucher_revenue'],'leader':['voucher_revenue']}))
        fixed={'decision':'analyze','requirements':[
            {'id':'voucher','derived_features':['contribution_share'],'feature_metrics':{'contribution_share':['voucher_revenue']}},
            req('revenue_leader',['voucher_revenue'],['promotion'],kind='ranking',features=['leader'],ranking={'limit':1,'metric_id':'voucher_revenue'})]}
        p=self.pipeline(f.scripted(raw,fixed));r=p.propose(self.request('So sánh doanh thu, số đơn, tiền giảm giá và giá trị đơn trung bình theo voucher trong 90 ngày gần nhất. Tính tỷ trọng và chỉ ra voucher dẫn đầu theo doanh thu; không kết luận ROI.'))
        self.assertEqual(r['outcome'],'SUCCESS');self.assertEqual(p.provider.call_count,2)
        self.assertTrue(all(c['state']=='RESOLVED' for c in r['diagnostics']['resolved_requirement_coverage']))

    def test_metric_repair_cannot_remove_accepted_metrics(self):
        raw=f.envelope(req('compare',['store_revenue','store_aov'],['store']))
        bad={'decision':'analyze','requirements':[{'id':'compare','metric_ids':['aov']}]}
        p=self.pipeline(f.scripted(raw,bad,bad))
        with self.assertRaises(AnalysisError):p.propose(self.request('Doanh thu và giá trị đơn trung bình theo chi nhánh trong 90 ngày gần nhất'))
        self.assertEqual(p.provider.call_count,3);p.executor.assert_not_called()
