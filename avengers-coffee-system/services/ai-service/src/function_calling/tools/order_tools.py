import logging
from typing import Any, Dict
from sqlalchemy import text
from src.function_calling.helpers import _get_engine, _clean_dict, _require_valid_session, _get_service_jwt

logger = logging.getLogger(__name__)

TOOL_TRACK_ORDER_STATUS = {
    "type": "function",
    "function": {
        "name": "track_order_status",
        "description": (
            "Kiểm tra trạng thái của một đơn hàng cụ thể bằng mã đơn hàng. "
            "Chỉ gọi khi khách hàng cung cấp mã đơn hàng."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "order_id": {
                    "type": "string",
                    "description": "Mã đơn hàng (ma_don_hang) mà khách muốn kiểm tra."
                },
            },
            "required": ["order_id"],
        },
    },
}

def execute_track_order_status(order_id: str, session_id: str) -> Dict[str, Any]:
    try:
        valid_uid = _require_valid_session(session_id)
        if not valid_uid:
            return {
                "status": "denied",
                "message": "Xin lỗi, mình chỉ có thể tra cứu đơn hàng thuộc tài khoản của bạn. Vui lòng đăng nhập để sử dụng tính năng này."
            }

        engine = _get_engine()
        import os
        order_schema = os.getenv("ORDER_SCHEMA", "orders")

        with engine.connect() as conn:
            row = conn.execute(text(
                f"""
                SELECT ma_don_hang, trang_thai_don_hang, trang_thai_thanh_toan, tong_tien
                FROM {order_schema}.don_hang
                WHERE ma_don_hang = :order_id AND ma_nguoi_dung = :session_id
                """
            ), {"order_id": order_id, "session_id": session_id}).mappings().fetchone()

        if not row:
            return {
                "status": "not_found",
                "message": "Xin lỗi, đơn hàng không tồn tại hoặc không thuộc tài khoản của bạn."
            }

        return {
            "status": "ok",
            "order_info": _clean_dict(dict(row)),
            "message": f"Đơn hàng {order_id} của bạn hiện đang ở trạng thái: {row['trang_thai_don_hang']}."
        }
    except Exception as e:
        logger.error("[AgentTools] track_order_status error: %s", e)
        return {"status": "error", "message": "Lỗi khi kiểm tra trạng thái đơn hàng."}

TOOL_GET_ORDER_HISTORY = {
    "type": "function",
    "function": {
        "name": "get_order_history",
        "description": (
            "LUÔN gọi tool này ĐẦU TIÊN khi khách hỏi về đơn hàng (ví dụ: 'đơn hàng mới tạo', 'kiểm tra đơn hàng', 'đơn hàng của tôi'). "
            "Sau khi có được mã đơn hàng (order_id) từ tool này, bạn hãy gọi tiếp get_order_details để xem chi tiết đơn đó. "
            "KHÔNG ĐƯỢC gọi get_cart hoặc ask_branch nếu khách nhắc đến 'đơn hàng'."
        ),
        "parameters": {
            "type": "object",
            "properties": {}
        },
    },
}

def execute_get_order_history(session_id: str) -> Dict[str, Any]:
    try:
        valid_uid = _require_valid_session(session_id)
        if not valid_uid:
            return {
                "status": "denied",
                "message": "Bạn cần đăng nhập để mình có thể xem lịch sử mua hàng nhé."
            }

        engine = _get_engine()
        import os
        order_schema = os.getenv("ORDER_SCHEMA", "orders")

        with engine.connect() as conn:
            rows = conn.execute(text(
                f"""
                SELECT ma_don_hang, tong_tien, trang_thai_don_hang, ngay_tao
                FROM {order_schema}.don_hang
                WHERE ma_nguoi_dung = :session_id
                ORDER BY ngay_tao DESC
                LIMIT 5
                """
            ), {"session_id": session_id}).mappings().all()

        if not rows:
            return {
                "status": "not_found",
                "message": "Bạn chưa có đơn hàng nào trong lịch sử."
            }

        history = [_clean_dict(dict(r)) for r in rows]
        for h in history:
            if h.get('ngay_tao'):
                h['ngay_tao'] = str(h['ngay_tao'])
                
        return {
            "status": "ok",
            "orders": history,
        }
    except Exception as e:
        logger.error("[AgentTools] get_order_history error: %s", e)
        return {"status": "error", "message": "Lỗi khi lấy lịch sử đơn hàng."}

TOOL_GET_ORDER_DETAILS = {
    "type": "function",
    "function": {
        "name": "get_order_details",
        "description": "Lấy thông tin chi tiết từng món đồ uống, topping và phương thức thanh toán của một đơn hàng cụ thể.",
        "parameters": {
            "type": "object",
            "properties": {
                "order_id": {
                    "type": "string",
                    "description": "Mã đơn hàng cần xem chi tiết."
                },
            },
            "required": ["order_id"],
        },
    },
}

