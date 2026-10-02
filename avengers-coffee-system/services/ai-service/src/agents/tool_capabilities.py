"""Customer BPM capability inventory, schemas, and explicit authority boundaries."""
from copy import deepcopy
from dataclasses import dataclass
from src.function_calling.tools import ALL_TOOL_SCHEMAS, TOOL_EXECUTORS


@dataclass(frozen=True)
class Capability:
    access: str
    owner: str
    preconditions: str
    result_type: str
    stages: tuple = ('ANY',)


READS = {
    'filter_catalog': ('menu', 'products'), 'get_recommendations': ('menu', 'products'),
    'get_product_options': ('menu', 'options'), 'check_price_and_stock': ('menu/inventory', 'products'),
    'get_product_insights': ('reviews', 'reviews'), 'search_knowledge_base': ('rag', 'evidence'),
    'get_product_description': ('rag', 'evidence'),
    'get_cart': ('order', 'cart'), 'get_cart_quote': ('order', 'quote'),
    'get_applicable_vouchers': ('voucher/order', 'vouchers'), 'ask_branch': ('identity', 'branches'),
    'find_nearest_branch': ('geo/inventory', 'branches/locations'),
    'get_top_rated_stores': ('reviews', 'branches'), 'get_store_reviews': ('reviews', 'reviews'),
    'get_user_profile': ('identity', 'profile'), 'get_order_history': ('order', 'orders'),
    'get_order_details': ('order', 'order'), 'track_order_status': ('order', 'order'),
    'get_payment_options': ('order/wallet', 'payment_options'),
}
WRITES = {
    'add_to_cart': ('order/menu', 'canonical active product; complete valid options; provider price'),
    'update_cart_item': ('order/menu', 'owned current exact line; validated absolute option/quantity patch'),
    'remove_cart_item': ('order', 'owned current exact line'),
    'apply_voucher': ('voucher/order', 'fresh eligible code; current cart'),
    'remove_voucher': ('voucher/order', 'authenticated current cart'),
    'skip_voucher': ('voucher/order', 'authenticated nonempty cart; explicit customer decision'),
    'finish_cart': ('order', 'nonempty authoritative cart; no unfinished selected products'),
    'discard_pending_product': ('order/draft', 'exact canonical staged product; no committed cart mutation'),
    'set_session_branch': ('identity/inventory', 'current candidate; verified compatibility; customer choice'),
    'set_checkout_choices': ('order', 'supported fulfillment/payment; invalidate dependent summary'),
    'resolve_location': ('geo', 'literal address/area; canonical provider resolution'),
    'select_location_candidate': ('geo/order', 'current provider candidate; immutable coordinates/address'),
    'request_checkout': ('order', 'fresh cart; voucher decided; choices/address/branch complete'),
    'confirm_checkout': ('order', 'prior fresh action; current explicit final confirmation; same fingerprint'),
}
CAPABILITIES = {name: Capability('READ', owner, 'server-owned session; validated schema', result)
                for name, (owner, result) in READS.items()}
CAPABILITIES.update({name: Capability('FINAL_WRITE' if name == 'confirm_checkout' else 'WRITE',
    owner, preconditions, 'business_result') for name, (owner, preconditions) in WRITES.items()})
# Audit every old executor, including deliberately unexposed capabilities.
EXCLUDED = {'get_user_preferences': 'long-term preference inference is outside this session BPM',
            'cancel_order': 'completed-order destructive management is outside ordering migration',
            'update_order': 'completed-order rewriting is outside ordering migration'}
TOOL_AUDIT = {name: CAPABILITIES.get(name) or EXCLUDED.get(name, 'not exposed; default deny')
              for name in TOOL_EXECUTORS}


def schema(name, properties=None, required=(), description=None):
    return {'type': 'function', 'function': {'name': name,
        'description': description or CAPABILITIES[name].preconditions,
        'parameters': {'type': 'object', 'properties': properties or {},
                       'required': list(required), 'additionalProperties': False}}}


