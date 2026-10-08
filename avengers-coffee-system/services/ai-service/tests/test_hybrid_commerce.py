"""Production Hybrid entry point with scripted meaning and guarded fake services."""
from copy import deepcopy
from dataclasses import FrozenInstanceError
import json
import time
import pytest
from hybrid_support import runtime, hybrid, command as c, send, visible, pending, no_cart
from test_llm_tool_orchestrator import fresh_action
from test_order_management_and_sales import service, OID
from src.agents import agent_memory, order_management
from src.agents.agent_context import build_context
from src.agents.agent_memory import ConversationMemory, empty_memory
from src.agents.hybrid_workflow import TurnContext, ground, next_required_milestone
from src.agents.tool_policy import MutationOutcomeUnknown
from src.common import cart_manager
from src.function_calling.tools import TOOL_EXECUTORS, product_tools, cart_tools, branch_tools


@pytest.mark.parametrize('query,count,scope', [('', 3, 'all'), ('Cà Phê', 2, 'drink'), ('Cake', 1, 'food')])
def test_discover_generic_family_scope(hybrid, query, count, scope):
    result = send(hybrid, c('DISCOVER_PRODUCTS', scope=scope, query=query, count=count))
    assert not result['error'] and len(result['ui_payload']['products']) == count and not hybrid.writes
    assert hybrid.reads[-1][1]['sort_by'] == 'menu'


def test_recommend_preferences_keep_all_concepts_no_category_diversion(hybrid):
    result = send(hybrid, c('RECOMMEND_PRODUCTS', scope='drink', concepts=['ngọt nhẹ', 'ấm'], family='Cà Phê', count=2),
                  text='hello hôm nay trời lạnh quá tôi muốn mua nước nào có vị ngọt nhẹ nhé')
    assert not result['error'] and not hybrid.writes and len(result['ui_payload']['products']) == 2
    args = result['tool_calls_log'][0]['args']
    assert args['criteria'] == 'preferences' and args['preference_concepts'] == ['ngọt nhẹ', 'ấm']
    assert args['search_text'].casefold() == 'Cà Phê'.casefold()


@pytest.mark.parametrize('references,ids', [
    ([{'kind': 'ordinal', 'index': 1}], ['101']),
    ([{'kind': 'ordinal', 'index': 1}, {'kind': 'ordinal', 'index': 3}], ['101', '103']),
    ([{'kind': 'name', 'value': 'Cà Phê Beta'}], ['102']),
    ([{'kind': 'focus'}], ['101']),
])
def test_explicit_product_references_stage_exact_ids(hybrid, references, ids):
    no_cart(hybrid)
    result = send(hybrid, c('SELECT_PRODUCTS', mode='EXPLICIT', references=references))
    assert not result['error'] and [r['product_id'] for r in pending(hybrid)] == ids
    assert not hybrid.writes and 'Size' in result['reply']


@pytest.mark.parametrize('count', [2, 5, 16])
def test_all_visible_uses_exact_frozen_entry_and_one_inference(hybrid, count):
    no_cart(hybrid)
    hybrid.products[:] = [{**hybrid.products[0], 'product_id': str(101+i), 'product_name': f'Product {i}'} for i in range(count)]
    visible(hybrid, products=hybrid.products)
    result = send(hybrid, c('SELECT_PRODUCTS', mode='ALL_VISIBLE'), text='cho tôi cả 2 món đi bạn' if count == 2 else 'cho tôi tất cả')
    assert not result['error'] and [r['product_id'] for r in pending(hybrid)] == [str(101+i) for i in range(count)]
    assert len(hybrid.provider.requests) == 1 and not hybrid.writes and not hybrid.reads


def test_product_snapshot_deeply_frozen_before_later_discovery(hybrid):
    context, _ = build_context(hybrid.sid, ConversationMemory(hybrid.redis).load(hybrid.sid))
    turn = TurnContext.capture(context)
    context['visible']['products'][0]['product_id'] = 'forged'
    mutable = turn.rows('products'); mutable[0]['product_id'] = 'forged'
    assert ground(turn, 'products', {'kind': 'ordinal', 'index': 1})['product_id'] == '101'
    with pytest.raises(FrozenInstanceError):
        turn.fingerprint = 'forged'
    result = send(hybrid, c('DISCOVER_PRODUCTS', scope='food', count=1),
                  c('SELECT_PRODUCTS', mode='EXPLICIT', references=[{'kind': 'ordinal', 'index': 1}]))
    assert not result['error'] and pending(hybrid)[0]['product_id'] == '101'


