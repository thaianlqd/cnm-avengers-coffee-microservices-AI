"""Restore real Menu navigation through Hybrid without a raw-language router."""
from copy import deepcopy
import json
import pytest
from hybrid_support import runtime, hybrid, command as c, envelope as e, send, visible, pending
from test_hybrid_product_reference_spaces import capture, grouped
from src.agents.agent_memory import ConversationMemory
from src.agents.hybrid_command_schema import validate_envelope
from src.agents.hybrid_workflow import GroundingError, ground
from src.agents.hybrid_menu import nodes_from_leaves
from src.common import cart_manager
from src.function_calling.tools import TOOL_EXECUTORS, product_tools


@pytest.fixture
def menu(hybrid, monkeypatch):
    leaves = [
        {'category_id': 'matcha', 'category_name': 'Matcha', 'menu_bucket': 'drink',
            'category_ids': ['tea', 'matcha'], 'category_names': ['Trà', 'Matcha']},
        {'category_id': 'milk-tea', 'category_name': 'Trà Sữa', 'menu_bucket': 'drink',
            'category_ids': ['tea', 'milk-tea'], 'category_names': ['Trà', 'Trà Sữa']},
        {'category_id': 'phin', 'category_name': 'Cà Phê Phin', 'menu_bucket': 'drink',
            'category_ids': ['coffee', 'phin'], 'category_names': ['Cà Phê', 'Cà Phê Phin']},
        {'category_id': 'cake', 'category_name': 'Bánh Ngọt', 'menu_bucket': 'food',
            'category_ids': ['food', 'cake'], 'category_names': ['Bánh & Đồ Ăn', 'Bánh Ngọt']},
    ]
    hybrid.products[:] = [
        {'product_id': '101', 'product_name': 'Xanh Tây Bắc', 'category': 'Matcha', 'parent_category': 'Trà',
            'menu_bucket': 'drink', 'category_id': 'matcha', 'final_price': 95000},
        {'product_id': '102', 'product_name': 'Sữa Trân Châu', 'category': 'Trà Sữa', 'parent_category': 'Trà',
            'menu_bucket': 'drink', 'category_id': 'milk-tea', 'final_price': 59000},
        {'product_id': '103', 'product_name': 'Cà Phê Sữa', 'category': 'Cà Phê Phin', 'parent_category': 'Cà Phê',
            'menu_bucket': 'drink', 'category_id': 'phin', 'final_price': 39000},
        {'product_id': '104', 'product_name': 'Bánh Chuối', 'category': 'Bánh Ngọt', 'parent_category': 'Bánh & Đồ Ăn',
            'menu_bucket': 'food', 'category_id': 'cake', 'final_price': 39000},
    ]
    def categories(args, sid):
        hybrid.reads.append(('get_menu_categories', deepcopy(args)))
        return {'status': 'ok', 'menu_categories': deepcopy(leaves)}
    def catalog(args, sid):
        hybrid.reads.append(('filter_catalog', deepcopy(args)))
        valid_ids = {r['category_id'] for r in leaves if args.get('category_id') in (r['category_ids'] if args.get('category_id') else [None])}
        rows = [r for r in hybrid.products if args.get('category', 'all') in {'all', r['menu_bucket']}
            and (not args.get('category_id') or r['category_id'] in valid_ids)
            and (not args.get('search_text') or args['search_text'] in r['product_name'].lower())]
        return {'status': 'ok' if rows else 'not_found', 'products': deepcopy(rows[:args.get('limit', 16)])}
    monkeypatch.setitem(TOOL_EXECUTORS, 'get_menu_categories', categories)
    monkeypatch.setitem(TOOL_EXECUTORS, 'filter_catalog', catalog)
    return hybrid, leaves


