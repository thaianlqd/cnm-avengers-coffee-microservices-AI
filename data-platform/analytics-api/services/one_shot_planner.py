"""Production planning: local validation with at most one targeted repair."""

import time
import os
from dataclasses import replace
from services.analysis_catalog import AnalysisError
from services.analyst_contract import DashboardPlan
from services.analyst_decision import AnalystDecision, DecisionOperation, decision_tool
from services.analytical_tool_contract import ToolContractError, issue, rejection_issues
from services.analytical_query_service import AnalyticalQueries
from services.semantic_tools import SemanticTools
from services.semantic_manifest_service import build_manifest, manifest_references, provider_manifest, compact, char_limit
from services.provider_budget import ProviderTurn, validate_single_shot_policy
from services.value_grounding_service import dimension_values, value_text
from services.analyst_clarification import clarify_decision, clarify_filter, UnresolvedFilter
from services.domain_intelligence_service import DomainIntelligence, DEPTH_POLICIES
from services.decision_boundary_normalizer import normalize_operation
from services.analytical_blueprint_service import materialize, BlueprintIssue, historical_issue
from services.one_shot_context import pack_context, context_messages, wire_payload

SYSTEM = """Vietnamese business analyst: submit one plan, clarification or unsupported decision. Directory covers all domains; packs are candidate knowledge, not intent. Interpret question using delivered semantic IDs only. No SQL, invented metrics/values, forecasts, causes or prose.
UI domain/time/scope are authoritative; AUTO permits interpretation. Omitted time=all_time; explicit time requires complete kind, ranges ISO dates. Broad questions need useful catalog lenses, not automatic clarification. Preserve EVERY requested component, including focused; over eight operations requires clarification. OPTIONAL depth: focused 1–3 views, deep 4–6 (5–6 useful), comprehensive 6–8 across relevant domains. Targets are not quotas. Use ui.supporting_limit; no filler. lens_id optional; contextual volume is not best/worst or a composite score.
Supports inherit requested parent time/filters. same needs equal population_group; related needs purpose=context, context_subjects [parent,support] links and matching clocks. Never infer shares/causes across related populations. Snapshots only all_time, no history/trends. Registered customers differ from buyers; non-additive counts/averages cannot be summed.
Ranking needs group_by/top_n (one metric defaults ranking.metric, DESC). Trend needs granularity, at most one low-cardinality group; all_time normally month. detail_fields only detail. Canonical enums; other values verified locally. Don't repeat metric-owned predicates. Server selects visuals/evidence after approval.
Refinement: replaces/changed_fields, unchanged fields inherit; retain old requested work unless replaced/removed. No private reasoning."""

NATURAL_SYSTEM = """V2.7: Declare analysis_components for every requested business requirement, mapped to requested operation IDs. Unavailable requirements remain with status/reason and no operations; never silently substitute metrics. Supports are separate.
Vietnamese business analyst: one structured plan, clarification or unsupported; no SQL/prose/private reasoning. Separate inputs: question=business intent; optional analysis_context=scope; optional analysis_expectation=coverage/presentation; ui.required_period and structured scope are hard constraints. AUTO interprets question time; omitted time=all_time. Choose analysis_breadth focused/deep/comprehensive yourself. Preserve EVERY requested component; over 8 operations asks to split, never drops work. Focused 1–3, deep 4–6, comprehensive 6–8 useful views, targets not quotas. No filler.
Use delivered IDs only. Directory/lenses cover available domains; packs are candidate knowledge, not intent. Select business lens; server fills omitted blueprint defaults. Null default needs a real business choice. Explicit ranking overrides aggregate default; ranking needs Top N/direction when requested. Trends need historical data; snapshots only all_time, never fabricated history. No forecasts, causes, composite best/worst scores or invented metrics/values.
Supports inherit parent time/filters: same needs equal population_group; related needs purpose=context, declared subject links and matching clocks. No shares/reconciliation across related populations. Buyers differ from registered customers; distinct counts/averages non-additive. Top N is not whole composition. At most 8 total operations; optional support counts must match selected breadth. Server validates values, SQL, evidence and visuals after approval."""

