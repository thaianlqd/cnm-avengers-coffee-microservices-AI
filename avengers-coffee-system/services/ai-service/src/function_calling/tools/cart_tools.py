from contextlib import contextmanager
from contextvars import ContextVar
import hashlib
from typing import Any, Dict, Iterator, List, Optional
from src.common import cart_manager


# A cart operation is a business mutation, not an LLM tool-call id.  The
# graph establishes this context from the client message id, which survives an
# HTTP retry.  The counter is deterministic for a single turn and never comes
# from model input.
_MUTATION_OPERATION_CONTEXT: ContextVar[Optional[Dict[str, Any]]] = ContextVar(
    "cart_mutation_operation_context", default=None
)


@contextmanager
def mutation_operation_context(session_id: str, client_message_id: Optional[str]) -> Iterator[None]:
    if not client_message_id:
        yield
        return
    digest = hashlib.sha256(
        f"{session_id}|{client_message_id}".encode("utf-8")
    ).hexdigest()
    token = _MUTATION_OPERATION_CONTEXT.set({
        "session_id": session_id,
        "base": digest,
        "counts": {},
    })
    try:
        yield
    finally:
        _MUTATION_OPERATION_CONTEXT.reset(token)


def _operation_id_for_current_turn(
    session_id: str,
    operation_type: str,
    explicit_operation_id: Optional[str] = None,
) -> Optional[str]:
    if explicit_operation_id:
        return str(explicit_operation_id)
    context = _MUTATION_OPERATION_CONTEXT.get()
    if not context or context.get("session_id") != session_id:
        return None
    counts = context["counts"]
    index = int(counts.get(operation_type, 0))
    counts[operation_type] = index + 1
    return f"ai:{context['base']}:{operation_type}:{index}"


def _variant_unit_price(
    base_price: float,
    variant_rows: List[Any],
    size: Optional[str],
    extra_values: List[str],
) -> float:
    """Build a unit price using the menu schema's actual price semantics.

    Size rows contain the complete selling price for that size. Other option
    rows contain a surcharge. Treating a size row as a surcharge doubled many
    drink prices (95k base + 95k size price).
    """
    import unicodedata

    def normalized(value: Any) -> str:
        raw = unicodedata.normalize("NFD", str(value or "").lower())
        return "".join(c for c in raw if unicodedata.category(c) != "Mn").replace("đ", "d")

    price = float(base_price or 0)
    normalized_size = normalized(size)
    extras = {normalized(value) for value in extra_values if value}
    for row in variant_rows:
        attribute_name, value, amount = row[0], row[1], float(row[2] or 0)
        is_size = "size" in normalized(attribute_name) or "kich thuoc" in normalized(attribute_name)
        if is_size and normalized_size and normalized(value) == normalized_size:
            price = amount
        elif not is_size and normalized(value) in extras:
            price += amount
    return price


def _only_size_value(variant_rows: List[Any]) -> Optional[str]:
    """Return the mandatory size when a product exposes exactly one size."""
    import unicodedata

    def normalized(value: Any) -> str:
        raw = unicodedata.normalize("NFD", str(value or "").lower())
        return "".join(c for c in raw if unicodedata.category(c) != "Mn").replace("đ", "d")

    sizes = [
        str(row[1])
        for row in variant_rows
        if "size" in normalized(row[0]) or "kich thuoc" in normalized(row[0])
    ]
    return sizes[0] if len(sizes) == 1 else None


def _customer_session_id(session_id: str) -> str:
    return str(session_id).split(":conversation:", 1)[0]


def is_authenticated_cart_session(session_id: str) -> bool:
    """Whether this session has an Order Service cart that must be authoritative."""
    from src.function_calling.helpers import _require_valid_session
    return bool(_require_valid_session(_customer_session_id(session_id)))


def _order_service_request(method: str, path: str, token: str, **kwargs):
    import os
    import requests

    base_url = os.getenv("ORDER_SERVICE_URL", "http://order-service:3005")
    headers = dict(kwargs.pop("headers", {}) or {})
    headers["Authorization"] = f"Bearer {token}"
    try:
        return requests.request(method, f"{base_url}{path}", headers=headers, timeout=7, **kwargs)
    except requests.exceptions.ConnectionError:
        return requests.request(method, f"http://host.docker.internal:3005{path}", headers=headers, timeout=7, **kwargs)


def sync_authoritative_cart(session_id: str) -> Dict[str, Any]:
    """Refresh the conversational mirror from the customer cart."""
    from src.function_calling.helpers import _get_service_jwt, _require_valid_session

    # AI state can be scoped per conversation while the order cart remains
    # customer-scoped. Resolve the owner from the namespace prefix.
    valid_uid = _require_valid_session(_customer_session_id(session_id))
    if not valid_uid:
        return {
            **cart_manager.get_cart(session_id),
            "authoritative": False,
            "cart_sync_status": "guest_draft",
        }
    token = _get_service_jwt(valid_uid)
    response = _order_service_request("GET", f"/cart/{valid_uid}", token)
    response.raise_for_status()
    payload = response.json()
    # Array payloads are a temporary compatibility adapter for an older Order
    # Service. Authenticated production traffic must receive the V5 envelope.
    if isinstance(payload, list):
        raise RuntimeError("Order Service returned legacy cart array without cart_version")
    if not isinstance(payload, dict) or payload.get("cart_id") is None or payload.get("cart_version") is None:
        raise RuntimeError("Order Service returned an invalid authoritative cart envelope")
    cart = cart_manager.replace_items_from_order_cart(
        session_id,
        list(payload.get("items") or []),
        cart_id=str(payload["cart_id"]),
        cart_version=int(payload["cart_version"]),
        user_id=str(payload.get("user_id") or valid_uid),
    )
    return {**cart, "authoritative": True, "cart_sync_status": "ok"}


