"""Scripted OpenAI-compatible provider exercises the real loop and business gateway."""
from copy import deepcopy
import json
import time
from types import SimpleNamespace
from uuid import uuid4
import pytest

from src.agents import agent_service, llm_tool_orchestrator as agent
from src.agents.agent_memory import ConversationMemory, empty_memory
from src.agents import agent_memory
from src.agents.agent_context import build_context
from src.agents.tool_artifacts import ToolArtifacts
from src.agents.tool_capabilities import CAPABILITIES, TOOL_AUDIT, tool_schemas
from src.agents.tool_policy import GuardedToolGateway, MutationOutcomeUnknown
from src.common import cart_manager, groq_service
from src.function_calling import tools
from src.function_calling.tools import cart_tools, product_tools, voucher_tools, branch_tools


class FakeRedis:
    def __init__(self):
        self.data, self.expiry = {}, {}
    def set(self, key, value, ex):
        self.data[key], self.expiry[key] = value, time.time()+ex
    def get(self, key):
        return self.data.get(key) if self.expiry.get(key, 0)>time.time() else None
    def delete(self, key):
        self.data.pop(key, None)


class ScriptedProvider:
    """No production phrase router: test scripts specify model proposals."""
    base_url = 'fake://provider'
    def __init__(self):
        self.steps, self.requests = [], []
        self.chat = SimpleNamespace(completions=self)
    def create(self, **kwargs):
        self.requests.append(deepcopy(kwargs))
        step = self.steps.pop(0)
        if isinstance(step, Exception):
            raise step
        return groq_service.FakeResponse({'choices': [{'message': step}], 'model': 'test-model',
            'usage': {'prompt_tokens': 100, 'completion_tokens': 20}})
    def plan(self, calls, reply='Dạ, mình đã có kết quả để bạn xem.', claims=(), quotes=()):
        self.steps = [{'tool_calls': [{'id': str(i), 'type': 'function',
            'function': {'name': name, 'arguments': json.dumps(args, ensure_ascii=False)}}
            for i, (name, args) in enumerate(calls)]},
            {'content': json.dumps({'reply': reply, 'mutation_claims': list(claims),
                                    'evidence_quotes': list(quotes)}, ensure_ascii=False)}]


