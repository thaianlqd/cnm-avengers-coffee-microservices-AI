"""Compact offline V2.5 qualification. Never start the application or use live APIs."""

import argparse
import json
import os
import sys
from pathlib import Path
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from common import AiTextToReportRequest
from services.analysis_pipeline import safe_failure
from tests.archive_planner import ArchivedGraphPipeline as AnalysisPipeline
from services.analysis_catalog import AnalysisError
from services.agent_provider import NativeAgentProvider
from services.semantic_manifest_service import compact
from tests.analysis_fixtures import physical_metadata
from tests.test_agent_v22 import REFERENCE
from tests.test_agent_v23 import simple_query, fixture_executor
from tests.test_one_shot_v24 import scripted, decision, deep_sales_queries, deep_domain_queries
from tests.test_domain_v25 import comprehensive_queries


def qualify():
    cases = [
        ("focused_products", "focused", [simple_query()], "top 5 sản phẩm bán chạy nhất tại thành phố hồ chí minh"),
        ("deep_sales", "deep", deep_sales_queries(), "phân tích tình hình bán hàng giữa hai thành phố"),
        ("comprehensive_business", "comprehensive", comprehensive_queries(), "đánh giá toàn diện bán hàng, sản phẩm, voucher, thanh toán và đội ngũ shipper hiện tại"),
        *[("deep_" + subject, "deep", deep_domain_queries(subject), "phân tích " + subject) for subject in ("payments", "inventory", "customers")],
        ("focused_peer_sales", "focused", [{"id": "peer", "subject": "orders", "operation": "aggregate", "metrics": ["revenue"], "group_by": ["store"]}], "so sánh doanh thu các chi nhánh trong cùng phạm vi"),
    ]
    records = []
    for name, depth, queries, question in cases:
        p = AnalysisPipeline(metadata_loader=physical_metadata, provider=scripted(decision(queries)), executor=fixture_executor(queries), value_lookup=Mock(return_value=[]))
        req = AiTextToReportRequest(prompt=question, analysis_depth=depth, domain="multi" if depth == "comprehensive" else "auto", reference_date=REFERENCE)
        proposal = p.propose(req); assert p.executor.call_count == 0
        d = proposal["diagnostics"]
        native = NativeAgentProvider(); request = p.provider.requests[0]
        sizes = {"native": len(compact(native._gemini_body(**request))), "compat": len(compact(native._gemini_compat_body(**request, model="configured_model")))}
        assert max(sizes.values()) == d["total_context_chars"] and max(sizes.values()) <= d["context_char_budget"]
        req.session_id = proposal["session_id"]; report = p.generate(req)
        assert p.provider.call_count == 1 and report["diagnostics"]["provider_call_count"] == 0
        records.append({"scenario": name, "depth": depth, "status": report["status"], "provider_calls": p.provider.call_count, "approval_provider_calls": 0,
            "provider_input_tokens": d["input_tokens"], "provider_output_tokens": d["output_tokens"],
            "context": {**sizes, **{key: d[key] for key in ("system_chars", "question_ui_chars", "session_state_chars", "semantic_manifest_chars", "semantic_manifest_complete", "decision_schema_chars", "global_domain_count", "global_domain_directory_chars", "detailed_domain_ids", "detailed_domain_pack_chars", "domain_context_chars", "total_context_chars", "context_char_budget")}},
            "requested_operations": d["requested_operation_count"], "supporting_operations": d["supporting_operation_count"], "omitted_supports": d["omitted_supporting_operation_count"],
            "proposal_analytical_queries": 0, "approval_db_queries": p.executor.call_count,
            "chart_count": len(report["charts"]), "chart_families": list(dict.fromkeys(c["chart_type"] for c in report["charts"])),
            "domain_count": len(report["domain_summary"]), "evidence_count": len(report["evidence"]), "peer_evidence_count": sum(e["feature"] == "peer_gap" for e in report["evidence"]), "depth_coverage": report["diagnostics"]["depth_coverage"]})
    q = {"id": "delivery", "subject": "delivery", "operation": "aggregate", "metrics": ["total_deliveries"], "time": {"kind": "relative", "mode": "current_month"}}
    p = AnalysisPipeline(metadata_loader=physical_metadata, provider=scripted(decision([q])), executor=Mock(), value_lookup=Mock())
    try:
        p.propose(AiTextToReportRequest(prompt="phân tích đội ngũ shipper trong tháng này", reference_date=REFERENCE, domain="delivery"))
        raise AssertionError("Snapshot history must be unsupported")
    except AnalysisError as error:
        failure = safe_failure(error, p.calls, p.semantic_info)
    assert failure["diagnostics"]["error_category"] == "historical_metric_unavailable"
    p.executor.assert_not_called()
    records.append({"scenario": "delivery_history_unavailable", "status": failure["status"], "category": failure["diagnostics"]["error_category"], "provider_calls": p.provider.call_count, "proposal_analytical_queries": 0})
    return records


def main():
    parser = argparse.ArgumentParser(); parser.add_argument("--output", type=Path, default=ROOT / "docs/V25_QUALIFICATION.json"); args = parser.parse_args()
    with patch.dict(os.environ, {"AI_OFFLINE": "1", "DATA_ANALYST_SEMANTIC_MANIFEST_MAX_CHARS": "10000", "DATA_ANALYST_ONE_SHOT_CONTEXT_MAX_CHARS": "24000"}), patch("requests.sessions.Session.request", side_effect=AssertionError("Offline transport denied")), patch("psycopg2.connect", side_effect=AssertionError("Offline warehouse denied")):
        records = qualify()
    payload = {"pipeline_version": "2.5", "real_provider_calls": 0, "real_embedding_calls": 0, "live_db_mutations": 0, "live_db_queries": 0,
        "note": "Scripted decisions and synthetic result rows qualify contracts/orchestration. They do not establish live language accuracy, latency or token cost. Token fields remain null when unreported.", "scenarios": records}
    args.output.parent.mkdir(parents=True, exist_ok=True); args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print(f"{len(records)} offline scenarios passed; output={args.output}")


if __name__ == "__main__":
    main()
