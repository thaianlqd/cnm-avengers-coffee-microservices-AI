"""Only failed reference paths may change, before any guarded write."""
from copy import deepcopy
import json
import logging
import pytest
from hybrid_support import runtime, hybrid, command as c, envelope as e, send, pending, no_cart
from test_hybrid_product_reference_spaces import grouped, capture
from src.agents.hybrid_reference_repair import apply_patch, frozen_fingerprint
from src.agents.hybrid_diagnostics import snapshot, reset
from src.agents.agent_memory import ConversationMemory
from src.agents.product_collections import publication
from src.common import cart_manager
from src.function_calling.tools import cart_tools, product_tools
from src.agents.tool_policy import MutationOutcomeUnknown

PATHS = ['/commands/0/args/references/0', '/commands/0/args/references/1']


def lost():
    return e(c('SELECT_PRODUCTS', mode='EXPLICIT', references=[
        {'kind': 'ordinal', 'index': 1, 'quantity': 1}, {'kind': 'ordinal', 'index': 1, 'quantity': 2}]))


def patch(paths=PATHS):
    return {'reference_repairs': [{'path': path, 'reference': {'kind': 'group_ordinal', 'group': group, 'index': 1}}
        for path, group in zip(paths, ['drink', 'food'])]}


def script(rt, *values):
    rt.provider.steps = [{'content': json.dumps(value, ensure_ascii=False) if not isinstance(value, str) else value} for value in values]


@pytest.mark.parametrize('legacy', [False, True])
def test_lost_namespace_recovers_in_one_customer_message(hybrid, legacy, caplog):
    no_cart(hybrid)
    grouped(hybrid)
    if legacy:
        memory = ConversationMemory(hybrid.redis).load(hybrid.sid)
        for row in memory['visible_snapshots']['products']:
            row['display_index'] = row['global_display_index']
        memory['product_display'] = publication({}, memory['visible_snapshots'], ['drink', 'food'], 'legacy_fixture')
        memory['product_display']['numbering'] = 'global'
        ConversationMemory(hybrid.redis).save(hybrid.sid, memory)
    reset(); caplog.set_level(logging.INFO)
    script(hybrid, lost(), patch())
    result = hybrid.turn('cho tôi nước số 1 và bánh số 1 2 cái nhé b')
    assert not result['error'] and result['provider_request_count'] == 2
    assert [(r['product_id'], r['quantity']) for r in pending(hybrid)] == [('101', 1), ('103', 2)]
    assert not hybrid.writes and len(hybrid.provider.requests) == 2
    assert snapshot()['reference_repair_recovery'] == 1
    assert '[HybridReferenceRepair]' in caplog.text and '"success": true' in caplog.text
    repair_context = hybrid.provider.requests[-1]['messages'][0]['content']
    assert 'product_id' not in repair_context and 'filter_catalog' not in repair_context and '"101"' not in repair_context


def test_repair_must_preflight_other_commands_before_writes(hybrid):
    grouped(hybrid)
    original = lost()
    original['commands'] += [c('EDIT_CART', changes=[{'action': 'REMOVE', 'target': {'kind': 'cart_ordinal', 'index': 1}}]),
                            c('SELECT_BRANCH', target={'kind': 'ordinal', 'index': 999})]
    script(hybrid, original, patch())
    result = hybrid.turn('lấy nước số 1 và bánh số 1 hai cái rồi bỏ dòng đầu trong giỏ, chọn chi nhánh số 999')
    assert result['failure_class'] == 'REFERENCE_REPAIR_FAILED'
    assert result['repair_failure_code'] == 'unknown_reference' and not hybrid.writes and not pending(hybrid)
    assert len(cart_manager.get_cart(hybrid.sid)['items']) == 2


