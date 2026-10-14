"""Explicit customer clicks bound to current Menu/display state; no model inference."""
from copy import deepcopy
from src.agents.semantic_protocol import digest
from src.agents.option_state import option_field

FIELDS = {'size': 'size', 'toppings': 'toppings', 'luong_da': 'ice', 'do_ngot': 'sweetness', 'loai_sua': 'milk'}


def validate_action(value):
    if not isinstance(value, dict) or set(value) != {'type', 'snapshot', 'items'}:
        raise ValueError('invalid_ui_action')
    if value['type'] not in {'select_products', 'configure_products'}:
        raise ValueError('invalid_ui_action_type')
    if not isinstance(value['snapshot'], str) or not 1 <= len(value['snapshot']) <= 128:
        raise ValueError('invalid_ui_snapshot')
    items = value['items']
    if not isinstance(items, list) or not 1 <= len(items) <= 16:
        raise ValueError('invalid_ui_items')
    ids = set()
    for item in items:
        allowed = {'product_id', 'quantity'} if value['type'] == 'select_products' else {'product_id', 'quantity', 'options', 'use_defaults'}
        if not isinstance(item, dict) or set(item) - allowed:
            raise ValueError('invalid_ui_item')
        product_id = item.get('product_id')
        if not isinstance(product_id, str) or not 1 <= len(product_id) <= 80 or product_id in ids:
            raise ValueError('invalid_ui_product_id')
        ids.add(product_id)
        if 'quantity' in item and (type(item['quantity']) is not int or not 1 <= item['quantity'] <= 99):
            raise ValueError('invalid_ui_quantity')
        if 'use_defaults' in item and type(item['use_defaults']) is not bool:
            raise ValueError('invalid_ui_defaults')
        options = item.get('options', {})
        if not isinstance(options, dict) or set(options) - set(FIELDS.values()):
            raise ValueError('invalid_ui_options')
        for field, choice in options.items():
            values = choice if field == 'toppings' else [choice]
            if not isinstance(values, list) or len(values) > 16 or any(not isinstance(v, str) or not 1 <= len(v) <= 120 for v in values):
                raise ValueError('invalid_ui_option_value')
            if len(values) != len(set(values)):
                raise ValueError('duplicate_ui_option_value')
    return deepcopy(value)


def product_snapshot(rows):
    return digest([{'product_id': str(r['product_id']), 'display_index': r.get('display_index', i),
        'menu_bucket': r.get('menu_bucket'), 'group_display_index': r.get('group_display_index')}
        for i, r in enumerate(rows, 1)])


def configuration_payload(rows):
    items = []
    for row in rows:
        items.append({'product_id': str(row['product_id']), 'product_name': row['product_name'],
            'quantity': row.get('quantity', 1), 'selection_index': row.get('selection_index'),
            'groups': [{**deepcopy(group), 'field': FIELDS.get(option_field(group['name']))}
                for group in row.get('option_schema') or []],
            'selected_options': {FIELDS[k]: row[k] for k in FIELDS if k in row}})
    return {'snapshot': digest(items), 'items': items}


def action_envelope(action, turn):
    from src.agents.hybrid_commerce_orchestrator import clicked_reference
    from src.agents.hybrid_workflow import GroundingError
    action = validate_action(action)
    domain = 'products' if action['type'] == 'select_products' else 'pending_products'
    rows = turn.rows(domain)
    expected = product_snapshot(rows) if domain == 'products' else configuration_payload(rows)['snapshot']
    if action['snapshot'] != expected:
        raise GroundingError('ui_snapshot_stale', domain)
    by_id = {str(r['product_id']): {**r, 'display_index': r.get('display_index', i)} for i, r in enumerate(rows, 1)}
    if any(item['product_id'] not in by_id for item in action['items']):
        raise GroundingError('ui_product_not_visible', domain)
    if domain == 'products':
        return {'kind': 'commands', 'message': None, 'commands': [{'intent': 'SELECT_PRODUCTS', 'args': {
            'mode': 'EXPLICIT', 'references': [{**clicked_reference(by_id[item['product_id']], turn.product_display_snapshot),
                'quantity': item.get('quantity', 1)} for item in action['items']]}}]}
    commands = []
    # Validate ALL choices before the first write, including required Menu groups.
    for item in action['items']:
        row = by_id[item['product_id']]
        choices = item.get('options', {})
        groups = row.get('option_schema') or []
        allowed_fields = {FIELDS.get(option_field(g['name'])) for g in groups}
        if set(choices) - allowed_fields:
            raise GroundingError('ui_option_not_allowed', domain)
        for group in groups:
            field = FIELDS.get(option_field(group['name']))
            choice = choices.get(field)
            if field in choices:
                selected = choice if group.get('multiple') else [choice]
                if not isinstance(selected, list) or any(v not in group['values'] for v in selected):
                    raise GroundingError('ui_option_not_allowed', domain)
                if group.get('required') and not selected:
                    raise GroundingError('ui_required_option_missing', domain)
            elif group.get('required') and not group.get('fixed') and not item.get('use_defaults'):
                raise GroundingError('ui_required_option_missing', domain)
        commands.append({'intent': 'CONFIGURE_PRODUCT', 'args': {
            'target': {'kind': 'pending_ordinal', 'index': row.get('selection_index') or next(i for i, r in enumerate(rows, 1) if r['product_id'] == row['product_id'])},
            'options': choices, 'quantity': item.get('quantity', row.get('quantity', 1)),
            **({'use_defaults': True} if item.get('use_defaults') else {})}})
    return {'kind': 'commands', 'message': None, 'commands': commands}
