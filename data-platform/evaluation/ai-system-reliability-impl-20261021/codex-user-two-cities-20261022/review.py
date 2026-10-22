"""Independent Python sums over scoped raw records, compared with every immutable result."""
import json,math
from collections import defaultdict,Counter
from pathlib import Path
D=Path(__file__).resolve().parent
r=json.loads((D/'report-summary.json').read_text());full=json.loads((D/'immutable-result-rows.json').read_text());g=json.loads((D/'geography.json').read_text());o=json.loads((D/'warehouse-oracle.json').read_text())
orders=o['observations']['orders']['rows'];directory=o['observations']['directory']['rows'];valid=[x for x in orders if x['status'] in ['HOAN_THANH','DANG_GIAO']]
CITIES={'Hồ Chí Minh','Đà Nẵng'};checks=[]
def check(label,value,detail=None):checks.append(dict(check=label,passed=bool(value),detail=detail))
def close(a,b):return a is not None and b is not None and math.isclose(float(a),float(b),rel_tol=1e-10,abs_tol=.001)
def group_key(v,fields):return tuple(str(v[f])[:10] if f=='period' else v.get(f) for f in fields)
queries={q['id']:q for q in r['analytical_queries']};perquery={}
check('correct immutable report identity',r['session_id']=='caa3a343-b4e6-4dec-a554-9cae29495a8a' and r['revision']==1 and len(r['charts'])==4)
check('independent raw population contains only requested cities',{v['city'] for v in orders}==CITIES and {v['city'] for v in directory}==CITIES)
for qid,q in queries.items():
 check('city scope retained '+qid,any(f['dimension']=='city' and f['operator']=='in' and set(f['value'])==CITIES for f in q['filters']))
 check('all-time retained '+qid,q['time']['mode']=='all_time')
 actual=full[qid];fields=[k for k in actual[0] if k!='revenue'];expected=defaultdict(float)
 for v in valid:
  row={**v,'period':v['created_at'][:7]+'-01'}
  expected[group_key(row,fields)]+=v['amount'] or 0
 observed={group_key(v,fields):v['revenue'] for v in actual}
 same=set(expected)==set(observed) and all(close(observed[k],v) for k,v in expected.items())
 check('every grouped key and value equals raw warehouse '+qid,same,dict(rows=len(actual),missing=str(set(expected)-set(observed)),extra=str(set(observed)-set(expected))))
 check('total reconciles '+qid,close(sum(observed.values()),sum(v['amount']or 0 for v in valid)))
 perquery[qid]=dict(fields=fields,rows=len(actual),total=sum(observed.values()),all_values_equal=same)
# Verify each chart's actual rendered observations, including all three time-series.
chart_checks=[];fact_count=0
for c in r['charts']:
 qid=c['query_id'];ctx=c['insight']['verification_context']['chart'];data=ctx['data'];source=full[qid];dims=ctx.get('dimension_ids')or queries[qid]['group_by']
 if ctx.get('series'):
  dimension=ctx['series_field'];registry=json.loads((D.parents[2]/'analytics-api/metadata/semantic_catalog.json').resolve().read_text())['analysis_registry']
  labels=registry['dimensions'][dimension].get('value_labels',{})
  names={labels.get(row[dimension],row[dimension]):row[dimension] for row in source}
  series={v['key']:names[v['label']] for v in ctx['series']};observed={(v['label'][:10],series[k]):v[k] for v in data for k in series if v.get(k) is not None};expected={(v['period'][:10],v[dimension]):v['revenue'] for v in source}
 else:
  expected={};observed={}
  if ctx['x_field']=='period':expected={v['period'][:10]:v['revenue'] for v in source};observed={v['label'][:10]:v['value'] for v in data}
  else:
   for v in data:
    filters=v['entity_ref']['filters'];matches=[s for s in source if all(s.get(k)==value for k,value in filters.items())];assert len(matches)==1
    observed[tuple(sorted(filters.items()))]=v['value'];expected[tuple(sorted(filters.items()))]=matches[0]['revenue']
   check('chart keeps complete group set '+c['id'],len(data)==len(source))
 same=set(expected)==set(observed) and all(close(observed[k],v) for k,v in expected.items());check('every plotted observation matches immutable rows '+c['id'],same)
 for f in c['insight']['key_facts']:
  fact_count+=1;calc=f.get('calc')or{};kind=calc.get('kind')
  if kind=='gap':
   x=next(v for v in source if '|'.join(str(v.get(d)) for d in calc['dims'])==calc['a']);y=next(v for v in source if '|'.join(str(v.get(d)) for d in calc['dims'])==calc['b']);expected=x['revenue']-y['revenue'];check('fact gap percent '+c['id'],close(calc['pct'],round(expected/abs(y['revenue'])*100,6)))
  elif kind=='change':
   selected=[v for v in source if ('|'.join(str(v.get(d)) for d in calc['dims'])or'all')==calc['group_key']]
   x=next(v for v in selected if v['period'][:10]==calc['first_bucket']);y=next(v for v in selected if v['period'][:10]==calc['last_bucket']);expected=y['revenue']-x['revenue'];check('fact change percent '+c['id'],close(calc['pct'],round(expected/abs(x['revenue'])*100,6)))
  elif kind is None:
   token=f['evidence_ref'].split(':',2)[2]
   if '@' in token:
    group,bucket=token.rsplit('@',1);matches=[v for v in source if ('|'.join(str(v.get(d)) for d in dims if d!='period')or'all')==group and v.get('period','')[:10]==bucket]
   else:matches=[v for v in source if ('|'.join(str(v.get(d)) for d in dims)or'all')==token]
   check('fact bound to exact raw-reconciled row '+c['id'],bool(matches) and any(close(v['revenue'],f['value']) for v in matches));expected=f['value']
  else:raise AssertionError('Unreviewed calc '+str(kind))
  check('chart fact numeric '+c['id'],close(f['value'],expected) and f['unit']=='VND')
 chart_checks.append(dict(id=c['id'],title=c['title'],query_id=qid,plotted_observations=len(observed),passed=same))
