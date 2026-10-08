"""V2.6 offline matrix; no application startup, external HTTP or real DB access."""
import json
import os
import sys
from pathlib import Path
from copy import deepcopy
from datetime import date
from unittest.mock import Mock, patch
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT))
from common import AiTextToReportRequest
from services.analysis_pipeline import safe_failure
from tests.archive_planner import ArchivedGraphPipeline as AnalysisPipeline
from services.analysis_catalog import AnalysisError
from services.analysis_module_service import AnalysisModules
from services.agent_provider import NativeAgentProvider
from services import llm_service
from services.semantic_manifest_service import compact
from tests.analysis_fixtures import physical_metadata
from tests.test_agent_v23 import fixture_executor
from tests.test_natural_v26 import MemoryModules, plan
from tests.test_one_shot_v24 import scripted

HCM={"dimension":"city","value":"Hồ Chí Minh"}
CITIES={"dimension":"city","operator":"in","value":["Hồ Chí Minh","Hà Nội"]}

def lens(id,choice,**kw):return {"id":id,"lens_id":choice,**kw}

def qualify():
    repo=MemoryModules();records=[];approved={}
    sales=[lens("main","sales_overview",filters=[HCM],time={"kind":"relative","mode":"current_month"}),
        lens("trend","sales_trend",parent_id="main"),lens("products","product_volume",parent_id="main"),lens("categories","category_mix",parent_id="main")]
    business=[lens("sales","sales_overview"),lens("history","sales_trend"),lens("stores","store_performance",metrics=["store_revenue"]),lens("products","product_volume"),lens("vouchers","voucher_usage"),lens("payments","payment_mix")]
    comprehensive=[*business,lens("category","category_mix"),lens("buyers","buying_customers")]
    cases=[
        ("A", "Top 5 sản phẩm bán chạy nhất tại TP.HCM", [lens("main","product_volume",ranking={"top_n":5},filters=[HCM])], "focused", "", "", "auto"),
        ("B", "Phân tích tình hình bán hàng TP.HCM tháng này", sales, "deep", "", "", "auto"),
        ("C", "Phân tích sâu sản phẩm TP.HCM quý trước: xếp hạng, doanh thu, cơ cấu danh mục, xu hướng số lượng", [lens("rank","product_volume",ranking={"top_n":5}),lens("revenue","product_sales"),lens("mix","category_mix"),lens("trend","product_trend")], "deep", "", "", "previous_quarter"),
        ("D", "Phân tích hoạt động kinh doanh quý trước",business,"deep","TP.HCM và Hà Nội; chi nhánh, sản phẩm, voucher, thanh toán","","previous_quarter"),
        ("E", "Phân tích hoạt động tháng trước",comprehensive,"comprehensive","","Phân tích toàn diện, nhóm góc nhìn và điểm cần chú ý","previous_month"),
        ("F", "Xu hướng shipper tháng này",[lens("main","delivery_volume",operation="trend")],"deep","","","current_month"),
        ("J", "Đánh giá toàn diện hoạt động kinh doanh quý trước",comprehensive,"comprehensive","TP.HCM so với Hà Nội: chi nhánh, sản phẩm, khách hàng, voucher, thanh toán","Nhiều biểu đồ và điểm cần chú ý","previous_quarter"),
    ]
    for name,question,operations,breadth,context,expectation,period in cases:
        operations=deepcopy(operations)
        if name in {"C","D","E","J"}:
            for q in operations:q["filters"]=[HCM] if name=="C" else [CITIES]
        requested=[q for q in operations if not q.get("parent_id")];support=[q for q in operations if q.get("parent_id")]
        value=plan(*requested,breadth=breadth);value["supporting_operations"]=support
        p=AnalysisPipeline(metadata_loader=physical_metadata,provider=scripted(value),executor=Mock(),value_lookup=Mock(return_value=[]),owner_id="fixture-owner",module_repository=repo)
        req=AiTextToReportRequest(question=question,time={"mode":period},analysis_context=context,analysis_expectation=expectation,reference_date=date(2026,10,6))
        try:
            proposal=p.propose(req);p.executor.assert_not_called();d=proposal["diagnostics"]
            request=p.provider.requests[0]
            sizes={"native":len(compact(NativeAgentProvider()._gemini_body(**request))),"compat":len(compact(NativeAgentProvider()._gemini_compat_body(**request,model=next(iter(llm_service.GEMINI_MODELS),"configured_model"))))}
            assert sizes==d["provider_body_chars"] and max(sizes.values())<=24000, (name,sizes,d["provider_body_chars"])
            queries=proposal["proposal"]["analytical_queries"]
            assert len([q for q in queries if q["role"]=="requested"])==len(requested)
            p.executor=fixture_executor(queries);req.session_id=proposal["session_id"];report=p.generate(req)
            assert p.provider.call_count==1 and report["diagnostics"]["provider_call_count"]==0
            records.append({"scenario":name,"status":report["status"],"breadth":breadth,"provider_calls":1,"approval_provider_calls":0,"proposal_analytical_queries":0,"approval_fixture_queries":p.executor.call_count,"chart_count":len(report["charts"]),"chart_families":list(dict.fromkeys(c["chart_type"] for c in report["charts"])),"requested_operations":len(requested),"supporting_operations":d["supporting_operation_count"],"normalizations":d["contract_normalizations"],"body_chars":sizes,"headroom":24000-max(sizes.values()),"schema_chars":d["decision_schema_chars"],"domain_chars":d["domain_context_chars"],"state_chars":d["session_state_chars"],"manifest_chars":d["semantic_manifest_chars"],"actual_input_tokens":None,"actual_output_tokens":None})
            approved[name]=(p,req,report)
        except AnalysisError as error:
            if name!="F":raise AssertionError((name,error.category,getattr(error,"issues",[]),list(p._last_agent.queries.pending),p.semantic_info.get("strong_domain_candidates"),p.semantic_info.get("detailed_domain_ids"))) from error
            failure=safe_failure(error,p.calls,p.semantic_info);p.executor.assert_not_called()
            assert failure["issue"]["category"]=="HISTORICAL_DATA_UNAVAILABLE"
            records.append({"scenario":name,"status":failure["status"],"issue_category":failure["issue"]["category"],"provider_calls":p.provider.call_count,"analytical_queries":0,"automatic_reduced_analysis":False})
    p,req,report=approved["B"];modules=AnalysisModules(repo);module=modules.save(p,report["session_id"],"Đánh giá TP.HCM hàng tháng",revision=report["revision"])
    records.append({"scenario":"G","status":"saved","version":module["definition"]["approved_plan_version"],"raw_sql_stored":False,"result_rows_stored":False})
    canon=module["definition"]["canonical_templates"]
    rerun=AnalysisPipeline(metadata_loader=physical_metadata,provider=Mock(side_effect=AssertionError("No AI in rerun")),executor=fixture_executor(canon),value_lookup=Mock(),owner_id="fixture-owner",module_repository=repo)
    # Fixed reference supplied only for fixture SQL reproducibility; production uses today's catalog clock.
    rerun.reference=lambda req,catalog:date(2026,10,6)
    current=modules.rerun(rerun,module["module_id"])
    rerun.provider.assert_not_called();assert not current["diagnostics"]["result_reuse"]
    records.append({"scenario":"H","status":current["status"],"provider_calls":0,"fixture_queries":rerun.executor.call_count,"result_reuse":False})
    refine=AnalysisPipeline(metadata_loader=physical_metadata,provider=scripted(plan(lens("voucher","voucher_usage",filters=[HCM],time={"kind":"relative","mode":"current_month"}),breadth="deep")),executor=Mock(),value_lookup=Mock(),owner_id="fixture-owner",module_repository=repo)
    next_req=AiTextToReportRequest(question="Thêm phân tích voucher",analysis_module_id=module["module_id"],reference_date=date(2026,10,6))
    proposal=refine.propose(next_req);refine.executor.assert_not_called();assert refine.provider.call_count==1
    assert len(proposal["proposal"]["analytical_queries"])==len(canon)+1
    records.append({"scenario":"I","status":proposal["status"],"provider_calls":1,"proposal_analytical_queries":0,"retained_requested_operations":sum(q["role"]=="requested" for q in canon),"body_chars":proposal["diagnostics"]["provider_body_chars"],"state_chars":proposal["diagnostics"]["session_state_chars"]})
    return sorted(records,key=lambda r:r["scenario"])

if __name__=="__main__":
    with patch.dict(os.environ,{"AI_OFFLINE":"1","DATA_ANALYST_SEMANTIC_MANIFEST_MAX_CHARS":"10000","DATA_ANALYST_ONE_SHOT_CONTEXT_MAX_CHARS":"24000"}),patch("requests.sessions.Session.request",side_effect=AssertionError("External HTTP forbidden")),patch("psycopg2.connect",side_effect=AssertionError("Live DB forbidden")):
        records=qualify()
    output=ROOT/'docs/V26_QUALIFICATION.json'
    output.write_text(json.dumps({"pipeline_version":"2.6","real_provider_calls":0,"external_embedding_calls":0,"live_db_mutations":0,"live_db_queries":0,"note":"Scripted decisions and fixture rows verify contracts, not live language interpretation. Actual provider token counts are unreported, not estimates.","scenarios":records},ensure_ascii=False,indent=2)+'\n')
    print(f'{len(records)} offline scenarios passed: {output}')
