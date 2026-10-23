"""Install observation, audit read-only DB and capture safe runtime state."""
from client import *
import concurrent.futures,hashlib,sys
out=pathlib.Path(meta['evidence']);target='http://'+state()['roles']['target1']['private_ip']+':30300'
def observers(role):
 script='set -euo pipefail\nexport DEBIAN_FRONTEND=noninteractive\napt-get install -y -qq ethtool > /run/avengers-capacity/ethtool-install.log 2>&1\nmkdir -p /opt/avengers-workload\n'
 if role=='target1':
  for n in ('aws-observe.py','aws-diagnostic-logs.py','aws-metrics-diagnostics.py'):script+=install(n,root/'scripts/aws-k6'/n)
  script+=install('point-observe.py',pathlib.Path(__file__).with_name('point-observe.py'))
 submit(role,script,timeout=120)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 for _ in pool.map(observers,('target1','target2','target3')):pass
js="""const {Client}=require('pg'); const e=process.env; const c=new Client({host:e.DB_HOST,port:Number(e.DB_PORT),user:e.DB_USER,password:e.DB_PASSWORD,database:e.DB_NAME,ssl:e.PGSSLMODE==='require'?{rejectUnauthorized:false}:false,connectionTimeoutMillis:5000,query_timeout:5000}); (async()=>{try{await c.connect();await c.query('BEGIN READ ONLY');const mode=await c.query('SHOW transaction_read_only');const r=await c.query('SELECT count(*)::int AS count FROM pg_namespace WHERE nspname = ANY($1)',[['identity','menu','inventory','orders','news']]);if(mode.rows[0].transaction_read_only!=='on'||r.rows[0].count!==5)throw Error();await c.query('ROLLBACK');console.log('PASS existing external DB TLS connection; READ ONLY transaction; five application schemas; no data changes');}catch{console.log('FAIL database audit; details suppressed');process.exitCode=1;}finally{await c.end().catch(()=>{});}})();"""
script="k3s kubectl -n avengers-coffee exec -i deployment/identity-service -- node -e "+__import__('shlex').quote(js)+'\n'
(out/'database-readonly-audit.txt').write_bytes(submit('target1',script,timeout=60))
def baseline(role):
 script=f'set -eu\npython3 /opt/avengers-workload/aws-network-baseline.py {target} --count 20 --output /run/avengers-capacity/baseline.json >/dev/null\ncat /run/avengers-capacity/baseline.json\n'
 raw=submit(role,script,timeout=180);result=json.loads(raw)
 (out/(role+'-network-baseline.json')).write_text(json.dumps(result,indent=2)+'\n');assert result['passed'];print(role+' full-JSON gzip four-route baseline PASS',flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 for _ in pool.map(baseline,('generator1','generator2','generator3')):pass
(out/'topology-provenance.json').write_text(json.dumps({'goal_vus':1000,'workload_sha256':hashlib.sha256((root/'load-tests/k6/customer-browse-3k.js').read_bytes()).hexdigest(),'target':target,'path':'generator -> target1 NodePort30300 -> Kubernetes api-gateway Service -> Gateway -> backend Services','initial_setup_generators':{r:state()['roles'][r] for r in ('generator1','generator2','generator3')},'full_json':True,'gzip':True,'think_seconds':3,'diagnostics_baseline':False},indent=2)+'\n')
print('RUNTIME_BASELINE_READY',flush=True)
