"""Network-free production wire, authorization and atomic selection regressions."""
from copy import deepcopy
from dataclasses import replace
import json
import pytest
from test_semantic_control import runtime, compatibility_runtime, gateway_for
from test_product_display_snapshot import five
from test_semantic_registry_contract import calls, assert_closed
from src.agents.semantic_protocol import (BATCH_SELECT, NORMALIZATION_RULES, normalize_arguments,
    first_failure, provider_schemas, base_operation)
from src.agents.semantic_registry import operation_registry
from src.common import cart_manager


def selections(*indices):
    return {'selections': [{'reference': {'kind': 'ordinal', 'index': i}} for i in indices]}


def gateway(rt):
    g = gateway_for(rt, 'Synthetic semantic meaning, no echoed span')
    g.provider_tool_surface()
    return g


def test_all_provider_schemas_drop_authority_echoes():
    ops = list(operation_registry().values())
    rows = provider_schemas(ops)
    assert len(rows) == len(ops) + 3
    assert BATCH_SELECT in {r['function']['name'] for r in rows}
    assert 'semantic_select_product' not in {r['function']['name'] for r in rows}
    for row in rows:
        spec = row['function']['parameters']
        assert_closed(spec)
        assert not {'commitment', 'evidence', 'user_id', 'cart_id'} & set(spec['properties'])
        assert base_operation(row['function']['name']) in operation_registry()
    assert all(op.server_commitment in op.allowed_commitments for op in ops)


@pytest.mark.parametrize('indices', [(1,), (1, 3), (1, 2, 4)])
def test_batch_one_call_freezes_all_ids_before_any_staging(five, monkeypatch, indices):
    g = gateway(five)
    original = g._get_product_options
    observed = []
    def stage(args):
        assert [r['bound_product_id'] for r in g.semantic_plan.actions] == [str(100+i) for i in indices]
        observed.append(args['product_id'])
        return original(args)
    g.handlers['get_product_options'] = stage
    result = g.provider_calls(calls((BATCH_SELECT, selections(*indices))))
    assert len(result) == 1 and result[0]['remaining_actions'] == 0
    assert observed == [str(100+i) for i in indices]
    assert [r['product_id'] for r in cart_manager.get_checkout_prefs(five.sid)['pending_products']] == observed
    assert not five.writes
    assert '_turn_authorization_id' not in json.dumps(result)
    assert all(r['product_snapshot_fingerprint'] == g.product_display_snapshot.fingerprint for r in g.semantic_plan.actions)


@pytest.mark.parametrize('bad,code,path', [
    ({}, 'missing_required_field', '/selections/1/reference'),
    ({'reference': {'kind': 'banana'}}, 'invalid_reference_kind', '/selections/1/reference/kind'),
    ({'reference': {'kind': 'ordinal', 'index': '03'}}, 'invalid_ordinal_type', '/selections/1/reference/index'),
    ({'reference': {'kind': 'ordinal', 'index': 99}}, 'canonical_target_unresolved', '/selections/1/reference'),
    ({'reference': {'kind': 'ordinal', 'index': 1}}, 'duplicate_canonical_target', '/selections/1/reference'),
    ({'reference': {'kind': 'ordinal', 'index': 3}, 'unknown': True}, 'unknown_field', '/selections/1/unknown'),
])
def test_invalid_second_item_has_zero_partial_staging(five, bad, code, path):
    g = gateway(five)
    payload = selections(1)
    payload['selections'].append(bad)
    result = g.provider_calls(calls((BATCH_SELECT, payload)))[0]
    assert result['failure_code'] == code and result['failure_json_pointer'] == path
    assert not g.semantic_plan and not five.writes
    assert not cart_manager.get_checkout_prefs(five.sid).get('pending_products')


def test_structural_normalization_avoids_repair(five):
    g = gateway(five)
    result = g.provider_calls(calls((BATCH_SELECT, {'selections': {'reference': {'kind': 'ordinal', 'index': '3'}, 'quantity': '2'}})))[0]
    assert result['remaining_actions'] == 0
    draft = cart_manager.get_checkout_prefs(five.sid)['pending_products'][0]
    assert draft['product_id'] == '103' and draft['quantity'] == 2


@pytest.mark.parametrize('raw,expected', [('3', 3), ('03', '03'), ('+3', '+3'), ('3.0', '3.0'), (' 3', ' 3'), (True, True)])
def test_integer_normalizer_is_canonical_and_schema_driven(raw, expected):
    value, rules, parsed = normalize_arguments({'n': raw, 'name': raw},
        {'type': 'object', 'properties': {'n': {'type': 'integer'}, 'name': {'type': 'string'}}}, 'semantic_fixture')
    assert value['n'] == expected and value['name'] == raw and parsed
    assert set(rules) <= NORMALIZATION_RULES.keys()
    assert ('canonical_integer' in rules) == (raw == '3')


def test_retry_cannot_change_known_targets_or_count(five):
    g = gateway(five)
    bad = selections(1, 'bad')
    assert g.provider_calls(calls((BATCH_SELECT, bad)))[0]['recovery_kind'] == 'model_repair'
    g.provider_tool_surface()
    result = g.provider_calls(calls((BATCH_SELECT, selections(2, 3))))[0]
    assert result['failure_code'] == 'canonical_target_changed' and not g.semantic_plan
    assert not cart_manager.get_checkout_prefs(five.sid).get('pending_products')


