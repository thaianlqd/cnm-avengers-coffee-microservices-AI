"""Parse Vietnamese shopping constraints before any model/RAG routing."""
import re
import unicodedata
from typing import Any, Dict, Optional


_MONEY = r"(\d{1,3}(?:[.,]\d{3})+|\d+)(?:\s*(k|nghin|ngan))?"


def _normalize(value: str) -> str:
    raw = unicodedata.normalize("NFD", str(value or "").lower())
    return "".join(c for c in raw if unicodedata.category(c) != "Mn").replace("đ", "d")


def _amount(number: str, unit: Optional[str]) -> int:
    value = int(number.replace(".", "").replace(",", ""))
    return value * 1000 if unit else value


def parse_catalog_constraints(message: str) -> Optional[Dict[str, Any]]:
    text = _normalize(message)
    shopping = re.search(r"\b(mon|san pham|sp|banh|do uong|nuoc|thuc uong|topping|menu|thuc don|co gi|cai gi|loai)\b", text)
    price_word = re.search(r"\b(duoi|tren|khong qua|toi da|it nhat|tu|khoang|re nhat|dat nhat)\b", text)
    if not price_word or not shopping:
        return None

    scope = "topping" if re.search(r"\btopping\b", text) else "normal"
    category = ("food" if re.search(r"\b(banh|do an)\b", text) else
                "drink" if re.search(r"\b(do uong|nuoc|thuc uong)\b", text) else "all")
    result: Dict[str, Any] = {
        "category": category, "sellable_scope": scope,
        "sort_by": "price_asc" if "re nhat" in text else "price_desc" if "dat nhat" in text else "price_asc",
        "limit": 1 if re.search(r"\b(?:mon|loai|cai)\s+(?:re|dat)\s+nhat\b", text)
                   and not re.search(r"\b(?:cac|nhung|may)\s+(?:mon|loai|cai)\b", text) else 16,
    }
    range_match = re.search(r"\btu\s+" + _MONEY + r"\s+den\s+" + _MONEY, text)
    if range_match:
        result["constraint_type"] = "RANGE"
        result.update(min_price=_amount(range_match[1], range_match[2]), min_price_inclusive=True,
                      max_price=_amount(range_match[3], range_match[4]), max_price_inclusive=True)
        return result

    for pattern, field, inclusive in (
        (r"\b(?:duoi|nho hon)\s+", "max_price", False),
        (r"\b(?:khong qua|toi da|nhieu nhat)\s+", "max_price", True),
        (r"\b(?:tren|lon hon)\s+", "min_price", False),
        (r"\b(?:it nhat|tu)\s+", "min_price", True),
    ):
        match = re.search(pattern + _MONEY, text)
        if match:
            result["constraint_type"] = {("max_price", False): "LT", ("max_price", True): "LTE",
                                         ("min_price", False): "GT", ("min_price", True): "GTE"}[(field, inclusive)]
            result[field] = _amount(match[1], match[2])
            result[field + "_inclusive"] = inclusive
            return result
    approx = re.search(r"\bkhoang\s+" + _MONEY, text)
    if approx:
        result["constraint_type"] = "APPROX"
        result["approx_price"] = _amount(approx[1], approx[2])
        center = _amount(approx[1], approx[2])
        result.update(min_price=int(center * 0.9), min_price_inclusive=True,
                      max_price=int(center * 1.1), max_price_inclusive=True)
        return result
    if "re nhat" in text or "dat nhat" in text:
        result["constraint_type"] = "CHEAPEST" if "re nhat" in text else "MOST_EXPENSIVE"
        return result
    return None


def describe_catalog_constraint(constraints: Dict[str, Any]) -> str:
    """Describe the customer's price request without inferring wording from bounds."""
    money = lambda value: f"{int(value):,}".replace(",", ".") + "đ"
    kind = constraints.get("constraint_type")
    if kind in {"LT", "LTE", "GT", "GTE"}:
        relation = {"LT": "dưới", "LTE": "không quá", "GT": "trên", "GTE": "từ"}[kind]
        bound = constraints.get("max_price") if kind in {"LT", "LTE"} else constraints.get("min_price")
        return f"{relation} {money(bound)}"
    if kind == "RANGE":
        return f"từ {money(constraints['min_price'])} đến {money(constraints['max_price'])}"
    if kind == "APPROX":
        return f"khoảng {money(constraints['approx_price'])}"
    return {"CHEAPEST": "rẻ nhất", "MOST_EXPENSIVE": "đắt nhất"}.get(kind, "phù hợp")
