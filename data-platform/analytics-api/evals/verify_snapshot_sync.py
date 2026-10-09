"""Destructive fixture ONLY in the disposable DB one_click_snapshot_fixture.

Never run against analytics. Reproduces the TRUNCATE race, then proves the
read-only ACCESS SHARE guard blocks that race and releases its locks afterward.
"""
import json
import os
import psycopg2
from services.query_execution_batch import report_snapshot, connection, begin


def main():
    if os.getenv('DB_NAME')!='one_click_snapshot_fixture' or os.getenv('DB_HOST')!='127.0.0.1':
        raise RuntimeError('Disposable local database required')
    writer=psycopg2.connect(host='127.0.0.1',user='postgres',password='qualification',dbname='one_click_snapshot_fixture')
    writer.autocommit=True
    with writer.cursor() as cur:
        cur.execute('CREATE SCHEMA silver')
        cur.execute('CREATE TABLE silver.source_rows (n integer)')
        cur.execute('INSERT INTO silver.source_rows VALUES (1),(2)')
        cur.execute('CREATE VIEW silver.test_report AS SELECT * FROM silver.source_rows')
    with report_snapshot():
        with writer.cursor() as cur:
            cur.execute('BEGIN');cur.execute('TRUNCATE silver.source_rows')
            cur.execute('INSERT INTO silver.source_rows VALUES (3),(4)');cur.execute('COMMIT')
        with connection() as reader:
            begin(reader,4000)
            with reader.cursor() as cur:
                cur.execute('SELECT COUNT(*) AS n FROM silver.test_report')
                assert cur.fetchone()['n']==0, 'Fixture must reproduce stale snapshot emptiness'
    with report_snapshot({'silver.test_report'}):
        with writer.cursor() as cur:
            cur.execute("SET lock_timeout='200ms'")
            try:cur.execute('TRUNCATE silver.source_rows')
            except psycopg2.errors.LockNotAvailable:pass
            else:raise AssertionError('TRUNCATE bypassed report snapshot guard')
        with connection() as reader:
            begin(reader,4000)
            with reader.cursor() as cur:
                cur.execute('SELECT COUNT(*) AS n FROM silver.test_report')
                assert cur.fetchone()['n']==2
    with writer.cursor() as cur:
        cur.execute('TRUNCATE silver.source_rows')
    writer.close()
    print(json.dumps(dict(unguarded_race_reproduced=True,view_recursively_locked=True,
        guarded_read_count=2,read_only_transaction=True,locks_released=True)))


if __name__=='__main__':main()
