"""Menu-backed option schema and customer-authorized defaults for chat."""
import html
import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple


def _norm(value: Any) -> str:
    raw = unicodedata.normalize("NFD", str(value or "").lower())
    folded = "".join(c for c in raw if unicodedata.category(c) != "Mn").replace("đ", "d")
    return re.sub(r"\s+", " ", folded).strip()


def option_field(name: str) -> Optional[str]:
    key = _norm(name)
    if "size" in key or "kich thuoc" in key or "kich co" in key:
        return "size"
    if "topping" in key or "do kem" in key:
        return "toppings"
    if "luong da" in key or key == "da" or "ice" in key:
        return "luong_da"
    if "do ngot" in key or "duong" in key or "sweet" in key:
        return "do_ngot"
    if "loai sua" in key or key == "sua" or "milk" in key:
        return "loai_sua"
    return None


def resolve_option_default(group: Dict[str, Any], product_data: Optional[Dict[str, Any]] = None) -> Any:
    """Mirror Web's first Menu option, never a hardcoded label or paid topping."""
    values = list(group.get("values") or [])
    if group.get("multiple"):
        explicit = group.get("default_values")
        if isinstance(explicit, list) and all(value in values for value in explicit):
            return list(explicit)
        return [] if not group.get("required") and option_field(group.get("name", "")) == "toppings" else None
    for key in ("default_value", "default"):
        explicit = group.get(key)
        if explicit in values:
            return explicit
    source = product_data or {}
    name = str(group.get("name") or "")
    field = option_field(name)
    candidates = []
    dynamic = source.get("bien_the")
    if isinstance(dynamic, dict):
        candidates.extend((options or {}) for label, options in dynamic.items() if _norm(label) == _norm(name))
    if field and isinstance(source.get(field if field != "size" else "sizes"), dict):
        candidates.append(source[field if field != "size" else "sizes"])
    for choices in candidates:
        if isinstance(choices, dict):
            match = next((value for value in choices if value in values), None)
            if match is not None:
                return match
    return values[0] if values else None


def option_schema_from_result(result: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Keep tool metadata; safely adapt older sessions/results with only groups."""
    raw = result.get("option_groups")
    if not isinstance(raw, list):
        raw = [{"name": name, "values": values,
                "required": option_field(name) == "size",
                "multiple": option_field(name) == "toppings"}
               for name, values in (result.get("options") or {}).items()]
    schema = []
    for group in raw:
        if not isinstance(group, dict):
            continue
        values = [" ".join(html.unescape(str(value)).replace("\xa0", " ").split())
                  for value in group.get("values") or []]
        values = list(dict.fromkeys(value for value in values if value))
        if not values and not group.get("required"):
            continue
        entry = {**group, "name": str(group.get("name") or ""), "values": values,
                 "required": bool(group.get("required", False)),
                 "multiple": bool(group.get("multiple", False)),
                 "fixed": len(values) == 1}
        default = resolve_option_default(entry, result.get("product_data"))
        if default is not None:
            entry["default_value"] = default
        schema.append(entry)
    return schema


def mentions_pending_option_value(message: str, pending: List[Dict[str, Any]]) -> bool:
    text = _norm(message)
    for item in pending:
        schema = item.get("option_schema") or option_schema_from_result({
            "options": (item.get("options") or {}).get("groups") or {}})
        for group in schema:
            for value in group.get("values") or []:
                if re.search(r"(?<!\w)" + re.escape(_norm(value)) + r"(?!\w)", text):
                    return True
    return False

def pending_product_quantity(message: str, pending_count: int) -> Tuple[Optional[int], bool]:
    """Extract quantity only inside the pending-product namespace.

    Returns ``(quantity, ambiguous)``. Unit-bearing quantities cannot be
    confused with product/branch/voucher ordinals or street numbers.
    """
    from src.agents.tier1 import normalize_confirmation_text

    text = normalize_confirmation_text(message)
    match = (
        re.search(r"\b(?:so luong|sl)\s*(?:la)?\s*(\d+)\b", text)
        or re.search(r"\b(?:lay|cho(?: toi)?)\s+(\d+)\s*(?:cai|ly|phan)\b", text)
        or re.search(r"\b(\d+)\s*(?:cai|ly|phan)\b", text)
    )
    if not match:
        return None, False
    quantity = max(1, int(match.group(1)))
    applies_to_all = bool(re.search(r"\b(?:moi mon|moi loai|tat ca)\b", text))
    return quantity, pending_count > 1 and not applies_to_all
