"""V3.1 Analyst Workspace: governed metadata, capabilities, zero-call preflight,
mission propagation, Risk Watch and coverage cache.

Every test forbids HTTP and PostgreSQL connections. Numerical expectations come
from separately authored oracles over the SQLite fixture, never from the
production catalog expressions.
"""
import json
import os
import re
import statistics
import time
import unittest
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock, patch

from common import AiPreflightRequest, AiTextToReportRequest
from evals.fixture_warehouse import FixtureWarehouse
from services import data_coverage_service, preflight_service, risk_watch_service
from services import forecast_service as fs
from services.analysis_catalog import AnalysisCatalog, AnalysisError, CATALOG_PATH
from services.analysis_contract import TimeScope
from services.analysis_pipeline import AnalysisPipeline
from services.domain_intelligence_service import DomainIntelligence
from services.semantic_catalog_validation import validate_catalog
from services.workspace_service import MISSION_IDS, follow_up_questions, mission_for, mission_layout
from tests.agent_fixtures import ScriptedProvider, call
from tests.analysis_fixtures import physical_metadata

REFERENCE = date(2026, 10, 16)
COVERAGE = {"status": "ready", "overall": {"min_date": "2026-01-01", "max_date": "2026-10-16"},
            "facts": {"silver.don_hang": {"label": "Đơn hàng", "min_date": "2026-01-01", "max_date": "2026-10-16"},
                      "silver.giao_hang": {"label": "Chuyến giao hàng", "min_date": "2026-01-01", "max_date": "2026-10-14"},
                      "silver.ca_lam_viec_nhan_vien": {"label": "Ca làm", "min_date": "2026-01-01", "max_date": "2026-10-02"}},
            "freshness": {"mode": "batch", "label": "Cập nhật theo đợt", "last_sync": "2026-10-16T04:29:15+00:00", "stale": False}}

# Independent fixture rows (status, store, amount, created) for the oracle.
EXTRA_ORDERS = [("o5", "s1", 50, "HOAN_THANH", "2026-09-19T09:00:00"), ("o6", "s1", 70, "DA_HUY", "2026-09-20T09:00:00"),
                ("o7", "s2", 90, "MOI_TAO", "2026-09-21T09:00:00")]
EXTRA_SHIFTS = [("w3", "Sáng", "NGHI_PHEP", "s1"), ("w4", "Tối", "ASSIGNED", "s1"), ("w5", "Chiều", "DI_TRE", "s2"),
                ("w6", "Sáng", "DUNG_GIO", "s2"), ("w7", "Tối", "DUNG_GIO", "s2")]
REDEMPTIONS = [(1, "v1", "Ưu đãi A", "s1", "2026-09-02T10:00:00"), (2, "v1", "Ưu đãi A", "s2", "2026-09-03T10:00:00"),
               (3, "v2", "Ưu đãi B", "s2", "2026-09-04T10:00:00"), (4, "v3", "Ưu đãi A", None, "2026-09-05T10:00:00")]


def oracle_orders():
    from evals.fixture_warehouse import ORDERS
    rows = [(o["ma_don_hang"], o["co_so_ma"], o["tong_tien"], o["trang_thai_don_hang"], o["ngay_tao"]) for o in ORDERS]
    return rows + EXTRA_ORDERS


def oracle_cancellation(rows, store):
    """Separately authored: cancelled / terminal (completed + cancelled)."""
    terminal = [r for r in rows if r[1] == store and r[3] in {"HOAN_THANH", "DA_HUY"}]
    return round(100.0 * sum(r[3] == "DA_HUY" for r in terminal) / len(terminal), 2)


def oracle_weekday_revenue(rows):
    out = {}
    for _, _, amount, status, created in rows:
        if status in {"HOAN_THANH", "DANG_GIAO"}:
            day = datetime.fromisoformat(created).isoweekday()
            out[day] = out.get(day, 0) + amount
    return out


def oracle_late_rate(shifts, store=None):
    attended = [s for s in shifts if (store is None or s[3] == store) and s[2] in {"DUNG_GIO", "DI_TRE", "VE_SOM"}]
    return round(100.0 * sum(s[2] == "DI_TRE" for s in attended) / len(attended), 2)


class WorkspaceWarehouse(FixtureWarehouse):
    def __init__(self, overlay):
        super().__init__(overlay)
        c = self.connection
        c.execute("PRAGMA query_only=OFF")
        for id, store, amount, status, created in EXTRA_ORDERS:
            c.execute("INSERT INTO silver.don_hang (ma_don_hang, co_so_ma, tong_tien, trang_thai_don_hang, loai_don_hang, ngay_tao) VALUES (?,?,?,?,?,?)",
                      (id, store, amount, status, "MANG_DI", created))
        for id, name, status, store in EXTRA_SHIFTS:
            c.execute("INSERT INTO silver.ca_lam_viec_nhan_vien (ma_ca_lam_viec, ten_ca, trang_thai_cham_cong, co_so_ma, ngay_lam_viec) VALUES (?,?,?,?,?)",
                      (id, name, status, store, "2026-09-16"))
        for id, code, name, store, used in REDEMPTIONS:
            c.execute("INSERT INTO silver.khuyen_mai_su_dung (ma_su_dung, ma_khuyen_mai, ten_khuyen_mai, co_so_ma, ngay_su_dung) VALUES (?,?,?,?,?)",
                      (id, code, name, store, used))
        c.execute("UPDATE silver.chi_nhanh SET loai_diem_ban = 'KIOSK_VE_TINH' WHERE ma_chi_nhanh = 's2'")
        c.execute("UPDATE silver.chi_nhanh SET loai_diem_ban = 'CHI_NHANH_CHINH' WHERE ma_chi_nhanh = 's1'")
        c.commit()
        c.execute("PRAGMA query_only=ON")


