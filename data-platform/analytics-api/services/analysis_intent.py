"""Semantic meaning only. Executable identities and coverage are server outputs."""
from typing import Literal, Optional
from pydantic import Field, field_validator
from services.analysis_contract import Contract, Filter, TimeSpec
from services.analyst_contract import Granularity, Operation

DerivedFeature = Literal["scalar", "contribution_share", "leader", "top_gap", "group_gap",
                         "change", "change_pct", "concentration", "selected_total",
                         "relationship_strength"]


class IntentRanking(Contract):
    direction: Literal["top", "bottom"] = "top"
    limit: int = Field(ge=1, le=100)
    metric_id: Optional[str] = Field(default=None,
        description='Ranking criterion: choose the metric explicitly requested for ordering, even when other metrics are displayed alongside it. Must be in metric_ids.')
    per_group: list[str] = Field(default_factory=list, max_length=2)


class IntentRequirement(Contract):
    id: str = Field(pattern=r"^[a-z][a-z0-9_]{0,39}$")
    goal: str = Field(default="Phân tích yêu cầu", min_length=1, max_length=2000,
                      description="Optional display label, preferably <=120 characters; not executable meaning.")
    domain_id: Optional[str] = None
    lens_hint: Optional[str] = None
    metric_ids: list[str] = Field(default_factory=list, max_length=6)
    dimension_ids: list[str] = Field(default_factory=list, max_length=4,
        description='Business grouping axes only. Trend has an implicit period axis from granularity; do not add its raw observation timestamp (e.g. order_created).')
    analysis_kind: Optional[Literal['comparison', Operation]] = Field(default=None,
        description='Business comparison uses comparison or aggregate. cross_tab means two independent grouping dimensions, not two values of one dimension.')
    filters: list[Filter] = Field(default_factory=list, max_length=12)
    time: Optional[TimeSpec] = None
    ranking: Optional[IntentRanking] = None
    granularity: Optional[Granularity] = Field(default=None,
        description='Required for trend: day/week/month/quarter/year. Preserve the cadence explicitly requested in the question.')
    derived_features: list[DerivedFeature] = Field(default_factory=list, max_length=10,
        description='scalar for whole-scope KPI; selected_total only sums a selected Top N cohort. Do not use selected_total for an average.')
    feature_metrics: dict[DerivedFeature, list[str]] = Field(default_factory=dict, max_length=10,
        description='Feature targets within metric_ids. E.g. contribution_share:[voucher_revenue] with aov displayed. Omit for compatible defaults.')
    availability: Literal["requested", "needs_input", "unsupported", "insufficient_data"] = "requested"
    reason: Optional[Literal["historical_data_unavailable", "metric_unavailable",
                             "definition_unavailable", "ambiguous_criterion"]] = None

    @field_validator("goal", mode="before")
    @classmethod
    def bound_display_goal(cls, value):
        # Cosmetic prose must not consume semantic recovery calls. Keep enough
        # description for limitation disclosures; component cards have their
        # own shorter server display label. Never coerce non-string structures.
        if value is None:
            return "Phân tích yêu cầu"
        if isinstance(value, str):
            return " ".join(value.split())[:2000] or "Phân tích yêu cầu"
        return value


class IntentClarification(Contract):
    reason: Literal["metric_ambiguous", "subject_ambiguous", "time_range_ambiguous",
                    "filter_value_unknown", "unsupported_metric", "clarification", "not_analytical_request"]
    missing_fields: list[str] = Field(default_factory=list, max_length=8)


class AnalysisIntentEnvelope(Contract):
    decision: Literal["analyze", "clarification", "unsupported"]
    requirements: list[IntentRequirement] = Field(default_factory=list, max_length=16)
    clarification: Optional[IntentClarification] = None


class IntentChange(Contract):
    action: Literal["add", "remove", "update"]
    requirement_id: str
    requirement: Optional[IntentRequirement] = None
    changes: dict = Field(default_factory=dict)


