"""Role and goal ownership cannot be rewritten by retry/interrupt transitions."""
from copy import deepcopy
from dataclasses import asdict
from types import SimpleNamespace
import pytest
from src.agents.semantic_registry import operation_registry
from src.agents.semantic_progress import GOAL_FAMILIES
from src.agents.semantic_prerequisites import PREREQUISITE_POLICIES
from src.agents.turn_contract import TurnContract, validate_turn_progress
from test_semantic_control import runtime, compatibility_runtime, gateway_for
from test_semantic_mapper_reference_policy import minimal, universe
from test_semantic_registry_contract import calls
from src.common import cart_manager

REGISTRY = operation_registry()


@pytest.mark.parametrize('goal', GOAL_FAMILIES)
def test_same_domain_interrupt_all_goals_has_no_contract_or_budget_effect(goal):
    c = TurnContract(goal_family=goal, repair_mode='PRE_TOOL_RESPONSE_REPAIR', progress_result='NEEDS_REPAIR')
    before, surface = asdict(c), c.allowed_operations()
    assert c.interrupt(goal) == (False, 'same_domain_interrupt')
    assert asdict(c) == before and c.allowed_operations() == surface


@pytest.mark.parametrize('goal', GOAL_FAMILIES)
def test_same_domain_gateway_rejection_is_nonexecuting_and_noncontinuing(runtime, goal):
    g = gateway_for(runtime)
    g.turn_contract.goal_family, g.turn_contract.repair_mode = goal, 'PRE_TOOL_RESPONSE_REPAIR'
    before = asdict(g.turn_contract)
    result = g.semantic_calls(calls(('semantic_interrupt', {'target_domain': goal})))[0]
    assert result['non_progress_reason'] == 'same_domain_interrupt'
    assert not result['continuation_required'] and not result['changed']
    # Refreshing trusted prerequisite facts is not a contract transition.
    after = asdict(g.turn_contract)
    before.pop('context'); after.pop('context')
    assert after == before and not g.artifacts.logs and not g.semantic_plan
    assert not runtime.reads and not runtime.writes


@pytest.mark.parametrize('origin,target', [(a,b) for a in GOAL_FAMILIES for b in GOAL_FAMILIES if a != b])
def test_every_cross_domain_transition_rejects_wrong_next_domain_before_execution(runtime, origin, target):
    g = universe(runtime)
    c = TurnContract(goal_family=origin, repair_mode='PRE_TOOL_RESPONSE_REPAIR', context=g.context)
    g.turn_contract = g.artifacts.turn_contract = c
    before = deepcopy(cart_manager.get_cart(runtime.sid))
    accepted = g.semantic_calls(calls(('semantic_interrupt', {'target_domain': target})))[0]
    assert accepted['continuation_required'] and c.progress_result == 'INTERRUPT_PENDING'
    assert c.goal_family == target and c.goal_owner_operation is None and c.repair_target is None
    wrong = next(op for op in REGISTRY.values() if op.goal_family != target and not c.eligibility(op)[0])
    result = g.semantic_calls(calls((wrong.function_name, minimal(wrong))))[0]
    assert result['status'] == 'semantic_drift' and c.goal_family == target
    assert c.goal_owner_operation is None and c.repair_target is None
    assert not g.artifacts.logs and not g.semantic_plan and not runtime.reads and not runtime.writes
    assert cart_manager.get_cart(runtime.sid) == before


@pytest.mark.parametrize('edge', list(PREREQUISITE_POLICIES.values()), ids=lambda p:p.owner_operation+'--'+p.operation)
@pytest.mark.parametrize('binding', ['none', 'bound_operation', 'repair_target_operation'])
def test_every_registered_prerequisite_role_survives_interrupt_and_retry_binding(edge, binding):
    owner, prerequisite = REGISTRY[edge.owner_operation], REGISTRY[edge.operation]
    c = TurnContract(goal_family='SOCIAL', repair_mode='PRE_TOOL_RESPONSE_REPAIR')
    assert c.interrupt(owner.goal_family)[0]
    c.goal_owner_operation = owner.function_name
    if binding != 'none':
        setattr(c, binding, prerequisite.function_name)
    assert c.is_prerequisite(prerequisite)
    artifacts = SimpleNamespace(logs=[{'tool': prerequisite.executor, 'result': {'status': 'ok'}}])
    progress, _ = validate_turn_progress(c, prerequisite, {'status': 'ok'}, artifacts=artifacts)
    assert progress == 'PREREQUISITE_COMPLETED'
    c.progress_result = progress
    assert not c.can_present and c.goal_family == owner.goal_family and c.goal_owner_operation == owner.function_name
    # Neither retry target nor plan index can turn support into goal ownership.
    c.observe_operation(prerequisite, standalone=True)
    assert c.goal_owner_operation == owner.function_name


@pytest.mark.parametrize('name', REGISTRY)
def test_registry_role_is_invariant_under_all_binding_mutations(name):
    op = REGISTRY[name]
    c = TurnContract(goal_family=op.goal_family, repair_mode='PRE_TOOL_RESPONSE_REPAIR')
    role = op.progress_role
    original = c.is_prerequisite(op)
    for binding in (name, None, 'semantic_read_menu'):
        c.bound_operation = c.repair_target_operation = binding
        assert op.progress_role == role
        if role == 'PREREQUISITE':
            assert c.is_prerequisite(op) and original


