"""Regressions for live result failures; all provider/DB access is forbidden."""
from copy import deepcopy
from datetime import date, datetime
from decimal import Decimal
import unittest
from unittest.mock import Mock, patch

from common import AiTextToReportRequest
from services.analysis_catalog import AnalysisCatalog, AnalysisError
from services.analysis_contract import AnalysisSpec, MAX_ANALYTICAL_ROWS
from services.analysis_pipeline import safe_failure
from tests.archive_planner import ArchivedGraphPipeline as AnalysisPipeline
from services.analysis_query import build_plans, validate_results, validate_sql
from services.analytical_blueprint_service import materialize, BlueprintIssue
from services.domain_intelligence_service import DomainIntelligence
from tests.analysis_fixtures import physical_metadata, result
from tests.test_one_shot_v24 import scripted
from tests.test_natural_v26 import plan


class ResultReliabilityTests(unittest.TestCase):
    def setUp(self):
        for name in ("requests.sessions.Session.request", "psycopg2.connect"):
            guard = patch(name, side_effect=AssertionError("External access forbidden"))
            guard.start(); self.addCleanup(guard.stop)
        self.catalog = AnalysisCatalog(physical_metadata())

    def pipeline(self, operations):
        return AnalysisPipeline(metadata_loader=physical_metadata, provider=scripted(plan(*operations, breadth="deep")),
                                executor=Mock(), value_lookup=Mock(return_value=[]))

    def artifact(self, lens, **updates):
        p = self.pipeline([])
        agent = p.agent(self.catalog, date(2026, 10, 7))
        agent.queries.enforce_discovery = False
        raw, _ = materialize({"id": "check", "lens_id": lens, "time": {"kind": "relative", "mode": "previous_month"}, **updates}, self.catalog, DomainIntelligence(self.catalog))
        return p, agent.queries, agent.queries.prepare(raw)

    def test_deep_report_complete_large_groups_numeric_hours_and_zero_approval_ai(self):
        operations = [{"id": id, "lens_id": lens} for id, lens in (
            ("summary", "sales_overview"), ("trend", "sales_trend"),
            ("stores", "store_performance"), ("products", "product_sales"), ("hours", "hourly_load"))]
        for wording in ("Phân tích tình hình bán hàng tại TP.HCM.", "Đánh giá kết quả kinh doanh khu vực này"):
            p = self.pipeline(operations)
            req = AiTextToReportRequest(question=wording, time={"mode": "previous_month"},
                                       analysis_expectation="Phân tích sâu thêm các yếu tố liên quan nếu dữ liệu cho phép.", reference_date=date(2026, 10, 7))
            proposal = p.propose(req)
            p.executor.assert_not_called()
            agent = p._last_agent
            sql_rows = {}
            for a in agent.queries.pending.values():
                count = 145 if a.query.id in {"stores", "products"} else 16 if a.query.id == "hours" else 3 if a.query.id == "trend" else 1
                rows = []
                for i in range(count):
                    row = {d: i if d == "hour" else f"Nhóm {i:04d}" for d in a.plan.dimensions}
                    row.update({m: Decimal(i + 10) for m in a.plan.metrics})
                    if a.plan.kind == "trend": row["period"] = datetime(2026, 8, 31) if i == 0 else datetime(2026, 9, i * 7)
                    rows.append(row)
                sql_rows[a.sql] = result(rows)
            p.executor.side_effect = lambda sql, **kw: deepcopy(sql_rows[sql])
            req.session_id = proposal["session_id"]
            report = p.generate(req)
            self.assertEqual(p.provider.call_count, 1)
            self.assertEqual(report["diagnostics"]["provider_call_count"], 0)
            self.assertEqual(p.executor.call_count, 5)
            self.assertEqual(report["result_sets"]["products"]["total_rows"], 145)
            self.assertEqual(report["result_sets"]["stores"]["total_rows"], 145)
            from services.result_artifact_store import artifact_store
            self.assertEqual(len(artifact_store().get(report['result_sets']['products']['artifact_ref'])['rows']),145)
            self.assertLessEqual(len(report['result_sets']['products']['rows']),50)
            for id in ("trend", "stores", "products", "hours"):
                self.assertTrue(any(c["query_id"] == id for c in report["charts"]))
            for c in report["charts"]:
                if c["query_id"] in {"products", "stores"}:
                    self.assertEqual(c["selection"], "display_subset")
                    self.assertEqual(c["population_count"], 145)
                    self.assertEqual(c["displayed_count"], 20)
                    self.assertIn("20/145", c["title"])
                    self.assertEqual(c["data"][0]["value"], 154)

    def test_revenue_lens_default_explicit_override_and_true_ambiguity(self):
        for metrics in (None, ["store_aov"], ["purchasing_customer_count"]):
            updates = {} if metrics is None else {"metrics": metrics}
            _, _, a = self.artifact("store_performance", **updates)
            self.assertEqual(a.plan.metrics, metrics or ["store_revenue"])
        overlay = deepcopy(self.catalog.overlay)
        lens = overlay["analysis_registry"]["domain_intelligence"]["profiles"]["stores"]["analytical_lenses"][0]
        lens["blueprint"]["default_metric_refs"] = []
        c = AnalysisCatalog(physical_metadata(), overlay)
        with self.assertRaises(BlueprintIssue):
            materialize({"id": "check", "lens_id": lens["id"]}, c, DomainIntelligence(c))

    def test_population_boundary_and_strict_top_n_detail_and_explicit_limits(self):
        _, _, a = self.artifact("product_sales")
        rows = [{"product": f"Product {i}", "product_id": i, "product_revenue": Decimal(i)} for i in range(MAX_ANALYTICAL_ROWS)]
        self.assertEqual(a.plan.row_limit, MAX_ANALYTICAL_ROWS)
        self.assertTrue(validate_results(result(rows), a.plan, a.grounded, self.catalog).valid)
        self.assertFalse(validate_results(result(rows + [{"product": "Overflow", "product_id": -1, "product_revenue": 1}]), a.plan, a.grounded, self.catalog).valid)
        self.assertFalse(validate_results({**result(rows), "truncated": True}, a.plan, a.grounded, self.catalog).valid)
        _, _, ranked = self.artifact("product_volume", ranking={"top_n": 5})
        self.assertEqual(ranked.plan.row_limit, 5)
        _, _, limited = self.artifact("product_sales", limit=10)
        self.assertEqual(limited.plan.row_limit, 10)
        self.assertTrue(limited.plan.explicit_limit)
        spec = AnalysisSpec(analysis_kind="detail", subject="orders", detail_columns=["order_id"], time_range={"mode": "previous_month"})
        g = self.catalog.ground(spec, date(2026, 10, 7))
        self.assertEqual(build_plans(g, self.catalog)[0].row_limit, 100)
        self.assertTrue(validate_sql(a.sql, a.plan, a.grounded, self.catalog).valid)
        self.assertFalse(validate_sql(a.sql.replace(f"LIMIT {MAX_ANALYTICAL_ROWS+1}", f"LIMIT {MAX_ANALYTICAL_ROWS}"), a.plan, a.grounded, self.catalog).valid)

    def test_hour_expression_is_not_timestamp_but_raw_timestamp_stays_checked(self):
        _, _, a = self.artifact("hourly_load")
        for raw in (Decimal(12), 12):
            self.assertTrue(validate_results(result([{"hour": raw, "hourly_orders": 15}]), a.plan, a.grounded, self.catalog).valid)
        # A catalog extension projecting the actual time column must still obey
        # the approved period. This checks the general rule, not an hour-name hack.
        c = deepcopy(self.catalog)
        c.registry["dimensions"]["observed_at"] = {"table": "silver.don_hang", "column": "ngay_tao"}
        projected = a.plan.model_copy(update={"dimensions": ["observed_at"]})
        for raw, valid in ((datetime(2026, 9, 12), True), (datetime(2026, 8, 31), False), (Decimal(12), False)):
            verdict = validate_results(result([{"observed_at": raw, "hourly_orders": 15}]), projected, a.grounded, c)
            self.assertEqual(verdict.valid, valid)

    def test_failed_results_log_only_codes_for_fresh_cached_and_stored_paths(self):
        for source in ("execution", "cache", "stored"):
            p, queries, a = self.artifact("product_sales")
            bad = result([{"product": "PRIVATE-ROW", "product_id": 1, "product_revenue": "PRIVATE-METRIC"}])
            bad["sql"] = "PRIVATE-SQL"
            p.executor.return_value = bad
            if source != "execution":
                a.result = bad
                if source == "cache": queries.cache[a.signature] = a
                else: queries.previous[a.query.id] = a
            with self.assertLogs("ai-analytics", level="WARNING") as logs, self.assertRaises(AnalysisError) as caught:
                queries.restore(a.query.id) if source == "stored" else queries.run(a)
            self.assertEqual(caught.exception.category, "result_contract")
            diagnostic = p.semantic_info["result_failures"][0]
            self.assertEqual(diagnostic["source"], source)
            self.assertEqual(diagnostic["rules"], ["metric_numeric"])
            self.assertNotIn("PRIVATE", str(logs.output) + str(diagnostic))
            if source != "execution": p.executor.assert_not_called()

    def test_large_population_remains_actionable_and_bad_rows_never_become_charts(self):
        p, queries, a = self.artifact("product_sales")
        rows = [{"product": str(i), "product_id": i, "product_revenue": 1} for i in range(MAX_ANALYTICAL_ROWS + 1)]
        p.executor.return_value = result(rows)
        with self.assertRaises(AnalysisError) as caught: queries.run(a)
        failure = safe_failure(caught.exception, layer_diagnostics=p.semantic_info)
        self.assertEqual(failure["status"], "needs_clarification")
        self.assertEqual(failure["issue"]["category"], "REQUESTED_SCOPE_TOO_LARGE")
        self.assertIn("Top N", failure["message"])
        self.assertEqual(failure["charts"], [])
        for bad in ({"product_revenue": float("nan")}, {"product_revenue": -1}, {"email": "PRIVATE"}):
            changed = [{**rows[0], **bad}]
            self.assertFalse(validate_results(result(changed), a.plan, a.grounded, self.catalog).valid)
        self.assertFalse(validate_results(result([rows[0], rows[0]]), a.plan, a.grounded, self.catalog).valid)
