"""P6 publication across actual processes/Redis, using the existing V35 fixture."""
import concurrent.futures
import json
import os
import time
import urllib.request
from uuid import uuid4

if os.getenv('V35_TWO_API_FIXTURE')!='1':raise RuntimeError('Isolated two-API fixture required')
targets=('http://127.0.0.1:18881','http://127.0.0.1:18882')


def request(target,path,body=None,key=None):
    headers={'Content-Type':'application/json','Cookie':'analysis_browser='+'w'*43}
    if key:headers['Idempotency-Key']=key
    req=urllib.request.Request(target+path,data=json.dumps(body).encode() if body is not None else None,headers=headers)
    with urllib.request.urlopen(req,timeout=30) as response:return json.load(response)


for target in targets:
    deadline=time.monotonic()+60
    while True:
        try:request(target,'/health');break
        except OSError:
            if time.monotonic()>=deadline:raise
            time.sleep(.2)
job=request(targets[0],'/api/ai/analysis-jobs',dict(dashboard_id='D01',dashboard_version='1.0.0',
    time={'mode':'all_time'},analysis_depth='focused'),uuid4().hex)
deadline=time.monotonic()+60
while job['state'] not in {'completed','failed','cancelled'}:
    assert time.monotonic()<deadline
    time.sleep(.1);job=request(targets[1],'/api/ai/analysis-jobs/'+job['job_id'])
assert job['state']=='completed'
report=job['result'];contract=report['interaction_contract']
payload=dict(session_id=report['session_id'],revision=report['revision'],analysis_depth=report['analysis_breadth'],
    catalog_fingerprint=contract['catalog_fingerprint'],access_fingerprint=contract['access_fingerprint'],
    filters=[],drill_path=[],refresh=True)
with concurrent.futures.ThreadPoolExecutor(2) as pool:
    results=list(pool.map(lambda target:request(target,'/api/ai/workspace-revision',payload),targets))
accepted=[r for r in results if r.get('status')=='success']
assert len(accepted)==1,[r.get('status') for r in results]
fresh=accepted[0]
assert fresh['revision']==report['revision']+1
assert fresh['interaction_contract']['revision']==fresh['revision']
assert fresh['interaction_state']==dict(filters=[],drill_path=[])
assert fresh['diagnostics']['provider_http_attempts']==0
assert set(fresh['result_sets'])=={q['id'] for q in fresh['analytical_queries']}
print(json.dumps(dict(status='passed',cross_process_workspace_publish='exactly_one_revision',
    stale_revision_rejected=True,provider_sends=0,atomic_result_set=True,revision=fresh['revision'])))
