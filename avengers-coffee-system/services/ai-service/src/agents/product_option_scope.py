"""Bind option clauses to canonical products before interpreting their values.

Only target boundaries split clauses: commas and conjunctions inside an option
list remain intact. Product names, ordinals and option values come from the
server snapshots, never from model-proposed IDs.
"""
from dataclasses import dataclass
import re

from src.agents.selection_language import (
    _fold, _NUMBER_TOKEN, _ordinal, PRODUCT_REFERENCE_CATEGORIES,
    product_reference_category,
)
from src.agents.product_display import product_bucket
from src.agents.option_state import (
    literal_option_choices, uses_global_option_defaults, requests_custom_options,
    validate_explicit_multi_value_group,
)


@dataclass(frozen=True)
class ProductOptionScopes:
    clauses: dict
    explicit: bool = False
    ambiguous: bool = False


def option_answer(message, groups=()):
    text = _fold(message).strip(' ,;.!')
    return bool(literal_option_choices(message, groups)
        or any((validate_explicit_multi_value_group(message, group, groups) or {}).get('valid_values')
            for group in groups if group.get('multiple'))
        or uses_global_option_defaults(message) or requests_custom_options(message)
        or re.search(r'\b(?:size|kich thuoc|kich co|topping|toping|do kem|luong da|ngot|loai sua)\b', text)
        or text in {'ok', 'oke', 'dung roi', 'dong y', 'khong them topping'})


def option_question(message):
    text = _fold(message)
    return '?' in message or bool(re.search(
        r'^(?:tai sao|vi sao|sao)\b|\b(?:bao nhieu|la gi|the nao|chi hoi|xem truoc)\b', text))


def resolve_product_option_scopes(message, pending, catalog=(), groups=None):
    text = _fold(message)
    groups = groups or {}
    rows = pending or catalog
    spans = []
    labels = '|'.join(re.escape(label) for label in PRODUCT_REFERENCE_CATEGORIES)
    pattern = (r'(?<!\w)(?P<label>' + labels + r')\s+'
        r'(?:(?P<staged>dang chon)\s+)?(?:(?:so|thu|#)\s*)?'
        r'(?P<number>' + _NUMBER_TOKEN + r')(?!\w)')
    for match in re.finditer(pattern, text):
        # A cart ordinal has its own namespace, never a staged-product target.
        if re.search(r'\b(?:trong gio|gio hang)\b', text[match.end():match.end() + 20]):
            continue
        ordinal = _ordinal(match['number'])
        bucket = product_reference_category(match['label'])
        if pending and (match['staged'] or not bucket):
            if any(row.get('selection_index') for row in pending) or match['staged']:
                targets = [row for index, row in enumerate(pending, 1)
                    if int(row.get('selection_index') or index) == ordinal]
            else:
                # Older drafts have no staged ordinal. Recover only from the
                # original visible catalog identity, never renumber by guessing.
                targets = [row for index, row in enumerate(catalog, 1)
                    if int(row.get('display_index') or index) == ordinal
                    and any(str(item['product_id']) == str(row['product_id']) for item in pending)]
                if not catalog:
                    targets = [row for index, row in enumerate(pending, 1) if index == ordinal]
        else:
            source = groups.get(bucket) or catalog or rows
            source = [row for row in source if not bucket or product_bucket(row) == bucket]
            field = 'group_display_index' if bucket else 'display_index'
            targets = [row for index, row in enumerate(source, 1)
                if int(row.get(field) or index) == ordinal]
        ids = {str(row['product_id']) for row in targets}
        spans.append((match.start(), match.end(), next(iter(ids)) if len(ids) == 1 else None))

    # Longest canonical title owns an overlapping name (including hot variants).
    names = []
    unique = {str(row['product_id']): row for row in list(catalog) + list(pending)}
    for product_id, row in unique.items():
        name = _fold(row.get('product_name'))
        if name:
            names.extend((match.start(), match.end(), product_id) for match in
                re.finditer(r'(?<!\w)' + re.escape(name) + r'(?!\w)', text))
    name_spans = []
    for candidate in sorted(names, key=lambda span: span[1] - span[0], reverse=True):
        if not any(candidate[0] < end and candidate[1] > start for start, end, _ in name_spans):
            name_spans.append(candidate)
    spans = [span for span in spans if not any(span[0] < end and span[1] > start for start, end, _ in name_spans)] + name_spans
    spans.sort()
    consolidated = []
    for span in spans:
        if consolidated and span[2] is not None and span[2] == consolidated[-1][2]:
            previous = consolidated[-1]
            gap = text[previous[1]:span[0]].strip(' ,;:')
            if not gap or re.fullmatch(r'(?:la|ten|mon|nuoc)', gap):
                consolidated[-1] = (previous[0], span[1], span[2])
                continue
        consolidated.append(span)
    spans = consolidated
    if spans:
        clauses = {}
        ambiguous = any(product_id is None for _, _, product_id in spans)
        if pending:
            pending_ids = {str(row['product_id']) for row in pending}
            ambiguous = ambiguous or any(product_id not in pending_ids for _, _, product_id in spans)
        for index, (start, end, product_id) in enumerate(spans):
            stop = spans[index + 1][0] if index + 1 < len(spans) else len(text)
            clause = text[end:stop].strip(' ,;')
            clause = re.sub(r'\s+(?:va|voi|con|roi)$', '', clause).strip(' ,;')
            if product_id is None:
                continue
            if not clause or re.fullmatch(r'(?:va|voi|con|roi)', clause):
                # A coordinated list followed by one option clause needs an
                # explicit shared instruction, rather than assigning to the last.
                if len(spans) > 1:
                    ambiguous = True
            if product_id in clauses:
                ambiguous = True  # Conflicting/repeated instructions need clarification.
            clauses[product_id] = clause
        return ProductOptionScopes(clauses, explicit=True, ambiguous=ambiguous)
    if pending:
        if re.search(r'\b(?:tat ca|ca\s+\d+|moi mon|cac mon)\b', text):
            return ProductOptionScopes({str(row['product_id']): text for row in pending})
        # The unlabelled answer belongs to the first staged option question.
        return ProductOptionScopes({str(pending[0]['product_id']): text})
    return ProductOptionScopes({str(row['product_id']): text for row in rows})
