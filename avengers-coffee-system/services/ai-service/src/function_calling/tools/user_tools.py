import logging
from typing import Any, Dict
from sqlalchemy import text
from src.function_calling.helpers import _get_engine, _require_valid_session

logger = logging.getLogger(__name__)


def _clean_profile_address(value: Any) -> str:
    """Remove duplicated location suffixes from legacy profile addresses."""
    parts = [part.strip() for part in str(value or "").split(",") if part.strip()]
    if not parts:
        return ""

    def key(part: str) -> str:
        import unicodedata
        raw = unicodedata.normalize("NFD", part.lower())
        return "".join(char for char in raw if unicodedata.category(char) != "Mn").replace("đ", "d")

    # Some saved rows already contain ward/city and legacy readers appended
    # the same ward/city once more. Collapse any adjacent repeated suffix block.
    changed = True
    while changed:
        changed = False
        for block_size in range(len(parts) // 2, 0, -1):
            if [key(item) for item in parts[-2 * block_size:-block_size]] == [
                key(item) for item in parts[-block_size:]
            ]:
                del parts[-block_size:]
                changed = True
                break
    return ", ".join(parts)

TOOL_GET_USER_PREFERENCES = {
    "type": "function",
    "function": {
        "name": "get_user_preferences",
        "description": "Lấy thông tin thói quen đặt hàng của khách (phương thức thanh toán thường dùng, chi nhánh hay đến) để điền tự động khi chốt đơn.",
        "parameters": {
            "type": "object",
            "properties": {}
        },
    },
}

def execute_get_user_preferences(session_id: str) -> Dict[str, Any]:
    try:
        customer_session_id = str(session_id).split(":conversation:", 1)[0]
        valid_uid = _require_valid_session(customer_session_id)
        if not valid_uid:
            return {"status": "unauthorized", "message": "Khách ẩn danh, không có thói quen."}

        engine = _get_engine()
        import os
        order_schema = os.getenv("ORDER_SCHEMA", "orders")

        with engine.connect() as conn:
            rows = conn.execute(text(
                f"""
                SELECT phuong_thuc_thanh_toan, co_so_ma
                FROM {order_schema}.don_hang
                WHERE ma_nguoi_dung = :uid
                ORDER BY ngay_tao DESC
                LIMIT 5
                """
            ), {"uid": valid_uid}).fetchall()
            
        if not rows:
            return {"status": "no_history", "message": "Khách chưa có lịch sử mua hàng."}

        payments = [r[0] for r in rows if r[0]]
        branches = [r[1] for r in rows if r[1]]
        
        def most_frequent(lst):
            return max(set(lst), key=lst.count) if lst else None
            
        preferred_payment = most_frequent(payments)
        preferred_branch = most_frequent(branches)

        return {
            "status": "ok",
            "preferred_payment": preferred_payment,
            "preferred_branch_id": preferred_branch,
            "message": f"Đây là thói quen của khách. Khi khách muốn 'chốt đơn', hãy điền thông tin này vào tool request_checkout, nhưng VẪN PHẢI TÓM TẮT để khách confirm qua UI."
        }
    except Exception as e:
        logger.warning("[AgentTools] get_user_preferences error: %s", e)
        return {"status": "error", "message": "Lỗi khi lấy thói quen khách hàng."}

TOOL_GET_USER_PROFILE = {
    "type": "function",
    "function": {
        "name": "get_user_profile",
        "description": (
            "Lấy thông tin cá nhân (tên, email, SĐT) và sổ địa chỉ của người dùng. "
            "Sử dụng tool này khi khách hàng hỏi về địa chỉ của họ, tên của họ, hoặc các thông tin cá nhân khác."
        ),
        "parameters": {
            "type": "object",
            "properties": {}
        },
    },
}

def execute_get_user_profile(session_id: str) -> Dict[str, Any]:
    try:
        customer_session_id = str(session_id).split(":conversation:", 1)[0]
        valid_uid = _require_valid_session(customer_session_id)
        if not valid_uid:
            return {"status": "unauthorized", "message": "Khách ẩn danh, không có thông tin cá nhân."}

        engine = _get_engine()
        import os
        identity_schema = os.getenv("IDENTITY_SCHEMA", "identity")

        with engine.connect() as conn:
            user_info = conn.execute(text(
                f"""
                SELECT ho_ten, email, so_dien_thoai
                FROM {identity_schema}.nguoi_dung
                WHERE ma_nguoi_dung = :id
                """
            ), {"id": valid_uid}).fetchone()

            if not user_info:
                return {"status": "not_found", "message": "Không tìm thấy thông tin người dùng."}
                
            addresses = conn.execute(text(
                f"""
                SELECT ten_dia_chi, dia_chi_day_du, mac_dinh
                FROM {identity_schema}.dia_chi_giao_hang
                WHERE ma_nguoi_dung = :uid
                ORDER BY mac_dinh DESC
                """
            ), {"uid": valid_uid}).fetchall()

        address_list = []
        structured_addresses = []
        for addr in addresses:
            full_address = _clean_profile_address(addr[1])
            address_list.append(f"- {addr[0] or 'Địa chỉ'}: {full_address} {'(Mặc định)' if addr[2] else ''}")
            structured_addresses.append({
                "label": addr[0] or "Địa chỉ",
                "full_address": full_address,
                "is_default": bool(addr[2]),
            })
            
        address_text = "\n".join(address_list) if address_list else "Chưa lưu địa chỉ nào."

        return {
            "status": "ok",
            "name": user_info[0] or "Chưa cập nhật",
            "email": user_info[1] or "Chưa cập nhật",
            "phone": user_info[2] or "Chưa cập nhật",
            "addresses": address_text,
            "address_items": structured_addresses,
            "default_address": next(
                (item["full_address"] for item in structured_addresses if item["is_default"]),
                structured_addresses[0]["full_address"] if structured_addresses else None,
            ),
            "message": "Đây là thông tin của khách hàng. Hãy trả lời thân thiện dựa trên thông tin này."
        }
    except Exception as e:
        logger.warning("[AgentTools] get_user_profile error: %s", e)
        return {"status": "error", "message": "Lỗi khi lấy thông tin cá nhân."}
