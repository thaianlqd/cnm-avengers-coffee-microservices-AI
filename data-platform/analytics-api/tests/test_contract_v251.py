"""Real boundary/context regression; scripted meaning, forbidden external I/O."""

import json
import os
import unittest
from copy import deepcopy
from unittest.mock import Mock, patch
from pydantic import ValidationError
from common import AiTextToReportRequest, AiReportRefineRequest
from services.analysis_catalog import AnalysisCatalog, AnalysisError
from services.analysis_pipeline import AnalysisPipeline, safe_failure
from services.analysis_contract import Filter
from services.analyst_decision import DecisionOperation, decision_tool
from services.analytical_tool_contract import ToolContractError
from services.decision_boundary_normalizer import normalize_operation
from services.domain_intelligence_service import DomainIntelligence
from services.semantic_manifest_service import build_manifest, manifest_references, provider_manifest, compact
from services.agent_provider import NativeAgentProvider, gemini_tool_schema
from tests.analysis_fixtures import physical_metadata
from tests.test_agent_v22 import REFERENCE
from tests.test_agent_v23 import fixture_executor, simple_query
from tests.test_one_shot_v24 import decision, scripted, deep_sales_queries

LIVE_QUESTION = "Đánh giá toàn diện hoạt động kinh doanh TP.HCM quý trước so với Hà Nội, phân tích doanh thu và đơn hàng, hiệu suất chi nhánh, sản phẩm, voucher và thanh toán; chỉ ra các điểm cần chú ý."
LIVE_DOMAINS = {"orders", "stores", "products", "promotions", "payments"}


def live_queries(alias=False):
    filters = [{"field" if alias else "dimension": "city", "operator": "in", "value": ["Hồ Chí Minh", "Hà Nội"]}]
    time = {"kind": "relative", "mode": "previous_quarter"}
    definitions = [
        ("sales", "orders", ["revenue"], ["city"]),
        ("orders_count", "orders", ["order_count"], ["city"]),
        ("branches", "stores", ["store_revenue"], ["store"]),
        ("products", "products", ["quantity_sold", "product_revenue"], ["product"]),
        ("vouchers", "promotions", ["discount_amount"], ["promotion"]),
        ("payments", "payments", ["payment_count", "payment_revenue"], ["payment_gateway"]),
    ]
    return [{"id": id, "subject": subject, "operation": "aggregate", "metrics": metrics,
             "group_by": groups, "filters": deepcopy(filters), "time": time}
            for id, subject, metrics, groups in definitions]


