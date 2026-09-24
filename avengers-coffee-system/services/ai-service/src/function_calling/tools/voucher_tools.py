"""
voucher_tools.py
----------------
Tools cho AI agent để tra cứu mã giảm giá có thể áp dụng và lưu lựa chọn vào session.

Flow:
  1. get_applicable_vouchers  → liệt kê mã phù hợp với tổng giỏ hàng hiện tại
  2. apply_voucher             → validate mã + lưu ma_voucher & discount vào checkout_prefs
  3. checkout_service lấy ma_voucher từ prefs và truyền qua endpoint thanh toán chuẩn của order-service
"""
import logging
import os
import requests
from typing import Any, Dict

from src.common import cart_manager
from src.function_calling.helpers import _require_valid_session


def _customer_session_id(session_id: str) -> str:
    return str(session_id).split(":conversation:", 1)[0]


logger = logging.getLogger(__name__)

# ── Tool schemas ──────────────────────────────────────────────────────────────

TOOL_GET_APPLICABLE_VOUCHERS = {
    "type": "function",
    "function": {
        "name": "get_applicable_vouchers",
        "description": (
            "Lấy danh sách mã giảm giá / voucher có thể áp dụng cho đơn hàng hiện tại. "
            "Gọi tool này TRƯỚC khi tóm tắt đơn (request_checkout) để thông báo cho khách "
            "về các ưu đãi đang có. KHÔNG gọi nếu giỏ hàng đang trống."
        ),
        "parameters": {
            "type": "object",
            "properties": {},
        },
    },
}

TOOL_APPLY_VOUCHER = {
    "type": "function",
    "function": {
        "name": "apply_voucher",
        "description": (
            "Áp dụng mã giảm giá / voucher vào đơn hàng hiện tại. "
            "Gọi tool này khi khách cung cấp hoặc chọn một mã voucher cụ thể. "
            "Tool sẽ kiểm tra tính hợp lệ, tính tiền giảm và lưu vào session. "
            "Trả về số tiền được giảm để bot thông báo cho khách."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "voucher_code": {
                    "type": "string",
                    "description": "Mã voucher (ma_voucher) chứ KHÔNG PHẢI TÊN. VD: SUMMER20, UP_DM_PCPD.",
                },
            },
            "required": ["voucher_code"],
        },
    },
}

TOOL_REMOVE_VOUCHER = {
    "type": "function",
    "function": {
        "name": "remove_voucher",
        "description": (
            "Xóa mã giảm giá đang áp dụng khỏi đơn hàng khi khách muốn bỏ hoặc đổi mã."
        ),
        "parameters": {
            "type": "object",
            "properties": {},
        },
    },
}


# ── Executors ─────────────────────────────────────────────────────────────────

def execute_get_applicable_vouchers(session_id: str) -> Dict[str, Any]:
    """Lấy danh sách voucher áp dụng được theo tổng giỏ hàng."""
    # Cart state is conversation-scoped; only voucher eligibility is user-scoped.
    try:
        from src.function_calling.tools.cart_tools import sync_authoritative_cart
        cart = sync_authoritative_cart(session_id)
    except Exception:
        cart = cart_manager.get_cart(session_id)
    if cart.get("is_empty"):
        return {
            "status": "empty_cart",
            "message": "Giỏ hàng đang trống, không có mã giảm giá nào để áp dụng.",
        }

    total = float(cart.get("total_price") or 0)
    valid_uid = _require_valid_session(_customer_session_id(session_id))

    order_url = os.getenv("ORDER_SERVICE_URL", "http://order-service:3005")
    fallback_url = "http://host.docker.internal:3005"
    has_toppings = any(bool(item.get("toppings")) for item in cart.get("items") or [])

    try:
        url = f"{order_url}/vouchers/eligible"
        payload = {
            "tong_tien": total,
            "user_id": valid_uid or "",
            "has_toppings": has_toppings,
        }
        try:
            resp = requests.post(url, json=payload, timeout=7)
        except requests.exceptions.ConnectionError:
            resp = requests.post(f"{fallback_url}/vouchers/eligible", json=payload, timeout=7)

        if not resp.ok:
            logger.warning("[VoucherTools] get vouchers HTTP %s", resp.status_code)
            return {
                "status": "error",
                "message": "Không thể tải danh sách mã giảm giá lúc này.",
            }

        data = resp.json()
        applicable = data.get("items") or []

    except Exception as exc:
        logger.error("[VoucherTools] get_applicable_vouchers error: %s", exc)
        return {"status": "error", "message": "Lỗi kết nối khi lấy danh sách voucher."}

    applicable.sort(key=lambda x: x["so_tien_giam_du_kien"], reverse=True)

    if not applicable:
        return {
            "status": "no_applicable_voucher",
            "message": (
                f"Hiện không có mã giảm giá nào phù hợp với đơn {total:,.0f}đ. "
                "Bạn có thể nhập mã thủ công nếu có."
            ),
            "vouchers": [],
        }

    return {
        "status": "ok",
        "total_cart": total,
        "vouchers": applicable,
        "message": (
            f"Có {len(applicable)} mã giảm giá có thể áp dụng cho đơn {total:,.0f}đ. "
            "Hãy liệt kê Tên [Mã: ma_voucher] + giảm dự kiến cho khách chọn. Bắt buộc dùng `ma_voucher` khi gọi `apply_voucher`."
        ),
    }


