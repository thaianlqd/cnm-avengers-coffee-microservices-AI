"""Server facts establish obligations; they do not reinterpret new user intent."""
from copy import deepcopy
from types import SimpleNamespace
import pytest
from src.agents.turn_contract import TurnContract, state_obligation, validate_turn_progress
from src.agents.semantic_registry import operation_registry
from test_semantic_control import runtime, compatibility_runtime, gateway_for
from test_semantic_registry_contract import calls
from src.common import cart_manager
from src.function_calling import tools


@pytest.mark.parametrize('business,visible,expected', [
    ({}, {}, None),
    ({'pending_products': [{'product_id': '101'}]}, {}, 'PRODUCT_CONFIGURATION'),
    ({'pending_products': [{'product_id': '101'}, {'product_id': '102'}]}, {}, 'PRODUCT_CONFIGURATION'),
    ({'checkout': {'pending_cart_option_edit': {'cart_item_id': '800'}}}, {}, 'CART_EDIT'),
    ({'checkout': {'voucher_offer_pending': True}}, {}, 'VOUCHER'),
    ({'checkout': {'voucher_decided': True}}, {}, 'FULFILLMENT'),
    ({'checkout': {'voucher_decided': True, 'delivery_type': 'GIAO_TAN_NOI'}}, {}, 'LOCATION'),
    ({'checkout': {'voucher_decided': True, 'delivery_type': 'GIAO_TAN_NOI', 'address_confirmed': True}}, {}, 'PAYMENT'),
    ({'checkout': {'checkout_action_id': 'summary'}}, {}, 'CHECKOUT'),
    ({'checkout': {'order_management_action': {'order_id': 'owned'}}}, {}, 'ORDER_CHANGE'),
])
def test_obligations_use_server_state_only(business, visible, expected):
    assert state_obligation({'business': business, 'visible': visible}) == expected
    c = TurnContract()
    c.enter_repair('PRE_TOOL_RESPONSE_REPAIR', {'business': business, 'visible': visible})
    assert c.primary_state_obligation == expected and c.goal_family == (expected or 'GENERIC_CONSULTATION')


def test_new_normal_turn_can_legitimately_read_menu_with_pending_product(runtime, monkeypatch):
    cart_manager.set_pending_products(runtime.sid, [runtime.products[0]])
    before = deepcopy(cart_manager.get_checkout_prefs(runtime.sid)['pending_products'])
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'get_menu_categories', lambda args, sid: {'status': 'ok', 'menu_categories': []})
    g = gateway_for(runtime)
    result = g.semantic_calls(calls(('semantic_read_menu', {})))[0]
    assert result['turn_progress'] == 'COMPLETED'
    assert g.turn_contract.goal_family == 'DISCOVERY'
    assert cart_manager.get_checkout_prefs(runtime.sid)['pending_products'] == before and not runtime.writes


def test_status_ok_without_authority_is_not_progress():
    op = operation_registry()['semantic_configure_product']
    c = TurnContract(goal_family='PRODUCT_CONFIGURATION', repair_mode='PRE_TOOL_RESPONSE_REPAIR')
    progress, reason = validate_turn_progress(c, op, {'status': 'ok'}, artifacts=SimpleNamespace(logs=[]))
    assert progress == 'NON_PROGRESS' and reason == 'authoritative_result_missing'
    wrong = operation_registry()['semantic_read_menu']
    assert validate_turn_progress(c, wrong, {'status': 'ok'})[0] == 'NON_PROGRESS'


def test_registered_prerequisite_is_not_completion():
    op = operation_registry()['semantic_ask_product_options']
    c = TurnContract(goal_family='PRODUCT_CONFIGURATION', repair_mode='PRE_TOOL_RESPONSE_REPAIR')
    progress, _ = validate_turn_progress(c, op, {'status': 'ok'},
        artifacts=SimpleNamespace(logs=[{'tool': op.executor, 'result': {'status': 'ok'}}]))
    assert progress == 'PREREQUISITE_COMPLETED'
    c.progress_result = progress
    assert not c.can_present


@pytest.mark.parametrize('name,effect', [('semantic_set_payment', 'payment_method'),
    ('semantic_set_fulfillment', 'delivery_type'), ('semantic_select_branch', 'branch_id'),
    ('semantic_prepare_checkout', 'checkout_summary'), ('semantic_configure_product', 'configured_cart')])
def test_authoritative_ok_still_requires_the_requested_state_milestone(name, effect):
    op = operation_registry()[name]
    c = TurnContract(goal_family=op.goal_family, bound_operation=name, repair_mode='SEMANTIC_PROTOCOL_REPAIR')
    state = {'cart': {'items': []}, 'checkout': {}, 'pending_products': []}
    progress, reason = validate_turn_progress(c, op, {'status': 'ok', 'changed': True},
        before=state, after=deepcopy(state),
        artifacts=SimpleNamespace(logs=[{'tool': op.executor, 'result': {'status': 'ok'}}]))
    assert progress == 'NON_PROGRESS'
    assert reason in {'authoritative_state_milestone_missing', 'configured_cart_state_unchanged'}
