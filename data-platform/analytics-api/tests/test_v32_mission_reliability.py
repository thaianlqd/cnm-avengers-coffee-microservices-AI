"""V3.2 Mission-driven reliable analyst: regression suite for the incidents
observed in real manual UI testing (A–K) plus the analysis-depth proof.

Every test forbids HTTP and PostgreSQL. Provider behaviour is scripted; the
assertions are on server-owned semantics, never on model wording.
"""
import json
import os
import unittest
from copy import deepcopy
from datetime import date
from unittest.mock import Mock, patch

from common import AiTextToReportRequest
from evals.fixture_warehouse import FixtureWarehouse
from services import preflight_service
from services.analysis_catalog import AnalysisCatalog, AnalysisError, CATALOG_PATH
from services.analysis_pipeline import AnalysisPipeline, safe_failure
from services.mission_contract_service import GuidedContractError, guided_intent, infer_mission, validate_guided
from services.semantic_preflight_contract import validate_alias_policy
from services.value_grounding_service import value_text
from tests.agent_fixtures import ScriptedProvider, call
from tests.analysis_fixtures import physical_metadata

REFERENCE = date(2026, 10, 16)
SEPTEMBER = {"kind": "month", "month": 9, "year": 2026}
COVERAGE = {"status": "ready", "overall": {"min_date": "2026-01-01", "max_date": "2026-10-16"},
            "facts": {"silver.don_hang": {"label": "Đơn hàng", "min_date": "2026-01-01", "max_date": "2026-10-16"}},
            "freshness": {"mode": "batch", "label": "Cập nhật theo đợt", "last_sync": "2026-10-16T04:29:15+00:00", "stale": False}}


def requirement(**updates):
    return {"id": "r1", "goal": "Phân tích", "analysis_kind": "aggregate", "dimension_ids": [], **updates}


def envelope(*requirements):
    return {"decision": "analyze", "requirements": list(requirements)}


class Guarded(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch.dict(os.environ, {"AI_OFFLINE": "1", "DATA_ANALYST_ENV": "development",
            "DATA_ANALYST_SESSION_STORE": "memory", "DATA_ANALYST_ARTIFACT_STORE": "memory",
            "DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN": "3", "DATA_ANALYST_ENABLE_CONTRACT_REPAIR": "1",
            "DATA_ANALYST_ONE_SHOT_CONTEXT_MAX_CHARS": "24000"}))
        for target in ("requests.sessions.Session.request", "psycopg2.connect"):
            self.enterContext(patch(target, side_effect=AssertionError("External transport forbidden")))
        self.overlay = json.loads(CATALOG_PATH.read_text())
        self.catalog = AnalysisCatalog(physical_metadata())
        self.registry = self.catalog.registry

    def pf(self, question, **kw):
        return preflight_service.run(question, reference=REFERENCE, catalog=self.catalog,
                                     coverage=kw.pop("coverage", COVERAGE), **kw)

    def codes(self, result):
        return {f["code"] for f in result["findings"]}

    def pipeline(self, provider, warehouse=None):
        return AnalysisPipeline(metadata_loader=physical_metadata, provider=provider,
                                executor=warehouse or Mock(side_effect=AssertionError("no execution expected")),
                                value_lookup=Mock(return_value=[]), owner_id="owner-v32")

    def report(self, provider, **request):
        warehouse = FixtureWarehouse(self.overlay)
        self.addCleanup(warehouse.close)
        req = AiTextToReportRequest(reference_date=REFERENCE, **request)
        proposal = self.pipeline(provider, warehouse).propose(req)
        self.assertEqual(proposal["status"], "proposal_ready", proposal.get("message"))
        pr = proposal["proposal"]
        req.session_id = pr["session_id"]; req.proposal_revision = pr["revision"]
        req.intent_fingerprint = pr["semantic_intent_fingerprint"]; req.plan_fingerprint = pr["resolved_plan_fingerprint"]
        req.catalog_fingerprint = pr["catalog_fingerprint"]
        report = self.pipeline(provider, warehouse).generate(req)
        self.assertEqual(report["status"], "success", report.get("message"))
        return proposal, report


# --- A · gibberish, B/§25 mission mismatch, §22 honest states, §24 casual ------

