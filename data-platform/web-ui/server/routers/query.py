from fastapi import APIRouter, HTTPException
from db import get_db_conn
from common import SqlQueryRequest
from services.sql_service import SqlSafetyError, QueryExecutionError, execute_read_only

router = APIRouter(prefix="/api", tags=["SQL & Warehouse Explorer"])


@router.get("/warehouse/tables")
def get_warehouse_tables():
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                # Query all active schema tables across Silver Entities, Gold Marts, and Bronze Stream
                cur.execute("""
                    SELECT 
                        c.table_schema,
                        c.table_name,
                        c.column_name,
                        c.data_type,
                        c.ordinal_position
                    FROM information_schema.columns c
                    WHERE c.table_schema IN ('orders', 'menu', 'identity', 'inventory', 'gold', 'public')
                    ORDER BY 
                        CASE c.table_schema
                            WHEN 'orders' THEN 1
                            WHEN 'menu' THEN 2
                            WHEN 'identity' THEN 3
                            WHEN 'inventory' THEN 4
                            WHEN 'gold' THEN 5
                            ELSE 6
                        END,
                        c.table_name, 
                        c.ordinal_position;
                """)
                rows = cur.fetchall()

                # Comprehensive entity & table metadata descriptions
                table_descriptions = {
                    # Core Cleaned Entities (Silver Fact & Dimension Layer)
                    "orders.don_hang": "Fact - Giao dịch đơn hàng toàn hệ thống (mã đơn, ngày tạo, tổng tiền, phương thức, trạng thái, cơ sở)",
                    "orders.chi_tiet_don_hang": "Fact - Chi tiết từng món trong đơn hàng (sản phẩm, số lượng, giá bán, thành tiền)",
                    "orders.giao_dich_thanh_toan": "Fact - Lịch sử giao dịch thanh toán (phương thức, mã giao dịch, số tiền, trạng thái)",
                    "orders.voucher": "Dimension - Danh mục mã giảm giá, voucher khuyến mãi, điều kiện áp dụng",
                    "orders.shipper": "Dimension - Danh sách tài xế giao hàng, phương tiện và thông tin vận chuyển",
                    "orders.shipper_delivery": "Fact - Lịch sử các chuyến giao nhận đơn hàng, thời gian và địa chỉ giao",
                    "orders.customer_wallet": "Fact/Dimension - Ví tiền điện tử và điểm tích lũy của khách hàng",
                    "orders.danh_gia_san_pham": "Fact - Phản hồi và điểm đánh giá của khách hàng về sản phẩm",
                    "orders.danh_gia_chi_nhanh": "Fact - Đánh giá chất lượng dịch vụ của từng cửa hàng",
                    
                    "menu.san_pham": "Dimension - Danh mục sản phẩm (mã món, tên món, giá niêm yết, danh mục ngành hàng)",
                    "menu.danh_muc": "Dimension - Phân loại ngành hàng (Cà phê, Trà, Bánh & Đồ ăn nhẹ, Đá xay...)",
                    "menu.bien_the_san_pham": "Dimension - Biến thể kích cỡ (Size S, M, L) và giá bán tương ứng",
                    "menu.thuoc_tinh": "Dimension - Thuộc tính món (độ ngọt, lượng đá, topping đi kèm)",
                    
                    "identity.chi_nhanh": "Dimension - Danh sách chuỗi cửa hàng / kiosk (mã chi nhánh, tên, địa chỉ, thành phố, trạng thái)",
                    "identity.nguoi_dung": "Dimension - Tài khoản khách hàng, nhân viên và người quản lý",
                    "identity.membership_config": "Dimension - Cấu hình cấp bậc thành viên (Đồng, Bạc, Vàng, Kim Cương)",
                    "identity.khu_vuc": "Dimension - Khu vực địa lý và thị trường kinh doanh chuỗi",
                    "identity.dia_chi_giao_hang": "Dimension - Sổ địa chỉ nhận hàng của khách hàng",
                    
                    "inventory.ton_kho_san_pham": "Fact - Tồn kho nguyên vật liệu và sản phẩm theo từng chi nhánh",
                    
                    # Data Marts (Gold Layer: Pre-aggregated for fast BI)
                    "gold.revenue_daily": "Data Mart - Tổng hợp doanh thu và số đơn hàng theo từng ngày (tối ưu vẽ biểu đồ)",
                    "gold.top_products": "Data Mart - Xếp hạng sản phẩm bán chạy nhất và doanh thu từng món",
                    "gold.stores_overview": "Data Mart - Tổng quan hiệu suất kinh doanh, doanh thu và AOV từng cửa hàng",
                    "gold.customer_segments": "Data Mart - Phân khúc khách hàng theo mô hình RFM và giá trị vòng đời (LTV)",
                    "gold.branch_taste_profile": "Data Mart - Phân tích khẩu vị, kích cỡ và xu hướng đặt món theo chi nhánh",
                    "gold.payment_methods_distribution": "Data Mart - Thống kê tỷ trọng và doanh thu theo hình thức thanh toán",
                    "gold.order_status_distribution": "Data Mart - Phân bổ tỷ lệ trạng thái hoàn thành và giao hàng",
                    "gold.shipper_performance": "Data Mart - Đánh giá hiệu suất, thời gian giao và tỷ lệ thành công của tài xế",
                    "gold.menu_overview": "Data Mart - Bảng thực đơn tích lũy phục vụ phân tích menu",
                    "gold.kpi_summary": "Data Mart - Các chỉ số tổng quan điều hành toàn chuỗi",
                    
                    # Bronze Layer (Raw Streaming)
                    "public.realtime_events": "Bronze - Sự kiện streaming thời gian thực từ Kafka (đơn hàng mới, chuyển trạng thái)"
                }

                tables_dict = {}
                for r in rows:
                    schema = r["table_schema"]
                    t_name = r["table_name"]
                    full_name = f"{schema}.{t_name}"

                    if full_name not in tables_dict:
                        # Determine layer category
                        if schema in ('orders', 'menu', 'identity', 'inventory'):
                            layer_label = "Silver (Thực thể sạch)"
                        elif schema == 'gold':
                            layer_label = "Gold (Data Mart)"
                        else:
                            layer_label = "Bronze (Dữ liệu thô)"

                        tables_dict[full_name] = {
                            "name": full_name,
                            "table_name": t_name,
                            "schema": schema,
                            "layer": layer_label,
                            "description": table_descriptions.get(full_name, f"Bảng dữ liệu thực thể {full_name}"),
                            "columns": []
                        }
                    tables_dict[full_name]["columns"].append({
                        "name": r["column_name"],
                        "type": r["data_type"]
                    })

                sample_queries = [
                    {
                        "title": "Truy vấn đơn hàng chi tiết (Orders JOIN Chi tiết đơn JOIN Cửa hàng)",
                        "sql": "SELECT \n    d.ma_don_hang,\n    d.ngay_tao,\n    cn.ten_chi_nhanh,\n    ct.ten_san_pham,\n    ct.so_luong,\n    ct.gia_ban,\n    (ct.so_luong * ct.gia_ban) AS thanh_tien\nFROM orders.don_hang d\nJOIN orders.chi_tiet_don_hang ct ON d.ma_don_hang = ct.ma_don_hang\nLEFT JOIN identity.chi_nhanh cn ON d.co_so_ma = cn.ma_chi_nhanh\nORDER BY d.ngay_tao DESC\nLIMIT 20;"
                    },
                    {
                        "title": "Doanh số thực tế theo nhóm sản phẩm từ bảng dữ liệu gốc",
                        "sql": "SELECT \n    COALESCE(dm.ten_danh_muc, 'Khác') AS danh_muc,\n    COUNT(DISTINCT d.ma_don_hang) AS so_don,\n    SUM(ct.so_luong) AS tong_ly_ban,\n    SUM(ct.so_luong * ct.gia_ban) AS tong_doanh_thu\nFROM orders.chi_tiet_don_hang ct\nJOIN orders.don_hang d ON ct.ma_don_hang = d.ma_don_hang\nJOIN menu.san_pham sp ON ct.ma_san_pham = sp.ma_san_pham\nLEFT JOIN menu.danh_muc dm ON sp.ma_danh_muc = dm.ma_danh_muc\nGROUP BY dm.ten_danh_muc\nORDER BY tong_doanh_thu DESC;"
                    },
                    {
                        "title": "Xếp hạng khách hàng chi tiêu nhiều nhất (Customer LTV)",
                        "sql": "SELECT \n    COALESCE(u.ho_ten, d.ten_khach_hang, 'Khách hàng') AS ten_khach_hang,\n    COUNT(d.ma_don_hang) AS so_don_da_mua,\n    SUM(d.tong_tien) AS tong_chi_tieu,\n    ROUND(AVG(d.tong_tien), 0) AS chi_tieu_trung_binh\nFROM orders.don_hang d\nLEFT JOIN identity.nguoi_dung u ON d.ma_nguoi_dung = u.ma_nguoi_dung\nWHERE d.trang_thai_don_hang = 'HOAN_THANH'\nGROUP BY u.ho_ten, d.ten_khach_hang\nORDER BY tong_chi_tieu DESC\nLIMIT 15;"
                    },
                    {
                        "title": "Top 10 cửa hàng có doanh thu cao nhất toàn chuỗi",
                        "sql": "SELECT \n    cn.ma_chi_nhanh,\n    cn.ten_chi_nhanh,\n    cn.thanh_pho,\n    COUNT(d.ma_don_hang) AS tong_don,\n    COALESCE(SUM(d.tong_tien), 0) AS tong_doanh_thu\nFROM identity.chi_nhanh cn\nLEFT JOIN orders.don_hang d ON cn.ma_chi_nhanh = d.co_so_ma\nGROUP BY cn.ma_chi_nhanh, cn.ten_chi_nhanh, cn.thanh_pho\nORDER BY tong_doanh_thu DESC\nLIMIT 10;"
                    },
                    {
                        "title": "Truy vấn từ Data Mart tổng hợp (Gold - Tối ưu tốc độ cao)",
                        "sql": "SELECT date, total_orders, revenue\nFROM gold.revenue_daily\nORDER BY date DESC\nLIMIT 14;"
                    }
                ]

                return {
                    "warehouse": "Avengers Coffee Enterprise Data Warehouse",
                    "schema": "multi-layer (silver entities + gold marts + bronze)",
                    "tables": list(tables_dict.values()),
                    "sample_queries": sample_queries
                }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/query")
def run_custom_query(req: SqlQueryRequest):
    try:
        result = execute_read_only(req.sql, row_limit=500)
        return {
            "columns": result["columns"],
            "data": result["rows"],
            "count": result["count"],
            "truncated": result["truncated"],
            "duration_ms": result["duration_ms"],
            "target_layer": "Data Warehouse (postgres-analytics)"
        }
    except (SqlSafetyError, QueryExecutionError) as exc:
        raise HTTPException(status_code=400, detail=f"Lỗi SQL: {str(exc)}")
