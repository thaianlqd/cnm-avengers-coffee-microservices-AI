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


def init_warehouse_views():
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                # 1. Standard Warehouse Views
                cur.execute("""
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
                """)
                cur.execute("""
                    CREATE OR REPLACE VIEW gold.menu_overview AS
                    SELECT
                        sp.ma_san_pham AS product_id,
                        sp.ten_san_pham AS product_name,
                        COALESCE(dm.ten_danh_muc, 'Cà phê') AS category_name,
                        sp.gia_ban AS price,
                        COALESCE(tp.total_quantity, 0) AS total_sold,
                        COALESCE(tp.total_revenue, 0) AS total_revenue
                    FROM menu.san_pham sp
                    LEFT JOIN menu.danh_muc dm ON sp.ma_danh_muc = dm.ma_danh_muc
                    LEFT JOIN gold.top_products tp ON sp.ma_san_pham = tp.ma_san_pham;
                """)

                # 2. Saved Reports Table
                cur.execute("CREATE SCHEMA IF NOT EXISTS analytics;")
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
                cur.execute("""
                    ALTER TABLE analytics.saved_reports
                    ADD COLUMN IF NOT EXISTS module_config JSONB;
                """)

                # 3. Report Export & Audit Logs Table
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

                # 4. Seed default saved reports if table is empty
                cur.execute("SELECT COUNT(*) AS cnt FROM analytics.saved_reports;")
                report_count = cur.fetchone()["cnt"]
                if report_count == 0:
                    seed_reports = [
                        (
                            "rpt_revenue_by_store",
                            "Doanh thu thuần theo Chi nhánh",
                            "Xếp hạng hiệu quả kinh doanh và số lượng đơn hoàn thành của từng điểm bán toàn chuỗi.",
                            "stores",
                            "sql",
                            "SELECT cn.ten_chi_nhanh AS store_name, COUNT(o.ma_don_hang) AS total_orders, COALESCE(SUM(o.tong_tien), 0) AS total_revenue FROM identity.chi_nhanh cn LEFT JOIN orders.don_hang o ON cn.ma_chi_nhanh = o.co_so_ma AND o.trang_thai_don_hang = 'HOAN_THANH' GROUP BY cn.ten_chi_nhanh ORDER BY total_revenue DESC LIMIT 15;",
                            "bar",
                            "store_name",
                            "total_revenue",
                            "Chi nhánh Quận 1 và Quận 3 đang dẫn đầu chuỗi với hơn 45% tổng doanh thu đóng góp.",
                            "Hệ thống phân tích"
                        ),
                        (
                            "rpt_top_products_sold",
                            "Top 10 Sản phẩm bán chạy nhất",
                            "Thống kê số lượng ly bán ra và doanh số thu về của các món đồ uống chủ lực.",
                            "products",
                            "sql",
                            "SELECT sp.ten_san_pham AS product_name, COALESCE(SUM(ct.so_luong), 0) AS total_qty, COALESCE(SUM(ct.so_luong * ct.gia_ban), 0) AS total_revenue FROM orders.chi_tiet_don_hang ct JOIN menu.san_pham sp ON ct.ma_san_pham = sp.ma_san_pham JOIN orders.don_hang o ON ct.ma_don_hang = o.ma_don_hang WHERE o.trang_thai_don_hang = 'HOAN_THANH' GROUP BY sp.ten_san_pham ORDER BY total_qty DESC LIMIT 10;",
                            "bar",
                            "product_name",
                            "total_qty",
                            "Cà phê Muối và Cà phê Sữa Đá tiếp tục chiếm tỷ trọng tiêu thụ áp đảo trong danh mục nước.",
                            "Hệ thống phân tích"
                        ),
                        (
                            "rpt_daily_trend",
                            "Xu hướng doanh thu theo ngày",
                            "Diễn biến doanh thu và lượng giao dịch theo thời gian 30 ngày gần nhất.",
                            "sales",
                            "sql",
                            "SELECT d.ngay_tao::date::text AS order_date, COUNT(d.ma_don_hang) AS total_orders, COALESCE(SUM(d.tong_tien), 0) AS total_revenue FROM orders.don_hang d WHERE d.trang_thai_don_hang = 'HOAN_THANH' GROUP BY d.ngay_tao::date ORDER BY d.ngay_tao::date DESC LIMIT 30;",
                            "area",
                            "order_date",
                            "total_revenue",
                            "Doanh thu đạt đỉnh đều đặn vào các ngày thứ Sáu và thứ Bảy cuối tuần.",
                            "Hệ thống phân tích"
                        ),
                        (
                            "rpt_payment_distribution",
                            "Cơ cấu phương thức thanh toán",
                            "Tỷ trọng giao dịch giữa Chuyển khoản QR, Ví điện tử MoMo, VNPay và Tiền mặt.",
                            "sales",
                            "sql",
                            "SELECT CASE WHEN phuong_thuc_thanh_toan IN ('NGAN_HANG_QR', 'CHUYEN_KHOAN') THEN 'Chuyển khoản QR' WHEN phuong_thuc_thanh_toan = 'VNPAY' THEN 'Ví VNPay' WHEN phuong_thuc_thanh_toan = 'MOMO' THEN 'Ví MoMo' ELSE 'Tiền mặt' END AS payment_channel, COUNT(ma_don_hang) AS order_count, COALESCE(SUM(tong_tien), 0) AS total_amount FROM orders.don_hang WHERE trang_thai_don_hang = 'HOAN_THANH' GROUP BY payment_channel ORDER BY total_amount DESC;",
                            "donut",
                            "payment_channel",
                            "total_amount",
                            "Thanh toán không tiền mặt (QR và Ví điện tử) chiếm hơn 78% tổng doanh thu toàn chuỗi.",
                            "Hệ thống phân tích"
                        ),
                        (
                            "rpt_rfm_customers",
                            "Phân khúc khách hàng trung thành",
                            "Quy mô số lượng khách và giá trị chi tiêu trọn đời theo từng nhóm hành vi.",
                            "customers",
                            "sql",
                            "SELECT segment AS customer_segment, count AS customer_count, avg_ltv AS average_spending FROM gold.customer_segments ORDER BY customer_count DESC;",
                            "donut",
                            "customer_segment",
                            "customer_count",
                            "Nhóm khách hàng thân thiết đóng góp 62% doanh thu định kỳ của toàn hệ thống.",
                            "Hệ thống phân tích"
                        )
                    ]
                    cur.executemany("""
                        INSERT INTO analytics.saved_reports (
                            id, title, description, category, query_type, sql_query,
                            visualization_type, x_key, y_key, ai_summary, created_by
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                    """, seed_reports)

                # 5. Seed default audit logs if empty
                cur.execute("SELECT COUNT(*) AS cnt FROM analytics.report_export_logs;")
                log_count = cur.fetchone()["cnt"]
                if log_count == 0:
                    seed_logs = [
                        ("log_1", "Doanh thu thuần theo Chi nhánh", "CSV", 15, "3.2 KB", "Thành công", "Nguyễn Văn An"),
                        ("log_2", "Top 10 Sản phẩm bán chạy nhất", "Excel", 10, "12.8 KB", "Thành công", "Trần Thị Mai"),
                        ("log_3", "Xu hướng doanh thu theo ngày", "PDF", 30, "154.0 KB", "Thành công", "Lê Hoàng Quân")
                    ]
                    cur.executemany("""
                        INSERT INTO analytics.report_export_logs (
                            id, report_title, format, row_count, file_size, status, user_name
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s);
                    """, seed_logs)

                conn.commit()
    except Exception as e:
        print(f"Warning: could not initialize warehouse views/tables: {e}")
