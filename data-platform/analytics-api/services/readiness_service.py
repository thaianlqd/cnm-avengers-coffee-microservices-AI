"""Bounded dependency checks, separate from process liveness. Never provider/DDL."""
import json
import os
import time
from contextlib import contextmanager

VERSION = '2.13.0'
_catalog_cache = (0, False)


def warehouse_connection():
    import db
    return db.psycopg2.connect(host=db.DB_HOST, port=db.DB_PORT, user=db.DB_USER,
        password=db.DB_PASSWORD, dbname=db.DB_NAME, sslmode=db.DB_SSLMODE,
        cursor_factory=db.psycopg2.extras.RealDictCursor, connect_timeout=2,
        options='-c default_transaction_read_only=on -c statement_timeout=1000')


def warehouse_probe():
    conn = warehouse_connection()
    try:
        with conn.cursor() as cur:
            cur.execute('SELECT 1')
            return bool(cur.fetchone())
    finally:
        conn.rollback()
        conn.close()


def catalog_probe(physical_required):
    global _catalog_cache
    from services.analysis_catalog import AnalysisCatalog, CATALOG_PATH
    from services.domain_intelligence_service import validate_profiles
    overlay = json.loads(CATALOG_PATH.read_text())
    registry=overlay['analysis_registry']
    from services.semantic_catalog_validation import validate_catalog
    validate_catalog(overlay)
    if not physical_required:
        return bool(registry['metrics'] and registry['dimensions'])
    if _catalog_cache[0] > time.monotonic():
        return _catalog_cache[1]
    from services.metadata_service import _introspect
    from services.analytical_resolver import compatibility_index
    @contextmanager
    def connection():
        conn = warehouse_connection()
        try:
            yield conn
        finally:
            conn.rollback()
            conn.close()
    catalog = AnalysisCatalog(_introspect(connection, ['silver']))
    ready = bool(compatibility_index(catalog).metrics)
    _catalog_cache = (time.monotonic()+60, ready)
    return ready


def redis_probe():
    import redis
    url = os.getenv('DATA_ANALYST_REDIS_URL', '')
    if not url:
        return False
    client = redis.Redis.from_url(url, socket_connect_timeout=1, socket_timeout=1,
                                 retry_on_timeout=False)
    try:
        return bool(client.ping())
    finally:
        client.close()


def readiness():
    session = os.getenv('DATA_ANALYST_SESSION_STORE', 'memory')
    artifact = os.getenv('DATA_ANALYST_ARTIFACT_STORE', session)
    production = os.getenv('DATA_ANALYST_ENV', 'development') == 'production'
    warehouse_required = production or os.getenv('DATA_ANALYST_READINESS_REQUIRE_WAREHOUSE', 'false').lower() == 'true'
    config = session in {'redis','memory'} and artifact in {'redis','memory'}
    config = config and not (production and (session=='memory' or artifact=='memory'))
    config = config and not (artifact=='redis' and session!='redis')
    try:
        from services.analytical_capacity_planner import AnalyticalCapacityContract
        AnalyticalCapacityContract.from_env()
    except Exception:
        config = False
    result = dict(status='not_ready',service='avengers-analytics-api',version=VERSION,
        session_backend=session,artifact_backend=artifact,backend_configuration_valid=config,
        redis_required='redis' in {session,artifact}, redis_available=None,
        catalog_ready=False,warehouse_required=warehouse_required,warehouse_available=None)
    from services.provider_health_service import provider_health
    result['provider_status']=provider_health()
    if result['redis_required']:
        try:
            result['redis_available'] = redis_probe()
        except Exception:
            result['redis_available'] = False
    if warehouse_required:
        try:
            result['warehouse_available'] = warehouse_probe()
        except Exception:
            result['warehouse_available'] = False
    try:
        if not warehouse_required or result['warehouse_available']:
            result['catalog_ready'] = catalog_probe(warehouse_required)
    except Exception:
        result['catalog_ready'] = False
    ready = config and result['catalog_ready'] and (not result['redis_required'] or result['redis_available']) and (
        not warehouse_required or result['warehouse_available'])
    result['status'] = 'ready' if ready else 'not_ready'
    return result
