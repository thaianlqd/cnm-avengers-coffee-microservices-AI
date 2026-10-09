"""Bounded cached metadata profiles; no full scans and no sensitive values."""
import math
import threading
import time
from copy import deepcopy
from services.metadata_service import is_sensitive_column
from services.value_grounding_service import dimension_values

_cache, _lock = {}, threading.RLock()


def profiles_for(catalog, loader=None):
    key = (catalog.fingerprint, catalog.snapshot_version, bool(loader),
           repr([(d['table'],d['column'],[(c['name'],c.get('distinct_upper_bound'),c.get('date_min'),c.get('date_max'))
                 for c in catalog.tables.get(d['table'],{}).get('columns',[])])
                 for d in catalog.registry['dimensions'].values()]))
    with _lock:
        cached = _cache.get(key)
        if cached and cached[0] > time.time():
            return deepcopy(cached[1])
    physical = loader(catalog) if loader else {}
    result = {}
    for name, desc in catalog.registry['dimensions'].items():
        if is_sensitive_column(desc['column']):
            continue
        column = next((c for c in catalog.tables.get(desc['table'],{}).get('columns',[]) if c['name'] == desc['column']),None)
        if column is None or column.get('sensitive'):
            continue
        profile = dict(physical.get(desc['table']+'.'+desc['column'], {}))
        for field in ('distinct_upper_bound', 'null_fraction', 'date_min', 'date_max', 'duplicate_labels'):
            if field in column:
                profile[field] = column[field]
        values = dimension_values(catalog, name)
        profile.update(common_values=values[:32], canonical_identity=desc.get('identity') or name,
                       complete_values=bool(values), source='warehouse_stats' if physical else 'catalog_metadata')
        if values:
            profile['distinct_upper_bound'] = len(values)
        result[name] = profile
        result.setdefault(desc['table']+'.'+desc['column'], profile)
    with _lock:
        if len(_cache) >= 32:
            _cache.pop(next(iter(_cache)))
        _cache[key] = (time.time()+300, deepcopy(result))
    return result


def warehouse_statistics(catalog):
    """pg_stats estimates only. They are hints, never a rejection authority."""
    from db import get_db_conn
    result = {}
    conn = get_db_conn()
    try:
        conn.set_session(readonly=True, autocommit=False)
        with conn.cursor() as cur:
            cur.execute('SET LOCAL statement_timeout = 2000')
            cur.execute("""SELECT s.schemaname, s.tablename, s.attname, s.n_distinct,
                s.null_frac, GREATEST(c.reltuples, 0) AS rows
                FROM pg_stats s JOIN pg_namespace n ON n.nspname=s.schemaname
                JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=s.tablename
                WHERE s.schemaname = ANY(%s) LIMIT 4096""",
                (list({t.split('.')[0] for t in catalog.tables}),))
            for r in cur.fetchall():
                table = r['schemaname']+'.'+r['tablename']
                if table not in catalog.tables or is_sensitive_column(r['attname']):
                    continue
                distinct = float(r['n_distinct'])
                estimate = abs(distinct)*float(r['rows']) if distinct < 0 else distinct
                if estimate:
                    result[table+'.'+r['attname']] = dict(distinct_upper_bound=math.ceil(estimate*1.25)+1,
                                                        null_fraction=float(r['null_frac']), approximate=True)
        return result
    finally:
        conn.rollback()
        conn.close()
