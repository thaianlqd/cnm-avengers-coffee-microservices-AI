"""Cached data coverage/freshness snapshot (V3.1 Analyst Workspace).

The snapshot is refreshed outside the preflight hot path (capabilities request
or an explicit refresh) through a bounded read-only connection. ``peek`` never
performs I/O, so typing-time preflight cannot query the warehouse.
"""
import logging
import time
from copy import deepcopy
from datetime import date, datetime, timezone
from threading import Lock

from services.analysis_catalog import referenced_columns
import hashlib
import json
from pathlib import Path

TTL_SECONDS = 60
_lock = Lock()
_snapshot = None  # {"value": dict, "expires": monotonic}
logger = logging.getLogger("ai-analytics")
_METADATA = Path(__file__).resolve().parent.parent / 'metadata'


def fact_clocks(registry, tables):
    """Governed (subject -> table, time column) for complete historical facts."""
    clocks = {}
    for id, subject in registry["subjects"].items():
        column = subject.get("time_column")
        if not column or tables.get(subject["source"], {}).get("source_scope") != "FULL_FACT":
            continue
        table, name = referenced_columns(column)[0]
        clocks.setdefault((table, name), {"table": table, "column": name, "subjects": []})["subjects"].append(id)
    return sorted(clocks.values(), key=lambda c: (c["table"], c["column"]))


def _iso(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat() if value.tzinfo is None else value.astimezone(timezone.utc).date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)[:10]


def _stamp(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).astimezone(timezone.utc).isoformat()
    return str(value)


def build_snapshot(rows, sync, overlay, now=None):
    """Pure assembly from observed bounds; testable without a warehouse."""
    registry, tables = overlay["analysis_registry"], overlay["silver_tables"]
    now = now or datetime.now(timezone.utc)
    stale_hours = registry.get("workspace", {}).get("freshness", {}).get("stale_after_hours", 48)
    facts = {}
    for clock in fact_clocks(registry, tables):
        bounds = rows.get(clock["table"] + "." + clock["column"]) or {}
        label = tables[clock["table"]].get("business_name", clock["table"])
        facts[clock["table"]] = {"label": label, "subjects": clock["subjects"],
                                 "min_date": _iso(bounds.get("min")), "max_date": _iso(bounds.get("max")),
                                 "rows": bounds.get("rows"), "completeness": bounds.get("completeness", "unknown")}
    known = [f for f in facts.values() if f["min_date"] and f["max_date"]]
    overall = {"min_date": min((f["min_date"] for f in known), default=None),
               "max_date": max((f["max_date"] for f in known), default=None)}
    last_sync = (sync or {}).get("finished_at")
    max_data = overall["max_date"]
    lag_hours = None
    if last_sync:
        moment = last_sync if isinstance(last_sync, datetime) else datetime.fromisoformat(str(last_sync))
        moment = moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)
        lag_hours = round((now - moment).total_seconds() / 3600, 1)
    # Batch data is stale when the newest observed business day is far behind
    # today, even if the sync job itself ran recently (source stopped producing).
    data_lag_hours = None
    if max_data:
        data_lag_hours = round((now - datetime.fromisoformat(max_data).replace(tzinfo=timezone.utc)).total_seconds() / 3600, 1)
    for fact in facts.values():
        latest=fact.get('max_date')
        lag=round((now-datetime.fromisoformat(latest).replace(tzinfo=timezone.utc)).total_seconds()/3600,1) if latest else None
        fact.update(data_lag_hours=lag, stale=None if lag is None else lag>stale_hours+24)
    stale = bool(any(f.get('stale') for f in facts.values()) or lag_hours is not None and lag_hours>stale_hours)
    data_health = (sync or {}).get('data_health')
    if data_health:
        for table, fact in facts.items():
            source = data_health['views'].get(table, {})
            fact.update(health_status=source.get('status', 'unknown'),
                        health_reasons=source.get('reasons', []), source_generations=source.get('generations', {}),
                        completeness='unknown')
    return {"status": "ready" if known else "unavailable", "overall": overall, "facts": facts,
            'data_health': data_health,
            "freshness": {"mode": "batch", "label": "Cập nhật theo đợt", "last_sync": _stamp(last_sync),
                          "last_sync_status": (sync or {}).get("status"), "max_data_timestamp": max_data,
                          "sync_lag_hours": lag_hours, "data_lag_hours": data_lag_hours,
                          "stale_after_hours": stale_hours, "stale": stale},
            "observed_at": now.isoformat()}


