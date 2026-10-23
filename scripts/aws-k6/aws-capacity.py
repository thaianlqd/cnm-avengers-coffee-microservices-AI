#!/usr/bin/env python3
"""Ownership-scoped initial fleet eligibility probe. No application/data deployment.

A denied REAL three-node launch is a stop condition; dry-run is not eligibility.
Always tears down the probe fleet, including on exceptions. Requires features_k8s.
"""
import argparse, base64, datetime, json, re, subprocess, time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
PROFILE = 'avengers-k6'
REGION = 'ap-southeast-2'
OWNERS = {'Project':'avengers-coffee','Purpose':'3k-capacity','ManagedBy':'codex-features-k8s','Phase':'3k-aws'}

def tags(run):
    if not re.fullmatch(r'3k-aws-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{6}',run):
        raise ValueError('invalid RunId')
    return [dict(Key=k,Value=v) for k,v in {**OWNERS,'RunId':run}.items()]

def target_ingress(target_group,generator_group):
    cluster=[{'IpProtocol':protocol,'FromPort':port,'ToPort':port,'UserIdGroupPairs':[{'GroupId':target_group}]} for protocol,port in [('tcp',6443),('tcp',10250),('udp',8472),('tcp',8050)]]
    return cluster+[{'IpProtocol':'tcp','FromPort':30300,'ToPort':30300,'UserIdGroupPairs':[{'GroupId':generator_group}]}]

def owned(resource, run):
    actual={t['Key']:t['Value'] for t in resource.get('Tags',[])}
    return all(actual.get(t['Key'])==t['Value'] for t in tags(run))

def aws(*args):
    p=subprocess.run(['aws','--profile',PROFILE,'--region',REGION,*args],text=True,capture_output=True)
    if p.returncode:
        raise RuntimeError(p.stderr.strip())
    return json.loads(p.stdout) if p.stdout.strip() else {}

def filters(run):
    return [f"Name=tag:{t['Key']},Values={t['Value']}" for t in tags(run)]

def inventory(run):
    f=filters(run)
    instances=[i for r in aws('ec2','describe-instances','--filters',*f)['Reservations'] for i in r['Instances']]
    return {'instances':instances,
      'security_groups':aws('ec2','describe-security-groups','--filters',*f)['SecurityGroups'],
      'volumes':aws('ec2','describe-volumes','--filters',*f)['Volumes'],
      'key_pairs':aws('ec2','describe-key-pairs','--filters',*f)['KeyPairs']}

def benchmark_inventory():
    """Read all known benchmark phases, across RunIds; never delete here."""
    phases = [OWNERS,
      {'Project':'avengers-coffee','Purpose':'k6-3k-capacity','ManagedBy':'codex-local','Phase':'3k-qualification'},
      {'Project':'avengers-coffee','Purpose':'k6-capacity','ManagedBy':'codex-local','Phase':'5k-qualification'}]
    counts = {}
    for phase in phases:
        f = [f'Name=tag:{key},Values={value}' for key,value in phase.items()]
        instances = [i for r in aws('ec2','describe-instances','--filters',*f)['Reservations'] for i in r['Instances']]
        counts[phase['Phase']] = {
          'instances':sum(i['State']['Name'] != 'terminated' for i in instances),
          'security_groups':len(aws('ec2','describe-security-groups','--filters',*f)['SecurityGroups']),
          'volumes':len(aws('ec2','describe-volumes','--filters',*f)['Volumes']),
          'key_pairs':len(aws('ec2','describe-key-pairs','--filters',*f)['KeyPairs'])}
    return counts

def require_clean_benchmark_inventory():
    counts = benchmark_inventory()
    if any(value for phase in counts.values() for value in phase.values()):
        raise ValueError('Existing benchmark resources require ownership-scoped reconciliation before launch')
    return counts

