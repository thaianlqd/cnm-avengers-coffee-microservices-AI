"""Offline regressions for the customer's October 8 live conversation."""
from copy import deepcopy
import pytest
from hybrid_support import runtime, hybrid, send, command as c, no_cart, pending, visible
from test_hybrid_journeys import journey, configure_two
from src.agents.confirmed_destination import from_candidate, drift
from src.agents.location_parser import canonical_address
from src.agents.tool_artifacts import candidate_id
from src.common import cart_manager
from src.function_calling.tools import branch_tools, cart_tools, product_tools

RAW_ADDRESS = '40 Đường Diên Hồng,Phường 1,Quận Bình Thạnh,Thành Phố Hồ Chí Minh'


def no_options(monkeypatch, rt, groups=None, ids=None):
    original = product_tools.execute_get_product_options
    def menu(**kw):
        result = original(**kw)
        if ids is None or kw['product_id'] in ids:
            result['option_groups'] = deepcopy(groups or [])
        return result
    monkeypatch.setattr(product_tools, 'execute_get_product_options', menu)
    no_cart(rt)


@pytest.mark.parametrize('groups', [[], [{'name':'Size','values':['M'],'required':True}]])
def test_no_configurable_options_auto_add_exact_quantity_and_replay(hybrid, monkeypatch, groups):
    rt = hybrid
    no_options(monkeypatch, rt, groups)
    result = send(rt, c('SELECT_PRODUCTS', mode='EXPLICIT', references=[
        {'kind':'ordinal','index':1,'quantity':2}, {'kind':'ordinal','index':3,'quantity':1}]),
        client_message_id='no-options')
    assert not result['error'] and not pending(rt)
    assert [(w[1]['product_id'],w[1]['quantity']) for w in rt.writes] == [('101',2),('103',1)]
    assert result['reply'].count('**Giỏ hàng của bạn:**') == 1
    assert 'chưa vào giỏ' not in result['reply'] and 'mặc định' not in result['reply']
    assert rt.turn('Scripted customer meaning',client_message_id='no-options') == result
    assert len(rt.writes) == 2


def test_option_information_question_never_auto_adds(hybrid, monkeypatch):
    no_options(monkeypatch, hybrid)
    result = send(hybrid,c('READ_PRODUCT_INFO',target={'kind':'focus'},facet='options'))
    assert not result['error'] and not hybrid.writes and not pending(hybrid)


def test_single_optional_topping_remains_a_customer_choice(hybrid, monkeypatch):
    no_options(monkeypatch,hybrid,[{'name':'Topping','values':['Foam'],'multiple':True,'required':False}])
    result = send(hybrid,c('SELECT_PRODUCTS',mode='EXPLICIT',references=[{'kind':'focus'}]))
    assert not result['error'] and pending(hybrid) and not hybrid.writes


def test_mixed_selection_auto_adds_only_no_options_and_prompts_remaining(hybrid, monkeypatch):
    no_options(monkeypatch,hybrid,ids={'103'})
    result = send(hybrid,c('SELECT_PRODUCTS',mode='ALL_VISIBLE'))
    assert not result['error']
    assert [w[1]['product_id'] for w in hybrid.writes] == ['103']
    assert [r['product_id'] for r in pending(hybrid)] == ['101','102']
    assert result['reply'].count('**Giỏ hàng của bạn:**') == 1
    assert 'Món đang chọn 3' not in result['reply']


def test_select_and_configure_no_options_same_turn_writes_once(hybrid, monkeypatch):
    no_options(monkeypatch,hybrid)
    result = send(hybrid,c('SELECT_PRODUCTS',mode='EXPLICIT',references=[{'kind':'focus'}]),
                  c('CONFIGURE_PRODUCT',quantity=2))
    assert not result['error'] and len(hybrid.writes) == 1 and hybrid.writes[0][1]['quantity'] == 2


def test_two_configurations_render_one_final_cart(hybrid):
    no_cart(hybrid); visible(hybrid,products=hybrid.products[:2])
    send(hybrid,c('SELECT_PRODUCTS',mode='ALL_VISIBLE'))
    result = send(hybrid,
        c('CONFIGURE_PRODUCT',target={'kind':'pending_ordinal','index':1},options={'size':'L'}),
        c('CONFIGURE_PRODUCT',target={'kind':'pending_ordinal','index':2},options={'size':'M'}))
    assert not result['error'] and len(hybrid.writes) == 2
    assert result['reply'].count('**Giỏ hàng của bạn:**') == 1
    assert 'Cà Phê Alpha' in result['reply'] and 'Cà Phê Beta' in result['reply']


def test_multi_add_partial_failure_reports_committed_cart_once(hybrid, monkeypatch):
    no_options(monkeypatch,hybrid)
    original = product_tools.execute_check_price_and_stock
    monkeypatch.setattr(product_tools,'execute_check_price_and_stock',lambda **kw:
        {'status':'not_found'} if kw['product_name_query']=='Cà Phê Beta' else original(**kw))
    result = send(hybrid,c('SELECT_PRODUCTS',mode='ALL_VISIBLE'))
    assert result['error']=='price_or_sellability_unverified' and len(hybrid.writes)==1
    assert result['reply'].count('**Giỏ hàng của bạn:**')==1 and 'Phần còn lại chưa thực hiện' in result['reply']
    assert [r['product_id'] for r in cart_manager.get_cart(hybrid.sid)['items']]==['101']


