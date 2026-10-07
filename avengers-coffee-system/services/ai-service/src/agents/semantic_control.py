"""Untrusted model evidence -> server-owned identities, without language NLU.

This protocol rides in the existing agent tool response. The business tools and
their policy checks remain the executors; no classifier/provider call lives here.
"""
from copy import deepcopy
import re

COMMITMENTS = ('SELECTED', 'AFFIRMED', 'REJECTED', 'NEGATED', 'QUESTION',
               'HYPOTHETICAL', 'CONDITIONAL', 'CORRECTION', 'UNKNOWN')
REFERENCE_KINDS = ('id', 'name', 'ordinal', 'focus', 'pending', 'singleton', 'recent', 'best')
NAMESPACES = {
    'PRODUCT': ('products', ('product_id', 'ma_san_pham'), ('product_name', 'ten_san_pham')),
    'CART_LINE': (None, ('cart_item_id', 'line_id'), ('product_name',)),
    'VOUCHER': ('vouchers', ('voucher_code', 'ma_voucher'), ('ten_voucher', 'ten_chuong_trinh')),
    'BRANCH': ('branches', ('branch_id', 'ma_chi_nhanh'), ('branch_name', 'ten_chi_nhanh')),
    'LOCATION_CANDIDATE': ('location_candidates', ('candidate_id',), ('display_address', 'normalized_label')),
    'ORDER': ('orders', ('order_id', 'ma_don_hang'), ('order_id',)),
    'PROFILE_ADDRESS': (None, ('full_address',), ('label', 'full_address')),
    'MENU_CATEGORY': ('menu_categories', ('category_id',), ('category_name',)),
    'PAYMENT': ('payment_options', ('code', 'value'), ('label',)),
    'FULFILLMENT': (None, ('value',), ('label',)),
}
TOOL_TARGETS = {
    'get_product_options': ('PRODUCT', 'product_id'),
    'add_to_cart': ('PRODUCT', 'product_id'), 'discard_pending_product': ('PRODUCT', 'product_id'),
    'get_product_description': ('PRODUCT', 'product_id'),
    'get_product_insights': ('PRODUCT', 'product_name'),
    'search_knowledge_base': ('PRODUCT', 'entity_id'),
    'check_price_and_stock': ('PRODUCT', 'product_name_query'),
    'update_cart_item': ('CART_LINE', 'cart_item_id'), 'remove_cart_item': ('CART_LINE', 'cart_item_id'),
    'apply_voucher': ('VOUCHER', 'voucher_code'), 'set_session_branch': ('BRANCH', 'branch_id'),
    'get_store_reviews': ('BRANCH', 'branch_id'),
    'select_location_candidate': ('LOCATION_CANDIDATE', 'candidate_id'),
    'get_order_details': ('ORDER', 'order_id'), 'track_order_status': ('ORDER', 'order_id'),
    'cancel_order': ('ORDER', 'order_id'), 'update_order': ('ORDER', 'order_id'),
    'reorder_order': ('ORDER', 'order_id'), 'resolve_location': ('PROFILE_ADDRESS', 'location'),
    'filter_catalog': ('MENU_CATEGORY', 'category_id'),
}


def customer_actions_schema(allowed):
    return {'type': 'function', 'function': {'name': 'customer_actions',
        'description': 'Interpret this turn once. Ground and execute existing tools in dependency order. Required for writes and selecting/configuring options. No extra model call.',
        'parameters': {'type': 'object', 'additionalProperties': False,
            'required': ['actions'], 'properties': {'actions': {'type': 'array', 'minItems': 1, 'maxItems': 16,
                'items': {'type': 'object', 'additionalProperties': False, 'required': ['tool', 'commitment', 'args_json'],
                    'properties': {
                        'tool': {'type': 'string', 'enum': sorted(allowed)},
                        'commitment': {'type': 'string', 'enum': list(COMMITMENTS)},
                        'args_json': {'type': 'string', 'description': 'JSON object matching the named tool parameters; use {} for no arguments. Server validates after grounding.'},
                        'evidence': {'type': 'string', 'description': 'For writes: exact current customer span supporting THIS action, not history.'},
                        'reference': {'type': 'object', 'additionalProperties': False,
                            'required': ['kind'], 'properties': {
                                'kind': {'type': 'string', 'enum': list(REFERENCE_KINDS)},
                                'namespace': {'type': 'string', 'enum': list(NAMESPACES)},
                                'value': {'type': 'string'}, 'index': {'type': 'integer', 'minimum': 1},
                                'scope': {'type': 'string', 'enum': ['drink', 'food']}}},
                        'facet': {'type': 'string', 'enum': ['description', 'taste', 'ingredient', 'allergen']},
                        'exclude_previous': {'type': 'boolean'},
                        'supplied_location': {'type': 'boolean'},
                    }}}}}}}


