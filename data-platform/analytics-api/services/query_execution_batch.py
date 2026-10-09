"""Bounded analytical connections and one PostgreSQL snapshot per report."""
from contextlib import contextmanager
from contextvars import ContextVar
import threading
import time

from services.analysis_catalog import AnalysisError
from services.provider_budget import check_request_deadline, request_deadline

snapshot_id = ContextVar('analysis_snapshot_id', default=None)
active_connections = ContextVar('analysis_active_connections', default=None)
_pool = None
_lock = threading.Lock()


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
    global _pool
    if _pool is None:
        with _lock:
            if _pool is None:
                import db
                from psycopg2.pool import ThreadedConnectionPool
                _pool = ThreadedConnectionPool(1, 12, host=db.DB_HOST, port=db.DB_PORT,
                    user=db.DB_USER, password=db.DB_PASSWORD, dbname=db.DB_NAME,
                    sslmode=db.DB_SSLMODE, cursor_factory=db.psycopg2.extras.RealDictCursor,
                    connect_timeout=2)
    return _pool


def timeout_ms(maximum):
    check_request_deadline()
    deadline = request_deadline.get()
    return min(maximum, max(1, int((deadline-time.monotonic())*1000))) if deadline else maximum


@contextmanager
def connection():
    from psycopg2.pool import PoolError
    started = time.monotonic()
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
def report_snapshot(tables=()):
    check_request_deadline()
    with connection() as conn:
        with conn.cursor() as cur:
            cur.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
            cur.execute('SET LOCAL statement_timeout = %s', (timeout_ms(12000),))
            if tables:
                # The sync service replaces base tables with TRUNCATE + INSERT.
                # TRUNCATE is not MVCC-safe. Lock the compiler-approved views
                # (PostgreSQL locks their underlying relations recursively)
                # BEFORE the first SELECT establishes a repeatable-read snapshot.
                # ACCESS SHARE permits ordinary INSERT/UPDATE/DELETE writers.
                from psycopg2 import sql
                import re
                names = sorted(set(tables))
                if any(not re.fullmatch(r'silver\.[a-z_][a-z0-9_]*',t) for t in names):
                    raise AnalysisError('metadata', 'Snapshot relation is outside analytical catalog')
                cur.execute(sql.SQL('LOCK TABLE {} IN ACCESS SHARE MODE').format(
                    sql.SQL(', ').join(sql.Identifier(*t.split('.')) for t in names)))
            cur.execute('SELECT pg_export_snapshot() AS snapshot_id')
            value = cur.fetchone()['snapshot_id']
        token = snapshot_id.set(value)
        try:
            yield value
        finally:
            snapshot_id.reset(token)


def begin(conn, maximum):
    with conn.cursor() as cur:
        value = snapshot_id.get()
        if value:
            cur.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
            cur.execute('SET TRANSACTION SNAPSHOT %s', (value,))
        else:
            cur.execute('SET TRANSACTION READ ONLY')
        cur.execute('SET LOCAL statement_timeout = %s', (timeout_ms(maximum),))
