"""Independent-review regressions, through the production pipeline. External I/O forbidden."""
from datetime import date
from unittest.mock import Mock, patch

from tests import test_hybrid_v28 as f
from services import preflight_service
from services.analysis_catalog import AnalysisError
from services.request_anchors import request_anchors, verify_anchors
from services.analysis_intent import AnalysisIntentEnvelope


class GateParityTests(f.unittest.TestCase):
    setUp = f.HybridTests.setUp
    pipeline = f.HybridTests.pipeline
    request = f.HybridTests.request
    def revenue(self):
        return f.requirement(id='rev', goal='Doanh thu', domain_id='orders', metric_ids=['revenue'],
            dimension_ids=[], analysis_kind='aggregate', ranking=None, derived_features=[], time=None)

    def test_known_terminal_never_reaches_interpreter_or_sql(self):
        for question in ('Lợi nhuận tháng 9 năm 2026', 'Email khách hàng', 'Doanh thu và lợi nhuận tháng 9 năm 2026'):
            with self.subTest(question=question):
                p = self.pipeline(f.scripted(f.envelope(self.revenue())))
                with self.assertRaises(AnalysisError):
                    p.propose(self.request(question))
                self.assertEqual(p.provider.call_count, 0)
                p.executor.assert_not_called()

    def test_guided_question_does_not_bypass_financial_or_temporal_constraints(self):
        requests = [
            self.request('Top 5 chi nhánh có doanh thu cao nhất đang lỗ tháng 9 năm 2026',
                input_mode='guided', analysis_mission='ranking',
                guided_contract={'metric':'revenue','dimension':'store','n':5,'direction':'top'}),
            self.request('Xu hướng doanh thu theo tuần trong ngày 15/09/2026', input_mode='guided',
                analysis_mission='trend', guided_contract={'metric':'revenue','granularity':'week'},
                time={'mode':'custom','start':'2026-09-15','end':'2026-09-15'}),
        ]
        for request in requests:
            p = self.pipeline()
            with self.assertRaises(AnalysisError):
                p.propose(request)
            self.assertEqual(p.provider.call_count, 0)
            p.executor.assert_not_called()