class HonestPreflightTests(Guarded):
    def test_gibberish_is_blocked_and_never_labelled_valid(self):
        for q in ("dsdasds", "asdf qwer zxcv", "x"):
            with self.subTest(q=q):
                r = self.pf(q)
                self.assertEqual(r["state"], "BLOCKED"); self.assertFalse(r["can_submit"])
                self.assertIn("unrecognized_question", self.codes(r))
                self.assertEqual(r["provider_calls"], 0)
                self.assertNotIn("Câu hỏi hợp lệ", json.dumps(r, ensure_ascii=False))
                self.assertNotIn("no_metric_detected", self.codes(r))  # no "AI sẽ diễn giải" advice when blocked

    def test_casual_vietnamese_is_not_rejected_for_being_informal(self):
        for q in ("hôm nay bán được bao nhiêu?", "món nào bán chạy nhất?", "chi nhánh nào đang có tỷ lệ hủy cao?",
                  "tháng này doanh thu sao?"):
            with self.subTest(q=q):
                r = self.pf(q)
                self.assertTrue(r["can_submit"], r["findings"])
                self.assertIn(r["state"], {"READY_FOR_AI", "READY_GUIDED"})
        self.assertEqual([m["id"] for m in self.pf("chi nhánh nào đang có tỷ lệ hủy cao?")["understood"]["metrics"]],
                         ["order_cancellation_rate"])

    def test_plausible_but_incomplete_requests_need_input(self):
        r = self.pf("so sánh giúp tôi", analysis_mission="compare")
        self.assertEqual(r["state"], "NEEDS_INPUT"); self.assertIn("analysis_target_missing", self.codes(r))
        r = self.pf("cửa hàng nào tốt nhất?")
        self.assertEqual(r["state"], "NEEDS_INPUT"); self.assertIn("metric_needed", self.codes(r))
        fix = next(f for f in r["findings"] if f["code"] == "metric_needed")["fixes"][0]
        self.assertEqual(fix["kind"], "replace_question")
        self.assertEqual(self.pf(fix["question"])["state"] in {"READY_FOR_AI", "READY_GUIDED"}, True)

    def test_ready_for_ai_label_is_not_a_validity_claim(self):
        r = self.pf("Doanh thu theo chi nhánh tháng 9 năm 2026")
        self.assertEqual(r["state"], "READY_FOR_AI")
        self.assertEqual(r["state_label"], "Có thể gửi để AI diễn giải")

    def test_mission_mismatch_blocks_with_switch_fix_and_no_provider_call(self):
        q = "So sánh doanh thu Hồ Chí Minh và Hà Nội tháng 9 năm 2026"
        r = self.pf(q, analysis_mission="ranking")
        self.assertFalse(r["can_submit"]); self.assertIn("mission_mismatch", self.codes(r))
        self.assertEqual(r["state_label"], "Yêu cầu chưa phù hợp với nhiệm vụ đang chọn")
        fixes = next(f for f in r["findings"] if f["code"] == "mission_mismatch")["fixes"]
        self.assertEqual(fixes[0], {"label": "Chuyển sang So sánh", "kind": "switch_mission", "mission": "compare"})
        self.assertNotIn("mission_mismatch", self.codes(self.pf(q, analysis_mission="compare")))
        self.assertNotIn("mission_mismatch", self.codes(self.pf(q)))  # free text: server may infer
        provider = ScriptedProvider([call("submit_analysis_intent", envelope(requirement(metric_ids=["revenue"])))])
        with self.assertRaises(AnalysisError) as caught:
            self.pipeline(provider).propose(AiTextToReportRequest(question=q, analysis_mission="ranking",
                                                                  allow_deterministic_upgrade=True, reference_date=REFERENCE))
        self.assertEqual(caught.exception.category, "mission_mismatch")
        self.assertEqual(provider.call_count, 0)
        self.assertEqual(safe_failure(caught.exception)["analysis_stage"], "PRECHECK_FAILURE")

    def test_server_precheck_blocks_gibberish_before_any_provider_call(self):
        provider = ScriptedProvider([call("submit_analysis_intent", envelope(requirement(metric_ids=["revenue"])))])
        with self.assertRaises(AnalysisError) as caught:
            self.pipeline(provider).propose(AiTextToReportRequest(question="dsdasds", allow_deterministic_upgrade=True,
                                                                  reference_date=REFERENCE))
        self.assertEqual(caught.exception.category, "unrecognized_question")
        self.assertEqual(provider.call_count, 0)

    def test_mission_inference_uses_governed_vocabulary_only(self):
        text = value_text("Phân tích xu hướng doanh thu theo tuần")
        self.assertEqual(infer_mission(text, self.registry)["id"], "trend")
        self.assertEqual(infer_mission(value_text("Dự báo xu hướng doanh thu"), self.registry)["id"], "forecast")
        self.assertEqual(infer_mission(value_text("So sánh top 5 chi nhánh"), self.registry)["confidence"], "ambiguous")
        self.assertIsNone(infer_mission(value_text("Doanh thu tháng 9"), self.registry))

    def test_privacy_and_unsupported_profit_are_deterministic(self):
        r = self.pf("số điện thoại khách hàng mua nhiều nhất")
        self.assertEqual(r["state"], "BLOCKED"); self.assertIn("privacy_blocked", self.codes(r))
        r = self.pf("Phân tích lợi nhuận tháng 9")
        f = next(f for f in r["findings"] if f["code"] == "unsupported_concept")
        self.assertTrue(f["nearest"]); self.assertEqual(r["provider_calls"], 0)
        # Profit alone cannot be answered by AI either: no submit, nearest metrics offered.
        self.assertEqual(r["state"], "NEEDS_INPUT"); self.assertFalse(r["can_submit"])
        self.assertTrue(next(f for f in r["findings"] if f["code"] == "unsupported_only")["fixes"])
        mixed = self.pf("Doanh thu và lợi nhuận theo chi nhánh tháng 9")
        self.assertNotIn("unsupported_only", self.codes(mixed)); self.assertIn("unsupported_concept", self.codes(mixed))

    def test_preflight_stays_zero_call_and_fast(self):
        import time
        started = time.perf_counter()
        for _ in range(20):
            self.pf("Phân tích xu hướng doanh thu theo tuần trong tháng 9 năm 2026", analysis_mission="trend")
        self.assertLess((time.perf_counter() - started) / 20 * 1000, 50)


# --- E · canonical alias priority, D/§29-31/§69 preflight → plan lock -------------

