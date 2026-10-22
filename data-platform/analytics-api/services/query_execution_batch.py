"""Bounded analytical connections and one PostgreSQL snapshot per report."""
from contextlib import contextmanager
from contextvars import ContextVar
import threading
import time
import os

from services.analysis_catalog import AnalysisError
from services.provider_budget import check_request_deadline, request_deadline

snapshot_id = ContextVar('analysis_snapshot_id', default=None)
data_epoch = ContextVar('analysis_data_epoch', default=None)
active_connections = ContextVar('analysis_active_connections', default=None)
_pool = None
_pool_reader = None
_lock = threading.Lock()
SQL_CONNECTIONS=6
SQL_QUERY_CONCURRENCY=2
_snapshot_slots=threading.BoundedSemaphore(SQL_CONNECTIONS//(SQL_QUERY_CONCURRENCY+1))


class Connections:
    def __init__(self):
        self.lock = threading.Lock()
        self.connections = set()

    def add(self, conn):
        with self.lock:
            self.connections.add(conn)

    def remove(self, conn):
        with self.lock:
            self.connections.discard(conn)

    def cancel(self):
        with self.lock:
            for conn in list(self.connections):
                try:
                    conn.cancel()
                except Exception:
                    pass


def pool():
    global _pool,_pool_reader
    from services.access_policy import active_principal
    import db
    reader_user,reader_password=db.connection_credentials('READER')
    if (active_principal.get() is not None or os.getenv('DATA_ANALYST_ENV')=='production') and not (reader_user and reader_password):
        raise AnalysisError('configuration','Dedicated warehouse reader credentials are required')
    if _pool is not None and reader_user and _pool_reader!=reader_user:
        raise AnalysisError('configuration','Reader connection profile changed; restart after draining active work')
    if _pool is None:
        with _lock:
            if _pool is None:
                import db
                from psycopg2.pool import ThreadedConnectionPool
                _pool = ThreadedConnectionPool(1, SQL_CONNECTIONS, host=db.DB_HOST, port=db.DB_PORT,
                    user=reader_user or db.DB_USER, password=reader_password or db.DB_PASSWORD, dbname=db.DB_NAME,
                    sslmode=db.DB_SSLMODE, cursor_factory=db.psycopg2.extras.RealDictCursor,
                    connect_timeout=2)
                _pool_reader=reader_user
    return _pool


def timeout_ms(maximum):
    check_request_deadline()
    deadline = request_deadline.get()
    return min(maximum, max(1, int((deadline-time.monotonic())*1000))) if deadline else maximum


def snapshot_relations():
    import json
    import re
    from services.analysis_catalog import CATALOG_PATH
    names=sorted(json.loads(CATALOG_PATH.read_text())['silver_tables'])
    if any(not re.fullmatch(r'silver\.[a-z_][a-z0-9_]*',name) for name in names):
        raise AnalysisError('metadata','Invalid snapshot relation inventory')
    return names


def snapshot_lock_relations(tables):
    """Lock only compiler-known relations, preserving column-only SELECT grants.

    PostgreSQL's explicit LOCK requires a relation-level SELECT privilege.
    Dedicated readers instead lock zero-row, constant-column guard views whose
    owners hold the underlying relation locks. No source SELECT is performed
    before these locks establish the report's TRUNCATE protection.
    """
    import db
    names = sorted(set(tables))
    allowed = set(snapshot_relations())
    if any(name not in allowed for name in names):
        raise AnalysisError('metadata', 'Snapshot relation is outside analytical catalog')
    reader_user, reader_password = db.connection_credentials('READER')
    if reader_user and reader_password:
        return ['analytics.snapshot_lock__' + name.split('.')[1] for name in names]
    return names  # Explicit development fixtures retain the legacy protocol.


@contextmanager
def connection():
    from psycopg2.pool import PoolError
    from services.telemetry import span
    started = time.monotonic()
    with span('db_acquire'):
        while True:
            check_request_deadline()
            try:
                conn = pool().getconn()
                break
            except PoolError:
                if time.monotonic()-started > 2:
                    raise AnalysisError('execution', 'Analytical connection capacity exhausted') from None
                time.sleep(0.02)
    registry = active_connections.get()
    if registry:
        registry.add(conn)
    try:
        yield conn
    finally:
        if registry:
            registry.remove(conn)
        broken = bool(conn.closed)
        try:
            conn.rollback()
        except Exception:
            broken = True
        finally:
            pool().putconn(conn, close=broken)


@contextmanager
def snapshot_admission():
    """Reserve room for exporter plus readers, including legacy HTTP callers."""
    started=time.monotonic()
    while True:
        check_request_deadline()
        if _snapshot_slots.acquire(blocking=False):break
        if time.monotonic()-started>=2:
            raise AnalysisError('execution','Report snapshot capacity exhausted')
        time.sleep(.02)
    try:yield
    finally:_snapshot_slots.release()


@contextmanager
def report_snapshot(tables=()):
    check_request_deadline()
    from services.data_coverage_service import peek
    observed=peek() or {}
    source_health=(observed.get('data_health') or {}).get('views') or {}
    if any(source_health.get(table,{}).get('status')=='blocked' for table in tables):
        raise AnalysisError('data_health','Nguồn dữ liệu cần thiết đang bị chặn; chưa thể thực hiện phân tích.')
    with snapshot_admission(),connection() as conn:
        with conn.cursor() as cur:
            cur.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
            cur.execute('SET LOCAL statement_timeout = %s', (timeout_ms(12000),))
            cur.execute('SET LOCAL lock_timeout = %s', (timeout_ms(2000),))
            if tables:
                # The sync service replaces base tables with TRUNCATE + INSERT.
                # TRUNCATE is not MVCC-safe. Lock the compiler-approved views
                # (PostgreSQL locks their underlying relations recursively)
                # BEFORE the first SELECT establishes a repeatable-read snapshot.
                # ACCESS SHARE permits ordinary INSERT/UPDATE/DELETE writers.
                from psycopg2 import sql
                names = snapshot_lock_relations(tables)
                cur.execute(sql.SQL('LOCK TABLE {} IN ACCESS SHARE MODE').format(
                    sql.SQL(', ').join(sql.Identifier(*t.split('.')) for t in names)))
            cur.execute('SELECT pg_export_snapshot() AS snapshot_id')
            value = cur.fetchone()['snapshot_id']
            epoch = read_data_epoch(cur,tables)
        token = snapshot_id.set(value)
        epoch_token=data_epoch.set(epoch)
        try:
            yield value
        finally:
            snapshot_id.reset(token)
            data_epoch.reset(epoch_token)


def read_data_epoch(cursor,tables):
    """Metadata vector within the report transaction; never source atomicity."""
    import json
    from pathlib import Path
    from services.access_policy import digest
    registry=json.loads((Path(__file__).resolve().parent.parent/'metadata/warehouse_views.json').read_text())
    sources=sorted({source for view in registry['views'] if view['name'] in tables for source in view['source_dependencies']})
    if not sources:return {'status':'not_measured','reason':'source_lineage_unavailable'}
    ids=['replica.'+source for source in sources]
    cursor.execute('SAVEPOINT epoch_observation')
    try:
        cursor.execute('SELECT dataset_id,generation,schema_fingerprint FROM analytics.ingestion_checkpoints '
            'WHERE dataset_id=ANY(%s) ORDER BY dataset_id',(ids,))
        rows=[dict(row) for row in cursor.fetchall()]
        if len(rows)!=len(ids) or any(not row.get('generation') or not row.get('schema_fingerprint') for row in rows):
            result={'status':'not_measured','reason':'governed_generation_missing'}
        else:
            result={'status':'observed','sources':rows,'fingerprint':digest(rows),
                    'basis':'Observed per-source replica generations, not source transaction or completeness proof'}
    except Exception:
        cursor.execute('ROLLBACK TO SAVEPOINT epoch_observation')
        result={'status':'not_measured','reason':'generation_observation_unavailable'}
    finally:
        cursor.execute('RELEASE SAVEPOINT epoch_observation')
    return result


def begin(conn, maximum):
    with conn.cursor() as cur:
        value = snapshot_id.get()
        if value:
            cur.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
            cur.execute('SET TRANSACTION SNAPSHOT %s', (value,))
        else:
            cur.execute('SET TRANSACTION READ ONLY')
        cur.execute('SET LOCAL statement_timeout = %s', (timeout_ms(maximum),))
        cur.execute('SET LOCAL lock_timeout = %s', (timeout_ms(2000),))
