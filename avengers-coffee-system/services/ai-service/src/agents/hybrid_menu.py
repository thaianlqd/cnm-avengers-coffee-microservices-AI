"""Canonical Menu hierarchy, separate from product and cart reference spaces."""
from copy import deepcopy
from src.agents.hybrid_workflow import GroundingError, identity
from src.function_calling.tools.product_tools import _catalog_name_key


def nodes_from_leaves(leaves):
    nodes = {}
    for leaf in leaves:
        if not isinstance(leaf, dict) or not all(leaf.get(key) for key in ('category_id', 'category_name', 'menu_bucket')):
            raise GroundingError('menu_catalog_invalid', 'menu_categories')
        ids = leaf.get('category_ids') or [leaf['category_id']]
        names = leaf.get('category_names') or [leaf['category_name']]
        if len(ids) != len(names) or not ids or str(ids[-1]) != str(leaf['category_id']):
            raise GroundingError('menu_catalog_invalid', 'menu_categories')
        for index, (key, name) in enumerate(zip(ids, names)):
            key = str(key)
            node = {'category_id': key, 'category_name': name, 'menu_bucket': leaf['menu_bucket'],
                'parent_id': str(ids[index - 1]) if index else None,
                'parent_category_name': names[index - 1] if index else None,
                'category_label': ' / '.join(names[:index + 1])}
            if key in nodes and nodes[key] != node:
                raise GroundingError('menu_catalog_invalid', 'menu_categories')
            nodes[key] = node
    parents = {node['parent_id'] for node in nodes.values()}
    return [{**node, 'has_children': node['category_id'] in parents}
        for node in sorted(nodes.values(), key=lambda r: (r['menu_bucket'], _catalog_name_key(r['category_label']), r['category_id']))]


def catalog(dispatcher):
    if not hasattr(dispatcher, '_menu_nodes'):
        result = dispatcher.fact('get_menu_categories', {})
        if result.get('status') != 'ok':
            raise GroundingError('menu_catalog_unavailable', 'menu_categories')
        dispatcher._menu_nodes = nodes_from_leaves(result.get('menu_categories') or [])
    return deepcopy(dispatcher._menu_nodes)


def resolve(dispatcher, ref, intent):
    nodes = catalog(dispatcher)
    if ref['kind'] == 'name':
        # Exact accent/case-normalized equality, not a fuzzy or phrase router.
        wanted = _catalog_name_key(ref['value']).strip()
        matches = [node for node in nodes if wanted in {
            _catalog_name_key(node['category_name']).strip(), _catalog_name_key(node['category_label']).strip()}]
        if len(matches) != 1:
            raise GroundingError('ambiguous_reference' if matches else 'unknown_reference', 'menu_categories')
        ref = {'kind': 'name', 'value': matches[0]['category_label']}
    row = dispatcher.bind('menu_categories', ref, intent, nodes)
    current = [node for node in nodes if identity('menu_categories', node) == identity('menu_categories', row)]
    if len(current) != 1:
        raise GroundingError('menu_category_no_longer_available', 'menu_categories')
    return current[0]


def bind_discovery(dispatcher, args, intent):
    args = deepcopy(args)
    node = resolve(dispatcher, args['menu_category'], intent)
    scope = node['menu_bucket']
    if args.get('scope', 'all') not in {'all', scope} or any(group != scope for group in args.get('requested_groups', [])):
        raise GroundingError('menu_category_scope_conflict', 'menu_categories')
    # Persist a qualified canonical NAME, never a mutable category ordinal or
    # hidden ID in the interpreter context. Actual ID remains server-only.
    args.update(scope=scope, menu_category={'kind': 'name', 'value': node['category_label']})
    return args, node


def read_menu(dispatcher, item):
    try:
        nodes = catalog(dispatcher)
    except GroundingError as exc:
        return {'status': 'business_unavailable', 'failure_code': exc.code,
            'message': 'Mình chưa đọc được danh mục Menu lúc này. Bạn thử xem lại sau nhé; giỏ hàng vẫn được giữ nguyên.'}
    parent = item.get('row')
    if parent and not parent['has_children']:
        from src.agents.hybrid_discovery import discover
        return discover(dispatcher, {'intent': 'READ_MENU', 'args': {'scope': parent['menu_bucket'],
            'menu_category': {'kind': 'name', 'value': parent['category_label']}}, 'category': parent})
    scope = item['args'].get('scope', 'all')
    rows = [node for node in nodes if node['parent_id'] == (parent['category_id'] if parent else None)
        and scope in {'all', node['menu_bucket']}]
    rows = [{**row, 'display_index': i} for i, row in enumerate(rows, 1)]
    result = {'status': 'ok', 'menu_categories': rows}
    # The prerequisite read was canonical; publish only this server-selected
    # level of the tree, exactly once, after the whole envelope has preflighted.
    dispatcher.gateway.artifacts.collect('get_menu_categories', {}, result)
    lead = ('Dạ, danh mục **' + parent['category_name'] + '** gồm:' if parent else
        'Dạ, menu của quán gồm các danh mục:')
    result['message'] = lead + '\n\n' + '\n'.join(f"{r['display_index']}. **{r['category_name']}**" for r in rows) + (
        '\n\nBạn chọn tên hoặc **danh mục số** để xem tiếp nhé.' if rows else 'Menu hiện chưa có danh mục đang bán phù hợp.')
    return result
