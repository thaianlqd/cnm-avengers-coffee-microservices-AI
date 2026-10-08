"""Scripted turn continuity, drift, interrupts and bounded repair journeys."""
from copy import deepcopy
import json
import logging
import pytest
from src.agents.semantic_registry import operation_registry
from test_semantic_control import runtime, compatibility_runtime, gateway_for
from test_description_recommendations import descriptions
from test_chatbot_semantic_regressions import option_authority
from test_typed_semantic_journeys import send, ref
from test_semantic_repair_modes import step, metrics
from test_semantic_dialogue_repairs import final
from test_semantic_registry_contract import calls
from src.agents.tool_artifacts import ToolArtifacts
from src.common import cart_manager
from src.function_calling import tools


def stage(rt):
    send(rt, 'Fixture selected product', ('SELECT_PRODUCT', {'reference': ref('101')}))
    assert not rt.writes


def configure():
    return step('configure_product', {'commitment': 'SELECTED', 'evidence': 'Fixture configuration', 'size': 'M'})


def interrupt(domain):
    return step('interrupt', {'target_domain': domain})


@pytest.mark.parametrize('wrong', ['read_menu', 'read_order_history', 'read_payment_options'])
def test_pre_tool_wrong_valid_read_then_configuration_recovers_without_repeat(runtime, descriptions, caplog, wrong):
    caplog.set_level(logging.INFO)
    cart_manager.replace_items_from_order_cart(runtime.sid, [])
    suggested = send(runtime, 'Fixture suitable beverage', ('RECOMMEND_BY_PREFERENCE', {
        'scope': 'drink', 'concepts': ['thanh mát', 'chua nhẹ'], 'planned_discovery_reads': 1}))
    assert [p['product_id'] for p in suggested['ui_payload']['products']] == ['101']
    stage(runtime)
    count = len(runtime.provider.requests)
    runtime.provider.steps = [{'content': '{broken'}, step(wrong, {}), configure()]
    result = runtime.turn('Fixture configuration', client_message_id='continuity-once')
    assert result['error'] is None and len(runtime.provider.requests) - count == 3
    assert len(runtime.writes) == 1 and runtime.writes[0][1]['product_id'] == '101'
    assert all(r['tool'] not in {'get_menu_categories', 'get_order_history', 'get_payment_options'} for r in result['tool_calls_log'])
    assert not result['ui_payload']['products'] and not result['ui_payload']['branches']
    surface = {r['function']['name'] for r in runtime.provider.requests[count + 1]['tools']}
    assert surface == {'semantic_configure_product', 'semantic_use_product_defaults', 'semantic_ask_product_options', 'semantic_interrupt'}
    assert metrics(caplog)['turn_progress'] == 'COMPLETED'
    assert metrics(caplog)['protocol_repair_count'] == 1
    assert 'operation_outside_turn_contract' in caplog.text
    before = len(runtime.provider.requests)
    assert runtime.turn('Fixture configuration', client_message_id='continuity-once') == result
    assert len(runtime.provider.requests) == before and len(runtime.writes) == 1


@pytest.mark.parametrize('protocol_first', [False, True])
def test_exact_option_prerequisite_requires_continuation_then_primary(runtime, caplog, protocol_first):
    caplog.set_level(logging.INFO)
    stage(runtime)
    count = len(runtime.provider.requests)
    bad = step('configure_product', {'commitment': 'SELECTED', 'evidence': 'Fixture configuration', 'size': 'M', 'foreign': True})
    runtime.provider.steps = [bad if protocol_first else {'content': '{broken'},
        step('ask_product_options', {'reference': ref('101')}), configure()]
    result = runtime.turn('Fixture configuration')
    assert result['error'] is None and len(runtime.writes) == 1
    assert len(runtime.provider.requests) - count == 3
    assert 'PREREQUISITE_COMPLETED' in caplog.text and metrics(caplog)['turn_progress'] == 'COMPLETED'
    if protocol_first:
        names = {r['function']['name'] for r in runtime.provider.requests[count + 1]['tools']}
        assert names == {'semantic_configure_product', 'semantic_ask_product_options'}


