"""Offline V2.6 qualification: provider decisions are scripts, rows are fixtures."""
import json
import os
import unittest
from copy import deepcopy
from datetime import date
from unittest.mock import Mock, patch
from pydantic import ValidationError
from fastapi import FastAPI
from common import AiTextToReportRequest
from services.analysis_pipeline import AnalysisPipeline, safe_failure
from services.analysis_catalog import AnalysisCatalog, AnalysisError
from services.analysis_module_service import AnalysisModules
from services.analysis_module_repository import PostgresModuleRepository
from services.analytical_blueprint_service import materialize, BlueprintIssue
from services.domain_intelligence_service import DomainIntelligence
from services.session_service import get_session
from services.browser_owner import browser_owner, COOKIE
from tests.analysis_fixtures import physical_metadata, result, ranked_rows
from tests.test_one_shot_v24 import scripted
from tests.test_agent_v23 import fixture_executor


class MemoryModules:
    """Test repository only; production exclusively uses PostgreSQL."""
    def __init__(self): self.rows = {}; self.runs = []
    def list(self,owner,search=""):
        return [deepcopy(m) for (o,_),m in self.rows.items() if o == owner and not m.get("archived") and search.casefold() in m["name"].casefold()]
    def get(self,owner,id):
        m = self.rows.get((owner,id))
        return deepcopy(m) if m and not m.get("archived") else None
    def create(self,owner,module):
        self.rows[owner,module["module_id"]] = deepcopy(module)
        return deepcopy(module)
    def patch(self,owner,id,name=None,archived=None):
        if not self.get(owner,id): return None
        m = self.rows[owner,id]
        if name is not None: m["name"] = name
        if archived is not None: m["archived"] = archived
        return deepcopy(m)
    def record_run(self,owner,id,report_id,scope):
        self.runs.append((owner,id,report_id,scope))
        if (owner,id) in self.rows:
            m=self.rows[owner,id];m.update(last_report_id=report_id,last_run_at="fixture")
            m["run_refs"]=[{"report_id":report_id,"time_scope":scope}]+m.get("run_refs",[])[:19]
        return {"module_id":id}


def plan(*queries,breadth="focused"):
    return {"decision_type":"plan","analysis_breadth":breadth,"requested_operations":list(queries)}

def product(**kw): return {"id":"main","lens_id":"product_volume",**kw}


