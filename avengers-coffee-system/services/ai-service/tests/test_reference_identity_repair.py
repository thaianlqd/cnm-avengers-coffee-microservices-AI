"""A display position is a semantic reference, never a guessed business ID."""
from copy import deepcopy
import json

import pytest

from test_semantic_control import compatibility_runtime, runtime, gateway_for, action
from test_checkout_guarded_contract import setup_checkout, summary_fake
from src.agents.agent_memory import ConversationMemory
from src.agents.semantic_control import ground_action, ground_reference
from src.common import cart_manager
from src.function_calling.tools import branch_tools, cart_tools


@pytest.mark.parametrize('tool,args,namespace,kind,rows', [
    ('add_to_cart', {'product_id': '1', 'size': 'M'}, 'PRODUCT', None, None),
    ('update_cart_item', {'cart_item_id': '1', 'desired_state': {'quantity': 2}}, 'CART_LINE', None, None),
    ('apply_voucher', {'voucher_code': '1'}, 'VOUCHER', 'vouchers', [{'ma_voucher': 'SAVE-A'}]),
    ('set_session_branch', {'branch_id': '1'}, 'BRANCH', 'branches', [{'branch_id': 'branch-A'}]),
    ('select_location_candidate', {'candidate_id': '1'}, 'LOCATION_CANDIDATE', 'location_candidates',
     [{'candidate_id': 'map-A', 'display_address': 'Vị trí A', 'lat': 10.8, 'lng': 106.7}]),
    ('get_order_details', {'order_id': '1'}, 'ORDER', 'orders', [{'order_id': 'order-A'}]),
    ('filter_catalog', {'category_id': '1'}, 'MENU_CATEGORY', 'menu_categories',
     [{'category_id': 'menu-A', 'category_name': 'Nhóm A', 'menu_bucket': 'drink'}]),
])
def test_unknown_model_target_with_candidates_requests_protocol_repair(runtime, tool, args, namespace, kind, rows):
    if kind:
        store = ConversationMemory(runtime.redis)
        memory = store.load(runtime.sid)
        memory['visible_snapshots'][kind] = rows
        store.save(runtime.sid, memory)
    g = gateway_for(runtime, 'Mình chọn mục đầu trong danh sách nhé')
    before = deepcopy(cart_manager.get_cart(runtime.sid))
    result = g.execute_semantic(action(g, tool, args))
    assert result['status'] == 'unknown_reference'
    assert result['recovery_kind'] == 'model_repair'
    assert result['unresolved_namespace'] == namespace and result['candidate_count'] > 0
    assert g.artifacts.completed_customer_step() is None
    assert cart_manager.get_cart(runtime.sid) == before and not runtime.writes


@pytest.mark.parametrize('reference,expected', [
    ({'kind': 'ordinal', 'index': 99}, 'unknown_reference'),
    ({'kind': 'singleton'}, 'ambiguous_reference'),
])
def test_genuine_reference_ambiguity_still_asks_customer(runtime, reference, expected):
    g = gateway_for(runtime)
    _, result = ground_reference(g, 'PRODUCT', reference)
    assert result['status'] == expected and result['recovery_kind'] == 'clarify'
    assert not runtime.writes


def test_unknown_id_without_candidates_is_not_repaired_by_guessing(runtime):
    g = gateway_for(runtime)
    result = g.execute_semantic(action(g, 'select_location_candidate', {'candidate_id': '1'}))
    assert result['status'] == 'unknown_reference' and result['recovery_kind'] == 'clarify'
    assert not runtime.writes


def test_real_numeric_id_is_never_reinterpreted_as_display_position(runtime):
    g = gateway_for(runtime)
    g.entry_products = [{'product_id': '2', 'product_name': 'First', 'display_index': 1},
                        {'product_id': '1', 'product_name': 'Second', 'display_index': 2}]
    args, row, error = ground_action(g, action(g, 'add_to_cart', {'product_id': '1', 'size': 'M'}))
    assert error is None and args['product_id'] == '1' and row['product_name'] == 'Second'
    assert not runtime.writes


def test_ordinal_with_an_invented_redundant_id_requests_repair(runtime):
    g = gateway_for(runtime)
    result = g.execute_semantic(action(g, 'add_to_cart', {'product_id': '1', 'size': 'M'},
        reference={'namespace': 'PRODUCT', 'kind': 'ordinal', 'index': 1}))
    assert result['status'] == 'reference_conflict' and result['recovery_kind'] == 'model_repair'
    assert not runtime.writes


