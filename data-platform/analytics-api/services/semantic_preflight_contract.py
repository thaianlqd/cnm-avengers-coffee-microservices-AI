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
