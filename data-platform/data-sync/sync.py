"""
Avengers Coffee - Data Sync Service (ETL)
Tự động sync TOÀN BỘ bảng từ Supabase (production) sang postgres-analytics (local).

Cơ chế:
  1. Quét information_schema.tables → phát hiện TẤT CẢ bảng trong các schema
  2. Lần đầu: Full copy (CREATE TABLE AS SELECT)
  3. Lần sau: Incremental sync nếu có cột timestamp, hoặc full replace nếu không
  4. Ghi metadata vào public.sync_metadata
  5. Lặp lại mỗi SYNC_INTERVAL_SECONDS (mặc định 300 giây = 5 phút)
"""
import os
import sys
import time
import logging
import json
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras
from psycopg2.extras import Json

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s - %(message)s',
)
logger = logging.getLogger("data-sync")

# ── Source: Supabase (production) ──
SOURCE_DB_HOST     = os.getenv("SOURCE_DB_HOST", "localhost")
SOURCE_DB_PORT     = int(os.getenv("SOURCE_DB_PORT", 6543))
SOURCE_DB_USER     = os.getenv("SOURCE_DB_USER", "postgres")
SOURCE_DB_PASSWORD = os.getenv("SOURCE_DB_PASSWORD", "postgres")
SOURCE_DB_NAME     = os.getenv("SOURCE_DB_NAME", "postgres")
SOURCE_DB_SSLMODE  = os.getenv("SOURCE_DB_SSLMODE", "require")

# ── Target: postgres-analytics (local) ──
TARGET_DB_HOST     = os.getenv("TARGET_DB_HOST", "postgres-analytics")
TARGET_DB_PORT     = int(os.getenv("TARGET_DB_PORT", 5432))
TARGET_DB_USER     = os.getenv("TARGET_DB_USER", "analytics")
TARGET_DB_PASSWORD = os.getenv("TARGET_DB_PASSWORD", "analytics123")
TARGET_DB_NAME     = os.getenv("TARGET_DB_NAME", "analytics")

# ── Sync config ──
SYNC_INTERVAL = int(os.getenv("SYNC_INTERVAL_SECONDS", 300))
BATCH_SIZE    = int(os.getenv("SYNC_BATCH_SIZE", 5000))

# Các schema cần sync (tất cả schema nghiệp vụ)
SYNC_SCHEMAS = os.getenv(
    "SYNC_SCHEMAS",
    "orders,identity,menu,inventory,news,ai"
).split(",")

# Các cột timestamp phổ biến dùng cho incremental sync
TIMESTAMP_COLUMNS = [
    "ngay_cap_nhat", "updated_at",
    "ngay_tao", "created_at",
    "assigned_at", "last_modified",
]


def get_source_conn():
    """Kết nối đến Supabase (production DB)."""
    conn = psycopg2.connect(
        host=SOURCE_DB_HOST, port=SOURCE_DB_PORT,
        user=SOURCE_DB_USER, password=SOURCE_DB_PASSWORD,
        dbname=SOURCE_DB_NAME, sslmode=SOURCE_DB_SSLMODE,
        connect_timeout=30,
        options="-c statement_timeout=30000 -c default_transaction_read_only=on",
    )
    conn.set_session(readonly=True, isolation_level='REPEATABLE READ')
    return conn


def get_target_conn():
    """Kết nối đến postgres-analytics (local)."""
    credentials=None
    if os.getenv('DATA_PLATFORM_GOVERNED_INGESTION','0')=='1':
        from pipeline_runtime import private_database_profile
        credentials=private_database_profile()
    return psycopg2.connect(
        host=TARGET_DB_HOST, port=TARGET_DB_PORT,
        user=credentials[0] if credentials else TARGET_DB_USER,
        password=credentials[1] if credentials else TARGET_DB_PASSWORD,
        dbname=TARGET_DB_NAME, sslmode="disable",
        connect_timeout=15,
    )


def discover_tables(source_conn):
    """Quét tất cả bảng trong các schema cần sync."""
    placeholders = ",".join(["%s"] * len(SYNC_SCHEMAS))
    query = f"""
        SELECT table_schema, table_name
        FROM information_schema.tables
        WHERE table_schema IN ({placeholders})
          AND table_type = 'BASE TABLE'
        ORDER BY table_schema, table_name
    """
    with source_conn.cursor() as cur:
        cur.execute(query, SYNC_SCHEMAS)
        tables = cur.fetchall()
    logger.info(f"Phat hien {len(tables)} bang trong {len(SYNC_SCHEMAS)} schema")
    return tables


def get_table_columns(conn, schema, table):
    """Lấy danh sách cột và kiểu dữ liệu của bảng."""
    query = """
        SELECT column_name, data_type, udt_name,
               is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = %s AND table_name = %s
        ORDER BY ordinal_position
    """
    with conn.cursor() as cur:
        cur.execute(query, (schema, table))
        return cur.fetchall()


