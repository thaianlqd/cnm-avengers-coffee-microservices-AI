"""Real-loop probes for protocol/attribute variants observed in deployed logs."""
from copy import deepcopy
import json
import pytest

from test_semantic_control import runtime, compatibility_runtime, gateway_for, action
from src.common import cart_manager
from src.function_calling.tools import product_tools, TOOL_EXECUTORS


def option_authority(monkeypatch):
    original = product_tools.execute_get_product_options
    def options(**kwargs):
        result = original(**kwargs)
        result['option_groups'] += [
            dict(name='Lượng đá', values=['Ít đá', 'Bình thường'], required=False),
            dict(name='Độ ngọt', values=['Ít ngọt', 'Bình thường'], required=False),
            dict(name='Loại sữa', values=['Yến mạch', 'Bình thường'], required=False),
        ]
        return result
    monkeypatch.setattr(product_tools, 'execute_get_product_options', options)


@pytest.mark.parametrize('alias,canonical,value', [
    ('kich_co', 'size', 'L'), ('ice', 'luong_da', 'Ít đá'),
    ('sugar', 'do_ngot', 'Ít ngọt'), ('milk', 'loai_sua', 'Yến mạch'),
])
@pytest.mark.parametrize('tool', ['add_to_cart', 'update_cart_item'])
def test_declared_option_aliases_reach_the_same_menu_validation(runtime, monkeypatch, alias, canonical, value, tool):
    option_authority(monkeypatch)
    gateway = gateway_for(runtime)
    options = {alias: value}
    if canonical != 'size':
        options['size'] = 'L'
    args = {'product_id': '101', **options} if tool == 'add_to_cart' else {'cart_item_id': '800', 'desired_state': options}
    result = gateway.customer_actions({'actions': [action(gateway, tool, args)]})
    assert result['results'][0]['result']['status'] == 'ok'
    written = runtime.writes[-1][1] if tool == 'add_to_cart' else runtime.writes[-1][2]
    assert written[canonical] == value and alias not in written


@pytest.mark.parametrize('tool', ['add_to_cart', 'update_cart_item'])
def test_conflicting_aliases_are_repaired_before_any_write(runtime, tool):
    gateway = gateway_for(runtime)
    options = {'size': 'M', 'kich_co': 'L'}
    args = {'product_id': '101', **options} if tool == 'add_to_cart' else {'cart_item_id': '800', 'desired_state': options}
    result = gateway.customer_actions({'actions': [action(gateway, tool, args)]})
    assert result['recovery_kind'] == 'model_repair'
    assert result['results'][0]['result']['status'] == 'option_attribute_conflict'
    assert not runtime.writes and gateway.artifacts.completed_customer_step() is None


def test_unknown_alias_option_still_fails_menu_authority(runtime):
    gateway = gateway_for(runtime)
    result = gateway.customer_actions({'actions': [action(gateway, 'add_to_cart', {'product_id': '101', 'kich_co': 'Invented'})]})
    assert result['results'][0]['result']['status'] == 'invalid_option' and not runtime.writes


def test_union_wire_fields_are_revalidated_against_the_selected_tool(runtime):
    gateway = gateway_for(runtime)
    # delivery_type is legal in the shared schema but never in add_to_cart.
    result = gateway.customer_actions({'actions': [action(gateway, 'add_to_cart', {
        'product_id': '101', 'size': 'L', 'delivery_type': 'MANG_DI'})]})
    assert result['results'][0]['result']['status'] == 'invalid_arguments' and not runtime.writes


def test_typed_and_legacy_arguments_cannot_conflict_and_batch_is_atomic_on_shape(runtime):
    gateway = gateway_for(runtime)
    result = gateway.customer_actions({'actions': [action(gateway, 'remove_cart_item', {'cart_item_id': '800'}),
        {**action(gateway, 'get_cart', commitment='QUESTION'), 'args_json': '{}'}]})
    assert result['status'] == 'invalid_semantic_arguments' and not runtime.writes


def test_invalid_protocol_repairs_in_existing_loop_without_customer_repeat(runtime):
    message = 'Cho mình phần mới nhắc cỡ L nhé'
    valid = {'tool': 'add_to_cart', 'commitment': 'SELECTED', 'evidence': message,
             'args': {'product_id': '101', 'kich_co': 'L'}}
    runtime.provider.plan([('customer_actions', {'actions': [valid]})])
    malformed = deepcopy(runtime.provider.steps[0])
    malformed['tool_calls'][0]['function']['arguments'] = json.dumps({'actions': [{**valid, 'args': 'not an object'}]})
    runtime.provider.steps.insert(0, malformed)
    result = runtime.turn(message)
    assert len(runtime.writes) == 1 and runtime.writes[0][1]['size'] == 'L'
    assert len(runtime.provider.requests) == 3  # denied proposal, repair, normal final response
    assert runtime.provider.requests[1]['tool_choice'] == 'required'
    assert 'chọn giúp' not in result['reply']


@pytest.mark.parametrize('reference', [None, {'namespace': 'LOCATION', 'kind': 'literal', 'value': 'Điểm mới'},
    {'namespace': 'LOCATION', 'kind': 'name', 'value': 'Điểm mới'}, {'kind': 'literal', 'value': 'Điểm mới'}])
