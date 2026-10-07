import sys,json,traceback
sys.path.insert(0,'/app')
from evals.run_eval import *
from services.analysis_quality_service import verify_saved_report
catalog=AnalysisCatalog(physical_metadata())
for id in ('sales_trend_1','hourly_load_1','registrations_1','spend_snapshot_1','scoped_2'):
 c=next(c for c in load_cases() if c['id']==id);w=FixtureWarehouse(catalog.overlay);p=AnalysisPipeline(metadata_loader=physical_metadata,provider=scripted(c['scripted_decision']),executor=w,value_lookup=Mock(return_value=[]));req=AiTextToReportRequest(**c['input'],reference_date=date(2026,10,7))
 try:
  req.session_id=p.propose(req)['session_id'];r=p.generate(req);q=r['quality_assessment'];print(id, json.dumps({k:r[k] for k in ('kpi_cards','quality_assessment')},ensure_ascii=False))
  if q['score']<90:print('EVIDENCE',json.dumps(r['evidence'],ensure_ascii=False));print('NARRATIVE',json.dumps({k:r[k] for k in ('executive_summary','key_findings','dashboard_plan_input','ai_insights')},ensure_ascii=False))
 except Exception:print(id);traceback.print_exc()
