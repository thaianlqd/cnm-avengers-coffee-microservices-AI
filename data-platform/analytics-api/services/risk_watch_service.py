"""Risk Watch (V3.1): governed metrics compared with governed default thresholds.

No composite score and no model involvement: each signal is one canonical
metric, one threshold and one bad direction. Values come from the standard
path ground -> build_plans -> compile_sql -> validate_sql -> READ ONLY
execution -> validate_results. The server computes the traffic-light status;
the UI only renders it.
"""
import time

from services.analysis_catalog import AnalysisError
from services.analysis_contract import AnalysisSpec, Component, Filter, TimeScope
from services.analysis_query import build_plans, compile_sql, validate_plan, validate_results, validate_sql

STATUS_LABELS = {"red": "Vượt ngưỡng", "yellow": "Gần ngưỡng", "green": "Trong ngưỡng",
                 "no_data": "Không có dữ liệu", "insufficient_sample": "Chưa đủ quan sát",
                 "not_applicable": "Không áp dụng cho phạm vi"}
BREAKDOWN_LIMIT = 10


def classify(value, signal):
    """Server-side traffic light. Margin is on the safe side of the threshold."""
    if value is None:
        return "no_data"
    t, margin, op = signal["threshold"], signal.get("warning_margin", 0) or 0, signal["operator"]
    breach = {"gt": value > t, "gte": value >= t, "lt": value < t, "lte": value <= t}[op]
    if breach:
        return "red"
    near = value >= t - margin if op in {"gt", "gte"} else value <= t + margin
    return "yellow" if margin and near else "green"


def scope_filters(catalog, analysis_scope, lookup=None):
    """Validated UI scope only (scope-selectable dimensions, known values)."""
    from services.value_grounding_service import dimension_values
    r = catalog.registry
    out = []
    if not analysis_scope or analysis_scope.get("mode") != "selected":
        return out
    for f in analysis_scope.get("filters") or []:
        d = r["dimensions"].get(f.get("dimension"))
        if not d or not d.get("scope_selectable"):
            raise AnalysisError("query_scope", "Scope dimension is not selectable")
        values = f["value"] if isinstance(f.get("value"), list) else [f.get("value")]
        known = dimension_values(catalog, f["dimension"])
        for v in values:
            if known and v in known:
                continue
            if lookup and v in lookup(d["table"], d["column"], str(v), limit=8):
                continue
            raise AnalysisError("filter_value_unknown", "Unknown scope value")
        out.append(Filter(dimension=f["dimension"], operator="in", value=values))
    return out


def _execute(catalog, subject, metrics, filters, scope, dimensions, executor, reference):
    spec = AnalysisSpec(analysis_kind="aggregate", subject=subject, time_range=scope,
                        components=[Component(id="risk", kind="aggregate", subject=subject, metrics=metrics,
                                              dimensions=dimensions, filters=filters)])
    grounded = catalog.ground(spec, reference)
    plan = build_plans(grounded, catalog)[0]
    if not validate_plan(plan, grounded, catalog).valid:
        raise AnalysisError("plan", "Risk plan rejected")
    sql = compile_sql(plan, grounded, catalog)
    if not validate_sql(sql, plan, grounded, catalog).valid:
        raise AnalysisError("security", "Risk SQL rejected")
    result = executor(sql, row_limit=plan.row_limit + 1)
    verdict = validate_results(result, plan, grounded, catalog)
    if not verdict.valid:
        raise AnalysisError("result_contract", "Risk result rejected")
    return result["rows"], grounded.period


