"""Pure, turn-local cart references; never execute a customer operation here."""
import re

from src.agents.selection_language import parse_selection_reference
from src.agents.shopping_language import normalize_shopping, explicit_shopping_quantity

_EDIT_VERB = r'\b(?:xoa|bo(?! qua)|go(?!i)|chinh|sua(?!\s+(?:tuoi|dac|yen mach|hat|dau|nguyen kem|tach beo)\b)|doi|cap nhat|tang|giam)\b'
_NEGATED_EDIT = r'\b(?:khong|chua|dung)\s+(?:(?:muon|can|hay)\s+)?'
_DECLINE_ITEM = r'\bkhong\s+(?:(?:muon|can)\s+)?(?:lay|mua|giu)\b(?!\s+(?:topping|toping|do kem)\b)'
_NUMBERED_ITEM = r'\b(?:mon|dong|ly)\s+(?:(?:so|thu)\s+)?(?:\d+|mot|hai|ba|bon|nam)\b'


def title_fragments(name):
    words = normalize_shopping(name).split()
    return [' '.join(words[start:start + size])
            for size in range(1, len(words) + 1) for start in range(len(words) - size + 1)
            if size > 1 or words[start] not in {'banh', 'mon', 'tra', 'ca', 'phe', 'nuoc'}]


def split_named_edit_clauses(message, lines):
    """Split at a cart title, preserving commas/conjunctions inside topping lists."""
    cuts = []
    for boundary in re.finditer(r'[,;]\s*|\s+(?:còn|con|và|va|rồi|roi)\s+', message, re.I):
        candidate = normalize_shopping(message[boundary.end():])
        candidate = re.sub(r'^(?:(?:con|toi|minh|cho toi|cho minh)\s+)+', '', candidate)
        if (any(re.match(re.escape(fragment) + r'\b', candidate)
                for row in lines for fragment in title_fragments(row.get('product_name')))
                and (edit_quantity(candidate) is not None
                     or re.search(_EDIT_VERB + r'|\b(?:size|topping|toping|ngot|loai sua)\b', candidate))):
            cuts.append(boundary.start())
    starts = [0] + cuts
    return [message[start:end].strip(' ,;') for start, end in zip(starts, cuts + [len(message)])]


def edit_quantity(clause):
    quantity = explicit_shopping_quantity(clause)
    if quantity is not None:
        return quantity
    # The reported "muốn 2 cáo" is a nearby-key typo for "2 cái".
    typo = re.search(r'\b(?:muon|lay|thanh|len)\s+(\d+)\s+cao\b', normalize_shopping(clause))
    return int(typo[1]) if typo else None


def edit_clauses(message, lines=()):
    text = normalize_shopping(message)
    if '?' in message or re.match(r'^(?:tai sao|vi sao|sao)\b', text):
        return []
    clauses = []
    # A new numbered target starts its own request even without an edit verb:
    # "món 1 tôi muốn topping ...", "món 3 thì 2 cái". Keep the original
    # punctuation until these boundaries are established; topping conjunctions
    # such as "hạt sen và tiramisu" stay inside the same request.
    parts = re.split(r'[,;](?=\s*(?:(?:còn|con)\s+)?(?:(?:tôi|toi|mình|minh)\s+)?(?:món|mon|dòng|dong|ly|bánh|banh|'
                     r'xóa|xoa|bỏ|bo|chỉnh|chinh|sửa|sua|đổi|doi|cập nhật|cap nhat|tăng|tang|giảm|giam)\b)'
                     r'|\s+(?:và|va|rồi|roi)\s+(?=(?:món|mon|dòng|dong|ly)\b)',
                     message, flags=re.IGNORECASE)
    parts = [clause for part in parts for clause in split_named_edit_clauses(part, lines)]
    for part in parts:
        # Keep option-list punctuation for full-list Menu validation.
        clause = ', '.join(normalize_shopping(fragment) for fragment in part.split(','))
        if re.search(r'\b(?:bao nhieu|la gi|the nao|tham khao|chi hoi)\b', clause):
            continue
        starts = list(re.finditer(_EDIT_VERB, clause))
        if starts:
            clauses.extend(clause[0 if index == 0 else match.start():
                starts[index + 1].start() if index + 1 < len(starts) else len(clause)].strip()
                for index, match in enumerate(starts)
                if not re.search(_NEGATED_EDIT + '$', clause[:match.start()]))
        elif re.search(_DECLINE_ITEM, clause):
            clauses.append(clause)
        elif ((re.search(_NUMBERED_ITEM, clause) or clause_targets(clause, lines))
              and not re.search(r'\b(?:khong|chua|dung)\s+(?:muon|can)\b', clause)
              and not re.search(r'\b(?:mua|dat)\b|\bthem\s+(?:\d+\s+)?(?:mon|banh|ly)\b', clause)
              and (edit_quantity(clause) is not None
                   or re.search(r'\b(?:size|topping|toping|luong da|ngot|loai sua)\b', clause))):
            clauses.append(clause)
    return clauses


