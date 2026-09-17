import logging
from typing import Any, Dict
from sqlalchemy import text
from src.common import cart_manager
from src.function_calling.helpers import _get_engine, _clean_dict, _check_business_hours

logger = logging.getLogger(__name__)

TOOL_ASK_BRANCH = {
    "type": "function",
    "function": {
        "name": "ask_branch",
        "description": (
            "Gọi tool này khi khách hàng chưa đề cập chi nhánh / cơ sở nào. "
            "Trả về danh sách chi nhánh đang hoạt động để LLM hỏi lại khách chọn. "
            "TUYỆT ĐỐI KHÔNG gọi tool này nếu khách đang chọn từ danh sách đã được bạn liệt kê trước đó (vd: 'chi nhánh 1'). Khi đó, hãy đọc lịch sử chat lấy TÊN chi nhánh và gọi thẳng set_session_branch."
        ),
        "parameters": {
            "type": "object",
            "properties": {}
        },
    },
}

def execute_ask_branch() -> Dict[str, Any]:
    """Lấy danh sách chi nhánh từ DB để LLM trình bày cho khách (có check giờ)."""
    try:
        hours_check = _check_business_hours()
        if hours_check:
            return hours_check

        engine = _get_engine()
        import os
        identity_schema = os.getenv("IDENTITY_SCHEMA", "identity")
        order_schema = os.getenv("ORDER_SCHEMA", "orders")
        with engine.connect() as conn:
            rows = conn.execute(text(
                f"""
                SELECT c.ma_chi_nhanh, c.ten_chi_nhanh, c.dia_chi,
                       ROUND(COALESCE(AVG(d.diem_tong_quan), 0)::numeric, 1)::float as avg_rating,
                       COUNT(d.id) as total_reviews
                FROM {identity_schema}.chi_nhanh c
                LEFT JOIN {order_schema}.danh_gia_chi_nhanh d ON c.ma_chi_nhanh::text = d.ma_chi_nhanh::text
                WHERE c.trang_thai = 'ACTIVE'
                GROUP BY c.ma_chi_nhanh, c.ten_chi_nhanh, c.dia_chi
                ORDER BY avg_rating DESC, c.ten_chi_nhanh ASC LIMIT 3
                """
            )).mappings().all()
        branches = [_clean_dict(dict(r)) for r in rows]
        return {
            "status": "need_branch_selection",
            "branches": branches,
            "message": "Vui lòng hỏi ngắn gọn khách hàng xem họ đang ở khu vực/quận nào để tìm chi nhánh gần nhất, hoặc có thể gợi ý tạm 3 chi nhánh phổ biến trên thay vì liệt kê dài dòng.",
        }
    except Exception as e:
        logger.warning("[AgentTools] ask_branch error: %s", e)
        return {"status": "error", "message": "Không thể lấy danh sách chi nhánh."}

TOOL_FIND_NEAREST_BRANCH = {
    "type": "function",
    "function": {
        "name": "find_nearest_branch",
        "description": "Tìm kiếm chi nhánh (cửa hàng cà phê) gần nhất. Nếu khách hỏi 'gần tôi' hoặc không nói rõ địa điểm, hãy ĐỂ TRỐNG tham số location (location='') để hệ thống tự động lấy địa chỉ mặc định của khách. KHÔNG dùng tool này để trả lời câu hỏi 'địa chỉ của tôi ở đâu' (hãy dùng get_user_profile).",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "Địa điểm Quận, Huyện, hoặc Thành phố (ví dụ: 'Hải Châu', 'Quận 1'). Để trống nếu muốn tìm theo địa chỉ của khách."
                },
            },
            "required": [],
        },
    },
}

