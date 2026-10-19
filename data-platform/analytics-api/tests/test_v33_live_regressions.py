"""Replay preserved live failures offline. Captures are normalized intents, not raw model responses."""
import json
from pathlib import Path
from tests import test_hybrid_v28 as f
from services import preflight_service
from services.request_anchors import request_anchors,complete_governed_roles
from services.analysis_intent import AnalysisIntentEnvelope

CAPTURES={r['id']:r for r in json.loads((Path(__file__).parent/'fixtures/live_v33_first_run_intents.json').read_text())}

class LiveRegressionTests(f.unittest.TestCase):
    setUp=f.HybridTests.setUp
    pipeline=f.HybridTests.pipeline
    request=f.HybridTests.request

    def test_cosmetic_long_requirement_id_does_not_consume_semantic_repair(self):
        req=f.requirement(id='req_aggregate_promotion_performance_september_2026',domain_id='promotions',
            metric_ids=['voucher_order_count','discount_amount'],dimension_ids=[],analysis_kind='aggregate',ranking=None,
            derived_features=[],time={'kind':'month','month':9,'year':2026})
        p=self.pipeline(f.scripted(f.envelope(req)))
        proposed=p.propose(self.request('Số đơn dùng voucher và tổng tiền giảm tháng 9 năm 2026',analysis_depth='focused'))
        self.assertEqual(proposed['outcome'],'SUCCESS');self.assertEqual(p.provider.call_count,1)

    def test_inconsistent_clarification_label_cannot_override_complete_locked_meaning(self):
        req=f.requirement(id='rating',metric_ids=['avg_store_rating'],dimension_ids=['store'],analysis_kind='aggregate',
            ranking=None,derived_features=[],time={'kind':'month','month':9,'year':2026})
        p=self.pipeline(f.scripted(f.envelope(req,decision='clarification')))
        proposed=p.propose(self.request('Điểm đánh giá trung bình theo chi nhánh tháng 9 năm 2026',analysis_depth='focused'))
        self.assertEqual(proposed['outcome'],'SUCCESS');self.assertEqual(p.provider.call_count,1)

    def test_supported_metric_false_unavailability_repairs_existing_requirement(self):
        req=f.requirement(id='revenue_forecast',metric_ids=['revenue'],dimension_ids=[],analysis_kind=None,ranking=None,
            derived_features=[],time={'kind':'relative','mode':'current_month'},availability='needs_input',reason='metric_unavailable')
        repaired={'id':req['id'],'availability':'requested','reason':None,'forecast':{'horizon':3,'unit':'month'}}
        p=self.pipeline(f.scripted(f.envelope(req,decision='clarification'),f.envelope(repaired)))
        proposed=p.propose(self.request('Dự báo doanh thu 3 tháng tới, mong accuracy ít nhất 95%',analysis_depth='focused'))
        self.assertEqual(proposed['outcome'],'SUCCESS');self.assertFalse(proposed['proposal']['partial_scope'])
        self.assertEqual(len([r for r in proposed['diagnostics']['semantic_intent']['requirements'] if not r.get('supporting_for')]),1)

    def test_scope_repair_may_spell_out_unchanged_feature_targets(self):
        from services.analytical_resolver import requirement_meaning
        before=f.requirement(metric_ids=['revenue'],derived_features=['leader'],feature_metrics={})
        after={**before,'feature_metrics':{'leader':['revenue']}}
        meaning=lambda req:requirement_meaning(AnalysisIntentEnvelope.model_validate(f.envelope(req)).requirements[0])
        self.assertEqual(meaning(before),meaning(after))
        after['feature_metrics']={'leader':['order_count']}
        self.assertNotEqual(meaning(before),meaning(after))

    def test_forecast_horizon_is_not_a_historical_time_error(self):
        c=CAPTURES['L12'];p=self.pipeline(f.scripted(c['intent']))
        proposed=p.propose(self.request(c['question'],analysis_depth='focused'))
        time=proposed['diagnostics']['semantic_intent']['requirements'][0]['time']
        self.assertEqual(time['mode'],'all_time')
        self.assertEqual(time['kind'],'relative')

    def test_buyers_cannot_be_interpreted_as_registered_customers(self):
        a=request_anchors('Số khách hàng mua hàng theo tháng trong 6 tháng gần nhất',self.catalog,{})
        self.assertEqual(a['metrics'][0]['candidate_ids'],['purchasing_customer_count'])
        c=CAPTURES['L13'];p=self.pipeline(f.scripted(c['intent'],f.envelope({'id':'req_1','metric_ids':['purchasing_customer_count']})))
        proposed=p.propose(self.request(c['question'],analysis_depth='focused'))
        self.assertEqual(proposed['diagnostics']['semantic_intent']['requirements'][0]['metric_ids'],['purchasing_customer_count'])
        self.assertEqual(p.provider.call_count,2)

    def test_provider_false_metric_clarification_gets_one_targeted_repair(self):
        clarified={'decision':'clarification','requirements':[],'clarification':{'reason':'metric_ambiguous','missing_fields':['metric_ids']}}
        corrected=f.requirement(id='revenue',domain_id='orders',metric_ids=['revenue'],dimension_ids=['payment_method'],
            analysis_kind='aggregate',ranking=None,derived_features=[],time=None)
        p=self.pipeline(f.scripted(clarified,f.envelope(corrected)))
        proposed=p.propose(self.request('Doanh thu theo phương thức thanh toán tháng 9 năm 2026',analysis_depth='focused'))
        self.assertEqual(proposed['status'],'proposal_ready');self.assertEqual(p.provider.call_count,2)

    def test_unasked_promotional_ranking_does_not_block_the_requested_scalars(self):
        c=CAPTURES['L14'];p=self.pipeline(f.scripted(c['intent']))
        proposed=p.propose(self.request(c['question'],analysis_depth='focused'))
        self.assertEqual(proposed['outcome'],'SUCCESS')
        requested=[c for c in p.semantic_info['resolved_requirement_coverage'] if not c.get('supporting_for')]
        self.assertTrue(requested);self.assertTrue(all(c['state']=='RESOLVED' for c in requested))

    def test_known_underspecified_requests_clarify_without_interpreter(self):
        for q in ('Cho tôi xem tình hình tháng 9','Khách hàng như thế nào','So sánh hai chi nhánh'):
            pf=preflight_service.run(q,reference=f.REFERENCE,catalog=self.catalog,coverage={})
            self.assertEqual(pf['capability']['decision'],'CLARIFY',q)
            p=self.pipeline()
            with self.assertRaises(f.AnalysisError):p.propose(self.request(q))
            self.assertEqual(p.provider.call_count,0);p.executor.assert_not_called()

    def test_why_change_binds_governed_decomposition_instead_of_invented_topn(self):
        c=CAPTURES['L20'];a=request_anchors(c['question'],self.catalog,{})
        intent,changes=complete_governed_roles(AnalysisIntentEnvelope.model_validate(c['intent']),a,self.catalog)
        drivers=[r for r in intent.requirements if 'driver_delta' in r.derived_features]
        self.assertEqual(len(drivers),1)
        self.assertEqual(drivers[0].analysis_kind,'aggregate');self.assertEqual(drivers[0].dimension_ids,['store'])
        self.assertTrue(changes)

    def test_per_region_ranking_is_grouping_and_not_unknown_scope(self):
        pf=preflight_service.run('Top 5 chi nhánh theo doanh thu trong mỗi miền tháng 9 năm 2026',reference=f.REFERENCE,catalog=self.catalog,coverage={})
        self.assertEqual(pf['capability']['decision'],'READY')

    def test_comparison_scope_repair_preserves_scalar_meaning(self):
        q='So sánh doanh thu miền Bắc với miền Nam tháng 9 năm 2026'
        a=request_anchors(q,self.catalog,{})
        cohorts=a['scope_resolution']['bindings'][0]['cohorts']
        req=f.requirement(id='req_1',metric_ids=['revenue'],dimension_ids=[],analysis_kind='aggregate',
            ranking=None,derived_features=['scalar'],feature_metrics={},filters=[],time={'kind':'month','month':9,'year':2026})
        fixed=[{**req,'id':f'req_{i+1}','filters':[{'dimension':'city','operator':'in','value':c['members']}],
                'feature_metrics':{'scalar':['revenue']}} for i,c in enumerate(cohorts)]
        from evals.fixture_warehouse import FixtureWarehouse
        warehouse=FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        p=self.pipeline(f.scripted(f.envelope(req),f.envelope(*fixed)),executor=warehouse)
        request=self.request(q,analysis_depth='focused',analysis_mission='compare')
        try:proposed=p.propose(request)
        except f.AnalysisError:self.fail(str(p.semantic_info.get('contract_issues')))
        self.assertEqual(proposed['outcome'],'SUCCESS');self.assertEqual(p.provider.call_count,2)
        actual=[r['filters'][0]['value'] for r in proposed['diagnostics']['semantic_intent']['requirements'] if not r.get('supporting_for')]
        self.assertEqual({frozenset(c) for c in actual},{frozenset(c['members']) for c in cohorts})
        f.approve(request,proposed);report=p.generate(request)
        answer=report['conclusion']['answer']
        self.assertIn('400',answer);self.assertIn('300',answer)
        self.assertEqual(report['verification']['status'],'verified')

    def test_top_five_each_region_cannot_become_a_global_top_five(self):
        from services.request_anchors import verify_anchors
        q='Top 5 chi nhánh theo doanh thu trong mỗi miền tháng 9 năm 2026'
        anchors=request_anchors(q,self.catalog,{})
        req=f.requirement(metric_ids=['revenue'],dimension_ids=['store','reporting_region'],derived_features=[],
            ranking={'limit':5,'metric_id':'revenue','per_group':[]},time={'kind':'month','month':9,'year':2026})
        bad=verify_anchors(anchors,AnalysisIntentEnvelope.model_validate(f.envelope(req)).requirements,f.REFERENCE,self.catalog)
        self.assertTrue(any(i['code']=='explicit_ranking_partition_missing' for i in bad))
        req['ranking']['per_group']=['reporting_region']
        self.assertEqual(verify_anchors(anchors,AnalysisIntentEnvelope.model_validate(f.envelope(req)).requirements,f.REFERENCE,self.catalog),[])

    def test_comparison_repair_can_correct_the_cohort_axis_but_not_time(self):
        q='So sánh doanh thu miền Bắc với miền Nam tháng 9 năm 2026'
        a=request_anchors(q,self.catalog,{})
        union=a['scope_resolution']['filters']
        req=f.requirement(id='req_1',metric_ids=['revenue'],dimension_ids=['city'],analysis_kind='comparison',ranking=None,
            derived_features=['group_gap'],filters=[],time={'kind':'month','month':9,'year':2026})
        patch={'id':'req_1','dimension_ids':['reporting_region'],'filters':union}
        p=self.pipeline(f.scripted(f.envelope(req),f.envelope(patch)))
        proposed=p.propose(self.request(q,analysis_depth='focused'))
        self.assertEqual(proposed['outcome'],'SUCCESS');self.assertEqual(p.provider.call_count,1)
        self.assertTrue(any(i['rule']=='governed_derived_cohort_axis' for i in proposed['diagnostics']['semantic_normalizations']))
        # Preserve the paid-repair boundary assertions independently of the new
        # deterministic completion; no validator is mocked or weakened.
        from services.scope_resolution_service import scope_issues,scope_repair_patches
        previous=AnalysisIntentEnvelope.model_validate(f.envelope(req))
        issues=scope_issues(a['scope_resolution'],previous.requirements,self.catalog)
        self.assertEqual(scope_repair_patches(a['scope_resolution'],previous,issues),[patch])
        planner=p.agent(self.catalog,f.REFERENCE,proposal=True)
        repaired=planner.parse_repair(f.envelope(patch),previous)
        self.assertEqual(planner.merge_repair(previous,repaired,issues).requirements[0].dimension_ids,['reporting_region'])
        protected={**patch,'time':{'kind':'relative','mode':'all_time'}}
        with self.assertRaises(f.AnalysisError) as caught:
            planner.merge_repair(previous,planner.parse_repair(f.envelope(protected),previous),issues)
        self.assertTrue(any(i['code']=='untargeted_field_changed' for i in caught.exception.issues))

    def test_union_scope_repair_has_exact_typed_patch_for_every_sibling(self):
        from evals.fixture_warehouse import FixtureWarehouse
        q='Doanh thu miền Nam và Hà Nội tháng 9 năm 2026'
        union=request_anchors(q,self.catalog,{})['scope_resolution']['bindings'][0]['members']
        south=[v for v in union if v!='Hà Nội']
        reqs=[f.requirement(id=id,metric_ids=['revenue'],dimension_ids=['city'],analysis_kind='aggregate',ranking=None,
            derived_features=['scalar'],time={'kind':'month','year':2026,'month':9},
            filters=[{'dimension':'city','operator':'in','value':values}]) for id,values in [('south',south),('hanoi',['Hà Nội'])]]
        corrected=[{'id':r['id'],'filters':[{'dimension':'city','operator':'in','value':union}],
                    'derived_features':[],'feature_metrics':{}} for r in reqs]
        warehouse=FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        p=self.pipeline(f.scripted(f.envelope(*reqs),f.envelope(*corrected)),executor=warehouse)
        request=self.request(q,analysis_depth='focused');proposed=p.propose(request)
        wire=json.loads(p.provider.requests[1]['messages'][0]['content'])
        self.assertEqual({p['id'] for p in wire['required_scope_patches']},{'south','hanoi'})
        for patch in wire['required_scope_patches']:self.assertEqual(patch['filters'],corrected[0]['filters'])
        items=p.provider.requests[1]['tools'][0]['parameters']['properties']['requirements']['items']
        self.assertTrue(all('filters' in branch['required'] for branch in items['anyOf']))
        f.approve(request,proposed);report=p.generate(request)
        self.assertIn('700',report['conclusion']['answer'])

    def test_top_five_each_region_executes_partitioned_sql_not_global_limit(self):
        from copy import deepcopy
        from unittest.mock import patch
        from evals import fixture_warehouse as fw
        data=deepcopy(fw.DATA)
        data['chi_nhanh']=[dict(ma_chi_nhanh=f's{i}',ten_chi_nhanh=f'CN {i}',
            thanh_pho='Hà Nội' if i<6 else 'Hồ Chí Minh',loai_diem_ban='STORE') for i in range(12)]
        data['don_hang']=[{**deepcopy(fw.ORDERS[0]),'ma_don_hang':f'o{i}','co_so_ma':f's{i}',
            'tong_tien':(i+1)*100} for i in range(12)]
        with patch.object(fw,'DATA',data):warehouse=fw.FixtureWarehouse(self.catalog.overlay)
        self.addCleanup(warehouse.close)
        req=f.requirement(metric_ids=['revenue'],dimension_ids=['store','reporting_region'],analysis_kind='ranking',
            ranking={'limit':5,'metric_id':'revenue','per_group':['reporting_region']},derived_features=[],
            time={'kind':'month','year':2026,'month':9})
        p=self.pipeline(f.scripted(f.envelope(req)),executor=warehouse)
        request=self.request('Top 5 chi nhánh theo doanh thu trong mỗi miền tháng 9 năm 2026',analysis_depth='focused')
        proposed=p.propose(request);f.approve(request,proposed);report=p.generate(request)
        queries=[q['id'] for q in report['analytical_queries'] if q.get('ranking')]
        self.assertTrue(queries)
        rows=report['result_sets'][queries[0]]['rows']
        self.assertEqual(len(rows),10)
        for region,total in [('Miền Bắc',2000),('Miền Nam',5000)]:
            subset=[r for r in rows if r['reporting_region']==region]
            self.assertEqual(len(subset),5);self.assertEqual(sum(r['revenue'] for r in subset),total)

    def test_region_grouping_preserves_unknown_and_null_city_revenue(self):
        from copy import deepcopy
        from unittest.mock import patch
        from evals import fixture_warehouse as fw
        data=deepcopy(fw.DATA)
        for i,(city,value) in enumerate([('Ngoài danh mục',150),(None,250)],start=2):
            data['chi_nhanh'].append(dict(ma_chi_nhanh=f's{i+1}',ten_chi_nhanh=f'CN {i}',thanh_pho=city,loai_diem_ban='STORE'))
            data['don_hang'].append({**deepcopy(fw.ORDERS[0]),'ma_don_hang':f'new{i}','co_so_ma':f's{i+1}','tong_tien':value})
        with patch.object(fw,'DATA',data):warehouse=fw.FixtureWarehouse(self.catalog.overlay)
        self.addCleanup(warehouse.close)
        req=f.requirement(metric_ids=['revenue'],dimension_ids=['reporting_region'],analysis_kind='aggregate',ranking=None,
            derived_features=[],time={'kind':'month','year':2026,'month':9})
        p=self.pipeline(f.scripted(f.envelope(req)),executor=warehouse)
        request=self.request('Doanh thu theo miền tháng 9 năm 2026',analysis_depth='focused')
        proposed=p.propose(request);f.approve(request,proposed);report=p.generate(request)
        values={r['reporting_region']:r['revenue'] for a in report['result_sets'].values() for r in a['rows'] if 'reporting_region' in r}
        self.assertEqual(values,{'Miền Bắc':400,'Miền Nam':300,'Chưa phân loại':400})
        self.assertEqual(sum(values.values()),1100)

    def test_live_job_harness_measures_actual_job_and_keeps_denominator(self):
        import tempfile
        from pathlib import Path
        from unittest.mock import patch
        from evals import live_acceptance_v33 as live
        from evals.fixture_warehouse import FixtureWarehouse
        def execute(sql,**kwargs):
            warehouse=FixtureWarehouse(self.catalog.overlay)
            try:return warehouse(sql,**kwargs)
            finally:warehouse.close()
        def factory(**kwargs):
            req=f.requirement(metric_ids=['revenue'],dimension_ids=['store'],analysis_kind='aggregate',ranking=None,
                derived_features=[],time={'kind':'month','month':9,'year':2026})
            p=self.pipeline(f.scripted(f.envelope(req)),executor=execute);p.owner_id=kwargs['owner_id'];return p
        with tempfile.TemporaryDirectory() as d:
            cases=Path(d)/'cases.json';out=Path(d)/'out.json'
            cases.write_text(json.dumps({'semantic':[{'id':'fixture','q':'Doanh thu theo chi nhánh tháng 9 năm 2026',
                'group':'fixture','expect':'useful','metric_groups':[['revenue']]}]}))
            with patch.dict('os.environ',{'AI_OFFLINE':'0'}),patch.object(live,'CASES',cases),patch('services.agent_pipeline.AnalysisPipeline',side_effect=factory):
                result=live.run(3,True,out,pace_seconds=0,job_mode=True)
        self.assertEqual(result['entry_point'],'analysis_jobs');self.assertTrue(result['durable_counters_match'])
        self.assertEqual(result['physical_http_total'],0)
        case=result['cases'][0];self.assertEqual(case['terminal_state'],'completed',case['outcome']);self.assertTrue(case['passed'])
        self.assertGreater(case['job_latency_ms'],0);self.assertFalse(result['release_passed']) # minimum20 still applies

