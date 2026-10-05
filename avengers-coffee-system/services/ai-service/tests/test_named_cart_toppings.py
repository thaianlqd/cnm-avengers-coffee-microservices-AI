"""Reported named cake/coffee edits use fake Menu, cart, provider and transport."""
from copy import deepcopy
import json
import socket

import pytest
import requests

from test_llm_tool_orchestrator import runtime
from test_checkout_guarded_contract import calls, gateway
from src.agents.cart_edit_evidence import edit_plan, pending_option_followup
from src.common import cart_manager
from src.function_calling.tools import product_tools

MESSAGE = 'cho tôi bánh trung thu 2 cái, còn bạc xỉu thêm topping hạt sen và hạt nổ nhé'
GROUPS = [dict(name='Size', values=['Vừa'], required=True),
          dict(name='Topping', values=['Hạt Sen', 'Hạt Nổ Củ Năng', 'Hạt Nổ Yến Mạch', 'Syrup Tiramisu'], multiple=True),
          dict(name='Độ ngọt', values=['Ít ngọt', 'Thêm ngọt'])]
TOPPING_EDIT = ('update_cart_item', dict(cart_item_id='800', cart_line_ordinal=1,
    desired_state=dict(toppings=['Hạt Sen', 'Hạt Nổ Yến Mạch'])))
CAKE_EDIT = ('update_cart_item', dict(cart_item_id='801', cart_line_ordinal=2, desired_state=dict(quantity=2)))


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    def blocked(*args, **kwargs):
        raise AssertionError('No live transport in named cart-edit tests')
    for provider in ('GEMINI', 'OPENAI', 'GROQ', 'OPENROUTER', 'CEREBRAS'):
        monkeypatch.setenv(provider + '_API_KEY', '')
    monkeypatch.setattr(socket.socket, 'connect', blocked)
    monkeypatch.setattr(socket.socket, 'connect_ex', blocked)
    monkeypatch.setattr(socket, 'create_connection', blocked)
    monkeypatch.setattr(requests.sessions.Session, 'request', blocked)


@pytest.fixture
def cart(runtime, monkeypatch):
    for row, name in zip(runtime.products, ['Bạc Xỉu Nóng', 'Bánh Trung Thu Matcha', 'Mochi Kem Matcha']):
        row['product_name'] = name
    cart_manager.replace_items_from_order_cart(runtime.sid, [dict(row, id=800+i, quantity=1,
        size='Vừa' if i == 0 else 'Nhỏ', toppings=[], do_ngot='Ít ngọt' if i == 0 else None,
        unit_price=row['final_price']) for i, row in enumerate(runtime.products[:2])])
    def options(product_id, **kwargs):
        return dict(status='ok', product_id=product_id,
            product_name=runtime.products[int(product_id)-101]['product_name'],
            option_groups=deepcopy(GROUPS if product_id == '101' else []))
    monkeypatch.setattr(product_tools, 'execute_get_product_options', options)
    return runtime


@pytest.mark.parametrize('separator', [', còn ', ', ', ' và ', ' còn ', '; còn '])
def test_named_clauses_keep_quantity_and_toppings_on_their_original_lines(cart, separator):
    message = MESSAGE.replace(', còn ', separator)
    plan = edit_plan(message, gateway(cart, message).entry_cart_lines)
    assert [(row['cart_item_id'], row['fields']) for row in plan] == [('801', ['quantity']), ('800', ['toppings'])]
    assert 'hat sen va hat no' in plan[1]['clause']


@pytest.mark.parametrize('order', [(0, 1), (1, 0)])
def test_ambiguous_topping_asks_its_type_and_reports_partial_success_in_either_order(cart, order):
    operations = [CAKE_EDIT, TOPPING_EDIT]
    cart.provider.steps = [calls(*(deepcopy(operations[index]) for index in order))]
    result = cart.turn(MESSAGE)
    assert len(cart.provider.requests) == 1 and len(cart.writes) == 1
    rows = cart_manager.get_cart(cart.sid)['items']
    assert rows[1]['quantity'] == 2 and rows[0]['toppings'] == []
    assert 'một phần yêu cầu' in result['reply']
    assert 'Hạt Nổ Củ Năng' in result['reply'] and 'Hạt Nổ Yến Mạch' in result['reply']
    assert 'Hạt Sen' in result['reply'] and 'Bạc Xỉu Nóng' in result['reply']
    pending = cart_manager.get_checkout_prefs(cart.sid)['pending_cart_option_edit']
    assert pending['cart_item_id'] == '800' and pending['valid_values'] == ['Hạt Sen']


