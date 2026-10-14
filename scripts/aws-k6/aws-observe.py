#!/usr/bin/env python3
"""Five-second k3s observer; only status/resource fields, never Secrets or env."""
import datetime,json,subprocess,time,sys
from pathlib import Path
out=Path(sys.argv[1]);seconds=int(sys.argv[2]);deadline=time.monotonic()+seconds

def kubectl(*args):
    p=subprocess.run(['k3s','kubectl','--request-timeout=8s',*args],capture_output=True,text=True)
    if p.returncode:raise RuntimeError('kubectl operation failed')
    return p.stdout
with out.open('w') as stream:
    while time.monotonic()<deadline:
        tick=time.monotonic();row={'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        try:
            for kind in ('pods','deployments','hpa'):
                items=json.loads(kubectl('-n','avengers-coffee','get',kind,'-o','json'))['items']
                if kind=='pods':
                    row[kind]=[{'name':p['metadata']['name'],'uid':p['metadata']['uid'],'node':p['spec'].get('nodeName'),'phase':p['status']['phase'],'conditions':p['status'].get('conditions',[]),'containers':p['status'].get('containerStatuses',[])} for p in items]
                elif kind=='deployments':row[kind]=[{'name':p['metadata']['name'],'spec_replicas':p['spec']['replicas'],'status':p.get('status',{})} for p in items]
                else:row[kind]=[{'name':p['metadata']['name'],'status':p.get('status',{})} for p in items]
            nodes=json.loads(kubectl('get','nodes','-o','json'))['items']
            row['nodes']=[{'name':n['metadata']['name'],'conditions':n['status']['conditions'],'capacity':n['status']['capacity'],'allocatable':n['status']['allocatable']} for n in nodes]
            row['top_nodes']=kubectl('top','nodes','--no-headers')
            row['top_pods']=kubectl('-n','avengers-coffee','top','pods','--no-headers')
            events=json.loads(kubectl('-n','avengers-coffee','get','events','-o','json'))['items']
            row['warnings']=[{'reason':e.get('reason'),'count':e.get('count'),'message':e.get('message'),'lastTimestamp':e.get('lastTimestamp'),'object':e.get('involvedObject',{}).get('name')} for e in events if e.get('type')=='Warning']
        except Exception as error:row['observer_error']=str(error)
        stream.write(json.dumps(row)+'\n');stream.flush()
        time.sleep(max(0,5-(time.monotonic()-tick)))
