"""Real PostgreSQL transaction/clock/secret projection integration.

Run only in the task-owned network-none Postgres fixture via dp-pipeline-test.sh.
No production connection configuration or business rows are used.
"""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import importlib.util
import os
from pathlib import Path
import sys
from unittest import TestCase
from unittest.mock import patch

import psycopg2
from psycopg2 import sql
import psycopg2.extras

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'pipeline-common'))
import pipeline_runtime as runtime
_spec = importlib.util.spec_from_file_location('governed_sync', ROOT / 'data-sync/sync.py')
sync = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sync)


def connect(database, *, autocommit=False):
    if os.getenv('V34_PIPELINE_PG_FIXTURE') != '1' or database not in {'postgres', 'v34_source', 'v34_target', 'v34_ownership', 'v34_snapshot'}:
        raise RuntimeError('Explicit isolated PostgreSQL fixture required')
    conn = psycopg2.connect(host='127.0.0.1', port=5432, user='postgres', password='fixture-only',
                            dbname=database, sslmode='disable', connect_timeout=3)
    conn.autocommit = autocommit
    with conn.cursor() as cursor:
        cursor.execute('SELECT current_database()')
        if cursor.fetchone()[0] != database:
            conn.close()
            raise RuntimeError('Fixture database identity mismatch')
    if not autocommit:
        conn.rollback()
    return conn


