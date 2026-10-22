"""Deterministic analytical features and evidence-backed narrative contracts."""

import math
import statistics
import hashlib
import json
from collections import defaultdict
from datetime import date, timedelta
from services.business_labels import dimension_labeler



def ranking_label(ranking):
    """ASC ranking is a Bottom N everywhere it is named (title, selection, notes)."""
    return f"{'Bottom' if ranking.direction == 'ASC' else 'Top'} {ranking.top_n}"


def population_scope(a, artifacts):
    """(scope, ranking label) of a view relative to a Top/Bottom N cohort, or (None, None).

    ranked_cohort: computed on the ranked keys; scope_benchmark: whole scope beside a cohort."""
    ref = getattr(a.query, 'cohort_scope_query_id', None)
    if ref and artifacts.get(ref) is not None and artifacts[ref].plan.ranking:
        return 'ranked_cohort', ranking_label(artifacts[ref].plan.ranking)
    parent = artifacts.get(getattr(a.query, 'parent_id', None))
    if parent is not None and not parent.plan.ranking and getattr(parent.query, 'cohort_scope_query_id', None):
        parent = artifacts.get(parent.query.cohort_scope_query_id)
    if (parent is not None and parent.plan.ranking and not getattr(a.query, 'cohort_query_id', None)
            and not a.plan.ranking):
        return 'scope_benchmark', ranking_label(parent.plan.ranking)
    return None, None


SELECTION_TEXT = {'Top N': 'tập Top N', 'Bottom N': 'tập Bottom N', 'ranked_cohort': 'các đối tượng của xếp hạng chính',
                  'limited': 'giới hạn số dòng', 'complete': 'toàn bộ nhóm trong phạm vi'}


def selection_code(a):
    """Which rows an evidence describes; Bottom N is never called Top N (I08)."""
    if a.plan.ranking:
        return 'Bottom N' if a.plan.ranking.direction == 'ASC' else 'Top N'
    if getattr(a.query, 'cohort_query_id', None):
        return 'Top N'
    if getattr(a.query, 'cohort_scope_query_id', None):
        return 'ranked_cohort'
    return 'limited' if a.plan.explicit_limit else 'complete'


def evidence_comment(e):
    selection = SELECTION_TEXT.get(e['scope']['selection'], e['scope']['selection'])
    return f"Căn cứ {e['scope'].get('label', 'phần phân tích đã chọn')}; phạm vi: {selection}. Xem bằng chứng và phép tính kèm theo."


def selected_total_label(e):
    return 'Tổng của tập Bottom N' if (e.get('scope') or {}).get('selection') == 'Bottom N' else 'Tổng của tập Top N'


def fact_reference(e):
    """A visible fact binds to one immutable query population, metric and unit."""
    return {k: e[k] for k in ('scope_ref', 'metric', 'unit') if e.get(k) is not None}