class CanonicalAliasTests(Guarded):
    def test_generic_revenue_has_one_primary_meaning(self):
        r = self.pf("doanh thu")
        m = r["understood"]["metrics"][0]
        self.assertEqual(m["id"], "revenue"); self.assertTrue(m["canonical"]); self.assertEqual(m["alternatives"], [])
        self.assertIn("product_revenue", {s["id"] for s in m["specialized"]})
        self.assertNotIn("ambiguous_metric", self.codes(r))
        self.assertEqual(self.pf("doanh thu sản phẩm")["understood"]["metrics"][0]["id"], "product_revenue")

    def test_alias_collision_validator(self):
        validate_alias_policy(self.registry)
        bad = deepcopy(self.registry); bad["metric_alias_policy"]["canonical"].pop("số đơn")
        with self.assertRaisesRegex(ValueError, "collision"):
            validate_alias_policy(bad)
        bad = deepcopy(self.registry); bad["metric_alias_policy"]["canonical"]["doanh thu"] = "aov"
        with self.assertRaisesRegex(ValueError, "owner"):
            validate_alias_policy(bad)
        bad = deepcopy(self.registry); bad["metric_alias_policy"]["ambiguous"].append("doanh thu")
        with self.assertRaises(ValueError):
            validate_alias_policy(bad)

    def test_trend_revenue_cannot_silently_become_product_revenue(self):
        q = "Phân tích xu hướng doanh thu theo tuần trong tháng 9 năm 2026"
        drift = envelope(requirement(metric_ids=["product_revenue"], analysis_kind="trend", granularity="week", time=SEPTEMBER))
        provider = ScriptedProvider([call("submit_analysis_intent", drift)])
        proposal, report = self.report(provider, question=q, analysis_mission="trend")
        main = report["analytical_queries"][0]
        self.assertEqual((main["metrics"], main["operation"], main["granularity"]), (["revenue"], "trend", "week"))
        self.assertEqual((main["time"]["start"], main["time"]["end"]), ("2026-09-01", "2026-09-30"))
        self.assertTrue(any(n.get("rule") == "canonical_metric_lock" for n in proposal["diagnostics"]["semantic_normalizations"]))
        self.assertEqual(provider.call_count, 1)
        self.assertIn("doanh thu", json.dumps(provider.requests[0], ensure_ascii=False))
        self.assertIn("semantic_preflight_contract", provider.requests[0]["messages"][0]["content"])

    def test_qualified_specialized_metric_is_kept(self):
        intent = envelope(requirement(metric_ids=["product_revenue"], dimension_ids=["product"], analysis_kind="ranking",
                                      ranking={"limit": 5, "metric_id": "product_revenue"}))
        provider = ScriptedProvider([call("submit_analysis_intent", intent)])
        _, report = self.report(provider, question="Top 5 sản phẩm theo doanh thu")
        self.assertEqual(report["analytical_queries"][0]["metrics"], ["product_revenue"])

    def test_dropped_locked_metric_is_typed_contract_drift(self):
        wrong = envelope(requirement(metric_ids=["order_count"], analysis_kind="trend", granularity="week", time=SEPTEMBER))
        provider = ScriptedProvider(*[[call("submit_analysis_intent", wrong)]] * 3)
        with self.assertRaises(AnalysisError) as caught:
            self.pipeline(provider).propose(AiTextToReportRequest(question="Xu hướng doanh thu theo tuần tháng 9 năm 2026",
                                                                  reference_date=REFERENCE))
        self.assertEqual(caught.exception.category, "semantic_contract_drift")
        failure = safe_failure(caught.exception)
        self.assertFalse(failure["retryable"]); self.assertEqual(failure["analysis_stage"], "SEMANTIC_CONTRACT_FAILURE")


# --- F/§19/§72-74 guided deterministic execution ------------------------------