@pytest.mark.parametrize('pattern', ['twice_wrong', 'two_wrong_in_batch', 'extra_unrelated_sibling', 'malformed_interrupt', 'repeat_prerequisite'])
def test_repair_fuzz_is_bounded_and_preserves_state(runtime, pattern):
    stage(runtime)
    before = deepcopy(cart_manager.get_cart(runtime.sid)['items'])
    first = {'content': '{broken'}
    wrong = step('read_menu', {})
    if pattern == 'twice_wrong':
        scripted = [first, wrong, step('read_order_history', {})]
    elif pattern == 'two_wrong_in_batch':
        mixed = step('read_menu', {})
        other = step('read_order_history', {})
        other['tool_calls'][0]['id'] = 'other'
        mixed['tool_calls'] += other['tool_calls']
        scripted = [first, mixed, configure()]
    elif pattern == 'extra_unrelated_sibling':
        mixed = configure()
        wrong['tool_calls'][0]['id'] = 'other'
        mixed['tool_calls'] += wrong['tool_calls']
        scripted = [first, mixed, configure()]
    elif pattern == 'malformed_interrupt':
        scripted = [first, step('interrupt', {'target_domain': 'UNKNOWN'}), configure()]
    else:
        scripted = [first, step('ask_product_options', {'reference': ref('101')}),
            step('ask_product_options', {'reference': ref('101')}), configure()]
    count = len(runtime.provider.requests)
    runtime.provider.steps = scripted
    result = runtime.turn('Fixture configuration')
    assert len(runtime.provider.requests) - count <= 4
    assert not any(row['tool'] in {'get_menu_categories', 'get_order_history'} for row in result['tool_calls_log'])
    assert not result['ui_payload']['products'] and not result['ui_payload']['branches'] and not result['ui_payload']['vouchers']
    if pattern == 'twice_wrong':
        assert result['error_class'] == 'MODEL_PROTOCOL' and result['error'] == 'semantic_repair_exhausted'
        assert not runtime.writes and cart_manager.get_cart(runtime.sid)['items'] == before
        assert 'lỗi diễn giải' in result['reply'] and 'chưa nói rõ' not in result['reply']
    else:
        assert result['error'] is None and len(runtime.writes) == 1


@pytest.mark.parametrize('malformed_first', [False, True])
def test_safe_discovery_interrupt_preserves_pending_then_returns_new_cards(runtime, malformed_first):
    stage(runtime)
    pending = deepcopy(cart_manager.get_checkout_prefs(runtime.sid)['pending_products'])
    count = len(runtime.provider.requests)
    runtime.provider.steps = ([{'content': '{broken'}] if malformed_first else []) + [interrupt('DISCOVERY'),
        step('discover_products', {'scope': 'drink', 'product_family': 'Beta', 'planned_discovery_reads': 1})]
    result = runtime.turn('Fixture genuine change of mind')
    assert result['error'] is None and len(runtime.provider.requests) - count == 2 + malformed_first
    assert [p['product_id'] for p in result['ui_payload']['products']] == ['102']
    assert cart_manager.get_checkout_prefs(runtime.sid)['pending_products'] == pending and not runtime.writes
    names = {r['function']['name'] for r in runtime.provider.requests[-1]['tools']}
    assert 'semantic_discover_products' in names and 'semantic_configure_product' not in names


def test_faq_interrupt_answer_preserves_pending_and_does_not_auto_resume(runtime, monkeypatch):
    stage(runtime)
    pending = deepcopy(cart_manager.get_checkout_prefs(runtime.sid)['pending_products'])
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'search_knowledge_base', lambda args, sid: {
        'status': 'not_found', 'results': [], 'message': 'Chưa có chính sách đã xác minh.'})
    runtime.provider.steps = [interrupt('RAG_KNOWLEDGE'),
        step('ask_knowledge', {'query': 'Fixture opening policy', 'domain': 'faq'}),
        final('consultation', 'Mình chưa có thông tin chính sách đã xác minh.')]
    result = runtime.turn('Fixture FAQ interruption')
    assert result['error'] is None and not runtime.writes
    assert cart_manager.get_checkout_prefs(runtime.sid)['pending_products'] == pending
    assert len(runtime.provider.requests[-2]['tools']) <= 2
    assert all(row['tool'] != 'add_to_cart' for row in result['tool_calls_log'])


def test_healthy_configuration_needs_no_extra_classifier_or_interrupt(runtime):
    stage(runtime)
    count = len(runtime.provider.requests)
    runtime.provider.steps = [configure()]
    result = runtime.turn('Fixture configuration')
    assert result['error'] is None and len(runtime.provider.requests) - count == 1 and len(runtime.writes) == 1


