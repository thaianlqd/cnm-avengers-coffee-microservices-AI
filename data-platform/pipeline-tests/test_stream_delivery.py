"""Failure-boundary tests: no broker/provider/network needed."""
import sys
from pathlib import Path
from unittest import TestCase
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'pipeline-common'))
import stream_runtime as stream
from test_run_publication import ObjectFixture


class StreamDeliveryTests(TestCase):
    def record(self, offset=7, value=b'{"event_type":"order_updated","data":{"id":1}}', partition=0):
        return stream.broker_record('orders-events', partition, offset, value, b'order-1')

    def test_crash_after_bronze_before_offset_commit_replays_one_logical_event(self):
        s3, commit = ObjectFixture(), Mock(side_effect=RuntimeError('fixture lost offset ack'))
        record = self.record()
        with self.assertRaises(RuntimeError): stream.flush_records([record], s3, 'bronze', commit)
        self.assertEqual(len(s3.objects), 1)
        commit.side_effect = None
        stream.flush_records([self.record()], s3, 'bronze', commit)
        self.assertEqual(len(s3.objects), 1)
        commit.assert_called_with({('orders-events', 0): 8})

    def test_partial_sink_failure_never_commits_the_batch(self):
        s3, commit = ObjectFixture(), Mock()
        put = s3.put_object
        def fail_second(**kwargs):
            if '8-8.json' in kwargs['Key']: raise TimeoutError('fixture sink failure')
            put(**kwargs)
        s3.put_object = fail_second
        with self.assertRaises(TimeoutError): stream.flush_records([self.record(), self.record(8)], s3, 'bronze', commit)
        commit.assert_not_called()
        s3.put_object = put
        stream.flush_records([self.record(), self.record(8)], s3, 'bronze', commit)
        self.assertEqual(len(s3.objects), 2)

    def test_projection_failure_is_disclosed_after_durable_bronze_and_can_be_replayed(self):
        s3, commit, projection = ObjectFixture(), Mock(), Mock(side_effect=RuntimeError('fixture DB outage'))
        result = stream.flush_records([self.record()], s3, 'bronze', commit, project=projection)
        self.assertEqual(result['projection'], 'failed_replay_required')
        commit.assert_called_once()
        self.assertEqual(len(s3.objects), 1)

    def test_malformed_json_utf8_duplicates_and_nonfinite_are_durable_quarantine(self):
        for raw in (b'bad', b'\xff', b'[]', b'{"event_type":"ok","n":NaN}',
                    b'{"event_type":"a","event_type":"b"}'):
            with self.subTest(raw=raw):
                record = self.record(value=raw)
                self.assertEqual(record['status'], 'quarantined')
                s3, commit = ObjectFixture(), Mock()
                result = stream.flush_records([record], s3, 'bronze', commit)
                self.assertEqual(result['quarantined'], 1)
                self.assertTrue(next(iter(s3.objects))[1].startswith('quarantine/'))
                commit.assert_called_once()

    def test_missing_or_corrupt_required_sink_blocks_commit(self):
        commit = Mock()
        with self.assertRaises(ValueError): stream.flush_records([self.record()], None, 'bronze', commit)
        s3 = ObjectFixture()
        stream.persist_bronze(s3, 'bronze', self.record())
        s3.objects[('bronze', stream.bronze_key(self.record()))] = b'corrupt'
        with self.assertRaises(ValueError): stream.flush_records([self.record()], s3, 'bronze', commit)
        commit.assert_not_called()

    def test_deadline_or_unknown_broker_identity_blocks_before_ack(self):
        s3, commit = ObjectFixture(), Mock()
        with self.assertRaises(TimeoutError): stream.flush_records([self.record()], s3, 'bronze', commit, deadline=0)
        self.assertEqual(s3.objects, {})
        for topic, partition, offset in (('../orders', 0, 1), ('orders-events', -1, 1), ('orders-events', 0, True)):
            with self.assertRaises(ValueError): stream.broker_record(topic, partition, offset, b'{}')
        commit.assert_not_called()

    def test_partition_positions_and_varying_batch_boundaries_do_not_change_objects(self):
        s3, commit = ObjectFixture(), Mock()
        records = [self.record(2), self.record(3), self.record(9, partition=1)]
        stream.flush_records(records, s3, 'bronze', commit)
        commit.assert_called_with({('orders-events', 0): 4, ('orders-events', 1): 10})
        stream.flush_records(records[:1], s3, 'bronze', Mock())
        stream.flush_records(records[1:], s3, 'bronze', Mock())
        self.assertEqual(len(s3.objects), 3)

    def test_oversized_quarantine_is_bounded_and_discloses_original_hash_and_size(self):
        raw = b'x'*(stream.MAX_EVENT_BYTES+200)
        record = self.record(value=raw)
        self.assertEqual(record['reason'], 'event_too_large')
        self.assertTrue(record['raw_truncated'])
        self.assertEqual(record['original_bytes'], len(raw))
        self.assertLess(len(record['raw_base64']), 2*stream.MAX_EVENT_BYTES)

    def test_projection_failure_rolls_back_and_never_claims_success(self):
        connection = Mock()
        connection.cursor.return_value.__enter__ = Mock(side_effect=RuntimeError('fixture SQL error'))
        connection.cursor.return_value.__exit__ = Mock()
        with self.assertRaises(RuntimeError): stream.project_records(connection, [self.record()])
        connection.rollback.assert_called_once()
        connection.commit.assert_not_called()
