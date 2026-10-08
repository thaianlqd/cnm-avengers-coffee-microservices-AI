"""Public analytical meaning, independent of SQL and physical database names."""

from datetime import date
import math
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


# (required fields, optional fields). Share this grammar between the model-facing
# declaration and local validation; each kind has a different complete shape.
TIME_SHAPES = {
    "relative": (("mode",), ()),
    "month": (("month",), ("year",)),
    "quarter": (("quarter",), ("year",)),
    "year": (("year",), ()),
    "day": (("month", "day"), ("year",)),
    "range": (("start", "end"), ()),
    "rolling": (("amount", "unit"), ()),
}


class TimeSpec(Contract):
    """Intermediate calendar meaning; never passed to the SQL compiler."""

    kind: Literal["relative", "month", "quarter", "year", "day", "range", "rolling"]
    mode: Optional[str] = None
    year: Optional[int] = Field(default=None, ge=1, le=9998)
    month: Optional[int] = Field(default=None, ge=1, le=12)
    quarter: Optional[int] = Field(default=None, ge=1, le=4)
    day: Optional[int] = Field(default=None, ge=1, le=31)
    start: Optional[date] = None
    end: Optional[date] = None
    amount: Optional[int] = Field(default=None, ge=1, le=3660)
    unit: Optional[Literal["day", "month"]] = None


class ClarificationChoice(Contract):
    id: Optional[str] = None
    label: str
    unit: str = ""
    description: str = ""
    followup: str = ""


class ClarificationRequest(Contract):
    reason: str
    known_interpretation: Dict[str, Any] = Field(default_factory=dict)
    missing_fields: List[str] = Field(default_factory=list, max_length=12)
    ambiguous_fields: List[str] = Field(default_factory=list, max_length=12)
    choices: List[ClarificationChoice] = Field(default_factory=list, max_length=8)
    user_message: str = ""


class ClarificationResponse(Contract):
    clarification: ClarificationRequest


class TimeScope(Contract):
    mode: Literal[
        "current_day",
        "previous_day",
        "current_week",
        "previous_week",
        "current_month",
        "previous_month",
        "current_quarter",
        "previous_quarter",
        "current_year",
        "previous_year",
        "custom",
        "all_time",
    ] = "all_time"
    start: Optional[date] = None
    end: Optional[date] = (
        None  # inclusive date; SQL uses an exclusive next-day boundary
    )
    timezone: str = "Asia/Ho_Chi_Minh"

    @model_validator(mode="after")
    def bounds(self):
        if self.mode == "custom" and (
            not self.start or not self.end or self.start > self.end
        ):
            raise ValueError("custom period requires ordered start/end dates")
        if self.mode != "custom" and (self.start or self.end):
            raise ValueError("relative periods must not carry stale absolute bounds")
        return self


class Filter(Contract):
    dimension: str
    operator: Literal["eq", "in", "gt", "gte", "lt", "lte"] = "eq"
    value: Any

    @model_validator(mode="after")
    def scalar(self):
        vals = self.value if isinstance(self.value, list) else [self.value]
        if (
            not vals
            or len(vals) > 100
            or any(type(v) not in (str, int, float, bool) for v in vals)
        ):
            raise ValueError("filter requires bounded scalar values")
        if any(isinstance(v, float) and not math.isfinite(v) for v in vals):
            raise ValueError("filter numbers must be finite")
        if (self.operator == "in") != isinstance(self.value, list):
            raise ValueError("only IN accepts a list")
        return self


class Ranking(Contract):
    metric: str
    direction: Literal["ASC", "DESC"] = "DESC"
    top_n: int = Field(ge=1, le=100)
    per_group: List[str] = Field(default_factory=list, max_length=2)


class ComparisonGroup(Contract):
    name: str = Field(min_length=1, max_length=100)
    filters: List[Filter] = Field(default_factory=list, max_length=10)
    top_n: Optional[int] = Field(default=None, ge=1, le=100)


class Component(Contract):
    id: str = Field(pattern=r"^[a-z][a-z0-9_]{0,39}$")
    kind: Literal["ranking", "aggregate", "trend", "distribution", "detail", "heatmap"]
    subject: Optional[str] = None
    filters: List[Filter] = Field(default_factory=list, max_length=12)
    # None inherits the shared groups; [] explicitly requests one component scope.
    comparison_groups: Optional[List[ComparisonGroup]] = Field(
        default=None, max_length=6
    )
    metrics: List[str] = Field(default_factory=list, max_length=6)
    dimensions: List[str] = Field(default_factory=list, max_length=4)
    ranking: Optional[Ranking] = None
    detail_columns: List[str] = Field(default_factory=list, max_length=12)
    order_by: List[Dict[str, str]] = Field(default_factory=list, max_length=6)
    row_limit: Optional[int] = Field(default=None, ge=1, le=100)


