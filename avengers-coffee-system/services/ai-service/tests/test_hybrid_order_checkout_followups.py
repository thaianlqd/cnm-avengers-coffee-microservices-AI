"""Owned order references and automatic checkout review, all transports offline."""
from copy import deepcopy
import json
import pytest
from hybrid_support import runtime, hybrid, send, command as c, envelope, visible
from test_hybrid_journeys import journey, configure_two, deliver
from test_order_management_and_sales import service, OID, OTHER
from src.agents import order_management
from src.agents.agent_context import build_context
from src.agents.agent_memory import ConversationMemory, empty_memory
from src.agents.hybrid_command_schema import validate_envelope
from src.agents.hybrid_workflow import TurnContext
from src.common import cart_manager
from src.function_calling.tools import cart_tools, branch_tools, voucher_tools, TOOL_EXECUTORS


@pytest.mark.parametrize('kind', ['focus','last_created'])
def test_cancel_just_created_cod_preview_confirm_and_replay(hybrid,service,kind):
    rt=hybrid; order,calls=service
    order.update(phuong_thuc_thanh_toan='THANH_TOAN_KHI_NHAN_HANG',trang_thai_thanh_toan='CHO_THANH_TOAN_KHI_NHAN_HANG')
    # UI checkout completion writes the durable receipt independently of agent memory.
    cart_manager.clear_cart(rt.sid,order_id=OID)
    ConversationMemory(rt.redis).save(rt.sid,empty_memory())
    result=send(rt,c('PREPARE_ORDER_CHANGE',target={'kind':kind},action='CANCEL'),
        text='sorry tôi hết tiền rồi huỷ đơn đó được không bạn@@')
    assert not result['error'] and OID in result['reply'] and 'xác nhận' in result['reply']
    assert 'hoàn vào' not in result['reply'] and not any(call[4] for call in calls)
    context=json.loads(rt.provider.requests[-1]['messages'][0]['content'].split('CURRENT CONTEXT (DATA): ')[1])
    assert context['order_references'][kind] == {'kind':kind}
    confirmed=send(rt,c('CONFIRM_ORDER_CHANGE'),text='xác nhận huỷ',client_message_id='cancel-confirm')
    assert not confirmed['error'] and 'thành công' in confirmed['reply']
    assert len([call for call in calls if call[4]]) == 1
    assert calls[-1][0]=='PATCH' and calls[-1][1].endswith(OID+'/cancel')
    assert calls[-1][2]['expected_revision']=='revision-1'
    assert rt.turn('xác nhận huỷ',client_message_id='cancel-confirm')==confirmed
    assert len([call for call in calls if call[4]])==1


def test_malformed_focus_reference_repairs_without_copying_order_id(hybrid,service):
    rt=hybrid; cart_manager.clear_cart(rt.sid,order_id=OID)
    rt.provider.steps=[{'content':json.dumps(envelope(c('PREPARE_ORDER_CHANGE',
        target={'kind':'focus','value':OID},action='CANCEL')))},
        {'content':json.dumps(envelope(c('PREPARE_ORDER_CHANGE',target={'kind':'focus'},action='CANCEL')))}]
    result=rt.turn('huỷ đơn đó được không bạn')
    assert not result['error'] and result['provider_request_count']==2
    assert not any(call[4] for call in service[1])


@pytest.mark.parametrize('kind', ['focus','last_created'])
def test_missing_order_reference_never_guesses_latest_history(hybrid,service,kind):
    visible(hybrid,orders=[{'order_id':OID},{'order_id':OTHER}])
    result=send(hybrid,c('PREPARE_ORDER_CHANGE',target={'kind':kind},action='CANCEL'))
    assert result['error']=='unknown_reference' and 'mã đơn' in result['reply'] and not service[1]


def test_explicit_read_focus_and_last_created_remain_separate(hybrid,service):
    rt=hybrid; cart_manager.clear_cart(rt.sid,order_id=OTHER)
    visible(rt,orders=[{'order_id':OID}])
    send(rt,c('READ_ORDER',target={'kind':'ordinal','index':1}))
    result=send(rt,c('PREPARE_ORDER_CHANGE',target={'kind':'focus'},action='CANCEL'))
    assert not result['error'] and cart_manager.get_checkout_prefs(rt.sid)['order_management_action']['order_id']==OID
    context,_=build_context(rt.sid,ConversationMemory(rt.redis).load(rt.sid),project=False)
    turn=TurnContext.capture(context)
    assert turn.state['checkout']['last_created_order_id']==OTHER
    assert turn.focus['order']['order_id']==OID


def test_unowned_last_created_reference_rejected_by_owned_service(hybrid,monkeypatch):
    cart_manager.clear_cart(hybrid.sid,order_id=OTHER)
    monkeypatch.setattr(order_management,'request',lambda *a,**kw:{'status':'rejected','message':'Không tìm thấy đơn của bạn.'})
    result=send(hybrid,c('PREPARE_ORDER_CHANGE',target={'kind':'last_created'},action='CANCEL'))
    assert result['error']=='rejected' and not cart_manager.get_checkout_prefs(hybrid.sid).get('order_management_action')


