"""Offline V2.5.1 evidence; never start services or contact providers/warehouse."""

import argparse
import json
import os
import sys
from pathlib import Path
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from common import AiTextToReportRequest
from services.analysis_pipeline import AnalysisPipeline, safe_failure
from services.analysis_catalog import AnalysisError
from services.agent_provider import NativeAgentProvider
from services.semantic_manifest_service import compact
from tests.analysis_fixtures import physical_metadata
from tests.test_agent_v22 import REFERENCE
from tests.test_agent_v23 import simple_query, fixture_executor
from tests.test_one_shot_v24 import decision, scripted, deep_sales_queries, deep_domain_queries
from tests.test_contract_v251 import LIVE_QUESTION, LIVE_DOMAINS, live_queries


def voucher_queries():
    scope = {"filters": [{"dimension": "city", "value": "Hồ Chí Minh"}], "time": {"kind": "relative", "mode": "current_month"}}
    definitions = [("aggregate", ["voucher_order_count"], ["promotion"]),
                   ("aggregate", ["voucher_revenue"], ["promotion"]),
                   ("aggregate", ["discount_amount"], ["promotion"]),
                   ("trend", ["voucher_order_count"], []),
                   ("aggregate", ["voucher_order_count"], ["store"])]
    queries = []
    for i, (operation, metrics, groups) in enumerate(definitions):
        q = {"id": "voucher_" + str(i), "subject": "promotions", "operation": operation, "metrics": metrics, "group_by": groups, **scope}
        if i: q.update(role="supporting", parent_id="voucher_0", purpose="context")
        if i in (1, 2): q["population_relation"] = "related"
        if operation == "trend": q["granularity"] = "week"
        queries.append(q)
    return queries


