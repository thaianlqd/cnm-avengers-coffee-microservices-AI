"""Validate model dashboard choices against stored rows; no chart-only queries."""

from services.analyst_contract import DashboardPlan, DashboardVisual
from services.insight_service import number


PALETTE = [
    "#6366f1",
    "#10b981",
    "#f59e0b",
    "#ec4899",
    "#06b6d4",
    "#8b5cf6",
    "#ef4444",
    "#64748b",
]


def defaults(artifacts):
    visuals = []
    for id, a in artifacts.items():
        visible = [d for d in a.plan.dimensions if not d.endswith("_id")]
        for metric in a.plan.metrics:
            composition = (
                a.plan.kind == "distribution"
                and not a.plan.explicit_limit
                and a.grounded.metrics[metric].get("additive")
                and 2 <= len(a.result["rows"]) <= 8
                and all(
                    number(r.get(metric)) and r[metric] >= 0 for r in a.result["rows"]
                )
                and sum(r[metric] for r in a.result["rows"]) > 0
            )
            kind = (
                "horizontal_bar"
                if a.plan.kind == "ranking"
                else (
                    "multi_line"
                    if a.plan.kind == "trend" and len(visible) == 1
                    else (
                        "line"
                        if a.plan.kind == "trend" and not visible
                        else (
                            "heatmap"
                            if len(visible) == 2
                            else "donut" if composition else "bar"
                        )
                    )
                )
            )
            x = "period" if a.plan.kind == "trend" else visible[0] if visible else None
            if x:
                visuals.append(
                    DashboardVisual(
                        query_id=id,
                        chart_type=kind,
                        metrics=[metric],
                        x_field=x,
                        series_field=(
                            visible[0]
                            if kind == "multi_line"
                            else visible[1] if kind == "heatmap" else None
                        ),
                        role=a.query.role,
                        priority=80,
                        purpose=(
                            "ranking"
                            if a.plan.ranking
                            else (
                                "trend"
                                if a.plan.kind == "trend"
                                else (
                                    "distribution"
                                    if a.plan.kind == "distribution"
                                    else "comparison"
                                )
                            )
                        ),
                    )
                )
    scalar = [
        a
        for a in artifacts.values()
        if a.plan.kind == "aggregate"
        and not a.plan.dimensions
        and len(a.result["rows"]) == 1
    ]
    for index, a in enumerate(scalar):
        for b in scalar[index + 1 :]:
            for metric in set(a.plan.metrics) & set(b.plan.metrics):
                v = DashboardVisual(
                    query_id=a.query.id,
                    compare_query_ids=[b.query.id],
                    chart_type="bar",
                    metrics=[metric],
                    purpose="comparison",
                    priority=90,
                )
                if comparison_reason(v, artifacts) is None:
                    visuals.append(v)
    return visuals


def comparison_reason(v, artifacts):
    sources = [artifacts.get(id) for id in [v.query_id, *v.compare_query_ids]]
    if any(a is None for a in sources) or len({a.query.id for a in sources}) != len(
        sources
    ):
        return "unknown_comparison_reference"
    if (
        v.chart_type not in ("bar", "horizontal_bar")
        or len(v.metrics) != 1
        or v.x_field
        or v.series_field
    ):
        return "invalid_comparison_shape"
    first = sources[0]
    metric = v.metrics[0]
    for a in sources:
        if (
            a.plan.kind != "aggregate"
            or a.plan.dimensions
            or len(a.result["rows"]) != 1
            or metric not in a.plan.metrics
            or not number(a.result["rows"][0].get(metric))
            or a.grounded.period != first.grounded.period
            or a.query.subject != first.query.subject
        ):
            return "incompatible_comparison_scope"
    for index, a in enumerate(sources):
        for b in sources[index + 1 :]:
            if not any(
                f.dimension == g.dimension
                and f.operator in ("eq", "in")
                and g.operator in ("eq", "in")
                and set(f.value if f.operator == "in" else [f.value]).isdisjoint(
                    set(g.value if g.operator == "in" else [g.value])
                )
                for f in a.query.filters
                for g in b.query.filters
            ):
                return "overlapping_comparison_populations"
    return None


def population_label(a):
    return (
        "; ".join(
            f"{a.grounded.dimensions[f.dimension]['business_name']}: {', '.join(map(str,f.value)) if isinstance(f.value,list) else f.value}"
            for f in a.query.filters
        )
        or a.grounded.subject["business_name"]
    )