@pytest.mark.parametrize('status',['DANG_CHUAN_BI','DANG_GIAO','HOAN_THANH'])
def test_late_cod_cancel_stops_before_preview(hybrid,service,status):
    order,calls=service
    order.update(trang_thai_don_hang=status,phuong_thuc_thanh_toan='THANH_TOAN_KHI_NHAN_HANG')
    cart_manager.clear_cart(hybrid.sid,order_id=OID)
    result=send(hybrid,c('PREPARE_ORDER_CHANGE',target={'kind':'last_created'},action='CANCEL'))
    assert result['error']=='rejected' and status in result['reply'] and not any(call[4] for call in calls)


def test_cancelled_order_reports_already_cancelled_then_can_reorder(hybrid,service):
    order,calls=service; order['trang_thai_don_hang']='DA_HUY'
    cart_manager.clear_cart(hybrid.sid,order_id=OID)
    result=send(hybrid,c('PREPARE_ORDER_CHANGE',target={'kind':'last_created'},action='CANCEL'))
    assert not result['error'] and 'đã huỷ' in result['reply'] and not any(call[4] for call in calls)
    before=deepcopy(cart_manager.get_cart(hybrid.sid)['items'])
    result=send(hybrid,c('REORDER_ORDER',target={'kind':'focus'}))
    assert not result['error'] and 'giá Menu hiện tại' in result['reply']
    assert cart_manager.get_cart(hybrid.sid)['items']==before and not any(call[4] for call in calls)
    confirmed=send(hybrid,c('CONFIRM_ORDER_CHANGE'),text='xác nhận đặt lại')
    assert not confirmed['error'] and calls[-1][0]=='POST' and calls[-1][1].endswith('/reorder')
    assert calls[-1][2]['order_id']==OID and calls[-1][3].startswith('ai:reorder:')


def test_update_just_created_order_uses_owned_line_not_cart_ordinal(hybrid,service):
    cart_manager.clear_cart(hybrid.sid,order_id=OID)
    result=send(hybrid,c('PREPARE_ORDER_CHANGE',target={'kind':'last_created'},action='UPDATE',
        changes=[{'action':'SET_QUANTITY','target':{'kind':'ordinal','index':2},'quantity':2}]))
    assert not result['error'] and not cart_manager.get_cart(hybrid.sid)['items']
    action=cart_manager.get_checkout_prefs(hybrid.sid)['order_management_action']
    assert next(row for row in action['payload']['items'] if row['id']==22)['so_luong']==2
    assert not any(call[4] for call in service[1])


@pytest.mark.parametrize('intent',['READ_ORDER','PREPARE_ORDER_CHANGE','REORDER_ORDER'])
def test_last_created_is_order_only_and_has_no_value_or_index(intent):
    args={'target':{'kind':'last_created'}}
    if intent=='PREPARE_ORDER_CHANGE': args['action']='CANCEL'
    assert validate_envelope(envelope(c(intent,**args)))[1] is None
    for field,value in [('value',OID),('index',1)]:
        assert validate_envelope(envelope(c(intent,**{**args,'target':{**args['target'],field:value}})))[1]
    assert validate_envelope(envelope(c('SELECT_PRODUCTS',mode='EXPLICIT',references=[{'kind':'last_created'}])))[1]


def ready_at_store(rt,mode='dine_in'):
    configure_two(rt); send(rt,c('FINISH_CART')); send(rt,c('SKIP_VOUCHER'))
    send(rt,c('SET_FULFILLMENT',mode=mode))
    cart_manager.set_branch(rt.sid,'B1','Quán Một')


@pytest.mark.parametrize('mode',['dine_in','pickup'])
def test_payment_completes_store_checkout_shows_summary_without_extra_turn(journey,mode):
    rt=journey; ready_at_store(rt,mode)
    result=send(rt,c('SET_PAYMENT',target={'kind':'name','value':'COD'}),client_message_id='payment-final')
    assert not result['error'] and result['checkout_payload'] and not rt.orders
    assert result['conversation_state']=='CHECKOUT_CONFIRMATION'
    assert result['reply'].count('**Giỏ hàng của bạn:**')==1
    assert 'Bạn có thể xem lại' not in result['reply'] and not result['ui_payload']['payment_options']
    assert len(rt.summaries)==1
    prefs=cart_manager.get_checkout_prefs(rt.sid)
    assert prefs['hybrid_summary_turn_id']=='payment-final' and prefs['checkout_action_id']
    assert rt.turn('Scripted customer meaning',client_message_id='payment-final')==result and len(rt.summaries)==1
    confirmed=send(rt,c('CONFIRM_CHECKOUT'),text='xác nhận đặt đơn')
    assert not confirmed['error'] and len(rt.orders)==1


def test_delivery_payment_auto_summary_preserves_confirmed_destination(journey):
    rt=journey; configure_two(rt); send(rt,c('FINISH_CART')); send(rt,c('SKIP_VOUCHER')); deliver(rt)
    result=send(rt,c('SET_PAYMENT',target={'kind':'name','value':'COD'}))
    assert result['checkout_payload']['delivery_address']==cart_manager.get_checkout_prefs(rt.sid)['confirmed_destination']['display_address']
    assert len(rt.summaries)==1 and not rt.orders


