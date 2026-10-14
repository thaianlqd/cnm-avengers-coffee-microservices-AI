#!/usr/bin/env python3
"""Ephemeral private AWS fleet + outbound encrypted control lifecycle.
No plaintext app secrets at Cloudflare; recipient cert fingerprint verified via
AWS console. Commands are encrypted, signed by a pinned controller certificate.
"""
import argparse,base64,datetime,gzip,hashlib,importlib.util,json,os,re,secrets,signal,subprocess,time
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
    text='#!/bin/bash\nset -eu\numask 077\nshutdown -h +175\nmkdir -p /run/avengers-capacity\n'
    for name,data in [('controller.pem',cert.encode()),('config.json',json.dumps(config).encode())]:
        text+=f"printf '%s' '{base64.b64encode(data).decode()}' | base64 -d > /run/avengers-capacity/{name}\n"
    text+=f"printf '%s' '{base64.b64encode(worker).decode()}' | base64 -d | gzip -d > /run/avengers-capacity/worker.py\npython3 /run/avengers-capacity/worker.py > /run/avengers-capacity/worker.log 2>&1 &\n"
    return text

def start(folder,run,evidence):
    if subprocess.check_output(['git','branch','--show-current'],cwd=ROOT,text=True).strip()!='features_k8s':raise ValueError('branch guard')
    if json.loads((evidence/'projected-cost.json').read_text())['max_projected_usd']>5:raise ValueError('budget')
    folder.mkdir(mode=0o700,parents=True,exist_ok=False)
    (folder/'token').write_text(secrets.token_urlsafe(32));(folder/'run-id').write_text(run)
    openssl(['req','-x509','-newkey','rsa:3072','-nodes','-keyout',str(folder/'controller.key'),'-out',str(folder/'controller.pem'),'-days','1','-subj','/CN=avengers-controller'])
    control=subprocess.Popen(['python3',str(ROOT/'scripts/aws-k6/aws-control.py'),str(folder)],stdout=(folder/'control.log').open('w'),stderr=subprocess.STDOUT)
    tunnel=subprocess.Popen(['cloudflared','tunnel','--url','http://127.0.0.1:18084','--no-autoupdate'],stdout=(folder/'tunnel.log').open('w'),stderr=subprocess.STDOUT)
    deadline=time.monotonic()+10500
    state={'run_id':run,'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'roles':{},'control_pid':control.pid,'tunnel_pid':tunnel.pid}
    (folder/'state.json').write_text(json.dumps(state))
    failure=None
    try:
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
            result=a.aws('ec2','run-instances','--image-id','ami-0f5e1e0151e5b95ed','--instance-type','m7i-flex.large','--count','1','--subnet-id','subnet-0c80e4a6bb54962d6','--security-group-ids',groups['target' if role.startswith('target') else 'generator'],
                '--metadata-options','HttpTokens=required,HttpEndpoint=enabled','--instance-initiated-shutdown-behavior','terminate','--user-data',bootstrap(folder,role,urls[0]),
                '--block-device-mappings',json.dumps([{'DeviceName':'/dev/sda1','Ebs':{'VolumeSize':30,'VolumeType':'gp3','DeleteOnTermination':True}}]),
                '--tag-specifications',json.dumps([{'ResourceType':t,'Tags':a.tags(run)+[{'Key':'Role','Value':role}]} for t in ('instance','volume','network-interface')]))['Instances'][0]
            state['roles'][role]={'id':result['InstanceId'],'private_ip':result['PrivateIpAddress'],'launch_time':result['LaunchTime'],'type':result['InstanceType']}
            (folder/'state.json').write_text(json.dumps(state,indent=2))
        (evidence/'fleet.json').write_text(json.dumps(state|{'control_pid':None,'tunnel_pid':None},indent=2)+'\n')
        for role,instance in state['roles'].items():
            verified=False
            for attempt in range(90):
                cert=folder/role/'cert.pem'
                if cert.exists():
                    output=a.aws('ec2','get-console-output','--instance-id',instance['id'],'--latest').get('Output','')
                    console=output # AWS CLI decodes the API's base64 console field already.
                    if console_matches_certificate(console,cert.read_bytes()):verified=True;break
                time.sleep(5)
            if not verified:raise ValueError('recipient certificate could not be authenticated with AWS console: '+role)
            (folder/role/'verified').write_text('AWS console fingerprint verified')
        (folder/'READY').write_text('encrypted control ready')
        print('READY: '+str(folder),flush=True)
        while time.monotonic()<deadline and not (folder/'FINISH').exists():time.sleep(3)
    except Exception as error:
        failure=str(error);(evidence/'setup-failure.json').write_text(json.dumps({'error':failure,'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2)+'\n')
        print('SETUP FAILED: '+failure,flush=True)
    finally:
        try:
            cleaned=a.cleanup(run);(evidence/'final-cleanup.json').write_text(json.dumps(cleaned,indent=2)+'\n')
        finally:
            for process in (tunnel,control):
                process.terminate()
                try:process.wait(timeout=15)
                except subprocess.TimeoutExpired:process.kill();process.wait()
            (folder/'CLOSED').write_text('cleanup completed')
    if failure:raise SystemExit(1)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['start','job','finish']);p.add_argument('folder',type=Path);p.add_argument('--run-id');p.add_argument('--evidence',type=Path);p.add_argument('--role');p.add_argument('--script',type=Path);p.add_argument('--stdin',type=Path);p.add_argument('--timeout',type=int,default=600);args=p.parse_args()
    if args.action=='start':start(args.folder,args.run_id,args.evidence)
    elif args.action=='finish':(args.folder/'FINISH').write_text('finish')
    else:
        if not (args.folder/args.role/'verified').exists():raise ValueError('recipient not authenticated')
        job,exit_code=submit(args.folder,args.role,args.script.read_text(),args.stdin.read_bytes() if args.stdin else b'',args.timeout)
        print(json.dumps({'job_id':job,'exit':exit_code,'output_folder':str(args.folder/args.role)}))
        raise SystemExit(0 if exit_code==0 else 1)
