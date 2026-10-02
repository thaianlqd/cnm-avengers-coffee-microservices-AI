import os
import sys
import json
import requests
import psycopg2
from psycopg2.extras import RealDictCursor

DB_HOST = os.getenv("DB_HOST", "postgres-analytics")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_USER = os.getenv("DB_USER", "analytics")
DB_PASS = os.getenv("DB_PASS", "analytics123")
DB_NAME = os.getenv("DB_NAME", "analytics")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")


def get_conn():
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASS,
        dbname=DB_NAME,
        connect_timeout=10,
    )


def get_embedding(text: str) -> list:
    """Generate 768-dim semantic embedding via gemini-embedding-001."""
    if not GEMINI_API_KEY or not text.strip():
        return [0.0] * 768

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key={GEMINI_API_KEY}"
    payload = {
        "content": {"parts": [{"text": text[:3000]}]},
        "outputDimensionality": 768,
    }
    try:
        res = requests.post(url, json=payload, timeout=12)
        if res.status_code == 200:
            return res.json().get("embedding", {}).get("values", [0.0] * 768)
        else:
            print(f"Embedding error {res.status_code}: {res.text[:120]}")
            return [0.0] * 768
    except Exception as e:
        print(f"Embedding exception: {e}")
        return [0.0] * 768


def run_init_sql():
    print("=== Bước 1: Khởi tạo bảng dữ liệu schema_catalog và table_relationships ===")
    conn = get_conn()
    cur = conn.cursor()
    sql_file = os.path.join(os.path.dirname(__file__), "02_init_ai_agent_schema.sql")
    if os.path.exists(sql_file):
        with open(sql_file, "r", encoding="utf-8") as f:
            cur.execute(f.read())
    conn.commit()
    cur.close()
    conn.close()
    print("Khởi tạo cấu trúc bảng thành công!")


def seed_table_relationships():
    print("=== Bước 2: Nạp các mối quan hệ khóa ngoại (Foreign Keys & Join Paths) ===")
    relationships = [
        {
            "from_table": "orders.don_hang",
            "from_column": "co_so_ma",
            "to_table": "identity.chi_nhanh",
            "to_column": "ma_chi_nhanh",
            "relationship_type": "MANY_TO_ONE",
            "join_clause": "JOIN identity.chi_nhanh cn ON orders.don_hang.co_so_ma = cn.ma_chi_nhanh",
            "business_context": "Liên kết đơn hàng với cửa hàng chi nhánh để lấy tên điểm bán, thành phố, địa chỉ",
        },
        {
            "from_table": "orders.chi_tiet_don_hang",
            "from_column": "ma_don_hang",
            "to_table": "orders.don_hang",
            "to_column": "ma_don_hang",
            "relationship_type": "MANY_TO_ONE",
            "join_clause": "JOIN orders.don_hang dh ON orders.chi_tiet_don_hang.ma_don_hang = dh.ma_don_hang",
            "business_context": "Liên kết từng món trong đơn với hóa đơn chính để lấy ngày tạo, trạng thái hoàn tất, chi nhánh",
        },
        {
            "from_table": "orders.chi_tiet_don_hang",
            "from_column": "ma_san_pham",
            "to_table": "menu.san_pham",
            "to_column": "ma_san_pham",
            "relationship_type": "MANY_TO_ONE",
            "join_clause": "JOIN menu.san_pham sp ON orders.chi_tiet_don_hang.ma_san_pham = sp.ma_san_pham",
            "business_context": "Liên kết món trong hóa đơn với danh mục sản phẩm đồ uống",
        },
        {
            "from_table": "menu.san_pham",
            "from_column": "ma_danh_muc",
            "to_table": "menu.danh_muc",
            "to_column": "ma_danh_muc",
            "relationship_type": "MANY_TO_ONE",
            "join_clause": "JOIN menu.danh_muc dm ON menu.san_pham.ma_danh_muc = dm.ma_danh_muc",
            "business_context": "Liên kết sản phẩm với nhóm thực đơn (Cà phê, Trà, Bánh ngọt, Trà sữa)",
        },
        {
            "from_table": "orders.don_hang",
            "from_column": "ma_nguoi_dung",
            "to_table": "identity.nguoi_dung",
            "to_column": "ma_nguoi_dung",
            "relationship_type": "MANY_TO_ONE",
            "join_clause": "JOIN identity.nguoi_dung nd ON orders.don_hang.ma_nguoi_dung = nd.ma_nguoi_dung::text",
            "business_context": "Liên kết đơn hàng với thông tin hội viên (điểm loyalty, tổng chi tiêu)",
        },
    ]

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("TRUNCATE TABLE ai_agent.table_relationships;")
    for r in relationships:
        cur.execute("""
            INSERT INTO ai_agent.table_relationships 
            (from_table, from_column, to_table, to_column, relationship_type, join_clause, business_context)
            VALUES (%s, %s, %s, %s, %s, %s, %s);
        """, (
            r["from_table"], r["from_column"], r["to_table"], r["to_column"],
            r["relationship_type"], r["join_clause"], r["business_context"]
        ))
    conn.commit()
    cur.close()
    conn.close()
    print(f"Đã nạp {len(relationships)} đường dẫn liên kết bảng chuẩn vào ai_agent.table_relationships.")


