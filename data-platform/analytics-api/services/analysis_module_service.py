"""Reusable canonical meaning, freshly compiled against the current catalog."""
import re
import secrets
from copy import deepcopy
from services.analysis_catalog import AnalysisError
from services.analysis_module_repository import PostgresModuleRepository
from services.session_service import get_session, create_session
from services.analyst_contract import AnalyticalQuery, DashboardPlan
from services.value_grounding_service import dimension_values

VERSION = "2.6"


def safe_text(value):
    # Persistence privacy guard, not business intent parsing.
    if re.search(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+?\d[\s().-]*){9,}|(?:địa\s*chỉ|address)\s*[:=]|\b\d+\s+(?:đường|phố|street|road|avenue)\b", value, re.IGNORECASE):
        raise AnalysisError("module_privacy", "Sensitive literal cannot be persisted")
    value = value.strip()
    return value


class AnalysisModules:
    def __init__(self, repository=None):
        self.repository = repository or PostgresModuleRepository()

    def require_owner(self, owner):
        if not owner:
            raise AnalysisError("session", "Browser owner required")

    def public(self, module, catalog=None, summary=False):
        if not module: raise AnalysisError("session", "Owned module unavailable")
        result = deepcopy(module)
        result.pop("owner_key", None)
        d = result["definition"]
        result["compatibility"] = "ready" if catalog is None or d.get("schema_fingerprint") == catalog.fingerprint and d.get("approved_plan_version") == VERSION else "needs_review"
        result["domains"] = d.get("resolved_domains", [])
        if summary:
            result.pop("definition", None)
            result.pop("run_refs", None)
        return result

    def list(self, owner, search="", catalog=None):
        self.require_owner(owner)
        return [self.public(m,catalog,True) for m in self.repository.list(owner,search)]

    def resolve(self, owner, id, name, catalog):
        self.require_owner(owner)
        if id and name: raise AnalysisError("clarification", "Select one module reference")
        if name:
            candidates = [m for m in self.repository.list(owner,name.strip()) if m["name"].casefold() == name.strip().casefold()]
            if len(candidates) != 1:
                e = AnalysisError("clarification", "Select one saved problem by ID")
                e.known = [name]
                e.choices = [{"label": m["name"], "module_id": m["module_id"]} for m in candidates[:8]]
                raise e
            module = candidates[0]
        else: module = self.repository.get(owner,id)
        result = self.public(module,catalog)
        if result["compatibility"] != "ready": raise AnalysisError("module_needs_review", "Module definition requires review")
        return result

    def save(self, pipeline, session_id, name, description="", revision=None, parameterizable_scope=False):
        self.require_owner(pipeline.owner_id)
        session = get_session(session_id)
        if not session: raise AnalysisError("session", "Approved session required")
        pipeline.check_owner(session)
        with session.analysis_lock:
            if not session.approved or revision is not None and session.revision != revision:
                raise AnalysisError("approval_required", "Current approved report required")
            catalog = pipeline.catalog()
            if catalog.fingerprint != session.schema_fingerprint: raise AnalysisError("module_needs_review", "Changed schema")
            queries = []
            for a in session.agent_artifacts.values():
                q = a.query.model_copy(update={"replaces":None,"changed_fields":[]})
                if q.operation == "detail": raise AnalysisError("module_privacy", "Aggregate templates only")
                for f in q.filters:
                    d = catalog.registry["dimensions"][f.dimension]
                    values = f.value if isinstance(f.value,list) else [f.value]
                    # Only low-cardinality catalog enums, never discovered personal/entity IDs.
                    if not d.get("scope_selectable") or not set(values) <= set(dimension_values(catalog,f.dimension)):
                        raise AnalysisError("module_privacy", "Safe aggregate scopes only")
                queries.append(q.model_dump(mode="json"))
            inputs = {k:safe_text(v) for k,v in session.analysis_inputs.items()}
            if not inputs: inputs = {"original_question": safe_text(session.original_prompt), "analysis_context":"", "analysis_expectation":""}
            if not name.strip(): raise AnalysisError("clarification", "Module name required")
            strategy = session.input_time_strategy
            mode = strategy.get("mode", "auto")
            definition = {**inputs,"resolved_analysis_breadth":session.analysis_depth,
                "resolved_domains":session.report_response.get("interpretation",{}).get("domains",[]),
                "resolved_lenses":list(dict.fromkeys(q["lens_id"] for q in queries if q.get("lens_id"))),
                "analysis_components":deepcopy(session.analysis_components), "coverage_origin":session.coverage_origin,
                "canonical_templates":queries, "dashboard_preferences":deepcopy(session.dashboard_plan),
                "time_strategy":{"kind":"fixed" if mode == "custom" or mode == "auto" and all(q["time"]["kind"] == "range" for q in queries) else "dynamic", "selection":strategy},
                "scope_strategy":{"kind":"parameterizable" if parameterizable_scope else "fixed", "allowed_dimensions":sorted({f["dimension"] for q in queries for f in q["filters"]}) if parameterizable_scope else []},
                "approved_plan_version":VERSION,"schema_fingerprint":catalog.fingerprint}
            module = {"module_id":"am_"+secrets.token_hex(12),"name":safe_text(name),"description":safe_text(description),"definition":definition}
            created = self.repository.create(pipeline.owner_id,module)
            self.repository.record_run(pipeline.owner_id,created["module_id"],session.session_id,strategy)
            return self.public(self.repository.get(pipeline.owner_id,created["module_id"]) or created,catalog)

    def templates(self, module, context):
        d = module["definition"]
        queries = deepcopy(d["canonical_templates"])
        if not 1 <= len(queries) <= 8: raise AnalysisError("module_needs_review", "Invalid stored template budget")
        for q in queries:
            AnalyticalQuery.model_validate(q)
            q.update(replaces=None, changed_fields=[])
            period = context.get("required_period")
            if period is not None:
                q["time"] = {"kind":"relative","mode":"all_time"} if period["start"] is None else {"kind":"range", **period}
            for f in context.get("required_filters", []):
                if d["scope_strategy"]["kind"] != "parameterizable" or f["dimension"] not in d["scope_strategy"]["allowed_dimensions"]:
                    raise AnalysisError("query_scope", "Module scope is fixed")
                q["filters"] = [old for old in q["filters"] if old["dimension"] != f["dimension"]] + [f]
        return queries

    def prepare_context(self, pipeline, module, catalog, reference, context):
        # Proposal prepares server-owned meaning, never returns/reuses stored results.
        agent = pipeline.agent(catalog,reference,proposal=True)
        agent.queries.enforce_discovery = False
        templates = self.templates(module,context)
        for q in templates:
            # Stored safe enums were validated at save; fingerprint checked on load.
            agent.queries.prepare(q)
        context.setdefault("module", {"module_id":module["module_id"],"name":module["name"],"breadth":module["definition"]["resolved_analysis_breadth"]})
        concepts = sorted({f"{kind}:{id}" for q in templates for kind,id in [
            ("subject",q["subject"]), *[("metric",m) for m in q["metrics"]], *[("dimension",d) for d in q["group_by"]], *[("dimension",f["dimension"]) for f in q["filters"]]]})
        return deepcopy(agent.queries.pending), concepts

    def previous_report(self, pipeline, id, report_id):
        self.require_owner(pipeline.owner_id)
        module = self.public(self.repository.get(pipeline.owner_id,id))
        refs = [r.get("report_id") for r in module.get("run_refs", [])]
        if report_id not in refs:
            raise AnalysisError("session", "Owned module run required")
        session = get_session(report_id)
        if not session or not session.approved:
            raise AnalysisError("session", "Previous report expired; rerun the module")
        pipeline.check_owner(session)
        response = deepcopy(session.report_response)
        response["module_provenance"] = {"module_id":id,"name":module["name"],"mode":"previous_run"}
        return response

    def rerun(self, pipeline, id, time=None, scope=None):
        from common import AiTextToReportRequest
        catalog = pipeline.catalog()
        module = self.resolve(pipeline.owner_id,id,None,catalog)
        d = module["definition"]
        request = AiTextToReportRequest(question=d["original_question"],time=time or d["time_strategy"]["selection"] or {"mode":"auto"},analysis_scope=scope)
        reference = pipeline.reference(request,catalog)
        context = pipeline.ui_context(request,catalog,reference)
        agent = pipeline.agent(catalog,reference)
        agent.queries.enforce_discovery = False
        agent.queries.ui_context = context
        # All mandatory plans must validate BEFORE any execution.
        prepared = []
        for q in self.templates(module,context):
            try: prepared.append(agent.queries.prepare(q))
            except AnalysisError as error:
                if q["role"] == "requested": raise
                agent.omit(error)
        if not any(a.query.role == "requested" for a in prepared):
            raise AnalysisError("module_needs_review", "Requested templates missing")
        pipeline.enforce_ui({a.query.id:a for a in prepared},context)
        for a in prepared:
            try: agent.queries.run(a)
            except AnalysisError as e:
                if a.query.role == "requested": raise
                agent.omit(e)
        if pipeline.semantic_info.get("omitted_supporting_operation_count"):
            pipeline.semantic_info["limitations"].append({"reason":"omitted_supporting_operations","message":"Một phần phân tích hỗ trợ không phù hợp với kỳ hoặc phạm vi mới nên đã được bỏ qua."})
        artifacts = agent.queries.artifacts
        session = create_session(d["original_question"])
        session.analysis_components = deepcopy(d.get("analysis_components", []))
        session.coverage_origin = d.get("coverage_origin", "execution_only")
        session.partial_scope = any(c.get("status") != "planned" and c.get("requested_or_supporting") == "requested" for c in session.analysis_components)
        session.owner_id = pipeline.owner_id
        session.natural_input = True
        session.analysis_inputs = {k:d.get(k,"") for k in ("original_question","analysis_context","analysis_expectation")}
        session.input_time_strategy = request.time_range.model_dump(mode="json")
        session.ui_constraints = context
        session.module_provenance = {"module_id":module["module_id"],"name":module["name"],"mode":"rerun"}
        pipeline.semantic_info.update(analysis_depth=d["resolved_analysis_breadth"],analysis_breadth=d["resolved_analysis_breadth"],refinement_mode="module_rerun",provider_call_count=0,provider_attempt_count=0)
        plan = DashboardPlan.model_validate(d["dashboard_preferences"])
        plan.active_query_ids = list(artifacts)
        response = pipeline.report(artifacts,plan,catalog,session,reference)
        self.repository.record_run(pipeline.owner_id,id,session.session_id,request.time_range.model_dump(mode="json"))
        return response
