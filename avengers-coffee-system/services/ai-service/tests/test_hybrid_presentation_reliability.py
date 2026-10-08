"""Offline regressions for the 23:23–23:35 customer demo, including actual read adapters."""
from copy import deepcopy
from datetime import datetime
from types import SimpleNamespace
import pytest
from hybrid_support import runtime, hybrid, send, command as c, envelope, visible
from src.common import cart_manager
from src.agents.agent_memory import ConversationMemory
from src.agents.hybrid_command_schema import validate_envelope
from src.agents.product_information_presentation import collection_reviews_reply, review_text
from src.function_calling.tools import TOOL_EXECUTORS, branch_tools, store_information_tools, product_review_tools


def test_five_visible_reviews_use_one_id_scoped_read_without_dropping_last_product(hybrid, monkeypatch):
    products = [{**hybrid.products[0], 'product_id': str(i), 'product_name': f'Món {i}', 'display_index': i} for i in range(1,6)]
    visible(hybrid, products=products)
    calls = []
    def reviews(args, sid):
        calls.append(args)
        return {'status': 'ok', 'reviewed_products': [{**r, 'avg_rating':4.5, 'total_reviews':20,
            'reviews':[{'rating':5, 'comment':f'[Dữ liệu mẫu] Nhận xét {r["product_id"]}'}]} for r in products]}
    monkeypatch.setitem(TOOL_EXECUTORS, 'get_products_reviews', reviews)
    before = deepcopy(cart_manager.get_cart(hybrid.sid))
    result = send(hybrid, c('READ_PRODUCT_INFO', facet='reviews', all_visible=True))
    assert not result['error'] and calls == [{'product_ids':['1','2','3','4','5']}]
    assert all(f'**Món {i}**' in result['reply'] for i in range(1,6))
    assert 'Nhận xét 5' in result['reply'] and '[Dữ liệu mẫu]' not in result['reply']
    assert result['provider_request_count'] == 1 and not hybrid.writes
    assert {k:v for k,v in before.items() if k!='checkout_prefs'} == {k:v for k,v in cart_manager.get_cart(hybrid.sid).items() if k!='checkout_prefs'}
    assert [r['product_id'] for r in ConversationMemory(hybrid.redis).load(hybrid.sid)['visible_snapshots']['products']] == ['1','2','3','4','5']


def test_explicit_review_subset_uses_frozen_ordinals_after_same_turn_browse(hybrid, monkeypatch):
    visible(hybrid, products=hybrid.products[:2])
    calls=[]
    monkeypatch.setitem(TOOL_EXECUTORS, 'get_products_reviews', lambda a,s: calls.append(a) or {'status':'ok', 'reviewed_products':[]})
    result=send(hybrid,c('DISCOVER_PRODUCTS',scope='food'),c('READ_PRODUCT_INFO',facet='reviews',targets=[{'kind':'ordinal','index':2},{'kind':'ordinal','index':1}]))
    assert not result['error'] and calls == [{'product_ids':['102','101']}]
    assert not hybrid.writes


@pytest.mark.parametrize('args', [dict(facet='description',all_visible=True),dict(facet='reviews'),
    dict(facet='reviews',all_visible=True,target={'kind':'focus'}),dict(facet='reviews',targets=[]),
    dict(facet='reviews',targets=[{'kind':'ordinal','index':0}])])
def test_plural_review_contract_rejects_ambiguous_or_non_review_shapes(args):
    assert validate_envelope(envelope(c('READ_PRODUCT_INFO',**args)))[1]


def test_duplicate_review_targets_fail_before_provider(hybrid,monkeypatch):
    visible(hybrid,products=hybrid.products[:1])
    monkeypatch.setitem(TOOL_EXECUTORS,'get_products_reviews',lambda *a:pytest.fail('Duplicate IDs must be refused'))
    result=send(hybrid,c('READ_PRODUCT_INFO',facet='reviews',targets=[{'kind':'ordinal','index':1}]*2))
    assert result['error'] and not hybrid.writes


