"""Resolve literal customer choices using server snapshots and guarded tools.

Open-ended interpretation stays with the model. These controls only bind an
explicit menu/product/map reference or an answer to a staged option question.
"""
import json
import re

from src.agents.selection_language import parse_selection_reference, product_reference_category
from src.agents.shopping_language import interpret_shopping, normalize_shopping, shopping_quantity
from src.agents.product_display import product_bucket
from src.agents.option_state import literal_option_choices, requests_custom_options
from src.agents.customer_flow_presentation import options_prompt
from src.agents.product_option_scope import option_answer, option_question


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
        ordinal = row.get('selection_index') or index
        blocks.append(f"**Món đang chọn {ordinal}: {row['product_name']} ×{row.get('quantity', 1)}**\n" +
            options_prompt({'product': row, 'option_groups': row['option_schema']}))
    return '\n\n'.join(blocks) + ('\n\nBạn có thể ghi tùy chọn riêng sau **số hoặc tên của từng món** trong cùng một tin nhắn; các món trên vẫn đang chờ, chưa vào giỏ.' if len(products) > 1 else '')


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


def resolve_branch_choice(message: str, branches: list):
    if not branches or not message:
        return None, False
    text = normalize_shopping(message)
    info_pattern = (r'\b(?:co\s+(?:cho\s+(?:de|dau)\s+xe|giu\s+xe|wifi|may\s+lanh|o\s+cam)|'
                    r'mo\s+cua|dong\s+cua|may\s+gio|may\s+sao|danh\s+gia|review|sdt|so\s+dien\s+thoai)\b|\b(?:khong|ko)\s*[?]?$')
    if re.search(info_pattern, text):
        return None, False

    word_to_num = {
        'mot': 1, 'hai': 2, 'ba': 3, 'bon': 4, 'nam': 5,
        'sau': 6, 'bay': 7, 'tam': 8, 'chin': 9, 'muoi': 10,
        'dau tien': 1, 'thu nhat': 1, 'thu hai': 2, 'thu ba': 3,
        'thu tu': 4, 'thu nam': 5
    }

    ordinal = None
    m = re.search(r'\b(?:quan|chi\s*nhanh|dia\s*chi|cua\s*hang)\s*(?:so\s*)?(\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi|dau\s*tien|thu\s*(?:nhat|hai|ba|tu|nam))\b', text)
    if not m:
        m = re.search(r'\b(?:chon|lay\s+o|lay\s+tai|den|ghe)\s+(?:so\s*|quan\s*|chi\s*nhanh\s*|dia\s*chi\s*|cua\s*hang\s*)?(\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi|dau\s*tien|thu\s*(?:nhat|hai|ba|tu|nam))\b', text)
    if not m:
        m = re.search(r'^\s*(?:so\s*)?(\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi|dau\s*tien|thu\s*(?:nhat|hai|ba|tu|nam))\s*(?:di|nhe|nha|a|oi)?\s*$', text)
    if not m:
        m = re.search(r'\bso\s+(\d+|mot|hai|ba|bon|nam|sau|bay|tam|chin|muoi)\b', text)

    if m:
        val = m.group(1).strip()
        val = re.sub(r'\s+', ' ', val)
        ordinal = int(val) if val.isdigit() else word_to_num.get(val)

    if ordinal is not None:
        matched = next((b for b in branches if int(b.get('display_index') or 0) == ordinal), None)
        if not matched and 1 <= ordinal <= len(branches):
            matched = branches[ordinal - 1]
        if matched:
            return matched, False
        return None, True

    for branch in branches:
        bname = normalize_shopping(branch.get('branch_name') or branch.get('ten_chi_nhanh') or '')
        baddr = normalize_shopping(branch.get('address') or branch.get('dia_chi') or '')
        if bname and len(bname) > 3 and bname in text:
            return branch, False
        street_m = re.search(r'(\d+[a-z]?\s+[a-z0-9\s]+?)(?:,|phuong|quan|tp|$)', baddr)
        if street_m:
            street = street_m.group(1).strip()
            if len(street) > 5 and street in text:
                return branch, False

    return None, False


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
        cat_ref = parse_selection_reference(message, active_namespace='MENU_CATEGORY', allow_multiple=True)
        selected_categories = []
        if cat_ref.requested and cat_ref.namespace in {None, 'MENU_CATEGORY'} and cat_ref.operation_semantics not in {'INFO_REFERENCE', 'NEGATE_REFERENCE', 'MUTATE_REFERENCE'}:
            selected_categories = [row for row in categories if row['display_index'] in cat_ref.ordinals]
        if not selected_categories:
            matches = [row for row in categories if normalize_shopping(row['category_name']) == re.sub(
                r'^(?:cho toi xem|cho minh xem|xem|chon|danh muc)\s+', '', text).strip()]
            if len(matches) == 1:
                selected_categories = matches
        if selected_categories:
            for cat in selected_categories:
                gateway.dispatch('filter_catalog', {'category': cat['menu_bucket'],
                    'category_id': str(cat['category_id']), 'search_text': '', 'limit': 16})
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
    branches = visible.get('branches') or []
    if branches:
        branch_choice, is_invalid_ordinal = resolve_branch_choice(message, branches)
        if is_invalid_ordinal:
            return envelope('Bạn chọn số chi nhánh có trong danh sách vừa hiển thị nhé.')
        if branch_choice:
            bid = str(branch_choice.get('branch_id') or branch_choice.get('ma_chi_nhanh'))
            checkout = business.get('checkout') or {}
            existing_deliv = checkout.get('delivery_type')
            is_takeaway = bool(re.search(r'\b(?:mang\s*(?:ve|di)|take\s*away|lay\s+(?:tai|o|ve|hang)|den\s+lay|toi\s+lay|tu\s+(?:den\s+)?lay|ghe\s+lay)\b', text))
            is_dine_in = bool(re.search(r'\b(?:uong|dung|an|ngoi)\s+(?:tai|o)\s+(?:quan|cho|day|tiem)\b', text) or re.search(r'\b(?:tai|o)\s+cho\b|\bngoi\s+lai\b|\bo\s+lai\s+quan\b', text))
            deliv_type = None
            if is_takeaway and not is_dine_in:
                deliv_type = 'MANG_DI'
            elif is_dine_in and not is_takeaway:
                deliv_type = 'TAI_CHO'
            elif existing_deliv in {'MANG_DI', 'TAI_CHO'}:
                deliv_type = existing_deliv
            from src.common import cart_manager
            if deliv_type:
                cart_manager.set_checkout_context(gateway.session_id, delivery_type=deliv_type)
            gateway.dispatch('set_session_branch', {'branch_id': bid})
            return {'reply': None, 'error': None}
    # Explicit fulfillment choice without choosing branch or catalog items
    is_takeaway = bool(re.search(r'\b(?:mang\s*(?:ve|di)|take\s*away|lay\s+(?:tai|o|ve|hang)|den\s+lay|toi\s+lay|tu\s+(?:den\s+)?lay|ghe\s+lay)\b', text))
    is_dine_in = bool(re.search(r'\b(?:uong|dung|an|ngoi)\s+(?:tai|o)\s+(?:quan|cho|day|tiem)\b', text) or re.search(r'\b(?:tai|o)\s+cho\b|\bngoi\s+lai\b|\bo\s+lai\s+quan\b', text))
    if (is_takeaway ^ is_dine_in) and not re.search(r'\b(?:xem|menu|thuc don|chi tiet|gia|mon|banh|nuoc|topping|size|huy|sua)\b', text):
        chosen_type = 'MANG_DI' if is_takeaway else 'TAI_CHO'
        from src.common import cart_manager
        cart_manager.set_checkout_context(gateway.session_id, delivery_type=chosen_type)
        cart_items = (business.get('cart') or {}).get('items') or []
        branch_name = (business.get('cart') or {}).get('branch_name') or ''
        type_name = 'đến lấy tại quán (mang đi)' if chosen_type == 'MANG_DI' else 'dùng tại chỗ'
        at_branch = f' tại **{branch_name}**' if branch_name else ''
        if not cart_items:
            return envelope(f"Dạ, mình đã ghi nhận hình thức **{type_name}**{at_branch} cho bạn rồi nhé!\n\nBạn muốn xem menu món nước hay bánh của quán để chọn món ạ?")
        gateway.dispatch('set_checkout_choices', {'delivery_type': chosen_type})
        return {'reply': None, 'error': None}
    checkout = business.get('checkout') or {}
    if checkout.get('delivery_type') == 'GIAO_TAN_NOI' and checkout.get('checkout_requested') and not business.get('pending_products'):
        offer = checkout.get('profile_location_offer')
        if offer:
            offered_addresses = offer.get('addresses') or ([{'full_address': offer['address']}] if offer.get('address') else [])
            from src.agents.order_flow_graph import _profile_address_choice
            from src.agents.customer_choice_authority import profile_location_decision
            choice = _profile_address_choice(message, offered_addresses)
            if choice and choice.get('address'):
                gateway.dispatch('resolve_location', {'location': choice['address'], 'kind': 'address', 'for_checkout': True})
                return {'reply': None, 'error': None}
            if choice and choice.get('other'):
                from src.common import cart_manager
                cart_manager.set_checkout_context(gateway.session_id, profile_location_offer=None, suggested_address=None)
                return envelope('Dạ, bạn cho mình địa chỉ hoặc khu vực cụ thể để tiếp tục nhé.')
            if len(offered_addresses) == 1 and profile_location_decision(message) == 'YES':
                gateway.dispatch('resolve_location', {'location': offered_addresses[0]['full_address'], 'kind': 'address', 'for_checkout': True})
                return {'reply': None, 'error': None}
            if len(offered_addresses) == 1 and profile_location_decision(message) == 'NO':
                from src.common import cart_manager
                cart_manager.set_checkout_context(gateway.session_id, profile_location_offer=None, suggested_address=None)
                return envelope('Dạ, bạn cho mình địa chỉ hoặc khu vực khác để tiếp tục nhé.')
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
    if pending and not option_question(message) and not re.search(r'\b(?:xem|gia|review|chi tiet|mo ta|thanh toan|xoa|bo mon|huy)\b', text):
        scopes = gateway.product_option_scopes
        actionable = [(row, gateway.option_message_for(str(row['product_id']))) for row in pending
            if option_answer(gateway.option_message_for(str(row['product_id'])), row.get('option_schema') or [])]
        if scopes.ambiguous and option_answer(message):
            return envelope('Bạn ghi tùy chọn riêng sau **số hoặc tên của từng món** giúp mình nhé.\n\n' + pending_prompt(pending))
        if actionable:
            prepared, errors = [], []
            # Validate the entire batch before the first cart write. One missing
            # size or invalid topping cannot silently consume another request.
            for row, clause in actionable:
                product_id = str(row['product_id'])
                error = gateway._add_selection_error(product_id)
                if not error and requests_custom_options(clause):
                    error = {'message': options_prompt({'product': row, 'option_groups': row['option_schema']})}
                if not error:
                    configured, error = gateway._configured_product(product_id,
                        literal_option_choices(clause, row.get('option_schema') or []), quantity=int(row.get('quantity', 1)))
                    if not error:
                        prepared.append((row, configured))
                if error:
                    errors.append(f"**{row['product_name']}**: " + (error.get('message') or 'Bạn chọn các tùy chọn còn thiếu nhé.'))
            if errors:
                for row, configured in prepared:
                    gateway._save_pending_product({**row, **configured})
                remaining = gateway.context['business'].get('pending_products') or []
                return envelope('Mình chưa thêm các món trong lượt này vào giỏ.\n\n' + '\n\n'.join(errors) + '\n\n' + pending_prompt(remaining))
            for row, configured in prepared:
                result = gateway.dispatch('add_to_cart', {'product_id': str(row['product_id']),
                    'quantity': int(configured['quantity']),
                    **{field: configured[field] for field in ('size', 'toppings', 'luong_da', 'do_ngot', 'loai_sua') if field in configured}})
                if result.get('status') not in {'ok', 'already_processed'}:
                    break
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
        next_selection_index = max((int(row.get('selection_index') or index)
            for index, row in enumerate(pending, 1)), default=0) + 1
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
            product['selection_index'] = product.get('selection_index') or next_selection_index + index
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
            prompt = pending_prompt(staged)
            staged_ids = {str(item['product_id']) for item in staged}
            directly_added = [row for row in selected if str(row['product_id']) not in staged_ids]
            if directly_added:
                added_names = ', '.join(f"**{row['product_name']} ×{row.get('quantity', 1)}**" for row in directly_added)
                prefix = f"Dạ, mình đã thêm {added_names} vào giỏ hàng của bạn rồi ạ.\n\nCòn với các món đang chọn, bạn chọn giúp mình tùy chọn nhé:\n\n"
                prompt = prefix + prompt
            gateway.artifacts.pending_selection_reply = prompt
        return {'reply': None, 'error': None}
    return None