def _query(connection, overlay):
    from psycopg2 import sql
    registry, tables = overlay["analysis_registry"], overlay["silver_tables"]
    rows = {}
    with connection.cursor() as cur:
        for clock in fact_clocks(registry, tables):
            schema, name = clock["table"].split(".")
            try:
                cur.execute(sql.SQL("SELECT MIN({c}) AS min, MAX({c}) AS max FROM {s}.{t}").format(
                    c=sql.Identifier(clock["column"]), s=sql.Identifier(schema), t=sql.Identifier(name)))
                rows[clock["table"] + "." + clock["column"]] = dict(cur.fetchone())
            except Exception:
                connection.rollback()
                logger.warning("[DataCoverage] bound unavailable table=%s", clock["table"])
        sync = None
        try:
            cur.execute("SELECT finished_at, status FROM public.sync_history WHERE status = 'success' "
                        "AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1")
            found = cur.fetchone()
            sync = dict(found) if found else None
        except Exception:
            connection.rollback()
    sync = sync or {}
    sync['data_health'] = _query_dataset_health(connection, overlay)
    return rows, sync


def _moment(value):
    if value is None: return None
    try:
        moment = value if isinstance(value, datetime) else datetime.fromisoformat(str(value))
        return moment.replace(tzinfo=timezone.utc) if moment.tzinfo is None else moment.astimezone(timezone.utc)
    except (ValueError, TypeError): return None


