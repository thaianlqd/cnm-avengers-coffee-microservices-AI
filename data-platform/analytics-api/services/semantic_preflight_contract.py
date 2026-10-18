"""V3.2 canonical alias priority and the protected preflight → planner contract.

Preflight and planner must not disagree about the meaning of an explicit
business phrase. A governed canonical alias ("doanh thu") anchors exactly one
metric. Specialized siblings (product/store/payment revenue…) stay available
only when the user qualified them explicitly (their own phrase) or the
requirement itself carries one of their governed qualifier dimensions. The LLM
may fill unresolved fields; it cannot silently replace a locked metric.
"""
from services.value_grounding_service import value_text


def alias_policy(registry):
    policy = registry.get("metric_alias_policy") or {}
    canonical = {value_text(k): v for k, v in (policy.get("canonical") or {}).items()}
    ambiguous = {value_text(a) for a in policy.get("ambiguous", [])}
    return canonical, ambiguous


def anchor_vocabulary(registry):
    """phrase -> metric ids, honoring non_anchor_aliases (same rule as request_anchors)."""
    vocabulary = {}
    for id, definition in registry["metrics"].items():
        broad = {value_text(a) for a in definition.get("non_anchor_aliases", [])}
        for alias in [id, definition["business_name"], *definition.get("aliases", [])]:
            phrase = value_text(alias)
            if phrase and phrase not in broad:
                vocabulary.setdefault(phrase, set()).add(id)
    return vocabulary


def validate_alias_policy(registry):
    """Every alias shared by several metrics must be governed. Raises ValueError.

    Shared = canonical (exactly one owner, which must claim the alias) or
    explicitly marked ambiguous. Unmarked collisions are registry defects.
    """
    policy = registry.get("metric_alias_policy")
    if policy is None:
        return
    canonical, ambiguous = alias_policy(registry)
    raw = policy.get("canonical") or {}
    if len({value_text(k) for k in raw}) != len(raw):
        raise ValueError("Duplicate canonical metric alias")
    vocabulary = anchor_vocabulary(registry)
    for phrase, owner in canonical.items():
        if owner not in registry["metrics"] or owner not in vocabulary.get(phrase, set()):
            raise ValueError("Canonical alias must be claimed by its owner metric")
        if phrase in ambiguous:
            raise ValueError("Alias cannot be both canonical and ambiguous")
    for phrase, owners in vocabulary.items():
        if len(owners) > 1 and phrase not in canonical and phrase not in ambiguous:
            raise ValueError("Ungoverned metric alias collision")
    for id, definition in registry["metrics"].items():
        if not set(definition.get("qualifier_dimensions", [])) <= registry["dimensions"].keys():
            raise ValueError("Broken metric qualifier dimensions")


def canonical_anchor(anchor, registry):
    """Canonical metric for an anchor phrase, or None."""
    canonical, _ = alias_policy(registry)
    owner = canonical.get(anchor.get("phrase"))
    return owner if owner in anchor.get("candidate_ids", []) else None


def metric_locks(anchors, registry):
    """Locked metric meanings from explicit canonical phrases in the request."""
    explicit = {}
    for a in anchors.get("metrics", []):
        if len(a["candidate_ids"]) == 1:
            explicit.setdefault(a["candidate_ids"][0], a["phrase"])
    # Entities the user named anywhere in the request ("món", "danh mục",
    # "chi nhánh", a city value…) qualify the specialized metric they govern.
    context = {d for a in anchors.get("dimensions", []) for d in a["candidate_ids"]}
    context |= {v["dimension"] for v in anchors.get("values", [])}
    context |= {d for a in anchors.get("population_scopes", []) for d in a["candidate_ids"]}
    locks = []
    for a in anchors.get("metrics", []):
        owner = canonical_anchor(a, registry)
        if not owner:
            qualified=[m for m in a['candidate_ids'] if context & set(registry['metrics'][m].get('qualifier_dimensions',[]))]
            if len(qualified)==1:owner=qualified[0]
        if not owner:
            continue
        siblings = [m for m in a["candidate_ids"] if m != owner]
        qualified = {m for m in siblings if m in explicit or
                     context & set(registry["metrics"][m].get("qualifier_dimensions", []))}
        locks.append({"phrase": a["phrase"], "metric_id": owner, "siblings": siblings,
                      "explicitly_qualified": sorted(qualified)})
    return locks


