"""Replay the second live report: generic cart OK, profile offers, and provider churn."""
from copy import deepcopy

import pytest

from test_customer_checkout_presentation import shop, add_drink, send
from test_llm_tool_orchestrator import runtime
from test_checkout_guarded_contract import calls, content, gateway
from src.agents.agent_context import model_projection
from src.agents.customer_choice_authority import voucher_choice
from src.common import cart_manager
from src.function_calling import tools
from src.function_calling.tools import voucher_tools, product_tools

ADDRESS = '12 Đường A, Phường B, Thành phố Hồ Chí Minh'


def ready(shop):
    add_drink(shop)
    send(shop, 'hoàn tất giỏ', ('finish_cart', {}))
    send(shop, 'bỏ qua mã', ('skip_voucher', {}))


@pytest.mark.parametrize('phrase', ['oke vậy được rồi', 'oke bạn', 'vậy được rồi', 'hoàn tất giỏ hàng'])
@pytest.mark.parametrize('operation', ['apply_voucher', 'skip_voucher'])
def test_cart_completion_cannot_select_or_skip_voucher_in_same_batch(shop, monkeypatch, phrase, operation):
    add_drink(shop)
    applied = []
    original = voucher_tools.execute_apply_voucher
    monkeypatch.setattr(voucher_tools, 'execute_apply_voucher', lambda *a: applied.append(a) or original(*a))
    result = send(shop, phrase, ('finish_cart', {}),
        (operation, {'voucher_code': 'SAVE1'} if operation == 'apply_voucher' else {}))
    # The second capability was absent at inference entry. The gateway also
    # rejects it independently once the voucher gate is open on a later turn.
    assert [row['tool'] for row in result['tool_calls_log']] == ['finish_cart']
    g = gateway(shop, phrase)
    denied = g.dispatch(operation, {'voucher_code': 'SAVE1'} if operation == 'apply_voucher' else {})
    assert denied['status'] == 'voucher_choice_required'
    assert not applied
    assert result['conversation_state'] == 'VOUCHER'
    assert len(result['ui_payload']['vouchers']) == 18
    assert 'Các mã giảm giá phù hợp' in result['reply'] and 'đã áp dụng' not in result['reply']
    assert not result['ui_payload'].get('payment_options')
    assert not cart_manager.get_checkout_prefs(shop.sid).get('voucher_decided')


def test_finish_cart_returns_offer_before_further_provider_failure(shop):
    add_drink(shop)
    shop.provider.steps = [calls(('finish_cart', {})), RuntimeError('synthetic Gemini 503')]
    before = len(shop.provider.requests)
    result = shop.turn('oke vậy được rồi', client_message_id='finished-once')
    assert len(shop.provider.requests) == before + 1
    assert result['error'] is None and 'SAVE18' in result['reply']
    assert isinstance(shop.provider.steps[0], RuntimeError)
    assert shop.turn('oke vậy được rồi', client_message_id='finished-once') == result


@pytest.mark.parametrize('groups', [[], [dict(name='Kích thước', values=['Nhỏ'], required=True)]])
def test_option_free_or_fixed_recipe_does_not_reject_use_defaults(shop, monkeypatch, groups):
    monkeypatch.setattr(product_tools, 'execute_get_product_options', lambda **kw:
        dict(status='ok', product_id='101', product_name='Caramel Macchiato Đá', option_groups=groups))
    result = send(shop, 'cho tôi món này nhé', ('add_to_cart', {'product_id': '101', 'use_defaults': True}))
    assert result['tool_calls_log'][0]['result']['status'] == 'ok'
    assert len(shop.writes) == 1


@pytest.mark.parametrize('kind,phrase', [('GIAO_TAN_NOI', 'giao tận nơi và tiền mặt'),
    ('MANG_DI', 'lấy tại quán và tiền mặt'), ('TAI_CHO', 'dùng tại chỗ và tiền mặt')])
