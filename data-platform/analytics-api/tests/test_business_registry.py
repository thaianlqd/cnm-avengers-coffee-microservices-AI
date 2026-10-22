"""PLAN 20/10 P0: the business registry is closed over the source ledger and the catalog."""
import json
import unittest
from copy import deepcopy

from services.analysis_catalog import CATALOG_PATH
from services.business_registry import coverage_report, load_registry, validate_registry


class BusinessRegistryTests(unittest.TestCase):
    def setUp(self):
        self.registry = load_registry()
        self.catalog = json.loads(CATALOG_PATH.read_text())["analysis_registry"]

    def test_registry_is_valid_and_has_no_orphans(self):
        self.assertEqual([], validate_registry(self.registry, self.catalog))
        report = coverage_report(self.registry)
        self.assertEqual(report["source_table_count"], report["classified_source_tables"])
        self.assertEqual(["B%02d" % i for i in range(1, 35)], [g["group_id"] for g in self.registry["groups"]])
        humans = set(self.registry["human_actor_contexts"])
        self.assertEqual(humans, humans & set(report["actor_contexts_covered"]))  # every human actor has a group

    def test_violations_are_detected(self):
        cases = {
            "orphan": lambda r: r["groups"][0]["source_tables"].clear(),
            "retired metric": lambda r: r["groups"][2]["metric_refs"].append("low_stock_count"),
            "unknown domain": lambda r: r["groups"][0]["domain_ids"].append("invented"),
            "silent limitation": lambda r: r["groups"][7]["open_items"].clear(),
            "missing test": lambda r: r["groups"][2]["test_refs"].append("tests/missing_test.py"),
            "unknown actor": lambda r: r["groups"][0]["actor_contexts"].append("ROBOT"),
        }
        for name, mutate in cases.items():
            with self.subTest(case=name):
                broken = deepcopy(self.registry)
                mutate(broken)
                self.assertTrue(validate_registry(broken, self.catalog))


if __name__ == "__main__":
    unittest.main()
