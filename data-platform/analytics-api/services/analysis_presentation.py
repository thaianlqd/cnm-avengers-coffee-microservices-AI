"""Visualizations and facts sourced exclusively from contracted result rows."""

from __future__ import annotations
from datetime import date, datetime
from decimal import Decimal
from services.analysis_contract import VisualizationSpec, ValidationResult


def primitive(v):
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    return v


def safe_rows(rows):
    return [{k: primitive(v) for k, v in row.items()} for row in rows]


def choose_visualizations(plan, result, grounded, catalog):
    rows = result["rows"]
    spec = grounded.analysis_spec
    if plan.ranking and plan.ranking.per_group:
        groups = {}
        for row in rows:
            key = tuple(row[d] for d in plan.ranking.per_group)
            groups.setdefault(key, []).append(row)
        visuals = []
        for index, (key, batch) in enumerate(groups.items()):
            projected = plan.model_copy(
                update={
                    "dimensions": [
                        d for d in plan.dimensions if d not in plan.ranking.per_group
                    ],
                    "ranking": plan.ranking.model_copy(update={"per_group": []}),
                }
            )
            for visual in choose_visualizations(
                projected, {**result, "rows": batch}, grounded, catalog
            ):
                visuals.append(
                    visual.model_copy(
                        update={
                            "id": visual.id + "_group" + str(index + 1),
                            "title": visual.title
                            + " — "
                            + ", ".join(str(v) for v in key),
                            "row_selector": dict(zip(plan.ranking.per_group, key)),
                        }
                    )
                )
        return visuals
    if not rows or "chart" not in spec.requested_output:
        return []
    metrics = plan.metrics
    if not metrics:
        return [
            VisualizationSpec(
                id=plan.id + "_table",
                query_id=plan.id,
                scope_ref=plan.id,
                chart_type="table",
                title="Chi tiết",
                cardinality=len(rows),
            )
        ]
    visible = [d for d in plan.dimensions if not d.endswith("_id")]
    metric = metrics[0]
    unit = grounded.metrics[metric]["unit"]
    title = grounded.metrics[metric]["business_name"]
    if any(row.get(metric) is None or row[metric] < 0 for row in rows):
        return []
    default = (
        "horizontal_bar"
        if plan.kind == "ranking"
        else (
            "line"
            if plan.kind == "trend"
            else "heatmap" if plan.kind == "heatmap" else "bar" if visible else "table"
        )
    )
    types = spec.requested_visualizations or [default]
    visuals = []
    for kind in types:
        if kind == "table":
            continue
        x = "period" if plan.kind == "trend" else visible[0] if visible else None
        series = visible[0] if plan.kind == "trend" and visible else None
        if kind in ("line", "area", "multi_line") and plan.kind != "trend":
            continue
        if plan.kind == "trend" and visible:
            kind = "multi_line"
            if (
                len(visible) != 1
                or len({str(r.get(series)) for r in rows})
                > catalog.registry["max_series"]
            ):
                continue
        if kind == "donut":
            # A ranking is a selected subset, not a population composition.
            if (
                not grounded.metrics[metric].get("additive", False)
                or plan.kind != "distribution"
                or len(visible) != 1
                or not 2 <= len(rows) <= 8
                or any(r[metric] is None or r[metric] < 0 for r in rows)
                or sum(r[metric] for r in rows) <= 0
            ):
                continue
        if kind == "heatmap":
            if len(visible) != 2 or any(
                len({str(r.get(d)) for r in rows}) > catalog.registry["max_categories"]
                for d in visible
            ):
                continue
            series = visible[1]
        if not x:
            continue
        if kind in ("bar", "horizontal_bar", "donut") and len(visible) != 1:
            continue
        visuals.append(
            VisualizationSpec(
                id=plan.id + "_" + str(len(visuals) + 1),
                query_id=plan.id,
                scope_ref=plan.id,
                chart_type=kind,
                title=title + (f" — {plan.group}" if plan.group else ""),
                metric=metric,
                unit=unit,
                x_field=x,
                y_field=metric,
                series_field=series,
                sort=(
                    "time"
                    if plan.kind == "trend"
                    else plan.ranking.direction if plan.ranking else "none"
                ),
                cardinality=len(rows),
                composition=kind == "donut",
            )
        )
    return visuals


