"""Validate model dashboard choices against stored rows; no chart-only queries."""

from services.analyst_contract import DashboardPlan, DashboardVisual
from services.insight_service import number, trend_bucket_coverage
from services.business_labels import dimension_labeler
import hashlib
import json


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


def paired_aggregate(a):
    """Complement volume comparisons with an average from the same entity rows."""
    visible = [d for d in a.plan.dimensions if not d.endswith("_id")]
    if a.plan.kind != "aggregate" or a.plan.ranking or a.plan.explicit_limit or len(visible) != 1:
        return None
    totals = [m for m in a.plan.metrics if a.grounded.metrics[m].get("additive")]
    averages = [m for m in a.plan.metrics if a.grounded.metrics[m].get("aggregation_semantics") == "average"]
    return [totals[0], averages[0]] if totals and averages else None


def defaults(artifacts):
    visuals = []
    for id, a in artifacts.items():
        visible = [d for d in a.plan.dimensions if not d.endswith("_id")] or list(a.plan.dimensions)
        if a.query.operation == "relationship" and len(a.plan.metrics) == 2:
            candidate = DashboardVisual(query_id=id, chart_type="scatter", metrics=a.plan.metrics, x_field=a.plan.metrics[0], role=a.query.role, priority=80, purpose="relationship")
            if chart_reason(candidate, a, 100, 16) in (None, 'chart_point_budget'):
                visuals.append(candidate)
            continue
        same_unit = (len(a.plan.metrics) > 1
            and len({a.grounded.metrics[m]["unit"] for m in a.plan.metrics}) == 1
            and len({a.grounded.metrics[m].get("aggregation_semantics") == "average" for m in a.plan.metrics}) == 1)
        if same_unit and len(visible) == 1 and not a.plan.ranking and a.plan.kind != "trend":
            visuals.append(DashboardVisual(query_id=id, chart_type="grouped_bar", metrics=a.plan.metrics, x_field=visible[0], role=a.query.role, priority=80, purpose="comparison"))
            continue
        if same_unit and a.plan.kind == "trend" and not visible:
            visuals.append(DashboardVisual(query_id=id, chart_type="multi_line", metrics=a.plan.metrics, x_field="period", role=a.query.role, priority=80, purpose="trend"))
            continue
        for metric in a.plan.metrics:
            composition = (
                a.plan.kind == "distribution"
                and len(visible) == 1
                and not a.plan.ranking
                and not a.plan.explicit_limit
                and a.grounded.metrics[metric].get("additive")
                and (2 <= len(a.result["rows"]) if a.plan.kind == "distribution" else 3 <= len(a.result["rows"]) <= 6)
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
                            ("area" if a.grounded.metrics[metric].get("additive") and a.grounded.metrics[metric].get("non_negative") else "line")
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
            if kind == "bar" and len(visible) == 1 and any(len(str(r.get(x))) > 18 for r in a.result["rows"]):
                kind = "horizontal_bar"
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
    for id, a in artifacts.items():
        pair = paired_aggregate(a)
        if pair:
            candidate = DashboardVisual(query_id=id, chart_type="scatter", metrics=pair, x_field=pair[0], role=a.query.role, priority=60, purpose="relationship")
            if chart_reason(candidate, a, 100, 16) in (None, 'chart_point_budget'):
                visuals.append(candidate)
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


def category_preview(v, a, max_categories):
    """A labelled display subset; complete analytical rows remain authoritative."""
    visible = [d for d in a.plan.dimensions if not d.endswith("_id")] or list(a.plan.dimensions)
    display=dimension_labeler(a.plan.dimensions,a.result['rows'],a.grounded.dimensions)
    return (
        a.plan.kind in {"aggregate", "distribution"}
        and not a.plan.ranking and not a.plan.explicit_limit
        and v.chart_type in {"bar", "horizontal_bar", "grouped_bar"}
        and len(visible) == 1 and v.x_field == visible[0] and not v.series_field
        and len({display(r,v.x_field) for r in a.result["rows"]}) > max_categories
    )


def chart_reason(v, a, max_categories, max_series):
    p = a.plan
    rows, _ = presentation_rows(v, a, max_categories, max_series)
    fields = set(p.output_columns)
    display=dimension_labeler(p.dimensions,rows,a.grounded.dimensions)
    if not rows:
        return "empty_result"
    if v.chart_type == "table":
        return None
    from services.analytical_capacity_planner import AnalyticalCapacityContract
    displayed_rows = min(len(rows), max_categories) if category_preview(v, a, max_categories) else len(rows)
    if displayed_rows*(1 if v.chart_type=='scatter' else max(1,len(v.metrics))) > AnalyticalCapacityContract.from_env().chart_points:
        return 'chart_point_budget'
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
    if len({display(r,v.x_field) for r in rows}) > max_categories and v.chart_type not in {"donut", "scatter"} and not category_preview(v, a, max_categories):
        return "category_budget"
    visible = [d for d in p.dimensions if not d.endswith("_id")] or list(p.dimensions)
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
            (a.query.operation != "relationship" and v.metrics != paired_aggregate(a))
            or len(v.metrics) != 2
            or v.x_field != v.metrics[0]
            or len(rows) < 3
            or not p.dimensions
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
        and not (v.chart_type == "multi_line" and not visible and not v.series_field)
        and len(v.metrics) != 1
    ):
        return "requires_single_metric"
    if v.chart_type == "donut" and (
        p.kind not in {"aggregate", "distribution"}
        or p.explicit_limit
        or p.ranking
        or len(rows) < 2
        or not a.grounded.metrics[v.metrics[0]].get("additive")
        or any(r[v.metrics[0]] < 0 for r in rows)
        or sum(r[v.metrics[0]] for r in rows) <= 0
    ):
        return "invalid_part_to_whole"
    if v.series_field and len({display(r,v.series_field) for r in rows}) > max_series:
        return "series_budget"
    return None


