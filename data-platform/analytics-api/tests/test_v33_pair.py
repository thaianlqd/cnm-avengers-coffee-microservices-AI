"""Governed association pair (revenue vs cancellation by store): resolver -> two SQL aggregates ->
unique-key pairing -> evidence -> paired scatter -> independent recompute, through the real pipeline."""
import copy
import unittest
from datetime import date
from unittest.mock import patch

import evals.fixture_warehouse as fw
from evals.fixture_warehouse import FixtureWarehouse
from services import chart_insight_service as cis
from tests import test_hybrid_v28 as f

STORES = ["s1", "s2", "s3", "s4", "s5"]


def orders_for(stores, per_store):
    """Independent oracle data: (completed, cancelled) counts per store, each completed order worth 100."""
    rows, n = [], 0
    for store, (done, cancelled) in zip(stores, per_store):
        for status, count in (("HOAN_THANH", done), ("DA_HUY", cancelled)):
            for _ in range(count):
                n += 1
                rows.append({"ma_don_hang": f"x{n}", "ma_nguoi_dung": "u1", "co_so_ma": store, "tong_tien": 100, "ma_voucher": None,
                             "so_tien_giam": 0, "trang_thai_don_hang": status, "loai_don_hang": "DUNG_TAI_CHO",
                             "ngay_tao": "2026-09-10T10:00:00"})
    return rows


class PairPipelineTests(f.unittest.TestCase):
    setUp = f.HybridTests.setUp
    pipeline = f.HybridTests.pipeline
    request = f.HybridTests.request

    def run_pair(self, per_store, stores=STORES):
        data = copy.deepcopy(fw.DATA)
        data["don_hang"] = orders_for(stores, per_store)
        data["chi_nhanh"] = [{**copy.deepcopy(fw.DATA["chi_nhanh"][0]), "ma_chi_nhanh": s, "ten_chi_nhanh": f"CN {s}"} for s in stores]
        req = f.requirement(id="pair", goal="Doanh thu và tỷ lệ hủy theo chi nhánh", domain_id="orders",
                            metric_ids=["revenue", "order_cancellation_rate"], dimension_ids=["store"], analysis_kind="relationship",
                            ranking=None, derived_features=["relationship_strength"], time={"kind": "month", "month": 9, "year": 2026})
        with patch.object(fw, "DATA", data):
            warehouse = FixtureWarehouse(self.catalog.overlay)
            self.addCleanup(warehouse.close)
            p = self.pipeline(f.scripted(f.envelope(req)), executor=warehouse)
            request = self.request("Doanh thu cao có làm tỷ lệ hủy thấp đi không", analysis_depth="focused")
            proposal = p.propose(request)
            f.approve(request, proposal)
            return p, proposal, p.generate(request)

    def test_valid_pair_produces_two_aggregates_a_unique_key_statistic_and_a_paired_scatter(self):
        # revenue per store = 100 * completed; cancellation rate = cancelled / (done+cancelled)
        counts = [(9, 1), (8, 2), (6, 4), (5, 5), (3, 7)]
        p, proposal, report = self.run_pair(counts)
        self.assertEqual(report["status"], "success")
        self.assertEqual(len(report["analytical_queries"]), 2)  # two separate aggregates, no shared/raw join
        pearson = next(e for e in report["evidence"] if e["feature"] == "pearson")
        revenue = [100 * d for d, _ in counts]
        rate = [100 * c / (d + c) for d, c in counts]
        mx, my = sum(revenue) / 5, sum(rate) / 5
        oracle = sum((a - mx) * (b - my) for a, b in zip(revenue, rate)) / (sum((a - mx) ** 2 for a in revenue) * sum((b - my) ** 2 for b in rate)) ** 0.5
        self.assertAlmostEqual(pearson["values"]["r"], oracle, places=3)
        self.assertEqual(pearson["values"]["n"], 5)
        self.assertEqual(set(pearson["values"]["populations"]), {"revenue", "order_cancellation_rate"})
        scatter = next(c for c in report["charts"] if c.get("pair"))
        self.assertEqual(len(scatter["data"]), 5)
        self.assertEqual(sorted(scatter["scope_refs"]), sorted(pearson["values"]["query_ids"]))
        self.assertIn("không chứng minh nguyên nhân", pearson["statement"])
        self.assertEqual(report["verification"]["grounding"]["unsupported_claims"], [])

    def test_large_pair_keeps_bounded_scatter_and_full_statistic_after_transport(self):
        stores=[f's{i:04}' for i in range(1215)]
        _, _, report=self.run_pair([(1+i%9,1+i%3) for i in range(1215)], stores=stores)
        chart=next(c for c in report['charts'] if c.get('pair'))
        self.assertEqual(chart['pair']['n'],1215)
        self.assertEqual(chart['population_count'],1215)
        self.assertLessEqual(len(chart['data']),200)
        self.assertEqual(report['verification']['status'],'verified')
        self.assertTrue(all(v['status']=='satisfied' for v in report['view_coverage'] if v['required']))
        self.assertTrue(all(c['passed']==c['total'] for c in report['quality_assessment']['verification_checks'] if c['id']=='evidence_grounding'))

    def test_small_sample_is_disclosed(self):
        _, _, report = self.run_pair([(9, 1), (6, 4), (3, 7)], stores=STORES[:3])
        pearson = next(e for e in report["evidence"] if e["feature"] == "pearson")
        self.assertTrue(pearson["values"]["small_sample"]); self.assertIn("Mẫu nhỏ", pearson["statement"])

    def test_two_stores_is_not_enough_for_a_coefficient_and_is_not_full_success(self):
        _, _, report = self.run_pair([(9, 1), (3, 7)], stores=STORES[:2])
        self.assertFalse([e for e in report["evidence"] if e["feature"] == "pearson"])
        status = next(e for e in report["evidence"] if e["feature"] == "pair_status")
        self.assertEqual(status["values"]["status"], "insufficient_pairs")
        self.assertFalse([c for c in report["charts"] if c.get("pair")])
        self.assertNotEqual(report["quality_assessment"]["status"], "verified")  # required association evidence missing

    def test_constant_rate_has_zero_variance_and_no_fake_coefficient(self):
        _, _, report = self.run_pair([(8, 2), (4, 1), (12, 3)], stores=STORES[:3])  # every store cancels 20%
        status = next(e for e in report["evidence"] if e["feature"] == "pair_status")
        self.assertEqual(status["values"]["status"], "zero_variance")
        self.assertFalse([e for e in report["evidence"] if e["feature"] == "pearson"])