class GeographyTests(f.unittest.TestCase):
    setUp = f.HybridTests.setUp
    pipeline = f.HybridTests.pipeline
    request = f.HybridTests.request

    def test_scope_expression_sets(self):
        from services.scope_resolution_service import resolve_scope
        cases=[('Doanh thu miền Nam trừ HCM',5),('doanh thu mien nam va Ha Noi',7),
               ('Doanh thu miền Nam và Đông Nam Bộ',6),('Doanh thu ngoài miền Nam',10)]
        for question,count in cases:
            with self.subTest(question=question):
                resolved=resolve_scope(question,self.catalog)
                self.assertEqual(len(resolved['bindings'][0]['members']),count)
        self.assertEqual(resolve_scope('Doanh thu cửa hàng Nam Sơn',self.catalog)['state'],'unspecified')

    def test_geography_alias_matrix_and_canonical_identity(self):
        from services.scope_resolution_service import resolve_scope
        south={'Hồ Chí Minh','Cần Thơ','Bình Dương','Đồng Nai','Bà Rịa - Vũng Tàu','Kiên Giang'}
        north={'Hà Nội','Hải Phòng','Bắc Ninh','Quảng Ninh'}
        central={'Đà Nẵng','Nghệ An','Thanh Hóa','Thừa Thiên - Huế','Khánh Hòa','Lâm Đồng'}
        for alias,expected in [('mien nam',south),('phía Nam',south),('Nam Bộ',south),('Bắc Bộ',north),
            ('miền Trung và Tây Nguyên',central),('Đông Nam Bộ',south-{'Cần Thơ','Kiên Giang'}),
            ('Tây Nam Bộ',{'Cần Thơ','Kiên Giang'}),('miền Nam không gồm HCM',south-{'Hồ Chí Minh'})]:
            with self.subTest(alias=alias):
                self.assertEqual(set(resolve_scope('Doanh thu '+alias,self.catalog)['bindings'][0]['members']),expected)
        self.assertEqual(resolve_scope('Doanh thu miền Bắc và miền Nam',self.catalog)['fingerprint'],
                         resolve_scope('Doanh thu miền Nam và miền Bắc',self.catalog)['fingerprint'])
        for place in ('Quảng Nam','Nha Trang','Đà Lạt','Phú Quốc','chi nhánh mới mở','khách hàng VIP','miền Đông Bắc chưa phân loại'):
            self.assertIn(resolve_scope('Doanh thu '+place,self.catalog)['state'],{'unsupported','needs_clarification'})

    def test_structured_scope_cannot_widen_region_and_changes_identity(self):
        from services.scope_resolution_service import resolve_scope
        ui=lambda city:{'required_filters':[{'dimension':'city','operator':'eq','value':city}]}
        self.assertEqual(resolve_scope('Doanh thu miền Nam',self.catalog,ui('Hà Nội'))['state'],'needs_clarification')
        hcm=resolve_scope('Doanh thu miền Nam',self.catalog,ui('Hồ Chí Minh'))
        self.assertEqual(hcm['bindings'][0]['members'],['Hồ Chí Minh'])
        self.assertNotEqual(resolve_scope('Doanh thu',self.catalog,ui('Hà Nội'))['fingerprint'],
                            resolve_scope('Doanh thu',self.catalog,ui('Hồ Chí Minh'))['fingerprint'])

    def test_stored_module_rerun_uses_canonical_meaning_gate_and_zero_interpretation(self):
        from services.analysis_module_service import AnalysisModules
        from tests.test_natural_v26 import MemoryModules
        from evals.fixture_warehouse import FixtureWarehouse
        repo=MemoryModules();service=AnalysisModules(repo)
        w=FixtureWarehouse(self.catalog.overlay);self.addCleanup(w.close)
        req=f.requirement(id='south',goal='Doanh thu miền Nam',domain_id='orders',metric_ids=['revenue'],
            dimension_ids=['store'],analysis_kind='aggregate',ranking=None,derived_features=[],time=None)
        p=self.pipeline(f.scripted(f.envelope(req)),executor=w);p.owner_id='module-test';p.module_repository=repo
        request=self.request('Doanh thu miền Nam tháng 9 năm 2026',analysis_depth='focused')
        f.approve(request,p.propose(request));report=p.generate(request)
        saved=service.save(p,report['session_id'],'South review regression',revision=report['revision'])
        fresh=self.pipeline(executor=w);fresh.owner_id='module-test';fresh.module_repository=repo
        rerun=service.rerun(fresh,saved['module_id'])
        self.assertEqual(rerun['status'],'success');self.assertEqual(fresh.provider.call_count,0)
        self.assertEqual(rerun['scope_resolution']['bindings'][0]['members'],report['scope_resolution']['bindings'][0]['members'])
        self.assertEqual(rerun['short_answer'],report['short_answer'])
        # Simulate a stored-text policy violation; module identity never bypasses
        # the production input gate even when the saved template itself is safe.
        repo.rows['module-test',saved['module_id']]['definition']['original_question']='Doanh thu các chi nhánh đang lỗ'
        blocked=self.pipeline();blocked.owner_id='module-test';blocked.module_repository=repo
        with self.assertRaises(AnalysisError):service.rerun(blocked,saved['module_id'])
        self.assertEqual(blocked.provider.call_count,0);blocked.executor.assert_not_called()

    def test_region_is_applied_to_execution_and_total_answers(self):
        from evals.fixture_warehouse import FixtureWarehouse
        from services.analysis_quality_service import assess_report
        from copy import deepcopy
        warehouse=FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        req=f.requirement(id='south',goal='Doanh thu chi nhánh miền Nam',domain_id='orders',metric_ids=['store_revenue'],
            dimension_ids=['store'],analysis_kind='aggregate',ranking=None,derived_features=[],time=None)
        p=self.pipeline(f.scripted(f.envelope(req)),executor=warehouse)
        request=self.request('Doanh thu chi nhánh miền Nam',analysis_mission='overview',analysis_depth='focused')
        proposal=p.propose(request)
        for op in proposal['proposal']['analytical_queries']:
            self.assertTrue(any(v['dimension']=='city' and len(v['value'])==6 for v in op['filters']))
        f.approve(request,proposal);report=p.generate(request)
        self.assertTrue(report['short_answer'])
        self.assertIn('Tổng doanh thu',report['short_answer'][0])
        self.assertTrue(report['answer_requirements'])
        good=assess_report(report,self.catalog)
        mutated=deepcopy(report);mutated['conclusion']['answer']='Doanh thu 999 tỷ USD.'
        self.assertNotEqual(assess_report(mutated,self.catalog),good)

    def test_reporting_region_is_compiled_and_executes_from_city(self):
        from evals.fixture_warehouse import FixtureWarehouse
        warehouse=FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        req=f.requirement(id='regions',goal='Doanh thu theo miền',domain_id='orders',metric_ids=['revenue'],
            dimension_ids=['reporting_region'],analysis_kind='aggregate',ranking=None,derived_features=[],time=None)
        p=self.pipeline(f.scripted(f.envelope(req)),executor=warehouse)
        request=self.request('Doanh thu theo miền',analysis_depth='focused')
        proposal=p.propose(request);f.approve(request,proposal);report=p.generate(request)
        self.assertTrue(any('CASE' in q for q in report['sql_by_query'].values()))
        self.assertTrue(any('reporting_region' in r for a in report['result_sets'].values() for r in a['rows']))

    def test_non_additive_total_is_a_canonical_query_not_average_of_groups(self):
        from evals.fixture_warehouse import FixtureWarehouse
        warehouse=FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        req=f.requirement(id='aov',goal='Giá trị đơn trung bình',domain_id='orders',metric_ids=['aov'],
            dimension_ids=['store'],analysis_kind='aggregate',ranking=None,derived_features=[],time=None)
        p=self.pipeline(f.scripted(f.envelope(req)),executor=warehouse)
        request=self.request('Giá trị đơn trung bình',analysis_depth='focused')
        proposal=p.propose(request);f.approve(request,proposal);report=p.generate(request)
        # FINAL 2026-10-19: focused now adds core lenses; the requested grouped view + its canonical total stay exactly 2.
        self.assertEqual(sum(q['role']=='requested' for q in report['analytical_queries']),2)
        scalar=[a for a in report['result_sets'].values() if a['rows'] and set(a['rows'][0])=={'aov'}]
        self.assertEqual(len(scalar),1)
        self.assertAlmostEqual(scalar[0]['rows'][0]['aov'],700/3,places=2)
        self.assertIn('233',report['short_answer'][0])

    def test_governed_group_membership_and_case_must_stay_in_sync(self):
        from copy import deepcopy
        from services.analysis_catalog import AnalysisCatalog
        overlay=deepcopy(self.catalog.overlay)
        overlay['analysis_registry']['dimensions']['city']['value_groups'][0]['values'].pop()
        with self.assertRaises(AnalysisError):AnalysisCatalog(f.physical_metadata(),overlay)

    def test_unrequested_city_filter_is_rejected(self):
        req=f.requirement(metric_ids=['revenue'],dimension_ids=[],analysis_kind='aggregate',ranking=None,
            derived_features=[],time=None,filters=[{'dimension':'city','value':'Hà Nội'}])
        issues=verify_anchors(request_anchors('Doanh thu',self.catalog,{}),
            AnalysisIntentEnvelope.model_validate(f.envelope(req)).requirements,date(2026,10,16),self.catalog)
        self.assertTrue(any(i['field']=='filters' for i in issues))

    def test_geography_recognized_before_provider(self):
        pf = preflight_service.run('Doanh thu miền Nam', {'mode':'custom','start':'2026-09-01','end':'2026-09-30'},
            None, 'overview', date(2026,10,16), catalog=self.catalog, coverage={})
        self.assertEqual(pf['scope_resolution']['state'], 'resolved')
        self.assertEqual(set(pf['scope_resolution']['filters'][0]['value']),
            {'Hồ Chí Minh','Cần Thơ','Bình Dương','Đồng Nai','Bà Rịa - Vũng Tàu','Kiên Giang'})

    def test_scope_cannot_be_omitted_or_replaced_by_valid_but_wrong_city(self):
        for filters in ([], [{'dimension':'city','value':'Hà Nội'}]):
            req=f.requirement(id='south',goal='Doanh thu miền Nam',domain_id='orders',metric_ids=['revenue'],
                dimension_ids=['store'],analysis_kind='aggregate',ranking=None,derived_features=[],time=None,filters=filters)
            anchors=request_anchors('Doanh thu miền Nam', self.catalog, {})
            issues=verify_anchors(anchors, AnalysisIntentEnvelope.model_validate(f.envelope(req)).requirements,
                date(2026,10,16), self.catalog)
            self.assertTrue(any(i['field']=='filters' for i in issues), issues)

    def test_literal_scope_cannot_be_widened(self):
        req=f.requirement(metric_ids=['revenue'],dimension_ids=['store'],analysis_kind='aggregate',ranking=None,
            derived_features=[],time=None,filters=[{'dimension':'city','operator':'in','value':['Hồ Chí Minh','Hà Nội']}])
        issues=verify_anchors(request_anchors('Doanh thu Hồ Chí Minh',self.catalog,{}),
            AnalysisIntentEnvelope.model_validate(f.envelope(req)).requirements,date(2026,10,16),self.catalog)
        self.assertTrue(any(i['field']=='filters' for i in issues))


