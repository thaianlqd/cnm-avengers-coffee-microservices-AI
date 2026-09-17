from typing import Any, Dict, Optional
from src.common import cart_manager

TOOL_ADD_TO_CART = {
    "type": "function",
    "function": {
        "name": "add_to_cart",
        "description": (
            "Thêm một sản phẩm vào giỏ hàng của phiên chat hiện tại. "
            "Chỉ gọi sau khi đã xác nhận product_id và final_price từ check_price_and_stock. "
            "KHÔNG tự bịa giá – lấy final_price từ kết quả check_price_and_stock trước đó."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "product_id": {"type": "string", "description": "Mã sản phẩm (từ check_price_and_stock)."},
                "product_name": {"type": "string", "description": "Tên sản phẩm (để hiển thị)."},
                "unit_price": {"type": "number", "description": "Giá đơn vị (từ final_price của check_price_and_stock)."},
                "quantity": {"type": "integer", "description": "Số lượng (mặc định 1)."},
                "size": {"type": "string", "description": "Kích cỡ (nếu có, dựa vào DB)."},
                "note": {"type": "string", "description": "Ghi chú bắt buộc về lượng đá, độ ngọt, topping, v.v... nếu khách yêu cầu (vd: 'Ít đá, không ngọt, thêm hạt sen')."},
            },
            "required": ["product_id", "product_name", "unit_price"],
        },
    },
}

def execute_add_to_cart(
    session_id: str,
    product_id: str,
    product_name: str,
    unit_price: float,
    quantity: int = 1,
    size: Optional[str] = None,
    note: Optional[str] = None,
) -> Dict[str, Any]:
    cart = cart_manager.add_item(
        session_id=session_id,
        product_id=product_id,
        product_name=product_name,
        unit_price=float(unit_price),
        quantity=max(1, int(quantity)),
        size=size,
        note=note,
    )
    
    # Sync with main order-service cart
    import os, requests, logging
    from src.function_calling.helpers import _get_service_jwt, _require_valid_session, _get_engine
    
    # Lấy hinh_anh_url từ db
    hinh_anh_url = ""
    try:
        engine = _get_engine()
        menu_schema = os.getenv("MENU_SCHEMA", "menu")
        with engine.connect() as conn:
            from sqlalchemy import text
            r = conn.execute(text(f"SELECT hinh_anh_url FROM {menu_schema}.san_pham WHERE ma_san_pham::text = :pid"), {"pid": product_id}).fetchone()
            if r and r[0]:
                hinh_anh_url = r[0]
    except Exception as e:
        logging.getLogger(__name__).error(f"[CartSync] Failed to fetch image URL: {e}")

    valid_uid = _require_valid_session(session_id)
    if valid_uid:
        try:
            token = _get_service_jwt(valid_uid)
            order_service_url = os.getenv("ORDER_SERVICE_URL", "http://order-service:3005")
            payload = {
                "ma_nguoi_dung": valid_uid,
                "ma_san_pham": int(product_id) if str(product_id).isdigit() else 0,
                "ten_san_pham": product_name,
                "gia_ban": float(unit_price),
                "hinh_anh_url": hinh_anh_url, 
                "size": size or "Nhỏ",
                "so_luong": max(1, int(quantity)),
                "note": note
            }
            try:
                res = requests.post(
                    f"{order_service_url}/cart", 
                    json=payload, 
                    headers={"Authorization": f"Bearer {token}"}, 
                    timeout=5
                )
                res.raise_for_status()
            except requests.exceptions.ConnectionError:
                # Fallback to host.docker.internal if order-service runs on host
                fallback_url = "http://host.docker.internal:3005"
                res = requests.post(
                    f"{fallback_url}/cart", 
                    json=payload, 
                    headers={"Authorization": f"Bearer {token}"}, 
                    timeout=5
                )
                res.raise_for_status()
        except Exception as e:
            logging.getLogger(__name__).error(f"[CartSync] Failed to sync add_to_cart to main service: {e}")

    return {
        "status": "ok",
        "message": f"Đã thêm {product_name} x{quantity} vào giỏ.",
        "cart": cart,
    }

