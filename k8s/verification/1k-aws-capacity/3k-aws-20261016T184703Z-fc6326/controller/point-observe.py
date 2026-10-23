#!/usr/bin/env python3
"""Run-scoped observation, sanitized continuous diagnostics and natural recovery."""
import argparse,base64,datetime,gzip,io,json,os,pathlib,re,signal,subprocess,tarfile,time
ROOT=pathlib.Path('/opt/avengers-observations')
def k(*args):
 p=subprocess.run(['k3s','kubectl','--request-timeout=10s',*args],capture_output=True,text=True,timeout=20)
 if p.returncode:raise ValueError('kubectl status operation failed')
 return p.stdout
def stable():
 objects=json.loads(k('-n','avengers-coffee','get','deployments','-o','json'))['items'];expected={'api-gateway':2,'identity-service':1,'menu-service':1,'news-service':1}
 if not (len(objects)==4 and all(d['metadata']['name'] in expected and d['spec']['replicas']==expected[d['metadata']['name']] and d.get('status',{}).get('availableReplicas')==expected[d['metadata']['name']] and d.get('status',{}).get('updatedReplicas')==expected[d['metadata']['name']] for d in objects)):return False
 hpas=json.loads(k('-n','avengers-coffee','get','hpa','-o','json'))['items']
 if {h['metadata']['name'] for h in hpas}!={'api-gateway','identity-service','menu-service'}:return False
 if not all(h.get('status',{}).get('currentMetrics') and any(c['type']=='ScalingActive' and c['status']=='True' for c in h.get('status',{}).get('conditions',[])) for h in hpas):return False
 nodes=k('top','nodes','--no-headers');pods=k('-n','avengers-coffee','top','pods','--no-headers')
 return len(nodes.splitlines())==3 and len(pods.splitlines())>=5 and '<unknown>' not in nodes+pods
def wait_baseline(seconds=720):
 deadline=time.monotonic()+seconds;streak=0
 while time.monotonic()<deadline:
  try:streak=streak+1 if stable() else 0
  except Exception:streak=0
  if streak>=2:return True
  time.sleep(5)
 return False
def start(folder,label,args):
 with (folder/(label+'.log')).open('w') as log:proc=subprocess.Popen(args,stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
 ticks=pathlib.Path(f'/proc/{proc.pid}/stat').read_text().split()[21]
 (folder/(label+'.process.json')).write_text(json.dumps({'pid':proc.pid,'start_ticks':ticks,'script':args[1]}))
def stop(folder,label):
 info=json.loads((folder/(label+'.process.json')).read_text());pid=info['pid'];stat=pathlib.Path(f'/proc/{pid}/stat')
 if stat.exists() and stat.read_text().split()[21]==info['start_ticks']:
  if info['script'].encode() not in pathlib.Path(f'/proc/{pid}/cmdline').read_bytes():raise ValueError('owned process identity mismatch')
  os.kill(pid,signal.SIGTERM)
  for _ in range(30):
   if not stat.exists() or stat.read_text().split()[2]=='Z':return
   time.sleep(.5)
  raise ValueError('owned observation process did not stop')
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('action',choices=['start','finish','baseline']);p.add_argument('name');p.add_argument('--seconds',type=int,default=1320);a=p.parse_args()
 if not re.fullmatch('[a-zA-Z0-9-]+',a.name):raise SystemExit('invalid point name')
 folder=ROOT/a.name
 if a.action=='baseline':print(json.dumps({'passed':wait_baseline()}));raise SystemExit()
 if a.action=='start':
  if not stable():raise SystemExit('baseline replicas unavailable')
  folder.mkdir(parents=True,exist_ok=False);(folder/'started-at').write_text(datetime.datetime.now(datetime.timezone.utc).isoformat());(folder/'target.jsonl').touch()
  start(folder,'observer',['python3','/opt/avengers-workload/aws-observe.py',str(folder/'target.jsonl'),str(a.seconds)])
  start(folder,'diagnostic-stream',['python3','/opt/avengers-workload/aws-diagnostic-logs.py',str(folder),'--seconds',str(a.seconds)])
  time.sleep(6);print(json.dumps({'observer_started':True,'name':a.name}))
 else:
  recovered=wait_baseline();(folder/'recovery.json').write_text(json.dumps({'passed':recovered,'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}))
  stop(folder,'diagnostic-stream');stop(folder,'observer')
  subprocess.run(['python3','/opt/avengers-workload/aws-metrics-diagnostics.py',(folder/'started-at').read_text().strip(),str(folder/'metrics-server.json')],check=True,timeout=120)
  for name in ('target.jsonl','diagnostics.jsonl'):
   path=folder/name
   with gzip.open(str(path)+'.gz','wb') as dest:dest.write(path.read_bytes())
   path.unlink()
  buffer=io.BytesIO()
  with tarfile.open(fileobj=buffer,mode='w:gz') as archive:
   for name in ('target.jsonl.gz','diagnostics.jsonl.gz','recovery.json','started-at','observer.log','diagnostic-stream.log','diagnostic-stream-status.json','metrics-server.json'):archive.add(folder/name,arcname=name)
  print(base64.b64encode(buffer.getvalue()).decode())
