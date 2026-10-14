#!/usr/bin/env python3
"""Independent native k6 run. Always stops resource observer; archives no bodies."""
import argparse,datetime,json,os,subprocess,time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('name');p.add_argument('vus',type=int);p.add_argument('--hold',type=int,default=120);p.add_argument('--target',required=True);a=p.parse_args()
if not a.name.replace('-','').isalnum() or not 1<=a.vus<=3000 or a.hold not in (120,300):raise SystemExit('invalid run')
folder=Path('/opt/avengers-runs')/a.name;folder.mkdir(parents=True,exist_ok=False)
root=Path('/opt/avengers-workload')
meta={'vus':a.vus,'hold_seconds':a.hold,'ramp_seconds':60,'down_seconds':30 if a.hold==120 else 60,'load_started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'fd_soft':subprocess.check_output(['bash','-c','ulimit -Sn'],text=True).strip()}
(folder/'metadata.json').write_text(json.dumps(meta,indent=2))
metrics=(folder/'generator.jsonl').open('w');observer=subprocess.Popen(['python3',str(root/'metrics-3k.py')],stdout=metrics)
try:
    time.sleep(1)
    meta['load_started_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();(folder/'metadata.json').write_text(json.dumps(meta,indent=2))
    env=dict(os.environ,AWS_PRIVATE_CAPACITY='true',BASE_URL=a.target,THINK_SECONDS='3',CAPACITY_VUS=str(a.vus),CAPACITY_HOLD_SECONDS=str(a.hold),SUMMARY_FILE=str(folder/'k6.json'))
    with (folder/'k6.log').open('w') as log:
        result=subprocess.run(['k6','run','--new-machine-readable-summary=false',str(root/'customer-browse-3k.js')],env=env,stdout=log,stderr=log,timeout=60+a.hold+meta['down_seconds']+90)
    (folder/'exit.txt').write_text(str(result.returncode))
finally:
    observer.terminate();observer.wait(timeout=15);metrics.close()
    meta['load_finished_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();(folder/'metadata.json').write_text(json.dumps(meta,indent=2))
print(json.dumps({'folder':str(folder),'exit':result.returncode}))
