import datetime, json, os, subprocess, time
from pathlib import Path
base=Path('/tmp/avengers-k8s-capacity'); first=base/'20261013T172918.546314Z-final-logger-search-500'
plan={'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'max_additional_runs':3,'method':'Confirm 500 directly; 500-to-1000 resolution is 500 VU. If inconsistent, confirm 250. No threshold changes or retry-until-pass.','attempts':[],'stop_reason':None}
output=base/'regression/final-search.json'
def save(): output.write_text(json.dumps(plan,indent=2)+'\n')
def completed(folder):
    meta=folder/'metadata.json'; result=folder/'result.json'
    return meta.exists() and result.exists() and json.loads(meta.read_text()).get('finished_at')
def add(folder):
    meta=json.loads((folder/'metadata.json').read_text()); result=json.loads((folder/'result.json').read_text())
    if meta.get('gateway_policy')!={'GATEWAY_REQUEST_LOGGING':'false','GATEWAY_PROXY_KEEP_ALIVE':'false','GATEWAY_MAX_REQUESTS_PER_SOCKET':'0'}: raise RuntimeError('Final gateway policy mismatch')
    item={'directory':folder.name,'vus':meta['vus'],'status':result['status'],'workload_sha256':meta['workload_sha256']};plan['attempts'].append(item);save();return result['status']=='STABLE PASS'
def run(vus,label):
    if len(plan['attempts'])>=4: raise RuntimeError('Bounded run budget exhausted')
    prior={p.name for p in base.iterdir() if p.is_dir()}
    env=os.environ.copy();env['K8S_DB_MODE']='existing';env.pop('CAPACITY_ACCEPT_ENCODING',None)
    code=subprocess.run(['bash','scripts/k8s/capacity-test.sh',str(vus),'--label',label],env=env,timeout=1300).returncode
    candidates=[p for p in base.iterdir() if p.is_dir() and p.name not in prior and (p/'metadata.json').exists()]
    if len(candidates)!=1 or not completed(candidates[0]): raise RuntimeError('Incomplete attempt, no automatic retry')
    return add(candidates[0])
save()
try:
    deadline=time.monotonic()+1300
    while not completed(first):
        if time.monotonic()>deadline: raise RuntimeError('First attempt did not finish; stop')
        time.sleep(5)
    if add(first):
        candidate=500
        confirmed=run(500,'final-logger-confirm')
        if not confirmed:
            candidate=250
            confirmed=run(250,'final-logger-refine')
            if confirmed: confirmed=run(250,'final-logger-confirm-2')
    else:
        candidate=250 if run(250,'final-logger-refine') else 200
        confirmed=run(candidate,'final-logger-confirm-1')
        if candidate==200 and confirmed: confirmed=run(200,'final-logger-confirm-2')
    plan['qualified_vus']=candidate if confirmed else None
    plan['stop_reason']='Two consistent final-policy passes; shared-host stop condition C' if confirmed else 'Confirmation failed; shared-host stop condition C, no qualified maximum claimed'
except BaseException as e:
    plan['stop_reason']=type(e).__name__+': '+str(e);plan['qualified_vus']=None;raise
finally:
    plan['finished_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();save();print(json.dumps(plan),flush=True)
