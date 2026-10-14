#!/usr/bin/env python3
"""3K controller: outbound control only; reverse SSH data; owned cleanup finally.

One generator initially. Never invokes the historical Quick Tunnel data workflow.
"""
import argparse, base64, contextlib, datetime as dt, gzip, hashlib, importlib.util, io
import ipaddress, json, os, re, secrets, signal, subprocess, time, uuid
from pathlib import Path
import session as shared
ROOT=shared.ROOT;cap=shared.cap
TAGS={'Project':'avengers-coffee','Purpose':'k6-3k-capacity','ManagedBy':'codex-local','Phase':'3k-qualification'}
shared.TAGS=TAGS
BASE='http://127.0.0.1:13300'

def ownership(state):
    if not re.fullmatch(r'3k-\d{8}T\d{6}Z-[a-f0-9]{6}',state.get('run_id','')):
        raise RuntimeError('Invalid 3k session ownership')
    shared.KEY='avengers-'+state['run_id']

def stable_tcp_source(private):
    addresses=[private.get('tcp443_stun_'+str(i)) for i in range(3)]
    if any(not x for x in addresses):raise RuntimeError('Three fresh TCP443 egress observations required before AWS launch')
    if len(set(addresses))!=1:raise RuntimeError('TCP443 egress changes per connection; stopping before AWS launch')
    return addresses[0]

def cleanup(state):
    ownership(state)
    # Discover all ownership tags after a lost AWS response as well.
    shared.cleanup(state,False)
    folder=Path(state['folder'])
    keys=shared.aws('ec2','describe-key-pairs','--filters',f'Name=key-name,Values={shared.KEY}')['KeyPairs']
    for key in keys:
        if not shared.owned(key.get('Tags'),state['run_id']):raise RuntimeError('Key ownership differs; refusing deletion')
        if state.get('key_pair_id') and key['KeyPairId']!=state['key_pair_id']:raise RuntimeError('Key identity changed')
        shared.aws('ec2','delete-key-pair','--key-pair-id',key['KeyPairId'])
    if shared.aws('ec2','describe-key-pairs','--filters',f'Name=key-name,Values={shared.KEY}')['KeyPairs']:
        raise RuntimeError('Key cleanup incomplete')
    for name in ['temporary-key.pem','control-token','user-data.sh','control-job.json','known_hosts']:
        (folder/name).unlink(missing_ok=True)
    result=json.loads((folder/'cleanup.json').read_text());result.update(remote_key_deleted=True,private_bootstrap_artifacts_removed=True,nat_or_firewall_changed=False,finished_at=cap.now())
    shared.write(folder/'cleanup.json',result)

def preflight(folder):
    if os.getenv('K8S_DB_MODE')!='existing' or os.getenv('AWS_PROFILE')!='avengers-k6':raise RuntimeError('Explicit profile and existing DB required')
    if shared.call(['aws','--profile','avengers-k6','configure','get','region']).stdout.strip()!=shared.REGION:raise RuntimeError('Wrong profile region')
    shared.aws('sts','get-caller-identity')
    live=[i for r in shared.aws('ec2','describe-instances','--filters','Name=tag:Project,Values=avengers-coffee','Name=tag:ManagedBy,Values=codex-local')['Reservations'] for i in r['Instances'] if i['State']['Name']!='terminated']
    if live:raise RuntimeError('Existing owned instance; reconcile before launch')
    flags=shared.call(cap.K+['-n','avengers-coffee','get','configmap','avengers-common','-o','jsonpath={.data.K8S_DEMO_READ_ONLY} {.data.PUBLIC_BROWSE_CACHE_TTL_MS}']).stdout.strip()
    if flags!='true 5000':raise RuntimeError('Read-only/cache policy changed')
    if shared.call(['docker','info','--format','{{.NCPU}} {{.MemTotal}}']).stdout.strip()!='8 8319770624':raise RuntimeError('Docker allocation changed')
    for service in ['redis-cache','rabbitmq']:
        ids=shared.call(['docker','compose','ps','-q',service]).stdout.split()
        if len(ids)!=1 or shared.call(['docker','inspect','--format','{{.State.Health.Status}}',ids[0]]).stdout.strip()!='healthy':raise RuntimeError('Infra not healthy')
    with (folder/'preflight-recovery.jsonl').open('w') as out:cap.wait_recovery(out,720)
    for argv in [['python3','scripts/k8s/environment.py','audit'],['bash','scripts/k8s/check-connectivity.sh'],['bash','scripts/k8s/smoke.sh']]:
        (folder/(Path(argv[-1]).stem+'-preflight.txt')).write_text(shared.call(argv,120).stdout)

