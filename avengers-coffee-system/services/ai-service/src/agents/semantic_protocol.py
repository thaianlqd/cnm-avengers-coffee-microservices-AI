"""Provider wire boundary. No language interpretation or business defaults."""
from copy import deepcopy
import hashlib
import json
import logging
import re
import time
from dataclasses import dataclass
from uuid import uuid4

logger = logging.getLogger(__name__)

# Exhaustive audit: no wrapper aliases, unknown-field deletion, or defaults.
NORMALIZATION_RULES = {
    'json_object': ('JSON string encoding an object', 'object', 'all operations'),
    'canonical_integer': ('canonical base-10 integer string at integer schema field', 'integer', 'all integer fields'),
    'selection_singleton': ('object at /selections', 'one-item array', 'semantic_select_products only'),
}
BATCH_SELECT = 'semantic_select_products'
# Explicit meanings projected onto existing canonical operations, not new FSM roles.
VARIANTS = {
    'semantic_reset_product_defaults': ('semantic_use_product_defaults', 'CORRECTION', 'Reset selected options to canonical Menu defaults.'),
    'semantic_decline_profile_address': ('semantic_select_profile_address', 'REJECTED', 'Decline the previously offered saved address.'),
    'semantic_change_profile_address': ('semantic_select_profile_address', 'CORRECTION', 'Explicitly replace the confirmed destination with a saved address.'),
}


def provider_schemas(operations):
    from src.agents.semantic_registry import closed
    rows = []
    for op in operations:
        if op.name == 'SELECT_PRODUCT':
            params = closed({'selections': {'type': 'array', 'minItems': 1, 'maxItems': 16,
                'items': op.provider_parameters()}}, ('selections',))
            name, description = BATCH_SELECT, 'Select one or more products in ONE call. Resolve references from the current displayed list. Never configure or add to cart.'
        else:
            name, description, params = op.function_name, op.description, op.provider_parameters()
        rows.append({'type': 'function', 'function': {'name': name, 'description': description, 'parameters': params}})
        for variant, (base, _, desc) in VARIANTS.items():
            if base == op.function_name:
                rows.append({'type': 'function', 'function': {'name': variant, 'description': desc,
                    'parameters': deepcopy(params)}})
    return rows


def base_operation(name):
    return 'semantic_select_product' if name == BATCH_SELECT else VARIANTS.get(name, (name,))[0]


def normalize_arguments(raw, spec, operation):
    """Three documented shape rules only. Invalid JSON stays invalid."""
    rules = []
    value = deepcopy(raw)
    if isinstance(value, str):
        try:
            def unique_object(pairs):
                result = {}
                for key, item in pairs:
                    if key in result:
                        raise ValueError('duplicate JSON key')
                    result[key] = item
                return result
            value = json.loads(value, object_pairs_hook=unique_object,
                parse_constant=lambda _: (_ for _ in ()).throw(ValueError('nonfinite JSON')))
        except (TypeError, ValueError):
            return None, rules, False
        if isinstance(value, dict):
            rules.append('json_object')
    def walk(item, schema, path=''):
        if schema.get('type') == 'integer' and isinstance(item, str) and re.fullmatch(r'(?:0|-[1-9][0-9]*|[1-9][0-9]*)', item):
            # Bound conversion cost independently of Python's integer-string limit.
            if len(item) <= 20:
                rules.append('canonical_integer')
                return int(item)
        if (operation == BATCH_SELECT and path == '/selections' and isinstance(item, dict)
                and schema.get('type') == 'array'):
            rules.append('selection_singleton')
            item = [item]
        if isinstance(item, dict) and schema.get('type') == 'object':
            return {k: walk(v, schema.get('properties', {}).get(k, {}), path + '/' + k) for k, v in item.items()}
        if isinstance(item, list) and schema.get('type') == 'array':
            return [walk(v, schema['items'], path + '/' + str(i)) for i, v in enumerate(item)]
        return item
    value = walk(value, spec)
    assert set(rules) <= NORMALIZATION_RULES.keys(), 'Undocumented normalization'
    return value, list(dict.fromkeys(rules)), True


@dataclass(frozen=True)
class TurnAuthorization:
    conversation_id: str
    client_message_id: str
    user_turn_hash: str
    turn_contract_id: str
    request_sequence: int
    issued_at: float
    semantic_surface_fingerprint: str


