#!/usr/bin/env python3
"""One owned EC2, bounded session, explicit command inbox, finally cleanup.

State and IPs stay in a private /tmp directory. No credentials are exported.
Use AWS_PROFILE=avengers-k6 K8S_DB_MODE=existing python3 .../session.py start.
Other commands: run STATE VUS LABEL [--hold 300], network STATE, finish STATE.
"""
import argparse, datetime as dt, hashlib, importlib.util, ipaddress, json, os
from pathlib import Path
import re, signal, subprocess, sys, threading, time, uuid

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'scripts/k8s'))
import capacity as cap
spec = importlib.util.spec_from_file_location('summary', ROOT/'scripts/k8s/summarize-capacity.py')
summary = importlib.util.module_from_spec(spec); spec.loader.exec_module(summary)
REGION = 'ap-southeast-2'
KEY = 'avengers-k6-temp'
TAGS = {'Project':'avengers-coffee','Purpose':'k6-capacity','ManagedBy':'codex-local','Phase':'5k-qualification'}
ROUTES = ['/menu/danh-muc','/menu/san-pham','/users/branches/public','/news?limit=100']

def write(path, data):
    tmp = path.with_suffix(path.suffix+'.tmp'); tmp.write_text(json.dumps(data,indent=2)+'\n'); tmp.replace(path)

def call(argv, timeout=60, check=True):
    p = subprocess.run(argv, cwd=ROOT, text=True, capture_output=True, timeout=timeout)
    if check and p.returncode: raise RuntimeError(f'{Path(argv[0]).name} operation failed ({p.returncode}); output suppressed')
    return p

def aws(*args, check=True):
    p = call(['aws','--profile','avengers-k6','--region',REGION,*args,'--output','json'],check=False)
    if check and p.returncode:
        # AWS command args contain no credentials. Never forward encoded authorization messages.
        match=re.search(r'An error occurred \(([^)]+)\).*?operation: (.*)',p.stderr)
        detail=(match.group(1)+': '+match.group(2).split('Encoded authorization')[0][:350]) if match else f'CLI exit {p.returncode}'
        raise RuntimeError(f'AWS {args[0]}/{args[1]} failed: {detail}')
    return (json.loads(p.stdout) if p.stdout.strip() else {}) if p.returncode == 0 else None

def filters(run=None):
    return [f'Name=tag:{k},Values={v}' for k,v in {**TAGS,**({'RunId':run} if run else {})}.items()]

def owned(tags, run):
    return all({x['Key']:x['Value'] for x in tags or []}.get(k)==v for k,v in {**TAGS,'RunId':run}.items())

def tag_specs(run, kinds):
    return json.dumps([{'ResourceType':kind,'Tags':[{'Key':k,'Value':v} for k,v in
           {**TAGS,'RunId':run,'Name':'avengers-k6-loadgen'}.items()]} for kind in kinds])

def ssh_args(state):
    return ['ssh','-F','/dev/null','-i',str(Path.home()/'.ssh/avengers-k6-temp.pem'),'-o','BatchMode=yes',
            '-o','IdentitiesOnly=yes','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3',
            '-o','ControlMaster=auto','-o','ControlPersist=600','-o',f'ControlPath={state["folder"]}/c',
            '-o','ConnectTimeout=10','-o','StrictHostKeyChecking=accept-new',
            '-o',f'UserKnownHostsFile={state["folder"]}/known_hosts',f'ubuntu@{state["public_ip"]}']

def remote(state, script, timeout=60, check=True):
    p=call(ssh_args(state)+[script],timeout,False)
    if check and p.returncode:
        (Path(state['folder'])/'ssh-error.txt').write_text(p.stderr)
        raise RuntimeError(f'SSH exit {p.returncode}: {p.stderr[-350:].strip()}')
    return p

def upload(state, paths):
    args = ssh_args(state)
    return call(['scp',*args[1:-1],*[str(p) for p in paths],args[-1]+':avengers-k6/'],120)

