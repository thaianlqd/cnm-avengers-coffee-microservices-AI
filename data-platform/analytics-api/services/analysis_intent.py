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
        description='Explicit ordering metric in metric_ids; other displayed metrics do not change ranking.')
    per_group: list[str] = Field(default_factory=list, max_length=2)


class IntentRequirement(Contract):
    id: str = Field(pattern=r"^[a-z][a-z0-9_]{0,39}$")
    goal: str = Field(default="Phân tích yêu cầu", min_length=1, max_length=2000,
                      description="Display label <=120 chars preferred; not executable meaning.")
    domain_id: Optional[str] = None
    lens_hint: Optional[str] = None
    supporting_for: Optional[str] = Field(default=None, pattern=r"^[a-z][a-z0-9_]{0,39}$",
        description='Related view of a requested requirement ID.')
    metric_ids: list[str] = Field(default_factory=list, max_length=6)
    dimension_ids: list[str] = Field(default_factory=list, max_length=4,
        description='Business grouping axes only; trend period comes from granularity, not a raw timestamp.')
    analysis_kind: Optional[Literal['comparison', Operation]] = Field(default=None,
        description='comparison/aggregate for groups; cross_tab requires two independent dimensions.')
    filters: list[Filter] = Field(default_factory=list, max_length=12)
    time: Optional[TimeSpec] = None
    ranking: Optional[IntentRanking] = None
    granularity: Optional[Granularity] = Field(default=None,
        description='Required for trend: day/week/month/quarter/year. Preserve the cadence explicitly requested in the question.')
    derived_features: list[DerivedFeature] = Field(default_factory=list, max_length=10,
        description='scalar: ungrouped KPI. selected_total: sum a Top N cohort, never an average.')
    feature_metrics: dict[DerivedFeature, list[str]] = Field(default_factory=dict, max_length=10,
        description='Targets only ACTIVE derived_features within metric_ids. Omit inactive entries and unnecessary maps.')
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
        # The provider must use the same complete time grammar as resolution.
        # A flat object with only kind required previously admitted mode-less
        # relative windows and contradictory date fields on every repair.
        from services.analysis_contract import TIME_SHAPES, TimeScope
        time_props = props['time']['properties']
        time_props['mode'] = {'type':'string', 'enum': [m for m in
            TimeScope.model_json_schema()['properties']['mode']['enum'] if m != 'custom']}
        props['time'] = {'description':'Omit when unspecified (all_time). Supply exactly one complete time kind.',
            'anyOf':[{'type':'object', 'properties':{'kind':{'type':'string','enum':[kind]},
                **{f:time_props[f] for f in required + optional}}, 'required':['kind', *required]}
                for kind,(required,optional) in TIME_SHAPES.items()]}
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


def remove_inactive_feature_bindings(intent):
    """Discard map entries that do not bind any declared feature in a draft.

    derived_features declares work; feature_metrics only narrows its targets.
    An orphan map entry cannot declare or execute work. Keep every active entry,
    including invalid/empty ones, for strict validation. Request anchors still
    require explicitly requested work; approved intents and repairs stay strict.
    """
    result=intent.model_copy(deep=True)
    changes=[]
    for req in result.requirements:
        if req.availability!='requested':
            continue
        for feature in sorted(set(req.feature_metrics)-set(req.derived_features)):
            req.feature_metrics.pop(feature)
            changes.append(dict(requirement_id=req.id,field='feature_metrics',
                rule='inactive_feature_binding',feature=feature))
    return result,changes


def decompose_scalar_draft(intent):
    """Separate an explicitly declared whole-scope KPI from its grouped view.

    Pure semantic structure: preserve selected metrics, filters and time; do not
    infer features from prose or turn a ranked cohort into a full population.
    This applies to an unapproved primary draft only, never a frozen repair.
    """
    import hashlib
    result = intent.model_copy(deep=True)
    ids = {r.id for r in result.requirements}
    additions, changes = [], []
    for req in result.requirements:
        if req.availability != 'requested' or req.ranking or 'scalar' not in req.derived_features:
            continue
        if req.analysis_kind not in {'trend','aggregate','comparison','cross_tab'} or (
                req.analysis_kind == 'aggregate' and not req.dimension_ids):
            continue
        targets = req.feature_metrics.get('scalar', req.metric_ids)
        if not targets or not set(targets) <= set(req.metric_ids) or len(ids) >= 16:
            continue
        base = 'kpi_'+hashlib.sha256(req.id.encode()).hexdigest()[:16]
        id = base
        n = 1
        while id in ids:
            id = base+'_'+str(n); n += 1
        kpi = req.model_copy(deep=True)
        kpi.id = id; kpi.goal = 'Chỉ số tổng trong cùng phạm vi'
        kpi.metric_ids = sorted(set(targets)); kpi.dimension_ids = []
        kpi.analysis_kind = 'aggregate'; kpi.granularity = None
        kpi.derived_features = ['scalar']; kpi.feature_metrics = {'scalar': sorted(set(targets))}
        req.derived_features = [f for f in req.derived_features if f != 'scalar']
        req.feature_metrics.pop('scalar', None)
        ids.add(id); additions.append(kpi)
        changes.append(dict(requirement_id=req.id,field='derived_features',
            rule='scalar_scope_decomposition',scalar_requirement_id=id,metric_ids=kpi.metric_ids))
    result.requirements.extend(additions)
    return result, changes


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
            # Global missing work authorizes additions, not rewrites of frozen
            # requirements. Exclude their IDs in the provider grammar as well
            # as the existing local merge guard. Labels convey no SQL authority.
            existing = {r.id for r in previous.requirements} if previous else set()
            additions = [f'repair_add_{n}' for n in range(1, 33)
                         if f'repair_add_{n}' not in existing][:max(0, 16-len(existing))]
            item = tool['parameters']['properties']['requirements']['items']
            item['properties']['id']['enum'] = sorted(targets) + additions
            tool['description'] = ('Repair named targets with id and corrected fields only. '
                'Missing work must use a new repair_add ID; never resend frozen requirements. '
                'New requirements need complete meaning, including the original time scope.')
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