@pytest.fixture
def runtime(monkeypatch):
    sid = 'lan20-'+uuid4().hex
    monkeypatch.setenv('AI_CHAT_ORCHESTRATOR_MODE', 'llm_tools')
    # Guarded inference now owns its provider policy. Keep this shared fixture
    # entirely scripted, including failures; never fall through to real keys.
    monkeypatch.setenv('AI_AGENT_PROVIDER', 'gemini')
    monkeypatch.setenv('AI_AGENT_MODEL', 'test-model')
    monkeypatch.setenv('AI_AGENT_FALLBACK_PROVIDERS', '')
    monkeypatch.setenv('GEMINI_API_KEY', 'fixture-key')
    monkeypatch.setenv('AI_AGENT_MAX_PROVIDER_ATTEMPTS_PER_ROUND', '1')
    redis, provider, writes, reads, durable = FakeRedis(), ScriptedProvider(), [], [], {}
    monkeypatch.setattr(groq_service, 'GeminiClient', lambda _key: provider)
    from src.common import agent_provider_policy
    monkeypatch.setattr(agent_provider_policy, '_cooldowns', {})
    monkeypatch.setattr(agent_provider_policy, '_invalid_credentials', set())
    monkeypatch.setattr(agent_provider_policy, '_next_slot', {})
    monkeypatch.setattr(agent_memory, 'redis_client', lambda: redis)
    monkeypatch.setattr(groq_service, '_get_groq_client', lambda: provider)
    monkeypatch.setattr(groq_service, '_resolve_chat_model', lambda _: 'test-model')
    monkeypatch.setattr(groq_service, '_llm_clients', [provider])
    monkeypatch.setattr(groq_service, 'switch_groq_client', lambda: None)
    monkeypatch.setattr(cart_tools, 'is_authenticated_cart_session', lambda _: True)
    monkeypatch.setattr(cart_tools, 'sync_authoritative_cart', lambda s: {**cart_manager.get_cart(s), 'authoritative': True})
    monkeypatch.setattr(cart_manager, 'load_durable_processed_turn', lambda s, key: deepcopy(durable.get((s,key))))
    monkeypatch.setattr(cart_manager, 'persist_processed_turn_durable', lambda s,key,record: durable.update({(s,key): deepcopy(record)}))
    products = [dict(product_id=str(101+i), product_name=name, category='drink' if i<2 else 'food',
        final_price=30000+i*10000, is_active=True) for i,name in enumerate(('Cà Phê Alpha','Cà Phê Beta','Cake Gamma'))]
    def catalog(args, _sid):
        reads.append(('filter_catalog',args))
        from src.rag.documents import normalize_text
        rows = [p for p in products if args.get('category', 'all') in {'all',p['category']}
            and (args.get('max_price') is None or p['final_price']<args['max_price'])
            and (not args.get('search_text') or normalize_text(args['search_text']) in normalize_text(p['product_name']))]
        rows.sort(key=lambda p:p['final_price'], reverse=args.get('sort_by')=='price_desc')
        return dict(status='ok', products=rows[:args.get('limit',16)])
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'filter_catalog', catalog)
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'get_recommendations', lambda args,s: dict(status='ok', products=products[:args.get('top_k',5)]))
    def options(product_id=None, **_kwargs):
        row = next((p for p in products if p['product_id']==product_id), None)
        if not row: return dict(status='not_found')
        return dict(status='ok', product_id=product_id, product_name=row['product_name'],
            option_groups=[dict(name='Size', values=['M','L'], required=True),
                dict(name='Topping', values=['Pearl','Foam'], multiple=True, required=False)])
    monkeypatch.setattr(product_tools, 'execute_get_product_options', options)
    def price(**kwargs):
        reads.append(('price',kwargs))
        rows=[dict(p,final_price=p['final_price']+(12000 if kwargs.get('size')=='L' else 0))
              for p in products if p['product_name']==kwargs['product_name_query']]
        return dict(status='ok', products=rows)
    monkeypatch.setattr(product_tools, 'execute_check_price_and_stock', price)
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'check_price_and_stock', lambda args,s: price(**args))
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'get_product_insights', lambda args,s: dict(status='ok', rating=4.5, product_name=args['product_name']))
    def add(**kwargs):
        writes.append(('add',kwargs))
        items = deepcopy(cart_manager.get_cart(kwargs['session_id'])['items'])
        items.append(dict(id=800+len(items), **{k:v for k,v in kwargs.items() if k not in {'session_id','operation_id'}}))
        cart_manager.replace_items_from_order_cart(kwargs['session_id'],items)
        cart_manager.mark_pending_product_added(kwargs['session_id'],kwargs['product_name'])
        return dict(status='ok', cart=cart_manager.get_cart(kwargs['session_id']), unit_price=kwargs['unit_price'])
    monkeypatch.setattr(cart_tools,'execute_add_to_cart',add)
    def update(s,line,patch,**kwargs):
        writes.append(('update',line,patch,kwargs))
        items=deepcopy(cart_manager.get_cart(s)['items'])
        next(r for r in items if str(r['cart_item_id'])==line).update(patch)
        cart_manager.replace_items_from_order_cart(s,items)
        return dict(status='ok',cart=cart_manager.get_cart(s))
    monkeypatch.setattr(cart_tools,'execute_update_cart_item',update)
    def remove(s,line,**kwargs):
        writes.append(('remove',line,kwargs))
        cart_manager.replace_items_from_order_cart(s,[r for r in cart_manager.get_cart(s)['items'] if str(r['cart_item_id'])!=line])
        return dict(status='ok',cart=cart_manager.get_cart(s))
    monkeypatch.setattr(cart_tools,'execute_remove_cart_item',remove)
    monkeypatch.setattr(cart_tools,'execute_get_cart_quote',lambda s: dict(status='ok',quote={'final_total':30000},cart=cart_manager.get_cart(s)))
    cart_manager.replace_items_from_order_cart(sid,[dict(id=800+i,**p,quantity=1,size='M',toppings=['Pearl'],unit_price=p['final_price']) for i,p in enumerate(products[:2])])
    ConversationMemory(redis).save(sid,{**empty_memory(),'visible_snapshots':{'products':products},'focus':{'product':products[0]}})
    def turn(message='Synthetic request', **kwargs):
        return agent_service.run_agent(sid,message,client_message_id=kwargs.pop('client_message_id',uuid4().hex),**kwargs)
    return SimpleNamespace(sid=sid,redis=redis,provider=provider,writes=writes,reads=reads,products=products,turn=turn,durable=durable)


