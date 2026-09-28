"""Structural Vietnamese location parsing for checkout and store lookup."""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass


def normalize(value: str) -> str:
    raw = unicodedata.normalize("NFD", str(value or "").lower())
    return re.sub(r"\s+", " ", "".join(c for c in raw if unicodedata.category(c) != "Mn").replace("đ", "d")).strip()


@dataclass(frozen=True)
class Location:
    kind: str
    value: str = ""
    missing: tuple[str, ...] = ()


_PREFIX = re.compile(
    r"^(?:(?:không|ko)[,\s]+)?(?:(?:tôi|mình)(?:\s+đang)?\s+ở|"
    r"(?:đổi|thay)(?:\s+địa\s+chỉ)?\s+sang|địa\s+chỉ(?:\s+mới)?(?:\s+là)?|"
    r"giao\s+(?:đến|tới|qua))\s*[:：]?\s*", re.IGNORECASE,
)
_STORE = re.compile(r"\b(?:quán|cửa\s+hàng|chi\s+nhánh|kiosk)\b", re.IGNORECASE)
_NEAR = re.compile(r"\b(?:gần|ở|tại|quanh|khu\s+vực)\b", re.IGNORECASE)
_STORE_QUERY = re.compile(
    r"\b(?:gần|tìm|ở|địa\s+chỉ|nào|quanh|khu(?:\s+vực)?|bên)\b|"
    r"\b(?:có|còn)\b.*\b(?:quán|cửa\s+hàng|chi\s+nhánh|kiosk)\b",
    re.IGNORECASE,
)
_NAMED_STORE_AT_AREA = re.compile(
    r"^(?:[A-ZĐ][\wÀ-ỹ-]+(?:\s+[A-ZĐ][\wÀ-ỹ-]+){0,3})\s+ở\s+(?P<area>.+)$"
)
_PRODUCT_TOPIC = re.compile(r"\b(?:bánh|nước|trà|cà\s+phê|món|topping|size)\b", re.IGNORECASE)
_HOUSE = re.compile(r"^\d{1,5}[A-Za-z]?(?:[/.-]\d{1,5}[A-Za-z]?)?\s+\S+", re.UNICODE)
_ADMIN = (
    (r"\bphuong\b|\bp\s*\.", "phường"),
    (r"\bxa\b", "xã"),
    (r"\bquan\b|\bq\s*\.", "quận"),
    (r"\bhuyen\b|\bh\s*\.", "huyện"),
    (r"\bthanh pho\b|\btp\s*\.", "thành phố"),
    (r"\btinh\b", "tỉnh"),
)


def _admin_component(component: str) -> str:
    # Expand only at a comma-delimited component start, never inside a street.
    match = re.match(r"^(P|Q|TP|H)(?:\.\s*|\s+)(?=\S)", component, re.IGNORECASE)
    return ({"p": "Phường", "q": "Quận", "tp": "Thành phố", "h": "Huyện"}[match.group(1).lower()] + " " + component[match.end():]) if match else component


def _missing_delivery(parts: list[str]) -> tuple[str, ...]:
    locality = [normalize(part) for part in parts[1:]]
    missing = []
    for pattern, label in ((r"\b(phuong|xa)\b", "phường/xã"),
                           (r"\b(quan|huyen|thi xa)\b", "quận/huyện"),
                           (r"\b(thanh pho|tinh)\b", "tỉnh/thành phố")):
        if not any(re.search(pattern, part) for part in locality):
            missing.append(label)
    return tuple(missing)


def parse_location(message: str) -> Location:
    raw = str(message or "").strip(" \t\r\n.!?")
    if not raw:
        return Location("none")
    # A comma may introduce the store question after the actual locality.
    # Keep only the location clause; never send the conversational request to
    # the map provider as if it were a street name.
    raw = re.split(r",\s*(?=(?:có|tìm|quán|cửa\s+hàng|chi\s+nhánh|địa\s+chỉ)\b)", raw, maxsplit=1, flags=re.IGNORECASE)[0]
    area_intro = bool(_PREFIX.match(raw)) or bool(re.match(r"^(?:gần|ở|tại|quanh|khu\s+vực)\b", raw, re.IGNORECASE))
    named_store = _NAMED_STORE_AT_AREA.match(raw)
    if named_store and _PRODUCT_TOPIC.search(raw[:named_store.start("area")]):
        named_store = None
    store = (bool(_STORE.search(raw)) and bool(_STORE_QUERY.search(raw))) or bool(named_store)
    if store:
        # Store words are the request, not part of the geocoding address.
        if named_store and not _STORE.search(raw):
            raw = named_store.group("area")
        else:
            raw = re.sub(r"^.*?\b(?:quán|cửa\s+hàng|chi\s+nhánh|kiosk)\b\s*(?:nào)?\s*", "", raw, flags=re.IGNORECASE)
            raw = re.sub(r"^(?:có\s+)?(?:địa\s+chỉ\s+)?(?:nào\s+)?", "", raw, flags=re.IGNORECASE)
    else:
        raw = _PREFIX.sub("", raw)
    raw = re.sub(r"^(?:gần|ở|tại|quanh|khu(?:\s+vực)?|bên|địa\s+chỉ\s+này)\s*", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\s+(?:có\s+không|không|ko|k|đi|nhé|nha|giúp\s+(?:tôi|mình))$", "", raw, flags=re.IGNORECASE).strip(" ,")
    parts = [_admin_component(part.strip()) for part in raw.split(",") if part.strip()]
    value = ", ".join(parts)
    if _HOUSE.match(parts[0]) if parts else False:
        street_tail = normalize(re.sub(r"^\d{1,5}[A-Za-z]?(?:[/.-]\d{1,5}[A-Za-z]?)?\s+", "", parts[0]))
        if not street_tail or set(street_tail.split()) <= {"di", "nhe", "nha", "giup", "toi", "minh", "chon", "lay", "so", "thu"}:
            return Location("none")
        return Location("address", value, _missing_delivery(parts))
    if store:
        return Location("branch_query", "" if normalize(value) in {"day", "gan day", "nao", ""} else value)
    if re.search(r"\b(?:phường|phuong|xã|quận|huyện|huyen|thành phố|thanh pho|tỉnh|tinh|khu vực|khu vuc)\b", value, re.IGNORECASE) or (
        area_intro and len(value.split()) >= 2
    ) or re.search(r"^(?:đường|phố|hẻm|ngõ)\s+\S+", value, re.IGNORECASE):
        return Location("area", value)
    return Location("none")
