"""Untrusted model evidence -> server-owned identities, without language NLU.

This protocol rides in the existing agent tool response. The business tools and
their policy checks remain the executors; no classifier/provider call lives here.
"""
from copy import deepcopy
import re

COMMITMENTS = ('SELECTED', 'AFFIRMED', 'REJECTED', 'NEGATED', 'QUESTION',
               'HYPOTHETICAL', 'CONDITIONAL', 'CORRECTION', 'UNKNOWN')
REFERENCE_KINDS = ('id', 'name', 'literal', 'ordinal', 'focus', 'pending', 'singleton', 'recent', 'best')
NAMESPACES = {
    'LOCATION': (None, ('location',), ('location',)),
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
    'set_payment_choice': ('PAYMENT', 'payment_method'),
    'set_fulfillment_choice': ('FULFILLMENT', 'delivery_type'),
}


def _merge_parameter(left, right):
    """Union shapes for provider generation; the selected tool validates legality."""
    result = deepcopy(left)
    result.pop('description', None)
    if left.get('type') != right.get('type'):
        raise ValueError('incompatible business parameter types')
    if 'enum' in left and 'enum' in right:
        result['enum'] = list(dict.fromkeys([*left['enum'], *right['enum']]))
    else:
        result.pop('enum', None)
    for bound, combine in [('minimum', min), ('maximum', max), ('minItems', min), ('maxItems', max)]:
        if bound in left and bound in right:
            result[bound] = combine(left[bound], right[bound])
        else:
            result.pop(bound, None)
    if left.get('type') == 'object':
        props = result.setdefault('properties', {})
        for key, spec in right.get('properties', {}).items():
            props[key] = _merge_parameter(props[key], spec) if key in props else deepcopy(spec)
        result['required'] = sorted(set(left.get('required', [])) & set(right.get('required', [])))
    elif left.get('type') == 'array':
        result['items'] = _merge_parameter(left['items'], right['items'])
    return result


OPTION_ALIASES = {'kich_co': 'size', 'ice': 'luong_da', 'sugar': 'do_ngot', 'milk': 'loai_sua'}


def canonical_option_arguments(tool, args):
    """Normalize declared wire aliases once; never interpret option values."""
    args = deepcopy(args)
    sets = ([args] if tool == 'add_to_cart' else [args.get('desired_state')] if tool == 'update_cart_item'
            else [*(args.get('changes') or []), *(args.get('add_items') or [])] if tool == 'update_order' else [])
    for options in sets:
        if not isinstance(options, dict):
            continue
        for alias, canonical in OPTION_ALIASES.items():
            if alias in options:
                if canonical in options and options[canonical] != options[alias]:
                    return None, model_repair('option_attribute_conflict', field=canonical,
                        repair_hint='Supply one consistent value per option field.')
                options[canonical] = options.pop(alias)
    return args, None


def model_repair(code, **details):
    return {'status': code, 'changed': False, 'recovery_kind': 'model_repair',
        'message': 'Mình chưa thực hiện phần yêu cầu này; hệ thống đang kiểm tra lại đề xuất.', **details}


def canonical_recommendation_arguments(args):
    """Normalize explicitly supplied model fields, never parse customer language."""
    args = deepcopy(args)
    if not isinstance(args, dict):
        return args, None
    query = args.get('preference_query')
    has_need = isinstance(query, str) and bool(query.strip())
    if has_need and not args.get('criteria'):
        args['criteria'] = 'preferences'
    if has_need and args.get('criteria') != 'preferences':
        return args, model_repair('recommendation_basis_conflict',
            repair_hint='preference_query explicitly declares description-based suitability. '
            'Keep this need with criteria=preferences; do not substitute sales/price/rating.')
    if args.get('criteria') == 'preferences':
        from src.rag.documents import normalize_text
        search = args.get('search_text')
        concepts = args.get('preference_concepts')
        # The model already labeled this exact value as a description concept.
        # Do not ALSO turn it into a literal product-name filter. A distinct
        # family filter remains untouched.
        if isinstance(search, str) and search.strip() and isinstance(concepts, list):
            if normalize_text(search) in {normalize_text(c) for c in concepts if isinstance(c, str) and c.strip()}:
                args['search_text'] = ''
    return args, None


