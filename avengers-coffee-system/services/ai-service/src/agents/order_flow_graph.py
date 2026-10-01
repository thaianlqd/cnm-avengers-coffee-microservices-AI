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

from src.agents.tier1 import (
    classify_confirmation,
    classify_order_intent,
    cart_line_quantity_intent,
    has_cart_edit_action,
    has_finish_cart_evidence,
    has_positive_browsing_evidence,
    has_transaction_evidence,
)
from src.agents.payment_intent import wallet_payment_evidence
from src.agents.catalog_constraints import extract_catalog_search_text, parse_catalog_constraints
from src.agents.shopping_language import interpret_shopping, is_family_only, shopping_quantity
from src.agents.selection_language import parse_selection_reference, product_reference_category, product_category_pattern
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


class CatalogQuerySpec(TypedDict, total=False):
    category: str
    family: str
    search_text: str
    label: str
    order: int
    source: str


class CatalogQueryPlan(TypedDict):
    specs: List[CatalogQuerySpec]
    read_only: bool
    source: str


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

    # Resolve two explicit drink families independently. The existing branch
    # splitter already owns mixed food/drink and "hoặc/hay" requests.
    joined = re.split(r"\b(?:va|voi)\b", text)
    if len(joined) == 2:
        families = [interpret_shopping(part.strip()) for part in joined]
        if all(row.act == "BROWSE_FAMILY" and row.search_text
               and is_family_only(part.strip(), row.family)
               for part, row in zip(joined, families)):
            specs: List[Dict[str, str]] = []
            seen = set()
            for row in families:
                key = (row.category, _norm(row.search_text))
                if key not in seen:
                    seen.add(key)
                    specs.append({"category": row.category, "label": row.label or "thực đơn",
                                  "search_text": row.search_text})
            return specs

    # Simple family questions share the shopping interpreter's category and
    # canonical search term. Keep the existing branch splitter below for
    # compound alternatives and mixed food/drink requests.
    family_meaning = interpret_shopping(message)
    if (family_meaning.act == "BROWSE_FAMILY"
            and family_meaning.category
            and is_family_only(message, family_meaning.family)):
        spec = {"category": family_meaning.category,
                "label": family_meaning.label or "thực đơn"}
        if family_meaning.search_text:
            spec["search_text"] = family_meaning.search_text
        return [spec]

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
        r"\b(?:muon|can|thich)?\s*(?:mua|dat)\s+(?:mon\s+)?(?:banh|do an|nuoc|do uong|ca phe|tra)\b",
        text,
    )) and not has_menu_ordinal
    if not broad_family_request and re.search(
        r"\b(them|mua|lay|chon|xoa|bo|sua|doi|chinh|so luong|sl|thanh toan|dat hang|chot)\b",
        text,
    ):
        return []

    explores_menu = bool(re.search(
        r"\b(co|xem|menu|goi y|hien thi|tim|tham khao|mon gi|mon nao|ban gi)\b|"
        r"\bban\b.+\b(?:gi|nao|khong)\b",
        text,
    ))
    compact_query = len(text.split()) <= 6 and bool(re.search(
        r"\b(banh|do an|nuoc|do uong|ca phe|tra|matcha|americano|cold brew|espresso|latte|frappe|pizza|pasta)\b",
        text,
    ))
    if not explores_menu and not compact_query:
        return []

    parts = [part.strip() for part in re.split(r"\b(?:hoac|hay)\b", text) if part.strip()]
    raw_parts = [part.strip() for part in re.split(r"\b(?:hoặc|hoac|hay)\b", message, flags=re.IGNORECASE) if part.strip()]
    overall_food = bool(re.search(r"\b(banh|do an|thuc an|pizza|pasta)\b", text))
    overall_drink = bool(re.search(
        r"\b(nuoc|do uong|thuc uong|ca phe|tra|americano|cold brew|espresso|latte|frappe)\b",
        text,
    ))
    # "bánh và nước" represents two real menu branches.  Without this split
    # the food keyword wins merely because it appears first in the sentence.
    if len(parts) == 1 and overall_food and overall_drink:
        parts = ["banh", "nuoc"]
    specs: List[Dict[str, str]] = []

    for part_index, part in enumerate(parts or [text]):
        original_part = raw_parts[part_index] if len(raw_parts) == len(parts) else part
        has_food = bool(re.search(r"\b(banh|do an|thuc an|pizza|pasta)\b", part))
        has_drink = bool(re.search(
            r"\b(nuoc|do uong|thuc uong|ca phe|tra|americano|cold brew|espresso|latte|frappe)\b",
            part,
        ))
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
        elif re.search(r"\bca phe\b", part):
            category = "drink"
            search_text = extract_catalog_search_text(original_part) or "Cà Phê"
            label = "Cà phê"
        elif re.search(r"\btra\b", part):
            category = "drink"
            search_text = extract_catalog_search_text(original_part) or "Trà"
            label = "Trà"
        elif re.search(r"\b(americano|cold brew|espresso|latte|frappe)\b", part):
            category = "drink"
            search_text = extract_catalog_search_text(original_part) or re.search(
                r"\b(americano|cold brew|espresso|latte|frappe)\b", part,
            ).group(1)
            label = search_text.title()
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


def _catalog_query_plan(message: str = "", *, category: Optional[str] = None) -> CatalogQueryPlan:
    """Create one canonical, read-only catalog plan from resolved shopping meaning."""
    if category:
        if category not in {"drink", "food", "all"}:
            return {"specs": [], "read_only": True, "source": "category"}
        raw_specs: List[Dict[str, str]] = [{
            "category": category,
            "label": ("Menu nước" if category == "drink" else
                      "Menu bánh và đồ ăn" if category == "food" else "thực đơn"),
        }]
        source = "category"
    else:
        meaning = interpret_shopping(message)
        if meaning.act == "BROWSE_FAMILY" and meaning.category:
            raw_specs = [{"category": meaning.category, "label": meaning.label or "thực đơn"}]
            if meaning.search_text:
                raw_specs[0]["search_text"] = meaning.search_text
        else:
            raw_specs = _menu_search_specs(message)
        source = "shopping_semantics"

    canonical_families = {
        "ca phe": "coffee", "tra": "tea", "americano": "americano",
        "cold brew": "cold_brew", "espresso": "espresso", "frappe": "frappe",
        "latte": "latte", "matcha": "matcha", "banh man": "savory_cake",
        "banh ngot": "sweet_cake", "banh trung thu": "moon_cake", "pizza": "pizza",
    }
    specs: List[CatalogQuerySpec] = []
    for index, raw_spec in enumerate(raw_specs):
        spec: CatalogQuerySpec = {**raw_spec, "order": index, "source": source}
        search_key = _norm(raw_spec.get("search_text") or "")
        family = canonical_families.get(search_key)
        if not family and not search_key and raw_spec.get("category") in {"food", "drink"}:
            family = raw_spec["category"]
        if family:
            spec["family"] = family
        specs.append(spec)
    return {"specs": specs, "read_only": True, "source": source}


def _search_menu_catalog(message: str = "", *, category: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Search each requested menu branch and merge exact products by id."""
    plan = _catalog_query_plan(message, category=category)
    specs = plan["specs"]
    if not specs:
        return None

    from src.function_calling.tools.product_tools import execute_get_recommendations

    logger.info("[CatalogQueryPlan] groups=%d families=%s search_texts=%s",
                len(specs), ",".join(spec.get("family") or "-" for spec in specs),
                [spec.get("search_text") for spec in specs])
    merged: List[Dict[str, Any]] = []
    seen: set[str] = set()
    missing: List[str] = []
    unavailable: List[str] = []
    query_debug: List[Dict[str, Any]] = []
    rendered_groups: List[tuple[Dict[str, str], List[Dict[str, Any]], Dict[str, Any]]] = []
    per_group_limit = 8 if len(specs) <= 2 else max(1, 16 // len(specs))
    for group_index, spec in enumerate(specs):
        top_k = 16 if len(specs) > 1 else (10 if not spec.get("search_text") else 8)
        found = execute_get_recommendations(
            category=spec["category"],
            search_text=spec.get("search_text"),
            top_k=top_k,
        )
        provider_status = str(found.get("status") or "error")
        raw_products = [
            {**product,
             "catalog_group_index": group_index,
             "catalog_group_family": spec.get("family"),
             "catalog_group_label": spec["label"],
             "menu_bucket": (spec["category"] if spec["category"] in {"food", "drink"}
                else _map_db_category_to_bucket(product.get("category"), product.get("parent_category")))}
            for product in (found.get("products") or [])
        ] if provider_status == "ok" else []
        if not raw_products:
            if provider_status in {"ok", "not_found"}:
                missing.append(spec["label"])
            else:
                unavailable.append(spec["label"])
            query_debug.append({**spec, "status": found.get("status"),
                                "raw_count": 0, "rendered_count": 0})
            logger.info("[CatalogQueryResult] group=%s status=%s raw_count=0 rendered_count=0",
                        spec.get("family") or spec["label"], found.get("status"))
            continue
        group_products: List[Dict[str, Any]] = []
        for product in raw_products:
            identity = str(product.get("product_id") or "").strip() or _norm(product.get("product_name"))
            if not identity or identity in seen:
                continue
            seen.add(identity)
            merged.append(product)
            group_products.append(product)
            if len(group_products) >= per_group_limit or len(merged) >= 16:
                break
        rendered_groups.append((spec, group_products, found))
        query_debug.append({**spec, "status": found.get("status"),
                            "raw_count": len(raw_products), "rendered_count": len(group_products)})
        logger.info("[CatalogQueryResult] group=%s status=%s raw_count=%d rendered_count=%d",
                    spec.get("family") or spec["label"], found.get("status"),
                    len(raw_products), len(group_products))

    merged = merged[:16]
    catalog_status = ("ok" if merged else "partial_failure" if missing and unavailable
                      else "error" if unavailable else "not_found")
    result = {
        "status": "ok" if merged else catalog_status,
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
        lines = []
        if missing:
            lines.append("Mình chưa tìm thấy món phù hợp trong nhóm " + ", ".join(missing) + ".")
        if unavailable:
            lines.append("Hiện mình chưa tra cứu được nhóm " + ", ".join(unavailable) + "; bạn có thể thử lại.")
        lines.append("Bạn muốn xem menu bánh hay menu nước?")
        return {
            "reply": "\n".join(lines),
            "checkout_payload": None,
            "tool_calls_log": logs,
            "catalog_status": catalog_status,
            "missing_menu_groups": missing,
            "unavailable_menu_groups": unavailable,
            "error": None,
        }

    labels = " hoặc ".join(spec["label"] for spec in specs)
    lines = [f"Mình tìm thấy các món phù hợp với {labels}:"]
    for index, product in enumerate(merged, 1):
        price = f"{float(product.get('final_price') or 0):,.0f}".replace(",", ".")
        lines.append(f"{index}. {product.get('product_name')} - {price}đ")
    if missing:
        lines.append("Chưa tìm thấy kết quả riêng cho: " + ", ".join(missing) + ".")
    if unavailable:
        lines.append("Hiện chưa tra cứu được nhóm: " + ", ".join(unavailable) + "; bạn có thể thử lại.")
    lines.append("Bạn muốn chọn món số mấy hoặc nói tên món nhé.")
    return {
        "reply": "\n".join(lines),
        "checkout_payload": None,
        "tool_calls_log": logs,
        "displayed_products": merged,
        "catalog_status": catalog_status,
        "missing_menu_groups": missing,
        "unavailable_menu_groups": unavailable,
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
    selected = None
    reference = parse_selection_reference(message, active_namespace="CART_LINE")
    if reference.requested and reference.namespace in {None, "CART_LINE", "PRODUCT"}:
        selected = next((item for item in snapshot
                         if int(item.get("display_index") or 0) == reference.ordinals[0]), None)
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


def _cart_target_continuation(state: OrderConversationState, pending: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Resume only evidence about the exact cart line we asked to clarify."""
    params = pending.get("params") or pending.get("data") or {}
    if pending.get("type") != "cart_edit_clarification" or params.get("clarification_type") != "cart_target":
        return None
    message, session_id = state["user_message"], state["session_id"]
    text = _norm(message).strip(" .!?")
    row = next((item for item in (state.get("cart") or {}).get("items") or []
                if _cart_line_id(item) == str(params.get("cart_item_id"))
                and str(item.get("product_id")) == str(params.get("product_id"))), None)
    if not row:
        cart_manager.clear_pending_action(session_id)
        return {"intent": "PENDING_CART_LINE", "resolved_pending": {"stale": True}}
    number = r"(?:\d+|mot|hai|ba|bon|tu|nam|sau|bay|tam|chin|muoi)"
    quantity = re.fullmatch(
        r"(?:(?:cho|de)\s+(?:(?:toi|minh)\s+)?|(?:so luong|sl)\s*(?:la\s*)?)?"
        + number + r"(?:\s+(?:cai|ly|phan|mon))?(?:\s+(?:a|ban|oi|nha|nhe|di))*", text,
    )
    # _norm retains signs; a negative number must never become positive.
    if quantity:
        value = re.search(number, text).group()
        words = dict(zip('mot hai ba bon tu nam sau bay tam chin muoi'.split(),
                         (1, 2, 3, 4, 4, 5, 6, 7, 8, 9, 10)))
        requested = int(value) if value.isdigit() else words[value]
        return {"intent": "PENDING_CART_LINE", "resolved_pending": {
            "row": row, "operation": "SET_QUANTITY", "requested_value": requested}}
    if re.fullmatch(r"(?:(?:cho|de)\s+(?:(?:toi|minh)\s+)?|(?:so luong|sl)\s*)?"
                    r"[-\d\s]+(?:hay|hoac|va)?[-\d\s]*(?:cai|ly|phan|mon)?", text):
        return {"intent": "PENDING_AMBIGUOUS", "pending_type": "cart_edit_clarification"}
    if re.fullmatch(r"(?:xoa|bo)\s+(?:no|mon\s+(?:nay|do)|cai\s+(?:nay|do))(?:\s+(?:di|nhe|nha))*", text):
        return {"intent": "PENDING_CART_LINE", "resolved_pending": {"row": row, "operation": "REMOVE"}}
    explicit_reference = parse_selection_reference(message)
    if (has_cart_edit_action(message) and not explicit_reference.requested
            and not _cart_rows_named_in_message(state.get("cart") or {}, message)):
        return {"intent": "PENDING_CART_LINE", "resolved_pending": {
            "row": row, "operation": "EDIT_OPTIONS", "requested_value": message}}
    from src.agents.pending_context import classify_pending_reply
    if classify_pending_reply(message, "cart_edit_clarification") == "KEEP_CURRENT":
        return {"intent": "PENDING_REPLY", "pending_type": "cart_edit_clarification", "decision": "KEEP_CURRENT"}
    if has_finish_cart_evidence(message) and not re.search(r"\bgio\b", text):
        return {"intent": "PENDING_AMBIGUOUS", "pending_type": "cart_edit_clarification"}
    from src.agents.location_parser import parse_location
    from src.agents.agent_service import _wants_checkout
    explicit = classify_order_intent(message, None)
    location = parse_location(message)
    if explicit.get("intent") in {
        "BROWSING", "ADD_ITEM", "VIEW_CART", "CLEAR_CART", "REMOVE_ITEM", "SET_QUANTITY", "EDIT_OPTIONS",
        "FINISH_CART", "START_CHECKOUT", "SELECT_FULFILLMENT", "SELECT_PAYMENT", "SELECT_VOUCHER",
        "APPLY_VOUCHER", "REMOVE_VOUCHER", "REPLACE_VOUCHER",
    } or _voucher_command(message) or _wants_checkout(message) or (
        location.kind in {"area", "address", "poi"} and location.value
    ):
        cart_manager.clear_pending_action(session_id)
        return None
    if has_positive_browsing_evidence(message) or explicit.get("intent") in {"PRODUCT_INFO", "PRODUCT_REVIEW", "PAYMENT_INFO"}:
        return None
    return {"intent": "PENDING_AMBIGUOUS", "pending_type": "cart_edit_clarification"}


def _resolve_cart_line(cart: Dict[str, Any], message: str, cart_line_ordinal: Optional[int] = None) -> tuple[Optional[Dict[str, Any]], Optional[str]]:
    items = list(cart.get("items") or [])
    text = _norm(message)
    matches = _cart_rows_named_in_message(cart, message)
    reference = parse_selection_reference(message)
    if cart_line_ordinal is not None or (reference.requested and reference.namespace == "CART_LINE"):
        index = cart_line_ordinal if cart_line_ordinal is not None else reference.ordinals[0]
        if 1 <= index <= len(items):
            logger.debug("routing route=CART_MUTATION target_source=cart_line_ordinal candidate_count=1")
            return items[index - 1], None
        return None, (
            f"Giỏ hiện có {len(items)} dòng nên không có dòng số {index}. "
            "Bạn chọn lại số dòng nhé."
        )
    id_match = re.search(r"\b(?:line_id|cart_item_id|dòng|dong)\s*[:#]?\s*([\w-]+)\b", message, re.IGNORECASE)
    explicit_id = [row for row in items if id_match and _cart_line_id(row) == id_match.group(1)]
    if len(explicit_id) == 1:
        logger.debug("routing route=CART_MUTATION target_source=cart_id candidate_count=1")
        return explicit_id[0], None
    # During an explicit option edit, "món thứ 2" names the cart line in the
    # current cart namespace. It must not be deferred to an older menu list.
    cart_ordinal = re.search(r"\b(?:dong|mon)\s+(?:(?:so|thu)\s*)?(\d+)\b", text)
    if cart_ordinal and has_cart_edit_action(message):
        index = int(cart_ordinal.group(1))
        if 1 <= index <= len(items):
            logger.debug("routing route=CART_MUTATION target_source=cart_ordinal candidate_count=1")
            return items[index - 1], None
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
    if len(items) == 1 and (generic_reference or not remaining_words or has_cart_edit_action(message)):
        logger.debug("routing route=CART_MUTATION target_source=unique_cart_line candidate_count=1")
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


def _clear_completed_cart_owner(session_id: str) -> None:
    """Close only a resolved cart-target transaction, never product options."""
    pending_type = (cart_manager.get_pending_action(session_id) or {}).get("type")
    if pending_type in {"edit_cart_item", "cart_line_choice", "cart_edit_clarification"}:
        cart_manager.clear_pending_action(session_id)


def _resolve_suggested_product(session_id: str, message: str) -> Optional[Dict[str, Any]]:
    """Resolve an ordinal or uniquely named item from the latest snapshot."""
    suggestions = list(cart_manager.get_checkout_prefs(session_id).get("last_product_suggestions") or [])
    if not suggestions:
        return None
    ordinal_refs, invalid, requested = _resolve_product_ordinals(session_id, message)
    if requested:
        return ordinal_refs[0] if not invalid and len(ordinal_refs) == 1 else None
    meaning = interpret_shopping(message, snapshot=suggestions)
    return meaning.targets[0] if len(meaning.targets) == 1 else None


def _unresolved_product_reference(session_id: str, message: str) -> bool:
    """A demonstrative after a list is not evidence for its final row."""
    prefs = cart_manager.get_checkout_prefs(session_id)
    if len(prefs.get("last_product_suggestions") or []) < 2 or prefs.get("last_product_focus"):
        return False
    if not re.search(r"\b(?:mon|cai|san pham|banh|nuoc)\s+(?:do|nay|kia)\b", _norm(message)):
        return False
    return not (_resolve_suggested_product(session_id, message) or _resolve_structured_references(session_id, message))


def _focus_product(session_id: str, product: Dict[str, Any], *, read_only: bool = False) -> None:
    if product.get("product_id") and product.get("product_name"):
        identity = {"product_id": product["product_id"], "product_name": product["product_name"],
                    "category": product.get("category")}
        current = cart_manager.get_checkout_prefs(session_id).get("last_product_focus") or {}
        if read_only and str(current.get("product_id")) == str(identity["product_id"]):
            # Identity reads must preserve an outstanding option-provider retry.
            # Selection/configuration still clears that retry through its existing path.
            identity = {**current, **identity}
        if current != identity:
            cart_manager.set_checkout_context(session_id, last_product_focus=identity)


def _resolve_product_ordinals(
    session_id: str, message: str,
) -> tuple[List[Dict[str, Any]], List[int], int]:
    """Resolve shared numbered references against canonical product snapshots."""
    prefs = cart_manager.get_checkout_prefs(session_id)
    latest = list(prefs.get("last_product_suggestions") or [])
    snapshots = dict(prefs.get("product_suggestion_snapshots") or {})
    pending_type = (prefs.get("pending_action") or {}).get("type")
    # An unlabelled selection must have a product UI owner. Stale catalog
    # snapshots cannot steal voucher/payment/branch/location/cart-line choices.
    product_active = bool(latest) and not prefs.get("last_branch_discovery_candidates") and pending_type in {
        None, "ask_more_items", "shopping_scope_clarification",
    }
    reference = parse_selection_reference(
        message, active_namespace="PRODUCT" if product_active else None, allow_multiple=True,
    )
    if (not reference.requested or reference.namespace not in {None, "PRODUCT"}
            or (reference.namespace is None and (
                not product_active or reference.operation_semantics != "SELECT_REFERENCE"))):
        return [], [], 0
    matches = list(zip(reference.ordinal_labels, reference.ordinals))
    resolved: List[Dict[str, Any]] = []
    invalid: List[int] = []
    for namespace, ordinal in matches:
        index = ordinal - 1
        category = product_reference_category(namespace)
        candidate = None
        if 0 <= index < len(latest):
            visible = latest[index]
            visible_category = str(visible.get("category") or visible.get("menu_bucket") or "")
            if visible_category not in {"drink", "food"}:
                visible_category = _map_db_category_to_bucket(
                    visible.get("product_name") or visible_category,
                    visible.get("parent_category"),
                )
            if category is None or visible_category == category:
                candidate = visible
        if candidate is None and category:
            category_rows = list(snapshots.get(category) or [])
            candidate = next((item for item in category_rows
                              if int(item.get("group_display_index") or 0) == ordinal), None)
            if candidate is None and 0 <= index < len(category_rows):
                candidate = category_rows[index]
        if candidate is None:
            invalid.append(ordinal)
        else:
            resolved.append(candidate)

    unique: List[Dict[str, Any]] = []
    seen = set()
    for item in resolved:
        identity = str(item.get("product_id") or "").strip() or _norm(item.get("product_name"))
        if identity and identity not in seen:
            seen.add(identity)
            unique.append(item)
    if matches:
        logger.debug("[OrdinalResolver] snapshot_size=%d requested_indices=%s resolved_count=%d",
                     len(latest), [ordinal for _namespace, ordinal in matches], len(unique))
    return unique, invalid, len(matches)


def _resolve_structured_references(session_id: str, message: str) -> Optional[List[Dict[str, Any]]]:
    """Resolve ordinals and demonstratives from durable recommendation state.

    The returned product objects come directly from the snapshots written by
    tool results. They are not reconstructed from assistant prose.
    """
    prefs = cart_manager.get_checkout_prefs(session_id)
    focus = prefs.get("last_product_focus") or {}
    text = _norm(message)
    resolved, invalid, requested = _resolve_product_ordinals(session_id, message)
    if requested and invalid:
        return None

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
    for category in ("drink", "food"):
        names = product_category_pattern(category)
        if re.search(rf"\b(?:{names})\s*(?:thi\s*)?(?:(?:so|thu|#)\s*)?\d+\b", text):
            requested.add(category)
    return requested


def _incomplete_ordinal_categories(message: str) -> set[str]:
    """Find an explicit category ordinal whose number was omitted."""
    text = _norm(message)
    missing = set()
    for category in ("food", "drink"):
        names = product_category_pattern(category)
        if re.search(rf"\b(?:{names})\s*(?:thi\s*)?(?:so|thu|#)\s*(?=$|va\b|[,;.!?])", text):
            missing.add(category)
    return missing


def _pending_reference_action(message: str, missing: set[str], refs: List[Dict[str, Any]]) -> str | None:
    """Classify an explicit change to the unfinished selection batch."""
    words = _norm(message)
    if re.search(r"\b(?:bo|huy|khong lay|khong can)\s+(?:ca hai|het|tat ca)\b", words):
        return "abandon"
    names = {category: product_category_pattern(category) for category in ("food", "drink")}
    canceled = any(
        re.search(rf"\b(?:khong\s+(?:lay|can|muon)|bo|huy)\s+(?:{names[category]})\b", words)
        for category in missing
    )
    other = "drink" if missing == {"food"} else "food" if missing == {"drink"} else None
    if other and re.search(rf"\bchi\s+(?:lay|muon|can)?\s*(?:{names[other]})\b|\b(?:{names[other]})\s+thoi\b", words):
        canceled = True
    if re.search(r"\b(?:doi sang|thay bang|chuyen sang)\b", words) and refs:
        return "replace"
    if canceled:
        return "cancel"
    if refs and not any(ref.get("category") in missing for ref in refs):
        return "replace"
    return None


def _close_pending_reference_batch(session_id: str) -> None:
    """Discard an unfinished selection draft when shopping changes direction."""
    cart_manager.set_checkout_context(session_id, pending_product_reference=None, last_product_focus=None)
    cart_manager.set_pending_products(session_id, [])
    cart_manager.clear_pending_action(session_id)


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
    merge_pending: bool = True,
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
        option_result = execute_get_product_options(product_name, product_id=str(ref["product_id"]))
        logs.append({"tool": "get_product_options",
                     "args": {"product_id": str(ref["product_id"]), "product_name": product_name},
                     "result": option_result})
        if option_result.get("status") != "ok":
            if option_result.get("status") != "not_found":
                cart_manager.set_checkout_context(session_id, last_product_focus={
                    "product_id": ref["product_id"],
                    "product_name": product_name,
                    "category": ref.get("category"),
                    "quantity": int(ref.get("quantity") or 1),
                    "option_retry_pending": True,
                })
                return {
                    "reply": "Mình đã xác định đúng món nhưng hiện chưa lấy được tùy chọn của món này. Giỏ chưa thay đổi. Bạn có thể thử lại.",
                    "checkout_payload": None, "tool_calls_log": logs,
                    "error": "option_metadata_unavailable",
                }
            return {"reply": "Mình chưa xác minh được tùy chọn của món đã chọn. Giỏ hàng chưa thay đổi; bạn chọn lại món nhé.",
                    "checkout_payload": None, "tool_calls_log": logs, "error": "product_reference_unresolved"}
        if option_result.get("product_id") and str(option_result["product_id"]) != str(ref["product_id"]):
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
    all_pending = cart_manager.set_pending_products(session_id, pending, merge=merge_pending)
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
    return shopping_quantity(message)


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
            "Món chưa được thêm vào giỏ. Nếu muốn thêm, bạn cho mình số lượng nhé."
        ),
        "checkout_payload": None,
        "tool_calls_log": [log],
        "error": None,
    }


