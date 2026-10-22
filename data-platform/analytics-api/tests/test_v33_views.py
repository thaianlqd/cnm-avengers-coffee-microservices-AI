import unittest
from types import SimpleNamespace

from services.view_requirement_service import view_coverage


def art(rows):
    return SimpleNamespace(result={"rows": rows})


class ViewCoverageTests(unittest.TestCase):
    def test_capacity_table_can_preserve_requested_trend_but_never_hide_static_disagreement(self):
        a=SimpleNamespace(result={'rows':[{'period':'2026-09-01','revenue':1},{'period':'2026-09-08','revenue':2}]},
                          plan=SimpleNamespace(dimensions=['store']))
        coverage=[{'requirement_id':'trend','operation_ids':['q'],'views':[{'kind':'time_series','metric_ids':['revenue'],'dimension_ids':['store'],'required':True}]}]
        table=[{'query_id':'q','reason':'validated_result','metrics':['revenue']}]
        good=view_coverage(coverage,[],{'q':a},[{'query_id':'q','reason':'series_budget'}],table)
        self.assertEqual(good[0]['status'],'satisfied');self.assertEqual(good[0]['reason'],'validated_table_for_capacity')
        for reason in ('outside_mission_evidence','no_chart_for_view'):
            self.assertEqual(view_coverage(coverage,[],{'q':a},[{'query_id':'q','reason':reason}],table)[0]['status'],'missing')
    def test_satisfied_scalar_needs_no_chart_and_missing_views_carry_a_specific_reason(self):
        coverage = [{"requirement_id": "a", "operation_ids": ["q1"], "views": [{"kind": "scalar", "required": True}]},
                    {"requirement_id": "b", "operation_ids": ["q2"], "views": [{"kind": "grouped", "required": True}]},
                    {"requirement_id": "c", "operation_ids": ["q3"], "views": [{"kind": "time_series", "required": False}]},
                    {"requirement_id": "d", "operation_ids": ["q4"], "views": [{"kind": "paired_scatter", "required": True}]}]
        arts = {"q1": art([{"v": 1}]), "q2": art([{"v": 1}]), "q3": art([]), "q4": art([{"v": 1}])}
        charts = [{"scope_ref": "q2", "chart_type": "horizontal_bar"}]
        got = {i["requirement_id"]: i for i in view_coverage(coverage, charts, arts, omitted=[{"query_id": "q4", "reason": "chart_budget"}])}
        self.assertEqual(got["a"]["status"], "satisfied")
        self.assertEqual(got["b"]["status"], "satisfied")
        self.assertEqual((got["c"]["status"], got["c"]["reason"], got["c"]["required"]), ("missing", "no_rows", False))
        self.assertEqual((got["d"]["status"], got["d"]["reason"]), ("missing", "chart_budget"))

    def test_a_pair_view_is_only_satisfied_by_a_paired_chart_and_a_driver_view_by_a_signed_delta_chart(self):
        coverage = [{"requirement_id": "p", "operation_ids": ["q1", "q2"], "views": [{"kind": "paired_scatter", "required": True}]},
                    {"requirement_id": "d", "operation_ids": ["q3"], "views": [{"kind": "driver_delta", "required": True}]}]
        arts = {k: art([{"v": 1}]) for k in ("q1", "q2", "q3")}
        plain = [{"scope_ref": "q1", "chart_type": "scatter"}, {"scope_ref": "q3", "chart_type": "horizontal_bar"}]
        self.assertEqual([i["status"] for i in view_coverage(coverage, plain, arts)], ["missing", "missing"])
        real = [{"scope_ref": "q1", "scope_refs": ["q1", "q2"], "chart_type": "scatter", "pair": {"n": 5}},
                {"scope_ref": "q3", "chart_type": "horizontal_bar", "value_transform": "signed_delta"}]
        self.assertEqual([i["status"] for i in view_coverage(coverage, real, arts)], ["satisfied", "satisfied"])


if __name__ == "__main__":
    unittest.main()