def shifts():
    from evals.fixture_warehouse import DATA
    base = [(s["ma_ca_lam_viec"], s["ten_ca"], s["trang_thai_cham_cong"], s["co_so_ma"]) for s in DATA["ca_lam_viec_nhan_vien"]]
    return base + EXTRA_SHIFTS


def requirement(**updates):
    base = dict(id="r1", goal="Phân tích", analysis_kind="aggregate", dimension_ids=[])
    base.update(updates)
    return base


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


# --- P1: governed metadata ------------------------------------------------

class GovernedMetadataTests(Guarded):
    def test_new_ratio_metrics_are_canonical_percentages(self):
        m = self.registry["metrics"]
        for id, numerator, population in (("order_cancellation_rate", "DA_HUY", ["HOAN_THANH", "DA_HUY"]),
                                          ("order_completion_rate", "HOAN_THANH", ["HOAN_THANH", "DA_HUY"]),
                                          ("late_shift_rate", "DI_TRE", ["DUNG_GIO", "DI_TRE", "VE_SOM"])):
            with self.subTest(metric=id):
                d = m[id]
                self.assertEqual((d["aggregation_semantics"], d["unit"], d["additive"], d["value_range"]), ("ratio", "%", False, [0, 100]))
                self.assertIn(f"= '{numerator}'", d["expression"])
                self.assertEqual(d["business_filters"][0]["value"], population)
                self.assertTrue(d["numerator"] and d["denominator"] and d["population_definition"])
        self.assertNotIn("order_completion_rate", self.registry["unsupported_capabilities"])
        # Order status values verified against order-service lifecycle and warehouse.
        self.assertTrue({"HOAN_THANH", "DA_HUY"} <= set(self.registry["dimensions"]["order_status"]["enum"]))
        self.assertIn("NGHI_PHEP", self.registry["dimensions"]["attendance_status"]["enum"])

    def test_weekday_is_governed_iso_expression_on_order_clock(self):
        d = self.registry["dimensions"]["weekday"]
        self.assertEqual(d["expression"], "EXTRACT(ISODOW FROM silver.don_hang.ngay_tao)")
        self.assertEqual(d["value_labels"]["1"], "Thứ Hai"); self.assertEqual(d["value_labels"]["7"], "Chủ nhật")
        self.assertNotIn("enum", d)  # integer enums would capture "top 5" as a weekday value
        self.assertIn("weekday", self.catalog.compatible_dimensions("revenue"))
        self.assertNotIn("weekday", self.catalog.compatible_dimensions("late_shift_rate"))

    def test_promotion_redemption_fact_is_complete_and_private(self):
        table = self.overlay["silver_tables"]["silver.khuyen_mai_su_dung"]
        self.assertEqual(table["source_scope"], "FULL_FACT")
        self.assertFalse(set(table["columns"]) & {"ma_nguoi_dung", "ma_don_hang", "so_dien_thoai", "email", "dia_chi"})
        self.assertEqual(self.registry["metrics"]["promotion_redemption_count"]["source"], "silver.khuyen_mai_su_dung")
        # The order-level promotion label must not leak onto the redemption fact.
        self.assertNotIn("promotion", self.catalog.compatible_dimensions("promotion_redemption_count"))
        self.assertNotIn("redeemed_promotion", self.catalog.compatible_dimensions("voucher_order_count"))

    def test_region_and_customer_cohorts_are_not_invented(self):
        # Deferred with evidence: 1/1215 branches carry khu_vuc_id; cohort
        # metrics need prior-period history the compiler cannot express.
        self.assertNotIn("region", self.registry["dimensions"])
        self.assertFalse({"returning_customer_rate", "new_customer_count"} & set(self.registry["metrics"]))

    def test_every_gold_mart_declares_scope_and_partial_marts_are_not_global(self):
        marts = self.registry["presentation_marts"]
        for name in ("gold.branch_taste_profile", "gold.customer_segments", "gold.menu_overview", "gold.order_status_distribution",
                     "gold.payment_methods_distribution", "gold.stores_overview", "gold.shipper_performance", "gold.revenue_daily"):
            self.assertIn(name, marts)
        for name, mart in marts.items():
            if mart["source_scope"] in {"TOP_N_MART", "FILTERED_MART", "PRESENTATION_ONLY"}:
                self.assertFalse(mart["global_aggregate_safe"], name)
        self.assertIn("đơn", " ".join(marts["gold.payment_methods_distribution"]["known_caveats"]))

    def test_registry_validator_rejects_invalid_workspace_metadata(self):
        def broken(change):
            overlay = deepcopy(self.overlay); change(overlay["analysis_registry"])
            with self.assertRaises(AnalysisError) as caught:
                validate_catalog(overlay, strict=True)
            self.assertEqual(caught.exception.category, "domain_metadata_invalid")
        missions = lambda r: r["analysis_missions"]
        signal = lambda r, id: next(s for s in r["risk_signals"] if s["id"] == id)
        broken(lambda r: missions(r).append(deepcopy(missions(r)[0])))                       # duplicate id
        broken(lambda r: missions(r)[0].update(operations=["invented_operation"]))           # unknown operation
        broken(lambda r: missions(r)[0].update(chart_forms=["pie3d"]))                      # unsupported chart
        broken(lambda r: missions(r)[5].update(metric_refs=["driver_rating"]))               # forecast mission, non-forecastable
        broken(lambda r: missions(r)[0]["template"].update(text="Không có slot"))            # template/slot mismatch
        broken(lambda r: signal(r, "late_shift_high").update(metric="unknown_metric"))
        broken(lambda r: signal(r, "late_shift_high").update(threshold=150))                 # outside 0..100
        broken(lambda r: signal(r, "delivery_success_low").update(operator="gt"))            # contradicts higher_better
        broken(lambda r: r["metrics"]["late_shift_rate"].update(additive=True))              # ratio additivity
        broken(lambda r: r["dimensions"]["weekday"].update(expression="EXTRACT(ISODOW FROM silver.ca_doi_soat.ngay_tao)"))
        broken(lambda r: r["metrics"]["customer_count"].update(time_column="silver.don_hang.ngay_tao"))  # snapshot + joined clock
        broken(lambda r: r["workspace"]["unsupported_concepts"]["profit_margin"].update(nearest_metrics=["no_such_metric"]))
        self.assertTrue(validate_catalog(deepcopy(self.overlay), strict=True))

    def test_late_shift_risk_uses_canonical_ratio_not_a_workspace_formula(self):
        s = next(s for s in self.registry["risk_signals"] if s["id"] == "late_shift_high")
        self.assertEqual((s["metric"], s["operator"], s["threshold"]), ("late_shift_rate", "gt", 15))
        d = next(s for s in self.registry["risk_signals"] if s["id"] == "delivery_success_low")
        self.assertEqual((d["metric"], d["threshold"]), ("delivery_success_rate", 90))
        self.assertTrue(all(set(s) <= {"id", "label", "metric", "operator", "threshold", "warning_margin", "observation_metric",
                                       "minimum_observations"} for s in self.registry["risk_signals"]))


