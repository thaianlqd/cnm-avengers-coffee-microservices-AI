#!/usr/bin/env python3
"""Diagnostic-only native k6 variant: explicit loopback profiling CLI flags. No workload changes."""
import argparse,datetime,json,os,subprocess,time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('name');p.add_argument('vus',type=int);p.add_argument('--hold',type=int,default=120);p.add_argument('--target',required=True);p.add_argument('--json-output',action='store_true');p.add_argument('--start-at',type=float);a=p.parse_args()
if not a.name.replace('-','').isalnum() or not 1<=a.vus<=3000 or a.hold not in (120,300):raise SystemExit('invalid run')
folder=Path('/opt/avengers-runs')/a.name;folder.mkdir(parents=True,exist_ok=False)
root=Path('/opt/avengers-workload')
meta={'vus':a.vus,'hold_seconds':a.hold,'ramp_seconds':60,'down_seconds':30 if a.hold==120 else 60,'load_started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'diagnostic':True,'generator_cpu_profile':True,'fd_soft':subprocess.check_output(['bash','-c','ulimit -Sn'],text=True).strip()}
(folder/'metadata.json').write_text(json.dumps(meta,indent=2))
if a.start_at is not None:
    if not time.time()<a.start_at<time.time()+120:raise SystemExit('invalid synchronized start')
    time.sleep(max(0,a.start_at-time.time()-1))
metrics=(folder/'generator.jsonl').open('w');observer=subprocess.Popen(['python3',str(root/'metrics-3k.py')],stdout=metrics)
try:
    time.sleep(1)
    meta['load_started_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();(folder/'metadata.json').write_text(json.dumps(meta,indent=2))
    env=dict(os.environ,AWS_PRIVATE_CAPACITY='true',BASE_URL=a.target,THINK_SECONDS='3',CAPACITY_VUS=str(a.vus),CAPACITY_HOLD_SECONDS=str(a.hold),SUMMARY_FILE=str(folder/'k6.json'))
    with (folder/'k6.log').open('w') as log:
        command=['k6','run','--address','127.0.0.1:6565','--profiling-enabled','--new-machine-readable-summary=false']
        if a.json_output:command+=['--out','json='+str(folder/'http-points.jsonl.gz')]
        command.append(str(root/'customer-browse-3k.js'))
        result=subprocess.run(command,env=env,stdout=log,stderr=log,timeout=60+a.hold+meta['down_seconds']+90)
    (folder/'exit.txt').write_text(str(result.returncode))
finally:
    observer.terminate();observer.wait(timeout=15);metrics.close()
    meta['load_finished_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();(folder/'metadata.json').write_text(json.dumps(meta,indent=2))
print(json.dumps({'folder':str(folder),'exit':result.returncode}))
