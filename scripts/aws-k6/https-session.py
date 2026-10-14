#!/usr/bin/env python3
"""Outbound HTTPS alternative to SSH. One owned EC2, fixed jobs, finally cleanup."""
import base64, datetime as dt, hashlib, json, os, re, secrets, signal, subprocess
import threading, time, uuid
from pathlib import Path
import session as shared
cap=shared.cap;ROOT=shared.ROOT

def userdata(state):
    folder=Path(state['folder']); content='#!/bin/bash\nset -eu\nshutdown -h +230 >/dev/null\nmkdir -p /root/avengers-k6\ncd /root/avengers-k6\numask 077\n'
    data={p.name:p.read_bytes() for p in [ROOT/'scripts/aws-k6/bootstrap.sh',ROOT/'scripts/aws-k6/control-worker.py',ROOT/'scripts/aws-k6/remote-metrics.py',ROOT/'load-tests/k6/customer-browse-5k.js']}
    data.update({'control-url':state['control_url'].encode(),'control-token':(folder/'control-token').read_bytes()})
    for name,b in data.items(): content+='printf %s '+base64.b64encode(b).decode()+' | base64 -d > '+name+'\n'
    content+='K6_INSTALL_DIR=/root/avengers-k6 bash bootstrap.sh\nexec python3 control-worker.py\n'
    if len(content.encode())>16384: raise RuntimeError('User-data exceeds EC2 limit')
    (folder/'user-data.sh').write_text(content);(folder/'user-data.sh').chmod(0o600)

def submit(state,job,timeout):
    folder=Path(state['folder']);shared.write(folder/'control-job.json',job)
    until=time.monotonic()+timeout
    while time.monotonic()<until:
        if (folder/'abort-request.json').exists():raise RuntimeError('Safety observer requested abort; stopping owned generator')
        file=folder/(job['job_id']+'-status.json')
        if file.exists():
            status=json.loads(file.read_text())
            if status['phase']=='failed':raise RuntimeError('EC2 HTTPS worker failed; evidence retained')
            if status['phase']=='complete':
                (folder/'control-job.json').unlink(missing_ok=True);return status
        time.sleep(3)
    raise RuntimeError('EC2 job deadline exceeded')

def network(state,label):
    job='network-'+label; folder=Path(state['folder'])/job;folder.mkdir(exist_ok=True)
    shared.write(folder/'metadata.json',{'kind':'network','started_at':cap.now()})
    result=submit(state,{'job_id':job,'action':'network','target_url':state['target_url']},300)
    rows=json.loads((folder/'network.json').read_text())['samples']
    print('EC2 HTTPS network baseline max seconds:',max(r['total_s'] for r in rows),flush=True)
    return str(folder)

