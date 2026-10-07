"""Reported shopping regressions with scripted inference; no live LLM/order calls."""
from copy import deepcopy

import pytest

from test_llm_tool_orchestrator import runtime
from test_checkout_guarded_contract import calls, content, gateway
from src.agents.agent_memory import ConversationMemory, empty_memory
from src.agents.customer_flow_presentation import options_prompt, location_choices
from src.agents.shopping_language import interpret_shopping
from src.common import cart_manager
from src.function_calling import tools
from src.function_calling.tools import cart_tools


@pytest.mark.parametrize('message', ['tôi muốn mua bánh có vị matcha', 'cho tôi 1 món nước',
    'chọn thêm cho tôi 1 ly nước', 'tôi muốn tham khảo bánh matcha trước'])
def test_family_requests_do_not_add_a_candidate(runtime, message):
    runtime.products[2]['product_name'] = 'Mochi Kem Matcha'
    g = gateway(runtime, message)
    result = g.dispatch('add_to_cart', {'product_id': '103', 'size': 'M'})
    assert result['status'] == 'product_choice_required'
    assert not runtime.writes
    assert 'chọn' in result['message']


def test_matcha_cake_discovery_excludes_drinks_even_when_model_uses_all(runtime):
    for row, name in zip(runtime.products, ['Matcha Latte', 'Coco Matcha', 'Bánh Trung Thu Matcha']):
        row['product_name'] = name
    g = gateway(runtime, 'tôi muốn mua bánh có vị matcha')
    result = g.dispatch('filter_catalog', {'category': 'all', 'search_text': 'matcha'})
    assert [row['product_id'] for row in result['products']] == ['103']
    assert not runtime.writes


@pytest.mark.parametrize('message', ['thiếu 1 món nước', 'chọn thêm cho tôi 1 món nước'])
def test_generic_water_is_a_category_not_a_literal_name(runtime, message):
    g = gateway(runtime, message)
    result = g.dispatch('filter_catalog', {'category': 'drink', 'search_text': 'nước'})
    assert len(result['products']) == 2
    assert runtime.reads[0][1]['search_text'] == ''


def test_default_only_adds_the_pending_product(runtime):
    cart_manager.set_pending_products(runtime.sid, [dict(product_id='101', product_name='Cà Phê Alpha', quantity=1)])
    g = gateway(runtime, 'theo mặc định cho tôi luôn đi')
    assert g.dispatch('add_to_cart', {'product_id': '103', 'use_defaults': True})['status'] == 'product_choice_required'
    assert not runtime.writes


def test_complaint_about_an_existing_bakery_item_does_not_delete_it(runtime):
    g = gateway(runtime, 'nãy giờ tôi có hỏi món bánh nào đâu mà có trong giỏ vậy')
    result = g.dispatch('remove_cart_item', {'cart_item_id': '800'})
    assert result['status'] == 'cart_change_not_requested' and not runtime.writes


def three_item_cart(runtime):
    names = ['Mochi Kem Matcha', 'Bánh Trung Thu Matcha', 'Trà Sữa Shan']
    for row, name in zip(runtime.products, names):
        row['product_name'] = name
    rows = [dict(row, id=800 + i, quantity=1, size='L' if i == 2 else 'M',
                 toppings=[], unit_price=row['final_price']) for i, row in enumerate(runtime.products)]
    cart_manager.replace_items_from_order_cart(runtime.sid, rows)
    return ('bỏ cho tôi món mochi ra đi, chỉnh cho tôi bánh trung thu lên 2 cái, '
            'chỉnh món số 3 thành size M đi')


EDITS = [('remove_cart_item', {'cart_item_id': '800', 'cart_line_ordinal': 1}),
         ('update_cart_item', {'cart_item_id': '801', 'cart_line_ordinal': 2, 'desired_state': {'quantity': 2}}),
         ('update_cart_item', {'cart_item_id': '802', 'cart_line_ordinal': 3, 'desired_state': {'size': 'M'}})]


