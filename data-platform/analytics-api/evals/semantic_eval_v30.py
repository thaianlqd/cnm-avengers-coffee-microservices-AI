"""V3.0 semantic evaluation.

offline (deterministic, CI-safe; no provider, no warehouse):
    python -m evals.semantic_eval_v30 --mode offline
  * dataset integrity (labels reference governed IDs only)
  * retrieval: expected domain and metric reach the provider context
  * Level 2 compile: an oracle intent built from labels resolves to a plan
  Offline results do NOT measure natural-language understanding.

live (explicit opt-in; real provider; read-only):
    python -m evals.semantic_eval_v30 --mode live --cases smoke --max-calls 30 [--execute]
  * Level 1 understanding against labels, provider call accounting
  * --execute also runs approved plans on the warehouse (read-only SQL)
  Without provider configuration the result is NOT_RUN, never PASS.
"""
import argparse
import hashlib
import json
import os
import statistics
import time
from datetime import date, datetime
from pathlib import Path
from unittest.mock import Mock

ROOT = Path(__file__).resolve().parent
CASES = ROOT / "semantic_cases_v30.json"
CASES_V31 = ROOT / "semantic_cases_v31.json"
# V3.1 runs are recorded separately so the V3.0 evaluation record is preserved.
OUT = ROOT.parent / "evaluation" / "v31"
STATUSES = {"SUPPORTED", "AMBIGUOUS", "UNSUPPORTED", "OUT_OF_SCOPE", "FORECAST", "FORECAST_UNSUPPORTED"}
SMOKE = ["ship_01", "ship_07", "ship_08", "rev_02", "prod_01", "store_03", "pay_01", "cust_05", "fc_01", "fc_06", "oos_01", "typo_03"]
REFERENCE = date(2026, 10, 15)
TIME_LABELS = {"previous_month", "current_month", "today", "previous_day", "previous_quarter", "previous_year", "current_year"}


def load_cases():
    cases = [{**c, "version": "3.0"} for c in json.loads(CASES.read_text())["cases"]]
    if CASES_V31.exists():
        cases += [{**c, "version": "3.1"} for c in json.loads(CASES_V31.read_text())["cases"]]
    return cases


def integrity(cases, catalog):
    r = catalog.registry
    domains = r["domain_intelligence"]["profiles"]
    errors = []
    if len({c["id"] for c in cases}) != len(cases):
        errors.append("duplicate_case_id")
    for c in cases:
        if c["status"] not in STATUSES:
            errors.append(f"{c['id']}:status")
        if c.get("domain") and c["domain"] not in domains:
            errors.append(f"{c['id']}:domain")
        for m in c.get("metrics_any", []) + c.get("metrics_all", []):
            if m not in r["metrics"]:
                errors.append(f"{c['id']}:metric:{m}")
        for d in c.get("dimensions", []) + c.get("dimensions_any", []) + c.get("filters", []):
            if d not in r["dimensions"]:
                errors.append(f"{c['id']}:dimension:{d}")
        if c["status"] in {"SUPPORTED", "FORECAST"} and not (c.get("metrics_any") or c.get("metrics_all")):
            errors.append(f"{c['id']}:supported_without_metric")
        if c["status"] == "FORECAST":
            f = c.get("forecast") or {}
            if not any(r["metrics"][m].get("forecast", {}).get("forecastable") for m in c.get("metrics_any", [])):
                errors.append(f"{c['id']}:forecast_label_not_forecastable")
            if f.get("unit") not in {"day", "week", "month"}:
                errors.append(f"{c['id']}:forecast_unit")
        if c.get("probe") and c["probe"][0] not in r["metrics"]:
            errors.append(f"{c['id']}:probe_metric")
    return errors


def preflight_expectation(case, catalog):
    """Deterministic V3.1 preflight on the labelled question (0 provider calls)."""
    from services.preflight_service import run
    coverage = {"status": "ready", "overall": {"min_date": "2026-01-01", "max_date": REFERENCE.isoformat()}, "facts": {},
                "freshness": {"mode": "batch", "stale": False}}
    result = run(case["question"], reference=REFERENCE, catalog=catalog, coverage=coverage)
    codes = {f["code"] for f in result["findings"]}
    noisy = {f["code"] for f in result["findings"] if f["level"] != "info"}
    ok = set(case.get("preflight", [])) <= codes and (not case.get("preflight_clean") or not noisy)
    return {"ok": ok and result["provider_calls"] == 0, "codes": sorted(codes)}