def _qualified(metric, req, registry, explicit):
    if metric in explicit:
        return True
    dims = set(req.dimension_ids) | {f.dimension for f in req.filters}
    if req.ranking:
        dims |= set(req.ranking.per_group)
    return bool(dims & set(registry["metrics"][metric].get("qualifier_dimensions", [])))


def _canonical_fits(catalog, owner, req):
    compatible = set(catalog.compatible_dimensions(owner))
    dims = set(req.dimension_ids) | {f.dimension for f in req.filters}
    if not dims <= compatible:
        return False
    definition = catalog.registry["metrics"][owner]
    if (req.analysis_kind == "trend" or req.granularity or req.forecast) and not definition.get("time_column"):
        return False
    return True


def enforce_metric_locks(intent, locks, catalog):
    """Restore locked canonical metrics the interpreter drifted away from.

    Returns (intent, normalizations, conflicts). A drifted sibling is replaced
    only when the canonical metric can express the same requirement; when it
    cannot, the sibling is a contextual qualification and is kept (recorded).
    Never touches requirements that already contain the canonical metric.
    """
    registry = catalog.registry
    if not locks:
        return intent, [], []
    result = intent.model_copy(deep=True)
    changes, conflicts = [], []
    for lock in locks:
        owner, siblings = lock["metric_id"], set(lock["siblings"])
        explicit = set(lock["explicitly_qualified"])
        for req in result.requirements:
            if req.availability != "requested" or req.supporting_for or owner in req.metric_ids:
                continue
            drifted = [m for m in req.metric_ids if m in siblings and not _qualified(m, req, registry, explicit)]
            if not drifted:
                continue
            if not _canonical_fits(catalog, owner, req):
                conflicts.append({"requirement_id": req.id, "phrase": lock["phrase"], "locked_metric": owner,
                                  "proposed_metrics": drifted, "resolution": "contextual_qualification"})
                continue
            previous = list(req.metric_ids)
            req.metric_ids = list(dict.fromkeys(owner if m in drifted else m for m in req.metric_ids))
            for feature, targets in list(req.feature_metrics.items()):
                req.feature_metrics[feature] = list(dict.fromkeys(owner if m in drifted else m for m in targets))
            if req.ranking and req.ranking.metric_id in drifted:
                req.ranking.metric_id = owner
            changes.append({"requirement_id": req.id, "field": "metric_ids", "rule": "canonical_metric_lock",
                            "previous": previous, "value": req.metric_ids, "phrase": lock["phrase"]})
    return result, changes, conflicts


def contract_from_preflight(understood, anchors, registry, mission=None, inferred=None):
    """Protected SemanticPreflightContract (display + planner lock source)."""
    locks = metric_locks(anchors, registry)
    unresolved = []
    if not understood.get("metrics") and not understood.get("unsupported"):
        unresolved.append("metric")
    return {"version": "3.2", "mission": mission, "inferred_mission": (inferred or {}).get("id"),
            "metric_locks": [{k: l[k] for k in ("phrase", "metric_id", "explicitly_qualified")} for l in locks],
            "metrics": [m["id"] for m in understood.get("metrics", [])],
            "dimensions": [d["id"] for d in understood.get("dimensions", [])],
            "filters": understood.get("filters", []), "time": understood.get("time"),
            "forecast": understood.get("forecast"),
            "confidence": "high" if not unresolved else "partial", "unresolved": unresolved}


# --- V3.3 typed capability projections (derived from governed metadata) -------
# One evaluator input: nothing here is declared by the UI or the provider.
_NON_ADDITIVE_SEMANTICS = {"average", "ratio"}
def dimension_logical_type(dimension_id, dimension=None):
    """Classification is managed metadata. Unknown metadata is categorical, never numeric."""
    return (dimension or {}).get('logical_type','category')