def test_only_failed_reference_is_patchable(hybrid):
    grouped(hybrid)
    original = e(c('SELECT_PRODUCTS', mode='EXPLICIT', references=[
        {'kind': 'group_ordinal', 'group': 'drink', 'index': 2}, {'kind': 'ordinal', 'index': 1, 'quantity': 2}]))
    bad_patch = patch(['/commands/0/args/references/0', '/commands/0/args/references/1'])
    script(hybrid, original, bad_patch)
    result = hybrid.turn('nước số 2 và bánh số 1 hai cái')
    assert result['repair_failure_code'] == 'reference_patch_scope_mismatch' and not pending(hybrid) and not hybrid.writes


def test_patch_preserves_accepted_compound_meaning_exactly():
    original = lost()
    original['commands'] += [c('CONFIGURE_PRODUCT', target={'kind': 'name', 'value': 'Cà Phê Alpha'},
        options={'size': 'L', 'toppings': ['Foam']}, quantity=1), c('SET_PAYMENT', target={'kind': 'name', 'value': 'QR'}),
        c('SET_FULFILLMENT', mode='pickup')]
    before = deepcopy(original)
    repaired, error = apply_patch(original, PATHS, json.dumps(patch()))
    assert not error and original == before and repaired['commands'][1:] == before['commands'][1:]
    assert [r['quantity'] for r in repaired['commands'][0]['args']['references']] == [1, 2]
    assert frozen_fingerprint(repaired, PATHS) == frozen_fingerprint(original, PATHS)


@pytest.mark.parametrize('attack', [
    lambda p: {**p, 'commands': [c('CONFIRM_CHECKOUT')]},
    lambda p: {**p, 'payment_method': 'COD'},
    lambda p: {**p, 'quantity': 20},
    lambda p: {'reference_repairs': [*p['reference_repairs'], p['reference_repairs'][0]]},
    lambda p: {'reference_repairs': p['reference_repairs'][:1]},
    lambda p: {'reference_repairs': []},
    lambda p: {'reference_repairs': [{'path': PATHS[0], 'reference': {'kind': 'id', 'value': '103'}}, p['reference_repairs'][1]]},
    lambda p: {'reference_repairs': [{'path': PATHS[0], 'reference': {'kind': 'group_ordinal', 'group': 'food', 'index': 1, 'quantity': 9}}, p['reference_repairs'][1]]},
    lambda p: {'reference_repairs': [{'path': '/commands/0/args/mode', 'reference': p['reference_repairs'][0]['reference']}, p['reference_repairs'][1]]},
])
def test_patch_freeze_adversarial_shapes_rejected(attack):
    original = lost(); before = deepcopy(original)
    assert apply_patch(original, PATHS, json.dumps(attack(patch())))[1]
    assert original == before


def test_format_then_reference_repair_is_three_total(hybrid):
    grouped(hybrid)
    script(hybrid, '{broken', lost(), patch())
    result = hybrid.turn('nước số 1 và bánh số 1 hai cái')
    assert not result['error'] and result['provider_request_count'] == len(hybrid.provider.requests) == 3
    assert [(r['product_id'], r['quantity']) for r in pending(hybrid)] == [('101', 1), ('103', 2)]


def test_failover_attempts_share_the_three_request_budget(hybrid, monkeypatch):
    from src.common import groq_service
    grouped(hybrid)
    monkeypatch.setenv('AI_AGENT_FALLBACK_PROVIDERS', 'openai')
    monkeypatch.setenv('OPENAI_API_KEY', 'fixture-only-key')
    monkeypatch.setenv('AI_AGENT_MAX_PROVIDER_ATTEMPTS_PER_ROUND', '2')
    monkeypatch.setattr(groq_service, 'OpenAIClient', lambda *a, **k: hybrid.provider)
    script(hybrid, lost(), patch())
    hybrid.provider.steps.insert(0, TimeoutError('offline timeout'))
    result = hybrid.turn('nước số 1 và bánh số 1 hai cái')
    assert not result['error'] and result['provider_request_count'] == len(hybrid.provider.requests) == 3


