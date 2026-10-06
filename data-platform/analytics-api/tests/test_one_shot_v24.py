"""Production single-shot qualification. Transport and warehouse are forbidden."""

import json
import os
import unittest
from copy import deepcopy
from unittest.mock import Mock, patch
from common import AiTextToReportRequest, AiReportRefineRequest
from services.analysis_catalog import AnalysisCatalog, AnalysisError
from services.analysis_pipeline import AnalysisPipeline, safe_failure
from services.agent_provider import NativeAgentProvider, gemini_tool_schema
from services.analyst_decision import decision_tool
from services.provider_budget import ProviderBudget, ProviderTurn
from services.semantic_manifest_service import build_manifest, manifest_references, compact
from services.session_service import get_session
from tests.analysis_fixtures import physical_metadata, ranked_rows, result
from tests.agent_fixtures import call, ScriptedProvider
from tests.test_agent_v23 import simple_query, investigation, rich_queries, fixture_executor
from tests.test_agent_v22 import REFERENCE


def wire(query):
    q = deepcopy(query)
    q.pop("role", None)
    if "project" in q:
        fields = q.pop("project")
        if fields:
            q["detail_fields"] = fields
    if "changed_fields" in q:
        q["changed_fields"] = ["detail_fields" if f == "project" else f for f in q["changed_fields"]]
    return q


def decision(queries=None, **updates):
    queries = queries or [simple_query()]
    value = {"decision_type": "plan", "requested_operations": [wire(q) for q in queries if q.get("role") != "supporting"],
             "supporting_operations": [wire(q) for q in queries if q.get("role") == "supporting"]}
    value.update(updates)
    return value


def scripted(value):
    return ScriptedProvider([call("submit_analyst_decision", value)])


def deep_sales_queries():
    scope = {"filters": [{"dimension": "city", "operator": "in", "value": ["Hồ Chí Minh", "Hà Nội"]}],
             "time": {"kind": "relative", "mode": "all_time"}}
    main = {"id": "main", "subject": "orders", "operation": "aggregate", "metrics": ["revenue"], "group_by": ["city"], **scope}
    support = {"role": "supporting", "parent_id": "main", "purpose": "context", **scope}
    return [main,
        {**support, "id": "monthly_revenue", "subject": "orders", "operation": "trend", "metrics": ["revenue"], "group_by": ["city"], "granularity": "month"},
        {**support, "id": "monthly_orders", "subject": "orders", "operation": "trend", "metrics": ["order_count"], "group_by": ["city"], "granularity": "month", "population_relation": "related"},
        {**support, "id": "buying_customers", "subject": "orders", "operation": "trend", "metrics": ["purchasing_customer_count"], "group_by": ["city"], "granularity": "month"},
        {**support, "id": "products", "subject": "products", "operation": "ranking", "metrics": ["quantity_sold"], "group_by": ["product"], "ranking": {"metric": "quantity_sold", "top_n": 5}},
        {**support, "id": "promotions", "subject": "promotions", "operation": "distribution", "metrics": ["discount_amount"], "group_by": ["promotion"], "population_relation": "related"}]


def deep_domain_queries(subject):
    cases = {
        "payments": [
            ("aggregate", ["payment_count", "payment_revenue"], ["payment_gateway"]),
            ("trend", ["payment_count"], []), ("trend", ["payment_revenue"], []),
            ("distribution", ["payment_count"], ["payment_status"]),
            ("cross_tab", ["payment_count"], ["payment_gateway", "payment_status"])],
        "inventory": [
            ("aggregate", ["stock_quantity", "low_stock_count"], ["product"]),
            ("aggregate", ["stock_quantity", "low_stock_count"], ["store"]),
            ("cross_tab", ["stock_quantity"], ["product", "store"]),
            ("cross_tab", ["low_stock_count"], ["product", "store"])],
        "customers": [
            ("aggregate", ["customer_count"], ["customer_role"]),
            ("trend", ["customer_count"], []),
            ("distribution", ["customer_count"], ["loyalty_points"]),
            ("cross_tab", ["customer_count"], ["customer_role", "loyalty_points"]),
            ("distribution", ["customer_count"], ["lifetime_spend"]),
            ("aggregate", ["total_spent"], ["customer_role"])],
    }
    queries = []
    for i, (operation, metrics, groups) in enumerate(cases[subject]):
        q = {"id": "main" if i == 0 else "support_" + str(i), "subject": subject,
             "operation": operation, "metrics": metrics, "group_by": groups}
        if i:
            q.update(role="supporting", parent_id="main", purpose="context")
        if operation == "trend": q["granularity"] = "month"
        if metrics == ["total_spent"]: q["population_relation"] = "related"
        queries.append(q)
    return queries


