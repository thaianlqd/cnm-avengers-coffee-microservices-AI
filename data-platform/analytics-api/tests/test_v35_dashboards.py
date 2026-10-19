from copy import deepcopy
from datetime import date
from unittest import TestCase
from unittest.mock import patch
from pydantic import ValidationError
from fastapi import HTTPException, Response
from common import AiTextToReportRequest
from services.analysis_catalog import AnalysisCatalog, AnalysisError
from services.analysis_pipeline import AnalysisPipeline
from services.workspace_service import validate_dashboard_templates, dashboard_template, dashboard_intent, dashboard_catalog, dashboard_sources
from tests.analysis_fixtures import physical_metadata
from tests.agent_fixtures import ScriptedProvider


class DashboardTests(TestCase):
    def setUp(self):
        self.catalog = AnalysisCatalog(physical_metadata())
        from evals.fixture_warehouse import DATA
        data = deepcopy(DATA)
        data['chi_nhanh'][1]['loai_diem_ban'] = 'KIOSK_NHUONG_QUYEN'
        data['giao_hang'] = [dict(ma_giao_hang='trip1', ma_don_hang='o1', ma_shipper='d1',
            trang_thai_giao_hang='DELIVERED', thoi_gian_nhan_chuyen='2026-09-01T10:00:00',
            thoi_gian_lay_hang='2026-09-01T10:10:00', thoi_gian_ket_thuc='2026-09-01T10:30:00')]
        data['khuyen_mai_su_dung'] = [dict(ma_su_dung='redeem1',ma_khuyen_mai='v1',
            ten_khuyen_mai='Ưu đãi A',co_so_ma='s1',ngay_su_dung='2026-09-01T10:00:00')]
        self.enterContext(patch.dict(DATA,data))

    def request(self, identity, **kwargs):
        return AiTextToReportRequest(dashboard_id=identity, dashboard_version='1.0.0',
            time={'mode':'all_time'}, reference_date=date(2026,10,19), analysis_depth='focused', **kwargs)

    def test_all_sixteen_presets_resolve_through_existing_pipeline_without_provider_or_sql(self):
        validate_dashboard_templates(self.catalog.registry)
        for template in self.catalog.registry['workspace']['dashboard_templates']:
            provider = ScriptedProvider()
            def no_sql(*args, **kwargs):
                raise AssertionError('Proposal must not execute data SQL')
            pipeline = AnalysisPipeline(metadata_loader=physical_metadata, provider=provider, executor=no_sql)
            with self.subTest(dashboard=template['id']):
                proposal = pipeline.propose(self.request(template['id']))
                self.assertEqual(proposal['status'], 'proposal_ready')
                self.assertEqual(provider.call_count, 0)
                self.assertTrue(proposal['diagnostics']['guided_contract_used'])
                self.assertFalse(proposal['proposal']['partial_scope'])
                from evals.fixture_warehouse import FixtureWarehouse
                pipeline.executor = FixtureWarehouse(self.catalog.overlay)
                self.addCleanup(pipeline.executor.close)
                approved = request = self.request(template['id'])
                approved.session_id = proposal['session_id']
                approved.proposal_revision = proposal['proposal']['revision']
                approved.intent_fingerprint = proposal['proposal']['semantic_intent_fingerprint']
                approved.plan_fingerprint = proposal['proposal']['resolved_plan_fingerprint']
                approved.catalog_fingerprint = proposal['proposal']['catalog_fingerprint']
                report = pipeline.generate(approved)
                self.assertEqual(report['status'], 'success')
                self.assertEqual(provider.call_count, 0)
                self.assertEqual(report['provenance']['dashboard_template']['id'], template['id'])
                self.assertEqual({req['id'] for req in report['semantic_intent']['requirements']},
                                 {req['id'] for req in template['requirements']})
                self.assertTrue(all(not req.get('supporting_for') for req in report['semantic_intent']['requirements']))


    def test_dashboard_rejects_accidental_provider_reservation_before_any_send(self):
        from services.provider_budget import ProviderBudget
        for action in ('consume', 'record_physical'):
            budget = ProviderBudget()
            pipeline = AnalysisPipeline(metadata_loader=physical_metadata, provider=ScriptedProvider())
            with self.subTest(action=action), patch('services.hybrid_analyst_planner.HybridAnalystPlanner.run',
                    side_effect=lambda *args: getattr(budget, action)()):
                with self.assertRaises(AnalysisError) as caught:
                    pipeline.propose(self.request('D01'))
                self.assertEqual(caught.exception.category, 'provider_forbidden')
                self.assertEqual((budget.used, budget.physical), (0, 0))
        # The request-local prohibition must never leak into the AI assistant.
        allowed = ProviderBudget()
        allowed.consume()
        self.assertEqual(allowed.used, 1)

    def test_survey_breakdowns_preserve_unassigned_responses(self):
        from evals.fixture_warehouse import DATA, FixtureWarehouse
        for row in DATA['khao_sat_phan_hoi']:
            row['co_so_ma'] = None
        provider = ScriptedProvider()
        warehouse = FixtureWarehouse(self.catalog.overlay)
        self.addCleanup(warehouse.close)
        pipeline = AnalysisPipeline(metadata_loader=physical_metadata, provider=provider, executor=warehouse)
        request = self.request('D14')
        proposal = pipeline.propose(request)['proposal']
        request.session_id = proposal['session_id']
        request.proposal_revision = proposal['revision']
        request.intent_fingerprint = proposal['semantic_intent_fingerprint']
        request.plan_fingerprint = proposal['resolved_plan_fingerprint']
        request.catalog_fingerprint = proposal['catalog_fingerprint']
        report = pipeline.generate(request)
        self.assertEqual(report['status'], 'success')
        grouped = [r for r in report['result_sets'].values()
                   if 'store' in r['columns'] or 'reporting_region' in r['columns']]
        self.assertEqual(len(grouped), 2)
        for result in grouped:
            self.assertEqual(sum(row['survey_response_count'] for row in result['rows']), 2)
        self.assertEqual(provider.call_count, 0)

    def test_default_time_each_dashboard_is_valid_without_changing_snapshot_meaning(self):
        for template in self.catalog.registry['workspace']['dashboard_templates']:
            provider=ScriptedProvider()
            pipeline=AnalysisPipeline(metadata_loader=physical_metadata,provider=provider)
            request=AiTextToReportRequest(dashboard_id=template['id'],dashboard_version=template['version'],
                time={'mode':template['default_time']},analysis_scope={'mode':'all','filters':[]},reference_date=date(2026,9,30),analysis_depth='focused')
            with self.subTest(dashboard=template['id']):
                proposal=pipeline.propose(request)
                self.assertEqual(proposal['status'],'proposal_ready')
                self.assertFalse(proposal['proposal']['partial_scope'])
                self.assertEqual(provider.call_count,0)

    def test_identity_version_and_mutual_exclusion_are_enforced(self):
        for value in ({}, {'question':'  '}, {'dashboard_id':'D01'},
                {'dashboard_id':'D01','dashboard_version':'1.0.0','time':{'mode':'all_time'},'question':'doanh thu'},
                {'dashboard_id':'D01','dashboard_version':'1.0.0','time':{'mode':'all_time'},'guided_contract':{'metric':'revenue'}},
                {'dashboard_id':'D01','dashboard_version':'1.0.0'}):
            with self.subTest(value=value), self.assertRaises(ValidationError):
                AiTextToReportRequest.model_validate(value)
        with self.assertRaises(AnalysisError): dashboard_template(self.catalog,'D99','1.0.0')
        with self.assertRaises(AnalysisError): dashboard_template(self.catalog,'D01','9.0.0')
        request = self.request('D01')
        self.assertEqual(AiTextToReportRequest.model_validate(request.model_dump(mode='json')).dashboard_id,'D01')
        self.assertNotEqual(AnalysisPipeline.request_signature(request),AnalysisPipeline.request_signature(self.request('D02')))

    def test_kiosk_filters_are_canonical_and_snapshot_inventory_has_no_historical_claim(self):
        intent=dashboard_intent(self.catalog,'D04','1.0.0')
        for req in intent['requirements']:
            self.assertEqual(req['filters'][0]['value'],['KIOSK_NHUONG_QUYEN','KIOSK_VE_TINH'])
        inventory=dashboard_template(self.catalog,'D09','1.0.0')
        self.assertEqual(inventory['default_time'],'all_time')
        self.assertTrue(all(not self.catalog.registry['metrics'][m].get('time_column')
            for req in inventory['requirements'] for m in req['metric_ids']))

    def test_metadata_only_returns_honest_unknown_without_triggering_jobs(self):
        metadata=dashboard_catalog(self.catalog)
        self.assertEqual(len(metadata['dashboards']),16)
        self.assertTrue(all(item['provider_calls']==0 and item['status']=='unknown' for item in metadata['dashboards']))
        broken=deepcopy(self.catalog.registry)
        broken['workspace']['dashboard_templates'][0]['requirements'][0]['metric_ids']=['invented_metric']
        with self.assertRaises(ValueError):validate_dashboard_templates(broken)

    def test_source_health_reaches_only_dependent_dashboards_without_provider(self):
        templates = self.catalog.registry['workspace']['dashboard_templates']
        sources = {source for template in templates for source in dashboard_sources(self.catalog, template)}
        # Exercise every actual dependency, including payment/delivery/inventory.
        for source in sorted(sources):
            for state in ('blocked', 'unknown', 'degraded'):
                views = {name: {'status': 'healthy', 'completeness': 'unknown'} for name in sources}
                views[source]['status'] = state
                with self.subTest(source=source, state=state):
                    dashboards = dashboard_catalog(self.catalog, {'views': views})['dashboards']
                    for dashboard in dashboards:
                        expected = state if source in dashboard['source_views'] else 'healthy'
                        self.assertEqual(dashboard['status'], expected)
                        self.assertEqual(dashboard['provider_calls'], 0)

    def test_missing_dependency_cannot_be_overridden_by_other_healthy_sources(self):
        templates = self.catalog.registry['workspace']['dashboard_templates']
        sources = {source for template in templates for source in dashboard_sources(self.catalog, template)}
        for omitted in sorted(sources):
            views = {name: {'status': 'healthy'} for name in sources if name != omitted}
            with self.subTest(omitted=omitted):
                for dashboard in dashboard_catalog(self.catalog, {'views': views})['dashboards']:
                    self.assertEqual(dashboard['status'], 'unknown' if omitted in dashboard['source_views'] else 'healthy')
                    self.assertEqual(dashboard['provider_calls'], 0)

    def test_opaque_session_mode_cannot_exchange_jwt_into_browser_cookie(self):
        from server import exchange_auth_session
        with patch.dict('os.environ',{'DATA_ANALYST_AUTH_MODE':'identity_login_session'}):
            with self.assertRaises(HTTPException) as caught:
                exchange_auth_session(None,Response())
        self.assertEqual(caught.exception.status_code,403)
