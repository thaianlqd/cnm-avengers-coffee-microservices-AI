"""Opt-in read-only warehouse audit of the reported scenario. Zero provider I/O.

Independent reference SQL is authored here, against source tables, without the
analytical compiler or Silver computed revenue column. Only a temporary owned
Redis session is created and deleted. No warehouse writes or saved reports.
"""
import argparse
import json
from datetime import date
from pathlib import Path
from unittest.mock import patch
from db import get_db_conn
from common import AiTextToReportRequest,AiReportRefineRequest
from services.analysis_pipeline import AnalysisPipeline
from services.analysis_quality_service import verify_saved_report
from services.reference_accuracy import measure_reference_accuracy
from services.session_service import delete_session
from tests.agent_fixtures import ScriptedProvider,call
from tests.test_hybrid_v28 import SCENARIO_A,requirement,envelope,approve


def independent_reference():
    conn=get_db_conn()
    try:
        conn.set_session(readonly=True)
        with conn.cursor() as cur:
            cur.execute('SET LOCAL statement_timeout = 12000')
            cur.execute("SELECT data_type FROM information_schema.columns WHERE table_schema='orders' AND table_name='don_hang' AND column_name='ngay_tao'")
            dtype=cur.fetchone()['data_type']
            time="(o.ngay_tao AT TIME ZONE 'Asia/Ho_Chi_Minh')" if 'with time zone' in dtype else 'o.ngay_tao'
            population=f"""FROM orders.chi_tiet_don_hang ct
                JOIN orders.don_hang o ON o.ma_don_hang=ct.ma_don_hang
                WHERE {time} >= DATE %s AND {time} < DATE %s
                AND o.trang_thai_don_hang IN (%s,%s)"""
            params=('2026-09-09','2026-10-09','HOAN_THANH','DANG_GIAO')
            # Scalar denominator has no product lookup join, making accidental
            # fan-out/dropped rows in the compiler observable.
            cur.execute('SELECT SUM(ct.gia_ban*ct.so_luong) AS revenue '+population,params)
            total=float(cur.fetchone()['revenue'])
            cur.execute('SELECT ct.ma_san_pham AS product_id, SUM(ct.gia_ban*ct.so_luong) AS product_revenue, SUM(ct.so_luong) AS quantity_sold '+population+' GROUP BY ct.ma_san_pham',params)
            facts=[dict(product_id=r['product_id'],product_revenue=float(r['product_revenue']),quantity_sold=int(r['quantity_sold'])) for r in cur.fetchall()]
            cur.execute('SELECT ma_san_pham AS product_id,ten_san_pham AS product FROM menu.san_pham')
            names={r['product_id']:r['product'] for r in cur.fetchall()}
            for r in facts:r['product']=names.get(r['product_id'])
            assert all(r['product'] is not None for r in facts),'Source product reference is incomplete'
            facts.sort(key=lambda r:(-r['product_revenue'],r['product'],r['product_id']))
            return facts[:5],total
    finally:
        conn.rollback();conn.close()


def audit(output):
    session=None
    with patch('requests.sessions.Session.request',side_effect=AssertionError('Live HTTP/provider calls forbidden')):
        expected,total=independent_reference()
        p=AnalysisPipeline(provider=ScriptedProvider([call('submit_analysis_intent',envelope(requirement()))]),owner_id='v281-readonly-audit')
        request=AiTextToReportRequest(question=SCENARIO_A,reference_date=date(2026,10,8))
        try:
            proposal=p.propose(request);session=proposal['session_id'];approve(request,proposal)
            report=p.generate(request)
            p.provider=ScriptedProvider([call('submit_analysis_delta',{'changes':[
                dict(action='update',requirement_id='r1',changes={'ranking':{'limit':2}}),
                dict(action='update',requirement_id='r1',changes={'time':requirement()['time'],'filters':[]}),
            ]})])
            refined=p.refine(AiReportRefineRequest(session_id=session,current_report={'revision':report['revision']},feedback='Đổi thành Top 2, giữ nguyên thời gian và phạm vi.'))
            assertions=[]
            def add(id,observed,expected):assertions.append(dict(id=id,observed=observed,expected=expected))
            summaries=[]
            for name,rep,n in [('top5',report,5),('top2',refined,2)]:
                query=next(q for q in rep['analytical_queries'] if q.get('ranking'))
                rows=rep['result_sets'][query['id']]['rows']
                actual=[{k:r[k] for k in ('product_id','product','product_revenue','quantity_sold')} for r in rows]
                add(name+':ranking',actual,expected[:n])
                add(name+':window',{k:query['time'][k] for k in ('kind','start','end')},dict(kind='range',start='2026-09-09',end='2026-10-08'))
                shares=[e for e in rep['evidence'] if e['feature']=='contribution_share']
                add(name+':share_count',len(shares),len(expected[:n]))
                for index,e in enumerate(shares):
                    # Match by numerator independently of presentation order.
                    values=e['values'];numerator=expected[index]['product_revenue']
                    add(name+f':denominator:{index}',values['denominator'],total)
                    add(name+f':share:{index}',values['share_pct'],100*numerator/total)
                gap=next(e['values'] for e in rep['evidence'] if e['feature']=='top_gap')
                add(name+':gap',gap['gap'],expected[0]['product_revenue']-expected[1]['product_revenue'])
                add(name+':chart_count',len(rep['charts']),3)
                share_chart=next(c for c in rep['charts'] if c.get('value_transform')=='contribution_share')
                add(name+':share_chart',[{k:r[k] for k in ('label','value','numerator','denominator')} for r in share_chart['data']],
                    [dict(label=r['product'],value=100*r['product_revenue']/total,numerator=r['product_revenue'],denominator=total) for r in expected[:n]])
                assert verify_saved_report(rep,p._active_catalog)==rep['quality_assessment']
                assert rep['quality_assessment']['accuracy_assessment']['status']=='not_measured'
                assert rep['quality_assessment']['score']==90
                assert rep['quality_assessment']['score_method']['unmeasured_points']==10
                summaries.append(dict(name=name,revision=rep['revision'],rows=actual,charts=rep['charts'],quality=rep['quality_assessment']))
            result=measure_reference_accuracy(assertions,reference_source='Hand-authored SQL on orders/menu source tables; line revenue recomputed as unit price × quantity')
            record=dict(LIVE_PROVIDER_REQUESTS=0,warehouse_mutations=0,planning='scripted semantic intent',storage='production Redis',
                reference_date='2026-10-08',source_total_revenue=total,source_top5_quantity=sum(r['quantity_sold'] for r in expected),
                source_top5=expected,refinement_provider_calls=p.provider.call_count,audit=result,reports=summaries)
        finally:
            if session:delete_session(session)
    record['temporary_session_deleted']=True
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(record,ensure_ascii=False,indent=2,default=str)+'\n')
    print(json.dumps({k:v for k,v in record.items() if k!='reports'},ensure_ascii=False,default=str))
    assert all(a['matched'] for a in result['assertions']), 'Independent reference audit failed; inspect artifact for observed/reference values'


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True)
    audit(parser.parse_args().output)
