"""Bounded diagnostic/kernel summary; numeric records only, no raw request pairing."""
from client import root
import datetime as dt,gzip,json,pathlib,sys,collections
point=pathlib.Path(sys.argv[1]);meta=json.loads((point/'metadata.json').read_text());epoch=lambda v:dt.datetime.fromisoformat(v.replace('Z','+00:00')).timestamp();start=epoch(meta['load_started_at'])+meta['ramp_seconds'];end=start+meta['hold_seconds'];values={};loops={};records=0;windows=[]
with gzip.open(point/'diagnostics.jsonl.gz','rt') as stream:
 for line in stream:
  row=json.loads(line);r=row['record'];at=epoch(r['at'])
  if not start+r['interval_ms']/1000<=at<=end:continue
  records+=1;s=row['service'];loops[s]=max(loops.get(s,0),r.get('event_loop_ms',{}).get('max',0));window={'at':r['at'],'service':s,'pod':row['pod'],'event_loop_ms':r.get('event_loop_ms',{}),'stages':{}}
  for name,v in r['metrics'].items():
   unit=r.get('metric_units',{}).get(name,'bytes' if name.endswith('_bytes') else 'count' if name.split(':')[1] in ('cache_hit','cache_refresh','cache_coalesced','db_error') else 'ms')
   cur=values.setdefault(s,{}).setdefault(name,{'observations':0,'sum':0,'max':0,'unit':unit,'buckets':[0]*len(v['buckets']),'bounds':r['bounds_ms']})
   cur['observations']+=v['count'];cur['sum']+=v['sum'];cur['max']=max(cur['max'],v['max']);cur['buckets']=[a+b for a,b in zip(cur['buckets'],v['buckets'])]
   window['stages'][name]={'observations':v['count'],'sum':v['sum'],'max':v['max'],'unit':unit}
  windows.append(window)
for metrics in values.values():
 for v in metrics.values():
  v['mean']=v['sum']/v['observations'] if v['observations'] else None
  if v['unit']=='ms':
   total=0
   for upper,count in zip(v['bounds'],v['buckets']):
    total+=count
    if total>=v['observations']*.95:v['p95_bucket_upper_bound']=upper;break
summary={'selection':{'start':dt.datetime.fromtimestamp(start,dt.timezone.utc).isoformat(),'end':dt.datetime.fromtimestamp(end,dt.timezone.utc).isoformat(),'complete_intervals':records,'capture':'continuous sanitized follow across Pod UIDs, including HPA-removed Pods','limits':'Aggregate interval histograms; DNS includes lookup callback delay, not isolated DNS server time. Slow dominant-segment counters use segments of the same upstream request; no request identifiers retained. DB query is round-trip, not server execution.'},'services':values,'event_loop_max_ms':loops}
(point/'diagnostic-hold-summary.json').write_text(json.dumps(summary,indent=2)+'\n');(point/'diagnostic-windows.jsonl').write_text(''.join(json.dumps(v)+'\n' for v in windows))
# Host and per-container namespace counters, independent of kubectl-top coverage.
result={};identities={}
with gzip.open(point/'target.jsonl.gz','rt') as f:
 for line in f:
  for pod in json.loads(line).get('pods',[]):
   for c in pod.get('containers',[]):
    cid=c.get('containerID','').split('://')[-1]
    if cid:identities[cid]={'pod':pod['name'],'uid':pod['uid'],'node':pod.get('node'),'container':c['name']}