def metric_capability(metric_id, metric):
    """Typed, additive-over aware projection of a governed metric."""
    semantics = metric.get("aggregation_semantics")
    legacy_additive = bool(metric.get("additive"))
    additive_over = list(metric.get("additive_over") or ([] if semantics in _NON_ADDITIVE_SEMANTICS else ["*"] if legacy_additive and semantics != "distinct_count" else []))
    if semantics == "distinct_count":
        additive_over = list(metric.get("disjoint_partitions") or [])
    return {"id": metric_id, "semantics": semantics, "unit": metric.get("unit"), "grain": metric.get("grain"),
            "additive": legacy_additive, "additive_over": additive_over,
            "non_additive_over": list(metric.get("non_additive_over") or []),
            "ratio_parts": {"numerator": metric.get("numerator"), "denominator": metric.get("denominator")}
            if semantics == "ratio" else None}


def additive_across(capability, partition):
    """True only when summing the metric across ``partition`` is meaningful.

    ``partition`` is a dimension id or "time". Ratios/averages never sum, distinct
    counts only over declared disjoint partitions, semi-additive metrics never over
    their ``non_additive_over`` axes.
    """
    if partition in capability["non_additive_over"]:
        return False
    if capability["semantics"] in _NON_ADDITIVE_SEMANTICS:
        return False
    over = capability["additive_over"]
    return "*" in over or partition in over


# --- V3.3 single capability decision -----------------------------------------
from typing import Literal, Optional
from pydantic import Field
from services.analysis_contract import Contract

POLICY_VERSION = "3.3.1"


class ViewRequirement(Contract):
    kind: Literal["time_series", "grouped", "scalar", "ranking", "paired_scatter", "driver_delta"]
    metric_ids: list[str] = Field(default_factory=list)
    dimension_ids: list[str] = Field(default_factory=list)
    required: bool = True
    id: Optional[str] = None
    operation_ids: list[str] = Field(default_factory=list)
    transform: Optional[str] = None


class CapabilityConstraint(Contract):
    code: str
    stage: Literal["static", "semantic", "runtime"]
    blocking: bool = True
    subject: Optional[str] = None
    owner: str = "catalog"
    status: Literal['passed', 'failed', 'pending'] = 'failed'
    requirement_id: Optional[str] = None
    message: str = ''


class CapabilityDecision(Contract):
    decision: Literal["READY", "CLARIFY", "REDIRECT", "UNSUPPORTED"]
    policy_version: str = POLICY_VERSION
    constraints: list[CapabilityConstraint] = Field(default_factory=list)
    views: list[ViewRequirement] = Field(default_factory=list)
    stage: Literal['input', 'compiled'] = 'compiled'
    catalog_fingerprint: Optional[str] = None
    interpretation_required: bool = False
    reason: Optional[str] = None
    message: str = ''
    actions: list[dict] = Field(default_factory=list)


CLARIFY_CODES = {'unrecognized_question', 'no_metric_detected', 'metric_needed', 'analysis_target_missing',
    'trend_range_too_short', 'compare_mixed_units', 'cohort_criterion_needed', 'association_category_variable',
    'scope_unresolved', 'scope_conflict'}
REDIRECT_CODES = {'composition_non_additive', 'risk_signal_required', 'risk_mixed_roles', 'mission_mismatch', 'non_additive_total'}


def decision_from_findings(findings, *, catalog_fingerprint=None, interpretation_required=False):
    """The shared input decision. Consumers must enforce ALL failed constraints, never a code whitelist."""
    constraints = [CapabilityConstraint(code=f['code'], stage='static', subject=f.get('metric') or f.get('dimension'),
        message=f['message'], owner='catalog') for f in findings if f['level'] == 'block']
    codes = {c.code for c in constraints}
    verdicts = {'CLARIFY' if c in CLARIFY_CODES else 'REDIRECT' if c in REDIRECT_CODES else 'UNSUPPORTED' for c in codes}
    decision = next((d for d in ('UNSUPPORTED', 'CLARIFY', 'REDIRECT') if d in verdicts), 'READY')
    actions = [dict(fix, constraint_code=f['code']) for f in findings if f['level'] == 'block' for fix in f.get('fixes', [])]
    for action in actions:
        if action.get('kind')=='switch_mission': action['patch']={'mission':action['mission']}
        elif action.get('kind')=='set_time': action['patch']={'time':action['time']}
        elif action.get('kind')=='replace_question': action['patch']={'question':action['question']}
        action['preserves']=['metric','time','scope'] if action.get('kind')=='switch_mission' else []
    return CapabilityDecision(decision=decision, stage='input', constraints=constraints, actions=actions,
        catalog_fingerprint=catalog_fingerprint, interpretation_required=interpretation_required and not constraints,
        reason=constraints[0].code if constraints else None, message=constraints[0].message if constraints else '')


