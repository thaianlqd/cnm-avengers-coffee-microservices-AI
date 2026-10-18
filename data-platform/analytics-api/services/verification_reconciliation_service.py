"""V3.2 measurable verification: deterministic, independent checks — never an
LLM judge and never one blended "AI accuracy" number.

Independent oracle = a SEPARATE read-only aggregate query compiled from the same
governed metric definition but a different query shape (whole-scope scalar or
un-limited grouping), executed through the same read-only executor. It does not
re-read rendered values. When no genuinely independent path exists the result
is `None` ("Chưa đo đối chiếu độc lập"), never an inferred 100%.
"""
from copy import copy, deepcopy

VERSION = "3.2.0"
COUNT_UNITS = {"đơn", "lượt", "khách", "ca", "sản phẩm", "đơn vị"}


def tolerance(unit):
    """Metric-specific tolerance: counts exact, currency ~0, percentages bounded."""
    if unit in COUNT_UNITS:
        return {"absolute": 0.0, "relative": 0.0}
    if unit == "%":
        return {"absolute": 0.05, "relative": None}
    return {"absolute": 0.01, "relative": 1e-9}


def numeric_check(label, expected, reported, unit, source):
    if expected is None or reported is None:
        return {"label": label, "status": "not_measured", "source": source}
    abs_err = abs(reported - expected)
    rel_err = abs_err / abs(expected) if expected else (0.0 if abs_err == 0 else None)
    tol = tolerance(unit)
    ok = abs_err <= tol["absolute"] or (tol["relative"] is not None and rel_err is not None and rel_err <= tol["relative"])
    return {"label": label, "expected_value": expected, "reported_value": reported, "absolute_error": round(abs_err, 6),
            "relative_error": None if rel_err is None else round(rel_err, 9), "within_tolerance": ok, "tolerance": tol,
            "unit": unit, "source": source, "status": "matched" if ok else "mismatch"}


class OracleRunner:
    """Executes independent oracle operations on an isolated copy of the runner."""

    def __init__(self, queries):
        self.queries = queries
        self.executed = 0

    def __call__(self, op):
        isolated = copy(self.queries)
        isolated.artifacts = {}
        isolated.diagnostics = deepcopy(getattr(self.queries, "diagnostics", {}))
        isolated.cache = {}
        prepared = isolated.prepare(op)
        self.executed += 1
        return isolated.run(prepared)


def _oracle_op(artifact, **changes):
    base = artifact.query.model_dump(mode="json")
    base.update(id="oracle_" + base["id"][-20:], role="requested", replaces=None, changed_fields=[], **changes)
    for key in ("parent_id", "purpose", "population_relation"):
        base.pop(key, None)
    return base


def _additive(catalog, metric):
    return bool(catalog.registry["metrics"].get(metric, {}).get("additive"))