def removal_quantity(clause):
    """A unit count after bỏ/xóa means subtract, while bỏ hết means delete line."""
    text = normalize_shopping(clause)
    if re.search(r'\b(?:het|tat ca|ca dong|ca mon)\b', text):
        return None
    match = re.search(r'\b(?:bo|xoa|go|giam)\s+(\d+|mot|hai|ba|bon|nam)\s+(?:ly|cai|phan|banh|nuoc)\b', text)
    if not match:
        return None
    amount = int(match[1]) if match[1].isdigit() else {'mot': 1, 'hai': 2, 'ba': 3, 'bon': 4, 'nam': 5}[match[1]]
    return amount if amount > 0 else None


def clause_operation(clause):
    verb = re.search(_EDIT_VERB, clause)
    if re.search(r'\b(?:bo|xoa|go)\s+(?:topping|toping|do kem)\b', clause):
        return 'update_cart_item'
    return 'remove_cart_item' if re.search(_DECLINE_ITEM, clause) or (verb and verb.group() in {'xoa', 'bo', 'go'}) else 'update_cart_item'


def clause_targets(clause, lines):
    reference = parse_selection_reference(clause, active_namespace='CART_LINE', allow_multiple=True)
    if reference.requested:
        return [row for row in lines if row.get('display_index') in reference.ordinals]
    # A unique title fragment (including "mochi") may refer to a cart item.
    # Longest match wins; variants with the same title still require an ordinal.
    matches = []
    for row in lines:
        score = max((len(fragment) for fragment in title_fragments(row.get('product_name'))
                     if re.search(r'\b' + re.escape(fragment) + r'\b', clause)), default=0)
        if score:
            matches.append((score, row))
    return [row for score, row in matches if score == max((s for s, _ in matches), default=0)]


def edit_plan(message, lines):
    plan = []
    for clause in edit_clauses(message, lines):
        tool = clause_operation(clause)
        targets = clause_targets(clause, lines)
        if len(targets) != 1:
            continue
        row = targets[0]
        fields = []
        if tool == 'update_cart_item':
            if edit_quantity(clause) is not None:
                fields.append('quantity')
            fields += [field for field, pattern in (
                ('size', r'\bsize\b'), ('toppings', r'\btopping\b'),
                ('luong_da', r'\bda\b'), ('do_ngot', r'\bngot\b'), ('loai_sua', r'\bloai sua\b'))
                if re.search(pattern, clause)]
        plan.append({'tool': tool, 'cart_item_id': str(row.get('cart_item_id') or row.get('line_id')),
                     'product_name': row.get('product_name') or 'món trong giỏ', 'clause': clause, 'fields': fields})
    return plan


def unfinished_edits(plan, logs):
    return [request for request in plan if not any(
        row['tool'] == request['tool']
        and str(row['args'].get('cart_item_id')) == request['cart_item_id']
        and row['result'].get('status') in {'ok', 'already_processed'}
        and set(request['fields']).issubset(row['result'].get('applied_state', row['args'].get('desired_state', {})))
        for row in logs)]


def pending_option_followup(message, pending, lines):
    """A choice answers only its saved cart line and explicit unresolved topping."""
    if not pending or '?' in message or edit_clauses(message, lines):
        return None
    text = normalize_shopping(message)
    if re.search(r'\b(?:khong|chua|dung|xoa|bo|gia|review|bao nhieu|la gi|mua|dat|xem)\b', text):
        return None
    line = next((row for row in lines if str(row.get('cart_item_id')) == pending.get('cart_item_id')
                 and str(row.get('product_id')) == pending.get('product_id')), None)
    if not line or any(line.get(key) != value for key, value in pending.get('line_state', {}).items()):
        return None
    chosen = []
    for unresolved, options in pending.get('choices', {}).items():
        matches = []
        for label in options:
            key = normalize_shopping(label)
            suffix = key.replace(normalize_shopping(unresolved), '', 1).strip()
            if any(re.search(r'\b' + re.escape(value) + r'\b', text) for value in [key, suffix] if value):
                matches.append(label)
        if len(matches) != 1:
            return None
        chosen.extend(matches)
    if not chosen:
        return None
    toppings = list(dict.fromkeys(pending.get('valid_values', []) + chosen))
    return {'tool': 'update_cart_item', 'cart_item_id': pending['cart_item_id'],
            'product_name': line['product_name'], 'fields': ['toppings'],
            'clause': 'mon ' + str(line['display_index']) + ' topping ' + ' va '.join(toppings)}