class OneShotTests(unittest.TestCase):
    def setUp(self):
        for name in ("requests.sessions.Session.request", "psycopg2.connect"):
            guard = patch(name, side_effect=AssertionError("External calls forbidden"))
            guard.start(); self.addCleanup(guard.stop)
        config = patch.dict(os.environ, {"DATA_ANALYST_SEMANTIC_MANIFEST_MAX_CHARS": "10000", "DATA_ANALYST_ONE_SHOT_CONTEXT_MAX_CHARS": "24000"})
        config.start(); self.addCleanup(config.stop)
        self.catalog = AnalysisCatalog(physical_metadata())

    def pipeline(self, provider=None, executor=None):
        return AnalysisPipeline(metadata_loader=physical_metadata, provider=provider or scripted(decision()),
            executor=executor or Mock(return_value=result(ranked_rows())), value_lookup=Mock(return_value=[]))

    def request(self, prompt="top 5 sản phẩm bán chạy nhất tại thành phố hồ chí minh"):
        return AiTextToReportRequest(prompt=prompt, reference_date=REFERENCE, analysis_depth="focused")

    def reject(self, value):
        provider = scripted(value); p = self.pipeline(provider)
        with self.assertRaises(AnalysisError) as caught:
            p.propose(self.request())
        failure = safe_failure(caught.exception, p.calls, p.semantic_info)
        self.assertEqual(failure["status"], "error")
        self.assertEqual(failure["diagnostics"]["terminal_error"], "invalid_analysis_contract")
        self.assertEqual(failure["diagnostics"]["provider_status"], "success")
        self.assertEqual(failure["diagnostics"]["agent_contract_status"], "invalid")
        self.assertEqual(provider.call_count, 1)
        p.executor.assert_not_called()
        return failure

    def test_simple_ranking_one_call_zero_proposal_sql_and_structural_defaults(self):
        for prompt in (self.request().prompt, "Unseen business wording Z731"):
            p = self.pipeline(); response = p.propose(self.request(prompt))
            self.assertEqual(response["status"], "proposal_ready")
            q = response["proposal"]["analytical_queries"][0]
            self.assertEqual((q["operation"], q["ranking"]["metric"], q["ranking"]["direction"], q["time"]["mode"]), ("ranking", "quantity_sold", "DESC", "all_time"))
            self.assertEqual(q["filters"][0]["value"], "Hồ Chí Minh")
            self.assertEqual(p.provider.call_count, 1); p.executor.assert_not_called()
            d = response["diagnostics"]
            for k in ("contract_repair_count", "provider_fallback_count", "model_escalation_count", "post_result_provider_call_count"):
                self.assertEqual(d[k], 0)
                self.assertEqual((d["provider_call_budget"], d["provider_call_count"], d["provider_attempt_count"]), (1, 1, 1))

    def test_deep_sales_six_views_preserve_city_scope_and_one_call(self):
        queries = deep_sales_queries(); p = self.pipeline(scripted(decision(queries)), fixture_executor(queries))
        req = AiTextToReportRequest(prompt="So sánh bán hàng giữa hai thành phố", reference_date=REFERENCE)
        proposal = p.propose(req); req.session_id = proposal["session_id"]
        self.assertEqual(proposal["diagnostics"]["analysis_depth"], "deep")
        self.assertEqual(proposal["diagnostics"]["supporting_operation_count"], 5)
        self.assertEqual(proposal["diagnostics"]["supporting_operation_limit"], 6)
        self.assertLessEqual(proposal["diagnostics"]["total_context_chars"], 24000)
        p.executor.assert_not_called()
        report = p.generate(req)
        self.assertEqual(len(report["charts"]), 6)
        self.assertGreaterEqual(len({c["chart_type"] for c in report["charts"]}), 4)
        self.assertEqual(p.provider.call_count, 1); self.assertEqual(p.executor.call_count, 6)
        self.assertEqual(report["diagnostics"]["provider_call_count"], 0)
        self.assertTrue(all(q["filters"] == queries[0]["filters"] for q in report["analytical_queries"]))
        promo = next(op for op in report["analysis_explanation"] if op["query_id"] == "promotions")
        self.assertEqual(promo["population_relation"], "related")
        self.assertTrue(promo["population_note"])
        sql = report["sql_by_query"]["promotions"]
        self.assertIn("IS NOT NULL", sql)
        self.assertIn("COUNT(DISTINCT", report["sql_by_query"]["buying_customers"])
        self.assertIn("ma_nguoi_dung", report["sql_by_query"]["buying_customers"])

    def test_deep_report_refinement_reuses_all_six_results_in_one_call(self):
        queries = deep_sales_queries(); p = self.pipeline(scripted(decision(queries)), fixture_executor(queries))
        req = AiTextToReportRequest(prompt="Deep comparison", reference_date=REFERENCE)
        req.session_id = p.propose(req)["session_id"]; report = p.generate(req)
        provider = scripted(decision(requested_operations=[{"id": "next", "replaces": "main", "changed_fields": []}]))
        p.provider = provider
        refined = p.refine(AiReportRefineRequest(current_report={"revision": report["revision"]}, session_id=req.session_id, feedback="Giữ các phạm vi phân tích"))
        self.assertEqual(provider.call_count, 1); self.assertEqual(p.executor.call_count, 6)
        self.assertEqual(len(refined["charts"]), 6)
        self.assertEqual(refined["diagnostics"]["db_query_count"], 0)

    def test_deep_scope_change_requires_all_supports_to_match_the_new_parent(self):
        old = deep_sales_queries(); filters = [{"dimension": "city", "operator": "eq", "value": "Hồ Chí Minh"}]
        updated = [{**q, "id": "new_" + q["id"], "filters": filters,
                    **({"parent_id": "new_main"} if q.get("role") == "supporting" else {})} for q in old]
        for replace_supports in (True, False):
            with self.subTest(replace_supports=replace_supports):
                p = self.pipeline(scripted(decision(old)), fixture_executor([*old, *updated]))
                req = AiTextToReportRequest(prompt="Deep comparison", reference_date=REFERENCE)
                req.session_id = p.propose(req)["session_id"]; report = p.generate(req)
                changes = [{"id": q["id"], "replaces": prior["id"], "changed_fields": ["filters"], "filters": filters,
                            **({"role": "supporting"} if prior.get("role") == "supporting" else {})}
                           for q, prior in zip(updated, old) if replace_supports or prior["id"] == "main"]
                p.provider = scripted(decision(changes))
                refined = p.refine(AiReportRefineRequest(current_report={"revision": report["revision"]}, session_id=req.session_id, feedback="Chỉ giữ Hồ Chí Minh"))
                self.assertEqual(p.provider.call_count, 1)
                self.assertTrue(all(q["filters"] == filters for q in refined["analytical_queries"]))
                self.assertEqual(len(refined["charts"]), 6 if replace_supports else 1)

    def test_deep_policy_is_generic_and_focused_remains_available(self):
        for subject, metric in (("products", "quantity_sold"), ("payments", "payment_count"),
                                ("customers", "customer_count"), ("inventory", "stock_quantity"),
                                ("staff_shifts", "shift_count"), ("promotions", "discount_amount")):
            q = {"id": "main", "subject": subject, "operation": "aggregate", "metrics": [metric]}
            p = self.pipeline(scripted(decision(requested_operations=[q])))
            req = AiTextToReportRequest(prompt="Unseen generic analytical wording", reference_date=REFERENCE)
            r = p.propose(req)
            context = json.loads(p.provider.requests[0]["messages"][0]["content"])
            self.assertEqual(context["ui"]["analysis_depth"], "deep")
            self.assertEqual(context["ui"]["supporting_limit"], 6)
            self.assertIn("5–6", p.provider.requests[0]["system"])
            self.assertEqual(r["status"], "proposal_ready"); self.assertEqual(p.provider.call_count, 1)
        p = self.pipeline(); r = p.propose(self.request())
        self.assertEqual(r["diagnostics"]["supporting_operation_limit"], 1)
        self.assertEqual(r["diagnostics"]["analysis_depth"], "focused")

    def test_deep_six_views_across_payments_inventory_and_customers(self):
        for subject in ("payments", "inventory", "customers"):
            with self.subTest(subject=subject):
                queries = deep_domain_queries(subject)
                p = self.pipeline(scripted(decision(queries)), fixture_executor(queries))
                req = AiTextToReportRequest(prompt="Generic deep domain exploration", reference_date=REFERENCE)
                proposal = p.propose(req); req.session_id = proposal["session_id"]
                self.assertEqual(proposal["diagnostics"]["omitted_supporting_operation_count"], 0)
                p.executor.assert_not_called(); report = p.generate(req)
                self.assertEqual(len(report["charts"]), 6)
                self.assertEqual(p.provider.call_count, 1); self.assertEqual(p.executor.call_count, len(queries))
                self.assertEqual(report["diagnostics"]["provider_call_count"], 0)

    def test_snapshot_context_cannot_inherit_a_historical_window(self):
        queries = deep_domain_queries("customers")
        period = {"kind": "month", "month": 9, "year": 2026}
        main = {**queries[0], "time": period}
        snapshot = {**queries[-1], "time": period}
        p = self.pipeline(scripted(decision([main, snapshot])))
        req = AiTextToReportRequest(prompt="Historical customer activity", reference_date=REFERENCE)
        r = p.propose(req)
        self.assertEqual(r["diagnostics"]["omitted_supporting_operation_count"], 1)
        p.executor.assert_not_called(); self.assertEqual(p.provider.call_count, 1)

    def test_related_context_requires_explicit_relation_and_identical_user_scope(self):
        queries = deep_sales_queries()
        for update in ({"population_relation": "same"}, {"filters": []}, {"time": {"kind": "relative", "mode": "previous_month"}},
                       {"subject": "customers", "metrics": ["customer_count"], "group_by": []}):
            p = self.pipeline(scripted(decision([queries[0], {**queries[2], **update}])))
            req = AiTextToReportRequest(prompt="Generic deep investigation", reference_date=REFERENCE)
            r = p.propose(req)
            self.assertEqual(r["diagnostics"]["omitted_supporting_operation_count"], 1)
            self.assertEqual(r["diagnostics"]["requested_operation_count"], 1)
            p.executor.assert_not_called(); self.assertEqual(p.provider.call_count, 1)

    def test_deep_support_budget_is_bounded_and_duplicate_views_are_not_filler(self):
        queries = deep_sales_queries()
        extra = {**queries[1], "id": "extra", "group_by": [], "granularity": "month"}
        excess = {**queries[1], "id": "excess", "granularity": "year"}
        all_queries = [*queries, extra, excess]
        p = self.pipeline(scripted(decision(all_queries)), fixture_executor(all_queries))
        req = AiTextToReportRequest(prompt="Deep fixture", reference_date=REFERENCE)
        r = p.propose(req); self.assertEqual(r["diagnostics"]["supporting_operation_count"], 6)
        self.assertEqual(r["diagnostics"]["omitted_supporting_operation_count"], 1)
        req.session_id = r["session_id"]; report = p.generate(req)
        self.assertLessEqual(len(report["charts"]), 8); self.assertEqual(p.provider.call_count, 1)

    def test_depth_change_requires_reapproval_without_sql_or_provider(self):
        p = self.pipeline(); req = self.request(); req.session_id = p.propose(req)["session_id"]
        req.analysis_depth = "deep"
        with self.assertRaises(AnalysisError): p.generate(req)
        p.executor.assert_not_called(); self.assertEqual(p.provider.call_count, 1)

    def test_buying_customer_metric_is_physically_checked_and_not_additive(self):
        metric = self.catalog.registry["metrics"]["purchasing_customer_count"]
        self.assertFalse(metric["additive"]); self.assertEqual(metric["grain"], "order")
        physical = physical_metadata()
        table = physical["table_map"]["silver.don_hang"]
        table["columns"] = [c for c in table["columns"] if c["name"] != "ma_nguoi_dung"]
        manifest, _ = build_manifest(AnalysisCatalog(physical))
        self.assertNotIn(("metric", "purchasing_customer_count"), manifest_references(manifest))

    def test_invalid_requested_fails_without_repair_or_partial_plan(self):
        self.reject(decision(requested_operations=[wire(simple_query()), {"id": "bad", "subject": "products", "metrics": ["imaginary"], "operation": "aggregate"}]))

    def test_guard_blocks_second_scripted_invocation_before_mock(self):
        provider = scripted(decision()); d = {}; turn = ProviderTurn(provider, d)
        turn.invoke(system="", messages=[], tools=[])
        with self.assertRaises(AnalysisError) as caught:
            turn.invoke(system="", messages=[], tools=[])
        self.assertEqual(caught.exception.category, "provider_call_budget_exceeded")
        self.assertEqual(provider.call_count, 1)
        self.assertEqual((d["provider_call_count"], d["provider_call_budget_block_count"]), (1, 1))

    def test_same_planner_cannot_start_second_decision(self):
        p = self.pipeline(); p.propose(self.request())
        with self.assertRaises(AnalysisError) as caught:
            p._last_agent.run("another automatic attempt")
        self.assertEqual(caught.exception.category, "provider_call_budget_exceeded")
        self.assertEqual(p.provider.call_count, 1)

    def test_invalid_optional_item_keeps_main_and_sanitizes_rejection(self):
        for bad in ({"id": "bad", "parent_id": "main", "operation": "trend", "time": {"kind": "relative", "mode": "SECRET"}},
                    {"id": "bad", "parent_id": "main", "SQL_SECRET": "SELECT private"}):
            p = self.pipeline(scripted(decision(supporting_operations=[bad])))
            r = p.propose(self.request()); d = r["diagnostics"]
            self.assertEqual(r["status"], "proposal_ready")
            self.assertEqual(d["agent_contract_status"], "valid_with_omitted_support")
            self.assertEqual(d["omitted_supporting_operation_count"], 1)
            self.assertNotIn("SECRET", json.dumps(d)); p.executor.assert_not_called()
            self.assertEqual(p.provider.call_count, 1)

    def test_non_object_support_and_its_visual_cannot_abort_main(self):
        value = decision(supporting_operations=[None, "SECRET", {"id": "bad", "operation": "invalid"}], visuals=[{"query_id": "bad", "chart_type": "line"}])
        p = self.pipeline(scripted(value)); d = p.propose(self.request())["diagnostics"]
        self.assertEqual(d["omitted_supporting_operation_count"], 3)
        self.assertEqual(d["agent_contract_status"], "valid_with_omitted_support")
        self.assertNotIn("SECRET", compact(d))

    def test_clarification_is_valid_planning_with_zero_sql(self):
        p = self.pipeline(scripted({"decision_type": "clarification", "clarification": {"reason": "metric_ambiguous", "subject": "orders", "known_query": {"subject": "orders", "group_by": ["city"]}, "missing_fields": ["metrics"]}}))
        with self.assertRaises(AnalysisError) as caught: p.propose(self.request("Thành phố nào tốt nhất?"))
        r = safe_failure(caught.exception, p.calls, p.semantic_info)
        self.assertEqual(r["status"], "needs_clarification")
        self.assertTrue(r["clarification"]["choices"])
        self.assertEqual(r["diagnostics"]["agent_contract_status"], "valid")
        self.assertEqual(p.provider.call_count, 1); p.executor.assert_not_called()

    def test_unsupported_is_valid_planning_with_zero_sql(self):
        p = self.pipeline(scripted({"decision_type": "unsupported", "clarification": {"reason": "forecast_unsupported", "subject": "products"}}))
        with self.assertRaises(AnalysisError) as caught: p.propose(self.request("Dự báo"))
        r = safe_failure(caught.exception, p.calls, p.semantic_info)
        self.assertEqual(r["diagnostics"]["semantic_status"], "unsupported")
        self.assertEqual(r["diagnostics"]["agent_contract_status"], "valid")
        self.assertEqual(p.provider.call_count, 1); p.executor.assert_not_called()

    def test_clarification_draft_never_exposes_unknown_prose_as_fields(self):
        p = self.pipeline(scripted({"decision_type": "clarification", "clarification": {"reason": "metric_ambiguous", "subject": "orders", "missing_fields": ["SECRET_FIELD", "metrics"], "known_query": {"operation": "SECRET_OPERATION"}}}))
        with self.assertRaises(AnalysisError) as caught: p.propose(self.request())
        response = safe_failure(caught.exception, p.calls, p.semantic_info)
        self.assertNotIn("SECRET", compact(response))
        self.assertEqual(p.provider.call_count, 1)

    def test_explicit_invalid_times_are_final(self):
        for time in ({"kind": "relative", "mode": "custom"}, {"kind": "relative", "mode": "all_time", "month": 10},
                     {"kind": "day", "month": 2, "day": 30, "year": 2026}, {"kind": "range", "start": "2026-10-07", "end": "2026-10-06"},
                     {"kind": "rolling", "amount": 0, "unit": "day"}, {"kind": "month"}, None):
            with self.subTest(time=time): self.reject(decision(requested_operations=[{**simple_query(), "time": time}]))

    def test_valid_explicit_calendar_time_remains_exact(self):
        for time, expected in (({"kind": "month", "month": 9}, "2026-09-01"), ({"kind": "quarter", "quarter": 3, "year": 2025}, "2025-07-01")):
            p = self.pipeline(scripted(decision(requested_operations=[{**simple_query(), "time": time}])))
            r = p.propose(self.request())
            self.assertEqual(r["interpretation"]["time_range"]["start"], expected)

    def test_incomplete_time_reports_missing_fields_without_retry(self):
        cases = [({"kind": "relative"}, ["mode"]),
                 ({"kind": "relative", "mode": None}, ["mode"]),
                 ({"kind": "month"}, ["month"]),
                 ({"kind": "quarter"}, ["quarter"]),
                 ({"kind": "year"}, ["year"]),
                 ({"kind": "day", "month": 9}, ["day"]),
                 ({"kind": "range", "start": "2026-09-01"}, ["end"]),
                 ({"kind": "rolling", "amount": 7}, ["unit"])]
        for time, fields in cases:
            with self.subTest(time=time):
                failure = self.reject(decision(requested_operations=[{**simple_query(), "time": time}]))
                self.assertEqual(failure["diagnostics"]["contract_issues"],
                                 [{"path": "time." + field, "code": "field_required"} for field in fields])

    def test_complete_time_shapes_resolve_exactly_in_one_call(self):
        cases = [({"kind": "relative", "mode": "all_time"}, None, None),
                 ({"kind": "relative", "mode": "previous_month"}, "2026-09-01", "2026-09-30"),
                 ({"kind": "month", "month": 9}, "2026-09-01", "2026-09-30"),
                 ({"kind": "quarter", "quarter": 3}, "2026-07-01", "2026-09-30"),
                 ({"kind": "year", "year": 2025}, "2025-01-01", "2025-12-31"),
                 ({"kind": "day", "month": 9, "day": 30}, "2026-09-30", "2026-09-30"),
                 ({"kind": "range", "start": "2026-09-01", "end": "2026-09-15"}, "2026-09-01", "2026-09-15"),
                 ({"kind": "rolling", "amount": 7, "unit": "day"}, "2026-09-30", "2026-10-06")]
        for time, start, end in cases:
            with self.subTest(time=time):
                p = self.pipeline(scripted(decision(requested_operations=[{**simple_query(), "time": time}])))
                r = p.propose(self.request()); period = r["interpretation"]["time_range"]
                self.assertEqual((period["start"], period["end"]), (start, end))
                self.assertEqual(p.provider.call_count, 1); p.executor.assert_not_called()
                self.assertLessEqual(r["diagnostics"]["total_context_chars"], 24000)

    def test_unused_null_time_fields_do_not_change_explicit_scope(self):
        time = {"kind": "relative", "mode": "previous_month", "year": None, "month": None,
                "quarter": None, "day": None, "start": None, "end": None, "amount": None, "unit": None}
        p = self.pipeline(scripted(decision(requested_operations=[{**simple_query(), "time": time}])))
        r = p.propose(self.request())
        self.assertEqual(r["interpretation"]["time_range"]["start"], "2026-09-01")
        p.executor.assert_not_called(); self.assertEqual(p.provider.call_count, 1)

    def test_time_declaration_requires_complete_kind_on_both_transports(self):
        provider = NativeAgentProvider()
        native = provider._gemini_body("", [], [decision_tool()])
        compat = provider._gemini_compat_body("", [], [decision_tool()], "fixture")
        schemas = [native["tools"][0]["functionDeclarations"][0]["parametersJsonSchema"],
                   compat["tools"][0]["function"]["parameters"]]
        expected = {"relative": ({"mode"}, set()), "month": ({"month"}, {"year"}),
                    "quarter": ({"quarter"}, {"year"}), "year": ({"year"}, set()),
                    "day": ({"month", "day"}, {"year"}), "range": ({"start", "end"}, set()),
                    "rolling": ({"amount", "unit"}, set())}
        for schema in schemas:
            for container in ("requested_operations", "supporting_operations"):
                op = schema["properties"][container]["items"]
                self.assertNotIn("time", op["required"])
                if container == "supporting_operations":
                    self.assertNotIn("time", op["properties"])
                    self.assertNotIn("filters", op["properties"])
                    self.assertIn("parent_id", op["required"])
                    continue
                branches = op["properties"]["time"]["anyOf"]
                self.assertEqual(len(branches), 7)
                for branch in branches:
                    kind, = branch["properties"]["kind"]["enum"]
                    required, optional = expected[kind]
                    self.assertEqual(set(branch["required"]), {"kind"} | required)
                    self.assertEqual(set(branch["properties"]), {"kind"} | required | optional)
                    if kind == "relative":
                        self.assertNotIn("custom", branch["properties"]["mode"]["enum"])

    def test_incomplete_optional_time_is_omitted_without_losing_parent_scope(self):
        parent = {**simple_query(), "time": {"kind": "month", "month": 9, "year": 2026}}
        support = {"id": "history", "subject": "products", "operation": "trend", "metrics": ["quantity_sold"],
                   "granularity": "week", "parent_id": "main"}
        p = self.pipeline(scripted(decision(requested_operations=[parent],
            supporting_operations=[support, {**support, "id": "bad", "time": {"kind": "relative"}}])))
        r = p.propose(self.request()); queries = r["proposal"]["analytical_queries"]
        self.assertEqual([q["id"] for q in queries], ["main", "history"])
        self.assertEqual(queries[1]["time"], queries[0]["time"])
        d = r["diagnostics"]
        self.assertEqual(d["omitted_supporting_operation_count"], 1)
        self.assertEqual(d["omitted_supporting_operations"][0]["issues"], [{"path": "time.mode", "code": "field_required"}])
        self.assertEqual(p.provider.call_count, 1); p.executor.assert_not_called()

    def test_refinement_omitted_time_preserves_explicit_range_and_reuses_results(self):
        time = {"kind": "range", "start": "2026-09-01", "end": "2026-09-30"}
        p = self.pipeline(scripted(decision(requested_operations=[{**simple_query(), "time": time}])))
        req = self.request(); req.session_id = p.propose(req)["session_id"]; report = p.generate(req)
        provider = scripted(decision(requested_operations=[{"id": "next", "replaces": "main", "changed_fields": []}]))
        p.provider = provider
        refined = p.refine(AiReportRefineRequest(current_report={"revision": report["revision"]},
            session_id=req.session_id, feedback="Keep this period"))
        q = refined["analytical_queries"][0]
        self.assertEqual((q["time"]["kind"], q["time"]["start"], q["time"]["end"]), ("range", time["start"], time["end"]))
        self.assertEqual(provider.call_count, 1); self.assertEqual(p.executor.call_count, 1)
        self.assertEqual(refined["diagnostics"]["db_query_count"], 0)

    def test_detail_fields_are_detail_only_and_project_is_not_accepted(self):
        p = self.pipeline(scripted(decision(requested_operations=[{"id": "details", "subject": "orders", "operation": "detail", "detail_fields": ["order_id", "order_amount"]}])))
        q = p.propose(self.request())["proposal"]["analytical_queries"][0]
        self.assertEqual(q["project"], ["order_id", "order_amount"])
        r = self.reject(decision(requested_operations=[{**simple_query(), "detail_fields": ["product"]}]))
        self.assertEqual(r["diagnostics"]["contract_issues"][0]["code"], "detail_fields_only_for_detail")
        self.reject(decision(requested_operations=[{**simple_query(), "project": ["product"]}]))

    def test_one_tool_wire_contains_no_discovery_loop_or_physical_schema(self):
        p = self.pipeline(); r = p.propose(self.request())
        request = p.provider.requests[0]; raw = compact(request)
        self.assertEqual([t["name"] for t in request["tools"]], ["submit_analyst_decision"])
        for old in ("search_semantic_catalog", "describe_semantic_concept", "resolve_dimension_value", "run_analysis", "finish_analysis", '"project"', "silver.", "SELECT "):
            self.assertNotIn(old, raw)
        self.assertEqual(len(request["messages"]), 1)
        manifest = json.loads(request["messages"][0]["content"])["manifest"]
        self.assertEqual(len(manifest["subjects"]), 16)
        self.assertTrue(manifest["complete"])
        self.assertLessEqual(r["diagnostics"]["total_context_chars"], 24000)
        self.assertIsNone(r["diagnostics"]["input_tokens"])
        schema = gemini_tool_schema(decision_tool())
        self.assertNotIn("time", schema["properties"]["requested_operations"]["items"]["required"])

    def test_context_counts_system_manifest_schema_ui_and_blocks_before_provider(self):
        p = self.pipeline()
        with patch.dict(os.environ, {"DATA_ANALYST_ONE_SHOT_CONTEXT_MAX_CHARS": "1000"}):
            with self.assertRaises(AnalysisError) as caught: p.propose(self.request())
        self.assertEqual(caught.exception.category, "one_shot_context_budget_exceeded")
        self.assertEqual(p.provider.call_count, 0); p.executor.assert_not_called()

    def test_unsafe_configuration_cannot_enable_additional_calls(self):
        for name, value in (("DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN", "2"), ("DATA_ANALYST_ENABLE_CONTRACT_REPAIR", "1"), ("DATA_ANALYST_ENABLE_PROVIDER_FALLBACK", "1"), ("DATA_ANALYST_ENABLE_MODEL_ESCALATION", "1"), ("DATA_ANALYST_ENABLE_POST_RESULT_SYNTHESIS", "1")):
            with patch.dict(os.environ, {name: value}):
                p = self.pipeline()
                with self.assertRaises(AnalysisError) as caught: p.propose(self.request())
                self.assertEqual(caught.exception.category, "provider_policy")
                self.assertEqual(p.provider.call_count, 0)

    def test_manifest_cache_is_fingerprint_bound_and_isolated(self):
        first, _ = build_manifest(self.catalog)
        again, hit = build_manifest(self.catalog)
        self.assertTrue(hit); first["subjects"].clear()
        self.assertTrue(again["subjects"])
        overlay = deepcopy(self.catalog.overlay)
        overlay["analysis_registry"]["metrics"]["quantity_sold"]["business_name"] = "Changed label"
        changed = AnalysisCatalog(physical_metadata(), overlay)
        value, hit = build_manifest(changed)
        self.assertFalse(hit)
        self.assertIn("Changed label", compact(value))

    def test_generic_new_metadata_metric_and_dimension_need_no_code_branch(self):
        overlay = deepcopy(self.catalog.overlay); r = overlay["analysis_registry"]
        r["metrics"]["new_volume"] = {**r["metrics"]["quantity_sold"], "business_name": "New measurement"}
        r["subjects"]["products"]["metrics"].append("new_volume")
        r["dimensions"]["new_group"] = {**r["dimensions"]["category"], "business_name": "New grouping"}
        catalog = AnalysisCatalog(physical_metadata(), overlay)
        manifest, _ = build_manifest(catalog)
        self.assertIn(("metric", "new_volume"), manifest_references(manifest))
        self.assertIn(("dimension", "new_group"), manifest_references(manifest))
        p = self.pipeline(scripted(decision(requested_operations=[{"id": "new", "subject": "products", "operation": "aggregate", "metrics": ["new_volume"], "group_by": ["new_group"]}])))
        p.catalog = lambda: catalog
        p._active_catalog = catalog
        self.assertEqual(p.propose(self.request("New words"))["status"], "proposal_ready")

    def test_manifest_sharding_is_bounded_coherent_and_never_prompt_specific(self):
        value, _ = build_manifest(self.catalog, max_chars=5000)
        self.assertLessEqual(len(compact(value)), 5000)
        self.assertFalse(value["complete"])
        refs = manifest_references(value)
        self.assertTrue(all(("metric", m) in refs for s in value["subjects"] for m in s[3]))
        self.assertTrue(all(("dimension", d) in refs for ds in value["dimension_sets"] for d in ds))

    def test_physical_sensitive_or_missing_fields_are_excluded(self):
        physical = physical_metadata()
        d = self.catalog.registry["dimensions"]["category"]
        for c in physical["table_map"][d["table"]]["columns"]:
            if c["name"] == d["column"]: c["sensitive"] = True
        value, _ = build_manifest(AnalysisCatalog(physical))
        self.assertNotIn(("dimension", "category"), manifest_references(value))

    def test_approval_and_four_view_report_use_no_additional_provider_call(self):
        queries = investigation(); p = self.pipeline(scripted(decision(queries)), fixture_executor(queries))
        req = self.request(); req.analysis_depth = "deep"; proposal = p.propose(req)
        self.assertEqual(proposal["diagnostics"]["supporting_operation_count"], 3)
        p.executor.assert_not_called(); req.session_id = proposal["session_id"]
        report = p.generate(req)
        self.assertEqual(len(report["charts"]), 4)
        self.assertGreaterEqual(len(set(c["chart_type"] for c in report["charts"])), 3)
        self.assertEqual(p.provider.call_count, 1)
        self.assertEqual(report["diagnostics"]["provider_call_count"], 0)
        self.assertEqual(report["diagnostics"]["post_result_provider_call_count"], 0)
        self.assertEqual(p.executor.call_count, 4)

    def test_complex_six_operations_seven_charts_one_planning_call(self):
        queries = rich_queries(); p = self.pipeline(scripted(decision(queries)), fixture_executor(queries))
        req = self.request("Multi-part fixture"); proposal = p.propose(req); req.session_id = proposal["session_id"]
        report = p.generate(req)
        self.assertEqual((len(report["charts"]), p.executor.call_count, p.provider.call_count), (7, 6, 1))
        self.assertGreaterEqual(len(set(c["chart_type"] for c in report["charts"])), 4)
        self.assertTrue(report["evidence"])

    def test_refinement_uses_compact_state_one_call_reuses_results(self):
        p = self.pipeline(); req = self.request(); req.session_id = p.propose(req)["session_id"]; report = p.generate(req)
        provider = scripted(decision(requested_operations=[{"id": "next", "replaces": "main", "changed_fields": []}]))
        p.provider = provider
        refined = p.refine(AiReportRefineRequest(current_report={"revision": report["revision"]}, session_id=report["session_id"], feedback="Reconsider the same scope", conversation_history=[{"role": "user", "content": "SECRET_HISTORY"}]))
        self.assertEqual(provider.call_count, 1); self.assertEqual(p.executor.call_count, 1)
        self.assertEqual(refined["diagnostics"]["db_query_count"], 0)
        request = compact(provider.requests)
        self.assertNotIn("SECRET_HISTORY", request); self.assertNotIn('"rows"', request)
        self.assertTrue(refined["diagnostics"]["result_reuse"])

    def test_natural_language_visual_refinement_is_one_call_and_zero_sql(self):
        p = self.pipeline(); req = self.request(); req.session_id = p.propose(req)["session_id"]; report = p.generate(req)
        provider = scripted({"decision_type": "plan", "visuals": [{"query_id": "main", "chart_type": "bar", "metrics": ["quantity_sold"], "x_field": "product", "purpose": "ranking"}]})
        p.provider = provider
        refined = p.refine(AiReportRefineRequest(current_report=report, session_id=req.session_id, feedback="Đổi sang cột dọc"))
        self.assertEqual(refined["charts"][0]["chart_type"], "bar")
        self.assertEqual(provider.call_count, 1); self.assertEqual(p.executor.call_count, 1)
        self.assertNotIn('"rows"', compact(provider.requests))

    def test_invalid_refinement_preserves_server_report_and_revision(self):
        p = self.pipeline(); req = self.request(); req.session_id = p.propose(req)["session_id"]; report = p.generate(req)
        session = get_session(report["session_id"]); before = deepcopy(session.dashboard_plan); revision = session.revision
        provider = scripted(decision(requested_operations=[{"id": "bad", "replaces": "main", "changed_fields": ["metrics"], "metrics": ["undefined"]}]))
        p.provider = provider
        with self.assertRaises(AnalysisError): p.refine(AiReportRefineRequest(current_report=report, session_id=report["session_id"], feedback="new scope"))
        self.assertEqual(session.revision, revision); self.assertEqual(session.dashboard_plan, before)
        self.assertEqual(list(session.agent_artifacts), ["main"])
        self.assertEqual(provider.call_count, 1); self.assertEqual(p.executor.call_count, 1)

    def test_structured_visual_edit_has_zero_provider_and_zero_sql(self):
        p = self.pipeline(); req = self.request(); req.session_id = p.propose(req)["session_id"]; report = p.generate(req)
        provider = Mock(side_effect=AssertionError("No provider permitted")); p.provider = provider
        change = {"chart_id": report["charts"][0]["id"], "chart_type": "bar"}
        refined = p.refine(AiReportRefineRequest(current_report=report, session_id=report["session_id"], visual_changes=[change]))
        self.assertEqual(refined["charts"][0]["chart_type"], "bar")
        self.assertEqual(refined["diagnostics"]["provider_call_count"], 0)
        self.assertEqual(refined["diagnostics"]["db_query_count"], 0)
        provider.assert_not_called(); self.assertEqual(p.executor.call_count, 1)

    def test_invalid_structured_composition_preserves_ranking(self):
        p = self.pipeline(); req = self.request(); req.session_id = p.propose(req)["session_id"]; report = p.generate(req)
        revision = get_session(req.session_id).revision
        with self.assertRaises(AnalysisError): p.refine(AiReportRefineRequest(current_report=report, session_id=req.session_id, visual_changes=[{"chart_id": report["charts"][0]["id"], "chart_type": "donut"}]))
        self.assertEqual(get_session(req.session_id).revision, revision)
        self.assertEqual(p.provider.call_count, 1)

    def test_structured_edit_can_change_a_valid_default_after_an_omitted_visual(self):
        value = decision(visuals=[{"query_id": "main", "chart_type": "donut", "metrics": ["quantity_sold"], "x_field": "product"}])
        p = self.pipeline(scripted(value)); req = self.request(); req.session_id = p.propose(req)["session_id"]; report = p.generate(req)
        self.assertEqual(report["charts"][0]["chart_type"], "horizontal_bar")
        refined = p.refine(AiReportRefineRequest(current_report=report, session_id=req.session_id, visual_changes=[{"chart_id": report["charts"][0]["id"], "chart_type": "bar"}]))
        self.assertEqual(refined["charts"][0]["chart_type"], "bar")
        self.assertEqual(p.provider.call_count, 1); self.assertEqual(p.executor.call_count, 1)

    def test_all_available_subjects_support_aggregate_or_detail_in_one_decision(self):
        manifest, _ = build_manifest(self.catalog)
        for s in manifest["subjects"]:
            q = {"id": "main", "subject": s[0], "operation": "aggregate", "metrics": s[3][:1]} if s[3] else {"id": "main", "subject": s[0], "operation": "detail", "detail_fields": s[5][:1]}
            with self.subTest(subject=s[0]):
                p = self.pipeline(scripted(decision(requested_operations=[q])))
                self.assertEqual(p.propose(self.request("Generic subject request"))["status"], "proposal_ready")
                self.assertEqual(p.provider.call_count, 1)

    def test_support_inherits_parent_scope_and_rejects_explicit_conflict(self):
        q = {"id": "history", "subject": "products", "operation": "trend", "metrics": ["quantity_sold"], "granularity": "week", "parent_id": "main"}
        p = self.pipeline(scripted(decision(supporting_operations=[q])))
        r = p.propose(self.request())
        self.assertEqual(r["diagnostics"]["supporting_operation_count"], 1)
        p = self.pipeline(scripted(decision(supporting_operations=[{**q, "filters": []}])))
        self.assertEqual(p.propose(self.request())["diagnostics"]["omitted_supporting_operation_count"], 1)

    def test_selected_enum_alias_is_grounded_without_prompt_routing_or_lookup(self):
        value = decision(requested_operations=[{**simple_query(), "filters": [{"dimension": "city", "value": "HCM"}]}])
        p = self.pipeline(scripted(value)); r = p.propose(self.request("Unseen wording"))
        self.assertEqual(r["proposal"]["analytical_queries"][0]["filters"][0]["value"], "Hồ Chí Minh")
        p.value_lookup.assert_not_called()

    def test_safe_name_resolution_is_bounded_after_decision(self):
        q = {"id": "main", "subject": "products", "operation": "aggregate", "metrics": ["quantity_sold"], "filters": [{"dimension": "store", "value": "Synthetic branch"}]}
        p = self.pipeline(scripted(decision(requested_operations=[q])))
        p.value_lookup.return_value = ["Synthetic branch"]
        r = p.propose(self.request("Unseen wording"))
        self.assertEqual(r["diagnostics"]["value_lookup_count"], 1)
        self.assertEqual(p.value_lookup.call_args.kwargs["limit"], 8)
        p.executor.assert_not_called()

    def test_local_aliases_and_qualified_city_work_with_zero_lookup_budget(self):
        for value in ("HCM", "tp.hcm", "THÀNH PHỐ HỒ CHÍ MINH", "ho chi minh"):
            with self.subTest(value=value), patch.dict(os.environ, {"AI_AGENT_VALUE_LOOKUPS": "0"}):
                p = self.pipeline(scripted(decision(requested_operations=[{**simple_query(), "filters": [{"dimension": "city", "value": value}]}])))
                r = p.propose(self.request())
                self.assertEqual(r["proposal"]["analytical_queries"][0]["filters"][0]["value"], "Hồ Chí Minh")
                self.assertEqual(r["diagnostics"]["value_lookup_count"], 0)
                p.value_lookup.assert_not_called(); p.executor.assert_not_called()
                self.assertEqual(p.provider.call_count, 1)

    def test_local_alias_still_resolves_after_lookup_allowance_is_consumed(self):
        filters = [{"dimension": "store", "value": "Synthetic branch"}, {"dimension": "city", "value": "HCM"}]
        with patch.dict(os.environ, {"AI_AGENT_VALUE_LOOKUPS": "1"}):
            p = self.pipeline(scripted(decision(requested_operations=[{**simple_query(), "filters": filters}])))
            p.value_lookup.return_value = ["Synthetic branch"]
            r = p.propose(self.request())
            self.assertEqual(r["proposal"]["analytical_queries"][0]["filters"][1]["value"], "Hồ Chí Minh")
            self.assertEqual(p.value_lookup.call_count, 1); self.assertEqual(p.provider.call_count, 1)

    def test_unresolved_requested_value_returns_safe_narrow_clarification(self):
        raw = {**simple_query(), "filters": [{"dimension": "city", "value": "PRIVATE_UNKNOWN"}],
               "time": {"kind": "month", "month": 9, "year": 2026}}
        p = self.pipeline(scripted(decision(requested_operations=[raw])))
        with self.assertRaises(AnalysisError) as caught: p.propose(self.request())
        r = safe_failure(caught.exception, p.calls, p.semantic_info); d = r["diagnostics"]
        self.assertEqual(r["status"], "needs_clarification")
        self.assertEqual(d["agent_contract_status"], "valid")
        self.assertEqual(d["semantic_status"], "clarification")
        self.assertEqual(d["clarification_dimension"], "city")
        self.assertIn("Thành phố", r["message"])
        self.assertTrue(r["clarification"]["choices"])
        self.assertNotIn("PRIVATE_UNKNOWN", compact(r))
        self.assertEqual(r["interpretation"]["time_range"]["start"], "2026-09-01")
        self.assertEqual(r["interpretation"]["ranking"]["top_n"], 5)
        self.assertEqual(d["contract_repair_count"], 0); self.assertEqual(p.provider.call_count, 1)
        p.value_lookup.assert_not_called(); p.executor.assert_not_called()

    def test_unknown_lookup_reference_clarifies_and_never_drops_filter(self):
        raw = {**simple_query(), "filters": [{"dimension": "store", "value": "PRIVATE_BRANCH"}]}
        p = self.pipeline(scripted(decision(requested_operations=[raw])))
        p.value_lookup.return_value = ["Synthetic A", "Synthetic B"]
        with self.assertRaises(AnalysisError) as caught: p.propose(self.request())
        r = safe_failure(caught.exception, p.calls, p.semantic_info)
        self.assertEqual(r["status"], "needs_clarification")
        self.assertEqual([v["label"] for v in r["options"]], ["Synthetic A", "Synthetic B"])
        self.assertNotIn("PRIVATE_BRANCH", compact(r)); p.executor.assert_not_called()
        self.assertEqual(p.provider.call_count, 1); self.assertEqual(p.value_lookup.call_count, 1)

    def test_numeric_identifier_is_verified_and_returned_as_canonical_value(self):
        raw = {"id": "main", "subject": "products", "operation": "aggregate", "metrics": ["quantity_sold"],
               "filters": [{"dimension": "product_id", "value": 123}]}
        p = self.pipeline(scripted(decision(requested_operations=[raw]))); p.value_lookup.return_value = ["123"]
        r = p.propose(self.request())
        self.assertEqual(p.value_lookup.call_args.args[2], "123")
        self.assertEqual(r["proposal"]["analytical_queries"][0]["filters"][0]["value"], "123")
        p.executor.assert_not_called(); self.assertEqual(p.provider.call_count, 1)

    def test_exhausted_lookup_budget_clarifies_without_extra_lookup(self):
        raw = {**simple_query(), "filters": [{"dimension": "store", "value": "PRIVATE_BRANCH"}]}
        with patch.dict(os.environ, {"AI_AGENT_VALUE_LOOKUPS": "0"}):
            p = self.pipeline(scripted(decision(requested_operations=[raw])))
            with self.assertRaises(AnalysisError) as caught: p.propose(self.request())
            r = safe_failure(caught.exception, p.calls, p.semantic_info)
            self.assertEqual(r["status"], "needs_clarification")
            self.assertFalse(r["diagnostics"]["filter_resolutions"][0]["lookup_performed"])
            p.value_lookup.assert_not_called(); p.executor.assert_not_called()
            self.assertEqual(p.provider.call_count, 1)

    def test_unresolved_optional_value_keeps_requested_plan_and_sanitizes_omission(self):
        support = {"id": "support", "subject": "products", "operation": "aggregate", "metrics": ["quantity_sold"],
                   "parent_id": "main", "filters": [{"dimension": "city", "value": "PRIVATE_UNKNOWN"}]}
        p = self.pipeline(scripted(decision(supporting_operations=[support])))
        r = p.propose(self.request())
        self.assertEqual(r["status"], "proposal_ready")
        self.assertEqual(r["diagnostics"]["omitted_supporting_operation_count"], 1)
        self.assertNotIn("PRIVATE_UNKNOWN", compact(r))
        self.assertEqual(p.provider.call_count, 1); p.executor.assert_not_called()

    def test_alias_collision_cannot_choose_one_population_silently(self):
        catalog = self.catalog
        catalog.registry["dimensions"]["city"]["value_aliases"].update({"Collision": "Hồ Chí Minh", "COLLISION": "Hà Nội"})
        p = self.pipeline(scripted(decision(requested_operations=[{**simple_query(), "filters": [{"dimension": "city", "value": "Collision"}]}])))
        p.catalog = lambda: catalog; p._active_catalog = catalog
        with self.assertRaises(AnalysisError) as caught: p.propose(self.request())
        self.assertEqual(safe_failure(caught.exception, p.calls, p.semantic_info)["status"], "needs_clarification")
        p.executor.assert_not_called(); p.value_lookup.assert_not_called()

    def test_unresolved_refinement_preserves_report_and_known_period(self):
        time = {"kind": "month", "month": 9, "year": 2026}
        p = self.pipeline(scripted(decision(requested_operations=[{**simple_query(), "time": time}])))
        req = self.request(); req.session_id = p.propose(req)["session_id"]; report = p.generate(req)
        session = get_session(req.session_id); revision = session.revision
        p.provider = scripted(decision(requested_operations=[{"id": "next", "replaces": "main",
            "changed_fields": ["filters"], "filters": [{"dimension": "city", "value": "PRIVATE_UNKNOWN"}]}]))
        with self.assertRaises(AnalysisError) as caught:
            p.refine(AiReportRefineRequest(current_report={"revision": revision}, session_id=req.session_id, feedback="New location"))
        r = safe_failure(caught.exception, p.calls, p.semantic_info)
        self.assertEqual(r["status"], "needs_clarification")
        self.assertEqual(r["interpretation"]["time_range"]["start"], "2026-09-01")
        self.assertEqual(r["interpretation"]["ranking"]["top_n"], 5)
        self.assertEqual(session.revision, revision); self.assertEqual(list(session.agent_artifacts), ["main"])
        self.assertEqual(p.provider.call_count, 1); self.assertEqual(p.executor.call_count, 1)
        self.assertNotIn("PRIVATE_UNKNOWN", compact(r))

    def test_invalid_time_is_not_hidden_by_an_unknown_filter(self):
        failure = self.reject(decision(requested_operations=[{**simple_query(), "time": {"kind": "relative"},
            "filters": [{"dimension": "city", "value": "PRIVATE_UNKNOWN"}]}]))
        self.assertEqual(failure["diagnostics"]["contract_issues"], [{"path": "time.mode", "code": "field_required"}])

    def test_legacy_tools_cannot_trigger_production_tool_loop(self):
        for name in ("search_semantic_catalog", "run_analysis", "finish_analysis"):
            p = self.pipeline(ScriptedProvider([call(name, {})]))
            with self.assertRaises(AnalysisError): p.propose(self.request())
            self.assertEqual(p.provider.call_count, 1); p.executor.assert_not_called()

    def test_support_budget_keeps_requested_priority(self):
        qs = investigation(); extra = {**qs[-1], "id": "extra", "granularity": "month"}
        p = self.pipeline(scripted(decision([*qs, extra])))
        d = p.propose(self.request())["diagnostics"]
        self.assertEqual((d["requested_operation_count"], d["supporting_operation_count"], d["omitted_supporting_operation_count"]), (1, 1, 3))

    def test_oversized_optional_array_has_bounded_diagnostics_and_keeps_main(self):
        p = self.pipeline(scripted(decision(supporting_operations=[None] * 50)))
        d = p.propose(self.request())["diagnostics"]
        self.assertEqual(d["requested_operation_count"], 1)
        self.assertEqual(d["omitted_supporting_operation_count"], 50)
        self.assertLessEqual(len(d["omitted_supporting_operations"]), 12)

    def test_all_operator_families_pass_production_preflight_once(self):
        operations = [simple_query(),
            {"id": "main", "subject": "products", "operation": "aggregate", "metrics": ["quantity_sold"]},
            {"id": "main", "subject": "products", "operation": "trend", "metrics": ["quantity_sold"], "granularity": "week"},
            {"id": "main", "subject": "products", "operation": "distribution", "metrics": ["quantity_sold"], "group_by": ["category"]},
            {"id": "main", "subject": "products", "operation": "cross_tab", "metrics": ["quantity_sold"], "group_by": ["category", "city"]},
            {"id": "main", "subject": "delivery", "operation": "relationship", "metrics": ["total_deliveries", "driver_rating"], "group_by": ["driver_id"]},
            {"id": "main", "subject": "orders", "operation": "detail", "detail_fields": ["order_id", "order_amount"]}]
        for operation in operations:
            p = self.pipeline(scripted(decision(requested_operations=[operation])))
            self.assertEqual(p.propose(self.request())["status"], "proposal_ready")
            self.assertEqual(p.provider.call_count, 1); p.executor.assert_not_called()

    def test_http_boundary_preserves_one_call_and_semantic_failure_category(self):
        from routers.ai import propose_plan
        p = self.pipeline(scripted(decision(requested_operations=[{**simple_query(), "time": {"kind": "relative", "mode": "custom"}}])))
        with patch("routers.ai.AnalysisPipeline", return_value=p): response = propose_plan(self.request())
        d = response["diagnostics"]
        self.assertEqual((response["status"], d["provider_status"], d["agent_contract_status"]), ("error", "success", "invalid"))
        self.assertEqual((d["provider_call_count"], d["provider_attempt_count"]), (1, 1))
        self.assertEqual(d["error_category"], "invalid_analysis_contract")

    def test_telemetry_is_provider_reported_and_not_estimated(self):
        response = {"calls": [call("submit_analyst_decision", decision())], "attempts": [{"status": "success", "tokens": {"input": 1234, "output": 234}}]}
        p = self.pipeline(Mock(return_value=response)); d = p.propose(self.request())["diagnostics"]
        self.assertEqual((d["input_tokens"], d["cumulative_planning_input_tokens"], d["output_tokens"]), (1234, 1234, 234))

    def test_native_transport_failure_never_retries_or_falls_back(self):
        from services import llm_service
        for status in (400, 401, 403, 404, 429, 500, 503):
            for style in ("native", "openai"):
                response = Mock(ok=False, status_code=status, headers={})
                response.json.return_value = {"error": {"message": "redacted"}}
                with patch.dict(os.environ, {"AI_OFFLINE": "0", "AI_AGENT_GROQ_FALLBACK": "1", "GEMINI_API_STYLE": style}), patch.object(llm_service, "GEMINI_API_KEY", "fixture"), patch.object(llm_service, "GEMINI_MODELS", ["primary", "fallback"]), patch.object(llm_service, "GROQ_API_KEY", "fixture"), patch("services.agent_provider.requests.post", return_value=response) as post:
                    native = NativeAgentProvider(); d = {}; budget = ProviderBudget(d)
                    answer = native(system="", messages=[{"role": "user", "content": "fixture"}], tools=[decision_tool()], call_budget=budget)
                    self.assertEqual(post.call_count, 1); self.assertEqual(len(answer["attempts"]), 1)
                    with self.assertRaises(AnalysisError) as caught: native(system="", messages=[], tools=[], call_budget=budget)
                    self.assertEqual(caught.exception.category, "provider_call_budget_exceeded")
                    self.assertEqual(post.call_count, 1)

    def test_timeout_and_connection_failure_use_one_transport_attempt(self):
        import requests
        from services import llm_service
        for error in (requests.exceptions.Timeout(), requests.exceptions.ConnectionError()):
            with patch.dict(os.environ, {"AI_OFFLINE": "0"}), patch.object(llm_service, "GEMINI_API_KEY", "fixture"), patch.object(llm_service, "GEMINI_MODELS", ["primary", "secondary"]), patch("services.agent_provider.requests.post", side_effect=error) as post:
                answer = NativeAgentProvider()(system="", messages=[], tools=[decision_tool()])
                self.assertEqual(len(answer["attempts"]), 1); self.assertEqual(post.call_count, 1)

    def test_native_wire_success_uses_one_attempt_with_reported_tokens(self):
        from services import llm_service
        bodies = {"native": {"candidates": [{"content": {"parts": [{"functionCall": {"name": "submit_analyst_decision", "args": decision()}}]}}], "usageMetadata": {"promptTokenCount": 2345, "candidatesTokenCount": 345}},
                  "openai": {"choices": [{"message": {"tool_calls": [{"id": "fixture", "function": {"name": "submit_analyst_decision", "arguments": json.dumps(decision())}}]}}], "usage": {"prompt_tokens": 2345, "completion_tokens": 345}}}
        for style, body in bodies.items():
            response = Mock(ok=True); response.json.return_value = body
            with patch.dict(os.environ, {"AI_OFFLINE": "0", "GEMINI_API_STYLE": style}), patch.object(llm_service, "GEMINI_API_KEY", "fixture"), patch.object(llm_service, "GEMINI_MODELS", ["primary", "unused"]), patch("services.agent_provider.requests.post", return_value=response) as post:
                p = self.pipeline(NativeAgentProvider()); r = p.propose(self.request())
                self.assertEqual(post.call_count, 1)
                self.assertEqual(r["diagnostics"]["input_tokens"], 2345)
                raw = compact(post.call_args.kwargs["json"])
                self.assertNotIn('"project"', raw)
                self.assertIn('"submit_analyst_decision"', raw)
                self.assertNotIn('"search_semantic_catalog"', raw)

    def test_default_native_budget_blocks_reentry_without_reset(self):
        from services import llm_service
        response = Mock(ok=False, status_code=503, headers={}); response.json.return_value = {}
        with patch.dict(os.environ, {"AI_OFFLINE": "0"}), patch.object(llm_service, "GEMINI_API_KEY", "fixture"), patch.object(llm_service, "GEMINI_MODELS", ["primary"]), patch("services.agent_provider.requests.post", return_value=response) as post:
            native = NativeAgentProvider()
            native(system="", messages=[], tools=[])
            with self.assertRaises(AnalysisError): native(system="", messages=[], tools=[])
            self.assertEqual(post.call_count, 1)

    def test_budget_at_native_boundary_rejects_oversized_actual_payload_before_http(self):
        from services import llm_service
        with patch.dict(os.environ, {"AI_OFFLINE": "0", "DATA_ANALYST_ONE_SHOT_CONTEXT_MAX_CHARS": "1000"}), patch.object(llm_service, "GEMINI_API_KEY", "fixture"), patch.object(llm_service, "GEMINI_MODELS", ["primary"]), patch("services.agent_provider.requests.post") as post:
            budget = ProviderBudget({})
            with self.assertRaises(AnalysisError) as caught:
                NativeAgentProvider()(system="x" * 2000, messages=[], tools=[], call_budget=budget)
            self.assertEqual(caught.exception.category, "one_shot_context_budget_exceeded")
            self.assertEqual(budget.used, 0); post.assert_not_called()


if __name__ == "__main__":
    unittest.main()
