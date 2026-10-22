"""Additional business questions must execute from governed metrics without a model."""
from datetime import date
from unittest import TestCase
from common import AiTextToReportRequest
from services.analysis_catalog import AnalysisCatalog
from services.analysis_pipeline import AnalysisPipeline
from services.workspace_service import dashboard_intent, validate_dashboard_templates
from tests.analysis_fixtures import physical_metadata
from tests.agent_fixtures import ScriptedProvider
from evals.fixture_warehouse import FixtureWarehouse


class ExtendedDashboardTests(TestCase):
    def test_all_eight_business_extensions_replay_on_fixture_with_zero_provider_calls(self):
        catalog=AnalysisCatalog(physical_metadata())
        validate_dashboard_templates(catalog.registry)
        for identity in ('D41','D42','D43','D44','D45','D46','D47','D48'):
            with self.subTest(dashboard=identity):
                provider=ScriptedProvider()
                warehouse=FixtureWarehouse(catalog.overlay)
                try:
                    pipeline=AnalysisPipeline(metadata_loader=physical_metadata,provider=provider,executor=warehouse)
                    req=AiTextToReportRequest(dashboard_id=identity,dashboard_version='1.0.0',time={'mode':'all_time'},reference_date=date(2026,10,20),analysis_depth='focused')
                    proposal=pipeline.propose(req)['proposal']
                    req.session_id=proposal['session_id'];req.proposal_revision=proposal['revision']
                    req.intent_fingerprint=proposal['semantic_intent_fingerprint'];req.plan_fingerprint=proposal['resolved_plan_fingerprint'];req.catalog_fingerprint=proposal['catalog_fingerprint']
                    report=pipeline.generate(req)
                    self.assertEqual(report['status'],'success')
                    self.assertEqual(provider.call_count,0)
                    self.assertEqual(report['provenance']['dashboard_template']['id'],identity)
                    expected=dashboard_intent(catalog,identity,'1.0.0')
                    self.assertEqual({r['id'] for r in report['semantic_intent']['requirements']},{r['id'] for r in expected['requirements']})
                finally:
                    warehouse.close()
