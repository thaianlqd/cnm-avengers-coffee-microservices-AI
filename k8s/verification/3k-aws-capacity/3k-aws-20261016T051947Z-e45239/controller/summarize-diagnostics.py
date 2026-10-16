"""Summarize only complete 30-second diagnostic intervals inside k6 hold."""
import datetime as dt,gzip,json,pathlib,sys
folder=pathlib.Path(sys.argv[1]);meta=json.loads((folder/'metadata.json').read_text());start=dt.datetime.fromisoformat(meta['load_started_at'])+dt.timedelta(seconds=60);end=start+dt.timedelta(seconds=meta['hold_seconds']);values={};loops={};records=0
with gzip.open(folder/'diagnostics.jsonl.gz','rt') as stream:
 for line in stream:
  row=json.loads(line);record=row['record'];at=dt.datetime.fromisoformat(record['at'].replace('Z','+00:00'))
  if not start+dt.timedelta(milliseconds=record['interval_ms'])<=at<=end:continue
  records+=1;service=row['service'];loops[service]=max(loops.get(service,0),record['event_loop_ms']['max'])
  for name,value in record['metrics'].items():
   if name.split(':')[-1] not in ('request','upstream_headers','db_acquire','db_query','db_connect','load','serialize','gzip','cache_wait'):continue
   current=values.setdefault(service,{}).setdefault(name,{'count':0,'sum':0,'max_ms':0});current['count']+=value['count'];current['sum']+=value['sum'];current['max_ms']=max(current['max_ms'],value['max'])
for metrics in values.values():
 for value in metrics.values():value['mean_ms']=value.pop('sum')/value['count']
values['event_loop_max_ms']=loops
values['_selection']={'hold_start':start.isoformat(),'hold_end':end.isoformat(),'intervals':records,'method':'record end minus interval_ms >= hold start, record end <= hold end; count-weighted means and maxima, not quantiles','limits':'Collected surviving-Pod logs only; no request-ID pairing or DB server execution timing. Intervals crossing hold boundary excluded. Instrumentation-enabled variant is not default qualification.'}
(folder/'diagnostic-hold-summary.json').write_text(json.dumps(values,indent=2)+'\n')
print(json.dumps(values['_selection']))