def trend_bucket_coverage(value, granularity, period):
    """Calendar coverage of a bucket, clipped only by the approved time scope."""
    start = date.fromisoformat(str(value)[:10])
    if granularity in {"day", "week"}:
        next_start = start + timedelta(days=7 if granularity == "week" else 1)
    else:
        months = {"month": 1, "quarter": 3, "year": 12}[granularity]
        offset = start.year * 12 + start.month - 1 + months
        next_start = date(offset // 12, offset % 12 + 1, 1)
    end = next_start - timedelta(days=1)
    partial = bool((period.get("start") and start.isoformat() < period["start"])
                   or (period.get("end") and end.isoformat() > period["end"]))
    return {"start": start.isoformat(), "end": end.isoformat(), "partial": partial}


def number(value):
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def fmt(value):
    return (
        f"{value:,.2f}".rstrip("0").rstrip(".")
        if isinstance(value, float)
        else f"{value:,}"
    )


def analytical_features(artifacts, catalog=None, feature_bindings=None, as_of=None):
    """``as_of`` (analysis reference date) closes an open-ended period: the
    bucket that contains it is still in progress, never a complete period."""
    evidence = []

    def add(a, metric, kind, feature, values, statement, partition=None):
        population, cohort = population_scope(a, artifacts)
        if population == 'ranked_cohort':
            statement += f' Phạm vi: trong {cohort} của xếp hạng chính.'
        elif population == 'scope_benchmark':
            statement += f' Phạm vi đối chiếu: toàn bộ tập đã lọc (bên cạnh {cohort}).'
        suffix = hashlib.sha256(
            json.dumps(
                [partition or {}, values.get("comparison_scope")],
                sort_keys=True,
                default=str,
            ).encode()
        ).hexdigest()[:10]
        evidence.append(
            {
                "id": f"{a.query.id}:{metric}:{feature}:{suffix}",
                "scope_ref": a.query.id,
                "metric": metric,
                "claim_type": kind,
                "feature": feature,
                "values": values,
                "unit": a.grounded.metrics.get(metric, {}).get("unit", ""),
                "scope": {
                    "label": catalog.registry["subjects"][a.query.subject]["business_name"] if catalog else "Phần phân tích đã chọn",
                    "period": a.grounded.period,
                    "population_relation": a.query.population_relation,
                    "metric_business_filters": a.grounded.metrics.get(metric, {}).get("business_filters", []),
                    "metric_required_non_null": a.grounded.metrics.get(metric, {}).get("required_non_null", []),
                    "filters": [f.model_dump(mode="json") for f in a.query.filters],
                    "partition": partition or {},
                    "selection": selection_code(a),
                    **({'population_scope': population} if population else {}),
                    **({'cohort_scope_query_id': a.query.cohort_scope_query_id}
                       if getattr(a.query, 'cohort_scope_query_id', None) else {}),
                    **({'cohort_query_id':a.query.cohort_query_id} if getattr(a.query,'cohort_query_id',None) else {}),
                },
                "statement": statement,
            }
        )

    for a in artifacts.values():
        rows = a.result["rows"]
        display=dimension_labeler(a.plan.dimensions,rows,a.grounded.dimensions)
        if not rows:
            add(a, "", "empty", "empty", {}, "Không có dữ liệu trong phạm vi đã chọn.")
            continue
        if a.plan.kind == "detail":
            columns = ", ".join(
                a.grounded.dimensions[d]["business_name"] for d in a.plan.dimensions
            )
            add(
                a,
                "",
                "detail",
                "detail_count",
                {"returned_records": len(rows)},
                f"Bảng chi tiết có {len(rows)} bản ghi trong phạm vi đã chọn, gồm các trường {columns}.",
            )
        for metric in a.plan.metrics:
            meta = a.grounded.metrics[metric]
            label, unit = meta["business_name"], meta["unit"]
            keys = (
                a.plan.ranking.per_group
                if a.plan.ranking
                else a.plan.dimensions if a.plan.kind == "trend" else []
            )
            batches = defaultdict(list)
            for row in rows:
                batches[tuple(row[d] for d in keys)].append(row)
            for key, batch in batches.items():
                partition = dict(zip(keys, key))
                scope_label = "; ".join(str(v) for v in key)
                suffix = f" ({scope_label})" if scope_label else ""
                pairs = [(r, float(r[metric])) for r in batch if number(r.get(metric))]
                if not pairs:
                    continue
                values = [v for _, v in pairs]
                total = sum(values)
                if catalog and a.plan.kind in {'aggregate','distribution'} and a.plan.dimensions and not a.plan.ranking and not a.plan.explicit_limit and not a.result.get('truncated'):
                    from services.semantic_preflight_contract import metric_capability, additive_across
                    cap=metric_capability(metric,catalog.registry['metrics'][metric])
                    if all(additive_across(cap,d) for d in a.plan.dimensions) and len(pairs)==len(batch):
                        add(a,metric,'aggregate','scope_total',{'total':total,'observed_groups':len(pairs)},
                            f"Tổng {label.lower()}{suffix}: {fmt(total)} {unit} trong phạm vi đã chọn ({len(pairs)} nhóm có dữ liệu).",partition)
                if (
                    len(pairs) == 1
                    and not a.plan.dimensions
                    and a.plan.kind == "aggregate"
                ):
                    add(
                        a,
                        metric,
                        "aggregate",
                        "scalar",
                        {"value": values[0]},
                        f"{label}: {fmt(values[0])} {unit} trong phạm vi đã chọn.",
                        partition,
                    )
                if len(pairs) == 1 and a.plan.dimensions and a.plan.kind in {"aggregate", "distribution"} and not a.plan.ranking:
                    names = [d for d in a.plan.dimensions if not d.endswith("_id")]
                    entity = " / ".join(display(pairs[0][0],d) for d in names)
                    add(a, metric, "aggregate", "scalar", {"value": values[0], "entity": entity, "observed_groups": 1},
                        f"Nhóm duy nhất trả về {entity}: {label.lower()} là {fmt(values[0])} {unit} trong phạm vi đã chọn.", partition)
                if len(pairs) == 1 and a.plan.kind == "trend":
                    add(a, metric, "trend", "period_coverage", {"observed_buckets": 1},
                        f"{label}{suffix}: chỉ có một kỳ quan sát, chưa đủ để so sánh biến động.", partition)
                if (
                    a.plan.ranking
                    and metric == a.plan.ranking.metric
                    and len(pairs) == len(batch)
                ):
                    # The first row follows the user's direction; it need not be the largest.
                    first, v = pairs[0]
                    names = [
                        d
                        for d in a.plan.dimensions
                        if d not in keys and not d.endswith("_id")
                    ]
                    entity = " / ".join(display(first,d) for d in names) or "Hạng 1"
                    add(
                        a,
                        metric,
                        "ranking",
                        "leader",
                        {"value": v, "entity": entity},
                        (f"{batch[0]['rank_tie_count']} đối tượng đồng hạng tại {fmt(v)} {unit} theo {label.lower()}; thứ tự mã không chứng minh vượt trội."
                         if a.plan.ranking and getattr(a.plan.ranking,'tie_census',False) and batch[0].get('rank_tie_count',1)>1 else
                         f"{entity} thấp nhất trong {ranking_label(a.plan.ranking)}{suffix}: {fmt(v)} {unit} theo {label.lower()}."
                         if a.plan.ranking and a.plan.ranking.direction == 'ASC' else
                         f"{entity} đứng đầu xếp hạng{suffix}: {fmt(v)} {unit} theo {label.lower()}."),
                        partition,
                    )
                    if len(values) >= 2:
                        gap = abs(values[0] - values[1])
                        relative = gap / abs(values[1]) * 100 if values[1] else None
                        gap_unit='điểm %' if unit=='%' and getattr(a.plan.ranking,'tie_census',False) else unit
                        add(
                            a,
                            metric,
                            "ranking",
                            "top_gap",
                            {
                                "gap": gap,
                                "relative_gap_pct": relative,
                                "top1": values[0],
                                "top2": values[1],
                                **({'gap_unit':gap_unit} if gap_unit!=unit else {}),
                            },
                            f"Chênh lệch hạng 1 và hạng 2{suffix} là {fmt(gap)} {gap_unit}"
                            + (
                                f" ({fmt(relative)}% so với hạng 2)."
                                if relative is not None
                                else "; hạng 2 bằng 0 nên không tính tỷ lệ."
                            ),
                            partition,
                        )
                if a.plan.ranking and meta.get("additive") and len(pairs) == len(batch):
                    add(
                        a,
                        metric,
                        "ranking",
                        "selected_total",
                        {"total": total, "spread": max(values) - min(values)},
                        f"Tổng {label.lower()} của {len(values)} mục trong xếp hạng{suffix}: {fmt(total)} {unit}; đây là tổng của tập {'Bottom N' if a.plan.ranking.direction == 'ASC' else 'Top N'} đã trả về.",
                        partition,
                    )
                if a.plan.kind == "trend" and len(pairs) >= 2:
                    # Missing/null buckets are not interpolated or converted to zero.
                    window = dict(a.grounded.period)
                    if as_of and (not window.get('end') or str(window['end'])[:10]>str(as_of)[:10]):window['end']=str(as_of)[:10]
                    coverage = [trend_bucket_coverage(r["period"], a.plan.granularity, window) for r, _ in pairs]
                    complete = [p for p, c in zip(pairs, coverage) if not c["partial"]]
                    partial_count = sum(c["partial"] for c in coverage)
                    if len(complete) < 2:
                        add(a, metric, "trend", "period_coverage", {"complete_buckets": len(complete), "partial_buckets": partial_count},
                            f"{label}{suffix}: chưa có hai kỳ đầy đủ trong phạm vi để so sánh biến động; biểu đồ giữ nguyên các kỳ quan sát.", partition)
                        continue
                    first, last = complete[0][1], complete[-1][1]
                    change = last - first
                    is_rate = str(unit).strip() == "%"
                    # A change in a rate is percentage POINTS; a percent-of-percent would mislead.
                    pct = None if is_rate else (change / abs(first) * 100 if first else None)
                    trend_values = [v for _, v in complete]
                    peak, trough = max(complete, key=lambda p: p[1]), min(
                        complete, key=lambda p: p[1]
                    )
                    x = [
                        __import__("datetime")
                        .date.fromisoformat(str(r["period"])[:10])
                        .toordinal()
                        for r, _ in complete
                    ]
                    meanx, meany = statistics.mean(x), statistics.mean(trend_values)
                    denominator = sum((v - meanx) ** 2 for v in x)
                    slope = (
                        sum((v - meanx) * (y - meany) for v, y in zip(x, trend_values))
                        / denominator
                        if denominator
                        else None
                    )
                    add(
                        a,
                        metric,
                        "trend",
                        "change",
                        {
                            "first": first,
                            "last": last,
                            "change": change,
                            "change_pct": pct,
                            "direction": (
                                "up" if change > 0 else "down" if change < 0 else "flat"
                            ),
                            "first_period": str(complete[0][0]["period"]),
                            "last_period": str(complete[-1][0]["period"]),
                            "comparison_basis": "complete_periods" if partial_count else "observed_periods",
                            "comparable": True,
                            "excluded_partial_buckets": partial_count,
                            "complete_buckets": len(complete),
                            "peak_period": str(peak[0]["period"]),
                            "peak": peak[1],
                            "trough_period": str(trough[0]["period"]),
                            "trough": trough[1],
                            "slope_per_day": slope,
                            "volatility": statistics.pstdev(trend_values),
                            "observed_buckets": len(pairs),
                            "null_buckets": len(batch) - len(pairs),
                        },
                        f"{label}{suffix} thay đổi từ {fmt(first)} thành {fmt(last)} {unit} giữa kỳ {str(complete[0][0]['period'])[:10]} và {str(complete[-1][0]['period'])[:10]}"
                        + (
                            f" ({fmt(pct)}%)."
                            if pct is not None
                            else f" ({'+' if change > 0 else ''}{fmt(change)} điểm phần trăm)." if is_rate
                            else "; kỳ đầu bằng 0 nên không tính phần trăm."
                        ) + (f" Chỉ đối chiếu kỳ đầy đủ; {partial_count} kỳ biên chưa đủ ngày vẫn có trên biểu đồ." if partial_count else ""),
                        partition,
                    )
                    add(
                        a,
                        metric,
                        "trend",
                        "extrema",
                        {
                            "peak": peak[1],
                            "trough": trough[1],
                            "volatility": statistics.pstdev(trend_values),
                            "excluded_partial_buckets": partial_count,
                        },
                        f'{label}{suffix} đạt đỉnh {fmt(peak[1])} {unit} ở {peak[0]["period"]}; thấp nhất {fmt(trough[1])} {unit} ở {trough[0]["period"]}.' + (" Chỉ tính các kỳ đầy đủ trong phạm vi." if partial_count else ""),
                        partition,
                    )
                if (
                    a.plan.kind in ("aggregate", "heatmap")
                    and a.query.operation != "relationship"
                    and a.plan.dimensions
                    and len(pairs) >= 2
                    and len(pairs) == len(batch)
                ):
                    largest = max(pairs, key=lambda p: p[1])
                    smallest = min(pairs, key=lambda p: p[1])
                    dimensions = [
                        d for d in a.plan.dimensions if not d.endswith("_id")
                    ] or a.plan.dimensions

                    def entity(pair):
                        return " / ".join(display(pair[0],d) for d in dimensions)

                    add(
                        a,
                        metric,
                        "comparison",
                        "group_comparison",
                        {
                            "largest": entity(largest),
                            "largest_value": largest[1],
                            "smallest": entity(smallest),
                            "smallest_value": smallest[1],
                            "gap": largest[1] - smallest[1],
                            "observed_groups": len(pairs),
                        },
                        f"Trong {len(pairs)} nhóm quan sát đã trả về, {label.lower()} cao nhất ở {entity(largest)} ({fmt(largest[1])} {unit}), thấp nhất ở {entity(smallest)} ({fmt(smallest[1])} {unit}); chênh lệch là {fmt(largest[1]-smallest[1])} {'điểm %' if unit == '%' else unit}.",
                        partition,
                    )
                if (
                    a.plan.kind == "distribution"
                    and not a.plan.explicit_limit
                    and meta.get("additive")
                    and len(values) >= 2
                    and len(pairs) == len(batch)
                    and all(v >= 0 for v in values)
                    and total > 0
                ):
                    shares = [v / total for v in values]
                    largest = max(pairs, key=lambda p: p[1])
                    smallest = min(pairs, key=lambda p: p[1])
                    dims = [d for d in a.plan.dimensions if not d.endswith("_id")]
                    entity = " / ".join(display(largest[0],d) for d in dims)
                    add(
                        a,
                        metric,
                        "distribution",
                        "concentration",
                        {
                            "largest_share_pct": max(shares) * 100,
                            "smallest_share_pct": min(shares) * 100,
                            "hhi": sum(s * s for s in shares),
                            "total": total,
                            "largest": entity,
                        },
                        f"{entity} chiếm tỷ trọng lớn nhất ({fmt(max(shares)*100)}%) trong {label.lower()} của phạm vi đã chọn; tỷ trọng nhỏ nhất là {fmt(min(shares)*100)}%.",
                        partition,
                    )
        if a.query.operation == "relationship" and len(a.plan.metrics) == 2:
            m1, m2 = a.plan.metrics
            pairs = [
                (r[m1], r[m2]) for r in rows if number(r.get(m1)) and number(r.get(m2))
            ]
            if len(pairs) >= 3:
                xs, ys = zip(*pairs)
                mx, my = statistics.mean(xs), statistics.mean(ys)
                vx = sum((x - mx) ** 2 for x in xs)
                vy = sum((y - my) ** 2 for y in ys)
                if vx and vy:
                    corr = sum((x - mx) * (y - my) for x, y in pairs) / math.sqrt(
                        vx * vy
                    )
                    add(
                        a,
                        m1,
                        "relationship",
                        "pearson",
                        {"r": corr, "n": len(pairs), "paired_metric": m2},
                        f'Tương quan giữa {a.grounded.metrics[m1]["business_name"]} và {a.grounded.metrics[m2]["business_name"]} đạt hệ số {fmt(corr)} trên {len(pairs)} quan sát ghép cặp; tương quan không chứng minh nguyên nhân.' + (' Mẫu nhỏ (dưới 10 cặp) nên cần thận trọng.' if len(pairs) < 10 else ''),
                    )
    # Scalar comparisons must have the same metric and period and disjoint EQ/IN populations.
    scalar = [
        a
        for a in artifacts.values()
        if a.plan.kind == "aggregate"
        and not a.plan.dimensions
        and len(a.result["rows"]) == 1
    ]
    for index, a in enumerate(scalar):
        for b in scalar[index + 1 :]:
            if (
                a.grounded.period != b.grounded.period
                or a.query.subject != b.query.subject
            ):
                continue
            disjoint = any(
                f.dimension == g.dimension
                and f.operator in ("eq", "in")
                and g.operator in ("eq", "in")
                and set(f.value if f.operator == "in" else [f.value]).isdisjoint(
                    set(g.value if g.operator == "in" else [g.value])
                )
                for f in a.query.filters
                for g in b.query.filters
            )
            if not disjoint:
                continue
            for metric in set(a.plan.metrics) & set(b.plan.metrics):
                av, bv = a.result["rows"][0][metric], b.result["rows"][0][metric]
                if not number(av) or not number(bv):
                    continue
                gap = av - bv
                add(
                    a,
                    metric,
                    "comparison",
                    "population_gap",
                    {
                        "gap": gap,
                        "relative_gap_pct": gap / abs(bv) * 100 if bv else None,
                        "comparison_scope": b.query.id,
                        "leader": (
                            a.query.id if av > bv else b.query.id if bv > av else "tie"
                        ),
                    },
                    f'{a.grounded.metrics[metric]["business_name"]} giữa hai phạm vi đã chọn chênh {fmt(gap)} {a.grounded.metrics[metric]["unit"]}; đối chiếu bộ lọc từng phần để đọc chiều so sánh.',
                )
    if catalog is not None:
        from services.domain_intelligence_service import DomainIntelligence
        intelligence = DomainIntelligence(catalog)
        for a in artifacts.values():
            profile = intelligence.domain_for(a.query.subject)
            # A peer baseline must cover the complete returned cohort. Top N,
            # truncation, time buckets and mixed dimensions are not baselines.
            if not profile or a.plan.ranking or a.plan.explicit_limit or a.query.operation not in {"aggregate", "cross_tab"} or a.result.get("truncated"):
                continue
            rows = a.result["rows"]
            for signal in profile["health_signals"]:
                metric = signal["metric"]
                if metric not in a.plan.metrics or set(a.query.group_by) != set(signal["peer_dimensions"]) or len(rows) < signal["minimum_peer_groups"]:
                    continue
                if not all(number(row.get(metric)) for row in rows):
                    continue
                observation = signal["observation_metric"]
                if observation and (observation not in a.plan.metrics or not all(number(row.get(observation)) and row[observation] >= signal["minimum_observations"] for row in rows)):
                    continue
                values = [row[metric] for row in rows]
                baseline = (statistics.median if signal["comparison"] == "peer_median" else statistics.mean)(values)
                baseline_label = "trung vị" if signal["comparison"] == "peer_median" else "trung bình"
                meta = a.grounded.metrics[metric]
                for row in rows:
                    partition = {d: row[d] for d in a.plan.dimensions}
                    entity = " / ".join(display(row,d) for d in a.plan.dimensions if not d.endswith("_id")) or "Nhóm quan sát"
                    gap = row[metric] - baseline
                    relative = gap / abs(baseline) * 100 if baseline else None
                    direction = signal["direction"]
                    judgment = "above_peer" if gap > 0 else "below_peer" if gap < 0 else "at_peer"
                    if signal["comparable_exposure"] and direction in {"higher_better", "lower_better"}:
                        judgment = "at_peer" if not gap else "favorable" if (gap > 0) == (direction == "higher_better") else "needs_review"
                    statement = f"{entity}: {meta['business_name']} {fmt(row[metric])} {meta['unit']}, chênh {fmt(gap)} {meta['unit']} so với {baseline_label} {fmt(baseline)} của {len(rows)} nhóm cùng phạm vi."
                    if judgment not in {"favorable", "needs_review"}:
                        statement += " Chênh lệch chưa xác định hiệu quả tốt/xấu vì chưa kiểm chứng quy mô hoạt động tương đương."
                    add(a, metric, "comparison", "peer_gap", {"entity": entity, "actual": row[metric], "baseline": baseline, "baseline_type": signal["comparison"], "gap": gap, "relative_gap_pct": relative, "direction": direction, "judgment": judgment, "peer_groups": len(rows), "comparable_exposure": signal["comparable_exposure"]}, statement, partition)
    for binding in feature_bindings or []:
        if binding.get('feature')!='ranked_companion':continue
        ids=binding.get('query_ids',[])
        if len(ids)!=2:continue
        primary,companion=(artifacts.get(q) for q in ids)
        if not primary or not companion or companion.query.cohort_query_id!=primary.query.id:continue
        from services.analysis_query import validate_ranked_cohorts
        try:validate_ranked_cohorts({primary.query.id:primary,companion.query.id:companion})
        except ValueError:continue
        dimensions=primary.plan.dimensions
        def key(row):return tuple(row[d] for d in dimensions)
        mapped={key(row):row for row in companion.result['rows']}
        display=dimension_labeler(dimensions,primary.result['rows'],primary.grounded.dimensions)
        for metric in binding['metric_ids']:
            identities={d.get('identity') for d in primary.grounded.dimensions.values()}
            rows=[{'entity':'; '.join(display(row,d) for d in dimensions if d not in identities),
                'key':{d:row[d] for d in dimensions},
                'rank_value':row[primary.plan.ranking.metric], 'value':mapped[key(row)][metric]}
                for row in primary.result['rows']]
            if not rows or any(not number(row['value']) for row in rows):continue
            meta=companion.grounded.metrics[metric]
            statement=f"{meta['business_name']} của cùng {len(rows)} nhóm đã chọn theo {primary.grounded.metrics[primary.plan.ranking.metric]['business_name']}: "
            statement+='; '.join(f"{row['entity']}: {fmt(row['value'])} {meta['unit']}" for row in rows[:5])+'.'
            if len(rows)>5:statement+=' Hiển thị 5 nhóm đầu; xem bảng đầy đủ.'
            statement+=' Mỗi chỉ số giữ quần thể theo định nghĩa danh mục.'
            add(companion,metric,'comparison','ranked_companion',
                {'rows':rows,'query_ids':ids,'ranking_metric':primary.plan.ranking.metric},statement)
    # Scalar period comparisons use two independently compiled full artifacts.
    # Missing/null baselines never become a fabricated zero or percentage.
    for binding in feature_bindings or []:
        if binding.get('feature') != 'period_comparison':
            continue
        ids = binding.get('query_ids', [])
        if len(ids) != 2:
            continue
        target, baseline = (artifacts.get(q) for q in ids)
        if not target or not baseline:
            continue
        comparable = (not target.plan.dimensions and not baseline.plan.dimensions
            and target.query.subject == baseline.query.subject and target.query.filters == baseline.query.filters
            and not target.result.get('truncated') and not baseline.result.get('truncated')
            and len(target.result['rows']) == len(baseline.result['rows']) == 1)
        for metric in binding['metric_ids']:
            current = target.result['rows'][0].get(metric) if comparable else None
            previous = baseline.result['rows'][0].get(metric) if comparable else None
            if not number(current) or not number(previous):
                continue
            delta = current - previous
            pct = delta / abs(previous) * 100 if previous else None
            if not number(delta) or pct is not None and not number(pct):
                continue
            start, end = target.grounded.period, baseline.grounded.period
            label = target.grounded.metrics[metric]['business_name']
            unit = target.grounded.metrics[metric]['unit']
            statement = (f"{label} kỳ {start['start']}–{start['end']}: {fmt(current)} {unit}; "
                f"kỳ đối chiếu {end['start']}–{end['end']}: {fmt(previous)} {unit}; "
                f"chênh lệch {fmt(delta)} {unit}")
            statement += f" ({fmt(pct)}%)." if pct is not None else '; không tính phần trăm vì kỳ đối chiếu bằng 0.'
            add(target, metric, 'comparison', 'period_comparison',
                {'current':current,'baseline':previous,'delta':delta,'change_pct':pct,
                 'query_ids':ids,'comparison_scope':{'target':start,'baseline':end}}, statement)
    # --- Governed pair (V3.3): two separate aggregates paired by a unique key; populations stay separate ---
    for binding in feature_bindings or []:
        if not binding.get("pair_id"):
            continue
        ids = binding.get("query_ids", [])[:2]
        qa, qb = (artifacts.get(q) for q in ids) if len(ids) == 2 else (None, None)
        if not qa or not qb:
            continue
        ma, mb = binding["metric_ids"][:2]
        comparable = (qa.grounded.period == qb.grounded.period and qa.query.filters == qb.query.filters
                      and not qa.result.get("truncated") and not qb.result.get("truncated"))
        res = paired_observations(qa.result["rows"], qb.result["rows"], binding["key"], ma, mb) if comparable else {"status": "not_comparable", "n": 0}
        names = [qa.grounded.metrics[ma]["business_name"], qb.grounded.metrics[mb]["business_name"]]
        registry = catalog.registry if catalog else {"metrics": {}}
        values = {"r": res.get("r"), "n": res.get("n", 0), "paired_metric": mb, "pair_id": binding["pair_id"], "query_ids": ids,
                  'spearman':res.get('spearman'),'sensitivity':res.get('sensitivity'),
                  'statistics_version':'3.4.0',
                  "key": binding["key"], "status": res["status"], "initial_a": res.get("initial_a"), "initial_b": res.get("initial_b"),
                  "excluded_invalid": res.get("excluded_invalid", 0), "excluded_missing_key": res.get("excluded_missing_key", 0),
                  "unmatched_a": len(res.get("unmatched_a", [])), "unmatched_b": len(res.get("unmatched_b", [])),
                  "duplicate_keys": res.get("duplicate_keys", [])[:5], "small_sample": bool(res.get("small_sample")),
                  "populations": {m: registry["metrics"].get(m, {}).get("population_definition") for m in (ma, mb)}}
        accounting = (f"{res.get('initial_a')}/{res.get('initial_b')} nhóm ban đầu, {res.get('n', 0)} cặp hợp lệ"
                      f"; loại {res.get('excluded_invalid', 0)} giá trị không hợp lệ và {len(res.get('unmatched_a', [])) + len(res.get('unmatched_b', []))} khóa không khớp") if comparable else ""
        if res["status"] == "ok":
            add(qa, ma, "relationship", "pearson", values,
                f"Tương quan giữa {names[0]} và {names[1]} đạt Pearson {fmt(res['r'])}, Spearman {fmt(res['spearman'])} trên {res['n']} cặp ghép theo mã duy nhất ({accounting}); tương quan không chứng minh nguyên nhân."
                + (" Mẫu nhỏ (dưới 10 cặp) nên cần thận trọng." if res["small_sample"] else ""))
        else:
            reason = {"duplicate_keys": "khóa ghép bị trùng nên cặp không hợp lệ", "insufficient_pairs": f"chỉ có {res.get('n', 0)} cặp hợp lệ, cần ít nhất {MIN_PAIRED_OBSERVATIONS}",
                      "zero_variance": "một trong hai chỉ số không đổi giữa các nhóm nên không tính được hệ số tương quan",
                      "not_comparable": "hai phép tổng hợp không cùng kỳ/phạm vi hoặc bị cắt bớt"}[res["status"]]
            add(qa, ma, "relationship", "pair_status", values, f"Không tính hệ số tương quan giữa {names[0]} và {names[1]}: {reason}. {accounting}".strip())
    # --- Driver (V3.3): signed change decomposition reconciled against INDEPENDENT totals ---
    for binding in feature_bindings or []:
        if binding.get("feature") != "driver_delta":
            continue
        ids = binding.get("query_ids", [])
        arts = [artifacts.get(q) for q in ids]
        if len(arts) != 4 or not all(arts):
            continue
        cur_g, prev_g, cur_t, prev_t = arts
        metric, dim = binding["metric_ids"][0], binding["dimension"]
        meta = cur_g.grounded.metrics.get(metric, {})
        label, unit = meta.get("business_name", metric), meta.get("unit", "")
        def scalar(a):
            rows = a.result.get("rows", [])
            return rows[0].get(metric) if len(rows) == 1 and _valid_number(rows[0].get(metric)) else None
        def by_group(a):
            out, dup = {}, False
            for r in a.result.get("rows", []):
                k = r.get(dim)
                dup = dup or k in out
                out[k] = r.get(metric) if _valid_number(r.get(metric)) else 0
            return out, dup
        complete = not any(a.result.get("truncated") for a in arts) and not any(a.plan.ranking or a.plan.explicit_limit for a in arts)
        cur_total, prev_total = scalar(cur_t), scalar(prev_t)
        cur_map, cur_dup = by_group(cur_g)
        prev_map, prev_dup = by_group(prev_g)
        values = {"metric": metric, "dimension": dim, "query_ids": ids, "current_period": binding["current"], "previous_period": binding["previous"],
                  "current_total": cur_total, "previous_total": prev_total, "groups": len(set(cur_map) | set(prev_map))}
        status = ("not_comparable" if not complete else "disjoint_violation" if cur_dup or prev_dup
                  else "baseline_missing" if prev_total is None or not prev_map or cur_total is None
                  else "ok")
        if status == "ok":
            rec = reconcile_driver_deltas(cur_map, prev_map)
            total_delta = round(cur_total - prev_total, 6)
            covers = abs(sum(cur_map.values()) - cur_total) <= 0.01 and abs(sum(prev_map.values()) - prev_total) <= 0.01
            if not (rec["reconciled"] and covers and abs(rec["total_delta"] - total_delta) <= 0.01):
                status = "reconcile_failed"
            else:
                top = [{"group": g, "current": cur_map.get(g, 0), "previous": prev_map.get(g, 0), "delta": rec["deltas"][g],
                        "share_of_change_pct": None if not total_delta else round(rec["deltas"][g] / total_delta * 100, 4)} for g in rec["drivers"][:5]]
                direction = "up" if total_delta > 0 else "down" if total_delta < 0 else "flat"
                pct = None if not prev_total else round(total_delta / abs(prev_total) * 100, 4)
                values.update(total_delta=total_delta, total_delta_pct=pct, direction=direction, explained=rec["explained"], reconciled=True,
                              coverage_complete=True, drivers=top)
                word = {"up": "tăng", "down": "giảm", "flat": "không đổi"}[direction]
                lead = top[0] if top else None
                display = dimension_labeler(cur_g.plan.dimensions, cur_g.result["rows"] + prev_g.result["rows"], cur_g.grounded.dimensions)
                lead_name = display({dim: lead["group"]}, dim) if lead else ""
                add(cur_g, metric, "comparison", "driver_delta", values,
                    f"{label} {word}" + (f" {fmt(abs(total_delta))} {unit}" if direction != "flat" else "")
                    + (f" ({fmt(abs(pct))}%)" if pct is not None and direction != "flat" else "")
                    + f" giữa kỳ {binding['previous']['start']}–{binding['previous']['end']} và kỳ {binding['current']['start']}–{binding['current']['end']}"
                    + (f"; nhóm đóng góp thay đổi lớn nhất là {lead_name} ({'+' if lead['delta'] > 0 else ''}{fmt(lead['delta'])} {unit})." if lead and direction != "flat" else ".")
                    + " Đây là phân rã thay đổi giữa hai kỳ, không khẳng định nguyên nhân.")
                continue
        reason = {"not_comparable": "kết quả bị cắt hoặc giới hạn nên không đại diện toàn bộ mẫu số",
                  "disjoint_violation": "các nhóm bị trùng khóa nên phân rã không rời nhau",
                  "baseline_missing": "chưa có kỳ trước tương đương với dữ liệu để làm mốc so sánh",
                  "reconcile_failed": "tổng các thay đổi theo nhóm không khớp với tổng độc lập của hai kỳ"}[status]
        values.update(status=status, reconciled=False)
        add(cur_g, metric, "comparison", "driver_status", values, f"Chưa phân rã được thay đổi của {label.lower()}: {reason}; không kết luận tăng hay giảm.")
    seen_shares = set()
    for binding in feature_bindings or []:
        if binding.get("feature") != "contribution_share":
            continue
        a = artifacts.get(binding.get("query_id"))
        denominator = artifacts.get(binding.get("denominator_query_id"))
        if (not a or not denominator or denominator.plan.ranking or denominator.plan.explicit_limit
            or denominator.grounded.period != a.grounded.period or denominator.query.filters != a.query.filters
            or denominator.query.subject != a.query.subject or denominator.result.get("truncated")):
            continue
        keys = a.plan.ranking.per_group if a.plan.ranking else []
        if denominator.query.group_by != keys:
            continue
        totals = {tuple(row[d] for d in keys): row for row in denominator.result["rows"]}
        display=dimension_labeler(a.plan.dimensions,a.result['rows'],a.grounded.dimensions)
        for metric in binding["metric_ids"]:
            meta = a.grounded.metrics.get(metric)
            if not meta or not meta.get("additive") or metric not in denominator.plan.metrics:
                continue
            key = (a.query.id, denominator.query.id, metric)
            if key in seen_shares:
                continue
            seen_shares.add(key)
            for row in a.result["rows"]:
                partition = {d:row[d] for d in keys}
                total = totals.get(tuple(partition.values()), {}).get(metric)
                value = row.get(metric)
                if not number(total) or not number(value) or total <= 0 or value < 0 or value > total:
                    continue
                dims = {d:row[d] for d in a.plan.dimensions}
                entity = " / ".join(display(row,d) for d in dims if not d.endswith("_id"))
                add(a,metric,"distribution","contribution_share",
                    {"value":value,"share_pct":value/total*100,"denominator":total,
                     "denominator_scope":denominator.query.id,"denominator_selection":"complete",
                     "entity":entity,"dimensions":dims},
                    f"{entity}: {meta['business_name'].lower()} chiếm {fmt(value/total*100)}% tổng {fmt(total)} {meta['unit']} của cùng phạm vi đầy đủ đã kiểm chứng.",dims)
    return evidence


def grounded_narrative(plan, evidence):
    by_id = {e["id"]: e for e in evidence}
    selected = []
    rejected = []
    for claim in plan.claims if plan else []:
        e = by_id.get(claim.evidence_id)
        if (
            not e
            or (claim.metric, claim.scope_ref, claim.claim_type)
            != (e["metric"], e["scope_ref"], e["claim_type"])
            or claim.text is not None
            and claim.text != e["statement"]
        ):
            rejected.append(
                {"kind": "claim", "reason": "unsupported_evidence_or_statement"}
            )
        elif e not in selected:
            selected.append(e)
    if not selected:
        # Select meaningful features across scopes before secondary facts.
        buckets = defaultdict(lambda: defaultdict(list))
        for e in sorted(
            evidence,
            key=lambda e: e["feature"] in ("selected_total", "extrema"),
        ):
            buckets[e["scope_ref"]][e["metric"]].append(e)
        # Interleave operations and metrics; many partitions of one operation
        # must not crowd every other requested part out of the summary.
        while buckets and len(selected) < 12:
            for scope in list(buckets):
                metrics = buckets[scope]
                metric = next(iter(metrics))
                values = metrics.pop(metric)
                selected.append(values.pop(0))
                if values:
                    metrics[metric] = values
                if not metrics:
                    del buckets[scope]
                if len(selected) == 12:
                    break
    actions = {
        "review_gap": ("top_gap", "population_gap", "peer_gap", "group_comparison"),
        "monitor_variation": ("change",),
        "review_concentration": ("concentration", "contribution_share"),
        "investigate_relationship": ("pearson",),
    }
    templates = {
        "review_gap": "Đối chiếu thêm quy mô hoạt động của các nhóm trước khi thay đổi phân bổ nguồn lực.",
        "monitor_variation": "Theo dõi thêm các kỳ cùng độ dài để kiểm tra biến động có lặp lại hay không.",
        "review_concentration": "Theo dõi mức tập trung của danh mục trong cùng phạm vi trước khi điều chỉnh cơ cấu.",
        "investigate_relationship": "Kiểm tra thêm dữ liệu và yếu tố gây nhiễu trước khi thử nghiệm một thay đổi.",
    }
    recommendations = []
    for rec in plan.recommendations if plan else []:
        e = by_id.get(rec.evidence_id)
        if not e or e["feature"] not in actions[rec.action]:
            rejected.append(
                {"kind": "recommendation", "reason": "evidence_precondition"}
            )
        else:
            recommendations.append(
                {
                    "text": templates[rec.action],
                    "evidence_id": e["id"],
                    "action": rec.action,
                }
            )
    if selected:
        # The opening answers one point; supporting evidence is already listed below.
        summary = selected[0]["statement"]
    else:
        summary = "Không có dữ liệu trong phạm vi đã chọn."

    if len(selected) == 1:
        period = selected[0]["scope"]["period"]
        summary += (
            (
                " Khoảng thời gian đối chiếu: "
                + period["start"]
                + " đến "
                + period["end"]
                + "; múi giờ "
                + period["timezone"]
                + "."
            )
            if period["start"]
            else " Phạm vi thời gian là toàn bộ dữ liệu hiện có; các bộ lọc của phần phân tích vẫn được áp dụng."
        )
    return {
        "executive_summary": summary,
        "executive_summary_facts": [{"evidence_id": e['id'], **fact_reference(e)} for e in selected[:5]],
        "ai_insights": [e["statement"] for e in selected],
        "key_findings": [
            {
                "finding": e["statement"],
                "comment": evidence_comment(e),
                "value": e["values"].get(
                    {
                        "population_gap": "gap",
                        "peer_gap": "gap",
                        "group_comparison": "gap",
                        "leader": "value",
                        "top_gap": "gap",
                        "change": "change",
                        "concentration": "largest_share_pct",
                        "scalar": "value",
                        "selected_total": "total",
                        "pearson": "r",
                    }.get(e["feature"], "")
                ),
                "value_details": e["values"],
                "evidence_id": e["id"],
                **fact_reference(e),
            }
            for e in selected
        ],
        # Conclusions reuse scoped evidence statements instead of generic
        # business/causal claims that the observations cannot establish.
        "conclusions": list(dict.fromkeys(e["statement"] for e in selected
            if e["claim_type"] in {"ranking", "trend", "distribution", "relationship", "comparison"}))[:3],
        "recommendations": recommendations,
        "rejected_narrative": rejected,
    }


# --- V3.3 paired observations and driver reconciliation (server-side, no generic join) ---
MIN_PAIRED_OBSERVATIONS = 3
SMALL_SAMPLE = 10


def _valid_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def paired_observations(rows_a, rows_b, key, metric_a, metric_b):
    """Pair two separately aggregated populations by a unique (possibly composite) key.

    `key` is a column name or a list of names. Duplicate keys invalidate the pair (never first-wins),
    missing key parts are never matched with each other, bool/NaN/inf/NULL values are excluded and
    counted. Pearson needs n >= MIN_PAIRED_OBSERVATIONS and non-zero variance on both sides."""
    keys = [key] if isinstance(key, str) else list(key)

    def index(rows, metric):
        seen, dup, invalid, missing_key = {}, set(), 0, 0
        for r in rows:
            k = tuple(r.get(c) for c in keys)
            if any(part is None for part in k):
                missing_key += 1
                continue
            if k in seen:
                dup.add(k)
            seen[k] = r.get(metric)
        return seen, dup, missing_key

    a, dup_a, missing_a = index(rows_a, metric_a)
    b, dup_b, missing_b = index(rows_b, metric_b)
    dups = dup_a | dup_b
    both = [k for k in a if k in b and k not in dups]
    pairs, invalid = [], 0
    for k in both:
        if _valid_number(a[k]) and _valid_number(b[k]):
            pairs.append((a[k], b[k]))
        else:
            invalid += 1
    out = {"n": len(pairs), "initial_a": len(rows_a), "initial_b": len(rows_b), "excluded_invalid": invalid,
           "excluded_missing_key": missing_a + missing_b,
           "duplicate_keys": sorted(map("|".join, ([str(p) for p in k] for k in dups))),
           "unmatched_a": sorted("|".join(map(str, k)) for k in a.keys() - b.keys()),
           "unmatched_b": sorted("|".join(map(str, k)) for k in b.keys() - a.keys()),
           "r": None, "status": "ok", "small_sample": False}
    if dups:
        out["status"] = "duplicate_keys"
        return out
    if len(pairs) < MIN_PAIRED_OBSERVATIONS:
        out["status"] = "insufficient_pairs"
        return out
    xs, ys = [p[0] for p in pairs], [p[1] for p in pairs]
    coefficient=_paired_coefficient(xs,ys)
    if coefficient is None:
        out["status"] = "zero_variance"
        return out
    out["r"] = round(coefficient, 4)
    out['spearman']=round(_paired_coefficient(_average_ranks(xs),_average_ranks(ys)),4)
    xflags,yflags=_robust_outliers(xs),_robust_outliers(ys)
    flagged=set(xflags['indices'])|set(yflags['indices'])
    subset=[(x,y) for i,(x,y) in enumerate(pairs) if i not in flagged]
    subset_r=_paired_coefficient([p[0] for p in subset],[p[1] for p in subset]) if len(subset)>=MIN_PAIRED_OBSERVATIONS else None
    out['sensitivity']={'method':'median_mad_with_iqr_fallback','version':'3.4.0','full_n':len(pairs),
        'flagged_pairs':len(flagged),'diagnostic_n':len(subset),'full_pearson':out['r'],
        'diagnostic_pearson':round(subset_r,4) if subset_r is not None else None,
        'x_scale_status':xflags['status'],'y_scale_status':yflags['status'],
        'label':'Diagnostic subset only; full-sample coefficients remain authoritative',
        'fisher_z_interval':{'status':'not_measured','reason':'independent_bivariate_normal_assumptions_not_certified'}}
    out["small_sample"] = len(pairs) < SMALL_SAMPLE
    out["pairs"] = pairs
    return out


def _paired_coefficient(xs,ys):
    if len(xs)!=len(ys) or not xs:return None
    # Normalize first so finite values cannot overflow while computing means
    # or squared deviations. Positive rescaling preserves correlation.
    sx,sy=max(abs(v) for v in xs),max(abs(v) for v in ys)
    if not sx or not sy:return None
    x,y=[v/sx for v in xs],[v/sy for v in ys]
    mx,my=sum(x)/len(x),sum(y)/len(y)
    dx,dy=[v-mx for v in x],[v-my for v in y]
    xx,yy=sum(v*v for v in dx),sum(v*v for v in dy)
    if not xx or not yy:return None
    return max(-1.0,min(1.0,sum(a*b for a,b in zip(dx,dy))/(xx*yy)**0.5))


def _average_ranks(values):
    ordered=sorted(range(len(values)),key=lambda i:values[i])
    ranks=[0.0]*len(values)
    i=0
    while i<len(ordered):
        end=i+1
        while end<len(ordered) and values[ordered[end]]==values[ordered[i]]:end+=1
        average=(i+1+end)/2
        for index in ordered[i:end]:ranks[index]=average
        i=end
    return ranks


def _robust_outliers(values):
    from statistics import median
    if len(values)<8:return {'indices':[],'status':'insufficient_sample'}
    center=median(values)
    mad=median(abs(v-center) for v in values)
    if mad:
        return {'indices':[i for i,v in enumerate(values) if abs(v-center)/(1.4826*mad)>3.5], 'status':'mad'}
    ordered=sorted(values)
    q1,q3=median(ordered[:len(ordered)//2]),median(ordered[(len(ordered)+1)//2:])
    iqr=q3-q1
    if not iqr:return {'indices':[],'status':'zero_scale_not_applicable'}
    return {'indices':[i for i,v in enumerate(values) if v<q1-3*iqr or v>q3+3*iqr],'status':'iqr'}


def reconcile_driver_deltas(current, previous, tolerance=0.01):
    """Signed per-part deltas of an additive metric must sum to the total delta.

    `current`/`previous`: {part: value}. Parts missing on one side count as 0."""
    parts = sorted(set(current) | set(previous))
    deltas = {p: round((current.get(p) or 0) - (previous.get(p) or 0), 6) for p in parts}
    total = round(sum(current.values()) - sum(previous.values()), 6)
    explained = round(sum(deltas.values()), 6)
    return {"deltas": deltas, "total_delta": total, "explained": explained, "reconciled": abs(total - explained) <= tolerance,
            "drivers": sorted(parts, key=lambda p: -abs(deltas[p]))}
