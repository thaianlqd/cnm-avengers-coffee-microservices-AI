"""Deterministic shell around the conversational ordering agent.

LangGraph owns the turn lifecycle.  The language model may still answer menu
and product questions, but cannot freely invoke a write tool; cart and order
writes are resolved by the nodes below against canonical ids.
"""
from __future__ import annotations

import hashlib
import html
import json
import logging
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
from src.agents.payment_intent import wallet_payment_evidence
from src.agents.catalog_constraints import extract_catalog_search_text, parse_catalog_constraints
from src.common import cart_manager

logger = logging.getLogger(__name__)


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
    selected_product_id: Optional[str]
    cart: Dict[str, Any]
    cart_sync_status: str
    intent: Dict[str, Any]
    result: Dict[str, Any]
    conversation_state: str


def _norm(value: Any) -> str:
    raw = unicodedata.normalize("NFD", str(value or "").lower())
    return "".join(c for c in raw if unicodedata.category(c) != "Mn").replace("đ", "d")


def _map_db_category_to_bucket(raw_category: Any, parent_category: Any = None) -> str:
    normalized = _norm(parent_category or raw_category)
    if normalized in {"food", "drink"}:
        return normalized
    if any(_norm(keyword) in normalized for keyword in _FOOD_KEYWORDS):
        return "food"
    if any(_norm(keyword) in normalized for keyword in _DRINK_KEYWORDS):
        return "drink"
    return "unknown"


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
    raw_parts = [part.strip() for part in re.split(r"\b(?:hoặc|hoac|hay)\b", message, flags=re.IGNORECASE) if part.strip()]
    overall_food = bool(re.search(r"\b(banh|do an|thuc an|pizza|pasta)\b", text))
    overall_drink = bool(re.search(r"\b(nuoc|do uong|thuc uong|ca phe|tra)\b", text))
    # "bánh và nước" represents two real menu branches.  Without this split
    # the food keyword wins merely because it appears first in the sentence.
    if len(parts) == 1 and overall_food and overall_drink:
        parts = ["banh", "nuoc"]
    specs: List[Dict[str, str]] = []

    for part_index, part in enumerate(parts or [text]):
        original_part = raw_parts[part_index] if len(raw_parts) == len(parts) else part
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
            search_text = extract_catalog_search_text(original_part) or None
            label = "Menu bánh và đồ ăn"
        elif category == "drink":
            search_text = extract_catalog_search_text(original_part) or None
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
    bucket_counts: Dict[str, int] = {}
    missing: List[str] = []
    query_debug: List[Dict[str, Any]] = []
    rendered_groups: List[tuple[Dict[str, str], List[Dict[str, Any]], Dict[str, Any]]] = []
    for spec in specs:
        top_k = 8 if len(specs) > 1 else (10 if not spec.get("search_text") else 8)
        found = execute_get_recommendations(
            category=spec["category"],
            search_text=spec.get("search_text"),
            top_k=top_k,
        )
        query_debug.append({**spec, "status": found.get("status")})
        products = [
            {**product, "menu_bucket": (spec["category"] if spec["category"] in {"food", "drink"}
                else _map_db_category_to_bucket(product.get("category"), product.get("parent_category")))}
            for product in (found.get("products") or [])[:top_k]
        ] if found.get("status") == "ok" else []
        if not products:
            missing.append(spec["label"])
            continue
        rendered_groups.append((spec, products, found))
        for product in products:
            identity = str(product.get("product_id") or "").strip() or _norm(product.get("product_name"))
            if not identity or identity in seen:
                continue
            bucket = product["menu_bucket"]
            if bucket_counts.get(bucket, 0) >= 8:
                continue
            seen.add(identity)
            merged.append(product)
            bucket_counts[bucket] = bucket_counts.get(bucket, 0) + 1

    merged = merged[:16]
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
    for index, product in enumerate(merged, 1):
        price = f"{float(product.get('final_price') or 0):,.0f}".replace(",", ".")
        lines.append(f"{index}. {product.get('product_name')} - {price}đ")
    if missing:
        lines.append("Chưa tìm thấy kết quả riêng cho: " + ", ".join(missing) + ".")
    lines.append("Bạn muốn chọn món số mấy hoặc nói tên món nhé.")
    return {
        "reply": "\n".join(lines),
        "checkout_payload": None,
        "tool_calls_log": logs,
        "displayed_products": merged,
        "missing_menu_groups": missing,
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
    "topping", "toping", "size", "da", "ngot", "thanh", "va", "len", "tang", "de", "oi", "y",
}


def _clean_option_text(value: Any) -> str:
    return re.sub(r"\s+", " ", html.unescape(str(value or "")).replace("\xa0", " ")).strip()


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
        # Two meaningful tokens identify a family phrase. Keep every matching
        # variant so the caller can ask only about the relevant cart lines.
        if overlap >= 2 or (overlap == 1 and "trong gio" in text
                                                 and len(message_tokens - {"mon", "banh", "nuoc"}) == 1):
            scored.append((overlap, ratio, row))
    if not scored:
        return []
    best_overlap = max(value[0] for value in scored)
    overlap_winners = [value for value in scored if value[0] == best_overlap]
    if best_overlap == 1:
        return [value[2] for value in overlap_winners]
    best_ratio = max(value[1] for value in overlap_winners)
    return [value[2] for value in overlap_winners if value[1] == best_ratio]


