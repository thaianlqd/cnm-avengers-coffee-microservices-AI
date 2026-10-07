"""Offline context and pure-verifier profile. Never a provider latency benchmark."""
import argparse
import json
import os
import sys
from pathlib import Path
from datetime import date
from statistics import median
from time import perf_counter
from unittest.mock import Mock, patch
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import AiTextToReportRequest
from services.analysis_pipeline import AnalysisPipeline
from tests.analysis_fixtures import physical_metadata
from tests.test_one_shot_v24 import scripted

SCENARIOS = {
    'product': ('Phân tích sản phẩm tại TP.HCM: sản phẩm bán chạy, doanh thu sản phẩm, cơ cấu danh mục và xu hướng sản lượng.', '', ''),
    'six_domains': ('So sánh doanh thu đơn hàng giữa thành phố Hồ Chí Minh và Hà Nội (cả cửa hàng chính và hệ thống kiosk)',
                    'Tập trung vào 2 thành phố Hồ Chí Minh và Hà Nội',
                    'Đa góc nhìn, tập trung phân tích về dòng sản phẩm, đơn hàng, khách hàng, voucher và liên hệ về cả shipper'),
    'unknown_vocabulary': ('zzzz unknown vocabulary', '', ''),
}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path);args=parser.parse_args()
    rows=[]
    with patch.dict(os.environ, {'AI_OFFLINE':'1','DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN':'1','DATA_ANALYST_ENABLE_CONTRACT_REPAIR':'0'}), patch('requests.sessions.Session.request',side_effect=AssertionError('HTTP forbidden')), patch('psycopg2.connect',side_effect=AssertionError('Live DB forbidden')):
        for name,(question,context,expectation) in SCENARIOS.items():
            decision={'decision_type':'plan','analysis_breadth':'focused','requested_operations':[{'id':'main','lens_id':'sales_overview'}]}
            p=AnalysisPipeline(metadata_loader=physical_metadata,provider=scripted(decision),executor=Mock(side_effect=AssertionError('No execution')),value_lookup=Mock(return_value=[]))
            request=AiTextToReportRequest(question=question,analysis_context=context,analysis_expectation=expectation,time={'mode':'previous_month'},reference_date=date(2026,10,7))
            try:
                response=p.propose(request);d=response['diagnostics']
                rows.append({'scenario':name,'status':response['status'],**{k:d.get(k) for k in ('provider_body_chars','context_char_budget','context_hard_char_budget','context_budget_expanded','global_lens_directory_chars','coverage_contract_chars','example_intent_chars','detailed_domain_ids')}})
            except Exception as exc:rows.append({'scenario':name,'status':getattr(exc,'category',type(exc).__name__)})
        profile={}
        try:
            from services.analysis_catalog import AnalysisCatalog
            from services.analysis_quality_service import verify_saved_report
            from evals.fixture_warehouse import FixtureWarehouse
            from evals.golden import load_cases
            catalog=AnalysisCatalog(physical_metadata());case=next(c for c in load_cases() if c['id']=='multi_8')
            warehouse=FixtureWarehouse(catalog.overlay)
            try:
                p=AnalysisPipeline(metadata_loader=physical_metadata,provider=scripted(case['scripted_decision']),executor=warehouse,value_lookup=Mock(return_value=[]))
                request=AiTextToReportRequest(**case['input'],reference_date=date(2026,10,7));request.session_id=p.propose(request)['session_id'];report=p.generate(request)
                samples=[]
                for _ in range(20):
                    start=perf_counter();score=verify_saved_report(report,catalog);samples.append((perf_counter()-start)*1000)
                profile={'samples':len(samples),'median_ms':round(median(samples),2),'p95_ms':round(sorted(samples)[18],2),'score':score['score'],'result_rows':sum(len(r['rows']) for r in report['result_sets'].values()),'interpretation':'Pure stored-report verification, local synthetic fixture; not provider latency or worst-case capacity.'}
            finally:warehouse.close()
        except ImportError:profile={'status':'unavailable_in_baseline'}
    result={'contexts':rows,'verification':profile,'real_provider_calls':0,'embedding_calls':0,'live_db_mutations':0}
    if args.output:args.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(result,ensure_ascii=False))

if __name__=='__main__':main()