def execute_apply_voucher(session_id: str, voucher_code: str) -> Dict[str, Any]:
    """Validate và lưu voucher code vào session."""
    if not voucher_code or not str(voucher_code).strip():
        return {"status": "error", "message": "Vui lòng nhập mã voucher."}

    code = str(voucher_code).strip().upper()
    prefs = cart_manager.get_checkout_prefs(session_id)
    if str(prefs.get("voucher_code") or "").strip().upper() == code:
        discount = float(prefs.get("discount_amount") or 0)
        total = float(cart_manager.get_cart(session_id).get("total_price") or 0)
        return {
            "status": "already_applied",
            "voucher_code": code,
            "so_tien_giam": discount,
            "final_total": max(0, total - discount),
            "message": f"Mã {code} đã được áp dụng rồi; tổng tiền không thay đổi.",
        }
    try:
        from src.function_calling.tools.cart_tools import sync_authoritative_cart
        cart = sync_authoritative_cart(session_id)
    except Exception:
        cart = cart_manager.get_cart(session_id)
    if cart.get("is_empty"):
        return {"status": "empty_cart", "message": "Giỏ hàng đang trống."}

    total = float(cart.get("total_price") or 0)
    valid_uid = _require_valid_session(_customer_session_id(session_id))

    order_url = os.getenv("ORDER_SERVICE_URL", "http://order-service:3005")
    fallback_url = "http://host.docker.internal:3005"

    payload = {
        "ma_voucher": code,
        "tong_tien": total,
        "user_id": valid_uid or "",
    }

    try:
        url = f"{order_url}/vouchers/kiem-tra"
        try:
            resp = requests.post(url, json=payload, timeout=5)
        except requests.exceptions.ConnectionError:
            resp = requests.post(f"{fallback_url}/vouchers/kiem-tra", json=payload, timeout=5)

        if not resp.ok:
            err_data = {}
            try:
                err_data = resp.json()
            except Exception:
                pass
            msg = err_data.get("message") or f"Mã '{code}' không hợp lệ hoặc không thể áp dụng."
            return {"status": "invalid_voucher", "message": msg}

        data = resp.json()
        so_tien_giam = float(data.get("so_tien_giam") or 0)
        final_total = max(0, total - so_tien_giam)

    except Exception as exc:
        logger.error("[VoucherTools] apply_voucher error: %s", exc)
        return {"status": "error", "message": "Lỗi kết nối khi kiểm tra mã giảm giá."}

    # Lưu vào session
    cart_manager.set_checkout_context(
        session_id,
        voucher_code=code,
        discount_amount=so_tien_giam,
    )

    discount_str = f"{so_tien_giam:,.0f}".replace(",", ".")
    final_str = f"{final_total:,.0f}".replace(",", ".")
    return {
        "status": "ok",
        "voucher_code": code,
        "so_tien_giam": so_tien_giam,
        "final_total": final_total,
        "message": (
            f"Đã áp dụng mã {code}! Giảm {discount_str}đ — "
            f"Tổng thanh toán còn lại: {final_str}đ."
        ),
    }


def execute_remove_voucher(session_id: str) -> Dict[str, Any]:
    """Xóa voucher đang áp dụng khỏi session."""
    prefs = cart_manager.get_checkout_prefs(session_id)
    if not prefs.get("voucher_code"):
        return {"status": "ok", "message": "Không có mã giảm giá nào đang được áp dụng."}

    cart_manager.set_checkout_context(
        session_id,
        voucher_code=None,
        discount_amount=None,
    )
    return {
        "status": "ok",
        "message": "Đã xóa mã giảm giá khỏi đơn hàng.",
    }
