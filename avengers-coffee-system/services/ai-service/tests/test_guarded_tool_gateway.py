from copy import deepcopy
import pytest
from test_llm_tool_orchestrator import runtime, fresh_action
from test_checkout_guarded_contract import gateway
from test_semantic_control import compatibility_runtime, runtime as semantic_runtime, gateway_for, action
from src.agents.agent_memory import ConversationMemory
from src.agents.tool_artifacts import candidate_id
from src.common import cart_manager
from src.function_calling.tools import cart_tools, branch_tools, voucher_tools


def remember(runtime, kind, rows):
    store=ConversationMemory(runtime.redis)
    data=store.load(runtime.sid)
    data['visible_snapshots'][kind]=rows
    store.save(runtime.sid,data)


def test_voucher_fresh_eligibility_and_skip(runtime,monkeypatch):
    calls=[]
    monkeypatch.setattr(voucher_tools,'execute_get_applicable_vouchers',lambda s: {'status':'ok','vouchers':[{'ma_voucher':'SYNTHETIC-V'}]})
    def apply(s,code):
        calls.append(('apply',code))
        cart_manager.set_checkout_context(s,voucher_code=code,voucher_decided=True)
        return {'status':'ok','voucher_code':code,'discount_amount':5000}
    monkeypatch.setattr(voucher_tools,'execute_apply_voucher',apply)
    def remove(s):
        calls.append(('remove',))
        cart_manager.set_checkout_context(s,voucher_code=None,voucher_decided=True)
        return {'status':'ok','voucher_code':None}
    monkeypatch.setattr(voucher_tools,'execute_remove_voucher',remove)
    remember(runtime, 'vouchers', [{'ma_voucher':'SYNTHETIC-V'}])
    cart_manager.set_checkout_context(runtime.sid, voucher_offer_pending=True)
    runtime.provider.plan([('apply_voucher',{'voucher_code':'SYNTHETIC-V'})])
    runtime.turn('dùng mã đó',client_message_id='voucher-once')
    runtime.turn('dùng mã đó',client_message_id='voucher-once')
    assert calls==[('apply','SYNTHETIC-V')]
    runtime.provider.plan([('remove_voucher',{})])
    runtime.turn('thôi bỏ mã đi')
    assert calls[-1]==('remove',) and cart_manager.get_checkout_prefs(runtime.sid)['voucher_decided']
    runtime.provider.plan([('apply_voucher',{'voucher_code':'STALE-V'})])
    assert gateway(runtime, 'áp mã STALE-V', filtered=False).dispatch('apply_voucher', {'voucher_code':'STALE-V'})['status']=='voucher_not_eligible'
    assert len(calls)==2


def test_finish_cart_opens_voucher_then_choices_then_checkout_summary(semantic_runtime,monkeypatch):
    runtime = semantic_runtime
    def send(message, operations):
        g = gateway_for(runtime, message)
        runtime.provider.plan([('customer_actions', {'actions': [action(g, name, args, **({'reference': {'namespace': 'PAYMENT', 'kind': 'name', 'value': 'tiền mặt'}} if name == 'set_payment_choice' else {})) for name, args in operations]})])
        return runtime.turn(message)
    monkeypatch.setattr(voucher_tools,'execute_get_applicable_vouchers',lambda s: {'status':'ok','vouchers':[{'ma_voucher':'SYNTHETIC-V','ten_voucher':'V'}]})
    result = send('hoàn tất giỏ', [('finish_cart', {})])
    assert result['ui_payload']['vouchers'][0]['ma_voucher']=='SYNTHETIC-V'
    assert cart_manager.get_pending_action(runtime.sid)['type']=='select_voucher'
    assert gateway(runtime, 'xem đơn', filtered=False).dispatch('request_checkout', {})['status']=='need_voucher_decision'
    send('bỏ mã, lấy tại quán, tiền mặt', [('skip_voucher', {}),
        ('set_fulfillment_choice', {'delivery_type':'MANG_DI'}),
        ('set_payment_choice', {'payment_method':'THANH_TOAN_KHI_NHAN_HANG'})])
    calls=[]
    def checkout(s,reuse_summary=False):
        calls.append(reuse_summary)
        state=cart_manager.mark_checkout_summary(s,reuse_existing=reuse_summary)
        cart_manager.set_pending_action(s,'confirm_checkout',{})
        return {'status':'require_confirmation','order_summary':{'action_id':state['checkout_action_id'],'final_total':70000}}
    monkeypatch.setattr(cart_tools,'execute_request_checkout',checkout)
    cart_manager.set_branch(runtime.sid,'synthetic-pickup','Pickup branch')
    first = send('xem đơn', [('request_checkout', {})])['checkout_payload']
    second = send('xem lại đơn', [('request_checkout', {'reuse_summary':True})])['checkout_payload']
    assert first==second and calls==[False,True] and not runtime.writes