def test_all_fulfillments_offer_saved_address_then_resolve_only_after_customer_yes(shop, monkeypatch, kind, phrase):
    from src.agents import order_flow_graph
    ready(shop)
    reads, resolved = [], []
    def profile(args, sid):
        reads.append(sid)
        return dict(status='ok', default_address=ADDRESS, address_items=[
            dict(full_address=ADDRESS, is_default=True, label='Nhà')], email='private@example.test')
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'get_user_profile', profile)
    def geo(state):
        resolved.append(deepcopy(state))
        return {'reply': 'Dạ, đây là các chi nhánh gần bạn.', 'tool_calls_log': [
            {'tool': 'find_nearest_branch', 'result': {'status': 'ok', 'branches': [
                dict(branch_id='nearby', branch_name='Quán gần', availability_status='available')]}}]}
    monkeypatch.setattr(order_flow_graph, '_handle_location_request', geo)
    monkeypatch.setattr(order_flow_graph, '_persist_branch_candidates_from_result', lambda *a: None)
    before = len(shop.provider.requests)
    offered = send(shop, phrase, ('set_checkout_choices', {'delivery_type': kind, 'payment_method': 'THANH_TOAN_KHI_NHAN_HANG'}))
    assert len(shop.provider.requests) == before + 1 and reads == [shop.sid]
    assert ADDRESS in offered['reply'] and 'Bạn đang ở' in offered['reply']
    assert 'Tiền mặt (COD)' in offered['reply'] and not resolved
    prefs = cart_manager.get_checkout_prefs(shop.sid)
    assert not prefs.get('delivery_address') and not prefs.get('address_confirmed')
    assert not cart_manager.get_cart(shop.sid).get('branch_id')
    assert cart_manager.get_pending_action(shop.sid)['type'] == 'confirm_address'
    g = gateway(shop, 'oke bạn')
    view = model_projection(g.context)[0]['business']
    assert view['checkout']['profile_location_offer']['address'] == ADDRESS
    assert view['next_step'].startswith('PROFILE_LOCATION:')
    checked = g.dispatch('resolve_location', {'location': ADDRESS, 'kind': 'address', 'for_checkout': True})
    assert checked['status'] == 'ok'
    assert len(resolved) == 1 and resolved[0]['user_message'] == ADDRESS
    assert resolved[0]['force_read_only_location'] == (kind != 'GIAO_TAN_NOI')
    assert not cart_manager.get_checkout_prefs(shop.sid).get('profile_location_offer')
    assert 'private@example.test' not in offered['reply']
    if kind != 'GIAO_TAN_NOI':
        assert not cart_manager.get_checkout_prefs(shop.sid).get('delivery_address')
        assert not cart_manager.get_cart(shop.sid).get('branch_id')


def test_profile_offer_cannot_be_resolved_in_the_turn_it_is_shown(shop, monkeypatch):
    ready(shop)
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'get_user_profile', lambda *a: dict(status='ok', default_address=ADDRESS))
    g = gateway(shop, 'giao tận nơi và tiền mặt')
    assert g.dispatch('set_checkout_choices', {'delivery_type': 'GIAO_TAN_NOI', 'payment_method': 'THANH_TOAN_KHI_NHAN_HANG'})['status'] == 'ok'
    denied = g.dispatch('resolve_location', {'location': ADDRESS, 'kind': 'address', 'for_checkout': True})
    assert denied['status'] == 'profile_location_confirmation_required'
    assert not cart_manager.get_checkout_prefs(shop.sid).get('delivery_address')


def test_rejecting_saved_address_asks_new_location_and_preserves_cart(shop, monkeypatch):
    ready(shop)
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'get_user_profile', lambda *a: dict(status='ok', default_address=ADDRESS))
    send(shop, 'lấy tại quán', ('set_checkout_choices', {'delivery_type': 'MANG_DI'}))
    before = deepcopy(cart_manager.get_cart(shop.sid)['items'])
    g = gateway(shop, 'không bạn, tôi ở chỗ khác')
    denied = g.dispatch('resolve_location', {'location': ADDRESS, 'kind': 'address', 'for_checkout': False})
    assert denied['status'] == 'needs_new_location'
    assert not cart_manager.get_checkout_prefs(shop.sid).get('profile_location_offer')
    assert cart_manager.get_cart(shop.sid)['items'] == before


@pytest.mark.parametrize('profile', [dict(status='ok', address_items=[], default_address=None), dict(status='error')])
def test_missing_or_unavailable_profile_asks_literal_location_without_hallucinating(shop, monkeypatch, profile):
    ready(shop)
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'get_user_profile', lambda *a: deepcopy(profile))
    result = send(shop, 'giao tận nơi và tiền mặt', ('set_checkout_choices',
        {'delivery_type': 'GIAO_TAN_NOI', 'payment_method': 'THANH_TOAN_KHI_NHAN_HANG'}))
    assert 'địa chỉ' in result['reply'] and ADDRESS not in result['reply']
    assert result['error'] is None
    assert not cart_manager.get_checkout_prefs(shop.sid).get('profile_location_offer')


def test_explicit_new_address_is_not_replaced_by_saved_profile(shop, monkeypatch):
    ready(shop)
    def forbidden(*a):
        pytest.fail('Explicit current address must win without an extra profile lookup')
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'get_user_profile', forbidden)
    g = gateway(shop, f'giao tận nơi và tiền mặt đến {ADDRESS}')
    result = g.dispatch('set_checkout_choices', {'delivery_type': 'GIAO_TAN_NOI', 'payment_method': 'THANH_TOAN_KHI_NHAN_HANG'})
    assert result['profile_location']['status'] == 'explicit_location'
    assert not cart_manager.get_checkout_prefs(shop.sid).get('profile_location_offer')


