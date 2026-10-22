"""Business-coverage round 3 warehouse rollout (PLAN 20/10, user-approved 20/10/2026).

Offline `plan` renders reviewable SQL; `--apply --approved-round3` runs it once as
the warehouse owner in a single transaction. Scope: create the 26 new replica
target tables (empty; the replica worker fills them), grant the existing replica
group DML on exactly those tables, (re)create the round-3 Silver views, grant the
analytics reader column-level SELECT on their declared non-sensitive columns and
on the load-history columns the API reads. No DROP/TRUNCATE, no source-database
access, no data writes, no new roles.
"""
import argparse
import hashlib
import json
from pathlib import Path

from services.metadata_service import is_sensitive_column
from tools.deploy_v34_replica import GROUP as REPLICA_GROUP
import re

READER = 'avengers_analytics_reader'
EVIDENCE = 'evaluation/business-coverage-20261020/round3/source-schema-readonly-round3.json'
MODIFIED_VIEWS = ('silver.danh_gia_chi_nhanh', 'silver.giao_hang')
HISTORY_COLUMNS = ('id', 'started_at', 'finished_at', 'total_tables', 'total_rows', 'status')
TYPES = {'int2': 'SMALLINT', 'int4': 'INTEGER', 'int8': 'BIGINT', 'numeric': 'NUMERIC', 'float4': 'REAL', 'float8': 'DOUBLE PRECISION',
         'bool': 'BOOLEAN', 'uuid': 'UUID', 'text': 'TEXT', 'varchar': 'TEXT', 'bpchar': 'TEXT', 'timestamp': 'TIMESTAMP',
         'timestamptz': 'TIMESTAMPTZ', 'date': 'DATE', 'jsonb': 'JSONB', 'json': 'JSON', 'bytea': 'BYTEA'}


def identifier(value):
    # Reviewed source identifiers may be camelCase (e.g. shipperId); always quoted.
    if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', value):
        raise ValueError('Invalid reviewed identifier')
    return '"' + value + '"'


def qualified(name):
    return '.'.join(identifier(p) for p in name.split('.'))


def column_type(definition):
    # Same mapping as data-sync map_postgres_type: replica tables stay byte-compatible.
    return 'TEXT[]' if definition['data_type'] == 'ARRAY' else TYPES.get(definition['udt_name'], 'TEXT')


def guard_statements(api_root, catalog):
    from tools.deploy_v34_governance import round3_relations, snapshot_guard_sql
    names = sorted(n for n in round3_relations() if n in catalog['silver_tables'])
    body = snapshot_guard_sql(names)
    artifact = api_root / 'migrations/029_business_coverage_snapshot_guards.sql'
    if artifact.exists() and artifact.read_text() != body:
        raise ValueError('Round-3 snapshot guard migration differs from the catalog projection')
    lines = [l for l in body.splitlines() if l and not l.startswith(('BEGIN', 'COMMIT', 'SET LOCAL'))]
    statements, current = [], []
    for line in lines:
        current.append(line)
        if line.endswith(';'):
            statements.append('\n'.join(current)); current = []
    return statements


