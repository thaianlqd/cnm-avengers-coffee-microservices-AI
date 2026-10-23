from client import *
import concurrent.futures,datetime,hashlib
name='reuse-normal-500';point=pathlib.Path(meta['evidence'])/name
# Only generator1 failed start validation; two completed shards are preserved, never renamed as a500 run.
raw=submit('generator1',"cat /opt/avengers-runs/reuse-normal-500/metadata.json\n",timeout=30);json.loads(raw);(point/'generator1').mkdir(exist_ok=True);(point/'generator1/metadata.json').write_bytes(raw)
job='298c9fe293bb9888';error=(folder/'generator1'/(job+'.stderr')).read_bytes();j=json.loads((folder/'generator1'/(job+'.json')).read_text());(point/'generator1/control-error.txt').write_bytes(error)
(point/'incomplete-point.json').write_text(json.dumps({'status':'INCOMPLETE CONTROL START — NOT QUALIFICATION','requested_vus':500,'started_partitions':['generator2','generator3'],'started_partition_vus':333,'missing_partition_vus':167,'cause':'generator1 rejected invalid synchronized start; no k6 process started on this shard','failed_control_job':job,'worker_command_started_at':j['started_at'],'worker_command_finished_at':j['finished_at'],'stderr_sha256':hashlib.sha256(error).hexdigest(),'retention':'no merged500 summary/analysis fabricated; all completed shard evidence preserved','fix':'increase schedule lead from35 to90 seconds; keep <=120s native validation, unchanged workload and <=2s actual skew gate'},indent=2)+'\n')
def kernel(role):
 script=f'pid="$(cat /opt/avengers-host/{name}.pid)"\nif test -r /proc/$pid/cmdline && tr "\\0" " " < /proc/$pid/cmdline | grep -q "/opt/avengers-workload/aws-target-diagnostics.py"; then kill "$pid"; fi\nsleep 1\ngzip -c /opt/avengers-host/{name}.jsonl | base64 -w0\n'
 (point/('kernel-'+role+'.jsonl.gz')).write_bytes(base64.b64decode(submit(role,script,timeout=45)))
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 for _ in pool.map(kernel,('target1','target2','target3')):pass
raw=submit('target1',f'python3 /opt/avengers-workload/point-observe.py finish {name}',timeout=850)
extract(raw,point,{'target.jsonl.gz','diagnostics.jsonl.gz','recovery.json','started-at','observer.log','diagnostic-stream.log','diagnostic-stream-status.json','metrics-server.json'})
print('incomplete point safely archived; natural recovery recorded; not counted as500',flush=True)