class GuidedExecutionTests(Guarded):
    def forecast_report(self, provider, **request):
        # Forecast execution needs a long daily history: reuse the V3.0 oracle warehouse.
        from tests.test_forecast_v30 import OrdersWarehouse
        warehouse = OrdersWarehouse(self.overlay)
        self.addCleanup(warehouse.close)
        req = AiTextToReportRequest(reference_date=REFERENCE, **request)
        proposal = self.pipeline(provider, warehouse).propose(req)
        self.assertEqual(proposal["status"], "proposal_ready", proposal.get("message"))
        pr = proposal["proposal"]
        req.session_id = pr["session_id"]; req.proposal_revision = pr["revision"]
        req.intent_fingerprint = pr["semantic_intent_fingerprint"]; req.plan_fingerprint = pr["resolved_plan_fingerprint"]
        req.catalog_fingerprint = pr["catalog_fingerprint"]
        return proposal, self.pipeline(provider, warehouse).generate(req)

    def test_guided_forecast_runs_with_zero_provider_calls(self):
        provider = ScriptedProvider()
        proposal, report = self.forecast_report(provider, question="Dự báo doanh thu 7 ngày tới", analysis_mission="forecast",
                                                input_mode="guided", guided_contract={"metric": "revenue", "horizon": 7, "cadence": "day"})
        self.assertEqual(provider.call_count, 0)
        self.assertTrue(proposal["diagnostics"]["guided_contract_used"])
        f = report["forecasts"][0]
        self.assertEqual((f["metric_id"], f["unit"], f["horizon"]), ("revenue", "day", 7))
        # The monthly builder (incident F) plans deterministically too: no AI, no retry.
        provider = ScriptedProvider()
        proposal = self.pipeline(provider, FixtureWarehouse(self.overlay)).propose(AiTextToReportRequest(
            question="Dự báo doanh thu 3 tháng tới", analysis_mission="forecast", input_mode="guided",
            guided_contract={"metric": "revenue", "horizon": 3, "cadence": "month"}, reference_date=REFERENCE))
        self.assertEqual((proposal["status"], provider.call_count), ("proposal_ready", 0))
        self.assertEqual(proposal["proposal"]["analytical_queries"][0]["metrics"], ["revenue"])

    def test_free_text_forecast_is_upgraded_only_when_fully_determined(self):
        provider = ScriptedProvider()
        proposal, _ = self.forecast_report(provider, question="Dự báo doanh thu 7 ngày tới", allow_deterministic_upgrade=True)
        self.assertEqual(provider.call_count, 0)
        self.assertEqual(proposal["diagnostics"]["guided_source"], "auto_upgrade")
        # Uncertain wording stays on the AI path (no silent upgrade).
        intent = envelope(requirement(metric_ids=["revenue"], dimension_ids=["store"]))
        provider = ScriptedProvider([call("submit_analysis_intent", intent)])
        self.report(provider, question="Doanh thu theo chi nhánh", allow_deterministic_upgrade=True)
        self.assertEqual(provider.call_count, 1)

    def test_guided_trend_and_ranking_compile_without_ai(self):
        provider = ScriptedProvider()
        _, report = self.report(provider, question="Top 5 chi nhánh theo doanh thu", analysis_mission="ranking",
                                input_mode="guided", time={"mode": "custom", "start": "2026-09-01", "end": "2026-09-30"},
                                guided_contract={"metric": "revenue", "dimension": "store", "n": 5, "direction": "top"})
        q = report["analytical_queries"][0]
        self.assertEqual((q["operation"], q["ranking"]["top_n"]), ("ranking", 5))
        self.assertEqual(provider.call_count, 0)

    def test_guided_contract_is_validated_server_side(self):
        cases = [("forecast", {"metric": "driver_rating", "horizon": 1, "cadence": "month"}, "metric"),
                 ("forecast", {"metric": "revenue", "horizon": 99, "cadence": "month"}, "horizon"),
                 ("compare", {"metric": "revenue", "dimension": "city", "group_a": "Hà Nội", "group_b": "Hà Nội"}, "group_b"),
                 ("compare", {"metric": "revenue", "dimension": "product", "group_a": "a", "group_b": "b"}, "dimension"),
                 ("ranking", {"metric": "revenue", "dimension": "store", "n": 5, "direction": "top", "horizon": 3}, "horizon"),
                 ("relationship", {"metric": "revenue", "metric_b": "order_count", "dimension": "store"}, "metric_b"),
                 ("trend", {"metric": "stock_quantity", "granularity": "week"}, "metric"),
                 ("risk_watch", {"signals": ["invented"]}, "signals")]
        for mission, contract, field in cases:
            with self.subTest(mission=mission, field=field):
                with self.assertRaises(GuidedContractError) as caught:
                    validate_guided(self.catalog, mission, contract)
                self.assertEqual(caught.exception.field, field)
        provider = ScriptedProvider()
        with self.assertRaises(AnalysisError) as caught:
            self.pipeline(provider).propose(AiTextToReportRequest(question="x", analysis_mission="forecast", input_mode="guided",
                guided_contract={"metric": "driver_rating", "horizon": 1, "cadence": "month"}, reference_date=REFERENCE))
        self.assertEqual(caught.exception.category, "guided_contract_invalid")
        self.assertEqual(provider.call_count, 0)
        self.assertFalse(safe_failure(caught.exception)["retryable"])

    def test_relationship_guided_contract_uses_governed_grain(self):
        slots = validate_guided(self.catalog, "relationship", {"metric": "total_deliveries", "metric_b": "driver_rating",
                                                               "dimension": "driver_id"})
        intent = guided_intent(self.catalog, slots)
        self.assertEqual(intent["requirements"][0]["analysis_kind"], "relationship")


# --- G/§41-44/§78 mission evidence + real analysis depth -------------------------

class DepthAndRelevanceTests(Guarded):
    QUESTION = "Doanh thu theo chi nhánh tháng 9 năm 2026"

    def depth_report(self, depth):
        intent = envelope(requirement(metric_ids=["revenue"], dimension_ids=["store"], time=SEPTEMBER))
        provider = ScriptedProvider([call("submit_analysis_intent", intent)])
        return self.report(provider, question=self.QUESTION, analysis_depth=depth)

    def test_one_question_three_depths_are_measurably_different(self):
        results = {d: self.depth_report(d) for d in ("focused", "deep", "comprehensive")}
        counts = {d: len(r[1]["charts"]) for d, r in results.items()}
        support = {d: r[0]["diagnostics"]["supporting_operation_count"] for d, r in results.items()}
        # FINAL 2026-10-19: focused carries the 4 core lenses; deeper modes ADD lenses and keep earlier ones.
        lenses = {d: {c.get("analysis_lens_id") for c in r[1]["charts"] if c.get("analysis_lens_id")} for d, r in results.items()}
        self.assertTrue(lenses["focused"] <= lenses["deep"] <= lenses["comprehensive"], lenses)
        self.assertLessEqual(support["focused"], support["deep"])
        self.assertLess(counts["focused"], counts["deep"]); self.assertLessEqual(counts["deep"], counts["comprehensive"])
        self.assertLess(support["deep"], support["comprehensive"] + 1)
        # Depth never changes the requested meaning or its numbers.
        main = {d: r[1]["result_sets"][r[1]["analytical_queries"][0]["id"]]["rows"] for d, r in results.items()}
        self.assertEqual(main["focused"], main["deep"]); self.assertEqual(main["deep"], main["comprehensive"])
        for d, (_, report) in results.items():
            check = next(c for c in report["quality_assessment"]["verification_checks"] if c["id"] == "analysis_depth_coverage")
            self.assertEqual(check["status"], "passed", d)

    def test_chart_titles_name_their_grouping_axis(self):
        _, report = self.depth_report("comprehensive")
        titles = [c["title"] for c in report["charts"]]
        self.assertEqual(len(titles), len(set(titles)), titles)
        self.assertTrue(any("theo chi nhánh" in t for t in titles))

    def test_risk_mission_supporting_views_use_risk_metrics_only(self):
        intent = envelope(requirement(metric_ids=["order_cancellation_rate"], dimension_ids=["store"], time=SEPTEMBER))
        provider = ScriptedProvider([call("submit_analysis_intent", intent)])
        _, report = self.report(provider, question="Kiểm tra các rủi ro vận hành trong tháng 9 năm 2026", analysis_mission="risk_watch")
        risk_metrics = {s["metric"] for s in self.registry["risk_signals"]} | {
            s["observation_metric"] for s in self.registry["risk_signals"] if s.get("observation_metric")}
        used = {m for q in report["analytical_queries"] for m in q["metrics"]}
        self.assertTrue(used <= risk_metrics, used)

    def test_trend_mission_discovers_related_axes_by_depth(self):
        intent = envelope(requirement(metric_ids=["revenue"], analysis_kind="trend", granularity="week", time=SEPTEMBER))
        counts = {}
        for depth in ("focused", "comprehensive"):
            provider = ScriptedProvider([call("submit_analysis_intent", intent)])
            _, report = self.report(provider, question="Doanh thu theo tuần tháng 9 năm 2026", analysis_mission="trend",
                                    analysis_depth=depth)
            counts[depth] = [q for q in report["analytical_queries"] if q["operation"] == "trend" and q["group_by"]]
            self.assertTrue(all(q["metrics"] == ["revenue"] for q in report["analytical_queries"]))
        self.assertEqual(counts["focused"], [])
        self.assertTrue(counts["comprehensive"])


