"""Offline input flexibility with unchanged strict downstream execution guards."""

import json
import os
import unittest
from copy import deepcopy
from datetime import date
from unittest.mock import Mock, MagicMock, patch
from common import AiTextToReportRequest
from services.analysis_catalog import AnalysisCatalog, AnalysisError
from services.analysis_contract import AnalysisSpec, TimeSpec
from services.analysis_understanding import understand, hints, labelled_interpretation
from services.analysis_pipeline import safe_failure
from tests.archive_planner import ArchivedGraphPipeline as AnalysisPipeline
from services.time_resolution_service import resolve_time, parse_time
from services.value_grounding_service import value_hints, dimension_values
from tests.analysis_fixtures import physical_metadata, ranking_spec, ranked_rows, result
from tests.agent_fixtures import query_script, ScriptedProvider, call, ranking_query


class UnderstandingV21Tests(unittest.TestCase):
    def setUp(self):
        self.network = patch(
            "requests.sessions.Session.request",
            side_effect=AssertionError("Offline network denied"),
        )
        self.database = patch(
            "psycopg2.connect", side_effect=AssertionError("Offline database denied")
        )
        self.network.start()
        self.database.start()
        self.addCleanup(self.network.stop)
        self.addCleanup(self.database.stop)
        self.catalog = AnalysisCatalog(physical_metadata())
        self.reference = date(2026, 10, 6)

    def interpret(self, prompt, raw=None, reference=None):
        provider = Mock(
            return_value=raw
            or ranking_spec(
                filters=[{"dimension": "city", "value": "Hồ Chí Minh"}],
                time_range={"mode": "all_time"},
            )
        )
        spec, info = understand(
            prompt, self.catalog, provider, reference_date=reference or self.reference
        )
        return spec, info, provider

    def test_real_failure_partial_month_preserves_complete_meaning(self):
        spec, info, provider = self.interpret(
            "top 5 món bán chạy nhất tại thành phố hồ chí minh tháng 9"
        )
        self.assertEqual(spec.subject, "products")
        self.assertEqual(spec.metrics, ["quantity_sold"])
        self.assertEqual(spec.filters[0].value, "Hồ Chí Minh")
        self.assertEqual((spec.ranking.top_n, spec.ranking.direction), (5, "DESC"))
        self.assertEqual(
            (spec.time_range.start, spec.time_range.end),
            (date(2026, 9, 1), date(2026, 9, 30)),
        )
        self.assertTrue(spec.assumptions)
        provider.assert_not_called()
        public = labelled_interpretation(self.catalog, spec.model_dump(mode="json"))
        self.assertNotIn("quantity_sold", json.dumps(public))

    def test_partial_month_most_recent_past_and_explicit_year(self):
        for text, reference, expected, inferred in [
            ("doanh thu tháng 8", date(2026, 10, 6), "2026-08-01", True),
            ("doanh thu tháng 9", date(2026, 2, 10), "2025-09-01", True),
            ("doanh thu tháng 9 năm 2025", date(2026, 10, 6), "2025-09-01", False),
            ("doanh thu quý 3", date(2026, 2, 10), "2025-07-01", True),
            ("doanh thu ngày 15/9", date(2026, 2, 10), "2025-09-15", True),
        ]:
            with self.subTest(text=text):
                parsed = hints(text, self.catalog, reference)
                self.assertEqual(parsed["canonical_time"]["start"], expected)
                self.assertEqual(bool(parsed["assumptions"]), inferred)

    def test_month_quarter_day_intermediate_contract(self):
        for part, expected in [
            (TimeSpec(kind="month", month=9), "2026-09-01"),
            (TimeSpec(kind="quarter", quarter=3), "2026-07-01"),
            (TimeSpec(kind="day", month=2, day=29), "2024-02-29"),
        ]:
            _, assumptions, period = resolve_time(
                part, self.reference, "Asia/Ho_Chi_Minh"
            )
            self.assertEqual(period["start"], expected)
            self.assertTrue(assumptions)

    def test_local_iso_dates_and_ranges(self):
        for text, start, end in [
            ("15/09/2026", "2026-09-15", "2026-09-15"),
            ("từ 01/09/2026 đến 30/09/2026", "2026-09-01", "2026-09-30"),
            ("2026-09-01 đến 2026-09-30", "2026-09-01", "2026-09-30"),
        ]:
            scope = hints(text, self.catalog, self.reference)["canonical_time"]
            self.assertEqual((scope["start"], scope["end"]), (start, end))

    def test_rolling_days_months_and_granularity(self):
        for text, start in [
            ("30 ngày gần nhất", "2026-09-07"),
            ("30 ngày vừa qua", "2026-09-07"),
            ("12 tháng gần đây", "2025-10-07"),
            ("12 tháng vừa qua", "2025-10-07"),
            ("past 12 months", "2025-10-07"),
        ]:
            scope = hints(text, self.catalog, self.reference)["canonical_time"]
            self.assertEqual((scope["start"], scope["end"]), (start, "2026-10-06"))
        self.assertEqual(
            hints("doanh thu theo tuần", self.catalog)["granularity"], "week"
        )

    def test_invalid_and_conflicting_time_remains_narrow_clarification(self):
        raw = ranking_spec(filters=[], time_range={"mode": "all_time"})
        for prompt, reason in [
            ("Top 5 món theo số lượng tháng 13", "time_range_invalid"),
            ("Top 5 món theo số lượng tháng 8 và tháng 9", "time_range_ambiguous"),
            ("Top 5 món theo số lượng ngày 31/02/2026", "time_range_invalid"),
            ("Dự báo Top 5 món theo số lượng tháng 9", "forecast_unsupported"),
        ]:
            with self.subTest(prompt=prompt), self.assertRaises(
                AnalysisError
            ) as caught:
                understand(
                    prompt,
                    self.catalog,
                    Mock(return_value=raw),
                    reference_date=self.reference,
                )
            self.assertEqual(caught.exception.category, reason)
            failure = safe_failure(caught.exception)
            self.assertEqual(failure["clarification"]["missing_fields"], ["time_range"])
            self.assertIn("Sản phẩm", failure["interpretation"]["subject"])

    def test_rank_language_variants_share_contract(self):
        raw = ranking_spec(filters=[], time_range={"mode": "all_time"})
        for prompt in [
            "top 5 món bán chạy",
            "5 món được mua nhiều nhất",
            "5 sản phẩm có sản lượng cao nhất",
            "best 5 selling products",
        ]:
            spec, info, _ = self.interpret(prompt, raw)
            self.assertEqual(
                (spec.subject, spec.ranking.top_n, spec.metrics),
                ("products", 5, ["quantity_sold"]),
            )

    def test_city_aliases_accents_punctuation_case(self):
        for word in [
            "HCM",
            "TPHCM",
            "TP HCM",
            "TP.HCM",
            "Hồ Chí Minh",
            "ho chi minh",
            "Sài Gòn",
            "sai gon",
        ]:
            evidence = value_hints("tại " + word, self.catalog, ["city"])
            self.assertEqual(
                evidence["recognized_values"],
                [{"dimension": "city", "value": "Hồ Chí Minh"}],
            )
        self.assertEqual(
            value_hints("theo từng thành phố", self.catalog, ["city"])[
                "recognized_values"
            ],
            [],
        )

    def test_new_physical_safe_value_needs_no_language_branch(self):
        physical = physical_metadata()
        for col in physical["table_map"]["silver.chi_nhanh"]["columns"]:
            if col["name"] == "thanh_pho":
                col["enum_values"] = ["New Observatory"]
        catalog = AnalysisCatalog(physical)
        hint = hints("Top 5 món theo số lượng tại new observatory", catalog)
        self.assertIn(
            {"dimension": "city", "value": "New Observatory"}, hint["recognized_values"]
        )
        self.assertNotIn("Hồ Chí Minh", dimension_values(catalog, "city"))

    def test_sensitive_and_unbounded_values_never_enter_prompt(self):
        physical = physical_metadata()
        for col in physical["table_map"]["silver.chi_nhanh"]["columns"]:
            if col["name"] == "thanh_pho":
                col.update(sensitive=True, safe_values=["PrivatePlace"])
        catalog = AnalysisCatalog(physical)
        self.assertEqual(
            value_hints("PrivatePlace", catalog, ["city"])["value_candidates"], {}
        )
        physical = physical_metadata()
        for col in physical["table_map"]["silver.chi_nhanh"]["columns"]:
            if col["name"] == "thanh_pho":
                col["safe_values"] = [f"Place {i}" for i in range(1000)]
        self.assertEqual(dimension_values(AnalysisCatalog(physical), "city"), [])

    def test_high_cardinality_lookup_only_specific_reference(self):
        lookup = Mock(return_value=["Synthetic Drink"])
        evidence = value_hints(
            'sản phẩm "Synthetic Drink"', self.catalog, ["product"], lookup
        )
        self.assertEqual(lookup.call_count, 1)
        self.assertIn(
            "Synthetic Drink", evidence["value_candidates"]["product"]["values"]
        )
        lookup.reset_mock()
        value_hints("top sản phẩm", self.catalog, ["product"], lookup)
        lookup.assert_not_called()

    def test_unknown_city_cannot_become_unchecked_filter(self):
        raw = ranking_spec(
            filters=[{"dimension": "city", "value": "Unknown City"}],
            time_range={"mode": "all_time"},
        )
        with self.assertRaises(AnalysisError) as caught:
            self.interpret(
                "Top 5 sản phẩm theo số lượng tại Unknown City, có báo cáo", raw
            )
        failure = safe_failure(caught.exception)
        self.assertEqual(
            failure["diagnostics"]["error_category"], "filter_value_unknown"
        )
        self.assertTrue(failure["options"])
        self.assertIn("Sản phẩm", failure["interpretation"]["subject"])

    def test_narrow_candidates_compatible_fields_and_no_unrelated_domains(self):
        candidates = self.catalog.candidates("Top 5 sản phẩm theo số lượng bán tháng 9")
        self.assertIn("products", candidates["subjects"])
        self.assertFalse(
            {"shift_count", "favorite_count", "driver_rating"}
            & set(candidates["metrics"])
        )
        for mid, metric in candidates["metrics"].items():
            self.assertTrue(set(metric["subjects"]) & set(candidates["subjects"]))
            for dim in metric["allowed_dimensions"]:
                self.catalog.path(
                    metric["source"], self.catalog.registry["dimensions"][dim]["table"]
                )
        self.assertNotIn("email", candidates["dimensions"])

    def test_model_confidence_does_not_gate_valid_contract(self):
        raw = ranking_spec(filters=[], time_range={"mode": "all_time"}, confidence=0)
        spec, info, _ = self.interpret("Top 5 sản phẩm theo số lượng, có bảng", raw)
        self.assertEqual(info["model_confidence"], 0)
        self.assertGreater(info["server_confidence"], 0)
        self.catalog.ground(spec)

    def test_metric_clarification_business_choices_and_known_scope(self):
        raw = {
            "analysis_kind": "ranking",
            "subject": "stores",
            "metrics": [],
            "ranking": {"metric": "store_revenue", "top_n": 5},
            "ambiguities": ["metric ambiguous"],
        }
        with self.assertRaises(AnalysisError) as caught:
            understand(
                "Top 5 chi nhánh tốt nhất tháng 9",
                self.catalog,
                Mock(return_value=raw),
                reference_date=self.reference,
            )
        failure = safe_failure(caught.exception)
        self.assertEqual(failure["status"], "needs_clarification")
        self.assertEqual(failure["clarification"]["missing_fields"], ["metrics"])
        self.assertTrue(all(o["label"] and o["followup"] for o in failure["options"]))
        self.assertNotIn("store_revenue", failure["question"])
        self.assertEqual(failure["interpretation"]["ranking"]["top_n"], 5)

    def test_provider_failure_categories_and_zero_execution(self):
        for provider_return, category in [
            (
                {
                    "calls": None,
                    "attempts": [{"error_category": "invalid_tool_response"}],
                },
                "provider_invalid_json",
            ),
            (
                {"calls": None, "attempts": [{"error_category": "provider_http"}]},
                "provider_unavailable",
            ),
            (
                {"calls": None, "attempts": [{"error_category": "provider_schema"}]},
                "provider_schema_invalid",
            ),
            ({"calls": "broken", "attempts": []}, "provider_invalid_tools"),
        ]:
            pipeline = AnalysisPipeline(planning_mode="legacy",
                metadata_loader=physical_metadata,
                provider=Mock(return_value=provider_return),
                executor=Mock(),
            )
            with self.subTest(category=category), self.assertRaises(
                AnalysisError
            ) as caught:
                pipeline.generate(AiTextToReportRequest(prompt="fixture"))
            self.assertEqual(caught.exception.category, category)
            self.assertEqual(safe_failure(caught.exception)["status"], "error")
            pipeline.executor.assert_not_called()

    def test_structured_missing_year_can_be_resolved_without_losing_known_fields(self):
        raw = ranking_spec(
            filters=[{"dimension": "city", "value": "Hồ Chí Minh"}],
            time_range={"mode": "all_time"},
        )
        raw["assumptions"] = [f"Provider assumption {i}" for i in range(10)]
        response = {
            "clarification": {
                "reason": "time_year_missing",
                "known_interpretation": raw,
                "missing_fields": ["time.year"],
            }
        }
        spec, _, provider = self.interpret(
            "Top 5 món theo số lượng ở HCM tháng 9, có bảng", response
        )
        self.assertEqual(spec.time_range.start, date(2026, 9, 1))
        self.assertEqual(spec.filters[0].value, "Hồ Chí Minh")
        self.assertTrue(spec.assumptions[0].startswith("Thời gian:"))
        provider.assert_called_once()

    def test_reference_date_is_part_of_approved_request(self):
        pipeline = AnalysisPipeline(planning_mode="legacy",
            metadata_loader=physical_metadata,
            provider=query_script(),
            executor=Mock(return_value=result(ranked_rows())),
        )
        request = AiTextToReportRequest(
            prompt="Top 5 món bán chạy nhất ở HCM tháng 9",
            reference_date=self.reference,
        )
        proposal = pipeline.propose(request)
        request.session_id = proposal["session_id"]
        request.reference_date = date(2026, 2, 10)
        with self.assertRaises(AnalysisError):
            pipeline.generate(request)
        pipeline.executor.assert_not_called()

    def test_new_metric_and_subject_are_understood_from_metadata_only(self):
        physical = physical_metadata()
        physical["table_map"]["silver.energy_facts"] = {
            "columns": [
                {"name": "site", "data_type": "text"},
                {"name": "kwh", "data_type": "numeric"},
            ],
            "relationships": [],
        }
        overlay = deepcopy(self.catalog.overlay)
        registry = overlay["analysis_registry"]
        overlay["silver_tables"]["silver.energy_facts"] = {"primary_key": [], "joins": []}
        registry["subjects"]["energy"] = {
            "business_name": "Năng lượng",
            "aliases": ["electricity"],
            "source": "silver.energy_facts",
            "grain": "site_snapshot",
            "metrics": ["electricity_used"],
            "default_dimension": "site",
            "detail_columns": ["site"],
        }
        registry["metrics"]["electricity_used"] = {
            "business_name": "Điện tiêu thụ",
            "aliases": ["electricity consumption"],
            "expression": "SUM(silver.energy_facts.kwh)",
            "source": "silver.energy_facts",
            "grain": "site_snapshot",
            "unit": "kWh",
            "subjects": ["energy"],
            "time_column": None,
        }
        registry["dimensions"]["site"] = {
            "business_name": "Site",
            "aliases": ["site"],
            "table": "silver.energy_facts",
            "column": "site",
        }
        catalog = AnalysisCatalog(physical, overlay)
        provider = Mock(
            return_value={
                "analysis_kind": "aggregate",
                "subject": "energy",
                "metrics": ["electricity_used"],
            }
        )
        spec, info = understand(
            "electricity consumption across sites", catalog, provider
        )
        self.assertIn(
            "electricity_used", catalog.candidates("electricity consumption")["metrics"]
        )
        self.assertEqual(
            catalog.ground(spec).metrics["electricity_used"]["unit"], "kWh"
        )
        provider.assert_called_once()

    def test_actual_lookup_sql_is_parameterized_bounded_and_read_only(self):
        from services.metadata_service import lookup_dimension_values

        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.fetchall.return_value = [{"value": "Synthetic Branch"}]
        with patch("services.metadata_service.get_db_conn", return_value=connection):
            self.assertEqual(
                lookup_dimension_values(
                    "silver.chi_nhanh", "ten_chi_nhanh", "Synthetic%", limit=999
                ),
                ["Synthetic Branch"],
            )
        connection.set_session.assert_called_once_with(readonly=True, autocommit=False)
        self.assertEqual(cursor.execute.call_args.args[1], ("%Synthetic\\%%", 8))
        connection.rollback.assert_called_once()
        connection.close.assert_called_once()
        with self.assertRaises(ValueError):
            lookup_dimension_values("orders.private_data", "email", "Somebody")

    def test_component_top_n_cannot_drift_during_chart_refinement(self):
        from services.analysis_understanding import refine_spec

        spec = AnalysisSpec.model_validate(
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
                    }
                ],
            )
        )
        with self.assertRaises(AnalysisError):
            refine_spec(
                spec,
                "Thêm biểu đồ",
                self.catalog,
                Mock(
                    return_value={
                        "operations": [
                            {"path": "/components/0/ranking/top_n", "value": 10}
                        ]
                    }
                ),
            )

    def test_component_populations_and_multiple_subjects_compile_independently(self):
        from pathlib import Path
        from tools.analysis_matrix import run_case

        cases = json.loads(
            (Path(__file__).parent / "fixtures/manual_analysis_cases.json").read_text()
        )
        for case in cases:
            if case["id"] in (
                "component_distinct_population",
                "multiple_subject_components",
            ):
                with self.subTest(case=case["id"]):
                    outcome = run_case(case)
                    self.assertTrue(outcome["pass"], outcome)
        case = next(c for c in cases if c["id"] == "component_distinct_population")
        spec, _ = understand(
            case["prompt"],
            self.catalog,
            Mock(return_value=case["expected_spec"]),
            reference_date=self.reference,
        )
        from services.analysis_query import build_plans

        plans = build_plans(
            self.catalog.ground(spec, today=self.reference), self.catalog
        )
        self.assertEqual(len(plans), 5)
        ranking = [p for p in plans if p.kind == "ranking"]
        self.assertEqual(len(ranking), 1)
        self.assertEqual(
            [f.value for f in ranking[0].filters if f.dimension == "city"], ["Hà Nội"]
        )
        self.assertEqual({p.period["start"] for p in plans}, {"2026-07-01"})

    def test_group_top_n_must_remain_attached_to_population(self):
        raw = ranking_spec(
            filters=[],
            time_range={"mode": "previous_quarter"},
            comparison_groups=[
                {
                    "name": "HN",
                    "top_n": 5,
                    "filters": [{"dimension": "city", "value": "Hà Nội"}],
                },
                {
                    "name": "CT",
                    "top_n": 3,
                    "filters": [{"dimension": "city", "value": "Cần Thơ"}],
                },
            ],
        )
        prompt = "Top 5 sản phẩm theo số lượng ở Hà Nội và top 3 sản phẩm theo số lượng ở Cần Thơ quý trước"
        spec, _ = understand(
            prompt, self.catalog, Mock(return_value=raw), reference_date=self.reference
        )
        self.assertEqual([g.top_n for g in spec.comparison_groups], [5, 3])
        raw["comparison_groups"][0]["top_n"] = 3
        raw["comparison_groups"][1]["top_n"] = 5
        with self.assertRaises(AnalysisError) as caught:
            understand(
                prompt,
                self.catalog,
                Mock(return_value=raw),
                reference_date=self.reference,
            )
        self.assertEqual(caught.exception.category, "ranking_scope_ambiguous")

    def test_refinement_cannot_silently_remove_component_filter(self):
        from services.analysis_understanding import refine_spec

        spec = AnalysisSpec.model_validate(
            ranking_spec(
                analysis_kind="composite",
                filters=[],
                components=[
                    {
                        "id": "ranking",
                        "kind": "ranking",
                        "metrics": ["quantity_sold"],
                        "dimensions": ["product"],
                        "filters": [{"dimension": "city", "value": "Hà Nội"}],
                        "ranking": {"metric": "quantity_sold", "top_n": 5},
                    }
                ],
            )
        )
        with self.assertRaises(AnalysisError):
            refine_spec(
                spec,
                "Thêm biểu đồ",
                self.catalog,
                Mock(
                    return_value={
                        "operations": [{"path": "/components/0/filters", "value": []}]
                    }
                ),
            )

        # The same city on another component must not authorize removing it
        # from this ranking component.
        from services.analysis_contract import Component

        spec.components.append(
            Component(
                id="comparison",
                kind="aggregate",
                metrics=["product_revenue"],
                filters=[{"dimension": "city", "value": "Hà Nội"}],
            )
        )
        with self.assertRaises(AnalysisError):
            refine_spec(
                spec,
                "Thêm biểu đồ",
                self.catalog,
                Mock(
                    return_value={
                        "operations": [{"path": "/components/0/filters", "value": []}]
                    }
                ),
            )

    def test_relative_refinements_keep_original_request_reference_date(self):
        from common import AiReportRefineRequest

        pipeline = AnalysisPipeline(planning_mode="legacy",
            metadata_loader=physical_metadata,
            provider=query_script([ranking_query(time={"kind": "month", "month": 9})]),
            executor=Mock(return_value=result(ranked_rows())),
        )
        request = AiTextToReportRequest(
            prompt="fixture", reference_date=date(2025, 2, 10)
        )
        proposal = pipeline.propose(request)
        request.session_id = proposal["session_id"]
        report = pipeline.generate(request)
        for mode, expected in [
            ("previous_quarter", "2024-10-01"),
            ("previous_year", "2024-01-01"),
        ]:
            q = ranking_query(
                time={"kind": "relative", "mode": mode},
                replaces="main",
                changed_fields=["time"],
            )
            pipeline.provider = ScriptedProvider(
                [
                    call("run_analysis", q, "q"),
                    call("finish_analysis", {"active_query_ids": ["main"]}, "f"),
                ]
            )
            report = pipeline.refine(
                AiReportRefineRequest(
                    current_report=report,
                    feedback="fixture",
                    session_id=report["session_id"],
                )
            )
            self.assertEqual(
                report["grounded_analysis_spec"]["period"]["start"], expected
            )
            self.assertEqual(report["diagnostics"]["reference_date"], "2025-02-10")

    def test_shared_top_n_does_not_guess_one_of_multiple_populations(self):
        raw = ranking_spec(
            filters=[],
            time_range={"mode": "previous_quarter"},
            comparison_groups=[
                {"name": v, "top_n": 5, "filters": [{"dimension": "city", "value": v}]}
                for v in ["Hà Nội", "Cần Thơ"]
            ],
        )
        spec, _ = understand(
            "Top 5 sản phẩm theo số lượng ở Hà Nội và Cần Thơ quý trước",
            self.catalog,
            Mock(return_value=raw),
            reference_date=self.reference,
        )
        self.assertEqual([g.top_n for g in spec.comparison_groups], [5, 5])


if __name__ == "__main__":
    unittest.main()
