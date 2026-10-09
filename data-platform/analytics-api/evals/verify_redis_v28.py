"""Deployment integration: temporary isolated session, no providers/warehouse."""
import json
import os
import uuid
from pathlib import Path
import redis
from services.session_service import RedisSessionStore, ReportSession, SESSION_TTL_SECONDS
from services.analysis_catalog import AnalysisError


def main():
    client=redis.Redis.from_url(os.environ['DATA_ANALYST_REDIS_URL'],decode_responses=True,socket_connect_timeout=2,socket_timeout=3)
    assert client.ping()
    a,b=RedisSessionStore(client),RedisSessionStore(client)
    id='v28-verification-'+uuid.uuid4().hex
    session=ReportSession(session_id=id,original_prompt='Offline integration fixture',owner_id='offline-verification')
    try:
        a.save(session,create=True)
        assert 0 < client.ttl(a.key(id)) <= SESSION_TTL_SECONDS
        one,two=a.get(id),b.get(id)
        assert one.owner_id==two.owner_id=='offline-verification'
        with one.analysis_lock:
            one.revision=2;a.save(one)
        for action in (lambda:b.save(two),lambda:two.analysis_lock.__enter__()):
            try:action()
            except AnalysisError as e:assert e.category=='stale_approval'
            else:raise AssertionError('Stale version accepted')
        current=b.get(id);assert current.revision==2
        current.owner_id='different-owner'
        try:b.save(current)
        except AnalysisError as e:assert e.category=='stale_approval'
        else:raise AssertionError('Owner mutation accepted')
        assert a.get(id).owner_id=='offline-verification'
        checks={'redis_ping':True,'cross_replica_restore':True,'ttl_verified':True,'atomic_cas_verified':True,
                'stale_lock_verified':True,'owner_immutable':True,'temporary_session_deleted':True,
                'provider_calls':0,'warehouse_mutations':0}
    finally:
        a.delete(id)
        assert client.get(a.key(id)) is None
    out=Path('/app/evals/v28-artifacts');out.mkdir(exist_ok=True)
    (out/'redis_verification.json').write_text(json.dumps(checks,indent=2)+'\n')
    print(json.dumps(checks))


if __name__=='__main__':main()
