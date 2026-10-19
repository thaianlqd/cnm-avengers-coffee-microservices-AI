"""Bounded two-process admission/load fixture; no provider or production DB.

This qualifies job admission and CPU/RSS under the SQLite SQL adapter. It does
not measure a PostgreSQL reader pool, provider transport, or a production SLO.
"""
from concurrent.futures import ThreadPoolExecutor
import json
import math
import os
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

TARGETS=('http://127.0.0.1:18881','http://127.0.0.1:18882')
PAYLOAD={'dashboard_id':'D01','dashboard_version':'1.0.0','time':{'mode':'all_time'},'analysis_depth':'focused','refresh':True}
TERMINAL={'completed','failed','cancelled','unsupported','insufficient_data','partial_available','needs_input'}


def call(target,path,body=None,*,owner=0,key=None):
    cookie='analysis_browser='+chr(97+owner)*43
    headers={'Content-Type':'application/json','Cookie':cookie}
    if key:headers['Idempotency-Key']=key
    request=Request(target+path,headers=headers,data=None if body is None else json.dumps(body).encode())
    with urlopen(request,timeout=15) as response:
        raw=response.read(1_200_001)
        if len(raw)>1_200_000:raise ValueError('Bounded fixture response exceeded')
        return json.loads(raw)


def submit(index,owners):
    start=time.monotonic()
    try:
        record=call(TARGETS[index%2],'/api/ai/analysis-jobs',PAYLOAD,owner=index%owners,key=uuid4().hex)
        return {'owner':index%owners,'job_id':record['job_id'],'admitted':True,'submit_ms':(time.monotonic()-start)*1000,'started':start}
    except HTTPError as error:
        if error.code!=429:raise
        return {'owner':index%owners,'admitted':False,'http_status':429,'submit_ms':(time.monotonic()-start)*1000}


def finish(item):
    end=time.monotonic()+40
    while time.monotonic()<end:
        record=call(TARGETS[1],'/api/ai/analysis-jobs/'+item['job_id'],owner=item['owner'])
        if record['state'] in TERMINAL:
            assert record['state']=='completed',record.get('result',{}).get('message')
            assert record['physical_http']==record['provider_call_count']==0
            assert record['result']['status']=='success'
            return (time.monotonic()-item['started'])*1000
        time.sleep(.1)
    raise TimeoutError('Admitted fixture job did not finish')


def percentile(values,fraction):
    return round(sorted(values)[max(0,math.ceil(len(values)*fraction)-1)],3)


def run():
    if os.getenv('V35_TWO_API_FIXTURE')!='1':raise RuntimeError('Explicit isolated two-API fixture required')
    for target in TARGETS:
        deadline=time.monotonic()+60
        while True:
            try:
                call(target,'/health');break
            except OSError:
                if time.monotonic()>=deadline:raise
                time.sleep(.2)
    identities=[call(target,'/fixture/identity') for target in TARGETS]
    assert identities[0]['instance']!=identities[1]['instance']
    results=[]
    for offered in (1,4,8,12,20):
        for repeat in range(3):
            for target in TARGETS:call(target,'/fixture/hold',{'enabled':True})
            try:
                with ThreadPoolExecutor(max_workers=20) as pool:
                    offers=list(pool.map(lambda index:submit(index,5 if offered==20 else 3),range(offered)))
                admitted=[item for item in offers if item['admitted']]
                snapshot=call(TARGETS[0],'/fixture/admission')
                assert len(admitted)==min(offered,12),(offered,offers)
                assert snapshot['active']==len(admitted),snapshot
                assert all(count<=4 for count in snapshot['per_owner']),snapshot
                assert snapshot['logical_calls']==snapshot['physical_http']==0
                assert all(0<=call(target,'/fixture/admission')['local_slots_available']<=12 for target in TARGETS)
            finally:
                for target in TARGETS:call(target,'/fixture/hold',{'enabled':False})
            with ThreadPoolExecutor(max_workers=12) as pool:latencies=list(pool.map(finish,admitted))
            proof={'offered':offered,'repeat':repeat+1,'admitted':len(admitted),'rejected_429':offered-len(admitted),
                'observed_global_active':snapshot['active'],'per_owner_counts':snapshot['per_owner'],
                'completed':len(latencies),'p95_ms':percentile(latencies,.95),'p99_ms':percentile(latencies,.99),
                'provider_calls':0,'physical_http':0,'instances':[call(target,'/fixture/identity') for target in TARGETS]}
            results.append(proof);print(json.dumps({'event':'profile',**proof}),flush=True)
    # An owner at its cap cannot consume the headroom reserved for another owner.
    for target in TARGETS:call(target,'/fixture/hold',{'enabled':True})
    try:
        first=[submit(index*3,3) for index in range(5)]  # all owner zero
        second=submit(1,3)
        assert sum(item['admitted'] for item in first)==4 and second['admitted']
    finally:
        for target in TARGETS:call(target,'/fixture/hold',{'enabled':False})
    for item in [*first,second]:
        if item['admitted']:finish(item)
    proof={'event':'load_profiles_complete','version':'3.5.0','status':'passed','profiles':results,
        'owner_cap':4,'global_cap':12,'fairness_headroom':True,'external_provider_http':0,
        'limitations':['SQLite adapter; PostgreSQL reader-pool pressure is not qualified',
                      'No provider transport/crash/revocation assertion from this command',
                      'Local capacity observation; not a production SLO']}
    print(json.dumps(proof),flush=True)


if __name__=='__main__':run()