def test_preflight_all_refs_before_any_write(hybrid):
    result = send(hybrid, c('EDIT_CART', changes=[{'action': 'REMOVE', 'target': {'kind': 'ordinal', 'index': 1}}]),
                  c('SELECT_BRANCH', target={'kind': 'ordinal', 'index': 999}))
    assert result['failure_class'] == 'REFERENCE_GROUNDING' and not hybrid.writes
    assert len(cart_manager.get_cart(hybrid.sid)['items']) == 2


def test_same_turn_discovery_cannot_create_a_selection_ordinal(hybrid):
    visible(hybrid, products=[])
    cart_manager.set_checkout_context(hybrid.sid, last_product_suggestions=None)
    result = send(hybrid, c('DISCOVER_PRODUCTS', scope='all'), c('SELECT_PRODUCTS', mode='ALL_VISIBLE'))
    assert result['error'] == 'visible_selection_required' and not pending(hybrid) and not hybrid.writes
    assert not hybrid.reads  # Preflight rejects before executing the discovery.


@pytest.mark.parametrize('references,error', [
    ([{'kind': 'ordinal', 'index': 1}, {'kind': 'ordinal', 'index': 1}], 'duplicate_selection'),
    ([{'kind': 'id', 'value': '101'}], 'unknown_reference'),
    ([{'kind': 'name', 'value': 'Almost Cà Phê Alpha'}], 'unknown_reference'),
    ([{'kind': 'ordinal', 'index': 99}], 'unknown_reference')])
def test_unsafe_selection_never_mutates(hybrid, references, error):
    result = send(hybrid, c('SELECT_PRODUCTS', mode='EXPLICIT', references=references))
    assert result['error'] == error and not hybrid.writes and not pending(hybrid)


def test_literal_product_id_is_allowed_only_when_visible_and_supplied(hybrid):
    result = send(hybrid, c('SELECT_PRODUCTS', mode='EXPLICIT', references=[{'kind': 'id', 'value': '101'}]), text='chọn mã 101')
    assert not result['error'] and pending(hybrid)[0]['product_id'] == '101'


def test_two_pending_configure_independently_stable_indexes(hybrid):
    no_cart(hybrid)
    visible(hybrid, products=hybrid.products[:2])
    send(hybrid, c('SELECT_PRODUCTS', mode='ALL_VISIBLE'))
    bad = send(hybrid, c('CONFIGURE_PRODUCT', options={'size': 'L'}))
    assert bad['error'] == 'ambiguous_reference' and not hybrid.writes
    first = send(hybrid, c('CONFIGURE_PRODUCT', target={'kind': 'pending_ordinal', 'index': 1}, options={'size': 'L', 'toppings': ['Foam']}))
    assert not first['error'] and [r['selection_index'] for r in pending(hybrid)] == [2]
    second = send(hybrid, c('CONFIGURE_PRODUCT', target={'kind': 'pending_ordinal', 'index': 2}, options={'size': 'M'}))
    assert not second['error'] and not pending(hybrid)
    assert [w[1]['product_id'] for w in hybrid.writes] == ['101', '102']
    assert hybrid.writes[1][1]['toppings'] == [] and hybrid.writes[0][1]['unit_price'] == 42000


def test_large_toppings_low_ice_sugar_configure_pending_not_menu(hybrid, monkeypatch):
    no_cart(hybrid)
    original = product_tools.execute_get_product_options
    def opts(**kw):
        result = original(**kw)
        result['option_groups'] += [{'name': 'Lượng đá', 'values': ['Ít đá', 'Bình thường'], 'required': True},
                                   {'name': 'Độ ngọt', 'values': ['Ít ngọt', 'Bình thường'], 'required': True}]
        return result
    monkeypatch.setattr(product_tools, 'execute_get_product_options', opts)
    send(hybrid, c('SELECT_PRODUCTS', mode='EXPLICIT', references=[{'kind': 'focus'}]))
    result = send(hybrid, c('CONFIGURE_PRODUCT', options={'size': 'L', 'toppings': ['Pearl', 'Foam'], 'ice': 'Ít đá', 'sweetness': 'Ít ngọt'}),
                  text='size lớn, topping hạt sen và vải, ít đá ít ngọt')
    assert not result['error'] and len(hybrid.writes) == 1 and not pending(hybrid)
    args = hybrid.writes[0][1]
    assert args['luong_da'] == 'Ít đá' and args['do_ngot'] == 'Ít ngọt' and args['toppings'] == ['Pearl', 'Foam']
    assert not any(log['tool'] == 'get_menu_categories' for log in result['tool_calls_log'])


