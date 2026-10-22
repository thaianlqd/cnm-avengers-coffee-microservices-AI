"""Review captured fixed12 without provider calls; immutable row reads only."""
import json,math,os,urllib.request,urllib.parse,http.cookiejar
from pathlib import Path
from codex_review_live import review
E=Path(__file__).resolve().parent; ROOT=E.parents[2]; A=E.parent/'ai-system-audit-20261021'
BASE='http://127.0.0.1:8501';D=E/'codex-qualification-policy33-live-20261022-cases'
cs=json.loads((A/'codex-qualification-policy33-live-20261022.json').read_text())
op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def call(path,data=None):
 req=urllib.request.Request(BASE+path,data=json.dumps(data).encode() if data is not None else None,headers={'Origin':BASE,'Content-Type':'application/json'})
 with op.open(req,timeout=60) as response:return json.load(response)
call('/api/auth/login',dict(tai_khoan=os.environ['DP_AUDIT_USER'],mat_khau=os.environ['DP_AUDIT_PASSWORD']))
registry=json.loads((E.parents[1]/'analytics-api/metadata/semantic_catalog.json').read_text())['analysis_registry']
def key(row,dims):return '|'.join(str(row.get(d)) for d in dims) or 'all'
def numeric(v):return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)
def close(a,b):return numeric(a) and numeric(b) and math.isclose(a,b,rel_tol=1e-8,abs_tol=1e-6)
def sources(e):return {s['dataset_id']:(s['generation'],s['schema_fingerprint']) for s in (e or {}).get('sources',[])}
rows=[];traces=[];pages=facts=charts=0
for c in cs:
 identity=c['id'];s=c['semantic_evidence'];r=c['report'] or {};checks=[]
 def check(label,ok):checks.append(dict(assertion=label,passed=bool(ok)))
 oracle=json.loads((D/(identity+'-oracle-before.json')).read_text());matched=None
 if identity!='relationship':
  actual=sources(c['diagnostics']['data_epoch'])
  for suffix in ['before','after']:
   candidate=json.loads((D/(identity+'-oracle-'+suffix+'.json')).read_text());expected=sources(candidate['epoch'])
   if expected and all(actual.get(k)==v for k,v in expected.items()):oracle=candidate;matched=suffix;break
  check('warehouse order/directory observed generations and schemas match a captured oracle',matched is not None)
  for qid,result in s['result_sets'].items():
   expected=result.get('total_rows',len(result['rows']))
   if expected>len(result['rows']):
    full=[];offset=0
    while True:
     params=urllib.parse.urlencode(dict(offset=offset,limit=200,revision=r['revision']))
     page=call('/api/ai/sessions/'+r['session_id']+'/results/'+qid+'?'+params)
     assert page['artifact_id']==result['artifact_ref']['artifact_id'] and page['revision']==r['revision']
     full.extend(page['rows']);pages+=1
     if page.get('next_offset') is None:break
     offset=page['next_offset']
    assert len(full)==expected;result['rows']=full
  queries={q['id']:q for q in r['analytical_queries']};goals={g['requirement_id']:g for g in s['goal_provenance']['goals']}
  for chart in s['charts']:
   charts+=1;ctx=chart['insight']['verification_context']['chart'];qid=chart['query_id'];q=queries[qid]
   check('chart '+chart['id']+' goal/query bound',chart['scope_ref']==qid and ctx['requirement_id'] in goals and goals[ctx['requirement_id']]['input_refs'])
   dims=ctx.get('dimension_ids') or q['group_by']
   for f in chart['insight'].get('key_facts',[]):
    facts+=1;ref=f['evidence_ref'];refqid,metric,token=ref.split(':',2)
    assert refqid==qid and metric in q['metrics'];data=[v for v in s['result_sets'][qid]['rows'] if numeric(v.get(metric))]
    calc=f.get('calc')or{};kind=calc.get('kind')
    if kind=='gap':
     x=next(v for v in data if key(v,calc['dims'])==calc['a']);y=next(v for v in data if key(v,calc['dims'])==calc['b']);expected=x[metric]-y[metric]
     if calc.get('pct') is not None:assert close(calc['pct'],round(expected/abs(y[metric])*100,6))
    elif kind=='change':
     group=[v for v in data if key(v,calc['dims'])==calc['group_key']]
     x=next(v for v in group if str(v['period'])[:10]==calc['first_bucket']);y=next(v for v in group if str(v['period'])[:10]==calc['last_bucket']);expected=y[metric]-x[metric]
     if calc.get('pct') is not None:assert close(calc['pct'],round(expected/abs(x[metric])*100,6))
    elif kind=='threshold_breaches':
     t=calc['threshold'];o=calc['operator'];expected=sum({'gt':v[metric]>t,'gte':v[metric]>=t,'lt':v[metric]<t,'lte':v[metric]<=t}[o] for v in data);assert calc['total']==len(data)
    elif kind is None:
     if '@' in token:
      group,bucket=token.rsplit('@',1);matches=[v for v in data if key(v,[d for d in dims if d!='period'])==group and str(v.get('period'))[:10]==bucket]
     else:matches=[v for v in data if key(v,dims)==token]
     assert matches and any(close(f['value'],v[metric]) for v in matches),(identity,ref)
     expected=f['value']
    else:raise AssertionError('Unreviewed calc '+str(kind))
    check('fact '+ref+' recomputed',close(f['value'],expected))
    if kind!='threshold_breaches':check('fact '+ref+' unit',f['unit']==registry['metrics'][metric]['unit'])
  evidence={v['id']:v for v in s['evidence']}
  forecasts={}
  if identity=='forecast':
   captured=call('/api/ai/analysis-jobs/'+c['job']['job_id'])['result']
   assert captured['session_id']==r['session_id'] and captured['revision']==r['revision']
   assert captured['provenance']==s['provenance'] and captured['conclusion']==s['conclusion']
   forecasts={f['requirement_id']:f for f in captured['forecasts']}
   (E/'codex-live-policy33-forecast-model-evidence.json').write_text(json.dumps(dict(session_id=r['session_id'],revision=r['revision'],forecasts=captured['forecasts']),ensure_ascii=False,indent=2))
   for f in forecasts.values():
    check('forecast model is tied to the requested query and horizon',f['query_id'] in queries and f['horizon']==3 and f['unit']=='month' and f['status']=='ok')
    future=[v for v in f['forecast'] if v.get('kind')=='future']
    check('forecast has exactly three ordered future months with computed intervals',len(future)==3 and [v['period'] for v in future]==sorted(v['period'] for v in future) and all(v['lower_80']<=v['value']<=v['upper_80'] for v in future))
    raw={str(v['period'])[:10]:v['revenue'] for v in s['result_sets'][f['query_id']]['rows']}
    check('forecast fit history equals historical artifact and excludes incomplete current month',all(close(v['value'],raw[v['period'][:10]]) for v in f['history_points']) and f['history']['end']=='2026-09-01')
    bt=f['backtest'];base=bt['naive_baseline']['mae']
    check('forecast backtest improvement independently recomputed',close(bt['improvement_vs_naive_pct'],round(100*(1-bt['mae']/base),2)))
  def vn(value,unit):
   scale=1e9 if unit=='VND' and abs(value)>=1e9 else 1e6 if unit=='VND' and abs(value)>=1e6 else 1
   number=f"{value/scale:,.1f}".replace(',','_').replace('.',',').replace('_','.').rstrip('0').rstrip(',')
   return number+(' tỷ VND' if scale==1e9 else ' triệu VND' if scale==1e6 else '%' if unit=='%' else ' VND')
  for f in (s.get('conclusion')or{}).get('findings',[]):
   if f.get('forecast_ref'):
    fc=forecasts.get(f['forecast_ref']);assert fc is not None
    future=[v for v in fc['forecast'] if v.get('kind')=='future'];text=f['statement'];bt=fc['backtest']
    if text.startswith('Dự báo'):
     check('forecast conclusion values and horizon agree with bound model', '3 tháng tới' in text and all(vn(v,'VND') in text for v in [future[-1]['value'],future[-1]['lower_80'],future[-1]['upper_80'],sum(v['value'] for v in future)]))
    else:
     check('forecast backtest conclusion states actual measurements and no guarantee',all(v in text for v in [str(bt['folds'])+' lần',str(bt['evaluated_points'])+' điểm',vn(bt['smape_pct'],'%'),vn(bt['improvement_vs_naive_pct'],'%'),'không phải bảo đảm']))
   else:
    check('conclusion finding canonical '+str(f.get('evidence_id')),f.get('evidence_id') in evidence and f['statement']==evidence[f['evidence_id']]['statement'])
  if identity in {'overview-scoped','casual'}:
   expected=oracle['observations']['hcm_revenue']['rows'][0]['revenue']
   requested=[q for q in queries.values() if q['role']=='requested']
   check('HCM primary revenue reconciles with independently read warehouse',all(close(sum(v.get('revenue')or 0 for v in s['result_sets'][q['id']]['rows']),expected) for q in requested if 'revenue' in q['metrics']))
 checks+=review(c,oracle)
 rows.append(dict(id=identity,status='PASS' if all(x['passed'] for x in checks) else 'FAIL',checks=checks,matched_order_directory_oracle=matched,
    source_completeness=r.get('source_completeness'),limitations=r.get('quality_limitations')))
 traces.append(dict(id=identity,input=c['payload'],resolved_goals=(s.get('goal_provenance')or{}).get('goals',[]),primary_answer=s.get('short_answer'),answer_requirements=s.get('answer_requirements'),
   views=[dict(id=v['id'],query_id=v['query_id'],title=v['title'],claim_ids=[f['evidence_ref'] for f in v['insight'].get('key_facts',[])]) for v in s.get('charts')or[]],claim_ids=list(v['id'] for v in s.get('evidence')or[]),oracle_receipt=str((D/(identity+'-oracle-'+(matched or 'before')+'.json')).relative_to(ROOT)),outcome=c['job']['state']))