def failure(code, namespace=None, count=0):
    messages = {
        'semantic_evidence_required': 'Mình chưa xác định được thao tác bạn muốn thực hiện. Bạn nói rõ lựa chọn hoặc thay đổi giúp mình nhé.',
        'semantic_commitment_required': 'Mình chưa thực hiện thay đổi này. Bạn muốn áp dụng lựa chọn này, hay chỉ đang hỏi thông tin ạ?',
        'ambiguous_reference': 'Có nhiều lựa chọn phù hợp. Bạn chọn tên hoặc số trong danh sách giúp mình nhé.',
        'unknown_reference': 'Mình chưa xác định được lựa chọn đó từ thông tin hiện có. Bạn chọn lại tên hoặc số trong danh sách nhé.',
        'reference_conflict': 'Tham chiếu và lựa chọn chưa khớp nhau. Bạn chỉ rõ món hoặc lựa chọn muốn áp dụng giúp mình nhé.',
    }
    labels = {'PRODUCT': 'món', 'CART_LINE': 'dòng trong giỏ', 'VOUCHER': 'mã giảm giá',
        'BRANCH': 'chi nhánh', 'ORDER': 'đơn hàng', 'PROFILE_ADDRESS': 'địa chỉ đã lưu',
        'LOCATION_CANDIDATE': 'địa điểm trên bản đồ', 'MENU_CATEGORY': 'danh mục Menu'}
    message = messages.get(code, messages['unknown_reference'])
    if namespace in labels and code in {'ambiguous_reference', 'unknown_reference', 'reference_conflict'}:
        message = f"Mình chưa xác định được đúng **{labels[namespace]}** bạn muốn chọn. Bạn cho mình tên hoặc số trong danh sách nhé."
    return {'status': code, 'message': message,
            'unresolved_namespace': namespace, 'ambiguity_count': count, 'recovery_kind': 'clarify'}


def validate_commitment(action, access, message):
    commitment = action['commitment']
    if access == 'READ':
        return None
    allowed = {'SELECTED', 'AFFIRMED', 'CORRECTION'}
    if action['tool'] in {'skip_voucher', 'remove_voucher', 'discard_order_change', 'discard_pending_product'}:
        allowed.add('REJECTED')
    if action['tool'] == 'resolve_location' and action.get('reference') and action['reference'].get('namespace', 'PROFILE_ADDRESS') == 'PROFILE_ADDRESS':
        allowed.add('REJECTED')
    if action['tool'] in {'confirm_checkout', 'confirm_order_change'}:
        allowed = {'AFFIRMED'}
    if commitment not in allowed:
        return failure('semantic_commitment_required')
    evidence = action.get('evidence')
    if not isinstance(evidence, str) or not evidence.strip() or evidence not in message:
        return failure('semantic_evidence_required')
    return None


def identity(row, fields):
    return next((str(row[field]) for field in fields if row.get(field) is not None), None)


def canonical_focus(namespace, row):
    _, fields, names = NAMESPACES[namespace]
    result = deepcopy(row)
    result[fields[0]] = identity(row, fields)
    label = identity(row, names)
    if label is not None:
        result[names[0]] = label
    return result


def candidates(gateway, namespace, reference):
    kind, fields, _ = NAMESPACES[namespace]
    state = gateway.context['business']
    if namespace == 'CART_LINE':
        rows = gateway.entry_cart_lines  # Frozen throughout compound removals/edits.
    elif namespace == 'PROFILE_ADDRESS':
        offer = gateway.entry_profile_offer or {}
        rows = list(offer.get('addresses') or ([{'full_address': offer['address']}] if offer.get('address') else []))
        rows += getattr(gateway, 'profile_address_candidates', [])
    elif namespace == 'FULFILLMENT':
        from src.agents.checkout_choices import FULFILLMENT_OPTIONS, FULFILLMENT_LABELS
        rows = [{'value': value, 'label': label} for value, label in zip(FULFILLMENT_OPTIONS, FULFILLMENT_LABELS)]
    elif namespace == 'PRODUCT':
        if reference.get('kind') == 'pending':
            rows = gateway.entry_pending_products
        elif reference.get('scope'):
            rows = gateway.entry_product_groups.get(reference['scope']) or []
        else:
            rows = list(gateway.entry_products) + list(gateway.artifacts.product_candidates.values())
            if reference.get('kind') in {'id', 'name'}:
                rows += list(gateway.entry_cart_lines)
            rows += state.get('pending_products') or []
            focus = gateway.artifacts.focus.get('product')
            if focus:
                rows.append(focus)
    else:
        rows = list(gateway.artifacts.visible.get(kind) or [])
    if namespace == 'PAYMENT':
        selected = (state.get('checkout') or {}).get('payment_method')
        from src.agents.checkout_choices import PAYMENT_OPTIONS
        if selected in PAYMENT_OPTIONS:
            rows.append({'code': selected})
    if namespace == 'ORDER':
        checkout = state.get('checkout') or {}
        for key in ('order_management_focus', 'order_management_action'):
            if checkout.get(key):
                rows.append(checkout[key])
    # Preserve display order. The same canonical entity can appear in focus,
    # pending and display; that is one candidate, not three competing identities.
    unique = {}
    for row in rows:
        key = identity(row, fields)
        if key:
            unique.setdefault(key, deepcopy(row))
    return list(unique.values())


