"""Governed extraction contracts use observed source schema, not guessed clocks."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
from unittest import TestCase

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('pipeline_runtime', ROOT / 'pipeline-common/pipeline_runtime.py')
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)
CONTRACTS = json.loads((ROOT / 'metadata/data_contracts.json').read_text())['datasets']


class DataContractTests(TestCase):
    def actual(self, contract):
        return {name: {k: definition[k] for k in ('data_type', 'udt_name', 'nullable')}
                for name, definition in contract['columns'].items()}

    def test_all23_contracts_match_recorded_readonly_source_metadata(self):
        schemas, keys = {}, {}
        # v34: 23 legacy sources; round 3 (PLAN 20/10, user-approved): 26 business-coverage sources.
        for evidence in ('evaluation/v34/implementation-20261018/source-schema-readonly.json',
                         'evaluation/business-coverage-20261020/round3/source-schema-readonly-round3.json'):
            observed = json.loads((ROOT / evidence).read_text())
            for schema, table, name, kind, udt, nullable in observed['columns']:
                schemas.setdefault(schema+'.'+table, {})[name] = {'data_type': kind, 'udt_name': udt, 'nullable': nullable == 'YES'}
            for schema, table, name in observed['primary_keys']:
                keys.setdefault(schema+'.'+table, []).append(name)
        self.assertEqual(len(CONTRACTS), 49)
        for name, contract in CONTRACTS.items():
            with self.subTest(dataset=name):
                result = runtime.validate_data_contract(contract, schemas[name], keys[name])
                self.assertEqual(result['unreplicated_nullable_columns'], [])
                self.assertEqual(len(result['schema_fingerprint']), 64)

    def test_created_only_sources_are_not_misrepresented_as_update_streams(self):
        for name in ('identity.nguoi_dung', 'orders.giao_dich_thanh_toan', 'orders.customer_wallet_transaction'):
            self.assertEqual(CONTRACTS[name]['mode'], 'full_snapshot')
            self.assertIsNone(CONTRACTS[name]['update_clock'])

    def test_missing_type_nullable_or_primary_key_drift_is_blocked(self):
        contract = CONTRACTS['orders.don_hang']
        mutations = []
        missing = self.actual(contract); missing.pop('tong_tien'); mutations.append((missing, contract['primary_key']))
        changed = self.actual(contract); changed['tong_tien']['data_type'] = 'text'; mutations.append((changed, contract['primary_key']))
        changed = self.actual(contract); changed['ngay_cap_nhat']['nullable'] = True; mutations.append((changed, contract['primary_key']))
        mutations.append((self.actual(contract), ['ma_don_hang', 'co_so_ma']))
        for actual, keys in mutations:
            with self.subTest(keys=keys), self.assertRaises(runtime.PipelineContractError):
                runtime.validate_data_contract(contract, actual, keys)

    def test_new_nullable_columns_are_not_replicated_until_classified(self):
        contract = CONTRACTS['orders.don_hang']
        actual = self.actual(contract)
        actual['future_sensitive_attribute'] = {'data_type': 'text', 'udt_name': 'text', 'nullable': True}
        result = runtime.validate_data_contract(contract, actual, contract['primary_key'])
        self.assertEqual(result['unreplicated_nullable_columns'], ['future_sensitive_attribute'])
        projection, _ = runtime.source_projection(contract)
        self.assertNotIn('future_sensitive_attribute', projection)

    def test_secret_fields_have_only_redacted_constant_projections(self):
        contract = CONTRACTS['identity.nguoi_dung']
        projection, values = runtime.source_projection(contract)
        self.assertIn('%s::text AS "mat_khau_hash"', projection)
        self.assertIn('[REDACTED]', values)
        self.assertNotIn('*', projection)
        changed = deepcopy(contract)
        changed['columns']['mat_khau_hash']['projection'] = 'source'
        with self.assertRaises(runtime.PipelineContractError):
            runtime.validate_data_contract(changed, self.actual(changed), changed['primary_key'])

    def test_sql_identifiers_cannot_escape_the_governed_source_identity(self):
        for name in ('orders.don_hang;DROP TABLE x', 'orders', 'a.b.c', 'orders.don_hang--'):
            with self.subTest(name=name), self.assertRaises(runtime.PipelineContractError):
                runtime.quote_table(name)
