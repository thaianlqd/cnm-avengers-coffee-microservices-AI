#!/usr/bin/env python3
"""Temporary orchestration over the existing AWS observer; no secret/env reads."""
import argparse,base64,datetime,json,os,pathlib,re,signal,subprocess,tarfile,time,io
ROOT=pathlib.Path('/opt/avengers-observations')
def k(*args):
    p=subprocess.run(['k3s','kubectl','--request-timeout=10s',*args],capture_output=True,text=True)
    if p.returncode:raise ValueError('kubectl status operation failed')
    return p.stdout
def stable():
    objects=json.loads(k('-n','avengers-coffee','get','deployments','-o','json'))['items']
    expected={'api-gateway':2,'identity-service':1,'menu-service':1,'news-service':1}
    return len(objects)==4 and all(d['metadata']['name'] in expected and d['spec']['replicas']==expected[d['metadata']['name']] and d.get('status',{}).get('availableReplicas')==expected[d['metadata']['name']] and d.get('status',{}).get('updatedReplicas')==expected[d['metadata']['name']] for d in objects)
def wait_baseline(seconds=720):
    deadline=time.monotonic()+seconds;streak=0
    while time.monotonic()<deadline:
        streak=streak+1 if stable() else 0
        if streak>=2:return True
        time.sleep(5)
    return False
def diagnostics(folder):
    pods=json.loads(k('-n','avengers-coffee','get','pods','-o','json'))['items'];records=[]
    for pod in pods:
        service=pod['metadata'].get('labels',{}).get('app.kubernetes.io/name')
        if service not in ('api-gateway','identity-service','menu-service','news-service'):continue
        result=subprocess.run(['k3s','kubectl','--request-timeout=10s','-n','avengers-coffee','logs',pod['metadata']['name'],'-c',service],capture_output=True,text=True)
        for line in result.stdout.splitlines():
            try:record=json.loads(line)
            except ValueError:continue
            if record.get('kind')!='capacity_diagnostics':continue
            records.append({'service':service,'pod':pod['metadata']['name'],'uid':pod['metadata']['uid'],'record':record})
    (folder/'diagnostics.jsonl').write_text(''.join(json.dumps(r)+'\n' for r in records))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['start','finish','baseline']);p.add_argument('name');p.add_argument('--seconds',type=int,default=1140);a=p.parse_args()
    if not re.fullmatch('[a-zA-Z0-9-]+',a.name):raise SystemExit('invalid point name')
    folder=ROOT/a.name
    if a.action=='baseline':print(json.dumps({'passed':wait_baseline()}));raise SystemExit()
    if a.action=='start':
        if not stable():raise SystemExit('baseline replicas unavailable')
        folder.mkdir(parents=True,exist_ok=False)
        (folder/'started-at').write_text(datetime.datetime.now(datetime.timezone.utc).isoformat())
        with (folder/'observer.log').open('w') as log,(folder/'target.jsonl').open('w') as unused:
            proc=subprocess.Popen(['python3','/opt/avengers-workload/aws-observe.py',str(folder/'target.jsonl'),str(a.seconds)],stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
        (folder/'observer.pid').write_text(str(proc.pid))
        time.sleep(6)
        print(json.dumps({'observer_started':True,'name':a.name}))
    else:
        diagnostics(folder)
        recovered=wait_baseline()
        (folder/'recovery.json').write_text(json.dumps({'passed':recovered,'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}))
        os.kill(int((folder/'observer.pid').read_text()),signal.SIGTERM)
        time.sleep(1)
        import gzip
        for name in ('target.jsonl','diagnostics.jsonl'):
            path=folder/name
            with gzip.open(str(path)+'.gz','wb') as dest:dest.write(path.read_bytes())
            path.unlink()
        buffer=io.BytesIO()
        with tarfile.open(fileobj=buffer,mode='w:gz') as archive:
            for name in ('target.jsonl.gz','diagnostics.jsonl.gz','recovery.json','started-at','observer.log'):archive.add(folder/name,arcname=name)
        print(base64.b64encode(buffer.getvalue()).decode())
