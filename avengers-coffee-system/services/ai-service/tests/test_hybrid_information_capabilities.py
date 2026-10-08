"""Actual provider/adapter boundaries for the 22:35–22:53 demo regressions."""
from copy import deepcopy
import json
from pathlib import Path
from types import SimpleNamespace
import pytest
from test_hybrid_menu_categories import menu
from hybrid_support import runtime, hybrid, command as c, send, no_cart
from src.common import cart_manager
from src.agents.agent_memory import ConversationMemory
from src.agents.tool_capabilities import tool_schemas, validate_args
from src.agents.store_information_presentation import store_reply
from src.function_calling.tools import TOOL_EXECUTORS, product_tools, cart_tools, knowledge_tools
from src.rag import rag_service


def test_return_policy_uses_actual_curated_rag_without_product_resolution(hybrid, monkeypatch):
    docs = json.loads(Path('src/rag/raw_data/ordering.json').read_text())
    monkeypatch.setattr(rag_service, 'load_all_rag_data', lambda: deepcopy(docs))
    service = rag_service.RAGService(); service.load()
    monkeypatch.setattr(rag_service, 'get_rag_service', lambda: service)
    from src.rag import product_context
    monkeypatch.setattr(product_context, 'resolve_product_context', lambda *a, **k: pytest.fail('Refund must not resolve a product'))
    result = send(hybrid, c('ASK_KNOWLEDGE', query='sao để trả hàng bên bạn nhỉ', domain='refund'),
                  text='sao để trả hàng bên bạn nhỉ')
    assert not result['error'] and result['provider_request_count'] == 1
    assert '**24 giờ**' in result['reply'] and '**trong ngày**' in result['reply']
    assert 'thay đổi quyết định' in result['reply'] and 'customerservice@highlandscoffee.com.vn' in result['reply']
    assert 'cho biết tên món' not in result['reply'] and not hybrid.writes


def test_first_turn_payment_question_has_no_checkout_gate_or_quote(hybrid, monkeypatch):
    no_cart(hybrid)
    before = deepcopy(cart_manager.get_checkout_prefs(hybrid.sid))
    monkeypatch.setattr(cart_tools, 'execute_get_cart_quote', lambda *a: pytest.fail('Informational methods do not quote a cart'))
    seen = []
    def options(sid, amount=None):
        seen.append(amount)
        return {'payment_options': [{'code':'VNPAY','label':'VNPAY','enabled':True},
            {'code':'VI_DIEN_TU','label':'Ví Avengers','enabled':False,'balance':100000,
             'reason':'Chưa xác minh được tổng thanh toán của giỏ'}]}
    monkeypatch.setattr(cart_tools, 'get_wallet_payment_options', options)
    result = send(hybrid, c('LIST_PAYMENT_OPTIONS'), text='bên bạn có các cách thức thanh toán nào vậy')
    assert not result['error'] and seen == [None]
    assert '**VNPAY**' in result['reply'] and '**Ví Avengers**' in result['reply']
    assert 'mã giảm giá' not in result['reply'] and 'chọn chi nhánh' not in result['reply']
    assert 'Chưa xác minh được tổng' not in str(result['ui_payload'])
    assert result['ui_payload']['payment_options'][-1]['enabled'] is False
    assert not hybrid.writes and {k:v for k,v in cart_manager.get_checkout_prefs(hybrid.sid).items() if k != 'processed_order_turns'} == before


def test_global_store_reviews_have_valid_tool_args_and_publish_numbered_branches(hybrid, monkeypatch):
    seen = []
    store = {'ma_chi_nhanh':'B1','ten_chi_nhanh':'Quán Một','dia_chi':'Đường A','avg_rating':4.8,'total_reviews':21}
    def ranked(args,sid):
        assert validate_args(args, next(row['function']['parameters'] for row in tool_schemas() if row['function']['name']=='get_top_rated_stores'))
        seen.append(args)
        return {'status':'ok','stores':[store],'message':'Hãy tóm tắt nội bộ'}
    monkeypatch.setitem(TOOL_EXECUTORS,'get_top_rated_stores',ranked)
    result = send(hybrid,c('READ_STORE_INFO',facet='reviews'))
    assert not result['error'] and seen == [{}] and not hybrid.writes
    assert '**4.80/5 sao**' in result['reply'] and '**21 lượt đánh giá**' in result['reply']
    assert 'nội bộ' not in result['reply']
    branches = ConversationMemory(hybrid.redis).load(hybrid.sid)['visible_snapshots']['branches']
    assert branches[0]['ma_chi_nhanh'] == 'B1' and branches[0]['display_index'] == 1
    monkeypatch.setitem(TOOL_EXECUTORS,'get_store_reviews',lambda a,s: {'status':'ok','branch_name':'Quán Một',
        'reviews':[{'rating':4,'comment':'[Dữ liệu mẫu] Hơi đông.','date':'2026-10-01'}]})
    follow = send(hybrid,c('READ_STORE_INFO',facet='reviews',target={'kind':'ordinal','index':1}))
    assert not follow['error'] and 'Hơi đông.' in follow['reply'] and '[Dữ liệu mẫu]' not in follow['reply']
    assert not hybrid.writes


