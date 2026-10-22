"""Analyst Workspace (V3.1): governed missions, limits and UI capability metadata.

A mission is a UX/analytical-structure hint above V3.0 semantic intent. It never
selects metrics for the planner, never bypasses validation and never alters a
number. Everything here is derived from the registry and the compiler's
compatibility checks; there is no separate UI catalog.
"""
from services.analysis_catalog import AnalysisError


def workspace_base(intent):
    """Freeze requested work; generated lenses are reproduced by the resolver."""
    from copy import deepcopy
    base = deepcopy(intent)
    base['requirements'] = [r for r in base['requirements'] if not r.get('supporting_for')]
    return base


def workspace_selection_filter(selection, catalog):
    """Strict scalar typing, including bool-vs-number and finite values."""
    import math
    from datetime import date
    from common import WorkspaceSelection
    s = WorkspaceSelection.model_validate(selection).model_dump()
    dim = catalog.registry['dimensions'].get(s['dimension_id'])
    if not dim:
        raise AnalysisError('unsupported_dimension', 'Unknown interaction dimension')
    values = []
    for item in s['values']:
        value, kind = item['value'], item['type']
        valid = ((kind == 'string' and type(value) is str and 0 < len(value) <= 512)
                 or (kind == 'number' and type(value) in {int, float} and math.isfinite(value))
                 or (kind == 'boolean' and type(value) is bool))
        if kind == 'date' and type(value) is str:
            try: valid = date.fromisoformat(value).isoformat() == value
            except ValueError: valid = False
        if not valid or (dim.get('logical_type') == 'number' and kind != 'number'):
            raise AnalysisError('invalid_analysis_contract', 'Interaction value type differs from dimension')
        values.append(value)
    if s['operator'] == 'eq' and len(values) != 1:
        raise AnalysisError('invalid_analysis_contract', 'Equality needs exactly one value')
    return dict(dimension=s['dimension_id'], operator=s['operator'],
                value=values[0] if s['operator'] == 'eq' else values)


def workspace_intent(base, state, catalog, reference):
    """Apply bounded selections to the frozen population, never replace it.

    Used by execution AND independent history replay. No SQL or model input.
    A numerator partition is inspect-only for every metric declaring one.
    """
    from services.analysis_intent import AnalysisIntentEnvelope
    from services.analytical_resolver import AnalyticalResolver
    intent = AnalysisIntentEnvelope.model_validate(workspace_base(base))
    index = AnalyticalResolver(catalog, reference).index
    metrics = [m for r in intent.requirements for m in r.metric_ids]
    partitions = {catalog.registry['metrics'][m].get('components', {}).get('partition_dimension') for m in metrics}
    selections = list(state.get('filters', [])) + [d['selection'] for d in state.get('drill_path', [])]
    for s in selections:
        selected = workspace_selection_filter(s, catalog)
        d = selected['dimension']
        if d in partitions or any(d not in index.metrics[m]['dimensions'] for m in metrics):
            raise AnalysisError('query_scope', 'Selection cannot preserve every requested metric population')
        for req in intent.requirements:
            # Conjunction preserves original approved filters, even at the same axis.
            existing = [f for f in req.filters if f.dimension == d]
            if existing:
                admitted = set(selected['value'] if selected['operator'] == 'in' else [selected['value']])
                for f in existing:
                    original = set(f.value if isinstance(f.value, list) else [f.value])
                    if f.operator not in {'eq', 'in'} or not admitted <= original:
                        raise AnalysisError('query_scope', 'Selection cannot widen the approved axis')
                req.filters = [f for f in req.filters if f.dimension != d]
            if selected not in [f.model_dump() for f in req.filters]:
                from services.analysis_contract import Filter
                req.filters.append(Filter.model_validate(selected))
    for drill in state.get('drill_path', []):
        source, target = drill['selection']['dimension_id'], drill['target_dimension_id']
        dims = catalog.registry['dimensions']
        paths = dims.get(source, {}).get('hierarchies', [])
        if not any(source in path and path.index(source) + 1 < len(path)
                   and path[path.index(source) + 1] == target for path in paths):
            raise AnalysisError('query_scope', 'Drill edge is not governed')
        if any(target not in index.metrics[m]['dimensions'] for m in metrics):
            raise AnalysisError('query_scope', 'Drill target incompatible with requested metrics')
        for req in intent.requirements:
            if req.analysis_kind not in {'aggregate', 'comparison', 'distribution'} or req.ranking or req.forecast:
                raise AnalysisError('query_scope', 'This analytical shape cannot inherit drill grain')
            req.dimension_ids = [target if d == source else d for d in req.dimension_ids]
            if target not in req.dimension_ids:
                req.dimension_ids.append(target)
            req.derived_features = [f for f in req.derived_features if f != 'scalar']
    return intent