def test_summary_limits_comments_but_explicit_detail_keeps_distribution_and_dates():
    raw={'status':'ok','reviewed_products':[{'product_name':'Món Một','total_reviews':20,'avg_rating':4.5,
        'rating_distribution':{'5':10,'4':10},'reviews':[{'rating':5,'created_at':'2026-10-08',
            'comment':f'[Dữ liệu mẫu] Bình luận {i}'} for i in range(5)]}]}
    summary=collection_reviews_reply(raw); detail=collection_reviews_reply(raw,detailed=True)
    assert 'Bình luận 1' in summary and 'Bình luận 2' not in summary
    assert 'Bình luận 4' in detail and '5★: 10' in detail and '2026-10-08' in detail
    assert '[Dữ liệu mẫu]' not in detail and raw['reviewed_products'][0]['reviews'][0]['comment'].startswith('[Dữ liệu mẫu]')
    assert review_text('[Dữ liệu mẫu] Vị trà: hơi ngọt.') == 'Vị trà: hơi ngọt.'
    assert review_text('[Khác] Nội dung') == '[Khác] Nội dung'


@pytest.mark.parametrize('purpose',[None,'nearby_branches'])
@pytest.mark.parametrize('fulfillment',[None,'MANG_DI','TAI_CHO','GIAO_TAN_NOI'])
def test_duplicate_location_then_unscoped_stores_reuses_list_and_preserves_checkout(hybrid, monkeypatch, fulfillment, purpose):
    area='Quận Tân Phú'
    branches=[{'branch_id':f'TP{i}','branch_name':f'Quán Tân Phú {i}', 'address':f'{i} Đường A, Quận Tân Phú, TP.HCM'} for i in range(1,6)]
    calls=[]
    def nearest(**kw):
        calls.append(kw)
        return {'status':'ok','branches':deepcopy(branches), 'message':'Dạ, mình gửi bạn các chi nhánh để lựa chọn nhé.'}
    monkeypatch.setattr(branch_tools,'execute_find_nearest_branch',nearest)
    monkeypatch.setitem(TOOL_EXECUTORS,'get_store_info',lambda *a:pytest.fail('Must not perform unrelated global read'))
    if fulfillment:
        cart_manager.set_checkout_prefs(hybrid.sid,delivery_type=fulfillment)
        cart_manager.set_branch(hybrid.sid,'SELECTED','Quán đã chọn')
    before=deepcopy(cart_manager.get_checkout_prefs(hybrid.sid)); cart_before=deepcopy(cart_manager.get_cart(hybrid.sid))
    result=send(hybrid,c('PROVIDE_LOCATION',value=area,kind='area',**({'purpose':purpose} if purpose else {})),c('READ_STORE_INFO',facet='branches',count=5))
    assert not result['error'] and len(calls)==1
    assert calls[0]['session_id']=='' and calls[0]['cart_items'] is None
    assert result['reply'].count('Quán Tân Phú 1')==1
    assert [b['branch_id'] for b in result['ui_payload']['branches']] == [b['branch_id'] for b in branches]
    assert {k:v for k,v in cart_manager.get_checkout_prefs(hybrid.sid).items() if k!='processed_order_turns'} == before
    assert {k:v for k,v in cart_manager.get_cart(hybrid.sid).items() if k!='checkout_prefs'} == {k:v for k,v in cart_before.items() if k!='checkout_prefs'}
    assert not hybrid.writes
    review_calls=[]
    monkeypatch.setitem(TOOL_EXECUTORS,'get_store_reviews',lambda a,s:review_calls.append(a) or {'status':'ok','branch_name':'Quán Tân Phú 1','reviews':[]})
    follow=send(hybrid,c('READ_STORE_INFO',facet='reviews',target={'kind':'ordinal','index':1}))
    assert not follow['error'] and review_calls==[{'branch_id':'TP1'}]
    assert '**Quán Tân Phú 1**' in follow['reply'] and 'không ạ?' in follow['reply']


