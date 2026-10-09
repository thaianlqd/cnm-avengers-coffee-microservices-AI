"""Deterministic compatibility, minimal decomposition and requirement coverage."""
import hashlib
import json
import logging
from copy import deepcopy
from itertools import combinations
from functools import lru_cache
from collections import OrderedDict
from threading import Lock
from services.analysis_catalog import AnalysisError
from services.analysis_intent import AnalysisIntentEnvelope
from services.analysis_contract import TimeSpec
from services.domain_intelligence_service import DomainIntelligence
from services.semantic_manifest_service import build_manifest, manifest_references
from services.time_resolution_service import resolve_time

VERSION = "2.8.0"
logger = logging.getLogger("ai-analytics")
_indexes, _lock = OrderedDict(), Lock()


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                     separators=(",", ":"), default=str).encode()).hexdigest()


def requirement_meaning(requirement, reference=None, catalog=None):
    data = requirement.model_dump(mode="json", exclude_none=True)
    for k in ("id", "goal", "lens_hint", "domain_id"):
        data.pop(k, None)
    for k in ("metric_ids", "dimension_ids", "derived_features"):
        data[k] = sorted(set(data[k]))
    if data.get('feature_metrics'):
        data['feature_metrics']={f:sorted(set(ms)) for f,ms in data['feature_metrics'].items()}
    else:
        data.pop('feature_metrics',None)
    filters = []
    for f in data["filters"]:
        if f["operator"] == "in":
            f["value"] = sorted(set(f["value"]), key=lambda v: json.dumps(v, sort_keys=True))
        filters.append(f)
    data["filters"] = sorted(filters, key=lambda f: digest(f))
    if reference and catalog:
        data["time"] = resolve_time(data.get("time", {"kind":"relative", "mode":"all_time"}), reference, catalog.registry["timezone"])[2]
    return data


def intent_fingerprint(intent, reference=None, catalog=None):
    meanings={digest(requirement_meaning(r,reference,catalog)):requirement_meaning(r,reference,catalog) for r in intent.requirements}
    return digest([meanings[k] for k in sorted(meanings)])


def plan_fingerprint(operations, coverage, catalog_fingerprint):
    # Requirement IDs/goals are labels, never execution authority. Coverage is
    # represented by operation content plus availability/features, not labels.
    by_id = {op["id"]: op for op in operations}
    def meaning(op):
        return {k:v for k,v in op.items() if k not in {"id", "parent_id", "replaces", "changed_fields"}}
    requirements = [{"state": c["state"], "reason": c.get("reason"),
                     "features": c["derived_features"],
                     "operations": sorted((meaning(by_id[id]) for id in c["operation_ids"]), key=digest)} for c in coverage]
    unique={digest(r):r for r in requirements}
    return digest([VERSION, catalog_fingerprint, [unique[k] for k in sorted(unique)]])


class CompatibilityIndex:
    def __init__(self, catalog):
        manifest, _ = build_manifest(catalog, max_chars=2_000_000)
        if not manifest['complete']:
            raise AnalysisError('domain_metadata_invalid','Complete compatibility index exceeds bounded server capacity')
        self.references = manifest_references(manifest)
        self.subjects = {s[0]: {**catalog.registry["subjects"][s[0]], "detail_columns":s[5]} for s in manifest["subjects"]}
        self.metrics = {}
        self.dimensions = {d[0]: {"metrics": [], "subjects": []} for d in manifest["dimensions"]}
        for row in manifest["metrics"]:
            id = row[0]; m = catalog.registry["metrics"][id]
            self.metrics[id] = {"subjects": sorted(set(m["subjects"]) & self.subjects.keys()),
                "dimensions": catalog.compatible_dimensions(id), "lenses": [], "historical": bool(m.get("time_column")),
                "population": digest([m["source"], m.get("time_column"), m.get("business_filters", []), m.get("required_non_null", [])])}
            for d in self.metrics[id]["dimensions"]:
                self.dimensions[d]["metrics"].append(id)
                self.dimensions[d]["subjects"] = sorted(set(self.dimensions[d]["subjects"]) | set(self.metrics[id]["subjects"]))
        self.domains = DomainIntelligence(catalog).available()
        self.lenses = {}
        for domain, p in self.domains.items():
            for lens in p["analytical_lenses"]:
                self.lenses[lens["id"]] = {**lens, "domain_id":domain}
                for m in lens["metric_refs"]:
                    if m in self.metrics:
                        self.metrics[m]["lenses"].append(lens["id"])
        self.subject_dimensions = {s: sorted({d for m in v["metrics"] if m in self.metrics for d in self.metrics[m]["dimensions"]}) for s,v in self.subjects.items()}
        self.features = deepcopy(catalog.registry.get("derived_features", {}))


