"""Selected-product customization uses scripted providers and memory services only."""
from copy import deepcopy
import socket

import pytest
import requests

from test_llm_tool_orchestrator import runtime
from test_checkout_guarded_contract import calls, content, gateway
from src.agents.agent_memory import ConversationMemory, empty_memory
from src.common import cart_manager


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    def blocked(*args, **kwargs):
        raise AssertionError('No live transport in custom-option regressions')
    monkeypatch.setattr(socket.socket, 'connect', blocked)
    monkeypatch.setattr(socket.socket, 'connect_ex', blocked)
    monkeypatch.setattr(socket, 'create_connection', blocked)
    monkeypatch.setattr(socket, 'getaddrinfo', blocked)
    monkeypatch.setattr(requests.sessions.Session, 'request', blocked)


def choose_first_product(runtime, quantity=1):
    runtime.products[0]['product_name'] = 'Bạc Xỉu Nóng'
    cart_manager.replace_items_from_order_cart(runtime.sid, [])
    ConversationMemory(runtime.redis).save(runtime.sid, {**empty_memory(),
        'visible_snapshots': {'products': runtime.products}})
    runtime.provider.steps = [calls(('add_to_cart', {'product_id': '101', 'quantity': quantity, 'use_defaults': True}))]
    result = runtime.turn('tôi muốn mua món số 1 á bạn' + (f', {quantity} ly' if quantity != 1 else ''))
    assert result['tool_calls_log'][-1]['result']['status'] == 'defaults_not_authorized'
    assert not runtime.writes
    return result


def test_default_choice_question_preserves_selected_product_and_quantity(runtime):
    choose_first_product(runtime, quantity=2)
    staged = cart_manager.get_checkout_prefs(runtime.sid)['pending_products']
    assert [(row['product_id'], row['quantity']) for row in staged] == [('101', 2)]
    assert 'size' not in staged[0] and 'toppings' not in staged[0]
    assert cart_manager.get_pending_action(runtime.sid)['type'] == 'fill_options'


@pytest.mark.parametrize('phrase', ['tự chọn', 'tự chọn nhé', 'mình muốn tự chọn', 'cho tôi tự chọn đi'])
@pytest.mark.parametrize('read_first', [True, False])
def test_custom_choice_shows_menu_without_applying_model_guesses(runtime, phrase, read_first):
    choose_first_product(runtime, quantity=2)
    operations = [('get_product_options', {'product_id': '101'})] if read_first else []
    # Match the reported model proposal: it guesses a size before the user picks one.
    operations.append(('add_to_cart', {'product_id': '101', 'quantity': 2, 'size': 'M'}))
    runtime.provider.steps = [calls(*operations), content()]
    result = runtime.turn(phrase)
    assert 'Bạc Xỉu Nóng' in result['reply'] and '**Size**' in result['reply']
    assert 'Pearl' in result['reply'] and 'Foam' in result['reply']
    assert 'tên món hoặc số' not in result['reply']
    assert not runtime.writes and not cart_manager.get_cart(runtime.sid)['items']
    staged = cart_manager.get_checkout_prefs(runtime.sid)['pending_products'][0]
    assert staged['quantity'] == 2 and 'size' not in staged and staged.get('toppings', []) == []
    assert ConversationMemory(runtime.redis).load(runtime.sid)['focus']['product']['source'] == 'customer_selected_options'
    runtime.provider.steps = [calls(('add_to_cart', {'product_id': '101', 'quantity': 2, 'size': 'L'}))]
    completed = runtime.turn('size L nhé')
    assert completed['tool_calls_log'][-1]['result']['status'] == 'ok'
    assert len(runtime.writes) == 1
    assert runtime.writes[0][1]['quantity'] == 2 and runtime.writes[0][1]['size'] == 'L'
    assert runtime.writes[0][1]['toppings'] == []


def test_custom_followup_survives_missing_redis_memory(runtime):
    choose_first_product(runtime, quantity=2)
    runtime.redis.data.clear()
    runtime.provider.steps = [calls(('add_to_cart', {'product_id': '101', 'size': 'M'}))]
    result = runtime.turn('tự chọn')
    assert result['tool_calls_log'][-1]['result']['status'] == 'needs_options'
    assert '**Size**' in result['reply'] and not runtime.writes
    assert cart_manager.get_checkout_prefs(runtime.sid)['pending_products'][0]['quantity'] == 2


def test_custom_choice_cannot_authorize_a_different_product(runtime):
    choose_first_product(runtime)
    before = deepcopy(cart_manager.get_checkout_prefs(runtime.sid)['pending_products'])
    result = gateway(runtime, 'tự chọn').dispatch('add_to_cart', {'product_id': '102', 'size': 'M'})
    assert result['status'] == 'product_choice_required' and not runtime.writes
    assert cart_manager.get_checkout_prefs(runtime.sid)['pending_products'] == before


def test_custom_choice_without_selection_cannot_add_a_catalog_candidate(runtime):
    ConversationMemory(runtime.redis).save(runtime.sid, {**empty_memory(),
        'visible_snapshots': {'products': runtime.products}})
    result = gateway(runtime, 'tự chọn').dispatch('add_to_cart', {'product_id': '101', 'size': 'M'})
    assert result['status'] == 'product_choice_required' and not runtime.writes


def test_default_followup_keeps_quantity_after_choice_question(runtime):
    choose_first_product(runtime, quantity=2)
    runtime.provider.steps = [calls(('add_to_cart', {'product_id': '101', 'quantity': 2, 'use_defaults': True}))]
    result = runtime.turn('theo mặc định nhé')
    assert result['tool_calls_log'][-1]['result']['status'] == 'ok'
    assert len(runtime.writes) == 1 and runtime.writes[0][1]['quantity'] == 2


def test_choice_question_keeps_explicit_options_and_rejects_model_guesses(runtime):
    runtime.provider.steps = [calls(('add_to_cart', {'product_id': '101', 'quantity': 2,
        'size': 'M', 'toppings': ['Pearl'], 'use_defaults': True}))]
    result = runtime.turn('tôi muốn mua món số 1, 2 ly size L nhé')
    assert result['tool_calls_log'][-1]['result']['status'] == 'defaults_not_authorized'
    staged = cart_manager.get_checkout_prefs(runtime.sid)['pending_products'][0]
    assert staged['size'] == 'L' and staged['quantity'] == 2 and 'toppings' not in staged
    runtime.provider.steps = [calls(('add_to_cart', {'product_id': '101', 'size': 'M'}))]
    result = runtime.turn('tự chọn')
    assert 'Size' in result['reply'] and not runtime.writes
    assert cart_manager.get_checkout_prefs(runtime.sid)['pending_products'][0]['size'] == 'L'


@pytest.fixture(autouse=True)
def exercise_scripted_gateway_without_language_shortcuts(monkeypatch):
    # This module qualifies explicit provider proposals and gateway denials.
    # The legacy phrase router must not preempt the proposal under test;
    # production semantic mode never executes that router either.
    from src.agents import llm_tool_orchestrator
    monkeypatch.setattr(llm_tool_orchestrator, '_legacy_language_control', lambda *a: None)