class OracleTests(Guarded):
    def report(self, intent, question, mission=None, warehouse_cls=None):
        provider = ScriptedProvider([call("submit_analysis_intent", intent)])
        warehouse = (warehouse_cls or WorkspaceWarehouse)(self.overlay)
        p = AnalysisPipeline(metadata_loader=physical_metadata, provider=provider, executor=warehouse,
                             value_lookup=Mock(return_value=[]), owner_id="owner-a")
        request = AiTextToReportRequest(question=question, reference_date=REFERENCE, analysis_mission=mission)
        proposal = p.propose(request)
        self.assertEqual(proposal["status"], "proposal_ready", proposal.get("message"))
        pr = proposal["proposal"]
        request.session_id = pr["session_id"]; request.proposal_revision = pr["revision"]
        request.intent_fingerprint = pr["semantic_intent_fingerprint"]; request.plan_fingerprint = pr["resolved_plan_fingerprint"]
        request.catalog_fingerprint = pr["catalog_fingerprint"]
        report = AnalysisPipeline(metadata_loader=physical_metadata, provider=provider, executor=warehouse,
                                  value_lookup=Mock(return_value=[]), owner_id="owner-a").generate(request)
        warehouse.close()
        self.assertEqual(provider.call_count, 1)
        self.assertEqual(report["status"], "success", report.get("message"))
        return proposal, report

    def main_rows(self, report):
        return report["result_sets"][report["analytical_queries"][0]["id"]]["rows"]

    def test_cancellation_rate_by_store_matches_oracle(self):
        _, report = self.report(envelope(requirement(metric_ids=["order_cancellation_rate"], dimension_ids=["store"])),
                                "Tỷ lệ hủy đơn theo chi nhánh")
        sql = report["sql_query"]
        self.assertIn("silver.don_hang", sql); self.assertNotIn("gold.", sql)
        self.assertIn("'HOAN_THANH', 'DA_HUY'", sql)
        rows = {r["store_id"]: r["order_cancellation_rate"] for r in self.main_rows(report)}
        self.assertEqual(rows, {s: oracle_cancellation(oracle_orders(), s) for s in ("s1", "s2")})
        self.assertEqual(rows, {"s1": 33.33, "s2": 50.0})

    def test_completion_rate_whole_scope_matches_oracle(self):
        _, report = self.report(envelope(requirement(metric_ids=["order_completion_rate"])), "Tỷ lệ hoàn thành đơn")
        terminal = [r for r in oracle_orders() if r[3] in {"HOAN_THANH", "DA_HUY"}]
        expected = round(100.0 * sum(r[3] == "HOAN_THANH" for r in terminal) / len(terminal), 2)
        self.assertEqual(self.main_rows(report), [{"order_completion_rate": expected}])

    def test_revenue_by_weekday_matches_oracle_through_governed_expression(self):
        _, report = self.report(envelope(requirement(metric_ids=["revenue"], dimension_ids=["weekday"])), "Doanh thu theo thứ trong tuần")
        self.assertIn("EXTRACT(ISODOW FROM", report["sql_query"])
        rows = {int(r["weekday"]): r["revenue"] for r in self.main_rows(report)}
        self.assertEqual(rows, oracle_weekday_revenue(oracle_orders()))

    def test_late_shift_rate_excludes_leave_and_unchecked_shifts(self):
        _, report = self.report(envelope(requirement(metric_ids=["late_shift_rate"], dimension_ids=["store"])), "Tỷ lệ đi trễ theo chi nhánh")
        rows = {r["store_id"]: r["late_shift_rate"] for r in self.main_rows(report)}
        self.assertEqual(rows, {s: oracle_late_rate(shifts(), s) for s in ("s1", "s2")})

    def test_promotion_redemptions_by_program_match_oracle(self):
        _, report = self.report(envelope(requirement(metric_ids=["promotion_redemption_count"], dimension_ids=["redeemed_promotion"])),
                                "Chương trình khuyến mãi đã dùng nhiều nhất")
        rows = {r["redeemed_promotion"]: r["promotion_redemption_count"] for r in self.main_rows(report)}
        expected = {}
        for _, _, name, _, _ in REDEMPTIONS:
            expected[name] = expected.get(name, 0) + 1
        self.assertEqual(rows, expected)
        self.assertNotIn("ma_nguoi_dung", report["sql_query"])

    def test_current_incomplete_month_is_not_compared_as_complete(self):
        # Live finding (16/10): an all-time monthly trend compared January with the
        # in-progress October bucket (-96.7%), implying a collapse. The bucket that
        # contains the reference date is incomplete and must be excluded.
        class Wh(WorkspaceWarehouse):
            def __init__(self, overlay):
                super().__init__(overlay)
                self.connection.execute("PRAGMA query_only=OFF")
                for id, amount, created in (("a1", 300, "2026-08-10T09:00:00"), ("x1", 5, "2026-10-02T09:00:00")):
                    self.connection.execute("INSERT INTO silver.don_hang (ma_don_hang, co_so_ma, tong_tien, trang_thai_don_hang, loai_don_hang, ngay_tao) VALUES (?,?,?,?,?,?)",
                                            (id, "s1", amount, "HOAN_THANH", "MANG_DI", created))
                self.connection.commit(); self.connection.execute("PRAGMA query_only=ON")
        _, report = self.report(envelope(requirement(metric_ids=["revenue"], analysis_kind="trend", granularity="month")), "Doanh thu theo tháng", warehouse_cls=Wh)
        change = next(e for e in report["evidence"] if e["feature"] == "change")
        self.assertEqual((change["values"]["first_period"][:7], change["values"]["last_period"][:7]), ("2026-08", "2026-09"))
        self.assertEqual(change["values"]["excluded_partial_buckets"], 1)
        self.assertNotEqual(report["quality_assessment"]["status"], "not_scored")  # verifier recomputes the same evidence

    def test_mission_hint_organizes_but_never_changes_numbers(self):
        intent = envelope(requirement(metric_ids=["order_cancellation_rate"], dimension_ids=["store"]))
        _, plain = self.report(intent, "Tỷ lệ hủy đơn theo chi nhánh")
        proposal, compared = self.report(intent, "Tỷ lệ hủy đơn theo chi nhánh", mission="compare")
        self.assertEqual(self.main_rows(plain), self.main_rows(compared))
        self.assertIsNone(plain["analysis_mission"]); self.assertIsNone(plain["mission_layout"])
        self.assertEqual(compared["analysis_mission"], "compare")
        self.assertEqual(compared["diagnostics"]["analysis_mission"], "compare")
        self.assertEqual(proposal["diagnostics"]["analysis_mission"], "compare")
        self.assertEqual(compared["mission_layout"]["tab_order"][0], "comparison")
        self.assertEqual(sorted(compared["mission_layout"]["chart_order"]), sorted(c["id"] for c in compared["charts"]))
        self.assertEqual(compared["dashboard_plan"]["analysis_mission"], "compare")
        # The hint never reaches the model context.
        self.assertNotIn("compare", json.dumps(proposal["diagnostics"].get("request_anchors", {})))

    def test_unknown_mission_is_ignored_not_authoritative(self):
        _, report = self.report(envelope(requirement(metric_ids=["order_completion_rate"])), "Tỷ lệ hoàn thành đơn", mission="invented")
        self.assertIsNone(report["analysis_mission"])
        self.assertEqual(report["diagnostics"]["analysis_mission_ignored"], "invented")

    def test_follow_up_questions_are_deterministic_and_governed(self):
        _, report = self.report(envelope(requirement(metric_ids=["revenue"], dimension_ids=["store"])), "Doanh thu theo chi nhánh", mission="overview")
        follow = report["follow_up_questions"]
        self.assertTrue(2 <= len(follow) <= 4)
        self.assertTrue(any(f["kind"] == "forecast" for f in follow))  # revenue is forecastable
        labels = {d["business_name"].lower() for d in self.registry["dimensions"].values()}
        drill = next(f for f in follow if f["kind"] == "drilldown")
        self.assertTrue(any(l in drill["text"] for l in labels))
        self.assertEqual(follow, self.report(envelope(requirement(metric_ids=["revenue"], dimension_ids=["store"])),
                                             "Doanh thu theo chi nhánh", mission="overview")[1]["follow_up_questions"])


