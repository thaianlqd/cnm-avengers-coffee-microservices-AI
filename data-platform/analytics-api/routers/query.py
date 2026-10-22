from fastapi import APIRouter, HTTPException, Request
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
def get_warehouse_tables(request: Request = None):
    from services.report_sql_policy import require_warehouse_reader
    from services.analysis_catalog import AnalysisCatalog
    from services.metadata_service import get_local_metadata
    from services.access_policy import active_principal
    import os
    require_warehouse_reader()
    try:
        catalog = AnalysisCatalog(get_local_metadata())
        tables, samples = [], []
        for name, physical in sorted(catalog.tables.items()):
            allowed = set(catalog.policy['tables'].get(name, []))
            columns = [c for c in physical['columns'] if c['name'] in allowed]
            if not columns:
                continue
            meta = TABLE_METADATA.get(name, {})
            schema, table = name.split('.', 1)
            label = meta.get('display_name', table.replace('_', ' ').title())
            tables.append({'name': name, 'table_name': table, 'schema': schema,
                'display_name': label, 'category': meta.get('category', 'Dữ liệu vận hành'),
                'layer': meta.get('layer', 'Tầng Silver'),
                'description': meta.get('description', 'Nguồn dữ liệu được cấp quyền.'),
                'columns': [{'name': c['name'], 'type': c.get('data_type', '')} for c in columns]})
            quoted = lambda value: '"' + value.replace('"', '""') + '"'
            projection = ', '.join(quoted(c['name']) for c in columns[:6])
            samples.append({'title': f'Xem dữ liệu: {label}',
                'sql': f'SELECT {projection} FROM {quoted(schema)}.{quoted(table)} LIMIT 20'})
        principal = active_principal.get()
        execution = os.getenv('DATA_ANALYST_REPORT_SQL_MODE', 'disabled') == 'trusted_admin'
        execution = execution and bool(principal and principal.permits('sql.explore'))
        return {'warehouse': 'Avengers Analytics', 'schema': 'silver', 'tables': tables,
                'sample_queries': samples, 'sql_execution_enabled': execution,
                'sql_execution_reason': None if execution else 'Chạy SQL chưa được bật hoặc tài khoản chưa có quyền. Bạn vẫn có thể xem danh mục dữ liệu.'}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, 'Danh mục dữ liệu tạm thời chưa sẵn sàng.') from None


@router.post("/query")
def run_custom_query(req: SqlQueryRequest, request: Request = None):
    from services.report_sql_policy import require_sql_admin, validate_report_sql
    require_sql_admin(request)
    try:
        # Read-only is not a table/column/function permission. SQL Explorer
        # shares the explicit deployment gate and AST policy used by reports.
        validate_report_sql(req.sql)
        from services.access_policy import active_principal, development_fallback
        from services.telemetry import audit
        import hashlib
        authenticated = active_principal.get() is not None
        query_hash = hashlib.sha256(req.sql.encode()).hexdigest()
        if authenticated:
            audit('sql.explore', 'query', query_hash=query_hash)
        elif not development_fallback():
            raise HTTPException(403, 'SQL cần phiên đăng nhập có nhật ký bảo mật.')
        result = execute_read_only(req.sql, row_limit=500)
        if authenticated:
            audit('sql.explore', 'query', query_hash=query_hash, decision='completed',
                  details={'rows': result['count'], 'duration_ms': result['duration_ms']})
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
