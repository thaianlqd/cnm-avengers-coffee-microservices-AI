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
    return psycopg2.connect(
        host=SOURCE_DB_HOST, port=SOURCE_DB_PORT,
        user=SOURCE_DB_USER, password=SOURCE_DB_PASSWORD,
        dbname=SOURCE_DB_NAME, sslmode=SOURCE_DB_SSLMODE,
        connect_timeout=30,
        options="-c statement_timeout=120000",
    )


def get_target_conn():
    """Kết nối đến postgres-analytics (local)."""
    return psycopg2.connect(
        host=TARGET_DB_HOST, port=TARGET_DB_PORT,
        user=TARGET_DB_USER, password=TARGET_DB_PASSWORD,
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
    with target_conn.cursor() as cur:
        # TRUNCATE preserves dependent views; DROP ... CASCADE previously deleted Gold objects.
        cur.execute(f'TRUNCATE TABLE {schema}."{table}"')
    target_conn.commit()

    if not rows:
        duration_ms = int((time.time() - start_time) * 1000)
        update_sync_metadata(target_conn, schema, table, 0, duration_ms, "full")
        logger.info(f"  {schema}.{table}: 0 rows (bang rong)")
        return 0

    # Insert dữ liệu
    columns = list(rows[0].keys())
    col_list = ", ".join([f'"{c}"' for c in columns])
    placeholders = ", ".join(["%s"] * len(columns))
    insert_sql = f'INSERT INTO {schema}."{table}" ({col_list}) VALUES ({placeholders})'

    with target_conn.cursor() as cur:
        batch = []
        for row in rows:
            values = [adapt_value(row[c]) for c in columns]
            batch.append(values)
            if len(batch) >= BATCH_SIZE:
                psycopg2.extras.execute_batch(cur, insert_sql, batch, page_size=500)
                batch = []
        if batch:
            psycopg2.extras.execute_batch(cur, insert_sql, batch, page_size=500)

    target_conn.commit()

    duration_ms = int((time.time() - start_time) * 1000)
    logger.info(f"  {schema}.{table}: {len(rows)} rows ({duration_ms}ms)")

    # Cập nhật metadata
    update_sync_metadata(target_conn, schema, table, len(rows), duration_ms, "full")
    return len(rows)


def sync_table_incremental(source_conn, target_conn, schema, table, ts_col, last_sync):
    """Incremental sync: chỉ copy dữ liệu mới/cập nhật."""
    start_time = time.time()

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


def update_sync_metadata(target_conn, schema, table, rows, duration_ms, sync_type):
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
    target_conn.commit()


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
    total_rows = 0
    synced_tables = 0
    errors = []

    for schema, table in tables:
        try:
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
            error_msg = f"{schema}.{table}: {str(e)[:200]}"
            errors.append(error_msg)
            logger.warning(f"  Loi sync {error_msg}")
            # Ghi lỗi vào metadata (KHÔNG cập nhật last_synced_at để chu kỳ sau tự sync lại)
            try:
                with target_conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO public.sync_metadata
                            (schema_name, table_name, error_message)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (schema_name, table_name) DO UPDATE SET
                            error_message = %s
                    """, (schema, table, str(e)[:500], str(e)[:500]))
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


def wait_for_target_db():
    """Đợi postgres-analytics sẵn sàng."""
    for attempt in range(30):
        try:
            conn = get_target_conn()
            conn.close()
            logger.info("postgres-analytics san sang!")
            return True
        except Exception as e:
            logger.info(f"Doi postgres-analytics ({attempt + 1}/30): {e}")
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
            logger.info(f"Doi Supabase ({attempt + 1}/20): {e}")
            time.sleep(10)
    return False


def main():
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

    # Vòng lặp sync
    while True:
        try:
            source_conn = get_source_conn()
            target_conn = get_target_conn()

            run_sync_cycle(source_conn, target_conn)

            source_conn.close()
            target_conn.close()

        except Exception as e:
            logger.error(f"Loi vong sync: {e}")
            try:
                source_conn.close()
            except Exception:
                pass
            try:
                target_conn.close()
            except Exception:
                pass

        logger.info(f"Doi {SYNC_INTERVAL}s cho vong sync tiep theo...")
        time.sleep(SYNC_INTERVAL)


if __name__ == "__main__":
    main()