def offline_pipeline():
    from tests.analysis_fixtures import physical_metadata
    from services.agent_pipeline import AnalysisPipeline
    return AnalysisPipeline(metadata_loader=physical_metadata, provider=Mock(), executor=Mock(),
                            value_lookup=Mock(return_value=[]), owner_id="eval")


def retrieval(case, pipeline, catalog):
    """Do the expected domain and a labelled metric survive context selection?"""
    from services.request_anchors import request_anchors
    agent = pipeline.agent(catalog, REFERENCE, proposal=True)
    question = case["question"] if not case.get("context_question") else case["context_question"] + ". " + case["question"]
    agent.anchors = request_anchors(question, catalog, {})
    payload = agent.context_payload(question, {"domain": "auto", "analysis_depth": "deep"})
    packet = payload["semantic_candidate_packet"]
    metrics = {m["id"] for m in packet.get("metrics", [])} | {m[0] for m in packet.get("related_metrics", []) + packet.get("metric_directory", [])}
    wanted = set(case.get("metrics_any", [])) | set(case.get("metrics_all", []))
    domain_ok = not case.get("domain") or case["domain"] in packet.get("candidate_domains", []) or bool(wanted & metrics)
    metric_ok = not wanted or bool(set(case.get("metrics_any", [])) & metrics or not case.get("metrics_any")) and set(case.get("metrics_all", [])) <= metrics
    return {"domain_ok": domain_ok, "metric_ok": metric_ok, "context_chars": len(json.dumps(payload, ensure_ascii=False)),
            "candidate_domains": packet.get("candidate_domains", []), "directory_mode": bool(packet.get("metric_directory"))}


def oracle_intent(case, catalog):
    """Labels → semantic intent (what a correct interpreter should return)."""
    metric = next(m for m in case.get("metrics_any", []) + case.get("metrics_all", []) if m in catalog.registry["metrics"])
    req = {"id": "r1", "goal": case["question"][:120], "metric_ids": [metric],
           "analysis_kind": case.get("operation", "aggregate"), "dimension_ids": case.get("dimensions", [])}
    if req["analysis_kind"] == "trend":
        req["granularity"] = case.get("granularity", "week")
    if req["analysis_kind"] == "ranking":
        if not req["dimension_ids"]:
            req["dimension_ids"] = [catalog.registry["subjects"][catalog.registry["metrics"][metric]["subjects"][0]]["default_dimension"]]
        req["ranking"] = {"limit": case.get("ranking_limit", 10), "metric_id": metric}
    time = case.get("time")
    if isinstance(time, dict):
        req["time"] = {"kind": "rolling", "amount": time["rolling"], "unit": time["unit"]}
    elif time in TIME_LABELS:
        mode = {"today": "current_day", "previous_day": "previous_day"}.get(time, time)
        req["time"] = {"kind": "relative", "mode": mode}
    if case.get("forecast"):
        req.update(forecast=case["forecast"], analysis_kind="trend", dimension_ids=[])
    return {"decision": "analyze", "requirements": [req]}


def compile_level2(case, catalog):
    from services.analysis_intent import AnalysisIntentEnvelope
    from services.analytical_resolver import AnalyticalResolver
    from services.analysis_catalog import AnalysisError
    try:
        resolved = AnalyticalResolver(catalog, REFERENCE).resolve(AnalysisIntentEnvelope.model_validate(oracle_intent(case, catalog)))
    except AnalysisError as error:
        return {"ok": False, "category": error.category}
    states = {c["state"] for c in resolved["coverage"]}
    profiles = catalog.registry["domain_intelligence"]["profiles"]
    subjects = {o["subject"] for o in resolved["operations"]}
    in_domain = not case.get("domain") or bool(subjects & set(profiles[case["domain"]]["primary_subjects"])) or bool(
        {m for o in resolved["operations"] for m in o["metrics"]} & set(case.get("metrics_any", [])))
    return {"ok": states == {"RESOLVED"} and bool(resolved["operations"]) and in_domain,
            "subjects": sorted(subjects), "states": sorted(states)}


V33_CASES = os.path.join(os.path.dirname(__file__), "semantic_cases_v33.json")
V33_COVERAGE = {"status": "ready", "overall": {"min_date": "2026-01-01", "max_date": "2026-10-16"}, "facts": {},
                "freshness": {"mode": "batch", "stale": False}}


