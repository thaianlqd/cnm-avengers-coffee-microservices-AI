"""Parse Vietnamese shopping constraints before any model/RAG routing."""
import re
import unicodedata
from typing import Any, Dict, Optional


_MONEY = r"(\d{1,3}(?:[.,]\d{3})+|\d+)(?:\s*(k|nghin|ngan))?"
_QUERY_STOP = set("ben ban co mon san pham sp banh do uong nuoc thuc topping menu thuc don gi cai loai nao khong ko duoi tren khong qua toi da it nhat tu den khoang re dat nhat hon nho lon may cac nhung cho minh xem tim voi gia tien trong tam o day di nhe nha oi a ve muon mua dat".split())


def _search_terms(message: str) -> str:
    words = re.findall(r"[\wÀ-ỹ]+", str(message or "").lower(), re.UNICODE)
    # Preserve accents for the canonical PostgreSQL name/category comparison.
    return " ".join(word for word in words if _normalize(word) not in _QUERY_STOP
                    and not word.isdigit() and not re.fullmatch(r"\d+k", word))


def extract_catalog_search_text(message: str) -> str:
    return _search_terms(message)


def _normalize(value: str) -> str:
    raw = unicodedata.normalize("NFD", str(value or "").lower())
    return "".join(c for c in raw if unicodedata.category(c) != "Mn").replace("đ", "d")


def _amount(number: str, unit: Optional[str]) -> int:
    value = int(number.replace(".", "").replace(",", ""))
    return value * 1000 if unit else value


def parse_catalog_constraints(message: str) -> Optional[Dict[str, Any]]:
    text = _normalize(message)
    if re.search(r"\b(?:them|lay|chon|xoa|bo|sua|doi|chinh|tang|giam|thanh toan|dat hang|chot|danh gia|review|nhan xet)\b", text):
        return None
    if re.search(r"\b(?:mon|banh|nuoc|do uong|san pham)\s*(?:so|thu|#)\s*\d+\b", text):
        return None
    shopping = re.search(r"\b(mon|san pham|sp|banh|do uong|nuoc|thuc uong|topping|menu|thuc don|co gi|cai gi|loai|ca phe|tra|matcha|americano)\b", text)
    price_word = re.search(r"\b(duoi|tren|khong qua|toi da|it nhat|tu|khoang|re nhat|dat nhat)\b", text)
    if not shopping:
        return None
    if "mua" in text.split() and not price_word:
        return None
    if not price_word and re.search(r"\b(?:hoac|hay)\b", text):
        return None
    if not price_word and not (re.search(r"\bco\s+mon\b.*\bnao\b", text) or
                               re.fullmatch(r"(?:banh|ca phe|tra|matcha|americano|topping)\s+[\w\s]+", text)):
        return None
    if not price_word and re.search(r"\bbanh trung thu\b", text):
        return None

    scope = "topping" if re.search(r"\btopping\b", text) else "normal"
    category = ("food" if re.search(r"\b(banh|do an)\b", text) else
                "drink" if re.search(r"\b(do uong|nuoc|thuc uong|ca phe|tra|americano)\b", text) else "all")
    result: Dict[str, Any] = {
        "category": category, "sellable_scope": scope,
        "sort_by": "price_asc" if "re nhat" in text else "price_desc" if "dat nhat" in text else "price_asc",
        "limit": 1 if re.search(r"\b(?:mon|loai|cai)\s+(?:re|dat)\s+nhat\b", text)
                   and not re.search(r"\b(?:cac|nhung|may)\s+(?:mon|loai|cai)\b", text) else 16,
    }
    keyword = _search_terms(message)
    if keyword:
        result["search_text"] = keyword
    if not price_word:
        return {**result, "constraint_type": "KEYWORD"} if keyword else None
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
    keyword = str(constraints.get("search_text") or "").strip()
    prefix = f'liên quan "{keyword}" ' if keyword else ""
    kind = constraints.get("constraint_type")
    if kind in {"LT", "LTE", "GT", "GTE"}:
        relation = {"LT": "dưới", "LTE": "không quá", "GT": "trên", "GTE": "từ"}[kind]
        bound = constraints.get("max_price") if kind in {"LT", "LTE"} else constraints.get("min_price")
        return f"{prefix}{relation} {money(bound)}"
    if kind == "RANGE":
        return f"{prefix}từ {money(constraints['min_price'])} đến {money(constraints['max_price'])}"
    if kind == "APPROX":
        return f"{prefix}khoảng {money(constraints['approx_price'])}"
    return prefix + {"CHEAPEST": "rẻ nhất", "MOST_EXPENSIVE": "đắt nhất"}.get(kind, "phù hợp")
