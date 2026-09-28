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
    store = bool(_STORE.search(raw)) and bool(re.search(
        r"\b(?:gần|tìm|ở đâu|địa chỉ|nào|quanh|khu vực)\b", raw, re.IGNORECASE
    ))
    if store:
        # Store words are the request, not part of the geocoding address.
        raw = re.sub(r"^.*?\b(?:quán|cửa\s+hàng|chi\s+nhánh|kiosk)\b\s*(?:nào)?\s*", "", raw, flags=re.IGNORECASE)
        raw = re.sub(r"^(?:có\s+)?(?:địa\s+chỉ\s+)?(?:nào\s+)?", "", raw, flags=re.IGNORECASE)
    else:
        raw = _PREFIX.sub("", raw)
    raw = re.sub(r"^(?:gần|ở|tại|quanh|khu\s+vực|địa\s+chỉ\s+này)\s*", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\s+(?:đi|nhé|nha|giúp\s+(?:tôi|mình))$", "", raw, flags=re.IGNORECASE).strip(" ,")
    parts = [_admin_component(part.strip()) for part in raw.split(",") if part.strip()]
    value = ", ".join(parts)
    if _HOUSE.match(parts[0]) if parts else False:
        street_tail = normalize(re.sub(r"^\d{1,5}[A-Za-z]?(?:[/.-]\d{1,5}[A-Za-z]?)?\s+", "", parts[0]))
        if not street_tail or set(street_tail.split()) <= {"di", "nhe", "nha", "giup", "toi", "minh", "chon", "lay", "so", "thu"}:
            return Location("none")
        return Location("address", value, _missing_delivery(parts))
    if store:
        return Location("branch_query", "" if normalize(value) in {"day", "gan day", "nao", ""} else value)
    if re.search(r"\b(?:phuong|xa|quan|huyen|thanh pho|tinh|khu vuc)\b", normalize(value)) or (
        _NEAR.search(message) and len(value.split()) >= 2
    ) or re.search(r"^(?:đường|phố|hẻm|ngõ)\s+\S+", value, re.IGNORECASE):
        return Location("area", value)
    return Location("none")
