from fastapi import APIRouter, HTTPException
from db import get_db_conn
from common import SqlQueryRequest
from services.sql_service import SqlSafetyError, QueryExecutionError, execute_read_only

router = APIRouter(prefix="/api", tags=["SQL & Warehouse Explorer"])


TABLE_METADATA = {
    # ── Bán hàng & Đơn hàng (Silver Detailed)
    "silver.don_hang": {
        "display_name": "Đơn hàng (Giao dịch)",
        "category": "Bán hàng & Đơn hàng",
        "layer": "Tầng Silver (Chi tiết)",
        "description": "Dữ liệu đơn hàng chi tiết đã làm sạch: mã đơn, giá trị, hình thức thanh toán, cơ sở và trạng thái."
    },
    "silver.chi_tiet_don_hang": {
        "display_name": "Chi tiết món trong đơn",
        "category": "Bán hàng & Đơn hàng",
        "layer": "Tầng Silver (Chi tiết)",
        "description": "Chi tiết từng món nước: tên món, kích cỡ, đá, đường, topping, đơn giá và thành tiền."
    },
    "silver.giao_dich_thanh_toan": {
        "display_name": "Giao dịch thanh toán",
        "category": "Bán hàng & Đơn hàng",
        "layer": "Tầng Silver (Chi tiết)",
        "description": "Lịch sử thanh toán đơn hàng qua cổng trực tuyến hoặc thu ngân tại quầy."
    },

    # ── Thực đơn & Sản phẩm (Silver Detailed)
    "silver.san_pham": {
        "display_name": "Sản phẩm & Đồ uống",
        "category": "Thực đơn & Sản phẩm",
        "layer": "Tầng Silver (Chi tiết)",
        "description": "Danh mục sản phẩm cà phê, đồ uống, giá niêm yết, tên nhóm thực đơn và trạng thái món."
    },
    "silver.danh_muc": {
        "display_name": "Nhóm thực đơn",
        "category": "Thực đơn & Sản phẩm",
        "layer": "Tầng Silver (Chi tiết)",
        "description": "Phân loại các nhóm đồ uống chính như Cà phê máy, Cà phê phin, Trà trái cây, Bánh ngọt."
    },

    # ── Khách hàng & Thành viên (Silver Detailed)
    "silver.nguoi_dung": {
        "display_name": "Khách hàng & Hội viên",
        "category": "Khách hàng & Hội viên",
        "layer": "Tầng Silver (Chi tiết)",
        "description": "Hồ sơ người dùng: số điện thoại, điểm thưởng Beans, tổng chi tiêu tích lũy và ngày tham gia."
    },

    # ── Chi nhánh & Vận hành (Silver Detailed)
    "silver.chi_nhanh": {
        "display_name": "Hệ thống Chi nhánh",
        "category": "Chi nhánh & Vận hành",
        "layer": "Tầng Silver (Chi tiết)",
        "description": "Mạng lưới cửa hàng: tên quán, địa chỉ, tỉnh/thành phố, số điện thoại và giờ mở cửa."
    },
    "silver.shipper": {
        "display_name": "Đội ngũ tài xế giao hàng",
        "category": "Chi nhánh & Vận hành",
        "layer": "Tầng Silver (Chi tiết)",
        "description": "Danh sách tài xế giao hàng: họ tên, số điện thoại, biển số xe, tổng chuyến giao và điểm đánh giá."
    },
    "silver.ton_kho_san_pham": {
        "display_name": "Tồn kho nguyên vật liệu",
        "category": "Chi nhánh & Vận hành",
        "layer": "Tầng Silver (Chi tiết)",
        "description": "Số lượng tồn kho, định mức nguyên vật liệu dự trữ tại các chi nhánh cửa hàng."
    },
    "silver.khuyen_mai": {
        "display_name": "Chương trình khuyến mãi & Voucher",
        "category": "Bán hàng & Khuyến mãi",
        "layer": "Tầng Silver (Chi tiết)",
        "description": "Danh mục chương trình khuyến mãi, voucher giảm giá, mức giảm, trạng thái áp dụng."
    },
    "silver.voucher": {
        "display_name": "Kho mã Voucher ưu đãi",
        "category": "Bán hàng & Khuyến mãi",
        "layer": "Tầng Silver (Chi tiết)",
        "description": "Mã voucher, loại chiết khấu %, giảm cố định và số lượt sử dụng."
    },
    "silver.danh_gia_san_pham": {
        "display_name": "Đánh giá chất lượng món uống",
        "category": "Trải nghiệm & Khách hàng",
        "layer": "Tầng Silver (Chi tiết)",
        "description": "Số sao đánh giá (1-5 sao), bình luận và phản hồi của khách hàng về từng món nước."
    },
    "silver.danh_gia_chi_nhanh": {
        "display_name": "Đánh giá chất lượng chi nhánh",
        "category": "Chi nhánh & Vận hành",
        "layer": "Tầng Silver (Chi tiết)",
        "description": "Điểm đánh giá phục vụ, không gian và nhận xét của khách tại từng cửa hàng."
    },
    "silver.ca_lam_viec_nhan_vien": {
        "display_name": "Ca làm việc & Chấm công",
        "category": "Nhân sự & Vận hành",
        "layer": "Tầng Silver (Chi tiết)",
        "description": "Lịch phân ca, chấm công check-in/out, trạng thái đi đúng giờ, đi trễ của nhân sự."
    },
    "silver.ca_doi_soat": {
        "display_name": "Đối soát ca thu ngân",
        "category": "Tài chính & Thu quỹ",
        "layer": "Tầng Silver (Chi tiết)",
        "description": "Số liệu kết ca thu ngân, tiền đầu ca/cuối ca, tiền mặt thực tế vs hệ thống và chênh lệch quỹ."
    },
    "silver.yeu_thich_san_pham": {
        "display_name": "Món uống yêu thích (Wishlist)",
        "category": "Thực đơn & Sản phẩm",
        "layer": "Tầng Silver (Chi tiết)",
        "description": "Dữ liệu khách hàng lưu món uống yêu thích và quan tâm trên ứng dụng."
    },
    "silver.khao_sat_phan_hoi": {
        "display_name": "Khảo sát ý kiến khách hàng",
        "category": "Trải nghiệm & Khách hàng",
        "layer": "Tầng Silver (Chi tiết)",
        "description": "Phản hồi câu hỏi khảo sát dịch vụ và trạng thái nhận voucher tri ân của khách."
    },
    "silver.bien_the_san_pham": {
        "display_name": "Biến thể sản phẩm (Size & Thuộc tính)",
        "category": "Thực đơn & Sản phẩm",
        "layer": "Tầng Silver (Chi tiết)",
        "description": "Biến thể kích cỡ (S/M/L), độ ngọt, đá và phụ thu tương ứng của từng món."
    },
    "silver.khu_vuc": {
        "display_name": "Khu vực địa lý chi nhánh",
        "category": "Chi nhánh & Vận hành",
        "layer": "Tầng Silver (Chi tiết)",
        "description": "Phân vùng địa lý và quản lý cụm chi nhánh cửa hàng."
    },
}


