"""V3.0 semantic truth: governed delivery fact, fail-fast repair, typed failures.

Offline only. Scripted providers test contract/budget/server behavior; they do
not measure natural-language understanding (see evals/semantic_eval_v30).
"""
import json
import os
import unittest
from copy import deepcopy
from datetime import date
from unittest.mock import Mock, patch
from common import AiTextToReportRequest
from services.analysis_pipeline import AnalysisPipeline, safe_failure
from services.analysis_catalog import AnalysisCatalog, AnalysisError, CATALOG_PATH
from services.semantic_catalog_validation import validate_catalog, registry_drift
from services.error_taxonomy import classify
from tests.agent_fixtures import ScriptedProvider, call
from tests.analysis_fixtures import physical_metadata
from evals.fixture_warehouse import FixtureWarehouse

REFERENCE = date(2026, 10, 15)
SHIPPER_QUESTIONS = [
    "Tỷ lệ giao hàng thành công của shipper ở trong hệ thống",
    "Tỷ lệ shipper giao thành công là bao nhiêu?",
    "Giao hàng của shipper thành công bao nhiêu phần trăm?",
    "Tỷ lệ giao thành công hiện tại",
    "Hiệu suất giao hàng của shipper",
    "Các shipper giao hàng thành công thế nào?",
]
# Independent fixture: d1 3 delivered + 1 cancelled, d2 1 delivered + 1 failed,
# d3 3 delivered + 1 in transit (not terminal, excluded from the denominator).
DELIVERIES = [("g1", "d1", "DELIVERED"), ("g2", "d1", "DELIVERED"), ("g3", "d1", "DELIVERED"), ("g4", "d1", "CANCELLED"),
              ("g5", "d2", "DELIVERED"), ("g6", "d2", "FAILED"), ("g7", "d3", "DELIVERED"), ("g8", "d3", "DELIVERED"),
              ("g9", "d3", "IN_TRANSIT"), ("g10", "d3", "DELIVERED")]


def oracle_rate(rows, shipper=None):
    """Separately authored definition: delivered / terminal assignments."""
    rows = [r for r in rows if shipper is None or r[1] == shipper]
    terminal = [r for r in rows if r[2] in {"DELIVERED", "FAILED", "CANCELLED"}]
    return round(100.0 * sum(r[2] == "DELIVERED" for r in terminal) / len(terminal), 2)


def requirement(**updates):
    base = dict(id="r1", goal="Tỷ lệ giao thành công", metric_ids=["delivery_success_rate"],
                analysis_kind="aggregate", dimension_ids=[])
    base.update(updates)
    return base


def envelope(*requirements, **updates):
    return {"decision": "analyze", "requirements": list(requirements) or [requirement()], **updates}


def scripted(*envelopes):
    return ScriptedProvider(*[[call("submit_analysis_intent", e)] for e in envelopes])


class DeliveryWarehouse(FixtureWarehouse):
    def __init__(self, overlay):
        super().__init__(overlay)
        self.connection.execute("PRAGMA query_only=OFF")
        for id, shipper, status in DELIVERIES:
            self.connection.execute("INSERT INTO silver.giao_hang (ma_giao_hang, ma_shipper, trang_thai_giao_hang, thoi_gian_nhan_chuyen) VALUES (?,?,?,?)",
                                    (id, shipper, status, "2026-09-15T10:00:00"))
        self.connection.commit()
        self.connection.execute("PRAGMA query_only=ON")


