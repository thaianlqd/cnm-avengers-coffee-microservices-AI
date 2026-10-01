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
    'confirm_checkout': schema('confirm_checkout', {'action_id': STRING}, ('action_id',)),
}

PURPOSES = {
    'filter_catalog': 'Discover/rank products. category is only broad drink/food/all. search_text MUST specify a narrower requested family, or empty string for the whole category. Apply only customer-requested price bounds. limit is requested count.',
    'get_product_insights': 'Read customer reviews and average ratings ONLY. Product taste, description, ingredients and policy belong to search_knowledge_base.',
    'get_product_description': 'Read approved RAG evidence for the canonical product description, taste or ingredients. Requires canonical product_id. Does not read customer reviews or price. Optional query preserves the actual knowledge question.',
    'search_knowledge_base': 'Read approved static knowledge: product taste/description/ingredients/FAQ, policies, brand and contacts. Use exact canonical entity_id for product questions. Never prices, stock, live vouchers, payment choices or order status.',
    'check_price_and_stock': 'Read CURRENT authoritative price and stock for a canonical product name and configured options.',
    'get_cart': 'Read the CURRENT authoritative cart, exact ordered line IDs, quantities and options.',
    'get_recommendations': 'Discover current canonical recommended products. No cart mutation.',
    'get_payment_options': 'Read supported current payment options and wallet eligibility.',
    'get_cart_quote': 'Read price totals only. Does not render the final checkout UI or create a confirmation action.',
    'request_checkout': 'Prepare or re-render the final order summary and canonical confirmation UI. A summary is not an order. Reuse the fresh summary for a request to view it again. Never call this again before confirming an already fresh action.',
    'confirm_checkout': 'Create the order ONLY after current explicit final agreement to the prior-turn fresh summary action. Use that exact action_id; do not request a new summary first.',
    'finish_cart': 'Customer has finished selecting/configuring items and wants to proceed. Open the mandatory voucher decision gate using current authoritative cart. Reading quote/vouchers alone does not complete this transition.',
    'update_cart_item': 'Edit one exact current cart line with an absolute patch. For ordinal references include cart_line_ordinal matching its CURRENT cart display_index. Product-list ordinals are a separate namespace. Do not edit another row because the requested row already has that value.',
    'remove_cart_item': 'Remove one exact current cart line. For ordinal references include cart_line_ordinal matching CURRENT cart display_index, not product-list rank.',
    'get_order_history': 'Read this authenticated customer\'s completed order history. Not the current draft cart or checkout summary.',
    'get_order_details': 'Read an existing completed order owned by this authenticated customer. Not the current checkout draft.',
    'track_order_status': 'Read the current service status of an existing order owned by this customer.',
    'get_user_profile': 'Read this authenticated customer\'s own profile; no preference inference or profile mutation.',
    'get_applicable_vouchers': 'Read currently eligible voucher candidates for the current cart. Does not apply a voucher or mark the cart finished.',
    'ask_branch': 'List canonical branch candidates. The customer selects a branch on a later turn; discovery does not select it.',
    'find_nearest_branch': 'Read canonical provider locations and nearby branches for the literal location. Does not commit checkout address or branch.',
    'get_top_rated_stores': 'Read branch review ratings and canonical branch candidates.',
    'get_store_reviews': 'Read customer reviews of a canonical branch.',
}


def tool_schemas():
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
    return list(schemas.values())


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
