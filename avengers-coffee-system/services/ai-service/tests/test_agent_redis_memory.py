import json
import pytest
from src.agents.agent_memory import ConversationMemory, empty_memory
from test_llm_tool_orchestrator import FakeRedis


def test_save_load_ttl_reset_and_owner_scoping(monkeypatch):
    monkeypatch.setenv('AI_AGENT_MEMORY_TTL','321')
    redis=FakeRedis();store=ConversationMemory(redis)
    data={**empty_memory(),'recent_turns':[{'role':'user','content':'Hello'}]}
    assert store.save('customer:conversation:first',data)
    assert store.load('customer:conversation:first')['recent_turns']==data['recent_turns']
    assert not store.load('other:conversation:first')['recent_turns']
    import time
    assert 320<=redis.expiry[store.key('customer:conversation:first')]-time.time()<=321
    redis.expiry[store.key('customer:conversation:first')]=0
    assert not store.load('customer:conversation:first')['recent_turns']
    store.save('customer:conversation:first',data)
    assert store.reset('customer:conversation:first') and not store.load('customer:conversation:first')['recent_turns']


def test_bounded_history_snapshots_focus_and_no_authoritative_cart(monkeypatch):
    redis=FakeRedis();store=ConversationMemory(redis)
    data={**empty_memory(),'recent_turns':[{'role':'user','content':'x'*2000}]*100,
        'cart':{'quantity':999},'authorization':'Bearer secret-value','api_key':'secret-value',
        'visible_snapshots':{'products':[{'product_id':str(i),'product_name':'P','jwt':'secret-value'} for i in range(100)]},
        'focus':{'product':{'product_id':'1','product_name':'P','source':'tool','unit_price':999}}}
    store.save('s',data);result=store.load('s')
    assert len(result['recent_turns'])==16 and len(result['visible_snapshots']['products'])==16
    assert 'cart' not in result and 'unit_price' not in result['focus']['product']
    assert 'secret-value' not in redis.get(store.key('s'))


@pytest.mark.parametrize('kind,row',[('branches',{'branch_id':'b','branch_name':'B'}),
    ('vouchers',{'ma_voucher':'V'}),('location_candidates',{'candidate_id':'c','lat':1,'lng':2}),
    ('payment_options',{'value':'COD','enabled':True})])
def test_snapshot_refresh_and_compact_all_namespaces(kind,row):
    store=ConversationMemory(FakeRedis())
    store.save('s',{**empty_memory(),'visible_snapshots':{kind:[row]*100}})
    assert len(store.load('s')['visible_snapshots'][kind])==5
    store.save('s',{**empty_memory(),'visible_snapshots':{kind:[]}})
    assert store.load('s')['visible_snapshots'][kind]==[]


def test_jwt_and_environment_secrets_redacted(monkeypatch):
    monkeypatch.setenv('SYNTHETIC_API_KEY','synthetic-sensitive-value')
    redis=FakeRedis();store=ConversationMemory(redis)
    store.save('s',{**empty_memory(),'recent_turns':[{'role':'user','content':'Bearer abcdefg eyJaaaa.bbbbb.ccccc synthetic-sensitive-value password=abc'}]})
    raw=redis.get(store.key('s'))
    assert all(secret not in raw for secret in ['abcdefg','eyJaaaa','synthetic-sensitive-value','password=abc'])


def test_redis_unavailable_graceful():
    class Offline:
        def __getattr__(self,key):
            raise ConnectionError('offline')
    store=ConversationMemory(Offline())
    assert not store.load('s')['recent_turns'] and not store.available
    assert not store.save('s',{}) and not store.reset('s')


def test_payment_and_branch_snapshots_keep_canonical_ordinals():
    from src.agents.agent_memory import ConversationMemory
    bounded=ConversationMemory.bounded({'visible_snapshots':{
        'payment_options':[{'code':'VNPAY','label':'VNPAY','enabled':True,'display_index':1,'balance':999}],
        'branches':[{'branch_id':'canonical-branch','display_index':2}]}})
    assert bounded['visible_snapshots']['payment_options'][0]['code']=='VNPAY'
    assert bounded['visible_snapshots']['payment_options'][0]['display_index']==1
    assert 'balance' not in bounded['visible_snapshots']['payment_options'][0]
    assert bounded['visible_snapshots']['branches'][0]['display_index']==2


def test_bare_provider_keys_and_each_configured_key_are_redacted(monkeypatch):
    from src.agents.agent_memory import safe_text
    monkeypatch.setenv('GROQ_API_KEY','fixture-one-abcdefgh,fixture-two-abcdefgh')
    text=safe_text('fixture-one-abcdefgh fixture-two-abcdefgh sk-proj-ABCDEFGHIJKLMNOPQRSTUV')
    assert 'fixture-one' not in text and 'fixture-two' not in text and 'sk-proj-' not in text
