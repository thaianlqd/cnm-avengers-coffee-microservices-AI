"""Reproduce both recorded overview interpretations, with read-only source SQL.

No live provider calls. Each generated report owns a temporary Redis session,
deleted after the audit. Oracle SQL does not use the analytical compiler.
"""
import argparse
import json
from datetime import date
from pathlib import Path
from unittest.mock import patch
from db import get_db_conn
from common import AiTextToReportRequest
from services.analysis_pipeline import AnalysisPipeline
from services.analysis_quality_service import verify_saved_report
from services.reference_accuracy import measure_reference_accuracy
from services.session_service import delete_session
from tests.test_hybrid_v28 import scripted,approve
from tests.test_overview_v283 import RECORDED,QUESTION


def reference():
    conn=get_db_conn()
    try:
        conn.set_session(readonly=True)
        with conn.cursor() as cur:
            cur.execute('SET LOCAL statement_timeout = 12000')
            cur.execute("SELECT data_type FROM information_schema.columns WHERE table_schema='orders' AND table_name='don_hang' AND column_name='ngay_tao'")
            dtype=cur.fetchone()['data_type']
            clock="(o.ngay_tao AT TIME ZONE 'Asia/Ho_Chi_Minh')" if 'with time zone' in dtype else 'o.ngay_tao'
            window=f"{clock} >= DATE %s AND {clock} < DATE %s"
            params=('2026-07-11','2026-10-09')
            valid="o.trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')"
            cur.execute(f"""SELECT COUNT(*) AS order_count,
                SUM(o.tong_tien) FILTER (WHERE {valid}) AS revenue,
                SUM(o.tong_tien) FILTER (WHERE {valid}) / NULLIF(COUNT(*) FILTER (WHERE {valid}),0) AS aov,
                COUNT(DISTINCT {clock}) FILTER (WHERE {valid}) AS raw_order_instants
                FROM orders.don_hang o WHERE {window}""",params)
            totals={k:float(v) if k in {'revenue','aov'} else v for k,v in cur.fetchone().items()}
            cur.execute(f"SELECT DATE_TRUNC('week',{clock}) AS period,SUM(o.tong_tien) AS revenue FROM orders.don_hang o WHERE {window} AND {valid} GROUP BY 1 ORDER BY 1",params)
            weekly=[dict(period=str(r['period'])[:10],revenue=float(r['revenue'])) for r in cur.fetchall()]
            population=f'FROM orders.don_hang o JOIN identity.chi_nhanh cn ON cn.ma_chi_nhanh=o.co_so_ma WHERE {window} AND {valid}'
            cur.execute('SELECT cn.thanh_pho AS city,SUM(o.tong_tien) AS revenue '+population+' GROUP BY cn.thanh_pho ORDER BY cn.thanh_pho',params)
            cities=[dict(city=r['city'],revenue=float(r['revenue'])) for r in cur.fetchall()]
            cur.execute('SELECT cn.ma_chi_nhanh AS store_id,cn.ten_chi_nhanh AS store,SUM(o.tong_tien) AS revenue '+population+' GROUP BY cn.ma_chi_nhanh,cn.ten_chi_nhanh ORDER BY revenue DESC,cn.ten_chi_nhanh,cn.ma_chi_nhanh LIMIT 10',params)
            stores=[dict(store_id=r['store_id'],store=r['store'],revenue=float(r['revenue'])) for r in cur.fetchall()]
            return dict(totals=totals,weekly=weekly,cities=cities,stores=stores)
    finally:conn.rollback();conn.close()


