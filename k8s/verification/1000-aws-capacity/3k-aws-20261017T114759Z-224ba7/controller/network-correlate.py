"""Join numeric connection pressure and five-second HTTP counts, never average quantiles."""
import csv,datetime,gzip,json,pathlib,sys
p=pathlib.Path(sys.argv[1]);epoch=lambda v:datetime.datetime.fromisoformat(v.replace('Z','+00:00')).timestamp();meta=json.loads((p/'metadata.json').read_text());start=epoch(meta['load_started_at']);holdend=start+60+meta['hold_seconds'];rows={};firsts={}
def read(path):
 with gzip.open(path,'rt') as f:return [json.loads(l) for l in f]
def window(t):return rows.setdefault(int(t//5)*5,{'requests':0,'failures':0,'latency_samples':0,'latency_sum_ms':0,'route_shard_p95_min_ms':None,'route_shard_p95_max_ms':None})
for g in p.glob('generator[1-6]'):
 for r in read(g/'http-windows.jsonl.gz'):
  row=window(epoch(r['observed_at']));row['requests']+=r['requests'];row['failures']+=r['failures'];row['latency_samples']+=r['latency_samples'];row['latency_sum_ms']+=r['latency_sum_ms']
  for key,fun in [('route_shard_p95_min_ms',min),('route_shard_p95_max_ms',max)]:
   if r['p95_ms'] is not None:row[key]=r['p95_ms'] if row[key] is None else fun(row[key],r['p95_ms'])
for f in sorted(p.glob('kernel-target*.jsonl.gz')):
 host=f.name.removeprefix('kernel-').removesuffix('.jsonl.gz');previous=None
 for r in read(f):
  t=epoch(r['observed_at']);row=window(t);usage=r.get('conntrack_usage',{});row[host+'_conntrack_count']=usage.get('count');row[host+'_conntrack_max']=usage.get('max');ena={k:sum(v[k] for v in r.get('ena',{}).values() if k in v) if any(k in v for v in r.get('ena',{}).values()) else None for k in ('conntrack_allowance_exceeded','bw_in_allowance_exceeded','bw_out_allowance_exceeded','pps_allowance_exceeded')}
  if previous:
   old=previous.get('conntrack_counters');cur=r.get('conntrack_counters')
   for k in ('drop','early_drop'):
    delta=cur[k]-old[k] if isinstance(cur,dict) and isinstance(old,dict) and k in cur and k in old else None;row[host+'_'+k+'_delta']=delta
    if delta is not None and delta>0:firsts.setdefault(host+'_'+k,r['observed_at'])
   for k,value in ena.items():
    oldvalue=sum(v[k] for v in previous.get('ena',{}).values() if k in v) if any(k in v for v in previous.get('ena',{}).values()) else None;delta=value-oldvalue if value is not None and oldvalue is not None else None;row[host+'_ena_'+k+'_delta']=delta
    if delta is not None and delta>0:firsts.setdefault(host+'_ena_'+k,r['observed_at'])
  previous=r
records=[]
for t,v in sorted(rows.items()):
 v.update(observed_at=datetime.datetime.fromtimestamp(t,datetime.timezone.utc).isoformat(),phase='before' if t<start else 'ramp' if t<start+60 else 'hold' if t<holdend else 'down_or_after',seconds_from_load=t-start,error_rate=v['failures']/v['requests'] if v['requests'] else None,mean_latency_ms=v['latency_sum_ms']/v['latency_samples'] if v['latency_samples'] else None);records.append(v)
fields=['observed_at','phase','seconds_from_load','requests','failures','error_rate','mean_latency_ms','route_shard_p95_min_ms','route_shard_p95_max_ms']+sorted({k for v in records for k in v}-{'observed_at','phase','seconds_from_load','requests','failures','error_rate','mean_latency_ms','route_shard_p95_min_ms','route_shard_p95_max_ms'})
with (p/'network-correlation.csv').open('w',newline='') as f:
 writer=csv.DictWriter(f,fieldnames=fields,lineterminator='\n');writer.writeheader();writer.writerows(records)
(p/'network-correlation-notes.json').write_text(json.dumps({'rows':len(records),'first_positive_counter_delta_at':firsts,'percentiles':'range of per-generator per-route p95s within each5s bucket; never averaged or claimed as merged p95','whole_quantiles':'analysis.json is the exact merge of all numeric observations','missing_values':'blank, not zero; first counter sample has no delta','limits':'five-second bucket alignment; multiple counter layers may observe different packets, never sum them as unique packet drops'},indent=2)+'\n')
print(json.dumps({'rows':len(records),'first_positive_deltas':firsts}))
