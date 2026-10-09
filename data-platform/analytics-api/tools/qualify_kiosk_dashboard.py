"""Manual scripted-intent audit against read-only live warehouse, no AI calls.

Uses current semantic compiler/resolver, approval, charts and verifier. The
provider is scripted and cannot contact an AI endpoint. This is a warehouse/
contract qualification, not evidence of live model language understanding.
"""
import os
os.environ.update(AI_OFFLINE='1',DATA_ANALYST_ENV='development',DATA_ANALYST_SESSION_STORE='memory',DATA_ANALYST_ARTIFACT_STORE='memory')
import argparse
import json
from pathlib import Path
from decimal import Decimal
from datetime import date
from common import AiTextToReportRequest
from services.analysis_pipeline import AnalysisPipeline
from services.analysis_quality_service import verify_saved_report
from tests.agent_fixtures import ScriptedProvider, call
from db import get_db_conn

QUESTION='Đánh giá doanh thu và xếp hạng hiệu suất các chi nhánh các kisok'
KIOSKS=['KIOSK_NHUONG_QUYEN','KIOSK_VE_TINH']


def audit():
    intent={'decision':'analyze','requirements':[dict(id='r1',domain_id='stores',metric_ids=['store_revenue'],
        dimension_ids=['store'],analysis_kind='ranking',ranking=dict(limit=10,metric_id='store_revenue'))]}
    provider=ScriptedProvider([call('submit_analysis_intent',intent)])
    pipeline=AnalysisPipeline(provider=provider,owner_id='read-only-kiosk-audit')
    request=AiTextToReportRequest(question=QUESTION,reference_date=date(2026,10,9))
    proposal=pipeline.propose(request);p=proposal['proposal']
    request.session_id=proposal['session_id'];request.proposal_revision=p['revision']
    request.intent_fingerprint=p['semantic_intent_fingerprint'];request.plan_fingerprint=p['resolved_plan_fingerprint'];request.catalog_fingerprint=p['catalog_fingerprint']
    report=pipeline.generate(request)
    assert len(report['charts'])>=4
    assert len({c['semantic_view_key'] for c in report['charts']})==len(report['charts'])
    for query in report['analytical_queries']:
        assert any(f['dimension']=='store_type' and set(f['value'])==set(KIOSKS) for f in query['filters'])
    ranking=next(q for q in report['analytical_queries'] if q['role']=='requested')
    rows=report['result_sets'][ranking['id']]['rows']
    connection=get_db_conn()
    try:
        connection.set_session(readonly=True)
        with connection.cursor() as cursor:
            cursor.execute('SELECT loai_diem_ban, COUNT(*) AS count FROM silver.chi_nhanh GROUP BY loai_diem_ban')
            counts=cursor.fetchall()
            # Independently authored SELECT, not SQL copied from the report.
            cursor.execute('''SELECT c.ma_chi_nhanh AS store_id, SUM(o.tong_tien) AS revenue
                FROM silver.chi_nhanh c JOIN silver.don_hang o ON o.co_so_ma=c.ma_chi_nhanh
                WHERE c.loai_diem_ban IN (%s,%s) AND o.trang_thai_don_hang IN (%s,%s)
                GROUP BY c.ma_chi_nhanh ORDER BY revenue DESC, c.ma_chi_nhanh LIMIT 10''',
                (*KIOSKS,'HOAN_THANH','DANG_GIAO'))
            oracle=cursor.fetchall()
        assert {r['store_id']:Decimal(str(r['store_revenue'])) for r in rows}=={r['store_id']:Decimal(str(r['revenue'])) for r in oracle}
    finally:connection.close()
    assert report['quality_assessment']==verify_saved_report(report,pipeline.catalog())
    return dict(measurement_scope='SCRIPTED_INTENT_LIVE_READ_ONLY_WAREHOUSE',LIVE_PROVIDER_REQUESTS=0,WAREHOUSE_WRITES=0,
        question=QUESTION,status=report['outcome'],warehouse_outlet_types=counts,ranking_independent_sql_matched=True,
        ranking_row_count=len(rows),query_count=len(report['analytical_queries']),chart_count=len(report['charts']),
        kpi_count=len(report['kpi_cards']),quality=report['quality_assessment'],
        charts=[{k:c.get(k) for k in ('id','title','chart_type','purpose','metric','x_field','role','semantic_view_key')} for c in report['charts']],
        queries=[{k:q.get(k) for k in ('id','subject','operation','metrics','group_by','filters','time')} for q in report['analytical_queries']],
        limitation='Scripted intent verifies resolver, SQL, scope and charts on live data; it does not measure provider language interpretation.')


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=Path('/tmp/kiosk-dashboard-audit.json'));args=parser.parse_args()
    result=audit();args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2,default=str)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k not in {'quality','charts','queries'}},ensure_ascii=False,default=str))

if __name__=='__main__':main()
