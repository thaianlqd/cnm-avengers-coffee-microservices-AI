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
from services.cohort_rollup_service import cohort_rollup

VERSION = "2.8.0"
logger = logging.getLogger("ai-analytics")
_indexes, _lock = OrderedDict(), Lock()


from services.semantic_preflight_contract import POLICY_VERSION


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                     separators=(",", ":"), default=str).encode()).hexdigest()


def requirement_meaning(requirement, reference=None, catalog=None):
    data = requirement.model_dump(mode="json", exclude_none=True)
    for k in ("id", "goal", "lens_hint", "domain_id"):
        data.pop(k, None)
    for k in ("metric_ids", "dimension_ids", "derived_features"):
        data[k] = sorted(set(data[k]))
    if data.get('derived_features'):
        # An omitted target map means all requirement metrics. Spelling out
        # exactly that set during a scope repair does not change meaning.
        # Different targets (and invalid empty targets) remain frozen changes.
        data['feature_metrics']={f:sorted(set(data.get('feature_metrics',{}).get(f,data['metric_ids'])))
                                 for f in data['derived_features']}
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
        if data.get('comparison_time'):
            data['comparison_time'] = resolve_time(data['comparison_time'], reference, catalog.registry['timezone'])[2]
    return data


def intent_fingerprint(intent, reference=None, catalog=None):
    meanings={digest(requirement_meaning(r,reference,catalog)):requirement_meaning(r,reference,catalog) for r in intent.requirements}
    return digest([meanings[k] for k in sorted(meanings)])


def plan_fingerprint(operations, coverage, catalog_fingerprint, policy_version=None):
    # Requirement IDs/goals are labels, never execution authority. Coverage is
    # represented by operation content plus availability/features, not labels.
    by_id = {op["id"]: op for op in operations}
    def meaning(op):
        out = {k:v for k,v in op.items() if k not in {"id", "parent_id", "replaces", "changed_fields"}}
        if op.get("cohort_scope_query_id") in by_id:
            # The cohort is identified by the ranked query's meaning, not its label-derived id.
            out["cohort_scope_query_id"] = digest(meaning(by_id[op["cohort_scope_query_id"]]))
        return out
    requirements = [{"state": c["state"], "reason": c.get("reason"),
                     "features": c["derived_features"], **({"forecast": c["forecast"]} if c.get("forecast") else {}),
                     **({"lenses": sorted(l["id"] for l in c["lenses"])} if c.get("lenses") else {}),
                     "operations": sorted((meaning(by_id[id]) for id in c["operation_ids"]), key=digest)} for c in coverage]
    unique={digest(r):r for r in requirements}
    body = [VERSION, catalog_fingerprint, [unique[k] for k in sorted(unique)]]
    if policy_version:
        body.append(policy_version)
    return digest(body)



def previous_window(period):
    """The equivalent preceding period: the previous calendar month for a whole month, else the same length just before."""
    from datetime import date, timedelta
    start, end = date.fromisoformat(str(period["start"])[:10]), date.fromisoformat(str(period["end"])[:10])
    next_day = end + timedelta(days=1)
    if start.day == 1 and next_day.day == 1 and (start.year, start.month) == (end.year, end.month):
        prev_end = start - timedelta(days=1)
        return {"start": prev_end.replace(day=1).isoformat(), "end": prev_end.isoformat()}
    length = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    return {"start": (prev_end - timedelta(days=length - 1)).isoformat(), "end": prev_end.isoformat()}


class CompatibilityIndex:
    def __init__(self, catalog):
        manifest, _ = build_manifest(catalog, max_chars=2_000_000, include_components=True)
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


# Compatibility export for existing planner/compiler callers.
from services.error_taxonomy import ResolutionIssues


# Bump whenever resolution/binding rules change: cached plans from an older rule set
# must be re-planned, not replayed into a verifier that rebuilds them differently (G07).
PLAN_POLICY_VERSION = "2026-10-22.cohort-scope.33"

FEATURE_SHAPES = {"scalar":{"aggregate"}, "leader":{"ranking"}, "top_gap":{"ranking"}, "selected_total":{"ranking"},
    "change":{"trend"}, "change_pct":{"trend"}, "concentration":{"distribution"},
    "group_gap":{"aggregate","cross_tab"}, "relationship_strength":{"relationship"}, "driver_delta":{"aggregate"},
    "contribution_share":{"aggregate","ranking","distribution","cross_tab"}}

DROPPABLE_FEATURES = {'concentration', 'relationship_strength', 'leader', 'top_gap'}


