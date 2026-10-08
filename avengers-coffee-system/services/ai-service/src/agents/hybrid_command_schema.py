"""Customer meaning only. No executor, workflow, authority or prerequisite fields."""
from copy import deepcopy
import json
from src.agents.semantic_protocol import first_failure, normalize_arguments


def obj(properties=None, required=()):
    return {'type': 'object', 'properties': deepcopy(properties or {}),
        'required': list(required), 'additionalProperties': False}


def enum(*values):
    return {'type': 'string', 'enum': list(values)}


TEXT = {'type': 'string', 'minLength': 1, 'maxLength': 1000}
COUNT = {'type': 'integer', 'minimum': 1, 'maximum': 16}
QUANTITY = {'type': 'integer', 'minimum': 1, 'maximum': 999}
BOOL = {'type': 'boolean'}
AMOUNT = {'type': 'number', 'minimum': 0, 'maximum': 1000000000}
REF = obj({'kind': enum('ordinal', 'name', 'focus', 'singleton', 'id'),
    'index': {'type': 'integer', 'minimum': 1, 'maximum': 9999}, 'value': TEXT}, ('kind',))
PENDING_REF = deepcopy(REF)
PENDING_REF['properties']['kind']['enum'].append('pending_ordinal')
CART_REF = deepcopy(REF)
CART_REF['properties']['kind']['enum'].append('cart_ordinal')
ORDER_REF = deepcopy(REF)
ORDER_REF['properties']['kind']['enum'].append('last_created')
OPTIONS = obj({'size': TEXT, 'toppings': {'type': 'array', 'items': TEXT, 'maxItems': 16},
    'ice': TEXT, 'sweetness': TEXT, 'milk': TEXT})
SELECTION = deepcopy(REF)
SELECTION['properties']['quantity'] = QUANTITY


def array(item, maximum=16):
    return {'type': 'array', 'items': deepcopy(item), 'minItems': 1, 'maxItems': maximum}


CHANGE = obj({'action': enum('REMOVE', 'SET_QUANTITY', 'CONFIGURE'), 'target': CART_REF,
    'quantity': QUANTITY, 'options': OPTIONS}, ('action', 'target'))
ORDER_CHANGE = obj({'action': enum('REMOVE', 'SET_QUANTITY', 'CONFIGURE'), 'target': REF,
    'quantity': QUANTITY, 'options': OPTIONS}, ('action', 'target'))

