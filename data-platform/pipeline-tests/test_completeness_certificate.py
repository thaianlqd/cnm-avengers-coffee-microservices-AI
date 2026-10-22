"""Snapshot proof never becomes a promise about late business events."""
from copy import deepcopy
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import importlib.util
from pathlib import Path
from unittest import TestCase

spec = importlib.util.spec_from_file_location('pipeline_runtime',
    Path(__file__).resolve().parents[1] / 'pipeline-common/pipeline_runtime.py')
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


class SnapshotCertificateTests(TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 19, 6, 0, tzinfo=timezone.utc)
        self.contract = {'dataset_id': 'replica.fixture.orders', 'primary_key': ['id'],
            'columns': {'id': {'data_type': 'integer', 'nullable': False, 'projection': 'source'},
                        'amount': {'data_type': 'numeric', 'nullable': False, 'projection': 'source'}},
            'expected_load_interval_seconds': 300, 'maximum_acceptable_load_lag_seconds': 900,
            'quality_checks': [{'id': 'amount_nonnegative', 'kind': 'numeric_range', 'column': 'amount', 'minimum': 0}]}

    def observation(self, rows):
        digest = runtime.ProjectionEvidence(self.contract)
        for row in rows:
            digest.observe(row)
        return digest.summary()

    def certificate(self):
        observed = self.observation([{'id': 1, 'amount': Decimal('12.00')}])
        return runtime.snapshot_certificate(self.contract, observed, observed,
            generation=2, schema_fingerprint='a'*64, source_upper_bound=self.now,
            snapshot_started_at=self.now-timedelta(seconds=2), now=self.now)

    def test_typed_decimal_normalization_is_equal_without_rounding_to_float(self):
        self.assertEqual(self.observation([{'id': 1, 'amount': Decimal('12.00')}]),
                         self.observation([{'id': 1, 'amount': Decimal('12.0')}]))
        self.assertNotEqual(self.observation([{'id': 1, 'amount': Decimal('9007199254740993.01')}])['content_sha256'],
                            self.observation([{'id': 1, 'amount': Decimal('9007199254740993.02')}])['content_sha256'])

    def test_content_or_key_mismatch_cannot_issue_certificate(self):
        source = self.observation([{'id': 1, 'amount': Decimal('12')}])
        for rows in [[{'id': 1, 'amount': Decimal('13')}], [{'id': 2, 'amount': Decimal('12')}], []]:
            with self.subTest(rows=len(rows)), self.assertRaises(runtime.PipelineContractError):
                runtime.snapshot_certificate(self.contract, source, self.observation(rows), generation=2,
                    schema_fingerprint='a'*64, source_upper_bound=self.now,
                    snapshot_started_at=self.now, now=self.now)

    def test_integrity_failure_blocks_proof_even_when_source_matches_target(self):
        for rows in [[{'id': 1, 'amount': Decimal('-1')}], [{'id': None, 'amount': 1}],
                     [{'id': 1, 'amount': 1}, {'id': 1, 'amount': 1}]]:
            with self.subTest(rows=len(rows)), self.assertRaises(runtime.PipelineContractError):
                observed = self.observation(rows)
                runtime.snapshot_certificate(self.contract, observed, observed, generation=2,
                    schema_fingerprint='a'*64, source_upper_bound=self.now,
                    snapshot_started_at=self.now, now=self.now)

    def test_certificate_rejects_tamper_expiry_and_wrong_generation(self):
        certificate = self.certificate()
        self.assertTrue(runtime.valid_snapshot_certificate(certificate, self.contract,
                        generation=2, schema_fingerprint='a'*64, now=self.now))
        bad = deepcopy(certificate)
        bad['source']['rows'] += 1
        for value, generation, now in [(bad, 2, self.now), (certificate, 3, self.now),
                (certificate, 2, self.now+timedelta(seconds=901)), ({'fake': True}, 2, self.now)]:
            with self.subTest(generation=generation), self.assertRaises(runtime.PipelineContractError):
                runtime.valid_snapshot_certificate(value, self.contract, generation=generation,
                    schema_fingerprint='a'*64, now=now)

    def test_snapshot_parity_cannot_claim_closed_business_period(self):
        certificate = self.certificate()
        self.assertEqual(certificate['kind'], 'snapshot_parity')
        self.assertIsNone(certificate['closed_through'])
        self.assertEqual(certificate['lateness_basis'], 'not_certified')
        self.assertFalse(runtime.closed_period_eligible(certificate, self.now))

    def test_evidence_contains_digests_and_counts_not_rows_or_keys(self):
        observed = self.observation([{'id': 891234, 'amount': Decimal('12987654.37')}])
        import json
        serialized = json.dumps(observed)
        self.assertNotIn('891234', serialized)
        self.assertNotIn('12987654.37', serialized)
        self.assertIn('key_sha256', observed)
        self.assertEqual(observed['rows'], 1)

    def test_zero_rows_is_measured_empty_not_missing_observation(self):
        observed = self.observation([])
        self.assertEqual(observed['rows'], 0)
        self.assertTrue(all(c['checked'] == 0 for c in observed['quality']['checks']))
        self.assertEqual(observed['quality']['status'], 'empty_measured')

    def test_reference_observations_are_required_and_bounded_not_assumed_green(self):
        self.contract['reference_checks'] = [{'id': 'ref.parent', 'columns': ['id'],
            'reference_table': 'fixture.parents', 'reference_columns': ['id']}]
        observed = self.observation([{'id': 1, 'amount': 10}])
        with self.assertRaises(runtime.PipelineContractError):
            runtime.attach_reference_evidence(self.contract, observed, {})
        valid = runtime.attach_reference_evidence(self.contract, observed,
                                                  {'ref.parent': {'checked': 1, 'violations': 0}})
        self.assertEqual(valid['quality']['status'], 'passed')
        invalid = runtime.attach_reference_evidence(self.contract, observed,
                                                    {'ref.parent': {'checked': 1, 'violations': 1}})
        self.assertEqual(invalid['quality']['status'], 'failed')

    def test_partial_period_evidence_never_claims_full_dataset_complete(self):
        observed = self.observation([{'id': 1, 'amount': 10}])
        payload = runtime.load_evidence(self.contract, observed, generation=2,
            schema_fingerprint='a'*64, now=self.now)
        self.assertEqual(payload['completeness'], 'unknown')
        self.assertIsNone(payload['snapshot'])
        self.assertEqual(payload['closed_periods'], [])

    def test_evidence_and_checkpoint_share_fenced_transaction_without_implicit_commit(self):
        from unittest.mock import MagicMock
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.fetchone.return_value = {'generation': 2}
        observed = self.observation([{'id': 1, 'amount': 10}])
        payload = runtime.load_evidence(self.contract, observed, generation=2,
            schema_fingerprint='a'*64, now=self.now)
        # Freshness of a historical certificate is checked by the read-side.
        result = runtime.advance_checkpoint(connection, self.contract['dataset_id'],
            cursor_time=None, cursor_keys=[], source_upper_bound=self.now,
            schema_fingerprint='a'*64, observed_rows=1, expected_generation=1,
            evidence=payload, contract=self.contract, now=self.now)
        self.assertEqual(result, 2)
        self.assertIn('certificate=%s::jsonb', cursor.execute.call_args.args[0])
        self.assertIn('AND generation=%s', cursor.execute.call_args.args[0])
        connection.commit.assert_not_called()

    def test_forged_checkpoint_completeness_is_rejected_before_any_write(self):
        from unittest.mock import MagicMock
        connection = MagicMock()
        observed = self.observation([{'id': 1, 'amount': 10}])
        payload = runtime.load_evidence(self.contract, observed, generation=2,
            schema_fingerprint='a'*64, now=self.now)
        payload['completeness'] = 'complete'
        with self.assertRaises(runtime.PipelineContractError):
            runtime.advance_checkpoint(connection, self.contract['dataset_id'],
                cursor_time=None, cursor_keys=[], source_upper_bound=self.now,
                schema_fingerprint='a'*64, observed_rows=1, expected_generation=1,
                evidence=payload, contract=self.contract, now=self.now)
        connection.cursor.assert_not_called()

    def test_rehashed_envelope_cannot_mix_snapshot_kind_or_global_quality(self):
        cert = self.certificate()
        payload = runtime.load_evidence(self.contract, cert['target'], generation=2,
            schema_fingerprint='a'*64, snapshot=cert, now=self.now)
        payload['replica_rows'] = 0
        for check in payload['quality']['checks']:
            check.update(checked=0, violations=0, status='no_data')
        payload['quality']['status'] = 'empty_measured'
        payload.pop('evidence_sha256')
        payload['evidence_sha256'] = runtime.fingerprint(payload)
        with self.assertRaises(runtime.PipelineContractError):
            runtime.valid_load_evidence(payload, self.contract, generation=2,
                schema_fingerprint='a'*64, now=self.now)

    def test_json_numbers_preserve_precision_and_ignore_serialization_format(self):
        definition = {'data_type': 'jsonb'}
        first = '{"large":123456789012345678901234567890.01,"n":1.0}'
        same = '{ "n":1, "large":123456789012345678901234567890.010 }'
        changed = '{"large":123456789012345678901234567890.02,"n":1}'
        self.assertEqual(runtime._projection_value(first, definition), runtime._projection_value(same, definition))
        self.assertNotEqual(runtime._projection_value(first, definition), runtime._projection_value(changed, definition))

    def test_arbitrary_precision_decimals_do_not_use_context_rounding(self):
        a = Decimal('1234567890123456789012345678901234567890.01')
        b = Decimal('1234567890123456789012345678901234567890.02')
        self.assertNotEqual(self.observation([{'id': 1, 'amount': a}])['content_sha256'],
                            self.observation([{'id': 1, 'amount': b}])['content_sha256'])

    def test_attested_closed_period_requires_exact_contract_and_range(self):
        period = {'id': 'orders-sep2026', 'start': '2026-09-01', 'end': '2026-09-30',
                  'clock': 'created_at', 'timezone': 'Asia/Ho_Chi_Minh', 'enabled': True,
                  'attested_by': 'admin', 'attested_on': '2026-10-19',
                  'authority': 'user_confirmation_20261019', 'must_revoke_before_mutation': True}
        self.contract['closed_periods'] = [period]
        evidence = self.observation([{'id': 1, 'amount': 10}])
        proof = runtime.closed_period_certificate(self.contract, evidence, evidence,
            period_id=period['id'], generation=2, schema_fingerprint='a'*64,
            source_upper_bound=self.now, snapshot_started_at=self.now, now=self.now)
        self.assertTrue(runtime.valid_certificate(proof, self.contract, generation=2,
                                                 schema_fingerprint='a'*64, now=self.now))
        self.assertTrue(runtime.closed_period_eligible(proof, '2026-09-30', '2026-09-02'))
        self.assertFalse(runtime.closed_period_eligible(proof, '2026-10-01', '2026-09-02'))
        self.assertFalse(runtime.closed_period_eligible(proof, '2026-09-30', '2026-08-31'))
        self.contract['closed_periods'][0]['enabled'] = False
        with self.assertRaises(runtime.PipelineContractError):
            runtime.valid_certificate(proof, self.contract, generation=2,
                                      schema_fingerprint='a'*64, now=self.now)