def audit(output):
    with patch('requests.sessions.Session.request',side_effect=AssertionError('Live HTTP/provider requests forbidden')):
        source=reference();records=[];assertions=[]
        def add(id,observed,expected):assertions.append(dict(id=id,observed=observed,expected=expected))
        for name in ('failed_intent','successful_intent'):
            session=None
            p=AnalysisPipeline(provider=scripted(RECORDED[name]),owner_id='v283-readonly-audit')
            request=AiTextToReportRequest(question=QUESTION,reference_date=date(2026,10,8))
            try:
                proposal=p.propose(request);session=proposal['session_id'];approve(request,proposal)
                report=p.generate(request)
                add(name+':outcome',report['outcome'],'SUCCESS')
                add(name+':coverage',all(c['state']=='RESOLVED' for c in report['resolved_requirement_coverage']),True)
                scalars={e['metric']:e['values']['value'] for e in report['evidence'] if e['feature']=='scalar'}
                for metric in ('revenue','order_count','aov'):add(name+':'+metric,scalars[metric],source['totals'][metric])
                trend=next(q for q in report['analytical_queries'] if q['operation']=='trend')
                rows=report['result_sets'][trend['id']]['rows']
                actual=[dict(period=str(r['period'])[:10],revenue=r['revenue']) for r in rows]
                add(name+':weekly',actual,source['weekly'])
                add(name+':trend_axes',trend['group_by'],[])
                add(name+':granularity',trend['granularity'],'week')
                for q in report['analytical_queries']:
                    dims=q['group_by'];metric=q['metrics'][0]
                    if 'city' in dims:
                        observed=[dict(city=r['city'],revenue=r[metric]) for r in report['result_sets'][q['id']]['rows']]
                        expected=source['cities']
                        if q.get('ranking'):expected=sorted(expected,key=lambda r:(-r['revenue'],r['city']))[:q['ranking']['top_n']]
                        else:
                            # Group totals have no requested ranking. Compare
                            # identical keys on both sides, independent of the
                            # database's locale-specific alphabetical collation.
                            observed.sort(key=lambda r:r['city'])
                            expected=sorted(expected,key=lambda r:r['city'])
                        add(name+':city',observed,expected)
                    if 'store' in dims:
                        observed=[dict(store_id=r['store_id'],store=r['store'],revenue=r[metric]) for r in report['result_sets'][q['id']]['rows']]
                        add(name+':store_top10',observed,source['stores'])
                shares=[e for e in report['evidence'] if e['feature']=='contribution_share']
                add(name+':denominators',all(e['values']['denominator']==source['totals']['revenue'] for e in shares),True)
                add(name+':internal_score',report['quality_assessment']['score'],90)
                add(name+':single_interpretation',p.provider.call_count,1)
                add(name+':restored_verification',verify_saved_report(report,p._active_catalog),report['quality_assessment'])
                records.append(dict(name=name,outcome=report['outcome'],provider_calls=p.provider.call_count,
                    materialized_operations=len(report['analytical_queries']),executed_queries=report['diagnostics']['db_query_count'],
                    weekly_rows=len(rows),semantic_normalizations=proposal['diagnostics'].get('semantic_normalizations',[]),
                    semantic_intent=report['semantic_intent'],quality=report['quality_assessment']))
            finally:
                if session:delete_session(session)
        result=measure_reference_accuracy(assertions,reference_source='Hand-authored read-only SQL on raw orders.don_hang and identity.chi_nhanh; full system KPIs, weekly buckets, city totals and store rankings')
        record=dict(LIVE_PROVIDER_REQUESTS=0,warehouse_mutations=0,planning='recorded provider meaning replayed without live AI',storage='production Redis',
            reference_date='2026-10-08',temporary_sessions_deleted=True,source=source,audit=result,reports=records,
            reference_failures=[a for a,v in zip(assertions,result['assertions']) if not v['matched']])
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(record,ensure_ascii=False,indent=2,default=str)+'\n')
    print(json.dumps(dict(raw_order_instants=source['totals']['raw_order_instants'],weekly_buckets=len(source['weekly']),
        reports=[dict(name=r['name'],outcome=r['outcome'],provider_calls=r['provider_calls']) for r in records],
        audit=result['assessment'],LIVE_PROVIDER_REQUESTS=0,warehouse_mutations=0),ensure_ascii=False))
    assert all(a['matched'] for a in result['assertions']),'Independent overview audit failed'


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True)
    audit(parser.parse_args().output)