def _cart_line_snapshot(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    snapshot: List[Dict[str, Any]] = []
    for index, row in enumerate(rows, 1):
        line_id = _cart_line_id(row)
        if not line_id:
            continue
        options = [row.get("size"), *(row.get("toppings") or []), row.get("luong_da"), row.get("do_ngot"), row.get("loai_sua")]
        snapshot.append({
            "display_index": index,
            "line_id": line_id,
            "product_name": row.get("product_name") or "Sản phẩm",
            "variant": ", ".join(_clean_option_text(value) for value in options if _clean_option_text(value)) or "mặc định",
        })
    return snapshot


def _store_cart_line_choice(
    session_id: str,
    operation: str,
    requested_value: Any,
    rows: List[Dict[str, Any]],
    patch: Optional[Dict[str, Any]] = None,
) -> str:
    snapshot = _cart_line_snapshot(rows)
    cart_manager.set_pending_action(session_id, "cart_line_choice", {
        "operation": operation,
        "requested_value": requested_value,
        "candidate_line_ids": [item["line_id"] for item in snapshot],
        "display_snapshot": snapshot,
        "patch": patch or {},
    })
    lines = ["Mình cần biết đúng dòng món cần thao tác:"]
    lines.extend(f"{item['display_index']}. {item['product_name']} ({item['variant']})" for item in snapshot)
    lines.append("Bạn chọn số dòng nhé.")
    return "\n".join(lines)


def _resolve_pending_cart_line(session_id: str, message: str, cart: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    pending = cart_manager.get_pending_action(session_id) or {}
    if pending.get("type") != "cart_line_choice":
        return None
    params = pending.get("params") or pending.get("data") or {}
    snapshot = list(params.get("display_snapshot") or [])
    text = _norm(message)
    match = re.search(r"\b(?:dong|mon|so|thu|#)?\s*(\d+)\b", text)
    selected = None
    if match:
        selected = next((item for item in snapshot if int(item.get("display_index") or 0) == int(match.group(1))), None)
    if not selected:
        named = [item for item in snapshot if _norm(item.get("product_name")) in text]
        if len(named) == 1:
            selected = named[0]
    if not selected:
        return None
    row = next((item for item in cart.get("items") or [] if _cart_line_id(item) == str(selected.get("line_id"))), None)
    if not row:
        cart_manager.clear_pending_action(session_id)
        return {"stale": True}
    return {"row": row, **params}


def _resolve_cart_line(cart: Dict[str, Any], message: str) -> tuple[Optional[Dict[str, Any]], Optional[str]]:
    items = list(cart.get("items") or [])
    text = _norm(message)
    matches = _cart_rows_named_in_message(cart, message)
    id_match = re.search(r"\b(?:line_id|cart_item_id|dòng|dong)\s*[:#]?\s*([\w-]+)\b", message, re.IGNORECASE)
    explicit_id = [row for row in items if id_match and _cart_line_id(row) == id_match.group(1)]
    if len(explicit_id) == 1:
        logger.debug("routing route=CART_MUTATION target_source=cart_id candidate_count=1")
        return explicit_id[0], None
    if len(matches) == 1:
        logger.debug("routing route=CART_MUTATION target_source=cart_name candidate_count=1")
        return matches[0], None
    if not matches and re.search(r"\btrong gio\b", text):
        category = "food" if re.search(r"\b(?:banh|do an)\b", text) else "drink" if re.search(r"\b(?:nuoc|do uong)\b", text) else None
        if category:
            matches = [row for row in items if _map_db_category_to_bucket(row.get("category") or row.get("product_name")) == category]
            if len(matches) == 1:
                logger.debug("routing route=CART_MUTATION target_source=cart_category candidate_count=1")
                return matches[0], None
    focus = (cart.get("checkout_prefs") or {}).get("last_cart_focus")
    if not items:
        return None, "Giỏ hàng đang trống. Bạn muốn chọn món nào trước?"
    # A single row or focused row is safe only for a genuine generic/pronoun
    # reference.  Do not let a different named product mutate it accidentally.
    generic_reference = bool(re.search(
        r"\b(mon|san pham|cai)\s*(nay|do|kia)\b|\b(no|mon vua chon)\b",
        text,
    ))
    remaining_words = {word for word in re.findall(r"[a-z]+", text)
                       if word not in _CART_REFERENCE_STOPWORDS and word not in {"mon", "san", "pham", "theo", "toi", "luon", "muon", "tang", "giam"}}
    if len(items) == 1 and (generic_reference or not remaining_words):
        return items[0], None
    if focus and generic_reference and not matches:
        focus_matches = [row for row in items if str(row.get("cart_item_id") or row.get("line_id")) == str(focus)]
        if len(focus_matches) == 1:
            logger.debug("routing route=CART_MUTATION target_source=cart_focus candidate_count=1")
            return focus_matches[0], None
    choices = matches or items
    logger.debug("routing route=CART_MUTATION target_source=unresolved candidate_count=%d", len(choices))
    numbered = "\n".join(f"{index + 1}. {row.get('product_name')} ({row.get('size') or 'mặc định'})" for index, row in enumerate(choices))
    return None, "Mình cần biết đúng dòng món cần sửa vì giỏ có nhiều biến thể:\n" + numbered


def _resolve_suggested_product(session_id: str, message: str) -> Optional[Dict[str, Any]]:
    """Resolve an ordinal/name against the exact latest recommendation snapshot."""
    suggestions = list(cart_manager.get_checkout_prefs(session_id).get("last_product_suggestions") or [])
    if not suggestions:
        return None
    text = _norm(message)
    product_clause = re.split(r"\b(?:so luong|sl)\b|\bx\s*\d+\b", text, maxsplit=1)[0]
    ordinal = re.search(r"\b(?:(?:banh|nuoc|do uong|mon|san pham)\s+(?:(?:[a-z]{1,3}|#)\s+)?|(?:so|thu|#)\s*)(\d+)\b", product_clause)
    if ordinal:
        position = int(ordinal.group(1)) - 1
        if 0 <= position < len(suggestions):
            candidate = suggestions[position]
            requested = _requested_ordinal_categories(message)
            if not requested or candidate.get("category") in requested:
                return candidate
        requested = _requested_ordinal_categories(message)
        if len(requested) == 1:
            group = next(iter(requested))
            candidates = list((cart_manager.get_checkout_prefs(session_id).get("product_suggestion_snapshots") or {}).get(group) or [])
            local = next((item for item in candidates
                          if int(item.get("group_display_index") or 0) == position + 1), None)
            if local:
                return local
            if 0 <= position < len(candidates):
                return candidates[position]
    exact = [row for row in suggestions if _norm(row.get("product_name")) in text]
    return exact[0] if len(exact) == 1 else None


def _unresolved_product_reference(session_id: str, message: str) -> bool:
    """A demonstrative after a list is not evidence for its final row."""
    prefs = cart_manager.get_checkout_prefs(session_id)
    if len(prefs.get("last_product_suggestions") or []) < 2 or prefs.get("last_product_focus"):
        return False
    if not re.search(r"\b(?:mon|cai|san pham|banh|nuoc)\s+(?:do|nay|kia)\b", _norm(message)):
        return False
    return not (_resolve_suggested_product(session_id, message) or _resolve_structured_references(session_id, message))


def _focus_product(session_id: str, product: Dict[str, Any]) -> None:
    if product.get("product_id") and product.get("product_name"):
        cart_manager.set_checkout_context(session_id, last_product_focus={
            "product_id": product["product_id"],
            "product_name": product["product_name"],
            "category": product.get("category"),
        })


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
    ordinal_matches = sorted((match.start(), category, match) for category, keyword in patterns
                             if (match := re.search(rf"\b{keyword}\s*(?:(?:so|thu|#)\s*)?(\d+)\b", text)))
    for _position, category, match in ordinal_matches:
        candidates = list(snapshots.get(category) or [])
        if match:
            index = int(match.group(1)) - 1
            # A qualified ordinal first means the visible global number when
            # that row belongs to the requested group. Otherwise it means the
            # local number within that group.
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
            local = next((item for item in candidates
                          if int(item.get("group_display_index") or 0) == index + 1), None)
            if local:
                resolved.append(local)
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
    if re.search(r"\b(?:nuoc|do uong)\s*(?:thi\s*)?(?:(?:so|thu|#)\s*)?\d+\b", text):
        requested.add("drink")
    if re.search(r"\b(?:banh|do an)\s*(?:thi\s*)?(?:(?:so|thu|#)\s*)?\d+\b", text):
        requested.add("food")
    return requested


def _incomplete_ordinal_categories(message: str) -> set[str]:
    """Find an explicit category ordinal whose number was omitted."""
    text = _norm(message)
    missing = set()
    for category, names in (("food", r"banh|do an"), ("drink", r"nuoc|do uong")):
        if re.search(rf"\b(?:{names})\s*(?:thi\s*)?(?:so|thu|#)\s*(?=$|va\b|[,;.!?])", text):
            missing.add(category)
    return missing


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
    hold_for_missing_reference: bool = False,
) -> Dict[str, Any]:
    """Prepare exact referenced products when the legacy add helper cannot run.

    This is required for an empty cart: the legacy `_handle_additional_product`
    intentionally only handles additions to an existing cart.
    """
    from src.agents.agent_service import _complete_pending_products_from_options, _parse_option_groups, _pending_option_item
    from src.function_calling.tools.product_tools import execute_get_product_options

    pending: List[Dict[str, Any]] = []
    logs: List[Dict[str, Any]] = []
    reply_lines = [f"Mình đã ghi nhận đủ {len(refs)} món bạn chọn:"]
    needs_options = False
    for index, ref in enumerate(refs):
        if not ref.get("product_id") or not ref.get("product_name"):
            return {"reply": "Mình chưa xác định được món trong menu. Bạn chọn lại tên hoặc số món nhé.",
                    "checkout_payload": None, "tool_calls_log": logs, "error": "product_reference_unresolved"}
        product_name = str(ref.get("product_name") or "").strip()
        option_result = execute_get_product_options(product_name)
        logs.append({"tool": "get_product_options", "args": {"product_name": product_name}, "result": option_result})
        if option_result.get("status") != "ok" or (
            option_result.get("product_id") and str(option_result["product_id"]) != str(ref["product_id"])
        ):
            return {"reply": "Mình chưa xác minh được tùy chọn của món đã chọn. Giỏ hàng chưa thay đổi; bạn chọn lại món nhé.",
                    "checkout_payload": None, "tool_calls_log": logs, "error": "product_reference_unresolved"}
        groups = _parse_option_groups(option_result) if option_result.get("status") == "ok" else {}
        pending_item = _pending_option_item({**ref, "product_name": product_name}, option_result)
        if operation_base:
            pending_item["operation_id"] = f"{operation_base}:add_cart_line:{index}"
        pending.append(pending_item)
        reply_lines.append(f"- {product_name}")
        # A one-value group is a server default, not a question for the user.
        # This matters for mooncakes whose only option is size "Nhỏ": they can
        # be persisted immediately while preserving the requested quantity.
        if any(len(values) > 1 for values in groups.values()):
            needs_options = True
            for name, values in groups.items():
                reply_lines.append(f"  - {name}: {', '.join(str(value) for value in values)}")

    if len(pending) == 1:
        _focus_product(session_id, pending[0])
    elif pending:
        cart_manager.set_checkout_context(session_id, last_product_focus=None)
    all_pending = cart_manager.set_pending_products(session_id, pending, merge=True)
    cart_manager.set_pending_action(session_id, "fill_options", {"count": len(pending)})
    if len(all_pending) > len(pending):
        reply_lines = [f"Mình đang giữ đủ {len(all_pending)} món bạn chọn:"]
        for item in all_pending:
            reply_lines.append(f"- {item['product_name']}")
            for group in item.get("option_schema") or []:
                values = group.get("values") or []
                if len(values) > 1:
                    reply_lines.append(f"  - {group['name']}: {', '.join(map(str, values))}")
    needs_options = needs_options or any(
        len(group.get("values") or []) > 1
        for item in all_pending for group in item.get("option_schema") or []
    )
    if not needs_options and not hold_for_missing_reference:
        completed = _complete_pending_products_from_options(session_id, "theo mặc định")
        if completed:
            completed["tool_calls_log"] = logs + list(completed.get("tool_calls_log") or [])
            return completed
    from src.agents.option_state import option_field
    optional_topping = any(
        option_field(group.get("name")) == "toppings" and not group.get("required")
        for item in all_pending for group in item.get("option_schema") or []
    )
    reply_lines.append("Mình đang giữ đúng các món trên. Bạn có thể chọn tùy chọn muốn thay đổi; các mục không cần chỉnh thì nói ‘theo mặc định’."
                       + (" Topping không bắt buộc." if optional_topping else ""))
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
    refs = _resolve_ask_more_targets(session_id, message)
    if len(refs) != 1:
        return None
    query = str(refs[0]["product_name"])

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


def _voucher_offer_snapshot(session_id: str) -> str:
    cart = cart_manager.get_cart(session_id)
    payload = {key: cart.get(key) for key in ("cart_id", "cart_version", "branch_id", "items")}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def _offer_voucher_gate(session_id: str, lead: str = "Mình đã ghi nhận giỏ hàng đã hoàn tất.") -> Dict[str, Any]:
    """Voucher is a mandatory decision gate before fulfillment and payment."""
    from src.agents.agent_service import _cart_ready_reply
    from src.function_calling.tools.voucher_tools import execute_get_applicable_vouchers

    if cart_manager.get_checkout_prefs(session_id).get("pending_products"):
        return {"reply": "Mình vẫn giữ đủ các món bạn đã chọn. Bạn hoàn tất tùy chọn món đang chờ trước khi xử lý voucher nhé.", "checkout_payload": None, "tool_calls_log": [], "error": None}
    # Finishing the cart opens voucher selection, not checkout. A new explicit
    # request after this decision is required to choose fulfillment/payment.
    cart_manager.set_checkout_context(session_id, checkout_requested=None)
    prefs = cart_manager.get_checkout_prefs(session_id)
    from src.function_calling.tools.cart_tools import execute_get_cart_quote
    if prefs.get("voucher_revalidation_required") and prefs.get("voucher_code"):
        from src.function_calling.tools.voucher_tools import execute_apply_voucher
        checked = execute_apply_voucher(session_id, str(prefs["voucher_code"]))
        if checked.get("status") == "error":
            return {"reply": checked.get("message", "Chưa kiểm tra lại được voucher."),
                    "checkout_payload": None, "tool_calls_log": [{"tool": "apply_voucher", "result": checked}], "error": None}
        if checked.get("status") != "ok":
            old_code = prefs["voucher_code"]
            cart_manager.set_checkout_context(session_id, voucher_code=None,
                discount_amount=None, voucher_decided=None,
                voucher_revalidation_required=None, voucher_invalidated=old_code)
        prefs = cart_manager.get_checkout_prefs(session_id)
    quote = execute_get_cart_quote(session_id)
    if quote.get("status") != "ok":
        return {"reply": quote.get("message", "Chưa xác minh được giỏ hàng."), "checkout_payload": None, "tool_calls_log": [{"tool": "get_cart_quote", "result": quote}], "error": None}
    lead += "\n" + _format_quote(session_id, quote)
    prefs = cart_manager.get_checkout_prefs(session_id)
    if not prefs.get("voucher_revalidation_required") and (prefs.get("voucher_code") or prefs.get("voucher_decided")):
        cart_manager.set_checkout_context(session_id, voucher_decided=True, flow_stage="CART_READY")
        cart_manager.clear_pending_action(session_id)
        return {"reply": _cart_ready_reply(lead), "checkout_payload": None,
                "tool_calls_log": [{"tool": "get_cart_quote", "result": quote}], "error": None}

    listed = execute_get_applicable_vouchers(session_id)
    logs = [{"tool": "get_applicable_vouchers", "result": listed}]
    if listed.get("status") == "error":
        return {"reply": listed.get("message"), "checkout_payload": None, "tool_calls_log": logs, "error": None}
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
            voucher_offer_snapshot=_voucher_offer_snapshot(session_id),
            flow_stage="VOUCHER",
        )
        cart_manager.set_pending_action(session_id, "select_voucher", {"count": len(candidates)})
        lines = [lead, "Trước khi chọn cách nhận hàng và thanh toán, bạn có các mã phù hợp:"]
        for index, item in enumerate(candidates, 1):
            discount = f"{float(item.get('so_tien_giam_du_kien') or 0):,.0f}".replace(",", ".")
            lines.append(f"{index}. {item.get('ten_voucher')} [Mã: {item.get('ma_voucher')}] — giảm dự kiến {discount}đ")
        lines.append("Bạn chọn mã số mấy, chọn mã tốt nhất, hoặc nói bỏ qua mã nhé.")
        return {"reply": "\n".join(lines), "checkout_payload": None, "tool_calls_log": logs, "error": None}

    cart_manager.set_checkout_context(session_id, voucher_decided=True, voucher_offer_pending=None, flow_stage="CART_READY")
    cart_manager.clear_pending_action(session_id)
    return {
        "reply": _cart_ready_reply(f"{lead} Hiện không có mã giảm giá phù hợp."),
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
        matches = [_clean_option_text(value) for value in values
                   if _norm(_clean_option_text(value)) and _norm(_clean_option_text(value)) in text]
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
    from src.function_calling.tools.cart_tools import is_authenticated_cart_session, sync_authoritative_cart
    authenticated = is_authenticated_cart_session(state["session_id"])
    try:
        cart = sync_authoritative_cart(state["session_id"])
        if authenticated and not cart.get("authoritative"):
            raise RuntimeError("authenticated cart sync was not authoritative")
        return {**state, "cart": cart, "cart_sync_status": str(cart.get("cart_sync_status") or "ok")}
    except Exception as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        sync_status = "unavailable" if authenticated else "guest_draft"
        logger.warning(
            "authoritative cart sync failed type=%s http_status=%s service=order-service "
            "path=/cart/<customer> cart_sync_status=%s",
            type(exc).__name__, status, sync_status,
        )
        # Preserve a cache only for diagnostic/UI context. It is never treated
        # as truth and write nodes below explicitly refuse to mutate it.
        cached = cart_manager.get_cart(state["session_id"])
        cart = {
            **cached,
            "authoritative": False,
            "cart_sync_status": sync_status,
            "stale_snapshot": authenticated,
            "sync_error": type(exc).__name__,
        }
        return {**state, "cart": cart, "cart_sync_status": cart["cart_sync_status"]}


def _handle_pending_reply(state: OrderConversationState) -> Dict[str, Any]:
    """Only deterministic handlers can advance a persisted pending decision."""
    session_id, message, intent = state["session_id"], state["user_message"], state["intent"]
    pending_type, decision = intent.get("pending_type"), intent.get("decision")
    prefs = cart_manager.get_checkout_prefs(session_id)

    def reply(text):
        return {"reply": text, "checkout_payload": None, "tool_calls_log": [], "error": None}

    if intent.get("intent") == "PENDING_BRANCH":
        from src.agents.agent_service import (
            _advance_checkout_if_ready, _literal_address_from_message,
            _resolve_pending_branch_choice, _run_agent_impl,
        )
        resolved = _resolve_pending_branch_choice(session_id, message, history=state.get("history") or [])
        if resolved:
            return _advance_checkout_if_ready(session_id, resolved)
        from src.agents.location_parser import parse_location
        location = parse_location(message)
        if location.kind in {"address", "area"} or (
            location.kind == "branch_query" and location.value
            and not re.search(r"\b(?:số|thứ)\s*\d+\b", message, re.IGNORECASE)
        ):
            cart_manager.clear_branch(session_id)
            cart_manager.clear_pending_action(session_id)
            return _handle_location_request(state)
        count = len(prefs.get("branch_candidates") or [])
        return reply(f"Bạn chọn cửa hàng theo số từ 1 đến {count}, hoặc gửi địa chỉ mới có số nhà, tên đường và khu vực nhé.")
    if pending_type == "confirm_address":
        from src.agents.agent_service import _literal_address_from_message, _run_agent_impl
        if _literal_address_from_message(message):
            return _run_agent_impl(session_id, message, history=state.get("history") or [], allow_model_mutations=False)
    if pending_type == "select_voucher":
        if decision == "SKIP_VOUCHER":
            from src.agents.agent_service import _cart_ready_reply
            cart_manager.set_checkout_context(session_id, voucher_decided=True, voucher_offer_pending=None,
                voucher_candidates=None, voucher_code=None, discount_amount=None, checkout_requested=None, flow_stage="CART_READY")
            cart_manager.clear_pending_action(session_id)
            return reply(_cart_ready_reply("Mình sẽ không áp dụng mã giảm giá cho giỏ này."))
        if decision == "SELECT_VOUCHER":
            from src.agents.agent_service import _resolve_pending_voucher_choice
            resolved = _resolve_pending_voucher_choice(session_id, message)
            if resolved:
                return resolved
            if not prefs.get("voucher_candidates"):
                return _offer_voucher_gate(session_id)
        return reply("Bạn chọn mã theo số trong danh sách, hoặc nói bỏ qua voucher nhé.")
    if pending_type == "confirm_address":
        if decision == "CHANGE_ADDRESS":
            cart_manager.clear_branch(session_id)
            cart_manager.set_checkout_context(session_id, suggested_address=None, location_address=None,
                delivery_address=None, address_confirmed=None, address_change_requested=True)
            cart_manager.clear_pending_action(session_id)
            return reply("Bạn gửi địa chỉ mới muốn dùng nhé.")
        if decision == "CONFIRM_ADDRESS":
            from src.agents.agent_service import _advance_checkout_if_ready, _confirm_saved_location
            resolved = _confirm_saved_location(session_id, "đúng địa chỉ đó", history=state.get("history") or [])
            if resolved:
                return _advance_checkout_if_ready(session_id, resolved)
        return reply("Bạn muốn dùng địa chỉ đã lưu hay đổi sang địa chỉ khác?")
    if pending_type == "confirm_checkout":
        if decision == "CONFIRM":
            from src.function_calling.tools.cart_tools import execute_confirm_checkout
            result = (execute_confirm_checkout(session_id, action_id=prefs.get("completed_action_id"))
                      if prefs.get("completed_order_id") else execute_confirm_checkout(session_id))
            text = result.get("message", "Đơn chưa được tạo. Bạn thử xác nhận lại nhé.")
            if result.get("status") in {"success", "already_processed"}:
                text = f"🎉 Đặt hàng thành công! Mã đơn hàng của bạn là: **{result.get('order_id', '')}**. Cảm ơn bạn đã ủng hộ!"
            return {**reply(text), "gate": "confirm_checkout", "tool_calls_log": [{"tool": "confirm_checkout", "result": result}]}
        if decision == "REJECT":
            if prefs.get("checkout_submission"):
                return reply("Đơn đã gửi xử lý. Bạn xác nhận lại để kiểm tra kết quả trước khi chỉnh sửa nhé.")
            cart_manager.set_checkout_context(session_id, summary_fingerprint=None, checkout_action_id=None,
                summary_amounts=None, checkout_requested=None, flow_stage="CART_READY")
            cart_manager.clear_pending_action(session_id)
            return reply("Mình chưa đặt đơn. Bạn muốn chỉnh món, voucher, cách nhận hàng hay thanh toán?")
        return reply("Bạn muốn xác nhận đặt đơn này hay muốn chỉnh sửa?")
    if pending_type == "fill_options":
        return reply("Bạn chọn tùy chọn cho các món đang chờ trước nhé.")
    return reply("Bạn muốn thêm món hay hoàn tất giỏ hiện tại?")


def _handle_location_reference(state: OrderConversationState, kind: str) -> Dict[str, Any]:
    """The saved-address context owns deictic turns; no placeholder is geocoded."""
    from src.agents.agent_service import _advance_checkout_if_ready, _confirm_saved_location
    from src.function_calling.tools.user_tools import _clean_profile_address

    session_id = state["session_id"]
    prefs = cart_manager.get_checkout_prefs(session_id)
    if prefs.get("checkout_submission"):
        return {"reply": "Đơn đang được gửi xử lý. Bạn xác nhận lại để kiểm tra kết quả trước khi đổi địa chỉ nhé.",
                "checkout_payload": None, "tool_calls_log": [], "error": None}
    suggested = _clean_profile_address(prefs.get("suggested_address"))
    active = bool(prefs.get("checkout_requested") and suggested and
                  not (state.get("cart") or cart_manager.get_cart(session_id)).get("branch_id"))
    def reply(message):
        return {"reply": message, "checkout_payload": None, "tool_calls_log": [], "error": None}

    if kind == "reference_question":
        return reply(f"Địa chỉ đang được đề xuất là: {suggested}" if active else
                     "Mình chưa có địa chỉ nào đang được tham chiếu. Bạn cho mình khu vực hoặc địa chỉ nhé.")
    if kind == "change_reference":
        if not active:
            return reply("Mình chưa có địa chỉ nào đang được tham chiếu. Bạn cho mình khu vực hoặc địa chỉ nhé.")
        cart_manager.clear_branch(session_id)
        cart_manager.set_checkout_context(session_id, suggested_address=None, location_address=None,
            delivery_address=None, address_confirmed=None, branch_candidates=None,
            address_change_requested=True, partial_delivery_address=None,
            summary_amounts=None, checkout_action_id=None, checkout_action_expires_at=None)
        if (cart_manager.get_pending_action(session_id) or {}).get("type") == "confirm_address":
            cart_manager.clear_pending_action(session_id)
        return reply("Bạn gửi địa chỉ giao đầy đủ mới nhé." if prefs.get("delivery_type") == "GIAO_TAN_NOI" else
                     "Bạn cho mình khu vực hoặc địa chỉ mới để tìm cửa hàng gần nhất nhé.")
    if not active:
        return reply("Mình chưa có địa chỉ nào đang được tham chiếu. Bạn cho mình khu vực hoặc địa chỉ nhé.")
    resolved = _confirm_saved_location(session_id, "đúng địa chỉ đó", history=state.get("history") or [])
    return _advance_checkout_if_ready(session_id, resolved) if resolved else reply(
        "Mình chưa xác định được địa chỉ đã lưu. Bạn thử lại hoặc cho mình khu vực khác nhé.")


def _handle_location_request(state: OrderConversationState) -> Dict[str, Any]:
    """Keep location and store turns inside the deterministic branch boundary."""
    from src.agents.location_parser import parse_location, complete_partial_delivery_address
    from src.agents.agent_service import _advance_checkout_if_ready, _confirm_saved_location
    from src.function_calling.tools.branch_tools import execute_find_nearest_branch

    session_id = state["session_id"]
    parsed = parse_location(state["user_message"])
    if parsed.kind in {"reference", "reference_question", "change_reference"}:
        return _handle_location_reference(state, parsed.kind)
    prefs = cart_manager.get_checkout_prefs(session_id)
    logger.debug("routing route=LOCATION_QUERY target_source=location location_kind=%s", parsed.kind)

    def reply(message, logs=None):
        return {"reply": message, "checkout_payload": None, "tool_calls_log": logs or [], "error": None}

    if prefs.get("checkout_submission"):
        return reply("Đơn đang được gửi xử lý. Bạn xác nhận lại để kiểm tra kết quả trước khi đổi địa chỉ nhé.")
    if prefs.get("delivery_type") == "GIAO_TAN_NOI" and prefs.get("partial_delivery_address"):
        completed = complete_partial_delivery_address(prefs["partial_delivery_address"], state["user_message"])
        if completed:
            parsed = completed
        elif parsed.kind == "area":
            parsed = parse_location(f"{prefs['partial_delivery_address']}, {parsed.value}")
    if parsed.kind == "address" and prefs.get("delivery_type") == "GIAO_TAN_NOI" and parsed.missing:
        cart_manager.clear_branch(session_id)
        cart_manager.set_checkout_context(session_id, suggested_address=None,
            partial_delivery_address=parsed.value, branch_candidates=None,
            address_confirmed=None, delivery_address=None,
            summary_amounts=None, checkout_action_id=None, checkout_action_expires_at=None)
        return reply(f"Mình đã nhận được {parsed.value}. Bạn cho mình thêm {', '.join(parsed.missing)} để xác định chính xác địa chỉ giao nhé.")
    if prefs.get("checkout_requested") and prefs.get("delivery_type") == "GIAO_TAN_NOI" and parsed.kind != "address":
        missing = parse_location(prefs.get("partial_delivery_address") or "").missing
        return reply("Bạn bổ sung " + ", ".join(missing) + " cho địa chỉ giao nhé." if missing else
                     "Để giao tận nơi, bạn cho mình số nhà, tên đường, phường/xã và tỉnh/thành phố nhé.")

    location = parsed.value or prefs.get("location_address") or ""
    if not location and prefs.get("suggested_address"):
        return reply(f"Bạn đang ở địa chỉ đã lưu {prefs['suggested_address']} hay muốn dùng địa chỉ khác để tìm cửa hàng?")
    if not location:
        return reply("Bạn cho mình biết phường/quận và tỉnh/thành phố đang ở để tìm cửa hàng gần nhất nhé.")

    if prefs.get("checkout_requested"):
        # A new location in a saved-address prompt replaces that suggestion in
        # the same turn; the existing resolver still owns inventory and branch rules.
        cart_manager.clear_branch(session_id)
        cart_manager.set_checkout_context(session_id, branch_candidates=None, suggested_address=location,
            location_address=None, address_confirmed=None, delivery_address=None,
            address_change_requested=None, partial_delivery_address=None,
            summary_amounts=None, checkout_action_id=None, checkout_action_expires_at=None)
        result = _confirm_saved_location(session_id, "đúng địa chỉ đó", history=state.get("history") or [])
        return _advance_checkout_if_ready(session_id, result) if result else reply("Mình chưa xác định được vị trí trên bản đồ. Bạn kiểm tra lại số nhà, tên đường, phường/xã và tỉnh/thành phố nhé.")

    # An informational lookup must not write branch candidates into a previous
    # cart draft simply because it still has an old fulfillment preference.
    found = execute_find_nearest_branch(location=location, session_id="")
    logs = [{"tool": "find_nearest_branch", "result": found}]
    branches = found.get("branches") or []
    if branches:
        lines = [f"Các cửa hàng gần {location}:"]
        for index, branch in enumerate(branches[:5], 1):
            distance = (f" ({branch['khoang_cach_km']} km đường chim bay)"
                        if branch.get("khoang_cach_km") is not None else "")
            lines.append(f"{index}. {branch.get('ten_chi_nhanh')} — {branch.get('dia_chi') or 'chưa có địa chỉ'}{distance}")
        return reply("\n".join(lines), logs)
    if found.get("status") == "not_found":
        return reply("Mình chưa xác định được khu vực này trên bản đồ. Bạn kiểm tra lại phường/xã và tỉnh/thành phố nhé.", logs)
    return reply(found.get("message") or "Mình chưa tìm được cửa hàng lúc này. Bạn thử lại nhé.", logs)


def _load_active_product_targets() -> List[Dict[str, Any]]:
    """Read identity only; generic shopping text is never an exact-price query."""
    import os
    from sqlalchemy import text
    from src.function_calling.helpers import _get_engine

    schema = os.getenv("MENU_SCHEMA", "menu")
    try:
        with _get_engine().connect() as conn:
            rows = conn.execute(text(f"""
                SELECT sp.ma_san_pham::text, sp.ten_san_pham, dm.ten_danh_muc, parent.ten_danh_muc
                FROM {schema}.san_pham sp
                LEFT JOIN {schema}.danh_muc dm ON dm.ma_danh_muc = sp.ma_danh_muc
                LEFT JOIN {schema}.danh_muc parent ON parent.ma_danh_muc = dm.ma_danh_muc_cha
                WHERE sp.trang_thai = TRUE
            """)).fetchall()
        return [{"product_id": row[0], "product_name": row[1],
                 "category": _map_db_category_to_bucket(row[2], row[3])} for row in rows]
    except Exception:
        return []


def _resolve_ask_more_targets(session_id: str, message: str) -> List[Dict[str, Any]]:
    """Accept tool-written references or canonical catalog identities, never a verb tail."""
    message = re.sub(r"\s+", " ", message).strip()
    refs = _resolve_structured_references(session_id, message) or []
    requested = _requested_ordinal_categories(message)
    if requested and not requested.issubset({ref.get("category") for ref in refs}):
        return []
    if not refs:
        suggested = _resolve_suggested_product(session_id, message)
        product_clause = re.split(r"\b(?:so luong|sl)\b", _norm(message), maxsplit=1)[0]
        ordinal = re.search(r"\b(?:so|thu|#)\s*\d+\b|\b(?:mon|banh|nuoc|do uong|san pham)\s+(?:(?:[a-z]{1,3}|#)\s+)?\d+\b", product_clause)
        name = _norm((suggested or {}).get("product_name")).strip()
        if suggested and (ordinal or (name and re.search(r"(?<!\w)" + re.escape(name) + r"(?!\w)", _norm(message)))):
            refs = [suggested]
    if not refs and not requested:
        prefs = cart_manager.get_checkout_prefs(session_id)
        named_snapshot = [item for rows in (prefs.get("product_suggestion_snapshots") or {}).values()
                          for item in rows if item.get("product_id") and item.get("product_name")
                          and re.search(r"(?<!\w)" + re.escape(_norm(item["product_name"])) + r"(?!\w)", _norm(message))]
        if len({str(item["product_id"]) for item in named_snapshot}) == 1:
            refs = [named_snapshot[0]]
        if not refs:
            focus = prefs.get("last_product_focus") or {}
            normalized = _norm(message)
            add_followup = re.search(r"\b(?:them|lay)\s+cho\s+(?:toi|minh)\b", normalized)
            if add_followup and focus.get("product_id") and focus.get("product_name"):
                tail = normalized[add_followup.end():]
                tail = re.sub(r"\b(?:di|nhe|nha|voi|vao|gio|hang|so luong|sl|cai|ly|phan)\b|\d+", " ", tail)
                if not tail.strip():
                    refs = [focus]
    if requested and not requested.issubset({ref.get("category") for ref in refs}):
        return []
    refs = [ref for ref in refs if ref.get("product_id") and str(ref.get("product_name") or "").strip()]
    if refs:
        if re.search(r"\b(?:so|thu|#)\s*\d+\b|\b(?:mon|banh|nuoc)\s+[a-z]{1,3}\s+\d+\b", _norm(message)):
            logger.debug("routing route=ADD_ITEM operation=ADD target_source=recommendation_ordinal candidate_count=%d", len(refs))
        return refs
    from src.agents.pending_context import has_shopping_topic
    if not has_shopping_topic(message):
        return []
    normalized = _norm(message)
    # A failed ordinal cannot be reinterpreted as a catalog product id/name.
    product_clause = re.split(r"\b(?:so luong|sl)\b", normalized, maxsplit=1)[0]
    if re.search(r"\b(?:so|thu|#)\s*\d+\b|\b(?:mon|banh|nuoc|do uong|san pham)\s+(?:(?:[a-z]{1,3}|#)\s+)?\d+\b", product_clause):
        return []
    matched = []
    for product in _load_active_product_targets():
        name = _norm(product.get("product_name")).strip()
        pid = str(product.get("product_id") or "").strip()
        named = name and re.search(r"(?<!\w)" + re.escape(name) + r"(?!\w)", normalized)
        identified = pid and re.search(r"\b(?:product id|ma san pham|id)\s*[:#]?\s*" + re.escape(pid.lower()) + r"(?!\w)", normalized)
        if pid and name and (named or identified):
            matched.append(product)
    # Prefer full names over their shorter catalog prefixes.
    return [ref for ref in matched if not any(
        ref is not other and _norm(ref["product_name"]) in _norm(other["product_name"])
        and len(ref["product_name"]) < len(other["product_name"]) for other in matched
    )]


def _resolve_focused_add_target(session_id: str, message: str) -> Optional[Dict[str, Any]]:
    """Resolve an elliptical add only against a previously focused canonical item."""
    focus = cart_manager.get_checkout_prefs(session_id).get("last_product_focus") or {}
    if not focus.get("product_id") or not focus.get("product_name"):
        return None
    text = _norm(message)
    action = re.search(r"\b(?:them|lay|mua|chon|dat)\b", text)
    if not action or re.search(r"\b(?:xem|goi y|tim)\s+them\b", text):
        return None
    if re.search(r"\bđồ\b", message.lower()):
        return None
    tail = text[action.end():]
    refers_back = bool(re.search(r"\b(?:luon|nay|kia|vua noi|vua xem)\b|\bvao gio\b", tail)
                       or re.search(r"\bđó\b", message.lower()))
    if not refers_back:
        return None
    remaining = re.sub(
        r"\b(?:luon|mon|cai|san pham|nay|do|kia|vua|noi|xem|vao|gio|cho|toi|minh|di|nhe|nha|voi|a|oi|the|vay|cung|duoc|oke|ok|roi)\b",
        " ", tail,
    )
    if remaining.strip():
        return None
    return focus


def _category_search_message(message: str) -> Optional[str]:
    """Locate a menu family within a shopping sentence; use the existing catalog parser."""
    if _menu_search_specs(message):
        return message
    normalized = _norm(message)
    if not re.search(r"\b(?:them|mua|lay|chon)\b", normalized):
        return None
    category = re.search(r"\b(?:banh|do an|nuoc|do uong|ca phe|tra|matcha|pizza|pasta)\b", normalized)
    if not category:
        return None
    candidate = normalized[category.start():]
    return candidate if _menu_search_specs(candidate) else None


def _shopping_decision(state: OrderConversationState, tier1_intent: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """One evidence-based shopping route for pending and ordinary turns."""
    from src.agents.pending_context import classify_pending_reply, looks_like_catalog_query
    message, session_id = state["user_message"], state["session_id"]
    refs = _resolve_ask_more_targets(session_id, message)
    if not refs:
        focused = _resolve_focused_add_target(session_id, message)
        refs = [focused] if focused else []
    category_query = _category_search_message(message)
    question = bool(re.search(r"\b(?:co|xem|tim|goi y|menu|thuc don)\b", _norm(message)))
    if category_query and (question or not refs):
        return {"intent": "BROWSING", "semantic_intent": "BROWSE_CATEGORY",
                "target_kind": "CATEGORY", "category_query": category_query}
    evidence = {"has_resolved_product_target": bool(refs),
                "has_resolved_ordinal": bool(refs and re.search(r"\b(?:so|thu|#)\s*\d+\b", _norm(message))),
                "looks_like_catalog_query": looks_like_catalog_query(message)}
    decision = classify_pending_reply(message, "ask_more_items", evidence)
    if refs and tier1_intent.get("intent") == "ADD_ITEM" and decision != "BROWSING_REQUEST":
        decision = "CONCRETE_ADD"
    if decision == "CONCRETE_ADD" and refs:
        return {"intent": "ADD_ITEM", "semantic_intent": "ADD_CONCRETE_PRODUCT",
                "target_kind": "ORDINAL" if evidence["has_resolved_ordinal"] else "PRODUCT",
                "resolved_products": refs, "quantity": _extract_add_quantity(message)}
    if decision == "DONE" and tier1_intent.get("intent") == "FINISH_CART":
        return {"intent": "FINISH_CART", "semantic_intent": "FINISH_CART", "target_kind": "NONE"}
    if decision == "BROWSING_REQUEST" or category_query:
        return {"intent": "BROWSING", "semantic_intent": "BROWSE_QUERY", "target_kind": "CATEGORY" if category_query else "NONE",
                "category_query": category_query}
    if decision == "WANT_MORE_GENERIC":
        return {"intent": "SHOPPING_GENERIC", "semantic_intent": "WANT_MORE_GENERIC", "target_kind": "NONE"}
    if tier1_intent.get("intent") == "ADD_ITEM":
        return {"intent": "SHOPPING_CLARIFY", "semantic_intent": "AMBIGUOUS", "target_kind": "NONE"}
    return None


def _browse_ask_more(state: OrderConversationState) -> Dict[str, Any]:
    """Use the existing catalog/provider with a strictly read-only tool boundary."""
    constraints = parse_catalog_constraints(state["user_message"])
    if constraints:
        from src.function_calling.tools.product_tools import execute_filter_catalog
        from src.agents.catalog_constraints import describe_catalog_constraint
        found = execute_filter_catalog(**constraints)
        relation = describe_catalog_constraint(constraints)
        group = "topping" if constraints["sellable_scope"] == "topping" else "món"
        return {"reply": found.get("message") if found.get("status") == "error" else
                f"Hiện không có {group} nào {relation}." if found.get("status") == "not_found" else
                "Mình tìm thấy các món phù hợp trong menu:",
                "checkout_payload": None, "tool_calls_log": [{"tool": "filter_catalog", "args": constraints, "result": found}], "error": None}
    result = _search_menu_catalog(state["user_message"])
    if result:
        return result
    from src.agents.agent_service import _build_messages, groq_agent_chat
    from src.function_calling.tools import ALL_TOOL_SCHEMAS, TOOL_EXECUTORS

    allowed = {"get_recommendations", "get_product_insights"}
    messages = _build_messages(session_id=state["session_id"], history=state.get("history") or [], user_message=state["user_message"])
    messages.insert(1, {"role": "system", "content": (
        "This turn is browsing only. Answer the original menu/product question using catalog tools. "
        "Do not add items, look up exact prices from generic text, offer checkout, or claim cart changes."
    )})
    result = groq_agent_chat(messages=messages,
        tools=[schema for schema in ALL_TOOL_SCHEMAS if schema.get("function", {}).get("name") in allowed],
        tool_executors={name: executor for name, executor in TOOL_EXECUTORS.items() if name in allowed},
        session_id=state["session_id"], max_tool_rounds=3, max_tokens=800)
    result["checkout_payload"] = None
    if not result.get("reply") or re.search(r"\b(tom tat don|tong thanh toan|xac nhan.*(?:dat|don)|chot don)\b", _norm(result["reply"])):
        result["reply"] = "Bạn muốn xem thêm đồ uống hay bánh? Mình sẽ tìm món phù hợp trong menu."
    return result


def _understand(state: OrderConversationState) -> OrderConversationState:
    selected_id = str(state.get("selected_product_id") or "").strip()
    if selected_id:
        # The card supplies an identity hint, never business data. Resolve it
        # again against the active catalog before the normal options flow.
        canonical = next((product for product in _load_active_product_targets()
                          if str(product["product_id"]) == selected_id), None)
        if not canonical:
            return {**state, "intent": {"intent": "PRODUCT_CLARIFY"}}
        return {**state, "intent": {"intent": "ADD_ITEM", "resolved_products": [canonical], "quantity": 1}}
    active_pending = cart_manager.get_pending_action(state["session_id"])
    catalog_constraints = (None if active_pending and active_pending.get("type") != "ask_more_items"
                           else parse_catalog_constraints(state["user_message"]))
    if catalog_constraints:
        pending_catalog = active_pending and active_pending.get("type") == "ask_more_items"
        return {**state, "intent": {"intent": "BROWSING", "catalog_constraints": catalog_constraints,
                                   **({"pending_type": "ask_more_items", "pending_decision": "BROWSING_REQUEST"}
                                      if pending_catalog else {})}}
    staged = list(cart_manager.get_checkout_prefs(state["session_id"]).get("pending_products") or [])
    if staged and any(not str(item.get("product_id") or "").strip() for item in staged):
        valid = cart_manager.set_pending_products(state["session_id"], staged)
        if not valid and (cart_manager.get_pending_action(state["session_id"]) or {}).get("type") == "fill_options":
            cart_manager.clear_pending_action(state["session_id"])
    pending = cart_manager.get_pending_action(state["session_id"])
    from src.agents.checkout_choices import CHECKOUT_CHOICE_TYPES, FULFILLMENT_OPTIONS, PAYMENT_OPTIONS, pending_checkout_choice
    pending_type = (pending or {}).get("type")
    prefs_before = cart_manager.get_checkout_prefs(state["session_id"])
    if not pending_type and prefs_before.get("checkout_requested") and not prefs_before.get("checkout_submission"):
        missing_delivery = not prefs_before.get("delivery_type")
        missing_payment = not prefs_before.get("payment_method")
        if missing_delivery or missing_payment:
            pending_type = ("select_checkout_choices" if missing_delivery and missing_payment else
                            "select_fulfillment" if missing_delivery else "select_payment")
            cart_manager.set_pending_action(state["session_id"], pending_type, {
                "fulfillment_options": list(FULFILLMENT_OPTIONS) if missing_delivery else [],
                "payment_options": list(PAYMENT_OPTIONS) if missing_payment else [],
            })
            pending = cart_manager.get_pending_action(state["session_id"])
    if pending_type in CHECKOUT_CHOICE_TYPES:
        checkout_patch = pending_checkout_choice(pending_type, state["user_message"])
        if checkout_patch is not None:
            if checkout_patch:
                return {**state, "intent": {"intent": "SELECT_PAYMENT" if "payment_method" in checkout_patch else "SELECT_FULFILLMENT",
                                          "target_kind": "NONE", "checkout_patch": checkout_patch}}
            return {**state, "intent": {"intent": "PENDING_CHECKOUT_CHOICE", "pending_type": pending_type}}
        # Text choices belong to the same pending gate as numbered choices.
        # Resolve both fields before general intent and catalog routing.
        from src.agents.agent_service import _explicit_checkout_choices
        checkout_patch = _explicit_checkout_choices(state["user_message"])
        if checkout_patch:
            return {**state, "intent": {"intent": "SELECT_FULFILLMENT" if "delivery_type" in checkout_patch else "SELECT_PAYMENT",
                                       "target_kind": "NONE", "checkout_patch": checkout_patch}}
    intent = classify_order_intent(state["user_message"], (pending or {}).get("type"))
    plain_intent = classify_order_intent(state["user_message"], None)
    if (pending or {}).get("type") and plain_intent.get("intent") in {
        "CLEAR_CART", "REMOVE_ITEM", "SET_QUANTITY", "VIEW_CART",
        "START_CHECKOUT", "SELECT_FULFILLMENT", "SELECT_PAYMENT", "SELECT_VOUCHER",
    }:
        intent = plain_intent
    if intent.get("intent") in {"SELECT_FULFILLMENT", "SELECT_PAYMENT"}:
        from src.agents.agent_service import _explicit_checkout_choices
        intent = {**intent, "checkout_patch": _explicit_checkout_choices(state["user_message"])}
    if (pending or {}).get("type") == "cart_line_choice":
        # A pending line choice is context. Explicit new commands supersede it;
        # an ordinal/name-only reply resumes the stored operation.
        resumed = _resolve_pending_cart_line(state["session_id"], state["user_message"], state.get("cart") or {})
        if resumed and intent.get("intent") not in {
            "SET_QUANTITY", "REMOVE_ITEM", "EDIT_OPTIONS", "CLEAR_CART", "START_CHECKOUT",
            "SELECT_FULFILLMENT", "SELECT_PAYMENT", "ADD_ITEM", "BROWSING", "LOCATION_QUERY",
        }:
            return {**state, "intent": {"intent": "PENDING_CART_LINE", "resolved_pending": resumed}}
        if resumed and re.fullmatch(r"\s*(?:(?:dòng|món|số|thứ|#)\s*)?\d+\s*[.!]?\s*", state["user_message"], re.IGNORECASE):
            return {**state, "intent": {"intent": "PENDING_CART_LINE", "resolved_pending": resumed}}
        if intent.get("intent") not in {"UNKNOWN", "PENDING_REPLY"}:
            cart_manager.clear_pending_action(state["session_id"])
    if intent.get("intent") == "FILL_OPTIONS":
        return {**state, "intent": intent}
    if (pending or {}).get("type") == "fill_options" and intent.get("intent") not in {
        "CLEAR_CART", "REMOVE_ITEM", "SET_QUANTITY", "VIEW_CART", "START_CHECKOUT",
        "SELECT_FULFILLMENT", "SELECT_PAYMENT", "SELECT_VOUCHER",
    }:
        from src.agents.option_state import mentions_pending_option_value
        if mentions_pending_option_value(state["user_message"],
                                         cart_manager.get_checkout_prefs(state["session_id"]).get("pending_products") or []):
            return {**state, "intent": {"intent": "FILL_OPTIONS"}}
    from src.agents.location_parser import parse_location, complete_partial_delivery_address
    location = parse_location(state["user_message"])
    from src.agents.pending_context import classify_pending_reply
    prefs = cart_manager.get_checkout_prefs(state["session_id"])
    if (prefs.get("delivery_type") == "GIAO_TAN_NOI" and prefs.get("partial_delivery_address")
            and complete_partial_delivery_address(prefs["partial_delivery_address"], state["user_message"])):
        return {**state, "intent": {"intent": "LOCATION_QUERY", "location_kind": "address"}}
    incomplete = _incomplete_ordinal_categories(state["user_message"])
    pending_reference = set(prefs.get("pending_product_reference") or [])
    if incomplete or pending_reference:
        reference_message = state["user_message"]
        if len(pending_reference) == 1 and re.fullmatch(r"\s*(?:số|thứ|#)?\s*\d+\s*[.!]?\s*", reference_message, re.IGNORECASE):
            category = next(iter(pending_reference))
            reference_message = ("bánh số " if category == "food" else "nước số ") + re.search(r"\d+", reference_message).group()
        refs = _resolve_all_category_ordinals(state["session_id"], reference_message, state.get("history") or []) or []
        resolved_categories = {ref.get("category") for ref in refs if ref.get("product_id")}
        still_missing = (pending_reference | incomplete) - resolved_categories
        if incomplete or pending_reference:
            return {**state, "intent": {"intent": "PRODUCT_REFERENCE_PARTIAL",
                                        "resolved_products": refs, "missing_categories": sorted(still_missing)}}
    pending_type = (pending or {}).get("type")
    if prefs.get("checkout_requested") and not prefs.get("checkout_submission"):
        from src.agents.agent_service import _explicit_checkout_choices
        choices = _explicit_checkout_choices(state["user_message"])
        if choices:
            return {**state, "intent": {"intent": "SELECT_FULFILLMENT" if choices.get("delivery_type") else "SELECT_PAYMENT",
                                        "target_kind": "NONE", "checkout_patch": choices}}
    if prefs.get("checkout_submission"):
        pending_type = "confirm_checkout"
    if not pending_type:
        if prefs.get("summary_fingerprint") or prefs.get("checkout_submission"):
            pending_type = "confirm_checkout"
        elif prefs.get("voucher_offer_pending"):
            pending_type = "select_voucher"
        elif prefs.get("suggested_address") and prefs.get("checkout_requested"):
            pending_type = "confirm_address"
    # Branch ordinals own their pending list. A genuine new address can still
    # replace it; all other location turns route before shopping/model logic.
    if pending_type == "select_branch":
        return {**state, "intent": {"intent": "PENDING_BRANCH", "location_kind": location.kind}}
    if location.kind in {"reference", "reference_question", "change_reference"}:
        return {**state, "intent": {"intent": "LOCATION_REFERENCE", "location_kind": location.kind}}
    if location.kind == "branch_query" or (
        location.kind in {"address", "area"}
        and (prefs.get("checkout_requested") or pending_type == "confirm_address")
    ):
        return {**state, "intent": {"intent": "LOCATION_QUERY", "location_kind": location.kind}}
    if intent.get("intent") == "BROWSING" and not re.search(r"\b(?:co|xem|tim|goi y|menu|gia|the nao|khong)\b", _norm(state["user_message"])):
        named_rows = _cart_rows_named_in_message(state.get("cart") or {}, state["user_message"])
        if len(named_rows) == 1:
            return {**state, "intent": {"intent": "CART_TARGET_CLARIFY", "cart_row": named_rows[0]}}
    if _unresolved_product_reference(state["session_id"], state["user_message"]):
        return {**state, "intent": {"intent": "PRODUCT_CLARIFY"}}
    # Explicit cart edits keep their existing deterministic handlers; the
    # pending decision must not swallow a request to change the actual cart.
    if not prefs.get("checkout_submission") and pending_type in {"ask_more_items", "select_voucher", "confirm_checkout"} and intent.get("intent") in {"SET_QUANTITY", "REMOVE_ITEM", "EDIT_OPTIONS", "CLEAR_CART"}:
        return {**state, "intent": intent}
    if pending_type == "ask_more_items":
        if intent.get("intent") == "VIEW_CART":
            return {**state, "intent": intent}
        from src.agents.pending_context import looks_like_catalog_query
        refs = _resolve_ask_more_targets(state["session_id"], state["user_message"])
        if not refs:
            focused = _resolve_focused_add_target(state["session_id"], state["user_message"])
            refs = [focused] if focused else []
        evidence = {"has_resolved_product_target": bool(refs),
                    "has_resolved_ordinal": bool(refs and re.search(r"\b(?:so|thu|#)\s*\d+\b", _norm(state["user_message"]))),
                    "looks_like_catalog_query": looks_like_catalog_query(state["user_message"])}
        decision = classify_pending_reply(state["user_message"], pending_type, evidence)
        if decision == "CONCRETE_ADD" and not refs:
            decision = "WANT_MORE_GENERIC"
        kind = {"DONE": "FINISH_CART", "CONCRETE_ADD": "ADD_ITEM",
                "WANT_MORE_GENERIC": "BROWSING", "BROWSING_REQUEST": "BROWSING"}.get(decision, "PENDING_AMBIGUOUS")
        return {**state, "intent": {"intent": kind, "pending_type": pending_type,
                "pending_decision": decision, "resolved_products": refs,
                "quantity": _extract_add_quantity(state["user_message"])}}
    if pending_type == "select_voucher" and not _category_search_message(state["user_message"]):
        voucher_decision = classify_pending_reply(state["user_message"], pending_type)
        if voucher_decision in {"SELECT_VOUCHER", "SKIP_VOUCHER"}:
            return {**state, "intent": {"intent": "PENDING_REPLY", "pending_type": pending_type,
                                        "decision": voucher_decision}}
    if pending_type == "confirm_checkout":
        from src.agents.pending_context import is_continue_turn
        if is_continue_turn(state["user_message"]) and not prefs.get("checkout_submission"):
            return {**state, "intent": {"intent": "REVIEW_CHECKOUT_SUMMARY", "target_kind": "NONE"}}
        checkout_decision = classify_pending_reply(state["user_message"], pending_type)
        if checkout_decision == "CONFIRM":
            return {**state, "intent": {"intent": "PENDING_REPLY", "pending_type": pending_type,
                                        "decision": checkout_decision}}
    # Pending decisions are context. A clear shopping request can change course
    # without answering the old voucher/summary question.
    if pending_type in {"select_voucher", "confirm_checkout"} and not prefs.get("checkout_submission"):
        shopping = _shopping_decision(state, intent) if intent.get("intent") in {"ADD_ITEM", "BROWSING"} else None
        if shopping and shopping["intent"] in {"ADD_ITEM", "BROWSING", "SHOPPING_GENERIC", "SHOPPING_CLARIFY"}:
            return {**state, "intent": {**shopping, "resume_shopping": True}}
    if pending_type == "fill_options":
        if intent.get("intent") in {
            "CLEAR_CART", "REMOVE_ITEM", "SET_QUANTITY", "VIEW_CART",
            "START_CHECKOUT", "SELECT_FULFILLMENT", "SELECT_PAYMENT", "SELECT_VOUCHER",
        }:
            return {**state, "intent": intent}
        return {**state, "intent": {"intent": "PENDING_AMBIGUOUS", "pending_type": pending_type}}
    decision = classify_pending_reply(state["user_message"], pending_type)
    if decision:
        return {**state, "intent": {"intent": "PENDING_REPLY", "pending_type": pending_type, "decision": decision}}
    # A successful confirmation retry uses its completed action, even after
    # clearing the cart removed the pending summary.
    if prefs.get("completed_order_id") and re.search(r"\b(dong y|xac nhan|ok|oke|on roi|duoc roi)\b", _norm(state["user_message"])) and intent.get("intent") not in {"ADD_ITEM", "START_CHECKOUT", "FINISH_CART"}:
        if classify_pending_reply(state["user_message"], "confirm_checkout") == "CONFIRM":
            return {**state, "intent": {"intent": "PENDING_REPLY", "pending_type": "confirm_checkout", "decision": "CONFIRM"}}
    from src.agents.agent_service import _is_plain_confirmation, _wants_checkout
    prefs = cart_manager.get_checkout_prefs(state["session_id"])
    if (prefs.get("summary_fingerprint") or prefs.get("checkout_submission")) and _is_plain_confirmation(state["user_message"]):
        intent = {"intent": "CONFIRM_CHECKOUT"}
    elif _wants_checkout(state["user_message"]):
        intent = {"intent": "START_CHECKOUT"}
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
    if intent.get("intent") in {"ADD_ITEM", "BROWSING"}:
        shopping = _shopping_decision(state, intent)
        if shopping:
            intent = shopping
    return {**state, "intent": intent}


def _execute(state: OrderConversationState) -> OrderConversationState:
    from src.agents.checkout_choices import CHECKOUT_CHOICE_TYPES
    from src.function_calling.tools.cart_tools import (
        execute_clear_cart, execute_get_cart_quote, execute_remove_cart_item, execute_update_cart_item,
        is_authenticated_cart_session,
    )
    session_id, message, cart, intent = state["session_id"], state["user_message"], state["cart"], state["intent"]
    kind = intent.get("intent")
    if kind in {"SET_QUANTITY", "REMOVE_ITEM", "EDIT_OPTIONS", "ADD_ITEM"}:
        logger.debug("routing route=%s operation=%s target_source=%s", kind, kind,
                     intent.get("target_source") or "resolver")
    cart_write_intents = {"ADD_ITEM", "SET_QUANTITY", "REMOVE_ITEM", "EDIT_OPTIONS", "CLEAR_CART", "FILL_OPTIONS"}
    authoritative_intents = cart_write_intents | {"FINISH_CART", "START_CHECKOUT", "SELECT_FULFILLMENT", "SELECT_PAYMENT", "SELECT_VOUCHER", "CONFIRM_CHECKOUT", "PENDING_REPLY", "PENDING_BRANCH", "PENDING_CART_LINE", "PENDING_CHECKOUT_CHOICE", "REVIEW_CHECKOUT_SUMMARY", "LOCATION_REFERENCE"}
    prefs = cart_manager.get_checkout_prefs(session_id)
    replay = intent.get("pending_type") == "confirm_checkout" and intent.get("decision") == "CONFIRM" and (prefs.get("checkout_submission") or prefs.get("completed_order_id"))
    if kind in authoritative_intents and not replay and is_authenticated_cart_session(session_id) and not cart.get("authoritative"):
        return {**state, "result": {
            "reply": "Mình chưa thể xác minh giỏ hàng với Order Service nên chưa thực hiện thay đổi nào. Vui lòng thử lại sau.",
            "checkout_payload": None,
            "tool_calls_log": [{
                "tool": "blocked_mutation",
                "result": {"status": "blocked", "reason": "authoritative_cart_unavailable", "intent": kind},
            }],
            "error": None,
        }}
    if kind == "FILL_OPTIONS":
        from src.agents.agent_service import _complete_pending_products_from_options
        completed = _complete_pending_products_from_options(session_id, message)
        return {**state, "result": completed or {
            "reply": "Bạn hãy chọn tùy chọn cho các món đang chờ trước nhé.",
            "checkout_payload": None,
            "tool_calls_log": [],
            "error": None,
        }}
    if kind == "PENDING_CHECKOUT_CHOICE":
        from src.agents.agent_service import _checkout_choices_prompt
        return {**state, "result": {"reply": _checkout_choices_prompt(session_id, "Mình chưa rõ số bạn chọn thuộc danh sách nào, hoặc số đó không hợp lệ."),
                                   "checkout_payload": None, "tool_calls_log": [], "error": None}}
    if kind == "REVIEW_CHECKOUT_SUMMARY":
        from src.function_calling.tools.cart_tools import execute_request_checkout
        checkout = execute_request_checkout(session_id, reuse_summary=True)
        return {**state, "result": {"reply": checkout.get("message", "Bạn kiểm tra lại đơn hàng nhé."),
                                   "checkout_payload": checkout.get("order_summary") if checkout.get("status") == "require_confirmation" else None,
                                   "tool_calls_log": [{"tool": "request_checkout", "result": checkout}], "error": None}}
    if kind == "LOCATION_QUERY":
        return {**state, "result": _handle_location_request(state)}
    if kind == "LOCATION_REFERENCE":
        return {**state, "result": _handle_location_reference(state, intent["location_kind"])}
    if kind == "PRODUCT_CLARIFY":
        return {**state, "result": {"reply": "Bạn đang hỏi món nào trong danh sách? Bạn chọn số hoặc nói tên món nhé.",
                                   "checkout_payload": None, "tool_calls_log": [], "error": None}}
    if kind == "CART_TARGET_CLARIFY":
        row = intent["cart_row"]
        logger.debug("routing route=CART_TARGET_CLARIFY operation=NONE target_source=cart_name candidate_count=1")
        return {**state, "result": {"reply": f"Mình đã xác định được {row.get('product_name')} trong giỏ. Bạn muốn sửa số lượng/tùy chọn, xoá món, thêm một phần nữa, hay giữ nguyên?",
                                   "checkout_payload": None, "tool_calls_log": [], "error": None}}
    if kind == "PENDING_CART_LINE":
        resolved = intent.get("resolved_pending") or {}
        if resolved.get("stale"):
            return {**state, "result": {"reply": "Dòng món đó không còn trong giỏ. Bạn xem lại giỏ rồi chọn lại nhé.",
                "checkout_payload": None, "tool_calls_log": [], "error": None}}
        item = resolved.get("row") or {}
        line_id = _cart_line_id(item)
        operation = resolved.get("operation")
        if not line_id:
            return {**state, "result": {"reply": "Mình chưa xác định được dòng món. Bạn xem lại giỏ nhé.",
                "checkout_payload": None, "tool_calls_log": [], "error": None}}
        logs: List[Dict[str, Any]] = []
        if operation == "SET_QUANTITY":
            changed = execute_update_cart_item(session_id, line_id, {"quantity": int(resolved.get("requested_value") or 1)})
            logs.append({"tool": "update_cart_item", "result": changed})
            lead = "Đã cập nhật số lượng. Giỏ hàng mới:"
        elif operation == "REMOVE":
            changed = execute_remove_cart_item(session_id, line_id)
            logs.append({"tool": "remove_cart_item", "result": changed})
            lead = "Đã xoá đúng dòng món. Giỏ hàng mới:"
        elif operation == "EDIT_OPTIONS":
            patch = dict(resolved.get("patch") or {})
            if not patch:
                desired, option_result = _resolve_cart_option_update(item, str(resolved.get("requested_value") or ""))
                logs.append({"tool": "get_product_options", "result": option_result})
                patch = desired
            if not patch:
                cart_manager.set_pending_action(session_id, "edit_cart_item", {"cart_item_id": line_id})
                return {**state, "result": {"reply": f"Bạn muốn đổi tùy chọn nào cho {item.get('product_name')}?",
                    "checkout_payload": None, "tool_calls_log": logs, "error": None}}
            changed = execute_update_cart_item(session_id, line_id, patch)
            logs.append({"tool": "update_cart_item", "result": changed})
            lead = f"Đã cập nhật tùy chọn cho {item.get('product_name')}. Giỏ hàng mới:"
        else:
            cart_manager.clear_pending_action(session_id)
            return {**state, "result": {"reply": "Thao tác chờ không còn hợp lệ. Bạn thử lại nhé.",
                "checkout_payload": None, "tool_calls_log": [], "error": None}}
        if changed.get("status") == "ok":
            cart_manager.clear_pending_action(session_id)
            cart_manager.set_checkout_context(session_id, last_cart_focus=None if operation == "REMOVE" else line_id,
                                              flow_stage="CART_REVIEW")
            quote = execute_get_cart_quote(session_id)
            reply_text = lead + ("\n" + _format_quote(session_id, quote) if quote.get("status") == "ok" else "")
            reply_text += "\nBạn muốn thêm món, sửa/xoá món hay hoàn tất giỏ?"
        else:
            reply_text = changed.get("message", "Chưa thể cập nhật giỏ hàng.")
        return {**state, "result": {"reply": reply_text, "checkout_payload": None,
            "tool_calls_log": logs, "error": None}}
    if kind in {"PENDING_REPLY", "PENDING_AMBIGUOUS", "PENDING_BRANCH"}:
        return {**state, "result": _handle_pending_reply(state)}
    if intent.get("resume_shopping"):
        cart_manager.clear_pending_action(session_id)
        cart_manager.set_checkout_context(session_id, summary_fingerprint=None,
            checkout_action_id=None, summary_amounts=None, checkout_requested=None,
            flow_stage="BROWSING")
    if kind in {"SHOPPING_GENERIC", "SHOPPING_CLARIFY"}:
        message_text = ("Bạn muốn xem thêm bánh hay đồ uống? Mình sẽ đưa menu để bạn chọn món cụ thể."
                        if kind == "SHOPPING_GENERIC" else
                        "Mình chưa xác định được món cụ thể. Bạn cho mình tên món hoặc chọn số trong danh sách nhé.")
        return {**state, "result": {"reply": message_text, "checkout_payload": None,
                                   "tool_calls_log": [], "error": None}}
    if intent.get("pending_type") == "ask_more_items":
        decision = intent.get("pending_decision")
        cart_manager.clear_pending_action(session_id)
        if decision == "DONE":
            return {**state, "result": _offer_voucher_gate(session_id)}
        if decision == "CONCRETE_ADD" and intent.get("resolved_products"):
            refs = intent["resolved_products"]
            if len(refs) == 1:
                refs = [{**refs[0], "quantity": intent["quantity"]}]
            prepared = _prepare_structured_products(session_id, refs, _turn_operation_base(state))
            for ref in refs:
                _update_cart_focus_after_add(session_id, prepared, ref)
            cart_manager.set_checkout_context(session_id, flow_stage="CART_REVIEW")
            return {**state, "result": prepared}
        cart_manager.set_checkout_context(session_id, flow_stage="BROWSING")
        result = _browse_ask_more(state) if decision == "BROWSING_REQUEST" else {
            "reply": "Bạn muốn xem thêm đồ uống hay bánh? Mình sẽ tìm món phù hợp trong menu.",
            "checkout_payload": None, "tool_calls_log": [], "error": None,
        }
        return {**state, "result": result}
    # A voucher skip belongs to this gate even when its text routes as
    # SELECT_VOUCHER. Do not relist vouchers or invoke the model for a skip.
    prefs = cart_manager.get_checkout_prefs(session_id)
    skip = bool(re.search(r"\b(khong dung|bo qua|khong can)\b.*\b(ma|voucher|giam gia)\b", _norm(message))) or (
        prefs.get("voucher_offer_pending") and _norm(message).strip(" !.,") in {"khong can", "bo qua", "khong dung"}
    )
    if skip:
        from src.agents.agent_service import _run_agent_impl
        return {**state, "result": _run_agent_impl(session_id, message, history=state.get("history") or [], allow_model_mutations=False)}
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
        reference = _resolve_suggested_product(session_id, message)
        if reference:
            _focus_product(session_id, reference)
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
        browsing_constraints = intent.get("catalog_constraints") or parse_catalog_constraints(message)
        if browsing_constraints:
            logger.debug("routing route=BROWSING target_source=metadata_filter constraint_type=%s", browsing_constraints.get("constraint_type"))
            from src.function_calling.tools.product_tools import execute_filter_catalog
            constraints = browsing_constraints
            found = execute_filter_catalog(**constraints)
            from src.agents.catalog_constraints import describe_catalog_constraint
            group = "topping" if constraints["sellable_scope"] == "topping" else "món"
            relation = describe_catalog_constraint(constraints)
            reply = (found.get("message") if found.get("status") == "error" else
                     f"Hiện không có {group} nào {relation}." if found.get("status") == "not_found" else
                     "Mình tìm thấy các món phù hợp trong menu:")
            return {**state, "result": {
                "reply": reply, "checkout_payload": None,
                "tool_calls_log": [{"tool": "filter_catalog", "args": constraints, "result": found}],
                "error": None,
            }}
        # Resolve category aliases and OR alternatives with catalog data. The
        # entire customer sentence must never become one exact product name.
        menu_result = _search_menu_catalog(intent.get("category_query") or message)
        if menu_result:
            return {**state, "result": menu_result}
        existence = _answer_product_existence(session_id, message)
        if existence:
            return {**state, "result": existence}
        return {**state, "result": _browse_ask_more(state)}
    if kind == "ADD_ITEM":
        # The mutation boundary validates product identity independently of
        # tier1 verbs and semantic-classifier output.
        refs = [ref for ref in intent.get("resolved_products") or []
                if ref.get("product_id") and ref.get("product_name")]
        if not refs:
            return {**state, "result": {"reply": "Mình chưa tìm thấy món cụ thể trong menu. Bạn chọn tên món hoặc số trong danh sách nhé.",
                                       "checkout_payload": None, "tool_calls_log": [], "error": None}}
        if len(refs) == 1:
            refs = [{**refs[0], "quantity": int(intent.get("quantity") or _extract_add_quantity(message))}]
        prepared = _prepare_structured_products(session_id, refs, _turn_operation_base(state))
        for ref in refs:
            _update_cart_focus_after_add(session_id, prepared, ref)
        cart_manager.set_checkout_context(session_id, flow_stage="CART_REVIEW")
        return {**state, "result": prepared}
    if kind == "PRODUCT_REFERENCE_PARTIAL":
        missing = list(intent.get("missing_categories") or [])
        refs = [ref for ref in intent.get("resolved_products") or []
                if ref.get("product_id") and ref.get("product_name")]
        if refs:
            prepared = _prepare_structured_products(session_id, refs, _turn_operation_base(state),
                                                    hold_for_missing_reference=bool(missing))
        else:
            prepared = {"reply": "", "checkout_payload": None, "tool_calls_log": [], "error": None}
        if missing or not prepared.get("error"):
            cart_manager.set_checkout_context(session_id, pending_product_reference=missing or None)
        if missing:
            names = " và ".join("bánh" if category == "food" else "nước" for category in missing)
            held = list(cart_manager.get_checkout_prefs(session_id).get("pending_products") or [])
            kept = ", ".join(f"{item.get('category') == 'food' and 'bánh' or 'nước'} số {item.get('display_index') or item.get('number')}"
                             for item in held if item.get("number") or item.get("display_index"))
            prepared["reply"] = (f"Mình đã nhận {kept}. " if kept else "") + f"Còn {names} bạn muốn số mấy?"
        return {**state, "result": prepared}
    if kind == "SET_QUANTITY":
        matches = _cart_rows_named_in_message(cart, message)
        item, error = _resolve_cart_line(cart, message)
        if error:
            if len(matches) > 1:
                error = _store_cart_line_choice(session_id, "SET_QUANTITY", intent["quantity"], matches)
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
        matches = _cart_rows_named_in_message(cart, message)
        item, error = _resolve_cart_line(cart, message)
        if error:
            if len(matches) > 1:
                error = _store_cart_line_choice(session_id, "REMOVE", None, matches)
            return {**state, "result": {"reply": error, "checkout_payload": None, "tool_calls_log": [], "error": None}}
        line_id = str(item.get("cart_item_id") or item.get("line_id"))
        cart_manager.set_checkout_context(session_id, last_cart_focus=line_id)
        removed = execute_remove_cart_item(session_id, line_id)
        reply = removed.get("message", "Chưa thể xoá món.")
        if removed.get("status") == "ok":
            cart_manager.set_checkout_context(session_id, last_cart_focus=None, flow_stage="CART_REVIEW")
            quote = execute_get_cart_quote(session_id)
            reply += "\n" + (_format_quote(session_id, quote) if quote.get("status") == "ok" else "Giỏ hàng hiện trống.")
            reply += "\nBạn muốn thêm món, sửa/xoá món hay hoàn tất giỏ?" if quote.get("status") == "ok" else "\nBạn muốn xem menu món nào?"
        return {**state, "result": {"reply": reply, "checkout_payload": None, "tool_calls_log": [{"tool": "remove_cart_item", "result": removed}], "error": None}}
    if kind == "EDIT_OPTIONS":
        # A follow-up such as "thêm ngọt" contains an add verb but belongs to
        # the cart row that was explicitly selected one turn earlier.
        pending = cart_manager.get_pending_action(session_id) or {}
        target_id = str(((pending.get("params") or pending.get("data") or {}).get("cart_item_id")) or "")
        item = next((row for row in (cart.get("items") or []) if _cart_line_id(row) == target_id), None)
        error = None
        if not item:
            matches = _cart_rows_named_in_message(cart, message)
            item, error = _resolve_cart_line(cart, message)
        if error:
            if len(matches) > 1:
                error = _store_cart_line_choice(session_id, "EDIT_OPTIONS", message, matches)
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
        log = execute_clear_cart(session_id)
        if log.get("status") == "ok":
            cart_manager.clear_pending_action(session_id)
        reply = log.get("message", "Chưa thể xoá giỏ hàng.")
        return {**state, "result": {"reply": reply, "checkout_payload": None, "tool_calls_log": [{"tool": "clear_cart", "result": log}], "error": None}}
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
        patch = dict(intent.get("checkout_patch") or {})
        if not patch:
            from src.agents.agent_service import _explicit_checkout_choices
            patch = _explicit_checkout_choices(message)
        if patch.get("payment_method") == "VI_DIEN_TU":
            from src.function_calling.tools.cart_tools import validate_wallet_selection
            rejected = validate_wallet_selection(session_id)
            logger.debug("routing route=SELECT_PAYMENT operation=SELECT target_source=payment payment_state=%s",
                         "insufficient" if rejected else "eligible")
            if rejected:
                if patch.get("delivery_type"):
                    cart_manager.set_checkout_prefs(session_id, delivery_type=patch["delivery_type"])
                return {**state, "result": rejected}
        previous_delivery = prefs.get("delivery_type")
        if patch.get("delivery_type") and patch["delivery_type"] != previous_delivery:
            cart_manager.clear_branch(session_id)
            cart_manager.set_checkout_context(session_id, location_address=None, suggested_address=None,
                address_confirmed=None, delivery_address=None, branch_candidates=None)
        if patch:
            cart_manager.set_checkout_prefs(session_id, **patch)
        prefs = cart_manager.get_checkout_prefs(session_id)
        if prefs.get("delivery_type") and prefs.get("payment_method") and (
            (cart_manager.get_pending_action(session_id) or {}).get("type") in CHECKOUT_CHOICE_TYPES
        ):
            cart_manager.clear_pending_action(session_id)
        if not prefs.get("voucher_decided") or not prefs.get("checkout_requested"):
            return {**state, "result": _offer_voucher_gate(session_id)}
        # The choice is already persisted. Do not replay the customer's bare
        # ordinal into the legacy recommendation resolver.
        from src.agents.agent_service import _run_agent_impl
        from src.agents.checkout_choices import checkout_continuation_message
        return {**state, "result": _run_agent_impl(session_id, checkout_continuation_message(prefs),
                                                    history=[], allow_model_mutations=False)}

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
                voucher_offer_snapshot=_voucher_offer_snapshot(session_id),
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
    recommendation_products: List[Dict[str, Any]] = []
    price_focus: Optional[Dict[str, Any]] = None
    for entry in logs:
        value = entry.get("result") if isinstance(entry, dict) else {}
        branches.extend(value.get("branches", []))
        vouchers.extend(value.get("vouchers", []))
        if entry.get("tool") in {"get_recommendations", "filter_catalog"}:
            category = str((entry.get("args") or {}).get("category") or "")
            recommendation_products.extend({**item,
                "menu_bucket": item.get("menu_bucket") or (category if category in {"food", "drink"}
                    else _map_db_category_to_bucket(item.get("category"), item.get("parent_category")))}
                                           for item in value.get("products", []))
        else:
            products.extend(value.get("products", []))
        if entry.get("tool") == "check_price_and_stock" and isinstance(value, dict):
            if value.get("status") == "ok":
                single_products = value.get("products") or []
                if len(single_products) == 1:
                    item = single_products[0]
                    price_focus = {
                        "product_id": item.get("product_id"),
                        "product_name": item.get("product_name"),
                        "category": _map_db_category_to_bucket(item.get("category"), item.get("parent_category")),
                    }
                    cart_manager.set_checkout_context(
                        state["session_id"],
                        last_product_focus=price_focus,
                    )
        if entry.get("tool") == "add_to_cart" and isinstance(value, dict) and value.get("status") == "ok":
            _update_cart_focus_after_add(
                state["session_id"],
                {"tool_calls_log": [entry]},
                {"product_name": (entry.get("args") or {}).get("product_name")},
            )
    if recommendation_products:
        filtered_catalog = any(entry.get("tool") == "filter_catalog" for entry in logs)
        displayed: List[Dict[str, Any]] = []
        seen_ids: set[str] = set()
        displayed_counts: Dict[str, int] = {}
        for item in recommendation_products:
            product_id = str(item.get("product_id") or "").strip()
            if not product_id or product_id in seen_ids:
                continue
            bucket = item.get("menu_bucket") or "unknown"
            if displayed_counts.get(bucket, 0) >= (16 if filtered_catalog else 8):
                continue
            seen_ids.add(product_id)
            displayed.append(item)
            displayed_counts[bucket] = displayed_counts.get(bucket, 0) + 1
            if len(displayed) == 16:
                break
        if {item.get("menu_bucket") for item in displayed} >= {"food", "drink"}:
            displayed = [item for bucket in ("food", "drink", "topping", "unknown") for item in displayed
                         if item.get("menu_bucket") == bucket]
        group_counts: Dict[str, int] = {}
        snapshot = []
        for global_index, item in enumerate(displayed, 1):
            group = item.get("menu_bucket") or "unknown"
            group_counts[group] = group_counts.get(group, 0) + 1
            snapshot.append({
                "product_id": item["product_id"],
                "product_name": item.get("product_name"),
                "category": group,
                "menu_bucket": group,
                "group": group,
                "global_display_index": global_index,
                "group_display_index": group_counts[group],
                "final_price": item.get("final_price"),
            })
        for index, item in enumerate(displayed, 1):
            item["display_index"] = index
            item["global_display_index"] = index
            matching = next((row for row in snapshot if row["product_id"] == str(item.get("product_id"))), None)
            if matching:
                item["group"] = matching["group"]
                item["group_display_index"] = matching["group_display_index"]
        grouped_snapshots = {
            group: [item for item in snapshot if item["group"] == group]
            for group in {item["group"] for item in snapshot}
        }
        cart_manager.set_checkout_context(
            state["session_id"], last_product_suggestions=snapshot,
            product_suggestion_snapshots=grouped_snapshots,
            product_suggestion_mode="grouped" if len(grouped_snapshots) > 1 else "flat",
            last_product_focus=snapshot[0] if len(snapshot) == 1 else None,
        )
        products = displayed
        if displayed:
            lines = ["Món chưa được thêm vào giỏ. Mình tìm thấy các món sau:"]
            mixed = {item["category"] for item in snapshot} >= {"food", "drink"}
            current_bucket = None
            for index, item in enumerate(displayed, 1):
                bucket = item.get("menu_bucket") or "unknown"
                if mixed and bucket != current_bucket:
                    lines.append({"food": "\n**Bánh & đồ ăn:**", "drink": "\n**Đồ uống:**",
                                  "topping": "\n**Topping:**", "unknown": "\n**Các món khác:**"}[bucket])
                    current_bucket = bucket
                price = f"{float(item.get('final_price') or 0):,.0f}".replace(",", ".")
                lines.append(f"{index}. {item.get('product_name')} - {price}đ")
            notes = []
            for entry in logs:
                if entry.get("tool") != "get_recommendations":
                    continue
                value = entry.get("result") or {}
                source = value.get("source")
                if source == "hot" and (entry.get("args") or {}).get("criteria") == "rating":
                    notes.append("Chưa có món được đánh giá đủ dữ liệu; đây là các món bán chạy thay thế.")
                elif source == "alphabet":
                    notes.append("Các món này chưa có lượt mua hoặc đánh giá nổi bật; đây là món hiện có trong menu.")
                elif "Lưu ý: Chỉ tìm thấy" in str(value.get("recommendations") or ""):
                    notes.append("Chỉ tìm thấy một số món phù hợp với yêu cầu.")
            lines.extend(dict.fromkeys(notes))
            if result.get("missing_menu_groups"):
                lines.append("Chưa tìm thấy kết quả riêng cho: " + ", ".join(result["missing_menu_groups"]) + ".")
            lines.append("Bạn muốn chọn món số mấy hoặc nói tên món nhé.")
            result["reply"] = "\n".join(lines)
    if price_focus:
        cart_manager.set_checkout_context(state["session_id"], last_product_focus=price_focus)
    try:
        from src.function_calling.tools.cart_tools import sync_authoritative_cart
        canonical_cart = sync_authoritative_cart(state["session_id"])
    except Exception:
        canonical_cart = {
            **dict(state.get("cart") or {}),
            "authoritative": False,
            "cart_sync_status": "unavailable",
            "stale_snapshot": True,
        }
    if isinstance(canonical_cart.get("checkout_prefs"), dict):
        canonical_cart["checkout_prefs"] = {
            key: value for key, value in canonical_cart["checkout_prefs"].items()
            if key != "processed_order_turns"
        }
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
        cart_manager.set_pending_action(state["session_id"], "ask_more_items", {})
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
    invalidated = cart_manager.get_checkout_prefs(state["session_id"]).get("voucher_invalidated")
    if invalidated:
        result["reply"] = str(result.get("reply") or "") + f"\nMã {invalidated} không còn đủ điều kiện cho giỏ hiện tại; mình đã bỏ giảm giá cũ."
        logs.append({"tool": "remove_voucher", "result": {"status": "ok", "voucher_code": invalidated}})
        cart_manager.set_checkout_context(state["session_id"], voucher_invalidated=None)
    payment_ui: Dict[str, Any] = {}
    payment_change_requested = bool(re.search(
        r"\b(?:doi|thay|chon lai)\b.*\b(?:phuong thuc thanh toan|thanh toan|vnpay|cod|qr)\b",
        _norm(state.get("user_message")),
    )) or (bool(re.search(r"\b(?:doi|thay|chon lai)\b", _norm(state.get("user_message"))))
           and wallet_payment_evidence(_norm(state.get("user_message"))))
    show_payment_choices = not prefs.get("payment_method") or payment_change_requested
    if show_payment_choices and (prefs.get("checkout_requested") or prefs.get("flow_stage") == "PAYMENT"):
        from src.function_calling.tools.cart_tools import execute_get_cart_quote, get_wallet_payment_options
        current_quote = execute_get_cart_quote(state["session_id"])
        current_total = ((current_quote.get("quote") or {}).get("final_total")
                         if current_quote.get("status") == "ok" else None)
        if current_total is not None and float(current_total) <= 0:
            current_total = None
        payment_ui = get_wallet_payment_options(state["session_id"], current_total)
    if show_payment_choices and result.get("payment_options"):
        payment_ui["payment_options"] = result["payment_options"]
    result["ui_payload"] = {"cart": canonical_cart, "products": products[:16], "vouchers": vouchers[:4] if prefs.get("voucher_offer_pending") and not result.get("checkout_payload") else [], "branches": branches[:5], "actions": [], **payment_ui}
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


def _sanitize_replay_result(result: Dict[str, Any]) -> Dict[str, Any]:
    """Retain the user-visible response and UI effects, not diagnostic payloads."""
    compact = {key: result.get(key) for key in ("reply", "checkout_payload", "error", "conversation_state")}
    if result.get("gate"):
        compact["gate"] = result["gate"]
    card_fields = {
        "products": (16, ("product_id", "product_name", "ten_san_pham", "category", "menu_bucket", "display_index", "global_display_index", "group_display_index", "group", "danh_muc", "final_price", "gia_ban", "hinh_anh_url")),
        "branches": (5, ("ma_chi_nhanh", "branch_id", "ten_chi_nhanh", "branch_name", "dia_chi", "address", "khoang_cach_km", "distance_basis", "distance_estimated", "availability_status", "unavailable_products", "gio_mo_cua", "gio_dong_cua")),
        "vouchers": (4, ("ma_voucher", "ma_khuyen_mai", "code", "ten_voucher", "ten_khuyen_mai", "name", "title", "loai_khuyen_mai", "loai_giam_gia", "loai", "gia_tri", "gia_tri_giam", "discount_value", "gia_tri_don_toi_thieu")),
    }
    ui = result.get("ui_payload") or {}
    if ui:
        compact_ui = {}
        for name, (limit, keys) in card_fields.items():
            if ui.get(name):
                compact_ui[name] = [{key: row[key] for key in keys if key in row}
                                    for row in ui[name][:limit] if isinstance(row, dict)]
        if isinstance(ui.get("payment_options"), list):
            compact_ui["payment_options"] = [{key: row[key] for key in ("code", "label", "balance", "enabled", "insufficient", "reason") if key in row}
                                             for row in ui["payment_options"][:4] if isinstance(row, dict)]
        if ui.get("wallet_balance") is not None:
            compact_ui["wallet_balance"] = ui["wallet_balance"]
        cart = ui.get("cart") or {}
        if cart:
            prefs = cart.get("checkout_prefs") or {}
            compact_ui["cart"] = {"checkout_prefs": {
                key: prefs[key] for key in ("summary_fingerprint", "checkout_submission") if key in prefs
            }}
        if compact_ui:
            compact["ui_payload"] = compact_ui
    # ChatWidget uses these status-only events to refresh the cart/orders and
    # update its voucher badge. No tool arguments or backend cart copies belong
    # in durable replay metadata.
    ui_effects = {"add_to_cart", "remove_from_cart", "remove_cart_item", "update_cart_item",
                  "clear_cart", "confirm_checkout", "apply_voucher", "remove_voucher"}
    compact["tool_calls_log"] = [
        {"tool": entry["tool"], "result": {key: value[key] for key in ("status", "voucher_code") if key in value}}
        for entry in result.get("tool_calls_log") or []
        if isinstance(entry, dict) and entry.get("tool") in ui_effects
        for value in [entry.get("result") or {}] if isinstance(value, dict)
    ]
    return json.loads(json.dumps(compact, ensure_ascii=False, default=str))


def run_order_flow(
    session_id: str,
    user_message: str,
    history: Optional[List[Dict[str, str]]] = None,
    client_message_id: Optional[str] = None,
    selected_product_id: Optional[str] = None,
) -> Dict[str, Any]:
    # A lost HTTP response must replay the completed business turn. The
    # conversation table caches responses too; this session cache covers the
    # gap before that separate write succeeds, without a schema change.
    if client_message_id:
        from copy import deepcopy
        previous = (cart_manager.get_checkout_prefs(session_id).get("processed_order_turns") or {}).get(str(client_message_id))
        if previous:
            if previous.get("message") != user_message or previous.get("selected_product_id") != selected_product_id:
                return {"reply": "Mã lượt chat đã được dùng cho một tin nhắn khác.",
                        "checkout_payload": None, "tool_calls_log": [], "error": "client_message_id_conflict"}
            logger.info("[AgentTurn] client_message_id=%s phase=business_replay cache_hit=true",
                        client_message_id)
            return deepcopy(previous["result"])
    initial: OrderConversationState = {
        "session_id": session_id,
        "user_message": user_message,
        "history": history or [],
        "client_message_id": client_message_id,
        "selected_product_id": selected_product_id,
    }
    started_at = time.monotonic()
    before = cart_manager.get_cart(session_id)
    before_prefs = cart_manager.get_checkout_prefs(session_id)
    before_fingerprint = cart_manager.cart_fingerprint(session_id)
    # The API-level client id is stable across an HTTP retry.  Tools use this
    # scoped context to derive deterministic operation ids; it is deliberately
    # not exposed to the model.
    from src.function_calling.tools.cart_tools import mutation_operation_context
    routed_intent: Dict[str, Any] = {}
    with mutation_operation_context(session_id, client_message_id):
        if _GRAPH is None:
            from src.agents.agent_service import _run_agent_impl
            result = _run_agent_impl(session_id, user_message, history=history or [], allow_model_mutations=False)
        else:
            completed = _GRAPH.invoke(initial)
            routed_intent = completed.get("intent") or {}
            result = completed.get("result") or {"reply": "Mình chưa xử lý được yêu cầu này.", "error": "empty_graph_result"}
    model_fallback_used = bool(result.pop("_model_fallback", False))
    response_result = _sanitize_replay_result(result) if client_message_id else result
    if client_message_id:
        turns = dict(cart_manager.get_checkout_prefs(session_id).get("processed_order_turns") or {})
        turns[str(client_message_id)] = {
            "message": user_message,
            "selected_product_id": selected_product_id,
            "result": response_result,
        }
        if len(turns) > 20:
            for key in list(turns)[:-20]:
                turns.pop(key, None)
        cart_manager.set_checkout_context(session_id, processed_order_turns=turns)
    try:
        from src.common.turn_log import log_turn_async
        from src.agents.location_parser import normalize, parse_location
        route_kind = str(routed_intent.get("intent") or "MODEL_FALLBACK")
        parsed_location = parse_location(user_message)
        location_category = ({"address": "literal_address", "area": "location_hint"}.get(parsed_location.kind, parsed_location.kind))
        if parsed_location.kind == "address" and before_prefs.get("delivery_type") == "GIAO_TAN_NOI" and parsed_location.missing:
            location_category = "insufficient_delivery_address"
        location_value = normalize(parsed_location.value)
        if parsed_location.kind == "address":
            location_value = re.sub(r"^\d{1,5}[a-z]?(?:[/.-]\d{1,5}[a-z]?)?[^,]*", "[street]", location_value)
        tool_names = [str(entry.get("tool")) for entry in result.get("tool_calls_log") or []
                      if isinstance(entry, dict) and entry.get("tool")]
        log_turn_async(
            session_id=session_id,
            user_message=user_message,
            history=history or [],
            state_before={
                "cart_fingerprint": before_fingerprint,
                "item_count": before.get("item_count", 0),
                "stage": before_prefs.get("flow_stage", "BROWSING"),
                "pending_type": (before_prefs.get("pending_action") or {}).get("type"),
                "semantic_intent": routed_intent.get("semantic_intent") or route_kind,
                "route_owner": "model_read_only" if model_fallback_used else "location" if route_kind in {"LOCATION_QUERY", "PENDING_BRANCH"} else "order_flow",
                "location_category": location_category,
                "location_value": location_value if route_kind in {"LOCATION_QUERY", "PENDING_BRANCH"} else "",
                "model_fallback": model_fallback_used,
                "tool_names": tool_names,
            },
            gate_name=str(result.get("conversation_state") or "CART_REVIEW"),
            result=result,
            model_name="langgraph-router",
            latency_ms=int((time.monotonic() - started_at) * 1000),
        )
    except Exception:
        # Observability is never allowed to alter a customer turn.
        pass
    return response_result