class EvidenceRegressionTests(f.unittest.TestCase):
    def test_horizontal_layout_does_not_turn_grouped_overview_into_ranking(self):
        from types import SimpleNamespace as N
        from services.chart_relevance_service import grammar_decisions
        arts={'groups':N(query=N(role='requested'),plan=N(kind='aggregate',dimensions=['store'])),
              'trend':N(query=N(role='requested'),plan=N(kind='trend',dimensions=[]))}
        charts=[{'scope_ref':'groups','chart_type':'horizontal_bar'}, {'scope_ref':'trend','chart_type':'line'}]
        mission={'chart_forms':['line','bar'],'supporting_forms':[]}
        self.assertNotIn(0,grammar_decisions(charts,arts,mission,{'groups':'r1','trend':'r2'}))

    def test_live_http_reservations_survive_recreation_and_exhaust_before_send(self):
        import tempfile
        from pathlib import Path
        from evals.live_acceptance_v33 import HttpMeter, MeterExceeded
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'ledger.json';send=Mock(return_value='ok')
            first=HttpMeter(2,send,path);first.case='a';self.assertEqual(first('url'),'ok')
            second=HttpMeter(2,send,path);second.case='b';self.assertEqual(second('url'),'ok')
            with self.assertRaises(MeterExceeded):HttpMeter(2,send,path)('url')
            self.assertEqual(send.call_count,2)
            import json
            self.assertEqual(json.loads(path.read_text())['reserved'],2)

    def test_live_classifier_rejects_plan_only_partial_and_wrong_metric(self):
        from evals.live_acceptance_v33 import classify
        good={'status':'success','verification':'verified','completion_status':'complete','conclusion':'Không bảo đảm chính xác 95%.',
              'coverage':[{'state':'RESOLVED'}],'views':[{'required':True,'status':'satisfied'}],'metric_ids':['revenue']}
        case={'expect':'useful_no_guarantee','metric_groups':[['revenue']]}
        self.assertTrue(classify(case,good))
        for patch_value in [{'status':'proposal_ready'},{'completion_status':'partial'},{'metric_ids':['order_count']},
                            {'conclusion':'Bảo đảm chính xác 95%.'}]:
            self.assertFalse(classify(case,{**good,**patch_value}),patch_value)

    def test_stale_source_is_not_masked_by_fresh_source(self):
        from datetime import datetime,timezone
        from services.data_coverage_service import build_snapshot,fact_clocks
        from tests.test_v33_verification import catalog
        c=catalog(); clocks=fact_clocks(c.registry,c.overlay['silver_tables'])
        rows={x['table']+'.'+x['column']:{'min':'2026-01-01','max':'2026-10-16'} for x in clocks}
        rows[clocks[0]['table']+'.'+clocks[0]['column']]['max']='2026-09-01'
        snapshot=build_snapshot(rows,None,c.overlay,datetime(2026,10,17,tzinfo=timezone.utc))
        self.assertTrue(snapshot['freshness']['stale'])
        self.assertEqual(snapshot['facts'][clocks[0]['table']]['completeness'],'unknown')

    def test_forecast_never_zero_fills_unproven_stale_tail(self):
        from services.forecast_service import complete_series
        series=complete_series([{'period':'2026-07-01','revenue':100.}], 'revenue','month',reference=date(2026,10,16),
                               window={'start':'2026-07-01','end':'2026-09-30'})
        self.assertEqual(series,[(date(2026,7,1),100.)])

    def test_forecast_total_excludes_in_progress_bucket(self):
        from services.forecast_service import forecast
        from services.chart_insight_service import build_conclusion
        from tests.test_v33_verification import catalog
        fc=forecast([(date(2026,m,1),100.0) for m in range(1,10)],'month',2,
                    catalog().registry['metrics']['revenue']['forecast'],date(2026,10,16))
        fc.update(status='ok',metric_label='Doanh thu',metric_unit='VND',requirement_id='fc')
        answer=build_conclusion([],{},[],[],[],forecasts=[fc],cadence_labels={'month':'tháng'})['answer']
        self.assertIn('200',answer)
        self.assertNotIn('300',answer)

    def test_row_fact_text_and_unit_are_verified(self):
        from copy import deepcopy
        from tests.test_v33_verification import grouped,build
        from services.chart_insight_service import verify_insights
        a=grouped([500.,300.,200.]);block=build(a)
        for field,value in [('unit','USD'),('text','Doanh thu chắc chắn là 999 tỷ USD.')]:
            bad=deepcopy(block);bad['key_facts'][0][field]=value
            self.assertTrue(verify_insights([bad],{a.query.id:a})['unsupported'],field)

    def test_secondary_cannot_start_with_five_seconds_remaining(self):
        from services.provider_budget import ProviderBudget
        with patch('services.provider_budget.time.monotonic',return_value=100.):
            budget=ProviderBudget({},max_calls=3);budget.deadline=110.
            self.assertFalse(budget.claim_recovery())

    def test_risk_custom_time_preserves_question_scope(self):
        from common import AiRiskWatchRequest
        from routers import ai
        from services import risk_watch_service
        with patch.object(ai,'get_local_metadata',return_value=f.physical_metadata()), patch.object(
                risk_watch_service,'evaluate',return_value={}) as evaluate:
            ai.ai_risk_watch(AiRiskWatchRequest(question='Rủi ro Hà Nội tháng 9 năm 2026',
                time={'mode':'custom','start':'2026-09-01','end':'2026-09-30'},reference_date=date(2026,10,16)))
        self.assertEqual(evaluate.call_args.args[1]['filters'][0]['value'],'Hà Nội')

    def test_risk_scan_cannot_bypass_unsupported_predicates(self):
        from common import AiRiskWatchRequest
        from routers import ai
        from services import risk_watch_service
        from fastapi import HTTPException
        with patch.object(ai,'get_local_metadata',return_value=f.physical_metadata()),patch.object(
                risk_watch_service,'evaluate') as evaluate:
            with self.assertRaises(HTTPException) as caught:
                ai.ai_risk_watch(AiRiskWatchRequest(question='Rủi ro các chi nhánh đang lỗ tháng 9 năm 2026'))
            self.assertEqual(caught.exception.detail['decision'],'UNSUPPORTED')
            evaluate.assert_not_called()
