"""V3.3 Phase 1: request identity must include mission/policy/scope so a changed
mission or partial-scope acceptance never hits a stale plan cache or approval."""
import json
import pathlib
import unittest
import unittest.mock

from common import AiTextToReportRequest
from services.agent_pipeline import AnalysisPipeline


def sig(**extra):
    return AnalysisPipeline.request_signature(AiTextToReportRequest(question="Doanh thu theo chi nhánh", **extra))


class RequestIdentityTests(unittest.TestCase):
    def test_mission_changes_signature(self):
        self.assertNotEqual(sig(analysis_mission="overview"), sig(analysis_mission="risk"))
        self.assertNotEqual(sig(), sig(analysis_mission="overview"))

    def test_partial_scope_acceptance_is_an_approval_not_proposal_identity(self):
        # Approval happens after the proposal, so the proposal signature must not change...
        self.assertEqual(sig(), sig(accept_partial_scope=True))

    def test_partial_scope_acceptance_separates_plan_cache_keys(self):
        import inspect
        from services import analysis_job_service
        self.assertIn("accept_partial_scope", inspect.getsource(analysis_job_service))

    def test_signature_is_deterministic(self):
        self.assertEqual(sig(analysis_mission="risk"), sig(analysis_mission="risk"))


if __name__ == "__main__":
    unittest.main()


class CapabilityProjectionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import json, pathlib
        from services.semantic_preflight_contract import metric_capability
        reg = json.loads((pathlib.Path(__file__).parents[1] / "metadata/semantic_catalog.json").read_text())["analysis_registry"]
        cls.reg = reg
        cls.caps = {k: metric_capability(k, v) for k, v in reg["metrics"].items()}

    def test_all_metrics_classified(self):
        self.assertEqual(len(self.caps), 43)
        self.assertTrue(all(c["semantics"] for c in self.caps.values()))

    def test_additivity_rules(self):
        from services.semantic_preflight_contract import additive_across as ok
        c = self.caps
        self.assertTrue(ok(c["revenue"], "store") and ok(c["revenue"], "time"))
        self.assertFalse(ok(c["aov"], "store"))
        self.assertFalse(ok(c["order_cancellation_rate"], "time"))
        self.assertFalse(ok(c["purchasing_customer_count"], "store"))
        self.assertFalse(ok(c["purchasing_customer_count"], "time"))
        self.assertTrue(ok(c["customer_count"], "customer_role"))
        self.assertFalse(ok(c["customer_count"], "store"))
        self.assertTrue(ok(c["stock_quantity"], "store"))
        self.assertFalse(ok(c["stock_quantity"], "time"))

    def test_dimension_logical_types(self):
        from services.semantic_preflight_contract import dimension_logical_type as t
        d = self.reg["dimensions"]
        self.assertEqual(t("hour", d["hour"]), "cyclic")
        self.assertEqual(t("store_id", d["store_id"]), "identity")
        self.assertEqual(t("loyalty_points", d["loyalty_points"]), "number")
        self.assertEqual(t("order_created", d["order_created"]), "date")
        self.assertEqual(t("category", d["category"]), "category")

    def test_validation_rejects_contradiction(self):
        import copy
        from services.semantic_catalog_validation import validate_catalog  # noqa: F401
        bad = copy.deepcopy(self.reg["metrics"]["aov"]); bad["additive_over"] = ["store"]
        self.assertTrue(bad["aggregation_semantics"] in {"average", "ratio"} and bad["additive_over"])