if __name__ == "__main__":
    unittest.main()


# --- K/§33-40/§103 bounded credential failover ------------------------------------

class FakeResponse:
    def __init__(self, status, body, headers=None):
        self.status_code, self._body, self.headers = status, body, headers or {}
        self.ok = 200 <= status < 300

    def json(self):
        return self._body


def gemini_json(arguments):
    return FakeResponse(200, {"candidates": [{"content": {"parts": [{"text": json.dumps(arguments)}]}, "finishReason": "STOP"}],
                              "usageMetadata": {"promptTokenCount": 10, "candidatesTokenCount": 5}})


QUOTA = FakeResponse(429, {"error": {"status": "RESOURCE_EXHAUSTED", "message": "quota"}})


class ProviderFailoverTests(Guarded):
    def setUp(self):
        super().setUp()
        from services import llm_service, provider_credential_router
        provider_credential_router.reset_for_tests()
        self.addCleanup(provider_credential_router.reset_for_tests)
        self.enterContext(patch.dict(os.environ, {"AI_OFFLINE": "0", "GEMINI_API_STYLE": "native", "DATA_ANALYST_INTENT_TRANSPORT": "json",
                                                  "DATA_ANALYST_GEMINI_SECONDARY_KEY": "secondary-fixture"}))
        self.enterContext(patch.object(llm_service, "GEMINI_API_KEY", "primary-fixture"))
        self.enterContext(patch.object(llm_service, "GEMINI_MODELS", ["fixture-model"]))

    def run_with(self, responses, question="Doanh thu theo chi nhánh tháng 9 năm 2026"):
        from services.agent_provider import NativeAgentProvider
        used = []
        def post(url, params=None, json=None, headers=None, timeout=None):
            used.append((params or {}).get("key"))
            return responses.pop(0)
        warehouse = FixtureWarehouse(self.overlay); self.addCleanup(warehouse.close)
        with patch("services.agent_provider.requests.post", side_effect=post), patch("services.agent_provider.time.sleep"):
            p = self.pipeline(NativeAgentProvider(), warehouse)
            try:
                return p, p.propose(AiTextToReportRequest(question=question, reference_date=REFERENCE)), used
            except AnalysisError as error:
                return p, error, used

    def test_primary_429_then_secondary_success_is_one_logical_call(self):
        intent = envelope(requirement(metric_ids=["revenue"], dimension_ids=["store"], time=SEPTEMBER))
        p, proposal, used = self.run_with([QUOTA, gemini_json(intent)])
        self.assertEqual(proposal["status"], "proposal_ready")
        d = proposal["diagnostics"]
        self.assertEqual((d["logical_provider_calls"], d["provider_http_attempts"]), (1, 2))
        self.assertTrue(d["credential_failover_used"]); self.assertEqual(d["semantic_repair_count"], 0)
        self.assertEqual(d["credential_slot"], "secondary")
        self.assertEqual(used, ["primary-fixture", "secondary-fixture"])
        dumped = json.dumps(d, ensure_ascii=False)
        self.assertNotIn("primary-fixture", dumped); self.assertNotIn("secondary-fixture", dumped)  # never exposed

    def test_both_credentials_quota_limited_is_typed_with_no_third_attempt(self):
        p, error, used = self.run_with([QUOTA, QUOTA, QUOTA, QUOTA])
        self.assertIsInstance(error, AnalysisError)
        self.assertEqual(error.category, "provider_rate_limited")
        self.assertEqual(len(used), 2)
        failure = safe_failure(error, p.calls, p.semantic_info)
        self.assertEqual(failure["analysis_stage"], "PROVIDER_QUOTA_FAILURE")
        self.assertIn("dự phòng", failure["message"]); self.assertNotIn("không thể diễn giải", failure["message"].lower())

    def test_semantic_contract_problem_never_rotates_credentials(self):
        bad = envelope(requirement(metric_ids=["unknown_metric"]))
        good = envelope(requirement(metric_ids=["revenue"], dimension_ids=["store"], time=SEPTEMBER))
        p, proposal, used = self.run_with([gemini_json(bad), gemini_json(good)])
        self.assertGreaterEqual(len(used), 2)
        self.assertEqual(set(used), {"primary-fixture"})  # semantic repair never switches credentials
        self.assertFalse(p.semantic_info.get("credential_failover_used", False))

    def test_router_status_is_sanitized(self):
        from services import provider_credential_router as credentials
        status = credentials.status()
        self.assertEqual(set(status), {"secondary_configured", "primary_limited", "recent_failover", "limit_category"})
        self.assertNotIn("fixture", json.dumps(status))
        self.assertTrue(credentials.eligible({"error_category": "provider_rate_limited", "http_status": 429}))
        for category in ("provider_invalid_json", "provider_bad_request", "semantic_resolution_failed", "provider_auth"):
            self.assertFalse(credentials.eligible({"error_category": category, "http_status": 400}))


