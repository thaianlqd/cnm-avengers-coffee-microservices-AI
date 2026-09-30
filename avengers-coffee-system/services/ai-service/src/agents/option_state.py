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


def validate_explicit_multi_value_group(
    message: str,
    group: Dict[str, Any],
    option_schema: Optional[List[Dict[str, Any]]] = None,
    allow_implicit: bool = False,
) -> Optional[Dict[str, Any]]:
    """Validate the complete requested value list for a multi-select group.

    Matching only known values is insufficient for a request such as
    ``Hạt Sen và Foam Dừa``: retaining Hạt Sen while dropping Foam Dừa would
    turn one customer request into a different cart mutation.
    """
    if not group.get("multiple") or option_field(group.get("name", "")) != "toppings":
        return None
    if re.search(r"\b(?:không|khong)\s+(?:topping|toping)|\b(?:bỏ|bo)\s+(?:topping|toping)\b",
                 message, flags=re.IGNORECASE):
        return None
    marker = re.search(r"\b(?:topping|toping|đồ\s+kèm|do\s+kem)\b", message, flags=re.IGNORECASE)
    allowed_by_key = {_norm(value): value for value in group.get("values") or []}
    if marker:
        requested = message[marker.end():]
    elif allow_implicit and any(re.search(
        r"(?<!\w)" + re.escape(key) + r"(?!\w)", _norm(message)
    ) for key in allowed_by_key):
        requested = message
    else:
        return None

    # A semicolon or sentence terminator always closes this option clause.
    requested = re.split(r"[;.]", requested, maxsplit=1)[0]
    requested = re.sub(
        r"^\s*(?:(?:là|la|thành|thanh|gồm|gom|chọn|chon)\s+)", "",
        requested, flags=re.IGNORECASE,
    )
    assignment = re.split(r"\b(?:thành|thanh|sang)\b", requested, flags=re.IGNORECASE)
    if len(assignment) > 1:
        requested = assignment[-1]
    requested = requested.strip()
    if not requested:
        return None

    other_values = set()
    other_markers = []
    for other in option_schema or []:
        other_field = option_field(other.get("name", ""))
        if not other_field or other_field == "toppings":
            continue
        other_values.update(_norm(value) for value in other.get("values") or [])
        other_markers.append(_norm(other.get("name", "")))
    other_markers.extend(["size", "kich thuoc", "kich co", "luong da", "da", "ice",
                          "do ngot", "ngot", "duong", "sweet", "loai sua", "milk"])

    candidates = []
    for raw in re.split(r"\s*(?:,|&|\+)\s*|\s+(?:và|va|với|voi)\s+", requested,
                        flags=re.IGNORECASE):
        candidate = re.sub(
            r"\s+(?:(?:theo\s+mặc\s+định|theo\s+mac\s+dinh)|nhé|nhe|ạ|a|đi|di|bạn|ban|b|thôi|thoi|nữa|nua)\s*$",
            "", raw, flags=re.IGNORECASE,
        ).strip()
        if not marker:
            candidate = re.sub(r"^\s*(?:thêm|them|chọn|chon)\s+", "", candidate,
                               flags=re.IGNORECASE).strip()
        key = _norm(candidate)
        if not key:
            continue
        belongs_to_other_group = key in other_values and key not in allowed_by_key
        starts_other_group = any(re.search(r"(?<!\w)" + re.escape(name) + r"(?!\w)", key)
                                 for name in other_markers if name)
        if candidates and (belongs_to_other_group or starts_other_group):
            break
        candidates.append(candidate)
    if not candidates:
        return None
    valid = [allowed_by_key[_norm(value)] for value in candidates if _norm(value) in allowed_by_key]
    invalid = [value for value in candidates if _norm(value) not in allowed_by_key]
    if not marker and not valid:
        return None
    return {
        "field": str(group.get("name") or "Topping"),
        "requested_values": candidates,
        "valid_values": list(dict.fromkeys(valid)),
        "invalid_values": invalid,
        "allowed_values": list(group.get("values") or []),
    }

def pending_product_quantity(message: str, pending_count: int) -> Tuple[Optional[int], bool]:
    """Extract quantity only inside the pending-product namespace.

    Returns ``(quantity, ambiguous)``. Unit-bearing quantities cannot be
    confused with product/branch/voucher ordinals or street numbers.
    """
    # Keep a leading minus sign. The generic confirmation normalizer removes
    # punctuation and would turn ``-2 ly`` into a positive quantity.
    text = _norm(message)
    match = (
        re.search(r"\b(?:so luong|sl)\s*(?:la)?\s*(-?\d+)\b", text)
        or re.search(r"\b(?:lay|cho(?: toi)?)\s+(-?\d+)\s*(?:cai|ly|phan)\b", text)
        or re.search(r"(?<!\w)(-?\d+)\s*(?:cai|ly|phan)\b", text)
    )
    if not match:
        return None, False
    quantity = int(match.group(1))
    applies_to_all = bool(re.search(r"\b(?:moi mon|moi loai|tat ca)\b", text))
    return quantity, pending_count > 1 and not applies_to_all


def quantity_request_error(message: str) -> Optional[str]:
    """Return a customer-facing error for an explicit invalid quantity."""
    quantity, _ambiguous = pending_product_quantity(message, 1)
    text = _norm(message)
    explicit_quantity = bool(re.search(r"\b(?:so luong|sl)\b", text))
    # Cart edits often place the target name between “số lượng” and the new
    # number ("số lượng Matcha ... về 2"). In that form, the last number is
    # the requested quantity; earlier numbers may belong to the product name.
    if quantity is None and explicit_quantity:
        numbers = re.findall(r"(?<!\w)-?\d+", text)
        quantity = int(numbers[-1]) if numbers else None
    if (quantity is not None and quantity <= 0) or (explicit_quantity and quantity is None):
        return "Số lượng phải lớn hơn 0. Nếu bạn muốn bỏ món, hãy nói xóa/bỏ món."
    return None