class GovernedSyncPostgresTests(TestCase):
    @classmethod
    def setUpClass(cls):
        conn = connect('postgres', autocommit=True)
        try:
            with conn.cursor() as cursor:
                for database in ('v34_source', 'v34_target'):
                    cursor.execute('SELECT 1 FROM pg_database WHERE datname=%s', (database,))
                    if cursor.fetchone() is None:
                        cursor.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(database)))
        finally:
            conn.close()
        conn = connect('v34_target', autocommit=True)
        try:
            with conn.cursor() as cursor:
                cursor.execute('CREATE SCHEMA IF NOT EXISTS analytics; CREATE SCHEMA IF NOT EXISTS silver; '
                    'CREATE TABLE IF NOT EXISTS analytics.saved_reports (id text PRIMARY KEY, updated_at timestamptz DEFAULT now()); '
                    'CREATE TABLE IF NOT EXISTS public.sync_metadata (schema_name text,table_name text,last_synced_at timestamptz,'
                    'rows_synced bigint,sync_duration_ms bigint,sync_type text,error_message text,PRIMARY KEY(schema_name,table_name));')
                cursor.execute((ROOT / 'analytics-api/migrations/026_analysis_modules.sql').read_text())
                cursor.execute((ROOT / 'analytics-api/migrations/027_platform_governance.sql').read_text())
        finally:
            conn.close()

    def setUp(self):
        self.source_admin = connect('v34_source', autocommit=True)
        self.target = connect('v34_target')
        self.addCleanup(self.target.close)
        self.addCleanup(self.source_admin.close)
        with self.source_admin.cursor() as cursor:
            cursor.execute('CREATE SCHEMA IF NOT EXISTS orders; DROP TABLE IF EXISTS orders.demo; '
                'CREATE TABLE orders.demo (id integer PRIMARY KEY, amount numeric NOT NULL, updated_at timestamptz NOT NULL,'
                'created_at timestamptz NOT NULL, label text, sensitive_hash text NOT NULL);')
        with self.target.cursor() as cursor:
            cursor.execute("CREATE SCHEMA IF NOT EXISTS orders; DROP VIEW IF EXISTS silver.v35_metadata_demo; DROP TABLE IF EXISTS orders.demo; "
                "DELETE FROM analytics.ingestion_checkpoints WHERE dataset_id='replica.orders.demo'; "
                "DELETE FROM analytics.stream_checkpoints WHERE stream_id='fixture-publisher'; "
                "DELETE FROM public.sync_metadata WHERE schema_name='orders' AND table_name='demo';")
        self.target.commit()
        self.source = connect('v34_source')
        self.source.set_session(readonly=True, isolation_level='REPEATABLE READ')
        self.addCleanup(self.source.close)
        self.contract = self.make_contract()

    def make_contract(self):
        metadata = sync.get_table_columns(self.source_admin, 'orders', 'demo')
        columns = {name: {'data_type': kind, 'udt_name': udt, 'nullable': nullable == 'YES',
                          'classification': 'internal', 'projection': 'source'}
                   for name, kind, udt, nullable, _default in metadata}
        columns['sensitive_hash'].update(classification='restricted', projection='redacted', placeholder='[REDACTED]')
        return {'dataset_id': 'replica.orders.demo', 'source_table': 'orders.demo', 'target_table': 'orders.demo',
                'primary_key': ['id'], 'mode': 'incremental', 'update_clock': 'updated_at', 'columns': columns,
                'overlap_seconds': 600, 'full_reconcile_seconds': 3600,
                'expected_load_interval_seconds': 300, 'completeness_default': 'unknown'}

    def seed(self, count, *, start=1, stamp=None):
        stamp = stamp or datetime.now(timezone.utc)-timedelta(minutes=2)
        with self.source_admin.cursor() as cursor:
            psycopg2.extras.execute_values(cursor, 'INSERT INTO orders.demo VALUES %s',
                [(i, i*10, stamp, stamp, 'fixture-row', 'fixture-sensitive-value') for i in range(start, start+count)])

    def poll(self, contract=None):
        try:
            with patch.object(sync, 'BATCH_SIZE', 2):
                return sync.sync_table_governed(self.source, self.target, contract or self.contract)
        finally:
            self.source.rollback()  # Next poll uses a new source snapshot.

    def checkpoint(self):
        return runtime.read_checkpoint(self.target, self.contract['dataset_id'])

    def target_rows(self):
        with self.target.cursor() as cursor:
            cursor.execute('SELECT id,amount,sensitive_hash FROM orders.demo ORDER BY id')
            return cursor.fetchall()

    def test_full_load_has_atomic_verified_parity_but_incremental_is_not_global_complete(self):
        self.seed(7)
        self.poll()
        checkpoint = self.checkpoint()
        proof = checkpoint['certificate']
        self.assertTrue(runtime.valid_load_evidence(proof, self.contract,
            generation=checkpoint['generation'], schema_fingerprint=checkpoint['schema_fingerprint']))
        self.assertEqual(proof['snapshot']['source']['rows'], 7)
        self.assertEqual(proof['snapshot']['source'], proof['snapshot']['target'])
        self.assertEqual(proof['snapshot']['closed_through'], None)
        self.poll()
        self.assertEqual(self.checkpoint()['completeness'], 'unknown')
        self.assertIsNone(self.checkpoint()['certificate']['snapshot'])

    def test_closed_period_is_rechecked_even_when_source_delete_is_outside_overlap(self):
        contract = deepcopy(self.contract)
        contract['closed_periods'] = [{'id': 'orders-sep2026', 'start': '2026-09-01', 'end': '2026-09-30',
            'clock': 'created_at', 'timezone': 'Asia/Ho_Chi_Minh', 'enabled': True,
            'attested_by': 'admin', 'attested_on': '2026-10-19',
            'authority': 'user_confirmation_20261019', 'must_revoke_before_mutation': True}]
        self.seed(2)
        with self.source_admin.cursor() as cursor:
            cursor.execute("UPDATE orders.demo SET created_at='2026-09-15T12:00:00+07'")
        self.poll(contract)
        self.assertEqual(len(self.checkpoint()['certificate']['closed_periods']), 1)
        with self.source_admin.cursor() as cursor:
            cursor.execute('DELETE FROM orders.demo WHERE id=2')
        self.poll(contract)
        proof = self.checkpoint()['certificate']
        self.assertEqual(proof['closed_periods'], [])
        self.assertEqual(proof['completeness'], 'unknown')
        self.assertEqual(len(self.target_rows()), 2)  # Incremental does not claim deletion repair.

    def test_timestamp_ties_across_batches_and_replay_are_not_lost_or_duplicated(self):
        stamp = datetime.now(timezone.utc)-timedelta(minutes=2)
        self.seed(7, stamp=stamp)
        self.assertEqual(self.poll(), 7)
        self.seed(1, start=8, stamp=stamp)
        self.assertEqual(self.poll(), 8)
        self.assertEqual(len(self.target_rows()), 8)
        self.assertEqual(self.checkpoint()['generation'], 2)
        self.assertEqual(self.checkpoint()['cursor_keys'], ['8'])

    def test_late_commit_before_previous_wall_clock_is_captured_by_overlap(self):
        stamp = datetime.now(timezone.utc)-timedelta(minutes=2)
        self.seed(1, stamp=stamp)
        self.poll()
        self.seed(1, start=2, stamp=stamp-timedelta(seconds=30))
        self.poll()
        self.assertEqual([r[0] for r in self.target_rows()], [1, 2])
        self.assertEqual(self.checkpoint()['completeness'], 'unknown')

    def test_data_and_checkpoint_rollback_together_after_insert_failure(self):
        self.seed(4)
        self.poll()
        before, generation = self.target_rows(), self.checkpoint()['generation']
        self.seed(3, start=5)
        original = psycopg2.extras.execute_values
        calls = []
        def fail_second(*args, **kwargs):
            calls.append(1)
            if len(calls) == 2: raise RuntimeError('fixture injected batch failure')
            return original(*args, **kwargs)
        with patch.object(psycopg2.extras, 'execute_values', side_effect=fail_second), self.assertRaises(RuntimeError):
            self.poll()
        self.assertEqual(self.target_rows(), before)
        self.assertEqual(self.checkpoint()['generation'], generation)

    def test_checkpoint_conflict_rolls_back_already_written_rows(self):
        self.seed(1)
        self.poll()
        self.seed(1, start=2)
        with patch.object(runtime, 'advance_checkpoint', side_effect=runtime.CheckpointConflict('fixture concurrent claim')):
            with self.assertRaises(runtime.CheckpointConflict): self.poll()
        self.assertEqual(len(self.target_rows()), 1)
        self.assertEqual(self.checkpoint()['generation'], 1)

    def test_metadata_failure_after_checkpoint_write_is_still_atomic(self):
        self.seed(1)
        self.poll()
        self.seed(1, start=2)
        with patch.object(sync, 'update_sync_metadata', side_effect=RuntimeError('fixture metadata failed')):
            with self.assertRaises(RuntimeError): self.poll()
        self.assertEqual(len(self.target_rows()), 1)
        self.assertEqual(self.checkpoint()['generation'], 1)

    def test_full_reconcile_schedule_is_independent_of_incremental_successes(self):
        self.seed(3)
        self.poll()
        with self.source_admin.cursor() as cursor: cursor.execute('DELETE FROM orders.demo WHERE id=2')
        with self.target.cursor() as cursor:
            cursor.execute("UPDATE analytics.ingestion_checkpoints SET last_full_reconcile_at=now()-interval '2 hours' "
                           'WHERE dataset_id=%s', (self.contract['dataset_id'],))
        self.target.commit()
        self.poll()
        self.assertEqual([r[0] for r in self.target_rows()], [1, 3])

    def test_empty_full_snapshot_replaces_previous_rows_without_fake_completeness(self):
        self.seed(3)
        self.poll()
        with self.source_admin.cursor() as cursor: cursor.execute('DELETE FROM orders.demo')
        full = {**self.contract, 'mode': 'full_snapshot', 'update_clock': None}
        self.assertEqual(self.poll(full), 0)
        self.assertEqual(self.target_rows(), [])
        self.assertEqual(self.checkpoint()['completeness'], 'complete')
        self.assertEqual(self.checkpoint()['certificate']['snapshot']['source']['rows'], 0)
        self.assertIsNone(self.checkpoint()['certificate']['snapshot']['closed_through'])
        self.assertEqual(self.checkpoint()['observed_rows'], 0)

    def test_type_drift_blocks_before_replacing_old_target(self):
        self.seed(1)
        self.poll()
        with self.source_admin.cursor() as cursor:
            cursor.execute('ALTER TABLE orders.demo ALTER COLUMN amount TYPE text USING amount::text')
        with self.assertRaises(runtime.PipelineContractError): self.poll()
        self.assertEqual(self.checkpoint()['generation'], 1)
        self.assertEqual(len(self.target_rows()), 1)

    def test_credentials_are_redacted_at_source_projection_and_source_is_unchanged(self):
        self.seed(1)
        self.poll()
        self.assertEqual(self.target_rows()[0][2], '[REDACTED]')
        with self.source_admin.cursor() as cursor:
            cursor.execute('SELECT sensitive_hash FROM orders.demo')
            self.assertEqual(cursor.fetchone()[0], 'fixture-sensitive-value')

    def test_source_connection_factory_enforces_repeatable_read_and_readonly(self):
        self.enterContext(patch.dict(os.environ, {'DATA_ANALYST_ENV': 'test', 'DATA_PLATFORM_GOVERNED_INGESTION': '1'}))
        with patch.multiple(sync, SOURCE_DB_HOST='127.0.0.1', SOURCE_DB_PORT=5432, SOURCE_DB_USER='postgres',
                            SOURCE_DB_PASSWORD='fixture-only', SOURCE_DB_NAME='v34_source', SOURCE_DB_SSLMODE='disable'):
            connection = sync.get_source_conn()
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT current_database()')
                self.assertEqual(cursor.fetchone()[0], 'v34_source')
                with self.assertRaises(psycopg2.errors.ReadOnlySqlTransaction):
                    cursor.execute('INSERT INTO orders.demo VALUES (999,1,now(),now(),NULL,%s)', ('fixture',))
        finally:
            connection.rollback()
            connection.close()

    def test_expired_cycle_deadline_does_not_touch_source_or_target(self):
        from unittest.mock import Mock
        source, target = Mock(), Mock()
        with self.assertRaises(TimeoutError):
            sync.sync_table_governed(source, target, self.contract, deadline=0)
        source.cursor.assert_not_called()
        target.cursor.assert_not_called()

    def test_full_snapshot_keeps_committed_replica_readable_during_transfer_and_validation(self):
        self.seed(3)
        self.poll()
        before = self.target_rows()
        self.target.commit()
        with self.source_admin.cursor() as cursor:
            cursor.execute("UPDATE orders.demo SET amount=999 WHERE id=1; DELETE FROM orders.demo WHERE id=2")
        self.seed(1, start=4)
        reader = connect('v34_target')
        self.addCleanup(reader.close)
        reader.set_session(readonly=True, autocommit=True)
        reads = []
        def observe_committed():
            with reader.cursor() as cursor:
                cursor.execute("SET lock_timeout='150ms'")
                cursor.execute('SELECT id,amount,sensitive_hash FROM orders.demo ORDER BY id')
                self.assertEqual(cursor.fetchall(), before)
                reads.append('old_committed')
        original_insert = psycopg2.extras.execute_values
        original_measure = sync._measure_projection
        def insert(*args, **kwargs):
            value = original_insert(*args, **kwargs)
            observe_committed()
            return value
        def measure(*args, **kwargs):
            if args[0] is self.target: observe_committed()
            return original_measure(*args, **kwargs)
        with patch.object(psycopg2.extras, 'execute_values', side_effect=insert), \
             patch.object(sync, '_measure_projection', side_effect=measure):
            self.poll({**self.contract, 'mode':'full_snapshot'})
        self.assertGreaterEqual(len(reads), 3)
        with reader.cursor() as cursor:
            cursor.execute('SELECT id,amount,sensitive_hash FROM orders.demo ORDER BY id')
            after = cursor.fetchall()
        self.assertEqual([row[0] for row in after], [1,3,4])
        self.assertEqual(after[0][1], 999)
        self.assertTrue(all(row[2]=='[REDACTED]' for row in after))
        self.assertEqual(self.checkpoint()['generation'], 2)
        self.assertIsNotNone(self.checkpoint()['certificate']['snapshot'])

    def test_unchanged_full_snapshot_preserves_tuple_versions_and_old_reader_snapshot(self):
        self.seed(3)
        self.poll()
        self.target.commit()
        reader = connect('v34_target')
        self.addCleanup(reader.close)
        reader.set_session(readonly=True, isolation_level='REPEATABLE READ')
        with reader.cursor() as cursor:
            cursor.execute('SELECT id,xmin::text FROM orders.demo ORDER BY id')
            before = cursor.fetchall()
        self.poll({**self.contract, 'mode':'full_snapshot'})
        with reader.cursor() as cursor:
            cursor.execute('SELECT id,xmin::text FROM orders.demo ORDER BY id')
            self.assertEqual(cursor.fetchall(), before)
        reader.rollback()
        with reader.cursor() as cursor:
            cursor.execute('SELECT id,xmin::text FROM orders.demo ORDER BY id')
            self.assertEqual(cursor.fetchall(), before)

    def test_future_source_clock_blocks_and_rolls_back_full_replacement(self):
        self.seed(1)
        self.poll()
        before = self.target_rows(), self.checkpoint()
        self.seed(1, start=2, stamp=datetime.now(timezone.utc)+timedelta(days=1))
        contract = {**self.contract, 'mode': 'full_snapshot'}
        with self.assertRaises(runtime.PipelineContractError):
            self.poll(contract)
        self.assertEqual((self.target_rows(), self.checkpoint()), before)

    def test_naive_update_clock_uses_source_session_timezone(self):
        with self.source_admin.cursor() as cursor:
            cursor.execute("ALTER TABLE orders.demo ALTER updated_at TYPE timestamp USING updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh'")
        self.contract = self.make_contract()
        stamp = datetime.now(timezone.utc)-timedelta(minutes=2)
        with self.source_admin.cursor() as cursor:
            cursor.execute("INSERT INTO orders.demo VALUES (1,10,%s,%s,'fixture','sensitive')",
                           (stamp.astimezone(__import__('zoneinfo').ZoneInfo('Asia/Ho_Chi_Minh')).replace(tzinfo=None), stamp))
        with self.source.cursor() as cursor:
            cursor.execute("SET TIME ZONE 'Asia/Ho_Chi_Minh'")
        self.source.commit()
        self.poll()
        self.assertAlmostEqual((self.checkpoint()['cursor_time']-stamp).total_seconds(), 0, places=4)
        self.poll()
        self.assertEqual(len(self.target_rows()), 1)

    def test_realtime_projection_is_idempotent_by_broker_position(self):
        from stream_runtime import broker_record, project_records
        record = broker_record('fixture-orders', 0, 7, b'{"event_type":"updated","data":{"id":1}}')
        with self.target.cursor() as cursor:
            cursor.execute("DELETE FROM public.realtime_events WHERE topic='fixture-orders'")
        self.target.commit()
        project_records(self.target, [record, record])
        project_records(self.target, [record])
        with self.target.cursor() as cursor:
            cursor.execute("SELECT count(*),min(event_id) FROM public.realtime_events WHERE topic='fixture-orders'")
            self.assertEqual(cursor.fetchone(), (1, record['event_id']))

    def test_reader_and_writer_groups_have_no_superuser_or_audit_delete_permissions(self):
        sync.ensure_target_contract(self.target, self.contract)
        with self.target.cursor() as cursor:
            cursor.execute("SELECT rolname,rolsuper,rolcreaterole,rolcreatedb,rolbypassrls FROM pg_roles "
                "WHERE rolname IN ('avengers_analytics_reader','avengers_report_writer','avengers_pipeline_writer')")
            rows = cursor.fetchall()
            self.assertEqual(len(rows), 3)
            self.assertTrue(all(not any(row[1:]) for row in rows))
            cursor.execute("SELECT has_table_privilege('avengers_report_writer','analytics.audit_events','DELETE'), "
                "has_table_privilege('avengers_report_writer','analytics.audit_events','UPDATE'), "
                "has_table_privilege('avengers_analytics_reader','orders.demo','SELECT')")
            self.assertEqual(cursor.fetchone(), (False, False, False))

    def publisher_contract(self, *, clock=True):
        return {'stream_id': 'fixture-publisher', 'source_table': 'orders.demo', 'primary_key': ['id'],
                'columns': ['id', 'amount', 'updated_at', 'label'], 'event_type': 'fixture_observed',
                'update_clock': 'updated_at' if clock else None, 'clock_type': 'timestamp with time zone',
                'overlap_seconds': 600, 'full_reconcile_seconds': 3600}

    def fake_producer(self, *, fail_at=None):
        from unittest.mock import Mock
        producer = Mock()
        producer.events = []
        def send(topic, **kwargs):
            producer.events.append(kwargs['value'])
            future = Mock()
            if len(producer.events) == fail_at:
                future.get.side_effect = TimeoutError('fixture delivery future failed')
            return future
        producer.send.side_effect = send
        return producer

    def test_publisher_ties_resume_across_pages_and_replay_has_stable_event_ids(self):
        from producer_runtime import poll_stream, load_cursor
        self.seed(7)
        contract, producer = self.publisher_contract(), self.fake_producer()
        pages = []
        for _ in range(4):
            pages.append(poll_stream(producer, self.source, self.target, contract, limit=2))
        self.assertEqual([p['published'] for p in pages], [2, 2, 2, 1])
        self.assertEqual(len({event['event_id'] for event in producer.events}), 7)
        self.assertFalse(pages[-1]['has_more'])
        first_ids = [event['event_id'] for event in producer.events]
        replay = self.fake_producer()
        poll_stream(replay, self.source, self.target, contract, limit=2)
        self.assertEqual([event['event_id'] for event in replay.events], first_ids[:2])
        generation, state = load_cursor(self.target, contract)
        self.assertEqual(generation, 5)
        self.assertEqual(state['completeness'], 'unknown')

    def test_failed_delivery_future_never_advances_publisher_cursor(self):
        from producer_runtime import poll_stream, load_cursor
        self.seed(3)
        contract, producer = self.publisher_contract(), self.fake_producer(fail_at=2)
        with self.assertRaises(TimeoutError): poll_stream(producer, self.source, self.target, contract, limit=3)
        self.assertEqual(load_cursor(self.target, contract), (0, {}))
        replay = self.fake_producer()
        poll_stream(replay, self.source, self.target, contract, limit=3)
        self.assertEqual(replay.events[0]['event_id'], producer.events[0]['event_id'])

    def test_failure_after_delivery_before_cursor_commit_replays_same_events(self):
        import producer_runtime
        self.seed(2)
        contract, producer = self.publisher_contract(), self.fake_producer()
        with patch.object(producer_runtime, 'save_cursor', side_effect=RuntimeError('fixture cursor crash')):
            with self.assertRaises(RuntimeError): producer_runtime.poll_stream(producer, self.source, self.target, contract)
        self.assertEqual(producer_runtime.load_cursor(self.target, contract), (0, {}))
        replay = self.fake_producer()
        producer_runtime.poll_stream(replay, self.source, self.target, contract)
        self.assertEqual([e['event_id'] for e in replay.events], [e['event_id'] for e in producer.events])

    def test_no_clock_item_scan_uses_own_stable_key_and_reobserves_updates(self):
        from producer_runtime import poll_stream
        self.seed(5)
        contract, producer = self.publisher_contract(clock=False), self.fake_producer()
        for _ in range(3): poll_stream(producer, self.source, self.target, contract, limit=2)
        self.assertEqual([e['data']['id'] for e in producer.events], [1,2,3,4,5])
        # Advance the durable reconciliation clock, without sleeping or changing
        # source data timestamps: a clockless stream observes edits on full scans.
        from producer_runtime import load_cursor, save_cursor
        generation, state = load_cursor(self.target, contract)
        state['last_full_at'] = (datetime.now(timezone.utc)-timedelta(seconds=3601)).isoformat()
        save_cursor(self.target, contract, state, generation)
        with self.source_admin.cursor() as cursor: cursor.execute('UPDATE orders.demo SET amount=999 WHERE id=1')
        replay = self.fake_producer()
        poll_stream(replay, self.source, self.target, contract, limit=2)
        self.assertNotEqual(replay.events[0]['event_id'], producer.events[0]['event_id'])
        self.assertEqual(replay.events[0]['data']['amount'], '999')

    def test_completed_clock_stream_waits_while_sibling_pages_drain(self):
        from producer_runtime import poll_stream, load_cursor
        self.seed(1)
        contract, producer = self.publisher_contract(), self.fake_producer()
        poll_stream(producer, self.source, self.target, contract)
        before = load_cursor(self.target, contract)
        result = poll_stream(producer, self.source, self.target, contract, poll_interval_seconds=60)
        self.assertEqual(result['published'], 0)
        self.assertFalse(result['has_more'])
        self.assertEqual(len(producer.events), 1)
        self.assertEqual(load_cursor(self.target, contract), before)

    def test_clockless_publisher_waits_for_full_reconcile_before_rescan(self):
        from producer_runtime import poll_stream, load_cursor
        self.seed(1)
        contract, producer = self.publisher_contract(clock=False), self.fake_producer()
        poll_stream(producer, self.source, self.target, contract)
        before = load_cursor(self.target, contract)
        result = poll_stream(producer, self.source, self.target, contract)
        self.assertEqual(result['published'], 0)
        self.assertFalse(result['has_more'])
        self.assertEqual(len(producer.events), 1)
        self.assertEqual(load_cursor(self.target, contract), before)

    def test_changed_stream_contract_requires_explicit_checkpoint_migration(self):
        from producer_runtime import poll_stream
        self.seed(1)
        contract = self.publisher_contract()
        poll_stream(self.fake_producer(), self.source, self.target, contract)
        changed = {**contract, 'columns': ['id','updated_at']}
        producer = self.fake_producer()
        with self.assertRaises(runtime.PipelineContractError): poll_stream(producer, self.source, self.target, changed)
        producer.send.assert_not_called()
