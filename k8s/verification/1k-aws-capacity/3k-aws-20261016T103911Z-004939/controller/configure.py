from client import *
import argparse,shlex
p=argparse.ArgumentParser();p.add_argument('name');p.add_argument('--diagnostics',choices=('true','false'));p.add_argument('--keepalive',choices=('true','false'));a=p.parse_args();assert a.name.replace('-','').isalnum()
script='set -eu\n'
if a.diagnostics is not None:
 for service in ('api-gateway','identity-service','menu-service','news-service'):script+='k3s kubectl -n avengers-coffee set env deployment/'+service+' CAPACITY_DIAGNOSTICS='+a.diagnostics+' >/dev/null\n'
if a.keepalive is not None:script+='k3s kubectl -n avengers-coffee set env deployment/api-gateway GATEWAY_PROXY_KEEP_ALIVE='+a.keepalive+' >/dev/null\n'
if a.diagnostics is not None or a.keepalive is not None:
 for service in ('api-gateway','identity-service','menu-service','news-service'):script+='k3s kubectl -n avengers-coffee rollout status deployment/'+service+' --timeout=240s >/dev/null\n'
script+='''python3 - <<'PY'
import json,subprocess
k=lambda *a:json.loads(subprocess.check_output(['k3s','kubectl','-n','avengers-coffee',*a,'-o','json'],text=True))
items=k('get','deployments')['items'];allowed={'CAPACITY_DIAGNOSTICS','GATEWAY_REQUEST_LOGGING','GATEWAY_PROXY_KEEP_ALIVE','GATEWAY_MAX_REQUESTS_PER_SOCKET','PORT'}
result={'deployments':[{'name':o['metadata']['name'],'replicas':o['spec']['replicas'],'containers':[{'name':c['name'],'image':c['image'],'resources':c.get('resources',{}),'flags':[v for v in c.get('env',[]) if v['name'] in allowed]} for c in o['spec']['template']['spec']['containers']]} for o in items],'hpa':k('get','hpa'),'common':k('get','configmap','avengers-common')['data']}
print(json.dumps(result,indent=2))
PY
'''
raw=submit('target1',script,timeout=650);json.loads(raw);(pathlib.Path(meta['evidence'])/(a.name+'-runtime.json')).write_bytes(raw)
print('runtime captured '+a.name,flush=True)
