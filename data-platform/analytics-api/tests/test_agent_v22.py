"""Offline native agent, algebra, dashboard, evidence and transport coverage."""

import json
import os
import unittest
from copy import deepcopy
from datetime import date
from unittest.mock import Mock, patch
from common import AiTextToReportRequest, AiReportRefineRequest
from services.analysis_pipeline import safe_failure
from tests.archive_planner import ArchivedGraphPipeline as AnalysisPipeline
from services.analysis_catalog import AnalysisCatalog, AnalysisError
from services.data_analyst_agent import (
    DataAnalystAgent,
    AgentBudget,
    SYSTEM,
    TOOL_MODELS,
)
from services.semantic_tools import SemanticTools
from services.analytical_query_service import AnalyticalQueries, signature
from services.analyst_contract import AnalyticalQuery, DashboardPlan
from services.analysis_query import validate_sql, validate_results
from services.insight_service import analytical_features, grounded_narrative
from services.dashboard_planner_service import build_dashboard, chart_reason
from services.agent_provider import (
    NativeAgentProvider,
    gemini_tool_schema,
    http_failure,
)
from services.session_service import get_session
from tests.analysis_fixtures import physical_metadata, ranked_rows, result
from tests.agent_fixtures import ScriptedProvider, call, query_script, ranking_query


REFERENCE = date(2026, 10, 6)


def query(subject, metric, operation="aggregate", **updates):
    q = {"id": "main", "subject": subject, "operation": operation, "metrics": [metric]}
    if operation == "trend":
        q["granularity"] = "day"
    q.update(updates)
    return q


def fixture_artifact(q):
    """Rows follow the compiled projection, not prompt text or domain routing."""
    catalog = AnalysisCatalog(physical_metadata())
    semantic = SemanticTools(catalog, lambda *a, **k: [])
    service = AnalyticalQueries(
        catalog,
        semantic,
        REFERENCE,
        None,
        {"db_query_count": 0, "analytical_cache_hits": 0},
        proposal=True,
    )
    a = service.prepare(q)
    rows = []
    n = (
        min(a.plan.ranking.top_n, 3)
        if a.plan.ranking
        else 1 if not a.plan.dimensions and a.plan.kind != "trend" else 3
    )
    for f in a.plan.filters:
        if f.dimension in a.plan.dimensions and f.operator == "in":
            n = min(n, len(f.value))
    if a.plan.dimensions and a.plan.kind != "trend" and all(
        any(f.dimension == d and f.operator == "eq" for f in a.plan.filters)
        for d in a.plan.dimensions
    ):
        n = 1
    monthly_periods = None
    if a.plan.kind == "trend" and a.plan.granularity == "month":
        from services.time_resolution_service import shift_months
        start = date.fromisoformat(a.plan.period["start"]) if a.plan.period["start"] else shift_months(REFERENCE, -2)
        start = start.replace(day=1)
        monthly_periods = [shift_months(start, i) for i in range(n)]
        if a.plan.period["end"]:
            monthly_periods = [value for value in monthly_periods if value <= date.fromisoformat(a.plan.period["end"])]
        n = len(monthly_periods)
    for i in range(n):
        row = {}
        for d in a.plan.dimensions:
            f = next(
                (f for f in a.plan.filters if f.dimension == d and f.operator in ("eq", "in")),
                None,
            )
            row[d] = (
                (f.value[i % len(f.value)] if f.operator == "in" else f.value)
                if f else str(i + 1) if d.endswith("_id") else f"Nhóm {i+1}"
            )
        if a.plan.kind == "trend":
            from datetime import timedelta

            start = (
                date.fromisoformat(a.grounded.period["start"])
                if a.grounded.period["start"]
                else REFERENCE
            )
            if a.plan.granularity == "week":
                start -= timedelta(days=start.weekday())
            row["period"] = (monthly_periods[i] if monthly_periods is not None else
                start + timedelta(days=i * 7 if a.plan.granularity == "week" else i)).isoformat()
        for m in a.plan.metrics:
            row[m] = (
                100 - i * 10
                if a.plan.ranking and a.plan.ranking.direction == "DESC"
                else 10 + i * 10
            )
        if a.plan.ranking and a.plan.ranking.per_group:
            for d in a.plan.ranking.per_group:
                row[d] = "Nhóm chung"
            row["rank_position"] = i + 1
        rows.append(row)
    a.result = {**result(rows), "columns": a.plan.output_columns}
    verdict = validate_results(a.result, a.plan, a.grounded, catalog)
    if not verdict.valid:
        raise AssertionError(verdict.errors)
    a.contract = verdict.model_dump()
    return a, catalog


