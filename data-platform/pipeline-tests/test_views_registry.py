"""One authored view registry, generated API packaging and frozen SQL parity."""
import hashlib
import json
from pathlib import Path
import re
from unittest import TestCase

ROOT=Path(__file__).resolve().parents[1]


class WarehouseRegistryTests(TestCase):
    def test_api_packaged_registry_matches_canonical_bytes_and_legacy_sql_definitions(self):
        canonical=ROOT/'metadata/warehouse_views.json'
        self.assertEqual(canonical.read_bytes(),(ROOT/'analytics-api/metadata/warehouse_views.json').read_bytes())
        registry=json.loads(canonical.read_text())
        old=json.loads((ROOT/'evaluation/v34/implementation-20261018/views-parity-before.json').read_text())
        current={v['name']:hashlib.sha256(re.sub(r'\s+',' ',v['sql']).strip().encode()).hexdigest()
                 for v in registry['views'] if 'api' in v['consumers']}
        approved=json.loads((ROOT/'evaluation/business-coverage-20261020/round3/views-parity-round3.json').read_text())
        # Untouched v34 views keep their frozen SQL; round-3 deltas are the reviewed, user-approved set.
        self.assertEqual({k:v for k,v in current.items() if k in old['hashes'] and k not in approved['changed_existing_views']},
                         {k:v for k,v in old['hashes'].items() if k not in approved['changed_existing_views']})
        self.assertEqual(current,approved['hashes'])
        self.assertEqual(approved['changed_existing_views'],['silver.danh_gia_chi_nhanh'])  # giao_hang is sync-only
        self.assertEqual(len(registry['views']),48)
        self.assertEqual(sum('api' in v['consumers'] for v in registry['views']),44)

    def test_all_view_sources_are_declared_physical_analytical_contracts(self):
        registry=json.loads((ROOT/'metadata/warehouse_views.json').read_text())
        sources=json.loads((ROOT/'metadata/data_contracts.json').read_text())['datasets']
        for view in registry['views']:
            with self.subTest(view=view['name']):
                self.assertTrue(view['source_dependencies'])
                self.assertTrue(set(view['source_dependencies'])<=set(sources))
                self.assertRegex(view['sql'],r'CREATE OR REPLACE VIEW '+re.escape(view['name']))