def run_v33_cases(catalog):
    """V3.3 capability matrix through the real preflight (0 provider, 0 warehouse). Every case is recorded."""
    from datetime import date
    from services import preflight_service
    rows = []
    for case in json.load(open(V33_CASES))["cases"]:
        result = preflight_service.run(case["q"], None, case.get("scope"), case.get("mission"), date(2026, 10, 16),
                                       catalog=catalog, coverage=V33_COVERAGE)
        blocking = sorted(f["code"] for f in result["findings"] if f["level"] == "block")
        actual = result["capability"]["decision"]
        rows.append({"id": case["id"], "expected_decision": case["decision"], "actual_decision": actual,
                     "expected_codes": case["codes"], "blocking_codes": blocking,
                     "ok": actual == case["decision"] and set(case["codes"]) <= set(blocking) and result["can_submit"] == (actual == "READY"),
                     "provider_calls": result["provider_calls"], "warehouse_queries": result["warehouse_queries"]})
    return rows


def run_offline():
    from tests.analysis_fixtures import physical_metadata
    from services.analysis_catalog import AnalysisCatalog, AnalysisError
    from services.forecast_service import validate_request
    os.environ.setdefault("AI_OFFLINE", "1")
    cases = load_cases()
    catalog = AnalysisCatalog(physical_metadata())
    pipeline = offline_pipeline(); pipeline.catalog()
    errors = integrity(cases, catalog)
    rows = []
    for case in cases:
        row = {"id": case["id"], "status": case["status"], "category": case["category"]}
        if case["status"] in {"SUPPORTED", "FORECAST"}:
            row["retrieval"] = retrieval(case, pipeline, catalog)
            if not case.get("context_question"):
                row["compile"] = compile_level2(case, catalog)
        if case.get("preflight") or case.get("preflight_clean"):
            row["preflight"] = preflight_expectation(case, catalog)
        if case["status"] == "FORECAST_UNSUPPORTED":
            # Governed capability must reject the nearest plausible request.
            probe = tuple(case["probe"]) if case.get("probe") else {"fc_06": ("driver_rating", "month", 1), "fc_07": ("revenue", "day", 730), "fc_08": ("stock_quantity", "week", 1)}.get(case["id"])
            if probe:
                try:
                    validate_request(catalog, *probe); row["capability_rejected"] = False
                except AnalysisError as error:
                    row["capability_rejected"] = error.category in {"forecast_unsupported", "forecast_horizon_invalid"}
        rows.append(row)
    v33_rows = run_v33_cases(catalog)
    from evals.semantic_eval_v34 import run_cases as run_v34_cases
    v34=run_v34_cases(catalog)
    def rate(values):
        values = list(values)
        return {"passed": sum(values), "total": len(values), "rate": round(sum(values) / len(values), 4) if values else None}
    summary = {
        "v33_cases": rate(r["ok"] for r in v33_rows), "v33_rows": v33_rows,
        'v34_cases':rate(r['ok'] for r in v34['rows']),'v34_rows':v34['rows'],
        'v34_corpus_sha256':v34['corpus_sha256'],'v34_claim':v34['claim'],
        "mode": "offline", "measures_natural_language_understanding": False,
        "generated_at": datetime.now().astimezone().isoformat(), "registry_fingerprint": catalog.registry_fingerprint,
        "case_count": len(cases), "dataset_errors": errors,
        "categories": sorted({c["category"] for c in cases}),
        "retrieval_domain": rate(r["retrieval"]["domain_ok"] for r in rows if "retrieval" in r),
        "retrieval_metric": rate(r["retrieval"]["metric_ok"] for r in rows if "retrieval" in r),
        "regression_retrieval": rate(r["retrieval"]["metric_ok"] and r["retrieval"]["domain_ok"] for r, c in zip(rows, cases) if c.get("regression")),
        "compile_level2": rate(r["compile"]["ok"] for r in rows if "compile" in r),
        "forecast_capability_rejections": rate(r["capability_rejected"] for r in rows if "capability_rejected" in r),
        "max_context_chars": max((r["retrieval"]["context_chars"] for r in rows if "retrieval" in r), default=0),
        "preflight_expectations": rate(r["preflight"]["ok"] for r in rows if "preflight" in r),
        "unsupported_preflight": rate(r["preflight"]["ok"] for r, c in zip(rows, cases) if "preflight" in r and c["status"] == "UNSUPPORTED"),
        "failures": [r for r in rows if not all([r.get("retrieval", {}).get("domain_ok", True), r.get("retrieval", {}).get("metric_ok", True),
                                                 r.get("compile", {}).get("ok", True), r.get("capability_rejected", True),
                                                 r.get("preflight", {}).get("ok", True)])] + [r for r in v33_rows if not r["ok"]]+[r for r in v34['rows'] if not r['ok']],
    }
    summary["by_version"] = {}
    for version in sorted({c["version"] for c in cases}):
        picked = [(r, c) for r, c in zip(rows, cases) if c["version"] == version]
        summary["by_version"][version] = {"case_count": len(picked),
            "retrieval_domain": rate(r["retrieval"]["domain_ok"] for r, c in picked if "retrieval" in r),
            "retrieval_metric": rate(r["retrieval"]["metric_ok"] for r, c in picked if "retrieval" in r),
            "compile_level2": rate(r["compile"]["ok"] for r, c in picked if "compile" in r),
            "forecast_capability_rejections": rate(r["capability_rejected"] for r, c in picked if "capability_rejected" in r)}
    return summary