# --- G/H/§41-48/§100-101 relevance gate + chart insights ------------------------------

class RelevanceInsightTests(Guarded):
    def test_risk_mixed_required_roles_redirect_before_interpretation(self):
        intent = envelope(requirement(metric_ids=["order_cancellation_rate"], dimension_ids=["store"], time=SEPTEMBER),
                          requirement(id="r2", metric_ids=["product_revenue"], dimension_ids=["category"], time=SEPTEMBER))
        provider = ScriptedProvider([call("submit_analysis_intent", intent)])
        # V3.3 preserves both required clauses instead of executing and deleting
        # the revenue chart after compiled READY.
        executor=Mock();p=self.pipeline(provider,executor)
        with self.assertRaises(AnalysisError):
            p.propose(AiTextToReportRequest(question="Kiểm tra rủi ro tỷ lệ hủy đơn và doanh thu sản phẩm tháng 9 năm 2026",
                analysis_mission="risk_watch",reference_date=REFERENCE))
        self.assertEqual(p.semantic_info['capability_decision'],'REDIRECT')
        self.assertEqual(provider.call_count,0);executor.assert_not_called()

    def test_every_chart_maps_to_a_requirement_and_explains_itself(self):
        intent = envelope(requirement(metric_ids=["revenue"], dimension_ids=["store"], time=SEPTEMBER))
        provider = ScriptedProvider([call("submit_analysis_intent", intent)])
        _, report = self.report(provider, question="Doanh thu theo chi nhánh tháng 9 năm 2026")
        for chart in report["charts"]:
            self.assertTrue(chart["requirement_id"]); self.assertIn(chart["relevance_role"], {"primary", "supporting"})
            block = chart["insight"]
            for key in ("why_relevant", "what_it_shows", "key_facts", "interpretation", "caveats"):
                self.assertIn(key, block)
            self.assertTrue(block["why_relevant"])
            self.assertTrue(all(f["evidence_ref"] for f in block["key_facts"]))
        g = report["verification"]["grounding"]
        self.assertEqual(g["chart_numeric_claims"], g["chart_numeric_matched"]); self.assertEqual(g["causal_language"], [])
        self.assertTrue(report["short_answer"])
        self.assertTrue(all("Tổng doanh thu" in s or "cao hơn" in s or "Cao nhất" in s or "Từ kỳ" in s for s in report["short_answer"][:1]))  # V3.3 aggregate answers lead with the total

    def test_trend_partial_period_and_ranking_top_n_caveats(self):
        trend = envelope(requirement(metric_ids=["revenue"], analysis_kind="trend", granularity="week",
                                     time={"kind": "range", "start": "2026-09-03", "end": "2026-09-30"}))
        provider = ScriptedProvider([call("submit_analysis_intent", trend)])
        _, report = self.report(provider, question="Doanh thu theo tuần từ 2026-09-03 đến 2026-09-30", analysis_depth="focused")
        main = next(c for c in report["charts"] if c["relevance_role"] == "primary")
        self.assertTrue(any("chưa đủ ngày" in c for c in main["insight"]["caveats"]), main["insight"])
        ranking = envelope(requirement(metric_ids=["revenue"], dimension_ids=["store"], analysis_kind="ranking",
                                       ranking={"limit": 2, "metric_id": "revenue"}))
        provider = ScriptedProvider([call("submit_analysis_intent", ranking)])
        _, report = self.report(provider, question="Top 2 chi nhánh theo doanh thu", analysis_depth="focused")
        main = next(c for c in report["charts"] if c["relevance_role"] == "primary")
        self.assertTrue(any("Top N" in c for c in main["insight"]["caveats"]))

    def test_relationship_scatter_discloses_no_causality(self):
        from services.chart_insight_service import insight
        from types import SimpleNamespace
        rows = [{"driver_id": f"d{i}", "total_deliveries": i * 3, "driver_rating": 3 + i * 0.1} for i in range(12)]
        artifact = SimpleNamespace(query=SimpleNamespace(id="q1", role="requested"), plan=SimpleNamespace(
            kind="relationship", dimensions=["driver_id"], granularity=None, ranking=None, explicit_limit=False), result={"rows": rows})
        block = insight({"id": "v1", "chart_type": "scatter", "metrics": ["total_deliveries", "driver_rating"],
                         "metric": "total_deliveries", "observation_label": "Shipper"}, artifact, self.catalog)
        self.assertIn("Tương quan không phải nhân quả; chỉ mô tả quan hệ quan sát được.", block["caveats"])
        self.assertTrue(any("Pearson" in f["text"] for f in block["key_facts"]))
        self.assertFalse(any(t in json.dumps(block, ensure_ascii=False).lower() for t in ("dẫn đến", "gây ra", "nguyên nhân là")))


# --- I/§53-63/§102 verification framework -----------------------------------------------

