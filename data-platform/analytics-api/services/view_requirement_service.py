"""View requirements are compiled by the resolver BEFORE any query; this module only checks that the chart layer
fulfilled them. It never judges business capability (that was decided statically) and never invents a chart:
a requirement without a view carries a concrete reason."""
import json


def _ops(coverage):
    return set(coverage.get("operation_ids", []))


def _physical(artifacts, refs, metric):
    """Population-defining identity of a metric as executed (domain aliases of one measure share it)."""
    for q in refs:
        definition = artifacts[q].grounded.metrics.get(metric) if q in artifacts else None
        if definition:
            return json.dumps([definition.get(k) for k in ('expression', 'unit', 'business_filters', 'required_non_null')],
                              sort_keys=True, default=str)
    return None


def _implements(view, chart, artifacts, op_ids):
    refs = set(chart.get("scope_refs") or [chart.get("scope_ref")])
    if not refs & op_ids:
        return False
    metrics=set(chart.get('metrics') or [chart.get('metric')])
    if view.get('metric_ids') and not set(view['metric_ids']) & metrics:
        # A requested alias whose identical physical view was merged into another requirement's chart is answered
        # by that chart (production dedup keeps ONE view and records both scope refs), never "missing".
        drawn = {_physical(artifacts, refs, m) for m in metrics} - {None}
        if not drawn or not all(_physical(artifacts, op_ids & set(artifacts), m) in drawn for m in view['metric_ids']):
            return False
    # Bind to artifacts that implement all requested axes; sharing one op is insufficient.
    relevant=[artifacts[q] for q in refs & op_ids if q in artifacts]
    if not relevant or (view.get('dimension_ids') and not any(set(view['dimension_ids']) <= set(a.plan.dimensions) for a in relevant)): return False
    kind = view["kind"]
    if kind == "paired_scatter":
        pair=chart.get('pair')
        if not (pair and op_ids <= refs and len(refs)>=2):return False
        if all(hasattr(a,'plan') for a in relevant):
            from services.insight_service import paired_observations
            ids=pair.get('query_ids') or []
            if len(ids)!=2 or set(ids)!=op_ids or any(q not in artifacts for q in ids):return False
            a,b=[artifacts[q] for q in ids];ma,mb=chart.get('metrics',[])[:2]
            if ma not in a.plan.metrics or mb not in b.plan.metrics:return False
            if a.grounded.period!=b.grounded.period or a.query.filters!=b.query.filters:return False
            if chart.get('unit')!=a.grounded.metrics[ma]['unit'] or chart.get('y_unit')!=b.grounded.metrics[mb]['unit']:return False
            key=pair.get('key') or []
            if not key or not all(set(key)<=set(x.plan.dimensions) for x in (a,b)):return False
            actual=paired_observations(a.result['rows'],b.result['rows'],key,ma,mb)
            if actual.get('status')!='ok' or any(pair.get(k)!=actual.get(k) for k in ('n','r')):return False
        return True
    if kind == "driver_delta":
        return chart.get("value_transform") == "signed_delta" and op_ids <= refs
    if kind == "time_series":
        if not any(len({str(r.get("period"))[:10] for r in a.result.get("rows",[]) if r.get("period")})>=2 for a in relevant): return False
        return chart.get("chart_type") in {"line", "area", "multi_line"} or bool(chart.get("granularity"))
    if kind in {"grouped", "ranking"}:
        return chart.get("chart_type") not in {"line", "area", "multi_line"} and not chart.get("value_transform")
    return True  # scalar: any view of that result answers it


