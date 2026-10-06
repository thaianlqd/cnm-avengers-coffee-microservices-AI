"""Offline native agent, algebra, dashboard, evidence and transport coverage."""

import json
import os
import unittest
from copy import deepcopy
from datetime import date
from unittest.mock import Mock, patch
from common import AiTextToReportRequest, AiReportRefineRequest
from services.analysis_pipeline import AnalysisPipeline, safe_failure
from services.analysis_catalog import AnalysisCatalog, AnalysisError
from services.data_analyst_agent import DataAnalystAgent, AgentBudget, SYSTEM
from services.semantic_tools import SemanticTools
from services.analytical_query_service import AnalyticalQueries, signature
from services.analyst_contract import AnalyticalQuery, DashboardPlan
from services.analysis_query import validate_sql, validate_results
from services.insight_service import analytical_features, grounded_narrative
from services.dashboard_planner_service import build_dashboard, chart_reason
from services.agent_provider import NativeAgentProvider
from services.session_service import get_session
from tests.analysis_fixtures import physical_metadata, ranked_rows, result
from tests.agent_fixtures import ScriptedProvider, call, query_script, ranking_query


REFERENCE = date(2026, 10, 6)


def query(subject, metric, operation="aggregate", **updates):
    q = {"id": "main", "subject": subject, "operation": operation, "metrics": [metric]}
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
    for i in range(n):
        row = {}
        for d in a.plan.dimensions:
            f = next(
                (f for f in a.plan.filters if f.dimension == d and f.operator == "eq"),
                None,
            )
            row[d] = (
                f.value if f else str(i + 1) if d.endswith("_id") else f"Nhóm {i+1}"
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
            row["period"] = (
                start + timedelta(days=i * 7 if a.plan.granularity == "week" else i)
            ).isoformat()
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
        for name in ("requests.sessions.Session.request", "psycopg2.connect"):
            guard = patch(
                name, side_effect=AssertionError("OFFLINE: external calls forbidden")
            )
            guard.start()
            self.addCleanup(guard.stop)
        self.catalog = AnalysisCatalog(physical_metadata())

    def pipeline(self, provider=None, executor=None, **kw):
        return AnalysisPipeline(
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
        with self.assertRaises(AnalysisError):
            p.propose(AiTextToReportRequest(prompt="fixture"))
        self.assertEqual(p.semantic_info["semantic_cache_hits"], 2)
        p.executor.assert_not_called()

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

    def test_distribution_defaults_use_bar_for_average_or_many_categories(self):
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
        self.assertEqual(
            build_dashboard({"main": complete}, [])["charts"][0]["chart_type"], "bar"
        )
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
        self.assertFalse(build_dashboard({"main": a}, [], plan)["charts"])

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
        provider = NativeAgentProvider()
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
        bad = Mock(ok=False, status_code=503)
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
            answer = NativeAgentProvider()(
                system=SYSTEM,
                messages=[{"role": "user", "content": "fixture"}],
                tools=tools,
            )
        self.assertEqual(post.call_count, 2)
        self.assertEqual(answer["attempts"][-1]["provider"], "groq")
        self.assertIsNone(answer["attempts"][-1]["tokens"]["input"])

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
        self.assertEqual(caught.exception.category, "metric_scope")
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
            catalog, query_script([q]), executor, None, REFERENCE, {}
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