def test_compound_cart_edits_keep_original_ordinals_and_stop_after_one_round(runtime):
    message = three_item_cart(runtime)
    runtime.provider.steps = [calls(*EDITS)]
    result = runtime.turn(message)
    assert [row['result']['status'] for row in result['tool_calls_log']] == ['ok'] * 3
    rows = cart_manager.get_cart(runtime.sid)['items']
    assert [(row['product_name'], row['quantity'], row['size']) for row in rows] == [
        ('Bánh Trung Thu Matcha', 2, 'M'), ('Trà Sữa Shan', 1, 'M')]
    assert len(runtime.provider.requests) == 1
    assert '**Giỏ hàng của bạn:**' in result['reply']


def test_partial_compound_edits_cannot_be_claimed_complete(runtime):
    message = three_item_cart(runtime)
    runtime.provider.steps = [calls(EDITS[0]), content('Đã xong.'), calls(*EDITS[1:])]
    result = runtime.turn(message)
    assert len(runtime.writes) == 3
    assert cart_manager.get_cart(runtime.sid)['items'][0]['quantity'] == 2
    assert len(runtime.provider.requests) == 3


@pytest.mark.parametrize('method,words', [('NGAN_HANG_QR', 'chuyển khoản qr'), ('VI_DIEN_TU', 'ví')])
def test_pickup_and_payment_are_recorded_together_from_customer_evidence(runtime, monkeypatch, method, words):
    monkeypatch.setattr(cart_tools, 'validate_wallet_selection', lambda _: None)
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'get_user_profile', lambda *a: dict(status='ok',
        default_address='42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Thành phố Hồ Chí Minh'))
    g = gateway(runtime, f'cho tôi lấy tại quán và thanh toán {words} đi')
    result = g.dispatch('set_checkout_choices', {'delivery_type': 'TAI_CHO'})
    assert result['status'] == 'ok'
    assert result['choices'] == {'delivery_type': 'MANG_DI', 'payment_method': method}
    assert cart_manager.get_checkout_prefs(runtime.sid)['profile_location_offer']['address'].startswith('42/3')
    assert not runtime.writes


def test_topping_is_visible_among_preserved_choices():
    reply = options_prompt(dict(status='needs_options', missing=['size'],
        product=dict(product_name='Trà Sữa Shan', toppings=['Trân châu trắng']),
        option_groups=[dict(name='Size', values=['Lớn', 'Vừa'], required=True)]))
    assert 'Topping: Trân châu trắng' in reply


def test_family_quantity_interpretation_is_read_only():
    assert interpret_shopping('cho tôi 1 ly nước').act == 'BROWSE_FAMILY'
    assert interpret_shopping('tôi muốn mua bánh có vị matcha').act == 'BROWSE_FAMILY'


def test_ward_reference_retains_exact_saved_address_for_later_confirmation(runtime, monkeypatch):
    from src.agents import order_flow_graph
    address = '42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Thành phố Hồ Chí Minh'
    cart_manager.set_checkout_prefs(runtime.sid, delivery_type='GIAO_TAN_NOI')
    cart_manager.set_checkout_context(runtime.sid, profile_location_offer=dict(address='12 Đường A, Hà Nội',
        addresses=[dict(full_address=address), dict(full_address='12 Đường A, Hà Nội')], purpose='delivery'))
    first = gateway(runtime, 'không tôi đang ở phường tây thạnh')
    narrowed = first.dispatch('resolve_location', dict(location='Phường Tây Thạnh', kind='area', for_checkout=True))
    assert narrowed['status'] == 'profile_location_confirmation_required'
    assert address in narrowed['message']
    locations = []
    monkeypatch.setattr(order_flow_graph, '_handle_location_request', lambda state:
        locations.append(state['location_override']) or dict(reply='Dạ, mình đang kiểm tra.', tool_calls_log=[]))
    second = gateway(runtime, 'tôi đang ở đó')
    second.dispatch('resolve_location', dict(location=address, kind='area', for_checkout=True))
    assert locations and locations[0].value == address and locations[0].kind == 'address'


