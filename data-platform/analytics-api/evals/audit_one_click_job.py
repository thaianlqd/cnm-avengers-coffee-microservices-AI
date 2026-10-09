"""Independent read-only audit of an authored qualification job; zero AI sends."""
import argparse
from datetime import date
import json
from pathlib import Path

from db import get_db_conn
from evals.one_click_cases import CASES
from evals.qualify_one_click import oracle
from services.result_artifact_store import artifact_store
from services.session_service import get_session, storage


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--job-id',required=True)
    parser.add_argument('--case',required=True,choices=[c['id'] for c in CASES])
    parser.add_argument('--output',required=True)
    args=parser.parse_args()
    job=json.loads(storage().client.get('analyst:{jobs}:'+args.job_id))
    case=next(c for c in CASES if c['id']==args.case)
    if job['state']!='completed' or job['payload']['prompt']!=case['question']:
        raise ValueError('A completed authored qualification job is required')
    report=job['result'];session=get_session(report['session_id'])
    artifacts=list(session.agent_artifacts.values())
    def rows(a):return (a.result or artifact_store().get(a.result_ref))['rows']
    totals=[row for a in artifacts if not a.query.group_by and a.query.operation!='trend' for row in rows(a)]
    expected=oracle(case,date(2026,10,9))
    aliases={'order_count':['order_count','store_order_count']} if args.case=='kiosks' else {}
    checks={m:any(row.get(alias) is not None and abs(float(row[alias])-v)<.01
        for row in totals for alias in aliases.get(m,[m])) if v is not None else
        any(alias in row and row[alias] is None for row in totals for alias in aliases.get(m,[m]))
        for m,v in expected.items()}
    rank_checks={}
    if args.case=='kiosks':
        conn=get_db_conn()
        try:
            with conn.cursor() as cur:
                cur.execute('SET TRANSACTION READ ONLY');cur.execute('SET LOCAL statement_timeout=4000')
                for metric,expression,status in [
                    ('store_revenue','SUM(o.tong_tien)',"AND o.trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')"),
                    ('store_order_count','COUNT(*)','')]:
                    cur.execute(f"""SELECT s.ten_chi_nhanh AS store,s.ma_chi_nhanh AS store_id,{expression} AS value
                        FROM silver.don_hang o JOIN silver.chi_nhanh s ON o.co_so_ma=s.ma_chi_nhanh
                        WHERE s.loai_diem_ban IN ('KIOSK_NHUONG_QUYEN','KIOSK_VE_TINH')
                        AND (o.ngay_tao AT TIME ZONE 'Asia/Ho_Chi_Minh')::date>=%s
                        AND (o.ngay_tao AT TIME ZONE 'Asia/Ho_Chi_Minh')::date<%s {status}
                        GROUP BY s.ten_chi_nhanh,s.ma_chi_nhanh
                        ORDER BY value DESC,store ASC,store_id ASC LIMIT 10""",('2026-09-10','2026-10-10'))
                    independent=list(cur.fetchall())
                    allowed={metric,'order_count'} if metric=='store_order_count' else {metric}
                    a=next(a for a in artifacts if a.query.operation=='ranking' and a.query.ranking.metric in allowed)
                    observed=rows(a)
                    rank_checks[metric]=len(observed)==len(independent) and all(
                        x['store_id']==y['store_id'] and abs(float(x[a.query.ranking.metric])-float(y['value']))<.01
                        for x,y in zip(observed,independent))
        finally:conn.rollback();conn.close()
    result=dict(job_id=args.job_id,case=args.case,method='independent_read_only_SQL_on_real_warehouse',
        actual_provider_calls=job['provider_call_count'],charts=len(report['charts']),
        job_total_ms=report.get('diagnostics',{}).get('job_total_ms'),
        total_oracle_match=checks,top10_oracle_match=rank_checks)
    Path(args.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False))
    if not all(checks.values()) or not all(rank_checks.values()):raise SystemExit(1)


if __name__=='__main__':main()
