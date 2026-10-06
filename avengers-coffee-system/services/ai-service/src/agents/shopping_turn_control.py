"""Resolve literal customer choices using server snapshots and guarded tools.

Open-ended interpretation stays with the model. These controls only bind an
explicit menu/product/map reference or an answer to a staged option question.
"""
import json
import re

from src.agents.selection_language import parse_selection_reference, product_reference_category
from src.agents.shopping_language import interpret_shopping, normalize_shopping, shopping_quantity
from src.agents.product_display import product_bucket
from src.agents.option_state import (option_schema_from_result, literal_option_choices,
    uses_global_option_defaults, requests_custom_options)
from src.agents.customer_flow_presentation import options_prompt
from src.common import cart_manager


def envelope(reply):
    return {'reply': json.dumps({'response_kind': 'clarification', 'reply': reply,
        'mutation_claims': [], 'evidence_quotes': []}, ensure_ascii=False), 'error': None}


def product_references(gateway):
    ref = parse_selection_reference(gateway.user_message, active_namespace='PRODUCT', allow_multiple=True)
    targets = []
    invalid = ref.namespace not in {None, 'PRODUCT'}
    if ref.namespace == 'MIXED':
        invalid = any(label not in {'nuoc', 'do uong', 'thuc uong', 'banh', 'do an', 'mon', 'san pham'}
                      for label in ref.ordinal_labels)
    for position, ordinal in enumerate(ref.ordinals):
        label = ref.ordinal_labels[position] if position < len(ref.ordinal_labels) else ''
        bucket = product_reference_category(label)
        source = gateway.entry_product_groups.get(bucket) or gateway.entry_products
        rows = [row for row in source if not bucket or product_bucket(row) == bucket]
        field = 'group_display_index' if bucket else 'display_index'
        found = [row for index, row in enumerate(rows, 1) if (row.get(field) or index) == ordinal]
        if len(found) != 1:
            invalid = True
        else:
            targets.extend(found)
    return ref, targets, invalid


def pending_prompt(products):
    blocks = []
    for index, row in enumerate(products, 1):
        blocks.append(f"**Món đang chọn {index}: {row['product_name']} ×{row.get('quantity', 1)}**\n" +
            options_prompt({'product': row, 'option_groups': row['option_schema']}))
    return '\n\n'.join(blocks) + ('\n\nBạn chọn tùy chọn cho **món đang chọn 1** trước nhé; các món còn lại vẫn đang chờ, chưa vào giỏ.' if len(products) > 1 else '')


def selected_quantity(message, reference, index):
    text = normalize_shopping(message)
    # Numbers preceding a labelled ordinal are quantities; "1 Lít" is a name.
    clauses = re.split(r'\b(?:va|voi)\b', text)
    quantities = []
    for clause in clauses:
        match = re.search(r'\b(\d+)\s+(?:banh|nuoc|mon|do uong|do an)\s+(?:so|thu)\s+\d+\b', clause)
        if match:
            quantities.append(int(match[1]))
        elif re.search(r'\b(?:so|thu)\s+\d+\b', clause):
            quantities.append(shopping_quantity(clause))
    return quantities[index] if reference.requested and index < len(quantities) else shopping_quantity(message)