class AgentTests(unittest.TestCase):
    def setUp(self):
        config = patch.dict(
            os.environ, {"GEMINI_API_STYLE": "native", "AI_AGENT_GROQ_FALLBACK": "1"}
        )
        config.start()
        self.addCleanup(config.stop)
        for name in ("requests.sessions.Session.request", "psycopg2.connect"):
            guard = patch(
                name, side_effect=AssertionError("OFFLINE: external calls forbidden")
            )
            guard.start()
            self.addCleanup(guard.stop)
        self.catalog = AnalysisCatalog(physical_metadata())

    def pipeline(self, provider=None, executor=None, **kw):
        return AnalysisPipeline(planning_mode="legacy",
            metadata_loader=physical_metadata,
            provider=provider or query_script(),
            executor=executor or Mock(return_value=result(ranked_rows())),
            value_lookup=lambda *a, **k: [],
            **kw,
        )

    def test_llm_first_no_catalog_preload_or_prompt_routing(self):
        provider = query_script()
        pipeline = self.pipeline(provider)
        with patch(
            "services.analysis_understanding.hints",
            side_effect=AssertionError("retired"),
        ), patch(
            "services.analysis_understanding.fast_spec",
            side_effect=AssertionError("retired"),
        ):
            report = pipeline.generate(
                AiTextToReportRequest(
                    prompt="Unseen wording: Zeta 731", reference_date=REFERENCE
                )
            )
        self.assertEqual(report["status"], "success")
        self.assertEqual(provider.call_count, 2)
        first = provider.requests[0]
        self.assertNotIn("quantity_sold", first["messages"][0]["content"])
        self.assertNotIn("silver.", json.dumps(first))
        self.assertEqual(
            {t["name"] for t in first["tools"]},
            {
                "search_semantic_catalog",
                "describe_semantic_concept",
                "ask_clarification",
            },
        )
        self.assertLess(len(first["system"]), 3000)

    def test_proposal_no_query_approval_preserves_meaning_and_skips_final_call(self):
        p = self.pipeline()
        req = AiTextToReportRequest(prompt="fixture", reference_date=REFERENCE)
        proposal = p.propose(req)
        p.executor.assert_not_called()
        req.session_id = proposal["session_id"]
        report = p.generate(req)
        self.assertEqual(report["analysis_spec"], proposal["analysis_spec"])
        p.executor.assert_called_once()
        self.assertEqual(p.provider.call_count, 2)
        self.assertEqual(report["diagnostics"]["agent_rounds"], 0)
        req.prompt = "changed"
        with self.assertRaises(AnalysisError):
            p.generate(req)

    def test_native_discovery_describe_value_query_finish(self):
        provider = ScriptedProvider(
            [call("search_semantic_catalog", {"query": "sản phẩm"})],
            [
                call(
                    "describe_semantic_concept",
                    {"kind": "metric", "id": "quantity_sold"},
                    "m",
                ),
                call(
                    "resolve_dimension_value",
                    {"dimension": "city", "reference": "HCM"},
                    "v",
                ),
            ],
            [
                call(
                    "run_analysis",
                    ranking_query(
                        filters=[{"dimension": "city", "value": "Hồ Chí Minh"}]
                    ),
                    "a",
                ),
                call("finish_analysis", {"active_query_ids": ["main"]}, "f"),
            ],
        )
        r = self.pipeline(provider).generate(
            AiTextToReportRequest(prompt="scripted case", reference_date=REFERENCE)
        )
        self.assertEqual(r["diagnostics"]["semantic_tool_calls"], 3)
        self.assertEqual(r["diagnostics"]["db_query_count"], 1)
        self.assertEqual(r["interpretation"]["filters"][0]["value"], "Hồ Chí Minh")

    def test_unknown_entity_requires_explicit_bounded_lookup(self):
        lookup = Mock(return_value=["Chi nhánh A"])
        semantic = SemanticTools(self.catalog, lookup)
        answer = semantic.resolve({"dimension": "store", "reference": "Chi nhánh A"})
        self.assertEqual(answer["value"], "Chi nhánh A")
        lookup.assert_called_once()
        with self.assertRaises(AnalysisError):
            semantic.resolve({"dimension": "unknown", "reference": "A"})

    def test_cache_equivalence_reordered_fields_filters_and_ids(self):
        q = AnalyticalQuery.model_validate(ranking_query())
        a, _ = fixture_artifact(q.model_dump(mode="json"))
        q2 = q.model_copy(update={"id": "other", "filters": list(reversed(q.filters))})
        self.assertEqual(
            signature(q, a.grounded.period, self.catalog.fingerprint),
            signature(q2, a.grounded.period, self.catalog.fingerprint),
        )
        self.assertNotEqual(
            signature(q, a.grounded.period, self.catalog.fingerprint),
            signature(
                q.model_copy(
                    update={"ranking": q.ranking.model_copy(update={"top_n": 3})}
                ),
                a.grounded.period,
                self.catalog.fingerprint,
            ),
        )
        p = self.pipeline(
            query_script([q.model_dump(mode="json"), q2.model_dump(mode="json")])
        )
        r = p.generate(
            AiTextToReportRequest(prompt="fixture", reference_date=REFERENCE)
        )
        p.executor.assert_called_once()
        self.assertEqual(r["diagnostics"]["analytical_cache_hits"], 1)

    def test_semantic_cache_and_round_budget(self):
        c = call("describe_semantic_concept", {"kind": "subject", "id": "products"})
        p = self.pipeline(ScriptedProvider([c], [c], [c]), budget=AgentBudget(rounds=3))
        with self.assertRaises(AnalysisError) as caught:
            p.propose(AiTextToReportRequest(prompt="fixture"))
        self.assertEqual(p.semantic_info["semantic_cache_hits"], 2)
        self.assertEqual(caught.exception.category, "agent_budget")
        self.assertIn("số lượt", safe_failure(caught.exception)["message"])
        self.assertEqual(
            [e["cache_hit"] for e in p.semantic_info["tool_trace"]],
            [False, True, True],
        )
        self.assertNotIn("products", json.dumps(p.semantic_info["tool_trace"]))
        p.executor.assert_not_called()

    def test_search_projects_grounded_semantics_with_bounded_enum_values(self):
        lookup = Mock(side_effect=AssertionError("No row lookup during discovery"))
        semantic = SemanticTools(self.catalog, lookup)
        found = semantic.search({"query": "doanh thu", "kind": "metric"})
        revenue = next(m for m in found["matches"] if m["id"] == "revenue")
        self.assertEqual(revenue["subjects"], ["orders"])
        self.assertEqual(revenue["grain"], "order")
        self.assertEqual(revenue["unit"], "VND")
        self.assertIn("city", revenue["dimensions"])
        self.assertEqual(
            revenue["business_filters"],
            self.catalog.registry["metrics"]["revenue"]["business_filters"],
        )
        self.assertLessEqual(len(revenue["dimensions"]), 6)
        self.assertEqual(revenue["pages"]["dimensions"]["next_offset"], 6)
        self.assertNotIn("expression", revenue)
        self.assertNotIn("silver.", json.dumps(found))
        broad = semantic.search({"query": "a", "limit": 12})
        self.assertEqual(len(broad["matches"]), 12)
        self.assertEqual(broad["next_offset"], 12)
        for page in (found, broad):
            self.assertLess(
                len(json.dumps(page, ensure_ascii=False, separators=(",", ":"))),
                AgentBudget().tool_result_chars - 100,
            )
        city = semantic.describe("dimension", "city")
        self.assertIn("Hà Nội", city["canonical_values"])
        self.assertIn("Hồ Chí Minh", city["canonical_values"])
        self.assertEqual(len(city["canonical_values"]), 8)
        self.assertFalse(city["values_complete"])
        store = semantic.describe("dimension", "store")
        self.assertEqual(store["value_mode"], "lookup")
        self.assertNotIn("canonical_values", store)
        lookup.assert_not_called()

    def test_city_comparison_proposal_finishes_in_three_rounds_without_sql(self):
        provider = ScriptedProvider(
            [call("search_semantic_catalog", {"query": "doanh thu", "kind": "metric"})],
            [call("describe_semantic_concept", {"kind": "dimension", "id": "city"})],
            [
                call(
                    "run_analysis",
                    query(
                        "orders",
                        "revenue",
                        group_by=["city"],
                        filters=[
                            {
                                "dimension": "city",
                                "operator": "in",
                                "value": ["Hà Nội", "Hồ Chí Minh"],
                            }
                        ],
                    ),
                    "q",
                ),
                call("finish_analysis", {"active_query_ids": ["main"]}, "f"),
            ],
        )
        p = self.pipeline(provider, budget=AgentBudget(rounds=3))
        p.value_lookup = Mock(side_effect=AssertionError("No row lookup"))
        response = p.propose(
            AiTextToReportRequest(prompt="fixture", reference_date=REFERENCE)
        )
        self.assertEqual(response["status"], "proposal_ready")
        self.assertEqual(response["diagnostics"]["agent_rounds"], 3)
        self.assertEqual(response["diagnostics"]["analytical_tool_calls"], 1)
        self.assertEqual(response["diagnostics"]["db_query_count"], 0)
        p.executor.assert_not_called()
        p.value_lookup.assert_not_called()
        for i, remaining in ((1, 2), (2, 1)):
            tool_result = [
                m["result"]
                for m in provider.requests[i]["messages"]
                if m["role"] == "tool"
            ][-1]
            self.assertEqual(
                tool_result["agent_progress"]["rounds_remaining"], remaining
            )
            self.assertEqual(tool_result["agent_progress"]["registered_queries"], 0)
        trace = response["diagnostics"]["tool_trace"]
        self.assertEqual(len(trace), 4)
        self.assertEqual(trace[-1]["status"], "finished")
        self.assertEqual(trace[-1]["registered_queries"], 1)
        self.assertNotIn("Hà Nội", json.dumps(trace, ensure_ascii=False))

    def test_invalid_batch_rejected_before_any_execution(self):
        bad = ranking_query(id="bad", limit=100000)
        p = self.pipeline(query_script([ranking_query(), bad]))
        with self.assertRaises(AnalysisError):
            p.generate(AiTextToReportRequest(prompt="fixture"))
        p.executor.assert_not_called()

    def test_no_sql_repair_on_execution_failure(self):
        p = self.pipeline(executor=Mock(side_effect=RuntimeError("raw database error")))
        with self.assertRaises(AnalysisError) as caught:
            p.generate(AiTextToReportRequest(prompt="fixture"))
        self.assertEqual(caught.exception.category, "execution")
        p.executor.assert_called_once()
        self.assertNotIn("raw database error", json.dumps(p.provider.requests))
        self.assertNotIn("sql", json.dumps(p.provider.requests))

    def test_provider_failure_before_and_after_results(self):
        p = self.pipeline(ScriptedProvider(None))
        with self.assertRaises(AnalysisError) as caught:
            p.generate(AiTextToReportRequest(prompt="fixture"))
        self.assertEqual(safe_failure(caught.exception)["status"], "error")
        p.executor.assert_not_called()
        p = self.pipeline(
            ScriptedProvider(
                [
                    call(
                        "describe_semantic_concept",
                        {"kind": "subject", "id": "products"},
                    )
                ],
                [call("run_analysis", ranking_query())],
                None,
            )
        )
        r = p.generate(AiTextToReportRequest(prompt="fixture"))
        self.assertTrue(r["charts"])
        self.assertTrue(r["evidence"])
        self.assertTrue(r["data_warnings"])

    def test_clarification_preserves_meaning_catalog_choices(self):
        known = ranking_query(
            subject="stores",
            metrics=[],
            group_by=["store"],
            time={"kind": "relative", "mode": "previous_month"},
            ranking={"metric": "store_revenue", "top_n": 5},
        )
        p = self.pipeline(
            ScriptedProvider(
                [
                    call(
                        "ask_clarification",
                        {
                            "reason": "metric_ambiguous",
                            "subject": "stores",
                            "known_query": known,
                            "missing_fields": ["metrics"],
                        },
                    )
                ]
            )
        )
        with self.assertRaises(AnalysisError) as caught:
            p.propose(AiTextToReportRequest(prompt="fixture", reference_date=REFERENCE))
        r = safe_failure(caught.exception)
        self.assertEqual(r["status"], "needs_clarification")
        self.assertEqual(r["interpretation"]["time_range"]["start"], "2026-09-01")
        self.assertEqual(
            {c["id"] for c in r["options"]},
            set(self.catalog.registry["subjects"]["stores"]["metrics"]),
        )
        p.executor.assert_not_called()

    def test_clarification_malformed_nested_field_preserves_valid_meaning(self):
        known = ranking_query(
            filters=[
                {"dimension": "city", "value": "Hà Nội"},
                {"dimension": "city", "operator": "raw_sql", "value": "invalid"},
            ],
            time={"kind": "month", "month": 99, "year": 2026},
        )
        p = self.pipeline(
            ScriptedProvider(
                [
                    call(
                        "ask_clarification",
                        {
                            "reason": "time_range_invalid",
                            "known_query": known,
                            "missing_fields": ["time"],
                        },
                    )
                ]
            )
        )
        with self.assertRaises(AnalysisError) as caught:
            p.propose(AiTextToReportRequest(prompt="fixture", reference_date=REFERENCE))
        response = safe_failure(caught.exception)
        self.assertEqual(response["status"], "needs_clarification")
        self.assertTrue(response["interpretation"]["metrics"])
        self.assertEqual(response["interpretation"]["filters"][0]["value"], "Hà Nội")
        self.assertEqual(response["interpretation"]["ranking"]["top_n"], 5)
        self.assertIn("filters", response["clarification"]["missing_fields"])
        p.executor.assert_not_called()

    def test_malformed_native_tool_name_rejected_before_execution(self):
        p = self.pipeline(
            ScriptedProvider(
                [{"id": "bad", "name": ["run_analysis"], "arguments": ranking_query()}]
            )
        )
        with self.assertRaises(AnalysisError) as caught:
            p.generate(AiTextToReportRequest(prompt="fixture"))
        self.assertEqual(caught.exception.category, "provider_invalid_tools")
        p.executor.assert_not_called()

    def test_refine_chart_only_reuses_server_rows_and_ignores_client_facts(self):
        p = self.pipeline()
        report = p.generate(
            AiTextToReportRequest(prompt="fixture", reference_date=REFERENCE)
        )
        p.provider = ScriptedProvider(
            [
                call(
                    "finish_analysis",
                    {
                        "active_query_ids": ["main"],
                        "visuals": [
                            {
                                "query_id": "main",
                                "chart_type": "bar",
                                "metrics": ["quantity_sold"],
                                "x_field": "product",
                                "purpose": "ranking",
                            }
                        ],
                    },
                )
            ]
        )
        r = p.refine(
            AiReportRefineRequest(
                current_report={
                    "revision": report["revision"],
                    "sql": "DELETE",
                    "rows": [{"fake": 999999}],
                },
                feedback="fixture refinement",
                session_id=report["session_id"],
            )
        )
        p.executor.assert_called_once()
        self.assertEqual(r["charts"][0]["chart_type"], "bar")
        self.assertEqual(r["diagnostics"]["analytical_cache_hits"], 1)
        self.assertNotIn("DELETE", json.dumps(p.provider.requests))
        self.assertNotIn("999999", json.dumps(p.provider.requests))
        with self.assertRaises(AnalysisError):
            p.refine(
                AiReportRefineRequest(
                    current_report=report,
                    feedback="stale",
                    session_id=report["session_id"],
                )
            )

    def test_refine_inherits_scope_for_changed_metric(self):
        p = self.pipeline()
        report = p.generate(
            AiTextToReportRequest(prompt="fixture", reference_date=REFERENCE)
        )
        changed = ranking_query(
            id="replacement",
            metrics=["product_revenue"],
            ranking={"metric": "product_revenue", "top_n": 5},
            filters=[],
            time={"kind": "relative", "mode": "all_time"},
            replaces="main",
            changed_fields=["metrics", "ranking"],
        )
        p.provider = ScriptedProvider(
            [
                call("run_analysis", changed, "q"),
                call("finish_analysis", {"active_query_ids": ["replacement"]}, "f"),
            ]
        )
        p.executor = Mock(
            return_value=result(
                [
                    {
                        **{k: v for k, v in r.items() if k != "quantity_sold"},
                        "product_revenue": 100 - i * 10,
                    }
                    for i, r in enumerate(ranked_rows())
                ]
            )
        )
        r = p.refine(
            AiReportRefineRequest(
                current_report=report,
                feedback="scripted change",
                session_id=report["session_id"],
            )
        )
        q = r["analytical_queries"][0]
        self.assertEqual(q["filters"], report["analytical_queries"][0]["filters"])
        self.assertEqual(q["time"], report["analytical_queries"][0]["time"])
        self.assertEqual(r["diagnostics"]["reference_date"], REFERENCE.isoformat())

    def test_ui_scope_rejected_before_execution(self):
        p = self.pipeline()
        with self.assertRaises(AnalysisError):
            p.generate(
                AiTextToReportRequest(
                    prompt="fixture",
                    time_range={"mode": "7d"},
                    reference_date=REFERENCE,
                )
            )
        p.executor.assert_not_called()

    def test_schema_fingerprint_rejects_stale_approval(self):
        p = self.pipeline()
        req = AiTextToReportRequest(prompt="fixture")
        proposal = p.propose(req)
        req.session_id = proposal["session_id"]
        changed = physical_metadata()
        changed["table_map"]["silver.san_pham"]["columns"].pop()
        p.metadata_loader = lambda: changed
        with self.assertRaises(AnalysisError):
            p.generate(req)
        p.executor.assert_not_called()

    def test_supporting_query_cannot_broaden_time_or_population(self):
        parent = ranking_query()
        support = ranking_query(
            id="support",
            role="supporting",
            parent_id="main",
            operation="aggregate",
            ranking=None,
            group_by=[],
            filters=[],
        )
        p = self.pipeline(query_script([parent, support]))
        with self.assertRaises(AnalysisError):
            p.generate(AiTextToReportRequest(prompt="fixture"))
        p.executor.assert_not_called()

    def test_related_subjects_are_grounded_and_population_contracts_must_match(self):
        semantic = SemanticTools(self.catalog, None)
        related = semantic.describe("subject", "orders")["related_subjects"]
        self.assertIn("products", [s["id"] for s in related])
        self.assertIn("stores", [s["id"] for s in related])
        self.assertTrue(
            semantic.cohort_compatible(
                "orders", "products", ["revenue"], ["quantity_sold"]
            )
        )
        self.assertFalse(
            semantic.cohort_compatible(
                "products", "orders", ["quantity_sold"], ["revenue"]
            )
        )
        changed = deepcopy(self.catalog)
        changed.registry["metrics"]["quantity_sold"]["business_filters"] = []
        self.assertFalse(
            SemanticTools(changed, None).cohort_compatible(
                "orders", "products", ["revenue"], ["quantity_sold"]
            )
        )
        self.assertNotIn("silver.", json.dumps(related))

    def test_multi_subject_investigation_has_distinct_views_and_evidence(self):
        queries = [
            query("orders", "revenue", group_by=["city"]),
            query(
                "stores",
                "store_revenue",
                "ranking",
                id="branches",
                group_by=["store"],
                ranking={"metric": "store_revenue", "top_n": 5},
                role="supporting",
                parent_id="main",
            ),
            query(
                "products",
                "quantity_sold",
                "ranking",
                id="items",
                group_by=["product"],
                ranking={"metric": "quantity_sold", "top_n": 5},
                role="supporting",
                parent_id="main",
            ),
            query(
                "orders",
                "revenue",
                "trend",
                id="history",
                group_by=["city"],
                role="supporting",
                parent_id="main",
            ),
            query(
                "orders",
                "revenue",
                "distribution",
                id="composition",
                group_by=["order_type"],
                role="supporting",
                parent_id="main",
            ),
        ]
        rows_by_sql = {}
        for q in queries:
            a, _ = fixture_artifact({**q, "role": "requested", "parent_id": None})
            rows_by_sql[a.sql] = a.result
        executor = Mock(side_effect=lambda sql, **kw: rows_by_sql[sql])
        provider = query_script(queries)
        p = self.pipeline(provider, executor=executor, budget=AgentBudget(supporting_operations=4))
        response = p.generate(
            AiTextToReportRequest(
                prompt="unseen analytical question", reference_date=REFERENCE
            )
        )
        self.assertEqual(response["status"], "success")
        self.assertEqual(executor.call_count, 5)
        self.assertEqual(provider.call_count, 2)
        kinds = {c["chart_type"] for c in response["charts"]}
        # Complete additive group partitions can now use composition views;
        # representation is determined by semantics rather than a type quota.
        self.assertTrue({"horizontal_bar", "multi_line", "donut"} <= kinds)
        self.assertEqual(response["dashboard_plan"]["supporting_chart_count"], 4)
        self.assertEqual(len(response["analysis_explanation"]), 5)
        evidence_ids = {e["id"] for e in response["evidence"]}
        for op in response["analysis_explanation"]:
            self.assertTrue(op["data_sources"])
            self.assertTrue(op["objective"])
            self.assertTrue(op["visuals"])
            self.assertTrue(set(op["evidence_refs"]) <= evidence_ids)
        self.assertNotIn("SELECT ", json.dumps(response["analysis_explanation"]))
        for finding in response["key_findings"]:
            self.assertNotEqual(finding["finding"], finding["comment"])

    def test_related_support_cannot_change_population_or_time(self):
        parent = query(
            "orders", "revenue", filters=[{"dimension": "city", "value": "Hà Nội"}]
        )
        for updates in (
            {"filters": []},
            {"time": {"kind": "relative", "mode": "current_month"}},
        ):
            support = query(
                "products",
                "quantity_sold",
                id="items",
                filters=parent["filters"],
                role="supporting",
                parent_id="main",
            )
            support.update(updates)
            p = self.pipeline(query_script([parent, support]))
            with self.assertRaises(AnalysisError):
                p.propose(
                    AiTextToReportRequest(prompt="fixture", reference_date=REFERENCE)
                )
            p.executor.assert_not_called()

    def test_ranking_features_exact_math_and_generic_units(self):
        a, _ = fixture_artifact(ranking_query())
        a.result = result(ranked_rows())
        features = analytical_features({"main": a})
        gap = next(e for e in features if e["feature"] == "top_gap")
        self.assertEqual(gap["values"]["gap"], 10)
        self.assertAlmostEqual(gap["values"]["relative_gap_pct"], 100 / 9)
        total = next(e for e in features if e["feature"] == "selected_total")
        self.assertEqual(total["values"]["total"], 400)
        self.assertTrue(all(e["unit"] == "sản phẩm" for e in features))

    def test_trend_features_change_peak_volatility_and_zero_baseline(self):
        a, _ = fixture_artifact(query("orders", "revenue", "trend"))
        a.result = result(
            [
                {"period": f"2026-10-0{i+1}", "revenue": v}
                for i, v in enumerate([0, 30, 20])
            ]
        )
        f = next(
            e for e in analytical_features({"main": a}) if e["feature"] == "change"
        )
        self.assertEqual(f["values"]["change"], 20)
        self.assertIsNone(f["values"]["change_pct"])
        self.assertEqual(f["values"]["peak"], 30)
        self.assertAlmostEqual(f["values"]["volatility"], (1400 / 9) ** 0.5)

    def test_declining_trend_statement_matches_observed_change(self):
        a, _ = fixture_artifact(query("orders", "revenue", "trend"))
        a.result = result(
            [
                {"period": "2026-10-01", "revenue": 100},
                {"period": "2026-10-02", "revenue": 50},
            ]
        )
        feature = next(
            e for e in analytical_features({"main": a}) if e["feature"] == "change"
        )
        self.assertEqual(feature["values"]["direction"], "down")
        self.assertEqual(feature["values"]["change_pct"], -50)
        self.assertNotIn(" lên ", feature["statement"])

    def test_grouped_comparison_uses_extrema_not_row_position(self):
        a, _ = fixture_artifact(query("orders", "revenue", group_by=["store"]))
        a.result = result(
            [
                {"store": "Nhóm giữa", "store_id": "b", "revenue": 200},
                {"store": "Nhóm thấp", "store_id": "a", "revenue": 100},
                {"store": "Nhóm cao", "store_id": "c", "revenue": 500},
            ]
        )
        feature = next(
            e
            for e in analytical_features({"main": a})
            if e["feature"] == "group_comparison"
        )
        self.assertEqual(feature["values"]["largest"], "Nhóm cao")
        self.assertEqual(feature["values"]["smallest"], "Nhóm thấp")
        self.assertEqual(feature["values"]["gap"], 400)
        a.result["rows"][0]["revenue"] = None
        self.assertFalse(analytical_features({"main": a}))

    def test_default_summary_balances_multiple_operations_and_metrics(self):
        artifacts = {}
        for id in ("hn", "ct"):
            a, _ = fixture_artifact(
                ranking_query(id=id, metrics=["quantity_sold", "product_revenue"])
            )
            artifacts[id] = a
        trend, _ = fixture_artifact(query("orders", "revenue", "trend", id="weekly"))
        artifacts["weekly"] = trend
        narrative = grounded_narrative(
            DashboardPlan(active_query_ids=list(artifacts)),
            analytical_features(artifacts),
        )
        first_five = narrative["key_findings"][:5]
        self.assertEqual(
            {f["evidence_id"].split(":")[0] for f in first_five[:3]}, set(artifacts)
        )
        self.assertEqual(
            {f["evidence_id"].split(":")[0] for f in first_five}, set(artifacts)
        )
        self.assertEqual(
            {f["evidence_id"].split(":")[1] for f in first_five},
            {"quantity_sold", "product_revenue", "revenue"},
        )

    def test_distribution_and_correlation_observational(self):
        a, _ = fixture_artifact(
            query("orders", "order_count", "distribution", group_by=["payment_method"])
        )
        a.result = result(
            [
                {"payment_method": str(i), "order_count": v}
                for i, v in enumerate([10, 20, 70])
            ]
        )
        f = analytical_features({"main": a})[0]
        self.assertEqual(f["values"]["largest_share_pct"], 70)
        self.assertAlmostEqual(f["values"]["hhi"], 0.54)
        b, _ = fixture_artifact(
            query(
                "delivery",
                "total_deliveries",
                "relationship",
                metrics=["total_deliveries", "driver_rating"],
                group_by=["driver_id"],
            )
        )
        b.result = result(
            [
                {"driver_id": str(i), "total_deliveries": i * 10, "driver_rating": i}
                for i in [1, 2, 3]
            ]
        )
        f = analytical_features({"main": b})[0]
        self.assertAlmostEqual(f["values"]["r"], 1)
        self.assertIn("không chứng minh nguyên nhân", f["statement"])

    def test_invented_percent_and_stock_action_rejected(self):
        a, _ = fixture_artifact(ranking_query())
        evidence = analytical_features({"main": a})
        e = evidence[0]
        plan = DashboardPlan(
            active_query_ids=["main"],
            claims=[
                {
                    "evidence_id": e["id"],
                    "metric": e["metric"],
                    "scope_ref": e["scope_ref"],
                    "claim_type": e["claim_type"],
                    "text": "Tăng 45% và cần nhập kho",
                }
            ],
            recommendations=[{"evidence_id": e["id"], "action": "monitor_variation"}],
        )
        narrative = grounded_narrative(plan, evidence)
        self.assertNotIn("45%", narrative["executive_summary"])
        self.assertEqual(len(narrative["rejected_narrative"]), 2)
        with self.assertRaises(ValueError):
            DashboardPlan(
                active_query_ids=["main"],
                recommendations=[{"evidence_id": e["id"], "action": "restock"}],
            )

    def test_multimetric_mixed_units_linked_and_same_unit_grouped(self):
        a, c = fixture_artifact(
            ranking_query(metrics=["quantity_sold", "product_revenue"])
        )
        dashboard = build_dashboard({"main": a}, analytical_features({"main": a}))
        self.assertEqual(len(dashboard["charts"]), 2)
        b, c = fixture_artifact(
            query("orders", "revenue", metrics=["revenue", "aov"], group_by=["store"])
        )
        plan = DashboardPlan(
            active_query_ids=["main"],
            visuals=[
                {
                    "query_id": "main",
                    "chart_type": "grouped_bar",
                    "metrics": ["revenue", "aov"],
                    "x_field": "store",
                }
            ],
        )
        d = build_dashboard({"main": b}, analytical_features({"main": b}), plan)
        self.assertEqual(d["charts"][0]["chart_type"], "grouped_bar")
        bad = deepcopy(plan)
        bad.visuals[0].metrics = ["quantity_sold", "product_revenue"]
        self.assertTrue(
            build_dashboard({"main": a}, [], bad)["dashboard_plan"]["omitted_visuals"]
        )

    def test_distribution_defaults_use_bar_for_average_and_group_complete_composition(self):
        average, _ = fixture_artifact(
            query("orders", "aov", "distribution", group_by=["store"])
        )
        self.assertEqual(
            build_dashboard({"main": average}, [])["charts"][0]["chart_type"], "bar"
        )
        complete, _ = fixture_artifact(
            query("products", "quantity_sold", "distribution", group_by=["product"])
        )
        complete.result["rows"] = [
            {"product": f"Nhóm {i}", "product_id": str(i), "quantity_sold": i + 1}
            for i in range(9)
        ]
        chart = build_dashboard({"main": complete}, [])["charts"][0]
        self.assertEqual(chart["chart_type"], "donut")
        self.assertEqual(len(chart["data"]), 7)
        self.assertEqual(sum(r["value"] for r in chart["data"]), 45)
        complete.result["rows"] = complete.result["rows"][:3]
        self.assertEqual(
            build_dashboard({"main": complete}, [])["charts"][0]["chart_type"], "donut"
        )
        complete.plan.explicit_limit = True
        self.assertEqual(
            build_dashboard({"main": complete}, [])["charts"][0]["chart_type"], "bar"
        )

    def test_dashboard_priority_duplicates_and_cap(self):
        artifacts = {}
        for i in range(8):
            a, _ = fixture_artifact(
                ranking_query(
                    id=f"q{i}",
                    filters=[
                        {
                            "dimension": "city",
                            "value": "Hà Nội" if i % 2 else "Hồ Chí Minh",
                        }
                    ],
                    ranking={"metric": "quantity_sold", "top_n": i + 1},
                )
            )
            artifacts[a.query.id] = a
        artifacts["q0"].query.role = "supporting"
        visuals = [
            {
                "query_id": id,
                "chart_type": "bar",
                "metrics": ["quantity_sold"],
                "x_field": "product",
                "priority": 100 if id == "q0" else 50,
            }
            for id in artifacts
        ]
        visuals.append({**visuals[1], "chart_type": "horizontal_bar"})
        d = build_dashboard(
            artifacts,
            [],
            DashboardPlan(active_query_ids=list(artifacts), visuals=visuals),
            max_charts=6,
        )
        self.assertEqual(len(d["charts"]), 6)
        self.assertTrue(all(c["role"] == "requested" for c in d["charts"]))
        reasons = {o["reason"] for o in d["dashboard_plan"]["omitted_visuals"]}
        self.assertIn("chart_budget", reasons)
        self.assertIn("duplicate_semantic_view", reasons)

    def test_stacked_complete_dimension_partition_and_scatter(self):
        a, _ = fixture_artifact(
            query(
                "orders",
                "revenue",
                "cross_tab",
                group_by=["payment_method", "order_type"],
            )
        )
        plan = DashboardPlan(
            active_query_ids=["main"],
            visuals=[
                {
                    "query_id": "main",
                    "chart_type": "stacked_100",
                    "metrics": ["revenue"],
                    "x_field": "payment_method",
                    "series_field": "order_type",
                    "purpose": "distribution",
                }
            ],
        )
        d = build_dashboard({"main": a}, [], plan)
        self.assertEqual(d["charts"][0]["unit"], "%")
        for row in d["charts"][0]["data"]:
            self.assertAlmostEqual(sum(v for k, v in row.items() if k != "label"), 100)
        a.plan.explicit_limit = True
        safe = build_dashboard({"main": a}, [], plan)
        self.assertTrue(all(c["chart_type"] != "stacked_100" for c in safe["charts"]))
        self.assertIn("invalid_part_to_whole", [o["reason"] for o in safe["dashboard_plan"]["omitted_visuals"]])

    def test_result_rows_never_replayed_in_refinement_context(self):
        p = self.pipeline()
        r = p.generate(AiTextToReportRequest(prompt="fixture"))
        session = get_session(r["session_id"])
        session.report_response["private_marker"] = "FORBIDDEN_REPLAY"
        p.provider = ScriptedProvider(
            [call("finish_analysis", {"active_query_ids": ["main"]})]
        )
        p.refine(
            AiReportRefineRequest(
                current_report=r, feedback="fixture", session_id=r["session_id"]
            )
        )
        context = json.dumps(p.provider.requests)
        self.assertNotIn("FORBIDDEN_REPLAY", context)
        self.assertNotIn("SELECT ", context)

    def test_provider_http_failure_is_specific_and_logs_no_response_or_key(self):
        cases = {
            400: "provider_bad_request",
            401: "provider_auth",
            403: "provider_access_denied",
            404: "provider_model_not_found",
            429: "provider_rate_limited",
            503: "provider_unavailable",
        }
        for status, category in cases.items():
            with self.subTest(status=status):
                response = Mock(
                    ok=False, status_code=status, text="PRIVATE_PROVIDER_BODY"
                )
                provider = NativeAgentProvider(legacy_policy=True)
                with patch.dict(os.environ, {"AI_OFFLINE": "0"}), patch(
                    "services.llm_service.GEMINI_API_KEY", "PRIVATE_API_KEY"
                ), patch("services.llm_service.GROQ_API_KEY", ""), patch(
                    "services.agent_provider.requests.post", return_value=response
                ), self.assertLogs(
                    "ai-native-provider", level="WARNING"
                ) as logs:
                    p = self.pipeline(provider=provider)
                    with self.assertRaises(AnalysisError) as caught:
                        p.propose(AiTextToReportRequest(prompt="fixture"))
                self.assertEqual(caught.exception.category, category)
                failure = safe_failure(caught.exception)
                self.assertEqual(failure["status"], "error")
                self.assertNotIn("diễn giải", failure["message"])
                self.assertEqual(p.calls[0]["http_status"], status)
                self.assertIn(f"http_status={status}", " ".join(logs.output))
                self.assertNotIn("PRIVATE_API_KEY", " ".join(logs.output))
                self.assertNotIn("PRIVATE_PROVIDER_BODY", json.dumps(p.calls))
                response.json.assert_called()
                p.executor.assert_not_called()

    def test_daily_quota_is_specific_bounded_and_private(self):
        response = Mock(ok=False, status_code=429, headers={})
        response.json.return_value = [
            {
                "error": {
                    "status": "RESOURCE_EXHAUSTED",
                    "message": "PRIVATE_PROVIDER_BODY",
                    "details": [
                        {
                            "violations": [
                                {
                                    "quotaId": "GenerateRequestsPerModelPerDay-FreeTier",
                                    "quotaMetric": "generate_requests",
                                    "quotaValue": "20",
                                    "quotaDimensions": {"project": "PRIVATE_PROJECT"},
                                }
                            ]
                        },
                        {"retryDelay": "61603s"},
                    ],
                }
            }
        ]
        failure = http_failure(response)
        self.assertEqual(failure["error_category"], "provider_daily_quota")
        self.assertEqual(
            failure["quota_scopes"],
            [{"unit": "requests", "window": "day", "limit": 20}],
        )
        self.assertEqual(failure["retry_after_seconds"], 61603)
        with patch.dict(
            os.environ, {"AI_OFFLINE": "0", "AI_AGENT_GROQ_FALLBACK": "0"}
        ), patch("services.llm_service.GEMINI_API_KEY", "fixture"), patch(
            "services.llm_service.GEMINI_MODELS", ("first", "second", "third")
        ), patch(
            "services.agent_provider.requests.post", return_value=response
        ) as post, self.assertLogs(
            "ai-native-provider", level="WARNING"
        ) as logs:
            p = self.pipeline(NativeAgentProvider(legacy_policy=True))
            with self.assertRaises(AnalysisError) as caught:
                p.propose(AiTextToReportRequest(prompt="fixture"))
        self.assertEqual(post.call_count, 3)
        self.assertEqual(caught.exception.category, "provider_daily_quota")
        answer = safe_failure(caught.exception, p.calls)
        self.assertIn("20 yêu cầu/ngày", answer["message"])
        self.assertIn("17 giờ 7 phút", answer["message"])
        self.assertEqual(answer["question"], answer["message"])
        p.executor.assert_not_called()
        for marker in ("PRIVATE_PROJECT", "PRIVATE_PROVIDER_BODY"):
            self.assertNotIn(
                marker, json.dumps(p.calls) + json.dumps(answer) + str(logs.output)
            )

    def test_minute_quota_and_malformed_details_are_not_daily(self):
        response = Mock(status_code=429, headers={"Retry-After": "999999"})
        response.json.return_value = {
            "error": {
                "details": [
                    {
                        "retryDelay": "NaNs",
                        "violations": [
                            {
                                "quotaId": "InputTokensPerMinute",
                                "quotaMetric": "token",
                                "quotaValue": "6000",
                            },
                            {"quotaId": {}, "quotaMetric": "PRIVATE"},
                            "PRIVATE",
                        ],
                    },
                    {"violations": {"PRIVATE": "value"}},
                    "PRIVATE",
                    {"retryDelay": []},
                ]
            }
        }
        failure = http_failure(response)
        self.assertEqual(failure["error_category"], "provider_rate_limited")
        self.assertEqual(failure["retry_after_seconds"], 86400)
        self.assertEqual(
            failure["quota_scopes"],
            [{"unit": "tokens", "window": "minute", "limit": 6000}],
        )
        self.assertNotIn("PRIVATE", json.dumps(failure))

    def test_gemini_tool_schemas_declare_objects_and_filter_values(self):
        def walk(schema):
            if isinstance(schema, list):
                for child in schema:
                    walk(child)
            elif isinstance(schema, dict):
                if schema.get("type") == "object":
                    self.assertTrue(schema.get("properties"))
                    if {"dimension", "operator", "value"} <= schema[
                        "properties"
                    ].keys():
                        value = schema["properties"]["value"]
                        self.assertEqual(
                            {s["type"] for s in value["anyOf"]},
                            {"string", "number", "boolean", "array"},
                        )
                for child in schema.values():
                    walk(child)

        for name, (model, description) in TOOL_MODELS.items():
            with self.subTest(tool=name):
                schema = gemini_tool_schema(
                    {
                        "name": name,
                        "description": description,
                        "parameters": model.model_json_schema(),
                    }
                )
                walk(schema)
                if name == "ask_clarification":
                    draft = schema["properties"]["known_query"]["anyOf"][0]
                    self.assertNotIn("required", draft)
                    self.assertEqual(
                        set(draft["properties"]),
                        {
                            "subject",
                            "operation",
                            "metrics",
                            "group_by",
                            "filters",
                            "ranking",
                            "time",
                        },
                    )
                    self.assertNotIn("id", draft["properties"])

    def test_gemini_wire_omits_validation_dialect_but_server_keeps_bounds(self):
        allowed = {
            "type",
            "properties",
            "required",
            "enum",
            "items",
            "anyOf",
            "nullable",
            "description",
        }

        def walk(schema):
            self.assertFalse(set(schema) - allowed)
            for child in schema.get("properties", {}).values():
                walk(child)
            if "items" in schema:
                walk(schema["items"])
            for child in schema.get("anyOf", []):
                walk(child)

        for name, (model, description) in TOOL_MODELS.items():
            source = model.model_json_schema()
            before = deepcopy(source)
            walk(gemini_tool_schema({"name": name, "parameters": source}))
            self.assertEqual(source, before)
        search = TOOL_MODELS["search_semantic_catalog"][0]
        with self.assertRaises(ValueError):
            search.model_validate({"query": "x" * 121})
        with self.assertRaises(ValueError):
            search.model_validate({"query": "ok", "limit": 99})
        with self.assertRaises(ValueError):
            search.model_validate({"query": "ok", "sql": "SELECT 1"})

    def test_gemini_only_preserves_400_instead_of_masking_with_groq_quota(self):
        response = Mock(ok=False, status_code=400)
        response.json.return_value = {
            "error": {
                "status": "INVALID_ARGUMENT",
                "message": "functionDeclarations parametersJsonSchema known_query properties should be non-empty PRIVATE_SECRET",
            }
        }
        with patch.dict(
            os.environ, {"AI_OFFLINE": "0", "AI_AGENT_GROQ_FALLBACK": "0"}
        ), patch("services.llm_service.GEMINI_API_KEY", "PRIVATE_API_KEY"), patch(
            "services.llm_service.GROQ_API_KEY", "fixture-groq"
        ), patch(
            "services.agent_provider.requests.post", return_value=response
        ) as post, self.assertLogs(
            "ai-native-provider", level="WARNING"
        ) as logs:
            provider = NativeAgentProvider(legacy_policy=True)
            p = self.pipeline(provider=provider)
            with self.assertRaises(AnalysisError) as caught:
                p.propose(AiTextToReportRequest(prompt="fixture"))
        self.assertEqual(post.call_count, 1)
        self.assertEqual(caught.exception.category, "provider_schema_invalid")
        self.assertEqual(p.calls[0]["provider"], "gemini")
        self.assertEqual(p.calls[0]["error_reason"], "tool_object_properties")
        self.assertEqual(p.calls[0]["provider_error_status"], "INVALID_ARGUMENT")
        self.assertIn("known_query", p.calls[0]["schema_keywords"])
        self.assertNotIn("PRIVATE_SECRET", json.dumps(p.calls) + str(logs.output))
        self.assertNotIn("PRIVATE_API_KEY", json.dumps(p.calls) + str(logs.output))
        p.executor.assert_not_called()

    def test_gemini_400_api_key_error_is_authentication_not_schema(self):
        response = Mock(status_code=400)
        response.json.return_value = {
            "error": {
                "status": "INVALID_ARGUMENT",
                "message": "PRIVATE_MESSAGE",
                "details": [
                    {"reason": "API_KEY_INVALID", "metadata": {"secret": "PRIVATE_KEY"}}
                ],
            }
        }
        failure = http_failure(response)
        self.assertEqual(failure["error_category"], "provider_auth")
        self.assertEqual(failure["error_reason"], "api_key_invalid")
        self.assertNotIn("PRIVATE", json.dumps(failure))

    def test_gemini_compat_array_error_preserves_category_without_prose(self):
        response = Mock(status_code=400)
        response.json.return_value = [
            {
                "error": {
                    "status": "INVALID_ARGUMENT",
                    "message": "PRIVATE_PROVIDER_TEXT",
                    "details": [{"reason": "API_KEY_INVALID"}],
                }
            }
        ]
        failure = http_failure(response)
        self.assertEqual(failure["error_category"], "provider_auth")
        self.assertEqual(failure["provider_error_status"], "INVALID_ARGUMENT")
        self.assertNotIn("PRIVATE_PROVIDER_TEXT", json.dumps(failure))

    def test_provider_error_body_with_unexpected_types_stays_private(self):
        response = Mock(status_code=400)
        response.json.return_value = {
            "error": {
                "status": {"secret": "PRIVATE"},
                "message": ["PRIVATE"],
                "details": [{"reason": ["PRIVATE"]}, "PRIVATE"],
            }
        }
        self.assertEqual(
            http_failure(response),
            {
                "http_status": 400,
                "error_category": "provider_bad_request",
            },
        )

    def test_configured_gemini_order_daily_quota_recovery_and_pinning(self):
        quota = Mock(ok=False, status_code=429)
        quota.json.return_value = {
            "error": {
                "details": [
                    {
                        "violations": [
                            {
                                "quotaId": "RequestsPerModelPerDay",
                                "quotaMetric": "requests",
                                "quotaValue": "20",
                            }
                        ]
                    }
                ]
            }
        }
        missing = Mock(ok=False, status_code=404)
        working = Mock(ok=True)
        working.json.return_value = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "functionCall": {
                                    "name": "search_semantic_catalog",
                                    "args": {"query": "orders"},
                                }
                            }
                        ]
                    }
                }
            ]
        }
        models = (
            "gemini-3.5-flash-lite",
            "gemini-3.1-flash-lite",
            "gemini-3.8-flash",
            "never",
        )
        with patch.dict(
            os.environ, {"AI_OFFLINE": "0", "AI_AGENT_GROQ_FALLBACK": "0"}
        ), patch("services.llm_service.GEMINI_API_KEY", "fixture"), patch(
            "services.llm_service.GEMINI_MODELS", models
        ), patch(
            "services.agent_provider.requests.post",
            side_effect=[quota, missing, working, quota],
        ) as post:
            provider = NativeAgentProvider(legacy_policy=True)
            kwargs = {
                "system": SYSTEM,
                "messages": [{"role": "user", "content": "fixture"}],
                "tools": [],
            }
            first = provider(**kwargs)
            second = provider(**kwargs)
        self.assertEqual([a["model"] for a in first["attempts"]], list(models[:3]))
        self.assertEqual(first["attempts"][-1]["status"], "success")
        self.assertEqual(provider.gemini_model, models[2])
        self.assertEqual([a["model"] for a in second["attempts"]], [models[2]])
        self.assertIsNone(second["calls"])
        self.assertEqual(post.call_count, 4)

    def test_gemini_missing_model_tries_one_configured_alternative_and_pins_it(self):
        missing = Mock(ok=False, status_code=404)
        working = Mock(ok=True)
        working.json.return_value = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "functionCall": {
                                    "name": "search_semantic_catalog",
                                    "args": {"query": "orders"},
                                }
                            }
                        ]
                    }
                }
            ]
        }
        provider = NativeAgentProvider(legacy_policy=True)
        kwargs = {
            "system": SYSTEM,
            "messages": [{"role": "user", "content": "fixture"}],
            "tools": [],
        }
        with patch.dict(os.environ, {"AI_OFFLINE": "0"}), patch(
            "services.llm_service.GEMINI_API_KEY", "fixture"
        ), patch("services.llm_service.GROQ_API_KEY", "fixture"), patch(
            "services.llm_service.GEMINI_MODELS",
            ("missing-model", "available-model", "never-model"),
        ), patch(
            "services.agent_provider.requests.post",
            side_effect=[missing, working, working],
        ) as post:
            first = provider(**kwargs)
            second = provider(**kwargs)
        self.assertEqual(
            [a["model"] for a in first["attempts"]],
            ["missing-model", "available-model"],
        )
        self.assertEqual([a["model"] for a in second["attempts"]], ["available-model"])
        self.assertEqual(post.call_count, 3)
        self.assertEqual(provider.gemini_model, "available-model")
        self.assertFalse(provider.primary_failed)

    def test_gemini_compat_endpoint_auth_and_exact_signed_continuation(self):
        original = {
            "id": "compat1",
            "type": "function",
            "function": {
                "name": "search_semantic_catalog",
                "arguments": '{ "query": "orders" }',
            },
            "extra_content": {
                "google": {
                    "thought_signature": "OPAQUE_PRIVATE",
                    "thought": "PRIVATE_THOUGHT",
                },
                "secret": "PRIVATE_EXTRA",
            },
        }
        response = Mock(ok=True)
        response.json.return_value = {
            "choices": [
                {"message": {"tool_calls": [original], "reasoning": "PRIVATE_THOUGHT"}}
            ],
            "usage": {"prompt_tokens": 12, "completion_tokens": 3},
        }
        tools = [
            {
                "name": "search_semantic_catalog",
                "description": "Search",
                "parameters": TOOL_MODELS["search_semantic_catalog"][
                    0
                ].model_json_schema(),
            }
        ]
        messages = [{"role": "user", "content": "fixture"}]
        with patch.dict(
            os.environ,
            {
                "AI_OFFLINE": "0",
                "GEMINI_API_STYLE": "openai",
                "AI_AGENT_GROQ_FALLBACK": "0",
            },
        ), patch("services.llm_service.GEMINI_API_KEY", " fixture-key "), patch(
            "services.llm_service.GEMINI_MODELS", ("gemini-3.6-flash",)
        ), patch(
            "services.agent_provider.requests.post", return_value=response
        ) as post:
            provider = NativeAgentProvider(legacy_policy=True)
            first = provider(system=SYSTEM, messages=messages, tools=tools)
            messages += [
                {"role": "assistant", "calls": first["calls"]},
                {
                    "role": "tool",
                    "id": "compat1",
                    "name": "search_semantic_catalog",
                    "result": {"matches": []},
                },
            ]
            provider(system=SYSTEM, messages=messages, tools=tools)
        url, kwargs = post.call_args.args[0], post.call_args.kwargs
        self.assertEqual(
            url,
            "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        )
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer fixture-key")
        self.assertNotIn("params", kwargs)
        body = kwargs["json"]
        self.assertEqual(body["model"], "gemini-3.6-flash")
        self.assertEqual(body["tool_choice"], "required")
        self.assertNotIn("response_format", body)
        self.assertEqual(body["messages"][0]["role"], "system")
        saved = body["messages"][2]["tool_calls"][0]
        self.assertEqual(saved["function"], original["function"])
        self.assertEqual(
            saved["extra_content"], {"google": {"thought_signature": "OPAQUE_PRIVATE"}}
        )
        self.assertEqual(body["messages"][3]["tool_call_id"], saved["id"])
        self.assertNotIn("PRIVATE_THOUGHT", json.dumps(body))
        self.assertNotIn("PRIVATE_EXTRA", json.dumps(body))
        self.assertNotIn("OPAQUE_PRIVATE", json.dumps(first))
        self.assertNotIn(
            "OPAQUE_PRIVATE", json.dumps(provider._groq_messages(SYSTEM, messages))
        )
        self.assertEqual(first["attempts"][0]["tokens"], {"input": 12, "output": 3})
        self.assertEqual(first["attempts"][0]["api_style"], "openai")
        provider.reset()
        self.assertFalse(provider.gemini_compat_calls)

    def test_gemini_compat_failure_has_one_attempt_when_groq_disabled(self):
        bad = Mock(ok=False, status_code=400)
        bad.json.return_value = {
            "error": {
                "status": "INVALID_ARGUMENT",
                "message": "private arbitrary provider error",
            }
        }
        with patch.dict(
            os.environ,
            {
                "AI_OFFLINE": "0",
                "GEMINI_API_STYLE": "openai",
                "AI_AGENT_GROQ_FALLBACK": "0",
            },
        ), patch("services.llm_service.GEMINI_API_KEY", "fixture"), patch(
            "services.llm_service.GROQ_API_KEY", "fixture"
        ), patch(
            "services.agent_provider.requests.post", return_value=bad
        ) as post:
            provider = NativeAgentProvider(legacy_policy=True)
            answer = provider(
                system=SYSTEM,
                messages=[{"role": "user", "content": "fixture"}],
                tools=[],
            )
        self.assertIsNone(answer["calls"])
        self.assertEqual(post.call_count, 1)
        self.assertEqual(
            answer["attempts"][0]["error_category"], "provider_bad_request"
        )
        self.assertNotIn("private arbitrary", json.dumps(answer))
        self.assertFalse(provider.gemini_compat_calls)

    def test_gemini_compat_pipeline_grounding_execution_and_private_signatures(self):
        rounds = [
            [
                call(
                    "describe_semantic_concept",
                    {"kind": "subject", "id": "products"},
                    "describe",
                )
            ],
            [
                call("run_analysis", ranking_query(), "query"),
                call("finish_analysis", {"active_query_ids": ["main"]}, "finish"),
            ],
        ]
        responses = []
        for calls in rounds:
            response = Mock(ok=True)
            response.json.return_value = {
                "choices": [
                    {
                        "message": {
                            "tool_calls": [
                                {
                                    "id": c["id"],
                                    "type": "function",
                                    "function": {
                                        "name": c["name"],
                                        "arguments": json.dumps(c["arguments"]),
                                    },
                                    "extra_content": {
                                        "google": {
                                            "thought_signature": "PRIVATE_SIGNATURE"
                                        }
                                    },
                                }
                                for c in calls
                            ]
                        }
                    }
                ],
                "usage": {"prompt_tokens": 60, "completion_tokens": 10},
            }
            responses.append(response)
        with patch.dict(
            os.environ,
            {
                "AI_OFFLINE": "0",
                "GEMINI_API_STYLE": "openai",
                "AI_AGENT_GROQ_FALLBACK": "0",
            },
        ), patch("services.llm_service.GEMINI_API_KEY", "fixture"), patch(
            "services.llm_service.GEMINI_MODELS", ("gemini-3.6-flash",)
        ), patch(
            "services.agent_provider.requests.post", side_effect=responses
        ) as post:
            p = self.pipeline(provider=NativeAgentProvider(legacy_policy=True))
            report = p.generate(
                AiTextToReportRequest(prompt="fixture", reference_date=REFERENCE)
            )
        self.assertEqual(report["status"], "success")
        self.assertTrue(report["charts"])
        p.executor.assert_called_once()
        self.assertEqual(post.call_count, 2)
        self.assertNotIn("PRIVATE_SIGNATURE", json.dumps(report, default=str))
        self.assertEqual(report["diagnostics"]["agent_rounds"], 2)
        self.assertTrue(
            all(
                a["api_style"] == "openai"
                for a in report["diagnostics"]["provider_calls"]
            )
        )
        last = post.call_args.kwargs["json"]
        self.assertEqual(len(last["tools"]), 6)
        self.assertEqual(
            last["messages"][2]["tool_calls"][0]["extra_content"]["google"][
                "thought_signature"
            ],
            "PRIVATE_SIGNATURE",
        )

    def test_native_provider_gemini_signature_and_groq_fallback(self):
        signed = {
            "functionCall": {
                "id": "call1",
                "name": "search_semantic_catalog",
                "args": {"query": "orders"},
            },
            "thoughtSignature": "opaque-fixture",
        }
        response = Mock(ok=True)
        response.json.return_value = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"thought": True, "text": "NEVER_STORE_THOUGHT"},
                            signed,
                        ]
                    }
                }
            ],
            "usageMetadata": {"promptTokenCount": 12, "candidatesTokenCount": 3},
        }
        provider = NativeAgentProvider(legacy_policy=True)
        messages = [{"role": "user", "content": "fixture"}]
        tools = [
            {
                "name": "search_semantic_catalog",
                "description": "Search",
                "parameters": {
                    "type": "object",
                    "properties": {"query": {"type": "string"}},
                    "required": ["query"],
                },
            }
        ]
        with patch.dict(os.environ, {"AI_OFFLINE": "0"}), patch(
            "services.llm_service.GEMINI_API_KEY", "fixture"
        ), patch("services.llm_service.GROQ_API_KEY", "fixture"), patch(
            "services.agent_provider.requests.post", return_value=response
        ):
            answer = provider(system=SYSTEM, messages=messages, tools=tools)
        self.assertEqual(answer["attempts"][0]["tokens"], {"input": 12, "output": 3})
        self.assertNotIn("opaque-fixture", json.dumps(answer))
        messages += [
            {"role": "assistant", "calls": answer["calls"]},
            {
                "role": "tool",
                "id": "call1",
                "name": "search_semantic_catalog",
                "result": {"matches": []},
            },
        ]
        body = provider._gemini_body(SYSTEM, messages, tools)
        self.assertEqual(body["contents"][1]["parts"][0], signed)
        self.assertNotIn("NEVER_STORE_THOUGHT", json.dumps(body))
        self.assertEqual(
            body["contents"][-1]["parts"][0]["functionResponse"]["id"], "call1"
        )
        bad = Mock(ok=False, status_code=500)
        good = Mock(ok=True)
        good.json.return_value = {
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {
                                "id": "g1",
                                "function": {
                                    "name": "search_semantic_catalog",
                                    "arguments": '{"query":"orders"}',
                                },
                            }
                        ]
                    }
                }
            ],
            "usage": {},
        }
        with patch.dict(os.environ, {"AI_OFFLINE": "0"}), patch(
            "services.llm_service.GEMINI_API_KEY", "fixture"
        ), patch("services.llm_service.GROQ_API_KEY", "fixture"), patch(
            "services.agent_provider.requests.post", side_effect=[bad, good]
        ) as post:
            answer = NativeAgentProvider(legacy_policy=True)(
                system=SYSTEM,
                messages=[{"role": "user", "content": "fixture"}],
                tools=tools,
            )
        self.assertEqual(post.call_count, 2)
        self.assertEqual(answer["attempts"][-1]["provider"], "groq")
        self.assertIsNone(answer["attempts"][-1]["tokens"]["input"])

    def test_gemini_503_retries_same_signed_continuation_once(self):
        for style in ("native", "openai"):
            with self.subTest(style=style):
                raw = {
                    "id": "signed",
                    "type": "function",
                    "function": {
                        "name": "search_semantic_catalog",
                        "arguments": '{"query":"orders"}',
                    },
                    "extra_content": {"google": {"thought_signature": "OPAQUE"}},
                }
                good = Mock(ok=True)
                good.json.return_value = {
                    "candidates": [
                        {
                            "content": {
                                "parts": [
                                    {
                                        "functionCall": {
                                            "id": "signed",
                                            "name": "search_semantic_catalog",
                                            "args": {"query": "orders"},
                                        },
                                        "thoughtSignature": "OPAQUE",
                                    }
                                ]
                            }
                        }
                    ],
                    "choices": [{"message": {"tool_calls": [raw]}}],
                    "usage": {},
                    "usageMetadata": {},
                }
                bad = Mock(ok=False, status_code=503)
                bad.json.return_value = {"error": {"status": "UNAVAILABLE"}}
                messages = [{"role": "user", "content": "fixture"}]
                with patch.dict(
                    os.environ,
                    {
                        "AI_OFFLINE": "0",
                        "GEMINI_API_STYLE": style,
                        "AI_AGENT_GROQ_FALLBACK": "0",
                    },
                ), patch("services.llm_service.GEMINI_API_KEY", "fixture"), patch(
                    "services.llm_service.GEMINI_MODELS", ("working",)
                ), patch(
                    "services.agent_provider.requests.post",
                    side_effect=[good, bad, good],
                ) as post, patch(
                    "services.agent_provider.time.sleep"
                ) as pause:
                    provider = NativeAgentProvider(legacy_policy=True)
                    first = provider(system=SYSTEM, messages=messages, tools=[])
                    messages += [
                        {"role": "assistant", "calls": first["calls"]},
                        {
                            "role": "tool",
                            "id": "signed",
                            "name": "search_semantic_catalog",
                            "result": {"matches": []},
                        },
                    ]
                    second = provider(system=SYSTEM, messages=messages, tools=[])
                self.assertEqual(post.call_count, 3)
                self.assertEqual(
                    [a["status"] for a in second["attempts"]], ["failed", "success"]
                )
                self.assertEqual(second["attempts"][0]["http_status"], 503)
                self.assertTrue(
                    all(a["provider"] == "gemini" for a in second["attempts"])
                )
                self.assertEqual(provider.gemini_model, "working")
                self.assertFalse(provider.primary_failed)
                self.assertEqual(post.call_args_list[1], post.call_args_list[2])
                payload = post.call_args_list[2].kwargs["json"]
                self.assertIn("OPAQUE", json.dumps(payload))
                self.assertNotIn("OPAQUE", json.dumps(second))
                pause.assert_called_once_with(0.5)

    def test_gemini_recovery_is_bounded_and_does_not_retry_auth_quota_schema(self):
        for status, expected in ((503, 2), (400, 1), (401, 1), (429, 1), (500, 1)):
            with self.subTest(status=status), patch.dict(
                os.environ,
                {
                    "AI_OFFLINE": "0",
                    "GEMINI_API_STYLE": "openai",
                    "AI_AGENT_GROQ_FALLBACK": "0",
                },
            ), patch("services.llm_service.GEMINI_API_KEY", "fixture"), patch(
                "services.llm_service.GEMINI_MODELS", ("working",)
            ), patch(
                "services.agent_provider.time.sleep"
            ), patch(
                "services.agent_provider.requests.post",
                return_value=Mock(ok=False, status_code=status),
            ) as post:
                response = NativeAgentProvider(legacy_policy=True)(
                    system=SYSTEM,
                    messages=[{"role": "user", "content": "fixture"}],
                    tools=[],
                )
                self.assertIsNone(response["calls"])
                self.assertEqual(post.call_count, expected)
                self.assertEqual(len(response["attempts"]), expected)

    def test_supporting_budget_preserves_requested_operation(self):
        requested = ranking_query()
        support = ranking_query(
            id="support",
            operation="aggregate",
            ranking=None,
            group_by=[],
            role="supporting",
            parent_id="main",
        )
        p = self.pipeline(
            query_script([requested, support]),
            budget=AgentBudget(operations=1, db_queries=1),
        )
        r = p.generate(AiTextToReportRequest(prompt="fixture"))
        p.executor.assert_called_once()
        self.assertEqual(set(r["result_sets"]), {"main"})
        self.assertTrue(r["data_warnings"])
        self.assertEqual(r["completion_status"], "partial")

    def test_secondary_metric_cannot_inherit_ranking_leader_claim(self):
        a, _ = fixture_artifact(
            ranking_query(metrics=["quantity_sold", "product_revenue"])
        )
        a.result["rows"][0]["product_revenue"] = 1
        a.result["rows"][1]["product_revenue"] = 1000
        features = analytical_features({"main": a})
        self.assertFalse(
            any(
                e["metric"] == "product_revenue" and e["feature"] == "leader"
                for e in features
            )
        )
        self.assertTrue(
            any(
                e["metric"] == "product_revenue" and e["feature"] == "selected_total"
                for e in features
            )
        )

    def test_metric_populations_require_separate_operations(self):
        p = self.pipeline(
            query_script(
                [query("orders", "revenue", metrics=["revenue", "order_count"])]
            )
        )
        with self.assertRaises(AnalysisError) as caught:
            p.generate(AiTextToReportRequest(prompt="fixture"))
        self.assertEqual(caught.exception.category, "provider_unavailable")
        self.assertEqual(p.semantic_info["last_contract_rejection"]["issues"][0]["code"], "incompatible_metric_population")
        self.assertEqual(p.semantic_info["agent_contract_status"], "invalid")
        p.executor.assert_not_called()

    def test_evidence_ids_stable_across_projection_and_combined_report(self):
        a, _ = fixture_artifact(ranking_query(id="one"))
        b, _ = fixture_artifact(ranking_query(id="two"))
        alone = {e["id"] for e in analytical_features({"two": b})}
        combined = {
            e["id"]
            for e in analytical_features({"one": a, "two": b})
            if e["scope_ref"] == "two"
        }
        self.assertEqual(alone, combined)

    def test_numeric_order_and_explicit_detail_limit_reach_sql(self):
        a, c = fixture_artifact(
            query("delivery", "total_deliveries", group_by=["driver_id"])
        )
        service = AnalyticalQueries(
            c,
            SemanticTools(c, None),
            REFERENCE,
            None,
            {"db_query_count": 0, "analytical_cache_hits": 0},
            proposal=True,
        )
        q = query(
            "delivery",
            "total_deliveries",
            group_by=["driver_id"],
            order_by=[{"field": "total_deliveries", "direction": "DESC"}],
            limit=3,
        )
        ordered = service.prepare(q)
        self.assertIn('ORDER BY "total_deliveries" DESC NULLS LAST', ordered.sql)
        self.assertTrue(ordered.sql.endswith("LIMIT 3"))
        self.assertFalse(
            validate_results(a.result, ordered.plan, ordered.grounded, c).valid
        )
        detailed = service.prepare(
            {
                "id": "details",
                "subject": "orders",
                "operation": "detail",
                "project": ["order_id"],
                "limit": 5,
            }
        )
        self.assertTrue(detailed.sql.endswith("LIMIT 5"))

    def test_compare_views_reference_only_disjoint_validated_scalar_results(self):
        a, _ = fixture_artifact(
            query(
                "orders",
                "revenue",
                id="hn",
                filters=[{"dimension": "city", "value": "Hà Nội"}],
            )
        )
        b, _ = fixture_artifact(
            query(
                "orders",
                "revenue",
                id="hcm",
                filters=[{"dimension": "city", "value": "Hồ Chí Minh"}],
            )
        )
        d = build_dashboard(
            {"hn": a, "hcm": b}, analytical_features({"hn": a, "hcm": b})
        )
        self.assertEqual(len(d["charts"]), 1)
        self.assertEqual(d["charts"][0]["scope_refs"], ["hn", "hcm"])
        b.query.filters = a.query.filters
        self.assertFalse(build_dashboard({"hn": a, "hcm": b}, [])["charts"])

    def test_refinement_failure_keeps_prior_validated_results(self):
        p = self.pipeline()
        r = p.generate(AiTextToReportRequest(prompt="fixture"))
        p.provider = ScriptedProvider(None)
        refined = p.refine(
            AiReportRefineRequest(
                current_report=r, feedback="fixture", session_id=r["session_id"]
            )
        )
        p.executor.assert_called_once()
        self.assertEqual(
            refined["result_sets"]["main"]["rows"], r["result_sets"]["main"]["rows"]
        )
        self.assertEqual(refined["completion_status"], "partial")
        self.assertTrue(refined["data_warnings"])

    def test_schema_safe_value_changes_invalidate_cache(self):
        physical = physical_metadata()
        table = physical["table_map"]["silver.chi_nhanh"]
        column = next(c for c in table["columns"] if c["name"] == "thanh_pho")
        column["safe_values"] = ["Hà Nội"]
        self.assertNotEqual(
            self.catalog.fingerprint, AnalysisCatalog(physical).fingerprint
        )

    def test_large_result_projection_is_bounded(self):
        a, _ = fixture_artifact(query("orders", "revenue", "trend"))
        from datetime import timedelta

        a.result = result(
            [
                {
                    "period": (date(2026, 1, 1) + timedelta(days=i)).isoformat(),
                    "revenue": i,
                }
                for i in range(100)
            ]
        )
        agent = DataAnalystAgent(
            self.catalog,
            ScriptedProvider(),
            None,
            None,
            REFERENCE,
            {},
            budget=AgentBudget(tool_result_chars=2500, preview_rows=4),
            legacy_mode=True,
        )
        projection = agent.projection(a)
        self.assertLessEqual(
            len(json.dumps(projection, ensure_ascii=False, separators=(",", ":"))), 2500
        )
        self.assertLessEqual(len(projection["preview"]), 4)
        self.assertNotIn("rows", projection)

    def test_describe_pagination_projects_only_business_fields(self):
        tools = SemanticTools(self.catalog, None)
        first = tools.invoke(
            "describe_semantic_concept",
            {"kind": "metric", "id": "quantity_sold", "limit": 2},
        )
        second = tools.invoke(
            "describe_semantic_concept",
            {"kind": "metric", "id": "quantity_sold", "offset": 2, "limit": 2},
        )
        self.assertEqual(len(first["dimensions"]), 2)
        self.assertEqual(first["pages"]["dimensions"]["next_offset"], 2)
        self.assertNotEqual(first["dimensions"], second["dimensions"])
        self.assertNotIn("silver.", json.dumps(first))

    def test_null_distribution_never_establishes_complete_shares(self):
        a, _ = fixture_artifact(
            query("orders", "order_count", "distribution", group_by=["payment_method"])
        )
        a.result["rows"][0]["order_count"] = None
        self.assertFalse(analytical_features({"main": a}))

    def test_catalog_extension_requires_no_language_route(self):
        physical = physical_metadata()
        overlay = deepcopy(self.catalog.overlay)
        physical["table_map"]["silver.energy"] = {
            "qualified_name": "silver.energy",
            "columns": [
                {"name": "region", "data_type": "text"},
                {"name": "reading", "data_type": "numeric"},
            ],
            "primary_key": [],
            "relationships": [],
        }
        r = overlay["analysis_registry"]
        overlay["silver_tables"]["silver.energy"] = {"primary_key": [], "joins": []}
        r["subjects"]["energy"] = {
            "business_name": "Năng lượng",
            "aliases": ["energy"],
            "source": "silver.energy",
            "grain": "reading",
            "metrics": ["energy_total"],
            "default_dimension": "region",
            "detail_columns": ["region"],
        }
        r["metrics"]["energy_total"] = {
            "business_name": "Tổng năng lượng",
            "expression": "SUM(silver.energy.reading)",
            "source": "silver.energy",
            "grain": "reading",
            "unit": "kWh",
            "subjects": ["energy"],
            "business_filters": [],
            "additive": True,
            "non_negative": True,
        }
        r["dimensions"]["region"] = {
            "table": "silver.energy",
            "column": "region",
            "business_name": "Vùng",
            "aliases": ["region"],
        }
        catalog = AnalysisCatalog(physical, overlay)
        q = query("energy", "energy_total", group_by=["region"])
        executor = Mock(return_value=result([{"region": "A", "energy_total": 100}]))
        agent = DataAnalystAgent(
            catalog, query_script([q]), executor, None, REFERENCE, {}, legacy_mode=True
        )
        artifacts, plan = agent.run("unseen words")
        self.assertEqual(
            artifacts["main"].grounded.metrics["energy_total"]["unit"], "kWh"
        )
        executor.assert_called_once()