def expected_outcome(case, result):
    """Level 1: did the system reach the labelled capability state?"""
    status = result.get("status"); state = result.get("analysis_state"); category = result.get("error_category")
    intent = result.get("semantic_intent") or {}
    requested = [r for r in intent.get("requirements", []) if not r.get("supporting_for") and r.get("availability", "requested") == "requested"]
    metrics = {m for r in requested for m in r.get("metric_ids", [])}
    if case["status"] in {"SUPPORTED", "FORECAST"}:
        ok = status == "proposal_ready" and (not case.get("metrics_any") or bool(metrics & set(case["metrics_any"]))) and set(case.get("metrics_all", [])) <= metrics
        if case["status"] == "FORECAST":
            ok = ok and any(r.get("forecast") for r in requested)
        return ok
    if case["status"] == "AMBIGUOUS":
        return status == "needs_clarification" and state in {"SUPPORTED_BUT_NEEDS_CLARIFICATION", None}
    if case["status"] == "UNSUPPORTED":
        partial = any(c.get("status") != "planned" for c in result.get("analysis_components") or [])
        return state in {"UNSUPPORTED_CAPABILITY", "RESTRICTED"} or result.get("outcome") == "PARTIAL_AVAILABLE" and partial
    if case["status"] == "OUT_OF_SCOPE":
        return category == "not_analytical_request"
    if case["status"] == "FORECAST_UNSUPPORTED":
        return result.get("error_type") in {"FORECAST_UNAVAILABLE", "UNSUPPORTED_CAPABILITY"} or state == "UNSUPPORTED_CAPABILITY"
    return False


