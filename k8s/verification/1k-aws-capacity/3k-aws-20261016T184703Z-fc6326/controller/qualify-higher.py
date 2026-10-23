"""750 and1000 only after preserved independent lower gates."""
import datetime,json,pathlib,subprocess,sys,time
root=pathlib.Path(__file__).resolve().parents[5];e=pathlib.Path(__file__).resolve().parent.parent;meta=json.loads((root/'.cache/aws-capacity-private/active-1k.json').read_text());assert meta['run']==e.name
folder=pathlib.Path(meta['folder']);controller=e/'controller'
def save(name,obj):(e/name).write_text(json.dumps(obj,indent=2)+'\n')
assert json.loads((e/'two500-passed.json').read_text())['passed']
for _ in range(180):
 if (folder/'CLOSED').exists() or (folder/'FINISH').exists():raise RuntimeError('fleet closed')
 if all((e/('retained-'+name+'.json')).exists() for name in ('healing','rollout')):break
 time.sleep(3)
else:raise RuntimeError('retained availability checks not completed')
assert all(json.loads((e/('retained-'+name+'.json')).read_text())['passed'] for name in ('healing','rollout'))
results=[]
try:
 for name,vus,hold in [('reuse-normal-750',750,120),('reuse-long-750',750,300),('reuse-normal-1000',1000,120),('reuse-long-1000',1000,300)]:
  print('BEGIN '+name,flush=True)
  with (e/(name+'-controller.log')).open('w') as log:
   p=subprocess.run([sys.executable,'-B',str(controller/'point.py'),name,str(vus),'--generators','3','--hold',str(hold),'--kernel'],cwd=root,stdout=log,stderr=subprocess.STDOUT)
  if p.returncode:raise RuntimeError(name+' orchestration stopped; inspect saved evidence before any retry')
  a=json.loads((e/name/'analysis.json').read_text());valid=a['status']=='STABLE PASS' and a['generator_adequate'] and a['http_pass'] and not a['target_reasons'] and a['post_smoke'] and a['natural_recovery']
  results.append({'point':name,'vus':vus,'hold_seconds':hold,'status':a['status'],'valid_pass':valid})
  save('higher-progression.json',{'updated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'results':results})
  print(name+' '+a['status'],flush=True)
  if not valid:
   save('higher-escalation-stopped.json',{'point':name,'status':a['status'],'generator_adequate':a['generator_adequate'],'generator_reasons':a.get('generator_reasons'),'target_reasons':a['target_reasons'],'reason':'preserved gate not passed; no escalation','observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat()})
   break
 print('HIGHER PROGRESSION COMPLETE',flush=True)
except Exception as error:
 save('higher-progression-interruption.json',{'reason':str(error),'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'capacity_status':'not inferred from interrupted orchestration'})
 print(str(error),flush=True);raise
