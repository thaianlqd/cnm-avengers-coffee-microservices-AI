"""Batch role plan is minimal, offline by default, and Bronze no longer extracts unused free text."""
from pathlib import Path
from unittest import TestCase

from tools import deploy_v34_batch as batch

ROOT = Path(__file__).resolve().parents[2]


class BatchPlanTests(TestCase):
    def test_grants_are_exactly_reviewed_and_contain_no_ddl_truncate_or_silver_gold_dml(self):
        value = batch.plan(ROOT)
        sql = value['grant_sql']
        self.assertEqual(value['source_tables'], sorted(batch.SOURCES))
        self.assertFalse(value['applied'])
        for forbidden in ('TRUNCATE', 'DELETE', 'CREATE', 'ALL PRIVILEGES', 'SUPERUSER', 'WITH GRANT OPTION', 'silver.', 'gold.'):
            self.assertNotIn(forbidden, sql)
        grants = [l for l in sql.splitlines() if l.startswith('GRANT')]
        self.assertEqual(len(grants), 1 + len(batch.SOURCES) + 3)
        for table in ('pipeline_runs', 'gold_dataset_versions', 'pipeline_publications', 'ingestion_checkpoints'):
            self.assertIn('analytics.' + table, sql)
        self.assertNotIn('replica', sql + value['group'] + value['login'])
        self.assertNotIn('realtime_events', sql)

    def test_apply_requires_explicit_approval_before_any_database_access(self):
        with self.assertRaises(RuntimeError):
            batch.apply(batch.plan(ROOT))
        changed = {**batch.plan(ROOT), 'login': 'avengers_dp_replica'}
        with self.assertRaises(RuntimeError):
            batch.apply(changed, approved=True)