def compatibility_index(catalog):
    with _lock:
        if catalog.fingerprint not in _indexes:
            _indexes[catalog.fingerprint] = CompatibilityIndex(catalog)
            while len(_indexes) > 8:
                _indexes.popitem(last=False)
        return _indexes[catalog.fingerprint]


class ResolutionIssues(AnalysisError):
    def __init__(self, issues):
        super().__init__("semantic_intent_invalid", "Semantic interpretation needs targeted recovery")
        self.issues = issues


class AnalyticalResolver:
    def __init__(self, catalog, reference, ui=None):
        self.catalog, self.reference, self.ui = catalog, reference, ui or {}
        self.index = compatibility_index(catalog)

    def issue(self, req, field, code, **extra):
        return {"requirement_id": req.id, "field":field, "code":code, **extra}

    def validate_time(self, req):
        """Only errors at the time boundary authorize a time-only repair."""
        from services.analysis_contract import TIME_SHAPES
        try:
            supplied = req.time.model_dump(mode='json', exclude_none=True) if req.time else {'kind':'relative','mode':'all_time'}
            required, optional = TIME_SHAPES[supplied['kind']]
            _, _, period = resolve_time(supplied, self.reference, self.catalog.registry['timezone'])
            extras = set(supplied) - {'kind', *required, *optional}
            # Historical stored rolling/calendar scopes carry resolved dates.
            # Admit only exactly matching redundant bounds; never choose between
            # contradictory windows or discard another kind's non-null fields.
            if any(f not in {'start','end'} or supplied[f] != period[f] for f in extras):
                raise ValueError('contradictory time fields')
        except AnalysisError:
            raise
        except (ValueError, OverflowError):
            required = TIME_SHAPES[req.time.kind][0] if req.time else ()
            raise ResolutionIssues([self.issue(req, 'time', 'invalid_time_shape',
                required_fields=list(required))]) from None

    def normalize(self, req):
        req = req.model_copy(deep=True)
        req.metric_ids = sorted(set(req.metric_ids))
        req.dimension_ids = sorted(set(req.dimension_ids))
        req.derived_features = sorted(set(req.derived_features))
        req.feature_metrics={f:sorted(set(ms)) for f,ms in req.feature_metrics.items()}
        # Catalog metric IDs are aggregations. A table of SUM/COUNT/AVG by a
        # business axis is an aggregate, even if the model calls it detail.
        # Pure row projections still use the strict detail path below.
        if req.analysis_kind=='detail' and req.metric_ids and not req.granularity:
            req.analysis_kind='aggregate'
        # A comparison across two city VALUES still has one grouping dimension.
        # Resolve its executable shape here without inventing a second dimension
        # or changing any metric, filter, period or population. Real two-axis
        # cross-tabs retain both axes and their strict compiler rules.
        if req.analysis_kind == 'comparison' or req.analysis_kind == 'cross_tab' and len(req.dimension_ids) == 1:
            req.analysis_kind = 'aggregate'
        from services.value_grounding_service import aliases_for, dimension_values, value_text
        for f in req.filters:
            if f.dimension in self.catalog.registry["dimensions"]:
                aliases = aliases_for(self.catalog,f.dimension,dimension_values(self.catalog,f.dimension))
                f.value = [aliases.get(value_text(v),v) for v in f.value] if isinstance(f.value,list) else aliases.get(value_text(f.value),f.value)
        if req.ranking:
            req.dimension_ids = sorted(set(req.dimension_ids + req.ranking.per_group))
            req.analysis_kind = "ranking"
            if not req.ranking.metric_id and len(req.metric_ids) == 1:
                req.ranking.metric_id = req.metric_ids[0]
        # The observation clock is already projected as the compiler's period.
        # Grouping by its raw timestamp as well would split each weekly bucket
        # into individual order instants. Preserve all independent business axes
        # and every timestamp filter; only remove this redundant clock grouping.
        metrics=[self.catalog.registry['metrics'].get(m,{}) for m in req.metric_ids]
        if req.analysis_kind=='trend' and metrics and all(m.get('time_column') for m in metrics):
            clocks={m['time_column'] for m in metrics}
            if len(clocks)==1:
                clock=next(iter(clocks))
                def is_clock(d):
                    desc=self.catalog.registry['dimensions'].get(d,{})
                    return (desc.get('expression') or desc.get('table','')+'.'+desc.get('column',''))==clock
                req.dimension_ids=[d for d in req.dimension_ids if not is_clock(d)]
        # A complete scalar aggregate already is the requested whole-scope
        # total/average. selected_total describes a Top N cohort, not this KPI.
        if req.analysis_kind=='aggregate' and not req.dimension_ids and 'selected_total' in req.derived_features:
            req.derived_features=sorted((set(req.derived_features)-{'selected_total'})|{'scalar'})
            req.feature_metrics.pop('selected_total',None)
        # UI time outranks question time, by the documented precedence rule.
        period = self.ui.get("required_period")
        if period:
            req.time = TimeSpec.model_validate(
                {"kind":"range", **period} if period.get("start") else {"kind":"relative", "mode":"all_time"})
        required = [*self.ui.get("required_filters", []), *([self.ui["required_filter"]] if self.ui.get("required_filter") else [])]
        from services.analysis_contract import Filter
        for f in required:
            if any(old.dimension == f["dimension"] and old.model_dump(mode="json") != f for old in req.filters):
                raise ResolutionIssues([self.issue(req, "filters", "scope_conflict")])
            if not any(old.model_dump(mode="json") == f for old in req.filters):
                req.filters.append(Filter.model_validate(f))
        if self.ui.get("scope_mode") == "all" and req.filters:
            raise ResolutionIssues([self.issue(req, "filters", "scope_conflict")])
        req.filters.sort(key=lambda f: digest(f.model_dump(mode="json")))
        return req

    def candidates(self, req, metrics):
        r, index = self.catalog.registry, self.index
        if not metrics:
            return []
        subjects = set.intersection(*(set(index.metrics[m]["subjects"]) for m in metrics))
        required_domain = self.ui.get("required_domain")
        if required_domain:
            subjects &= set(index.domains[required_domain]["primary_subjects"])
        if self.ui.get("required_subject"):
            subjects &= {self.ui["required_subject"]}
        dimensions = set(req.dimension_ids + [f.dimension for f in req.filters] + (req.ranking.per_group if req.ranking else []))
        if any(not dimensions <= set(index.metrics[m]["dimensions"]) for m in metrics):
            return []
        if len({index.metrics[m]["population"] for m in metrics}) != 1:
            return []
        period = resolve_time((req.time.model_dump(mode="json", exclude_none=True) if req.time else {"kind":"relative","mode":"all_time"}), self.reference, r["timezone"])[2]
        if (period["start"] or req.analysis_kind == "trend") and any(not index.metrics[m]["historical"] for m in metrics):
            return []
        choices = []
        for subject in sorted(subjects):
            for lens_id, lens in sorted(index.lenses.items()):
                b = lens.get("blueprint")
                if (not b or b["subject"] != subject or req.analysis_kind not in b["allowed_operations"]
                    or not set(metrics) <= set(b["allowed_metric_refs"]) or not set(b["required_metric_refs"]) <= set(metrics)
                    or req.dimension_ids not in b["allowed_groupings"]
                    or req.analysis_kind == "trend" and req.granularity not in b["allowed_granularities"]):
                    continue
                choices.append((subject,lens_id))
            # An ad-hoc canonical subject still passes every catalog/compiler
            # rule. It never weakens a selected blueprint's compatibility.
            choices.append((subject,None))
        # Advisory hints cannot cause otherwise equivalent meanings to acquire
        # different fingerprints. Canonical lens choice is independent of hint.
        choices.sort(key=lambda c: (c[1] is None, c[0], c[1] or ""))
        return choices

    def resolve_requirement(self, raw):
        req = self.normalize(raw)
        self.validate_time(req)
        if req.availability != "requested":
            if not req.reason:
                raise ResolutionIssues([self.issue(req,"reason","limitation_reason_required")])
            return req, [], req.availability.upper(), req.reason, []
        issues = []
        for field, ids, known in (("metric_ids",req.metric_ids,self.catalog.registry["metrics"]), ("dimension_ids",req.dimension_ids,self.catalog.registry["dimensions"]), ("filters",[f.dimension for f in req.filters],self.catalog.registry["dimensions"])):
            if any(id not in known for id in ids):
                issues.append(self.issue(req,field,"unknown_semantic_id",candidate_ids=sorted(known)))
        if issues:
            raise ResolutionIssues(issues)
        if any(m not in self.index.metrics for m in req.metric_ids):
            return req, [], "INSUFFICIENT_DATA", "metric_unavailable", []
        if req.analysis_kind == "detail":
            return self.resolve_detail(req)
        if not req.metric_ids:
            # A lens can supply an unambiguous semantic default. The model still
            # never authors the resulting executable shape.
            lens = self.index.lenses.get(req.lens_hint, {})
            b = lens.get("blueprint") or {}
            if not b.get("default_metric_refs"):
                raise ResolutionIssues([self.issue(req,"metric_ids","metric_required")])
            req.metric_ids = sorted(b["default_metric_refs"])
            req.analysis_kind = req.analysis_kind or b["default_operation"]
            req.dimension_ids = req.dimension_ids or b.get("default_grouping") or []
            req.granularity = req.granularity or b.get("default_granularity")
            if req.analysis_kind == "ranking" and not req.ranking and b.get("ranking_default_top_n"):
                from services.analysis_intent import IntentRanking
                req.ranking = IntentRanking(limit=b["ranking_default_top_n"], metric_id=req.metric_ids[0] if len(req.metric_ids)==1 else None)
        if not req.analysis_kind:
            raise ResolutionIssues([self.issue(req,"analysis_kind","analysis_kind_required")])
        if req.analysis_kind in {"ranking","distribution","cross_tab","relationship"} and not req.dimension_ids:
            raise ResolutionIssues([self.issue(req,"dimension_ids","grouping_required")])
        if req.analysis_kind == "ranking" and (not req.ranking or req.ranking.metric_id not in req.metric_ids):
            raise ResolutionIssues([self.issue(req,"ranking","ranking_metric_required",candidate_ids=req.metric_ids)])
        if req.analysis_kind == "cross_tab" and len(req.dimension_ids) != 2:
            raise ResolutionIssues([self.issue(req,"dimension_ids","two_dimensions_required")])
        if req.analysis_kind == "relationship" and len(req.metric_ids) != 2:
            raise ResolutionIssues([self.issue(req,"metric_ids","paired_metrics_required")])
        if req.analysis_kind == "trend" and not req.granularity:
            # Missing cadence is a server presentation policy. Explicit cadence
            # has already been completed/checked by request anchors and is never
            # changed here. Prefer week, then coarser exact calendar buckets.
            from services.analytical_capacity_planner import AnalyticalCapacityPlanner, period_count
            from services.value_profile_service import profiles_for
            planner = AnalyticalCapacityPlanner(self.catalog, profiles_for(self.catalog))
            period = resolve_time(req.time.model_dump(mode='json', exclude_none=True) if req.time else
                                  {'kind':'relative','mode':'all_time'},self.reference,self.catalog.registry['timezone'])[2]
            counts = [planner.dimension_count(d, req.filters) for d in req.dimension_ids]
            from math import prod
            groups = prod(counts) if all(v is not None for v in counts) else 1
            for cadence in ('week','month','quarter','year'):
                periods = period_count(period, cadence)
                if periods is None or groups*periods <= planner.contract.execution_rows:
                    req.granularity = cadence
                    break
            if not req.granularity:
                raise AnalysisError('capacity_requires_choice','Implicit trend population requires smaller scope')
        period = resolve_time(req.time.model_dump(mode="json", exclude_none=True) if req.time else {"kind":"relative","mode":"all_time"},self.reference,self.catalog.registry["timezone"])[2]
        if (period["start"] or req.analysis_kind == "trend") and any(not self.index.metrics[m]["historical"] for m in req.metric_ids):
            return req, [], "INSUFFICIENT_DATA", "historical_data_unavailable", []
        required_shapes = {"scalar":{"aggregate"}, "leader":{"ranking"}, "top_gap":{"ranking"}, "selected_total":{"ranking"},
            "change":{"trend"}, "change_pct":{"trend"}, "concentration":{"distribution"},
            "group_gap":{"aggregate","cross_tab"}, "relationship_strength":{"relationship"},
            "contribution_share":{"aggregate","ranking","distribution","cross_tab"}}
        additive_features={'contribution_share','concentration','selected_total'}
        ranked_features={'leader','top_gap','selected_total'}
        targets={}; feature_issues=[]; invalid_bindings=set()
        for feature, selected in req.feature_metrics.items():
            if feature not in req.derived_features or not selected or len(selected)>6 or not set(selected)<=set(req.metric_ids):
                invalid_bindings.add(feature)
                feature_issues.append(self.issue(req,'feature_metrics','invalid_feature_metric_targets',
                    feature=feature,allowed_metric_ids=req.metric_ids,
                    binding_failure='inactive_feature' if feature not in req.derived_features else
                        'empty_targets' if not selected else 'targets_outside_requirement',
                    expected_shapes=sorted(required_shapes[feature])))
        conflicting_shapes={f for f in req.derived_features if req.analysis_kind not in required_shapes[f]
                            or f=='scalar' and req.dimension_ids}
        protected_features=sorted(set(req.derived_features)-conflicting_shapes-invalid_bindings)
        for feature in req.derived_features:
            selected=req.feature_metrics.get(feature)
            if selected is None:
                selected=([req.ranking.metric_id] if req.ranking and feature in ranked_features|{'contribution_share'}
                          else [m for m in req.metric_ids if feature not in additive_features or self.catalog.registry['metrics'][m].get('additive')])
            targets[feature]=set(selected)
            if feature in ranked_features and req.ranking and set(selected)!={req.ranking.metric_id}:
                feature_issues.append(self.issue(req,'feature_metrics','ranking_feature_target_mismatch',
                    feature=feature,allowed_metric_ids=[req.ranking.metric_id]))
            if feature in conflicting_shapes:
                # A malformed semantic feature is repairable interpretation,
                # not proof that the requested business metrics are unavailable.
                feature_issues.extend([self.issue(req,'derived_features','feature_shape_conflict',
                    feature=feature,expected_shapes=sorted(required_shapes[feature]),
                    protected_features=protected_features),
                    self.issue(req,'feature_metrics','feature_shape_binding_conflict',feature=feature),
                    {'requirement_id':None,'field':'derived_features','code':'feature_requirement_decomposition',
                     'candidate_ids':[feature],'metric_ids':req.feature_metrics.get(feature,req.metric_ids)}])
        # Collect ALL independently visible conflicts before bounded recovery.
        # Otherwise call 2 fixes a binding only to discover the shape on call 3,
        # and valid-looking siblings incorrectly freeze other invalid features.
        if feature_issues:
            raise ResolutionIssues(feature_issues)
        for feature in req.derived_features:
            selected=targets[feature]
            if (not selected
                or feature in ranked_features and set(selected)!={req.ranking.metric_id}
                or feature in additive_features and any(not self.catalog.registry['metrics'][m].get('additive') for m in selected)):
                return req, [], "UNSUPPORTED", "definition_unavailable", []
        metrics = tuple(req.metric_ids)
        possible = {}
        for size in range(1,len(metrics)+1):
            for subset in combinations(metrics,size):
                choices = self.candidates(req,subset)
                if choices:
                    possible[frozenset(subset)] = choices[0]
        @lru_cache(None)
        def partition(remaining):
            remaining = frozenset(remaining)
            if not remaining:
                return ()
            options = []
            for subset in possible:
                if subset <= remaining:
                    tail = partition(tuple(sorted(remaining-subset)))
                    if tail is not None:
                        options.append((tuple(sorted(subset)),)+tail)
            return min(options,key=lambda p:(len(p),p)) if options else None
        parts = partition(metrics)
        if parts is None:
            return req, [], "UNSUPPORTED", "definition_unavailable", []
        if len(parts)>1 and req.analysis_kind in {"ranking","relationship","distribution"}:
            # Independent rankings/compositions of different populations would
            # silently change the requested cohort or denominator.
            return req, [], "NEEDS_INPUT", "ambiguous_criterion", []
        operations, bindings = [], []
        base = requirement_meaning(req,self.reference,self.catalog)
        time = {"kind":"range","start":period["start"],"end":period["end"]} if period["start"] else {"kind":"relative","mode":"all_time"}
        for subset in parts:
            subject,lens = possible[frozenset(subset)]
            op = {"id":"q_"+digest([base,subset])[:24], "subject":subject,"operation":req.analysis_kind,
                  "metrics":list(subset),"group_by":req.dimension_ids,"filters":[f.model_dump(mode="json") for f in req.filters],
                  "time":time,"role":"requested"}
            if lens:
                op["lens_id"] = lens
            if req.granularity:
                op["granularity"] = req.granularity
            if req.ranking:
                op["ranking"] = {"metric":req.ranking.metric_id,"direction":"DESC" if req.ranking.direction=="top" else "ASC",
                                 "top_n":req.ranking.limit,"per_group":req.ranking.per_group}
            operations.append(op)
            for feature in req.derived_features:
                selected=sorted(targets[feature]&set(subset))
                if not selected:
                    continue
                binding = {"requirement_id":req.id,"feature":feature,"query_id":op["id"],"metric_ids":selected}
                if feature == "contribution_share":
                    share_metrics = selected
                    binding["metric_ids"] = share_metrics
                    denominator = {**op,"id":"q_"+digest([base,subset,"denominator"])[:24],"operation":"aggregate",
                                   "group_by":req.ranking.per_group if req.ranking else [], "metrics":share_metrics}
                    for field in ("ranking","granularity","lens_id"):
                        denominator.pop(field,None)
                    operations.append(denominator)
                    binding["denominator_query_id"] = denominator["id"]
                bindings.append(binding)
            logger.info("[AnalystResolver] %s",json.dumps({"requirement_id":req.id,"candidate_count":len(possible),"selected_subject":subject,
                "selected_lens":lens,"operation_count":len(parts),"split_reason":"population_or_subject" if len(parts)>1 else None,"derived_features":req.derived_features,"result":"RESOLVED"}))
        return req,operations,"RESOLVED",None,bindings

    def resolve_detail(self, req):
        if req.metric_ids or req.derived_features or req.ranking:
            raise ResolutionIssues([self.issue(req,"analysis_kind","detail_aggregate_conflict")])
        if not req.dimension_ids:
            raise ResolutionIssues([self.issue(req,"dimension_ids","detail_fields_required")])
        required = set(req.dimension_ids + [f.dimension for f in req.filters])
        domain = self.ui.get("required_domain") or req.domain_id
        subjects = [s for s,v in self.index.subjects.items() if required <= set(v.get("detail_columns",[]))
                    and (not domain or domain in self.index.domains and s in self.index.domains[domain]["primary_subjects"])]
        if not subjects:
            return req, [], "UNSUPPORTED", "definition_unavailable", []
        sources = {self.index.subjects[s].get("detail_source") for s in subjects}
        if len(sources)>1:
            return req, [], "NEEDS_INPUT", "ambiguous_criterion", []
        subject = sorted(subjects)[0]
        period = resolve_time(req.time.model_dump(mode="json") if req.time else {"kind":"relative","mode":"all_time"},
                              self.reference,self.catalog.registry["timezone"])[2]
        if period['start'] and not self.index.subjects[subject].get('detail_time_column'):
            return req, [], "INSUFFICIENT_DATA", "historical_data_unavailable", []
        op = {"id":"q_"+digest(requirement_meaning(req,self.reference,self.catalog))[:24],"subject":subject,
              "operation":"detail","project":req.dimension_ids,"filters":[f.model_dump(mode="json") for f in req.filters],
              "time":{"kind":"range","start":period['start'],"end":period['end']} if period['start'] else {"kind":"relative","mode":"all_time"},
              "role":"requested","limit":100}
        return req,[op],"RESOLVED",None,[]

    def resolve(self, intent):
        if self.ui.get('server_supporting_expansion'):
            # Reproduce the same metadata policy during approval verification.
            # Model suggestions have no authority to add optional analytical work.
            requested=[r for r in intent.requirements if not r.supporting_for]
            baseline_ui={k:v for k,v in self.ui.items() if k!='server_supporting_expansion'}
            baseline=AnalyticalResolver(self.catalog,self.reference,baseline_ui).resolve(
                AnalysisIntentEnvelope(decision='analyze',requirements=requested))
            from services.analysis_expansion_service import supporting_candidates, dashboard_policy, estimated_views
            from services.analytical_capacity_planner import AnalyticalCapacityContract
            from services.semantic_tools import SemanticTools
            from services.analytical_tool_contract import canonicalize
            from services.analytical_query_service import signature
            tools=SemanticTools(self.catalog,None)
            def identity(op):
                query,_=canonicalize(op,{}, {})
                period=resolve_time(query.time.model_dump(mode='json'),self.reference,self.catalog.registry['timezone'])[2]
                return signature(query,period,self.catalog.fingerprint)
            signatures={identity(op) for op in baseline['operations']}
            selected=[]; added=0
            planned_views=estimated_views(baseline['operations'],self.catalog)
            target_views=dashboard_policy(self.catalog)['target_views']
            support_limit=6 if self.ui.get('minimum_visuals') else 3
            capacity=min(8,AnalyticalCapacityContract.from_env().operations)
            for candidate in supporting_candidates(self,baseline['intent'].requirements):
                if ('executed_supporting_ids' in self.ui and
                    candidate.id not in self.ui['executed_supporting_ids']):
                    continue
                if candidate.id in self.ui.get('omitted_supporting_ids',[]):
                    continue
                if len(requested)+len(selected)>=16 or added>=support_limit:
                    break
                if planned_views>=target_views and 'scalar' not in candidate.derived_features:
                    continue
                try:
                    req,ops,state,reason,features=self.resolve_requirement(candidate)
                except (AnalysisError,ValueError,KeyError,TypeError):
                    continue
                parents=[o for c in baseline['coverage'] if c['requirement_id']==candidate.supporting_for
                         for o in baseline['operations'] if o['id'] in c['operation_ids']]
                if state!='RESOLVED' or not ops or any(identity(o) in signatures for o in ops):
                    continue
                if not any(all(p['time']==o['time'] and p['filters']==o['filters'] and
                    tools.related_population(p['subject'],o['subject'],p['metrics'],o['metrics'],
                        allow_snapshot=o['time'].get('mode')=='all_time') for o in ops) for p in parents):
                    continue
                if added+len(ops)>support_limit or len(baseline['operations'])+added+len(ops)>capacity:
                    continue
                signatures.update(identity(o) for o in ops)
                selected.append(req);added+=len(ops)
                planned_views+=estimated_views(ops,self.catalog)
            intent=AnalysisIntentEnvelope(decision='analyze',requirements=requested+selected)
        normalized, operations, coverage, bindings, issues, seen = [], [], [], [], [], set()
        # Requested work always resolves first. Optional model-proposed views may
        # enrich the approved plan, but never substitute for a requested goal.
        ordered = sorted(intent.requirements, key=lambda r: bool(r.supporting_for))
        requested_ops = {}
        support_count = 0
        support_limit=6 if self.ui.get('minimum_visuals') else 3
        from services.semantic_tools import SemanticTools
        scope_tools = SemanticTools(self.catalog, None)
        for raw in ordered:
            try:
                req, ops, state, reason, features = self.resolve_requirement(raw)
                if raw.supporting_for:
                    parent = next((p for p in requested_ops.get(raw.supporting_for, [])
                        if all(scope_tools.related_population(p['subject'], o['subject'], p['metrics'], o['metrics'],
                            allow_snapshot=o['time'].get('mode') == 'all_time')
                            and p['time'] == o['time'] and p['filters'] == o['filters'] for o in ops)), None)
                    if parent:
                        for op in ops:
                            op.update(role='supporting', parent_id=parent['id'], purpose='context', population_relation='related')
                    # Shared denominators and duplicate requested meanings are
                    # executed once. Count the same identities as the final
                    # deduplication before deciding whether a drilldown fits.
                    from services.analytical_tool_contract import canonicalize
                    from services.analytical_query_service import signature
                    identities = set()
                    for op in [*operations, *ops]:
                        query, _ = canonicalize(op, {}, {})
                        period = resolve_time(query.time.model_dump(mode='json'), self.reference, self.catalog.registry['timezone'])[2]
                        identities.add((signature(query, period, self.catalog.fingerprint), op['role'], op.get('parent_id')))
                    if state != 'RESOLVED' or not parent or not ops or support_count + len(ops) > support_limit or len(identities) > 8:
                        req = req.model_copy(update={'availability':'unsupported','reason':'definition_unavailable'})
                        ops, features, state, reason = [], [], 'UNSUPPORTED', 'definition_unavailable'
                    else:
                        support_count += len(ops)
                else:
                    requested_ops[req.id] = ops
                key = digest(requirement_meaning(req,self.reference,self.catalog))
                if (key,req.id) in seen:
                    continue
                seen.add((key,req.id))
                normalized.append(req); operations.extend(ops); bindings.extend(features)
                coverage.append({"requirement_id":req.id,"state":state,"reason":reason,"operation_ids":[op["id"] for op in ops],
                                 "derived_features":req.derived_features,"goal":req.goal})
            except ResolutionIssues as error:
                if raw.supporting_for:
                    req = raw.model_copy(update={'availability':'unsupported','reason':'definition_unavailable'})
                    normalized.append(req)
                    coverage.append({'requirement_id':req.id,'state':'UNSUPPORTED','reason':'definition_unavailable',
                        'operation_ids':[],'derived_features':req.derived_features,'goal':req.goal})
                else:
                    issues.extend(error.issues)
            except AnalysisError:
                # Business/capacity/storage errors inherit ValueError. They must
                # retain their category and must never consume semantic retries.
                raise
            except (ValueError, TypeError, KeyError) as cause:
                import traceback
                error = AnalysisError('resolver_internal', 'Internal analytical resolution failed')
                error.resolver_diagnostic = dict(requirement_id=raw.id, exception_type=type(cause).__name__,
                    frames=[dict(file=f.filename.rsplit('/',1)[-1], function=f.name, line=f.lineno)
                            for f in traceback.extract_tb(cause.__traceback__)[-6:]])
                # No exception text, provider content, or credentials in logs.
                logger.error('[AnalystResolverInternal] %s', json.dumps(error.resolver_diagnostic))
                raise error from None
        if issues:
            error = ResolutionIssues(issues)
            error.accepted_requirements = normalized
            raise error
        # Requirements/features may share exactly the same executable query.
        # Use the existing result-reuse identity (including all population,
        # time, grain and metric fields), not their semantic display labels.
        from services.analytical_query_service import signature
        from services.analytical_tool_contract import canonicalize
        unique, aliases = {}, {}
        for op in sorted(operations,key=lambda o:o['id']):
            query,_ = canonicalize(op,{}, {})
            period = resolve_time(query.time.model_dump(mode='json'),self.reference,self.catalog.registry['timezone'])[2]
            key = (signature(query,period,self.catalog.fingerprint), op['role'], op.get('parent_id'))
            if key not in unique:
                unique[key] = op
            aliases[op['id']] = unique[key]['id']
        operations = list(unique.values())
        for op in operations:
            if op.get('parent_id'):
                op['parent_id'] = aliases[op['parent_id']]
        for c in coverage:
            c['operation_ids'] = sorted({aliases[id] for id in c['operation_ids']})
        for binding in bindings:
            binding['query_id'] = aliases[binding['query_id']]
            if 'denominator_query_id' in binding:
                binding['denominator_query_id'] = aliases[binding['denominator_query_id']]
        if len(operations)>8:
            raise AnalysisError("requested_scope_too_large","Legal plan exceeds bounded operation capacity")
        normalized.sort(key=lambda r:(bool(r.supporting_for),digest(requirement_meaning(r,self.reference,self.catalog))))
        coverage.sort(key=lambda c:c['requirement_id'])
        bindings.sort(key=lambda b:(b['requirement_id'],b['feature'],b['query_id']))
        operations.sort(key=lambda o:(o['role']=='supporting',o['operation']!='ranking',o['id']))
        intent = AnalysisIntentEnvelope(decision="analyze",requirements=normalized)
        components = []
        by_id = {o["id"]:o for o in operations}
        for c in coverage:
            domains = {p["domain_id"] for o in (by_id[id] for id in c["operation_ids"]) for p in self.index.domains.values() if o["subject"] in p["primary_subjects"]}
            components.append({"id":c["requirement_id"],"business_goal":c["goal"][:120],"domain_id":next(iter(domains)) if len(domains)==1 else None,
                "lens_id":None,"requested_or_supporting":"supporting" if next(r for r in normalized if r.id==c["requirement_id"]).supporting_for else "requested","operation_ids":c["operation_ids"],
                "status":"planned" if c["state"]=="RESOLVED" else c["state"].lower(),"reason":c["reason"]})
        return {"intent":intent,"operations":operations,"coverage":coverage,"components":components,"feature_bindings":bindings,
                "intent_fingerprint":intent_fingerprint(intent,self.reference,self.catalog),
                "plan_fingerprint":plan_fingerprint(operations,coverage,self.catalog.fingerprint),"resolver_version":VERSION}


def verify_operation_bindings(operations, artifacts):
    """Compare every executable field, including filters/time/metric population."""
    from services.analytical_tool_contract import canonicalize
    if set(artifacts) != {o['id'] for o in operations}:
        return False
    return all(canonicalize(o, {}, {})[0] == artifacts[o['id']].query for o in operations)