TOOL_REMOVE_FROM_CART = {
    "type": "function",
    "function": {
        "name": "remove_from_cart",
        "description": "Xoá hoàn toàn một sản phẩm khỏi giỏ hàng. Dùng khi khách đổi ý hoặc muốn huỷ món.",
        "parameters": {
            "type": "object",
            "properties": {
                "product_id": {"type": "string", "description": "Mã sản phẩm cần xoá."},
                "size": {"type": "string", "description": "Kích cỡ cần xoá (nếu có)."}
            },
            "required": ["product_id"]
        },
    },
}

def execute_remove_from_cart(session_id: str, product_id: str, size: Optional[str] = None) -> Dict[str, Any]:
    cart = cart_manager.remove_item(session_id, product_id, size)
    
    # Sync with main order-service cart
    import os, requests, logging
    from src.function_calling.helpers import _get_service_jwt, _require_valid_session
    
    valid_uid = _require_valid_session(session_id)
    if valid_uid:
        try:
            token = _get_service_jwt(valid_uid)
            order_service_url = os.getenv("ORDER_SERVICE_URL", "http://order-service:3005")
            try:
                # order-service hiện tại xoá theo cartItemId (id bản ghi) chứ không phải product_id.
                # Tuy nhiên api xoá theo ma_nguoi_dung và ma_san_pham chưa có trong cart.controller, 
                # nên ta tạm bỏ qua sync xoá chi tiết, chỉ đồng bộ AI session.
                pass
            except Exception as e:
                pass
        except Exception as e:
            logging.getLogger(__name__).error(f"[CartSync] Failed to sync remove_from_cart: {e}")

    return {
        "status": "ok",
        "message": f"Đã xoá sản phẩm khỏi giỏ hàng.",
        "cart": cart,
    }

TOOL_GET_CART = {
    "type": "function",
    "function": {
        "name": "get_cart",
        "description": "Lấy danh sách và tổng tiền giỏ hàng hiện tại (chưa thanh toán/chưa đặt) của phiên chat. KHÔNG dùng để tra cứu đơn hàng đã đặt thành công.",
        "parameters": {
            "type": "object",
            "properties": {}
        },
    },
}

def execute_get_cart(session_id: str) -> Dict[str, Any]:
    return cart_manager.get_cart(session_id)

TOOL_REQUEST_CHECKOUT = {
    "type": "function",
    "function": {
        "name": "request_checkout",
        "description": (
            "Gọi tool này khi khách đồng ý đặt hàng/chốt đơn. "
            "TRƯỚC KHI GỌI, BẠN PHẢI HỎI RÕ KHÁCH 2 thông tin nếu chưa biết: "
            "1. Phương thức thanh toán (Tiền mặt, VNPay, Chuyển khoản, Ví điện tử). "
            "2. Hình thức nhận hàng (Giao tận nơi, Mang đi, Dùng tại quán). "
            "Nếu khách đã cung cấp, hãy truyền vào tham số tương ứng và gọi tool này."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "payment_method": {
                    "type": "string",
                    "enum": ["THANH_TOAN_KHI_NHAN_HANG", "VNPAY", "NGAN_HANG_QR", "VI_DIEN_TU"],
                    "description": "Phương thức thanh toán khách chọn. (Tiền mặt = THANH_TOAN_KHI_NHAN_HANG, Ví Avengers = VI_DIEN_TU).",
                },
                "delivery_type": {
                    "type": "string",
                    "enum": ["GIAO_TAN_NOI", "MANG_DI", "TAI_CHO"],
                    "description": "Giao hàng (GIAO_TAN_NOI), tự đến lấy (MANG_DI), hoặc Dùng tại quán (TAI_CHO).",
                },
            },
            "required": [],
        },
    },
}