def preflight(folder):
    if os.getenv('AWS_PROFILE','avengers-k6') != 'avengers-k6' or os.getenv('K8S_DB_MODE') != 'existing':
        raise RuntimeError('Requires AWS_PROFILE=avengers-k6 and K8S_DB_MODE=existing')
    if os.getenv('AWS_REGION',REGION)!=REGION or os.getenv('AWS_DEFAULT_REGION',REGION)!=REGION:
        raise RuntimeError('Unexpected AWS region')
    if call(['aws','--profile','avengers-k6','configure','get','region']).stdout.strip()!=REGION:
        raise RuntimeError('Profile region must be ap-southeast-2')
    key = Path.home()/'.ssh/avengers-k6-temp.pem'
    if key.stat().st_mode & 0o077: raise RuntimeError('Private key permissions too broad')
    aws('sts','get-caller-identity') # No credentials / key file contents inspected.
    keys=aws('ec2','describe-key-pairs','--key-names',KEY)['KeyPairs']
    if len(keys)!=1: raise RuntimeError('Existing remote key required; do not guess replacement')
    live=[i for r in aws('ec2','describe-instances','--filters',*filters())['Reservations']
          for i in r['Instances'] if i['State']['Name'] not in ['terminated','shutting-down']]
    if live: raise RuntimeError('Owned EC2 already exists; reconcile, do not launch duplicates')
    flags=call(cap.K+['-n','avengers-coffee','get','configmap','avengers-common','-o',
        'jsonpath={.data.K8S_DEMO_READ_ONLY} {.data.PUBLIC_BROWSE_CACHE_TTL_MS}']).stdout.strip()
    if flags != 'true 5000': raise RuntimeError('Read-only and unchanged 5s cache required')
    for name in ['redis-cache','rabbitmq']:
        ids=call(['docker','compose','ps','-q',name]).stdout.split()
        if len(ids)!=1 or call(['docker','inspect','--format','{{.State.Health.Status}}',ids[0]]).stdout.strip()!='healthy':
            raise RuntimeError(f'{name} not healthy')
    with (folder/'preflight-recovery.jsonl').open('w') as out: cap.wait_recovery(out,720)
    for args in [['python3','scripts/k8s/environment.py','audit'],['bash','scripts/k8s/check-connectivity.sh'],
                 ['bash','scripts/k8s/smoke.sh']]:
        p=call(args,120); (folder/(Path(args[-1]).stem+'-preflight.txt')).write_text(p.stdout)
    return keys[0]['KeyPairId']

