"""V3.2 Mission evidence contract: a chart is shown only when it answers part of
the user's analytical question (or a governed supporting requirement of it).

Deterministic and value-preserving: it never alters a number. It annotates
every admitted chart with its requirement mapping, drops charts with no
mapping or outside the mission's governed evidence (e.g. product revenue in
Risk Watch), and applies the depth budget to SUPPORTING charts only.
"""

SUPPORTING_CHART_BUDGET = {"focused": 0, "deep": 4, "comprehensive": 6}


def requirement_map(coverage, artifacts):
    """query_id -> (requirement_id, role)."""
    out = {}
    for c in coverage or []:
        for op in c.get("operation_ids", []):
            out.setdefault(op, c.get("requirement_id"))
    for id, a in artifacts.items():
        parent = getattr(a.query, "parent_id", None)
        if id not in out and parent and parent in out:
            out[id] = out[parent]
    return out


def mission_metric_scope(catalog, mission_id):
    """Metrics a mission may visualize, or None when unrestricted."""
    if mission_id == "risk_watch":
        signals = catalog.registry.get("risk_signals", [])
        return {s["metric"] for s in signals} | {s["observation_metric"] for s in signals if s.get("observation_metric")}
    return None


def apply(dashboard, artifacts, catalog, *, mission_id=None, depth="deep", coverage=None, intent=None, evidence=()):
    """Gate and annotate dashboard charts in place. Returns a summary dict."""
    mapping = requirement_map(coverage, artifacts)
    goals = {r["id"]: r.get("goal") for r in ((intent or {}).get("requirements") or [])}
    allowed_metrics = mission_metric_scope(catalog, mission_id)
    evidence_by_scope = {}
    for e in evidence:
        evidence_by_scope.setdefault(e.get("scope_ref"), []).append(e.get("id"))
    kept, dropped, supporting = [], [], 0
    budget = SUPPORTING_CHART_BUDGET.get(depth or "deep", 3)
    for chart in dashboard.get("charts", []):
        refs = chart.get("scope_refs") or [chart.get("scope_ref")]
        query_id = refs[0]
        artifact = artifacts.get(query_id)
        requirement = mapping.get(query_id)
        role = getattr(artifact.query, "role", "requested") if artifact else None
        metrics = list(chart.get("metrics") or [chart.get("metric")])
        reason = None
        if not artifact or not requirement:
            reason = "no_requirement_mapping"
        elif allowed_metrics is not None and not set(metrics) <= allowed_metrics:
            reason = "outside_mission_evidence"
        elif role == "supporting" and supporting >= budget:
            reason = "depth_budget"
        if reason:
            dropped.append({"chart_id": chart.get("id"), "title": chart.get("title"), "reason": reason, "query_id": query_id})
            continue
        if role == "supporting":
            supporting += 1
        dims = [d for d in (artifact.plan.dimensions or []) if d in catalog.registry["dimensions"]]
        chart.update(requirement_id=requirement, mission=mission_id, metric_ids=metrics, dimension_ids=dims,
                     query_id=query_id, relevance_role="primary" if role == "requested" else "supporting",
                     requirement_goal=goals.get(requirement) or chart.get("purpose"))
        # Derived charts already carry verified evidence references; never rewrite them.
        chart.setdefault("evidence_refs", [r for q in refs for r in evidence_by_scope.get(q, [])][:20])
        signal = next((x for x in catalog.registry.get("risk_signals", []) if x["metric"] == chart.get("metric")), None)
        if signal and artifact.plan.kind != "trend" and chart.get("chart_type") in {"bar", "horizontal_bar"}:
            # Governed threshold for the risk visual (threshold/bullet form); presentation only.
            chart["risk_threshold"] = {"value": signal["threshold"], "operator": signal["operator"],
                                       "margin": signal.get("warning_margin", 0), "label": signal["label"].lower(),
                                       "symbol": {"gt": ">", "gte": "≥", "lt": "<", "lte": "≤"}[signal["operator"]]}
        kept.append(chart)
    dashboard["charts"] = kept
    plan = dashboard.get("dashboard_plan") or {}
    plan["omitted_visuals"] = list(plan.get("omitted_visuals", [])) + [
        {"query_id": d["query_id"], "reason": d["reason"]} for d in dropped]
    plan["requested_chart_count"] = sum(c["relevance_role"] == "primary" for c in kept)
    plan["supporting_chart_count"] = sum(c["relevance_role"] == "supporting" for c in kept)
    dashboard["dashboard_plan"] = plan
    return {"version": "3.2", "mission": mission_id, "depth": depth, "supporting_chart_budget": budget,
            "admitted": len(kept), "dropped": dropped,
            "dropped_irrelevant_charts": sum(d["reason"] != "depth_budget" for d in dropped),
            "requirements": sorted({c["requirement_id"] for c in kept})}


def verify(charts, artifacts, catalog, *, mission_id=None, coverage=None):
    """Independent relevance check for the verification tab (V3.2 §62)."""
    mapping = requirement_map(coverage, artifacts)
    allowed_metrics = mission_metric_scope(catalog, mission_id)
    rows = []
    for chart in charts:
        refs = chart.get("scope_refs") or [chart.get("scope_ref")]
        metrics = list(chart.get("metrics") or [chart.get("metric")])
        problems = []
        if not mapping.get(refs[0]) or chart.get("requirement_id") != mapping.get(refs[0]):
            problems.append("requirement_mapping")
        if allowed_metrics is not None and not set(metrics) <= allowed_metrics:
            problems.append("mission_metric")
        a = artifacts.get(refs[0])
        if a and a.plan.kind == "trend" and chart.get("x_field") != "period":
            problems.append("trend_time_axis")
        if a and a.plan.ranking and chart.get("ranking_metric") not in (None, a.plan.ranking.metric):
            problems.append("ranking_criterion")
        if mission_id == "relationship" and a and a.plan.kind == "relationship" and chart.get("chart_type") != "scatter":
            problems.append("relationship_form")
        rows.append({"chart_id": chart.get("id"), "title": chart.get("title"), "passed": not problems, "problems": problems})
    return {"total": len(rows), "passed": sum(r["passed"] for r in rows), "charts": rows}
