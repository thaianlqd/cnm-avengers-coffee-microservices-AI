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
import hashlib
import logging
import threading
import time
import uuid
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


def _parse_json_object(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except (TypeError, ValueError):
            return {}
    return {}


def _order_item_payload(item: Dict[str, Any]) -> Dict[str, Any]:
    """Return only fields that can change the order represented by a cart line."""
    return {
        "product_id": str(item.get("product_id") or item.get("ma_san_pham") or ""),
        "product_name": str(item.get("product_name") or item.get("ten_san_pham") or ""),
        "quantity": max(1, int(item.get("quantity") or item.get("so_luong") or 1)),
        "unit_price": float(item.get("unit_price") or item.get("gia_ban") or 0),
        "size": item.get("size") or item.get("kich_co"),
        "toppings": sorted(str(value) for value in (item.get("toppings") or [])),
        "luong_da": item.get("luong_da") or None,
        "do_ngot": item.get("do_ngot") or None,
        "loai_sua": item.get("loai_sua") or None,
        "note": item.get("note") or item.get("ghi_chu") or None,
    }


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
                    checkout_prefs JSONB DEFAULT '{}'::jsonb,
                    last_order_id VARCHAR NULL,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            '''))
            conn.execute(text('''
                ALTER TABLE ai_chat_sessions
                ADD COLUMN IF NOT EXISTS checkout_prefs JSONB DEFAULT '{}'::jsonb
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
                    (session_id, branch_id, branch_name, cart_items, is_checking_out, checkout_prefs, last_order_id, updated_at)
                VALUES 
                    (:session_id, :branch_id, :branch_name, :cart_items, :is_checking_out, :checkout_prefs, :last_order_id, NOW())
                ON CONFLICT (session_id) DO UPDATE SET
                    branch_id = EXCLUDED.branch_id,
                    branch_name = EXCLUDED.branch_name,
                    cart_items = EXCLUDED.cart_items,
                    is_checking_out = EXCLUDED.is_checking_out,
                    checkout_prefs = EXCLUDED.checkout_prefs,
                    last_order_id = EXCLUDED.last_order_id,
                    updated_at = NOW()
            ''')
            conn.execute(sql, {
                "session_id": session_id,
                "branch_id": session.get("branch_id"),
                "branch_name": session.get("branch_name"),
                "cart_items": json.dumps(session.get("items", [])),
                "is_checking_out": session.get("is_checking_out", False),
                "checkout_prefs": json.dumps(session.get("checkout_prefs", {})),
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
            sql = text('''SELECT branch_id, branch_name, cart_items, is_checking_out, checkout_prefs, last_order_id
                          FROM ai_chat_sessions WHERE session_id = :session_id''')
            row = conn.execute(sql, {"session_id": session_id}).mappings().first()
            if row:
                return {
                    "branch_id": row.get("branch_id"),
                    "branch_name": row.get("branch_name"),
                    "items": row.get("cart_items") if isinstance(row.get("cart_items"), list) else json.loads(row.get("cart_items") or "[]"),
                    "is_checking_out": row.get("is_checking_out", False),
                    "checkout_prefs": _parse_json_object(row.get("checkout_prefs")),
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
                "checkout_prefs": {},
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
            "checkout_prefs": dict(session.get("checkout_prefs") or {}),
            "last_order_id": session.get("last_order_id"),
        }


def replace_items_from_order_cart(session_id: str, server_items: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Mirror the authoritative order-service cart into conversational state.

    The AI copy is read-only presentation/checkpoint data. It must never be
    merged additively because the order-service cart may already contain lines
    created by the web UI or an earlier chat turn.
    """
    normalized: List[Dict[str, Any]] = []
    for item in server_items or []:
        normalized.append({
            "line_id": item.get("id") or item.get("line_id"),
            "cart_item_id": item.get("id") or item.get("line_id"),
            "product_id": str(item.get("ma_san_pham") or item.get("product_id") or ""),
            "product_name": item.get("ten_san_pham") or item.get("product_name") or "Sản phẩm",
            "quantity": max(1, int(item.get("so_luong") or item.get("quantity") or 1)),
            "unit_price": float(item.get("gia_ban") or item.get("unit_price") or 0),
            "size": item.get("size") or item.get("kich_co"),
            "toppings": list(item.get("toppings") or []),
            "luong_da": item.get("luong_da"),
            "do_ngot": item.get("do_ngot"),
            "loai_sua": item.get("loai_sua"),
            "note": item.get("ghi_chu") or item.get("note"),
        })
    with _get_session_lock(session_id):
        session = _get_or_create_session(session_id)
        previous_fingerprint = json.dumps(
            [_order_item_payload(item) for item in (session.get("items") or [])],
            sort_keys=True,
            ensure_ascii=False,
        )
        next_fingerprint = json.dumps(
            [_order_item_payload(item) for item in normalized],
            sort_keys=True,
            ensure_ascii=False,
        )
        session["items"] = normalized
        if previous_fingerprint != next_fingerprint:
            prefs = dict(session.get("checkout_prefs") or {})
            # A server cart change invalidates every decision derived from the
            # old lines.  Do not leave a stale voucher/branch/confirmation
            # draft that could be submitted against a different cart.
            for key in (
                "summary_fingerprint", "checkout_action_id", "pending_action",
                "branch_candidates", "stock_conflicts", "voucher_decided",
                "voucher_offer_pending", "voucher_candidates", "voucher_code",
                "discount_amount", "flow_stage",
            ):
                prefs.pop(key, None)
            session["checkout_prefs"] = prefs
        _touch(session_id, session, sync_db=True)
    return get_cart(session_id)


def set_branch(session_id: str, branch_id: str, branch_name: str) -> None:
    """Lưu chi nhánh mà khách đã chọn vào session."""
    with _get_session_lock(session_id):
        session = _get_or_create_session(session_id)
        session["branch_id"] = branch_id
        session["branch_name"] = branch_name
        prefs = dict(session.get("checkout_prefs") or {})
        prefs.pop("summary_fingerprint", None)
        prefs.pop("branch_candidates", None)
        session["checkout_prefs"] = prefs
        _touch(session_id, session, sync_db=True)
        logger.info("[CartManager] Session %s set branch: %s (%s)", session_id, branch_name, branch_id)


def get_branch(session_id: str) -> Optional[str]:
    """Lấy branch_id đang được chọn trong session. Trả None nếu chưa chọn."""
    with _get_session_lock(session_id):
        session = _get_or_create_session(session_id)
        return session.get("branch_id")


def clear_branch(session_id: str) -> None:
    """Forget an outlet whenever the customer changes fulfillment mode."""
    with _get_session_lock(session_id):
        session = _get_or_create_session(session_id)
        session["branch_id"] = None
        session["branch_name"] = None
        prefs = dict(session.get("checkout_prefs") or {})
        prefs.pop("branch_candidates", None)
        prefs.pop("stock_conflicts", None)
        prefs.pop("summary_fingerprint", None)
        session["checkout_prefs"] = prefs
        _touch(session_id, session, sync_db=True)


def add_item(
    session_id: str,
    product_id: str,
    product_name: str,
    unit_price: float,
    quantity: int = 1,
    size: Optional[str] = None,
    toppings: Optional[List[str]] = None,
    luong_da: Optional[str] = None,
    do_ngot: Optional[str] = None,
    loai_sua: Optional[str] = None,
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
            (
                i for i in items
                if i["product_id"] == product_id
                and i.get("size") == size
                and i.get("note") == note
                and sorted(i.get("toppings") or []) == sorted(toppings or [])
                and i.get("luong_da") == luong_da
                and i.get("do_ngot") == do_ngot
                and i.get("loai_sua") == loai_sua
            ),
            None,
        )
        if existing:
            existing["quantity"] += max(1, int(quantity))
            existing["unit_price"] = float(unit_price)
        else:
            items.append({
                "product_id": product_id,
                "product_name": product_name,
                "quantity": max(1, int(quantity)),
                "unit_price": float(unit_price),
                "size": size,
                "toppings": list(toppings or []),
                "luong_da": luong_da,
                "do_ngot": do_ngot,
                "loai_sua": loai_sua,
                "note": note,
            })

        # Keep explicit payment/fulfillment choices, but invalidate an old summary.
        prefs = dict(session.get("checkout_prefs") or {})
        prefs.pop("summary_fingerprint", None)
        session["checkout_prefs"] = prefs

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
        if before != len(session["items"]):
            prefs = dict(session.get("checkout_prefs") or {})
            prefs.pop("summary_fingerprint", None)
            session["checkout_prefs"] = prefs
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
        previous_prefs = dict(session.get("checkout_prefs") or {})
        session["checkout_prefs"] = {}
        if order_id:
            session["last_order_id"] = order_id
            session["checkout_prefs"] = {
                "completed_action_id": previous_prefs.get("checkout_action_id"),
                "completed_order_id": str(order_id),
            }
        _touch(session_id, session, sync_db=True)
        logger.info("[CartManager] Session %s cart cleared. Last order: %s", session_id, order_id)


def set_is_checking_out(session_id: str, is_checking_out: bool) -> None:
    with _get_session_lock(session_id):
        session = _get_or_create_session(session_id)
        session["is_checking_out"] = is_checking_out
        _touch(session_id, session, sync_db=True)

def set_checkout_prefs(
    session_id: str,
    payment_method: Optional[str] = None,
    delivery_type: Optional[str] = None,
    delivery_address: Optional[str] = None,
) -> Dict[str, str]:
    """Merge explicit checkout choices and persist them across worker restarts."""
    with _get_session_lock(session_id):
        session = _get_or_create_session(session_id)
        prefs = dict(session.get("checkout_prefs") or {})
        changed = False
        if payment_method is not None:
            changed = changed or prefs.get("payment_method") != payment_method
            prefs["payment_method"] = payment_method
        if delivery_type is not None:
            changed = changed or prefs.get("delivery_type") != delivery_type
            prefs["delivery_type"] = delivery_type
        if delivery_address is not None:
            address = str(delivery_address).strip()
            changed = changed or prefs.get("delivery_address") != address
            prefs["delivery_address"] = address
        if changed:
            prefs.pop("summary_fingerprint", None)
        session["checkout_prefs"] = prefs
        _touch(session_id, session, sync_db=True)
        return dict(prefs)

def set_checkout_context(session_id: str, **values: Any) -> Dict[str, Any]:
    """Persist auxiliary checkout state without exposing it as an order field."""
    with _get_session_lock(session_id):
        session = _get_or_create_session(session_id)
        prefs = dict(session.get("checkout_prefs") or {})
        order_affecting_keys = {"voucher_code", "discount_amount"}
        order_state_changed = False
        for key, value in values.items():
            old_value = prefs.get(key)
            if value is None:
                prefs.pop(key, None)
            else:
                prefs[key] = value
            if key in order_affecting_keys and old_value != value:
                order_state_changed = True
        if order_state_changed:
            prefs.pop("summary_fingerprint", None)
        session["checkout_prefs"] = prefs
        _touch(session_id, session, sync_db=True)
        return dict(prefs)

def get_checkout_prefs(session_id: str) -> Dict[str, Any]:
    """Lấy cấu hình thanh toán và giao hàng đã lưu tạm thời."""
    with _get_session_lock(session_id):
        session = _get_or_create_session(session_id)
        return dict(session.get("checkout_prefs") or {})

def set_pending_action(session_id: str, action_type: str, params: Dict[str, Any]) -> None:
    import time
    try:
        with _get_session_lock(session_id):
            session = _get_or_create_session(session_id)
            prefs = dict(session.get("checkout_prefs") or {})
            prefs["pending_action"] = {
                "type": action_type,
                "params": params,
                "expires_at": time.time() + 300,
            }
            session["checkout_prefs"] = prefs
            _touch(session_id, session, sync_db=False)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Failed to set_pending_action: %s", e)

def get_pending_action(session_id: str) -> Optional[Dict[str, Any]]:
    import time
    try:
        with _get_session_lock(session_id):
            session = _get_or_create_session(session_id)
            prefs = dict(session.get("checkout_prefs") or {})
            pending = prefs.get("pending_action")
            if pending:
                if pending.get("expires_at", 0) > time.time():
                    return pending
                else:
                    prefs.pop("pending_action", None)
                    session["checkout_prefs"] = prefs
                    _touch(session_id, session, sync_db=False)
            return None
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Failed to get_pending_action: %s", e)
        return None

def clear_pending_action(session_id: str) -> None:
    try:
        with _get_session_lock(session_id):
            session = _get_or_create_session(session_id)
            prefs = dict(session.get("checkout_prefs") or {})
            if "pending_action" in prefs:
                prefs.pop("pending_action", None)
                session["checkout_prefs"] = prefs
                _touch(session_id, session, sync_db=False)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Failed to clear_pending_action: %s", e)

def reset_conversation_draft(session_id: str) -> Dict[str, Any]:
    """Clear chat-only pending/check-out prompts without touching the real cart."""
    with _get_session_lock(session_id):
        session = _get_or_create_session(session_id)
        prefs = dict(session.get("checkout_prefs") or {})
        draft_keys = (
            "pending_products", "checkout_requested", "voucher_decided",
            "voucher_offer_pending", "voucher_candidates", "summary_fingerprint",
            "checkout_action_id", "branch_candidates", "suggested_address",
            "location_address", "stock_conflicts", "pending_action",
        )
        for key in draft_keys:
            prefs.pop(key, None)
        session["checkout_prefs"] = prefs
        _touch(session_id, session, sync_db=True)
        return dict(prefs)

def set_pending_products(session_id: str, products: List[Dict[str, Any]], merge: bool = False) -> List[Dict[str, Any]]:
    """Persist products selected from a recommendation until each reaches the cart."""
    new_items = [
        {
            **item,
            "product_name": str(item.get("product_name") or "").strip(),
            "category": item.get("category"),
            "quantity": max(1, int(item.get("quantity") or 1)),
        }
        for item in products
        if str(item.get("product_name") or "").strip()
    ]
    with _get_session_lock(session_id):
        session = _get_or_create_session(session_id)
        prefs = dict(session.get("checkout_prefs") or {})
        if merge:
            existing = list(prefs.get("pending_products") or [])
            existing_names = {str(i.get("product_name") or "").strip().casefold() for i in existing}
            for item in new_items:
                if str(item.get("product_name") or "").strip().casefold() not in existing_names:
                    existing.append(item)
            prefs["pending_products"] = existing
            normalized = existing
        else:
            prefs["pending_products"] = new_items
            normalized = new_items
        prefs.pop("summary_fingerprint", None)
        session["checkout_prefs"] = prefs
        _touch(session_id, session, sync_db=True)
    return normalized

def mark_pending_product_added(session_id: str, product_name: str) -> None:
    target = str(product_name or "").strip().casefold()
    if not target:
        return
    import re
    def _is_match(pending_name: str, added_name: str) -> bool:
        p1 = pending_name.strip().casefold()
        p2 = added_name.strip().casefold()
        if p1 == p2:
            return True
        p1_clean = re.sub(r'^\d+\s*', '', p1)
        p2_clean = re.sub(r'^\d+\s*', '', p2)
        if p1_clean == p2_clean and p1_clean:
            return True
        if len(p1) >= 10 and len(p2) >= 10:
            if p1 in p2 or p2 in p1:
                return True
        return False

    with _get_session_lock(session_id):
        session = _get_or_create_session(session_id)
        prefs = dict(session.get("checkout_prefs") or {})
        pending = list(prefs.get("pending_products") or [])
        remaining = [
            item for item in pending
            if not _is_match(str(item.get("product_name") or ""), target)
        ]
        if len(remaining) == len(pending):
            return
        if remaining:
            prefs["pending_products"] = remaining
        else:
            prefs.pop("pending_products", None)
        prefs.pop("summary_fingerprint", None)
        session["checkout_prefs"] = prefs
        _touch(session_id, session, sync_db=True)

def set_stock_conflicts(session_id: str, product_names: List[str]) -> None:
    with _get_session_lock(session_id):
        session = _get_or_create_session(session_id)
        prefs = dict(session.get("checkout_prefs") or {})
        if product_names:
            prefs["stock_conflicts"] = [str(name) for name in product_names]
        else:
            prefs.pop("stock_conflicts", None)
        prefs.pop("summary_fingerprint", None)
        session["checkout_prefs"] = prefs
        _touch(session_id, session, sync_db=True)

def cart_fingerprint(session_id: str) -> str:
    """Stable digest of order-affecting cart data for checkout preview validation."""
    cart = get_cart(session_id)
    payload = {
        "branch_id": cart.get("branch_id"),
        "checkout_prefs": {
            key: value for key, value in cart.get("checkout_prefs", {}).items()
            if key not in {
                "summary_fingerprint", "pending_products", "branch_candidates",
                "suggested_address", "location_address", "stock_conflicts",
                "checkout_action_id", "checkout_action_expires_at",
                "pending_action",
            }
        },
        "items": sorted(
            [_order_item_payload(item) for item in cart.get("items", [])],
            key=lambda item: (
                str(item.get("product_id")),
                str(item.get("size") or ""),
                str(item.get("note") or ""),
            ),
        ),
    }
    encoded = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

def mark_checkout_summary(session_id: str) -> Dict[str, str]:
    fingerprint = cart_fingerprint(session_id)
    with _get_session_lock(session_id):
        session = _get_or_create_session(session_id)
        prefs = dict(session.get("checkout_prefs") or {})
        prefs["summary_fingerprint"] = fingerprint
        prefs["checkout_action_id"] = str(uuid.uuid4())
        prefs["checkout_action_expires_at"] = str(time.time() + 15 * 60)
        session["checkout_prefs"] = prefs
        _touch(session_id, session, sync_db=True)
        return dict(prefs)

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