def execute_get_order_details(session_id: str, order_id: str) -> Dict[str, Any]:
    try:
        valid_uid = _require_valid_session(session_id)
        if not valid_uid:
            return {"status": "unauthorized", "message": "Bạn cần đăng nhập để xem chi tiết đơn hàng."}

        engine = _get_engine()
        import os
        order_schema = os.getenv("ORDER_SCHEMA", "orders")

        with engine.connect() as conn:
            order_info = conn.execute(text(
                f"""
                SELECT ma_don_hang, tong_tien, phuong_thuc_thanh_toan, trang_thai_don_hang, co_so_ma
                FROM {order_schema}.don_hang
                WHERE ma_don_hang = :oid AND ma_nguoi_dung = :uid
                """
            ), {"oid": order_id, "uid": valid_uid}).fetchone()

            if not order_info:
                return {"status": "not_found", "message": "Xin lỗi, không tìm thấy đơn hàng này hoặc đơn hàng không thuộc về bạn."}

            items = conn.execute(text(
                f"""
                SELECT ma_san_pham, ten_san_pham, so_luong, gia_ban, kich_co, toppings, luong_da, do_ngot, ghi_chu
                FROM {order_schema}.chi_tiet_don_hang
                WHERE ma_don_hang = :oid
                """
            ), {"oid": order_id}).fetchall()
            
            items_list = []
            for item in items:
                items_list.append({
                    "product_id": item[0],
                    "product_name": item[1],
                    "quantity": item[2],
                    "unit_price": float(item[3]) if item[3] else 0.0,
                    "size": item[4],
                    "toppings": item[5] if item[5] else [],
                    "ice": item[6],
                    "sugar": item[7],
                    "note": item[8]
                })

        return {
            "status": "ok",
            "order_id": str(order_info[0]),
            "total_price": float(order_info[1]),
            "payment_method": order_info[2],
            "order_status": order_info[3],
            "branch_id": order_info[4],
            "items": items_list,
            "message": "Đây là chi tiết đơn hàng của bạn."
        }
    except Exception as e:
        logger.warning("[AgentTools] get_order_details error: %s", e)
        return {"status": "error", "message": "Lỗi hệ thống khi lấy chi tiết đơn hàng."}

TOOL_CANCEL_ORDER = {
    "type": "function",
    "function": {
        "name": "cancel_order",
        "description": "Yêu cầu hủy đơn hàng. Nếu khách CHƯA XÁC NHẬN ĐỒNG Ý hủy, truyền is_confirmed=False. Khi nhận được require_cancel_confirmation, bạn phải nhắc khách xác nhận (ví dụ: 'Gõ ĐỒNG Ý để xác nhận'). NẾU KHÁCH ĐÃ TRẢ LỜI ĐỒNG Ý hoặc XÁC NHẬN HỦY trong tin nhắn vừa gửi, bạn BẮT BUỘC phải truyền is_confirmed=True để thực sự hủy đơn.",
        "parameters": {
            "type": "object",
            "properties": {
                "order_id": {
                    "type": "string",
                    "description": "Mã đơn hàng cần hủy."
                },
                "is_confirmed": {
                    "type": "boolean",
                    "description": "Để False nếu khách CHƯA XÁC NHẬN hủy. Để True nếu khách ĐÃ ĐỒNG Ý HỦY trong tin nhắn vừa gửi."
                }
            },
            "required": ["order_id", "is_confirmed"],
        },
    },
}

