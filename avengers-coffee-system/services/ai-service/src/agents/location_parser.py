"""Structural Vietnamese location parsing for checkout and store lookup."""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass


def normalize(value: str) -> str:
    raw = unicodedata.normalize("NFD", str(value or "").lower())
    return re.sub(r"\s+", " ", "".join(c for c in raw if unicodedata.category(c) != "Mn").replace("đ", "d")).strip()


def canonical_address(value: str) -> str:
    """Collapse repeated comma-delimited suffixes from any location source."""
    parts = [part.strip() for part in str(value or "").split(",") if part.strip()]
    while parts:
        duplicate = next((size for size in range(len(parts) // 2, 0, -1)
                          if [normalize(p) for p in parts[-2 * size:-size]] ==
                          [normalize(p) for p in parts[-size:]]), None)
        if duplicate is None:
            break
        del parts[-duplicate:]
    if len(parts) > 2:
        def rank(part: str) -> int | None:
            folded = normalize(part)
            if re.match(r"^(?:phuong|xa|p\.)\s+", folded):
                return 0
            if re.match(r"^(?:quan|huyen|thi xa|q\.|h\.)\s+", folded):
                return 1
            if re.match(r"^(?:thanh pho|tinh|tp\.)\s+", folded):
                return 2
            return None
        # Reorder only fully identified administrative components.
        if all(rank(part) is not None for part in parts[1:]):
            parts = parts[:1] + sorted(parts[1:], key=rank)
    return ", ".join(parts)


_DISCOURSE_SUFFIX = re.compile(
    r"(?:[,\s.!?]+(?:á\s+bạn|ạ\s+bạn|bạn\s+ơi|nha\s+bạn|nhé\s+bạn|giúp\s+mình\s+với|á|ạ|nhé|nha|đi))+$",
    re.IGNORECASE,
)


def clean_location_clause(value: str) -> str:
    """Remove trailing chat particles without altering an administrative name."""
    return _DISCOURSE_SUFFIX.sub("", str(value or "").strip()).strip(" ,.!?\t\r\n")


def locality_matches(address: str, requested: str) -> bool:
    """Match a complete administrative component, including P./Q. aliases."""
    prefix = r"^(?:phuong|xa|quan|huyen|tinh|thanh pho|tp|p|q|h)\.?\s+"
    area = re.sub(prefix, "", normalize(requested.split(",", 1)[0])).strip()
    if not area:
        return False
    for component in str(address or "").split(","):
        value = normalize(component)
        bare = re.sub(prefix, "", value).strip()
        if bare == area or value == area:
            return True
    return False


def infer_city_from_addresses(requested: str, addresses: list[str]) -> tuple[str | None, bool]:
    """Return a city only when exact locality matches agree on one city."""
    cities: dict[str, str] = {}
    for address in addresses:
        if not locality_matches(address, requested):
            continue
        for component in str(address or "").split(","):
            city = component.strip()
            if re.match(r"^(?:thành phố|tp\.?|tỉnh)\s+", city, re.IGNORECASE):
                key = re.sub(r"^(?:thanh pho|tp\.?|tinh)\s+", "", normalize(city))
                cities[key] = city
    return (next(iter(cities.values())), False) if len(cities) == 1 else (None, len(cities) > 1)


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

_SAVED_ADDRESS_REFERENCE = re.compile(
    r"\b(?:dia chi (?:do|nay|tren|kia|vua (?:noi|roi)|da luu|(?:trong )?ho so)|"
    r"(?:o|cho) do|cho nay)\b"
)


def _reference_kind(message: str) -> str | None:
    """Classify deictic address language before it can become a map query."""
    text = normalize(message)
    if not text:
        return None
    reference = _SAVED_ADDRESS_REFERENCE.search(text)
    if not reference:
        if re.search(r"\b(?:dia chi|cho|o)\b[^.!?]*\bkhac\b", text):
            return "change_reference"
        return None
    if re.search(r"\b(?:khong phai|khong dung|khong lay|doi|thay)\b", text) or re.search(
        r"\b(?:dia chi|cho|o)\b[^.!?]*\bkhac\b", text
    ):
        return "change_reference"
    if "?" in message or re.search(r"\b(?:la gi|la dia chi nao|o dau|dau|dia chi nao)\b", text):
        return "reference_question"
    return "reference"


def _admin_component(component: str) -> str:
    # Expand only at a comma-delimited component start, never inside a street.
    match = re.match(r"^(P|Q|TP|H)(?:\.\s*|\s+)(?=\S)", component, re.IGNORECASE)
    return ({"p": "Phường", "q": "Quận", "tp": "Thành phố", "h": "Huyện"}[match.group(1).lower()] + " " + component[match.end():]) if match else component


def _missing_delivery(parts: list[str]) -> tuple[str, ...]:
    locality = [normalize(part) for part in parts[1:]]
    missing = []
    for pattern, label in ((r"\b(phuong|xa)\b", "phường/xã"),
                           (r"\b(thanh pho|tinh)\b", "tỉnh/thành phố")):
        if not any(re.search(pattern, part) for part in locality):
            missing.append(label)
    return tuple(missing)


def complete_partial_delivery_address(partial: str, fragment: str) -> Location | None:
    """Use a short reply only when one known delivery field is missing."""
    previous = parse_location(partial)
    if previous.kind != "address" or len(previous.missing) != 1:
        return None
    value = clean_location_clause(fragment)
    folded = normalize(value).replace(".", "")
    if "," in value or not value or len(value) > 60:
        return None
    if previous.missing[0] == "tỉnh/thành phố":
        if folded in {"ho chi minh", "tp hcm", "tphcm", "hcm"}:
            value = "Thành phố Hồ Chí Minh"
        elif not re.match(r"^(?:thành phố|tỉnh|tp\.?)\s+\S+", value, re.IGNORECASE):
            return None
    elif previous.missing[0] == "phường/xã":
        explicit = re.match(r"^(phường|xã|p\.)\s+(.+)$", value, re.IGNORECASE)
        if explicit:
            locality = explicit.group(2)
            value = ("Xã" if normalize(explicit.group(1)) == "xa" else "Phường") + " " + locality.title()
        else:
            # A short locality name can answer a ward-only question; shopping
            # commands and bare numeric wards remain ambiguous.
            if not re.fullmatch(r"[^\W\d_]+(?:[-\s]+[^\W\d_]+){1,2}", value, re.UNICODE):
                return None
            if set(folded.split()) & {"banh", "nuoc", "them", "lay", "mua", "can", "bo", "thoi", "giao", "cod", "size", "so", "thu", "doi", "sang", "khong"}:
                return None
            value = "Phường " + value.title()
    else:
        return None
    result = parse_location(f"{previous.value}, {value}")
    return result if result.kind == "address" and not result.missing else None


def parse_location(message: str) -> Location:
    raw = str(message or "").strip(" \t\r\n.!?")
    if not raw:
        return Location("none")
    # A new numbered street address wins even if the customer first rejects
    # or mentions the old address in the same sentence.
    explicit_address = re.search(r"(?<!\w)\d{1,5}[A-Za-z]?(?:[/.-]\d{1,5}[A-Za-z]?)?\s+\S+", raw)
    if explicit_address:
        candidate = raw[explicit_address.start():]
        if _HOUSE.match(candidate) and not set(normalize(candidate.split(",", 1)[0]).split()[1:]) <= {
            "di", "nhe", "nha", "giup", "toi", "minh", "chon", "lay", "so", "thu"
        }:
            raw = candidate
    reference_kind = _reference_kind(raw + ("?" if "?" in str(message or "") else ""))
    if reference_kind:
        return Location(reference_kind, "saved_address" if reference_kind != "change_reference" else "")
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
    raw = re.sub(r"\s+(?:có\s+không|không|ko|k|giúp\s+(?:tôi|mình))$", "", raw, flags=re.IGNORECASE).strip(" ,")
    raw = clean_location_clause(raw)
    parts = [_admin_component(part.strip()) for part in raw.split(",") if part.strip()]
    value = canonical_address(", ".join(parts))
    parts = value.split(", ") if value else []
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


def checkout_location(message: str, delivery_type: str | None, awaiting_location: bool = False) -> Location:
    """Extract a location from a checkout turn without widening global parsing."""
    if re.match(r"^\s*(?:số|thứ|#)\s*\d+\b", str(message or ""), re.IGNORECASE):
        return Location("none")
    parsed = parse_location(message)
    if parsed.kind == "address":
        return parsed
    if delivery_type == "GIAO_TAN_NOI":
        return parsed if awaiting_location and parsed.kind == "area" else Location("none")
    # A fulfillment/payment sentence may include a separate explicit location
    # clause. Parse that clause with the same structural parser.
    clauses = re.split(r"[,;]\s*|\b(?=(?:tôi|mình)(?:\s+đang)?\s+ở\b)", str(message or ""), flags=re.IGNORECASE)
    for clause in reversed(clauses):
        candidate = parse_location(clause.strip())
        if candidate.kind in {"area", "address"} and candidate.value:
            return candidate
    if parsed.kind == "area" and parsed.value:
        return parsed
    if parsed.kind == "branch_query" and parsed.value and not re.search(
        r"\b(?:qr|cod|chuyen khoan|lay tai quan|dung tai cho)\b", normalize(parsed.value)):
        return parsed
    if not awaiting_location:
        return Location("none")
    short = clean_location_clause(message)
    if not re.fullmatch(r"[^\W\d_]+(?:\s+[^\W\d_]+){1,2}", short, re.UNICODE):
        return Location("none")
    folded = normalize(short)
    if _PRODUCT_TOPIC.search(short) or set(folded.split()) & {
        "them", "mua", "lay", "banh", "nuoc", "cod", "size", "so", "thu", "chuyen", "khoan",
    }:
        return Location("none")
    # Bare names need Vietnamese locality evidence; otherwise a product name
    # such as an English menu item is ambiguous.
    if short.lower() == normalize(short):
        return Location("none")
    return parse_location("ở " + short)
