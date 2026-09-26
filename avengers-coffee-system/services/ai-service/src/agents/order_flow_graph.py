"""Deterministic shell around the conversational ordering agent.

LangGraph owns the turn lifecycle.  The language model may still answer menu
and product questions, but cannot freely invoke a write tool; cart and order
writes are resolved by the nodes below against canonical ids.
"""
from __future__ import annotations

import hashlib
import re
import time
import unicodedata
from typing import Any, Dict, List, Optional, TypedDict

try:  # keep existing environments bootable until requirements are rebuilt
    from langgraph.graph import END, StateGraph
except ImportError:  # pragma: no cover
    StateGraph = None
    END = "__end__"

from src.agents.tier1 import classify_confirmation, classify_order_intent
from src.common import cart_manager


_FOOD_KEYWORDS = (
    "bánh", "banh", "đồ ăn", "do an", "thức ăn", "thuc an", "snack", "món ăn", "mon an",
)
_DRINK_KEYWORDS = (
    "đồ uống", "do uong", "thức uống", "thuc uong", "nước", "nuoc",
    "cà phê", "ca phe", "coffee", "trà", "tra", "tea", "matcha", "sinh tố", "sinh to", "juice",
)


class OrderConversationState(TypedDict, total=False):
    session_id: str
    user_message: str
    history: List[Dict[str, str]]
    client_message_id: Optional[str]
    cart: Dict[str, Any]
    intent: Dict[str, Any]
    result: Dict[str, Any]
    conversation_state: str


def _norm(value: Any) -> str:
    raw = unicodedata.normalize("NFD", str(value or "").lower())
    return "".join(c for c in raw if unicodedata.category(c) != "Mn").replace("đ", "d")


def _map_db_category_to_bucket(raw_category: Any) -> str:
    normalized = _norm(raw_category)
    if any(_norm(keyword) in normalized for keyword in _FOOD_KEYWORDS):
        return "food"
    if any(_norm(keyword) in normalized for keyword in _DRINK_KEYWORDS):
        return "drink"
    return "food"


def _menu_search_specs(message: str) -> List[Dict[str, str]]:
    """Turn natural Vietnamese menu questions into independent catalog queries.

    A sentence such as ``có bánh mặn hoặc bánh matcha không`` contains two
    alternatives, not one product name. Keeping those alternatives separate
    also gives the following numbered choice one stable, canonical namespace.
    """
    text = _norm(message)
    if not text:
        return []

    # A full mooncake name in an existence question is a concrete product
    # lookup. Let `_answer_product_existence` handle it and establish focus;
    # shorter family phrases such as "bánh matcha" remain catalog searches.
    if (
        not re.search(r"\b(?:hoac|hay)\b", text)
        and re.search(r"\bco\b.*\bbanh trung thu\b.+\bkhong\b", text)
    ):
        return []

    # Cart writes and checkout turns have dedicated state-machine nodes.  A
    # broad opening request such as "muốn mua bánh và nước" is different: it
    # names menu families, not products, and needs a canonical list before
    # the customer can use ordinals. Concrete numbered choices remain writes.
    has_menu_ordinal = bool(re.search(
        r"\b(?:nuoc|do uong|banh|do an|mon|san pham|sp)\s*(?:so|thu|#)\s*\d+\b",
        text,
    ))
    broad_family_request = bool(re.search(
        r"\b(?:muon|can|thich)?\s*(?:mua|dat)\s+(?:mon\s+)?(?:banh|do an|nuoc|do uong)\b",
        text,
    )) and not has_menu_ordinal
    if not broad_family_request and re.search(
        r"\b(them|mua|lay|chon|xoa|bo|sua|doi|chinh|so luong|sl|thanh toan|dat hang|chot)\b",
        text,
    ):
        return []

    explores_menu = bool(re.search(
        r"\b(co|xem|menu|goi y|hien thi|tim|tham khao|mon gi|mon nao|ban gi)\b",
        text,
    ))
    compact_query = len(text.split()) <= 6 and bool(re.search(
        r"\b(banh|do an|nuoc|do uong|ca phe|tra|matcha|pizza|pasta)\b",
        text,
    ))
    if not explores_menu and not compact_query:
        return []

    parts = [part.strip() for part in re.split(r"\b(?:hoac|hay)\b", text) if part.strip()]
    overall_food = bool(re.search(r"\b(banh|do an|thuc an|pizza|pasta)\b", text))
    overall_drink = bool(re.search(r"\b(nuoc|do uong|thuc uong|ca phe|tra)\b", text))
    # "bánh và nước" represents two real menu branches.  Without this split
    # the food keyword wins merely because it appears first in the sentence.
    if len(parts) == 1 and overall_food and overall_drink:
        parts = ["banh", "nuoc"]
    specs: List[Dict[str, str]] = []

    for part in parts or [text]:
        has_food = bool(re.search(r"\b(banh|do an|thuc an|pizza|pasta)\b", part))
        has_drink = bool(re.search(r"\b(nuoc|do uong|thuc uong|ca phe|tra)\b", part))
        # In "bánh mặn hoặc matcha", the second alternative inherits food.
        if not has_food and not has_drink and "matcha" in part:
            has_food = overall_food and not overall_drink
            has_drink = overall_drink and not overall_food

        category = "food" if has_food else "drink" if has_drink else "all"
        search_text: Optional[str] = None
        label = "thực đơn"

        if re.search(r"\bbanh man\b", part):
            category, search_text, label = "food", "Bánh Mặn", "Bánh mặn"
        elif re.search(r"\bbanh ngot\b", part):
            category, search_text, label = "food", "Bánh Ngọt", "Bánh ngọt"
        elif re.search(r"\bbanh trung thu\b", part):
            category = "food"
            if "matcha" in part:
                search_text, label = "matcha", "Bánh Matcha"
            elif re.search(r"\b(ca phe|lava|dau xanh|thap cam|bat buu)\b", part):
                meaningful = re.sub(r"^.*?\bbanh trung thu\b", "", part).strip(" ?!.,")
                search_text, label = meaningful, "Bánh Trung Thu"
            else:
                search_text, label = "Bánh Trung Thu", "Bánh Trung Thu"
        elif "matcha" in part:
            # "bánh matcha" only returns food; plain "matcha" may return both.
            category = "food" if has_food else "drink" if has_drink else "all"
            search_text, label = "matcha", "Bánh Matcha" if category == "food" else "Matcha"
        elif re.search(r"\bpizza\b|\bpasta\b", part):
            category, search_text, label = "food", "Pizza", "Pizza & Pasta"
        elif category == "food":
            label = "Menu bánh và đồ ăn"
        elif category == "drink":
            label = "Menu nước"
        else:
            continue

        key = (category, _norm(search_text or ""))
        if not any((row["category"], _norm(row.get("search_text") or "")) == key for row in specs):
            spec = {"category": category, "label": label}
            if search_text:
                spec["search_text"] = search_text
            specs.append(spec)
    return specs