def execute_cancel_order(session_id: str, order_id: str, is_confirmed: bool = False) -> Dict[str, Any]:
    try:
        valid_uid = _require_valid_session(session_id)
        if not valid_uid:
            return {"status": "unauthorized", "message": "Bạn cần đăng nhập để hủy đơn hàng."}

        engine = _get_engine()
        import os
        order_schema = os.getenv("ORDER_SCHEMA", "orders")

        with engine.connect() as conn:
            order_info = conn.execute(text(
                f"""
                SELECT trang_thai_don_hang
                FROM {order_schema}.don_hang
                WHERE ma_don_hang = :oid AND ma_nguoi_dung = :uid
                """
            ), {"oid": order_id, "uid": valid_uid}).fetchone()

        if not order_info:
            return {"status": "not_found", "message": "Xin lỗi, không tìm thấy đơn hàng này hoặc đơn hàng không thuộc về bạn."}
            
        status = order_info[0]
        if status not in ['MOI_TAO', 'PENDING', 'CHO_XAC_NHAN', 'pending']:
            return {"status": "rejected", "message": f"Không thể hủy đơn hàng vì trạng thái hiện tại là {status}. Đơn hàng có thể đã được chuẩn bị hoặc đang giao."}

        if not is_confirmed:
            return {
                "status": "require_cancel_confirmation",
                "message": f"Vui lòng hỏi khách hàng: 'Bạn có chắc chắn muốn hủy đơn hàng {order_id} không? Gõ ĐỒNG Ý để xác nhận hủy.'"
            }

        import requests
        order_service_url = os.getenv("ORDER_SERVICE_URL", "http://order-service:3005")
        token = _get_service_jwt(valid_uid)
        
        headers = {"Authorization": f"Bearer {token}"}
        url = f"{order_service_url}/customers/{valid_uid}/orders/{order_id}/cancel"
        
        try:
            response = requests.patch(url, headers=headers, json={"reason": "Khách hàng yêu cầu hủy qua AI"}, timeout=10)
        except requests.exceptions.ConnectionError:
            fallback_url = "http://host.docker.internal:3005"
            url = f"{fallback_url}/customers/{valid_uid}/orders/{order_id}/cancel"
            response = requests.patch(url, headers=headers, json={"reason": "Khách hàng yêu cầu hủy qua AI"}, timeout=10)
        
        if response.status_code in [200, 201]:
            return {"status": "success", "message": "Đã hủy đơn hàng thành công và hệ thống đang xử lý hoàn tiền (nếu có)."}
        else:
            logger.error("[AgentTools] cancel_order server error %s: %s", response.status_code, response.text)
            return {"status": "error", "message": f"Lỗi từ server khi hủy: {response.text}"}
            
    except Exception as e:
        logger.error("[AgentTools] cancel_order exception: %s", str(e))
        return {"status": "error", "message": f"Lỗi hệ thống khi hủy đơn hàng: {str(e)}"}

TOOL_UPDATE_ORDER = {
    "type": "function",
    "function": {
        "name": "update_order",
        "description": "Sửa/Đổi/Thêm món vào đơn hàng hiện tại (khi đang ở MOI_TAO). KHI GỌI TOOL NÀY VÀ NHẬN ĐƯỢC CHỮ 'require_update_confirmation', BẠN PHẢI DỪNG HOẠT ĐỘNG NGAY, trả lời bằng nguyên văn thông điệp đó và CHỜ KHÁCH HÀNG 'ĐỒNG Ý'. Bắt buộc tham số new_items phải chứa tất cả các món mà khách muốn giữ lại.",
        "parameters": {
            "type": "object",
            "properties": {
                "order_id": {
                    "type": "string",
                    "description": "Mã đơn hàng cần cập nhật (UUID)."
                },
                "new_items": {
                    "type": "array",
                    "description": "Danh sách TẤT CẢ các món sẽ có trong đơn sau khi cập nhật. Nếu khách muốn giữ lại món cũ, phải liệt kê món đó vào danh sách này.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "ma_san_pham": {"type": "number", "description": "Mã ID của sản phẩm (nếu biết)."},
                            "ten_san_pham": {"type": "string", "description": "Tên của sản phẩm (bắt buộc nếu không biết mã ID)."},
                            "so_luong": {"type": "number", "description": "Số lượng (bắt buộc)."},
                            "kich_co": {"type": "string", "description": "Kích cỡ (VD: Nhỏ, Vừa, Lớn), bỏ trống nếu không có."}
                        },
                        "required": ["so_luong"]
                    }
                },
                "is_confirmed": {
                    "type": "boolean",
                    "description": "Bắt buộc: Bằng True nếu người dùng đã gõ chữ ĐỒNG Ý sau khi bạn báo tổng tiền mới. Mặc định luôn là False cho đến khi có xác nhận."
                }
            },
            "required": ["order_id", "new_items", "is_confirmed"]
        }
    }
}