def _voucher_offer_snapshot(session_id: str) -> str:
    cart = cart_manager.get_cart(session_id)
    payload = {key: cart.get(key) for key in ("cart_id", "cart_version", "branch_id", "items")}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def _voucher_command(message: str) -> Optional[Dict[str, str]]:
    """Parse voucher action and an exact customer supplied code, if present."""
    raw = str(message or "")
    folded = _norm(raw)
    folded_action = re.sub(r"\btoan\s+bo\b", " ", folded)
    if (re.search(r"\b(?:xoa|bo|go)\b.*\b(?:ma|voucher|giam gia)\b|\bkhong dung (?:ma|voucher) nua\b", folded_action)
            and not re.search(r"\bbo qua\b", folded)):
        return {"intent": "REMOVE_VOUCHER"}
    replacement = re.search(
        r"\b(?:đổi|thay)\s+(?:sang\s+)?(?:mã|voucher)\s+([A-Za-z0-9][A-Za-z0-9_-]{2,})\b",
        raw, re.IGNORECASE,
    )
    if replacement:
        return {"intent": "REPLACE_VOUCHER", "voucher_code": replacement.group(1).upper()}
    application = re.search(
        r"\b(?:áp|dùng|sử dụng)\s+(?:mã|voucher)\s+([A-Za-z0-9][A-Za-z0-9_-]{2,})\b",
        raw, re.IGNORECASE,
    )
    if application:
        return {"intent": "APPLY_VOUCHER", "voucher_code": application.group(1).upper()}
    # The voucher noun may be omitted only when the following token has code
    # shape. This accepts "áp ABC20" without treating "áp dụng ngay" as a code.
    short_application = re.search(
        r"\b(?:áp|dùng)\s+([A-Za-z0-9][A-Za-z0-9_-]{2,})\b", raw, re.IGNORECASE,
    )
    if short_application:
        candidate = short_application.group(1)
        if any(char.isdigit() or char in "_-" for char in candidate) or candidate == candidate.upper():
            return {"intent": "APPLY_VOUCHER", "voucher_code": candidate.upper()}
    return None


def _is_voucher_info_query(message: str) -> bool:
    """Separate voucher availability questions from apply/remove mutations."""
    text = _norm(message)
    reference = parse_selection_reference(message)
    structural_info = (reference.requested and reference.namespace == "VOUCHER"
                       and reference.operation_semantics == "INFO_REFERENCE")
    return bool(re.search(r"\b(voucher|ma giam gia|khuyen mai)\b", text)) and bool(
        structural_info or re.search(r"\b(co|nao|gi|thong tin|xem|bao nhieu)\b", text)
    ) and not bool(re.search(r"\b(ap|dung|su dung|xoa|go|doi|thay)\b", text))


def _is_unaccented_store_discovery(message: str) -> bool:
    """Treat ambiguous unaccented ``quan`` as a store only with find/near grammar."""
    raw = str(message or "").lower()
    text = _norm(raw)
    ambiguous_store = bool(re.search(r"\bquan\b", raw)) and not bool(
        re.search(r"\b(?:quán|quận)\b", raw)
    )
    return ambiguous_store and bool(re.search(r"\btim\b", text)) and bool(
        re.search(r"\b(?:gan|quanh|o dau|nao)\b", text)
    )


def _is_branch_discovery_request(message: str) -> bool:
    """Recognize store discovery without folding district ``quận`` into ``quán``."""
    raw = str(message or "").lower()
    text = _norm(raw)
    store = bool(re.search(
        r"\b(?:quán|cửa\s+hàng|cua\s+hang|chi\s+nhánh|chi\s+nhanh|kiosk)\b", raw,
    ))
    discovery = bool(re.search(r"\b(tim|gan|quanh|o dau|dia chi|nao|co)\b", text))
    return (store and discovery) or _is_unaccented_store_discovery(message)


def _read_only_branch_ordinal(message: str) -> tuple[Optional[int], bool, bool]:
    """Return (ordinal, explicit branch namespace, bare ordinal)."""
    raw = str(message or "").lower().strip()
    text = _norm(raw)
    explicit_store = bool(re.search(r"\bquán\b", raw)) or bool(re.search(
        r"\b(?:cua hang|chi nhanh|kiosk)\b", text,
    ))
    reference = parse_selection_reference(message, active_namespace="BRANCH")
    compatible = reference.namespace in {None, "BRANCH", "LOCATION_CANDIDATE"}
    if reference.requested and compatible:
        return reference.ordinals[0], explicit_store, not explicit_store
    return None, explicit_store, False


def _is_deictic_location(value: str) -> bool:
    text = re.sub(r"\s+", " ", _norm(value)).strip()
    return bool(re.fullmatch(
        r"(?:toi|minh|day|gan day|cho nay|khu vuc nay|dia diem nay|(?:truong|benh vien|cong vien) nay)",
        text,
    ))


def _is_standalone_location_statement(message: str, kind: str) -> bool:
    """Require structural location evidence before a read-only fact owns a turn.

    The location parser deliberately recognizes bare numbered address shapes for
    checkout. Outside checkout, a quantity such as ``2 ly cà phê`` must not be
    promoted into conversation location context.
    """
    from src.agents.shopping_language import without_targetless_future_clause
    current = without_targetless_future_clause(message)
    if has_positive_browsing_evidence(current) or has_transaction_evidence(current):
        return False
    text = _norm(current)
    location_intro = bool(re.search(
        r"^\s*(?:(?:toi|minh)(?:\s+dang)?\s+o|dang o|o|tai|gan|dia chi(?:\s+moi)?(?:\s+la)?)\b",
        text,
    ))
    admin_evidence = bool(re.search(
        r"\b(phuong|xa|quan|huyen|thanh pho|tinh|tp\.?|p\.?|q\.?|h\.?)\s+\S+",
        text,
    ))
    if kind == "address":
        return location_intro or admin_evidence
    return kind in {"area", "poi"}


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
    from src.agents.option_state import (
        default_option_fields, option_field, option_schema_from_result,
        resolve_option_default, validate_explicit_multi_value_group,
    )
    from src.function_calling.tools.product_tools import CanonicalProductOptionRef, execute_get_product_options

    product_name = str(item.get("product_name") or "")
    product_id = str(item.get("product_id") or "").strip()
    if product_id:
        option_result = execute_get_product_options(CanonicalProductOptionRef(product_name, product_id))
    else:
        option_result = execute_get_product_options(product_name)
    if (option_result.get("status") == "ok" and product_id
            and option_result.get("product_id")
            and str(option_result["product_id"]) != product_id):
        return {}, {**option_result, "identity_error": {
            "expected_product_id": product_id,
            "actual_product_id": str(option_result["product_id"]),
        }}
    groups = _parse_option_groups(option_result) if option_result.get("status") == "ok" else {}
    option_schema = option_schema_from_result(option_result) if option_result.get("status") == "ok" else []
    schema_by_name = {_norm(group.get("name")): group for group in option_schema}
    text = _norm(message)
    field_defaults = default_option_fields(message)
    changes: Dict[str, Any] = {}
    for group_name, values in groups.items():
        group = _norm(group_name)
        schema_group = schema_by_name.get(group) or {
            "name": group_name,
            "values": [_clean_option_text(value) for value in values],
            "multiple": "topping" in group,
        }
        field = option_field(group_name)
        matches = [_clean_option_text(value) for value in values
                   if _norm(_clean_option_text(value)) and re.search(
                       r"(?<!\w)" + re.escape(_norm(_clean_option_text(value))) + r"(?!\w)", text
                   )]
        if field in field_defaults and not matches:
            default = resolve_option_default(schema_group, option_result.get("product_data"))
            if default is not None:
                changes[field] = default
                continue
        if "topping" in group:
            current = list(item.get("toppings") or [])
            # An explicit topping list is atomic. Do not silently keep only
            # its valid subset and PATCH a state the customer did not request.
            validation = (validate_explicit_multi_value_group(
                message,
                {"name": group_name, "values": [_clean_option_text(value) for value in values],
                 "multiple": True},
                option_schema=option_schema,
            ) if matches else None)
            if validation and validation["invalid_values"]:
                return {}, {**option_result, "validation_error": validation}
            clause_match = re.search(r"\b(?:topping|toping|do kem)\b[^,;]*", text)
            if clause_match:
                clause_start = max(text.rfind(",", 0, clause_match.start()), text.rfind(";", 0, clause_match.start())) + 1
                topping_clause = text[clause_start:clause_match.end()]
            else:
                topping_clause = text
            remove_action = bool(re.search(r"\b(?:bo|xoa|khong lay|khong them)\b", topping_clause))
            add_action = bool(re.search(r"\b(?:them|nua)\b", topping_clause))
            if remove_action:
                normalized_matches = {_norm(value) for value in matches}
                changes["toppings"] = [value for value in current if _norm(value) not in normalized_matches] if matches else []
            elif matches:
                changes["toppings"] = list(dict.fromkeys(current + matches if add_action else matches))
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


def _option_validation_reply(item: Dict[str, Any], option_result: Dict[str, Any]) -> Optional[str]:
    if option_result.get("identity_error"):
        return (f"Mình chưa xác minh được tùy chọn đúng cho {item.get('product_name')}. "
                "Giỏ hàng chưa thay đổi. Bạn có thể thử lại.")
    if option_result.get("status") not in {None, "ok", "not_found"}:
        return (f"Bạn muốn đổi gì cho {item.get('product_name')}? "
                f"Mình đã xác định đúng món nhưng hiện chưa lấy được tùy chọn. "
                "Giỏ hàng chưa thay đổi. Bạn có thể thử lại.")
    error = option_result.get("validation_error") or {}
    if not error:
        return None
    invalid = ", ".join(map(str, error.get("invalid_values") or []))
    allowed = ", ".join(map(str, error.get("allowed_values") or []))
    return (f"{error.get('field') or 'Tùy chọn'} {invalid} không áp dụng cho "
            f"{item.get('product_name')}. Giỏ hàng chưa thay đổi. "
            f"Các lựa chọn hợp lệ: {allowed}.")


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
            _advance_checkout_if_ready, _branch_choice_prompt, _literal_address_from_message,
            _resolve_pending_branch_choice, _run_agent_impl,
        )
        resolved = _resolve_pending_branch_choice(session_id, message, history=state.get("history") or [])
        if resolved:
            if (cart_manager.get_branch(session_id)
                    and (cart_manager.get_pending_action(session_id) or {}).get("type") != "select_branch"):
                return _advance_checkout_if_ready(session_id, resolved)
            return resolved
        if intent.get("branch_reference"):
            return reply(_branch_choice_prompt(session_id))
        from src.agents.location_parser import parse_location
        location = parse_location(message)
        if location.kind in {"address", "area", "poi"} or (
            location.kind == "branch_query" and location.value
            and not re.search(r"\b(?:số|thứ)\s*\d+\b", message, re.IGNORECASE)
        ):
            cart_manager.clear_branch(session_id)
            cart_manager.clear_pending_action(session_id)
            return _handle_location_request(state)
        return reply(_branch_choice_prompt(session_id))
    if pending_type == "confirm_address":
        from src.agents.agent_service import _literal_address_from_message, _run_agent_impl
        if _literal_address_from_message(message):
            return _run_agent_impl(session_id, message, history=state.get("history") or [], allow_model_mutations=False)
    if pending_type == "cart_edit_clarification" and decision == "KEEP_CURRENT":
        cart_manager.clear_pending_action(session_id)
        cart_manager.set_checkout_context(session_id, flow_stage="CART_REVIEW")
        return reply("Được nhé, mình giữ món như hiện tại. Bạn muốn thêm món hay hoàn tất giỏ?")
    if pending_type == "cart_edit_clarification":
        return reply("Bạn muốn đặt số lượng bao nhiêu cho món vừa xác định, đổi tùy chọn, xoá món hay giữ nguyên?")
    if pending_type == "select_voucher":
        if decision == "REMOVE_VOUCHER":
            from src.function_calling.tools.voucher_tools import execute_remove_voucher
            removed = execute_remove_voucher(session_id)
            if removed.get("status") == "ok":
                cart_manager.clear_pending_action(session_id)
            return {**reply(removed.get("message", "Chưa thể bỏ mã giảm giá; bạn thử lại nhé.")),
                    "tool_calls_log": [{"tool": "remove_voucher", "result": removed}]}
        if decision == "SKIP_VOUCHER":
            from src.agents.agent_service import _cart_ready_reply
            cart_manager.set_checkout_context(session_id, voucher_decided=True, voucher_offer_pending=None,
                voucher_candidates=None, voucher_code=None, discount_amount=None, checkout_requested=None, flow_stage="CART_READY")
            cart_manager.clear_pending_action(session_id)
            return reply(_cart_ready_reply("Mình sẽ không áp dụng mã giảm giá cho giỏ này."))
        if decision == "SELECT_VOUCHER":
            from src.agents.agent_service import _resolve_pending_voucher_choice
            voucher_message = ("số " + re.search(r"\d+", message).group()
                               if re.fullmatch(r"\s*\d+\s*[.!]?\s*", message) else message)
            reference = {}
            resolved = _resolve_pending_voucher_choice(session_id, voucher_message, reference_out=reference)
            if reference:
                intent.update(decision=reference["semantic_operation"],
                              reference_namespace=reference["reference_namespace"],
                              reference_source=reference["reference_source"])
            if resolved:
                return resolved
            if not prefs.get("voucher_candidates"):
                return _offer_voucher_gate(session_id)
        return reply("Bạn chọn mã theo số trong danh sách, hoặc nói bỏ qua voucher nhé.")
    if pending_type == "confirm_address":
        if decision == "CHANGE_ADDRESS":
            cart_manager.clear_branch(session_id)
            cart_manager.set_checkout_context(session_id, suggested_address=None, location_address=None,
                delivery_address=None, address_confirmed=None, address_change_requested=True,
                store_location=None, location_source=None)
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
                order_id = result.get('order_id', '')
                if result.get("payment_method") == "NGAN_HANG_QR" or result.get("payment_details"):
                    text = f"Mã đơn hàng của bạn là: **{order_id}**. Bạn vui lòng quét mã QR chuyển khoản bên dưới để hoàn tất thanh toán nhé. Sau khi hệ thống nhận được tiền, đơn hàng sẽ tự động được xác nhận ngay!"
                else:
                    text = f"🎉 Đặt hàng thành công! Mã đơn hàng của bạn là: **{order_id}**. Cảm ơn bạn đã ủng hộ!"
            ui_payload = {"qr_payment": result.get("payment_details")} if result.get("payment_details") else {}
            return {**reply(text), "gate": "confirm_checkout", "ui_payload": ui_payload, "tool_calls_log": [{"tool": "confirm_checkout", "result": result}]}
        if decision == "CHANGE":
            if prefs.get("checkout_submission"):
                return reply("Đơn đã gửi xử lý. Bạn xác nhận lại cùng lượt để kiểm tra kết quả trước khi chỉnh sửa nhé.")
            folded = _norm(message)
            clear = {"summary_fingerprint": None, "checkout_action_id": None,
                     "summary_amounts": None, "checkout_submission": None}
            if re.search(r"\b(?:payment|thanh toan|vnpay|cod|qr|tien mat|vi)\b", folded):
                cart_manager.set_checkout_context(session_id, **clear)
                cart_manager.set_checkout_prefs(session_id, payment_method="")
                cart_manager.set_pending_action(session_id, "select_payment", {})
                from src.agents.agent_service import _checkout_choices_prompt
                return reply(_checkout_choices_prompt(session_id, "Mình giữ các phần khác và sẽ đổi phương thức thanh toán."))
            if re.search(r"\b(?:dia chi|noi giao|cho giao)\b", folded):
                cart_manager.clear_branch(session_id)
                cart_manager.set_checkout_context(session_id, **clear, suggested_address=None,
                    location_address=None, delivery_address=None, address_confirmed=None,
                    address_change_requested=True, location_pending=True,
                    store_location=None, location_source=None)
                cart_manager.clear_pending_action(session_id)
                prompt = ("Bạn gửi địa chỉ giao đầy đủ mới nhé." if prefs.get("delivery_type") == "GIAO_TAN_NOI"
                          else "Bạn cho mình khu vực/phường/quận mới để tìm cửa hàng nhé.")
                return reply(prompt)
            if re.search(r"\b(?:ma|voucher|giam gia)\b", folded):
                cart_manager.set_checkout_context(session_id, **clear, voucher_decided=None,
                    voucher_offer_pending=None)
                cart_manager.clear_pending_action(session_id)
                return _offer_voucher_gate(session_id, "Mình giữ giỏ và các lựa chọn khác; mình kiểm tra lại voucher.")
            cart_manager.set_checkout_context(session_id, **clear, checkout_requested=None, flow_stage="CART_REVIEW")
            cart_manager.clear_pending_action(session_id)
            return reply("Mình chưa đặt đơn. Bạn cho mình biết món hoặc phần nào cần chỉnh nhé.")
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


