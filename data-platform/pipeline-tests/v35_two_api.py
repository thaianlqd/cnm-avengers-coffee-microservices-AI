"""HTTP/Redis process proof; runs inside network-none PostgreSQL fixture namespace."""
import concurrent.futures
import json
import os
from pathlib import Path
import statistics
import time
import urllib.error
import urllib.request
from uuid import uuid4

if os.getenv('V35_TWO_API_FIXTURE')!='1':raise RuntimeError('Explicit two-API fixture required')
TARGETS=('http://127.0.0.1:18881','http://127.0.0.1:18882')
COOKIE='analysis_browser='+'a'*43

def request(target,path,body=None,key=None,cookie=COOKIE):
    headers={'Content-Type':'application/json','Cookie':cookie}
    if key:headers['Idempotency-Key']=key
    req=urllib.request.Request(target+path,data=json.dumps(body).encode() if body is not None else None,headers=headers)
    with urllib.request.urlopen(req,timeout=10) as response:
        data=response.read(1_200_001)
        if len(data)>1_200_000:raise RuntimeError('Fixture response exceeds bound')
        return json.loads(data) if response.headers.get_content_type()=='application/json' else data.decode()

def await_job(target,identity):
    end=time.monotonic()+30
    while time.monotonic()<end:
        record=request(target,'/api/ai/analysis-jobs/'+identity)
        if record['state'] in {'completed','failed','cancelled','unsupported','insufficient_data','partial_available','needs_input'}:return record
        time.sleep(.05)
    raise TimeoutError('Fixture job deadline exceeded')

# Cold container imports are outside the measured scenario, bounded to60s.
for target in TARGETS:
    deadline=time.monotonic()+60
    while True:
        try:
            request(target,'/health');break
        except OSError:
            if time.monotonic()>=deadline:raise
            time.sleep(.2)

identities=[request(target,'/fixture/identity') for target in TARGETS]
assert identities[0]['pid']!=identities[1]['pid'] or identities[0]['instance']!=identities[1]['instance']
payload={'dashboard_id':'D01','dashboard_version':'1.0.0','time':{'mode':'all_time'},'analysis_depth':'focused'}
key=uuid4().hex
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    duplicates=list(pool.map(lambda target:request(target,'/api/ai/analysis-jobs',payload,key),TARGETS))
assert duplicates[0]['job_id']==duplicates[1]['job_id']
completed=await_job(TARGETS[1],duplicates[0]['job_id'])
assert completed['state']=='completed', completed.get('result',{}).get('message')
assert completed['provider_call_count']==0 and completed['physical_http']==0
report=completed['result']
query_id=next(iter(report['result_sets']))
page=request(TARGETS[1],f'/api/ai/sessions/{report["session_id"]}/results/{query_id}')
assert page['rows'] and page['revision']==report['revision']
try:
    request(TARGETS[1],'/api/ai/analysis-jobs/'+completed['job_id'],cookie='analysis_browser='+'b'*43)
    raise AssertionError('Cross-owner job leaked')
except urllib.error.HTTPError as error:assert error.code==404
request(TARGETS[0],'/fixture/hold',{'enabled':True})
slow=request(TARGETS[0],'/api/ai/analysis-jobs',payload,uuid4().hex)
request(TARGETS[1],'/api/ai/analysis-jobs/'+slow['job_id']+'/cancel',{})
request(TARGETS[0],'/fixture/hold',{'enabled':False})
assert await_job(TARGETS[1],slow['job_id'])['state']=='cancelled'
# Every HTTP instance exposes its own process counters. Scrape values never
# claim provider sends or duplicate a shared health gauge by summation.
scrapes=[request(target,'/metrics') for target in TARGETS]
assert all('analytics_events_total' in value for value in scrapes)
proof={'version':'3.5.0','topology':identities,'duplicate_same_job':True,'cross_process_artifact':True,
       'cross_owner_denied':True,'cross_process_cancel':True,'external_http':0,
       'provider_call_count':completed['provider_call_count'],'physical_http':completed['physical_http'],
       'job_id':completed['job_id'],'session_id':report['session_id'],'status':'passed',
       'limitations':['Fixture SQLite SQL adapter; no deployed dual-API traffic claim','Crash/15-minute soak not covered by this command']}
print(json.dumps(proof))

version=request(TARGETS[0],'/fixture/session-version/'+report['session_id'])['version']
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    cas=list(pool.map(lambda target:request(target,'/fixture/session-cas',{
        'session_id':report['session_id'],'expected_version':version}),TARGETS))
assert sorted(item['status'] for item in cas)==['saved','stale_approval'],cas
request(TARGETS[0],'/fixture/hold',{'enabled':True})
crash_key=uuid4().hex
crashed=request(TARGETS[0],'/api/ai/analysis-jobs',{**payload,'refresh':True},crash_key)
reserved=request(TARGETS[0],'/fixture/reserve-before-crash',{'job_id':crashed['job_id']})
try:request(TARGETS[0],'/fixture/crash',{})
except Exception:pass
reconnected=request(TARGETS[1],'/api/ai/analysis-jobs',{**payload,'refresh':True},crash_key)
assert reconnected['job_id']==crashed['job_id']
expired=await_job(TARGETS[1],crashed['job_id'])
assert expired['state']=='failed' and expired['physical_http']==1,expired
proof.update(session_cas='exactly_one_save',crash_reservation_retained=True,
    crash_job_id=crashed['job_id'],crash_physical_http=expired['physical_http'],
    injected_fault=reserved['fault'],limitations=['Fixture SQLite SQL adapter; no deployed dual-API traffic claim','15-minute soak not covered by this command'])
print(json.dumps(proof))
