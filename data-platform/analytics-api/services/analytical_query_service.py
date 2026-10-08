"""Logical algebra -> audited AnalysisSpec -> existing deterministic validators."""

import hashlib
import json
import logging
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
from services.analysis_catalog import AnalysisError
from services.analysis_contract import AnalysisSpec, Component, Filter
from services.analyst_contract import AnalyticalQuery
from services.analytical_tool_contract import canonicalize, ToolContractError, issue
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


RESULT_RULES = {
    "Result population exceeds": "population_limit",
    "Result columns differ": "projection_columns",
    "Result row fields differ": "projection_rows",
    "Sensitive result field": "sensitive_field",
    "Metric must be finite numeric": "metric_numeric",
    "Negative metric": "metric_negative",
    "Returned dimension violates filter": "filter_mismatch",
    "Detail timestamp outside": "timestamp_bounds",
    "Invalid detail timestamp": "timestamp_type",
    "Time bucket outside": "bucket_bounds",
    "Invalid time bucket": "bucket_type",
    "Top N exceeded": "ranking_limit",
    "Metric ordering violates": "ranking_order",
    "NULL ordering violates": "null_order",
    "Invalid per-group rank": "rank_position",
    "Time buckets must be ascending": "bucket_order",
    "Numeric ordering violates": "numeric_order",
    "Duplicate analytical grain": "duplicate_grain",
}
logger = logging.getLogger("ai-analytics")


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
    result_ref: dict = None
    capacity: dict = None


