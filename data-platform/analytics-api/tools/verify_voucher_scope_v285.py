"""Independent raw-source voucher oracle; read-only warehouse, scripted AI.

No live provider request, no warehouse mutation. Only audit-owned temporary
analysis sessions are created/deleted. Raw data and user sessions are untouched.
"""
import argparse,json
from datetime import date
from pathlib import Path
from unittest.mock import patch
from db import get_db_conn
from common import AiTextToReportRequest
from services.analysis_pipeline import AnalysisPipeline
from services.analysis_quality_service import verify_saved_report
from services.reference_accuracy import measure_reference_accuracy
from services.session_service import delete_session,get_session
from tests.test_voucher_scope_v285 import QUESTION,meaning
from tests.test_hybrid_v28 import scripted,approve


def independent_reference():
    conn=get_db_conn()
    try:
        conn.set_session(readonly=True)
        with conn.cursor() as cur:
            cur.execute('SET LOCAL statement_timeout = 12000')
            cur.execute("SELECT data_type FROM information_schema.columns WHERE table_schema='orders' AND table_name='don_hang' AND column_name='ngay_tao'")
            dtype=cur.fetchone()['data_type']
            clock="(o.ngay_tao AT TIME ZONE 'Asia/Ho_Chi_Minh')" if 'with time zone' in dtype else 'o.ngay_tao'
            scope=f"FROM orders.don_hang o WHERE o.ma_voucher IS NOT NULL AND {clock} >= DATE %s AND {clock} < DATE %s"
            params=('2026-08-10','2026-10-09')
            valid="o.trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')"
            cur.execute('SELECT o.ma_voucher AS code,COUNT(*) AS orders '+scope+' GROUP BY o.ma_voucher',params)
            counts={r['code']:int(r['orders']) for r in cur.fetchall()}
            cur.execute('SELECT o.ma_voucher AS code,COUNT(*) AS valid_orders,SUM(o.tong_tien) AS revenue,SUM(o.so_tien_giam) AS discount '+scope+' AND '+valid+' GROUP BY o.ma_voucher',params)
            financial={r['code']:dict(valid_orders=int(r['valid_orders']),revenue=float(r['revenue']),discount=float(r['discount'])) for r in cur.fetchall()}
            cur.execute('SELECT SUM(o.tong_tien) AS revenue '+scope+' AND '+valid,params)
            total=float(cur.fetchone()['revenue'])
            cur.execute('SELECT ma_khuyen_mai AS code,ten_khuyen_mai AS name FROM identity.khuyen_mai')
            programs=cur.fetchall();assert len({r['code'] for r in programs})==len(programs),'Duplicate reference key risks fanout'
            cur.execute('SELECT ma_voucher AS code,ten_voucher AS name FROM orders.voucher')
            vouchers=cur.fetchall();assert len({r['code'] for r in vouchers})==len(vouchers),'Duplicate voucher key risks fanout'
            names={r['code']:r['name'] for r in vouchers}
            for row in programs:
                if row['name'] is not None:names[row['code']]=row['name']
            cur.execute('SELECT COUNT(*) AS unmatched_orders '+scope+' AND NOT EXISTS (SELECT 1 FROM identity.khuyen_mai k WHERE k.ma_khuyen_mai=o.ma_voucher) AND NOT EXISTS (SELECT 1 FROM orders.voucher v WHERE v.ma_voucher=o.ma_voucher)',params)
            unmatched_orders=int(cur.fetchone()['unmatched_orders'])
            # Database collation determines ties independently of Python locale.
            leader_scope=f"FROM orders.don_hang o LEFT JOIN identity.khuyen_mai k ON k.ma_khuyen_mai=o.ma_voucher LEFT JOIN orders.voucher v ON v.ma_voucher=o.ma_voucher WHERE o.ma_voucher IS NOT NULL AND {clock} >= DATE %s AND {clock} < DATE %s"
            leaders={}
            for metric,expr,where in [('voucher_order_count','COUNT(*)',''),('voucher_revenue','SUM(o.tong_tien)',' AND '+valid)]:
                cur.execute('SELECT o.ma_voucher AS code,'+expr+' AS value '+leader_scope+where+' GROUP BY o.ma_voucher,k.ten_khuyen_mai,v.ten_voucher ORDER BY value DESC,COALESCE(k.ten_khuyen_mai,v.ten_voucher,o.ma_voucher),o.ma_voucher LIMIT 1',params)
                row=cur.fetchone();leaders[metric]=dict(code=row['code'],value=float(row['value']))
            return dict(counts=counts,financial=financial,total=total,names=names,leaders=leaders,
                        unmatched_orders=unmatched_orders,programs=len(programs),unique_names=len(set(names.values())))
    finally:conn.rollback();conn.close()


