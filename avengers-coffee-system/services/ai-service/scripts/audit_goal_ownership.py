"""Provider-free ownership, prerequisite and snapshot surface inventory."""
from copy import deepcopy
from dataclasses import asdict
import json
from pathlib import Path
from scripts.audit_semantic_contract import representative_states
from src.agents.product_snapshot import ProductDisplaySnapshot
from src.agents.semantic_prerequisites import PREREQUISITE_POLICIES
from src.agents.semantic_progress import GOAL_FAMILIES
from src.agents.semantic_registry import operation_registry, validate_registry
from src.agents.tool_capabilities import capabilities_for_context
from src.agents.turn_contract import TurnContract, normal_operations_for_context, repair_operations_for_contract

ROOT = Path(__file__).resolve().parents[1]


def audit():
    registry = operation_registry()
    validate_registry(registry)
    surfaces = []
    states = representative_states()
    states['payment_needed']['visible'].pop('location_candidates', None)
    fulfillment = deepcopy(states['cart'])
    fulfillment['business']['checkout'].update(voucher_decided=True, checkout_requested=True)
    states['fulfillment_needed'] = fulfillment
    known = deepcopy(states['pending_product'])
    known['business']['pending_products'][0]['option_schema'] = [{'name': 'Size'}]
    states['pending_product_known_options'] = known
    for name, context in states.items():
        snapshot = ProductDisplaySnapshot.capture(context['visible'])
        context['turn_product_snapshot'] = snapshot.descriptor()
        allowed = capabilities_for_context(context, entry_action=context['business']['checkout'].get('checkout_action_id'))
        contract = TurnContract(context=context)
        contract.enter_repair('PRE_TOOL_RESPONSE_REPAIR', context)
        normal = normal_operations_for_context(context, allowed)
        repair = repair_operations_for_contract(contract, context, allowed)
        surfaces.append({'state': name, 'goal_family': contract.goal_family,
            'goal_owner_operation': contract.goal_owner_operation, 'repair_target_operation': contract.repair_target,
            'normal_operations': [op.function_name for op in normal],
            'repair_operations': [op.function_name for op in repair],
            'needed_prerequisites': sorted(contract.needed_prerequisites()),
            'interrupt_available': not contract.selection_snapshot_locked})
    same_domain = []
    for goal in GOAL_FAMILIES:
        contract = TurnContract(goal_family=goal, repair_mode='PRE_TOOL_RESPONSE_REPAIR')
        before = asdict(contract)
        assert contract.interrupt(goal) == (False, 'same_domain_interrupt')
        assert asdict(contract) == before
        same_domain.append({'goal': goal, 'accepted': False, 'reason': 'same_domain_interrupt', 'state_unchanged': True})
    return {'STARTING_HEAD': '1f562b107e64f765584b7cb5b1d1c92acf664283',
        'LIVE_PROVIDER_REQUESTS': 0, 'business_operation_count': len(registry),
        'goal_family_count': len(GOAL_FAMILIES), 'prerequisite_edge_count': len(PREREQUISITE_POLICIES),
        'same_domain_interrupts': same_domain,
        'registry': [{key: getattr(op, key) for key in ('function_name', 'goal_family', 'progress_role', 'terminal_for_goal', 'repair_prerequisites')}
            for op in registry.values()],
        'prerequisite_policies': [asdict(policy) for policy in PREREQUISITE_POLICIES.values()],
        'surfaces': surfaces}


if __name__ == '__main__':
    result = audit()
    (ROOT / 'docs' / 'SEMANTIC_GOAL_OWNERSHIP_STATIC_AUDIT.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: result[key] for key in ('business_operation_count', 'goal_family_count', 'prerequisite_edge_count', 'LIVE_PROVIDER_REQUESTS')}))
