"""Offline V2.4 evidence: scripts decide meaning; real validators check it."""

import argparse
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from services.analysis_catalog import AnalysisError
from services.analysis_pipeline import safe_failure
from services.provider_budget import ProviderTurn
from tests.test_one_shot_v24 import OneShotTests, decision, scripted, deep_sales_queries, deep_domain_queries
from common import AiTextToReportRequest
from tests.test_agent_v22 import REFERENCE
from tests.test_agent_v23 import investigation, rich_queries, fixture_executor


def scenarios():
    fixture = OneShotTests()
    records = []
    for name, queries in (("simple_ranking", None), ("simple_investigation", investigation()), ("complex", rich_queries())):
        p = fixture.pipeline(scripted(decision(queries)), fixture_executor(queries) if queries else None)
        request = fixture.request("Explicit offline analytical fixture")
        proposal = p.propose(request)
        proposal_diag = proposal["diagnostics"]
        request.session_id = proposal["session_id"]
        report = p.generate(request)
        records.append({"scenario": name, "proposal_status": proposal["status"],
            "provider_call_count": p.provider.call_count, "proposal": proposal_diag,
            "approval": report["diagnostics"], "db_query_count": p.executor.call_count,
            "chart_count": len(report["charts"]), "chart_types": [c["chart_type"] for c in report["charts"]],
            "evidence_count": len(report["evidence"])})
    for subject in ("sales", "payments", "inventory", "customers"):
        queries = deep_sales_queries() if subject == "sales" else deep_domain_queries(subject)
        p = fixture.pipeline(scripted(decision(queries)), fixture_executor(queries))
        request = AiTextToReportRequest(prompt="Offline generic deep investigation", reference_date=REFERENCE)
        proposal = p.propose(request); request.session_id = proposal["session_id"]
        report = p.generate(request)
        records.append({"scenario": "deep_" + subject, "proposal_status": proposal["status"],
            "provider_call_count": p.provider.call_count, "proposal": proposal["diagnostics"],
            "approval": report["diagnostics"], "db_query_count": p.executor.call_count,
            "chart_count": len(report["charts"]), "chart_types": [c["chart_type"] for c in report["charts"]],
            "operations": [{k: q[k] for k in ("id", "subject", "metrics", "filters", "time", "granularity", "population_relation")} for q in report["analytical_queries"]],
            "evidence_count": len(report["evidence"])})
    invalid = decision(requested_operations=[{"id": "main", "subject": "products", "operation": "aggregate", "metrics": ["undefined"]}])
    for name, value in (("invalid_requested", invalid),
        ("invalid_support", decision(supporting_operations=[{"id": "bad", "operation": "unknown"}])),
        ("clarification", {"decision_type": "clarification", "clarification": {"reason": "metric_ambiguous", "subject": "orders"}}),
        ("unsupported", {"decision_type": "unsupported", "clarification": {"reason": "unsupported_metric", "subject": "orders"}})):
        p = fixture.pipeline(scripted(value))
        try:
            response = p.propose(fixture.request("Explicit offline fixture"))
        except AnalysisError as error:
            response = safe_failure(error, p.calls, p.semantic_info)
        records.append({"scenario": name, "status": response["status"], "diagnostics": response["diagnostics"],
                        "provider_call_count": p.provider.call_count, "db_query_count": p.executor.call_count})
    provider = scripted(decision()); diagnostics = {}; turn = ProviderTurn(provider, diagnostics)
    turn.invoke(system="", messages=[], tools=[])
    try:
        turn.invoke(system="", messages=[], tools=[])
    except AnalysisError as error:
        records.append({"scenario": "second_call_guard", "category": error.category,
                        "provider_call_count": provider.call_count, "diagnostics": diagnostics})
    return records


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "docs/V24_QUALIFICATION.json")
    args = parser.parse_args()
    # No application startup, credentials, metadata introspection or network.
    with patch.dict(os.environ, {"AI_OFFLINE": "1", "DATA_ANALYST_SEMANTIC_MANIFEST_MAX_CHARS": "10000", "DATA_ANALYST_ONE_SHOT_CONTEXT_MAX_CHARS": "24000"}), patch("requests.sessions.Session.request", side_effect=AssertionError("Offline")), patch("psycopg2.connect", side_effect=AssertionError("Offline")):
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(OneShotTests)
        result = unittest.TextTestRunner(verbosity=1).run(suite)
        records = scenarios()
    payload = {"pipeline_version": "2.4", "tests_run": result.testsRun,
        "tests_passed": result.testsRun - len(result.failures) - len(result.errors),
        "real_provider_calls": 0, "embedding_calls": 0, "live_db_queries": 0, "live_db_mutations": 0,
        "note": "Scripted decisions and synthetic rows validate orchestration, not live language accuracy or provider token cost.",
        "scenarios": records}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print(f"{payload['tests_passed']}/{result.testsRun} tests; output={args.output}")
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