def userdata(state):
    folder=Path(state['folder'])
    content='#!/bin/bash\nset -eu\numask 077\nshutdown -h +230 >/dev/null\nmkdir -p /root/avengers-k6 /run/sshd\ncd /root/avengers-k6\n'
    data={p.name:p.read_bytes() for p in [ROOT/'scripts/aws-k6/bootstrap.sh',ROOT/'scripts/aws-k6/worker-3k.py',ROOT/'scripts/aws-k6/metrics-3k.py',ROOT/'load-tests/k6/customer-browse-3k.js']}
    data['remote-metrics.py']=data.pop('metrics-3k.py')
    data.update({'control-url':state['control_url'].encode(),'control-token':(folder/'control-token').read_bytes()})
    data['sshd-benchmark.conf']=b'''Port 443
ListenAddress 0.0.0.0
HostKey /etc/ssh/ssh_host_ed25519_key
PidFile /run/sshd-benchmark.pid
AuthorizedKeysFile .ssh/authorized_keys
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
AllowUsers ubuntu
AllowTcpForwarding remote
GatewayPorts no
PermitListen 127.0.0.1:13300 127.0.0.1:13301 127.0.0.1:13302 127.0.0.1:13303
PermitTTY no
X11Forwarding no
ForceCommand /bin/false
'''
    for name,body in data.items():content+='printf %s '+base64.b64encode(gzip.compress(body,mtime=0)).decode()+' | base64 -d | gzip -d > '+name+'\n'
    content+='/usr/sbin/sshd -f /root/avengers-k6/sshd-benchmark.conf\nK6_INSTALL_DIR=/root/avengers-k6 bash bootstrap.sh\nexec python3 worker-3k.py\n'
    if len(content.encode())>16384:raise RuntimeError('EC2 user-data exceeds limit')
    p=folder/'user-data.sh';p.write_text(content);p.chmod(0o600)

def submit(state,job,timeout):
    root=Path(state['folder']);shared.write(root/'control-job.json',job)
    until=time.monotonic()+timeout
    while time.monotonic()<until:
        if (root/'abort-request.json').exists():raise RuntimeError('Safety observer abort')
        p=root/(job['job_id']+'-status.json')
        if p.exists():
            result=json.loads(p.read_text())
            if result['phase']=='failed':raise RuntimeError('Fixed worker operation failed; evidence retained')
            if result['phase']=='complete':(root/'control-job.json').unlink(missing_ok=True);return result
        time.sleep(3)
    raise RuntimeError('Worker job timeout')

def ssh_args(state):
    root=Path(state['folder'])
    return ['ssh','-v','-F','/dev/null','-i',str(root/'temporary-key.pem'),'-p','443','-N',
            '-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','ExitOnForwardFailure=yes',
            '-o','ConnectTimeout=10','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3',
            '-o','StrictHostKeyChecking=accept-new','-o','UserKnownHostsFile='+str(root/'known_hosts'),
            '-R','127.0.0.1:13300:127.0.0.1:18080','ubuntu@'+state['public_ip']]

