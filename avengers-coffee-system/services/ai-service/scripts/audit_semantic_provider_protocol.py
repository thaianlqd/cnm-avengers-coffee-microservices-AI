"""Provider-free audit of the minimal semantic wire, against exported starting schemas."""
import argparse
import json
from pathlib import Path
from audit_semantic_contract import representative_states
from src.agents.semantic_registry import operation_registry, interrupt_schema
from src.agents.semantic_protocol import provider_schemas, base_operation, VARIANTS, BATCH_SELECT
from src.agents.tool_capabilities import capabilities_for_context
from src.agents.turn_contract import normal_operations_for_context


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def object_count(spec):
    if isinstance(spec, dict):
        return int(spec.get('type') == 'object') + sum(object_count(v) for v in spec.values())
    return sum(object_count(v) for v in spec) if isinstance(spec, list) else 0


def audit(baseline):
    registry = operation_registry()
    schemas = provider_schemas(list(registry.values()))
    schemas.append(interrupt_schema())
    states = []
    for name, ctx in representative_states().items():
        allowed = capabilities_for_context(ctx, entry_action=ctx['business']['checkout'].get('checkout_action_id'))
        ops = normal_operations_for_context(ctx, allowed)
        before = [baseline[op.function_name]['schema'] for op in ops] + [interrupt_schema()]
        after = provider_schemas(ops) + [interrupt_schema()]
        states.append({'state': name, 'before_functions': len(before), 'after_functions': len(after),
            'before_chars': len(encoded(before)), 'after_chars': len(encoded(after)),
            'provider_functions': [r['function']['name'] for r in after]})
    rows = []
    for schema in schemas:
        function = schema['function']
        name, params = function['name'], function['parameters']
        op = registry.get(base_operation(name))
        old = baseline.get(base_operation(name), {}).get('schema')
        variant = VARIANTS.get(name)
        reference = params.get('properties', {}).get('reference')
        if name == BATCH_SELECT:
            reference = params['properties']['selections']['items']['properties']['reference']
        rows.append({'function': name, 'goal': op.goal_family if op else 'CONTROL',
            'access': op.access if op else 'CONTROL', 'required_provider_fields': params.get('required', []),
            'all_provider_fields': list(params.get('properties', {})),
            'server_owned_fields': ['TurnAuthorization', 'canonical_identity', 'business_state'] +
                (['commitment', 'evidence_not_required'] if op and op.access != 'READ' else []),
            'server_commitment': variant[1] if variant else op.server_commitment if op else None,
            'reference_shape': reference,
            'schema_chars': len(encoded(schema)), 'nested_object_count': object_count(params),
            'old_schema_chars': len(encoded(old)) if old else None,
            'exposure_policy': op.exposure_policy if op else 'one interrupt; no locked snapshot, repair target or committed write',
            'representative_state_exposure': [s['state'] for s in states if name in s['provider_functions']],
            'redundant_authority_fields': sorted({'commitment', 'evidence'} & set(params.get('properties', {}))),
            'overlap': 'explicit meaning variant: ' + variant[0] if variant else None})
    assert not any(r['redundant_authority_fields'] for r in rows)
    assert len({r['function'] for r in rows}) == len(rows)
    return {'live_provider_requests': 0, 'encoding': 'UTF-8 JSON, compact separators, sorted keys, ensure_ascii=False; chars not bytes',
        'state_measurement': 'Normal semantic operation surfaces plus initially eligible interrupt; runtime repair/locks narrow further.',
        'old_select_product_schema': baseline['semantic_select_product']['schema'],
        'new_select_products_schema': next(s for s in schemas if s['function']['name'] == BATCH_SELECT),
        'states': states, 'operations': rows}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    result = audit(json.loads(args.baseline.read_text()))
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'operations': len(result['operations']), 'states': result['states'], 'live_provider_requests': 0}))