def run(state,vus,label,hold=120):
    if not 1<=vus<=5000 or not 120<=hold<=600 or not re.fullmatch('[A-Za-z0-9_-]+',label):raise RuntimeError('Invalid workload')
    root=Path(state['folder']);folder=root/f'{dt.datetime.now(dt.timezone.utc):%Y%m%dT%H%M%SZ}-{label}-{vus}';folder.mkdir()
    boot=json.loads((root/'boot.json').read_text())
    meta={'started_at':cap.now(),'vus':vus,'think_seconds':3,'cache_ms':5000,'accept_encoding':'gzip','ramp_seconds':60,
        'hold_seconds':hold,'down_seconds':30 if hold==120 else 60,'target_url':state['target_url'],
        'target_classification':'EC2 -> HTTPS Quick Tunnel -> GET allowlist -> Mac IPv4 Kubernetes LoadBalancer',
        'instance_id':state['instance_id'],'instance_type':state['instance_type'],'aws_region':shared.REGION,
        'k6_version':boot['k6_version'],'k6_sha256':boot['k6_sha256'],'source_head':shared.call(['git','rev-parse','HEAD']).stdout.strip(),
        'workload_sha256':hashlib.sha256((ROOT/'load-tests/k6/customer-browse-5k.js').read_bytes()).hexdigest()}
    shared.write(folder/'metadata.json',meta)
    flags=shared.call(cap.K+['-n','avengers-coffee','get','configmap','avengers-common','-o','jsonpath={.data.K8S_DEMO_READ_ONLY} {.data.PUBLIC_BROWSE_CACHE_TTL_MS}']).stdout.strip()
    if flags!='true 5000':raise RuntimeError('Read-only/cache policy changed')
    for args in [['python3','scripts/k8s/environment.py','audit'],['bash','scripts/k8s/check-connectivity.sh'],['bash','scripts/k8s/smoke.sh']]:
        p=shared.call(args,120);(folder/(Path(args[-1]).stem+'-before.txt')).write_text(p.stdout)
    status=shared.aws('ec2','describe-instance-status','--instance-ids',state['instance_id'])['InstanceStatuses']
    if not status or any(status[0][s]['Status']!='ok' for s in ['InstanceStatus','SystemStatus']):raise RuntimeError('EC2 not healthy')
    with (folder/'pre-cooldown.jsonl').open('w') as out:before=cap.wait_recovery(out,720)
    shared.write(folder/'before.json',before)
    stop=threading.Event();samples=[];phase=['preload'];observer_errors=[]
    def observe():
        try:
            with (folder/'observer.jsonl').open('w') as out:
                while not stop.is_set():
                    r=cap.snapshot();r['phase']=phase[0]
                    r['host']='\n'.join(l for l in cap.command(['top','-l','1','-n','0'])[1].splitlines() if l.startswith(('CPU usage:','PhysMem:','VM:','Load Avg:')))
                    r['gateway_cgroups']={}
                    for p in r['pods']:
                        if p['app']=='api-gateway' and p['phase']=='Running' and not p['deleting']:
                            code,text=cap.command(cap.K+['-n','avengers-coffee','exec',p['name'],'--','cat','/sys/fs/cgroup/cpu.stat','/sys/fs/cgroup/memory.events'])
                            if not code:r['gateway_cgroups'][p['uid']]=dict(l.split() for l in text.splitlines() if len(l.split())==2)
                    samples.append(r);out.write(json.dumps(r)+'\n');out.flush();stop.wait(10)
                    if r.get('compose_application_overlap'):
                        shared.write(root/'abort-request.json',{'reason':'duplicate Compose application detected','observed_at':cap.now()})
        except Exception:observer_errors.append('observer failed')
    observer=threading.Thread(target=observe);observer.start()
    try:
        time.sleep(2);phase[0]='load';meta['load_started_at']=cap.now();shared.write(folder/'metadata.json',meta)
        print('External HTTPS worker run:',folder.name,flush=True)
        result=submit(state,{'job_id':folder.name,'action':'run','target_url':state['target_url'],'vus':vus,'hold':hold},60+hold+meta['down_seconds']+240)
        meta['load_finished_at']=result['load_finished_at'];meta['artifact_delivery_finished_at']=result['observed_at'];meta['k6_exit']=result['exit'];phase[0]='cooldown'
        with (folder/'post-cooldown.jsonl').open('w') as out:after=cap.wait_recovery(out,720)
        shared.write(folder/'after.json',after)
        p=shared.call(['bash','scripts/k8s/smoke.sh'],120,False);(folder/'smoke-after.txt').write_text(p.stdout)
        issues=cap.violations(before,samples+[after])+observer_errors
        if p.returncode:issues.append('post-smoke failed')
        if len(samples)<3:issues.append('insufficient observer samples')
        data=json.loads((folder/'k6.json').read_text())
        passed=result['exit']==0 and bool(data.get('metrics')) and all(t['ok'] for m in data['metrics'].values() for t in m.get('thresholds',{}).values())
        shared.write(folder/'result.json',{'status':'STABLE PASS' if passed and not issues else 'UNSTABLE' if passed else 'FAIL',
            'http_pass':passed,'stable':not issues,'violations':sorted(set(issues)),'smoke_after_exit':p.returncode})
    except BaseException:
        shared.write(folder/'result.json',{'status':'ABORTED','http_pass':False,'stable':False,'reason':'worker/harness error'})
        raise
    finally:
        stop.set();observer.join(45);meta['finished_at']=cap.now();shared.write(folder/'metadata.json',meta)
    shared.summary.summarize(folder)
    print((folder/'result.json').read_text(),flush=True);return str(folder)