@pytest.mark.parametrize('message,args,count', [
    ('cho tôi xem 2 món cà phê rẻ nhất',dict(category='drink',search_text='cà phê',sort_by='price_asc',limit=2),2),
    ('cho tôi 3 món đắt nhất dưới 70k',dict(search_text='',max_price=70000,sort_by='price_desc',limit=3),3),
    ('món đắt nhất?',dict(search_text='',sort_by='price_desc',limit=1),1),
    ('có bánh gì ngon không?',dict(search_text='',category='food',limit=2),1),
])
def test_catalog_semantic_composition(runtime,message,args,count):
    runtime.provider.plan([('filter_catalog',args)],reply='Đây là các món hiện có để bạn chọn.')
    result=runtime.turn(message)
    assert len(result['ui_payload']['products'])==count and not runtime.writes
    assert runtime.reads==[('filter_catalog',args)]
    assert [r['product_id'] for r in result['ui_payload']['products']]==[r['product_id'] for r in result['tool_calls_log'][0]['result']['products']]
    assert not any(r['tool']=='search_knowledge_base' for r in result['tool_calls_log'])


def test_compound_extrema_uses_two_reads_and_canonical_union(runtime):
    runtime.provider.plan([('filter_catalog',dict(search_text='',sort_by='price_asc',limit=1)),
        ('filter_catalog',dict(search_text='',sort_by='price_desc',limit=1))])
    final = json.loads(runtime.provider.steps[-1]['content'])
    final.update(display_product_count=2, display_product_ids=['101', '103'])
    runtime.provider.steps[-1]['content'] = json.dumps(final)
    result=runtime.turn('cho tôi món cà phê đắt nhất và rẻ nhất')
    assert {r['product_id'] for r in result['ui_payload']['products']}=={'101','103'}
    assert len(runtime.reads)==2 and not runtime.writes


def test_review_then_price_changes_tool_without_legacy_routing(runtime):
    runtime.provider.plan([('get_product_insights',{'product_name':'Cà Phê Alpha'})])
    assert runtime.turn('review sao?')['tool_calls_log'][0]['tool']=='get_product_insights'
    runtime.provider.plan([('check_price_and_stock',{'product_name_query':'Cà Phê Alpha'})],reply='Cà Phê Alpha hiện có giá 30.000đ.')
    result=runtime.turn('giá nhiêu?')
    assert result['tool_calls_log'][0]['tool']=='check_price_and_stock' and '30.000' in result['reply']
    assert not runtime.writes


@pytest.mark.parametrize('owner',['fill_options','select_voucher','select_branch','confirm_checkout'])
def test_rag_interrupt_preserves_pending_owner(runtime,monkeypatch,owner):
    from src.function_calling.tools import knowledge_tools
    from src.rag import rag_service
    doc=dict(id='synthetic-document', title='Cà Phê Alpha',content='Hương vị dịu. Chưa có thông tin thành phần đầy đủ.',
        source='fixture',domain='product_description',entity_type='product',entity_id='101',tags=['Cà Phê Alpha'],authority='knowledge',volatility='slow')
    monkeypatch.setattr(rag_service,'load_all_rag_data',lambda:[doc])
    service=rag_service.RAGService();service.load()
    monkeypatch.setattr(rag_service,'get_rag_service',lambda:service)
    cart_manager.set_pending_action(runtime.sid,owner,{'synthetic':True})
    before=deepcopy(cart_manager.get_checkout_prefs(runtime.sid))
    runtime.provider.plan([('search_knowledge_base',dict(query='Cà Phê Alpha mô tả',domain='product_description',entity_type='product',entity_id='101'))],
        quotes=[dict(document_id=doc['id'],quote=doc['content'])])
    result=runtime.turn('món này có gì hay?')
    assert 'Hương vị dịu' in result['reply'] and not runtime.writes
    after=cart_manager.get_checkout_prefs(runtime.sid)
    assert after['pending_action']==before['pending_action']
    assert all(r['entity_id']=='101' for r in result['tool_calls_log'][0]['result']['results'])


@pytest.mark.parametrize('name,args',[
    ('add_to_cart',dict(product_id='999')),
    ('add_to_cart',dict(product_id='101',unit_price=1)),
    ('update_cart_item',dict(cart_item_id='999',desired_state={'quantity':2})),
    ('update_cart_item',dict(cart_item_id='800',desired_state={'unit_price':1})),
    ('update_cart_item',dict(cart_item_id='800',desired_state={'quantity':0})),
    ('update_cart_item',dict(cart_item_id='800',desired_state={'quantity':-1})),
    ('update_cart_item',dict(cart_item_id='800',desired_state={'quantity':1.5})),
    ('remove_cart_item',dict(cart_item_id='999')),
    ('add_to_cart',dict(product_id='101',session_id='other-user')),
    ('cancel_order',dict(order_id='forged',is_confirmed=True)),
])
def test_untrusted_write_arguments_never_mutate(runtime,name,args):
    before=deepcopy(cart_manager.get_cart(runtime.sid)['items'])
    runtime.provider.plan([(name,args)])
    result=runtime.turn()
    assert not runtime.writes and cart_manager.get_cart(runtime.sid)['items']==before
    assert not result.get('checkout_payload')


