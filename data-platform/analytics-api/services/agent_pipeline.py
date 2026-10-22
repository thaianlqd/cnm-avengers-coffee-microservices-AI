"""Production V2.4 orchestration. One provider decision owns business meaning."""

import json
import time
import logging
from uuid import uuid4
from copy import deepcopy
from datetime import date, datetime, timedelta
from services.analysis_catalog import AnalysisCatalog, AnalysisError
from fastapi import HTTPException
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
from services.provider_budget import deterministic_dashboard


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
            lambda: get_local_metadata()
        )
        self.provider = provider or NativeAgentProvider(legacy_policy=planning_mode == "legacy")
        self.executor = executor or execute_read_only
        self.value_lookup = value_lookup or lookup_dimension_values
        self.budget = budget or AgentBudget.from_env()
        self.semantic_info = {}
        self.embedding_calls = 0
        self.started = time.perf_counter()
        from services.telemetry import request_id as telemetry_request_id
        self.semantic_info.update(request_id=telemetry_request_id.get() or uuid4().hex,provider_primary_ms=0,provider_repair_ms=0,
            local_grounding_ms=0,metadata_retrieval_ms=0,resolver_ms=0,proposal_persistence_ms=0)

    @property
    def calls(self):
        return self.semantic_info.get("provider_calls", [])

    def catalog(self):
        try:
            self._active_catalog = AnalysisCatalog(self.metadata_loader())
            return self._active_catalog
        except HTTPException:
            raise
        except Exception as exc:
            raise AnalysisError("metadata", "Current metadata unavailable") from exc

    def diagnostics(self, catalog, validation=None):
        from services.analytical_capacity_planner import request_sql_budget
        budget=request_sql_budget.get()
        return {
            'sql_budget':budget.snapshot() if budget is not None else None,
            "pipeline_version": self.semantic_info.get("pipeline_version", "2.8" if self.planning_mode == "one_shot" else "2.3"),
            "schema_fingerprint": catalog.fingerprint,
            "registry_fingerprint": catalog.registry_fingerprint,
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

    def validate_input(self,question,catalog,context=None):
        from services.input_integrity_service import enforce
        try:
            result=enforce(question,catalog,context=context)
        except AnalysisError as error:
            # Preserve the same capability diagnostics as the public preflight
            # even when this earlier, zero-provider boundary rejects a request.
            from services.preflight_service import run
            pf=run(question,catalog=catalog,coverage={})
            self.semantic_info.update(capability=pf['capability'],
                capability_decision=pf['capability']['decision'],
                capability_codes=[c['code'] for c in pf['capability']['constraints']],failure_stage='PRECHECK')
            codes={f['code'] for f in pf['findings'] if f['level']=='block'}
            if 'unrecognized_question' in codes:error.category='unrecognized_question'
            raise
        self.semantic_info.update(input_validation_fingerprint=result['fingerprint'],
            input_policy_version=result['version'],lookup_queries=result['lookup_queries'])
        return result

    @staticmethod
    def request_signature(request):
        from services.input_integrity_service import policy
        return json.dumps(
            {
                'input_policy': policy(),
                'request': {
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
                    "source_analysis",
                    "branch",
                    "date_range",
                    "input_mode",
                    "guided_contract",
                    "dashboard_id",
                    "dashboard_version",
                    "allow_deterministic_upgrade",
                    "analysis_mission",
                )
                }
            },
            sort_keys=True,
        )

    def guided_context(self, request, catalog, reference, context):
        """V3.2: deterministic intent for a guided (or safely upgradable) request.

        Guided slots are re-validated against the registry; nothing from the
        browser is trusted. Free text is upgraded only when the server's own
        preflight resolves every required field with no ambiguity.
        """
        # Independent of planning mode and client decision. Preset labels are
        # server-owned; their typed template/filter validation remains below.
        if getattr(request,'input_mode','free_text')=='guided':
            from services import mission_contract_service as missions
            if not request.guided_contract:raise AnalysisError('guided_contract_invalid','Guided contract required')
            missions.validate_guided(catalog,request.analysis_mission,request.guided_contract.model_dump(exclude_none=True),
                scope_filters=context.get('required_filters') or [])
        if not getattr(request, 'dashboard_id', None) and (request.prompt or request.input_mode!='guided'):
            from services.input_integrity_service import request_text
            validation = self.validate_input(request_text(request), catalog)
            context['input_integrity_policy'] = validation['policy_fingerprint']
            self.semantic_info.update(input_validation_fingerprint=validation['fingerprint'],
                input_policy_version=validation['version'],lookup_queries=validation['lookup_queries'])
            # Every query still passes the existing required-filter coverage
            # guard; a resolved name is not permission to drop its constraint.
            context['required_filters'] = list(context.get('required_filters') or []) + validation['required_filters']
            if request_text(request) != request.prompt:
                from services.scope_resolution_service import resolve_scope
                secondary='\n'.join(str(getattr(request,key) or '') for key in ('analysis_context','analysis_expectation','context'))
                scope=resolve_scope(secondary,catalog,context)
                if scope['state']=='needs_clarification':
                    raise AnalysisError('clarification',scope.get('message','Conflicting input scope'))
                for bound in scope.get('filters',[]):
                    if bound not in context['required_filters']:context['required_filters'].append(bound)
        if getattr(request, 'dashboard_id', None):
            from services.workspace_service import dashboard_template, dashboard_intent
            template = dashboard_template(catalog, request.dashboard_id, request.dashboard_version)
            context['guided_intent'] = dashboard_intent(catalog, request.dashboard_id, request.dashboard_version,
                context.get('required_period'))
            context['dashboard_template'] = {key:template[key] for key in ('id','version','title','limitation')}
            # Presets bind time per historical panel; snapshot/lifetime panels
            # retain their registered as-of meaning in the same dashboard.
            context['dashboard_template']['selected_period'] = context.get('required_period')
            context['required_period'] = None
            # Entire authorized scope still includes immutable preset filters
            # (e.g. the two kiosk types). Client scope filters remain required.
            if context.get('scope_mode') == 'all':
                context['scope_mode'] = 'auto'
            self.semantic_info.update(input_mode='dashboard', guided_contract_used=True,
                guided_source='dashboard', dashboard_template=context['dashboard_template'], preflight_state='READY_GUIDED')
            return
        from services import mission_contract_service as missions
        from services.workspace_service import require_mission
        self.semantic_info.update(input_mode=getattr(request, "input_mode", "free_text"), guided_contract_used=False)
        # Server-side input guard applies to every production path, including guided and module requests.
        if self.planning_mode == "one_shot" and request.prompt:
            from services import preflight_service, data_coverage_service
            from services.input_integrity_service import request_text
            pf = preflight_service.run(request_text(request),
                request.time_range.model_dump(mode="json") if request.time_range else None,
                request.analysis_scope.model_dump(mode="json") if request.analysis_scope else None,
                request.analysis_mission, reference, catalog=catalog, coverage=data_coverage_service.peek(),
                grounded_scope_filters=context.get('required_filters') or [],
                input_mode=request.input_mode,
                guided_contract=request.guided_contract.model_dump(exclude_none=True) if request.guided_contract else None)
            decision = pf["capability"]
            self.semantic_info.update(capability=decision, preflight_state=pf['state'])
            if decision['decision'] != 'READY':
                codes = [c['code'] for c in decision['constraints'] if c['blocking'] and c['status'] == 'failed']
                self.semantic_info.update(failure_stage='PRECHECK', capability_decision=decision['decision'], capability_codes=codes)
                category = next((preflight_service.CODE_ERROR[c] for c in codes if c in preflight_service.CODE_ERROR),
                    'unsupported_metric' if decision['decision'] == 'UNSUPPORTED' else 'clarification')
                raise AnalysisError(category, decision['message'])
        if getattr(request, "input_mode", "free_text") == "guided":
            mission = require_mission(catalog.registry, request.analysis_mission)
            if not mission or not request.guided_contract:
                raise AnalysisError("guided_contract_invalid", "Guided request needs a mission and its contract")
            slots = missions.validate_guided(catalog, mission["id"], request.guided_contract.model_dump(exclude_none=True),
                                             scope_filters=context.get("required_filters") or [])
            try:
                missions.check_metric_clocks(catalog, slots, request.time_range.model_dump(mode="json") if request.time_range else None)
            except missions.GuidedContractError as error:
                raise AnalysisError("guided_contract_invalid", str(error)) from None
            # The text is part of the meaning: if it was edited to name a different metric than the contract carries,
            # the guided intent is stale and must not run (the client is expected to drop it; the server enforces it).
            from services.request_anchors import request_anchors
            from services.semantic_preflight_contract import canonical_anchor
            slot_metrics = {slots.get(k) for k in ("metric", "metric_b") if slots.get(k)}
            if slot_metrics and request.prompt:
                for anchor in request_anchors(request.prompt, catalog, {}).get("metrics", []):
                    if not (set(anchor["candidate_ids"]) & slot_metrics) and canonical_anchor(anchor, catalog.registry) not in slot_metrics:
                        raise AnalysisError("guided_contract_invalid", "Guided text no longer matches its contract")
            source, period = "builder", context.get("required_period")
        elif request.prompt and self.planning_mode == "one_shot":
            legacy_precheck = request.natural_input and getattr(request, "allow_deterministic_upgrade", False)
            guided = pf.get("guided_contract") or {}
            risk = (guided.get("slots") or {}).get("mission") == "risk_watch" and request.natural_input
            if not (legacy_precheck or risk):
                self.semantic_info["preflight_state"] = pf.get("state")
                return
            if risk and guided.get("question_filters"):
                # Risk Watch has ONE meaning contract for every depth: scope named
                # in the text is grounded here and joins the structured scope,
                # instead of sending the request to a different (AI) model.
                self.merge_question_filters(catalog, context, guided["question_filters"])
                guided = {**guided, "question_filters": []}
            if pf.get("state") != "READY_GUIDED" or guided.get("source") != "auto_upgrade" or guided.get("question_filters"):
                self.semantic_info["preflight_state"] = pf.get("state")
                return
            slots, source = guided["slots"], "auto_upgrade"
            period = context.get("required_period") or guided.get("time")
            if period and context.get("required_period") is None and guided.get("time"):
                # The question's own explicit window becomes the authoritative period.
                context["required_period"] = {"start": period["start"], "end": period["end"]}
            self.semantic_info["preflight_state"] = pf.get("state")
        else:
            return
        context["guided_intent"] = missions.guided_intent(catalog, slots, period)
        context['guided_mission_id'] = slots['mission']
        if slots['mission'] == 'risk_watch':
            context['analysis_mission'] = 'risk_watch'
            context['risk_snapshot_metrics'] = sorted({s['metric'] for s in catalog.registry.get('risk_signals', [])
                if s['id'] in slots.get('signals', [])
                and catalog.registry['metrics'][s['metric']].get('historical_capability') == 'snapshot'})
        missions.admit_guided_sql_budget(catalog, context)
        self.semantic_info.update(guided_contract_used=True, guided_source=source,
                                  guided_slots={k: v for k, v in slots.items() if k != "signals"},
                                  preflight_state="READY_GUIDED")

    def merge_question_filters(self, catalog, context, question_filters):
        from services.semantic_tools import SemanticTools
        current = {f["dimension"]: f for f in context.get("required_filters") or []}
        resolver = SemanticTools(catalog, self.value_lookup)
        wanted = {}
        for f in question_filters:
            for v in (f["value"] if isinstance(f["value"], list) else [f["value"]]):
                answer = resolver.resolve({"dimension": f["dimension"], "reference": str(v)},
                                          allow_lookup=resolver.lookup_count < self.budget.value_lookups, allow_fallback=True)
                if answer["status"] != "resolved":
                    raise AnalysisError("filter_value_unknown", "Question scope could not be resolved")
                wanted.setdefault(f["dimension"], []).append(answer["value"])
        merged = dict(current)
        for dim, values in wanted.items():
            values = list(dict.fromkeys(values))
            if dim in current:
                have = current[dim]["value"] if isinstance(current[dim]["value"], list) else [current[dim]["value"]]
                if set(values) != set(have):
                    raise AnalysisError("clarification", "Phạm vi trong câu hỏi khác phạm vi đã chọn; hãy chọn một phạm vi.")
                continue
            merged[dim] = {"dimension": dim, "operator": "eq" if len(values) == 1 else "in",
                           "value": values[0] if len(values) == 1 else values}
        context["required_filters"] = list(merged.values())

    def reference(self, request, catalog):
        from services.analysis_understanding import catalog_today

        return getattr(request, "reference_date", None) or catalog_today(
            catalog.registry["timezone"]
        )

    def record_mission(self, request, catalog):
        # V3.1 UX hint for dashboard organization only. Kept out of the model
        # context: the question remains the semantic authority.
        from services.workspace_service import mission_for
        value = getattr(request, "analysis_mission", None)
        mission = mission_for(catalog.registry, value)
        self.semantic_info["analysis_mission"] = mission["id"] if mission else None
        if value and not mission:
            self.semantic_info["analysis_mission_ignored"] = value

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
            "analysis_depth_explicit": "analysis_depth" in request.model_fields_set,
        }
        context.update(natural_input=request.natural_input)
        self.record_mission(request, catalog)
        if self.semantic_info.get("analysis_mission"):
            # V3.2: the selected mission bounds supporting evidence (never the
            # requested meaning). Kept out of the interpreter payload.
            context["analysis_mission"] = self.semantic_info["analysis_mission"]
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
            # Each explicitly selected member may need one bounded exact lookup
            # (curated enums with lookup_fallback); the turn budget alone would
            # reject the fifth member of a Bottom 5 selection.
            from services.value_grounding_service import selected_scope_lookup_allowance
            lookup_limit = selected_scope_lookup_allowance(
                [f.model_dump(mode='json') for f in scope.filters], self.budget.value_lookups)
            for f in scope.filters:
                definition = catalog.registry["dimensions"].get(f.dimension)
                if not definition or not definition.get("scope_selectable"):
                    raise AnalysisError("query_scope", "Unsupported selected scope")
                values = f.value if isinstance(f.value, list) else [f.value]
                grounded = []
                for v in values:
                    answer = resolver.resolve({"dimension": f.dimension, "reference": str(v)}, allow_lookup=resolver.lookup_count < lookup_limit, allow_fallback=True)
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
        from services.hybrid_analyst_planner import HybridAnalystPlanner

        planner = HybridAnalystPlanner if self.planning_mode == "one_shot" else DataAnalystAgent
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
        from services.request_anchors import enforce_ui
        return enforce_ui(artifacts,context)

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
        if self.semantic_info.get("semantic_intent"):
            session.semantic_intent = deepcopy(self.semantic_info["semantic_intent"])
            session.initial_semantic_intent = deepcopy(self.semantic_info.get("initial_semantic_intent", session.initial_semantic_intent))
            session.semantic_history = deepcopy(self.semantic_info.get("semantic_history", session.semantic_history))
            if self.semantic_info.get('fixed_grouping_policy'):
                session.ui_constraints['fixed_grouping_policy']=self.semantic_info['fixed_grouping_policy']
            if session.semantic_history and 'interaction' not in session.semantic_history[-1]:
                # Explicit AI feedback starts a new approved interaction base;
                # later BI changes must not resurrect pre-feedback metrics.
                session.ui_constraints.pop('workspace_base_intent', None)
            session.intent_fingerprint = self.semantic_info["semantic_intent_fingerprint"]
            session.plan_fingerprint = self.semantic_info["resolved_plan_fingerprint"]
            session.resolved_operations = deepcopy(self.semantic_info["resolved_operations"])
            session.requirement_coverage = deepcopy(self.semantic_info["resolved_requirement_coverage"])
            session.feature_bindings = deepcopy(self.semantic_info.get("derived_feature_bindings", []))
            session.resolver_version = self.semantic_info["resolver_version"]
            session.contract_version = "2.8"
            if self.semantic_info.get('server_supporting_expansion'):
                session.ui_constraints.update(
                    server_supporting_expansion=self.semantic_info['server_supporting_expansion'],
                    minimum_visuals=self.semantic_info.get('minimum_visuals',session.ui_constraints.get('minimum_visuals',0)),
                    omitted_supporting_ids=self.semantic_info.get('omitted_supporting_ids', []))
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
            # The full population is transient execution state, never session data.
            artifact.result = None
        session.agent_reference_date = reference.isoformat()
        session.dashboard_plan = plan.model_dump(mode="json")
        evidence = (
            analytical_features(artifacts, catalog, self.semantic_info.get("derived_feature_bindings"), as_of=reference)
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
            evidence_refs=[e["id"] for e in evidence[:100]],
            dashboard=plan,
        ).model_dump(mode="json")

    @deterministic_dashboard
    def propose(self, request):
        from services.provider_budget import request_deadline, PLANNING_SECONDS
        token=None
        if request_deadline.get() is None:
            token=request_deadline.set(time.monotonic()+PLANNING_SECONDS)
        try:
            return self._propose(request)
        finally:
            if token is not None:
                request_deadline.reset(token)

    def source_lineage(self,request,catalog,reference):
        source=request.source_analysis
        if source is None:return None
        parent=get_session(source.session_id)
        if not self.owner_id or not parent or parent.owner_id!=self.owner_id or not parent.approved:
            raise AnalysisError('query_scope','Source analysis unavailable for this owner')
        if parent.revision!=source.revision or parent.schema_fingerprint!=catalog.fingerprint:
            raise AnalysisError('schema_changed','Source analysis revision or catalog changed')
        artifact=parent.agent_artifacts.get(source.query_id)
        if (not artifact or not artifact.result_ref or artifact.result_ref['artifact_id']!=source.artifact_id
                or set(source.filters)!=set(artifact.plan.dimensions)):
            raise AnalysisError('query_scope','Source group must bind every approved entity key')
        from services.result_artifact_store import artifact_store
        page=artifact_store().page(artifact.result_ref,0,2,source.filters)
        if page['total_rows']!=1:
            raise AnalysisError('query_scope','Source entity key is absent or ambiguous')
        if any(not (page['rows'][0][key]==value and (type(page['rows'][0][key])==type(value)
                or type(page['rows'][0][key]) in {int,float} and type(value) in {int,float}))
                for key,value in source.filters.items()):
            raise AnalysisError('query_scope','Source entity key types changed')
        if (request.input_mode!='guided' or not request.guided_contract
                or request.guided_contract.metric not in artifact.query.metrics):
            raise AnalysisError('query_scope','Source metric must retain its governed definition')
        scope=request.analysis_scope
        expected=[f.model_dump(mode='json') for f in artifact.query.filters]
        for dimension,value in source.filters.items():
            prior=[f for f in expected if f['dimension']==dimension]
            if any(f['operator'] not in {'eq','in'} or value not in
                    (f['value'] if isinstance(f['value'],list) else [f['value']]) for f in prior):
                raise AnalysisError('query_scope','Source group cannot widen its approved filters')
            expected=[f for f in expected if f['dimension']!=dimension]
            expected.append({'dimension':dimension,'operator':'eq','value':value})
        ordered=lambda fs:sorted(json.dumps(f,sort_keys=True,ensure_ascii=False) for f in fs)
        if not scope or scope.mode!='selected' or ordered([f.model_dump(mode='json') for f in scope.filters])!=ordered(expected):
            raise AnalysisError('query_scope','Source group must preserve its exact typed scope')
        if not request.time_range:
            raise AnalysisError('time_range_ambiguous','Source group requires its original period')
        if (request.time_range.mode!='custom' or
                any(str(getattr(request.time_range,k))!=artifact.grounded.period[k] for k in ('start','end'))):
            raise AnalysisError('time_range_ambiguous','Source group period changed')
        return {**source.model_dump(mode='json'),'catalog_fingerprint':catalog.fingerprint,
            'source_plan_fingerprint':parent.plan_fingerprint,'source_query_fingerprint':artifact.signature,
            'validation':'owned_immutable_artifact_at_submission'}

    def _propose(self, request):
        from services.provider_budget import check_request_deadline, request_deadline
        check_request_deadline()
        catalog = self.catalog()
        reference = self.reference(request, catalog)
        source_analysis=self.source_lineage(request,catalog,reference)
        context = self.ui_context(request, catalog, reference)
        self.guided_context(request, catalog, reference, context)
        self.semantic_info.update(local_metadata_ms=round((time.perf_counter()-self.started)*1000,2),
            catalog_fingerprint_prefix=catalog.fingerprint[:12])
        previous, concepts, module = {}, [], None
        if request.analysis_module_id or request.analysis_module_name:
            from services.analysis_module_service import AnalysisModules
            modules = AnalysisModules(self.module_repository)
            module = modules.resolve(self.owner_id, request.analysis_module_id, request.analysis_module_name, catalog)
            previous, concepts = modules.prepare_context(self, module, catalog, reference, context)
        if request.prompt and "cohort_references" not in context:
            # Persisted with ui_constraints so independent verification replays the same binding.
            from services.request_anchors import request_anchors
            context["cohort_references"] = request_anchors(request.prompt, catalog, {}).get("cohort_references") or []
        artifacts, plan = self.agent(catalog, reference, proposal=True, previous=previous, known_concepts=concepts).run(request.prompt, context)
        check_request_deadline()
        context.update(server_supporting_expansion=self.semantic_info.get('server_supporting_expansion'),
            fixed_grouping_policy=self.semantic_info.get('fixed_grouping_policy'),
            depth_selection_origin=self.semantic_info.get('depth_selection_origin'), requested_depth=self.semantic_info.get('requested_depth'),
            minimum_visuals=self.semantic_info.get('minimum_visuals',0),
            omitted_supporting_ids=self.semantic_info.get('omitted_supporting_ids',[]))
        self.enforce_ui(artifacts, context)
        persistence_started=time.perf_counter()
        session = create_session(request.prompt, request.domain or "auto", owner_id=self.owner_id)
        session.owner_id = self.owner_id
        session.natural_input = request.natural_input
        session.analysis_inputs = {"original_question": request.prompt, "analysis_context": request.analysis_context, "analysis_expectation": request.analysis_expectation}
        session.input_time_strategy = request.time_range.model_dump(mode="json") if request.time_range else {"mode": "auto"}
        session.module_provenance = {"module_id": module["module_id"], "name": module["name"], "mode": "reference"} if module else None
        session.source_analysis=source_analysis
        session.ui_constraints = deepcopy(context)
        session.proposed_prompt = request.prompt
        session.proposed_request = self.request_signature(request)
        self.save_meaning(session, artifacts, catalog, reference, plan)
        session.analysis_components = deepcopy(self.semantic_info.get("analysis_components", []))
        session.coverage_origin = self.semantic_info.get("coverage_origin", "execution_only")
        session.partial_scope = any(c["requested_or_supporting"] == "requested" and c["status"] != "planned" for c in session.analysis_components)
        meaning = self.interpretation(artifacts)
        proposal = {"analysis_components": session.analysis_components, "partial_scope": session.partial_scope,
            "revision": session.revision, "semantic_intent_fingerprint": session.intent_fingerprint,
            "resolved_plan_fingerprint": session.plan_fingerprint, "catalog_fingerprint": catalog.fingerprint,
            "requirement_coverage": session.requirement_coverage,
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
            "outcome": "PARTIAL_AVAILABLE" if session.partial_scope else "SUCCESS",
            "prompt": request.prompt,
            "proposal": proposal,
            "session_id": session.session_id,
            "analysis_spec": session.analysis_spec,
            "interpretation": meaning,
            "diagnostics": self.diagnostics(catalog, {"proposal": "passed"}),
        }
        session.diagnostics = deepcopy(response["diagnostics"])
        from services.session_service import save_session
        check_request_deadline()
        save_session(session)
        check_request_deadline()
        self.semantic_info.update(proposal_persistence_ms=round((time.perf_counter()-persistence_started)*1000,2),
            session_ms=round((time.perf_counter()-persistence_started)*1000,2),
            total_ms=round((time.perf_counter()-self.started)*1000,2),
            remaining_budget_ms=round(max(0,(request_deadline.get() or time.monotonic())-time.monotonic())*1000,2))
        response['diagnostics']=self.diagnostics(catalog,{'proposal':'passed'})
        logging.getLogger('ai-analytics').info('[ProposalDiagnostics] %s',json.dumps({k:self.semantic_info.get(k) for k in (
            'request_id','catalog_fingerprint_prefix','candidate_packet_chars','provider_body_chars','schema_chars',
            'provider_attempt_count','provider_attempt_latencies','provider_attempt_categories','semantic_repair_count',
            'transport_retry_count','remaining_budget_ms','local_metadata_ms','local_grounding_ms','metadata_retrieval_ms',
            'provider_primary_ms','provider_repair_ms','provider_ms','resolver_ms','proposal_persistence_ms','session_ms','total_ms')}))
        return response

    @deterministic_dashboard
    def generate(self, request):
        self.semantic_info['force_refresh'] = bool(getattr(request,'refresh',False))
        catalog = self.catalog()
        self.record_mission(request, catalog)
        session = get_session(request.session_id) if request.session_id else None
        if request.session_id and not session:
            raise AnalysisError("session", "Session expired")
        if session:
            self.check_owner(session)
            with session.analysis_lock:
                if not getattr(request, 'dashboard_id', None) and (request.prompt or request.input_mode!='guided'):
                    from services.input_integrity_service import request_text
                    self.validate_input(request_text(request), catalog)
                if self.planning_mode == "one_shot" and session.contract_version not in {"2.5", "2.8"}:
                    raise AnalysisError("schema_changed", "Refresh the analysis proposal")
                if session.proposed_request != self.request_signature(request):
                    raise AnalysisError("session", "Request changed after proposal")
                if session.schema_fingerprint != catalog.fingerprint:
                    raise AnalysisError("schema_changed", "Refresh proposal")
                if session.contract_version == "2.8":
                    from services.analytical_resolver import intent_fingerprint, plan_fingerprint, verify_operation_bindings
                    from services.semantic_preflight_contract import POLICY_VERSION
                    from services.analysis_intent import AnalysisIntentEnvelope
                    if (request.proposal_revision != session.revision or request.intent_fingerprint != session.intent_fingerprint
                        or request.plan_fingerprint != session.plan_fingerprint or request.catalog_fingerprint != catalog.fingerprint):
                        raise AnalysisError("stale_approval", "Approval identities differ from current proposal")
                    if (intent_fingerprint(AnalysisIntentEnvelope.model_validate(session.semantic_intent),date.fromisoformat(session.agent_reference_date),catalog) != session.intent_fingerprint
                        or plan_fingerprint(session.resolved_operations,session.requirement_coverage,catalog.fingerprint,POLICY_VERSION) != session.plan_fingerprint):
                        raise AnalysisError("stale_approval", "Stored proposal meaning changed")
                    if not verify_operation_bindings(session.resolved_operations, session.agent_artifacts):
                        raise AnalysisError("stale_approval", "Stored executable scope changed")
                if session.partial_scope and not request.accept_partial_scope:
                    raise AnalysisError("approval_required", "Reduced requested scope needs explicit approval")
                self.semantic_info.update(analysis_components=deepcopy(session.analysis_components), coverage_origin=session.coverage_origin)
                self.restore_hybrid_meaning(session)
                reference = date.fromisoformat(session.agent_reference_date)
                agent = self.agent(catalog, reference, previous=session.agent_artifacts,
                    known_concepts=session.agent_state.get("resolved_concepts", []))
                self.semantic_info.update(analysis_components=deepcopy(session.analysis_components), coverage_origin=session.coverage_origin)
                agent.queries.ui_context = deepcopy(session.ui_constraints)
                from services.mission_contract_service import admit_guided_sql_budget
                admit_guided_sql_budget(catalog, agent.queries.ui_context)
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
                    prepared = {}
                    for id, old in session.agent_artifacts.items():
                        args = old.query.model_dump(mode="json")
                        args.update(replaces=None, changed_fields=[])
                        try:
                            prepared[id] = agent.queries.prepare(args)
                        except AnalysisError as exc:
                            if self.planning_mode != "one_shot" or old.query.role == "requested":
                                raise
                            agent.omit(exc)
                            self.semantic_info["limitations"].append({"reason": "supporting_execution", "message": "Một kết quả hỗ trợ chưa vượt qua kiểm chứng nên đã được bỏ qua."})
                    active, omitted = agent.queries.run_batch(prepared, allow_supporting_failure=True)
                    for id,error in omitted.items():
                        agent.omit(error)
                        self.semantic_info['limitations'].append(dict(reason='supporting_execution',
                            operation_id=id, message='Một góc nhìn hỗ trợ chưa thực thi được.'))
                    agent.queries.artifacts = active
                    if omitted and session.contract_version == '2.8':
                        self.reconcile_optional_execution(session, active, catalog, reference)
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
        self.guided_context(request, catalog, reference, context)
        artifacts, plan = self.agent(catalog, reference).run(request.prompt, context)
        self.enforce_ui(artifacts, context)
        session = create_session(request.prompt, request.domain or "auto", owner_id=self.owner_id)
        session.proposed_request = self.request_signature(request)
        with session.analysis_lock:
            return self.report(artifacts, plan, catalog, session, reference)

    def workspace_revision(self, request):
        """One deterministic, atomic input revision through the existing planner.

        Work on a detached session: a failed query, revoke or verifier cannot
        mutate the published report. Existing storage CAS/lock owns publication.
        """
        from copy import copy
        from services.workspace_service import (workspace_base, workspace_intent,
            validate_workspace_revision)
        from services.analytical_resolver import AnalyticalResolver
        from services.request_anchors import refinement_anchors
        from services.provider_budget import _provider_forbidden, check_request_deadline
        token = _provider_forbidden.set(True)
        try:
            source = get_session(request.session_id)
            if not source or not source.approved or source.contract_version != '2.8':
                raise AnalysisError('session', 'Approved semantic session required')
            self.check_owner(source)
            with source.analysis_lock:
                source = get_session(request.session_id)
                if not source or not source.approved:
                    raise AnalysisError('session', 'Session expired before revision')
                self.check_owner(source)
                catalog = self.catalog()
                state = validate_workspace_revision(request, source, catalog)
                from services.input_integrity_service import enforce, policy_fingerprint
                if source.ui_constraints.get('input_integrity_policy') != policy_fingerprint() and not source.ui_constraints.get('dashboard_template'):
                    enforce(source.original_prompt,catalog)
                session = copy(source)
                for key, value in source.__dict__.items():
                    if key != 'analysis_lock': setattr(session, key, deepcopy(value))
                reference = date.fromisoformat(session.agent_reference_date)
                base = session.ui_constraints.setdefault('workspace_base_intent', workspace_base(session.semantic_intent))
                intent = workspace_intent(base, state, catalog, reference)
                context = session.ui_constraints
                # Re-plan every lens in one batch/snapshot. No prior revision's
                # artifact is reused to satisfy the new visual floor.
                for key in ('omitted_supporting_ids', 'executed_supporting_ids'):
                    context.pop(key, None)
                context.update(analysis_depth=request.analysis_depth, server_supporting_expansion=request.analysis_depth,
                               requested_depth=request.analysis_depth, depth_selection_origin='explicit')
                from services.analysis_expansion_service import FIXED_GROUPING_POLICY
                context['fixed_grouping_policy']=FIXED_GROUPING_POLICY
                history = deepcopy(session.semantic_history)
                # A typed state replaces previous BI states against the same
                # frozen root. Keep AI deltas, bounds and old report snapshots;
                # repeated Apply must not consume the AI conversation allowance.
                while history and 'interaction' in history[-1]:
                    history.pop()
                history.append(dict(interaction=state))
                anchors, _ = refinement_anchors(session.original_prompt, session.initial_semantic_intent,
                    history, catalog, context, reference)
                resolved = AnalyticalResolver(catalog, reference, context).resolve(intent)
                agent = self.agent(catalog, reference)
                # Values were bound to authorized immutable rows (or to the
                # original approved scope). Do not reinterpret identity keys.
                for req in intent.requirements:
                    for f in req.filters:
                        values = f.value if isinstance(f.value, list) else [f.value]
                        agent.semantic.resolved.setdefault(f.dimension, set()).update(values)
                prepared = agent._compile_resolved(resolved, context)
                self.semantic_info.update(semantic_intent=resolved['intent'].model_dump(mode='json'),
                    initial_semantic_intent=deepcopy(session.initial_semantic_intent), semantic_history=history,
                    semantic_intent_fingerprint=resolved['intent_fingerprint'], resolved_plan_fingerprint=resolved['plan_fingerprint'],
                    resolved_operations=resolved['operations'], resolved_requirement_coverage=resolved['coverage'],
                    derived_feature_bindings=resolved['feature_bindings'], resolver_version=resolved['resolver_version'],
                    analysis_components=resolved['components'], coverage_origin='server_resolved', request_anchors=anchors,
                    analysis_depth=request.analysis_depth, server_supporting_expansion=request.analysis_depth,
                    requested_depth=request.analysis_depth, effective_depth=request.analysis_depth, depth_selection_origin='explicit',
                    interaction_state=state, refinement_mode='structured_workspace', force_refresh=True,
                    analysis_mission=context.get('analysis_mission'), provider_physical_attempts=0, provider_http_attempts=0)
                artifacts, plan = agent._execute_prepared(prepared)
                check_request_deadline()
                return self.report(artifacts, plan, catalog, session, reference, refined=True)
        finally:
            _provider_forbidden.reset(token)

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
            if self.planning_mode == "one_shot" and session.contract_version not in {"2.5", "2.8"}:
                raise AnalysisError("schema_changed", "Refresh the analysis proposal")
            reference = date.fromisoformat(session.agent_reference_date)
            if request.visual_changes:
                return self.refine_visuals(request, session, catalog, reference)
            if not request.feedback.strip():
                raise AnalysisError("invalid_analysis_contract", "Empty refinement")
            input_validation = self.validate_input(request.feedback, catalog, context={'revision':session.revision, 'mode':'refinement'})
            self.semantic_info.update(input_validation_fingerprint=input_validation['fingerprint'],
                input_policy_version=input_validation['version'],lookup_queries=input_validation['lookup_queries'])
            if self.planning_mode=='one_shot':
                from services import preflight_service
                pf=preflight_service.run(session.original_prompt+'; '+request.feedback,
                    analysis_mission=session.ui_constraints.get('analysis_mission'),reference=reference,catalog=catalog,
                    integrity_text=request.feedback)
                if pf['capability']['decision']!='READY':
                    self.semantic_info.update(capability=pf['capability'],capability_decision=pf['capability']['decision'],
                        capability_codes=[c['code'] for c in pf['capability']['constraints']],failure_stage='SEMANTIC_CAPABILITY')
                    raise AnalysisError('clarification' if pf['capability']['decision'] in {'CLARIFY','REDIRECT'} else 'unsupported_metric',pf['capability']['message'])
            # A guided intent authorizes the initial report, not a later natural
            # language delta. Replaying that envelope as submit_analysis_delta
            # rejects every refinement before the interpreter can run.
            refinement_context = dict(session.ui_constraints)
            new_filters = input_validation['required_filters']
            if new_filters:
                changed = {f['dimension'] for f in new_filters}
                refinement_context['required_filters'] = [f for f in refinement_context.get('required_filters', []) if f['dimension'] not in changed] + new_filters
            refinement_context.pop("guided_intent", None)
            artifacts, plan = self.agent(
                catalog, reference, previous=session.agent_artifacts,
                known_concepts=session.agent_state.get("resolved_concepts", [])
            ).run(request.feedback, {
                **refinement_context,
                "analysis_depth": session.analysis_depth,
                "semantic_intent": session.semantic_intent,
                "initial_semantic_intent": session.initial_semantic_intent,
                "semantic_history": session.semantic_history,
                "original_question": session.original_prompt,
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
        self.restore_hybrid_meaning(session)
        self.semantic_info.update(analysis_components=deepcopy(session.analysis_components),coverage_origin=session.coverage_origin)
        agent.queries.ui_context = deepcopy(session.ui_constraints)
        for old in session.agent_artifacts.values():
            args = old.query.model_dump(mode="json")
            args.update(replaces=None, changed_fields=[])
            agent.queries.run(agent.queries.prepare(args))  # Revalidate cached rows, no SQL.
        artifacts = agent.queries.artifacts
        plan = DashboardPlan.model_validate(session.dashboard_plan)
        evidence = analytical_features(artifacts, catalog, self.semantic_info.get("derived_feature_bindings"), as_of=session.agent_reference_date)
        lenses, lens_groups, lens_targets = self.lens_context(self.semantic_info.get("resolved_requirement_coverage") or session.requirement_coverage,
            catalog, (session.ui_constraints or {}).get("server_supporting_expansion") or session.analysis_depth)
        current = build_dashboard(artifacts, evidence, plan, self.budget.charts, self.budget.categories, self.budget.series,
                                  minimum_visuals=self.semantic_info.get('minimum_visuals',0), lenses=lenses, min_groups=lens_groups,
                                  lens_targets=lens_targets)
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

    def reconcile_optional_execution(self, session, artifacts, catalog, reference):
        """Keep requested meaning; never replace failed support with unrun SQL."""
        from services.analysis_intent import AnalysisIntentEnvelope
        from services.analytical_resolver import AnalyticalResolver, verify_operation_bindings
        coverage = self.semantic_info['resolved_requirement_coverage']
        supporting = {c['id'] for c in self.semantic_info['analysis_components']
            if c['requested_or_supporting'] == 'supporting'}
        completed = [c['requirement_id'] for c in coverage
            if c['requirement_id'] in supporting
            and c['operation_ids'] and set(c['operation_ids']) <= set(artifacts)]
        # A split optional requirement is atomic: remove its successful sibling
        # too when the complete requirement did not execute.
        retained = {id for c in coverage
            if c['requirement_id'] not in supporting or c['requirement_id'] in completed
            for id in c['operation_ids']}
        for id in list(artifacts):
            if id not in retained:
                del artifacts[id]
        session.ui_constraints['executed_supporting_ids'] = completed
        resolved = AnalyticalResolver(catalog,reference,session.ui_constraints).resolve(
            AnalysisIntentEnvelope.model_validate(self.semantic_info['semantic_intent']))
        if not verify_operation_bindings(resolved['operations'], artifacts):
            raise AnalysisError('quality_verification', 'Optional execution cannot preserve requested scope')
        self.semantic_info.update(semantic_intent=resolved['intent'].model_dump(mode='json'),
            semantic_intent_fingerprint=resolved['intent_fingerprint'],
            resolved_plan_fingerprint=resolved['plan_fingerprint'],
            resolved_operations=resolved['operations'],resolved_requirement_coverage=resolved['coverage'],
            analysis_components=resolved['components'],derived_feature_bindings=resolved['feature_bindings'],
            optional_execution_partial=True)

    @staticmethod
    def lens_context(coverage, catalog, depth=None):
        from services.dashboard_planner_service import lens_context
        return lens_context(coverage, catalog, depth)

    def report(self, artifacts, plan, catalog, session, reference, refined=False):
        from services.provider_budget import request_observer
        observer = request_observer.get()
        if observer:
            observer('verifying', {})
        evidence = analytical_features(artifacts, catalog, self.semantic_info.get("derived_feature_bindings"), as_of=reference)
        coverage_map = self.semantic_info.get("resolved_requirement_coverage") or session.requirement_coverage
        lenses, lens_groups, lens_targets = self.lens_context(coverage_map, catalog,
            (session.ui_constraints or {}).get("server_supporting_expansion") or self.semantic_info.get("analysis_depth", session.analysis_depth))
        dashboard = build_dashboard(
            artifacts,
            evidence,
            plan,
            self.budget.charts,
            self.budget.categories,
            self.budget.series,
            catalog=catalog,
            minimum_visuals=self.semantic_info.get('minimum_visuals',0),
            lenses=lenses, min_groups=lens_groups, lens_targets=lens_targets,
        )
        # V3.2 mission evidence contract: every visible chart maps to a requirement;
        # charts outside the mission's governed evidence or over the depth budget
        # for SUPPORTING views are dropped (values are never altered).
        from services import chart_relevance_service
        mission_hint = self.semantic_info.get("analysis_mission") or (session.ui_constraints or {}).get("analysis_mission")
        relevance = None
        if coverage_map:
            relevance = chart_relevance_service.apply(dashboard, artifacts, catalog, mission_id=mission_hint,
                depth=self.semantic_info.get("analysis_depth", session.analysis_depth), coverage=coverage_map,
                intent=self.semantic_info.get("semantic_intent") or session.semantic_intent, evidence=evidence)
            self.semantic_info.update(dropped_irrelevant_charts=relevance["dropped_irrelevant_charts"],
                                      dropped_budget_charts=len(relevance["dropped"]) - relevance["dropped_irrelevant_charts"])
        if session.natural_input or session.ui_constraints.get('dashboard_template'):
            # A driver baseline/independent-total query may legitimately be empty; that becomes a disclosed
            # driver_status limitation (no conclusion), never a fabricated or failed analysis.
            baseline_ids = {q for b in (self.semantic_info.get("derived_feature_bindings") or []) if b.get("feature") == "driver_delta" for q in b["query_ids"][1:]}
            for a in artifacts.values():
                if a.query.role != "requested" or a.query.id in baseline_ids:
                    continue
                if not a.result["rows"] or (a.plan.metrics and not any(
                    row.get(metric) is not None for row in a.result["rows"] for metric in a.plan.metrics
                )):
                    raise AnalysisError("insufficient_data", "No rows for the requested population")
                from services.dashboard_planner_service import pinned_by_scope
                if a.plan.kind != "detail" and (a.plan.dimensions or a.plan.kind == "trend") and not pinned_by_scope(a, artifacts) and not any(a.query.id in c.get("scope_refs", [c["scope_ref"]]) for c in dashboard["charts"]):
                    # The validated table already contains every row. A visual
                    # density/shape limit must not discard successful analysis.
                    reasons = sorted({v["reason"] for v in dashboard["dashboard_plan"]["omitted_visuals"] if v["query_id"] == a.query.id})
                    self.semantic_info.setdefault("table_fallbacks", []).append({"query_id": a.query.id, "reasons": reasons or ["no_eligible_visual"]})
                    self.semantic_info.setdefault("limitations", []).append({"reason": "table_fallback", "message": "Một góc nhìn được trình bày trong bảng dữ liệu đầy đủ vì cấu trúc hoặc số nhóm chưa phù hợp với biểu đồ."})
        from services.workspace_service import mission_for, mission_layout, follow_up_questions
        mission_id = self.semantic_info.get("analysis_mission") or (session.ui_constraints or {}).get("analysis_mission")
        mission = mission_for(catalog.registry, mission_id)
        if mission:
            session.ui_constraints = {**(session.ui_constraints or {}), "analysis_mission": mission["id"]}
            self.semantic_info["analysis_mission"] = mission["id"]
            dashboard["dashboard_plan"]["analysis_mission"] = mission["id"]
        narrative = grounded_narrative(plan, evidence)
        # Forecast numbers are computed here from verified history only.
        from services.forecast_service import report_forecasts
        forecasts = report_forecasts(artifacts, self.semantic_info.get("resolved_requirement_coverage"), catalog, reference)
        # V3.2 deterministic chart insights (0 provider calls) and a short answer
        # built only from verified, evidence-referenced facts of primary charts.
        from services.chart_insight_service import chart_insights
        insights = chart_insights(dashboard["charts"], artifacts, catalog, reference, mission_hint)
        from services.chart_insight_service import compare_cards, short_answer as build_short_answer
        short_answer = build_short_answer(dashboard["charts"])
        from services.view_requirement_service import view_coverage
        view_cov = view_coverage(coverage_map, dashboard["charts"], artifacts, dashboard["dashboard_plan"].get("omitted_visuals", []),
                                 dashboard['dashboard_plan'].get('tables',[]))
        missing_required={v['requirement_id'] for v in view_cov if v['required'] and v['status']=='missing'}
        static_dropped=[v for v in (relevance or {}).get('dropped',[]) if v.get('reason') in {'outside_mission_evidence','outside_mission_grammar'}
                        and v.get('query_id') in artifacts and artifacts[v['query_id']].query.role=='requested']
        if missing_required and static_dropped:
            self.semantic_info.update(failure_stage='CAPABILITY_CONTRACT',capability_contract_disagreement=static_dropped)
            raise AnalysisError('semantic_contract_drift','Compiled capability disagrees with required chart execution')
        for missing in (v for v in view_cov if v["required"] and v["status"] == "missing"):
            # A report that cannot show a required view is never a complete success.
            self.semantic_info.setdefault("limitations", []).append(
                {"reason": "required_view_missing", "message": f"Chưa có góc nhìn bắt buộc ({missing['kind']}) cho yêu cầu {missing['requirement_id']}: {missing['reason']}."})
        cards = compare_cards(dashboard["charts"], artifacts, catalog, mission_hint, evidence=evidence)
        if cards:
            dashboard["kpi_cards"] = cards + [k for k in dashboard.get("kpi_cards", []) if k.get("label") != "Thay đổi giữa hai kỳ quan sát"]
        from services.analytical_capacity_planner import AnalyticalCapacityContract
        from services.result_artifact_store import artifact_store, fingerprint, serialized
        capacity_contract = AnalyticalCapacityContract.from_env()
        results = {id: {**deepcopy(a.result), 'rows': deepcopy(a.result['rows'][:capacity_contract.preview_rows]),
            'total_rows': len(a.result['rows']), 'displayed_count': min(len(a.result['rows']), capacity_contract.preview_rows),
            'artifact_ref': a.result_ref, 'computation_scope': 'FULL_QUERY_POPULATION',
            'presentation_scope': 'BOUNDED_PREVIEW'} for id,a in artifacts.items()}
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
        # FINAL P3: breadth is measured from the executed lens plan and the charts that survived every gate; it is
        # reported separately from numeric verification (verified numbers ≠ a rich report, and vice versa).
        from services.view_requirement_service import analysis_coverage
        from services.analysis_expansion_service import view_targets, lens_policy
        ui = session.ui_constraints or {}
        effective = ui.get("server_supporting_expansion") or depth
        lens_plan = self.semantic_info.get("lens_plan") or (session.diagnostics or {}).get("lens_plan") or {}
        coverage_view = analysis_coverage(coverage_map, dashboard["charts"], dashboard["dashboard_plan"].get("omitted_visuals", []),
            view_targets(catalog, effective) if lens_plan or lenses else {}, lens_decisions=lens_plan.get("decisions", []),
            depth=effective, origin=ui.get("depth_selection_origin"), family=lens_plan.get("family"),
            policy_version=lens_policy(catalog).get("version"), forecasts=forecasts)
        self.semantic_info["analysis_coverage"] = coverage_view
        if depth in DEPTH_POLICIES:
            target = DEPTH_POLICIES[depth]["target_views"]
            self.semantic_info["depth_coverage"] = {
                "target_views": target, "validated_views": coverage_view["rendered_total"] if coverage_view else len(dashboard["charts"]),
                "status": (coverage_view["status"] if coverage_view else
                           "adequate" if len(dashboard["charts"]) >= target[0] else "limited"),
                "planned_operations": len(artifacts),
            }
        meaning = self.interpretation(artifacts)
        domain_summary = []
        for domain in meaning["domains"]:
            query_ids = [p["query_id"] for p in meaning["operations"] if p.get("domain_id") == domain["id"]]
            domain_summary.append({**domain, "query_ids": query_ids,
                "requested_operations": sum(artifacts[id].query.role == "requested" for id in query_ids),
                "supporting_operations": sum(artifacts[id].query.role == "supporting" for id in query_ids),
                "evidence_refs": [e["id"] for e in evidence if e["scope_ref"] in query_ids][:100]})
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
        from services.analysis_response_service import assemble_report_payload
        response = assemble_report_payload(artifacts=artifacts,catalog=catalog,session=session,
            meaning=meaning,results=results,dashboard=dashboard,narrative=narrative,forecasts=forecasts,
            mission=mission,insights=insights,view_cov=view_cov,short_answer=short_answer,relevance=relevance,
            domain_summary=domain_summary,evidence=evidence,semantic_info=self.semantic_info,planning_mode=self.planning_mode,
            refined=refined,diagnostics=self.diagnostics(catalog,{
                "plan":"passed","sql_semantics":"passed","security":"passed",
                "results":"passed","dashboard":"passed","insights":"passed"}))
        response["analysis_coverage"] = deepcopy(coverage_view)
        from services.analysis_quality_service import assess_report, report_limitations
        from services.analysis_coverage_service import canonical_components
        declared = self.semantic_info.get("analysis_components") or (session.analysis_components if session.coverage_origin == "declared" else [])
        components, origin = canonical_components(declared, artifacts, DomainIntelligence(catalog))
        origin = self.semantic_info.get("coverage_origin", session.coverage_origin) if declared else origin
        session.analysis_components, session.coverage_origin = components, origin
        response["analysis_components"] = components
        from services.data_coverage_service import peek as coverage_snapshot
        coverage=coverage_snapshot() or {}
        observed=coverage.get('facts',{})
        views=(coverage.get('data_health') or {}).get('views',{})
        source_coverage=[]
        for source in sorted({catalog.registry['metrics'][m]['source'] for a in artifacts.values() for m in a.plan.metrics}):
            fact=observed.get(source)
            if fact is None:
                # Snapshot sources have no business clock; their certified view health still applies.
                health=views.get(source,{})
                fact={'health_status':health.get('status','unknown'),
                      'completeness':health.get('completeness','unknown') if health.get('status')=='healthy' else 'unknown'}
            # G5: event recency (stale) is reported, never used as load completeness;
            # a late/failed load surfaces through the source health status.
            source_coverage.append(dict(source=source,label=fact.get('label') or catalog.overlay['silver_tables'][source].get('business_name',source),
                max_date=fact.get('max_date'),stale=fact.get('stale'),health_status=fact.get('health_status','unknown'),
                completeness=fact.get('completeness','unknown')))
        quality_ui = deepcopy(session.ui_constraints)
        if self.semantic_info.get('fixed_grouping_policy'):
            quality_ui['fixed_grouping_policy']=self.semantic_info['fixed_grouping_policy']
        response["quality_context"] = {"version": "2.7", "catalog_fingerprint": catalog.fingerprint,
            "coverage_origin": origin, "ui_constraints": quality_ui,
            "reference_date": reference.isoformat(), "limitations": deepcopy(self.semantic_info.get("limitations", [])),
            "partial_scope_approved": session.partial_scope, "source_coverage":source_coverage}
        response['source_completeness'] = dict(status='limited' if any(s['health_status'] in {'degraded','blocked'} or s['completeness'] in {'partial','incomplete'} for s in source_coverage)
            else 'complete' if all(s['completeness']=='complete' for s in source_coverage)
            else 'reconciled' if all(s['completeness'] in {'complete','reconciled'} for s in source_coverage) else 'unknown',
            sources=deepcopy(source_coverage))
        if self.semantic_info.get("semantic_intent"):
            from services.analytical_resolver import digest
            from services.analysis_quality_contract import VERSION as quality_version
            response["quality_context"]["version"] = "2.8"
            response["semantic_intent"] = deepcopy(self.semantic_info["semantic_intent"])
            response["resolved_requirement_coverage"] = deepcopy(self.semantic_info["resolved_requirement_coverage"])
            response["request_anchors"] = deepcopy(self.semantic_info.get("request_anchors", session.diagnostics.get("request_anchors", {})))
            response["derived_feature_bindings"] = deepcopy(self.semantic_info.get("derived_feature_bindings", []))
            response["provenance"] = {"user_request": session.original_prompt, "semantic_intent_fingerprint": self.semantic_info["semantic_intent_fingerprint"],
                "resolved_plan_fingerprint": self.semantic_info["resolved_plan_fingerprint"], "catalog_fingerprint":catalog.fingerprint,
                "registry_fingerprint":catalog.registry_fingerprint,
                "resolver_version": self.semantic_info["resolver_version"], "quality_verifier_version":quality_version,
                "result_set_fingerprint":digest(response["result_sets"]),"query_plans":response["query_plans"],
                "initial_semantic_intent":deepcopy(self.semantic_info.get("initial_semantic_intent", session.initial_semantic_intent)),
                "semantic_history":deepcopy(self.semantic_info.get("semantic_history", session.semantic_history))}
        if session.ui_constraints.get('dashboard_template'):
            response['title'] = session.ui_constraints['dashboard_template']['title']
            response.setdefault('provenance', {})['dashboard_template'] = deepcopy(session.ui_constraints['dashboard_template'])
        safe_plan = plan.model_dump(mode="json")
        by_evidence = {e["id"]: e for e in evidence}
        safe_plan["claims"] = [c for c in safe_plan["claims"] if c["evidence_id"] in by_evidence
            and (c["metric"], c["scope_ref"], c["claim_type"]) == tuple(by_evidence[c["evidence_id"]][k] for k in ("metric", "scope_ref", "claim_type"))
            and (c.get("text") is None or c["text"] == by_evidence[c["evidence_id"]]["statement"])]
        safe_plan["recommendations"] = [c for c in safe_plan["recommendations"] if any(r["evidence_id"] == c["evidence_id"] and r["action"] == c["action"] for r in narrative["recommendations"])]
        response["dashboard_plan_input"] = safe_plan
        if response.get('semantic_intent'):
            from services.goal_provenance_service import goal_provenance
            response['goal_provenance'] = goal_provenance(response,catalog)
        response["quality_limitations"] = report_limitations(artifacts, response["charts"], catalog, response["quality_context"]["limitations"], source_coverage)
        from services.answer_requirement_service import conclusion_from_report
        response['conclusion'],response['short_answer'],response['answer_requirements']=conclusion_from_report(response,artifacts,catalog,evidence)
        # Scope taxonomy is part of the catalog identity; keep its original version in saved reports.
        response['scope_resolution']=(response.get('request_anchors') or {}).get('scope_resolution')
        from services.access_policy import active_principal,current_principal
        if active_principal.get() is not None:
            principal=current_principal(required=True)
            response['authorized_scope']={'national':principal.national,'store_ids':list(principal.store_ids),
                'policy_version':principal.policy_version,'policy_fingerprint':principal.access_fingerprint}
        response.setdefault('provenance',{})['data_epoch']=deepcopy(self.semantic_info.get('data_epoch'))
        if response.get('semantic_intent'):
            from services.workspace_service import workspace_contract
            response['interaction_state'] = deepcopy(self.semantic_info.get('interaction_state') or
                session.report_response.get('interaction_state') or dict(filters=[], drill_path=[]))
            response['interaction_contract'] = workspace_contract(response, artifacts, catalog)
        if session.source_analysis:
            response['provenance']['source_analysis']=deepcopy(session.source_analysis)
            response['quality_context']['source_analysis']=deepcopy(session.source_analysis)

        # Per-row derived facts can be larger than the original result. Preserve
        # all of them externally and expose a deterministic evidence preview.
        if len(evidence) > capacity_contract.evidence_preview:
            response['evidence_ref'] = artifact_store().put(dict(columns=[], rows=evidence),
                query_fingerprint=fingerprint(self.semantic_info.get('derived_feature_bindings', [])),
                plan_fingerprint=session.plan_fingerprint or self.semantic_info.get('resolved_plan_fingerprint', ''),
                schema_fingerprint=catalog.fingerprint, provenance=dict(kind='evidence'))
            response['evidence'] = evidence[:capacity_contract.evidence_preview]
        estimates = [a.capacity['estimated_rows'] for a in artifacts.values()]
        response['capacity'] = dict(estimated_rows=sum(estimates) if all(n is not None for n in estimates) else None,
            actual_rows=sum(len(a.result['rows']) for a in artifacts.values()),
            execution_strategy='FULL_RESULT', presentation_strategy='SUMMARY_PLUS_DRILLDOWN',
            full_population_count=sum(len(a.result['rows']) for a in artifacts.values()),
            displayed_count=sum(len(r['rows']) for r in results.values()), artifact_backed=True,
            artifact_bytes=sum(a.result_ref['byte_size'] for a in artifacts.values()), response_bytes=0,
            computation_scope='FULL_QUERY_POPULATION', presentation_scope='BOUNDED_SUBSET')
        response["outcome"] = "PARTIAL_AVAILABLE" if any(c["requested_or_supporting"] == "requested" and c["status"] != "planned" for c in components) else "SUCCESS"
        if missing_required:
            response["outcome"]="PARTIAL_AVAILABLE"
        if response["outcome"] == "PARTIAL_AVAILABLE":
            response["completion_status"] = "partial"
        if response['source_completeness']['status'] == 'limited':
            response['completion_status'] = 'partial'
        if (refined and self.semantic_info.get('terminal_error')) or (
                not self.semantic_info.get('semantic_intent') and response.get('data_warnings')):
            # A failed refinement has not fulfilled the new request. Preserve
            # the archived adapter's warning-based completion contract as well.
            response['completion_status']='partial'
        # Optional omissions and disclosed caveats do not make an otherwise
        # fulfilled requested obligation incomplete. Required coverage above
        # remains authoritative for partial completion.
        started_quality = time.perf_counter()
        from services.analysis_response_service import bound_response, session_report_summary
        bound_response(response, capacity_contract)
        # Transport can omit an oversized visual. Verification and completion
        # must describe the representation actually sent, not the pre-bound plan.
        view_cov=view_coverage(coverage_map,response['charts'],artifacts,
            response['dashboard_plan'].get('omitted_visuals',[]),response['dashboard_plan'].get('tables',[]))
        response['view_coverage']=view_cov
        if any(v['required'] and v['status']=='missing' for v in view_cov):
            response['outcome']='PARTIAL_AVAILABLE';response['completion_status']='partial'
        response['quality_limitations']=report_limitations(artifacts,response['charts'],catalog,
            response['quality_context']['limitations'],source_coverage)
        response['conclusion'],response['short_answer'],response['answer_requirements']=conclusion_from_report(response,artifacts,catalog,evidence)
        self.semantic_info["failure_stage"] = "QUALITY_VERIFICATION"
        response["quality_assessment"] = assess_report(response, catalog, artifacts=artifacts)
        from services import verification_reconciliation_service as verification
        from services.chart_insight_service import verify_insights
        structural = verification.reconcile(artifacts, catalog, runner=None)
        relevance_check = chart_relevance_service.verify(response["charts"], artifacts, catalog, mission_id=mission_hint,
                                                         coverage=coverage_map) if coverage_map else {"total": 0, "passed": 0, "charts": []}
        from services.answer_requirement_service import conclusion_from_report
        canonical_conclusion=conclusion_from_report(response,artifacts,catalog)[0]
        response["verification"] = verification.verification_report(
            reconciliation=structural, relevance=relevance_check,
            grounding_result=verification.grounding(safe_plan["claims"], evidence, verify_insights(insights, artifacts, catalog=catalog)),
            forecasts=forecasts, requirement_coverage=coverage_map, internal_score=response["quality_assessment"].get("score"),
            conclusion_check=verification.verify_conclusion(response.get("conclusion"), evidence, forecasts, expected=canonical_conclusion),
            view_coverage=response.get("view_coverage"))
        v=response['verification']
        def trust(id,label,passed,total,measured=True):
            return dict(id=id,label=label,passed=passed,total=total,status='not_measured' if not measured else 'not_applicable' if not total else 'passed' if passed==total else 'partial')
        numeric=[c for c in structural['numeric'] if c.get('status') in {'matched','mismatch'}]
        fc_measured=[f for f in forecasts if f.get('backtest',{}).get('smape_pct') is not None]
        required_views=[x for x in view_cov if x['required']]
        v['trust_dimensions']=[
            trust('structural','Cấu trúc và kiểm tra kết quả',len(artifacts),len(artifacts)),
            trust('numeric_reconciliation','Đối soát số liệu độc lập',sum(x['status']=='matched' for x in numeric),len(numeric),bool(numeric)),
            trust('semantic_coverage','Yêu cầu và bằng chứng',sum(x['status']=='satisfied' for x in required_views),len(required_views)),
            trust('forecast_quality','Kiểm tra lùi dự báo',len(fc_measured),len(forecasts),bool(fc_measured)),
            trust('provider_execution','Thực thi provider trong ngân sách',int(self.semantic_info.get('provider_physical_attempts',0)<=3 and self.semantic_info.get('contract_repair_count',0)<=1),1)]
        response["verification"]["snapshot"] = {"registry_fingerprint": catalog.registry_fingerprint,
            "catalog_fingerprint": catalog.fingerprint, "verification_version": verification.VERSION,
            "metric_definitions": {m: catalog.registry["metrics"][m].get("business_definition") for a in artifacts.values()
                                   for m in a.plan.metrics if m in catalog.registry["metrics"]},
            "chart_requirements": {c["id"]: c.get("requirement_id") for c in response["charts"]},
            "reference_date": reference.isoformat()}
        self.semantic_info.update(verification_status=response["verification"]["status"],
                                  chart_count=len(response["charts"]))
        response["diagnostics"].update({k: self.semantic_info.get(k) for k in (
            "verification_status", "dropped_irrelevant_charts", "input_mode", "guided_contract_used", "preflight_state",
            "logical_provider_calls", "provider_http_attempts", "credential_failover_used") if k in self.semantic_info})
        # V3.2 sanitized telemetry (no question text, key, slot value or SQL).
        import logging as telemetry_logging  # report() also imports logging locally below
        telemetry_logging.getLogger('ai-analytics').info('[V32Telemetry] %s', json.dumps({k: self.semantic_info.get(k) for k in (
            "input_mode", "analysis_mission", "preflight_state", "guided_contract_used", "guided_source", "logical_provider_calls",
            "provider_http_attempts", "credential_failover_used", "semantic_repair_count", "chart_count",
            "dropped_irrelevant_charts", "verification_status", "analysis_depth")} | {
            # FINAL P3 coverage telemetry: counts/enums/lens IDs only.
            "depth_selection_origin": (session.ui_constraints or {}).get("depth_selection_origin"),
            "coverage_status": (self.semantic_info.get("analysis_coverage") or {}).get("status"),
            "coverage_gap_kind": (self.semantic_info.get("analysis_coverage") or {}).get("gap_kind"),
            "coverage_views": [(self.semantic_info.get("analysis_coverage") or {}).get(k) for k in ("rendered_total", "target_total")],
            "lens_rejections": sorted({l["reason"] for l in (self.semantic_info.get("analysis_coverage") or {}).get("lenses", []) if l["status"] == "rejected"})},
            default=str))
        from services.analysis_quality_service import publication_issues
        if response["quality_context"]["version"] == "2.8" and publication_issues(response["quality_assessment"]):
            # Governed verifier wording only (no question text, values or SQL).
            self.semantic_info["quality_not_scored_reason"] = response["quality_assessment"].get("reason")
            self.semantic_info['publication_issues'] = publication_issues(response['quality_assessment'])
            telemetry_logging.getLogger('ai-analytics').warning('[QualityNotScored] %s', response["quality_assessment"].get("reason"))
            raise AnalysisError("quality_verification","Report provenance failed independent verification")
        self.semantic_info["failure_stage"] = None
        response["diagnostics"]["quality_score_compute_ms"] = round((time.perf_counter() - started_quality) * 1000, 2)
        import logging
        logging.getLogger('ai-analytics').info('[Verification] score=%s measured_checks=%s failed_checks=%s not_measured=%s',
            response['quality_assessment']['score'],len(response['quality_assessment']['verification_checks']),
            sum(c['status'] not in {'passed','not_applicable'} for c in response['quality_assessment']['verification_checks']),
            response['quality_assessment']['accuracy_assessment']['status'])
        from services.provider_budget import check_request_deadline
        check_request_deadline()
        if active_principal.get() is not None:
            current_principal(required=True)  # Revoke during revision must prevent publication.
        self.save_meaning(session, artifacts, catalog, reference, plan)
        session.last_result_contract = response["result_contracts"]
        session.approved = True
        session.revision = response["revision"]
        session.diagnostics = response["diagnostics"]
        # Measure/reduce transport before committing report state. Scalar KPIs
        # and exact derived facts are never recomputed on a preview.
        bound_response(response, capacity_contract)
        session.report_response = session_report_summary(response)
        session.update_state(
            response["sql"],
            {"row_count": len(first["rows"])},
            response["title"],
            response["description"],
        )
        from services.session_service import save_session
        save_session(session)
        return response

    def reconcile(self, session_id):
        """V3.2 independent numeric/ranking oracle for an approved report.

        Read-only aggregate queries compiled from the same governed metric
        definitions but a different query shape; 0 provider calls. Run on demand
        (verification tab) so report generation cost is unchanged.
        """
        from services.verification_reconciliation_service import OracleRunner, reconcile
        from services.result_artifact_store import artifact_store
        session = get_session(session_id)
        if not session or not session.approved:
            raise AnalysisError("session", "Validated server session required")
        self.check_owner(session)
        catalog = self.catalog()
        if session.schema_fingerprint != catalog.fingerprint:
            raise AnalysisError("schema_changed", "Refresh proposal")
        reference = date.fromisoformat(session.agent_reference_date)
        artifacts = {}
        for id, a in session.agent_artifacts.items():
            if a.result is None and a.result_ref:
                a.result = artifact_store().get(a.result_ref)
            artifacts[id] = a
        agent = self.agent(catalog, reference, previous=session.agent_artifacts,
                           known_concepts=session.agent_state.get("resolved_concepts", []))
        agent.queries.ui_context = deepcopy(session.ui_constraints)
        runner = OracleRunner(agent.queries)
        revision=session.revision
        from services.sql_service import execute_read_only
        if self.executor is execute_read_only:
            from services.query_execution_batch import report_snapshot,data_epoch
            from services.verification_reconciliation_service import compare_epochs
            import sqlglot
            from sqlglot import exp
            tables={node.db+'.'+node.name for artifact in artifacts.values()
                for node in sqlglot.parse_one(artifact.sql,read='postgres').find_all(exp.Table) if node.db}
            with report_snapshot(tables):
                report_epoch=(session.report_response.get('provenance') or {}).get('data_epoch')
                consistency=compare_epochs(report_epoch,data_epoch.get())
                if consistency['status']=='same_generation':
                    result=reconcile(artifacts,catalog,runner)
                else:
                    result={'numeric':[],'ranking':[],'trend':[],'independent_oracle':None,
                            'oracle_queries':0,'oracle_failures':0,'oracle_successes':0}
                result['consistency']=consistency
        else:
            result = reconcile(artifacts, catalog, runner)
            result['consistency']={'status':'fixture_reference','basis':'Explicit offline fixture executor'}
        if session.revision!=revision:
            raise AnalysisError('session','Reconciliation belongs to an older report revision')

        result.update(provider_calls=0, measured_at=datetime.now().astimezone().isoformat(),
                      registry_fingerprint=catalog.registry_fingerprint, session_revision=session.revision)
        session.diagnostics = {**(session.diagnostics or {}), "independent_reconciliation": deepcopy(result)}
        from services.verification_reconciliation_service import merge_reconciliation
        if session.report_response and session.revision==revision:
            session.report_response['verification']=merge_reconciliation(session.report_response.get('verification'),result)

        from services.session_service import save_session
        save_session(session)
        return result

    def restore_hybrid_meaning(self, session):
        if session.semantic_intent:
            self.semantic_info.update(semantic_intent=deepcopy(session.semantic_intent),semantic_intent_fingerprint=session.intent_fingerprint,
                resolved_plan_fingerprint=session.plan_fingerprint,resolved_operations=deepcopy(session.resolved_operations),
                resolved_requirement_coverage=deepcopy(session.requirement_coverage),derived_feature_bindings=deepcopy(session.feature_bindings),resolver_version=session.resolver_version,
                request_anchors=deepcopy(session.diagnostics.get("request_anchors", {})),request_anchor_verification="passed",
                initial_semantic_intent=deepcopy(session.initial_semantic_intent),semantic_history=deepcopy(session.semantic_history),
                server_supporting_expansion=session.ui_constraints.get('server_supporting_expansion'),
                fixed_grouping_policy=session.ui_constraints.get('fixed_grouping_policy'),
                minimum_visuals=session.ui_constraints.get('minimum_visuals',0))

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