@pytest.mark.parametrize('status',['unavailable','unverified','unknown'])
def test_unavailable_or_unknown_branch_never_committed(runtime,monkeypatch,status):
    remember(runtime,'branches',[{'branch_id':'branch-a','branch_name':'Outlet A','availability_status':status}])
    monkeypatch.setattr(branch_tools,'execute_set_session_branch',lambda *a,**k: pytest.fail('Unsafe branch'))
    runtime.provider.plan([('set_session_branch',{'branch_id':'branch-a'})])
    assert runtime.turn()['tool_calls_log'][0]['result']['status']=='branch_unavailable_or_unknown'


def test_branch_selection_is_canonical_and_no_location_lookup(runtime,monkeypatch):
    from src.common import inventory_validation
    from src.function_calling import helpers
    remember(runtime,'branches',[{'branch_id':'branch-a','branch_name':'Outlet A','availability_status':'available'}])
    monkeypatch.setattr(inventory_validation,'validate_cart_at_branch',lambda *a,**k: {'unavailable':[],'unverified':[]})
    monkeypatch.setattr(helpers,'_get_engine',lambda:None)
    monkeypatch.setattr(branch_tools,'execute_find_nearest_branch',lambda *a,**k: pytest.fail('Re-geocoded branch'))
    selected=[]
    def select(s,bid,name,customer_selected=False):
        selected.append((bid,name,customer_selected))
        cart_manager.set_branch(s,bid,name)
        return {'status':'ok'}
    monkeypatch.setattr(branch_tools,'execute_set_session_branch',select)
    cart_manager.set_checkout_context(runtime.sid,location_pending=True,address_change_requested=True)
    runtime.provider.plan([('set_session_branch',{'branch_id':'branch-a'})])
    runtime.turn('quán đầu tiên',client_message_id='branch-once')
    runtime.turn('quán đầu tiên',client_message_id='branch-once')
    assert selected==[('branch-a','Outlet A',True)]
    assert cart_manager.get_cart(runtime.sid)['branch_id']=='branch-a'
    assert not cart_manager.get_checkout_prefs(runtime.sid).get('location_pending')


def test_payment_and_fulfillment_change_invalidate_prior_summary(runtime):
    fresh_action(runtime)
    cart_manager.set_checkout_prefs(runtime.sid,delivery_type='MANG_DI',payment_method='VNPAY')
    cart_manager.set_branch(runtime.sid,'old-branch','Old branch')
    runtime.provider.plan([('set_checkout_choices',{'delivery_type':'GIAO_TAN_NOI','payment_method':'THANH_TOAN_KHI_NHAN_HANG'})])
    runtime.turn('đổi sang giao tận nơi, COD')
    prefs=cart_manager.get_checkout_prefs(runtime.sid)
    assert prefs['delivery_type']=='GIAO_TAN_NOI' and prefs['payment_method']=='THANH_TOAN_KHI_NHAN_HANG'
    assert not prefs.get('checkout_action_id') and not prefs.get('summary_fingerprint')
    assert not cart_manager.get_cart(runtime.sid)['branch_id']


def test_wallet_unavailable_cannot_replace_payment(runtime,monkeypatch):
    cart_manager.set_checkout_prefs(runtime.sid,payment_method='VNPAY')
    monkeypatch.setattr(cart_tools,'validate_wallet_selection',lambda s: {'reply':'Ví chưa sẵn sàng.'})
    runtime.provider.plan([('set_checkout_choices',{'payment_method':'VI_DIEN_TU'})])
    assert runtime.turn('thanh toán bằng ví điện tử')['tool_calls_log'][0]['result']['status']=='wallet_unavailable'
    assert cart_manager.get_checkout_prefs(runtime.sid)['payment_method']=='VNPAY'