# Named matrix cases cover the full actual metric registry in independent domains.
REGISTRY = AnalysisCatalog(physical_metadata()).registry
for metric, meta in REGISTRY["metrics"].items():
    subject = meta["subjects"][0]
    for operation in ("aggregate", "ranking", "distribution"):

        def case(self, metric=metric, subject=subject, operation=operation):
            dims = (
                [self.catalog.registry["subjects"][subject]["default_dimension"]]
                if operation != "aggregate"
                else []
            )
            q = query(subject, metric, operation, group_by=dims)
            if operation == "ranking":
                q["ranking"] = {"metric": metric, "top_n": 3}
            a, catalog = fixture_artifact(q)
            p = self.pipeline(query_script([q]), executor=Mock(return_value=a.result))
            r = p.generate(
                AiTextToReportRequest(
                    prompt=f"offline structure {metric} {operation}",
                    reference_date=REFERENCE,
                )
            )
            self.assertEqual(r["status"], "success")
            self.assertTrue(all(v["valid"] for v in r["result_contracts"].values()))
            self.assertEqual(r["diagnostics"]["db_query_count"], 1)
            self.assertEqual(r["diagnostics"]["provider_call_count"], 0)
            self.assertEqual(r["diagnostics"]["embedding_call_count"], 0)

        setattr(AgentTests, f"test_matrix_{subject}_{metric}_{operation}", case)