class TurnAuthorizations:
    """Server-only capability ledger; no credential or echo in model arguments.

    IDs are opaque and bound to exact actions. Records never leave the gateway.
    A surface can retire after response materialization: already accepted plan
    siblings remain valid within this turn, but no new response uses that surface.
    Durable client-message replay is additionally owned by the existing HTTP claim.
    """
    def __init__(self, gateway):
        self.gateway = gateway
        self.sequence = 0
        self.surface = None
        self.records = {}
        self.consumed = set()
        self.response_ids = set()
        self.issued = {}
        self.product_targets = {}

    def issue(self, schemas):
        g = self.gateway
        self.sequence += 1
        self.surface = TurnAuthorization(g.session_id, g.client_message_id, digest(g.user_message),
            g.turn_contract.turn_contract_id, self.sequence, time.monotonic(), digest(schemas))
        self.issued[self.sequence] = self.surface
        self.schemas = {row['function']['name']: deepcopy(row['function']) for row in schemas}

    def bind(self, action, provider_name):
        token = uuid4().hex
        action['_turn_authorization_id'] = token
        action['_provider_operation'] = provider_name
        self.records[token] = (self.surface, digest(action), provider_name)
        return action

    def verify(self, action, consume=False):
        g = self.gateway
        token = action.get('_turn_authorization_id')
        record = self.records.get(token)
        if not record or token in self.consumed:
            return False
        auth, fingerprint, operation = record
        if (not auth or self.issued.get(auth.request_sequence) != auth or
                not auth.client_message_id or auth.conversation_id != g.session_id or
                auth.client_message_id != g.client_message_id or auth.user_turn_hash != digest(g.user_message) or
                auth.turn_contract_id != g.turn_contract.turn_contract_id or
                time.monotonic() - auth.issued_at > 300 or fingerprint != digest(action)):
            return False
        from src.agents.semantic_registry import operation_registry
        op = operation_registry().get(action.get('operation'))
        if not g.turn_contract.eligibility(op, action)[0]:
            # A retained, already accepted compound sibling remains authorized
            # by that exact journal; an arbitrary stale proposal does not.
            retained = bool(g.semantic_plan and any(
                row['proposal'] == action and row['status'] in {'PENDING', 'EXECUTING', 'NEEDS_REPAIR'}
                for row in g.semantic_plan.actions))
            if not retained:
                return False
        if consume:
            self.consumed.add(token)
        return True


def public_protocol_result(value):
    """Internal authorization never enters provider history, UI or result logs."""
    if isinstance(value, dict):
        return {k: public_protocol_result(v) for k, v in value.items()
            if k not in {'_turn_authorization_id', '_provider_operation'}}
    if isinstance(value, list):
        return [public_protocol_result(v) for v in value]
    return value


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
        separators=(',', ':'), default=str).encode()).hexdigest()


def safe_key(key):
    return key if isinstance(key, str) and re.fullmatch(r'[A-Za-z_][A-Za-z_0-9]{0,79}', key) else 'key_' + digest(key)[:12]


def first_failure(value, spec, path=''):
    """Return exactly one deterministic, value-free failure and JSON pointer."""
    kind = spec.get('type')
    matches = {'object': isinstance(value, dict), 'array': isinstance(value, list),
        'integer': type(value) is int, 'number': type(value) in (int, float),
        'string': isinstance(value, str), 'boolean': type(value) is bool}
    if not matches.get(kind, True):
        code = 'invalid_ordinal_type' if path.endswith('/reference/index') else 'invalid_argument_shape'
        return code, path
    if kind == 'object':
        props = spec.get('properties', {})
        unknown = sorted(set(value) - set(props), key=str)
        if unknown and spec.get('additionalProperties') is False:
            return 'unknown_field', path + '/' + safe_key(unknown[0])
        for key in spec.get('required', []):
            if key not in value:
                return 'missing_required_field', path + '/' + key
        for key in sorted(value):
            if key in props:
                failure = first_failure(value[key], props[key], path + '/' + key)
                if failure:
                    return failure
        if path.endswith('/reference'):
            refkind = value.get('kind')
            needed = 'index' if refkind == 'ordinal' else 'value' if refkind in {'id', 'name', 'literal'} else None
            if needed and needed not in value:
                return 'missing_required_field', path + '/' + needed
            if ('value' in value and refkind not in {'id', 'name', 'literal'} or
                    'index' in value and refkind != 'ordinal'):
                return 'invalid_reference_shape', path
    elif kind == 'array':
        if not spec.get('minItems', 0) <= len(value) <= spec.get('maxItems', 9999):
            return 'invalid_argument_shape', path
        for index, item in enumerate(value):
            failure = first_failure(item, spec['items'], path + '/' + str(index))
            if failure:
                return failure
    elif kind in {'integer', 'number'}:
        if not spec.get('minimum', float('-inf')) <= value <= spec.get('maximum', float('inf')):
            return 'invalid_argument_shape', path
    elif kind == 'string':
        if not spec.get('minLength', 0) <= len(value.strip()) or len(value) > spec.get('maxLength', 2000):
            return 'invalid_argument_shape', path
    if 'enum' in spec and value not in spec['enum']:
        return ('invalid_reference_kind' if path.endswith('/reference/kind') else
            'commitment_not_allowed' if path == '/commitment' else 'invalid_argument_shape'), path
    return None


