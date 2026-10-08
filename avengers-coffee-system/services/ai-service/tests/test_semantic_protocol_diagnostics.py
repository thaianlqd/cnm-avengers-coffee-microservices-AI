import json
from types import SimpleNamespace
import pytest
from src.agents.semantic_protocol import first_failure, validation_event
from src.agents.semantic_registry import operation_registry


@pytest.mark.parametrize('payload,code,path', [
    ([], 'invalid_argument_shape', ''),
    ({}, 'missing_required_field', '/commitment'),
    ({'foreign': 'private address'}, 'unknown_field', '/foreign'),
    ({'commitment': 'QUESTION', 'evidence': 'secret', 'reference': {'kind': 'focus'}}, 'commitment_not_allowed', '/commitment'),
    ({'commitment': 'SELECTED', 'evidence': 'secret', 'reference': {'kind': 'ordinal', 'index': '3'}},
        'invalid_ordinal_type', '/reference/index'),
    ({'commitment': 'SELECTED', 'evidence': 'secret', 'reference': {'kind': 'unknown'}},
        'invalid_reference_kind', '/reference/kind'),
])
def test_exact_diagnostic(payload, code, path, caplog):
    spec = operation_registry()['semantic_select_product'].parameters()
    g = SimpleNamespace(user_message='secret', turn_contract=SimpleNamespace(turn_contract_id='contract', repair_target=None),
        product_display_snapshot=SimpleNamespace(snapshot_id='snapshot', fingerprint='fingerprint'))
    with caplog.at_level('INFO'):
        event = validation_event(g, 'semantic_select_product', payload, spec)
    assert (event['failure_code'], event['failure_json_pointer']) == (code, path)
    assert 'secret' not in caplog.text and 'private address' not in caplog.text
    assert event['entry_snapshot_fingerprint'] == 'fingerprint'
    assert json.dumps(event)


def test_invalid_json_has_one_code():
    assert first_failure(None, {'type': 'object'}) == ('invalid_argument_shape', '')


def test_grounding_failure_keeps_wire_schema_valid_and_exact_pointer(caplog):
    from src.agents.semantic_protocol import provider_schemas
    spec = provider_schemas([operation_registry()['semantic_select_product']])[0]['function']['parameters']
    g = SimpleNamespace(user_message='private', turn_contract=SimpleNamespace(turn_contract_id='contract', repair_target=None),
        product_display_snapshot=SimpleNamespace(snapshot_id='snapshot', fingerprint='fingerprint'))
    event = validation_event(g, 'semantic_select_products', {'selections': [{'reference': {'kind': 'ordinal', 'index': 9}}]},
        spec, failure=('canonical_target_unresolved', '/selections/0/reference'), stage='grounding')
    assert event['schema_valid'] and event['json_parse_valid']
    assert event['failure_class'] == 'SEMANTIC_GROUNDING'
    assert event['failure_json_pointer'] == '/selections/0/reference'


def test_unknown_key_cannot_put_sensitive_values_in_diagnostics(caplog):
    g = SimpleNamespace(user_message='private message', turn_contract=SimpleNamespace(turn_contract_id='contract', repair_target=None),
        product_display_snapshot=SimpleNamespace(snapshot_id='snapshot', fingerprint='fingerprint'))
    with caplog.at_level('INFO'):
        event = validation_event(g, 'semantic_fixture', {'private address / 17 secret road': 'private credential'},
            {'type': 'object', 'properties': {}, 'additionalProperties': False})
    assert 'private address' not in caplog.text and 'private credential' not in caplog.text
    assert event['failure_code'] == 'unknown_field' and event['failure_json_pointer'].startswith('/key_')
