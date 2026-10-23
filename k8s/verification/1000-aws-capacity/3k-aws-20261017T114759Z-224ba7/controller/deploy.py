from client import *
import subprocess
# Read only Compose rendering in memory; transfer ONLY explicitly approved DB keys.
original=root.with_name('cnm-avengers-coffee-microservices-AI')
p=subprocess.run(['docker','compose','--env-file',str(original/'.env'),'-f',str(original/'docker-compose.yml'),'config','--format','json'],capture_output=True,text=True,cwd=original)
if p.returncode:raise ValueError('local read-only Compose config failed; values suppressed')
services=json.loads(p.stdout)['services'];p=None
allowed={'DB_HOST','DB_PORT','DB_USER','DB_PASSWORD','DB_NAME','DB_SCHEMA','PGSSLMODE','DB_SSL','DB_SSL_CA','DB_SSL_REJECT_UNAUTHORIZED'}
db={n:{k:str(v) for k,v in services[n].get('environment',{}).items() if k in allowed and v is not None} for n in ('identity-service','menu-service','news-service')}
services=None
for n,e in db.items():
    if not all(e.get(k) for k in ('DB_HOST','DB_PORT','DB_USER','DB_PASSWORD','DB_NAME')) or e['DB_HOST'] in ('postgres-db','localhost','127.0.0.1'):raise ValueError('approved external DB configuration required')
render=subprocess.run(['kubectl','kustomize','k8s/overlays/aws-capacity'],capture_output=True,text=True,cwd=root,check=True)
r=subprocess.run(['ruby','-ryaml','-rjson','-e','puts JSON.generate(YAML.load_stream(STDIN.read).compact)'],input=render.stdout,capture_output=True,text=True,check=True)
objects=json.loads(r.stdout)
for o in objects:
    if o['kind']=='Deployment':
        for c in o['spec']['template']['spec'].get('containers',[])+o['spec']['template']['spec'].get('initContainers',[]):c['image']=c['image'].replace('k8s-local',meta['image_tag'])
# Public manifest deliberately excludes DB hosts/users/passwords, all supplied via encrypted stdin.
(pathlib.Path(meta['evidence'])/'rendered-baseline.json').write_text(json.dumps({'apiVersion':'v1','kind':'List','items':objects},indent=2)+'\n')
payload=json.dumps({'objects':objects,'db':db}).encode();db=None
script='''set -euo pipefail
umask 077
cat > /run/avengers-capacity/deploy-input.json
python3 - <<'PY'
import json,secrets,subprocess,pathlib
p=pathlib.Path('/run/avengers-capacity/deploy-input.json');data=json.loads(p.read_text());p.unlink()
objects=data['objects'];namespace=next(o for o in objects if o['kind']=='Namespace')
def apply(items):
 r=subprocess.run(['k3s','kubectl','apply','-f','-'],input=json.dumps({'apiVersion':'v1','kind':'List','items':items}),text=True,capture_output=True)
 if r.returncode:raise ValueError('Kubernetes apply failed; all output suppressed')
apply([namespace])
startup={k:secrets.token_hex(32) for k in ('JWT_SECRET','INTERNAL_SERVICE_TOKEN','VNPAY_TMN_CODE','VNPAY_HASH_SECRET')}
for name in ('api-gateway','identity-service','menu-service','news-service'):
 env=data['db'].get(name,{})
 # Keep host/user/schema/TLS in Secrets too, minimizing accidental evidence disclosure.
 objects.extend([{'apiVersion':'v1','kind':'ConfigMap','metadata':{'name':name+'-config','namespace':'avengers-coffee'},'data':{}},{'apiVersion':'v1','kind':'Secret','metadata':{'name':name+'-secrets','namespace':'avengers-coffee'},'type':'Opaque','stringData':{**startup,**env}}])
apply(objects)
print('PASS minimal approved DB-only configuration; fresh benchmark startup secrets; no migrations')
PY
k3s kubectl -n avengers-coffee rollout status deployment/api-gateway --timeout=300s >/dev/null
k3s kubectl -n avengers-coffee rollout status deployment/identity-service --timeout=300s >/dev/null
k3s kubectl -n avengers-coffee rollout status deployment/menu-service --timeout=300s >/dev/null
k3s kubectl -n avengers-coffee rollout status deployment/news-service --timeout=300s >/dev/null
'''
raw=submit('target1',script,payload,timeout=900)
(pathlib.Path(meta['evidence'])/'configuration-apply.txt').write_bytes(raw)
print('DEPLOYMENT_READY',flush=True)
