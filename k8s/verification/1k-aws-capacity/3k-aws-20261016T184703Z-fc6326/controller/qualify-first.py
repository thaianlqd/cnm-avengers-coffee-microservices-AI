"""Preserved gates; do not escalate unless lower qualification actually passed."""
import datetime,json,pathlib,subprocess,sys,time
root=pathlib.Path(__file__).resolve().parents[5];e=pathlib.Path(__file__).resolve().parent.parent;meta=json.loads((root/'.cache/aws-capacity-private/active-1k.json').read_text());assert meta['run']==e.name
folder=pathlib.Path(meta['folder']);controller=e/'controller'
def save(name,obj):(e/name).write_text(json.dumps(obj,indent=2)+'\n')
try:
 for _ in range(300):
  if (folder/'CLOSED').exists() or (folder/'FINISH').exists():raise RuntimeError('fleet no longer active')
  if (e/'setup-ready.json').exists():break
  time.sleep(3)
 else:raise RuntimeError('setup did not finish within15minutes')
 results=[]
 for name,vus,hold in [('reuse-regression-250',250,120),('reuse-normal-500',500,120),('reuse-long-500',500,300)]:
  with (e/(name+'-controller.log')).open('w') as log:
   p=subprocess.run([sys.executable,'-B',str(controller/'point.py'),name,str(vus),'--generators','3','--hold',str(hold),'--kernel'],cwd=root,stdout=log,stderr=subprocess.STDOUT)
  if p.returncode:raise RuntimeError(name+' orchestration failed; preserve log and reconcile owned point processes')
  a=json.loads((e/name/'analysis.json').read_text());valid=a['status']=='STABLE PASS' and a['generator_adequate'] and a['http_pass'] and not a['target_reasons'] and a['post_smoke'] and a['natural_recovery']
  results.append({'point':name,'vus':vus,'hold_seconds':hold,'status':a['status'],'valid_pass':valid})
  save('progression.json',{'updated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'results':results,'two500_pass':len([r for r in results if r['vus']==500 and r['valid_pass']])==2})
  print(name+' '+a['status'],flush=True)
  if not valid:
   save('escalation-stopped.json',{'point':name,'status':a['status'],'reason':'preserved lower gate did not pass; no750/1000 authorized by progression','observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat()})
   break
 else:
  save('two500-passed.json',{'passed':True,'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'points':results,'next':'review candidate retention and availability before750'})
 print('FIRST PROGRESSION COMPLETE',flush=True)
except Exception as error:
 save('progression-interruption.json',{'reason':str(error),'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'capacity_status':'not inferred from interrupted orchestration'})
 print(str(error),flush=True);raise