def evaluate(catalog, analysis_scope=None, period=None, breakdown="store", executor=None, reference=None, lookup=None):
    """Evaluate every governed risk signal for the scope/period. Zero provider calls."""
    if executor is None:
        from services.sql_service import execute_read_only
        executor = execute_read_only
    started = time.perf_counter()
    r = catalog.registry
    filters = scope_filters(catalog, analysis_scope, lookup)
    scope = period or TimeScope(mode="all_time", timezone=r["timezone"])
    signals, queries = [], 0
    for s in r.get("risk_signals", []):
        m = r["metrics"][s["metric"]]
        out = {"id": s["id"], "label": s["label"], "metric": s["metric"], "metric_label": m["business_name"],
               "unit": m["unit"], "operator": s["operator"],
               "operator_symbol": {"gt": ">", "gte": "≥", "lt": "<", "lte": "≤"}[s["operator"]],
               "threshold": s["threshold"], "warning_margin": s.get("warning_margin", 0),
               "threshold_kind": "system_default", "definition": m.get("business_definition") or m.get("business_meaning"),
               "historical": bool(m.get("time_column")), "value": None, "observations": None, "breakdown": None, "note": None}
        compatible = set(catalog.compatible_dimensions(s["metric"]))
        if any(f.dimension not in compatible for f in filters):
            out.update(status="not_applicable", note="Phạm vi đã chọn không áp dụng được cho chỉ số này.")
            signals.append(out)
            continue
        metrics = [s["metric"]]
        obs = s.get("observation_metric")
        if obs and r["metrics"][obs]["source"] == m["source"] and set(r["metrics"][obs]["subjects"]) & set(m["subjects"]):
            metrics.append(obs)
        window = scope if m.get("time_column") else TimeScope(mode="all_time", timezone=r["timezone"])
        if not m.get("time_column"):
            out["note"] = "Chỉ số hiện trạng (ảnh chụp tồn kho); không áp dụng khoảng thời gian."
        subject = m["subjects"][0]
        try:
            rows, resolved = _execute(catalog, subject, metrics, filters, window, [], executor, reference)
            queries += 1
            value = rows[0].get(s["metric"]) if rows else None
            value = None if value is None else float(value)
            out["value"] = value
            out["period"] = {"start": resolved.get("start"), "end": resolved.get("end")}
            status = classify(value, s)
            if obs and obs in metrics:
                count = rows[0].get(obs) if rows else None
                out["observations"] = None if count is None else int(count)
                if status != "no_data" and (count or 0) < s.get("minimum_observations", 1):
                    status = "insufficient_sample"
            out["status"] = status
            # Always inspect groups: a healthy total can hide breaching groups.
            if breakdown and breakdown in compatible and status not in {"no_data", "insufficient_sample"}:
                groups, _ = _execute(catalog, subject, metrics, filters, window, [breakdown], executor, reference)
                queries += 1
                rated = []
                for row in groups:
                    v = row.get(s["metric"])
                    if v is None:
                        continue
                    if obs in metrics and (row.get(obs) or 0) < s.get("minimum_observations", 1):
                        continue
                    state = classify(float(v), s)
                    if state == "red":
                        rated.append({"group": row.get(breakdown), "value": float(v)})
                reverse = s["operator"] in {"gt", "gte"}
                rated.sort(key=lambda g: g["value"], reverse=reverse)
                out["breakdown"] = {"dimension": breakdown, "dimension_label": r["dimensions"][breakdown]["business_name"],
                                    "groups_total": len(groups), "groups_in_breach": len(rated), "worst": rated[:BREAKDOWN_LIMIT],
                                    "note": "Nhóm có ít quan sát có thể dao động mạnh; đối chiếu số lượng trước khi kết luận."}
                if rated and status == "green":
                    out["note"] = f"Toàn phạm vi trong ngưỡng nhưng {len(rated)} {r['dimensions'][breakdown]['business_name'].lower()} vượt ngưỡng."
        except AnalysisError as error:
            if error.category in {"privacy", "security"}:
                raise
            out.update(status="no_data", note="Chưa tính được chỉ số này trong phạm vi đã chọn.")
        out["status_label"] = STATUS_LABELS[out["status"]]
        signals.append(out)
    for s in signals:
        s.setdefault("status_label", STATUS_LABELS[s["status"]])
    counts = {k: sum(s["status"] == k for s in signals) for k in STATUS_LABELS}
    return {"status": "success", "version": "3.1.0", "mission": "risk_watch", "signals": signals, "counts": counts,
            "scope": [f.model_dump(mode="json") for f in filters], "time": scope.model_dump(mode="json"),
            "composite_score": None, "threshold_policy": r.get("workspace", {}).get("threshold_policy"),
            "provider_calls": 0, "sql_queries": queries, "elapsed_ms": round((time.perf_counter() - started) * 1000, 2)}
