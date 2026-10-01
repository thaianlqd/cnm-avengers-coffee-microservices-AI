"""Pure interpretation of shopping language against canonical catalog identities.

This module provides evidence to the existing order graph. It never executes a
cart, checkout, catalog, or model call. Ordinals are supplied by the graph's
existing snapshot resolver so its numbering contract stays unchanged.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any, Mapping, Optional, Sequence, Tuple


Product = Mapping[str, Any]


def normalize_shopping(value: Any) -> str:
    """Normalize customer language only; never apply this to business IDs."""
    raw = unicodedata.normalize("NFD", str(value or "").casefold())
    plain = "".join(char for char in raw if unicodedata.category(char) != "Mn").replace("đ", "d")
    text = re.sub(r"\s+", " ", re.sub(r"[^\w#]+", " ", plain)).strip()
    return re.sub(r"\b(?:k|ko)\b", "khong", text)


_FAMILIES = (
    ("moon_cake", "food", "Bánh Trung Thu", "Bánh Trung Thu", ("banh trung thu",)),
    ("savory_cake", "food", "Bánh Mặn", "Bánh mặn", ("banh man",)),
    ("sweet_cake", "food", "Bánh Ngọt", "Bánh ngọt", ("banh ngot",)),
    ("cold_brew", "drink", "Cold Brew", "Cold Brew", ("cold brew",)),
    ("americano", "drink", "americano", "Americano", ("americano",)),
    ("espresso", "drink", "Espresso", "Espresso", ("espresso",)),
    ("frappe", "drink", "Frappe", "Frappe", ("frappe",)),
    ("latte", "drink", "Latte", "Latte", ("latte",)),
    ("matcha", "all", "matcha", "Matcha", ("matcha",)),
    ("coffee", "drink", "cà phê", "Cà phê", ("ca phe", "coffee")),
    ("tea", "drink", "trà", "Trà", ("tra", "tea")),
    ("pizza", "food", "Pizza", "Pizza & Pasta", ("pizza",)),
    ("pasta", "food", "Pizza", "Pizza & Pasta", ("pasta",)),
    ("food", "food", None, "Menu bánh và đồ ăn", ("banh", "do an", "thuc an", "mon an")),
    ("drink", "drink", None, "Menu nước", ("nuoc", "do uong", "thuc uong")),
)
_FAMILY_PHRASES = frozenset(phrase for row in _FAMILIES for phrase in row[4])
_DISCOURSE_FRAME_WORDS = frozenset(
    "hello hi alo e xin chao hien tai bay gio a quen nay khoan nhan tien truoc da minh".split()
)


@dataclass(frozen=True)
class ShoppingInterpretation:
    raw_text: str
    normalized_text: str
    act: str = "UNKNOWN"
    read_only: bool = True
    entity_type: str = "NONE"
    targets: Tuple[Product, ...] = ()
    category: Optional[str] = None
    family: Optional[str] = None
    search_text: Optional[str] = None
    label: Optional[str] = None
    quantity: int = 1
    quantity_valid: bool = True
    reference_source: Optional[str] = None
    ambiguity: Tuple[Product, ...] = ()


def shopping_quantity(message: str) -> int:
    """One quantity interpretation for new shopping selections only."""
    raw = unicodedata.normalize("NFD", str(message or "").casefold())
    plain = "".join(char for char in raw if unicodedata.category(char) != "Mn").replace("đ", "d")
    text = re.sub(r"\s+", " ", re.sub(r"[^\w#-]+", " ", plain)).strip()
    number = r"(-?\d+|mot|hai|ba|bon|tu|nam|sau|bay|tam|chin|muoi)"
    match = (re.search(r"\b(?:so luong|sl)\s*(?:la\s*)?" + number + r"\b", text)
             or re.search(r"(?<!\w)" + number + r"\s*(?:cai|ly|phan|mon)\b", text)
             or re.search(r"\bthem\s+" + number + r"\b", text))
    if not match:
        return 1
    words = dict(zip("mot hai ba bon tu nam sau bay tam chin muoi".split(),
                     (1, 2, 3, 4, 4, 5, 6, 7, 8, 9, 10)))
    return int(match[1]) if re.fullmatch(r"-?\d+", match[1]) else words[match[1]]


def _family(text: str) -> Optional[tuple[str, str, Optional[str], str]]:
    hits = []
    for family, category, search, label, phrases in _FAMILIES:
        for phrase in phrases:
            for match in re.finditer(r"\b" + re.escape(phrase) + r"\b", text):
                hits.append((len(phrase), match.start(), family, category, search, label))
    if not hits:
        return None
    _, _, family, category, search, label = max(hits, key=lambda row: (row[0], -row[1]))
    if family == "matcha" and re.search(r"\bbanh\b", text):
        return "matcha", "food", "matcha", "Bánh Matcha"
    if family == "matcha" and re.search(r"\b(?:nuoc|do uong|tra)\b", text):
        return "matcha", "drink", "matcha", "Matcha"
    return family, category, search, label


def _unique_products(rows: Sequence[Product]) -> Tuple[Product, ...]:
    seen = set()
    result = []
    for row in rows:
        identity = str(row.get("product_id") or "").strip()
        if identity and identity not in seen and row.get("product_name"):
            seen.add(identity)
            result.append(row)
    return tuple(result)


def _product_matches(text: str, products: Sequence[Product], *, exact: bool) -> Tuple[Product, ...]:
    matches = []
    exact_spans = []
    for product in _unique_products(products):
        title = normalize_shopping(product.get("product_name"))
        if not title:
            continue
        title_spans = [match.span() for match in re.finditer(r"\b" + re.escape(title) + r"\b", text)]
        if title_spans:
            matches.append(product)
            exact_spans.append((product, title, title_spans))
            continue
        if exact:
            continue
        tokens = title.split()
        # A title fragment can be short when the current candidates make it
        # unique. Bare known families are excluded before alias matching.
        for size in range(len(tokens) - 1, 1, -1):
            if any((phrase := " ".join(tokens[start:start + size])) not in _FAMILY_PHRASES
                   and re.search(r"\b" + re.escape(phrase) + r"\b", text)
                   for start in range(len(tokens) - size + 1)):
                matches.append(product)
                break
    if exact and len(exact_spans) > 1:
        # A canonical full name can contain another canonical name (for example
        # a capacity-prefixed product and its regular-size sibling).  Keep the
        # shorter product only when it also appears in its own non-overlapping
        # clause; an overlapping substring is not a second customer selection.
        kept = []
        for product, title, spans in exact_spans:
            independent = any(not any(
                other_title != title
                and len(other_title) > len(title)
                and other_start <= start and end <= other_end
                for _other, other_title, other_spans in exact_spans
                for other_start, other_end in other_spans
            ) for start, end in spans)
            if independent:
                kept.append(product)
        matches = kept
    return _unique_products(matches)


def is_family_only(message: str, family_name: Optional[str]) -> bool:
    """Recognize a family plus speech frame, with no unaccounted product words."""
    if not family_name:
        return False
    text = re.sub(r"\bdat hang\b", "dat", normalize_shopping(message))
    phrases = next((row[4] for row in _FAMILIES if row[0] == family_name), ())
    for phrase in sorted(phrases, key=len, reverse=True):
        remainder, count = re.subn(r"\b" + re.escape(phrase) + r"\b", " ", text, count=1)
        if not count:
            continue
        # These words form the shopping question/request frame. A remaining
        # content word (e.g. "muối", "kem dừa") makes it a product query.
        frame = set("ben ban minh toi quan o day co ban muon can mua dat lay them cho lam xem tim "
                    "menu thuc don gi nao loai mon cac nhung duoc khong di nhe nha ne nhi "
                    "the vay a oi b hen voi dang hien".split()) | _DISCOURSE_FRAME_WORDS
        if set(remainder.split()).issubset(frame):
            return True
    return False


def _selects_target(text: str, targets: Sequence[Product], source: Optional[str]) -> bool:
    if source == "snapshot_ordinal":
        return True
    if re.search(r"\b(?:mua|lay|them|chon|dat)\b|\b(?:cho|lam)\s+(?:toi|minh)\b", text):
        return True
    if re.search(r"\b(?:\d+|mot|hai|ba|bon|tu|nam|sau|bay|tam|chin|muoi)\s*(?:cai|ly|phan|mon)\b", text):
        return True
    title_words = {word for row in targets
                   for word in normalize_shopping(row.get("product_name")).split()}
    fillers = set("mon cai ly phan di nhe nha ne nhi the vay ban b oi a voi cho toi minh".split())
    meaningful = set(text.split()) - fillers
    return bool(meaningful) and meaningful.issubset(title_words)


def interpret_shopping(
    raw_text: str, *, snapshot: Sequence[Product] = (), active_catalog: Sequence[Product] = (),
    ordinal_targets: Sequence[Product] = (), ordinal_requested: bool = False,
    ordinal_invalid: bool = False, focus: Optional[Product] = None,
) -> ShoppingInterpretation:
    text = normalize_shopping(raw_text)
    quantity = shopping_quantity(raw_text)
    base = {"raw_text": raw_text, "normalized_text": text,
            "quantity": quantity, "quantity_valid": quantity > 0}
    if not text:
        return ShoppingInterpretation(**base)
    if re.search(
        r"\b(?:voucher|ma giam gia|thanh toan|checkout|chot don|dat don|"
        r"giao hang|lay tai quan|chi nhanh|dia chi|lich su don|don hang|"
        r"xoa mon|bo mon|sua topping|doi so luong|tang so luong|giam so luong)\b",
        text,
    ):
        return ShoppingInterpretation(**base, act="NOT_APPLICABLE")
    negative = bool(re.search(
        r"\b(?:khong\s+(?:lay|mua|them|chon)|dung\s+(?:them|mua|lay)|"
        r"bo\s+(?:mon|cai|san pham|qua|topping|size)|huy)\b", text))
    info = bool(re.search(r"\b(?:gia|bao nhieu|review|danh gia|nhan xet|ngon|vi|topping|size|thanh phan|the nao)\b", text)
                or re.search(r"\bco\b.*\b(?:khong|nao|gi)\b", text)
                or re.search(r"\b(?:xem|tim|goi y|menu|thuc don)\b", text))
    selection_style = bool(re.search(
        r"\b(?:mua|lay|them|chon|dat)\b|\b(?:cho|lam)\s+(?:toi|minh)\b", text,
    ))
    family = _family(text)
    family_bare = is_family_only(raw_text, family[0] if family else None)
    if ordinal_requested:
        if ordinal_invalid or not ordinal_targets:
            return ShoppingInterpretation(**base, act="AMBIGUOUS", entity_type="PRODUCT_ORDINAL")
        targets, source, entity = _unique_products(ordinal_targets), "snapshot_ordinal", "PRODUCT_ORDINAL"
        ambiguity = ()
    else:
        targets, source, entity, ambiguity = (), None, "NONE", ()
        for rows, origin in ((snapshot, "snapshot"), (active_catalog, "catalog")):
            exact = _product_matches(text, rows, exact=True)
            if exact:
                targets, source, entity = exact, origin + "_exact", "PRODUCT"
                break
            # A selection-shaped turn first resolves a unique fragment inside
            # the visible snapshot. Explicit menu/info language still owns the
            # broad family browse contract.
            family_selection = bool(
                family_bare and origin == "snapshot" and selection_style and not info
            )
            if family_bare and not family_selection:
                continue
            aliases = _product_matches(text, rows, exact=False)
            if aliases:
                if len(aliases) == 1:
                    targets, source, entity = aliases, origin + "_alias", "PRODUCT"
                else:
                    ambiguity = aliases
                break
            # Some narrow families are one token long, so the alias resolver
            # intentionally cannot construct a two-token title fragment. Use
            # the same visible snapshot and category, never a catalog guess.
            if (family_selection and family
                    and family[0] not in {"coffee", "tea", "food", "drink", "pizza", "pasta"}):
                family_phrase = normalize_shopping(family[2] or family[3])
                family_rows = _unique_products([
                    row for row in rows
                    if (family[1] == "all" or str(row.get("category") or "") == family[1])
                    and re.search(r"\b" + re.escape(family_phrase) + r"\b",
                                  normalize_shopping(row.get("product_name")))
                ])
                if len(family_rows) == 1:
                    targets, source, entity = family_rows, "snapshot_alias", "PRODUCT"
                elif family_rows:
                    ambiguity = family_rows
                if targets or ambiguity:
                    break
    if negative:
        return ShoppingInterpretation(**base, act="NEGATE_PRODUCT", entity_type=entity,
                                      targets=targets, reference_source=source, ambiguity=ambiguity)
    if targets and (info or re.search(r"\b(?:co|con)\b.*\b(?:khong|nao|gi)\b", text)):
        return ShoppingInterpretation(**base, act="PRODUCT_INFO", entity_type=entity,
                                      targets=targets, reference_source=source)
    if ambiguity:
        return ShoppingInterpretation(**base, act="AMBIGUOUS", entity_type="PRODUCT",
                                      ambiguity=ambiguity,
                                      category=family[1] if family else None,
                                      family=family[0] if family else None,
                                      search_text=family[2] if family else None,
                                      label=family[3] if family else None)
    if targets and _selects_target(text, targets, source):
        return ShoppingInterpretation(**base, act="ADD_ITEM", read_only=False,
                                      entity_type=entity, targets=targets, reference_source=source)
    if targets:
        return ShoppingInterpretation(**base, act="PRODUCT_INFO", entity_type=entity,
                                      targets=targets, reference_source=source)
    if focus and re.search(r"\b(?:mon|cai|san pham|banh|nuoc)\s+(?:do|nay|kia)\b", text):
        return ShoppingInterpretation(**base, act="ADD_ITEM" if not info else "PRODUCT_INFO",
                                      read_only=info, entity_type="FOCUS_REFERENCE", targets=(focus,),
                                      reference_source="focus")
    if family:
        family_name, category, search, label = family
        composite_food_matcha = family_name == "matcha" and category == "food" and bool(
            re.search(r"\bbanh\s+matcha\b", text))
        if family_bare or composite_food_matcha:
            return ShoppingInterpretation(**base, act="BROWSE_FAMILY", entity_type=(
                "CATEGORY" if family_name in {"food", "drink"} else "PRODUCT_FAMILY"),
                category=category, family=family_name, search_text=search, label=label)
    if re.search(r"\bdat hang\b", text):
        return ShoppingInterpretation(**base, act="NOT_APPLICABLE")
    return ShoppingInterpretation(**base)
