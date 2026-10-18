"""Approved1000-only launch supervisor. Pending manifests fail before control/AWS mutation."""
import datetime,hashlib,importlib.util,json,pathlib,signal,subprocess,sys,time
root=pathlib.Path(__file__).resolve().parents[5];e=pathlib.Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('private_session',pathlib.Path(__file__).resolve().parent/'private-session-2target.py')
session=importlib.util.module_from_spec(spec);spec.loader.exec_module(session)

def validate():
 assert subprocess.check_output(['git','branch','--show-current'],cwd=root,text=True).strip()=='features_k8s'
 plan=json.loads((e/'projected-cost.json').read_text());approval=json.loads((e/'authorization.json').read_text())
 session.validate_extended_topology(e,plan,6,95)
 assert approval['targets']==2 and approval.get('shared_budget_with_prior_closed_run') is True
 assert approval['maximum_workload_vus']==1000 and approval['run_1000'] is True
 assert plan['max_projected_usd']<=3.00 and plan['maximum_generators']==6 and plan['guest_termination_minutes']==95
 assert approval['account']=='956035085549' and approval['region']=='ap-southeast-2'
 preflight=json.loads((e/'read-only-preflight.json').read_text())
 age=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(preflight['observed_at'])).total_seconds()
 assert 0<=age<=600,'refresh AWS inventory, eligibility and price preflight before launch'
 assert preflight.get('account_plan')=='FREE' and preflight.get('account_plan_directly_verified') is True
 assert preflight['instance_free_tier_eligible'] and preflight['ami_free_tier_eligible']
 assert not any(v for phase in preflight['inventory'].values() for v in phase.values()) and not any(preflight['owned_eni_counts'].values())
 manifest=json.loads((e/'source-manifest.json').read_text())
 assert all(hashlib.sha256((root/n).read_bytes()).hexdigest()==v for n,v in manifest['files'].items())
 archive=root/'.cache/aws-capacity-private/phase1k-source/source.tar.gz'
 assert hashlib.sha256(archive.read_bytes()).hexdigest()==manifest['source_archive_sha256']
 assert hashlib.sha256((root/'load-tests/k6/customer-browse-3k.js').read_bytes()).hexdigest()==manifest['workload_sha256']
 session.a.require_clean_benchmark_inventory()
 return manifest,archive

def main():
 manifest,archive=validate()
 folder=root/'.cache/aws-capacity-private'/e.name
 assert not folder.exists(),'fresh session folder required; never reuse CLOSED or stale keys'
 meta={'root':str(root),'evidence':str(e),'folder':str(folder),'run':e.name,
       'source_archive':str(archive),'source_tree_sha256':manifest['application_tree_sha256'],
       'image_tag':'3k-aws-'+manifest['application_tree_sha256'][:12],
       'k3s_version':'v1.36.5+k3s1','starting_head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),
       'maximum_workload_vus':1000,'push':False}
 active=root/'.cache/aws-capacity-private/active-1000-2target.json';active.parent.mkdir(mode=0o700,exist_ok=True)
 active.write_text(json.dumps(meta,indent=2)+'\n')
 lifecycle=None;setup=None
 try:
  with (active.parent/(e.name+'-lifecycle.log')).open('w') as log:
   lifecycle=subprocess.Popen([sys.executable,'-u',str(pathlib.Path(__file__).resolve().parent/'private-session-2target.py'),'start',str(folder),'--run-id',e.name,'--evidence',str(e),'--max-generators','6','--runtime-minutes','95'],cwd=root,stdout=log,stderr=subprocess.STDOUT)
  print('bounded1000 lifecycle started; cleanup deadline95min',flush=True)
  with (active.parent/(e.name+'-setup.log')).open('w') as log:
   setup=subprocess.Popen([sys.executable,'-u','-B',str(e/'controller/setup-1000.py')],cwd=root,stdout=log,stderr=subprocess.STDOUT)
  while setup.poll() is None:
   if lifecycle.poll() is not None:raise RuntimeError('lifecycle ended during setup; no load')
   time.sleep(3)
  if setup.returncode:
   (e/'setup-failed.json').write_text(json.dumps({'passed':False,'reason':'setup failed; private output suppressed'})+'\n')
   raise RuntimeError('1000 setup failed; no load')
  subprocess.run([sys.executable,'-u','-B',str(e/'controller/qualify-1000.py')],cwd=root,check=True)
 finally:
  if setup is not None and setup.poll() is None:
   setup.terminate()
   try:setup.wait(timeout=30)
   except subprocess.TimeoutExpired:setup.kill();setup.wait()
  if folder.exists() and not (folder/'CLOSED').exists():(folder/'FINISH').write_text('supervisor exit; mandatory cleanup')
  if lifecycle is not None:
   try:lifecycle.wait(timeout=600)
   except subprocess.TimeoutExpired:lifecycle.send_signal(signal.SIGTERM);lifecycle.wait(timeout=600)
  if folder.exists() and not (folder/'CLOSED').exists():raise RuntimeError('cleanup not verified; reconcile this owned RunId')
 print('1000 phase closed; inspect actual qualification and cleanup evidence',flush=True)

if __name__=='__main__':main()