def dataset_health(contracts, views, checkpoints, physical, keys, *, quality=None, now=None):
    """Per-source evidence; freshness/load/schema are separate from completeness."""
    now = now or datetime.now(timezone.utc)
    datasets = {}
    measured_quality = {name:quality[name] for name in (quality or {})}
    for name, contract in contracts.items():
        checkpoint = checkpoints.get(contract['dataset_id'], {})
        success, attempt = _moment(checkpoint.get('last_success_at')), _moment(checkpoint.get('last_attempt_at'))
        generation = checkpoint.get('generation')
        reasons = []
        schema_status = 'unknown'
        actual = physical.get(contract['target_table'])
        if actual is not None:
            # Replica varchar is deliberately stored as text. Narrowings and
            # missing/changed keys/columns remain incompatible.
            equivalent = lambda t: 'text' if t == 'character varying' else t
            mismatch = [column for column, definition in contract['columns'].items()
                if column not in actual or equivalent(actual[column]) != equivalent(definition['data_type'])]
            schema_status = 'drift' if mismatch or keys.get(contract['target_table']) != contract['primary_key'] else 'consistent'
            if schema_status == 'drift': reasons.append('physical_schema_drift')
        else:
            reasons.append('physical_schema_not_measured')
        lag = max(0,(now-success).total_seconds()) if success else None
        maximum_lag = contract.get('maximum_acceptable_load_lag_seconds', contract['expected_load_interval_seconds']*3)
        stale = lag is not None and lag > maximum_lag
        failed = bool(checkpoint.get('error_code') and (not success or not attempt or attempt >= success))
        if failed: reasons.append('last_load_failed')
        if stale: reasons.append('load_stale')
        if not success or not generation: reasons.append('governed_checkpoint_missing')
        quality_observation = measured_quality.get(name)
        if quality_observation and quality_observation.get('status') == 'failed': reasons.append('critical_quality_failed')
        status = ('blocked' if schema_status == 'drift' or failed or 'critical_quality_failed' in reasons else
                  'unknown' if not success or not generation or schema_status == 'unknown' else
                  'degraded' if stale else 'healthy')
        datasets[name] = {'dataset_id':contract['dataset_id'], 'source_id':name,
            'owner_team':'avengers-data-team',
            'business_owner_status':'assigned' if contract.get('source_business_owner') else 'not_certified',
            'schema_version':'3.4.0','schema_fingerprint':checkpoint.get('schema_fingerprint'),
            'schema_status':schema_status,'generation':generation,
            'source_watermark':_stamp(checkpoint.get('source_upper_bound')),
            'last_attempt_at':_stamp(attempt),'last_success_at':_stamp(success),
            'last_full_reconcile_at':_stamp(checkpoint.get('last_full_reconcile_at')),
            'observed_rows':checkpoint.get('observed_rows'),'observed_rows_basis':'last load, not source total',
            'load_lag_seconds':round(lag,3) if lag is not None else None,
            'expected_load_interval_seconds':contract['expected_load_interval_seconds'],
            'maximum_acceptable_load_lag_seconds':maximum_lag,
            'source_business_owner':contract.get('source_business_owner'),
            'completeness':'unknown','certificate':None,'certificate_basis':'No certified extraction completeness proof',
            'quality':quality_observation or {'status':'not_measured','checks':[]},
            'status':status,'reasons':reasons,'observed_at':now.isoformat(),
            'expires_at':datetime.fromtimestamp(now.timestamp()+TTL_SECONDS,timezone.utc).isoformat()}
    projected = {}
    for view in views:
        deps = view['source_dependencies']
        states = [datasets[d] for d in deps if d in datasets]
        status = next((state for state in ('blocked','unknown','degraded') if any(x['status']==state for x in states)),
                      'healthy' if len(states)==len(deps) and states else 'unknown')
        projected[view['name']] = {'status':status,
            'reasons':sorted({r for state in states for r in state['reasons']}),
            'generations':{state['dataset_id']:state['generation'] for state in states},
            'source_dependencies':deps,'completeness':'unknown'}
    vector = {d['dataset_id']:{k:d[k] for k in ('generation','schema_fingerprint','last_success_at','status')}
              for d in datasets.values()}
    epoch = hashlib.sha256(json.dumps(vector,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    return {'version':'1.0','datasets':datasets,'views':projected,'epoch':epoch,
            'epoch_basis':'per-source observed generations; no cross-source transaction claim',
            'observed_at':now.isoformat(),'quality_scope':'Only explicitly measured checks are associated'}


def _query_dataset_health(connection, overlay):
    contracts=json.loads((_METADATA/'data_health_contracts.json').read_text())['datasets']
    views=json.loads((_METADATA/'warehouse_views.json').read_text())['views']
    checkpoints,physical,keys={}, {}, {}
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT dataset_id,cursor_time,source_upper_bound,generation,schema_fingerprint,'
                'last_attempt_at,last_success_at,last_full_reconcile_at,observed_rows,completeness,error_code '
                'FROM analytics.ingestion_checkpoints ORDER BY dataset_id LIMIT 1000')
            checkpoints={row['dataset_id']:dict(row) for row in cursor.fetchall()}
    except Exception:
        connection.rollback()
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT n.nspname AS table_schema,c.relname AS table_name,a.attname AS column_name, "
                "CASE t.typname WHEN 'varchar' THEN 'character varying' WHEN 'bpchar' THEN 'character' "
                "WHEN 'int2' THEN 'smallint' WHEN 'int4' THEN 'integer' WHEN 'int8' THEN 'bigint' "
                "WHEN 'float4' THEN 'real' WHEN 'float8' THEN 'double precision' WHEN 'bool' THEN 'boolean' "
                "WHEN 'timestamptz' THEN 'timestamp with time zone' WHEN 'timestamp' THEN 'timestamp without time zone' "
                "ELSE t.typname END AS data_type "
                "FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid "
                "JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_type t ON t.oid=a.atttypid "
                "WHERE n.nspname IN ('orders','identity','menu','inventory') AND a.attnum>0 AND NOT a.attisdropped "
                "ORDER BY n.nspname,c.relname,a.attnum LIMIT 2000")
            for row in cursor.fetchall():
                physical.setdefault(row['table_schema']+'.'+row['table_name'],{})[row['column_name']]=row['data_type']
            cursor.execute("SELECT n.nspname AS schema_name,c.relname AS table_name,a.attname AS column_name "
                "FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace "
                "JOIN LATERAL unnest(k.conkey) WITH ORDINALITY u(attnum,seq) ON true "
                "JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=u.attnum "
                "WHERE k.contype='p' AND n.nspname IN ('orders','identity','menu','inventory') "
                "ORDER BY n.nspname,c.relname,u.seq LIMIT 1000")
            for row in cursor.fetchall(): keys.setdefault(row['schema_name']+'.'+row['table_name'],[]).append(row['column_name'])
    except Exception:
        connection.rollback()
        physical,keys={},{}
    quality_by_source={}
    for source, rule_ids in {'orders.don_hang':['DQ-01','DQ-02'], 'orders.chi_tiet_don_hang':['DQ-03']}.items():
        observations={}
        for rule in QUALITY_RULES:
            if rule['rule_id'] not in rule_ids: continue
            try:
                with connection.cursor() as cursor:
                    cursor.execute(rule['sql'])
                    observations[rule['rule_id']]=dict(cursor.fetchone())
            except Exception:
                connection.rollback()
        checks=[r for r in quality_summary(observations)['tests'] if r['rule_id'] in rule_ids]
        quality_by_source[source]={'status':'failed' if any(r['quality_status']=='failed' for r in checks) else
            'passed' if all(r['quality_status']=='passed' for r in checks) else 'not_measured','checks':checks}
    value=dataset_health(contracts,views,checkpoints,physical,keys,quality=quality_by_source)
    for name,view in value['views'].items():
        view['impacted_metrics']=[metric for metric,definition in overlay['analysis_registry']['metrics'].items() if definition['source']==name]
    return value


