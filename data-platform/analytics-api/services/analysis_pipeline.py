"""V2 orchestration: request meaning is authoritative across every report stage."""

from __future__ import annotations
import json
import logging
import os
import time
from copy import deepcopy
from datetime import datetime
from services.analysis_contract import AnalysisSpec
from services.analysis_catalog import AnalysisCatalog, AnalysisError
from services.analysis_understanding import understand, refine_spec
from services.analysis_query import (
    build_plans,
    compile_sql,
    validate_plan,
    validate_sql,
    validate_results,
)
from services.analysis_presentation import (
    choose_visualizations,
    validate_chart,
    render_chart,
    grounded_facts,
    safe_rows,
)
from services.llm_service import call_bounded_llm
from services.metadata_service import get_local_metadata
from services.sql_service import execute_read_only, QueryExecutionError
from services.session_service import create_session, get_session
from services.verified_analysis_service import record_verified, retrieve_verified

logger = logging.getLogger("ai-contract")


class AnalysisPipeline:
    def __init__(self, metadata_loader=None, provider=None, executor=None):
        self.metadata_loader = metadata_loader or (
            lambda: get_local_metadata(force=True)
        )
        self.provider = provider or call_bounded_llm
        self.executor = executor or execute_read_only
        self.calls = []
        self.timings = {}
        self.embedding_calls = 0
        self.retrieval = {}
        self.semantic_info = {}
        self.llm_stage_count = 0
        self.started = time.perf_counter()

    def catalog(self):
        start = time.perf_counter()
        try:
            catalog = AnalysisCatalog(self.metadata_loader())
        except AnalysisError:
            raise
        except Exception as exc:
            raise AnalysisError(
                "metadata",
                "Current warehouse metadata is unavailable; no query was executed",
            ) from exc
        self.timings["metadata_ms"] = round((time.perf_counter() - start) * 1000, 2)
        return catalog

    def call(self, stage, prompt, schema=None):
        self.llm_stage_count += 1
        start = time.perf_counter()
        result = self.provider(prompt, response_schema=schema)
        if result is None:
            result = {"data": None, "attempts": []}
        attempts = result.get("attempts")
        if attempts is None:
            attempts = (
                [
                    {
                        k: result[k]
                        for k in ("provider", "model", "latency_ms")
                        if k in result
                    }
                ]
                if result.get("provider")
                else []
            )
        for attempt in attempts:
            self.calls.append({"stage": stage, **attempt})
        self.timings[stage + "_ms"] = round((time.perf_counter() - start) * 1000, 2)
        return result.get("data")

    def execute(self, sql, row_limit):
        start = time.perf_counter()
        try:
            return self.executor(sql, row_limit=row_limit)
        finally:
            self.timings["db_ms"] = round(
                self.timings.get("db_ms", 0) + (time.perf_counter() - start) * 1000, 2
            )
            self.semantic_info["db_query_count"] = (
                self.semantic_info.get("db_query_count", 0) + 1
            )

    def diagnostics(self, catalog, validations=None):
        return {
            "pipeline_version": 2,
            "schema_fingerprint": catalog.fingerprint,
            "provider_calls": deepcopy(self.calls),
            "provider_call_count": len(self.calls),
            "llm_stage_count": self.llm_stage_count,
            **self.semantic_info,
            "embedding_call_count": self.embedding_calls,
            "planner": "deterministic_grounded_operators",
            "retrieval": self.retrieval
            or {"vector_status": "not_requested", "strategy": "grounded_session_reuse"},
            "timings_ms": {
                **self.timings,
                "total": round((time.perf_counter() - self.started) * 1000, 2),
            },
            "validation": validations or {},
        }

    def interpreted(self, grounded):
        spec = grounded.analysis_spec
        c = grounded
        return {
            "analysis_kind": spec.analysis_kind,
            "subject": c.subject["business_name"],
            "metrics": [
                {"id": m, "label": v["business_name"], "unit": v["unit"]}
                for m, v in c.metrics.items()
            ],
            "dimensions": spec.dimensions,
            "filters": [f.model_dump() for f in spec.filters],
            "time_range": c.period,
            "ranking": spec.ranking.model_dump() if spec.ranking else None,
            "comparison_groups": [g.model_dump() for g in spec.comparison_groups],
            "components": [v.model_dump() for v in spec.components],
            "assumptions": spec.assumptions,
        }

    def _meaning(self, request, catalog):
        from services.vector_rag_service import vector_rag_service

        retrieval = vector_rag_service.search_semantic_knowledge(
            request.prompt,
            catalog=catalog,
            use_embeddings=os.getenv("AI_VECTOR_RETRIEVAL", "").lower()
            in ("1", "true", "yes"),
        )
        self.embedding_calls += retrieval["embedding_call_count"]
        self.retrieval = {
            "vector_status": retrieval["vector_status"],
            "strategy": retrieval["retrieval_strategy"],
            "tables": retrieval["top_tables"],
            "retrieval_mode": (
                "hybrid"
                if retrieval["vector_status"] == "available"
                else "lexical_fallback"
            ),
            "vector_available": retrieval["vector_status"] == "available",
            "retrieved_columns": {
                table["qualified_name"]: [col["name"] for col in table["columns"]]
                for table in retrieval["table_details"]
            },
        }
        examples = retrieve_verified(
            request.prompt, catalog.fingerprint, catalog=catalog
        )
        # Examples illustrate structure only. They never add user filters or
        # override current physical metadata/business definitions.
        original_call = self.call

        def with_examples(stage, prompt, schema):
            payload = json.loads(prompt)
            payload["verified_structure_examples"] = examples
            payload["candidates"] = retrieval["candidates"]
            payload["ui_domain_hint"] = request.domain
            return original_call(stage, json.dumps(payload, ensure_ascii=False), schema)

        spec, info = understand(
            request.prompt,
            catalog,
            with_examples,
            request.time_range,
            request.context or "",
            candidates=retrieval["candidates"],
            examples=examples,
        )
        spec = self.apply_legacy_scope(spec, request, catalog)
        grounded = catalog.ground(spec)
        plans = build_plans(grounded, catalog)
        self.semantic_info.update(
            {
                "analysis_kind": spec.analysis_kind,
                "analysis_spec_confidence": spec.confidence,
                "clarification_required": False,
                "understanding_source": info["source"],
            }
        )
        grounded.relationships = list(
            {json.dumps(j, sort_keys=True): j for p in plans for j in p.joins}.values()
        )
        for p in plans:
            validation = validate_plan(p, grounded, catalog)
            if not validation.valid:
                raise AnalysisError("plan", "Query plan does not preserve the request")
        return grounded, plans, info

    @staticmethod
    def apply_legacy_scope(spec, request, catalog):
        from services.analysis_contract import Filter
        from services.analysis_understanding import apply_ui_time, hints
        from services.analysis_catalog import normalize
        from common import AiTimeRange
        from datetime import timedelta
        import re

        branch = (request.branch or "").strip()
        if branch and branch.lower() != "all":
            dimension = catalog.registry["dimensions"]["city"]
            aliases = {
                normalize(k): v for k, v in dimension.get("value_aliases", {}).items()
            }
            aliases.update({normalize(v): v for v in dimension.get("enum", [])})
            canonical = aliases.get(normalize(branch))
            selected = Filter(
                dimension="city" if canonical else "store_id", value=canonical or branch
            )
            if selected not in spec.filters:
                spec = spec.model_copy(update={"filters": spec.filters + [selected]})
        if request.date_range and (
            not request.time_range or request.time_range.mode == "auto"
        ):
            value = request.date_range.lower().strip()
            match = re.fullmatch(r"(\d+)(?:days|d)", value)
            if match:
                days = int(match.group(1))
                if not 1 <= days <= 3660:
                    raise AnalysisError(
                        "clarification", "Legacy day range is outside supported bounds"
                    )
                from services.analysis_understanding import catalog_today

                today = catalog_today(spec.time_range.timezone)
                ui = AiTimeRange(
                    mode="custom", start=today - timedelta(days=days - 1), end=today
                )
            elif value == "today":
                ui = AiTimeRange(mode="today")
            elif value == "all":
                if (
                    hints(request.prompt, catalog)["time_terms"]
                    or hints(request.prompt, catalog)["explicit_time"]
                ):
                    raise AnalysisError(
                        "clarification",
                        "Legacy all-time filter conflicts with the explicit question",
                    )
                from services.analysis_contract import TimeScope

                return spec.model_copy(
                    update={"time_range": TimeScope(mode="all_time")}
                )
            else:
                raise AnalysisError(
                    "clarification",
                    "Use the structured time_range field for this legacy period",
                )
            hint = hints(request.prompt, catalog)
            spec = apply_ui_time(
                spec, ui, bool(hint["time_terms"] or hint["explicit_time"])
            )
        return spec

    def propose(self, request):
        catalog = self.catalog()
        grounded, plans, info = self._meaning(request, catalog)
        # Compilation/security/semantic checks happen before presenting an
        # approvable meaning. No data query executes during proposal.
        for plan in plans:
            verdict = validate_sql(
                compile_sql(plan, grounded, catalog), plan, grounded, catalog
            )
            if not verdict.valid:
                raise AnalysisError(
                    verdict.category, "Proposed analysis cannot be compiled safely"
                )
        session = create_session(request.prompt, request.domain or "auto")
        session.proposed_prompt = request.prompt
        session.proposed_request = self.request_signature(request)
        session.analysis_spec = grounded.analysis_spec.model_dump(mode="json")
        session.grounded_spec = grounded.model_dump(mode="json")
        session.query_plans = [p.model_dump(mode="json") for p in plans]
        session.schema_fingerprint = catalog.fingerprint
        interpreted = self.interpreted(grounded)
        proposal = {
            "title": grounded.subject["business_name"],
            "summary_intent": "Phạm vi được diễn giải bên dưới sẽ được dùng khi tạo báo cáo.",
            "data_sources": [
                {"name": t, "reason": "Đã đối chiếu metadata hiện tại"}
                for t in sorted(
                    {p.source for p in plans}
                    | {j["to_table"] for p in plans for j in p.joins}
                )
            ],
            "planned_kpis": [
                {"name": m["label"], "description": m["unit"]}
                for m in interpreted["metrics"]
            ],
            "planned_charts": [
                {
                    "title": p.id,
                    "chart_type": p.kind,
                    "reason": "Chọn theo dữ liệu thực tế; không ép số lượng biểu đồ.",
                }
                for p in plans
                if p.metrics
            ],
            "report_sections": [
                "Phạm vi phân tích",
                "Dữ liệu đã kiểm chứng",
                "Nhận định gắn với bằng chứng",
            ],
            "estimated_complexity": "grounded",
            "analysis_spec": session.analysis_spec,
            "interpretation": interpreted,
            "session_id": session.session_id,
        }
        return {
            "status": "proposal_ready",
            "prompt": request.prompt,
            "proposal": proposal,
            "analysis_spec": session.analysis_spec,
            "interpretation": interpreted,
            "session_id": session.session_id,
            "diagnostics": self.diagnostics(catalog, {"proposal": "passed"}),
        }

    @staticmethod
    def request_signature(request):
        return json.dumps(
            {
                "prompt": request.prompt,
                "context": request.context or "",
                "time_range": (
                    request.time_range.model_dump(mode="json")
                    if request.time_range
                    else None
                ),
                "domain": request.domain,
                "branch": request.branch,
                "date_range": request.date_range,
            },
            sort_keys=True,
        )

    def generate(self, request):
        catalog = self.catalog()
        session = get_session(request.session_id) if request.session_id else None
        if request.session_id and not session:
            raise AnalysisError(
                "session", "Proposal/session expired; propose the request again"
            )
        if session:
            if session.proposed_request != self.request_signature(request):
                raise AnalysisError(
                    "session",
                    "Request changed after proposal; propose the updated request",
                )
            if session.schema_fingerprint != catalog.fingerprint:
                raise AnalysisError(
                    "schema_changed",
                    "Schema changed after proposal; approve a refreshed interpretation",
                )
            grounded = catalog.ground(
                AnalysisSpec.model_validate(session.analysis_spec)
            )
            grounded.period = deepcopy(session.grounded_spec["period"])
            plans = build_plans(grounded, catalog)
        else:
            grounded, plans, info = self._meaning(request, catalog)
            session = create_session(request.prompt, request.domain or "auto")
            session.proposed_request = self.request_signature(request)
            session.proposed_prompt = request.prompt
        with session.analysis_lock:
            return self.report(grounded, plans, catalog, session)

    def refine(self, request):
        if not request.session_id:
            raise AnalysisError(
                "session", "A server-side report session is required for refinement"
            )
        session = get_session(request.session_id)
        if not session or not session.approved:
            raise AnalysisError(
                "session", "Report session expired or has no validated report"
            )
        with session.analysis_lock:
            if request.current_report.get("revision") != session.revision:
                raise AnalysisError(
                    "session",
                    "This report version is stale; refine the current validated version",
                )
            catalog = self.catalog()
            if session.schema_fingerprint != catalog.fingerprint:
                raise AnalysisError(
                    "schema_changed",
                    "Schema changed; generate a refreshed report before refinement",
                )
            old = AnalysisSpec.model_validate(session.analysis_spec)
            spec, patch = refine_spec(old, request.feedback, catalog, self.call)
            grounded = catalog.ground(spec)
            if old.time_range == spec.time_range:
                grounded.period = deepcopy(session.grounded_spec["period"])
            plans = build_plans(grounded, catalog)
            reuse = (
                session.report_response.get("result_sets")
                if [p.model_dump(mode="json") for p in plans] == session.query_plans
                else None
            )
            response = self.report(
                grounded, plans, catalog, session, reuse=reuse, patch=patch
            )
            session.add_turn("user", request.feedback)
            return response

    def report(self, grounded, plans, catalog, session, reuse=None, patch=None):
        grounded.relationships = list(
            {json.dumps(j, sort_keys=True): j for p in plans for j in p.joins}.values()
        )
        self.semantic_info.update(
            {
                "analysis_kind": grounded.analysis_spec.analysis_kind,
                "analysis_spec_confidence": grounded.analysis_spec.confidence,
                "grounded_table_count": len(
                    {p.source for p in plans}
                    | {j["to_table"] for p in plans for j in p.joins}
                ),
                "grounded_column_count": len(grounded.dimensions),
                "join_path_count": len(grounded.relationships),
                "clarification_required": False,
                "result_reuse": reuse is not None,
                "refinement_patch_fields": (
                    [op.path for op in patch.operations] if patch else []
                ),
            }
        )
        results = {}
        sqls = {}
        contracts = {}
        repair_used = False
        for plan in plans:
            sql = compile_sql(plan, grounded, catalog)
            verdict = validate_sql(sql, plan, grounded, catalog)
            if not verdict.valid:
                raise AnalysisError(
                    verdict.category, "SQL does not preserve the analysis contract"
                )
            if reuse is not None:
                result = deepcopy(reuse[plan.id])
            else:
                try:
                    result = self.execute(sql, row_limit=plan.row_limit + 1)
                except QueryExecutionError as exc:
                    if repair_used:
                        raise AnalysisError(
                            "execution",
                            "Query execution failed; no report was published",
                        ) from exc
                    repair_used = True
                    # Never send database error text/results to providers.
                    candidate = self.call(
                        "repair",
                        json.dumps(
                            {
                                "sql": sql,
                                "error_category": exc.sqlstate or "execution",
                                "query_plan": plan.model_dump(mode="json"),
                                "rule": "Return {sql: string}. Preserve all analytical scope and projections.",
                            }
                        ),
                        {
                            "type": "object",
                            "properties": {"sql": {"type": "string"}},
                            "required": ["sql"],
                            "additionalProperties": False,
                        },
                    )
                    corrected = (
                        candidate.get("sql", "") if isinstance(candidate, dict) else ""
                    )
                    repaired = validate_sql(corrected, plan, grounded, catalog)
                    if not repaired.valid:
                        raise AnalysisError(
                            "repair_rejected",
                            "Repaired SQL failed security/semantic validation",
                        )
                    sql = corrected
                    try:
                        result = self.execute(sql, row_limit=plan.row_limit + 1)
                    except QueryExecutionError as error:
                        raise AnalysisError(
                            "execution",
                            "Query failed after one validated repair; no report was published",
                        ) from error
            contract = validate_results(result, plan, grounded, catalog)
            if not contract.valid:
                raise AnalysisError(
                    "result_contract",
                    "Returned rows violate the analytical contract: "
                    + "; ".join(contract.errors),
                )
            results[plan.id] = {**result, "rows": safe_rows(result["rows"])}
            sqls[plan.id] = sql
            contracts[plan.id] = contract.model_dump()
        charts = []
        visualizations = []
        for plan in plans:
            for visual in choose_visualizations(
                plan, results[plan.id], grounded, catalog
            ):
                verdict = validate_chart(
                    visual, plan, results[plan.id], grounded, catalog
                )
                if not verdict.valid:
                    raise AnalysisError(
                        "visualization_contract", "Chart scope/shape failed validation"
                    )
                visualizations.append(visual.model_dump())
                rendered = render_chart(visual, results[plan.id])
                if rendered:
                    charts.append(rendered)
        charts = charts[: catalog.registry["max_charts"]]
        evidence = grounded_facts(plans, results, grounded)
        # The synthesizer can select/order existing evidence; it cannot invent
        # numeric claims, entity facts, totals, units, or causal conclusions.
        chosen = self.call(
            "synthesis",
            json.dumps(
                {
                    "analysis_spec": grounded.analysis_spec.model_dump(mode="json"),
                    "chart_summaries": [
                        {
                            k: chart[k]
                            for k in (
                                "chart_type",
                                "metric",
                                "unit",
                                "scope_ref",
                                "cardinality",
                            )
                        }
                        for chart in charts
                    ],
                    "evidence": evidence,
                    "rule": "Select useful evidence IDs only. Do not write new factual statements.",
                },
                ensure_ascii=False,
            ),
            {
                "type": "object",
                "properties": {
                    "selected_evidence_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "maxItems": 12,
                    }
                },
                "required": ["selected_evidence_ids"],
                "additionalProperties": False,
            },
        )
        ids = (
            chosen.get("selected_evidence_ids", [])
            if isinstance(chosen, dict) and set(chosen) == {"selected_evidence_ids"}
            else []
        )
        evidence_map = {e["id"]: e for e in evidence}
        valid_selection = (
            isinstance(ids, list)
            and bool(ids)
            and all(isinstance(i, str) and i in evidence_map for i in ids)
        )
        selected = (
            [evidence_map[i] for i in dict.fromkeys(ids)]
            if valid_selection
            else evidence
        )
        facts = [e["statement"] for e in selected]
        main = plans[0]
        first = results[main.id]
        spec = grounded.analysis_spec
        cards = []
        # KPI cards describe a genuine scalar aggregation, never the first
        # member of a ranking relabeled as a whole-population KPI.
        for p in plans:
            if (
                p.kind == "aggregate"
                and not p.dimensions
                and len(results[p.id]["rows"]) == 1
            ):
                for m in p.metrics:
                    metric = grounded.metrics[m]
                    value = results[p.id]["rows"][0][m]
                    cards.append(
                        {
                            "label": metric["business_name"],
                            "value": value,
                            "unit": metric["unit"],
                            "metric": m,
                            "scope_ref": p.id,
                        }
                    )
        self.semantic_info.update(
            {
                "chart_count": len(charts),
                "chart_types": [c["chart_type"] for c in charts],
            }
        )
        from services.analysis_catalog import referenced_columns

        columns = set()
        for plan in plans:
            for dimension in plan.dimensions + [f.dimension for f in plan.filters]:
                desc = catalog.registry["dimensions"][dimension]
                columns.add((desc["table"], desc["column"]))
            for raw in (
                list(plan.metric_expressions.values())
                + [j["on"] for j in plan.joins]
                + ([plan.time_column] if plan.time_column else [])
            ):
                columns.update(referenced_columns(raw))
        self.semantic_info["grounded_column_count"] = len(columns)
        labels = {
            key: value["business_name"]
            for key, value in catalog.registry["dimensions"].items()
        }
        labels.update(
            {key: value["business_name"] for key, value in grounded.metrics.items()}
        )
        labels.update(period="Thời gian", rank_position="Xếp hạng")
        response = {
            "status": "success",
            "pipeline_version": 2,
            "prompt": session.original_prompt,
            "session_id": session.session_id,
            "revision": session.revision + (1 if session.approved else 0),
            "title": grounded.subject["business_name"],
            "description": "Phân tích theo hợp đồng ngữ nghĩa đã kiểm chứng.",
            "analysis_spec": spec.model_dump(mode="json"),
            "grounded_analysis_spec": grounded.model_dump(mode="json"),
            "query_plans": [p.model_dump(mode="json") for p in plans],
            "schema_fingerprint": catalog.fingerprint,
            "interpretation": self.interpreted(grounded),
            "interpreted_request": self.interpreted(grounded),
            "assumptions": spec.assumptions,
            "kpis": {},
            "kpi_cards": cards,
            "charts": charts,
            "visualization_specs": visualizations,
            "table_data": {
                "title": grounded.subject["business_name"],
                "columns": first["columns"],
                "column_labels": {
                    key: labels.get(key, key) for key in first["columns"]
                },
                "rows": first["rows"],
                "total_rows": len(first["rows"]),
            },
            "result_sets": results,
            "result_contracts": contracts,
            "executive_summary": " ".join(facts),
            "key_findings": [
                {
                    "finding": (
                        grounded.metrics[e["field"]]["business_name"]
                        if e["field"] in grounded.metrics
                        else (
                            "Số dòng trả về"
                            if e["field"] == "returned_rows"
                            else "Phạm vi không có dữ liệu"
                        )
                    ),
                    "value": e["value"],
                    "comment": e["statement"],
                    "evidence_id": e["id"],
                }
                for e in selected
            ],
            "conclusions": [],
            "recommendations": [],
            "ai_insights": [],
            "evidence": evidence,
            "sql": {"main": sqls[main.id]},
            "sql_query": sqls[main.id],
            "sql_by_query": sqls,
            "data_warnings": (
                ["Không có dữ liệu trong phạm vi yêu cầu."]
                if all(not r["rows"] for r in results.values())
                else []
            )
            + (
                [
                    "Một số biểu đồ yêu cầu không phù hợp với dữ liệu; hãy xem bảng kết quả."
                ]
                if spec.requested_visualizations and not charts
                else []
            ),
            "metadata_used": {
                "tables": sorted(
                    {p.source for p in plans}
                    | {j["to_table"] for p in plans for j in p.joins}
                )
            },
            "provider": {
                "planner": "deterministic",
                "synthesis": (
                    "evidence_selection" if valid_selection else "grounded_fallback"
                ),
            },
            "created_at": datetime.now().astimezone().isoformat(),
            "assistant_reply": (
                "Đã áp dụng thay đổi và giữ nguyên các phạm vi không được yêu cầu sửa."
                if patch
                else ""
            ),
            "spec_patch": patch.model_dump(mode="json") if patch else None,
            "diagnostics": self.diagnostics(
                catalog,
                {
                    "plan": "passed",
                    "sql_semantics": "passed",
                    "security": "passed",
                    "results": "passed",
                    "visualizations": "passed",
                    "synthesis": (
                        "evidence_selection" if valid_selection else "grounded_fallback"
                    ),
                },
            ),
        }
        session.analysis_spec = spec.model_dump(mode="json")
        session.grounded_spec = grounded.model_dump(mode="json")
        session.schema_fingerprint = catalog.fingerprint
        session.query_plans = response["query_plans"]
        session.last_result_contract = contracts
        session.approved = True
        session.revision = response["revision"]
        session.diagnostics = response["diagnostics"]
        session.report_response = deepcopy(response)
        session.update_state(
            response["sql"],
            {"table_rows": first["rows"], "row_count": len(first["rows"])},
            response["title"],
            response["description"],
        )
        session.add_turn("assistant", response["executive_summary"])
        return response

    def feedback(self, request):
        session = get_session(request.session_id) if request.session_id else None
        if (
            not session
            or request.revision is not None
            and request.revision != session.revision
        ):
            return {"status": "recorded", "verified_example": False}
        catalog = self.catalog()
        verified = record_verified(session, request.rating, catalog.fingerprint)
        return {
            "status": "recorded",
            "verified_example": verified,
            "schema_fingerprint": catalog.fingerprint,
        }


def safe_failure(error):
    category = getattr(error, "category", "internal")
    clarification = category in (
        "clarification",
        "unsupported",
        "session",
        "schema_changed",
        "patch",
    )
    message = (
        str(error)
        if isinstance(error, AnalysisError)
        else "Analysis could not be validated; no report was published"
    )
    return {
        "status": "needs_clarification" if clarification else "error",
        "question": message,
        "message": message,
        "assistant_reply": message,
        "options": getattr(error, "choices", []),
        "diagnostics": {"pipeline_version": 2, "error_category": category},
        "charts": [],
    }
