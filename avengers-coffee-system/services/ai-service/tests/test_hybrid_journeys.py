"""Offline end-to-end and long conversation qualification, no semantic tools."""
from copy import deepcopy
import json
import pytest
from hybrid_support import runtime, hybrid, send, command as c, no_cart, pending, visible
from test_llm_tool_orchestrator import fresh_action
from test_order_management_and_sales import service, OID
from src.agents.agent_memory import ConversationMemory
from src.agents.tool_artifacts import candidate_id
from src.common import cart_manager
from src.function_calling.tools import branch_tools, cart_tools, product_tools, TOOL_EXECUTORS

ADDRESS = '42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Thành phố Hồ Chí Minh'
OTHER_ADDRESS = '71 Đường D9, Phường Sơn Kỳ, Thành phố Hồ Chí Minh'


@pytest.fixture
def journey(hybrid, monkeypatch):
    no_cart(hybrid)
    visible(hybrid, products=hybrid.products[:2])
    candidates = [{'provider_ref_id':f'offline-place-{i}', 'display_address':a, 'normalized_label':a,
                   'lat':10.8+i/100, 'lng':106.6+i/100, 'provider':'offline'}
                  for i,a in enumerate((ADDRESS,OTHER_ADDRESS))]
    candidates = [{**r,'candidate_id':candidate_id(r)} for r in candidates]
    branches = [{'branch_id':'B1','branch_name':'Quán Một','availability_status':'available'},
                {'branch_id':'B2','branch_name':'Quán Hai','availability_status':'available'}]
    geo_reads, summaries, orders = [], [], []
    def nearest(**kw):
        geo_reads.append(deepcopy(kw))
        if kw.get('resolved_location'):
            return {'status':'ok','branches':deepcopy(branches),'resolved_location':kw['resolved_location']}
        return {'status':'ambiguous','location_candidates':deepcopy(candidates)}
    monkeypatch.setattr(branch_tools,'execute_find_nearest_branch',nearest)
    def set_branch(s,bid,name,**kw):
        cart_manager.set_branch(s,bid,name); return {'status':'ok','branch_id':bid,'branch_name':name}
    monkeypatch.setattr(branch_tools,'execute_set_session_branch',set_branch)
    from src.common import inventory_validation
    from src.function_calling import helpers
    monkeypatch.setattr(helpers,'_get_engine',lambda:object())
    monkeypatch.setattr(inventory_validation,'validate_cart_at_branch',lambda *a,**k:{'available':[], 'unavailable':[], 'unverified':[]})
    monkeypatch.setattr(branch_tools,'branch_identity_available',lambda *a:True)
    def prepare(s,reuse_summary=False):
        prefs=cart_manager.get_checkout_prefs(s)
        cart=cart_manager.get_cart(s)
        assert cart['items'] and prefs['voucher_decided'] and prefs.get('payment_method')
        assert prefs.get('delivery_type') and cart.get('branch_id')
        assert prefs['delivery_type'] != 'GIAO_TAN_NOI' or prefs['address_confirmed']
        summaries.append(deepcopy(prefs))
        cart_manager.mark_checkout_summary(s,reuse_existing=reuse_summary)
        cart_manager.set_pending_action(s,'confirm_checkout',{})
        summary={'items':deepcopy(cart['items']),'subtotal':sum(r['unit_price']*r['quantity'] for r in cart['items']),
            'final_total':70000,'delivery_fee':15000, 'branch_id':cart['branch_id'],
            **{k:prefs.get(k) for k in ('delivery_type','payment_method','delivery_address','voucher_code')}}
        return {'status':'require_confirmation','order_summary':summary}
    monkeypatch.setattr(cart_tools,'execute_request_checkout',prepare)
    def confirm(s,**kw):
        orders.append(kw); cart_manager.clear_cart(s,order_id=OID)
        return {'status':'ok','order_id':OID,'message':'Đơn hàng đã được tạo.'}
    monkeypatch.setattr(cart_tools,'execute_confirm_checkout',confirm)
    hybrid.geo_reads,hybrid.summaries,hybrid.orders,hybrid.candidates,hybrid.branches=geo_reads,summaries,orders,candidates,branches
    return hybrid


