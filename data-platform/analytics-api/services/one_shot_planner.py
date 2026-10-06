"""Production planning: one decision, local validation, zero repair/synthesis calls."""

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

SYSTEM = """Vietnamese business analyst: submit one plan, clarification or unsupported decision. Directory covers all domains; packs are candidate knowledge, not intent. Interpret question using delivered semantic IDs only. No SQL, invented metrics/values, forecasts, causes or prose.
UI domain/time/scope are authoritative; AUTO permits interpretation. Omitted time=all_time; explicit time requires complete kind, ranges ISO dates. Broad questions need useful catalog lenses, not automatic clarification. Preserve EVERY requested component, including focused; over eight operations requires clarification. OPTIONAL depth: focused 1–3 views, deep 4–6 (5–6 useful), comprehensive 6–8 across relevant domains. Targets are not quotas. Use ui.supporting_limit; no filler. lens_id optional; contextual volume is not best/worst or a composite score.
Supports inherit requested parent time/filters. same needs equal population_group; related needs purpose=context, context_subjects [parent,support] links and matching clocks. Never infer shares/causes across related populations. Snapshots only all_time, no history/trends. Registered customers differ from buyers; non-additive counts/averages cannot be summed.
Ranking needs group_by/top_n (one metric defaults ranking.metric, DESC). Trend needs granularity, at most one low-cardinality group; all_time normally month. detail_fields only detail. Canonical enums; other values verified locally. Don't repeat metric-owned predicates. Server selects visuals/evidence after approval.
Refinement: replaces/changed_fields, unchanged fields inherit; retain old requested work unless replaced/removed. No private reasoning."""

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
        diagnostics.update(planning_mode="one_shot", pipeline_version="2.5", provider_calls=[],
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
        self.value_resolutions = {}

    def fail_contract(self, error):
        issues = rejection_issues(error)
        self.diagnostics.update(agent_contract_status="invalid", agent_contract_error="invalid_analysis_contract",
                                terminal_error="invalid_analysis_contract", contract_rejection_count=1,
                                contract_issues=issues)
        raise ToolContractError(issues) from None

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
        operation = DecisionOperation.model_validate(raw)
        data = operation.internal(role, self.queries.previous)
        if role == "supporting" and not operation.replaces:
            parent = self.queries.pending.get(operation.parent_id)
            if not parent or parent.query.role != "requested":
                raise ToolContractError([issue("parent_id", "supporting_parent_required")])
            for field in ("time", "filters"):
                if field not in data:
                    data[field] = parent.query.model_dump(mode="json")[field]
        self.ground_values(data)
        prepared = self.queries.prepare(data)
        if prepared.query.id in self.queries.previous and not prepared.query.replaces:
            raise ToolContractError([issue("id", "replacement_reference_required")])
        if self.queries.normalizations:
            self.diagnostics["contract_normalization_count"] += 1
            self.diagnostics["contract_normalizations"] = list(dict.fromkeys([
                *self.diagnostics["contract_normalizations"], *self.queries.normalizations]))[:8]
        return prepared

    def accept_plan(self, decision):
        if decision.clarification or not decision.requested_operations and not (self.queries.previous and (decision.visuals or decision.removed_query_ids)):
            self.fail_contract(ToolContractError([issue("requested_operations", "field_required")]))
        previous = self.queries.previous
        removed = set(decision.removed_query_ids)
        if len(removed) != len(decision.removed_query_ids) or not removed <= set(previous):
            self.fail_contract(ToolContractError([issue("removed_query_ids", "unknown_reference")]))
        requested, supporting, replaced = {}, {}, set()
        try:
            for raw in decision.requested_operations:
                before = set(self.queries.pending)
                a = self.prepare(raw, "requested")
                if a.query.id in requested or a.query.replaces in replaced or a.query.id in before:
                    raise ToolContractError([issue("id", "duplicate_field")])
                requested[a.query.id] = a
                if a.query.replaces:
                    replaced.add(a.query.replaces)
            for id, old in previous.items():
                if old.query.role == "requested" and id not in removed | replaced:
                    args = old.query.model_dump(mode="json")
                    args.update(replaces=None, changed_fields=[])
                    requested[id] = self.queries.prepare(args)
            if len(requested) > self.budget.operations or len({a.signature for a in requested.values()} - set(self.queries.cache)) > self.budget.db_queries:
                raise ToolContractError([issue("requested_operations", "operation_budget")])
            if not requested:
                raise ToolContractError([issue("requested_operations", "field_required")])
        except UnresolvedFilter as error:
            clarify_filter(self, error, raw)
        except (ValueError, TypeError, KeyError) as error:
            if getattr(error, "category", None) == "unsupported" and isinstance(raw, dict) and any(m in self.catalog.registry["metrics"] and not self.catalog.registry["metrics"][m].get("time_column") for m in raw.get("metrics", [])):
                self.diagnostics.update(agent_contract_status="valid", semantic_status="unsupported")
                raise AnalysisError("historical_metric_unavailable", "Snapshot history is unavailable") from None
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
                if len(requested) + len(supporting) >= self.budget.operations or counts.get(q.parent_id, 0) >= self.budget.supporting_operations or len(signatures) > self.budget.db_queries:
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
            manifest, hit = build_manifest(self.catalog)
            intelligence = DomainIntelligence(self.catalog)
            knowledge = intelligence.context(prompt, context.get("domain", "auto"), depth, manifest_references(manifest),
                [a.query.subject for a in self.queries.previous.values()])
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
            messages = [{"role": "user", "content": compact(payload)}]
            tools = [decision_tool(refinement=bool(self.queries.previous))]
            from services.agent_provider import gemini_tool_schema, NativeAgentProvider
            wire_tools = [{**t, "parameters": gemini_tool_schema(t)} for t in tools]
            # Include provider wrappers and JSON escaping. Both supported Gemini
            # styles fit before the allowance is consumed; no adapter state is mutated.
            maximum = min(policy["body_chars"], char_limit("DATA_ANALYST_ONE_SHOT_CONTEXT_MAX_CHARS", 24000, 48000))
            # Rich server state gets room by pruning the global metadata index,
            # never by removing approved query scope or reading the question.
            # This is local serialization/cache work, not another provider call.
            for _ in range(20):
                preview = NativeAgentProvider()
                native_body = preview._gemini_body(SYSTEM, messages, tools)
                compat_body = preview._gemini_compat_body(SYSTEM, messages, tools, "configured_model")
                chars = max(len(compact(native_body)), len(compact(compat_body)))
                allowance = len(compact(manifest)) - max(0, chars - maximum) - 200
                if chars <= maximum or allowance < 1000:
                    break
                if len(knowledge["packs"]) > 1:
                    omitted = knowledge["packs"].pop()
                    knowledge["omitted_pack_ids"].append(omitted["id"])
                    messages[0]["content"] = compact(payload)
                    continue
                try:
                    candidate, candidate_hit = build_manifest(self.catalog, max_chars=allowance,
                        subject_priority=[s for p in knowledge["packs"] for s in intelligence.available()[p["id"]]["primary_subjects"]])
                except AnalysisError as error:
                    if error.category != "semantic_manifest_budget_exceeded":
                        raise
                    break
                manifest, hit = candidate, candidate_hit
                payload["manifest"] = provider_manifest(manifest)
                # Reproject packs after local manifest pruning. Undelivered
                # semantic references must never be authorized via stale packs.
                knowledge["packs"] = [intelligence.pack(intelligence.available()[p["id"]], manifest_references(manifest)) for p in knowledge["packs"]]
                messages[0]["content"] = compact(payload)
            preview = NativeAgentProvider()
            chars = max(len(compact(preview._gemini_body(SYSTEM, messages, tools))),
                        len(compact(preview._gemini_compat_body(SYSTEM, messages, tools, "configured_model"))))
            self.diagnostics.update(semantic_manifest_chars=len(compact(payload["manifest"])), manifest_cache_hit=hit,
                semantic_manifest_complete=manifest["complete"], decision_schema_chars=len(compact(wire_tools)),
                total_context_chars=chars, context_char_budget=maximum)
            self.diagnostics.update(domain_context_mode=depth, global_domain_count=len(knowledge["directory"]),
                global_domain_directory_chars=len(compact(knowledge["directory"])),
                detailed_domain_ids=[p["id"] for p in knowledge["packs"]], domain_packs_omitted=knowledge["omitted_pack_ids"],
                detailed_domain_pack_chars={p["id"]: len(compact(p)) for p in knowledge["packs"]},
                domain_context_chars=len(compact(knowledge)), system_chars=len(SYSTEM), session_state_chars=len(compact(state)),
                question_ui_chars=len(compact({"request": prompt, "ui": context})))
            if chars > maximum:
                raise AnalysisError("one_shot_context_budget_exceeded", "Planning context exceeds allowance")
            self.semantic.discovered.update(manifest_references(manifest))
            try:
                response = self.turn.invoke(system=SYSTEM, messages=messages, tools=tools) or {}
            except AnalysisError:
                raise
            except Exception:
                response = {"calls": None, "attempts": []}
            self.diagnostics["agent_rounds"] = 1
            self.diagnostics["provider_calls"] = response.get("attempts", [])
            if len(self.diagnostics["provider_calls"]) > 1:
                raise AnalysisError("provider_call_budget_exceeded", "Provider returned multiple attempts")
            if self.diagnostics["provider_calls"]:
                usage = self.diagnostics["provider_calls"][0].get("tokens", {})
                self.diagnostics.update(input_tokens=usage.get("input"), output_tokens=usage.get("output"),
                    cumulative_planning_input_tokens=usage.get("input"), cumulative_planning_output_tokens=usage.get("output"))
            calls = response.get("calls")
            if not calls:
                category = "provider_unavailable"
                if response.get("offline"):
                    category = "provider_offline"
                elif response.get("configuration_missing"):
                    category = "provider_configuration_missing"
                elif self.diagnostics["provider_calls"]:
                    category = self.diagnostics["provider_calls"][-1].get("error_category", category)
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
                if decision.decision_type != "plan":
                    if decision.requested_operations or decision.supporting_operations or decision.removed_query_ids or decision.visuals or not decision.clarification:
                        raise ToolContractError([issue("clarification", "invalid_analysis_shape")])
                    if decision.decision_type == "unsupported" and decision.clarification.reason not in {"unsupported_metric", "unsupported_dimension", "forecast_unsupported"}:
                        raise ToolContractError([issue("clarification.reason", "invalid_enum")])
                    self.diagnostics.update(agent_contract_status="valid", semantic_status=decision.decision_type)
                    clarify_decision(self, decision.clarification.model_dump(mode="json"))
            except (ValueError, TypeError, KeyError) as error:
                if getattr(error, "clarification", None) or getattr(error, "category", None) == "requested_scope_too_large":
                    raise
                self.fail_contract(error)
            self.queries.ui_context = context or {}
            return self.accept_plan(decision)
        except AnalysisError as error:
            self.diagnostics["terminal_error"] = error.category
            raise
        finally:
            self.diagnostics.update(value_lookup_count=self.semantic.lookup_count,
                                    planning_latency_ms=round((time.perf_counter() - started) * 1000, 2))