# --- P2: capabilities ------------------------------------------------------

class CapabilityTests(Guarded):
    def caps(self, coverage=COVERAGE):
        return DomainIntelligence(self.catalog).capabilities(coverage=coverage)

    def test_existing_fields_are_preserved_and_workspace_added(self):
        c = self.caps()
        for key in ("status", "version", "fingerprint", "registry_fingerprint", "domains", "analysis_depths", "time_presets", "scope_types"):
            self.assertIn(key, c)
        self.assertEqual(len(c["domains"]), 16)
        self.assertEqual([m["id"] for m in c["missions"]], list(MISSION_IDS))
        self.assertTrue(all(m["status"] in {"available", "partial", "unavailable"} for m in c["missions"]))
        self.assertTrue(all(m["reason"] for m in c["missions"] if m["status"] != "available"))
        self.assertEqual({d["id"] for d in c["analysis_depths"]}, {"focused", "deep", "comprehensive"})

    def test_limits_are_server_owned(self):
        from services.hybrid_analyst_planner import SYSTEM
        limits = self.caps()["limits"]
        self.assertEqual(limits["max_question_chars"], 8000)
        self.assertEqual(limits["max_dimensions"], 4)
        self.assertEqual(limits["max_requirements"], 6)
        self.assertIn("maximum 6", SYSTEM)  # registry limit agrees with the planner policy
        self.assertEqual(limits["forecast"]["revenue"]["max_horizon"]["month"], 6)
        self.assertEqual(set(limits["forecast"]), {"revenue", "order_count", "store_revenue", "store_order_count", "delivery_count"})

    def test_metric_metadata_dimensions_and_badges(self):
        metrics = {m["id"]: m for m in self.caps()["metrics"]}
        c = metrics["order_cancellation_rate"]
        dims = {d["id"] for d in c["dimensions"]}
        self.assertTrue({"store", "city", "weekday", "store_type"} <= dims)
        self.assertFalse(dims & {"store_id", "customer_id", "order_id", "order_status"})
        self.assertEqual((c["unit"], c["semantic_type"], c["historical"], c["forecastable"]), ("%", "ratio", True, False))
        self.assertTrue(c["definition"])
        self.assertTrue(metrics["low_stock_count"]["current"])
        self.assertTrue(metrics["revenue"]["forecastable"]); self.assertEqual(metrics["revenue"]["forecast"]["cadences"], ["day", "week", "month"])
        for m in metrics.values():
            self.assertFalse(re.search(r"so_dien_thoai|email|dia_chi|mat_khau", json.dumps(m, ensure_ascii=False)), m["id"])

    def test_unsupported_concepts_are_governed_with_nearest(self):
        unsupported = {u["id"]: u for u in self.caps()["unsupported"]}
        self.assertTrue({"marketing_roi", "profit_margin", "customer_happiness_index"} <= set(unsupported))
        self.assertIn("Doanh thu", [n["label"] for n in unsupported["profit_margin"]["nearest"]])

    def test_risk_signals_and_coverage_shape(self):
        c = self.caps()
        self.assertEqual({s["metric"] for s in c["risk_signals"]}, {"order_cancellation_rate", "delivery_success_rate",
            "large_cash_discrepancy_shift_count", "late_shift_rate", "low_stock_count", "avg_store_rating"})
        self.assertTrue(all(s["threshold_kind"] == "system_default" and s["configurable"] for s in c["risk_signals"]))
        self.assertEqual(c["data_coverage"]["freshness"]["mode"], "batch")
        self.assertIn("không phải chuẩn nghiệp vụ", c["threshold_policy"])
        self.assertEqual(c["dimension_value_labels"]["weekday"][0], {"value": 1, "label": "Thứ Hai"})

    def test_web_ui_fixture_matches_current_capabilities(self):
        # web-ui tests render against this backend-generated fixture; it must
        # not drift into a second catalog.
        fixture = json.loads((CATALOG_PATH.parent.parent / "tests" / "fixtures" / "capabilities_v31.json").read_text())
        c = self.caps()
        self.assertEqual([m["id"] for m in fixture["missions"]], [m["id"] for m in c["missions"]])
        self.assertEqual({m["id"]: m["dimensions"] for m in fixture["metrics"]}, {m["id"]: m["dimensions"] for m in c["metrics"]})
        self.assertEqual(fixture["limits"], c["limits"]); self.assertEqual(fixture["risk_signals"], c["risk_signals"])
        self.assertEqual(fixture["unsupported"], c["unsupported"]); self.assertEqual(fixture["registry_fingerprint"], c["registry_fingerprint"])

    def test_endpoint_reads_cached_coverage_without_warehouse_or_provider(self):
        from routers.ai import ai_capabilities
        data_coverage_service.set_snapshot(COVERAGE)
        self.addCleanup(data_coverage_service.set_snapshot, None)
        with patch("routers.ai.get_local_metadata", return_value=physical_metadata()), \
             patch("services.data_coverage_service.refresh", side_effect=AssertionError("no synchronous refresh")), \
             patch("services.agent_provider.NativeAgentProvider.__init__", side_effect=AssertionError("no provider")):
            c = ai_capabilities()
        self.assertEqual(c["data_coverage"]["overall"]["max_date"], "2026-10-16")
        data_coverage_service.set_snapshot(None)
        with patch("routers.ai.get_local_metadata", return_value=physical_metadata()):
            self.assertEqual(ai_capabilities()["data_coverage"]["status"], "loading")


