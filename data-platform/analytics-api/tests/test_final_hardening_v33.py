"""V3.3 cross-entry invariants over the case matrix (offline; spies on the real provider and executor boundaries)."""
import json
import pathlib
import unittest
import unittest.mock
from datetime import date
from unittest.mock import Mock, patch

from common import AiTextToReportRequest
from services import preflight_service
from services.agent_pipeline import AnalysisPipeline
from services.analysis_catalog import AnalysisError

CASES = json.loads((pathlib.Path(__file__).parents[1] / "evals/semantic_cases_v33.json").read_text())["cases"]
REFERENCE = date(2026, 10, 16)
COVERAGE = {"status": "ready", "overall": {"min_date": "2026-01-01", "max_date": "2026-10-16"}, "facts": {},
            "freshness": {"mode": "batch", "stale": False}}


class CrossEntryInvariantTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = preflight_service.preflight_catalog()

    def preflight(self, case):
        return preflight_service.run(case["q"], None, case.get("scope"), case.get("mission"), REFERENCE,
                                     catalog=self.catalog, coverage=COVERAGE)

    def pipeline(self):
        pipeline = AnalysisPipeline.__new__(AnalysisPipeline)
        pipeline.semantic_info, pipeline.provider, pipeline.executor = {}, Mock(), Mock()
        pipeline.planning_mode = "one_shot"
        return pipeline

    def request(self, case):
        data = {"prompt": case["q"]}
        if case.get("mission"):
            data["analysis_mission"] = case["mission"]
        if case.get("scope"):
            data["analysis_scope"] = case["scope"]
        return AiTextToReportRequest(**data)

    def test_preflight_decision_and_blocking_codes_match_the_matrix(self):
        for case in CASES:
            with self.subTest(case=case["id"]):
                pf = self.preflight(case)
                self.assertEqual(pf["capability"]["decision"], case["decision"])
                blocking = {f["code"] for f in pf["findings"] if f["level"] == "block"}
                self.assertTrue(set(case["codes"]) <= blocking, (case["codes"], blocking))
                self.assertEqual(pf["can_submit"], case["decision"] == "READY")
                self.assertEqual((pf["provider_calls"], pf["warehouse_queries"]), (0, 0))

    def test_server_gate_agrees_and_known_terminal_cases_never_reach_provider_or_executor(self):
        for case in CASES:
            with self.subTest(case=case["id"]):
                pipeline = self.pipeline()
                args = (self.request(case), self.catalog, REFERENCE, {})
                if case["decision"] in {"UNSUPPORTED", "REDIRECT", "CLARIFY"} and case["codes"]:
                    with self.assertRaises(AnalysisError):
                        pipeline.guided_context(*args)
                    self.assertEqual(pipeline.semantic_info["capability_decision"], case["decision"])
                    pipeline.provider.assert_not_called(); pipeline.executor.assert_not_called()
                else:
                    pipeline.guided_context(*args)  # READY never raises at the gate

    def test_fabricated_client_ready_cannot_bypass_the_gate(self):
        case = next(c for c in CASES if c["id"] == "IN-14b")
        request = AiTextToReportRequest(prompt=case["q"], allow_deterministic_upgrade=True)
        pipeline = self.pipeline()
        with self.assertRaises(AnalysisError):
            pipeline.guided_context(request, self.catalog, REFERENCE, {"client_preflight": {"can_submit": True, "state": "READY_GUIDED"}})

    def test_every_blocker_offers_a_fix_or_advice_and_all_blockers_are_reported_together(self):
        case = next(c for c in CASES if c["id"] == "IN-14a")
        blocks = [f for f in self.preflight(case)["findings"] if f["level"] == "block"]
        self.assertGreaterEqual(len(blocks), 2)  # grouping AND horizon, not only the first
        self.assertTrue(all(f["fixes"] for f in blocks))


if __name__ == "__main__":
    unittest.main()


class PreflightBenchmarkTests(unittest.TestCase):
    def test_warm_preflight_p95_is_under_50ms_and_cold_init_is_reported_separately(self):
        from tools.benchmark_preflight import measure
        result = measure(repeats=12)
        self.assertLess(result["warm_p95_ms"], 50, result)
        self.assertGreater(result["cold_catalog_ms"], 0)
        self.assertNotIn("cold", " ".join(k for k in result if k.startswith("warm")))


class LiveMeterTests(unittest.TestCase):
    """The live runner is never executed in tests; its safety mechanics are."""

    def test_meter_reserves_before_send_and_refuses_beyond_the_ceiling(self):
        from evals.live_acceptance_v33 import HttpMeter, MeterExceeded
        sent = []
        meter = HttpMeter(3, lambda *a, **k: sent.append(1) or "ok")
        meter.case = "L01"
        for _ in range(3):
            self.assertEqual(meter(), "ok")
        with self.assertRaises(MeterExceeded):
            meter()
        self.assertEqual((len(sent), meter.count, meter.by_case), (3, 3, {"L01": 3}))

    def test_case_file_defines_the_acceptance_set_before_any_run(self):
        spec = json.loads((pathlib.Path(__file__).parents[1] / "evals/live_cases_v33.json").read_text())
        self.assertGreaterEqual(len(spec["semantic"]), 20)
        self.assertEqual((spec["ceiling_http"], spec["extension_http"]), (60, 80))
        self.assertEqual(len({c["id"] for c in spec["semantic"]}), len(spec["semantic"]))
        self.assertEqual(spec["useful_first_click_target"], 0.95)

    def test_runner_refuses_to_exceed_the_absolute_ceiling_and_is_inert_offline(self):
        from evals.live_acceptance_v33 import run
        with self.assertRaises(SystemExit):
            run(81, False, pathlib.Path("/tmp/never.json"))
        out = pathlib.Path("/tmp/live_v33_offline_test.json")
        with unittest.mock.patch.dict("os.environ", {"AI_OFFLINE": "1"}):
            self.assertEqual(run(60, False, out)["status"], "NOT_RUN")