def test_direct_area_request_passes_count_and_scoped_area_only(hybrid,monkeypatch):
    calls=[]
    monkeypatch.setitem(TOOL_EXECUTORS,'get_store_info',lambda a,s:calls.append(a) or {'status':'ok','area':a['area'],
        'branches':[{'branch_id':'TP1','branch_name':'Quán Tân Phú','address':'Quận Tân Phú'}]})
    result=send(hybrid,c('READ_STORE_INFO',facet='branches',query='Quận Tân Phú',count=5))
    assert not result['error'] and calls==[{'area':'Quận Tân Phú','limit':5}]
    assert '**Quận Tân Phú**' in result['reply'] and not hybrid.writes


def fake_connection(rows, calls):
    class Connection:
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def execute(self,sql,args):
            calls.append((str(sql),args))
            return SimpleNamespace(mappings=lambda:SimpleNamespace(all=lambda:rows.pop(0)))
    return SimpleNamespace(connect=Connection)


def test_store_provider_filters_admin_area_without_global_fallback(monkeypatch):
    rows=[[{'branch_id':'TP','branch_name':'Quán Tân Phú','address':'1 A, Phường Phú Trung, Quận Tân Phú, TP.HCM'},
        {'branch_id':'Q12','branch_name':'Quán Quận 12','address':'1 A, Quận 12, TP.HCM'},
        {'branch_id':'WARD','branch_name':'Phường Tân Phú','address':'1 A, Phường Tân Phú, Quận 7, TP.HCM'}]]
    calls=[];monkeypatch.setattr(store_information_tools,'_get_engine',lambda:fake_connection(rows,calls))
    result=store_information_tools.execute_get_store_info(area='Quận Tân Phú',limit=5)
    assert result['status']=='ok' and [r['branch_id'] for r in result['branches']]==['TP']
    assert result['requested_count']==5 and result['area']=='Quận Tân Phú'
    assert len(calls)==1 and 'SELECT' in calls[0][0]


def test_batch_provider_preserves_order_raw_seed_comments_and_zero_reviews(monkeypatch):
    rows=[[{'product_id':'2','product_name':'Món Hai'},{'product_id':'1','product_name':'Món Một'}],
          [{'product_id':'1','avg_rating':4.5,'total_reviews':2,'r5':1,'r4':1,'r3':0,'r2':0,'r1':0}],
          [{'product_id':'1','rating':5,'comment':'[Dữ liệu mẫu] Ngon.','created_at':datetime(2026,10,8)}]]
    calls=[];monkeypatch.setattr(product_review_tools,'_get_engine',lambda:fake_connection(rows,calls))
    result=product_review_tools.execute_get_products_reviews(['1','2'])
    assert result['status']=='ok' and [r['product_id'] for r in result['reviewed_products']]==['1','2']
    assert result['reviewed_products'][0]['reviews'][0]['comment']=='[Dữ liệu mẫu] Ngon.'
    assert result['reviewed_products'][1]['total_reviews']==0
    assert result['reviewed_products'][0]['reviews'][0]['created_at']=='2026-10-08T00:00:00'
    assert len(calls)==3 and all(a['ids']==['1','2'] for _,a in calls)
    assert all('SELECT' in sql and not any(word in sql for word in ('UPDATE ','DELETE ','INSERT ')) for sql,_ in calls)
    assert 'PARTITION BY' in calls[2][0] and 'position <= 5' in calls[2][0]


@pytest.mark.parametrize('markdown',[False,True])
@pytest.mark.parametrize('detailed',[False,True])
def test_long_collection_retains_all_sixteen_names_inside_response_budget(detailed,markdown):
    rows=[{'product_name':f'Món {i} '+('*' if markdown else 'a')*100,'avg_rating':4.5,'total_reviews':21,
        'rating_distribution':{'5':10,'4':8,'3':3,'2':0,'1':0},
        'reviews':[{'rating':5,'created_at':'2026-10-08','comment':'[Dữ liệu mẫu] '+('**ngon** ' if markdown else 'ngon ')*500} for _ in range(5)]} for i in range(1,17)]
    reply=collection_reviews_reply({'reviewed_products':rows},detailed=detailed)
    assert len(reply)<8000
    assert all(f'**Món {i} ' in reply for i in range(1,17))
    assert '[Dữ liệu mẫu]' not in reply
