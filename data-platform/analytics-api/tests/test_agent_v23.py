"""V2.3 offline qualification: scripted meaning, real contracts, no network/DB."""
import json
import unittest
from copy import deepcopy
from unittest.mock import Mock, patch
from common import AiTextToReportRequest, AiReportRefineRequest
from services.analysis_catalog import AnalysisCatalog, AnalysisError
from services.analysis_pipeline import AnalysisPipeline
from services.analyst_contract import AnalyticalToolInput, DashboardPlan
from services.analytical_tool_contract import canonicalize, rejection_issues, invalid_signature
from services.agent_provider import NativeAgentProvider
from services.data_analyst_agent import DataAnalystAgent, AgentBudget, TOOL_MODELS
from services.semantic_tools import SemanticTools
from services.dashboard_planner_service import build_dashboard
from services.insight_service import analytical_features
from tests.analysis_fixtures import physical_metadata, ranked_rows, result
from tests.agent_fixtures import ScriptedProvider, call, ranking_query, query_script
from tests.test_agent_v22 import fixture_artifact, query, REFERENCE


def discovery():
    return [call("search_semantic_catalog", {"query": "products", "kind": "subject"}, "discovery")]


def finish(ids=("main",)):
    return call("finish_analysis", {"active_query_ids": list(ids)}, "finish")


def simple_query():
    q = ranking_query(filters=[{"dimension": "city", "value": "Hồ Chí Minh"}])
    for field in ("operation", "time"):
        q.pop(field)
    q["ranking"] = {"top_n": 5}
    return q


def investigation():
    parent = ranking_query(filters=[{"dimension": "city", "value": "Hồ Chí Minh"}], time={"kind": "relative", "mode": "all_time"})
    support = dict(subject="products", metrics=["quantity_sold"], filters=parent["filters"], time=parent["time"], role="supporting", parent_id="main", purpose="context")
    return [parent,
        dict(support, id="categories", operation="distribution", group_by=["category"]),
        dict(support, id="branches", operation="aggregate", group_by=["store"]),
        dict(support, id="history", operation="trend", group_by=[], granularity="week"),
    ]


def rich_queries():
    period = {"kind": "relative", "mode": "previous_quarter"}
    return [
        ranking_query(metrics=["quantity_sold", "product_revenue"], time=period),
        query("orders", "revenue", id="cities", group_by=["city"], filters=[{"dimension": "city", "operator": "in", "value": ["Hà Nội", "Hồ Chí Minh"]}], time=period),
        query("orders", "revenue", "trend", id="weekly", granularity="week", time=period),
        query("products", "quantity_sold", "distribution", id="categories", group_by=["category"], filters=[{"dimension": "city", "value": "Hà Nội"}], time=period, role="supporting", parent_id="main", purpose="context"),
        query("payments", "payment_count", "distribution", id="mix", group_by=["payment_gateway"], time=period),
        query("payments", "payment_count", "trend", id="payments_weekly", group_by=["payment_gateway"], granularity="week", time=period),
    ]


def fixture_executor(queries):
    rows_by_sql = {}
    for q in queries:
        a, _ = fixture_artifact({**q, "role": "requested", "parent_id": None})
        rows_by_sql[a.sql] = a.result
    return Mock(side_effect=lambda sql, **kw: deepcopy(rows_by_sql[sql]))