@pytest.mark.parametrize('tamper', ['missing', 'other_turn', 'surface', 'expired', 'replay', 'payload'])
def test_server_authorization_rejects_forgery_staleness_and_replay(five, tamper):
    g = gateway(five)
    assert g.provider_calls(calls((BATCH_SELECT, selections(1))))[0]['remaining_actions'] == 0
    action = deepcopy(g.semantic_plan.actions[0]['proposal'])
    ledger = g.turn_authorizations
    token = action['_turn_authorization_id']
    # A fresh proof for the exact proposal, without replaying a business action.
    ledger.consumed.clear()
    if tamper == 'missing':
        ledger.records.clear()
    elif tamper == 'other_turn':
        g.client_message_id = 'different-turn'
    elif tamper == 'surface':
        other = gateway_for(five)
        assert not other.turn_authorizations.verify(action)
        return
    elif tamper == 'expired':
        auth, fingerprint, op = ledger.records[token]
        ledger.records[token] = (replace(auth, issued_at=auth.issued_at-301), fingerprint, op)
    elif tamper == 'replay':
        assert ledger.verify(action, consume=True)
    elif tamper == 'payload':
        action['args']['quantity'] = 999
    result = g.execute_semantic(action)
    assert result['failure_code'] == 'current_turn_authorization_missing'
    assert not five.writes


def test_unadvertised_legacy_and_authority_fields_fail_closed(five):
    g = gateway(five)
    result = g.provider_calls(calls(('semantic_select_product', {'reference': {'kind': 'ordinal', 'index': 1}})))[0]
    assert result['failure_code'] == 'operation_not_exposed'
    g.provider_tool_surface()
    result = g.provider_calls(calls((BATCH_SELECT, {**selections(1), 'commitment': 'SELECTED', 'evidence': g.user_message})))[0]
    assert result['failure_code'] == 'unknown_field' and not five.writes and not g.semantic_plan


def test_repeated_response_cannot_replay(five):
    g = gateway(five)
    wire = calls((BATCH_SELECT, selections(1)))
    g.provider_calls(wire)
    assert g.provider_calls(wire)[0]['failure_code'] == 'current_turn_authorization_missing'


@pytest.mark.parametrize('references,quantities', [
    ([{'kind': 'ordinal', 'index': 1}, {'kind': 'ordinal', 'index': 3}], [2, 1]),
    ([{'kind': 'name', 'value': 'Product Alpha'}, {'kind': 'ordinal', 'index': 3}], [1, 1]),
    ([{'kind': 'focus'}, {'kind': 'ordinal', 'index': 3}], [1, 1]),
])
def test_mixed_batch_references_and_quantities_keep_frozen_identity(five, references, quantities):
    g = gateway(five)
    payload = {'selections': [{'reference': ref, 'quantity': qty} for ref, qty in zip(references, quantities)]}
    result = g.provider_calls(calls((BATCH_SELECT, payload)))[0]
    assert result['remaining_actions'] == 0
    drafts = cart_manager.get_checkout_prefs(five.sid)['pending_products']
    assert [(p['product_id'], p['quantity']) for p in drafts] == list(zip(['101', '103'], quantities))
    assert not five.writes


def test_unadvertised_read_cannot_bypass_repair_surface(five):
    g = gateway(five)
    g.provider_calls(calls((BATCH_SELECT, {'selections': [{}]})))
    g.provider_tool_surface()
    available = set(g.turn_authorizations.schemas)
    op = next(op for op in operation_registry().values() if op.access == 'READ' and op.function_name not in available)
    result = g.provider_calls(calls((op.function_name, {})))[0]
    assert result['failure_code'] == 'operation_not_exposed'
    assert not five.reads and not five.writes and not g.semantic_plan


def test_read_question_does_not_select(five):
    g = gateway(five)
    assert 'semantic_ask_product_price' in g.turn_authorizations.schemas
    result = g.provider_calls(calls(('semantic_ask_product_price', {'reference': {'kind': 'ordinal', 'index': 1}})))[0]
    assert result['remaining_actions'] == 0 and not five.writes
    assert not cart_manager.get_checkout_prefs(five.sid).get('pending_products')


def test_scripted_negation_no_write_envelope_keeps_state(five):
    five.provider.steps = [{'content': json.dumps({'response_kind': 'social', 'reply': 'Synthetic acknowledgement',
        'mutation_claims': [], 'evidence_quotes': []})}]
    result = five.turn('Synthetic negation: do not select a product')
    assert result['error'] is None and len(five.provider.requests) == 1
    assert not five.writes and not cart_manager.get_checkout_prefs(five.sid).get('pending_products')


def test_adversarial_final_write_without_confirmation_is_not_exposed(five):
    g = gateway(five)
    # Authorization proves turn provenance, not the meaning of this question.
    g.user_message = 'Synthetic question about whether checkout is possible'
    g.provider_tool_surface()
    result = g.provider_calls(calls(('semantic_confirm_checkout', {})))[0]
    assert result['failure_code'] == 'operation_not_exposed'
    assert not five.writes