# Geography: test every current store identity, city, numerator and denominator.
network={v['store_id']:v for v in directory};by_store=defaultdict(list)
for v in orders:by_store[v['store_id']].append(v)
check('map directory exact store set',{v['store_id'] for v in g['stores']}==set(network))
for v in g['stores']:
 raw=by_store[v['store_id']];good=[x for x in raw if x['status'] in ['HOAN_THANH','DANG_GIAO']];money=sum(x['amount']or 0 for x in good)
 check('map store values '+v['store_id'],v['city']==network[v['store_id']]['city'] and close(v['revenue'],money) and v['orders']==len(raw) and v['valid_orders']==len(good))
summary=g['summary'];total=sum(v['amount']or 0 for v in valid)
check('map full summary raw sums and correct AOV denominator',close(summary['revenue'],total) and summary['orders']==len(orders) and summary['valid_orders']==len(valid) and close(summary['aov'],total/len(valid)) and summary['store_count']==len(directory))
coords=sum(v.get('location_status')=='recorded' for v in g['stores']);check('map valid coordinate count',coords==486)
by_city={city:sum(v['amount']or 0 for v in valid if v['city']==city) for city in CITIES};by_month=defaultdict(float)
for v in valid:by_month[v['created_at'][:7]]+=v['amount']or 0
# Identify the extra KPI strip values actually visible in the screenshot.
storemax=max(sum(x['amount']or 0 for x in group if x['status'] in ['HOAN_THANH','DANG_GIAO']) for group in by_store.values())
main_month=defaultdict(float)
for v in valid:
 if v['store_type']=='CHI_NHANH_CHINH':main_month[v['created_at'][:7]]+=v['amount']or 0
strip_change=100*(main_month['2026-09']/main_month['2026-01']-1)
check('visible KPI strip amounts belong to two-city data',close(max(by_city.values()),1555659500) and close(storemax,6297000) and close(round(strip_change,1),-21.9))
epoch_equal=r['provenance']['data_epoch']['sources']==o['epoch']['sources'];geo_epoch_equal=g['data_epoch']['sources']==o['epoch']['sources']
result=dict(passed=all(v['passed'] for v in checks),session_id=r['session_id'],revision=1,charts=chart_checks,queries=perquery,checks=checks,check_count=len(checks),facts_checked=fact_count,city_revenue=by_city,total_revenue=total,monthly_revenue=dict(sorted(by_month.items())),summary=summary,coordinates_valid=coords,
 snapshot_comparison=dict(report_oracle_generations_equal=epoch_equal,map_oracle_generations_equal=geo_epoch_equal,report_epoch=r['provenance']['data_epoch'],oracle_epoch=o['epoch'],interpretation='All captured grouped values match current independent raw-record oracle. Generation vectors changed after original report; not a same-historical-snapshot assertion.'),
 presentation_notes=['The four chart scopes are correct. Type/payment/month/store breakdowns combine the two cities; only the primary chart contrasts city against city.','KPI strip generic labels obscure context: -21.9% is main-store Jan→Sep change; 6,297,000VND is max individual store revenue, not city total.','October2026 is incomplete and shown dashed/starred, not evidence of full-month collapse.'])
(D/'review.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in result.items() if k not in ['checks','snapshot_comparison','queries','monthly_revenue']},ensure_ascii=False));print('failed',[v for v in checks if not v['passed']]);raise SystemExit(not result['passed'])
