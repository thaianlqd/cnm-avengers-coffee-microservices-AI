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
    return {
        "status": "ok",
        "message": f"Đã thêm {product_name} x{quantity} vào giỏ.",
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
            "Gọi tool này NGAY LẬP TỨC khi khách đồng ý đặt hàng/chốt đơn. "
            "Tool sẽ trả về tín hiệu để UI tự động hiện ra các nút chọn phương thức thanh toán và giao hàng. "
            "TUYỆT ĐỐI KHÔNG HỎI LẠI khách về phương thức thanh toán hay giao hàng, cứ để tham số mặc định và gọi tool này ngay."
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
    return finalize_checkout(
        session_id=session_id,
        payment_method=payment_method,
        delivery_type=delivery_type
    )