def refresh(overlay=None, connection_factory=None):
    """Bounded read-only refresh (never called by preflight)."""
    global _snapshot
    from services.analysis_catalog import CATALOG_PATH
    import json
    overlay = overlay or json.loads(CATALOG_PATH.read_text())
    if connection_factory is None:
        from services.readiness_service import warehouse_connection
        connection_factory = warehouse_connection
    conn = connection_factory()
    try:
        rows, sync = _query(conn, overlay)
    finally:
        try:
            conn.rollback()
            conn.close()
        except Exception:
            pass
    value = build_snapshot(rows, sync, overlay)
    with _lock:
        _snapshot = {"value": value, "expires": time.monotonic() + TTL_SECONDS}
    return deepcopy(value)


def peek():
    """Last snapshot or None. Pure memory read: safe for the typing hot path."""
    with _lock:
        return _cached_projection(_snapshot)


def _cached_projection(cached):
    if not cached:
        return None
    value = deepcopy(cached['value'])
    if cached['expires'] > time.monotonic():
        return value
    # Expired bounds cannot block a new question or claim current source health.
    # Retain the observation timestamp, but no longer publish stale ranges as
    # authoritative facts. This function performs no warehouse/provider I/O.
    return {'status': 'unavailable', 'observation_status': 'expired',
            'reason': 'health_snapshot_expired', 'observed_at': value.get('observed_at'),
            'overall': {'min_date': None, 'max_date': None}, 'facts': {},
            'data_health': {'version':'1.0','status':'unknown','reason':'health_snapshot_expired','datasets':{},'views':{}},
            'freshness': {'mode': 'batch', 'label': 'Chưa xác minh cập nhật dữ liệu',
                          'last_sync': None, 'stale': None}}


def current(overlay=None, connection_factory=None):
    """Cached snapshot, refreshed when older than the TTL (not for preflight)."""
    with _lock:
        cached = _snapshot
    if cached and cached["expires"] > time.monotonic():
        return deepcopy(cached["value"])
    try:
        return refresh(overlay, connection_factory)
    except Exception:
        logger.warning("[DataCoverage] refresh unavailable")
        return _cached_projection(cached) if cached else {"status": "unavailable", "overall": {"min_date": None, "max_date": None},
            "facts": {}, "freshness": {"mode": "batch", "label": "Cập nhật theo đợt", "last_sync": None, "stale": None}}


def set_snapshot(value, ttl=TTL_SECONDS):
    """Test/bootstrap hook: install a snapshot without I/O."""
    global _snapshot
    with _lock:
        _snapshot = None if value is None else {"value": deepcopy(value), "expires": time.monotonic() + ttl}


