"""Perfectly valid wrong operations must be rejected before any executor/UI."""
from copy import deepcopy
import pytest
from src.agents.semantic_registry import operation_registry, validate_operation
from src.agents.semantic_progress import GOAL_FAMILIES
from src.agents.turn_contract import TurnContract
from test_semantic_mapper_reference_policy import minimal, universe
from test_semantic_control import runtime, compatibility_runtime
from test_semantic_registry_contract import calls
from src.common import cart_manager

REGISTRY = operation_registry()
CASES = [(goal, name) for goal in GOAL_FAMILIES for name, op in REGISTRY.items()
    if not TurnContract(goal_family=goal, primary_state_obligation=goal,
        repair_mode='PRE_TOOL_RESPONSE_REPAIR').eligibility(op)[0]]


@pytest.mark.parametrize('goal,name', CASES)
def test_wrong_but_valid_cross_product_zero_execution_artifacts_and_state_change(runtime, goal, name):
    g = universe(runtime)
    g.turn_contract = TurnContract(goal_family=goal, primary_state_obligation=goal, repair_mode='PRE_TOOL_RESPONSE_REPAIR')
    g.artifacts.turn_contract = g.turn_contract
    before = deepcopy(cart_manager.get_cart(runtime.sid))
    ui, visible, focus = deepcopy(g.artifacts.ui), deepcopy(g.artifacts.visible), deepcopy(g.artifacts.focus)
    value = minimal(REGISTRY[name])
    assert validate_operation(name, value)
    result = g.semantic_calls(calls((name, value)))[0]
    assert result['status'] == 'semantic_drift' and result['error_class'] == 'MODEL_PROTOCOL'
    assert result['error_subtype'] == 'SEMANTIC_DRIFT'
    assert not g.semantic_plan and not g.artifacts.logs and not runtime.reads and not runtime.writes
    assert cart_manager.get_cart(runtime.sid) == before
    assert g.artifacts.ui == ui and g.artifacts.visible == visible and g.artifacts.focus == focus
    assert g.artifacts.completed_customer_step() is None


def test_whole_mixed_batch_is_rejected_before_valid_write_sibling(runtime):
    g = universe(runtime)
    g.turn_contract = TurnContract(goal_family='PRODUCT_CONFIGURATION', repair_mode='PRE_TOOL_RESPONSE_REPAIR')
    g.artifacts.turn_contract = g.turn_contract
    value = minimal(REGISTRY['semantic_configure_product'])
    result = g.semantic_calls(calls(('semantic_configure_product', value), ('semantic_read_menu', {})))[0]
    assert result['status'] == 'semantic_drift'
    assert not runtime.writes and not g.artifacts.logs and not g.semantic_plan


def test_presentation_quarantines_existing_prerequisite_artifacts_when_unfinished(runtime):
    g = universe(runtime)
    g.turn_contract = TurnContract(goal_family='PRODUCT_CONFIGURATION', repair_mode='PRE_TOOL_RESPONSE_REPAIR',
        progress_result='PREREQUISITE_COMPLETED')
    g.artifacts.turn_contract = g.turn_contract
    g.artifacts.ui.update(products=[{'product_id': 'unrelated'}], branches=[{'branch_id': 'unrelated'}],
        vouchers=[{'voucher_code': 'unrelated'}], menu_categories=[{'category_id': 'unrelated'}])
    assert g.artifacts.customer_flow_reply() is None and g.artifacts.completed_customer_step() is None
    reply = g.artifacts.factual_fallback()
    assert 'lỗi diễn giải' in reply
    assert all(not value for key, value in g.artifacts.ui.items() if key != 'cart')