def test_missing_required_menu_option_remains_pending(hybrid):
    send(hybrid, c('SELECT_PRODUCTS', mode='EXPLICIT', references=[{'kind': 'focus'}]))
    result = send(hybrid, c('CONFIGURE_PRODUCT', options={'toppings': ['Foam']}))
    assert not hybrid.writes and pending(hybrid)[0]['toppings'] == ['Foam']
    assert pending(hybrid)[0]['missing_fields'] == ['size'] and 'Size' in result['reply']


def test_explicit_menu_defaults_and_reset_clear_old_toppings(hybrid, monkeypatch):
    original = product_tools.execute_get_product_options
    def opts(**kw):
        result = original(**kw); result['option_groups'][0]['default'] = 'M'; return result
    monkeypatch.setattr(product_tools, 'execute_get_product_options', opts)
    send(hybrid, c('SELECT_PRODUCTS', mode='EXPLICIT', references=[{'kind': 'focus'}]))
    cart_manager.set_pending_products(hybrid.sid, [{**pending(hybrid)[0], 'toppings': ['Foam']}])
    result = send(hybrid, c('CONFIGURE_PRODUCT', use_defaults=True, reset_options=True))
    assert not result['error'] and hybrid.writes[-1][1]['size'] == 'M' and hybrid.writes[-1][1]['toppings'] == []


def test_select_then_configure_unique_explicit_order_allowed(hybrid):
    result = send(hybrid, c('SELECT_PRODUCTS', mode='EXPLICIT', references=[{'kind': 'ordinal', 'index': 2}]),
                  c('CONFIGURE_PRODUCT', options={'size': 'M'}))
    assert not result['error'] and hybrid.writes[-1][1]['product_id'] == '102'


def test_discard_then_change_choice_keeps_other_pending(hybrid):
    visible(hybrid, products=hybrid.products[:2]); send(hybrid, c('SELECT_PRODUCTS', mode='ALL_VISIBLE'))
    result = send(hybrid, c('DISCARD_PENDING_PRODUCT', target={'kind': 'pending_ordinal', 'index': 1}),
                  c('SELECT_PRODUCTS', mode='EXPLICIT', references=[{'kind': 'ordinal', 'index': 3}]))
    assert result['error'] == 'unknown_reference' and len(pending(hybrid)) == 2
    result = send(hybrid, c('DISCARD_PENDING_PRODUCT', target={'kind': 'pending_ordinal', 'index': 1}))
    assert not result['error'] and [r['product_id'] for r in pending(hybrid)] == ['102']


def test_compound_cart_original_2_removed_original_3_updated(hybrid):
    cart_manager.replace_items_from_order_cart(hybrid.sid, [dict(id=800+i, **p, quantity=1, size='M', unit_price=p['final_price']) for i,p in enumerate(hybrid.products)])
    result = send(hybrid, c('EDIT_CART', changes=[
        {'action': 'REMOVE', 'target': {'kind': 'ordinal', 'index': 2}},
        {'action': 'SET_QUANTITY', 'target': {'kind': 'ordinal', 'index': 3}, 'quantity': 3}]), text='bỏ món số 2, món số 3 tăng lên 3')
    assert not result['error'] and [(w[0], w[1]) for w in hybrid.writes] == [('remove','801'), ('update','802')]
    assert [(str(r['cart_item_id']), r['quantity']) for r in cart_manager.get_cart(hybrid.sid)['items']] == [('800',1), ('802',3)]


