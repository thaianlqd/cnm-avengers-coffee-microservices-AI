"""Repeatable offline matrix; explicit opt-in enables later read-only live QA.

Run from analytics-api: python tools/analysis_matrix.py --output docs/MANUAL_MATRIX_OFFLINE.json
Offline complex specs are scripted provider responses, NOT evidence of live NLP
accuracy. Live mode never imports the application startup (which initializes views).
"""

from __future__ import annotations
import argparse
import json
import os
import sys
import time
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from common import AiTextToReportRequest, AiReportRefineRequest
from services.analysis_contract import AnalysisSpec, SpecPatch
from services.analysis_understanding import merge_patch
from services.analysis_pipeline import AnalysisPipeline, safe_failure
from tests.analysis_fixtures import physical_metadata, result


def run_case(case, live=False):
    provider_calls = []
    executed = []
    refinement = case.get("refinement")
    fixtures = iter(
        case["fixture_results"]
        + (refinement.get("fixture_results", []) if refinement else [])
    )

    def provider(prompt, response_schema=None):
        payload = json.loads(prompt)
        provider_calls.append(
            "understanding"
            if "request" in payload
            else "patch" if "feedback" in payload else "synthesis"
        )
        return {
            "data": (
                case["expected_spec"]
                if "request" in payload
                else (
                    refinement["patch"]
                    if "feedback" in payload and refinement
                    else {"selected_evidence_ids": []}
                )
            ),
            "attempts": [],
        }

    def execute(sql, row_limit=100):
        executed.append(sql)
        rows = next(fixtures)
        if not rows:
            from sqlglot import parse_one

            columns = parse_one(sql, read="postgres").named_selects
            return {**result([]), "columns": columns}
        return result(rows)

    pipeline = (
        AnalysisPipeline()
        if live
        else AnalysisPipeline(
            metadata_loader=physical_metadata, provider=provider, executor=execute
        )
    )
    req = AiTextToReportRequest(prompt=case["prompt"])
    started = time.perf_counter()
    proposal = {}
    report = {}
    try:
        proposal = pipeline.propose(req)
        req.session_id = proposal["session_id"]
        report = pipeline.generate(req)
        if refinement:
            report = pipeline.refine(
                AiReportRefineRequest(
                    current_report=report,
                    feedback=refinement["feedback"],
                    session_id=report["session_id"],
                )
            )
    except Exception as error:
        report = safe_failure(error)
    expected = case["expected_status"]
    actual = report["status"]
    diag = report.get("diagnostics", {})
    calls = diag.get("provider_calls", pipeline.calls)
    passed = actual == expected
    if actual == "success":
        passed = (
            passed
            and all(v["valid"] for v in report["result_contracts"].values())
            and report["analysis_spec"]
            == (
                merge_patch(
                    AnalysisSpec.model_validate(proposal["analysis_spec"]),
                    SpecPatch.model_validate(refinement["patch"]),
                ).model_dump(mode="json")
                if refinement
                else proposal["analysis_spec"]
            )
        )
    return {
        "id": case["id"],
        "mode": "live" if live else "offline_fixture",
        "prompt": case["prompt"],
        "refinement_feedback": refinement["feedback"] if refinement else None,
        "initial_analysis_spec": proposal.get("analysis_spec"),
        "spec_patch": report.get("spec_patch"),
        "expected_status": expected,
        "actual_status": actual,
        "pass": passed,
        "analysis_spec": report.get("analysis_spec", proposal.get("analysis_spec")),
        "grounded_spec": report.get("grounded_analysis_spec"),
        "query_plans": report.get("query_plans", []),
        "sql": report.get("sql_by_query", {}),
        "validation": diag.get("validation", diag),
        "row_counts": {
            k: len(v["rows"]) for k, v in report.get("result_sets", {}).items()
        },
        "chart_contracts": [
            {
                k: c.get(k)
                for k in (
                    "chart_type",
                    "scope_ref",
                    "row_selector",
                    "metric",
                    "unit",
                    "cardinality",
                )
            }
            for c in report.get("charts", [])
        ],
        "final_answer": report.get("executive_summary", report.get("message", "")),
        "provider_calls": calls,
        "real_provider_call_count": len(calls) if live else 0,
        "mock_stage_calls": provider_calls,
        "embedding_call_count": pipeline.embedding_calls,
        "latency_ms": round((time.perf_counter() - started) * 1000, 2),
        "token_usage": (
            {
                "input": sum(c.get("tokens", {}).get("input") or 0 for c in calls),
                "output": sum(c.get("tokens", {}).get("output") or 0 for c in calls),
            }
            if calls
            else None
        ),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--cases", type=Path, default=ROOT / "tests/fixtures/manual_analysis_cases.json"
    )
    parser.add_argument(
        "--output", type=Path, default=ROOT / "docs/MANUAL_MATRIX_OFFLINE.json"
    )
    parser.add_argument(
        "--case", action="append", help="Run only the named case (repeatable)"
    )
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--allow-provider-calls", action="store_true")
    args = parser.parse_args()
    if args.live and not args.allow_provider_calls:
        parser.error(
            "Live mode requires --allow-provider-calls; it may spend provider quota and queries the configured warehouse read-only"
        )
    if not args.live:
        os.environ["AI_OFFLINE"] = "1"
    cases = json.loads(args.cases.read_text())
    if args.case:
        cases = [case for case in cases if case["id"] in args.case]
        if len(cases) != len(set(args.case)):
            parser.error("Unknown case ID")
    if args.live:
        rows = [
            run_case(c, True) for c in cases if not c["id"].startswith("adversarial_")
        ]
    else:
        with patch(
            "requests.sessions.Session.request",
            side_effect=AssertionError("Offline network denied"),
        ), patch(
            "psycopg2.connect", side_effect=AssertionError("Offline database denied")
        ):
            rows = [run_case(c) for c in cases]
    output = {
        "mode": "live" if args.live else "offline_fixture",
        "note": (
            "Scripted complex interpretations and synthetic schema/rows; no live NLP or warehouse accuracy claim."
            if not args.live
            else "Inspect each interpretation and result against warehouse business truth; fixtures are not live expected data."
        ),
        "passed": sum(r["pass"] for r in rows),
        "total": len(rows),
        "records": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(output, ensure_ascii=False, indent=2, default=str) + "\n"
    )
    for row in rows:
        print(
            f"{row['id']}: {'PASS' if row['pass'] else 'FAIL'} ({row['actual_status']})"
        )
    print(f"{output['passed']}/{output['total']} passed; output={args.output}")
    return 0 if output["passed"] == output["total"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
