"""Publication/cursor contracts without cloud, database or provider access."""
from copy import deepcopy
import importlib.util
from io import BytesIO
from pathlib import Path
from unittest import TestCase
from unittest.mock import MagicMock

_path = Path(__file__).resolve().parents[1] / 'pipeline-common/pipeline_runtime.py'
_spec = importlib.util.spec_from_file_location('pipeline_runtime', _path)
runtime = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(runtime)


class ObjectFixture:
    def __init__(self):
        self.objects = {}
        self.metadata = {}
    def put_object(self, Bucket, Key, Body, Metadata=None, **kwargs):
        if kwargs.get('IfNoneMatch') == '*' and (Bucket, Key) in self.objects:
            error = RuntimeError('fixture precondition failed')
            error.response = {'Error': {'Code': 'PreconditionFailed'}}
            raise error
        self.objects[(Bucket, Key)] = Body
        self.metadata[(Bucket, Key)] = Metadata or {}
    def head_object(self, Bucket, Key):
        return {'ContentLength': len(self.objects[(Bucket, Key)]), 'Metadata': self.metadata[(Bucket, Key)]}
    def get_object(self, Bucket, Key):
        return {'Body': BytesIO(self.objects[(Bucket, Key)])}


class RunPublicationTests(TestCase):
    def setUp(self):
        self.store = ObjectFixture()
        self.run = runtime.start_run('silver.orders', 'a'*64, {'replica.orders': 'generation-1'}, run_id='fixture-run')

    def output(self, name='orders', **changes):
        return {**runtime.put_verified_artifact(self.store, 'fixture', self.run, name, b'fixture-data', rows=4), **changes}

    def test_partial_or_different_run_outputs_cannot_authorize_publication(self):
        for outputs in ({}, {'orders': self.output(run_id='old-run')}, {'orders': self.output(status='staged')},
                        {'orders': self.output(quality_status='failed')}):
            with self.subTest(outputs=bool(outputs)), self.assertRaises(runtime.PipelineContractError):
                runtime.finalize_run(self.run, outputs, ['orders'])

    def test_verified_run_round_trips_and_committed_identity_is_checked(self):
        committed = runtime.finalize_run(self.run, {'orders': self.output()}, ['orders'])
        runtime.publish_manifest(self.store, 'fixture', committed)
        actual = runtime.read_manifest(self.store, 'fixture', 'fixture-run', 'a'*64)
        self.assertEqual(actual, committed)
        self.assertEqual(self.run['status'], 'staged')
        with self.assertRaises(runtime.PipelineContractError):
            runtime.read_manifest(self.store, 'fixture', 'fixture-run', 'b'*64)

    def test_hash_tampering_and_committed_labels_without_complete_contract_are_rejected(self):
        committed = runtime.finalize_run(self.run, {'orders': self.output()}, ['orders'])
        committed['outputs']['orders']['rows'] += 1
        with self.assertRaises(runtime.PipelineContractError):
            runtime.verify_manifest(committed)
        broken = {**self.run, 'status': 'committed', 'required_outputs': ['orders']}
        broken['manifest_fingerprint'] = runtime.fingerprint(broken)
        with self.assertRaises(runtime.PipelineContractError):
            runtime.verify_manifest(broken)

    def test_stored_artifact_readback_must_match_bytes_and_content_hash(self):
        self.store.head_object = lambda **kwargs: {'ContentLength': 0, 'Metadata': {'sha256': '0'*64}}
        with self.assertRaises(runtime.PipelineContractError):
            self.output()

    def test_run_paths_and_unknown_source_generation_cannot_be_guessed(self):
        for run_id in ('../old', '/tmp/other', 'bad/run'):
            with self.subTest(run_id=run_id), self.assertRaises(runtime.PipelineContractError):
                runtime.start_run('orders', 'a'*64, {'replica.orders': 'g1'}, run_id=run_id)
        with self.assertRaises(runtime.PipelineContractError):
            runtime.start_run('orders', 'a'*64, {})

    def test_checkpoint_advance_is_fenced_and_never_commits_the_callers_transaction(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.fetchone.return_value = (2,)
        actual = runtime.advance_checkpoint(connection, 'replica.orders', cursor_time='2026-10-18T00:00:00Z',
            cursor_keys=['order-2'], source_upper_bound='2026-10-18T01:00:00Z', schema_fingerprint='a'*64,
            observed_rows=10, expected_generation=1)
        self.assertEqual(actual, 2)
        self.assertIn('AND generation=%s', cursor.execute.call_args.args[0])
        connection.commit.assert_not_called()
        connection.rollback.assert_not_called()

    def test_concurrent_checkpoint_conflict_requires_caller_to_rollback(self):
        connection = MagicMock()
        connection.cursor.return_value.__enter__.return_value.fetchone.return_value = None
        with self.assertRaises(runtime.CheckpointConflict):
            runtime.advance_checkpoint(connection, 'replica.orders', cursor_time=None, cursor_keys=[],
                source_upper_bound=None, schema_fingerprint='a'*64, observed_rows=0, expected_generation=0)
        connection.commit.assert_not_called()

    def test_empty_source_does_not_turn_into_a_missing_output_or_completeness_certificate(self):
        output = runtime.put_verified_artifact(self.store, 'fixture', self.run, 'orders', b'', rows=0, quality_status='no_data')
        committed = runtime.finalize_run(self.run, {'orders': output}, ['orders'])
        self.assertEqual(committed['outputs']['orders']['rows'], 0)
        self.assertNotIn('completeness', committed)

    def test_same_run_retry_is_idempotent_but_cannot_replace_different_bytes(self):
        output = self.output()
        self.assertEqual(self.output(), output)
        with self.assertRaises(runtime.PipelineContractError):
            runtime.put_verified_artifact(self.store, 'fixture', self.run, 'orders', b'new-data', rows=4)
        self.assertEqual(self.store.objects[('fixture', output['key'])], b'fixture-data')

    def test_reader_verifies_actual_bytes_not_only_the_manifest_label(self):
        output = self.output()
        committed = runtime.finalize_run(self.run, {'orders': output}, ['orders'])
        self.assertEqual(runtime.read_verified_artifact(self.store, 'fixture', committed, 'orders'), b'fixture-data')
        self.store.objects[('fixture', output['key'])] = b'corrupted-bytes'
        with self.assertRaises(runtime.PipelineContractError):
            runtime.read_verified_artifact(self.store, 'fixture', committed, 'orders')

    def test_committed_manifest_itself_is_immutable_even_when_new_content_has_a_valid_hash(self):
        committed = runtime.finalize_run(self.run, {'orders': self.output()}, ['orders'])
        runtime.publish_manifest(self.store, 'fixture', committed)
        runtime.publish_manifest(self.store, 'fixture', committed)
        changed = deepcopy(committed)
        changed['source_runs']['replica.orders'] = 'another-generation'
        changed.pop('manifest_fingerprint')
        changed['manifest_fingerprint'] = runtime.fingerprint(changed)
        with self.assertRaises(runtime.PipelineContractError):
            runtime.publish_manifest(self.store, 'fixture', changed)