def workspace_contract(report, artifacts, catalog):
    """Server-owned selection options from approved result rows, not chart labels.

    Identity columns disambiguate duplicate labels. Partition dimensions are
    explicitly inspect-only, and mixed populations fail closed as a whole.
    """
    from services.analytical_resolver import AnalyticalResolver, digest
    from services.analytical_capacity_planner import AnalyticalCapacityContract
    from services.result_artifact_store import serialized
    from datetime import date
    capacity = AnalyticalCapacityContract.from_env()
    option_bytes = min(32768, capacity.response_bytes // 32) // max(1, len(report.get('charts', [])))
    base = workspace_base(report['semantic_intent'])
    index = AnalyticalResolver(catalog, date.fromisoformat(report['quality_context']['reference_date'])).index
    metrics = [m for r in base['requirements'] for m in r['metric_ids']]
    partitions = {catalog.registry['metrics'][m].get('components', {}).get('partition_dimension') for m in metrics}
    entries = []
    for chart in report.get('charts', []):
        source = chart.get('x_field')
        dim = catalog.registry['dimensions'].get(source, {})
        artifact = artifacts.get(chart.get('scope_ref'))
        if not dim or not artifact or source not in artifact.query.group_by:
            continue
        identity = dim.get('identity') or source
        compatible = all(identity in index.metrics[m]['dimensions'] for m in metrics)
        behavior = 'inspect_only' if source in partitions else 'population_filter' if compatible else 'not_applicable'
        choices, used = [], 0
        for row in artifact.result['rows'][:capacity.preview_rows]:
            value = row.get(identity)
            if value is None or type(value) not in {str, int, float, bool}: continue
            typed = dict(type='boolean' if type(value) is bool else 'number' if type(value) in {int, float} else 'string', value=value)
            selection = dict(chart_id=chart['id'], query_id=artifact.query.id, lens_id=chart.get('analysis_lens_id'),
                             dimension_id=identity, operator='eq', values=[typed])
            if any(c['selection'] == selection for c in choices): continue
            label = str(row.get(source, value))
            if len(label) > 128: label = label[:128] + '… · ' + str(value)
            choice = dict(label=label, selection=selection)
            size = len(serialized(choice))
            if used + size > option_bytes: break
            choices.append(choice); used += size
        next_levels = sorted({path[path.index(source) + 1] for path in dim.get('hierarchies', [])
            if source in path and path.index(source) + 1 < len(path)})
        # Drill edge uses the semantic grouping dimension; entity leaves do not
        # acquire arbitrary children through an identity alias.
        next_levels = [d for d in next_levels if identity == source and all(d in index.metrics[m]['dimensions'] for m in metrics)]
        if any(r.get('analysis_kind') not in {'aggregate', 'comparison', 'distribution'} or r.get('ranking') or r.get('forecast') for r in base['requirements']):
            next_levels = []
        entries.append(dict(chart_id=chart['id'], dimension_id=identity, label=dim['business_name'],
                            selection_behavior=behavior, options=choices, next_levels=next_levels,
                            options_truncated=len(choices)<len(artifact.result['rows'])))
    return dict(version=1, session_id=report['session_id'], revision=report['revision'],
        catalog_fingerprint=catalog.fingerprint,
        access_fingerprint=(report.get('authorized_scope') or {}).get('policy_fingerprint'),
        snapshot_fingerprint=digest({id:a.result_ref for id,a in artifacts.items()}), charts=entries)


def validate_workspace_revision(request, session, catalog):
    """Only new selections need current row bindings; retained ones stay frozen."""
    from services.access_policy import active_principal, current_principal
    from services.analytical_resolver import digest
    if request.revision != session.revision or request.catalog_fingerprint != session.schema_fingerprint:
        raise AnalysisError('stale_approval', 'Interaction revision differs from approved report')
    contract = session.report_response.get('interaction_contract')
    if not contract or contract['catalog_fingerprint'] != catalog.fingerprint:
        raise AnalysisError('schema_changed', 'Refresh requires the original compatible catalog')
    access = current_principal(required=True).access_fingerprint if active_principal.get() is not None else None
    if access != contract['access_fingerprint'] or request.access_fingerprint != access:
        raise AnalysisError('query_scope', 'Interaction access differs from approved report')
    state = dict(filters=[s.model_dump() for s in request.filters], drill_path=[d.model_dump() for d in request.drill_path])
    old = session.report_response.get('interaction_state') or dict(filters=[], drill_path=[])
    retained = {digest(s) for s in old['filters']} | {digest(d['selection']) for d in old['drill_path']}
    for s in state['filters'] + [d['selection'] for d in state['drill_path']]:
        if digest(s) in retained: continue
        entry = next((c for c in contract['charts'] if c['chart_id'] == s['chart_id']), None)
        if not entry or entry['selection_behavior'] != 'population_filter':
            raise AnalysisError('query_scope', 'Chart selection is inspect-only or incompatible')
        selected = workspace_selection_filter(s, catalog)
        allowed = [c['selection'] for c in entry['options']]
        for item in s['values']:
            candidate = dict(s, operator='eq', values=[item])
            if candidate not in allowed:
                raise AnalysisError('query_scope', 'Selection is not in the approved result scope')
    # Back/reset may remove suffixes; new drill steps must come from the current level.
    path = state['drill_path']; prior = old['drill_path']
    common = 0
    while common < min(len(path), len(prior)) and path[common] == prior[common]: common += 1
    if len(path) > common:
        if common != len(prior) or len(path) != common + 1:
            raise AnalysisError('query_scope', 'Drill must advance one governed edge')
        step = path[-1]
        entry = next((c for c in contract['charts'] if c['chart_id'] == step['selection']['chart_id']), None)
        if not entry or step['target_dimension_id'] not in entry['next_levels']:
            raise AnalysisError('query_scope', 'Drill edge unavailable in this report')
    return state

MISSION_IDS = ("overview", "compare", "ranking", "trend", "composition", "forecast", "risk_watch", "relationship")
OPERATIONS = {"aggregate", "ranking", "trend", "distribution", "detail", "cross_tab", "relationship"}
CHART_FORMS = {"kpi", "line", "area", "bar", "horizontal_bar", "grouped_bar", "donut", "stacked_100", "table",
               "forecast_line", "risk_table", "scatter"}
RESULT_TABS = {"all", "trend", "composition", "comparison", "ranking", "forecast", "risk"}
FOLLOW_UPS = {"drilldown", "trend", "previous_period", "forecast", "compare", "composition", "ranking"}
SLOTS = {"metric", "metric_b", "dimension", "value_a", "value_b", "time", "n", "granularity", "horizon", "cadence", "scope"}
RISK_OPERATORS = {"gt": ">", "gte": "≥", "lt": "<", "lte": "≤"}


def validate_workspace(registry):
    """Logical validation of missions and risk signals. Raises ValueError."""
    validate_dashboard_templates(registry)
    metrics, dims = registry["metrics"], registry["dimensions"]
    missions = registry.get("analysis_missions")
    if missions is None:
        return
    ids = [m["id"] for m in missions]
    if len(ids) != len(set(ids)) or set(ids) != set(MISSION_IDS):
        raise ValueError("Mission identities must be unique and complete")
    for m in missions:
        if not m.get("label") or not set(m["operations"]) <= OPERATIONS or not m["operations"]:
            raise ValueError("Mission operation unavailable")
        if not set(m["chart_forms"]) <= CHART_FORMS or not set(m["result_tabs"]) <= RESULT_TABS:
            raise ValueError("Mission chart/result form unsupported")
        if m.get("visible", True) is False and m.get("maps_to") not in {None, *MISSION_IDS} - {m["id"]}:
            raise ValueError("Hidden mission must map to another mission or free form")
        if not set(m.get("follow_ups", [])) <= FOLLOW_UPS:
            raise ValueError("Mission follow-up unsupported")
        template = m.get("template", {})
        if not set(template.get("slots", []) + template.get("selectors", [])) <= SLOTS or any("{" + s + "}" not in template.get("text", "") for s in template.get("slots", [])):
            raise ValueError("Mission template slots invalid")
        low, high = m.get("kpi_cards", [0, 4])
        if not 0 <= low <= high <= 4:
            raise ValueError("Mission KPI bounds invalid")
        for ref in m.get("metric_refs", []):
            if ref not in metrics:
                raise ValueError("Mission metric unavailable")
        if m["id"] == "forecast" and (not m["metric_requirements"].get("forecastable")
                                      or any(not (metrics[ref].get("forecast") or {}).get("forecastable") for ref in m.get("metric_refs", []))):
            raise ValueError("Forecast mission must reference forecastable metrics only")
    seen = set()
    for s in registry.get("risk_signals", []):
        metric = metrics.get(s.get("metric"))
        if not metric or s["id"] in seen or s.get("operator") not in RISK_OPERATORS:
            raise ValueError("Risk signal metric/operator invalid")
        seen.add(s["id"])
        if not isinstance(s.get("threshold"), (int, float)) or not isinstance(s.get("warning_margin", 0), (int, float)) or s.get("warning_margin", 0) < 0:
            raise ValueError("Risk threshold must be numeric")
        bounds = metric.get("value_range")
        if bounds and not bounds[0] <= s["threshold"] <= bounds[1]:
            raise ValueError("Risk threshold outside metric range")
        if metric.get("aggregation_semantics") == "ratio" and metric.get("unit") != "%":
            raise ValueError("Ratio risk threshold requires percent unit")
        bad = "above" if s["operator"] in {"gt", "gte"} else "below"
        if {"above": "lower_better", "below": "higher_better"}[bad] != metric.get("quality_direction"):
            raise ValueError("Risk direction contradicts metric quality direction")
        if s.get("observation_metric") and s["observation_metric"] not in metrics:
            raise ValueError("Risk observation metric unavailable")
    concepts = registry.get("workspace", {}).get("sensitive_request_concepts", [])
    if any(not c.get("aliases") or not c.get("message") for c in concepts):
        raise ValueError("Sensitive concept invalid")
    workspace = registry.get("workspace", {})
    concepts = {**registry.get("unsupported_capabilities", {}), **workspace.get("unsupported_concepts", {})}
    nearest = workspace.get("unsupported_nearest", {})
    for id, u in concepts.items():
        refs = set(u.get("nearest_metrics", [])) | set(nearest.get(id, []))
        if id in metrics or not u.get("aliases") or not refs <= metrics.keys():
            raise ValueError("Unsupported concept references")
    if not set(nearest) <= concepts.keys() or set(workspace.get("unsupported_concepts", {})) & set(registry.get("unsupported_capabilities", {})):
        raise ValueError("Unsupported concept identities")


# --- Capability metadata ---------------------------------------------------

def _labels(registry, kind, ids):
    return [{"id": i, "label": registry[kind][i]["business_name"]} for i in ids if i in registry[kind]]


def metric_capabilities(catalog, profiles, executable):
    """Per-metric UI metadata. Dimensions = curated lens/scope groupings that the
    compiler proves compatible; never internal identifiers or sensitive fields."""
    r = catalog.registry
    out = {}
    for domain_id, p in profiles.items():
        for metric in p["metric_refs"]:
            if metric in out or not executable(metric):
                continue
            m = r["metrics"][metric]
            compatible = set(catalog.compatible_dimensions(metric))
            curated = [d for p2 in profiles.values() for l in p2["analytical_lenses"] if metric in l["metric_refs"]
                       for d in l["dimension_refs"]]
            curated += [d for d, v in r["dimensions"].items() if v.get("scope_selectable") and d in compatible
                        and not d.endswith("_id")]
            curated += [d for d,v in r['dimensions'].items() if v.get('derived_scope_dimension') in curated and d in compatible]
            dims = [d for d in dict.fromkeys(curated) if d in compatible]
            examples = [e for p2 in profiles.values() for l in p2["analytical_lenses"] if metric in l["metric_refs"]
                        for e in l.get("example_intents", [])[:1]]
            forecast = m.get("forecast") or {}
            from services.semantic_preflight_contract import metric_capability
            out[metric] = {
                "capability": metric_capability(metric, m),
                "owner": m.get('owner'), "lifecycle": m.get('lifecycle', {'status': 'active'}),
                "lineage": {k:v for k,v in catalog.metric_lineage(metric).items()
                    if k in {'metric_id','formula_fingerprint'}},
                "id": metric, "label": m["business_name"], "domain": domain_id, "unit": m["unit"],
                "semantic_type": m.get("aggregation_semantics"), "additive": bool(m.get("additive")),
                "historical": bool(m.get("time_column")), "current": not m.get("time_column"),
                "forecastable": bool(forecast.get("forecastable")),
                "forecast": {k: forecast[k] for k in ("cadences", "max_horizon", "min_history")} if forecast.get("forecastable") else None,
                "quality_direction": m.get("quality_direction"), "value_range": m.get("value_range"),
                "definition": m.get("business_definition") or m.get("business_meaning") or m.get("description"),
                "dimensions": _labels(r, "dimensions", dims),
                "examples": list(dict.fromkeys(examples))[:2],
            }
    return out


def mission_catalog(registry, metrics, coverage, lenses):
    """Availability of each governed mission, with a reason when limited."""
    risk = risk_catalog(registry, metrics)
    relationship = sorted({m for l in lenses if "relationship" in (l.get("blueprint") or {}).get("allowed_operations", [])
                           for m in l["metric_refs"] if m in metrics})
    stale = bool((coverage or {}).get("freshness", {}).get("stale"))
    out = []
    for m in registry.get("analysis_missions", []):
        need = m.get("metric_requirements", {})
        eligible = [id for id, c in metrics.items()
                    if (not need.get("historical") or c["historical"]) and (not need.get("forecastable") or c["forecastable"])
                    and (not need.get("additive") or c["additive"]) and (not need.get("dimension") or c["dimensions"])]
        if need.get("relationship"):
            eligible = relationship
        if need.get("risk_signal"):
            eligible = [s["metric"] for s in risk if s["available"]]
        status, reason = "available", None
        if not eligible:
            status, reason = "unavailable", "Chưa có chỉ số được quản trị đáp ứng điều kiện của nhiệm vụ này."
        elif need.get("risk_signal") and len(eligible) < len(risk):
            status, reason = "partial", f"{len(eligible)}/{len(risk)} tín hiệu rủi ro có dữ liệu được quản trị."
        elif need.get("forecastable") and stale:
            status, reason = "partial", "Dữ liệu cập nhật theo đợt đang trễ; dự báo sẽ kèm cảnh báo độ mới dữ liệu."
        elif need.get("relationship"):
            status, reason = "partial", "Chỉ hỗ trợ quan hệ giữa các chỉ số trong cùng một nhóm phân tích (ví dụ shipper)."
        from services.mission_contract_service import contracts
        from services.semantic_preflight_contract import additive_across
        dimensions_by_metric={id:[d['id'] for d in metrics[id]['dimensions']
            if not need.get('additive') or additive_across(metrics[id]['capability'],d['id'])] for id in eligible}
        out.append({**{k: m[k] for k in ("id", "label", "description", "operations", "result_tabs", "chart_forms", "kpi_cards", "template", "examples")},
                    "visible": m.get("visible", True), "maps_to": m.get("maps_to"),
                    "caveat": m.get("caveat"), "follow_ups": m.get("follow_ups", []),
                    "input_contract": contracts(registry).get(m["id"]),
                    "status": status, "reason": reason, "metrics": eligible,
                    "dimensions_by_metric": dimensions_by_metric})
    return out


def risk_catalog(registry, metrics):
    out = []
    for s in registry.get("risk_signals", []):
        m = registry["metrics"][s["metric"]]
        out.append({"id": s["id"], "label": s["label"], "metric": s["metric"], "metric_label": m["business_name"],
                    "unit": m["unit"], "operator": s["operator"], "operator_symbol": RISK_OPERATORS[s["operator"]],
                    "threshold": s["threshold"], "warning_margin": s.get("warning_margin", 0),
                    "bad_direction": "above" if s["operator"] in {"gt", "gte"} else "below",
                    "definition": m.get("business_definition") or m.get("business_meaning"),
                    "historical": bool(m.get("time_column")), "threshold_kind": "system_default", "configurable": True,
                    "observation_metric": s.get("observation_metric"), "minimum_observations": s.get("minimum_observations"),
                    "available": s["metric"] in metrics})
    return out


def unsupported_concepts(registry):
    """Governed unavailable concepts: semantic-engine ones plus workspace-only ones."""
    workspace = registry.get("workspace", {})
    nearest = workspace.get("unsupported_nearest", {})
    merged = {**registry.get("unsupported_capabilities", {}), **workspace.get("unsupported_concepts", {})}
    return {id: {**u, "nearest_metrics": list(dict.fromkeys(u.get("nearest_metrics", []) + nearest.get(id, [])))}
            for id, u in merged.items()}


def unsupported_catalog(registry):
    return [{"id": id, "concepts": u["aliases"], "reason": u.get("reason"), "limitation": u.get("limitation"),
             "nearest": _labels(registry, "metrics", u["nearest_metrics"])} for id, u in unsupported_concepts(registry).items()]


def limits(registry, metrics):
    from common import AiTextToReportRequest
    from services.analyst_contract import AnalyticalQuery
    def max_length(model, field):
        return next((getattr(m, "max_length") for m in model.model_fields[field].metadata if getattr(m, "max_length", None)), None)
    workspace = registry.get("workspace", {})
    return {"max_requirements": workspace.get("limits", {}).get("max_requirements"),
            "max_question_chars": max_length(AiTextToReportRequest, "prompt"),
            "max_dimensions": max_length(AnalyticalQuery, "group_by"),
            "max_ranking_n": workspace.get("limits", {}).get("max_ranking_n"),
            "max_charts": registry.get("max_charts"),
            "forecast": {id: c["forecast"] for id, c in metrics.items() if c["forecast"]},
            "preflight": workspace.get("preflight", {})}


def workspace_capabilities(intelligence, profiles, executable, coverage):
    catalog = intelligence.catalog
    r = catalog.registry
    metrics = metric_capabilities(catalog, profiles, executable)
    lenses = [l for p in profiles.values() for l in p["analytical_lenses"]]
    workspace = r.get("workspace", {})
    dimension_values = {}
    for id, d in r["dimensions"].items():
        if d.get("value_labels"):
            dimension_values[id] = [{"value": int(k) if k.isdigit() else k, "label": v} for k, v in d["value_labels"].items()]
    return {"workspace_version": workspace.get("version", "3.1"),
            "metrics": list(metrics.values()),
            "missions": mission_catalog(r, metrics, coverage, lenses),
            "risk_signals": risk_catalog(r, metrics),
            "unsupported": unsupported_catalog(r),
            "limits": limits(r, metrics),
            "data_coverage": coverage,
            "threshold_policy": workspace.get("threshold_policy"),
            "default_depth": r.get("dashboard_policy", {}).get("default_depth", "deep"),
            "phrases": {"time": workspace.get("time_phrases", {}), "granularity": workspace.get("granularity_phrases", {}),
                        "cadence": workspace.get("forecast_cadence_labels", {})},
            "dimension_value_labels": dimension_values}


# --- Report-side helpers (deterministic, zero provider calls) -------------

def mission_for(registry, value):
    """Validated optional mission hint; unknown values are ignored, not errors."""
    if not value:
        return None
    return next((m for m in registry.get("analysis_missions", []) if m["id"] == value), None)


FORM_OF = {"line": "line", "area": "line", "multi_line": "line", "bar": "bar", "horizontal_bar": "horizontal_bar",
           "grouped_bar": "grouped_bar", "stacked_bar": "bar", "donut": "donut", "stacked_100": "stacked_100", "pareto": "bar",
           "heatmap": "table", "scatter": "scatter", "table": "table"}


def mission_layout(mission, charts):
    """Order of tabs/charts for presentation only. Values are never touched."""
    if not mission:
        return None
    forms = mission["chart_forms"]
    rank = lambda c: (c.get("role") == "supporting",
                      forms.index(FORM_OF.get(c.get("chart_type"), "table")) if FORM_OF.get(c.get("chart_type"), "table") in forms else len(forms))
    order = sorted(range(len(charts)), key=lambda i: (*rank(charts[i]), i))
    return {"mission": mission["id"], "label": mission["label"], "tab_order": mission["result_tabs"],
            "chart_order": [charts[i].get("id") for i in order], "kpi_cards": mission["kpi_cards"],
            "caveat": mission.get("caveat")}


def _time_phrase(period):
    if period and period.get("start") and period.get("end"):
        return f"từ {period['start']} đến {period['end']}"
    return ""


def follow_up_questions(artifacts, catalog, mission=None, limit=4):
    """2–4 deterministic next questions from the verified result and registry."""
    r = catalog.registry
    requested = [a for a in artifacts.values() if getattr(a.query, "role", "requested") == "requested" and a.plan.metrics]
    if not requested:
        return []
    main = requested[0]
    metric = main.plan.metrics[0]
    definition = r["metrics"][metric]
    label = definition["business_name"]
    period = main.plan.period or {}
    time = _time_phrase(period)
    used = set(main.plan.dimensions)
    lens_dims = [d for p in r["domain_intelligence"]["profiles"].values() for l in p["analytical_lenses"]
                 if metric in l["metric_refs"] for d in l["dimension_refs"]]
    compatible = set(catalog.compatible_dimensions(metric))
    options = []
    kinds = (mission or {}).get("follow_ups") or ["drilldown", "trend", "previous_period", "forecast"]
    for kind in kinds:
        if kind == "drilldown":
            other = next((d for d in dict.fromkeys(lens_dims) if d in compatible and d not in used), None)
            if other:
                options.append({"kind": kind, "text": f"{label} theo {r['dimensions'][other]['business_name'].lower()} {time}".strip()})
        elif kind == "trend" and definition.get("time_column") and main.plan.kind != "trend":
            options.append({"kind": kind, "text": f"{label} theo tuần {time}".strip()})
        elif kind == "previous_period" and period.get("start"):
            options.append({"kind": kind, "text": f"So sánh {label.lower()} {time} với kỳ trước"})
        elif kind == "forecast" and (mission or {}).get("id") != "forecast" and definition.get("forecast", {}).get("forecastable"):
            horizon = min(3, definition["forecast"]["max_horizon"].get("month", 3))
            options.append({"kind": kind, "text": f"Dự báo {label.lower()} {horizon} tháng tới"})
        elif kind == "composition" and definition.get("additive") and used:
            options.append({"kind": kind, "text": f"Cơ cấu {label.lower()} theo {r['dimensions'][sorted(used)[0]]['business_name'].lower()} {time}".strip()})
        elif kind == "ranking" and used:
            options.append({"kind": kind, "text": f"Top 5 {r['dimensions'][sorted(used)[0]]['business_name'].lower()} theo {label.lower()} {time}".strip()})
        elif kind == "compare" and definition.get("time_column") and period.get("start"):
            options.append({"kind": kind, "text": f"So sánh {label.lower()} {time} với kỳ trước"})
    unique = list({o["text"]: o for o in options}.values())
    return unique[:limit]


def require_mission(registry, value):
    mission = mission_for(registry, value)
    if value and not mission:
        raise AnalysisError("analysis_mission_unknown", "Unknown analysis mission")
    return mission


def validate_dashboard_templates(registry):
    """Stored references only; execution still uses the existing semantic compiler."""
    import re
    from services.analysis_intent import AnalysisIntentEnvelope
    templates = registry.get('workspace', {}).get('dashboard_templates')
    if templates is None:
        return
    # Contiguous stable identities D01..Dnn (D17+ added by PLAN 20/10 business coverage).
    if not 16 <= len(templates) <= 64 or {item['id'] for item in templates} != {f'D{i:02}' for i in range(1,len(templates)+1)}:
        raise ValueError('Dashboard identities must be unique and complete')
    for item in templates:
        if (set(item) != {'id','version','title','category','description','limitation','default_time','requirements'}
                or not re.fullmatch(r'\d+\.\d+\.\d+', item['version'])
                or not all(isinstance(item[key],str) and item[key].strip() for key in ('title','category','description','limitation'))
                or item['default_time'] not in {'30d','all_time'} or not 2 <= len(item['requirements']) <= 6):
            raise ValueError('Invalid dashboard declaration')
        intent = AnalysisIntentEnvelope.model_validate({'decision':'analyze','requirements':item['requirements']})
        if len({req.id for req in intent.requirements}) != len(intent.requirements):
            raise ValueError('Duplicate dashboard panel identity')
        for req in intent.requirements:
            if (not req.metric_ids or not set(req.metric_ids) <= registry['metrics'].keys()
                    or not set(req.dimension_ids) <= registry['dimensions'].keys()
                    or any(f.dimension not in registry['dimensions'] for f in req.filters)
                    or req.analysis_kind not in {'aggregate','ranking','trend','distribution','comparison'}):
                raise ValueError('Dashboard references unavailable semantics')
            if req.analysis_kind == 'ranking' and (not req.ranking or req.ranking.metric_id not in req.metric_ids):
                raise ValueError('Dashboard ranking metric must be explicit')


def dashboard_template(catalog, identity, version):
    from copy import deepcopy
    from services.hub_problem_service import is_custom, custom_template
    if is_custom(identity):
        return custom_template(identity, version)
    template = next((item for item in catalog.registry.get('workspace', {}).get('dashboard_templates', [])
                     if item['id']==identity), None)
    if template is None or template['version'] != version:
        raise AnalysisError('dashboard_unavailable', 'Dashboard version is unavailable; refresh the catalog')
    return deepcopy(template)


def dashboard_intent(catalog, identity, version, period=None):
    from services.analysis_intent import AnalysisIntentEnvelope
    template = dashboard_template(catalog, identity, version)
    for req in template['requirements']:
        if req['analysis_kind'] == 'trend':
            from services.mission_contract_service import _trend_cadence
            req['granularity'] = _trend_cadence(period)
        for metric in req['metric_ids']:
            if not set(req.get('dimension_ids', [])) <= set(catalog.compatible_dimensions(metric)):
                raise AnalysisError('dashboard_unavailable', 'Dashboard grouping is no longer compatible')
        if period and period.get('start') and any(catalog.registry['metrics'][m].get('time_column') for m in req['metric_ids']):
            req['time'] = {'kind':'range', 'start':period['start'], 'end':period['end']}
    return AnalysisIntentEnvelope.model_validate({'decision':'analyze','requirements':template['requirements']}).model_dump(mode='json',exclude_none=True)


def dashboard_sources(catalog, template):
    sources = set()
    for req in template['requirements']:
        sources.update(catalog.registry['metrics'][m]['source'] for m in req['metric_ids'])
        sources.update(catalog.registry['dimensions'][d]['table'] for d in req.get('dimension_ids', []))
        sources.update(catalog.registry['dimensions'][f['dimension']]['table'] for f in req.get('filters', []))
    return sorted(sources)


def dashboard_catalog(catalog, data_health=None):
    from services.access_policy import active_principal, current_principal
    principal = current_principal(required=True) if active_principal.get() is not None else None
    views = (data_health or {}).get('views', {})
    from services.domain_intelligence_service import DomainIntelligence
    scope_types = DomainIntelligence(catalog).capabilities()['scope_types']
    result = []
    from services.hub_problem_service import owned_templates
    for template in [*catalog.registry.get('workspace', {}).get('dashboard_templates', []), *owned_templates()]:
        try:
            sources = dashboard_sources(catalog, template)
        except KeyError:
            continue  # a user problem whose meaning left the catalog is hidden, never guessed
        if principal and any(not principal.permits('analytics.read', source) for source in sources):
            continue
        statuses = [views.get(source, {}).get('status','unknown') for source in sources]
        status = next((value for value in ('blocked','unknown','degraded') if value in statuses),'healthy' if statuses else 'unknown')
        result.append({key:template[key] for key in ('id','version','title','category','description','limitation','default_time')} | {
            'panel_count':len(template['requirements']), 'status':status, 'custom':bool(template.get('custom')),
            'source_views':sources, 'provider_calls':0,
            'time_filter_enabled':any(catalog.registry['metrics'][metric].get('time_column')
                for req in template['requirements'] for metric in req['metric_ids']),
            'scope_types':[scope for scope in scope_types if scope['id'] in {'store_id','city','reporting_region','store_type'}
                and all(scope['id'] in catalog.compatible_dimensions(metric)
                    for req in template['requirements'] for metric in req['metric_ids'])]})
    return {'version':'3.5.0','dashboards':result, 'catalog_fingerprint':catalog.fingerprint}