def _search_menu_catalog(message: str) -> Optional[Dict[str, Any]]:
    """Search each requested menu branch and merge exact products by id."""
    specs = _menu_search_specs(message)
    if not specs:
        return None

    from src.function_calling.tools.product_tools import execute_get_recommendations

    merged: List[Dict[str, Any]] = []
    seen: set[str] = set()
    missing: List[str] = []
    query_debug: List[Dict[str, Any]] = []
    rendered_groups: List[tuple[Dict[str, str], List[Dict[str, Any]], Dict[str, Any]]] = []
    for spec in specs:
        top_k = 10 if not spec.get("search_text") else 6
        found = execute_get_recommendations(
            category=spec["category"],
            search_text=spec.get("search_text"),
            top_k=top_k,
        )
        query_debug.append({**spec, "status": found.get("status")})
        products = list(found.get("products") or []) if found.get("status") == "ok" else []
        if not products:
            missing.append(spec["label"])
            continue
        rendered_groups.append((spec, products, found))
        for product in products:
            identity = str(product.get("product_id") or "").strip() or _norm(product.get("product_name"))
            if not identity or identity in seen:
                continue
            seen.add(identity)
            merged.append(product)

    merged = merged[:12]
    result = {
        "status": "ok" if merged else "not_found",
        "products": merged,
        "queries": query_debug,
    }
    group_count = len(rendered_groups)
    logs = [{
        "tool": "get_recommendations",
        "args": {
            "category": spec["category"], "search_text": spec.get("search_text"),
            "list_context_index": index,
            "list_context_count": group_count,
        },
        "result": {"status": "ok", "products": products},
    } for index, (spec, products, _found) in enumerate(rendered_groups)]
    if not merged:
        labels = ", ".join(spec["label"] for spec in specs)
        return {
            "reply": f"Mình chưa tìm thấy món phù hợp trong nhóm {labels}. Bạn muốn xem menu bánh hay menu nước?",
            "checkout_payload": None,
            "tool_calls_log": logs,
            "error": None,
        }

    labels = " hoặc ".join(spec["label"] for spec in specs)
    lines = [f"Mình tìm thấy các món phù hợp với {labels}:"]
    # Every displayed category owns an independent ordinal namespace. Keeping
    # it aligned with the structured snapshots means “nước số 2 và bánh số 1”
    # resolves against exactly what the customer saw, not a flattened history.
    for spec, products, _found in rendered_groups:
        lines.append(f"\n{spec['label']}:")
        for index, product in enumerate(products, 1):
            price = f"{float(product.get('final_price') or 0):,.0f}".replace(",", ".")
            lines.append(f"{index}. {product.get('product_name')} - {price}đ")
    if missing:
        lines.append("Chưa tìm thấy kết quả riêng cho: " + ", ".join(missing) + ".")
    lines.append("Bạn muốn chọn món số mấy hoặc nói tên món nhé.")
    return {
        "reply": "\n".join(lines),
        "checkout_payload": None,
        "tool_calls_log": logs,
        "error": None,
    }


def _format_quote(session_id: str, quote_result: Dict[str, Any], lead: str = "Giỏ hàng hiện tại:") -> str:
    quote = quote_result.get("quote") or {}
    lines = [lead]
    for item in quote.get("items") or quote_result.get("cart", {}).get("items") or []:
        name = item.get("ten_san_pham") or item.get("product_name") or "Sản phẩm"
        qty = int(item.get("so_luong") or item.get("quantity") or 1)
        total = float(item.get("line_total") or (item.get("unit_price") or item.get("gia_ban") or 0) * qty)
        lines.append(f"- {name} x{qty}: {total:,.0f}đ".replace(",", "."))
    subtotal = float(quote.get("subtotal") or quote_result.get("cart", {}).get("total_price") or 0)
    discount = float(quote.get("discount_amount") or 0)
    final = float(quote.get("final_total") or subtotal - discount)
    lines.append(f"Tổng gốc: {subtotal:,.0f}đ".replace(",", "."))
    if quote.get("voucher_code"):
        lines.append(f"Mã {quote['voucher_code']}: -{discount:,.0f}đ".replace(",", "."))
    lines.append(f"Tổng thanh toán: {final:,.0f}đ".replace(",", "."))
    return "\n".join(lines)


_CART_REFERENCE_STOPWORDS = {
    "cho", "toi", "minh", "ban", "giup", "nhe", "nha", "voi", "di", "thoi",
    "so", "thu", "luong", "sl", "la", "ve", "con", "lai", "cai", "ly", "phan",
    "trong", "gio", "hang", "them", "mua", "lay", "chon", "sua", "doi", "chinh",
    "topping", "toping", "size", "da", "ngot", "thanh", "va",
}


def _cart_rows_named_in_message(cart: Dict[str, Any], message: str) -> List[Dict[str, Any]]:
    """Return only cart rows whose product name is evidenced by the message.

    Product names may be shortened ("bánh trung thu cà phê" for the Lava
    variant), so exact substring matching alone is insufficient.  Ranking by
    meaningful token overlap remains deterministic and refuses weak generic
    references such as merely "bánh số 3".
    """
    items = list(cart.get("items") or [])
    text = _norm(message)
    exact = [row for row in items if _norm(row.get("product_name")) in text]
    if exact:
        return exact

    message_tokens = {
        token for token in re.findall(r"[a-z0-9]+", text)
        if token not in _CART_REFERENCE_STOPWORDS and not token.isdigit()
    }
    if not message_tokens:
        return []
    scored: List[tuple[int, float, Dict[str, Any]]] = []
    for row in items:
        product_tokens = {
            token for token in re.findall(r"[a-z0-9]+", _norm(row.get("product_name")))
            if token not in _CART_REFERENCE_STOPWORDS
        }
        overlap = len(product_tokens & message_tokens)
        ratio = overlap / max(1, len(product_tokens))
        if overlap >= 2 and ratio >= 0.5:
            scored.append((overlap, ratio, row))
    if not scored:
        return []
    best_overlap = max(value[0] for value in scored)
    overlap_winners = [value for value in scored if value[0] == best_overlap]
    best_ratio = max(value[1] for value in overlap_winners)
    return [value[2] for value in overlap_winners if value[1] == best_ratio]


def _resolve_cart_line(cart: Dict[str, Any], message: str) -> tuple[Optional[Dict[str, Any]], Optional[str]]:
    items = list(cart.get("items") or [])
    text = _norm(message)
    matches = _cart_rows_named_in_message(cart, message)
    if len(matches) == 1:
        return matches[0], None
    focus = (cart.get("checkout_prefs") or {}).get("last_cart_focus")
    if focus and matches:
        focus_matches = [row for row in matches if str(row.get("cart_item_id") or row.get("line_id")) == str(focus)]
        if len(focus_matches) == 1:
            return focus_matches[0], None
    if not items:
        return None, "Giỏ hàng đang trống. Bạn muốn chọn món nào trước?"
    # A single row or focused row is safe only for a genuine generic/pronoun
    # reference.  Do not let a different named product mutate it accidentally.
    generic_reference = bool(re.search(
        r"\b(mon|san pham|cai)\s*(nay|do|kia)\b|\b(no|mon vua chon)\b|\b(so luong|topping|toping|size|da|ngot)\b",
        text,
    ))
    if len(items) == 1 and (not _cart_rows_named_in_message(cart, message) or generic_reference):
        return items[0], None
    if focus and generic_reference:
        focus_matches = [row for row in items if str(row.get("cart_item_id") or row.get("line_id")) == str(focus)]
        if len(focus_matches) == 1:
            return focus_matches[0], None
    numbered = "\n".join(f"{index + 1}. {row.get('product_name')} ({row.get('size') or 'mặc định'})" for index, row in enumerate(items))
    return None, "Mình cần biết đúng dòng món cần sửa vì giỏ có nhiều biến thể:\n" + numbered


def _resolve_suggested_product(session_id: str, message: str) -> Optional[Dict[str, Any]]:
    """Resolve an ordinal/name against the exact latest recommendation snapshot."""
    suggestions = list(cart_manager.get_checkout_prefs(session_id).get("last_product_suggestions") or [])
    if not suggestions:
        return None
    text = _norm(message)
    ordinal = re.search(r"\b(?:banh|mon|san pham)?\s*(?:so|thu|#)\s*(\d+)\b", text)
    if ordinal:
        position = int(ordinal.group(1)) - 1
        if 0 <= position < len(suggestions):
            return suggestions[position]
    exact = [row for row in suggestions if _norm(row.get("product_name")) in text]
    return exact[0] if len(exact) == 1 else None