class PairVerificationTests(unittest.TestCase):
    def test_mutated_pair_statistic_is_detected_by_independent_recompute(self):
        from tests.analysis_fixtures import result
        from tests.test_agent_v22 import fixture_artifact, query
        a, _ = fixture_artifact(query("orders", "revenue", group_by=["store", "store_id"]))
        b, _ = fixture_artifact(query("orders", "order_cancellation_rate", group_by=["store", "store_id"]))
        b.query.id = "main_b"
        a.result = result([{"store": f"s{i}", "store_id": f"id{i}", "revenue": float(v)} for i, v in enumerate([10, 20, 30, 40])])
        b.result = result([{"store": f"s{i}", "store_id": f"id{i}", "order_cancellation_rate": float(v)} for i, v in enumerate([4, 3, 2, 1])])
        arts = {"main": a, "main_b": b}
        calc = {"kind": "pair_pearson", "query_ids": ["main", "main_b"], "key": ["store_id"], "metrics": ["revenue", "order_cancellation_rate"], "n": 4}
        good = {"key_facts": [{"text": "r", "value": -1.0, "evidence_ref": "main:revenue~order_cancellation_rate:pearson", "calc": calc}]}
        self.assertEqual(cis.verify_insights([good], arts)["unsupported"], [])
        bad = copy.deepcopy(good); bad["key_facts"][0]["value"] = 0.9
        self.assertTrue(cis.verify_insights([bad], arts)["unsupported"])
        b.result["rows"][0]["store_id"] = "id1"  # duplicate key invalidates the pair
        self.assertTrue(cis.verify_insights([good], arts)["unsupported"])


if __name__ == "__main__":
    unittest.main()


