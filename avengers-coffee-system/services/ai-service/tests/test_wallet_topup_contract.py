"""Wallet recovery cards use canonical balances and never start payments via an LLM."""
from types import SimpleNamespace

import pytest

from test_llm_tool_orchestrator import runtime
from test_checkout_guarded_contract import calls
from src.common import cart_manager
from src.function_calling import helpers
from src.function_calling.tools import cart_tools


@pytest.fixture
def wallet(monkeypatch):
    balance = {'value': 20000}
    monkeypatch.setattr(helpers, '_require_valid_session', lambda uid: 'customer-1')
    monkeypatch.setattr(helpers, '_get_service_jwt', lambda uid: 'synthetic-jwt')
    def request(method, path, token, **kwargs):
        assert method == 'GET' and path == '/customers/customer-1/wallet'
        return SimpleNamespace(raise_for_status=lambda: None, json=lambda: {'wallet': {'balance': balance['value']}})
    monkeypatch.setattr(cart_tools, '_order_service_request', request)
    return balance


def test_insufficient_balance_supplies_presets_and_the_actual_shortfall(wallet):
    result = cart_tools.get_wallet_payment_options('session', 231300)
    option = result['payment_options'][-1]
    assert option['insufficient'] and not option['enabled']
    assert result['wallet_topup'] == dict(balance=20000, required_total=231300, shortfall=211300,
        min_amount=10000, max_amount=5000000, suggested_amounts=[50000, 100000, 200000, 211300, 500000])


@pytest.mark.parametrize('total', [25000, 5020000])
def test_suggested_shortfall_stays_inside_topup_limits(wallet, total):
    result = cart_tools.get_wallet_payment_options('session', total)['wallet_topup']
    assert all(10000 <= amount <= 5000000 for amount in result['suggested_amounts'])
    assert result['shortfall'] == total - 20000


@pytest.mark.parametrize('balance', [231300, 500000])
def test_sufficient_wallet_keeps_the_existing_checkout_option(wallet, balance):
    wallet['value'] = balance
    result = cart_tools.get_wallet_payment_options('session', 231300)
    assert result['payment_options'][-1]['enabled'] and 'wallet_topup' not in result


@pytest.mark.parametrize('total', [None, 0, -1, float('nan'), float('inf')])
def test_unverified_total_does_not_invent_a_shortfall(wallet, total):
    result = cart_tools.get_wallet_payment_options('session', total)
    assert not result['payment_options'][-1]['enabled'] and 'wallet_topup' not in result


@pytest.mark.parametrize('balance', [None, float('nan'), -1, 'not-a-balance'])
def test_unverified_balance_never_offers_a_payment_or_topup(wallet, balance):
    wallet['value'] = balance
    result = cart_tools.get_wallet_payment_options('session', 231300)
    assert result['wallet_balance'] is None and 'wallet_topup' not in result


def test_guarded_wallet_denial_renders_recovery_in_one_fake_model_request(runtime, wallet, monkeypatch):
    from src.agents import llm_tool_orchestrator
    monkeypatch.setattr(llm_tool_orchestrator, '_legacy_language_control', lambda *a: None)
    monkeypatch.setattr(cart_tools, 'execute_get_cart_quote', lambda sid:
        dict(status='ok', quote={'final_total': 231300}, cart=cart_manager.get_cart(sid)))
    runtime.provider.steps = [calls(('set_checkout_choices', dict(payment_method='VI_DIEN_TU', delivery_type='TAI_CHO')))]
    result = runtime.turn('cho tôi dùng tại chỗ và thanh toán ví đi bạn')
    assert result['error'] is None and len(runtime.provider.requests) == 1 and not runtime.writes
    assert '211.300đ' in result['reply'] and 'nạp thêm' in result['reply']
    offer = result['ui_payload']['wallet_topup']
    assert offer['shortfall'] == 211300 and 'dùng tại chỗ' in offer['resume_message']
    assert not result['ui_payload']['payment_options'][-1]['enabled']
    assert not cart_manager.get_checkout_prefs(runtime.sid).get('payment_method')
    wallet['value'] = 300000
    runtime.provider.steps = [calls(('set_checkout_choices', dict(payment_method='VI_DIEN_TU', delivery_type='TAI_CHO')))]
    resumed = runtime.turn(offer['resume_message'])
    assert cart_manager.get_checkout_prefs(runtime.sid)['payment_method'] == 'VI_DIEN_TU'
    assert not resumed['checkout_payload'] and 'wallet_topup' not in resumed['ui_payload']
    assert not runtime.writes  # Top-up success still cannot create an order.


def test_balance_drop_before_confirmation_offers_topup_without_submitting_order(runtime, wallet, monkeypatch):
    from src.common import checkout_service
    cart_manager.set_checkout_prefs(runtime.sid, payment_method='VI_DIEN_TU', delivery_type='TAI_CHO')
    cart_manager.set_checkout_context(runtime.sid, voucher_decided=True, summary_amounts={'final_total': 231300})
    cart_manager.mark_checkout_summary(runtime.sid)
    cart_manager.set_pending_action(runtime.sid, 'confirm_checkout', {})
    monkeypatch.setattr(cart_tools, '_quote_authoritative_cart', lambda *args, **kwargs: {'final_total': 231300})
    monkeypatch.setattr(checkout_service, 'finalize_checkout', lambda *args, **kwargs: pytest.fail('Cannot create an underfunded order'))
    result = cart_tools.execute_confirm_checkout(runtime.sid)
    assert result['status'] == 'insufficient_wallet' and result['wallet_topup']['shortfall'] == 211300
    assert not cart_manager.get_checkout_prefs(runtime.sid).get('summary_fingerprint')
    assert cart_manager.get_cart(runtime.sid)['items']
