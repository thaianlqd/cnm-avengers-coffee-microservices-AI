"""Geographic presets reuse the governed dashboard pipeline with no provider calls."""
from datetime import date
from unittest import TestCase
from unittest.mock import patch
from common import AiTextToReportRequest
from services.analysis_catalog import AnalysisCatalog
from services.analysis_pipeline import AnalysisPipeline
from services.workspace_service import dashboard_intent, validate_dashboard_templates
from tests.analysis_fixtures import physical_metadata
from tests.agent_fixtures import ScriptedProvider
from evals.fixture_warehouse import DATA, FixtureWarehouse


class GeographicDashboardTests(TestCase):
    def test_new_geographic_presets_execute_without_ai_and_keep_geo_dimensions(self):
        catalog = AnalysisCatalog(physical_metadata())
        validate_dashboard_templates(catalog.registry)
        trips = [dict(ma_giao_hang='trip1', ma_don_hang='o1', ma_shipper='d1',
            trang_thai_giao_hang='DELIVERED', thoi_gian_nhan_chuyen='2026-09-01T10:00:00',
            thoi_gian_lay_hang='2026-09-01T10:10:00', thoi_gian_ket_thuc='2026-09-01T10:30:00')]
        with patch.dict(DATA, {'giao_hang': trips}):
            for identity in ('D36', 'D37', 'D38', 'D39', 'D40'):
                with self.subTest(dashboard=identity):
                    template = next(t for t in catalog.registry['workspace']['dashboard_templates'] if t['id'] == identity)
                    intent = dashboard_intent(catalog, identity, template['version'])
                    self.assertTrue(any('city' in req.get('dimension_ids', []) for req in intent['requirements']))
                    provider = ScriptedProvider()
                    warehouse = FixtureWarehouse(catalog.overlay)
                    try:
                        pipeline = AnalysisPipeline(metadata_loader=physical_metadata, provider=provider, executor=warehouse)
                        request = AiTextToReportRequest(dashboard_id=identity, dashboard_version=template['version'],
                            time={'mode': 'all_time'}, reference_date=date(2026, 10, 20), analysis_depth='focused')
                        proposal = pipeline.propose(request)['proposal']
                        request.session_id = proposal['session_id']
                        request.proposal_revision = proposal['revision']
                        request.intent_fingerprint = proposal['semantic_intent_fingerprint']
                        request.plan_fingerprint = proposal['resolved_plan_fingerprint']
                        request.catalog_fingerprint = proposal['catalog_fingerprint']
                        report = pipeline.generate(request)
                        self.assertEqual(report['status'], 'success')
                        self.assertEqual(provider.call_count, 0)
                        self.assertTrue(any(c.get('x_field') == 'city' and c.get('data') for c in report['charts']))
                        self.assertEqual(report['provenance']['dashboard_template']['id'], identity)
                    finally:
                        warehouse.close()

    def test_sale_availability_preset_never_promises_stock_quantities(self):
        catalog = AnalysisCatalog(physical_metadata())
        reqs = dashboard_intent(catalog, 'D38', '1.0.0')['requirements']
        self.assertEqual({metric for req in reqs for metric in req['metric_ids']}, {'sale_positions', 'paused_sale_positions'})
