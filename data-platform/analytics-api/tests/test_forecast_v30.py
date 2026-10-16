"""V3.0 deterministic forecasting: engine, governed capability, pipeline wiring.

The provider only states metric/cadence/horizon (scripted here). Every forecast
number is computed server-side from verified history; nothing calls a network.
"""
import json
import math
import os
import unittest
from copy import deepcopy
from datetime import date, timedelta
from unittest.mock import Mock, patch
from common import AiTextToReportRequest
from services.analysis_pipeline import AnalysisPipeline, safe_failure
from services.analysis_catalog import AnalysisCatalog, AnalysisError, CATALOG_PATH
from services.semantic_catalog_validation import validate_catalog
from services import forecast_service as fs
from tests.agent_fixtures import ScriptedProvider, call
from tests.analysis_fixtures import physical_metadata
from evals.fixture_warehouse import FixtureWarehouse

REFERENCE = date(2026, 10, 15)
SPEC = {"forecastable": True, "cadences": ["day", "week", "month"], "min_history": {"day": 28, "week": 12, "month": 6},
        "max_horizon": {"day": 31, "week": 13, "month": 6}, "missing_data_policy": "zero_fill", "aggregation": "sum"}


def rows(values, start=date(2026, 7, 1), unit="day"):
    out, period = [], start
    for v in values:
        out.append({"period": period.isoformat(), "revenue": v}); period = fs._next(period, unit)
    return out


def envelope(**req):
    base = {"id": "r1", "goal": "Dự báo", "analysis_kind": "trend"}; base.update(req)
    return {"decision": "analyze", "requirements": [base]}


class OrdersWarehouse(FixtureWarehouse):
    """75 days of completed orders with a weekly pattern (independent oracle)."""
    def __init__(self, overlay):
        super().__init__(overlay)
        self.connection.execute("PRAGMA query_only=OFF")
        self.connection.execute("DELETE FROM silver.don_hang")
        day = date(2026, 8, 1)
        for i in range(75):
            amount = 100 + 50 * (day.weekday() >= 5)
            self.connection.execute("INSERT INTO silver.don_hang (ma_don_hang, co_so_ma, tong_tien, trang_thai_don_hang, loai_don_hang, ngay_tao) VALUES (?,?,?,?,?,?)",
                                    (f"o{i}", "s1", amount, "HOAN_THANH", "MANG_DI", day.isoformat() + "T10:00:00"))
            day += timedelta(days=1)
        self.connection.commit(); self.connection.execute("PRAGMA query_only=ON")


