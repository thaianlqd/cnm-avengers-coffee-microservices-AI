"""Meaning → verifiable server plan, with bounded field-targeted recovery."""
import json
import logging
import os
import random
import re
import time
from copy import deepcopy
from pydantic import ValidationError
from services.one_shot_planner import OneShotPlanner
from services.one_shot_context import body_sizes
from services.analysis_catalog import AnalysisError
from services.analysis_intent import AnalysisIntentEnvelope, IntentRequirement, AnalysisIntentDelta, apply_delta, intent_tool, repair_tool
from services.analytical_resolver import AnalyticalResolver, ResolutionIssues, digest, requirement_meaning
from services.request_anchors import request_anchors, verify_anchors, refinement_anchors
from services.value_grounding_service import dimension_values
from services.analyst_clarification import UnresolvedFilter
from services.semantic_manifest_service import compact, char_limit
from services.analyst_contract import DashboardPlan
from services.domain_intelligence_service import DEPTH_POLICIES
from services.agent_provider import NativeAgentProvider

# Compatibility export; provider allowance belongs to the budget owner.
from services.provider_budget import semantic_repair_limit

logger = logging.getLogger("ai-analytics")
SYSTEM = """Extract Vietnamese analytical meaning as one intent envelope, one requirement per distinct user goal. Use candidate metric/dimension IDs; lens_hint is advisory. No SQL, subjects, executable IDs, parents, query roles, coverage mappings, charts or reasoning. Preserve metrics, filters, time, ranking and requested features. Question overrides drafts/expectations; governed scope facts and structured UI filters/time are authoritative. Omitted time means all_time. Preserve incompatible populations separately. Unavailable definitions such as ROI without costs stay explicit with controlled reasons. Clarify only genuinely missing meaning. Top N is a selected cohort; contribution_share requires a verified denominator. Never invent values, causes or history. Return requested work; server chooses supporting views. Population disclosures do not imply grouping. Averages cannot have additive shares. Separate whole-scope scalar KPIs from grouped views. Companion metrics do not change the ranking criterion."""
REPAIR_SYSTEM = """Repair ONLY the identified semantic fields/requirements. Return one intent envelope with requirement id and only the corrected fields. Omitted fields are preserved by the server. Do not resend unaffected requirements. Correct ALL supplied conflicts together. When removing a feature, also remove its feature_metrics entry; feature_metrics is a full replacement map, not a nested patch. For a shape conflict, retain protected_features and move the conflicting feature to a new requirement with its valid shape, original filters and original time. Do not alter the existing trend cadence or grouping to accommodate a whole-scope feature. For an omitted derived feature, add it to a compatible existing requirement using only id and derived_features, preserving existing features. Add a new requirement only for genuinely omitted analytical work. All other fields are frozen. Use the bounded vocabulary or state a genuine clarification/limitation. No SQL, executable graph, reasoning or results."""
SYSTEM += " Negated ROI/causal claims are guardrails, not requested calculations. Use feature_metrics to target a subset of displayed metrics. Catalog aggregations are aggregate, not raw detail. Non-analytical text uses clarification reason not_analytical_request and missing_fields:[analysis_goal]."
SYSTEM += " default_metric_ids are the governed bundle of an explicitly named topic: analyze them, never ask which metric."
SYSTEM += " No optional features for dashboard count. Top N entity goes in dimension_ids; per_group only for an explicit independent partition. Totals/trends have no entity grouping unless requested. Status disclosure adds no filter; preserve catalog populations."
SYSTEM += " Bind each clause's metrics and grouping. scalar=whole scope; selected_total=ranking metric only."
SYSTEM += " Concept without candidate metric: decision unsupported. Vague superlative (tốt nhất, ngon nhất) without metric: clarification metric_ambiguous."
SYSTEM += " Future forecast of one metric: forecast{horizon,unit}; time=history window; never output values; not in forecast_capabilities=unsupported."
SYSTEM += " Only an explicit two-period scalar comparison uses comparison_time=baseline ISO range, time=target, aggregate; no cadence/change features. A single date window has no comparison_time."
SYSTEM += " driver_delta is supported observational decomposition of additive changes by group, never causal; aggregate, time=current period, server computes the baseline."
SYSTEM += " For broad or multi-faceted questions, synthesize into 3-5 core strategic requirements (maximum 6). Never generate more than 6 requirements. Pair each metric only with its compatible dimensions. Group complementary metrics with the same population and grouping into a single requirement rather than fragmenting into separate single-metric requirements."
REPAIR_SYSTEM += " Each named target must include its corrected fields, never id alone. expected is authoritative for grouping/ranking/time/filter mismatches. Copy required_scope_patches verbatim for those fields; do not reinterpret already-resolved scope or repeat your rejected filters. Remove unrequested conflicting optional features instead of adding work; retain protected_features. Empty dimension_ids means a whole-scope time trend."


CALL_REASONS = {"primary": "INITIAL_UNDERSTANDING", "repair": "CONTRACT_REPAIR",
                "resolution": "CONTRACT_REPAIR", "transport": "TRANSPORT_RETRY"}


def repair_anchor_context(anchors):
    """Preserve heterogeneous metadata lists, omitting lexical span details."""
    return {key: ([{k: deepcopy(v) for k, v in anchor.items() if k not in {'start', 'end', 'phrase'}}
                   if isinstance(anchor, dict) else deepcopy(anchor) for anchor in value]
                  if isinstance(value, list) else deepcopy(value))
            for key, value in anchors.items()
            if key not in {'ui', 'metric_constraints', 'capability_constraints'}}


def cohort_contract(anchors):
    references=[{k:deepcopy(r[k]) for k in ('dimension','goal_dimensions','goal_metrics') if k in r}
                for r in anchors.get('cohort_references', [])]
    return {'references':references, 'rule':
        'A ranked-set back-reference denotes server-selected keys, never a literal filter value. '
        'Do not put reference prose, rank labels or invented cohort names in filters. '
        'Keep the referenced ranking and every independently requested goal. Use separate aggregate requirements for its dependent breakdowns. '
        'Preserve known user filters and time. Inherit the ranking metric unless another metric is explicit in that clause. '
        'The server binds dependent goals to the selected keys.'} if references else None


def draft_shapes(raw, catalog):
    """Bounded catalog IDs/types only, available even when schema parsing fails."""
    result=[]
    for req in (raw.get('requirements') or [])[:8]:
        if not isinstance(req,dict):continue
        def ids(field, known):
            values=req.get(field)
            return [v for v in values[:8] if isinstance(v,str) and v in known] if isinstance(values,list) else []
        filters=req.get('filters')
        ranking=req.get('ranking')
        ranking=({k:v for k,v in ranking.items() if
                  (k=='metric_id' and isinstance(v,str) and v in catalog.registry['metrics']) or
                  (k=='direction' and isinstance(v,str) and v in {'top','bottom'}) or
                  (k=='limit' and type(v) is int and 1<=v<=100)} if isinstance(ranking,dict) else None)
        result.append(dict(requirement_id=req.get('id') if isinstance(req.get('id'),str) and re.fullmatch(r'[a-z][a-z0-9_]{0,39}',req['id']) else 'invalid',
            supporting_for=req.get('supporting_for') if isinstance(req.get('supporting_for'),str) and re.fullmatch(r'[a-z][a-z0-9_]{0,39}',req['supporting_for']) else None,
            availability=req.get('availability') if isinstance(req.get('availability'),str) and req['availability'] in {'requested','unsupported','needs_input','insufficient_data'} else None,
            ranking=ranking,
            analysis_kind=req.get('analysis_kind') if (req.get('analysis_kind') is None or isinstance(req.get('analysis_kind'),str)) and req.get('analysis_kind') in
                {'aggregate','cross_tab','distribution','ranking','trend','comparison','relationship','detail','forecast',None} else 'invalid',
            metric_ids=ids('metric_ids',catalog.registry['metrics']),dimension_ids=ids('dimension_ids',catalog.registry['dimensions']),
            derived_features=ids('derived_features',catalog.registry.get('derived_features',{})),
            filters=[dict(dimension=f.get('dimension') if isinstance(f.get('dimension'),str) and f['dimension'] in catalog.registry['dimensions'] else 'invalid',
                operator=f.get('operator') if isinstance(f.get('operator'),str) and f['operator'] in {'eq','ne','in','not_in','lt','lte','gt','gte'} else 'invalid',
                value_kind=type(f.get('value')).__name__) for f in filters[:8] if isinstance(f,dict)] if isinstance(filters,list) else []))
    return result