COMMAND_ARGS = {
    'DISCOVER_PRODUCTS': obj({'scope': enum('drink', 'food', 'all'), 'query': {**TEXT, 'minLength': 0}, 'count': COUNT,
        'basis': enum('name', 'price', 'sales', 'new', 'rating'), 'direction': enum('ascending', 'descending'),
        'min_price': AMOUNT, 'max_price': AMOUNT,
        'period': enum('day', 'week', 'month', 'year', 'all'), 'period_anchor': TEXT, 'exclude_previous': BOOL}, ('scope',)),
    'RECOMMEND_PRODUCTS': obj({'scope': enum('drink', 'food', 'all'), 'concepts': array(TEXT, 4),
        'family': TEXT, 'count': COUNT, 'exclude_previous': BOOL}, ('scope', 'concepts')),
    'READ_PRODUCT_INFO': obj({'target': REF, 'facet': enum('description', 'ingredient', 'allergen', 'price', 'stock', 'options', 'reviews'),
        'query': TEXT}, ('target', 'facet')),
    'SELECT_PRODUCTS': obj({'mode': enum('ALL_VISIBLE', 'EXPLICIT'),
        'references': {**array(SELECTION), 'minItems': 0}}, ('mode',)),
    'CONFIGURE_PRODUCT': obj({'target': PENDING_REF, 'options': OPTIONS, 'quantity': QUANTITY,
        'use_defaults': BOOL, 'reset_options': BOOL}),
    'DISCARD_PENDING_PRODUCT': obj({'target': PENDING_REF}, ('target',)),
    'READ_CART': obj(),
    'EDIT_CART': obj({'changes': array(CHANGE)}, ('changes',)),
    'FINISH_CART': obj(),
    'LIST_VOUCHERS': obj(),
    'CHOOSE_VOUCHER': obj({'target': REF, 'best': BOOL}),
    'SKIP_VOUCHER': obj(),
    'REMOVE_VOUCHER': obj(),
    'SET_FULFILLMENT': obj({'mode': enum('delivery', 'pickup', 'dine_in')}, ('mode',)),
    'PROVIDE_LOCATION': obj({'value': TEXT, 'kind': enum('address', 'area', 'poi'),
        'purpose': enum('checkout', 'nearby_branches')}, ('value', 'kind')),
    'SELECT_LOCATION_CANDIDATE': obj({'target': REF}, ('target',)),
    'SELECT_PROFILE_ADDRESS': obj({'target': REF, 'replace': BOOL}, ('target',)),
    'SELECT_BRANCH': obj({'target': REF}, ('target',)),
    'LIST_PAYMENT_OPTIONS': obj(),
    'SET_PAYMENT': obj({'target': REF}, ('target',)),
    'PREPARE_CHECKOUT': obj(),
    'CONFIRM_CHECKOUT': obj(),
    'LIST_ORDERS': obj({'count': COUNT}),
    'READ_ORDER': obj({'target': ORDER_REF}, ('target',)),
    'PREPARE_ORDER_CHANGE': obj({'target': ORDER_REF, 'action': enum('CANCEL', 'UPDATE'),
        'changes': array(ORDER_CHANGE), 'note': TEXT}, ('target', 'action')),
    'CONFIRM_ORDER_CHANGE': obj(),
    'DISCARD_ORDER_CHANGE': obj(),
    'REORDER_ORDER': obj({'target': ORDER_REF}, ('target',)),
    'ASK_KNOWLEDGE': obj({'query': TEXT, 'domain': enum('faq', 'policy', 'product_description', 'company', 'branches',
        'brand', 'privacy', 'refund', 'contact', 'careers', 'franchise', 'ordering_policy', 'promotion_policy',
        'membership', 'gift_card', 'ingredient', 'product_faq'),
        'target': REF, 'facet': enum('description', 'ingredient', 'allergen')}, ('query', 'domain')),
    'READ_STORE_INFO': obj({'facet': enum('branches', 'reviews', 'hours', 'policy'), 'target': REF,
        'query': TEXT}, ('facet',)),
    'COMPARE_BRANCH_REVIEWS': obj({'targets': array(REF, 5)}, ('targets',)),
}
ENVELOPE = obj({'kind': enum('commands', 'clarification', 'social'),
    'commands': array(obj({'intent': enum(*COMMAND_ARGS), 'args': {'type': 'object'}}, ('intent', 'args')), 4),
    'message': {}}, ('kind', 'commands', 'message'))
ENVELOPE['properties']['commands']['minItems'] = 0
READ_INTENTS = frozenset({'DISCOVER_PRODUCTS', 'RECOMMEND_PRODUCTS', 'READ_PRODUCT_INFO', 'READ_CART',
    'LIST_VOUCHERS', 'LIST_PAYMENT_OPTIONS', 'LIST_ORDERS', 'READ_ORDER', 'ASK_KNOWLEDGE',
    'READ_STORE_INFO', 'COMPARE_BRANCH_REVIEWS'})
FINAL_INTENTS = frozenset({'CONFIRM_CHECKOUT', 'CONFIRM_ORDER_CHANGE'})
NORMALIZATION_AUDIT = {
    'json_object': 'Decode strict JSON; duplicate keys and nonfinite values rejected.',
    'canonical_integer': 'Canonical integer string at an explicitly integer schema field.',
    'commands_singleton': 'One command object becomes one-item commands array.',
}


def failure(code, path=''):
    return {'failure_code': code, 'failure_json_pointer': path,
        'failure_field': path.rsplit('/', 1)[-1] or None}