def get_primary_keys(conn, schema, table):
    """Lấy danh sách primary key columns."""
    query = """
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = %s
          AND tc.table_name = %s
        ORDER BY kcu.ordinal_position
    """
    with conn.cursor() as cur:
        cur.execute(query, (schema, table))
        return [row[0] for row in cur.fetchall()]


def find_timestamp_column(columns):
    """Tìm cột timestamp phù hợp cho incremental sync."""
    col_names = [c[0] for c in columns]
    for ts_col in TIMESTAMP_COLUMNS:
        if ts_col in col_names:
            return ts_col
    return None


def table_exists_in_target(target_conn, schema, table):
    """Kiểm tra bảng đã tồn tại trong target chưa."""
    query = """
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = %s AND table_name = %s
        )
    """
    with target_conn.cursor() as cur:
        cur.execute(query, (schema, table))
        return cur.fetchone()[0]


def get_last_sync_timestamp(target_conn, schema, table):
    """Lấy thời điểm sync cuối từ metadata (chỉ lấy nếu lần sync trước không bị lỗi)."""
    try:
        with target_conn.cursor() as cur:
            cur.execute("""
                SELECT last_synced_at FROM public.sync_metadata
                WHERE schema_name = %s AND table_name = %s AND error_message IS NULL
            """, (schema, table))
            row = cur.fetchone()
            return row[0] if row else None
    except Exception:
        return None


def get_target_row_count(target_conn, schema, table):
    """Đếm số dòng hiện có trong target table."""
    try:
        with target_conn.cursor() as cur:
            cur.execute(f'SELECT COUNT(*) FROM {schema}."{table}"')
            return cur.fetchone()[0]
    except Exception:
        target_conn.rollback()
        return 0


def adapt_value(val):
    """Convert Python dict/list sang psycopg2 Json để insert vào JSONB columns."""
    if isinstance(val, (dict, list)):
        return Json(val)
    return val


def map_postgres_type(data_type, udt_name):
    type_map = {
        "int2": "SMALLINT", "int4": "INTEGER", "int8": "BIGINT",
        "numeric": "NUMERIC", "float4": "REAL", "float8": "DOUBLE PRECISION",
        "bool": "BOOLEAN", "uuid": "UUID", "text": "TEXT", "varchar": "TEXT",
        "bpchar": "TEXT", "timestamp": "TIMESTAMP", "timestamptz": "TIMESTAMPTZ",
        "date": "DATE", "jsonb": "JSONB", "json": "JSON", "bytea": "BYTEA",
    }
    return "TEXT[]" if data_type == "ARRAY" else type_map.get(udt_name, "TEXT")


def create_table_from_source(source_conn, target_conn, schema, table):
    """Tạo bảng trong target với cấu trúc giống source."""
    columns = get_table_columns(source_conn, schema, table)
    if not columns:
        logger.warning(f"  Khong co cot nao trong {schema}.{table}, bo qua")
        return

    # Tạo schema nếu chưa có
    with target_conn.cursor() as cur:
        cur.execute(f"CREATE SCHEMA IF NOT EXISTS {schema}")

    # Build column definitions
    col_defs = []
    for col_name, data_type, udt_name, is_nullable, col_default in columns:
        # Map data type
        pg_type = map_postgres_type(data_type, udt_name)

        nullable = "" if is_nullable == "YES" else " NOT NULL"
        # Escape column name properly
        safe_col = col_name.replace('"', '""')
        col_defs.append(f'"{safe_col}" {pg_type}{nullable}')

    # Primary keys
    pk_cols = get_primary_keys(source_conn, schema, table)
    pk_clause = ""
    if pk_cols:
        pk_list = ", ".join([f'"{c}"' for c in pk_cols])
        pk_clause = f", PRIMARY KEY ({pk_list})"

    # Build and execute CREATE TABLE
    cols_sql = ", ".join(col_defs)
    create_sql = f'CREATE TABLE {schema}."{table}" ({cols_sql}{pk_clause})'

    with target_conn.cursor() as cur:
        cur.execute(create_sql)
    target_conn.commit()


def ensure_target_table(source_conn, target_conn, schema, table):
    """Create missing copies and add newly discovered columns without dropping dependent Gold views."""
    if not table_exists_in_target(target_conn, schema, table):
        create_table_from_source(source_conn, target_conn, schema, table)
        return

    source_columns = get_table_columns(source_conn, schema, table)
    target_columns = {row[0]: row for row in get_table_columns(target_conn, schema, table)}
    with target_conn.cursor() as cur:
        for col_name, data_type, udt_name, _is_nullable, _default in source_columns:
            if col_name in target_columns:
                continue
            safe_col = col_name.replace('"', '""')
            pg_type = map_postgres_type(data_type, udt_name)
            # New columns start nullable so existing warehouse rows never block a sync.
            cur.execute(f'ALTER TABLE {schema}."{table}" ADD COLUMN "{safe_col}" {pg_type}')
            logger.info(f"  {schema}.{table}: added new column {col_name} ({pg_type})")
    target_conn.commit()


