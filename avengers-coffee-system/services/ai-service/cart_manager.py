"""
cart_manager.py
---------------
In-Memory Session Cart Manager cho Avengers Coffee AI Agent.

Lưu ý quan trọng về Scale:
  Hiện tại dùng Python dict toàn cục (in-process memory).
  Khi deploy FastAPI với nhiều Uvicorn workers (--workers N > 1),
  mỗi worker sẽ có dict riêng biệt → session có thể rơi vào worker khác
  và bị mất giỏ hàng. Chấp nhận trade-off này cho MVP (1 worker).
  TODO: Đổi sang Redis trước khi scale lên production multi-worker.
"""
import logging
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── Storage (In-Memory, single-process safe) ──────────────────────────────────
# Structure:
# _SESSION_CARTS = {
#   "session_id": {
#     "branch_id": Optional[str],      # Chi nhánh đã chọn (required trước khi checkout)
#     "branch_name": Optional[str],    # Tên chi nhánh (để hiển thị)
#     "items": [                        # Danh sách sản phẩm
#       {
#         "product_id": str,
#         "product_name": str,
#         "quantity": int,
#         "unit_price": float,
#         "size": Optional[str],        # S / M / L
#         "note": Optional[str],
#       }
#     ],
#     "created_at": float,             # Unix timestamp
#     "updated_at": float,
#   }
# }
_SESSION_CARTS: Dict[str, Dict[str, Any]] = {}

# TTL 2 giờ – đủ cho một phiên chat dài, auto-expire tránh memory leak
_SESSION_TTL_SECONDS = 7200


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now() -> float:
    return time.time()


def _is_expired(session: Dict[str, Any]) -> bool:
    return (_now() - session.get("updated_at", 0)) > _SESSION_TTL_SECONDS


def _evict_expired() -> None:
    """Dọn dẹp các session hết hạn để tránh memory leak."""
    expired_keys = [k for k, v in _SESSION_CARTS.items() if _is_expired(v)]
    for k in expired_keys:
        del _SESSION_CARTS[k]
    if expired_keys:
        logger.debug("[CartManager] Evicted %d expired sessions", len(expired_keys))


def _get_or_create_session(session_id: str) -> Dict[str, Any]:
    _evict_expired()
    if session_id not in _SESSION_CARTS:
        _SESSION_CARTS[session_id] = {
            "branch_id": None,
            "branch_name": None,
            "items": [],
            "created_at": _now(),
            "updated_at": _now(),
        }
    return _SESSION_CARTS[session_id]


def _touch(session: Dict[str, Any]) -> None:
    session["updated_at"] = _now()


# ── Public API ────────────────────────────────────────────────────────────────

def get_cart(session_id: str) -> Dict[str, Any]:
    """Lấy toàn bộ thông tin giỏ hàng của session."""
    session = _get_or_create_session(session_id)
    items = session["items"]
    total = sum(i["unit_price"] * i["quantity"] for i in items)
    return {
        "session_id": session_id,
        "branch_id": session["branch_id"],
        "branch_name": session["branch_name"],
        "items": items,
        "item_count": sum(i["quantity"] for i in items),
        "total_price": total,
        "is_empty": len(items) == 0,
    }


def set_branch(session_id: str, branch_id: str, branch_name: str) -> None:
    """Lưu chi nhánh mà khách đã chọn vào session."""
    session = _get_or_create_session(session_id)
    session["branch_id"] = branch_id
    session["branch_name"] = branch_name
    _touch(session)
    logger.info("[CartManager] Session %s set branch: %s (%s)", session_id, branch_name, branch_id)


def get_branch(session_id: str) -> Optional[str]:
    """Lấy branch_id đang được chọn trong session. Trả None nếu chưa chọn."""
    session = _get_or_create_session(session_id)
    return session.get("branch_id")


def add_item(
    session_id: str,
    product_id: str,
    product_name: str,
    unit_price: float,
    quantity: int = 1,
    size: Optional[str] = None,
    note: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Thêm sản phẩm vào giỏ. Nếu đã tồn tại (cùng product_id + size),
    tăng số lượng thay vì thêm dòng mới.
    Trả về cart state mới nhất.
    """
    session = _get_or_create_session(session_id)
    items: List[Dict[str, Any]] = session["items"]

    # Tìm item trùng (cùng sản phẩm và cùng size)
    existing = next(
        (i for i in items if i["product_id"] == product_id and i.get("size") == size),
        None,
    )
    if existing:
        existing["quantity"] += max(1, int(quantity))
        if note:
            existing["note"] = note
    else:
        items.append({
            "product_id": product_id,
            "product_name": product_name,
            "quantity": max(1, int(quantity)),
            "unit_price": float(unit_price),
            "size": size,
            "note": note,
        })

    _touch(session)
    logger.info(
        "[CartManager] Session %s added: %s x%d size=%s",
        session_id, product_name, quantity, size
    )
    return get_cart(session_id)


def remove_item(session_id: str, product_id: str, size: Optional[str] = None) -> Dict[str, Any]:
    """Xoá sản phẩm khỏi giỏ theo product_id (và size nếu có)."""
    session = _get_or_create_session(session_id)
    before = len(session["items"])
    session["items"] = [
        i for i in session["items"]
        if not (i["product_id"] == product_id and i.get("size") == size)
    ]
    _touch(session)
    removed = before - len(session["items"])
    logger.info("[CartManager] Session %s removed %d item(s) pid=%s", session_id, removed, product_id)
    return get_cart(session_id)


def clear_cart(session_id: str) -> None:
    """Xoá toàn bộ giỏ hàng của session (sau khi checkout thành công)."""
    if session_id in _SESSION_CARTS:
        _SESSION_CARTS[session_id]["items"] = []
        _SESSION_CARTS[session_id]["branch_id"] = None
        _SESSION_CARTS[session_id]["branch_name"] = None
        _touch(_SESSION_CARTS[session_id])
    logger.info("[CartManager] Session %s cart cleared", session_id)


def cart_summary_text(session_id: str) -> str:
    """Tạo chuỗi text tóm tắt giỏ hàng – dùng để nhét vào Prompt cho LLM nhớ context."""
    cart = get_cart(session_id)
    if cart["is_empty"]:
        return "Giỏ hàng hiện đang trống."
    branch_info = f"Chi nhánh: {cart['branch_name'] or 'Chưa chọn'}\n"
    lines = [
        f"- {i['product_name']} x{i['quantity']} (Size: {i['size'] or 'mặc định'}) = {i['unit_price'] * i['quantity']:,.0f}đ"
        for i in cart["items"]
    ]
    total = f"Tổng: {cart['total_price']:,.0f}đ"
    return branch_info + "\n".join(lines) + f"\n{total}"
