"""Reported three-line edit replay with fake Menu, cart and model providers."""
from copy import deepcopy
import socket

import pytest

from test_llm_tool_orchestrator import runtime
from test_checkout_guarded_contract import calls, gateway
from src.agents.cart_edit_evidence import edit_plan
from src.agents.option_state import validate_explicit_multi_value_group
from src.common import cart_manager
from src.function_calling.tools import product_tools

MESSAGE = ('tôi k muốn lấy món 2 nữa, món 1 tôi muốn topping hạt sen và tiramisu '
           'thêm ngọt nhé, món 3 thì 2 cái nhé bạn')
GROUPS = [dict(name='Size', values=['Vừa'], required=True),
          dict(name='Topping', values=['Hạt Sen', 'Syrup Tiramisu', 'Sữa Tươi'], multiple=True),
          dict(name='Độ ngọt', values=['Ít ngọt', 'Thêm ngọt', 'Không ngọt', 'Bình thường'])]
EDITS = [('remove_cart_item', dict(cart_item_id='801', cart_line_ordinal=2)),
         ('update_cart_item', dict(cart_item_id='800', cart_line_ordinal=1,
             desired_state=dict(toppings=['Hạt Sen', 'Syrup Tiramisu'], do_ngot='Thêm ngọt'))),
         ('update_cart_item', dict(cart_item_id='802', cart_line_ordinal=3, desired_state=dict(quantity=2)))]


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail('Real network is forbidden in the cart replay')
    monkeypatch.setattr(socket.socket, 'connect', forbidden)
    monkeypatch.setattr(socket.socket, 'connect_ex', forbidden)
    monkeypatch.setattr(socket, 'getaddrinfo', forbidden)


@pytest.fixture
def cart(runtime, monkeypatch):
    names = ['Bạc Xỉu Nóng', 'Cà Phê Muối Avenger', 'Bánh Trung Thu Matcha']
    for row, name in zip(runtime.products, names):
        row['product_name'] = name
    cart_manager.replace_items_from_order_cart(runtime.sid, [dict(row, id=800+i,
        quantity=1, size='Vừa' if i == 0 else 'Nhỏ', toppings=[], do_ngot='Ít ngọt' if i == 0 else None,
        unit_price=row['final_price']) for i, row in enumerate(runtime.products)])
    monkeypatch.setattr(product_tools, 'execute_get_product_options', lambda product_id, **kwargs:
        dict(status='ok', product_id=product_id, product_name=runtime.products[int(product_id)-101]['product_name'],
             option_groups=deepcopy(GROUPS)))
    return runtime


def test_reported_sentence_has_three_independent_original_cart_targets(cart):
    plan = edit_plan(MESSAGE, gateway(cart, MESSAGE).entry_cart_lines)
    assert [(row['tool'], row['cart_item_id'], row['fields']) for row in plan] == [
        ('remove_cart_item', '801', []), ('update_cart_item', '800', ['toppings', 'do_ngot']),
        ('update_cart_item', '802', ['quantity'])]


@pytest.mark.parametrize('order', [(0, 1, 2), (2, 0, 1), (1, 2, 0)])
def test_all_three_changes_complete_without_another_model_request(cart, order):
    cart.provider.steps = [calls(*(deepcopy(EDITS[index]) for index in order))]
    result = cart.turn(MESSAGE)
    assert result['error'] is None
    assert [row['result']['status'] for row in result['tool_calls_log']] == ['ok'] * 3
    rows = cart_manager.get_cart(cart.sid)['items']
    assert [(row['product_name'], row['quantity']) for row in rows] == [('Bạc Xỉu Nóng', 1), ('Bánh Trung Thu Matcha', 2)]
    assert rows[0]['toppings'] == ['Hạt Sen', 'Syrup Tiramisu'] and rows[0]['do_ngot'] == 'Thêm ngọt'
    assert rows[0]['size'] == 'Vừa' and rows[1]['size'] == 'Nhỏ' and rows[1]['toppings'] == []
    assert len(cart.provider.requests) == 1 and cart.provider.requests[0]['max_tokens'] == 600


