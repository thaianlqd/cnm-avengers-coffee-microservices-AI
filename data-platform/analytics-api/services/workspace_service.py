"""Analyst Workspace (V3.1): governed missions, limits and UI capability metadata.

A mission is a UX/analytical-structure hint above V3.0 semantic intent. It never
selects metrics for the planner, never bypasses validation and never alters a
number. Everything here is derived from the registry and the compiler's
compatibility checks; there is no separate UI catalog.
"""
from services.analysis_catalog import AnalysisError

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
            dims = [d for d in dict.fromkeys(curated) if d in compatible]
            examples = [e for p2 in profiles.values() for l in p2["analytical_lenses"] if metric in l["metric_refs"]
                        for e in l.get("example_intents", [])[:1]]
            forecast = m.get("forecast") or {}
            out[metric] = {
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
        out.append({**{k: m[k] for k in ("id", "label", "description", "operations", "result_tabs", "chart_forms", "kpi_cards", "template", "examples")},
                    "caveat": m.get("caveat"), "follow_ups": m.get("follow_ups", []),
                    "input_contract": contracts(registry).get(m["id"]),
                    "status": status, "reason": reason, "metrics": eligible})
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
           "grouped_bar": "grouped_bar", "stacked_bar": "bar", "donut": "donut", "stacked_100": "stacked_100",
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
