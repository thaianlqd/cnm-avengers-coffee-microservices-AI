"""V3.3 derived-statistic verification: every confirmed claim is recomputed from the artifact rows."""
import unittest
from copy import deepcopy

from services import chart_insight_service as cis
from services.analysis_catalog import AnalysisCatalog
from tests.analysis_fixtures import physical_metadata, result
from tests.test_agent_v22 import fixture_artifact, query


def catalog():
    return AnalysisCatalog(physical_metadata())


def grouped(values):
    a, _ = fixture_artifact(query("orders", "revenue", group_by=["store"]))
    a.result = result([{"store": f"s-{i}", "store_id": f"id-{i}", "revenue": v} for i, v in enumerate(values)])
    return a


def trend(values, metric="revenue"):
    a, _ = fixture_artifact(query("orders", metric, "trend", granularity="month"))
    a.result = result([{"period": f"2026-0{i + 1}-01", metric: v} for i, v in enumerate(values)])
    return a


def build(artifact, metric="revenue", chart_type="bar"):
    chart = {"id": "c1", "metric": metric, "chart_type": chart_type, "scope_ref": artifact.query.id, "relevance_role": "primary"}
    return cis.insight(chart, artifact, catalog())


class DerivedStatisticMutationTests(unittest.TestCase):
    def verify(self, block, artifact):
        return cis.verify_insights([block], {artifact.query.id: artifact})

    def test_untouched_facts_are_all_confirmed_including_hyphenated_row_keys(self):
        a = grouped([300.0, 120.0])
        block = build(a)
        calcs = [f["calc"]["kind"] for f in block["key_facts"] if f.get("calc")]
        self.assertIn("gap", calcs)
        v = self.verify(block, a)
        self.assertEqual((v["matched"], v["unsupported"]), (v["numeric_claims"], []))

    def test_changed_gap_value_sign_group_or_percentage_is_detected(self):
        a = grouped([300.0, 120.0])
        block = build(a)
        gap = next(f for f in block["key_facts"] if f.get("calc", {}).get("kind") == "gap")
        for field, wrong in (("value", gap["value"] + 50), ("value", -gap["value"])):
            bad = deepcopy(block)
            next(f for f in bad["key_facts"] if f.get("calc", {}).get("kind") == "gap")[field] = wrong
            self.assertTrue(self.verify(bad, a)["unsupported"], (field, wrong))
        wrong_pct = deepcopy(block)
        next(f for f in wrong_pct["key_facts"] if f.get("calc", {}).get("kind") == "gap")["calc"]["pct"] = 1.0
        self.assertTrue(self.verify(wrong_pct, a)["unsupported"])
        swapped = deepcopy(block)
        calc = next(f for f in swapped["key_facts"] if f.get("calc", {}).get("kind") == "gap")["calc"]
        calc["a"], calc["b"] = calc["b"], calc["a"]
        self.assertTrue(self.verify(swapped, a)["unsupported"])  # reversed groups => reversed sign

    def test_underlying_row_mutation_after_the_insight_was_written_is_detected(self):
        a = grouped([300.0, 120.0])
        block = build(a)
        a.result["rows"][0]["revenue"] = 301.0
        self.assertTrue(self.verify(block, a)["unsupported"])

    def test_trend_change_direction_and_amount_are_recomputed(self):
        a = trend([100.0, 150.0, 90.0, 60.0])
        block = build(a, chart_type="line")
        change = next(f for f in block["key_facts"] if f.get("calc", {}).get("kind") == "change")
        self.assertEqual(self.verify(block, a)["unsupported"], [])
        flipped = deepcopy(block)
        next(f for f in flipped["key_facts"] if f.get("calc", {}).get("kind") == "change")["calc"]["direction"] = "tăng" if change["calc"]["direction"] == "giảm" else "giảm"
        self.assertTrue(self.verify(flipped, a)["unsupported"])
        wrong = deepcopy(block)
        next(f for f in wrong["key_facts"] if f.get("calc", {}).get("kind") == "change")["value"] += 10
        self.assertTrue(self.verify(wrong, a)["unsupported"])

    def test_threshold_breach_count_is_recounted(self):
        a, _ = fixture_artifact(query("orders", "order_cancellation_rate", group_by=["store"]))
        a.result = result([{"store": "s-1", "order_cancellation_rate": 20.0}, {"store": "s-2", "order_cancellation_rate": 1.0}])
        block = build(a, "order_cancellation_rate")
        fact = next(f for f in block["key_facts"] if f.get("calc", {}).get("kind") == "threshold_breaches")
        self.assertEqual(self.verify(block, a)["unsupported"], [])
        fact["value"] = 0
        self.assertTrue(self.verify(block, a)["unsupported"])

    def test_derived_marker_without_typed_calc_is_never_auto_confirmed(self):
        a = grouped([300.0, 120.0])
        legacy = {"key_facts": [{"text": "x", "value": 999, "evidence_ref": f"{a.query.id}:revenue:s-0-s-1"},
                                {"text": "y", "value": 1, "evidence_ref": f"{a.query.id}:revenue:threshold_breaches"}]}
        v = cis.verify_insights([legacy], {a.query.id: a})
        self.assertEqual(v["matched"], 0)
        self.assertEqual(len(v["unsupported"]), 2)

    def test_hyphenated_row_key_resolves_exactly(self):
        a = grouped([300.0, 120.0, 80.0])  # keys s-0, s-1, s-2 contain '-'
        top = {"key_facts": [{"text": "Cao nhất", "value": 300.0, "evidence_ref": f"{a.query.id}:revenue:s-0|id-0"},
                             {"text": "Sai", "value": 301.0, "evidence_ref": f"{a.query.id}:revenue:s-0|id-0"}]}
        v = cis.verify_insights([top], {a.query.id: a})
        self.assertEqual((v["matched"], len(v["unsupported"])), (1, 1))


