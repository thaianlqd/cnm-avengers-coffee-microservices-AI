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


class WarehouseViewTests(unittest.TestCase):
    def view(self, name):
        names = [view for view, _ in sync.WAREHOUSE_VIEWS]
        self.assertEqual(names.count(name), 1)
        return names.index(name), dict(sync.WAREHOUSE_VIEWS)[name]

    def test_promotion_usage_view_is_aggregate_safe_and_ordered(self):
        position, ddl = self.view("silver.khuyen_mai_su_dung")
        # Depends on the silver promotion view, so it must be created after it.
        self.assertGreater(position, self.view("silver.khuyen_mai")[0])
        select = ddl.split("FROM", 1)[0].lower()
        for column in ("ma_su_dung", "ma_khuyen_mai", "ten_khuyen_mai", "co_so_ma", "ngay_su_dung"):
            self.assertIn(column, select)
        # Neither the customer link nor the order link is exposed to analytics.
        for column in ("ma_nguoi_dung", "u.ma_don_hang", "so_dien_thoai", "email", "dia_chi"):
            self.assertNotIn(column, select)
        self.assertNotIn("INSERT", ddl.upper()); self.assertNotIn("DELETE", ddl.upper())

    def test_view_definitions_are_read_only_ddl(self):
        for name, ddl in sync.WAREHOUSE_VIEWS:
            with self.subTest(view=name):
                self.assertTrue(ddl.strip().upper().startswith("CREATE OR REPLACE VIEW " + name.upper()))
                for word in ("DROP ", "TRUNCATE ", "DELETE ", "UPDATE ", "INSERT "):
                    self.assertNotIn(word, ddl.upper())


if __name__ == "__main__":
    unittest.main()