def sync_table_full(source_conn, target_conn, schema, table):
    """Full sync: copy toàn bộ dữ liệu từ source sang target."""
    start_time = time.time()

    # Đọc toàn bộ dữ liệu từ source
    with source_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as src_cur:
        src_cur.execute(f'SELECT * FROM {schema}."{table}"')
        rows = src_cur.fetchall()

    ensure_target_table(source_conn, target_conn, schema, table)
    try:
        with target_conn.cursor() as cur:
            # TRUNCATE and every replacement INSERT deliberately share one transaction.
            cur.execute(f'TRUNCATE TABLE {schema}."{table}"')
            if rows:
                columns = list(rows[0].keys())
                col_list = ", ".join([f'"{c}"' for c in columns])
                placeholders = ", ".join(["%s"] * len(columns))
                insert_sql = f'INSERT INTO {schema}."{table}" ({col_list}) VALUES ({placeholders})'
                batch = []
                for row in rows:
                    batch.append([adapt_value(row[c]) for c in columns])
                    if len(batch) >= BATCH_SIZE:
                        psycopg2.extras.execute_batch(cur, insert_sql, batch, page_size=500)
                        batch = []
                if batch:
                    psycopg2.extras.execute_batch(cur, insert_sql, batch, page_size=500)
        target_conn.commit()
    except Exception:
        # PostgreSQL rolls TRUNCATE back as well, preserving the previous snapshot.
        target_conn.rollback()
        raise

    if not rows:
        duration_ms = int((time.time() - start_time) * 1000)
        update_sync_metadata(target_conn, schema, table, 0, duration_ms, "full")
        logger.info(f"  {schema}.{table}: 0 rows (bang rong)")
        return 0

    duration_ms = int((time.time() - start_time) * 1000)
    logger.info(f"  {schema}.{table}: {len(rows)} rows ({duration_ms}ms)")

    # Cập nhật metadata
    update_sync_metadata(target_conn, schema, table, len(rows), duration_ms, "full")
    return len(rows)


def sync_table_incremental(source_conn, target_conn, schema, table, ts_col, last_sync):
    """Incremental sync: chỉ copy dữ liệu mới/cập nhật."""
    start_time = time.time()

    # Evolve the target first so a new source column can be inserted in this cycle.
    ensure_target_table(source_conn, target_conn, schema, table)

    # Đọc dữ liệu mới từ source
    with source_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as src_cur:
        src_cur.execute(
            f'SELECT * FROM {schema}."{table}" WHERE "{ts_col}" > %s ORDER BY "{ts_col}" ASC',
            (last_sync,)
        )
        rows = src_cur.fetchall()

    if not rows:
        logger.debug(f"  {schema}.{table}: khong co du lieu moi")
        return 0

    # Lấy primary keys để UPSERT
    pk_cols = get_primary_keys(source_conn, schema, table)
    columns = list(rows[0].keys())
    col_list = ", ".join([f'"{c}"' for c in columns])
    placeholders = ", ".join(["%s"] * len(columns))

    if pk_cols:
        # UPSERT (INSERT ON CONFLICT UPDATE)
        pk_list = ", ".join([f'"{c}"' for c in pk_cols])
        update_cols = [c for c in columns if c not in pk_cols]
        update_clause = ", ".join([f'"{c}" = EXCLUDED."{c}"' for c in update_cols])

        if update_clause:
            upsert_sql = f"""
                INSERT INTO {schema}."{table}" ({col_list}) VALUES ({placeholders})
                ON CONFLICT ({pk_list}) DO UPDATE SET {update_clause}
            """
        else:
            upsert_sql = f"""
                INSERT INTO {schema}."{table}" ({col_list}) VALUES ({placeholders})
                ON CONFLICT ({pk_list}) DO NOTHING
            """

        with target_conn.cursor() as cur:
            batch = []
            for row in rows:
                batch.append([adapt_value(row[c]) for c in columns])
                if len(batch) >= BATCH_SIZE:
                    psycopg2.extras.execute_batch(cur, upsert_sql, batch, page_size=500)
                    batch = []
            if batch:
                psycopg2.extras.execute_batch(cur, upsert_sql, batch, page_size=500)
    else:
        # Không có PK → insert thẳng (có thể duplicate)
        insert_sql = f'INSERT INTO {schema}."{table}" ({col_list}) VALUES ({placeholders})'
        with target_conn.cursor() as cur:
            batch = []
            for row in rows:
                batch.append([adapt_value(row[c]) for c in columns])
                if len(batch) >= BATCH_SIZE:
                    psycopg2.extras.execute_batch(cur, insert_sql, batch, page_size=500)
                    batch = []
            if batch:
                psycopg2.extras.execute_batch(cur, insert_sql, batch, page_size=500)

    target_conn.commit()

    duration_ms = int((time.time() - start_time) * 1000)
    logger.info(f"  {schema}.{table}: +{len(rows)} rows incremental ({duration_ms}ms)")

    update_sync_metadata(target_conn, schema, table, len(rows), duration_ms, "incremental")
    return len(rows)


