"""Recover retained artifacts from the original normal-1000 load; never rerun load."""
import argparse,base64,concurrent.futures,io,json,pathlib,tarfile,time
from client import *
a=argparse.Namespace(name='normal-1000',vus=1000,generators=6,hold=120,kernel=True,diagnostic=False)
point=pathlib.Path(meta['evidence'])/a.name
assert point.exists() and not (point/'analysis.json').exists()
roles=['generator'+str(i) for i in range(1,7)]
def generator(role):
    script="""set -euo pipefail
python3 - <<'REMOTE'
import base64,io,pathlib,tarfile,json
f=pathlib.Path('/opt/avengers-runs/normal-1000');assert (f/'exit.txt').exists()
out=io.BytesIO()
with tarfile.open(fileobj=out,mode='w:gz') as t:
 for name in ('metadata.json','k6.json','k6.log','generator.jsonl','metric-points.jsonl.gz','metric-points-manifest.json','stage-vus.jsonl.gz','http-windows.jsonl.gz','post-smoke.json','exit.txt'):t.add(f/name,arcname=name)
print(base64.b64encode(out.getvalue()).decode())
REMOTE
"""
    output=submit(role,script,timeout=60)
    extract(output.splitlines()[-1],point/role,{'metadata.json','k6.json','k6.log','generator.jsonl','metric-points.jsonl.gz','metric-points-manifest.json','stage-vus.jsonl.gz','http-windows.jsonl.gz','post-smoke.json','exit.txt'})
    m=json.loads((point/role/'metadata.json').read_text());m['diagnostic']=False;(point/role/'metadata.json').write_text(json.dumps(m,indent=2)+'\n')
    print(role+' original artifact recovery complete',flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    for _ in pool.map(generator,roles):pass
if a.kernel:
    def finish_kernel(role):
        script=f'pid="$(cat /opt/avengers-host/{a.name}.pid)"\nif test -r /proc/$pid/cmdline && tr "\\0" " " < /proc/$pid/cmdline | grep -q "/opt/avengers-workload/aws-target-diagnostics.py"; then kill "$pid"; fi\nsleep 1\ngzip -c /opt/avengers-host/{a.name}.jsonl | base64 -w0\n'
        data=submit(role,script,timeout=45);(point/('kernel-'+role+'.jsonl.gz')).write_bytes(base64.b64decode(data))
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for _ in pool.map(finish_kernel,('target1','target2')):pass
print('Load complete; observing natural HPA recovery',flush=True)
observed=submit('target1',f'python3 /opt/avengers-workload/point-observe.py finish {a.name}',timeout=850)
extract(observed,point,{'target.jsonl.gz','diagnostics.jsonl.gz','recovery.json','started-at','observer.log','diagnostic-stream.log','diagnostic-stream-status.json','metrics-server.json'})
for role in roles:
    for filename in ('target.jsonl.gz','recovery.json'):(point/role/filename).write_bytes((point/filename).read_bytes())
# Offload exact raw-observation merge/analysis to a generator, after load/recovery.
buffer=io.BytesIO()
with tarfile.open(fileobj=buffer,mode='w:gz') as archive:
    for path in point.rglob('*'):
        if path.is_file():archive.add(path,arcname=str(path.relative_to(point)))
script='set -euo pipefail\numask 077\n'
for name in ('merge-aws-generators.py','analyze-aws-capacity.py','analyze-3k.py'):script+=install(name,root/'scripts/aws-k6'/name)
script+="python3 -c 'import base64,io,pathlib,tarfile,sys; p=pathlib.Path(\"/opt/avengers-analysis/"+a.name+"\");p.mkdir(parents=True);tarfile.open(fileobj=io.BytesIO(base64.b64decode(sys.stdin.buffer.read())),mode=\"r:gz\").extractall(p,filter=\"data\")'\n"
script+=f'cd /opt/avengers-analysis/{a.name}\n'
script+='python3 /opt/avengers-workload/merge-aws-generators.py . '+' '.join(roles)+'\n'
script+=f'cp {roles[0]}/generator.jsonl generator.jsonl\ncp {roles[0]}/post-smoke.json post-smoke.json\ncat '+ ' '.join(r+'/k6.log' for r in roles)+' > k6.log\n'
script+='python3 /opt/avengers-workload/analyze-aws-capacity.py . > /opt/avengers-analysis/'+a.name+'/analysis-output.json\n'
script+="python3 - <<'PY'\nimport base64,io,pathlib,tarfile\nout=io.BytesIO()\nwith tarfile.open(fileobj=out,mode='w:gz') as t:\n for name in ('metadata.json','k6.json','analysis.json'):t.add(name,arcname=name)\n for role in "+repr(roles)+":t.add(role+'/analysis.json',arcname=role+'-analysis.json')\nprint(base64.b64encode(out.getvalue()).decode())\nPY\n"
analyzed=submit('generator1',script,base64.b64encode(buffer.getvalue()),timeout=300)
allowed={'metadata.json','k6.json','analysis.json',*(r+'-analysis.json' for r in roles)}
extract(analyzed,point,allowed)
for role in roles:
    (point/role/'analysis.json').write_bytes((point/(role+'-analysis.json')).read_bytes())
    (point/(role+'-analysis.json')).unlink()
(point/'generator.jsonl').write_bytes((point/roles[0]/'generator.jsonl').read_bytes())
(point/'post-smoke.json').write_bytes((point/roles[0]/'post-smoke.json').read_bytes())
(point/'k6.log').write_text(''.join((point/role/'k6.log').read_text() for role in roles))
result=json.loads((point/'analysis.json').read_text())
print(json.dumps({k:result.get(k) for k in ('vus','requests','rps','failure_rate','check_rate','p50_ms','p90_ms','p95_ms','hold_p95_ms','p99_ms','max_latency_ms','generator_adequate','target_reasons','generator_reasons','status')},indent=2),flush=True)