for path in point.glob('kernel-target*.jsonl.gz'):
 with gzip.open(path,'rt') as f:rows=[json.loads(l) for l in f]
 host={'samples':len(rows),'hold_samples':sum(start<=epoch(r['observed_at'])<=end for r in rows),'conntrack_count_peak':max((r['conntrack_usage']['count'] for r in rows if r.get('conntrack_usage',{}).get('count') is not None),default=None),'conntrack_max_values':sorted({r.get('conntrack_usage',{}).get('max') for r in rows if r.get('conntrack_usage',{}).get('max') is not None})}
 host['ena_allowance_deltas']={iface:{k:vals[k]-rows[0].get('ena',{}).get(iface,{}).get(k,vals[k]) for k in vals} for iface,vals in rows[-1].get('ena',{}).items() if vals}
 cpu_rates=[];network_rates={}
 for a,b in zip(rows,rows[1:]):
  elapsed=epoch(b['observed_at'])-epoch(a['observed_at'])
  if elapsed<=0:continue
  ticks=[y-x for x,y in zip(a['cpu_ticks'],b['cpu_ticks'])];total=sum(ticks)
  if total>0:cpu_rates.append({'at':epoch(b['observed_at']),'busy_percent':100*(1-(ticks[3]+ticks[4])/total)})
  for iface,y in (b.get('interfaces') or {}).items():
   x=(a.get('interfaces') or {}).get(iface)
   if x and y['rx_bytes']>=x['rx_bytes'] and y['tx_bytes']>=x['tx_bytes']:
    values=network_rates.setdefault(iface,{'rx_bytes_per_second_peak':0,'tx_bytes_per_second_peak':0});values['rx_bytes_per_second_peak']=max(values['rx_bytes_per_second_peak'],(y['rx_bytes']-x['rx_bytes'])/elapsed);values['tx_bytes_per_second_peak']=max(values['tx_bytes_per_second_peak'],(y['tx_bytes']-x['tx_bytes'])/elapsed)
 host['host_cpu_busy_peak_percent']=max((r['busy_percent'] for r in cpu_rates),default=None);host['host_cpu_busy_hold_peak_percent']=max((r['busy_percent'] for r in cpu_rates if start<=r['at']<=end),default=None);host['interfaces']=network_rates
 for iface,values in network_rates.items():
  a=(rows[0].get('interfaces') or {}).get(iface);b=(rows[-1].get('interfaces') or {}).get(iface)
  values['error_drop_deltas']={k:b[k]-a[k] for k in ('rx_errors','rx_drops','tx_errors','tx_drops')} if a and b else None
 for name in ('tcp_ext','conntrack_counters'):
  a=rows[0].get(name);b=rows[-1].get(name);host[name+'_deltas']={k:b[k]-a[k] for k in a if k in b} if isinstance(a,dict) and isinstance(b,dict) else None
 for name in ('snmp','tcp_ext'):
  a=rows[0].get('host_network_namespace',{}).get(name);b=rows[-1].get('host_network_namespace',{}).get(name);host['host_'+name+'_deltas']={k:b[k]-a[k] for k in a if k in b} if isinstance(a,dict) and isinstance(b,dict) else None
 host['host_tcp_state_peaks']={k:max(r.get('host_network_namespace',{}).get('tcp_states',{}).get(k,0) for r in rows) for k in {k for r in rows for k in (r.get('host_network_namespace',{}).get('tcp_states') or {})}}
 processes={}
 for r in rows:
  for p in r.get('node_processes',[]):processes.setdefault(p['container_id'] or str(p['pid']),[]).append((epoch(r['observed_at']),p))
 host['containers']={}
 for cid,ps in processes.items():
  rates=[]
  for (ta,a),(tb,b) in zip(ps,ps[1:]):
   if tb<=ta:continue
   x,y=a['cpu_stat'],b['cpu_stat'];periods=y.get('nr_periods',0)-x.get('nr_periods',0);rates.append({'cpu_busy_m':(y['usage_usec']-x['usage_usec'])/(tb-ta)/1000,'throttled_period_percent':100*(y.get('nr_throttled',0)-x.get('nr_throttled',0))/periods if periods>0 else None,'throttled_ms_per_second':(y.get('throttled_usec',0)-x.get('throttled_usec',0))/(tb-ta)/1000})
  a,b=ps[0][1],ps[-1][1];snmp1=a['network'].get('snmp');snmp2=b['network'].get('snmp');host['containers'][cid]={'identity':identities.get(cid),'samples':len(ps),'cpu_limit':b['cpu_max'],'cpu_peak_m':max((r['cpu_busy_m'] for r in rates),default=None),'throttled_period_peak_percent':max((r['throttled_period_percent'] for r in rates if r['throttled_period_percent'] is not None),default=None),'throttled_ms_per_second_peak':max((r['throttled_ms_per_second'] for r in rates),default=None),'snmp_deltas':{k:snmp2[k]-snmp1[k] for k in snmp1 if k in snmp2} if isinstance(snmp1,dict) and isinstance(snmp2,dict) else None,'tcp_state_peaks':{k:max((p['network'].get('tcp_states') or {}).get(k,0) for _,p in ps) for k in {k for _,p in ps for k in (p['network'].get('tcp_states') or {})}}}
 result[path.name]=host
(point/'kernel-summary.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'complete_diagnostic_intervals':records,'kernel_hosts':len(result)}))