def test_generic_menu_shows_canonical_roots_not_first_five_products(menu):
    rt, _ = menu
    before = deepcopy(cart_manager.get_cart(rt.sid)['items'])
    result = send(rt, c('READ_MENU'), text='hello cho tôi xem menu quán đi bạn')
    assert not result['error'] and result['provider_request_count'] == 1
    assert {r['category_name'] for r in result['ui_payload']['menu_categories']} == {'Trà', 'Cà Phê', 'Bánh & Đồ Ăn'}
    assert not result['ui_payload']['products'] and not rt.writes
    assert cart_manager.get_cart(rt.sid)['items'] == before
    assert [name for name, args in rt.reads] == ['get_menu_categories']


@pytest.mark.parametrize('name', ['Trà', 'trà', 'tra'])
def test_reported_tea_category_request_displays_actual_children(menu, name):
    rt, _ = menu
    send(rt, c('DISCOVER_PRODUCTS', scope='all', requested_groups=['drink', 'food']))
    result = send(rt, c('READ_MENU', target={'kind': 'name', 'value': name}), text='cho tôi xem danh mục trà đi bạn')
    assert not result['error'] and result['provider_request_count'] == 1
    assert [r['category_name'] for r in result['ui_payload']['menu_categories']] == ['Matcha', 'Trà Sữa']
    assert '**Trà**' in result['reply'] and 'Matcha' in result['reply'] and 'Trà Sữa' in result['reply']
    assert not result['ui_payload']['products'] and not rt.writes
    assert capture(rt).product_display_snapshot.collection()['valid']


def test_category_numbers_are_independent_of_product_numbers(menu):
    rt, _ = menu
    send(rt, c('READ_MENU', target={'kind': 'name', 'value': 'Trà'}))
    result = send(rt, c('DISCOVER_PRODUCTS', scope='all', menu_category={'kind': 'ordinal', 'index': 1}))
    assert not result['error'] and [r['product_id'] for r in result['ui_payload']['products']] == ['101']
    args = next(args for name, args in reversed(rt.reads) if name == 'filter_catalog')
    assert args['category_id'] == 'matcha' and args['category'] == 'drink' and not args['search_text']
    assert not pending(rt) and not rt.writes


def test_root_category_products_include_descendants_without_name_matching(menu):
    rt, _ = menu
    result = send(rt, c('DISCOVER_PRODUCTS', scope='all', menu_category={'kind': 'name', 'value': 'Trà'}), text='cho xem các món thuộc trà')
    assert not result['error'] and [r['product_id'] for r in result['ui_payload']['products']] == ['101', '102']
    assert rt.reads[-1][1]['category_id'] == 'tea' and not rt.reads[-1][1]['search_text']
    assert not rt.writes


def test_leaf_menu_request_displays_its_products(menu):
    rt, _ = menu
    result = send(rt, c('READ_MENU', target={'kind': 'name', 'value': 'Matcha'}))
    assert not result['error'] and [r['product_id'] for r in result['ui_payload']['products']] == ['101']
    assert 'Xanh Tây Bắc' in result['reply'] and not rt.writes


def test_category_selection_then_product_selection_stages_exact_product(menu):
    rt, _ = menu
    send(rt, c('READ_MENU', target={'kind': 'name', 'value': 'Trà'}))
    send(rt, c('READ_MENU', target={'kind': 'ordinal', 'index': 1}))
    result = send(rt, c('SELECT_PRODUCTS', mode='EXPLICIT', references=[{'kind': 'ordinal', 'index': 1, 'quantity': 2}]))
    assert not result['error'] and [(r['product_id'], r['quantity']) for r in pending(rt)] == [('101', 2)]


def test_menu_browse_does_not_resurrect_global_product_cards(menu):
    rt, _ = menu
    grouped(rt)
    send(rt, c('READ_MENU'))
    assert not capture(rt).rows('products')
    assert capture(rt).product_display_snapshot.collection()['valid']
    result = send(rt, c('SELECT_PRODUCTS', mode='ALL_VISIBLE'))
    assert result['error'] == 'visible_selection_required' and not pending(rt) and not rt.writes
    result = send(rt, c('SELECT_PRODUCTS', mode='EXPLICIT', references=[{'kind': 'group_ordinal', 'group': 'drink', 'index': 1}]))
    assert not result['error'] and pending(rt)[0]['product_id'] == '101'


