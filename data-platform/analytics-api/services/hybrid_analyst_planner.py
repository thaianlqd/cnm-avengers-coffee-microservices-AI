"""Meaning → verifiable server plan, with bounded field-targeted recovery."""
import json
import logging
import os
import random
import time
from copy import deepcopy
from pydantic import ValidationError
from services.one_shot_planner import OneShotPlanner
from services.analysis_catalog import AnalysisError
from services.analysis_intent import AnalysisIntentEnvelope, IntentRequirement, AnalysisIntentDelta, intent_tool, repair_tool
from services.analytical_resolver import AnalyticalResolver, ResolutionIssues, digest, requirement_meaning
from services.request_anchors import request_anchors, verify_anchors, refinement_anchors
from services.value_grounding_service import dimension_values
from services.analyst_clarification import UnresolvedFilter
from services.semantic_manifest_service import compact, char_limit
from services.analyst_contract import DashboardPlan
from services.domain_intelligence_service import DEPTH_POLICIES
from services.agent_provider import NativeAgentProvider

logger = logging.getLogger("ai-analytics")
SYSTEM = """Extract Vietnamese business analytical meaning into one intent envelope. Each requirement states a distinct user goal once. Use semantic metric/dimension IDs in the vocabulary. lens_hint is optional advice. No SQL, subjects, executable IDs, parents, query roles, coverage mappings, charts or reasoning. Preserve every explicit metric, filter, time, ranking and derived feature. Question is authoritative; context/expectation guide business focus/presentation and never override it. Structured UI time/scope outrank question; omitted time means all_time. Separate incompatible populations as business requirements without substituting meaning. Unsupported definitions (ROI without costs, forecasts) remain explicit unavailable requirements with controlled reasons. A clarification names only genuinely missing business meaning. Top N is not a complete population; contribution_share uses a server-verified denominator. No invented values, causes or history. IDs label user requirements only."""
REPAIR_SYSTEM = """Repair ONLY the identified semantic fields/requirements. Return one intent envelope with requirement id and only the corrected fields. Omitted fields are preserved by the server. Do not resend unaffected requirements. For an omitted derived feature, add it to a compatible existing requirement using only id and derived_features, preserving existing features. Add a new requirement only for genuinely omitted analytical work. All other fields are frozen. Use the bounded vocabulary or state a genuine clarification/limitation. No SQL, executable graph, reasoning or results."""
SYSTEM += " A user instruction not to conclude ROI/causality is a guardrail, not a request to calculate ROI. For a feature applying to one of several displayed metrics, use feature_metrics. A table of catalog aggregations is aggregate, not raw detail. Greetings or text without an analytical goal use clarification reason not_analytical_request and missing_fields:[analysis_goal]."


def apply_delta(intent, raw):
    """Apply one atomic patch; repeated updates may agree or affect disjoint fields.

    Ranking is a nested patch (changing N keeps its metric/direction/group).
    Lists and time specifications are replacements, never concatenated or
    combined across different populations/time kinds. Conflicts never use
    last-write-wins and the caller's baseline is never mutated.
    """
    delta = AnalysisIntentDelta.model_validate(raw)
    requirements = {r.id:r.model_copy(deep=True) for r in intent.requirements}
    grouped = {}
    allowed = set(IntentRequirement.model_fields)-{"id"}
    def merge(left, right, id, field=None):
        result = deepcopy(left)
        for key, value in right.items():
            target = field or key
            if key in result and result[key] != value:
                if isinstance(result[key],dict) and isinstance(value,dict) and (field == 'ranking' or key == 'ranking'):
                    result[key] = merge(result[key],value,id,target)
                    continue
                raise ResolutionIssues([{"requirement_id":id,"field":target,"code":"duplicate_delta"}])
            result[key] = deepcopy(value)
        return result
    for change in delta.changes:
        id = change.requirement_id
        if id in grouped:
            prior = grouped[id]
            if prior.action != 'update' or change.action != 'update' or change.requirement:
                raise ResolutionIssues([{"requirement_id":id,"field":"changes","code":"duplicate_delta"}])
            prior.changes = merge(prior.changes,change.changes,id)
        else:
            grouped[id] = change.model_copy(deep=True)
    for id, change in grouped.items():
        if change.action == "add":
            if id in requirements or not change.requirement or change.requirement.id != id or change.changes:
                raise ResolutionIssues([{"requirement_id":id,"field":"requirement","code":"invalid_delta"}])
            requirements[id] = change.requirement
        elif change.action == "remove":
            if id not in requirements or change.requirement or change.changes:
                raise ResolutionIssues([{"requirement_id":id,"field":"requirement_id","code":"unknown_requirement"}])
            del requirements[id]
        else:
            if id not in requirements or change.requirement or not set(change.changes) <= allowed:
                raise ResolutionIssues([{"requirement_id":id,"field":"changes","code":"invalid_delta"}])
            patch = deepcopy(change.changes)
            baseline = requirements[id].model_dump(mode="json")
            if isinstance(patch.get('ranking'),dict) and isinstance(baseline.get('ranking'),dict):
                patch['ranking'] = {**baseline['ranking'],**patch['ranking']}
            requirements[id] = IntentRequirement.model_validate({**baseline,**patch})
    if not requirements:
        raise AnalysisError("clarification", "Refinement removed all analytical requirements")
    return AnalysisIntentEnvelope(decision="analyze",requirements=list(requirements.values()))