@pytest.mark.parametrize('goal', GOAL_FAMILIES)
def test_interrupt_budget_and_committed_write_fences(goal):
    target = next(g for g in GOAL_FAMILIES if g != goal)
    c = TurnContract(goal_family=goal, writes_already_committed=1)
    assert c.interrupt(target) == (False, 'committed_plan_cannot_switch')
    c.writes_already_committed = 0
    assert c.interrupt(target)[0]
    assert c.interrupt(goal) == (False, 'interrupt_budget_exhausted')
    assert c.interrupt_count == 1 and c.goal_family == target


@pytest.mark.parametrize('edge', list(PREREQUISITE_POLICIES.values()), ids=lambda p:p.owner_operation+'--'+p.operation)
def test_primary_after_registered_support_completes_without_owner_drift(edge):
    owner, support = REGISTRY[edge.owner_operation], REGISTRY[edge.operation]
    c = TurnContract(goal_family='SOCIAL', repair_mode='PRE_TOOL_RESPONSE_REPAIR')
    assert c.interrupt(owner.goal_family)[0]
    c.goal_owner_operation = owner.function_name
    c.repair_target_operation = support.function_name
    evidence = SimpleNamespace(logs=[{'tool': support.executor, 'result': {'status': 'ok'}}])
    assert validate_turn_progress(c, support, {'status': 'ok'}, artifacts=evidence)[0] == 'PREREQUISITE_COMPLETED'
    plan = SimpleNamespace(actions=[{'operation': owner.function_name, 'status': 'SUCCEEDED', 'bound_target': ('PRODUCT','product_id','p')}])
    before = {'cart': {'items': []}, 'pending_products': [], 'checkout': {}}
    after = {'cart': {'branch_id': 'b', 'items': [{'product_id': 'p'}]},
        'pending_products': [{'product_id': 'p'}], 'checkout': {'payment_method': 'VNPAY', 'delivery_type': 'MANG_DI',
            'checkout_action_id': 'summary', 'order_management_action': {'order_id': 'owned'}}}
    evidence.logs.append({'tool': owner.executor, 'result': {'status': 'ok'}})
    progress, _ = validate_turn_progress(c, owner, {'status': 'ok'}, plan, before, after, evidence)
    assert progress == 'COMPLETED' and c.goal_family == owner.goal_family and c.goal_owner_operation == owner.function_name


@pytest.mark.parametrize('edge', list(PREREQUISITE_POLICIES.values()), ids=lambda p:p.owner_operation+'--'+p.operation)
def test_first_repair_of_support_preserves_existing_primary_owner(edge):
    owner = REGISTRY[edge.owner_operation]
    c = TurnContract(goal_family=owner.goal_family, goal_owner_operation=owner.function_name)
    plan = SimpleNamespace(failed={'operation': edge.operation, 'proposal': {}})
    c.enter_repair('SEMANTIC_PROTOCOL_REPAIR', {}, plan)
    assert c.goal_family == owner.goal_family and c.goal_owner_operation == owner.function_name
    assert c.repair_target == edge.operation and c.is_prerequisite(REGISTRY[edge.operation])


def test_malformed_same_family_prerequisite_after_interrupt_can_repair_then_primary(runtime, monkeypatch):
    from src.function_calling.tools import TOOL_EXECUTORS
    monkeypatch.setitem(TOOL_EXECUTORS, 'get_payment_options', lambda *a: {
        'status': 'ok', 'payment_options': [{'code': 'THANH_TOAN_KHI_NHAN_HANG', 'label': 'COD', 'aliases': ['COD']}]})
    g = gateway_for(runtime, 'Fixture choose COD')
    assert g.semantic_calls(calls(('semantic_interrupt', {'target_domain': 'PAYMENT'})))[0]['continuation_required']
    result = g.semantic_calls(calls(('semantic_read_payment_options', {'foreign': True})))[0]
    assert result['recovery_kind'] == 'model_repair' and g.turn_contract.prerequisite_count == 0
    assert g.turn_contract.goal_family == 'PAYMENT' and g.turn_contract.goal_owner_operation is None
    result = g.semantic_calls(calls(('semantic_read_payment_options', {})))[0]
    assert result['turn_progress'] == 'PREREQUISITE_COMPLETED' and result['continuation_required']
    assert g.turn_contract.prerequisite_count == 1 and g.turn_contract.goal_owner_operation is None
    assert 'semantic_set_payment' in g.turn_contract.allowed_operations()
    result = g.semantic_calls(calls(('semantic_set_payment', {
        'reference': {'kind': 'name', 'value': 'COD'}, 'commitment': 'SELECTED', 'evidence': g.user_message})))[0]
    assert result['turn_progress'] == 'COMPLETED' and not result['continuation_required'], result
    assert g.turn_contract.goal_owner_operation == 'semantic_set_payment'
    assert cart_manager.get_checkout_prefs(runtime.sid)['payment_method'] == 'THANH_TOAN_KHI_NHAN_HANG'