def qualify():
    deep = deep_sales_queries()
    for q in deep: q["time"] = {"kind": "relative", "mode": "current_month"}
    payments = deep_domain_queries("payments")
    for q in payments: q["time"] = {"kind": "relative", "mode": "previous_quarter"}
    cases = [
        ("exact_live_filter", "comprehensive", "multi", "previous_quarter", LIVE_QUESTION, [live_queries(True)[0]], [live_queries()[0]]),
        ("exact_live_six_requested", "comprehensive", "multi", "previous_quarter", LIVE_QUESTION, live_queries(True), live_queries()),
        ("focused_products", "focused", "auto", "auto", "Top 5 sản phẩm bán chạy nhất tại thành phố Hồ Chí Minh.", [simple_query()], [simple_query()]),
        ("deep_orders", "deep", "orders", "current_month", "Phân tích đơn hàng TP.HCM tháng này.", deep, deep),
        ("deep_vouchers", "deep", "promotions", "current_month", "Phân tích tình hình sử dụng voucher tại TP.HCM tháng này: voucher nào được dùng nhiều, doanh thu từ đơn có voucher, tiền giảm, xu hướng và chi nhánh sử dụng nhiều.", voucher_queries(), voucher_queries()),
        ("deep_payments", "deep", "payments", "previous_quarter", "Phân tích cơ cấu và xu hướng thanh toán quý trước.", payments, payments),
    ]
    records = []
    context_keys = ("semantic_manifest_chars", "decision_schema_chars", "domain_context_chars", "system_chars", "question_ui_chars", "session_state_chars", "total_context_chars", "context_char_budget", "provider_body_headroom_chars", "strong_domain_candidates", "full_domain_pack_ids", "compact_domain_pack_ids", "directory_only_domain_ids", "pruned_optional_domain_ids", "global_domain_count")
    for name, depth, domain, time, question, wire, canonical in cases:
        p = AnalysisPipeline(metadata_loader=physical_metadata, provider=scripted(decision(wire)), executor=fixture_executor(canonical), value_lookup=Mock(return_value=[]))
        req = AiTextToReportRequest(prompt=question, domain=domain, analysis_depth=depth, time_range={"mode": time}, reference_date=REFERENCE)
        proposal = p.propose(req); p.executor.assert_not_called()
        d = proposal["diagnostics"]
        request = p.provider.requests[0]
        native = NativeAgentProvider()
        sizes = {"native": len(compact(native._gemini_body(**request))), "compat": len(compact(native._gemini_compat_body(**request, model="configured_model")))}
        assert sizes == d["provider_body_chars"] and max(sizes.values()) <= d["context_char_budget"]
        if name.startswith("exact_live"):
            assert LIVE_DOMAINS <= set(d["full_domain_pack_ids"] + d["compact_domain_pack_ids"])
            assert d["contract_rejection_count"] == 0 and d["provider_body_headroom_chars"] >= 2000
        req.session_id = proposal["session_id"]
        report = p.generate(req)
        assert p.provider.call_count == 1 and report["diagnostics"]["provider_call_count"] == 0
        for key in ("contract_repair_count", "provider_fallback_count", "model_escalation_count", "post_result_provider_call_count"):
            assert d[key] == 0
        records.append({"scenario": name, "depth": depth, "domain": domain, "time": time,
                        "proposal_status": proposal["status"], "report_status": report["status"],
                        "provider_calls": p.provider.call_count, "approval_provider_calls": 0,
                        "input_tokens": d["input_tokens"], "output_tokens": d["output_tokens"],
                        "contract_normalization_count": d["contract_normalization_count"], "contract_normalizations": d["contract_normalizations"],
                        "context": {"provider_body_chars": sizes, **{k: d[k] for k in context_keys}},
                        "requested_operations": d["requested_operation_count"], "supporting_operations": d["supporting_operation_count"],
                        "proposal_db_queries": 0, "approval_synthetic_queries": p.executor.call_count,
                        "chart_count": len(report["charts"]), "chart_families": sorted({c["chart_type"] for c in report["charts"]}),
                        "evidence_count": len(report["evidence"]), "depth_coverage": report["diagnostics"]["depth_coverage"]})
    q = {"id": "delivery", "subject": "delivery", "operation": "trend", "metrics": ["total_deliveries"], "granularity": "week", "time": {"kind": "relative", "mode": "current_month"}}
    p = AnalysisPipeline(metadata_loader=physical_metadata, provider=scripted(decision([q])), executor=Mock(), value_lookup=Mock(return_value=[]))
    try:
        p.propose(AiTextToReportRequest(prompt="Phân tích xu hướng hiệu suất shipper tháng này.", domain="delivery", reference_date=REFERENCE, time_range={"mode": "current_month"}))
        raise AssertionError("Snapshot cannot offer history")
    except AnalysisError as error:
        failure = safe_failure(error, p.calls, p.semantic_info)
    p.executor.assert_not_called()
    assert failure["diagnostics"]["error_category"] == "historical_metric_unavailable"
    records.append({"scenario": "delivery_history_safety", "status": failure["status"], "category": failure["diagnostics"]["error_category"], "provider_calls": p.provider.call_count, "proposal_db_queries": 0})
    return records


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "docs/V251_QUALIFICATION.json")
    args = parser.parse_args()
    with patch.dict(os.environ, {"AI_OFFLINE": "1", "DATA_ANALYST_SEMANTIC_MANIFEST_MAX_CHARS": "10000", "DATA_ANALYST_ONE_SHOT_CONTEXT_MAX_CHARS": "24000"}), patch("services.llm_service.GEMINI_MODELS", ["configured_model"]), patch("requests.sessions.Session.request", side_effect=AssertionError("Offline transport denied")), patch("psycopg2.connect", side_effect=AssertionError("Offline warehouse denied")):
        records = qualify()
    payload = {"pipeline_version": "2.5.1", "reference_date": str(REFERENCE), "real_provider_calls": 0, "real_embedding_calls": 0, "live_db_queries": 0, "live_db_mutations": 0,
               "note": "Scripted meaning and synthetic results verify contracts and orchestration, not live language accuracy or provider token cost. Both adapter bodies are serialized with a fixed fixture model ID; production measures the configured primary model ID. Token counts remain null when unreported.", "scenarios": records}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print(f"{len(records)} offline V2.5.1 scenarios passed; output={args.output}")


if __name__ == "__main__":
    main()