def test_current_provider_location_candidate_promotes_delivery_without_re_geocode(runtime,monkeypatch):
    address='12 Đường Alpha, Phường Beta, Quận Gamma, Thành phố Hồ Chí Minh'
    candidate={'normalized_label':address,'display_address':address,'lat':10.8,'lng':106.7}
    candidate['candidate_id']=candidate_id(candidate)
    remember(runtime,'location_candidates',[candidate])
    cart_manager.set_checkout_prefs(runtime.sid,delivery_type='GIAO_TAN_NOI')
    cart_manager.set_checkout_context(runtime.sid,checkout_requested=True)
    calls=[]
    def find(location='',session_id='',resolved_location=None,**kwargs):
        calls.append(resolved_location)
        assert resolved_location['lat']==10.8 and resolved_location['lng']==106.7
        return {'status':'ok','normalized_location':address,'branches':[{'ma_chi_nhanh':'delivery-branch','ten_chi_nhanh':'Delivery branch','availability_status':'available'}]}
    def select(s,bid,name,**kwargs):
        cart_manager.set_branch(s,bid,name)
        return {'status':'ok'}
    monkeypatch.setattr(branch_tools,'execute_find_nearest_branch',find)
    monkeypatch.setattr(branch_tools,'execute_set_session_branch',select)
    runtime.provider.plan([('select_location_candidate',{'candidate_id':candidate['candidate_id']})])
    runtime.turn('đúng địa điểm đầu tiên')
    prefs=cart_manager.get_checkout_prefs(runtime.sid)
    assert prefs['delivery_address']==address and prefs['address_confirmed']
    assert prefs['location_address']==address and len(calls)==1
    assert cart_manager.get_cart(runtime.sid)['branch_id']=='delivery-branch'


@pytest.mark.parametrize('tool,args',[('apply_voucher',{'voucher_code':'wrong'}),
    ('set_session_branch',{'branch_id':'wrong'}),('select_location_candidate',{'candidate_id':'wrong'}),
    ('update_cart_item',{'cart_item_id':'wrong','desired_state':{'quantity':2}})])
def test_namespace_targets_are_validated_by_capability(runtime,monkeypatch,tool,args):
    monkeypatch.setattr(voucher_tools,'execute_get_applicable_vouchers',lambda s: {'status':'ok','vouchers':[]})
    result = gateway(runtime, 'số hai', filtered=False).dispatch(tool, args)
    assert not runtime.writes and result['status'] != 'ok'


def test_redis_outage_read_consultation_and_unknown_deictic_write(runtime,monkeypatch):
    def offline(): raise ConnectionError('offline')
    monkeypatch.setattr('src.agents.agent_memory.redis_client',offline)
    runtime.provider.plan([('filter_catalog',{'search_text':'','limit':2})])
    assert len(runtime.turn('xem menu')['ui_payload']['products'])==2
    runtime.provider.plan([('add_to_cart',{'product_id':'999'})])
    assert runtime.turn('thêm món đó')['tool_calls_log'][0]['result']['status']=='unknown_product_reference'
    assert not runtime.writes


def test_empty_cart_checkout_and_voucher_are_blocked(runtime):
    cart_manager.replace_items_from_order_cart(runtime.sid,[])
    runtime.provider.plan([('finish_cart',{}),('skip_voucher',{})])
    result=runtime.turn('thanh toán')
    assert all(row['result']['status']=='empty_cart' for row in result['tool_calls_log'])
    assert not result.get('checkout_payload')


@pytest.mark.parametrize('phase',['before_tools','after_read'])
def test_provider_read_failure_never_enters_legacy_or_writes(runtime,monkeypatch,phase):
    monkeypatch.setattr('src.agents.order_flow_graph.run_order_flow',lambda *a,**k: pytest.fail('Wrong fallback'))
    if phase=='before_tools': runtime.provider.steps=[RuntimeError('outage')]
    else:
        runtime.provider.plan([('filter_catalog',{'search_text':'','limit':1})])
        runtime.provider.steps[-1]=RuntimeError('outage')
    assert runtime.turn()['error'] and not runtime.writes


def test_repeat_write_signature_in_one_provider_round_executes_once(runtime):
    call=('update_cart_item',{'cart_item_id':'800','desired_state':{'quantity':2}})
    runtime.provider.plan([call,call])
    runtime.turn('đổi số lượng')
    assert len(runtime.writes)==1