def update_sync_metadata(target_conn, schema, table, rows, duration_ms, sync_type, *, commit=True):
    """Cập nhật bảng sync_metadata."""
    with target_conn.cursor() as cur:
        cur.execute("""
            INSERT INTO public.sync_metadata
                (schema_name, table_name, last_synced_at, rows_synced, sync_duration_ms, sync_type)
            VALUES (%s, %s, NOW(), %s, %s, %s)
            ON CONFLICT (schema_name, table_name) DO UPDATE SET
                last_synced_at = NOW(),
                rows_synced = %s,
                sync_duration_ms = %s,
                sync_type = %s,
                error_message = NULL
        """, (schema, table, rows, duration_ms, sync_type,
              rows, duration_ms, sync_type))
    if commit:
        target_conn.commit()


def load_data_contracts():
    from pathlib import Path
    path = Path(os.getenv('DATA_PLATFORM_DATA_CONTRACTS_PATH',
                          str(Path(__file__).resolve().parent.parent / 'metadata/data_contracts.json')))
    document = json.loads(path.read_text())
    if document.get('version') != '3.4.0' or not document.get('datasets'):
        raise ValueError('Governed data contracts are unavailable')
    return document['datasets']


def ensure_target_contract(target_conn, contract):
    """Only reviewed columns/types may be created; never evolve from SELECT *."""
    from pipeline_runtime import quote_identifier, quote_table, PipelineContractError
    schema, table = contract['target_table'].split('.')
    if not table_exists_in_target(target_conn, schema, table):
        columns = []
        for name, definition in contract['columns'].items():
            kind = map_postgres_type(definition['data_type'], definition['udt_name'])
            columns.append(quote_identifier(name)+' '+kind+('' if definition['nullable'] else ' NOT NULL'))
        if contract['primary_key']:
            columns.append('PRIMARY KEY ('+', '.join(quote_identifier(k) for k in contract['primary_key'])+')')
        with target_conn.cursor() as cursor:
            cursor.execute('CREATE SCHEMA IF NOT EXISTS '+quote_identifier(schema))
            cursor.execute('CREATE TABLE '+quote_table(contract['target_table'])+' ('+', '.join(columns)+')')
    else:
        actual = {row[0]: row for row in get_table_columns(target_conn, schema, table)}
        if get_primary_keys(target_conn, schema, table) != contract['primary_key']:
            raise PipelineContractError('Target primary key needs explicit migration')
        for name, definition in contract['columns'].items():
            kind = map_postgres_type(definition['data_type'], definition['udt_name'])
            if name in actual:
                if map_postgres_type(actual[name][1], actual[name][2]) != kind:
                    raise PipelineContractError('Target column type needs explicit migration')
                continue
            if not definition['nullable']:
                raise PipelineContractError('New required target column needs explicit migration/backfill')
            with target_conn.cursor() as cursor:
                cursor.execute('ALTER TABLE '+quote_table(contract['target_table'])+' ADD COLUMN '+quote_identifier(name)+' '+kind)
    target_conn.commit()  # Schema phase precedes the fenced data/checkpoint transaction.


def _proof_order(contract):
    from pipeline_runtime import quote_identifier
    return ', '.join(quote_identifier(name) + (' COLLATE "C"' if
        contract['columns'][name]['data_type'] in {'text', 'character varying', 'character'} else '')
        for name in contract['primary_key'])