def _resolve_structured_references(session_id: str, message: str) -> Optional[List[Dict[str, Any]]]:
    """Resolve ordinals and demonstratives from durable recommendation state.

    The returned product objects come directly from the snapshots written by
    tool results. They are not reconstructed from assistant prose.
    """
    prefs = cart_manager.get_checkout_prefs(session_id)
    snapshots = dict(prefs.get("product_suggestion_snapshots") or {})
    latest = list(prefs.get("last_product_suggestions") or [])
    suggestion_mode = str(prefs.get("product_suggestion_mode") or "flat")
    focus = prefs.get("last_product_focus") or {}
    text = _norm(message)
    resolved: List[Dict[str, Any]] = []

    patterns = (
        ("drink", r"(?:nuoc|do uong)"),
        ("food", r"(?:banh|do an)"),
    )
    for category, keyword in patterns:
        match = re.search(rf"\b{keyword}\s*(?:so|thu|#)\s*(\d+)\b", text)
        candidates = list(snapshots.get(category) or [])
        if match:
            index = int(match.group(1)) - 1
            # The renderer labels each category and restarts numbering under
            # that heading. Its durable category snapshot therefore wins over
            # a flattened list used only for backward-compatible “món số N”.
            if suggestion_mode == "grouped" and 0 <= index < len(candidates):
                resolved.append(candidates[index])
                continue
            # Prefer the exact latest displayed list when its numbered row has
            # the requested type.  This handles a mixed Matcha result where
            # "bánh số 3" refers to row 3, while preserving the older separate
            # drink/food namespaces when the latest list belongs to one group.
            if 0 <= index < len(latest):
                latest_item = latest[index]
                latest_category = str(latest_item.get("category") or "")
                if latest_category not in {"drink", "food"}:
                    # Older conversation snapshots stored a flat category
                    # value such as "all".  Derive its bucket from the
                    # canonical product name so an active conversation that
                    # predates this deploy cannot send "bánh số 3" back to a
                    # stale food list.
                    latest_category = _map_db_category_to_bucket(
                        latest_item.get("product_name") or latest_category
                    )
                if latest_category == category:
                    resolved.append(latest_item)
                    continue
            if candidates and 0 <= index < len(candidates):
                resolved.append(candidates[index])

    demonstrative = re.search(r"\b(banh|nuoc|mon|san pham)\s+(?:nay|do|kia)\b", text)
    if demonstrative and focus.get("product_name"):
        ref_word = demonstrative.group(1)
        implied_category = (
            "food" if ref_word == "banh"
            else "drink" if ref_word == "nuoc"
            else focus.get("category")
        )
        if implied_category == focus.get("category"):
            resolved.append(focus)

    unique: List[Dict[str, Any]] = []
    seen = set()
    for item in resolved:
        identity = str(item.get("product_id") or "").strip() or _norm(item.get("product_name"))
        if not identity or identity in seen:
            continue
        seen.add(identity)
        unique.append(item)
    return unique or None


def _requested_ordinal_categories(message: str) -> set[str]:
    """Return only explicitly named ordinal namespaces in a customer turn."""
    text = _norm(message)
    requested: set[str] = set()
    if re.search(r"\b(?:nuoc|do uong)\s*(?:thi\s*)?(?:so|thu|#)\s*\d+\b", text):
        requested.add("drink")
    if re.search(r"\b(?:banh|do an)\s*(?:thi\s*)?(?:so|thu|#)\s*\d+\b", text):
        requested.add("food")
    return requested


def _resolve_all_category_ordinals(
    session_id: str, message: str, history: List[Dict[str, str]],
) -> Optional[List[Dict[str, Any]]]:
    """Resolve every explicitly requested category before a cart write.

    Recommendation calls sometimes emit separate logs and an older snapshot
    can therefore contain one category only.  The compact canonical history is
    the safe fallback, because it is still parsed into product names before
    any write is attempted.  This prevents "nước số 1 và bánh số 1" from
    silently becoming only one item.
    """
    requested = _requested_ordinal_categories(message)
    structured = list(_resolve_structured_references(session_id, message) or [])
    present = {str(item.get("category") or "") for item in structured}
    if not requested or requested.issubset(present):
        return structured or None

    from src.agents.agent_service import _resolve_numbered_product_choices

    contextual_message, contextual_history = _contextualize_product_references(session_id, message, history)
    fallback = _resolve_numbered_product_choices(contextual_message, contextual_history)
    for item in fallback:
        category = str(item.get("category") or "")
        if category in requested and category not in present:
            structured.append(item)
            present.add(category)
    # Do not return a partial set for an explicitly multi-category choice.
    return structured if requested.issubset(present) else None


def _asks_unresolved_food_recommendation(message: str) -> bool:
    """True when a turn asks for an additional cake without naming one."""
    text = _norm(message)
    return bool(re.search(
        r"\b(?:them|mua|lay|chon)\s+(?:\d+\s+)?(?:mon\s+)?(?:banh|do an)\b",
        text,
    )) and not bool(re.search(
        r"\b(?:banh|do an)\s*(?:thi\s*)?(?:so|thu|#)\s*\d+\b", text,
    ))


def _contextualize_product_references(
    session_id: str, message: str, history: List[Dict[str, str]],
) -> tuple[str, List[Dict[str, str]]]:
    """Supply a compact canonical menu for pronouns and category ordinals.

    A pizza follow-up must not erase the earlier drink list. We keep snapshots
    by category and turn "bánh này" into a concrete ordinal before the legacy
    product configurator runs.
    """
    prefs = cart_manager.get_checkout_prefs(session_id)
    snapshots = dict(prefs.get("product_suggestion_snapshots") or {})
    focus = prefs.get("last_product_focus") or {}
    if not snapshots and not focus:
        return message, history
    text = _norm(message)
    has_category_ordinal = bool(re.search(r"\b(nuoc|do uong|banh|mon)\s*(?:so|thu|#)\s*\d+\b", text))
    refers_to_focus = bool(re.search(r"\b(?:banh|mon|san pham)\s+(?:nay|do)\b", text))
    if not has_category_ordinal and not refers_to_focus:
        return message, history
    rewritten = message
    focus_name = str(focus.get("product_name") or "")
    focus_category = str(focus.get("category") or "food")
    if refers_to_focus and focus_name:
        label = "bánh" if focus_category == "food" else "nước"
        rewritten = re.sub(r"\b(?:bánh|món|sản phẩm)\s+(?:này|đó)\b", f"{label} số 1", rewritten, flags=re.IGNORECASE)
    lines: List[str] = []
    if snapshots.get("drink"):
        lines.append("Nước:")
        lines.extend(f"{index}. {item.get('product_name')}" for index, item in enumerate(snapshots["drink"], 1))
    if snapshots.get("food"):
        lines.append("Bánh:")
        lines.extend(f"{index}. {item.get('product_name')}" for index, item in enumerate(snapshots["food"], 1))
    if not lines:
        return rewritten, history
    return rewritten, [*history, {"role": "assistant", "content": "\n".join(lines)}]


def _cart_line_id(item: Dict[str, Any]) -> Optional[str]:
    value = item.get("cart_item_id") or item.get("line_id") or item.get("id")
    return str(value) if value is not None and str(value) else None


def _update_cart_focus_after_add(
    session_id: str,
    handled: Optional[Dict[str, Any]] = None,
    product_ref: Optional[Dict[str, Any]] = None,
    before_line_ids: Optional[set[str]] = None,
) -> None:
    """Focus the exact line created or merged by a successful add operation."""
    line_id: Optional[str] = None
    logs = list((handled or {}).get("tool_calls_log") or [])
    if handled is not None and not any(
        entry.get("tool") == "add_to_cart" and (entry.get("result") or {}).get("status") == "ok"
        for entry in logs
    ):
        return
    for entry in reversed(logs):
        if entry.get("tool") != "add_to_cart":
            continue
        value = entry.get("result") or {}
        if value.get("status") != "ok":
            continue
        persisted = value.get("persisted_line") or {}
        line_id = _cart_line_id(persisted)
        if line_id:
            break

    try:
        from src.function_calling.tools.cart_tools import sync_authoritative_cart
        cart = sync_authoritative_cart(session_id)
    except Exception:
        cart = cart_manager.get_cart(session_id)
    items = list(cart.get("items") or [])

    if not line_id and before_line_ids is not None:
        new_rows = [row for row in items if _cart_line_id(row) and _cart_line_id(row) not in before_line_ids]
        if len(new_rows) == 1:
            line_id = _cart_line_id(new_rows[0])
    if not line_id and product_ref:
        product_id = str(product_ref.get("product_id") or "")
        product_name = _norm(product_ref.get("product_name"))
        matches = [
            row for row in items
            if (product_id and str(row.get("product_id") or "") == product_id)
            or (product_name and _norm(row.get("product_name")) == product_name)
        ]
        if len(matches) == 1:
            line_id = _cart_line_id(matches[0])
    if not line_id and len(items) == 1:
        line_id = _cart_line_id(items[0])
    if line_id:
        cart_manager.set_checkout_context(session_id, last_cart_focus=line_id)