def customer_shopping_control(gateway):
    if gateway.shadow or gateway.existing_order_request:
        return None
    message = gateway.user_message
    text = normalize_shopping(message)
    business = gateway.context['business']
    visible = gateway.artifacts.visible
    # General menu shows actual categories, rather than five cheapest products.
    if re.fullmatch(r'(?:(?:cho|giup)\s+(?:toi|minh)\s+)?(?:(?:toi|minh)\s+)?(?:muon\s+)?'
                    r'(?:xem\s+)?(?:menu|thuc don)(?:\s+(?:chung|cua quan|quan|di|nhe|voi|a))*', text):
        gateway.dispatch('get_menu_categories', {})
        return {'reply': None, 'error': None}
    categories = visible.get('menu_categories') or []
    if categories and not business.get('pending_products'):
        cat_ref = parse_selection_reference(message, active_namespace='MENU_CATEGORY')
        category = None
        if cat_ref.requested and cat_ref.namespace in {None, 'MENU_CATEGORY'} and cat_ref.operation_semantics not in {'INFO_REFERENCE', 'NEGATE_REFERENCE', 'MUTATE_REFERENCE'}:
            category = next((row for row in categories if row['display_index'] == cat_ref.ordinals[0]), None)
        if not category:
            matches = [row for row in categories if normalize_shopping(row['category_name']) == re.sub(
                r'^(?:cho toi xem|cho minh xem|xem|chon|danh muc)\s+', '', text).strip()]
            category = matches[0] if len(matches) == 1 else None
        if category:
            gateway.dispatch('filter_catalog', {'category': category['menu_bucket'],
                'category_id': category['category_id'], 'search_text': '', 'limit': 16})
            return {'reply': None, 'error': None}
    # Map candidate ordinals always belong to the actual displayed map list.
    candidates = visible.get('location_candidates') or []
    if candidates and (business.get('pending') or {}).get('type') == 'select_location_candidate':
        ref = parse_selection_reference(message, active_namespace='LOCATION_CANDIDATE')
        if ref.requested and ref.namespace in {None, 'LOCATION_CANDIDATE'} and ref.operation_semantics not in {'INFO_REFERENCE', 'NEGATE_REFERENCE', 'MUTATE_REFERENCE'}:
            candidate = next((row for row in candidates if row.get('display_index') == ref.ordinals[0]), None)
            if not candidate:
                return envelope('Bạn chọn số địa điểm có trong danh sách vừa hiển thị nhé.')
            gateway.dispatch('select_location_candidate', {'candidate_id': candidate['candidate_id']})
            return {'reply': None, 'error': None}
    checkout = business.get('checkout') or {}
    if checkout.get('delivery_type') == 'GIAO_TAN_NOI' and checkout.get('checkout_requested') and not business.get('pending_products'):
        from src.agents.location_parser import parse_location
        location = parse_location(message)
        if location.kind in {'address', 'area', 'poi'} and location.value and not re.search(
                r'\b(?:xem|review|goi y|chi tiet|mon|banh|topping|size)\b', text):
            gateway.dispatch('resolve_location', {'location': location.value, 'kind': location.kind, 'for_checkout': True})
            return {'reply': None, 'error': None}
    ref, targets, invalid = product_references(gateway)
    interpretation = interpret_shopping(message, snapshot=gateway.entry_products,
        active_catalog=[row for rows in gateway.entry_product_groups.values() for row in rows],
        ordinal_targets=targets, ordinal_requested=ref.requested, ordinal_invalid=invalid,
        focus=gateway.entry_focus)
    # Explicit plural descriptions must retain the numbered identities and prices.
    if re.search(r'\b(?:chi tiet|mo ta)\b', text) and not re.search(r'\b(?:xoa|bo|tang|giam)\b', text):
        detail_targets = list(interpretation.targets)
        plural = re.search(r'\b(\d+)\s+mon\b', text)
        if not detail_targets and plural and int(plural[1]) == len(gateway.entry_products):
            detail_targets = gateway.entry_products
        if detail_targets:
            for row in detail_targets:
                if 'get_product_description' in gateway.schemas:
                    gateway.dispatch('get_product_description', {'product_id': str(row['product_id']), 'query': message})
                else:
                    gateway.dispatch('search_knowledge_base', {'entity_id': str(row['product_id']),
                        'entity_type': 'product', 'domain': 'product_description', 'query': row['product_name']})
            return {'reply': None, 'error': None}
    pending = business.get('pending_products') or []
    if pending and '?' not in message and not re.search(r'\b(?:xem|gia|review|chi tiet|mo ta|thanh toan|xoa|bo mon|huy)\b', text):
        named = [row for row in pending if normalize_shopping(row['product_name']) in text]
        matching = [row for row in pending if literal_option_choices(message, row.get('option_schema') or [])]
        target = named[0] if len(named) == 1 else matching[0] if len(matching) == 1 else pending[0]
        groups = target.get('option_schema') or []
        choices = literal_option_choices(message, groups)
        option_answer = bool(choices or uses_global_option_defaults(message) or requests_custom_options(message)
                             or re.search(r'\b(?:topping|it da|it ngot|khong ngot|da rieng)\b', text)
                             or text in {'ok', 'oke', 'oke dung roi', 'dung roi', 'dong y', 'khong them topping'})
        if option_answer and not (interpretation.act == 'ADD_ITEM' and interpretation.targets
                and not any(str(row['product_id']) == str(target['product_id']) for row in interpretation.targets)):
            if requests_custom_options(message):
                return envelope(pending_prompt(pending))
            result = gateway.dispatch('add_to_cart', {'product_id': str(target['product_id']),
                'quantity': int(target.get('quantity', 1)), **choices})
            if result.get('status') in {'ok', 'already_processed'}:
                remaining = gateway.context['business'].get('pending_products') or []
                if remaining:
                    from src.agents.customer_flow_presentation import customer_flow_reply
                    cart_reply = customer_flow_reply(gateway.artifacts.logs, gateway.artifacts.business) or ''
                    gateway.artifacts.pending_selection_reply = cart_reply + '\n\n' + pending_prompt(remaining)
            return {'reply': None, 'error': None}
    if interpretation.act == 'ADD_ITEM' and interpretation.quantity_valid and not re.search(r'\b(?:xoa|bo|sua|doi|tang|giam)\b', text):
        selected = list(interpretation.targets)
        if not selected:
            return None
        staged = []
        gateway.turn_selection_quantities = {str(row['product_id']): selected_quantity(message, ref, index)
                                            for index, row in enumerate(selected)}
        for index, row in enumerate(selected):
            result = gateway.dispatch('get_product_options', {'product_id': str(row['product_id'])})
            if result.get('status') not in {'ok', 'needs_options'}:
                return {'reply': None, 'error': None}
            product = next((item for item in gateway.context['business'].get('pending_products') or []
                            if str(item['product_id']) == str(row['product_id'])), None)
            if not product:
                return None  # Gateway did not authorize the selection.
            product['quantity'] = selected_quantity(message, ref, index)
            if product['quantity'] < 1:
                return envelope('Bạn chọn số lượng lớn hơn 0 giúp mình nhé.')
            gateway._save_pending_product(product)
            if product_bucket(row) == 'food' and all(not group.get('required') or group.get('fixed')
                    or len(group.get('values') or []) <= 1 for group in product['option_schema']):
                added = gateway.dispatch('add_to_cart', {'product_id': str(row['product_id']), 'quantity': product['quantity']})
                if added.get('status') not in {'ok', 'already_processed'}:
                    staged.append(product)
            else:
                staged.append(product)
        if staged:
            gateway.artifacts.pending_selection_reply = pending_prompt(staged)
        return {'reply': None, 'error': None}
    return None
