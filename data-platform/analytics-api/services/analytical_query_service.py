"""Logical algebra -> audited AnalysisSpec -> existing deterministic validators."""

import hashlib
import json
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
from services.analysis_catalog import AnalysisError
from services.analysis_contract import AnalysisSpec, Component, Filter
from services.analyst_contract import AnalyticalQuery
from services.analysis_query import (
    build_plans,
    compile_sql,
    validate_plan,
    validate_sql,
    validate_results,
)
from services.analysis_presentation import safe_rows
from services.time_resolution_service import resolve_time
from services.value_grounding_service import dimension_values


@dataclass
class AnalysisArtifact:
    query: AnalyticalQuery
    grounded: object
    plan: object
    sql: str
    signature: str
    result: dict = None
    contract: dict = None
    reused: bool = False
    observed_at: str = ""


def signature(query, period, fingerprint):
    data = query.model_dump(mode="json")
    for key in ("id", "role", "parent_id", "purpose", "replaces", "changed_fields"):
        data.pop(key, None)
    data["time"] = period
    for key in ("metrics", "group_by", "project"):
        data[key] = sorted(data[key])
    for f in data["filters"]:
        if f["operator"] == "in":
            f["value"] = sorted(f["value"], key=lambda v: json.dumps(v, sort_keys=True))
    data["filters"] = sorted(
        data["filters"], key=lambda v: json.dumps(v, sort_keys=True)
    )
    return hashlib.sha256(
        json.dumps([fingerprint, data], sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()


class AnalyticalQueries:
    def __init__(
        self,
        catalog,
        semantic,
        reference,
        executor,
        diagnostics,
        proposal=False,
        previous=None,
    ):
        self.catalog, self.semantic, self.reference, self.executor = (
            catalog,
            semantic,
            reference,
            executor,
        )
        self.diagnostics, self.proposal = diagnostics, proposal
        self.artifacts = {}
        self.previous = previous or {}
        for artifact in self.previous.values():
            if artifact.plan.schema_fingerprint != catalog.fingerprint:
                raise AnalysisError(
                    "schema_changed",
                    "Stored semantic state has a different schema fingerprint",
                )
            for f in artifact.query.filters:
                values = f.value if isinstance(f.value, list) else [f.value]
                self.semantic.resolved.setdefault(f.dimension, set()).update(values)
        self.pending = {}
        self.ui_context = {}
        self.cache = {
            a.signature: a for a in self.previous.values() if a.result is not None
        }

    def prepare(self, arguments):
        q = AnalyticalQuery.model_validate(arguments)
        if q.replaces:
            old = self.previous.get(q.replaces)
            if not old:
                raise AnalysisError("patch", "Unknown server operation reference")
            data = q.model_dump(mode="json")
            for field in (
                "subject",
                "operation",
                "metrics",
                "group_by",
                "filters",
                "project",
                "time",
                "granularity",
                "ranking",
                "order_by",
                "limit",
            ):
                if field not in q.changed_fields:
                    data[field] = old.query.model_dump(mode="json")[field]
            q = AnalyticalQuery.model_validate(data)
        if q.id in self.artifacts:
            old = self.artifacts[q.id]
            if old.query != q:
                raise AnalysisError(
                    "query", "An operation id cannot change within a turn"
                )
        r = self.catalog.registry
        if q.subject not in r["subjects"]:
            raise AnalysisError("unsupported_subject", "Unknown catalog subject")
        for m in q.metrics:
            if m not in r["metrics"] or q.subject not in r["metrics"][m]["subjects"]:
                raise AnalysisError(
                    "unsupported_metric", "Metric is not defined for this subject"
                )
        metric_scopes = {
            json.dumps(
                [
                    r["metrics"][m].get("business_filters", []),
                    r["metrics"][m].get("required_non_null", []),
                ],
                sort_keys=True,
            )
            for m in q.metrics
        }
        if len(metric_scopes) > 1:
            raise AnalysisError(
                "metric_scope",
                "Metrics with different authoritative populations require separate operations",
            )
        for f in q.filters:
            d = r["dimensions"].get(f.dimension)
            if not d:
                raise AnalysisError(
                    "unsupported_dimension", "Unknown catalog dimension"
                )
            self.catalog.check_column(d["table"], d["column"])
            values = f.value if isinstance(f.value, list) else [f.value]
            available = dimension_values(self.catalog, f.dimension)
            mode = d.get("value_grounding", {}).get("mode")
            for v in values:
                if available and v in available:
                    continue
                if v in self.semantic.resolved.get(f.dimension, set()):
                    continue
                if mode == "literal" and type(v) in (int, float, bool):
                    continue
                if (
                    f.operator not in ("eq", "in")
                    and type(v) in (int, float)
                    and mode == "literal"
                ):
                    continue
                raise AnalysisError(
                    "filter_value_unknown",
                    "Resolve the chosen dimension reference before querying",
                )
        scope, assumptions, period = resolve_time(
            q.time.model_dump(mode="json"), self.reference, r["timezone"]
        )
        required_period = self.ui_context.get("required_period")
        if required_period and any(
            period[k] != required_period[k] for k in ("start", "end")
        ):
            raise AnalysisError(
                "time_range_ambiguous", "Analysis conflicts with the selected UI period"
            )
        required_filter = self.ui_context.get("required_filter")
        if required_filter and required_filter not in [
            f.model_dump(mode="json") for f in q.filters
        ]:
            raise AnalysisError(
                "query_scope", "Analysis omitted the selected UI population"
            )
        if q.role == "supporting":
            parent = (
                self.artifacts.get(q.parent_id)
                or self.pending.get(q.parent_id)
                or self.previous.get(q.parent_id)
            )
            if not parent or parent.query.role != "requested":
                raise AnalysisError(
                    "query_scope", "Supporting operation requires requested parent"
                )
            if (
                not self.semantic.cohort_compatible(
                    parent.query.subject, q.subject, parent.query.metrics, q.metrics
                )
                or parent.grounded.period != period
                or sorted((f.model_dump_json() for f in parent.query.filters))
                != sorted((f.model_dump_json() for f in q.filters))
            ):
                raise AnalysisError(
                    "query_scope",
                    "Supporting analysis cannot change the requested population or time",
                )
        kind = (
            "heatmap"
            if q.operation == "cross_tab"
            else "aggregate" if q.operation == "relationship" else q.operation
        )
        comp = Component(
            id=q.id,
            kind=kind,
            subject=q.subject,
            metrics=q.metrics,
            dimensions=q.group_by,
            filters=q.filters,
            ranking=q.ranking,
            detail_columns=q.project,
            order_by=[s.model_dump() for s in q.order_by],
            row_limit=q.limit if q.limit < 100 else None,
        )
        spec = AnalysisSpec(
            analysis_kind=kind,
            subject=q.subject,
            components=[comp],
            time_range=scope,
            granularity=q.granularity,
            assumptions=assumptions,
        )
        ground = self.catalog.ground(spec, self.reference)
        plan = build_plans(ground, self.catalog)[0]
        sql = compile_sql(plan, ground, self.catalog)
        for verdict in (
            validate_plan(plan, ground, self.catalog),
            validate_sql(sql, plan, ground, self.catalog),
        ):
            if not verdict.valid:
                raise AnalysisError(verdict.category, "Analytical contract rejected")
        artifact = AnalysisArtifact(
            q, ground, plan, sql, signature(q, period, self.catalog.fingerprint)
        )
        self.pending[q.id] = artifact
        return artifact

    def run(self, artifact):
        cached = self.cache.get(artifact.signature)
        if cached and (self.proposal or cached.result is not None):
            if cached.result is not None:
                verdict = validate_results(
                    cached.result, artifact.plan, artifact.grounded, self.catalog
                )
                if not verdict.valid:
                    raise AnalysisError(
                        "result_contract",
                        "Cached result fails the current logical contract",
                    )
            artifact.result, artifact.contract = deepcopy(cached.result), deepcopy(
                cached.contract
            )
            artifact.reused = True
            artifact.observed_at = cached.observed_at
            self.diagnostics["analytical_cache_hits"] += 1
        elif not self.proposal:
            self.diagnostics["db_query_count"] += 1
            try:
                result = self.executor(
                    artifact.sql, row_limit=artifact.plan.row_limit + 1
                )
            except Exception as exc:
                raise AnalysisError(
                    "execution",
                    "Compiled read-only query failed; no SQL repair is allowed",
                ) from exc
            verdict = validate_results(
                result, artifact.plan, artifact.grounded, self.catalog
            )
            if not verdict.valid:
                raise AnalysisError(
                    "result_contract", "Result does not satisfy the analytical contract"
                )
            artifact.result = {**result, "rows": safe_rows(result["rows"])}
            artifact.contract = verdict.model_dump()
            artifact.observed_at = datetime.now(timezone.utc).isoformat()
        self.artifacts[artifact.query.id] = artifact
        self.cache[artifact.signature] = artifact
        return artifact

    def restore(self, id):
        if id not in self.artifacts and id in self.previous:
            # Recompile under the current schema; validate reused rows again.
            old = self.previous[id]
            args = old.query.model_dump(mode="json")
            args.update(replaces=None, changed_fields=[])
            artifact = self.prepare(args)
            if old.result is not None:
                verdict = validate_results(
                    old.result, artifact.plan, artifact.grounded, self.catalog
                )
                if not verdict.valid:
                    raise AnalysisError(
                        "result_contract",
                        "Stored result no longer satisfies its contract",
                    )
            self.run(artifact)
        return self.artifacts.get(id)
