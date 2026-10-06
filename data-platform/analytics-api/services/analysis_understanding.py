"""Legacy V2.1 interpretation fixtures; V2.2 uses only labelled presentation here.

Production meaning/refinement belongs to data_analyst_agent, not hints/fast_spec.
"""

from __future__ import annotations
import json
import re
from copy import deepcopy
from datetime import date, timedelta
from services.analysis_contract import AnalysisSpec, SpecPatch, TimeScope
from services.analysis_catalog import AnalysisError, normalize


def hints(prompt, catalog, reference_date=None, lookup=None, dimensions=None):
    from services.time_resolution_service import parse_time
    from services.value_grounding_service import value_hints

    text = normalize(prompt)
    config = catalog.registry["interpretation"]
    numbers = []
    for pattern in config.get("top_n_patterns", [r"\btop\s+(?P<n>\d+)\b"]):
        for match in re.finditer(pattern, text):
            number = int(match.group("n"))
            if (
                number not in numbers
                or pattern == config.get("top_n_patterns", [pattern])[0]
            ):
                numbers.append(number)
    time = parse_time(prompt, config, catalog.registry["timezone"], reference_date)
    values = value_hints(prompt, catalog, dimensions, lookup)
    # Bind only nearby, unambiguous mentions within a clause. This is lexical
    # evidence about limits, not a router or a guess about business metrics.
    from services.value_grounding_service import value_text

    ranking_mentions = []
    primary_pattern = config.get("top_n_patterns", [r"\btop\s+(?P<n>\d+)\b"])[0]
    for clause in re.split(r"[,;!?]|\.\s+", normalize(prompt)):
        clause = value_text(clause)
        # Reuse already-grounded mentions without triggering extra DB searches.
        mentions = []
        for item in values["value_mentions"]:
            phrase = value_text(prompt)[item["start"] : item["end"]]
            for match in re.finditer(
                r"(?<!\w)" + re.escape(phrase) + r"(?!\w)", clause
            ):
                mentions.append({**item, "start": match.start(), "end": match.end()})
        rank_matches = list(re.finditer(primary_pattern, clause))
        for index, match in enumerate(rank_matches):
            next_start = (
                rank_matches[index + 1].start()
                if index + 1 < len(rank_matches)
                else len(clause)
            )
            for dimension in {v["dimension"] for v in mentions}:
                distances = {}
                following = [
                    item
                    for item in mentions
                    if item["dimension"] == dimension
                    and match.end() <= item["start"] < next_start
                ]
                eligible = following or (mentions if len(rank_matches) == 1 else [])
                for item in eligible:
                    if item["dimension"] == dimension:
                        gap = max(
                            item["start"] - match.end(), match.start() - item["end"], 0
                        )
                        distances[item["value"]] = min(
                            gap, distances.get(item["value"], 999)
                        )
                ordered = sorted(distances.items(), key=lambda v: v[1])
                if len(ordered) == 1 and ordered[0][1] <= 90:
                    binding = {
                        "top_n": int(match.group("n")),
                        "dimension": dimension,
                        "value": ordered[0][0],
                    }
                    if binding not in ranking_mentions:
                        ranking_mentions.append(binding)
    return {
        **time,
        **values,
        "ranking_mentions": ranking_mentions,
        "ambiguity_signals": [
            term
            for term in config.get("ambiguous_measure_terms", [])
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
        "explicit_dates": re.findall(r"\b\d{4}-\d{2}-\d{2}\b", text),
    }


def labelled_interpretation(catalog, data=None, hint=None):
    """Public meaning is rebuilt from trusted labels, never provider prose."""
    data = data or {}
    hint = hint or {}
    registry = catalog.registry
    subject = registry["subjects"].get(data.get("subject"), {})
    metrics = list(data.get("metrics") or [])
    components = data.get("components") or []
    metrics += [
        m for c in components if isinstance(c, dict) for m in c.get("metrics", [])
    ]
    labels = lambda values, kind: [
        registry[kind][v]["business_name"] for v in values if v in registry[kind]
    ]
    filters = data.get("filters") or []
    if not filters:
        filters = hint.get("recognized_values", [])
    safe_values = {
        (v["dimension"], str(v["value"])) for v in hint.get("recognized_values", [])
    }

    def describe_filter(f):
        dimension = f.get("dimension")
        if dimension not in registry["dimensions"]:
            return None
        value = f.get("value")
        values = value if isinstance(value, list) else [value]
        if hint and any((dimension, str(v)) not in safe_values for v in values):
            return None
        return {
            "dimension": registry["dimensions"][dimension]["business_name"],
            "operator": f.get("operator", "eq"),
            "value": value,
        }

    ranking = deepcopy(data.get("ranking"))
    if ranking:
        ranking["metric"] = (
            registry["metrics"]
            .get(ranking.get("metric"), {})
            .get("business_name", "Chỉ số cần xác nhận")
        )
        ranking["per_group"] = labels(ranking.get("per_group", []), "dimensions")
    elif hint.get("top_n"):
        ranking = {
            "top_n": hint["top_n"][0],
            "metric": "Chỉ số cần xác nhận",
            "direction": "DESC",
        }
    period = hint.get("canonical_time") or data.get("time_range", {})
    if period:
        try:
            from services.analysis_catalog import resolve_period

            period = resolve_period(
                TimeScope.model_validate(period),
                (
                    date.fromisoformat(hint["reference_date"])
                    if hint.get("reference_date")
                    else None
                ),
            )
        except ValueError:
            period = {}
    return {
        "subject": subject.get("business_name", "Đối tượng cần xác nhận"),
        "analysis_kind": data.get("analysis_kind", ""),
        "metrics": [
            {
                "label": registry["metrics"][m]["business_name"],
                "unit": registry["metrics"][m]["unit"],
            }
            for m in dict.fromkeys(metrics)
            if m in registry["metrics"]
        ],
        "dimensions": labels(data.get("dimensions", []), "dimensions"),
        "filters": [
            v for v in (describe_filter(f) for f in filters if isinstance(f, dict)) if v
        ],
        "time_range": period,
        "ranking": ranking,
        "comparison_groups": [
            {
                "name": g.get("name", "Nhóm so sánh"),
                "top_n": g.get("top_n"),
                "filters": [
                    v for v in (describe_filter(f) for f in g.get("filters", [])) if v
                ],
            }
            for g in data.get("comparison_groups", [])
            if isinstance(g, dict)
        ],
        "components": [
            {
                "id": f"Phần {i+1}",
                "subject": registry["subjects"]
                .get(c.get("subject") or data.get("subject"), {})
                .get("business_name", ""),
                "filters": [
                    v for v in (describe_filter(f) for f in c.get("filters", [])) if v
                ],
                "comparison_groups": [
                    {
                        "name": g.get("name", "Nhóm so sánh"),
                        "filters": [
                            v
                            for v in (describe_filter(f) for f in g.get("filters", []))
                            if v
                        ],
                    }
                    for g in c.get("comparison_groups") or []
                ],
                "kind": c.get("kind", ""),
                "metrics": labels(c.get("metrics", []), "metrics"),
                "ranking": (
                    {
                        **c["ranking"],
                        "metric": registry["metrics"]
                        .get(c["ranking"].get("metric"), {})
                        .get("business_name", "Chỉ số cần xác nhận"),
                    }
                    if c.get("ranking")
                    else None
                ),
            }
            for i, c in enumerate(components)
            if isinstance(c, dict)
        ],
        "assumptions": hint.get("assumptions", data.get("assumptions", [])),
    }


def clarify(catalog, reason, data=None, hint=None, fields=None, choices=None):
    from services.analysis_contract import ClarificationRequest

    hint = hint or {}

    messages = {
        "metric_ambiguous": "Bạn muốn đánh giá theo chỉ số nào?",
        "subject_ambiguous": "Bạn muốn phân tích đối tượng nào?",
        "time_year_missing": "Bạn muốn xem kỳ này của năm nào?",
        "time_range_ambiguous": "Bạn muốn dùng khoảng thời gian nào cho phân tích này?",
        "time_range_invalid": "Ngày hoặc khoảng thời gian chưa hợp lệ. Bạn kiểm tra lại giúp nhé.",
        "granularity_ambiguous": "Bạn muốn tổng hợp theo ngày, tuần, tháng hay quý?",
        "filter_value_ambiguous": "Bạn muốn chọn giá trị nào cho bộ lọc này?",
        "filter_value_unknown": "Chưa tìm thấy giá trị bộ lọc trong danh mục hiện tại. Bạn kiểm tra lại tên giúp nhé.",
        "ranking_scope_ambiguous": "Bạn xác nhận số lượng Top N cho từng nhóm giúp nhé.",
        "unsupported_metric": "Chỉ số này chưa có định nghĩa trong danh mục phân tích hiện tại.",
        "unsupported_dimension": "Chiều phân tích này chưa được hỗ trợ trong danh mục hiện tại.",
        "forecast_unsupported": "Hệ thống hiện hỗ trợ phân tích dữ liệu đã có; yêu cầu dự báo chưa được hỗ trợ.",
    }
    if choices is None:
        sid = (data or {}).get("subject")
        mids = (
            catalog.registry["subjects"].get(sid, {}).get("metrics", [])
            if reason == "metric_ambiguous"
            else []
        )
        choices = [
            {
                "id": m,
                "label": catalog.registry["metrics"][m]["business_name"],
                "unit": catalog.registry["metrics"][m]["unit"],
                "description": catalog.registry["metrics"][m].get("description", ""),
                "followup": "Theo " + catalog.registry["metrics"][m]["business_name"],
            }
            for m in mids
        ]
    structured = ClarificationRequest(
        reason=reason,
        known_interpretation=labelled_interpretation(catalog, data, hint),
        missing_fields=fields or [],
        ambiguous_fields=fields or [] if reason.endswith("_ambiguous") else [],
        choices=choices[:8],
        user_message=messages.get(
            reason, "Bạn làm rõ phần còn thiếu của yêu cầu giúp nhé."
        ),
    )
    if reason == "metric_ambiguous" and not hint.get("explicit_metric_terms"):
        # A proposed metric is not known meaning when the user never selected
        # a measure. Preserve population/time/limits while showing the gap.
        structured.known_interpretation["metrics"] = []
        if structured.known_interpretation.get("ranking"):
            structured.known_interpretation["ranking"]["metric"] = "Chỉ số cần xác nhận"
    raise AnalysisError(
        reason,
        structured.user_message,
        [v.model_dump() for v in structured.choices],
        clarification=structured.model_dump(mode="json"),
    )


def spec_filters(spec):
    return (
        list(spec.filters)
        + [f for g in spec.comparison_groups for f in g.filters]
        + [f for c in spec.components for f in c.filters]
        + [
            f
            for c in spec.components
            for g in c.comparison_groups or []
            for f in g.filters
        ]
    )


def ranking_scopes(spec):
    scopes = []
    for component in spec.components or [None]:
        if component and component.kind != "ranking":
            continue
        rank = component.ranking or spec.ranking if component else spec.ranking
        if not rank:
            continue
        groups = (
            component.comparison_groups
            if component and component.comparison_groups is not None
            else spec.comparison_groups
        )
        for group in groups or [None]:
            filters = (
                list(spec.filters)
                + (list(component.filters) if component else [])
                + (list(group.filters) if group else [])
            )
            scopes.append(
                (group.top_n if group and group.top_n else rank.top_n, filters)
            )
    return scopes


def validate_ranking_bindings(spec, hint, catalog):
    scopes = ranking_scopes(spec)
    bindings = hint.get("ranking_mentions", [])

    def matches(filters, binding):
        return any(
            f.dimension == binding["dimension"]
            and (
                f.value == binding["value"]
                or isinstance(f.value, list)
                and binding["value"] in f.value
            )
            for f in filters
        )

    for binding in bindings:
        if not any(
            n == binding["top_n"] and matches(filters, binding) for n, filters in scopes
        ):
            clarify(
                catalog,
                "ranking_scope_ambiguous",
                spec.model_dump(mode="json"),
                hint,
                ["ranking", "comparison_groups"],
            )
    # When every explicit limit is clearly bound, reject populations added to
    # ranking merely because they occur in another component's comparison.
    for dimension in {b["dimension"] for b in bindings}:
        relevant = [b for b in bindings if b["dimension"] == dimension]
        if sorted(b["top_n"] for b in relevant) != sorted(hint["top_n"]):
            continue
        for n, filters in scopes:
            for f in filters:
                if f.dimension != dimension:
                    continue
                vals = f.value if isinstance(f.value, list) else [f.value]
                if any(
                    not any(b["top_n"] == n and b["value"] == v for b in relevant)
                    for v in vals
                ):
                    clarify(
                        catalog,
                        "ranking_scope_ambiguous",
                        spec.model_dump(mode="json"),
                        hint,
                        ["ranking", "comparison_groups"],
                    )


def server_evidence(spec, candidates, hint):
    subject_score = (
        candidates.get("evidence", {}).get("subject_scores", {}).get(spec.subject, 0)
    )
    metric_scores = candidates.get("evidence", {}).get("metric_scores", {})
    metric_strength = max((metric_scores.get(m, 0) for m in spec.metrics), default=0)
    signals = {
        "subject_match": min(subject_score / 8, 1),
        "metric_match": min(metric_strength / 2, 1),
        "filter_grounded": 1.0,
        "time_complete": float(not hint["time_errors"]),
        "contract_valid": 1.0,
    }
    return {
        "server_confidence": round(
            signals["subject_match"] * 0.25
            + signals["metric_match"] * 0.25
            + signals["filter_grounded"] * 0.2
            + signals["time_complete"] * 0.2
            + 0.1,
            3,
        ),
        "confidence_signals": signals,
        "model_confidence": spec.confidence,
        "reference_date": hint["reference_date"],
        "candidate_subject_count": len(candidates["subjects"]),
        "candidate_metric_count": len(candidates["metrics"]),
        "candidate_dimension_count": len(candidates["dimensions"]),
        "recognized_filter_count": len(hint["recognized_values"]),
        "recognized_time_parts": hint["recognized_time_parts"],
        "missing_fields": [],
        "ambiguity_count": 0,
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
    if hint["time_errors"] or hint["value_ambiguities"]:
        return None
    for start, end in sorted(hint.get("time_spans", []), reverse=True):
        text = text[:start] + " " + text[end:]
    text = re.sub(r"\s+", " ", text).strip()
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
            from services.value_grounding_service import (
                value_text,
                aliases_for,
                dimension_values,
            )

            term = value_text(slots["city"])
            for prefix in catalog.registry["dimensions"]["city"].get("aliases", []):
                prefix = value_text(prefix)
                if term.startswith(prefix + " "):
                    term = term[len(prefix) + 1 :]
            city = aliases_for(catalog, "city", dimension_values(catalog, "city")).get(
                term
            )
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
            time_range=hint.get("canonical_time") or {"mode": mode},
            assumptions=hint.get("assumptions", []),
            ranking={"metric": metric, "direction": "DESC", "top_n": int(slots["n"])},
        )
    return None


def apply_ui_time(spec, time_range, explicit=False, reference_date=None):
    if not time_range or time_range.mode == "auto":
        return spec
    today = reference_date or catalog_today(spec.time_range.timezone)
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


def compact_candidates(candidates):
    return {
        "subjects": {
            sid: {
                key: value
                for key, value in subject.items()
                if key
                in (
                    "business_name",
                    "description",
                    "aliases",
                    "grain",
                    "metrics",
                    "default_dimension",
                    "detail_columns",
                )
            }
            for sid, subject in candidates["subjects"].items()
        },
        "metrics": {
            mid: {
                key: value
                for key, value in metric.items()
                if key
                in (
                    "business_name",
                    "description",
                    "aliases",
                    "grain",
                    "unit",
                    "subjects",
                    "allowed_dimensions",
                )
            }
            for mid, metric in candidates["metrics"].items()
        },
        "dimensions": {
            did: {
                key: value
                for key, value in dimension.items()
                if key
                in ("business_name", "description", "aliases", "role", "identity")
            }
            for did, dimension in candidates["dimensions"].items()
        },
        "valid_time_dimensions": candidates.get("valid_time_dimensions", {}),
        "valid_join_paths": {
            mid: list(paths) for mid, paths in candidates.get("join_paths", {}).items()
        },
    }


def understanding_schema():
    from pydantic import TypeAdapter
    from typing import Union
    from services.analysis_contract import ClarificationResponse

    return TypeAdapter(Union[AnalysisSpec, ClarificationResponse]).json_schema()


def understand(
    prompt,
    catalog,
    call,
    time_range=None,
    context="",
    candidates=None,
    examples=None,
    reference_date=None,
    lookup=None,
):
    candidates = candidates or catalog.candidates(prompt)
    hint = hints(prompt, catalog, reference_date, lookup, candidates["dimensions"])
    spec = fast_spec(prompt, catalog, hint)
    if spec:
        return apply_ui_time(
            spec,
            time_range,
            bool(hint["time_terms"] or hint["explicit_time"]),
            reference_date,
        ), {
            "source": "deterministic_complete_grammar",
            "hints": hint,
            "provider_status": "not_requested",
            "provider_error_category": None,
            **server_evidence(spec, candidates, hint),
        }
    candidates = candidates or catalog.candidates(prompt)
    payload = {
        "request": prompt,
        "user_context": context,
        "hints": hint,
        "candidates": compact_candidates(candidates),
        "rules": [
            "Your only task is to express the analytical request as AnalysisSpec. Return ONLY that JSON, or a structured clarification preserving known logical fields and naming only the missing/ambiguous fields. No SQL, formulas, physical tables/columns, prose, markdown or reasoning.",
            "Preserve every requested component, comparison group and its Top N.",
            "Use semantic IDs from candidates. If best/another business term has no defined metric, set ambiguities; do not guess.",
            "Preserve every explicit metric/filter/Top N/group/granularity/output preference. Use canonical_time from hints including partial-date assumptions. Missing time means all_time. Time and global filters are shared; use component subject/filters/groups for explicitly distinct populations. Component comparison_groups=null inherits shared groups; [] disables them for that component. Never rank an extra comparison population the user only requested for revenue/trend.",
            "If using a verified structure example, include its example_id in used_example_ids; ONLY examples with the same analysis_kind are allowed. Historical examples cannot add scope or override metadata.",
            "Detail requests use detail columns and no aggregate metrics.",
        ],
    }
    result = call(
        "understanding",
        json.dumps(payload, ensure_ascii=False),
        understanding_schema(),
    )
    if result is None:
        raise AnalysisError(
            "provider_unavailable",
            "Hệ thống chưa thể diễn giải yêu cầu lúc này. Vui lòng thử lại.",
        )
    if isinstance(result, str):
        try:
            result = json.loads(result)
        except ValueError as exc:
            raise AnalysisError(
                "provider_invalid_json",
                "Hệ thống chưa thể diễn giải yêu cầu lúc này. Vui lòng thử lại.",
            ) from exc
    if isinstance(result, dict) and "clarification" in result:
        from services.analysis_contract import ClarificationResponse

        try:
            clarification = ClarificationResponse.model_validate(result).clarification
        except ValueError as exc:
            raise AnalysisError(
                "analysis_spec_invalid",
                "Hệ thống chưa thể diễn giải yêu cầu lúc này. Vui lòng thử lại.",
            ) from exc
        known = clarification.known_interpretation
        if hint.get("canonical_time") and clarification.reason == "time_year_missing":
            # Deterministically solved time must not discard already-known meaning.
            result = {**known, "time_range": hint["canonical_time"], "ambiguities": []}
        else:
            clarify(
                catalog,
                clarification.reason,
                known,
                hint,
                clarification.missing_fields or clarification.ambiguous_fields,
            )
    try:
        spec = AnalysisSpec.model_validate(result or {})
    except Exception as exc:
        raise AnalysisError(
            "analysis_spec_invalid",
            "Hệ thống chưa thể diễn giải yêu cầu lúc này. Vui lòng thử lại.",
        ) from exc
    if hint["time_errors"]:
        clarify(
            catalog,
            hint["time_errors"][0],
            spec.model_dump(mode="json"),
            hint,
            ["time_range"],
        )
    if hint["value_ambiguities"]:
        ambiguity = hint["value_ambiguities"][0]
        clarify(
            catalog,
            "filter_value_ambiguous",
            spec.model_dump(mode="json"),
            hint,
            ["filters"],
            [{"label": str(v)} for v in ambiguity["values"]],
        )
    if spec.ambiguities:
        metric_ambiguity = not spec.metrics or bool(hint["ambiguity_signals"])
        clarify(
            catalog,
            "metric_ambiguous" if metric_ambiguity else "subject_ambiguous",
            spec.model_dump(mode="json"),
            hint,
            ["metrics"] if metric_ambiguity else ["subject"],
        )
    if (
        hint["ambiguity_signals"]
        and not hint["explicit_metric_terms"]
        and not spec.ambiguities
    ):
        clarify(
            catalog, "metric_ambiguous", spec.model_dump(mode="json"), hint, ["metrics"]
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
    all_filters = spec_filters(spec)
    dimension_ids.update(f.dimension for f in all_filters)
    if spec.subject not in candidates["subjects"] or any(
        c.subject and c.subject not in candidates["subjects"] for c in spec.components
    ):
        clarify(
            catalog,
            "subject_ambiguous",
            spec.model_dump(mode="json"),
            hint,
            ["subject"],
            [
                {"id": sid, "label": v["business_name"]}
                for sid, v in candidates["subjects"].items()
            ],
        )
    if not metric_ids <= set(candidates["metrics"]):
        clarify(
            catalog,
            "unsupported_metric",
            spec.model_dump(mode="json"),
            hint,
            ["metrics"],
        )
    if not dimension_ids <= set(candidates["dimensions"]):
        clarify(
            catalog,
            "unsupported_dimension",
            spec.model_dump(mode="json"),
            hint,
            ["dimensions"],
        )
    components = spec.components or [None]
    for component in components:
        if component and component.kind == "detail":
            continue
        selected_metrics = (
            component.metrics or spec.metrics if component else spec.metrics
        )
        selected_dimensions = component.dimensions if component else spec.dimensions
        component_filters = list(spec.filters) + (
            list(component.filters) if component else []
        )
        component_groups = (
            component.comparison_groups
            if component and component.comparison_groups is not None
            else spec.comparison_groups
        )
        component_filters += [f for g in component_groups for f in g.filters]
        required_dimensions = set(
            selected_dimensions + [f.dimension for f in component_filters]
        )
        for metric in selected_metrics:
            if not required_dimensions <= set(catalog.compatible_dimensions(metric)):
                clarify(
                    catalog,
                    "unsupported_dimension",
                    spec.model_dump(mode="json"),
                    hint,
                    ["dimensions"],
                    [
                        {"label": catalog.registry["dimensions"][d]["business_name"]}
                        for d in catalog.compatible_dimensions(metric)
                    ][:8],
                )
    from services.value_grounding_service import canonical_filter

    for f in all_filters:
        values = f.value if isinstance(f.value, list) else [f.value]
        try:
            grounded = [
                canonical_filter(catalog, f.dimension, v, prompt, hint, lookup)
                for v in values
            ]
        except AnalysisError as exc:
            if exc.category == "privacy":
                raise
            clarify(
                catalog,
                exc.category,
                spec.model_dump(mode="json"),
                hint,
                ["filters"],
                exc.choices,
            )
        f.value = grounded if isinstance(f.value, list) else grounded[0]
    # Deterministic explicit constraints cannot be overwritten by model output.
    ranks = (
        [g.top_n for g in spec.comparison_groups if g.top_n]
        or [
            g.top_n
            for c in spec.components
            for g in c.comparison_groups or []
            if g.top_n
        ]
        or [c.ranking.top_n for c in spec.components if c.ranking]
        or ([spec.ranking.top_n] if spec.ranking else [])
    )
    shared_limit = (
        len(hint["top_n"]) == 1 and ranks and set(ranks) == set(hint["top_n"])
    )
    if hint["top_n"] and sorted(ranks) != sorted(hint["top_n"]) and not shared_limit:
        raise AnalysisError(
            "clarification",
            "The interpretation did not preserve all explicit Top N limits",
        )
    validate_ranking_bindings(spec, hint, catalog)
    for value in hint["recognized_values"]:
        allfilters = spec_filters(spec)
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
        not hint["recognized_time_parts"]
        and not hint["time_errors"]
        and spec.time_range.mode != "all_time"
    ):
        clarify(
            catalog,
            "time_range_ambiguous",
            spec.model_dump(mode="json"),
            hint,
            ["time_range"],
        )
    if spec.time_range.timezone != hint["timezone"]:
        clarify(
            catalog,
            "time_range_ambiguous",
            spec.model_dump(mode="json"),
            hint,
            ["time_range.timezone"],
        )
    if hint["canonical_time"]:
        expected_time = TimeScope.model_validate(hint["canonical_time"])
        if spec.time_range.mode == "all_time" and hint["assumptions"]:
            spec.time_range = expected_time
        elif spec.time_range != expected_time:
            clarify(
                catalog,
                "time_range_ambiguous",
                spec.model_dump(mode="json"),
                hint,
                ["time_range"],
            )
        spec.assumptions = list(dict.fromkeys(hint["assumptions"] + spec.assumptions))[
            :10
        ]
    if hint["granularity"]:
        spec.granularity = hint["granularity"]
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
        spec,
        time_range,
        bool(hint["time_terms"] or hint["explicit_time"]),
        reference_date,
    ), {
        "source": "structured_understanding",
        "hints": hint,
        **server_evidence(spec, candidates, hint),
    }


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