class CapabilityDecisionTests(unittest.TestCase):
    def setUp(self):
        self.registry = json.loads((pathlib.Path(__file__).parents[1] / "metadata/semantic_catalog.json").read_text())["analysis_registry"]

    def req(self, **kw):
        from services.analysis_intent import IntentRequirement
        return IntentRequirement(id="r1", **kw)

    def test_policy_version_changes_plan_fingerprint(self):
        from services.analytical_resolver import plan_fingerprint
        a = plan_fingerprint([], [], "cat", "3.3.0")
        self.assertEqual(a, plan_fingerprint([], [], "cat", "3.3.0"))
        self.assertNotEqual(a, plan_fingerprint([], [], "cat", "3.4.0"))
        self.assertNotEqual(a, plan_fingerprint([], [], "cat"))

    def test_unknown_metric_unsupported_and_missing_metric_clarify(self):
        from services.semantic_preflight_contract import evaluate_capability
        d = evaluate_capability(self.req(metric_ids=["khong_co"]), self.registry)
        self.assertEqual(d.decision, "UNSUPPORTED")
        self.assertEqual(evaluate_capability(self.req(), self.registry).decision, "CLARIFY")

    def test_ready_scalar_has_view(self):
        from services.semantic_preflight_contract import evaluate_capability
        m = next(iter(self.registry["metrics"]))
        d = evaluate_capability(self.req(metric_ids=[m]), self.registry)
        self.assertEqual((d.decision, d.views[0].kind), ("READY", "scalar"))


class ServerGateTests(unittest.TestCase):
    def test_known_forecast_violation_stops_before_provider_without_upgrade_flag(self):
        from datetime import date
        from services import preflight_service
        from services.analysis_catalog import AnalysisError
        pipeline = AnalysisPipeline.__new__(AnalysisPipeline)
        pipeline.semantic_info = {}
        pipeline.planning_mode = "one_shot"
        catalog = preflight_service.preflight_catalog()
        req = AiTextToReportRequest(prompt="Dự báo doanh thu 12 tháng tới theo từng chi nhánh")
        with self.assertRaises(AnalysisError) as ctx:
            pipeline.guided_context(req, catalog, date(2026, 10, 16), {})
        self.assertEqual(ctx.exception.category, "forecast_unsupported")
        self.assertEqual(pipeline.semantic_info["capability_decision"], "UNSUPPORTED")


class SevenModesTests(unittest.TestCase):
    def test_visible_missions_are_six_and_hidden_ones_stay_resolvable(self):
        from services import preflight_service
        from services.workspace_service import mission_catalog, mission_for
        catalog = preflight_service.preflight_catalog()
        r = catalog.registry
        cards = mission_catalog(r, {}, None, [])
        visible = [m["id"] for m in cards if m["visible"]]
        self.assertEqual(visible, ["overview", "compare", "ranking", "trend", "forecast", "risk_watch"])
        hidden = {m["id"]: m["maps_to"] for m in cards if not m["visible"]}
        self.assertEqual(hidden, {"composition": "overview", "relationship": None})
        self.assertEqual(mission_for(r, "composition")["id"], "composition")  # stored ids still resolve


class PhysicalLedgerTests(unittest.TestCase):
    def test_physical_attempts_are_reserved_with_a_hard_ceiling_and_hash(self):
        from services.analysis_catalog import AnalysisError
        from services.provider_budget import ProviderBudget, PHYSICAL_CEILING
        diag = {}
        b = ProviderBudget(diag, max_calls=3)
        for _ in range(PHYSICAL_CEILING):
            b.record_physical({"same": "payload"})
        self.assertEqual(diag["provider_physical_attempts"], PHYSICAL_CEILING)
        self.assertEqual(len(set(diag["provider_physical_payload_hashes"])), 1)  # transport retry keeps the payload
        with self.assertRaises(AnalysisError) as ctx:
            b.record_physical({"same": "payload"})
        self.assertEqual(ctx.exception.category, "provider_call_budget_exceeded")
        self.assertEqual(diag["provider_physical_attempts"], PHYSICAL_CEILING)

    def test_no_recovery_below_six_seconds(self):
        from unittest.mock import patch
        from services import provider_budget as pb
        b = pb.ProviderBudget({}, max_calls=3)
        with patch.object(pb.time, "monotonic", return_value=1000.0):
            b.deadline = 1000.0 + pb.DETERMINISTIC_RESERVE + pb.MIN_RECOVERY_SECONDS - 0.5
            self.assertFalse(b.recovery_available())
            b.deadline += 1
            self.assertTrue(b.recovery_available())


