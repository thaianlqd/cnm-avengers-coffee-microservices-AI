"""Deterministic server-side forecasting over a verified historical series.

The model only states the request (metric, cadence, horizon). Every number here
comes from the executed, validated history. Candidate methods are deliberately
simple and dependency-free; the one used is chosen by rolling-origin backtest
and is reported next to the naive baseline so accuracy claims stay evidenced.
"""
import math
import hashlib
import json
from datetime import date, datetime, timedelta

from services.analysis_catalog import AnalysisError

VERSION = "3.4.0"
CADENCE_DAYS = {"day": 1, "week": 7}
SEASON = {"day": 7, "week": 52, "month": 12, "quarter": 4, "year": 1}
LEVELS = (0.1, 0.3, 0.5, 0.7, 0.9)
Z80 = 1.2816  # Two-sided 80% normal interval on backtest residual scale.


def forecast_spec(catalog, metric_id):
    """Governed forecast capability of a metric, or None."""
    spec = catalog.registry["metrics"].get(metric_id, {}).get("forecast")
    return spec if spec and spec.get("forecastable") else None


def validate_request(catalog, metric_id, unit, horizon):
    """Fail fast before any provider repair or SQL. Returns the governed spec."""
    spec = forecast_spec(catalog, metric_id)
    if not spec:
        raise AnalysisError("forecast_unsupported", "Metric is not declared forecastable")
    if unit not in spec["cadences"]:
        raise AnalysisError("forecast_unsupported", "Cadence is not supported for this forecast")
    maximum = spec["max_horizon"][unit]
    if type(horizon) is not int or not 1 <= horizon <= maximum:
        error = AnalysisError("forecast_horizon_invalid", "Forecast horizon outside governed bound")
        error.max_horizon, error.unit = maximum, unit
        raise error
    return spec


def _period(value):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return datetime.fromisoformat(str(value)[:19]).date()


