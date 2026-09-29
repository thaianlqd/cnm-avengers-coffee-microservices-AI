"""A missing ordinal in a mixed menu choice must remain pending."""
import uuid

import pytest

from src.agents import order_flow_graph
from src.common import cart_manager
from src.function_calling.tools import cart_tools, product_tools


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