def test_unadvertised_legacy_action_cannot_bypass_repair_contract(runtime):
    stage(runtime)
    raw = {'tool_calls': [{'id': 'legacy', 'function': {'name': 'customer_actions',
        'arguments': json.dumps({'actions': [{'tool': 'get_menu_categories', 'args': {}, 'commitment': 'QUESTION'}]})}}]}
    runtime.provider.steps = [{'content': '{broken'}, raw, configure()]
    result = runtime.turn('Fixture configuration')
    assert result['error'] is None and len(runtime.writes) == 1
    assert all(row['tool'] != 'get_menu_categories' for row in result['tool_calls_log'])


def test_text_actions_never_request_unadvertised_customer_actions(runtime):
    misplaced = final('action', 'Unverified prose claim')
    value = json.loads(misplaced['content'])
    value['actions'] = [{'tool': 'remove_cart_item', 'args': {'cart_item_id': '801'}}]
    misplaced['content'] = json.dumps(value)
    runtime.provider.steps = [misplaced, interrupt('CART_EDIT'),
        step('remove_cart_line', {'reference': {'kind': 'ordinal', 'index': 2}, 'commitment': 'SELECTED', 'evidence': 'Fixture remove'})]
    result = runtime.turn('Fixture remove')
    assert result['error'] is None and len(runtime.writes) == 1
    for request in runtime.provider.requests:
        names = {r['function']['name'] for r in request.get('tools', [])}
        assert 'customer_actions' not in names and all(n.startswith('semantic_') for n in names)
        assert 'Call customer_actions' not in json.dumps(request['messages'])


def test_compound_wrong_valid_operation_cannot_erase_siblings_or_interrupt_after_write(runtime, monkeypatch):
    option_authority(monkeypatch)
    items = deepcopy(cart_manager.get_cart(runtime.sid)['items'])
    items.append({**items[0], 'id': 802, 'cart_item_id': '802', 'line_id': '802'})
    cart_manager.replace_items_from_order_cart(runtime.sid, items)
    g = gateway_for(runtime, 'Fixture compound edits')
    remove = {'reference': {'kind': 'ordinal', 'index': 2}, 'commitment': 'SELECTED', 'evidence': g.user_message}
    update = {'reference': {'kind': 'id', 'value': 'forged'}, 'commitment': 'CORRECTION',
        'evidence': g.user_message, 'desired_state': {'quantity': 3}}
    options = {'reference': {'kind': 'ordinal', 'index': 1}, 'commitment': 'CORRECTION',
        'evidence': g.user_message, 'desired_state': {'luong_da': 'Ít đá'}}
    g.semantic_calls(calls(('semantic_remove_cart_line', remove), ('semantic_update_cart_line', update),
        ('semantic_update_cart_line', options)))
    assert len(runtime.writes) == 1 and len(g.semantic_plan.pending) == 2
    ids = [r['action_id'] for r in g.semantic_plan.actions]
    assert g.semantic_calls(calls(('semantic_read_menu', {})))[0]['status'] == 'semantic_drift'
    assert g.semantic_calls(calls(('semantic_interrupt', {'target_domain': 'DISCOVERY'})))[0]['status'] == 'semantic_drift'
    assert [r['action_id'] for r in g.semantic_plan.actions] == ids and len(runtime.writes) == 1
    update['reference'] = {'kind': 'ordinal', 'index': 3}
    result = g.semantic_calls(calls(('semantic_update_cart_line', update)))[0]
    assert result['remaining_actions'] == 0 and len(runtime.writes) == 3
    assert [r['action_id'] for r in g.semantic_plan.actions] == ids
    assert [w[1] for w in runtime.writes] == ['801', '802', '800']


def test_protocol_repair_preserves_commitment_class_and_bound_target(runtime):
    stage(runtime)
    g = gateway_for(runtime, 'Fixture configuration')
    bad = {'commitment': 'QUESTION', 'evidence': g.user_message, 'reference': ref('101'), 'size': 'M'}
    g.semantic_calls(calls(('semantic_configure_product', bad)))
    result = g.semantic_calls(calls(('semantic_configure_product', {**bad, 'commitment': 'SELECTED'})))[0]
    assert result['status'] == 'semantic_drift' and result['non_progress_reason'] == 'commitment_class_changed'
    assert not runtime.writes