def cleanup(run):
    resources=inventory(run)
    for group in resources.values():
        if not all(owned(r,run) for r in group): raise ValueError('ownership mismatch')
    ids=[i['InstanceId'] for i in resources['instances'] if i['State']['Name']!='terminated']
    if ids:
        aws('ec2','terminate-instances','--instance-ids',*ids)
        aws('ec2','wait','instance-terminated','--instance-ids',*ids)
    for sg in resources['security_groups']:
        for field,operation in [('IpPermissions','revoke-security-group-ingress'),('IpPermissionsEgress','revoke-security-group-egress')]:
            if sg.get(field): aws('ec2',operation,'--group-id',sg['GroupId'],'--ip-permissions',json.dumps(sg[field]))
    for sg in resources['security_groups']:
        for attempt in range(12):
            try:
                aws('ec2','delete-security-group','--group-id',sg['GroupId']);break
            except RuntimeError as error:
                if 'DependencyViolation' not in str(error) or attempt==11: raise
                time.sleep(5)
    for v in inventory(run)['volumes']:
        if v['State']!='available': raise ValueError('owned volume still attached')
        aws('ec2','delete-volume','--volume-id',v['VolumeId'])
    for k in resources['key_pairs']:
        aws('ec2','delete-key-pair','--key-pair-id',k['KeyPairId'])
    final=inventory(run)
    counts={k:len([i for i in values if k!='instances' or i['State']['Name']!='terminated']) for k,values in final.items()}
    return {'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'owned_remaining':counts,'pass':not any(counts.values()),'temporary_endpoint_count':0}

def probe(run, evidence):
    branch=subprocess.check_output(['git','branch','--show-current'],cwd=ROOT,text=True).strip()
    if branch!='features_k8s': raise ValueError('features_k8s required')
    cost=json.loads((evidence/'projected-cost.json').read_text())
    if cost['max_projected_usd']>5: raise ValueError('budget exceeds USD 5')
    if any(i['State']['Name']!='terminated' for i in inventory(run)['instances']): raise ValueError('existing fleet')
    started=datetime.datetime.now(datetime.timezone.utc).isoformat()
    result={'started_at':started,'planned_target_nodes':3,'planned_generator_nodes':1,'actual_launched':[],'capacity_load_run':False}
    try:
        groups={}
        for role in ('target','generator'):
            groups[role]=aws('ec2','create-security-group','--group-name',f'avengers-3k-{role}-{run}',
              '--description',f'Temporary private AWS 3K {role}', '--vpc-id','vpc-019ebb919faf68752',
              '--tag-specifications',json.dumps([{'ResourceType':'security-group','Tags':tags(run)}]))['GroupId']
        # All cluster protocols are confined to the target group itself.
        aws('ec2','authorize-security-group-ingress','--group-id',groups['target'],'--ip-permissions',json.dumps(target_ingress(groups['target'],groups['generator'])))
        # No SSH/public application ingress. Probe guests auto-terminate in 15 minutes.
        boot='#!/bin/bash\nset -eu\nshutdown -h +15\n'
        result['launch_requested_at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
        launched=aws('ec2','run-instances','--image-id','ami-0f5e1e0151e5b95ed','--instance-type','m7i-flex.large',
          '--count','3','--subnet-id','subnet-0c80e4a6bb54962d6','--security-group-ids',groups['target'],
          '--metadata-options','HttpTokens=required,HttpEndpoint=enabled',
          '--instance-initiated-shutdown-behavior','terminate','--user-data',boot,
          '--block-device-mappings',json.dumps([{'DeviceName':'/dev/sda1','Ebs':{'VolumeSize':20,'VolumeType':'gp3','DeleteOnTermination':True}}]),
          '--tag-specifications',json.dumps([{'ResourceType':r,'Tags':tags(run)} for r in ('instance','volume','network-interface')]))
        result['actual_launched']=[{'instance_id':i['InstanceId'],'launch_time':i['LaunchTime'],'role':'target','type':i['InstanceType']} for i in launched['Instances']]
        result['fleet_eligibility']='TARGET_LAUNCH_ACCEPTED'
    except RuntimeError as error:
        result['fleet_eligibility']='BLOCKED'
        result['aws_error']=str(error)
    finally:
        (evidence/'fleet-eligibility.json').write_text(json.dumps(result,indent=2)+'\n')
        clean=cleanup(run)
        (evidence/'cleanup.json').write_text(json.dumps(clean,indent=2)+'\n')
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['probe','cleanup']);p.add_argument('run_id');p.add_argument('evidence',type=Path)
    a=p.parse_args()
    output=probe(a.run_id,a.evidence) if a.action=='probe' else cleanup(a.run_id)
    print(json.dumps(output,indent=2))