def render(v, a, index, max_categories=100):
    rows, subset = presentation_rows(v, a, max_categories, 16)
    display=dimension_labeler(a.plan.dimensions,rows,a.grounded.dimensions)
    population_count = len(a.result['rows'])
    metric = v.metrics[0]
    preview = category_preview(v, a, max_categories)
    if preview:
        rows = sorted(rows, key=lambda r: (-r[metric], tuple(str(r.get(d)) for d in a.plan.dimensions)))[:min(20, max_categories)]
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
    # Shared physical metric definitions may have different domain aliases.
    # A display equivalence key includes their full population and query shape.
    identity = [
        a.plan.source, a.plan.joins,
        [a.grounded.metrics[m]["expression"] for m in v.metrics],
        [a.grounded.metrics[m].get("business_filters", []) for m in v.metrics],
        [a.grounded.metrics[m].get("required_non_null", []) for m in v.metrics],
        a.plan.dimensions, [f.model_dump(mode="json") for f in a.plan.filters],
        a.plan.time_column, a.plan.period, a.plan.granularity, a.plan.ranking.model_dump(mode="json") if a.plan.ranking else None,
        a.plan.row_limit, a.plan.explicit_limit, v.x_field, v.series_field,
        "share" if v.chart_type in {"donut", "stacked_100"} else "raw",
    ]
    output["semantic_view_key"] = hashlib.sha256(json.dumps(identity, sort_keys=True, default=str).encode()).hexdigest()
    output["series_label"] = a.grounded.dimensions.get(v.series_field, {}).get(
        "business_name", ""
    )
    if a.plan.ranking:
        output.update(ranking_metric=a.plan.ranking.metric,
            ranking_metric_label=a.grounded.metrics[a.plan.ranking.metric]['business_name'],
            ranking_direction=a.plan.ranking.direction,ranking_limit=a.plan.ranking.top_n)
        output["title"] = f"Top {a.plan.ranking.top_n} — " + output["title"]
        if metric != a.plan.ranking.metric:
            output["title"] += " trong tập xếp hạng theo " + a.grounded.metrics[a.plan.ranking.metric]["business_name"]
    elif a.plan.kind == "trend":
        output["title"] += " theo " + {"day": "ngày", "week": "tuần", "month": "tháng", "quarter": "quý", "year": "năm"}[a.plan.granularity]
    output["title"] += " — " + population_label(a)
    output.update(selection="Top N" if a.plan.ranking else "limited" if a.plan.explicit_limit else "complete", layout="wide" if v.chart_type in ("line", "area", "multi_line", "heatmap", "scatter") else "standard")
    if a.plan.kind == "trend":
        output.update(granularity=a.plan.granularity, period=a.grounded.period)
        partial = sum(trend_bucket_coverage(r["period"], a.plan.granularity, a.grounded.period)["partial"] for r in rows)
        if partial:
            output["time_note"] = "Kỳ đầu hoặc cuối chưa đủ ngày trong phạm vi đã chọn. Chỉ so sánh biến động khi có ít nhất hai kỳ đầy đủ; biểu đồ vẫn giữ mọi kỳ."
    if preview:
        output.update(selection="display_subset", population_count=population_count,
                      displayed_count=len(rows), selection_metric=metric)
        output["title"] += f" — {len(rows)}/{population_count} nhóm có {meta['business_name'].lower()} cao nhất"
        output["purpose"] = "Hiển thị một phần các nhóm; bảng kết quả và số liệu phân tích dùng toàn bộ phạm vi."
    if subset:
        output.update(selection='display_subset', population_count=population_count, full_population_count=population_count,
                      displayed_count=len(rows), selection_metric=metric,
                      capacity_note=f'Hiển thị {len(rows)}/{population_count} nhóm; số liệu phân tích dùng toàn bộ dữ liệu.')
    if v.chart_type == "scatter":
        output.update(
            title=" / ".join(a.grounded.metrics[m]["business_name"] for m in v.metrics) + " — " + population_label(a),
            observation_label=" / ".join(a.grounded.dimensions[d]["business_name"] for d in a.plan.dimensions if not d.endswith("_id")),
            population_count=len(rows),
            data=[
                {
                    "x": r[v.metrics[0]],
                    "y": r[v.metrics[1]],
                    "label": " / ".join(
                        display(r,d) for d in a.plan.dimensions if not d.endswith("_id")
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
            {"x": display(r,v.x_field), "y": display(r,v.series_field), "value": r[metric]}
            for r in rows
        ]
    elif (
        v.chart_type in ("multi_line", "stacked_bar", "stacked_100")
        or v.chart_type == "grouped_bar"
    ):
        names = (
            list(dict.fromkeys(display(r,v.series_field) for r in rows))
            if v.series_field
            else v.metrics
        )
        keys = {name: f"series_{i+1}" for i, name in enumerate(names)}
        indexed = {}
        for row in rows:
            record = indexed.setdefault(
                display(row,v.x_field), {"label": display(row,v.x_field)}
            )
            if v.series_field:
                record[keys[display(row,v.series_field)]] = row[metric]
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
                "label": display(r,v.x_field),
                "value": r[metric],
                "color": PALETTE[i % len(PALETTE)],
            }
            for i, r in enumerate(rows)
        ]
        if v.chart_type == "donut" and len(rows) > 8:
            ordered = sorted(output["data"], key=lambda r: (-r["value"], r["label"]))
            tail = ordered[6:]
            noun = "danh mục" if v.x_field == "category" else "nhóm"
            output["data"] = [{**r, "color": PALETTE[i]} for i,r in enumerate(ordered[:6])] + [{"label": f"Khác ({len(tail)} {noun})", "value": sum(r["value"] for r in tail), "color": "#94a3b8"}]
            output.update(grouped_categories=len(tail), population_count=len(rows))
    return output


def build_dashboard(
    artifacts, evidence, plan=None, max_charts=8, max_categories=100, max_series=16, catalog=None
):
    proposals = list(plan.visuals) if plan and plan.visuals else defaults(artifacts)
    if plan and plan.visuals:
        represented = {
            (v.query_id, m) for v in proposals for m in v.metrics
            if v.query_id in artifacts and (
                comparison_reason(v, artifacts) if v.compare_query_ids
                else chart_reason(v, artifacts[v.query_id], max_categories, max_series)
            ) is None
        }
        table_only = {v.query_id for v in proposals if v.chart_type == "table"}
        proposals += [
            v
            for v in defaults(artifacts)
            if v.query_id not in table_only
            and any((v.query_id, m) not in represented for m in v.metrics)
        ]
    charts = []
    omitted = []
    seen = {}
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
            {"ranking": 0, "aggregate": 1, "trend": 2, "distribution": 3,
             "cross_tab": 3, "relationship": 4, "detail": 5}.get(
                artifacts[v.query_id].query.operation if v.query_id in artifacts else "", 6),
            -v.priority,
        ),
    )
    # Ensure each requested question has a first eligible view before assigning
    # extra views to a multi-metric result. Keep comparisons and semantic dedup.
    first, extra, encountered = [], [], set()
    for v in proposals:
        artifact = artifacts.get(v.query_id)
        reason = comparison_reason(v, artifacts) if v.compare_query_ids else chart_reason(v, artifact, max_categories, max_series) if artifact else "unknown_result_reference"
        if artifact and artifact.query.role == "requested" and v.chart_type != "table" and reason is None and v.query_id not in encountered:
            first.append(v); encountered.add(v.query_id)
        else:
            extra.append(v)
    proposals = first + extra
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
        preview = render(v, a, len(charts), max_categories) if not reason and not v.compare_query_ids else None
        key = ("physical_view", preview["semantic_view_key"]) if preview else (
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
            existing = seen[key]
            existing["scope_refs"] = list(dict.fromkeys([*existing.get("scope_refs", [existing["scope_ref"]]), v.query_id, *v.compare_query_ids]))
            covered.update((a.query.id, m) for m in v.metrics)
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
            rendered = preview if not reason else None
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
            seen[key] = rendered
            covered.update((a.query.id, m) for m in v.metrics)
    # Requested derived meaning gets a distinct verified view. Reuse the exact
    # full-population denominator already executed; never add chart-only SQL.
    from services.derived_chart_service import contribution_charts
    for derived in contribution_charts(artifacts,evidence):
        if len(charts)>=max_charts:
            omitted.append(dict(query_id=derived['query_id'],chart_type=derived['chart_type'],role=derived['role'],priority=70,reason='chart_budget'))
            continue
        derived['id']=f'visual_{len(charts)+1}'
        charts.append(derived)
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
    domain_groups = []
    story_sections = []
    if catalog is not None:
        from services.domain_intelligence_service import DomainIntelligence
        intelligence = DomainIntelligence(catalog)
        sections = {"ranking": "So sánh và xếp hạng", "aggregate": "Quy mô và đối chiếu", "trend": "Diễn biến theo thời gian", "distribution": "Cơ cấu đóng góp", "cross_tab": "Chẩn đoán theo các nhóm", "relationship": "Liên hệ quan sát"}
        for chart in charts:
            a = artifacts.get(chart.get("query_id") or chart.get("scope_ref"))
            if not a:
                continue
            profile = intelligence.domain_for(a.query.subject)
            if not profile:
                continue
            lens = next((l for l in profile["analytical_lenses"] if l["id"] == a.query.lens_id), None)
            section = sections['distribution'] if chart.get('value_transform')=='contribution_share' else sections["relationship"] if chart["chart_type"] == "scatter" else sections.get(a.query.operation, "Kết quả chi tiết")
            chart.update(domain_id=profile["domain_id"], domain_label=profile["business_label"], lens_id=a.query.lens_id, lens_label=lens["business_label"] if lens else None, story_section=section)
            if lens and not chart.get('value_transform'):
                chart["purpose"] = lens["business_question"]
            group = next((g for g in domain_groups if g["domain_id"] == profile["domain_id"]), None)
            if group is None:
                group = {"domain_id": profile["domain_id"], "label": profile["business_label"], "chart_ids": [], "query_ids": []}
                domain_groups.append(group)
            group["chart_ids"].append(chart["id"])
            if a.query.id not in group["query_ids"]:
                group["query_ids"].append(a.query.id)
            key = (profile["domain_id"], section, chart["role"])
            item = next((s for s in story_sections if (s["domain_id"], s["label"], s["role"]) == key), None)
            if item is None:
                item = {"domain_id": key[0], "label": section, "role": key[2], "chart_ids": []}
                story_sections.append(item)
            item["chart_ids"].append(chart["id"])
    return {
        "charts": charts,
        "kpi_cards": cards[:12],
        "dashboard_plan": {
            "domain_groups": domain_groups,
            "story_sections": story_sections,
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
            "quality": {
                "distinct_operations": len({ref for c in charts for ref in c.get("scope_refs", [c.get("query_id")]) if ref}),
                "distinct_purposes": len({c["purpose"] for c in charts}),
                "chart_families": list(dict.fromkeys(c["chart_type"] for c in charts)),
                "metrics_visualized": len(covered),
                "duplicates_omitted": sum(v["reason"] == "duplicate_semantic_view" for v in omitted),
            },
        },
        "dashboard_description": f"{len(charts)} biểu đồ, {min(len(cards),12)} chỉ số tóm tắt và bảng kết quả cho {len(artifacts)} phần phân tích đã kiểm chứng.",
    }


def presentation_rows(v, a, max_categories=100, max_series=16):
    """Exact series selection for browsing; no subset feeds business evidence.

    Entire periods are retained for each selected series. Non-additive metrics
    never rank series by summing averages. Dense shapes use a paged table.
    """
    rows = a.result['rows']
    from services.analytical_capacity_planner import AnalyticalCapacityContract
    c = AnalyticalCapacityContract.from_env()
    if a.plan.kind != 'trend' or not v.series_field or not v.metrics:
        return rows, False
    metric = v.metrics[0]
    if not a.grounded.metrics.get(metric, {}).get('additive'):
        return rows, False
    periods = len({str(r.get('period')) for r in rows})
    allowed = min(max_series, c.series, c.chart_points//max(1,periods*len(v.metrics)))
    if not allowed:
        return rows, False
    # Canonical identity distinguishes duplicate series labels.
    desc = a.grounded.dimensions.get(v.series_field, {})
    identity = desc.get('identity') or v.series_field
    totals = {}
    for row in rows:
        if not number(row.get(metric)):
            return rows, False
        key = (str(row.get(identity)), str(row.get(v.series_field)))
        totals[key] = totals.get(key, 0)+row[metric]
    if len(totals) <= allowed:
        return rows, False
    selected = set(sorted(totals, key=lambda k:(-totals[k],k))[:allowed])
    return [r for r in rows if (str(r.get(identity)),str(r.get(v.series_field))) in selected], True