class SemanticTruthV30Tests(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch.dict(os.environ, {"AI_OFFLINE": "1", "DATA_ANALYST_ENV": "development",
            "DATA_ANALYST_SESSION_STORE": "memory", "DATA_ANALYST_ARTIFACT_STORE": "memory",
            "DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN": "3", "DATA_ANALYST_ENABLE_CONTRACT_REPAIR": "1",
            "DATA_ANALYST_ONE_SHOT_CONTEXT_MAX_CHARS": "24000"}))
        for target in ("requests.sessions.Session.request", "psycopg2.connect"):
            self.enterContext(patch(target, side_effect=AssertionError("External transport forbidden")))
        self.overlay = json.loads(CATALOG_PATH.read_text())
        self.catalog = AnalysisCatalog(physical_metadata())

    def pipeline(self, provider, executor=None):
        return AnalysisPipeline(metadata_loader=physical_metadata, provider=provider, executor=executor or Mock(),
                                value_lookup=Mock(return_value=[]), owner_id="owner-a")

    def request(self, question):
        return AiTextToReportRequest(question=question, reference_date=REFERENCE)

    def report(self, provider, question, warehouse):
        p = self.pipeline(provider, warehouse)
        proposal = p.propose(self.request(question))
        self.assertEqual(proposal["status"], "proposal_ready", proposal.get("message"))
        pr = proposal["proposal"]
        approved = self.request(question)
        approved.session_id = pr["session_id"]; approved.proposal_revision = pr["revision"]
        approved.intent_fingerprint = pr["semantic_intent_fingerprint"]; approved.plan_fingerprint = pr["resolved_plan_fingerprint"]
        approved.catalog_fingerprint = pr["catalog_fingerprint"]
        return p, proposal, self.pipeline(provider, warehouse).generate(approved)

    # --- Registry truth -------------------------------------------------

    def test_delivery_fact_is_governed_complete_population(self):
        r = self.catalog.registry
        self.assertEqual(self.overlay["silver_tables"]["silver.giao_hang"]["source_scope"], "FULL_FACT")
        metric = r["metrics"]["delivery_success_rate"]
        self.assertEqual(metric["source"], "silver.giao_hang")
        self.assertEqual(metric["aggregation_semantics"], "ratio")
        self.assertFalse(metric["additive"])
        self.assertEqual(metric["value_range"], [0, 100])
        self.assertEqual(metric["business_filters"][0]["value"], ["DELIVERED", "FAILED", "CANCELLED"])
        mart = r["presentation_marts"]["gold.shipper_performance"]
        self.assertEqual((mart["source_scope"], mart["top_n"], mart["global_aggregate_safe"]), ("TOP_N_MART", 20, False))
        delivery = r["domain_intelligence"]["profiles"]["delivery"]
        self.assertIn("delivery_success_rate", delivery["metric_refs"])
        self.assertNotIn("không có ngày chuyến", delivery["short_business_purpose"])

    def test_privacy_columns_are_not_exposed_by_delivery_view(self):
        columns = set(self.overlay["silver_tables"]["silver.giao_hang"]["columns"])
        self.assertFalse(columns & {"delivery_address", "dia_chi_giao_hang", "delivery_note", "proof_image_url",
                                    "delivery_latitude", "delivery_longitude", "pickup_latitude", "pickup_longitude"})

    def test_registry_validation_rejects_semantic_drift(self):
        def broken(change):
            overlay = deepcopy(self.overlay); change(overlay)
            with self.assertRaises(AnalysisError) as caught:
                validate_catalog(overlay, strict=True)
            self.assertEqual(caught.exception.category, "domain_metadata_invalid")
        r = lambda o: o["analysis_registry"]
        broken(lambda o: r(o)["presentation_marts"]["gold.shipper_performance"].update(global_aggregate_safe=True))
        broken(lambda o: r(o)["presentation_marts"]["gold.shipper_performance"].pop("top_n"))
        broken(lambda o: o["silver_tables"]["silver.giao_hang"].update(source_scope="TOP_N_MART"))
        broken(lambda o: o["silver_tables"]["silver.giao_hang"].pop("source_scope"))
        broken(lambda o: r(o)["metrics"]["delivery_success_rate"].update(additive=True))
        broken(lambda o: r(o)["metrics"]["delivery_success_rate"].pop("value_range"))
        broken(lambda o: r(o)["metrics"]["delivery_success_rate"].update(expression="AVG(silver.missing_table.x)"))
        broken(lambda o: r(o)["metrics"]["delivery_count"].update(time_column="silver.danh_gia_san_pham.ngay_tao"))
        broken(lambda o: r(o)["metrics"]["total_deliveries"].update(time_column="silver.shipper.ma_shipper"))
        broken(lambda o: r(o)["metrics"]["delivery_count"].update(subjects=["unknown_subject"]))
        broken(lambda o: r(o)["metrics"]["delivery_count"].update(compatible_dimensions=["unknown_dimension"]))
        self.assertTrue(validate_catalog(deepcopy(self.overlay), strict=True))

    def test_physical_drift_is_detected(self):
        self.assertEqual(registry_drift(self.catalog), [])
        physical = physical_metadata()
        physical["table_map"]["silver.giao_hang"]["columns"] = [c for c in physical["table_map"]["silver.giao_hang"]["columns"]
                                                                if c["name"] != "trang_thai_giao_hang"]
        drift = registry_drift(AnalysisCatalog(physical))
        self.assertIn({"kind": "metric", "id": "delivery_success_rate", "code": "missing_column",
                       "table": "silver.giao_hang", "column": "trang_thai_giao_hang"}, drift)
        del physical["table_map"]["silver.giao_hang"]
        self.assertTrue(any(i["code"] == "missing_table" for i in registry_drift(AnalysisCatalog(physical))))

    # --- Required regression: shipper success rate ----------------------

    def test_shipper_success_rate_uses_complete_fact_and_matches_oracle(self):
        for question in SHIPPER_QUESTIONS:
            with self.subTest(question=question):
                warehouse = DeliveryWarehouse(self.overlay)
                provider = scripted(envelope())
                p, proposal, report = self.report(provider, question, warehouse)
                self.assertEqual(provider.call_count, 1)
                self.assertEqual(proposal["diagnostics"]["provider_call_reasons"], ["INITIAL_UNDERSTANDING"])
                self.assertEqual(report["status"], "success")
                sql = report["sql_query"]
                self.assertIn("silver.giao_hang", sql); self.assertNotIn("gold.", sql)
                self.assertIn("'DELIVERED', 'FAILED', 'CANCELLED'", sql)
                main = report["result_sets"][report["analytical_queries"][0]["id"]]
                self.assertEqual(main["rows"], [{"delivery_success_rate": oracle_rate(DELIVERIES)}])
                self.assertEqual(oracle_rate(DELIVERIES), 77.78)
                self.assertEqual(report["provenance"]["registry_fingerprint"], self.catalog.registry_fingerprint)
                warehouse.close()

    def test_per_shipper_breakdown_groups_by_shipper_and_matches_oracle(self):
        warehouse = DeliveryWarehouse(self.overlay)
        provider = scripted(envelope(requirement(dimension_ids=["driver_id"])))
        _, _, report = self.report(provider, "Tỷ lệ giao thành công của từng shipper", warehouse)
        rows = report["result_sets"][report["analytical_queries"][0]["id"]]["rows"]
        self.assertEqual({r["driver_id"]: r["delivery_success_rate"] for r in rows},
                         {s: oracle_rate(DELIVERIES, s) for s in ("d1", "d2", "d3")})
        warehouse.close()

    def test_top_n_mart_value_would_differ_from_complete_population(self):
        # Documents why the TOP_N mart cannot answer a global aggregate: a
        # Top-2-by-completed mart (like gold.shipper_performance) is biased.
        completed = {s: sum(r[1] == s and r[2] == "DELIVERED" for r in DELIVERIES) for s in ("d1", "d2", "d3")}
        top = sorted(completed, key=lambda s: -completed[s])[:2]
        self.assertEqual(oracle_rate([r for r in DELIVERIES if r[1] in top]), 85.71)
        self.assertEqual(oracle_rate(DELIVERIES), 77.78)

    # --- Fail-fast, progress-aware repair --------------------------------

    def test_unknown_metric_repeated_stops_after_one_repair_as_unsupported(self):
        bad = envelope(requirement(goal="Chỉ số hạnh phúc", metric_ids=["customer_happiness_index"]))
        provider = scripted(bad, bad, envelope())
        p = self.pipeline(provider)
        with self.assertRaises(AnalysisError) as caught:
            p.propose(self.request("Chỉ số hạnh phúc của khách hàng"))
        self.assertEqual(provider.call_count, 2)
        self.assertEqual(caught.exception.category, "unsupported_metric")
        self.assertEqual(p.semantic_info["semantic_stop_reason"], "unknown_capability")
        self.assertEqual(p.semantic_info["provider_call_reasons"], ["INITIAL_UNDERSTANDING", "CONTRACT_REPAIR"])
        failure = safe_failure(caught.exception, p.calls, p.semantic_info)
        self.assertEqual((failure["error_type"], failure["analysis_state"], failure["retryable"]),
                         ("UNSUPPORTED_CAPABILITY", "UNSUPPORTED_CAPABILITY", False))
        self.assertEqual(failure["outcome"], "UNSUPPORTED")
        self.assertFalse(any(a["type"] == "retry" for a in failure["issue"]["suggested_actions"]))
        self.assertNotIn("khôi phục kết nối", json.dumps(failure, ensure_ascii=False))
        p.executor.assert_not_called()

    def test_renamed_unknown_concept_is_not_progress(self):
        first = envelope(requirement(metric_ids=["delivery_success_ratio"]))
        renamed = envelope(requirement(metric_ids=["delivery_success_percentage"]))
        provider = scripted(first, renamed, envelope())
        p = self.pipeline(provider)
        with self.assertRaises(AnalysisError) as caught:
            p.propose(self.request("Chỉ số giao hàng xuất sắc"))
        self.assertEqual(provider.call_count, 2)
        self.assertEqual(caught.exception.category, "unsupported_metric")
        self.assertEqual(p.semantic_info["unsupported_concepts"], ["delivery_success_percentage", "delivery_success_ratio"])

    def test_supported_concept_with_invented_ids_is_understanding_failure(self):
        # The question names a governed metric; repeated invented IDs are a
        # model understanding failure, never "unsupported capability".
        bad = envelope(requirement(metric_ids=["delivery_success_ratio"]))
        provider = scripted(bad, bad, envelope())
        p = self.pipeline(provider)
        with self.assertRaises(AnalysisError) as caught:
            p.propose(self.request("Tỷ lệ giao thành công hiện tại"))
        self.assertEqual(provider.call_count, 2)
        self.assertEqual(caught.exception.category, "semantic_resolution_failed")
        self.assertEqual(safe_failure(caught.exception, p.calls, p.semantic_info)["analysis_state"], "UNDERSTANDING_FAILURE")

    def test_unsupported_failure_offers_related_supported_capabilities(self):
        provider = scripted(envelope(requirement(metric_ids=["shipper_salary"])), envelope(requirement(metric_ids=["shipper_salary"])))
        p = self.pipeline(provider)
        with self.assertRaises(AnalysisError) as caught:
            p.propose(self.request("Lương trung bình của shipper"))
        labels = [c["label"] for c in caught.exception.choices]
        self.assertTrue(labels)
        failure = safe_failure(caught.exception, p.calls, p.semantic_info)
        self.assertTrue(any(a["type"] == "followup" for a in failure["issue"]["suggested_actions"]))

    def test_model_declared_unsupported_uses_one_call(self):
        declared = {"decision": "unsupported", "requirements": [],
                    "clarification": {"reason": "unsupported_metric", "missing_fields": ["metric_ids"]}}
        provider = scripted(declared)
        p = self.pipeline(provider)
        with self.assertRaises(AnalysisError) as caught:
            p.propose(self.request("Lợi nhuận ròng sau thuế của chuỗi"))
        self.assertEqual(provider.call_count, 1)
        self.assertEqual(caught.exception.category, "unsupported_metric")
        self.assertEqual(classify(caught.exception.category)["retryable"], False)

    def test_unsupported_decision_without_clarification_is_not_repaired(self):
        # Live regression: the model correctly declared "unsupported" but omitted
        # the clarification object; that must not cost a repair call.
        for raw, code in [({"decision": "unsupported", "requirements": []}, "unsupported_metric"),
                          ({"decision": "unsupported", "requirements": [requirement(metric_ids=["driver_rating"], analysis_kind="trend",
                                                                                   forecast={"horizon": 1, "unit": "month"})]}, "forecast_unsupported")]:
            with self.subTest(code=code):
                provider = scripted(raw, envelope())
                p = self.pipeline(provider)
                with self.assertRaises(AnalysisError) as caught:
                    p.propose(self.request("Dự báo điểm đánh giá shipper tháng sau"))
                self.assertEqual(provider.call_count, 1)
                self.assertEqual(caught.exception.category, code)
                self.assertEqual(safe_failure(caught.exception, p.calls, p.semantic_info)["analysis_state"], "UNSUPPORTED_CAPABILITY")

    def test_metric_ambiguity_is_one_concrete_clarification_with_choices(self):
        raw = {"decision": "clarification", "requirements": [],
               "clarification": {"reason": "metric_ambiguous", "missing_fields": ["metric_ids"]}}
        provider = scripted(raw)
        p = self.pipeline(provider)
        with self.assertRaises(AnalysisError) as caught:
            p.propose(self.request("Chi nhánh nào ngon nhất?"))
        self.assertEqual(provider.call_count, 1)
        failure = safe_failure(caught.exception, p.calls, p.semantic_info)
        self.assertEqual((failure["status"], failure["analysis_state"], failure["retryable"]),
                         ("needs_clarification", "SUPPORTED_BUT_NEEDS_CLARIFICATION", False))
        self.assertTrue([a for a in failure["issue"]["suggested_actions"] if a["type"] == "followup"])

    def test_repeated_semantic_issue_stops_without_third_call(self):
        wrong = envelope(requirement(goal="Doanh thu", metric_ids=["aov"], dimension_ids=["city"]))
        provider = scripted(wrong, wrong, wrong)
        p = self.pipeline(provider)
        with self.assertRaises(AnalysisError) as caught:
            p.propose(self.request("Doanh thu theo thành phố"))
        self.assertEqual(provider.call_count, 2)
        # V3.2 §31: "doanh thu" is a preflight-locked canonical metric, so the
        # repeated omission is typed as semantic contract drift (still no retry).
        self.assertEqual(caught.exception.category, "semantic_contract_drift")
        self.assertEqual(p.semantic_info["semantic_stop_reason"], "no_progress")
        failure = safe_failure(caught.exception, p.calls, p.semantic_info)
        self.assertEqual(failure["error_type"], "SEMANTIC_CONTRACT_DRIFT")
        self.assertFalse(failure["retryable"])
        self.assertNotIn("khôi phục kết nối", json.dumps(failure, ensure_ascii=False))

    def test_semantic_repair_limit_is_configurable_and_bounded(self):
        bad = envelope(requirement(metric_ids=["unknown_a"]))
        with patch.dict(os.environ, {"DATA_ANALYST_MAX_SEMANTIC_REPAIRS": "0"}):
            provider = scripted(bad, envelope())
            p = self.pipeline(provider)
            with self.assertRaises(AnalysisError) as caught:
                p.propose(self.request("Chỉ số giao hàng xuất sắc"))
            self.assertEqual(provider.call_count, 1)
            # Review V3.0: without a repair turn an unknown ID may be a typo of a
            # governed metric, so it is not claimed unsupported.
            self.assertEqual(caught.exception.category, "semantic_resolution_failed")
        with patch.dict(os.environ, {"DATA_ANALYST_MAX_SEMANTIC_REPAIRS": "7"}):
            with self.assertRaises(AnalysisError) as caught:
                self.pipeline(scripted(bad)).propose(self.request("Tỷ lệ giao thành công"))
            self.assertEqual(caught.exception.category, "provider_policy")

    def test_successful_repair_with_progress_still_completes(self):
        provider = scripted(envelope(requirement(metric_ids=["delivery_success_ratio"])), envelope())
        p = self.pipeline(provider)
        proposal = p.propose(self.request("Tỷ lệ giao thành công"))
        self.assertEqual(proposal["status"], "proposal_ready")
        self.assertEqual(provider.call_count, 2)
        self.assertEqual(proposal["diagnostics"]["provider_call_reasons"], ["INITIAL_UNDERSTANDING", "CONTRACT_REPAIR"])

    def test_fixing_one_of_two_unknown_metrics_is_progress(self):
        provider = scripted(envelope(requirement(metric_ids=["delivery_cnt", "delivered_cnt"])),
                            envelope(requirement(metric_ids=["delivery_count", "delivered_cnt"])),
                            envelope(requirement(metric_ids=["delivery_count", "delivered_count"])))
        p = self.pipeline(provider)
        proposal = p.propose(self.request("Số chuyến giao và số chuyến giao thành công"))
        self.assertEqual(proposal["status"], "proposal_ready")
        self.assertEqual(provider.call_count, 3)
        self.assertEqual(p.semantic_info["semantic_unknown_id_counts"], [2, 1])

    def test_nested_transport_attempts_are_retryable_provider_failures(self):
        failure = safe_failure(AnalysisError("provider_transport_nested", "fixture"), [], {})
        self.assertEqual((failure["error_type"], failure["analysis_state"], failure["retryable"]),
                         ("PROVIDER_UNAVAILABLE", "PROVIDER_FAILURE", True))
        self.assertNotIn("không giúp ích", json.dumps(failure, ensure_ascii=False))

    # --- Typed failure taxonomy --------------------------------------------

    def test_budget_exhaustion_is_not_reported_as_provider_connectivity(self):
        failure = safe_failure(AnalysisError("provider_call_budget_exceeded", "fixture"), [], {"semantic_issue_history": [[{}]]})
        self.assertEqual(failure["error_type"], "SEMANTIC_RESOLUTION_FAILED")
        self.assertEqual(failure["diagnostics"]["provider_status"], "not_started")
        self.assertIsNone(failure["diagnostics"]["provider_error_category"])
        self.assertNotEqual(failure["failure"]["stage"], "PROVIDER_TRANSPORT")
        self.assertNotIn("khôi phục kết nối", json.dumps(failure, ensure_ascii=False))
        self.assertFalse(any(a["type"] == "retry" for a in failure["issue"]["suggested_actions"]))

    def test_only_transient_provider_failures_offer_retry(self):
        cases = {"provider_timeout": True, "provider_connection": True, "provider_rate_limited": True,
                 "provider_auth": False, "provider_daily_quota": False, "unsupported_metric": False,
                 "insufficient_data": False, "historical_metric_unavailable": False, "privacy": False,
                 "semantic_resolution_failed": False, "execution": False, "one_shot_context_budget_exceeded": False}
        for category, retryable in cases.items():
            with self.subTest(category=category):
                failure = safe_failure(AnalysisError(category, "fixture"))
                self.assertEqual(failure["retryable"], retryable)
                self.assertEqual(failure["failure"]["retry_helps"], retryable)
                self.assertEqual(any(a["type"] == "retry" for a in failure["issue"]["suggested_actions"]), retryable)

    def test_error_states_cover_plan_taxonomy(self):
        expected = {"unsupported_metric": "UNSUPPORTED_CAPABILITY", "metric_ambiguous": "SUPPORTED_BUT_NEEDS_CLARIFICATION",
                    "insufficient_data": "INSUFFICIENT_DATA", "privacy": "RESTRICTED", "provider_timeout": "PROVIDER_FAILURE",
                    "execution": "EXECUTION_FAILURE", "result_contract": "EXECUTION_FAILURE",
                    "not_analytical_request": "UNSUPPORTED_CAPABILITY", "forecast_insufficient_history": "INSUFFICIENT_DATA"}
        for category, state in expected.items():
            self.assertEqual(classify(category)["analysis_state"], state, category)
        self.assertEqual(classify("planning_timeout", {"provider_ms": 25000, "planning_budget_ms": 28000})["error_type"], "PROVIDER_TIMEOUT")
        self.assertEqual(classify("planning_timeout", {"provider_ms": 100, "planning_budget_ms": 28000})["error_type"], "INTERNAL_ERROR")


if __name__ == "__main__":
    unittest.main()