class ForecastEngineTests(unittest.TestCase):
    def test_trend_series_prefers_trend_model_and_beats_naive(self):
        series = fs.complete_series(rows([10 + 2 * i for i in range(40)]), "revenue", "day")
        out = fs.forecast(series, "day", 5, SPEC)
        self.assertTrue(out["method"].startswith("holt"))
        self.assertLess(out["backtest"]["mae"], out["backtest"]["naive_baseline"]["mae"])
        self.assertAlmostEqual(out["forecast"][0]["value"], 90.0, delta=1.0)
        self.assertEqual(len(out["forecast"]), 5)
        for p in out["forecast"]:
            self.assertLessEqual(p["lower_80"], p["value"]); self.assertLessEqual(p["value"], p["upper_80"])

    def test_weekly_seasonality_selects_seasonal_naive(self):
        values = [100 if (i % 7) < 5 else 300 for i in range(42)]
        out = fs.forecast(fs.complete_series(rows(values), "revenue", "day"), "day", 7, SPEC)
        self.assertEqual(out["method"], "seasonal_naive")
        self.assertEqual(out["backtest"]["mae"], 0.0)
        self.assertEqual([p["value"] for p in out["forecast"]], [values[-7 + h % 7] for h in range(7)])

    def test_deterministic_and_finite(self):
        series = fs.complete_series(rows([5, 7, 6, 9, 8, 11, 10] * 6), "revenue", "day")
        self.assertEqual(fs.forecast(series, "day", 3, SPEC), fs.forecast(series, "day", 3, SPEC))
        out = fs.forecast(series, "day", 3, SPEC)
        self.assertTrue(all(math.isfinite(p[k]) for p in out["forecast"] for k in ("value", "lower_80", "upper_80")))

    def test_insufficient_history_fails_fast_with_requirement(self):
        with self.assertRaises(AnalysisError) as caught:
            fs.forecast(fs.complete_series(rows([1.0] * 10), "revenue", "day"), "day", 3, SPEC)
        self.assertEqual(caught.exception.category, "forecast_insufficient_history")
        self.assertEqual((caught.exception.required_periods, caught.exception.available_periods), (28, 10))
        with self.assertRaises(AnalysisError) as caught:
            fs.forecast(fs.complete_series(rows([0.0] * 40), "revenue", "day"), "day", 3, SPEC)
        self.assertEqual(caught.exception.category, "forecast_insufficient_history")

    def test_incomplete_current_period_is_excluded_and_trailing_zeros_filled(self):
        monthly = rows([100, 110, 120, 130, 140, 150, 160, 5], start=date(2026, 3, 1), unit="month")
        series = fs.complete_series(monthly, "revenue", "month", reference=REFERENCE)
        self.assertEqual(series[-1], (date(2026, 9, 1), 160.0))  # October (in progress) excluded
        daily = rows([10.0] * 30, start=date(2026, 9, 1))  # last row 2026-09-30
        filled = fs.complete_series(daily, "revenue", "day", reference=REFERENCE)
        self.assertEqual(filled[-1], (date(2026, 10, 14), 0.0))  # complete days without rows are zero

    def test_horizon_counts_from_the_current_period(self):
        series = fs.complete_series(rows([100.0 + i for i in range(8)], start=date(2026, 2, 1), unit="month"),
                                    "revenue", "month", reference=REFERENCE)
        out = fs.forecast(series, "month", 1, SPEC, REFERENCE)  # "tháng sau" on 15/10
        self.assertEqual([(p["period"], p["kind"]) for p in out["forecast"]], [("2026-10-01", "in_progress"), ("2026-11-01", "future")])

    def test_seasonal_and_window_methods_skip_too_short_backtest_prefixes(self):
        # Review V3.0: 24 monthly periods at max horizon made seasonal_naive
        # index a prefix shorter than one season (IndexError → INTERNAL_ERROR).
        series = fs.complete_series(rows([100.0 + (i % 12) for i in range(24)], start=date(2024, 10, 1), unit="month"),
                                    "revenue", "month", reference=REFERENCE)
        self.assertEqual(len(series), 24)
        self.assertEqual(fs.forecast(series, "month", 6, SPEC, REFERENCE)["horizon"], 6)
        # A moving average must not be scored on a prefix shorter than its window.
        ma7 = fs.candidate_methods("week", 12)["moving_average_7"]
        self.assertEqual(fs.backtest([100.0] * 12, ma7, 3, 4)[0]["mae"], 0)

    def test_history_respects_the_approved_window(self):
        # Rolling "6 tháng" starts on the 16th: the clipped first month is not a period.
        monthly = rows([5.0, 100, 110, 120, 130, 140, 150], start=date(2026, 3, 1), unit="month")
        series = fs.complete_series(monthly, "revenue", "month", reference=REFERENCE, window={"start": "2026-04-16", "end": "2026-10-15"})
        self.assertEqual(series[0], (date(2026, 5, 1), 110.0))
        # A window ending long ago is not zero-filled to today nor projected across the gap.
        old = rows([100.0 + i for i in range(12)], start=date(2024, 1, 1), unit="month")
        series = fs.complete_series(old, "revenue", "month", reference=REFERENCE, window={"start": "2024-01-01", "end": "2024-12-31"})
        self.assertEqual(series[-1], (date(2024, 12, 1), 111.0))
        with self.assertRaises(AnalysisError) as caught:
            fs.forecast(series, "month", 1, SPEC, REFERENCE)
        self.assertEqual((caught.exception.category, caught.exception.history_end), ("forecast_insufficient_history", "2024-12-01"))

    def test_missing_forecast_history_does_not_discard_other_requirements(self):
        from types import SimpleNamespace
        catalog = AnalysisCatalog(physical_metadata())
        artifact = SimpleNamespace(plan=SimpleNamespace(metrics=["revenue"]), grounded=SimpleNamespace(period={"start": "2026-07-01", "end": "2026-10-15"}),
                                   result={"rows": rows([10.0] * 10, start=date(2026, 10, 1))})
        forecast_cov = {"requirement_id": "r2", "state": "RESOLVED", "operation_ids": ["q2"], "forecast": {"horizon": 3, "unit": "month"}}
        other_cov = {"requirement_id": "r1", "state": "RESOLVED", "operation_ids": ["q1"]}
        other = SimpleNamespace(query=SimpleNamespace(role="requested"))
        out = fs.report_forecasts({"q1": other, "q2": artifact}, [other_cov, forecast_cov], catalog, REFERENCE)
        self.assertEqual([(f["requirement_id"], f["status"]) for f in out], [("r2", "insufficient_history")])
        self.assertNotIn("forecast", out[0])
        with self.assertRaises(AnalysisError) as caught:  # forecast-only question stays INSUFFICIENT_DATA
            fs.report_forecasts({"q2": artifact}, [forecast_cov], catalog, REFERENCE)
        self.assertEqual(caught.exception.category, "forecast_insufficient_history")

    def test_structural_break_is_disclosed(self):
        out = fs.forecast(fs.complete_series(rows([100.0] * 40 + [0.0] * 8), "revenue", "day"), "day", 3, SPEC)
        self.assertTrue(any("giảm đột ngột" in text for text in out["limitations"]))

    def test_smape_skips_zero_actual_and_forecast(self):
        self.assertIsNone(fs._metrics([0.0], [0.0])["smape_pct"])


