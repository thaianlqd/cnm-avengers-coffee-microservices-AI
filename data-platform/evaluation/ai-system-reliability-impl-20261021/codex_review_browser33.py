"""Independently recompute served chart fact values from complete immutable rows."""
import json,os,math,urllib.request,urllib.parse,http.cookiejar
from pathlib import Path
E=Path(__file__).resolve().parent;D=E/'codex-browser-policy33-final-v2';BASE='http://127.0.0.1:8501'
op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def call(path,data=None):
    req=urllib.request.Request(BASE+path,data=json.dumps(data).encode() if data is not None else None,
        headers={'Origin':BASE,'Content-Type':'application/json'})
    with op.open(req,timeout=60) as response:return json.load(response)
call('/api/auth/login',dict(tai_khoan=os.environ['DP_AUDIT_USER'],mat_khau=os.environ['DP_AUDIT_PASSWORD']))
registry=json.loads((E.parents[1]/'analytics-api/metadata/semantic_catalog.json').read_text())['analysis_registry']
def key(row,dims):return '|'.join(str(row.get(d)) for d in dims) or 'all'
def numeric(value):return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value)
def close(a,b):return numeric(a) and numeric(b) and math.isclose(a,b,rel_tol=1e-8,abs_tol=1e-6)
cases=[];facts_total=0;charts_total=0;fetched=0
for receipt in json.loads((D/'receipt.json').read_text()):
    r=json.loads((D/(receipt['id']+'-report.json')).read_text());queries={q['id']:q for q in r['analytical_queries']}
    full={};errors=[]
    for qid,result in r['result_sets'].items():
        rows=result.get('rows',[]);expected=result.get('total_rows',len(rows))
        if expected>len(rows):
            rows=[];offset=0
            while True:
                params=urllib.parse.urlencode(dict(offset=offset,limit=200,revision=r['revision']))
                page=call('/api/ai/sessions/'+r['session_id']+'/results/'+qid+'?'+params)
                assert page['artifact_id']==result['artifact_ref']['artifact_id']
                assert page['revision']==r['revision']
                rows.extend(page['rows']);fetched+=1
                if page.get('next_offset') is None:break
                offset=page['next_offset']
            assert len(rows)==expected
        full[qid]=rows
    goals={g['requirement_id']:g for g in r['goal_provenance']['goals']}
    for chart in r['charts']:
        charts_total+=1;qid=chart['query_id'];q=queries[qid]
        assert chart['scope_ref']==qid and chart['requirement_id'] in goals
        assert goals[chart['requirement_id']]['input_refs']
        dims=chart.get('dimension_ids') or q['group_by']  # compiled dimensions retain canonical identity keys
        for fact in chart.get('insight',{}).get('key_facts',[]):
            facts_total+=1;ref=fact['evidence_ref'];ref_qid,metric,token=ref.split(':',2)
            assert ref_qid==qid and metric in q['metrics']
            rows=[row for row in full[qid] if numeric(row.get(metric))]
            calc=fact.get('calc') or {};kind=calc.get('kind')
            if kind=='gap':
                a=next(row for row in rows if key(row,calc['dims'])==calc['a'])
                b=next(row for row in rows if key(row,calc['dims'])==calc['b'])
                expected=a[metric]-b[metric]
                pct=expected/abs(b[metric])*100 if b[metric] else None
                if calc.get('pct') is not None:assert close(calc['pct'],round(pct,6))
            elif kind=='change':
                group=[row for row in rows if key(row,calc['dims'])==calc['group_key']]
                a=next(row for row in group if str(row['period'])[:10]==calc['first_bucket'])
                b=next(row for row in group if str(row['period'])[:10]==calc['last_bucket'])
                expected=b[metric]-a[metric]
                if calc.get('pct') is not None:assert close(calc['pct'],round(expected/abs(a[metric])*100,6))
            elif kind=='threshold_breaches':
                threshold=calc['threshold'];operator=calc['operator']
                def breach(v):return {'gt':v>threshold,'gte':v>=threshold,'lt':v<threshold,'lte':v<=threshold}[operator]
                expected=sum(breach(row[metric]) for row in rows)
                assert calc['total']==len(rows)
            elif kind is None:
                if '@' in token:
                    group,bucket=token.rsplit('@',1)
                    matches=[row for row in rows if key(row,[d for d in dims if d!='period'])==group and str(row.get('period'))[:10]==bucket]
                else:matches=[row for row in rows if key(row,dims)==token]
                assert matches and any(close(fact['value'],row[metric]) for row in matches),(receipt['id'],ref)
                expected=fact['value']
            else:raise AssertionError('Unreviewed calculation kind: '+str(kind))
            assert close(fact['value'],expected),(receipt['id'],ref,fact['value'],expected)
            if kind!='threshold_breaches':assert fact['unit']==registry['metrics'][metric]['unit']
    statements={e['statement'] for e in r['evidence']}
    assert all(text in statements for text in r['conclusions'])
    checks={c['id']:c for c in r['quality_assessment']['verification_checks']}
    assert all(checks[name]['status']=='passed' for name in ['evidence_grounding','semantic_consistency','result_integrity'])
    cases.append(dict(case=receipt['id'],session_id=r['session_id'],revision=r['revision'],charts=len(r['charts']),
        facts=sum(len(c.get('insight',{}).get('key_facts',[])) for c in r['charts']),critical_failures=[]))
result=dict(passed=len(cases)==12,reports=len(cases),charts=charts_total,chart_key_facts=facts_total,
    immutable_artifact_pages_fetched=fetched,cases=cases,
    scope='Numeric facts independently recomputed from complete immutable same-revision artifacts, not a warehouse data-truth assertion. Warehouse SQL oracles reviewed separately. No AI or analytical SQL requested by this review.')
(E/'codex-browser-policy33-artifact-review.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in result.items() if k!='cases'},ensure_ascii=False))