def test_options_stage_then_complete_uses_authoritative_price_and_replay(runtime):
    runtime.provider.plan([('add_to_cart',dict(product_id='101',quantity=2))])
    result=runtime.turn('lấy món đầu tiên hai ly')
    assert result['tool_calls_log'][0]['result']['status']=='needs_options' and not runtime.writes
    assert cart_manager.get_pending_action(runtime.sid)['type']=='fill_options'
    runtime.provider.plan([('add_to_cart',dict(product_id='101',size='L',toppings=['Foam']))],claims=['add_to_cart'])
    first=runtime.turn('size lớn và topping foam',client_message_id='same-turn')
    second=runtime.turn('size lớn và topping foam',client_message_id='same-turn')
    assert first==second and len(runtime.writes)==1
    assert runtime.writes[0][1]['unit_price']==42000 and runtime.writes[0][1]['quantity']==2
    assert runtime.writes[0][1]['size']=='L' and runtime.writes[0][1]['toppings']==['Foam']


@pytest.mark.parametrize('patch',[{'quantity':2},{'toppings':['Foam']},{'size':'L'}, {'size':'L','quantity':3}])
def test_cart_absolute_patch_exact_line_preserves_other_rows(runtime,patch):
    before=deepcopy(cart_manager.get_cart(runtime.sid)['items'])
    runtime.provider.plan([('update_cart_item',dict(cart_item_id='801',desired_state=patch))],claims=['update_cart_item'])
    runtime.turn('dòng 2 cho tôi 2 cái nha',client_message_id='edit-once')
    runtime.turn('dòng 2 cho tôi 2 cái nha',client_message_id='edit-once')
    after=cart_manager.get_cart(runtime.sid)['items']
    assert after[0]==before[0] and runtime.writes[0][0:3]==('update','801',patch)
    assert len(runtime.writes)==1 and all(after[1][k]==v for k,v in patch.items())


def test_unknown_topping_is_rejected_not_partially_applied(runtime):
    runtime.provider.plan([('update_cart_item',dict(cart_item_id='800',desired_state={'toppings':['Pearl','Unknown']}))])
    result=runtime.turn('đổi topping')
    assert result['tool_calls_log'][0]['result']['status']=='invalid_option' and not runtime.writes


@pytest.mark.parametrize('message',['privacy thế nào?','phí sao?','ok giá nhiêu?','đơn gồm gì?','voucher còn không?'])
def test_read_questions_cannot_confirm_even_when_model_requests_it(runtime,monkeypatch,message):
    fresh_action(runtime)
    monkeypatch.setattr(cart_tools,'execute_confirm_checkout',lambda *a,**k: pytest.fail('Unsafe confirmation'))
    runtime.provider.plan([('confirm_checkout',{})])
    result=runtime.turn(message)
    assert result['tool_calls_log'][0]['result']['status']=='confirmation_required'


def fresh_action(runtime):
    cart_manager.set_checkout_prefs(runtime.sid, delivery_type='MANG_DI', payment_method='VNPAY')
    cart_manager.set_branch(runtime.sid, 'synthetic-pickup', 'Pickup branch')
    cart_manager.set_checkout_context(runtime.sid, voucher_decided=True, checkout_requested=True)
    cart_manager.set_checkout_context(runtime.sid,checkout_action_id='synthetic-action',
        checkout_action_expires_at=str(time.time()+900),summary_fingerprint=cart_manager.cart_fingerprint(runtime.sid))
    cart_manager.set_pending_action(runtime.sid,'confirm_checkout',{})


@pytest.mark.parametrize('defect',['no_action','wrong_action','expired','stale_cart'])
def test_final_confirmation_action_safety(runtime,monkeypatch,defect):
    fresh_action(runtime)
    if defect=='no_action': cart_manager.set_checkout_context(runtime.sid,checkout_action_id=None)
    if defect=='expired': cart_manager.set_checkout_context(runtime.sid,checkout_action_expires_at=str(time.time()-1))
    if defect=='stale_cart': cart_manager.set_checkout_context(runtime.sid,summary_fingerprint='stale')
    monkeypatch.setattr(cart_tools,'execute_confirm_checkout',lambda *a,**k: pytest.fail('Unsafe action'))
    runtime.provider.plan([('confirm_checkout',{'action_id':'wrong'} if defect=='wrong_action' else {})])
    result = runtime.turn('xác nhận')
    if defect == 'no_action':
        assert all(row['result']['status'] not in {'ok', 'already_processed'} for row in result['tool_calls_log'])
    else:
        assert result['tool_calls_log'][0]['result']['status'] == ('invalid_arguments' if defect == 'wrong_action' else 'confirmation_required')


