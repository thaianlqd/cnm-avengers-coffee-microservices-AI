"""Offline replay of the Gò Vấp demo's timeout/503 and compound workflow gaps."""
from copy import deepcopy
import json
import pytest
from hybrid_support import runtime, hybrid, send, command as c, envelope, visible, no_cart
from src.common import cart_manager, agent_provider_policy as policy
from src.function_calling.tools import TOOL_EXECUTORS, branch_tools
from test_hybrid_journeys import journey
from test_provider_wait_budget import setup_latency, PRIMARY, SECONDARY
from test_provider_resilience import error


@pytest.mark.parametrize('failure',[TimeoutError('scripted timeout'),error(503)])
def test_hybrid_provider_failure_is_honest_retryable_and_never_writes(hybrid,monkeypatch,failure):
    clock=[1000.0]
    monkeypatch.setattr(policy.time,'time',lambda:clock[0])
    monkeypatch.setattr(policy.time,'monotonic',lambda:clock[0])
    before=deepcopy(cart_manager.get_cart(hybrid.sid)['items'])
    hybrid.provider.steps=[failure]
    text='chọn tôi chi nhánh 1 oke đó bạn, tôi muốn mua cà phê sữa á'
    failed=hybrid.turn(text,client_message_id='outage')
    assert failed['error'] in {'network_timeout','provider_transient'}
    assert 'gián đoạn kết nối' in failed['reply'] and '**30 giây**' in failed['reply']
    assert failed['_provider_retry']['no_tool_execution'] is True
    assert not failed['tool_calls_log'] and not hybrid.writes
    assert hybrid.turn(text,client_message_id='outage')==failed
    assert len(hybrid.provider.requests)==1 and cart_manager.get_cart(hybrid.sid)['items']==before
    clock[0]+=31
    recovered=send(hybrid,c('DISCOVER_PRODUCTS',scope='drink'),text=text,client_message_id='outage')
    assert not recovered['error'] and recovered['ui_payload']['products']
    requests=len(hybrid.provider.requests)
    assert hybrid.turn(text,client_message_id='outage')==recovered
    assert len(hybrid.provider.requests)==requests and not hybrid.writes


def test_all_models_cooling_returns_exact_wait_without_another_key_attempt(hybrid,monkeypatch):
    monkeypatch.setattr(policy.time,'monotonic',lambda:100.0)
    policy._transient_cooldowns[('gemini','test-model')]=(112,'provider_transient')
    result=send(hybrid,c('READ_CART'))
    assert result['provider_request_count']==0 and result['retry_after_seconds']==12
    assert '**12 giây**' in result['reply'] and not hybrid.writes and not hybrid.provider.requests


@pytest.mark.parametrize('mode',['dine_in','pickup'])
def test_fulfillment_with_explicit_area_skips_profile_offer_and_keeps_store_list(hybrid,monkeypatch,mode):
    no_cart(hybrid)
    monkeypatch.setitem(TOOL_EXECUTORS,'get_user_profile',lambda *a:pytest.fail('Customer already supplied a store area'))
    monkeypatch.setitem(TOOL_EXECUTORS,'get_store_info',lambda a,s:{'status':'ok','area':a['area'],
        'branches':[{'branch_id':'GV1','branch_name':'Quán Gò Vấp','address':'Phường Gò Vấp, TP.HCM'}]})
    result=send(hybrid,c('SET_FULFILLMENT',mode=mode),c('READ_STORE_INFO',facet='branches',query='phường Gò Vấp'))
    assert not result['error'] and 'Quán Gò Vấp' in result['reply']
    assert 'địa chỉ đã lưu' not in result['reply'].lower() and not cart_manager.get_checkout_prefs(hybrid.sid).get('profile_location_offer')
    assert not cart_manager.get_pending_action(hybrid.sid)
    assert result['ui_payload']['branches'][0]['branch_id']=='GV1'


