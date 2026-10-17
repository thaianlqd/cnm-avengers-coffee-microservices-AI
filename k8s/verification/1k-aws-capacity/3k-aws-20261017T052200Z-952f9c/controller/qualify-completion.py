"""Fresh retained deployment; reuse only exact proven500 source/workload, then gated750/1000."""
import datetime,hashlib,json,pathlib,subprocess,sys,time
root=pathlib.Path(__file__).resolve().parents[5];e=pathlib.Path(__file__).resolve().parent.parent;meta=json.loads((root/'.cache/aws-capacity-private/active-1k.json').read_text());assert meta['run']==e.name
folder=pathlib.Path(meta['folder']);controller=e/'controller';historical=root/'k8s/verification/1k-aws-capacity/3k-aws-20261016T184703Z-fc6326'
def save(name,obj):(e/name).write_text(json.dumps(obj,indent=2)+'\n')
def run(name,*args):
 print('BEGIN '+name+' '+' '.join(args),flush=True)
 subprocess.run([sys.executable,'-B',str(controller/(name+'.py')),*args],cwd=root,check=True)
 print('DONE '+name,flush=True)
proof=[]
for name in ('reuse-normal-500','reuse-long-500'):
 p=historical/name;a=json.loads((p/'analysis.json').read_text());provenance=json.loads((p/'point-provenance.json').read_text());m=json.loads((p/'metadata.json').read_text())
 assert a['vus']==500 and a['status']=='STABLE PASS' and a['generator_adequate'] and a['http_pass'] and a['post_smoke'] and a['natural_recovery'] and not a['target_reasons'] and not m.get('diagnostic')
 assert provenance['source_tree_sha256']==meta['source_tree_sha256'] and provenance['workload_sha256']==hashlib.sha256((root/'load-tests/k6/customer-browse-3k.js').read_bytes()).hexdigest()
 proof.append({'point':str(p.relative_to(root)),'analysis_sha256':hashlib.sha256((p/'analysis.json').read_bytes()).hexdigest(),'hold_seconds':a['hold_seconds'],'status':a['status']})
assert max(p['hold_seconds'] for p in proof)>=300
save('historical500-provenance.json',{'verified':True,'source_tree_sha256':meta['source_tree_sha256'],'points':proof,'interpretation':'prior independent500 qualification preserved; not relabeled as fresh500 runs'})
try:
 for _ in range(300):
  if (folder/'CLOSED').exists() or (folder/'FINISH').exists():raise RuntimeError('fleet closed during setup')
  if (e/'setup-ready.json').exists():break
  time.sleep(3)
 else:raise RuntimeError('setup not ready within15minutes')
 # Preserve complete actual dataset fingerprints; stop if a smaller/different-sized dataset would invalidate reuse of500 proof.
 dataset=[]
 for role in ('generator1','generator2','generator3'):
  old=json.loads((historical/(role+'-network-baseline.json')).read_text());new=json.loads((e/(role+'-network-baseline.json')).read_text())
  for route in ('/menu/danh-muc','/menu/san-pham','/users/branches/public','/news?limit=100'):
   fields=lambda b,k:sorted({str(row[k]) for row in b['rows'] if row['route']==route})
   item={'generator':role,'route':route,'item_counts_match':fields(old,'items')==fields(new,'items'),'decoded_sizes_match':fields(old,'decoded_bytes')==fields(new,'decoded_bytes'),'body_hashes_match':fields(old,'body_sha256')==fields(new,'body_sha256')};dataset.append(item)
 save('dataset-continuity.json',{'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'rows':dataset,'passed':all(x['item_counts_match'] and x['decoded_sizes_match'] for x in dataset)})
 assert all(x['item_counts_match'] and x['decoded_sizes_match'] for x in dataset),'material dataset change; requalify500 before higher load'
 results=[]
 for name,vus,hold in [('retained-regression-250',250,120),('retained-normal-750',750,120),('retained-long-750',750,300),('retained-normal-1000',1000,120),('retained-long-1000',1000,300)]:
  if vus==750 and hold==120:
   run('healing','healing','retained');run('healing','rollout','retained')
   assert all(json.loads((e/('retained-'+action+'.json')).read_text())['passed'] for action in ('healing','rollout'))
  print('BEGIN '+name,flush=True)
  with (e/(name+'-controller.log')).open('w') as log:
   p=subprocess.run([sys.executable,'-B',str(controller/'point.py'),name,str(vus),'--generators','3','--hold',str(hold),'--kernel'],cwd=root,stdout=log,stderr=subprocess.STDOUT)
  if p.returncode:raise RuntimeError(name+' orchestration stopped; inspect evidence before retry')
  a=json.loads((e/name/'analysis.json').read_text());valid=a['status']=='STABLE PASS' and a['generator_adequate'] and a['http_pass'] and not a['target_reasons'] and a['post_smoke'] and a['natural_recovery']
  results.append({'point':name,'vus':vus,'hold_seconds':hold,'status':a['status'],'valid_pass':valid})
  save('completion-progression.json',{'updated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'results':results,'historical500_verified':True})
  print(name+' '+a['status'],flush=True)
  if not valid:
   save('completion-escalation-stopped.json',{'point':name,'status':a['status'],'generator_adequate':a['generator_adequate'],'generator_reasons':a.get('generator_reasons'),'target_reasons':a['target_reasons'],'reason':'preserved gate did not pass; no escalation','observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat()})
   break
 print('COMPLETION PROGRESSION FINISHED',flush=True)
except Exception as error:
 save('completion-progression-interruption.json',{'reason':str(error),'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'capacity_status':'not inferred from interrupted orchestration'})
 print(str(error),flush=True);raise