class VerificationTests(Guarded):
    def test_numeric_reconciliation_units_and_mismatch(self):
        from services.verification_reconciliation_service import numeric_check
        self.assertEqual(numeric_check("x", 10, 10, "đơn", "s")["status"], "matched")
        self.assertEqual(numeric_check("x", 10, 11, "đơn", "s")["status"], "mismatch")      # counts are exact
        self.assertEqual(numeric_check("x", 100.0, 100.004, "VND", "s")["status"], "matched")
        self.assertEqual(numeric_check("x", 12.3, 12.6, "%", "s")["status"], "mismatch")
        self.assertEqual(numeric_check("x", None, 3, "đơn", "s")["status"], "not_measured")

    def test_ranking_agreement_detects_order_and_set_errors(self):
        from services.verification_reconciliation_service import ranking_agreement
        full = [{"store": s, "revenue": v} for s, v in [("a", 9), ("b", 7), ("c", 5), ("d", 1)]]
        ok = ranking_agreement([full[0], full[1]], full, ["store"], "revenue", "DESC", 2)
        self.assertEqual((ok["status"], ok["precision"], ok["exact_set_match"]), ("matched", 1.0, True))
        swapped = ranking_agreement([full[1], full[0], full[2]], full, ["store"], "revenue", "DESC", 3)
        self.assertEqual(swapped["status"], "mismatch"); self.assertFalse(swapped["order_agreement"])
        wrong = ranking_agreement([full[0], full[3]], full, ["store"], "revenue", "DESC", 2)
        self.assertEqual(wrong["precision"], 0.5)
        self.assertEqual(ranking_agreement([full[0]], full[:1], ["store"], "revenue", "DESC", 1)["status"], "not_applicable")

    def test_report_verification_is_separate_metrics_not_fake_accuracy(self):
        intent = envelope(requirement(metric_ids=["revenue"], dimension_ids=["store"], time=SEPTEMBER))
        provider = ScriptedProvider([call("submit_analysis_intent", intent)])
        _, report = self.report(provider, question="Doanh thu theo chi nhánh tháng 9 năm 2026")
        v = report["verification"]
        self.assertIsNone(v["independent_oracle"])                       # not measured → null, never 100%
        self.assertEqual(v["independent_oracle_label"], "Chưa đo đối chiếu độc lập")
        self.assertIn("không phải độ chính xác AI", v["internal_completeness_label"])
        self.assertEqual({m["id"] for m in v["metrics"]}, {"numeric_reconciliation", "ranking_reconciliation",
                                                            "requirement_coverage", "grounded_claims", "chart_relevance", "conclusion_grounding", "view_coverage"})
        self.assertEqual(v["chart_relevance"]["passed"], v["chart_relevance"]["total"])
        self.assertEqual(v["snapshot"]["registry_fingerprint"], self.catalog.registry_fingerprint)

    def test_independent_oracle_reconciles_breakdown_and_ranking(self):
        warehouse = FixtureWarehouse(self.overlay); self.addCleanup(warehouse.close)
        for intent, question in [(envelope(requirement(metric_ids=["revenue"], dimension_ids=["store"])), "Doanh thu theo chi nhánh"),
                                 (envelope(requirement(metric_ids=["revenue"], dimension_ids=["store"], analysis_kind="ranking",
                                                       ranking={"limit": 2, "metric_id": "revenue"})), "Top 2 chi nhánh theo doanh thu")]:
            provider = ScriptedProvider([call("submit_analysis_intent", intent)])
            req = AiTextToReportRequest(reference_date=REFERENCE, question=question, analysis_depth="focused")
            pr = self.pipeline(provider, warehouse).propose(req)["proposal"]
            req.session_id = pr["session_id"]; req.proposal_revision = pr["revision"]
            req.intent_fingerprint = pr["semantic_intent_fingerprint"]; req.plan_fingerprint = pr["resolved_plan_fingerprint"]
            req.catalog_fingerprint = pr["catalog_fingerprint"]
            self.pipeline(provider, warehouse).generate(req)
            result = self.pipeline(provider, warehouse).reconcile(pr["session_id"])
            self.assertEqual(result["provider_calls"], 0); self.assertEqual(provider.call_count, 1)
            if "Top" in question:
                self.assertEqual(result["ranking"][0]["status"], "matched", result["ranking"])
            else:
                self.assertEqual(result["independent_oracle"]["accuracy_pct"], 100.0, result["numeric"])
                self.assertTrue(all(c["status"] == "matched" for c in result["numeric"]))
        other = AnalysisPipeline(metadata_loader=physical_metadata, provider=ScriptedProvider(), executor=warehouse,
                                 value_lookup=Mock(return_value=[]), owner_id="someone-else")
        with self.assertRaises(AnalysisError):
            other.reconcile(pr["session_id"])


# --- §75/§104 every displayed suggestion is executable or explicitly AI-bound -------------

class SuggestionTests(Guarded):
    def test_mission_examples_preflight_cleanly_and_guided_ones_compile(self):
        from services.analytical_resolver import AnalyticalResolver
        from services.analysis_intent import AnalysisIntentEnvelope
        checked = 0
        for mission in self.registry["analysis_missions"]:
            for question in mission.get("examples", []):
                with self.subTest(mission=mission["id"], question=question):
                    r = self.pf(question, analysis_mission=mission["id"])
                    self.assertTrue(r["can_submit"], r["findings"])
                    self.assertNotIn("mission_mismatch", self.codes(r))
                    self.assertIn(r["state"], {"READY_GUIDED", "READY_FOR_AI"})
                    guided = r["guided_contract"]
                    if guided and mission["id"] != "risk_watch":
                        slots = validate_guided(self.catalog, mission["id"], {k: v for k, v in guided["slots"].items() if k != "mission"})
                        intent = AnalysisIntentEnvelope.model_validate(guided_intent(self.catalog, slots, guided.get("time")))
                        resolved = AnalyticalResolver(self.catalog, REFERENCE).resolve(intent)
                        self.assertTrue(resolved["operations"])
                    checked += 1
        self.assertGreaterEqual(checked, 15)

    def test_template_questions_for_every_eligible_metric_preflight(self):
        from services.domain_intelligence_service import DomainIntelligence
        caps = DomainIntelligence(self.catalog).capabilities(coverage=COVERAGE)
        metrics = {m["id"]: m for m in caps["metrics"]}
        for mission in caps["missions"]:
            text = mission["template"]["text"]
            for metric_id in mission["metrics"][:6]:
                m = metrics[metric_id]
                dim = (m["dimensions"] or [{"label": ""}])[0]["label"]
                q = (text.replace("{metric}", m["label"] if text.startswith("{metric}") else m["label"].lower())
                     .replace("{dimension}", dim.lower()).replace("{n}", "5").replace("{time}", "tháng 9 năm 2026")
                     .replace("{granularity}", "theo tuần").replace("{horizon}", "3").replace("{cadence}", "tháng")
                     .replace("{scope}", "toàn hệ thống").replace("{value_a}", "Hồ Chí Minh").replace("{value_b}", "Hà Nội")
                     .replace("{metric_b}", "điểm đánh giá trung bình"))
                with self.subTest(mission=mission["id"], question=q):
                    r = self.pf(q, analysis_mission=mission["id"])
                    self.assertNotIn("unrecognized_question", self.codes(r))
                    self.assertNotIn("mission_mismatch", self.codes(r), r["findings"])


