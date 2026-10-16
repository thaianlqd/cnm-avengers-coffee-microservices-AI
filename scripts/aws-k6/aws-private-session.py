#!/usr/bin/env python3
"""Ephemeral private AWS fleet + outbound encrypted control lifecycle.
No plaintext app secrets at Cloudflare; recipient cert fingerprint verified via
AWS console. Commands are encrypted, signed by a pinned controller certificate.
"""
import argparse,base64,datetime,gzip,hashlib,importlib.util,json,math,os,re,secrets,signal,subprocess,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('capacity',ROOT/'scripts/aws-k6/aws-capacity.py')
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
def openssl(args,data=None):
    p=subprocess.run(['openssl',*args],input=data,capture_output=True)
    if p.returncode:raise ValueError('openssl failed')
    return p.stdout

def submit(folder,role,script,stdin=b'',timeout=600):
    role_dir=folder/role
    job=secrets.token_hex(8)
    payload=json.dumps({'script':script,'stdin':base64.b64encode(stdin).decode(),'timeout':timeout}).encode()
    cipher=openssl(['cms','-encrypt','-binary','-outform','DER','-aes-256-cbc',str(role_dir/'cert.pem')],payload)
    signature=openssl(['dgst','-sha256','-sign',str(folder/'controller.key')],cipher)
    temp=role_dir/'job.tmp';temp.write_text(json.dumps({'id':job,'payload':base64.b64encode(cipher).decode(),'signature':base64.b64encode(signature).decode()}));temp.rename(role_dir/'job.json')
    deadline=time.monotonic()+timeout+180
    while time.monotonic()<deadline:
        result=role_dir/(job+'.cms')
        if result.exists():
            plain=openssl(['cms','-decrypt','-binary','-inform','DER','-recip',str(folder/'controller.pem'),'-inkey',str(folder/'controller.key')],result.read_bytes())
            data=json.loads(plain);(role_dir/(job+'.json')).write_text(json.dumps(data))
            for key in ('stdout','stderr'):(role_dir/(job+'.'+key)).write_bytes(base64.b64decode(data.get(key,'')))
            return job,data['exit']
        time.sleep(3)
    raise TimeoutError('control job timed out')

def console_matches_certificate(output, cert):
    # aws-cli decodes the API base64 field; Output is Unicode console text.
    return 'AVENGERS_CERT_SHA256='+hashlib.sha256(cert).hexdigest() in output

def bootstrap(folder,role,url):
    cert=(folder/'controller.pem').read_text()
    config={'role':role,'control':url,'token':(folder/'token').read_text().strip()}
    worker=gzip.compress((ROOT/'scripts/aws-k6/aws-worker.py').read_bytes())
    minutes=int((folder/'runtime-minutes').read_text()) if (folder/'runtime-minutes').exists() else 175
    if not 30<=minutes<=175:raise ValueError('invalid runtime bound')
    text=f'#!/bin/bash\nset -eu\numask 077\nshutdown -h +{minutes}\nmkdir -p /run/avengers-capacity\n'
    for name,data in [('controller.pem',cert.encode()),('config.json',json.dumps(config).encode())]:
        text+=f"printf '%s' '{base64.b64encode(data).decode()}' | base64 -d > /run/avengers-capacity/{name}\n"
    text+=f"printf '%s' '{base64.b64encode(worker).decode()}' | base64 -d | gzip -d > /run/avengers-capacity/worker.py\npython3 /run/avengers-capacity/worker.py > /run/avengers-capacity/worker.log 2>&1 &\n"
    return text

def launch_instance(folder,role,url,groups,run):
    result=a.aws('ec2','run-instances','--image-id','ami-0f5e1e0151e5b95ed','--instance-type','m7i-flex.large','--count','1','--subnet-id','subnet-0c80e4a6bb54962d6','--security-group-ids',groups['target' if role.startswith('target') else 'generator'],
        '--metadata-options','HttpTokens=required,HttpEndpoint=enabled','--instance-initiated-shutdown-behavior','terminate','--user-data',bootstrap(folder,role,url),
        '--block-device-mappings',json.dumps([{'DeviceName':'/dev/sda1','Ebs':{'VolumeSize':30,'VolumeType':'gp3','DeleteOnTermination':True}}]),
        '--tag-specifications',json.dumps([{'ResourceType':t,'Tags':a.tags(run)+[{'Key':'Role','Value':role}]} for t in ('instance','volume','network-interface')]))['Instances'][0]
    return {'id':result['InstanceId'],'private_ip':result['PrivateIpAddress'],'launch_time':result['LaunchTime'],'type':result['InstanceType']}

def verify_recipient(folder,role,instance):
    for attempt in range(90):
        cert=folder/role/'cert.pem'
        if cert.exists():
            output=a.aws('ec2','get-console-output','--instance-id',instance['id'],'--latest').get('Output','')
            if console_matches_certificate(output,cert.read_bytes()):
                (folder/role/'verified').write_text('AWS console fingerprint verified')
                return
        time.sleep(5)
    raise ValueError('recipient certificate could not be authenticated with AWS console: '+role)

