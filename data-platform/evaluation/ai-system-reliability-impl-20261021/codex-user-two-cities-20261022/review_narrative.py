"""Review captured statements independently from the raw rows already read; no I/O to provider/DB."""
from pathlib import Path
from collections import defaultdict
from datetime import date
import json,math,statistics
D=Path(__file__).resolve().parent
r=json.loads((D/'report-summary.json').read_text());base=json.loads((D/'review.json').read_text());o=json.loads((D/'warehouse-oracle.json').read_text())
raw=[v for v in o['observations']['orders']['rows'] if v['status'] in ['HOAN_THANH','DANG_GIAO']]
registry=json.loads((D.parents[2]/'analytics-api/metadata/semantic_catalog.json').read_text())['analysis_registry'];qs={v['id']:v for v in r['analytical_queries']}
checks=[]
def check(label,ok):checks.append(dict(assertion=label,passed=bool(ok)))
def close(a,b):return math.isclose(float(a),float(b),abs_tol=.001,rel_tol=1e-9)
def equal(a,b):return close(a,b) if isinstance(a,(int,float)) and isinstance(b,(int,float)) else a==b
verified={}
for f in r['key_findings']:
 q=qs[f['scope_ref']];kind=f['evidence_id'].split(':')[2];details=f['value_details'];expected={};dims=q['group_by'];data=raw
 if kind in ['scope_total','group_comparison']:
  grouped=defaultdict(float)
  for v in data:
   identity=tuple(v.get(k) for k in dims)
   if dims==['store']:identity=(v['store'],v['store_id'])
   grouped[identity]+=v['amount']or 0
  if kind=='scope_total':expected=dict(total=sum(grouped.values()),observed_groups=len(grouped))
  else:
   high=max(grouped,key=grouped.get);low=min(grouped,key=grouped.get)
   def label(k):
    value=k[0];return registry['dimensions'][dims[0]].get('value_labels',{}).get(value,value)
   expected=dict(largest=label(high),largest_value=grouped[high],smallest=label(low),smallest_value=grouped[low],gap=grouped[high]-grouped[low],observed_groups=len(grouped))
 elif kind in ['change','extrema']:
  if dims:
   selected=[t for t in {v[dims[0]] for v in raw} if '('+t+')' in f['finding']];assert len(selected)==1
   data=[v for v in data if v[dims[0]]==selected[0]]
  months=defaultdict(float)
  for v in data:months[v['created_at'][:7]+'-01']+=v['amount']or 0
  complete=sorted((m,v) for m,v in months.items() if m<'2026-10-01');ys=[v for m,v in complete];xs=[date.fromisoformat(m).toordinal() for m,v in complete]
  high=max(complete,key=lambda v:v[1]);low=min(complete,key=lambda v:v[1]);meanx=sum(xs)/len(xs);meany=sum(ys)/len(ys)
  expected=dict(peak=high[1],trough=low[1],volatility=statistics.pstdev(ys),excluded_partial_buckets=len(months)-len(complete))
  if kind=='change':
   first,last=ys[0],ys[-1];delta=last-first
   expected.update(first=first,last=last,change=delta,change_pct=delta/abs(first)*100,direction='up' if delta>0 else 'down' if delta<0 else 'flat',first_period=complete[0][0]+'T00:00:00',last_period=complete[-1][0]+'T00:00:00',comparison_basis='complete_periods',comparable=True,complete_buckets=len(complete),peak_period=high[0]+'T00:00:00',trough_period=low[0]+'T00:00:00',slope_per_day=sum((x-meanx)*(y-meany) for x,y in zip(xs,ys))/sum((x-meanx)**2 for x in xs),observed_buckets=len(months),null_buckets=0)
 else:raise AssertionError(kind)
 for k,v in expected.items():check(f['evidence_id']+' '+k,k in details and equal(details[k],v))
 verified[f['evidence_id']]=f
# Canonical answer and conclusion bindings and view references, checked against already recomputed claims.
for a in r['answer_requirements']:
 check('primary answer statement '+a['requirement_id'],a['evidence_id'] in verified and a['statement']==verified[a['evidence_id']]['finding'] and a['statement'] in r['short_answer'])