def _next(period, unit, step=1):
    if unit in CADENCE_DAYS:
        return period + timedelta(days=CADENCE_DAYS[unit] * step)
    months = {"month": 1, "quarter": 3, "year": 12}[unit] * step
    index = period.year * 12 + period.month - 1 + months
    return date(index // 12, index % 12 + 1, 1)


def _bucket_end(period, unit):
    return _next(period, unit) - timedelta(days=1)


def _bound(value):
    return date.fromisoformat(str(value)[:10]) if value else None


def complete_series(rows, metric, unit, policy="zero_fill", reference=None, window=None):
    """Ordered, gap-completed (period, value) series from validated trend rows.

    Only complete periods count: a bucket clipped by the approved time window
    (its start, e.g. rolling "6 tháng" from the 16th) or still accumulating at
    ``reference`` (today) would bias the projection downward. Complete trailing
    periods without rows are zeros only with an explicit completeness certificate.
    Observed MIN/MAX alone does not prove a stale trailing bucket is zero.
    """
    window = window or {}
    start, end = _bound(window.get("start")), _bound(window.get("end"))
    if reference is not None:
        end = min(end, reference - timedelta(days=1)) if end else reference - timedelta(days=1)
    points = {}
    for row in rows:
        value = row.get(metric)
        if row.get("period") is None:
            raise AnalysisError("forecast_execution", "Trend row without period")
        if value is not None and (not isinstance(value, (int, float)) or not math.isfinite(value)):
            raise AnalysisError("forecast_execution", "Non-finite historical value")
        points[_period(row["period"])] = value
    points = {p: v for p, v in points.items()
              if (start is None or p >= start) and (end is None or _bucket_end(p, unit) <= end)}
    if not points:
        return []
    series, current, last = [], min(points), max(points)
    if end is not None and window.get("completeness") == "complete":
        while _bucket_end(_next(last, unit), unit) <= end:
            last = _next(last, unit)
    while current <= last:
        value = points.get(current)
        if value is None:
            if policy != "zero_fill":
                raise AnalysisError("forecast_insufficient_history", "Missing periods in history")
            value = 0.0
        series.append((current, float(value)))
        current = _next(current, unit)
    return series


def _ses(values, alpha):
    level = values[0]
    for v in values[1:]:
        level = alpha * v + (1 - alpha) * level
    return lambda h: level


def _holt(values, alpha, beta):
    level, trend = values[0], values[1] - values[0]
    for v in values[1:]:
        previous = level
        level = alpha * v + (1 - alpha) * (level + trend)
        trend = beta * (level - previous) + (1 - beta) * trend
    return lambda h: level + h * trend


def candidate_methods(unit, n):
    season = SEASON[unit]
    methods = {"naive": lambda values: (lambda h: values[-1])}
    if season > 1 and n >= 2 * season:
        methods["seasonal_naive"] = lambda values, m=season: (lambda h: values[-m + (h - 1) % m]) if len(values) >= m else None
    for k in (3, 7):
        if n > k:
            methods[f"moving_average_{k}"] = lambda values, k=k: (lambda h, mean=sum(values[-k:]) / k: mean) if len(values) >= k else None
    for a in LEVELS:
        methods[f"ses_{a}"] = lambda values, a=a: _ses(values, a)
    if n >= 8:
        for a in (0.3, 0.5, 0.8):
            for b in (0.1, 0.3):
                methods[f"holt_{a}_{b}"] = lambda values, a=a, b=b: _holt(values, a, b)
    return methods


def _metrics(errors, actuals):
    if not errors:
        return None
    mae = sum(abs(e) for e in errors) / len(errors)
    rmse = math.sqrt(sum(e * e for e in errors) / len(errors))
    # sMAPE is undefined when both actual and forecast are zero; skip those.
    terms = [2 * abs(e) / (abs(a) + abs(a - e)) for e, a in zip(errors, actuals) if abs(a) + abs(a - e) > 0]
    smape = 100 * sum(terms) / len(terms) if terms else None
    return {"mae": round(mae, 4), "rmse": round(rmse, 4), "smape_pct": None if smape is None else round(smape, 2),
            "evaluated_points": len(errors)}


def backtest(values, method, horizon, folds, *, origins=None):
    """Rolling-origin backtest: refit on each prefix, score the next horizon.

    A method that cannot fit a short prefix (season/window longer than it)
    skips that origin instead of being scored on a fabricated fit.
    """
    errors, actuals, by_step = [], [], {}
    n = len(values)
    for origin in (origins if origins is not None else range(n - folds - horizon + 1, n - horizon + 1)):
        if origin < 2:
            continue
        predict = method(values[:origin])
        if predict is None:
            continue
        for h in range(1, horizon + 1):
            actual = values[origin + h - 1]
            error = actual - predict(h)
            errors.append(error); actuals.append(actual)
            by_step.setdefault(h, []).append(error)
    return _metrics(errors, actuals), by_step


def _selection(values, unit, horizon, folds):
    """Compare candidates only on a common set of eligible observations."""
    methods = candidate_methods(unit, len(values))
    origins = [o for o in range(len(values)-folds-horizon+1, len(values)-horizon+1) if o >= 2]
    eligible = {name: {o for o in origins if fit(values[:o]) is not None} for name, fit in methods.items()}
    excluded = {name: 'insufficient_selection_history' for name, points in eligible.items() if not points}
    methods = {name: fit for name, fit in methods.items() if eligible[name]}
    if 'naive' not in methods:
        raise AnalysisError('forecast_execution', 'Backtest window unavailable')
    common = sorted(set.intersection(*(eligible[name] for name in methods)))
    if not common:
        # A model with incomparable origins is not ranked by a different MAE.
        excluded.update({name: 'no_common_origins' for name in methods if name != 'naive'})
        methods = {'naive': methods['naive']}
        common = sorted(eligible['naive'])
    results = {}
    for name, fit in methods.items():
        score, by_step = backtest(values, fit, horizon, len(common), origins=common)
        if score:
            results[name] = (score, by_step, fit)
    order = list(results)
    chosen = min(results, key=lambda name: (results[name][0]['mae'], order.index(name)))
    diagnostics = {'criterion': 'common_origin_mae', 'common_origins': common,
                   'methods': {name: result[0] for name, result in results.items()}, 'excluded_methods': excluded}
    return chosen, results, diagnostics


def _interval(predict, step, errors_by_step, score, test_horizon, nonnegative):
    errors = errors_by_step.get(min(step, test_horizon), [])
    scale = math.sqrt(sum(e*e for e in errors)/len(errors)) if errors else score['rmse']
    if step > test_horizon:
        scale *= math.sqrt(step/test_horizon)
    value = predict(step)
    low, high = value-Z80*scale, value+Z80*scale
    return tuple(max(0.0, v) for v in (value, low, high)) if nonnegative else (value, low, high)


def _method_parameters(name):
    parts = name.split('_')
    if name.startswith('moving_average_'):
        return {'window': int(parts[-1])}
    if name.startswith('ses_'):
        return {'alpha': float(parts[1])}
    if name.startswith('holt_'):
        return {'alpha': float(parts[1]), 'beta': float(parts[2])}
    return {}


def _current_period(reference, unit):
    if unit == "day":
        return reference
    if unit == "week":
        return reference - timedelta(days=reference.weekday())
    return date(reference.year, reference.month, 1)


def forecast(series, unit, horizon, spec, reference=None):
    """Select by backtest MAE (ties → simpler), project, attach intervals.

    The horizon counts future periods after the one containing ``reference``
    ("tháng sau" on 15/10 is November). Periods between the last complete one
    and that boundary are projected too and labelled as in-progress/lagged.
    """
    values = [v for _, v in series]
    minimum = spec["min_history"][unit]
    if len(values) < minimum:
        error = AnalysisError("forecast_insufficient_history", "Too few historical periods")
        error.required_periods, error.available_periods, error.unit = minimum, len(values), unit
        raise error
    if not any(values):
        raise AnalysisError("forecast_insufficient_history", "History contains no observed activity")
    test_horizon = max(1, min(horizon, len(values) // 4))
    folds = max(1, min(8, len(values) // 3))
    # Holdout never participates in selection. Short histories explicitly lack
    # independent calibration; the existing rolling backtest remains available.
    holdout = min(8, max(horizon, len(values)//5)) if len(values) >= max(2*minimum, minimum+3*horizon) else 0
    selection_values = values[:-holdout] if holdout else values
    selected_horizon = max(1, min(test_horizon, len(selection_values)//4))
    selected_folds = max(1, min(folds, len(selection_values)//3))
    chosen, results, selection = _selection(selection_values, unit, selected_horizon, selected_folds)
    test_horizon = selected_horizon
    score, by_step, method = results[chosen]
    nonnegative = spec.get("non_negative", True)
    calibration = {'status': 'not_measured', 'coverage_80_pct': None, 'evaluated_points': 0,
                   'reason': 'insufficient_independent_history'}
    if holdout:
        validation_predict = method(selection_values)
        inside = 0
        for step, actual in enumerate(values[-holdout:], 1):
            _, low, high = _interval(validation_predict, step, by_step, score, test_horizon, nonnegative)
            inside += low <= actual <= high
        calibration = {'status': 'measured', 'coverage_80_pct': round(100*inside/holdout, 2),
                       'evaluated_points': holdout, 'holdout_start_index': len(selection_values),
                       'method': 'fixed_origin_holdout', 'used_for_selection': False}
    predict = method(values)  # Production projection refits on all observed history.
    points, period = [], series[-1][0]
    lag = 0
    if reference is not None:
        current, cursor = _current_period(reference, unit), series[-1][0]
        while _next(cursor, unit) <= current:
            cursor = _next(cursor, unit); lag += 1
        if lag > 1:
            # The approved window ended before the last complete period; the
            # gap is unobserved, not "in progress", so do not project across it.
            error = AnalysisError("forecast_insufficient_history", "History window ends before the most recent complete period")
            error.history_end, error.unit = series[-1][0].isoformat(), unit
            raise error
    for h in range(1, lag + horizon + 1):
        period = _next(period, unit)
        value, low, high = _interval(predict, h, by_step, score, test_horizon, nonnegative)
        points.append({"period": period.isoformat(), "value": round(value, 2),
                       "lower_80": round(low, 2), "upper_80": round(high, 2),
                       "kind": "future" if h > lag else "in_progress"})
    baseline = results["naive"][0]
    limitations = ["Dự báo thống kê từ lịch sử đã kiểm chứng; không tính sự kiện, khuyến mãi hay thay đổi vận hành chưa có trong dữ liệu."]
    window = max(1, min(SEASON[unit] if SEASON[unit] > 1 else 3, len(values) // 4))
    recent, earlier = values[-window:], values[-2 * window:-window]
    if earlier and sum(earlier) > 0 and sum(recent) / len(recent) < 0.1 * sum(earlier) / len(earlier):
        # Report a structural break rather than silently projecting it away.
        limitations.append("Hoạt động gần đây giảm đột ngột so với giai đoạn trước (có thể do ngừng ghi nhận hoặc đồng bộ dữ liệu); dự báo phản ánh mức gần nhất và cần kiểm tra nguồn.")
    return {
        "version": VERSION, "method": chosen, "unit": unit, "horizon": horizon,
        "history": {"start": series[0][0].isoformat(), "end": series[-1][0].isoformat(), "periods": len(values),
                    "missing_data_policy": spec.get("missing_data_policy", "zero_fill")},
        "forecast": points,
        "backtest": {**score, "test_horizon": test_horizon, "folds": len(selection['common_origins']),
                     "naive_baseline": baseline,
                     "improvement_vs_naive_pct": None if not baseline["mae"] else round(100 * (1 - score["mae"] / baseline["mae"]), 2)},
        "diagnostics": {'selection': selection, 'interval_calibration': calibration,
                        'method_parameters': _method_parameters(chosen),
                        'history_hash': hashlib.sha256(json.dumps([[str(p), v] for p, v in series],
                            allow_nan=False, separators=(',', ':')).encode()).hexdigest()},
        "interval": "Khoảng 80% ước lượng từ sai số backtest; không phải xác suất được bảo đảm.",
        "limitations": limitations,
    }


def report_forecasts(artifacts, coverage, catalog, reference=None):
    """Project every resolved forecast requirement from its verified trend rows.

    Missing history for one forecast only marks that forecast unavailable when
    other resolved requirements still answer the question; a forecast-only
    question fails as INSUFFICIENT_DATA.
    """
    out, unavailable = [], []
    for c in coverage or []:
        request = c.get("forecast")
        if not request or c.get("state") != "RESOLVED" or not c.get("operation_ids"):
            continue
        query_id = c["operation_ids"][0]
        artifact = artifacts.get(query_id)
        if artifact is None or artifact.result is None:
            raise AnalysisError("forecast_execution", "Forecast history was not executed")
        metric = artifact.plan.metrics[0]
        definition = catalog.registry["metrics"][metric]
        spec = validate_request(catalog, metric, request["unit"], request["horizon"])
        head = {"requirement_id": c["requirement_id"], "query_id": query_id, "metric_id": metric,
                "metric_label": definition["business_name"], "metric_unit": definition["unit"],
                "unit": request["unit"], "horizon": request["horizon"]}
        try:
            series = complete_series(artifact.result["rows"], metric, request["unit"], spec.get("missing_data_policy", "zero_fill"),
                                     reference, getattr(getattr(artifact, "grounded", None), "period", None))
            result = forecast(series, request["unit"], request["horizon"], {**spec, "non_negative": definition.get("non_negative", True)}, reference)
        except AnalysisError as error:
            if error.category != "forecast_insufficient_history":
                raise
            unavailable.append(error)
            out.append({**head, "version": VERSION, "status": "insufficient_history",
                        "required_periods": getattr(error, "required_periods", None),
                        "available_periods": getattr(error, "available_periods", None),
                        "history_end": getattr(error, "history_end", None)})
            continue
        # Verified (complete-period) history for the chart; same series the
        # method was fitted on, never re-derived by the client.
        history_points = [{"period": period.isoformat(), "value": round(float(value), 2)} for period, value in series[-60:]]
        out.append({**head, "status": "ok", **result, "history_points": history_points})
    # Only user-requested views count; auto-added supporting context does not answer the question.
    requested = {id for id, a in artifacts.items() if getattr(getattr(a, "query", None), "role", "requested") == "requested"}
    answered = any(c.get("state") == "RESOLVED" and not c.get("forecast") and requested.intersection(c.get("operation_ids") or [])
                   for c in coverage or [])
    if unavailable and not answered and len(unavailable) == len(out):
        raise unavailable[0]
    return out