def launch(state):
    run=state['run_id']; folder=Path(state['folder'])
    instance_type=state['requested_instance_type']
    architecture='arm64' if instance_type=='c7g.xlarge' else 'x86_64'
    image_arch='arm64' if architecture=='arm64' else 'amd64'
    it=aws('ec2','describe-instance-types','--instance-types',instance_type)['InstanceTypes'][0]
    if it['VCpuInfo']['DefaultVCpus']!=(4 if architecture=='arm64' else 2) or it['MemoryInfo']['SizeInMiB']!=8192 or architecture not in it['ProcessorInfo']['SupportedArchitectures']:
        raise RuntimeError('Unexpected instance type')
    # Recheck the originally requested c7g once after AWS additional validation.
    # A rejected live request creates no instance; never change account plan.
    image=sorted(aws('ec2','describe-images','--owners','099720109477','--filters',
        f'Name=name,Values=ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-{image_arch}-server-*',
        'Name=state,Values=available',f'Name=architecture,Values={architecture}')['Images'],key=lambda x:x['CreationDate'])[-1:]
    if not image or image[0]['OwnerId']!='099720109477': raise RuntimeError('No compatible Canonical Ubuntu image')
    zones={x['Location'] for x in aws('ec2','describe-instance-type-offerings','--location-type','availability-zone',
        '--filters',f'Name=instance-type,Values={instance_type}')['InstanceTypeOfferings']}
    vpc=aws('ec2','describe-vpcs','--filters','Name=is-default,Values=true')['Vpcs']
    if len(vpc)!=1: raise RuntimeError('Expected one default VPC')
    subnets=aws('ec2','describe-subnets','--filters',f'Name=vpc-id,Values={vpc[0]["VpcId"]}')['Subnets']
    subnet=next(s for s in subnets if s['AvailabilityZone'] in zones and s['MapPublicIpOnLaunch'] and s['AvailableIpAddressCount']>10)
    sg=aws('ec2','create-security-group','--group-name','avengers-k6-'+run,'--description','Temporary owned read-only capacity generator',
        '--vpc-id',vpc[0]['VpcId'],'--tag-specifications',tag_specs(run,['security-group']))['GroupId']
    state['sg_id']=sg; write(folder/'state.json',state)
    # Resolve runtime IP directly into AWS rule; do not log/persist the Mac public IP.
    if state.get('bootstrap_mode')!='https-userdata':
        mac_ip=call(['curl','-q','-4','--noproxy','*','-fsS','--max-time','15','https://checkip.amazonaws.com']).stdout.strip()
        ipaddress.IPv4Address(mac_ip)
        aws('ec2','authorize-security-group-ingress','--group-id',sg,'--ip-permissions',json.dumps([
            {'IpProtocol':'tcp','FromPort':22,'ToPort':22,'IpRanges':[{'CidrIp':mac_ip+'/32','Description':'Temporary Mac SSH'}]}]))
    root=image[0]['RootDeviceName']
    userdata=['--user-data','file://'+state['folder']+'/user-data.sh'] if state.get('bootstrap_mode')=='https-userdata' else []
    r=aws('ec2','run-instances',*userdata,'--image-id',image[0]['ImageId'],'--instance-type',instance_type,
        '--count','1','--client-token',run,'--key-name',KEY,
        '--network-interfaces',json.dumps([{'DeviceIndex':0,'SubnetId':subnet['SubnetId'],'Groups':[sg],'AssociatePublicIpAddress':True}]),
        '--block-device-mappings',json.dumps([{'DeviceName':root,'Ebs':{'VolumeSize':20,'VolumeType':'gp3','DeleteOnTermination':True}}]),
        '--metadata-options','HttpTokens=required,HttpEndpoint=enabled',
        '--instance-initiated-shutdown-behavior','terminate','--tag-specifications',tag_specs(run,['instance','volume']))['Instances'][0]
    state.update(instance_id=r['InstanceId'],launched_at=r['LaunchTime'],ami=image[0]['ImageId'],
        instance_type=instance_type,architecture=architecture,az=r['Placement']['AvailabilityZone'],root_delete_on_termination=True)
    write(folder/'state.json',state)
    print('Owned instance:',state['instance_id'],'; cleanup: python3 scripts/aws-k6/session.py cleanup',folder,flush=True)
    deadline=time.monotonic()+360
    while time.monotonic()<deadline:
        instance=aws('ec2','describe-instances','--instance-ids',state['instance_id'])['Reservations'][0]['Instances'][0]
        if instance['State']['Name']=='running' and instance.get('PublicIpAddress'):
            state['public_ip']=instance['PublicIpAddress']; write(folder/'state.json',state)
            statuses=aws('ec2','describe-instance-status','--instance-ids',state['instance_id'])['InstanceStatuses']
            if statuses and all(statuses[0][s]['Status']=='ok' for s in ['InstanceStatus','SystemStatus']): break
        time.sleep(10)
    else: raise RuntimeError('EC2 healthy wait timed out')
    if state.get('bootstrap_mode')=='https-userdata':return
    deadline=time.monotonic()+180
    while time.monotonic()<deadline:
        if remote(state,'true',check=False).returncode==0: break
        time.sleep(5)
    else: raise RuntimeError('SSH unavailable')
    remote(state,'mkdir -p avengers-k6')
    upload(state,[ROOT/'scripts/aws-k6/bootstrap.sh',ROOT/'scripts/aws-k6/remote-metrics.py',ROOT/'load-tests/k6/customer-browse-5k.js'])
    p=remote(state,'bash avengers-k6/bootstrap.sh',180,False); (folder/'bootstrap.txt').write_text(p.stdout)
    if p.returncode:
        (folder/'bootstrap-error.txt').write_text(p.stderr)
        raise RuntimeError(f'Bootstrap SSH exit {p.returncode}; diagnostic retained (no credentials)')
    print('Native Linux '+state['architecture']+' k6 bootstrap complete.',flush=True)