def test_current_explicit_confirmation_once_then_transaction_memory_cleared(runtime,monkeypatch):
    fresh_action(runtime)
    orders=[]
    def confirm(s,**kwargs):
        orders.append(kwargs)
        cart_manager.clear_cart(s,order_id='synthetic-order')
        return dict(status='ok',order_id='synthetic-order',message='Đơn hàng đã được tạo.')
    monkeypatch.setattr(cart_tools,'execute_confirm_checkout',confirm)
    runtime.provider.plan([('confirm_checkout',{})],claims=['confirm_checkout'])
    runtime.turn('xác nhận',client_message_id='confirm-once')
    runtime.turn('xác nhận',client_message_id='confirm-once')
    assert orders==[{'action_id':'synthetic-action'}]
    remembered=ConversationMemory(runtime.redis).load(runtime.sid)
    assert not any(remembered['visible_snapshots'].values()) and not remembered['focus']


def test_provider_failure_after_committed_write_does_not_fall_back_or_repeat(runtime,monkeypatch):
    runtime.provider.plan([('update_cart_item',dict(cart_item_id='800',desired_state={'quantity':2}))])
    runtime.provider.steps[-1]=RuntimeError('synthetic provider outage')
    result=runtime.turn(client_message_id='provider-lost')
    replay=runtime.turn(client_message_id='provider-lost')
    assert result==replay and result['error'] and len(runtime.writes)==1


def test_unknown_mutation_outcome_propagates_to_durable_http_boundary(runtime,monkeypatch):
    calls=[]
    def unknown(*args,**kwargs):
        calls.append(1)
        raise TypeError('synthetic failure after possible commit')
    monkeypatch.setattr(cart_tools,'execute_update_cart_item',unknown)
    runtime.provider.plan([('update_cart_item',dict(cart_item_id='800',desired_state={'quantity':2}))])
    with pytest.raises(MutationOutcomeUnknown): runtime.turn()
    assert calls==[1]


def test_shadow_has_no_business_or_redis_effect(runtime,monkeypatch):
    monkeypatch.setenv('AI_CHAT_ORCHESTRATOR_MODE','shadow')
    monkeypatch.setattr('src.agents.order_flow_graph.run_order_flow',lambda *a,**k: {'reply':'legacy-only'})
    before_cart=deepcopy(cart_manager._SESSION_CARTS)
    before_redis=deepcopy(runtime.redis.data)
    runtime.provider.plan([('remove_cart_item',{'cart_item_id':'800'})])
    assert runtime.turn()['reply']=='legacy-only'
    assert before_cart==cart_manager._SESSION_CARTS and before_redis==runtime.redis.data and not runtime.writes


def test_legacy_mode_does_not_call_new_provider(runtime,monkeypatch):
    monkeypatch.setenv('AI_CHAT_ORCHESTRATOR_MODE','legacy')
    monkeypatch.setattr('src.agents.order_flow_graph.run_order_flow',lambda *a,**k: {'reply':'legacy'})
    assert runtime.turn()['reply']=='legacy' and not runtime.provider.requests


def test_currency_invention_replaced_with_tool_facts(runtime):
    runtime.provider.plan([('filter_catalog',{'search_text':'','limit':1})],reply='Cà Phê Alpha có giá 999.999đ.')
    result=runtime.turn()
    assert '999.999' not in result['reply'] and '30,000' in result['reply']


def test_context_is_bounded_and_current_cart_overrides_redis(runtime,monkeypatch):
    monkeypatch.setenv('AI_AGENT_CONTEXT_CHAR_LIMIT','2500')
    memory=ConversationMemory(runtime.redis).load(runtime.sid)
    memory['cart']={'quantity':999}
    memory['recent_turns']=[{'role':'user','content':'x'*10000}]*100
    ctx,text=build_context(runtime.sid,memory)
    assert len(text)<=2500 and ctx['business']['cart']['items'][0]['quantity']==1
    assert '999' not in text


def test_capability_audit_is_complete_and_unsafe_legacy_tools_not_exposed():
    assert set(TOOL_AUDIT)==set(tools.TOOL_EXECUTORS)
    names={r['function']['name'] for r in tool_schemas()}
    assert {'cancel_order','update_order','get_user_preferences'}.isdisjoint(names)
    assert {'filter_catalog','confirm_checkout','update_cart_item'}<=names