@pytest.mark.parametrize('phrase', ['oke vậy được rồi', 'oke bạn', '2 cái bánh nhé', 'không chọn mã tốt nhất', 'mã SAVE1 có dùng được không?', 'mã nào giảm nhiều nhất', 'có mã nào tốt nhất'])
def test_cart_quantity_negation_questions_and_generic_ok_are_not_voucher_choices(shop, phrase):
    assert voucher_choice(phrase, shop.vouchers) is None


@pytest.mark.parametrize('phrase,selected', [('2', 'office'), ('Công ty', 'office'), ('địa chỉ mặc định', 'home')])
def test_multiple_saved_addresses_are_shown_and_selected_independently(shop, monkeypatch, phrase, selected):
    from src.agents import order_flow_graph
    ready(shop)
    office = '25 Đường C, Phường D, Thành phố Hồ Chí Minh'
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'get_user_profile', lambda *a: dict(status='ok',
        default_address=ADDRESS, address_items=[dict(full_address=office, label='Công ty'),
            dict(full_address=ADDRESS, label='Nhà', is_default=True)]))
    offered = send(shop, 'lấy tại quán', ('set_checkout_choices', {'delivery_type': 'MANG_DI'}))
    assert ADDRESS in offered['reply'] and office in offered['reply']
    assert offered['reply'].index(ADDRESS) < offered['reply'].index(office)
    resolved = []
    monkeypatch.setattr(order_flow_graph, '_handle_location_request', lambda state: resolved.append(state) or
        dict(reply='Dạ, đây là các quán gần bạn.', tool_calls_log=[dict(tool='find_nearest_branch', result=dict(status='ok'))]))
    g = gateway(shop, phrase)
    chosen = office if selected == 'office' else ADDRESS
    wrong = ADDRESS if selected == 'office' else office
    assert g.dispatch('resolve_location', {'location': wrong, 'kind': 'address', 'for_checkout': False})['status'] == 'profile_location_confirmation_required'
    assert not resolved and cart_manager.get_checkout_prefs(shop.sid).get('profile_location_offer')
    assert g.dispatch('resolve_location', {'location': chosen, 'kind': 'address', 'for_checkout': False})['status'] == 'ok'
    assert resolved[0]['user_message'] == chosen and resolved[0]['force_read_only_location']


@pytest.mark.parametrize('phrase', ['không topping nhé', 'địa chỉ mặc định là gì?', 'có phải địa chỉ Nhà không'])
def test_profile_interruptions_do_not_confirm_or_discard_saved_address(shop, monkeypatch, phrase):
    ready(shop)
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'get_user_profile', lambda *a: dict(status='ok',
        default_address=ADDRESS, address_items=[dict(full_address=ADDRESS, label='Nhà', is_default=True)]))
    send(shop, 'giao tận nơi', ('set_checkout_choices', {'delivery_type': 'GIAO_TAN_NOI'}))
    g = gateway(shop, phrase)
    assert g.dispatch('resolve_location', {'location': ADDRESS, 'kind': 'address', 'for_checkout': True})['status'] == 'profile_location_confirmation_required'
    assert cart_manager.get_checkout_prefs(shop.sid).get('profile_location_offer')


def test_profile_decline_is_rendered_without_another_provider_round(shop, monkeypatch):
    ready(shop)
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'get_user_profile', lambda *a: dict(status='ok', default_address=ADDRESS))
    send(shop, 'giao tận nơi', ('set_checkout_choices', {'delivery_type': 'GIAO_TAN_NOI'}))
    before = len(shop.provider.requests)
    result = send(shop, 'không bạn tôi ở chỗ khác', ('resolve_location',
        {'location': ADDRESS, 'kind': 'address', 'for_checkout': True}))
    assert len(shop.provider.requests) == before + 1
    assert result['error'] is None and 'địa chỉ hoặc khu vực khác' in result['reply']


def test_profile_offer_cannot_be_bypassed_with_an_invented_other_address(shop, monkeypatch):
    ready(shop)
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'get_user_profile', lambda *a: dict(status='ok', default_address=ADDRESS))
    send(shop, 'giao tận nơi', ('set_checkout_choices', {'delivery_type': 'GIAO_TAN_NOI'}))
    g = gateway(shop, 'oke bạn')
    result = g.dispatch('resolve_location', {'location': '25 Đường C, Phường D, Thành phố Hồ Chí Minh',
        'kind': 'address', 'for_checkout': True})
    assert result['status'] == 'profile_location_confirmation_required'
    assert cart_manager.get_checkout_prefs(shop.sid).get('profile_location_offer')