def network(state, label):
    folder=Path(state['folder']); target=state['target_url']
    # curl output records timings/sizes/status only, never body/header contents.
    rows=[]
    for path in ROUTES:
        for repeat in range(3):
            p=remote(state, "curl --compressed --fail --silent --show-error --max-time 15 -o /dev/null -w "
                "'%{http_code} %{time_namelookup} %{time_connect} %{time_appconnect} %{time_starttransfer} %{time_total} %{size_download} %{speed_download}' "
                +target+path)
            values=p.stdout.split(); rows.append({'route':path,'repeat':repeat,'http_code':int(values[0]),
                **dict(zip(['dns_s','connect_s','tls_s','ttfb_s','total_s','wire_bytes','bytes_per_s'],map(float,values[1:])))})
    write(folder/('network-'+label+'.json'),{'observed_at':cap.now(),'target_classification':'HTTPS Quick Tunnel -> GET allowlist -> Mac IPv4 Kubernetes LoadBalancer','samples':rows})
    print('Network baseline:',label,'max request s=',max(r['total_s'] for r in rows),flush=True)

def run(state,vus,label,hold):
    if not 1<=vus<=5000 or not 120<=hold<=600 or not re.fullmatch('[A-Za-z0-9_-]+',label): raise RuntimeError('Invalid run parameters')
    folder=Path(state['folder'])/f'{dt.datetime.now(dt.timezone.utc):%Y%m%dT%H%M%SZ}-{label}-{vus}'; folder.mkdir()
    meta={'started_at':cap.now(),'vus':vus,'think_seconds':3,'cache_ms':5000,'accept_encoding':'gzip',
        'ramp_seconds':60,'hold_seconds':hold,'down_seconds':30 if hold==120 else 60,
        'target_classification':'AWS EC2 -> HTTPS Quick Tunnel -> allowlist ingress -> 127.0.0.1:3000 Docker Desktop LoadBalancer',
        'target_url':state['target_url'],'source_head':call(['git','rev-parse','HEAD']).stdout.strip(),
        'workload_sha256':hashlib.sha256((ROOT/'load-tests/k6/customer-browse-5k.js').read_bytes()).hexdigest(),
        'instance_id':state['instance_id'],'instance_type':state['instance_type'],'aws_region':REGION,
        'k6_version':remote(state,'avengers-k6/k6 version').stdout.strip(),
        'k6_sha256':remote(state,'sha256sum avengers-k6/k6').stdout.split()[0]}
    write(folder/'metadata.json',meta)
    # Revalidate flags, infra, DB connectivity, Ready baseline and overlap for each major run.
    preflight_run=call(cap.K+['-n','avengers-coffee','get','configmap','avengers-common','-o','jsonpath={.data.K8S_DEMO_READ_ONLY} {.data.PUBLIC_BROWSE_CACHE_TTL_MS}']).stdout.strip()
    if preflight_run!='true 5000': raise RuntimeError('Guard policy changed')
    for args in [['python3','scripts/k8s/environment.py','audit'],['bash','scripts/k8s/check-connectivity.sh']]:
        p=call(args,120); (folder/(Path(args[-1]).stem+'-before.txt')).write_text(p.stdout)
    with (folder/'pre-cooldown.jsonl').open('w') as out: before=cap.wait_recovery(out,720)
    write(folder/'before.json',before)
    p=call(['bash','scripts/k8s/smoke.sh'],120); (folder/'smoke-before.txt').write_text(p.stdout)
    states=aws('ec2','describe-instance-status','--instance-ids',state['instance_id'])['InstanceStatuses']
    if not states or any(states[0][s]['Status']!='ok' for s in ['InstanceStatus','SystemStatus']): raise RuntimeError('Loadgen unhealthy')
    remote(state,'curl --compressed --fail --silent --max-time 15 -o /dev/null '+state['target_url']+'/menu/danh-muc')
    upload(state,[ROOT/'load-tests/k6/customer-browse-5k.js'])
    stop=threading.Event(); samples=[]; phase=['preload']; observer_errors=[]
    def observe():
        try:
            with (folder/'observer.jsonl').open('w') as out:
                while not stop.is_set():
                    r=cap.snapshot(); r['phase']=phase[0]
                    r['host']='\n'.join(l for l in cap.command(['top','-l','1','-n','0'])[1].splitlines() if l.startswith(('CPU usage:','PhysMem:','Load Avg:','VM:')))
                    r['gateway_cgroups']={}
                    for p in r['pods']:
                        if p['app']=='api-gateway' and p['phase']=='Running' and not p['deleting']:
                            c,t=cap.command(cap.K+['-n','avengers-coffee','exec',p['name'],'--','cat','/sys/fs/cgroup/cpu.stat','/sys/fs/cgroup/memory.events'])
                            if not c: r['gateway_cgroups'][p['uid']]=dict(l.split() for l in t.splitlines() if len(l.split())==2)
                    samples.append(r); out.write(json.dumps(r)+'\n'); out.flush(); stop.wait(10)
        except Exception: observer_errors.append('local observer failed')
    observer=threading.Thread(target=observe); observer.start()
    remote_script=f'''set -eu
cd avengers-k6
mkdir -p {folder.name}
ulimit -n 65536
ulimit -n > {folder.name}/fd-limit.txt
python3 remote-metrics.py > {folder.name}/generator.jsonl &
observer=$!
trap 'kill "$observer" 2>/dev/null || true' EXIT INT TERM
set +e
BASE_URL={state['target_url']} THINK_SECONDS=3 CAPACITY_VUS={vus} CAPACITY_HOLD_SECONDS={hold} SUMMARY_FILE={folder.name}/k6.json ./k6 run --new-machine-readable-summary=false --out json={folder.name}/http-points.jsonl customer-browse-5k.js > {folder.name}/k6.log 2>&1
code=$?
set -e
printf '%s\\n' "$code" > {folder.name}/exit.txt
gzip {folder.name}/http-points.jsonl
exit 0
'''
    meta['load_started_at']=cap.now(); write(folder/'metadata.json',meta); phase[0]='load'
    print('External run:',folder.name,'60/',hold,'/',meta['down_seconds'],flush=True)
    try:
        p=remote(state,remote_script,60+hold+meta['down_seconds']+120)
        meta['load_finished_at']=cap.now(); phase[0]='cooldown'
        scp=ssh_args(state)
        filenames=['k6.json','k6.log','generator.jsonl','exit.txt','fd-limit.txt','http-points.jsonl.gz']
        call(['scp',*scp[1:-1],*[scp[-1]+':avengers-k6/'+folder.name+'/'+n for n in filenames],str(folder)+'/'],180)
        meta['k6_exit']=int((folder/'exit.txt').read_text())
        print('Load done; natural cooldown.',flush=True)
        with (folder/'post-cooldown.jsonl').open('w') as out: after=cap.wait_recovery(out,720)
        write(folder/'after.json',after)
        p=call(['bash','scripts/k8s/smoke.sh'],120,False); (folder/'smoke-after.txt').write_text(p.stdout)
        issues=cap.violations(before,samples+[after])+observer_errors
        if p.returncode: issues.append('post-load smoke failed')
        if len(samples)<3: issues.append('insufficient observer coverage')
        data=json.loads((folder/'k6.json').read_text())
        passed=meta['k6_exit']==0 and bool(data.get('metrics')) and all(t['ok'] for m in data['metrics'].values() for t in m.get('thresholds',{}).values())
        result={'status':'STABLE PASS' if passed and not issues else 'UNSTABLE' if passed else 'FAIL',
            'http_pass':passed,'stable':not issues,'violations':sorted(set(issues)),'smoke_after_exit':p.returncode}
        write(folder/'result.json',result)
        print(json.dumps(result),flush=True)
    except BaseException:
        # Kill only this session's remote k6; no unrelated process manipulation.
        remote(state,'pkill -INT -x k6 || true',check=False)
        write(folder/'result.json',{'status':'ABORTED','http_pass':False,'stable':False,'reason':'harness error; see phase state'})
        raise
    finally:
        stop.set(); observer.join(timeout=45); meta['finished_at']=cap.now(); write(folder/'metadata.json',meta)
    summary.summarize(folder)
    return str(folder)