def chart_reason(v, a, max_categories, max_series):
    p = a.plan
    rows = a.result["rows"]
    fields = set(p.output_columns)
    if not rows:
        return "empty_result"
    if v.chart_type == "table":
        return None
    if not v.metrics or not set(v.metrics) <= set(p.metrics):
        return "unknown_metric"
    if (
        not v.x_field
        or v.x_field not in fields
        or v.series_field
        and v.series_field not in p.dimensions
    ):
        return "unknown_field"
    if v.x_field in p.metrics and v.chart_type != "scatter":
        return "invalid_category"
    if any(not number(r.get(m)) for m in v.metrics for r in rows):
        return "null_or_invalid_numeric"
    units = {a.grounded.metrics[m]["unit"] for m in v.metrics}
    if len(units) > 1 and v.chart_type != "scatter":
        return "mixed_units_require_linked_views"
    if len({str(r[v.x_field]) for r in rows}) > max_categories:
        return "category_budget"
    visible = [d for d in p.dimensions if not d.endswith("_id")]
    if v.chart_type in ("line", "area", "multi_line"):
        if (
            p.kind != "trend"
            or v.x_field != "period"
            or [str(r["period"]) for r in rows]
            != sorted(str(r["period"]) for r in rows)
        ):
            return "requires_ordered_time"
        if visible and (
            len(visible) != 1
            or v.series_field != visible[0]
            or v.chart_type != "multi_line"
        ):
            return "requires_partition_series"
    elif v.chart_type == "scatter":
        if (
            a.query.operation != "relationship"
            or len(v.metrics) != 2
            or v.x_field != v.metrics[0]
            or len(rows) < 3
        ):
            return "requires_paired_observations"
        if any(len({r[m] for r in rows}) < 2 for m in v.metrics):
            return "constant_observations"
    elif v.chart_type in ("heatmap", "stacked_bar", "stacked_100"):
        if (
            len(visible) != 2
            or v.x_field not in visible
            or v.series_field not in visible
            or v.x_field == v.series_field
            or len(v.metrics) != 1
            or p.ranking
        ):
            return "requires_two_dimension_complete_grid"
        if v.chart_type.startswith("stacked") and (
            p.explicit_limit
            or not a.grounded.metrics[v.metrics[0]].get("additive")
            or any(r[v.metrics[0]] < 0 for r in rows)
        ):
            return "invalid_part_to_whole"
    elif v.chart_type in ("bar", "horizontal_bar", "grouped_bar", "donut"):
        if len(visible) != 1 or v.x_field != visible[0] or v.series_field:
            return "requires_single_dimension"
    if (
        v.chart_type != "grouped_bar"
        and v.chart_type != "scatter"
        and len(v.metrics) != 1
    ):
        return "requires_single_metric"
    if v.chart_type == "donut" and (
        p.kind != "distribution"
        or p.explicit_limit
        or p.ranking
        or len(rows) > 8
        or len(rows) < 2
        or not a.grounded.metrics[v.metrics[0]].get("additive")
        or any(r[v.metrics[0]] < 0 for r in rows)
        or sum(r[v.metrics[0]] for r in rows) <= 0
    ):
        return "invalid_part_to_whole"
    if v.series_field and len({str(r[v.series_field]) for r in rows}) > max_series:
        return "series_budget"
    return None