def run_live(selection, max_calls, execute):
    from common import AiTextToReportRequest
    from services.agent_pipeline import AnalysisPipeline
    from services.analysis_pipeline import safe_failure
    from services.agent_provider import NativeAgentProvider
    from services.llm_service import provider_configuration
    from services.analysis_catalog import AnalysisCatalog
    from services.metadata_service import get_local_metadata
    from services import hybrid_analyst_planner as planner
    cases = [c for c in load_cases() if (selection == "all" or c["id"] in SMOKE) and not c.get("context_question")]
    config = provider_configuration()
    configured = os.getenv("AI_OFFLINE", "0") != "1" and any(isinstance(v, dict) and v.get("configured") for v in (config.values() if isinstance(config, dict) else []))
    base = {"mode": "live", "selection": selection, "generated_at": datetime.now().astimezone().isoformat(), "case_count": len(cases)}
    if not configured:
        return {**base, "status": "NOT_RUN", "reason": "provider_not_configured_or_offline"}
    estimate = 2 * len(cases)
    print(f"[live] {len(cases)} cases, estimated provider calls <= {estimate} (budget {max_calls})")
    if estimate > max_calls:
        return {**base, "status": "NOT_RUN", "reason": "estimated_calls_exceed_budget", "estimated_calls": estimate}
    catalog = AnalysisCatalog(get_local_metadata(force=True))
    rows, used = [], 0
    for case in cases:
        if used + 2 > max_calls:
            rows.append({"id": case["id"], "skipped": "budget"}); continue
        pipeline = AnalysisPipeline(provider=NativeAgentProvider(), owner_id="semantic-eval")
        request = AiTextToReportRequest(prompt=case["question"])
        started = time.perf_counter()
        try:
            out = pipeline.propose(request)
            result = {"status": out["status"], "outcome": out.get("outcome"), "semantic_intent": out["diagnostics"].get("semantic_intent"),
                      "analysis_components": out["proposal"].get("analysis_components")}
            if execute and out["status"] == "proposal_ready":
                p = out["proposal"]
                approved = request.model_copy(update=dict(session_id=p["session_id"], proposal_revision=p["revision"],
                    intent_fingerprint=p["semantic_intent_fingerprint"], plan_fingerprint=p["resolved_plan_fingerprint"],
                    catalog_fingerprint=p["catalog_fingerprint"], accept_partial_scope=True))
                try:
                    report = AnalysisPipeline(provider=NativeAgentProvider(), owner_id="semantic-eval").generate(approved)
                    main = report["result_sets"][report["analytical_queries"][0]["id"]]
                    result["execution"] = {"status": report["status"], "rows": main["total_rows"], "preview": main["rows"][:3],
                                           "forecasts": [{k: f[k] for k in ("method", "history", "backtest")} | {"first": f["forecast"][:2]} for f in report.get("forecasts", [])]}
                except Exception as error:  # Typed failure after understanding.
                    result["execution"] = {"status": "failed", "error_type": safe_failure(error)["error_type"], "category": getattr(error, "category", None)}
        except Exception as error:
            failure = safe_failure(error, pipeline.calls, pipeline.semantic_info)
            result = {"status": failure["status"], "outcome": failure["outcome"], "analysis_state": failure["analysis_state"],
                      "error_type": failure["error_type"], "error_category": failure["diagnostics"]["error_category"],
                      "retryable": failure["retryable"], "semantic_intent": pipeline.semantic_info.get("semantic_intent")}
        calls = pipeline.semantic_info.get("provider_call_count", 0); used += calls
        rows.append({"id": case["id"], "category": case["category"], "expected": case["status"], "passed": expected_outcome(case, result),
                     "provider_calls": calls, "call_reasons": pipeline.semantic_info.get("provider_call_reasons", []),
                     "stop_reason": pipeline.semantic_info.get("semantic_stop_reason"), "latency_ms": round((time.perf_counter() - started) * 1000),
                     "result": result})
    done = [r for r in rows if "passed" in r]
    calls = [r["provider_calls"] for r in done]
    supported = [r for r in done if r["expected"] in {"SUPPORTED", "FORECAST"}]
    def rate(items):
        items = list(items)
        return {"passed": sum(items), "total": len(items), "rate": round(sum(items) / len(items), 4) if items else None}
    attempt = next((a for r in done for a in [] ), None)
    return {**base, "status": "RUN", "provider_calls_used": used, "budget": max_calls,
            "provider": {k: v for k, v in (config.items() if isinstance(config, dict) else []) if k != "api_key"},
            "registry_fingerprint": catalog.registry_fingerprint,
            "prompt_fingerprint": hashlib.sha256(planner.SYSTEM.encode()).hexdigest()[:16],
            "overall": rate(r["passed"] for r in done),
            "by_expected_status": {s: rate(r["passed"] for r in done if r["expected"] == s) for s in sorted({r["expected"] for r in done})},
            "supported_median_calls": statistics.median([r["provider_calls"] for r in supported]) if supported else None,
            "supported_p95_calls": sorted(r["provider_calls"] for r in supported)[max(0, int(0.95 * len(supported)) - 1)] if supported else None,
            "no_progress_stops": sum(r["stop_reason"] == "no_progress" for r in done),
            "max_calls_any_case": max(calls) if calls else None,
            "cases": rows}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["offline", "live"], default="offline")
    parser.add_argument("--cases", choices=["smoke", "all"], default="smoke")
    parser.add_argument("--max-calls", type=int, default=30)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--out")
    args = parser.parse_args()
    result = run_offline() if args.mode == "offline" else run_live(args.cases, args.max_calls, args.execute)
    OUT.mkdir(parents=True, exist_ok=True)
    path = Path(args.out) if args.out else OUT / f"semantic_{args.mode}{'_' + args.cases if args.mode == 'live' else ''}.json"
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2, default=str) + "\n")
    print(json.dumps({k: v for k, v in result.items() if k not in {"cases", "failures"}}, ensure_ascii=False, indent=1, default=str))
    print("written", path)


if __name__ == "__main__":
    main()