# --- P2: preflight ---------------------------------------------------------

class PreflightTests(Guarded):
    def setUp(self):
        super().setUp()
        # Any warehouse/introspection/provider use in the hot path fails loudly.
        for target in ("services.metadata_service._introspect", "services.metadata_service.get_local_metadata",
                       "services.data_coverage_service.refresh", "services.agent_provider.NativeAgentProvider.__init__",
                       "services.sql_service.execute_read_only"):
            self.enterContext(patch(target, side_effect=AssertionError("forbidden in preflight: " + target)))

    def run_pf(self, question, **kw):
        return preflight_service.run(question, reference=REFERENCE, catalog=self.catalog,
                                     coverage=kw.pop("coverage", COVERAGE), **kw)

    def codes(self, result):
        return {f["code"]: f for f in result["findings"]}

    def test_forecast_horizon_and_grouping_warn_with_deterministic_fixes(self):
        r = self.run_pf("Dự báo doanh thu 12 tháng tới theo từng chi nhánh")
        codes = self.codes(r)
        self.assertEqual(r["status"], "warning"); self.assertTrue(r["can_submit"])  # fixable limits are not hard blocks
        self.assertEqual(codes["forecast_horizon_exceeded"]["level"], "warn")
        self.assertEqual(codes["forecast_horizon_exceeded"]["maximum"], 6)
        self.assertEqual(codes["forecast_horizon_exceeded"]["fixes"][0]["question"], "Dự báo doanh thu 6 tháng tới theo từng chi nhánh")
        self.assertEqual(codes["forecast_grouped_unsupported"]["fixes"][0]["question"], "Dự báo doanh thu 12 tháng tới")
        self.assertEqual((r["provider_calls"], r["warehouse_queries"]), (0, 0))
        self.assertEqual([m["id"] for m in r["understood"]["metrics"]], ["revenue"])

    def test_forecast_of_non_forecastable_metric_warns(self):
        codes = self.codes(self.run_pf("Dự báo tỷ lệ đi trễ 3 tháng tới"))
        self.assertIn("forecast_metric_unsupported", codes)
        self.assertTrue(all(f["question"].startswith("Dự báo") for f in codes["forecast_metric_unsupported"]["fixes"]))

    def test_privacy_is_the_hard_block(self):
        r = self.run_pf("số điện thoại khách hàng mua nhiều nhất")
        self.assertEqual(r["status"], "blocked"); self.assertFalse(r["can_submit"])
        self.assertEqual(self.codes(r)["privacy_blocked"]["level"], "block")

    def test_question_too_long_blocks(self):
        r = self.run_pf("doanh thu " * 900)
        self.assertEqual(self.codes(r)["question_too_long"]["level"], "block")
        self.assertEqual(self.codes(r)["question_too_long"]["max_chars"], 8000)
        self.assertFalse(r["can_submit"])

    def test_invalid_structure_blocks(self):
        r = self.run_pf("Doanh thu", time_range={"mode": "custom", "start": "2026-10-01", "end": "2026-09-01"})
        self.assertEqual(self.codes(r)["structurally_invalid_input"]["level"], "block")
        self.assertFalse(self.run_pf("   ")["can_submit"])

    def test_time_outside_cached_coverage_warns(self):
        r = self.run_pf("doanh thu năm 2024")
        f = self.codes(r)["time_outside_data"]
        self.assertEqual(f["level"], "warn")
        self.assertEqual(f["fixes"][0]["question"], "doanh thu năm 2026")
        self.assertEqual(f["coverage"], {"min_date": "2026-01-01", "max_date": "2026-10-16"})
        self.assertNotIn("time_outside_data", self.codes(self.run_pf("doanh thu năm 2024", coverage={}))) # unknown → no guess

    def test_partial_time_coverage_uses_the_metric_fact(self):
        r = self.run_pf("Tỷ lệ đi trễ từ 2026-09-15 đến 2026-10-10")
        self.assertEqual(self.codes(r)["time_partially_covered"]["coverage"]["max_date"], "2026-10-02")

    def test_snapshot_metric_trend_warns(self):
        self.assertIn("snapshot_metric_trend", self.codes(self.run_pf("Số sản phẩm sắp hết hàng theo tháng năm 2026")))

    def test_unsupported_concept_warns_with_nearest(self):
        f = self.codes(self.run_pf("Chỉ số hạnh phúc của khách hàng"))["unsupported_concept"]
        self.assertEqual(f["level"], "warn")
        self.assertTrue(f["nearest"] and f["fixes"])
        self.assertIn("unsupported_concept", self.codes(self.run_pf("Lợi nhuận theo chi nhánh")))

    def test_too_many_goals_warns(self):
        q = "Doanh thu, số lượng đơn, tỷ lệ hủy đơn, tỷ lệ giao thành công, tỷ lệ đi trễ, số ca lệch tiền lớn và lượt dùng khuyến mãi theo chi nhánh"
        self.assertEqual(self.codes(self.run_pf(q))["too_many_goals"]["maximum"], 6)

    def test_no_metric_is_info_only(self):
        r = self.run_pf("Kiểm tra hoạt động")
        self.assertEqual(self.codes(r)["no_metric_detected"]["level"], "info")
        self.assertEqual(r["status"], "ok")

    def test_supported_questions_pass_cleanly(self):
        for q in ("Tỷ lệ hủy đơn theo chi nhánh", "Doanh thu theo thứ trong tuần"):
            r = self.run_pf(q)
            self.assertFalse([f for f in r["findings"] if f["level"] != "info"], q)
        self.assertEqual([d["id"] for d in self.run_pf("Doanh thu theo thứ trong tuần")["understood"]["dimensions"]], ["weekday"])

    def test_mission_is_echoed_and_mismatch_is_info(self):
        r = self.run_pf("Doanh thu theo chi nhánh", analysis_mission="forecast")
        self.assertEqual(r["understood"]["mission"]["id"], "forecast")
        self.assertEqual(self.codes(r)["mission_hint_only"]["level"], "info")
        self.assertIn("mission_caveat", self.codes(self.run_pf("Doanh thu", analysis_mission="relationship")))

    def test_stale_forecast_input_is_explicit(self):
        stale = deepcopy(COVERAGE); stale["facts"]["silver.don_hang"]["max_date"] = "2026-10-02"
        self.assertIn("forecast_data_stale", self.codes(self.run_pf("Dự báo doanh thu 3 tháng tới", coverage=stale)))

    def test_hot_path_latency_and_no_io(self):
        preflight_service.run("x", reference=REFERENCE, catalog=self.catalog, coverage=COVERAGE)
        samples = []
        for i in range(30):
            started = time.perf_counter()
            preflight_service.run(f"Dự báo doanh thu {i % 9 + 1} tháng tới theo từng chi nhánh", reference=REFERENCE,
                                  catalog=self.catalog, coverage=COVERAGE)
            samples.append((time.perf_counter() - started) * 1000)
        p95 = statistics.quantiles(samples, n=20)[18]
        self.assertLess(p95, 50, f"p95={p95:.1f}ms")

    def test_preflight_catalog_never_introspects(self):
        preflight_service._catalog.update(key=None, value=None)
        with patch("services.metadata_service.peek_local_metadata", return_value=None):
            catalog = preflight_service.preflight_catalog()
        self.assertIn("silver.khuyen_mai_su_dung", catalog.tables)
        result = preflight_service.run("Doanh thu tháng 9 năm 2026", reference=REFERENCE, catalog=catalog, coverage=None)
        self.assertEqual(result["coverage_status"], "not_loaded")

    def test_router_validates_and_rate_limits(self):
        import routers.ai as ai
        ai._preflight_limiter = preflight_service.RateLimiter(2, 60)
        self.addCleanup(setattr, ai, "_preflight_limiter", None)
        payload = AiPreflightRequest(question="Tỷ lệ hủy đơn theo chi nhánh", reference_date=REFERENCE)
        with patch("services.preflight_service.preflight_catalog", return_value=self.catalog), \
             patch("services.data_coverage_service.peek", return_value=COVERAGE):
            self.assertTrue(ai.ai_preflight(payload)["can_submit"])
            ai.ai_preflight(payload)
            from fastapi import HTTPException
            with self.assertRaises(HTTPException) as caught:
                ai.ai_preflight(payload)
        self.assertEqual(caught.exception.status_code, 429)

    def test_mapped_text_matches_value_text(self):
        from services.value_grounding_service import value_text
        for q in ("Dự báo DOANH THU, 12 tháng tới!!", "  Tỷ lệ   hủy-đơn_theo chi nhánh  ", "Đà Nẵng & Hà Nội"):
            self.assertEqual(preflight_service.mapped_text(q)[0], value_text(q))


