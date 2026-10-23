"""V3.2 Mission evidence contract: a chart is shown only when it answers part of
the user's analytical question (or a governed supporting requirement of it).

Deterministic and value-preserving: it never alters a number. It annotates
every admitted chart with its requirement mapping, drops charts with no
mapping or outside the mission's governed evidence (e.g. product revenue in
Risk Watch), and applies the depth budget to SUPPORTING charts only.
"""

# Legacy plans (no lens coverage) keep the historical supporting budget; lens-governed plans are bounded by the lens
# policy instead (core/diagnostic/extended view targets), never by this number.
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


def _form(chart):
    from services.workspace_service import FORM_OF
    return FORM_OF.get(chart.get("chart_type"), "table")


def grammar_decisions(charts, artifacts, mission, mapping):
    """V3.2 §45 mission chart grammar: {chart index: reason} for charts to drop.

    - the same view (type + query + axes) is never shown twice;
    - a primary chart outside the mission's forms is dropped only while an
      in-grammar primary chart remains (never leave the question unanswered);
    - supporting charts must use the mission's supporting forms, one per form.
    """
    drop, seen, per_form = {}, set(), {}
    forms = set(mission.get("chart_forms", [])) | {"kpi", "table"}
    supporting_forms = set(mission.get("supporting_forms") or mission.get("chart_forms", [])) | {"table"}
    cap = mission.get("max_supporting_per_form", 1)
    primaries = [i for i, c in enumerate(charts) if getattr(getattr(artifacts.get((c.get("scope_refs") or [c.get("scope_ref")])[0]), "query", None), "role", "requested") == "requested"]
    in_grammar = [i for i in primaries if _form(charts[i]) in forms]
    for i, chart in enumerate(charts):
        ref = (chart.get("scope_refs") or [chart.get("scope_ref")])[0]
        artifact = artifacts.get(ref)
        key = (chart.get("chart_type"), ref, tuple(sorted(artifact.plan.dimensions or [])) if artifact else ())
        if key in seen:
            drop[i] = "duplicate_view"
            continue
        seen.add(key)
        if not artifact or not mapping.get(ref):
            continue
        form = _form(chart)
        grouped_bar=bool(artifact and artifact.plan.kind=='aggregate' and artifact.plan.dimensions
                         and chart.get('chart_type') in {'bar','horizontal_bar'} and not chart.get('value_transform'))
        if i in primaries:
            # A large categorical aggregate renders horizontally for legibility.
            # Orientation does not turn its compiled grouped role into ranking.
            # A multi-goal comparison can explicitly request a temporal series.
            # Promote the mission's already-admitted temporal form only when
            # the compiled operation and actual time axis agree. Mission labels
            # must not remove an independently required, mapped trend.
            requested_trend=bool(artifact.plan.kind=='trend' and form=='line'
                                 and form in supporting_forms and chart.get('x_field')=='period')
            if form not in forms and in_grammar and not grouped_bar and not requested_trend:
                drop[i] = "outside_mission_grammar"
        elif form not in supporting_forms and not (grouped_bar and 'grouped_bar' in supporting_forms):
            drop[i] = "outside_mission_grammar"
        elif form != "table" and not chart.get("analysis_lens_id"):
            per_form[form] = per_form.get(form, 0) + 1
            if per_form[form] > cap:
                drop[i] = "outside_mission_grammar"
    return drop


def apply(dashboard, artifacts, catalog, *, mission_id=None, depth="deep", coverage=None, intent=None, evidence=()):
    """Gate and annotate dashboard charts in place. Returns a summary dict."""
    mapping = requirement_map(coverage, artifacts)
    allowed_metrics = mission_metric_scope(catalog, mission_id)
    evidence_by_scope = {}
    for e in evidence:
        evidence_by_scope.setdefault(e.get("scope_ref"), []).append(e.get("id"))
    kept, dropped, supporting = [], [], 0
    lens_governed = any(c.get("lenses") for c in coverage or [])
    budget = SUPPORTING_CHART_BUDGET.get(depth or "deep", 3)
    mission = next((m for m in catalog.registry.get("analysis_missions", []) if m["id"] == mission_id), None)
    grammar = grammar_decisions(dashboard.get("charts", []), artifacts, mission, mapping) if mission and mission_id != "risk_watch" else {}
    for index, chart in enumerate(dashboard.get("charts", [])):
        refs = chart.get("scope_refs") or [chart.get("scope_ref")]
        query_id = refs[0]
        artifact = artifacts.get(query_id)
        requirement = mapping.get(query_id)
        role = getattr(artifact.query, "role", "requested") if artifact else None
        metrics = list(chart.get("metrics") or [chart.get("metric")])
        reason = grammar.get(index)
        if reason:
            pass
        elif not artifact or not requirement:
            reason = "no_requirement_mapping"
        elif allowed_metrics is not None and not set(metrics) <= allowed_metrics:
            reason = "outside_mission_evidence"
        elif role == "supporting" and lens_governed and not chart.get("analysis_lens_id"):
            reason = "no_lens_binding"
        elif role == "supporting" and not lens_governed and supporting >= budget:
            reason = "depth_budget"
        if reason:
            dropped.append({"chart_id": chart.get("id"), "title": chart.get("title"), "reason": reason, "query_id": query_id})
            continue
        if role == "supporting":
            supporting += 1
        dims = [d for d in (artifact.plan.dimensions or []) if d in catalog.registry["dimensions"]]
        chart.update(requirement_id=requirement, mission=mission_id, metric_ids=metrics, dimension_ids=dims,
                     query_id=query_id, relevance_role="primary" if role == "requested" else "supporting",
                     requirement_goal=chart.get("analysis_lens_question") or chart.get("title") or chart.get("purpose"))
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
    live = {r for c in kept for r in (c.get("scope_refs") or [c.get("scope_ref")])}
    if dashboard.get("kpi_cards") is not None and kept:
        # A KPI whose view was gated out would reintroduce irrelevant evidence; one card per meaning.
        gone = {d["query_id"] for d in dropped} - live
        seen_labels, cards = set(), []
        for card in dashboard["kpi_cards"]:
            if card.get("scope_ref") in gone or card.get("label") in seen_labels:
                continue
            seen_labels.add(card.get("label"))
            cards.append(card)
        dashboard["kpi_cards"] = cards
    plan = dashboard.get("dashboard_plan") or {}
    plan["omitted_visuals"] = list(plan.get("omitted_visuals", [])) + [
        {"query_id": d["query_id"], "reason": d["reason"]} for d in dropped]
    plan["requested_chart_count"] = sum(c["relevance_role"] == "primary" for c in kept)
    plan["supporting_chart_count"] = sum(c["relevance_role"] == "supporting" for c in kept)
    dashboard["dashboard_plan"] = plan
    return {"version": "4.0" if lens_governed else "3.2", "mission": mission_id, "depth": depth, "supporting_chart_budget": budget,
            "admitted": len(kept), "dropped": dropped,
            "dropped_irrelevant_charts": sum(d["reason"] not in {"depth_budget", "duplicate_view"} for d in dropped),
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
