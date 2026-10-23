"""Temporary point orchestration; all load/analysis runs on the existing AWS helpers."""
import argparse,base64,concurrent.futures,importlib.util,io,json,pathlib,tarfile,time
from client import *
target='http://'+state()['roles']['target1']['private_ip']+':30300'
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('name');p.add_argument('vus',type=int);p.add_argument('--generators',type=int,default=2);p.add_argument('--hold',type=int,default=120);p.add_argument('--diagnostic',action='store_true');p.add_argument('--kernel',action='store_true');p.add_argument('--generator-profile',action='store_true');a=p.parse_args()
    if a.generator_profile and not a.diagnostic:raise ValueError('CPU profiling is diagnostic only, never qualification')
    assert a.name.replace('-','').isalnum() and a.generators in (2,3,4,5,6) and 1<=a.vus<=1000 and a.hold in (120,300)
    import datetime
    fleet=state();elapsed=time.time()-datetime.datetime.fromisoformat(fleet['started_at']).timestamp()
    if fleet['runtime_minutes']*60-elapsed<1800:raise RuntimeError('less than 30 minutes until mandatory cleanup; do not start another point')
    point=pathlib.Path(meta['evidence'])/a.name;point.mkdir(exist_ok=False)
    roles=['generator'+str(i+1) for i in range(a.generators)];partitions=[a.vus//a.generators+(i<a.vus%a.generators) for i in range(a.generators)]
    runtime_script='''python3 - <<'PYRUNTIME'
import json,subprocess
objects=json.loads(subprocess.check_output(['k3s','kubectl','-n','avengers-coffee','get','deployments','-o','json'],text=True))['items']
allowed={'CAPACITY_DIAGNOSTICS','GATEWAY_PROXY_KEEP_ALIVE','GATEWAY_MAX_REQUESTS_PER_SOCKET','GATEWAY_REQUEST_LOGGING'}
print(json.dumps({o['metadata']['name']:{'containers':[{'name':c['name'],'image':c['image'],'flags':{e['name']:e.get('value') for e in c.get('env',[]) if e['name'] in allowed},'resources':c.get('resources',{})} for c in o['spec']['template']['spec']['containers']],'init_images':[c['image'] for c in o['spec']['template']['spec'].get('initContainers',[])]} for o in objects}))
PYRUNTIME
'''
    runtime=json.loads(submit('target1',runtime_script,timeout=45))
    assert set(runtime)=={'api-gateway','identity-service','menu-service','news-service'}
    for service,item in runtime.items():
        for container in item['containers']:
            assert container['image']=='avengers/'+service+':'+meta['image_tag']
            assert (container['flags'].get('CAPACITY_DIAGNOSTICS')=='true')==a.diagnostic
        assert all(image=='avengers/customer-media:'+meta['image_tag'] for image in item['init_images'])
    import hashlib
    helpers={n:hashlib.sha256((root/'scripts/aws-k6'/n).read_bytes()).hexdigest() for n in ('aws-target-diagnostics.py','aws-observe.py','aws-diagnostic-logs.py','aws-metrics-diagnostics.py','aws-generator-metrics.py','aws-run-generator.py','archive-aws-points.py','merge-aws-generators.py','analyze-aws-capacity.py','analyze-3k.py')}
    helpers['point-observe.py']=hashlib.sha256(pathlib.Path(__file__).with_name('point-observe.py').read_bytes()).hexdigest()
    (point/'point-provenance.json').write_text(json.dumps({'source_tree_sha256':meta['source_tree_sha256'],'workload_sha256':hashlib.sha256((root/'load-tests/k6/customer-browse-3k.js').read_bytes()).hexdigest(),'diagnostic':a.diagnostic,'generator_profile':a.generator_profile,'runtime':runtime,'helpers_sha256':helpers,'entrypoint':target,'generator_partition':dict(zip(roles,partitions))},indent=2)+'\n')
    baseline=json.loads(submit('target1',f'python3 /opt/avengers-workload/point-observe.py baseline {a.name}',timeout=750))
    (point/'preload-natural-baseline.json').write_text(json.dumps(baseline,indent=2)+'\n')
    if baseline.get('passed') is not True:raise RuntimeError('natural preload baseline unavailable; do not start load')
    submit('target1',f'python3 /opt/avengers-workload/point-observe.py start {a.name} --seconds {60+a.hold+60+900}')
    if a.kernel:
        def start_kernel(role):
            script='set -euo pipefail\nmkdir -p /opt/avengers-host /opt/avengers-workload\n'+install('aws-target-diagnostics.py',root/'scripts/aws-k6/aws-target-diagnostics.py')
            script+=f'nohup python3 /opt/avengers-workload/aws-target-diagnostics.py --seconds {90+60+a.hold+60+120} > /opt/avengers-host/{a.name}.jsonl 2> /opt/avengers-host/{a.name}.stderr < /dev/null &\necho $! > /opt/avengers-host/{a.name}.pid\n'
            submit(role,script,timeout=45)
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            for _ in pool.map(start_kernel,('target1','target2')):pass
    start=time.time()+90
    (point/'synchronized-start.json').write_text(json.dumps({'scheduled_start_epoch':start,'lead_seconds':90,'reason':'allow two30s encrypted-control poll delays; actual <=2s start skew and full VU timeline gates unchanged'},indent=2)+'\n')
    def generator(role,vus):
        script='set -euo pipefail\numask 077\nulimit -Sn 65536\n'+install('archive-aws-points.py',root/'scripts/aws-k6/archive-aws-points.py')
        if a.generator_profile and role=='generator1':
            script+=install('profile-k6.py',pathlib.Path(__file__).with_name('profile-k6.py'))
            script+=install('run-generator-profile.py',pathlib.Path(__file__).with_name('run-generator-profile.py'))
            script+=f'export K6_PROFILING_ENABLED=true K6_ADDRESS=127.0.0.1:6565\nnohup python3 /opt/avengers-workload/profile-k6.py --at {start+120} --point {a.name} > /run/avengers-capacity/profile.log 2>&1 < /dev/null &\n'
        runner='run-generator-profile.py' if a.generator_profile and role=='generator1' else 'aws-run-generator.py'
        script+=f'python3 /opt/avengers-workload/{runner} {a.name} {vus} --hold {a.hold} --target {target} --json-output --start-at {start}\n'
        script+=f'python3 /opt/avengers-workload/aws-network-baseline.py {target} --count 2 --output /opt/avengers-runs/{a.name}/post-smoke.json >/dev/null || test -s /opt/avengers-runs/{a.name}/post-smoke.json\n'
        script+=f'python3 /opt/avengers-workload/archive-aws-points.py /opt/avengers-runs/{a.name} /opt/avengers-raw-archive >/dev/null\n'
        script+="python3 - <<'PY'\nimport base64,io,pathlib,tarfile\nf=pathlib.Path('/opt/avengers-runs/"+a.name+"');out=io.BytesIO()\nwith tarfile.open(fileobj=out,mode='w:gz') as t:\n for name in ('metadata.json','k6.json','k6.log','generator.jsonl','metric-points.jsonl.gz','metric-points-manifest.json','stage-vus.jsonl.gz','http-windows.jsonl.gz','post-smoke.json','exit.txt'):t.add(f/name,arcname=name)\n for name in ('k6-cpu.pprof','profile-status.json'):\n  if (f/name).exists():t.add(f/name,arcname=name)\nprint(base64.b64encode(out.getvalue()).decode())\nPY\n"
        output=submit(role,script,timeout=60+a.hold+60+180)
        # aws-run-generator prints a small JSON status before the base64 archive.
        extract(output.splitlines()[-1],point/role,{'metadata.json','k6.json','k6.log','generator.jsonl','metric-points.jsonl.gz','metric-points-manifest.json','stage-vus.jsonl.gz','http-windows.jsonl.gz','post-smoke.json','exit.txt','k6-cpu.pprof','profile-status.json'})
        metadata=json.loads((point/role/'metadata.json').read_text());metadata['diagnostic']=a.diagnostic;(point/role/'metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')
        print(role+' load and artifact collection complete',flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=a.generators) as pool:
        futures=[pool.submit(generator,r,v) for r,v in zip(roles,partitions)]
        for future in futures:future.result()
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
