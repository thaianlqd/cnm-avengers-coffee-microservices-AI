"""Registry cross-product of goal compatibility and exact operation repair."""
import pytest
from src.agents.semantic_registry import operation_registry
from src.agents.semantic_progress import GOAL_FAMILIES
from src.agents.turn_contract import TurnContract, repair_operations_for_contract, normal_operations_for_context
from test_semantic_control import runtime, compatibility_runtime, gateway_for
from src.common import cart_manager

REGISTRY = operation_registry()


@pytest.mark.parametrize('goal', GOAL_FAMILIES)
@pytest.mark.parametrize('name', REGISTRY)
def test_goal_by_every_operation_compatibility(goal, name):
    c = TurnContract(goal_family=goal, repair_mode='PRE_TOOL_RESPONSE_REPAIR', primary_state_obligation=goal)
    primaries = [op for op in REGISTRY.values() if op.goal_family == goal and op.progress_role in {'PRIMARY', 'FINALIZATION'}]
    if not primaries:
        primaries = [op for op in REGISTRY.values() if op.goal_family == goal and op.progress_role == 'CONSULTATION']
    allowed = {op.function_name for op in primaries} | {n for op in primaries for n in op.repair_prerequisites}
    assert c.eligibility(REGISTRY[name])[0] == (name in allowed)


@pytest.mark.parametrize('name', REGISTRY)
def test_protocol_repair_all_operation_pairs_preserves_exact_meaning(name):
    op = REGISTRY[name]
    c = TurnContract(goal_family=op.goal_family, bound_operation=name, repair_mode='SEMANTIC_PROTOCOL_REPAIR',
        consultation_operation=name if op.access == 'READ' else None)
    for other in REGISTRY.values():
        assert c.eligibility(other)[0] == (other.function_name in {name, *op.repair_prerequisites})


def test_pending_product_normal_and_repair_surfaces_are_small_and_typed(runtime):
    cart_manager.set_pending_products(runtime.sid, [runtime.products[0]])
    g = gateway_for(runtime)
    normal, _ = g.tool_surface()
    g.enter_turn_repair('PRE_TOOL_RESPONSE_REPAIR')
    repair, _ = g.tool_surface()
    names = {r['function']['name'] for r in repair}
    assert names == {'semantic_configure_product', 'semantic_use_product_defaults',
        'semantic_ask_product_options', 'semantic_interrupt'}
    assert len(repair) < len(normal) < 25
    assert all(r['function']['name'].startswith('semantic_') for r in normal + repair)
    assert 'customer_actions' not in names and 'get_menu_categories' not in names


def test_no_pending_pre_tool_repair_is_restricted_generic_plus_interrupt(runtime):
    g = gateway_for(runtime)
    g.context['visible']['products'] = []
    g.context['turn_product_snapshot']['ordered_product_ids'] = []
    g.artifacts.visible['products'] = []
    normal, _ = g.tool_surface()
    g.enter_turn_repair('PRE_TOOL_RESPONSE_REPAIR')
    repair, _ = g.tool_surface()
    assert len(repair) < len(normal)
    assert {r['function']['name'] for r in repair} == {
        'semantic_ask_product_fact', 'semantic_ask_product_price', 'semantic_interrupt'}