class StatisticalHonestyTests(unittest.TestCase):
    SPEC = {"cadences": ["month"], "max_horizon": {"month": 6}, "min_history": {"month": 6}, "missing_data_policy": "zero_fill"}

    def test_one_period_and_all_zero_history_never_forecast(self):
        from datetime import date
        from services import forecast_service as fs
        from services.analysis_catalog import AnalysisError
        for series in ([(date(2026, 9, 1), 100.0)], [(date(2026, m, 1), 0.0) for m in range(1, 9)]):
            with self.assertRaises(AnalysisError) as ctx:
                fs.forecast(series, "month", 2, self.SPEC, reference=date(2026, 10, 16))
            self.assertEqual(ctx.exception.category, "forecast_insufficient_history")

    def test_interval_is_80_percent_and_never_promises_95(self):
        from datetime import date
        from services import forecast_service as fs
        series = [(date(2026, m, 1), 100.0 + 7 * m + (m % 3) * 5) for m in range(1, 9)]
        r = fs.forecast(series, "month", 2, self.SPEC, reference=date(2026, 9, 10))
        self.assertIn("80%", r["interval"])
        self.assertIn("không phải xác suất được bảo đảm", r["interval"])
        self.assertNotIn("95%", json.dumps(r, ensure_ascii=False))

    def test_risk_light_uses_margin_on_the_safe_side(self):
        from services.risk_watch_service import classify
        sig = {"threshold": 10, "warning_margin": 2, "operator": "gt"}
        self.assertEqual([classify(v, sig) for v in (None, 11, 9, 7)], ["no_data", "red", "yellow", "green"])


class TrustDimensionTests(unittest.TestCase):
    def test_not_measured_is_not_passed_and_dimensions_stay_separate(self):
        from services.verification_score import trust_dimensions, verification_score
        checks = [{"id": "request_coverage", "label": "a", "passed": 2, "total": 2, "status": "passed"},
                  {"id": "population_correctness", "label": "b", "passed": 1, "total": 2, "status": "partial"}]
        dims = {d["id"]: d for d in trust_dimensions(checks)}
        self.assertEqual(dims["reliability"]["status"], "passed")
        self.assertEqual(dims["reconciliation"]["status"], "partial")
        self.assertEqual(dims["presentation"]["status"], "not_measured")
        self.assertEqual(dims["independent_accuracy"]["status"], "not_measured")
        self.assertEqual(len(dims), 4)


class NarrowDepthTests(unittest.TestCase):
    def test_single_metric_top_n_without_explicit_depth_is_focused_but_explicit_deep_wins(self):
        from types import SimpleNamespace
        from services.analysis_expansion_service import analysis_depth
        from services.analysis_intent import IntentRequirement
        req = IntentRequirement(id="r1", metric_ids=["revenue"], dimension_ids=["store"], analysis_kind="ranking",
                                ranking={"direction": "top", "limit": 5})
        intent = SimpleNamespace(requirements=[req])
        index = SimpleNamespace(metrics={"revenue": {"subjects": ["order"]}}, domains={"sales": {"primary_subjects": ["order"]}})
        self.assertEqual(analysis_depth(intent, index, {}), "focused")
        self.assertEqual(analysis_depth(intent, index, {"analysis_depth_explicit": True, "analysis_depth": "deep"}), "deep")
        self.assertEqual(analysis_depth(intent, index, {"request_breadth": "deep"}), "deep")


