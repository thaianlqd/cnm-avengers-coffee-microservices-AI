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
                 "not_applicable": "Không áp dụng cho phạm vi", "execution_error": "Lỗi tính toán"}
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


def _execute(catalog, subject, metrics, filters, scope, dimensions, executor, reference,granularity=None):
    kind='trend' if granularity else 'aggregate'
    spec = AnalysisSpec(analysis_kind=kind, subject=subject, time_range=scope,granularity=granularity or 'day',
                        components=[Component(id="risk", kind=kind, subject=subject, metrics=metrics,
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


def evaluate(catalog, analysis_scope=None, period=None, breakdown="store", executor=None, reference=None, lookup=None, signal_ids=None):
    """Evaluate the selected (default: every) governed risk signal for the scope/period. Zero provider calls."""
    if executor is None:
        from services.sql_service import execute_read_only
        executor = execute_read_only
    started = time.perf_counter()
    r = catalog.registry
    filters = scope_filters(catalog, analysis_scope, lookup)
    scope = period or TimeScope(mode="all_time", timezone=r["timezone"])
    signals, queries = [], 0
    anomaly_budget=[2]
    governed = r.get("risk_signals", [])
    if signal_ids is not None:
        unknown = sorted(set(signal_ids) - {s["id"] for s in governed})
        if unknown or not signal_ids:
            # A wrong or empty selection is an error, never a silent fallback to every signal.
            raise AnalysisError("risk_signal_unknown", "Unknown or empty risk signal selection")
        governed = [s for s in governed if s["id"] in set(signal_ids)]
    for s in governed:
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
            queries += 1
            rows, resolved = _execute(catalog, subject, metrics, filters, window, [], executor, reference)
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
                queries += 1
                groups, _ = _execute(catalog, subject, metrics, filters, window, [breakdown], executor, reference)
                rated = []; evaluable=missing=insufficient=0
                for row in groups:
                    v = row.get(s["metric"])
                    if v is None:
                        missing+=1
                        continue
                    if obs in metrics and (row.get(obs) or 0) < s.get("minimum_observations", 1):
                        insufficient+=1
                        continue
                    evaluable+=1
                    state = classify(float(v), s)
                    if state == "red":
                        rated.append({"group": row.get(breakdown), "value": float(v)})
                reverse = s["operator"] in {"gt", "gte"}
                rated.sort(key=lambda g: g["value"], reverse=reverse)
                out["breakdown"] = {"dimension": breakdown, "dimension_label": r["dimensions"][breakdown]["business_name"],
                                    "groups_total": len(groups), "groups_evaluable":evaluable,"groups_missing":missing,"groups_insufficient_sample":insufficient,"groups_in_breach": len(rated), "worst": rated[:BREAKDOWN_LIMIT],
                                    "note": "Nhóm có ít quan sát có thể dao động mạnh; đối chiếu số lượng trước khi kết luận."}
                if rated and status == "green":
                    out["note"] = f"Toàn phạm vi trong ngưỡng nhưng {len(rated)} {r['dimensions'][breakdown]['business_name'].lower()} vượt ngưỡng."
        except AnalysisError as error:
            if error.category in {"privacy", "security"}:
                raise
            # A failed computation is its own typed state: never no_data, never green.
            out.update(status="execution_error", note="Không tính được chỉ số này (lỗi truy vấn); không coi là trong ngưỡng.")
        out["bad_direction"] = "below" if s["operator"] in {"lt","lte"} else "above"
        out['anomaly']=evaluate_anomaly(catalog,s,filters,window,executor,reference,anomaly_budget)
        out["status_label"] = STATUS_LABELS[out["status"]]
        signals.append(out)
    for s in signals:
        s.setdefault("status_label", STATUS_LABELS[s["status"]])
    counts = {k: sum(s["status"] == k for s in signals) for k in STATUS_LABELS}
    from services.analysis_catalog import resolve_period
    scope_labels=[r['dimensions'][f.dimension]['business_name']+': '+', '.join(
        str(r['dimensions'][f.dimension].get('value_labels',{}).get(v,v)) for v in (f.value if isinstance(f.value,list) else [f.value])) for f in filters]
    return {"status": "success", "version": "3.1.0", "mission": "risk_watch", "signals": signals, "counts": counts,
            "scope": [f.model_dump(mode="json") for f in filters], "time": scope.model_dump(mode="json"),
            "scope_label":'; '.join(scope_labels) or 'Toàn hệ thống', "resolved_time":resolve_period(scope,reference),
            "composite_score": None, "threshold_policy": r.get("workspace", {}).get("threshold_policy"),
            "provider_calls": 0, "sql_queries": queries+(2-anomaly_budget[0]),
            'anomaly_sql_queries':2-anomaly_budget[0],
            "elapsed_ms": round((time.perf_counter() - started) * 1000, 2)}


def robust_anomaly(rows,metric,config,*,source_health,observed_day,exposure=None):
    """One fixed median/MAD baseline, complete buckets only, no imputation."""
    from datetime import date,timedelta
    from statistics import median
    import math
    result={'signal_version':config.get('version'),'method':'median_mad_iqr','metric_id':metric,
        'baseline_window':config.get('baseline_buckets'),'n':0,'observed_period':observed_day.isoformat(),
        'status':'not_measured','source_health':source_health.get('status','unknown'),
        'excluded_periods':[],'parameters':{k:config.get(k) for k in ('cadence','minimum_history','baseline_buckets','threshold_z','direction','minimum_exposure')}}
    if (source_health.get('status')!='healthy' or source_health.get('completeness')!='complete'
            or not source_health.get('certificate')):
        return {**result,'status':'unknown_source','reason':'complete_source_history_not_certified'}
    minimum,width=config.get('minimum_history'),config.get('baseline_buckets')
    if (config.get('cadence')!='day' or type(minimum) is not int or minimum<28
            or type(width) is not int or not minimum<=width<=90 or config.get('direction') not in {'above','below'}
            or not isinstance(config.get('threshold_z'),(int,float)) or not 2<=config['threshold_z']<=6):
        return {**result,'status':'not_applicable','reason':'unsupported_baseline_contract'}
    by_day={}
    for row in rows:
        try:day=date.fromisoformat(str(row.get('period'))[:10])
        except ValueError:return {**result,'status':'invalid_history','reason':'invalid_bucket'}
        value=row.get(metric)
        if day in by_day or isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value):
            return {**result,'status':'invalid_history','reason':'duplicate_or_invalid_observation'}
        if day>observed_day:
            result['excluded_periods'].append(day.isoformat());continue
        if exposure and (not isinstance(row.get(exposure),(float,int)) or row[exposure]<config.get('minimum_exposure',1)):
            return {**result,'status':'insufficient_sample','reason':'exposure_below_minimum'}
        by_day[day]=float(value)
    baseline_days=[observed_day-timedelta(days=i) for i in range(width,0,-1)]
    if observed_day not in by_day or any(day not in by_day for day in baseline_days):
        return {**result,'status':'insufficient_sample','reason':'complete_daily_buckets_missing',
                'n':sum(day in by_day for day in baseline_days)}
    baseline=[by_day[day] for day in baseline_days]
    center=median(baseline);mad=median(abs(v-center) for v in baseline)
    scale=1.4826*mad
    scale_method='mad'
    if not scale:
        ordered=sorted(baseline)
        q1,q3=median(ordered[:len(ordered)//2]),median(ordered[(len(ordered)+1)//2:])
        scale=(q3-q1)/1.349;scale_method='iqr'
    result.update(n=len(baseline),observed=by_day[observed_day],expected=center,
        baseline_start=baseline_days[0].isoformat(),baseline_end=baseline_days[-1].isoformat(),scale_method=scale_method)
    if not scale:return {**result,'status':'not_applicable','reason':'zero_robust_scale'}
    deviation=(by_day[observed_day]-center)/scale
    threshold=config['threshold_z']
    flagged=deviation>threshold if config['direction']=='above' else deviation < -threshold
    result.update(status='anomaly' if flagged else 'within_baseline',deviation_z=round(deviation,4),
        bounds={'lower':center-threshold*scale,'upper':center+threshold*scale},
        reason='robust_deviation_above_threshold' if flagged else 'robust_deviation_within_threshold')
    return result


def evaluate_anomaly(catalog,signal,filters,scope,executor,reference,budget):
    from datetime import date,datetime,timedelta
    from zoneinfo import ZoneInfo
    from services.data_coverage_service import peek
    from services.analysis_catalog import resolve_period
    metric=catalog.registry['metrics'][signal['metric']]
    config=signal.get('anomaly') or {}
    base={'signal_id':signal['id'],'signal_version':config.get('version'),'metric_id':signal['metric'],
        'status':'not_applicable','reason':'baseline_not_enabled','sql_queries':0}
    if not config.get('enabled') or not metric.get('time_column'):return base
    health=((peek() or {}).get('data_health') or {}).get('views',{}).get(metric['source'],{})
    if health.get('status')!='healthy' or health.get('completeness')!='complete' or not health.get('certificate'):
        return {**base,'status':'unknown_source','reason':'complete_source_history_not_certified'}
    if metric.get('aggregation_semantics') in {'ratio','average'} and not config.get('exposure_metric'):
        return {**base,'reason':'exposure_contract_required'}
    if budget[0]<=0:return {**base,'status':'not_measured','reason':'baseline_query_budget_exhausted'}
    reference=reference or datetime.now(ZoneInfo(catalog.registry['timezone'])).date()
    resolved=resolve_period(scope,reference)
    observed=min(reference-timedelta(days=1),date.fromisoformat(resolved['end']) if resolved.get('end') else reference-timedelta(days=1))
    width=config.get('baseline_buckets',28)
    if type(width) is not int or not 28<=width<=90:return {**base,'reason':'unsupported_baseline_contract'}
    window=TimeScope(mode='custom',start=observed-timedelta(days=width),end=observed,timezone=catalog.registry['timezone'])
    metrics=[signal['metric']]+([config['exposure_metric']] if config.get('exposure_metric') else [])
    budget[0]-=1
    try:
        rows,_=_execute(catalog,metric['subjects'][0],metrics,filters,window,[],executor,reference,granularity='day')
        result=robust_anomaly(rows,signal['metric'],config,source_health=health,observed_day=observed,exposure=config.get('exposure_metric'))
        from services.access_policy import digest
        result.update(signal_id=signal['id'],sql_queries=1,scope=[f.model_dump(mode='json') for f in filters],
            evidence_id='anomaly_'+digest([signal['id'],rows,result['parameters']])[:24])
        return result
    except Exception:
        return {**base,'status':'execution_error','reason':'baseline_query_unavailable','sql_queries':1}