def test_top_k_capped_and_context_no_full_catalog(runtime):
    runtime.provider.plan([('filter_catalog',{'search_text':'','limit':50})])
    runtime.turn()
    assert runtime.reads[0][1]['limit']==16
    assert len(runtime.provider.requests[0]['messages'])==2


def test_multi_selection_options_change_mind_and_replacement(semantic_runtime):
    runtime = semantic_runtime
    def send(message, operations):
        g = gateway_for(runtime, message)
        runtime.provider.plan([('customer_actions', {'actions': [action(g, name, args, **({'reference': {'namespace': 'PAYMENT', 'kind': 'name', 'value': 'tiền mặt'}} if name == 'set_payment_choice' else {})) for name, args in operations]})])
        return runtime.turn(message)
    send('lấy món số 1 hai ly và món số 2 một ly', [
        ('add_to_cart', {'product_id':'101','quantity':2}),
        ('add_to_cart', {'product_id':'102','quantity':1})])
    assert len(cart_manager.get_checkout_prefs(runtime.sid)['pending_products'])==2
    send('thôi bỏ món thứ hai, món đầu size L topping Foam', [
        ('discard_pending_product', {'product_id':'102'}),
        ('add_to_cart', {'product_id':'101','size':'L','toppings':['Foam']})])
    assert runtime.writes[-1][1]['product_id']=='101' and runtime.writes[-1][1]['quantity']==2
    send('bỏ ly thứ hai, thay bằng bánh size M', [
        ('remove_cart_item', {'cart_item_id':'801'}),
        ('add_to_cart', {'product_id':'103','size':'M'})])
    assert [call[0] for call in runtime.writes]==['add','remove','add']
    ids=[row['product_id'] for row in cart_manager.get_cart(runtime.sid)['items']]
    assert ids==['101','101','103']


def test_checkout_missing_fields_are_structured_without_tool_execution(runtime,monkeypatch):
    cart_manager.set_checkout_context(runtime.sid,voucher_decided=True)
    monkeypatch.setattr(cart_tools,'execute_request_checkout',lambda *a,**k: pytest.fail('Missing prerequisites'))
    runtime.provider.plan([('request_checkout',{})])
    result = gateway(runtime, 'xem đơn', filtered=False).dispatch('request_checkout', {})
    assert set(result['missing'])=={'delivery_type','payment_method','branch'}


def test_new_summary_cannot_be_confirmed_in_same_turn(runtime,monkeypatch):
    cart_manager.set_checkout_prefs(runtime.sid,delivery_type='MANG_DI',payment_method='VNPAY')
    cart_manager.set_checkout_context(runtime.sid,voucher_decided=True)
    cart_manager.set_branch(runtime.sid,'pickup','Pickup')
    def summary(s,**kwargs):
        cart_manager.set_checkout_context(s,checkout_action_id='new-action')
        cart_manager.set_pending_action(s,'confirm_checkout',{})
        return {'status':'require_confirmation','order_summary':{'action_id':'new-action'}}
    monkeypatch.setattr(cart_tools,'execute_request_checkout',summary)
    monkeypatch.setattr(cart_tools,'execute_confirm_checkout',lambda *a,**k: pytest.fail('Same-turn creation'))
    runtime.provider.plan([('request_checkout',{}),('confirm_checkout',{})])
    result=runtime.turn('xác nhận')
    # The inference loop locks the second proposal before gateway dispatch.
    assert [row['tool'] for row in result['tool_calls_log']] == ['request_checkout']
    assert result['checkout_payload']['action_id'] == 'new-action'


def test_public_tool_results_never_contain_replay_records_or_tokens(runtime,monkeypatch):
    from src.function_calling import tools
    monkeypatch.setitem(tools.TOOL_EXECUTORS,'get_cart',lambda args,s: {'status':'ok','cart':{
        'items':[], 'checkout_prefs':{'processed_order_turns':{'old':{'result':'internal'}},'access_token':'secret'}}})
    runtime.provider.plan([('get_cart',{})])
    encoded=__import__('json').dumps(runtime.turn()['tool_calls_log'])
    assert 'processed_order_turns' not in encoded and 'secret' not in encoded


def test_cart_write_cannot_support_a_forged_order_success_claim(runtime):
    runtime.provider.plan([('update_cart_item',{'cart_item_id':'800','desired_state':{'quantity':2}})],
                          reply='Đã tạo đơn thành công.', claims=['update_cart_item'])
    result=runtime.turn('sửa số lượng')
    assert 'Đã tạo đơn' not in result['reply'] and len(runtime.writes)==1