def view_coverage(coverage, charts, artifacts, omitted=(), tables=()):
    """One item per compiled view requirement: satisfied, or missing with a specific reason."""
    omitted_reason = {o.get("query_id"): o.get("reason") for o in omitted or []}
    items = []
    for c in coverage or []:
        op_ids = _ops(c)
        for index, view in enumerate(c.get("views") or []):
            artifact_rows = [bool((artifacts.get(i) and artifacts[i].result.get("rows"))) for i in op_ids]
            capacity_reasons={'category_budget','series_budget','chart_point_budget','chart_payload_budget'}
            table_ops={t.get('query_id') for t in tables if t.get('reason')=='validated_result'
                and set(view.get('metric_ids',[]))<=set(t.get('metrics',[]))}
            table_fallback=view['kind'] in {'grouped','ranking','time_series'} and bool(op_ids) and all(
                i in table_ops and omitted_reason.get(i) in capacity_reasons and i in artifacts and artifacts[i].result.get('rows')
                and set(view.get('dimension_ids',[]))<=set(artifacts[i].plan.dimensions)
                and (view['kind']!='time_series' or len({str(r.get('period'))[:10] for r in artifacts[i].result['rows'] if r.get('period')})>=2)
                for i in op_ids)
            from services.dashboard_planner_service import pinned_by_scope
            grouped_ops = [i for i in op_ids if i in artifacts and getattr(getattr(artifacts[i], "plan", None), "dimensions", None)]
            pinned = view["kind"] in {"grouped", "ranking"} and bool(grouped_ops) and all(pinned_by_scope(artifacts[i], artifacts) for i in grouped_ops)
            if (view["kind"] == "scalar" or pinned) and artifact_rows and all(artifact_rows):
                # a scalar (or a grouping fully fixed by the scope) is answered by the verified result/KPI, not a chart
                status, reason = "satisfied", "pinned_scope_kpi" if pinned else None
            elif table_fallback:
                status,reason='satisfied','validated_table_for_capacity'
            elif (lambda eligible: bool(eligible) and all(
                    m in {x for ch in eligible for x in (ch.get('metrics') or [ch.get('metric')])} or
                    _physical(artifacts, op_ids & set(artifacts), m) in {_physical(artifacts, set(ch.get('scope_refs') or [ch.get('scope_ref')]), x)
                        for ch in eligible for x in (ch.get('metrics') or [ch.get('metric')])}
                    for m in view.get('metric_ids', [])))(
                    [ch for ch in charts if _implements(view,ch,artifacts,op_ids)]):
                status, reason = "satisfied", None
            elif not artifact_rows or not any(artifact_rows):
                status, reason = "missing", "no_rows"
            else:
                status = "missing"
                reason = next((omitted_reason[i] for i in sorted(op_ids) if omitted_reason.get(i)), "no_chart_for_view")
            items.append({"requirement_id": c["requirement_id"], "index": index, "kind": view["kind"],
                          "required": bool(view.get("required", True)), "status": status, "reason": reason})
    return items


# ------------------------------------------------------------------- FINAL P3: analytical breadth (independent of correctness)
# Typed reasons → honest category. A shortfall is never relabelled: data limits ≠ catalog/source limits ≠ capacity ≠
# an implementation gap. PLANNING_GAP (and an unexplained shortfall) blocks a "complete" claim.
SOURCE_LIMIT = {"no_time_axis", "missing_metric_component", "incompatible_dimension", "pinned_axis", "requested_axis",
                "non_additive_total", "no_eligible_axis", "singleton_axis", "insufficient_periods_planned", "signed_measure",
                "duplicate_meaning", "insufficient_groups"}
MISSION_LIMIT = {"mission_grammar"}
DATA_LIMIT = {"no_rows", "singleton", "insufficient_periods", "insufficient_groups", "zero_denominator", "constant_observations",
              "empty_result", "null_or_invalid_numeric", "requires_paired_observations", "invalid_part_to_whole",
              "invalid_composition_total"}
CAPACITY_LIMIT = {"cost_budget", "chart_budget", "chart_point_budget", "category_budget", "series_budget", "chart_payload_budget"}
EXECUTION = {"source_unavailable", "execution_failed"}
GAP_ORDER = ("PLANNING_GAP", "SOURCE_UNAVAILABLE", "CAPACITY_LIMITED", "LIMITED_BY_MISSION", "LIMITED_DATA", "LIMITED_BY_SOURCE_CAPABILITY")
ROLES = ("core", "diagnostic", "extended")


IMPLEMENTATION = {"capability_blocked", "unsupported_join", "incompatible_population", "renderer_unsupported", "duplicate_category"}


def gap_kind(reason, planned):
    # One observed group is a fact about the data in scope (I12), not a mission or source limit.
    if reason in {"singleton", "insufficient_periods", "no_rows", "empty_result"}:
        return "LIMITED_DATA"
    if reason in MISSION_LIMIT:
        return "LIMITED_BY_MISSION"
    if not planned:
        # Pre-SQL planner decisions are read from governed metadata (axes, history, components, cardinality): a
        # shortfall there is a source/catalog capability limit unless the compiler refused a metadata-approved lens.
        return ("CAPACITY_LIMITED" if reason in CAPACITY_LIMIT else "PLANNING_GAP" if reason in IMPLEMENTATION
                else "LIMITED_BY_SOURCE_CAPABILITY")
    if reason in DATA_LIMIT:
        return "LIMITED_DATA"
    if reason in CAPACITY_LIMIT:
        return "CAPACITY_LIMITED"
    if reason in EXECUTION:
        return "SOURCE_UNAVAILABLE"
    if reason in SOURCE_LIMIT and not planned:
        return "LIMITED_BY_SOURCE_CAPABILITY"
    return "PLANNING_GAP"


