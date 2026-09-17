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
import json
import logging
import threading
import time
from typing import Any, Dict, List, Optional
from sqlalchemy import text
from src.common.db import get_db_engine

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
_SESSION_LOCKS: Dict[str, threading.Lock] = {}
_global_lock = threading.Lock()
_db_initialized = False

# TTL 2 giờ – đủ cho một phiên chat dài, auto-expire tránh memory leak
_SESSION_TTL_SECONDS = 7200


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now() -> float:
    return time.time()


def _is_expired(session: Dict[str, Any]) -> bool:
    return (_now() - session.get("updated_at", 0)) > _SESSION_TTL_SECONDS


def _evict_expired() -> None:
    """Dọn dẹp các session hết hạn khỏi RAM để tránh memory leak."""
    with _global_lock:
        expired_keys = [k for k, v in _SESSION_CARTS.items() if _is_expired(v)]
        for k in expired_keys:
            del _SESSION_CARTS[k]
            if k in _SESSION_LOCKS:
                del _SESSION_LOCKS[k]
        if expired_keys:
            logger.debug("[CartManager] Evicted %d expired sessions from RAM", len(expired_keys))

def _get_session_lock(session_id: str) -> threading.Lock:
    """Sử dụng threading.Lock thay vì asyncio.Lock vì hàm được gọi trong môi trường synchronous của FastAPI."""
    with _global_lock:
        if session_id not in _SESSION_LOCKS:
            _SESSION_LOCKS[session_id] = threading.Lock()
        return _SESSION_LOCKS[session_id]

def _ensure_table_exists(engine) -> None:
    global _db_initialized
    if _db_initialized:
        return
    with _global_lock:
        if _db_initialized:
            return
        with engine.begin() as conn:
            conn.execute(text('''
                CREATE TABLE IF NOT EXISTS ai_chat_sessions (
                    session_id VARCHAR PRIMARY KEY,
                    user_id VARCHAR NULL,
                    branch_id VARCHAR NULL,
                    branch_name VARCHAR NULL,
                    cart_items JSONB DEFAULT '[]',
                    is_checking_out BOOLEAN DEFAULT FALSE,
                    last_order_id VARCHAR NULL,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            '''))
        _db_initialized = True

def _sync_to_db(session_id: str, session: Dict[str, Any]) -> None:
    """Write-through: Ghi đồng bộ state hiện tại xuống Supabase PostgreSQL."""
    try:
        engine = get_db_engine()
        _ensure_table_exists(engine)
        
        with engine.begin() as conn:
            # Upsert
            sql = text('''
                INSERT INTO ai_chat_sessions 
                    (session_id, branch_id, branch_name, cart_items, is_checking_out, last_order_id, updated_at)
                VALUES 
                    (:session_id, :branch_id, :branch_name, :cart_items, :is_checking_out, :last_order_id, NOW())
                ON CONFLICT (session_id) DO UPDATE SET
                    branch_id = EXCLUDED.branch_id,
                    branch_name = EXCLUDED.branch_name,
                    cart_items = EXCLUDED.cart_items,
                    is_checking_out = EXCLUDED.is_checking_out,
                    last_order_id = EXCLUDED.last_order_id,
                    updated_at = NOW()
            ''')
            conn.execute(sql, {
                "session_id": session_id,
                "branch_id": session.get("branch_id"),
                "branch_name": session.get("branch_name"),
                "cart_items": json.dumps(session.get("items", [])),
                "is_checking_out": session.get("is_checking_out", False),
                "last_order_id": session.get("last_order_id"),
            })
    except Exception as e:
        logger.error(f"[CartManager] Sync DB error for session {session_id}: {e}")

def _load_from_db(session_id: str) -> Optional[Dict[str, Any]]:
    """Đọc state từ Supabase PostgreSQL khi RAM cache miss."""
    try:
        engine = get_db_engine()
        _ensure_table_exists(engine)
        
        with engine.connect() as conn:
            sql = text('''SELECT branch_id, branch_name, cart_items, is_checking_out, last_order_id 
                          FROM ai_chat_sessions WHERE session_id = :session_id''')
            row = conn.execute(sql, {"session_id": session_id}).mappings().first()
            if row:
                return {
                    "branch_id": row.get("branch_id"),
                    "branch_name": row.get("branch_name"),
                    "items": row.get("cart_items") if isinstance(row.get("cart_items"), list) else json.loads(row.get("cart_items") or "[]"),
                    "is_checking_out": row.get("is_checking_out", False),
                    "last_order_id": row.get("last_order_id"),
                    "created_at": _now(),
                    "updated_at": _now(),
                }
    except Exception as e:
        logger.error(f"[CartManager] Load DB error for session {session_id}: {e}")
    return None