def execute_find_nearest_branch(location: str = "", session_id: str = "") -> Dict[str, Any]:
    """Tìm chi nhánh gần nhất dựa trên geocoding và khoảng cách Haversine."""
    try:
        hours_check = _check_business_hours()
        if hours_check:
            return hours_check

        engine = _get_engine()
        import os
        identity_schema = os.getenv("IDENTITY_SCHEMA", "identity")
        order_schema = os.getenv("ORDER_SCHEMA", "orders")

        from utils.geo import geocode_address, haversine_distance

        target_address = location.strip() if location else ""
        user_lat, user_lon = None, None

        with engine.connect() as conn:
            from src.function_calling.helpers import _norm
            generic_words = {"toi", "gan", "day", "nao", "nhat", "nha", "dia", "chi", "mac", "dinh", "cua", "hien", "tai"}
            norm_loc = _norm(location).lower().replace(",", " ") if location else ""
            is_generic = all(w in generic_words for w in norm_loc.split()) if norm_loc else True
            
            if (not target_address or is_generic) and session_id:
                addr = conn.execute(text(
                    f"""
                    SELECT dia_chi_day_du, vi_do, kinh_do
                    FROM {identity_schema}.dia_chi_giao_hang 
                    WHERE ma_nguoi_dung::text = :uid AND mac_dinh = true
                    LIMIT 1
                    """
                ), {"uid": session_id}).fetchone()
                
                if addr and addr[0]:
                    target_address = addr[0]
                    if addr[1] is not None and addr[2] is not None:
                        user_lat = float(addr[1])
                        user_lon = float(addr[2])

            if not target_address:
                return {
                    "status": "need_location",
                    "message": "Hệ thống AI hiện chưa được cấp quyền truy cập GPS của khách hàng, và bạn chưa có địa chỉ mặc định. Hãy hỏi khách hàng đang ở địa chỉ nào để tìm chi nhánh gần nhất."
                }

            if user_lat is None or user_lon is None:
                coords = geocode_address(target_address)
                if not coords:
                    return {
                        "status": "not_found",
                        "message": f"Rất tiếc, hệ thống bản đồ không thể xác định được vị trí của '{target_address}'. Bạn có thể cung cấp địa chỉ cụ thể hơn không?"
                    }
                user_lat, user_lon = coords
                
                if session_id and not location:
                    conn.execute(text(
                        f"""
                        UPDATE {identity_schema}.dia_chi_giao_hang 
                        SET vi_do = :lat, kinh_do = :lng 
                        WHERE ma_nguoi_dung::text = :uid AND mac_dinh = true
                        """
                    ), {"lat": user_lat, "lng": user_lon, "uid": session_id})
                    conn.commit()

            query = f"""
                SELECT c.ma_chi_nhanh, c.ten_chi_nhanh, c.dia_chi, c.vi_do, c.kinh_do,
                       ROUND(COALESCE(AVG(d.diem_tong_quan), 0)::numeric, 1)::float as avg_rating,
                       COUNT(d.id) as total_reviews
                FROM {identity_schema}.chi_nhanh c
                LEFT JOIN {order_schema}.danh_gia_chi_nhanh d ON c.ma_chi_nhanh::text = d.ma_chi_nhanh::text
                WHERE c.trang_thai = 'ACTIVE' AND c.vi_do IS NOT NULL AND c.kinh_do IS NOT NULL
                GROUP BY c.ma_chi_nhanh, c.ten_chi_nhanh, c.dia_chi, c.vi_do, c.kinh_do
            """
            rows = conn.execute(text(query)).mappings().all()

            if not rows:
                return {
                    "status": "not_found",
                    "message": "Hiện tại hệ thống chưa có chi nhánh nào được cập nhật tọa độ trên bản đồ."
                }

            branches = []
            for r in rows:
                dist = haversine_distance(user_lat, user_lon, float(r["vi_do"]), float(r["kinh_do"]))
                branch_dict = _clean_dict(dict(r))
                branch_dict["khoang_cach_km"] = round(dist, 1)
                branches.append(branch_dict)

            branches.sort(key=lambda x: x["khoang_cach_km"])
            top_branches = branches[:3]

            nearest_dist = top_branches[0]["khoang_cach_km"]
            
            msg = f"Dựa vào địa chỉ của khách ({target_address}), đây là top 3 chi nhánh gần nhất. BẮT BUỘC: Bạn PHẢI đọc TÊN CỤ THỂ của chi nhánh và BÁO SỐ KM (khoang_cach_km) kèm chữ '(đường chim bay)' cho khách."
            
            if nearest_dist > 15:
                msg += f" WARNING: Chi nhánh gần nhất cũng cách tới {nearest_dist}km. Hãy báo rõ cho khách là khu vực của khách khá xa các chi nhánh hiện tại."

            return {
                "status": "ok",
                "branches": top_branches,
                "message": msg
            }

    except Exception as e:
        logger.warning("[AgentTools] find_nearest_branch error: %s", e)
        return {"status": "error", "message": "Không thể tìm kiếm chi nhánh lúc này."}

TOOL_SET_SESSION_BRANCH = {
    "type": "function",
    "function": {
        "name": "set_session_branch",
        "description": (
            "Gọi tool này ngay sau khi khách đã xác nhận chọn chi nhánh cụ thể. "
            "Lưu lựa chọn vào session để các tool tiếp theo dùng. "
            "QUAN TRỌNG: Nếu bạn chỉ biết tên chi nhánh từ lịch sử chat (vd: 'Highlands Coffee D9 Tân Phú') mà không biết mã branch_id, hãy cứ truyền TÊN ĐÓ vào trường branch_id, hệ thống sẽ tự động tìm kiếm."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "branch_id": {
                    "type": "string",
                    "description": "Mã chi nhánh (ma_chi_nhanh) khách đã chọn, hoặc tên chi nhánh nếu không biết mã.",
                },
                "branch_name": {
                    "type": "string",
                    "description": "Tên chi nhánh cho dễ hiển thị.",
                },
            },
            "required": ["branch_id", "branch_name"],
        },
    },
}

def execute_set_session_branch(session_id: str, branch_id: str, branch_name: str) -> Dict[str, Any]:
    engine = _get_engine()
    import os
    identity_schema = os.getenv("IDENTITY_SCHEMA", "identity")
    
    with engine.connect() as conn:
        # Tìm chính xác theo mã hoặc tìm tương đối theo tên
        row = conn.execute(
            text(f"SELECT ma_chi_nhanh, ten_chi_nhanh FROM {identity_schema}.chi_nhanh WHERE ma_chi_nhanh = :bid OR ten_chi_nhanh ILIKE :bname LIMIT 1"),
            {"bid": branch_id, "bname": f"%{branch_id}%"}
        ).fetchone()
        
        # Nếu chưa ra, tìm theo branch_name
        if not row and branch_name:
            row = conn.execute(
                text(f"SELECT ma_chi_nhanh, ten_chi_nhanh FROM {identity_schema}.chi_nhanh WHERE ten_chi_nhanh ILIKE :bname LIMIT 1"),
                {"bname": f"%{branch_name}%"}
            ).fetchone()
            
        if row:
            real_branch_id = str(row[0])
            real_branch_name = str(row[1])
            cart_manager.set_branch(session_id, real_branch_id, real_branch_name)
            return {
                "status": "ok",
                "message": f"Đã ghi nhận chi nhánh: {real_branch_name}. Bây giờ có thể tra cứu giá và tồn kho.",
            }
        
    return {
        "status": "error",
        "message": f"Không tìm thấy chi nhánh nào khớp với '{branch_id}' hay '{branch_name}'. Bạn có thể gọi lại ask_branch hoặc báo lại cho khách.",
    }