# --- §14–§21/§45 mission output grammar, §84 short answer, governed value labels --------

class MissionGrammarTests(Guarded):
    def guided(self, mission, question, contract, **extra):
        return self.report(ScriptedProvider(), question=question, analysis_mission=mission, input_mode="guided",
                           guided_contract=contract, analysis_depth=extra.pop("depth", "deep"),
                           time={"mode": "custom", "start": "2026-09-01", "end": "2026-09-30"}, **extra)

    def test_composition_never_repeats_a_view_and_never_adds_unrelated_forms(self):
        proposal, report = self.guided("composition", "Cơ cấu doanh thu theo phương thức thanh toán tháng 9 năm 2026",
                                       {"metric": "revenue", "dimension": "payment_method"})
        self.assertEqual(proposal["diagnostics"]["provider_call_count"], 0)
        keys = [(c["chart_type"], c.get("query_id"), tuple(c.get("dimension_ids", []))) for c in report["charts"]]
        self.assertEqual(len(keys), len(set(keys)), keys)
        dropped = {d["reason"] for d in report["mission_evidence"]["dropped"]}
        self.assertTrue(dropped <= {"duplicate_view", "outside_mission_grammar", "depth_budget"}, dropped)
        forms = [c["chart_type"] for c in report["charts"] if c["relevance_role"] == "supporting"]
        self.assertLessEqual(len([f for f in forms if f == "donut"]), 1)

    def test_overview_uses_one_breakdown_not_a_wall_of_donuts(self):
        _, report = self.guided("overview", "Tổng quan doanh thu tháng 9 năm 2026", {"metric": "revenue"})
        donuts = [c for c in report["charts"] if c["chart_type"] == "donut"]
        self.assertLessEqual(len(donuts), 1, [c["title"] for c in report["charts"]])

    def test_compare_reports_both_groups_gap_and_percentage_gap(self):
        _, report = self.guided("compare", "So sánh doanh thu Hồ Chí Minh và Hà Nội tháng 9 năm 2026",
                                {"metric": "revenue", "dimension": "city", "group_a": "Hồ Chí Minh", "group_b": "Hà Nội"})
        labels = [k["label"] for k in report["kpi_cards"]]
        self.assertEqual(labels[:2] and sorted(labels[:2]), ["Hà Nội", "Hồ Chí Minh"], labels)
        self.assertIn("Chênh lệch tuyệt đối", labels); self.assertIn("Chênh lệch %", labels)
        by = {k["label"]: k["value"] for k in report["kpi_cards"]}
        self.assertAlmostEqual(by["Chênh lệch tuyệt đối"], abs(by["Hồ Chí Minh"] - by["Hà Nội"]), places=2)
        self.assertNotIn("donut", [c["chart_type"] for c in report["charts"] if c["relevance_role"] == "primary"])
        self.assertTrue(("chênh lệch" in report["short_answer"][0].lower() or report["short_answer"][0].count(" cao hơn ") == 1) and len(report["short_answer"]) == len(set(report["short_answer"])))  # canonical comparison evidence may state the gap directly

    def test_kpi_cards_have_distinct_meanings(self):
        _, report = self.guided("trend", "Xu hướng doanh thu theo tuần tháng 9 năm 2026", {"metric": "revenue", "granularity": "week"})
        labels = [k["label"] for k in report["kpi_cards"]]
        self.assertEqual(len(labels), len(set(labels)), labels)

    def test_governed_value_labels_replace_raw_enum_codes(self):
        from services.business_labels import dimension_labeler
        defs = self.registry["dimensions"]
        label = dimension_labeler(["payment_method"], [], defs)
        self.assertEqual(label({"payment_method": "THANH_TOAN_KHI_NHAN_HANG"}, "payment_method"), "Thanh toán khi nhận hàng")
        self.assertEqual(label({"payment_method": "KHONG_BIET"}, "payment_method"), "KHONG_BIET")
        for mission in self.registry["analysis_missions"]:
            self.assertIn("max_supporting_per_form", mission)

    def test_every_governed_unit_is_rendered_with_its_own_unit(self):
        from services.chart_insight_service import fmt
        for id, metric in self.registry["metrics"].items():
            unit = metric.get("unit")
            text = fmt(1234.5 if unit != "%" else 12.5, unit)
            with self.subTest(metric=id, unit=unit):
                self.assertTrue(text.endswith("%") if unit == "%" else (("VND" in text) if unit == "VND" else text.endswith(unit)), text)
                self.assertNotIn("VND", text) if unit not in {"VND"} else None
