from client import *
import argparse,concurrent.futures,time
p=argparse.ArgumentParser();p.add_argument('action',choices=('healing','rollout'));p.add_argument('name');a=p.parse_args();assert a.name.replace('-','').isalnum()
target='http://'+state()['roles']['target1']['private_ip']+':30300'
def identity():
 raw=submit('target1', 'k3s kubectl -n avengers-coffee get pods -l app.kubernetes.io/name=api-gateway -o json\n',timeout=30)
 pods=json.loads(raw)['items']
 return [{'name':p['metadata']['name'],'uid':p['metadata']['uid'],'images':[c['image'] for c in p['spec']['containers']],'ready':all(c.get('ready',False) for c in p['status'].get('containerStatuses',[]))} for p in pods]
before=identity()
def requests():
 script=f'''python3 - <<'PY'
import json,subprocess,time,datetime
rows=[]
for i in range(60):
 start=time.monotonic();r=subprocess.run(['curl','-sS','--max-time','3','-o','/dev/null','-w','%{{http_code}}','{target}/menu/danh-muc'],capture_output=True,text=True);rows.append({{'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':r.stdout,'exit':r.returncode}});time.sleep(max(0,1-(time.monotonic()-start)))
print(json.dumps({{'passed':all(r['status']=='200' and r['exit']==0 for r in rows),'rows':rows}}))
PY
'''
 return json.loads(submit('generator1',script,timeout=120))
with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
 f=pool.submit(requests);time.sleep(5)
 if a.action=='healing':script='set -eu\npod=$(k3s kubectl -n avengers-coffee get pod -l app.kubernetes.io/name=api-gateway -o jsonpath="{.items[0].metadata.name}")\nk3s kubectl -n avengers-coffee delete pod "$pod" >/dev/null\n'
 else:script='set -eu\nk3s kubectl -n avengers-coffee rollout restart deployment/api-gateway >/dev/null\n'
 script+='k3s kubectl -n avengers-coffee rollout status deployment/api-gateway --timeout=180s >/dev/null\n'
 submit('target1',script,timeout=240);result=f.result()
result['before']=before;result['after']=identity();result['new_pod_uid']=bool({p['uid'] for p in result['after']}-{p['uid'] for p in before});result['same_immutable_images']={i for p in before for i in p['images']}=={i for p in result['after'] for i in p['images']};result['passed']=result['passed'] and result['new_pod_uid'] and result['same_immutable_images'];result['scope']='one Gateway Pod / same-image deployment restart; not node HA or versioned deployment'
(pathlib.Path(meta['evidence'])/(a.name+'-'+a.action+'.json')).write_text(json.dumps(result,indent=2)+'\n');assert result['passed'];print(a.action+' PASS 60/60 HTTP200 same image',flush=True)
