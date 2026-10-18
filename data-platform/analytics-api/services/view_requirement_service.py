"""View requirements are compiled by the resolver BEFORE any query; this module only checks that the chart layer
fulfilled them. It never judges business capability (that was decided statically) and never invents a chart:
a requirement without a view carries a concrete reason."""


def _ops(coverage):
    return set(coverage.get("operation_ids", []))


def _implements(view, chart, artifacts, op_ids):
    refs = set(chart.get("scope_refs") or [chart.get("scope_ref")])
    if not refs & op_ids:
        return False
    metrics=set(chart.get('metrics') or [chart.get('metric')])
    if view.get('metric_ids') and not set(view['metric_ids']) & metrics: return False
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
            if view["kind"] == "scalar" and artifact_rows and all(artifact_rows):
                status, reason = "satisfied", None  # a scalar is answered by the verified result/KPI, a chart is not required
            elif table_fallback:
                status,reason='satisfied','validated_table_for_capacity'
            elif (lambda eligible: bool(eligible) and set(view.get('metric_ids',[])) <=
                  {m for ch in eligible for m in (ch.get('metrics') or [ch.get('metric')])})(
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