def reconcile(artifacts, catalog, runner=None, *, max_oracle_queries=3):
    """Numeric + ranking + trend reconciliation for requested results."""
    numeric, ranking, trend = [], [], []
    budget = max_oracle_queries
    for id, a in artifacts.items():
        if getattr(a.query, "role", "requested") != "requested" or a.plan.kind == "detail":
            continue
        rows = a.result.get("rows", [])
        metrics = [m for m in a.plan.metrics if _additive(catalog, m)]
        unit = lambda m: catalog.registry["metrics"][m]["unit"]
        complete = not a.plan.ranking and not a.plan.explicit_limit
        if a.plan.kind == "trend":
            periods = [str(r.get("period")) for r in rows if r.get("period") is not None]
            trend.append({"query_id": id, "buckets": len(set(periods)),
                          "ordered": periods == sorted(periods) or len(set(r.get(d) for r in rows for d in a.plan.dimensions if d != "period")) > 1,
                          "duplicate_buckets": len(periods) - len(set(periods)) if not [d for d in a.plan.dimensions if d != "period"] else 0})
        if (metrics and rows and complete and (a.plan.dimensions or a.plan.kind == "trend") and runner and budget > 0):
            try:
                oracle = runner(_oracle_op(a, operation="aggregate", group_by=[], ranking=None, metrics=metrics))
                budget -= 1
                expected_row = (oracle.result.get("rows") or [{}])[0]
                for m in metrics:
                    reported = sum(r[m] for r in rows if isinstance(r.get(m), (int, float)))
                    numeric.append({**numeric_check(f"Tổng {catalog.registry['metrics'][m]['business_name'].lower()} = tổng các nhóm/kỳ",
                                                    expected_row.get(m), reported, unit(m),
                                                    "independent_scalar_query"), "query_id": id, "metric": m})
            except Exception as error:  # an oracle failure is reported, never hidden as a pass
                numeric.append({"label": "Truy vấn đối chiếu độc lập", "status": "not_measured", "query_id": id,
                                "reason": getattr(error, "category", "oracle_unavailable")})
        if a.plan.ranking and a.plan.dimensions and rows and runner and budget > 0:
            metric = a.plan.ranking.metric
            try:
                oracle = runner(_oracle_op(a, operation="aggregate", ranking=None, limit=100))
                budget -= 1
                if len(oracle.result.get("rows", [])) >= 100:
                    ranking.append({"query_id": id, "metric": metric, "status": "not_measured", "reason": "population_over_oracle_limit"})
                    continue
                ranking.append({"query_id": id, "metric": metric, **ranking_agreement(rows, oracle.result.get("rows", []),
                                [d for d in a.plan.dimensions], metric, a.plan.ranking.direction, a.plan.ranking.top_n)})
            except Exception as error:
                ranking.append({"query_id": id, "metric": metric, "status": "not_measured",
                                "reason": getattr(error, "category", "oracle_unavailable")})
    measured = [c for c in numeric if c.get("status") in {"matched", "mismatch"}]
    independent = None
    if measured:
        independent = {"matched": sum(c["status"] == "matched" for c in measured), "eligible": len(measured),
                       "accuracy_pct": round(100 * sum(c["status"] == "matched" for c in measured) / len(measured), 1),
                       "source": "Truy vấn tổng hợp độc lập (read-only) từ cùng định nghĩa chỉ số"}
    return {"numeric": numeric, "ranking": ranking, "trend": trend, "independent_oracle": independent,
            "oracle_queries": max_oracle_queries - budget}


def ranking_agreement(reported_rows, full_rows, dims, metric, direction, k):
    """Top-K exact set, precision/recall (tie-aware), Jaccard and order agreement."""
    key = lambda r: tuple(str(r.get(d)) for d in dims)
    sign = -1 if str(direction).upper() in {"DESC", "TOP"} else 1
    full = sorted([r for r in full_rows if isinstance(r.get(metric), (int, float))], key=lambda r: (sign * r[metric], key(r)))
    reported = [key(r) for r in reported_rows][:k]
    if len(full) < 2 or not reported:
        return {"status": "not_applicable", "reason": "too_few_groups"}
    kth = full[min(k, len(full)) - 1][metric]
    eligible = {key(r) for r in full if (sign * r[metric]) <= sign * kth}  # ties at the cut-off are acceptable
    expected = [key(r) for r in full[:k]]
    hit = len(set(reported) & eligible)
    union = set(reported) | set(expected)
    concordant = discordant = 0
    order = {g: i for i, g in enumerate(key(r) for r in full)}
    for i in range(len(reported)):
        for j in range(i + 1, len(reported)):
            a, b = order.get(reported[i]), order.get(reported[j])
            if a is None or b is None:
                continue
            concordant += a < b
            discordant += a > b
    pairs = concordant + discordant
    return {"status": "matched" if hit == len(reported) and discordant == 0 else "mismatch", "k": len(reported),
            "exact_set_match": set(reported) <= eligible, "precision": round(hit / len(reported), 4),
            "recall": round(hit / min(k, len(full)), 4), "jaccard": round(len(set(reported) & set(expected)) / len(union), 4) if union else None,
            "kendall_tau": round((concordant - discordant) / pairs, 4) if pairs >= 3 else None,
            "order_agreement": discordant == 0}


