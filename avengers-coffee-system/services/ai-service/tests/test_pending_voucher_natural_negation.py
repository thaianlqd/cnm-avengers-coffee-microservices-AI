"""The existing voucher owner consumes negative code-noun replies safely."""
from copy import deepcopy
from unittest.mock import Mock

import pytest

from src.agents import agent_service, order_flow_graph, pending_context
from src.common import cart_manager, groq_service
from src.function_calling.tools import cart_tools, voucher_tools


def test_minimal_negative_code_reply_skips_without_model(monkeypatch):
    fallback = Mock(return_value=None)
    monkeypatch.setattr(groq_service, 'groq_chat', fallback)
    assert pending_context.classify_pending_reply('không mã đâu', 'select_voucher') == 'SKIP_VOUCHER'
    fallback.assert_not_called()


@pytest.mark.parametrize('message', [
    'không voucher', 'ko mã đâu nha', 'k voucher nhé', 'khỏi mã nha',
    'thôi voucher nhé', 'mình không mã giảm giá đâu', 'dạ không voucher bạn ơi',
    'tôi không mã', 'không mã đâu!',
    'bỏ qua', 'bỏ qua voucher', 'không dùng', 'không cần mã', 'không áp voucher', 'không lấy',
])
def test_unambiguous_skip_grammar_is_deterministic(monkeypatch, message):
    monkeypatch.setattr(groq_service, 'groq_chat', Mock(side_effect=AssertionError('unnecessary model')))
    assert pending_context.classify_pending_reply(message, 'select_voucher') == 'SKIP_VOUCHER'


@pytest.mark.parametrize('message', [
    'áp cho tôi mã số 1 đi', 'lấy mã đầu tiên', 'dùng voucher thứ nhất',
    'chọn mã số 2', 'voucher tốt nhất',
])
def test_existing_selection_remains_selection(monkeypatch, message):
    monkeypatch.setattr(groq_service, 'groq_chat', Mock(side_effect=AssertionError('unnecessary model')))
    assert pending_context.classify_pending_reply(message, 'select_voucher') == 'SELECT_VOUCHER'


@pytest.mark.parametrize('message', ['xóa mã', 'bỏ voucher', 'gỡ mã giảm giá', 'gỡ voucher hiện tại'])
def test_explicit_removal_remains_removal(monkeypatch, message):
    monkeypatch.setattr(groq_service, 'groq_chat', Mock(side_effect=AssertionError('unnecessary model')))
    assert pending_context.classify_pending_reply(message, 'select_voucher') == 'REMOVE_VOUCHER'


@pytest.mark.parametrize('message', [
    'mã này giảm bao nhiêu', 'voucher này điều kiện thế nào', 'mã nào áp được?',
    'không mã thì có được không?', 'khỏi voucher được không?',
    'nếu không mã thì sao', 'không mã đâu hay áp voucher', 'chắc không mã',
])
def test_questions_conditions_uncertainty_cannot_skip(monkeypatch, message):
    monkeypatch.setattr(groq_service, 'groq_chat', Mock(side_effect=AssertionError('guarded boundary')))
    assert pending_context.classify_pending_reply(message, 'select_voucher') == 'AMBIGUOUS'


@pytest.mark.parametrize('message', [
    'không', 'thôi', 'khỏi', 'chưa mã', 'không mã nhỉ', 'không mã có được không',
    'không mã đâu, nhưng chọn mã số 1', 'không voucher, thêm bánh', 'không mã QR đâu',
    'không mã, đổi địa chỉ', 'không mã này đâu',
])
def test_incomplete_or_mixed_reply_is_not_a_deterministic_skip(monkeypatch, message):
    fallback = Mock(return_value=None)
    monkeypatch.setattr(groq_service, 'groq_chat', fallback)
    assert pending_context.classify_pending_reply(message, 'select_voucher') == 'AMBIGUOUS'
    fallback.assert_called_once()


@pytest.fixture
def checkout_flow(monkeypatch):
    from test_cart_voucher_checkout_flow import flow
    return flow.__wrapped__(monkeypatch)


@pytest.mark.parametrize('message', ['không mã đâu', 'khỏi voucher nha', 'mình không mã giảm giá đâu'])
def test_real_pending_boundary_consumes_negative_reply(checkout_flow, monkeypatch, message):
    sid = checkout_flow
    monkeypatch.setattr(groq_service, 'groq_chat', lambda *a, **k: None)
    cart_manager.add_item(sid, 'fixture-item', 'Món thử', 100000, quantity=2)
    agent_service.run_agent(sid, 'không thêm nữa', history=[])
    assert cart_manager.get_pending_action(sid)['type'] == 'select_voucher'
    before = deepcopy(cart_manager.get_cart(sid))
    decisions = []
    classify = pending_context.classify_pending_reply

    def observe(message, owner, evidence=None):
        result = classify(message, owner, evidence)
        decisions.append((owner, result))
        return result

    monkeypatch.setattr(pending_context, 'classify_pending_reply', observe)
    apply = Mock(side_effect=AssertionError('skip must not apply a voucher'))
    remove = Mock(side_effect=AssertionError('skip must not remove a voucher'))
    monkeypatch.setattr(voucher_tools, 'execute_apply_voucher', apply)
    monkeypatch.setattr(voucher_tools, 'execute_remove_voucher', remove)
    for name in ('add_item', 'update_item', 'remove_item', 'clear_cart'):
        if hasattr(cart_manager, name):
            monkeypatch.setattr(cart_manager, name, Mock(side_effect=AssertionError('cart write')))
    for name in ('execute_add_to_cart', 'execute_update_cart_item', 'execute_remove_cart_item', 'execute_clear_cart'):
        monkeypatch.setattr(cart_tools, name, Mock(side_effect=AssertionError('cart write tool')))
    monkeypatch.setattr(order_flow_graph, '_search_menu_catalog',
                        Mock(side_effect=AssertionError('shopping browse stole voucher reply')))
    monkeypatch.setattr(order_flow_graph, '_shopping_decision',
                        Mock(side_effect=AssertionError('shopping owner stole voucher reply')))
    result = agent_service.run_agent(sid, message, history=[])
    assert decisions == [('select_voucher', 'SKIP_VOUCHER')]
    prefs = cart_manager.get_checkout_prefs(sid)
    assert cart_manager.get_pending_action(sid) is None
    assert prefs['voucher_decided'] and prefs['flow_stage'] == 'CART_READY'
    assert not prefs.get('voucher_offer_pending') and not prefs.get('voucher_candidates')
    assert not prefs.get('voucher_code') and not prefs.get('checkout_requested')
    assert cart_manager.get_cart(sid)['items'] == before['items']
    assert cart_manager.get_cart(sid)['subtotal'] == before['subtotal']
    assert not result['checkout_payload'] and not result['tool_calls_log']
    apply.assert_not_called()
    remove.assert_not_called()
    continued = agent_service.run_agent(sid, 'tiếp tục', history=[])
    assert cart_manager.get_pending_action(sid)['type'] == 'select_checkout_choices'
    assert 'Hình thức nhận hàng' in continued['reply']
    assert 'Phương thức thanh toán' in continued['reply']
    assert not continued['checkout_payload']
    assert cart_manager.get_cart(sid)['items'] == before['items']