@pytest.mark.parametrize('changes', [
    [{'action':'REMOVE','target':{'kind':'ordinal','index':1}}, {'action':'SET_QUANTITY','target':{'kind':'ordinal','index':99},'quantity':3}],
    [{'action':'REMOVE','target':{'kind':'ordinal','index':1}}, {'action':'SET_QUANTITY','target':{'kind':'ordinal','index':1},'quantity':3}],
])
def test_cart_invalid_or_conflicting_targets_preflight_zero_writes(hybrid, changes):
    result = send(hybrid, c('EDIT_CART', changes=changes))
    assert result['error'] and not hybrid.writes and len(cart_manager.get_cart(hybrid.sid)['items']) == 2


def test_cart_configuration_uses_own_menu_not_other_product(hybrid):
    result = send(hybrid, c('EDIT_CART', changes=[{'action':'CONFIGURE','target':{'kind':'ordinal','index':2},'options':{'size':'L','toppings':['Foam']}}]))
    assert not result['error'] and hybrid.writes[0][1] == '801'
    assert hybrid.writes[0][2] == {'size':'L','toppings':['Foam']}


def test_read_cart_does_not_finish_pending_or_checkout(hybrid):
    send(hybrid, c('SELECT_PRODUCTS', mode='ALL_VISIBLE'))
    before = deepcopy(pending(hybrid))
    result = send(hybrid, c('READ_CART'))
    assert not result['error'] and pending(hybrid) == before and not hybrid.writes
    assert not cart_manager.get_checkout_prefs(hybrid.sid).get('voucher_decided')


def test_finish_cart_voucher_gate_is_server_prerequisite(hybrid):
    result = send(hybrid, c('FINISH_CART'))
    prefs = cart_manager.get_checkout_prefs(hybrid.sid)
    assert not result['error'] and prefs['voucher_offer_pending'] and not prefs.get('voucher_decided')
    assert len(result['ui_payload']['vouchers']) == 2 and len(hybrid.provider.requests) == 1
    assert next_required_milestone(build_context(hybrid.sid, empty_memory())[0]['business']) == 'VOUCHER_DECISION'


@pytest.mark.parametrize('choice,code', [({'target':{'kind':'ordinal','index':1}},'SMALL'), ({'best':True},'BEST'),
                                      ({'target':{'kind':'name','value':'BEST'}},'BEST')])
def test_voucher_selection_best_uses_authoritative_saving(hybrid, choice, code):
    send(hybrid, c('FINISH_CART')); result = send(hybrid, c('CHOOSE_VOUCHER', **choice))
    assert not result['error'] and hybrid.writes[-1] == ('voucher',code)
    assert cart_manager.get_checkout_prefs(hybrid.sid)['voucher_decided']


def test_skip_and_remove_voucher_are_explicit(hybrid):
    send(hybrid, c('FINISH_CART')); result = send(hybrid, c('SKIP_VOUCHER'))
    assert not result['error'] and cart_manager.get_checkout_prefs(hybrid.sid)['voucher_decided']
    send(hybrid, c('CHOOSE_VOUCHER', best=True)); send(hybrid, c('REMOVE_VOUCHER'))
    assert not cart_manager.get_checkout_prefs(hybrid.sid).get('voucher_code')


@pytest.mark.parametrize('mode,canonical', [('delivery','GIAO_TAN_NOI'), ('pickup','MANG_DI'), ('dine_in','TAI_CHO')])
def test_fulfillment_never_infers_payment_or_saved_address(hybrid, mode, canonical):
    result = send(hybrid, c('SET_FULFILLMENT', mode=mode))
    prefs = cart_manager.get_checkout_prefs(hybrid.sid)
    assert not result['error'] and prefs['delivery_type'] == canonical and not prefs.get('payment_method')
    assert not prefs.get('address_confirmed') and not prefs.get('delivery_address')


@pytest.mark.parametrize('method,code', [('QR','NGAN_HANG_QR'), ('COD','THANH_TOAN_KHI_NHAN_HANG'), ('Ví','VI_DIEN_TU')])
def test_payment_reads_availability_then_sets_only_payment(hybrid, method, code):
    result = send(hybrid, c('SET_PAYMENT', target={'kind':'name','value':method}))
    assert not result['error'] and cart_manager.get_checkout_prefs(hybrid.sid)['payment_method'] == code
    assert not cart_manager.get_checkout_prefs(hybrid.sid).get('delivery_type')
    assert [log['tool'] for log in result['tool_calls_log']][:2] == ['get_payment_options','set_payment_choice']


