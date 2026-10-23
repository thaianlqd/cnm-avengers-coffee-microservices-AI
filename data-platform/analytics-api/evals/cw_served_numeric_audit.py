"""Independent current-source audit for the served revenue comparison task.

Hand-written SQL reads scoped raw facts without PII. Plain Python aggregates
each approved grain and every offered view. Never imports compiler/renderer or
the product projection/insight code. This is current-source equality, not proof
of the report's historical snapshot or generic model semantic accuracy.
"""
import argparse
from collections import defaultdict
from datetime import datetime, timezone
import json
import math
from pathlib import Path

from services.sql_service import execute_read_only


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--report',required=True)
    parser.add_argument('--capabilities',required=True)
    parser.add_argument('--full-results',required=True,help='All immutable rows fetched through the owned paginated API, not response previews.')
    parser.add_argument('--members',nargs='+',required=True)
    parser.add_argument('--start',required=True)
    parser.add_argument('--end-exclusive',required=True)
    parser.add_argument('--out',required=True)
    args=parser.parse_args()
    report=json.loads(Path(args.report).read_text())
    full_results=json.loads(Path(args.full_results).read_text())
    labels=json.loads(Path(args.capabilities).read_text())['dimension_value_labels']
    labels={d:{str(v['value']):v['label'] for v in values} for d,values in labels.items()}
    # Validate CLI dates before interpolating; members use SQL literal escaping.
    datetime.fromisoformat(args.start);datetime.fromisoformat(args.end_exclusive)
    cities=','.join("'"+m.replace("'","''")+"'" for m in args.members)
    raw=execute_read_only(f"""SELECT c.thanh_pho AS city, c.loai_diem_ban AS store_type,
        c.ten_chi_nhanh AS store, c.ma_chi_nhanh AS store_id,
        d.loai_don_hang AS order_type, d.phuong_thuc_thanh_toan AS payment_method,
        d.ngay_tao AS created_at, d.tong_tien AS amount, d.trang_thai_don_hang AS status
        FROM silver.don_hang d JOIN silver.chi_nhanh c ON c.ma_chi_nhanh=d.co_so_ma
        WHERE c.thanh_pho IN ({cities}) AND d.ngay_tao >= '{args.start}'
        AND d.ngay_tao < '{args.end_exclusive}'""",row_limit=50000)
    if raw.get('truncated'):raise ValueError('Independent raw population truncated')
    rows=[r for r in raw['rows'] if r['status'] in {'HOAN_THANH','DANG_GIAO'}]
    plans={p['id']:p for p in report['query_plans']}
    checks=[]
    def check(name,passed,**detail):checks.append(dict(check=name,passed=bool(passed),**detail))
    def close(a,b):return a is not None and b is not None and math.isclose(float(a),float(b),rel_tol=1e-9,abs_tol=.001)
    def period(r,plan):
        day=str(r['created_at'])[:10]
        if plan['granularity']=='month':return day[:7]+'-01'
        if plan['granularity']=='day':return day
        raise ValueError('Unaudited cadence: '+plan['granularity'])
    def value(r,d,p):return period(r,p) if d=='period' else r.get(d)
    def label(d,v):return str(v)[:10] if d=='period' else labels.get(d,{}).get(str(v),str(v) if v is not None else 'Chưa ghi nhận')
    def aggregate(source,dims,plan):
        out=defaultdict(float)
        for r in source:out[tuple(value(r,d,plan) for d in dims)]+=float(r['amount'] or 0)
        return dict(out)
    frame=report['comparison_frames'][0]
    check('authored_member_scope',set(m['key'] for m in frame['members'])==set(args.members))
    for qid,plan in plans.items():
        check('authored_window '+qid,plan['period']['start']==args.start and plan['period']['end_exclusive']==args.end_exclusive)
        if plan['metrics']!=['revenue']:raise ValueError('Unaudited metric set')
        dims=(['period'] if plan['kind']=='trend' else [])+plan['dimensions']
        expected=aggregate(rows,dims,plan)
        actual=full_results[qid]['rows']
        got={tuple(str(r[d])[:10] if d=='period' else r.get(d) for d in dims):r['revenue'] for r in actual}
        check('full_result_keys_values '+qid,set(expected)==set(got) and all(close(got.get(k),v) for k,v in expected.items()),rows=len(actual))
    variant_count=marks=0
    for chart in report['charts']:
        plan=plans[chart['query_id']]
        for variant in chart['view_modes']['variants']:
            if variant['availability']!='available':continue
            variant_count+=1
            spec=variant['spec'];payload=variant['payload'];source=rows
            if spec.get('breakdown'):
                dim,key=spec['breakdown'];source=[r for r in source if str(r.get(dim))==str(key)]
            if spec['mode']=='single':source=[r for r in source if r['city']==spec['member']]
            dims=(['period'] if plan['kind']=='trend' else [])+[d for d in plan['dimensions']
                if not (d=='city' and spec['mode'] in {'single','total'}) and not (spec.get('breakdown') and d==spec['breakdown'][0])]
            expected=aggregate(source,dims,plan)
            if spec.get('value_mode','absolute')!='absolute':
                partition=([dims.index('period')] if 'period' in dims else [])+([dims.index('city')] if spec['value_mode']=='member_share' and 'city' in dims else [])
                denominators=defaultdict(float)
                for key,v in expected.items():denominators[tuple(key[i] for i in partition)]+=v
                expected={key:(v/denominators[tuple(key[i] for i in partition)]*100 if denominators[tuple(key[i] for i in partition)] else None) for key,v in expected.items()}
            if payload['chart_type']=='kpi':
                observed=[r['value'] for r in payload['data']]
                ok=len(expected)==len(observed)==1 and close(observed[0],next(iter(expected.values())))
            else:
                x=payload['x_field'];series=payload.get('series_field')
                wanted={tuple(label(d,key[dims.index(d)]) for d in ([x,series] if payload.get('series') else [x])):v for key,v in expected.items()}
                observed={}
                for row in payload['data']:
                    xval=str(row['label'])[:10] if x=='period' else row['label']
                    if payload.get('series'):
                        for s in payload['series']:
                            if row.get(s['key']) is not None:observed[(xval,s['label'])]=row[s['key']]
                    else:observed[(xval,)]=row['value']
                ok=set(wanted)==set(observed) and all(close(observed.get(k),v) for k,v in wanted.items())
            marks+=len(observed)
            check('every_offered_variant '+chart['id']+'/'+variant['id'],ok,marks=len(observed),spec=spec)
    result=dict(passed=all(c['passed'] for c in checks),at=datetime.now(timezone.utc).isoformat(),session_id=report['session_id'],revision=report['revision'],
        raw_rows=len(raw['rows']),valid_rows=len(rows),queries=len(plans),charts=len(report['charts']),variants=variant_count,marks=marks,
        checks=checks,totals=aggregate(rows,['city'],next(iter(plans.values()))),
        limitation='Independent current raw source equals captured report numbers; source generation was not pinned, so this does not prove the same historical snapshot. No claim about LLM accuracy.')
    result['totals']={k[0]:v for k,v in result['totals'].items()}
    Path(args.out).write_text(json.dumps(result,ensure_ascii=False,indent=2,default=str))
    print(json.dumps({k:v for k,v in result.items() if k not in {'checks','limitation'}},ensure_ascii=False))
    if not result['passed']:raise SystemExit(1)


if __name__=='__main__':main()