def _measure_projection(connection, contract, *, upper, source_timezone, deadline,
                        source=False, period=None):
    """Bounded server-cursor scan in the caller's existing transaction/snapshot."""
    from uuid import uuid4
    from pipeline_runtime import (ProjectionEvidence, source_projection, target_projection,
        quote_table, period_predicate, attach_reference_evidence, reference_observations)
    evidence = ProjectionEvidence(contract, source_upper_bound=upper, source_timezone=source_timezone)
    projection, params = source_projection(contract) if source else (target_projection(contract), [])
    table = contract['source_table'] if source else contract['target_table']
    predicate, bounds = period_predicate(contract, period, target=not source) if period else ('', [])
    statement = 'SELECT '+projection+' FROM '+quote_table(table)+' r'
    if predicate:
        statement += ' WHERE '+predicate
    statement += ' ORDER BY '+_proof_order(contract)
    with connection.cursor(name='v35_proof_'+uuid4().hex,
                           cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
        cursor.itersize = BATCH_SIZE
        cursor.execute(statement, params+bounds)
        while True:
            if time.monotonic() >= deadline:
                raise TimeoutError('Governed source snapshot deadline exhausted')
            rows = cursor.fetchmany(BATCH_SIZE)
            if not rows:
                break
            for row in rows:
                evidence.observe(row)
    return attach_reference_evidence(contract, evidence.summary(),
        reference_observations(connection, contract, table=table, where_sql=predicate, parameters=bounds))


def sync_table_governed(source_conn, target_conn, contract, *, deadline=None):
    """Bounded replica update with real update clocks, overlap and periodic repair.

    Created-only tables use full snapshots. Data, legacy observation metadata and
    fenced source checkpoint commit together. Full replacement remains atomic.
    No claim of source completeness is inferred from the source clock.
    """
    from datetime import timedelta
    import time as monotonic_clock
    from uuid import uuid4
    from zoneinfo import ZoneInfo
    from pipeline_runtime import (validate_data_contract, source_projection, quote_identifier,
                                  quote_table, read_checkpoint, advance_checkpoint, PipelineContractError,
                                  ProjectionEvidence, attach_reference_evidence, reference_observations,
                                  snapshot_certificate, closed_period_certificate, load_evidence)
    snapshot_started = datetime.now(timezone.utc)
    started = monotonic_clock.monotonic()
    deadline = started + 180 if deadline is None else deadline
    if started >= deadline:
        raise TimeoutError('Governed source snapshot deadline exhausted')
    with source_conn.cursor() as cursor:
        cursor.execute('SET LOCAL statement_timeout = %s', (max(1, min(30000, int((deadline-started)*1000))),))
    source_schema, source_table = contract['source_table'].split('.')
    metadata = get_table_columns(source_conn, source_schema, source_table)
    actual = {name: {'data_type': kind, 'udt_name': udt, 'nullable': nullable == 'YES'}
              for name, kind, udt, nullable, _default in metadata}
    validated = validate_data_contract(contract, actual, get_primary_keys(source_conn, source_schema, source_table))
    ensure_target_contract(target_conn, contract)
    target_schema, target_table = contract['target_table'].split('.')
    columns = list(contract['columns'])
    names = ', '.join(quote_identifier(name) for name in columns)
    insert = 'INSERT INTO '+quote_table(contract['target_table'])+' ('+names+') VALUES %s'
    keys = contract['primary_key']
    if keys:
        updates = [name for name in columns if name not in keys]
        insert += ' ON CONFLICT ('+', '.join(quote_identifier(k) for k in keys)+') '
        insert += ('DO UPDATE SET '+', '.join(quote_identifier(n)+'=EXCLUDED.'+quote_identifier(n) for n in updates)
                   if updates else 'DO NOTHING')
    projection, params = source_projection(contract)
    source_cursor = None
    try:
        with target_conn.cursor() as cursor:
            cursor.execute("SET LOCAL lock_timeout='3s'")
            cursor.execute("SET LOCAL statement_timeout='30s'")
        checkpoint = read_checkpoint(target_conn, contract['dataset_id'])
        with source_conn.cursor() as cursor:
            cursor.execute("SELECT clock_timestamp(), current_setting('TimeZone')")
            upper, source_timezone = cursor.fetchone()
        full_at = checkpoint.get('last_full_reconcile_at')
        full = (contract['mode'] == 'full_snapshot' or checkpoint['cursor_time'] is None or not full_at
                or (datetime.now(timezone.utc)-full_at).total_seconds() >= contract['full_reconcile_seconds'])
        clock = contract.get('update_clock')
        source_zone = ZoneInfo(source_timezone)
        naive_clock = bool(clock and contract['columns'][clock]['data_type'] == 'timestamp without time zone')
        def source_time(value):
            return value.astimezone(source_zone).replace(tzinfo=None) if naive_clock else value
        sql = 'SELECT '+projection+' FROM '+quote_table(contract['source_table'])
        if not full:
            lower = checkpoint['cursor_time']-timedelta(seconds=contract['overlap_seconds'])
            sql += ' WHERE '+quote_identifier(clock)+' >= %s AND '+quote_identifier(clock)+' <= %s'
            params += [source_time(lower), source_time(upper)]
        ordering = list(dict.fromkeys(([clock] if clock else [])+keys))
        if ordering:
            sql += ' ORDER BY '+(_proof_order(contract) if full else
                                 ', '.join(quote_identifier(name) for name in ordering))
        source_evidence = ProjectionEvidence(contract, source_upper_bound=upper, source_timezone=source_timezone) if full else None
        stage_table = None
        if full:
            # Fetch into a session-local table before changing the committed replica.
            # TRUNCATE holds ACCESS EXCLUSIVE for remote I/O and proof scans; that
            # made ordinary BI readers fail their bounded lock timeout every cycle.
            stage_table = quote_identifier('v35_replica_stage_'+uuid4().hex)
            with target_conn.cursor() as cursor:
                cursor.execute('CREATE TEMP TABLE '+stage_table+' (LIKE '+
                    quote_table(contract['target_table'])+' INCLUDING ALL) ON COMMIT DROP')
            batch_insert = 'INSERT INTO '+stage_table+' ('+names+') VALUES %s'
        else:
            batch_insert = insert
        source_cursor = source_conn.cursor(name='v34_'+uuid4().hex, cursor_factory=psycopg2.extras.RealDictCursor)
        source_cursor.itersize = BATCH_SIZE
        source_cursor.execute(sql, params)
        rows_written, last_row = 0, None
        while True:
            if monotonic_clock.monotonic() >= deadline:
                raise TimeoutError('Governed source snapshot deadline exhausted')
            rows = source_cursor.fetchmany(BATCH_SIZE)
            if not rows:
                break
            values = [[adapt_value(row[name]) for name in columns] for row in rows]
            with target_conn.cursor() as cursor:
                psycopg2.extras.execute_values(cursor, batch_insert, values, page_size=min(BATCH_SIZE, 1000))
            rows_written += len(rows)
            for row in rows:
                if source_evidence is not None:
                    source_evidence.observe(row)
                if last_row is None or not clock or row[clock] >= last_row[clock]:
                    last_row = row
        source_cursor.close()
        source_cursor = None
        position = last_row.get(clock) if last_row and clock else checkpoint['cursor_time']
        if position is not None and position.tzinfo is None:
            position = position.replace(tzinfo=source_zone)
        if position is not None and position > upper:
            raise PipelineContractError('Source update clock is ahead of the source snapshot bound')
        if not full and checkpoint['cursor_time'] is not None:
            position = max(position, checkpoint['cursor_time'])
        cursor_keys = [str(last_row[k]) for k in keys] if last_row and clock else checkpoint['cursor_keys']
        if full:
            target_table = quote_table(contract['target_table'])
            # Ordinary row writes are MVCC-safe: readers retain the old committed
            # generation throughout publication and validation. Unchanged rows
            # retain their tuple versions, avoiding a full rewrite every 5 minutes.
            with target_conn.cursor() as cursor:
                if keys:
                    match = ' AND '.join('replica.'+quote_identifier(k)+'=staged.'+quote_identifier(k) for k in keys)
                    cursor.execute('DELETE FROM '+target_table+' AS replica WHERE NOT EXISTS '
                        '(SELECT 1 FROM '+stage_table+' AS staged WHERE '+match+')')
                else:
                    cursor.execute('DELETE FROM '+target_table)
                publish = 'INSERT INTO '+target_table+' AS replica ('+names+') SELECT '+names+' FROM '+stage_table+' WHERE TRUE'
                if keys:
                    publish += ' ON CONFLICT ('+', '.join(quote_identifier(k) for k in keys)+') '
                    if updates:
                        publish += 'DO UPDATE SET '+', '.join(quote_identifier(n)+'=EXCLUDED.'+quote_identifier(n) for n in updates)
                        publish += ' WHERE ('+', '.join('replica.'+quote_identifier(n) for n in updates)+') IS DISTINCT FROM ('
                        publish += ', '.join('EXCLUDED.'+quote_identifier(n) for n in updates)+')'
                    else:
                        publish += 'DO NOTHING'
                cursor.execute(publish)
        target_evidence = _measure_projection(target_conn, contract, upper=upper,
            source_timezone=source_timezone, deadline=deadline)
        arguments = dict(generation=checkpoint['generation']+1,
            schema_fingerprint=validated['schema_fingerprint'], source_upper_bound=upper,
            snapshot_started_at=snapshot_started)
        snapshot, periods = None, []
        if full:
            observed = attach_reference_evidence(contract, source_evidence.summary(),
                reference_observations(source_conn, contract, table=contract['source_table']))
            if observed != target_evidence:
                raise PipelineContractError('Source and target projection parity failed')
            if target_evidence['quality']['status'] in {'passed', 'empty_measured'}:
                snapshot = snapshot_certificate(contract, observed, target_evidence, **arguments)
        for period in contract.get('closed_periods', []):
            if not period.get('enabled'):
                continue
            source_period = _measure_projection(source_conn, contract, upper=upper,
                source_timezone=source_timezone, deadline=deadline, source=True, period=period)
            target_period = _measure_projection(target_conn, contract, upper=upper,
                source_timezone=source_timezone, deadline=deadline, period=period)
            if source_period == target_period and target_period['quality']['status'] in {'passed', 'empty_measured'}:
                periods.append(closed_period_certificate(contract, source_period, target_period,
                    period_id=period['id'], **arguments))
        evidence = load_evidence(contract, target_evidence, snapshot=snapshot, closed_periods=periods,
            previous=checkpoint.get('certificate'), generation=arguments['generation'],
            schema_fingerprint=arguments['schema_fingerprint'])
        advance_checkpoint(target_conn, contract['dataset_id'], cursor_time=position, cursor_keys=cursor_keys,
            source_upper_bound=upper, schema_fingerprint=validated['schema_fingerprint'], observed_rows=rows_written,
            expected_generation=checkpoint['generation'], full_reconcile=full, evidence=evidence, contract=contract)
        elapsed = int((monotonic_clock.monotonic()-started)*1000)
        update_sync_metadata(target_conn, target_schema, target_table, rows_written, elapsed,
                             'governed_full' if full else 'governed_incremental', commit=False)
        target_conn.commit()
        return rows_written
    except Exception:
        target_conn.rollback()
        raise
    finally:
        if source_cursor is not None:
            try:
                source_cursor.close()
            except Exception:
                pass  # Preserve the original error/rollback classification.


def run_sync_cycle(source_conn, target_conn):
    """Chạy 1 vòng sync toàn bộ bảng."""
    cycle_start = time.time()

    # Ghi log bắt đầu
    with target_conn.cursor() as cur:
        cur.execute("""
            INSERT INTO public.sync_history (started_at, status)
            VALUES (NOW(), 'running') RETURNING id
        """)
        history_id = cur.fetchone()[0]
    target_conn.commit()

    # Phát hiện tất cả bảng
    tables = discover_tables(source_conn)
    governed = os.getenv('DATA_PLATFORM_GOVERNED_INGESTION', '0') == '1'
    contracts = load_data_contracts() if governed else None
    if governed:
        # Only source tables required by the approved analytical contracts.
        # Missing required sources become explicit failures, never silent skips.
        from pipeline_runtime import extraction_order
        tables = [tuple(name.split('.')) for name in extraction_order(contracts)]
    cycle_deadline = time.monotonic() + 180
    total_rows = 0
    synced_tables = 0
    errors = []

    for schema, table in tables:
        try:
            if governed:
                with target_conn.cursor() as cursor:
                    cursor.execute('INSERT INTO analytics.ingestion_checkpoints(dataset_id,last_attempt_at) '
                        'VALUES (%s,clock_timestamp()) ON CONFLICT(dataset_id) DO UPDATE SET last_attempt_at=clock_timestamp()',
                        (contracts[schema+'.'+table]['dataset_id'],))
                target_conn.commit()
                rows = sync_table_governed(source_conn, target_conn, contracts[schema+'.'+table], deadline=cycle_deadline)
                total_rows += rows
                synced_tables += 1
                continue
            columns = get_table_columns(source_conn, schema, table)
            ts_col = find_timestamp_column(columns)
            exists = table_exists_in_target(target_conn, schema, table)
            last_sync = get_last_sync_timestamp(target_conn, schema, table) if exists else None
            target_count = get_target_row_count(target_conn, schema, table) if exists else 0

            if not exists or last_sync is None or target_count == 0:
                # Lần đầu hoặc bảng trống/bị lỗi trước đó: full sync
                rows = sync_table_full(source_conn, target_conn, schema, table)
            elif ts_col:
                # Có cột timestamp: incremental sync
                rows = sync_table_incremental(
                    source_conn, target_conn, schema, table, ts_col, last_sync
                )
                # Full sync lại mỗi 1 giờ để đảm bảo consistency
                if last_sync and (datetime.now(timezone.utc) - last_sync).total_seconds() > 3600:
                    rows = sync_table_full(source_conn, target_conn, schema, table)
            else:
                # Không có cột timestamp: full sync mỗi lần
                rows = sync_table_full(source_conn, target_conn, schema, table)

            total_rows += rows
            synced_tables += 1

        except Exception as e:
            target_conn.rollback()
            source_conn.rollback()
            # Database errors may contain rejected row/credential values. Keep
            # classification and source identity, never the raw exception text.
            error_msg = f"{schema}.{table}: {getattr(e, 'pgcode', None) or type(e).__name__}"
            errors.append(error_msg)
            logger.warning(f"  Loi sync {error_msg}")
            # Ghi lỗi vào metadata (KHÔNG cập nhật last_synced_at để chu kỳ sau tự sync lại)
            try:
                with target_conn.cursor() as cur:
                    if governed:
                        cur.execute('UPDATE analytics.ingestion_checkpoints SET error_code=%s '
                            'WHERE dataset_id=%s', (getattr(e,'pgcode',None) or type(e).__name__,
                                                  contracts[schema+'.'+table]['dataset_id']))
                    cur.execute("""
                        INSERT INTO public.sync_metadata
                            (schema_name, table_name, error_message)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (schema_name, table_name) DO UPDATE SET
                            error_message = %s
                    """, (schema, table, error_msg, error_msg))
                target_conn.commit()
            except Exception:
                target_conn.rollback()

    # Cập nhật sync_history
    duration = time.time() - cycle_start
    status = "success" if not errors else f"partial ({len(errors)} errors)"
    with target_conn.cursor() as cur:
        cur.execute("""
            UPDATE public.sync_history
            SET finished_at = NOW(), total_tables = %s,
                total_rows = %s, status = %s, error_message = %s
            WHERE id = %s
        """, (synced_tables, total_rows, status,
              "; ".join(errors[:10]) if errors else None, history_id))
    target_conn.commit()

    logger.info(
        f"=== Sync hoan thanh: {synced_tables}/{len(tables)} bang, "
        f"{total_rows} rows, {duration:.1f}s, trang thai: {status} ==="
    )

    # Governed replicas use the separately reviewed/deployed Silver views.
    # Their least-privilege login never evolves tables/views at cycle end.
    if not governed:
        create_warehouse_views(target_conn)


def _load_warehouse_views():
    import json
    from pathlib import Path
    path = Path(os.getenv('DATA_PLATFORM_DATA_CONTRACTS_PATH', str(Path(__file__).resolve().parents[1] / 'metadata/data_contracts.json'))).parent / 'warehouse_views.json'
    registry = json.loads(path.read_text())
    if registry.get('version') != '3.4.0':
        raise ValueError('Reviewed warehouse view registry required')
    return [(v['name'], v['sql']) for v in registry['views'] if 'sync' in v['consumers']]


WAREHOUSE_VIEWS = _load_warehouse_views()


def create_warehouse_views(target_conn):
    """Tự động tạo hoặc cập nhật các View tầng Silver và Gold trong postgres-analytics sau khi ETL hoàn tất."""
    logger.info("Cap nhat cac View tang Silver va Gold...")
    views_created = 0
    try:
        prev_autocommit = getattr(target_conn, "autocommit", False)
        try:
            target_conn.autocommit = True
        except Exception:
            pass

        with target_conn.cursor() as cur:
            for schema in ("gold", "silver", "analytics"):
                try:
                    cur.execute(f"CREATE SCHEMA IF NOT EXISTS {schema};")
                except Exception:
                    pass

            for view_name, ddl in WAREHOUSE_VIEWS:
                try:
                    cur.execute(ddl)
                    views_created += 1
                except Exception as err:
                    logger.debug(f"View {view_name} bo qua: {err}")

        try:
            target_conn.autocommit = prev_autocommit
        except Exception:
            pass

        logger.info(f"=== Da tao/cap nhat {views_created}/{len(WAREHOUSE_VIEWS)} View tang Silver & Gold ===")
    except Exception as e:
        logger.warning(f"Khong the tao warehouse views: {e}")



def wait_for_target_db():
    """Đợi postgres-analytics sẵn sàng."""
    for attempt in range(30):
        try:
            conn = get_target_conn()
            conn.close()
            logger.info("postgres-analytics san sang!")
            return True
        except Exception as e:
            logger.info("Doi postgres-analytics (%s/30): %s", attempt+1, type(e).__name__)
            time.sleep(5)
    return False


def wait_for_source_db():
    """Đợi Supabase (source) sẵn sàng."""
    for attempt in range(20):
        try:
            conn = get_source_conn()
            conn.close()
            logger.info("Supabase (source) ket noi thanh cong!")
            return True
        except Exception as e:
            logger.info("Doi Supabase (%s/20): %s", attempt+1, type(e).__name__)
            time.sleep(10)
    return False


def next_sync_slot(previous, now, interval):
    """Monotonic fixed cadence, no catch-up burst or concurrent cycles."""
    import math
    if interval <= 0:
        raise ValueError('Positive sync interval required')
    candidate = previous+interval
    return candidate if candidate >= now else candidate+math.ceil((now-candidate)/interval)*interval


def main():
    if os.getenv('DATA_PLATFORM_GOVERNED_INGESTION','0')=='1':
        from pipeline_runtime import private_database_profile
        private_database_profile()  # Provision explicitly before any source/target I/O.
    logger.info("=== Avengers Coffee Data Sync Starting ===")
    logger.info(f"Source: {SOURCE_DB_HOST}:{SOURCE_DB_PORT}/{SOURCE_DB_NAME}")
    logger.info(f"Target: {TARGET_DB_HOST}:{TARGET_DB_PORT}/{TARGET_DB_NAME}")
    logger.info(f"Schemas: {SYNC_SCHEMAS}")
    logger.info(f"Sync interval: {SYNC_INTERVAL}s")

    # Đợi cả 2 DB sẵn sàng
    if not wait_for_target_db():
        logger.error("Khong the ket noi postgres-analytics. Thoat.")
        sys.exit(1)

    if not wait_for_source_db():
        logger.error("Khong the ket noi Supabase. Thoat.")
        sys.exit(1)

    # Fixed start slots; a slow cycle skips missed slots without overlapping.
    slot = time.monotonic()
    while True:
        source_conn = target_conn = None
        try:
            source_conn = get_source_conn()
            target_conn = get_target_conn()
            run_sync_cycle(source_conn, target_conn)
        except Exception as error:
            logger.error("Loi vong sync: %s", getattr(error, 'pgcode', None) or type(error).__name__)
        finally:
            for connection in (source_conn, target_conn):
                if connection is not None:
                    try:
                        connection.close()
                    except Exception:
                        pass
        now = time.monotonic()
        slot = next_sync_slot(slot, now, SYNC_INTERVAL)
        delay = max(0, slot-now)
        logger.info("Vong sync tiep theo sau %.1fs", delay)
        time.sleep(delay)


if __name__ == "__main__":
    main()