STRING = {'type': 'string'}
OPTION_PROPERTIES = {key: STRING for key in ('size', 'luong_da', 'do_ngot', 'loai_sua')}
OPTION_PROPERTIES['toppings'] = {'type': 'array', 'items': STRING, 'maxItems': 16}
CUSTOM_SCHEMAS = {
    'get_product_description': schema('get_product_description', {'product_id': STRING, 'query': STRING}, ('product_id',)),
    'add_to_cart': schema('add_to_cart', {'product_id': STRING,
        'quantity': {'type': 'integer', 'minimum': 1}, **OPTION_PROPERTIES,
        'use_defaults': {'type': 'boolean'}}, ('product_id',),
        'Add a selected canonical product. Server resolves price and validates options. Missing options stage the product. use_defaults only on customer request.'),
    'update_cart_item': schema('update_cart_item', {'cart_item_id': STRING,
        'cart_line_ordinal': {'type': 'integer', 'minimum': 1},
        'desired_state': {'type': 'object', 'properties': {'quantity': {'type': 'integer', 'minimum': 1},
            **OPTION_PROPERTIES}, 'additionalProperties': False}}, ('cart_item_id', 'desired_state')),
    'remove_cart_item': schema('remove_cart_item', {'cart_item_id': STRING,
        'cart_line_ordinal': {'type': 'integer', 'minimum': 1}}, ('cart_item_id',)),
    'get_product_options': schema('get_product_options', {'product_id': STRING}, ('product_id',), 'Read current canonical option values before choosing/configuring a product.'),
    'get_cart_quote': schema('get_cart_quote'), 'get_payment_options': schema('get_payment_options'),
    'finish_cart': schema('finish_cart'), 'skip_voucher': schema('skip_voucher'),
    'discard_pending_product': schema('discard_pending_product', {'product_id': STRING}, ('product_id',)),
    'set_checkout_choices': schema('set_checkout_choices', {
        'delivery_type': {'type': 'string', 'enum': ['GIAO_TAN_NOI', 'MANG_DI', 'TAI_CHO']},
        'payment_method': {'type': 'string', 'enum': ['VNPAY', 'NGAN_HANG_QR', 'VI_DIEN_TU', 'THANH_TOAN_KHI_NHAN_HANG']}}),
    'set_session_branch': schema('set_session_branch', {'branch_id': STRING}, ('branch_id',)),
    'resolve_location': schema('resolve_location', {'location': STRING,
        'kind': {'type': 'string', 'enum': ['area', 'address', 'poi']},
        'for_checkout': {'type': 'boolean'}}, ('location', 'kind')),
    'select_location_candidate': schema('select_location_candidate', {'candidate_id': STRING}, ('candidate_id',)),
    'request_checkout': schema('request_checkout', {'reuse_summary': {'type': 'boolean'}}),
    'confirm_checkout': schema('confirm_checkout'),
}

PURPOSES = {
    'filter_catalog': 'Discover/rank products. category is only broad drink/food/all. search_text MUST specify a narrower requested family, or empty string for the whole category. Apply only customer-requested price bounds. limit is requested count.',
    'get_product_insights': 'Read customer reviews, comments and average ratings for ONE exact concrete canonical product. Never use for category discovery, taste, description, ingredients, price or policy.',
    'get_product_description': 'Read approved RAG evidence for the canonical product description, taste or ingredients. Requires canonical product_id. Does not read customer reviews or price. Optional query preserves the actual knowledge question.',
    'search_knowledge_base': 'Read approved static knowledge: product taste/description/ingredients/FAQ, policies, brand and contacts. Use exact canonical entity_id for product questions. Never prices, stock, live vouchers, payment choices or order status.',
    'check_price_and_stock': 'Read CURRENT authoritative price and stock for a canonical product name and configured options.',
    'get_cart': 'Read the CURRENT authoritative cart, exact ordered line IDs, quantities and options.',
    'get_recommendations': 'Discover open-ended current product candidates for a family/category when the customer wants suggestions. No cart mutation, ranking guarantee or single-product facts.',
    'get_payment_options': 'Read supported current payment options and wallet eligibility.',
    'get_cart_quote': 'Read price totals only. It cannot show/re-render an order confirmation summary or canonical confirmation UI.',
    'request_checkout': 'Prepare or re-render the final order summary and canonical confirmation UI. For a request to show/review the pending order again, call this with reuse_summary=true; get_cart plus get_cart_quote is insufficient. A summary is not an order.',
    'confirm_checkout': 'Confirm the prior-turn summary after current explicit final agreement. Call with {}. The server binds and checks the prior action; never request a new summary first. A denial gives the only permitted recovery.',
    'finish_cart': 'Customer has finished selecting/configuring items and wants to proceed. Open the mandatory voucher decision gate using current authoritative cart. Reading quote/vouchers alone does not complete this transition.',
    'update_cart_item': 'Edit one exact current cart line with an absolute patch. For ordinal references include cart_line_ordinal matching its CURRENT cart display_index. Product-list ordinals are a separate namespace. Do not edit another row because the requested row already has that value.',
    'remove_cart_item': 'Remove one exact current cart line. For ordinal references include cart_line_ordinal matching CURRENT cart display_index, not product-list rank.',
    'get_order_history': 'Read this authenticated customer\'s completed order history. Not the current draft cart or checkout summary.',
    'get_order_details': 'Read an existing completed order owned by this authenticated customer. Not the current checkout draft.',
    'track_order_status': 'Read the current service status of an existing order owned by this customer.',
    'get_user_profile': 'Read saved addresses for this authenticated customer when checkout needs a location. For a saved-address reference, read first and pass the actual full_address to resolve_location. Pickup/dine-in addresses are search origins only; customer chooses a branch later.',
    'get_applicable_vouchers': 'Read currently eligible voucher candidates for the current cart. Does not apply a voucher or mark the cart finished.',
    'ask_branch': 'List canonical branch candidates. The customer selects a branch on a later turn; discovery does not select it.',
    'find_nearest_branch': 'Read canonical provider locations and nearby branches for the literal location. Does not commit checkout address or branch.',
    'get_top_rated_stores': 'Read branch review ratings and canonical branch candidates.',
    'get_store_reviews': 'Read customer reviews of a canonical branch.',
}


