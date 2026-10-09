"""Read-only live warehouse audit of universal dashboards; no AI requests."""
import os
os.environ.update(AI_OFFLINE='1',DATA_ANALYST_ENV='development',DATA_ANALYST_SESSION_STORE='memory',DATA_ANALYST_ARTIFACT_STORE='memory')
import argparse
import json
from pathlib import Path
from datetime import date
from decimal import Decimal
from common import AiTextToReportRequest
from services.analysis_pipeline import AnalysisPipeline
from services.analysis_quality_service import verify_saved_report
from tests.agent_fixtures import ScriptedProvider,call
from db import get_db_conn


def audit():
    cases=[
        dict(id='payments',question='Thống kê số giao dịch và doanh thu thanh toán theo cổng thanh toán và trạng thái giao dịch trong 30 ngày gần nhất.',
             domain='payments',metrics=['payment_count','payment_revenue'],dimensions=['payment_gateway','payment_transaction_status'],kind='cross_tab'),
        dict(id='products',question='Trong 30 ngày gần nhất, xếp hạng 5 sản phẩm bán chạy nhất theo số lượng bán. Với từng sản phẩm, hiển thị số lượng bán và doanh thu sản phẩm. Nêu rõ trạng thái đơn được tính.',
             domain='products',metrics=['quantity_sold','product_revenue'],dimensions=['product'],kind='ranking')]
    results=[]
    for case in cases:
        req=dict(id='r1',domain_id=case['domain'],metric_ids=case['metrics'],dimension_ids=case['dimensions'],
            analysis_kind=case['kind'],time=dict(kind='rolling',amount=30,unit='day'))
        if case['kind']=='ranking':req['ranking']=dict(limit=5,metric_id='quantity_sold')
        provider=ScriptedProvider([call('submit_analysis_intent',dict(decision='analyze',requirements=[req]))])
        pipeline=AnalysisPipeline(provider=provider,owner_id='dashboard-floor-read-only-audit')
        request=AiTextToReportRequest(question=case['question'],reference_date=date(2026,10,9))
        proposal=pipeline.propose(request);p=proposal['proposal']
        request.session_id=proposal['session_id'];request.proposal_revision=p['revision']
        request.intent_fingerprint=p['semantic_intent_fingerprint'];request.plan_fingerprint=p['resolved_plan_fingerprint'];request.catalog_fingerprint=p['catalog_fingerprint']
        report=pipeline.generate(request)
        assert len(report['charts'])>=4
        assert len({c['semantic_view_key'] for c in report['charts']})==len(report['charts'])
        assert len(report['analytical_queries'])<=8
        assert report['quality_assessment']==verify_saved_report(report,pipeline.catalog())
        primary=next(q for q in report['analytical_queries'] if q['role']=='requested' and q['operation']==case['kind'])
        rows=report['result_sets'][primary['id']]['rows']
        connection=get_db_conn()
        try:
            connection.set_session(readonly=True)
            with connection.cursor() as cursor:
                # Both source clocks are timestamp without time zone in the
                # current catalog. These are independently authored SELECTs.
                if case['id']=='payments':
                    cursor.execute('''SELECT cong_thanh_toan AS gateway,trang_thai AS status,
                        COUNT(*) AS count,SUM(so_tien) AS amount FROM silver.giao_dich_thanh_toan
                        WHERE ngay_tao>=DATE %s AND ngay_tao<DATE %s GROUP BY cong_thanh_toan,trang_thai''',
                        ('2026-09-10','2026-10-10'))
                    oracle=cursor.fetchall()
                    actual={(r['payment_gateway'],r['payment_transaction_status']):(r['payment_count'],Decimal(str(r['payment_revenue']))) for r in rows}
                    expected={(r['gateway'],r['status']):(r['count'],Decimal(str(r['amount']))) for r in oracle}
                else:
                    cursor.execute('''SELECT l.ma_san_pham AS product_id,SUM(l.so_luong) AS quantity,
                        SUM(l.thanh_tien) AS amount FROM silver.chi_tiet_don_hang l
                        JOIN silver.don_hang o ON o.ma_don_hang=l.ma_don_hang
                        WHERE o.ngay_tao>=DATE %s AND o.ngay_tao<DATE %s
                        AND o.trang_thai_don_hang IN (%s,%s)
                        GROUP BY l.ma_san_pham ORDER BY quantity DESC,l.ma_san_pham LIMIT 5''',
                        ('2026-09-10','2026-10-10','HOAN_THANH','DANG_GIAO'))
                    oracle=cursor.fetchall()
                    actual={str(r['product_id']):(r['quantity_sold'],Decimal(str(r['product_revenue']))) for r in rows}
                    expected={str(r['product_id']):(r['quantity'],Decimal(str(r['amount']))) for r in oracle}
                assert actual==expected
        finally:connection.close()
        results.append(dict(id=case['id'],question=case['question'],query_count=len(report['analytical_queries']),
            chart_count=len(report['charts']),independent_primary_sql_matched=True,
            minimum_views=proposal['diagnostics']['minimum_visuals'],quality=report['quality_assessment'],
            charts=[{k:c.get(k) for k in ('chart_type','metric','x_field','series_field','role','semantic_view_key')} for c in report['charts']],
            periods=[q['time'] for q in report['analytical_queries']]))
    return dict(status='PASS',measurement_scope='SCRIPTED_INTENT_LIVE_READ_ONLY_WAREHOUSE',LIVE_PROVIDER_REQUESTS=0,WAREHOUSE_WRITES=0,
        cases=results,limitation='Verifies live SQL, chart contracts and report verification with scripted intent; does not measure live AI language accuracy.')


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=Path('/tmp/dashboard-floor-audit.json'));args=parser.parse_args()
    result=audit();args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2,default=str)+'\n')
    print(json.dumps({**{k:v for k,v in result.items() if k!='cases'},'cases':[{k:c[k] for k in ('id','query_count','chart_count','minimum_views','independent_primary_sql_matched')} for c in result['cases']]},ensure_ascii=False))

if __name__=='__main__':main()
