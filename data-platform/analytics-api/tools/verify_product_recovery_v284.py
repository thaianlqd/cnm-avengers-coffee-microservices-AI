"""Read-only independent product audit; recorded diagnostic shapes, fake AI only."""
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
from tests.test_semantic_recovery_v284 import RECORDED,QUESTION,reconstructed
from tests.test_hybrid_v28 import scripted,envelope,approve


def independent_reference():
    conn=get_db_conn()
    try:
        conn.set_session(readonly=True)
        with conn.cursor() as cur:
            cur.execute('SET LOCAL statement_timeout = 12000')
            cur.execute("SELECT data_type FROM information_schema.columns WHERE table_schema='orders' AND table_name='don_hang' AND column_name='ngay_tao'")
            dtype=cur.fetchone()['data_type']
            clock="(o.ngay_tao AT TIME ZONE 'Asia/Ho_Chi_Minh')" if 'with time zone' in dtype else 'o.ngay_tao'
            scope=f"FROM orders.chi_tiet_don_hang ct JOIN orders.don_hang o ON o.ma_don_hang=ct.ma_don_hang WHERE {clock} >= DATE %s AND {clock} < DATE %s AND o.trang_thai_don_hang IN ('HOAN_THANH','DANG_GIAO')"
            params=('2026-08-10','2026-10-09')
            cur.execute('SELECT SUM(ct.gia_ban*ct.so_luong) AS revenue,SUM(ct.so_luong) AS quantity '+scope,params)
            totals={k:float(v) for k,v in cur.fetchone().items()}
            # Raw source data, no compiler expression or Silver computed money.
            cur.execute('SELECT ct.ma_san_pham AS product_id,SUM(ct.gia_ban*ct.so_luong) AS revenue,SUM(ct.so_luong) AS quantity '+scope+' GROUP BY ct.ma_san_pham',params)
            facts={r['product_id']:dict(product_id=r['product_id'],revenue=float(r['revenue']),quantity=int(r['quantity'])) for r in cur.fetchall()}
            cur.execute('SELECT p.ma_san_pham AS product_id,p.ten_san_pham AS product,d.ten_danh_muc AS category FROM menu.san_pham p LEFT JOIN menu.danh_muc d ON d.ma_danh_muc=p.ma_danh_muc')
            names={r['product_id']:dict(product=r['product'],category=r['category']) for r in cur.fetchall()}
            assert all(id in names and names[id]['product'] and names[id]['category'] for id in facts),'Independent source lookup incomplete'
            for id,row in facts.items():row.update(names[id])
            category={}
            for row in facts.values():category[row['category']]=category.get(row['category'],0)+row['revenue']
            # Let the database's own collation decide ties exactly as in the
            # displayed ranking, independently of Python locale ordering.
            cur.execute('SELECT ct.ma_san_pham AS product_id,SUM(ct.gia_ban*ct.so_luong) AS revenue '+scope+' GROUP BY ct.ma_san_pham ORDER BY revenue DESC, (SELECT p.ten_san_pham FROM menu.san_pham p WHERE p.ma_san_pham=ct.ma_san_pham),ct.ma_san_pham LIMIT 10',params)
            top10=[facts[r['product_id']] for r in cur.fetchall()]
            cur.execute(f"SELECT DATE_TRUNC('week',{clock}) AS period,ct.ma_san_pham AS product_id,SUM(ct.gia_ban*ct.so_luong) AS revenue "+scope+' GROUP BY 1,ct.ma_san_pham',params)
            weekly=sorted([dict(period=str(r['period'])[:10],product_id=r['product_id'],revenue=float(r['revenue'])) for r in cur.fetchall()],key=lambda r:(r['period'],r['product_id']))
            return dict(totals=totals,top10=top10,categories=category,weekly=weekly)
    finally:conn.rollback();conn.close()