class ConclusionTests(unittest.TestCase):
    def test_conclusion_keeps_only_findings_with_known_evidence_and_readable_actions(self):
        from services.chart_insight_service import build_conclusion
        narrative = {"key_findings": [{"finding": "A cao hơn B", "evidence_id": "e1"}, {"finding": "ma", "evidence_id": "zz"}],
                     "executive_summary": "tóm tắt",
                     "recommendations": [{"text": "Xem lại kho", "action": "review_gap", "evidence_id": "e1"}]}
        c = build_conclusion([], narrative, [{"id": "e1"}], ["Dữ liệu trễ", "Dữ liệu trễ"], ["q"], chart_caveats=["Mẫu nhỏ"])
        self.assertEqual(c["answer"], "tóm tắt")
        self.assertEqual(c["findings"], [{"statement": "A cao hơn B", "evidence_id": "e1"}])
        self.assertEqual((c["caveats"], c["actions"], c["evidence_ids"]), (["Dữ liệu trễ", "Mẫu nhỏ"], ["Xem lại kho"], ["e1"]))
        self.assertNotIn("review_gap", json.dumps(c, ensure_ascii=False))  # never the enum / a dict repr
        self.assertEqual(build_conclusion(["Trực tiếp"], {}, [], [], ["q"])["answer"], "Trực tiếp")

    def test_conclusion_answers_every_requested_part_and_names_unanswered_ones(self):
        from services.chart_insight_service import build_conclusion
        c = build_conclusion(["Phần 1", "Phần 2"], {}, [], [], [], unanswered=["Lợi nhuận"])
        self.assertEqual(c["answers"], ["Phần 1", "Phần 2", "Chưa trả lời được phần: Lợi nhuận."])
        self.assertEqual(c["unanswered"], ["Lợi nhuận"])

    def test_forecast_conclusion_answers_the_future_with_backtest_and_interval_caveats(self):
        from services.chart_insight_service import build_conclusion
        forecast = {"requirement_id": "r1", "status": "ok", "metric_label": "Doanh thu", "metric_unit": "VND", "unit": "month", "horizon": 2,
                    "forecast": [{"period": "2026-11-01", "value": 1_000_000_000, "lower_80": 900_000_000, "upper_80": 1_100_000_000},
                                 {"period": "2026-12-01", "value": 1_100_000_000, "lower_80": 950_000_000, "upper_80": 1_250_000_000}],
                    "backtest": {"smape_pct": 4.1, "folds": 2, "evaluated_points": 4, "improvement_vs_naive_pct": 47.0},
                    "interval": "Khoảng 80% ước lượng từ sai số backtest; không phải xác suất được bảo đảm.",
                    "limitations": ["Không tính khuyến mãi."]}
        c = build_conclusion([], {}, [], [], [], forecasts=[forecast], cadence_labels={"month": "tháng"})
        self.assertIn("2 tháng tới", c["answer"]); self.assertIn("khoảng 80%", c["answer"])
        self.assertTrue(any("sMAPE" in f["statement"] for f in c["findings"]))
        self.assertIn("không phải xác suất được bảo đảm", " ".join(c["caveats"]))
        self.assertNotIn("95%", json.dumps(c, ensure_ascii=False))
        self.assertTrue(all(f["forecast_ref"] == "r1" for f in c["findings"]))


class PairedAndDriverTests(unittest.TestCase):
    def test_pairing_reports_duplicates_unmatched_and_guards_n_and_variance(self):
        from services.insight_service import paired_observations
        a = [{"k": "x", "v": 1}, {"k": "y", "v": 2}, {"k": "z", "v": 3}, {"k": "w", "v": 9}]
        b = [{"k": "x", "u": 2}, {"k": "y", "u": 4}, {"k": "z", "u": 6}, {"k": "q", "u": 1}]
        r = paired_observations(a, b, "k", "v", "u")
        self.assertEqual((r["n"], r["r"], r["unmatched_a"], r["unmatched_b"]), (3, 1.0, ["w"], ["q"]))
        self.assertEqual(paired_observations(a[:2], b[:2], "k", "v", "u")["status"], "insufficient_pairs")
        flat = paired_observations(a[:3], [{"k": k, "u": 5} for k in "xyz"], "k", "v", "u")
        self.assertEqual(flat["status"], "zero_variance")
        dup = paired_observations(a + [{"k": "x", "v": 4}], b, "k", "v", "u")
        self.assertEqual(dup["duplicate_keys"], ["x"]); self.assertEqual(dup["n"], 2)

    def test_driver_deltas_sum_to_total_delta(self):
        from services.insight_service import reconcile_driver_deltas
        r = reconcile_driver_deltas({"A": 120, "B": 80}, {"A": 100, "B": 90, "C": 10})
        self.assertTrue(r["reconciled"]); self.assertEqual(r["total_delta"], 0)
        self.assertEqual(r["drivers"][0], "A"); self.assertEqual(r["deltas"]["C"], -10)