class DriverPipelineTests(f.unittest.TestCase):
    setUp = f.HybridTests.setUp
    pipeline = f.HybridTests.pipeline
    request = f.HybridTests.request

    def run_driver(self, august, september, time=None, stores=("s1", "s2", "s3")):
        """august/september: {store: completed_orders}; each completed order = 100 VND."""
        data = copy.deepcopy(fw.DATA)
        rows, n = [], 0
        for month, counts in ((8, august), (9, september)):
            for store, count in counts.items():
                for _ in range(count):
                    n += 1
                    rows.append({"ma_don_hang": f"d{n}", "ma_nguoi_dung": "u1", "co_so_ma": store, "tong_tien": 100, "ma_voucher": None,
                                 "so_tien_giam": 0, "trang_thai_don_hang": "HOAN_THANH", "loai_don_hang": "DUNG_TAI_CHO",
                                 "ngay_tao": f"2026-0{month}-10T10:00:00"})
        data["don_hang"] = rows
        data["chi_nhanh"] = [{**copy.deepcopy(fw.DATA["chi_nhanh"][0]), "ma_chi_nhanh": s, "ten_chi_nhanh": f"CN {s}"} for s in stores]
        req = f.requirement(id="drv", goal="Vì sao doanh thu thay đổi", domain_id="orders", metric_ids=["revenue"], dimension_ids=["store"],
                            analysis_kind="aggregate", ranking=None, derived_features=["driver_delta"],
                            time=time or {"kind": "month", "month": 9, "year": 2026})
        with patch.object(fw, "DATA", data):
            warehouse = FixtureWarehouse(self.catalog.overlay)
            self.addCleanup(warehouse.close)
            p = self.pipeline(f.scripted(f.envelope(req)), executor=warehouse)
            request = self.request("Vì sao doanh thu tháng 9 thay đổi", analysis_depth="focused")
            proposal = p.propose(request)
            f.approve(request, proposal)
            return p, proposal, p.generate(request)

    def test_decline_is_proven_decomposed_and_reconciled_against_independent_totals(self):
        _, _, report = self.run_driver({"s1": 10, "s2": 8, "s3": 4}, {"s1": 6, "s2": 9, "s3": 1})
        self.assertEqual(len(report["analytical_queries"]), 4)  # grouped x2 + independent totals x2
        e = next(x for x in report["evidence"] if x["feature"] == "driver_delta")
        v = e["values"]
        self.assertEqual((v["current_total"], v["previous_total"], v["total_delta"]), (1600.0, 2200.0, -600.0))  # oracle: 100*(16 vs 22)
        self.assertEqual(v["direction"], "down"); self.assertTrue(v["reconciled"])
        self.assertEqual({d["group"]: d["delta"] for d in v["drivers"]}, {"CN s1": -400.0, "CN s2": 100.0, "CN s3": -300.0})
        self.assertAlmostEqual(sum(d["delta"] for d in v["drivers"]), v["total_delta"])
        self.assertIn("giảm", e["statement"]); self.assertIn("không khẳng định nguyên nhân", e["statement"])
        self.assertTrue(any(c.get("value_transform") == "signed_delta" for c in report["charts"]))

    def test_no_decline_is_claimed_when_revenue_rose(self):
        _, _, report = self.run_driver({"s1": 4, "s2": 4, "s3": 2}, {"s1": 6, "s2": 5, "s3": 3})
        e = next(x for x in report["evidence"] if x["feature"] == "driver_delta")
        self.assertEqual(e["values"]["direction"], "up"); self.assertNotIn("giảm", e["statement"])

    def test_missing_baseline_is_a_limitation_not_a_conclusion(self):
        _, _, report = self.run_driver({}, {"s1": 6, "s2": 5, "s3": 3})
        self.assertFalse([x for x in report["evidence"] if x["feature"] == "driver_delta"])
        status = next(x for x in report["evidence"] if x["feature"] == "driver_status")
        self.assertEqual(status["values"]["status"], "baseline_missing"); self.assertIn("không kết luận", status["statement"])
        self.assertNotEqual(report["quality_assessment"]["status"], "verified")


class ViewCoveragePipelineTests(PairPipelineTests):
    def test_pair_view_is_satisfied_end_to_end_and_reported_in_verification(self):
        _, _, report = self.run_pair([(9, 1), (8, 2), (6, 4), (5, 5), (3, 7)])
        kinds = {(v["kind"], v["status"]) for v in report["view_coverage"]}
        self.assertIn(("paired_scatter", "satisfied"), kinds)
        metric = next(m for m in report["verification"]["metrics"] if m["id"] == "view_coverage")
        self.assertEqual(metric["passed"], metric["total"])

    def test_missing_required_view_is_listed_with_a_reason_and_in_the_conclusion(self):
        _, _, report = self.run_pair([(9, 1), (3, 7)], stores=STORES[:2])   # 2 stores: no coefficient => no pair chart
        missing = [v for v in report["view_coverage"] if v["kind"] == "paired_scatter"]
        self.assertTrue(missing and all(v["status"] == "missing" and v["reason"] for v in missing))
        self.assertEqual(report["verification"]["status"], "attention")
        self.assertIn("Chưa có góc nhìn bắt buộc", " ".join(report["conclusion"]["caveats"]))


class ConclusionAnswersDriverAndPairTests(DriverPipelineTests):
    def test_the_conclusion_answers_the_driver_question_directly(self):
        _, _, report = self.run_driver({"s1": 10, "s2": 8, "s3": 4}, {"s1": 6, "s2": 9, "s3": 1})
        self.assertIn("giảm", report["conclusion"]["answer"]); self.assertIn("không khẳng định nguyên nhân", report["conclusion"]["answer"])
        self.assertTrue(report["conclusion"]["evidence_ids"])
        self.assertEqual(report["verification"]["conclusion"]["dangling"], [])

    def test_baseline_missing_is_stated_in_the_conclusion_not_hidden(self):
        _, _, report = self.run_driver({}, {"s1": 6, "s2": 5, "s3": 3})
        self.assertIn("không kết luận tăng hay giảm", report["conclusion"]["answer"])


class RequiredViewCompletionTests(PairPipelineTests):
    def test_a_missing_required_view_makes_the_report_partial_not_complete(self):
        _, _, report = self.run_pair([(9, 1), (3, 7)], stores=STORES[:2])
        self.assertEqual(report["completion_status"], "partial")
        _, _, full = self.run_pair([(9, 1), (8, 2), (6, 4), (5, 5), (3, 7)])
        self.assertEqual(full["completion_status"], "complete")
