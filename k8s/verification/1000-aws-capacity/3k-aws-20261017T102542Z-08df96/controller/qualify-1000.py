"""Bounded 1000-VU progression; each load step must independently qualify."""
import datetime,hashlib,json,subprocess,sys,time
from client import *
e=run_path;controller=e/'controller'
historical=root/'k8s/verification/750-aws-capacity/3k-aws-20261017T074726Z-2acf4e'
invalid750=root/'k8s/verification/1k-aws-capacity/3k-aws-20261017T052200Z-952f9c/retained-normal-750/analysis.json'
def save(name,obj):(e/name).write_text(json.dumps(obj,indent=2)+'\n')
def run(name,*args):
 print('BEGIN '+name+' '+' '.join(args),flush=True)
 subprocess.run([sys.executable,'-B',str(controller/(name+'.py')),*args],cwd=root,check=True)
 print('DONE '+name,flush=True)
def valid(a):
 return a['status']=='STABLE PASS' and a['generator_adequate'] and a['http_pass'] and not a['target_reasons'] and a['post_smoke'] and a['natural_recovery']
results=[]
def point(name,vus,hold,generators):
 assert vus<=1000 and 2<=generators<=6
 with (e/(name+'-controller.log')).open('w') as log:
  proc=subprocess.run([sys.executable,'-B',str(controller/'point.py'),name,str(vus),'--generators',str(generators),'--hold',str(hold),'--kernel'],cwd=root,stdout=log,stderr=subprocess.STDOUT)
 if proc.returncode:raise RuntimeError(name+' orchestration failed; preserve evidence, no capacity inference')
 a=json.loads((e/name/'analysis.json').read_text())
 results.append({'point':name,'vus':vus,'hold_seconds':hold,'generators':generators,'status':a['status'],'valid_pass':bool(valid(a))})
 save('progression.json',{'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'results':results,'maximum_planned_vus':1000,'run_1000':True})
 print(name+' '+a['status'],flush=True)
 if not valid(a):raise RuntimeError(name+' did not qualify; stop preserved progression')
 return a
def expand(count):
 raw=json.loads(invalid750.read_text());assert raw['status']=='INVALID GENERATOR' and raw['generator_adequate'] is False
 roles=[]
 for _ in range(count):
  session.add_generator(folder,e,invalid750)
  roles.append('generator'+str(sum(r.startswith('generator') for r in state()['roles'])))
 run('generators',*roles)
 target='http://'+state()['roles']['target1']['private_ip']+':30300'
 for role in roles:
  script=f'set -eu\npython3 /opt/avengers-workload/aws-network-baseline.py {target} --count 20 --output /run/avengers-capacity/baseline.json >/dev/null\ncat /run/avengers-capacity/baseline.json\n'
  baseline=json.loads(submit(role,script,timeout=180));assert baseline['passed'];save(role+'-network-baseline.json',baseline)
 run('precheck')
try:
 approval=json.loads((e/'authorization.json').read_text())
 assert approval['user_approved'] is True and approval['maximum_workload_vus']==1000 and approval['run_1000'] is True
 assert meta['run']==e.name and state()['max_generators']==6 and state()['runtime_minutes']==110
 assert (e/'setup-ready.json').exists() and not (folder/'FINISH').exists() and not (folder/'CLOSED').exists()
 proof=[]
 for name in ('normal-750','long-750'):
  p=historical/name;a=json.loads((p/'analysis.json').read_text());provenance=json.loads((p/'point-provenance.json').read_text())
  assert a['vus']==750 and valid(a) and provenance['diagnostic'] is False
  assert provenance['source_tree_sha256']==meta['source_tree_sha256']
  assert provenance['workload_sha256']==hashlib.sha256((root/'load-tests/k6/customer-browse-3k.js').read_bytes()).hexdigest()
  proof.append({'point':str(p.relative_to(root)),'analysis_sha256':hashlib.sha256((p/'analysis.json').read_bytes()).hexdigest(),'hold_seconds':a['hold_seconds']})
 assert max(p['hold_seconds'] for p in proof)>=300
 save('historical750-provenance.json',{'verified':True,'points':proof,'source_tree_sha256':meta['source_tree_sha256'],'not_relabelled_as_fresh_runs':True})
 dataset=[]
 for role in ('generator1','generator2','generator3'):
  old=json.loads((historical/(role+'-network-baseline.json')).read_text());new=json.loads((e/(role+'-network-baseline.json')).read_text())
  for route in ('/menu/danh-muc','/menu/san-pham','/users/branches/public','/news?limit=100'):
   values=lambda b,k:sorted({str(row[k]) for row in b['rows'] if row['route']==route})
   dataset.append({'generator':role,'route':route,'item_counts_match':values(old,'items')==values(new,'items'),'decoded_sizes_match':values(old,'decoded_bytes')==values(new,'decoded_bytes'),'body_hashes_match':values(old,'body_sha256')==values(new,'body_sha256')})
 continuous=all(x['item_counts_match'] and x['decoded_sizes_match'] for x in dataset)
 save('dataset-continuity.json',{'baseline_evidence':str(historical.relative_to(root)),'rows':dataset,'passed':continuous,'body_hash_differences_preserved':True})
 point('regression-250',250,120,3)
 point('regression-normal-500',500,120,3)
 expand(2)
 point('regression-normal-750',750,120,5)
 if not continuous:
  # Material dataset changes require a fresh long750; never manufacture continuity.
  point('fresh-long-750',750,300,5)
 run('healing','healing','retained');run('healing','rollout','retained')
 assert all(json.loads((e/('retained-'+action+'.json')).read_text())['passed'] for action in ('healing','rollout'))
 expand(1)
 roles=sorted(r for r in state()['roles'] if r.startswith('generator'));assert len(roles)==6
 partitions={r:1000//6+(i<1000%6) for i,r in enumerate(roles)};assert sum(partitions.values())==1000
 save('generator-partition-plan.json',{'total_vus':1000,'partitions':partitions,'measured_inadequacy_sha256':hashlib.sha256(invalid750.read_bytes()).hexdigest(),'reason':'old measured250VU-per-generator saturation; independently valid166/167VU per-generator at500; latest750/5 peak76.1%; six167/166 partitions avoid the projected200VU CPU saturation','projected_cpu_at_200_vu_percent':76.1*200/150,'projection_is_not_measured_failure':True,'prediction_not_qualification':True})
 topology=json.loads((e/'topology-provenance.json').read_text());topology['qualified_attempt_generators']={r:state()['roles'][r] for r in roles};topology['planned_partitions']=partitions
 save('topology-provenance.json',topology)
 point('normal-1000',1000,120,6)
 point('long-1000',1000,300,6)
 save('qualification.json',{'status':'1000 QUALIFIED','maximum_repeatably_qualified_vus':1000,'normal_and_long_valid':True,'points':results,'run_above_1000':False,'cleanup_required_before_delivery':True,'push':False})
except BaseException as error:
 save('progression-stopped.json',{'status':'STOPPED_WITHOUT_HIGHER_CLAIM','reason':str(error),'results':results,'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cleanup_required':True})
 raise
finally:
 if (folder/'READY').exists() and not (folder/'CLOSED').exists():
  (folder/'FINISH').write_text('1000 phase finished or stopped; mandatory owned AWS cleanup')
