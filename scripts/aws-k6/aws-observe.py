#!/usr/bin/env python3
"""Five-second k3s status/resource observer, including bounded operation timing."""
import datetime,json,subprocess,time,sys
from pathlib import Path

def kubectl(*args):
    p=subprocess.run(['k3s','kubectl','--request-timeout=8s',*args],capture_output=True,text=True)
    if p.returncode:raise RuntimeError('kubectl operation failed')
    return p.stdout

def collect(run=kubectl):
    tick=time.monotonic();row={'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'operation_ms':{},'operation_errors':{}}
    def command(name,*args):
        start=time.monotonic()
        try:return run(*args)
        except Exception:
            row['operation_errors'][name]='command_failed';raise
        finally:row['operation_ms'][name]=(time.monotonic()-start)*1000
    try:
        for kind in ('pods','deployments','hpa'):
            items=json.loads(command('get_'+kind,'-n','avengers-coffee','get',kind,'-o','json'))['items']
            if kind=='pods':row[kind]=[{'name':p['metadata']['name'],'uid':p['metadata']['uid'],'node':p['spec'].get('nodeName'),'phase':p['status']['phase'],'conditions':p['status'].get('conditions',[]),'containers':p['status'].get('containerStatuses',[])} for p in items]
            elif kind=='deployments':row[kind]=[{'name':p['metadata']['name'],'spec_replicas':p['spec']['replicas'],'status':p.get('status',{})} for p in items]
            else:row[kind]=[{'name':p['metadata']['name'],'status':p.get('status',{})} for p in items]
        nodes=json.loads(command('get_nodes','get','nodes','-o','json'))['items']
        row['nodes']=[{'name':n['metadata']['name'],'conditions':n['status']['conditions'],'capacity':n['status']['capacity'],'allocatable':n['status']['allocatable']} for n in nodes]
        row['top_nodes']=command('top_nodes','top','nodes','--no-headers')
        row['top_pods']=command('top_pods','-n','avengers-coffee','top','pods','--no-headers')
        row['unknown_node_metric_rows']=sum('<unknown>' in line for line in row['top_nodes'].splitlines())
        row['unknown_pod_metric_rows']=sum('<unknown>' in line for line in row['top_pods'].splitlines())
        events=json.loads(command('get_events','-n','avengers-coffee','get','events','-o','json'))['items']
        row['warnings']=[{'reason':e.get('reason'),'count':e.get('count'),'message':e.get('message'),'lastTimestamp':e.get('lastTimestamp'),'object':e.get('involvedObject',{}).get('name')} for e in events if e.get('type')=='Warning']
    except Exception:row['observer_error']='target observer operation failed' # Never serialize command stderr or exception details.
    row['observation_finished_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();row['sampling_duration_ms']=(time.monotonic()-tick)*1000;row['interval_overrun_ms']=max(0,row['sampling_duration_ms']-5000)
    return row

def observe(out,seconds):
    deadline=time.monotonic()+seconds
    with out.open('w') as stream:
        while time.monotonic()<deadline:
            tick=time.monotonic();stream.write(json.dumps(collect())+'\n');stream.flush();time.sleep(max(0,5-(time.monotonic()-tick)))

if __name__=='__main__':observe(Path(sys.argv[1]),int(sys.argv[2]))
