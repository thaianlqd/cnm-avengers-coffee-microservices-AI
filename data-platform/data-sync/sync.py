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

    # Tự động tạo và cập nhật các View tầng Silver & Gold ngay sau khi sync
    create_warehouse_views(target_conn)


WAREHOUSE_VIEWS = [
    (
        "gold.stores_overview",
        """
        CREATE OR REPLACE VIEW gold.stores_overview AS
        SELECT
            cn.ma_chi_nhanh AS store_code,
            cn.ten_chi_nhanh AS store_name,
            COALESCE(cn.thanh_pho, 'TP.HCM') AS city,
            COALESCE(cn.dia_chi, 'Đang cập nhật') AS address,
            CASE 
                WHEN cn.trang_thai = 'ACTIVE' THEN 'Hoạt động'
                ELSE 'Bảo trì'
            END AS status,
            COUNT(o.ma_don_hang) AS total_orders,
            COALESCE(SUM(o.tong_tien) FILTER (WHERE o.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')), 0) AS total_revenue,
            COALESCE(ROUND(AVG(o.tong_tien) FILTER (WHERE o.trang_thai_don_hang IN ('HOAN_THANH', 'DANG_GIAO')), 0), 0) AS aov
        FROM identity.chi_nhanh cn
        LEFT JOIN orders.don_hang o ON cn.ma_chi_nhanh = o.co_so_ma
        GROUP BY cn.ma_chi_nhanh, cn.ten_chi_nhanh, cn.thanh_pho, cn.dia_chi, cn.trang_thai;
        """,
    ),
    (
        "gold.menu_overview",
        """
        CREATE OR REPLACE VIEW gold.menu_overview AS
        SELECT
            sp.ma_san_pham AS product_id,
            sp.ten_san_pham AS product_name,
            COALESCE(dm.ten_danh_muc, 'Cà phê') AS category_name,
            sp.gia_ban AS price,
            COALESCE(SUM(ct.so_luong), 0) AS total_sold,
            COALESCE(SUM(ct.so_luong * ct.gia_ban), 0) AS total_revenue
        FROM menu.san_pham sp
        LEFT JOIN menu.danh_muc dm ON sp.ma_danh_muc = dm.ma_danh_muc
        LEFT JOIN orders.chi_tiet_don_hang ct ON sp.ma_san_pham = ct.ma_san_pham
        GROUP BY sp.ma_san_pham, sp.ten_san_pham, dm.ten_danh_muc, sp.gia_ban;
        """,
    ),
    (
        "silver.don_hang",
        """
        CREATE OR REPLACE VIEW silver.don_hang AS
        SELECT 
            ma_don_hang,
            ma_nguoi_dung,
            co_so_ma,
            tong_tien,
            phuong_thuc_thanh_toan,
            trang_thai_thanh_toan,
            trang_thai_don_hang,
            loai_don_hang,
            ma_voucher,
            so_tien_giam,
            ten_khach_hang,
            dia_chi_giao_hang,
            ngay_tao,
            ngay_cap_nhat
        FROM orders.don_hang;
        """,
    ),
    (
        "silver.chi_tiet_don_hang",
        """
        CREATE OR REPLACE VIEW silver.chi_tiet_don_hang AS
        SELECT 
            ct.id,
            ct.ma_don_hang,
            ct.ma_san_pham,
            ct.ten_san_pham,
            ct.gia_ban,
            ct.so_luong,
            ct.kich_co,
            ct.luong_da,
            ct.do_ngot,
            ct.toppings,
            (ct.gia_ban * ct.so_luong) AS thanh_tien
        FROM orders.chi_tiet_don_hang ct;
        """,
    ),
    (
        "silver.san_pham",
        """
        CREATE OR REPLACE VIEW silver.san_pham AS
        SELECT 
            sp.ma_san_pham,
            sp.ten_san_pham,
            sp.gia_ban,
            sp.gia_niem_yet,
            sp.trang_thai,
            sp.ma_danh_muc,
            COALESCE(dm.ten_danh_muc, 'Khác') AS ten_danh_muc,
            sp.la_hot,
            sp.la_moi
        FROM menu.san_pham sp
        LEFT JOIN menu.danh_muc dm ON sp.ma_danh_muc = dm.ma_danh_muc;
        """,
    ),
    (
        "silver.danh_muc",
        """
        CREATE OR REPLACE VIEW silver.danh_muc AS
        SELECT 
            ma_danh_muc,
            ten_danh_muc,
            hinh_anh_icon,
            ma_danh_muc_cha,
            cap_bac
        FROM menu.danh_muc;
        """,
    ),
    (
        "silver.nguoi_dung",
        """
        CREATE OR REPLACE VIEW silver.nguoi_dung AS
        SELECT 
            ma_nguoi_dung,
            ho_ten,
            so_dien_thoai,
            email,
            vai_tro,
            trang_thai,
            diem_loyalty,
            tong_chi_tieu,
            ngay_tao
        FROM identity.nguoi_dung;
        """,
    ),
    (
        "silver.chi_nhanh",
        """
        CREATE OR REPLACE VIEW silver.chi_nhanh AS
        SELECT 
            ma_chi_nhanh,
            ten_chi_nhanh,
            dia_chi,
            thanh_pho,
            so_dien_thoai,
            trang_thai,
            loai_diem_ban,
            gio_mo_cua,
            gio_dong_cua
        FROM identity.chi_nhanh;
        """,
    ),
    (
        "silver.giao_dich_thanh_toan",
        """
        CREATE OR REPLACE VIEW silver.giao_dich_thanh_toan AS
        SELECT 
            ma_giao_dich,
            ma_don_hang,
            cong_thanh_toan,
            so_tien,
            trang_thai,
            ngay_tao
        FROM orders.giao_dich_thanh_toan;
        """,
    ),
    (
        "silver.shipper",
        """
        CREATE OR REPLACE VIEW silver.shipper AS
        SELECT 
            id AS ma_shipper,
            full_name AS ho_ten,
            phone AS so_dien_thoai,
            vehicle_plate AS bien_so_xe,
            status AS trang_thai,
            vehicle_type AS loai_xe,
            total_deliveries AS tong_chuyen_giao,
            rating AS diem_danh_gia
        FROM orders.shipper;
        """,
    ),
    (
        "silver.ton_kho_san_pham",
        """
        CREATE OR REPLACE VIEW silver.ton_kho_san_pham AS
        SELECT 
            tk.id,
            tk.co_so_ma,
            tk.ma_san_pham,
            sp.ten_san_pham,
            tk.so_luong_ton,
            tk.muc_canh_bao,
            tk.dang_kinh_doanh,
            tk.cap_nhat_luc
        FROM inventory.ton_kho_san_pham tk
        LEFT JOIN menu.san_pham sp ON tk.ma_san_pham = sp.ma_san_pham;
        """,
    ),
    (
        "silver.khuyen_mai",
        """
        CREATE OR REPLACE VIEW silver.khuyen_mai AS
        SELECT 
            COALESCE(v.ma_voucher, km.ma_khuyen_mai) AS ma_khuyen_mai,
            COALESCE(km.ten_khuyen_mai, v.ten_voucher, v.ma_voucher, km.ma_khuyen_mai) AS ten_khuyen_mai,
            COALESCE(km.mo_ta, v.mo_ta) AS mo_ta,
            COALESCE(km.loai_khuyen_mai, v.loai) AS loai_khuyen_mai,
            COALESCE(km.gia_tri, v.gia_tri, 0) AS gia_tri,
            COALESCE(km.giam_toi_da, v.giam_toi_da, 0) AS giam_toi_da,
            COALESCE(km.gia_tri_don_toi_thieu, v.don_hang_toi_thieu, 0) AS don_hang_toi_thieu,
            COALESCE(km.so_luong_da_dung, v.luot_da_dung, 0) AS luot_da_dung,
            COALESCE(km.trang_thai, v.trang_thai, 'ACTIVE') AS trang_thai,
            COALESCE(v.ngay_bat_dau, km.ngay_bat_dau) AS ngay_bat_dau,
            COALESCE(v.han_su_dung, km.ngay_ket_thuc) AS ngay_ket_thuc
        FROM orders.voucher v
        FULL OUTER JOIN identity.khuyen_mai km ON v.ma_voucher = km.ma_khuyen_mai;
        """,
    ),
    (
        "silver.voucher",
        """
        CREATE OR REPLACE VIEW silver.voucher AS
        SELECT * FROM silver.khuyen_mai;
        """,
    ),
    (
        "silver.danh_gia_san_pham",
        """
        CREATE OR REPLACE VIEW silver.danh_gia_san_pham AS
        SELECT 
            dg.id,
            dg.ma_san_pham,
            COALESCE(sp.ten_san_pham, dg.ma_san_pham) AS ten_san_pham,
            dg.ma_nguoi_dung,
            dg.so_sao,
            dg.binh_luan,
            dg.ma_don_hang,
            dg.ngay_tao,
            dg.phan_hoi_quan_ly
        FROM orders.danh_gia_san_pham dg
        LEFT JOIN menu.san_pham sp ON dg.ma_san_pham = sp.ma_san_pham::text;
        """,
    ),
    (
        "silver.danh_gia_chi_nhanh",
        """
        CREATE OR REPLACE VIEW silver.danh_gia_chi_nhanh AS
        SELECT 
            dg.id,
            dg.ma_chi_nhanh,
            COALESCE(cn.ten_chi_nhanh, dg.ten_chi_nhanh, dg.ma_chi_nhanh) AS ten_chi_nhanh,
            dg.ma_nguoi_dung,
            dg.diem_tong_quan AS so_sao,
            dg.nhan_xet,
            dg.ma_don_hang,
            dg.ngay_tao
        FROM orders.danh_gia_chi_nhanh dg
        LEFT JOIN identity.chi_nhanh cn ON dg.ma_chi_nhanh = cn.ma_chi_nhanh;
        """,
    ),
    (
        "silver.ca_lam_viec_nhan_vien",
        """
        CREATE OR REPLACE VIEW silver.ca_lam_viec_nhan_vien AS
        SELECT 
            ma_ca_lam_viec,
            staff_name,
            staff_username,
            ngay_lam_viec,
            ten_ca,
            gio_bat_dau,
            gio_ket_thuc,
            trang_thai_cham_cong,
            check_in_at,
            check_out_at,
            co_so_ma,
            note
        FROM orders.ca_lam_viec_nhan_vien;
        """,
    ),
    (
        "silver.ca_doi_soat",
        """
        CREATE OR REPLACE VIEW silver.ca_doi_soat AS
        SELECT 
            ma_ca,
            co_so_ma,
            ten_nhan_vien,
            thoi_gian_bat_dau,
            thoi_gian_ket_thuc,
            tien_dau_ca,
            tien_cuoi_ca,
            tien_mat_he_thong,
            doanh_thu_he_thong,
            tien_mat_ky_vong,
            chenh_lech,
            tong_don,
            tong_don_tien_mat,
            trang_thai_phe_duyet,
            ghi_chu,
            ngay_tao
        FROM orders.ca_doi_soat;
        """,
    ),
    (
        "silver.yeu_thich_san_pham",
        """
        CREATE OR REPLACE VIEW silver.yeu_thich_san_pham AS
        SELECT 
            yt.id,
            yt.ma_nguoi_dung,
            yt.ma_san_pham,
            COALESCE(sp.ten_san_pham, yt.ten_san_pham) AS ten_san_pham,
            COALESCE(sp.gia_ban, yt.gia_ban) AS gia_ban,
            yt.danh_muc,
            yt.ngay_tao
        FROM orders.yeu_thich_san_pham yt
        LEFT JOIN menu.san_pham sp ON yt.ma_san_pham = sp.ma_san_pham::text;
        """,
    ),
    (
        "silver.khao_sat_phan_hoi",
        """
        CREATE OR REPLACE VIEW silver.khao_sat_phan_hoi AS
        SELECT 
            id,
            ma_bieu_mau,
            ma_nguoi_dung,
            ma_don_hang,
            co_so_ma,
            tra_loi,
            trang_thai_voucher,
            ngay_tao
        FROM orders.khao_sat_phan_hoi;
        """,
    ),
    (
        "silver.bien_the_san_pham",
        """
        CREATE OR REPLACE VIEW silver.bien_the_san_pham AS
        SELECT 
            bt.id,
            bt.ma_san_pham,
            sp.ten_san_pham,
            bt.ma_thuoc_tinh,
            bt.gia_tri,
            bt.phu_thu
        FROM menu.bien_the_san_pham bt
        LEFT JOIN menu.san_pham sp ON bt.ma_san_pham = sp.ma_san_pham;
        """,
    ),
    (
        "silver.khu_vuc",
        """
        CREATE OR REPLACE VIEW silver.khu_vuc AS
        SELECT 
            ma_khu_vuc,
            ten_khu_vuc,
            mo_ta
        FROM identity.khu_vuc;
        """,
    ),
]


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