def plan(api_root):
    # Packaged copies (regenerate_pipeline_metadata keeps them byte/semantic-equal
    # to data-platform/metadata); the API container mounts only analytics-api.
    contracts = json.loads((api_root / 'metadata/data_health_contracts.json').read_text())['datasets']
    views = json.loads((api_root / 'metadata/warehouse_views.json').read_text())['views']
    catalog = json.loads((api_root / 'metadata/semantic_catalog.json').read_text())
    new = sorted((c for c in contracts.values() if c.get('source_schema_evidence') == EVIDENCE), key=lambda c: c['target_table'])
    if len(new) != 26 or len({c['target_table'] for c in new}) != 26:
        raise ValueError('Explicit 26-source round-3 contract review required')
    ddl, grants = [], []
    for schema in sorted({c['target_table'].split('.')[0] for c in new}):
        ddl.append(f'CREATE SCHEMA IF NOT EXISTS {identifier(schema)};')
        grants.append(f'GRANT USAGE ON SCHEMA {identifier(schema)} TO {identifier(REPLICA_GROUP)};')
    for c in new:
        columns = [identifier(n) + ' ' + column_type(d) + ('' if d['nullable'] else ' NOT NULL') for n, d in c['columns'].items()]
        columns.append('PRIMARY KEY (' + ', '.join(map(identifier, c['primary_key'])) + ')')
        ddl.append(f"CREATE TABLE IF NOT EXISTS {qualified(c['target_table'])} ({', '.join(columns)});")
        grants.append(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {qualified(c['target_table'])} TO {identifier(REPLICA_GROUP)};")
    targets = {c['target_table'] for c in new}
    selected = [v for v in views if 'business-coverage-20261020' in (v.get('introduced_in'), v.get('changed_in'))]
    if {v['name'] for v in selected if v.get('changed_in')} != set(MODIFIED_VIEWS):
        raise ValueError('Round-3 view set differs from the reviewed registry')
    view_sql = [v['sql'].strip() for v in selected]
    reader = []
    for v in selected:
        declared = catalog['silver_tables'].get(v['name'], {}).get('columns', {})
        safe = [n for n in declared if not is_sensitive_column(n)]
        if safe:
            reader.append(f"GRANT SELECT ({', '.join(map(identifier, safe))}) ON {qualified(v['name'])} TO {identifier(READER)};")
    reader.append(f"GRANT SELECT ({', '.join(map(identifier, HISTORY_COLUMNS))}) ON public.sync_history TO {identifier(READER)};")
    # Snapshot guards for the new analytical relations (migration 029 records the same SQL).
    guards = guard_statements(api_root, catalog)
    statements = ddl + grants + view_sql + reader + guards
    text = '\n'.join(statements)
    if any(word in text.upper() for word in ('DROP ', 'TRUNCATE', 'DELETE FROM', 'CREATE ROLE', 'ALTER ROLE', 'INSERT INTO')):
        raise ValueError('Round-3 rollout must stay additive')
    return {'target_tables': sorted(targets), 'views': [v['name'] for v in selected], 'statements': statements,
            'sql_sha256': hashlib.sha256(text.encode()).hexdigest(), 'replica_group': REPLICA_GROUP, 'reader_group': READER,
            'source_database_access': False, 'data_writes': False, 'applied': False}


def apply(value, *, approved=False):
    if not approved:
        raise RuntimeError('Explicit round-3 approval required')
    import db
    connection = db.psycopg2.connect(host=db.DB_HOST, port=db.DB_PORT, user=db.DB_USER, password=db.DB_PASSWORD,
                                     dbname=db.DB_NAME, sslmode=db.DB_SSLMODE, connect_timeout=5)
    try:
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'")
            cursor.execute('SELECT count(*) FROM pg_roles WHERE rolname = ANY(%s)', ([REPLICA_GROUP, READER],))
            if cursor.fetchone()[0] != 2:
                raise RuntimeError('Reviewed replica/reader groups must already exist')
            for statement in value['statements']:
                cursor.execute(statement)
            cursor.execute("SELECT count(*) FROM information_schema.views WHERE table_schema || '.' || table_name = ANY(%s)", (value['views'],))
            if cursor.fetchone()[0] != len(value['views']):
                raise RuntimeError('Round-3 views were not all created')
        connection.commit()
    except BaseException:
        connection.rollback()
        raise
    finally:
        connection.close()
    return {**value, 'applied': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api-root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--approved-round3', action='store_true')
    args = parser.parse_args()
    if args.out.exists():
        raise SystemExit('Fresh evidence path required')
    value = plan(args.api_root)
    if args.apply:
        value = apply(value, approved=args.approved_round3)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'applied': value['applied'], 'tables': len(value['target_tables']), 'views': len(value['views']), 'sql_sha256': value['sql_sha256'][:12]}))


if __name__ == '__main__':
    main()
