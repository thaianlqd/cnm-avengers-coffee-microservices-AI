"""750 only: lower regression, measured generator expansion, normal and long gates."""
import datetime,hashlib,json,subprocess,sys,time
from client import *
e=run_path;controller=e/'controller'
historical=root/'k8s/verification/1k-aws-capacity/3k-aws-20261016T184703Z-fc6326'
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
 assert vus<=750 and 2<=generators<=5
 with (e/(name+'-controller.log')).open('w') as log:
  proc=subprocess.run([sys.executable,'-B',str(controller/'point.py'),name,str(vus),'--generators',str(generators),'--hold',str(hold),'--kernel'],cwd=root,stdout=log,stderr=subprocess.STDOUT)
 if proc.returncode:raise RuntimeError(name+' orchestration failed; preserve evidence, no capacity inference')
 a=json.loads((e/name/'analysis.json').read_text())
 results.append({'point':name,'vus':vus,'hold_seconds':hold,'generators':generators,'status':a['status'],'valid_pass':bool(valid(a))})
 save('progression.json',{'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'results':results,'maximum_planned_vus':750,'run_1000':False})
 print(name+' '+a['status'],flush=True)
 if not valid(a):raise RuntimeError(name+' did not qualify; stop preserved progression')
 return a
try:
 approval=json.loads((e/'authorization.json').read_text())
 assert approval['user_approved'] is True and approval['maximum_workload_vus']==750 and approval['run_1000'] is False
 assert meta['run']==e.name and state()['max_generators']==5 and state()['runtime_minutes']==90
 for _ in range(300):
  if (folder/'CLOSED').exists() or (folder/'FINISH').exists():raise RuntimeError('fleet closed during setup')
  if (e/'setup-ready.json').exists():break
  if (e/'setup-failed.json').exists():raise RuntimeError('setup failed')
  time.sleep(3)
 else:raise RuntimeError('setup not ready within15minutes')
 proof=[]
 for name in ('reuse-normal-500','reuse-long-500'):
  p=historical/name;a=json.loads((p/'analysis.json').read_text());provenance=json.loads((p/'point-provenance.json').read_text())
  assert a['vus']==500 and valid(a) and provenance['diagnostic'] is False
  assert provenance['source_tree_sha256']==meta['source_tree_sha256']
  assert provenance['workload_sha256']==hashlib.sha256((root/'load-tests/k6/customer-browse-3k.js').read_bytes()).hexdigest()
  proof.append({'point':str(p.relative_to(root)),'analysis_sha256':hashlib.sha256((p/'analysis.json').read_bytes()).hexdigest(),'hold_seconds':a['hold_seconds']})
 assert max(p['hold_seconds'] for p in proof)>=300
 save('historical500-provenance.json',{'verified':True,'points':proof,'source_tree_sha256':meta['source_tree_sha256']})
 dataset=[]
 for role in ('generator1','generator2','generator3'):
  old=json.loads((historical/(role+'-network-baseline.json')).read_text());new=json.loads((e/(role+'-network-baseline.json')).read_text())
  for route in ('/menu/danh-muc','/menu/san-pham','/users/branches/public','/news?limit=100'):
   values=lambda b,k:sorted({str(row[k]) for row in b['rows'] if row['route']==route})
   dataset.append({'generator':role,'route':route,'item_counts_match':values(old,'items')==values(new,'items'),'decoded_sizes_match':values(old,'decoded_bytes')==values(new,'decoded_bytes'),'body_hashes_match':values(old,'body_sha256')==values(new,'body_sha256')})
 continuous=all(x['item_counts_match'] and x['decoded_sizes_match'] for x in dataset)
 save('dataset-continuity.json',{'rows':dataset,'passed':continuous,'body_hash_differences_preserved':True})
 point('regression-250',250,120,3)
 point('regression-normal-500',500,120,3)
 if not continuous:
  # Different material dataset requires two fresh500 passes; no fake source/data equivalence.
  point('fresh-long-500',500,300,3)
 run('healing','healing','retained');run('healing','rollout','retained')
 assert all(json.loads((e/('retained-'+action+'.json')).read_text())['passed'] for action in ('healing','rollout'))
 # Three measured generators saturated at250 each; five at150 each remain below
 # the proven166/167 per-generator level. Record the same original proof hash for each addition.
 raw=json.loads(invalid750.read_text());assert raw['status']=='INVALID GENERATOR' and raw['generator_adequate'] is False
 new_roles=[]
 for _ in range(2):
  session.add_generator(folder,e,invalid750)
  new_roles.append('generator'+str(sum(r.startswith('generator') for r in state()['roles'])))
 run('generators',*new_roles)
 target='http://'+state()['roles']['target1']['private_ip']+':30300'
 for role in new_roles:
  script=f'set -eu\npython3 /opt/avengers-workload/aws-network-baseline.py {target} --count 20 --output /run/avengers-capacity/baseline.json >/dev/null\ncat /run/avengers-capacity/baseline.json\n'
  baseline=json.loads(submit(role,script,timeout=180));assert baseline['passed'];save(role+'-network-baseline.json',baseline)
 save('generator-partition-plan.json',{'total_vus':750,'partitions':{r:150 for r in sorted(state()['roles']) if r.startswith('generator')},'measured_inadequacy_sha256':hashlib.sha256(invalid750.read_bytes()).hexdigest(),'reason':'five150VU partitions stay below the independently measured valid166/167VU per-generator load','prediction_not_qualification':True})
 run('precheck')
 point('normal-750',750,120,5)
 point('long-750',750,300,5)
 save('qualification.json',{'status':'750 QUALIFIED','maximum_repeatably_qualified_vus':750,'normal_and_long_valid':True,'points':results,'run_1000':False,'cleanup_required_before_delivery':True,'push':False})
except BaseException as error:
 save('progression-stopped.json',{'status':'STOPPED_WITHOUT_HIGHER_CLAIM','reason':str(error),'results':results,'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'run_1000':False,'cleanup_required':True})
 raise
finally:
 if (folder/'READY').exists() and not (folder/'CLOSED').exists():
  (folder/'FINISH').write_text('750 phase finished or stopped; mandatory owned AWS cleanup')