def cleanup(state, complete=False):
    folder=Path(state['folder']); run=state['run_id']; evidence={'started_at':cap.now(),'run_id':run}
    # Discovery also recovers IDs if the launch response was lost after AWS accepted it.
    reservations=aws('ec2','describe-instances','--filters',*filters(run))['Reservations']
    instances=[i for r in reservations for i in r['Instances'] if owned(i.get('Tags'),run)]
    ids=[i['InstanceId'] for i in instances if i['State']['Name']!='terminated']
    if ids: aws('ec2','terminate-instances','--instance-ids',*ids)
    deadline=time.monotonic()+300
    while ids and time.monotonic()<deadline:
        rows=aws('ec2','describe-instances','--instance-ids',*ids)['Reservations']
        if all(i['State']['Name']=='terminated' for r in rows for i in r['Instances']): break
        time.sleep(5)
    else:
        if ids: raise RuntimeError('Termination wait timed out; IDs retained in state')
    evidence['terminated_instance_ids']=[i['InstanceId'] for i in instances]
    vols=aws('ec2','describe-volumes','--filters',*filters(run))['Volumes']
    for v in vols:
        if not owned(v.get('Tags'),run): continue
        if v['State']!='available' or v.get('Attachments'): raise RuntimeError('Owned volume still attached; retry cleanup')
        aws('ec2','delete-volume','--volume-id',v['VolumeId'])
    groups=aws('ec2','describe-security-groups','--filters',*filters(run))['SecurityGroups']
    for g in groups:
        if not owned(g.get('Tags'),run): continue
        for attempt in range(18):
            if aws('ec2','delete-security-group','--group-id',g['GroupId'],check=False) is not None: break
            time.sleep(5)
        else: raise RuntimeError('SG detach wait failed; retry owned cleanup')
    evidence['deleted_group_ids']=[g['GroupId'] for g in groups]
    if complete:
        keys=aws('ec2','describe-key-pairs','--filters',f'Name=key-name,Values={KEY}')['KeyPairs']
        if keys:
            k=keys[0]
            if k['KeyPairId']!=state['key_pair_id']: raise RuntimeError('Remote key identity changed; refusing deletion')
            aws('ec2','delete-key-pair','--key-pair-id',k['KeyPairId'])
        evidence['remote_key_deleted']=True
    evidence['remaining_active_instances']=[i['InstanceId'] for r in aws('ec2','describe-instances','--filters',*filters())['Reservations']
        for i in r['Instances'] if i['State']['Name'] not in ['terminated','shutting-down']]
    evidence['remaining_owned_volumes']=[v['VolumeId'] for v in aws('ec2','describe-volumes','--filters',*filters(run))['Volumes']]
    evidence['remaining_owned_groups']=[g['GroupId'] for g in aws('ec2','describe-security-groups','--filters',*filters(run))['SecurityGroups']]
    evidence['finished_at']=cap.now(); write(folder/'cleanup.json',evidence)
    if any(evidence[k] for k in ['remaining_active_instances','remaining_owned_volumes','remaining_owned_groups']): raise RuntimeError('Cleanup incomplete')
    print('AWS cleanup verified: no active owned instance, volume or SG.',flush=True)