def validate_chart(visual, plan, result, grounded, catalog):
    valid = visual in choose_visualizations(plan, result, grounded, catalog)
    return ValidationResult(
        valid=valid,
        category="visualization_contract",
        errors=(
            [] if valid else ["Chart does not match canonical rows/shape/scope/units"]
        ),
    )


def render_chart(visual, result):
    rows = safe_rows(
        [
            row
            for row in result["rows"]
            if all(row.get(key) == value for key, value in visual.row_selector.items())
        ]
    )
    kind = visual.chart_type
    if kind == "table":
        return None
    if kind == "multi_line":
        # Existing UI expects wide rows with dynamic series keys. Do not invent
        # zero observations for missing time/category pairs.
        names = list(dict.fromkeys(str(r[visual.series_field]) for r in rows))
        # Series keys use generated IDs; arbitrary category labels never become
        # object keys such as __proto__ or collide with the period label.
        keys = {name: "series_" + str(i + 1) for i, name in enumerate(names)}
        indexed = {}
        for row in rows:
            label = str(row[visual.x_field])
            record = indexed.setdefault(label, {"label": label})
            record[keys[str(row[visual.series_field])]] = row[visual.y_field]
        data = list(indexed.values())
        series = [
            {
                "key": keys[name],
                "label": name,
                "color": [
                    "#6366f1",
                    "#10b981",
                    "#f59e0b",
                    "#ec4899",
                    "#06b6d4",
                    "#8b5cf6",
                    "#ef4444",
                    "#64748b",
                ][i],
            }
            for i, name in enumerate(names)
        ]
    elif kind == "heatmap":
        data = [
            {
                "x": str(r[visual.x_field]),
                "y": str(r[visual.series_field]),
                "value": r[visual.y_field],
            }
            for r in rows
        ]
        series = []
    else:
        data = [
            {"label": str(r[visual.x_field]), "value": r[visual.y_field]} for r in rows
        ]
        series = []
    return {
        **visual.model_dump(),
        "data": data,
        "series": series,
        "description": "Cùng phạm vi và dữ liệu đã được kiểm chứng với bảng kết quả.",
        "width": "half",
    }


def grounded_facts(plans, results, grounded):
    evidence = []
    for plan in plans:
        rows = safe_rows(results[plan.id]["rows"])
        if not rows:
            evidence.append(
                {
                    "id": plan.id + "_empty",
                    "query_id": plan.id,
                    "row": None,
                    "field": None,
                    "value": None,
                    "statement": "Không có dữ liệu trong phạm vi yêu cầu"
                    + (f" ({plan.group})" if plan.group else "")
                    + ".",
                }
            )
            continue
        evidence.append(
            {
                "id": plan.id + "_rows",
                "query_id": plan.id,
                "row": None,
                "field": "returned_rows",
                "value": len(rows),
                "statement": f"{plan.group or plan.id}: trả về {len(rows)} dòng đã kiểm chứng.",
            }
        )
        if plan.kind == "detail":
            continue
        row = rows[0]
        labels = ", ".join(
            str(row[d]) for d in plan.dimensions if d in row and not d.endswith("_id")
        )
        if "period" in row:
            labels = ", ".join(filter(None, [str(row["period"]), labels]))
        for mid in plan.metrics:
            value = row[mid]
            metric = grounded.metrics[mid]
            statement = f"{plan.group+': ' if plan.group else ''}{labels+': ' if labels else ''}{metric['business_name']} = {value if value is not None else 'không có giá trị'} {metric['unit'] if value is not None else ''}."
            evidence.append(
                {
                    "id": plan.id + "_" + mid,
                    "query_id": plan.id,
                    "row": 0,
                    "field": mid,
                    "value": value,
                    "statement": statement,
                }
            )
    return evidence