def test_generic_fulfillment_without_location_retains_profile_offer(hybrid,monkeypatch):
    monkeypatch.setitem(TOOL_EXECUTORS,'get_user_profile',lambda a,s:{'status':'ok','default_address':'42 A, Phường Tây Thạnh, Thành phố Hồ Chí Minh'})
    result=send(hybrid,c('SET_FULFILLMENT',mode='dine_in'))
    assert not result['error'] and 'địa chỉ' in result['reply'].lower()
    assert cart_manager.get_checkout_prefs(hybrid.sid)['profile_location_offer']


def test_named_family_search_without_customer_count_omits_invented_five_item_shortage(hybrid):
    result=send(hybrid,c('DISCOVER_PRODUCTS',scope='drink',query='Cà Phê'))
    assert not result['error'] and len(result['ui_payload']['products'])==2
    assert '2/5' not in result['reply'] and 'Hiện tìm được' not in result['reply']
    explicit=send(hybrid,c('DISCOVER_PRODUCTS',scope='drink',query='Cà Phê',count=5))
    assert '2/5' in explicit['reply']


def test_successful_fallback_remains_preferred_after_primary_cooldown_expires(runtime,monkeypatch):
    fake=setup_latency(runtime,monkeypatch,[100,1,1,1])
    fake.complete()
    hint=policy._healthy_fallbacks['gemini']
    fake.clock[0]+=31
    fake.complete()
    assert [r['model'] for r in fake.calls]==[PRIMARY,SECONDARY,SECONDARY]
    assert policy._healthy_fallbacks['gemini']==hint # Healthy turns never extend the window indefinitely.
    fake.clock[0]=hint[1]+1
    fake.complete()
    assert fake.calls[-1]['model']==PRIMARY and 'gemini' not in policy._healthy_fallbacks


def test_explicit_model_override_beats_recovery_preference(runtime,monkeypatch):
    fake=setup_latency(runtime,monkeypatch,[1])
    policy._healthy_fallbacks['gemini']=(SECONDARY,200)
    result=policy.completion([{'role':'user','content':'fixture'}],[],preferred='gemini',explicit_model=PRIMARY,tier='lite',max_tokens=10)
    assert result[0] and fake.calls[0]['model']==PRIMARY


def test_fallback_failure_clears_hint_and_preserves_attempt_budget(runtime,monkeypatch):
    fake=setup_latency(runtime,monkeypatch,[error(503),1])
    policy._healthy_fallbacks['gemini']=(SECONDARY,200)
    result,metrics=fake.complete()
    assert result[0] and [r['model'] for r in fake.calls]==[SECONDARY,PRIMARY]
    assert metrics['provider_attempt_count']==2
    assert policy._healthy_fallbacks['gemini'][0]==PRIMARY


def test_reference_repair_pin_beats_model_recovery_hint(runtime,monkeypatch):
    fake=setup_latency(runtime,monkeypatch,[1])
    policy._healthy_fallbacks['gemini']=(SECONDARY,200)
    result,metrics=fake.complete(turn_health={'semantic_repair_pending':True,'last_success':('gemini',0,PRIMARY)})
    assert result[0] and fake.calls[0]['model']==PRIMARY


def test_select_branch_and_family_browse_clear_old_profile_question_and_do_not_prompt_menu(journey):
    no_cart(journey)
    cart_manager.set_checkout_prefs(journey.sid,delivery_type='TAI_CHO')
    cart_manager.set_checkout_context(journey.sid,profile_location_offer={'purpose':'nearby_branches','address':'42 A, TP.HCM'})
    cart_manager.set_pending_action(journey.sid,'confirm_address',{})
    visible(journey,branches=journey.branches)
    result=send(journey,c('SELECT_BRANCH',target={'kind':'ordinal','index':1}),c('DISCOVER_PRODUCTS',scope='drink',query='Cà Phê'))
    assert not result['error'] and cart_manager.get_cart(journey.sid)['branch_id']=='B1'
    assert not cart_manager.get_pending_action(journey.sid)
    assert not cart_manager.get_checkout_prefs(journey.sid).get('profile_location_offer')
    assert 'Bạn muốn xem menu' not in result['reply'] and '2/5' not in result['reply']
    assert len(result['ui_payload']['products'])==2