ADVERSARIES = [
    {"sql": "SELECT 1"},
    {"subject": "silver.don_hang"},
    {"metrics": ["SELECT pg_sleep(1)"]},
    {"metrics": ["profit"]},
    {"group_by": ["email"]},
    {"filters": [{"dimension": "city", "operator": "or", "value": "Hà Nội"}]},
    {"filters": [{"dimension": "city", "value": "Invented"}]},
    {"filters": [{"dimension": "phone", "value": "123"}]},
    {"limit": -1},
    {"limit": 10001},
    {"join": "silver.san_pham"},
    {"metric_formula": "SUM(1)"},
    {"time": {"kind": "day", "day": 31, "month": 2, "year": 2026}},
    {"order_by": [{"field": "email", "direction": "DESC"}]},
    {"id": "x; DROP TABLE"},
]
for index, updates in enumerate(ADVERSARIES):

    def case(self, updates=updates):
        q = ranking_query()
        q.update(updates)
        p = self.pipeline(query_script([q]))
        with self.assertRaises(AnalysisError):
            p.generate(AiTextToReportRequest(prompt="malicious fixture"))
        p.executor.assert_not_called()

    setattr(AgentTests, f"test_adversary_{index:02d}", case)


if __name__ == "__main__":
    unittest.main()