class HybridAnalystPlanner(OneShotPlanner):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.diagnostics.update(planning_mode="hybrid_verifiable",pipeline_version="2.8",
            primary_call_count=0,semantic_repair_count=0,targeted_resolution_count=0,transport_retry_count=0,
            failure_stage=None,failure_requirement_id=None,failure_field=None,failure_code=None)
        self.resolved = None

    def vocabulary(self, domains=None):
        index = AnalyticalResolver(self.catalog,self.reference).index
        domains = set(domains or index.domains)
        metrics = sorted({m for id,p in index.domains.items() if id in domains for m in p["metric_refs"] if m in index.metrics})
        dims = sorted({d for m in metrics for d in index.metrics[m]["dimensions"]} |
            {d for id,p in index.domains.items() if id in domains for s in p['primary_subjects'] if s in index.subjects
             for d in index.subjects[s].get('detail_columns',[])})
        r = self.catalog.registry
        from services.request_anchors import metric_equivalents
        equivalents = metric_equivalents(self.catalog)
        return {"metric_columns":"id,label,unit,historical,definition,population,compatible_dimensions",
            "metrics":[[m,r["metrics"][m]["business_name"],r["metrics"][m]["unit"],index.metrics[m]["historical"],
                        r["metrics"][m].get("business_definition", ""),r["metrics"][m].get("population_definition", ""),
                        index.metrics[m]['dimensions']] for m in metrics],
            "equivalent_metrics":[sorted(group) for group in {tuple(sorted(equivalents[m])) for m in metrics if len(equivalents[m])>1}],
            "distinct_metric_concepts":[g for g in r.get('metric_concept_groups',[]) if set(g).intersection(metrics)],
            "shape_rules":{"trend":"Set granularity; group only independent business axes, not raw timestamps.",
                "detail":"Only raw row projections, without metric_ids. A table of SUM/COUNT/AVG by voucher/product/etc is aggregate, not detail.",
                "ranking":"Set ranking.limit and ranking.metric_id. Additional displayed metrics do not change the ordering criterion.",
                "features":"Include requested calculations. Set feature_metrics, e.g. contribution_share:[voucher_revenue] with count/discount/aov displayed. Averages cannot form shares. leader/top_gap need ranking.metric_id; separate leader metrics need separate ranking requirements. Wrong feature shape is repairable, not unavailable data.",
                "metric_definitions":"Honor request_anchors IDs. Concept neighbors are not equivalents: aov SUM/COUNT(*) vs store_aov AVG ignores NULL.",
                "constraints":"Do not turn a prohibition such as không kết luận ROI into a requirement to calculate ROI. Preserve it as a conclusion constraint. Only a positive request for an unavailable calculation needs an unavailable requirement.",
                "clarification":"Use not_analytical_request for greetings/nonsense without an analytical goal. missing_fields must name genuinely missing metric_ids, dimension_ids, time, filters or analysis_goal. Do not request fields already explicit in the question."},
            "dimensions":[[d,r["dimensions"][d]["business_name"]] for d in dims],
            "values":{d:dimension_values(self.catalog,d) for d in dims if dimension_values(self.catalog,d)},
            "features":{id:meta["shape"] for id,meta in r.get("derived_features",{}).items()},
            "unavailable_definitions":r.get("unsupported_capabilities",{})}

    def context_payload(self, question, context):
        candidates = self.intelligence.candidates(question,context.get("domain","auto"),"deep",[a.query.subject for a in self.queries.previous.values()])
        required = [c["id"] for c in candidates if c["protected"]]
        selected = list(dict.fromkeys(required+[c["id"] for c in candidates[:3]]))
        index = AnalyticalResolver(self.catalog,self.reference).index
        payload = {"question":question,"reference_date":self.reference.isoformat(),"timezone":self.catalog.registry["timezone"],
            "ui":{k:v for k,v in context.items() if k not in {"semantic_intent","original_question","current_visuals","revision","initial_semantic_intent","semantic_history"}},
            "domain_directory":self.intelligence.directory(index.domains),"vocabulary":self.vocabulary(selected),
            "global_metric_directory":[[id,m["business_name"]] for id,m in self.catalog.registry["metrics"].items()],
            "request_anchors":self.anchors}
        if context.get("semantic_intent"):
            payload["current_intent"] = context["semantic_intent"]
        from services.semantic_example_service import confirmed_examples
        payload['confirmed_examples'] = confirmed_examples(selected, self.catalog, limit=1)
        profiles=self.queries.capacity_planner.profiles
        relevant_dims={d for m in self.vocabulary(selected)['metrics'] for d in m[-1]}
        payload['value_profiles']=[dict(dimension=d, distinct_upper_bound=p.get('distinct_upper_bound'),
            identity=p.get('canonical_identity'), values=p.get('common_values',[])[:8])
            for d,p in sorted(profiles.items()) if d in relevant_dims and p.get('distinct_upper_bound') is not None][:8]
        self.diagnostics.update(required_domain_pack_ids=required,supporting_domain_pack_ids=[d for d in selected if d not in required],
            detailed_domain_ids=selected,pruned_optional_domain_ids=[],retrieval_confidence="high" if required else "low",
            retrieval_candidate_count=len(candidates),global_domain_count=len(index.domains))
        return payload

    def read_response(self, response, delta=False):
        calls = response.get("calls")
        if not calls:
            if response.get("offline"):
                code="provider_offline"
            elif response.get("configuration_missing"):
                code="provider_configuration_missing"
            else:
                code=(response.get("attempts") or [{}])[-1].get("error_category","provider_unavailable")
                code={"invalid_tool_response":"provider_invalid_json","provider_http":"provider_unavailable","provider_schema":"provider_schema_invalid"}.get(code,code)
            self.diagnostics.update(provider_status="failed",provider_error_category=code,failure_stage="PROVIDER_FORMAT" if code=="provider_invalid_json" else "PROVIDER_TRANSPORT")
            raise AnalysisError(code,"Provider interpretation unavailable")
        self.diagnostics.update(provider_status="success",provider_error_category=None)
        expected="submit_analysis_delta" if delta else "submit_analysis_intent"
        if not isinstance(calls,list) or len(calls)!=1 or not isinstance(calls[0],dict) or calls[0].get("name")!=expected or not isinstance(calls[0].get("arguments"),dict):
            raise ResolutionIssues([{"requirement_id":None,"field":"envelope","code":"invalid_intent_envelope"}])
        raw = deepcopy(calls[0]["arguments"])
        # Advisory presentation labels from old adapters carry no authority.
        for field in ("breadth", "analysis_breadth"):
            raw.pop(field, None)
        return raw

    @staticmethod
    def has_meaning(req):
        return req.availability != "requested" or any((req.metric_ids,req.dimension_ids,req.analysis_kind,
            req.lens_hint,req.filters,req.time,req.ranking,req.granularity,req.derived_features))

    def parse(self, raw):
        try:
            intent=AnalysisIntentEnvelope.model_validate(raw)
        except ValidationError as error:
            issues=[]
            requirements=raw.get("requirements",[]) if isinstance(raw,dict) and isinstance(raw.get("requirements"),list) else []
            for e in error.errors():
                loc=e["loc"]; id=None
                if len(loc)>1 and loc[0]=="requirements" and isinstance(loc[1],int) and loc[1]<len(requirements):
                    item=requirements[loc[1]]
                    id=item.get("id") if isinstance(item,dict) else None
                entry = {"requirement_id":id,"field":str(loc[2]) if len(loc)>2 else "envelope",
                         "code":"invalid_intent_shape","validation_type":e["type"]}
                # Controlled constraints only, never input values/provider prose.
                for key in ("max_length","min_length","le","ge","expected"):
                    value = e.get("ctx",{}).get(key)
                    if isinstance(value,(int,float)) or key == "expected" and isinstance(value,str) and len(value)<=200:
                        entry[key] = value
                issues.append(entry)
            raise ResolutionIssues(issues) from None
        if intent.decision!="analyze":
            if not intent.clarification:
                raise ResolutionIssues([{"requirement_id":None,"field":"clarification","code":"clarification_required"}])
            error=AnalysisError("unsupported_metric" if intent.decision=="unsupported" else intent.clarification.reason,"Controlled semantic limitation")
            allowed={'metric_ids','dimension_ids','time','filters','analysis_goal','ranking','granularity'}
            error.missing_fields=[f for f in intent.clarification.missing_fields if f in allowed]
            raise error
        if not intent.requirements:
            raise ResolutionIssues([{"requirement_id":None,"field":"requirements","code":"requirement_required"}])
        if len({r.id for r in intent.requirements})!=len(intent.requirements):
            raise ResolutionIssues([{"requirement_id":None,"field":"id","code":"duplicate_requirement_id"}])
        empty = [r for r in intent.requirements if not self.has_meaning(r)]
        if empty:
            raise ResolutionIssues([{"requirement_id":r.id,"field":"metric_ids","code":"requirement_meaning_required"} for r in empty])
        return intent

    def merge_repair(self, previous, returned, issues):
        targets={}
        for issue in issues:
            targets.setdefault(issue.get("requirement_id"),set()).add(issue["field"])
        global_features = {f for i in issues if i.get('requirement_id') is None and
                           i['field']=='derived_features' for f in i.get('candidate_ids',[])}
        old={r.id:r for r in previous.requirements}
        updates={r.id:r for r in returned.requirements}
        for id,new in updates.items():
            if id not in old:
                if None not in targets and id not in targets:
                    raise ResolutionIssues([{"requirement_id":id,"field":"id","code":"untargeted_addition"}])
                # A malformed sibling may not parse, but its valid explicit
                # time/filter/ranking facts are still protected during repair.
                raw = getattr(self, "raw_requirements", {}).get(id, {})
                for field in (IntentRequirement.model_fields.keys()-{"id","goal","domain_id","lens_hint"}) - targets.get(id,set()):
                    if field in raw:
                        try:
                            baseline = IntentRequirement.model_validate({"id":id,"goal":"scope",field:raw[field]})
                        except ValidationError:
                            continue
                        if getattr(baseline,field) != getattr(new,field):
                            raise ResolutionIssues([{"requirement_id":id,"field":field,"code":"untargeted_field_changed"}])
                continue
            resolver=AnalyticalResolver(self.catalog,self.reference)
            before=requirement_meaning(resolver.normalize(old[id]));after=requirement_meaning(resolver.normalize(new))
            fields=set(targets.get(id,set()))
            if global_features and set(old[id].derived_features) <= set(new.derived_features) and (
                set(new.derived_features)-set(old[id].derived_features)) <= global_features:
                fields.add('derived_features')
            if not fields:
                if before!=after:
                    raise ResolutionIssues([{"requirement_id":id,"field":"frozen","code":"accepted_requirement_changed"}])
                continue
            for field in before.keys() | after.keys():
                if field not in fields and before.get(field)!=after.get(field):
                    raise ResolutionIssues([{"requirement_id":id,"field":field,"code":"untargeted_field_changed"}])
            for issue in issues:
                if issue.get('requirement_id')==id and issue['code']=='explicit_metric_definition_mismatch' and not set(issue['protected_metric_ids'])<=set(new.metric_ids):
                    raise ResolutionIssues([{'requirement_id':id,'field':'metric_ids','code':'accepted_metric_removed'}])
                if issue.get('requirement_id')==id and issue['code']=='feature_shape_conflict':
                    protected=issue['protected_features']
                    if not set(protected)<=set(new.derived_features) or any(
                            old[id].feature_metrics.get(f)!=new.feature_metrics.get(f) for f in protected):
                        raise ResolutionIssues([{'requirement_id':id,'field':'derived_features','code':'accepted_feature_changed'}])
            old[id]=new
        for id in targets:
            if id is not None and id not in updates:
                raise ResolutionIssues([{"requirement_id":id,"field":"id","code":"target_requirement_omitted"}])
        for id,new in updates.items():
            if id not in old:
                old[id]=new
        return AnalysisIntentEnvelope(decision="analyze",requirements=list(old.values()))

    def parse_repair(self, raw, previous):
        """Merge partial wire objects before strict validation, never defaults."""
        data = deepcopy(raw)
        if not isinstance(data.get('requirements', []), list):
            return self.parse(data)
        baseline = {r.id:r.model_dump(mode='json') for r in previous.requirements}
        for item in data.get('requirements', []):
            if not isinstance(item, dict):
                continue
            prior = baseline.get(item.get('id')) or getattr(self, 'raw_requirements', {}).get(item.get('id'))
            if prior:
                if isinstance(item.get('ranking'),dict) and isinstance(prior.get('ranking'),dict):
                    item['ranking']={**deepcopy(prior['ranking']),**item['ranking']}
                # Keep malformed target fields available for correction while
                # retaining every other raw field for local strict validation.
                item.update({k:deepcopy(v) for k,v in prior.items() if k not in item})
        return self.parse(data)

    def preflight(self, resolved, context):
        self.queries.ui_context=context
        self.queries.pending.clear()
        # Compiler authorization comes from the physically validated server
        # index, not retrieval or model supplied executable identifiers.
        self.semantic.discovered.update(AnalyticalResolver(self.catalog,self.reference).index.references)
        prepared={}
        self.diagnostics["failure_stage"]="PLAN_VALIDATION"
        for op in resolved["operations"]:
            try:
                self.ground_values(op)
            except UnresolvedFilter as error:
                raise AnalysisError("filter_value_ambiguous" if error.resolution['status']=='ambiguous' else "filter_value_unknown",
                    "Grounded dimension value requires clarification",choices=error.resolution.get('choices',[])) from None
            a=self.queries.prepare(op)
            prepared[a.query.id]=a
        from services.agent_pipeline import AnalysisPipeline
        AnalysisPipeline.enforce_ui(prepared,context)
        from services.analysis_coverage_service import canonical_components, coverage_diagnostics
        components,_=canonical_components(resolved["components"],prepared,self.intelligence)
        self.diagnostics.update(analysis_components=components,coverage_origin="server_resolved",
            resolved_requirement_coverage=resolved["coverage"],request_anchor_verification="passed",
            **coverage_diagnostics(components,prepared))
        from services.analytical_capacity_planner import dry_analysis_plan
        self.diagnostics['dry_plan'] = dry_analysis_plan(prepared, resolved['coverage'], resolved['feature_bindings'], resolved['plan_fingerprint'])
        return prepared

    def run(self, prompt, context=None):
        started=time.perf_counter();context=dict(context or {})
        resolver=AnalyticalResolver(self.catalog,self.reference,context)
        refinement=bool(context.get("semantic_intent"))
        original=context.get("original_question",prompt)
        initial = context.get("initial_semantic_intent") or context.get("semantic_intent")
        history = deepcopy(context.get("semantic_history", []))
        if refinement:
            self.anchors, replayed = refinement_anchors(original,initial,history,self.catalog,context,self.reference)
            from services.analytical_resolver import intent_fingerprint
            if intent_fingerprint(replayed,self.reference,self.catalog) != intent_fingerprint(AnalysisIntentEnvelope.model_validate(context["semantic_intent"]),self.reference,self.catalog):
                raise AnalysisError("stale_approval","Semantic history differs from stored meaning")
        else:
            self.anchors=request_anchors(prompt,self.catalog,context)
        accepted_delta = None
        self.semantic.discovered.update(resolver.index.references)
        self.diagnostics["request_anchors"]=self.anchors
        logger.info("[AnalystCoverageAnchors] %s",json.dumps({"explicit_metric_anchors":[a["candidate_ids"] for a in self.anchors["metrics"]],"dimension_anchors":[a["candidate_ids"] for a in self.anchors["dimensions"]],"time_anchor":bool(self.anchors["times"]),"ranking_anchor":bool(self.anchors["rankings"])}))
        payload=self.context_payload(prompt,context)
        system=SYSTEM if not refinement else "Return only a semantic DELTA to current_intent: add/remove/update named requirements; changes contains only fields explicitly changed by feedback. No SQL, operation graph or full replacement. "+SYSTEM
        tools=[intent_tool(delta=refinement)]
        maximum=char_limit("DATA_ANALYST_ONE_SHOT_CONTEXT_MAX_CHARS",24000,48000)
        self.diagnostics["context_char_budget"]=maximum
        from services.one_shot_context import body_sizes
        # body_sizes expects a domains entry; it is empty because executable
        # blueprint packs are no longer part of model interpretation.
        payload["domains"]={"packs":[]}
        sizes=body_sizes(system,payload,tools)
        # Optional retrieval hints must never crowd out the approved meaning
        # during refinement. Keep the same hard provider-body budget.
        pruned=[]
        for field in ('value_profiles', 'confirmed_examples'):
            if max(sizes.values()) <= maximum:
                break
            if payload.pop(field, None) is not None:
                pruned.append(field)
                sizes=body_sizes(system,payload,tools)
        self.diagnostics['pruned_optional_context_fields']=pruned
        self.diagnostics.update(total_context_chars=max(sizes.values()),primary_context_chars=max(sizes.values()),provider_body_chars=sizes,
            decision_schema_chars=len(compact(tools)),schema_chars=len(compact(tools[0]["parameters"])),provider_body_headroom_chars=maximum-max(sizes.values()),
            system_chars=len(system),coverage_contract_chars=0)
        if max(sizes.values())>maximum:
            raise AnalysisError("one_shot_context_budget_exceeded","Required meaning context cannot fit")
        previous=None;issues=[];resolved=None;raw=None;kind="primary"
        self.semantic.lookup_count=context.get("scope_lookup_count",0)
        try:
            for attempt in range(self.turn.budget.max_calls):
                response={}
                try:
                    self.diagnostics[{"primary":"primary_call_count","repair":"semantic_repair_count","resolution":"targeted_resolution_count","transport":"transport_retry_count"}[kind]]+=1
                    response=self.turn.invoke(system=system,messages=[{"role":"user","content":compact(payload)}],tools=tools) or {}
                    attempts=response.get("attempts",[])
                    if len(attempts)>1:
                        raise AnalysisError("provider_call_budget_exceeded","Nested transport attempts forbidden")
                    self.diagnostics["provider_calls"].extend(attempts)
                    self.diagnostics["agent_rounds"]=self.turn.budget.used
                    raw=self.read_response(response,delta=tools[0]["name"] == "submit_analysis_delta")
                    if kind == "primary" and isinstance(raw.get("requirements"), list):
                        self.raw_requirements = {r["id"]:deepcopy(r) for r in raw["requirements"] if isinstance(r,dict) and isinstance(r.get("id"),str)}
                    if refinement and tools[0]["name"] == "submit_analysis_delta":
                        intent=apply_delta(AnalysisIntentEnvelope.model_validate(context["semantic_intent"]),raw)
                        if previous is not None and kind != 'primary':
                            # A repair cannot alter fields outside its original
                            # target. All retries still patch the stored baseline.
                            intent = self.merge_repair(previous,intent,issues)
                        previous = intent
                        candidate_history = history + [{"feedback":prompt,"delta":raw}]
                        self.anchors, _ = refinement_anchors(original,initial,candidate_history,self.catalog,context,self.reference)
                        accepted_delta = raw
                    else:
                        intent=self.parse_repair(raw,previous) if previous else self.parse(raw)
                        if previous:
                            intent=self.merge_repair(previous,intent,issues)
                    # Once an authorized patch is accepted, subsequent validator
                    # failures are NEW targets. Rejected patches never reach
                    # here and therefore never unlock the original guard.
                    issues=[]
                    previous=intent
                    self.diagnostics['interpreted_shapes'] = [dict(requirement_id=r.id,
                        analysis_kind=r.analysis_kind,dimension_count=len(r.dimension_ids),
                        metric_ids=[m for m in r.metric_ids if m in resolver.index.metrics],
                        dimension_ids=[d for d in r.dimension_ids if d in resolver.index.dimensions]) for r in intent.requirements]
                    if not refinement:
                        from services.request_anchors import complete_unique_grouping, complete_explicit_granularity
                        intent,completed=complete_unique_grouping(intent,self.anchors,resolver.index)
                        intent,cadences=complete_explicit_granularity(intent,self.anchors)
                        completed += cadences
                        previous=intent
                        if completed:self.diagnostics.setdefault('semantic_normalizations',[]).extend(completed)
                    self.diagnostics["failure_stage"]="ANALYTICAL_RESOLUTION"
                    resolution_started=time.perf_counter()
                    # Resolve lookup references into semantic meaning BEFORE IDs
                    # and fingerprints are generated; preflight cannot mutate scope.
                    for req in intent.requirements:
                        if req.availability == "requested" and all(f.dimension in resolver.index.dimensions for f in req.filters):
                            normalized = resolver.normalize(req)
                            data = normalized.model_dump(mode="json")
                            try:
                                self.ground_values(data)
                            except UnresolvedFilter as error:
                                raise AnalysisError("filter_value_ambiguous" if error.resolution['status']=='ambiguous' else "filter_value_unknown",
                                    "Grounded dimension value requires clarification",choices=error.resolution.get('choices',[])) from None
                            req.filters = IntentRequirement.model_validate(data).filters
                    resolved=resolver.resolve(intent)
                    before={r.id:r for r in intent.requirements}
                    for req in resolved['intent'].requirements:
                        for field in ('analysis_kind','dimension_ids','derived_features','granularity'):
                            if getattr(before[req.id],field)!=getattr(req,field):
                                self.diagnostics.setdefault('semantic_normalizations',[]).append(dict(
                                    requirement_id=req.id,field=field,rule='catalog_semantic_normalization',value=getattr(req,field)))
                    self.diagnostics["resolver_latency_ms"]=round((time.perf_counter()-resolution_started)*1000,2)
                    self.diagnostics["failure_stage"]="SEMANTIC_COVERAGE"
                    anchors = self.anchors
                    if refinement:
                        feedback_anchors = request_anchors(prompt,self.catalog,context)
                        missing = verify_anchors(feedback_anchors,resolved["intent"].requirements,self.reference,self.catalog)
                    else:
                        missing = []
                    missing += verify_anchors(anchors,resolved["intent"].requirements,self.reference,self.catalog)
                    if missing:
                        raise ResolutionIssues(missing)
                    break
                except (ResolutionIssues,ValidationError) as error:
                    self.diagnostics["contract_rejection_count"]+=1
                    new_issues=error.issues if isinstance(error,ResolutionIssues) else [{"requirement_id":None,"field":"envelope","code":"invalid_intent_shape"}]
                    # A rejected repair never changes the target authority of
                    # the next call. In particular it cannot unlock a frozen r1.
                    if kind in {"primary","transport"} or not issues:
                        issues=new_issues
                    if previous is None and isinstance(raw,dict):
                        valid=[]
                        for item in (raw.get("requirements",[]) if isinstance(raw.get("requirements"),list) else [])[:16]:
                            try:
                                req = IntentRequirement.model_validate(item)
                                if self.has_meaning(req):
                                    valid.append(req)
                            except (ValueError,TypeError):
                                pass
                        # Preserve valid meaning even when a sibling is malformed.
                        if valid or isinstance(raw.get("requirements"),list):
                            previous=AnalysisIntentEnvelope(decision="analyze",requirements=valid)
                    self.diagnostics.update(contract_issues=new_issues,agent_contract_status="invalid",agent_contract_error="semantic_intent_invalid",
                        failure_stage="SEMANTIC_COVERAGE" if any(i["code"].startswith("explicit_") for i in new_issues) else "SEMANTIC_INTENT",
                        failure_requirement_id=new_issues[0].get("requirement_id"),failure_field=new_issues[0]["field"],failure_code=new_issues[0]["code"],resolver_action="targeted_repair")
                    self.diagnostics.setdefault('root_contract_issues',deepcopy(new_issues))
                    self.diagnostics.setdefault('semantic_issue_history',[]).append(deepcopy(new_issues))
                    if attempt+1>=self.turn.budget.max_calls:
                        raise ResolutionIssues(new_issues) from None
                    targets={i.get("requirement_id") for i in issues}
                    rejected=[r.model_dump(mode="json",exclude_none=True) for r in previous.requirements if r.id in targets] if previous else []
                    # Include malformed affected siblings too: valid semantic
                    # fields survive; invalid fields are identified by precise
                    # constraint codes rather than a blind full regeneration.
                    included = {r['id'] for r in rejected}
                    for id, draft in getattr(self,"raw_requirements",{}).items():
                        if id not in targets or id in included:
                            continue
                        projected = {"id":id}
                        for field in IntentRequirement.model_fields.keys()-{"id"}:
                            if field not in draft:
                                continue
                            try:
                                checked = IntentRequirement.model_validate({"id":id,field:draft[field]})
                            except ValidationError:
                                continue
                            projected[field] = checked.model_dump(mode="json")[field]
                        rejected.append(projected)
                    # The request is original; candidate context is bounded and
                    # contains only semantic vocabulary, never results/SQL.
                    domains={r.domain_id for r in previous.requirements if r.id in targets and r.domain_id} if previous else set()
                    payload={"question":prompt,"ui":self.anchors["ui"],"reference_date":self.reference.isoformat(),
                        "validation_issues":issues,"affected_requirements":rejected,
                        "frozen_requirement_ids":[r.id for r in previous.requirements if r.id not in targets] if previous else [],
                        "vocabulary":self.vocabulary(domains or self.diagnostics["detailed_domain_ids"]),"domains":{"packs":[]}}
                    if any(i.get('requirement_id') is None and i['field']=='derived_features' for i in issues):
                        payload['feature_repair_candidates']=[dict(id=r.id,analysis_kind=r.analysis_kind,
                            metric_ids=r.metric_ids,dimension_ids=r.dimension_ids,derived_features=r.derived_features)
                            for r in previous.requirements if r.availability=='requested'] if previous else []
                    system=REPAIR_SYSTEM;tools=[repair_tool(issues,previous)]
                    if refinement:
                        # Keep the delta protocol and complete baseline through
                        # recovery. A full-envelope retry loses untouched meaning
                        # when the primary delta cannot be parsed/applied.
                        tools=[intent_tool(delta=True)]
                        system=("Repair the semantic DELTA only. Return submit_analysis_delta against current_intent; "
                            "preserve every untouched field. Repeated updates must agree. "
                            "Do not return a full intent or an empty requirement. "+SYSTEM)
                        payload['current_intent']=context['semantic_intent']
                        payload['rejected_delta']=raw
                        payload['original_question']=original
                    self.diagnostics["contract_repair_count"]+=1
                    self.diagnostics["repaired_contract_issues"]=issues
                    kind="repair" if attempt==0 else "resolution"
                    logger.info("[AnalystRepair] %s",json.dumps({"attempt":attempt+2,"target_requirement_ids":sorted(str(t) for t in targets),"issue_codes":[i["code"] for i in issues],"frozen_requirement_ids":payload["frozen_requirement_ids"]}))
                except AnalysisError as error:
                    last=(response.get("attempts") or [{}])[-1]
                    transient=error.category in {"provider_timeout","provider_connection"} or error.category=="provider_unavailable" and last.get("http_status") in {500,502,503,504} or error.category=="provider_rate_limited" and last.get("retryable") is True and last.get("retry_after_seconds",999)>0 and last.get("retry_after_seconds",999)<=2
                    format_repair = error.category == "provider_invalid_json"
                    if not (transient or format_repair) or attempt+1>=self.turn.budget.max_calls:
                        raise
                    kind="transport" if transient else "repair" if attempt == 0 else "resolution"
                    if format_repair:
                        self.diagnostics["contract_repair_count"] += 1
                    if transient and isinstance(self.turn.provider,NativeAgentProvider):
                        time.sleep(min(2,last.get("retry_after_seconds",0.15*(attempt+1)))+random.uniform(0,0.1))
                if isinstance(self.turn.provider,NativeAgentProvider):
                    self.turn.provider.reset()
                    recovery=os.getenv("DATA_ANALYST_RECOVERY_MODEL","").strip()
                    if kind=="resolution" and recovery:
                        self.turn.provider.gemini_model=recovery
                        self.diagnostics["model_escalation_count"]=1
                repair_sizes=body_sizes(system,payload,tools)
                self.diagnostics["repair_context_chars"]=max(repair_sizes.values())
                if max(repair_sizes.values())>maximum:
                    raise AnalysisError("one_shot_context_budget_exceeded","Targeted context cannot fit")
            if resolved is None:
                raise AnalysisError("semantic_intent_invalid","Internal semantic recovery exhausted")
            if not resolved["operations"]:
                states={c["state"] for c in resolved["coverage"]}
                code="historical_metric_unavailable" if "INSUFFICIENT_DATA" in states else "clarification" if "NEEDS_INPUT" in states else "unsupported_metric"
                raise AnalysisError(code,"No executable requested capability")
            compiled=time.perf_counter()
            prepared=self.preflight(resolved,context)
            self.diagnostics["compiler_latency_ms"]=round((time.perf_counter()-compiled)*1000,2)
            self.resolved=resolved
            self.diagnostics["request_anchors"] = self.anchors
            self.diagnostics["initial_semantic_intent"] = initial if refinement else resolved["intent"].model_dump(mode="json")
            if refinement:
                # Persist the accepted, normalized delta after any targeted repair.
                before = AnalysisIntentEnvelope.model_validate(context["semantic_intent"])
                old = {r.id:r for r in before.requirements}
                new = {r.id:r for r in resolved["intent"].requirements}
                changes = []
                for id in old.keys()-new.keys():
                    changes.append({"action":"remove","requirement_id":id})
                for id,r in new.items():
                    if id not in old:
                        changes.append({"action":"add","requirement_id":id,"requirement":r.model_dump(mode="json")})
                    else:
                        patch = {f:v for f,v in r.model_dump(mode="json").items() if f!="id" and v!=old[id].model_dump(mode="json")[f]}
                        if patch:
                            changes.append({"action":"update","requirement_id":id,"changes":patch})
                accepted_delta = {"changes":changes}
                self.anchors, _ = refinement_anchors(original,initial,history+[{"feedback":prompt,"delta":accepted_delta}],self.catalog,context,self.reference)
            self.diagnostics["semantic_history"] = history + ([{"feedback":prompt,"delta":accepted_delta}] if refinement else [])
            depth=context.get("analysis_depth") if context.get("analysis_depth_explicit") else "focused" if len(resolved["coverage"])<=2 else "comprehensive" if len(resolved["coverage"])>=5 else "deep"
            self.diagnostics.update(semantic_intent=resolved["intent"].model_dump(mode="json"),semantic_intent_fingerprint=resolved["intent_fingerprint"],
                resolved_plan_fingerprint=resolved["plan_fingerprint"],resolved_operations=resolved["operations"],resolver_version=resolved["resolver_version"],
                derived_feature_bindings=resolved["feature_bindings"],analysis_depth=depth,analysis_breadth=depth,
                target_visual_count=DEPTH_POLICIES[depth]["target_views"][-1],target_visual_range=DEPTH_POLICIES[depth]["target_views"],
                requested_operation_count=len(prepared),registered_requested_operations=len(prepared),supporting_operation_count=0,
                agent_contract_status="valid",agent_contract_error=None,semantic_status="grounded",failure_stage=None,terminal_error=None,contract_issues=[])
            if any(c["state"]!="RESOLVED" for c in resolved["coverage"]) and not self.proposal:
                raise AnalysisError("approval_required","Partial requirements need current explicit approval")
            # Grounded filters are authoritative; persist normalized meaning.
            active={}
            self.diagnostics["failure_stage"]="SQL_EXECUTION"
            for id,a in prepared.items():
                active[id]=self.queries.run(a)
            self.diagnostics.update(failure_stage=None,analytical_tool_calls=len(active))
            return active,DashboardPlan(active_query_ids=list(active))
        except Exception as error:
            if getattr(error,"category",None)=="result_contract":
                self.diagnostics["failure_stage"]="RESULT_VALIDATION"
            self.diagnostics["terminal_error"]=getattr(error,"category","internal")
            raise
        finally:
            for field,token in (("input_tokens","input"),("output_tokens","output")):
                values=[a.get("tokens",{}).get(token) for a in self.diagnostics["provider_calls"]]
                self.diagnostics[field]=sum(v for v in values if isinstance(v,int)) if any(isinstance(v,int) for v in values) else None
            self.diagnostics.update(value_lookup_count=self.semantic.lookup_count,planning_latency_ms=round((time.perf_counter()-started)*1000,2))
            logger.info("[AnalystPlanningTurn] %s",json.dumps({k:self.diagnostics.get(k) for k in ("provider_call_count","primary_call_count","semantic_repair_count","targeted_resolution_count","transport_retry_count","total_context_chars","repair_context_chars","schema_chars","planning_latency_ms")}))