def evaluate_capability(requirement, registry, forecast_check=None):
    """One decision from governed metadata; every constraint names its stage/owner.

    `forecast_check(metric_id, unit, horizon)` raises when the governed forecast
    capability rejects the request (injected to avoid import cycles)."""
    metrics, dims = registry.get("metrics", {}), registry.get("dimensions", {})
    cons, views = [], []
    def add(code, stage, subject=None, blocking=True, owner="catalog"):
        cons.append(CapabilityConstraint(code=code, stage=stage, subject=subject, blocking=blocking, owner=owner))
    for m in requirement.metric_ids:
        if m not in metrics:
            add("unknown_metric", "static", m)
    for d in requirement.dimension_ids:
        if d not in dims:
            add("unknown_dimension", "static", d)
    if any(c.stage == "static" for c in cons):
        return CapabilityDecision(decision="UNSUPPORTED", constraints=cons)
    if requirement.availability in ("unsupported", "insufficient_data"):
        add("declared_" + requirement.availability, "semantic", requirement.reason, owner="provider")
        return CapabilityDecision(decision="UNSUPPORTED", constraints=cons)
    if not requirement.metric_ids or requirement.availability == "needs_input":
        add("metric_required", "semantic", owner="resolver")
        return CapabilityDecision(decision="CLARIFY", constraints=cons)
    fc = requirement.forecast
    if fc is not None:
        if requirement.filters:
            add('forecast_scope_unsupported','semantic',owner='forecast')
        if len(requirement.metric_ids) != 1 or requirement.dimension_ids or requirement.ranking:
            add("forecast_shape", "semantic", owner="forecast")
        elif forecast_check:
            try:
                forecast_check(requirement.metric_ids[0], fc.unit, fc.horizon)
            except Exception:
                add("forecast_unsupported", "semantic", requirement.metric_ids[0], owner="forecast")
        views.append(ViewRequirement(kind="time_series", metric_ids=list(requirement.metric_ids)))
    else:
        for feature in set(requirement.derived_features or []) & {'selected_total','contribution_share','concentration','driver_delta'}:
            selected=requirement.feature_metrics.get(feature)
            if selected is None:
                eligible=[m for m in requirement.metric_ids if metrics[m].get('additive')]
                selected=eligible or requirement.metric_ids
            for m in selected:
                if m not in metrics: continue  # resolver reports invalid targets without dropping siblings
                cap=metric_capability(m,metrics[m])
                if any(not additive_across(cap,d) for d in requirement.dimension_ids):
                    add('non_additive_total','semantic',m,owner='catalog')
        kind = ("driver_delta" if "driver_delta" in (requirement.derived_features or [])
                else "paired_scatter" if requirement.analysis_kind == "relationship" and len(requirement.metric_ids) == 2
                and any(set(requirement.metric_ids) == set(p["metrics"]) for p in registry.get("governed_pairs", []))
                else "ranking" if requirement.ranking else "time_series" if requirement.analysis_kind=="trend"
                else "grouped" if requirement.dimension_ids else "scalar")
        views.append(ViewRequirement(kind=kind, metric_ids=list(requirement.metric_ids),
                                     dimension_ids=list(requirement.dimension_ids)))
    if any(c.blocking for c in cons):
        return CapabilityDecision(decision="REDIRECT", constraints=cons, views=views)
    return CapabilityDecision(decision="READY", constraints=cons, views=views)