def capabilities_for_context(context, *, entry_action=None, final_only=False, repair_tool=None,
                             confirmation_recovery=None):
    """One state-only exposure policy; never interpret customer language here.

    Discovery reads remain interruptible. A discovery result can unlock more
    canonical-entity capabilities on the next inference round.
    """
    if final_only:
        return frozenset()
    state = context['business']
    checkout, visible = state.get('checkout') or {}, context.get('visible') or {}
    pending = state.get('pending') or {}
    stage = checkout.get('flow_stage') or 'BROWSING'
    cart_state = state.get('cart') or {}
    cart = bool(cart_state.get('items'))
    staged = state.get('pending_products') or []
    product_rows = [*(visible.get('products') or []), *staged,
                    *(cart_state.get('items') or []),
                    (context.get('focus') or {}).get('product') or {}]
    product_context = bool(context.get('selected_product_id') or any(
        row.get('product_id') or row.get('ma_san_pham') for row in product_rows))
    mutable = bool(state.get('authenticated') and not checkout.get('checkout_submission'))
    voucher_gate = bool(stage == 'VOUCHER' or pending.get('type') == 'select_voucher'
        or checkout.get('voucher_offer_pending') or checkout.get('voucher_revalidation_required'))
    voucher_decided = bool(checkout.get('voucher_decided')
        and not checkout.get('voucher_revalidation_required'))
    checkout_started = bool(voucher_decided or checkout.get('checkout_requested')
        or checkout.get('delivery_type') or checkout.get('payment_method'))

    # Secondary profile/completed-order/branch-review capabilities remain in
    # CAPABILITIES and tool_schemas(), outside the default ordering surface.
    allowed = {'filter_catalog', 'get_recommendations', 'search_knowledge_base', 'get_cart'}
    if product_context:
        allowed.update({'get_product_options', 'get_product_insights', 'check_price_and_stock'})
        # During cart/checkout consultation, search_knowledge_base already
        # serves approved product taste/description/ingredient evidence.
        if not cart or staged:
            allowed.add('get_product_description')
    # Resolve handles both read-only location consultation and explicit draft
    # checkout locations for authenticated users. Avoid publishing both geo
    # adapters throughout cart checkout; guests keep the read-only adapter.
    if not cart or not mutable:
        allowed.add('find_nearest_branch')
    if cart:
        allowed.add('get_cart_quote')
        if voucher_gate or voucher_decided:
            allowed.add('get_applicable_vouchers')
        if checkout_started:
            allowed.add('get_payment_options')
    pickup = checkout.get('delivery_type') in {'MANG_DI', 'TAI_CHO'}
    if cart and pickup:
        allowed.add('ask_branch')
    delivery = checkout.get('delivery_type') == 'GIAO_TAN_NOI'
    if (mutable and cart and state.get('cart_verified') and (
            (pickup and not cart_state.get('branch_id')) or (delivery and (
                not checkout.get('delivery_address') or not checkout.get('address_confirmed'))))):
        allowed.add('get_user_profile')
    if mutable:
        allowed.add('resolve_location')  # Canonical location consultation too.
        if visible.get('location_candidates'):
            allowed.add('select_location_candidate')
        if state.get('cart_verified'):
            if product_context:
                allowed.add('add_to_cart')  # Changes of mind stay legal in every draft stage.
            if staged:
                allowed.add('discard_pending_product')
            if cart:
                allowed.update({'update_cart_item', 'remove_cart_item', 'set_checkout_choices'})
                unfinished = bool(staged or checkout.get('pending_product_reference'))
                if not unfinished and (
                        stage not in {'VOUCHER', 'CART_READY', 'PAYMENT', 'SUMMARY'}
                        or checkout.get('voucher_revalidation_required')):
                    allowed.add('finish_cart')
                if voucher_gate:
                    allowed.add('skip_voucher')
                # Keep a later voucher change reachable by reading canonical
                # eligible candidates; the handler still rechecks eligibility.
                if (voucher_gate or voucher_decided) and visible.get('vouchers'):
                    allowed.add('apply_voucher')
                if checkout.get('voucher_code'):
                    allowed.add('remove_voucher')
                if visible.get('branches') and pickup:
                    allowed.add('set_session_branch')
                delivery = checkout.get('delivery_type') == 'GIAO_TAN_NOI'
                location_ready = bool(cart_state.get('branch_id') and (pickup or (
                    delivery and checkout.get('delivery_address') and checkout.get('address_confirmed'))))
                if (voucher_decided and not unfinished and location_ready
                        and checkout.get('payment_method')):
                    allowed.add('request_checkout')
    # Exposure permits a proposal, never authorizes the final write. Stale
    # prior actions must reach the gateway's structured denial/recovery gate.
    if mutable and cart and state.get('cart_verified') and entry_action:
        allowed.add('confirm_checkout')
    if confirmation_recovery is not None:
        return frozenset({confirmation_recovery} & allowed)
    if repair_tool:
        allowed = {name for name in allowed if CAPABILITIES[name].access == 'READ' or name == repair_tool}
    return frozenset(allowed)


