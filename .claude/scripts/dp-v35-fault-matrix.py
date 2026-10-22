"""Supervise task-owned two-process HTTP/Redis/PostgreSQL fault fixtures only."""
import concurrent.futures
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import queue
import sys
import time
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get('V35_FAULT_EVIDENCE_PATH', str(ROOT/'data-platform/evaluation/v35/implementation-20261019/two-api-fault-matrix.json')))
CLIENT = """import json,sys,urllib.request,urllib.error
def send(v):
 if v['target'] not in [18881,18882] or not v['path'].startswith(('/api/ai/','/fixture/','/health')):raise RuntimeError('Fixed fixture targets only')
 h={'Content-Type':'application/json','Cookie':'analysis_browser='+'a'*43}
 if v.get('key'):h['Idempotency-Key']=v['key']
 if v.get('actor'):h['X-V35-Account']=v['actor']
 r=urllib.request.Request('http://127.0.0.1:'+str(v['target'])+v['path'],headers=h,data=json.dumps(v['body']).encode() if v.get('body') is not None else None)
 try:
  with urllib.request.urlopen(r,timeout=8) as response:return {'status':response.status,'data':json.loads(response.read(1200000))}
 except urllib.error.HTTPError as error:return {'status':error.code,'data':{}}
 except Exception as error:return {'status':0,'error':type(error).__name__}
for line in sys.stdin:
 print(json.dumps(send(json.loads(line))),flush=True)
"""
clients=queue.Queue()
for _ in range(4):
 clients.put(subprocess.Popen(['docker','exec','-i','v35-fixture-api-b','python','-u','-c',CLIENT],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True))

def http(target,path,body=None,key=None,actor=None):
    process=clients.get()
    try:
        process.stdin.write(json.dumps(dict(target=target,path=path,body=body,key=key,actor=actor))+'\n');process.stdin.flush()
        line=process.stdout.readline()
        if not line:raise RuntimeError('Persistent fixture client stopped')
        return json.loads(line)
    finally:clients.put(process)

def ok(target,path,body=None,key=None,actor=None):
    reply=http(target,path,body,key,actor)
    assert reply['status'] in {200,202},(path,reply)
    return reply['data']

def wait_for(probe,predicate,seconds=12):
    deadline=time.monotonic()+seconds
    while time.monotonic()<deadline:
        value=probe()
        if predicate(value):return value
        time.sleep(.04)
    raise AssertionError('Fixture condition did not become true: '+str(value)[:200])