def test_compound_rag_and_price_keep_both_authoritative_results(runtime):
    from src.agents.tool_artifacts import ToolArtifacts
    artifact=ToolArtifacts({})
    doc={'id':'evidence','content':'Hương vị dịu. Chưa có thông tin thành phần đầy đủ.'}
    artifact.collect('search_knowledge_base',{}, {'status':'ok','results':[doc]})
    artifact.collect('check_price_and_stock',{}, {'status':'ok','products':runtime.products[:1]})
    reply=artifact.validate_reply('{"reply":"Mô tả và giá","evidence_quotes":[],"mutation_claims":[]}')
    assert doc['content'] in reply and '30,000đ' in reply


def test_update_and_extra_add_same_product_is_blocked(runtime):
    runtime.provider.plan([('update_cart_item',{'cart_item_id':'800','desired_state':{'quantity':2}}),
                           ('add_to_cart',{'product_id':'101','size':'M','quantity':1})])
    result=runtime.turn('sửa dòng đầu thành hai ly')
    assert len(runtime.writes)==1 and result['tool_calls_log'][-1]['result']['status']=='conflicting_cart_operations'


@pytest.mark.parametrize('currency',['90k','90 nghìn','90.000 VNĐ'])
def test_unsupported_currency_amounts_are_not_repeated(runtime,currency):
    runtime.provider.plan([('check_price_and_stock',{'product_name_query':'Cà Phê Alpha'})],
                          reply='Giá hiện tại là '+currency)
    assert currency not in runtime.turn('giá nhiêu?')['reply']


def test_branch_cannot_be_committed_immediately_after_discovery(runtime,monkeypatch):
    from src.common import inventory_validation
    monkeypatch.setattr(branch_tools, 'branch_identity_available', lambda *a: True)
    monkeypatch.setattr(inventory_validation, 'validate_cart_at_branch', lambda *a: {'available': [], 'unavailable': [], 'unverified': [], 'product_statuses': [], 'is_fully_available': True})
    cart_manager.set_checkout_prefs(runtime.sid, delivery_type='MANG_DI')
    from src.function_calling import tools
    monkeypatch.setitem(tools.TOOL_EXECUTORS,'ask_branch',lambda args,s: {'status':'ok','branches':[
        {'branch_id':'new-outlet','branch_name':'New outlet','availability_status':'available'}]})
    monkeypatch.setattr(branch_tools,'execute_set_session_branch',lambda *a,**k: pytest.fail('Automatic selection'))
    entry_gateway = gateway(runtime, 'tìm quán giúp tôi', filtered=False)
    runtime.provider.plan([('ask_branch',{}),('set_session_branch',{'branch_id':'new-outlet'})])
    result=runtime.turn('tìm quán giúp tôi')
    assert [row['tool'] for row in result['tool_calls_log']] == ['ask_branch']
    assert not cart_manager.get_cart(runtime.sid).get('branch_id')
    assert entry_gateway.dispatch('set_session_branch', {'branch_id':'new-outlet'})['status'] == 'customer_branch_selection_required'


def test_fulfillment_selection_enables_existing_checkout_location_adapter(runtime):
    runtime.provider.plan([('set_checkout_choices',{'delivery_type':'GIAO_TAN_NOI'})])
    runtime.turn('chọn giao tận nơi')
    assert cart_manager.get_checkout_prefs(runtime.sid)['checkout_requested']


def test_reply_without_current_factual_evidence_is_repaired_with_tools(runtime):
    import json
    runtime.provider.steps=[{'content':json.dumps({'response_kind':'consultation','reply':'Giá 99k'})},
        {'tool_calls':[{'id':'repair','function':{'name':'check_price_and_stock','arguments':json.dumps({'product_name_query':'Cà Phê Alpha'})}}]},
        {'content':json.dumps({'response_kind':'consultation','reply':'Giá 30.000đ','mutation_claims':[]})}]
    result=runtime.turn('giá nhiêu?')
    assert len(runtime.provider.requests)==3 and result['tool_calls_log'][0]['tool']=='check_price_and_stock'
    assert '99k' not in result['reply']