def test_branch_is_last_prerequisite_and_also_triggers_summary(journey):
    rt=journey; ready_at_store(rt)
    cart_manager.clear_branch(rt.sid)
    send(rt,c('SET_PAYMENT',target={'kind':'name','value':'COD'}))
    assert not rt.summaries
    cart_manager.set_checkout_context(rt.sid,branch_candidates=rt.branches)
    visible(rt,branches=rt.branches)
    result=send(rt,c('SELECT_BRANCH',target={'kind':'ordinal','index':1}))
    assert not result['error'] and result['checkout_payload'] and len(rt.summaries)==1 and not rt.orders


def test_read_only_turn_never_automatically_creates_checkout_review(journey):
    rt=journey; ready_at_store(rt)
    cart_manager.set_checkout_prefs(rt.sid,payment_method='THANH_TOAN_KHI_NHAN_HANG')
    result=send(rt,c('READ_CART'))
    assert not result['error'] and not result['checkout_payload'] and not rt.summaries


def test_summary_failure_after_selected_payment_is_honest_and_does_not_create_order(journey,monkeypatch):
    rt=journey; ready_at_store(rt)
    monkeypatch.setattr(cart_tools,'execute_request_checkout',lambda *a,**kw:
        {'status':'quote_error','message':'Chưa xác minh được tổng tiền mới.'})
    result=send(rt,c('SET_PAYMENT',target={'kind':'name','value':'COD'}))
    assert result['error']=='quote_error' and not result['checkout_payload'] and not rt.orders
    assert cart_manager.get_checkout_prefs(rt.sid)['payment_method']=='THANH_TOAN_KHI_NHAN_HANG'
    assert 'Chưa xác minh' in result['reply']


def test_explicit_summary_same_turn_is_not_prepared_twice(journey):
    rt=journey; ready_at_store(rt)
    result=send(rt,c('SET_PAYMENT',target={'kind':'name','value':'COD'}),c('PREPARE_CHECKOUT'))
    assert not result['error'] and result['checkout_payload'] and len(rt.summaries)==1 and not rt.orders


def test_declining_order_change_preserves_order(hybrid,service):
    cart_manager.clear_cart(hybrid.sid,order_id=OID)
    send(hybrid,c('PREPARE_ORDER_CHANGE',target={'kind':'focus'},action='CANCEL'))
    result=send(hybrid,c('DISCARD_ORDER_CHANGE'),text='thôi không huỷ nữa')
    assert not result['error'] and not any(call[4] for call in service[1])
    assert not cart_manager.get_checkout_prefs(hybrid.sid).get('order_management_action')


@pytest.mark.parametrize('method',['THANH_TOAN_KHI_NHAN_HANG','VI_DIEN_TU','VNPAY','NGAN_HANG_QR'])
@pytest.mark.parametrize('status',['MOI_TAO','DA_XAC_NHAN'])
def test_cancellation_payment_policy_matches_owned_backend(hybrid,service,method,status):
    order,calls=service
    order.update(phuong_thuc_thanh_toan=method,trang_thai_don_hang=status)
    order['trang_thai_thanh_toan']='CHO_THANH_TOAN_KHI_NHAN_HANG' if method=='THANH_TOAN_KHI_NHAN_HANG' else 'DA_THANH_TOAN'
    cart_manager.clear_cart(hybrid.sid,order_id=OID)
    result=send(hybrid,c('PREPARE_ORDER_CHANGE',target={'kind':'last_created'},action='CANCEL'))
    assert not result['error'] and not any(call[4] for call in calls)
    assert ('hoàn vào Ví Avengers' in result['reply']) == (method!='THANH_TOAN_KHI_NHAN_HANG')


def test_displayed_history_requires_precise_choice_even_when_last_created_exists(hybrid,service):
    cart_manager.clear_cart(hybrid.sid,order_id=OID)
    visible(hybrid,orders=[{'order_id':OID},{'order_id':OTHER}])
    result=send(hybrid,c('PREPARE_ORDER_CHANGE',target={'kind':'focus'},action='CANCEL'))
    assert result['error']=='unknown_reference' and not service[1]


def test_last_created_survives_starting_another_cart(hybrid,service):
    cart_manager.clear_cart(hybrid.sid,order_id=OID)
    cart_manager.set_checkout_context(hybrid.sid,completed_order_id=None)
    cart_manager.replace_items_from_order_cart(hybrid.sid,[dict(hybrid.products[0],quantity=1,unit_price=30000)])
    result=send(hybrid,c('READ_ORDER',target={'kind':'last_created'}))
    assert not result['error'] and service[1][-1][1].endswith(OID)


def test_explicit_summary_clears_obsolete_payment_cards(journey):
    rt=journey; ready_at_store(rt)
    result=send(rt,c('SET_PAYMENT',target={'kind':'name','value':'COD'}),c('PREPARE_CHECKOUT'))
    assert result['checkout_payload'] and not result['ui_payload']['payment_options']
