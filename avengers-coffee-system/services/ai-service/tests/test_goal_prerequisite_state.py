"""Exact prerequisites are exposed only when trusted state proves a need."""
from copy import deepcopy
from types import SimpleNamespace
import pytest
from src.agents.semantic_registry import operation_registry, prerequisite_policies
from src.agents.semantic_prerequisites import PREREQUISITE_POLICIES
from src.agents.turn_contract import TurnContract, validate_turn_progress
from test_semantic_control import runtime, compatibility_runtime, gateway_for
from test_semantic_registry_contract import calls
from src.common import cart_manager

REGISTRY = operation_registry()


@pytest.mark.parametrize('edge', list(PREREQUISITE_POLICIES.values()), ids=lambda p:p.owner_operation+'--'+p.operation)
def test_every_prerequisite_has_exact_owner_reason_and_named_state_predicate(edge):
    assert edge in prerequisite_policies(edge.owner_operation)
    assert edge.operation in REGISTRY[edge.owner_operation].repair_prerequisites
    assert edge.reason and edge.predicate
    assert edge.needed({})
    available = {'business': {'cart_verified': True, 'cart': {'items': []},
        'pending_products': [{'product_id': 'p', 'option_schema': [{'name': 'Size'}]}],
        'checkout': {'delivery_type': 'MANG_DI', 'order_management_action': {'order_id': 'owned'}}},
        'visible': {'products': [{'product_id': 'p'}], 'vouchers': [{}], 'payment_options': [{}],
            'profile_addresses': [{}], 'location_candidates': [{}], 'branches': [{}]},
        'turn_progress_facts': {'product_price_read': True}}
    assert not edge.needed(available)


def test_existing_product_snapshot_suppresses_selection_rediscovery_and_option_prereads(runtime):
    g = gateway_for(runtime)
    g.enter_turn_repair('PRE_TOOL_RESPONSE_REPAIR')
    schemas, _ = g.tool_surface()
    assert g.turn_contract.goal_family == 'PRODUCT_SELECTION'
    assert g.turn_contract.goal_owner_operation == 'semantic_select_product'
    assert {s['function']['name'] for s in schemas} == {'semantic_select_products'}
    visible, focus = deepcopy(g.artifacts.visible), deepcopy(g.artifacts.focus)
    result = g.semantic_calls(calls(('semantic_discover_products', {'scope': 'food', 'planned_discovery_reads': 1})))[0]
    assert result['non_progress_reason'] == 'unneeded_prerequisite'
    assert not runtime.reads and not runtime.writes and g.artifacts.visible == visible and g.artifacts.focus == focus


def test_named_unresolved_selection_can_need_discovery_even_with_other_candidates(runtime):
    g = gateway_for(runtime)
    c = g.turn_contract
    c.goal_family, c.goal_owner_operation, c.repair_mode = 'PRODUCT_SELECTION', 'semantic_select_product', 'SEMANTIC_PROTOCOL_REPAIR'
    c.repair_reference = {'kind': 'name', 'value': 'Unknown menu family'}
    assert 'semantic_discover_products' in c.allowed_operations()
    c.repair_reference = {'kind': 'ordinal', 'index': 1}
    assert 'semantic_discover_products' not in c.allowed_operations()


@pytest.mark.parametrize('owner,read', [('semantic_set_payment','semantic_read_payment_options'),
    ('semantic_select_location_candidate','semantic_find_nearby_branches'),
    ('semantic_prepare_order_update','semantic_read_order')])
def test_supporting_reads_never_complete_payment_location_or_order_primary(owner, read):
    op, support = REGISTRY[owner], REGISTRY[read]
    c = TurnContract(goal_family=op.goal_family, goal_owner_operation=owner, bound_operation=read,
        repair_target_operation=read, repair_mode='SEMANTIC_PROTOCOL_REPAIR')
    artifacts = SimpleNamespace(logs=[{'tool': support.executor, 'result': {'status': 'ok'}}])
    progress, _ = validate_turn_progress(c, support, {'status': 'ok'}, artifacts=artifacts)
    assert progress == 'PREREQUISITE_COMPLETED'
    assert c.goal_owner_operation == owner


def test_known_options_suppress_config_prerequisite_and_missing_options_enable_it(runtime):
    cart_manager.set_pending_products(runtime.sid, [{**runtime.products[0], 'option_schema': [{'name': 'Size'}]}])
    g = gateway_for(runtime)
    g.enter_turn_repair('PRE_TOOL_RESPONSE_REPAIR')
    assert 'semantic_ask_product_options' not in g.turn_contract.allowed_operations()
    g.context['business']['pending_products'][0].pop('option_schema')
    assert 'semantic_ask_product_options' in g.turn_contract.allowed_operations()