def validate_envelope(raw):
    """Normalize shapes only; validate all commands before commerce can start."""
    value, rules, parsed = normalize_arguments(raw, {}, 'hybrid')
    if not parsed:
        return None, failure('invalid_json'), rules
    if isinstance(value, dict) and isinstance(value.get('commands'), dict):
        value['commands'] = [value['commands']]
        rules.append('commands_singleton')
    error = first_failure(value, ENVELOPE)
    if error:
        code, path = error
        if path.endswith('/intent'):
            code = 'unknown_intent'
        return None, failure(code, path), rules
    commands = value['commands']
    if value['kind'] != 'commands':
        if commands or not isinstance(value['message'], str) or not 1 <= len(value['message']) <= 1000:
            return None, failure('noncommand_envelope_conflict', '/commands'), rules
        return value, None, list(dict.fromkeys(rules))
    if not commands or value['message'] is not None:
        return None, failure('command_envelope_conflict', '/message'), rules
    for i, command in enumerate(commands):
        intent, args = command['intent'], command['args']
        args, normalized, _ = normalize_arguments(args, COMMAND_ARGS[intent], 'hybrid')
        rules.extend(normalized)
        error = first_failure(args, COMMAND_ARGS[intent], f'/commands/{i}/args')
        if error:
            return None, failure(*error), list(dict.fromkeys(rules))
        command['args'] = args
        path = f'/commands/{i}/args'
        if intent == 'SELECT_PRODUCTS' and ((args['mode'] == 'EXPLICIT' and not args.get('references'))
                or (args['mode'] == 'ALL_VISIBLE' and args.get('references'))):
            return None, failure('selection_mode_conflict', path + '/references'), rules
        if intent == 'CONFIGURE_PRODUCT' and (not args.get('options') and not args.get('use_defaults') and 'quantity' not in args
                or args.get('reset_options') and not args.get('use_defaults')):
            return None, failure('missing_requested_choice', path + '/options'), rules
        if intent == 'CHOOSE_VOUCHER' and (bool(args.get('best')) == bool(args.get('target'))):
            return None, failure('voucher_choice_conflict', path), rules
        if intent == 'PREPARE_ORDER_CHANGE' and (args['action'] == 'UPDATE' and not args.get('changes') and not args.get('note')
                or args['action'] == 'CANCEL' and (args.get('changes') or args.get('note'))):
            return None, failure('order_change_conflict', path), rules
        for j, change in enumerate(args.get('changes', [])):
            action = change['action']
            if (action == 'SET_QUANTITY' and ('quantity' not in change or 'options' in change)
                    or action == 'CONFIGURE' and (not change.get('options') or 'quantity' in change)
                    or action == 'REMOVE' and ('options' in change or 'quantity' in change)):
                return None, failure('cart_change_shape_conflict', path + f'/changes/{j}'), rules
        # Reference conditional grammar is checked independently of key names.
        def refs(item, at):
            if isinstance(item, dict):
                if 'kind' in item and 'kind' in REF['properties'] and item.get('kind') in PENDING_REF['properties']['kind']['enum'] + ['cart_ordinal', 'last_created']:
                    kind = item['kind']
                    ordinal = kind in {'ordinal', 'pending_ordinal', 'cart_ordinal'}
                    required = 'index' if ordinal else 'value' if kind in {'name', 'id'} else None
                    if required and required not in item:
                        return failure('missing_reference_value', at + '/' + required)
                    if ('index' in item and not ordinal or 'value' in item and kind not in {'name', 'id'}):
                        return failure('invalid_reference_shape', at)
                for key, child in item.items():
                    error = refs(child, at + '/' + key)
                    if error:
                        return error
            elif isinstance(item, list):
                for j, child in enumerate(item):
                    error = refs(child, at + '/' + str(j))
                    if error:
                        return error
        error = refs(args, path)
        if error:
            return None, error, rules
    intents = [c['intent'] for c in commands]
    if any(i in FINAL_INTENTS for i in intents) and len(commands) != 1:
        return None, failure('final_confirmation_must_be_standalone', '/commands'), rules
    exclusive = {'SELECT_PRODUCTS', 'EDIT_CART', 'SET_PAYMENT', 'SET_FULFILLMENT',
        'CHOOSE_VOUCHER', 'SKIP_VOUCHER', 'REMOVE_VOUCHER', 'PROVIDE_LOCATION', 'SELECT_PROFILE_ADDRESS',
        'SELECT_LOCATION_CANDIDATE', 'PREPARE_ORDER_CHANGE', 'REORDER_ORDER'}
    if any(intents.count(i) > 1 for i in exclusive):
        return None, failure('conflicting_duplicate_command', '/commands'), rules
    if len(set(intents) & {'CHOOSE_VOUCHER', 'SKIP_VOUCHER', 'REMOVE_VOUCHER'}) > 1:
        return None, failure('conflicting_voucher_commands', '/commands'), rules
    if 'SELECT_PROFILE_ADDRESS' in intents and set(intents) & {'PROVIDE_LOCATION', 'SELECT_LOCATION_CANDIDATE'}:
        return None, failure('conflicting_location_commands', '/commands'), rules
    assert set(rules) <= NORMALIZATION_AUDIT.keys()
    return value, None, list(dict.fromkeys(rules))


def interpreter_contract():
    return json.dumps({'envelope': ENVELOPE, 'intent_args': COMMAND_ARGS}, ensure_ascii=False, separators=(',', ':'))
