"""Logical contracts: omission-preserving tool input and strict server queries."""

from typing import List, Literal, Optional
from pydantic import Field, model_validator
from pydantic_core import PydanticCustomError
from services.analysis_contract import Contract, Filter, Ranking, TimeSpec

SemanticId = str


class SortField(Contract):
    field: str = Field(pattern=r"^[a-z][a-z0-9_]{0,63}$")
    direction: Literal["ASC", "DESC"] = "ASC"


Operation = Literal["aggregate", "ranking", "trend", "distribution", "detail", "cross_tab", "relationship"]
Granularity = Literal["day", "week", "month", "quarter", "year"]


class AnalyticalFields(Contract):
    id: str = Field(pattern=r"^[a-z][a-z0-9_]{0,39}$")
    metrics: List[str] = Field(default_factory=list, max_length=6)
    group_by: List[str] = Field(default_factory=list, max_length=4)
    filters: List[Filter] = Field(default_factory=list, max_length=12)
    project: List[str] = Field(default_factory=list, max_length=12)
    time: TimeSpec = Field(
        default_factory=lambda: TimeSpec(kind="relative", mode="all_time")
    )
    order_by: List[SortField] = Field(default_factory=list, max_length=6)
    limit: int = Field(default=100, ge=1, le=100)
    role: Literal["requested", "supporting"] = "requested"
    parent_id: Optional[str] = None
    purpose: Literal["answer", "compare", "context", "relationship"] = "answer"
    population_relation: Literal["same", "related"] = "same"
    # Refinement inherits scope from this server operation unless explicitly changed.
    replaces: Optional[str] = None
    changed_fields: List[
        Literal[
            "metrics",
            "group_by",
            "filters",
            "project",
            "time",
            "granularity",
            "ranking",
            "order_by",
            "limit",
            "subject",
            "operation",
        ]
    ] = Field(default_factory=list, max_length=12)


class ToolRanking(Ranking):
    metric: Optional[str] = None


class AnalyticalToolInput(AnalyticalFields):
    """Validate field types, retaining omitted fields for normalization/patching.

    Wire-required fields are declared separately by the provider adapter. A
    partial refinement need not repeat unchanged business meaning.
    """

    subject: Optional[str] = Field(default=None, pattern=r"^[a-z][a-z0-9_]{0,63}$")
    operation: Optional[Operation] = None
    ranking: Optional[ToolRanking] = None
    granularity: Optional[Granularity] = None


class AnalyticalQuery(AnalyticalFields):
    """Canonical query: no default operation and no incomplete ranking."""

    subject: str = Field(pattern=r"^[a-z][a-z0-9_]{0,63}$")
    operation: Operation
    ranking: Optional[Ranking] = None
    granularity: Granularity = "day"

    @model_validator(mode="after")
    def logical(self):
        import re

        def fail(code, path):
            raise PydanticCustomError(code, code, {"path": path})

        ids = [(v, path) for path in ("metrics", "group_by", "project") for v in getattr(self, path)]
        ids += [(f.dimension, "filters.dimension") for f in self.filters]
        if self.ranking:
            ids += [(self.ranking.metric, "ranking.metric"), *[(v, "ranking.per_group") for v in self.ranking.per_group]]
        ids += [(v, path) for v, path in ((self.parent_id, "parent_id"), (self.replaces, "replaces")) if v is not None]
        for value, path in ids:
            if not re.fullmatch(r"[a-z][a-z0-9_]{0,63}", value):
                fail("invalid_identifier", path)
        for path in ("metrics", "group_by", "project", "changed_fields"):
            values = getattr(self, path)
            if len(values) != len(set(values)):
                fail("duplicate_field", path)
        if self.operation == "ranking" and not self.ranking:
            fail("ranking_definition_required", "ranking")
        if self.ranking and self.operation != "ranking":
            fail("ranking_operation_required", "operation")
        if self.operation == "detail" and (self.metrics or self.group_by):
            fail("detail_cannot_aggregate", "metrics")
        if self.operation == "detail" and not self.project:
            fail("projection_required", "project")
        if self.operation != "detail" and not self.metrics:
            fail("metric_required", "metrics")
        if self.operation != "detail" and self.project:
            fail("aggregate_cannot_project", "project")
        if self.operation in ("ranking", "distribution", "cross_tab", "relationship") and not self.group_by:
            fail("grouping_required", "group_by")
        if self.operation == "cross_tab" and len(self.group_by) != 2:
            fail("two_dimensions_required", "group_by")
        if self.operation == "relationship" and len(self.metrics) != 2:
            fail("paired_metrics_required", "metrics")
        if self.role == "supporting" and not self.parent_id:
            fail("supporting_parent_required", "parent_id")
        if self.population_relation == "related" and (self.role != "supporting" or self.purpose == "answer"):
            fail("scope_conflict", "population_relation")
        if self.changed_fields and not self.replaces:
            fail("replacement_reference_required", "replaces")
        return self


