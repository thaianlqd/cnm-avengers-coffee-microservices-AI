import logging
import uuid

import pytest

from src.agents import agent_service, order_flow_graph, tier1
from src.agents.catalog_constraints import describe_catalog_constraint, parse_catalog_constraints
from src.agents.payment_intent import resolve_wallet_payment_intent
from src.function_calling.tools import cart_tools, product_tools
from src.common import cart_manager


@pytest.mark.parametrize("message,expected", [
    ("các món dưới 7.000", {"max_price": 7000, "max_price_inclusive": False, "sellable_scope": "normal"}),
    ("các sản phẩm dưới 30,000", {"max_price": 30000, "max_price_inclusive": False, "sellable_scope": "normal"}),
    ("topping dưới 7k", {"max_price": 7000, "max_price_inclusive": False, "sellable_scope": "topping"}),
    ("đồ uống từ 40k đến 70k", {"min_price": 40000, "max_price": 70000, "category": "drink"}),
    ("bánh không quá 30 nghìn", {"max_price": 30000, "max_price_inclusive": True, "category": "food"}),
    ("món trên 50k", {"min_price": 50000, "min_price_inclusive": False}),
    ("món ít nhất 50k", {"min_price": 50000, "min_price_inclusive": True}),
    ("món khoảng 50k", {"min_price": 45000, "max_price": 55000}),
    ("món rẻ nhất", {"sort_by": "price_asc"}),
    ("món đắt nhất", {"sort_by": "price_desc"}),
    ("có gì dưới 30k?", {"constraint_type": "LT", "max_price": 30000}),
    ("có món gì dưới 30k?", {"constraint_type": "LT", "max_price": 30000}),
    ("cho xem loại dưới 30k", {"constraint_type": "LT", "max_price": 30000}),
    ("có cái gì khoảng 50k không?", {"constraint_type": "APPROX", "approx_price": 50000}),
    ("cho tôi xem loại rẻ nhất", {"constraint_type": "CHEAPEST", "limit": 1}),
    ("các món rẻ nhất", {"constraint_type": "CHEAPEST", "limit": 16}),
])
def test_vietnamese_catalog_constraints(message, expected):
    result = parse_catalog_constraints(message)
    assert result is not None
    assert all(result[key] == value for key, value in expected.items())


def test_price_query_is_catalog_only_and_never_calls_rag(monkeypatch):
    session = 'price-filter-' + uuid.uuid4().hex
    seen = []
    monkeypatch.setattr(cart_tools, 'sync_authoritative_cart', lambda _sid: {
        'items': [], 'authoritative': False, 'cart_sync_status': 'guest_draft',
    })
    monkeypatch.setattr(product_tools, 'execute_filter_catalog', lambda **kw: seen.append(kw) or {
        'status': 'not_found', 'products': [],
    })
    monkeypatch.setattr(agent_service, '_run_agent_impl', lambda *_a, **_k: pytest.fail('RAG/model fallback'))
    result = order_flow_graph.run_order_flow(session, 'các món dưới 7.000')
    assert seen[0]['max_price'] == 7000
    assert seen[0]['sellable_scope'] == 'normal'
    assert 'không có món nào dưới 7.000đ' in result['reply']
    assert [entry['tool'] for entry in result['tool_calls_log']] == ['filter_catalog']


@pytest.mark.parametrize('phrase,expected', [
    ('đồ uống từ 40k đến 70k', 'từ 40.000đ đến 70.000đ'),
    ('món khoảng 50k', 'khoảng 50.000đ'),
    ('món rẻ nhất', 'rẻ nhất'),
    ('có gì dưới 30k?', 'dưới 30.000đ'),
])
def test_catalog_no_match_uses_original_constraint_not_rag(monkeypatch, phrase, expected):
    session = 'catalog-absent-' + uuid.uuid4().hex
    monkeypatch.setattr(cart_tools, 'sync_authoritative_cart', lambda _sid: {
        'items': [], 'authoritative': False, 'cart_sync_status': 'guest_draft',
    })
    monkeypatch.setattr(product_tools, 'execute_filter_catalog', lambda **_kw: {
        'status': 'not_found', 'products': [],
    })
    monkeypatch.setattr(agent_service, '_run_agent_impl', lambda *_a, **_k: pytest.fail('RAG/model fallback'))
    result = order_flow_graph.run_order_flow(session, phrase)
    assert expected in result['reply']
    assert [entry['tool'] for entry in result['tool_calls_log']] == ['filter_catalog']