def start():
    runid='5k-'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:6]
    folder=Path('/tmp/avengers-aws-k6')/runid;folder.mkdir(parents=True,mode=0o700)
    state={'run_id':runid,'folder':str(folder),'started_at':cap.now(),'requested_instance_type':'m7i-flex.large','bootstrap_mode':'https-userdata'}
    shared.write(folder/'state.json',state);print('SESSION:',folder,flush=True)
    (folder/'control-token').write_text(secrets.token_hex(32));(folder/'control-token').chmod(0o600)
    children=[];logs=[];finished=False
    def abort(signum,frame):raise KeyboardInterrupt()
    signal.signal(signal.SIGINT,abort);signal.signal(signal.SIGTERM,abort)
    try:
        state['key_pair_id']=shared.preflight(folder);shared.write(folder/'state.json',state)
        for args,name,env in [(['node','scripts/aws-k6/public-ingress.cjs'],'ingress',{'INGRESS_METRICS':str(folder/'ingress.jsonl')}),
            (['node','scripts/aws-k6/control-server.cjs'],'control',{'CONTROL_FOLDER':str(folder)}),
            (['cloudflared','tunnel','--url','http://127.0.0.1:18080','--metrics','127.0.0.1:18081','--no-autoupdate'],'tunnel',{}),
            (['cloudflared','tunnel','--url','http://127.0.0.1:18082','--metrics','127.0.0.1:18083','--no-autoupdate'],'control-tunnel',{})]:
            out=(folder/(name+'.log')).open('w');logs.append(out);children.append(subprocess.Popen(args,cwd=ROOT,env={**os.environ,**env},stdout=out,stderr=out))
        deadline=time.monotonic()+120
        while time.monotonic()<deadline:
            for name,key in [('tunnel','target_url'),('control-tunnel','control_url')]:
                match=re.search(r'https://[a-z0-9-]+\.trycloudflare\.com',(folder/(name+'.log')).read_text())
                if match:state[key]=match.group()
            if all(key in state for key in ['target_url','control_url']):break
            if any(p.poll() is not None for p in children):raise RuntimeError('Temporary ingress failed')
            time.sleep(2)
        else:raise RuntimeError('Tunnel URL unavailable')
        shared.write(folder/'state.json',state);userdata(state);shared.launch(state)
        deadline=time.monotonic()+300
        while time.monotonic()<deadline:
            if (folder/'boot.json').exists():break
            time.sleep(5)
        else:raise RuntimeError('Outbound HTTPS worker bootstrap unavailable')
        print('EC2 native k6 ready via outbound HTTPS.',flush=True);network(state,'baseline')
        state['ready']=True;shared.write(folder/'state.json',state);print('READY for independent runs.',flush=True)
        deadline=dt.datetime.fromisoformat(state['launched_at'])+dt.timedelta(hours=3,minutes=45)
        while dt.datetime.now(dt.timezone.utc)<deadline:
            if any(p.poll() is not None for p in children):raise RuntimeError('Temporary tunnel exited')
            file=folder/'command.json'
            if not file.exists():time.sleep(2);continue
            task=json.loads(file.read_text());file.rename(folder/('command-'+str(time.time_ns())+'.json'))
            if task['action']=='finish':finished=True;break
            state['busy']=True;shared.write(folder/'state.json',state)
            result=run(state,task['vus'],task['label'],task.get('hold',120)) if task['action']=='run' else network(state,task['label'])
            shared.write(folder/'last-command.json',{'action':task,'result':result,'finished_at':cap.now()})
            state['busy']=False;shared.write(folder/'state.json',state)
        else:state['stop_reason']='four-hour cost guard';shared.write(folder/'state.json',state)
    except BaseException as error:
        state['error']=str(error) or type(error).__name__;shared.write(folder/'state.json',state);print('Session stopped:',state['error'],flush=True)
    finally:
        for p in children:p.terminate()
        for p in children:
            try:p.wait(10)
            except subprocess.TimeoutExpired:p.kill();p.wait()
        for out in logs:out.close()
        try:shared.cleanup(state,finished)
        except Exception:
            print('Manual cleanup: python3 scripts/aws-k6/session.py cleanup '+str(folder)+(' --complete' if finished else ''),flush=True)
            if state.get('instance_id'):print('aws --profile avengers-k6 --region ap-southeast-2 ec2 terminate-instances --instance-ids '+state['instance_id'],flush=True)
            raise
    if state.get('error') or state.get('stop_reason'):raise SystemExit(1)

if __name__=='__main__':start()