def test_literal_sweetness_and_complete_topping_list_override_model_omissions(cart):
    edits = deepcopy(EDITS)
    edits[1][1]['desired_state'] = dict(toppings=['Hạt Sen'])
    cart.provider.steps = [calls(*edits)]
    result = cart.turn(MESSAGE)
    assert result['error'] is None and len(cart.provider.requests) == 1
    first = cart_manager.get_cart(cart.sid)['items'][0]
    assert first['toppings'] == ['Hạt Sen', 'Syrup Tiramisu'] and first['do_ngot'] == 'Thêm ngọt'


@pytest.mark.parametrize('message', ['tôi k muốn lấy món 2 nữa', 'mình không lấy món số 2 nữa'])
def test_declining_an_existing_item_authorizes_its_removal(cart, message):
    result = gateway(cart, message).dispatch('remove_cart_item', dict(cart_item_id='801', cart_line_ordinal=2))
    assert result['status'] == 'ok'
    assert [str(row['cart_item_id']) for row in cart_manager.get_cart(cart.sid)['items']] == ['800', '802']


@pytest.mark.parametrize('message', ['đừng xóa món 2', 'tôi không muốn bỏ món 2',
    'tôi không muốn thêm món 2', 'không lấy topping', 'tại sao bạn xóa món 2?', 'không lấy món 2 nữa có được không?'])
def test_negating_an_edit_or_asking_a_question_does_not_remove(cart, message):
    result = gateway(cart, message).dispatch('remove_cart_item', dict(cart_item_id='801'))
    assert result['status'] == 'cart_change_not_requested' and not cart.writes


def test_ambiguous_tiramisu_does_not_authorize_a_guessed_topping(cart):
    group = {**GROUPS[1], 'values': ['Hạt Sen', 'Syrup Tiramisu', 'Foam Tiramisu']}
    result = validate_explicit_multi_value_group('topping hạt sen và tiramisu thêm ngọt nhé', group,
        [GROUPS[0], group, GROUPS[2]])
    assert result['valid_values'] == ['Hạt Sen'] and result['invalid_values'] == ['tiramisu']


def test_wrong_quantity_cannot_be_taken_from_another_clause(cart):
    result = gateway(cart, MESSAGE).dispatch('update_cart_item',
        dict(cart_item_id='800', cart_line_ordinal=1, desired_state=dict(quantity=2)))
    assert result['status'] != 'ok' and not cart.writes


@pytest.mark.parametrize('toppings', ['hạt sen, tiramisu thêm ngọt nhé',
    'hạt sen và tiramisu thêm ngọt nhé', 'hạt sen và syrup tiramisu nhé bạn'])
def test_topping_list_keeps_all_values_and_courtesy_words(cart, toppings):
    message = 'món 1 tôi muốn topping ' + toppings + ', món 3 thì 2 cái nhé bạn'
    args = deepcopy(EDITS[1][1])
    if 'ngọt' not in toppings:
        args['desired_state'].pop('do_ngot')
    result = gateway(cart, message).dispatch('update_cart_item', args)
    assert result['status'] == 'ok'
    assert cart_manager.get_cart(cart.sid)['items'][0]['toppings'] == ['Hạt Sen', 'Syrup Tiramisu']


def test_unknown_comma_separated_topping_cannot_be_silently_omitted(cart):
    message = 'món 1 tôi muốn topping hạt sen, foam dừa thêm ngọt nhé, món 3 thì 2 cái'
    result = gateway(cart, message).dispatch('update_cart_item',
        dict(cart_item_id='800', desired_state=dict(toppings=['Hạt Sen'], do_ngot='Thêm ngọt')))
    assert result['status'] == 'invalid_option' and not cart.writes
