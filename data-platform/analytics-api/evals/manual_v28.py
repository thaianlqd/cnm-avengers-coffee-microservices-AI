"""Exact A/B/C qualification through production entry points; scripted meaning only."""
import json
import os
from pathlib import Path
from unittest.mock import patch
from evals.fixture_warehouse import FixtureWarehouse
from tests.test_hybrid_v28 import HybridTests, requirement, envelope, scripted, approve, SCENARIO_A
from services.analysis_quality_service import verify_saved_report

SCENARIO_B = '''So sánh hoạt động kinh doanh giữa TP.HCM và Hà Nội trong 90 ngày gần nhất.
Tôi muốn xem doanh thu, số đơn, giá trị đơn trung bình, tỷ lệ hoàn thành đơn,
cơ cấu phương thức thanh toán và Top 5 món bán chạy của từng thành phố.
Hãy chỉ ra khác biệt đáng chú ý nhất giữa hai thị trường.'''
SCENARIO_C = '''Đánh giá hiệu quả các voucher trong 60 ngày gần nhất.
Tôi muốn biết voucher nào được sử dụng nhiều nhất, voucher nào tạo ra nhiều
doanh thu nhất, giá trị giảm giá của từng voucher, số đơn có sử dụng voucher
và mức đóng góp của từng voucher vào tổng doanh thu có voucher.
Nếu dữ liệu không đủ để tính ROI thực sự thì phải nói rõ, không được tự suy
diễn chi phí marketing.'''


def meanings():
    def req(id,metrics,dims,**updates):
        return requirement(**{'id':id,'metric_ids':metrics,'dimension_ids':dims,'ranking':None,'analysis_kind':'aggregate','derived_features':[],**updates})
    cities=[{'dimension':'city','operator':'in','value':['Hồ Chí Minh','Hà Nội']}]
    btime={'kind':'rolling','amount':90,'unit':'day'}
    b=[req('business',['revenue','order_count','aov'],['city'],time=btime,filters=cities,derived_features=['group_gap']),
       req('completion',[],[],goal='Tỷ lệ hoàn thành đơn',time=btime,availability='unsupported',reason='definition_unavailable'),
       req('payment',['order_count'],['city','payment_method'],time=btime,filters=cities,analysis_kind='cross_tab'),
       req('top_products',['quantity_sold'],['product'],time=btime,filters=cities,analysis_kind='ranking',ranking={'limit':5,'metric_id':'quantity_sold','per_group':['city']})]
    ctime={'kind':'rolling','amount':60,'unit':'day'}
    c=[req('voucher_usage',['voucher_order_count'],['promotion'],time=ctime,analysis_kind='ranking',ranking={'limit':5,'metric_id':'voucher_order_count'},derived_features=['leader']),
       req('voucher_value',['voucher_revenue','discount_amount'],['promotion'],time=ctime,derived_features=['contribution_share']),
       req('roi',[],[],goal='ROI thực sự',time=ctime,availability='unsupported',reason='definition_unavailable')]
    return [('A',SCENARIO_A,envelope()),('B',SCENARIO_B,envelope(*b)),('C',SCENARIO_C,envelope(*c))]


def main():
    harness=HybridTests();harness.setUp()
    records=[]
    try:
        for id,question,meaning in meanings():
            warehouse=FixtureWarehouse(harness.catalog.overlay)
            try:
                p=harness.pipeline(scripted(meaning),executor=warehouse)
                req=harness.request(question)
                try:proposal=p.propose(req)
                except Exception:
                    print(json.dumps({'scenario':id,'issues':p.semantic_info.get('contract_issues')}));raise
                approve(req,proposal)
                req.accept_partial_scope=True
                report=p.generate(req)
                quality=verify_saved_report(report,harness.catalog)
                assert report['quality_assessment']==quality
                assert proposal['diagnostics']['provider_call_count']==1
                assert report['diagnostics']['provider_call_count']==0
                if quality['status'] == 'not_scored':
                    Path('/app/evals/v28-debug-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
                    print(json.dumps({'scenario':id,'quality':quality},ensure_ascii=False))
                assert quality['status'] in {'verified','partially_verified'}
                assert quality['score'] <= 90 and quality['accuracy_assessment']['accuracy_pct'] is None
                if id!='A':assert report['outcome']=='PARTIAL_AVAILABLE' and quality['grade']!='excellent'
                records.append({'scenario':id,'question':question,'proposal_outcome':proposal['outcome'],
                    'report_outcome':report['outcome'],'provider_calls':p.provider.call_count,'operations':len(report['analytical_queries']),
                    'coverage':report['resolved_requirement_coverage'],'quality':quality,
                    'context_chars':proposal['diagnostics']['total_context_chars'],'schema_chars':proposal['diagnostics']['schema_chars']})
            finally:warehouse.close()
    finally:harness.doCleanups()
    output=Path('/app/evals/v28-artifacts');output.mkdir(exist_ok=True)
    (output/'manual_qualification.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps([{'scenario':r['scenario'],'outcome':r['report_outcome'],'score':r['quality']['score'],'calls':r['provider_calls']} for r in records]))


if __name__=='__main__':main()
