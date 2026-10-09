"""Narrow pre-write reference patch. Accepted customer meaning is immutable."""
from copy import deepcopy
import json
from src.agents.agent_memory import safe_text
from src.agents.hybrid_command_schema import PRODUCT_REF, obj, array, TEXT, validate_envelope
from src.agents.semantic_protocol import first_failure, normalize_arguments
from src.agents.semantic_protocol import digest

PATCH_REF = deepcopy(PRODUCT_REF)
PATCH_REF['properties']['kind']['enum'] = ['ordinal', 'group_ordinal']
PATCH_SCHEMA = obj({'reference_repairs': array(obj({'path': TEXT, 'reference': PATCH_REF}, ('path', 'reference')), 16)}, ('reference_repairs',))
PATCH_OUTER_SCHEMA = deepcopy(PATCH_SCHEMA)
# semantic_protocol's legacy /reference conditional accepts only its original
# ordinal grammar. Validate the new product grammar separately, without changing
# the legacy authority contract for every other caller.
PATCH_OUTER_SCHEMA['properties']['reference_repairs']['items']['properties']['reference'] = {}


def at(value, path):
    for part in path.strip('/').split('/'):
        value = value[int(part)] if isinstance(value, list) else value[part]
    return value


def frozen_fingerprint(envelope, paths):
    frozen = deepcopy(envelope)
    for path in paths:
        reference = at(frozen, path)
        quantity = reference.get('quantity')
        reference.clear()
        reference.update(frozen_reference=True, quantity=quantity)
    return digest(frozen)


def eligible(turn, envelope, error):
    if error.domain != 'products' or error.code not in {'duplicate_selection', 'ambiguous_reference', 'unknown_reference'} or not error.paths:
        return False
    refs = [at(envelope, path) for path in error.paths]
    if any(ref.get('kind') not in {'ordinal', 'group_ordinal'} for ref in refs):
        return False
    collections = turn.product_display_snapshot.collections_context()
    if error.code == 'duplicate_selection':
        return any(ref['kind'] == 'ordinal' for ref in refs) and all(collections.values())
    # An empty refreshed group or an out-of-range number has no recoverable
    # representation to repair. Never turn it into a different product.
    return all(ref['kind'] == 'ordinal' and any(
        row['group_index'] == ref['index'] for rows in collections.values() for row in rows) for ref in refs)


def apply_patch(envelope, paths, raw):
    patch, _, parsed = normalize_arguments(raw, {}, 'hybrid_reference_patch')
    if not parsed or first_failure(patch, PATCH_OUTER_SCHEMA):
        return None, 'invalid_reference_patch'
    changes = patch['reference_repairs']
    if any(first_failure(change['reference'], PATCH_REF) for change in changes):
        return None, 'invalid_reference_patch'
    supplied = [change['path'] for change in changes]
    if len(supplied) != len(set(supplied)) or set(supplied) != set(paths):
        return None, 'reference_patch_scope_mismatch'
    result = deepcopy(envelope)
    for change in changes:
        target = at(result, change['path'])
        quantity = target.get('quantity')
        target.clear()
        target.update(deepcopy(change['reference']))
        if quantity is not None:
            target['quantity'] = quantity
    _, error, _ = validate_envelope(result)
    if error:
        return None, error['failure_code']
    if frozen_fingerprint(result, paths) != frozen_fingerprint(envelope, paths):
        return None, 'reference_meaning_changed'
    return result, None


def repair(turn, envelope, error, user_message, budget):
    paths = list(dict.fromkeys(error.paths))
    summary = deepcopy(envelope['commands'])
    def redact(value):
        if isinstance(value, dict):
            return {k: '[customer literal ID]' if k == 'value' and value.get('kind') == 'id' else redact(v) for k,v in value.items()}
        return [redact(v) for v in value] if isinstance(value, list) else value
    context = {'accepted_commands': redact(summary), 'failed_reference_paths': paths, 'failure_code': error.code,
        'visible_product_collections': turn.product_display_snapshot.collections_context(),
        'visible_products': turn.model_context()['visible_products'],
        'frozen_meaning_fingerprint': frozen_fingerprint(envelope, paths)}
    if len(json.dumps(context, ensure_ascii=False)) > 24000:
        return None, 'reference_repair_context_budget_exceeded'
    messages = [{'role': 'system', 'content': 'Repair ONLY the listed failed product references. Preserve customer intent, '
        'quantities, options, command order and all other fields. Return a reference patch, never an envelope or tools. '
        'Use group_ordinal for an explicitly named group. Do not guess a bare ambiguous number. If uncertain return '
        '{"reference_repairs":[]}. No private IDs, business facts or executors. Required schema: ' + json.dumps(PATCH_SCHEMA) +
        '\nDATA: ' + json.dumps(context, ensure_ascii=False)}, {'role': 'user', 'content': safe_text(user_message, 2000)}]
    response, provider_error = budget.completion(messages, 'hybrid_reference_repair', 1)
    if provider_error or not response:
        return None, provider_error or 'empty_reference_patch'
    if getattr(response.choices[0].message, 'tool_calls', None):
        return None, 'unexpected_reference_tools'
    return apply_patch(envelope, paths, response.choices[0].message.content)