class ForecastCapabilityTests(unittest.TestCase):
    def setUp(self):
        self.catalog = AnalysisCatalog(physical_metadata())
        self.overlay = json.loads(CATALOG_PATH.read_text())

    def test_governed_metadata_and_bounds(self):
        self.assertEqual(sorted(m for m, d in self.catalog.registry["metrics"].items() if d.get("forecast", {}).get("forecastable")),
                         ["delivery_count", "order_count", "revenue", "store_order_count", "store_revenue"])
        for metric, unit, horizon, code in [("driver_rating", "month", 1, "forecast_unsupported"),
                                             ("revenue", "quarter", 1, "forecast_unsupported"),
                                             ("revenue", "day", 365, "forecast_horizon_invalid"),
                                             ("revenue", "day", 0, "forecast_horizon_invalid")]:
            with self.subTest(metric=metric, unit=unit, horizon=horizon), self.assertRaises(AnalysisError) as caught:
                fs.validate_request(self.catalog, metric, unit, horizon)
            self.assertEqual(caught.exception.category, code)
        self.assertEqual(fs.validate_request(self.catalog, "revenue", "day", 31)["min_history"]["day"], 28)

    def test_registry_rejects_ungoverned_forecasts(self):
        for metric, change in [("driver_rating", {"forecast": SPEC}), ("aov", {"forecast": SPEC}),
                               ("revenue", {"forecast": {**SPEC, "cadences": ["quarter"]}}),
                               ("revenue", {"forecast": {**SPEC, "max_horizon": {"day": 999, "week": 13, "month": 6}}})]:
            overlay = deepcopy(self.overlay); overlay["analysis_registry"]["metrics"][metric].update(deepcopy(change))
            with self.subTest(metric=metric), self.assertRaises(AnalysisError):
                validate_catalog(overlay, strict=True)

    def test_capability_view_advertises_forecastable_metrics(self):
        from services.domain_intelligence_service import DomainIntelligence
        caps = DomainIntelligence(self.catalog).capabilities()
        orders = next(d for d in caps["domains"] if d["id"] == "orders")
        self.assertTrue(next(m for m in orders["metrics"] if m["id"] == "revenue")["forecastable"])
        self.assertTrue(orders["example_questions"])
        self.assertEqual(next(d for d in caps["domains"] if d["id"] == "delivery")["freshness"], ["batch"])


