"""Frozen display ordinals, compound selections and real-loop inference budgets."""
from copy import deepcopy
import logging
import json
import pytest
from src.agents.agent_memory import ConversationMemory, empty_memory
from src.agents.product_snapshot import ProductDisplaySnapshot
from src.agents.semantic_control import ground_action
from src.agents.semantic_registry import materialize_operation
from src.common import cart_manager
from test_semantic_control import runtime, compatibility_runtime, gateway_for
from test_semantic_repair_modes import step, metrics
from test_semantic_registry_contract import calls
from test_typed_semantic_journeys import send, ref


@pytest.fixture
def five(runtime):
    runtime.products[:] = [{'product_id': str(101+i), 'product_name': name, 'category': 'drink',
        'final_price': 30000+i*10000, 'is_active': True, 'display_index': i+1}
        for i,name in enumerate(('Product Alpha','Product Beta','Product Gamma','Product Delta','Product Epsilon'))]
    cart_manager.replace_items_from_order_cart(runtime.sid, [])
    ConversationMemory(runtime.redis).save(runtime.sid, {**empty_memory(),
        'visible_snapshots': {'products': deepcopy(runtime.products)}, 'focus': {'product': runtime.products[0]}})
    return runtime


def select(message, index, **extra):
    return {'reference': {'kind': 'ordinal', 'index': index}, 'commitment': 'SELECTED', 'evidence': message, **extra}


def selection_step(message, indexes):
    return {
        'tool_calls': [{'id': 'select-'+str(index), 'type': 'function', 'function': {
            'name': 'semantic_select_product', 'arguments': json.dumps(select(message,index))}}
            for index in indexes]}


@pytest.mark.parametrize('count', [1,2,3])
@pytest.mark.parametrize('malformed', [False,True])
def test_existing_snapshot_multi_selection_is_one_inference_or_two_with_format_repair(five, caplog, count, malformed):
    caplog.set_level(logging.INFO)
    rt, message = five, 'Fixture multiple displayed choices'
    rt.provider.steps = ([{'content': '{broken'}] if malformed else []) + [selection_step(message, range(1,count+1))]
    result = rt.turn(message, client_message_id='snapshot-selection')
    assert result['error'] is None and len(rt.provider.requests) == 1 + malformed
    drafts = cart_manager.get_checkout_prefs(rt.sid)['pending_products']
    assert [p['product_id'] for p in drafts] == [str(101+i) for i in range(count)]
    assert all(p['option_schema'] for p in drafts) and not rt.writes and not rt.reads
    assert not result['ui_payload']['products']
    assert all(p['product_name'] in result['reply'] for p in drafts)
    assert 'Size' in result['reply'] and 'đã thêm' not in result['reply']
    m = metrics(caplog)
    assert m['final_synthesis_count'] == 0 and m['interrupt_count'] == 0 and m['prerequisite_count'] == 0
    assert m['goal_owner_operation'] == 'semantic_select_product'
    assert 'ProductSnapshotGrounding' in caplog.text
    if malformed:
        names = {r['function']['name'] for r in rt.provider.requests[1]['tools']}
        assert names == {'semantic_select_product'}
    assert rt.turn(message, client_message_id='snapshot-selection') == result
    assert len(rt.provider.requests) == 1 + malformed


def test_two_then_three_pending_drafts_configure_each_canonical_target_separately(five):
    rt = five
    message = 'Fixture three selected drafts'
    rt.provider.steps = [selection_step(message, (1,2,3))]
    assert rt.turn(message)['error'] is None
    send(rt, 'Fixture configure first', ('CONFIGURE_PRODUCT', {'reference': {'kind': 'ordinal','index': 1}, 'size': 'M'}))
    assert [p['product_id'] for p in cart_manager.get_checkout_prefs(rt.sid)['pending_products']] == ['102','103']
    send(rt, 'Fixture configure second', ('CONFIGURE_PRODUCT', {'reference': {'kind': 'ordinal','index': 2}, 'size': 'L'}))
    assert [p['product_id'] for p in cart_manager.get_checkout_prefs(rt.sid)['pending_products']] == ['103']
    send(rt, 'Fixture remaining draft', ('USE_PRODUCT_DEFAULTS', {'reference': {'kind': 'pending'}}))
    assert not cart_manager.get_checkout_prefs(rt.sid).get('pending_products')
    assert [w[1]['product_id'] for w in rt.writes] == ['101','102','103']