def test_filtered_cards_keep_images_sixteen_ordinals_and_topping_bucket(monkeypatch):
    session = 'catalog-cards-' + uuid.uuid4().hex
    monkeypatch.setattr(cart_tools, 'sync_authoritative_cart', lambda _sid: {
        'items': [], 'authoritative': False, 'cart_sync_status': 'guest_draft',
    })
    monkeypatch.setattr(product_tools, 'execute_filter_catalog', lambda **_kw: {
        'status': 'ok', 'products': [
            {'product_id': f'T{i}', 'product_name': f'Topping {i}', 'final_price': i * 1000,
             'category': 'Topping', 'menu_bucket': 'topping', 'hinh_anh_url': f'https://image/{i}.png'}
            for i in range(1, 17)
        ],
    })
    result = order_flow_graph.run_order_flow(session, 'topping dưới 20k')
    cards = result['ui_payload']['products']
    assert len(cards) == 16
    assert [item['display_index'] for item in cards] == list(range(1, 17))
    assert all(item['menu_bucket'] == 'topping' and item['hinh_anh_url'] for item in cards)
    snapshot = cart_manager.get_checkout_prefs(session)['last_product_suggestions']
    assert len(snapshot) == 16
    assert [item['product_id'] for item in snapshot] == [item['product_id'] for item in cards]
    replay = order_flow_graph._sanitize_replay_result(result)
    assert len(replay['ui_payload']['products']) == 16
    assert replay['ui_payload']['products'][15]['group_display_index'] == 16


def test_wallet_evidence_never_confuses_vi_conjunction():
    assert agent_service._explicit_checkout_choices('tôi lấy tại quán vì gần nhà') == {'delivery_type': 'MANG_DI'}
    assert tier1.classify_order_intent('tôi lấy tại quán vì gần nhà')['intent'] == 'SELECT_FULFILLMENT'
    assert agent_service._explicit_checkout_choices('lấy tại quán và thanh toán bằng ví') == {
        'delivery_type': 'MANG_DI', 'payment_method': 'VI_DIEN_TU',
    }
    assert agent_service._explicit_checkout_choices('nãy tôi bảo trả bằng ví rồi')['payment_method'] == 'VI_DIEN_TU'


@pytest.mark.parametrize('phrase', [
    'tôi không thanh toán bằng ví', 'không trả bằng ví', 'đừng dùng ví',
    'tôi không muốn dùng ví', 'không chọn ví Avengers',
    'không thanh toán bằng ví, cho tôi COD',
])
def test_negated_wallet_payment_never_selects_wallet(phrase):
    assert resolve_wallet_payment_intent(agent_service._normalize_chat_text(phrase)) is False
    assert agent_service._explicit_checkout_choices(phrase).get('payment_method') != 'VI_DIEN_TU'
    assert tier1.classify_order_intent(phrase)['intent'] == 'SELECT_PAYMENT'
    if 'COD' in phrase:
        assert agent_service._explicit_checkout_choices(phrase)['payment_method'] == 'THANH_TOAN_KHI_NHAN_HANG'


@pytest.mark.parametrize('phrase', [
    'thanh toán bằng ví', 'trả bằng ví', 'dùng ví Avengers',
    'chọn ví điện tử', 'lấy tại quán và thanh toán bằng ví',
])
def test_positive_wallet_payment(phrase):
    assert agent_service._explicit_checkout_choices(phrase)['payment_method'] == 'VI_DIEN_TU'


@pytest.mark.parametrize('phrase,expected', [
    ('đồ uống từ 40k đến 70k', 'từ 40.000đ đến 70.000đ'),
    ('món khoảng 50k', 'khoảng 50.000đ'),
    ('món rẻ nhất', 'rẻ nhất'),
])
def test_catalog_description_preserves_semantics(phrase, expected):
    assert describe_catalog_constraint(parse_catalog_constraints(phrase)) == expected


def test_authoritative_sync_logs_safe_cause_and_blocks_mutation(monkeypatch, caplog):
    session = 'authenticated-test-user'
    monkeypatch.setattr(cart_tools, 'is_authenticated_cart_session', lambda _sid: True)
    monkeypatch.setattr(cart_tools, 'sync_authoritative_cart', lambda _sid: (_ for _ in ()).throw(ConnectionError('secret-token')))
    monkeypatch.setattr(cart_tools, 'execute_add_to_cart', lambda **_kw: pytest.fail('cart write after sync failure'))
    with caplog.at_level(logging.WARNING):
        state = order_flow_graph._sync({'session_id': session, 'user_message': 'thêm cà phê'})
    assert state['cart_sync_status'] == 'unavailable'
    assert state['cart']['authoritative'] is False
    assert 'ConnectionError' in caplog.text
    assert 'path=/cart/<customer>' in caplog.text
    assert 'secret-token' not in caplog.text