def issue_fingerprint(issues):
    """Canonical unresolved semantic state.

    Only (requirement, field, code) count. Proposed IDs and values are excluded,
    so renaming an unavailable concept is never mistaken for repair progress.
    """
    return sorted({(str(i.get("requirement_id")), str(i.get("field")), str(i.get("code"))) for i in issues})



def unavailable_definitions(registry, anchors=None):
    """Aliases detect the concept server-side (request_anchors capabilities, preflight
    unsupported_concept), so the prompt carries only the concepts named in the question."""
    named = {i for key in ("capabilities", "capability_constraints") for a in (anchors or {}).get(key, []) for i in a["candidate_ids"]}
    return {id: {k: v for k, v in d.items() if k != "aliases"}
            for id, d in registry.get("unsupported_capabilities", {}).items() if id in named}

class HybridAnalystPlanner(OneShotPlanner):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.diagnostics.update(planning_mode="hybrid_verifiable",pipeline_version="2.8",
            reliability_version='2.13.0',
            primary_call_count=0,semantic_repair_count=0,targeted_resolution_count=0,transport_retry_count=0,
            failure_stage=None,failure_requirement_id=None,failure_field=None,failure_code=None)
        self.resolved = None

    def related_capabilities(self, limit=6):
        """Supported metrics from the retrieved domains, as follow-up choices."""
        r = self.catalog.registry
        index = AnalyticalResolver(self.catalog, self.reference).index
        domains = self.diagnostics.get("detailed_domain_ids") or []
        ids = [m for d in domains for m in index.domains.get(d, {}).get("metric_refs", []) if m in index.metrics]
        return [{"label": r["metrics"][m]["business_name"], "followup": r["metrics"][m]["business_name"]}
                for m in dict.fromkeys(ids)][:limit]

    def terminal_semantic_error(self, issues, no_progress, repaired=True):
        """Typed terminal outcome once bounded repair cannot help.

        A concept is called unsupported only after a repair turn, given the
        governed candidates, still proposed an unknown ID; a first-turn typo
        that could not be repaired (no budget/limit 0) is a resolution failure.
        """
        unknown = [i for i in issues if i.get("code") == "unknown_semantic_id"]
        if repaired and unknown and len(unknown) == len(issues):
            # The model kept proposing concepts absent from the governed
            # registry. That is a capability gap, not a provider failure.
            category = "unsupported_metric" if any(i.get("field") == "metric_ids" for i in unknown) else "unsupported_dimension"
            self.diagnostics.update(capability_status="UNSUPPORTED", semantic_stop_reason="unknown_capability",
                unsupported_concepts=sorted({c for issues in self.diagnostics.get("semantic_issue_history", [])
                    for i in issues if i.get("code") == "unknown_semantic_id" for c in i.get("unknown_ids", [])})[:6])
            return AnalysisError(category, "Requested capability is not in the governed registry",
                                 choices=self.related_capabilities())
        error = ResolutionIssues(issues)
        if no_progress or (unknown and not repaired):
            error.category = "semantic_resolution_failed"
        locked = {l["metric_id"] for l in getattr(self, "metric_locks", [])}
        drift = [i for i in issues if i.get("code") in {"explicit_metrics_missing", "explicit_metric_definition_mismatch"}
                 and locked & set(i.get("candidate_ids") or i.get("protected_metric_ids") or [])]
        if drift:
            # Preflight resolved this phrase with high confidence; the
            # interpretation did not keep it. Name the conflict, do not guess.
            error.category = "semantic_contract_drift"
            self.diagnostics.update(failure_stage="SEMANTIC_CONTRACT", semantic_contract_conflicts=[
                {"locked_metric": sorted(locked & set(i.get("candidate_ids") or [])), "code": i["code"]} for i in drift])
        self.diagnostics["capability_status"] = "INVALID_CONTRACT"
        return error

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
                "features":"scalar needs aggregate with no dimensions; separate whole-scope KPIs from trends/grouped comparisons. Set feature_metrics, e.g. contribution_share:[voucher_revenue], never averages. leader/top_gap need ranking.metric_id; different leader metrics need separate rankings. Invalid shape is repairable.",
                "metric_definitions":"Honor request_anchors IDs. Concept neighbors are not equivalents: aov SUM/COUNT(*) vs store_aov AVG ignores NULL.",
                "scope":"population_scopes request catalog definitions, not grouping axes. Keep independent dimension anchors.",
                "constraints":"Do not turn a prohibition such as không kết luận ROI into a requirement to calculate ROI. Preserve it as a conclusion constraint. Only a positive request for an unavailable calculation needs an unavailable requirement.",
                "clarification":"default_metric_ids in the packet are the governed bundle of an explicit topic: analyze them with the explicit metrics; never ask which of them. Use not_analytical_request for greetings/nonsense without an analytical goal. missing_fields must name genuinely missing metric_ids, dimension_ids, time, filters or analysis_goal. Do not request fields already explicit in the question."},
            "dimensions":[[d,r["dimensions"][d]["business_name"]] for d in dims],
            "values":{d:dimension_values(self.catalog,d) for d in dims if dimension_values(self.catalog,d)},
            "features":{id:meta["shape"] for id,meta in r.get("derived_features",{}).items()},
            "unavailable_definitions":unavailable_definitions(r,getattr(self,"anchors",None))}

    def context_payload(self, question, context):
        from services.semantic_candidate_service import candidate_packet
        index = AnalyticalResolver(self.catalog,self.reference).index
        packet,candidates=candidate_packet(self.catalog,index,self.intelligence,self.anchors,question,context,
            [a.query.subject for a in self.queries.previous.values()])
        self.anchors=packet.anchors  # domain-settled mentions are what the plan is checked against
        selected=packet.candidates['candidate_domains']
        required=[c['id'] for c in candidates if c['protected']]
        topic=[u for u in packet.candidates.get('unresolved_meaning',[]) if u['kind']=='topic_target']
        if topic and not required and not packet.candidates['explicit_metric_ids']:
            # Bare "đánh giá" names no object: ask which reviews, deterministically
            # and before any provider send (PLAN 20/10 §4.5).
            concepts=self.catalog.registry['domain_intelligence'].get('topic_concepts',[])
            targets={t['domain_id']:t for c in concepts for t in c['targets']}
            profiles=self.intelligence.available()
            raise AnalysisError('subject_ambiguous','Topic needs an explicit object',choices=[
                {'label':profiles[d]['business_label'],'followup':question.rstrip(' ?.')+' về '+targets[d]['followup_object']}
                for d in topic[0]['candidate_ids'] if d in profiles and targets.get(d,{}).get('followup_object')])
        payload = {"question":question,"reference_date":self.reference.isoformat(),"timezone":self.catalog.registry["timezone"],
            "ui":{k:v for k,v in context.items() if k not in {"semantic_intent","cohort_references","original_question","current_visuals","revision","initial_semantic_intent","semantic_history","guided_intent","analysis_mission","fixed_grouping_policy","input_integrity_policy"}},
            "semantic_candidate_packet":packet.wire(),
            "features":{id:meta['shape'] for id,meta in self.catalog.registry.get('derived_features',{}).items()},
            "unavailable_definitions":unavailable_definitions(self.catalog.registry,self.anchors)}
        # Forecast bounds only for metrics of the retrieved candidate domains.
        forecastable={m:",".join(f"{u}<={n}" for u,n in self.catalog.registry["metrics"][m]["forecast"]["max_horizon"].items())
            for d in selected for m in index.domains.get(d,{}).get("metric_refs",[])
            if m in index.metrics and self.catalog.registry["metrics"][m].get("forecast",{}).get("forecastable")}
        if forecastable:
            payload["forecast_capabilities"]=dict(sorted(forecastable.items()))
        locks=getattr(self,'metric_locks',[])
        if locks:
            # V3.2 protected preflight contract: explicit generic phrases are
            # already resolved; the interpreter fills only unresolved fields.
            payload["semantic_preflight_contract"]={"locked_metrics":{l["phrase"]:l["metric_id"] for l in locks},
                "rule":"A locked phrase means that metric unless the user explicitly named a specialized metric."}
        if context.get("semantic_intent"):
            payload["current_intent"] = AnalysisIntentEnvelope.model_validate(context["semantic_intent"]).model_dump(mode='json',exclude_none=True,exclude_defaults=True)
        scope=self.anchors.get('scope_resolution') or {}
        if scope.get('bindings'):
            payload['scope_contract']={'mode':'comparison' if any(b.get('comparison') for b in scope['bindings']) else 'union',
                'rule':'Use the exact governed scope sets in protected_input_facts.scope_resolution. A union is ONE scope on EVERY requested view, never separate cohorts. For comparison use separate cohort totals or the declared comparison_dimension, never city as its substitute.'}
        if cohort_contract(self.anchors):
            payload['cohort_contract']=cohort_contract(self.anchors)
        self.diagnostics.update(candidate_packet_chars=packet.chars,
            required_domain_pack_ids=required,supporting_domain_pack_ids=[d for d in selected if d not in required],
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
        locked={l['metric_id'] for l in getattr(self,'metric_locks',[])}
        # A missing limitation reason has no authority over a completely bound
        # aggregate. Catalog metric IDs already denote aggregations; the sole
        # explicit grouped clause determines that shape. A
        # genuine clarification, partial period, extra axis/filter or feature
        # remains on the bounded repair path. All normal validators still run.
        if intent.decision=='clarification' and not intent.clarification and len(intent.requirements)==1:
            req=intent.requirements[0]
            bindings=self.anchors.get('clause_bindings',[])
            times=self.anchors.get('times',[])
            from services.time_resolution_service import resolve_time
            same_period=False
            if req.time is not None and len(times)==1:
                try:
                    same_period=(resolve_time(req.time.model_dump(mode='json'),self.reference,self.catalog.registry['timezone'])[2]==
                        resolve_time(times[0],self.reference,self.catalog.registry['timezone'])[2])
                except (ValueError,TypeError,OverflowError):
                    pass  # Incomplete/contradictory periods still need repair.
            if (req.availability=='needs_input' and req.reason is None and len(req.metric_ids)==1
                    and set(req.metric_ids)<=locked and req.analysis_kind in {None,'aggregate'}
                    and not (req.filters or req.ranking or req.forecast or req.granularity or req.supporting_for)
                    and not (self.anchors.get('rankings') or self.anchors.get('granularities') or self.anchors.get('forecasts'))
                    and set(req.derived_features)<={'scalar'} and not req.feature_metrics and same_period
                    and len(bindings)==1 and req.dimension_ids==[bindings[0]['dimension_id']]
                    and req.metric_ids[0] in bindings[0]['metric_candidates']):
                req.availability='requested'
                self.diagnostics.setdefault('semantic_normalizations',[]).append(
                    dict(requirement_id=req.id,field='availability',rule='fully_bound_unexplained_limitation'))
                if req.analysis_kind is None:
                    req.analysis_kind='aggregate'
                    self.diagnostics['semantic_normalizations'].append(
                        dict(requirement_id=req.id,field='analysis_kind',rule='explicit_grouped_catalog_aggregation'))
        if (intent.decision=='clarification' and not intent.clarification and locked and intent.requirements
                and all(r.availability=='requested' and r.metric_ids and set(r.metric_ids)<=locked for r in intent.requirements)):
            # A contradictory envelope label cannot override complete locked
            # meaning. All anchors, static compatibility and runtime guards
            # still run below; no field or analytical fact is invented here.
            intent=intent.model_copy(update={'decision':'analyze'})
            self.diagnostics.setdefault('semantic_normalizations',[]).append(dict(field='decision',rule='complete_locked_meaning'))
        if intent.decision!="analyze":
            if (intent.decision=="unsupported" and locked and not self.diagnostics.get('unsupported_declaration_rechecked')
                    and all(r.reason in (None,'historical_data_unavailable') for r in intent.requirements)):
                # Data history/coverage is owned by the server, and a bare refusal with fully locked
                # metrics proves nothing. Ask for the analysis once; a second refusal is honored.
                self.diagnostics['unsupported_declaration_rechecked']=True
                raise ResolutionIssues([{"requirement_id":None,"field":"requirements","code":"unsupported_declaration_unverified"}])
            if intent.decision=="unsupported":
                # A capability gap needs no model explanation: the server owns the
                # typed outcome, so a missing clarification object is not repaired.
                forecast=any(r.forecast for r in intent.requirements)
                error=AnalysisError("forecast_unsupported" if forecast else "unsupported_metric","Controlled semantic limitation",
                    choices=self.related_capabilities())
                self.diagnostics.update(capability_status="UNSUPPORTED",semantic_stop_reason="model_declared_unsupported")
                error.missing_fields=[f for f in (intent.clarification.missing_fields if intent.clarification else [])
                    if f in {'metric_ids','dimension_ids','time','filters','analysis_goal','ranking','granularity'}]
                raise error
            if not intent.clarification:
                raise ResolutionIssues([{"requirement_id":None,"field":"clarification","code":"clarification_required"}])
            reason=intent.clarification.reason
            if reason=='metric_ambiguous' and getattr(self,'metric_locks',[]):
                raise ResolutionIssues([dict(requirement_id=None,field='metric_ids',code='clarification_conflicts_with_locked_metric',
                    candidate_ids=sorted({l['metric_id'] for l in self.metric_locks}))])
            # One concrete clarification: offer the governed metrics as choices.
            error=AnalysisError(reason,"Controlled semantic limitation",
                choices=self.related_capabilities() if reason=="metric_ambiguous" else None)
            if reason=="metric_ambiguous":
                self.diagnostics.update(capability_status="AMBIGUOUS")
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
        # apply_delta invalidates generated views when their parent changes.
        # They must be regenerated from the validated parent, not demanded in a
        # repair response or reinserted with their old scope/time.
        resolver=AnalyticalResolver(self.catalog,self.reference)
        changed_parents={id for id in old.keys() & updates.keys() if
            requirement_meaning(resolver.normalize(old[id])) != requirement_meaning(resolver.normalize(updates[id]))}
        regenerated={id for id,r in old.items() if r.supporting_for in changed_parents and id not in updates}
        for id,new in updates.items():
            if id not in old:
                if None not in targets and id not in targets:
                    raise ResolutionIssues([{"requirement_id":id,"field":"id","code":"untargeted_addition"}])
                # A malformed sibling may not parse, but its valid explicit
                # time/filter/ranking facts are still protected during repair.
                raw = getattr(self, "raw_requirements", {}).get(id, {})
                canonical_before, canonical_after = None, None
                if raw and targets.get(id) and getattr(self, 'anchors', {}).get('cohort_references'):
                    # A malformed sibling never entered `old`, but its valid
                    # frozen facts still matter. Compare shape only after the
                    # same server cohort normalization on both candidates.
                    # Only diagnosed fields are patched to parse the baseline;
                    # metric/time/filter/ranking facts outside targets remain raw.
                    baseline_raw = deepcopy(raw)
                    for field in targets[id] & IntentRequirement.model_fields.keys():
                        baseline_raw[field] = new.model_dump(mode='json')[field]
                    try:
                        baseline_req = IntentRequirement.model_validate(baseline_raw)
                        from services.request_anchors import normalize_cohort_cross_tabs, complete_coordinated_axes
                        normalized = []
                        for req in (baseline_req, new):
                            envelope = AnalysisIntentEnvelope(decision='analyze', requirements=[*old.values(), req])
                            envelope, _ = normalize_cohort_cross_tabs(envelope, self.anchors)
                            envelope, _ = complete_coordinated_axes(envelope, self.anchors, resolver.index)
                            normalized.append(next(r for r in envelope.requirements if r.id == id))
                        canonical_before, canonical_after = normalized
                    except (ValidationError, StopIteration):
                        pass  # Invalid frozen facts still use the original strict guard below.
                for field in (IntentRequirement.model_fields.keys()-{"id","goal","domain_id","lens_hint"}) - targets.get(id,set()):
                    if field in raw:
                        try:
                            baseline = IntentRequirement.model_validate({"id":id,"goal":"scope",field:raw[field]})
                        except ValidationError:
                            continue
                        shape_fields = {'analysis_kind', 'dimension_ids', 'ranking', 'derived_features', 'feature_metrics'}
                        before = getattr(canonical_before, field) if canonical_before and field in shape_fields else getattr(baseline, field)
                        after = getattr(canonical_after, field) if canonical_after and field in shape_fields else getattr(new, field)
                        if canonical_before and field in {'derived_features', 'feature_metrics'}:
                            explicit = {f for a in self.anchors.get('features', []) for f in a['candidate_ids']}
                            removed = set(canonical_before.derived_features) - set(canonical_after.derived_features)
                            only_optional_removal = (removed and not removed & explicit
                                and set(canonical_after.derived_features) <= set(canonical_before.derived_features))
                            if only_optional_removal and (field == 'derived_features' or
                                    all(canonical_before.feature_metrics.get(f) == canonical_after.feature_metrics.get(f)
                                        for f in set(canonical_before.feature_metrics) | set(canonical_after.feature_metrics) if f not in removed)):
                                continue  # Unaccepted model additions carry no user authority.
                        if before != after:
                            raise ResolutionIssues([{"requirement_id":id,"field":field,"code":"untargeted_field_changed"}])
                continue
            resolver=AnalyticalResolver(self.catalog,self.reference)
            before=requirement_meaning(resolver.normalize(old[id]));after=requirement_meaning(resolver.normalize(new))
            fields=set(targets.get(id,set()))
            if global_features and set(old[id].derived_features) <= set(new.derived_features) and (
                set(new.derived_features)-set(old[id].derived_features)) <= global_features:
                fields.add('derived_features')
            if 'derived_features' in fields and all(
                    before.get('feature_metrics',{}).get(f)==after.get('feature_metrics',{}).get(f)
                    for f in set(old[id].derived_features)&set(new.derived_features)):
                # Effective target maps gain/lose the entries of legitimately
                # added/removed features. Targets of retained features stay frozen.
                fields.add('feature_metrics')
            if not fields:
                if before!=after:
                    raise ResolutionIssues([{"requirement_id":id,"field":"frozen","code":"accepted_requirement_changed"}])
                continue
            for field in before.keys() | after.keys():
                if field not in fields and before.get(field)!=after.get(field):
                    raise ResolutionIssues([{"requirement_id":id,"field":field,"code":"untargeted_field_changed"}])
            for issue in issues:
                if (issue.get('requirement_id') == id and issue['code'] == 'scope_cohort_axis_mismatch'
                        and set(new.dimension_ids) != set(issue['expected'])):
                    # The target authorizes only the governed dependency,
                    # never arbitrary additional grouping in this field.
                    raise ResolutionIssues([{'requirement_id': id, 'field': 'dimension_ids',
                        'code': 'scope_cohort_axis_mismatch', 'expected': issue['expected']}])
                if issue.get('requirement_id')==id and issue['code']=='explicit_metric_definition_mismatch' and not set(issue['protected_metric_ids'])<=set(new.metric_ids):
                    raise ResolutionIssues([{'requirement_id':id,'field':'metric_ids','code':'accepted_metric_removed'}])
                if issue.get('requirement_id')==id and issue['code']=='feature_shape_conflict':
                    protected=issue['protected_features']
                    if not set(protected)<=set(new.derived_features) or any(
                            old[id].feature_metrics.get(f)!=new.feature_metrics.get(f) for f in protected):
                        raise ResolutionIssues([{'requirement_id':id,'field':'derived_features','code':'accepted_feature_changed'}])
            old[id]=new
        for id in targets:
            if id is not None and id not in updates and id not in regenerated:
                raise ResolutionIssues([{"requirement_id":id,"field":"id","code":"target_requirement_omitted"}])
        for id in regenerated:
            old.pop(id)
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
                if ('feature_metrics' not in item and isinstance(item.get('derived_features'), list)
                        and isinstance(prior.get('feature_metrics'), dict)):
                    # An omitted map inherits retained feature targets only.
                    # Bindings of explicitly removed features are dead fields,
                    # not authority to change targets on retained features.
                    # Explicit provider maps are still validated unmodified.
                    item['feature_metrics'] = {k: deepcopy(v) for k, v in prior['feature_metrics'].items()
                                               if k in item['derived_features']}
                if isinstance(item.get('ranking'),dict) and isinstance(prior.get('ranking'),dict):
                    item['ranking']={**deepcopy(prior['ranking']),**item['ranking']}
                # Keep malformed target fields available for correction while
                # retaining every other raw field for local strict validation.
                item.update({k:deepcopy(v) for k,v in prior.items() if k not in item})
        return self.parse(data)

    def preflight(self, resolved, context):
        from services.provider_budget import request_observer
        observer = request_observer.get()
        if observer:
            observer('validating', {})
        self.queries.ui_context=context
        self.queries.pending.clear()
        # Compiler authorization comes from the physically validated server
        # index, not retrieval or model supplied executable identifiers.
        self.semantic.discovered.update(AnalyticalResolver(self.catalog,self.reference).index.references)
        prepared={}
        self.diagnostics["failure_stage"]="PLAN_VALIDATION"
        omitted=[]
        for op in sorted(resolved["operations"],key=lambda o:o["role"]=="supporting"):
            self.turn.budget.remaining()
            try:
                self.ground_values(op)
            except UnresolvedFilter as error:
                raise AnalysisError("filter_value_ambiguous" if error.resolution['status']=='ambiguous' else "filter_value_unknown",
                    "Grounded dimension value requires clarification",choices=error.resolution.get('choices',[])) from None
            try:
                a=self.queries.prepare(op)
            except AnalysisError as error:
                if op['role']!='supporting' or error.category=='planning_timeout':
                    raise
                omitted.extend(c['requirement_id'] for c in resolved['coverage'] if op['id'] in c['operation_ids'])
                continue
            prepared[a.query.id]=a
        if omitted:
            context['omitted_supporting_ids']=sorted(set(context.get('omitted_supporting_ids',[])+omitted))
            revised=AnalyticalResolver(self.catalog,self.reference,context).resolve(resolved['intent'])
            resolved.clear();resolved.update(revised)
            self.diagnostics.setdefault('limitations',[]).append(dict(reason='omitted_supporting_operations',
                message='Một phần hỗ trợ đã được bỏ qua vì không phù hợp dung lượng hoặc dữ liệu; yêu cầu chính được giữ nguyên.'))
            return self.preflight(resolved,context)
        from services.request_anchors import enforce_ui
        enforce_ui(prepared,context)
        from services.analysis_coverage_service import canonical_components, coverage_diagnostics
        components,_=canonical_components(resolved["components"],prepared,self.intelligence)
        self.diagnostics.update(analysis_components=components,coverage_origin="server_resolved",
            resolved_requirement_coverage=resolved["coverage"],request_anchor_verification="passed",
            **coverage_diagnostics(components,prepared))
        from services.analytical_capacity_planner import dry_analysis_plan
        self.diagnostics['dry_plan'] = dry_analysis_plan(prepared, resolved['coverage'], resolved['feature_bindings'], resolved['plan_fingerprint'])
        return prepared

    def _prepare_grounding(self, prompt, context, resolver):
        grounding_started=time.perf_counter()
        refinement=bool(context.get("semantic_intent"))
        original=context.get("original_question",prompt)
        initial = context.get("initial_semantic_intent") or context.get("semantic_intent")
        history = deepcopy(context.get("semantic_history", []))
        if refinement:
            self.anchors, replayed = refinement_anchors(original,initial,history,self.catalog,context,self.reference)
            replayed=resolver.resolve(replayed)['intent']
            from services.analytical_resolver import intent_fingerprint
            if intent_fingerprint(replayed,self.reference,self.catalog) != intent_fingerprint(AnalysisIntentEnvelope.model_validate(context["semantic_intent"]),self.reference,self.catalog):
                raise AnalysisError("stale_approval","Semantic history differs from stored meaning")
        else:
            # A guided contract already carries canonical IDs; its display text
            # is an echo and is not re-interpreted (V3.2 guided mode).
            self.anchors=request_anchors(prompt,self.catalog,context)
            if context.get('guided_intent') and self.anchors['scope_resolution']['state']=='unspecified':
                from services.scope_resolution_service import resolve_scope
                selected=[f for req in context['guided_intent'].get('requirements',[]) for f in req.get('filters',[])
                          if self.catalog.registry['dimensions'].get(f['dimension'],{}).get('scope_governed')]
                if selected:
                    self.anchors['ui']['required_filters']=selected
                    self.anchors['scope_resolution']=resolve_scope('',self.catalog,self.anchors['ui'])
        from services.semantic_preflight_contract import metric_locks
        self.metric_locks=[] if refinement or context.get("guided_intent") else metric_locks(self.anchors,self.catalog.registry)
        self.diagnostics["semantic_metric_locks"]=[{k:l[k] for k in ("phrase","metric_id")} for l in self.metric_locks]
        from services.request_anchors import population_filters
        population_filters(self.anchors,self.catalog)  # Reject unavailable scope before spending an AI call.
        return refinement, original, initial, history, grounding_started

    def _prepare_provider_context(self, prompt, context, refinement):
        retrieval_started=time.perf_counter()
        payload=self.context_payload(prompt,context)
        self.diagnostics['metadata_retrieval_ms']=round((time.perf_counter()-retrieval_started)*1000,2)
        system=SYSTEM if not refinement else (
            "Return submit_analysis_delta against current_intent: add/remove/update named requirements; "
            "changes contains only fields explicitly changed by feedback. Preserve all other meaning. "
            "Feedback overrides drafts; governed scope facts and structured UI filters/time are authoritative. "
            "A report-wide scope change (for example only Ha Noi) must update filters on EVERY requested "
            "requirement, including scalar totals and trend requirements; updating just one panel leaves the report inconsistent. "
            "Keep unrelated existing filters and all unchanged metrics, grouping and time. "
            "Use candidate metric/dimension IDs and catalog populations. Never invent values, causes or history. "
            "No SQL, executable graph, full intent replacement, charts or reasoning. "
            "Keep incompatible populations separate, scalar totals ungrouped and ranking companions on the selected cohort. "
            "Preserve explicit trend cadence; contribution_share needs a denominator; averages have no additive shares. "
            "Period comparison uses time=target and comparison_time=baseline ISO range. "
            "Forecast uses forecast{horizon,unit}, time=history and catalog capabilities. "
            "Clarify only genuinely missing meaning; keep unavailable definitions explicit. "
            "A removed feature must lose its feature_metrics entry."
        )
        tools=[intent_tool(delta=refinement)]
        if refinement:
            # Ground feedback independently of the original request. Otherwise
            # the protected original packet can make a new place look absent.
            from services.scope_resolution_service import scope_issues, scope_repair_patches
            feedback_scope = request_anchors(prompt,self.catalog,context).get('scope_resolution') or {}
            if feedback_scope.get('bindings'):
                baseline = AnalysisIntentEnvelope.model_validate(context['semantic_intent'])
                scope_targets = scope_issues(feedback_scope,baseline.requirements,self.catalog,context)
                patches = scope_repair_patches(feedback_scope,baseline,scope_targets)
                if patches:
                    payload['required_scope_delta'] = [dict(action='update',requirement_id=p['id'],
                        changes={k:v for k,v in p.items() if k!='id'}) for p in patches if
                        not next(r for r in baseline.requirements if r.id==p['id']).supporting_for]
                    system += " Copy required_scope_delta into submit_analysis_delta; those exact filters come from the user's feedback and governed catalog. Derived supporting views regenerate from their parents."
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
            provider_schema_chars=len(compact(tools[0]['parameters'])),
            system_chars=len(system),coverage_contract_chars=0)
        if max(sizes.values())>maximum:
            raise AnalysisError("one_shot_context_budget_exceeded","Required meaning context cannot fit")
        return payload, system, tools, maximum

    def _compile_resolved(self, resolved, context):
        compiled=time.perf_counter()
        self.turn.budget.remaining()
        prepared=self.preflight(resolved,context)
        self.turn.budget.remaining()
        self.diagnostics["compiler_latency_ms"]=round((time.perf_counter()-compiled)*1000,2)
        return prepared

    def _execute_prepared(self, prepared):
        # Grounded filters are authoritative; persist normalized meaning.
        active={}
        self.diagnostics["failure_stage"]="SQL_EXECUTION"
        active, omitted = self.queries.run_batch(prepared, allow_supporting_failure=True)
        for id,error in omitted.items():
            self.diagnostics.setdefault('limitations', []).append(dict(reason='supporting_execution',
                operation_id=id, message='Một góc nhìn hỗ trợ chưa thực thi được; kết quả chính được giữ nguyên.'))
            self.diagnostics['omitted_supporting_operation_count'] += 1
        self.diagnostics.update(failure_stage=None,analytical_tool_calls=len(active))
        return active,DashboardPlan(active_query_ids=list(active))

    def _finalize_diagnostics(self, started):
        for field,token in (("input_tokens","input"),("output_tokens","output")):
            values=[a.get("tokens",{}).get(token) for a in self.diagnostics["provider_calls"]]
            self.diagnostics[field]=sum(v for v in values if isinstance(v,int)) if any(isinstance(v,int) for v in values) else None
        self.diagnostics.update(value_lookup_count=self.semantic.lookup_count,planning_latency_ms=round((time.perf_counter()-started)*1000,2))
        self.diagnostics.update(provider_attempt_latencies=[a.get('latency_ms') for a in self.diagnostics['provider_calls']],
            provider_attempt_categories=[a.get('error_category','success') for a in self.diagnostics['provider_calls']],
            resolver_ms=self.diagnostics.get('resolver_latency_ms',0),
            provider_ms=sum(self.diagnostics.get(k,0) for k in ('provider_primary_ms','provider_repair_ms','provider_transport_retry_ms')))
        logger.info("[AnalystPlanningTurn] %s",json.dumps({k:self.diagnostics.get(k) for k in ("request_id","provider_call_count","provider_call_reasons","primary_call_count","semantic_repair_count","targeted_resolution_count","transport_retry_count","semantic_stop_reason","capability_status","detailed_domain_ids","total_context_chars","repair_context_chars","schema_chars","resolver_latency_ms","compiler_latency_ms","planning_latency_ms","terminal_error")}))

    def run(self, prompt, context=None):
        started=time.perf_counter();context=dict(context or {})
        from services.analysis_expansion_service import FIXED_GROUPING_POLICY
        context['fixed_grouping_policy']=FIXED_GROUPING_POLICY
        self.diagnostics['fixed_grouping_policy']=FIXED_GROUPING_POLICY
        self.turn.budget.start_deadline()
        resolver=AnalyticalResolver(self.catalog,self.reference,context)
        refinement, original, initial, history, grounding_started = self._prepare_grounding(prompt, context, resolver)
        accepted_delta = None
        self.semantic.discovered.update(resolver.index.references)
        # Selected-scope members were already grounded server-side (exact lookup);
        # re-grounding them here under the turn's lookup budget rejected the fifth one (I03).
        for f in context.get("required_filters") or []:
            self.semantic.resolved.setdefault(f["dimension"],set()).update(f["value"] if isinstance(f["value"],list) else [f["value"]])
        self.diagnostics["request_anchors"]=self.anchors
        logger.info("[AnalystCoverageAnchors] %s",json.dumps({"explicit_metric_anchors":[a["candidate_ids"] for a in self.anchors["metrics"]],"dimension_anchors":[a["candidate_ids"] for a in self.anchors["dimensions"]],"time_anchor":bool(self.anchors["times"]),"ranking_anchor":bool(self.anchors["rankings"])}))
        self.diagnostics['local_grounding_ms']=round((time.perf_counter()-grounding_started)*1000,2)
        payload, system, tools, maximum = self._prepare_provider_context(prompt, context, refinement)
        previous=None;issues=[];resolved=None;raw=None;kind="primary"
        self.semantic.lookup_count=context.get("scope_lookup_count",0)
        try:
            for attempt in range(self.turn.budget.max_calls):
                from services.provider_budget import request_observer
                observer = request_observer.get()
                if observer:
                    observer('planning' if kind == 'primary' else 'repairing', {})
                response={};repeated_output=False
                guided=context.get("guided_intent")
                try:
                    if guided is not None and kind != 'primary':
                        raise AnalysisError('guided_contract_invalid','Guided contract cannot be repaired by a provider')
                    if kind != 'primary' and not self.turn.budget.recovery_available():
                        raise AnalysisError('semantic_intent_invalid','No useful window remains for semantic repair')
                    if guided is not None:
                        # Deterministic contract → same validation/resolution path, 0 provider calls.
                        raw=deepcopy(guided)
                        self.diagnostics.update(guided_contract_used=True,provider_status="not_called")
                    else:
                        self.diagnostics[{"primary":"primary_call_count","repair":"semantic_repair_count","resolution":"targeted_resolution_count","transport":"transport_retry_count"}[kind]]+=1
                        if kind == 'resolution':
                            self.diagnostics['semantic_repair_count']+=1
                        self.diagnostics.setdefault('provider_call_reasons',[]).append(CALL_REASONS[kind])
                        provider_started=time.perf_counter()
                        provider_wall_started=time.monotonic()
                        response=self.turn.invoke(system=system,messages=[{"role":"user","content":compact(payload)}],tools=tools) or {}
                        latency=round((time.perf_counter()-provider_started)*1000,2)
                        stage='provider_primary_ms' if kind=='primary' else 'provider_repair_ms' if kind in {'repair','resolution'} else 'provider_transport_retry_ms'
                        self.diagnostics[stage]=self.diagnostics.get(stage,0)+latency
                        attempts=response.get("attempts",[])
                        for recorded_attempt in attempts:
                            recorded_attempt['latency_ms']=max(recorded_attempt.get('latency_ms',0),
                                round((time.monotonic()-provider_wall_started)*1000,2))
                        # One logical call may contain exactly one bounded credential
                        # failover (V3.2); any other nested transport is forbidden.
                        # The transport layer owns recovery: at most one extra attempt, either a credential
                        # failover or one same-payload resend (never both, never a third physical attempt).
                        if len(attempts)>2 or (len(attempts)==2 and not (attempts[1].get('credential_failover') or attempts[1].get('transport_resend'))):
                            raise AnalysisError("provider_transport_nested","Nested transport attempts forbidden")
                        self.diagnostics['transport_retry_count']+=sum(1 for a in attempts if a.get('transport_resend'))
                        self.diagnostics["provider_calls"].extend(attempts)
                        self.diagnostics["logical_provider_calls"]=self.diagnostics.get("logical_provider_calls",0)+1
                        self.diagnostics["provider_http_attempts"]=self.diagnostics.get("provider_http_attempts",0)+len(attempts)
                        if any(a.get('credential_failover') for a in attempts):
                            self.diagnostics["credential_failover_used"]=True
                        if attempts and attempts[-1].get("credential_slot"):
                            self.diagnostics["credential_slot"]=attempts[-1]["credential_slot"]
                        self.diagnostics["agent_rounds"]=self.turn.budget.used
                        self.turn.budget.remaining()
                        raw=self.read_response(response,delta=tools[0]["name"] == "submit_analysis_delta")
                    # A repair answer identical to an earlier answer cannot progress.
                    outputs=self.diagnostics.setdefault('provider_output_digests',[])
                    repeated_output=digest(raw) in outputs
                    outputs.append(digest(raw))
                    if kind == "primary" and isinstance(raw.get("requirements"), list):
                        if not refinement:
                            aliases={r['id']:'r_'+digest(r['id'])[:24] for r in raw['requirements']
                                if isinstance(r,dict) and isinstance(r.get('id'),str) and r['id']
                                and not re.fullmatch(r'[a-z][a-z0-9_]{0,39}',r['id'])}
                            for item in raw['requirements']:
                                if isinstance(item,dict):
                                    for field in ('id','supporting_for'):
                                        if isinstance(item.get(field),str) and item[field] in aliases:item[field]=aliases[item[field]]
                            if aliases:self.diagnostics.setdefault('semantic_normalizations',[]).append(
                                dict(field='id',rule='opaque_requirement_ids',count=len(aliases)))
                        self.raw_requirements = {r["id"]:deepcopy(r) for r in raw["requirements"] if isinstance(r,dict) and isinstance(r.get("id"),str)}
                    if isinstance(raw.get('requirements'), list):
                        self.diagnostics.setdefault('draft_shapes', []).append(dict(phase=kind, requirements=draft_shapes(raw,self.catalog)))
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
                    if not refinement and not context.get('dashboard_template'):
                        from services.request_anchors import complete_unique_grouping, complete_explicit_granularity, normalize_population_disclosures
                        intent,completed=normalize_population_disclosures(intent,self.anchors)
                        from services.request_anchors import complete_population_filters
                        intent,populations=complete_population_filters(intent,self.anchors,self.catalog)
                        completed += populations
                        intent,groupings=complete_unique_grouping(intent,self.anchors,resolver.index)
                        completed += groupings
                        intent,cadences=complete_explicit_granularity(intent,self.anchors)
                        completed += cadences
                        if kind=='primary':
                            from services.request_anchors import normalize_explicit_grains
                            intent,grains=normalize_explicit_grains(intent,self.anchors,self.catalog)
                            completed += grains
                        from services.request_anchors import normalize_explicit_metrics
                        intent,metrics=normalize_explicit_metrics(intent,self.anchors,self.catalog)
                        completed += metrics
                        from services.semantic_preflight_contract import enforce_metric_locks
                        intent,locked,conflicts=enforce_metric_locks(intent,self.metric_locks,self.catalog)
                        completed += locked
                        from services.request_anchors import complete_governed_roles
                        intent,roles=complete_governed_roles(intent,self.anchors,self.catalog,prompt)
                        completed+=roles
                        if conflicts:
                            self.diagnostics.setdefault('semantic_lock_conflicts',[]).extend(conflicts)
                        from services.request_anchors import complete_default_time, complete_explicit_time
                        intent,explicit_times=complete_explicit_time(intent,self.anchors)
                        completed += explicit_times
                        intent,default_times=complete_default_time(intent,self.anchors,prompt,self.catalog,self.reference)
                        if kind=='primary':
                            from services.scope_resolution_service import complete_derived_cohort_axis
                            intent,cohort_completion=complete_derived_cohort_axis(intent,self.anchors['scope_resolution'],self.catalog)
                            completed+=cohort_completion
                        completed += default_times
                        from services.analysis_intent import normalize_whole_scope_features
                        intent,whole_scope=normalize_whole_scope_features(intent)
                        completed += whole_scope
                        if kind == 'primary':
                            from services.analysis_intent import remove_inactive_feature_bindings
                            intent,inactive=remove_inactive_feature_bindings(intent)
                            completed += inactive
                            from services.request_anchors import complete_explicit_share_targets
                            intent,bindings=complete_explicit_share_targets(intent,self.anchors,self.catalog)
                            completed += bindings
                            from services.analysis_intent import decompose_scalar_draft
                            intent,scalars=decompose_scalar_draft(intent)
                            completed += scalars
                            from services.analytical_resolver import drop_unrequested_feature_conflicts
                            intent,dropped=drop_unrequested_feature_conflicts(intent,self.anchors)
                            completed += dropped
                        # A field-targeted repair can introduce the same cohort
                        # shape as a primary interpretation. Preserve dependency
                        # meaning at every candidate boundary, before resolution.
                        from services.request_anchors import normalize_cohort_cross_tabs, complete_coordinated_axes
                        intent,crossed=normalize_cohort_cross_tabs(intent,self.anchors)
                        completed += crossed
                        intent,coordinated=complete_coordinated_axes(intent,self.anchors,resolver.index)
                        completed += coordinated
                        previous=intent
                        if completed:self.diagnostics.setdefault('semantic_normalizations',[]).extend(completed)
                    self.diagnostics["failure_stage"]="ANALYTICAL_RESOLUTION"
                    resolution_started=time.perf_counter()
                    # Resolve lookup references into semantic meaning BEFORE IDs
                    # and fingerprints are generated; preflight cannot mutate scope.
                    for req in intent.requirements:
                        if req.availability == "requested" and not req.supporting_for and all(f.dimension in resolver.index.dimensions for f in req.filters):
                            normalized = resolver.normalize(req)
                            data = normalized.model_dump(mode="json")
                            try:
                                self.ground_values(data)
                            except UnresolvedFilter as error:
                                # "đồ uống"/"món" name the governed subject itself, not a category value:
                                # an ungroundable filter made only of subject synonyms restricts nothing.
                                from services.value_grounding_service import value_text
                                synonyms={value_text(a) for s in self.catalog.registry['subjects'].values()
                                          for a in [s['business_name'],*s.get('aliases',[])]}
                                kept=[f for f in data.get('filters',[]) if not (f.get('operator') in ('eq','in') and
                                      all(value_text(v) in synonyms for v in (f['value'] if isinstance(f['value'],list) else [f['value']])))]
                                if len(kept)==len(data.get('filters',[])):
                                    raise AnalysisError("filter_value_ambiguous" if error.resolution['status']=='ambiguous' else "filter_value_unknown",
                                        "Grounded dimension value requires clarification",choices=error.resolution.get('choices',[])) from None
                                data['filters']=kept
                                self.diagnostics.setdefault('semantic_normalizations',[]).append({'rule':'subject_synonym_not_a_filter','requirement_id':req.id})
                                self.ground_values(data)
                            req.filters = IntentRequirement.model_validate(data).filters
                    try:
                        resolved=resolver.resolve(intent)
                    except ResolutionIssues as error:
                        # Report independent coverage gaps with the resolver
                        # conflict in the SAME repair, rather than spending the
                        # last call discovering a previously visible omission.
                        # This runs only after an authorized intent was accepted;
                        # rejected repair fields never gain new permissions.
                        try:
                            draft=[resolver.normalize(r) for r in intent.requirements]
                            coverage_issues=verify_anchors(self.anchors,draft,self.reference,self.catalog)
                        except (AnalysisError,ValueError,TypeError,KeyError):
                            coverage_issues=[]  # Invalid scope remains a resolver error.
                        error.issues.extend(i for i in coverage_issues if i not in error.issues)
                        raise
                    before={r.id:r for r in intent.requirements}
                    for req in resolved['intent'].requirements:
                        if req.id not in before:  # Deterministic supporting views added on refinement.
                            continue
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
                    from services.analysis_expansion_service import depth_selection, dashboard_policy
                    depth,origin=depth_selection(resolved['intent'],resolver.index,{**context,
                        'request_breadth':self.anchors.get('analysis_breadth'),
                        'narrow_top_n':dashboard_policy(self.catalog).get('narrow_top_n',5)})
                    context['depth_selection_origin']=origin
                    context['requested_depth']=context.get('analysis_depth') if context.get('analysis_depth_explicit') else None
                    context['minimum_visuals']=dashboard_policy(self.catalog,depth)['minimum_views']
                    context['server_supporting_expansion']=depth
                    resolved=resolver.resolve(resolved['intent'])
                    if context.get('analysis_mission'):
                        # Mission reports are judged on relevant planned views, not a
                        # generic count: the floor is what the mission can honestly show.
                        from services.analysis_expansion_service import estimated_views
                        context['minimum_visuals']=min(context['minimum_visuals'],max(1,estimated_views(resolved['operations'],self.catalog,context['fixed_grouping_policy'])))
                    self.diagnostics['resolver_latency_ms']=round((time.perf_counter()-resolution_started)*1000,2)
                    break
                except (ResolutionIssues,ValidationError) as error:
                    self.diagnostics["contract_rejection_count"]+=1
                    if context.get("guided_intent") is not None:
                        # A guided contract is server-built; a rejection is a typed
                        # contract failure, never an occasion for an AI repair call.
                        self.diagnostics.update(failure_stage="SEMANTIC_CONTRACT",capability_status="INVALID_CONTRACT",
                            contract_issues=error.issues if isinstance(error,ResolutionIssues) else [])
                        raise AnalysisError("guided_contract_invalid","Guided contract failed governed validation") from None
                    new_issues=error.issues if isinstance(error,ResolutionIssues) else [{"requirement_id":None,"field":"envelope","code":"invalid_intent_shape"}]
                    # A rejected repair never changes the target authority of
                    # the next call. In particular it cannot unlock a frozen r1.
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
                    if kind in {"primary","transport"} and previous is not None:
                        # Early normalizers can reject one field before the
                        # resolver sees independent errors in other siblings.
                        # Probe without grounding, execution or accepting scope;
                        # the original baseline and frozen-field guard survive.
                        try:
                            resolver.resolve(previous)
                        except ResolutionIssues as independent:
                            new_issues = list(new_issues) + [i for i in independent.issues if i not in new_issues]
                        except AnalysisError:
                            pass  # A diagnostic probe cannot replace the original rejection.
                        try:
                            probe=previous.model_copy(deep=True)
                            unclassified={r.id for r in probe.requirements
                                if r.availability!='requested' and not r.reason}
                            # A reasonless limitation is an invalid classification,
                            # not an accepted metric/time baseline. Diagnose the
                            # explicit input conflicts together before freezing a
                            # single bounded repair. This probe accepts no work.
                            if unclassified:
                                for req in probe.requirements:
                                    if req.id in unclassified:req.availability='requested'
                                from services.semantic_preflight_contract import enforce_metric_locks
                                probe,changes,_=enforce_metric_locks(probe,self.metric_locks,self.catalog)
                                new_issues += [dict(requirement_id=c['requirement_id'],field='metric_ids',
                                    code='explicit_metric_definition_mismatch',protected_metric_ids=c['value'])
                                    for c in changes if c['requirement_id'] in unclassified]
                                try:
                                    resolver.resolve(probe)
                                except ResolutionIssues as classification_dependencies:
                                    new_issues += [i for i in classification_dependencies.issues if i not in new_issues]
                            independent = verify_anchors(self.anchors,
                                [resolver.normalize(r) for r in probe.requirements],self.reference,self.catalog)
                            new_issues += [i for i in independent if i not in new_issues]
                        except (AnalysisError,ValueError,TypeError,KeyError):
                            pass
                    explicit_features={f for a in self.anchors['features'] for f in a['candidate_ids']}
                    # An invented optional feature may be removed; only a
                    # user-requested calculation authorizes additional work.
                    new_issues=[i for i in new_issues if i['code']!='feature_requirement_decomposition'
                        or explicit_features.intersection(i.get('candidate_ids',[]))]
                    new_issues=list({compact(i):i for i in new_issues}.values())
                    if kind in {"primary","transport"} or not issues:
                        issues=new_issues
                    self.diagnostics.update(contract_issues=new_issues,agent_contract_status="invalid",agent_contract_error="semantic_intent_invalid",
                        failure_stage="SEMANTIC_COVERAGE" if any(i["code"].startswith("explicit_") for i in new_issues) else "SEMANTIC_INTENT",
                        failure_requirement_id=new_issues[0].get("requirement_id"),failure_field=new_issues[0]["field"],failure_code=new_issues[0]["code"],resolver_action="targeted_repair")
                    self.diagnostics.setdefault('root_contract_issues',deepcopy(new_issues))
                    self.diagnostics.setdefault('semantic_issue_history',[]).append(deepcopy(new_issues))
                    issue_history = self.diagnostics['semantic_issue_history']
                    if len(issue_history) > 1:
                        old_codes = {(i.get('requirement_id'), i['field'], i['code']) for i in issue_history[-2]}
                        new_codes = {(i.get('requirement_id'), i['field'], i['code']) for i in new_issues}
                        self.diagnostics.setdefault('recovery_progress', []).append(dict(
                            resolved_issue_count=len(old_codes-new_codes), new_issue_count=len(new_codes-old_codes),
                            repeated_issue_count=len(old_codes & new_codes)))
                    # Progress-aware repair: a repair returning an already seen
                    # unresolved state stops before another provider call.
                    fingerprint=issue_fingerprint(new_issues)
                    seen=self.diagnostics.setdefault('semantic_issue_fingerprints',[])
                    # Same fingerprint still counts as progress when fewer
                    # unknown IDs remain (one of two bad metrics was fixed).
                    unknown_counts=self.diagnostics.setdefault('semantic_unknown_id_counts',[])
                    unknown_count=sum(len(i.get('unknown_ids') or [None]) for i in new_issues if i.get('code')=='unknown_semantic_id')
                    narrowed=bool(unknown_counts) and unknown_count<unknown_counts[-1]
                    no_progress=kind in {'repair','resolution'} and (repeated_output or (fingerprint in seen and not narrowed))
                    seen.append(fingerprint); unknown_counts.append(unknown_count)
                    repairs_exhausted=self.diagnostics['contract_repair_count']>=semantic_repair_limit()
                    if (no_progress or repairs_exhausted or attempt+1>=self.turn.budget.max_calls
                            or not self.turn.budget.recovery_available()):
                        self.diagnostics['semantic_stop_reason']=('no_progress' if no_progress else
                            'repair_limit' if repairs_exhausted else 'provider_budget')
                        raise self.terminal_semantic_error(new_issues,no_progress,repaired=kind in {'repair','resolution'}) from None
                    targets={i.get("requirement_id") for i in issues}
                    rejected=[r.model_dump(mode="json",exclude_none=True,exclude_defaults=True) for r in previous.requirements if r.id in targets] if previous else []
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
                    if refinement and not domains:
                        # An envelope error has no target ID. Keep the complete
                        # approved baseline, but vocabulary need not replay all
                        # optional retrieval candidates from the primary call.
                        vocabulary_baseline=previous or AnalysisIntentEnvelope.model_validate(context['semantic_intent'])
                        domains={r.domain_id for r in vocabulary_baseline.requirements if r.domain_id}
                        feedback=request_anchors(prompt,self.catalog,context)
                        exact_metrics={a['candidate_ids'][0] for a in feedback['metrics'] if len(a['candidate_ids'])==1}
                        domains.update(d for d,p in resolver.index.domains.items() if exact_metrics.intersection(p['metric_refs']))
                    payload={"question":prompt,"ui":self.anchors["ui"],"reference_date":self.reference.isoformat(),
                        "validation_issues":issues,
                        "last_rejected_issues":[{k:i[k] for k in ('requirement_id','field','code') if k in i} for i in new_issues],
                        "affected_requirements":rejected,
                        "frozen_requirement_ids":[r.id for r in previous.requirements if r.id not in targets] if previous else [],
                        "vocabulary":self.vocabulary(domains or self.diagnostics["detailed_domain_ids"]),"domains":{"packs":[]}}
                    if cohort_contract(self.anchors):payload['cohort_contract']=cohort_contract(self.anchors)
                    payload['feature_target_options']=[dict(requirement_id=r.id,
                        metric_ids=r.metric_ids,
                        additive_metric_ids=[m for m in r.metric_ids if m in self.catalog.registry['metrics']
                            and self.catalog.registry['metrics'][m].get('additive')])
                        for r in previous.requirements if r.id in targets] if previous else []
                    from services.scope_resolution_service import scope_repair_patches
                    repair_scope=self.anchors.get('scope_resolution') or {}
                    if refinement:
                        feedback_scope=request_anchors(prompt,self.catalog,context).get('scope_resolution') or {}
                        if feedback_scope.get('bindings'):repair_scope=feedback_scope
                    patches=scope_repair_patches(repair_scope,previous,issues)
                    if patches:
                        payload['required_scope_patches']=patches
                        payload['scope_patch_rule']='Copy these exact diagnosed fields into the named targets; preserve all frozen fields. Correct other diagnosed feature fields too. A union must not be split into narrower scopes.'
                    if any(i.get('requirement_id') is None for i in issues):
                        payload['request_anchors'] = repair_anchor_context(self.anchors)
                        payload['addition_policy']='Use a new repair_add ID for omitted work. Existing untargeted requirements cannot change.'
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
                        payload['current_intent']=AnalysisIntentEnvelope.model_validate(context['semantic_intent']).model_dump(
                            mode='json',exclude_none=True,exclude_defaults=True)
                        payload['rejected_delta']=raw
                        payload['original_question']=original
                    self.diagnostics["contract_repair_count"]+=1
                    self.diagnostics["repaired_contract_issues"]=issues
                    kind="repair" if attempt==0 else "resolution"
                    logger.info("[AnalystRepair] %s",json.dumps({"attempt":attempt+2,"target_requirement_ids":sorted(str(t) for t in targets),"issue_codes":[i["code"] for i in issues],"frozen_requirement_ids":payload["frozen_requirement_ids"]}))
                except AnalysisError as error:
                    if error.category == 'resolver_internal':
                        self.diagnostics.update(failure_stage='ANALYTICAL_RESOLUTION',
                            resolver_action='inspect_server_without_semantic_retry',
                            resolver_diagnostic=getattr(error,'resolver_diagnostic',{}))
                    last=(response.get("attempts") or [{}])[-1]
                    delay=min(2,last.get('retry_after_seconds',0.15))+random.uniform(0,0.1)
                    # Both credentials already failed inside this logical call:
                    # a typed provider error, never another round (V3.2 §39).
                    exhausted=any(a.get('credential_failover') for a in response.get("attempts") or [])
                    transient=False  # V3.3: transport recovery is owned by the provider, never re-run by the planner
                    format_repair = error.category == "provider_invalid_json"
                    if self.diagnostics['contract_repair_count'] >= semantic_repair_limit():
                        raise
                    if not (transient or format_repair) or attempt+1>=self.turn.budget.max_calls or not self.turn.budget.recovery_available(delay if transient else 0):
                        raise
                    kind="transport" if transient else "repair" if attempt == 0 else "resolution"
                    if format_repair:
                        self.diagnostics["contract_repair_count"] += 1
                    if transient and isinstance(self.turn.provider,NativeAgentProvider):
                        time.sleep(delay)
                if isinstance(self.turn.provider,NativeAgentProvider):
                    self.turn.provider.reset()
                repair_sizes=body_sizes(system,payload,tools)
                if max(repair_sizes.values())>maximum and kind in {'repair','resolution'} and previous:
                    # Preserve authoritative definitions, but remove unrelated
                    # metric neighbors from an oversized targeted repair. IDs
                    # come from the retained draft and explicit request facts.
                    needed={m for r in previous.requirements for m in r.metric_ids}
                    needed.update(m for a in self.anchors['metrics'] for m in a['candidate_ids'])
                    needed.update(m for i in issues for m in i.get('metric_ids',[]))
                    vocab=payload.get('vocabulary',{})
                    if needed & {m[0] for m in vocab.get('metrics',[])}:
                        vocab['metrics']=[m for m in vocab['metrics'] if m[0] in needed]
                        payload.pop('last_rejected_issues',None)  # Full issues remain authoritative.
                        for req in payload.get('affected_requirements',[]):
                            for field in ('goal','lens_hint'):
                                req.pop(field,None)  # Labels never supply execution authority.
                        self.diagnostics.setdefault('pruned_optional_context_fields',[]).append('unrelated_repair_metrics')
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
            prepared = self._compile_resolved(resolved, context)
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
            depth=context['server_supporting_expansion']
            self.diagnostics.update(semantic_intent=resolved["intent"].model_dump(mode="json"),semantic_intent_fingerprint=resolved["intent_fingerprint"],
                resolved_plan_fingerprint=resolved["plan_fingerprint"],resolved_operations=resolved["operations"],resolver_version=resolved["resolver_version"],
                derived_feature_bindings=resolved["feature_bindings"],analysis_depth=depth,analysis_breadth=depth,
                target_visual_count=DEPTH_POLICIES[depth]["target_views"][-1],target_visual_range=DEPTH_POLICIES[depth]["target_views"],
                requested_operation_count=sum(a.query.role=='requested' for a in prepared.values()),
                registered_requested_operations=sum(a.query.role=='requested' for a in prepared.values()),
                supporting_operation_count=sum(a.query.role=='supporting' for a in prepared.values()),
                omitted_supporting_operation_count=len(context.get('omitted_supporting_ids',[]))+sum(c['requested_or_supporting']=='supporting' and c['status']!='planned' for c in resolved['components']),
                server_supporting_expansion=depth,minimum_visuals=context.get('minimum_visuals',0),omitted_supporting_ids=context.get('omitted_supporting_ids',[]),
                requested_depth=context.get('requested_depth'),effective_depth=depth,depth_selection_origin=context.get('depth_selection_origin'),
                lens_plan={k:v for k,v in (resolved.get('lens_plan') or {}).items() if k!='shapes'} or None,
                agent_contract_status="valid",agent_contract_error=None,semantic_status="grounded",failure_stage=None,terminal_error=None,contract_issues=[])
            if any(c["status"]!="planned" and c["requested_or_supporting"]=="requested" for c in resolved["components"]) and not self.proposal:
                raise AnalysisError("approval_required","Partial requirements need current explicit approval")
            return self._execute_prepared(prepared)
        except Exception as error:
            if getattr(error,"category",None)=="result_contract":
                self.diagnostics["failure_stage"]="RESULT_VALIDATION"
            self.diagnostics["terminal_error"]=getattr(error,"category","internal")
            raise
        finally:
            self._finalize_diagnostics(started)
