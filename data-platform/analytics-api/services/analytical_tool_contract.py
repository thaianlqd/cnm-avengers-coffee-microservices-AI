"""Structural normalization and bounded, value-free model repair feedback.

This module never receives a user prompt, SQL or provider metadata.
"""

import hashlib
import json
from copy import deepcopy
from pydantic import ValidationError
from services.analysis_catalog import AnalysisError
from services.analyst_contract import AnalyticalQuery, AnalyticalToolInput


ISSUE_CODES = frozenset({
    "field_required", "invalid_enum", "invalid_type", "unexpected_field",
    "invalid_range", "invalid_limit", "invalid_identifier", "duplicate_field",
    "invalid_time_shape", "invalid_filter_shape", "invalid_analysis_shape",
    "ranking_operation_required", "ranking_definition_required", "metric_required",
    "detail_cannot_aggregate", "projection_required", "aggregate_cannot_project",
    "grouping_required", "two_dimensions_required", "paired_metrics_required",
    "supporting_parent_required", "replacement_reference_required",
    "replacement_field_required", "unknown_reference", "concept_not_discovered",
    "unsupported_subject", "unsupported_metric", "unsupported_dimension",
    "incompatible_metric_population", "scope_conflict", "filter_value_unresolved",
    "unsafe_relationship", "sensitive_field", "contract_rejected", "batch_aborted",
})
PATH_FIELDS = frozenset({
    *AnalyticalToolInput.model_fields, "metric", "direction", "top_n", "per_group",
    "dimension", "operator", "value", "field", "kind", "mode", "year", "month",
    "quarter", "day", "start", "end", "amount", "unit", "active_query_ids",
    "visuals", "query_id", "chart_type", "x_field", "series_field", "priority",
    "compare_query_ids", "kpi_evidence_ids", "claims", "recommendations",
    "removed_query_ids", "reason", "known_query", "missing_fields", "query",
    "offset", "reference", "contract", "batch",
})


def safe_path(parts):
    """Unknown keys (including malicious extra keys) never become error paths."""
    if isinstance(parts, str):
        parts = parts.split(".")
    return ".".join(
        str(p) if type(p) is int and 0 <= p <= 100 else p if p in PATH_FIELDS else "field"
        for p in parts[:5]
    ) or "contract"


def issue(path, code):
    return {"path": safe_path(path), "code": code if code in ISSUE_CODES else "contract_rejected"}


class ToolContractError(AnalysisError):
    def __init__(self, issues):
        super().__init__("invalid_analysis_contract", "Invalid analytical tool contract")
        self.issues = issues[:8]


def structural_payload(arguments):
    """Only recover redundant structure already explicitly represented."""
    data = deepcopy(arguments)
    rules = []
    ranking = data.get("ranking")
    if isinstance(ranking, dict):
        if "operation" not in data:
            data["operation"] = "ranking"
            rules.append("ranking_operation_from_definition")
        metrics = data.get("metrics")
        if "metric" not in ranking and isinstance(metrics, list) and len(metrics) == 1:
            ranking["metric"] = metrics[0]
            rules.append("ranking_metric_from_single_selection")
    return data, rules


def canonicalize(arguments, previous=None):
    boundary = AnalyticalToolInput.model_validate(arguments)
    # exclude_unset preserves explicit nulls/values while retaining omission.
    data = boundary.model_dump(mode="json", exclude_unset=True)
    if boundary.replaces:
        old = (previous or {}).get(boundary.replaces)
        if old is None:
            raise ToolContractError([issue("replaces", "unknown_reference")])
        missing = [f for f in boundary.changed_fields if f not in boundary.model_fields_set]
        if missing:
            raise ToolContractError([issue(f, "replacement_field_required") for f in missing])
        stored = old.query.model_dump(mode="json")
        for field in (
            "subject", "operation", "metrics", "group_by", "filters", "project",
            "time", "granularity", "ranking", "order_by", "limit",
        ):
            if field not in boundary.changed_fields:
                data[field] = stored[field]
        for field in ("role", "parent_id", "purpose"):
            if field not in boundary.model_fields_set:
                data[field] = stored[field]
            elif field in ("role", "parent_id") and data[field] != stored[field]:
                raise ToolContractError([issue(field, "scope_conflict")])
    data, rules = structural_payload(data)
    time = data.get("time")
    if isinstance(time, dict):
        allowed = {"relative": {"mode"}, "rolling": {"amount", "unit"}, "range": {"start", "end"}, "year": {"year"}, "month": {"month", "year"}, "quarter": {"quarter", "year"}, "day": {"day", "month", "year"}}[time["kind"]]
        if any(k != "kind" and v is not None and k not in allowed for k, v in time.items()):
            raise ToolContractError([issue("time", "invalid_time_shape")])
    if "purpose" not in data and data.get("role") == "supporting":
        data["purpose"] = "context"
    if data.get("operation") == "trend" and "granularity" not in data:
        raise ToolContractError([issue("granularity", "field_required")])
    return AnalyticalQuery.model_validate(data), rules


