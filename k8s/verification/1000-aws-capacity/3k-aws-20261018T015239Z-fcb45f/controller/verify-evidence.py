"""Cross-file integrity checks; exact quantile computation remains in the AWS merger."""
from client import root,meta
import csv,datetime,hashlib,json,pathlib,math
run=pathlib.Path(meta['evidence']);source=json.loads((run/'source-manifest.json').read_text());results=[]
for name,digest in source['files'].items():assert hashlib.sha256((root/name).read_bytes()).hexdigest()==digest, name
workload=hashlib.sha256((root/'load-tests/k6/customer-browse-3k.js').read_bytes()).hexdigest();assert workload=='8746a95c5e11382ded7f355e68ecec34a759346bc079b3db2b40c33cefed2fb2'
for p in sorted(run.iterdir()):
 if not p.is_dir() or not (p/'analysis.json').exists():continue
 a=json.loads((p/'analysis.json').read_text());m=json.loads((p/'metadata.json').read_text());s=json.loads((p/'k6.json').read_text())['metrics'];shards=[p/n for n in m['generator_folders']]
 assert a['vus']==m['vus']==sum(json.loads((g/'metadata.json').read_text())['vus'] for g in shards)
 count=0
 for g in shards:
  manifest=json.loads((g/'metric-points-manifest.json').read_text());n=json.loads((g/'k6.json').read_text())['metrics']['http_reqs']['values']['count'];count+=n
  assert manifest['compact_sha256']==hashlib.sha256((g/'metric-points.jsonl.gz').read_bytes()).hexdigest()
  assert all(manifest['metric_observation_counts'][k]==n for k in ('http_req_duration','http_req_failed','http_reqs'))
  assert (g/'target.jsonl.gz').read_bytes()==(p/'target.jsonl.gz').read_bytes()
  assert json.loads((g/'recovery.json').read_text())==json.loads((p/'recovery.json').read_text())
 assert count==a['requests']==s['http_reqs']['values']['count']
 if (p/'correlation.csv').exists():
  with (p/'correlation.csv').open() as stream:correlations=list(csv.DictReader(stream))
  assert {r['generator'] for r in correlations}==set(m['generator_folders'])
  assert sum(int(r['requests_5s']) for r in correlations)==count
 if (p/'network-correlation.csv').exists():
  with (p/'network-correlation.csv').open() as stream:network=list(csv.DictReader(stream))
  assert sum(int(r['requests']) for r in network)==count

 for field,metric,key in [('failure_rate','http_req_failed','rate'),('check_rate','checks','rate'),('rps','http_reqs','rate'),('p50_ms','http_req_duration','p(50)'),('p90_ms','http_req_duration','p(90)'),('p95_ms','http_req_duration','p(95)'),('p99_ms','http_req_duration','p(99)'),('max_latency_ms','http_req_duration','max'),('hold_p95_ms','http_req_duration{phase:hold}','p(95)')]:assert math.isclose(a[field],s[metric]['values'][key],rel_tol=1e-12,abs_tol=1e-12)
 if a['status']=='STABLE PASS':assert a['generator_adequate'] and not a['target_reasons'] and a['http_pass'] and a['post_smoke'] and a['natural_recovery'] and not m.get('diagnostic')
 if m.get('diagnostic'):assert a['qualification_eligible'] is False and a['status']=='DIAGNOSTIC (NOT QUALIFICATION)'
 results.append({'point':p.name,'requests':count,'status':a['status'],'passed':True})
(run/'artifact-consistency.json').write_text(json.dumps({'observed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':True,'frozen_source_matches':True,'workload_sha256':workload,'points':results,'quantile_method':'exact linear interpolation over all observations, never average shard percentiles; merged on AWS'},indent=2)+'\n')
print(json.dumps({'artifact_consistency':True,'points_checked':len(results)}))