positive=[c for c in cs if c['job'].get('physical_http')]
first=[c for c in positive if c['job']['physical_http']==1 and [d['phase'] for d in c['diagnostics'].get('draft_shapes')or[]]==['primary'] and not c['diagnostics'].get('root_contract_issues') and not c['diagnostics'].get('semantic_issue_history')]
result=dict(passed=len(rows)==12 and all(r['status']=='PASS' for r in rows),cases=rows,total=12,semantic_passed=sum(r['status']=='PASS' for r in rows),completed=sum(c['job']['state']=='completed' for c in cs),unsupported=sum(c['job']['state']=='unsupported' for c in cs),positive_ai=len(positive),positive_ai_first_pass=len(first),first_pass_percent=100*len(first)/len(positive),physical_sends=sum(c['job'].get('physical_http')or 0 for c in cs),bounded_repair=0,transport_failed=sum(bool(c['diagnostics'].get('terminal_error')) for c in positive),immutable_pages_fetched=pages,charts=charts,key_facts_recomputed=facts,
 limitations=['Fixed known incident qualification replay, not blind unseen-language accuracy. All historical failures retained.','Same-generation SQL proof covers order/directory only; artifact arithmetic covers captured same-revision results, not upstream completeness.','Finite corpus, no universal reliability or production SLA assertion.'])
(E/'codex-live-policy33-final-review.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));(E/'codex-input-task-answer-view-claim-oracle-policy33.json').write_text(json.dumps(traces,ensure_ascii=False,indent=2))
print(json.dumps({k:v for k,v in result.items() if k not in ['cases','limitations']},ensure_ascii=False));print('failed',[(r['id'],[x['assertion'] for x in r['checks'] if not x['passed']]) for r in rows if r['status']=='FAIL']);raise SystemExit(not result['passed'])
