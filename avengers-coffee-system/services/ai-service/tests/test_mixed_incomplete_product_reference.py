"""A missing ordinal in a mixed menu choice must remain pending."""
import uuid

import pytest

from src.agents import order_flow_graph
from src.common import cart_manager
from src.function_calling.tools import cart_tools, product_tools


def _pending_drink(monkeypatch):
    session = 'mixed-cancel-' + uuid.uuid4().hex
    food = [{'product_id': f'F{i}', 'product_name': f'Bánh {i}', 'category': 'food',
             'display_index': i} for i in range(1, 9)]
    drink = [{'product_id': f'D{i}', 'product_name': f'Nước {i}', 'category': 'drink',
              'display_index': i} for i in range(9, 16)]
    cart_manager.set_checkout_context(session, last_product_suggestions=food + drink,
        product_suggestion_snapshots={'food': food, 'drink': drink})
    monkeypatch.setattr(cart_tools, 'sync_authoritative_cart', lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(product_tools, 'execute_get_product_options', lambda name: {
        'status': 'ok', 'product_name': name, 'options': {'Size': ['Nhỏ', 'Vừa']}})
    order_flow_graph.run_order_flow(session, 'cho tôi bánh số và nước số 10')
    assert cart_manager.get_checkout_prefs(session)['pending_product_reference'] == ['food']
    return session


@pytest.mark.parametrize('reply', [
    'thôi không lấy bánh nữa', 'không lấy bánh nữa', 'bỏ bánh đi',
    'thôi chỉ lấy nước số 10', 'nước thôi', 'không cần bánh',
    'thôi không lấy bánh nữa, chỉ lấy nước thôi',
])
def test_cancel_missing_reference_keeps_valid_drink_and_resumes_options(monkeypatch, reply):
    session = _pending_drink(monkeypatch)
    result = order_flow_graph.run_order_flow(session, reply)
    prefs = cart_manager.get_checkout_prefs(session)
    assert not prefs.get('pending_product_reference')
    assert [item['product_id'] for item in prefs['pending_products']] == ['D10']
    assert 'Size' in result['reply'] and 'bánh số mấy' not in result['reply']
    assert cart_manager.get_pending_action(session)['type'] == 'fill_options'


def test_abandon_entire_incomplete_batch_without_cart_mutation(monkeypatch):
    session = _pending_drink(monkeypatch)
    monkeypatch.setattr(cart_tools, 'execute_add_to_cart', lambda **_: pytest.fail('unexpected cart mutation'))
    result = order_flow_graph.run_order_flow(session, 'thôi bỏ cả hai')
    prefs = cart_manager.get_checkout_prefs(session)
    assert not prefs.get('pending_product_reference')
    assert not prefs.get('pending_products')
    assert cart_manager.get_pending_action(session) is None
    assert 'không giữ' in result['reply']


@pytest.mark.parametrize('reply', ['thôi đổi sang nước số 11', 'thôi chỉ lấy nước số 11', 'nước số 11'])
def test_independent_explicit_selection_replaces_unfinished_batch(monkeypatch, reply):
    session = _pending_drink(monkeypatch)
    result = order_flow_graph.run_order_flow(session, reply)
    prefs = cart_manager.get_checkout_prefs(session)
    assert not prefs.get('pending_product_reference')
    assert [item['product_id'] for item in prefs['pending_products']] == ['D11']
    assert 'Nước 11' in result['reply']


def test_unrelated_menu_request_closes_unfinished_batch(monkeypatch):
    session = _pending_drink(monkeypatch)
    monkeypatch.setattr(cart_tools, 'execute_add_to_cart', lambda **_: pytest.fail('unexpected cart mutation'))
    result = order_flow_graph.run_order_flow(session, 'xem menu nước')
    prefs = cart_manager.get_checkout_prefs(session)
    assert not prefs.get('pending_product_reference')
    assert not prefs.get('pending_products')
    assert 'bánh số mấy' not in result['reply']


def test_checkout_gate_releases_missing_reference_after_cancel(monkeypatch):
    session = _pending_drink(monkeypatch)
    def cart(_sid):
        return {'is_empty': False, 'items': [{'product_id': 'D10'}], 'branch_id': None,
                'checkout_prefs': cart_manager.get_checkout_prefs(session)}
    monkeypatch.setattr(cart_tools, 'sync_authoritative_cart', cart)
    assert 'bánh' in cart_tools.execute_request_checkout(session)['message']
    order_flow_graph.run_order_flow(session, 'không cần bánh')
    assert 'bánh' not in cart_tools.execute_request_checkout(session)['message']
    cart_manager.set_pending_products(session, [])  # The remaining drink options have been completed.
    assert cart_tools.execute_request_checkout(session)['status'] != 'pending_products'


def test_pending_reference_does_not_swallow_cart_view_or_clear(monkeypatch):
    session = _pending_drink(monkeypatch)
    cart_manager.add_item(session, 'EXISTING', 'Món trong giỏ', 35000)
    monkeypatch.setattr(cart_tools, 'execute_get_cart_quote', lambda sid: {
        'status': 'ok', 'cart': cart_manager.get_cart(sid), 'quote': {'total': 35000}})
    viewed = order_flow_graph.run_order_flow(session, 'xem giỏ')
    assert any(log['tool'] == 'get_cart_quote' for log in viewed['tool_calls_log'])
    assert 'chưa được thêm' in viewed['reply']
    prefs = cart_manager.get_checkout_prefs(session)
    assert prefs['pending_product_reference'] == ['food']
    assert [item['product_id'] for item in prefs['pending_products']] == ['D10']

    asked = order_flow_graph.run_order_flow(session, 'xóa giỏ')
    assert 'đồng ý xoá giỏ' in asked['reply']
    assert cart_manager.get_pending_action(session)['type'] == 'clear_cart'
    def clear(sid):
        cart_manager.clear_cart(sid)
        return {'status': 'ok', 'message': 'Đã xoá toàn bộ giỏ hàng.'}
    monkeypatch.setattr(cart_tools, 'execute_clear_cart', clear)
    confirmed = order_flow_graph.run_order_flow(session, 'đồng ý xoá giỏ')
    assert any(log['tool'] == 'clear_cart' and log['result']['status'] == 'ok'
               for log in confirmed['tool_calls_log'])
    assert cart_manager.get_cart(session)['is_empty']
    after = cart_manager.get_checkout_prefs(session)
    assert not after.get('pending_product_reference') and not after.get('pending_products')
    assert cart_manager.get_pending_action(session) is None


def test_pending_reference_preserves_draft_during_explicit_cart_edit(monkeypatch):
    session = _pending_drink(monkeypatch)
    cart_manager.add_item(session, 'EXISTING', 'Món trong giỏ', 35000)
    monkeypatch.setattr(cart_tools, 'execute_get_cart_quote', lambda sid: {
        'status': 'ok', 'cart': cart_manager.get_cart(sid), 'quote': {'total': 35000}})
    # The authoritative cart handler may ask for an exact cart row; the draft remains.
    result = order_flow_graph.run_order_flow(session, 'xoá món trong giỏ')
    assert 'bánh số mấy' not in result['reply']
    assert cart_manager.get_checkout_prefs(session)['pending_product_reference'] == ['food']


@pytest.mark.parametrize('message,missing,valid', [
    ('cho tôi bánh số và nước số 10', 'food', 'D10'),
    ('nước số và bánh số 3', 'drink', 'F3'),
    ('cho tôi bánh thứ ... và nước số 9', 'food', 'D9'),
])
def test_mixed_incomplete_reference_keeps_valid_choice(monkeypatch, message, missing, valid):
    session = 'mixed-reference-' + uuid.uuid4().hex
    food = [{'product_id': f'F{i}', 'product_name': f'Bánh {i}', 'category': 'food',
             'display_index': i} for i in range(1, 9)]
    drink = [{'product_id': f'D{i}', 'product_name': f'Nước {i}', 'category': 'drink',
              'display_index': i} for i in range(9, 16)]
    cart_manager.set_checkout_context(session, last_product_suggestions=food + drink,
        product_suggestion_snapshots={'food': food, 'drink': drink})
    monkeypatch.setattr(cart_tools, 'sync_authoritative_cart', lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(product_tools, 'execute_get_product_options', lambda name: {
        'status': 'ok', 'product_name': name, 'options': {'Size': ['Nhỏ', 'Vừa']}})
    monkeypatch.setattr(cart_tools, 'execute_add_to_cart', lambda **kwargs: pytest.fail('cart written before missing ordinal'))

    first = order_flow_graph.run_order_flow(session, message)
    prefs = cart_manager.get_checkout_prefs(session)
    assert prefs['pending_product_reference'] == [missing]
    assert [item['product_id'] for item in prefs['pending_products']] == [valid]
    assert 'số mấy' in first['reply'] and 'ghi nhận đủ 1 món' not in first['reply']
    assert f"{'bánh' if valid.startswith('F') else 'nước'} số {valid[1:]}" in first['reply']

    follow_up = 'bánh số 3' if missing == 'food' else 'nước số 10'
    second = order_flow_graph.run_order_flow(session, follow_up)
    prefs = cart_manager.get_checkout_prefs(session)
    assert not prefs.get('pending_product_reference')
    assert {item['product_id'] for item in prefs['pending_products']} == {valid, 'F3' if missing == 'food' else 'D10'}
    assert 'Size' in second['reply']
    assert 'Bánh 3' in second['reply']
    assert f"Nước {valid[1:] if missing == 'food' else '10'}" in second['reply']

    added = []
    def price(**kwargs):
        name = kwargs['product_name_query']
        product_id = ('F' if name.startswith('Bánh') else 'D') + name.split()[-1]
        return {'status': 'ok', 'products': [{
            'product_id': product_id, 'product_name': name, 'final_price': 50000}]}
    monkeypatch.setattr(product_tools, 'execute_check_price_and_stock', price)
    monkeypatch.setattr(cart_tools, 'execute_add_to_cart', lambda **kwargs: added.append(kwargs) or {
        'status': 'ok', 'message': 'Đã thêm', 'cart': {'total_price': 50000}})
    order_flow_graph.run_order_flow(session, 'theo mặc định')
    assert {item['product_id'] for item in added} == {valid, 'F3' if missing == 'food' else 'D10'}
    assert len(added) == 2
