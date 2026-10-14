#!/usr/bin/env python3
"""Allowlisted, sanitized evidence only. Never archive user-data, tokens or keys."""
import gzip, hashlib, json, shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
SOURCE=Path('/tmp/avengers-aws-k6')
DEST=ROOT/'k8s/verification/5k-capacity'
PHASE_FILES={'state.json','cleanup.json','boot.json','bootstrap-diagnostic.json','environment.json','aws-price.json','network-baseline.json',
             'audit-preflight.txt','check-connectivity-preflight.txt','smoke-preflight.txt','preflight-recovery.jsonl',
             'ingress.jsonl','tunnel-metrics.jsonl'}
RUN_FILES={'metadata.json','before.json','after.json','result.json','qualification.json','analysis.json','external-analysis.json',
           'k6.json','k6.log','generator.jsonl','observer.jsonl','pre-cooldown.jsonl','post-cooldown.jsonl','exit.txt','fd-limit.txt',
           'network.json','smoke-before.txt','smoke-after.txt','audit-before.txt','check-connectivity-before.txt'}
ROOT_FILES={'final-cleanup.json','runtime-cost.json','final-instances.json','final-groups.json','final-volumes.json','final-keys.json',
            'local-deploy.txt','profile-options.json','final-kubernetes.json'}

def copy(src,dest):
    dest.parent.mkdir(parents=True,exist_ok=True)
    if src.name=='state.json':
        fields={'run_id','started_at','requested_instance_type','key_pair_id','sg_id','instance_id','launched_at','ami',
            'instance_type','architecture','az','root_delete_on_termination','public_ip','error','target_url','control_url',
            'bootstrap_mode','ready','busy','stop_reason'}
        d={k:v for k,v in json.loads(src.read_text()).items() if k in fields}
        dest.write_text(json.dumps(d,indent=2)+'\n');return
    if src.suffix=='.jsonl' or src.name=='k6.log':
        with src.open('rb') as a,gzip.GzipFile(filename=str(dest)+'.gz',mode='wb',mtime=0) as b:shutil.copyfileobj(a,b)
    else:shutil.copy2(src,dest)

def main():
    DEST.mkdir(parents=True,exist_ok=True);index=[]
    for phase in sorted(SOURCE.glob('5k-*')):
        if not phase.is_dir():continue
        for name in PHASE_FILES:
            if (phase/name).is_file():copy(phase/name,DEST/phase.name/name)
        state=json.loads((phase/'state.json').read_text())
        index.append({'directory':phase.name,'instance_id':state.get('instance_id'),'instance_type':state.get('instance_type'),
                      'setup_error':state.get('error'),'cleanup_verified':(phase/'cleanup.json').exists()})
        for run in phase.iterdir():
            if not run.is_dir() or not (run/'metadata.json').is_file():continue
            for name in RUN_FILES:
                if (run/name).is_file():copy(run/name,DEST/phase.name/run.name/name)
    for name in ROOT_FILES:
        if (SOURCE/name).is_file():copy(SOURCE/name,DEST/name)
    regression=SOURCE/'regression'
    for file in regression.rglob('*'):
        if file.is_file() and (file.name in RUN_FILES or file.name in {'checks.json','healing.txt','rollout.txt','payload-audit.json',
            'after-availability.json','after-availability-recovery.jsonl'}):copy(file,DEST/'regression'/file.relative_to(regression))
    (DEST/'index.json').write_text(json.dumps(index,indent=2)+'\n')
    manifest=[]
    for p in sorted(DEST.rglob('*')):
        if p.is_file() and p.name!='SHA256SUMS':manifest.append(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+str(p.relative_to(DEST)))
    (DEST/'SHA256SUMS').write_text('\n'.join(manifest)+'\n')
    print('Archived',len(manifest),'allowlisted files; secrets/user-data/private keys excluded.')
if __name__=='__main__':main()
