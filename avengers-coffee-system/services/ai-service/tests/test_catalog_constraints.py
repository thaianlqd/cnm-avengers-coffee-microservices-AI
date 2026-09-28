import logging
import uuid

import pytest

from src.agents import agent_service, order_flow_graph, tier1
from src.agents.catalog_constraints import parse_catalog_constraints
from src.function_calling.tools import cart_tools, product_tools


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


def test_wallet_evidence_never_confuses_vi_conjunction():
    assert agent_service._explicit_checkout_choices('tôi lấy tại quán vì gần nhà') == {'delivery_type': 'MANG_DI'}
    assert tier1.classify_order_intent('tôi lấy tại quán vì gần nhà')['intent'] == 'SELECT_FULFILLMENT'
    assert agent_service._explicit_checkout_choices('lấy tại quán và thanh toán bằng ví') == {
        'delivery_type': 'MANG_DI', 'payment_method': 'VI_DIEN_TU',
    }
    assert agent_service._explicit_checkout_choices('nãy tôi bảo trả bằng ví rồi')['payment_method'] == 'VI_DIEN_TU'


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