def analysis_coverage(coverage, charts, omitted, targets, *, lens_decisions=(), depth=None, origin=None, family=None,
                      policy_version=None, forecasts=()):
    """Breadth of a lens-governed report from the server plan + the charts actually rendered.

    ``None`` for legacy plans (no lens coverage): those reports are marked not-evaluated, never a 0-chart failure.
    Requested views (and forecast panels, one view each) count toward the core role, so a question that already asks
    for several views is not padded further.
    """
    lenses = {}
    for entry in coverage or []:
        for lens in entry.get("lenses") or []:
            lenses.setdefault(lens["id"], lens)
    if not lenses and not any(d.get("status") == "rejected" for d in lens_decisions or []) or not targets:
        return None
    rendered_ids = {}
    for chart in charts:
        if chart.get("analysis_lens_id") in lenses:
            rendered_ids.setdefault(chart["analysis_lens_id"], chart.get("id"))
    requested_views = sum(1 for c in charts if not c.get("analysis_lens_id") and c.get("relevance_role", "primary") == "primary") + len(forecasts or [])
    rows, reasons = [], []
    for lens in sorted(lenses.values(), key=lambda l: tuple(l.get("rank") or (9, 9))):
        if lens["id"] in rendered_ids:
            rows.append(dict(id=lens["id"], role=lens["role"], kind=lens["kind"], question=lens.get("question"), status="rendered",
                             reason=None, chart_id=rendered_ids[lens["id"]]))
            continue
        if lens.get("reserve"):
            rows.append(dict(id=lens["id"], role=lens["role"], kind=lens["kind"], question=lens.get("question"), status="reserve_unused",
                             reason=None, chart_id=None))
            continue
        reason = next((o.get("reason") for o in omitted or [] if o.get("lens_id") == lens["id"] and o.get("reason")), None) or "renderer_unsupported"
        rows.append(dict(id=lens["id"], role=lens["role"], kind=lens["kind"], question=lens.get("question"), status="rejected",
                         reason=reason, chart_id=None))
        reasons.append(gap_kind(reason, planned=True))
    for d in lens_decisions or []:
        if d.get("status") == "rejected" and d.get("kind") not in {"axis", "quota"} and d.get("lens_id") not in lenses:
            reasons.append(gap_kind(d.get("reason"), planned=bool(d.get("lens_id"))))
    rendered = {r: sum(1 for x in rows if x["role"] == r and x["status"] == "rendered") for r in ROLES}
    rendered["core"] += requested_views
    counted = {r: min(rendered[r], targets.get(r, 0)) for r in ROLES}
    target_total = sum(targets.get(r, 0) for r in ROLES)
    shortfall = {r: targets.get(r, 0) - counted[r] for r in ROLES if counted[r] < targets.get(r, 0)}
    short_plans = [d for d in lens_decisions or [] if d.get("kind") == "quota" and d.get("status") == "short"]
    if shortfall and not reasons:
        planner_reasons = [d.get("reason") for d in lens_decisions or [] if d.get("status") == "rejected" and d.get("kind") != "quota"]
        reasons = [gap_kind(r, planned=False) for r in planner_reasons] or (["LIMITED_BY_SOURCE_CAPABILITY"] if short_plans else ["PLANNING_GAP"])
    kind = next((k for k in GAP_ORDER if k in reasons), None) if shortfall else None
    status = "complete" if not shortfall else "partial" if kind in {"PLANNING_GAP", "SOURCE_UNAVAILABLE"} else "limited"
    shown = sum(counted.values())
    words = {"LIMITED_DATA": "dữ liệu trong phạm vi không đủ (ví dụ chỉ có một nhóm hoặc một kỳ)", "LIMITED_BY_SOURCE_CAPABILITY": "nguồn chưa có thông tin",
             "CAPACITY_LIMITED": "vượt ngân sách truy vấn", "SOURCE_UNAVAILABLE": "nguồn lỗi khi chạy",
             "PLANNING_GAP": "hệ thống chưa lập được góc nhìn", "LIMITED_BY_MISSION": "nhiệm vụ đã chọn giới hạn loại góc nhìn"}
    causes = [k for k in GAP_ORDER if k in reasons][:2] if shortfall else []
    summary = (f"Số liệu đã kiểm chứng · {shown}/{target_total} góc nhìn" +
               (f"; còn thiếu {target_total - shown} do {' và '.join(words[k] for k in causes)}" if causes else ""))
    return dict(version="4.0.0", policy_version=policy_version, effective_depth=depth, selection_origin=origin, family=family,
                targets={r: targets.get(r, 0) for r in ROLES}, target_total=target_total, rendered=rendered,
                counted=counted, rendered_total=shown, requested_views=requested_views, status=status, gap_kind=kind,
                shortfall=shortfall, lenses=rows, summary=summary)
