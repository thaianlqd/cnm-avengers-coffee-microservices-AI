"""One model-facing decision; optional operations are validated independently."""

from typing import Any, List, Literal, Optional
from pydantic import Field
from services.analysis_contract import Contract, Filter, TimeSpec, TIME_SHAPES
from services.analyst_contract import Operation, Granularity, ToolRanking, SortField, AgentClarification, DashboardVisual
from services.analytical_tool_contract import ToolContractError, issue


class DecisionTime(TimeSpec):
    # A range uses start/end. "custom" is never a relative time mode.
    mode: Optional[Literal["current_day", "previous_day", "current_week", "previous_week", "current_month", "previous_month", "current_quarter", "previous_quarter", "current_year", "previous_year", "all_time"]] = None


class DecisionFilter(Filter):
    dimension: str = Field(description="Semantic dimension ID from manifest. Use 'dimension', never 'field'.")
    operator: Literal["eq", "in", "gt", "gte", "lt", "lte"] = Field(default="eq", description="in requires a list value; every other operator requires a scalar.")


class DecisionOperation(Contract):
    id: str = Field(pattern=r"^[a-z][a-z0-9_]{0,39}$")
    subject: Optional[str] = None
    operation: Optional[Operation] = None
    metrics: List[str] = Field(default_factory=list, max_length=6)
    group_by: List[str] = Field(default_factory=list, max_length=4)
    filters: List[DecisionFilter] = Field(default_factory=list, max_length=12)
    time: DecisionTime = Field(default_factory=lambda: DecisionTime(kind="relative", mode="all_time"))
    detail_fields: List[str] = Field(default_factory=list, max_length=12)
    ranking: Optional[ToolRanking] = None
    granularity: Optional[Granularity] = None
    order_by: List[SortField] = Field(default_factory=list, max_length=6)
    limit: int = Field(default=100, ge=1, le=100)
    parent_id: Optional[str] = None
    purpose: Literal["answer", "context", "compare", "relationship"] = "answer"
    lens_id: Optional[str] = Field(default=None, pattern=r"^[a-z][a-z0-9_]{0,63}$")
    population_relation: Literal["same", "related"] = "same"
    replaces: Optional[str] = None
    changed_fields: List[Literal["subject", "operation", "metrics", "group_by", "filters", "time", "detail_fields", "ranking", "granularity", "order_by", "limit"]] = Field(default_factory=list, max_length=12)

    def internal(self, role, previous):
        data = self.model_dump(mode="json", exclude_unset=True)
        old = previous.get(self.replaces)
        operation = self.operation or (old.query.operation if old and "operation" not in self.changed_fields else None)
        if self.detail_fields and operation != "detail":
            raise ToolContractError([issue("detail_fields", "detail_fields_only_for_detail")])
        if "detail_fields" in data:
            data["project"] = data.pop("detail_fields")
        if "changed_fields" in data:
            data["changed_fields"] = ["project" if f == "detail_fields" else f for f in data["changed_fields"]]
        data["role"] = role
        return data


class AnalystDecision(Contract):
    decision_type: Literal["plan", "clarification", "unsupported"]
    # Keep dictionaries here: an invalid optional item cannot invalidate the main plan.
    requested_operations: List[dict] = Field(default_factory=list, max_length=8)
    supporting_operations: List[Any] = Field(default_factory=list)
    clarification: Optional[AgentClarification] = None
    removed_query_ids: List[str] = Field(default_factory=list, max_length=8)
    visuals: List[DashboardVisual] = Field(default_factory=list, max_length=12)


def decision_tool(*, refinement=True, supporting_limit=7):
    from services.agent_provider import expanded_schema, gemini_tool_schema

    operation = gemini_tool_schema({"name": "decision_operation", "parameters": DecisionOperation.model_json_schema()})
    # Nullable fields can be omitted; remove duplicate null alternatives on the wire.
    def omit_null(value):
        if isinstance(value, list):
            return [omit_null(v) for v in value]
        if not isinstance(value, dict):
            return value
        if "anyOf" in value and len(value["anyOf"]) == 2 and value["anyOf"][-1].get("type") == "null":
            return omit_null(value["anyOf"][0])
        return {k: omit_null(v) for k, v in value.items()}

    operation = omit_null(operation)
    partial_time = operation["properties"]["time"]
    if not refinement:
        for field in ("replaces", "changed_fields", "order_by"):
            operation["properties"].pop(field, None)
    # A flat TimeSpec with only kind required permits incomplete/contradictory
    # objects that cannot resolve to a warehouse scope. Declare complete branches
    # using the same grammar the server checks. Unused fields are omitted entirely.
    time_properties = operation["properties"]["time"]["properties"]
    operation["properties"]["time"] = {
        "description": "Omit if unspecified. Use one complete kind; ranges use ISO start/end, never relative/custom.",
        "anyOf": [
            {"type": "object", "properties": {
                "kind": {"type": "string", "enum": [kind]},
                **{field: time_properties[field] for field in required + optional},
             }, "required": ["kind", *required]}
            for kind, (required, optional) in TIME_SHAPES.items()
        ],
    }
    # A clarification draft is partial logical meaning, not arbitrary untyped JSON.
    draft = {"type": "object", "properties": {k: v for k, v in operation["properties"].items()
             if k in {"subject", "operation", "metrics", "group_by", "filters", "time", "ranking"}}}
    # A clarification carries partial known meaning, not an executable query.
    # Missing/invalid partial time is reported as a missing field locally.
    draft["properties"]["time"] = partial_time
    clarification = expanded_schema(AgentClarification.model_json_schema())
    clarification["properties"]["known_query"] = draft
    clarification = omit_null(clarification)
    # The executable filter declaration owns the local key/value instructions;
    # don't repeat them in a partial clarification draft.
    for field in ("dimension", "operator"):
        clarification["properties"]["known_query"]["properties"]["filters"]["items"]["properties"][field].pop("description", None)
    requested = {**operation, "properties": {k: v for k, v in operation["properties"].items()
                 if k not in {"parent_id", "purpose", "population_relation"}}}
    support = {**operation, "properties": {k: v for k, v in operation["properties"].items()
               if k not in {"filters", "time", "purpose"}}}
    support["required"] = ["id", "parent_id"]
    # Supports inherit parent scope; the compatibility parser still validates
    # explicit scope from old decisions. New calls don't repeat those fields.
    return {"name": "submit_analyst_decision", "description": "Return only one structured decision; no prose. Preserve all requested work; supports inherit parent scope and use remaining capacity.",
            "parameters": {"type": "object", "required": ["decision_type"], "properties": {
                "decision_type": {"type": "string", "enum": ["plan", "clarification", "unsupported"]},
                "requested_operations": {"type": "array", "items": requested, "maxItems": 8},
                "supporting_operations": {"type": "array", "items": support, "maxItems": min(7, max(0, supporting_limit)), "description": f"At most {min(7, max(0, supporting_limit))} optional operations, and at most 8 total including requested work."},
                "clarification": clarification,
                **({"removed_query_ids": {"type": "array", "items": {"type": "string"}}} if refinement else {}),
                # Legacy stored decisions may still contain visuals. New model
                # planning is analytical only; structured UI edits own visuals.
            }}}