class V23Tests(unittest.TestCase):
    def setUp(self):
        for name in ("requests.sessions.Session.request", "psycopg2.connect"):
            guard = patch(name, side_effect=AssertionError("OFFLINE external access forbidden"))
            guard.start()
            self.addCleanup(guard.stop)
        self.catalog = AnalysisCatalog(physical_metadata())

    def pipeline(self, provider, executor=None, budget=None):
        return AnalysisPipeline(metadata_loader=physical_metadata, provider=provider,
            executor=executor or Mock(return_value=result(ranked_rows())), value_lookup=Mock(return_value=[]), budget=budget or AgentBudget())

    def request(self, prompt="Unseen analytical request"):
        return AiTextToReportRequest(prompt=prompt, reference_date=REFERENCE)

    def test_boundary_preserves_omission_and_never_overrides_explicit_values(self):
        raw = simple_query()
        before = deepcopy(raw)
        self.assertNotIn("operation", AnalyticalToolInput.model_validate(raw).model_fields_set)
        q, rules = canonicalize(raw)
        self.assertEqual((q.operation, q.ranking.metric, q.ranking.direction, q.time.mode, q.role), ("ranking", "quantity_sold", "DESC", "all_time", "requested"))
        self.assertEqual(raw, before)
        self.assertEqual(len(rules), 2)
        support = q.model_copy(update={"id": "support", "role": "supporting", "parent_id": "main", "purpose": "context"})
        patch_query = {"id": "replacement", "replaces": "support", "changed_fields": ["metrics"], "metrics": ["quantity_sold"]}
        inherited, _ = canonicalize(patch_query, {"support": Mock(query=support)})
        self.assertEqual((inherited.role, inherited.parent_id, inherited.purpose), ("supporting", "main", "context"))
        with self.assertRaises(ValueError): canonicalize({**patch_query, "role": "requested"}, {"support": Mock(query=support)})
        for operation in ("aggregate", None):
            bad = {**raw, "operation": operation}
            self.assertIn("operation", AnalyticalToolInput.model_validate(bad).model_fields_set)
            with self.assertRaises(ValueError) as caught: canonicalize(bad)
            self.assertIn(rejection_issues(caught.exception)[0]["code"], {"ranking_operation_required", "invalid_enum"})
        with self.assertRaises(ValueError): canonicalize({"id": "main", "subject": "products", "metrics": ["quantity_sold"]})

    def test_simple_hcm_ranking_two_rounds_zero_sql_for_paraphrases(self):
        for wording in ("top 5 sản phẩm được mua nhiều nhất tại khu vực thành phố hồ chí minh", "Cho xem năm sản phẩm có lượng mua cao nhất ở TP.HCM", "unseen business wording Z731"):
            with self.subTest(wording=wording):
                provider = ScriptedProvider(discovery(), [call("run_analysis", simple_query(), "q"), finish()])
                p = self.pipeline(provider)
                r = p.propose(self.request(wording))
                q = r["proposal"]["analytical_queries"][0]
                self.assertEqual(r["status"], "proposal_ready")
                self.assertEqual((q["subject"], q["metrics"], q["group_by"]), ("products", ["quantity_sold"], ["product"]))
                self.assertEqual(q["filters"][0]["value"], "Hồ Chí Minh")
                self.assertEqual((q["ranking"]["top_n"], q["time"]["mode"]), (5, "all_time"))
                self.assertEqual(provider.call_count, 2)
                self.assertEqual(r["diagnostics"]["agent_contract_status"], "repaired")
                self.assertEqual(r["diagnostics"]["contract_repair_count"], 0)
                self.assertEqual(r["diagnostics"]["contract_normalization_count"], 1)
                self.assertEqual((r["diagnostics"]["rounds_to_first_valid_query"], r["diagnostics"]["rounds_to_finish"]), (2, 2))
                self.assertEqual((r["diagnostics"]["semantic_round_count"], r["diagnostics"]["analytical_round_count"]), (1, 1))
                p.executor.assert_not_called(); p.value_lookup.assert_not_called()
                discovered = next(m["result"] for m in provider.requests[1]["messages"] if m["role"] == "tool")
                self.assertIn("Hồ Chí Minh", discovered["matches"][0]["canonical_enums"]["city"]["values"])
                self.assertNotIn("quantity_sold", provider.requests[0]["messages"][0]["content"])

    def test_feedback_repairs_conflict_without_rediscovery(self):
        provider = ScriptedProvider(discovery(), [call("run_analysis", {**simple_query(), "operation": "aggregate"})], [call("run_analysis", simple_query(), "fixed"), finish()])
        p = self.pipeline(provider); r = p.propose(self.request())
        feedback = next(m["result"] for m in provider.requests[2]["messages"] if m["role"] == "tool" and m["name"] == "run_analysis")
        self.assertEqual(feedback["issues"], [{"path": "operation", "code": "ranking_operation_required"}])
        self.assertEqual(feedback["error_category"], "invalid_analysis_contract")
        d = r["diagnostics"]
        self.assertEqual((d["contract_repair_count"], d["contract_rejection_count"], d["semantic_tool_calls"]), (1, 1, 1))
        self.assertEqual((d["provider_status"], d["agent_contract_status"]), ("success", "repaired"))
        self.assertIsNone(d["provider_error_category"]); p.executor.assert_not_called()

    def test_duplicate_invalid_signature_stops_after_one_repair(self):
        bad = {**simple_query(), "operation": "aggregate"}
        repeated = dict(reversed(list({**bad, "id": "different_id"}.items())))
        self.assertEqual(invalid_signature("run_analysis", bad), invalid_signature("run_analysis", repeated))
        provider = ScriptedProvider(discovery(), [call("run_analysis", bad)], [call("run_analysis", repeated, "different_call")], discovery())
        p = self.pipeline(provider)
        with self.assertRaises(AnalysisError) as caught: p.propose(self.request())
        self.assertEqual(caught.exception.category, "duplicate_invalid_tool_call")
        self.assertEqual(provider.call_count, 3)
        self.assertEqual((p.semantic_info["contract_repair_count"], p.semantic_info["contract_rejection_count"]), (1, 2))
        self.assertEqual(p.semantic_info["provider_status"], "success"); p.executor.assert_not_called()
        self.assertEqual(p.semantic_info["duplicate_invalid_call_count"], 1)

    def test_two_repair_budget_does_not_use_all_six_rounds(self):
        provider = ScriptedProvider(discovery(), *[[call("run_analysis", {**simple_query(), "limit": n})] for n in (101, 102, 103, 104)])
        p = self.pipeline(provider)
        with self.assertRaises(AnalysisError) as caught: p.propose(self.request())
        self.assertEqual(caught.exception.category, "invalid_analysis_contract")
        self.assertEqual(provider.call_count, 4)
        self.assertEqual((p.semantic_info["contract_repair_count"], p.semantic_info["contract_rejection_count"]), (2, 3))

    def test_old_error_does_not_mask_budget_exhaustion(self):
        p = self.pipeline(ScriptedProvider(discovery(), [call("run_analysis", {**simple_query(), "operation": "aggregate"})], discovery()), budget=AgentBudget(rounds=3))
        with self.assertRaises(AnalysisError) as caught: p.propose(self.request())
        self.assertEqual(caught.exception.category, "agent_budget")
        self.assertEqual(p.semantic_info["terminal_error"], "agent_budget")
        self.assertIsNone(p.semantic_info["current_round_error"])
        self.assertTrue(p.semantic_info["last_contract_rejection"])

    def test_latest_invalid_contract_is_terminal(self):
        p = self.pipeline(ScriptedProvider(discovery(), [call("run_analysis", {**simple_query(), "limit": 101})]), budget=AgentBudget(rounds=2))
        with self.assertRaises(AnalysisError) as caught: p.propose(self.request())
        self.assertEqual(caught.exception.category, "invalid_analysis_contract")
        self.assertEqual(p.semantic_info["last_contract_rejection"]["issues"], [{"path": "limit", "code": "invalid_limit"}])

    def test_transport_failure_overrides_old_contract_error(self):
        script = ScriptedProvider(discovery(), [call("run_analysis", {**simple_query(), "limit": 101})])
        def provider(**request):
            if script.call_count == 2: return {"calls": None, "attempts": [{"status": "failed", "provider": "gemini", "error_category": "provider_auth"}]}
            return script(**request)
        p = self.pipeline(provider)
        with self.assertRaises(AnalysisError) as caught: p.propose(self.request())
        self.assertEqual(caught.exception.category, "provider_auth")
        self.assertEqual((p.semantic_info["provider_status"], p.semantic_info["provider_error_category"]), ("failed", "provider_auth"))

    def test_http_success_bad_contract_has_separate_diagnostics(self):
        from routers.ai import propose_plan
        p = self.pipeline(ScriptedProvider(discovery(), [call("run_analysis", {**simple_query(), "limit": 101})]), budget=AgentBudget(rounds=2))
        with patch("routers.ai.AnalysisPipeline", return_value=p): failure = propose_plan(self.request())
        d = failure["diagnostics"]
        self.assertEqual((failure["status"], d["provider_status"], d["agent_contract_status"]), ("error", "success", "invalid"))
        self.assertIsNone(d["provider_error_category"])
        self.assertEqual(d["agent_contract_error"], "invalid_analysis_contract")
        self.assertEqual((d["execution_status"], d["result_status"]), ("not_started", "not_started"))
        self.assertEqual(failure["charts"], [])

    def test_feedback_and_trace_bounded_value_free(self):
        raw = {**simple_query(), "subject": "SELECT * FROM secret", "password-PRIVATE": "API-SECRET", "filters": [{"dimension": "city", "operator": "evil", "value": "PRIVATE-CITY"}] * 12, "limit": 1000}
        with self.assertRaises(ValueError) as caught: canonicalize(raw)
        issues = rejection_issues(caught.exception)
        self.assertLessEqual(len(issues), 8)
        p = self.pipeline(ScriptedProvider(discovery(), [call("run_analysis", raw)], discovery()), budget=AgentBudget(rounds=3))
        with self.assertRaises(AnalysisError): p.propose(self.request("RAW-PROMPT-PRIVATE"))
        for text in (json.dumps(issues), json.dumps(p.semantic_info["tool_trace"])):
            for private in ("SELECT", "secret", "PRIVATE", "RAW-PROMPT", "API-SECRET", "password"): self.assertNotIn(private, text)

    def test_no_semantic_guessing(self):
        for raw, path in (
            ({**simple_query(), "subject": None}, "subject"),
            ({**simple_query(), "metrics": ["quantity_sold", "product_revenue"]}, "ranking.metric"),
            ({**simple_query(), "group_by": []}, "group_by"),
            ({**simple_query(), "operation": "trend", "ranking": None}, "granularity"),
            ({**simple_query(), "time": {"kind": "relative", "mode": "all_time", "year": 2026}}, "time"),
            ({"id": "detail", "subject": "products", "operation": "detail"}, "project"),
        ):
            with self.subTest(path=path):
                with self.assertRaises(ValueError) as caught: canonicalize(raw)
                self.assertEqual(rejection_issues(caught.exception)[0]["path"], path)
        q, _ = canonicalize({**simple_query(), "metrics": ["product_revenue"], "ranking": {"top_n": 5}})
        self.assertEqual(q.ranking.metric, "product_revenue")

    def test_exact_wire_shapes_compact_required_typed_and_non_mutating(self):
        agent = DataAnalystAgent(self.catalog, ScriptedProvider(), None, None, REFERENCE, {})
        agent.semantic.describe("subject", "products"); tools = agent.tools()
        originals = {name: deepcopy(model.model_json_schema()) for name, (model, _) in TOOL_MODELS.items()}
        provider = NativeAgentProvider()
        compat = provider._gemini_compat_body("fixture", [{"role": "user", "content": "fixture"}], tools, "fixture-model")
        native = provider._gemini_body("fixture", [{"role": "user", "content": "fixture"}], tools)
        wire = {t["function"]["name"]: t["function"]["parameters"] for t in compat["tools"]}
        self.assertEqual(wire, {t["name"]: t["parametersJsonSchema"] for t in native["tools"][0]["functionDeclarations"]})
        self.assertLess(len(json.dumps(wire, ensure_ascii=False, separators=(",", ":"))), 13000)
        self.assertTrue({"id", "subject", "operation", "metrics", "group_by", "filters", "time", "role"} <= set(wire["run_analysis"]["required"]))
        self.assertEqual(wire["run_analysis"]["properties"]["operation"]["type"], "string")
        forbidden = {"$defs", "$ref", "additionalProperties", "default", "title", "const", "oneOf", "allOf", "minimum", "maximum", "pattern", "maxItems", "minItems"}
        def inspect(shape):
            if isinstance(shape, list):
                for child in shape: inspect(child)
            elif isinstance(shape, dict):
                self.assertFalse(forbidden & set(shape))
                if shape.get("type") == "object": self.assertTrue(shape.get("properties"))
                if {"dimension", "operator", "value"} <= set(shape.get("properties", {})):
                    self.assertEqual({s["type"] for s in shape["properties"]["value"]["anyOf"]}, {"string", "number", "boolean", "array"})
                for key, child in shape.items():
                    if key == "properties":
                        for v in child.values(): inspect(v)
                    elif isinstance(child, (dict, list)): inspect(child)
        for shape in wire.values(): inspect(shape)
        draft = wire["ask_clarification"]["properties"]["known_query"]["anyOf"][0]
        self.assertNotIn("required", draft)
        self.assertTrue({"subject", "metrics", "ranking", "time"} <= set(draft["properties"]))
        for name, (model, _) in TOOL_MODELS.items(): self.assertEqual(originals[name], model.model_json_schema())

    def test_only_exposed_concepts_authorized(self):
        p = self.pipeline(ScriptedProvider([call("describe_semantic_concept", {"kind": "dimension", "id": "city"})], [call("run_analysis", simple_query())]), budget=AgentBudget(rounds=2))
        with self.assertRaises(AnalysisError): p.propose(self.request())
        self.assertEqual(p.semantic_info["last_contract_rejection"]["issues"][0], {"path": "subject", "code": "concept_not_discovered"})
        p.executor.assert_not_called()
        semantic = SemanticTools(self.catalog, None); semantic.describe("metric", "quantity_sold", limit=2)
        self.assertIn(("metric", "quantity_sold"), semantic.discovered)
        self.assertNotIn(("metric", "product_revenue"), semantic.discovered)

    def test_resolve_run_same_batch_bounded_lookup(self):
        q = ranking_query(filters=[{"dimension": "store", "value": "Chi nhánh A"}])
        provider = ScriptedProvider([call("describe_semantic_concept", {"kind": "subject", "id": "products"}, "subject"), call("describe_semantic_concept", {"kind": "dimension", "id": "store"}, "dimension")], [call("resolve_dimension_value", {"dimension": "store", "reference": "Chi nhánh A"}, "value"), call("run_analysis", q, "q"), finish()])
        p = self.pipeline(provider); p.value_lookup = Mock(return_value=["Chi nhánh A"])
        r = p.propose(self.request())
        self.assertEqual(r["status"], "proposal_ready"); self.assertEqual(provider.call_count, 2)
        p.value_lookup.assert_called_once(); p.executor.assert_not_called()

    def test_partial_refinement_merges_before_validation(self):
        p = self.pipeline(query_script()); report = p.generate(self.request())
        q = {"id": "replacement", "replaces": "main", "changed_fields": ["metrics"], "metrics": ["quantity_sold", "product_revenue"]}
        p.executor = fixture_executor([{**ranking_query(), "id": "replacement", "metrics": q["metrics"]}])
        p.provider = ScriptedProvider([call("run_analysis", q, "q"), finish(["replacement"])])
        refined = p.refine(AiReportRefineRequest(session_id=report["session_id"], current_report=report, feedback="thêm doanh thu"))
        updated = refined["analytical_queries"][0]
        for field in ("filters", "time", "ranking"): self.assertEqual(updated[field], report["analytical_queries"][0][field])
        self.assertEqual(len(refined["charts"]), 2)
        self.assertEqual(refined["diagnostics"]["semantic_tool_calls"], 0)
        self.assertEqual(p.provider.call_count, 1)

    def test_invalid_batch_atomic_and_domain_hard_constraint(self):
        bad = {**simple_query(), "id": "bad", "limit": 999}
        p = self.pipeline(ScriptedProvider(discovery(), [call("run_analysis", simple_query(), "one"), call("run_analysis", bad, "two")]), budget=AgentBudget(rounds=2))
        with self.assertRaises(AnalysisError): p.generate(self.request())
        p.executor.assert_not_called()
        req = self.request(); req.domain = "orders"
        p = self.pipeline(ScriptedProvider(discovery(), [call("run_analysis", simple_query())]), budget=AgentBudget(rounds=2))
        with self.assertRaises(AnalysisError): p.propose(req)
        self.assertEqual(p.semantic_info["last_contract_rejection"]["issues"], [{"path": "subject", "code": "scope_conflict"}])
        p.executor.assert_not_called()

    def test_approval_reuses_all_operations_zero_provider_calls(self):
        queries = investigation()
        provider = ScriptedProvider([*discovery(), call("describe_semantic_concept", {"kind": "dimension", "id": "store"}, "store")], [*[call("run_analysis", q, q["id"]) for q in queries], finish([q["id"] for q in queries])])
        p = self.pipeline(provider, executor=fixture_executor(queries)); req = self.request()
        proposal = p.propose(req); p.executor.assert_not_called()
        p.provider = Mock(side_effect=AssertionError("Approval must reuse server plan")); req.session_id = proposal["session_id"]
        report = p.generate(req)
        self.assertEqual(report["status"], "success")
        self.assertEqual((report["diagnostics"]["agent_rounds"], report["diagnostics"]["db_query_count"], len(report["charts"])), (0, 4, 4))
        self.assertEqual(report["dashboard_plan"]["supporting_chart_count"], 3)
        self.assertEqual((report["diagnostics"]["provider_status"], report["diagnostics"]["result_status"]), ("not_started", "passed"))
        p.provider.assert_not_called()
        for op in report["analysis_explanation"]:
            self.assertTrue(op["metrics"][0]["grain"]); self.assertTrue(op["data_sources"]); self.assertTrue(op["evidence_refs"])
            if op["role"] == "supporting": self.assertTrue(op["supporting_reason"])

    def test_http_no_execution_without_approval(self):
        from routers.ai import generate_executive_report
        p = self.pipeline(query_script())
        with patch("routers.ai.AnalysisPipeline", return_value=p): r = generate_executive_report(self.request())
        self.assertEqual(r["diagnostics"]["error_category"], "approval_required")
        self.assertEqual(p.provider.call_count, 0); p.executor.assert_not_called()

    def test_approved_execution_failure_keeps_layer_attribution(self):
        from routers.ai import generate_executive_report
        p = self.pipeline(query_script()); req = self.request()
        req.session_id = p.propose(req)["session_id"]
        p.executor = Mock(side_effect=RuntimeError("PRIVATE DATABASE DETAIL"))
        with patch("routers.ai.AnalysisPipeline", return_value=p): r = generate_executive_report(req)
        d = r["diagnostics"]
        self.assertEqual((d["provider_status"], d["execution_status"], d["result_status"]), ("not_started", "failed", "not_started"))
        self.assertEqual(d["error_category"], "execution")
        self.assertNotIn("PRIVATE", json.dumps(r)); self.assertEqual(r["charts"], [])

    def test_partial_refinement_does_not_hide_failed_result_contract(self):
        p = self.pipeline(query_script()); report = p.generate(self.request())
        q = {**ranking_query(), "id": "replacement", "replaces": "main", "changed_fields": ["metrics"], "metrics": ["quantity_sold", "product_revenue"]}
        p.provider = ScriptedProvider([call("run_analysis", q, "q"), finish(["replacement"])])
        p.executor = Mock(return_value=result(ranked_rows()))  # Missing the new metric.
        refined = p.refine(AiReportRefineRequest(session_id=report["session_id"], current_report=report, feedback="thêm doanh thu"))
        self.assertEqual(refined["completion_status"], "partial")
        self.assertEqual(refined["diagnostics"]["result_status"], "failed")
        self.assertEqual(refined["diagnostics"]["terminal_error"], "result_contract")
        self.assertEqual(refined["result_sets"]["main"]["rows"], report["result_sets"]["main"]["rows"])

    def test_rich_dashboard_result_reuse_diversity_and_units(self):
        queries = rich_queries(); p = self.pipeline(query_script(queries), executor=fixture_executor(queries)); r = p.generate(self.request())
        self.assertEqual((len(r["charts"]), r["diagnostics"]["db_query_count"], p.provider.call_count), (7, 6, 2))
        self.assertTrue({"horizontal_bar", "bar", "line", "donut", "multi_line"} <= {c["chart_type"] for c in r["charts"]})
        self.assertEqual({c["unit"] for c in r["charts"] if c.get("query_id") == "main"}, {"sản phẩm", "VND"})
        self.assertTrue(all(c["chart_type"] != "donut" for c in r["charts"] if c.get("query_id") == "main"))
        self.assertEqual(r["dashboard_plan"]["quality"]["distinct_operations"], 6)
        self.assertTrue(all(s not in r["conclusions"] for s in r["ai_insights"]))

    def test_safe_defaults_paired_and_same_unit_multi_metrics(self):
        a, _ = fixture_artifact(query("delivery", "total_deliveries", "relationship", metrics=["total_deliveries", "driver_rating"], group_by=["driver_id"]))
        d = build_dashboard({"main": a}, analytical_features({"main": a}))
        self.assertEqual((d["charts"][0]["chart_type"], d["charts"][0]["y_unit"]), ("scatter", "điểm"))
        a, _ = fixture_artifact(query("orders", "revenue", metrics=["revenue", "aov"], group_by=["store"]))
        self.assertEqual(build_dashboard({"main": a}, [])["charts"][0]["chart_type"], "grouped_bar")
        a, _ = fixture_artifact(query("orders", "revenue", "trend", metrics=["revenue", "aov"]))
        self.assertEqual(build_dashboard({"main": a}, [])["charts"][0]["chart_type"], "multi_line")

    def test_invalid_visual_fallback_keeps_every_metric(self):
        a, _ = fixture_artifact(ranking_query(metrics=["quantity_sold", "product_revenue"]))
        plan = DashboardPlan(active_query_ids=["main"], visuals=[dict(query_id="main", chart_type="donut", metrics=["quantity_sold"], x_field="product")])
        d = build_dashboard({"main": a}, [], plan)
        self.assertEqual(len(d["charts"]), 2)
        self.assertEqual({c["metric"] for c in d["charts"]}, {"quantity_sold", "product_revenue"})
        self.assertTrue(all(c["chart_type"] != "donut" for c in d["charts"]))
        self.assertIn("invalid_part_to_whole", [v["reason"] for v in d["dashboard_plan"]["omitted_visuals"]])

    def test_snapshot_trend_and_scope_changing_support_rejected(self):
        scenarios = [[query("delivery", "total_deliveries", "trend", granularity="week")], [ranking_query(), query("products", "quantity_sold", id="support", role="supporting", parent_id="main", filters=[], time={"kind": "relative", "mode": "all_time"})]]
        for queries in scenarios:
            p = self.pipeline(query_script(queries), budget=AgentBudget(rounds=2))
            with self.assertRaises(AnalysisError): p.propose(self.request())
            p.executor.assert_not_called()


if __name__ == "__main__": unittest.main()