def configure_two(rt):
    assert not send(rt,c('SELECT_PRODUCTS',mode='ALL_VISIBLE'))['error']
    assert not send(rt,c('CONFIGURE_PRODUCT',target={'kind':'pending_ordinal','index':1},options={'size':'L','toppings':['Foam']}))['error']
    assert not send(rt,c('CONFIGURE_PRODUCT',target={'kind':'pending_ordinal','index':2},options={'size':'M'}))['error']


def deliver(rt):
    assert not send(rt,c('SET_FULFILLMENT',mode='delivery'))['error']
    assert not cart_manager.get_checkout_prefs(rt.sid).get('payment_method')
    assert not send(rt,c('PROVIDE_LOCATION',value=ADDRESS,kind='address'))['error']
    assert not cart_manager.get_checkout_prefs(rt.sid).get('address_confirmed')
    assert not send(rt,c('SELECT_LOCATION_CANDIDATE',target={'kind':'ordinal','index':2}))['error']
    prefs=cart_manager.get_checkout_prefs(rt.sid)
    assert prefs['delivery_address'] == OTHER_ADDRESS
    assert prefs['confirmed_destination']['candidate_id'] == rt.candidates[1]['candidate_id']
    assert rt.geo_reads[-1]['resolved_location']['lat'] == rt.candidates[1]['lat']


def test_complete_hybrid_journey_exact_failure_regressions_checkout_replay(journey, service):
    rt=journey
    recommend=send(rt,c('RECOMMEND_PRODUCTS',scope='drink',concepts=['ngọt nhẹ'],count=2),text='trời lạnh quá tôi muốn nước ngọt nhẹ')
    assert not recommend['error'] and not rt.writes
    configure_two(rt)
    send(rt,c('EDIT_CART',changes=[{'action':'SET_QUANTITY','target':{'kind':'ordinal','index':2},'quantity':3}]))
    assert not send(rt,c('FINISH_CART'))['error']
    assert not send(rt,c('CHOOSE_VOUCHER',best=True))['error']
    deliver(rt)
    assert not send(rt,c('SET_PAYMENT',target={'kind':'name','value':'QR'}))['error']
    summary=send(rt,c('PREPARE_CHECKOUT'))
    assert not summary['error'] and summary['checkout_payload'] and not rt.orders
    action=cart_manager.get_checkout_prefs(rt.sid)['checkout_action_id']
    send(rt,c('SET_PAYMENT',target={'kind':'name','value':'COD'}))
    assert not cart_manager.get_checkout_prefs(rt.sid).get('checkout_action_id') and not rt.orders
    send(rt,c('PREPARE_CHECKOUT'))
    assert cart_manager.get_checkout_prefs(rt.sid)['checkout_action_id'] != action and not rt.orders
    result=send(rt,c('CONFIRM_CHECKOUT'),client_message_id='confirm-final')
    assert not result['error'] and len(rt.orders) == 1
    assert rt.turn('Scripted customer meaning',client_message_id='confirm-final') == result
    visible(rt,orders=[{'order_id':OID}])
    assert not send(rt,c('READ_ORDER',target={'kind':'ordinal','index':1}))['error']
    assert not send(rt,c('PREPARE_ORDER_CHANGE',target={'kind':'ordinal','index':1},action='CANCEL'))['error']
    assert not send(rt,c('CONFIRM_ORDER_CHANGE'))['error']
    assert sum(call[4] for call in service[1]) == 1
    assert all('tools' not in r for r in rt.provider.requests)