class AnalysisIntentDelta(Contract):
    changes: list[IntentChange] = Field(default_factory=list, max_length=16)


def intent_tool(delta=False):
    from services.agent_provider import gemini_tool_schema
    model = AnalysisIntentDelta if delta else AnalysisIntentEnvelope
    tool = {"name": "submit_analysis_delta" if delta else "submit_analysis_intent",
            "description": "Return analytical meaning once. No SQL, executable IDs, coverage mappings or charts.",
            "parameters": model.model_json_schema()}
    tool["parameters"] = gemini_tool_schema(tool)
    # Optional nullable fields are omitted on the wire. Local parsing remains strict.
    def small(value):
        if isinstance(value, list):
            return [small(v) for v in value]
        if not isinstance(value, dict):
            return value
        if "anyOf" in value and len(value["anyOf"]) == 2 and value["anyOf"][-1].get("type") == "null":
            return small(value["anyOf"][0])
        return {k: small(v) for k, v in value.items()}
    tool["parameters"] = small(tool["parameters"])
    # Provider schemas need a finite object grammar, not arbitrary map keys.
    if not delta:
        from typing import get_args
        props=tool['parameters']['properties']['requirements']['items']['properties']
        props['feature_metrics']={'type':'object','description':IntentRequirement.model_fields['feature_metrics'].description,
            'properties':{f:{'type':'array','items':{'type':'string'},'minItems':1,'maxItems':6}
                          for f in get_args(DerivedFeature)}}
    if delta:
        # A semantic patch uses the SAME finite field grammar, not arbitrary JSON.
        properties = intent_tool()["parameters"]["properties"]["requirements"]["items"]["properties"]
        tool["parameters"]["properties"]["changes"]["items"]["properties"]["changes"] = {
            "type": "object", "properties": {k: v for k, v in properties.items() if k != "id"}}
        # Nested ranking fields are patches too; the stored ranking supplies
        # omitted values and local validation checks the complete result.
        patch = tool['parameters']['properties']['changes']['items']['properties']['changes']
        patch['properties']['ranking'].pop('required', None)
    return tool


def repair_tool(issues, previous=None):
    """Use the same transport, but expose only fields authorized for repair.

    Missing whole requirements still need the full finite semantic grammar.
    Existing targets use partial objects: omitted fields come from the server.
    Local merge guards reject any unauthorized fields sent despite the schema.
    """
    tool = intent_tool()
    targets={i.get('requirement_id') for i in issues if i.get('requirement_id')}
    if any(i.get('requirement_id') is None for i in issues):
        shapes={'leader':{'ranking'},'top_gap':{'ranking'},'change':{'trend'},'change_pct':{'trend'}}
        def kind(req):
            return 'ranking' if req.ranking else req.analysis_kind
        features={f for i in issues for f in i.get('candidate_ids',[])}
        if not (previous and all(i['field']=='derived_features' for i in issues) and features and
                all(any(kind(r) in shapes.get(f,set()) and r.availability=='requested'
                        for r in previous.requirements) for f in features)):
            return tool
        targets.update(r.id for r in previous.requirements if r.availability=='requested' and
                       any(kind(r) in shapes.get(f,set()) for f in features))
    fields = {'id'} | {i['field'] for i in issues}
    item = tool['parameters']['properties']['requirements']['items']
    item['properties'] = {k:v for k,v in item['properties'].items() if k in fields}
    item['required'] = ['id']
    item['properties']['id']['enum'] = sorted(targets)
    for field in ('domain_id','lens_hint','analysis_kind','time','ranking','granularity','reason'):
        if field in item['properties']:
            item['properties'][field]['nullable'] = True
    if 'ranking' in item['properties']:
        item['properties']['ranking'].pop('required', None)
    item['additionalProperties'] = False
    tool['description'] = 'Repair only identified fields. Return requirement id and corrected fields; omit frozen fields and all unaffected requirements.'
    return tool
