"""Production V2.2 orchestration. Meaning belongs to the native tool agent."""

import json
import time
from copy import deepcopy
from datetime import date, datetime, timedelta
from services.analysis_catalog import AnalysisCatalog, AnalysisError
from services.data_analyst_agent import DataAnalystAgent, AgentBudget
from services.agent_provider import NativeAgentProvider
from services.metadata_service import get_local_metadata, lookup_dimension_values
from services.sql_service import execute_read_only
from services.session_service import create_session, get_session
from services.insight_service import analytical_features, grounded_narrative
from services.dashboard_planner_service import build_dashboard
from services.verified_analysis_service import record_verified
from services.analyst_contract import DashboardPlan, AgentState


class AnalysisPipeline:
    def __init__(
        self,
        metadata_loader=None,
        provider=None,
        executor=None,
        value_lookup=None,
        budget=None,
    ):
        self.metadata_loader = metadata_loader or (
            lambda: get_local_metadata(force=True)
        )
        self.provider = provider or NativeAgentProvider()
        self.executor = executor or execute_read_only
        self.value_lookup = value_lookup or lookup_dimension_values
        self.budget = budget or AgentBudget.from_env()
        self.semantic_info = {}
        self.embedding_calls = 0
        self.started = time.perf_counter()

    @property
    def calls(self):
        return self.semantic_info.get("provider_calls", [])

    def catalog(self):
        try:
            self._active_catalog = AnalysisCatalog(self.metadata_loader())
            return self._active_catalog
        except Exception as exc:
            raise AnalysisError("metadata", "Current metadata unavailable") from exc

    def diagnostics(self, catalog, validation=None):
        return {
            "pipeline_version": "2.2",
            "schema_fingerprint": catalog.fingerprint,
            **deepcopy(self.semantic_info),
            "provider_call_count": len(self.calls),
            "llm_stage_count": self.semantic_info.get("agent_rounds", 0),
            "planner": "logical_algebra_catalog_compiler",
            "embedding_call_count": 0,
            "retrieval": {
                "strategy": "model_requested_semantic_tools",
                "vector_status": "not_requested",
            },
            "validation": validation or {},
            "timings_ms": {
                "total": round((time.perf_counter() - self.started) * 1000, 2)
            },
        }

    @staticmethod
    def request_signature(request):
        return json.dumps(
            {
                k: request.model_dump(mode="json").get(k)
                for k in (
                    "prompt",
                    "reference_date",
                    "context",
                    "time_range",
                    "domain",
                    "branch",
                    "date_range",
                )
            },
            sort_keys=True,
        )

    def reference(self, request, catalog):
        from services.analysis_understanding import catalog_today

        return getattr(request, "reference_date", None) or catalog_today(
            catalog.registry["timezone"]
        )

    def ui_context(self, request, catalog, reference):
        # Structured UI scope only; never scan the natural-language request.
        context = {
            "user_context": (request.context or "")[:1500],
            "domain_hint": request.domain,
        }
        ui = request.time_range
        period = None
        if ui and ui.mode != "auto":
            days = (
                1
                if ui.mode == "today"
                else int(ui.mode[:-1]) if ui.mode != "custom" else None
            )
            period = (
                {"start": str(ui.start), "end": str(ui.end)}
                if ui.mode == "custom"
                else {
                    "start": str(reference - timedelta(days=days - 1)),
                    "end": str(reference),
                }
            )
        elif request.date_range:
            import re

            value = request.date_range.lower().strip()
            match = re.fullmatch(r"(\d+)(?:days|d)", value)
            if match or value == "today":
                days = int(match.group(1)) if match else 1
                if not 1 <= days <= 3660:
                    raise AnalysisError("clarification", "Invalid UI time window")
                period = {
                    "start": str(reference - timedelta(days=days - 1)),
                    "end": str(reference),
                }
            elif value == "all":
                period = {"start": None, "end": None}
            else:
                raise AnalysisError("clarification", "Use structured UI time range")
        context["required_period"] = period
        branch = (request.branch or "").strip()
        if branch and branch.lower() != "all":
            from services.value_grounding_service import (
                aliases_for,
                dimension_values,
                value_text,
            )

            city = aliases_for(catalog, "city", dimension_values(catalog, "city")).get(
                value_text(branch)
            )
            context["required_filter"] = {
                "dimension": "city" if city else "store_id",
                "operator": "eq",
                "value": city or branch,
            }
        return context

    def agent(self, catalog, reference, proposal=False, previous=None):
        return DataAnalystAgent(
            catalog,
            self.provider,
            self.executor,
            self.value_lookup,
            reference,
            self.semantic_info,
            self.budget,
            proposal,
            previous,
        )

    @staticmethod
    def enforce_ui(artifacts, context):
        for a in artifacts.values():
            period = context.get("required_period")
            if period and any(
                a.grounded.period[k] != period[k] for k in ("start", "end")
            ):
                raise AnalysisError(
                    "time_range_ambiguous", "Analysis conflicts with selected UI period"
                )
            required = context.get("required_filter")
            if required and required not in [
                f.model_dump(mode="json") for f in a.query.filters
            ]:
                raise AnalysisError(
                    "clarification", "Analysis omitted selected UI population"
                )

    def interpretation(self, artifacts):
        from services.analysis_understanding import labelled_interpretation

        parts = []
        metrics = []
        for index, a in enumerate(artifacts.values()):
            data = a.grounded.analysis_spec.model_dump(mode="json")
            data.update(
                metrics=a.query.metrics,
                dimensions=a.query.group_by,
                filters=[f.model_dump(mode="json") for f in a.query.filters],
                ranking=a.query.ranking.model_dump() if a.query.ranking else None,
            )
            value = labelled_interpretation(self._active_catalog, data)
            value["time_range"] = a.grounded.period
            value.update(
                id=f"Phần {index+1}",
                query_id=a.query.id,
                role=a.query.role,
                kind=value["analysis_kind"],
            )
            value["components"] = []
            parts.append(value)
            metrics += value["metrics"]
        main = deepcopy(parts[0])
        if len(parts) > 1:
            main.update(
                subject="; ".join(dict.fromkeys(p["subject"] for p in parts)),
                analysis_kind="composite",
                metrics=list({m["label"]: m for m in metrics}.values()),
            )
        main["operations"] = parts
        return main

    def save_meaning(self, session, artifacts, catalog, reference, plan):
        main = next(iter(artifacts.values()))
        session.analysis_spec = main.grounded.analysis_spec.model_dump(mode="json")
        session.grounded_spec = main.grounded.model_dump(mode="json")
        session.query_plans = [
            a.plan.model_dump(mode="json") for a in artifacts.values()
        ]
        session.schema_fingerprint = catalog.fingerprint
        session.agent_artifacts = deepcopy(artifacts)
        for artifact in session.agent_artifacts.values():
            artifact.query = artifact.query.model_copy(
                update={"replaces": None, "changed_fields": []}
            )
        session.agent_reference_date = reference.isoformat()
        session.dashboard_plan = plan.model_dump(mode="json")
        evidence = (
            analytical_features(artifacts)
            if all(a.result is not None for a in artifacts.values())
            else []
        )
        session.agent_state = AgentState(
            goal=session.original_prompt[:8000],
            resolved_concepts=sorted(
                {f"subject:{a.query.subject}" for a in artifacts.values()}
                | {f"metric:{m}" for a in artifacts.values() for m in a.query.metrics}
                | {
                    f"dimension:{d}"
                    for a in artifacts.values()
                    for d in a.query.group_by
                }
            ),
            operation_refs=list(artifacts),
            result_refs=[id for id, a in artifacts.items() if a.result is not None],
            evidence_refs=[e["id"] for e in evidence],
            dashboard=plan,
        ).model_dump(mode="json")

    def propose(self, request):
        catalog = self.catalog()
        reference = self.reference(request, catalog)
        context = self.ui_context(request, catalog, reference)
        artifacts, plan = self.agent(catalog, reference, proposal=True).run(
            request.prompt, context
        )
        self.enforce_ui(artifacts, context)
        session = create_session(request.prompt, request.domain or "auto")
        session.proposed_prompt = request.prompt
        session.proposed_request = self.request_signature(request)
        self.save_meaning(session, artifacts, catalog, reference, plan)
        meaning = self.interpretation(artifacts)
        proposal = {
            "title": meaning["subject"],
            "summary_intent": "Kiểm tra từng phần, chỉ số, bộ lọc và thời gian trước khi tạo báo cáo.",
            "interpretation": meaning,
            "analytical_queries": [
                a.query.model_dump(mode="json") for a in artifacts.values()
            ],
            "data_sources": [
                {
                    "name": catalog.overlay["silver_tables"][t].get(
                        "business_name", "Nguồn dữ liệu đã kiểm chứng"
                    ),
                    "reason": "Đã đối chiếu metadata",
                }
                for t in sorted({a.plan.source for a in artifacts.values()})
            ],
            "planned_kpis": [
                {"name": m["label"], "description": m["unit"]}
                for m in meaning["metrics"]
            ],
            "planned_charts": [
                {
                    "title": p["subject"],
                    "chart_type": p["kind"],
                    "role": p["role"],
                    "reason": "Kiểm chứng loại biểu đồ sau khi có dữ liệu.",
                }
                for p in meaning["operations"]
            ],
            "report_sections": [
                "Phạm vi phân tích",
                "Kết quả đã kiểm chứng",
                "Nhận định từ bằng chứng",
            ],
            "analysis_spec": session.analysis_spec,
            "session_id": session.session_id,
        }
        return {
            "status": "proposal_ready",
            "prompt": request.prompt,
            "proposal": proposal,
            "session_id": session.session_id,
            "analysis_spec": session.analysis_spec,
            "interpretation": meaning,
            "diagnostics": self.diagnostics(catalog, {"proposal": "passed"}),
        }

    def generate(self, request):
        catalog = self.catalog()
        session = get_session(request.session_id) if request.session_id else None
        if request.session_id and not session:
            raise AnalysisError("session", "Session expired")
        if session:
            with session.analysis_lock:
                if session.proposed_request != self.request_signature(request):
                    raise AnalysisError("session", "Request changed after proposal")
                if session.schema_fingerprint != catalog.fingerprint:
                    raise AnalysisError("schema_changed", "Refresh proposal")
                reference = date.fromisoformat(session.agent_reference_date)
                agent = self.agent(catalog, reference, previous=session.agent_artifacts)
                for id, old in session.agent_artifacts.items():
                    args = old.query.model_dump(mode="json")
                    args.update(replaces=None, changed_fields=[])
                    agent.queries.run(agent.queries.prepare(args))
                if len(agent.queries.artifacts) == 1:
                    artifacts = agent.queries.artifacts
                    plan = DashboardPlan.model_validate(session.dashboard_plan)
                else:
                    agent.queries.previous = agent.queries.artifacts.copy()
                    artifacts, plan = agent.run(request.prompt, final_only=True)
                return self.report(artifacts, plan, catalog, session, reference)
        reference = self.reference(request, catalog)
        context = self.ui_context(request, catalog, reference)
        artifacts, plan = self.agent(catalog, reference).run(request.prompt, context)
        self.enforce_ui(artifacts, context)
        session = create_session(request.prompt, request.domain or "auto")
        session.proposed_request = self.request_signature(request)
        with session.analysis_lock:
            return self.report(artifacts, plan, catalog, session, reference)

    def refine(self, request):
        session = get_session(request.session_id) if request.session_id else None
        if not session or not session.approved:
            raise AnalysisError("session", "Validated server session required")
        with session.analysis_lock:
            if request.current_report.get("revision") != session.revision:
                raise AnalysisError("session", "Stale report revision")
            catalog = self.catalog()
            if catalog.fingerprint != session.schema_fingerprint:
                raise AnalysisError("schema_changed", "Stored schema changed")
            reference = date.fromisoformat(session.agent_reference_date)
            artifacts, plan = self.agent(
                catalog, reference, previous=session.agent_artifacts
            ).run(request.feedback, {"revision": session.revision})
            return self.report(
                artifacts, plan, catalog, session, reference, refined=True
            )

    def report(self, artifacts, plan, catalog, session, reference, refined=False):
        evidence = analytical_features(artifacts)
        dashboard = build_dashboard(
            artifacts,
            evidence,
            plan,
            self.budget.charts,
            self.budget.categories,
            self.budget.series,
        )
        narrative = grounded_narrative(plan, evidence)
        results = {id: deepcopy(a.result) for id, a in artifacts.items()}
        labels = {
            id: v["business_name"] for id, v in catalog.registry["dimensions"].items()
        }
        labels.update(
            {id: v["business_name"] for id, v in catalog.registry["metrics"].items()}
        )
        labels.update(period="Thời gian", rank_position="Xếp hạng")
        for id, result in results.items():
            result.update(
                column_labels={
                    field: labels.get(field, "Trường dữ liệu")
                    for field in result["columns"]
                },
                role=artifacts[id].query.role,
                as_of=artifacts[id].observed_at,
            )
        main = next(iter(artifacts.values()))
        first = results[main.query.id]
        meaning = self.interpretation(artifacts)
        self.semantic_info.update(
            reference_date=reference.isoformat(),
            chart_count=len(dashboard["charts"]),
            chart_types=[c["chart_type"] for c in dashboard["charts"]],
            analytical_feature_count=len(evidence),
            requested_chart_count=dashboard["dashboard_plan"]["requested_chart_count"],
            supporting_chart_count=dashboard["dashboard_plan"][
                "supporting_chart_count"
            ],
            result_reuse=any(a.reused for a in artifacts.values()),
            synthesis_source="validated_features_and_claims",
        )
        response = {
            "status": "success",
            "completion_status": (
                "partial" if self.semantic_info.get("limitations") else "complete"
            ),
            "pipeline_version": "2.2",
            "prompt": session.original_prompt,
            "session_id": session.session_id,
            "revision": session.revision + (1 if session.approved else 0),
            "title": meaning["subject"],
            "description": "Phân tích từ các kết quả đã kiểm chứng.",
            "analysis_spec": main.grounded.analysis_spec.model_dump(mode="json"),
            "analysis_specs": {
                id: a.grounded.analysis_spec.model_dump(mode="json")
                for id, a in artifacts.items()
            },
            "analytical_queries": [
                a.query.model_dump(mode="json") for a in artifacts.values()
            ],
            "grounded_analysis_spec": main.grounded.model_dump(mode="json"),
            "query_plans": [a.plan.model_dump(mode="json") for a in artifacts.values()],
            "schema_fingerprint": catalog.fingerprint,
            "interpretation": meaning,
            "interpreted_request": meaning,
            "assumptions": list(
                dict.fromkeys(
                    s
                    for a in artifacts.values()
                    for s in a.grounded.analysis_spec.assumptions
                )
            ),
            **dashboard,
            **narrative,
            "kpis": {},
            "evidence": evidence,
            "result_sets": results,
            "result_contracts": {id: a.contract for id, a in artifacts.items()},
            "table_data": {
                "title": meaning["subject"],
                "columns": first["columns"],
                "column_labels": first["column_labels"],
                "rows": first["rows"],
                "total_rows": len(first["rows"]),
            },
            "sql": {"main": main.sql},
            "sql_query": main.sql,
            "sql_by_query": {id: a.sql for id, a in artifacts.items()},
            "data_warnings": (
                ["Không có dữ liệu trong phạm vi yêu cầu."]
                if not any(a.result["rows"] for a in artifacts.values())
                else []
            )
            + [v["message"] for v in self.semantic_info.get("limitations", [])],
            "provider": {
                "planner": "catalog_compiler",
                "synthesis": "validated_evidence",
            },
            "created_at": datetime.now().astimezone().isoformat(),
            "assistant_reply": (
                "Đã cập nhật báo cáo theo kế hoạch đã kiểm chứng." if refined else ""
            ),
            "diagnostics": self.diagnostics(
                catalog,
                {
                    "plan": "passed",
                    "sql_semantics": "passed",
                    "security": "passed",
                    "results": "passed",
                    "dashboard": "passed",
                    "insights": "passed",
                },
            ),
        }
        self.save_meaning(session, artifacts, catalog, reference, plan)
        session.last_result_contract = response["result_contracts"]
        session.approved = True
        session.revision = response["revision"]
        session.diagnostics = response["diagnostics"]
        session.report_response = deepcopy(response)
        session.update_state(
            response["sql"],
            {"row_count": len(first["rows"])},
            response["title"],
            response["description"],
        )
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
        return {
            "status": "recorded",
            "verified_example": record_verified(
                session, request.rating, catalog.fingerprint
            ),
            "schema_fingerprint": catalog.fingerprint,
        }
