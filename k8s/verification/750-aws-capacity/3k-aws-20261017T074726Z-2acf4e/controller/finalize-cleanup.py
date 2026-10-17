"""Read-only all-phase inventory and local private-job cleanup proof after CLOSED."""
from client import root,meta,folder,state
import datetime,importlib.util,json,pathlib,re
run=pathlib.Path(meta['evidence']);assert (folder/'CLOSED').exists(),'native lifecycle cleanup not yet verified'
native=json.loads((run/'final-cleanup.json').read_text());local=json.loads((run/'local-control-cleanup.json').read_text())
assert native['pass'] and local['processes_stopped'] and local['aws_cleanup_verified']
spec=importlib.util.spec_from_file_location('capacity',root/'scripts/aws-k6/aws-capacity.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
inventory=m.require_clean_benchmark_inventory();enis={}
for phase,tags in [('3k-aws',m.OWNERS),('3k-qualification',{'Project':'avengers-coffee','Purpose':'k6-3k-capacity','ManagedBy':'codex-local','Phase':'3k-qualification'}),('5k-qualification',{'Project':'avengers-coffee','Purpose':'k6-capacity','ManagedBy':'codex-local','Phase':'5k-qualification'})]:
 enis[phase]=len(m.aws('ec2','describe-network-interfaces','--filters',*[f'Name=tag:{k},Values={v}' for k,v in tags.items()])['NetworkInterfaces'])
assert not any(enis.values()),'owned ENIs remain; do not claim cleanup complete'
private_jobs=0
for role in folder.iterdir():
 if role.is_dir() and re.fullmatch(r'(target[1-3]|generator[1-5])',role.name):
  private_jobs+=sum(p.name in ('job.json','job.tmp') or re.fullmatch(r'[0-9a-f]{16}\.(json|stdout|stderr|cms)',p.name) is not None for p in role.iterdir())
assert private_jobs==0 and not (folder/'controller.key').exists() and not (folder/'token').exists()
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
proof={'observed_at':now,'pass':True,'known_phase_inventory':inventory,'known_phase_owned_eni_counts':enis,'local_control_processes_stopped':True,'controller_key_and_token_removed':True,'decrypted_encrypted_private_job_files_remaining':private_jobs,'session_closed':True,'scope':'all known benchmark ownership phases and RunIds in ap-southeast-2; unrelated account resources excluded'}
(run/'final-all-phase-cleanup.json').write_text(json.dumps(proof,indent=2)+'\n')
fleet=state();cost=json.loads((run/'projected-cost.json').read_text());end=datetime.datetime.fromisoformat(native['observed_at']);start=datetime.datetime.fromisoformat(fleet['started_at'])
role_hours={r:max(0,(end-datetime.datetime.fromisoformat(d['launch_time'].replace('Z','+00:00'))).total_seconds()/3600) for r,d in fleet['roles'].items()}
bound=len(fleet['roles'])*max(0,(end-start).total_seconds()/3600)*cost['compute_usd_hour']
assert bound<=cost['max_compute_usd']
summary={'observed_at':now,'approved_additional_credit_cap_usd':2.20,'planned_compute_cap_usd':cost['max_compute_usd'],'price_usd_instance_hour':cost['compute_usd_hour'],'all_roles_from_controller_start_through_cleanup_compute_upper_bound_usd':bound,'per_role_launch_through_cleanup_compute_upper_bound_usd':sum(role_hours.values())*cost['compute_usd_hour'],'actual_fleet_role_count':len(fleet['roles']),'controller_elapsed_minutes_through_cleanup':(end-start).total_seconds()/60,'planned_reserves_usd':{k:cost[k] for k in ['ebs_reserve_usd','ipv4_reserve_usd','transfer_contingency_usd']},'free_plan_only':True,'plan_or_iam_changes':False,'actual_bill':False,'credit_balance_retained':False,'interpretation':'conservative compute upper bounds, not invoice or measured credit debit; final native cleanup time includes termination/SG cleanup'}
(run/'cost-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({'all_known_benchmark_phases_cleanup':'PASS','owned_resources_remaining':0,'private_job_files_remaining':0,'compute_upper_bound_usd':bound,'actual_bill':False}))