if __name__ == "__main__":
    unittest.main()


class ConclusionVerificationTests(unittest.TestCase):
    def test_dangling_or_missing_pieces_fail_the_conclusion_check(self):
        from services.verification_reconciliation_service import verify_conclusion
        good = {"answer": "x", "findings": [{"statement": "s", "evidence_id": "e1"}, {"statement": "f", "forecast_ref": "r1", "evidence_id": None}],
                "caveats": ["c"]}
        v = verify_conclusion(good, [{"id": "e1"}], [{"requirement_id": "r1"}])
        self.assertEqual((v["passed"], v["total"], v["dangling"]), (3, 3, []))
        bad = {"answer": "", "findings": [{"statement": "s", "evidence_id": "zz"}], "caveats": []}
        v = verify_conclusion(bad, [{"id": "e1"}], [{"requirement_id": "r1"}])
        self.assertEqual(v["passed"], 0); self.assertEqual(v["dangling"], ["zz"])
        self.assertFalse(verify_conclusion(None, [], [])["present"])


class ForecastQualityMappingTests(unittest.TestCase):
    def test_real_backtest_keys_are_mapped_and_missing_coverage_is_not_invented(self):
        from services.verification_reconciliation_service import forecast_quality
        forecast = {"metric_id": "revenue", "method": "holt_0.5_0.3", "status": "ok",
                    "backtest": {"mae": 6.35, "rmse": 7.6, "smape_pct": 4.13, "evaluated_points": 4, "test_horizon": 2, "folds": 2,
                                 "naive_baseline": {"mae": 12.0, "rmse": 14.2, "smape_pct": 7.95}, "improvement_vs_naive_pct": 47.06}}
        q = forecast_quality([forecast])[0]
        self.assertEqual(q["error_metrics"], {"mae": 6.35, "rmse": 7.6, "smape_pct": 4.13})
        self.assertEqual(q["backtest_window"], {"evaluated_points": 4, "test_horizon": 2, "folds": 2})
        self.assertEqual((q["baseline"], q["improvement_vs_naive_pct"]), ("naive", 47.06))
        self.assertIsNone(q["interval_coverage"])
        self.assertEqual(forecast_quality([{"metric_id": "revenue", "status": "insufficient_history"}])[0]["status"], "insufficient_history")


class TemporalSemanticsTests(unittest.TestCase):
    def features(self, rows, as_of):
        from datetime import date
        from services.insight_service import analytical_features
        a, _ = fixture_artifact(query("orders", "revenue", "trend", granularity="month"))
        a.result = result([{"period": p, "revenue": v} for p, v in rows])
        return a, analytical_features({"main": a}, as_of=as_of)

    def test_open_current_period_is_never_compared_as_a_complete_period_and_cannot_fake_a_decline(self):
        from datetime import date
        _, ev = self.features([("2026-07-01", 100.0), ("2026-08-01", 110.0), ("2026-09-01", 120.0), ("2026-10-01", 30.0)], date(2026, 10, 16))
        change = next(e for e in ev if e["feature"] == "change")
        self.assertEqual(change["values"]["direction"], "up")           # Oct (16 days) is open: not a "drop to 30"
        self.assertEqual((change["values"]["last_period"][:10], change["values"]["excluded_partial_buckets"]), ("2026-09-01", 1))

    def test_one_complete_period_is_not_a_trend_or_growth(self):
        from datetime import date
        _, ev = self.features([("2026-09-01", 120.0), ("2026-10-01", 30.0)], date(2026, 10, 16))
        self.assertFalse([e for e in ev if e["feature"] == "change"])
        self.assertTrue([e for e in ev if e["feature"] == "period_coverage"])  # disclosed, not silently dropped

    def test_zero_baseline_never_produces_an_infinite_percentage(self):
        from datetime import date
        _, ev = self.features([("2026-07-01", 0.0), ("2026-08-01", 50.0), ("2026-09-01", 80.0), ("2026-10-01", 5.0)], date(2026, 10, 16))
        change = next(e for e in ev if e["feature"] == "change")
        self.assertIsNone(change["values"]["change_pct"]); self.assertIn("kỳ đầu bằng 0", change["statement"])