def _quote_authoritative_cart(session_id: str, voucher_code: Optional[str] = None) -> Optional[Dict[str, Any]]:
    from src.function_calling.helpers import _get_service_jwt, _require_valid_session

    valid_uid = _require_valid_session(_customer_session_id(session_id))
    if not valid_uid:
        return None
    token = _get_service_jwt(valid_uid)
    response = _order_service_request(
        "POST",
        f"/cart/{valid_uid}/quote",
        token,
        json={"voucher_code": voucher_code},
    )
    response.raise_for_status()
    return response.json()

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
                "toppings": {"type": "array", "items": {"type": "string"}, "description": "Danh sách topping đúng nhãn từ get_product_options."},
                "luong_da": {"type": "string", "description": "Lượng đá đúng nhãn khách chọn."},
                "do_ngot": {"type": "string", "description": "Độ ngọt đúng nhãn khách chọn."},
                "loai_sua": {"type": "string", "description": "Loại sữa đúng nhãn khách chọn nếu có."},
                "note": {"type": "string", "description": "Ghi chú tự do khác. Không gộp topping, đá, đường vào đây nếu đã có trường tương ứng."},
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
    toppings: Optional[List[str]] = None,
    luong_da: Optional[str] = None,
    do_ngot: Optional[str] = None,
    loai_sua: Optional[str] = None,
    note: Optional[str] = None,
    operation_id: Optional[str] = None,
) -> Dict[str, Any]:
    # Sync with main order-service cart & get image
    import os, requests, logging
    from src.function_calling.helpers import _get_service_jwt, _require_valid_session, _get_engine
    
    import unicodedata

    def norm(value: Any) -> str:
        raw = unicodedata.normalize("NFD", str(value or "").lower())
        return "".join(c for c in raw if unicodedata.category(c) != "Mn").replace("đ", "d")

    valid_uid = _require_valid_session(_customer_session_id(session_id))
    # Backward compatibility: older prompts put all selections inside note.
    note_norm = norm(note)
    known_toppings = {
        "hat sen": "Hạt Sen", "foam dua": "Foam Dừa", "trai vai": "Trái Vải",
        "sua tuoi": "Sữa Tươi", "sua dac": "Sữa Đặc", "shot espresso": "Shot Espresso",
        "xot caramel": "Xốt Caramel", "dao mieng": "Đào Miếng", "sua yen mach": "Sữa Yến Mạch",
        "dai hoa hibiscus": "Đài Hoa Hibiscus", "tran chau trang": "Trân châu trắng",
        "thach suong sao": "Thạch Sương Sáo", "hat no cu nang": "Hạt Nổ Củ Năng",
        "kem pho mai": "Kem Phô Mai Macchiato", "tran chau hoang kim": "Trân Châu Hoàng Kim",
        "hat no yen mach": "Hạt Nổ Yến Mạch",
    }
    selected_toppings = list(toppings or [])
    if not selected_toppings and note_norm:
        selected_toppings = [label for key, label in known_toppings.items() if key in note_norm]
    luong_da = luong_da or next((label for key, label in (("it da", "Ít đá"), ("da rieng", "Đá riêng"), ("binh thuong", "Bình thường")) if key in note_norm), None)
    do_ngot = do_ngot or next((label for key, label in (("khong ngot", "Không ngọt"), ("it ngot", "Ít ngọt"), ("them ngot", "Thêm ngọt"), ("binh thuong", "Bình thường")) if key in note_norm), None)

    real_product_id = product_id
    hinh_anh_url = ""
    authoritative_price = float(unit_price)
    engine = None
    try:
        engine = _get_engine()
        menu_schema = os.getenv("MENU_SCHEMA", "menu")
        with engine.connect() as conn:
            from sqlalchemy import text
            if not str(product_id).isdigit():
                # fallback query by name if product_id is text
                r = conn.execute(text(f"SELECT ma_san_pham, hinh_anh_url, gia_ban FROM {menu_schema}.san_pham WHERE LOWER(ten_san_pham) = LOWER(:pname) LIMIT 1"), {"pname": product_name or product_id}).fetchone()
                if r:
                    real_product_id = str(r[0])
                    hinh_anh_url = r[1] or ""
                    authoritative_price = float(r[2] or unit_price)
            else:
                r = conn.execute(text(f"SELECT hinh_anh_url, gia_ban FROM {menu_schema}.san_pham WHERE ma_san_pham::text = :pid"), {"pid": product_id}).fetchone()
                if r:
                    hinh_anh_url = r[0] or ""
                    authoritative_price = float(r[1] or unit_price)

            extra_values = [value for value in [*selected_toppings, loai_sua] if value]
            if str(real_product_id).isdigit():
                variant_rows = conn.execute(text(f"""
                    SELECT tt.ten_thuoc_tinh, bt.gia_tri, bt.phu_thu
                    FROM {menu_schema}.bien_the_san_pham bt
                    JOIN {menu_schema}.thuoc_tinh tt
                      ON bt.ma_thuoc_tinh = tt.ma_thuoc_tinh
                    WHERE bt.ma_san_pham::text = :pid
                """), {"pid": str(real_product_id)}).fetchall()
                if not size:
                    size = _only_size_value(variant_rows)
                authoritative_price = _variant_unit_price(
                    authoritative_price,
                    variant_rows,
                    size,
                    extra_values,
                )
    except Exception as e:
        logging.getLogger(__name__).error(f"[CartSync] Failed to fetch image URL: {e}")
        return {
            "status": "error",
            "message": "Chưa thể xác minh sản phẩm và giá hiện tại. Món chưa được thêm vào giỏ.",
        }

    # Once an outlet is selected, inventory must be checked before either cart
    # is mutated. This also covers products added after a checkout preview.
    try:
        current_cart = sync_authoritative_cart(session_id)
    except Exception as exc:
        if valid_uid:
            return {
                "status": "error",
                "message": "Chưa thể xác minh giỏ hàng với Order Service. Món chưa được thêm; vui lòng thử lại.",
                "error": str(exc),
            }
        current_cart = cart_manager.get_cart(session_id)
    checkout_prefs = cart_manager.get_checkout_prefs(session_id)
    if current_cart.get("branch_id") and checkout_prefs.get("delivery_type"):
        from src.common.inventory_validation import validate_cart_at_branch
        inventory_schema = os.getenv("INVENTORY_SCHEMA", "inventory")
        stock_result = validate_cart_at_branch(
            engine,
            current_cart,
            inventory_schema,
            extra_item={
                "product_id": real_product_id,
                "product_name": product_name,
                "quantity": max(1, int(quantity)),
            },
        )
        conflicts = stock_result["unavailable"]
        if conflicts:
            cart_manager.set_stock_conflicts(session_id, conflicts)
            return {
                "status": "stock_conflict",
                "message": (
                    f"Cửa hàng {current_cart.get('branch_name') or current_cart['branch_id']} "
                    f"tạm ngưng phục vụ món: {', '.join(conflicts)}. "
                    "Món chưa được thêm vào giỏ."
                ),
                "unavailable_products": conflicts,
            }

    server_row = None
    resolved_operation_id = _operation_id_for_current_turn(
        session_id, "add_cart_line", operation_id,
    )
    if valid_uid:
        try:
            token = _get_service_jwt(valid_uid)
            order_service_url = os.getenv("ORDER_SERVICE_URL", "http://order-service:3005")
            payload = {
                "ma_nguoi_dung": valid_uid,
                "ma_san_pham": int(real_product_id) if str(real_product_id).isdigit() else 0,
                "ten_san_pham": product_name,
                "gia_ban": authoritative_price,
                "hinh_anh_url": hinh_anh_url, 
                "size": size or "Nhỏ",
                "so_luong": max(1, int(quantity)),
                "toppings": selected_toppings,
                "luong_da": luong_da or "",
                "do_ngot": do_ngot or "",
                "loai_sua": loai_sua or "",
                "custom_attributes": {
                    key: value for key, value in {
                        "Kích thước": size,
                        "Topping": selected_toppings,
                        "Lượng đá": luong_da,
                        "Độ ngọt": do_ngot,
                        "Loại sữa": loai_sua,
                    }.items() if value
                },
            }
            headers = {"Authorization": f"Bearer {token}"}
            if resolved_operation_id:
                headers["X-Idempotency-Key"] = resolved_operation_id
            try:
                res = requests.post(
                    f"{order_service_url}/cart", 
                    json=payload, 
                    headers=headers,
                    timeout=5
                )
                res.raise_for_status()
            except requests.exceptions.ConnectionError:
                # Fallback to host.docker.internal if order-service runs on host
                fallback_url = "http://host.docker.internal:3005"
                res = requests.post(
                    f"{fallback_url}/cart", 
                    json=payload, 
                    headers=headers,
                    timeout=5
                )
                res.raise_for_status()
            mutation_result = res.json()
            server_row = (
                mutation_result.get("persisted_line")
                if isinstance(mutation_result, dict)
                else None
            )
        except Exception as e:
            logging.getLogger(__name__).error(f"[CartSync] Failed to sync add_to_cart to main service: {e}")
            return {
                "status": "error",
                "message": "Chưa thể đồng bộ giỏ hàng. Món chưa được xác nhận là đã thêm; vui lòng thử lại.",
            }
        # Persist authoritative cart contents and selected fulfillment branch
        # in this conversation namespace without altering the user cart.
        try:
            cart = sync_authoritative_cart(session_id)
            current_cart = cart_manager.get_cart(session_id)
            if current_cart.get("branch_id"):
                cart_manager.set_branch(session_id, current_cart["branch_id"], current_cart.get("branch_name") or "")
        except Exception as exc:
            logging.getLogger(__name__).error("[CartSync] Cannot refresh just-added cart: %s", exc)
            return {
                "status": "error",
                "message": "Món đã được ghi nhận nhưng chưa thể đối chiếu giỏ. Hãy tải lại giỏ trước khi tiếp tục.",
            }

    # Mirror the exact persisted cart instead of independently incrementing an
    # AI-owned copy. This prevents quantity drift when the web cart already had
    # the same product/options line.
    if valid_uid:
        try:
            cart = sync_authoritative_cart(session_id)
        except Exception as exc:
            logging.getLogger(__name__).error("[CartSync] Cannot refresh authoritative cart: %s", exc)
            return {
                "status": "error",
                "message": "Món đã được ghi nhận nhưng chưa thể đối chiếu giỏ hàng. Vui lòng tải lại giỏ trước khi tiếp tục.",
            }
    else:
        cart = cart_manager.add_item(
            session_id=session_id,
            product_id=real_product_id,
            product_name=product_name,
            unit_price=authoritative_price,
            quantity=max(1, int(quantity)),
            size=size,
            toppings=selected_toppings,
            luong_da=luong_da,
            do_ngot=do_ngot,
            loai_sua=loai_sua,
            note=note,
        )
    cart_manager.mark_pending_product_added(session_id, product_name)
    cart_manager.set_stock_conflicts(session_id, [])

    return {
        "status": "ok",
        "message": f"Đã thêm {product_name} x{quantity} vào giỏ với giá {authoritative_price:,.0f}đ/món.",
        "unit_price": authoritative_price,
        "persisted_line": server_row,
        "cart_version": (cart or {}).get("cart_version"),
        "operation_id": resolved_operation_id,
        "cart": cart,
    }