def rejection_issues(error):
    if isinstance(error, ToolContractError):
        return deepcopy(error.issues)
    if isinstance(error, ValidationError):
        output = []
        for err in error.errors(include_url=False, include_input=False, include_context=True)[:8]:
            kind = err["type"]
            path = safe_path(err["loc"])
            if kind in ISSUE_CODES:
                path = safe_path(err.get("ctx", {}).get("path", err["loc"]))
                code = kind
            elif kind == "missing":
                code = "field_required"
            elif kind == "literal_error":
                code = "invalid_enum"
            elif kind == "string_pattern_mismatch":
                code = "invalid_identifier"
            elif kind == "extra_forbidden":
                code = "unexpected_field"
            elif path.startswith("time"):
                code = "invalid_time_shape"
            elif path.startswith("filters"):
                code = "invalid_filter_shape"
            elif path == "limit":
                code = "invalid_limit"
            elif kind in {"greater_than_equal", "less_than_equal", "too_long", "too_short"}:
                code = "invalid_range"
            else:
                code = "invalid_type"
            entry = issue(path, code)
            if entry not in output:
                output.append(entry)
        return output
    category = getattr(error, "category", "")
    mapped = {
        "unsupported_subject": ("subject", "unsupported_subject"),
        "unsupported_metric": ("metrics", "unsupported_metric"),
        "unsupported_dimension": ("group_by", "unsupported_dimension"),
        "metric_scope": ("metrics", "incompatible_metric_population"),
        "filter_value_unknown": ("filters.value", "filter_value_unresolved"),
        "query_scope": ("filters", "scope_conflict"),
        "time_range_ambiguous": ("time", "scope_conflict"),
        "time_range_invalid": ("time", "invalid_time_shape"),
        "privacy": ("project", "sensitive_field"),
        "unsupported": ("contract", "unsafe_relationship"),
        "patch": ("replaces", "unknown_reference"),
        "dashboard_contract": ("active_query_ids", "unknown_reference"),
    }
    return [issue(*mapped.get(category, ("contract", "invalid_analysis_shape")))]


def invalid_signature(name, arguments):
    """Internal digest only; no values or opaque continuation enter diagnostics.

    Ignore arbitrary call/query IDs and normalize order-insensitive selections.
    Keep value digests so a changed population does not become a false duplicate.
    """
    data, _ = structural_payload(arguments)
    data.pop("id", None)
    for field in ("metrics", "group_by", "project", "changed_fields", "active_query_ids"):
        if isinstance(data.get(field), list):
            data[field] = sorted(data[field], key=lambda v: json.dumps(v, sort_keys=True))
    if isinstance(data.get("filters"), list):
        for f in data["filters"]:
            if isinstance(f, dict) and "value" in f:
                value = f["value"]
                if f.get("operator") == "in" and isinstance(value, list):
                    value = sorted(value, key=lambda v: json.dumps(v, sort_keys=True))
                f["value"] = hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()
        data["filters"] = sorted(data["filters"], key=lambda v: json.dumps(v, sort_keys=True))
    return hashlib.sha256(json.dumps([name, data], sort_keys=True, ensure_ascii=False).encode()).hexdigest()