class ForecastPipelineTests(unittest.TestCase):
    def setUp(self):
        self.enterContext(patch.dict(os.environ, {"AI_OFFLINE": "1", "DATA_ANALYST_ENV": "development",
            "DATA_ANALYST_SESSION_STORE": "memory", "DATA_ANALYST_ARTIFACT_STORE": "memory",
            "DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN": "3", "DATA_ANALYST_ENABLE_CONTRACT_REPAIR": "1",
            "DATA_ANALYST_ONE_SHOT_CONTEXT_MAX_CHARS": "24000"}))
        for target in ("requests.sessions.Session.request", "psycopg2.connect"):
            self.enterContext(patch(target, side_effect=AssertionError("External transport forbidden")))
        self.overlay = json.loads(CATALOG_PATH.read_text())

    def pipeline(self, provider, executor=None):
        return AnalysisPipeline(metadata_loader=physical_metadata, provider=provider, executor=executor or Mock(),
                                value_lookup=Mock(return_value=[]), owner_id="owner-a")

    def run_report(self, intent, question):
        provider = ScriptedProvider([call("submit_analysis_intent", intent)])
        warehouse = OrdersWarehouse(self.overlay)
        p = self.pipeline(provider, warehouse)
        request = AiTextToReportRequest(question=question, reference_date=REFERENCE)
        proposal = p.propose(request)
        pr = proposal["proposal"]
        request.session_id = pr["session_id"]; request.proposal_revision = pr["revision"]
        request.intent_fingerprint = pr["semantic_intent_fingerprint"]; request.plan_fingerprint = pr["resolved_plan_fingerprint"]
        request.catalog_fingerprint = pr["catalog_fingerprint"]
        report = self.pipeline(provider, warehouse).generate(request)
        warehouse.close()
        return provider, proposal, report

    def test_revenue_forecast_is_server_computed_from_verified_history(self):
        provider, proposal, report = self.run_report(envelope(metric_ids=["revenue"], forecast={"horizon": 7, "unit": "day"}),
                                                     "Dự báo doanh thu 7 ngày tới")
        self.assertEqual(provider.call_count, 1)
        self.assertEqual(report["status"], "success")
        self.assertIn("silver.don_hang", report["sql_query"]); self.assertIn("DATE_TRUNC('day'", report["sql_query"])
        f = report["forecasts"][0]
        self.assertEqual((f["metric_id"], f["unit"], f["horizon"]), ("revenue", "day", 7))
        self.assertEqual(f["method"], "seasonal_naive")  # weekly pattern in the oracle fixture
        self.assertEqual(f["history"]["end"], "2026-10-14")
        self.assertEqual(sum(p["kind"] == "future" for p in f["forecast"]), 7)
        self.assertEqual(report["quality_assessment"]["status"] != "not_scored", True)

    def test_unsupported_forecast_fails_before_execution_with_one_call(self):
        for intent, code in [(envelope(metric_ids=["driver_rating"], forecast={"horizon": 1, "unit": "month"}), "forecast_unsupported"),
                             (envelope(metric_ids=["revenue"], dimension_ids=["city"], forecast={"horizon": 7, "unit": "day"}), "forecast_unsupported"),
                             (envelope(metric_ids=["revenue", "order_count"], forecast={"horizon": 7, "unit": "day"}), "forecast_unsupported"),
                             (envelope(metric_ids=["revenue"], forecast={"horizon": 60, "unit": "day"}), "forecast_horizon_invalid")]:
            with self.subTest(code=code, intent=intent["requirements"][0]):
                provider = ScriptedProvider([call("submit_analysis_intent", intent)])
                p = self.pipeline(provider)
                with self.assertRaises(AnalysisError) as caught:
                    p.propose(AiTextToReportRequest(question="Dự báo", reference_date=REFERENCE))
                self.assertEqual(caught.exception.category, code)
                self.assertEqual(provider.call_count, 1); p.executor.assert_not_called()
                failure = safe_failure(caught.exception, p.calls, p.semantic_info)
                self.assertEqual(failure["error_type"], "FORECAST_UNAVAILABLE"); self.assertFalse(failure["retryable"])

    def test_insufficient_history_is_typed_after_execution(self):
        provider = ScriptedProvider([call("submit_analysis_intent", envelope(metric_ids=["revenue"], forecast={"horizon": 3, "unit": "day"},
                                                                             time={"kind": "rolling", "amount": 7, "unit": "day"}))])
        warehouse = OrdersWarehouse(self.overlay)
        p = self.pipeline(provider, warehouse)
        request = AiTextToReportRequest(question="Dự báo doanh thu 3 ngày tới từ 7 ngày gần nhất", reference_date=REFERENCE)
        pr = p.propose(request)["proposal"]
        request.session_id = pr["session_id"]; request.proposal_revision = pr["revision"]
        request.intent_fingerprint = pr["semantic_intent_fingerprint"]; request.plan_fingerprint = pr["resolved_plan_fingerprint"]
        request.catalog_fingerprint = pr["catalog_fingerprint"]
        with self.assertRaises(AnalysisError) as caught:
            self.pipeline(provider, warehouse).generate(request)
        warehouse.close()
        self.assertEqual(caught.exception.category, "forecast_insufficient_history")
        self.assertEqual(safe_failure(caught.exception)["analysis_state"], "INSUFFICIENT_DATA")

    def test_forecast_changes_meaning_fingerprint_but_legacy_intent_is_unchanged(self):
        from services.analysis_intent import AnalysisIntentEnvelope
        from services.analytical_resolver import intent_fingerprint
        catalog = AnalysisCatalog(physical_metadata())
        plain = AnalysisIntentEnvelope.model_validate(envelope(metric_ids=["revenue"], granularity="day"))
        forecast = AnalysisIntentEnvelope.model_validate(envelope(metric_ids=["revenue"], granularity="day", forecast={"horizon": 7, "unit": "day"}))
        self.assertNotEqual(intent_fingerprint(plain, REFERENCE, catalog), intent_fingerprint(forecast, REFERENCE, catalog))
        self.assertNotIn("forecast", plain.requirements[0].model_dump(mode="json", exclude_none=True))


if __name__ == "__main__":
    unittest.main()
