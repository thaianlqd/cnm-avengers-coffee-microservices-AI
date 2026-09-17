import os
import requests
import logging
from typing import Dict, Any
from src.common import cart_manager
from src.function_calling.helpers import _require_valid_session, _get_service_jwt, _get_engine
from sqlalchemy import text

logger = logging.getLogger(__name__)

def finalize_checkout(
    session_id: str, 
    payment_method: str = "THANH_TOAN_KHI_NHAN_HANG", 
    delivery_type: str = "DELIVERY"
) -> Dict[str, Any]:
    """
    Xử lý chung luồng chốt đơn (được gọi từ cả Chat Tool và UI Endpoint).
    Đảm bảo Idempotency: khóa giỏ hàng trong lúc xử lý, và xóa giỏ nếu tạo đơn thành công.
    """
    valid_uid = _require_valid_session(session_id)
    if not valid_uid:
        return {"status": "error", "message": "Bạn chưa đăng nhập. Vui lòng đăng nhập để đặt hàng."}

    cart = cart_manager.get_cart(session_id)
    
    # 1. Kiểm tra giỏ hàng rỗng
    if cart.get("is_empty"):
        last_order = cart.get("last_order_id")
        if last_order:
            return {
                "status": "already_processed", 
                "message": f"Đơn hàng của bạn đã được đặt thành công trước đó (Mã đơn: {last_order}). Cảm ơn bạn!",
                "order_id": last_order
            }
        return {"status": "empty_cart", "message": "Giỏ hàng hiện đang trống, vui lòng chọn món trước khi đặt."}

    # 2. Idempotency Lock
    if cart.get("is_checking_out"):
        return {"status": "processing", "message": "Đơn hàng của bạn đang được xử lý, vui lòng đợi trong giây lát..."}

    try:
        cart_manager.set_is_checking_out(session_id, True)

        # Chuyển đổi định dạng item để gửi qua Order Service
        items = []
        for i in cart["items"]:
            note_str = ", ".join(filter(None, [f"Size {i['size']}" if i.get("size") else "", i.get("note")]))
            items.append({
                "ma_san_pham": int(i["product_id"]) if str(i["product_id"]).isdigit() else 0,
                "ten_san_pham": i["product_name"],
                "so_luong": i["quantity"],
                "gia_ban": i["unit_price"],
                "ghi_chu": note_str
            })

        order_service_url = os.getenv("ORDER_SERVICE_URL", "http://order-service:3005")
        token = _get_service_jwt(valid_uid)
        headers = {"Authorization": f"Bearer {token}"}
        
        if delivery_type in ["MANG_DI", "TAI_CHO"]:
            dia_chi = "Nhận tại: " + cart.get("branch_name", "Cửa hàng")
        else:
            dia_chi = "Giao đến địa chỉ mặc định của khách"
            try:
                engine = _get_engine()
                identity_schema = os.getenv("IDENTITY_SCHEMA", "identity")
                with engine.connect() as conn:
                    addr = conn.execute(text(
                        f"SELECT dia_chi_day_du FROM {identity_schema}.dia_chi_giao_hang WHERE ma_nguoi_dung = :uid ORDER BY mac_dinh DESC LIMIT 1"
                    ), {"uid": valid_uid}).fetchone()
                    if addr and addr[0]:
                        dia_chi = addr[0]
            except Exception as e:
                logger.warning("[CheckoutService] Error getting user address: %s", e)

        payload = {
            "ma_nguoi_dung": valid_uid,
            "phuong_thuc_thanh_toan": payment_method,
            "loai_don_hang": delivery_type,
            "chi_tiet_don_hang": items,
            "ghi_chu": "AI Chat Order",
            "co_so_ma": cart.get("branch_id"),
            "dia_chi_giao_hang": dia_chi,
        }

        # Gọi qua Order Service
        logger.info("[CheckoutService] Sending order for session %s to %s", session_id, order_service_url)
        resp = requests.post(f"{order_service_url}/orders", headers=headers, json=payload, timeout=10)
        
        if resp.status_code in [200, 201]:
            resp_data = resp.json()
            order_id = resp_data.get("don_hang", {}).get("ma_don_hang") or resp_data.get("ma_don_hang", "UNKNOWN")
            
            # Thành công -> Xóa giỏ hàng và gán last_order_id
            cart_manager.clear_cart(session_id, order_id=str(order_id))
            
            return {
                "status": "success",
                "message": f"Đặt hàng thành công! Đơn hàng của bạn đang được chuẩn bị. (Mã đơn: {order_id})",
                "order_id": str(order_id)
            }
        else:
            # Thất bại từ server -> Mở khóa giỏ hàng
            cart_manager.set_is_checking_out(session_id, False)
            logger.error("[CheckoutService] Order API failed: %s", resp.text)
            return {"status": "error", "message": f"Lỗi tạo đơn hàng: {resp.text}"}

    except Exception as e:
        cart_manager.set_is_checking_out(session_id, False)
        logger.exception("[CheckoutService] Exception in finalize_checkout: %s", e)
        return {"status": "error", "message": "Có lỗi hệ thống xảy ra khi xử lý đơn hàng."}