def test_new_location_is_not_a_saved_profile_reference(runtime, monkeypatch, reference):
    from src.agents import order_flow_graph
    captured = []
    monkeypatch.setattr(order_flow_graph, '_handle_location_request', lambda state: (
        captured.append(state) or {'reply': 'Kết quả từ bản đồ', 'tool_calls_log': [
            {'tool': 'find_nearest_branch', 'result': {'status': 'not_found'}}]}))
    gateway = gateway_for(runtime)
    result = gateway.customer_actions({'actions': [action(gateway, 'resolve_location',
        {'location': 'Điểm mới', 'kind': 'poi', 'for_checkout': False}, reference=reference)]})
    assert result['results'][0]['result']['status'] == 'not_found'
    assert len(captured) == 1 and captured[0]['location_override'].value == 'Điểm mới'
    assert not runtime.writes


def test_conflicting_literal_locations_never_reach_geo(runtime, monkeypatch):
    from src.agents import order_flow_graph
    monkeypatch.setattr(order_flow_graph, '_handle_location_request', lambda state: pytest.fail('conflict reached geo'))
    gateway = gateway_for(runtime)
    result = gateway.execute_semantic(action(gateway, 'resolve_location', {'location': 'A', 'kind': 'poi'},
        reference={'namespace': 'LOCATION', 'kind': 'literal', 'value': 'B'}))
    assert result['status'] == 'reference_conflict' and not runtime.writes


def test_location_candidate_reference_reuses_provider_coordinates(runtime, monkeypatch):
    from src.agents import order_flow_graph
    captured = []
    monkeypatch.setattr(order_flow_graph, '_handle_location_request', lambda state: (
        captured.append(state) or {'reply': 'Danh sách quán', 'tool_calls_log': [
            {'tool': 'find_nearest_branch', 'result': {'status': 'need_branch_selection'}}]}))
    cart_manager.set_checkout_prefs(runtime.sid, delivery_type='MANG_DI')
    gateway = gateway_for(runtime)
    canonical = {'candidate_id': 'provider-candidate', 'display_address': 'Điểm bản đồ', 'lat': 10.8, 'lng': 106.7}
    gateway.artifacts.visible['location_candidates'] = [canonical]
    result = gateway.execute_semantic(action(gateway, 'resolve_location', {'kind': 'poi'},
        reference={'namespace': 'LOCATION_CANDIDATE', 'kind': 'singleton'}))
    assert result['status'] == 'need_branch_selection'
    assert captured[0]['resolved_location_candidate'] == canonical
    assert captured[0]['force_read_only_location'] is True


def test_selection_then_all_options_then_compound_delivery_in_real_loop(runtime, monkeypatch):
    from src.agents import order_flow_graph
    option_authority(monkeypatch)
    def plan(message, proposals):
        runtime.provider.plan([('customer_actions', {'actions': [
            {'commitment': 'SELECTED', 'evidence': message, **proposal} for proposal in proposals]})])
        return runtime.turn(message)
    plan('Mình lấy món đầu nhé', [{'tool': 'get_product_options', 'args': {},
        'reference': {'namespace': 'PRODUCT', 'kind': 'ordinal', 'index': 1}}])
    assert cart_manager.get_checkout_prefs(runtime.sid)['pending_products'][0]['product_id'] == '101'
    result = plan('Cỡ L, ít đá và ít ngọt nhé', [{'tool': 'add_to_cart',
        'args': {'kich_co': 'L', 'luong_da': 'Ít đá', 'do_ngot': 'Ít ngọt'},
        'reference': {'namespace': 'PRODUCT', 'kind': 'pending'}}])
    assert len(runtime.writes) == 1 and 'đã thêm' in result['reply']
    assert runtime.writes[-1][1]['size'] == 'L' and runtime.writes[-1][1]['luong_da'] == 'Ít đá'
    captured = []
    monkeypatch.setitem(TOOL_EXECUTORS, 'get_user_profile', lambda *args: pytest.fail('literal must not load saved address'))
    monkeypatch.setattr(order_flow_graph, '_handle_location_request', lambda state: (
        captured.append(state) or {'reply': 'Bạn cung cấp địa chỉ giao cụ thể nhé.', 'tool_calls_log': [
            {'tool': 'find_nearest_branch', 'result': {'status': 'needs_location'}}]}))
    plan('Mang đến điểm mới giúp mình', [
        {'tool': 'set_checkout_choices', 'args': {'delivery_type': 'GIAO_TAN_NOI'}, 'supplied_location': True},
        {'tool': 'resolve_location', 'args': {'kind': 'poi', 'for_checkout': True},
         'reference': {'namespace': 'LOCATION', 'kind': 'literal', 'value': 'điểm mới'}},
    ])
    assert cart_manager.get_checkout_prefs(runtime.sid)['delivery_type'] == 'GIAO_TAN_NOI'
    assert captured[0]['location_override'].value == 'điểm mới'
    assert captured[0]['force_read_only_location'] is False
    assert len(runtime.writes) == 1


def test_read_batch_cache_tracks_business_revision(runtime):
    gateway = gateway_for(runtime)
    request = {'actions': [action(gateway, 'get_cart', commitment='QUESTION')]}
    first = gateway.customer_actions(request)
    assert first['read_only'] is True and not first['same_turn_read_reused']
    second = gateway.customer_actions(request)
    assert second['same_turn_read_reused'] is True
    gateway.customer_actions({'actions': [action(gateway, 'update_cart_item',
        {'cart_item_id': '800', 'desired_state': {'quantity': 3}})]})
    third = gateway.customer_actions(request)
    assert not third['same_turn_read_reused']
    assert third['results'][0]['result']['cart']['items'][0]['quantity'] == 3