class ContractV251Tests(unittest.TestCase):
    def setUp(self):
        for name in ("requests.sessions.Session.request", "psycopg2.connect"):
            guard = patch(name, side_effect=AssertionError("External I/O forbidden"))
            guard.start(); self.addCleanup(guard.stop)
        config = patch.dict(os.environ, {"AI_OFFLINE": "1", "DATA_ANALYST_SEMANTIC_MANIFEST_MAX_CHARS": "10000", "DATA_ANALYST_ONE_SHOT_CONTEXT_MAX_CHARS": "24000"})
        config.start(); self.addCleanup(config.stop)
        models = patch("services.llm_service.GEMINI_MODELS", ["configured_model"])
        models.start(); self.addCleanup(models.stop)
        self.catalog = AnalysisCatalog(physical_metadata())
        self.intelligence = DomainIntelligence(self.catalog)
        self.manifest = build_manifest(self.catalog)[0]
        self.refs = manifest_references(self.manifest)

    def request(self, **updates):
        return AiTextToReportRequest(prompt=LIVE_QUESTION, reference_date=REFERENCE,
                                    **{"analysis_depth": "comprehensive", "domain": "multi", **updates})

    def pipeline(self, value, executor=None):
        return AnalysisPipeline(metadata_loader=physical_metadata, provider=scripted(value),
                                executor=executor or Mock(), value_lookup=Mock(return_value=[]))

    def reject(self, value):
        p = self.pipeline(value)
        with self.assertRaises(AnalysisError) as caught:
            p.propose(self.request())
        failed = safe_failure(caught.exception, p.calls, p.semantic_info)
        self.assertEqual(failed["diagnostics"]["terminal_error"], "invalid_analysis_contract")
        self.assertEqual(p.provider.call_count, 1)
        p.executor.assert_not_called()
        return failed

    def test_boundary_is_idempotent_bounded_and_value_preserving(self):
        for value in ("Hà Nội", ["Hồ Chí Minh", "Hà Nội"], 4, False):
            raw = {"filters": [{"field": "city", "value": value}]}
            before = deepcopy(raw)
            normalized, rules = normalize_operation(raw)
            self.assertEqual(raw, before)
            self.assertEqual(normalized["filters"][0], {"dimension": "city", "value": value})
            self.assertEqual(rules, ["filter_field_to_dimension"])
            self.assertEqual(normalize_operation(normalized), (normalized, []))
        with self.assertRaises(ToolContractError):
            normalize_operation({"filters": [{"field": "city"}] * 13})
        for raw in ([], "field", None):
            with self.assertRaises(ToolContractError): normalize_operation(raw)

    def test_equal_alias_removed_and_conflict_never_guessed(self):
        raw = {"filters": [{"dimension": "city", "field": "city", "value": "Hà Nội"}]}
        normalized, rules = normalize_operation(raw)
        self.assertNotIn("field", normalized["filters"][0])
        self.assertEqual(rules, ["redundant_filter_field_removed"])
        for field, dimension in (("city", "store"), (None, "city"), (True, 1)):
            with self.assertRaises(ToolContractError) as caught:
                normalize_operation({"filters": [{"field": field, "dimension": dimension}]})
            self.assertEqual(caught.exception.issues, [{"path": "filters.dimension", "code": "conflicting_filter_dimension"}])

    def test_internal_filter_remains_strict_and_other_aliases_reject(self):
        with self.assertRaises(ValidationError): Filter.model_validate({"field": "city", "value": "Hà Nội"})
        for alias in ("column", "property", "key", "attribute", "dimension_name", "field_name"):
            q = live_queries()[0]
            q["filters"] = [{alias: "city", "operator": "in", "value": ["Hà Nội"]}]
            self.reject(decision([q]))

    def test_operator_value_shapes_are_not_reinterpreted(self):
        for operator, value in [("in", "Hà Nội"), *[(op, ["Hà Nội"]) for op in ("eq", "gt", "gte", "lt", "lte")], ("eq", {"nested": 1}), ("in", [])]:
            q = live_queries(True)[0]
            q["filters"][0].update(operator=operator, value=value)
            self.reject(decision([q]))

    def test_exact_live_alias_reaches_proposal_with_five_domains(self):
        p = self.pipeline(decision([live_queries(True)[0]]))
        response = p.propose(self.request(time_range={"mode": "previous_quarter"}))
        self.assertEqual(response["status"], "proposal_ready")
        d = response["diagnostics"]
        self.assertEqual(d["contract_normalization_count"], 1)
        self.assertEqual(d["contract_normalizations"], ["filter_field_to_dimension"])
        self.assertEqual({c["id"] for c in d["strong_domain_candidates"]}, LIVE_DOMAINS)
        self.assertTrue(LIVE_DOMAINS <= set(d["full_domain_pack_ids"] + d["compact_domain_pack_ids"]))
        self.assertEqual(d["global_domain_count"], 16)
        # V2.7 carries richer business definitions and explicit coverage. Keep
        # bounded headroom without discarding mandatory five-domain semantics.
        self.assertGreaterEqual(d["provider_body_headroom_chars"], 1000)
        req = p.provider.requests[0]
        native = NativeAgentProvider()
        sizes = {"native": len(compact(native._gemini_body(**req))), "compat": len(compact(native._gemini_compat_body(**req, model="configured_model")))}
        self.assertEqual(sizes, d["provider_body_chars"])
        self.assertEqual(max(sizes.values()), d["total_context_chars"])
        self.assertLessEqual(max(sizes.values()), 24000)
        payload = json.loads(req["messages"][0]["content"])
        self.assertEqual(payload["request"], LIVE_QUESTION)
        self.assertNotIn("strong_domain_candidates", payload)
        directory = dict(payload["domains"]["directory"])
        for pack in payload["domains"]["packs"]:
            if pack["id"] in LIVE_DOMAINS:
                self.assertTrue(directory[pack["id"]])
                self.assertTrue(pack["lenses"])
                self.assertTrue(set(pack["caveats"]) <= payload["domains"]["caveat_meanings"].keys())
                if pack["tier"] == "compact":
                    self.assertNotIn("metrics", pack)
                    self.assertNotIn("dimensions", pack)
                    subjects = {s[0]: s[1] for s in payload["manifest"]["subjects"]}
                    self.assertTrue(all(subjects.get(s) for s in pack["subjects"]))
                    self.assertTrue(payload["manifest"]["dimension_sets"])
        for key in ("contract_repair_count", "model_escalation_count", "provider_fallback_count", "db_query_count", "post_result_provider_call_count"):
            self.assertEqual(d[key], 0)
        self.assertEqual(p.provider.call_count, 1)
        p.executor.assert_not_called()

    def test_six_requested_domains_preserve_scope_time_through_approval(self):
        canonical = live_queries()
        p = self.pipeline(decision(live_queries(True)), fixture_executor(canonical))
        req = self.request(time_range={"mode": "previous_quarter"})
        proposal = p.propose(req)
        p.executor.assert_not_called()
        self.assertEqual(proposal["diagnostics"]["requested_operation_count"], 6)
        self.assertEqual(proposal["diagnostics"]["contract_normalization_count"], 6)
        req.session_id = proposal["session_id"]
        report = p.generate(req)
        self.assertEqual(set(report["result_sets"]), {q["id"] for q in canonical})
        self.assertGreaterEqual(len(report["charts"]), 6)
        self.assertEqual(report["diagnostics"]["provider_call_count"], 0)
        self.assertEqual(p.provider.call_count, 1)
        self.assertEqual(p.executor.call_count, 6)
        for q in report["analytical_queries"]:
            self.assertEqual(q["filters"], canonical[0]["filters"])
            self.assertEqual({k: v for k, v in q["time"].items() if v is not None}, canonical[0]["time"])

    def test_requested_conflict_atomic_optional_conflict_nonblocking(self):
        q = live_queries()[0]
        bad = deepcopy(q); bad["id"] = "conflict"; bad["filters"][0]["field"] = "store"
        failed = self.reject(decision([q, bad]))
        self.assertIn({"path": "filters.dimension", "code": "conflicting_filter_dimension"}, failed["diagnostics"]["contract_issues"])
        bad.update(role="supporting", parent_id="sales", purpose="context")
        p = self.pipeline(decision([q, bad]))
        d = p.propose(self.request())["diagnostics"]
        self.assertEqual(d["requested_operation_count"], 1)
        self.assertEqual(d["omitted_supporting_operation_count"], 1)
        self.assertNotIn("Hồ Chí Minh", compact(d["omitted_supporting_operations"]))

    def test_alias_unknown_value_is_semantic_clarification_without_second_call(self):
        q = live_queries(True)[0]; q["filters"][0]["value"] = ["Unknown-City-Q91"]
        p = self.pipeline(decision([q]))
        with self.assertRaises(AnalysisError) as caught: p.propose(self.request())
        failed = safe_failure(caught.exception, p.calls, p.semantic_info)
        self.assertEqual(failed["status"], "needs_clarification")
        self.assertEqual(failed["diagnostics"]["contract_normalizations"], ["filter_field_to_dimension"])
        self.assertEqual(failed["diagnostics"]["contract_normalization_count"], 1)
        self.assertEqual(p.provider.call_count, 1)
        p.executor.assert_not_called()

    def test_alias_supports_inherit_scope_and_depth_limit_is_global(self):
        queries = deep_sales_queries()
        for q in queries:
            for f in q["filters"]:
                if "dimension" in f: f["field"] = f.pop("dimension")
        p = self.pipeline(decision(queries))
        d = p.propose(self.request(analysis_depth="deep"))["diagnostics"]
        self.assertEqual(d["supporting_operation_count"], 5)
        self.assertEqual(d["contract_normalization_count"], 6)
        main = live_queries()[0]
        second = deepcopy(main); second["id"] = "second"
        supports = [{**main, "id": "support_" + str(i), "role": "supporting", "parent_id": "sales" if i == 0 else "second", "purpose": "context"} for i in range(2)]
        d = self.pipeline(decision([main, second, *supports])).propose(self.request(analysis_depth="focused"))["diagnostics"]
        self.assertEqual(d["supporting_operation_count"], 1)
        self.assertEqual(d["omitted_supporting_operation_count"], 1)

    def test_oversized_optional_array_is_bounded_without_losing_requested(self):
        value = decision([live_queries()[0]], supporting_operations=[None] * 100)
        p = self.pipeline(value)
        d = p.propose(self.request())["diagnostics"]
        self.assertEqual(d["requested_operation_count"], 1)
        self.assertEqual(d["omitted_supporting_operation_count"], 100)
        self.assertLessEqual(len(d["omitted_supporting_operations"]), 12)
        self.assertEqual(p.provider.call_count, 1)

    def test_wire_filters_and_new_vs_refinement_schema(self):
        fresh = decision_tool(refinement=False, supporting_limit=1)
        refined = decision_tool(refinement=True, supporting_limit=6)
        for tool in (fresh, refined):
            schema = gemini_tool_schema(tool)
            fields = schema["properties"]["requested_operations"]["items"]["properties"]["filters"]["items"]["properties"]
            self.assertEqual(set(fields), {"dimension", "operator", "value"})
            self.assertIn("never 'field'", fields["dimension"]["description"])
            self.assertIn("scalar", fields["operator"]["description"])
            request = {"system": "fixture", "messages": [{"role": "user", "content": "fixture"}], "tools": [tool]}
            native = NativeAgentProvider()
            for body in (native._gemini_body(**request), native._gemini_compat_body(**request, model="fixture")):
                self.assertIn("never 'field'", compact(body))
        self.assertLess(len(compact(fresh)), len(compact(refined)))
        properties = fresh["parameters"]["properties"]
        self.assertNotIn("removed_query_ids", properties)
        self.assertNotIn("changed_fields", properties["requested_operations"]["items"]["properties"])
        self.assertIn("At most 1", properties["supporting_operations"]["description"])

    def test_manifest_wire_compatibility_sets_are_lossless(self):
        original = deepcopy(self.manifest)
        wire = provider_manifest(self.manifest)
        decoded = []
        for row in wire["dimension_sets"]:
            if isinstance(row, list): decoded.append(set(row))
            else:
                self.assertIsInstance(wire["dimension_sets"][row["base"]], list)
                decoded.append((decoded[row["base"]] - set(row.get("remove", []))) | set(row.get("add", [])))
        self.assertEqual(decoded, list(map(set, self.manifest["dimension_sets"])))
        self.assertEqual(self.manifest, original)
        self.assertEqual({r[0] for r in wire["metrics"]}, {r[0] for r in original["metrics"]})
        self.assertEqual(manifest_references(wire), self.refs)

    def test_priority_pruning_independent_of_pack_generation_order(self):
        candidates = self.intelligence.candidates(LIVE_QUESTION, "multi", "comprehensive")
        contexts = []
        for reverse in (False, True):
            knowledge = self.intelligence.context(LIVE_QUESTION, "multi", "comprehensive", self.refs, candidates=candidates, max_chars=100000)
            if reverse: knowledge["packs"].reverse()
            omitted = []
            while self.intelligence.degrade(knowledge, candidates, omitted, self.refs): pass
            self.assertEqual({p["id"] for p in knowledge["packs"]}, LIVE_DOMAINS)
            self.assertTrue(all(p["tier"] == "compact" for p in knowledge["packs"]))
            contexts.append(omitted)
        self.assertEqual(*contexts)

    def test_selected_domain_priority_and_pack_cache_isolation(self):
        for domain in ("promotions", "payments"):
            candidates = self.intelligence.candidates("Unseen question", domain, "deep")
            self.assertEqual((candidates[0]["id"], candidates[0]["priority"], candidates[0]["protected"]), (domain, 1, True))
            knowledge = self.intelligence.context("Unseen question", domain, "deep", self.refs, candidates=candidates)
            main = next(p for p in knowledge["packs"] if p["id"] == domain)
            self.assertEqual(main["tier"], "full")
            profile = self.intelligence.available()[domain]
            full = self.intelligence.pack(profile, self.refs)
            minimal = self.intelligence.pack(profile, self.refs, "compact")
            full["lenses"].clear(); minimal["lenses"].clear()
            self.assertTrue(self.intelligence.pack(profile, self.refs)["lenses"])
            self.assertTrue(self.intelligence.pack(profile, self.refs, "compact")["lenses"])

    def test_tiny_budget_fails_before_provider_not_silent_coverage_loss(self):
        p = self.pipeline(decision(live_queries(True)))
        with patch.dict(os.environ, {"DATA_ANALYST_ONE_SHOT_CONTEXT_MAX_CHARS": "1000"}):
            with self.assertRaises(AnalysisError) as caught: p.propose(self.request())
        self.assertEqual(caught.exception.category, "one_shot_context_budget_exceeded")
        self.assertEqual(p.provider.call_count, 0)
        p.executor.assert_not_called()

    def test_focused_retrieval_does_not_expand_to_unrelated_domains(self):
        for question in ("Top 5 sản phẩm bán chạy tại TP.HCM", "Top 5 sản phẩm bán chạy nhất tại thành phố Hồ Chí Minh."):
            candidates = self.intelligence.candidates(question, "auto", "focused")
            self.assertEqual({c["id"] for c in candidates}, {"products"})

    def test_metadata_entity_and_metric_aliases_supply_direct_evidence(self):
        for kind, id, category in (("dimensions", "driver_id", "entity_alias_match"), ("metrics", "payment_count", "metric_alias_match")):
            overlay = deepcopy(self.catalog.overlay)
            overlay["analysis_registry"][kind][id]["aliases"] = ["UnseenCatalogTokenQ731"]
            intelligence = DomainIntelligence(AnalysisCatalog(physical_metadata(), overlay))
            direct = [c for c in intelligence.candidates("UnseenCatalogTokenQ731", "auto", "focused") if c["protected"]]
            self.assertEqual(len(direct), 1)
            self.assertEqual(direct[0]["match_category"], category)

    def test_alias_does_not_override_structured_scope_or_time(self):
        q = live_queries(True)[0]
        for ui in ({"analysis_scope": {"mode": "selected", "filters": [{"dimension": "city", "value": "Hà Nội"}]}}, {"time_range": {"mode": "current_month"}}):
            p = self.pipeline(decision([q]))
            with self.assertRaises(AnalysisError): p.propose(self.request(**ui))
            self.assertEqual(p.provider.call_count, 1)
            p.executor.assert_not_called()

    def test_equal_alias_is_recorded_in_proposal_diagnostics(self):
        q = live_queries(True)[0]; q["filters"][0]["dimension"] = "city"
        d = self.pipeline(decision([q])).propose(self.request())["diagnostics"]
        self.assertEqual(d["contract_normalizations"], ["redundant_filter_field_removed"])
        self.assertEqual(d["contract_normalization_count"], 1)

    def test_refinement_alias_keeps_previous_time_and_single_provider_turn(self):
        canonical = live_queries()[0]
        revised = {**canonical, "id": "refined", "filters": [{"dimension": "city", "value": "Hà Nội"}]}
        p = self.pipeline(decision([canonical]), fixture_executor([canonical, revised]))
        req = self.request()
        proposal = p.propose(req)
        p.executor.assert_not_called()
        req.session_id = proposal["session_id"]
        report = p.generate(req)
        p.provider = scripted(decision(requested_operations=[{"id": "refined", "replaces": "sales", "changed_fields": ["filters"], "filters": [{"field": "city", "value": "Hà Nội"}]}]))
        response = p.refine(AiReportRefineRequest(session_id=req.session_id, current_report={"revision": report["revision"]}, feedback="Chỉ Hà Nội"))
        q = response["analytical_queries"][0]
        self.assertEqual(q["time"]["mode"], "previous_quarter")
        self.assertEqual(q["filters"], [{"dimension": "city", "operator": "eq", "value": "Hà Nội"}])
        self.assertEqual(p.provider.call_count, 1)
        self.assertEqual(p.executor.call_count, 2)


if __name__ == "__main__":
    unittest.main()