def test_category_list_is_frozen_and_same_turn_menu_cannot_create_an_ordinal(menu):
    rt, _ = menu
    visible(rt, menu_categories=[])
    result = send(rt, c('READ_MENU'), c('DISCOVER_PRODUCTS', scope='all', menu_category={'kind': 'ordinal', 'index': 1}))
    assert result['error'] == 'unknown_reference' and not rt.writes and not pending(rt)
    assert not result['ui_payload'].get('menu_categories')
    send(rt, c('READ_MENU', target={'kind': 'name', 'value': 'Trà'}))
    turn = capture(rt)
    visible(rt, menu_categories=[])
    assert ground(turn, 'menu_categories', {'kind': 'ordinal', 'index': 1})['category_id'] == 'matcha'


@pytest.mark.parametrize('target', [{'kind': 'name', 'value': 'Not a category'}, {'kind': 'ordinal', 'index': 99},
    {'kind': 'id', 'value': 'tea'}])
def test_unknown_or_unsupplied_category_id_never_writes(menu, target):
    rt, _ = menu
    result = send(rt, c('EDIT_CART', changes=[{'action': 'REMOVE', 'target': {'kind': 'cart_ordinal', 'index': 1}}]),
        c('READ_MENU', target=target))
    assert result['failure_field'] == 'menu_categories' and not rt.writes


def test_stale_category_is_revalidated_before_cart_write(menu):
    rt, leaves = menu
    send(rt, c('READ_MENU', target={'kind': 'name', 'value': 'Trà'}))
    leaves[:] = [r for r in leaves if r['category_id'] != 'matcha']
    result = send(rt, c('EDIT_CART', changes=[{'action': 'REMOVE', 'target': {'kind': 'cart_ordinal', 'index': 1}}]),
        c('DISCOVER_PRODUCTS', scope='all', menu_category={'kind': 'ordinal', 'index': 1}))
    assert result['error'] == 'menu_category_no_longer_available' and not rt.writes


def test_catalog_outage_preserves_cart_and_previous_valid_display(menu, monkeypatch):
    rt, _ = menu
    send(rt, c('DISCOVER_PRODUCTS', scope='drink'))
    before = capture(rt).rows('products')
    monkeypatch.setitem(TOOL_EXECUTORS, 'get_menu_categories', lambda a, s: {'status': 'error'})
    result = send(rt, c('READ_MENU', target={'kind': 'name', 'value': 'Trà'}))
    assert result['error'] == 'menu_catalog_unavailable' and result['failure_class'] == 'BUSINESS_POLICY'
    assert capture(rt).rows('products') == before and not rt.writes


def test_generic_menu_outage_is_a_business_result_not_an_uncaught_exception(menu, monkeypatch):
    rt, _ = menu
    monkeypatch.setitem(TOOL_EXECUTORS, 'get_menu_categories', lambda a, s: {'status': 'error'})
    result = send(rt, c('READ_MENU'))
    assert result['error'] == 'business_unavailable' and result['failure_class'] == 'BUSINESS_POLICY'
    assert 'chưa đọc được danh mục Menu' in result['reply'] and not rt.writes


def test_category_refinement_keeps_canonical_name_not_stale_ordinal(menu):
    rt, _ = menu
    send(rt, c('DISCOVER_PRODUCTS', scope='all', requested_groups=['drink', 'food']))
    result = send(rt, c('REFINE_DISCOVERY', set={'menu_category': {'kind': 'name', 'value': 'Trà'}}))
    assert not result['error']
    state = cart_manager.get_checkout_prefs(rt.sid)['hybrid_discovery_state']
    assert state['scope'] == 'drink' and 'requested_groups' not in state
    assert state['menu_category'] == {'kind': 'name', 'value': 'Trà'}
    send(rt, c('READ_MENU', target={'kind': 'name', 'value': 'Cà Phê'}))
    result = send(rt, c('REFINE_DISCOVERY', set={'count': 2, 'basis': 'price'}))
    assert not result['error'] and rt.reads[-1][1]['category_id'] == 'tea'
    assert [r['product_id'] for r in result['ui_payload']['products']] == ['101', '102']


