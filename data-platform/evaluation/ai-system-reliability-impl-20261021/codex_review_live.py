"""Review meaning and arithmetic of captured artifacts; completed is not a pass."""
import argparse,json
from collections import defaultdict
from pathlib import Path
from datetime import date,timedelta

HERE=Path(__file__).resolve().parent

def review(case,oracle):
    identity=case['id'];report=case.get('report') or {};semantic=case.get('semantic_evidence') or {}
    checks=[]
    def check(label,value):checks.append({'assertion':label,'passed':bool(value)})
    if identity=='relationship':
        check('unsupported event/snapshot pair blocked before provider/SQL',case['job']['state']=='unsupported'
              and not case['job'].get('physical_http') and not case['diagnostics'].get('db_query_count'))
        return checks
    queries=report.get('analytical_queries') or [];results=semantic.get('result_sets') or {}
    requested=[q for q in queries if q['role']=='requested']
    check('report completed with bound requested work',case['job']['state']=='completed' and report.get('status')=='success' and requested)
    if not requested:return checks
    quality=semantic.get('quality_assessment') or {}
    by_id={c['id']:c for c in [*quality.get('verification_checks',[]),*quality.get('publication_checks',[])]}
    check('critical verifier checks passed',all(by_id.get(k,{}).get('status')=='passed' for k in
          ['evidence_grounding','semantic_consistency','result_integrity']))
    check('all result contracts valid',all(v.get('valid') for v in (semantic.get('result_contracts') or {}).values()))
    scoped=identity in {'risk-edited','risk-explicit-scope','risk-followup','overview-scoped','trend-scoped','casual'}
    if scoped:check('HCM on every query',all(any(f['dimension']=='city' and set(f['value'] if isinstance(f['value'],list)
        else [f['value']])=={'Hồ Chí Minh'} for f in q['filters']) for q in queries))
    if identity!='forecast':
        plans=semantic.get('query_plans') or []
        check('historical queries keep September; snapshot explicitly current',all(
            p['period']['start']=='2026-09-01' and p['period']['end']=='2026-09-30' or
            identity.startswith('risk-') and all(m=='paused_sale_positions' for m in p['metrics'])
            and p['period']['start'] is None for p in plans))
    if identity in {'risk-edited','risk-explicit-scope'}:
        check('Risk covers six signals without provider',len({m for q in requested for m in q['metrics']})==6 and not case['job'].get('physical_http'))
        check('snapshot has current-state chart title',any('hiện trạng' in c['title'] for c in semantic.get('charts',[])))
    if identity in {'overview-scoped','compare','bottom-five','trend-scoped','composition','multi-clause'}:
        check('no requested specialized revenue substitution',{m for q in requested for m in q['metrics']}=={'revenue'})
    if identity=='casual':
        metrics={m for q in requested for m in q['metrics']}
        units={'revenue':'VND','order_count':'đơn','quantity_sold':'sản phẩm'}
        check('colloquial sales summary separates governed sales measures and units',
            metrics and metrics <= units.keys() and all(e['unit']==units[e['metric']]
                for e in semantic.get('evidence',[]) if e['metric'] in metrics))
    if identity=='compare':
        cities={row['city'] for q in requested for row in results[q['id']]['rows'] if 'city' in row}
        check('both requested comparison members and no others',cities=={'Hồ Chí Minh','Hà Nội'})
    if identity=='trend-scoped':check('weekly trend requested',any(q['operation']=='trend' and q['granularity']=='week' for q in requested))
    if identity=='composition':check('payment-method composition requested',any(q['group_by']==['payment_method'] for q in requested))
    if identity=='forecast':
        requirements=(semantic.get('semantic_intent') or {}).get('requirements') or []
        check('three-month revenue forecast requested',any(r.get('forecast',{}).get('horizon')==3 and
            r.get('forecast',{}).get('unit')=='month' and r['metric_ids']==['revenue'] for r in requirements if r.get('forecast')))
    if identity in {'bottom-five','multi-clause','risk-followup'}:
        rank=next((q for q in requested if q['operation']=='ranking'),None)
        check('one correctly directed ranking',rank and len([q for q in requested if q['operation']=='ranking'])==1
            and rank['ranking']['top_n']==5 and rank['ranking']['direction']==('DESC' if identity=='risk-followup' else 'ASC')
            and rank['group_by']==(['store'] if identity=='risk-followup' else ['city']))
        if rank:
            children=[q for q in queries if q['id']!=rank['id']]
            check('every dependent query explicitly bound to ranked cohort',all(q.get('cohort_scope_query_id')==rank['id'] for q in children))
            if identity!='risk-followup':
                expected=sum(r['amount'] for r in oracle['observations']['bottom_five']['rows'])
                check('all additive views reconcile with independent selected orders',all(abs(sum(row.get('revenue') or 0
                    for row in results[q['id']]['rows'])-expected)<.01 for q in queries if 'revenue' in q['metrics']
                    and results[q['id']].get('total_rows',len(results[q['id']]['rows']))==len(results[q['id']]['rows'])))
            else:
                raw=oracle['observations']['cancellation_top_five']['rows'];chosen={r['store_id'] for r in raw}
                check('Top5 store identities equal independent warehouse oracle',{r['store_id'] for r in results[rank['id']]['rows']}==chosen)
                for q in children:
                    if 'order_cancellation_rate' not in q['metrics']:continue
                    groups=defaultdict(list)
                    for row in raw:
                        keys=[]
                        if q['operation']=='trend':
                            day=date.fromisoformat(row['created_at'][:10])
                            if q['granularity']=='week':day-=timedelta(days=day.weekday())
                            elif q['granularity']=='month':day=day.replace(day=1)
                            keys.append(day.isoformat())
                        keys.extend(row[d] for d in q['group_by']);groups[tuple(keys)].append(row)
                    rows=results[q['id']]['rows'];fields=(['period'] if q['operation']=='trend' else [])+q['group_by']
                    check('cohort ratio recomputed from raw numerator/denominator '+q['id'],all(
                        (key:=tuple(str(r[f])[:10] if f=='period' else r[f] for f in fields)) in groups and
                        abs(r['order_cancellation_rate']-round(100*sum(x['status']=='DA_HUY' for x in groups[key])/len(groups[key]),2))<.001
                        for r in rows))
    if identity=='multi-clause':check('both dependent axes requested',{'store','payment_method'}<={d for q in requested if q['operation']!='ranking' for d in q['group_by']})
    return checks

def main():
    parser=argparse.ArgumentParser();parser.add_argument('receipt');parser.add_argument('--oracle',default=str(HERE/'codex-independent-warehouse-oracles.json'));parser.add_argument('--out',required=True)
    args=parser.parse_args();cases=json.loads(Path(args.receipt).read_text());oracle=json.loads(Path(args.oracle).read_text())
    rows=[{'id':c['id'],'checks':review(c,oracle)} for c in cases]
    for row in rows:row['status']='PASS' if all(x['passed'] for x in row['checks']) else 'FAIL'
    result={'cases':rows,'passed':sum(r['status']=='PASS' for r in rows),'total':len(rows),
        'arithmetic_basis':'Independent raw SQL observations. Same-generation proof must be reported separately; matching numbers alone do not pin source generation.'}
    Path(args.out).write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print(json.dumps({**{k:v for k,v in result.items() if k!='cases'},'failed':[(r['id'],[c['assertion'] for c in r['checks'] if not c['passed']]) for r in rows if r['status']=='FAIL']},ensure_ascii=False))
    raise SystemExit(result['passed']!=result['total'])

if __name__=='__main__':main()