def start():
    run='3k-'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:6]
    folder=Path('/tmp/avengers-aws-k6-3k')/run;folder.mkdir(parents=True,mode=0o700)
    state={'run_id':run,'folder':str(folder),'started_at':cap.now(),'requested_instance_type':'m7i-flex.large','bootstrap_mode':'https-userdata','target_url':BASE,'data_path':'independent reverse SSH, loopback EC2 -> Mac GET allowlist -> IPv4 Docker LoadBalancer'}
    ownership(state);shared.write(folder/'state.json',state);print('SESSION:',folder,flush=True)
    children=[];logs=[]
    def abort(*args):raise KeyboardInterrupt()
    signal.signal(signal.SIGINT,abort);signal.signal(signal.SIGTERM,abort)
    def spawn(argv,name,env={}):
        log=(folder/(name+'.log')).open('w');logs.append(log)
        p=subprocess.Popen(argv,cwd=ROOT,env={**os.environ,**env},stdout=log,stderr=log);children.append(p);return p
    try:
        preflight(folder)
        address_file=folder.parent/'network-private.json'
        if time.time()-address_file.stat().st_mtime>600:raise RuntimeError('Egress observations expired; run read-only diagnostics first')
        private=json.loads(address_file.read_text())
        source_ips=[stable_tcp_source(private)]
        if any(not ipaddress.ip_address(ip).is_global for ip in source_ips):raise RuntimeError('Non-global source address')
        (folder/'control-token').write_text(secrets.token_hex(32));(folder/'control-token').chmod(0o600)
        spawn(['node','scripts/aws-k6/public-ingress.cjs'],'ingress',{'INGRESS_METRICS':str(folder/'ingress.jsonl')})
        spawn(['node','scripts/aws-k6/control-3k.cjs'],'control',{'CONTROL_FOLDER':str(folder)})
        spawn(['cloudflared','tunnel','--url','http://127.0.0.1:18082','--metrics','127.0.0.1:18083','--no-autoupdate'],'control-tunnel')
        until=time.monotonic()+120
        while time.monotonic()<until:
            m=re.search(r'https://[a-z0-9-]+\.trycloudflare\.com',(folder/'control-tunnel.log').read_text())
            if m:state['control_url']=m.group();break
            if any(p.poll() is not None for p in children):raise RuntimeError('Control startup failed')
            time.sleep(2)
        else:raise RuntimeError('Control tunnel unavailable')
        key=shared.aws('ec2','create-key-pair','--key-name',shared.KEY,'--key-type','ed25519','--tag-specifications',shared.tag_specs(run,['key-pair']))
        state['key_pair_id']=key['KeyPairId'];shared.write(folder/'state.json',state)
        p=folder/'temporary-key.pem';p.write_text(key.pop('KeyMaterial'));p.chmod(0o400);del key
        userdata(state)
        # Historical launch prints a historical cleanup command. Use this phase's
        # ownership-aware recovery command; never direct users to 5K cleanup.
        with contextlib.redirect_stdout(io.StringIO()):shared.launch(state)
        print('Owned instance:',state['instance_id'],'; recovery: python3 scripts/aws-k6/phase-3k.py cleanup',folder,flush=True)
        permissions=[{'IpProtocol':'tcp','FromPort':443,'ToPort':443,'IpRanges':[{'CidrIp':ip+'/32','Description':'Observed Mac egress, benchmark SSH only'} for ip in source_ips]}]
        shared.aws('ec2','authorize-security-group-ingress','--group-id',state['sg_id'],'--ip-permissions',json.dumps(permissions))
        shared.write(folder/'security-policy.json',{'public_inbound':[{'port':443,'source':'observed Mac egress IPv4 /32','source_count':len(source_ips)}],'forward_bind':'127.0.0.1:13300','nat_or_firewall_changed':False,'control_only_cloudflare':True})
        until=time.monotonic()+300
        while time.monotonic()<until:
            if (folder/'boot.json').exists():break
            time.sleep(5)
        else:raise RuntimeError('Outbound worker boot unavailable')
        boot=json.loads((folder/'boot.json').read_text())
        if not boot.get('ssh_listener_ready') or boot['workload_sha256']!=hashlib.sha256((ROOT/'load-tests/k6/customer-browse-3k.js').read_bytes()).hexdigest():raise RuntimeError('Boot identity/data-plane listener mismatch')
        print('Native k6 boot verified; establishing reverse SSH on restricted TCP 443.',flush=True)
        tunnel=spawn(ssh_args(state),'data-ssh')
        until=time.monotonic()+25
        while time.monotonic()<until:
            if 'remote forward success' in (folder/'data-ssh.log').read_text():break
            if tunnel.poll() is not None:raise RuntimeError('Reverse SSH unavailable (no data traffic sent)')
            time.sleep(1)
        else:raise RuntimeError('Reverse SSH forwarding readiness timed out (no data traffic sent)')
        job='network-baseline';(folder/job).mkdir();shared.write(folder/job/'metadata.json',{'kind':'network','started_at':cap.now()})
        submit(state,{'job_id':job,'action':'network','target_url':BASE},360)
        rows=json.loads((folder/job/'network.json').read_text())['samples']
        if len(rows)!=80 or any(r['http_code']!=200 for r in rows):raise RuntimeError('Network baseline incomplete or failed')
        state['ready']=True;shared.write(folder/'state.json',state);print('READY: non-Quick-Tunnel data plane, 80 curl samples.',flush=True)
        deadline=dt.datetime.fromisoformat(state['launched_at'])+dt.timedelta(minutes=225)
        while dt.datetime.now(dt.timezone.utc)<deadline:
            if any(p.poll() is not None for p in children):raise RuntimeError('Owned data/control process exited')
            command=folder/'command.json'
            if not command.exists():time.sleep(2);continue
            task=json.loads(command.read_text());command.rename(folder/('command-'+str(time.time_ns())+'.json'))
            if task['action']=='finish':break
            if task['action']!='run':raise RuntimeError('Unknown fixed command')
            state['busy']=True;shared.write(folder/'state.json',state)
            result=run_load(state,task['vus'],task['label'],task.get('hold',120))
            shared.write(folder/'last-command.json',{'result':result,'finished_at':cap.now()});state['busy']=False;shared.write(folder/'state.json',state)
        else:raise RuntimeError('Bounded runtime guard')
    except BaseException as error:
        state['error']=str(error) or type(error).__name__;shared.write(folder/'state.json',state);print('Stopped:',state['error'],flush=True)
    finally:
        for p in children:
            if p.poll() is None:p.terminate()
        for p in children:
            try:p.wait(10)
            except subprocess.TimeoutExpired:p.kill();p.wait()
        for log in logs:log.close()
        cleanup(state)
    if state.get('error'):raise SystemExit(1)