def start(instance_type):
    runid='5k-'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:6]
    folder=Path('/tmp/avengers-aws-k6')/runid; folder.mkdir(parents=True,mode=0o700)
    print('SESSION:',folder,flush=True)
    state={'run_id':runid,'folder':str(folder),'started_at':cap.now(),'requested_instance_type':instance_type}; write(folder/'state.json',state)
    children=[]; logs=[]; finished=False
    def abort(signum,frame): raise KeyboardInterrupt()
    signal.signal(signal.SIGINT,abort); signal.signal(signal.SIGTERM,abort)
    try:
        state['key_pair_id']=preflight(folder); write(folder/'state.json',state)
        launch(state)
        deadline=time.monotonic()+3*3600+45*60 # below four-hour hard stop, including bootstrap.
        for args,name,env in [(['node','scripts/aws-k6/public-ingress.cjs'],'ingress',{'INGRESS_METRICS':str(folder/'ingress.jsonl')}),
                              (['cloudflared','tunnel','--url','http://127.0.0.1:18080','--metrics','127.0.0.1:18081','--no-autoupdate'],'tunnel',{})]:
            log=(folder/(name+'.log')).open('w'); logs.append(log)
            children.append(subprocess.Popen(args,cwd=ROOT,env={**os.environ,**env},stdout=log,stderr=log))
        until=time.monotonic()+90
        while time.monotonic()<until:
            text=(folder/'tunnel.log').read_text(); match=re.search(r'https://[a-z0-9-]+\.trycloudflare\.com',text)
            if match: state['target_url']=match.group(); break
            if any(p.poll() is not None for p in children): raise RuntimeError('Ingress/tunnel failed')
            time.sleep(2)
        else: raise RuntimeError('Quick Tunnel unavailable')
        write(folder/'state.json',state); network(state,'baseline')
        state['ready']=True; write(folder/'state.json',state); print('READY for explicit independent run commands.',flush=True)
        while time.monotonic()<deadline:
            if any(p.poll() is not None for p in children): raise RuntimeError('Ingress/tunnel stopped')
            command=folder/'command.json'
            if not command.exists(): time.sleep(2); continue
            task=json.loads(command.read_text()); command.rename(folder/('command-'+str(time.time_ns())+'.json'))
            if task['action']=='finish': finished=True; break
            try:
                state['busy']=True; write(folder/'state.json',state)
                result=run(state,task['vus'],task['label'],task.get('hold',120)) if task['action']=='run' else network(state,task['label'])
                write(folder/'last-command.json',{'action':task,'result':result,'finished_at':cap.now()})
            except Exception as error:
                write(folder/'last-command.json',{'action':task,'error':str(error),'finished_at':cap.now()})
                raise
            finally: state['busy']=False; write(folder/'state.json',state)
        else: state['stop_reason']='four-hour cost guard'; write(folder/'state.json',state)
    except BaseException as error:
        state['error']=str(error) or type(error).__name__; write(folder/'state.json',state)
        print('Session stopped:',state['error'],flush=True)
    finally:
        for p in children:
            p.terminate()
        for p in children:
            try: p.wait(10)
            except subprocess.TimeoutExpired: p.kill(); p.wait()
        for log in logs: log.close()
        try: cleanup(state,finished)
        except Exception as error:
            print('CLEANUP INCOMPLETE:',str(error),flush=True)
            print('Manual retry: AWS_PROFILE=avengers-k6 K8S_DB_MODE=existing python3 scripts/aws-k6/session.py cleanup '+str(folder)+(' --complete' if finished else ''),flush=True)
            if state.get('instance_id'): print('Immediate termination: aws --profile avengers-k6 --region '+REGION+' ec2 terminate-instances --instance-ids '+state['instance_id'],flush=True)
            raise
    if state.get('error') or state.get('stop_reason'):raise SystemExit(1)

