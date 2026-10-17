#!/usr/bin/env python3
"""Read-only metrics-server health and categorized log windows, never raw log text."""
import argparse,datetime,hashlib,importlib.util,json,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('logs',Path(__file__).with_name('aws-diagnostic-logs.py'));logs=importlib.util.module_from_spec(spec);spec.loader.exec_module(logs)

def snapshot(since):
    datetime.datetime.fromisoformat(since.replace('Z','+00:00'))
    out={'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'since':since,'operation_errors':[]};aliases={}
    def run(name,*args):
        p=subprocess.run(['k3s','kubectl','--request-timeout=10s',*args],capture_output=True,text=True,timeout=20)
        if p.returncode:raise ValueError(name)
        return p.stdout
    try:
        nodes=json.loads(run('nodes','get','nodes','-o','json'))['items'];out['node_versions']={n['metadata']['name']:n['status'].get('nodeInfo',{}).get('kubeletVersion') for n in nodes}
        for n in nodes:
            alias=n['metadata']['name'];aliases[alias]=alias
            for address in n['status'].get('addresses',[]):aliases[address['address']]=alias
    except Exception:out['operation_errors'].append('nodes')
    try:
        deployment=json.loads(run('deployment','-n','kube-system','get','deployment','metrics-server','-o','json'));out['deployment']={'replicas':deployment['spec']['replicas'],'available':deployment.get('status',{}).get('availableReplicas',0),'containers':[]}
        prefixes=('--metric-resolution=','--kubelet-request-timeout=','--kubelet-preferred-address-types=','--kubelet-insecure-tls')
        for c in deployment['spec']['template']['spec']['containers']:out['deployment']['containers'].append({'name':c['name'],'image':c['image'],'resources':c.get('resources',{}),'safe_args':[a for a in c.get('args',[]) if a.startswith(prefixes)]})
    except Exception:out['operation_errors'].append('deployment')
    out['pods']=[];out['log_windows']=[]
    try:
        pods=json.loads(run('pods','-n','kube-system','get','pods','-l','k8s-app=metrics-server','-o','json'))['items']
        for p in pods:
            name=p['metadata']['name'];entry={'name':name,'node':p['spec'].get('nodeName'),'phase':p['status'].get('phase'),'restarts':sum(c.get('restartCount',0) for c in p['status'].get('containerStatuses',[]))};out['pods'].append(entry)
            try:
                raw=run('logs','-n','kube-system','logs',name,'--timestamps','--since-time='+since);entry['raw_log_sha256']=hashlib.sha256(raw.encode()).hexdigest();entry['raw_log_bytes']=len(raw.encode());out['log_windows'].extend(logs.classify_metrics_logs(raw,aliases))
            except Exception:out['operation_errors'].append('logs')
    except Exception:out['operation_errors'].append('pods')
    return out

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('since');p.add_argument('output',type=Path);a=p.parse_args();a.output.write_text(json.dumps(snapshot(a.since),indent=2)+'\n')