def add_generator(folder,evidence,inadequacy):
    """Explicitly approved bound plus recorded inadequacy; never auto-scale."""
    if subprocess.check_output(['git','branch','--show-current'],cwd=ROOT,text=True).strip()!='features_k8s':raise ValueError('branch guard')
    state=json.loads((folder/'state.json').read_text());a.tags(state['run_id'])
    if not (folder/'READY').exists() or (folder/'FINISH').exists() or (folder/'CLOSED').exists():raise ValueError('session not active')
    count=sum(role.startswith('generator') for role in state['roles'])
    if not 1<=count<state.get('max_generators',1)<=3:raise ValueError('approved generator limit')
    proof=json.loads(inadequacy.read_text())
    if proof.get('generator_adequate') is not False or not proof.get('generator_reasons'):raise ValueError('measured generator inadequacy required')
    current=a.inventory(state['run_id'])
    expected={v['id'] for v in state['roles'].values()}
    if {i['InstanceId'] for i in current['instances'] if i['State']['Name']!='terminated'}!=expected:raise ValueError('fleet reconciliation required')
    if any(not a.owned(r,state['run_id']) for rows in current.values() for r in rows):raise ValueError('ownership mismatch')
    urls=re.findall(r'https://[-a-z0-9]+\.trycloudflare.com',(folder/'tunnel.log').read_text())
    if not urls:raise ValueError('control URL unavailable')
    started=datetime.datetime.fromisoformat(state['started_at'])
    if (datetime.datetime.now(datetime.timezone.utc)-started).total_seconds()>state.get('runtime_minutes',175)*60-1800:raise ValueError('insufficient session lifetime')
    role='generator'+str(count+1)
    try:
        state['roles'][role]=launch_instance(folder,role,urls[0],state['groups'],state['run_id'])
        (folder/'state.json').write_text(json.dumps(state,indent=2))
        (evidence/(role+'-inadequacy.json')).write_text(json.dumps({'evidence_name':inadequacy.name,'evidence_sha256':hashlib.sha256(inadequacy.read_bytes()).hexdigest(),'generator_reasons':proof['generator_reasons']},indent=2)+'\n')
        (evidence/'fleet.json').write_text(json.dumps(state|{'control_pid':None,'tunnel_pid':None},indent=2)+'\n')
        verify_recipient(folder,role,state['roles'][role])
        print(role+' encrypted control ready',flush=True)
    except BaseException:
        (folder/'FINISH').write_text('generator addition failed; mandatory cleanup')
        raise