def provider_parameters(spec):
    """Canonical vocabulary for generation; legacy aliases remain server-only."""
    spec = deepcopy(spec)
    if spec.get('type') == 'object':
        props = spec.get('properties', {})
        for alias, canonical in OPTION_ALIASES.items():
            if canonical in props:
                props.pop(alias, None)
        if 'criteria' in props and 'hot' in props['criteria'].get('enum', []):
            props['criteria']['enum'] = [value for value in props['criteria']['enum'] if value != 'hot']
        props.pop('use_defaults', None)
        spec['properties'] = {key: provider_parameters(value) for key, value in props.items()}
        if 'required' in spec:
            spec['required'] = [key for key in spec['required'] if key in props]
    elif spec.get('type') == 'array':
        spec['items'] = provider_parameters(spec['items'])
    return spec


CONTROL_HINTS = {
    'get_menu_categories': 'Generic menu request reads categories with args={}; no product selection or preference search. Newest request replaces prior discovery goals.',
    'filter_catalog': 'Use for requested product names/families and category browsing; omitted search_text means unrestricted category. SELECTED purchases require canonical options after a unique match. Never search descriptions for a named purchase.',
    'get_recommendations': 'Use criteria=preferences with preference_query and preference_concepts for suitability. Named purchases use filter_catalog, not description mentions; changing the request replaces prior preferences. search_text restricts product family ONLY; never repeat a taste concept there. Preserve the need when repairing; never replace this operation with name search or sales.',
    'get_cart': 'QUESTION reads committed cart plus separate pending selections; never completes CONFIGURE/DEFAULTS. For a pending option/default instruction use add_to_cart, not this read. Empty cart never cancels pending selection.',
    'get_product_options': 'SELECTED stages only: return required choices to customer. QUESTION inspects.',
    'add_to_cart': 'option_intent SELECT stages unresolved choices; CONFIGURE uses provided values; DEFAULTS needs defaults_evidence. No implicit defaults.',
    'update_cart_item': 'desired_state patches one exact owned line; other lines/options remain.',
    'set_fulfillment_choice': 'facet=fulfillment. Record ONLY explicitly committed fulfillment; supplied_location=true suppresses a saved-address offer. Never payment.',
    'set_payment_choice': 'facet=payment. Requires canonical PAYMENT reference and exact choice evidence. Named reference quotes the method; ordinal must answer current payment choices. Generic acknowledgment needs unique pending choice.',
    'resolve_location': 'Destination requires set_fulfillment_choice first, then for_checkout=true. New literals use LOCATION; saved choices use PROFILE_ADDRESS. Never infer payment.',
    'find_nearest_branch': 'Read-only location questions; never substitutes for recording delivery/checkout destination.',
    'finish_cart': 'Finish selection and open mandatory voucher decision; never implies skip/apply.',
    'skip_voucher': 'Explicitly decline vouchers; do not infer from generic acknowledgment.',
    'request_checkout': 'Prepare/review summary only after prerequisites; reuse_summary=true to review.',
    'confirm_checkout': 'AFFIRMED to fresh prior-turn summary only; never prepare then confirm in same turn.',
}

