"""Bounded dependency checks, separate from process liveness. Never provider/DDL."""
import json
import logging
import os
import time
from contextlib import contextmanager

VERSION = '3.0.0'
_catalog_cache = (0, False)
_registry_drift = None


def warehouse_connection():
    import db
    user,password=db.connection_credentials('READER')
    if os.getenv('DATA_ANALYST_ENV')=='production' and not (user and password):
        raise RuntimeError('Production warehouse reader is not configured')
    return db.psycopg2.connect(host=db.DB_HOST, port=db.DB_PORT, user=user or db.DB_USER,
        password=password or db.DB_PASSWORD, dbname=db.DB_NAME, sslmode=db.DB_SSLMODE,
        cursor_factory=db.psycopg2.extras.RealDictCursor, connect_timeout=2,
        options='-c default_transaction_read_only=on -c statement_timeout=1000')


def warehouse_probe():
    conn = warehouse_connection()
    try:
        with conn.cursor() as cur:
            from psycopg2 import sql
            from services.query_execution_batch import snapshot_lock_relations
            # A successful SELECT 1 cannot prove that the report snapshot can
            # start under the dedicated column-only reader. Core relation locks
            # are bounded and released immediately; no business rows are read.
            cur.execute('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
            cur.execute("SET LOCAL lock_timeout='500ms'")
            relations=snapshot_lock_relations({'silver.don_hang','silver.chi_nhanh'})
            cur.execute(sql.SQL('LOCK TABLE {} IN ACCESS SHARE MODE').format(
                sql.SQL(', ').join(sql.Identifier(*name.split('.')) for name in relations)))
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
    from services.semantic_catalog_validation import validate_catalog, registry_drift
    validate_catalog(overlay, strict=True)
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
    # Schema drift is surfaced, never silently ignored. Drifted capabilities are
    # already excluded from the executable index, so the rest stays usable.
    global _registry_drift
    _registry_drift = registry_drift(catalog)
    if _registry_drift:
        # Physical table/column names stay in server logs, not the public probe.
        logging.getLogger(__name__).warning("[RegistryDrift] %s", json.dumps(_registry_drift[:50], ensure_ascii=False, default=str))
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
    try:
        # V3.1: an invalid repair allowance is a configuration error at
        # readiness, not something discovered on the first semantic failure.
        from services.provider_budget import semantic_repair_limit
        semantic_repair_limit()
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
    result['registry_drift'] = None if _registry_drift is None else dict(
        status='consistent' if not _registry_drift else 'drift_detected',
        issue_count=len(_registry_drift),
        codes=sorted({i.get('code') for i in _registry_drift}))
    result['status'] = 'ready' if ready else 'not_ready'
    return result
