"""Opt-in against the existing Redis; touches only a random conversation key."""
import os
import time
from uuid import uuid4
import pytest
from src.agents.agent_memory import ConversationMemory, empty_memory, redis_client


@pytest.mark.skipif(os.getenv('AI_AGENT_REDIS_INTEGRATION') != '1', reason='explicit existing-Redis integration only')
def test_real_redis_ttl_reset_and_unavailable_degradation(monkeypatch):
    session_id='lan20-integration-'+uuid4().hex
    monkeypatch.setenv('AI_AGENT_MEMORY_TTL','1')
    client=redis_client()
    assert client.ping()
    store=ConversationMemory(client)
    try:
        assert store.save(session_id,{**empty_memory(),'recent_turns':[{'role':'user','content':'Integration fixture'}]})
        assert client.ttl(store.key(session_id)) in {0,1}
        assert store.load(session_id)['recent_turns']
        time.sleep(1.1)
        assert not store.load(session_id)['recent_turns']
        assert store.save(session_id,empty_memory()) and store.reset(session_id)
        assert not client.exists(store.key(session_id))
    finally:
        store.reset(session_id)
    import redis
    offline=ConversationMemory(redis.Redis(host='127.0.0.1',port=1,socket_connect_timeout=.1,socket_timeout=.1))
    assert not offline.load(session_id)['recent_turns'] and not offline.available
