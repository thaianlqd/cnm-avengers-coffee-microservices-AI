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

import os,signal
assert (folder/'READY').exists() and not (folder/'FINISH').exists() and not (folder/'CLOSED').exists(), 'closed/inactive sessions cannot be replayed'
def signal_owned(pid, marker, sig):
 try:
  command=subprocess.check_output(['ps','-p',str(pid),'-o','command='],text=True)
  if str(controller/marker) in command:os.kill(pid,sig)
 except (ProcessLookupError,subprocess.CalledProcessError):pass
try:
 recovery_deadline=datetime.datetime.fromisoformat(state()['started_at']).timestamp()+65*60-30
 while not (e/'normal-1000/analysis.json').exists():
  if time.time()>recovery_deadline or (folder/'FINISH').exists() or (folder/'CLOSED').exists():raise RuntimeError('normal-1000 recovery not complete before unchanged long-point timing guard')
  time.sleep(3)
 results=json.loads((e/'progression.json').read_text())['results']
 a=json.loads((e/'normal-1000/analysis.json').read_text())
 assert valid(a) and a['vus']==1000 and a['generator_count']==6 and a['hold_seconds']==120, 'recovered normal did not qualify; no long run'
 results.append({'point':'normal-1000','vus':1000,'hold_seconds':120,'generators':6,'status':a['status'],'valid_pass':True,'original_load_artifacts_recovered':True})
 save('progression.json',{'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'results':results,'maximum_planned_vus':1000,'run_1000':True,'delivery_recovery_only':True})
 point('long-1000',1000,300,6)
 save('qualification.json',{'status':'1000 QUALIFIED','maximum_repeatably_qualified_vus':1000,'normal_and_long_valid':True,'target_nodes':2,'historical_three_target_results_not_relabelled':True,'points':results,'run_above_1000':False,'cleanup_required_before_delivery':True,'original_normal_load_preserved_via_delivery_recovery':True,'push':False})
except BaseException as error:
 save('recovery-progression-stopped.json',{'status':'STOPPED_WITHOUT_HIGHER_CLAIM','reason':str(error),'results':results,'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cleanup_required':True})
 raise
finally:
 if not (folder/'CLOSED').exists():(folder/'FINISH').write_text('delivery recovery and bounded continuation completed or stopped; mandatory cleanup')
 # Original orchestration was suspended, not the independent native lifecycle.
 # Its collector was deliberately terminated. Retire that parent and let the
 # original supervisor finally wait for the same mandatory native cleanup.
 signal_owned(12666,'qualify-1000.py',signal.SIGKILL)
 signal_owned(8837,'launch-1000.py',signal.SIGCONT)