def audit(output):
    checks=[];summaries=[]
    def add(id,observed,expected):checks.append(dict(id=id,observed=observed,expected=expected))
    with patch('requests.sessions.Session.request',side_effect=AssertionError('Live HTTP/provider requests forbidden')):
        source=independent_reference()
        for kind in ['detail','aggregate']:
            owner='v285-readonly-voucher-audit';session=None
            p=AnalysisPipeline(provider=scripted(meaning(kind)),owner_id=owner)
            req=AiTextToReportRequest(question=QUESTION,reference_date=date(2026,10,8))
            try:
                proposal=p.propose(req);session=proposal['session_id'];approve(req,proposal);r=p.generate(req)
                # Oracle assertions always consume the full immutable population,
                # never the response's bounded preview.
                from services.result_artifact_store import artifact_store
                from copy import deepcopy
                preview_report=deepcopy(r)
                for result in r['result_sets'].values():
                    if result.get('artifact_ref'):
                        result['rows']=artifact_store().get(result['artifact_ref'])['rows']
                if r.get('evidence_ref'):
                    r['evidence']=artifact_store().get(r['evidence_ref'])['rows']
                add(kind+':outcome',r['outcome'],'SUCCESS');add(kind+':calls',p.provider.call_count,1)
                add(kind+':scope',all(c['state']=='RESOLVED' for c in r['resolved_requirement_coverage']),True)
                for q in r['analytical_queries']:
                    rows=r['result_sets'][q['id']]['rows'];prefix=kind+':'+q['id']
                    add(prefix+':time',{k:q['time'][k] for k in ('kind','start','end')},dict(kind='range',start='2026-08-10',end='2026-10-08'))
                    if q.get('ranking'):
                        metric=q['ranking']['metric'];add(prefix+':leader',dict(code=rows[0]['promotion_id'],value=rows[0][metric]),source['leaders'][metric])
                    elif not q['group_by']:
                        add(prefix+':denominator',rows[0]['voucher_revenue'],source['total'])
                    else:
                        for metric in q['metrics']:
                            observed={row['promotion_id']:row[metric] for row in rows}
                            expected=(source['counts'] if metric=='voucher_order_count' else
                                {code:(f['revenue']/f['valid_orders'] if metric=='aov' else f['revenue' if metric=='voucher_revenue' else 'discount'])
                                 for code,f in source['financial'].items()})
                            add(prefix+':'+metric,observed,expected)
                        add(prefix+':labels',all(row['promotion']==(source['names'].get(row['promotion_id']) or row['promotion_id']) for row in rows),True)
                shares=[e for e in r['evidence'] if e['feature']=='contribution_share']
                add(kind+':share_metrics',sorted({e['metric'] for e in shares}),['voucher_revenue'])
                add(kind+':share_coverage',sorted(e['values']['dimensions']['promotion_id'] for e in shares),sorted(source['financial']))
                for e in shares:
                    code=e['values']['dimensions']['promotion_id'];add(kind+':share:'+code,e['values']['share_pct'],source['financial'][code]['revenue']/source['total']*100)
                    add(kind+':denominator:'+code,e['values']['denominator'],source['total'])
                add(kind+':share_sum',sum(e['values']['share_pct'] for e in shares),100)
                for chart in r['charts']:
                    q=next(q for q in r['analytical_queries'] if q['id']==chart['query_id'])
                    rows=r['result_sets'][q['id']]['rows']
                    expected_labels={str(row['promotion']) if row['promotion']==row['promotion_id'] else f"{row['promotion']} ({row['promotion_id']})" for row in rows}
                    add(kind+':chart_entities:'+chart['id'],sorted(row['label'] for row in chart['data']),sorted(expected_labels))
                for evidence in r['evidence']:
                    if evidence['feature']=='leader':
                        code=source['leaders'][evidence['metric']]['code'];name=source['names'].get(code) or code
                        add(kind+':leader_identity:'+evidence['metric'],evidence['values']['entity'],name if name==code else f'{name} ({code})')
                # Fingerprints bind the transported preview; verify its original
                # shape, while numerical oracle checks above use full artifacts.
                add(kind+':saved_verifier',verify_saved_report(preview_report,p._active_catalog),r['quality_assessment'])
                add(kind+':roi_guardrail',any('không kết luận ROI' in l['label'] for l in r['quality_limitations']),True)
                add(kind+':accuracy_unknown',r['quality_assessment']['accuracy_assessment']['status'],'not_measured')
                summaries.append(dict(shape=kind,provider_calls=p.provider.call_count,queries=len(r['analytical_queries']),charts=len(r['charts']),score=r['quality_assessment']['score'],checks=r['quality_assessment']['verification_checks']))
            finally:
                if session:
                    assert get_session(session).owner_id==owner
                    delete_session(session)
    measured=measure_reference_accuracy(checks,reference_source='Independent read-only orders.don_hang, orders.voucher and identity.khuyen_mai, 2026-08-10..2026-10-08')
    result=dict(reference_accuracy=measured['assessment'],reference_failures=[c for c in measured['assertions'] if not c['matched']],live_provider_requests=0,warehouse_writes=0,
        source_summary=dict(voucher_orders=sum(source['counts'].values()),voucher_codes=len(source['counts']),
            valid_revenue_codes=len(source['financial']),voucher_revenue=source['total'],unmatched_orders=source['unmatched_orders'],
            program_codes=source['programs'],unique_program_names=source['unique_names']),reports=summaries,assertions=checks)
    Path(output).parent.mkdir(parents=True,exist_ok=True);Path(output).write_text(json.dumps(result,ensure_ascii=False,indent=2,default=str)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k not in {'assertions','reports'}},ensure_ascii=False))
    assert measured['assessment']['matched_count']==measured['assessment']['reference_count'],measured['assessment']


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);audit(parser.parse_args().output)