def _prepare_structured_products(
    session_id: str,
    refs: List[Dict[str, Any]],
    operation_base: Optional[str] = None,
) -> Dict[str, Any]:
    """Prepare exact referenced products when the legacy add helper cannot run.

    This is required for an empty cart: the legacy `_handle_additional_product`
    intentionally only handles additions to an existing cart.
    """
    from src.agents.agent_service import _complete_pending_products_from_options, _parse_option_groups
    from src.function_calling.tools.product_tools import execute_get_product_options

    pending: List[Dict[str, Any]] = []
    logs: List[Dict[str, Any]] = []
    reply_lines = [f"Mình đã ghi nhận đủ {len(refs)} món bạn chọn:"]
    needs_options = False
    for index, ref in enumerate(refs):
        product_name = str(ref.get("product_name") or "").strip()
        option_result = execute_get_product_options(product_name)
        logs.append({"tool": "get_product_options", "args": {"product_name": product_name}, "result": option_result})
        groups = _parse_option_groups(option_result) if option_result.get("status") == "ok" else {}
        pending_item = {**ref, "product_name": product_name, "options": {"groups": groups}}
        if operation_base:
            pending_item["operation_id"] = f"{operation_base}:add:{index}"
        pending.append(pending_item)
        reply_lines.append(f"- {product_name}")
        # A one-value group is a server default, not a question for the user.
        # This matters for mooncakes whose only option is size "Nhỏ": they can
        # be persisted immediately while preserving the requested quantity.
        if any(len(values) > 1 for values in groups.values()):
            needs_options = True
            for name, values in groups.items():
                reply_lines.append(f"  - {name}: {', '.join(str(value) for value in values)}")

    cart_manager.set_pending_products(session_id, pending, merge=True)
    cart_manager.set_pending_action(session_id, "fill_options", {"count": len(pending)})
    if not needs_options:
        completed = _complete_pending_products_from_options(session_id, "theo mặc định")
        if completed:
            completed["tool_calls_log"] = logs + list(completed.get("tool_calls_log") or [])
            return completed
    reply_lines.append("Mình đang giữ đúng các món trên. Bạn chọn tùy chọn mong muốn; món không cần chỉnh thì nói ‘theo mặc định’ nhé.")
    return {"reply": "\n".join(reply_lines), "checkout_payload": None, "tool_calls_log": logs, "error": None}


def _extract_add_quantity(message: str) -> int:
    text = _norm(message)
    match = (
        re.search(r"(?:so luong|sl)\s*(?:la)?\s*(\d+)", text)
        or re.search(r"\b(\d+)\s*(?:cai|ly|phan|mon)\b", text)
        or re.search(r"\bthem\s+(\d+)\b", text)
    )
    return max(1, int(match.group(1))) if match else 1


def _turn_operation_base(state: OrderConversationState) -> Optional[str]:
    """Stable per-turn identity; never trust a model-provided operation id."""
    client_message_id = state.get("client_message_id")
    if not client_message_id:
        return None
    digest = hashlib.sha256(
        f"{state['session_id']}|{client_message_id}".encode("utf-8")
    ).hexdigest()
    return f"ai:{digest}"


def _resolve_add_reference(session_id: str, message: str) -> Optional[Dict[str, Any]]:
    refs = _resolve_structured_references(session_id, message) or []
    if len(refs) == 1:
        return refs[0]
    suggested = _resolve_suggested_product(session_id, message)
    if suggested:
        return suggested
    focus = cart_manager.get_checkout_prefs(session_id).get("last_product_focus") or {}
    focus_name = _norm(focus.get("product_name"))
    text = _norm(message)
    refers_to_focus = bool(re.search(
        r"\b(mon|banh|nuoc|san pham)\s*(nay|do|kia)\b|\b(them cho toi|them vao gio|y toi la)\b",
        text,
    ))
    if focus_name and (focus_name in text or refers_to_focus):
        return focus
    # A full product name may be supplied without having appeared in a recent
    # recommendation. Keep the original accents for the menu lookup.
    direct = re.search(
        r"(?:mua\s+)?thêm\s+(?:cho\s+(?:tôi|mình)\s+)?(.+?)(?:\s+(?:vào\s+giỏ|nữa|ấy|nhé))*[.!?]*$",
        str(message or ""),
        re.IGNORECASE,
    )
    if direct:
        name = direct.group(1).strip(" ,.!?")
        # The non-greedy capture may still include this suffix when the
        # optional tail chooses zero repetitions. Strip it deterministically
        # before validating the canonical menu name.
        name = re.sub(r"\s+vào\s+giỏ(?:\s+hàng)?\b.*$", "", name, flags=re.IGNORECASE)
        name = re.sub(
            r"\b(?:số lượng\s*)?\d+\s*(?:cái|ly|phần|món)?\b.*$",
            "",
            name,
            flags=re.IGNORECASE,
        ).strip(" ,.!?")
        rejected_search = re.search(r"\b(xem|goi y|hien thi|tim|cac mon|mon nao)\b", _norm(name))
        if name and not rejected_search and _norm(name) not in {"mon", "mon banh", "banh", "nuoc", "do uong"}:
            return {"product_name": name, "category": _map_db_category_to_bucket(name)}
    return None


def _answer_product_existence(session_id: str, message: str) -> Optional[Dict[str, Any]]:
    """Answer a concrete menu-existence question and establish product focus."""
    text = _norm(message)
    if not re.search(r"\bco\b.+\bkhong\b", text):
        return None
    ref = _resolve_suggested_product(session_id, message)
    query = str((ref or {}).get("product_name") or "").strip()
    if not query:
        match = re.search(r"(?:có|co)\s+(.+?)\s+(?:không|khong)\b", str(message or ""), re.IGNORECASE)
        query = (match.group(1) if match else "").strip(" ?!.,")
    if not query:
        return None

    from src.function_calling.tools.product_tools import execute_check_price_and_stock
    checked = execute_check_price_and_stock(
        product_name_query=query,
        branch_id="Chưa chọn",
        session_id=session_id,
    )
    log = {"tool": "check_price_and_stock", "args": {"product_name_query": query}, "result": checked}
    products = list(checked.get("products") or [])
    exact = next(
        (item for item in products if _norm(item.get("product_name")) == _norm(query)),
        products[0] if len(products) == 1 else None,
    )
    if checked.get("status") != "ok" or not exact:
        return {
            "reply": checked.get("message", f"Mình chưa tìm thấy món {query} trong thực đơn hiện tại."),
            "checkout_payload": None,
            "tool_calls_log": [log],
            "error": None,
        }
    price = f"{float(exact.get('final_price') or exact.get('price') or 0):,.0f}".replace(",", ".")
    return {
        "reply": (
            f"Có {exact.get('product_name')} trong thực đơn, giá hiện tại {price}đ. "
            "Món chưa được thêm vào giỏ. Bạn có muốn thêm món này không?"
        ),
        "checkout_payload": None,
        "tool_calls_log": [log],
        "error": None,
    }