def test_hours_read_actual_branch_fields_and_preserve_pending_checkout(hybrid, monkeypatch):
    cart_manager.set_pending_action(hybrid.sid,'select_voucher',{'vouchers':[]})
    before = deepcopy(cart_manager.get_checkout_prefs(hybrid.sid))
    branch = {'branch_id':'B1','branch_name':'Quán Một','address':'Đường A','opening_time':'07:00','closing_time':'23:00'}
    monkeypatch.setitem(TOOL_EXECUTORS,'get_store_info',lambda a,s: {'status':'ok','branches':[branch],
        'exact_branch':bool(a.get('branch_id'))})
    monkeypatch.setattr(knowledge_tools,'execute_search_knowledge_base',lambda **k: pytest.fail('Hours are not contact RAG'))
    generic = send(hybrid,c('READ_STORE_INFO',facet='hours'))
    assert not generic['error'] and '**23:00**' in generic['reply'] and 'hotline' not in generic['reply']
    exact = send(hybrid,c('READ_STORE_INFO',facet='hours',target={'kind':'ordinal','index':1}))
    assert not exact['error'] and '**23:00**' in exact['reply'] and 'Bạn muốn xem cửa hàng nào' not in exact['reply']
    assert not hybrid.writes and {k:v for k,v in cart_manager.get_checkout_prefs(hybrid.sid).items() if k != 'processed_order_turns'} == before


def test_store_without_hours_is_honest():
    reply = store_reply({'branches':[{'branch_name':'Kiosk Một','opening_time':None,'closing_time':None}]},'hours')
    assert 'chưa có giờ' in reply and '23:00' not in reply and '1900' not in reply


@pytest.mark.parametrize('direction,sort', [('descending','rating_desc'),('ascending','rating_asc')])
def test_rating_browse_keeps_numeric_bounds_and_visible_metrics(hybrid, monkeypatch, direction, sort):
    calls = []
    def catalog(a,s):
        calls.append(a)
        return {'status':'ok','products':[{**hybrid.products[0],'avg_rating':4.9,'total_reviews':8}],
            'ranking':'recorded_product_rating'}
    monkeypatch.setitem(TOOL_EXECUTORS,'filter_catalog',catalog)
    result = send(hybrid,c('DISCOVER_PRODUCTS',scope='drink',basis='rating',direction=direction,count=1,
        max_price=100000,max_price_inclusive=False))
    assert not result['error'] and not hybrid.writes
    assert calls[0]['sort_by'] == sort and calls[0]['max_price'] == 100000 and calls[0]['max_price_inclusive'] is False
    assert '**4.90/5 sao**' in result['reply'] and '**8 lượt đánh giá**' in result['reply']
    assert len(result['ui_payload']['products']) == 1


def test_preferences_keep_price_constraints_without_converting_to_rag_concepts(hybrid, monkeypatch):
    calls=[]
    monkeypatch.setitem(TOOL_EXECUTORS,'get_recommendations',lambda a,s: calls.append(a) or {'status':'not_found','products':[],
        'recommendation_basis':'product_description','message':'Chưa có món phù hợp.'})
    result=send(hybrid,c('RECOMMEND_PRODUCTS',scope='drink',concepts=['ngọt nhẹ'],max_price=100000,max_price_inclusive=False))
    assert not result['error'] and not hybrid.writes
    assert calls[0]['preference_concepts'] == ['ngọt nhẹ']
    assert calls[0]['max_price']==100000 and calls[0]['max_price_inclusive'] is False


def test_sql_rating_rank_shares_sellable_hierarchy_and_has_no_fallback(monkeypatch):
    statements=[]
    class Connection:
        def __enter__(self): return self
        def __exit__(self,*a): pass
        def execute(self,sql,params):
            statements.append((str(sql),params))
            return SimpleNamespace(mappings=lambda:SimpleNamespace(all=lambda:[]))
    monkeypatch.setattr(product_tools,'_get_engine',lambda:SimpleNamespace(connect=Connection))
    result=product_tools.execute_get_recommendations(criteria='rating',category='all',top_k=5,max_price=100000,max_price_inclusive=False)
    assert result['status']=='not_found' and result['products']==[] and len(statements)==1
    sql,args=statements[0]
    assert 'paths.root_name = ANY(:roots)' in sql and 'sp.gia_ban < :max_price' in sql
    assert 'AVG(so_sao)' in sql and 'COUNT(*)' in sql and 'ratings.total_reviews DESC' in sql
    assert 'ratings.avg_rating DESC' in sql and 'sp.ma_san_pham ASC' in sql
    assert 'Topping' not in args['roots'] and args['max_price']==100000


