"""Reported mixed requests: fake inference, Menu, Order, DB and Redis only."""
from copy import deepcopy
import socket

import pytest
import requests

from test_llm_tool_orchestrator import runtime
from test_checkout_guarded_contract import calls, content, gateway
from src.agents.agent_memory import ConversationMemory, empty_memory
from src.agents.cart_edit_evidence import edit_plan
from src.common import cart_manager
from src.function_calling.tools import product_tools, cart_tools

MESSAGE = ('món bạc xỉu nãy tôi quên cho topping cho tôi hạt sen và sữa tươi nhé, '
           'còn bánh trung thu tôi muốn 2 cáo')
EDITS = [('update_cart_item', dict(cart_item_id='800', cart_line_ordinal=1,
             desired_state=dict(toppings=['Hạt Sen', 'Sữa Tươi']))),
         ('update_cart_item', dict(cart_item_id='801', cart_line_ordinal=2,
             desired_state=dict(quantity=2)))]


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    def blocked(*args, **kwargs):
        raise AssertionError('No real network in mixed-cart regressions')
    monkeypatch.setattr(socket.socket, 'connect', blocked)
    monkeypatch.setattr(socket.socket, 'connect_ex', blocked)
    monkeypatch.setattr(socket, 'create_connection', blocked)
    monkeypatch.setattr(socket, 'getaddrinfo', blocked)
    monkeypatch.setattr(requests.sessions.Session, 'request', blocked)


@pytest.fixture
def cart(runtime, monkeypatch):
    names = ['Bạc Xỉu Nóng', 'Bánh Trung Thu Matcha', 'Mochi Kem Matcha']
    prices = [39000, 99000, 19000]
    for row, name, price in zip(runtime.products, names, prices):
        row.update(product_name=name, final_price=price, category='drink' if row['product_id'] == '101' else 'food')
    cart_manager.replace_items_from_order_cart(runtime.sid, [dict(row, id=800+i,
        quantity=1, size='Vừa' if i != 1 else 'Nhỏ', toppings=[],
        do_ngot='Ít ngọt' if i == 0 else None, unit_price=row['final_price'])
        for i, row in enumerate(runtime.products[:2])])
    ConversationMemory(runtime.redis).save(runtime.sid, {**empty_memory(),
        'visible_snapshots': {'products': runtime.products}})
    def options(product_id, **kwargs):
        row = next(row for row in runtime.products if row['product_id'] == product_id)
        return dict(status='ok', product_id=product_id, product_name=row['product_name'], option_groups=[
            dict(name='Kích thước', values=['Vừa'], required=True),
            dict(name='Topping', values=['Hạt Sen', 'Sữa Tươi', 'Foam Dừa'], multiple=True),
            dict(name='Độ ngọt', values=['Ít ngọt', 'Thêm ngọt', 'Không ngọt', 'Bình thường'])])
    monkeypatch.setattr(product_tools, 'execute_get_product_options', options)
    def quote(sid):
        snapshot = deepcopy(cart_manager.get_cart(sid))
        for row in snapshot['items']:
            if row['product_id'] == '101':
                row['unit_price'] = 54000 if row.get('toppings') else 39000
            row['line_total'] = row['quantity'] * row['unit_price']
        total = sum(row['line_total'] for row in snapshot['items'])
        return dict(status='ok', cart=snapshot, quote=dict(items=deepcopy(snapshot['items']),
            subtotal=total, final_total=total, discount_amount=0))
    monkeypatch.setattr(cart_tools, 'execute_get_cart_quote', quote)
    return runtime


def test_named_topping_and_quantity_requests_have_separate_targets(cart):
    plan = edit_plan(MESSAGE, gateway(cart, MESSAGE).entry_cart_lines)
    assert [(row['cart_item_id'], row['fields']) for row in plan] == [
        ('800', ['toppings']), ('801', ['quantity'])]


@pytest.mark.parametrize('order', [(0, 1), (1, 0)])
def test_both_reported_changes_are_applied_and_shown_in_same_reply(cart, order):
    cart.provider.steps = [calls(*(deepcopy(EDITS[index]) for index in order))]
    result = cart.turn(MESSAGE)
    assert [row['result']['status'] for row in result['tool_calls_log']] == ['ok', 'ok']
    assert len(cart.writes) == 2 and len(cart.provider.requests) == 1
    assert 'Topping: Hạt Sen, Sữa Tươi' in result['reply'] and '54.000đ' in result['reply']
    assert '×2 — 198.000đ' in result['reply'] and '252.000đ' in result['reply']
    assert result['ui_payload']['cart']['items'][0]['toppings'] == ['Hạt Sen', 'Sữa Tươi']