def test_nearby_address_suggestions_explain_that_house_number_is_unverified():
    reply = location_choices(dict(status='rejected', normalized_location='42/3 Nguyễn Hữu Tiến',
        location_candidates=[dict(normalized_label='42 Nguyễn Hữu Tiến', accepted=False)]))
    assert '**42/3 Nguyễn Hữu Tiến**' in reply
    assert 'số nhà' in reply and 'gợi ý khác' in reply and 'chưa xác nhận địa chỉ giao' in reply


def test_selected_option_focus_supports_default_without_copying_cart_topping(runtime):
    runtime.provider.steps = [calls(('get_product_options', {'product_id': '101'})), content()]
    runtime.turn('cho tôi Cà Phê Alpha đi')
    runtime.provider.steps = [calls(('add_to_cart', {'product_id': '101', 'use_defaults': True})), content()]
    result = runtime.turn('theo mặc định cho tôi luôn đi')
    assert result['tool_calls_log'][0]['result']['status'] == 'ok'
    assert runtime.writes[0][1]['toppings'] == []
    assert 'lưu từ trước' in result['reply']


def test_default_without_selected_focus_is_a_choice_question_not_provider_failure(runtime):
    ConversationMemory(runtime.redis).save(runtime.sid, {**empty_memory(),
        'visible_snapshots': {'products': runtime.products}})
    g = gateway(runtime, 'theo mặc định')
    result = g.dispatch('add_to_cart', dict(product_id='101', use_defaults=True))
    assert result['status'] == 'product_choice_required' and not runtime.writes


def test_grouped_product_ordinal_keeps_food_numbering(runtime):
    from test_semantic_control import gateway_for, action
    runtime.products.append(dict(product_id='104', product_name='Cake Delta', category='food', final_price=60000, is_active=True))
    ConversationMemory(runtime.redis).save(runtime.sid, {**empty_memory(),
        'visible_snapshots': {'products': runtime.products}})
    g = gateway_for(runtime, 'cho tôi bánh số 2 size M đi')
    ref = {'namespace': 'PRODUCT', 'kind': 'ordinal', 'scope': 'food', 'index': 2}
    assert g.execute_semantic(action(g, 'add_to_cart', dict(product_id='103', size='M'), reference=ref))['status'] == 'reference_conflict'
    assert not runtime.writes
    assert g.execute_semantic(action(g, 'add_to_cart', dict(size='M'), reference=ref))['status'] == 'ok'
    assert runtime.writes[0][1]['product_id'] == '104'


def test_short_product_name_opens_options_for_the_selected_cold_variant(runtime):
    runtime.products[0]['product_name'] = 'Caramel Macchiato Đá'
    runtime.products[1]['product_name'] = 'Caramel Macchiato Nóng'
    ConversationMemory(runtime.redis).save(runtime.sid, {**empty_memory(),
        'visible_snapshots': {'products': runtime.products}, 'focus': {'product': {
            **runtime.products[2], 'source': 'filter_catalog'}}})
    runtime.provider.steps = [calls(('get_product_options', {'product_id': '101'})), content()]
    runtime.turn('cho tôi caramel đá đi')
    assert ConversationMemory(runtime.redis).load(runtime.sid)['focus']['product']['source'] == 'customer_selected_options'
    runtime.provider.steps = [calls(('add_to_cart', {'product_id': '101', 'use_defaults': True})), content()]
    result = runtime.turn('theo mặc định nhé')
    assert result['tool_calls_log'][0]['result']['status'] == 'ok'
    assert runtime.writes[0][1]['product_id'] == '101'


def test_prompt_and_output_budget_do_not_grow(runtime):
    from src.agents.llm_tool_orchestrator import SYSTEM_PROMPT
    from src.agents.tool_capabilities import CAPABILITIES
    assert len(SYSTEM_PROMPT) <= 9178 and len(CAPABILITIES) == 42
    from src.agents.agent_context import business_state
    from src.agents.tool_capabilities import capabilities_for_context
    assert {'cancel_order', 'update_order', 'reorder_order', 'confirm_order_change'}.isdisjoint(
        capabilities_for_context({'business': business_state(runtime.sid), 'visible': {}}))
    runtime.provider.steps = [calls(('filter_catalog', dict(category='drink', limit=1))), content()]
    runtime.turn('cho tôi xem 1 món cà phê')
    assert all(request['max_tokens'] == 600 for request in runtime.provider.requests)