def start_a():
    subprocess.run([str(ROOT/'.claude/scripts/dp-v35-two-api.sh'),'start-a'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
    wait_for(lambda:http(18881,'/health'),lambda reply:reply['status']==200,20)

payload={'question':'Doanh thu tháng 9 năm 2026','analysis_depth':'focused','analysis_scope':{'mode':'all','filters':[]},'refresh':True}
actor='v35-actor'
proof={'version':'3.5.0','observed_at':datetime.now(timezone.utc).isoformat(),'status':'running','crash_windows':[],
       'external_provider_http':0,'fixture_transport':'real loopback HTTP meter on API B','postgres':'fixed disposable 127.0.0.1:5432/postgres'}
def record():OUT.write_text(json.dumps(proof,indent=2)+'\n')
def scenario(stage):
    identity=uuid4().hex
    ok(18882,'/fixture/scenario',{'stage':stage,'run_id':identity})
    return identity

def submit():return ok(18881,'/api/ai/analysis-jobs',payload,uuid4().hex,actor)
def job(identity):return ok(18882,'/api/ai/analysis-jobs/'+identity,actor=actor)
def observe(run):return ok(18882,'/fixture/observation/'+run)
terminal={'completed','failed','cancelled','needs_input','partial_available','insufficient_data','unsupported'}
if '--resume' in sys.argv:
    previous=json.loads(OUT.read_text())
    assert [value['stage'] for value in previous['crash_windows']]==['claimed','reserved','sent','sql','persist']
    proof['crash_windows']=previous['crash_windows']
    proof['preserved_crash_observation_at']=previous['observed_at']

record()  # A failed cold start must not leave a historical PASS as this run's proof.
try:
    for target in [18881,18882]:wait_for(lambda:http(target,'/health'),lambda reply:reply['status']==200,60)
    for stage in ([] if '--resume' in sys.argv else ['claimed','reserved','sent','sql','persist']):
        run=scenario(stage); key=uuid4().hex
        submitted=ok(18881,'/api/ai/analysis-jobs',payload,key,actor)
        observed=wait_for(lambda:observe(run),lambda value:value['hit']==stage and (stage!='sql' or value['sql_sleeping']>0))
        ok(18882,'/fixture/deadline',{'job_id':submitted['job_id']})
        crashed=http(18881,'/fixture/crash',{})
        assert crashed['status']==0,crashed
        ok(18882,'/fixture/scenario',{'stage':None})
        reconnected=ok(18882,'/api/ai/analysis-jobs',payload,key,actor)
        assert reconnected['job_id']==submitted['job_id']
        final=wait_for(lambda:job(submitted['job_id']),lambda value:value['state'] in terminal)
        assert final['state']=='failed',(stage,final['state'])
        meter=observe(run)
        expected=0 if stage in {'claimed','reserved'} else 1
        assert meter['sends']==expected,(stage,meter)
        assert final['physical_http']==(0 if stage=='claimed' else 1),(stage,final['physical_http'])
        assert ok(18882,'/fixture/stale-finish',{'job_id':final['job_id']})['unchanged']
        proof['crash_windows'].append({'stage':stage,'same_job_on_reconnect':True,'state':final['state'],
            'physical_reservations':final['physical_http'],'metered_sends':meter['sends'],'stale_finish_refused':True,
            'pool_max':meter['pool_max']})
        record();print(json.dumps({'crash_window':stage,'passed':True}),flush=True)
        start_a()
    # Cancellation from the other process must cancel PostgreSQL, not merely mark a job.
    run=scenario('sql'); submitted=submit()
    wait_for(lambda:observe(run),lambda value:value['sql_sleeping']>0)
    started=time.monotonic();ok(18882,'/api/ai/analysis-jobs/'+submitted['job_id']+'/cancel',{},actor=actor)
    wait_for(lambda:observe(run),lambda value:value['sql_sleeping']==0,3)
    elapsed=time.monotonic()-started
    assert elapsed<=2,elapsed
    assert job(submitted['job_id'])['state']=='cancelled'
    proof['postgres_cancel']={'status':'passed','seconds':round(elapsed,3),'cross_process':True,'actual_pg_sleep_cancelled':True}
    record();print(json.dumps({'postgres_cancel_seconds':elapsed}),flush=True)
    # Revocation before send, query, publication and while PostgreSQL is sleeping.
    proof['revocation']=[]
    for stage in ['before_send','before_sql','persist','sql']:
        run=scenario(stage); submitted=submit()
        wait_for(lambda:observe(run),lambda value:value['hit']==stage and (stage!='sql' or value['sql_sleeping']>0))
        started=time.monotonic();ok(18882,'/fixture/revoke',{})
        if stage=='sql':
            wait_for(lambda:observe(run),lambda value:value['sql_sleeping']==0,3)
            assert time.monotonic()-started<=2
        ok(18882,'/fixture/release',{'run_id':run})
        assert http(18882,'/api/ai/analysis-jobs/'+submitted['job_id'],actor=actor)['status']==403
        wait_for(lambda:ok(18882,'/fixture/job/'+submitted['job_id']),lambda value:value['state'] in terminal)
        # Restore only the fixture policy so the owner can inspect terminal failure.
        ok(18882,'/fixture/scenario',{'stage':None})
        final=wait_for(lambda:job(submitted['job_id']),lambda value:value['state'] in terminal)
        assert final['state']!='completed',stage
        meter=observe(run)
        assert meter['sends']==(0 if stage=='before_send' else 1),(stage,meter)
        proof['revocation'].append({'stage':stage,'state':final['state'],'metered_sends':meter['sends'],'denied_while_revoked':True})
        record();print(json.dumps({'revocation':stage,'passed':True}),flush=True)
    run=scenario('ceiling'); submitted=submit()
    final=wait_for(lambda:job(submitted['job_id']),lambda value:value['state'] in terminal)
    measured=observe(run)
    assert final['state']=='failed' and measured['sends']==3 and final['physical_http']==3,(final,measured)
    proof['physical_ceiling']={'offers':4,'physical_reservations':3,'metered_sends':3,'fourth_send_refused':True}
    ok(18882,'/fixture/scenario',{'stage':None})
    ok(18882,'/fixture/circuit',{'action':'open'})
    with concurrent.futures.ThreadPoolExecutor(8) as pool:
        plans=list(pool.map(lambda index:ok([18881,18882][index%2],'/fixture/circuit',{'action':'plan'}),range(16)))
    assert sum(value.get('slot')=='primary' for value in plans)==1,plans
    assert sum(value.get('slot')=='secondary' for value in plans)==15,plans
    proof['shared_half_open']={'offers':16,'primary_probes':1,'secondary_routes':15,'instances':2,'provider_sends':0}
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        pressures=list(pool.map(lambda target:ok(target,'/fixture/pool-pressure',{}),[18881,18882]))
    assert all(value['connections']==6 and value['exhausted_typed'] and value['pool_used_after']==0 for value in pressures),pressures
    proof['reader_pressure']={'instances':2,'per_instance':pressures,'actual_postgres_connections':True}
    for target in [18881,18882]:ok(target,'/fixture/hold',{'enabled':True})
    task={'dashboard_id':'D01','dashboard_version':'1.0.0','time':{'mode':'all_time'},'refresh':True}
    first=ok(18881,'/api/ai/analysis-jobs',task,uuid4().hex,actor)
    second_key=uuid4().hex
    second=ok(18882,'/api/ai/analysis-jobs',task,second_key,actor)
    ok(18881,'/fixture/drain',{})
    ok(18882,'/fixture/hold',{'enabled':False})
    assert wait_for(lambda:job(first['job_id']),lambda value:value['state'] in terminal)['state']=='cancelled'
    completed=wait_for(lambda:job(second['job_id']),lambda value:value['state'] in terminal)
    assert completed['state']=='completed' and completed['physical_http']==0,completed['state']
    proof['drain']={'own_job_cancelled':True,'other_instance_completed':True,'provider_sends':0}
    subprocess.run(['docker','pause','avengers-v34-fixture-redis-1'],check=True,stdout=subprocess.DEVNULL)
    try:
        unavailable=http(18882,'/api/ai/analysis-jobs/'+second['job_id'])
        assert unavailable['status']==503,unavailable
        circuit=ok(18882,'/fixture/circuit',{'action':'plan'})
        assert circuit.get('error')=='provider_unavailable',circuit
    finally:
        subprocess.run(['docker','unpause','avengers-v34-fixture-redis-1'],check=True,stdout=subprocess.DEVNULL)
    after=ok(18882,'/api/ai/analysis-jobs',task,second_key,actor)
    assert after['job_id']==second['job_id'] and after['physical_http']==0
    proof['redis_outage']={'http_status':503,'provider_refused':True,'same_job_after_reconnect':True,'no_memory_fallback':True}
    proof['status']='passed';record();print(json.dumps({'fault_matrix':'passed'}),flush=True)
except Exception as error:
    proof.update(status='failed',failure_type=type(error).__name__,failure=str(error)[:400]);record();raise

finally:
    while not clients.empty():
        process=clients.get()
        try:process.stdin.close();process.wait(timeout=2)
        except Exception:process.terminate()
