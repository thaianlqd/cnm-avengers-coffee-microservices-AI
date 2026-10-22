"""Offline end-to-end harness for the comparison-workspace goal (scripted provider + SQLite fixture)."""
import os
from contextlib import ExitStack
from datetime import date
from unittest.mock import Mock, patch
from common import AiTextToReportRequest
from services.analysis_pipeline import AnalysisPipeline
from tests.agent_fixtures import ScriptedProvider, call
from tests.analysis_fixtures import physical_metadata
from evals.fixture_warehouse import FixtureWarehouse, DATA
from evals import comparison_fixture as cf

LAST = {}

ENV = {'AI_OFFLINE': '1', 'DATA_ANALYST_ENV': 'development', 'DATA_ANALYST_SESSION_STORE': 'memory',
       'DATA_ANALYST_ARTIFACT_STORE': 'memory', 'DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN': '3',
       'DATA_ANALYST_ENABLE_CONTRACT_REPAIR': '1', 'DATA_ANALYST_ONE_SHOT_CONTEXT_MAX_CHARS': '24000'}


def requirement(**updates):
    base = dict(id='r1', goal='So sánh doanh thu', domain_id='orders', metric_ids=['revenue'], dimension_ids=['city'],
                analysis_kind='aggregate', filters=[dict(dimension='city', operator='in', value=[cf.CITIES['Alpha'], cf.CITIES['Beta']])],
                time=dict(kind='relative', mode='all_time'), derived_features=['group_gap'])
    base.update(updates)
    return base


def envelope(*reqs):
    return {'decision': 'analyze', 'requirements': list(reqs) or [requirement()]}


def run(env_requirements, question=None, depth='deep', mission='compare', data=None,
        value_lookup=None, extra=None):
    """Returns (report, provider, warehouse_calls). Raises AnalysisError like production."""
    with ExitStack() as stack:
        stack.enter_context(patch.dict(os.environ, ENV))
        for target in ('requests.sessions.Session.request', 'psycopg2.connect'):
            stack.enter_context(patch(target, side_effect=AssertionError('External transport forbidden')))
        stack.enter_context(patch.dict(DATA, data or cf.warehouse_data()))
        provider = ScriptedProvider(*[[call('submit_analysis_intent', e)] for e in env_requirements])
        from services.analysis_catalog import AnalysisCatalog
        catalog = AnalysisCatalog(physical_metadata())
        warehouse = FixtureWarehouse(catalog.overlay)
        def fixture_lookup(table, column, search, limit=8):
            # Same contract as metadata_service.lookup_dimension_values (ILIKE, distinct, exact first, ≤ limit).
            needle = (search or '').strip().lower()
            values = sorted({r.get(column) for r in DATA.get(table.split('.')[-1], []) if r.get(column) is not None
                             and needle in str(r.get(column)).lower()}, key=lambda v: (str(v).lower() != needle, str(v)))
            return values[:min(max(int(limit), 1), 8)] if 2 <= len(needle) <= 80 else []
        lookup = value_lookup or Mock(side_effect=fixture_lookup)
        stack.enter_context(patch('services.metadata_service.lookup_dimension_values', side_effect=fixture_lookup))
        from services import input_integrity_service
        stack.enter_context(patch.object(input_integrity_service, '_cache', {}, create=True))
        try:
            pipeline = AnalysisPipeline(metadata_loader=physical_metadata, provider=provider, executor=warehouse,
                                        value_lookup=lookup, owner_id='owner-a')
            LAST['pipeline'] = pipeline
            question = question or f"so sánh doanh thu thành phố {cf.CITIES['Alpha']} và thành phố {cf.CITIES['Beta']}"
            req = AiTextToReportRequest(question=question, reference_date=date.fromisoformat(cf.REFERENCE),
                                        analysis_depth=depth, analysis_mission=mission, **(extra or {}))
            proposal = pipeline.propose(req)
            if proposal.get('status') != 'proposal_ready':
                return proposal, provider, warehouse.call_count
            p = proposal['proposal']
            req.session_id = proposal['session_id']; req.proposal_revision = p['revision']
            req.intent_fingerprint = p['semantic_intent_fingerprint']; req.plan_fingerprint = p['resolved_plan_fingerprint']
            req.catalog_fingerprint = p['catalog_fingerprint']
            if p.get('partial_scope'):
                req.accept_partial_scope = True
            report = pipeline.generate(req)
            return report, provider, warehouse.call_count
        finally:
            warehouse.close()