def audit(output):
    assertions=[];reports=[]
    def add(id,observed,expected):assertions.append(dict(id=id,observed=observed,expected=expected))
    with patch('requests.sessions.Session.request',side_effect=AssertionError('Live HTTP/provider requests forbidden')):
        source=independent_reference()
        for record in RECORDED['records']:
            session=None;name=record['name'];meaning=reconstructed(record)
            compare=next(r for r in meaning['requirements'] if 'compar' in r['id'])
            repair=envelope({'id':compare['id'],'derived_features':['leader','top_gap']})
            p=AnalysisPipeline(provider=scripted(meaning,repair),owner_id='v284-readonly-product-audit')
            request=AiTextToReportRequest(question=QUESTION,reference_date=date(2026,10,8))
            try:
                proposal=p.propose(request);session=proposal['session_id'];approve(request,proposal)
                report=p.generate(request)
                add(name+':outcome',report['outcome'],'SUCCESS')
                add(name+':internal_recovery',p.provider.call_count,2)
                add(name+':coverage',all(c['state']=='RESOLVED' for c in report['resolved_requirement_coverage']),True)
                for q in report['analytical_queries']:
                    add(name+':window:'+q['id'],{k:q['time'][k] for k in ('kind','start','end')},dict(kind='range',start='2026-08-10',end='2026-10-08'))
                    rows=report['result_sets'][q['id']]['rows']
                    if q.get('ranking'):
                        expected=source['top10'][:q['ranking']['top_n']]
                        observed=[dict(product_id=r['product_id'],product=r['product'],revenue=r['item_revenue'],**({'quantity':r['quantity_sold']} if 'quantity_sold' in q['metrics'] else {})) for r in rows]
                        expect=[{k:r[k] for k in observed[0]} for r in expected]
                        add(name+':ranking:'+q['id'],observed,expect)
                    elif q['operation']=='trend':
                        observed=sorted([dict(period=str(r['period'])[:10],product_id=r['product_id'],revenue=r['item_revenue']) for r in rows],key=lambda r:(r['period'],r['product_id']))
                        add(name+':weekly',observed,source['weekly'])
                        add(name+':cadence',q['granularity'],'week')
                    elif 'category' in q['group_by']:
                        add(name+':category',{r['category']:r['item_revenue'] for r in rows},source['categories'])
                    elif not q['group_by']:
                        for metric in q['metrics']:
                            add(name+':denominator:'+q['id']+':'+metric,rows[0][metric],source['totals']['quantity' if metric=='quantity_sold' else 'revenue'])
                for i,e in enumerate(report['evidence']):
                    if e['feature']=='contribution_share':
                        total=source['totals']['quantity' if e['metric']=='quantity_sold' else 'revenue']
                        add(name+':share_denominator:'+str(i),e['values']['denominator'],total)
                        add(name+':share_math:'+str(i),e['values']['share_pct'],100*e['values']['value']/total)
                    elif e['feature']=='top_gap':
                        add(name+':leader_gap:'+str(i),e['values']['gap'],source['top10'][0]['revenue']-source['top10'][1]['revenue'])
                add(name+':saved_verifier',verify_saved_report(report,p._active_catalog),report['quality_assessment'])
                # The real source has >16 product time series: the current
                # renderer withholds that chart, while keeping all 944 facts
                # in the data table. Preserve its honest visualization penalty
                # rather than altering the score merely to make this audit pass.
                visual=next(c for c in report['quality_assessment']['verification_checks'] if c['id']=='visualization_appropriateness')
                add(name+':visual_check',dict(passed=visual['passed'],total=visual['total']),dict(passed=9,total=10))
                add(name+':engineering_score',report['quality_assessment']['score'],89.5)
                add(name+':honest_unmeasured_accuracy',report['quality_assessment']['accuracy_assessment']['status'],'not_measured')
                reports.append(dict(name=name,outcome=report['outcome'],provider_calls=p.provider.call_count,
                    query_count=len(report['analytical_queries']),chart_count=len(report['charts']),weekly_rows=len(source['weekly']),
                    root_contract_issues=proposal['diagnostics'].get('root_contract_issues'),quality=report['quality_assessment']))
            finally:
                if session:delete_session(session)
        result=measure_reference_accuracy(assertions,reference_source='Independent read-only SQL on raw orders.chi_tiet_don_hang, orders.don_hang, menu.san_pham and menu.danh_muc; price × quantity, raw category aggregation and product/week facts')
        record=dict(LIVE_PROVIDER_REQUESTS=0,warehouse_mutations=0,temporary_sessions_deleted=True,
            interpretation='Recorded diagnostic shapes with explicitly reconstructed scope and scripted partial feature recovery; not a live-model reliability estimate',
            source=source,audit=result,reports=reports,
            reference_failures=[a for a,v in zip(assertions,result['assertions']) if not v['matched']])
    output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(record,ensure_ascii=False,indent=2,default=str)+'\n')
    print(json.dumps(dict(audit=result['assessment'],reports=[{k:r[k] for k in ['name','outcome','provider_calls','query_count','chart_count','weekly_rows']} for r in reports],LIVE_PROVIDER_REQUESTS=0,warehouse_mutations=0),ensure_ascii=False))
    assert all(a['matched'] for a in result['assertions']),'Independent product audit failed; inspect artifact'


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True);audit(parser.parse_args().output)
