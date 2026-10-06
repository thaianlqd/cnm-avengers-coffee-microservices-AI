"""Deterministic analytical features and evidence-backed narrative contracts."""

import math
import statistics
import hashlib
import json
from collections import defaultdict


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


def analytical_features(artifacts):
    evidence = []

    def add(a, metric, kind, feature, values, statement, partition=None):
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
                    "period": a.grounded.period,
                    "filters": [f.model_dump(mode="json") for f in a.query.filters],
                    "partition": partition or {},
                    "selection": (
                        "Top N"
                        if a.plan.ranking
                        else "limited" if a.plan.explicit_limit else "complete"
                    ),
                },
                "statement": statement,
            }
        )

    for a in artifacts.values():
        rows = a.result["rows"]
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
                    entity = " / ".join(str(first[d]) for d in names) or "Hạng 1"
                    add(
                        a,
                        metric,
                        "ranking",
                        "leader",
                        {"value": v, "entity": entity},
                        f"{entity} đứng đầu xếp hạng{suffix}: {fmt(v)} {unit} theo {label.lower()}.",
                        partition,
                    )
                    if len(values) >= 2:
                        gap = abs(values[0] - values[1])
                        relative = gap / abs(values[1]) * 100 if values[1] else None
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
                            },
                            f"Chênh lệch hạng 1 và hạng 2{suffix} là {fmt(gap)} {unit}"
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
                        f"Tổng {label.lower()} của {len(values)} mục trong xếp hạng{suffix}: {fmt(total)} {unit}; đây là tổng của tập Top N đã trả về.",
                        partition,
                    )
                if a.plan.kind == "trend" and len(pairs) >= 2:
                    # Missing/null buckets are not interpolated or converted to zero.
                    first, last = values[0], values[-1]
                    change = last - first
                    pct = change / abs(first) * 100 if first else None
                    peak, trough = max(pairs, key=lambda p: p[1]), min(
                        pairs, key=lambda p: p[1]
                    )
                    x = [
                        __import__("datetime")
                        .date.fromisoformat(str(r["period"])[:10])
                        .toordinal()
                        for r, _ in pairs
                    ]
                    meanx, meany = statistics.mean(x), statistics.mean(values)
                    denominator = sum((v - meanx) ** 2 for v in x)
                    slope = (
                        sum((v - meanx) * (y - meany) for v, y in zip(x, values))
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
                            "first_period": str(pairs[0][0]["period"]),
                            "last_period": str(pairs[-1][0]["period"]),
                            "peak_period": str(peak[0]["period"]),
                            "peak": peak[1],
                            "trough_period": str(trough[0]["period"]),
                            "trough": trough[1],
                            "slope_per_day": slope,
                            "volatility": statistics.pstdev(values),
                            "observed_buckets": len(pairs),
                            "null_buckets": len(batch) - len(pairs),
                        },
                        f"{label}{suffix} thay đổi từ {fmt(first)} thành {fmt(last)} {unit} giữa hai kỳ quan sát đầu và cuối"
                        + (
                            f" ({fmt(pct)}%)."
                            if pct is not None
                            else "; kỳ đầu bằng 0 nên không tính phần trăm."
                        ),
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
                            "volatility": statistics.pstdev(values),
                        },
                        f'{label}{suffix} đạt đỉnh {fmt(peak[1])} {unit} ở {peak[0]["period"]}; thấp nhất {fmt(trough[1])} {unit} ở {trough[0]["period"]}.',
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
                        return " / ".join(str(pair[0][d]) for d in dimensions)

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
                        f"Trong {len(pairs)} nhóm quan sát đã trả về, {label.lower()} cao nhất ở {entity(largest)} ({fmt(largest[1])} {unit}), thấp nhất ở {entity(smallest)} ({fmt(smallest[1])} {unit}); chênh lệch là {fmt(largest[1]-smallest[1])} {unit}.",
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
                    entity = " / ".join(str(largest[0][d]) for d in dims)
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
                        f'Tương quan Pearson giữa {a.grounded.metrics[m1]["business_name"]} và {a.grounded.metrics[m2]["business_name"]} là {fmt(corr)} trên {len(pairs)} quan sát ghép cặp; đây là liên hệ quan sát, không chứng minh nguyên nhân.',
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
        "review_gap": ("top_gap", "population_gap"),
        "monitor_variation": ("change",),
        "review_concentration": ("concentration",),
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
    summary = " ".join(e["statement"] for e in selected[:5])
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
        "ai_insights": [e["statement"] for e in selected],
        "key_findings": [
            {
                "finding": e["statement"],
                "comment": e["statement"],
                "value": e["values"],
                "evidence_id": e["id"],
            }
            for e in selected
        ],
        "conclusions": [e["statement"] for e in selected[:3]],
        "recommendations": recommendations,
        "rejected_narrative": rejected,
    }
