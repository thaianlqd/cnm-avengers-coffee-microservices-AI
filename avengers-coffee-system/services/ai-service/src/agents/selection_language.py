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
    # Product category labels retain the existing grouped snapshot contract.
    ordinal_labels: Tuple[str, ...] = ()


_WORD_ORDINALS = {
    "mot": 1, "nhat": 1, "hai": 2, "ba": 3, "bon": 4, "tu": 4,
    "nam": 5, "sau": 6, "bay": 7, "tam": 8, "chin": 9, "muoi": 10,
}
_NUMBER_TOKEN = r"\d+|mot|nhat|hai|ba|bon|tu|nam|sau|bay|tam|chin|muoi"
_NUMBER = r"(?P<number>" + _NUMBER_TOKEN + r")"
PRODUCT_REFERENCE_CATEGORIES = {
    "do uong": "drink", "thuc uong": "drink", "nuoc": "drink",
    "do an": "food", "banh": "food", "san pham": None, "mon": None,
}
_NAMESPACE_PATTERNS = (
    ("PAYMENT", r"phuong\s+thuc\s+thanh\s+toan|cach\s+thanh\s+toan|thanh\s+toan"),
    ("FULFILLMENT", r"hinh\s+thuc\s+nhan\s+hang|cach\s+nhan\s+hang"),
    ("LOCATION_CANDIDATE", r"dia\s+diem|dia\s+chi|vi\s+tri"),
    ("BRANCH", r"chi\s+nhanh|cua\s+hang|kiosk"),
    ("VOUCHER", r"ma\s+giam\s+gia|voucher|ma"),
    ("CART_LINE", r"dong"),
    ("PRODUCT", "|".join(re.escape(label).replace(r"\ ", r"\s+")
                          for label in PRODUCT_REFERENCE_CATEGORIES)),
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


def product_reference_category(label: str) -> Optional[str]:
    """Use the parser's PRODUCT alias vocabulary for grouped snapshots."""
    return PRODUCT_REFERENCE_CATEGORIES.get(_fold(label))


def product_category_pattern(category: str) -> str:
    return "|".join(re.escape(label).replace(r"\ ", r"\s+")
                    for label, bucket in PRODUCT_REFERENCE_CATEGORIES.items() if bucket == category)


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
        r"the\s+nao|gia(?:\s+bao\s+nhieu)?|giam\s+bao\s+nhieu|o\s+dau|"
        r"bao\s+xa|cach\b[^,.!?]*\bbao\s+xa|con\s+(?:du\s+)?(?:mon|hang)|chua\s+chon|chi\s+hoi)\b",
        text,
    ):
        return "INFO_REFERENCE"
    if re.search(r"\b(?:khong|ko|k|dung|chua)\s+(?:chon|lay|mua|them|dat)\b", text):
        return "NEGATE_REFERENCE"
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
        marker = r"(?:so|thu|#|[a-z]{1,3}(?=\s+\d))" if namespace == "PRODUCT" else r"(?:so|thu|#)"
        match = re.match(r"\s*(?:" + marker + r"\s*)?" + _NUMBER + r"\b", after)
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

    if not values and active_namespace and operation_semantics == "SELECT_REFERENCE":
        # A positive verb can introduce an unlabelled number in an active UI
        # namespace. Require the number immediately after that verb/personal object.
        selected = re.match(
            r"(?:(?:toi|minh)\s+)?(?:chon|lay|mua|them|dat|cho\s+(?:toi|minh))\s+"
            r"(?:(?:so|thu|#)\s*)?" + _NUMBER + r"\b", text)
        if selected:
            values.append(_ordinal(selected.group("number")))
            spans.append(selected.span())

    if not values:
        return SelectionReference(namespace=namespace, operation_semantics=operation_semantics)
    if _address_like_tail(text, spans[0][1], namespace):
        return SelectionReference(namespace=namespace, operation_semantics=operation_semantics)

    preceding = [match for _name, pattern in _NAMESPACE_PATTERNS
                 for match in re.finditer(r"(?<!\w)(?:" + pattern + r")(?!\w)", text)
                 if match.end() <= spans[0][1]]
    labels = [max(preceding, key=lambda match: match.end()).group() if preceding else ""]
    if allow_multiple:
        cursor = spans[-1][1]
        namespace_pattern = "|".join(pattern for _name, pattern in _NAMESPACE_PATTERNS)
        while True:
            continuation = re.match(
                r"\s*(?:va|voi|,|&)\s*(?:(?P<label>" + namespace_pattern + r")\s*)?"
                r"(?:(?:so|thu|#)\s*)?" + _NUMBER + r"\b",
                text[cursor:],
            )
            if not continuation:
                break
            values.append(_ordinal(continuation.group("number")))
            labels.append(continuation.group("label") or labels[-1])
            cursor += continuation.end()

        # A bare product list must be wholly selection-shaped, never a street
        # address, quantity clause, negative reply, or another owner's number.
        if not labels[0] and active_namespace == "PRODUCT":
            tail = text[cursor:].strip(" ,.!?")
            if operation_semantics != "SELECT_REFERENCE" or tail not in _TAIL_FILLERS:
                return SelectionReference(operation_semantics=operation_semantics)
        explicit_namespaces = {
            name for name, pattern in _NAMESPACE_PATTERNS
            if re.search(r"(?<!\w)(?:" + pattern + r")(?!\w)", text)
        }
        if len(explicit_namespaces) > 1:
            namespace = "MIXED"
        # A labelled, coordinated product list is itself a positive selection
        # when no question, mutation, or negation qualifies it.
        if (namespace == "PRODUCT" and operation_semantics == "UNKNOWN"
                and not re.search(r"\b(?:khong|ko|k|dung|chua)\b", text)
                and text[cursor:].strip(" ,.!?") in _TAIL_FILLERS):
            operation_semantics = "SELECT_REFERENCE"

    return SelectionReference(True, tuple(values), namespace, operation_semantics, tuple(labels))