# --- Risk Watch ------------------------------------------------------------

class RiskWatchTests(Guarded):
    def test_classification_is_server_side_and_has_no_composite_score(self):
        s = {"operator": "gt", "threshold": 8, "warning_margin": 2}
        self.assertEqual([risk_watch_service.classify(v, s) for v in (9, 8, 6.5, 5, None)], ["red", "yellow", "yellow", "green", "no_data"])
        low = {"operator": "lt", "threshold": 90, "warning_margin": 3}
        self.assertEqual([risk_watch_service.classify(v, low) for v in (89.9, 92, 95)], ["red", "yellow", "green"])

    def test_kiosk_scope_uses_canonical_metrics_and_thresholds(self):
        warehouse = WorkspaceWarehouse(self.overlay)
        executed = []
        def executor(sql, **kw):
            executed.append(sql); return warehouse(sql, **kw)
        scope = {"mode": "selected", "filters": [{"dimension": "store_type", "operator": "in", "value": ["KIOSK_NHUONG_QUYEN", "KIOSK_VE_TINH"]}]}
        result = risk_watch_service.evaluate(self.catalog, scope, TimeScope(mode="custom", start=date(2026, 9, 1), end=date(2026, 9, 30)),
                                             executor=executor, reference=REFERENCE)
        warehouse.close()
        signals = {s["id"]: s for s in result["signals"]}
        self.assertIsNone(result["composite_score"]); self.assertEqual(result["provider_calls"], 0)
        late = signals["late_shift_high"]
        self.assertEqual(late["value"], oracle_late_rate(shifts(), "s2"))  # only s2 is a kiosk
        self.assertEqual(late["status"], "red" if late["value"] > 15 else "green")
        cancel = signals["order_cancellation_high"]
        self.assertEqual(cancel["value"], oracle_cancellation(oracle_orders(), "s2"))
        self.assertEqual((cancel["status"], cancel["breakdown"]["groups_in_breach"]), ("red", 1))
        self.assertTrue(all("silver." in sql and "gold." not in sql for sql in executed))
        self.assertTrue(all("KIOSK_VE_TINH" in sql for sql in executed))
        self.assertTrue(any("'DELIVERED', 'FAILED', 'CANCELLED'" in sql for sql in executed))  # canonical delivery_success_rate
        self.assertIn("không áp dụng", signals["low_stock_exists"]["note"])  # snapshot ignores the period
        self.assertTrue(all(s["status_label"] for s in result["signals"]))

    def test_healthy_total_does_not_hide_breaching_groups(self):
        # Whole scope: s1 33.33% and s2 50% cancellations → both stores breach 8%,
        # so lower the bar to make the total green while one store still breaches.
        warehouse = WorkspaceWarehouse(self.overlay)
        catalog = deepcopy(self.catalog)
        signal = next(s for s in catalog.registry["risk_signals"] if s["id"] == "order_cancellation_high")
        signal.update(threshold=45, warning_margin=0)
        result = risk_watch_service.evaluate(catalog, None, None, executor=warehouse, reference=REFERENCE)
        warehouse.close()
        cancel = next(s for s in result["signals"] if s["id"] == "order_cancellation_high")
        self.assertEqual(cancel["status"], "green")
        self.assertEqual(cancel["breakdown"]["groups_in_breach"], 1)
        self.assertIn("vượt ngưỡng", cancel["note"])

    def test_risk_endpoint_is_rate_limited_and_rejects_bad_time(self):
        import routers.ai as ai
        from common import AiRiskWatchRequest
        from fastapi import HTTPException
        ai._risk_limiter = preflight_service.RateLimiter(1, 60)
        self.addCleanup(setattr, ai, "_risk_limiter", None)
        with patch("routers.ai.get_local_metadata", return_value=physical_metadata()), \
             patch("services.risk_watch_service.evaluate", return_value={"status": "success"}):
            self.assertEqual(ai.ai_risk_watch(AiRiskWatchRequest(question="Rủi ro", reference_date=REFERENCE))["status"], "success")
            with self.assertRaises(HTTPException) as caught:
                ai.ai_risk_watch(AiRiskWatchRequest(question="Rủi ro", reference_date=REFERENCE))
        self.assertEqual(caught.exception.status_code, 429)
        ai._risk_limiter = preflight_service.RateLimiter(5, 60)
        with patch("routers.ai.get_local_metadata", return_value=physical_metadata()), \
             patch("services.risk_watch_service.evaluate", side_effect=ValueError("bad time")):
            with self.assertRaises(HTTPException) as caught:
                ai.ai_risk_watch(AiRiskWatchRequest(question="Rủi ro", reference_date=REFERENCE))
        self.assertEqual(caught.exception.status_code, 422)

    def test_incompatible_scope_is_not_applicable_and_unknown_values_rejected(self):
        scope = {"mode": "selected", "filters": [{"dimension": "payment_method", "operator": "in", "value": ["TIEN_MAT"]}]}
        warehouse = WorkspaceWarehouse(self.overlay)
        result = risk_watch_service.evaluate(self.catalog, scope, None, executor=warehouse, reference=REFERENCE)
        warehouse.close()
        self.assertEqual(next(s for s in result["signals"] if s["id"] == "late_shift_high")["status"], "not_applicable")
        with self.assertRaises(AnalysisError):
            risk_watch_service.scope_filters(self.catalog, {"mode": "selected", "filters": [{"dimension": "store_type", "value": ["X"]}]})
        with self.assertRaises(AnalysisError):
            risk_watch_service.scope_filters(self.catalog, {"mode": "selected", "filters": [{"dimension": "customer_id", "value": ["u1"]}]})


