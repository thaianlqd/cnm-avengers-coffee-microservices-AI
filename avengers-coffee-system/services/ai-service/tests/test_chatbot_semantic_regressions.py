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
    assert result['results'][0]['result']['status'] == 'invalid_arguments' and result['recovery_kind'] == 'model_repair' and not runtime.writes


def test_typed_and_legacy_arguments_cannot_conflict_and_batch_is_atomic_on_shape(runtime):
    gateway = gateway_for(runtime)
    result = gateway.customer_actions({'actions': [action(gateway, 'remove_cart_item', {'cart_item_id': '800'}),
        {**action(gateway, 'get_cart', commitment='QUESTION'), 'args_json': '{}'}]})
    assert result['status'] == 'invalid_semantic_arguments' and not runtime.writes


def test_invalid_protocol_repairs_in_existing_loop_without_customer_repeat(runtime):
    message = 'Cho mình phần mới nhắc cỡ L nhé'
    valid = {'tool': 'add_to_cart', 'commitment': 'SELECTED', 'evidence': message,
             'option_intent': 'CONFIGURE', 'args': {'product_id': '101', 'kich_co': 'L'}}
    runtime.provider.plan([('customer_actions', {'actions': [valid]})])
    malformed = deepcopy(runtime.provider.steps[0])
    malformed['tool_calls'][0]['function']['arguments'] = json.dumps({'actions': [{**valid, 'args': 'not an object'}]})
    runtime.provider.steps.insert(0, malformed)
    result = runtime.turn(message)
    assert len(runtime.writes) == 1 and runtime.writes[0][1]['size'] == 'L'
    assert len(runtime.provider.requests) == 2  # denied proposal, targeted repair, authoritative rendering
    assert runtime.provider.requests[1]['tool_choice'] == 'auto'  # Gemini nested-contract compatibility
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
    result = plan('Cỡ L, ít đá và ít ngọt nhé', [{'tool': 'add_to_cart', 'option_intent': 'CONFIGURE',
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


def test_product_selection_cannot_supply_required_defaults(runtime):
    gateway = gateway_for(runtime)
    before = deepcopy(cart_manager.get_cart(runtime.sid))
    result = gateway.customer_actions({'actions': [action(gateway, 'add_to_cart', {'product_id': '101'}, option_intent='SELECT')]})
    assert result['results'][0]['result']['status'] == 'needs_options'
    assert cart_manager.get_cart(runtime.sid)['items'] == before['items'] and not runtime.writes


def test_defaults_have_separate_current_authorization(runtime):
    gateway = gateway_for(runtime, 'Mình lấy theo công thức quán nhé')
    bad = action(gateway, 'add_to_cart', {'product_id': '101'}, option_intent='DEFAULTS')
    bad.pop('defaults_evidence')
    result = gateway.customer_actions({'actions': [bad]})
    assert result['results'][0]['result']['status'] == 'defaults_evidence_required' and not runtime.writes
    result = gateway.customer_actions({'actions': [{**bad, 'defaults_evidence': 'theo công thức quán'}]})
    assert result['results'][0]['result']['status'] == 'ok' and len(runtime.writes) == 1


def test_model_surface_only_publishes_canonical_option_vocabulary(runtime):
    gateway = gateway_for(runtime)
    surface = gateway.tool_surface()[0][0]['function']['parameters']['properties']['actions']['items']
    fields = surface['properties']['args']['properties']
    assert 'size' in fields and not {'kich_co', 'ice', 'sugar', 'milk', 'use_defaults'} & set(fields)
    assert 'option_intent' in surface['properties'] and 'evidence' in surface['required']


def test_unsupported_reference_kind_is_protocol_repair_but_multiple_entities_clarify(runtime):
    gateway = gateway_for(runtime)
    bad = gateway.execute_semantic(action(gateway, 'update_cart_item', {'desired_state': {'quantity': 3}},
        reference={'namespace': 'CART_LINE', 'kind': 'recent'}))
    assert bad['status'] == 'invalid_reference_kind' and bad['recovery_kind'] == 'model_repair'
    ambiguous = gateway.execute_semantic(action(gateway, 'update_cart_item', {'desired_state': {'quantity': 3}},
        reference={'namespace': 'CART_LINE', 'kind': 'singleton'}))
    assert ambiguous['status'] == 'ambiguous_reference' and ambiguous['recovery_kind'] == 'clarify'
    assert not runtime.writes


def test_missing_fulfillment_is_repaired_before_checkout_location(runtime, monkeypatch):
    from src.agents import order_flow_graph
    captured = []
    monkeypatch.setattr(order_flow_graph, '_handle_location_request', lambda state: (
        captured.append(state) or {'reply': 'Bạn bổ sung địa chỉ cụ thể nhé.', 'tool_calls_log': [
            {'tool': 'find_nearest_branch', 'result': {'status': 'needs_location'}}]}))
    message = 'Nhờ đem tới điểm mình vừa nói nhé'
    location = {'tool': 'resolve_location', 'commitment': 'SELECTED', 'evidence': message,
        'args': {'location': 'Điểm mới', 'kind': 'poi', 'for_checkout': True}}
    repair = {'actions': [{'tool': 'set_checkout_choices', 'commitment': 'SELECTED', 'evidence': message,
        'supplied_location': True, 'args': {'delivery_type': 'GIAO_TAN_NOI'}}, location]}
    runtime.provider.plan([('customer_actions', repair)])
    first = deepcopy(runtime.provider.steps[0])
    first['tool_calls'][0]['function']['arguments'] = json.dumps({'actions': [location]})
    runtime.provider.steps.insert(0, first)
    result = runtime.turn(message)
    assert len(captured) == 1 and not captured[0]['force_read_only_location']
    assert cart_manager.get_checkout_prefs(runtime.sid)['delivery_type'] == 'GIAO_TAN_NOI'
    assert len(runtime.provider.requests) == 2 and 'địa chỉ cụ thể' in result['reply']


def test_repair_never_replays_a_successful_target_even_with_changed_args(runtime):
    gateway = gateway_for(runtime)
    first = gateway.customer_actions({'actions': [action(gateway, 'update_cart_item',
        {'cart_item_id': '800', 'desired_state': {'quantity': 3}}),
        action(gateway, 'add_to_cart', {'product_id': '102', 'size': 'L', 'kich_co': 'M'})]})
    assert first['changed'] and first['recovery_kind'] == 'model_repair' and len(runtime.writes) == 1
    repair = gateway.customer_actions({'actions': [action(gateway, 'update_cart_item',
        {'cart_item_id': '800', 'desired_state': {'quantity': 8}}),
        action(gateway, 'add_to_cart', {'product_id': '102', 'size': 'L'})]})
    assert repair['results'][0]['result']['status'] == 'already_processed'
    assert cart_manager.get_cart(runtime.sid)['items'][0]['quantity'] == 3
    assert len(runtime.writes) == 2 and runtime.writes[-1][0] == 'add'


def test_protocol_repair_is_strictly_bounded_to_one_extra_decision(runtime):
    message = 'Mình chọn món vừa nói nhé'
    runtime.provider.plan([('customer_actions', {'actions': [{'tool': 'add_to_cart', 'commitment': 'SELECTED',
        'args': {'product_id': '101'}, 'evidence': 'not in this turn', 'option_intent': 'SELECT'}]})])
    runtime.provider.steps.insert(0, deepcopy(runtime.provider.steps[0]))
    result = runtime.turn(message)
    assert result['error'] == 'semantic_repair_exhausted'
    assert len(runtime.provider.requests) == 2 and not runtime.writes


@pytest.mark.parametrize('slot', ['changes', 'add_items'])
def test_order_item_option_aliases_are_normalized_before_existing_preview(runtime, monkeypatch, slot):
    from src.agents import order_management
    from uuid import uuid4
    oid = str(uuid4())
    gateway = gateway_for(runtime)
    gateway.artifacts.visible['orders'] = [{'order_id': oid}]
    captured = []
    monkeypatch.setattr(order_management, 'prepare', lambda *args, **kwargs: (
        captured.append(args[2]) or {'status': 'require_confirmation', 'changed': False}))
    row = {'order_line_id': 1, 'quantity': 2, 'kich_co': 'L', 'ice': 'Ít đá', 'sugar': 'Ít ngọt'} if slot == 'changes' else {
        'product_id': '101', 'quantity': 1, 'kich_co': 'L', 'ice': 'Ít đá', 'sugar': 'Ít ngọt'}
    result = gateway.execute_semantic(action(gateway, 'update_order', {slot: [row]}, reference={'namespace': 'ORDER', 'kind': 'singleton'}))
    assert result['status'] == 'require_confirmation'
    normalized = captured[0][slot][0]
    assert normalized['size'] == 'L' and normalized['luong_da'] == 'Ít đá' and normalized['do_ngot'] == 'Ít ngọt'
    assert not {'kich_co', 'ice', 'sugar'} & set(normalized)


def test_discovery_then_selection_shows_options_and_preserves_pending_owner(runtime):
    message = 'Mình lấy Alpha nhé'
    stage = {'tool': 'get_product_options', 'args': {'product_id': '101'}, 'commitment': 'SELECTED', 'evidence': message}
    runtime.provider.plan([('customer_actions', {'actions': [stage]})])
    first = deepcopy(runtime.provider.steps[0])
    first['tool_calls'][0]['function']['arguments'] = json.dumps({'actions': [
        {'tool': 'filter_catalog', 'args': {'search_text': 'Alpha'}, 'commitment': 'SELECTED', 'evidence': message}]})
    runtime.provider.steps.insert(0, first)
    result = runtime.turn(message)
    assert cart_manager.get_checkout_prefs(runtime.sid)['pending_products'][0]['product_id'] == '101'
    assert result['tool_calls_log'][-1]['result'].get('selection_staged') is True
    assert 'Size' in result['reply'] and 'bắt buộc' in result['reply']
    assert 'Bạn muốn chọn món nào' not in result['reply']
    assert len(runtime.provider.requests) == 2 and not runtime.writes


def test_menu_label_formatting_variants_need_no_model_retry(runtime, monkeypatch):
    option_authority(monkeypatch)
    gateway = gateway_for(runtime)
    result = gateway.execute_semantic(action(gateway, 'add_to_cart',
        {'product_id': '101', 'size': 'l', 'luong_da': 'ít đá', 'do_ngot': 'it ngot', 'loai_sua': 'yen mach'}))
    assert result['status'] == 'ok' and len(runtime.writes) == 1
    written = runtime.writes[0][1]
    assert written['size'] == 'L' and written['luong_da'] == 'Ít đá'
    assert written['do_ngot'] == 'Ít ngọt' and written['loai_sua'] == 'Yến mạch'


def test_colliding_menu_labels_are_not_guessed(runtime, monkeypatch):
    original = product_tools.execute_get_product_options
    def options(**kwargs):
        result = original(**kwargs)
        result['option_groups'][0]['values'] = ['L', 'l']
        return result
    monkeypatch.setattr(product_tools, 'execute_get_product_options', options)
    gateway = gateway_for(runtime)
    result = gateway.execute_semantic(action(gateway, 'add_to_cart', {'product_id': '101', 'size': 'l'}))
    assert result['status'] == 'invalid_option' and not runtime.writes


@pytest.mark.parametrize('repair', ['read', 'prose'])
def test_failed_repair_cannot_drift_into_more_tool_decisions(runtime, repair):
    message = 'Mình muốn cấu hình món đang chọn'
    bad = {'commitment': 'SELECTED', 'evidence': message, 'args': {'size': 'L'}, 'option_intent': 'CONFIGURE'}
    runtime.provider.plan([('customer_actions', {'actions': [bad]})])
    runtime.provider.steps[1] = ({'tool_calls': [{'id': 'repair', 'type': 'function', 'function': {
        'name': 'customer_actions', 'arguments': json.dumps({'actions': [{
            'tool': 'get_cart', 'commitment': 'QUESTION', 'args': {}, 'evidence': message}]})}}]}
        if repair == 'read' else {'content': 'Đã xong'})
    result = runtime.turn(message)
    assert result['error'] == 'semantic_repair_exhausted'
    assert len(runtime.provider.requests) == 2 and not runtime.writes
    assert 'lựa chọn trước đó' in result['reply']
    assert 'gửi lại' not in result['reply'] and 'địa chỉ đã lưu' not in result['reply']


def test_declared_single_discovery_plan_finishes_in_one_request(runtime):
    runtime.provider.plan([('customer_actions', {'actions': [{
        'tool': 'filter_catalog', 'commitment': 'QUESTION', 'evidence': 'Cho xem cà phê',
        'args': {'search_text': 'Cà Phê', 'planned_discovery_reads': 1}}]})])
    result = runtime.turn('Cho xem cà phê')
    assert result['error'] is None and len(result['ui_payload']['products']) == 2
    assert len(runtime.provider.requests) == 1 and not runtime.writes


def test_selected_singleton_plan_keeps_tools_available_then_configures_implicit_pending(runtime, monkeypatch):
    """A completed search is not a completed purchase/configuration step."""
    option_authority(monkeypatch)
    message = 'Mình mua Alpha'
    read = {'tool': 'filter_catalog', 'commitment': 'SELECTED', 'evidence': message,
        'args': {'search_text': 'Alpha', 'planned_discovery_reads': 1}}
    stage = {'tool': 'get_product_options', 'commitment': 'SELECTED', 'evidence': message,
        'args': {}, 'reference': {'namespace': 'PRODUCT', 'kind': 'id', 'value': '101'}}
    runtime.provider.plan([('customer_actions', {'actions': [stage]})])
    lookup = deepcopy(runtime.provider.steps[0])
    lookup['tool_calls'][0]['function']['arguments'] = json.dumps({'actions': [read]})
    runtime.provider.steps.insert(0, lookup)
    selected = runtime.turn(message)
    assert selected['error'] is None
    assert runtime.provider.requests[1].get('tools'), 'singleton selection still needs canonical options'
    assert 'bắt buộc' in selected['reply'] and 'Bạn muốn chọn món nào' not in selected['reply']
    assert not runtime.writes
    message = 'Cỡ L, ít đá và ít ngọt'
    runtime.provider.plan([('customer_actions', {'actions': [{
        'tool': 'add_to_cart', 'commitment': 'AFFIRMED', 'option_intent': 'CONFIGURE',
        'evidence': message, 'args': {'size': 'L', 'luong_da': 'Ít đá', 'do_ngot': 'Ít ngọt'}}]})])
    configured = runtime.turn(message)
    assert configured['error'] is None and len(runtime.provider.requests) == 3
    assert len(runtime.writes) == 1
    written = runtime.writes[0][1]
    assert written['product_id'] == '101' and written['size'] == 'L'
    assert written['luong_da'] == 'Ít đá' and written['do_ngot'] == 'Ít ngọt'
    assert not cart_manager.get_checkout_prefs(runtime.sid).get('pending_products')
    assert 'đã thêm' in configured['reply']


def test_selected_singleton_cannot_finish_with_another_choose_product_reply(runtime):
    message = 'Lấy Alpha'
    read = {'tool': 'filter_catalog', 'commitment': 'SELECTED', 'evidence': message,
        'args': {'search_text': 'Alpha', 'planned_discovery_reads': 1}}
    stage = {'tool': 'get_product_options', 'commitment': 'SELECTED', 'evidence': message,
        'args': {'product_id': '101'}}
    runtime.provider.plan([('customer_actions', {'actions': [read]})])
    first = runtime.provider.steps[0]
    runtime.provider.plan([('customer_actions', {'actions': [stage]})])
    runtime.provider.steps[:0] = [first, {'content': json.dumps({
        'response_kind': 'consultation', 'reply': 'Bạn muốn chọn món nào?',
        'mutation_claims': [], 'evidence_quotes': []})}]
    result = runtime.turn(message)
    assert result['error'] is None and len(runtime.provider.requests) == 3
    assert 'get_product_options' in runtime.provider.requests[2]['messages'][-1]['content']
    assert 'bắt buộc' in result['reply'] and 'Bạn muốn chọn món nào' not in result['reply']
    assert not runtime.writes


@pytest.mark.parametrize('intent', ['CONFIGURE', 'DEFAULTS'])
def test_implicit_configuration_grounds_only_the_single_pending_product(runtime, intent):
    cart_manager.set_pending_products(runtime.sid, [{**runtime.products[1], 'quantity': 2}])
    gateway = gateway_for(runtime)
    # Focus and old display point elsewhere. Neither can override pending identity.
    result = gateway.execute_semantic(action(gateway, 'add_to_cart',
        {'size': 'L'} if intent == 'CONFIGURE' else {}, option_intent=intent))
    assert result['status'] == 'ok' and len(runtime.writes) == 1
    assert runtime.writes[0][1]['product_id'] == '102'
    assert runtime.writes[0][1]['quantity'] == 2


@pytest.mark.parametrize('count', [0, 2])
def test_implicit_configuration_never_guesses_from_display_focus_or_multiple_pending(runtime, count):
    cart_manager.set_pending_products(runtime.sid, runtime.products[:count])
    gateway = gateway_for(runtime)
    result = gateway.execute_semantic(action(gateway, 'add_to_cart', {'size': 'L'}))
    assert result['status'] == ('ambiguous_reference' if count else 'unknown_reference')
    assert not runtime.writes


def test_implicit_configuration_does_not_authorize_question_or_defaults(runtime):
    cart_manager.set_pending_products(runtime.sid, [runtime.products[0]])
    gateway = gateway_for(runtime)
    question = gateway.execute_semantic(action(gateway, 'add_to_cart', {'size': 'L'}, commitment='QUESTION'))
    assert question['status'] == 'semantic_commitment_required'
    defaults = action(gateway, 'add_to_cart', {}, option_intent='DEFAULTS')
    defaults.pop('defaults_evidence')
    assert gateway.execute_semantic(defaults)['status'] == 'defaults_evidence_required'
    assert not runtime.writes


def test_pending_product_identity_clarification_is_repaired_before_customer_sees_it(runtime, monkeypatch):
    option_authority(monkeypatch)
    cart_manager.set_pending_products(runtime.sid, [runtime.products[1]])
    message = 'Cỡ L, ít đá và ít ngọt'
    runtime.provider.plan([('customer_actions', {'actions': [{
        'tool': 'add_to_cart', 'commitment': 'SELECTED', 'option_intent': 'CONFIGURE',
        'evidence': message, 'args': {'size': 'L', 'luong_da': 'Ít đá', 'do_ngot': 'Ít ngọt'}}]})])
    runtime.provider.steps.insert(0, {'content': json.dumps({
        'response_kind': 'clarification', 'reply': 'Bạn muốn uống món nào?',
        'mutation_claims': [], 'evidence_quotes': []})})
    result = runtime.turn(message)
    assert result['error'] is None and len(runtime.provider.requests) == 2
    assert 'pending' in runtime.provider.requests[1]['messages'][-1]['content']
    assert len(runtime.writes) == 1 and runtime.writes[0][1]['product_id'] == '102'
    assert 'đã thêm' in result['reply'] and 'Bạn muốn uống món nào?' not in result['reply']


def test_pending_options_do_not_block_social_or_explicit_browsing_interruptions(runtime):
    cart_manager.set_pending_products(runtime.sid, [runtime.products[0]])
    runtime.provider.steps = [{'content': json.dumps({'response_kind': 'social',
        'reply': 'Chào bạn!', 'mutation_claims': [], 'evidence_quotes': []})}]
    assert runtime.turn('Xin chào')['error'] is None
    message = 'Cho xem bánh trước đã'
    runtime.provider.plan([('customer_actions', {'actions': [{
        'tool': 'filter_catalog', 'commitment': 'QUESTION', 'evidence': message,
        'args': {'category': 'food', 'search_text': '', 'planned_discovery_reads': 1}}]})])
    result = runtime.turn(message)
    assert result['error'] is None and len(result['ui_payload']['products']) == 1
    assert result['ui_payload']['products'][0]['product_id'] == '103'
    assert cart_manager.get_checkout_prefs(runtime.sid)['pending_products'][0]['product_id'] == '101'
    assert not runtime.writes


@pytest.mark.parametrize('commitment,plan', [('SELECTED', {}), ('QUESTION', {'planned_discovery_reads': 1})])
def test_repaired_product_family_discovery_shows_choices_and_keeps_existing_cart(runtime, commitment, plan):
    # Existing configured drink; a new family request must not select one of
    # several returned products, or discard the already committed drink.
    existing = {**runtime.products[0], 'id': 800, 'quantity': 1, 'size': 'L',
        'unit_price': 45000, 'luong_da': 'Ít đá', 'do_ngot': 'Ít ngọt', 'toppings': []}
    cart_manager.replace_items_from_order_cart(runtime.sid, [existing])
    runtime.products.extend([dict(product_id=str(201+i), product_name='Bánh mùa lễ '+name,
        category='food', final_price=99000, is_active=True) for i, name in enumerate(('Lava', 'Đậu', 'Matcha'))])
    before = deepcopy(cart_manager.get_cart(runtime.sid)['items'])
    message = 'Mình muốn mua thêm bánh mùa lễ'
    proposal = {'tool': 'filter_catalog', 'commitment': commitment, 'evidence': message,
        'args': {'category': 'food', 'search_text': 'Bánh mùa lễ', **plan}}
    runtime.provider.plan([('customer_actions', {'actions': [proposal]})])
    bad = deepcopy(runtime.provider.steps[0])
    bad['tool_calls'][0]['function']['arguments'] = json.dumps({'actions': [{
        key: value for key, value in proposal.items() if key != 'tool'}]})
    runtime.provider.steps.insert(0, bad)
    result = runtime.turn(message)
    assert result['error'] is None
    assert len(runtime.provider.requests) == 2 and len(runtime.reads) == 1
    assert 'Bánh mùa lễ Lava' in result['reply'] and 'Bạn muốn chọn món nào' in result['reply']
    assert 'chưa xử lý' not in result['reply']
    assert [row['product_id'] for row in result['ui_payload']['products']] == ['201', '202', '203']
    assert cart_manager.get_cart(runtime.sid)['items'] == before and not runtime.writes
    assert not cart_manager.get_checkout_prefs(runtime.sid).get('pending_products')


def test_repaired_exact_product_lookup_continues_to_options_without_another_repair(runtime):
    message = 'Mình chọn Alpha nhé'
    read = {'tool': 'filter_catalog', 'commitment': 'SELECTED', 'evidence': message,
        'args': {'search_text': 'Alpha'}}
    stage = {'tool': 'get_product_options', 'commitment': 'SELECTED', 'evidence': message,
        'args': {'product_id': '101'}}
    runtime.provider.plan([('customer_actions', {'actions': [stage]})])
    repaired = deepcopy(runtime.provider.steps[0])
    repaired['tool_calls'][0]['function']['arguments'] = json.dumps({'actions': [read]})
    bad = deepcopy(repaired)
    bad['tool_calls'][0]['function']['arguments'] = json.dumps({'actions': [{**read, 'args': 'wrong shape'}]})
    runtime.provider.steps[:0] = [bad, repaired]
    result = runtime.turn(message)
    assert result['error'] is None and len(runtime.provider.requests) == 3
    assert 'bắt buộc' in result['reply'] and 'Bạn muốn chọn món nào' not in result['reply']
    assert cart_manager.get_checkout_prefs(runtime.sid)['pending_products'][0]['product_id'] == '101'
    assert not runtime.writes


def test_successful_repair_read_does_not_reset_protocol_repair_budget(runtime):
    message = 'Mình chọn Alpha nhé'
    read = {'tool': 'filter_catalog', 'commitment': 'SELECTED', 'evidence': message,
        'args': {'search_text': 'Alpha'}}
    runtime.provider.plan([('customer_actions', {'actions': [read]})])
    good = deepcopy(runtime.provider.steps[0])
    bad = deepcopy(good)
    bad['tool_calls'][0]['function']['arguments'] = json.dumps({'actions': [{**read, 'args': 'wrong shape'}]})
    runtime.provider.steps = [bad, good, deepcopy(bad)]
    result = runtime.turn(message)
    assert result['error'] == 'semantic_repair_exhausted'
    assert len(runtime.provider.requests) == 3 and not runtime.writes


def test_prior_catalog_evidence_cannot_hide_a_new_protocol_fault(runtime):
    gateway = gateway_for(runtime)
    gateway.customer_actions({'actions': [action(gateway, 'filter_catalog',
        {'search_text': 'Cà Phê', 'planned_discovery_reads': 1}, commitment='QUESTION')]})
    gateway.customer_actions({'actions': [{'commitment': 'QUESTION', 'args': {}}]})
    assert gateway.artifacts.discovery_batches
    assert gateway.artifacts.completed_customer_step(repair_in_progress=True) is None


def test_successful_write_fence_survives_repaired_discovery_continuation(runtime):
    message = 'Đổi số lượng món đầu rồi tìm thêm món Alpha'
    gateway = gateway_for(runtime, message)
    update = action(gateway, 'update_cart_item', {'cart_item_id': '800', 'desired_state': {'quantity': 3}})
    bad = action(gateway, 'add_to_cart', {'product_id': '102', 'size': 'L', 'kich_co': 'M'})
    read = action(gateway, 'filter_catalog', {'search_text': 'Alpha'}, commitment='SELECTED')
    changed_update = action(gateway, 'update_cart_item', {'cart_item_id': '800', 'desired_state': {'quantity': 8}})
    add = action(gateway, 'add_to_cart', {'product_id': '102', 'size': 'L'})
    runtime.provider.plan([('customer_actions', {'actions': [update, bad]})])
    first = deepcopy(runtime.provider.steps[0])
    repaired = deepcopy(first)
    repaired['tool_calls'][0]['function']['arguments'] = json.dumps({'actions': [read]})
    continuation = deepcopy(first)
    continuation['tool_calls'][0]['function']['arguments'] = json.dumps({'actions': [changed_update, add]})
    runtime.provider.steps = [first, repaired, continuation]
    result = runtime.turn(message)
    assert result['error'] is None and len(runtime.provider.requests) == 3
    assert len(runtime.writes) == 2 and [row[0] for row in runtime.writes] == ['update', 'add']
    assert cart_manager.get_cart(runtime.sid)['items'][0]['quantity'] == 3
    skipped = [row for row in result['tool_calls_log'] if row['tool'] == 'update_cart_item']
    assert skipped[-1]['result']['status'] == 'already_processed'


def test_partial_write_survives_repair_exhaustion_and_is_visible(runtime):
    message = 'Đổi số lượng món đầu rồi chọn thêm món kia'
    gateway = gateway_for(runtime, message)
    valid = action(gateway, 'update_cart_item', {'cart_item_id': '800', 'desired_state': {'quantity': 3}})
    bad = action(gateway, 'add_to_cart', {'product_id': '102', 'size': 'L', 'kich_co': 'M'})
    runtime.provider.plan([('customer_actions', {'actions': [valid, bad]})])
    runtime.provider.steps[1] = deepcopy(runtime.provider.steps[0])
    result = runtime.turn(message)
    assert result['error'] == 'semantic_repair_exhausted' and len(runtime.writes) == 1
    assert cart_manager.get_cart(runtime.sid)['items'][0]['quantity'] == 3
    assert '×3' in result['reply'] and 'phần còn lại' in result['reply']


def test_unknown_invalid_argument_does_not_invent_a_format_diagnosis():
    from src.common.gemini_compat import compatibility_error
    error = type('Error', (), {'error_text': '{"error":{"message":"Request contains an invalid argument"}}'})()
    assert compatibility_error(error) == ('unknown_incompatible_request', None)


def test_complete_semantic_customer_journey_through_order_creation(runtime, monkeypatch):
    """Real loop/gateway/state, scripted language and isolated business authorities."""
    import time
    from src.agents import order_flow_graph
    from src.function_calling.tools import cart_tools
    from src.agents.agent_memory import ConversationMemory, empty_memory
    cart_manager.replace_items_from_order_cart(runtime.sid, [])
    ConversationMemory(runtime.redis).save(runtime.sid, empty_memory())
    option_authority(monkeypatch)
    created, geo_calls = [], []
    def send(message, proposals):
        before = len(runtime.provider.requests)
        runtime.provider.plan([('customer_actions', {'actions': [
            {'commitment': 'SELECTED', 'evidence': message, **p} for p in proposals]})])
        result = runtime.turn(message)
        assert result['error'] is None, result
        assert len(runtime.provider.requests) == before + 1
        return result
    send('Quán có cà phê gì?', [{'tool': 'filter_catalog', 'commitment': 'QUESTION',
        'args': {'search_text': 'Cà Phê', 'planned_discovery_reads': 1}}])
    send('Lấy món đầu', [{'tool': 'get_product_options', 'args': {},
        'reference': {'namespace': 'PRODUCT', 'kind': 'ordinal', 'index': 1}}])
    assert not runtime.writes
    send('Cỡ L, ít đá, ít ngọt', [{'tool': 'add_to_cart', 'option_intent': 'CONFIGURE',
        'args': {'size': 'L', 'luong_da': 'Ít đá', 'do_ngot': 'Ít ngọt'},
        'reference': {'namespace': 'PRODUCT', 'kind': 'pending'}}])
    assert len(runtime.writes) == 1 and cart_manager.get_cart(runtime.sid)['items'][0]['unit_price'] == 42000
    def offer(sid):
        cart_manager.set_checkout_context(sid, voucher_offer_pending=True, flow_stage='VOUCHER_SELECTION')
        cart_manager.set_pending_action(sid, 'select_voucher', {})
        return {'reply': 'Bạn chọn hoặc bỏ qua mã nhé.', 'tool_calls_log': [
            {'tool': 'get_applicable_vouchers', 'result': {'status': 'ok', 'vouchers': []}},
            {'tool': 'get_cart_quote', 'result': cart_tools.execute_get_cart_quote(sid)}]}
    monkeypatch.setattr(order_flow_graph, '_offer_voucher_gate', offer)
    send('Giỏ xong rồi', [{'tool': 'finish_cart', 'args': {}}])
    send('Không dùng mã nhé', [{'tool': 'skip_voucher', 'args': {}, 'commitment': 'REJECTED'}])
    assert cart_manager.get_checkout_prefs(runtime.sid)['voucher_decided']
    def geo(state):
        geo_calls.append(state)
        sid = state['session_id']
        assert cart_manager.get_checkout_prefs(sid)['delivery_type'] == 'GIAO_TAN_NOI'
        cart_manager.set_checkout_context(sid, delivery_address=state['location_override'].value, address_confirmed=True)
        cart_manager.set_branch(sid, 'verified-delivery-branch', 'Quán đã xác minh')
        return {'reply': 'Đã xác minh địa chỉ và chi nhánh giao hàng.', 'tool_calls_log': [
            {'tool': 'find_nearest_branch', 'result': {'status': 'ok'}}]}
    monkeypatch.setattr(order_flow_graph, '_handle_location_request', geo)
    send('Giao tới địa chỉ mình vừa cung cấp nhé', [
        {'tool': 'set_checkout_choices', 'args': {'delivery_type': 'GIAO_TAN_NOI'}, 'supplied_location': True},
        {'tool': 'resolve_location', 'args': {'location': 'Địa chỉ đầy đủ từ khách', 'kind': 'address', 'for_checkout': True}}])
    assert len(geo_calls) == 1 and not geo_calls[0]['force_read_only_location']
    send('Trả tiền khi nhận hàng', [{'tool': 'set_checkout_choices', 'args': {'payment_method': 'THANH_TOAN_KHI_NHAN_HANG'}}])
    def summary(sid, **kwargs):
        cart = cart_manager.get_cart(sid)
        cart_manager.set_checkout_context(sid, checkout_requested=True, checkout_action_id='journey-action',
            checkout_action_expires_at=str(time.time()+300), summary_fingerprint=cart_manager.cart_fingerprint(sid))
        cart_manager.set_pending_action(sid, 'confirm_checkout', {})
        return {'status': 'require_confirmation', 'order_summary': {'items': cart['items'],
            'delivery_type': 'GIAO_TAN_NOI', 'payment_method': 'THANH_TOAN_KHI_NHAN_HANG', 'final_total': cart['total_price']}}
    monkeypatch.setattr(cart_tools, 'execute_request_checkout', summary)
    send('Cho xem tóm tắt trước', [{'tool': 'request_checkout', 'args': {}}])
    def confirm(sid, **kwargs):
        created.append(kwargs)
        cart_manager.clear_cart(sid, order_id='isolated-created-order')
        return {'status': 'ok', 'order_id': 'isolated-created-order', 'message': 'Đã tạo đơn.'}
    monkeypatch.setattr(cart_tools, 'execute_confirm_checkout', confirm)
    result = send('Thông tin đúng, xác nhận đặt đơn', [{'tool': 'confirm_checkout', 'commitment': 'AFFIRMED', 'args': {}}])
    assert created == [{'action_id': 'journey-action'}]
    assert 'isolated-created-order' in result['reply'] and not cart_manager.get_cart(runtime.sid)['items']


def test_compound_delivery_poi_uses_real_address_precision_gate(runtime, monkeypatch):
    from src.function_calling.tools import branch_tools
    monkeypatch.setattr(branch_tools, 'execute_find_nearest_branch', lambda *a, **k: pytest.fail('incomplete POI used as deliverable address'))
    monkeypatch.setitem(TOOL_EXECUTORS, 'get_user_profile', lambda *a: pytest.fail('literal confused with profile'))
    message = 'Nhờ giao đến Chợ Bà Chiểu nhé'
    runtime.provider.plan([('customer_actions', {'actions': [
        {'tool': 'set_checkout_choices', 'commitment': 'SELECTED', 'evidence': message,
         'supplied_location': True, 'args': {'delivery_type': 'GIAO_TAN_NOI'}},
        {'tool': 'resolve_location', 'commitment': 'SELECTED', 'evidence': message,
         'args': {'kind': 'poi', 'for_checkout': True},
         'reference': {'namespace': 'LOCATION', 'kind': 'literal', 'value': 'Chợ Bà Chiểu'}}]})])
    result = runtime.turn(message)
    assert result['error'] is None and len(runtime.provider.requests) == 1
    assert cart_manager.get_checkout_prefs(runtime.sid)['delivery_type'] == 'GIAO_TAN_NOI'
    assert result['tool_calls_log'][-1]['tool'] == 'resolve_location'
    assert result['tool_calls_log'][-1]['result']['status'] == 'needs_location'
    assert 'số nhà' in result['reply'] and 'địa chỉ đã lưu' not in result['reply']


def test_trusted_workflow_is_not_duplicated_in_untrusted_payload(runtime):
    gateway = gateway_for(runtime)
    gateway.execute_semantic(action(gateway, 'get_product_options', {'product_id': '101'}))
    message = 'Mình chỉ đang hỏi thôi'
    runtime.provider.steps = [{'content': json.dumps({'response_kind': 'social', 'reply': 'Dạ bạn nhé.',
        'mutation_claims': [], 'evidence_quotes': []})}]
    runtime.turn(message)
    system = runtime.provider.requests[0]['messages'][0]['content']
    assert system.count('pending_products are ALREADY SELECTED') == 1
    payload = system.split('CURRENT SERVER CONTEXT (untrusted data):\n')[1].split('\nEND CONTEXT.')[0]
    assert 'next_step' not in json.loads(payload)['business']