def execute_update_order(session_id: str, order_id: str, new_items: list, is_confirmed: bool = False) -> Dict[str, Any]:
    try:
        import os
        import requests
        import uuid

        try:
            uuid.UUID(order_id)
        except ValueError:
            return {"status": "error", "message": f"Mã đơn hàng '{order_id}' không hợp lệ. Vui lòng gọi get_order_history để lấy đúng mã UUID của đơn."}

        valid_uid = _require_valid_session(session_id)
        if not valid_uid:
            return {"status": "error", "message": "Bạn chưa đăng nhập. Vui lòng đăng nhập để thao tác đơn hàng."}
            
        engine = _get_engine()
        import os
        order_schema = os.getenv("ORDER_SCHEMA", "orders")

        with engine.connect() as conn:
            order_info = conn.execute(text(
                f"""
                SELECT trang_thai_don_hang
                FROM {order_schema}.don_hang
                WHERE ma_don_hang = :oid AND ma_nguoi_dung = :uid
                """
            ), {"oid": order_id, "uid": valid_uid}).fetchone()

        if not order_info:
            return {"status": "not_found", "message": "Không tìm thấy đơn hàng hoặc đơn hàng không thuộc về bạn."}
            
        if order_info[0] != "MOI_TAO":
            return {"status": "rejected", "message": f"Không thể sửa đơn hàng vì trạng thái hiện tại là {order_info[0]}."}

        menu_service_url = os.getenv("MENU_SERVICE_URL", "http://menu-service:3003")
        enriched_items = []
        new_total_price = 0
        
        menu_resp = requests.get(f"{menu_service_url}/menu/san-pham?limit=1000", timeout=5)
        if menu_resp.status_code == 200:
            resp_data = menu_resp.json()
            if isinstance(resp_data, list):
                menu_items = resp_data
            elif isinstance(resp_data, dict):
                menu_items = resp_data.get("items", [])
            else:
                menu_items = []
        else:
            menu_items = []
        menu_map = {int(item["ma_san_pham"]): item for item in menu_items if item.get("ma_san_pham")}
        
        if not new_items:
            return {"status": "error", "message": "Bạn truyền thiếu tham số new_items. Bạn HÃY truyền đầy đủ danh sách món khách muốn trong đơn hàng (bao gồm món cũ và món thay đổi)."}
            
        for item in new_items:
            ma_sp = item.get("ma_san_pham")
            ten_sp = str(item.get("ten_san_pham", "")).strip().lower()
            so_luong = int(item.get("so_luong", 0))
            if so_luong <= 0:
                continue
                
            prod = None
            if ma_sp:
                try:
                    ma_sp_int = int(float(ma_sp))
                    prod = menu_map.get(ma_sp_int)
                except (ValueError, TypeError):
                    pass
            if not prod and ten_sp:
                for p in menu_items:
                    if p.get("ten_san_pham", "").lower() == ten_sp:
                        prod = p
                        break
                if not prod:
                    for p in menu_items:
                        p_name = p.get("ten_san_pham", "").lower()
                        if ten_sp in p_name or p_name in ten_sp:
                            prod = p
                            break
                        
            if not prod:
                return {"status": "product_not_found", "message": f"Không tìm thấy thông tin sản phẩm '{ten_sp or ma_sp}'. BẠN HÃY TỰ GỌI tool check_price_and_stock để tìm tên đúng và ma_san_pham của món này, sau đó HÃY GỌI LẠI update_order."}
                
            gia_ban = float(prod.get("gia_ban") or 0)
            ma_sp_final = int(prod.get("ma_san_pham", 0))
            
            enriched_items.append({
                "ma_san_pham": ma_sp_final,
                "ten_san_pham": prod.get("ten_san_pham", f"Sản phẩm {ma_sp_final}"),
                "so_luong": so_luong,
                "gia_ban": gia_ban,
                "kich_co": item.get("kich_co")
            })
            new_total_price += gia_ban * so_luong

        if not is_confirmed:
            item_list_str = "\\n".join([f"- {it['so_luong']}x {it['ten_san_pham']} ({it.get('kich_co') or 'Mặc định'})" for it in enriched_items])
            return {
                "status": "require_update_confirmation",
                "message": f"Vui lòng báo với khách: Đơn hàng {order_id} sẽ thay đổi thành:\\n{item_list_str}\\nTổng tiền mới: {new_total_price} VND.\\nBạn có chắc chắn muốn thay đổi không? Gõ ĐỒNG Ý để xác nhận."
            }

        token = _get_service_jwt(valid_uid)
        
        headers = {"Authorization": f"Bearer {token}"}
        order_service_url = os.getenv("ORDER_SERVICE_URL", "http://order-service:3005")
        url = f"{order_service_url}/customers/{valid_uid}/orders/{order_id}"
        
        payload = {
            "items": enriched_items
        }
        try:
            patch_resp = requests.patch(url, headers=headers, json=payload, timeout=10)
        except requests.exceptions.ConnectionError:
            fallback_url = "http://host.docker.internal:3005"
            url = f"{fallback_url}/customers/{valid_uid}/orders/{order_id}"
            patch_resp = requests.patch(url, headers=headers, json=payload, timeout=10)
        
        if patch_resp.status_code in [200, 201]:
            return {"status": "success", "message": f"Đã cập nhật đơn hàng thành công. Tổng tiền mới là {new_total_price} VND."}
        else:
            return {"status": "error", "message": f"Lỗi từ server khi sửa đơn: {patch_resp.text}"}

    except Exception as e:
        logger.warning("[AgentTools] update_order error: %s", e)
        return {"status": "error", "message": "Lỗi hệ thống khi sửa đơn hàng."}
