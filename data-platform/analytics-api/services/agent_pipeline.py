"""Production V2.4 orchestration. One provider decision owns business meaning."""

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
from services.explanation_service import explain_analysis
from services.analyst_contract import DashboardPlan, AgentState
from services.domain_intelligence_service import DomainIntelligence, DEPTH_POLICIES


class AnalysisPipeline:
    def __init__(
        self,
        metadata_loader=None,
        provider=None,
        executor=None,
        value_lookup=None,
        budget=None,
        planning_mode="one_shot",
        owner_id=None,
        module_repository=None,
    ):
        if planning_mode not in {"one_shot", "legacy"}:
            raise ValueError("Unknown planning mode")
        self.owner_id = owner_id
        self.module_repository = module_repository
        self.planning_mode = planning_mode
        self.metadata_loader = metadata_loader or (
            lambda: get_local_metadata(force=True)
        )
        self.provider = provider or NativeAgentProvider(legacy_policy=planning_mode == "legacy")
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
            "pipeline_version": "2.6" if self.planning_mode == "one_shot" else "2.3",
            "schema_fingerprint": catalog.fingerprint,
            **deepcopy(self.semantic_info),
            "provider_call_count": self.semantic_info.get("provider_call_count", len(self.calls)),
            "provider_attempt_count": self.semantic_info.get("provider_attempt_count", len(self.calls)),
            "provider_model": self.calls[-1].get("model") if self.calls else None,
            "provider_api_style": self.calls[-1].get("api_style") if self.calls else None,
            "llm_stage_count": self.semantic_info.get("agent_rounds", 0),
            "agent_round_count": self.semantic_info.get("agent_rounds", 0),
            "repair_round_count": self.semantic_info.get("contract_repair_count", 0),
            "planner": "logical_algebra_catalog_compiler",
            "embedding_call_count": 0,
            "retrieval": {
                "strategy": "compact_domain_intelligence" if self.planning_mode == "one_shot" else "model_requested_semantic_tools",
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
                    "analysis_context",
                    "analysis_expectation",
                    "analysis_module_id",
                    "analysis_module_name",
                    "reference_date",
                    "context",
                    "time_range",
                    "domain",
                    "analysis_depth",
                    "analysis_scope",
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
        domain = request.domain or "auto"
        profiles = DomainIntelligence(catalog).available()
        if domain not in {"auto", "multi", *profiles}:
            raise AnalysisError("unsupported_domain", "Selected domain is unavailable")
        context = {
            "user_context": (request.context or "")[:1500],
            "domain": domain,
            "required_domain": domain if domain not in {"auto", "multi"} else None,
            "analysis_depth": getattr(request, "analysis_depth", "deep"),
        }
        context.update(natural_input=request.natural_input)
        if request.natural_input:
            context.update(analysis_context=request.analysis_context, analysis_expectation=request.analysis_expectation)
        ui = request.time_range
        period = None
        if ui and ui.mode != "auto":
            if ui.mode in {"current_month", "previous_month", "current_quarter", "previous_quarter", "current_year", "previous_year", "all_time"}:
                from services.analysis_catalog import resolve_period
                from services.analysis_contract import TimeScope
                resolved = resolve_period(TimeScope(mode=ui.mode, timezone=catalog.registry["timezone"]), reference)
                period = {k: resolved[k] for k in ("start", "end")}
            else:
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
        scope = getattr(request, "analysis_scope", None)
        if scope:
            context["scope_mode"] = scope.mode
            # Only structured semantic filters are interpreted here. Exact
            # enum aliases are local; names/IDs require the existing safe lookup.
            from services.semantic_tools import SemanticTools
            resolver = SemanticTools(catalog, self.value_lookup)
            canonical = []
            for f in scope.filters:
                definition = catalog.registry["dimensions"].get(f.dimension)
                if not definition or not definition.get("scope_selectable"):
                    raise AnalysisError("query_scope", "Unsupported selected scope")
                values = f.value if isinstance(f.value, list) else [f.value]
                grounded = []
                for v in values:
                    answer = resolver.resolve({"dimension": f.dimension, "reference": str(v)}, allow_lookup=resolver.lookup_count < self.budget.value_lookups)
                    if answer["status"] != "resolved":
                        raise AnalysisError("filter_value_unknown", "Selected scope could not be resolved")
                    grounded.append(answer["value"])
                canonical.append({"dimension": f.dimension, "operator": f.operator, "value": grounded if isinstance(f.value, list) else grounded[0]})
            context["required_filters"] = canonical
            context["scope_lookup_count"] = resolver.lookup_count
        branch = (request.branch or "").strip()
        if branch and branch.lower() != "all" and (not scope or scope.mode == "auto"):
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

    def agent(self, catalog, reference, proposal=False, previous=None, known_concepts=None):
        from services.one_shot_planner import OneShotPlanner

        planner = OneShotPlanner if self.planning_mode == "one_shot" else DataAnalystAgent
        agent = planner(
            catalog,
            self.provider,
            self.executor,
            self.value_lookup,
            reference,
            self.semantic_info,
            self.budget,
            proposal,
            previous,
            **({"legacy_mode": True} if self.planning_mode == "legacy" else {}),
        )
        # References come only from fingerprint-checked server sessions.
        for ref in known_concepts or []:
            kind, _, id = ref.partition(":")
            if kind in ("subject", "metric", "dimension") and id in catalog.registry[kind + "s"]:
                agent.semantic.discovered.add((kind, id))
        self._last_agent = agent
        return agent

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
            if any(f not in [v.model_dump(mode="json") for v in a.query.filters] for f in context.get("required_filters", [])):
                raise AnalysisError("query_scope", "Analysis conflicts with selected UI population")
            if context.get("scope_mode") == "all" and a.query.filters:
                raise AnalysisError("query_scope", "Analysis narrowed the selected entire-system population")

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
            for metric in value["metrics"]:
                metric["grain"] = next(a.grounded.metrics[m]["grain"] for m in a.plan.metrics if a.grounded.metrics[m]["business_name"] == metric["label"])
            value["time_range"] = a.grounded.period
            value.update(
                id=f"Phần {index+1}",
                query_id=a.query.id,
                role=a.query.role,
                parent_id=a.query.parent_id,
                purpose=a.query.purpose,
                **self.domain_meaning(a),
                granularity=a.query.granularity if a.query.operation == "trend" else None,
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
        main["analysis_breadth"] = self.semantic_info.get("analysis_depth", "deep")
        main["analysis_depth"] = self.semantic_info.get("analysis_depth", "deep")
        main["domains"] = list({p.get("domain_id"): {"id": p.get("domain_id"), "label": p.get("domain_label")} for p in parts if p.get("domain_id")}.values())
        return main

    def domain_meaning(self, artifact):
        p = DomainIntelligence(self._active_catalog).domain_for(artifact.query.subject)
        if not p:
            return {}
        lens = next((l for l in p["analytical_lenses"] if l["id"] == artifact.query.lens_id), None)
        return {"domain_id": p["domain_id"], "domain_label": p["business_label"],
                "lens_label": lens["business_label"] if lens else None,
                "population_relation": artifact.query.population_relation}

    def save_meaning(self, session, artifacts, catalog, reference, plan):
        session.analysis_depth = self.semantic_info.get("analysis_depth", session.analysis_depth)
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
            analytical_features(artifacts, catalog)
            if all(a.result is not None for a in artifacts.values())
            else []
        )
        selected_refs = set()
        for a in artifacts.values():
            q = a.query
            selected_refs.add(("subject", q.subject))
            selected_refs.update(("metric", m) for m in q.metrics)
            selected_refs.update(("dimension", d) for d in [*q.group_by, *q.project, *[f.dimension for f in q.filters], *(q.ranking.per_group if q.ranking else [])])
            selected_refs.update(("metric" if s.field in catalog.registry["metrics"] else "dimension", s.field)
                                 for s in q.order_by)
        references = selected_refs if self.planning_mode == "one_shot" else self._last_agent.semantic.discovered | selected_refs
        session.agent_state = AgentState(
            goal=session.original_prompt[:8000],
            resolved_concepts=sorted(f"{kind}:{id}" for kind, id in references),
            operation_refs=list(artifacts),
            result_refs=[id for id, a in artifacts.items() if a.result is not None],
            evidence_refs=[e["id"] for e in evidence],
            dashboard=plan,
        ).model_dump(mode="json")

    def propose(self, request):
        catalog = self.catalog()
        reference = self.reference(request, catalog)
        context = self.ui_context(request, catalog, reference)
        previous, concepts, module = {}, [], None
        if request.analysis_module_id or request.analysis_module_name:
            from services.analysis_module_service import AnalysisModules
            modules = AnalysisModules(self.module_repository)
            module = modules.resolve(self.owner_id, request.analysis_module_id, request.analysis_module_name, catalog)
            previous, concepts = modules.prepare_context(self, module, catalog, reference, context)
        artifacts, plan = self.agent(catalog, reference, proposal=True, previous=previous, known_concepts=concepts).run(request.prompt, context)
        self.enforce_ui(artifacts, context)
        session = create_session(request.prompt, request.domain or "auto")
        session.owner_id = self.owner_id
        session.natural_input = request.natural_input
        session.analysis_inputs = {"original_question": request.prompt, "analysis_context": request.analysis_context, "analysis_expectation": request.analysis_expectation}
        session.input_time_strategy = request.time_range.model_dump(mode="json") if request.time_range else {"mode": "auto"}
        session.module_provenance = {"module_id": module["module_id"], "name": module["name"], "mode": "reference"} if module else None
        session.ui_constraints = deepcopy(context)
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
                    "name": catalog.overlay["silver_tables"].get(t, {}).get(
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
                    "domain_id": p.get("domain_id"),
                    "domain_label": p.get("domain_label"),
                    "lens_label": p.get("lens_label"),
                }
                for p in meaning["operations"]
            ],
            "report_sections": [
                "Phạm vi phân tích",
                "Kết quả đã kiểm chứng",
                "Nhận định từ bằng chứng",
            ],
            "analysis_spec": session.analysis_spec,
            "domain_groups": meaning["domains"],
            "analysis_explanation": explain_analysis(artifacts, catalog),
            "session_id": session.session_id,
        }
        response = {
            "status": "proposal_ready",
            "prompt": request.prompt,
            "proposal": proposal,
            "session_id": session.session_id,
            "analysis_spec": session.analysis_spec,
            "interpretation": meaning,
            "diagnostics": self.diagnostics(catalog, {"proposal": "passed"}),
        }
        session.diagnostics = deepcopy(response["diagnostics"])
        return response

    def generate(self, request):
        catalog = self.catalog()
        session = get_session(request.session_id) if request.session_id else None
        if request.session_id and not session:
            raise AnalysisError("session", "Session expired")
        if session:
            self.check_owner(session)
            with session.analysis_lock:
                if self.planning_mode == "one_shot" and session.contract_version != "2.5":
                    raise AnalysisError("schema_changed", "Refresh the analysis proposal")
                if session.proposed_request != self.request_signature(request):
                    raise AnalysisError("session", "Request changed after proposal")
                if session.schema_fingerprint != catalog.fingerprint:
                    raise AnalysisError("schema_changed", "Refresh proposal")
                reference = date.fromisoformat(session.agent_reference_date)
                agent = self.agent(catalog, reference, previous=session.agent_artifacts,
                    known_concepts=session.agent_state.get("resolved_concepts", []))
                agent.queries.ui_context = deepcopy(session.ui_constraints)
                self.semantic_info.update(analysis_depth=session.analysis_depth,
                    target_visual_count=DEPTH_POLICIES[session.analysis_depth]["target_views"][-1])
                self.semantic_info["proposal_diagnostics"] = {
                    key: deepcopy(session.diagnostics.get(key)) for key in (
                        "agent_rounds", "semantic_tool_calls", "contract_repair_count",
                        "contract_rejection_count", "contract_normalization_count", "cost_rounds")
                }
                if self.planning_mode == "one_shot":
                    self.semantic_info["proposal_diagnostics"] = {
                        key: deepcopy(session.diagnostics.get(key)) for key in (
                            "provider_call_budget", "provider_call_count", "provider_attempt_count",
                            "semantic_manifest_chars", "decision_schema_chars", "total_context_chars",
                            "analysis_depth", "supporting_operation_limit", "target_visual_count",
                            "input_tokens", "output_tokens", "omitted_supporting_operation_count",
                            "contract_repair_count", "contract_rejection_count", "planning_retry_reason",
                            "repair_context_chars", "transport_retry_count")}
                    for key in ("omitted_supporting_operations", "omitted_supporting_operation_count", "limitations"):
                        self.semantic_info[key] = deepcopy(session.diagnostics.get(key, self.semantic_info[key]))
                try:
                    for id, old in session.agent_artifacts.items():
                        args = old.query.model_dump(mode="json")
                        args.update(replaces=None, changed_fields=[])
                        try:
                            agent.queries.run(agent.queries.prepare(args))
                        except AnalysisError as exc:
                            if self.planning_mode != "one_shot" or old.query.role == "requested":
                                raise
                            agent.omit(exc)
                            self.semantic_info["limitations"].append({"reason": "supporting_execution", "message": "Một kết quả hỗ trợ chưa vượt qua kiểm chứng nên đã được bỏ qua."})
                except AnalysisError as exc:
                    self.semantic_info.update(terminal_error=exc.category)
                    if exc.category in ("execution", "result_contract"):
                        self.semantic_info.update(
                            execution_status="failed" if exc.category == "execution" else "passed",
                            result_status="failed" if exc.category == "result_contract" else "not_started")
                    raise
                artifacts = agent.queries.artifacts
                plan = DashboardPlan.model_validate(session.dashboard_plan)
                plan.active_query_ids = list(artifacts)
                self.semantic_info.update(agent_contract_status="valid_with_omitted_support" if self.semantic_info.get("omitted_supporting_operation_count") else "valid")
                self.semantic_info.update(semantic_status="grounded", execution_status="passed", result_status="passed")
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
        self.check_owner(session)
        with session.analysis_lock:
            if request.current_report.get("revision") != session.revision:
                raise AnalysisError("session", "Stale report revision")
            catalog = self.catalog()
            if catalog.fingerprint != session.schema_fingerprint:
                raise AnalysisError("schema_changed", "Stored schema changed")
            if self.planning_mode == "one_shot" and session.contract_version != "2.5":
                raise AnalysisError("schema_changed", "Refresh the analysis proposal")
            reference = date.fromisoformat(session.agent_reference_date)
            if request.visual_changes:
                return self.refine_visuals(request, session, catalog, reference)
            if not request.feedback.strip():
                raise AnalysisError("invalid_analysis_contract", "Empty refinement")
            artifacts, plan = self.agent(
                catalog, reference, previous=session.agent_artifacts,
                known_concepts=session.agent_state.get("resolved_concepts", [])
            ).run(request.feedback, {
                **session.ui_constraints,
                "analysis_depth": session.analysis_depth,
                "revision": session.revision,
                "current_visuals": [{k: c.get(k) for k in ("id", "scope_ref", "chart_type", "metrics")}
                                    for c in session.report_response.get("charts", [])],
            })
            return self.report(
                artifacts, plan, catalog, session, reference, refined=True
            )

    def refine_visuals(self, request, session, catalog, reference):
        from services.dashboard_planner_service import chart_reason, comparison_reason
        from services.analyst_contract import DashboardVisual

        agent = self.agent(catalog, reference, previous=session.agent_artifacts)
        agent.queries.ui_context = deepcopy(session.ui_constraints)
        for old in session.agent_artifacts.values():
            args = old.query.model_dump(mode="json")
            args.update(replaces=None, changed_fields=[])
            agent.queries.run(agent.queries.prepare(args))  # Revalidate cached rows, no SQL.
        artifacts = agent.queries.artifacts
        plan = DashboardPlan.model_validate(session.dashboard_plan)
        evidence = analytical_features(artifacts, catalog)
        current = build_dashboard(artifacts, evidence, plan, self.budget.charts, self.budget.categories, self.budget.series)
        # Include validated defaults supplied by the dashboard when a prior
        # optional visual was ineligible. These are genuine server chart choices.
        visuals = [DashboardVisual.model_validate(v) for v in current["dashboard_plan"]["visuals"]]
        seen = set()
        for change in request.visual_changes:
            if change.chart_id in seen:
                raise AnalysisError("dashboard_contract", "Duplicate visual change")
            seen.add(change.chart_id)
            chart = next((c for c in current["charts"] if c["id"] == change.chart_id), None)
            if not chart:
                raise AnalysisError("dashboard_contract", "Unknown server chart")
            candidate = next((v for v in visuals if v.query_id == chart["scope_ref"] and v.chart_type == chart["chart_type"] and v.metrics == chart["metrics"]), None)
            if not candidate:
                raise AnalysisError("dashboard_contract", "Unknown stored visual")
            updated = candidate.model_copy(update={"chart_type": change.chart_type})
            reason = comparison_reason(updated, artifacts) if updated.compare_query_ids else chart_reason(updated, artifacts[updated.query_id], self.budget.categories, self.budget.series)
            if reason:
                raise AnalysisError("dashboard_contract", "Unsupported visual for this result")
            visuals[visuals.index(candidate)] = updated
        plan.visuals = visuals
        self.semantic_info.update(agent_contract_status="valid", refinement_mode="structured_visual", result_reuse=True)
        return self.report(artifacts, plan, catalog, session, reference, refined=True)

    def report(self, artifacts, plan, catalog, session, reference, refined=False):
        evidence = analytical_features(artifacts, catalog)
        dashboard = build_dashboard(
            artifacts,
            evidence,
            plan,
            self.budget.charts,
            self.budget.categories,
            self.budget.series,
            catalog=catalog,
        )
        if session.natural_input:
            for a in artifacts.values():
                if a.query.role != "requested":
                    continue
                if not a.result["rows"]:
                    raise AnalysisError("insufficient_data", "No rows for the requested population")
                if a.plan.kind != "detail" and (a.plan.dimensions or a.plan.kind == "trend") and not any(a.query.id in c.get("scope_refs", [c["scope_ref"]]) for c in dashboard["charts"]):
                    # The validated table already contains every row. A visual
                    # density/shape limit must not discard successful analysis.
                    reasons = sorted({v["reason"] for v in dashboard["dashboard_plan"]["omitted_visuals"] if v["query_id"] == a.query.id})
                    self.semantic_info.setdefault("table_fallbacks", []).append({"query_id": a.query.id, "reasons": reasons or ["no_eligible_visual"]})
                    self.semantic_info.setdefault("limitations", []).append({"reason": "table_fallback", "message": "Một góc nhìn được trình bày trong bảng dữ liệu đầy đủ vì cấu trúc hoặc số nhóm chưa phù hợp với biểu đồ."})
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
        depth = self.semantic_info.get("analysis_depth", session.analysis_depth)
        if depth in DEPTH_POLICIES:
            target = DEPTH_POLICIES[depth]["target_views"]
            self.semantic_info["depth_coverage"] = {
                "target_views": target, "validated_views": len(dashboard["charts"]),
                "status": "adequate" if len(dashboard["charts"]) >= target[0] else "limited",
                "planned_operations": len(artifacts),
            }
        meaning = self.interpretation(artifacts)
        domain_summary = []
        for domain in meaning["domains"]:
            query_ids = [p["query_id"] for p in meaning["operations"] if p.get("domain_id") == domain["id"]]
            domain_summary.append({**domain, "query_ids": query_ids,
                "requested_operations": sum(artifacts[id].query.role == "requested" for id in query_ids),
                "supporting_operations": sum(artifacts[id].query.role == "supporting" for id in query_ids),
                "evidence_refs": [e["id"] for e in evidence if e["scope_ref"] in query_ids]})
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
            semantic_status="grounded",
            execution_status="failed" if self.semantic_info.get("execution_status") == "failed" else "passed",
            result_status="failed" if self.semantic_info.get("result_status") == "failed" else "passed",
            query_plan_count=len(artifacts),
            result_row_count=sum(len(a.result["rows"]) for a in artifacts.values()),
            evidence_count=len(evidence),
            omitted_chart_count=len(dashboard["dashboard_plan"]["omitted_visuals"]),
            registered_requested_operations=sum(a.query.role == "requested" for a in artifacts.values()),
            registered_supporting_operations=sum(a.query.role == "supporting" for a in artifacts.values()),
            requested_operation_count=sum(a.query.role == "requested" for a in artifacts.values()),
            supporting_operation_count=sum(a.query.role == "supporting" for a in artifacts.values()),
        )
        response = {
            "status": "success",
            "completion_status": (
                "partial" if self.semantic_info.get("limitations") else "complete"
            ),
            "pipeline_version": "2.6" if self.planning_mode == "one_shot" else "2.3",
            "prompt": session.original_prompt,
            "module_provenance": session.module_provenance,
            "analysis_breadth": self.semantic_info.get("analysis_depth", session.analysis_depth),
            "session_id": session.session_id,
            "revision": session.revision + (1 if session.approved else 0),
            "title": meaning["subject"],
            "description": "Phân tích từ các kết quả đã kiểm chứng.",
            "domain_summary": domain_summary,
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
            "analysis_explanation": explain_analysis(
                artifacts, catalog, dashboard["charts"], evidence
            ),
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

    def check_owner(self, session):
        if session.owner_id != self.owner_id:
            raise AnalysisError("session", "Owned server session required")

    def feedback(self, request):
        session = get_session(request.session_id) if request.session_id else None
        if (
            not session
            or request.revision is not None
            and request.revision != session.revision
        ):
            return {"status": "recorded", "verified_example": False}
        self.check_owner(session)
        catalog = self.catalog()
        return {
            "status": "recorded",
            "verified_example": record_verified(
                session, request.rating, catalog.fingerprint
            ),
            "schema_fingerprint": catalog.fingerprint,
        }
