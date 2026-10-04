import logging
import os
import psycopg2
import psycopg2.extras

# ─── Load Environment Variables ───
DB_HOST = os.getenv("DB_HOST", "postgres-analytics")
DB_PORT = int(os.getenv("DB_PORT", 5432))
DB_USER = os.getenv("DB_USER", "analytics")
DB_PASSWORD = os.getenv("DB_PASSWORD", "analytics123")
DB_NAME = os.getenv("DB_NAME", "analytics")
DB_SSLMODE = os.getenv("DB_SSLMODE", "disable")

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin123")

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")


def get_db_conn():
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        dbname=DB_NAME,
        sslmode=DB_SSLMODE,
        cursor_factory=psycopg2.extras.RealDictCursor,
        connect_timeout=10,
    )


logger = logging.getLogger("warehouse")

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


def init_warehouse_views() -> bool:
    """Initialize warehouse schemas, views, and tables with per-view fault tolerance.
    Returns True if core analytical views (silver.don_hang, silver.chi_nhanh) are present.
    """
    try:
        conn = get_db_conn()
        conn.autocommit = True
    except Exception as e:
        logger.warning(f"Could not connect to database for warehouse view initialization: {e}")
        return False

    try:
        with conn.cursor() as cur:
            # 1. Schemas
            for schema in ("gold", "silver", "analytics"):
                try:
                    cur.execute(f"CREATE SCHEMA IF NOT EXISTS {schema};")
                except Exception as schema_err:
                    logger.debug(f"Schema {schema} notice: {schema_err}")

            # 2. Saved reports and export logs tables
            try:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS analytics.saved_reports (
                        id VARCHAR(64) PRIMARY KEY,
                        title VARCHAR(255) NOT NULL,
                        description TEXT,
                        category VARCHAR(50) NOT NULL DEFAULT 'sales',
                        query_type VARCHAR(20) NOT NULL DEFAULT 'sql',
                        sql_query TEXT NOT NULL,
                        visualization_type VARCHAR(30) DEFAULT 'table',
                        x_key VARCHAR(100),
                        y_key VARCHAR(100),
                        ai_summary TEXT,
                        created_by VARCHAR(100) DEFAULT 'Chuyên viên phân tích',
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                """)
                cur.execute("ALTER TABLE analytics.saved_reports ADD COLUMN IF NOT EXISTS module_config JSONB;")
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS analytics.report_export_logs (
                        id VARCHAR(64) PRIMARY KEY,
                        report_title VARCHAR(255) NOT NULL,
                        format VARCHAR(20) NOT NULL,
                        row_count INT DEFAULT 0,
                        file_size VARCHAR(50) DEFAULT '0 KB',
                        status VARCHAR(50) DEFAULT 'Thành công',
                        user_name VARCHAR(100) DEFAULT 'Chuyên viên phân tích',
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                """)
            except Exception as tbl_err:
                logger.debug(f"Analytics tables notice: {tbl_err}")

            # 3. Create views individually with fault isolation
            success_count = 0
            for view_name, ddl in WAREHOUSE_VIEWS:
                try:
                    cur.execute(ddl)
                    success_count += 1
                except Exception as view_err:
                    logger.debug(f"View {view_name} skipped (source table not ready): {view_err}")

            # 4. Verify whether core views exist
            cur.execute("""
                SELECT table_name FROM information_schema.views 
                WHERE table_schema = 'silver' AND table_name IN ('don_hang', 'chi_nhanh');
            """)
            rows = cur.fetchall()
            core_views = {r['table_name'] for r in rows}
            is_ready = ('don_hang' in core_views and 'chi_nhanh' in core_views)
            if is_ready:
                logger.info(f"Warehouse views initialized successfully ({success_count}/{len(WAREHOUSE_VIEWS)} views active).")
            return is_ready
    except Exception as e:
        logger.warning(f"Error initializing warehouse views: {e}")
        return False
    finally:
        conn.close()