def seed_semantic_schema_catalog():
    print("=== Bước 3: Nạp danh mục ngữ nghĩa cấu trúc bảng & Vector Embeddings ===")
    
    table_specs = [
        {
            "schema_name": "orders",
            "table_name": "don_hang",
            "domain_name": "Giao dịch Đơn hàng Bán hàng",
            "table_grain": "Mỗi dòng đại diện cho 1 giao dịch đơn hàng của khách hàng.",
            "primary_key": "ma_don_hang (UUID)",
            "relationships": "- co_so_ma -> identity.chi_nhanh.ma_chi_nhanh\n- ma_don_hang -> orders.chi_tiet_don_hang.ma_don_hang\n- ma_nguoi_dung -> identity.nguoi_dung.ma_nguoi_dung",
            "columns": [
                {"name": "ma_don_hang", "type": "uuid", "desc": "Mã định danh duy nhất của đơn hàng"},
                {"name": "ngay_tao", "type": "timestamp", "desc": "Thời điểm đặt hàng (dùng để lọc hôm nay, 7 ngày, 30 ngày)"},
                {"name": "tong_tien", "type": "numeric", "desc": "Tổng số tiền khách thanh toán sau khi trừ voucher"},
                {"name": "so_tien_giam", "type": "numeric", "desc": "Số tiền khuyến mãi giảm giá"},
                {"name": "trang_thai_don_hang", "type": "text", "desc": "Trạng thái đơn: 'HOAN_THANH' (thành công), 'DANG_GIAO', 'DA_HUY'"},
                {"name": "phuong_thuc_thanh_toan", "type": "text", "desc": "Hình thức thanh toán: 'TIEN_MAT', 'MOMO', 'VNPAY', 'NGAN_HANG_QR'"},
                {"name": "loai_don_hang", "type": "text", "desc": "Kênh bán: 'TAI_QUAY', 'MANG_DI', 'GIAO_TAN_NOI'"},
                {"name": "co_so_ma", "type": "text", "desc": "Mã chi nhánh thực hiện đơn hàng (FK tới identity.chi_nhanh)"},
                {"name": "ma_nguoi_dung", "type": "text", "desc": "Mã khách hàng / hội viên nếu có tài khoản"}
            ]
        },
        {
            "schema_name": "orders",
            "table_name": "chi_tiet_don_hang",
            "domain_name": "Chi tiết Món ăn Đồ uống trong Đơn hàng",
            "table_grain": "Mỗi dòng đại diện cho 1 món ăn hoặc đồ uống cụ thể trong đơn hàng.",
            "primary_key": "id (integer)",
            "relationships": "- ma_don_hang -> orders.don_hang.ma_don_hang\n- ma_san_pham -> menu.san_pham.ma_san_pham",
            "columns": [
                {"name": "id", "type": "integer", "desc": "Khóa chính chi tiết đơn"},
                {"name": "ma_don_hang", "type": "uuid", "desc": "Mã đơn hàng cha chứa món này"},
                {"name": "ma_san_pham", "type": "integer", "desc": "Mã sản phẩm đồ uống / bánh ngọt"},
                {"name": "ten_san_pham", "type": "text", "desc": "Tên món bán ra (ví dụ: Mocha Frappe, Caramel Macchiato)"},
                {"name": "so_luong", "type": "integer", "desc": "Số lượng ly / phần được đặt"},
                {"name": "gia_ban", "type": "numeric", "desc": "Đơn giá bán thực tế của món"},
                {"name": "kich_co", "type": "text", "desc": "Size đồ uống (S, M, L)"}
            ]
        },
        {
            "schema_name": "menu",
            "table_name": "san_pham",
            "domain_name": "Danh mục Thực đơn và Sản phẩm",
            "table_grain": "Mỗi dòng đại diện cho 1 sản phẩm đồ uống hoặc bánh ngọt trong menu.",
            "primary_key": "ma_san_pham (integer)",
            "relationships": "- ma_danh_muc -> menu.danh_muc.ma_danh_muc",
            "columns": [
                {"name": "ma_san_pham", "type": "integer", "desc": "Mã sản phẩm"},
                {"name": "ten_san_pham", "type": "text", "desc": "Tên sản phẩm niêm yết"},
                {"name": "gia_ban", "type": "numeric", "desc": "Giá bán niêm yết"},
                {"name": "ma_danh_muc", "type": "integer", "desc": "Mã nhóm thực đơn cha"},
                {"name": "trang_thai", "type": "boolean", "desc": "Trạng thái đang kinh doanh (true/false)"}
            ]
        },
        {
            "schema_name": "menu",
            "table_name": "danh_muc",
            "domain_name": "Nhóm Thực đơn Danh mục",
            "table_grain": "Mỗi dòng đại diện cho 1 nhóm thực đơn.",
            "primary_key": "ma_danh_muc (integer)",
            "relationships": "- ma_danh_muc_cha -> menu.danh_muc.ma_danh_muc (quan hệ phân cấp cha con)",
            "columns": [
                {"name": "ma_danh_muc", "type": "integer", "desc": "Mã danh mục"},
                {"name": "ten_danh_muc", "type": "text", "desc": "Tên danh mục (Cà phê, Trà, Đá xay, Bánh ngọt,...)"},
                {"name": "ma_danh_muc_cha", "type": "integer", "desc": "Mã nhóm cha nếu là danh mục con"},
                {"name": "cap_bac", "type": "integer", "desc": "Cấp bậc phân cấp danh mục"}
            ]
        },
        {
            "schema_name": "identity",
            "table_name": "chi_nhanh",
            "domain_name": "Hệ thống Cửa hàng và Chi nhánh Toàn quốc",
            "table_grain": "Mỗi dòng đại diện cho 1 điểm bán / cửa hàng cà phê.",
            "primary_key": "ma_chi_nhanh (text)",
            "relationships": "Được tham chiếu từ orders.don_hang.co_so_ma",
            "columns": [
                {"name": "ma_chi_nhanh", "type": "text", "desc": "Mã định danh chi nhánh (ví dụ: CN001, CN002)"},
                {"name": "ten_chi_nhanh", "type": "text", "desc": "Tên đầy đủ của cửa hàng điểm bán"},
                {"name": "thanh_pho", "type": "text", "desc": "Tỉnh / Thành phố nơi đặt cửa hàng (Hà Nội, TP.HCM, Đà Nẵng,...)"},
                {"name": "dia_chi", "type": "text", "desc": "Địa chỉ chi tiết của cửa hàng"},
                {"name": "trang_thai", "type": "text", "desc": "Trạng thái hoạt động ('ACTIVE', 'INACTIVE')"}
            ]
        },
        {
            "schema_name": "identity",
            "table_name": "nguoi_dung",
            "domain_name": "Hồ sơ Khách hàng và Hội viên Loyalty",
            "table_grain": "Mỗi dòng đại diện cho 1 tài khoản người dùng / hội viên.",
            "primary_key": "ma_nguoi_dung (UUID)",
            "relationships": "Được tham chiếu từ orders.don_hang.ma_nguoi_dung",
            "columns": [
                {"name": "ma_nguoi_dung", "type": "uuid", "desc": "Mã định danh hội viên"},
                {"name": "ho_ten", "type": "text", "desc": "Họ và tên khách hàng"},
                {"name": "so_dien_thoai", "type": "text", "desc": "Số điện thoại liên hệ"},
                {"name": "email", "type": "text", "desc": "Địa chỉ email"},
                {"name": "diem_loyalty", "type": "integer", "desc": "Điểm tích lũy thành viên"},
                {"name": "tong_chi_tieu", "type": "numeric", "desc": "Lũy kế số tiền đã chi tiêu tại chuỗi"}
            ]
        },
        {
            "schema_name": "gold",
            "table_name": "revenue_daily",
            "domain_name": "Data Mart Doanh thu Chuỗi Thời gian (30 ngày gần nhất)",
            "table_grain": "Mỗi dòng tương ứng số liệu tổng hợp của 1 ngày kinh doanh.",
            "primary_key": "date (text dạng YYYY-MM-DD)",
            "relationships": "Bảng tổng hợp nhanh không cần JOIN phức tạp",
            "columns": [
                {"name": "date", "type": "text", "desc": "Ngày bán hàng (YYYY-MM-DD)"},
                {"name": "total_orders", "type": "bigint", "desc": "Tổng số lượng đơn hoàn tất trong ngày"},
                {"name": "revenue", "type": "double precision", "desc": "Tổng doanh thu bán hàng trong ngày (VNĐ)"}
            ]
        },
        {
            "schema_name": "gold",
            "table_name": "top_products",
            "domain_name": "Data Mart Xếp hạng Sản phẩm và Món bán chạy",
            "table_grain": "Mỗi dòng tương ứng tổng số lượng và doanh thu tích lũy của 1 món.",
            "primary_key": "ma_san_pham (bigint)",
            "relationships": "Bảng tổng hợp xếp hạng sản phẩm",
            "columns": [
                {"name": "ma_san_pham", "type": "bigint", "desc": "Mã sản phẩm"},
                {"name": "ten_san_pham", "type": "text", "desc": "Tên món ăn / đồ uống bán chạy"},
                {"name": "total_quantity", "type": "bigint", "desc": "Tổng số lượng ly / phần đã bán ra"},
                {"name": "total_revenue", "type": "double precision", "desc": "Tổng doanh thu tạo ra từ món này (VNĐ)"}
            ]
        },
        {
            "schema_name": "gold",
            "table_name": "stores_overview",
            "domain_name": "Data Mart Hiệu suất Bán hàng từng Chi nhánh",
            "table_grain": "Mỗi dòng là số liệu doanh thu và đơn hàng của 1 cửa hàng.",
            "primary_key": "store_code (text)",
            "relationships": "Bảng tổng hợp điểm bán",
            "columns": [
                {"name": "store_code", "type": "text", "desc": "Mã chi nhánh điểm bán"},
                {"name": "store_name", "type": "text", "desc": "Tên cửa hàng"},
                {"name": "city", "type": "text", "desc": "Thành phố"},
                {"name": "total_orders", "type": "bigint", "desc": "Tổng số đơn đã phục vụ"},
                {"name": "total_revenue", "type": "numeric", "desc": "Tổng doanh thu cửa hàng (VNĐ)"},
                {"name": "aov", "type": "numeric", "desc": "Giá trị đơn trung bình tại điểm bán (VNĐ)"}
            ]
        },
        {
            "schema_name": "gold",
            "table_name": "payment_methods_distribution",
            "domain_name": "Data Mart Cơ cấu Phương thức Thanh toán",
            "table_grain": "Mỗi dòng là 1 hình thức thanh toán.",
            "primary_key": "payment_method (text)",
            "relationships": "Bảng cơ cấu thanh toán",
            "columns": [
                {"name": "payment_method", "type": "text", "desc": "Tên phương thức thanh toán"},
                {"name": "count", "type": "bigint", "desc": "Số lượng đơn hàng thanh toán qua kênh này"},
                {"name": "revenue", "type": "double precision", "desc": "Tổng tiền thanh toán qua kênh này (VNĐ)"}
            ]
        },
        {
            "schema_name": "gold",
            "table_name": "order_status_distribution",
            "domain_name": "Data Mart Phân bổ Trạng thái Đơn hàng và Tỷ lệ Hủy",
            "table_grain": "Mỗi dòng là 1 trạng thái đơn hàng.",
            "primary_key": "status (text)",
            "relationships": "Bảng phân bổ trạng thái đơn",
            "columns": [
                {"name": "status", "type": "text", "desc": "Trạng thái đơn ('HOAN_THANH', 'DANG_GIAO', 'DA_HUY')"},
                {"name": "count", "type": "bigint", "desc": "Số lượng đơn hàng"},
                {"name": "pct", "type": "double precision", "desc": "Tỷ trọng phần trăm (%)"}
            ]
        }
    ]

    conn = get_conn()
    cur = conn.cursor()

    cur.execute("TRUNCATE TABLE ai_agent.schema_catalog;")
    for spec in table_specs:
        col_lines = [f"- {c['name']} ({c['type']}): {c['desc']}" for c in spec["columns"]]
        summary_md = f"""### Bảng: {spec['schema_name']}.{spec['table_name']}
- Miền nghiệp vụ: {spec['domain_name']}
- Cấp độ dữ liệu (Grain): {spec['table_grain']}
- Khóa chính: {spec['primary_key']}
- Liên kết khóa ngoại (Joins):
{spec['relationships']}
- Danh sách các trường dữ liệu:
{chr(10).join(col_lines)}
"""
        emb = get_embedding(summary_md)
        cur.execute("""
            INSERT INTO ai_agent.schema_catalog 
            (schema_name, table_name, domain_name, table_grain, primary_key, relationships, columns_metadata, summary_markdown, embedding)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s);
        """, (
            spec["schema_name"],
            spec["table_name"],
            spec["domain_name"],
            spec["table_grain"],
            spec["primary_key"],
            spec["relationships"],
            json.dumps(spec["columns"]),
            summary_md,
            emb
        ))

    conn.commit()
    cur.close()
    conn.close()
    print(f"Đã lập chỉ mục Vector Ngữ nghĩa cho {len(table_specs)} bảng dữ liệu cốt lõi vào ai_agent.schema_catalog.")


if __name__ == "__main__":
    seed_table_relationships()
    seed_semantic_schema_catalog()
    print("=== HOÀN TẤT THIẾT LẬP KHO TRI THỨC DỮ LIỆU BÀI BẢN CHO AI AGENT ===")
