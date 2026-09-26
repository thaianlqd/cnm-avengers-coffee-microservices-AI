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
    delivery_type: str = "DELIVERY",
    delivery_address: str = None,
) -> Dict[str, Any]:
    """
    Xử lý chung luồng chốt đơn (được gọi từ cả Chat Tool và UI Endpoint).
    Đảm bảo Idempotency: khóa giỏ hàng trong lúc xử lý, và xóa giỏ nếu tạo đơn thành công.
    """
    customer_session_id = str(session_id).split(":conversation:", 1)[0]
    cart_session_id = session_id
    valid_uid = _require_valid_session(customer_session_id)
    if not valid_uid:
        return {"status": "error", "message": "Bạn chưa đăng nhập. Vui lòng đăng nhập để đặt hàng."}

    supported_payments = {"THANH_TOAN_KHI_NHAN_HANG", "VNPAY", "NGAN_HANG_QR", "VI_DIEN_TU"}
    if payment_method not in supported_payments:
        return {"status": "unsupported_payment", "message": "Phương thức thanh toán không hợp lệ."}
    if delivery_type not in {"GIAO_TAN_NOI", "MANG_DI", "TAI_CHO"}:
        return {"status": "invalid_delivery_type", "message": "Hình thức nhận hàng không hợp lệ. Vui lòng xác nhận lại."}

    cart = cart_manager.get_cart(cart_session_id)
    
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
        cart_manager.set_is_checking_out(cart_session_id, True)

        order_service_url = os.getenv("ORDER_SERVICE_URL", "http://order-service:3005")
        token = _get_service_jwt(valid_uid)
        headers = {"Authorization": f"Bearer {token}"}
        
        if delivery_type in ["MANG_DI", "TAI_CHO"]:
            dia_chi = "Nhận tại: " + cart.get("branch_name", "Cửa hàng")
        else:
            dia_chi = str(delivery_address or "").strip()
            if not dia_chi:
                cart_manager.set_is_checking_out(cart_session_id, False)
                return {"status": "missing_delivery_address", "message": "Thiếu địa chỉ giao hàng đã được khách xác nhận."}

        canonical_delivery_type = {
            "GIAO_TAN_NOI": "GIAO_TAN_NOI",
            "MANG_DI": "LAY_TAI_QUAN",
            "TAI_CHO": "DUNG_TAI_CHO",
        }[delivery_type]

        prefs = cart_manager.get_checkout_prefs(cart_session_id)
        voucher_code = str(prefs.get("voucher_code") or "").strip().upper() or None
        discount_amount = float(prefs.get("discount_amount") or 0)

        payload = {
            "phuong_thuc_thanh_toan": payment_method,
            "delivery_mode": canonical_delivery_type,
            "ghi_chu": "AI Chat Order",
            "branch_code": cart.get("branch_id"),
            "dia_chi_giao_hang": dia_chi,
            "session_id": customer_session_id,
        }
        if voucher_code:
            payload["ma_voucher"] = voucher_code

        quote_id = str(prefs.get("checkout_quote_id") or "").strip()
        action_id = str(prefs.get("checkout_action_id") or "").strip()
        expected_cart_version = cart.get("cart_version")
        if not quote_id or not action_id or expected_cart_version is None:
            cart_manager.set_is_checking_out(cart_session_id, False)
            return {
                "status": "stale_checkout",
                "message": "Thiếu báo giá xác thực. Vui lòng tạo lại tóm tắt trước khi đặt đơn.",
            }
        strict_payload = {
            **payload,
            "quote_id": quote_id,
            "action_id": action_id,
            "expected_cart_version": expected_cart_version,
        }

        # Use the same checkout application service as the customer web. It
        # reads the authoritative cart, revalidates voucher and calculates the
        # order total instead of trusting prices supplied by the AI.
        logger.info("[CheckoutService] Sending order for session %s to %s", session_id, order_service_url)
        resp = requests.post(
            f"{order_service_url}/customers/{valid_uid}/thanh-toan/checkout-confirm",
            headers={**headers, "X-Idempotency-Key": f"ai-checkout:{action_id}"},
            json=strict_payload,
            timeout=15,
        )
        
        if resp.status_code in [200, 201]:
            resp_data = resp.json()
            order_id = (
                resp_data.get("order_id")
                or resp_data.get("don_hang", {}).get("ma_don_hang")
                or resp_data.get("ma_don_hang")
            )
            if not order_id:
                # A 2xx response without a confirmed order identifier is ambiguous.
                # Keep the cart so the customer can inspect/reconcile it safely.
                cart_manager.set_is_checking_out(cart_session_id, False)
                logger.error("[CheckoutService] Unexpected order response: %s", resp_data)
                return {
                    "status": "order_status_unknown",
                    "message": "Hệ thống chưa xác nhận được mã đơn hàng. Giỏ hàng vẫn được giữ lại; vui lòng kiểm tra lịch sử đơn trước khi thử lại.",
                }
            
            # Thành công -> Xóa giỏ hàng và gán last_order_id
            # The Order Service cleared the authoritative cart in the same
            # transaction as the order write; only replace the local mirror.
            cart_manager.clear_cart(cart_session_id, order_id=str(order_id))
            
            return {
                "status": "success",
                "message": f"Đặt hàng thành công! Đơn hàng của bạn đang được chuẩn bị. (Mã đơn: {order_id})",
                "order_id": str(order_id),
                "total_price": float(
                    resp_data.get("final_total")
                    or resp_data.get("don_hang", {}).get("tong_tien")
                    or resp_data.get("tong_tien")
                    or cart.get("total_price", 0)
                ),
                "discount_amount": float(resp_data.get("don_hang", {}).get("so_tien_giam") or 0),
                "payment_method": payment_method,
                "redirect_url": resp_data.get("redirect_url"),
                "payment_details": resp_data.get("payment_details"),
            }
        else:
            # Thất bại từ server -> Mở khóa giỏ hàng
            cart_manager.set_is_checking_out(cart_session_id, False)
            logger.error("[CheckoutService] Order API failed: %s", resp.text)
            return {"status": "error", "message": f"Lỗi tạo đơn hàng: {resp.text}"}

    except Exception as e:
        cart_manager.set_is_checking_out(cart_session_id, False)
        logger.exception("[CheckoutService] Exception in finalize_checkout: %s", e)
        return {"status": "error", "message": "Có lỗi hệ thống xảy ra khi xử lý đơn hàng."}
