"""Server-owned browse deltas, allocation and group coverage; no language router."""
from copy import deepcopy
import json
import logging
from src.agents.product_display import product_bucket, PRODUCT_GROUP_LABELS
from src.common import cart_manager

logger = logging.getLogger(__name__)


def merge(previous, delta):
    if not previous:
        return None, 'discovery_state_required'
    state = deepcopy(previous)
    for key in delta.get('clear', []):
        state.pop(key, None)
    changed = delta.get('set') or {}
    state.update(deepcopy(changed))
    if 'menu_category' in changed:
        state.pop('requested_groups', None)
        state.pop('group_counts', None)
        if 'scope' not in changed:
            state['scope'] = 'all'  # Resolved to the canonical category's scope at preflight.
    if 'scope' in changed and 'requested_groups' not in changed:
        state.pop('requested_groups', None)
        state.pop('group_counts', None)
        if changed['scope'] != previous.get('scope') and 'menu_category' not in changed:
            state.pop('menu_category', None)
    if delta.get('add_groups') or delta.get('remove_groups'):
        groups = state.get('requested_groups') or ([state['scope']] if state.get('scope') in {'drink', 'food'} else ['drink', 'food'])
        groups = list(dict.fromkeys([*groups, *delta.get('add_groups', [])]))
        groups = [group for group in groups if group not in delta.get('remove_groups', [])]
        if not groups:
            return None, 'discovery_group_required'
        state.update(scope='all' if len(groups) > 1 else groups[0], requested_groups=groups)
        state.pop('group_counts', None)
        if groups != [previous.get('scope')]:
            state.pop('menu_category', None)
    if 'requested_groups' in changed and 'scope' not in changed:
        state['scope'] = 'all' if len(changed['requested_groups']) > 1 else changed['requested_groups'][0]
    from src.agents.hybrid_command_schema import validate_envelope
    _, error, _ = validate_envelope({'kind': 'commands', 'commands': [{'intent': 'DISCOVER_PRODUCTS', 'args': state}], 'message': None})
    return (None, error['failure_code']) if error else (state, None)


def discover(dispatcher, item):
    args, intent = item['args'], item['intent']
    if intent == 'REFINE_DISCOVERY' and not item.get('discovery_prepared'):
        args, error = merge(dispatcher.turn.state.get('discovery_state') or {}, args)
        if error:
            return {'status': error, 'message': 'Bạn cho mình tiêu chí muốn xem lại, như nhóm món, số món hoặc khoảng giá nhé.'}
    groups = args.get('requested_groups') or [args['scope']]
    total = sum(args['group_counts'].values()) if args.get('group_counts') else args.get('count', 5)
    allocation = args.get('group_counts') or {group: total // len(groups) + (i < total % len(groups)) for i, group in enumerate(groups)}
    batches, errors = {}, []
    for group in groups:
        # Fetch enough to fill spare total slots if the other group is sparse.
        count = allocation[group] if args.get('group_counts') or len(groups) == 1 else total
        sorts = {'name': 'menu', 'price': 'price_asc' if args.get('direction', 'ascending') == 'ascending' else 'price_desc',
                 'sales': 'sold_desc', 'new': 'new',
                 'rating': 'rating_asc' if args.get('direction', 'descending') == 'ascending' else 'rating_desc'}
        result = dispatcher.call(intent, 'filter_catalog', {'category': group, 'search_text': args.get('query', ''),
            'sort_by': sorts[args.get('basis', 'name')], 'limit': count,
            **({'category_id': item['category']['category_id']} if item.get('category') else {}),
            **{k: args[k] for k in ('period', 'period_anchor', 'min_price', 'max_price',
                'min_price_inclusive', 'max_price_inclusive') if k in args}},
            exclude_previous=args.get('exclude_previous', False))
        rows, seen = [], set()
        valid_status = result.get('status') in {'ok', 'not_found'}
        for row in (result.get('products') or []) if result.get('status') == 'ok' else []:
            key = str(row.get('product_id') or '')
            if group != 'all' and product_bucket(row) != group:
                errors.append(group)
                continue
            if key and key not in seen and (group == 'all' or product_bucket(row) == group):
                rows.append(row)
                seen.add(key)
        batches[group] = rows
        if not valid_status:
            errors.append(group)
    selected = {group: rows[:allocation[group]] for group, rows in batches.items()}
    if not args.get('group_counts'):
        for group in groups:
            spare = total - sum(len(rows) for rows in selected.values())
            selected[group] += batches[group][len(selected[group]):len(selected[group]) + spare]
    rows, seen, returned = [], set(), {group: 0 for group in groups}
    for group in groups:
        for row in selected[group]:
            if str(row['product_id']) not in seen:
                rows.append(row)
                seen.add(str(row['product_id']))
                returned[group] += 1
            else:
                errors.append(group)  # Conflicting cross-group canonical identity.
    missing = [group for group in groups if not returned[group]]
    coverage = not missing and not errors and len(rows) == total
    logger.info('[HybridDiscovery] %s', json.dumps({'requested_groups': groups,
        'requested_counts': args.get('group_counts'), 'server_allocation': allocation,
        'returned_group_counts': returned, 'coverage_complete': coverage, 'unavailable_groups': errors}))
    # Read failure invalidates the attempted visible collection, but does not
    # replace the last successfully displayed browse criteria for future deltas.
    if not errors:
        cart_manager.set_checkout_context(dispatcher.gateway.session_id, hybrid_discovery_state=deepcopy(args))
    message = ' '.join(('Chưa xác minh được ' if group in errors else 'Chưa tìm thấy món phù hợp trong ') +
        PRODUCT_GROUP_LABELS.get(group, 'Menu').lower() + '.' for group in dict.fromkeys([*missing, *errors]))
    if args.get('group_counts'):
        message += ' '.join(f" Hiện tìm được {returned[group]}/{allocation[group]} món {PRODUCT_GROUP_LABELS.get(group, 'Menu').lower()}."
            for group in groups if 0 < returned[group] < allocation[group])
    elif 'count' in args and rows and len(rows) < total:
        message += f' Hiện tìm được {len(rows)}/{total} món phù hợp.'
    return {'status': 'discovery_coverage_incomplete' if errors else 'ok', 'products': rows,
        'discovery_criteria': args, 'refreshed_groups': ['drink', 'food'] if 'all' in groups else groups,
        'coverage_complete': coverage, 'returned_group_counts': returned, 'message': message}
