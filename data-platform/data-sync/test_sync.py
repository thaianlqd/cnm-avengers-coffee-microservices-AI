import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).with_name("sync.py")
SPEC = importlib.util.spec_from_file_location("data_sync_module", MODULE_PATH)
sync = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(sync)


class FakeCursor:
    def __init__(self, connection, rows=None, events=None):
        self.connection = connection
        self.rows = rows or []
        self.events = events

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def execute(self, sql, params=None):
        self.connection.statements.append(sql.strip())
        if self.events is not None:
            self.events.append("source-query")

    def fetchall(self):
        return self.rows


class FakeConnection:
    def __init__(self, rows=None, events=None):
        self.rows = rows or []
        self.events = events
        self.statements = []
        self.commits = 0
        self.rollbacks = 0

    def cursor(self, **_kwargs):
        return FakeCursor(self, self.rows, self.events)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1


class SyncTransactionTests(unittest.TestCase):
    def test_full_sync_commits_truncate_and_insert_once(self):
        source = FakeConnection(rows=[{"id": 1, "name": "old-safe"}])
        target = FakeConnection()
        calls = []

        with patch.object(sync, "ensure_target_table"), \
             patch.object(sync, "update_sync_metadata"), \
             patch.object(sync.psycopg2.extras, "execute_batch", side_effect=lambda *_args, **_kwargs: calls.append("insert")):
            count = sync.sync_table_full(source, target, "orders", "demo")

        self.assertEqual(count, 1)
        self.assertEqual(target.commits, 1)
        self.assertEqual(target.rollbacks, 0)
        self.assertTrue(any(statement.startswith("TRUNCATE TABLE") for statement in target.statements))
        self.assertEqual(calls, ["insert"])

    def test_full_sync_insert_failure_rolls_back_truncate(self):
        source = FakeConnection(rows=[{"id": 1}])
        target = FakeConnection()

        with patch.object(sync, "ensure_target_table"), \
             patch.object(sync, "update_sync_metadata"), \
             patch.object(sync.psycopg2.extras, "execute_batch", side_effect=RuntimeError("insert failed")):
            with self.assertRaisesRegex(RuntimeError, "insert failed"):
                sync.sync_table_full(source, target, "orders", "demo")

        self.assertEqual(target.commits, 0)
        self.assertEqual(target.rollbacks, 1)
        self.assertTrue(any(statement.startswith("TRUNCATE TABLE") for statement in target.statements))

    def test_incremental_sync_evolves_schema_before_reading_new_rows(self):
        events = []
        source = FakeConnection(rows=[], events=events)
        target = FakeConnection()

        with patch.object(sync, "ensure_target_table", side_effect=lambda *_args: events.append("schema")):
            count = sync.sync_table_incremental(source, target, "orders", "demo", "updated_at", object())

        self.assertEqual(count, 0)
        self.assertEqual(events[:2], ["schema", "source-query"])


if __name__ == "__main__":
    unittest.main()