def signature(query, period, fingerprint):
    data = query.model_dump(mode="json")
    for key in ("id", "role", "parent_id", "purpose", "lens_id", "population_relation", "replaces", "changed_fields"):
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
        self.previous = deepcopy(previous or {})
        from services.result_artifact_store import artifact_store
        for artifact in self.previous.values():
            if artifact.result is None and artifact.result_ref and not self.diagnostics.get('force_refresh'):
                artifact.result = artifact_store().get(artifact.result_ref)
        for artifact in self.previous.values():
            if artifact.plan.schema_fingerprint != catalog.fingerprint:
                raise AnalysisError(
                    "schema_changed",
                    "Stored semantic state has a different schema fingerprint",
                )
            for f in artifact.query.filters:
                values = f.value if isinstance(f.value, list) else [f.value]
                self.semantic.resolved.setdefault(f.dimension, set()).update(values)
            q = artifact.query
            self.semantic.discovered.add(("subject", q.subject))
            self.semantic.discovered.update(("metric", m) for m in q.metrics)
            self.semantic.discovered.update(("dimension", d) for d in [*q.group_by, *q.project, *[f.dimension for f in q.filters], *(q.ranking.per_group if q.ranking else [])])
        self.enforce_discovery = False
        self.pending = {}
        self.ui_context = {}
        self.cache = {
            a.signature: a for a in self.previous.values() if a.result is not None
        }
        self.normalizations = []
        self.parent_replacements = {}
        from services.analytical_capacity_planner import AnalyticalCapacityPlanner
        from services.value_profile_service import profiles_for, warehouse_statistics
        from services.sql_service import execute_read_only
        profiles = profiles_for(catalog)
        if executor is execute_read_only:
            try:
                profiles = profiles_for(catalog, warehouse_statistics)
            except Exception:
                self.diagnostics['value_profile_status'] = 'metadata_only'
        self.capacity_planner = AnalyticalCapacityPlanner(catalog, profiles)

    def stage(self, name):
        if self.diagnostics.get("pipeline_version") == "2.8":
            self.diagnostics["failure_stage"] = name

    def prepare(self, arguments):
        self.stage("PLAN_VALIDATION")
        q, self.normalizations = canonicalize(arguments, self.previous, self.parent_replacements)
        if self.enforce_discovery:
            self.semantic.require_query(q)
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
        try:
            scope, assumptions, period = resolve_time(
                q.time.model_dump(mode="json"), self.reference, r["timezone"]
            )
        except (ValueError, TypeError, OverflowError):
            raise ToolContractError([issue("time", "invalid_time_shape")]) from None
        from services.domain_intelligence_service import DomainIntelligence
        intelligence = DomainIntelligence(self.catalog)
        intelligence.validate_lens(q)
        required_domain = self.ui_context.get("required_domain")
        if required_domain and q.role == "requested" and q.subject not in intelligence.available()[required_domain]["primary_subjects"]:
            raise ToolContractError([issue("subject", "scope_conflict")])
        required_subject = self.ui_context.get("required_subject")
        if required_subject and q.role == "requested" and q.subject != required_subject:
            raise ToolContractError([issue("subject", "scope_conflict")])
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
        query_filters = [f.model_dump(mode="json") for f in q.filters]
        if any(f not in query_filters for f in self.ui_context.get("required_filters", [])):
            raise AnalysisError("query_scope", "Analysis conflicts with selected UI population")
        if self.ui_context.get("scope_mode") == "all" and query_filters:
            raise AnalysisError("query_scope", "Analysis narrowed the selected entire-system population")
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
            if q.population_relation == "related":
                compatible = self.semantic.related_population(parent.query.subject, q.subject, parent.query.metrics, q.metrics,
                    allow_snapshot=period["start"] is None and parent.grounded.period["start"] is None)
            else:
                compatible = self.semantic.cohort_compatible(parent.query.subject, q.subject, parent.query.metrics, q.metrics)
            if (
                not compatible
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
        verdict = validate_plan(plan, ground, self.catalog)
        if not verdict.valid:
            raise AnalysisError(verdict.category, "Analytical contract rejected")
        self.stage('CAPACITY_PLANNING')
        capacity = self.capacity_planner.plan(plan)
        self.stage("SQL_COMPILATION")
        sql = compile_sql(plan, ground, self.catalog)
        for verdict in (validate_sql(sql, plan, ground, self.catalog),):
            if not verdict.valid:
                raise AnalysisError(verdict.category, "Analytical contract rejected")
        artifact = AnalysisArtifact(
            q, ground, plan, sql, signature(q, period, self.catalog.fingerprint), capacity=capacity
        )
        self.pending[q.id] = artifact
        self.stage(None)
        return artifact

    def check_result(self, result, artifact, source):
        self.stage("RESULT_VALIDATION")
        verdict = validate_results(result, artifact.plan, artifact.grounded, self.catalog)
        if verdict.valid:
            self.stage(None)
            return verdict
        codes = sorted({next((code for prefix, code in RESULT_RULES.items() if error.startswith(prefix)), "result_invalid") for error in verdict.errors})
        # Only controlled rule codes and shape counts. Never log SQL, provider
        # prose, operation IDs, filters, row values or exception text.
        diagnostic = {"source": source, "operation": artifact.plan.kind,
                      "row_count": len(result.get("rows", [])),
                      "row_limit": artifact.plan.row_limit, "rules": codes,
                      "metric_ids": list(artifact.plan.metrics), "dimension_ids": list(artifact.plan.dimensions),
                      "granularity": artifact.plan.granularity}
        failures = self.diagnostics.setdefault("result_failures", [])
        if len(failures) < 8:
            failures.append(diagnostic)
        logger.warning("Result rejected source=%s operation=%s rows=%s limit=%s rules=%s dimensions=%s granularity=%s",
                       source, artifact.plan.kind, diagnostic["row_count"], artifact.plan.row_limit, ",".join(codes),
                       ",".join(artifact.plan.dimensions),artifact.plan.granularity)
        error = AnalysisError("result_contract", "Result does not satisfy the analytical contract")
        error.result_issues = codes
        if codes == ["population_limit"]:
            error.business_category = "requested_scope_too_large"
        raise error

    def run(self, artifact):
        cached = None if self.diagnostics.get('force_refresh') else self.cache.get(artifact.signature)
        from services.sql_service import execute_read_only
        from services.result_artifact_store import artifact_store
        if not cached and not self.proposal and not self.diagnostics.get('force_refresh') and self.executor is execute_read_only:
            reference=artifact_store().find(artifact.signature,self.catalog.fingerprint)
            if reference:
                from dataclasses import replace
                result=artifact_store().get(reference)
                cached=replace(artifact,result=result,result_ref=reference,
                    contract=validate_results(result,artifact.plan,artifact.grounded,self.catalog).model_dump(),
                    observed_at=reference.get('provenance',{}).get('observed_at',reference['created_at']))
        from services.analytical_capacity_planner import AnalyticalCapacityContract
        contract = AnalyticalCapacityContract.from_env()
        if cached and cached.result is not None:
            self.check_result(cached.result, artifact, 'cache')
        fresh = cached and cached.observed_at and (datetime.now(timezone.utc)-datetime.fromisoformat(cached.observed_at)).total_seconds() <= contract.cache_freshness
        if cached and (self.proposal or fresh):
            artifact.result, artifact.contract = deepcopy(cached.result), deepcopy(
                cached.contract
            )
            artifact.reused = True
            artifact.observed_at = cached.observed_at
            artifact.result_ref = deepcopy(cached.result_ref)
            self.diagnostics["analytical_cache_hits"] += 1
        elif not self.proposal:
            self.diagnostics["db_query_count"] += 1
            try:
                from services.sql_service import execute_read_only, dry_run_sql
                dry_runner = dry_run_sql if self.executor is execute_read_only else getattr(self.executor, 'dry_run', None)
                # Explicit adapter protocol; unittest mocks must not invent it.
                if self.executor is not execute_read_only and 'dry_run' not in getattr(type(self.executor), '__dict__', {}) and 'dry_run' not in getattr(self.executor, '__dict__', {}):
                    dry_runner = None
                if dry_runner:
                    self.stage('DRY_RUN')
                    try:
                        valid, _ = dry_runner(artifact.sql)
                    except Exception:
                        raise AnalysisError('dry_run_failed', 'Database preflight unavailable') from None
                    self.diagnostics['dry_run_count'] = self.diagnostics.get('dry_run_count', 0)+1
                    if not valid:
                        raise AnalysisError('dry_run_failed', 'Compiled query failed database preflight')
                self.stage("SQL_EXECUTION")
                result = self.executor(
                    artifact.sql, row_limit=artifact.plan.row_limit + 1
                )
            except AnalysisError:
                raise
            except Exception as exc:
                raise AnalysisError(
                    "execution",
                    "Compiled read-only query failed; no SQL repair is allowed",
                ) from exc
            verdict = self.check_result(result, artifact, "execution")
            artifact.result = {**result, "rows": safe_rows(result["rows"])}
            artifact.contract = verdict.model_dump()
            artifact.observed_at = datetime.now(timezone.utc).isoformat()
        from services.result_artifact_store import fingerprint
        if artifact.result_ref and artifact.result_ref['plan_fingerprint'] != fingerprint(artifact.plan.model_dump(mode='json')):
            # Same physical query under a new requirement ID: reuse data, issue
            # a new immutable reference bound to this server plan.
            artifact.result_ref = None
        if artifact.result is not None and not artifact.result_ref:
            self.stage('ARTIFACT_PERSISTENCE')
            from services.result_artifact_store import artifact_store, fingerprint
            artifact.result.pop('sql', None)
            artifact.result_ref = artifact_store().put(artifact.result, query_fingerprint=artifact.signature,
                plan_fingerprint=fingerprint(artifact.plan.model_dump(mode='json')), schema_fingerprint=self.catalog.fingerprint,
                provenance=dict(dimensions=artifact.plan.dimensions, subject=artifact.query.subject,
                                time=artifact.plan.period, observed_at=artifact.observed_at))
            logger.info('[Execution] rows=%s bytes=%s artifact_id=%s cache_hit=%s',
                artifact.result_ref['row_count'], artifact.result_ref['byte_size'], artifact.result_ref['artifact_id'], artifact.reused)
        self.stage(None)
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
                self.check_result(old.result, artifact, "stored")
            self.run(artifact)
        return self.artifacts.get(id)
