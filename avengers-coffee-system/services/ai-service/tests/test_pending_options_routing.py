"""Pending option answers cannot be consumed by add/checkout routing."""
import pytest

from src.agents import agent_service, order_flow_graph
from src.common import cart_manager
from src.function_calling.tools import cart_tools


def _pending_options(session):
    cart_manager.set_pending_products(session, [{
        'product_id': 'P1', 'product_name': 'Matcha', 'quantity': 1,
        'option_schema': [{'name': 'Topping', 'values': ['Hạt sen'], 'required': False}],
    }])
    cart_manager.set_pending_action(session, 'fill_options', {})


@pytest.mark.parametrize('message', [
    'Thêm topping Hạt sen, Foam dừa; ít đá, ít ngọt nhé!',
    'Lấy SIZE lớn, sữa mặc định rồi tiếp tục thanh toán đi!',
    'Đổi topping cho tôi, bỏ qua voucher nhé',
])
def test_pending_options_forward_original_message_before_other_routes(monkeypatch, message):
    session = 'pending-options-verbatim'
    _pending_options(session)
    calls = []
    expected = {'reply': 'Cần chọn thêm lượng đá.', 'checkout_payload': None,
                'tool_calls_log': [], 'error': None}

    def complete(sid, text):
        calls.append((sid, text))
        return expected

    monkeypatch.setattr(agent_service, '_complete_pending_products_from_options', complete)
    monkeypatch.setattr(cart_tools, 'is_authenticated_cart_session', lambda sid: False)
    monkeypatch.setattr(order_flow_graph, '_resolve_add_reference', lambda *a, **k: pytest.fail('Must not resolve ADD_ITEM'))
    monkeypatch.setattr(agent_service, '_run_agent_impl', lambda *a, **k: pytest.fail('Must not enter legacy routing'))
    state = {'session_id': session, 'user_message': message, 'cart': cart_manager.get_cart(session)}
    understood = order_flow_graph._understand(state)
    assert understood['intent'] == {'intent': 'FILL_OPTIONS'}
    assert order_flow_graph._execute(understood)['result'] == expected
    assert calls == [(session, message)]


def test_unresolved_pending_options_never_fall_through_to_add(monkeypatch):
    session = 'pending-options-unresolved'
    _pending_options(session)
    monkeypatch.setattr(agent_service, '_complete_pending_products_from_options', lambda *a: None)
    monkeypatch.setattr(cart_tools, 'is_authenticated_cart_session', lambda sid: False)
    monkeypatch.setattr(order_flow_graph, '_resolve_add_reference', lambda *a, **k: pytest.fail('Must not resolve ADD_ITEM'))
    state = {'session_id': session, 'user_message': 'thêm topping', 'cart': cart_manager.get_cart(session)}
    result = order_flow_graph._execute(order_flow_graph._understand(state))['result']
    assert 'tùy chọn' in result['reply']
    assert not result['checkout_payload']
    assert not cart_manager.get_cart(session)['items']
    assert cart_manager.get_pending_action(session)['type'] == 'fill_options'


def test_pending_options_keep_authoritative_cart_write_guard(monkeypatch):
    session = 'pending-options-offline'
    _pending_options(session)
    monkeypatch.setattr(cart_tools, 'is_authenticated_cart_session', lambda sid: True)
    monkeypatch.setattr(agent_service, '_complete_pending_products_from_options', lambda *a: pytest.fail('Must not write an unverified cart'))
    state = {'session_id': session, 'user_message': 'thêm topping', 'cart': {'authoritative': False}}
    result = order_flow_graph._execute(order_flow_graph._understand(state))['result']
    assert result['tool_calls_log'][0]['result']['reason'] == 'authoritative_cart_unavailable'
    assert cart_manager.get_pending_action(session)['type'] == 'fill_options'


def test_explicit_clear_cart_overrides_pending_option_context():
    session = 'pending-options-clear-override'
    _pending_options(session)
    state = order_flow_graph._understand({
        'session_id': session,
        'user_message': 'xóa toàn bộ giỏ hàng',
        'cart': cart_manager.get_cart(session),
    })
    assert state['intent']['intent'] == 'CLEAR_CART'