def start(folder,run,evidence,max_generators=1,runtime_minutes=175):
    if subprocess.check_output(['git','branch','--show-current'],cwd=ROOT,text=True).strip()!='features_k8s':raise ValueError('branch guard')
    a.tags(run) # Reject malformed RunIds before creating local or remote resources.
    budget=json.loads((evidence/'projected-cost.json').read_text())['max_projected_usd']
    if isinstance(budget,bool) or not isinstance(budget,(int,float)) or not math.isfinite(budget) or not 0<budget<=5:raise ValueError('budget')
    plan=json.loads((evidence/'projected-cost.json').read_text())
    if type(runtime_minutes) is not int or not 30<=runtime_minutes<=175 or plan.get('guest_termination_minutes',runtime_minutes)!=runtime_minutes:raise ValueError('invalid runtime bound')
    if type(max_generators) is not int or not 1<=max_generators<=3 or max_generators>plan.get('maximum_generators',1):raise ValueError('approved generator limit')
    inventory=a.require_clean_benchmark_inventory()
    (evidence/'prelaunch-inventory.json').write_text(json.dumps(inventory,indent=2)+'\n')
    folder.mkdir(mode=0o700,parents=True,exist_ok=False)
    deadline=time.monotonic()+runtime_minutes*60
    state={'run_id':run,'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'roles':{},'max_generators':max_generators,'runtime_minutes':runtime_minutes,'control_pid':None,'tunnel_pid':None}
    processes=[]
    failure=None
    try:
        (folder/'runtime-minutes').write_text(str(runtime_minutes))
        (folder/'token').write_text(secrets.token_urlsafe(32));(folder/'run-id').write_text(run)
        openssl(['req','-x509','-newkey','rsa:3072','-nodes','-keyout',str(folder/'controller.key'),'-out',str(folder/'controller.pem'),'-days','1','-subj','/CN=avengers-controller'])
        for key,command in [('control_pid',['python3',str(ROOT/'scripts/aws-k6/aws-control.py'),str(folder)]),
                            ('tunnel_pid',['cloudflared','tunnel','--url','http://127.0.0.1:18084','--no-autoupdate'])]:
            with (folder/('control.log' if key=='control_pid' else 'tunnel.log')).open('w') as log:
                process=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT)
            processes.append(process);state[key]=process.pid
        (folder/'state.json').write_text(json.dumps(state))
        for attempt in range(60):
            urls=re.findall(r'https://[-a-z0-9]+\.trycloudflare.com',(folder/'tunnel.log').read_text())
            if urls:break
            time.sleep(1)
        else:raise ValueError('control URL unavailable')
        groups={}
        for role in ('target','generator'):
            groups[role]=a.aws('ec2','create-security-group','--group-name',f'avengers-3k-{role}-{run}-private','--description','Ephemeral AWS private capacity','--vpc-id','vpc-019ebb919faf68752','--tag-specifications',json.dumps([{'ResourceType':'security-group','Tags':a.tags(run)}]))['GroupId']
        a.aws('ec2','authorize-security-group-ingress','--group-id',groups['target'],'--ip-permissions',json.dumps(a.target_ingress(groups['target'],groups['generator'])))
        state['groups']=groups
        for role in ('target1','target2','target3','generator1'):
            state['roles'][role]=launch_instance(folder,role,urls[0],groups,run)
            (folder/'state.json').write_text(json.dumps(state,indent=2))
        (evidence/'fleet.json').write_text(json.dumps(state|{'control_pid':None,'tunnel_pid':None},indent=2)+'\n')
        for role,instance in state['roles'].items():
            verify_recipient(folder,role,instance)
        (folder/'READY').write_text('encrypted control ready')
        print('READY: '+str(folder),flush=True)
        while time.monotonic()<deadline and not (folder/'FINISH').exists():time.sleep(3)
    except Exception as error:
        failure=str(error);(evidence/'setup-failure.json').write_text(json.dumps({'error':failure,'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2)+'\n')
        print('SETUP FAILED: '+failure,flush=True)
    finally:
        cleanup_passed=False
        try:
            cleaned=a.cleanup(run);(evidence/'final-cleanup.json').write_text(json.dumps(cleaned,indent=2)+'\n')
            if not cleaned.get('pass'):raise RuntimeError('AWS cleanup verification failed')
            cleanup_passed=True
        except Exception:
            (evidence/'cleanup-failure.json').write_text(json.dumps({'pass':False,'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reason':'AWS cleanup not verified; use ownership-scoped cleanup and inspect AWS API'},indent=2)+'\n')
            raise
        finally:
            for process in reversed(processes):
                process.terminate()
                try:process.wait(timeout=15)
                except subprocess.TimeoutExpired:process.kill();process.wait()
            (evidence/'local-control-cleanup.json').write_text(json.dumps({'processes_stopped':all(p.poll() is not None for p in processes),'aws_cleanup_verified':cleanup_passed},indent=2)+'\n')
            if cleanup_passed:
                for secret in ('controller.key','token'):(folder/secret).unlink(missing_ok=True)
                # Decrypted job results may contain cluster join tokens. Evidence
                # must be exported before FINISH; retain only public certificates.
                for role in folder.iterdir():
                    if role.is_dir() and re.fullmatch(r'(target[1-4]|generator[1-3])',role.name):
                        for artifact in role.iterdir():
                            if artifact.name in ('job.json','job.tmp') or re.fullmatch(r'[0-9a-f]{16}\.(json|stdout|stderr|cms)',artifact.name):artifact.unlink()
                (folder/'CLOSED').write_text('AWS cleanup verified; local control stopped')
    if failure:raise SystemExit(1)

def interrupted(signum,frame):
    # SystemExit still executes start's finally block. Default SIGTERM does not.
    raise SystemExit(128+signum)

if __name__=='__main__':
    signal.signal(signal.SIGTERM,interrupted)
    p=argparse.ArgumentParser();p.add_argument('action',choices=['start','job','finish','add-generator']);p.add_argument('folder',type=Path);p.add_argument('--run-id');p.add_argument('--evidence',type=Path);p.add_argument('--role');p.add_argument('--script',type=Path);p.add_argument('--stdin',type=Path);p.add_argument('--timeout',type=int,default=600);p.add_argument('--max-generators',type=int,default=1);p.add_argument('--inadequacy',type=Path);p.add_argument('--runtime-minutes',type=int,default=175);args=p.parse_args()
    if args.action=='start':start(args.folder,args.run_id,args.evidence,args.max_generators,args.runtime_minutes)
    elif args.action=='add-generator':add_generator(args.folder,args.evidence,args.inadequacy)
    elif args.action=='finish':(args.folder/'FINISH').write_text('finish')
    else:
        if not (args.folder/args.role/'verified').exists():raise ValueError('recipient not authenticated')
        job,exit_code=submit(args.folder,args.role,args.script.read_text(),args.stdin.read_bytes() if args.stdin else b'',args.timeout)
        print(json.dumps({'job_id':job,'exit':exit_code,'output_folder':str(args.folder/args.role)}))
        raise SystemExit(0 if exit_code==0 else 1)