def main():
    p=argparse.ArgumentParser(description=__doc__); sub=p.add_subparsers(dest='action',required=True)
    start_parser=sub.add_parser('start'); start_parser.add_argument('--instance-type',choices=['c7g.xlarge','m7i-flex.large'],default='c7g.xlarge')
    r=sub.add_parser('run'); r.add_argument('folder',type=Path); r.add_argument('vus',type=int); r.add_argument('label'); r.add_argument('--hold',type=int,default=120)
    n=sub.add_parser('network'); n.add_argument('folder',type=Path); n.add_argument('label')
    f=sub.add_parser('finish'); f.add_argument('folder',type=Path)
    c=sub.add_parser('cleanup'); c.add_argument('folder',type=Path); c.add_argument('--complete',action='store_true')
    a=p.parse_args()
    if a.action=='start': start(a.instance_type); return
    if a.action=='cleanup': cleanup(json.loads((a.folder/'state.json').read_text()),a.complete); return
    if (a.folder/'cleanup.json').exists(): p.error('Session already cleaned up')
    state=json.loads((a.folder/'state.json').read_text())
    if not state.get('ready') or state.get('busy') or (a.folder/'command.json').exists(): p.error('Session not ready or busy')
    task={k:v for k,v in vars(a).items() if k!='folder'}
    write(a.folder/'command.json',task); print('Queued:',task)

if __name__=='__main__': main()
