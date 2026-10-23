"""Read an already collected observer sample; no extra Kubernetes/API polling."""
from client import *
import argparse,datetime,re
p=argparse.ArgumentParser();p.add_argument('point');a=p.parse_args();assert re.fullmatch('[a-zA-Z0-9-]+',a.point)
script="""python3 - <<'PYSTATUS'
import json,pathlib
p=pathlib.Path('/opt/avengers-observations/POINT/target.jsonl')
if not p.exists():print(json.dumps({'sample_available':False}))
else:
 rows=p.read_text().splitlines();r=json.loads(rows[-1]);print(json.dumps({'sample_available':True,'sample_at':r['observed_at'],'hpa':{h['name']:{k:h.get('status',{}).get(k) for k in ('currentReplicas','desiredReplicas')} for h in r.get('hpa',[])},'nodes':r.get('top_nodes'),'pod_metric_rows':len(r.get('top_pods','').splitlines()),'observer_error':r.get('observer_error'),'conntrack_count':int(pathlib.Path('/proc/sys/net/netfilter/nf_conntrack_count').read_text())}))
PYSTATUS
""".replace('POINT',a.point)
raw=submit('target1',script,timeout=30);r=json.loads(raw);r.update(point=a.point,checked_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
with (pathlib.Path(meta['evidence'])/'live-monitoring.jsonl').open('a') as f:f.write(json.dumps(r)+'\n')
print(json.dumps(r))