def test_display_selection_is_only_canonical_tool_rows(runtime):
    import json
    runtime.provider.plan([('filter_catalog',{'search_text':'','limit':3})])
    runtime.provider.steps[-1]={'content':json.dumps({'reply':'Hai món để bạn xem.',
        'display_product_ids':['102','101'],'mutation_claims':[]})}
    result=runtime.turn('xem hai món')
    assert [row['product_id'] for row in result['ui_payload']['products']]==['102','101']


def test_model_cannot_invent_a_display_card(runtime):
    import json
    runtime.provider.plan([('filter_catalog',{'search_text':'','limit':1})])
    runtime.provider.steps[-1]={'content':json.dumps({'reply':'Món khác.',
        'display_product_ids':['999'],'mutation_claims':[]})}
    result=runtime.turn()
    assert not result['ui_payload']['products'] and '999' not in result['reply']


def test_unchanged_checkout_choices_preserve_fresh_confirmation(runtime):
    fresh_action(runtime)
    cart_manager.set_checkout_prefs(runtime.sid,delivery_type='MANG_DI',payment_method='VNPAY')
    runtime.provider.plan([('set_checkout_choices',{'payment_method':'VNPAY'})])
    runtime.turn('vẫn dùng VNPAY')
    assert cart_manager.get_checkout_prefs(runtime.sid)['checkout_action_id']=='synthetic-action'


def test_guarded_provider_requests_native_json_envelope(runtime):
    runtime.provider.plan([('get_cart',{})])
    runtime.turn()
    assert all('response_format' not in request if request.get('tools') else request['response_format'] == {'type':'json_object'} for request in runtime.provider.requests)


def test_review_resolves_durable_focus_after_another_product_list(runtime):
    from src.agents.agent_memory import ConversationMemory
    runtime.provider.plan([('filter_catalog',{'search_text':'','category':'food','limit':1})])
    runtime.turn('xem bánh')
    runtime.provider.plan([('get_product_insights',{'product_name':'Cà Phê Alpha'})])
    runtime.turn('review Cà Phê Alpha')
    focus=ConversationMemory(runtime.redis).load(runtime.sid)['focus']['product']
    assert focus['product_id']=='101' and focus['product_name']=='Cà Phê Alpha'


def test_named_product_knowledge_capability_uses_existing_rag_authority(runtime,monkeypatch):
    cart_manager.replace_items_from_order_cart(runtime.sid, [])
    from src.function_calling.tools import knowledge_tools
    calls=[]
    def evidence(**kwargs):
        calls.append(kwargs)
        return {'status':'ok','results':[{'id':'known','content':'Hương vị dịu. Thành phần chưa đầy đủ.'}]}
    monkeypatch.setattr(knowledge_tools,'execute_search_knowledge_base',evidence)
    runtime.provider.plan([('get_product_description',{'product_id':'101','query':'vị thế nào?'})])
    result=runtime.turn('món đầu vị ra sao?')
    assert calls[0]['entity_id']=='101' and calls[0]['domain']=='product_description'
    assert 'Hương vị dịu' in result['reply'] and not runtime.writes


def test_noop_absolute_update_never_calls_order_write(runtime):
    runtime.provider.plan([('update_cart_item',{'cart_item_id':'800','desired_state':{'quantity':1}})])
    result=runtime.turn('vẫn một ly')
    assert result['tool_calls_log'][0]['result']['status']=='already_processed' and not runtime.writes


@pytest.mark.parametrize('tool,args',[('update_cart_item',{'cart_item_id':'801','cart_line_ordinal':1,'desired_state':{'quantity':2}}),
    ('remove_cart_item',{'cart_item_id':'801','cart_line_ordinal':1})])
def test_cart_ordinal_and_exact_id_must_agree(runtime,tool,args):
    runtime.provider.plan([(tool,args)])
    assert runtime.turn('xóa món số 1' if tool == 'remove_cart_item' else 'sửa món số 1 thành 2 ly')['tool_calls_log'][0]['result']['status']=='cart_reference_conflict'
    assert not runtime.writes


