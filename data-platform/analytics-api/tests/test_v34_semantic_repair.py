"""L03 recorded production false block, replayed without provider/warehouse I/O."""
from copy import deepcopy
import json
from pathlib import Path

from tests import test_hybrid_v28 as f
from services.analysis_intent import AnalysisIntentEnvelope
from services.scope_resolution_service import scope_issues
from services.request_anchors import request_anchors

CAPTURE = json.loads((Path(__file__).parent / 'fixtures/v34_l03_intents.json').read_text())


class CohortRepairTests(f.unittest.TestCase):
    setUp = f.HybridTests.setUp
    pipeline = f.HybridTests.pipeline
    request = f.HybridTests.request

    def test_recorded_l03_repair_reaches_verified_report_with_exact_cohorts(self):
        warehouse = f.FixtureWarehouse(self.catalog.overlay)
        self.addCleanup(warehouse.close)
        provider = f.scripted(*deepcopy(CAPTURE['outputs']))
        pipeline = self.pipeline(provider, executor=warehouse)
        request = self.request(CAPTURE['question'], analysis_depth='focused')
        try:
            proposal = pipeline.propose(request)
        except f.AnalysisError:
            self.fail(json.dumps({k: pipeline.semantic_info.get(k) for k in
                ('root_contract_issues', 'contract_issues', 'semantic_normalizations')}, ensure_ascii=False))
        self.assertEqual(provider.call_count, 2)
        req = proposal['diagnostics']['semantic_intent']['requirements'][0]
        self.assertEqual(req['dimension_ids'], ['city'])
        self.assertEqual(req['metric_ids'], ['revenue'])
        self.assertEqual(set(req['filters'][0]['value']), {'Hồ Chí Minh', 'Hà Nội'})
        f.approve(request, proposal)
        report = pipeline.generate(request)
        self.assertEqual(report['verification']['status'], 'verified')
        self.assertEqual(report['completion_status'], 'complete')
        self.assertIn('300', report['conclusion']['answer'])
        self.assertIn('400', report['conclusion']['answer'])
        self.assertEqual(provider.call_count, 2)

    def test_cohort_axis_authority_does_not_allow_metric_time_or_scope_drift(self):
        for change in ({'metric_ids': ['order_count']},
                       {'time': {'kind': 'month', 'month': 8, 'year': 2026}},
                       {'dimension_ids': ['city', 'payment_method']},
                       {'feature_metrics': {'change': ['revenue']}},
                       {'feature_metrics': {'group_gap': ['order_count']}},
                       {'filters': [{'dimension': 'city', 'operator': 'in', 'value': ['Hồ Chí Minh', 'Cần Thơ']}]}):
            with self.subTest(change=change):
                first, repaired = deepcopy(CAPTURE['outputs'])
                repaired['requirements'][0].update(change)
                pipeline = self.pipeline(f.scripted(first, repaired))
                with self.assertRaises(f.AnalysisError):
                    pipeline.propose(self.request(CAPTURE['question'], analysis_depth='focused'))
                self.assertEqual(pipeline.provider.call_count, 2)
                pipeline.executor.assert_not_called()

    def test_scalar_split_cohort_is_not_forced_to_a_grouped_representation(self):
        anchors = request_anchors(CAPTURE['question'], self.catalog, {})
        req = f.requirement(metric_ids=['revenue'], dimension_ids=[], analysis_kind='aggregate', ranking=None,
                            derived_features=['scalar'], filters=[], time={'kind': 'month', 'month': 9, 'year': 2026})
        requirements = AnalysisIntentEnvelope.model_validate(f.envelope(req)).requirements
        issues = scope_issues(anchors['scope_resolution'], requirements, self.catalog)
        self.assertFalse(any(i['field'] == 'dimension_ids' for i in issues))

    def test_missing_evidence_caveat_does_not_request_cost_but_an_explicit_calculation_still_blocks(self):
        from services.preflight_service import run
        caveat=run('So sánh doanh thu theo chi nhánh. Nếu thiếu dữ liệu chi phí thì không kết luận ROI.',catalog=self.catalog)
        self.assertFalse(any(x['code']=='unsupported_concept' for x in caveat['findings']))
        for question in ('Không tính lợi nhuận; hãy tính giá vốn.',
                         'Nếu thiếu chi phí thì ước tính lợi nhuận.',
                         'Không chỉ ROI mà cả doanh thu.'):
            with self.subTest(question=question):
                result=run(question,catalog=self.catalog)
                self.assertTrue(any(x['code']=='unsupported_concept' for x in result['findings']))

    def test_inspect_navigation_identity_and_typed_filters_are_verified_not_ignored(self):
        from services.analysis_quality_service import verify_saved_report
        warehouse=f.FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        pipeline=self.pipeline(f.scripted(*deepcopy(CAPTURE['outputs'])),executor=warehouse)
        request=self.request(CAPTURE['question'],analysis_depth='focused')
        f.approve(request,pipeline.propose(request));report=pipeline.generate(request)
        self.assertGreaterEqual(report['quality_assessment']['score'],90)
        for field,value in [('query_id','wrong-query'),('filters',{'city':'wrong-city'})]:
            bad=deepcopy(report)
            row=next(row for chart in bad['charts'] for row in chart.get('data',[]) if row.get('entity_ref'))
            row['entity_ref'][field]=value
            quality=verify_saved_report(bad,self.catalog)
            check=next(c for c in quality['verification_checks'] if c['id']=='visualization_appropriateness')
            self.assertLess(check['passed'],check['total'])
            self.assertIn(check['status'],{'partial','failed'})
            self.assertLess(quality['score'],90)
            self.assertNotEqual(quality['status'],'verified')


    def test_save_rehydrates_server_summary_chart_data_without_client_rows_or_new_execution(self):
        from copy import deepcopy
        from types import SimpleNamespace
        from unittest.mock import patch
        from routers import reports
        from services.session_service import get_session
        from services.analysis_response_service import session_report_summary
        warehouse=f.FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        pipeline=self.pipeline(f.scripted(*deepcopy(CAPTURE['outputs'])),executor=warehouse)
        request=self.request(CAPTURE['question'],analysis_depth='focused')
        report=pipeline.generate(f.approve(request,pipeline.propose(request)))
        session=get_session(report['session_id'])
        self.assertTrue(all('data' not in chart for chart in session.report_response['charts']))
        before=deepcopy(session.report_response)
        with patch('routers.reports._principal',return_value=SimpleNamespace(bound_owner='owner-a')), \
             patch('services.analysis_pipeline.AnalysisPipeline.catalog',return_value=self.catalog), \
             patch('services.access_policy.current_principal',return_value=SimpleNamespace()):
            saved=reports._authoritative_report({'session_id':report['session_id'],'charts':[{'data':[{'value':999999999}]}]})
        self.assertTrue(all(chart.get('data') for chart in saved['charts']))
        self.assertEqual(saved['charts'],report['charts'])
        self.assertEqual(saved['conclusion'],report['conclusion'])
        self.assertTrue(all('rows' in value for value in saved['result_sets'].values()))
        self.assertEqual(session.report_response,before)
        self.assertEqual(pipeline.provider.call_count,2)
        self.assertNotIn('999999999',str(saved['charts']))


    def test_recorded_l29_bad_scope_repair_is_rejected_without_unlocking_ranking_or_executing(self):
        capture=json.loads((Path(__file__).parent/'fixtures/v34_l29_live_rejection.json').read_text())
        pipeline=self.pipeline()
        planner=pipeline.agent(self.catalog,f.REFERENCE,proposal=True)
        previous=AnalysisIntentEnvelope.model_validate(capture['outputs'][0])
        from services.scope_resolution_service import scope_issues,resolve_scope
        issues=scope_issues(resolve_scope(capture['question'],self.catalog),previous.requirements,self.catalog)
        returned=planner.parse_repair(capture['outputs'][1],previous)
        with self.assertRaises(f.AnalysisError) as caught:planner.merge_repair(previous,returned,issues)
        self.assertTrue(any(issue['code']=='untargeted_field_changed' for issue in caught.exception.issues))
        pipeline.executor.assert_not_called();self.assertEqual(pipeline.provider.call_count,0)


    def test_captured_live_cohort_bottom_and_voucher_failures_compile_without_safety_relaxation(self):
        source=json.loads((Path(__file__).parent/'fixtures/v34_live44_failed_intents.json').read_text())
        for id,calls in [('L29',1),('L32',2),('L44',1)]:
            capture=next(c for c in source['cases'] if c['id']==id)
            outputs=deepcopy(capture['outputs'])
            for output in outputs:
                if not output.get('clarification'):output.pop('clarification',None)
            with self.subTest(id=id):
                pipeline=self.pipeline(f.scripted(*outputs))
                request=self.request(capture['question']).model_copy(update={'reference_date':f.date(2026,10,18)})
                proposal=pipeline.propose(request)
                self.assertEqual(proposal['status'],'proposal_ready')
                self.assertEqual(pipeline.provider.call_count,calls)
                queries=proposal['proposal']['analytical_queries']
                if id=='L29':
                    requested=[q for q in queries if q['role']=='requested']
                    self.assertEqual(requested[0]['group_by'],['reporting_region'])
                    self.assertEqual(set(requested[0]['filters'][0]['value']),{'Hà Nội','Hải Phòng','Bắc Ninh','Quảng Ninh','Hồ Chí Minh','Cần Thơ','Bình Dương','Đồng Nai','Bà Rịa - Vũng Tàu','Kiên Giang'})
                if id=='L32':self.assertEqual(next(q for q in queries if q['role']=='requested')['ranking']['direction'],'ASC')
                if id=='L44':
                    self.assertEqual(set(m for q in queries if q['role']=='requested' for m in q['metrics']),{'discount_amount','voucher_order_count'})
                    self.assertTrue(all(not q['group_by'] for q in queries if q['role']=='requested'))
                pipeline.executor.assert_not_called()

    def test_derived_cohort_completion_refuses_unrelated_axes_overlap_or_explicit_filters(self):
        from services.scope_resolution_service import complete_derived_cohort_axis,resolve_scope
        source=json.loads((Path(__file__).parent/'fixtures/v34_live44_failed_intents.json').read_text())
        capture=next(c for c in source['cases'] if c['id']=='L29')
        raw=deepcopy(capture['outputs'][0]);raw.pop('clarification',None)
        intent=AnalysisIntentEnvelope.model_validate(raw)
        resolution=resolve_scope(capture['question'],self.catalog)
        for mutation in ({'dimension_ids':['city','order_type']},{'ranking':{'limit':5,'metric_id':'revenue'}},
                         {'filters':[{'dimension':'city','value':'Đà Nẵng'}]}, {'derived_features':['scalar']}):
            changed=intent.model_copy(deep=True)
            changed.requirements[0]=type(intent.requirements[0]).model_validate({**intent.requirements[0].model_dump(mode='json'),**mutation})
            before=changed.model_dump(mode='json');same,patches=complete_derived_cohort_axis(changed,resolution,self.catalog)
            self.assertEqual(same.model_dump(mode='json'),before);self.assertEqual(patches,[])


    def test_ranking_value_direction_is_local_and_not_metric_desirability(self):
        for question,expected in [
            ('Top 3 thành phố theo doanh thu thấp nhất tháng 9 năm 2026',['bottom']),
            ('Top 4 chi nhánh có tỷ lệ hủy đơn cao nhất tháng 9 năm 2026',['top']),
            ('Top 3 thành phố doanh thu thấp nhất và Top 5 chi nhánh số đơn cao nhất tháng 9 năm 2026',['bottom','top']),
            ('Bottom 2 chi nhánh theo doanh thu tháng 9 năm 2026',['bottom'])]:
            self.assertEqual([r['direction'] for r in request_anchors(question,self.catalog,{})['rankings']],expected)

    def test_locked_complete_request_does_not_require_an_unspecified_clarification(self):
        capture=json.loads((Path(__file__).parent/'fixtures/v34_live44_rerun2_failed_intents.json').read_text())['cases'][0]
        output=deepcopy(capture['outputs'][0]);output.pop('clarification',None)
        pipeline=self.pipeline(f.scripted(output))
        try:
            proposal=pipeline.propose(self.request(capture['question']).model_copy(update={'reference_date':f.date(2026,10,18)}))
        except f.AnalysisError:
            self.fail(json.dumps({k:pipeline.semantic_info.get(k) for k in ['root_contract_issues','semantic_normalizations']},ensure_ascii=False))
        self.assertEqual(proposal['status'],'proposal_ready')
        queries=[q for q in proposal['proposal']['analytical_queries'] if q['role']=='requested']
        self.assertTrue(any(q['metrics']==['avg_store_rating'] and q['group_by']==['store'] for q in queries))
        self.assertTrue(all(q['time']['start']=='2026-09-01' and q['time']['end']=='2026-09-30' for q in queries))
        self.assertEqual(pipeline.provider.call_count,1);pipeline.executor.assert_not_called()

    def test_unexplained_status_completion_cannot_fill_missing_or_conflicting_meaning(self):
        capture=json.loads((Path(__file__).parent/'fixtures/v34_live44_rerun2_failed_intents.json').read_text())['cases'][0]
        for fields in ({'reason':'ambiguous_criterion'}, {'time':None},
                       {'time':{'kind':'month','month':8,'year':2026}},
                       {'metric_ids':['avg_product_rating']}, {'dimension_ids':['store','city']},
                       {'filters':[{'dimension':'city','value':'Hà Nội'}]},
                       {'availability':'insufficient_data','reason':'historical_data_unavailable'}):
            with self.subTest(fields=fields):
                output=deepcopy(capture['outputs'][0]);output.pop('clarification',None)
                output['requirements'][0].update(fields)
                pipeline=self.pipeline(f.scripted(output,deepcopy(output)))
                with self.assertRaises(f.AnalysisError):pipeline.propose(self.request(capture['question']))
                self.assertLessEqual(pipeline.provider.call_count,2);pipeline.executor.assert_not_called()

    def test_bound_aggregate_completion_uses_generic_metric_axis_and_period_contracts(self):
        capture=json.loads((Path(__file__).parent/'fixtures/v34_live44_rerun2_failed_intents.json').read_text())['cases'][0]
        for question,metric,axis,month in [
            ('Điểm phục vụ theo chi nhánh tháng 8 năm 2025','avg_store_rating','store',8),
            ('Doanh thu theo thành phố tháng 7 năm 2025','revenue','city',7)]:
            with self.subTest(question=question):
                output=deepcopy(capture['outputs'][0]);output.pop('clarification',None)
                output['requirements'][0].update(metric_ids=[metric],dimension_ids=[axis],time={'kind':'month','year':2025,'month':month})
                pipeline=self.pipeline(f.scripted(output))
                proposal=pipeline.propose(self.request(question))
                self.assertEqual(proposal['status'],'proposal_ready')
                queries=[q for q in proposal['proposal']['analytical_queries'] if q['role']=='requested']
                self.assertTrue(any(q['metrics']==[metric] and q['group_by']==[axis] for q in queries))
                self.assertTrue(all(q['time']['start']==f'2025-{month:02d}-01' for q in queries))
                self.assertEqual(pipeline.provider.call_count,1);pipeline.executor.assert_not_called()
