"""Offline semantic evaluation gate (deterministic; not a measure of NL understanding)."""
import os
import unittest
from unittest.mock import patch


class SemanticEvalV30Tests(unittest.TestCase):
    def test_offline_dataset_retrieval_and_compile_gates(self):
        with patch.dict(os.environ, {"AI_OFFLINE": "1", "DATA_ANALYST_ENV": "development", "DATA_ANALYST_SESSION_STORE": "memory",
                                     "DATA_ANALYST_ARTIFACT_STORE": "memory"}), \
             patch("requests.sessions.Session.request", side_effect=AssertionError("External transport forbidden")), \
             patch("psycopg2.connect", side_effect=AssertionError("Warehouse forbidden")):
            from evals.semantic_eval_v30 import run_offline
            summary = run_offline()
        self.assertFalse(summary["measures_natural_language_understanding"])
        self.assertEqual(summary["dataset_errors"], [])
        self.assertGreaterEqual(summary["case_count"], 100)
        self.assertEqual(summary["regression_retrieval"]["rate"], 1.0)  # shipper success-rate questions
        self.assertEqual(summary["compile_level2"]["rate"], 1.0)
        self.assertEqual(summary["forecast_capability_rejections"]["rate"], 1.0)
        self.assertGreaterEqual(summary["retrieval_metric"]["rate"], 0.95)
        self.assertGreaterEqual(summary["retrieval_domain"]["rate"], 0.95)
        self.assertLessEqual(summary["max_context_chars"], 24000)


if __name__ == "__main__":
    unittest.main()
