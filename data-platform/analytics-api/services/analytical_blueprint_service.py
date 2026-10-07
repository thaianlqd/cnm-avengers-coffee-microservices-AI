"""Metadata-selected intent → logical shape. No question parsing or SQL."""

from copy import deepcopy
from typing import List, Literal, Optional
from pydantic import Field, model_validator
from services.analysis_contract import Contract
from services.analyst_contract import Operation, Granularity
from services.analysis_catalog import AnalysisError
from services.analytical_tool_contract import ToolContractError, issue


class AnalyticalBlueprint(Contract):
    subject: str
    default_operation: Operation
    allowed_operations: List[Operation] = Field(min_length=1, max_length=7)
    allowed_metric_refs: List[str] = Field(min_length=1, max_length=6)
    required_metric_refs: List[str] = Field(default_factory=list, max_length=6)
    default_metric_refs: List[str] = Field(default_factory=list, max_length=6)
    required_grouping: List[str] = Field(default_factory=list, max_length=4)
    default_grouping: Optional[List[str]] = Field(default=None, max_length=4)
    allowed_groupings: List[List[str]] = Field(default_factory=list, max_length=16)
    cross_tab_grouping_refs: List[str] = Field(default_factory=list, max_length=12)
    requires_historical_data: bool = False
    allowed_granularities: List[Granularity] = Field(default_factory=list, max_length=5)
    default_granularity: Optional[Granularity] = None
    ranking_default_direction: Literal["ASC", "DESC"] = "DESC"
    ranking_default_top_n: Optional[int] = Field(default=None, ge=1, le=100)
    requires_complete_population: bool = False
    population_group: Literal["metric_defined"] = "metric_defined"
    related_domain_refs: List[str] = Field(default_factory=list, max_length=12)
    critical_caveats: List[str] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def shape(self):
        if self.default_operation not in self.allowed_operations:
            raise ValueError("Invalid default operation")
        if not set(self.required_metric_refs + self.default_metric_refs) <= set(self.allowed_metric_refs):
            raise ValueError("Invalid default metrics")
        if any(len(g) > 4 or len(g) != len(set(g)) for g in self.allowed_groupings):
            raise ValueError("Invalid grouping")
        if self.default_grouping is not None and self.default_grouping not in self.allowed_groupings:
            raise ValueError("Invalid default grouping")
        if self.required_grouping and any(not set(self.required_grouping) <= set(g) for g in self.allowed_groupings):
            raise ValueError("Missing required grouping")
        if self.default_granularity and self.default_granularity not in self.allowed_granularities:
            raise ValueError("Invalid default granularity")
        if self.requires_historical_data and self.default_operation != "trend":
            raise ValueError("Historical lens must describe a trend")
        return self


def validate_blueprint(blueprint, lens, profile, registry):
    b = blueprint
    if b.subject not in profile.primary_subjects or not set(b.allowed_metric_refs) <= set(lens.metric_refs):
        raise ValueError("Blueprint subject/metric unavailable")
    if not set(b.allowed_metric_refs) <= set(registry["subjects"][b.subject]["metrics"]):
        raise ValueError("Blueprint subject incompatible")
    if any(not set(g) <= set(lens.dimension_refs) for g in b.allowed_groupings):
        raise ValueError("Blueprint dimension unavailable")
    if not set(b.cross_tab_grouping_refs) <= set(lens.dimension_refs) or "cross_tab" in b.allowed_operations and (not lens.supports_comparison or len(b.cross_tab_grouping_refs) < 2):
        raise ValueError("Invalid cross-tab grouping")
    for operation, flag in (("trend", lens.supports_time_series), ("ranking", lens.supports_ranking), ("distribution", lens.supports_distribution)):
        if operation in b.allowed_operations and not flag:
            raise ValueError("Blueprint capability incompatible")
    if "trend" in b.allowed_operations and (not b.allowed_granularities or any(not registry["metrics"][m].get("time_column") for m in b.allowed_metric_refs)):
        raise ValueError("Blueprint history unavailable")
    if not set(b.related_domain_refs) <= registry["domain_intelligence"]["profiles"].keys() or not set(b.critical_caveats) <= registry["domain_intelligence"]["caveat_labels"].keys():
        raise ValueError("Blueprint reference unavailable")


def wire_blueprint(b):
    # Column grammar is declared once; IDs/labels/allowed metrics are in lenses.
    return [b["default_operation"], b["default_metric_refs"], b["default_grouping"],
            b["allowed_groupings"], b["default_granularity"],
            "".join(c for c, flag in (("h", b["requires_historical_data"]), ("p", b["requires_complete_population"]), ("x", bool(b.get("cross_tab_grouping_refs")))) if flag), b["allowed_operations"], b["allowed_granularities"], b["required_metric_refs"]]


class BlueprintIssue(AnalysisError):
    def __init__(self, catalog, profile, lens, missing):
        super().__init__("blueprint_ambiguous", "Lens requires an explicit business choice")
        self.known = [profile["business_label"], lens["business_label"]]
        self.missing = missing
        if missing == "granularity":
            labels = {"day":"Ngày","week":"Tuần","month":"Tháng","quarter":"Quý","year":"Năm"}
            self.choices = [{"label":labels[g],"followup":"Phân tích theo " + labels[g].lower()} for g in lens["blueprint"]["allowed_granularities"]]
            return
        if missing == "ranking":
            self.choices = []
            return
        refs = lens["blueprint"]["allowed_metric_refs"] if missing == "metrics" else sorted({d for g in lens["blueprint"]["allowed_groupings"] for d in g})
        kind = "metrics" if missing == "metrics" else "dimensions"
        self.choices = [{"label": catalog.registry[kind][id]["business_name"], "followup": "Sử dụng " + catalog.registry[kind][id]["business_name"]} for id in refs]


