"""Repeatable V2.2 offline cases and actual character/query budget comparison."""

import json
import os
import sys
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from common import AiTextToReportRequest, AiReportRefineRequest
from services.analysis_pipeline import AnalysisPipeline
from services.data_analyst_agent import SYSTEM, AgentBudget
from tests.analysis_fixtures import physical_metadata, result, ranked_rows
from tests.agent_fixtures import query_script, ranking_query, ScriptedProvider, call
from tests.test_agent_v22 import AgentTests, fixture_artifact, REFERENCE


class RecordedTests(unittest.TextTestResult):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.records = []

    def addSuccess(self, test):
        super().addSuccess(test)
        self.records.append({"id": test.id(), "pass": True})

    def addFailure(self, test, err):
        super().addFailure(test, err)
        self.records.append({"id": test.id(), "pass": False, "category": "assertion"})

    def addError(self, test, err):
        super().addError(test, err)
        self.records.append({"id": test.id(), "pass": False, "category": "error"})


def cost_record(name, report):
    diag = report["diagnostics"]
    return {
        "scenario": name,
        "agent_rounds": diag["agent_rounds"],
        "semantic_calls": diag["semantic_tool_calls"],
        "analytical_calls": diag["analytical_tool_calls"],
        "db_queries": diag["db_query_count"],
        "chart_count": len(report["charts"]),
        "system_prompt_chars": len(SYSTEM),
        "tool_schema_chars_by_round": [
            r["tool_schema_chars"] for r in diag["cost_rounds"]
        ],
        "tool_result_chars_by_round": [
            r["tool_result_chars"] for r in diag["cost_rounds"]
        ],
        "result_projection_chars_by_round": [
            r["result_projection_chars"] for r in diag["cost_rounds"]
        ],
        "provider_tokens": None,
        "real_provider_calls": 0,
        "embedding_calls": 0,
        "live_db_queries": 0,
    }


def scenarios():
    p = AnalysisPipeline(
        metadata_loader=physical_metadata,
        provider=query_script(),
        executor=Mock(return_value=result(ranked_rows())),
        value_lookup=lambda *a, **k: [],
    )
    simple = p.generate(
        AiTextToReportRequest(
            prompt="Offline ranking fixture", reference_date=REFERENCE
        )
    )
    records = [cost_record("SIMPLE QUESTION", simple)]
    p.provider = ScriptedProvider(
        [
            call(
                "finish_analysis",
                {
                    "active_query_ids": ["main"],
                    "visuals": [
                        {
                            "query_id": "main",
                            "chart_type": "bar",
                            "metrics": ["quantity_sold"],
                            "x_field": "product",
                            "purpose": "ranking",
                        }
                    ],
                },
            )
        ]
    )
    refined = p.refine(
        AiReportRefineRequest(
            current_report=simple,
            feedback="Offline chart-only refinement fixture",
            session_id=simple["session_id"],
        )
    )
    refinement = cost_record("REFINEMENT", refined)
    queries = []
    for id, city, n in [("hn", "Hà Nội", 5), ("ct", "Cần Thơ", 3)]:
        queries.append(
            ranking_query(
                id=id,
                metrics=["quantity_sold", "product_revenue"],
                filters=[{"dimension": "city", "value": city}],
                ranking={"metric": "quantity_sold", "direction": "DESC", "top_n": n},
                time={"kind": "relative", "mode": "previous_quarter"},
            )
        )
    queries.append(
        {
            "id": "weekly",
            "subject": "products",
            "operation": "trend",
            "metrics": ["quantity_sold", "product_revenue"],
            "group_by": [],
            "filters": [{"dimension": "city", "value": "Hà Nội"}],
            "time": {"kind": "relative", "mode": "previous_quarter"},
            "granularity": "week",
        }
    )
    fixtures = [fixture_artifact(q)[0].result for q in queries]
    p = AnalysisPipeline(
        metadata_loader=physical_metadata,
        provider=query_script(queries),
        executor=Mock(side_effect=fixtures),
        value_lookup=lambda *a, **k: [],
    )
    report = p.generate(
        AiTextToReportRequest(
            prompt="Offline two-city ranking and weekly trend fixture",
            reference_date=REFERENCE,
        )
    )
    records.append(cost_record("MULTI-PART QUESTION", report))
    records.append(refinement)
    assert records[0]["db_queries"] == 1 and records[0]["agent_rounds"] == 2
    assert records[1]["chart_count"] == 6 and records[1]["db_queries"] == 3
    assert refinement["db_queries"] == 0 and refinement["agent_rounds"] == 1
    return records


def main():
    os.environ["AI_OFFLINE"] = "1"
    with patch(
        "requests.sessions.Session.request",
        side_effect=AssertionError("OFFLINE network forbidden"),
    ), patch(
        "psycopg2.connect", side_effect=AssertionError("OFFLINE database forbidden")
    ):
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(AgentTests)
        completed = unittest.TextTestRunner(verbosity=1, resultclass=RecordedTests).run(
            suite
        )
        costs = scenarios()
    report = {
        "mode": "offline_scripted_native_tools",
        "note": "Scripts validate architecture/contracts against synthetic metadata/results. They do not measure live language accuracy, warehouse correctness or real token cost.",
        "passed": sum(r["pass"] for r in completed.records),
        "total": completed.testsRun,
        "real_provider_calls": 0,
        "embedding_calls": 0,
        "live_warehouse_queries": 0,
        "warehouse_mutations": 0,
        "records": completed.records,
        "cost_comparison": costs,
        "budgets": AgentBudget().__dict__,
    }
    target = ROOT / "docs/AGENT_MATRIX_V22_OFFLINE.json"
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(
        json.dumps(
            {
                "passed": report["passed"],
                "total": report["total"],
                "cost_comparison": costs,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0 if completed.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
