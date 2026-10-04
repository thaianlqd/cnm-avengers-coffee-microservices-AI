"""Real phrases and delayed choices, with scripted inference and no network."""
from copy import deepcopy
import time

import pytest

from test_llm_tool_orchestrator import runtime
from test_checkout_guarded_contract import calls, gateway, offline
from src.agents import order_flow_graph
from src.agents.customer_choice_authority import profile_location_decision
from src.common import cart_manager

ADDRESS = '42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Thành phố Hồ Chí Minh'
OTHER_ADDRESS = '280 Nguyễn Huệ, Phường Bến Nghé, Thành phố Cần Thơ'


@pytest.fixture
def profile_offer(runtime, monkeypatch):
    cart_manager.set_checkout_prefs(runtime.sid, delivery_type='MANG_DI', payment_method='VI_DIEN_TU')
    offer = dict(address=ADDRESS, addresses=[
        dict(full_address=ADDRESS, label='Nhà riêng', is_default=True),
        dict(full_address=OTHER_ADDRESS, label='Nhà riêng', is_default=True)],
        purpose='nearby_branches', delivery_type='MANG_DI')
    cart_manager.set_checkout_context(runtime.sid, checkout_requested=True, voucher_decided=True,
        profile_location_offer=offer, suggested_address=ADDRESS)
    cart_manager.set_pending_action(runtime.sid, 'confirm_address', {})
    seen = []
    def location(state):
        seen.append(deepcopy(state))
        return dict(reply='Bạn chọn chi nhánh phù hợp nhé.', tool_calls_log=[dict(tool='find_nearest_branch',
            result=dict(status='ok', normalized_location=state['user_message'], branches=[
                dict(branch_id='nearby', branch_name='Quán gần đây', availability_status='available')]))])
    monkeypatch.setattr(order_flow_graph, '_handle_location_request', location)
    monkeypatch.setattr(order_flow_graph, '_persist_branch_candidates_from_result', lambda *a: None)
    return seen


@pytest.mark.parametrize('message,address', [
    ('tôi đang ở địa chỉ 1 ấy bạn', ADDRESS),
    ('tôi đang ở địa chỉ 1 ấy bạn ơi', ADDRESS),
    ('địa chỉ số 1 á bạn ơi', ADDRESS),
    ('địa chỉ 2 ấy bạn', OTHER_ADDRESS),
    ('địa chỉ đấy ấy bạn ơi', ADDRESS),
    ('địa chỉ ấy bạn ơi', ADDRESS),
    ('tôi đang ở đấy bạn', ADDRESS),
])
def test_exact_saved_address_answers_resolve_without_another_confirmation(runtime, profile_offer, message, address):
    runtime.provider.steps = [calls(('resolve_location', dict(location=address, kind='address', for_checkout=True)))]
    first = runtime.turn(message, client_message_id='saved-location-choice')
    replay = runtime.turn(message, client_message_id='saved-location-choice')
    assert first == replay and first['tool_calls_log'][-1]['result']['status'] == 'ok'
    assert len(profile_offer) == 1 and len(runtime.provider.requests) == 1
    assert profile_offer[0]['user_message'] == address
    assert profile_offer[0]['force_read_only_location']
    assert profile_offer[0]['location_purpose'] == 'nearby_branches'
    prefs = cart_manager.get_checkout_prefs(runtime.sid)
    assert not prefs.get('profile_location_offer') and not prefs.get('delivery_address')
    assert not prefs.get('address_confirmed') and not cart_manager.get_cart(runtime.sid).get('branch_id')


@pytest.mark.parametrize('message', ['địa chỉ đấy là gì?', 'tôi chưa ở đấy', 'không phải địa chỉ đấy',
    'địa chỉ đấy có phải ở Cần Thơ không', 'địa chỉ 1 Nguyễn Huệ', 'tôi không ở địa chỉ 1 ấy bạn'])
def test_nonchoices_cannot_use_the_offered_address(runtime, profile_offer, message):
    assert profile_location_decision(message) != 'YES'
    result = gateway(runtime, message).dispatch('resolve_location',
        dict(location=ADDRESS, kind='address', for_checkout=True))
    assert result['status'] != 'ok' and not profile_offer