@router.get("/warehouse/tables")
def get_warehouse_tables():
    try:
        with get_db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        c.table_schema,
                        c.table_name,
                        c.column_name,
                        c.data_type,
                        c.ordinal_position
                    FROM information_schema.columns c
                    WHERE c.table_schema = 'silver'
                    ORDER BY c.table_name, c.ordinal_position;
                """)
                rows = cur.fetchall()

                tables_dict = {}
                for r in rows:
                    s_name = r["table_schema"]
                    t_name = r["table_name"]
                    full_name = f"{s_name}.{t_name}"

                    meta = TABLE_METADATA.get(full_name, {
                        "display_name": t_name.replace("_", " ").title(),
                        "category": "Dữ liệu vận hành",
                        "layer": "Tầng Silver (Chi tiết)",
                        "description": f"Bảng dữ liệu {t_name}"
                    })

                    if full_name not in tables_dict:
                        tables_dict[full_name] = {
                            "name": full_name,
                            "table_name": t_name,
                            "schema": s_name,
                            "display_name": meta["display_name"],
                            "category": meta["category"],
                            "layer": meta["layer"],
                            "description": meta["description"],
                            "columns": []
                        }
                    tables_dict[full_name]["columns"].append({
                        "name": r["column_name"],
                        "type": r["data_type"]
                    })

                sample_queries = [
                    {
                        "title": "20 đơn hàng mới nhất và hình thức thanh toán",
                        "sql": "SELECT ma_don_hang, tong_tien, phuong_thuc_thanh_toan, trang_thai_don_hang, ngay_tao\nFROM silver.don_hang\nORDER BY ngay_tao DESC\nLIMIT 20;"
                    },
                    {
                        "title": "Top món bán chạy và doanh thu từ chi tiết đơn hàng",
                        "sql": "SELECT ten_san_pham, kich_co, COUNT(*) AS so_lan_goi, SUM(so_luong) AS tong_ly_ban, SUM(thanh_tien) AS tong_tien\nFROM silver.chi_tiet_don_hang\nGROUP BY ten_san_pham, kich_co\nORDER BY tong_ly_ban DESC\nLIMIT 15;"
                    },
                    {
                        "title": "Khách hàng thân thiết có điểm tích lũy Beans cao nhất",
                        "sql": "SELECT ho_ten, so_dien_thoai, email, diem_loyalty, tong_chi_tieu, ngay_tao\nFROM silver.nguoi_dung\nORDER BY diem_loyalty DESC\nLIMIT 20;"
                    },
                    {
                        "title": "Danh sách thực đơn sản phẩm đồ uống và giá bán",
                        "sql": "SELECT ma_san_pham, ten_san_pham, ten_danh_muc, gia_ban, trang_thai\nFROM silver.san_pham\nORDER BY ma_san_pham ASC;"
                    },
                    {
                        "title": "Hiệu suất tài xế giao hàng và điểm đánh giá",
                        "sql": "SELECT ho_ten, so_dien_thoai, bien_so_xe, loai_xe, tong_chuyen_giao, diem_danh_gia\nFROM silver.shipper\nORDER BY tong_chuyen_giao DESC;"
                    },
                    {
                        "title": "Mạng lưới chi nhánh cửa hàng đang hoạt động",
                        "sql": "SELECT ma_chi_nhanh, ten_chi_nhanh, thanh_pho, dia_chi, so_dien_thoai, trang_thai\nFROM silver.chi_nhanh\nORDER BY thanh_pho, ten_chi_nhanh;"
                    }
                ]

                # Sort tables logically: Bán hàng -> Thực đơn -> Khách hàng -> Chi nhánh
                category_order = {
                    "Bán hàng & Đơn hàng": 1,
                    "Thực đơn & Sản phẩm": 2,
                    "Khách hàng & Hội viên": 3,
                    "Chi nhánh & Vận hành": 4,
                }
                sorted_tables = sorted(
                    tables_dict.values(),
                    key=lambda t: (category_order.get(t.get("category"), 99), t.get("display_name", ""))
                )

                return {
                    "warehouse": "Avengers Analytics Lakehouse",
                    "schema": "silver",
                    "tables": sorted_tables,
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