def test_long_25_turn_context_stability_with_read_interruptions(journey, monkeypatch):
    rt=journey
    # Approved extractive policy evidence; no knowledge answer inference.
    from src.function_calling.tools import knowledge_tools
    monkeypatch.setattr(knowledge_tools,'execute_search_knowledge_base',lambda **kw:{'status':'ok','results':[], 'message':'Quán hỗ trợ tư vấn tại cửa hàng.'})
    original=product_tools.execute_get_product_options
    def menu(**kw):
        result=original(**kw); result['option_groups'][0]['default']='M'; return result
    monkeypatch.setattr(product_tools,'execute_get_product_options',menu)
    sequence=[
        c('RECOMMEND_PRODUCTS',scope='drink',concepts=['ngọt nhẹ'],count=2),
        c('SELECT_PRODUCTS',mode='ALL_VISIBLE'),
        c('READ_PRODUCT_INFO',target={'kind':'focus'},facet='description'),
        c('CONFIGURE_PRODUCT',target={'kind':'pending_ordinal','index':1},options={'size':'L'}),
        c('READ_CART'), c('READ_STORE_INFO',facet='policy'),
        c('CONFIGURE_PRODUCT',target={'kind':'pending_ordinal','index':2},use_defaults=True),
        c('FINISH_CART'), c('LIST_VOUCHERS'), c('CHOOSE_VOUCHER',best=True),
        c('SET_FULFILLMENT',mode='delivery'), c('READ_PRODUCT_INFO',target={'kind':'focus'},facet='reviews'),
        c('PROVIDE_LOCATION',value=ADDRESS,kind='address'), c('READ_STORE_INFO',facet='hours'),
        c('SELECT_LOCATION_CANDIDATE',target={'kind':'ordinal','index':2}),
        c('LIST_PAYMENT_OPTIONS'), c('SET_PAYMENT',target={'kind':'name','value':'QR'}),
        c('EDIT_CART',changes=[{'action':'SET_QUANTITY','target':{'kind':'ordinal','index':1},'quantity':2}]),
        c('FINISH_CART'), c('CHOOSE_VOUCHER',best=True), c('PREPARE_CHECKOUT'),
        c('READ_CART'), c('SET_PAYMENT',target={'kind':'name','value':'COD'}),
        c('PREPARE_CHECKOUT'), c('CONFIRM_CHECKOUT')]
    reads={'READ_PRODUCT_INFO','READ_CART','READ_STORE_INFO','LIST_VOUCHERS','LIST_PAYMENT_OPTIONS'}
    for index,command in enumerate(sequence):
        before=deepcopy(cart_manager.get_checkout_prefs(rt.sid))
        result=send(rt,command,text=f'Offline long turn {index}')
        assert not result['error'], (index,command,result)
        after=cart_manager.get_checkout_prefs(rt.sid)
        if command['intent'] in reads:
            for key in ('pending_products','checkout_action_id','delivery_address','confirmed_destination','payment_method'):
                assert after.get(key) == before.get(key), (index,key)
        memory=ConversationMemory(rt.redis).load(rt.sid)
        assert len(memory['recent_turns']) <= 8 and not memory['last_tool_summary']
        request=rt.provider.requests[-1]
        assert 'tool_calls' not in request['messages'][0]['content']
        assert result['provider_request_count'] == 1
    assert len(rt.provider.requests) == 25 and len(rt.orders) == 1 and len(rt.summaries) == 2


def test_saved_address_offer_requires_explicit_frozen_selection(journey, monkeypatch):
    rt=journey
    monkeypatch.setitem(TOOL_EXECUTORS,'get_user_profile',lambda a,s:{'status':'ok','default_address':ADDRESS,
        'address_items':[{'full_address':ADDRESS,'label':'Nhà'},{'full_address':OTHER_ADDRESS,'label':'Khác'}]})
    configure_two(rt); send(rt,c('FINISH_CART')); send(rt,c('SKIP_VOUCHER'))
    send(rt,c('SET_FULFILLMENT',mode='delivery'))
    prefs=cart_manager.get_checkout_prefs(rt.sid)
    assert prefs['profile_location_offer'] and not prefs.get('address_confirmed') and not rt.geo_reads
    send(rt,c('SELECT_PROFILE_ADDRESS',target={'kind':'ordinal','index':2}))
    assert rt.geo_reads[0]['location'] == OTHER_ADDRESS
    assert not cart_manager.get_checkout_prefs(rt.sid).get('address_confirmed')