@pytest.mark.parametrize('clear_memory', [False, True])
def test_deictic_answer_retains_saved_offer_after_pending_expiry(runtime, profile_offer, clear_memory):
    cart_manager.set_checkout_context(runtime.sid, pending_action=dict(type='confirm_address', expires_at=time.time()-1))
    assert cart_manager.get_pending_action(runtime.sid) is None
    if clear_memory:
        runtime.redis.data.clear()
    result = gateway(runtime, 'địa chỉ đấy ấy bạn ơi').dispatch('resolve_location',
        dict(location=ADDRESS, kind='address', for_checkout=True))
    assert result['status'] == 'ok' and len(profile_offer) == 1


def test_model_cannot_use_a_different_saved_address_than_the_customer_selected(runtime, profile_offer):
    result = gateway(runtime, 'địa chỉ 2 ấy bạn').dispatch('resolve_location',
        dict(location=ADDRESS, kind='address', for_checkout=True))
    assert result['status'] == 'profile_location_confirmation_required' and not profile_offer


@pytest.mark.parametrize('message', ['bỏ qua đi bạn', 'bỏ qua đi bạn ơi', 'không cần bạn nhé'])
def test_short_voucher_skip_uses_the_current_offer_after_pending_expiry(runtime, message):
    cart_manager.set_checkout_context(runtime.sid, voucher_offer_pending=True, voucher_decided=None,
        flow_stage='VOUCHER', voucher_candidates=[dict(ma_voucher='TEST')],
        pending_action=dict(type='select_voucher', expires_at=time.time()-1))
    assert cart_manager.get_pending_action(runtime.sid) is None
    runtime.provider.steps = [calls(('skip_voucher', {}))]
    first = runtime.turn(message, client_message_id='delayed-skip')
    replay = runtime.turn(message, client_message_id='delayed-skip')
    assert first == replay and first['tool_calls_log'][-1]['result']['status'] == 'ok'
    prefs = cart_manager.get_checkout_prefs(runtime.sid)
    assert prefs['voucher_decided'] and not prefs.get('voucher_offer_pending')
    assert not prefs.get('voucher_code') and not prefs.get('completed_order_id')
    assert len(runtime.provider.requests) == 1


@pytest.mark.parametrize('message', ['bỏ qua đi bạn', 'bỏ qua đi bạn?', 'được rồi', 'bỏ qua món 1'])
def test_short_skip_has_no_voucher_authority_outside_a_current_offer(runtime, message):
    cart_manager.set_checkout_context(runtime.sid, voucher_offer_pending=None, voucher_decided=None)
    cart_manager.set_pending_action(runtime.sid, 'confirm_address', {})
    result = gateway(runtime, message, filtered=False).dispatch('skip_voucher', {})
    assert result['status'] == 'voucher_choice_required'
    assert not cart_manager.get_checkout_prefs(runtime.sid).get('voucher_decided')


def test_question_and_general_ok_cannot_skip_an_open_voucher_offer(runtime):
    cart_manager.set_checkout_context(runtime.sid, voucher_offer_pending=True, voucher_decided=None)
    for message in ('bỏ qua đi bạn?', 'bỏ qua có mất ưu đãi không', 'oke vậy được rồi'):
        result = gateway(runtime, message).dispatch('skip_voucher', {})
        assert result['status'] == 'voucher_choice_required'
    assert not cart_manager.get_checkout_prefs(runtime.sid).get('voucher_decided')


def test_unrelated_pending_step_cannot_reuse_an_old_voucher_flag(runtime):
    cart_manager.set_checkout_context(runtime.sid, voucher_offer_pending=True, voucher_decided=None)
    cart_manager.set_pending_action(runtime.sid, 'confirm_address', {})
    result = gateway(runtime, 'bỏ qua đi bạn').dispatch('skip_voucher', {})
    assert result['status'] == 'voucher_choice_required'
    assert not cart_manager.get_checkout_prefs(runtime.sid).get('voucher_decided')