def execute_remove_from_cart(
    session_id: str,
    product_id: str,
    size: Optional[str] = None,
    operation_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Deprecated frontend compatibility adapter; never register for AI tools.

    This endpoint is product/size based and may remove multiple configured
    lines. Canonical AI writes must use execute_remove_cart_item(line_id).
    """
    import os, requests, logging
    from src.function_calling.helpers import _get_service_jwt, _require_valid_session
    
    valid_uid = _require_valid_session(_customer_session_id(session_id))
    if valid_uid:
        try:
            token = _get_service_jwt(valid_uid)
            base_url = os.getenv("ORDER_SERVICE_URL", "http://order-service:3005")
            headers = {"Authorization": f"Bearer {token}"}
            resolved_operation_id = _operation_id_for_current_turn(
                session_id, "remove_cart_product_legacy", operation_id,
            )
            if resolved_operation_id:
                headers["X-Idempotency-Key"] = resolved_operation_id
            params = {"size": size} if size else None
            try:
                response = requests.delete(
                    f"{base_url}/cart/users/{valid_uid}/products/{product_id}",
                    headers=headers, params=params, timeout=5,
                )
            except requests.exceptions.ConnectionError:
                base_url = "http://host.docker.internal:3005"
                response = requests.delete(
                    f"{base_url}/cart/users/{valid_uid}/products/{product_id}",
                    headers=headers, params=params, timeout=5,
                )
            response.raise_for_status()
            if int(response.json().get("affected") or 0) == 0:
                return {"status": "not_found", "message": "Không tìm thấy món này trong giỏ hàng."}
        except Exception as e:
            logging.getLogger(__name__).error(f"[CartSync] Failed to sync remove_from_cart: {e}")
            return {"status": "error", "message": "Chưa thể đồng bộ việc xóa món. Giỏ hàng chưa được cập nhật; vui lòng thử lại."}

    cart = sync_authoritative_cart(session_id)

    return {
        "status": "ok",
        "message": f"Đã xoá sản phẩm khỏi giỏ hàng.",
        "cart": cart,
    }


def execute_remove_cart_item(
    session_id: str,
    cart_item_id: str,
    operation_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Remove exactly one canonical cart line, never every matching variant."""
    from src.function_calling.helpers import _get_service_jwt, _require_valid_session
    valid_uid = _require_valid_session(_customer_session_id(session_id))
    if not valid_uid:
        return {"status": "error", "message": "Cần đăng nhập để cập nhật giỏ hàng."}
    resolved_operation_id = _operation_id_for_current_turn(
        session_id, "remove_cart_line", operation_id,
    )
    try:
        headers = {"X-Cart-User-Id": str(valid_uid)}
        if resolved_operation_id:
            headers["X-Idempotency-Key"] = resolved_operation_id
        response = _order_service_request(
            "DELETE", f"/cart/{int(cart_item_id)}", _get_service_jwt(valid_uid), headers=headers,
        )
        response.raise_for_status()
        cart = sync_authoritative_cart(session_id)
        return {
            "status": "ok", "message": "Đã xoá đúng món đã chọn khỏi giỏ.", "cart": cart,
            "cart_version": cart.get("cart_version"), "operation_id": resolved_operation_id,
        }
    except Exception as exc:
        return {"status": "error", "message": f"Chưa thể xoá món: {exc}"}


def execute_update_cart_item(
    session_id: str,
    cart_item_id: str,
    desired_state: Dict[str, Any],
    operation_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Atomically update one cart row and return the authoritative quote."""
    import os
    from src.function_calling.helpers import _get_service_jwt, _require_valid_session
    valid_uid = _require_valid_session(_customer_session_id(session_id))
    if not valid_uid:
        return {"status": "error", "message": "Cần đăng nhập để cập nhật giỏ hàng."}
    allowed = {
        "product_id", "ma_san_pham", "quantity", "so_luong", "size", "toppings",
        "luong_da", "do_ngot", "loai_sua", "custom_attributes",
    }
    payload = {key: value for key, value in (desired_state or {}).items() if key in allowed}
    resolved_operation_id = _operation_id_for_current_turn(
        session_id, "update_cart_line", operation_id,
    )
    try:
        current_cart = sync_authoritative_cart(session_id)
        prefs = cart_manager.get_checkout_prefs(session_id)
        if current_cart.get("branch_id") and prefs.get("delivery_type"):
            from src.common.inventory_validation import validate_cart_at_branch
            from src.function_calling.helpers import _get_engine

            candidate_items = []
            found = False
            for row in current_cart.get("items") or []:
                if str(row.get("line_id") or row.get("cart_item_id") or row.get("id")) == str(cart_item_id):
                    found = True
                    candidate_items.append({**row, **payload})
                else:
                    candidate_items.append(dict(row))
            if not found:
                return {"status": "not_found", "message": "Không tìm thấy đúng dòng món cần cập nhật."}
            candidate_cart = {**current_cart, "items": candidate_items}
            stock_result = validate_cart_at_branch(
                _get_engine(), candidate_cart, os.getenv("INVENTORY_SCHEMA", "inventory")
            )
            blockers = list(stock_result.get("unavailable") or []) + list(stock_result.get("unverified") or [])
            if blockers:
                cart_manager.set_stock_conflicts(
                    session_id, blockers, list(stock_result.get("conflicts") or [])
                )
                return {
                    "status": "stock_conflict",
                    "message": "Cập nhật này không khả dụng tại chi nhánh đã chọn: " + ", ".join(blockers),
                    "stock_conflicts": stock_result.get("conflicts") or [],
                }
        headers = {"X-Cart-User-Id": str(valid_uid)}
        if resolved_operation_id:
            headers["X-Idempotency-Key"] = resolved_operation_id
        response = _order_service_request(
            "PATCH", f"/cart/{int(cart_item_id)}", _get_service_jwt(valid_uid), json=payload, headers=headers,
        )
        response.raise_for_status()
        cart = sync_authoritative_cart(session_id)
        if cart.get("branch_id") and prefs.get("delivery_type"):
            from src.common.inventory_validation import validate_cart_at_branch
            from src.function_calling.helpers import _get_engine
            validated = validate_cart_at_branch(
                _get_engine(), cart, os.getenv("INVENTORY_SCHEMA", "inventory")
            )
            cart_manager.set_stock_conflicts(
                session_id,
                list(validated.get("unavailable") or []) + list(validated.get("unverified") or []),
                list(validated.get("conflicts") or []),
            )
        quote = execute_get_cart_quote(session_id)
        return {
            "status": "ok", "message": "Đã cập nhật món trong giỏ.", "cart": cart,
            "quote": quote.get("quote"), "cart_version": cart.get("cart_version"),
            "operation_id": resolved_operation_id,
        }
    except Exception as exc:
        return {"status": "error", "message": f"Chưa thể cập nhật món: {exc}"}


def execute_clear_cart(session_id: str, operation_id: Optional[str] = None) -> Dict[str, Any]:
    """Clear the customer cart with a deterministic, retry-safe operation id."""
    from src.function_calling.helpers import _get_service_jwt, _require_valid_session

    valid_uid = _require_valid_session(_customer_session_id(session_id))
    if not valid_uid:
        return {"status": "error", "message": "Cần đăng nhập để xoá giỏ hàng."}
    resolved_operation_id = _operation_id_for_current_turn(session_id, "clear_cart", operation_id)
    try:
        headers = {}
        if resolved_operation_id:
            headers["X-Idempotency-Key"] = resolved_operation_id
        response = _order_service_request(
            "DELETE", f"/cart/clear/{valid_uid}", _get_service_jwt(valid_uid), headers=headers,
        )
        response.raise_for_status()
        cart = sync_authoritative_cart(session_id)
        return {
            "status": "ok", "message": "Đã xoá toàn bộ giỏ hàng.", "cart": cart,
            "cart_version": cart.get("cart_version"), "operation_id": resolved_operation_id,
        }
    except Exception as exc:
        return {
            "status": "error",
            "message": "Chưa thể xác nhận trạng thái giỏ với Order Service; mình không thay đổi bản sao cục bộ.",
            "error": str(exc),
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
    from src.function_calling.helpers import _require_valid_session
    authenticated = _require_valid_session(_customer_session_id(session_id))
    try:
        cart = sync_authoritative_cart(session_id)
        return {"status": "ok", "cart": cart, "source": "order_service"}
    except Exception as exc:
        if authenticated:
            return {
                "status": "unavailable",
                "message": "Chưa thể đọc giỏ hàng từ Order Service. Vui lòng thử lại; mình không dùng bản sao cũ để xác nhận giỏ.",
                "source": "order_service",
                "error": str(exc),
            }
        cached = cart_manager.get_cart(session_id)
        return {"status": "ok", "cart": cached, "source": "guest_draft"}


def execute_get_cart_quote(session_id: str) -> Dict[str, Any]:
    """Return one authoritative cart snapshot and its current voucher quote."""
    import os
    try:
        cart = sync_authoritative_cart(session_id)
    except Exception as exc:
        return {"status": "error", "message": f"Chưa thể đồng bộ giỏ hàng: {exc}"}
    if cart.get("is_empty"):
        return {"status": "empty_cart", "message": "Giỏ hàng hiện đang trống.", "cart": cart}

    prefs = cart_manager.get_checkout_prefs(session_id)
    if cart.get("branch_id") and prefs.get("delivery_type"):
        try:
            from src.common.inventory_validation import validate_cart_at_branch
            from src.function_calling.helpers import _get_engine
            stock_result = validate_cart_at_branch(
                _get_engine(), cart, os.getenv("INVENTORY_SCHEMA", "inventory")
            )
            blockers = list(stock_result.get("unavailable") or []) + list(stock_result.get("unverified") or [])
            if blockers:
                cart_manager.set_stock_conflicts(
                    session_id, blockers, list(stock_result.get("conflicts") or [])
                )
                return {
                    "status": "stock_conflict",
                    "message": "Giỏ có món không còn đáp ứng được tại chi nhánh đã chọn: " + ", ".join(blockers),
                    "cart": cart,
                    "stock_conflicts": stock_result.get("conflicts") or [],
                }
            cart_manager.set_stock_conflicts(session_id, [])
        except Exception as exc:
            return {"status": "error", "message": f"Chưa thể xác minh tồn kho: {exc}", "cart": cart}
    voucher_code = str(prefs.get("voucher_code") or "").strip().upper() or None
    try:
        quote = _quote_authoritative_cart(session_id, voucher_code)
    except Exception as exc:
        return {"status": "error", "message": f"Chưa thể xác minh giá và voucher: {exc}", "cart": cart}
    quote = quote or {
        "items": cart.get("items") or [],
        "item_count": cart.get("item_count") or 0,
        "subtotal": cart.get("total_price") or 0,
        "discount_amount": 0,
        "voucher_code": None,
        "final_total": cart.get("total_price") or 0,
    }
    return {"status": "ok", "cart": cart, "quote": quote}

TOOL_REQUEST_CHECKOUT = {
    "type": "function",
    "function": {
        "name": "request_checkout",
        "description": (
            "Gọi tool này để TÓM TẮT ĐƠN HÀNG và YÊU CẦU KHÁCH XÁC NHẬN. "
            "TRƯỚC KHI GỌI, BẠN PHẢI HỎI RÕ KHÁCH 2 thông tin nếu chưa biết: "
            "1. Phương thức thanh toán (Tiền mặt, VNPay, Chuyển khoản, Ví điện tử). "
            "2. Hình thức nhận hàng (Giao tận nơi, Mang đi, Dùng tại quán). "
            "TUYỆT ĐỐI KHÔNG GỌI TOOL NÀY NẾU BẠN VỪA GỌI NÓ XONG VÀ KHÁCH ĐÃ TRẢ LỜI ĐỒNG Ý/XÁC NHẬN (Lúc đó phải gọi confirm_checkout)."
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
                "delivery_address": {
                    "type": "string",
                    "description": "Địa chỉ giao khách đã cung cấp hoặc xác nhận; bắt buộc khi giao tận nơi.",
                },
            },
            "required": [],
        },
    },
}

def _normalize_checkout_args(payment_method: Optional[str], delivery_type: Optional[str]):
    pm_raw = str(payment_method or "").strip().upper()
    dt_raw = str(delivery_type or "").strip().upper()

    payment_aliases = {
        "TIỀN MẶT": "THANH_TOAN_KHI_NHAN_HANG",
        "CASH": "THANH_TOAN_KHI_NHAN_HANG",
        "COD": "THANH_TOAN_KHI_NHAN_HANG",
        "KHI NHẬN HÀNG": "THANH_TOAN_KHI_NHAN_HANG",
        "VNPAY": "VNPAY",
        "NGÂN HÀNG QR": "NGAN_HANG_QR",
        "NGAN HANG QR": "NGAN_HANG_QR",
        "CHUYỂN KHOẢN": "NGAN_HANG_QR",
        "CHUYEN KHOAN": "NGAN_HANG_QR",
        "VÍ ĐIỆN TỬ": "VI_DIEN_TU",
        "VI DIEN TU": "VI_DIEN_TU",
        "AVENGERS WALLET": "VI_DIEN_TU",
    }
    delivery_aliases = {
        "GIAO TẬN NƠI": "GIAO_TAN_NOI",
        "GIAO TAN NOI": "GIAO_TAN_NOI",
        "DELIVERY": "GIAO_TAN_NOI",
        "MANG ĐI": "MANG_DI",
        "MANG DI": "MANG_DI",
        "TAKEAWAY": "MANG_DI",
        "TẠI CHỖ": "TAI_CHO",
        "TAI CHO": "TAI_CHO",
        "DÙNG TẠI CHỖ": "TAI_CHO",
        "DUNG TAI CHO": "TAI_CHO",
        "DINE_IN": "TAI_CHO",
    }

    if pm_raw in payment_aliases:
        pm_raw = payment_aliases[pm_raw]
    if dt_raw in delivery_aliases:
        dt_raw = delivery_aliases[dt_raw]
    valid_pms = {"THANH_TOAN_KHI_NHAN_HANG", "VNPAY", "NGAN_HANG_QR", "VI_DIEN_TU"}
    valid_dts = {"GIAO_TAN_NOI", "MANG_DI", "TAI_CHO"}
    return (pm_raw if pm_raw in valid_pms else None, dt_raw if dt_raw in valid_dts else None)

def execute_request_checkout(
    session_id: str,
    payment_method: Optional[str] = None,
    delivery_type: Optional[str] = None,
    delivery_address: Optional[str] = None,
) -> Dict[str, Any]:
    requested_payment, requested_delivery = _normalize_checkout_args(payment_method, delivery_type)
    if payment_method and not requested_payment:
        return {"status": "invalid_payment_method", "message": "Phương thức thanh toán chưa được hệ thống nhận diện. Hãy hỏi khách chọn một phương thức đang hỗ trợ."}
    if delivery_type and not requested_delivery:
        return {"status": "invalid_delivery_type", "message": "Hình thức nhận hàng chưa được hệ thống nhận diện. Hãy hỏi khách chọn lại."}

    prefs = cart_manager.get_checkout_prefs(session_id)
    if delivery_address is not None:
        cart_manager.set_checkout_prefs(session_id, delivery_address=delivery_address)
        prefs = cart_manager.get_checkout_prefs(session_id)
    payment_method = requested_payment or prefs.get("payment_method")
    delivery_type = requested_delivery or prefs.get("delivery_type")
    try:
        cart = sync_authoritative_cart(session_id)
    except Exception:
        # TODO(Batch checkout safety): authenticated checkout must block when
        # authoritative cart sync fails instead of trusting this local mirror.
        cart = cart_manager.get_cart(session_id)
    if cart["is_empty"]:
        return {
            "status": "empty_cart",
            "message": "Giỏ hàng đang trống. Vui lòng thêm sản phẩm trước khi đặt hàng.",
        }
    pending_products = (cart.get("checkout_prefs") or {}).get("pending_products") or []
    if pending_products:
        pending_names = ", ".join(str(item.get("product_name")) for item in pending_products)
        return {
            "status": "pending_products",
            "message": f"Khách đã chọn nhưng chưa hoàn tất các món sau: {pending_names}. Hãy xử lý đủ các món này trước khi tóm tắt đơn.",
        }
    stock_conflicts = (cart.get("checkout_prefs") or {}).get("stock_conflicts") or []
    if stock_conflicts:
        return {
            "status": "stock_conflict",
            "message": f"Chi nhánh đang chọn không đủ hàng cho: {', '.join(stock_conflicts)}. Hãy chọn chi nhánh khác trước khi tóm tắt đơn.",
        }
    if not payment_method:
        return {"status": "need_payment", "message": "Chưa ghi nhận phương thức thanh toán. Hãy hỏi khách chọn phương thức trước khi tóm tắt."}
    if not delivery_type:
        return {"status": "need_delivery", "message": "Chưa ghi nhận hình thức nhận hàng. Hãy hỏi khách chọn giao tận nơi, mang đi hoặc tại chỗ trước khi tóm tắt."}
    delivery_address = prefs.get("delivery_address")
    if delivery_type == "GIAO_TAN_NOI" and not delivery_address:
        return {"status": "need_delivery_address", "message": "Chưa có địa chỉ giao hàng được khách chọn. Hãy lấy địa chỉ hồ sơ hoặc hỏi khách nhập địa chỉ trước khi tóm tắt."}
    if not cart["branch_id"]:
        return {
            "status": "need_branch",
            "message": "Chưa chọn chi nhánh. Vui lòng chọn chi nhánh trước khi đặt hàng.",
        }

    # Inventory can change after outlet selection or after another product is
    # added. Always refresh it before creating a checkout snapshot.
    from src.common.inventory_validation import validate_cart_at_branch
    from src.function_calling.helpers import _get_engine
    import os
    stock_result = validate_cart_at_branch(
        _get_engine(), cart, os.getenv("INVENTORY_SCHEMA", "inventory")
    )
    stock_blockers = stock_result["unavailable"] + stock_result["unverified"]
    if stock_blockers:
        cart_manager.set_stock_conflicts(session_id, stock_blockers)
        return {
            "status": "stock_conflict",
            "message": (
                f"Cửa hàng {cart.get('branch_name') or cart['branch_id']} tạm ngưng phục vụ món: "
                f"{', '.join(stock_blockers)}. "
                "Hãy chọn cửa hàng khác hoặc đổi món trước khi tóm tắt đơn."
            ),
        }
    cart_manager.set_stock_conflicts(session_id, [])

    total = sum(float(i["unit_price"]) * int(i["quantity"]) for i in cart["items"])

    # Quote and voucher validation come from the same order-service contract
    # used by the customer cart.
    prefs_fresh = cart_manager.get_checkout_prefs(session_id)
    voucher_code = str(prefs_fresh.get("voucher_code") or "").strip().upper() or None
    try:
        quote = _quote_authoritative_cart(session_id, voucher_code)
    except Exception as exc:
        return {
            "status": "quote_error",
            "message": f"Chưa thể xác minh giá/mã giảm giá hiện tại: {exc}. Đơn chưa được tóm tắt.",
        }
    summary_items = [dict(item) for item in cart["items"]]
    if quote:
        total = float(quote.get("subtotal") or 0)
        discount_amount = float(quote.get("discount_amount") or 0)
        final_total = float(quote.get("final_total") or max(0.0, total - discount_amount))
        voucher_code = quote.get("voucher_code")
        quoted_by_line = {str(item.get("id") or item.get("line_id")): item for item in quote.get("items", [])}
        for item in summary_items:
            quoted = quoted_by_line.get(str(item.get("line_id")))
            if quoted:
                item["unit_price"] = float(quoted.get("unit_price") or item["unit_price"])
                item["line_total"] = float(quoted.get("line_total") or 0)
    else:
        discount_amount = float(prefs_fresh.get("discount_amount") or 0)
        final_total = max(0.0, total - discount_amount)

    # Store checkout preferences for later confirmation
    cart_manager.set_checkout_prefs(session_id, payment_method, delivery_type)
    summary_state = cart_manager.mark_checkout_summary(session_id)

    total_str = f"{total:,.0f}".replace(",", ".")
    final_str = f"{final_total:,.0f}".replace(",", ".")
    discount_str = f"{discount_amount:,.0f}".replace(",", ".")

    summary_lines = [f"Tóm tắt đơn hàng tại {cart['branch_name']}:"]
    for item in summary_items:
        quantity = int(item.get("quantity") or 1)
        line_total = float(item.get("line_total") or float(item.get("unit_price") or 0) * quantity)
        options = []
        if item.get("size"):
            options.append(f"Size: {item['size']}")
        if item.get("toppings"):
            options.append("Topping: " + ", ".join(str(value) for value in item["toppings"]))
        if item.get("luong_da"):
            options.append(str(item["luong_da"]))
        if item.get("do_ngot"):
            options.append(str(item["do_ngot"]))
        option_text = f" ({'; '.join(options)})" if options else ""
        line_total_text = f"{line_total:,.0f}".replace(",", ".")
        summary_lines.append(f"- {item.get('product_name')} x{quantity}{option_text}: {line_total_text}đ")
    summary_lines.append(f"Tổng gốc: {total_str}đ")
    if voucher_code and discount_amount > 0:
        summary_lines.append(f"Giảm giá ({voucher_code}): -{discount_str}đ")
    summary_lines.append(f"Tổng thanh toán: {final_str}đ")
    summary_lines.append(f"Hình thức nhận: {delivery_type}")
    summary_lines.append(f"Thanh toán: {payment_method}")
    if delivery_address:
        summary_lines.append(f"Địa chỉ giao: {delivery_address}")
    summary_lines.append("Bạn xác nhận chốt đơn để mình tạo đơn hàng nhé.")
    summary_msg = "\n".join(summary_lines)

    return {
        "status": "require_confirmation",
        "order_summary": {
            "branch_id": cart["branch_id"],
            "branch_name": cart["branch_name"],
            "items": summary_items,
            "item_count": cart["item_count"],
            "total_price": total,
            "discount_amount": discount_amount,
            "final_total": final_total,
            "voucher_code": voucher_code,
            "payment_method": payment_method,
            "delivery_type": delivery_type,
            "delivery_address": delivery_address,
            "action_id": summary_state.get("checkout_action_id"),
            "expires_at": summary_state.get("checkout_action_expires_at"),
        },
        "message": summary_msg,
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
    payment_method: Optional[str] = None,
    delivery_type: Optional[str] = None,
    delivery_address: Optional[str] = None,
    action_id: Optional[str] = None,
) -> Dict[str, Any]:
    from src.common.checkout_service import finalize_checkout

    try:
        sync_authoritative_cart(session_id)
    except Exception:
        pass
    # Lấy lại preferences đã lưu nếu có
    prefs = cart_manager.get_checkout_prefs(session_id)
    if (
        action_id is not None
        and str(prefs.get("completed_action_id") or "") == str(action_id)
        and prefs.get("completed_order_id")
    ):
        return {
            "status": "already_processed",
            "message": f"Đơn hàng đã được tạo trước đó (Mã đơn: {prefs['completed_order_id']}).",
            "order_id": str(prefs["completed_order_id"]),
        }
    if not prefs or not prefs.get("summary_fingerprint"):
        return {"status": "no_pending_checkout", "message": "Chưa có bản tóm tắt đơn hàng đang chờ xác nhận."}
    if prefs.get("summary_fingerprint") != cart_manager.cart_fingerprint(session_id):
        return {"status": "stale_checkout", "message": "Giỏ hàng đã thay đổi sau khi tóm tắt. Cần tạo bản tóm tắt mới trước khi đặt."}
    expected_action_id = str(prefs.get("checkout_action_id") or "")
    if action_id is not None and str(action_id) != expected_action_id:
        return {"status": "stale_checkout", "message": "Yêu cầu xác nhận không khớp bản tóm tắt hiện tại. Vui lòng tạo lại bản tóm tắt."}
    try:
        action_expired = float(prefs.get("checkout_action_expires_at") or 0) < __import__("time").time()
    except (TypeError, ValueError):
        action_expired = True
    if action_expired:
        return {"status": "checkout_expired", "message": "Bản tóm tắt đã hết hạn. Vui lòng kiểm tra giá và tồn kho lại trước khi đặt."}
    requested_payment, requested_delivery = _normalize_checkout_args(
        payment_method if payment_method is not None else prefs.get("payment_method"),
        delivery_type if delivery_type is not None else prefs.get("delivery_type"),
    )
    if requested_payment != prefs.get("payment_method") or requested_delivery != prefs.get("delivery_type"):
        return {"status": "stale_checkout", "message": "Thông tin xác nhận không khớp bản tóm tắt hiện tại. Vui lòng xem lại đơn hàng."}
    if delivery_address is not None and delivery_address != prefs.get("delivery_address"):
        return {"status": "stale_checkout", "message": "Địa chỉ xác nhận không khớp bản tóm tắt hiện tại. Vui lòng xem lại đơn hàng."}
    payment_method = prefs.get("payment_method")
    delivery_type = prefs.get("delivery_type")

    payment_method, delivery_type = _normalize_checkout_args(payment_method, delivery_type)
    if payment_method not in {"THANH_TOAN_KHI_NHAN_HANG", "VNPAY", "NGAN_HANG_QR", "VI_DIEN_TU"}:
        return {"status": "no_pending_checkout", "message": "Không tìm thấy phương thức thanh toán hợp lệ trong bản tóm tắt."}
    if not delivery_type:
        return {"status": "no_pending_checkout", "message": "Không tìm thấy hình thức nhận hàng đã xác nhận trong bản tóm tắt."}

    # Recheck immediately before the irreversible order write as well.
    from src.common.inventory_validation import validate_cart_at_branch
    from src.function_calling.helpers import _get_engine
    import os
    cart = cart_manager.get_cart(session_id)
    stock_result = validate_cart_at_branch(
        _get_engine(), cart, os.getenv("INVENTORY_SCHEMA", "inventory")
    )
    stock_blockers = stock_result["unavailable"] + stock_result["unverified"]
    if stock_blockers:
        cart_manager.set_stock_conflicts(session_id, stock_blockers)
        return {
            "status": "stock_conflict",
            "message": (
                "Tồn kho vừa cập nhật: món bị tạm ngưng: "
                f"{', '.join(stock_blockers)}. Đơn chưa được tạo; vui lòng chọn lại món hoặc cửa hàng."
            ),
        }
        
    result = finalize_checkout(
        session_id=session_id,
        payment_method=payment_method,
        delivery_type=delivery_type,
        delivery_address=prefs.get("delivery_address"),
    )
    
    # Nếu tạo đơn thành công, xoá luôn main cart
    if result.get("status") == "success":
        import os, requests, logging
        from src.function_calling.helpers import _get_service_jwt, _require_valid_session
        valid_uid = _require_valid_session(_customer_session_id(session_id))
        if valid_uid:
            try:
                token = _get_service_jwt(valid_uid)
                order_service_url = os.getenv("ORDER_SERVICE_URL", "http://order-service:3005")
                try:
                    clear_response = requests.delete(
                        f"{order_service_url}/cart/clear/{valid_uid}",
                        headers={"Authorization": f"Bearer {token}"},
                        timeout=5
                    )
                except requests.exceptions.ConnectionError:
                    fallback_url = "http://host.docker.internal:3005"
                    clear_response = requests.delete(
                        f"{fallback_url}/cart/clear/{valid_uid}",
                        headers={"Authorization": f"Bearer {token}"},
                        timeout=5
                    )
                clear_response.raise_for_status()
            except Exception as e:
                logging.getLogger(__name__).error(f"[CartSync] Failed to clear main cart: {e}")
                result["cart_sync_status"] = "error"
                
    return result