@pytest.mark.parametrize('name', operation_registry())
def test_every_operation_protocol_repair_rejects_wrong_valid_domain_in_real_loop(runtime, name):
    from src.agents.semantic_registry import operation_registry, validate_operation
    from test_semantic_mapper_reference_policy import minimal
    registry = operation_registry()
    op = registry[name]
    wrong = registry['semantic_read_order_history' if op.goal_family == 'DISCOVERY' else 'semantic_read_menu']
    malformed = {**minimal(op), 'undeclared_field': True}
    unrelated = minimal(wrong)
    assert validate_operation(wrong.function_name, unrelated)
    before = deepcopy(cart_manager.get_cart(runtime.sid))
    prefs = deepcopy(cart_manager.get_checkout_prefs(runtime.sid))
    runtime.provider.steps = [step(op.name.lower(), malformed), step(wrong.name.lower(), unrelated)]
    result = runtime.turn('Fixture operation continuity')
    assert result['error'] == 'semantic_repair_exhausted' and result['error_class'] == 'MODEL_PROTOCOL'
    assert len(runtime.provider.requests) == 2 and not runtime.reads and not runtime.writes
    after = deepcopy(cart_manager.get_cart(runtime.sid))
    after['checkout_prefs'].pop('processed_order_turns', None)
    assert after == before
    after_prefs = deepcopy(cart_manager.get_checkout_prefs(runtime.sid))
    after_prefs.pop('processed_order_turns', None)
    assert after_prefs == prefs
    assert all(not result['ui_payload'].get(key) for key in ('products', 'branches', 'vouchers', 'orders', 'menu_categories'))
    assert all(row['tool'] != wrong.executor for row in result['tool_calls_log'])


def test_compound_first_action_repair_keeps_original_ordinals_and_all_siblings(runtime, monkeypatch):
    option_authority(monkeypatch)
    items = deepcopy(cart_manager.get_cart(runtime.sid)['items'])
    items.append({**items[0], 'id': 802, 'cart_item_id': '802', 'line_id': '802'})
    cart_manager.replace_items_from_order_cart(runtime.sid, items)
    g = gateway_for(runtime, 'Fixture three original cart lines')
    common = {'commitment': 'CORRECTION', 'evidence': g.user_message}
    remove = {**common, 'reference': {'kind': 'id', 'value': 'forged'}}
    update = {**common, 'reference': {'kind': 'ordinal', 'index': 3}, 'desired_state': {'quantity': 3}}
    option = {**common, 'reference': {'kind': 'ordinal', 'index': 1}, 'desired_state': {'luong_da': 'Ít đá'}}
    g.semantic_calls(calls(('semantic_remove_cart_line', remove), ('semantic_update_cart_line', update),
        ('semantic_update_cart_line', option)))
    assert not runtime.writes and len(g.semantic_plan.pending) == 3
    ids = [row['action_id'] for row in g.semantic_plan.actions]
    assert g.semantic_calls(calls(('semantic_read_menu', {})))[0]['status'] == 'semantic_drift'
    assert g.semantic_calls(calls(('semantic_interrupt', {'target_domain': 'DISCOVERY'})))[0]['status'] == 'semantic_drift'
    remove['reference'] = {'kind': 'ordinal', 'index': 2}
    result = g.semantic_calls(calls(('semantic_remove_cart_line', remove)))[0]
    assert result['remaining_actions'] == 0 and len(runtime.writes) == 3
    assert [row['action_id'] for row in g.semantic_plan.actions] == ids
    assert [row[1] for row in runtime.writes] == ['801', '802', '800']


def test_registered_product_prerequisite_cannot_change_frozen_canonical_target(runtime):
    g = gateway_for(runtime, 'Fixture selected identity')
    value = {'reference': ref('101'), 'commitment': 'SELECTED', 'evidence': g.user_message}
    g.semantic_calls(calls(('semantic_select_product', {**value, 'size': 'L'})))
    assert g.turn_contract.must_preserve_target[-1] == '101'
    result = g.semantic_calls(calls(('semantic_ask_product_options', {'reference': ref('102')})))[0]
    assert result['status'] == 'semantic_drift' and result['non_progress_reason'] == 'canonical_target_changed'
    assert not runtime.reads and not runtime.writes