def test_unavailable_wallet_never_sets_choice(hybrid, monkeypatch):
    monkeypatch.setattr(cart_tools, 'get_wallet_payment_options', lambda *a: {'payment_options':[{'code':'VI_DIEN_TU','enabled':False,'reason':'Ví chưa đủ tiền'}]})
    result = send(hybrid, c('SET_PAYMENT', target={'kind':'name','value':'Ví'}))
    assert result['error'] == 'payment_not_available' and not cart_manager.get_checkout_prefs(hybrid.sid).get('payment_method')
    assert 'Ví chưa đủ tiền' in result['reply']


def test_payment_ordinal_requires_prior_display(hybrid):
    bad = send(hybrid, c('LIST_PAYMENT_OPTIONS'), c('SET_PAYMENT', target={'kind':'ordinal','index':2}))
    assert bad['error'] == 'unknown_reference'
    send(hybrid, c('LIST_PAYMENT_OPTIONS'))
    result = send(hybrid, c('SET_PAYMENT', target={'kind':'ordinal','index':2}))
    assert not result['error'] and cart_manager.get_checkout_prefs(hybrid.sid)['payment_method'] == 'NGAN_HANG_QR'


def test_compound_fulfillment_payment_only_explicit_commands(hybrid):
    result = send(hybrid, c('SET_FULFILLMENT', mode='pickup'), c('SET_PAYMENT', target={'kind':'name','value':'QR'}))
    assert not result['error'] and cart_manager.get_checkout_prefs(hybrid.sid)['delivery_type'] == 'MANG_DI'
    assert cart_manager.get_checkout_prefs(hybrid.sid)['payment_method'] == 'NGAN_HANG_QR'


@pytest.mark.parametrize('defect', ['no_action','expired','stale_cart','pending_missing','same_turn'])
def test_checkout_confirmation_rejects_stale_or_missing_prior_summary(hybrid, monkeypatch, defect):
    fresh_action(hybrid)
    if defect == 'no_action': cart_manager.set_checkout_context(hybrid.sid, checkout_action_id=None)
    if defect == 'expired': cart_manager.set_checkout_context(hybrid.sid, checkout_action_expires_at=0)
    if defect == 'stale_cart': cart_manager.set_checkout_context(hybrid.sid, summary_fingerprint='stale')
    if defect == 'pending_missing': cart_manager.clear_pending_action(hybrid.sid)
    if defect == 'same_turn': cart_manager.set_checkout_context(hybrid.sid, hybrid_summary_turn_id='current')
    monkeypatch.setattr(cart_tools, 'execute_confirm_checkout', lambda *a, **k: pytest.fail('unsafe order create'))
    result = send(hybrid, c('CONFIRM_CHECKOUT'), client_message_id='current')
    assert result['error'] == 'confirmation_required' and not hybrid.writes


def test_later_checkout_confirm_and_duplicate_replay_once(hybrid, monkeypatch):
    fresh_action(hybrid); orders=[]
    def confirm(s, **kw):
        orders.append(kw); cart_manager.clear_cart(s, order_id='created'); return {'status':'ok','order_id':'created','message':'Đã đặt đơn'}
    monkeypatch.setattr(cart_tools, 'execute_confirm_checkout', confirm)
    result = send(hybrid, c('CONFIRM_CHECKOUT'), client_message_id='same')
    replay = hybrid.turn('Scripted customer meaning', client_message_id='same')
    assert result == replay and orders == [{'action_id':'synthetic-action'}]
    assert len(hybrid.provider.requests) == 1 and not ConversationMemory(hybrid.redis).load(hybrid.sid)['focus']


def test_missing_checkout_fields_prompt_never_prepare_or_create(hybrid, monkeypatch):
    monkeypatch.setattr(cart_tools, 'execute_request_checkout', lambda *a, **k: pytest.fail('Missing fields reached summary'))
    result = send(hybrid, c('PREPARE_CHECKOUT'))
    assert result['error'] == 'need_voucher_decision' and not result['checkout_payload'] and not hybrid.writes


def test_payment_change_invalidates_summary(hybrid):
    fresh_action(hybrid)
    result = send(hybrid, c('SET_PAYMENT', target={'kind':'name','value':'COD'}))
    assert not result['error'] and not cart_manager.get_checkout_prefs(hybrid.sid).get('checkout_action_id')