def forecast_quality(forecasts):
    """Backtest quality exactly as the forecast engine reports it (mae/rmse/smape_pct, evaluated points, folds,
    naive baseline and improvement). Interval coverage is only shown if it was really computed."""
    out = []
    for f in forecasts or []:
        bt = f.get("backtest") or {}
        if f.get("status") not in (None, "ok"):
            out.append({"metric_id": f.get("metric_id"), "method": None, "status": f.get("status"), "error_metrics": {},
                        "note": "Chưa dự báo được vì lịch sử chưa đủ kỳ hợp lệ."})
            continue
        metrics = {k: bt[k] for k in ("mae", "rmse", "smape_pct") if bt.get(k) is not None}
        naive = bt.get("naive_baseline") or {}
        out.append({"metric_id": f.get("metric_id"), "method": f.get("method"), "status": "ok",
                    "baseline": "naive" if naive else None, "baseline_metrics": {k: naive[k] for k in ("mae", "rmse", "smape_pct") if naive.get(k) is not None},
                    "improvement_vs_naive_pct": bt.get("improvement_vs_naive_pct"),
                    "backtest_window": {"evaluated_points": bt.get("evaluated_points"), "test_horizon": bt.get("test_horizon"), "folds": bt.get("folds")},
                    "error_metrics": metrics, "interval": 0.8, "interval_coverage": bt.get("interval_coverage"),
                    "note": "Dự báo không thể kiểm chứng với tương lai; chất lượng đo bằng kiểm tra lùi (backtest), không phải bảo đảm độ chính xác."})
    return out


def grounding(claims, evidence, insight_check):
    by_id = {e.get("id"): e for e in evidence or []}
    with_refs = [c for c in claims or [] if c.get("evidence_id") in by_id]
    numeric = insight_check.get("numeric_claims", 0)
    return {"narrative_claims": len(claims or []), "narrative_claims_with_evidence": len(with_refs),
            "chart_numeric_claims": numeric, "chart_numeric_matched": insight_check.get("matched", 0),
            "unsupported_claims": insight_check.get("unsupported", []) + [c.get("evidence_id") for c in claims or [] if c.get("evidence_id") not in by_id],
            "causal_language": insight_check.get("causal_language", [])}


def verify_conclusion(conclusion, evidence, forecasts, expected=None):
    """The conclusion must answer, and every finding must point at real evidence or a real forecast."""
    if not conclusion:
        return {"present": False, "passed": 0, "total": 0, "dangling": []}
    known = {e.get("id") for e in evidence or []}
    forecast_ids = {f.get("requirement_id") for f in forecasts or []}
    findings = conclusion.get("findings", [])
    dangling = [f.get("evidence_id") or f.get("forecast_ref") for f in findings
                if not ((f.get("evidence_id") in known) or (f.get("forecast_ref") in forecast_ids and f.get("forecast_ref") is not None))]
    checks = [bool(conclusion.get("answer")), not dangling, bool(conclusion.get("caveats")) or not (forecasts or [])]
    if expected is not None:
        checks.append(conclusion == expected)
    return {"present": True, "passed": sum(checks), "total": len(checks), "dangling": dangling}


