"""Small deterministic hints; complex meaning is one structured model response."""

from __future__ import annotations
import json
import re
from copy import deepcopy
from datetime import date, timedelta
from services.analysis_contract import AnalysisSpec, SpecPatch, TimeScope
from services.analysis_catalog import AnalysisError, normalize


def hints(prompt, catalog):
    text = normalize(prompt)
    numbers = [int(n) for n in re.findall(r"\btop\s+(\d+)\b", text)]
    dates = re.findall(r"\b\d{4}-\d{2}-\d{2}\b", text)
    periods = [
        {"term": term, "mode": mode}
        for term, mode in catalog.registry["interpretation"]["time_aliases"].items()
        if re.search(r"(?<!\w)" + re.escape(normalize(term)) + r"(?!\w)", text)
    ]
    values = []
    for name, d in catalog.registry["dimensions"].items():
        aliases = {
            **{str(v): v for v in d.get("enum", [])},
            **d.get("value_aliases", {}),
        }
        for alias, value in aliases.items():
            if re.search(r"(?<!\w)" + re.escape(normalize(alias)) + r"(?!\w)", text):
                item = {"dimension": name, "value": value}
                if item not in values:
                    values.append(item)
    resolved = []
    occupied = []
    for item in catalog.registry["interpretation"].get("explicit_time_patterns", []):
        for match in re.finditer(item["pattern"], text):
            if any(match.start() < b and match.end() > a for a, b in occupied):
                continue
            parts = match.groupdict()
            year = int(parts["year"])
            unit = item["unit"]
            month = (
                int(parts["month"])
                if parts.get("month")
                else (int(parts["quarter"]) - 1) * 3 + 1 if parts.get("quarter") else 1
            )
            width = {"month": 1, "quarter": 3, "year": 12}[unit]
            try:
                begin = date(year, month, 1)
                offset = year * 12 + month - 1 + width
                end = date(offset // 12, offset % 12 + 1, 1) - timedelta(days=1)
            except ValueError:
                raise AnalysisError("clarification", "Invalid explicit calendar period")
            resolved.append(
                {
                    "mode": "custom",
                    "start": begin.isoformat(),
                    "end": end.isoformat(),
                    "timezone": catalog.registry["timezone"],
                }
            )
            occupied.append(match.span())
    today = catalog_today(catalog.registry["timezone"])
    for pattern in catalog.registry["interpretation"].get("rolling_day_patterns", []):
        for match in re.finditer(pattern, text):
            days = int(match.group("days"))
            if not 1 <= days <= 3660:
                raise AnalysisError(
                    "clarification", "Requested day range is outside supported bounds"
                )
            resolved.append(
                {
                    "mode": "custom",
                    "start": (today - timedelta(days=days - 1)).isoformat(),
                    "end": today.isoformat(),
                    "timezone": catalog.registry["timezone"],
                }
            )
    if len(dates) == 2:
        resolved.append(
            {
                "mode": "custom",
                "start": dates[0],
                "end": dates[1],
                "timezone": catalog.registry["timezone"],
            }
        )
    return {
        "reference_date": today.isoformat(),
        "timezone": catalog.registry["timezone"],
        "ambiguity_signals": [
            term
            for term in catalog.registry["interpretation"].get(
                "ambiguous_measure_terms", []
            )
            if re.search(r"(?<!\w)" + re.escape(normalize(term)) + r"(?!\w)", text)
        ],
        "explicit_metric_terms": [
            mid
            for mid, metric in catalog.registry["metrics"].items()
            if any(
                re.search(r"(?<!\w)" + re.escape(normalize(alias)) + r"(?!\w)", text)
                for alias in metric["aliases"]
            )
        ],
        "top_n": numbers,
        "explicit_dates": dates,
        "explicit_time": resolved,
        "time_terms": periods,
        "recognized_values": values,
    }


def _alias_id(term, registry):
    matched = [
        key
        for key, value in registry.items()
        if normalize(term) in {normalize(a) for a in value.get("aliases", [])}
    ]
    return matched[0] if len(matched) == 1 else None


def fast_spec(prompt, catalog, hint):
    text = normalize(prompt)
    for pattern in catalog.registry["interpretation"]["fast_path_grammar"].get(
        "ranking", []
    ):
        match = re.fullmatch(pattern, text)
        if not match:
            continue
        slots = match.groupdict()
        subject = _alias_id(slots["subject"], catalog.registry["subjects"])
        if not subject:
            continue
        permitted = {
            m: catalog.registry["metrics"][m]
            for m in catalog.registry["subjects"][subject]["metrics"]
        }
        metric = _alias_id(slots["metric"], permitted)
        if not metric:
            continue
        filters = []
        if slots.get("city"):
            cities = {
                normalize(k): v
                for k, v in catalog.registry["dimensions"]["city"]
                .get("value_aliases", {})
                .items()
            }
            for val in catalog.registry["dimensions"]["city"].get("enum", []):
                cities[normalize(val)] = val
            city = cities.get(normalize(slots["city"]))
            if not city:
                continue
            filters = [{"dimension": "city", "value": city}]
        mode = catalog.registry["interpretation"]["time_aliases"].get(
            slots.get("time"), "all_time"
        )
        return AnalysisSpec(
            analysis_kind="ranking",
            subject=subject,
            metrics=[metric],
            dimensions=[catalog.registry["subjects"][subject]["default_dimension"]],
            filters=filters,
            time_range={"mode": mode},
            ranking={"metric": metric, "direction": "DESC", "top_n": int(slots["n"])},
        )
    return None


def apply_ui_time(spec, time_range, explicit=False):
    if not time_range or time_range.mode == "auto":
        return spec
    today = catalog_today(spec.time_range.timezone)
    if time_range.mode == "custom":
        scope = TimeScope(mode="custom", start=time_range.start, end=time_range.end)
    elif time_range.mode == "today":
        scope = TimeScope(mode="current_day")
    else:
        scope = TimeScope(
            mode="custom",
            start=today - timedelta(days=int(time_range.mode[:-1]) - 1),
            end=today,
        )
    if explicit:
        from services.analysis_catalog import resolve_period

        if resolve_period(scope, today) != resolve_period(spec.time_range, today):
            raise AnalysisError(
                "clarification",
                "The selected UI time range conflicts with the explicit question; choose auto or revise the question",
            )
        return spec
    return spec.model_copy(update={"time_range": scope})


def catalog_today(timezone):
    from datetime import datetime
    from zoneinfo import ZoneInfo

    return datetime.now(ZoneInfo(timezone)).date()


def understand(
    prompt, catalog, call, time_range=None, context="", candidates=None, examples=None
):
    hint = hints(prompt, catalog)
    spec = fast_spec(prompt, catalog, hint)
    if spec:
        return apply_ui_time(
            spec, time_range, bool(hint["time_terms"] or hint["explicit_time"])
        ), {"source": "deterministic_complete_grammar", "hints": hint}
    candidates = candidates or catalog.candidates(prompt)
    payload = {
        "request": prompt,
        "user_context": context,
        "hints": hint,
        "candidates": candidates,
        "rules": [
            "Return ONLY AnalysisSpec JSON. No SQL, tables, columns, markdown or reasoning.",
            "Preserve every requested component, comparison group and its Top N.",
            "Use semantic IDs from candidates. If best/another business term has no defined metric, set ambiguities; do not guess.",
            "Use only explicit scope. Missing time means all_time. Filters/time apply to all components.",
            "If using a verified structure example, include its example_id in used_example_ids; ONLY examples with the same analysis_kind are allowed. Historical examples cannot add scope or override metadata.",
            "Detail requests use detail columns and no aggregate metrics.",
        ],
    }
    result = call(
        "understanding",
        json.dumps(payload, ensure_ascii=False),
        AnalysisSpec.model_json_schema(),
    )
    try:
        spec = AnalysisSpec.model_validate(result or {})
    except Exception as exc:
        raise AnalysisError(
            "clarification",
            "Please specify the analytical subject, metric, and scope",
            list(candidates["metrics"]),
        ) from exc
    if (
        hint["ambiguity_signals"]
        and not hint["explicit_metric_terms"]
        and not spec.ambiguities
    ):
        subject = catalog.registry["subjects"].get(spec.subject, {})
        raise AnalysisError(
            "clarification",
            "Choose the metric that defines the requested ranking",
            [
                {
                    "id": mid,
                    "label": catalog.registry["metrics"][mid]["business_name"],
                    "unit": catalog.registry["metrics"][mid]["unit"],
                }
                for mid in subject.get("metrics", [])
            ],
        )
    examples_by_id = {example["example_id"]: example for example in examples or []}
    if any(
        example_id not in examples_by_id
        or examples_by_id[example_id]["analysis_spec"]["analysis_kind"]
        != spec.analysis_kind
        for example_id in spec.used_example_ids
    ):
        raise AnalysisError(
            "clarification",
            "Historical examples must match the current analysis kind and schema",
        )
    metric_ids = set(spec.metrics)
    dimension_ids = set(spec.dimensions + spec.detail_columns)
    for comp in spec.components:
        metric_ids.update(comp.metrics)
        dimension_ids.update(comp.dimensions + comp.detail_columns)
        if comp.ranking:
            metric_ids.add(comp.ranking.metric)
            dimension_ids.update(comp.ranking.per_group)
    if spec.ranking:
        metric_ids.add(spec.ranking.metric)
        dimension_ids.update(spec.ranking.per_group)
    all_filters = spec.filters + [
        f for group in spec.comparison_groups for f in group.filters
    ]
    dimension_ids.update(f.dimension for f in all_filters)
    if (
        spec.subject not in candidates["subjects"]
        or not metric_ids <= set(candidates["metrics"])
        or not dimension_ids <= set(candidates["dimensions"])
    ):
        raise AnalysisError(
            "clarification",
            "Interpretation selected a concept outside retrieved metadata candidates",
        )
    for f in all_filters:
        values = f.value if isinstance(f.value, list) else [f.value]
        for value in values:
            if {"dimension": f.dimension, "value": value} not in hint[
                "recognized_values"
            ] and not re.search(
                r"(?<!\w)" + re.escape(normalize(value)) + r"(?!\w)", normalize(prompt)
            ):
                raise AnalysisError(
                    "clarification",
                    "Interpretation introduced a filter value absent from the request",
                )
    # Deterministic explicit constraints cannot be overwritten by model output.
    ranks = (
        [g.top_n for g in spec.comparison_groups if g.top_n]
        or [c.ranking.top_n for c in spec.components if c.ranking]
        or ([spec.ranking.top_n] if spec.ranking else [])
    )
    if hint["top_n"] and sorted(ranks) != sorted(hint["top_n"]):
        raise AnalysisError(
            "clarification",
            "The interpretation did not preserve all explicit Top N limits",
        )
    for value in hint["recognized_values"]:
        allfilters = spec.filters + [
            f for g in spec.comparison_groups for f in g.filters
        ]
        if not any(
            f.dimension == value["dimension"]
            and (
                value["value"] == f.value
                or isinstance(f.value, list)
                and value["value"] in f.value
            )
            for f in allfilters
        ):
            raise AnalysisError(
                "clarification",
                "The interpretation omitted an explicit population filter",
            )
    if (
        len(hint["time_terms"]) == 1
        and spec.time_range.mode != hint["time_terms"][0]["mode"]
    ):
        raise AnalysisError(
            "clarification", "The interpretation changed the explicit time period"
        )
    if len(hint["explicit_time"]) > 1:
        raise AnalysisError(
            "clarification",
            "Please clarify which single calendar scope applies to the analysis",
        )
    if (
        len(hint["explicit_time"]) == 1
        and spec.time_range.model_dump(mode="json") != hint["explicit_time"][0]
    ):
        raise AnalysisError(
            "clarification", "The interpretation changed the explicit calendar scope"
        )
    if len(hint["explicit_dates"]) == 2 and (
        str(spec.time_range.start),
        str(spec.time_range.end),
    ) != tuple(hint["explicit_dates"]):
        raise AnalysisError(
            "clarification", "The interpretation changed explicit date bounds"
        )
    return apply_ui_time(
        spec, time_range, bool(hint["time_terms"] or hint["explicit_time"])
    ), {"source": "structured_understanding", "hints": hint}


PATCH_FIELDS = {
    "metrics",
    "dimensions",
    "filters",
    "time_range",
    "granularity",
    "ranking",
    "requested_visualizations",
    "requested_output",
    "detail_level",
    "detail_columns",
    "analysis_kind",
    "components",
    "comparison_groups",
    "subject",
}


def merge_patch(spec, patch: SpecPatch):
    if patch.ambiguities:
        raise AnalysisError("clarification", "Please clarify the refinement")
    data = deepcopy(spec.model_dump(mode="json"))
    seen = set()
    for op in patch.operations:
        parts = op.path.strip("/").split("/")
        if parts[0] not in PATCH_FIELDS or any(
            p in ("__proto__", "__class__") for p in parts
        ):
            raise AnalysisError("patch", "Unsupported patch path")
        if op.path in seen or any(
            op.path.startswith(p + "/") or p.startswith(op.path + "/") for p in seen
        ):
            raise AnalysisError("patch", "Overlapping patch paths")
        seen.add(op.path)
        parent = data
        try:
            for part in parts[:-1]:
                parent = parent[int(part)] if isinstance(parent, list) else parent[part]
            key = int(parts[-1]) if isinstance(parent, list) else parts[-1]
            if isinstance(parent, dict) and key not in parent:
                raise KeyError(key)
            parent[key] = op.value
        except (IndexError, KeyError, TypeError, ValueError) as exc:
            raise AnalysisError("patch", "Invalid patch path") from exc
    return AnalysisSpec.model_validate(data)


def refine_spec(spec, feedback, catalog, call):
    hint = hints(feedback, catalog)
    payload = {
        "feedback": feedback,
        "current_analysis_spec": spec.model_dump(mode="json"),
        "hints": hint,
        "candidates": catalog.candidates(feedback),
        "rules": [
            "Return ONLY SpecPatch JSON. Change only explicitly requested paths; preserve all other fields.",
            "Use paths like /ranking/top_n or /requested_visualizations. Never output SQL.",
            "If a new component is requested, preserve existing components and inherited filters/time.",
        ],
    }
    result = call(
        "patch", json.dumps(payload, ensure_ascii=False), SpecPatch.model_json_schema()
    )
    try:
        patch = SpecPatch.model_validate(result or {})
    except Exception as exc:
        raise AnalysisError(
            "clarification", "Please make the refinement more specific"
        ) from exc
    updated = merge_patch(spec, patch)
    if updated.time_range != spec.time_range:
        if (
            len(hint["time_terms"]) == 1
            and updated.time_range.mode != hint["time_terms"][0]["mode"]
        ):
            raise AnalysisError(
                "patch", "Refinement changed the requested calendar period"
            )
        if (
            len(hint["explicit_time"]) == 1
            and updated.time_range.model_dump(mode="json") != hint["explicit_time"][0]
        ):
            raise AnalysisError("patch", "Refinement changed explicit calendar bounds")
    if updated.time_range != spec.time_range and not (
        hint["time_terms"] or hint["explicit_dates"] or hint["explicit_time"]
    ):
        raise AnalysisError(
            "patch", "Refinement cannot change time without an explicit time request"
        )
    if updated.ranking != spec.ranking and updated.ranking and spec.ranking:
        if (
            updated.ranking.top_n != spec.ranking.top_n
            and updated.ranking.top_n not in hint["top_n"]
        ):
            raise AnalysisError(
                "patch",
                "Refinement cannot change Top N without an explicit requested limit",
            )
    old_filters = spec.filters + [
        f for group in spec.comparison_groups for f in group.filters
    ]
    new_filters = updated.filters + [
        f for group in updated.comparison_groups for f in group.filters
    ]
    for f in new_filters:
        if f in old_filters:
            continue
        values = f.value if isinstance(f.value, list) else [f.value]
        for value in values:
            if {"dimension": f.dimension, "value": value} not in hint[
                "recognized_values"
            ] and not re.search(
                r"(?<!\w)" + re.escape(normalize(value)) + r"(?!\w)",
                normalize(feedback),
            ):
                raise AnalysisError(
                    "patch", "New comparison/filter values must be explicitly requested"
                )
    if updated.filters != spec.filters:
        for f in updated.filters:
            if f not in spec.filters:
                vals = f.value if isinstance(f.value, list) else [f.value]
                if any(
                    not re.search(
                        r"(?<!\w)" + re.escape(normalize(v)) + r"(?!\w)",
                        normalize(feedback),
                    )
                    and {"dimension": f.dimension, "value": v}
                    not in hint["recognized_values"]
                    for v in vals
                ):
                    raise AnalysisError(
                        "patch", "Changed filter values require an explicit request"
                    )
        # A provider cannot silently remove an existing population constraint.
        removed = [f for f in spec.filters if f not in updated.filters]
        replacements = {f.dimension for f in updated.filters if f not in spec.filters}
        terms = catalog.registry["interpretation"].get("filter_removal_terms", [])
        for f in removed:
            if f.dimension in replacements:
                continue
            # Moving an existing global filter into the preserved first group
            # is required when adding an explicitly requested comparison group.
            if (
                updated.comparison_groups != spec.comparison_groups
                and any(f in group.filters for group in updated.comparison_groups)
                and any(
                    v["dimension"] == f.dimension and v["value"] != f.value
                    for v in hint["recognized_values"]
                )
            ):
                continue
            authorized = any(
                normalize(term) in normalize(feedback) for term in terms
            ) and any(
                normalize(a) in normalize(feedback)
                for a in catalog.registry["dimensions"][f.dimension]["aliases"]
            )
            if not authorized:
                raise AnalysisError(
                    "clarification",
                    "Specify which existing population filter to remove",
                )
    return updated, patch
