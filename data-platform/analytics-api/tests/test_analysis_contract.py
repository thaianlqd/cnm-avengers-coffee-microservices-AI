import os
import json
import unittest
from copy import deepcopy
from datetime import date, timedelta
from unittest.mock import Mock, patch
from common import AiTextToReportRequest, AiReportRefineRequest, AiFeedbackRequest
from services.analysis_contract import AnalysisSpec, SpecPatch, TimeScope
from services.analysis_catalog import AnalysisCatalog, AnalysisError, resolve_period
from services.analysis_understanding import understand, merge_patch, refine_spec, hints
from services.analysis_query import (
    build_plans,
    compile_sql,
    validate_plan,
    validate_sql,
    validate_results,
)
from services.analysis_presentation import choose_visualizations, validate_chart
from services.analysis_pipeline import safe_failure
from tests.archive_planner import ArchivedGraphPipeline as AnalysisPipeline
from services.session_service import (
    get_session,
    create_session,
    _timestamps,
    SESSION_TTL_SECONDS,
)
from services.vector_rag_service import vector_rag_service
from services.verified_analysis_service import retrieve_verified
from tests.analysis_fixtures import physical_metadata, ranking_spec, ranked_rows, result
from tests.agent_fixtures import query_script, ScriptedProvider, call, ranking_query