def test_mutable_new_display_candidates_and_focus_cannot_reinterpret_old_ordinals(five):
    g = gateway_for(five, 'Fixture old display')
    original = g.product_display_snapshot.descriptor()
    new = {'product_id': '999', 'product_name': 'New unrelated display', 'display_index': 1}
    g.entry_products[:] = [new]
    g.artifacts.visible['products'] = [new]
    g.artifacts.product_candidates = {'999': new}
    g.artifacts.focus['product'] = new
    for index, expected in ((1,'101'),(2,'102')):
        proposal = materialize_operation('semantic_select_product', select(g.user_message,index))
        args, _, error = ground_action(g, proposal)
        assert not error and args['product_id'] == expected
    assert g.product_display_snapshot.descriptor() == original
    focused = materialize_operation('semantic_select_product', {
        'reference': {'kind': 'focus'}, 'commitment': 'SELECTED', 'evidence': g.user_message})
    assert ground_action(g, focused)[0]['product_id'] == '101'


def test_compound_binds_all_display_targets_before_first_failed_action_and_repair(five):
    g = gateway_for(five, 'Fixture two displayed ordinals')
    first, third = select('not current evidence',1), select(g.user_message,3)
    g.semantic_calls(calls(('semantic_select_product', first), ('semantic_select_product', third)))
    assert [row['bound_product_id'] for row in g.semantic_plan.actions] == ['101','103']
    ids = [row['action_id'] for row in g.semantic_plan.actions]
    snapshot = g.product_display_snapshot.descriptor()
    assert all(row['product_snapshot_fingerprint'] == snapshot['fingerprint'] for row in g.semantic_plan.actions)
    before = deepcopy(g.artifacts.visible)
    assert g.semantic_calls(calls(('semantic_discover_products', {'scope': 'food', 'planned_discovery_reads': 1})))[0]['status'] == 'semantic_drift'
    assert g.artifacts.visible == before and not five.reads and not five.writes
    g.artifacts.product_candidates = {'999': {'product_id':'999', 'display_index':3}}
    first['evidence'] = g.user_message
    result = g.semantic_calls(calls(('semantic_select_product', first)))[0]
    assert result['turn_progress'] == 'COMPLETED'
    assert [row['action_id'] for row in g.semantic_plan.actions] == ids
    assert [p['product_id'] for p in cart_manager.get_checkout_prefs(five.sid)['pending_products']] == ['101','103']


@pytest.mark.parametrize('bad_domain', ['PRODUCT_SELECTION','DISCOVERY'])
def test_malformed_existing_selection_cannot_escape_into_same_or_new_discovery(five, bad_domain):
    rt, message = five, 'Fixture select original first and second'
    before = ConversationMemory(rt.redis).load(rt.sid)['visible_snapshots']['products']
    rt.provider.steps = [{'content': '{broken'}, step('interrupt', {'target_domain': bad_domain}),
        selection_step(message, (1,2))]
    result = rt.turn(message)
    assert result['error'] is None and len(rt.provider.requests) == 3
    assert [p['product_id'] for p in cart_manager.get_checkout_prefs(rt.sid)['pending_products']] == ['101','102']
    assert ConversationMemory(rt.redis).load(rt.sid)['visible_snapshots']['products'] == before
    assert not rt.reads and not rt.writes and not result['ui_payload']['products']


def test_genuine_normal_discovery_interrupt_preserves_historical_snapshot(five):
    g = gateway_for(five, 'Fixture genuine new discovery')
    historical = g.product_display_snapshot.descriptor()
    assert g.semantic_calls(calls(('semantic_interrupt', {'target_domain': 'DISCOVERY'})))[0]['continuation_required']
    result = g.semantic_calls(calls(('semantic_discover_products', {
        'scope': 'drink', 'product_family': 'Gamma', 'planned_discovery_reads': 1})))[0]
    assert result['turn_progress'] == 'COMPLETED' and g.turn_contract.goal_family == 'DISCOVERY'
    g.artifacts.finalize_display()
    assert [row['product_id'] for row in g.artifacts.ui['products']] == ['103']
    assert g.product_display_snapshot.descriptor() == historical and not five.writes