def ground_reference(gateway, namespace, reference):
    if namespace not in NAMESPACES:
        return None, failure('unknown_reference', namespace)
    _, fields, names = NAMESPACES[namespace]
    rows = candidates(gateway, namespace, reference)
    kind, value = reference.get('kind'), reference.get('value')
    if kind == 'id':
        rows = [row for row in rows if identity(row, fields) == str(value)]
    elif kind == 'name':
        rows = [row for row in rows if any(str(row.get(key, '')).casefold() == str(value).casefold() for key in names)]
    elif kind == 'ordinal':
        field = ('selection_index' if namespace == 'PRODUCT'
                 and reference.get('scope') is None and gateway.entry_pending_products else
                 'group_display_index' if reference.get('scope') else 'display_index')
        if field == 'selection_index':
            rows = gateway.entry_pending_products
        rows = [row for index, row in enumerate(rows, 1) if int(row.get(field) or index) == reference.get('index')]
    elif kind == 'focus':
        focus_key = 'location' if namespace == 'LOCATION_CANDIDATE' else namespace.lower()
        focus = gateway.artifacts.focus.get(focus_key) or {}
        key = identity(focus, fields)
        if not key and namespace in {'PAYMENT', 'FULFILLMENT'}:
            field = 'payment_method' if namespace == 'PAYMENT' else 'delivery_type'
            key = (gateway.context['business'].get('checkout') or {}).get(field)
        rows = [row for row in rows if key and identity(row, fields) == key]
    elif kind == 'recent':
        # Recent is only defined by newest-first order authority, not arbitrary
        # sorting of UUIDs or inference from assistant prose.
        rows = rows[:1] if namespace == 'ORDER' else []
    elif kind == 'pending' and namespace == 'ORDER':
        action = gateway.entry_order_action or gateway.entry_order_focus or {}
        rows = [row for row in rows if identity(row, fields) == identity(action, fields)]
    elif kind == 'best':
        if namespace != 'VOUCHER':
            rows = []
        elif rows:
            maximum = max(float(row.get('so_tien_giam_du_kien') or 0) for row in rows)
            rows = [row for row in rows if float(row.get('so_tien_giam_du_kien') or 0) == maximum]
    elif kind not in {'singleton', 'pending'}:
        rows = []
    if len(rows) != 1:
        return None, failure('ambiguous_reference' if rows else 'unknown_reference', namespace, len(rows))
    return rows[0], None


def ground_action(gateway, action):
    args = deepcopy(action['args'])
    target = TOOL_TARGETS.get(action['tool'])
    reference = action.get('reference')
    if action['tool'] == 'set_checkout_choices' and reference:
        namespace = reference.get('namespace')
        if namespace not in {'PAYMENT', 'FULFILLMENT'}:
            return None, None, failure('reference_conflict', namespace)
        target = (namespace, 'payment_method' if namespace == 'PAYMENT' else 'delivery_type')
    if not target:
        if reference:
            return None, None, failure('reference_conflict', reference.get('namespace'))
        return args, None, None
    namespace, field = target
    if action['tool'] == 'resolve_location' and not reference:
        # Free-form literal supplied location is interpreted by the model;
        # coordinates/address validity remain with canonical geo providers.
        return args, None, None
    if reference and reference.get('namespace', namespace) != namespace:
        return None, None, failure('reference_conflict', namespace)
    if not reference:
        if field not in args:
            return args, None, None  # Existing schema returns required-fields recovery.
        reference = {'kind': 'name' if field in {'product_name', 'product_name_query'} else 'id', 'value': str(args[field])}
    row, error = ground_reference(gateway, namespace, reference)
    if error:
        # A literal UUID/code supplied by the customer is explicit structural
        # evidence; ownership/eligibility still comes from its service.
        value = str(args.get(field) or reference.get('value') or '')
        literal = (namespace == 'ORDER' and re.fullmatch(r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}', value)
                   or namespace == 'VOUCHER' and value)
        if reference['kind'] == 'id' and literal and re.search(r'(?<!\w)' + re.escape(value) + r'(?!\w)', gateway.user_message, re.I):
            args[field] = value
            return args, None, None
        # A read-only named product lookup has no mutation authority; let the
        # existing canonical catalog resolver obtain the identity first.
        if action['tool'] == 'get_product_insights' and reference['kind'] == 'name':
            return args, None, None
        return None, None, error
    canonical = (row.get('product_name') if field in {'product_name', 'product_name_query'} else
                 identity(row, NAMESPACES[namespace][1]))
    if field in args and str(args[field]).casefold() != str(canonical).casefold():
        return None, None, failure('reference_conflict', namespace)
    args[field] = canonical
    if namespace == 'PAYMENT' and row.get('enabled') is False:
        return None, None, {'status': 'payment_not_available', 'message': row.get('reason') or 'Phương thức thanh toán này chưa khả dụng. Bạn chọn phương thức khác nhé.', 'recovery_kind': 'clarify'}
    if namespace == 'CART_LINE' and reference['kind'] == 'ordinal':
        args['cart_line_ordinal'] = reference['index']
    if namespace == 'MENU_CATEGORY':
        args['category'] = row['menu_bucket']
    return args, row, None