# Small governed checks, executed only on an explicit health refresh. These are
# not source completeness certificates and never run on typing-time preflight.
QUALITY_RULES = (
    {'rule_id': 'DQ-01', 'rule_name': 'Khóa đơn hàng không trùng và không NULL',
     'domain': 'silver.don_hang', 'severity': 'CRITICAL',
     'sql': 'SELECT COUNT(*) AS checked, COUNT(*) - COUNT(DISTINCT ma_don_hang) AS violations FROM silver.don_hang'},
    {'rule_id': 'DQ-02', 'rule_name': 'Giá trị đơn hàng không âm hoặc NULL',
     'domain': 'silver.don_hang', 'severity': 'CRITICAL',
     'sql': 'SELECT COUNT(*) AS checked, COUNT(*) FILTER (WHERE tong_tien < 0 OR tong_tien IS NULL) AS violations FROM silver.don_hang'},
    {'rule_id': 'DQ-03', 'rule_name': 'Số lượng món dương và không NULL',
     'domain': 'silver.chi_tiet_don_hang', 'severity': 'HIGH',
     'sql': 'SELECT COUNT(*) AS checked, COUNT(*) FILTER (WHERE so_luong <= 0 OR so_luong IS NULL) AS violations FROM silver.chi_tiet_don_hang'},
)


def quality_summary(observations, now=None):
    """No measurement/empty data cannot turn into a 100% quality score."""
    rules = []
    for definition in QUALITY_RULES:
        observed = observations.get(definition['rule_id']) or {}
        checked, violations = observed.get('checked'), observed.get('violations')
        measured = (type(checked) is int and type(violations) is int and 0 <= violations <= checked)
        status = ('not_measured' if not measured else 'no_data' if not checked
                  else 'failed' if violations else 'passed')
        score = round(100*(1-violations/checked), 2) if measured and checked else None
        rules.append({k: v for k, v in definition.items() if k != 'sql'} | {
            'checked_rows': checked if measured else None, 'violations': violations if measured else None,
            'records_checked': str(checked)+' dòng' if measured else 'Chưa đo',
            'score': score, 'quality_status': status,
            'status': {'passed': 'DAT_CHUAN', 'failed': 'KHONG_DAT', 'no_data': 'KHONG_CO_DU_LIEU',
                       'not_measured': 'CHUA_DO'}[status], 'reason': observed.get('reason')})
    complete = all(r['score'] is not None for r in rules)
    failed = [r for r in rules if r['quality_status'] == 'failed']
    return {'version': '3.4.0', 'status': 'failed' if failed else 'passed' if complete else 'unknown',
            'overall_score': round(sum(r['score'] for r in rules)/len(rules), 2) if complete else None,
            'scope': 'Ba kiểm tra hợp đồng trên đơn hàng và chi tiết món; không chứng nhận toàn bộ kho hoặc source completeness.',
            'total_rules': len(rules), 'passed_rules': sum(r['quality_status'] == 'passed' for r in rules),
            'warning_rules': len(failed), 'not_measured_rules': sum(r['score'] is None for r in rules),
            'critical_failures': sum(r['severity'] == 'CRITICAL' for r in failed),
            'last_audit_time': (now or datetime.now(timezone.utc)).isoformat(), 'tests': rules}


def quality_snapshot(connection_factory=None):
    """Explicit bounded read-only checks; return honest unknowns if a source fails."""
    if connection_factory is None:
        from services.readiness_service import warehouse_connection
        connection_factory = warehouse_connection
    observations = {}
    connection = None
    try:
        connection = connection_factory()
        for definition in QUALITY_RULES:
            try:
                with connection.cursor() as cur:
                    cur.execute(definition['sql'])
                    observations[definition['rule_id']] = dict(cur.fetchone())
            except Exception:
                connection.rollback()
                observations[definition['rule_id']] = {'reason': 'quality_check_unavailable'}
    except Exception:
        observations = {r['rule_id']: {'reason': 'quality_source_unavailable'} for r in QUALITY_RULES}
    finally:
        if connection is not None:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
    return quality_summary(observations)


_refresher = None


def start_background_refresh(interval=None):
    """Daemon refresher started by the server (never by request handlers)."""
    global _refresher
    import os
    import threading
    seconds = interval if interval is not None else int(os.getenv("DATA_ANALYST_COVERAGE_REFRESH_SECONDS", str(TTL_SECONDS)))
    if seconds <= 0 or (_refresher and _refresher.is_alive()):
        return None

    def loop():
        while True:
            try:
                refresh()
            except Exception:
                logger.warning("[DataCoverage] background refresh unavailable")
            time.sleep(seconds)

    _refresher = threading.Thread(target=loop, name="data-coverage-refresh", daemon=True)
    _refresher.start()
    return _refresher