def _profile_address_choice(message: str, candidates: List[Dict[str, Any]]) -> Dict[str, Any] | None:
    """Resolve a saved address only when its number or label is unambiguous."""
    folded = _norm(message)
    if re.search(r"\b(?:dia chi|cho|noi)\s+khac\b|\bkhong\s+(?:lay|dung)\s+dia chi\b", folded):
        return {"other": True}
    if re.search(r"\b(?:dia chi\s+)?mac dinh\b", folded):
        match = next((item for item in candidates if item.get("is_default")), candidates[0] if candidates else None)
        return {"address": match["full_address"]} if match else None
    reference = parse_selection_reference(message, active_namespace="LOCATION_CANDIDATE")
    if (reference.requested and reference.namespace in {None, "LOCATION_CANDIDATE"}
            and 1 <= reference.ordinals[0] <= len(candidates)):
        return {"address": candidates[reference.ordinals[0] - 1]["full_address"]}
    matched = [item for item in candidates if _norm(item.get("label")) and re.search(
        r"(?<!\w)" + re.escape(_norm(item["label"])) + r"(?!\w)", folded)]
    return {"address": matched[0]["full_address"]} if len(matched) == 1 else None


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
            profile_address_candidates=None, location_pending=True, store_location=None,
            location_source=None,
            summary_amounts=None, checkout_action_id=None, checkout_action_expires_at=None)
        if (cart_manager.get_pending_action(session_id) or {}).get("type") == "confirm_address":
            cart_manager.clear_pending_action(session_id)
        return reply("Bạn gửi địa chỉ giao đầy đủ mới nhé." if prefs.get("delivery_type") == "GIAO_TAN_NOI" else
                     "Bạn cho mình khu vực hoặc địa chỉ mới để tìm cửa hàng gần nhất nhé.")
    if not active:
        # A rejected/expired proposal is never resurrected implicitly.  An
        # explicit new saved-address reference, however, is fresh authority to
        # read the current profile and construct a new typed reference.
        reference_text = _norm(state.get("user_message"))
        explicit_saved_reference = bool(
            re.search(r"\b(?:giao|dung|su dung|lay)\b", reference_text)
            and re.search(r"\b(?:dia chi da luu|dia chi (?:trong )?(?:ho so|tai khoan))\b",
                          reference_text)
        )
        if not explicit_saved_reference:
            return reply("Mình chưa có địa chỉ nào đang được tham chiếu. Bạn cho mình khu vực hoặc địa chỉ nhé.")
        from src.function_calling.tools.user_tools import execute_get_user_profile
        profile = execute_get_user_profile(session_id)
        candidates = [{
            "label": str(item.get("label") or "Địa chỉ"),
            "full_address": _clean_profile_address(item.get("full_address")),
            "is_default": bool(item.get("is_default")),
        } for item in profile.get("address_items") or [] if _clean_profile_address(item.get("full_address"))]
        candidates.sort(key=lambda item: not item["is_default"])
        if not candidates:
            fallback = _clean_profile_address(profile.get("default_address"))
            if fallback:
                candidates = [{"label": "Địa chỉ", "full_address": fallback, "is_default": True}]
        profile_log = [{"tool": "get_user_profile", "result": profile}]
        if not candidates:
            result = reply("Tài khoản hiện chưa có địa chỉ đã lưu. Bạn cho mình địa chỉ đầy đủ nhé.")
            result["tool_calls_log"] = profile_log
            return result
        if kind == "reference_question":
            lines = ["Địa chỉ đang lưu trong tài khoản:"]
            lines.extend(f"{index}. {item['label']} — {item['full_address']}"
                         for index, item in enumerate(candidates, 1))
            result = reply("\n".join(lines))
            result["tool_calls_log"] = profile_log
            return result
        if len(candidates) > 1:
            cart_manager.set_checkout_context(
                session_id, suggested_address=candidates[0]["full_address"],
                profile_address_candidates=candidates, location_source="profile_saved",
                address_change_requested=None, location_pending=None,
            )
            cart_manager.set_pending_action(session_id, "select_profile_address", {
                "count": len(candidates),
            })
            lines = ["Bạn muốn dùng địa chỉ đã lưu nào?"]
            lines.extend(f"{index}. {item['label']} — {item['full_address']}"
                         for index, item in enumerate(candidates, 1))
            result = reply("\n".join(lines) + "\nBạn chọn số hoặc tên địa chỉ nhé.")
            result["tool_calls_log"] = profile_log
            return result
        suggested = candidates[0]["full_address"]
        cart_manager.set_checkout_context(
            session_id, suggested_address=suggested, profile_address_candidates=None,
            location_source="profile_saved", address_change_requested=None,
            location_pending=None,
        )
        resolved = _confirm_saved_location(
            session_id, "đúng địa chỉ đó", history=state.get("history") or [],
        )
        if not resolved:
            result = reply("Mình chưa xác định được địa chỉ đã lưu. Bạn thử lại hoặc cho mình địa chỉ khác nhé.")
        else:
            result = _advance_checkout_if_ready(session_id, resolved)
        result["tool_calls_log"] = profile_log + list(result.get("tool_calls_log") or [])
        return result
    resolved = _confirm_saved_location(session_id, "đúng địa chỉ đó", history=state.get("history") or [])
    return _advance_checkout_if_ready(session_id, resolved) if resolved else reply(
        "Mình chưa xác định được địa chỉ đã lưu. Bạn thử lại hoặc cho mình khu vực khác nhé.")