def customer_actions_schema(allowed, tool_rows=None, *, model_facing=False):
    from src.agents.tool_capabilities import CAPABILITIES, tool_schemas
    allowed = set(allowed)
    if model_facing:
        allowed.discard('set_checkout_choices')
    rows = tool_rows if tool_rows is not None else tool_schemas(allowed)
    properties, contracts = {}, []
    for row in rows:
        name, parameters = row['function']['name'], row['function']['parameters']
        if name not in allowed:
            continue
        if model_facing:
            parameters = provider_parameters(parameters)
        fields = parameters.get('properties', {})
        for key, spec in fields.items():
            properties[key] = _merge_parameter(properties[key], spec) if key in properties else deepcopy(spec)
        required = set(parameters.get('required', []))
        contracts.append(name + '(' + CAPABILITIES[name].access + '; ' + CAPABILITIES[name].owner + '): ' +
            ','.join(key + ('!' if key in required else '') for key in fields) +
            (' — ' + CONTROL_HINTS[name] if name in CONTROL_HINTS else ''))
    description = ('Use customer_actions only when the NEWEST customer request needs a business read, selection or change. '
        'For social conversation return final JSON with response_kind=social, reply, mutation_claims:[], evidence_quotes:[]; do not call any business tool just to greet. '
        'For business work supply {actions:[...]} with the appropriate operation on each action. No default operation. Never put tool/args at root. '
        'args is an object, not an encoded string. QUESTION reads facts; get_product_options SELECTED stages a chosen product. '
        'Writes need current evidence. ! marks required args unless reference supplies the target. '
        'A displayed list number is reference kind=ordinal with index, never an ID argument. '
        'Copy IDs only from canonical server rows; omit the target argument when reference supplies it. Tool arguments:\n' + '\n'.join(contracts))
    return {'type': 'function', 'function': {'name': 'customer_actions',
        'description': description,
        'parameters': {'type': 'object', 'additionalProperties': False,
            'required': ['actions'], 'properties': {'actions': {'type': 'array', 'minItems': 1, 'maxItems': 16,
                'items': {'type': 'object', 'additionalProperties': False, 'required': ['tool', 'commitment', 'args'] + (['evidence'] if model_facing else []),
                    'properties': {
                        'tool': {'type': 'string', 'enum': sorted(allowed), 'description': 'REQUIRED operation name on EVERY action. For configuring a pending product this is add_to_cart. Never omit this discriminator.'},
                        'commitment': {'type': 'string', 'enum': list(COMMITMENTS)},
                        'args': {'type': 'object', 'properties': properties, 'additionalProperties': False},
                        'evidence': {'type': 'string', 'description': 'Exact CURRENT customer quotation, preserving spelling/case/accents, supporting this action. Never history or paraphrase.'},
                        'option_intent': {'type': 'string', 'enum': ['SELECT', 'CONFIGURE', 'DEFAULTS'], 'description': 'For add_to_cart: SELECT chooses product only; CONFIGURE supplies options; DEFAULTS explicitly authorizes Menu defaults.'},
                        'defaults_evidence': {'type': 'string', 'description': 'Only DEFAULTS: exact current span where customer requests default configuration; product selection alone never authorizes this.'},
                        'reference': {'type': 'object', 'additionalProperties': False,
                            'description': 'Numbered choice: kind=ordinal,index=<display_index> in the target namespace. This supplies the target; omit its ID argument. kind=id/value must copy a canonical ID, never a list position.',
                            'required': ['kind'], 'properties': {
                                'kind': {'type': 'string', 'enum': list(REFERENCE_KINDS)},
                                'namespace': {'type': 'string', 'enum': list(NAMESPACES)},
                                'value': {'type': 'string'}, 'index': {'type': 'integer', 'minimum': 1},
                                'scope': {'type': 'string', 'enum': ['drink', 'food']}}},
                        'facet': {'type': 'string', 'enum': ['description', 'taste', 'ingredient', 'allergen', 'fulfillment', 'payment', 'location', 'cart', 'voucher']},
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
        'BRANCH': 'chi nhánh', 'ORDER': 'đơn hàng', 'PROFILE_ADDRESS': 'địa chỉ đã lưu', 'LOCATION': 'địa điểm',
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
        return model_repair('missing_current_evidence', repair_hint='Quote the exact current customer span for this action; do not paraphrase or use history.')
    if action['tool'] in {'set_fulfillment_choice', 'set_payment_choice'}:
        facet = 'payment' if action['tool'] == 'set_payment_choice' else 'fulfillment'
        if action.get('facet') != facet:
            return model_repair('checkout_facet_required', expected_facet=facet)
    if action['tool'] == 'add_to_cart':
        intent = action.get('option_intent')
        if intent not in {'SELECT', 'CONFIGURE', 'DEFAULTS'}:
            return model_repair('missing_option_intent', repair_hint='Distinguish product SELECT from CONFIGURE and explicitly requested DEFAULTS.')
        if intent == 'DEFAULTS':
            defaults_evidence = action.get('defaults_evidence')
            if not isinstance(defaults_evidence, str) or not defaults_evidence.strip() or defaults_evidence not in message:
                return model_repair('defaults_evidence_required', repair_hint='Defaults require a current customer request for defaults; otherwise SELECT/CONFIGURE without use_defaults.')
        elif action['args'].get('use_defaults'):
            return model_repair('defaults_not_authorized', repair_hint='Product selection is not default authorization. SELECT stages choices; CONFIGURE supplies actual values.')
        if intent == 'SELECT' and any(key in action['args'] for key in (*OPTION_ALIASES, *OPTION_ALIASES.values(), 'toppings')):
            return model_repair('option_intent_conflict', repair_hint='Option values require CONFIGURE; SELECT leaves required choices unresolved.')
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
            if not rows:
                # Older snapshots store only the ordered common list. Recover
                # group membership from canonical Menu categories, preserving
                # the displayed order and keeping group ordinals independent.
                from src.agents.product_display import product_bucket
                rows = [row for row in gateway.entry_products
                        if product_bucket(row) == reference['scope']]
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
        from src.agents.checkout_choices import PAYMENT_OPTIONS, PAYMENT_LABELS
        if reference.get('kind') in {'id', 'name'}:
            # Named supported methods are canonical even before a list is shown.
            # Ordinals and acknowledgments still require a displayed/pending owner.
            rows += [{'code': code, 'label': label} for code, label in zip(PAYMENT_OPTIONS, PAYMENT_LABELS)]
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
        from src.rag.documents import normalize_text
        rows = [row for row in rows if any(str(row.get(key, '')).casefold() == str(value).casefold()
            or namespace == 'PAYMENT' and len(normalize_text(value)) >= 3
            and (' ' + normalize_text(value) + ' ') in (' ' + normalize_text(row.get(key, '')) + ' ')
            for key in names)]
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


def identity_repair(gateway, namespace, field, reference, code):
    """Correct a model's ID representation without interpreting customer text.

    The next proposal must choose a canonical ID or a typed reference. Never
    coerce numeric IDs into ordinals: real business IDs can also be numeric.
    No candidate universe means there is nothing safe for the model to repair.
    """
    if field in {'product_name', 'product_name_query', 'location'}:
        return None
    rows = candidates(gateway, namespace, reference)
    if not rows:
        return None
    return model_repair(code, unresolved_namespace=namespace, ambiguity_count=0,
        target_field=field, candidate_count=len(rows),
        repair_hint=f'The proposed {field} is not a canonical {namespace} ID. '
            'Use the existing server candidates: a numbered choice needs reference '
            'kind=ordinal,index=<display_index>; otherwise copy an exact ID. '
            f'Omit args.{field} when the reference supplies the target. '
            'Do not guess an ID or ask the customer to repeat a choice solely because this proposal used the wrong representation.')


def ground_action(gateway, action):
    args = deepcopy(action['args'])
    if action['tool'] == 'add_to_cart' and action.get('option_intent') == 'DEFAULTS':
        args['use_defaults'] = True
    target = TOOL_TARGETS.get(action['tool'])
    reference = action.get('reference')
    if action['tool'] == 'resolve_location' and reference:
        namespace = reference.get('namespace', 'LOCATION' if reference['kind'] == 'literal' else 'PROFILE_ADDRESS')
        if namespace == 'LOCATION':
            value = reference.get('value') or args.get('location')
            if reference['kind'] not in {'literal', 'name'} or not isinstance(value, str) or not value.strip():
                return None, None, failure('unknown_reference', 'LOCATION')
            if args.get('location') and args['location'].strip().casefold() != value.strip().casefold():
                return None, None, failure('reference_conflict', 'LOCATION')
            args['location'] = value.strip()
            return args, None, None  # Geo authority still resolves this new literal.
        if namespace == 'LOCATION_CANDIDATE':
            row, error = ground_reference(gateway, namespace, reference)
            if error:
                return None, None, error
            address = row.get('display_address') or row.get('normalized_label')
            if args.get('location') and args['location'].casefold() != str(address).casefold():
                return None, None, failure('reference_conflict', namespace)
            args['location'] = address
            args.setdefault('kind', 'poi')
            return args, row, None
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
        return None, None, model_repair('invalid_reference_namespace', expected_namespace=namespace, repair_hint='Use the target namespace from this tool contract, without guessing identity.')
    if reference and (reference['kind'] == 'literal' or reference['kind'] == 'recent' and namespace != 'ORDER' or reference['kind'] == 'best' and namespace != 'VOUCHER'):
        return None, None, model_repair('invalid_reference_kind', expected_namespace=namespace, repair_hint='recent is ORDER only, best is VOUCHER only, literal is LOCATION only. Use current exact id/name/ordinal/focus/pending/singleton as applicable.')
    if not reference:
        if (action['tool'] == 'add_to_cart' and field not in args
                and action.get('option_intent') in {'CONFIGURE', 'DEFAULTS'}):
            # Meaning/commitment was validated before grounding. A target-free
            # configuration can bind only the unique selected pending product,
            # never an arbitrary visible/focused/cart product. Multiple pending
            # entities remain genuinely ambiguous and cannot share attributes.
            reference = {'namespace': 'PRODUCT', 'kind': 'pending'}
        elif field not in args:
            return args, None, None  # Existing schema returns required-fields recovery.
        else:
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
        if reference['kind'] == 'id' and error.get('status') == 'unknown_reference':
            repair = identity_repair(gateway, namespace, field, reference, 'unknown_reference')
            if repair:
                return None, None, repair
        return None, None, error
    canonical = (row.get('product_name') if field in {'product_name', 'product_name_query'} else
                 identity(row, NAMESPACES[namespace][1]))
    if namespace == 'FULFILLMENT':
        # Literal canonical business labels are identity evidence. If quoted,
        # they cannot authorize a different enum. Implicit/paraphrased meaning
        # still belongs to the model; no phrase dictionary or choice inference.
        from src.rag.documents import normalize_text
        evidence = ' ' + normalize_text(action.get('evidence')) + ' '
        named = {identity(candidate, NAMESPACES[namespace][1]) for candidate in candidates(gateway, namespace, reference)
            if candidate.get('label') and (' ' + normalize_text(candidate['label']) + ' ') in evidence}
        if named and named != {canonical}:
            return None, None, model_repair('canonical_choice_evidence_conflict', expected_namespace=namespace,
                repair_hint='Quote only the chosen canonical business label and use its matching enum; do not change the chosen method.')
    if field in args and str(args[field]).casefold() != str(canonical).casefold():
        known_ids = {identity(item, NAMESPACES[namespace][1])
                     for item in candidates(gateway, namespace, reference)}
        if str(args[field]) not in known_ids:
            repair = identity_repair(gateway, namespace, field, reference, 'reference_conflict')
            if repair:
                return None, None, repair
        return None, None, failure('reference_conflict', namespace)
    args[field] = canonical
    if namespace == 'PAYMENT' and row.get('enabled') is False:
        return None, None, {'status': 'payment_not_available', 'message': row.get('reason') or 'Phương thức thanh toán này chưa khả dụng. Bạn chọn phương thức khác nhé.', 'recovery_kind': 'clarify'}
    if namespace == 'CART_LINE':
        ordinal = args.pop('cart_line_ordinal', None)
        if ordinal is not None and int(ordinal) != int(row.get('display_index') or gateway.entry_cart_lines.index(row) + 1):
            return None, None, model_repair('reference_conflict', target_field='cart_line_ordinal')
    if namespace == 'MENU_CATEGORY':
        args['category'] = row['menu_bucket']
    return args, row, None