def refine_spec(spec, feedback, catalog, call, reference_date=None, lookup=None):
    hint = hints(feedback, catalog, reference_date, lookup)
    candidates = catalog.candidates(
        feedback,
        preferred_subjects=[spec.subject]
        + [c.subject for c in spec.components if c.subject],
    )
    payload = {
        "feedback": feedback,
        "current_analysis_spec": spec.model_dump(mode="json"),
        "hints": hint,
        "candidates": compact_candidates(candidates),
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
            "analysis_spec_invalid",
            "Hệ thống chưa thể diễn giải yêu cầu tinh chỉnh lúc này. Vui lòng thử lại.",
        ) from exc
    if patch.ambiguities:
        clarify(
            catalog,
            "metric_ambiguous" if hint["ambiguity_signals"] else "clarification",
            spec.model_dump(mode="json"),
            hint,
            ["metrics"] if hint["ambiguity_signals"] else ["refinement"],
        )
    try:
        updated = merge_patch(spec, patch)
    except ValueError as exc:
        raise AnalysisError(
            "analysis_spec_invalid",
            "Hệ thống chưa thể diễn giải yêu cầu tinh chỉnh lúc này. Vui lòng thử lại.",
        ) from exc
    old_metrics = set(spec.metrics) | {m for c in spec.components for m in c.metrics}
    new_metrics = set(updated.metrics) | {
        m for c in updated.components for m in c.metrics
    }
    new_metrics |= {c.ranking.metric for c in updated.components if c.ranking}
    if updated.ranking:
        new_metrics.add(updated.ranking.metric)
    if not (new_metrics - old_metrics) <= set(candidates["metrics"]):
        clarify(
            catalog,
            "unsupported_metric",
            spec.model_dump(mode="json"),
            hint,
            ["metrics"],
        )
    old_subjects = {spec.subject} | {c.subject for c in spec.components if c.subject}
    new_subjects = {updated.subject} | {
        c.subject for c in updated.components if c.subject
    }
    if not (new_subjects - old_subjects) <= set(candidates["subjects"]):
        clarify(
            catalog,
            "subject_ambiguous",
            spec.model_dump(mode="json"),
            hint,
            ["subject"],
        )

    def selected_dimensions(value):
        dimensions = set(value.dimensions + value.detail_columns)
        dimensions.update(f.dimension for f in spec_filters(value))
        if value.ranking:
            dimensions.update(value.ranking.per_group)
        for c in value.components:
            dimensions.update(c.dimensions + c.detail_columns)
            if c.ranking:
                dimensions.update(c.ranking.per_group)
        return dimensions

    if not (selected_dimensions(updated) - selected_dimensions(spec)) <= set(
        candidates["dimensions"]
    ):
        clarify(
            catalog,
            "unsupported_dimension",
            spec.model_dump(mode="json"),
            hint,
            ["dimensions"],
        )
    if hint["time_errors"]:
        clarify(
            catalog,
            hint["time_errors"][0],
            spec.model_dump(mode="json"),
            hint,
            ["time_range"],
        )
    if hint["canonical_time"] and updated.time_range != TimeScope.model_validate(
        hint["canonical_time"]
    ):
        raise AnalysisError(
            "patch", "Refinement did not preserve the requested time scope"
        )

    def limits(value):
        found = {"ranking": value.ranking.top_n} if value.ranking else {}
        found.update(
            {
                "component:" + c.id: c.ranking.top_n
                for c in value.components
                if c.ranking
            }
        )
        found.update(
            {"group:" + g.name: g.top_n for g in value.comparison_groups if g.top_n}
        )
        found.update(
            {
                "component:" + c.id + ":group:" + g.name: g.top_n
                for c in value.components
                for g in c.comparison_groups or []
                if g.top_n
            }
        )
        return found

    before, after = limits(spec), limits(updated)
    for key, limit in after.items():
        if (
            limit != before.get(key)
            and limit not in hint["top_n"]
            and not (key not in before and limit in before.values())
        ):
            raise AnalysisError(
                "patch",
                "Refinement changed a ranking limit without an explicit request",
            )
    if hint["granularity"] and updated.granularity != hint["granularity"]:
        raise AnalysisError(
            "patch", "Refinement did not preserve the requested granularity"
        )
    if updated.time_range != spec.time_range:
        updated.assumptions = [
            a for a in updated.assumptions if not a.startswith("Thời gian:")
        ] + hint["assumptions"]
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
    old_filters = spec_filters(spec)
    new_filters = spec_filters(updated)

    def effective_filters(value, component):
        groups = (
            component.comparison_groups
            if component.comparison_groups is not None
            else value.comparison_groups
        )
        return (
            list(value.filters)
            + list(component.filters)
            + [f for g in groups for f in g.filters]
        )

    old_components = {c.id: c for c in spec.components}
    removal_terms = catalog.registry["interpretation"].get("filter_removal_terms", [])
    for component in updated.components:
        if component.id not in old_components:
            continue
        before_filters = effective_filters(spec, old_components[component.id])
        after_filters = effective_filters(updated, component)
        for f in after_filters:
            if f in before_filters:
                continue
            vals = f.value if isinstance(f.value, list) else [f.value]
            if any(
                {"dimension": f.dimension, "value": v} not in hint["recognized_values"]
                and not re.search(
                    r"(?<!\w)" + re.escape(normalize(v)) + r"(?!\w)",
                    normalize(feedback),
                )
                for v in vals
            ):
                raise AnalysisError(
                    "patch", "Refinement added an unrequested component population"
                )
        for f in before_filters:
            if f in after_filters or any(
                n.dimension == f.dimension and n not in before_filters
                for n in after_filters
            ):
                continue
            if not (
                any(normalize(term) in normalize(feedback) for term in removal_terms)
                and any(
                    normalize(a) in normalize(feedback)
                    for a in catalog.registry["dimensions"][f.dimension]["aliases"]
                )
            ):
                raise AnalysisError(
                    "patch", "Refinement removed an unrequested component population"
                )
    for f in new_filters:
        if f in old_filters:
            continue
        from services.value_grounding_service import canonical_filter

        try:
            values = f.value if isinstance(f.value, list) else [f.value]
            resolved = [
                canonical_filter(catalog, f.dimension, v, feedback, hint, lookup)
                for v in values
            ]
            f.value = resolved if isinstance(f.value, list) else resolved[0]
        except AnalysisError as exc:
            clarify(
                catalog,
                exc.category,
                updated.model_dump(mode="json"),
                hint,
                ["filters"],
                exc.choices,
            )
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
        removed = [f for f in old_filters if f not in new_filters]
        replacements = {f.dimension for f in new_filters if f not in old_filters}
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
    if updated.filters == spec.filters:
        terms = catalog.registry["interpretation"].get("filter_removal_terms", [])
        for f in old_filters:
            if f in new_filters or any(
                n.dimension == f.dimension and n not in old_filters for n in new_filters
            ):
                continue
            if not (
                any(normalize(term) in normalize(feedback) for term in terms)
                and any(
                    normalize(a) in normalize(feedback)
                    for a in catalog.registry["dimensions"][f.dimension]["aliases"]
                )
            ):
                raise AnalysisError(
                    "patch",
                    "Refinement cannot silently remove a component/group population filter",
                )
    validate_ranking_bindings(updated, hint, catalog)
    return updated, patch