def test_description_recommendations_diversify_exact_duplicate_records_and_apply_price(monkeypatch):
    from src.function_calling.tools.description_recommendations import recommend_from_descriptions
    from test_description_recommendations import doc
    docs=[doc('113','Cà phê béo ngậy ngọt nhẹ.'),doc('116','Cà phê béo ngậy ngọt nhẹ.'),doc('other','Latte ngọt nhẹ.')]
    monkeypatch.setattr(rag_service,'get_rag_service',lambda:SimpleNamespace(lookup=lambda *a,**k:{'status':'ok','results':docs}))
    calls=[]
    def catalog(**kwargs):
        calls.append(kwargs)
        return {'status':'ok','products':[{'product_id':key,'product_name':'Cà Phê Muối Avenger' if key in {'113','116'} else 'Latte',
            'final_price':35000,'category':'Americano'} for key in ('113','116','other')]}
    monkeypatch.setattr(product_tools,'execute_filter_catalog',catalog)
    result=recommend_from_descriptions('ngọt nhẹ',max_price=100000,max_price_inclusive=False)
    assert [r['product_id'] for r in result['products']]==['113','other']
    assert [r['entity_id'] for r in result['recommendation_evidence']]==['113','other']
    assert calls[0]['max_price']==100000 and calls[0]['max_price_inclusive'] is False


def test_rating_and_preference_category_constraints_use_canonical_menu_hierarchy(menu, monkeypatch):
    rt, _ = menu
    for intent, args, tool in [('DISCOVER_PRODUCTS', {'basis':'rating'}, 'filter_catalog'),
                               ('RECOMMEND_PRODUCTS', {'concepts':['ngọt nhẹ']}, 'get_recommendations')]:
        captured=[]
        monkeypatch.setitem(TOOL_EXECUTORS,tool,lambda a,s: captured.append(a) or {'status':'ok','products':[rt.products[2]]})
        result=send(rt,c(intent,scope='drink',menu_category={'kind':'name','value':'Cà Phê'},max_price=100000,
                         max_price_inclusive=False,**args))
        assert not result['error'] and captured[0]['category_id']=='coffee'
        assert captured[0]['max_price']==100000 and captured[0]['max_price_inclusive'] is False
        assert [p['product_id'] for p in result['ui_payload']['products']]==['103'] and not rt.writes


def test_read_only_questions_preserve_confirmation_and_cannot_place_order(hybrid, monkeypatch):
    cart_manager.set_checkout_context(hybrid.sid,checkout_action_id='prior-action',payment_method='VNPAY',
        voucher_decided=True,delivery_type='TAI_CHO',branch_id='B1')
    before=deepcopy(cart_manager.get_checkout_prefs(hybrid.sid))
    monkeypatch.setitem(TOOL_EXECUTORS,'get_store_info',lambda a,s:{'status':'ok','branches':[]})
    send(hybrid,c('LIST_PAYMENT_OPTIONS'))
    send(hybrid,c('READ_STORE_INFO',facet='hours'))
    after=cart_manager.get_checkout_prefs(hybrid.sid)
    assert {k:v for k,v in after.items() if k!='processed_order_turns'}==before
    assert not hybrid.writes


def test_empty_store_refresh_invalidates_old_branch_numbers(hybrid, monkeypatch):
    from hybrid_support import visible
    visible(hybrid,branches=[{'branch_id':'old','branch_name':'Old Store','display_index':1}])
    monkeypatch.setitem(TOOL_EXECUTORS,'get_top_rated_stores',lambda a,s:{'status':'ok','stores':[],
        'message':'Chưa có cửa hàng có đánh giá cao.'})
    result=send(hybrid,c('READ_STORE_INFO',facet='reviews'))
    assert not result['error'] and 'Chưa có cửa hàng' in result['reply']
    memory=ConversationMemory(hybrid.redis).load(hybrid.sid)
    assert memory['visible_snapshots']['branches']==[] and not hybrid.writes


def test_preference_price_range_conflicts_fail_before_reads(hybrid):
    from hybrid_support import envelope
    from src.agents.hybrid_command_schema import validate_envelope
    value,error,_=validate_envelope(envelope(c('RECOMMEND_PRODUCTS',scope='drink',concepts=['ngọt nhẹ'],min_price=100000,max_price=90000)))
    assert value is None and error['failure_code']=='discovery_price_conflict' and not hybrid.reads and not hybrid.writes


def test_payment_information_with_cart_keeps_fresh_wallet_eligibility(hybrid, monkeypatch):
    cart_manager.replace_items_from_order_cart(hybrid.sid,[{**hybrid.products[0],'id':801,'quantity':1,'unit_price':30000}])
    monkeypatch.setattr(cart_tools,'execute_get_cart_quote',lambda s:{'status':'ok','quote':{'final_total':30000}})
    amounts=[]
    def methods(s, amount=None):
        amounts.append(amount)
        return {'payment_options':[{'code':'VI_DIEN_TU','label':'Ví Avengers','enabled':True,'balance':100000}]}
    monkeypatch.setattr(cart_tools,'get_wallet_payment_options',methods)
    result=send(hybrid,c('LIST_PAYMENT_OPTIONS'))
    assert not result['error'] and amounts==[30000]
    assert result['ui_payload']['payment_options'][0]['enabled'] is True
    assert 'chọn chi nhánh' not in result['reply'] and not hybrid.writes