def verification_report(*, reconciliation, relevance, grounding_result, forecasts, requirement_coverage, internal_score, conclusion_check=None, view_coverage=None):
    """Separate evidence metrics for one report (V3.2 §63) — no blended accuracy."""
    measured = [c for c in reconciliation["numeric"] if c.get("status") in {"matched", "mismatch"}]
    ranked = [r for r in reconciliation["ranking"] if r.get("status") in {"matched", "mismatch"}]
    covered = [c for c in requirement_coverage or [] if c.get("state") == "RESOLVED"]
    g = grounding_result
    status = "verified"
    if any(c["status"] == "mismatch" for c in measured) or any(r["status"] == "mismatch" for r in ranked) \
            or g["unsupported_claims"] or g["causal_language"] or relevance["passed"] < relevance["total"] \
            or (conclusion_check and conclusion_check["passed"] < conclusion_check["total"]) \
            or any(v["required"] and v["status"] == "missing" for v in view_coverage or []):
        status = "attention"
    return {"version": VERSION, "status": status,
            "metrics": [
                {"id": "numeric_reconciliation", "label": "Đối chiếu số liệu độc lập",
                 "passed": sum(c["status"] == "matched" for c in measured), "total": len(measured)},
                {"id": "ranking_reconciliation", "label": "Đối chiếu xếp hạng", "passed": sum(r["status"] == "matched" for r in ranked), "total": len(ranked)},
                {"id": "requirement_coverage", "label": "Yêu cầu được đáp ứng", "passed": len(covered), "total": len(requirement_coverage or [])},
                {"id": "grounded_claims", "label": "Nhận định có bằng chứng",
                 "passed": g["chart_numeric_matched"] + g["narrative_claims_with_evidence"], "total": g["chart_numeric_claims"] + g["narrative_claims"]},
                {"id": "chart_relevance", "label": "Biểu đồ đúng yêu cầu", "passed": relevance["passed"], "total": relevance["total"]},
                *([{"id": "view_coverage", "label": "Góc nhìn bắt buộc đã có",
                    "passed": sum(v["status"] == "satisfied" for v in view_coverage if v["required"]),
                    "total": sum(1 for v in view_coverage if v["required"])}] if view_coverage else []),
                *([{"id": "conclusion_grounding", "label": "Kết luận có bằng chứng", "passed": conclusion_check["passed"], "total": conclusion_check["total"]}]
                  if conclusion_check and conclusion_check["present"] else []),
            ],
            "conclusion": conclusion_check, "view_coverage": view_coverage or [],
            "independent_oracle": reconciliation["independent_oracle"],
            "independent_oracle_label": (f"{reconciliation['independent_oracle']['accuracy_pct']}% trên {reconciliation['independent_oracle']['eligible']} phép đối chiếu số liệu"
                                         if reconciliation["independent_oracle"] else "Chưa đo đối chiếu độc lập"),
            "numeric": reconciliation["numeric"], "ranking": reconciliation["ranking"], "trend": reconciliation["trend"],
            "forecast_backtest": forecast_quality(forecasts), "grounding": g, "chart_relevance": relevance,
            "internal_completeness_score": internal_score,
            "internal_completeness_label": "Mức hoàn tất kiểm chứng nội bộ (không phải độ chính xác AI)",
            "methodology": ["Đối chiếu độc lập: truy vấn tổng hợp read-only riêng từ cùng định nghĩa chỉ số; không đọc lại số đã hiển thị.",
                            "Sai số theo đơn vị: số đếm phải khớp tuyệt đối, tiền tệ sai số ≤ 0,01, phần trăm ≤ 0,05 điểm.",
                            "Tỷ lệ/trung bình không đối chiếu bằng cách cộng hoặc lấy trung bình các nhóm.",
                            "Không dùng AI để chấm AI; không gộp các chỉ số trên thành một 'độ chính xác AI'."]}


def merge_reconciliation(verification, oracle):
    """Persist an oracle result for the same report revision; mismatch cannot remain verified."""
    from copy import deepcopy
    result=deepcopy(verification or {})
    measured=[c for c in oracle.get('numeric',[]) if c.get('status') in {'matched','mismatch'}]
    ranked=[c for c in oracle.get('ranking',[]) if c.get('status') in {'matched','mismatch'}]
    for m in result.get('metrics',[]):
        rows=measured if m['id']=='numeric_reconciliation' else ranked if m['id']=='ranking_reconciliation' else None
        if rows is not None: m.update(passed=sum(c['status']=='matched' for c in rows),total=len(rows))
    if any(c['status']=='mismatch' for c in measured+ranked): result['status']='attention'
    result.update(numeric=oracle.get('numeric',[]),ranking=oracle.get('ranking',[]),independent_oracle=oracle.get('independent_oracle'),oracle_measured_at=oracle.get('measured_at'))
    for d in result.get('trust_dimensions',[]):
        if d['id']=='numeric_reconciliation':
            d.update(status='not_measured' if not measured else 'passed' if all(c['status']=='matched' for c in measured) else 'partial',
                     passed=sum(c['status']=='matched' for c in measured),total=len(measured))
    return result