def _get_or_create_session(session_id: str) -> Dict[str, Any]:
    # LƯU Ý: Hàm này phải được gọi bên TRONG context manager của `_get_session_lock(session_id)`
    _evict_expired()
    
    if session_id not in _SESSION_CARTS:
        # Cache Miss -> Load từ DB
        db_state = _load_from_db(session_id)
        if db_state:
            _SESSION_CARTS[session_id] = db_state
            logger.info(f"[CartManager] Session {session_id} restored from DB.")
        else:
            _SESSION_CARTS[session_id] = {
                "branch_id": None,
                "branch_name": None,
                "items": [],
                "created_at": _now(),
                "updated_at": _now(),
                "is_checking_out": False,
                "last_order_id": None,
            }
    return _SESSION_CARTS[session_id]


def _touch(session_id: str, session: Dict[str, Any], sync_db: bool = False) -> None:
    session["updated_at"] = _now()
    if sync_db:
        _sync_to_db(session_id, session)


# ── Public API ────────────────────────────────────────────────────────────────

def get_cart(session_id: str) -> Dict[str, Any]:
    """Lấy toàn bộ thông tin giỏ hàng của session."""
    with _get_session_lock(session_id):
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
            "is_checking_out": session.get("is_checking_out", False),
            "last_order_id": session.get("last_order_id"),
        }


def set_branch(session_id: str, branch_id: str, branch_name: str) -> None:
    """Lưu chi nhánh mà khách đã chọn vào session."""
    with _get_session_lock(session_id):
        session = _get_or_create_session(session_id)
        session["branch_id"] = branch_id
        session["branch_name"] = branch_name
        _touch(session_id, session, sync_db=True)
        logger.info("[CartManager] Session %s set branch: %s (%s)", session_id, branch_name, branch_id)


def get_branch(session_id: str) -> Optional[str]:
    """Lấy branch_id đang được chọn trong session. Trả None nếu chưa chọn."""
    with _get_session_lock(session_id):
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
    with _get_session_lock(session_id):
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

        _touch(session_id, session, sync_db=True)
        logger.info(
            "[CartManager] Session %s added: %s x%d size=%s",
            session_id, product_name, quantity, size
        )
    return get_cart(session_id)


def remove_item(session_id: str, product_id: str, size: Optional[str] = None) -> Dict[str, Any]:
    """Xoá sản phẩm khỏi giỏ theo product_id (và size nếu có)."""
    with _get_session_lock(session_id):
        session = _get_or_create_session(session_id)
        before = len(session["items"])
        session["items"] = [
            i for i in session["items"]
            if not (i["product_id"] == product_id and i.get("size") == size)
        ]
        _touch(session_id, session, sync_db=True)
        removed = before - len(session["items"])
        logger.info("[CartManager] Session %s removed %d item(s) pid=%s", session_id, removed, product_id)
    return get_cart(session_id)


def clear_cart(session_id: str, order_id: Optional[str] = None) -> None:
    """Xoá toàn bộ giỏ hàng của session (sau khi checkout thành công)."""
    with _get_session_lock(session_id):
        session = _get_or_create_session(session_id)
        session["items"] = []
        session["branch_id"] = None
        session["branch_name"] = None
        session["is_checking_out"] = False
        if order_id:
            session["last_order_id"] = order_id
        _touch(session_id, session, sync_db=True)
        logger.info("[CartManager] Session %s cart cleared. Last order: %s", session_id, order_id)


def set_is_checking_out(session_id: str, is_checking_out: bool) -> None:
    with _get_session_lock(session_id):
        session = _get_or_create_session(session_id)
        session["is_checking_out"] = is_checking_out
        _touch(session_id, session, sync_db=True)

def cart_summary_text(session_id: str) -> str:
    """Tạo chuỗi text tóm tắt giỏ hàng – dùng để nhét vào Prompt cho LLM nhớ context."""
    cart = get_cart(session_id)
    if cart["is_empty"]:
        return "Giỏ hàng hiện đang trống."
    branch_info = f"Chi nhánh: {cart['branch_name'] or 'Chưa chọn'}\n"
    lines = []
    for i in cart["items"]:
        item_total = i["unit_price"] * i["quantity"]
        item_total_str = f"{item_total:,.0f}".replace(",", ".")
        line = f"- {i['product_name']} x{i['quantity']} (Size: {i['size'] or 'mặc định'}) = {item_total_str}đ"
        if i.get("note"):
            line += f" (Ghi chú: {i['note']})"
        lines.append(line)
    
    total_val = cart["total_price"]
    total_str = f"{total_val:,.0f}".replace(",", ".")
    total = f"Tổng: {total_str}đ"
    return branch_info + "\n".join(lines) + f"\n{total}"