for f in r['conclusion']['findings']:
 check('conclusion exact independently verified finding '+f['evidence_id'],f['evidence_id'] in verified and f['statement']==verified[f['evidence_id']]['finding'])
charts={c['id']:c for c in r['charts']}
for v in r['conclusion']['view_findings']:
 check('synthesis references actual chart '+v['chart_id'],v['chart_id'] in charts and v['statement'] in [f['text'] for f in charts[v['chart_id']]['insight']['key_facts']])
total=sum(v['amount']or 0 for v in raw);city=base['city_revenue'];high=city['Hồ Chí Minh'];low=city['Đà Nẵng']
check('city share rounds to86.2percent',round(100*high/total,1)==86.2)
check('city relative gap rounds to522percent',round(100*(high-low)/low)==522)
receiving={}
for k in ['DUNG_TAI_CHO','MANG_DI','GIAO_TAN_NOI']:
 amount=sum(v['amount']or 0 for v in raw if v['order_type']==k);receiving[k]=dict(amount=amount,share_pct=100*amount/total)
check('receipt-mode shares have declared two-city denominator',sum(v['amount'] for v in receiving.values())==total and round(receiving['DUNG_TAI_CHO']['share_pct'],1)==45.4 and round(receiving['MANG_DI']['share_pct'],1)==34.9 and round(receiving['GIAO_TAN_NOI']['share_pct'],1)==19.8)
notes=[
 dict(id='UC01',severity='P2',status='OPEN',area='KPI scope label',observed='Biến động doanh thu -21,9%; expanded detail shows Jan→Sep but not CHI_NHANH_CHINH.',truth='Main-store subgroup Jan216772000→Sep169226000, -21.9336446%. Whole two-city population Jan229495000→Sep178867000, -22.0606113%.',impact='Correct subgroup number can be mistaken for total-population change.'),
 dict(id='UC02',severity='P2',status='OPEN',area='Multi-series insight and conclusion synthesis',observed='visual_5 highlights -21.9% and peak216.8m without naming the main-store series; synthesis also omits it.',truth='Those facts describe CHI_NHANH_CHINH only; the other two series have different values.',impact='Ambiguous subject of claim despite correct fact refs.'),
 dict(id='UC03',severity='P2',status='OPEN',area='Chart order description',observed=charts['visual_1']['insight']['what_it_shows'],truth='Primary chart renders DaNang250088000 first and HCM1555659500 second; SQL orders city ascending, not revenue descending.',impact='Incorrect description of presentation order; values/membership unaffected.'),
 dict(id='UC04',severity='P3',status='OPEN',area='Chart instructions',observed='Stored how_to_read for donut and multi-line says bar length; donut stored description says sorted high→low.',truth='Actual visual_4 is donut, visual_5 is multi-series line. The visible accordion does not currently display how_to_read.',impact='Stale generic guidance in stored metadata; not a numeric error.'),
 dict(id='UC05',severity='P2',status='DISCLOSED_LIMITATION',area='Depth coverage',observed='4/6 views, partial / PLANNING_GAP; store and payment lenses rejected renderer_unsupported; dashboard reason outside_mission_grammar.',truth='All requested primary meaning answered. Only four chart views rendered; two extra result sets exist and their values reconcile.',impact='Do not describe deep breadth as six-of-six; omitted extras do not invalidate four displayed chart populations.'),
 dict(id='UC06',severity='P2',status='OPEN',area='Comparison usefulness',observed='Three supporting charts combine the two cities.',truth='Scope is both requested cities; they are not separate city-by-city comparisons of channels or time.',impact='Valid combined context but cannot explain which city has higher within-channel/month performance.')]
result=dict(passed_numeric_and_bindings=all(x['passed'] for x in checks),check_count=len(checks),independent_key_findings=12,conclusion_findings=3,view_findings=3,checks=checks,receipt_mode=receiving,presentation_findings=notes,not_a_clean_presentation_pass=True,scope='Captured original revision1; no product edit, no re-analysis or model call. Independent raw current oracle matches values, original generation differs as recorded in review.json.')
(D/'narrative-review.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in result.items() if k not in ['checks','presentation_findings']},ensure_ascii=False));print('failed',[x for x in checks if not x['passed']]);raise SystemExit(not result['passed_numeric_and_bindings'])