class AnalysisSpec(Contract):
    version: Literal[2] = 2
    analysis_kind: Literal[
        "ranking",
        "aggregate",
        "trend",
        "distribution",
        "comparison",
        "detail",
        "composite",
        "heatmap",
    ]
    subject: str
    metrics: List[str] = Field(default_factory=list, max_length=6)
    dimensions: List[str] = Field(default_factory=list, max_length=4)
    filters: List[Filter] = Field(default_factory=list, max_length=12)
    time_range: TimeScope = Field(default_factory=TimeScope)
    granularity: Literal["day", "week", "month", "quarter", "year"] = "day"
    ranking: Optional[Ranking] = None
    comparison_groups: List[ComparisonGroup] = Field(default_factory=list, max_length=6)
    components: List[Component] = Field(default_factory=list, max_length=8)
    requested_output: List[Literal["table", "chart", "report"]] = Field(
        default_factory=lambda: ["table", "chart", "report"]
    )
    requested_visualizations: List[
        Literal[
            "bar",
            "horizontal_bar",
            "line",
            "area",
            "multi_line",
            "donut",
            "heatmap",
            "table",
        ]
    ] = Field(default_factory=list, max_length=8)
    detail_level: Literal["aggregate", "detail"] = "aggregate"
    detail_columns: List[str] = Field(default_factory=list, max_length=12)
    used_example_ids: List[str] = Field(default_factory=list, max_length=2)
    assumptions: List[str] = Field(default_factory=list, max_length=10)
    ambiguities: List[str] = Field(default_factory=list, max_length=6)
    confidence: float = Field(default=1, ge=0, le=1)

    @model_validator(mode="after")
    def meaning(self):
        if self.analysis_kind == "detail":
            self.detail_level = "detail"
        elif self.detail_level == "detail" and self.analysis_kind != "composite":
            raise ValueError("detail level conflicts with aggregate analysis kind")
        for values in [self.metrics, self.dimensions, self.detail_columns]:
            if len(values) != len(set(values)):
                raise ValueError("duplicate semantic field")
        for component in self.components:
            if component.kind == "ranking" and not component.ranking:
                raise ValueError("ranking component requires Top N and ordering")
            if len(component.metrics) != len(set(component.metrics)) or len(
                component.dimensions
            ) != len(set(component.dimensions)):
                raise ValueError("duplicate component field")
        if not self.components:
            if self.analysis_kind == "composite":
                raise ValueError("composite requires explicit components")
            if self.analysis_kind == "ranking" and not self.ranking:
                raise ValueError("ranking requires metric, direction and Top N")
        if len({c.id for c in self.components}) != len(self.components):
            raise ValueError("duplicate component id")
        if len({g.name for g in self.comparison_groups}) != len(self.comparison_groups):
            raise ValueError("duplicate comparison group")
        if any("." in x for x in [self.subject, *self.metrics, *self.dimensions]):
            raise ValueError("logical spec must not contain physical references")
        return self


class PatchOperation(Contract):
    path: str
    value: Any


class SpecPatch(Contract):
    operations: List[PatchOperation] = Field(max_length=12)
    ambiguities: List[str] = Field(default_factory=list)


class GroundedAnalysisSpec(Contract):
    analysis_spec: AnalysisSpec
    schema_fingerprint: str
    metrics: Dict[str, Dict[str, Any]]
    dimensions: Dict[str, Dict[str, Any]]
    subject: Dict[str, Any]
    relationships: List[Dict[str, Any]]
    period: Dict[str, Any]
    retrieval: Dict[str, Any]


# Server execution budget for complete grouped populations. User Top N/detail
# limits remain capped at 100; they are separate from this completeness budget.
from services.analytical_capacity_planner import AnalyticalCapacityContract

# Compatibility alias for callers; this is EXECUTION capacity, never a display
# or session budget. Compilation and runtime validation consult the contract.
MAX_ANALYTICAL_ROWS = AnalyticalCapacityContract().execution_rows


class QueryPlan(Contract):
    id: str
    kind: str
    subject: str
    source: str
    metrics: List[str]
    dimensions: List[str]
    filters: List[Filter]
    metric_expressions: Dict[str, str]
    group_by: List[str]
    output_columns: List[str]
    order_by: List[Dict[str, str]]
    ctes: List[str]
    scope_ref: str
    joins: List[Dict[str, Any]]
    time_column: Optional[str]
    period: Dict[str, Any]
    granularity: str
    ranking: Optional[Ranking]
    row_limit: int = Field(ge=1, le=500000)
    group: Optional[str] = None
    schema_fingerprint: str
    explicit_limit: bool = False


class ValidationResult(Contract):
    valid: bool
    category: str
    errors: List[str] = Field(default_factory=list)


class VisualizationSpec(Contract):
    id: str
    query_id: str
    scope_ref: str
    chart_type: Literal[
        "bar",
        "horizontal_bar",
        "line",
        "area",
        "multi_line",
        "donut",
        "heatmap",
        "table",
    ]
    title: str
    metric: Optional[str] = None
    unit: str = ""
    x_field: Optional[str] = None
    y_field: Optional[str] = None
    series_field: Optional[str] = None
    sort: Literal["ASC", "DESC", "time", "none"] = "none"
    cardinality: int = 0
    row_selector: Dict[str, Any] = Field(default_factory=dict)
    composition: bool = False