@pytest.mark.parametrize('wrapper',['OpenAICompletions','GeminiCompletions','OpenRouterCompletions'])
def test_provider_wrappers_normalize_tool_calls_usage_and_json_format(monkeypatch,wrapper):
    from src.common import groq_service
    import requests
    captured=[]
    payload={'model':'provider-model','usage':{'prompt_tokens':7,'completion_tokens':3},'choices':[
        {'message':{'content':None,'tool_calls':[{'id':'canonical-call','type':'function',
            'function':{'name':'get_cart','arguments':'{}'}}]}}]}
    class Response:
        ok=True
        def json(self): return payload
    def post(url,**kwargs):
        captured.append(kwargs)
        return Response()
    monkeypatch.setattr(requests,'post',post)
    result=getattr(groq_service,wrapper)('fixture-credential').create(model='test',messages=[{'role':'user','content':'Test'}],
        tools=[{'type':'function','function':{'name':'get_cart'}}],response_format={'type':'json_object'})
    assert result.usage['prompt_tokens']==7 and result.model=='provider-model'
    assert result.choices[0].message.tool_calls[0].function.name=='get_cart'
    assert captured[0]['json']['response_format']=={'type':'json_object'}
    timeout = captured[0]['timeout']
    assert timeout.total == 30 and timeout.connect_timeout == 3
    timeout.start_connect()
    assert 0 < timeout.read_timeout <= timeout.total


def test_malformed_response_claims_after_write_replay_known_outcome(runtime):
    import json
    runtime.provider.plan([('update_cart_item',{'cart_item_id':'800','desired_state':{'quantity':2}})])
    runtime.provider.steps[-1]={'content':json.dumps({'reply':'Kết quả','mutation_claims':[{'invalid':'shape'}]})}
    first=runtime.turn(client_message_id='malformed-reply')
    assert runtime.turn(client_message_id='malformed-reply')==first and len(runtime.writes)==1
    assert '**Cà Phê Alpha** ×2' in first['reply']


def test_malformed_rag_quote_metadata_uses_provider_evidence():
    import json
    from src.agents.tool_artifacts import ToolArtifacts
    artifact=ToolArtifacts({})
    artifact.collect('search_knowledge_base',{}, {'status':'ok','results':[{'id':'doc','content':'Tài liệu chưa có thông tin thành phần đầy đủ.'}]})
    reply=artifact.validate_reply(json.dumps({'reply':'Phỏng đoán','evidence_quotes':[{'document_id':[]}]}))
    assert 'chưa có thông tin' in reply and 'Phỏng đoán' not in reply


def test_malformed_currency_text_never_breaks_response_validation(runtime):
    runtime.provider.plan([('check_price_and_stock',{'product_name_query':'Cà Phê Alpha'})],reply='Giá 1.2.3k')
    assert '1.2.3k' not in runtime.turn()['reply']


@pytest.mark.parametrize('boundary',['guest','missing_client_turn'])
def test_authentication_and_client_turn_are_required_before_option_staging(runtime,monkeypatch,boundary):
    if boundary=='guest':
        monkeypatch.setattr(cart_tools,'is_authenticated_cart_session',lambda s:False)
    runtime.provider.plan([('add_to_cart',{'product_id':'101','quantity':2})])
    result=runtime.turn(client_message_id=None if boundary=='missing_client_turn' else 'guest-blocked')
    denied = gateway(runtime, 'lấy món số 1', filtered=False)
    denied.client_message_id = None if boundary == 'missing_client_turn' else 'unauthenticated'
    assert denied.dispatch('add_to_cart', {'product_id':'101', 'quantity':2})['status']=='authentication_or_turn_required'
    assert not runtime.writes and not cart_manager.get_checkout_prefs(runtime.sid).get('pending_products')
    assert not result['checkout_payload']


@pytest.mark.parametrize('question',['Món này có sữa không?','Món này an toàn với người dị ứng không?'])
def test_sensitive_knowledge_claims_cannot_be_supported_by_reviews(runtime,question):
    runtime.provider.plan([('get_product_insights',{'product_name':'Cà Phê Alpha'})],
                          reply='Món này không có sữa và an toàn với người dị ứng.')
    result=runtime.turn(question)
    assert 'an toàn với người dị ứng' not in result['reply'] and 'chưa có đủ thông tin' in result['reply']
    assert not runtime.writes


@pytest.fixture(autouse=True)
def exercise_scripted_gateway_without_language_shortcuts(monkeypatch):
    # This module qualifies explicit provider proposals and gateway denials.
    # The legacy phrase router must not preempt the proposal under test;
    # production semantic mode never executes that router either.
    from src.agents import llm_tool_orchestrator
    monkeypatch.setattr(llm_tool_orchestrator, '_legacy_language_control', lambda *a: None)
