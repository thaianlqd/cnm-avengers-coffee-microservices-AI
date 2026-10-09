"""Provider-free turn surface and explicit 48-operation progress inventory."""
import argparse
from copy import deepcopy
from dataclasses import asdict
import json
from pathlib import Path
import sys
from types import ModuleType
from scripts.audit_semantic_contract import representative_states
from src.agents.semantic_registry import operation_registry, interrupt_schema, validate_registry
from src.agents.semantic_progress import NORMAL_COMPANION_GOALS
from src.agents.turn_contract import (TurnContract, state_obligation,
    normal_operations_for_context, repair_operations_for_contract)
from src.agents.tool_capabilities import capabilities_for_context

ROOT = Path(__file__).resolve().parents[1]


def states():
    old = representative_states()
    selected = deepcopy(old['pending_product'])
    selected['business']['pending_products'][0]['selected_options'] = {}
    configured = deepcopy(selected)
    configured['business']['pending_products'][0]['selected_options'] = {'luong_da': 'Ít đá'}
    fulfillment = deepcopy(old['cart'])
    fulfillment['business']['checkout'].update(voucher_decided=True, checkout_requested=True)
    payment = deepcopy(old['payment_needed'])
    payment['visible'].pop('location_candidates', None)
    return {'BROWSING': old['browsing'], 'PRODUCT_SELECTED': selected,
        'PRODUCT_CONFIGURATION': configured, 'CART': old['cart'], 'VOUCHER': old['voucher'],
        'FULFILLMENT': fulfillment, 'LOCATION': old['location'], 'PAYMENT': payment,
        'CHECKOUT_SUMMARY': old['summary'], 'ORDER_MANAGEMENT': old['order_change']}


def schemas(ops, control=True):
    return [op.schema() for op in ops] + ([interrupt_schema()] if control else [])


def surface(ops, control=True):
    rows = schemas(ops, control)
    return {'operation_count': len(rows), 'schema_chars': len(json.dumps(rows, ensure_ascii=False)),
        'operations': [row['function']['name'] for row in rows]}


def audit(previous_path):
    previous = ModuleType('_immutable_starting_registry')
    sys.modules[previous.__name__] = previous
    exec(compile(Path(previous_path).read_text(), '<starting HEAD registry>', 'exec'), previous.__dict__)
    registry = operation_registry()
    validate_registry(registry)
    inventory = []
    for name, ctx in states().items():
        allowed = capabilities_for_context(ctx, entry_action=ctx['business']['checkout'].get('checkout_action_id'))
        normal = normal_operations_for_context(ctx, allowed)
        contract = TurnContract(primary_state_obligation=state_obligation(ctx))
        contract.enter_repair('PRE_TOOL_RESPONSE_REPAIR', ctx)
        repair = repair_operations_for_contract(contract, ctx, allowed)
        before = previous.operations_for_context(ctx, allowed)
        old = surface(before, control=False)
        # Starting HEAD reused this business universe during PRE_TOOL format repair.
        inventory.append({'state': name, 'state_obligation': state_obligation(ctx),
            'repair_goal': contract.goal_family, 'before_normal': old, 'before_pre_tool_repair': old,
            'normal': surface(normal), 'pre_tool_repair': surface(repair),
            'normal_justification': {op.function_name: (
                'State policy permits this domain and no stronger unfinished obligation exists.'
                if not state_obligation(ctx) else
                f'{op.goal_family} is the unfinished domain or a registered local business companion; executor authorization also required.')
                for op in normal},
            'interrupt_justification': 'Control only, no business executor, one conditional continuation; preserves drafts.',
            'exact_protocol_repair': {op.function_name: surface([candidate for candidate in registry.values()
                if candidate.function_name in {op.function_name, *op.repair_prerequisites}], control=False)
                for op in normal}})
    return {'STARTING_HEAD': '1e6ca05c2c37536b25a7767154757eff558087f1', 'LIVE_PROVIDER_REQUESTS': 0,
        'business_operations': len(registry), 'control_operations': 1,
        'normal_companion_goals': NORMAL_COMPANION_GOALS,
        'states': inventory, 'registry': [asdict(op) | {'function_name': op.function_name} for op in registry.values()]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--previous-registry-source', required=True)
    args = parser.parse_args()
    result = audit(args.previous_registry_source)
    path = ROOT / 'docs' / 'SEMANTIC_TURN_CONTINUITY_STATIC_AUDIT.json'
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'states': [{k: row[k] for k in ('state', 'state_obligation', 'repair_goal')}
        | {key: {k: row[key][k] for k in ('operation_count', 'schema_chars')}
            for key in ('before_normal', 'normal', 'pre_tool_repair')} for row in result['states']],
        'business_operations': result['business_operations'], 'LIVE_PROVIDER_REQUESTS': 0}, ensure_ascii=False))