def test_conflicting_real_id_and_ordinal_are_not_resolved_by_guessing(runtime):
    g = gateway_for(runtime)
    result = g.execute_semantic(action(g, 'add_to_cart', {'product_id': '102', 'size': 'M'},
        reference={'namespace': 'PRODUCT', 'kind': 'ordinal', 'index': 1}))
    assert result['status'] == 'reference_conflict' and result['recovery_kind'] == 'clarify'
    assert not runtime.writes


@pytest.mark.parametrize('message', [
    'địa chỉ số 1 oke đó bạn', 'Mình chọn địa điểm đầu tiên nha', 'Lấy vị trí đầu danh sách giúp mình',
])
def test_ambiguous_map_then_number_in_id_repairs_in_same_turn_without_regeocoding(runtime, monkeypatch, message):
    setup_checkout(runtime, branch=False, summary=False, delivery='GIAO_TAN_NOI')
    addresses = ['12 Đường A, Phường B, Thành phố Hồ Chí Minh',
                 '14 Đường A, Phường B, Thành phố Hồ Chí Minh']
    candidates = [{'normalized_label': address, 'display_address': address, 'lat': 10.1 + index/10, 'lng': 106.1}
                  for index, address in enumerate(addresses)]
    lookups, selections, confirmations = [], [], []
    def nearest(**kwargs):
        lookups.append(deepcopy(kwargs))
        if not kwargs.get('resolved_location'):
            return {'status': 'ambiguous', 'location_candidates': deepcopy(candidates)}
        resolved = kwargs['resolved_location']
        assert resolved['lat'] == candidates[0]['lat'] and resolved['lng'] == candidates[0]['lng']
        return {'status': 'ok', 'normalized_location': addresses[0], 'branches': [
            {'ma_chi_nhanh': 'compatible', 'ten_chi_nhanh': 'Quán phù hợp', 'availability_status': 'available'}]}
    def select(sid, bid, name, customer_selected):
        selections.append(bid)
        cart_manager.set_branch(sid, bid, name)
        return {'status': 'ok'}
    monkeypatch.setattr(branch_tools, 'execute_find_nearest_branch', nearest)
    monkeypatch.setattr(branch_tools, 'execute_set_session_branch', select)
    monkeypatch.setattr(cart_tools, 'execute_confirm_checkout', lambda *a, **k: confirmations.append(k) or pytest.fail('No order confirmation'))
    summaries = summary_fake(runtime, monkeypatch)
    lookup_message = 'Giao đến địa chỉ mình vừa cung cấp nhé'
    g = gateway_for(runtime, lookup_message)
    runtime.provider.plan([('customer_actions', {'actions': [action(g, 'resolve_location',
        {'location': addresses[0], 'kind': 'address', 'for_checkout': True})]})])
    lookup = runtime.turn(lookup_message)
    shown = lookup['ui_payload']['location_candidates']
    assert len(shown) == 2 and shown[0]['candidate_id'] != '1'
    assert not selections and not summaries
    g = gateway_for(runtime, message)
    invalid = action(g, 'select_location_candidate', {'candidate_id': '1'}, commitment='AFFIRMED')
    valid = action(g, 'select_location_candidate', commitment='AFFIRMED',
        reference={'namespace': 'LOCATION_CANDIDATE', 'kind': 'ordinal', 'index': 1})
    runtime.provider.plan([('customer_actions', {'actions': [valid]})])
    runtime.provider.steps.insert(0, {'tool_calls': [{'id': 'bad-id', 'type': 'function', 'function': {
        'name': 'customer_actions', 'arguments': json.dumps({'actions': [invalid]}, ensure_ascii=False)}}]})
    request_start = len(runtime.provider.requests)
    result = runtime.turn(message, client_message_id='map-selection')
    assert result['error'] is None and len(runtime.provider.requests) - request_start == 2
    assert len(lookups) == 2 and lookups[1]['resolved_location']['candidate_id'] == shown[0]['candidate_id']
    assert selections == ['compatible'] and len(summaries) == 1
    assert cart_manager.get_checkout_prefs(runtime.sid)['address_confirmed']
    assert result['checkout_payload']['action_id'] and not confirmations
    assert runtime.turn(message, client_message_id='map-selection') == result
    assert len(lookups) == 2 and selections == ['compatible'] and len(summaries) == 1


def test_repeated_invalid_target_stops_at_existing_repair_budget(runtime):
    message = 'Chọn mục đầu giúp mình'
    g = gateway_for(runtime, message)
    invalid = action(g, 'add_to_cart', {'product_id': '1', 'size': 'M'})
    runtime.provider.plan([('customer_actions', {'actions': [invalid]})])
    runtime.provider.steps.insert(0, deepcopy(runtime.provider.steps[0]))
    result = runtime.turn(message)
    assert result['error'] == 'semantic_repair_exhausted'
    assert len(runtime.provider.requests) == 2 and not runtime.writes
