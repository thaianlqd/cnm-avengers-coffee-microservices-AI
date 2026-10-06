"""One model-facing decision; optional operations are validated independently."""

from typing import Any, List, Literal, Optional
from pydantic import Field
from services.analysis_contract import Contract, Filter, TimeSpec, TIME_SHAPES
from services.analyst_contract import Operation, Granularity, ToolRanking, SortField, AgentClarification, DashboardVisual
from services.analytical_tool_contract import ToolContractError, issue


class DecisionTime(TimeSpec):
    # A range uses start/end. "custom" is never a relative time mode.
    mode: Optional[Literal["current_day", "previous_day", "current_week", "previous_week", "current_month", "previous_month", "current_quarter", "previous_quarter", "current_year", "previous_year", "all_time"]] = None


class DecisionOperation(Contract):
    id: str = Field(pattern=r"^[a-z][a-z0-9_]{0,39}$")
    subject: Optional[str] = None
    operation: Optional[Operation] = None
    metrics: List[str] = Field(default_factory=list, max_length=6)
    group_by: List[str] = Field(default_factory=list, max_length=4)
    filters: List[Filter] = Field(default_factory=list, max_length=12)
    time: DecisionTime = Field(default_factory=lambda: DecisionTime(kind="relative", mode="all_time"))
    detail_fields: List[str] = Field(default_factory=list, max_length=12)
    ranking: Optional[ToolRanking] = None
    granularity: Optional[Granularity] = None
    order_by: List[SortField] = Field(default_factory=list, max_length=6)
    limit: int = Field(default=100, ge=1, le=100)
    parent_id: Optional[str] = None
    purpose: Literal["answer", "context", "compare", "relationship"] = "answer"
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


def decision_tool(*, refinement=True):
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
    if not refinement:
        for field in ("replaces", "changed_fields"):
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
    clarification = expanded_schema(AgentClarification.model_json_schema())
    clarification["properties"]["known_query"] = draft
    clarification = omit_null(clarification)
    return {"name": "submit_analyst_decision", "description": "Submit one complete decision. Plan all requested and useful supporting operations together, within ui.supporting_limit. Time may be omitted.",
            "parameters": {"type": "object", "required": ["decision_type"], "properties": {
                "decision_type": {"type": "string", "enum": ["plan", "clarification", "unsupported"]},
                "requested_operations": {"type": "array", "items": operation},
                "supporting_operations": {"type": "array", "items": operation},
                "clarification": clarification,
                "removed_query_ids": {"type": "array", "items": {"type": "string"}},
                "visuals": {"type": "array", "items": omit_null(gemini_tool_schema({"name": "decision_visual", "parameters": DashboardVisual.model_json_schema()}))},
            }}}