@pytest.mark.parametrize('answer', ['hạt nổ yến mạch nhé', 'yến mạch nhé', 'hạt nổ yến mạch đi bạn'])
@pytest.mark.parametrize('clear_memory', [False, True])
def test_short_followup_preserves_lotus_and_binds_to_the_saved_coffee_line(cart, answer, clear_memory):
    cart.provider.steps = [calls(CAKE_EDIT, TOPPING_EDIT)]
    cart.turn(MESSAGE)
    if clear_memory:
        cart.redis.data.clear()
    # Even when the model omits Hạt Sen, the saved customer choice must survive.
    edit = deepcopy(TOPPING_EDIT)
    edit[1]['desired_state']['toppings'] = ['Hạt Nổ Yến Mạch']
    cart.provider.steps = [calls(edit)]
    result = cart.turn(answer, client_message_id='chosen-topping')
    replay = cart.turn(answer, client_message_id='chosen-topping')
    assert result == replay and result['tool_calls_log'][-1]['result']['status'] == 'ok'
    rows = cart_manager.get_cart(cart.sid)['items']
    assert rows[0]['toppings'] == ['Hạt Sen', 'Hạt Nổ Yến Mạch'] and rows[1]['quantity'] == 2
    assert len(cart.writes) == 2 and len(cart.provider.requests) == 2
    assert not cart_manager.get_checkout_prefs(cart.sid).get('pending_cart_option_edit')


@pytest.mark.parametrize('include_toppings', [False, True])
def test_reported_followup_accepts_unchanged_full_line_but_only_writes_toppings(cart, include_toppings):
    cart.provider.steps = [calls(CAKE_EDIT, TOPPING_EDIT)]
    cart.turn(MESSAGE)
    before = deepcopy(cart_manager.get_cart(cart.sid)['items'])
    patch = dict(quantity=1, size='Vừa', do_ngot='Ít ngọt')
    if include_toppings:
        patch['toppings'] = ['Hạt Nổ Yến Mạch']
    cart.provider.steps = [calls(('update_cart_item', dict(cart_item_id='800',
        cart_line_ordinal=1, desired_state=patch)))]
    result = cart.turn('hạt nổ yến mạch đi bạn', client_message_id='full-line-followup')
    replay = cart.turn('hạt nổ yến mạch đi bạn', client_message_id='full-line-followup')
    assert result == replay
    applied = result['tool_calls_log'][-1]['result']
    assert applied['status'] == 'ok'
    assert applied['applied_state'] == dict(toppings=['Hạt Sen', 'Hạt Nổ Yến Mạch'])
    after = cart_manager.get_cart(cart.sid)['items']
    assert after[1] == before[1]
    for field in ('quantity', 'size', 'do_ngot', 'luong_da', 'loai_sua'):
        assert after[0].get(field) == before[0].get(field)
    assert after[0]['toppings'] == ['Hạt Sen', 'Hạt Nổ Yến Mạch']
    assert len(cart.provider.requests) == 2 and len(cart.writes) == 2
    assert not cart_manager.get_checkout_prefs(cart.sid).get('pending_cart_option_edit')


@pytest.mark.parametrize('extra', [dict(quantity=3), dict(size='Nhỏ'),
    dict(do_ngot='Thêm ngọt'), dict(luong_da='Ít đá'), dict(loai_sua='Sữa Yến Mạch')])
def test_followup_still_rejects_unrequested_changes_in_full_line(cart, extra):
    cart.provider.steps = [calls(CAKE_EDIT, TOPPING_EDIT)]
    cart.turn(MESSAGE)
    before = deepcopy(cart_manager.get_cart(cart.sid)['items'])
    result = gateway(cart, 'hạt nổ yến mạch đi bạn').dispatch('update_cart_item',
        dict(cart_item_id='800', desired_state=dict(toppings=['Hạt Nổ Yến Mạch'], **extra)))
    assert result['status'] == 'cart_fields_not_requested'
    assert cart_manager.get_cart(cart.sid)['items'] == before and len(cart.writes) == 1
    assert cart_manager.get_checkout_prefs(cart.sid).get('pending_cart_option_edit')


def test_complete_topping_name_applies_both_edits_without_clarification(cart):
    message = MESSAGE.replace('hạt nổ nhé', 'hạt nổ yến mạch nhé')
    cart.provider.steps = [calls(TOPPING_EDIT, CAKE_EDIT)]
    result = cart.turn(message)
    assert [row['result']['status'] for row in result['tool_calls_log']] == ['ok', 'ok']
    assert len(cart.provider.requests) == 1 and len(cart.writes) == 2
    assert cart_manager.get_cart(cart.sid)['items'][0]['toppings'] == ['Hạt Sen', 'Hạt Nổ Yến Mạch']