class NaturalV26Tests(unittest.TestCase):
    def setUp(self):
        for name in ("requests.sessions.Session.request","psycopg2.connect"):
            guard = patch(name,side_effect=AssertionError("External calls forbidden")); guard.start(); self.addCleanup(guard.stop)
        config = patch.dict(os.environ,{"AI_OFFLINE":"1","DATA_ANALYST_SEMANTIC_MANIFEST_MAX_CHARS":"10000","DATA_ANALYST_ONE_SHOT_CONTEXT_MAX_CHARS":"24000"});config.start();self.addCleanup(config.stop)
        self.catalog = AnalysisCatalog(physical_metadata())
        self.repo = MemoryModules()

    def pipeline(self,decision=None,executor=None,owner="browser-a"):
        return AnalysisPipeline(metadata_loader=physical_metadata,provider=scripted(decision or plan(product())), executor=executor or Mock(return_value=result(ranked_rows(10))), value_lookup=Mock(return_value=[]),owner_id=owner,module_repository=self.repo)

    def request(self,**kw): return AiTextToReportRequest(question="Đánh giá sản phẩm",reference_date=date(2026,10,6),**kw)

    def approved(self,**kw):
        p = self.pipeline();req=self.request(**kw);proposal=p.propose(req)
        req.session_id=proposal["session_id"];r=p.generate(req)
        return p,req,r

    def test_question_only_and_legacy_boundaries(self):
        req=self.request();self.assertTrue(req.natural_input);self.assertEqual(req.time_range.mode,"auto")
        old=AiTextToReportRequest(prompt="Legacy");self.assertFalse(old.natural_input);self.assertIsNone(old.time_range)
        for bad in ({"question":" "},{"question":"A","prompt":"B"},{"question":"X","time":{"mode":"today"},"time_range":{"mode":"auto"}}):
            with self.assertRaises(ValidationError): AiTextToReportRequest.model_validate(bad)

    def test_lens_only_ranking_defaults_approval_no_provider(self):
        p,req,r=self.approved()
        q=r["analytical_queries"][0]
        self.assertEqual((q["operation"],q["group_by"],q["ranking"]["top_n"]),("ranking",["product"],10))
        self.assertEqual(p.provider.call_count,1);self.assertEqual(p.executor.call_count,1)
        self.assertGreaterEqual(len(r["charts"]),1)
        self.assertEqual(r["analysis_breadth"],"focused")
        self.assertEqual(r["diagnostics"]["provider_call_count"],0)

    def test_four_input_sections_optional_context_and_model_breadth(self):
        for breadth in ("focused","deep","comprehensive"):
            p=self.pipeline(plan(product(),breadth=breadth));req=self.request(analysis_context="Chỉ Hà Nội",analysis_expectation="Tập trung chất lượng diễn giải")
            r=p.propose(req);payload=json.loads(p.provider.requests[0]["messages"][0]["content"])
            self.assertEqual(payload["question"],req.prompt);self.assertEqual(payload["analysis_context"],req.analysis_context)
            self.assertEqual(payload["analysis_expectation"],req.analysis_expectation);self.assertNotIn("analysis_depth",payload["ui"])
            self.assertEqual(r["diagnostics"]["analysis_breadth"],breadth);p.executor.assert_not_called()
        p=self.pipeline();p.propose(self.request());payload=json.loads(p.provider.requests[0]["messages"][0]["content"])
        self.assertNotIn("analysis_context",payload);self.assertNotIn("analysis_expectation",payload)

    def test_explicit_time_injected_but_conflicts_not_overwritten(self):
        for mode in ("current_month","previous_quarter","current_year","previous_year","all_time"):
            p=self.pipeline();r=p.propose(self.request(time={"mode":mode}))
            self.assertEqual(r["status"],"proposal_ready");p.executor.assert_not_called()
        p=self.pipeline(plan(product(time={"kind":"relative","mode":"previous_month"})))
        with self.assertRaises(AnalysisError) as caught: p.propose(self.request(time={"mode":"current_month"}))
        self.assertEqual(safe_failure(caught.exception)["issue"]["category"],"TIME_CONFLICT")
        self.assertEqual(p.provider.call_count,1);p.executor.assert_not_called()

    def test_deep_products_grouping_materializes_all_requested_components(self):
        queries=[product(ranking={"top_n":5}),{"id":"revenue","lens_id":"product_sales"},{"id":"mix","lens_id":"category_mix"},{"id":"trend","lens_id":"product_trend"}]
        p=self.pipeline(plan(*queries,breadth="deep"));req=self.request(time={"mode":"previous_quarter"})
        proposal=p.propose(req);canonical=proposal["proposal"]["analytical_queries"]
        self.assertEqual([q["group_by"] for q in canonical],[["product"],["product"],["category"],[]])
        self.assertEqual(len(canonical),4);p.executor.assert_not_called()
        p.executor=fixture_executor(canonical);req.session_id=proposal["session_id"];r=p.generate(req)
        self.assertGreaterEqual(len(r["charts"]),4);self.assertEqual(p.executor.call_count,4);self.assertEqual(p.provider.call_count,1)

    def test_blueprints_all_lenses_validate_or_true_ambiguity(self):
        intelligence=DomainIntelligence(self.catalog);count=0
        for profile in intelligence.available().values():
            for lens in profile["analytical_lenses"]:
                with self.subTest(lens=lens["id"]):
                    p=self.pipeline(plan({"id":"main","lens_id":lens["id"]}));
                    if not lens["blueprint"]["default_metric_refs"]:
                        with self.assertRaises(BlueprintIssue) as caught:p.propose(self.request())
                        issue=safe_failure(caught.exception)["issue"]
                        self.assertEqual(issue["category"],"NEEDS_CLARIFICATION")
                        self.assertTrue(issue["suggested_actions"])
                    else:
                        raw,_=materialize({"id":"main","lens_id":lens["id"]},self.catalog,intelligence)
                        agent=p.agent(self.catalog,date(2026,10,6),proposal=True);agent.queries.enforce_discovery=False
                        agent.queries.prepare({**raw,"role":"requested"})
                    count+=1
        self.assertEqual(count,38)

    def test_synthetic_lens_requires_metadata_group_without_prompt_branch(self):
        overlay=deepcopy(self.catalog.overlay);profile=overlay["analysis_registry"]["domain_intelligence"]["profiles"]["products"]
        lens=deepcopy(next(l for l in profile["analytical_lenses"] if l["id"]=="product_sales"))
        lens.update(id="synthetic_new_lens",business_label="Lens chưa từng xuất hiện")
        lens["blueprint"].update(required_grouping=["category"],default_grouping=["category"],allowed_groupings=[["category"]])
        profile["analytical_lenses"].append(lens)
        c=AnalysisCatalog(physical_metadata(),overlay);raw,rules=materialize({"id":"main","lens_id":"synthetic_new_lens"},c,DomainIntelligence(c))
        self.assertEqual(raw["group_by"],["category"]);self.assertIn("lens_required_grouping",rules)
        p=self.pipeline();agent=p.agent(c,date(2026,10,6),proposal=True);agent.queries.enforce_discovery=False;agent.queries.prepare({**raw,"role":"requested"})

    def test_no_false_history_and_no_silent_reduced_analysis(self):
        p=self.pipeline(plan({"id":"main","lens_id":"delivery_volume","operation":"trend"}))
        with self.assertRaises(AnalysisError) as caught:p.propose(self.request())
        r=safe_failure(caught.exception);self.assertEqual(r["issue"]["category"],"HISTORICAL_DATA_UNAVAILABLE")
        self.assertEqual(p.provider.call_count,1);p.executor.assert_not_called()

    def test_empty_results_actionable_scalar_no_filler(self):
        p=self.pipeline();req=self.request();proposal=p.propose(req);req.session_id=proposal["session_id"]
        p.executor=Mock(return_value={"rows":[],"columns":["product_id","product","quantity_sold"],"truncated":False,"count":0})
        with self.assertRaises(AnalysisError) as caught:p.generate(req)
        self.assertEqual(safe_failure(caught.exception)["issue"]["category"],"INSUFFICIENT_DATA")
        p=self.pipeline(plan({"id":"main","lens_id":"sales_overview"}),executor=Mock(return_value=result([{"revenue":1000}])))
        req=self.request();req.session_id=p.propose(req)["session_id"];r=p.generate(req)
        self.assertEqual(r["charts"],[]);self.assertTrue(r["kpi_cards"])

    def test_save_rerun_fresh_rows_time_override_zero_provider(self):
        p,req,r=self.approved();service=AnalysisModules(self.repo)
        module=service.save(p,r["session_id"],"Bài sản phẩm",revision=r["revision"])
        text=json.dumps(module["definition"])
        for forbidden in ("sql", "result_sets", "rows", "conversation_history"):self.assertNotIn(forbidden,text)
        provider=Mock(side_effect=AssertionError("Rerun must not call AI"));executor=Mock(return_value=result([{**row,"quantity_sold":row["quantity_sold"]+20} for row in ranked_rows(10)]))
        fresh=AnalysisPipeline(metadata_loader=physical_metadata,provider=provider,executor=executor,value_lookup=Mock(),owner_id="browser-a",module_repository=self.repo)
        fresh.reference=lambda request,catalog:date(2026,10,6)
        rerun=service.rerun(fresh,module["module_id"],time={"mode":"current_month"})
        provider.assert_not_called();self.assertEqual(executor.call_count,1);self.assertFalse(rerun["diagnostics"]["result_reuse"])
        self.assertEqual(rerun["table_data"]["rows"][0]["quantity_sold"],120)
        self.assertEqual(rerun["interpretation"]["time_range"]["start"],"2026-10-01")
        self.assertEqual(rerun["module_provenance"]["mode"],"rerun");self.assertEqual(len(self.repo.runs),2)

    def test_module_refinement_preserves_requested_work_and_uses_one_call(self):
        p,_,r=self.approved();module=AnalysisModules(self.repo).save(p,r["session_id"],"Sản phẩm")
        provider=scripted(plan({"id":"sales","lens_id":"product_sales"},breadth="deep"))
        new=AnalysisPipeline(metadata_loader=physical_metadata,provider=provider,executor=Mock(),value_lookup=Mock(),owner_id="browser-a",module_repository=self.repo)
        response=new.propose(self.request(analysis_module_id=module["module_id"]))
        self.assertEqual(provider.call_count,1);new.executor.assert_not_called()
        self.assertEqual(len(response["proposal"]["analytical_queries"]),2)
        state=json.loads(provider.requests[0]["messages"][0]["content"])["state"]
        self.assertEqual(len(state),1);self.assertIsNone(state[0]["result_ref"]);self.assertNotIn("rows",json.dumps(state))

    def test_owner_isolation_save_generate_refine_and_module_load(self):
        p,req,r=self.approved();service=AnalysisModules(self.repo);module=service.save(p,r["session_id"],"Private")
        other=self.pipeline(owner="browser-b")
        self.assertEqual(service.list("browser-b"),[])
        for action in (lambda:other.generate(req),lambda:service.save(other,r["session_id"],"Copy"),lambda:service.resolve("browser-b",module["module_id"],None,self.catalog)):
            with self.assertRaises(AnalysisError):action()
        other.provider.requests.clear();other.executor.assert_not_called()

    def test_stale_fingerprint_and_version_block_before_ai_sql(self):
        p,_,r=self.approved();module=AnalysisModules(self.repo).save(p,r["session_id"],"Stale")
        for field in ("schema_fingerprint","approved_plan_version"):
            original=self.repo.rows["browser-a",module["module_id"]]["definition"][field]
            self.repo.rows["browser-a",module["module_id"]]["definition"][field]="stale"
            fresh=self.pipeline()
            with self.assertRaises(AnalysisError) as caught:AnalysisModules(self.repo).rerun(fresh,module["module_id"])
            self.assertEqual(caught.exception.category,"module_needs_review");self.assertEqual(fresh.provider.call_count,0);fresh.executor.assert_not_called()
            self.repo.rows["browser-a",module["module_id"]]["definition"][field]=original

    def test_safe_scope_parameter_and_privacy(self):
        p,_,r=self.approved()
        session=get_session(r["session_id"])
        for text in ("x@example.com","0901234567","123 đường ABC","Address: private home"):
            with self.assertRaises(AnalysisError):AnalysisModules(self.repo).save(p,r["session_id"],text)
        p,_,r=self.approved();a=next(iter(get_session(r["session_id"]).agent_artifacts.values()))
        a.query=a.query.model_copy(update={"filters":[__import__('services.analysis_contract',fromlist=['Filter']).Filter(dimension="customer_id",value="personal-id")]})
        with self.assertRaises(AnalysisError):AnalysisModules(self.repo).save(p,r["session_id"],"Private scope")

    def test_scope_fixed_rejects_change_parameterized_safe_city_reruns(self):
        p=self.pipeline(plan(product(filters=[{"dimension":"city","value":"Hồ Chí Minh"}])));req=self.request()
        req.session_id=p.propose(req)["session_id"];r=p.generate(req);service=AnalysisModules(self.repo)
        fixed=service.save(p,r["session_id"],"Fixed")
        parameter=service.save(p,r["session_id"],"Parameter",parameterizable_scope=True)
        scope={"mode":"selected","filters":[{"dimension":"city","value":"Hà Nội"}]}
        fresh=self.pipeline()
        with self.assertRaises(AnalysisError):service.rerun(fresh,fixed["module_id"],scope=scope)
        fresh.executor.assert_not_called();self.assertEqual(fresh.provider.call_count,0)
        fresh=self.pipeline();r=service.rerun(fresh,parameter["module_id"],scope=scope)
        self.assertEqual(r["analytical_queries"][0]["filters"][0]["value"],"Hà Nội")
        self.assertEqual(fresh.provider.call_count,0);self.assertEqual(fresh.executor.call_count,1)

    def test_module_relative_clock_refreshes_and_archive_is_owned(self):
        p=self.pipeline(plan(product(time={"kind":"relative","mode":"current_month"})));req=self.request()
        req.session_id=p.propose(req)["session_id"];r=p.generate(req);service=AnalysisModules(self.repo)
        m=service.save(p,r["session_id"],"Monthly")
        fresh=self.pipeline();fresh.reference=lambda request,catalog:date(2026,11,7)
        r=service.rerun(fresh,m["module_id"])
        self.assertEqual(r["interpretation"]["time_range"]["start"],"2026-11-01")
        self.assertIsNone(self.repo.patch("browser-b",m["module_id"],archived=True))
        self.repo.patch("browser-a",m["module_id"],name="Renamed")
        self.assertEqual(service.list("browser-a")[0]["name"],"Renamed")
        self.repo.patch("browser-a",m["module_id"],archived=True)
        self.assertEqual(service.list("browser-a"),[])
        with self.assertRaises(AnalysisError):service.resolve("browser-a",m["module_id"],None,self.catalog)

    def test_snapshot_period_has_actionable_explicit_snapshot_choice(self):
        p=self.pipeline(plan({"id":"main","lens_id":"delivery_volume"}))
        with self.assertRaises(AnalysisError) as caught:p.propose(self.request(time={"mode":"current_month"}))
        issue=safe_failure(caught.exception)["issue"]
        self.assertEqual(issue["category"],"HISTORICAL_DATA_UNAVAILABLE")
        self.assertTrue(any(a["type"]=="snapshot" for a in issue["suggested_actions"]))
        p.executor.assert_not_called();self.assertEqual(p.provider.call_count,1)

    def test_previous_report_owner_and_run_reference_checked_without_new_queries(self):
        p,_,r=self.approved();service=AnalysisModules(self.repo);m=service.save(p,r["session_id"],"History")
        previous=service.previous_report(p,m["module_id"],r["session_id"])
        self.assertEqual(previous["module_provenance"]["mode"],"previous_run")
        for action in (lambda:service.previous_report(self.pipeline(owner="browser-b"),m["module_id"],r["session_id"]),lambda:service.previous_report(p,m["module_id"],"unrelated")):
            with self.assertRaises(AnalysisError):action()
        self.assertEqual(p.provider.call_count,1);self.assertEqual(p.executor.call_count,1)

    def test_module_http_contract_rejects_raw_sql_and_client_plan(self):
        from routers import ai,analysis_modules
        from routers.analysis_modules import SaveModule,RerunModule
        for extra in ({"sql":"SELECT 1"},{"canonical_templates":[]}):
            with self.assertRaises(ValidationError):SaveModule.model_validate({"session_id":"approved","name":"Name",**extra})
        with self.assertRaises(ValidationError):RerunModule.model_validate({"question":"Use AI"})
        app=FastAPI();app.include_router(ai.router);app.include_router(analysis_modules.router)
        paths=app.openapi()["paths"]
        self.assertIn("post",paths["/api/ai/modules"]);self.assertIn("patch",paths["/api/ai/modules/{module_id}"])
        self.assertIn("post",paths["/api/ai/modules/{module_id}/rerun"])

    def test_name_resolution_unique_ambiguous_and_no_automatic_injection(self):
        p,_,r=self.approved();service=AnalysisModules(self.repo);m=service.save(p,r["session_id"],"Exact name")
        self.assertEqual(service.resolve("browser-a",None,"Exact name",self.catalog)["module_id"],m["module_id"])
        service.save(p,r["session_id"],"Exact name")
        with self.assertRaises(AnalysisError) as caught:service.resolve("browser-a",None,"Exact name",self.catalog)
        self.assertEqual(len(caught.exception.choices),2)
        fresh=self.pipeline();fresh.propose(self.request());payload=json.loads(fresh.provider.requests[0]["messages"][0]["content"])
        self.assertEqual(payload["state"],[]);self.assertNotIn("module",payload["ui"])

    def test_repository_sql_owner_predicates_parameterized(self):
        repository=PostgresModuleRepository();repository.execute=Mock(return_value=[])
        repository.list("owner","' OR TRUE --");repository.get("owner","id");repository.patch("owner","id",name="new");repository.record_run("owner","id","report",{})
        for c in repository.execute.call_args_list:
            sql,params=c.args[:2];self.assertIn("owner_key=%s",sql);self.assertIn("owner",params);self.assertNotIn("' OR TRUE --",sql)
        self.assertIn("LIMIT 50",repository.execute.call_args_list[0].args[0])

    def test_browser_cookie_opaque_http_only_and_csrf(self):
        from starlette.requests import Request
        from starlette.responses import Response
        request=Request({"type":"http","method":"GET","scheme":"https","path":"/api/ai/modules","headers":[(b'host',b'example.test')],"server":("example.test",443),"query_string":b''})
        response=Response();owner=browser_owner(request,response)
        self.assertEqual(len(owner),64);cookie=response.headers["set-cookie"]
        self.assertIn("HttpOnly",cookie);self.assertIn("Secure",cookie);self.assertIn("SameSite=lax",cookie)
        request=Request({"type":"http","method":"POST","scheme":"https","path":"/api/ai/modules","headers":[(b'host',b'example.test'),(b'origin',b'https://attacker.test')],"server":("example.test",443),"query_string":b''})
        with self.assertRaises(Exception):browser_owner(request,Response())

    def test_actionable_safe_model_never_echoes_validation_sql_or_provider(self):
        e=AnalysisError("invalid_analysis_contract","SELECT password FROM users; provider secret")
        response=safe_failure(e)
        self.assertEqual(response["issue"]["category"],"PLAN_FAILED")
        self.assertNotIn("password",json.dumps(response));self.assertTrue(response["issue"]["suggested_actions"])

    def test_body_budget_both_adapters_with_multiple_strong_domains(self):
        self.enterContext(patch.dict(os.environ,{"DATA_ANALYST_ONE_SHOT_CONTEXT_MAX_CHARS":"32000"}))
        for context in ("", "chi nhánh sản phẩm voucher thanh toán", "khách hàng sản phẩm voucher thanh toán giao hàng"):
            p=self.pipeline();r=p.propose(self.request(analysis_context=context,analysis_expectation="Phân tích toàn diện nhiều góc nhìn"))
            self.assertEqual(p.provider.call_count,1)
            for size in r["diagnostics"]["provider_body_chars"].values():self.assertLessEqual(size,32000)
            self.assertEqual(r["diagnostics"]["contract_repair_count"],0)