def _offer_voucher_gate(session_id: str, lead: str = "Mình đã ghi nhận giỏ hàng đã hoàn tất.") -> Dict[str, Any]:
    """Voucher is a mandatory decision gate before fulfillment and payment."""
    from src.agents.agent_service import _checkout_choices_prompt
    from src.function_calling.tools.voucher_tools import execute_get_applicable_vouchers

    # Reaching this gate means the customer explicitly finished the cart.
    # Persist that fact so the later address/branch nodes can deterministically
    # create one canonical checkout summary.  Without it, pickup/dine-in could
    # set a valid branch but stop before request_checkout.
    cart_manager.set_checkout_context(session_id, checkout_requested=True)
    prefs = cart_manager.get_checkout_prefs(session_id)
    if prefs.get("voucher_code"):
        cart_manager.set_checkout_context(session_id, voucher_decided=True, flow_stage="FULFILLMENT")
        return {
            "reply": _checkout_choices_prompt(session_id, f"{lead} Mã {prefs['voucher_code']} đang được áp dụng."),
            "checkout_payload": None,
            "tool_calls_log": [],
            "error": None,
        }
    if prefs.get("voucher_decided"):
        cart_manager.set_checkout_context(session_id, flow_stage="FULFILLMENT")
        return {
            "reply": _checkout_choices_prompt(session_id, lead),
            "checkout_payload": None,
            "tool_calls_log": [],
            "error": None,
        }

    listed = execute_get_applicable_vouchers(session_id)
    logs = [{"tool": "get_applicable_vouchers", "result": listed}]
    vouchers = list(listed.get("vouchers") or [])
    if vouchers:
        candidates = [{
            "ma_voucher": item.get("ma_voucher"),
            "ten_voucher": item.get("ten_voucher") or item.get("ten_chuong_trinh"),
            "so_tien_giam_du_kien": item.get("so_tien_giam_du_kien")
                or item.get("discount_amount") or item.get("so_tien_giam"),
        } for item in vouchers[:4]]
        cart_manager.set_checkout_context(
            session_id,
            voucher_offer_pending=True,
            voucher_candidates=candidates,
            flow_stage="VOUCHER",
        )
        cart_manager.set_pending_action(session_id, "select_voucher", {"count": len(candidates)})
        lines = [lead, "Trước khi chọn cách nhận hàng và thanh toán, bạn có các mã phù hợp:"]
        for index, item in enumerate(candidates, 1):
            discount = f"{float(item.get('so_tien_giam_du_kien') or 0):,.0f}".replace(",", ".")
            lines.append(f"{index}. {item.get('ten_voucher')} [Mã: {item.get('ma_voucher')}] — giảm dự kiến {discount}đ")
        lines.append("Bạn chọn mã số mấy, chọn mã tốt nhất, hoặc nói bỏ qua mã nhé.")
        return {"reply": "\n".join(lines), "checkout_payload": None, "tool_calls_log": logs, "error": None}

    cart_manager.set_checkout_context(session_id, voucher_decided=True, voucher_offer_pending=None, flow_stage="FULFILLMENT")
    cart_manager.clear_pending_action(session_id)
    return {
        "reply": _checkout_choices_prompt(session_id, f"{lead} Hiện không có mã giảm giá phù hợp."),
        "checkout_payload": None,
        "tool_calls_log": logs,
        "error": None,
    }


def _resolve_cart_option_update(item: Dict[str, Any], message: str) -> tuple[Dict[str, Any], Dict[str, Any]]:
    """Validate requested option values and build an absolute cart-row state."""
    from src.agents.agent_service import _parse_option_groups
    from src.function_calling.tools.product_tools import execute_get_product_options

    option_result = execute_get_product_options(str(item.get("product_name") or ""))
    groups = _parse_option_groups(option_result) if option_result.get("status") == "ok" else {}
    text = _norm(message)
    changes: Dict[str, Any] = {}
    for group_name, values in groups.items():
        group = _norm(group_name)
        matches = [str(value) for value in values if _norm(value) and _norm(value) in text]
        if "topping" in group:
            if re.search(r"\b(khong topping|bo topping|xoa topping|khong them topping)\b", text):
                changes["toppings"] = []
            elif matches:
                changes["toppings"] = matches
        elif ("size" in group or "kich thuoc" in group) and matches:
            changes["size"] = matches[0]
        elif "da" in group and matches:
            changes["luong_da"] = matches[0]
        elif ("ngot" in group or "duong" in group) and matches:
            changes["do_ngot"] = matches[0]
        elif "sua" in group and matches:
            changes["loai_sua"] = matches[0]

    if not changes:
        return {}, option_result

    desired = {
        "product_id": item.get("product_id"),
        "quantity": int(item.get("quantity") or 1),
        "size": item.get("size"),
        "toppings": list(item.get("toppings") or []),
        "luong_da": item.get("luong_da"),
        "do_ngot": item.get("do_ngot"),
        "loai_sua": item.get("loai_sua"),
    }
    desired.update(changes)
    desired["custom_attributes"] = {
        key: value for key, value in {
            "Kích thước": desired.get("size"),
            "Topping": desired.get("toppings"),
            "Lượng đá": desired.get("luong_da"),
            "Độ ngọt": desired.get("do_ngot"),
            "Loại sữa": desired.get("loai_sua"),
        }.items() if value not in (None, "", [])
    }
    return desired, option_result


def _sync(state: OrderConversationState) -> OrderConversationState:
    from src.function_calling.tools.cart_tools import sync_authoritative_cart
    try:
        cart = sync_authoritative_cart(state["session_id"])
    except Exception:
        cart = cart_manager.get_cart(state["session_id"])
    return {**state, "cart": cart}


def _understand(state: OrderConversationState) -> OrderConversationState:
    pending = cart_manager.get_pending_action(state["session_id"])
    intent = classify_order_intent(state["user_message"], (pending or {}).get("type"))
    if (pending or {}).get("type") == "clear_cart" and re.search(r"\b(dong y|xac nhan|ok|oke)\b", _norm(state["user_message"])):
        intent = {"intent": "CLEAR_CART", "confirmed": True}
    if (pending or {}).get("type") == "edit_cart_item":
        if re.search(
            r"\b(size|nho|vua|lon|topping|toping|hat|foam|tran chau|sua|da|ngot|duong|mac dinh)\b",
            _norm(state["user_message"]),
        ):
            intent = {"intent": "EDIT_OPTIONS"}
    # “đổi tùy chọn của <món>” is an edit request even before the customer
    # names a particular topping.  Tier1 intentionally cannot infer this from
    # the generic phrase alone, while the graph can safely resolve its cart row.
    if re.search(r"\b(doi|thay)\b.*\b(tuy chon|option|size|topping|toping|da|ngot|sua)\b", _norm(state["user_message"])):
        intent = {"intent": "EDIT_OPTIONS"}
    # A correction such as “ý tôi là Bánh Matcha 2 cái” continues the latest
    # concrete product discussion. It is an add, never a quantity edit of the
    # previously focused cart line.
    if intent.get("intent") == "BROWSING" and re.search(r"\by toi la\b", _norm(state["user_message"])):
        if _resolve_add_reference(state["session_id"], state["user_message"]):
            intent = {"intent": "ADD_ITEM", "quantity": _extract_add_quantity(state["user_message"])}
    return {**state, "intent": intent}