def execute_request_checkout(
    session_id: str,
    payment_method: str = "THANH_TOAN_KHI_NHAN_HANG",
    delivery_type: str = "MANG_DI",
) -> Dict[str, Any]:
    cart = cart_manager.get_cart(session_id)
    if cart["is_empty"]:
        return {
            "status": "empty_cart",
            "message": "Giỏ hàng đang trống. Vui lòng thêm sản phẩm trước khi đặt hàng.",
        }
    if not cart["branch_id"]:
        return {
            "status": "need_branch",
            "message": "Chưa chọn chi nhánh. Vui lòng chọn chi nhánh trước khi đặt hàng.",
        }

    total = sum(float(i["unit_price"]) * int(i["quantity"]) for i in cart["items"])
    
    # Store checkout preferences for later confirmation
    cart_manager.set_checkout_prefs(session_id, payment_method, delivery_type)

    return {
        "status": "require_confirmation",
        "order_summary": {
            "branch_id": cart["branch_id"],
            "branch_name": cart["branch_name"],
            "items": cart["items"],
            "item_count": cart["item_count"],
            "total_price": total,
            "payment_method": payment_method,
            "delivery_type": delivery_type,
        },
        "message": (
            f"Tổng đơn hàng: {f'{total:,.0f}'.replace(',', '.')}đ tại {cart['branch_name']}. "
            f"Khách cần xác nhận trước khi tôi tiến hành đặt."
        ),
    }

TOOL_CONFIRM_CHECKOUT = {
    "type": "function",
    "function": {
        "name": "confirm_checkout",
        "description": (
            "GỌI DUY NHẤT KHI KHÁCH ĐÃ ĐỒNG Ý XÁC NHẬN CHỐT ĐƠN "
            "(sau khi bạn đã gọi request_checkout để tóm tắt đơn hàng). "
            "Tool này sẽ trực tiếp tạo đơn hàng thật trên hệ thống. "
            "Sau khi gọi tool này, hãy thông báo mã đơn hàng cho khách."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "payment_method": {
                    "type": "string",
                    "enum": ["THANH_TOAN_KHI_NHAN_HANG", "VNPAY", "NGAN_HANG_QR", "VI_DIEN_TU"],
                    "description": "Phương thức thanh toán khách chọn. (Tiền mặt = THANH_TOAN_KHI_NHAN_HANG, Ví Avengers = VI_DIEN_TU)."
                },
                "delivery_type": {
                    "type": "string",
                    "enum": ["GIAO_TAN_NOI", "MANG_DI", "TAI_CHO"],
                    "description": "Giao hàng (GIAO_TAN_NOI), tự đến lấy (MANG_DI), hoặc Dùng tại quán (TAI_CHO)."
                }
            },
            "required": []
        }
    }
}

def execute_confirm_checkout(
    session_id: str,
    payment_method: str = "THANH_TOAN_KHI_NHAN_HANG",
    delivery_type: str = "MANG_DI"
) -> Dict[str, Any]:
    from src.common.checkout_service import finalize_checkout
    
    # Lấy lại preferences đã lưu nếu có
    prefs = cart_manager.get_checkout_prefs(session_id)
    if prefs:
        payment_method = prefs.get("payment_method", payment_method)
        delivery_type = prefs.get("delivery_type", delivery_type)
        
    result = finalize_checkout(
        session_id=session_id,
        payment_method=payment_method,
        delivery_type=delivery_type
    )
    
    # Nếu tạo đơn thành công, xoá luôn main cart
    if result.get("status") == "success":
        import os, requests, logging
        from src.function_calling.helpers import _get_service_jwt, _require_valid_session
        valid_uid = _require_valid_session(session_id)
        if valid_uid:
            try:
                token = _get_service_jwt(valid_uid)
                order_service_url = os.getenv("ORDER_SERVICE_URL", "http://order-service:3005")
                try:
                    requests.delete(
                        f"{order_service_url}/cart/clear/{valid_uid}",
                        headers={"Authorization": f"Bearer {token}"},
                        timeout=5
                    )
                except requests.exceptions.ConnectionError:
                    fallback_url = "http://host.docker.internal:3005"
                    requests.delete(
                        f"{fallback_url}/cart/clear/{valid_uid}",
                        headers={"Authorization": f"Bearer {token}"},
                        timeout=5
                    )
            except Exception as e:
                logging.getLogger(__name__).error(f"[CartSync] Failed to clear main cart: {e}")
                
    return result