def location_ready(rt):
    configure_two(rt); send(rt,c('FINISH_CART')); send(rt,c('SKIP_VOUCHER'))
    send(rt,c('SET_FULFILLMENT',mode='delivery'))
    row = {**rt.candidates[0],'display_address':RAW_ADDRESS,'normalized_label':RAW_ADDRESS}
    row['candidate_id'] = candidate_id(row)
    cart_manager.set_checkout_context(rt.sid,location_candidate_snapshot={'candidates':[row]})
    visible(rt,location_candidates=[row])
    return row


def test_live_comma_label_confirmation_continues_payment_then_summary(journey):
    rt=journey; row=location_ready(rt)
    result=send(rt,c('SELECT_LOCATION_CANDIDATE',target={'kind':'ordinal','index':1}))
    assert not result['error'] and 'Phương thức thanh toán' in result['reply']
    prefs=cart_manager.get_checkout_prefs(rt.sid)
    assert prefs['delivery_address']==canonical_address(RAW_ADDRESS)
    assert prefs['confirmed_destination']['display_address']==RAW_ADDRESS and not drift(prefs)
    assert not prefs.get('payment_method') and not rt.orders
    assert rt.geo_reads[-1]['resolved_location']['lat']==row['lat']
    assert result['ui_payload']['payment_options']
    send(rt,c('SET_PAYMENT',target={'kind':'ordinal','index':1}))
    summary=send(rt,c('PREPARE_CHECKOUT'))
    assert not summary['error'] and summary['checkout_payload'] and not rt.orders
    assert rt.summaries[-1]['delivery_address']==canonical_address(RAW_ADDRESS)


def test_direct_geocode_confirmation_continues_payment(journey,monkeypatch):
    rt=journey; location_ready(rt)
    monkeypatch.setattr(branch_tools,'execute_find_nearest_branch',lambda **kw:
        {'status':'ok','branches':rt.branches,'resolved_location':rt.candidates[0]})
    result=send(rt,c('PROVIDE_LOCATION',value=RAW_ADDRESS,kind='address'))
    assert not result['error'] and 'Phương thức thanh toán' in result['reply']
    assert not drift(cart_manager.get_checkout_prefs(rt.sid)) and not rt.orders


def test_later_payment_in_same_turn_has_no_stale_payment_prompt(journey):
    rt=journey; location_ready(rt)
    result=send(rt,c('SELECT_LOCATION_CANDIDATE',target={'kind':'ordinal','index':1}),
                c('SET_PAYMENT',target={'kind':'name','value':'COD'}))
    assert not result['error'] and 'Bạn muốn chọn phương thức thanh toán nào' not in result['reply']
    assert cart_manager.get_checkout_prefs(rt.sid)['payment_method']=='THANH_TOAN_KHI_NHAN_HANG'


@pytest.mark.parametrize('change', ['street','coordinates','candidate','confirmation'])
def test_actual_destination_drift_still_blocks_checkout(journey,change):
    rt=journey; location_ready(rt)
    send(rt,c('SELECT_LOCATION_CANDIDATE',target={'kind':'ordinal','index':1}))
    prefs=cart_manager.get_checkout_prefs(rt.sid)
    if change=='street':
        cart_manager.set_checkout_prefs(rt.sid,delivery_address=RAW_ADDRESS.replace('40','41',1))
    elif change=='confirmation':
        cart_manager.set_checkout_context(rt.sid,address_confirmed=False)
    else:
        destination=deepcopy(prefs['confirmed_destination'])
        destination['lat' if change=='coordinates' else 'candidate_id']=0
        cart_manager.set_checkout_context(rt.sid,confirmed_destination=destination)
    result=send(rt,c('PREPARE_CHECKOUT'))
    assert result['error']=='confirmed_destination_drift' and not rt.summaries and not rt.orders


def test_partial_address_keeps_street_across_separate_ward_and_city(journey):
    rt=journey; configure_two(rt); send(rt,c('SET_FULFILLMENT',mode='delivery'))
    first=send(rt,c('PROVIDE_LOCATION',value='40 Diên Hồng, Quận Bình Thạnh',kind='address'))
    assert 'phường/xã' in first['reply'] and 'tỉnh/thành phố' in first['reply'] and 'số nhà' not in first['reply']
    second=send(rt,c('PROVIDE_LOCATION',value='Phường 1',kind='area'))
    assert 'tỉnh/thành phố' in second['reply'] and 'phường/xã' not in second['reply'] and not rt.geo_reads
    third=send(rt,c('PROVIDE_LOCATION',value='TP.HCM',kind='area'))
    assert not third['error'] and len(rt.geo_reads)==1
    assert rt.geo_reads[0]['location']=='40 Diên Hồng, Phường 1, Quận Bình Thạnh, Thành phố Hồ Chí Minh'


def test_full_replacement_address_never_merges_previous_street(journey):
    rt=journey; configure_two(rt); send(rt,c('SET_FULFILLMENT',mode='delivery'))
    send(rt,c('PROVIDE_LOCATION',value='40 Diên Hồng',kind='address'))
    send(rt,c('PROVIDE_LOCATION',value='71 Đường D9, Phường Sơn Kỳ, Thành phố Hồ Chí Minh',kind='address'))
    assert '40 Diên Hồng' not in rt.geo_reads[0]['location']