def materialize(raw, catalog, intelligence, previous=None, context=None):
    data = deepcopy(raw)
    rules = []
    domain = data.pop("domain", None)
    lens_id = data.get("lens_id")
    if not lens_id:
        if domain is not None:
            raise ToolContractError([issue("lens_id", "field_required")])
        return data, rules
    profiles = intelligence.available()
    matches = [(p, l) for p in profiles.values() for l in p["analytical_lenses"]
               if l["id"] == lens_id and (domain is None or p["domain_id"] == domain)
               and (data.get("subject") is None or data["subject"] in p["primary_subjects"])]
    if len(matches) != 1:
        raise ToolContractError([issue("lens_id", "unknown_reference")])
    profile, lens = matches[0]
    b = lens.get("blueprint")
    if not b:  # Legacy/test-only profiles may retain explicit operation grammar.
        return data, rules
    old = (previous or {}).get(data.get("replaces"))
    changed = data.get("changed_fields", [])
    def missing(field):
        return field not in data and (not old or field in changed)
    if missing("subject"):
        data["subject"] = b["subject"]; rules.append("lens_default_subject")
    if missing("operation"):
        data["operation"] = "ranking" if data.get("ranking") and "ranking" in b["allowed_operations"] else b["default_operation"]; rules.append("lens_default_operation")
    if missing("metrics"):
        if not b["default_metric_refs"]:
            raise BlueprintIssue(catalog, profile, lens, "metrics")
        data["metrics"] = b["default_metric_refs"]; rules.append("lens_default_metric")
    operation = data.get("operation", old.query.operation if old else None)
    if operation not in b["allowed_operations"]:
        if operation == "trend" and any(not catalog.registry["metrics"][m].get("time_column") for m in b["allowed_metric_refs"]):
            raise historical_issue(profile)
        raise ToolContractError([issue("operation", "lens_operation_incompatible")])
    if missing("group_by"):
        grouping = b["required_grouping"] or b["default_grouping"]
        # A trend can deliberately aggregate over time without an entity series.
        if operation == "trend" and [] in b["allowed_groupings"] and not b["required_grouping"]:
            grouping = []
        if grouping is None:
            raise BlueprintIssue(catalog, profile, lens, "group_by")
        data["group_by"] = grouping
        rules.append("lens_required_grouping" if b["required_grouping"] else "lens_default_grouping")
    if operation == "trend" and missing("granularity"):
        if not b["default_granularity"]:
            raise BlueprintIssue(catalog, profile, lens, "granularity")
        data["granularity"] = b["default_granularity"]; rules.append("lens_default_granularity")
    if operation == "ranking" and missing("ranking"):
        if not b["ranking_default_top_n"]:
            raise BlueprintIssue(catalog, profile, lens, "ranking")
        data["ranking"] = {"top_n": b["ranking_default_top_n"]}; rules.append("lens_default_ranking")
    if operation == "ranking" and isinstance(data.get("ranking"), dict) and "direction" not in data["ranking"]:
        data["ranking"]["direction"] = b["ranking_default_direction"]; rules.append("lens_default_ranking_direction")
    return data, rules


def validate_materialized(query, lens):
    b = lens.get("blueprint")
    if not b:
        return
    if query.subject != b["subject"] or query.operation not in b["allowed_operations"]:
        raise ToolContractError([issue("operation", "lens_operation_incompatible")])
    if not set(b["required_metric_refs"]) <= set(query.metrics) or not set(query.metrics) <= set(b["allowed_metric_refs"]):
        raise ToolContractError([issue("metrics", "lens_metric_incompatible")])
    if query.group_by not in b["allowed_groupings"] and not (query.operation == "cross_tab" and len(query.group_by) == 2 and set(query.group_by) <= set(b.get("cross_tab_grouping_refs", [])) and set(b["required_grouping"]) <= set(query.group_by)):
        raise ToolContractError([issue("group_by", "lens_grouping_incompatible")])
    if query.operation == "trend" and query.granularity not in b["allowed_granularities"]:
        raise ToolContractError([issue("granularity", "lens_granularity_incompatible")])
    if query.operation == "distribution" and b["requires_complete_population"] and (query.ranking or query.model_fields_set & {"limit", "order_by"} and (query.limit != 100 or query.order_by)):
        raise ToolContractError([issue("limit", "lens_complete_population_required")])


def historical_issue(profile):
    error = AnalysisError("historical_metric_unavailable", "Lens has no historical observations")
    error.known = [profile["business_label"]]
    error.choices = [{"label":"Xem hiện trạng: " + l["business_label"],
        "followup":"Phân tích hiện trạng " + profile["business_label"] + ": " + l["business_label"] + ", toàn bộ thời gian", "time_override":{"mode":"all_time"}}
        for l in profile["analytical_lenses"] if not (l.get("blueprint") or {}).get("requires_historical_data")]
    return error