def test_out_of_range_cart_ordinal_cannot_fall_back_to_focus(runtime):
    g = gateway(runtime, 'chỉnh món số 3 thành size L đi')
    result = g.dispatch('update_cart_item', dict(cart_item_id='800', desired_state={'size': 'L'}))
    assert result['status'] == 'cart_reference_conflict' and not runtime.writes


@pytest.mark.parametrize('message,tool,args', [
    ('đừng xóa Cà Phê Alpha', 'remove_cart_item', dict(cart_item_id='800')),
    ('không muốn đổi Cà Phê Alpha', 'update_cart_item', dict(cart_item_id='800', desired_state={'size': 'L'})),
    ('tại sao bạn xóa Cà Phê Alpha?', 'remove_cart_item', dict(cart_item_id='800'))])
def test_negatives_and_questions_about_prior_edits_do_not_mutate(runtime, message, tool, args):
    result = gateway(runtime, message).dispatch(tool, args)
    assert result['status'] == 'cart_change_not_requested' and not runtime.writes


def test_mistaken_family_add_becomes_catalog_choices_without_another_model_call(runtime):
    runtime.products[2]['product_name'] = 'Mochi Kem Matcha'
    runtime.provider.steps = [calls(('add_to_cart', {'product_id': '103', 'size': 'M'}))]
    result = runtime.turn('tôi muốn mua bánh có vị matcha')
    assert not runtime.writes and len(runtime.provider.requests) == 1
    assert [row['product_id'] for row in result['ui_payload']['products']] == ['103']


def test_drink_and_mooncake_are_both_displayed_without_adding_either(runtime):
    runtime.products[2]['product_name'] = 'Bánh Trung Thu Matcha'
    runtime.provider.steps = [calls(
        ('filter_catalog', dict(category='drink', search_text='nước', limit=1, planned_discovery_reads=2)),
        ('filter_catalog', dict(category='food', search_text='bánh trung thu', limit=1))),
        content('Dạ, bạn chọn giúp mình nhé.', display_product_ids=['101', '103'], display_product_count=2)]
    result = runtime.turn('tôi muốn mua thêm 1 ly nước với 1 cái bánh trung thu')
    assert not runtime.writes
    assert [row['product_id'] for row in result['ui_payload']['products']] == ['101', '103']


def test_explicit_size_overrides_valid_but_wrong_model_value(runtime):
    g = gateway(runtime, 'chỉnh món số 2 thành size L đi')
    result = g.dispatch('update_cart_item', dict(cart_item_id='801', cart_line_ordinal=2, desired_state={'size': 'M'}))
    assert result['status'] == 'ok'
    assert cart_manager.get_cart(runtime.sid)['items'][1]['size'] == 'L'


def test_declining_topping_never_removes_the_entire_drink(runtime):
    g = gateway(runtime, 'bỏ topping Cà Phê Alpha đi')
    assert g.dispatch('remove_cart_item', dict(cart_item_id='800'))['status'] == 'cart_change_not_requested'
    assert not runtime.writes
    result = g.dispatch('update_cart_item', dict(cart_item_id='800', desired_state={'toppings': ['Pearl']}))
    # A denied REMOVE cannot be repaired by switching to UPDATE in this same
    # gateway; a fresh turn independently validates the intended option edit.
    assert result['status'] == 'conflicting_cart_operations'
    g = gateway(runtime, 'bỏ topping Cà Phê Alpha đi')
    result = g.dispatch('update_cart_item', dict(cart_item_id='800', desired_state={'toppings': []}))
    assert result['status'] == 'ok'
    assert cart_manager.get_cart(runtime.sid)['items'][0]['toppings'] == []