class SemanticSearch(Contract):
    query: str = Field(min_length=1, max_length=120)
    kind: Literal["all", "subject", "metric", "dimension"] = "all"
    offset: int = Field(default=0, ge=0, le=1000)
    limit: int = Field(default=8, ge=1, le=12)


class ConceptReference(Contract):
    kind: Literal["subject", "metric", "dimension"]
    id: str = Field(pattern=r"^[a-z][a-z0-9_]{0,63}$")
    offset: int = Field(default=0, ge=0, le=1000)
    limit: int = Field(default=12, ge=1, le=24)


class ValueReference(Contract):
    dimension: str = Field(pattern=r"^[a-z][a-z0-9_]{0,63}$")
    reference: str = Field(min_length=1, max_length=80)


class AgentClarification(Contract):
    reason: Literal[
        "metric_ambiguous",
        "subject_ambiguous",
        "time_range_ambiguous",
        "time_range_invalid",
        "filter_value_ambiguous",
        "filter_value_unknown",
        "unsupported_metric",
        "unsupported_dimension",
        "forecast_unsupported",
        "clarification",
    ]
    subject: Optional[str] = None
    known_query: Optional[dict] = None
    missing_fields: List[str] = Field(default_factory=list, max_length=12)


class DashboardVisual(Contract):
    query_id: str
    chart_type: Literal[
        "bar",
        "horizontal_bar",
        "line",
        "area",
        "multi_line",
        "donut",
        "heatmap",
        "grouped_bar",
        "stacked_bar",
        "stacked_100",
        "scatter",
        "table",
    ]
    metrics: List[str] = Field(default_factory=list, max_length=6)
    x_field: Optional[str] = None
    series_field: Optional[str] = None
    role: Literal["requested", "supporting"] = "requested"
    priority: int = Field(default=50, ge=0, le=100)
    purpose: Literal[
        "ranking", "trend", "comparison", "distribution", "relationship", "detail"
    ] = "comparison"
    compare_query_ids: List[str] = Field(default_factory=list, max_length=5)


class InsightClaim(Contract):
    evidence_id: str
    metric: str
    scope_ref: str
    claim_type: Literal[
        "ranking",
        "trend",
        "comparison",
        "distribution",
        "relationship",
        "aggregate",
        "empty",
        "detail",
    ]
    # Optional proposed prose must equal the grounded statement; rejected otherwise.
    text: Optional[str] = Field(default=None, max_length=500)


class Recommendation(Contract):
    evidence_id: str
    action: Literal[
        "review_gap",
        "monitor_variation",
        "review_concentration",
        "investigate_relationship",
    ]


class DashboardPlan(Contract):
    active_query_ids: List[str] = Field(min_length=1, max_length=8)
    visuals: List[DashboardVisual] = Field(default_factory=list, max_length=24)
    kpi_evidence_ids: List[str] = Field(default_factory=list, max_length=12)
    claims: List[InsightClaim] = Field(default_factory=list, max_length=12)
    recommendations: List[Recommendation] = Field(default_factory=list, max_length=6)
    removed_query_ids: List[str] = Field(default_factory=list, max_length=8)


class AgentState(Contract):
    goal: str = Field(max_length=8000)
    resolved_concepts: List[str] = Field(default_factory=list)
    unresolved_fields: List[str] = Field(default_factory=list, max_length=12)
    operation_refs: List[str] = Field(default_factory=list, max_length=8)
    result_refs: List[str] = Field(default_factory=list, max_length=8)
    evidence_refs: List[str] = Field(default_factory=list)
    dashboard: Optional[DashboardPlan] = None
