"""Natural short turns must consult the right authority without consuming BPM state."""
from copy import deepcopy
from unittest.mock import Mock
from uuid import uuid4

import pytest

from src.agents import agent_service, order_flow_graph, knowledge_consultation
from src.common import cart_manager, groq_service
from src.function_calling.tools import cart_tools, product_tools, voucher_tools, branch_tools
from src.rag import rag_service
from src.rag.authority import knowledge_route


@pytest.fixture
def runtime(monkeypatch):
    products = [
        {'product_id': 'natural-drink', 'product_name': 'Americano Mơ', 'category': 'drink'},
        {'product_id': 'natural-food', 'product_name': 'Butter Croissant Mama', 'category': 'food'},
    ]
    docs = [dict(id='doc-'+p['product_id'], title=p['product_name'],
                 content='Hương vị chua nhẹ.' if p['category'] == 'drink' else 'Bánh có vị bơ.',
                 source='fixture', domain='product_description', entity_type='product',
                 entity_id=p['product_id'], tags=[p['product_name']], authority='knowledge',
                 volatility='slow') for p in products]
    docs.append(dict(id='privacy', title='Bảo mật', content='Dữ liệu cá nhân được bảo mật.',
                     source='fixture', domain='privacy', tags=['bảo mật'],
                     authority='knowledge', volatility='static'))
    monkeypatch.setattr(rag_service, 'load_all_rag_data', lambda: docs)
    service = rag_service.RAGService()
    assert service.load()['status'] == 'ok'
    monkeypatch.setattr(rag_service, 'get_rag_service', lambda: service)
    monkeypatch.setattr(order_flow_graph, '_load_active_product_targets', lambda: products)
    monkeypatch.setattr(groq_service, 'groq_chat', lambda *a, **k: None)
    monkeypatch.setattr(cart_tools, 'sync_authoritative_cart', lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(product_tools, 'execute_get_product_insights', Mock(return_value={
        'status': 'ok', 'message': 'Món hiện chưa có đánh giá nào trên hệ thống.'}))
    monkeypatch.setattr(product_tools, 'execute_check_price_and_stock', Mock(return_value={
        'status': 'ok', 'products': [dict(products[0], final_price=42000)]}))
    monkeypatch.setattr(agent_service, '_run_agent_impl', lambda *a, **k: pytest.fail('model fallback'))
    return products


def seed(products, context='focus', pending=None):
    sid = 'natural-' + uuid4().hex
    cart_manager.get_cart(sid)
    if context == 'focus':
        cart_manager.set_checkout_context(sid, last_product_focus=products[0])
    elif context == 'snapshot':
        cart_manager.set_checkout_context(sid, last_product_suggestions=[products[0]])
    if pending:
        cart_manager.set_pending_products(sid, [dict(products[0], quantity=2,
            selected_options={'Đá': 'Ít'}, option_schema=[{
                'name': 'Kích thước', 'values': ['Vừa', 'Lớn'], 'required': True}])])
        cart_manager.set_checkout_context(sid, selected_voucher={'code': 'v'},
            branch_candidates=[{'branch_id': 'b'}], quote={'total': 84000})
        cart_manager.set_pending_action(sid, pending, {'token': 'original'})
    return sid


def forbid_writes(monkeypatch):
    for name in ('add_item', 'update_item', 'remove_item', 'clear_cart', 'set_branch', 'apply_voucher'):
        if hasattr(cart_manager, name):
            monkeypatch.setattr(cart_manager, name, Mock(side_effect=AssertionError(name)))
    for name in ('execute_add_to_cart', 'execute_remove_from_cart', 'execute_remove_cart_item',
                 'execute_update_cart_item', 'execute_clear_cart', 'execute_get_cart_quote',
                 'execute_request_checkout', 'execute_confirm_checkout', '_quote_authoritative_cart'):
        if hasattr(cart_tools, name):
            monkeypatch.setattr(cart_tools, name, Mock(side_effect=AssertionError(name)))
    for name in ('execute_apply_voucher', 'execute_remove_voucher'):
        monkeypatch.setattr(voucher_tools, name, Mock(side_effect=AssertionError(name)))
    monkeypatch.setattr(branch_tools, 'execute_set_session_branch',
                        Mock(side_effect=AssertionError('branch selection')))
    monkeypatch.setattr('src.common.checkout_service.finalize_checkout',
                        Mock(side_effect=AssertionError('order creation')))


def assert_business_state_unchanged(sid, before):
    # New contract: only canonical conversational identity may change on a
    # product consultation. Preserve every business field and pending owner.
    after = deepcopy(cart_manager._SESSION_CARTS[sid])
    after['checkout_prefs'].pop('last_product_focus', None)
    expected = deepcopy(before)
    expected['checkout_prefs'].pop('last_product_focus', None)
    after.pop('updated_at', None)
    expected.pop('updated_at', None)
    assert after == expected


@pytest.mark.parametrize('query', [
    'Americano Mơ vị sao?', 'Americano Mơ ngon k?', 'Americano Mơ như nào?',
    'món này vị sao?', 'món này có gì đặc biệt?', 'có sữa k?', 'thành phần?',
    'Butter Croissant Mama vị sao?', 'bánh này ăn sao?', 'vị sao?',
    'có gì đặc biệt?', 'cái vừa nãy vị sao?',
])
@pytest.mark.parametrize('context', ['focus', 'selected', 'snapshot', 'pending'])
def test_static_description(runtime, monkeypatch, query, context):
    sid = seed(runtime, context, 'fill_options' if context == 'pending' else None)
    before = deepcopy(cart_manager._SESSION_CARTS[sid])
    forbid_writes(monkeypatch)
    result = order_flow_graph.run_order_flow(sid, query,
        selected_product_id=runtime[0]['product_id'] if context == 'selected' else None)
    assert result.get('route_owner') == 'knowledge'
    evidence = result['tool_calls_log'][0]['result']
    if 'sữa' in query or 'thành phần' in query:
        assert 'chưa có đủ' in result['reply'] or 'chưa phải danh sách' in result['reply']
    else:
        expected = runtime[1] if 'Butter' in query else runtime[0]
        assert evidence['status'] == 'ok'
        assert {d['entity_id'] for d in evidence['results']} == {expected['product_id']}
    assert_business_state_unchanged(sid, before)
    expected_focus = runtime[1] if 'Butter' in query else runtime[0]
    assert cart_manager.get_checkout_prefs(sid)['last_product_focus'] == expected_focus


@pytest.mark.parametrize('query,tool', [
    ('Americano Mơ được đánh giá sao?', 'get_product_insights'),
    ('Americano Mơ review sao?', 'get_product_insights'),
    ('món này được đánh giá ntn?', 'get_product_insights'),
    ('món này bao nhiêu sao?', 'get_product_insights'),
    ('khách nhận xét sao?', 'get_product_insights'),
    ('Americano Mơ bao nhiêu?', 'check_price_and_stock'),
    ('món này giá sao?', 'check_price_and_stock'),
    ('bao nhiêu tiền?', 'check_price_and_stock'), ('giá?', 'check_price_and_stock'),
    ('bao nhiêu?', 'check_price_and_stock'),
])
@pytest.mark.parametrize('context', ['focus', 'selected', 'pending'])
def test_review_and_price(runtime, monkeypatch, query, tool, context):
    sid = seed(runtime, context, 'fill_options' if context == 'pending' else None)
    before = deepcopy(cart_manager._SESSION_CARTS[sid])
    forbid_writes(monkeypatch)
    result = order_flow_graph.run_order_flow(sid, query,
        selected_product_id=runtime[0]['product_id'] if context == 'selected' else None)
    assert [entry['tool'] for entry in result['tool_calls_log']] == [tool]
    assert ('chưa có đánh giá' if tool == 'get_product_insights' else '42.000đ') in result['reply']
    assert_business_state_unchanged(sid, before)
    assert cart_manager.get_checkout_prefs(sid)['last_product_focus'] == runtime[0]


@pytest.mark.parametrize('query,owner', [
    ('giá bao nhiêu?', 'price'), ('kiểm tra tồn kho', 'inventory'),
    ('còn hàng k?', 'inventory'), ('món này bao nhiêu sao?', 'review'),
    ('Americano Mơ vị sao, không cần giá', 'rag'),
    ('Americano Mơ hương vị như nào, đừng nói giá hay tồn kho', 'rag'),
    ('Americano Mơ vị sao, không hỏi tồn kho', 'rag'),
    ('Americano Mơ vị sao, chưa cần kiểm tra giá', 'rag'),
    ('không cần giá, kiểm tra tồn kho', 'inventory'),
    ('đừng nói tồn kho, giá bao nhiêu?', 'price'),
])
def test_authority_polarity(query, owner):
    assert knowledge_route(query)['owner'] == owner


@pytest.mark.parametrize('query', [
    'bên bạn có bánh gì?', 'có bánh gì k?', 'bánh gì nhỉ?', 'cho xem bánh',
    'có cà phê gì?', 'xem matcha', 'bên bạn có bánh gì để tôi chọn?',
    'cho tôi xem bánh rồi tôi chọn', 'có cà phê gì để lát tôi mua?',
])
def test_catalog_browse(runtime, monkeypatch, query):
    sid = seed(runtime)
    forbid_writes(monkeypatch)
    monkeypatch.setattr(product_tools, 'execute_get_recommendations', lambda **k: {
        'status': 'ok', 'products': [dict(p, final_price=42000) for p in runtime]})
    result = order_flow_graph.run_order_flow(sid, query)
    assert result['reply'] and 'giỏ hàng đang trống' not in result['reply'].lower()
    assert cart_manager.get_checkout_prefs(sid).get('last_product_suggestions')
    assert cart_manager.get_cart(sid)['is_empty']


@pytest.mark.parametrize('query', [
    'tôi ở 42/3 Nguyễn Hữu Tiến', 'đang ở 85C Lê Trọng Tấn',
    'tôi đang ở trường đại học công thương',
    'tôi ở 42/3 Nguyễn Hữu Tiến, lát nữa mua đồ',
    'đang ở 85C Lê Trọng Tấn, tí đặt',
])
def test_location_first(runtime, monkeypatch, query):
    sid = seed(runtime)
    forbid_writes(monkeypatch)
    result = order_flow_graph.run_order_flow(sid, query)
    prefs = cart_manager.get_checkout_prefs(sid)
    assert prefs.get('last_resolved_location')
    assert 'món cụ thể' not in result['reply']
    assert not prefs.get('checkout_requested') and not prefs.get('delivery_address')
    assert not prefs.get('branch_candidates') and not cart_manager.get_cart(sid).get('branch_id')
    assert cart_manager.get_cart(sid)['is_empty']


@pytest.mark.parametrize('owner', ['fill_options', 'select_voucher', 'checkout_choices',
    'select_checkout_choices', 'confirm_address', 'select_branch', 'confirm_checkout'])
def test_static_policy_preserves_owner(runtime, monkeypatch, owner):
    sid = seed(runtime, pending=owner)
    before = deepcopy(cart_manager._SESSION_CARTS[sid])
    forbid_writes(monkeypatch)
    result = order_flow_graph.run_order_flow(sid, 'bảo mật thế nào?')
    assert result.get('route_owner') == 'knowledge'
    assert cart_manager._SESSION_CARTS[sid] == before


def test_same_options_resume_after_three_consultations(runtime, monkeypatch):
    sid = seed(runtime, pending='fill_options')
    before = deepcopy(cart_manager._SESSION_CARTS[sid])
    for query in ('món này vị sao?', 'món này review sao?', 'bao nhiêu?'):
        result = order_flow_graph.run_order_flow(sid, query)
        assert result['reply']
        assert_business_state_unchanged(sid, before)
    calls = []
    monkeypatch.setattr(agent_service, '_complete_pending_products_from_options',
        lambda session, text: calls.append((session, text)) or {
            'reply': 'Đã chọn size.', 'checkout_payload': None, 'tool_calls_log': [], 'error': None})
    order_flow_graph.run_order_flow(sid, 'size lớn')
    assert calls == [(sid, 'size lớn')]


@pytest.mark.parametrize('query', ['thêm vào giỏ', 'size lớn', 'đổi đá',
    'giá bao nhiêu', 'còn hàng k', 'review sao', 'chọn cái này'])
def test_selected_hint_does_not_steal_business_authority(runtime, query):
    sid = seed(runtime, pending='fill_options')
    assert knowledge_consultation.try_knowledge_consultation(sid, query, runtime[0]['product_id']) is None


def test_card_hint_does_not_restart_pending_options(runtime, monkeypatch):
    sid = seed(runtime, pending='fill_options')
    calls = []
    monkeypatch.setattr(agent_service, '_complete_pending_products_from_options',
        lambda session, text: calls.append((session, text)) or {
            'reply': 'Size Lớn', 'checkout_payload': None, 'tool_calls_log': [], 'error': None})
    order_flow_graph.run_order_flow(sid, 'size lớn', selected_product_id=runtime[0]['product_id'])
    assert calls == [(sid, 'size lớn')]


@pytest.mark.parametrize('pending', [None, 'fill_options'])
def test_stock_question_with_card_hint_is_read_only(runtime, monkeypatch, pending):
    sid = seed(runtime, pending=pending)
    before = deepcopy(cart_manager._SESSION_CARTS[sid])
    forbid_writes(monkeypatch)
    result = order_flow_graph.run_order_flow(sid, 'còn hàng k?', selected_product_id=runtime[0]['product_id'])
    assert [row['tool'] for row in result['tool_calls_log']] == ['check_price_and_stock']
    assert 'chưa xác minh' in result['reply'].lower()
    assert cart_manager._SESSION_CARTS[sid] == before


@pytest.mark.parametrize('query', ['món này vị sao?', 'có sữa k?', 'cái vừa nãy vị sao?'])
def test_multiple_pending_targets_never_guess_focus(runtime, monkeypatch, query):
    sid = seed(runtime, pending='fill_options')
    cart_manager.set_pending_products(sid, runtime)
    before = deepcopy(cart_manager._SESSION_CARTS[sid])
    forbid_writes(monkeypatch)
    result = order_flow_graph.run_order_flow(sid, query, selected_product_id=runtime[0]['product_id'])
    assert result['tool_calls_log'][0]['result']['status'] == 'not_found'
    assert 'sản phẩm nào' in result['reply']
    assert cart_manager._SESSION_CARTS[sid] == before


def test_unknown_product_does_not_use_focus(runtime, monkeypatch):
    sid = seed(runtime)
    forbid_writes(monkeypatch)
    result = order_flow_graph.run_order_flow(sid, 'Trà Quả Không Có vị sao?')
    assert result['tool_calls_log'][0]['result']['status'] == 'not_found'


@pytest.mark.parametrize('query', ['món số 2 vị sao?', 'Butter Croissant Mama vị sao?'])
def test_explicit_product_namespace_overrides_hint(runtime, monkeypatch, query):
    sid = seed(runtime, pending='fill_options')
    cart_manager.set_checkout_context(sid, last_product_suggestions=runtime)
    before = deepcopy(cart_manager._SESSION_CARTS[sid])
    forbid_writes(monkeypatch)
    result = order_flow_graph.run_order_flow(sid, query, selected_product_id=runtime[0]['product_id'])
    assert {row['entity_id'] for row in result['tool_calls_log'][0]['result']['results']} == {runtime[1]['product_id']}
    assert_business_state_unchanged(sid, before)
    assert cart_manager.get_checkout_prefs(sid)['last_product_focus'] == runtime[1]


@pytest.mark.parametrize('query', ['cho tôi món số 2', 'lấy bánh số 1',
    'thêm Americano Mơ', 'món này đi', 'lấy cái này'])
def test_concrete_selections_still_select(runtime, query):
    sid = seed(runtime)
    cart_manager.set_checkout_context(sid, last_product_suggestions=runtime,
        product_suggestion_snapshots={p['category']: [p] for p in runtime})
    state = order_flow_graph._understand({'session_id': sid, 'user_message': query,
                                         'cart': cart_manager.get_cart(sid), 'history': []})
    assert state['intent']['intent'] == 'ADD_ITEM'
    assert state['intent']['resolved_products'][0]['product_id'] in {p['product_id'] for p in runtime}


@pytest.mark.parametrize('query', ['món này vị sao, thêm Americano Mơ',
    'thêm Americano Mơ, vị sao?', 'size lớn, chính sách bảo mật ra sao?'])
def test_mixed_commands_do_not_enter_rag(runtime, query):
    sid = seed(runtime, pending='fill_options')
    assert knowledge_consultation.try_knowledge_consultation(sid, query, runtime[0]['product_id']) is None


@pytest.mark.parametrize('query', ['vị sao?', 'review sao?', 'giá?', 'còn hàng k?'])
def test_invalid_card_hint_clarifies_without_writes(runtime, monkeypatch, query):
    sid = seed(runtime, context='selected')
    before = deepcopy(cart_manager._SESSION_CARTS[sid])
    forbid_writes(monkeypatch)
    result = order_flow_graph.run_order_flow(sid, query, selected_product_id='missing-card')
    assert result['reply'] and not result.get('checkout_payload')
    assert not any(row['tool'] in {'check_price_and_stock', 'get_product_insights'}
                   for row in result['tool_calls_log'])
    assert cart_manager._SESSION_CARTS[sid] == before


@pytest.mark.parametrize('status,expected', [('available', 'còn hàng'),
    ('unavailable', 'không có hàng'), ('unknown', 'chưa xác minh')])
def test_stock_uses_authoritative_outlet_status(runtime, monkeypatch, status, expected):
    sid = seed(runtime, pending='fill_options')
    cart_manager.set_branch(sid, 'outlet', 'Điểm bán')
    cart_manager.set_checkout_context(sid, delivery_type='MANG_DI')
    check = Mock(return_value={'status': 'ok', 'products': [dict(runtime[0],
                              final_price=42000, availability_status=status)]})
    monkeypatch.setattr(product_tools, 'execute_check_price_and_stock', check)
    before = deepcopy(cart_manager._SESSION_CARTS[sid])
    forbid_writes(monkeypatch)
    result = order_flow_graph.run_order_flow(sid, 'món này còn hàng k?')
    assert check.call_args.kwargs['branch_id'] == 'outlet'
    assert expected in result['reply']
    assert cart_manager._SESSION_CARTS[sid] == before


@pytest.mark.parametrize('query', ['bên bạn có bánh gì để tôi chọn?', 'cho xem bánh rồi tôi chọn'])
def test_browse_purpose_with_visible_single_product_never_selects(runtime, monkeypatch, query):
    sid = seed(runtime, context='snapshot')
    cart_manager.set_checkout_context(sid, last_product_suggestions=[runtime[1]])
    forbid_writes(monkeypatch)
    monkeypatch.setattr(product_tools, 'execute_get_recommendations', lambda **k: {
        'status': 'ok', 'products': [dict(runtime[1], final_price=42000)]})
    result = order_flow_graph.run_order_flow(sid, query)
    assert cart_manager.get_cart(sid)['is_empty']
    assert [row['tool'] for row in result['tool_calls_log']] == ['get_recommendations']


@pytest.mark.parametrize('query', [
    'Americano Mơ có hương vị như nào, đừng nói giá hay tồn kho',
    'vị sao, không cần giá', 'món này vị sao, không hỏi tồn kho',
    'có gì đặc biệt, chưa cần kiểm tra giá',
])
def test_exclusions_keep_entity_filtered_knowledge(runtime, monkeypatch, query):
    sid = seed(runtime, context='selected')
    before = deepcopy(cart_manager._SESSION_CARTS[sid])
    forbid_writes(monkeypatch)
    result = order_flow_graph.run_order_flow(sid, query, selected_product_id=runtime[0]['product_id'])
    assert result.get('route_owner') == 'knowledge'
    evidence = result['tool_calls_log'][0]['result']
    assert evidence['status'] == 'ok'
    assert {row['entity_id'] for row in evidence['results']} == {runtime[0]['product_id']}
    assert_business_state_unchanged(sid, before)
    assert cart_manager.get_checkout_prefs(sid)['last_product_focus'] == runtime[0]