def render(v, a, index):
    rows = a.result["rows"]
    metric = v.metrics[0]
    meta = a.grounded.metrics[metric]
    output = {
        "id": f"visual_{index+1}",
        "chart_type": v.chart_type,
        "scope_ref": a.query.id,
        "query_id": a.query.id,
        "metric": metric,
        "metrics": v.metrics,
        "unit": meta["unit"],
        "x_field": v.x_field,
        "series_field": v.series_field,
        "title": " / ".join(a.grounded.metrics[m]["business_name"] for m in v.metrics),
        "purpose": {
            "ranking": "Xếp hạng trong phạm vi đã chọn",
            "trend": "Diễn biến theo kỳ quan sát",
            "comparison": "So sánh các nhóm",
            "distribution": "Cơ cấu trong phạm vi đã chọn",
            "relationship": "Liên hệ quan sát giữa hai chỉ số",
            "detail": "Dữ liệu chi tiết",
        }[v.purpose],
        "role": a.query.role,
        "priority": v.priority,
        "cardinality": len(rows),
    }
    output["chart_type_label"] = {
        "bar": "Cột",
        "horizontal_bar": "Cột ngang",
        "grouped_bar": "Cột nhóm",
        "stacked_bar": "Cột chồng",
        "stacked_100": "Cột chồng 100%",
        "scatter": "Phân tán",
        "heatmap": "Ma trận",
        "line": "Đường",
        "area": "Xu hướng",
        "multi_line": "Đa đường",
        "donut": "Cơ cấu",
    }[v.chart_type]
    output["x_label"] = (
        "Thời gian"
        if v.x_field == "period"
        else a.grounded.dimensions.get(v.x_field, {}).get("business_name", "")
    )
    output["series_label"] = a.grounded.dimensions.get(v.series_field, {}).get(
        "business_name", ""
    )
    output["title"] += " — " + population_label(a)
    if v.chart_type == "scatter":
        output.update(
            data=[
                {
                    "x": r[v.metrics[0]],
                    "y": r[v.metrics[1]],
                    "label": " / ".join(
                        str(r[d]) for d in a.plan.dimensions if not d.endswith("_id")
                    ),
                }
                for r in rows
            ],
            x_label=a.grounded.metrics[v.metrics[0]]["business_name"],
            y_label=a.grounded.metrics[v.metrics[1]]["business_name"],
            y_unit=a.grounded.metrics[v.metrics[1]]["unit"],
        )
    elif v.chart_type == "heatmap":
        output["data"] = [
            {"x": str(r[v.x_field]), "y": str(r[v.series_field]), "value": r[metric]}
            for r in rows
        ]
    elif (
        v.chart_type in ("multi_line", "stacked_bar", "stacked_100")
        or v.chart_type == "grouped_bar"
    ):
        names = (
            list(dict.fromkeys(str(r[v.series_field]) for r in rows))
            if v.series_field
            else v.metrics
        )
        keys = {name: f"series_{i+1}" for i, name in enumerate(names)}
        indexed = {}
        for row in rows:
            record = indexed.setdefault(
                str(row[v.x_field]), {"label": str(row[v.x_field])}
            )
            if v.series_field:
                record[keys[str(row[v.series_field])]] = row[metric]
            else:
                for m in v.metrics:
                    record[keys[m]] = row[m]
        output["data"] = list(indexed.values())
        output["series"] = [
            {
                "key": keys[n],
                "label": (
                    n if v.series_field else a.grounded.metrics[n]["business_name"]
                ),
                "color": PALETTE[i % len(PALETTE)],
            }
            for i, n in enumerate(names)
        ]
        output["series_keys"] = list(keys.values())
        if v.chart_type == "stacked_100":
            for row in output["data"]:
                total = sum(row.get(k, 0) for k in keys.values())
                if total <= 0:
                    return None
                for key in keys.values():
                    if key in row:
                        row[key] = row[key] / total * 100
            output["unit"] = "%"
    else:
        output["data"] = [
            {
                "label": str(r[v.x_field]),
                "value": r[metric],
                "color": PALETTE[i % len(PALETTE)],
            }
            for i, r in enumerate(rows)
        ]
    return output