def test_quantity_only_success_is_reported_as_partial_with_missing_topping(cart):
    cart.provider.steps = [calls(deepcopy(EDITS[1])), content()]
    result = cart.turn(MESSAGE)
    assert 'một phần yêu cầu' in result['reply']
    assert '**Còn chưa thực hiện:**' in result['reply'] and '**Bạc Xỉu Nóng**' in result['reply']
    assert len(cart.writes) == 1


def test_old_topping_request_cannot_run_during_new_mochi_removal(cart):
    rows = cart_manager.get_cart(cart.sid)['items']
    cart_manager.replace_items_from_order_cart(cart.sid, [*rows,
        dict(cart.products[2], id=802, quantity=1, size='Vừa', toppings=[], unit_price=19000)])
    cart.provider.steps = [calls(('remove_cart_item', dict(cart_item_id='802', cart_line_ordinal=3)),
        deepcopy(EDITS[0])), content()]
    result = cart.turn('tôi k muốn lấy bánh mochi nữa')
    assert result['tool_calls_log'][0]['result']['status'] == 'ok'
    assert result['tool_calls_log'][1]['result']['status'] == 'cart_change_not_requested'
    assert [row[0] for row in cart.writes] == ['remove']
    assert cart_manager.get_cart(cart.sid)['items'][0]['toppings'] == []
    assert 'đã xóa' in result['reply'].lower()


@pytest.mark.parametrize('message', [
    'món bạc xỉu tôi muốn topping hạt sen và sữa tươi nhé, còn bánh trung thu tôi muốn 2 cái',
    'món bạc xỉu tôi muốn topping hạt sen và sữa tươi nhé; bánh trung thu tôi muốn 2 cái',
    'sửa bạc xỉu topping hạt sen và sữa tươi nhé, còn bánh trung thu 2 cái',
])
def test_named_options_and_cake_quantity_do_not_leak_across_clauses(cart, message):
    first = gateway(cart, message).dispatch('update_cart_item', deepcopy(EDITS[0][1]))
    assert first['status'] == 'ok'
    second = gateway(cart, message).dispatch('update_cart_item', deepcopy(EDITS[1][1]))
    assert second['status'] == 'ok'
    rows = cart_manager.get_cart(cart.sid)['items']
    assert rows[0]['quantity'] == 1 and rows[0]['toppings'] == ['Hạt Sen', 'Sữa Tươi']
    assert rows[1]['quantity'] == 2 and rows[1]['toppings'] == []


@pytest.mark.parametrize('order', [(0, 1), (1, 0)])
def test_default_coffee_plus_matcha_cakes_lists_same_products_in_reply_and_cards(cart, order):
    cart_manager.replace_items_from_order_cart(cart.sid, [])
    operations = [('add_to_cart', dict(product_id='101', use_defaults=True)),
                  ('filter_catalog', dict(category='food', search_text='matcha'))]
    cart.provider.steps = [calls(*(operations[index] for index in order)), content()]
    result = cart.turn('theo mặc định là oke rồi bạn, tôi còn muốn mua thêm bánh matcha',
        selected_product_id='101')
    cards = result['ui_payload']['products']
    assert [row['product_name'] for row in cards] == ['Mochi Kem Matcha', 'Bánh Trung Thu Matcha']
    assert 'Giỏ hàng của bạn' in result['reply'] and '39.000đ' in result['reply']
    for row in cards:
        assert f"{row['display_index']}. **{row['product_name']}**" in result['reply']
    assert '19.000đ' in result['reply'] and '99.000đ' in result['reply']
    assert len(cart.writes) == 1 and cart.writes[0][1]['product_id'] == '101'


@pytest.mark.parametrize('message', ['tôi muốn mua 2 cái bánh trung thu',
    'thêm 2 bánh trung thu nhé', 'đặt 2 cái bánh trung thu nhé'])
def test_explicit_purchase_is_not_planned_as_an_existing_line_quantity_edit(cart, message):
    assert edit_plan(message, gateway(cart, message).entry_cart_lines) == []


def test_short_named_topping_reference_requires_one_cart_line(cart):
    rows = cart_manager.get_cart(cart.sid)['items']
    cart_manager.replace_items_from_order_cart(cart.sid, [*rows, dict(rows[0], id=803,
        cart_item_id='803', line_id='803', toppings=['Foam Dừa'])])
    result = gateway(cart, 'bạc xỉu tôi muốn topping hạt sen và sữa tươi').dispatch(
        'update_cart_item', deepcopy(EDITS[0][1]))
    assert result['status'] == 'ambiguous_cart_target' and not cart.writes


def test_polite_topping_request_still_rejects_unknown_values(cart):
    result = gateway(cart, 'bạc xỉu topping cho tôi hạt sen và foam lạ nhé').dispatch(
        'update_cart_item', dict(cart_item_id='800', desired_state=dict(toppings=['Hạt Sen'])))
    assert result['status'] == 'invalid_option' and not cart.writes
