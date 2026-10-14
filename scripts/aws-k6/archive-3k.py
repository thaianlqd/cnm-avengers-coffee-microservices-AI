#!/usr/bin/env python3
"""Compact explicit allowlist; no public IP, user-data, nonce or key artifacts."""
import datetime as dt, gzip, hashlib, json, re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
SOURCE=Path('/tmp/avengers-aws-k6-3k')
DEST=ROOT/'k8s/verification/3k-capacity'

def save(source,target,state=False,ssh=False):
    body=source.read_bytes()
    if state:
        data=json.loads(body)
        fields=['run_id','started_at','requested_instance_type','bootstrap_mode','target_url','data_path',
                'key_pair_id','instance_id','launched_at','ami','instance_type','architecture','az',
                'root_delete_on_termination','sg_id','ready','busy','error']
        body=(json.dumps({k:data[k]for k in fields if k in data},indent=2)+'\n').encode()
    if ssh:body=re.sub(rb'\b(?:\d{1,3}\.){3}\d{1,3}\b',b'[runtime-IP-redacted]',body)
    if source.suffix in ['.log','.jsonl']:
        body=gzip.compress(body,mtime=0);target=Path(str(target)+'.gz')
    target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(body)

def main():
    DEST.mkdir(parents=True,exist_ok=True)
    root_files=['source-audit.json','git-baseline.json','network-discovery.json','stun-discovery.json',
                'network-egress.json','tcp443-discovery.json','egress-recheck.json','cost-policy.json',
                'runtime-cost.json','final-cleanup.json','qualification.json']
    for name in root_files:
        p=SOURCE/name
        if p.exists():save(p,DEST/name)
    legacy=['metadata.json','before.json','after.json','idle.json','result.json','analysis.json','k6.json',
            'observer.jsonl','pre-cooldown.jsonl','post-cooldown.jsonl','k6.log',
            'audit-before.txt','check-connectivity-before.txt','smoke-before.txt','smoke-after.txt']
    for name in legacy:
        p=SOURCE/'legacy-200'/name
        if p.exists():save(p,DEST/'legacy-200'/name)
    phase_files=['state.json','boot.json','cleanup.json','security-policy.json','ingress.jsonl',
                 'preflight-recovery.jsonl','audit-preflight.txt','check-connectivity-preflight.txt','smoke-preflight.txt','data-ssh.log']
    for folder in sorted(SOURCE.glob('3k-*')):
        if not folder.is_dir():continue
        for name in phase_files:
            p=folder/name
            if p.exists():save(p,DEST/folder.name/name,state=name=='state.json',ssh=name=='data-ssh.log')
    regression=['checks.json','unit-checks.json','unit-checks-sandbox-abort.json','runtime-checks.json',
                'payload-audit.json','before-availability.json','after-availability.json','final-recovery.jsonl',
                'render.log','server-dry-run.log','gateway.log','gateway-sandbox-abort.log','identity.log',
                'menu.log','news.log','k8s-python.log','aws-python.log','node-security.log','healing.log',
                'rollout.log','healing-samples.txt','rollout-samples.txt','socket.log','smoke.log']
    for name in regression:
        p=SOURCE/'regression'/name
        if p.exists():save(p,DEST/'regression'/name)
    index={'generated_at':dt.datetime.now(dt.timezone.utc).isoformat(),'status':'STOPPED (network/setup before external load)',
           'target_vus':3000,'external_capacity_runs':0,'max_stable_external_vus':None,
           'local_legacy':'legacy-200/analysis.json','network_setup_attempts':['3k-20261014T054657Z-8dccb3'],
           'control_only_cloudflare':True,'public_ips_redacted':True,'private_artifacts_excluded':True,
           'cleanup':'final-cleanup.json','regression':'regression/checks.json'}
    (DEST/'index.json').write_text(json.dumps(index,indent=2)+'\n')
    files=sorted(p for p in DEST.rglob('*')if p.is_file()and p.name!='SHA256SUMS')
    (DEST/'SHA256SUMS').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+str(p.relative_to(DEST))+'\n'for p in files))
    print(json.dumps({'files':len(files)+1,'bytes':sum(p.stat().st_size for p in files),'destination':str(DEST)}))

if __name__=='__main__':main()