@pytest.mark.parametrize('bad', ['{broken', json.dumps(patch([PATHS[0]])), json.dumps(lost()),
    json.dumps({'reference_repairs': [{'path': path, 'reference': {'kind': 'ordinal', 'index': 1}} for path in PATHS]})])
def test_failed_repair_stops_without_fourth_call(hybrid, bad):
    grouped(hybrid)
    script(hybrid, '{broken', lost(), bad)
    result = hybrid.turn('nước số 1 và bánh số 1 hai cái')
    assert result['failure_class'] == 'REFERENCE_REPAIR_FAILED' and result['provider_request_count'] == 3
    assert not hybrid.writes and not pending(hybrid) and 'nước số 1' in result['reply']


def test_successful_write_is_not_repeated_after_later_business_failure(hybrid, monkeypatch):
    grouped(hybrid)
    from src.function_calling.tools import TOOL_EXECUTORS
    monkeypatch.setitem(TOOL_EXECUTORS, 'get_product_options', lambda args, sid: {
        'status': 'ok', 'product_id': args['product_id'], 'product_name': next(r['product_name'] for r in hybrid.products if r['product_id'] == args['product_id']), 'option_groups': []})
    # Gateway calls the product service directly for canonical options.
    monkeypatch.setattr(product_tools, 'execute_get_product_options', lambda product_id=None, **k: {
        'status': 'ok', 'product_id': product_id, 'product_name': next(r['product_name'] for r in hybrid.products if r['product_id'] == product_id), 'option_groups': []})
    original = cart_tools.execute_add_to_cart
    def add(**args):
        if args['product_id'] == '103':
            return {'status': 'out_of_stock', 'message': 'Món bánh đã hết.'}
        return original(**args)
    monkeypatch.setattr(cart_tools, 'execute_add_to_cart', add)
    script(hybrid, lost(), patch())
    result = hybrid.turn('nước số 1 và bánh số 1 hai cái', client_message_id='repair-partial')
    replay = hybrid.turn('nước số 1 và bánh số 1 hai cái', client_message_id='repair-partial')
    assert result == replay and result['failure_class'] == 'BUSINESS_POLICY'
    assert len(hybrid.writes) == 1 and len(hybrid.provider.requests) == 2


def test_unknown_write_never_triggers_repair(hybrid, monkeypatch):
    monkeypatch.setattr(cart_tools, 'execute_update_cart_item', lambda *a, **k: (_ for _ in ()).throw(TypeError('unknown commit')))
    script(hybrid, e(c('EDIT_CART', changes=[{'action': 'SET_QUANTITY', 'target': {'kind': 'cart_ordinal', 'index': 1}, 'quantity': 2}])))
    with pytest.raises(MutationOutcomeUnknown):
        hybrid.turn('dòng 1 trong giỏ cho 2 cái')
    assert len(hybrid.provider.requests) == 1


def test_exact_four_turn_reproduction(hybrid):
    no_cart(hybrid)
    send(hybrid, c('DISCOVER_PRODUCTS', scope='drink'), text='hi cho tôi xem menu nước đi bạn')
    mixed = send(hybrid, c('DISCOVER_PRODUCTS', scope='all', requested_groups=['drink', 'food']), text='cho tôi xem menu nước và bánh đi bạn')
    assert {r['menu_bucket'] for r in mixed['ui_payload']['products']} == {'drink', 'food'}
    send(hybrid, c('DISCOVER_PRODUCTS', scope='food'), text='mới có nước thôi mà bánh đâu bạn')
    result = send(hybrid, c('SELECT_PRODUCTS', mode='EXPLICIT', references=[
        {'kind': 'group_ordinal', 'group': 'drink', 'index': 1},
        {'kind': 'group_ordinal', 'group': 'food', 'index': 1, 'quantity': 2}]), text='cho tôi nước số 1 và bánh số 1 2 cái nhé b')
    assert not result['error'] and [(r['product_id'], r['quantity']) for r in pending(hybrid)] == [('101', 1), ('103', 2)]
    assert not hybrid.writes and result['provider_request_count'] == 1
