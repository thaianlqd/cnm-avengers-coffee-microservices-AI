"""Canonical numbered checkout choices and their current owner."""
import re

from src.agents.tier1 import _remove_diacritics
from src.agents.selection_language import parse_selection_reference

FULFILLMENT_OPTIONS = ("GIAO_TAN_NOI", "MANG_DI", "TAI_CHO")
PAYMENT_OPTIONS = ("VNPAY", "NGAN_HANG_QR", "VI_DIEN_TU", "THANH_TOAN_KHI_NHAN_HANG")
FULFILLMENT_LABELS = ("Giao tận nơi", "Lấy tại quán", "Dùng tại chỗ")
PAYMENT_LABELS = ("VNPAY — ATM / Internet Banking", "Chuyển khoản QR ngân hàng", "Ví Avengers", "Tiền mặt (COD)")
# Inventory aliases ground semantic references; never scan a raw customer sentence.
PAYMENT_ALIASES = {
    'VNPAY': ('VNPAY',),
    'NGAN_HANG_QR': ('QR', 'QR ngân hàng', 'Ngân hàng QR', 'Chuyển khoản QR'),
    'VI_DIEN_TU': ('Ví', 'Ví Avengers', 'Ví điện tử', 'Avengers Wallet'),
    'THANH_TOAN_KHI_NHAN_HANG': ('COD', 'Tiền mặt', 'Cash', 'Thanh toán khi nhận hàng'),
}
CHECKOUT_CHOICE_TYPES = {"select_checkout_choices", "select_fulfillment", "select_payment"}
_DELIVERY_PHRASES = {"GIAO_TAN_NOI": "giao tận nơi", "MANG_DI": "lấy tại quán", "TAI_CHO": "dùng tại chỗ"}
_PAYMENT_PHRASES = {"VNPAY": "thanh toán VNPAY", "NGAN_HANG_QR": "thanh toán QR ngân hàng",
                    "VI_DIEN_TU": "thanh toán bằng ví Avengers", "THANH_TOAN_KHI_NHAN_HANG": "thanh toán COD"}


def checkout_continuation_message(prefs: dict) -> str:
    """Re-enter the legacy location handler with choices, never the user's ordinal."""
    parts = [_DELIVERY_PHRASES.get(prefs.get("delivery_type")), _PAYMENT_PHRASES.get(prefs.get("payment_method"))]
    return " và ".join(part for part in parts if part)


def numbered_checkout_labels(labels: tuple) -> str:
    return "\n".join(f"{index}. {label}" for index, label in enumerate(labels, 1))


def pending_checkout_choice(pending_type: str, message: str):
    """Return a checkout patch or an empty patch for an owned but invalid reply.

    None means this turn is not a checkout ordinal and may follow other routes.
    """
    if pending_type not in CHECKOUT_CHOICE_TYPES:
        return None
    text = _remove_diacritics(message).strip()
    if re.search(r"\b(them|mua)\s+(?:mon\s+)?[a-z]", text) and not re.search(r"\b(?:so|thu|#)\s*\d+\b", text):
        return None
    active_namespace = {
        "select_payment": "PAYMENT",
        "select_fulfillment": "FULFILLMENT",
    }.get(pending_type)
    reference = parse_selection_reference(message, active_namespace=active_namespace)
    if not reference.requested:
        return None
    ordinal = reference.ordinals[0]
    if pending_type == "select_payment":
        if reference.namespace not in {None, "PAYMENT"}:
            return None
        return {"payment_method": PAYMENT_OPTIONS[ordinal - 1]} if 1 <= ordinal <= len(PAYMENT_OPTIONS) else {}
    if pending_type == "select_fulfillment":
        if reference.namespace not in {None, "FULFILLMENT"}:
            return None
        return {"delivery_type": FULFILLMENT_OPTIONS[ordinal - 1]} if 1 <= ordinal <= len(FULFILLMENT_OPTIONS) else {}
    # Both numbered lists are visible. A bare ordinal needs its namespace.
    if reference.namespace == "PAYMENT" or re.search(r"\b(thanh toan|vnpay|qr|vi|cod|tien mat)\b", text):
        return {"payment_method": PAYMENT_OPTIONS[ordinal - 1]} if 1 <= ordinal <= len(PAYMENT_OPTIONS) else {}
    if reference.namespace == "FULFILLMENT" or re.search(r"\b(nhan hang|giao|lay|mang di|tai cho)\b", text):
        return {"delivery_type": FULFILLMENT_OPTIONS[ordinal - 1]} if 1 <= ordinal <= len(FULFILLMENT_OPTIONS) else {}
    return {}
