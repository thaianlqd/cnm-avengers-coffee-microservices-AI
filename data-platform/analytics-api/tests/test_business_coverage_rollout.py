"""PLAN 20/10 round 3: the approved warehouse rollout is additive and least-privilege."""
import json
import unittest
from pathlib import Path

from services.metadata_service import is_sensitive_column
from tools.deploy_business_coverage_round3 import apply, plan

ROOT = Path(__file__).resolve().parents[1]


class Round3RolloutPlanTests(unittest.TestCase):
    def setUp(self):
        self.value = plan(ROOT)
        self.sql = '\n'.join(self.value['statements'])

    def test_plan_is_additive_and_scoped(self):
        self.assertEqual(26, len(self.value['target_tables']))
        for word in ('DROP ', 'TRUNCATE', 'CREATE ROLE', 'ALTER ROLE', 'INSERT INTO', 'DELETE FROM'):
            self.assertNotIn(word, self.sql.upper())
        self.assertTrue(all(s.startswith(('CREATE SCHEMA IF NOT EXISTS', 'CREATE TABLE IF NOT EXISTS', 'GRANT ', 'CREATE OR REPLACE VIEW',
                                          'REVOKE ALL ON analytics.snapshot_lock__')) for s in self.value['statements']))
        guards = [s for s in self.value['statements'] if 'analytics.snapshot_lock__' in s and s.startswith('CREATE')]
        self.assertEqual(23, len(guards))  # one zero-row lock guard per new analytical relation (migration 029)
        self.assertIn('silver.danh_gia_chi_nhanh', self.value['views'])
        self.assertIn('silver.giao_hang', self.value['views'])
        self.assertFalse(self.value['source_database_access'] or self.value['data_writes'] or self.value['applied'])

    def test_replica_grants_cover_exactly_the_new_targets(self):
        granted = [s for s in self.value['statements'] if s.startswith('GRANT SELECT, INSERT, UPDATE, DELETE')]
        self.assertEqual(26, len(granted))
        self.assertTrue(all('avengers_replica_writer' in s for s in granted))

    def test_reader_never_gets_redacted_or_sensitive_columns(self):
        contracts = json.loads((ROOT / 'metadata/data_health_contracts.json').read_text())['datasets']
        redacted = {n for c in contracts.values() for n, d in c['columns'].items() if d['projection'] == 'redacted'}
        reader = [s for s in self.value['statements'] if 'avengers_analytics_reader' in s and s.startswith('GRANT SELECT (')]
        for statement in reader:
            columns = statement[statement.index('(') + 1:statement.index(')')].replace('"', '').split(', ')
            self.assertFalse(set(columns) & redacted, statement)
            self.assertFalse(any(is_sensitive_column(c) for c in columns), statement)
        self.assertTrue(any('public.sync_history' in s for s in reader))

    def test_apply_requires_explicit_approval(self):
        with self.assertRaises(RuntimeError):
            apply(self.value, approved=False)


if __name__ == '__main__':
    unittest.main()
