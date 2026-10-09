"""Read-only source audit of the reported city comparison; HTTP is forbidden."""
import argparse
import json
from datetime import date,timedelta
from pathlib import Path
from unittest.mock import patch
from db import get_db_conn
from common import AiTextToReportRequest,AiReportRefineRequest
from services.analysis_pipeline import AnalysisPipeline
from services.analysis_quality_service import verify_saved_report
from services.reference_accuracy import measure_reference_accuracy
from services.session_service import delete_session
from tests.test_comparison_score_v282 import QUESTION,meaning
from tests.test_hybrid_v28 import scripted,envelope,approve
from tests.agent_fixtures import ScriptedProvider,call


def independent_reference():
    conn=get_db_conn()
    try:
        conn.set_session(readonly=True)
        with conn.cursor() as cur:
            cur.execute('SET LOCAL statement_timeout = 12000')
            cur.execute("SELECT data_type FROM information_schema.columns WHERE table_schema='orders' AND table_name='don_hang' AND column_name='ngay_tao'")
            dtype=cur.fetchone()['data_type']
            time="(o.ngay_tao AT TIME ZONE 'Asia/Ho_Chi_Minh')" if 'with time zone' in dtype else 'o.ngay_tao'
            # Author the oracle from raw order/branch tables, independently of
            # the analytical compiler and its separate population queries.
            cur.execute(f"""SELECT cn.thanh_pho AS city,
                COUNT(*) AS order_count,
                SUM(o.tong_tien) FILTER (WHERE o.trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')) AS revenue,
                SUM(o.tong_tien) FILTER (WHERE o.trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')) /
                    NULLIF(COUNT(*) FILTER (WHERE o.trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')),0) AS aov
                FROM orders.don_hang o JOIN identity.chi_nhanh cn ON cn.ma_chi_nhanh=o.co_so_ma
                WHERE {time} >= DATE %s AND {time} < DATE %s
                AND cn.thanh_pho IN (%s,%s)
                GROUP BY cn.thanh_pho ORDER BY cn.thanh_pho""",
                (str(date(2026,10,8)-timedelta(days=89)),'2026-10-09','Hồ Chí Minh','Hà Nội'))
            return [{k:float(v) if k in {'revenue','aov'} and v is not None else v for k,v in r.items()} for r in cur.fetchall()]
    finally:conn.rollback();conn.close()


def audit(output):
    session=None
    with patch('requests.sessions.Session.request',side_effect=AssertionError('Live HTTP/provider calls forbidden')):
        expected=independent_reference()
        assert len(expected)==2,'Both source cities must be observed'
        p=AnalysisPipeline(provider=scripted(envelope(meaning())),owner_id='v282-readonly-audit')
        request=AiTextToReportRequest(question=QUESTION,analysis_context='Chỉ xét TP.HCM và Hà Nội.',
            analysis_expectation='Bảng so sánh, biểu đồ phù hợp và nêu khác biệt chính.',reference_date=date(2026,10,8))
        try:
            proposal=p.propose(request);session=proposal['session_id'];approve(request,proposal)
            report=p.generate(request)
            observed={}
            for result in report['result_sets'].values():
                for row in result['rows']:observed.setdefault(row['city'],{}).update(row)
            actual=[observed[k] for k in sorted(observed)]
            assertions=[dict(id='city_metric_populations',observed=actual,expected=expected),
                dict(id='three_distinct_metric_views',observed=sorted(c['metric'] for c in report['charts']),expected=['aov','order_count','revenue']),
                dict(id='normalized_operation',observed=report['semantic_intent']['requirements'][0]['analysis_kind'],expected='aggregate'),
                dict(id='observed_checks_score',observed=report['quality_assessment']['score'],expected=90)]
            for q in report['analytical_queries']:
                assertions.append(dict(id='window:'+q['id'],observed={k:q['time'][k] for k in ('kind','start','end')},expected=dict(kind='range',start='2026-07-11',end='2026-10-08')))
            assert verify_saved_report(report,p._active_catalog)==report['quality_assessment']
            initial_calls=p.provider.call_count
            p.provider=ScriptedProvider([call('submit_analysis_delta',dict(changes=[dict(action='update',requirement_id='req_1',changes=dict(
                filters=[dict(dimension='city',value='Hà Nội')]))]))])
            refined=p.refine(AiReportRefineRequest(session_id=session,current_report={'revision':report['revision']},feedback='Chỉ giữ Hà Nội, giữ nguyên chỉ số và thời gian.'))
            refined_rows={}
            for result in refined['result_sets'].values():
                for row in result['rows']:refined_rows.setdefault(row['city'],{}).update(row)
            assertions.append(dict(id='refinement_preserves_values',observed=list(refined_rows.values()),expected=[r for r in expected if r['city']=='Hà Nội']))
            assert verify_saved_report(refined,p._active_catalog)==refined['quality_assessment']
            result=measure_reference_accuracy(assertions,reference_source='Hand-authored SQL against raw orders.don_hang and identity.chi_nhanh, separate valid-order revenue/AOV and all-order count')
            record=dict(LIVE_PROVIDER_REQUESTS=0,warehouse_mutations=0,planning='scripted semantic intent with reported cross_tab shape',
                storage='production Redis',reference_date='2026-10-08',initial_provider_calls=initial_calls,refinement_provider_calls=p.provider.call_count,
                source_rows=expected,observed_rows=actual,audit=result,chart_count=len(report['charts']),quality=report['quality_assessment'])
        finally:
            if session:delete_session(session)
    record['temporary_session_deleted']=True
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(record,ensure_ascii=False,indent=2,default=str)+'\n')
    print(json.dumps({k:v for k,v in record.items() if k!='quality'},ensure_ascii=False,default=str))
    assert all(a['matched'] for a in result['assertions']),'Independent comparison audit failed'


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True)
    audit(parser.parse_args().output)