def build_dashboard(
    artifacts, evidence, plan=None, max_charts=8, max_categories=100, max_series=16
):
    proposals = list(plan.visuals) if plan and plan.visuals else defaults(artifacts)
    if plan and plan.visuals:
        represented = {(v.query_id, m) for v in proposals for m in v.metrics}
        table_only = {v.query_id for v in proposals if v.chart_type == "table"}
        proposals += [
            v
            for v in defaults(artifacts)
            if v.query_id not in table_only
            and any((v.query_id, m) not in represented for m in v.metrics)
        ]
    charts = []
    omitted = []
    seen = set()
    covered = set()
    tables = []
    # A model cannot demote a requested source by claiming its chart is supporting.
    proposals = sorted(
        proposals,
        key=lambda v: (
            all(
                artifacts[id].query.role == "supporting"
                for id in [v.query_id, *v.compare_query_ids]
                if id in artifacts
            ),
            -v.priority,
        ),
    )
    for v in proposals:
        a = artifacts.get(v.query_id)
        reason = (
            "unknown_result_reference"
            if not a
            else (
                comparison_reason(v, artifacts)
                if v.compare_query_ids
                else chart_reason(v, a, max_categories, max_series)
            )
        )
        if a and v.chart_type == "table" and reason is None:
            tables.append({"query_id": a.query.id, "role": a.query.role})
            continue
        key = (
            (
                a.signature,
                tuple(v.metrics),
                v.x_field,
                v.series_field,
                tuple(sorted(v.compare_query_ids)),
                "share" if v.chart_type in ("stacked_100", "donut") else "raw",
            )
            if a
            else None
        )
        if not reason and key in seen:
            reason = "duplicate_semantic_view"
        if not reason and len(charts) >= max_charts:
            reason = "chart_budget"
        if not reason and v.compare_query_ids:
            sources = [artifacts[id] for id in [v.query_id, *v.compare_query_ids]]
            metric = v.metrics[0]
            meta = a.grounded.metrics[metric]
            rendered = {
                "id": f"visual_{len(charts)+1}",
                "chart_type": v.chart_type,
                "chart_type_label": "So sánh phạm vi",
                "title": meta["business_name"],
                "metric": metric,
                "metrics": [metric],
                "unit": meta["unit"],
                "scope_ref": v.query_id,
                "scope_refs": [s.query.id for s in sources],
                "purpose": "So sánh các phạm vi không giao nhau trong cùng thời gian",
                "role": (
                    "requested"
                    if any(s.query.role == "requested" for s in sources)
                    else "supporting"
                ),
                "priority": v.priority,
                "data": [
                    {
                        "label": population_label(s),
                        "value": s.result["rows"][0][metric],
                        "color": PALETTE[i % len(PALETTE)],
                    }
                    for i, s in enumerate(sources)
                ],
            }
        else:
            rendered = render(v, a, len(charts)) if not reason else None
        if not reason and rendered is None:
            reason = "invalid_composition_total"
        if reason:
            omitted.append(
                {
                    "query_id": v.query_id,
                    "chart_type": v.chart_type,
                    "role": a.query.role if a else v.role,
                    "priority": v.priority,
                    "reason": reason,
                }
            )
        else:
            charts.append(rendered)
            seen.add(key)
            covered.update((a.query.id, m) for m in v.metrics)
    # Preserve every returned metric through a view or an explicit result table.
    for id, a in artifacts.items():
        tables.append(
            {
                "query_id": id,
                "role": a.query.role,
                "reason": "validated_result",
                "metrics": a.plan.metrics,
            }
        )
    cards = []
    ids = set(plan.kpi_evidence_ids) if plan and plan.kpi_evidence_ids else set()
    for e in evidence:
        if ids and e["id"] not in ids:
            continue
        field = {
            "scalar": "value",
            "top_gap": "gap",
            "selected_total": "total",
            "change": "change",
            "concentration": "largest_share_pct",
        }.get(e["feature"])
        if field and e["values"].get(field) is not None:
            cards.append(
                {
                    "label": {
                        "scalar": "Giá trị trong phạm vi",
                        "top_gap": "Chênh lệch hạng 1–2",
                        "selected_total": "Tổng của tập Top N",
                        "change": "Thay đổi giữa hai kỳ quan sát",
                        "concentration": "Tỷ trọng lớn nhất",
                    }[e["feature"]],
                    "value": e["values"][field],
                    "unit": "%" if e["feature"] == "concentration" else e["unit"],
                    "metric": e["metric"],
                    "scope_ref": e["scope_ref"],
                    "evidence_id": e["id"],
                }
            )
    return {
        "charts": charts,
        "kpi_cards": cards[:12],
        "dashboard_plan": {
            "active_query_ids": list(artifacts),
            "visuals": [v.model_dump() for v in proposals],
            "tables": tables,
            "omitted_visuals": omitted,
            "sections": [
                "Phạm vi phân tích",
                "Kết quả đã kiểm chứng",
                "Nhận định từ bằng chứng",
            ],
            "requested_chart_count": sum(c["role"] == "requested" for c in charts),
            "supporting_chart_count": sum(c["role"] == "supporting" for c in charts),
        },
        "dashboard_description": f"{len(charts)} biểu đồ, {min(len(cards),12)} chỉ số tóm tắt và bảng kết quả cho {len(artifacts)} phần phân tích đã kiểm chứng.",
    }