class JobTerminalDecisionTests(unittest.TestCase):
    def test_redirect_decision_stops_as_needs_input_with_first_class_decision(self):
        from services.analysis_job_service import terminal_state
        result = {"analysis_state": "UNSUPPORTED_CAPABILITY"}
        self.assertEqual(terminal_state(result, {"capability_decision": "REDIRECT", "capability_codes": ["forecast_horizon_exceeded"]}), "needs_input")
        self.assertEqual((result["decision"], result["decision_codes"]), ("REDIRECT", ["forecast_horizon_exceeded"]))
        self.assertEqual(terminal_state({"analysis_state": "UNSUPPORTED_CAPABILITY"}, {}), "unsupported")
        self.assertEqual(terminal_state({"status": "needs_clarification"}, {}), "needs_input")


class ResolverEvaluatorWiringTests(unittest.TestCase):
    def test_resolver_rejects_total_of_a_non_additive_metric_through_the_canonical_evaluator(self):
        from datetime import date
        from services import preflight_service
        from services.analysis_catalog import AnalysisError
        from services.analysis_intent import IntentRequirement
        from services.analytical_resolver import AnalyticalResolver
        catalog = preflight_service.preflight_catalog()
        avg = next(m for m, d in catalog.registry["metrics"].items() if d.get("aggregation_semantics") == "average")
        resolver = AnalyticalResolver(catalog, date(2026, 10, 16))
        req = IntentRequirement(id="r1", metric_ids=[avg], dimension_ids=["store"], analysis_kind="ranking",
                                ranking={"direction": "top", "limit": 5}, derived_features=["selected_total"],
                                feature_metrics={"selected_total": [avg]})
        with self.assertRaises(AnalysisError) as ctx:
            resolver.resolve_requirement(req)
        self.assertEqual(ctx.exception.category, "non_additive_total")


class DepthDefaultSurvivesJobRoundTripTests(unittest.TestCase):
    def test_default_depth_is_not_promoted_to_an_explicit_choice_by_the_job_payload(self):
        from common import AiTextToReportRequest
        req = AiTextToReportRequest(question="Top 5 chi nhánh doanh thu")
        payload = req.model_dump(mode="json", exclude_unset=True)
        self.assertNotIn("analysis_depth", payload)
        restored = AiTextToReportRequest.model_validate(payload)
        self.assertNotIn("analysis_depth", restored.model_fields_set)
        chosen = AiTextToReportRequest.model_validate(AiTextToReportRequest(question="x", analysis_depth="deep").model_dump(mode="json", exclude_unset=True))
        self.assertIn("analysis_depth", chosen.model_fields_set)


class DurableLedgerTests(unittest.TestCase):
    def test_ledger_survives_repository_round_trip_and_caps_at_three_with_one_recovery(self):
        from services.analysis_catalog import AnalysisError
        from services.analysis_job_service import JobRepository, apply_ledger_event
        repo = JobRepository()
        job, _ = repo.create("owner-a", "k" * 20, {"question": "x"})
        for _ in range(3):
            repo.mutate(job["job_id"], lambda j: apply_ledger_event(j, "provider_physical_reserved"))
        repo.mutate(job["job_id"], lambda j: apply_ledger_event(j, "provider_recovery_claimed"))
        with self.assertRaises(AnalysisError):
            repo.mutate(job["job_id"], lambda j: apply_ledger_event(j, "provider_physical_reserved"))
        with self.assertRaises(AnalysisError):
            repo.mutate(job["job_id"], lambda j: apply_ledger_event(j, "provider_recovery_claimed"))
        stored = repo.read(job["job_id"])  # a reconnect/restart reads the same ledger, never a fresh allowance
        self.assertEqual((stored["physical_http"], stored["recovery_used"]), (3, True))

    def test_budget_asks_observer_before_each_send_and_observer_can_veto(self):
        from services.analysis_catalog import AnalysisError
        from services.provider_budget import ProviderBudget, request_observer
        events = []
        def observer(event, details):
            events.append(event)
            if len(events) > 2:
                raise AnalysisError("provider_call_budget_exceeded", "vetoed")
        token = request_observer.set(observer)
        try:
            b = ProviderBudget({}, max_calls=3)
            b.record_physical({"a": 1}); b.record_physical({"a": 1})
            with self.assertRaises(AnalysisError):
                b.record_physical({"a": 1})
        finally:
            request_observer.reset(token)
        self.assertEqual(events, ["provider_physical_reserved"] * 3)
        self.assertEqual(b.physical, 2)  # the vetoed send was never counted as sent