def _location_candidate_choice(message: str, candidates: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Resolve only the explicit location-candidate namespace."""
    text = re.sub(r"\s+", " ", _norm(message)).strip(" .,!?")
    reference = parse_selection_reference(message, active_namespace="LOCATION_CANDIDATE")
    if reference.namespace not in {None, "LOCATION_CANDIDATE"}:
        return {"other_namespace": True}
    if reference.requested:
        ordinal = reference.ordinals[0]
        return ({"candidate": candidates[ordinal - 1], "ordinal": ordinal}
                if 1 <= ordinal <= len(candidates) else {"invalid_ordinal": ordinal})
    matched = []
    for candidate in candidates:
        labels = [candidate.get("normalized_label"), candidate.get("display_address")]
        if any(label and re.search(r"(?<!\w)" + re.escape(_norm(label)) + r"(?!\w)", text)
               for label in labels):
            matched.append(candidate)
    return {"candidate": matched[0]} if len(matched) == 1 else {}


def _location_candidate_result(session_id: str, result: Dict[str, Any], *, query: str,
                               kind: str, transactional: bool) -> bool:
    """Persist bounded ambiguity evidence as one typed pending owner."""
    nearest = next((entry.get("result") or {} for entry in reversed(result.get("tool_calls_log") or [])
                    if entry.get("tool") == "find_nearest_branch"), {})
    candidates = list(nearest.get("location_candidates") or [])[:5]
    if nearest.get("status") not in {"ambiguous", "rejected"} or not candidates:
        return False
    cart_manager.set_checkout_context(session_id, location_candidate_snapshot={
        "query": query, "kind": kind, "transactional": bool(transactional),
        "candidates": candidates,
    })
    cart_manager.set_pending_action(session_id, "select_location_candidate", {
        "count": len(candidates), "status": nearest.get("status"),
    })
    logger.info("[LocationCandidate] decision=clarify candidate_snapshot=%d", len(candidates))
    return True


def _handle_location_request(state: OrderConversationState) -> Dict[str, Any]:
    """Keep location and store turns inside the deterministic branch boundary."""
    from src.agents.location_parser import (
        parse_location, checkout_location, complete_partial_delivery_address, merge_store_location,
    )
    from src.agents.agent_service import _advance_checkout_if_ready, _confirm_saved_location
    from src.function_calling.tools.branch_tools import execute_find_nearest_branch

    session_id = state["session_id"]
    prefs = cart_manager.get_checkout_prefs(session_id)
    force_read_only = bool(state.get("force_read_only_location"))
    transactional_location = bool(prefs.get("checkout_requested")) and not force_read_only
    outside_branch_request = not transactional_location and _is_branch_discovery_request(
        state["user_message"])
    if state.get("location_override"):
        parsed = state["location_override"]
    elif transactional_location:
        parsed = checkout_location(state["user_message"], prefs.get("delivery_type"), bool(
            prefs.get("location_pending") or prefs.get("address_change_requested")
            or prefs.get("partial_delivery_address") or prefs.get("store_location")
            or (cart_manager.get_pending_action(session_id) or {}).get("type") == "collect_store_location"
        ))
    else:
        parsed = parse_location(state["user_message"])
    if outside_branch_request and _is_unaccented_store_discovery(state["user_message"]):
        # In this narrow grammar ``quan`` means quán; "gần đây" is deictic,
        # never a literal map query and may reuse only the retained read-only fact.
        parsed = type(parsed)("branch_query", "")
    if parsed.kind in {"reference", "reference_question", "change_reference"} and not outside_branch_request:
        return _handle_location_reference(state, parsed.kind)
    if parsed.kind == "none":
        original = parse_location(state["user_message"])
        if original.kind in {"reference", "reference_question", "change_reference"}:
            return _handle_location_reference(state, original.kind)
    logger.debug("routing route=LOCATION_QUERY target_source=location location_kind=%s", parsed.kind)

    def reply(message, logs=None):
        return {"reply": message, "checkout_payload": None, "tool_calls_log": logs or [], "error": None}

    if prefs.get("checkout_submission") and transactional_location:
        return reply("Đơn đang được gửi xử lý. Bạn xác nhận lại để kiểm tra kết quả trước khi đổi địa chỉ nhé.")
    pending_now = cart_manager.get_pending_action(session_id) or {}
    explicit_new_location = bool(parsed.kind in {"area", "address", "poi"} and parsed.value)
    if (transactional_location and explicit_new_location
            and (prefs.get("suggested_address") or prefs.get("profile_address_candidates")
                 or pending_now.get("type") == "confirm_address")):
        # The customer answered the saved-address question with a new place.
        # Remove only that proposal owner before normal location resolution.
        cart_manager.clear_branch(session_id)
        cart_manager.set_checkout_context(
            session_id, suggested_address=None, profile_address_candidates=None,
            address_confirmed=None, address_change_requested=True,
            location_address=None, delivery_address=None, branch_candidates=None,
            location_source="explicit_user",
            summary_amounts=None, checkout_action_id=None,
            checkout_action_expires_at=None,
        )
        if pending_now.get("type") == "confirm_address":
            cart_manager.clear_pending_action(session_id)
        prefs = cart_manager.get_checkout_prefs(session_id)
    if transactional_location and prefs.get("delivery_type") in {"MANG_DI", "TAI_CHO"}:
        merged = merge_store_location(prefs.get("store_location"), parsed.value or state["user_message"])
        if merged.get("value"):
            merged_parsed = parse_location(merged["value"])
            parsed = (merged_parsed if merged_parsed.kind in {"area", "address", "poi"}
                      else type(parsed)("poi" if merged.get("kind") == "poi" else "area", merged["value"]))
            cart_manager.set_checkout_context(
                session_id, store_location=merged, location_source="explicit_user",
                location_pending=merged.get("status") == "partial",
            )
            if merged.get("status") == "partial":
                cart_manager.set_pending_action(session_id, "collect_store_location", {
                    "missing": "city" if merged.get("locality") and not merged.get("city") else "locality",
                })
            logger.debug("[LocationState] fulfillment=%s source=explicit_user status=%s has_locality=%s has_city=%s",
                         prefs.get("delivery_type"), merged.get("status"), bool(merged.get("locality")), bool(merged.get("city")))
    if transactional_location and prefs.get("delivery_type") == "GIAO_TAN_NOI" and prefs.get("partial_delivery_address"):
        completed = complete_partial_delivery_address(prefs["partial_delivery_address"], state["user_message"])
        if completed:
            parsed = completed
        elif parsed.kind == "area":
            parsed = parse_location(f"{prefs['partial_delivery_address']}, {parsed.value}")
    if transactional_location and parsed.kind == "address" and prefs.get("delivery_type") == "GIAO_TAN_NOI" and parsed.missing:
        cart_manager.clear_branch(session_id)
        cart_manager.set_checkout_context(session_id, suggested_address=None,
            partial_delivery_address=parsed.value, branch_candidates=None,
            address_confirmed=None, delivery_address=None,
            summary_amounts=None, checkout_action_id=None, checkout_action_expires_at=None)
        return reply(f"Mình đã nhận được {parsed.value}. Bạn cho mình thêm {', '.join(parsed.missing)} để xác định chính xác địa chỉ giao nhé.")
    if transactional_location and prefs.get("delivery_type") == "GIAO_TAN_NOI" and parsed.kind != "address":
        missing = parse_location(prefs.get("partial_delivery_address") or "").missing
        return reply("Bạn bổ sung " + ", ".join(missing) + " cho địa chỉ giao nhé." if missing else
                     "Để giao tận nơi, bạn cho mình số nhà, tên đường, phường/xã và tỉnh/thành phố nhé.")

    read_only_fact = prefs.get("last_resolved_location") or {}
    location = parsed.value or (prefs.get("location_address") if transactional_location else "") or ""
    if not transactional_location and (
        parsed.kind in {"reference", "reference_question"}
        or (parsed.kind == "branch_query" and not location)
        or _is_deictic_location(location)
    ):
        location = str(read_only_fact.get("value") or read_only_fact.get("raw") or "")
    if transactional_location and not location and prefs.get("suggested_address"):
        return reply(f"Bạn đang ở địa chỉ đã lưu {prefs['suggested_address']} hay muốn dùng địa chỉ khác để tìm cửa hàng?")
    if not location:
        return reply("Bạn cho mình biết phường/quận và tỉnh/thành phố đang ở để tìm cửa hàng gần nhất nhé.")

    if transactional_location:
        # A new location in a saved-address prompt replaces that suggestion in
        # the same turn; the existing resolver still owns inventory and branch rules.
        cart_manager.clear_branch(session_id)
        cart_manager.set_checkout_context(session_id, branch_candidates=None, suggested_address=location,
            location_source="explicit_user",
            location_address=None, address_confirmed=None, delivery_address=None,
            address_change_requested=None, partial_delivery_address=None,
            profile_address_candidates=None,
            summary_amounts=None, checkout_action_id=None, checkout_action_expires_at=None)
        result = _confirm_saved_location(
            session_id, "đúng địa chỉ đó", history=state.get("history") or [],
            resolved_location=state.get("resolved_location_candidate"),
        )
        if result:
            nearest = next((entry.get("result") or {} for entry in reversed(result.get("tool_calls_log") or [])
                            if entry.get("tool") == "find_nearest_branch"), {})
            if nearest.get("status") in {"ambiguous", "rejected", "not_found", "provider_error"}:
                # ``suggested_address`` was only a resolver bridge for this new
                # explicit location; it must never recreate confirm_address.
                cart_manager.set_checkout_context(
                    session_id, suggested_address=None, profile_address_candidates=None,
                    address_confirmed=None, address_change_requested=True,
                    location_address=None, delivery_address=None,
                    location_pending=True, location_source="explicit_user",
                )
                if (cart_manager.get_pending_action(session_id) or {}).get("type") == "confirm_address":
                    cart_manager.clear_pending_action(session_id)
            if _location_candidate_result(
                session_id, result, query=location, kind=parsed.kind, transactional=True,
            ):
                return result
        return _advance_checkout_if_ready(session_id, result) if result else reply(
            "Mình chưa xác định được vị trí trên bản đồ. Bạn kiểm tra lại số nhà, tên đường, phường/xã và tỉnh/thành phố nhé."
            if prefs.get("delivery_type") == "GIAO_TAN_NOI" else
            "Mình chưa xác định chính xác khu vực này trên bản đồ. Bạn cho mình thêm phường/quận hoặc tỉnh/thành phố nhé.")

    # An informational lookup must not write branch candidates into a previous
    # cart draft simply because it still has an old fulfillment preference.
    if (not state.get("preserve_read_only_location_fact")
            and parsed.kind in {"area", "address", "poi", "branch_query"}
            and parsed.value and not _is_deictic_location(parsed.value)):
        cart_manager.set_checkout_context(session_id, last_resolved_location={
            "kind": "poi" if parsed.kind == "poi" else "admin_area" if parsed.kind in {"area", "branch_query"} else parsed.kind,
            "raw": parsed.value,
            "value": parsed.value,
            "canonical_label": None,
            "admin_hints": list(parsed.admin_hints),
            "source": "explicit_user",
            "status": "retained",
        })
    branch_args = {"location": location, "session_id": ""}
    if state.get("resolved_location_candidate"):
        branch_args["resolved_location"] = state["resolved_location_candidate"]
    found = execute_find_nearest_branch(**branch_args)
    logs = [{"tool": "find_nearest_branch", "result": found}]
    candidate_result = reply(found.get("message") or "Bạn chọn một địa điểm trong danh sách nhé.", logs)
    if _location_candidate_result(
        session_id, candidate_result, query=location, kind=parsed.kind, transactional=False,
    ):
        return candidate_result
    branches = found.get("branches") or []
    if branches:
        cart_manager.set_checkout_context(session_id, last_branch_discovery_candidates=[
            {**branch, "context": "read_only_branch_discovery"} for branch in branches[:5]
        ])
        lines = [f"Các cửa hàng gần {location}:"]
        for index, branch in enumerate(branches[:5], 1):
            distance = (f" ({branch['khoang_cach_km']} km đường chim bay)"
                        if branch.get("khoang_cach_km") is not None else "")
            lines.append(f"{index}. {branch.get('ten_chi_nhanh')} — {branch.get('dia_chi') or 'chưa có địa chỉ'}{distance}")
        return reply("\n".join(lines), logs)
    if found.get("status") == "not_found":
        if parsed.kind == "poi" and found.get("message"):
            return reply(found["message"], logs)
        return reply("Mình chưa xác định được khu vực này trên bản đồ. Bạn kiểm tra lại phường/xã và tỉnh/thành phố nhé.", logs)
    return reply(found.get("message") or "Mình chưa tìm được cửa hàng lúc này. Bạn thử lại nhé.", logs)


class _UnavailableProductTargets(list):
    """Empty identity result caused by a provider failure, not an empty menu."""


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
        return _UnavailableProductTargets()


def _resolve_ask_more_targets(session_id: str, message: str,
                              interpretation_out: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """Resolve canonical targets using the single shopping language contract."""
    prefs = cart_manager.get_checkout_prefs(session_id)
    ordinals, invalid, requested = _resolve_product_ordinals(session_id, message)
    if requested and invalid:
        return []
    structured = _resolve_structured_references(session_id, message) or []
    snapshot = list(prefs.get("last_product_suggestions") or [])
    seen_snapshot_ids = {str(row.get("product_id")) for row in snapshot}
    for rows in (prefs.get("product_suggestion_snapshots") or {}).values():
        for row in rows:
            identity = str(row.get("product_id") or "")
            if identity and identity not in seen_snapshot_ids:
                snapshot.append(row)
                seen_snapshot_ids.add(identity)
    meaning = interpret_shopping(message, snapshot=snapshot,
                                 ordinal_targets=structured or ordinals,
                                 ordinal_requested=bool(requested), ordinal_invalid=bool(invalid),
                                 focus=structured[0] if len(structured) == 1 else None)
    if interpretation_out is not None:
        interpretation_out["meaning"] = meaning
    if meaning.targets:
        return list(meaning.targets)
    if meaning.ambiguity or requested:
        return []
    # A focused elliptical continuation remains owned by the existing pending
    # context. It must not turn a new family question into an implicit add.
    focus = prefs.get("last_product_focus") or {}
    normalized = _norm(message)
    add_followup = re.search(r"\b(?:them|lay)\s+cho\s+(?:toi|minh)\b", normalized)
    if add_followup and focus.get("product_id") and focus.get("product_name"):
        tail = normalized[add_followup.end():]
        tail = re.sub(r"\b(?:di|nhe|nha|voi|vao|gio|hang|so luong|sl|cai|ly|phan)\b|\d+", " ", tail)
        if not tail.strip():
            return [focus]
    from src.agents.pending_context import has_shopping_topic
    bare_family = (meaning.act == "BROWSE_FAMILY" and
                   is_family_only(message, meaning.family))
    if bare_family or meaning.act == "NOT_APPLICABLE" or not has_shopping_topic(message):
        return []
    # Only identity rows enter this pure resolver. No price or write decision
    # is inferred from the catalog lookup.
    active_catalog = _load_active_product_targets()
    if isinstance(active_catalog, _UnavailableProductTargets):
        if interpretation_out is not None:
            interpretation_out["catalog_unavailable"] = True
        return []
    explicit_id = re.search(r"\b(?:product id|mã sản phẩm|ma san pham|id)\s*[:#]?\s*([\w-]+)\b",
                            message, re.IGNORECASE)
    if explicit_id:
        matches = [row for row in active_catalog
                   if str(row.get("product_id") or "") == explicit_id[1]]
        return matches if len(matches) == 1 else []
    catalog_meaning = interpret_shopping(message, snapshot=snapshot,
                                         active_catalog=active_catalog)
    if interpretation_out is not None:
        interpretation_out["meaning"] = catalog_meaning
    return list(catalog_meaning.targets)


def _resolve_focused_add_target(session_id: str, message: str) -> Optional[Dict[str, Any]]:
    """Resolve an elliptical add only against a previously focused canonical item."""
    focus = cart_manager.get_checkout_prefs(session_id).get("last_product_focus") or {}
    if not focus.get("product_id") or not focus.get("product_name"):
        return None
    from src.agents.shopping_language import is_deictic_selection
    if is_deictic_selection(message):
        return focus
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
    meaning = interpret_shopping(message)
    if meaning.act == "BROWSE_FAMILY" and is_family_only(message, meaning.family):
        return message
    normalized = _norm(message)
    if not re.search(r"\b(?:them|mua|lay|chon)\b", normalized):
        return None
    category = re.search(r"\b(?:banh|do an|nuoc|do uong|ca phe|tra|matcha|pizza|pasta)\b", normalized)
    if not category:
        return None
    candidate = normalized[category.start():]
    return candidate if _menu_search_specs(candidate) else None


def _is_direct_product_selection(message: str, refs: List[Dict[str, Any]]) -> bool:
    """Recognize selection language around a canonical product from the latest list."""
    from src.agents.shopping_language import is_deictic_selection
    return bool(refs) and (interpret_shopping(message, snapshot=refs).act == "ADD_ITEM"
                           or len(refs) == 1 and is_deictic_selection(message))


def _shopping_decision(state: OrderConversationState, tier1_intent: Dict[str, Any],
                       refs: Optional[List[Dict[str, Any]]] = None,
                       interpretation: Optional[Any] = None,
                       catalog_unavailable: bool = False) -> Optional[Dict[str, Any]]:
    """One evidence-based shopping route for pending and ordinary turns."""
    from src.agents.pending_context import classify_pending_reply, looks_like_catalog_query
    message, session_id = state["user_message"], state["session_id"]
    prefs = cart_manager.get_checkout_prefs(session_id)
    meaning = interpretation or interpret_shopping(
        message, snapshot=prefs.get("last_product_suggestions") or [])
    logger.debug("[ShoppingUnderstand] act=%s entity_type=%s entity_source=%s candidate_count=%d "
                 "quantity=%d category=%s family=%s read_only=%s",
                 meaning.act, meaning.entity_type, meaning.reference_source,
                 len(meaning.targets or meaning.ambiguity), meaning.quantity,
                 meaning.category, meaning.family, meaning.read_only)
    refs = refs if refs is not None else _resolve_ask_more_targets(session_id, message)
    if not refs:
        focused = _resolve_focused_add_target(session_id, message)
        refs = [focused] if focused else []
    category_query = _category_search_message(message)
    question = bool(re.search(r"\b(?:co|xem|tim|goi y|menu|thuc don)\b", _norm(message)))
    if meaning.act == "AMBIGUOUS" and meaning.ambiguity:
        return {"intent": "SHOPPING_CLARIFY", "semantic_intent": "AMBIGUOUS",
                "target_kind": "PRODUCT", "candidate_products": list(meaning.ambiguity),
                "family": meaning.family, "search_text": meaning.search_text, "label": meaning.label}
    if meaning.act == "PRODUCT_INFO" and meaning.targets:
        from src.agents.agent_service import _has_product_review_intent
        read_intent = ("PRODUCT_REVIEW" if _has_product_review_intent(message)
                       else "PRODUCT_INFO")
        return {"intent": read_intent, "semantic_intent": read_intent,
                "target_kind": "PRODUCT", "products": list(meaning.targets)}
    if (catalog_unavailable and not refs and meaning.act == "UNKNOWN" and not question
            and not re.search(r"\b(?:va|voi|hoac|hay)\b", _norm(message))
            and re.search(r"\b(?:mua|lay|them|dat)\b|\bcho\s+(?:toi|minh)\b", _norm(message))):
        return {"intent": "SHOPPING_UNAVAILABLE", "semantic_intent": "CATALOG_UNAVAILABLE",
                "target_kind": "NONE"}
    if (not refs and meaning.act == "UNKNOWN" and category_query and not question
            and not re.search(r"\b(?:va|voi|hoac|hay)\b", _norm(message))
            and re.search(r"\b(?:mua|lay|them|dat)\b|\bcho\s+(?:toi|minh)\b", _norm(message))):
        return {"intent": "SHOPPING_CLARIFY", "semantic_intent": "UNKNOWN_PRODUCT",
                "target_kind": "NONE"}
    if category_query and (question or not refs):
        return {"intent": "BROWSING", "semantic_intent": "BROWSE_CATEGORY",
                "target_kind": "CATEGORY", "category_query": category_query}
    evidence = {"has_resolved_product_target": bool(refs),
                "has_resolved_ordinal": bool(refs and re.search(r"\b(?:so|thu|#)\s*\d+\b", _norm(message))),
                "looks_like_catalog_query": looks_like_catalog_query(message)}
    decision = classify_pending_reply(message, "ask_more_items", evidence)
    if refs and (tier1_intent.get("intent") == "ADD_ITEM" or _is_direct_product_selection(message, refs)) \
            and decision != "BROWSING_REQUEST":
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


def _recommendation_offer_decision(message: str) -> str:
    """Resolve a short reply only inside a typed recommendation offer."""
    from src.agents.tier1 import normalize_confirmation_text
    text = normalize_confirmation_text(message)
    if re.search(r"\b(?:khong|thoi|bo qua|khong can|de sau)\b", text):
        return "DECLINE"
    affirmative = bool(re.search(r"\b(?:ok|oke|duoc|da|u|uh|dong y|xem thu)\b", text))
    request = bool(re.search(r"\b(?:goi y|xem thu|xem di)\b", text))
    return "AFFIRM" if affirmative or request else "UNKNOWN"


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
        "This turn is READ ONLY. Answer only the original menu/product information question using catalog tools. "
        "Never claim or promise that you changed or will change a cart, voucher, checkout, branch, or order. "
        "Do not add/remove/update items, offer checkout, or present a business write as pending. "
        "If the message requests a transaction, ask the customer to state the cart action plainly."
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
    prefs_at_entry = cart_manager.get_checkout_prefs(state["session_id"])
    pending_at_entry = cart_manager.get_pending_action(state["session_id"]) or {}
    # A persisted branch list owns branch references before location hints or
    # catalog parsing can reinterpret its numbers. Literal new locations still
    # enter the existing location transition below.
    if pending_at_entry.get("type") == "select_branch":
        reference = parse_selection_reference(state["user_message"], active_namespace="BRANCH")
        if reference.requested and reference.namespace in {None, "BRANCH", "LOCATION_CANDIDATE"}:
            if reference.operation_semantics == "INFO_REFERENCE":
                return {**state, "intent": {"intent": "READ_ONLY_BRANCH_FOLLOWUP",
                    "ordinal": reference.ordinals[0],
                    "branch_candidates": list(prefs_at_entry.get("branch_candidates") or []),
                    "preserve_primary_pending": True}}
            return {**state, "intent": {"intent": "PENDING_BRANCH", "branch_reference": True}}
    target_reply = _cart_target_continuation(state, pending_at_entry)
    if target_reply is not None:
        return {**state, "intent": target_reply}
    cart_quantity = cart_line_quantity_intent(state["user_message"])
    if (cart_quantity and not prefs_at_entry.get("pending_products")
            and not prefs_at_entry.get("pending_product_reference")):
        return {**state, "intent": cart_quantity}
    # Short observational questions use the same canonical context as RAG.
    # Resolve before card selection or pending-option interpretation can consume them.
    from src.rag.authority import knowledge_route
    from src.rag.product_context import resolve_product_context
    read_owner = knowledge_route(state["user_message"])["owner"]
    if read_owner in {"review", "price", "inventory"}:
        reference = {}
        product = resolve_product_context(state["user_message"], state["session_id"],
                                          state.get("selected_product_id"), reference)
        if product or state.get("selected_product_id") or prefs_at_entry.get("last_product_focus"):
            # A known focus cannot authorize substituting another identity.
            # Unresolved references clarify through the current read handler.
            return {**state, "intent": {
                "intent": "PRODUCT_REVIEW" if read_owner == "review" else "PRODUCT_INFO",
                "products": [product] if product else [],
                "info_owner": read_owner, "preserve_primary_pending": True,
                "reference_source": reference.get("reference_source"),
            }}
    retry_focus = prefs_at_entry.get("last_product_focus") or {}
    if retry_focus.get("option_retry_pending") and re.search(
        r"\b(?:thu lai|lam lai|kiem tra lai|tiep tuc)\b", _norm(state["user_message"])
    ):
        return {**state, "intent": {"intent": "ADD_ITEM", "resolved_products": [{
            "product_id": retry_focus["product_id"],
            "product_name": retry_focus["product_name"],
            "category": retry_focus.get("category"),
            "quantity": int(retry_focus.get("quantity") or 1),
        }], "quantity": int(retry_focus.get("quantity") or 1),
            "target_source": "option_metadata_retry"}}
    staged_at_entry = list(prefs_at_entry.get("pending_products") or [])
    pending_at_entry = cart_manager.get_pending_action(state["session_id"])
    if pending_at_entry and pending_at_entry.get("type") == "fill_options" and not staged_at_entry:
        cart_manager.clear_pending_action(state["session_id"])
        return {**state, "intent": {"intent": "PENDING_AMBIGUOUS",
                                    "pending_type": "fill_options", "repaired_orphan": True}}
    if staged_at_entry and not pending_at_entry:
        # Repair an older/orphaned checkpoint conservatively. Staged products
        # have only one deterministic owner; no unrelated live pending action
        # is overwritten here.
        cart_manager.set_pending_action(state["session_id"], "fill_options", {
            "count": len(staged_at_entry),
            "reconciliation": any(item.get("mutation_status") == "outcome_unknown"
                                  for item in staged_at_entry),
        })
        pending_at_entry = cart_manager.get_pending_action(state["session_id"])
    if any(item.get("mutation_status") == "outcome_unknown" for item in staged_at_entry):
        # Reconcile the persisted operation before interpreting this turn as a
        # fresh add, browse request, or generic LLM question.
        return {**state, "intent": {"intent": "FILL_OPTIONS", "reconciliation": True}}
    if staged_at_entry and (pending_at_entry or {}).get("type") == "fill_options":
        from src.agents.option_state import uses_global_option_defaults
        default_frame = set(re.sub(r"\d+", " ", _norm(state["user_message"])).split())
        # Only a whole staged-batch confirmation takes this shortcut. New
        # product names and mixed commands retain the existing interpretation.
        batch_frame = set("toi minh cho giup ban lay chon mon san pham cai ly phan vua nay do roi "
                          "theo mac dinh het tat ca con lai nha nhe di a oi voi cong thuc "
                          "khong can chinh them giu nguyen".split())
        if uses_global_option_defaults(state["user_message"]) and default_frame <= batch_frame:
            return {**state, "intent": {"intent": "FILL_OPTIONS"}}
    selected_id = str(state.get("selected_product_id") or "").strip()
    from src.agents.shopping_language import is_deictic_selection
    card_add = (classify_order_intent(state["user_message"], None).get("intent") == "ADD_ITEM"
                or is_deictic_selection(state["user_message"]))
    if selected_id and card_add:
        # The card supplies an identity hint, never business data. Resolve it
        # again against the active catalog before the normal options flow.
        canonical = next((product for product in _load_active_product_targets()
                          if str(product["product_id"]) == selected_id), None)
        if not canonical:
            return {**state, "intent": {"intent": "PRODUCT_CLARIFY"}}
        return {**state, "intent": {"intent": "ADD_ITEM", "resolved_products": [canonical], "quantity": 1}}
    active_pending = cart_manager.get_pending_action(state["session_id"])
    if (active_pending or {}).get("type") == "shopping_scope_clarification":
        params = active_pending.get("params") or active_pending.get("data") or {}
        candidates = list(params.get("candidate_products") or [])
        text = _norm(state["user_message"])
        if re.fullmatch(r"\s*(?:thoi|bo qua|khong can)\s*[.!]?\s*", text):
            return {**state, "intent": {"intent": "SHOPPING_SCOPE_CANCEL"}}
        if re.search(r"\b(?:xem them|xem cac loai|xem menu|menu)\b", text):
            cart_manager.clear_pending_action(state["session_id"])
            query = "xem " + str(params.get("label") or params.get("search_text") or "menu")
            return {**state, "intent": {"intent": "BROWSING", "category_query": query}}
        reference = parse_selection_reference(state["user_message"], active_namespace="PRODUCT")
        if reference.requested and reference.namespace in {None, "PRODUCT"}:
            ordinal = reference.ordinals[0]
            if 1 <= ordinal <= len(candidates):
                cart_manager.clear_pending_action(state["session_id"])
                return {**state, "intent": {"intent": "ADD_ITEM",
                    "resolved_products": [candidates[ordinal - 1]], "quantity": 1}}
            return {**state, "intent": {"intent": "PENDING_SHOPPING_SCOPE",
                "candidate_products": candidates, "label": params.get("label")}}
        meaning = interpret_shopping(state["user_message"], snapshot=candidates)
        selection_followup = bool(re.search(
            r"\b(?:mua|lay|them|chon|dat)\b|\b(?:cho|lam)\s+(?:toi|minh)\b", text,
        ))
        if len(meaning.targets) == 1 and (meaning.act == "ADD_ITEM" or selection_followup):
            cart_manager.clear_pending_action(state["session_id"])
            return {**state, "intent": {"intent": "ADD_ITEM",
                "resolved_products": list(meaning.targets), "quantity": meaning.quantity}}
        focus = prefs_at_entry.get("last_product_focus") or {}
        focused = next((row for row in candidates
                        if str(row.get("product_id")) == str(focus.get("product_id"))), None)
        if focused and re.search(r"\b(?:mon|cai|san pham)\s+(?:do|vua roi|vua xem)\b", text):
            cart_manager.clear_pending_action(state["session_id"])
            return {**state, "intent": {"intent": "ADD_ITEM",
                "resolved_products": [focused], "quantity": 1}}
        explicit = classify_order_intent(state["user_message"], None)
        from src.agents.location_parser import parse_location
        explicit_location = parse_location(state["user_message"])
        if explicit.get("intent") in {
            "ADD_ITEM", "BROWSING",
            "VIEW_CART", "CLEAR_CART", "REMOVE_ITEM", "SET_QUANTITY", "EDIT_OPTIONS",
            "START_CHECKOUT", "SELECT_FULFILLMENT", "SELECT_PAYMENT", "PAYMENT_INFO",
        } or (explicit_location.kind in {"area", "address", "poi"} and explicit_location.value):
            cart_manager.clear_pending_action(state["session_id"])
            active_pending = None
        else:
            return {**state, "intent": {"intent": "PENDING_SHOPPING_SCOPE",
                "candidate_products": candidates, "label": params.get("label")}}
    if (active_pending or {}).get("type") == "confirm_prior_location_for_checkout":
        from src.agents.location_parser import checkout_location
        from src.agents.pending_context import classify_pending_reply
        explicit = classify_order_intent(state["user_message"], None)
        explicit_location = checkout_location(
            state["user_message"], prefs_at_entry.get("delivery_type"), True,
        )
        read_only_intents = {"BROWSING", "VIEW_CART", "PAYMENT_INFO"}
        transactional_intents = {
            "ADD_ITEM", "CLEAR_CART", "REMOVE_ITEM", "SET_QUANTITY",
            "EDIT_OPTIONS", "FINISH_CART", "START_CHECKOUT", "SELECT_FULFILLMENT", "SELECT_PAYMENT",
            "SELECT_VOUCHER", "APPLY_VOUCHER", "REMOVE_VOUCHER", "REPLACE_VOUCHER",
        }
        if explicit.get("intent") in read_only_intents:
            return {**state, "intent": explicit}
        if explicit.get("intent") in transactional_intents:
            # Tier-1 proves supersession but is not always execution-ready.
            # Clear only this owner, then let the normal pipeline attach
            # canonical products, voucher codes, checkout patches and targets.
            cart_manager.clear_pending_action(state["session_id"])
            active_pending = None
        elif explicit_location.kind in {"area", "address", "poi"}:
            cart_manager.clear_pending_action(state["session_id"])
            return {**state, "intent": {"intent": "LOCATION_QUERY",
                                        "location_kind": explicit_location.kind}}
        else:
            decision = classify_pending_reply(
                state["user_message"], "confirm_prior_location_for_checkout",
            )
            params = active_pending.get("params") or active_pending.get("data") or {}
            logger.debug("[ConversationResume] pending=confirm_prior_location_for_checkout decision=%s", decision)
            if decision == "CONFIRM":
                return {**state, "intent": {"intent": "PRIOR_LOCATION_REUSE_CONFIRM", "params": params}}
            if decision == "DECLINE":
                return {**state, "intent": {"intent": "PRIOR_LOCATION_REUSE_DECLINE"}}
            return {**state, "intent": {"intent": "PENDING_PRIOR_LOCATION_REUSE", "params": params}}
    if (active_pending or {}).get("type") == "offer_branch_search":
        from src.agents.location_parser import parse_location
        from src.agents.pending_context import classify_pending_reply
        explicit = classify_order_intent(state["user_message"], None)
        explicit_location = parse_location(state["user_message"])
        if _is_branch_discovery_request(state["user_message"]):
            cart_manager.clear_pending_action(state["session_id"])
            return {**state, "intent": {"intent": "LOCATION_QUERY",
                                        "location_kind": explicit_location.kind}}
        superseding = explicit.get("intent") in {
            "BROWSING", "ADD_ITEM", "VIEW_CART", "CLEAR_CART", "REMOVE_ITEM", "SET_QUANTITY",
            "EDIT_OPTIONS", "START_CHECKOUT", "SELECT_FULFILLMENT", "SELECT_PAYMENT",
            "SELECT_VOUCHER", "APPLY_VOUCHER", "REMOVE_VOUCHER", "REPLACE_VOUCHER", "PAYMENT_INFO",
        } or has_transaction_evidence(state["user_message"])
        if superseding:
            cart_manager.clear_pending_action(state["session_id"])
            active_pending = None
        else:
            decision = classify_pending_reply(state["user_message"], "offer_branch_search")
            params = active_pending.get("params") or active_pending.get("data") or {}
            logger.debug("[ConversationResume] pending=offer_branch_search decision=%s", decision)
            if decision == "CONFIRM":
                return {**state, "intent": {"intent": "BRANCH_OFFER_ACCEPT", "params": params}}
            if decision == "DECLINE":
                return {**state, "intent": {"intent": "BRANCH_OFFER_DECLINE"}}
            return {**state, "intent": {"intent": "PENDING_BRANCH_OFFER", "params": params}}
    if (active_pending or {}).get("type") == "select_location_candidate":
        from src.agents.location_parser import parse_location
        snapshot = prefs_at_entry.get("location_candidate_snapshot") or {}
        candidates = list(snapshot.get("candidates") or [])
        explicit = classify_order_intent(state["user_message"], None)
        meaning = interpret_shopping(
            state["user_message"], snapshot=prefs_at_entry.get("last_product_suggestions") or [],
        )
        from src.agents.agent_service import _explicit_checkout_choices
        checkout_patch = _explicit_checkout_choices(state["user_message"])
        if checkout_patch:
            checkout_intent = ("SELECT_FULFILLMENT" if "delivery_type" in checkout_patch
                               else "SELECT_PAYMENT")
            if checkout_intent == "SELECT_FULFILLMENT":
                cart_manager.clear_pending_action(state["session_id"])
            return {**state, "intent": {"intent": checkout_intent,
                "checkout_patch": checkout_patch}}
        reference = parse_selection_reference(state["user_message"])
        if explicit.get("intent") in {"PAYMENT_INFO", "VIEW_CART"}:
            return {**state, "intent": {**explicit, **({"ordinal": reference.ordinals[0]}
                if reference.requested and reference.namespace == "PAYMENT" else {})}}
        if meaning.act == "PRODUCT_INFO" and meaning.targets:
            from src.agents.agent_service import _has_product_review_intent
            read_intent = ("PRODUCT_REVIEW" if _has_product_review_intent(state["user_message"])
                           else "PRODUCT_INFO")
            return {**state, "intent": {"intent": read_intent,
                "products": list(meaning.targets), "preserve_primary_pending": True}}
        if explicit.get("intent") in {"SELECT_FULFILLMENT", "SELECT_PAYMENT"}:
            if explicit.get("intent") == "SELECT_FULFILLMENT":
                cart_manager.clear_pending_action(state["session_id"])
            return {**state, "intent": {**explicit,
                "checkout_patch": _explicit_checkout_choices(state["user_message"])}}
        shopping_intents = {
            "ADD_ITEM", "BROWSING", "CLEAR_CART", "REMOVE_ITEM",
            "SET_QUANTITY", "EDIT_OPTIONS",
        }
        shopping_turn = (explicit.get("intent") in shopping_intents
                         or meaning.act in {"ADD_ITEM", "BROWSE_FAMILY", "AMBIGUOUS"})
        choice = _location_candidate_choice(state["user_message"], candidates)
        if shopping_turn or choice.get("other_namespace"):
            cart_manager.clear_pending_action(state["session_id"])
            active_pending = None
        elif choice.get("candidate"):
            return {**state, "intent": {"intent": "LOCATION_CANDIDATE_SELECT",
                "candidate": choice["candidate"], "ordinal": choice.get("ordinal"),
                "location_snapshot": snapshot}}
        elif choice.get("invalid_ordinal") is not None:
            return {**state, "intent": {"intent": "LOCATION_CANDIDATE_INVALID",
                "ordinal": choice["invalid_ordinal"], "candidate_count": len(candidates)}}
        else:
            explicit_location = parse_location(state["user_message"])
            if explicit_location.kind in {"area", "address", "poi"} and explicit_location.value:
                cart_manager.clear_pending_action(state["session_id"])
                cart_manager.set_checkout_context(
                    state["session_id"], location_candidate_snapshot=None,
                    selected_location_candidate=None,
                )
                return {**state, "intent": {"intent": "LOCATION_QUERY",
                    "location_kind": explicit_location.kind}}
            return {**state, "intent": {"intent": "PENDING_LOCATION_CANDIDATE",
                "candidate_count": len(candidates)}}

    # A saved-address/location owner governs short answers, not an explicit
    # shopping or cart command in a new domain.
    profile_owner = bool(
        prefs_at_entry.get("checkout_requested") and prefs_at_entry.get("profile_address_candidates")
    )
    location_owner = (active_pending or {}).get("type") in {"confirm_address", "collect_store_location"}
    if location_owner or profile_owner:
        explicit = classify_order_intent(state["user_message"], None)
        meaning = interpret_shopping(
            state["user_message"], snapshot=prefs_at_entry.get("last_product_suggestions") or [],
        )
        if explicit.get("intent") == "PAYMENT_INFO":
            return {**state, "intent": explicit}
        if explicit.get("intent") in {
            "VIEW_CART", "CLEAR_CART", "REMOVE_ITEM", "SET_QUANTITY", "EDIT_OPTIONS",
        }:
            if location_owner:
                cart_manager.clear_pending_action(state["session_id"])
            return {**state, "intent": explicit}
        if explicit.get("intent") in {"ADD_ITEM", "BROWSING"} and meaning.act == "UNKNOWN":
            if location_owner:
                cart_manager.clear_pending_action(state["session_id"])
            return {**state, "intent": (
                {**explicit, "category_query": state["user_message"]}
                if explicit.get("intent") == "BROWSING" else
                {"intent": "SHOPPING_CLARIFY", "semantic_intent": "UNKNOWN_PRODUCT"}
            )}
        if meaning.act == "ADD_ITEM" and meaning.targets:
            if location_owner:
                cart_manager.clear_pending_action(state["session_id"])
            return {**state, "intent": {"intent": "ADD_ITEM",
                "resolved_products": list(meaning.targets), "quantity": meaning.quantity}}
        if meaning.act == "AMBIGUOUS" and meaning.ambiguity:
            if location_owner:
                cart_manager.clear_pending_action(state["session_id"])
            return {**state, "intent": {"intent": "SHOPPING_CLARIFY",
                "semantic_intent": "AMBIGUOUS", "candidate_products": list(meaning.ambiguity),
                "family": meaning.family, "search_text": meaning.search_text, "label": meaning.label}}
        if meaning.act == "BROWSE_FAMILY":
            if location_owner:
                cart_manager.clear_pending_action(state["session_id"])
            return {**state, "intent": {"intent": "BROWSING",
                "semantic_intent": "BROWSE_FAMILY", "category_query": state["user_message"]}}
    # Transaction language is arbitrated before catalog parsing. A missed
    # mutation grammar must never be reinterpreted as a product search.
    transaction_turn = has_transaction_evidence(state["user_message"])
    shopping_interpretation: Dict[str, Any] = {}
    initial_refs = _resolve_ask_more_targets(
        state["session_id"], state["user_message"], shopping_interpretation)
    direct_product_selection = _is_direct_product_selection(state["user_message"], initial_refs)
    catalog_constraints = (None if transaction_turn or direct_product_selection or (
        active_pending and active_pending.get("type") != "ask_more_items"
    ) else parse_catalog_constraints(state["user_message"]))
    if catalog_constraints:
        if cart_manager.get_checkout_prefs(state["session_id"]).get("pending_product_reference"):
            _close_pending_reference_batch(state["session_id"])
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
    if (pending or {}).get("type") == "offer_recommendation":
        params = pending.get("params") or pending.get("data") or {}
        explicit = classify_order_intent(state["user_message"], None)
        decision = _recommendation_offer_decision(state["user_message"])
        if decision == "AFFIRM":
            logger.debug("[DialogueState] pending=offer_recommendation decision=AFFIRM action=RECOMMEND category=%s",
                         params.get("category") or "all")
            return {**state, "intent": {"intent": "RECOMMENDATION_OFFER_ACCEPT",
                "category": params.get("category") or "all"}}
        if decision == "DECLINE":
            return {**state, "intent": {"intent": "RECOMMENDATION_OFFER_DECLINE"}}
        if explicit.get("intent") == "BROWSING":
            cart_manager.clear_pending_action(state["session_id"])
        else:
            return {**state, "intent": {"intent": "PENDING_RECOMMENDATION_OFFER",
                "category": params.get("category") or "all"}}
    profile_candidates = list(prefs_before.get("profile_address_candidates") or [])
    if profile_candidates and prefs_before.get("checkout_requested"):
        choice = _profile_address_choice(state["user_message"], profile_candidates)
        if choice:
            return {**state, "intent": {"intent": "PROFILE_ADDRESS_CHOICE", "choice": choice}}
        from src.agents.location_parser import checkout_location
        explicit = checkout_location(state["user_message"], prefs_before.get("delivery_type"))
        if explicit.kind in {"area", "address", "poi"}:
            return {**state, "intent": {"intent": "LOCATION_QUERY", "location_kind": explicit.kind}}
        return {**state, "intent": {"intent": "PROFILE_ADDRESS_CHOICE", "choice": None}}
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
        reference = parse_selection_reference(state["user_message"])
        if (reference.requested and reference.namespace == "PAYMENT"
                and reference.operation_semantics == "INFO_REFERENCE"):
            return {**state, "intent": {"intent": "PAYMENT_INFO",
                "ordinal": reference.ordinals[0], "preserve_primary_pending": True}}
        checkout_patch = pending_checkout_choice(pending_type, state["user_message"])
        if checkout_patch is not None:
            if checkout_patch:
                return {**state, "intent": {"intent": "SELECT_PAYMENT" if "payment_method" in checkout_patch else "SELECT_FULFILLMENT",
                                          "target_kind": "NONE", "checkout_patch": checkout_patch}}
            return {**state, "intent": {"intent": "PENDING_CHECKOUT_CHOICE", "pending_type": pending_type,
                                        "checkout_choice_issue": (
                                            "ambiguous" if pending_type == "select_checkout_choices" else "invalid"
                                        )}}
        # Text choices belong to the same pending gate as numbered choices.
        # Resolve both fields before general intent and catalog routing.
        from src.agents.agent_service import _checkout_choice_conflict, _explicit_checkout_choices
        conflict = _checkout_choice_conflict(state["user_message"])
        if conflict:
            return {**state, "intent": {"intent": "CHECKOUT_CHOICE_CONFLICT", "slot": conflict}}
        checkout_patch = _explicit_checkout_choices(state["user_message"])
        if checkout_patch:
            return {**state, "intent": {"intent": "SELECT_FULFILLMENT" if "delivery_type" in checkout_patch else "SELECT_PAYMENT",
                                       "target_kind": "NONE", "checkout_patch": checkout_patch}}
        preview_intent = classify_order_intent(state["user_message"], None)
        if preview_intent.get("intent") == "PAYMENT_INFO":
            return {**state, "intent": preview_intent}
        from src.agents.pending_context import looks_like_catalog_query
        if preview_intent.get("intent") not in {
            "ADD_ITEM", "VIEW_CART", "CLEAR_CART", "REMOVE_ITEM", "SET_QUANTITY", "EDIT_OPTIONS",
        } and not looks_like_catalog_query(state["user_message"]):
            return {**state, "intent": {"intent": "PENDING_CHECKOUT_CHOICE", "pending_type": pending_type}}
    intent = classify_order_intent(state["user_message"], (pending or {}).get("type"))
    plain_intent = classify_order_intent(state["user_message"], None)
    if (prefs_before.get("flow_stage") in {"CART_REVIEW", "CART_READY"}
            and not (state.get("cart") or {}).get("is_empty")
            and pending_type in {None, "ask_more_items"}
            and not prefs_before.get("pending_products")
            and not prefs_before.get("pending_product_reference")
            and not prefs_before.get("checkout_submission")
            and has_finish_cart_evidence(state["user_message"])):
        intent = {"intent": "FINISH_CART"}
        plain_intent = intent
    logger.debug(
        "[OrderRouter] stage=%s pending=%s intent=%s source=%s",
        prefs_before.get("flow_stage") or "BROWSING",
        (pending or {}).get("type") or "none",
        intent.get("intent"),
        "structural_transaction" if transaction_turn else "positive_read_or_general",
    )
    if (pending or {}).get("type") == "fill_options" and intent.get("intent") == "FILL_OPTIONS":
        return {**state, "intent": intent}
    voucher_command = _voucher_command(state["user_message"])
    if voucher_command:
        intent = voucher_command
        plain_intent = voucher_command
    voucher_reference = parse_selection_reference(state["user_message"])
    if (voucher_reference.requested and voucher_reference.namespace == "VOUCHER"
            and voucher_reference.operation_semantics == "INFO_REFERENCE"):
        return {**state, "intent": {"intent": "VOUCHER_INFO",
            "ordinal": voucher_reference.ordinals[0], "preserve_primary_pending": True}}
    if intent.get("intent") == "PAYMENT_INFO":
        reference = parse_selection_reference(state["user_message"])
        return {**state, "intent": {**intent, **({"ordinal": reference.ordinals[0]}
            if reference.requested and reference.namespace == "PAYMENT" else {})}}
    if (not pending_type and intent.get("intent") != "VIEW_CART"
            and _is_voucher_info_query(state["user_message"])):
        return {**state, "intent": {"intent": "VOUCHER_INFO"}}
    if (pending_type in {"select_voucher", "confirm_checkout"}
            and plain_intent.get("intent") == "BROWSING"
            and has_positive_browsing_evidence(state["user_message"])):
        return {**state, "intent": {**plain_intent, "preserve_primary_pending": True,
                                     "category_query": state["user_message"]}}
    if (pending or {}).get("type") and plain_intent.get("intent") in {
        "CLEAR_CART", "REMOVE_ITEM", "SET_QUANTITY", "VIEW_CART",
        "FINISH_CART", "START_CHECKOUT", "SELECT_FULFILLMENT", "SELECT_PAYMENT", "SELECT_VOUCHER",
        "APPLY_VOUCHER", "REMOVE_VOUCHER", "REPLACE_VOUCHER", "PAYMENT_INFO", "EDIT_OPTIONS",
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
    if (pending or {}).get("type") == "fill_options" and intent.get("intent") not in {
        "CLEAR_CART", "REMOVE_ITEM", "SET_QUANTITY", "VIEW_CART", "START_CHECKOUT",
        "SELECT_FULFILLMENT", "SELECT_PAYMENT", "SELECT_VOUCHER",
    }:
        from src.agents.option_state import mentions_pending_option_value
        if not prefs_before.get("pending_product_reference") and mentions_pending_option_value(state["user_message"],
                                         cart_manager.get_checkout_prefs(state["session_id"]).get("pending_products") or []):
            return {**state, "intent": {"intent": "FILL_OPTIONS"}}
    from src.agents.location_parser import parse_location, checkout_location, complete_partial_delivery_address
    location = parse_location(state["user_message"])
    from src.agents.pending_context import classify_pending_reply
    prefs = cart_manager.get_checkout_prefs(state["session_id"])
    if pending_type == "collect_store_location":
        hinted = checkout_location(state["user_message"], prefs.get("delivery_type"), True)
        if hinted.kind in {"area", "address", "poi", "branch_query"} and hinted.value:
            return {**state, "intent": {"intent": "LOCATION_QUERY", "location_kind": hinted.kind}}
        return {**state, "intent": {"intent": "PENDING_AMBIGUOUS", "pending_type": pending_type}}
    if (pending_type != "select_branch" and prefs.get("checkout_requested") and prefs.get("delivery_type") in {"MANG_DI", "TAI_CHO"}
            and (prefs.get("location_pending") or prefs.get("address_change_requested"))):
        hinted = checkout_location(state["user_message"], prefs["delivery_type"], True)
        if hinted.kind in {"area", "address", "poi"}:
            return {**state, "intent": {"intent": "LOCATION_QUERY", "location_kind": hinted.kind}}
    if (prefs.get("delivery_type") == "GIAO_TAN_NOI" and prefs.get("partial_delivery_address")
            and complete_partial_delivery_address(prefs["partial_delivery_address"], state["user_message"])):
        return {**state, "intent": {"intent": "LOCATION_QUERY", "location_kind": "address"}}
    incomplete = _incomplete_ordinal_categories(state["user_message"])
    pending_reference = set(prefs.get("pending_product_reference") or [])
    reference_change = _pending_reference_action(state["user_message"], pending_reference, []) if pending_reference else None
    if pending_reference and reference_change not in {"cancel", "abandon"} and plain_intent.get("intent") in {
        "VIEW_CART", "CLEAR_CART", "REMOVE_ITEM", "SET_QUANTITY", "EDIT_OPTIONS", "START_CHECKOUT",
    }:
        if (pending or {}).get("type") == "clear_cart" and plain_intent["intent"] == "CLEAR_CART" and re.search(
            r"\b(dong y|xac nhan|ok|oke)\b", _norm(state["user_message"])):
            return {**state, "intent": {"intent": "CLEAR_CART", "confirmed": True}}
        return {**state, "intent": plain_intent}
    if incomplete or pending_reference:
        reference_message = state["user_message"]
        if len(pending_reference) == 1 and re.fullmatch(r"\s*(?:số|thứ|#)?\s*\d+\s*[.!]?\s*", reference_message, re.IGNORECASE):
            category = next(iter(pending_reference))
            reference_message = ("bánh số " if category == "food" else "nước số ") + re.search(r"\d+", reference_message).group()
        refs = _resolve_all_category_ordinals(state["session_id"], reference_message, state.get("history") or []) or []
        if pending_reference:
            action = _pending_reference_action(state["user_message"], pending_reference, refs)
            if action == "cancel" and refs:
                staged_ids = {str(item.get("product_id")) for item in prefs.get("pending_products") or []}
                if any(str(ref.get("product_id")) not in staged_ids for ref in refs):
                    action = "replace"
            if action in {"cancel", "abandon"}:
                return {**state, "intent": {"intent": "PRODUCT_REFERENCE_CANCEL", "abandon": action == "abandon"}}
            if action == "replace":
                return {**state, "intent": {"intent": "PRODUCT_REFERENCE_PARTIAL",
                                            "resolved_products": refs, "missing_categories": [], "replace_batch": True}}
            if not incomplete and not refs and plain_intent.get("intent") in {"ADD_ITEM", "BROWSING"}:
                _close_pending_reference_batch(state["session_id"])
                pending_reference = set()
                pending = None
                intent = plain_intent
        resolved_categories = {ref.get("category") for ref in refs if ref.get("product_id")}
        still_missing = (pending_reference | incomplete) - resolved_categories
        if incomplete or pending_reference:
            return {**state, "intent": {"intent": "PRODUCT_REFERENCE_PARTIAL",
                                        "resolved_products": refs, "missing_categories": sorted(still_missing)}}
    if intent.get("intent") == "FILL_OPTIONS":
        return {**state, "intent": intent}
    pending_type = (pending or {}).get("type")
    if prefs.get("checkout_requested") and not prefs.get("checkout_submission"):
        from src.agents.agent_service import _checkout_choice_conflict, _explicit_checkout_choices
        conflict = _checkout_choice_conflict(state["user_message"])
        if conflict:
            return {**state, "intent": {"intent": "CHECKOUT_CHOICE_CONFLICT", "slot": conflict}}
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
    # Branch ordinals own their pending list, but an explicit read-only
    # reference may inspect the snapshot without consuming that owner.
    if pending_type == "select_branch":
        active_branch_reference = parse_selection_reference(
            state["user_message"], active_namespace="BRANCH",
        )
        if (active_branch_reference.requested
                and active_branch_reference.namespace == "BRANCH"
                and active_branch_reference.operation_semantics == "INFO_REFERENCE"):
            return {**state, "intent": {
                "intent": "READ_ONLY_BRANCH_FOLLOWUP",
                "ordinal": active_branch_reference.ordinals[0],
                "branch_candidates": list(prefs.get("branch_candidates") or []),
                "preserve_primary_pending": True,
            }}
        if (active_branch_reference.requested
                and active_branch_reference.namespace == "PRODUCT"
                and active_branch_reference.operation_semantics == "INFO_REFERENCE"):
            ordinal_products, invalid_ordinals, _count = _resolve_product_ordinals(
                state["session_id"], state["user_message"],
            )
            if ordinal_products and not invalid_ordinals:
                from src.agents.agent_service import _has_product_review_intent
                read_intent = ("PRODUCT_REVIEW" if _has_product_review_intent(state["user_message"])
                               else "PRODUCT_INFO")
                return {**state, "intent": {
                    "intent": read_intent, "target_kind": "PRODUCT",
                    "products": ordinal_products, "preserve_primary_pending": True,
                }}
        return {**state, "intent": {"intent": "PENDING_BRANCH", "location_kind": location.kind}}
    branch_ordinal, explicit_branch_ordinal, bare_ordinal = _read_only_branch_ordinal(
        state["user_message"]
    )
    branch_snapshot = list(prefs.get("last_branch_discovery_candidates") or [])
    if explicit_branch_ordinal and branch_snapshot:
        return {**state, "intent": {
            "intent": "READ_ONLY_BRANCH_FOLLOWUP", "ordinal": branch_ordinal,
            "branch_candidates": branch_snapshot,
        }}
    if bare_ordinal and branch_snapshot and not pending_type:
        if prefs.get("last_product_suggestions"):
            return {**state, "intent": {"intent": "ORDINAL_CONTEXT_CLARIFY"}}
        return {**state, "intent": {
            "intent": "READ_ONLY_BRANCH_FOLLOWUP", "ordinal": branch_ordinal,
            "branch_candidates": branch_snapshot,
        }}
    if _is_branch_discovery_request(state["user_message"]) or location.kind == "branch_query" or (
        location.kind in {"address", "area", "poi"}
        and (prefs.get("checkout_requested") or pending_type == "confirm_address")
    ):
        return {**state, "intent": {"intent": "LOCATION_QUERY", "location_kind": location.kind,
                                    "read_only_interrupt": bool(
                                        _is_branch_discovery_request(state["user_message"])
                                        and pending_type in {"select_voucher", "confirm_checkout"}
                                    )}}
    if location.kind in {"reference", "reference_question", "change_reference"}:
        return {**state, "intent": {"intent": "LOCATION_REFERENCE", "location_kind": location.kind}}
    if (location.kind in {"address", "area", "poi"}
            and _is_standalone_location_statement(state["user_message"], location.kind)):
        return {**state, "intent": {"intent": "LOCATION_FACT", "location_kind": location.kind,
                                    "location": location}}
    # Visible product ordinals come only from the canonical snapshot. Resolve
    # the complete requested batch before preparing any product or cart write.
    ordinal_products, invalid_ordinals, ordinal_count = _resolve_product_ordinals(
        state["session_id"], state["user_message"])
    from src.agents.agent_service import _has_product_review_intent
    ordinal_review = _has_product_review_intent(state["user_message"])
    if ordinal_count and invalid_ordinals and not pending_type and not ordinal_review:
        return {**state, "intent": {"intent": "PRODUCT_ORDINAL_INVALID",
                                    "invalid_ordinals": invalid_ordinals}}
    ordinal_meaning = interpret_shopping(
        state["user_message"], ordinal_targets=ordinal_products,
        ordinal_requested=bool(ordinal_count), ordinal_invalid=bool(invalid_ordinals))
    if ordinal_count and ordinal_products and ordinal_meaning.act == "PRODUCT_INFO":
        read_intent = "PRODUCT_REVIEW" if ordinal_review else "PRODUCT_INFO"
        return {**state, "intent": {"intent": read_intent, "target_kind": "PRODUCT",
                                    "products": ordinal_products}}
    if (ordinal_count and ordinal_products and not pending_type and not ordinal_review
            and ordinal_meaning.act == "ADD_ITEM"):
        structured_products = _resolve_structured_references(
            state["session_id"], state["user_message"])
        return {**state, "intent": {"intent": "ADD_ITEM", "target_kind": "PRODUCT",
                                    "resolved_products": structured_products or ordinal_products,
                                    "quantity": _extract_add_quantity(state["user_message"]),
                                    "reference_source": "product_snapshot_ordinal"}}
    direct_snapshot_refs = initial_refs
    direct_snapshot_selection = _is_direct_product_selection(state["user_message"], direct_snapshot_refs)
    if intent.get("intent") in {"BROWSING", "UNKNOWN"} and not direct_snapshot_selection and not re.search(r"\b(?:co|xem|tim|goi y|menu|gia|the nao|khong)\b", _norm(state["user_message"])):
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
        pending_meaning = shopping_interpretation.get("meaning") or interpret_shopping(
            state["user_message"], snapshot=prefs.get("last_product_suggestions") or [])
        if pending_meaning.ambiguity:
            return {**state, "intent": {"intent": "SHOPPING_CLARIFY",
                "semantic_intent": "AMBIGUOUS", "target_kind": "PRODUCT",
                "candidate_products": list(pending_meaning.ambiguity),
                "family": pending_meaning.family, "search_text": pending_meaning.search_text,
                "label": pending_meaning.label}}
        from src.agents.pending_context import looks_like_catalog_query
        refs = direct_snapshot_refs
        if not refs:
            focused = _resolve_focused_add_target(state["session_id"], state["user_message"])
            refs = [focused] if focused else []
        evidence = {"has_resolved_product_target": bool(refs),
                    "has_resolved_ordinal": bool(refs and re.search(r"\b(?:so|thu|#)\s*\d+\b", _norm(state["user_message"]))),
                    "looks_like_catalog_query": looks_like_catalog_query(state["user_message"])}
        decision = classify_pending_reply(state["user_message"], pending_type, evidence)
        if refs and _is_direct_product_selection(state["user_message"], refs) and decision != "BROWSING_REQUEST":
            decision = "CONCRETE_ADD"
        if decision == "CONCRETE_ADD" and not refs:
            decision = "WANT_MORE_GENERIC"
        kind = {"DONE": "FINISH_CART", "CONCRETE_ADD": "ADD_ITEM",
                "WANT_MORE_GENERIC": "BROWSING", "BROWSING_REQUEST": "BROWSING"}.get(decision, "PENDING_AMBIGUOUS")
        return {**state, "intent": {"intent": kind, "pending_type": pending_type,
                "pending_decision": decision, "resolved_products": refs,
                "quantity": _extract_add_quantity(state["user_message"])}}
    if pending_type == "select_voucher" and not _category_search_message(state["user_message"]):
        bare_voucher_ordinal = bool(re.fullmatch(r"\s*\d+\s*[.!]?\s*", state["user_message"]))
        voucher_decision = ("SELECT_VOUCHER" if bare_voucher_ordinal
                            else classify_pending_reply(state["user_message"], pending_type))
        if voucher_decision in {"SELECT_VOUCHER", "SKIP_VOUCHER", "REMOVE_VOUCHER"}:
            return {**state, "intent": {"intent": "PENDING_REPLY", "pending_type": pending_type,
                                        "decision": voucher_decision}}
    if pending_type == "confirm_checkout":
        from src.agents.pending_context import is_continue_turn
        if is_continue_turn(state["user_message"]) and not prefs.get("checkout_submission"):
            return {**state, "intent": {"intent": "REVIEW_CHECKOUT_SUMMARY", "target_kind": "NONE"}}
        checkout_decision = classify_pending_reply(state["user_message"], pending_type)
        if checkout_decision == "CONFIRM" or (
            checkout_decision in {"REJECT", "CHANGE"} and intent.get("intent") not in {"ADD_ITEM", "BROWSING"}
        ):
            return {**state, "intent": {"intent": "PENDING_REPLY", "pending_type": pending_type,
                                        "decision": checkout_decision}}
    # Pending decisions are context. A clear shopping request can change course
    # without answering the old voucher/summary question.
    if pending_type in {"select_voucher", "confirm_checkout"} and not prefs.get("checkout_submission"):
        shopping = _shopping_decision(state, intent, direct_snapshot_refs,
            shopping_interpretation.get("meaning"), bool(shopping_interpretation.get("catalog_unavailable"))) if intent.get("intent") in {"ADD_ITEM", "BROWSING", "UNKNOWN"} else None
        if shopping and shopping["intent"] in {"ADD_ITEM", "BROWSING", "SHOPPING_GENERIC", "SHOPPING_CLARIFY"}:
            return {**state, "intent": {**shopping, "resume_shopping": True}}
    if pending_type == "fill_options":
        pending_meaning = shopping_interpretation.get("meaning")
        from src.agents.agent_service import _has_product_review_intent
        review_interrupt = _has_product_review_intent(state["user_message"])
        price_interrupt = bool(re.search(
            r"\b(?:gia\s+(?:hien\s+tai|bao\s+nhieu)|bao\s+nhieu\s+tien|hoi\s+gia)\b",
            _norm(state["user_message"]),
        )) and not review_interrupt
        read_only_targets = list(pending_meaning.targets) if (
            pending_meaning and pending_meaning.act == "PRODUCT_INFO"
        ) else []
        staged_products = list(prefs.get("pending_products") or [])
        if (review_interrupt or price_interrupt) and not read_only_targets:
            text = _norm(state["user_message"])
            named = [row for row in staged_products
                     if _norm(row.get("product_name"))
                     and re.search(r"(?<!\w)" + re.escape(_norm(row["product_name"])) + r"(?!\w)", text)]
            deictic = bool(re.search(r"\b(?:mon|san pham|cai)\s+(?:nay|do|kia)\b", text))
            if len(named) == 1:
                read_only_targets = named
            elif deictic and len(staged_products) == 1:
                read_only_targets = staged_products
        if read_only_targets and (review_interrupt or price_interrupt):
            return {**state, "intent": {
                "intent": "PRODUCT_REVIEW" if review_interrupt else "PRODUCT_INFO",
                "products": read_only_targets,
                "preserve_primary_pending": True,
            }}
        if intent.get("intent") in {
            "CLEAR_CART", "REMOVE_ITEM", "SET_QUANTITY", "VIEW_CART",
            "START_CHECKOUT", "SELECT_FULFILLMENT", "SELECT_PAYMENT", "SELECT_VOUCHER",
        }:
            return {**state, "intent": intent}
        return {**state, "intent": {"intent": "PENDING_AMBIGUOUS", "pending_type": pending_type}}
    edit_pending_params = ((pending or {}).get("params") or (pending or {}).get("data") or {})
    edit_clarification = pending_type == "cart_edit_clarification" or (
        pending_type == "edit_cart_item" and edit_pending_params.get("clarification_type") == "invalid_option"
    )
    if edit_clarification:
        edit_decision = classify_pending_reply(state["user_message"], "cart_edit_clarification")
        if edit_decision == "KEEP_CURRENT":
            return {**state, "intent": {"intent": "PENDING_REPLY", "pending_type": "cart_edit_clarification",
                                        "decision": edit_decision}}
    else:
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
    # A normalized product word can resemble a transaction verb. A unique
    # canonical selection with shopping ADD evidence resolves that ambiguity.
    shopping_meaning = shopping_interpretation.get("meaning")
    if (not pending_type and intent.get("intent") == "TRANSACTION_AMBIGUOUS"
            and shopping_meaning and shopping_meaning.act == "ADD_ITEM"
            and len(shopping_meaning.targets) == 1 and len(initial_refs) == 1):
        return {**state, "intent": {"intent": "ADD_ITEM",
            "resolved_products": list(shopping_meaning.targets), "quantity": shopping_meaning.quantity}}
    # A named product after "đặt hàng" is a shopping selection. Bare order
    # wording and turns owned by a pending checkout stay with checkout.
    order_meaning = shopping_interpretation.get("meaning")
    if not pending_type and re.search(r"\bdat hang\b", _norm(state["user_message"])) and order_meaning:
        if order_meaning.act == "ADD_ITEM" and order_meaning.targets:
            return {**state, "intent": {"intent": "ADD_ITEM",
                "resolved_products": list(order_meaning.targets), "quantity": order_meaning.quantity}}
        if order_meaning.act == "BROWSE_FAMILY":
            return {**state, "intent": {"intent": "BROWSING",
                "category_query": state["user_message"]}}
        if order_meaning.act == "AMBIGUOUS" and order_meaning.ambiguity:
            return {**state, "intent": {"intent": "SHOPPING_CLARIFY",
                "candidate_products": list(order_meaning.ambiguity),
                "family": order_meaning.family, "search_text": order_meaning.search_text,
                "label": order_meaning.label}}
    if (prefs.get("summary_fingerprint") or prefs.get("checkout_submission")) and _is_plain_confirmation(state["user_message"]):
        intent = {"intent": "CONFIRM_CHECKOUT"}
    elif (intent.get("intent") != "PAYMENT_INFO"
          and not (intent.get("intent") == "FINISH_CART"
                   and prefs.get("flow_stage") in {"CART_REVIEW", "CART_READY"}
                   and has_finish_cart_evidence(state["user_message"]))
          and _wants_checkout(state["user_message"])):
        intent = {"intent": "START_CHECKOUT"}
    if (pending or {}).get("type") == "clear_cart" and re.search(r"\b(dong y|xac nhan|ok|oke)\b", _norm(state["user_message"])):
        intent = {"intent": "CLEAR_CART", "confirmed": True}
    if (pending or {}).get("type") in {"edit_cart_item", "cart_edit_clarification"}:
        params = (pending.get("params") or pending.get("data") or {})
        resume_edit = bool(re.search(
            r"\b(cap nhat|lam|tien hanh|sua)\b.*\b(di|nhe|luon)?\b",
            _norm(state["user_message"]),
        ))
        if has_cart_edit_action(state["user_message"]) or re.search(
            r"\b(size|nho|vua|lon|topping|toping|hat|foam|tran chau|sua|da|ngot|duong|mac dinh)\b",
            _norm(state["user_message"]),
        ) or (resume_edit and (params.get("requested_patch") or params.get("requested_option_text"))):
            intent = {"intent": "EDIT_OPTIONS", "resume_pending_edit": resume_edit}
        elif plain_intent.get("intent") in {
            "ADD_ITEM", "REMOVE_ITEM", "CLEAR_CART", "SET_QUANTITY", "FINISH_CART",
            "START_CHECKOUT", "SELECT_FULFILLMENT", "SELECT_PAYMENT", "SELECT_VOUCHER",
            "APPLY_VOUCHER", "REMOVE_VOUCHER", "REPLACE_VOUCHER",
        }:
            # An explicit action in another business domain safely supersedes
            # the unfinished edit. Read-only/unknown turns leave it intact.
            cart_manager.clear_pending_action(state["session_id"])
    # “đổi tùy chọn của <món>” is an edit request even before the customer
    # names a particular topping.  Tier1 intentionally cannot infer this from
    # the generic phrase alone, while the graph can safely resolve its cart row.
    if has_cart_edit_action(state["user_message"]):
        intent = {"intent": "EDIT_OPTIONS"}
    # A correction such as “ý tôi là Bánh Matcha 2 cái” continues the latest
    # concrete product discussion. It is an add, never a quantity edit of the
    # previously focused cart line.
    resolved_shopping_meaning = shopping_interpretation.get("meaning")
    if (intent.get("intent") in {"ADD_ITEM", "BROWSING", "UNKNOWN"}
            or (resolved_shopping_meaning and resolved_shopping_meaning.act == "BROWSE_FAMILY")):
        shopping = _shopping_decision(state, intent, direct_snapshot_refs,
            resolved_shopping_meaning, bool(shopping_interpretation.get("catalog_unavailable")))
        if shopping:
            intent = shopping
    return {**state, "intent": intent}


def _persist_branch_candidates_from_result(
    session_id: str,
    result: Dict[str, Any],
) -> None:
    """Preserve the branch-owner snapshot when a provider has no side effect."""
    if ((cart_manager.get_pending_action(session_id) or {}).get("type") != "select_branch"
            or cart_manager.get_checkout_prefs(session_id).get("branch_candidates")):
        return
    candidate_log = next((entry for entry in result.get("tool_calls_log") or []
                          if entry.get("tool") == "find_nearest_branch"), {})
    raw_candidates = list((candidate_log.get("result") or {}).get("branches") or [])
    candidates = [{
        "branch_id": item.get("branch_id") or item.get("ma_chi_nhanh"),
        "branch_name": item.get("branch_name") or item.get("ten_chi_nhanh"),
        "address": item.get("address") or item.get("dia_chi"),
        "distance_km": item.get("distance_km") or item.get("khoang_cach_km"),
        "distance_basis": item.get("distance_basis"),
        "distance_estimated": item.get("distance_estimated"),
        "availability_status": item.get("availability_status"),
        "unavailable_products": item.get("unavailable_products") or [],
        "unverified_products": item.get("unverified_products") or [],
    } for item in raw_candidates]
    if candidates:
        cart_manager.set_checkout_context(session_id, branch_candidates=candidates)


def _execute(state: OrderConversationState) -> OrderConversationState:
    from src.agents.checkout_choices import CHECKOUT_CHOICE_TYPES
    from src.function_calling.tools.cart_tools import (
        execute_clear_cart, execute_get_cart_quote, execute_remove_cart_item, execute_update_cart_item,
        is_authenticated_cart_session,
    )
    session_id, message, cart, intent = state["session_id"], state["user_message"], state["cart"], state["intent"]
    kind = intent.get("intent")
    if kind in {"ADD_ITEM", "PRODUCT_REFERENCE_PARTIAL", "SET_QUANTITY"}:
        from src.agents.option_state import quantity_request_error
        invalid_quantity = quantity_request_error(message)
        if invalid_quantity:
            return {**state, "result": {
                "reply": invalid_quantity + " Giỏ hàng chưa thay đổi.",
                "checkout_payload": None, "tool_calls_log": [], "error": None,
            }}
    if kind in {"SET_QUANTITY", "REMOVE_ITEM", "EDIT_OPTIONS", "ADD_ITEM"}:
        logger.debug("routing route=%s operation=%s target_source=%s", kind, kind,
                     intent.get("target_source") or "resolver")
    cart_write_intents = {"ADD_ITEM", "SET_QUANTITY", "REMOVE_ITEM", "EDIT_OPTIONS", "CLEAR_CART", "FILL_OPTIONS"}
    authoritative_intents = cart_write_intents | {"FINISH_CART", "START_CHECKOUT", "SELECT_FULFILLMENT", "SELECT_PAYMENT", "SELECT_VOUCHER", "APPLY_VOUCHER", "REMOVE_VOUCHER", "REPLACE_VOUCHER", "CONFIRM_CHECKOUT", "PENDING_REPLY", "PENDING_BRANCH", "PENDING_CART_LINE", "PENDING_CHECKOUT_CHOICE", "REVIEW_CHECKOUT_SUMMARY", "LOCATION_REFERENCE", "LOCATION_CANDIDATE_SELECT", "PRIOR_LOCATION_REUSE_CONFIRM"}
    prefs = cart_manager.get_checkout_prefs(session_id)
    replay = intent.get("pending_type") == "confirm_checkout" and intent.get("decision") == "CONFIRM" and (prefs.get("checkout_submission") or prefs.get("completed_order_id"))
    customer_session_id = str(session_id).split(":conversation:", 1)[0]
    real_guest = bool(re.fullmatch(r"anon-[0-9a-fA-F-]{36}", customer_session_id))
    if real_guest and kind in authoritative_intents and kind != "PAYMENT_INFO":
        return {**state, "result": {
            "reply": "Bạn vui lòng đăng nhập trước khi thêm món hoặc bắt đầu đặt hàng. Mình vẫn có thể giúp bạn xem menu, giá, cửa hàng và các phương thức thanh toán.",
            "checkout_payload": None,
            "tool_calls_log": [{"tool": "authentication_gate", "result": {"status": "login_required"}}],
            "error": None,
        }}
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
    if kind == "LOCATION_FACT":
        parsed = intent.get("location")
        value = str(getattr(parsed, "value", "") or message).strip()
        fact = {
            "kind": getattr(parsed, "kind", None) or intent.get("location_kind"),
            "raw": value,
            "value": value,
            "canonical_label": None,
            "admin_hints": list(getattr(parsed, "admin_hints", ()) or ()),
            "source": "explicit_user",
            "status": "retained",
        }
        cart_manager.set_checkout_context(session_id, last_resolved_location=fact,
                                          last_branch_discovery_candidates=None)
        primary = cart_manager.get_pending_action(session_id)
        if primary:
            logger.debug("[ConversationInterrupt] primary=%s temporary=location_info primary_preserved=true",
                         primary.get("type"))
            reply = "Mình đã ghi nhận vị trí này cho cuộc trò chuyện hiện tại."
        else:
            cart_manager.set_pending_action(session_id, "offer_branch_search", {
                "domain": "BRANCH_DISCOVERY", "action": "FIND_NEAREST_BRANCH",
                "location_kind": fact["kind"], "raw_location": value,
                "location": value, "source": "explicit_user",
            })
            logger.debug("[ConversationRoute] owner=branch_discovery entry=location_statement pending=offer_branch_search")
            reply = "Mình đã ghi nhận vị trí này. Bạn có muốn mình tìm cửa hàng gần đó không?"
        return {**state, "result": {"reply": reply, "checkout_payload": None,
                                     "tool_calls_log": [], "error": None}}
    if kind == "BRANCH_OFFER_ACCEPT":
        from src.agents.location_parser import Location
        params = intent.get("params") or {}
        location = str(params.get("location") or params.get("raw_location") or "").strip()
        cart_manager.clear_pending_action(session_id)
        if not location:
            return {**state, "result": {"reply": "Mình chưa có vị trí để tìm cửa hàng. Bạn cho mình khu vực nhé.",
                                         "checkout_payload": None, "tool_calls_log": [], "error": None}}
        resumed = {**state, "preserve_read_only_location_fact": True, "location_override": Location(
            str(params.get("location_kind") or "area"), location,
        )}
        return {**state, "result": _handle_location_request(resumed)}
    if kind == "BRANCH_OFFER_DECLINE":
        cart_manager.clear_pending_action(session_id)
        return {**state, "result": {"reply": "Được nhé. Khi nào cần tìm cửa hàng bạn cứ nói mình.",
                                     "checkout_payload": None, "tool_calls_log": [], "error": None}}
    if kind == "PENDING_BRANCH_OFFER":
        return {**state, "result": {"reply": "Mình đang chờ bạn xác nhận có muốn tìm cửa hàng gần vị trí vừa cung cấp không.",
                                     "checkout_payload": None, "tool_calls_log": [], "error": None}}
    if kind == "PRIOR_LOCATION_REUSE_CONFIRM":
        from src.agents.location_parser import Location
        params = intent.get("params") or {}
        location = str(params.get("location") or "").strip()
        cart_manager.clear_pending_action(session_id)
        if not location:
            cart_manager.set_checkout_context(session_id, location_pending=True)
            return {**state, "result": {
                "reply": "Bạn cho mình khu vực hoặc vị trí để tìm cửa hàng gần nhất nhé.",
                "checkout_payload": None, "tool_calls_log": [], "error": None,
            }}
        resumed = {**state, "location_override": Location(
            str(params.get("location_kind") or "area"), location,
            admin_hints=tuple(params.get("admin_hints") or ()),
        )}
        resolved = _handle_location_request(resumed)
        # The real branch tool persists this snapshot. Preserve the same
        # contract for alternate providers/test doubles that return candidates
        # without a storage side effect.
        _persist_branch_candidates_from_result(session_id, resolved)
        return {**state, "result": resolved}
    if kind == "PRIOR_LOCATION_REUSE_DECLINE":
        cart_manager.clear_pending_action(session_id)
        cart_manager.set_checkout_context(
            session_id, location_pending=True, address_change_requested=True,
        )
        return {**state, "result": {
            "reply": "Được nhé. Bạn cho mình khu vực/phường/quận hoặc vị trí khác để tìm cửa hàng gần nhất.",
            "checkout_payload": None, "tool_calls_log": [], "error": None,
        }}
    if kind == "PENDING_PRIOR_LOCATION_REUSE":
        params = intent.get("params") or {}
        location = str(params.get("location") or "vị trí vừa cung cấp")
        return {**state, "result": {
            "reply": f"Mình đang chờ bạn xác nhận có dùng {location} để tìm cửa hàng cho đơn này không.",
            "checkout_payload": None, "tool_calls_log": [], "error": None,
        }}
    if kind == "VOUCHER_INFO":
        ordinal = int(intent.get("ordinal") or 0)
        current_candidates = list(prefs.get("voucher_candidates") or [])
        if ordinal:
            if not 1 <= ordinal <= len(current_candidates):
                return {**state, "result": {
                    "reply": (f"Danh sách voucher có {len(current_candidates)} lựa chọn nên không có "
                              f"voucher số {ordinal}. Bạn chọn lại số voucher nhé."),
                    "checkout_payload": None, "tool_calls_log": [], "error": None,
                }}
            selected = current_candidates[ordinal - 1]
            amount = float(selected.get("so_tien_giam_du_kien") or selected.get("discount_amount") or 0)
            discount = f"{amount:,.0f}".replace(",", ".")
            code = selected.get("ma_voucher") or selected.get("code")
            name = selected.get("ten_voucher") or selected.get("name") or f"Voucher số {ordinal}"
            return {**state, "result": {
                "reply": (f"{name}" + (f" [Mã: {code}]" if code else "")
                          + f" đang giảm dự kiến {discount}đ cho giỏ hiện tại. Mình chưa áp mã."),
                "checkout_payload": None, "tool_calls_log": [], "error": None,
            }}
        if cart.get("is_empty"):
            voucher_reply = ("Voucher áp dụng phụ thuộc vào các món và giá trị giỏ hàng. "
                             "Bạn chọn món trước rồi mình kiểm tra mã đủ điều kiện nhé.")
            return {**state, "result": {
                "reply": voucher_reply, "checkout_payload": None,
                "tool_calls_log": [], "error": None,
            }}
        from src.function_calling.tools.voucher_tools import execute_get_applicable_vouchers
        listed = execute_get_applicable_vouchers(session_id)
        logs = [{"tool": "get_applicable_vouchers", "result": listed}]
        if listed.get("status") == "error":
            voucher_reply = listed.get("message") or "Mình chưa thể kiểm tra voucher lúc này; bạn thử lại nhé."
        else:
            vouchers = list(listed.get("vouchers") or [])[:4]
            if not vouchers:
                voucher_reply = "Hiện không có mã giảm giá đủ điều kiện cho giỏ hiện tại."
            else:
                candidates = [{
                    "ma_voucher": item.get("ma_voucher"),
                    "ten_voucher": item.get("ten_voucher") or item.get("ten_chuong_trinh"),
                    "so_tien_giam_du_kien": item.get("so_tien_giam_du_kien")
                        or item.get("discount_amount") or item.get("so_tien_giam"),
                } for item in vouchers]
                cart_manager.set_checkout_context(
                    session_id, voucher_candidates=candidates, voucher_offer_pending=True,
                    voucher_offer_snapshot=_voucher_offer_snapshot(session_id),
                )
                if not cart_manager.get_pending_action(session_id):
                    cart_manager.set_pending_action(session_id, "select_voucher", {"count": len(candidates)})
                lines = ["Các mã áp dụng được cho giỏ hiện tại:"]
                for index, item in enumerate(candidates, 1):
                    amount = f"{float(item.get('so_tien_giam_du_kien') or 0):,.0f}".replace(",", ".")
                    lines.append(f"{index}. {item.get('ten_voucher')} [Mã: {item.get('ma_voucher')}] — giảm dự kiến {amount}đ")
                lines.append("Bạn chọn mã theo số nếu muốn áp dụng; mình chưa tự áp mã nào.")
                voucher_reply = "\n".join(lines)
        return {**state, "result": {
            "reply": voucher_reply,
            "checkout_payload": None, "tool_calls_log": logs, "error": None,
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
    if kind == "PAYMENT_INFO":
        ordinal = int(intent.get("ordinal") or 0)
        if ordinal:
            from src.agents.checkout_choices import PAYMENT_LABELS
            if not 1 <= ordinal <= len(PAYMENT_LABELS):
                return {**state, "result": {
                    "reply": f"Danh sách thanh toán có {len(PAYMENT_LABELS)} lựa chọn; không có phương thức số {ordinal}.",
                    "checkout_payload": None, "tool_calls_log": [], "error": None,
                }}
            descriptions = (
                "thanh toán trực tuyến qua cổng VNPAY.",
                "chuyển khoản bằng mã QR ngân hàng.",
                "thanh toán bằng số dư Ví Avengers khi số dư đủ.",
                "bạn thanh toán khi nhận hàng.",
            )
            return {**state, "result": {
                "reply": (f"Phương thức số {ordinal} là {PAYMENT_LABELS[ordinal - 1]}: "
                          f"{descriptions[ordinal - 1]} Mình chưa chọn phương thức này cho đơn."),
                "checkout_payload": None, "tool_calls_log": [], "error": None,
            }}
        from src.function_calling.tools.cart_tools import get_wallet_payment_options
        capabilities = get_wallet_payment_options(session_id, None)
        options = capabilities.get("payment_options") or []
        lines = ["Avengers Coffee hiện hỗ trợ:"] + [f"- {row.get('label') or row.get('code')}" for row in options]
        wallet = next((row for row in options if row.get("code") == "VI_DIEN_TU"), {})
        if wallet.get("reason"):
            lines.append(f"Lưu ý về Ví Avengers: {wallet['reason']}.")
        return {**state, "result": {"reply": "\n".join(lines), "checkout_payload": None,
                                    "tool_calls_log": [{"tool": "payment_capabilities", "result": capabilities}],
                                    "error": None}}
    if kind == "PRODUCT_REVIEW":
        from src.function_calling.tools.product_tools import execute_get_product_insights
        rows = list(intent.get("products") or [])
        if not rows:
            return {**state, "result": {"reply": "Bạn muốn xem đánh giá của món nào?",
                "checkout_payload": None, "tool_calls_log": [], "error": None}}
        lines = []
        logs = []
        for row in rows:
            product_name = str(row.get("product_name") or "").strip()
            insight = execute_get_product_insights(product_name)
            logs.append({"tool": "get_product_insights",
                         "args": {"product_name": product_name}, "result": insight})
            lines.append(insight.get("message") or
                         f"Mình chưa lấy được dữ liệu đánh giá đã xác minh của {product_name} lúc này.")
        return {**state, "result": {"reply": "\n".join(lines),
                                     "checkout_payload": None,
                                     "tool_calls_log": logs, "error": None}}
    if kind == "PRODUCT_INFO":
        rows = list(intent.get("products") or [])
        if not rows:
            return {**state, "result": {"reply": "Bạn muốn hỏi thông tin món nào?",
                "checkout_payload": None, "tool_calls_log": [], "error": None}}
        lines = []
        logs = []
        for row in rows:
            price = row.get("final_price") or row.get("price") or row.get("gia_ban")
            inventory_info = intent.get("info_owner") == "inventory"
            if price is None or inventory_info:
                from src.function_calling.tools.product_tools import execute_check_price_and_stock
                checked = execute_check_price_and_stock(
                    product_name_query=str(row.get("product_name") or ""),
                    branch_id=(cart.get("branch_id") or "Chưa chọn") if inventory_info else "Chưa chọn",
                    session_id=session_id,
                )
                logs.append({"tool": "check_price_and_stock", "args": {
                    "product_name_query": row.get("product_name")}, "result": checked})
                products = list(checked.get("products") or [])
                exact = next((item for item in products
                              if _norm(item.get("product_name")) == _norm(row.get("product_name"))),
                             products[0] if len(products) == 1 else None)
                price = (exact or {}).get("final_price") or (exact or {}).get("price")
                if inventory_info:
                    availability = ((exact or {}).get("availability_status")
                                    if checked.get("status") == "ok" and
                                    str((exact or {}).get("product_id")) == str(row.get("product_id"))
                                    else None)
                    if availability in {"available", "unavailable"}:
                        lines.append(f"{row.get('product_name')}: " +
                                     ("còn hàng tại điểm bán đã chọn." if availability == "available"
                                      else "hiện không có hàng tại điểm bán đã chọn."))
                    else:
                        lines.append(f"Mình chưa xác minh được tồn kho của {row.get('product_name')} tại điểm bán.")
                    continue
            if price is None:
                lines.append(f"Mình chưa xác minh được giá hiện tại của {row.get('product_name')}.")
            else:
                amount = f"{float(price):,.0f}".replace(",", ".")
                lines.append(f"{row.get('product_name')} có giá hiện tại {amount}đ.")
        lines.append("Món chưa được thêm vào giỏ.")
        return {**state, "result": {"reply": "\n".join(lines), "checkout_payload": None,
                                     "tool_calls_log": logs, "error": None}}
    if kind == "PENDING_CHECKOUT_CHOICE":
        from src.agents.agent_service import _checkout_choices_prompt
        issue = intent.get("checkout_choice_issue")
        prefix = (
            "Mình chưa rõ số bạn chọn thuộc danh sách nào."
            if issue == "ambiguous" else
            "Số bạn chọn không hợp lệ với danh sách này."
            if issue == "invalid" else ""
        )
        return {**state, "result": {"reply": _checkout_choices_prompt(session_id, prefix),
                                   "checkout_payload": None, "tool_calls_log": [], "error": None}}
    if kind == "CHECKOUT_CHOICE_CONFLICT":
        subject = "phương thức thanh toán" if intent.get("slot") == "payment" else "hình thức nhận hàng"
        return {**state, "result": {"reply": f"Mình thấy bạn chọn nhiều {subject} khác nhau. Bạn chọn lại một phương án nhé.",
                                   "checkout_payload": None, "tool_calls_log": [], "error": None}}
    if kind == "REVIEW_CHECKOUT_SUMMARY":
        from src.function_calling.tools.cart_tools import execute_request_checkout
        checkout = execute_request_checkout(session_id, reuse_summary=True)
        return {**state, "result": {"reply": checkout.get("message", "Bạn kiểm tra lại đơn hàng nhé."),
                                   "checkout_payload": checkout.get("order_summary") if checkout.get("status") == "require_confirmation" else None,
                                   "tool_calls_log": [{"tool": "request_checkout", "result": checkout}], "error": None}}
    if kind == "LOCATION_CANDIDATE_INVALID":
        count = int(intent.get("candidate_count") or 0)
        ordinal = int(intent.get("ordinal") or 0)
        return {**state, "result": {
            "reply": f"Danh sách địa điểm có {count} lựa chọn nên không có địa điểm số {ordinal}. Bạn chọn lại số địa điểm nhé.",
            "checkout_payload": None, "tool_calls_log": [], "error": None,
        }}
    if kind == "PENDING_LOCATION_CANDIDATE":
        snapshot = cart_manager.get_checkout_prefs(session_id).get("location_candidate_snapshot") or {}
        candidates = list(snapshot.get("candidates") or [])
        lines = ["Mình đang chờ bạn chọn một địa điểm trong danh sách:"]
        lines.extend(
            f"{index}. {row.get('normalized_label') or 'Địa điểm'}"
            + (f" — {row['display_address']}" if row.get("display_address")
               and row.get("display_address") != row.get("normalized_label") else "")
            for index, row in enumerate(candidates, 1)
        )
        lines.append("Bạn chọn số hoặc nói đúng tên địa điểm nhé.")
        return {**state, "result": {"reply": "\n".join(lines), "checkout_payload": None,
                                     "tool_calls_log": [], "error": None}}
    if kind == "LOCATION_CANDIDATE_SELECT":
        from src.agents.location_parser import Location
        candidate = dict(intent.get("candidate") or {})
        snapshot = intent.get("location_snapshot") or {}
        label = str(candidate.get("normalized_label") or candidate.get("display_address") or "").strip()
        cart_manager.clear_pending_action(session_id)
        cart_manager.set_checkout_context(
            session_id, location_candidate_snapshot=None,
            selected_location_candidate=candidate,
        )
        logger.info("[LocationCandidate] decision=select ordinal=%s source=provider",
                    intent.get("ordinal") or "label")
        resumed = {
            **state,
            "force_read_only_location": not bool(snapshot.get("transactional")),
            "resolved_location_candidate": candidate,
            "location_override": Location(
                str(snapshot.get("kind") or "poi"), label,
                admin_hints=tuple((candidate.get("admin_components") or {}).values()),
            ),
        }
        try:
            selected = _handle_location_request(resumed)
            _persist_branch_candidates_from_result(session_id, selected)
        finally:
            cart_manager.set_checkout_context(session_id, selected_location_candidate=None)
        return {**state, "result": selected}
    if kind == "LOCATION_QUERY":
        location_state = ({**state, "force_read_only_location": True}
                          if intent.get("read_only_interrupt") else state)
        return {**state, "result": _handle_location_request(location_state)}
    if kind == "PROFILE_ADDRESS_CHOICE":
        choice = intent.get("choice") or {}
        if choice.get("other"):
            cart_manager.clear_branch(session_id)
            cart_manager.set_checkout_context(session_id, profile_address_candidates=None,
                suggested_address=None, location_pending=True, address_change_requested=True,
                location_address=None, branch_candidates=None, address_confirmed=None,
                delivery_address=None, partial_delivery_address=None,
                store_location=None, location_source=None)
            cart_manager.clear_pending_action(session_id)
            prompt = ("Bạn gửi địa chỉ giao gồm số nhà, tên đường, phường/xã và tỉnh/thành phố nhé."
                      if prefs.get("delivery_type") == "GIAO_TAN_NOI" else
                      "Bạn cho mình khu vực/phường/quận hoặc địa chỉ mới để tìm cửa hàng gần nhất nhé.")
            return {**state, "result": {"reply": prompt, "checkout_payload": None, "tool_calls_log": [], "error": None}}
        if choice.get("address"):
            cart_manager.set_checkout_context(session_id, suggested_address=choice["address"],
                location_source="profile_saved", profile_address_candidates=None, location_pending=None)
            cart_manager.clear_pending_action(session_id)
            from src.agents.agent_service import _confirm_saved_location, _advance_checkout_if_ready
            resolved = _confirm_saved_location(session_id, "đúng địa chỉ đó", history=state.get("history") or [])
            return {**state, "result": _advance_checkout_if_ready(session_id, resolved) if resolved else {
                "reply": "Mình chưa xác định được địa chỉ này. Bạn thử lại nhé.",
                "checkout_payload": None, "tool_calls_log": [], "error": None}}
        return {**state, "result": {"reply": "Bạn chọn số hoặc tên địa chỉ trong danh sách, hoặc nói ‘địa chỉ khác’ nhé.",
                                   "checkout_payload": None, "tool_calls_log": [], "error": None}}
    if kind == "LOCATION_REFERENCE":
        return {**state, "result": _handle_location_reference(state, intent["location_kind"])}
    if kind == "PRODUCT_CLARIFY":
        return {**state, "result": {"reply": "Bạn đang hỏi món nào trong danh sách? Bạn chọn số hoặc nói tên món nhé.",
                                   "checkout_payload": None, "tool_calls_log": [], "error": None}}
    if kind == "PRODUCT_ORDINAL_INVALID":
        invalid = ", ".join(f"#{value}" for value in intent.get("invalid_ordinals") or [])
        return {**state, "result": {
            "reply": f"Số món {invalid} nằm ngoài danh sách đang hiển thị. Bạn chọn lại số trong danh sách nhé.",
            "checkout_payload": None, "tool_calls_log": [], "error": None,
        }}
    if kind == "READ_ONLY_BRANCH_FOLLOWUP":
        candidates = list(intent.get("branch_candidates") or [])
        ordinal = int(intent.get("ordinal") or 0)
        if not 1 <= ordinal <= len(candidates):
            return {**state, "result": {
                "reply": f"Danh sách gần nhất có {len(candidates)} cửa hàng nên không có cửa hàng số {ordinal}. Bạn chọn lại số nhé.",
                "checkout_payload": None, "tool_calls_log": [], "error": None,
            }}
        branch = candidates[ordinal - 1]
        cart_manager.set_checkout_context(session_id, last_branch_focus=branch)
        name = branch.get("ten_chi_nhanh") or branch.get("branch_name") or f"Cửa hàng {ordinal}"
        address = branch.get("dia_chi") or branch.get("address") or "chưa có địa chỉ"
        distance_km = (branch.get("khoang_cach_km")
                       if branch.get("khoang_cach_km") is not None
                       else branch.get("distance_km"))
        distance = (f" Khoảng cách ước tính: {distance_km} km."
                    if distance_km is not None else "")
        availability = ""
        if re.search(r"\b(?:con|du|het|thieu|ton kho)\b", _norm(message)):
            status = str(branch.get("availability_status") or "").lower()
            if status == "available":
                availability = " Còn đủ tất cả món trong giỏ theo danh sách vừa tra."
            elif status == "unavailable":
                availability = " Thiếu món: " + ", ".join(branch.get("unavailable_products") or ["chưa đủ món trong giỏ"]) + "."
            else:
                availability = " Chưa xác minh được tồn kho; chưa thể chọn cửa hàng này."
        return {**state, "result": {
            "reply": f"{name} — {address}.{distance}{availability}",
            "checkout_payload": None, "tool_calls_log": [], "error": None,
        }}
    if kind == "ORDINAL_CONTEXT_CLARIFY":
        return {**state, "result": {
            "reply": "Bạn muốn chọn món số 1 hay xem cửa hàng số 1? Bạn nói rõ ‘món số 1’ hoặc ‘cửa hàng số 1’ nhé.",
            "checkout_payload": None, "tool_calls_log": [], "error": None,
        }}
    if kind == "CART_TARGET_CLARIFY":
        row = intent["cart_row"]
        if _cart_line_id(row):
            cart_manager.set_pending_action(session_id, "cart_edit_clarification", {
                "clarification_type": "cart_target", "cart_item_id": _cart_line_id(row),
                "product_id": row.get("product_id"), "product_name": row.get("product_name"),
                "current_quantity": row.get("quantity"),
                "options": {key: row.get(key) for key in ("size", "toppings", "luong_da", "do_ngot", "loai_sua")},
            })
        logger.debug("routing route=CART_TARGET_CLARIFY operation=NONE target_source=cart_name candidate_count=1")
        return {**state, "result": {"reply": f"Mình đã xác định được {row.get('product_name')} trong giỏ. Bạn muốn sửa số lượng/tùy chọn, xoá món, thêm một phần nữa, hay giữ nguyên?",
                                   "checkout_payload": None, "tool_calls_log": [], "error": None}}
    if kind == "TRANSACTION_AMBIGUOUS":
        text = _norm(message)
        cart_edit_words = bool(re.search(r"\b(sua|chinh|dieu chinh|cap nhat|doi|thay)\b", text))
        rows = list(cart.get("items") or [])
        if cart_edit_words and rows:
            if len(rows) == 1:
                line_id = _cart_line_id(rows[0])
                cart_manager.set_pending_action(session_id, "edit_cart_item", {
                    "operation": "EDIT_OPTIONS", "cart_item_id": line_id,
                    "requested_option_text": None, "requested_patch": {}, "missing": "option",
                })
                reply = (f"Mình đang sửa {rows[0].get('product_name')}. "
                         "Bạn muốn đổi size, topping, đá, độ ngọt hay sữa?")
            else:
                reply = _store_cart_line_choice(session_id, "EDIT_OPTIONS", "", rows)
            return {**state, "result": {"reply": reply, "checkout_payload": None,
                                         "tool_calls_log": [], "error": None}}
        return {**state, "result": {
            "reply": "Mình chưa rõ thao tác bạn muốn thực hiện. Bạn nói rõ món hoặc phần cần cập nhật nhé.",
            "checkout_payload": None, "tool_calls_log": [], "error": None,
        }}
    if kind == "UNKNOWN":
        stage = str(prefs.get("flow_stage") or "")
        if stage == "CART_REVIEW" and not cart.get("is_empty"):
            reply = "Mình chưa rõ bạn muốn thêm món, sửa/xoá món trong giỏ hay hoàn tất giỏ. Bạn nói giúp mình thao tác muốn làm nhé."
        else:
            reply = "Mình chưa hiểu yêu cầu. Bạn có thể nói rõ muốn xem menu, chọn món hay thao tác với giỏ hàng nhé."
        return {**state, "result": {"reply": reply, "checkout_payload": None,
                                     "tool_calls_log": [], "error": None}}
    if kind == "RECOMMENDATION_OFFER_ACCEPT":
        category = intent.get("category") or "all"
        cart_manager.clear_pending_action(session_id)
        logger.debug("[RecommendationOffer] category=%s execution=structured_provider search_text=none", category)
        result = _search_menu_catalog(category=category)
        return {**state, "result": result or {"reply": "Mình chưa tìm thấy món phù hợp lúc này.",
            "checkout_payload": None, "tool_calls_log": [], "error": None}}
    if kind == "RECOMMENDATION_OFFER_DECLINE":
        cart_manager.clear_pending_action(session_id)
        return {**state, "result": {"reply": "Được nhé. Khi nào muốn xem menu bạn cứ nói mình.",
            "checkout_payload": None, "tool_calls_log": [], "error": None}}
    if kind == "PENDING_RECOMMENDATION_OFFER":
        label = "đồ uống" if intent.get("category") == "drink" else "bánh" if intent.get("category") == "food" else "món"
        return {**state, "result": {"reply": f"Mình đang chờ bạn xác nhận có muốn xem gợi ý {label} không.",
            "checkout_payload": None, "tool_calls_log": [], "error": None}}
    if kind == "GENERAL_CHAT" and re.search(r"\b(?:troi|thoi tiet)\b.*\b(?:nong|oi|lanh)\b|\b(?:nong|khat)\b", _norm(message)):
        cart_manager.set_pending_action(session_id, "offer_recommendation", {
            "domain": "PRODUCT_DISCOVERY", "action": "RECOMMEND", "category": "drink",
        })
        logger.debug("[DialogueState] stage=GENERAL_CHAT pending=offer_recommendation action=RECOMMEND category=drink")
        from src.agents.agent_service import _run_agent_impl
        conversational = _run_agent_impl(session_id, message, history=state.get("history") or [], allow_model_mutations=False)
        if re.search(r"\b(?:se|dang)\s+(?:tien hanh\s+)?(?:sua|cap nhat|them|xoa|bo)\b.*\b(?:gio|mon)\b",
                     _norm(conversational.get("reply"))):
            return {**state, "result": conversational}
        return {**state, "result": {"reply": "Thời tiết như vậy khá dễ mệt. Bạn có muốn mình gợi ý một số đồ uống phù hợp không?",
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
            requested_quantity = int(resolved.get("requested_value") or 0)
            if requested_quantity <= 0:
                return {**state, "result": {
                    "reply": "Số lượng phải lớn hơn 0. Nếu bạn muốn bỏ món, hãy nói xóa/bỏ món. Giỏ hàng chưa thay đổi.",
                    "checkout_payload": None, "tool_calls_log": [], "error": None,
                }}
            changed = execute_update_cart_item(session_id, line_id, {"quantity": requested_quantity})
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
                cart_manager.set_pending_action(session_id, "edit_cart_item", {
                    "operation": "EDIT_OPTIONS", "cart_item_id": line_id,
                    "requested_option_text": resolved.get("requested_value"),
                    "requested_patch": {}, "missing": "option_value",
                })
                reply = _option_validation_reply(item, option_result) or f"Bạn muốn đổi tùy chọn nào cho {item.get('product_name')}?"
                return {**state, "result": {"reply": reply,
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
            if operation == "EDIT_OPTIONS":
                cart_manager.set_pending_action(session_id, "edit_cart_item", {
                    "operation": "EDIT_OPTIONS", "cart_item_id": line_id,
                    "requested_option_text": resolved.get("requested_value"),
                    "requested_patch": patch, "missing": "retry",
                })
        return {**state, "result": {"reply": reply_text, "checkout_payload": None,
            "tool_calls_log": logs, "error": None}}
    if kind in {"PENDING_REPLY", "PENDING_AMBIGUOUS", "PENDING_BRANCH"}:
        return {**state, "result": _handle_pending_reply(state)}
    if intent.get("resume_shopping"):
        cart_manager.clear_pending_action(session_id)
        cart_manager.set_checkout_context(session_id, summary_fingerprint=None,
            checkout_action_id=None, summary_amounts=None, checkout_requested=None,
            flow_stage="BROWSING")
    if kind == "SHOPPING_UNAVAILABLE":
        return {**state, "result": {"reply": "Mình chưa tra được danh mục món lúc này. Bạn thử lại sau ít phút nhé.",
                                   "checkout_payload": None, "tool_calls_log": [], "error": None}}
    if kind == "SHOPPING_SCOPE_CANCEL":
        cart_manager.clear_pending_action(session_id)
        return {**state, "result": {"reply": "Được nhé, mình đã bỏ lựa chọn món đang chờ.",
                                     "checkout_payload": None, "tool_calls_log": [], "error": None}}
    if kind == "PENDING_SHOPPING_SCOPE":
        label = intent.get("label") or "nhóm món này"
        return {**state, "result": {"reply": (
            f"Bạn muốn chọn một món vừa xem hay xem thêm menu {label}? "
            "Bạn có thể nói đúng tên món hoặc nói ‘xem thêm’."
        ), "checkout_payload": None, "tool_calls_log": [], "error": None}}
    if kind in {"SHOPPING_GENERIC", "SHOPPING_CLARIFY"}:
        message_text = ("Bạn muốn xem thêm bánh hay đồ uống? Mình sẽ đưa menu để bạn chọn món cụ thể."
                        if kind == "SHOPPING_GENERIC" else
                        "Mình chưa xác định được món cụ thể. Bạn cho mình tên món hoặc chọn số trong danh sách nhé.")
        candidates = intent.get("candidate_products") or []
        if kind == "SHOPPING_CLARIFY" and candidates:
            cart_manager.set_pending_action(session_id, "shopping_scope_clarification", {
                "candidate_products": [{
                    key: row.get(key) for key in ("product_id", "product_name", "category")
                } for row in candidates[:8]],
                "family": intent.get("family"), "search_text": intent.get("search_text"),
                "label": intent.get("label"),
            })
            family_label = intent.get("label") or "nhóm món này"
            message_text = "Mình thấy nhiều món phù hợp:\n" + "\n".join(
                f"{index}. {row['product_name']}" for index, row in enumerate(candidates, 1)
            ) + (f"\nBạn muốn chọn một món vừa xem hay xem thêm menu {family_label}?"
                 if intent.get("family") else "\nBạn chọn đúng món giúp mình nhé.")
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
            _focus_product(session_id, reference, read_only=True)
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
        if prefs.get("pending_product_reference"):
            reply += "\nBạn còn lựa chọn món đang chờ chọn số; món này chưa được thêm vào giỏ."
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
                                                    hold_for_missing_reference=bool(missing),
                                                    merge_pending=not intent.get("replace_batch"))
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
    if kind == "PRODUCT_REFERENCE_CANCEL":
        if intent.get("abandon"):
            _close_pending_reference_batch(session_id)
            return {**state, "result": {"reply": "Mình không giữ các lựa chọn món đang chờ nữa. Bạn muốn xem menu hay chọn món khác?",
                                       "checkout_payload": None, "tool_calls_log": [], "error": None}}
        cart_manager.set_checkout_context(session_id, pending_product_reference=None, last_product_focus=None)
        staged = list(cart_manager.get_checkout_prefs(session_id).get("pending_products") or [])
        if not staged:
            cart_manager.clear_pending_action(session_id)
            reply = "Mình không còn giữ món chưa chọn số. Bạn muốn chọn món nào khác?"
            return {**state, "result": {"reply": reply, "checkout_payload": None, "tool_calls_log": [], "error": None}}
        cart_manager.set_pending_action(session_id, "fill_options", {"count": len(staged)})
        lines = ["Mình bỏ món chưa chọn số và giữ món bạn đã chọn:"]
        for item in staged:
            lines.append(f"- {item['product_name']}")
            for group in item.get("option_schema") or []:
                values = group.get("values") or []
                if len(values) > 1:
                    lines.append(f"  - {group['name']}: {', '.join(map(str, values))}")
        lines.append("Bạn chọn tùy chọn cho món này, hoặc nói ‘theo mặc định’ nhé.")
        return {**state, "result": {"reply": "\n".join(lines), "checkout_payload": None,
                                   "tool_calls_log": [], "error": None}}
    if kind == "SET_QUANTITY":
        matches = _cart_rows_named_in_message(cart, message)
        item, error = _resolve_cart_line(cart, message, cart_line_ordinal=intent.get("cart_line_ordinal"))
        if error:
            if len(matches) > 1:
                error = _store_cart_line_choice(session_id, "SET_QUANTITY", intent["quantity"], matches)
            return {**state, "result": {"reply": error, "checkout_payload": None, "tool_calls_log": [], "error": None}}
        changed = execute_update_cart_item(session_id, str(item.get("cart_item_id") or item.get("line_id")), {"quantity": intent["quantity"]})
        if changed.get("status") == "ok":
            _clear_completed_cart_owner(session_id)
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
            _clear_completed_cart_owner(session_id)
            cart_manager.set_checkout_context(session_id, last_cart_focus=None, flow_stage="CART_REVIEW")
            quote = execute_get_cart_quote(session_id)
            reply += "\n" + (_format_quote(session_id, quote) if quote.get("status") == "ok" else "Giỏ hàng hiện trống.")
            reply += "\nBạn muốn thêm món, sửa/xoá món hay hoàn tất giỏ?" if quote.get("status") == "ok" else "\nBạn muốn xem menu món nào?"
        return {**state, "result": {"reply": reply, "checkout_payload": None, "tool_calls_log": [{"tool": "remove_cart_item", "result": removed}], "error": None}}
    if kind == "EDIT_OPTIONS":
        # A follow-up such as "thêm ngọt" contains an add verb but belongs to
        # the cart row that was explicitly selected one turn earlier.
        pending = cart_manager.get_pending_action(session_id) or {}
        pending_params = pending.get("params") or pending.get("data") or {}
        target_id = str((pending_params.get("cart_item_id")) or "")
        item = next((row for row in (cart.get("items") or []) if _cart_line_id(row) == target_id), None)
        error = None
        if not item:
            matches = _cart_rows_named_in_message(cart, message)
            item, error = _resolve_cart_line(cart, message)
        if error:
            candidates = matches if len(matches) > 1 else (
                list(cart.get("items") or []) if has_cart_edit_action(message)
                and len(cart.get("items") or []) > 1 else [])
            if len(candidates) > 1:
                error = _store_cart_line_choice(session_id, "EDIT_OPTIONS", message, candidates)
            return {**state, "result": {"reply": error, "checkout_payload": None, "tool_calls_log": [], "error": None}}
        line_id = str(item.get("cart_item_id") or item.get("line_id"))
        cart_manager.set_checkout_context(session_id, last_cart_focus=line_id, flow_stage="CART_REVIEW")
        requested_text = message
        desired = dict(pending_params.get("requested_patch") or {}) if intent.get("resume_pending_edit") else {}
        if intent.get("resume_pending_edit") and pending_params.get("requested_option_text"):
            requested_text = str(pending_params["requested_option_text"])
        option_logs: List[Dict[str, Any]] = []
        if desired:
            option_result = {"status": "ok", "options": {}}
        else:
            desired, option_result = _resolve_cart_option_update(item, requested_text)
            option_logs.append({"tool": "get_product_options", "args": {
                "product_name": item.get("product_name")}, "result": option_result})
        if not desired:
            groups = option_result.get("options") or {}
            cart_manager.set_pending_action(session_id, "edit_cart_item", {
                "operation": "EDIT_OPTIONS", "cart_item_id": line_id,
                "requested_option_text": requested_text if requested_text != message or has_cart_edit_action(message) else None,
                "requested_patch": {}, "missing": "option_value",
                "clarification_type": "invalid_option",
                "rejected_values": list((option_result.get("validation_error") or {}).get("invalid_values") or []),
                "valid_values": {name: list(values) for name, values in groups.items()},
                "retained_current_value": {
                    "size": item.get("size"), "toppings": list(item.get("toppings") or []),
                    "luong_da": item.get("luong_da"), "do_ngot": item.get("do_ngot"),
                    "loai_sua": item.get("loai_sua"),
                },
            })
            rendered = "; ".join(
                f"{name}: {', '.join(str(value) for value in values)}"
                for name, values in groups.items()
            )
            reply = _option_validation_reply(item, option_result) or (
                f"Bạn muốn đổi gì cho {item.get('product_name')} "
                f"(size hiện tại: {item.get('size') or 'mặc định'})?"
                + (f" Các lựa chọn hợp lệ: {rendered}." if rendered else "")
            )
            return {**state, "result": {"reply": reply, "checkout_payload": None, "tool_calls_log": option_logs, "error": None}}
        changed = execute_update_cart_item(session_id, line_id, desired)
        logs = option_logs + [{"tool": "update_cart_item", "args": {"cart_item_id": line_id, "desired_state": desired}, "result": changed}]
        if changed.get("status") == "ok":
            cart_manager.clear_pending_action(session_id)
            cart_manager.set_checkout_context(session_id, last_cart_focus=line_id, flow_stage="CART_REVIEW")
            quote = {"status": "ok", "cart": changed.get("cart"), "quote": changed.get("quote")}
            reply = _format_quote(session_id, quote, f"Đã cập nhật tùy chọn cho {item.get('product_name')}. Giỏ hàng mới:")
            reply += "\nBạn muốn thêm, sửa, xoá món hay hoàn tất giỏ?"
        else:
            reply = changed.get("message", "Chưa thể cập nhật tùy chọn món.")
            cart_manager.set_pending_action(session_id, "edit_cart_item", {
                "operation": "EDIT_OPTIONS", "cart_item_id": line_id,
                "requested_option_text": requested_text, "requested_patch": desired, "missing": "retry",
            })
        return {**state, "result": {"reply": reply, "checkout_payload": None, "tool_calls_log": logs, "error": None}}
    if kind == "CLEAR_CART":
        pending = cart_manager.get_pending_action(session_id)
        if (pending or {}).get("type") != "clear_cart" or not intent.get("confirmed"):
            cart_manager.set_pending_action(session_id, "clear_cart", {})
            return {**state, "result": {"reply": "Bạn có chắc muốn xoá toàn bộ giỏ hàng không? Hãy trả lời ‘đồng ý xoá giỏ’. ", "checkout_payload": None, "tool_calls_log": [], "error": None}}
        log = execute_clear_cart(session_id)
        if log.get("status") == "ok":
            cart_manager.reset_conversation_draft(session_id)
            cart_manager.set_checkout_context(session_id, last_product_focus=None,
                partial_delivery_address=None, address_change_requested=None)
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
    if kind in {"APPLY_VOUCHER", "REPLACE_VOUCHER", "REMOVE_VOUCHER"}:
        from src.function_calling.tools.voucher_tools import execute_apply_voucher, execute_remove_voucher
        if kind == "REMOVE_VOUCHER":
            changed = execute_remove_voucher(session_id)
            tool = "remove_voucher"
        else:
            code = str(intent.get("voucher_code") or "").strip().upper()
            changed = execute_apply_voucher(session_id, code)
            tool = "apply_voucher"
        if changed.get("status") == "ok":
            cart_manager.set_checkout_context(session_id, voucher_decided=True,
                voucher_offer_pending=None, checkout_requested=None, flow_stage="CART_READY")
            cart_manager.clear_pending_action(session_id)
            from src.agents.agent_service import _cart_ready_reply
            if kind == "REMOVE_VOUCHER" and (changed.get("quote") or {}).get("final_total") is not None:
                reply_text = _cart_ready_reply(_format_quote(
                    session_id, {"quote": changed["quote"], "cart": changed.get("cart") or cart},
                    "Mình đã bỏ mã giảm giá. Tổng hiện tại:",
                ))
            else:
                reply_text = _cart_ready_reply(changed.get("message", "Đã cập nhật voucher."))
        else:
            reply_text = changed.get("message", "Chưa thể cập nhật voucher; mã hiện tại vẫn được giữ nguyên.")
        return {**state, "result": {"reply": reply_text, "checkout_payload": None,
            "tool_calls_log": [{"tool": tool, "result": changed}], "error": None}}
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
        delivery_changed = bool(patch.get("delivery_type") and patch["delivery_type"] != previous_delivery)
        location_pending_type = (cart_manager.get_pending_action(session_id) or {}).get("type")
        incompatible_location_owner = bool(
            previous_delivery in {"MANG_DI", "TAI_CHO"}
            and (location_pending_type in {"collect_store_location", "select_location_candidate", "select_branch"}
                 or prefs.get("location_candidate_snapshot")
                 or prefs.get("selected_location_candidate")
                 or prefs.get("store_location")
                 or prefs.get("branch_candidates")
                 or cart_manager.get_branch(session_id))
        )
        if delivery_changed:
            cart_manager.clear_branch(session_id)
            cart_manager.set_checkout_context(session_id, location_address=None, suggested_address=None,
                address_confirmed=None, delivery_address=None, branch_candidates=None,
                store_location=None, location_source=None, location_candidate_snapshot=None,
                selected_location_candidate=None, partial_delivery_address=None,
                summary_fingerprint=None, summary_amounts=None, checkout_action_id=None,
                checkout_action_expires_at=None,
                location_pending=True if incompatible_location_owner and patch["delivery_type"] == "GIAO_TAN_NOI" else None,
                address_change_requested=True if incompatible_location_owner and patch["delivery_type"] == "GIAO_TAN_NOI" else None)
            if location_pending_type in {"collect_store_location", "select_location_candidate", "select_branch"}:
                cart_manager.clear_pending_action(session_id)
        if patch:
            cart_manager.set_checkout_prefs(session_id, **patch)
        prefs = cart_manager.get_checkout_prefs(session_id)
        if prefs.get("delivery_type") and prefs.get("payment_method") and (
            (cart_manager.get_pending_action(session_id) or {}).get("type") in CHECKOUT_CHOICE_TYPES
        ):
            cart_manager.clear_pending_action(session_id)
        if (delivery_changed and incompatible_location_owner
                and prefs.get("delivery_type") == "GIAO_TAN_NOI" and prefs.get("checkout_requested")):
            return {**state, "result": {
                "reply": "Bạn gửi địa chỉ giao đầy đủ gồm số nhà, tên đường và phường/xã nhé.",
                "checkout_payload": None, "tool_calls_log": [], "error": None,
            }}
        if not prefs.get("voucher_decided") or not prefs.get("checkout_requested"):
            return {**state, "result": _offer_voucher_gate(session_id)}
        if not prefs.get("delivery_type") or not prefs.get("payment_method"):
            from src.agents.agent_service import _checkout_choices_prompt
            selected_label = ("hình thức nhận hàng" if patch.get("delivery_type")
                              else "phương thức thanh toán")
            return {**state, "result": {
                "reply": _checkout_choices_prompt(
                    session_id, f"Mình đã ghi nhận {selected_label}."
                ),
                "checkout_payload": None, "tool_calls_log": [], "error": None,
            }}
        from src.agents.location_parser import checkout_location
        explicit_location = checkout_location(message, prefs.get("delivery_type"))
        if explicit_location.kind in {"area", "address"}:
            return {**state, "result": _handle_location_request({**state, "location_override": explicit_location})}
        prior_location = prefs.get("last_resolved_location") or {}
        can_offer_prior_location = (
            prefs.get("checkout_requested")
            and prefs.get("delivery_type") in {"MANG_DI", "TAI_CHO"}
            and prefs.get("payment_method")
            and not cart_manager.get_branch(session_id)
            and not prefs.get("store_location")
            and not prefs.get("location_address")
            and not prefs.get("suggested_address")
            and prior_location.get("source") == "explicit_user"
            and prior_location.get("status") == "retained"
            and str(prior_location.get("value") or prior_location.get("raw") or "").strip()
        )
        if can_offer_prior_location:
            location = str(prior_location.get("value") or prior_location.get("raw")).strip()
            cart_manager.set_pending_action(session_id, "confirm_prior_location_for_checkout", {
                "domain": "CHECKOUT_LOCATION", "action": "REUSE_PRIOR_LOCATION",
                "location": location,
                "location_kind": prior_location.get("kind") or "area",
                "admin_hints": list(prior_location.get("admin_hints") or []),
                "source": "explicit_user",
            })
            return {**state, "result": {
                "reply": f"Bạn có muốn dùng vị trí {location} để tìm cửa hàng cho đơn này không?",
                "checkout_payload": None, "tool_calls_log": [], "error": None,
            }}
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
        reference = {}
        resolved = _resolve_pending_voucher_choice(session_id, message, reference_out=reference)
        if reference:
            intent.update(pending_decision=reference["semantic_operation"],
                          reference_namespace=reference["reference_namespace"],
                          reference_source=reference["reference_source"])
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
    read_intent = state.get("intent") or {}
    if read_intent.get("intent") in {"PRODUCT_REVIEW", "PRODUCT_INFO"}:
        # Canonical identity memory is independent of the transactional owner.
        products = read_intent.get("products") or []
        if len(products) == 1 and products[0].get("product_id") and products[0].get("product_name"):
            _focus_product(state["session_id"], products[0], read_only=True)
    if ((state.get("intent") or {}).get("preserve_primary_pending")
            and (state.get("intent") or {}).get("intent") in {"PRODUCT_REVIEW", "PRODUCT_INFO"}):
        return {**state, "result": result}
    logs = result.get("tool_calls_log") or []
    branches: List[Dict[str, Any]] = []
    vouchers: List[Dict[str, Any]] = []
    products: List[Dict[str, Any]] = []
    recommendation_products: List[Dict[str, Any]] = []
    price_focus: Optional[Dict[str, Any]] = None
    price_identities: Dict[str, Dict[str, Any]] = {}
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
                for item in value.get("products") or []:
                    if item.get("product_id") and item.get("product_name"):
                        price_identities[str(item["product_id"])] = {
                            "product_id": item["product_id"], "product_name": item["product_name"],
                            "category": _map_db_category_to_bucket(item.get("category"), item.get("parent_category")),
                        }
        if entry.get("tool") == "add_to_cart" and isinstance(value, dict) and value.get("status") == "ok":
            _update_cart_focus_after_add(
                state["session_id"],
                {"tool_calls_log": [entry]},
                {"product_name": (entry.get("args") or {}).get("product_name")},
            )
    if len(price_identities) == 1:
        price_focus = next(iter(price_identities.values()))
    elif len(price_identities) > 1:
        # Per-product price reads during a multi-add are not a single selection.
        cart_manager.set_checkout_context(state["session_id"], last_product_focus=None)
    if recommendation_products:
        filtered_catalog = any(entry.get("tool") == "filter_catalog" for entry in logs)
        displayed: List[Dict[str, Any]] = []
        seen_ids: set[str] = set()
        displayed_counts: Dict[tuple[str, Any], int] = {}
        for item in recommendation_products:
            product_id = str(item.get("product_id") or "").strip()
            if not product_id or product_id in seen_ids:
                continue
            bucket = item.get("menu_bucket") or "unknown"
            group_key = ("catalog", item["catalog_group_index"]) if "catalog_group_index" in item else (
                "bucket", bucket)
            if displayed_counts.get(group_key, 0) >= (16 if filtered_catalog else 8):
                continue
            seen_ids.add(product_id)
            displayed.append(item)
            displayed_counts[group_key] = displayed_counts.get(group_key, 0) + 1
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
            if result.get("unavailable_menu_groups"):
                lines.append("Hiện chưa tra cứu được nhóm: " + ", ".join(result["unavailable_menu_groups"]) + "; bạn có thể thử lại.")
            lines.append("Bạn muốn chọn món số mấy hoặc nói tên món nhé.")
            result["reply"] = "\n".join(lines)
    elif products:
        # Every canonical product card exposed by the UI owns the same typed
        # 1..N snapshot contract, including an exact search with one result.
        displayed = []
        seen_ids: set[str] = set()
        for item in products:
            product_id = str(item.get("product_id") or item.get("ma_san_pham") or "").strip()
            product_name = item.get("product_name") or item.get("ten_san_pham")
            if not product_id or not product_name or product_id in seen_ids:
                continue
            seen_ids.add(product_id)
            displayed.append(item)
            if len(displayed) == 16:
                break
        snapshot = []
        for index, item in enumerate(displayed, 1):
            group = _map_db_category_to_bucket(item.get("category"), item.get("parent_category"))
            item["display_index"] = index
            item["global_display_index"] = index
            snapshot.append({
                "product_id": str(item.get("product_id") or item.get("ma_san_pham")),
                "product_name": item.get("product_name") or item.get("ten_san_pham"),
                "category": group,
                "menu_bucket": group,
                "group": group,
                "global_display_index": index,
                "group_display_index": index,
                "final_price": item.get("final_price") or item.get("price") or item.get("gia_ban"),
            })
        if snapshot:
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
    promises_cart_mutation = bool(re.search(
        r"\b(?:minh|toi)\s+(?:se|dang)\s+(?:tien hanh\s+)?(?:sua|cap nhat|them|xoa|bo|thay doi)\b"
        r".*\b(?:gio|gio hang|mon|so luong|topping|size)\b",
        reply_norm,
    ))
    mutation_tools = {"add_to_cart", "update_cart_item", "remove_cart_item", "clear_cart",
                      "apply_voucher", "remove_voucher"}
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
    typed_pending = cart_manager.get_pending_action(state["session_id"]) or {}
    owns_pending_mutation = typed_pending.get("type") in {"edit_cart_item", "cart_line_choice", "fill_options", "clear_cart"}
    if (claims_cart_mutation and not has_mutation_evidence) or (promises_cart_mutation and not owns_pending_mutation):
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
    # A yes/no business offer is itself dialogue state. Generic prose may be
    # friendly, but it cannot create an actionable next turn without a typed
    # owner that defines what an affirmative answer means.
    rendered_reply = str(result.get("reply") or "")
    pending_type = typed_pending.get("type")
    cta_owners = {
        "branch_search": {"offer_branch_search", "confirm_prior_location_for_checkout"},
        "recommendation": {"offer_recommendation"},
        "voucher": {"select_voucher"},
        "checkout_progress": {"select_checkout_choices", "select_fulfillment", "select_payment"},
        "checkout_confirmation": {"confirm_checkout"},
        "add_more": {"ask_more_items"},
    }

    def business_offer_action(line: str) -> Optional[str]:
        normalized = _norm(line)
        opt_in = bool(re.search(
            r"\b(?:co\s+(?:muon|can)|neu\s+(?:(?:ban|anh|chi)\s+)?(?:muon|can)|"
            r"co\s+the\b.*\bneu\s+(?:(?:ban|anh|chi)\s+)?(?:muon|can)|"
            r"(?:ban|anh|chi)\s+muon\s+(?:minh|toi))\b",
            normalized,
        ))
        if not opt_in:
            return None
        if re.search(r"\b(?:tim\s+(?:quan|cua hang|chi nhanh|kiosk)|(?:quan|cua hang|chi nhanh|kiosk)\s+gan)\b", normalized):
            return "branch_search"
        if re.search(r"\b(?:goi y|de xuat)\b", normalized):
            return "recommendation"
        if re.search(r"\bap\s+(?:ma|voucher)\b", normalized):
            return "voucher"
        if re.search(r"\b(?:xac nhan\s+(?:don|dat)|dat hang|chot don)\b", normalized):
            return "checkout_confirmation"
        if re.search(r"\b(?:tiep tuc\s+thanh toan|thanh toan)\b", normalized):
            return "checkout_progress"
        if re.search(r"\b(?:them mon|chon mon)\b", normalized):
            return "add_more"
        return None

    def is_unowned_business_offer(line: str) -> bool:
        action = business_offer_action(line)
        return bool(action and pending_type not in cta_owners[action])

    unowned_offer = any(is_unowned_business_offer(line) for line in rendered_reply.splitlines())
    if unowned_offer:
        kept = [line.strip() for line in rendered_reply.splitlines()
                if not is_unowned_business_offer(line)]
        kept.append("Khi cần, bạn có thể yêu cầu mình xem menu, gợi ý món hoặc tra cứu cửa hàng.")
        result["reply"] = "\n".join(line for line in kept if line)
    invalidated = cart_manager.get_checkout_prefs(state["session_id"]).get("voucher_invalidated")
    intent_name = str((state.get("intent") or {}).get("intent") or "")
    notice_tools = {"add_to_cart", "update_cart_item", "remove_cart_item", "get_cart",
                    "get_cart_quote", "get_applicable_vouchers", "apply_voucher",
                    "remove_voucher", "request_checkout", "confirm_checkout"}
    notice_relevant = (any(owner in intent_name for owner in ("CART", "VOUCHER", "CHECKOUT"))
                       or any(entry.get("tool") in notice_tools for entry in logs if isinstance(entry, dict)))
    if invalidated and notice_relevant:
        result["reply"] = str(result.get("reply") or "") + f"\nMã {invalidated} không còn đủ điều kiện cho giỏ hiện tại; mình đã bỏ giảm giá cũ."
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
        "branches": (5, ("ma_chi_nhanh", "branch_id", "ten_chi_nhanh", "branch_name", "dia_chi", "address", "khoang_cach_km", "distance_basis", "distance_estimated", "availability_status", "available_products", "unavailable_products", "unverified_products", "is_fully_available", "gio_mo_cua", "gio_dong_cua")),
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


def _mutation_authorized_by_route(intent, pending_type=None):
    """Route authorization precedes tool results; successful writes are evidence."""
    kind = intent.get("intent")
    owner = intent.get("pending_type") or pending_type
    decision = intent.get("decision") or intent.get("pending_decision")
    if kind == "PENDING_REPLY":
        return ((owner == "select_voucher" and decision in {"SELECT_VOUCHER", "APPLY", "APPLY_VOUCHER", "REMOVE_VOUCHER"})
                or (owner == "confirm_checkout" and decision in {"CONFIRM", "YES"}))
    if kind == "PENDING_CART_LINE":
        resolved = intent.get("resolved_pending") or {}
        return bool(not resolved.get("stale") and resolved.get("row") and
                    resolved.get("operation") in {"SET_QUANTITY", "REMOVE", "REMOVE_ITEM", "EDIT_OPTIONS"})
    if kind == "SELECT_VOUCHER":
        return decision == "APPLY_VOUCHER"
    if kind in {"PRODUCT_REVIEW", "PRODUCT_INFO", "PENDING_AMBIGUOUS"}:
        return False
    return kind in {"ADD_ITEM", "FILL_OPTIONS", "SET_QUANTITY", "REMOVE_ITEM", "EDIT_OPTIONS",
                    "CLEAR_CART", "CONFIRM_CHECKOUT", "APPLY_VOUCHER", "REMOVE_VOUCHER", "REPLACE_VOUCHER"}


def _log_decision_provenance(session_id, decision, result):
    """Inspect routing evidence, never model reasoning or customer-facing text."""
    tools = [entry for entry in result.get("tool_calls_log") or [] if isinstance(entry, dict)]
    writes = {"add_to_cart", "update_cart_item", "remove_cart_item", "clear_cart",
              "apply_voucher", "remove_voucher", "confirm_checkout"}
    trace = {
        "active_pending_type": (cart_manager.get_checkout_prefs(session_id).get("pending_action") or {}).get("type"),
        **decision,
        "provider_tools": [entry.get("tool") for entry in tools],
        "mutation_evidence_present": any(entry.get("tool") in writes and
            (entry.get("result") or {}).get("status") in {"ok", "success"} for entry in tools),
    }
    try:
        logger.info("[AgentTurn] decision_provenance=%s", json.dumps(trace, ensure_ascii=False))
    except Exception:
        pass  # Observability must never fail a business turn.
    return trace


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
    # Read-only consultation returns before pending owners/transactional state
    # are interpreted. Explicit selections and mixed business commands retain BPM ownership.
    from src.agents.knowledge_consultation import try_knowledge_consultation
    consultation = try_knowledge_consultation(session_id, user_message, selected_product_id)
    if consultation is not None:
        reference = consultation.pop("_canonical_reference", {})
        product = reference.get("product")
        if product:
            _focus_product(session_id, product, read_only=True)
        _log_decision_provenance(session_id, {
            "authority_owner": "rag", "reference_namespace": "PRODUCT" if product else None,
            "reference_source": reference.get("reference_source"),
            "resolved_product_ids": [str(product["product_id"])] if product else [],
            "semantic_operation": "PRODUCT_DESCRIPTION" if product else "KNOWLEDGE_CONSULTATION",
            "mutation_allowed": False, "mutation_authorized_by_route": False,
        }, consultation)
        return consultation
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
    kind = routed_intent.get("intent") or "MODEL_FALLBACK"
    products = (routed_intent.get("products") or routed_intent.get("resolved_products") or
                (before_prefs.get("pending_products") if kind == "FILL_OPTIONS" else []) or [])
    decision_trace = _log_decision_provenance(session_id, {
        "authority_owner": routed_intent.get("info_owner") or ("catalog" if kind == "BROWSING" else "order_flow"),
        "active_pending_type": (before_prefs.get("pending_action") or {}).get("type"),
        "reference_namespace": routed_intent.get("reference_namespace") or ("PRODUCT" if products else
            "VOUCHER" if routed_intent.get("pending_type") == "select_voucher" else None),
        "reference_source": (routed_intent.get("reference_source") or routed_intent.get("target_source") or
                             ("pending_products" if kind == "FILL_OPTIONS" else None)),
        "resolved_product_ids": [str(row["product_id"]) for row in products if row.get("product_id")],
        "semantic_operation": routed_intent.get("decision") or routed_intent.get("pending_decision") or kind,
        "mutation_authorized_by_route": _mutation_authorized_by_route(routed_intent,
            (before_prefs.get("pending_action") or {}).get("type")),
        "mutation_allowed": _mutation_authorized_by_route(routed_intent,
            (before_prefs.get("pending_action") or {}).get("type")),
    }, result)
    model_fallback_used = bool(result.pop("_model_fallback", False))
    response_result = _sanitize_replay_result(result) if client_message_id else result
    if client_message_id:
        turns = dict(cart_manager.get_checkout_prefs(session_id).get("processed_order_turns") or {})
        turns[str(client_message_id)] = {
            "message": user_message,
            "selected_product_id": selected_product_id,
            "result": response_result,
            "_completed_at": time.time(),
        }
        cart_manager.set_checkout_context(session_id, processed_order_turns=cart_manager.prune_processed_turns(turns))
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
                "decision_provenance": decision_trace,
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
