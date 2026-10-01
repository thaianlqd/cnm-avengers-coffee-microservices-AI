"""Pure, namespace-aware language contract for numbered UI selections."""
from dataclasses import dataclass
import re
import unicodedata
from typing import Optional, Tuple


@dataclass(frozen=True)
class SelectionReference:
    requested: bool = False
    ordinals: Tuple[int, ...] = ()
    namespace: Optional[str] = None
    operation_semantics: str = "UNKNOWN"


_WORD_ORDINALS = {
    "mot": 1, "nhat": 1, "hai": 2, "ba": 3, "bon": 4, "tu": 4,
    "nam": 5, "sau": 6, "bay": 7, "tam": 8, "chin": 9, "muoi": 10,
}
_NUMBER_TOKEN = r"\d+|mot|nhat|hai|ba|bon|tu|nam|sau|bay|tam|chin|muoi"
_NUMBER = r"(?P<number>" + _NUMBER_TOKEN + r")"
_NAMESPACE_PATTERNS = (
    ("PAYMENT", r"phuong\s+thuc\s+thanh\s+toan|cach\s+thanh\s+toan|thanh\s+toan"),
    ("FULFILLMENT", r"hinh\s+thuc\s+nhan\s+hang|cach\s+nhan\s+hang"),
    ("LOCATION_CANDIDATE", r"dia\s+diem|dia\s+chi|vi\s+tri"),
    ("BRANCH", r"chi\s+nhanh|cua\s+hang|kiosk"),
    ("VOUCHER", r"ma\s+giam\s+gia|voucher|ma"),
    ("CART_LINE", r"dong"),
    ("PRODUCT", r"do\s+uong|thuc\s+uong|nuoc|do\s+an|banh|san\s+pham|mon"),
)
_TAIL_FILLERS = {
    "", "a", "ah", "nha", "nhe", "di", "do", "voi", "giup", "giup toi",
    "ban", "b", "ban oi", "oi", "nha ban", "nhe ban",
}


def _fold(value: str) -> str:
    value = unicodedata.normalize("NFD", str(value or "").lower())
    value = "".join(char for char in value if unicodedata.category(char) != "Mn")
    return re.sub(r"\s+", " ", value.replace("đ", "d")).strip()


def _ordinal(value: str) -> int:
    return int(value) if value.isdigit() else _WORD_ORDINALS[value]


def _namespace(text: str) -> Tuple[Optional[str], Optional[re.Match]]:
    matches = []
    for namespace, pattern in _NAMESPACE_PATTERNS:
        match = re.search(r"(?<!\w)(?:" + pattern + r")(?!\w)", text)
        if match:
            matches.append((match.start(), namespace, match))
    if not matches:
        return None, None
    _start, namespace, match = min(matches, key=lambda row: row[0])
    return namespace, match


def _address_like_tail(text: str, end: int, namespace: Optional[str]) -> bool:
    if namespace != "LOCATION_CANDIDATE":
        return False
    tail = re.sub(r"^[\s,!.?]+|[\s,!.?]+$", "", text[end:])
    return bool(tail and tail not in _TAIL_FILLERS)


def _operation_semantics(text: str, namespace: Optional[str]) -> str:
    """Classify what the customer wants to do with a numbered reference.

    This is deliberately domain-light: namespaces identify the object, while a
    small composable verb/question grammar separates reading, selecting and
    mutating.  Callers still own all business validation and state transitions.
    """
    if re.search(
        r"\b(?:la\s+gi|bao\s+nhieu|thong\s+tin|review|danh\s+gia|nhan\s+xet|"
        r"the\s+nao|gia(?:\s+bao\s+nhieu)?|giam\s+bao\s+nhieu)\b",
        text,
    ):
        return "INFO_REFERENCE"
    if re.search(r"\b(?:xoa|bo|go|doi|sua|chinh|cap\s+nhat|tang|giam)\b", text):
        return "MUTATE_REFERENCE"
    if namespace == "VOUCHER" and re.search(r"\b(?:ap|dung|su\s+dung)\b", text):
        return "MUTATE_REFERENCE"
    if re.search(
        r"\b(?:chon|lay|mua|them|dat)\b|\b(?:cho|lam)\s+(?:toi|minh)\b",
        text,
    ):
        return "SELECT_REFERENCE"
    return "UNKNOWN"


def parse_selection_reference(
    message: str,
    *,
    active_namespace: Optional[str] = None,
    allow_multiple: bool = False,
) -> SelectionReference:
    """Parse only ordinal-selection evidence; never infer business ownership.

    An explicit namespace is returned even when it differs from the active
    owner. Bare ordinals are accepted only while a caller declares an owner.
    """
    original = unicodedata.normalize("NFC", str(message or "").casefold())
    text = _fold(message).strip(" \t\r\n.,!?")
    # Preserve the two accented domain nouns whose folded forms collide with
    # ordinary Vietnamese words ("cho" and the administrative noun "quận").
    if re.search(r"(?<!\w)chỗ(?!\w)", original):
        text = re.sub(r"(?<!\w)cho(?!\w)", "vi tri", text, count=1)
    if re.search(r"(?<!\w)quán(?!\w)", original):
        text = re.sub(r"(?<!\w)quan(?!\w)", "cua hang", text, count=1)
    if not text:
        return SelectionReference()
    namespace, namespace_match = _namespace(text)
    operation_semantics = _operation_semantics(text, namespace)

    spans = []
    values = []
    if namespace_match:
        after = text[namespace_match.end():]
        match = re.match(r"\s*(?:(?:so|thu|#)\s*)?" + _NUMBER + r"\b", after)
        if not match:
            match = re.match(r"\s*(?:dau\s+tien|thu\s+nhat)\b", after)
            if match:
                values.append(1)
                spans.append((namespace_match.end() + match.start(), namespace_match.end() + match.end()))
        else:
            values.append(_ordinal(match.group("number")))
            spans.append((namespace_match.end() + match.start(), namespace_match.end() + match.end()))

    if not values:
        first = re.search(
            r"(?<!\w)(?:(?:(?:so|thu|#)\s*|(?:cai|muc|lua\s+chon|phuong\s+an)\s+(?:(?:so|thu)\s*)?)"
            r"(?P<number>" + _NUMBER_TOKEN + r")"
            r"|(?:cai|muc|lua\s+chon|phuong\s+an)\s+(?P<first>dau\s+tien|thu\s+nhat))(?!\w)",
            text,
        )
        if first:
            raw = first.groupdict().get("number")
            values.append(1 if first.groupdict().get("first") else _ordinal(raw))
            spans.append(first.span())

    if not values and active_namespace:
        bare = re.fullmatch(r"(?:(?:so|thu|#)\s*)?" + _NUMBER + r"|(?:dau\s+tien|thu\s+nhat)", text)
        if bare:
            raw = bare.groupdict().get("number")
            values.append(_ordinal(raw) if raw else 1)
            spans.append(bare.span())

    if not values:
        return SelectionReference(namespace=namespace, operation_semantics=operation_semantics)
    if _address_like_tail(text, spans[0][1], namespace):
        return SelectionReference(namespace=namespace, operation_semantics=operation_semantics)

    if allow_multiple:
        cursor = spans[-1][1]
        while True:
            continuation = re.match(
                r"\s*(?:va|voi|,|&)\s*(?:(?:so|thu|#)\s*)?" + _NUMBER + r"\b",
                text[cursor:],
            )
            if not continuation:
                break
            values.append(_ordinal(continuation.group("number")))
            cursor += continuation.end()

    return SelectionReference(True, tuple(values), namespace, operation_semantics)