class RateChangeSemanticsTests(unittest.TestCase):
    def test_rate_trend_reports_percentage_points_not_percent_of_percent(self):
        from services.insight_service import analytical_features
        from tests.analysis_fixtures import result
        from tests.test_agent_v22 import fixture_artifact, query
        a, _ = fixture_artifact(query("orders", "order_cancellation_rate", "trend"))
        a.result = result([{"period": "2026-10-01", "order_cancellation_rate": 4.0},
                           {"period": "2026-10-02", "order_cancellation_rate": 6.5}])
        feature = next(e for e in analytical_features({"main": a}) if e["feature"] == "change")
        self.assertIsNone(feature["values"]["change_pct"])
        self.assertEqual(feature["values"]["change"], 2.5)
        self.assertIn("điểm phần trăm", feature["statement"])
        self.assertNotIn("62,5%", feature["statement"])


class RiskRouterErrorTests(unittest.TestCase):
    def test_unknown_signal_is_a_clear_422_not_a_time_error(self):
        import routers.ai as ai
        from common import AiRiskWatchRequest
        from fastapi import HTTPException
        from services import preflight_service
        from services.analysis_catalog import AnalysisError
        from tests.analysis_fixtures import physical_metadata
        ai._risk_limiter = preflight_service.RateLimiter(5, 60)
        self.addCleanup(setattr, ai, "_risk_limiter", None)
        with unittest.mock.patch("routers.ai.get_local_metadata", return_value=physical_metadata()), \
             unittest.mock.patch("services.risk_watch_service.evaluate", side_effect=AnalysisError("risk_signal_unknown", "x")):
            with self.assertRaises(HTTPException) as caught:
                ai.ai_risk_watch(AiRiskWatchRequest(question="", signals=["khong_co"]))
        self.assertEqual(caught.exception.status_code, 422)
        self.assertIn("Tín hiệu rủi ro", caught.exception.detail)


class StaleGuidedTextTests(unittest.TestCase):
    def guided(self, question):
        from datetime import date
        from services import preflight_service
        from services.analysis_catalog import AnalysisError
        pipeline = AnalysisPipeline.__new__(AnalysisPipeline)
        pipeline.semantic_info, pipeline.planning_mode = {}, "one_shot"
        request = AiTextToReportRequest(question=question, analysis_mission="trend", input_mode="guided",
                                        guided_contract={"metric": "revenue", "granularity": "week"})
        catalog = preflight_service.preflight_catalog()
        context = {"required_period": {"start": "2026-09-01", "end": "2026-09-30"}}
        return pipeline, request, catalog, context, date(2026, 10, 16), AnalysisError

    def test_edited_text_naming_another_metric_makes_the_guided_intent_stale(self):
        pipeline, request, catalog, context, reference, AnalysisError = self.guided("Số đơn theo tuần trong tháng 9 năm 2026")
        with self.assertRaises(AnalysisError) as caught:
            pipeline.guided_context(request, catalog, reference, context)
        self.assertEqual(caught.exception.category, "guided_contract_invalid")

    def test_untouched_guided_text_still_runs(self):
        pipeline, request, catalog, context, reference, _ = self.guided("Xu hướng doanh thu theo tuần trong tháng 9 năm 2026")
        pipeline.guided_context(request, catalog, reference, context)
        self.assertTrue(pipeline.semantic_info["guided_contract_used"])