@pytest.mark.parametrize('defect', ['unauthenticated','unverified','missing_turn'])
def test_mutations_require_auth_authoritative_cart_turn(hybrid, monkeypatch, defect):
    send(hybrid, c('SELECT_PRODUCTS', mode='EXPLICIT', references=[{'kind':'focus'}]))
    if defect == 'unauthenticated': monkeypatch.setattr(cart_tools,'is_authenticated_cart_session',lambda s:False)
    if defect == 'unverified': monkeypatch.setattr(cart_tools,'sync_authoritative_cart',lambda s:{**cart_manager.get_cart(s),'authoritative':False})
    result = send(hybrid, c('CONFIGURE_PRODUCT', options={'size':'M'}), **({'client_message_id':None} if defect == 'missing_turn' else {}))
    assert result['error'] and not hybrid.writes


def test_unknown_write_propagates_to_http_reconciliation(hybrid, monkeypatch):
    calls=[]
    def unknown(*a, **k): calls.append(1); raise TypeError('Lost acknowledgement after possible commit')
    monkeypatch.setattr(cart_tools,'execute_update_cart_item',unknown)
    with pytest.raises(MutationOutcomeUnknown):
        send(hybrid,c('EDIT_CART',changes=[{'action':'SET_QUANTITY','target':{'kind':'ordinal','index':1},'quantity':3}]))
    assert calls == [1]


@pytest.mark.parametrize('selected,valid', [('101',True), ('999',False)])
def test_ui_fast_path_zero_inference_visible_only(hybrid, selected, valid):
    result = hybrid.turn('button', selected_product_id=selected)
    assert result['provider_request_count'] == 0 and not hybrid.provider.requests and not hybrid.writes
    assert bool(result['error']) != valid
    assert bool(pending(hybrid)) == valid


def test_redis_unavailable_retains_canonical_durable_fallback(hybrid, monkeypatch):
    cart_manager.set_checkout_context(hybrid.sid,last_product_suggestions=hybrid.products)
    monkeypatch.setattr(agent_memory,'redis_client',lambda: (_ for _ in ()).throw(ConnectionError('offline Redis')))
    result = send(hybrid,c('SELECT_PRODUCTS',mode='ALL_VISIBLE'))
    assert not result['error'] and len(pending(hybrid)) == 3 and len(hybrid.provider.requests) == 1


def test_order_detail_preview_read_interruption_then_later_confirm(hybrid, service):
    order,calls=service
    visible(hybrid, orders=[{'order_id':OID}])
    assert not send(hybrid,c('READ_ORDER',target={'kind':'ordinal','index':1}))['error']
    assert not send(hybrid,c('PREPARE_ORDER_CHANGE',target={'kind':'ordinal','index':1},action='CANCEL'))['error']
    preview=deepcopy(cart_manager.get_checkout_prefs(hybrid.sid)['order_management_action'])
    assert not any(call[4] for call in calls)
    send(hybrid,c('READ_ORDER',target={'kind':'ordinal','index':1}))
    assert cart_manager.get_checkout_prefs(hybrid.sid)['order_management_action'] == preview
    result=send(hybrid,c('CONFIRM_ORDER_CHANGE'))
    assert not result['error'] and sum(call[4] for call in calls) == 1


def test_order_update_line_ordinals_owned_details_no_cart_drift(hybrid, service):
    order,calls=service; visible(hybrid, orders=[{'order_id':OID}])
    result=send(hybrid,c('PREPARE_ORDER_CHANGE',target={'kind':'ordinal','index':1},action='UPDATE',
        changes=[{'action':'SET_QUANTITY','target':{'kind':'ordinal','index':1},'quantity':3}]))
    assert not result['error']
    preview=next(call[2] for call in calls if call[2] and call[2].get('preview_only'))
    assert preview['items'][0]['id'] == 21 and preview['items'][0]['so_luong'] == 3
    assert preview['items'][1]['toppings'] == ['Xốt Caramel','Kem Phô Mai Macchiato']
    assert not any(call[4] for call in calls)


def test_order_history_owned_selection_and_unknown_id_rejected(hybrid, service, monkeypatch):
    monkeypatch.setitem(TOOL_EXECUTORS,'get_order_history',lambda a,s:{'status':'ok','orders':[{'ma_don_hang':OID,'trang_thai_don_hang':'MOI_TAO'}]})
    result=send(hybrid,c('LIST_ORDERS'))
    assert not result['error'] and ConversationMemory(hybrid.redis).load(hybrid.sid)['visible_snapshots']['orders'][0]['order_id'] == OID
    result=send(hybrid,c('READ_ORDER',target={'kind':'id','value':OID}))
    assert result['error'] == 'unknown_reference'