class OneShotPlanner:
    def __init__(self, catalog, provider, executor, lookup, reference, diagnostics,
                 budget, proposal=False, previous=None):
        from services.agent_provider import NativeAgentProvider

        if isinstance(provider, NativeAgentProvider):
            provider.reset()
        self.catalog, self.reference, self.diagnostics = catalog, reference, diagnostics
        self.budget = replace(budget, operations=min(8, budget.operations), db_queries=min(12, budget.db_queries),
                              supporting_operations=min(3, budget.supporting_operations), contract_repairs=0)
        self.proposal = proposal
        self.semantic = SemanticTools(catalog, lookup)
        self.queries = AnalyticalQueries(catalog, self.semantic, reference, executor, diagnostics, proposal, previous)
        self.queries.enforce_discovery = True
        diagnostics.update(planning_mode="one_shot", pipeline_version="2.7", provider_calls=[],
            provider_status="not_started", provider_error_category=None, agent_contract_status="not_started",
            agent_contract_error=None, terminal_error=None, db_query_count=0, value_lookup_count=0,
            contract_repair_count=0, contract_rejection_count=0, contract_normalization_count=0,
            contract_normalizations=[], model_escalation_count=0, provider_fallback_count=0,
            post_result_provider_call_count=0, semantic_tool_calls=0, analytical_tool_calls=0, analytical_cache_hits=0,
            agent_rounds=0, cost_rounds=[], tool_trace=[], semantic_status="not_started",
            execution_status="not_started", result_status="not_started", limitations=[],
            omitted_supporting_operations=[], omitted_supporting_operation_count=0,
            requested_operation_count=0, supporting_operation_count=0,
            input_tokens=None, output_tokens=None, cumulative_planning_input_tokens=None,
            cumulative_planning_output_tokens=None)
        self.turn = ProviderTurn(provider, diagnostics)
        self.budget = replace(self.budget, contract_repairs=self.turn.budget.max_calls - 1)
        self.value_resolutions = {}
        self.intelligence = DomainIntelligence(catalog)

    def fail_contract(self, error):
        issues = rejection_issues(error)
        self.diagnostics.update(agent_contract_status="invalid", agent_contract_error="invalid_analysis_contract",
                                terminal_error="invalid_analysis_contract", contract_rejection_count=self.diagnostics["contract_rejection_count"] + 1,
                                contract_issues=issues)
        rejected = ToolContractError(issues)
        rejected.business_category = getattr(error,"category",None)
        raise rejected from None

    def omit(self, error):
        # Never expose unvalidated IDs, values, SQL or provider prose.
        entry = {"reason": "invalid_supporting_contract", "issues": rejection_issues(error)}
        if len(self.diagnostics["omitted_supporting_operations"]) < 12:
            self.diagnostics["omitted_supporting_operations"].append(entry)
        self.diagnostics["omitted_supporting_operation_count"] += 1

    def ground_values(self, data):
        for index, f in enumerate(data.get("filters", [])):
            d = self.catalog.registry["dimensions"].get(f["dimension"])
            if not d or ("dimension", f["dimension"]) not in self.semantic.discovered:
                raise ToolContractError([issue("filters.dimension", "concept_not_discovered")])
            values = f["value"] if isinstance(f["value"], list) else [f["value"]]
            grounded = []
            for value in values:
                if value in dimension_values(self.catalog, f["dimension"]) or value in self.semantic.resolved.get(f["dimension"], set()) or d.get("value_grounding", {}).get("mode") == "literal" and type(value) in (int, float, bool):
                    grounded.append(value)
                    continue
                # Local enums/aliases do not consume a DB lookup allowance.
                # Scalar identifiers can be searched as text, but the returned
                # canonical value must still come from the checked column.
                key = (f["dimension"], type(value).__name__, value_text(value))
                resolved = self.value_resolutions.get(key)
                if resolved is None:
                    before = self.semantic.lookup_count
                    resolved = self.semantic.resolve({"dimension": f["dimension"], "reference": str(value)},
                        allow_lookup=self.semantic.lookup_count < self.budget.value_lookups)
                    self.value_resolutions[key] = resolved
                    trace = self.diagnostics.setdefault("filter_resolutions", [])
                    if len(trace) < 12:
                        trace.append({"dimension": f["dimension"], "filter_index": index, "status": resolved["status"],
                                      "lookup_performed": self.semantic.lookup_count > before})
                if resolved["status"] != "resolved":
                    raise UnresolvedFilter(f["dimension"], resolved)
                grounded.append(resolved["value"])
            f["value"] = grounded if isinstance(f["value"], list) else grounded[0]

    def prepare(self, raw, role):
        raw, rules = normalize_operation(raw)
        context = getattr(self.queries, "ui_context", {}) or {}
        if context.get("natural_input") and raw.get("lens_id") and raw["lens_id"] not in getattr(self, "delivered_lenses", set()):
            raise ToolContractError([issue("lens_id", "lens_not_delivered")])
        raw, blueprint_rules = materialize(raw, self.catalog, self.intelligence, self.queries.previous)
        self.record_normalizations([*rules, *blueprint_rules])
        if blueprint_rules:
            self.diagnostics.setdefault("blueprint_materializations", []).append({"lens_id": raw.get("lens_id"), "rules": blueprint_rules})
        if context.get("natural_input"):
            # Permission is narrowly tied to server-owned defaults of the chosen,
            # physically validated delivered lens, never arbitrary model IDs.
            # A whole-subject manifest shard can omit metrics still explicitly
            # delivered in the selected lens directory. Preserve that narrower
            # permission without authorizing other catalog or model references.
            delivered_metrics = getattr(self, "delivered_lens_metrics", {}).get(raw.get("lens_id"), set())
            self.semantic.discovered.update(("metric", m) for m in raw.get("metrics", []) if m in delivered_metrics)
            if "lens_default_subject" in blueprint_rules:
                self.semantic.discovered.add(("subject",raw["subject"]))
            if "lens_default_metric" in blueprint_rules:
                self.semantic.discovered.update(("metric",m) for m in raw["metrics"])
            if set(blueprint_rules) & {"lens_required_grouping","lens_default_grouping"}:
                self.semantic.discovered.update(("dimension",d) for d in raw["group_by"])
        if context.get("natural_input") and "time" not in raw and not raw.get("replaces") and role == "requested" and context.get("required_period") is not None:
            period = context["required_period"]
            raw["time"] = {"kind": "relative", "mode": "all_time"} if period["start"] is None else {"kind": "range", **period}
        operation = DecisionOperation.model_validate(raw)
        data = operation.internal(role, self.queries.previous)
        if role == "supporting" and not operation.replaces:
            parent = self.queries.pending.get(operation.parent_id)
            if not parent or parent.query.role != "requested":
                raise ToolContractError([issue("parent_id", "supporting_parent_required")])
            for field in ("time", "filters"):
                if field not in data:
                    data[field] = parent.query.model_dump(mode="json")[field]
        try:
            self.ground_values(data)
        except UnresolvedFilter as error:
            error.operation = raw
            raise
        if data.get("lens_id"):
            from services.time_resolution_service import resolve_time
            _, _, period = resolve_time(data.get("time", {"kind":"relative","mode":"all_time"}), self.reference, self.catalog.registry["timezone"])
            if period["start"] and any(m in self.catalog.registry["metrics"] and not self.catalog.registry["metrics"][m].get("time_column") for m in data.get("metrics", [])):
                profile = self.intelligence.domain_for(data.get("subject"))
                raise historical_issue(profile) if profile else AnalysisError("historical_metric_unavailable", "History unavailable")
        prepared = self.queries.prepare(data)
        if prepared.query.id in self.queries.previous and not prepared.query.replaces:
            raise ToolContractError([issue("id", "replacement_reference_required")])
        self.record_normalizations(self.queries.normalizations)
        return prepared

    def record_normalizations(self, rules):
        self.diagnostics["contract_normalization_count"] += len(rules)
        self.diagnostics["contract_normalizations"] = list(dict.fromkeys([
            *self.diagnostics["contract_normalizations"], *rules]))[:20]

    def accept_plan(self, decision):
        if decision.clarification or not decision.requested_operations and not (self.queries.previous and (decision.visuals or decision.removed_query_ids)):
            self.fail_contract(ToolContractError([issue("requested_operations", "field_required")]))
        previous = self.queries.previous
        removed = set(decision.removed_query_ids)
        if len(removed) != len(decision.removed_query_ids) or not removed <= set(previous):
            self.fail_contract(ToolContractError([issue("removed_query_ids", "unknown_reference")]))
        requested, supporting, replaced = {}, {}, set()
        try:
            invalid = []
            for index, raw in enumerate(decision.requested_operations):
                snapshot = dict(self.queries.pending)
                try:
                    before = set(self.queries.pending)
                    a = self.prepare(raw, "requested")
                    if a.query.id in requested or a.query.replaces in replaced or a.query.id in before:
                        raise ToolContractError([issue("id", "duplicate_field")])
                    requested[a.query.id] = a
                    if a.query.replaces:
                        replaced.add(a.query.replaces)
                except (BlueprintIssue, UnresolvedFilter):
                    raise
                except (ValueError, TypeError, KeyError) as error:
                    if self.turn.budget.max_calls == 1 or getattr(error, "category", None) in {"historical_metric_unavailable", "unsupported"}:
                        raise
                    self.queries.pending = snapshot
                    invalid.extend(issue(["requested_operations", index, *e["path"].split(".")], e["code"]) for e in rejection_issues(error))
            if invalid:
                raise ToolContractError(invalid)
            for id, old in previous.items():
                if old.query.role == "requested" and id not in removed | replaced:
                    args = old.query.model_dump(mode="json")
                    args.update(replaces=None, changed_fields=[])
                    requested[id] = self.queries.prepare(args)
            if len(requested) > self.budget.operations or len({a.signature for a in requested.values()} - set(self.queries.cache)) > self.budget.db_queries:
                raise ToolContractError([issue("requested_operations", "operation_budget")])
            if not requested:
                raise ToolContractError([issue("requested_operations", "field_required")])
        except BlueprintIssue:
            self.diagnostics.update(agent_contract_status="valid", semantic_status="clarification")
            raise
        except UnresolvedFilter as error:
            clarify_filter(self, error, getattr(error,"operation",raw))
        except (ValueError, TypeError, KeyError) as error:
            if getattr(error, "category", None) == "unsupported" and isinstance(raw, dict) and any(m in self.catalog.registry["metrics"] and not self.catalog.registry["metrics"][m].get("time_column") for m in raw.get("metrics", [])):
                self.diagnostics.update(agent_contract_status="valid", semantic_status="unsupported")
                raise AnalysisError("historical_metric_unavailable", "Snapshot history is unavailable") from None
            if getattr(error, "category", None) == "historical_metric_unavailable":
                raise
            self.fail_contract(error)
        # Resolve and validate optional work independently, after every mandatory contract.
        counts = {}
        # Bound optional validation work and diagnostic storage independently of
        # mandatory validity, including an oversized optional array.
        excess = max(0, len(decision.supporting_operations) - 24)
        if excess:
            self.omit(ToolContractError([issue("supporting_operations", "supporting_budget")]))
            self.diagnostics["omitted_supporting_operation_count"] += excess - 1
        candidates = [(raw, False) for raw in decision.supporting_operations[:24]]
        candidates += [(old.query.model_dump(mode="json"), True) for id, old in previous.items()
                       if old.query.role == "supporting" and id not in removed]
        replacement_parents = {a.query.replaces: a.query.id for a in requested.values() if a.query.replaces}
        self.queries.parent_replacements = replacement_parents
        for raw, stored in candidates:
            snapshot = dict(self.queries.pending)
            try:
                if isinstance(raw, dict) and raw.get("parent_id") in replacement_parents:
                    raw = {**raw, "parent_id": replacement_parents[raw["parent_id"]]}
                if stored:
                    if raw["id"] in replaced or raw["id"] in supporting:
                        continue
                    raw.update(replaces=None, changed_fields=[])
                    a = self.queries.prepare(raw)
                else:
                    a = self.prepare(raw, "supporting")
                q = a.query
                if q.parent_id not in requested:
                    raise ToolContractError([issue("parent_id", "unknown_reference")])
                if q.id in requested or q.id in supporting or q.replaces in replaced:
                    raise ToolContractError([issue("id", "duplicate_field")])
                signatures = {v.signature for v in [*requested.values(), *supporting.values(), a]} - set(self.queries.cache)
                if len(requested) + len(supporting) >= self.budget.operations or len(supporting) >= self.budget.supporting_operations or counts.get(q.parent_id, 0) >= self.budget.supporting_operations or len(signatures) > self.budget.db_queries:
                    raise ToolContractError([issue("supporting_operations", "supporting_budget")])
                supporting[q.id] = a
                counts[q.parent_id] = counts.get(q.parent_id, 0) + 1
                if q.replaces:
                    replaced.add(q.replaces)
            except (ValueError, TypeError, KeyError) as error:
                self.queries.pending = snapshot
                self.omit(error)
        # Execute only after mandatory preflight. Approval uses this stored plan directly.
        prepared = {**requested, **supporting}
        optional_ids = {raw.get("id") for raw in decision.supporting_operations if isinstance(raw, dict) and isinstance(raw.get("id"), str)}
        optional_ids.update(raw["id"] for raw, stored in candidates if stored)
        visuals = []
        try:
            for visual in decision.visuals:
                unknown = set([visual.query_id, *visual.compare_query_ids]) - set(prepared)
                if unknown and (unknown <= optional_ids or visual.role == "supporting"):
                    self.diagnostics.setdefault("omitted_visuals", []).append({"reason": "supporting_operation_omitted"})
                    continue
                for ref in [visual.query_id, *visual.compare_query_ids]:
                    if ref not in prepared:
                        raise ToolContractError([issue("visuals.query_id", "unknown_reference")])
                a = prepared[visual.query_id]
                fields = set(a.plan.dimensions + a.plan.metrics + (["period"] if a.plan.kind == "trend" else []))
                if not set(visual.metrics) <= set(a.plan.metrics) or any(f and f not in fields for f in (visual.x_field, visual.series_field)):
                    raise ToolContractError([issue("visuals", "unknown_reference")])
                visuals.append(visual)
        except (ValueError, TypeError, KeyError) as error:
            self.fail_contract(error)
        from services.agent_pipeline import AnalysisPipeline
        try:
            AnalysisPipeline.enforce_ui(prepared, getattr(self.queries, "ui_context", {}) or {})
        except AnalysisError as error:
            error.planning_scope_conflict = True
            raise
        from services.analysis_coverage_service import canonical_components, coverage_diagnostics
        try:
            components, origin = canonical_components(decision.analysis_components, prepared, self.intelligence)
        except (ValueError, TypeError, KeyError) as error:
            self.fail_contract(error)
        self.diagnostics.update(analysis_components=components, coverage_origin=origin,
                                **coverage_diagnostics(components, prepared))
        if any(c["status"] != "planned" and c["requested_or_supporting"] == "requested" for c in components) and not self.proposal:
            raise AnalysisError("approval_required", "Reduced requested scope needs explicit approval")
        active = {}
        for a in [*requested.values(), *supporting.values()]:
            try:
                active[a.query.id] = self.queries.run(a)
            except AnalysisError as error:
                if a.query.role == "requested":
                    self.diagnostics.update(terminal_error=error.category,
                        execution_status="failed" if error.category == "execution" else "passed",
                        result_status="failed" if error.category == "result_contract" else "not_started")
                    raise
                self.omit(error)
        if self.diagnostics["omitted_supporting_operation_count"]:
            self.diagnostics["limitations"].append({"reason": "omitted_supporting_operations", "message": "Một phần phân tích hỗ trợ chưa hợp lệ hoặc vượt giới hạn nên đã được bỏ qua."})
        self.diagnostics.update(agent_contract_status="valid_with_omitted_support" if self.diagnostics["omitted_supporting_operation_count"] else "valid",
            semantic_status="grounded", requested_operation_count=sum(a.query.role == "requested" for a in active.values()),
            supporting_operation_count=sum(a.query.role == "supporting" for a in active.values()),
            analytical_tool_calls=len(active), registered_requested_operations=len(requested),
            registered_supporting_operations=sum(a.query.role == "supporting" for a in active.values()))
        return active, DashboardPlan(active_query_ids=list(active), visuals=visuals)

    def accept_response(self, response, natural, context):
        calls = response.get("calls")
        if not calls:
            category = "provider_unavailable"
            if response.get("offline"):
                category = "provider_offline"
            elif response.get("configuration_missing"):
                category = "provider_configuration_missing"
            elif response.get("attempts"):
                category = response.get("attempts", [])[-1].get("error_category", category)
                category = {"provider_schema": "provider_schema_invalid", "invalid_tool_response": "provider_invalid_json", "provider_http": "provider_unavailable"}.get(category, category)
            self.diagnostics.update(provider_status="failed", provider_error_category=category)
            raise AnalysisError(category, "Provider did not return a decision")
        self.diagnostics.update(provider_status="success", provider_error_category=None)
        try:
            if not isinstance(calls, list) or len(calls) != 1 or not isinstance(calls[0], dict) or set(calls[0]) != {"id", "name", "arguments"} or calls[0]["name"] != "submit_analyst_decision" or not isinstance(calls[0]["id"], str):
                raise ToolContractError([issue("contract", "invalid_analysis_shape")])
            raw_decision = calls[0]["arguments"]
            if isinstance(raw_decision, dict) and isinstance(raw_decision.get("requested_operations"), list) and len(raw_decision["requested_operations"]) > self.budget.operations:
                raise AnalysisError("requested_scope_too_large", "Reduce requested scope")
            decision = AnalystDecision.model_validate(raw_decision)
            if natural:
                depth = decision.analysis_breadth or "deep"
                policy = DEPTH_POLICIES[depth]
                self.budget = replace(self.budget, supporting_operations=policy["supports"])
                self.diagnostics.update(analysis_depth=depth, analysis_breadth=depth,
                    supporting_operation_limit=policy["supports"], target_visual_count=policy["target_views"][-1], target_visual_range=policy["target_views"])
            if decision.decision_type != "plan":
                if decision.requested_operations or decision.supporting_operations or decision.removed_query_ids or decision.visuals or not decision.clarification:
                    raise ToolContractError([issue("clarification", "invalid_analysis_shape")])
                if decision.decision_type == "unsupported" and decision.clarification.reason not in {"unsupported_metric", "unsupported_dimension", "forecast_unsupported"}:
                    raise ToolContractError([issue("clarification.reason", "invalid_enum")])
                self.diagnostics.update(agent_contract_status="valid", semantic_status=decision.decision_type)
                if decision.clarification.known_query is not None:
                    draft, rules = normalize_operation(decision.clarification.known_query)
                    self.record_normalizations(rules)
                    decision.clarification.known_query = draft
                clarify_decision(self, decision.clarification.model_dump(mode="json"))
        except (ValueError, TypeError, KeyError) as error:
            if getattr(error, "clarification", None) or getattr(error, "category", None) == "requested_scope_too_large":
                raise
            self.fail_contract(error)
        self.queries.ui_context = context or {}
        return self.accept_plan(decision)

    def run(self, prompt, context=None):
        started = time.perf_counter()
        try:
            validate_single_shot_policy()
            context = dict(context or {})
            # Structured selection shares the same finite lookup allowance.
            self.semantic.lookup_count = context.get("scope_lookup_count", 0)
            for f in context.get("required_filters", []):
                values = f["value"] if isinstance(f["value"], list) else [f["value"]]
                self.semantic.resolved.setdefault(f["dimension"], set()).update(values)
                for value in values:
                    self.value_resolutions[(f["dimension"], type(value).__name__, value_text(value))] = {"status": "resolved", "value": value}
            depth = context.get("analysis_depth", "deep")
            if depth not in DEPTH_POLICIES:
                raise AnalysisError("context_configuration", "Unknown analysis depth")
            policy = DEPTH_POLICIES[depth]
            support_limit = policy["supports"]
            if depth == "deep":
                try:
                    support_limit = min(6, max(0, int(os.getenv("DATA_ANALYST_DEEP_SUPPORTING_OPERATIONS", "6"))))
                except ValueError:
                    raise AnalysisError("context_configuration", "Invalid deep analysis allowance") from None
            self.budget = replace(self.budget, supporting_operations=support_limit)
            context["supporting_limit"] = self.budget.supporting_operations
            self.diagnostics.update(analysis_depth=depth, supporting_operation_limit=self.budget.supporting_operations,
                                    target_visual_count=policy["target_views"][-1], target_visual_range=policy["target_views"])
            intelligence = DomainIntelligence(self.catalog)
            previous_subjects = [a.query.subject for a in self.queries.previous.values()]
            retrieval_text = " ".join([prompt, context.get("analysis_context", ""), context.get("analysis_expectation", "")])
            candidates = intelligence.candidates(retrieval_text, context.get("domain", "auto"), depth, previous_subjects)
            manifest, hit = build_manifest(self.catalog, subject_priority=[s for c in candidates for s in intelligence.available()[c["id"]]["primary_subjects"]])
            knowledge = intelligence.context(retrieval_text, context.get("domain", "auto"), depth, manifest_references(manifest),
                previous_subjects, candidates=candidates, blueprints=context.get("natural_input", False))
            state = []
            for id, a in self.queries.previous.items():
                q = a.query.model_dump(mode="json", exclude_defaults=True)
                q.pop("project", None)
                if a.query.project:
                    q["detail_fields"] = a.query.project
                q.pop("replaces", None)
                q.pop("changed_fields", None)
                state.append({"query": q, "result_ref": id if a.result is not None else None})
            payload = {"request": prompt, "reference_date": self.reference.isoformat(),
                "timezone": self.catalog.registry["timezone"], "ui": context, "manifest": provider_manifest(manifest), "domains": knowledge, "state": state}
            natural = context.get("natural_input", False)
            if natural:
                payload["question"] = payload.pop("request")
                payload["input_version"] = "2.6"
                payload["ui"] = {k: v for k, v in context.items() if k not in {"natural_input", "analysis_depth", "analysis_context", "analysis_expectation"}}
                for key in ("analysis_context", "analysis_expectation"):
                    if context.get(key, "").strip():
                        payload[key] = context[key]
            refinement = bool(self.queries.previous)
            system = SYSTEM if refinement else SYSTEM.split("\nRefinement:")[0]
            if natural:
                system = NATURAL_SYSTEM + ("\nRefinement: replaces/changed_fields inherit unchanged meaning. Retain prior requested work unless replaced/removed; supports inherit parent scope. No full history." if refinement else "")
            tools = [decision_tool(refinement=refinement, supporting_limit=7 if natural else support_limit, natural=natural)]
            from services.agent_provider import gemini_tool_schema
            wire_tools = [{**t, "parameters": gemini_tool_schema(t)} for t in tools]
            # Include provider wrappers and JSON escaping. Both supported Gemini
            # styles fit before the allowance is consumed; no adapter state is mutated.
            hard_maximum = char_limit("DATA_ANALYST_ONE_SHOT_CONTEXT_MAX_CHARS", 48000 if natural else 24000, 48000)
            maximum = min(policy["body_chars"], hard_maximum)
            packing_allowance = maximum - min(1000, maximum // 20) if natural else maximum
            self.diagnostics["packing_target_chars"] = packing_allowance
            manifest, packing_hit, sizes, omitted = pack_context(self.catalog, intelligence, candidates, manifest,
                payload, tools, system, packing_allowance, min(21000,packing_allowance) if depth == "comprehensive" and not refinement else packing_allowance)
            hit = hit or packing_hit
            messages = context_messages(payload)
            delivered_knowledge = wire_payload(payload)["domains"]
            chars = max(sizes.values())
            # Keep the economical 24k target for ordinary requests. Required
            # multi-domain knowledge can expand the allowance only after local
            # compaction/sharding, without another provider call or lost scope.
            if natural and maximum < chars <= hard_maximum:
                maximum = min(hard_maximum, ((chars + 1999) // 1000) * 1000)
            self.diagnostics.update(semantic_manifest_chars=len(compact(payload["manifest"])), manifest_cache_hit=hit,
                semantic_manifest_complete=manifest["complete"], decision_schema_chars=len(compact(wire_tools)),
                total_context_chars=chars, context_char_budget=maximum)
            self.diagnostics.update(context_hard_char_budget=hard_maximum,
                                    context_budget_expanded=maximum > policy["body_chars"],
                                    blueprint_context_shared=bool(delivered_knowledge.get("blueprint_sets")))
            self.diagnostics.update(domain_context_mode=depth, global_domain_count=len(knowledge["directory"]),
                global_domain_directory_chars=len(compact(knowledge["directory"])),
                global_lens_directory_chars=len(compact(delivered_knowledge.get("lens_directory", {}))),
                retrieval_candidate_count=len(candidates),
                retrieval_confidence="high" if any(c["protected"] for c in candidates) else "low",
                coverage_contract_chars=len(compact(wire_tools[0].get("parameters", {}).get("properties", {}).get("analysis_components", {}))),
                example_intent_chars=0,
                detailed_domain_ids=[p["id"] for p in knowledge["packs"]], domain_packs_omitted=omitted,
                detailed_domain_pack_chars={p["id"]: len(compact(p)) for p in delivered_knowledge["packs"]},
                domain_context_chars=len(compact(delivered_knowledge)), system_chars=len(system), session_state_chars=len(compact(state)),
                question_ui_chars=len(compact({"request": prompt, "ui": context})))
            pack_ids = {p["id"] for p in knowledge["packs"]}
            self.diagnostics.update(
                strong_domain_candidates=[{k: c[k] for k in ("id", "match_category", "priority")} for c in candidates if c["protected"]],
                full_domain_pack_ids=[p["id"] for p in knowledge["packs"] if p["tier"] == "full"],
                compact_domain_pack_ids=[p["id"] for p in knowledge["packs"] if p["tier"] == "compact"],
                directory_only_domain_ids=[d[0] for d in knowledge["directory"] if d[0] not in pack_ids],
                pruned_optional_domain_ids=omitted, provider_body_chars=sizes,
                provider_body_headroom_chars=maximum - chars)
            if chars > maximum:
                raise AnalysisError("one_shot_context_budget_exceeded", "Planning context exceeds allowance")
            self.semantic.discovered.update(manifest_references(manifest))
            if natural:
                self.delivered_lenses = {l[0] for lenses in delivered_knowledge.get("lens_directory", {}).values() for l in lenses}
                self.delivered_lenses.update(l[0] for p in delivered_knowledge["packs"] for l in p["lenses"])
                self.delivered_lens_metrics = {l[0]: set(l[4]) for lenses in delivered_knowledge.get("lens_directory", {}).values() for l in lenses}
                self.diagnostics["delivered_lens_count"] = len(self.delivered_lenses)
            repair_operation_count = 0
            repair_components = set()
            for attempt in range(self.turn.budget.max_calls):
                response = {}
                try:
                    try:
                        response = self.turn.invoke(system=system, messages=messages, tools=tools) or {}
                    except AnalysisError:
                        raise
                    except Exception:
                        response = {"calls": None, "attempts": []}
                    attempts = response.get("attempts", [])
                    self.diagnostics["agent_rounds"] = attempt + 1
                    self.diagnostics["provider_calls"].extend(attempts)
                    if len(attempts) > 1:
                        raise AnalysisError("provider_call_budget_exceeded", "Transport returned multiple attempts")
                    for field, token in (("input_tokens", "input"), ("output_tokens", "output")):
                        values = [a.get("tokens", {}).get(token) for a in self.diagnostics["provider_calls"]]
                        total = sum(v for v in values if isinstance(v, int)) if any(isinstance(v, int) for v in values) else None
                        self.diagnostics[field] = total
                        self.diagnostics["cumulative_planning_" + field] = total
                    if repair_operation_count:
                        returned = response.get("calls")
                        fixed = returned[0].get("arguments") if isinstance(returned, list) and len(returned) == 1 and isinstance(returned[0], dict) else None
                        if isinstance(fixed, dict) and fixed.get("decision_type") == "plan" and isinstance(fixed.get("requested_operations"), list) and len(fixed["requested_operations"]) < repair_operation_count:
                            self.fail_contract(ToolContractError([issue("requested_operations", "invalid_analysis_shape")]))
                    from services.analysis_coverage_service import requested_identity
                    returned = response.get("calls")
                    fixed = returned[0].get("arguments") if isinstance(returned, list) and len(returned) == 1 and isinstance(returned[0], dict) else None
                    if repair_components and isinstance(fixed, dict) and fixed.get("decision_type") == "plan" and not repair_components <= requested_identity(fixed.get("analysis_components", [])):
                        self.fail_contract(ToolContractError([issue("analysis_components", "missing_requested_component")]))
                    result = self.accept_response(response, natural, context)
                    self.diagnostics.update(terminal_error=None, agent_contract_error=None, contract_issues=[])
                    return result
                except AnalysisError as error:
                    category = error.category
                    last = (response.get("attempts") or [{}])[-1]
                    transient = category in {"provider_timeout", "provider_connection"} or category == "provider_unavailable" and last.get("http_status", 0) in {500, 502, 503, 504}
                    repairable = category in {"invalid_analysis_contract", "provider_invalid_json"} or getattr(error, "planning_scope_conflict", False)
                    # No guessing genuine business ambiguity, no quota/auth retries,
                    # and no replay of SQL or result validation failures.
                    if attempt or not (repairable or transient) or self.turn.budget.used >= self.turn.budget.max_calls or self.diagnostics["db_query_count"]:
                        raise
                    issues = rejection_issues(error) if repairable else []
                    self.diagnostics["planning_retry_reason"] = category
                    self.diagnostics["contract_repair_count"] += int(repairable)
                    self.diagnostics["transport_retry_count"] = int(transient)
                    self.diagnostics["repaired_contract_issues"] = issues
                    failed_calls = response.get("calls")
                    raw = next((c.get("arguments") for c in failed_calls if isinstance(c, dict) and isinstance(c.get("arguments"), dict)), None) if isinstance(failed_calls, list) else None
                    if repairable:
                        repair_components = requested_identity((raw or {}).get("analysis_components", []))
                        operations = (raw or {}).get("requested_operations")
                        repair_operation_count = len(operations) if isinstance(operations, list) and len(operations) <= self.budget.operations else 0
                        # Reuse the delivered catalog, omit verbose domain packs and
                        # global discovery prose. No results or SQL enter this call.
                        repair = {k: v for k, v in wire_payload(payload).items() if k != "domains"}
                        repair["validation_issues"] = issues
                        if raw and len(compact(raw)) <= 6000:
                            repair["rejected_decision"] = raw
                        lens_ids = {o.get("lens_id") for o in ((raw or {}).get("requested_operations") or []) if isinstance(o, dict)}
                        selected_packs = [p for p in delivered_knowledge["packs"] if any(l[0] in lens_ids for l in p["lenses"])]
                        repair["domains"] = {"packs": selected_packs or delivered_knowledge["packs"],
                                             "lens_directory": delivered_knowledge.get("lens_directory", {}),
                                             **{k: delivered_knowledge[k] for k in ("lens_columns", "compact_lens_columns", "blueprint_columns", "lens_directory_columns", "blueprint_sets", "blueprint_encoding") if k in delivered_knowledge}}
                        system = "Repair the rejected analyst decision using these validation issues. Preserve every requested component, UI constraints and original meaning. Use only delivered semantic IDs/lenses. No SQL, prose, invented values or dropped work. Return one submit_analyst_decision. " + ("Unchanged refinement fields inherit previous state. " if refinement else "")
                        from services.one_shot_context import body_sizes
                        repair_chars = max(body_sizes(system, repair, tools).values())
                        if repair_chars > maximum:
                            repair.pop("rejected_decision", None)
                            repair_chars = max(body_sizes(system, repair, tools).values())
                        self.diagnostics["repair_context_chars"] = repair_chars
                        if repair_chars > maximum:
                            raise AnalysisError("one_shot_context_budget_exceeded", "Repair exceeds bounded context")
                        messages = [{"role": "user", "content": compact(repair)}]
                    from services.agent_provider import NativeAgentProvider
                    if isinstance(self.turn.provider, NativeAgentProvider):
                        # Independent repair: do not replay opaque signed tool calls.
                        # The shared allowance survives transport reset.
                        self.turn.provider.reset()
                    self.queries.pending.clear()
                    self.queries.parent_replacements = {}
                    self.diagnostics["omitted_supporting_operations"] = []
                    self.diagnostics["omitted_supporting_operation_count"] = 0
                    self.diagnostics["limitations"] = []
                    self.diagnostics["terminal_error"] = None

        except AnalysisError as error:
            period = (context or {}).get("required_period")
            if period and period.get("start"):
                error.known = [*getattr(error,"known",[]), "Thời gian: " + period["start"] + " → " + period["end"]]
            self.diagnostics["terminal_error"] = error.category
            raise
        finally:
            self.diagnostics.update(value_lookup_count=self.semantic.lookup_count,
                                    planning_latency_ms=round((time.perf_counter() - started) * 1000, 2))