def drop_unrequested_feature_conflicts(intent, anchors):
    """A derived feature the user never asked for, attached to the wrong shape, is
    model noise: remove it instead of failing the whole turn (live multi-clause)."""
    named = {f for a in (anchors or {}).get('features', []) for f in a['candidate_ids']}
    result, changes = intent.model_copy(deep=True), []
    for req in result.requirements:
        # Only features no later deterministic rule can reshape (scalar/change/selected_total are rewritten
        # downstream; binding noise must still surface as a repair issue).
        bad = [f for f in req.derived_features if f not in named and f in DROPPABLE_FEATURES
               and req.analysis_kind not in FEATURE_SHAPES[f]]
        if bad:
            req.derived_features = [f for f in req.derived_features if f not in bad]
            for f in bad:
                req.feature_metrics.pop(f, None)
            changes.append(dict(requirement_id=req.id, field='derived_features',
                                rule='unrequested_feature_shape_conflict', previous=bad, value=[]))
    return result, changes


class AnalyticalResolver:
    def __init__(self, catalog, reference, ui=None):
        self.catalog, self.reference, self.ui = catalog, reference, ui or {}
        self.index = compatibility_index(catalog)
        self.lens_plan, self.lens_selected = None, {}  # FINAL P2: server lens plan of the last expansion
        self.capacity = self.operation_capacity()  # fixed at planning start; context keys may be consumed later
        self.cohort_benchmarks = []  # supporting views of a ranked goal that describe the whole scope

    def evaluate_capability(self, req):
        from services.semantic_preflight_contract import evaluate_capability
        from services.forecast_service import validate_request
        return evaluate_capability(req, self.catalog.registry, lambda m, u, h: validate_request(self.catalog, m, u, h))

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
        if req.analysis_kind == 'comparison' and not req.ranking and not req.comparison_time:
            req.derived_features=sorted(set(req.derived_features)|{'group_gap'})
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
        # Period deltas are compiler-owned from comparison_time; the draft only needs the scalar shape.
        if (req.comparison_time and req.analysis_kind in {'aggregate',None} and not req.dimension_ids
                and not req.ranking and not req.forecast and not req.supporting_for
                and {'change','change_pct'} & set(req.derived_features)):
            req.derived_features=sorted((set(req.derived_features)-{'change','change_pct'})|{'scalar'})
            for feature in ('change','change_pct'):req.feature_metrics.pop(feature,None)
        # UI time outranks question time, by the documented precedence rule.
        period = self.ui.get("required_period")
        from services.mission_contract_service import allows_current_risk_snapshot
        if allows_current_risk_snapshot(self.ui, self.catalog.registry['metrics'], req.metric_ids):
            req.time = TimeSpec.model_validate({'kind': 'relative', 'mode': 'all_time'})
        elif period:
            req.time = TimeSpec.model_validate(
                {"kind":"range", **period} if period.get("start") else {"kind":"relative", "mode":"all_time"})
        required = [*self.ui.get("required_filters", []), *([self.ui["required_filter"]] if self.ui.get("required_filter") else [])]
        from services.analysis_contract import Filter, equivalent_filter
        for f in required:
            if any(old.dimension == f["dimension"] and not equivalent_filter(old.model_dump(mode="json"),f) for old in req.filters):
                raise ResolutionIssues([self.issue(req, "filters", "scope_conflict")])
            if not any(equivalent_filter(old.model_dump(mode="json"),f) for old in req.filters):
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

    def forecast_requirement(self, req):
        """Governed forecast capability is checked before any repair or SQL.

        A forecast is a trend of exactly one forecastable metric over the
        filtered scope; the server later computes the projected numbers.
        """
        from services.forecast_service import validate_request
        if len(req.metric_ids) != 1 or any(m not in self.catalog.registry["metrics"] for m in req.metric_ids):
            if len(req.metric_ids) != 1:
                raise AnalysisError("forecast_unsupported", "A forecast covers exactly one metric")
            return req  # Unknown IDs keep the normal unknown_semantic_id path.
        if req.dimension_ids or req.ranking:
            raise AnalysisError("forecast_unsupported", "Grouped or ranked forecasts are not supported")
        validate_request(self.catalog, req.metric_ids[0], req.forecast.unit, req.forecast.horizon)
        return req.model_copy(update={"analysis_kind": "trend", "granularity": req.forecast.unit,
                                      "derived_features": [], "feature_metrics": {}})

    def resolve_requirement(self, raw):
        req = self.normalize(raw)
        self.validate_time(req)
        if req.comparison_time and (req.analysis_kind not in {'aggregate',None} or req.forecast or req.supporting_for):
            # The two period values may already be correct. Target the shape
            # fields that conflict instead of authorizing a baseline rewrite.
            conflicts=[]
            for field,invalid in (('time',not req.time),('analysis_kind',req.analysis_kind not in {'aggregate',None}),
                    ('dimension_ids',bool(req.dimension_ids)),('ranking',bool(req.ranking)),
                    ('forecast',bool(req.forecast)),('supporting_for',bool(req.supporting_for)),
                    ('granularity',bool(req.granularity)),
                    ('derived_features',bool(set(req.derived_features)-{'scalar'}))):
                if invalid:conflicts.append(self.issue(req,field,'scalar_period_comparison_required'))
            raise ResolutionIssues(conflicts)
        if req.forecast and req.availability == "requested":
            req = self.forecast_requirement(req)
        if req.availability != "requested":
            if req.reason=='metric_unavailable' and req.metric_ids and all(m in self.index.metrics for m in req.metric_ids):
                raise ResolutionIssues([self.issue(req,field,'declared_metric_available') for field in ('availability','reason')])
            if not req.reason:
                raise ResolutionIssues([self.issue(req,field,"limitation_reason_required")
                                        for field in ('availability','reason')])
            return req, [], req.availability.upper(), req.reason, []
        issues = []
        # Component-only metrics (ratio numerators/denominators) are server evidence for supporting lenses; a
        # requested meaning can never name them, so they never become an interpretable vocabulary.
        metric_vocabulary = (self.catalog.registry["metrics"] if req.supporting_for else
            {k: v for k, v in self.catalog.registry["metrics"].items() if not v.get("component_only")})
        for field, ids, known in (("metric_ids",req.metric_ids,metric_vocabulary), ("dimension_ids",req.dimension_ids,self.catalog.registry["dimensions"]), ("filters",[f.dimension for f in req.filters],self.catalog.registry["dimensions"])):
            if any(id not in known for id in ids):
                # Proposed IDs are diagnostics only; they never enter issue
                # fingerprints, so renaming an unknown concept is not progress.
                unknown=[id[:64] for id in ids if id not in known][:6]
                issues.append(self.issue(req,field,"unknown_semantic_id",candidate_ids=sorted(known),unknown_ids=unknown))
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
                req.granularity = 'year'
        period = resolve_time(req.time.model_dump(mode="json", exclude_none=True) if req.time else {"kind":"relative","mode":"all_time"},self.reference,self.catalog.registry["timezone"])[2]
        if req.comparison_time:
            # Two independently compiled aggregates retain the same metric
            # populations and filters. No union-period total can stand in for
            # this contract. Grouped/ranked comparisons need a different shape.
            conflicts=[]
            for field,invalid in (('time',not req.time),('analysis_kind',req.analysis_kind!='aggregate'),
                    ('dimension_ids',bool(req.dimension_ids)),('ranking',bool(req.ranking)),
                    ('forecast',bool(req.forecast)),('granularity',bool(req.granularity)),
                    ('derived_features',bool(set(req.derived_features)-{'scalar'}))):
                if invalid:conflicts.append(self.issue(req,field,'scalar_period_comparison_required'))
            if conflicts:raise ResolutionIssues(conflicts)
            self.validate_time(req.model_copy(update={'time':req.comparison_time}))
            baseline = resolve_time(req.comparison_time.model_dump(mode='json'), self.reference, self.catalog.registry['timezone'])[2]
            if not period['start'] or not baseline['start'] or not (period['end'] < baseline['start'] or baseline['end'] < period['start']):
                raise ResolutionIssues([self.issue(req,'comparison_time','distinct_disjoint_periods_required')])
        if (period["start"] or req.analysis_kind == "trend") and any(not self.index.metrics[m]["historical"] for m in req.metric_ids):
            return req, [], "INSUFFICIENT_DATA", "historical_data_unavailable", []
        required_shapes = FEATURE_SHAPES
        additive_features={'contribution_share','concentration','selected_total','driver_delta'}
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
        # V3.3: the one canonical capability evaluator runs on every compiled requirement
        # (guided, free text, module, refinement all pass through here).
        blocking = [c for c in self.evaluate_capability(req).constraints if c.blocking and c.status == "failed" and c.code != "metric_required"]
        if blocking:
            if any(c.code!='non_additive_total' for c in blocking) or 'selected_total' in req.derived_features or 'driver_delta' in req.derived_features:
                raise AnalysisError(blocking[0].code, "Capability constraints failed: " + ", ".join(c.code for c in blocking))
            return req,[],"UNSUPPORTED","definition_unavailable",[]
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
            for size in range(len(metrics) - 1, 0, -1):
                best_sub_parts = None
                for subset in combinations(metrics, size):
                    sub_parts = partition(subset)
                    if sub_parts is not None:
                        best_sub_parts = sub_parts
                        resolved_metrics = set(subset)
                        break
                if best_sub_parts is not None:
                    parts = best_sub_parts
                    req.metric_ids = sorted(resolved_metrics)
                    for feature in req.derived_features:
                        targets[feature] = targets[feature] & resolved_metrics
                    break
        if parts is None:
            return req, [], "UNSUPPORTED", "definition_unavailable", []
        if "driver_delta" in req.derived_features and "driver_delta" in targets:
            return self.resolve_driver(req, parts, possible, period)
        pair = self.governed_pair(req) if len(parts)>1 and req.analysis_kind=="relationship" else None
        if (len(parts)>1 and req.analysis_kind=='ranking' and req.ranking
                and not req.ranking.per_group and not req.supporting_for):
            # Rank exactly once. Other populations are requested companions on
            # those selected entity keys, never independent Top Ns or a shared
            # WHERE filter that changes the metric definitions.
            ranked = next(p for p in parts if req.ranking.metric_id in p)
            definitions = [self.catalog.registry['metrics'][m] for m in req.metric_ids]
            if (len({(m['source'],m.get('time_column')) for m in definitions})==1
                    and all(possible[frozenset(p)][0]==possible[frozenset(ranked)][0] for p in parts)):
                primary_req=req.model_copy(update={'metric_ids':list(ranked),
                    'derived_features':req.derived_features,
                    'feature_metrics':{f:sorted(ms & set(ranked)) for f,ms in targets.items()}})
                if all(set(ms)<=set(ranked) for ms in targets.values()):
                    _, primary_ops, state, reason, bindings=self.resolve_requirement(primary_req)
                    if state!='RESOLVED':return req,[],state,reason,[]
                    primary=next(o for o in primary_ops if o['operation']=='ranking')
                    operations=list(primary_ops)
                    base=requirement_meaning(req,self.reference,self.catalog)
                    for subset in parts:
                        if subset==ranked:continue
                        subject,lens=possible[frozenset(subset)]
                        op={'id':'q_'+digest([base,subset,'ranked_companion'])[:24],
                            'subject':subject,'operation':'aggregate','metrics':list(subset),
                            'group_by':req.dimension_ids,'filters':deepcopy(primary['filters']),
                            'time':deepcopy(primary['time']),'role':'requested',
                            'cohort_query_id':primary['id'],'limit':req.ranking.limit}
                        operations.append(op)
                        bindings.append({'requirement_id':req.id,'feature':'ranked_companion',
                            'query_id':op['id'],'query_ids':[primary['id'],op['id']],
                            'metric_ids':list(subset)})
                    return req,operations,'RESOLVED',None,bindings
        if len(parts)>1 and req.analysis_kind in {"ranking","relationship","distribution"} and not pair:
            # Independent rankings/compositions of different populations would
            # silently change the requested cohort or denominator.
            return req, [], "NEEDS_INPUT", "ambiguous_criterion", []
        operations, bindings = [], []
        base = requirement_meaning(req,self.reference,self.catalog)
        time = {"kind":"range","start":period["start"],"end":period["end"]} if period["start"] else {"kind":"relative","mode":"all_time"}
        if pair:
            # Governed pair: two separate aggregates (each keeps its own population) over the same
            # period/scope, paired later by a unique key. Never a raw-fact join or one shared query.
            group_by = list(dict.fromkeys([*pair["key"], pair["label_dimension"]]))
            for subset in sorted(parts, key=lambda sub: pair["metrics"].index(next(iter(sub)))):
                subject,lens = possible[frozenset(subset)]
                op = {"id":"q_"+digest([base,"pair",sorted(subset)])[:24],"subject":subject,"operation":"aggregate",
                      "metrics":list(subset),"group_by":group_by,"filters":[f.model_dump(mode="json") for f in req.filters],
                      "time":time,"role":"requested"}
                if lens:
                    op["lens_id"] = lens
                operations.append(op)
            bindings.append({"requirement_id":req.id,"feature":"relationship_strength","query_id":operations[0]["id"],
                             "query_ids":[o["id"] for o in operations],"metric_ids":[o["metrics"][0] for o in operations],
                             "pair_id":pair["id"],"key":list(pair["key"])})
            logger.info("[AnalystResolver] %s",json.dumps({"requirement_id":req.id,"governed_pair":pair["id"],"operation_count":len(operations),"result":"RESOLVED"}))
            return req,operations,"RESOLVED",None,bindings
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
            # Non-additive grouped metrics need their canonical whole-scope aggregate,
            # never an average/sum of group rates or distinct counts.
            if req.analysis_kind in {'aggregate','distribution'} and req.dimension_ids and not req.ranking and 'group_gap' not in req.derived_features and any(
                    not self.catalog.registry['metrics'][m].get('additive') for m in subset):
                total={**op,'id':'q_'+digest([base,subset,'whole_scope'])[:24],'operation':'aggregate','group_by':[]}
                total.pop('lens_id',None);total.pop('granularity',None)
                operations.append(total)
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
        if req.comparison_time:
            # Build the baseline through the same resolver, compiler and
            # capability checks. Its IDs, population and SQL are server-owned.
            baseline_req = req.model_copy(update={'time':req.comparison_time,'comparison_time':None})
            _, baseline_ops, state, reason, _ = self.resolve_requirement(baseline_req)
            if state != 'RESOLVED':
                return req, [], state, reason, []
            for op in operations:
                other = next((b for b in baseline_ops if b['metrics']==op['metrics']), None)
                if other is None:
                    raise AnalysisError('resolver_internal','Comparison population cannot be paired')
                bindings.append({'requirement_id':req.id,'feature':'period_comparison','query_id':op['id'],
                    'query_ids':[op['id'],other['id']],'metric_ids':op['metrics']})
            operations.extend(baseline_ops)
        return req,operations,"RESOLVED",None,bindings

    def resolve_driver(self, req, parts, possible, period):
        """Signed change decomposition: current vs the equivalent preceding period, grouped AND total, four aggregates.

        The grouped parts are reconciled later against the independently queried totals (never against their own
        sum). Only an additive metric over one disjoint grouping qualifies; a missing explicit window needs input."""
        from services.semantic_preflight_contract import metric_capability, additive_across
        if len(parts) != 1 or len(req.metric_ids) != 1 or len(req.dimension_ids) != 1:
            raise AnalysisError("driver_unsupported", "A change decomposition needs one metric and one grouping")
        metric, dim = req.metric_ids[0], req.dimension_ids[0]
        if not additive_across(metric_capability(metric, self.catalog.registry["metrics"][metric]), dim):
            raise AnalysisError("non_additive_total", "The metric cannot be decomposed additively over this grouping")
        if not period["start"] or not period["end"]:
            return req, [], "NEEDS_INPUT", "ambiguous_criterion", []   # no explicit window => no comparable baseline
        previous = previous_window(period)
        subject, lens = possible[frozenset(parts[0])]
        base = requirement_meaning(req, self.reference, self.catalog)
        filters = [f.model_dump(mode="json") for f in req.filters]
        def op(tag, window, group_by):
            o = {"id":"q_"+digest([base,"driver",tag])[:24],"subject":subject,"operation":"aggregate","metrics":[metric],
                 "group_by":group_by,"filters":filters,"time":{"kind":"range","start":window["start"],"end":window["end"]},"role":"requested"}
            if lens:
                o["lens_id"] = lens
            return o
        # Current grouped result first; baseline + independent totals are requested evidence too (same contract),
        # and an empty baseline is disclosed as a limitation by the report assembly.
        ops = [op("current_groups", period, [dim]), op("previous_groups", previous, [dim]),
               op("current_total", period, []), op("previous_total", previous, [])]
        binding = {"requirement_id":req.id,"feature":"driver_delta","query_id":ops[0]["id"],"query_ids":[o["id"] for o in ops],
                   "metric_ids":[metric],"dimension":dim,"current":{"start":period["start"],"end":period["end"]},
                   "previous":previous}
        return req, ops, "RESOLVED", None, [binding]

    def governed_pair(self, req):
        """The catalog-declared association pair that matches this requirement (None = not governed)."""
        for pair in self.catalog.registry.get("governed_pairs", []):
            allowed = set(pair["key"]) | {pair["label_dimension"]}
            if set(req.metric_ids) == set(pair["metrics"]) and req.dimension_ids and set(req.dimension_ids) <= allowed:
                return pair
        return None

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

    def cohort_scopable(self, op, rank):
        """A supporting view can be restricted to a Top/Bottom N cohort by keys."""
        metrics = self.catalog.registry['metrics']
        dims = rank.get('group_by') or []
        return (op['operation'] in ('aggregate', 'trend', 'distribution', 'cross_tab') and not op.get('ranking') and not op.get('cohort_query_id')
                and dims and op['filters'] == rank['filters'] and op['time'] == rank['time']
                and all(cohort_rollup(self.catalog, m) and set(dims) <= set(self.catalog.compatible_dimensions(m))
                        and all(set(dims) <= set(self.catalog.compatible_dimensions(c))
                                for c in cohort_rollup(self.catalog, m)['metrics'])
                        for m in op['metrics']))

    def bind_dependent_goals(self, operations, requested_ops):
        """"… chi nhánh và thanh toán chỉ trong 5 tỉnh này": requested goals that refer back
        to a ranked set run on that cohort's keys, never on the whole scope (G04)."""
        refs = {r['dimension'] for r in self.ui.get('cohort_references') or []}
        if not refs:
            return
        ranks = [o for ops in requested_ops.values() for o in ops if o['operation'] == 'ranking'
                 and set(o.get('group_by') or []) & refs and not (o.get('ranking') or {}).get('per_group')]
        # A selection's membership is independent of requirement labels and
        # optional derived facts. Deduplicate equivalent selections before SQL
        # deduplication below, while rejecting genuinely ambiguous references.
        selections = {digest({k:o.get(k) for k in ('subject','group_by','ranking','filters','time')}):o for o in ranks}
        if len(selections) != 1:
            raise AnalysisError('ranking_scope_ambiguous', 'Cần chỉ rõ tập xếp hạng cho phạm vi tham chiếu.')
        rank = next(iter(selections.values()))
        scoped = set()
        bindings = [r for r in self.ui.get('cohort_references') or [] if 'goal_dimensions' in r]
        def dependent_goal(op):
            if not bindings:return True  # Compatibility for explicitly bound archived contexts.
            if op.get('operation') == 'aggregate' and not op.get('group_by'):
                independent = {m for b in bindings for m in b.get('independent_scalar_metrics', [])}
                # A model-added scalar cannot introduce a national population.
                # A separate explicit scalar clause retains its own population.
                return not set(op['metrics']) <= independent
            for binding in bindings:
                dimensions, metrics = set(binding['goal_dimensions']), set(binding['goal_metrics'])
                if dimensions and not dimensions.intersection(op.get('group_by') or []):continue
                if metrics and not set(op['metrics']) <= metrics:continue
                if dimensions or metrics:return True
            return False
        for ops in requested_ops.values():
            for op in ops:
                if op is rank or op.get('role') != 'requested' or op.get('cohort_query_id'):
                    continue
                if not dependent_goal(op):
                    continue
                if self.cohort_scopable(op, rank):
                    op['cohort_scope_query_id'] = rank['id']
                    scoped.add(op['id'])
                else:
                    self.cohort_benchmarks.append({'requirement_id': None, 'operation_ids': [op['id']],
                                                   'reason': 'dependent_goal_not_scopable'})
        # Supporting views of a dependent goal describe the same cohort when they can.
        for op in operations:
            if op.get('role') == 'supporting' and op.get('parent_id') in scoped and not op.get('cohort_scope_query_id'):
                if self.cohort_scopable(op, rank):
                    op['cohort_scope_query_id'] = rank['id']  # parent stays the dependent goal (idempotent replay)
                else:
                    self.cohort_benchmarks.append({'requirement_id': None, 'operation_ids': [op['id']],
                                                   'reason': 'supporting_view_not_scopable'})

    def operation_capacity(self):
        # A server-generated mission contract (zero AI) may declare its own fixed
        # size, e.g. every Risk Watch signal with totals; model plans keep 8.
        from services.mission_contract_service import guided_operation_capacity
        return guided_operation_capacity(self.catalog.registry, self.ui)

    def resolve(self, intent):
        op_cap = self.capacity
        if self.ui.get('server_supporting_expansion'):
            # Reproduce the same metadata policy during approval verification.
            # Model suggestions have no authority to add optional analytical work.
            requested=[r for r in intent.requirements if not r.supporting_for]
            baseline_ui={k:v for k,v in self.ui.items() if k!='server_supporting_expansion'}
            baseline=AnalyticalResolver(self.catalog,self.reference,baseline_ui).resolve(
                AnalysisIntentEnvelope(decision='analyze',requirements=requested))
            from services import analysis_expansion_service as expansion
            from services.analysis_expansion_service import dashboard_policy, estimated_views, mission_relevant
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
            depth=self.ui.get('server_supporting_expansion')
            policy=dashboard_policy(self.catalog,depth)
            support_limit=policy.get('max_supporting_operations',6 if self.ui.get('minimum_visuals') else 3)
            parent_metrics={r.id:set(r.metric_ids) for r in requested}
            mission_id=self.ui.get('analysis_mission')
            capacity=min(8,AnalyticalCapacityContract.from_env().operations)
            self.pending_lens_plan=None
            shapes=expansion.supporting_candidates(self,baseline['intent'].requirements,estimated_views(baseline['operations'],self.catalog,self.ui.get('fixed_grouping_policy')))
            plan=self.pending_lens_plan or dict(version=None,depth=depth,targets={},shapes=list(shapes),lenses=[],decisions=[],family=None)
            by_shape={}
            for lens in plan['lenses']:
                by_shape.setdefault(lens['shape'],[]).append(lens)
            decisions=plan['decisions']
            def refuse(candidate,reason):
                for lens in by_shape.get(candidate.id,[]):
                    decisions.append(dict(kind=lens['kind'],lens_id=lens['id'],role=lens['role'],status='rejected',reason=reason,requirement_id=lens['requirement_id']))
            for candidate in shapes:
                if ('executed_supporting_ids' in self.ui and
                    candidate.id not in self.ui['executed_supporting_ids']):
                    continue
                if candidate.id in self.ui.get('omitted_supporting_ids',[]):
                    refuse(candidate,'cost_budget'); continue
                if len(requested)+len(selected)>=16 or added>=support_limit:
                    refuse(candidate,'cost_budget'); continue
                if not mission_relevant(candidate,parent_metrics.get(candidate.supporting_for,set()),self.catalog,mission_id):
                    refuse(candidate,'mission_grammar'); continue
                try:
                    req,ops,state,reason,features=self.resolve_requirement(candidate)
                except (AnalysisError,ValueError,KeyError,TypeError) as error:
                    refuse(candidate,'unsupported_join' if isinstance(error,AnalysisError) and getattr(error,'category','')=='unsupported_join' else 'capability_blocked'); continue
                parents=[o for c in baseline['coverage'] if c['requirement_id']==candidate.supporting_for
                         for o in baseline['operations'] if o['id'] in c['operation_ids']]
                if state!='RESOLVED' or not ops:
                    refuse(candidate,'unsupported_join' if state=='UNSUPPORTED' else 'capability_blocked'); continue
                new_ops=[o for o in ops if identity(o) not in signatures]
                if not new_ops:
                    refuse(candidate,'duplicate_meaning'); continue
                if not any(all(p['time']==o['time'] and p['filters']==o['filters'] and
                    tools.related_population(p['subject'],o['subject'],p['metrics'],o['metrics'],
                        allow_snapshot=o['time'].get('mode')=='all_time') for o in ops) for p in parents):
                    refuse(candidate,'incompatible_population'); continue
                if added+len(new_ops)>support_limit or len(baseline['operations'])+added+len(new_ops)>capacity:
                    refuse(candidate,'cost_budget'); continue
                signatures.update(identity(o) for o in new_ops)
                selected.append(req);added+=len(new_ops)
                self.lens_selected[req.id]=[dict(l) for l in by_shape.get(candidate.id,[])]
            plan['decisions']=decisions
            plan['selected']=sorted(l['id'] for ls in self.lens_selected.values() for l in ls)
            self.lens_plan=plan
            intent=AnalysisIntentEnvelope(decision='analyze',requirements=requested+selected)
        normalized, operations, coverage, bindings, issues, seen = [], [], [], [], [], set()
        # Requested work always resolves first. Optional model-proposed views may
        # enrich the approved plan, but never substitute for a requested goal.
        ordered = sorted(intent.requirements, key=lambda r: bool(r.supporting_for))
        requested_ops = {}
        support_count, shared_aliases, executable = 0, {}, []
        from services.analysis_expansion_service import dashboard_policy as _policy
        support_limit=(_policy(self.catalog,self.ui.get('server_supporting_expansion')).get('max_supporting_operations')
            if self.ui.get('server_supporting_expansion') else None)
        if support_limit is None:
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
                    def ident(op):
                        query, _ = canonicalize(op, {}, {})
                        period = resolve_time(query.time.model_dump(mode='json'), self.reference, self.catalog.registry['timezone'])[2]
                        return (signature(query, period, self.catalog.fingerprint), op['role'], op.get('parent_id'))
                    # A supporting operation identical to an already planned one (e.g. the canonical whole-scope
                    # total of a requested scalar) executes once and is shared, whatever its role label.
                    existing = {ident(op)[0]: op['id'] for op in operations}
                    shared = {op['id']: existing[ident(op)[0]] for op in ops if ident(op)[0] in existing}
                    fresh_ops = [op for op in ops if op['id'] not in shared]
                    identities = {ident(op)[0] for op in [*operations, *fresh_ops]}
                    # A ranked requirement answers about its selected entity cohort. A
                    # view not bound to those keys describes the whole scope (I01/I09):
                    # it may stay only as a labelled benchmark, never as cohort context.
                    rank = next((p for p in requested_ops.get(raw.supporting_for, []) if p['operation'] == 'ranking'
                                 and not (p.get('ranking') or {}).get('per_group')), None)
                    if rank and state == 'RESOLVED':
                        if parent and all(self.cohort_scopable(o, rank) for o in ops):
                            for o in ops:
                                o.update(parent_id=rank['id'], cohort_scope_query_id=rank['id'])
                            parent = rank
                        elif any(not o.get('cohort_query_id') for o in ops):
                            self.cohort_benchmarks.append({'requirement_id': raw.id, 'supporting_for': raw.supporting_for,
                                                           'operation_ids': [o['id'] for o in ops]})
                    if state != 'RESOLVED' or not parent or not ops or support_count + len(fresh_ops) > support_limit or len(identities) > 8:
                        req = req.model_copy(update={'availability':'unsupported','reason':'definition_unavailable'})
                        ops, features, state, reason = [], [], 'UNSUPPORTED', 'definition_unavailable'
                    else:
                        support_count += len(fresh_ops)
                        shared_aliases.update(shared)
                        executable = fresh_ops
                else:
                    requested_ops[req.id] = ops
                key = digest(requirement_meaning(req,self.reference,self.catalog))
                if (key,req.id) in seen:
                    continue
                seen.add((key,req.id))
                normalized.append(req); operations.extend(ops if not raw.supporting_for or state != 'RESOLVED' else executable); bindings.extend(features)
                coverage.append({"requirement_id":req.id,"state":state,"reason":reason,"operation_ids":[op["id"] for op in ops],
                                 "derived_features":req.derived_features,"goal":req.goal,"supporting_for":req.supporting_for,
                                 # View requirements are compiled BEFORE any query: what must be shown to answer this requirement.
                                 **({"views":[{**v.model_dump(mode="json"),"required":not raw.supporting_for}
                                              for v in self.evaluate_capability(req).views]} if state=="RESOLVED" and not req.forecast else {}),
                                 **({"forecast":req.forecast.model_dump(mode="json")} if req.forecast and state=="RESOLVED" else {}),
                                 **({"lenses":self.lens_selected[req.id]} if state=="RESOLVED" and self.lens_selected.get(req.id) else {})})
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
        self.bind_dependent_goals(operations, requested_ops)
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
        for dropped, kept in shared_aliases.items():
            aliases[dropped] = aliases.get(kept, kept)
        operations = list(unique.values())
        for op in operations:
            if op.get('parent_id'):
                op['parent_id'] = aliases[op['parent_id']]
            if op.get('cohort_query_id'):
                op['cohort_query_id'] = aliases[op['cohort_query_id']]
            if op.get('cohort_scope_query_id'):
                op['cohort_scope_query_id'] = aliases[op['cohort_scope_query_id']]
        for c in coverage:
            c['operation_ids'] = sorted({aliases[id] for id in c['operation_ids']})
        for binding in bindings:
            binding['query_id'] = aliases[binding['query_id']]
            if 'query_ids' in binding:
                binding['query_ids'] = [aliases[i] for i in binding['query_ids']]
            if 'denominator_query_id' in binding:
                binding['denominator_query_id'] = aliases[binding['denominator_query_id']]
        if len(operations)>op_cap:
            sup_ops = [op for op in operations if op.get('role') == 'supporting']
            if sup_ops and (len(operations) - len(sup_ops) <= op_cap):
                keep_count = op_cap - (len(operations) - len(sup_ops))
                dropped_sup = set(op['id'] for op in sup_ops[keep_count:])
                operations = [op for op in operations if op['id'] not in dropped_sup]
                for c in coverage:
                    c['operation_ids'] = [oid for oid in c['operation_ids'] if oid not in dropped_sup]
                    if not c['operation_ids'] and c.get('state') == 'RESOLVED':
                        c['state'] = 'UNSUPPORTED'
                        c['reason'] = 'definition_unavailable'
                for r in normalized:
                    if r.supporting_for and not any(r.id == c['requirement_id'] and c['operation_ids'] for c in coverage):
                        r.availability = 'unsupported'
                        r.reason = 'definition_unavailable'
        if len(operations)>op_cap:
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
                "lens_plan":self.lens_plan,"intent_fingerprint":intent_fingerprint(intent,self.reference,self.catalog),
                "plan_fingerprint":plan_fingerprint(operations,coverage,self.catalog.fingerprint,POLICY_VERSION),"resolver_version":VERSION}


def verify_operation_bindings(operations, artifacts):
    """Compare every executable field, including filters/time/metric population."""
    from services.analytical_tool_contract import canonicalize
    if set(artifacts) != {o['id'] for o in operations}:
        return False
    return all(canonicalize(o, {}, {})[0] == artifacts[o['id']].query for o in operations)