def validation_event(gateway, name, payload, spec, *, parsed=True, rules=(), failure=None, stage='wire'):
    schema_failure = first_failure(payload, spec) if parsed else ('invalid_json', '')
    failure = failure or schema_failure
    data = payload if isinstance(payload, dict) else {}
    references = [item.get('reference') for item in data.get('selections', [])
        if isinstance(item, dict)] if isinstance(data.get('selections'), list) else [data.get('reference')]
    references = [r for r in references if isinstance(r, dict)]
    ref = references[0] if references else {}
    snapshot = gateway.product_display_snapshot
    event = {'turn_contract_id': gateway.turn_contract.turn_contract_id,
        'operation_name': safe_key(name), 'validation_stage': stage,
        'schema_valid': schema_failure is None if spec.get('type') else failure is None, 'json_parse_valid': parsed,
        'failure_class': ('PROVIDER_ENVELOPE_PROTOCOL' if stage == 'provider_envelope' else
            'SEMANTIC_GROUNDING' if stage == 'grounding' else
            'BUSINESS_POLICY' if stage in {'business', 'authorization'} else 'SEMANTIC_WIRE_PROTOCOL') if failure else None,
        'argument_keys': sorted(safe_key(k) for k in data),
        'argument_type_summary': {safe_key(k): {'type': type(v).__name__,
            **({'length': len(v), 'hash': digest(v)} if isinstance(v, str) else {})} for k, v in data.items()},
        'unknown_argument_keys': sorted(safe_key(k) for k in set(data) - set(spec.get('properties', {}))),
        'missing_required_keys': sorted(set(spec.get('required', [])) - set(data)),
        'reference_present': bool(references), 'reference_kind': ref.get('kind') if isinstance(ref.get('kind'), str) and ref.get('kind') in
            {'ordinal', 'id', 'name', 'focus', 'singleton', 'pending', 'recent', 'best', 'literal'} else None,
        'reference_index_type': type(ref['index']).__name__ if 'index' in ref else None,
        'commitment_present': 'commitment' in data,
        'commitment_value': data.get('commitment') if isinstance(data.get('commitment'), str) and data.get('commitment') in
            {'SELECTED', 'AFFIRMED', 'REJECTED', 'NEGATED', 'QUESTION', 'HYPOTHETICAL', 'CONDITIONAL', 'CORRECTION', 'UNKNOWN'} else None,
        'evidence_present': 'evidence' in data,
        'evidence_exact_match': bool(isinstance(data.get('evidence'), str) and data['evidence'].strip()
            and data['evidence'] in gateway.user_message),
        'normalization_applied': bool(rules), 'normalization_rules': list(rules),
        'failure_code': failure[0] if failure else None,
        'failure_field': failure[1].rsplit('/', 1)[-1] if failure else None,
        'failure_json_pointer': failure[1] if failure else None,
        'repair_target_operation': gateway.turn_contract.repair_target,
        'entry_snapshot_id': snapshot.snapshot_id, 'entry_snapshot_fingerprint': snapshot.fingerprint}
    logger.info('[SemanticProtocolValidation] %s', json.dumps(event, sort_keys=True))
    return event
