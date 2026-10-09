"""A future operation must declare its progress semantics explicitly."""
from dataclasses import replace
import pytest
from src.agents.semantic_registry import operation_registry, validate_registry, interrupt_schema, validate_interrupt
from src.agents.semantic_progress import GOAL_FAMILIES, PROGRESS_ROLES, PROGRESS_POLICIES
from test_semantic_registry_contract import assert_closed

REGISTRY = operation_registry()


@pytest.mark.parametrize('name', REGISTRY)
def test_explicit_progress_metadata_and_exact_prerequisites(name):
    op = REGISTRY[name]
    policy = PROGRESS_POLICIES[op.name]
    assert op.goal_family == policy.goal_family and op.goal_family in GOAL_FAMILIES
    assert op.progress_role == policy.progress_role and op.progress_role in PROGRESS_ROLES
    assert op.state_effect == policy.state_effect and type(op.terminal_for_goal) is bool
    assert op.repair_compatible_goals == (op.goal_family,)
    assert op.repair_prerequisites == tuple('semantic_' + n.lower() for n in policy.prerequisites)
    assert not hasattr(op, 'repair_prerequisite_access')
    assert all(n in REGISTRY and n != name for n in op.repair_prerequisites)
    for missing in ('goal_family', 'progress_role', 'state_effect'):
        with pytest.raises(AssertionError):
            validate_registry({name: replace(op, **{missing: ''})})


def test_registry_coverage_has_no_future_fallback():
    assert {op.name for op in REGISTRY.values()} == set(PROGRESS_POLICIES)
    assert REGISTRY['semantic_configure_product'].repair_prerequisites == ('semantic_ask_product_options',)
    assert REGISTRY['semantic_set_payment'].repair_prerequisites == ('semantic_read_payment_options',)
    assert REGISTRY['semantic_confirm_checkout'].repair_prerequisites == ()
    assert REGISTRY['semantic_confirm_order_change'].repair_prerequisites == ()


def test_interrupt_is_closed_control_only_not_business_mapping():
    schema = interrupt_schema()
    assert schema['function']['name'] == 'semantic_interrupt'
    assert_closed(schema['function']['parameters'])
    for goal in GOAL_FAMILIES:
        assert validate_interrupt({'target_domain': goal})
    for bad in ({}, {'target_domain': 'invented'}, {'target_domain': 'DISCOVERY', 'payment': 'COD'}, [], None):
        assert not validate_interrupt(bad)
    assert 'semantic_interrupt' not in REGISTRY