def _execute(state: OrderConversationState) -> OrderConversationState:
    from src.function_calling.tools.cart_tools import (
        execute_get_cart_quote, execute_remove_cart_item, execute_update_cart_item,
    )
    session_id, message, cart, intent = state["session_id"], state["user_message"], state["cart"], state["intent"]
    kind = intent.get("intent")
    # A numbered branch is a checkout choice, never a menu ordinal. Resolve
    # it before the legacy pending-product handler sees the same number.
    pending = cart_manager.get_pending_action(session_id) or {}
    if pending.get("type") == "select_branch":
        from src.agents.agent_service import _advance_checkout_if_ready, _resolve_pending_branch_choice
        branch_choice = _resolve_pending_branch_choice(session_id, message, history=state.get("history") or [])
        if branch_choice:
            return {**state, "result": _advance_checkout_if_ready(session_id, branch_choice)}
    # A turn can both select numbered products and ask for their reviews.
    # Review resolution has to see the complete historical menu before a
    # generic add branch consumes the first number.
    from src.agents.agent_service import _has_product_review_intent
    if _has_product_review_intent(message):
        contextual_message, contextual_history = _contextualize_product_references(
            session_id, message, state.get("history") or [],
        )
        from src.agents.agent_service import _run_agent_impl
        return {**state, "result": _run_agent_impl(
            session_id, contextual_message, history=contextual_history, allow_model_mutations=False,
        )}
    if kind == "VIEW_CART":
        quote = execute_get_cart_quote(session_id)
        reply = quote.get("message") if quote.get("status") != "ok" else _format_quote(session_id, quote)
        return {**state, "result": {"reply": reply, "checkout_payload": None, "tool_calls_log": [{"tool": "get_cart_quote", "result": quote}], "error": None}}
    if kind == "BROWSING":
        # Resolve category aliases and OR alternatives with catalog data. The
        # entire customer sentence must never become one exact product name.
        menu_result = _search_menu_catalog(message)
        if menu_result:
            return {**state, "result": menu_result}
    if kind == "ADD_ITEM":
        # Resolve every named ordinal before the generic single-product path.
        # `last_product_suggestions` contains one flat namespace and can point
        # to a cake; it must never make “nước số 1 và bánh số 1” add only cake.
        ordinal_refs = _resolve_all_category_ordinals(session_id, message, state.get("history") or [])
        if _asks_unresolved_food_recommendation(message):
            ordinal_refs = None
        if ordinal_refs:
            # A single numbered choice may carry an explicit requested
            # quantity: "bánh số 3, số lượng 2".  Preserve it on the
            # canonical product object until the add tool receives it.
            if len(ordinal_refs) == 1:
                ordinal_refs = [{
                    **ordinal_refs[0],
                    "quantity": int(intent.get("quantity") or _extract_add_quantity(message)),
                }]
            prepared = _prepare_structured_products(
                session_id, ordinal_refs, _turn_operation_base(state),
            )
            for ref in ordinal_refs:
                _update_cart_focus_after_add(session_id, prepared, ref)
            cart_manager.set_checkout_context(session_id, flow_stage="CART_REVIEW")
            return {**state, "result": prepared}
        ref = _resolve_add_reference(session_id, message)
        if ref:
            prepared_ref = {**ref, "quantity": int(intent.get("quantity") or _extract_add_quantity(message))}
            handled = _prepare_structured_products(
                session_id, [prepared_ref], _turn_operation_base(state),
            )
            _update_cart_focus_after_add(session_id, handled, prepared_ref)
            cart_manager.set_checkout_context(session_id, flow_stage="CART_REVIEW")
            return {**state, "result": handled}
    if kind == "SET_QUANTITY":
        item, error = _resolve_cart_line(cart, message)
        if error:
            return {**state, "result": {"reply": error, "checkout_payload": None, "tool_calls_log": [], "error": None}}
        changed = execute_update_cart_item(session_id, str(item.get("cart_item_id") or item.get("line_id")), {"quantity": intent["quantity"]})
        if changed.get("status") == "ok":
            cart_manager.set_checkout_context(session_id, last_cart_focus=str(item.get("cart_item_id") or item.get("line_id")), flow_stage="CART_REVIEW")
            quote = {"status": "ok", "cart": changed.get("cart"), "quote": changed.get("quote")}
            reply = _format_quote(session_id, quote, "Đã cập nhật số lượng. Giỏ hàng mới:") + "\nBạn muốn thêm, sửa, xoá món hay hoàn tất giỏ?"
        else:
            reply = changed.get("message", "Chưa thể cập nhật món.")
        return {**state, "result": {"reply": reply, "checkout_payload": None, "tool_calls_log": [{"tool": "update_cart_item", "result": changed}], "error": None}}
    if kind == "REMOVE_ITEM":
        item, error = _resolve_cart_line(cart, message)
        if error:
            return {**state, "result": {"reply": error, "checkout_payload": None, "tool_calls_log": [], "error": None}}
        line_id = str(item.get("cart_item_id") or item.get("line_id"))
        cart_manager.set_checkout_context(session_id, last_cart_focus=line_id)
        removed = execute_remove_cart_item(session_id, line_id)
        reply = removed.get("message", "Chưa thể xoá món.")
        if removed.get("status") == "ok":
            cart_manager.set_checkout_context(session_id, last_cart_focus=None, flow_stage="CART_REVIEW")
            quote = execute_get_cart_quote(session_id)
            reply += "\n" + (_format_quote(session_id, quote) if quote.get("status") == "ok" else "Giỏ hàng hiện trống.")
        return {**state, "result": {"reply": reply, "checkout_payload": None, "tool_calls_log": [{"tool": "remove_cart_item", "result": removed}], "error": None}}
    if kind == "EDIT_OPTIONS":
        # A follow-up such as "thêm ngọt" contains an add verb but belongs to
        # the cart row that was explicitly selected one turn earlier.
        pending = cart_manager.get_pending_action(session_id) or {}
        target_id = str(((pending.get("params") or pending.get("data") or {}).get("cart_item_id")) or "")
        item = next((row for row in (cart.get("items") or []) if _cart_line_id(row) == target_id), None)
        error = None
        if not item:
            item, error = _resolve_cart_line(cart, message)
        if error:
            return {**state, "result": {"reply": error, "checkout_payload": None, "tool_calls_log": [], "error": None}}
        line_id = str(item.get("cart_item_id") or item.get("line_id"))
        cart_manager.set_checkout_context(session_id, last_cart_focus=line_id, flow_stage="CART_REVIEW")
        desired, option_result = _resolve_cart_option_update(item, message)
        option_log = {"tool": "get_product_options", "args": {"product_name": item.get("product_name")}, "result": option_result}
        if not desired:
            cart_manager.set_pending_action(session_id, "edit_cart_item", {"cart_item_id": line_id})
            groups = option_result.get("options") or {}
            rendered = "; ".join(
                f"{name}: {', '.join(str(value) for value in values)}"
                for name, values in groups.items()
            )
            reply = (
                f"Bạn muốn đổi gì cho {item.get('product_name')} "
                f"(size hiện tại: {item.get('size') or 'mặc định'})?"
                + (f" Các lựa chọn hợp lệ: {rendered}." if rendered else "")
            )
            return {**state, "result": {"reply": reply, "checkout_payload": None, "tool_calls_log": [option_log], "error": None}}
        changed = execute_update_cart_item(session_id, line_id, desired)
        logs = [option_log, {"tool": "update_cart_item", "args": {"cart_item_id": line_id, "desired_state": desired}, "result": changed}]
        if changed.get("status") == "ok":
            cart_manager.clear_pending_action(session_id)
            cart_manager.set_checkout_context(session_id, last_cart_focus=line_id, flow_stage="CART_REVIEW")
            quote = {"status": "ok", "cart": changed.get("cart"), "quote": changed.get("quote")}
            reply = _format_quote(session_id, quote, f"Đã cập nhật tùy chọn cho {item.get('product_name')}. Giỏ hàng mới:")
            reply += "\nBạn muốn thêm, sửa, xoá món hay hoàn tất giỏ?"
        else:
            reply = changed.get("message", "Chưa thể cập nhật tùy chọn món.")
        return {**state, "result": {"reply": reply, "checkout_payload": None, "tool_calls_log": logs, "error": None}}
    if kind == "CLEAR_CART":
        pending = cart_manager.get_pending_action(session_id)
        if (pending or {}).get("type") != "clear_cart" or not intent.get("confirmed"):
            cart_manager.set_pending_action(session_id, "clear_cart", {})
            return {**state, "result": {"reply": "Bạn có chắc muốn xoá toàn bộ giỏ hàng không? Hãy trả lời ‘đồng ý xoá giỏ’. ", "checkout_payload": None, "tool_calls_log": [], "error": None}}
        from src.function_calling.tools.cart_tools import _customer_session_id, _order_service_request
        from src.function_calling.helpers import _get_service_jwt, _require_valid_session
        uid = _require_valid_session(_customer_session_id(session_id))
        if not uid:
            reply, log = "Cần đăng nhập để xoá giỏ hàng.", {"status": "error"}
        else:
            response = _order_service_request("DELETE", f"/cart/clear/{uid}", _get_service_jwt(uid))
            response.raise_for_status()
            cart_manager.clear_pending_action(session_id)
            _sync(state)
            reply, log = "Đã xoá toàn bộ giỏ hàng.", {"status": "ok"}
        return {**state, "result": {"reply": reply, "checkout_payload": None, "tool_calls_log": [{"tool": "clear_cart", "result": log}], "error": None}}
    structured_refs = _resolve_all_category_ordinals(session_id, message, state.get("history") or [])
    # "nước số 1 với thêm một món bánh nữa" has one concrete selection and
    # one open-ended request. Let the recommendation handler present cake
    # choices instead of silently staging only the drink.
    if _asks_unresolved_food_recommendation(message):
        structured_refs = None
    if structured_refs and re.search(r"\b(them|chon|lay|mua|cho toi)\b", _norm(message)):
        from src.agents.agent_service import _handle_additional_product

        replies: List[str] = []
        logs: List[Dict[str, Any]] = []
        unresolved: List[Dict[str, Any]] = []
        captured_pending: List[Dict[str, Any]] = []
        handled_results: List[tuple[Dict[str, Any], Dict[str, Any], set[str]]] = []
        for ref in structured_refs:
            before_ids = {_cart_line_id(row) for row in (cart_manager.get_cart(session_id).get("items") or []) if _cart_line_id(row)}
            handled = _handle_additional_product(session_id, str(ref.get("product_name") or ""))
            if not handled:
                unresolved.append(ref)
                continue
            replies.append(str(handled.get("reply") or ""))
            logs.extend(handled.get("tool_calls_log") or [])
            captured_pending.extend(cart_manager.get_checkout_prefs(session_id).get("pending_products") or [])
            handled_results.append((handled, ref, before_ids))

        # With an empty cart the legacy helper intentionally returns None.
        # Stage every exact reference together so no selected item is lost.
        if unresolved:
            prepared = _prepare_structured_products(session_id, unresolved)
            replies.append(str(prepared.get("reply") or ""))
            logs.extend(prepared.get("tool_calls_log") or [])
        if captured_pending:
            cart_manager.set_pending_products(session_id, captured_pending, merge=True)
        for handled, ref, before_ids in handled_results:
            _update_cart_focus_after_add(session_id, handled, ref, before_ids)
        if replies:
            return {**state, "result": {
                "reply": "\n\n".join(reply for reply in replies if reply),
                "checkout_payload": None,
                "tool_calls_log": logs,
                "error": None,
            }}

    suggested = _resolve_suggested_product(session_id, message)
    if suggested and not cart.get("is_empty") and re.search(r"\b(them|chon|lay|mua)\b", _norm(message)):
        from src.agents.agent_service import _handle_additional_product
        before_ids = {_cart_line_id(row) for row in (cart.get("items") or []) if _cart_line_id(row)}
        handled = _handle_additional_product(session_id, str(suggested.get("product_name") or ""))
        if handled:
            _update_cart_focus_after_add(session_id, handled, suggested, before_ids)
            return {**state, "result": handled}
    if kind == "FINISH_CART":
        if cart.get("is_empty"):
            return {**state, "result": {
                "reply": "Giỏ hàng đang trống. Bạn muốn mình gợi ý đồ uống hay bánh trước?",
                "checkout_payload": None,
                "tool_calls_log": [],
                "error": None,
            }}
        return {**state, "result": _offer_voucher_gate(session_id)}
    if kind in {"SELECT_FULFILLMENT", "SELECT_PAYMENT"} and not cart.get("is_empty"):
        prefs = cart_manager.get_checkout_prefs(session_id)
        quote_check = execute_get_cart_quote(session_id)
        applied_code = (quote_check.get("quote") or {}).get("voucher_code") or prefs.get("voucher_code")
        if applied_code:
            cart_manager.set_checkout_context(
                session_id, voucher_code=applied_code, voucher_decided=True, voucher_offer_pending=None,
            )
        elif not prefs.get("voucher_decided"):
            # Remember an early choice, but do not let it skip the voucher
            # stage or expose checkout controls yet.
            from src.agents.agent_service import _explicit_checkout_choices
            choices = _explicit_checkout_choices(message)
            if choices:
                cart_manager.set_checkout_prefs(session_id, **choices)
            return {**state, "result": _offer_voucher_gate(
                session_id,
                "Mình đã ghi nhớ lựa chọn nhận hàng/thanh toán của bạn. Giỏ vẫn cần hoàn tất bước ưu đãi.",
            )}

    if kind == "SELECT_VOUCHER" and not cart.get("is_empty"):
        # Voucher language must be handled before generic product/price
        # parsing: “mã giảm giá nào” contains “giá” but is never a product.
        from src.agents.agent_service import _resolve_pending_voucher_choice
        resolved = _resolve_pending_voucher_choice(session_id, message)
        if resolved:
            return {**state, "result": resolved}

        from src.function_calling.tools.voucher_tools import execute_get_applicable_vouchers
        listed = execute_get_applicable_vouchers(session_id)
        logs = [{"tool": "get_applicable_vouchers", "result": listed}]
        vouchers = list(listed.get("vouchers") or [])
        if vouchers:
            cart_manager.set_checkout_context(
                session_id,
                voucher_offer_pending=True,
                voucher_candidates=vouchers[:4],
                flow_stage="VOUCHER",
            )
            cart_manager.set_pending_action(session_id, "select_voucher", {"count": min(4, len(vouchers))})
            # “áp mã tốt nhất” applies immediately after the authoritative list
            # has established what “best” means.
            if re.search(r"\b(tot nhat|ma tot|voucher tot)\b", _norm(message)):
                resolved = _resolve_pending_voucher_choice(session_id, message)
                if resolved:
                    resolved["tool_calls_log"] = logs + list(resolved.get("tool_calls_log") or [])
                    return {**state, "result": resolved}
            lines = ["Các mã còn hạn và áp dụng được cho giỏ hiện tại:"]
            for index, item in enumerate(vouchers[:4], 1):
                amount = f"{float(item.get('so_tien_giam_du_kien') or 0):,.0f}".replace(",", ".")
                lines.append(f"{index}. {item.get('ten_voucher')} [Mã: {item.get('ma_voucher')}] — giảm dự kiến {amount}đ")
            lines.append("Bạn chọn mã số mấy, hoặc nói áp mã tốt nhất nhé.")
            return {**state, "result": {"reply": "\n".join(lines), "checkout_payload": None, "tool_calls_log": logs, "error": None}}

        reasons = [str(item.get("reason") or "") for item in listed.get("ineligible") or [] if item.get("reason")]
        detail = f" Lý do: {reasons[0]}." if reasons else ""
        return {**state, "result": {
            "reply": "Hiện không có mã còn hạn và đủ điều kiện cho giỏ này." + detail,
            "checkout_payload": None,
            "tool_calls_log": logs,
            "error": None,
        }}

    existence = _answer_product_existence(session_id, message)
    if existence:
        return {**state, "result": existence}
    contextual_message, contextual_history = _contextualize_product_references(session_id, message, state.get("history") or [])
    # The legacy implementation contains deterministic option/voucher/branch
    # handlers. Its free LLM stage is read-only under this graph.
    from src.agents.agent_service import _run_agent_impl
    return {**state, "result": _run_agent_impl(session_id, contextual_message, history=contextual_history, allow_model_mutations=False)}


