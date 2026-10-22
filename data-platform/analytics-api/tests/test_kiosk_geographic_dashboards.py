from datetime import date
from unittest import TestCase
from unittest.mock import patch
from copy import deepcopy
from services.analysis_catalog import AnalysisCatalog
from services.analysis_pipeline import AnalysisPipeline
from services.workspace_service import dashboard_intent, validate_dashboard_templates
from tests.analysis_fixtures import physical_metadata
from tests.agent_fixtures import ScriptedProvider
from common import AiTextToReportRequest
from evals.fixture_warehouse import FixtureWarehouse, DATA


class KioskGeographicTests(TestCase):
    def setUp(self):
        stores=deepcopy(DATA['chi_nhanh'])
        for index,store in enumerate(stores):
            store['loai_diem_ban']='KIOSK_NHUONG_QUYEN' if index==0 else 'KIOSK_VE_TINH'
        self.enterContext(patch.dict(DATA,{'chi_nhanh':stores}))

    def test_five_kiosk_maps_keep_canonical_scope_and_execute_without_provider(self):
        catalog=AnalysisCatalog(physical_metadata())
        validate_dashboard_templates(catalog.registry)
        for identity in ('D49','D50','D51','D52','D53'):
            with self.subTest(dashboard=identity):
                intent=dashboard_intent(catalog,identity,'1.0.0')
                expected=['KIOSK_VE_TINH'] if identity in ('D50','D53') else ['KIOSK_NHUONG_QUYEN','KIOSK_VE_TINH'] if identity=='D51' else ['KIOSK_NHUONG_QUYEN']
                for req in intent['requirements']:
                    self.assertEqual(req['filters'],[dict(dimension='store_type',operator='in',value=expected)])
                self.assertTrue(any('city' in req.get('dimension_ids',[]) for req in intent['requirements']))
                provider=ScriptedProvider();warehouse=FixtureWarehouse(catalog.overlay)
                try:
                    pipeline=AnalysisPipeline(metadata_loader=physical_metadata,provider=provider,executor=warehouse)
                    req=AiTextToReportRequest(dashboard_id=identity,dashboard_version='1.0.0',time={'mode':'all_time'},reference_date=date(2026,10,20),analysis_depth='focused')
                    proposal=pipeline.propose(req)['proposal'];req.session_id=proposal['session_id'];req.proposal_revision=proposal['revision']
                    req.intent_fingerprint=proposal['semantic_intent_fingerprint'];req.plan_fingerprint=proposal['resolved_plan_fingerprint'];req.catalog_fingerprint=proposal['catalog_fingerprint']
                    report=pipeline.generate(req)
                    self.assertEqual(report['status'],'success');self.assertEqual(provider.call_count,0)
                    self.assertEqual(report['provenance']['dashboard_template']['id'],identity)
                finally:warehouse.close()

    def test_satellite_availability_is_sale_status_not_stock_quantity(self):
        catalog=AnalysisCatalog(physical_metadata());requirements=dashboard_intent(catalog,'D53','1.0.0')['requirements']
        self.assertEqual({m for req in requirements for m in req['metric_ids']},{'sale_positions','paused_sale_positions'})