def test_exact_live_coffee_milk_family_purchase_is_discovery_not_menu_category(hybrid):
    hybrid.products[0]['product_name'] = 'Cà Phê Sữa Đá'
    hybrid.products[1]['product_name'] = 'Cà Phê Sữa Nóng'
    result=send(hybrid,c('DISCOVER_PRODUCTS',scope='drink',query='cà phê sữa'),text='à thôi cho tôi mua cà phê sữa đi')
    assert not result['error'] and len(result['ui_payload']['products']) == 2 and not hybrid.writes
    assert [r['tool'] for r in result['tool_calls_log']] == ['filter_catalog']


def test_multiple_configure_commands_bind_distinct_pending_before_writes(hybrid):
    visible(hybrid,products=hybrid.products[:2]); send(hybrid,c('SELECT_PRODUCTS',mode='ALL_VISIBLE'))
    first=c('CONFIGURE_PRODUCT',target={'kind':'pending_ordinal','index':1},options={'size':'M'})
    duplicate=send(hybrid,first,first)
    assert duplicate['error'] == 'conflicting_product_configuration' and not hybrid.writes
    result=send(hybrid,first,c('CONFIGURE_PRODUCT',target={'kind':'pending_ordinal','index':2},options={'size':'L'}))
    assert not result['error'] and [w[1]['product_id'] for w in hybrid.writes] == ['101','102']


def test_client_message_id_conflict_never_reinterprets(hybrid):
    result=send(hybrid,c('EDIT_CART',changes=[{'action':'SET_QUANTITY','target':{'kind':'ordinal','index':1},'quantity':3}]),client_message_id='bound')
    assert not result['error']
    result=hybrid.turn('Different customer message',client_message_id='bound')
    assert result['error'] == 'client_message_id_conflict' and len(hybrid.provider.requests) == 1 and len(hybrid.writes) == 1


def test_displayed_branch_review_comparison_no_expansion_or_mutation(hybrid, monkeypatch):
    from src.function_calling.tools import branch_review_tools
    visible(hybrid,branches=[{'branch_id':'B1','branch_name':'Một'},{'branch_id':'B2','branch_name':'Hai'}])
    seen=[]
    def compare(rows):
        seen.extend(rows)
        return {'status':'ok','message':'Hai chi nhánh có dữ liệu đánh giá để tham khảo.'}
    monkeypatch.setattr(branch_review_tools,'execute_compare_branch_reviews',compare)
    result=send(hybrid,c('COMPARE_BRANCH_REVIEWS',targets=[{'kind':'ordinal','index':2}]))
    assert not result['error'] and seen == ['B2'] and not hybrid.writes


@pytest.mark.parametrize('facet', ['price','stock','options','reviews'])
def test_product_question_uses_correct_authority_and_never_selects(hybrid, facet):
    result=send(hybrid,c('READ_PRODUCT_INFO',target={'kind':'focus'},facet=facet))
    assert not result['error'] and not hybrid.writes and not pending(hybrid)
    expected={'price':'check_price_and_stock','stock':'check_price_and_stock','options':'get_product_options','reviews':'get_product_insights'}[facet]
    assert result['tool_calls_log'][0]['tool'] == expected


def test_cart_business_failure_retains_prior_success_and_stops_remaining(hybrid, monkeypatch):
    def unavailable(*a,**k): return {'status':'stock_conflict','message':'Dòng còn lại hết hàng.'}
    monkeypatch.setattr(cart_tools,'execute_update_cart_item',unavailable)
    result=send(hybrid,c('EDIT_CART',changes=[{'action':'REMOVE','target':{'kind':'ordinal','index':1}},
        {'action':'SET_QUANTITY','target':{'kind':'ordinal','index':2},'quantity':3}]))
    assert result['error'] == 'stock_conflict' and len(hybrid.writes) == 1
    assert len(cart_manager.get_cart(hybrid.sid)['items']) == 1 and 'hết hàng' in result['reply']
    assert 'một phần' in result['reply'] and 'Giỏ' in result['reply']
