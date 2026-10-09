"""Explicit native tool scripts, independent of request wording. No NLP simulation."""

from copy import deepcopy


def call(name, arguments, id="fixture"):
    return {"id": id, "name": name, "arguments": arguments}


class ScriptedProvider:
    def __init__(self, *rounds):
        self.rounds = iter(rounds)
        self.requests = []

    def __call__(self, **request):
        self.requests.append(deepcopy(request))
        try:
            calls = next(self.rounds)
        except StopIteration:
            calls = None
        return {"calls": calls, "attempts": []}

    @property
    def call_count(self):
        return len(self.requests)


def ranking_query(**updates):
    value = {
        "id": "main",
        "subject": "products",
        "operation": "ranking",
        "metrics": ["quantity_sold"],
        "group_by": ["product"],
        "filters": [{"dimension": "city", "value": "Hà Nội"}],
        "time": {"kind": "relative", "mode": "current_month"},
        "ranking": {"metric": "quantity_sold", "direction": "DESC", "top_n": 5},
    }
    value.update(updates)
    return value


def query_script(queries=None, final=None):
    queries = queries or [ranking_query()]
    discovery = [
        call(
            "describe_semantic_concept",
            {"kind": "subject", "id": q["subject"]},
            f"d_{i}",
        )
        for i, q in enumerate(queries)
    ]
    # Model scripts must explicitly discover selected dimensions outside the
    # subject's first page; production never authorizes undisplayed references.
    from services.analysis_catalog import AnalysisCatalog
    from services.semantic_tools import SemanticTools
    from tests.analysis_fixtures import physical_metadata

    semantic = SemanticTools(AnalysisCatalog(physical_metadata()), None)
    for q in queries:
        if q["subject"] in semantic.catalog.registry["subjects"]:
            semantic.describe("subject", q["subject"])
    dimensions = {d for q in queries for d in [
        *q.get("group_by", []), *q.get("project", []),
        *[f["dimension"] for f in q.get("filters", [])],
        *((q.get("ranking") or {}).get("per_group", [])),
    ]}
    for dimension in sorted(dimensions):
        if ("dimension", dimension) not in semantic.discovered and dimension in semantic.catalog.registry["dimensions"]:
            discovery.append(call("describe_semantic_concept", {"kind": "dimension", "id": dimension}, f"dimension_{dimension}"))
    analyses = [call("run_analysis", q, f"q_{i}") for i, q in enumerate(queries)]
    analyses.append(
        call(
            "finish_analysis",
            final or {"active_query_ids": [q["id"] for q in queries]},
            "finish",
        )
    )
    return ScriptedProvider(discovery, analyses)


def queries_from_spec(raw, metadata=None):
    from services.analysis_contract import AnalysisSpec
    from services.analysis_catalog import AnalysisCatalog
    from services.analysis_query import build_plans
    from tests.analysis_fixtures import physical_metadata

    spec = AnalysisSpec.model_validate(raw)
    catalog = AnalysisCatalog(metadata or physical_metadata())
    ground = catalog.ground(spec)
    queries = []
    for plan in build_plans(ground, catalog):
        filters = [
            f.model_dump(mode="json")
            for f in plan.filters
            if f.model_dump()
            not in [
                b
                for m in plan.metrics
                for b in ground.metrics[m].get("business_filters", [])
            ]
        ]
        time = (
            {
                "kind": "range",
                "start": str(spec.time_range.start),
                "end": str(spec.time_range.end),
            }
            if spec.time_range.mode == "custom"
            else {"kind": "relative", "mode": spec.time_range.mode}
        )
        queries.append(
            {
                "id": plan.id,
                "subject": plan.subject,
                "operation": "cross_tab" if plan.kind == "heatmap" else plan.kind,
                "metrics": plan.metrics,
                "group_by": (
                    []
                    if plan.kind == "detail"
                    else [
                        d
                        for d in plan.dimensions
                        if not d.endswith("_id") or d in spec.dimensions
                    ]
                ),
                "project": plan.dimensions if plan.kind == "detail" else [],
                "filters": filters,
                "time": time,
                "granularity": spec.granularity,
                "ranking": plan.ranking.model_dump() if plan.ranking else None,
            }
        )
    return queries