def test_new_selection_ordinals_use_display_even_when_older_pending_draft_exists(five):
    cart_manager.set_pending_products(five.sid, [{**five.products[4], 'selection_index': 1}])
    g = gateway_for(five, 'Fixture new displayed second')
    result = g.semantic_calls(calls(('semantic_select_product', select(g.user_message,2))))[0]
    assert result['turn_progress'] == 'COMPLETED'
    assert [p['product_id'] for p in cart_manager.get_checkout_prefs(five.sid)['pending_products']] == ['105','102']


def test_replacing_the_frozen_snapshot_object_fails_closed(five):
    g = gateway_for(five, 'Fixture fingerprint mismatch')
    g.product_display_snapshot = ProductDisplaySnapshot.capture({'products': [{'product_id': '999','display_index': 1}]})
    proposal = materialize_operation('semantic_select_product', select(g.user_message,1))
    assert ground_action(g, proposal)[2]['status'] == 'product_snapshot_integrity'
    assert not five.writes and not five.reads


def test_interrupt_prerequisite_first_preserves_goal_and_only_primary_completes(five):
    rt = five
    memory = ConversationMemory(rt.redis).load(rt.sid)
    memory['visible_snapshots'] = {}
    memory['focus'] = {}
    ConversationMemory(rt.redis).save(rt.sid, memory)
    g = gateway_for(rt, 'Fixture select Alpha after missing canonical candidates')
    g.turn_contract.goal_family = 'SOCIAL'
    g.enter_turn_repair('PRE_TOOL_RESPONSE_REPAIR')
    assert g.semantic_calls(calls(('semantic_interrupt', {'target_domain': 'PRODUCT_SELECTION'})))[0]['continuation_required']
    discovery = ('semantic_discover_products', {'scope': 'drink', 'product_family': 'Alpha', 'planned_discovery_reads': 1})
    result = g.semantic_calls(calls(discovery))[0]
    assert result['turn_progress'] == 'PREREQUISITE_COMPLETED' and result['continuation_required']
    assert g.turn_contract.goal_family == 'PRODUCT_SELECTION'
    assert g.turn_contract.goal_owner_operation is None and g.turn_contract.repair_target is None
    assert not g.artifacts.ui['products'] and not g.artifacts.visible.get('products')
    before = len(rt.reads)
    assert g.semantic_calls(calls(discovery))[0]['status'] == 'semantic_drift'
    assert len(rt.reads) == before  # Available candidates make the repeat unneeded.
    result = g.semantic_calls(calls(('semantic_select_product', {
        'reference': {'kind': 'name', 'value': 'Product Alpha'}, 'commitment': 'SELECTED', 'evidence': g.user_message})))[0]
    assert result['turn_progress'] == 'COMPLETED' and not result['continuation_required']
    assert g.turn_contract.goal_owner_operation == 'semantic_select_product'
    assert [p['product_id'] for p in cart_manager.get_checkout_prefs(rt.sid)['pending_products']] == ['101']
    assert not rt.writes


def test_real_loop_interrupt_then_prerequisite_then_selection_needs_three_inferences(five, caplog):
    caplog.set_level(logging.INFO)
    rt, message = five, 'Fixture choose canonical Alpha with no existing display'
    memory = ConversationMemory(rt.redis).load(rt.sid)
    memory['visible_snapshots'] = {}
    memory['focus'] = {}
    ConversationMemory(rt.redis).save(rt.sid, memory)
    rt.provider.steps = [step('interrupt', {'target_domain': 'PRODUCT_SELECTION'}),
        step('discover_products', {'scope': 'drink', 'product_family': 'Alpha', 'planned_discovery_reads': 1}),
        step('select_product', {'reference': {'kind': 'name','value': 'Product Alpha'}, 'commitment': 'SELECTED', 'evidence': message})]
    result = rt.turn(message)
    assert result['error'] is None and len(rt.provider.requests) == 3
    m = metrics(caplog)
    assert m['goal_family'] == 'PRODUCT_SELECTION' and m['goal_owner_operation'] == 'semantic_select_product'
    assert m['prerequisite_count'] == 1 and m['interrupt_count'] == 1 and m['final_synthesis_count'] == 0
    assert {p['product_id'] for p in result['ui_payload']['products']} <= {'101'} and not rt.writes