def test_category_namespaces_are_in_model_context_without_ids(menu):
    rt, _ = menu
    send(rt, c('READ_MENU', target={'kind': 'name', 'value': 'Trà'}))
    model = capture(rt).model_context()
    assert model['visible']['menu_categories'][0]['category_name'] == 'Matcha'
    assert 'category_id' not in json.dumps(model)


def test_category_read_interrupt_keeps_pending_options_and_checkout_summary(menu):
    rt, _ = menu
    send(rt, c('SELECT_PRODUCTS', mode='EXPLICIT', references=[{'kind': 'ordinal', 'index': 1}]))
    before = deepcopy(pending(rt))
    cart_manager.set_checkout_context(rt.sid, checkout_action_id='preserved-summary')
    result = send(rt, c('READ_MENU', target={'kind': 'name', 'value': 'Trà'}))
    assert not result['error'] and pending(rt) == before
    assert cart_manager.get_checkout_prefs(rt.sid)['checkout_action_id'] == 'preserved-summary'


def test_conflicting_delta_format_repair_has_category_contract_guidance(menu):
    rt, _ = menu
    send(rt, c('DISCOVER_PRODUCTS', scope='all', requested_groups=['drink', 'food']))
    rt.provider.steps = [{'content': json.dumps(e(c('REFINE_DISCOVERY', set={'scope': 'drink'}, remove_groups=['food'])))},
        {'content': json.dumps(e(c('REFINE_DISCOVERY', set={'menu_category': {'kind': 'name', 'value': 'Trà'}})))}]
    result = rt.turn('cho tôi xem danh mục trà đi bạn')
    assert not result['error'] and result['provider_request_count'] == 2
    assert 'not both' in rt.provider.requests[-1]['messages'][-1]['content'] and not rt.writes


@pytest.mark.parametrize('ref', [{'kind': 'group_ordinal', 'group': 'drink', 'index': 1},
    {'kind': 'pending_ordinal', 'index': 1}, {'kind': 'name', 'value': 'Trà', 'category_id': 'tea'}])
def test_category_grammar_rejects_product_pending_and_invented_fields(ref):
    assert validate_envelope(e(c('READ_MENU', target=ref)))[1]
    assert validate_envelope(e(c('DISCOVER_PRODUCTS', scope='all', menu_category=ref)))[1]


def test_arbitrary_menu_depth_is_data_driven():
    nodes = nodes_from_leaves([{'category_id': 'new-leaf', 'category_name': 'New Leaf', 'menu_bucket': 'drink',
        'category_ids': ['root', 'middle', 'new-leaf'], 'category_names': ['New Root', 'New Middle', 'New Leaf']}])
    assert [n['category_label'] for n in nodes] == ['New Root', 'New Root / New Middle', 'New Root / New Middle / New Leaf']
    assert nodes[0]['has_children'] and nodes[1]['has_children'] and not nodes[2]['has_children']


def test_category_sql_filters_ancestor_ids_and_uses_parameters(monkeypatch):
    queries = []
    class Rows:
        def mappings(self): return self
        def all(self): return []
    class Connection:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def execute(self, query, params): queries.append((str(query), params)); return Rows()
    class Engine:
        def connect(self): return Connection()
    monkeypatch.setattr(product_tools, '_get_engine', lambda: Engine())
    category_id = "literal'; never SQL"
    assert product_tools.execute_filter_catalog(category_id=category_id)['status'] == 'not_found'
    sql, params = queries[-1]
    assert ':category_id = ANY(paths.category_ids)' in sql and 'ARRAY_AGG(ancestor_id::text' in sql
    assert category_id not in sql and params['category_id'] == category_id
    assert product_tools.execute_get_menu_categories()['status'] == 'ok'
    assert 'paths.category_ids, paths.category_names' in queries[-1][0]