class OfflineTests(unittest.TestCase):
    def setUp(self):
        self.network = patch(
            "requests.sessions.Session.request",
            side_effect=AssertionError("OFFLINE: network forbidden"),
        )
        self.network.start()
        self.addCleanup(self.network.stop)
        self.db = patch(
            "psycopg2.connect",
            side_effect=AssertionError("OFFLINE: database forbidden"),
        )
        self.db.start()
        self.addCleanup(self.db.stop)
        self.catalog = AnalysisCatalog(physical_metadata())
        self.spec = AnalysisSpec.model_validate(ranking_spec())
        self.ground = self.catalog.ground(self.spec, today=date(2026, 10, 6))
        self.plan = build_plans(self.ground, self.catalog)[0]
        self.sql = compile_sql(self.plan, self.ground, self.catalog)

    def test_logical_spec_rejects_extra_sql_and_physical_names(self):
        for updates in (
            {"sql": "SELECT 1"},
            {"subject": "silver.san_pham"},
            {"ranking": {"metric": "quantity_sold", "top_n": 0}},
            {
                "time_range": {
                    "mode": "custom",
                    "start": "2026-10-31",
                    "end": "2026-10-01",
                }
            },
        ):
            with self.subTest(updates=updates), self.assertRaises(ValueError):
                AnalysisSpec.model_validate(ranking_spec(**updates))

    def test_calendar_periods_and_year_boundaries(self):
        cases = {
            "current_week": ("2026-10-05", "2026-10-11"),
            "previous_week": ("2026-09-28", "2026-10-04"),
            "current_month": ("2026-10-01", "2026-10-31"),
            "previous_month": ("2026-09-01", "2026-09-30"),
            "current_quarter": ("2026-10-01", "2026-12-31"),
            "previous_quarter": ("2026-07-01", "2026-09-30"),
            "current_year": ("2026-01-01", "2026-12-31"),
            "previous_year": ("2025-01-01", "2025-12-31"),
            "current_day": ("2026-10-06", "2026-10-06"),
            "previous_day": ("2026-10-05", "2026-10-05"),
        }
        for mode, bounds in cases.items():
            with self.subTest(mode=mode):
                p = resolve_period(TimeScope(mode=mode), date(2026, 10, 6))
                self.assertEqual((p["start"], p["end"]), bounds)
        self.assertEqual(
            resolve_period(TimeScope(mode="previous_quarter"), date(2026, 1, 1))[
                "start"
            ],
            "2025-10-01",
        )
        self.assertEqual(
            resolve_period(TimeScope(mode="previous_month"), date(2024, 3, 1))["end"],
            "2024-02-29",
        )
        self.assertIsNone(resolve_period(TimeScope(mode="all_time"))["start"])

    def test_simple_complete_request_uses_no_understanding_provider(self):
        provider = Mock(side_effect=AssertionError("provider unnecessary"))
        spec, info = understand(
            "Top 5 món bán chạy nhất tại Hà Nội tháng này", self.catalog, provider
        )
        self.assertEqual(spec.ranking.top_n, 5)
        self.assertEqual(spec.filters[0].value, "Hà Nội")
        self.assertEqual(spec.time_range.mode, "current_month")
        provider.assert_not_called()

    def test_complex_request_one_structured_call_and_separate_group_limits(self):
        raw = ranking_spec(
            analysis_kind="comparison",
            metrics=["quantity_sold", "product_revenue"],
            filters=[],
            time_range={"mode": "previous_quarter"},
            comparison_groups=[
                {
                    "name": "Hà Nội",
                    "filters": [{"dimension": "city", "value": "Hà Nội"}],
                    "top_n": 5,
                },
                {
                    "name": "Cần Thơ",
                    "filters": [{"dimension": "city", "value": "Cần Thơ"}],
                    "top_n": 3,
                },
            ],
        )
        fn = Mock(return_value=raw)
        spec, info = understand(
            "So sánh top 5 món ở Hà Nội với top 3 món ở Cần Thơ quý trước theo số lượng, kèm doanh thu",
            self.catalog,
            fn,
        )
        fn.assert_called_once()
        ground = self.catalog.ground(spec, date(2026, 10, 6))
        plans = build_plans(ground, self.catalog)
        self.assertEqual([p.ranking.top_n for p in plans], [5, 3])
        self.assertEqual(len(plans), 2)
        for p in plans:
            self.assertTrue(
                validate_sql(
                    compile_sql(p, ground, self.catalog), p, ground, self.catalog
                ).valid
            )
        self.assertEqual(plans[0].period, plans[1].period)

    def test_understanding_cannot_drop_explicit_groups_or_time(self):
        for raw in (
            ranking_spec(time_range={"mode": "all_time"}),
            ranking_spec(filters=[]),
            ranking_spec(ranking={"metric": "quantity_sold", "top_n": 10}),
        ):
            with self.subTest(raw=raw), self.assertRaises(AnalysisError):
                understand(
                    "Top 5 món tại Hà Nội tháng này và phân tích thêm",
                    self.catalog,
                    Mock(return_value=raw),
                )

    def test_best_branch_ambiguity_clarifies_from_registry(self):
        raw = {
            "analysis_kind": "ranking",
            "subject": "stores",
            "metrics": [],
            "ranking": {"metric": "store_revenue", "top_n": 1},
            "ambiguities": ["best metric undefined"],
            "confidence": 0.5,
        }
        with self.assertRaises(AnalysisError) as caught:
            understand(
                "Cho tôi chi nhánh tốt nhất", self.catalog, Mock(return_value=raw)
            )
        self.assertEqual(caught.exception.category, "metric_ambiguous")
        self.assertIn("store_revenue", [m["id"] for m in caught.exception.choices])

    def test_unknown_metric_column_enum_and_missing_join_rejected(self):
        with self.assertRaises(AnalysisError):
            self.catalog.ground(
                AnalysisSpec.model_validate(
                    ranking_spec(
                        metrics=["fake"], ranking={"metric": "fake", "top_n": 5}
                    )
                )
            )
        physical = physical_metadata()
        physical["table_map"]["silver.chi_tiet_don_hang"]["columns"] = [
            c
            for c in physical["table_map"]["silver.chi_tiet_don_hang"]["columns"]
            if c["name"] != "so_luong"
        ]
        with self.assertRaises(AnalysisError):
            AnalysisCatalog(physical).ground(self.spec)
        with self.assertRaises(AnalysisError):
            self.catalog.ground(
                AnalysisSpec.model_validate(
                    ranking_spec(
                        filters=[{"dimension": "city", "value": "ImaginaryCity"}]
                    )
                )
            )
        overlay = deepcopy(self.catalog.overlay)
        overlay["silver_tables"]["silver.chi_tiet_don_hang"]["joins"] = []
        cat = AnalysisCatalog(physical_metadata(), overlay)
        with self.assertRaises(AnalysisError):
            build_plans(cat.ground(self.spec), cat)

    def test_schema_fingerprint_stable_and_structural_changes_invalidate(self):
        physical = physical_metadata()
        physical["refreshed_at"] = "tomorrow"
        physical["table_map"]["silver.san_pham"]["estimated_rows"] = 999999
        self.assertEqual(
            self.catalog.fingerprint, AnalysisCatalog(physical).fingerprint
        )
        physical["table_map"]["silver.san_pham"]["columns"][0][
            "data_type"
        ] = "different"
        self.assertNotEqual(
            self.catalog.fingerprint, AnalysisCatalog(physical).fingerprint
        )
        overlay = deepcopy(self.catalog.overlay)
        overlay["analysis_registry"]["metrics"]["quantity_sold"]["unit"] = "kg"
        self.assertNotEqual(
            self.catalog.fingerprint,
            AnalysisCatalog(physical_metadata(), overlay).fingerprint,
        )

    def test_plan_drift_rejected(self):
        for update in (
            {"row_limit": 10},
            {"dimensions": []},
            {"filters": []},
            {"joins": []},
            {"period": {"mode": "all_time", "start": None}},
        ):
            with self.subTest(update=update):
                self.assertFalse(
                    validate_plan(
                        self.plan.model_copy(update=update), self.ground, self.catalog
                    ).valid
                )

    def test_sql_semantic_adversaries(self):
        replacements = [
            ("LIMIT 5", "LIMIT 10"),
            ("DESC NULLS LAST", "ASC NULLS LAST"),
            ("t2.thanh_pho = 'Hà Nội'", "TRUE"),
            ("t1.ngay_tao >= DATE '2026-10-01'", "TRUE"),
            ("SUM(t0.so_luong)", "COUNT(*)"),
            ("t0.ma_don_hang = t1.ma_don_hang", "t0.ma_san_pham = t1.ma_don_hang"),
            ("GROUP BY t3.ten_san_pham, t3.ma_san_pham", "GROUP BY t3.ten_san_pham"),
        ]
        self.assertTrue(
            validate_sql(self.sql, self.plan, self.ground, self.catalog).valid
        )
        for old, new in replacements:
            with self.subTest(old=old):
                self.assertIn(old, self.sql)
                self.assertFalse(
                    validate_sql(
                        self.sql.replace(old, new), self.plan, self.ground, self.catalog
                    ).valid
                )
        attacks = [
            self.sql.replace(
                "(t2.thanh_pho = 'Hà Nội')", "(t2.thanh_pho = 'Hà Nội' OR TRUE)"
            ),
            self.sql + "; DELETE FROM silver.don_hang",
            self.sql.replace("t2.thanh_pho", "t2.email"),
            self.sql.replace("silver.san_pham", "orders.san_pham"),
            self.sql.replace("SUM(t0.so_luong)", "pg_sleep(1)"),
            self.sql.replace('t3.ten_san_pham AS "product"', "t3.*"),
        ]
        for attack in attacks:
            self.assertFalse(
                validate_sql(attack, self.plan, self.ground, self.catalog).valid
            )

    def test_per_group_window_contract(self):
        s = AnalysisSpec.model_validate(
            ranking_spec(
                filters=[],
                dimensions=["product", "city"],
                ranking={
                    "metric": "quantity_sold",
                    "direction": "DESC",
                    "top_n": 2,
                    "per_group": ["city"],
                },
            )
        )
        g = self.catalog.ground(s)
        p = build_plans(g, self.catalog)[0]
        sql = compile_sql(p, g, self.catalog)
        self.assertTrue(
            validate_sql(sql, p, g, self.catalog).valid,
            validate_sql(sql, p, g, self.catalog).errors,
        )
        for attack in (
            sql.replace('PARTITION BY "city"', 'PARTITION BY "product"'),
            sql.replace("rank_position <= 2", "rank_position <= 9"),
        ):
            self.assertFalse(validate_sql(attack, p, g, self.catalog).valid)
        rows = [
            {**r, "city": city, "rank_position": i + 1}
            for city in ["Hà Nội", "Cần Thơ"]
            for i, r in enumerate(ranked_rows(2))
        ]
        self.assertTrue(validate_results(result(rows), p, g, self.catalog).valid)
        rows[1]["rank_position"] = 3
        self.assertFalse(validate_results(result(rows), p, g, self.catalog).valid)

    def test_result_contract_numeric_sort_cardinality_and_projection(self):
        self.assertTrue(
            validate_results(
                result(ranked_rows()), self.plan, self.ground, self.catalog
            ).valid
        )
        bad = [
            ranked_rows(6),
            list(reversed(ranked_rows())),
            [{**ranked_rows()[0], "quantity_sold": "999"}],
            [{**ranked_rows()[0], "quantity_sold": float("nan")}],
            [{**ranked_rows()[0], "quantity_sold": True}],
            [{**ranked_rows()[0], "email": "x"}],
            ranked_rows()[:1] * 2,
            [{**ranked_rows()[0], "quantity_sold": -1}],
        ]
        for rows in bad:
            with self.subTest(rows=rows):
                self.assertFalse(
                    validate_results(
                        result(rows), self.plan, self.ground, self.catalog
                    ).valid
                )
        self.assertFalse(
            validate_results(
                {**result(ranked_rows()), "truncated": True},
                self.plan,
                self.ground,
                self.catalog,
            ).valid
        )

    def test_charts_reuse_rows_and_reject_ranking_donut_or_wrong_scope(self):
        r = result(ranked_rows())
        visuals = choose_visualizations(self.plan, r, self.ground, self.catalog)
        self.assertEqual(len(visuals), 1)
        self.assertEqual(visuals[0].chart_type, "horizontal_bar")
        self.assertEqual(visuals[0].unit, "sản phẩm")
        self.assertFalse(
            validate_chart(
                visuals[0].model_copy(update={"scope_ref": "all_cities"}),
                self.plan,
                r,
                self.ground,
                self.catalog,
            ).valid
        )
        self.ground.analysis_spec.requested_visualizations = ["donut", "heatmap"]
        self.assertEqual(
            choose_visualizations(self.plan, r, self.ground, self.catalog), []
        )

    def test_detail_no_aggregation_and_pii_rejected(self):
        s = AnalysisSpec(
            analysis_kind="detail", subject="customers", detail_level="detail"
        )
        g = self.catalog.ground(s)
        p = build_plans(g, self.catalog)[0]
        sql = compile_sql(p, g, self.catalog)
        self.assertNotIn("GROUP BY", sql)
        self.assertNotIn("COUNT(", sql)
        self.assertNotIn("email", sql)
        self.assertTrue(validate_sql(sql, p, g, self.catalog).valid)
        with self.assertRaises(AnalysisError):
            self.catalog.ground(
                AnalysisSpec(
                    analysis_kind="detail",
                    subject="customers",
                    detail_columns=["email"],
                )
            )

    def test_trend_and_heatmap_shape(self):
        s = AnalysisSpec(
            analysis_kind="trend",
            subject="products",
            metrics=["quantity_sold"],
            dimensions=["category"],
            time_range={"mode": "current_month"},
        )
        g = self.catalog.ground(s, date(2026, 10, 6))
        p = build_plans(g, self.catalog)[0]
        sql = compile_sql(p, g, self.catalog)
        self.assertTrue(
            validate_sql(sql, p, g, self.catalog).valid,
            validate_sql(sql, p, g, self.catalog).errors,
        )
        rows = [
            {"period": "2026-10-01", "category": "A", "quantity_sold": 20},
            {"period": "2026-10-02", "category": "A", "quantity_sold": 30},
        ]
        self.assertTrue(validate_results(result(rows), p, g, self.catalog).valid)
        self.assertEqual(
            choose_visualizations(p, result(rows), g, self.catalog)[0].chart_type,
            "multi_line",
        )
        self.assertFalse(
            validate_results(result(list(reversed(rows))), p, g, self.catalog).valid
        )
        s = AnalysisSpec(
            analysis_kind="heatmap",
            subject="products",
            metrics=["quantity_sold"],
            dimensions=["category", "city"],
        )
        g = self.catalog.ground(s)
        p = build_plans(g, self.catalog)[0]
        rows = [{"category": "A", "city": "Hà Nội", "quantity_sold": 20}]
        self.assertEqual(
            choose_visualizations(p, result(rows), g, self.catalog)[0].chart_type,
            "heatmap",
        )

    def test_composite_preserves_scope_across_ranking_and_trend(self):
        s = AnalysisSpec.model_validate(
            ranking_spec(
                analysis_kind="composite",
                ranking=None,
                components=[
                    {
                        "id": "ranking",
                        "kind": "ranking",
                        "metrics": ["quantity_sold"],
                        "dimensions": ["product"],
                        "ranking": {"metric": "quantity_sold", "top_n": 5},
                    },
                    {
                        "id": "trend",
                        "kind": "trend",
                        "metrics": ["product_revenue"],
                        "dimensions": [],
                    },
                ],
            )
        )
        g = self.catalog.ground(s)
        plans = build_plans(g, self.catalog)
        self.assertEqual(len(plans), 2)
        self.assertEqual(plans[0].filters, plans[1].filters)
        self.assertEqual(plans[0].period, plans[1].period)
        for p in plans:
            self.assertTrue(
                validate_sql(compile_sql(p, g, self.catalog), p, g, self.catalog).valid
            )

    def test_snapshot_metric_time_unsupported_and_no_fanout(self):
        s = AnalysisSpec(
            analysis_kind="aggregate",
            subject="customers",
            metrics=["total_spent"],
            time_range={"mode": "current_month"},
        )
        with self.assertRaises(AnalysisError):
            build_plans(self.catalog.ground(s), self.catalog)
        s = AnalysisSpec(
            analysis_kind="aggregate",
            subject="orders",
            metrics=["revenue"],
            dimensions=["product"],
        )
        with self.assertRaises(AnalysisError):
            build_plans(self.catalog.ground(s), self.catalog)

    def test_patch_merges_only_requested_paths(self):
        p = SpecPatch(operations=[{"path": "/ranking/top_n", "value": 10}])
        s = merge_patch(self.spec, p)
        self.assertEqual(s.ranking.top_n, 10)
        for field in ("filters", "time_range", "metrics", "dimensions", "subject"):
            self.assertEqual(getattr(s, field), getattr(self.spec, field))
        s, p = refine_spec(
            self.spec,
            "Đổi thành top 10",
            self.catalog,
            Mock(return_value=p.model_dump()),
        )
        self.assertEqual(s.ranking.top_n, 10)
        with self.assertRaises(AnalysisError):
            refine_spec(
                self.spec,
                "Thêm heatmap",
                self.catalog,
                Mock(
                    return_value={
                        "operations": [
                            {"path": "/time_range", "value": {"mode": "all_time"}}
                        ]
                    }
                ),
            )
        with self.assertRaises(AnalysisError):
            merge_patch(
                self.spec, SpecPatch(operations=[{"path": "/sql", "value": "DROP"}])
            )

    def test_failed_embedding_truthful_lexical_fallback_no_seed_or_db(self):
        with patch("services.vector_rag_service.get_embedding", return_value=None):
            found = vector_rag_service.search_semantic_knowledge(
                "sản phẩm bán chạy", catalog=self.catalog, use_embeddings=True
            )
        self.assertEqual(found["vector_status"], "embedding_unavailable")
        self.assertTrue(found["top_tables"])
        self.assertNotIn("similarity", found["table_details"][0])
        self.assertNotIn("vector_similarity", found["table_details"][0])
        self.assertTrue(all(t.startswith("silver.") for t in found["top_tables"]))

    def pipeline(self, provider=None, executor=None):
        return AnalysisPipeline(planning_mode="legacy",
            metadata_loader=physical_metadata,
            provider=provider or query_script(),
            executor=executor or Mock(return_value=result(ranked_rows())),
        )

    def test_approval_reuses_spec_no_reinterpretation_chart_no_queries(self):
        provider = query_script()
        execute = Mock(return_value=result(ranked_rows()))
        pipeline = self.pipeline(provider, execute)
        req = AiTextToReportRequest(
            prompt="Top 5 món bán chạy nhất tại Hà Nội tháng này"
        )
        proposal = pipeline.propose(req)
        self.assertEqual(execute.call_count, 0)
        req.session_id = proposal["session_id"]
        report = pipeline.generate(req)
        self.assertEqual(report["analysis_spec"], proposal["analysis_spec"])
        execute.assert_called_once()
        self.assertEqual(len(report["charts"]), 1)
        self.assertEqual(provider.call_count, 2)
        self.assertEqual(report["diagnostics"]["provider_call_count"], 0)
        req.prompt = "different"
        with self.assertRaises(AnalysisError):
            pipeline.generate(req)

    def test_approved_schema_change_rejects_without_query(self):
        pipeline = self.pipeline()
        req = AiTextToReportRequest(
            prompt="Top 5 món bán chạy nhất tại Hà Nội tháng này"
        )
        p = pipeline.propose(req)
        req.session_id = p["session_id"]
        changed = physical_metadata()
        changed["table_map"]["silver.san_pham"]["columns"].pop()
        pipeline.metadata_loader = lambda: changed
        with self.assertRaises(AnalysisError) as caught:
            pipeline.generate(req)
        self.assertEqual(caught.exception.category, "schema_changed")
        pipeline.executor.assert_not_called()

    def test_result_violation_never_reported_and_fabricated_synthesis_dropped(self):
        req = AiTextToReportRequest(
            prompt="Top 5 món bán chạy nhất tại Hà Nội tháng này"
        )
        pipeline = self.pipeline(executor=Mock(return_value=result(ranked_rows(6))))
        with self.assertRaises(AnalysisError) as caught:
            pipeline.generate(req)
        self.assertEqual(caught.exception.category, "result_contract")
        self.assertEqual(pipeline.provider.call_count, 2)
        pipeline = self.pipeline(
            provider=query_script(
                final={
                    "active_query_ids": ["main"],
                    "claims": [
                        {
                            "evidence_id": "fake_id",
                            "metric": "quantity_sold",
                            "scope_ref": "main",
                            "claim_type": "ranking",
                            "text": "Revenue 999999999",
                        }
                    ],
                }
            )
        )
        report = pipeline.generate(req)
        self.assertNotIn("999999999", json.dumps(report))
        self.assertEqual(report["provider"]["synthesis"], "validated_evidence")
        self.assertTrue(report["kpi_cards"])
        self.assertTrue(report["rejected_narrative"])

    def test_refinement_preserves_time_filters_and_reuses_rows_for_chart_patch(self):
        pipeline = self.pipeline()
        report = pipeline.generate(
            AiTextToReportRequest(prompt="Top 5 món bán chạy nhất tại Hà Nội tháng này")
        )
        pipeline.provider = ScriptedProvider(
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
        req = AiReportRefineRequest(
            current_report=report,
            feedback="Đổi biểu đồ cột",
            session_id=report["session_id"],
        )
        refined = pipeline.refine(req)
        self.assertEqual(
            refined["analysis_spec"]["time_range"],
            report["analysis_spec"]["time_range"],
        )
        self.assertEqual(
            refined["analysis_spec"]["filters"], report["analysis_spec"]["filters"]
        )
        self.assertEqual(refined["charts"][0]["chart_type"], "bar")
        self.assertEqual(pipeline.executor.call_count, 1)
        with self.assertRaises(AnalysisError):
            pipeline.refine(req)  # stale revision

    def test_execution_failure_never_calls_sql_repair(self):
        from services.sql_service import QueryExecutionError

        pipeline = self.pipeline(
            executor=Mock(side_effect=QueryExecutionError("synthetic", "42601"))
        )
        with self.assertRaises(AnalysisError) as caught:
            pipeline.generate(AiTextToReportRequest(prompt="scripted request"))
        self.assertEqual(caught.exception.category, "execution")
        pipeline.executor.assert_called_once()
        self.assertEqual(pipeline.provider.call_count, 2)
        self.assertNotIn("SELECT ", json.dumps(pipeline.provider.requests))

    def test_feedback_only_validated_server_session_and_compatible_schema(self):
        pipeline = self.pipeline()
        report = pipeline.generate(
            AiTextToReportRequest(prompt="Top 5 món bán chạy nhất tại Hà Nội tháng này")
        )
        positive = AiFeedbackRequest(
            session_id=report["session_id"],
            prompt="untrusted prompt",
            rating="positive",
            final_sql="DELETE FROM silver.don_hang",
        )
        self.assertTrue(pipeline.feedback(positive)["verified_example"])
        examples = retrieve_verified("products", self.catalog.fingerprint)
        self.assertTrue(examples)
        self.assertNotIn("DELETE", json.dumps(examples))
        self.assertNotIn("untrusted", json.dumps(examples))
        self.assertEqual(retrieve_verified("products", "stale-fingerprint"), [])
        positive.rating = "negative"
        self.assertFalse(pipeline.feedback(positive)["verified_example"])
        positive.session_id = None
        positive.rating = "positive"
        self.assertFalse(pipeline.feedback(positive)["verified_example"])

    def test_expired_session_not_resurrected(self):
        import time

        s = create_session("fixture")
        _timestamps[s.session_id] = time.monotonic() - SESSION_TTL_SECONDS - 1
        self.assertIsNone(get_session(s.session_id))

    def test_offline_switch_guards_all_provider_entry_points(self):
        from services.llm_service import call_llm, call_bounded_llm
        from services.vector_rag_service import get_embedding

        with patch.dict(os.environ, {"AI_OFFLINE": "1"}), patch(
            "services.llm_service.GEMINI_API_KEY", "fake"
        ), patch("services.llm_service.GROQ_API_KEY", "fake"), patch(
            "services.vector_rag_service.GEMINI_API_KEY", "fake"
        ):
            self.assertIsNone(call_llm("test"))
            self.assertEqual(call_bounded_llm("test")["attempts"], [])
            self.assertIsNone(get_embedding("test"))

    def test_current_metadata_refresh_failure_does_not_use_stale_cache(self):
        from services import metadata_service as m

        with patch.dict(
            m._cache,
            {"local": {"value": physical_metadata(), "loaded_at": 0}},
            clear=True,
        ), patch.object(m, "_introspect", side_effect=RuntimeError("unavailable")):
            with self.assertRaises(RuntimeError):
                m.get_local_metadata(force=True)

    def test_explicit_month_quarter_year_hints_not_flattened(self):
        for prompt, begin, end in [
            ("Sản lượng tháng 10 năm 2026", "2026-10-01", "2026-10-31"),
            ("Sản lượng quý 3 năm 2026", "2026-07-01", "2026-09-30"),
            ("Sản lượng năm 2025", "2025-01-01", "2025-12-31"),
        ]:
            with self.subTest(prompt=prompt):
                hint = hints(prompt, self.catalog)
                self.assertEqual(len(hint["explicit_time"]), 1)
                self.assertEqual(hint["explicit_time"][0]["start"], begin)
                self.assertEqual(hint["explicit_time"][0]["end"], end)
        wrong = ranking_spec(time_range={"mode": "current_year"})
        with self.assertRaises(AnalysisError):
            understand(
                "Top 5 sản phẩm Hà Nội tháng 10 năm 2026",
                self.catalog,
                Mock(return_value=wrong),
            )

    def test_detail_timestamp_result_outside_scope_rejected(self):
        s = AnalysisSpec(
            analysis_kind="detail",
            subject="orders",
            time_range={"mode": "custom", "start": "2026-10-01", "end": "2026-10-31"},
        )
        g = self.catalog.ground(s)
        p = build_plans(g, self.catalog)[0]
        row = {
            "order_id": "fixture",
            "store_id": "1",
            "order_status": "HOAN_THANH",
            "payment_method": "TIEN_MAT",
            "order_amount": 10,
            "order_created": "2026-09-30T12:00:00",
        }
        self.assertFalse(validate_results(result([row]), p, g, self.catalog).valid)
        row["order_created"] = "2026-10-01T12:00:00"
        self.assertTrue(validate_results(result([row]), p, g, self.catalog).valid)

    def test_valid_donut_only_complete_distribution_and_null_not_zero(self):
        s = AnalysisSpec(
            analysis_kind="distribution",
            subject="orders",
            metrics=["order_count"],
            dimensions=["payment_method"],
            requested_visualizations=["donut"],
        )
        g = self.catalog.ground(s)
        p = build_plans(g, self.catalog)[0]
        rows = [
            {"payment_method": "TIEN_MAT", "order_count": 3},
            {"payment_method": "CHUYEN_KHOAN", "order_count": 7},
        ]
        visuals = choose_visualizations(p, result(rows), g, self.catalog)
        self.assertEqual(len(visuals), 1)
        self.assertTrue(visuals[0].composition)
        self.assertEqual(visuals[0].unit, "đơn")
        rows[0]["order_count"] = None
        self.assertEqual(choose_visualizations(p, result(rows), g, self.catalog), [])

    def test_series_cardinality_and_mismatched_units_rejected(self):
        s = AnalysisSpec(
            analysis_kind="trend",
            subject="products",
            metrics=["quantity_sold"],
            dimensions=["category"],
        )
        g = self.catalog.ground(s)
        p = build_plans(g, self.catalog)[0]
        rows = [
            {"period": "2026-10-01", "category": f"Category {i}", "quantity_sold": i}
            for i in range(self.catalog.registry["max_series"] + 1)
        ]
        self.assertEqual(choose_visualizations(p, result(rows), g, self.catalog), [])
        rows = rows[:2]
        v = choose_visualizations(p, result(rows), g, self.catalog)[0]
        self.assertFalse(
            validate_chart(
                v.model_copy(update={"unit": "VND"}), p, result(rows), g, self.catalog
            ).valid
        )

    def test_empty_report_and_invalid_provider_json_safe_fallback(self):
        pipeline = self.pipeline(executor=Mock(return_value=result([])))
        report = pipeline.generate(
            AiTextToReportRequest(prompt="Top 5 món bán chạy nhất tại Hà Nội tháng này")
        )
        self.assertEqual(report["charts"], [])
        self.assertEqual(report["table_data"]["rows"], [])
        self.assertTrue(report["data_warnings"])
        # Inspect analytical content, not wall-clock timestamps/latency that
        # can coincidentally contain the provider's fabricated numbers.
        content = json.dumps({key: report[key] for key in
            ("charts", "table_data", "evidence", "assistant_reply")})
        self.assertNotIn("98.5", content)
        self.assertNotIn("4.8", content)
        with self.assertRaises(AnalysisError):
            understand(
                "unclear composite request",
                self.catalog,
                Mock(return_value={"analysis_spec": {"sql": "SELECT *"}}),
            )

    def test_filter_replace_explicit_value_and_unauthorized_remove(self):
        changed = {
            "operations": [
                {
                    "path": "/filters",
                    "value": [
                        {"dimension": "city", "operator": "eq", "value": "Cần Thơ"}
                    ],
                }
            ]
        }
        new, p = refine_spec(
            self.spec,
            "Chuyển bộ lọc thành phố sang Cần Thơ",
            self.catalog,
            Mock(return_value=changed),
        )
        self.assertEqual(new.filters[0].value, "Cần Thơ")
        self.assertEqual(new.time_range, self.spec.time_range)
        remove = {"operations": [{"path": "/filters", "value": []}]}
        with self.assertRaises(AnalysisError):
            refine_spec(
                self.spec, "Thêm biểu đồ cột", self.catalog, Mock(return_value=remove)
            )
        new, p = refine_spec(
            self.spec, "Bỏ lọc thành phố", self.catalog, Mock(return_value=remove)
        )
        self.assertEqual(new.filters, [])

    def test_generic_new_semantics_require_only_registry_not_router_branches(self):
        physical = physical_metadata()
        physical["table_map"]["silver.operational_facts"] = {
            "columns": [
                {"name": "site_code", "data_type": "text"},
                {"name": "kilowatt_hours", "data_type": "numeric"},
            ],
            "relationships": [],
        }
        overlay = deepcopy(self.catalog.overlay)
        r = overlay["analysis_registry"]
        overlay["silver_tables"]["silver.operational_facts"] = {"primary_key": [], "joins": []}
        r["subjects"]["energy"] = {
            "business_name": "Năng lượng",
            "aliases": ["energy"],
            "source": "silver.operational_facts",
            "grain": "site_snapshot",
            "default_dimension": "site",
            "metrics": ["energy_used"],
            "detail_columns": ["site"],
        }
        r["dimensions"]["site"] = {
            "table": "silver.operational_facts",
            "column": "site_code",
            "business_name": "Site",
            "aliases": ["site"],
        }
        r["metrics"]["energy_used"] = {
            "business_name": "Energy used",
            "aliases": ["energy used"],
            "source": "silver.operational_facts",
            "grain": "site_snapshot",
            "expression": "SUM(silver.operational_facts.kilowatt_hours)",
            "unit": "kWh",
            "subjects": ["energy"],
            "time_column": None,
            "business_filters": [],
        }
        cat = AnalysisCatalog(physical, overlay)
        spec = AnalysisSpec(
            analysis_kind="ranking",
            subject="energy",
            metrics=["energy_used"],
            dimensions=["site"],
            ranking={"metric": "energy_used", "top_n": 7},
        )
        g = cat.ground(spec)
        p = build_plans(g, cat)[0]
        sql = compile_sql(p, g, cat)
        self.assertTrue(validate_sql(sql, p, g, cat).valid)
        self.assertIn("LIMIT 7", sql)
        self.assertEqual(
            choose_visualizations(
                p, result([{"site": "A", "energy_used": 42}]), g, cat
            )[0].unit,
            "kWh",
        )

    def test_security_existing_checks_called_in_addition_to_ast(self):
        with patch(
            "services.analysis_query.validate_read_only_sql",
            side_effect=ValueError("security denied"),
        ) as guard:
            self.assertFalse(
                validate_sql(self.sql, self.plan, self.ground, self.catalog).valid
            )
            guard.assert_called_once()
        with patch(
            "services.analysis_query.validate_ai_query_scope",
            side_effect=ValueError("scope denied"),
        ) as guard:
            self.assertFalse(
                validate_sql(self.sql, self.plan, self.ground, self.catalog).valid
            )
            guard.assert_called_once()

    def test_route_responses_and_rejection_never_publish_charts(self):
        from routers.ai import propose_plan, generate_executive_report, refine_report

        req = AiTextToReportRequest(
            prompt="Top 5 món bán chạy nhất tại Hà Nội tháng này"
        )
        pipeline = self.pipeline()
        with patch("routers.ai.AnalysisPipeline", return_value=pipeline):
            p = propose_plan(req)
            self.assertEqual(p["status"], "proposal_ready")
            req.session_id = p["session_id"]
            report = generate_executive_report(req)
            self.assertEqual(report["status"], "success")
        pipeline = self.pipeline(executor=Mock(return_value=result(ranked_rows(6))))
        with patch("routers.ai.AnalysisPipeline", return_value=pipeline):
            req.session_id = None
            rejected = generate_executive_report(req)
            self.assertEqual(rejected["status"], "error")
            self.assertEqual(rejected["charts"], [])
            self.assertNotIn("table_data", rejected)

    def test_bounded_provider_transport_fallback_tracks_actual_attempts(self):
        from services.llm_service import call_bounded_llm

        bad = Mock(ok=False)
        bad.json.return_value = {}
        good = Mock(ok=True)
        good.json.return_value = {
            "choices": [{"message": {"content": '{"selected_evidence_ids": []}'}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5},
        }
        with patch.dict(os.environ, {"AI_OFFLINE": "0"}), patch(
            "services.llm_service.GEMINI_API_KEY", "synthetic"
        ), patch("services.llm_service.GROQ_API_KEY", "synthetic"), patch(
            "services.llm_service.requests.post", side_effect=[bad, good]
        ) as transport:
            reply = call_bounded_llm("fixture", AnalysisSpec.model_json_schema())
        self.assertEqual(transport.call_count, 2)
        self.assertEqual(len(reply["attempts"]), 2)
        self.assertEqual(reply["attempts"][0]["status"], "failed")
        self.assertEqual(reply["attempts"][1]["tokens"], {"input": 10, "output": 5})
        self.assertIn(
            "responseJsonSchema",
            transport.call_args_list[0].kwargs["json"]["generationConfig"],
        )
        self.assertIn(
            "JSON schema",
            transport.call_args_list[1].kwargs["json"]["messages"][0]["content"],
        )
        self.assertNotIn("synthetic", json.dumps(reply))

    def test_feedback_schema_change_or_failed_contract_never_verified(self):
        pipeline = self.pipeline()
        report = pipeline.generate(
            AiTextToReportRequest(prompt="Top 5 món bán chạy nhất tại Hà Nội tháng này")
        )
        session = get_session(report["session_id"])
        session.last_result_contract["main"]["valid"] = False
        feedback = AiFeedbackRequest(
            session_id=session.session_id, prompt="fixture", rating="positive"
        )
        self.assertFalse(pipeline.feedback(feedback)["verified_example"])

    def test_metadata_cache_no_request_self_healing_writes(self):
        from services import metadata_service as m

        meta = {
            "table_map": {"orders.don_hang": {"columns": []}},
            "tables": [],
            "table_count": 1,
        }
        with patch.object(m, "_cached", return_value=meta), patch(
            "db.init_warehouse_views", side_effect=AssertionError("No request DDL")
        ):
            self.assertEqual(m.get_local_metadata(force=True), meta)

    def test_comparison_patch_moves_original_city_into_preserved_group(self):
        change = {
            "operations": [
                {"path": "/filters", "value": []},
                {"path": "/analysis_kind", "value": "comparison"},
                {
                    "path": "/comparison_groups",
                    "value": [
                        {
                            "name": "Hà Nội",
                            "filters": [{"dimension": "city", "value": "Hà Nội"}],
                            "top_n": 5,
                        },
                        {
                            "name": "Hồ Chí Minh",
                            "filters": [{"dimension": "city", "value": "Hồ Chí Minh"}],
                            "top_n": 5,
                        },
                    ],
                },
            ]
        }
        updated, p = refine_spec(
            self.spec, "Thêm TP.HCM để so sánh", self.catalog, Mock(return_value=change)
        )
        self.assertEqual(updated.metrics, self.spec.metrics)
        self.assertEqual(updated.time_range, self.spec.time_range)
        grounded = self.catalog.ground(updated)
        plans = build_plans(grounded, self.catalog)
        self.assertEqual(len(plans), 2)
        self.assertEqual(plans[0].filters[0].value, "Hà Nội")
        self.assertEqual(plans[1].filters[0].value, "Hồ Chí Minh")
        bad = AnalysisSpec.model_validate(
            ranking_spec(
                comparison_groups=[
                    {
                        "name": "wrong",
                        "filters": [{"dimension": "city", "value": "Cần Thơ"}],
                        "top_n": 5,
                    }
                ]
            )
        )
        with self.assertRaises(AnalysisError):
            build_plans(self.catalog.ground(bad), self.catalog)

    def test_metric_refinement_preserves_population_and_period(self):
        change = {
            "operations": [
                {"path": "/metrics", "value": ["product_revenue"]},
                {"path": "/ranking/metric", "value": "product_revenue"},
            ]
        }
        updated, p = refine_spec(
            self.spec, "Đổi sang doanh thu món", self.catalog, Mock(return_value=change)
        )
        self.assertEqual(updated.ranking.metric, "product_revenue")
        self.assertEqual(updated.time_range, self.spec.time_range)
        self.assertEqual(updated.filters, self.spec.filters)
        ground = self.catalog.ground(updated)
        plan = build_plans(ground, self.catalog)[0]
        self.assertTrue(
            validate_sql(
                compile_sql(plan, ground, self.catalog), plan, ground, self.catalog
            ).valid
        )

    def test_per_group_visualizations_enforce_each_group_top_n(self):
        s = AnalysisSpec.model_validate(
            ranking_spec(
                filters=[],
                dimensions=["product", "city"],
                ranking={"metric": "quantity_sold", "top_n": 2, "per_group": ["city"]},
            )
        )
        g = self.catalog.ground(s)
        p = build_plans(g, self.catalog)[0]
        rows = [
            {**r, "city": city, "rank_position": i + 1}
            for city in ["Hà Nội", "Cần Thơ"]
            for i, r in enumerate(ranked_rows(2))
        ]
        visuals = choose_visualizations(p, result(rows), g, self.catalog)
        from services.analysis_presentation import render_chart

        self.assertEqual(len(visuals), 2)
        for visual in visuals:
            self.assertTrue(
                validate_chart(visual, p, result(rows), g, self.catalog).valid
            )
            self.assertEqual(visual.cardinality, 2)
            self.assertEqual(len(render_chart(visual, result(rows))["data"]), 2)

    def test_timestamptz_scope_uses_explicit_timezone(self):
        physical = physical_metadata()
        for col in physical["table_map"]["silver.don_hang"]["columns"]:
            if col["name"] == "ngay_tao":
                col["data_type"] = "timestamp with time zone"
        cat = AnalysisCatalog(physical)
        s = AnalysisSpec(
            analysis_kind="trend",
            subject="orders",
            metrics=["revenue"],
            time_range={"mode": "current_month"},
        )
        g = cat.ground(s)
        p = build_plans(g, cat)[0]
        sql = compile_sql(p, g, cat)
        self.assertIn("AT TIME ZONE", sql)
        self.assertTrue(
            validate_sql(sql, p, g, cat).valid, validate_sql(sql, p, g, cat).errors
        )

    def test_all_registered_metric_operators_compile_security(self):
        for mid, metric in self.catalog.registry["metrics"].items():
            with self.subTest(metric=mid):
                s = AnalysisSpec(
                    analysis_kind="aggregate",
                    subject=metric["subjects"][0],
                    metrics=[mid],
                )
                g = self.catalog.ground(s)
                p = build_plans(g, self.catalog)[0]
                sql = compile_sql(p, g, self.catalog)
                self.assertTrue(
                    validate_sql(sql, p, g, self.catalog).valid,
                    validate_sql(sql, p, g, self.catalog).errors,
                )

    def test_sql_ast_clause_bindings_and_unsafe_functions(self):
        from services.sql_service import validate_sql_ast_security, SqlSafetyError

        policy = {"silver.don_hang": {"tong_tien", "co_so_ma"}}
        for sql in [
            "SELECT tong_tien FROM silver.don_hang WHERE email = 1",
            "SELECT tong_tien FROM silver.don_hang GROUP BY missing_column",
            "SELECT pg_read_file('/fixture') FROM silver.don_hang",
            "SELECT t.tong_tien FROM silver.don_hang t JOIN silver.don_hang u ON t.missing = u.co_so_ma",
        ]:
            with self.subTest(sql=sql), self.assertRaises(SqlSafetyError):
                validate_sql_ast_security(sql, policy)

    def test_ui_time_cannot_silently_replace_explicit_prompt_period(self):
        from common import AiTimeRange

        with self.assertRaises(AnalysisError):
            understand(
                "Top 5 món bán chạy nhất tại Hà Nội tháng này",
                self.catalog,
                Mock(),
                AiTimeRange(mode="7d"),
            )

    def test_composite_comparison_weekly_trend_has_four_plans(self):
        raw = ranking_spec(
            analysis_kind="composite",
            metrics=["quantity_sold", "product_revenue"],
            ranking=None,
            filters=[],
            time_range={"mode": "previous_quarter"},
            granularity="week",
            comparison_groups=[
                {
                    "name": "Hà Nội",
                    "filters": [{"dimension": "city", "value": "Hà Nội"}],
                    "top_n": 5,
                },
                {
                    "name": "Cần Thơ",
                    "filters": [{"dimension": "city", "value": "Cần Thơ"}],
                    "top_n": 3,
                },
            ],
            components=[
                {
                    "id": "ranking",
                    "kind": "ranking",
                    "metrics": ["quantity_sold", "product_revenue"],
                    "dimensions": ["product"],
                    "ranking": {"metric": "quantity_sold", "top_n": 5},
                },
                {"id": "trend", "kind": "trend", "metrics": ["product_revenue"]},
            ],
        )
        spec, info = understand(
            "Top 5 sản phẩm ở Hà Nội và top 3 ở Cần Thơ quý trước, so sánh doanh thu và xu hướng theo tuần",
            self.catalog,
            Mock(return_value=raw),
        )
        g = self.catalog.ground(spec, date(2026, 10, 6))
        plans = build_plans(g, self.catalog)
        self.assertEqual(len(plans), 4)
        self.assertEqual(
            [p.ranking.top_n for p in plans if p.kind == "ranking"], [5, 3]
        )
        self.assertTrue(all(p.ranking is None for p in plans if p.kind == "trend"))
        for plan in plans:
            self.assertTrue(
                validate_sql(
                    compile_sql(plan, g, self.catalog), plan, g, self.catalog
                ).valid
            )

    def test_physical_sensitive_flag_and_database_enum_override_overlay(self):
        physical = physical_metadata()
        for col in physical["table_map"]["silver.san_pham"]["columns"]:
            if col["name"] == "ten_san_pham":
                col["sensitive"] = True
        with self.assertRaises(AnalysisError):
            AnalysisCatalog(physical).ground(self.spec)
        physical = physical_metadata()
        for col in physical["table_map"]["silver.don_hang"]["columns"]:
            if col["name"] == "phuong_thuc_thanh_toan":
                col["enum_values"] = ["ONLY_ACTUAL_ENUM"]
        spec = AnalysisSpec(
            analysis_kind="aggregate",
            subject="orders",
            metrics=["order_count"],
            filters=[{"dimension": "payment_method", "value": "TIEN_MAT"}],
        )
        with self.assertRaises(AnalysisError):
            AnalysisCatalog(physical).ground(spec)
        self.assertNotEqual(
            AnalysisCatalog(physical).fingerprint, self.catalog.fingerprint
        )

    def test_composite_foreign_key_never_degrades_to_one_column_join(self):
        physical = physical_metadata()
        physical["table_map"]["silver.fact_pair"] = {
            "columns": [
                {"name": "key_a", "data_type": "text"},
                {"name": "key_b", "data_type": "text"},
            ],
            "relationships": [
                {
                    "constraint_name": "pair_fk",
                    "from_column": "key_a",
                    "to_table": "silver.dim_pair",
                    "to_column": "key_a",
                },
                {
                    "constraint_name": "pair_fk",
                    "from_column": "key_b",
                    "to_table": "silver.dim_pair",
                    "to_column": "key_b",
                },
            ],
        }
        physical["table_map"]["silver.dim_pair"] = {
            "columns": [
                {"name": "key_a", "data_type": "text"},
                {"name": "key_b", "data_type": "text"},
            ],
            "primary_key": ["key_a", "key_b"],
            "relationships": [],
        }
        for constraint_key in ("constraint_name", "constraint"):
            for relationship in physical["table_map"]["silver.fact_pair"][
                "relationships"
            ]:
                relationship.pop("constraint_name", None)
                relationship[constraint_key] = "pair_fk"
            catalog = AnalysisCatalog(physical)
            path = catalog.path("silver.fact_pair", "silver.dim_pair")
            self.assertEqual(len(path), 1)
            self.assertIn("key_a", path[0]["on"])
            self.assertIn("key_b", path[0]["on"])
            self.assertIn("AND", path[0]["on"])

    def test_ambiguous_best_metric_guess_rejected_even_high_model_confidence(self):
        guessed = {
            "analysis_kind": "ranking",
            "subject": "stores",
            "metrics": ["store_revenue"],
            "ranking": {"metric": "store_revenue", "top_n": 1},
            "confidence": 1,
        }
        with self.assertRaises(AnalysisError) as caught:
            understand(
                "Cho tôi chi nhánh tốt nhất", self.catalog, Mock(return_value=guessed)
            )
        self.assertEqual(caught.exception.category, "metric_ambiguous")

    def test_verified_example_kind_and_schema_selection_enforced(self):
        raw = ranking_spec()
        raw["used_example_ids"] = ["example_1"]
        examples = [
            {
                "example_id": "example_1",
                "schema_fingerprint": self.catalog.fingerprint,
                "analysis_spec": {**raw, "analysis_kind": "aggregate"},
            }
        ]
        with self.assertRaises(AnalysisError):
            understand(
                "Top 5 món tại Hà Nội tháng 10 năm 2026, có báo cáo",
                self.catalog,
                Mock(return_value=raw),
                examples=examples,
            )
        examples[0]["analysis_spec"]["analysis_kind"] = "ranking"
        s, info = understand(
            "Top 5 món tại Hà Nội tháng 10 năm 2026, có báo cáo",
            self.catalog,
            Mock(return_value=raw),
            examples=examples,
        )
        self.assertEqual(s.used_example_ids, ["example_1"])

    def test_detail_subject_uses_entity_grain_not_transaction_metric_source(self):
        s = AnalysisSpec(analysis_kind="detail", subject="products")
        g = self.catalog.ground(s)
        plan = build_plans(g, self.catalog)[0]
        sql = compile_sql(plan, g, self.catalog)
        self.assertEqual(plan.source, "silver.san_pham")
        self.assertEqual(s.detail_level, "detail")
        self.assertNotIn("GROUP BY", sql)
        self.assertNotIn("silver.chi_tiet_don_hang", sql)
        s = AnalysisSpec(
            analysis_kind="detail",
            subject="products",
            time_range={"mode": "current_month"},
        )
        with self.assertRaises(AnalysisError):
            build_plans(self.catalog.ground(s), self.catalog)

    def test_legacy_branch_days_filters_are_explicit_ui_constraints(self):
        pipeline = self.pipeline()
        request = AiTextToReportRequest(
            prompt="fixture", branch="HN", date_range="7days"
        )
        context = pipeline.ui_context(request, self.catalog, date(2026, 10, 6))
        self.assertEqual(context["required_filter"]["value"], "Hà Nội")
        self.assertEqual(
            context["required_period"], {"start": "2026-09-30", "end": "2026-10-06"}
        )

    def test_average_rating_is_not_part_to_whole_composition(self):
        spec = AnalysisSpec(
            analysis_kind="distribution",
            subject="store_reviews",
            metrics=["avg_store_rating"],
            dimensions=["store"],
            requested_visualizations=["donut"],
        )
        ground = self.catalog.ground(spec)
        plan = build_plans(ground, self.catalog)[0]
        rows = [
            {"store": "A", "store_id": "1", "avg_store_rating": 4.0},
            {"store": "B", "store_id": "2", "avg_store_rating": 4.5},
        ]
        self.assertEqual(
            choose_visualizations(plan, result(rows), ground, self.catalog), []
        )


if __name__ == "__main__":
    unittest.main()