@pytest.mark.parametrize('mode', ['pickup','dine_in'])
def test_pickup_dine_in_candidate_coordinates_then_explicit_branch(journey, mode):
    rt=journey; configure_two(rt); send(rt,c('FINISH_CART')); send(rt,c('SKIP_VOUCHER'))
    send(rt,c('SET_FULFILLMENT',mode=mode)); send(rt,c('PROVIDE_LOCATION',value='Phường Tây Thạnh',kind='area'))
    result=send(rt,c('SELECT_LOCATION_CANDIDATE',target={'kind':'ordinal','index':1}))
    assert not result['error'] and not cart_manager.get_cart(rt.sid).get('branch_id')
    assert rt.geo_reads[-1]['resolved_location']['candidate_id'] == rt.candidates[0]['candidate_id']
    result=send(rt,c('SELECT_BRANCH',target={'kind':'ordinal','index':2}))
    assert not result['error'] and cart_manager.get_cart(rt.sid)['branch_id'] == 'B2'
    assert not cart_manager.get_checkout_prefs(rt.sid).get('delivery_address')


def test_stale_candidate_cannot_drift_to_profile_address(journey):
    rt=journey; configure_two(rt); send(rt,c('SET_FULFILLMENT',mode='delivery'))
    send(rt,c('PROVIDE_LOCATION',value=ADDRESS,kind='address'))
    cart_manager.set_checkout_context(rt.sid,location_candidate_snapshot={'candidates':[rt.candidates[0]]},
        profile_location_offer={'address':OTHER_ADDRESS,'addresses':[{'full_address':OTHER_ADDRESS}]})
    result=send(rt,c('SELECT_LOCATION_CANDIDATE',target={'kind':'ordinal','index':2}))
    assert result['error'] and not cart_manager.get_checkout_prefs(rt.sid).get('address_confirmed')


def test_partial_address_does_not_geocode_or_select_saved(journey):
    rt=journey; configure_two(rt); send(rt,c('SET_FULFILLMENT',mode='delivery'))
    result=send(rt,c('PROVIDE_LOCATION',value='42 Nguyễn Hữu Tiến',kind='address'))
    assert not rt.geo_reads and not cart_manager.get_checkout_prefs(rt.sid).get('address_confirmed')
    assert 'bổ sung' in result['reply']


def test_order_reorder_preview_then_discard_preserves_cart(journey, service):
    rt=journey; visible(rt,orders=[{'order_id':OID}]); before=deepcopy(cart_manager.get_cart(rt.sid)['items'])
    result=send(rt,c('REORDER_ORDER',target={'kind':'ordinal','index':1}))
    assert not result['error'] and cart_manager.get_checkout_prefs(rt.sid)['order_management_action']['kind'] == 'reorder_order'
    send(rt,c('DISCARD_ORDER_CHANGE'))
    assert not cart_manager.get_checkout_prefs(rt.sid).get('order_management_action')
    assert cart_manager.get_cart(rt.sid)['items'] == before and not any(call[4] for call in service[1])


@pytest.mark.parametrize('facet', ['description','ingredient','allergen'])
def test_rag_authority_boundary_preserves_pending_product_and_checkout(hybrid, monkeypatch, facet):
    from src.function_calling.tools import knowledge_tools
    from src.rag import rag_service
    doc={'id':'hybrid-approved','title':'Cà Phê Alpha','content':'Cà phê có caffeine và sữa.',
         'source':'offline','domain':'product_description','entity_type':'product','entity_id':'101',
         'tags':['Cà Phê Alpha'],'authority':'knowledge','volatility':'slow'}
    monkeypatch.setattr(rag_service,'load_all_rag_data',lambda:[doc])
    service=rag_service.RAGService(); service.load(); monkeypatch.setattr(rag_service,'get_rag_service',lambda:service)
    send(hybrid,c('SELECT_PRODUCTS',mode='EXPLICIT',references=[{'kind':'focus'}]))
    before=deepcopy(pending(hybrid)); fresh_action(hybrid)
    action=cart_manager.get_checkout_prefs(hybrid.sid)['checkout_action_id']
    result=send(hybrid,c('READ_PRODUCT_INFO',target={'kind':'focus'},facet=facet,query='Cà Phê Alpha caffeine sữa'))
    assert pending(hybrid) == before and cart_manager.get_checkout_prefs(hybrid.sid)['checkout_action_id'] == action
    assert not hybrid.writes and len(hybrid.provider.requests) == 2
    if facet == 'allergen':
        assert 'chưa đủ' in result['reply'] and 'an toàn' in result['reply']
    else:
        assert 'caffeine' in result['reply']
