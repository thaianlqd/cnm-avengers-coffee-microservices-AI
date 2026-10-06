"""Run V2.3 tests and record real offline orchestration costs; never use providers/DB."""
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from common import AiReportRefineRequest
from services.analysis_catalog import AnalysisError
from services.data_analyst_agent import AgentBudget, SYSTEM
from tests.test_agent_v23 import (
    V23Tests, discovery, finish, simple_query, investigation, rich_queries,
    fixture_executor, query_script, ScriptedProvider, call, ranking_query,
)


def record(name, diagnostics, charts=0, queries=0, status="success"):
    costs = diagnostics.get("cost_rounds", [])
    return {
        "scenario": name, "status": status,
        "rounds": diagnostics.get("agent_rounds", 0),
        "semantic_calls": diagnostics.get("semantic_tool_calls", 0),
        "analytical_calls": diagnostics.get("analytical_tool_calls", 0),
        "db_calls_mocked": diagnostics.get("db_query_count", 0),
        "value_lookups_mocked": diagnostics.get("value_lookup_count", 0),
        "repairs": diagnostics.get("contract_repair_count", 0),
        "rejections": diagnostics.get("contract_rejection_count", 0),
        "normalizations": diagnostics.get("contract_normalization_count", 0),
        "queries": queries, "charts": charts,
        "system_chars": len(SYSTEM),
        "schema_chars_by_round": [r["tool_schema_chars"] for r in costs],
        "context_chars_by_round": [r["history_chars"] for r in costs],
        "semantic_context_chars_by_round": [r["semantic_context_chars"] for r in costs],
        "tool_result_chars_by_round": [r["tool_result_chars"] for r in costs],
        "result_projection_chars_by_round": [r["result_projection_chars"] for r in costs],
        "tokens": None, "real_provider_calls": 0, "live_warehouse_queries": 0,
    }


def scenarios():
    t = V23Tests(); t.setUp()
    records = []
    try:
        for name, queries, provider in (
            ("normalized_ranking", [simple_query()], ScriptedProvider(discovery(), [call("run_analysis", simple_query(), "q"), finish()])),
            ("bounded_investigation", investigation(), ScriptedProvider(
                [*discovery(), call("describe_semantic_concept", {"kind": "dimension", "id": "store"}, "store")],
                [*[call("run_analysis", q, q["id"]) for q in investigation()], finish([q["id"] for q in investigation()])])),
            ("rich_composite", rich_queries(), query_script(rich_queries())),
            ("contract_repair", [simple_query()], ScriptedProvider(discovery(), [call("run_analysis", {**simple_query(), "operation": "aggregate"}, "bad")], [call("run_analysis", simple_query(), "fixed"), finish()])),
        ):
            p = t.pipeline(provider, executor=fixture_executor(queries)); req = t.request()
            proposal = p.propose(req)
            records.append(record(name + "_proposal", proposal["diagnostics"], queries=len(queries), status=proposal["status"]))
            p.executor.assert_not_called()
            req.session_id = proposal["session_id"]
            p.provider = Mock(side_effect=AssertionError("Approval provider forbidden"))
            report = p.generate(req); p.provider.assert_not_called()
            records.append(record(name + "_approval", report["diagnostics"], len(report["charts"]), len(report["analytical_queries"])))

        # Three refinement turns: add a metric, add a trend, change only a view.
        p = t.pipeline(query_script()); report = p.generate(t.request())
        updated = {**ranking_query(), "id": "replacement", "metrics": ["quantity_sold", "product_revenue"]}
        p.executor = fixture_executor([updated])
        patch_query = {"id": "replacement", "replaces": "main", "changed_fields": ["metrics"], "metrics": updated["metrics"]}
        p.provider = ScriptedProvider([call("run_analysis", patch_query, "q"), finish(["replacement"])])
        report = p.refine(AiReportRefineRequest(session_id=report["session_id"], current_report=report, feedback="thêm doanh thu"))
        records.append(record("add_metric_refinement", report["diagnostics"], len(report["charts"]), len(report["analytical_queries"])))
        trend = {**ranking_query(), "id": "weekly", "operation": "trend", "ranking": None, "group_by": [], "granularity": "week"}
        p.executor = fixture_executor([trend])
        p.provider = ScriptedProvider([call("run_analysis", trend, "trend"), finish(["replacement", "weekly"])])
        report = p.refine(AiReportRefineRequest(session_id=report["session_id"], current_report=report, feedback="thêm xu hướng theo tuần"))
        records.append(record("add_weekly_trend_refinement", report["diagnostics"], len(report["charts"]), len(report["analytical_queries"])))
        p.provider = ScriptedProvider([finish(["replacement", "weekly"])])
        p.executor = Mock(side_effect=AssertionError("Chart-only DB call forbidden"))
        report = p.refine(AiReportRefineRequest(session_id=report["session_id"], current_report=report, feedback="giữ các biểu đồ"))
        records.append(record("view_only_refinement", report["diagnostics"], len(report["charts"]), len(report["analytical_queries"])))
        p.executor.assert_not_called()

        bad = {**simple_query(), "operation": "aggregate"}
        p = t.pipeline(ScriptedProvider(discovery(), [call("run_analysis", bad)], [call("run_analysis", {**bad, "id": "different"})]))
        try:
            p.propose(t.request())
            raise AssertionError("Repeated invalid contract unexpectedly accepted")
        except AnalysisError as error:
            assert error.category == "duplicate_invalid_tool_call"
            p.executor.assert_not_called()
            records.append(record("duplicate_invalid_failure", p.semantic_info, status=error.category))
    finally:
        t.doCleanups()
    return records


def main():
    os.environ["AI_OFFLINE"] = "1"
    with patch("requests.sessions.Session.request", side_effect=AssertionError("OFFLINE network forbidden")), patch("psycopg2.connect", side_effect=AssertionError("OFFLINE DB forbidden")):
        completed = unittest.TextTestRunner(verbosity=1).run(unittest.defaultTestLoader.loadTestsFromTestCase(V23Tests))
        costs = scenarios()
    output = {
        "mode": "offline_scripted_tools_synthetic_metadata_and_rows",
        "note": "Contracts and costs only. No live language, provider compatibility, warehouse accuracy or token-price claim.",
        "passed": completed.testsRun - len(completed.errors) - len(completed.failures), "total": completed.testsRun,
        "real_provider_calls": 0, "embedding_calls": 0, "live_warehouse_queries": 0, "warehouse_mutations": 0,
        "budgets": AgentBudget().__dict__, "costs": costs,
    }
    (ROOT / "docs/AGENT_MATRIX_V23_OFFLINE.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"passed": output["passed"], "total": output["total"], "costs": costs}, ensure_ascii=False, indent=2))
    return 0 if completed.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