def _render(state: OrderConversationState) -> OrderConversationState:
    result = dict(state.get("result") or {})
    prefs = cart_manager.get_checkout_prefs(state["session_id"])
    result["conversation_state"] = prefs.get("flow_stage") or ("VOUCHER" if prefs.get("voucher_offer_pending") else "CART_REVIEW")
    logs = result.get("tool_calls_log") or []
    branches: List[Dict[str, Any]] = []
    vouchers: List[Dict[str, Any]] = []
    products: List[Dict[str, Any]] = []
    for entry in logs:
        value = entry.get("result") if isinstance(entry, dict) else {}
        branches.extend(value.get("branches", []))
        vouchers.extend(value.get("vouchers", []))
        products.extend(value.get("products", []))
        if entry.get("tool") == "get_recommendations" and value.get("status") == "ok" and value.get("products"):
            # A new recommendation replaces the ordinal namespace. This is
            # durable conversation state, so a customer can ask another
            # question before saying "món số 4".
            category = str((entry.get("args") or {}).get("category") or "all")
            snapshot = [
                {
                    "product_id": item.get("product_id"),
                    "product_name": item.get("product_name"),
                    "category": (
                        category if category in {"drink", "food"}
                        else _map_db_category_to_bucket(item.get("category"))
                    ),
                }
                for item in value["products"]
            ]
            existing = dict(cart_manager.get_checkout_prefs(state["session_id"]).get("product_suggestion_snapshots") or {})
            existing[category] = snapshot
            args = entry.get("args") or {}
            context_index = int(args.get("list_context_index") or 0)
            context_count = int(args.get("list_context_count") or 1)
            prior_flat = list(cart_manager.get_checkout_prefs(state["session_id"]).get("last_product_suggestions") or [])
            flat_snapshot = snapshot if context_index == 0 else [*prior_flat, *snapshot]
            cart_manager.set_checkout_context(
                state["session_id"],
                last_product_suggestions=flat_snapshot,
                product_suggestion_snapshots=existing,
                product_suggestion_mode="grouped" if context_count > 1 else "flat",
                last_product_focus=snapshot[-1] if snapshot else None,
            )
        if entry.get("tool") == "check_price_and_stock" and isinstance(value, dict):
            if value.get("status") == "ok":
                single_products = value.get("products") or []
                if len(single_products) == 1:
                    item = single_products[0]
                    cart_manager.set_checkout_context(
                        state["session_id"],
                        last_product_focus={
                            "product_id": item.get("product_id"),
                            "product_name": item.get("product_name"),
                            "category": _map_db_category_to_bucket(item.get("category")),
                        },
                    )
        if entry.get("tool") == "add_to_cart" and isinstance(value, dict) and value.get("status") == "ok":
            _update_cart_focus_after_add(
                state["session_id"],
                {"tool_calls_log": [entry]},
                {"product_name": (entry.get("args") or {}).get("product_name")},
            )
    try:
        from src.function_calling.tools.cart_tools import sync_authoritative_cart
        canonical_cart = sync_authoritative_cart(state["session_id"])
    except Exception:
        canonical_cart = cart_manager.get_cart(state["session_id"])
    # A model/read-only path cannot truthfully claim that it changed the cart.
    # Mutation evidence is the successful write-tool result, never prose.
    reply_norm = _norm(result.get("reply"))
    claims_add = bool(re.search(r"\b(da|se)\s+them\b.*\b(gio|gio hang)\b|\bgio hang hien tai se la\b", reply_norm))
    claims_cart_mutation = claims_add or bool(re.search(
        r"\bda\s+(?:dieu chinh|cap nhat|xoa|bo|thay doi)\b.*\b(?:gio|gio hang|mon|so luong|topping|size)\b",
        reply_norm,
    ))
    mutation_tools = {"add_to_cart", "update_cart_item", "remove_cart_item", "clear_cart"}
    has_mutation_evidence = any(
        isinstance(entry, dict)
        and entry.get("tool") in mutation_tools
        and isinstance(entry.get("result"), dict)
        and entry["result"].get("status") == "ok"
        for entry in logs
    )
    # Successful option completion must close its staged selection. Leaving it
    # behind makes a later sentence like “thêm ngọt” look like a new product.
    if has_mutation_evidence and any(entry.get("tool") == "add_to_cart" for entry in logs) and not re.search(r"\b(chua|can hoan tat|khong the)\b", reply_norm):
        cart_manager.set_pending_products(state["session_id"], [])
        cart_manager.clear_pending_action(state["session_id"])
    if claims_cart_mutation and not has_mutation_evidence:
        try:
            from src.function_calling.tools.cart_tools import execute_get_cart_quote
            quote = execute_get_cart_quote(state["session_id"])
            cart_text = _format_quote(state["session_id"], quote) if quote.get("status") == "ok" else "Giỏ hàng hiện đang trống."
        except Exception:
            cart_text = "Mình chưa xác minh được giỏ hàng lúc này."
        prefix = (
            "Món chưa được thêm vì Order Service chưa xác nhận ghi vào giỏ. "
            if claims_add else
            "Yêu cầu sửa giỏ chưa được ghi vì Order Service chưa xác nhận đúng dòng món. "
        )
        result["reply"] = prefix + "Mình giữ nguyên giỏ để tránh thay đổi nhầm.\n" + cart_text
    result["ui_payload"] = {"cart": canonical_cart, "products": products[:12], "vouchers": vouchers[:4], "branches": branches[:5], "actions": []}
    return {**state, "result": result}