host_spec=importlib.util.spec_from_file_location('legacy3k',ROOT/'scripts/aws-k6/legacy-3k.py')
host_module=importlib.util.module_from_spec(host_spec);host_spec.loader.exec_module(host_module)
host=host_module.host

def run_load(state,vus,label,hold=120):
    if not 1<=vus<=3000 or not hold in [120,300] or not re.fullmatch('[A-Za-z0-9_-]+',label):raise RuntimeError('Invalid workload')
    root=Path(state['folder']);folder=root/f'{dt.datetime.now(dt.timezone.utc):%Y%m%dT%H%M%SZ}-{label}-{vus}';folder.mkdir()
    boot=json.loads((root/'boot.json').read_text())
    meta={'started_at':cap.now(),'vus':vus,'think_seconds':3,'cache_ms':5000,'accept_encoding':'gzip','ramp_seconds':60,
        'hold_seconds':hold,'down_seconds':30 if hold==120 else 60,'target_url':state['target_url'],
        'target_classification':'EC2 loopback -> reverse SSH -> Mac GET allowlist -> IPv4 Docker LoadBalancer',
        'instance_id':state['instance_id'],'instance_type':state['instance_type'],'aws_region':shared.REGION,
        'k6_version':boot['k6_version'],'k6_sha256':boot['k6_sha256'],'source_head':shared.call(['git','rev-parse','HEAD']).stdout.strip(),
        'workload_sha256':hashlib.sha256((ROOT/'load-tests/k6/customer-browse-3k.js').read_bytes()).hexdigest()}
    meta['generator_partition']=[{'instance_id':state['instance_id'],'vus':vus}]
    meta['dirty_diff']=shared.call(['git','diff','--stat']).stdout
    if boot['workload_sha256']!=meta['workload_sha256']:raise RuntimeError('Workload changed after boot')
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
                    r=cap.snapshot();r.update(host());r['phase']=phase[0]
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
        print('External reverse-SSH worker run:',folder.name,flush=True)
        result=submit(state,{'job_id':folder.name,'action':'run','target_url':state['target_url'],'vus':vus,'hold':hold},60+hold+meta['down_seconds']+240)
        meta['load_started_at']=result['load_started_at'];meta['load_finished_at']=result['load_finished_at'];meta['artifact_delivery_finished_at']=result['observed_at'];meta['k6_exit']=result['exit'];phase[0]='cooldown'
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



if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['start','cleanup','finish','run']);p.add_argument('folder',type=Path,nargs='?');p.add_argument('vus',type=int,nargs='?');p.add_argument('label',nargs='?');p.add_argument('--hold',type=int,choices=[120,300],default=120);a=p.parse_args()
    if a.action=='start':start()
    else:
        state=json.loads((a.folder/'state.json').read_text());ownership(state)
        if a.action=='cleanup':cleanup(state)
        else:
            if (a.folder/'cleanup.json').exists() or state.get('busy') or not state.get('ready'):p.error('Session unavailable or busy')
            if a.action=='run' and (not a.vus or not 1<=a.vus<=3000 or not re.fullmatch('[A-Za-z0-9_-]+',a.label or '')):p.error('Invalid fixed run')
            if (a.folder/'command.json').exists():p.error('Command pending')
            shared.write(a.folder/'command.json',{'action':a.action,'vus':a.vus,'label':a.label,'hold':a.hold})