def tool_schemas(allowed=None):
    schemas = {}
    for original in ALL_TOOL_SCHEMAS:
        name = original['function']['name']
        if name not in CAPABILITIES or name in CUSTOM_SCHEMAS:
            continue
        row = deepcopy(original)
        row['function']['description'] = PURPOSES.get(name, original['function'].get('description', '')[:350])
        params = row['function']['parameters']
        params['additionalProperties'] = False
        # Profile/recommendation actors and location coordinates are server-owned.
        for key in ('user_id', 'session_id', 'target_branches', 'resolved_location', 'customer_selected'):
            params.get('properties', {}).pop(key, None)
        for prop in params.get('properties', {}).values():
            prop.pop('description', None)
        if name == 'filter_catalog':
            params['required'] = ['search_text']
            params['properties']['search_text']['description'] = 'Narrower requested product family/name; empty string for unrestricted category.'
        if name == 'search_knowledge_base':
            from src.rag.documents import STATIC_DOMAINS, SLOW_DOMAINS
            params['properties']['domain']['enum'] = sorted(STATIC_DOMAINS | SLOW_DOMAINS)
            params['properties']['domain']['description'] = 'Optional approved domain; omit when uncertain so knowledge authority can resolve it. membership is membership policy; product_description is taste/description.'
        schemas[name] = row
    schemas.update(CUSTOM_SCHEMAS)
    for name, description in PURPOSES.items():
        if name in schemas:
            schemas[name]['function']['description'] = description
    return [row for name, row in schemas.items() if allowed is None or name in allowed]


def validate_args(value, spec):
    """Small JSON-schema subset used by these capabilities, with default deny."""
    kind = spec.get('type')
    valid = {'object': isinstance(value, dict), 'array': isinstance(value, list),
        'string': isinstance(value, str), 'integer': type(value) is int,
        'number': type(value) in (int, float), 'boolean': type(value) is bool}.get(kind, True)
    if not valid or ('enum' in spec and value not in spec['enum']):
        return False
    if kind == 'object':
        props = spec.get('properties', {})
        if any(key not in value for key in spec.get('required', [])):
            return False
        if spec.get('additionalProperties') is False and set(value) - set(props):
            return False
        return all(validate_args(v, props[k]) for k, v in value.items() if k in props)
    if kind == 'array':
        return len(value) <= spec.get('maxItems', 16) and all(validate_args(v, spec.get('items', {})) for v in value)
    if kind == 'string':
        return len(value) <= 2000
    if kind in {'number', 'integer'}:
        import math
        return math.isfinite(value) and spec.get('minimum', -float('inf')) <= value <= spec.get('maximum', float('inf'))
    return True