# --- Coverage cache, forecast history, readiness ---------------------------

class CoverageAndHardeningTests(Guarded):
    def test_snapshot_is_built_from_governed_complete_facts(self):
        rows = {"silver.don_hang.ngay_tao": {"min": datetime(2026, 1, 1, 7), "max": datetime(2026, 10, 16, 3), "rows": 10},
                "silver.ca_lam_viec_nhan_vien.ngay_lam_viec": {"min": date(2026, 1, 1), "max": date(2026, 10, 2), "rows": 4}}
        now = datetime(2026, 10, 16, 6, tzinfo=timezone.utc)
        snap = data_coverage_service.build_snapshot(rows, {"finished_at": datetime(2026, 10, 16, 4, 29, tzinfo=timezone.utc), "status": "success"}, self.overlay, now)
        self.assertEqual(snap["overall"], {"min_date": "2026-01-01", "max_date": "2026-10-16"})
        self.assertEqual(snap["facts"]["silver.ca_lam_viec_nhan_vien"]["max_date"], "2026-10-02")
        self.assertNotIn("silver.chi_nhanh", snap["facts"])  # snapshots carry no history
        self.assertEqual((snap["freshness"]["mode"], snap["freshness"]["stale"]), ("batch", False))
        old = data_coverage_service.build_snapshot(rows, {"finished_at": datetime(2026, 10, 10, tzinfo=timezone.utc)}, self.overlay, now)
        self.assertTrue(old["freshness"]["stale"])

    def test_refresh_is_read_only_bounds_and_peek_has_no_io(self):
        statements = []
        class Cursor:
            def __enter__(self): return self
            def __exit__(self, *a): return False
            def execute(self, sql, *a): statements.append(str(sql))
            def fetchone(self): return {"min": date(2026, 1, 1), "max": date(2026, 10, 1), "rows": 1, "finished_at": None, "status": "success"}
        class Conn:
            def cursor(self): return Cursor()
            def rollback(self): pass
            def close(self): pass
        snapshot = data_coverage_service.refresh(self.overlay, connection_factory=Conn)
        self.addCleanup(data_coverage_service.set_snapshot, None)
        self.assertEqual(snapshot["status"], "ready")
        self.assertTrue(all("SELECT" in s.upper() and not re.search(r"\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE)\b", s.upper()) for s in statements))
        with patch("services.readiness_service.warehouse_connection", side_effect=AssertionError("peek must not connect")):
            self.assertEqual(data_coverage_service.peek()["status"], "ready")

    def test_forecast_exposes_verified_history_points(self):
        values = [100 + (i % 7) * 10 for i in range(60)]
        start = date(2026, 8, 1)
        rows = [{"period": (start + timedelta(days=i)).isoformat(), "revenue": v} for i, v in enumerate(values)]
        artifact = SimpleNamespace(plan=SimpleNamespace(metrics=["revenue"]), grounded=SimpleNamespace(period={"start": "2026-08-01", "end": "2026-09-30"}),
                                   result={"rows": rows}, query=SimpleNamespace(role="requested"))
        coverage = [{"requirement_id": "r1", "state": "RESOLVED", "operation_ids": ["q1"], "forecast": {"horizon": 7, "unit": "day"}}]
        out = fs.report_forecasts({"q1": artifact}, coverage, self.catalog, date(2026, 10, 1))[0]
        self.assertEqual(out["status"], "ok")
        # Exactly the completed series the method was fitted on (V3.0 rules).
        series = fs.complete_series(rows, "revenue", "day", "zero_fill", date(2026, 10, 1), artifact.grounded.period)
        self.assertEqual(out["history_points"], [{"period": d.isoformat(), "value": float(v)} for d, v in series[-60:]])
        self.assertEqual(out["history_points"][-1]["period"], out["history"]["end"])
        self.assertEqual(len(series), out["history"]["periods"])

    def test_invalid_semantic_repair_allowance_fails_readiness(self):
        from services.readiness_service import readiness
        with patch.dict(os.environ, {"DATA_ANALYST_MAX_SEMANTIC_REPAIRS": "7"}), \
             patch("services.readiness_service.catalog_probe", return_value=True), \
             patch("services.provider_health_service.provider_health", return_value={"state": "unknown"}):
            self.assertFalse(readiness()["backend_configuration_valid"])
        with patch.dict(os.environ, {"DATA_ANALYST_MAX_SEMANTIC_REPAIRS": "1"}), \
             patch("services.readiness_service.catalog_probe", return_value=True), \
             patch("services.provider_health_service.provider_health", return_value={"state": "unknown"}):
            self.assertTrue(readiness()["backend_configuration_valid"])

    def test_mission_layout_orders_by_mission_forms(self):
        mission = mission_for(self.registry, "trend")
        charts = [{"id": "b", "chart_type": "bar"}, {"id": "l", "chart_type": "line"}, {"id": "s", "chart_type": "line", "role": "supporting"}]
        self.assertEqual(mission_layout(mission, charts)["chart_order"], ["l", "b", "s"])
        self.assertIsNone(mission_layout(None, charts))


if __name__ == "__main__":
    unittest.main()