def _build_graph():
    graph = StateGraph(OrderConversationState)
    graph.add_node("sync_cart", _sync)
    graph.add_node("understand_turn", _understand)
    graph.add_node("execute_action", _execute)
    graph.add_node("render_response", _render)
    graph.set_entry_point("sync_cart")
    graph.add_edge("sync_cart", "understand_turn")
    graph.add_edge("understand_turn", "execute_action")
    graph.add_edge("execute_action", "render_response")
    graph.add_edge("render_response", END)
    return graph.compile()


_GRAPH = _build_graph() if StateGraph else None


def run_order_flow(
    session_id: str,
    user_message: str,
    history: Optional[List[Dict[str, str]]] = None,
    client_message_id: Optional[str] = None,
) -> Dict[str, Any]:
    initial: OrderConversationState = {
        "session_id": session_id,
        "user_message": user_message,
        "history": history or [],
        "client_message_id": client_message_id,
    }
    started_at = time.monotonic()
    before = cart_manager.get_cart(session_id)
    before_prefs = cart_manager.get_checkout_prefs(session_id)
    before_fingerprint = cart_manager.cart_fingerprint(session_id)
    # The API-level client id is stable across an HTTP retry.  Tools use this
    # scoped context to derive deterministic operation ids; it is deliberately
    # not exposed to the model.
    from src.function_calling.tools.cart_tools import mutation_operation_context
    with mutation_operation_context(session_id, client_message_id):
        if _GRAPH is None:
            from src.agents.agent_service import _run_agent_impl
            result = _run_agent_impl(session_id, user_message, history=history or [], allow_model_mutations=False)
        else:
            result = _GRAPH.invoke(initial).get("result") or {"reply": "Mình chưa xử lý được yêu cầu này.", "error": "empty_graph_result"}
    try:
        from src.common.turn_log import log_turn_async
        log_turn_async(
            session_id=session_id,
            user_message=user_message,
            history=history or [],
            state_before={
                "cart_fingerprint": before_fingerprint,
                "item_count": before.get("item_count", 0),
                "stage": before_prefs.get("flow_stage", "BROWSING"),
                "pending_action": (before_prefs.get("pending_action") or {}).get("type"),
            },
            gate_name=str(result.get("conversation_state") or "CART_REVIEW"),
            result=result,
            model_name="langgraph-router",
            latency_ms=int((time.monotonic() - started_at) * 1000),
        )
    except Exception:
        # Observability is never allowed to alter a customer turn.
        pass
    return result