@pytest.mark.parametrize('order', [(0, 1), (1, 0)])
@pytest.mark.parametrize('explicit_topping', [False, True])
def test_initial_multi_edit_accepts_unchanged_fields_in_full_line_proposals(cart, order, explicit_topping):
    operations = [deepcopy(CAKE_EDIT), deepcopy(TOPPING_EDIT)]
    operations[0][1]['desired_state'].update(size='Nhỏ', toppings=[])
    operations[1][1]['desired_state'].update(quantity=1, size='Vừa', do_ngot='Ít ngọt')
    cart.provider.steps = [calls(*(operations[index] for index in order))]
    message = MESSAGE.replace('hạt nổ nhé', 'hạt nổ yến mạch nhé') if explicit_topping else MESSAGE
    result = cart.turn(message)
    if explicit_topping:
        assert [row['result']['status'] for row in result['tool_calls_log']] == ['ok', 'ok']
        assert len(cart.provider.requests) == 1 and len(cart.writes) == 2
        assert cart_manager.get_cart(cart.sid)['items'][0]['toppings'] == ['Hạt Sen', 'Hạt Nổ Yến Mạch']
        assert cart_manager.get_cart(cart.sid)['items'][1]['quantity'] == 2
        return
    assert [row['result']['status'] for row in result['tool_calls_log']] == (
        ['ok', 'invalid_option'] if order[0] == 0 else ['invalid_option', 'ok'])
    assert len(cart.provider.requests) == 1 and len(cart.writes) == 1
    assert cart.writes[0][2] == dict(quantity=2)
    assert 'một phần yêu cầu' in result['reply']
    assert 'Hạt Nổ Củ Năng' in result['reply'] and 'Hạt Nổ Yến Mạch' in result['reply']
    assert cart_manager.get_cart(cart.sid)['items'][0]['toppings'] == []


@pytest.mark.parametrize('extra', [dict(quantity=3), dict(size='Nhỏ'), dict(do_ngot='Thêm ngọt')])
def test_initial_multi_edit_rejects_actual_unrequested_configuration_changes(cart, extra):
    result = gateway(cart, MESSAGE).dispatch('update_cart_item',
        dict(cart_item_id='800', desired_state=dict(toppings=['Hạt Sen', 'Hạt Nổ Yến Mạch'], **extra)))
    assert result['status'] == 'cart_fields_not_requested' and not cart.writes


def test_provider_omitting_coffee_edit_cannot_report_complete_success(cart):
    cart.provider.steps = [calls(CAKE_EDIT), {'content': json.dumps(dict(
        response_kind='action', reply='Đã cập nhật tất cả món và topping.',
        mutation_claims=['update_cart_item'], evidence_quotes=[]))}, RuntimeError('provider unavailable')]
    result = cart.turn(MESSAGE)
    assert len(cart.writes) == 1
    assert cart_manager.get_cart(cart.sid)['items'][1]['quantity'] == 2
    assert cart_manager.get_cart(cart.sid)['items'][0]['toppings'] == []
    assert 'một phần yêu cầu' in result['reply'] and 'Còn chưa thực hiện' in result['reply']
    assert 'Bạc Xỉu Nóng' in result['reply'] and 'tất cả món' not in result['reply']


def test_model_cannot_move_the_cake_quantity_to_coffee(cart):
    result = gateway(cart, MESSAGE).dispatch('update_cart_item',
        dict(cart_item_id='800', cart_line_ordinal=1, desired_state=dict(quantity=2)))
    assert result['status'] == 'cart_fields_not_requested' and not cart.writes


@pytest.mark.parametrize('answer', ['hạt nổ yến mạch?', 'hạt nổ yến mạch là gì?',
    'không lấy hạt nổ yến mạch', 'xem hạt nổ yến mạch'])
def test_question_negation_and_browsing_cannot_complete_the_pending_edit(cart, answer):
    cart.provider.steps = [calls(CAKE_EDIT, TOPPING_EDIT)]
    cart.turn(MESSAGE)
    context = gateway(cart, answer)
    assert not context.cart_option_followup
    result = context.dispatch('update_cart_item', deepcopy(TOPPING_EDIT[1]))
    assert result['status'] == 'cart_change_not_requested' and len(cart.writes) == 1


def test_followup_cannot_retarget_a_different_line_or_add_quantity(cart):
    cart.provider.steps = [calls(CAKE_EDIT, TOPPING_EDIT)]
    cart.turn(MESSAGE)
    pending_gateway = gateway(cart, 'hạt nổ yến mạch nhé')
    wrong = pending_gateway.dispatch('update_cart_item',
        dict(cart_item_id='801', desired_state=dict(toppings=['Hạt Nổ Yến Mạch'])))
    assert wrong['status'] == 'cart_reference_conflict'
    expanded = pending_gateway.dispatch('update_cart_item',
        dict(cart_item_id='800', desired_state=dict(quantity=3, toppings=['Hạt Nổ Yến Mạch'])))
    assert expanded['status'] == 'cart_fields_not_requested' and len(cart.writes) == 1


def test_changed_cart_line_cannot_reuse_an_old_option_answer(cart):
    cart.provider.steps = [calls(CAKE_EDIT, TOPPING_EDIT)]
    cart.turn(MESSAGE)
    pending = cart_manager.get_checkout_prefs(cart.sid)['pending_cart_option_edit']
    rows = deepcopy(cart_manager.get_cart(cart.sid)['items'])
    rows[0]['toppings'] = ['Syrup Tiramisu']
    cart_manager.replace_items_from_order_cart(cart.sid, rows)
    assert pending_option_followup('hạt nổ yến mạch', pending,
                                   gateway(cart, 'hạt nổ yến mạch').entry_cart_lines) is None
    result = gateway(cart, 'hạt nổ yến mạch').dispatch('update_cart_item', deepcopy(TOPPING_EDIT[1]))
    assert result['status'] == 'cart_change_not_requested' and len(cart.writes) == 1
