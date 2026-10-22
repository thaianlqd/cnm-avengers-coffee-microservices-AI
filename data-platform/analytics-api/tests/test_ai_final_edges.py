"""Independent FINAL holdout failure oracles; existing production owners only."""
from copy import deepcopy
from threading import Event
from unittest.mock import Mock, patch
from tests import test_hybrid_v28 as f
from tests.test_ai_final_depth_contract import DepthReportMixin
from evals.rich_fixture import rich_world
from evals import fixture_warehouse as w
from evals.fixture_warehouse import FixtureWarehouse
from services.analysis_catalog import AnalysisError
from services.analysis_pipeline import safe_failure
from services.analysis_quality_service import verify_saved_report


class FinalEdgeTests(DepthReportMixin, f.unittest.TestCase):
    def test_metric_owned_fixed_axis_preserves_answer_in_table_without_fake_chart(self):
        data=rich_world()
        req=f.requirement(domain_id='customers',metric_ids=['total_spent'],dimension_ids=['customer_role'],
            analysis_kind='aggregate',ranking=None,derived_features=[],filters=[],time=None)
        expected=sum(row['tong_chi_tieu'] for row in data['nguoi_dung'] if row['vai_tro']=='CUSTOMER')
        for depth in ('focused','deep','comprehensive'):
            _,_,r=self.report(req,'Tổng chi tiêu của khách hàng theo vai trò',data,analysis_depth=depth)
            self.assertEqual(r['charts'],[])
            q=next(q for q in r['analytical_queries'] if q['role']=='requested')
            self.assertEqual(r['result_sets'][q['id']]['rows'][0]['total_spent'],expected)
            self.assertTrue(all(v['status']=='satisfied' for v in r['view_coverage'] if v['required']))
            self.assertEqual(r['analysis_coverage']['gap_kind'],'LIMITED_BY_SOURCE_CAPABILITY')
            self.assertEqual(r['quality_assessment']['status'],'verified')

    def req(self, metric='revenue', dims=()):
        return f.requirement(domain_id='orders', metric_ids=[metric], dimension_ids=list(dims),
            analysis_kind='aggregate', ranking=None, derived_features=[] if dims else ['scalar'],
            filters=[], time={'kind':'range','start':'2026-09-01','end':'2026-09-30'})

    def test_all_null_measure_never_becomes_zero(self):
        data=rich_world()
        for row in data['don_hang']: row['tong_tien']=None
        for depth in ('focused','deep','comprehensive'):
            with self.subTest(depth=depth):
                with self.assertRaises(AnalysisError) as caught:
                    self.report(self.req(), 'Doanh thu tháng 9 năm 2026', data, analysis_depth=depth)
                self.assertEqual(caught.exception.category, 'insufficient_data')
                self.assertEqual(safe_failure(caught.exception)['error_type'], 'INSUFFICIENT_DATA')

    def test_missing_source_fails_before_connection_with_source_category(self):
        from services.query_execution_batch import report_snapshot
        snapshot={'data_health':{'views':{'silver.don_hang':{'status':'blocked','reasons':['missing_source']}}}}
        with patch('services.data_coverage_service.peek',return_value=snapshot), patch('services.query_execution_batch.connection') as connection:
            with self.assertRaises(AnalysisError) as caught:
                with report_snapshot(['silver.don_hang']): self.fail('Missing source entered execution')
            self.assertEqual(safe_failure(caught.exception)['error_type'], 'SOURCE_UNAVAILABLE')
            connection.assert_not_called()

    def test_stale_incomplete_source_cannot_claim_report_complete(self):
        snapshot={'facts':{'silver.don_hang':dict(label='Orders',stale=True,completeness='partial',max_date='2026-09-15')}}
        for depth in ('focused','deep','comprehensive'):
            with self.subTest(depth=depth), patch('services.data_coverage_service.peek',return_value=snapshot):
                _,_,r=self.report(self.req(),'Doanh thu tháng 9 năm 2026',rich_world(),analysis_depth=depth)
                self.assertEqual(r['completion_status'],'partial')
                self.assertEqual(r['source_completeness']['status'],'limited')
                self.assertTrue(any(x['id']=='source_coverage:silver.don_hang' for x in r['quality_limitations']))
                self.assertEqual(verify_saved_report(r,self.catalog),r['quality_assessment'])

    def test_certified_source_without_new_events_stays_complete(self):
        snapshot={'facts':{'silver.don_hang':dict(label='Orders',stale=True,completeness='complete',health_status='healthy',max_date='2026-09-15')}}
        with patch('services.data_coverage_service.peek',return_value=snapshot):
            _,_,r=self.report(self.req(),'Doanh thu tháng 9 năm 2026',rich_world())
        self.assertEqual(r['source_completeness']['status'],'complete')  # event recency is not load completeness (G5)
        note=next(x for x in r['quality_limitations'] if x['id']=='source_coverage:silver.don_hang')
        self.assertIn('2026-09-15',note['label']);self.assertNotIn('chưa được chứng minh',note['label'])
        self.assertEqual(verify_saved_report(r,self.catalog),r['quality_assessment'])

    def test_clockless_source_uses_its_certified_view_health(self):
        for health, expected in (({'status':'healthy','completeness':'complete'},'complete'),
                                 ({'status':'healthy','completeness':'reconciled'},'reconciled'),
                                 ({'status':'degraded','completeness':'complete'},'limited')):
            snapshot={'facts':{},'data_health':{'views':{'silver.don_hang':health}}}
            with self.subTest(expected=expected), patch('services.data_coverage_service.peek',return_value=snapshot):
                _,_,r=self.report(self.req(),'Doanh thu tháng 9 năm 2026',rich_world())
                self.assertEqual(r['source_completeness']['status'],expected)

    def test_governed_join_avoids_fact_multiplication_and_rejects_fanout_axis(self):
        data=rich_world()
        # Add another line to one fact: an unsafe fact→line join doubles money.
        line=deepcopy(data['chi_tiet_don_hang'][0]);line['id']='holdout-extra-line'
        data['chi_tiet_don_hang'].append(line)
        valid=[o for o in data['don_hang'] if o['trang_thai_don_hang'] in {'HOAN_THANH','DANG_GIAO'}
               and '2026-09-01' <= o['ngay_tao'][:10] <= '2026-09-30']
        expected=sum(o['tong_tien'] for o in valid)
        naive=sum(o['tong_tien'] for o in valid for item in data['chi_tiet_don_hang'] if item['ma_don_hang']==o['ma_don_hang'])
        self.assertNotEqual(expected,naive)
        for depth in ('focused','deep','comprehensive'):
            _,_,r=self.report(self.req(),'Doanh thu tháng 9 năm 2026',data,analysis_depth=depth)
            q=next(q for q in r['analytical_queries'] if q['role']=='requested')
            self.assertEqual(r['result_sets'][q['id']]['rows'][0]['revenue'],expected)
        from services.analysis_contract import AnalysisSpec
        from services.analysis_query import build_plans
        with self.assertRaises(AnalysisError):
            build_plans(self.catalog.ground(AnalysisSpec(analysis_kind='aggregate',subject='orders',metrics=['revenue'],dimensions=['product'])),self.catalog)

    def test_timeout_and_query_budget_have_no_hidden_retry(self):
        from services.analytical_capacity_planner import QueryBudget, AnalyticalCapacityContract
        budget=QueryBudget(AnalyticalCapacityContract.from_env())
        for _ in range(budget.limit):budget.reserve('execute')
        with self.assertRaises(AnalysisError) as caught:budget.reserve('execute')
        self.assertEqual(caught.exception.category,'capacity_requires_choice')
        self.assertEqual(len(budget.records),budget.limit)
        for depth in ('focused','deep','comprehensive'):
            executor=Mock(side_effect=AnalysisError('query_timeout','fixture deadline'))
            with patch.dict(w.DATA,rich_world()):
                p=self.pipeline(f.scripted(f.envelope(self.req())),executor=executor)
                req=self.request('Doanh thu tháng 9 năm 2026',analysis_depth=depth)
                f.approve(req,p.propose(req))
                with self.assertRaises(AnalysisError) as error:p.generate(req)
                self.assertEqual(safe_failure(error.exception)['error_type'],'QUERY_TIMEOUT')
                self.assertLessEqual(executor.call_count,8)

    def test_saved_chart_lens_evidence_and_denominator_tamper_rejected(self):
        _,_,r=self.report(self.req('order_cancellation_rate'),'Tỷ lệ hủy đơn tháng 9 năm 2026',rich_world(),analysis_depth='deep')
        self.assertEqual(verify_saved_report(r,self.catalog),r['quality_assessment'])
        variants=[]
        chart=deepcopy(r);chart['charts'][0]['data'][0]['value']=999;variants.append(chart)
        lens=deepcopy(r);lens['charts'][0]['analysis_lens_id']='unbound-lens';variants.append(lens)
        evidence=deepcopy(r);evidence['evidence'][0]['values']={};variants.append(evidence)
        denominator=deepcopy(r);denominator['semantic_intent']['requirements'][0]['metric_ids']=['order_count'];variants.append(denominator)
        for forged in variants:self.assertNotEqual(verify_saved_report(forged,self.catalog)['status'],'verified')

    def test_cancelled_revision_cannot_publish(self):
        from tests.test_workspace_revision import WorkspaceRevisionTests
        from services.provider_budget import request_cancelled
        from services.session_service import get_session
        t=WorkspaceRevisionTests('test_failed_execution_does_not_publish_or_mutate_source_session');t.setUp();self.addCleanup(t.doCleanups)
        r=t.initial();before=deepcopy(get_session(r['session_id']).report_response)
        cancel=Event();cancel.set();token=request_cancelled.set(cancel)
        try:
            with self.assertRaises(AnalysisError):t.p.workspace_revision(t.request_for(r))
        finally:request_cancelled.reset(token)
        self.assertEqual(get_session(r['session_id']).report_response,before)
