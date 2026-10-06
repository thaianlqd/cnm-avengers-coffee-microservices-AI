"""Catalog-backed clarification presentation shared by planning boundaries."""

from services.analysis_catalog import AnalysisError
from services.analyst_contract import AgentClarification
from services.analytical_tool_contract import ToolContractError, issue, canonicalize


class UnresolvedFilter(ToolContractError):
    """Keep optional omissions value-free; requested work asks for confirmation."""
    def __init__(self, dimension, resolution):
        super().__init__([issue("filters.value", "filter_value_unresolved")])
        self.dimension = dimension
        self.resolution = resolution


def clarify_filter(planner, error, raw):
    # Validate the full structural contract before classifying this as a
    # semantic clarification. A refinement retains its approved scope/Top N.
    from services.analyst_decision import DecisionOperation
    try:
        operation = DecisionOperation.model_validate(raw)
        query, _ = canonicalize(operation.internal("requested", planner.queries.previous), planner.queries.previous, planner.queries.parent_replacements)
        known = query.model_dump(mode="json")
    except (ValueError, TypeError, KeyError) as invalid:
        planner.fail_contract(invalid)
    definition = planner.catalog.registry["dimensions"][error.dimension]
    reason = "filter_value_ambiguous" if error.resolution["status"] == "ambiguous" else "filter_value_unknown"
    choices = [{"label": v["label"], "followup": "Bộ lọc " + definition["business_name"] + ": dùng " + v["label"] + " thay cho giá trị chưa xác định."}
               for v in error.resolution.get("choices", [])[:8]
               if type(v.get("value")) in (str, int, bool) and len(v["label"]) <= 100]
    planner.diagnostics.update(agent_contract_status="valid", agent_contract_error=None,
                               semantic_status="clarification", contract_issues=error.issues,
                               clarification_dimension=error.dimension)
    try:
        clarify_decision(planner, {"reason": reason, "known_query": known, "missing_fields": ["filters"]}, choices=choices)
    except AnalysisError as clarification:
        if clarification.clarification:
            message = "Bạn xác nhận giá trị cho bộ lọc " + definition["business_name"] + " giúp nhé."
            clarification.clarification["user_message"] = message
        raise


def clarify_decision(planner, arguments, *, choices=None):
    from services.analysis_understanding import clarify

    arg = AgentClarification.model_validate(arguments)
    known = arg.known_query or {}
    # Only actual catalog labels cross the public boundary; partial meaning survives.
    subject = arg.subject or known.get("subject")
    if subject and subject not in planner.catalog.registry["subjects"]:
        raise AnalysisError(
            "analysis_spec_invalid", "Unknown clarification subject"
        )
    data = {
        "subject": subject,
        "analysis_kind": known.get("operation", ""),
        "metrics": known.get("metrics", []),
        "dimensions": known.get("group_by", []),
        "filters": known.get("filters", []),
        "ranking": known.get("ranking"),
    }
    from services.analysis_contract import Filter, Ranking
    from services.value_grounding_service import dimension_values

    missing = [f for f in arg.missing_fields if f in {"subject", "operation", "metrics", "dimensions", "group_by", "filters", "ranking", "ranking.top_n", "time", "granularity", "detail_fields"}]
    if data["analysis_kind"] not in {"aggregate", "ranking", "trend", "distribution", "detail", "cross_tab", "relationship", ""}:
        data["analysis_kind"] = ""
        missing.append("operation")
    for field, kind in (("metrics", "metrics"), ("dimensions", "dimensions")):
        raw = data[field]
        if not isinstance(raw, list):
            data[field] = []
            missing.append(field)
        else:
            data[field] = [
                v
                for v in raw
                if isinstance(v, str) and v in planner.catalog.registry[kind]
            ]
    if data["ranking"]:
        try:
            data["ranking"] = Ranking.model_validate(data["ranking"]).model_dump(
                mode="json"
            )
        except ValueError:
            data["ranking"] = None
            missing.append("ranking")
    safe_filters = []
    raw_filters = data["filters"] if isinstance(data["filters"], list) else []
    for raw in raw_filters:
        try:
            f = Filter.model_validate(raw)
        except ValueError:
            missing.append("filters")
            continue
        definition = planner.catalog.registry["dimensions"].get(f.dimension)
        if not definition:
            continue
        planner.catalog.check_column(definition["table"], definition["column"])
        values = f.value if isinstance(f.value, list) else [f.value]
        allowed = dimension_values(planner.catalog, f.dimension)
        if all(
            v in allowed
            or v in planner.semantic.resolved.get(f.dimension, set())
            or definition.get("value_grounding", {}).get("mode") == "literal"
            and type(v) in (int, float, bool)
            for v in values
        ):
            safe_filters.append(f.model_dump(mode="json"))
    data["filters"] = safe_filters
    if known.get("time"):
        from services.time_resolution_service import resolve_time

        try:
            scope, assumptions, _ = resolve_time(
                known["time"], planner.reference, planner.catalog.registry["timezone"]
            )
            data.update(
                time_range=scope.model_dump(mode="json"), assumptions=assumptions
            )
        except (ValueError, AnalysisError):
            missing.append("time")
    # The metric ambiguity helper rebuilds choices from this actual subject.
    if arg.reason == "metric_ambiguous" and subject:
        choices = []
        needed = set(data["dimensions"]) | {f["dimension"] for f in data["filters"]}
        for metric in planner.catalog.registry["subjects"][subject]["metrics"]:
            try:
                planner.semantic.describe("metric", metric)
                if not needed <= set(planner.catalog.compatible_dimensions(metric)):
                    continue
            except AnalysisError:
                continue
            meta = planner.catalog.registry["metrics"][metric]
            choices.append(
                {
                    "id": metric,
                    "label": meta["business_name"],
                    "unit": meta["unit"],
                    "followup": "Theo " + meta["business_name"],
                }
            )
    clarify(
        planner.catalog,
        arg.reason,
        data,
        fields=list(dict.fromkeys(missing))[:12],
        choices=choices,
    )
