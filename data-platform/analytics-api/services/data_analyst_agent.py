"""One bounded LLM-first tool loop; no language routing or SQL model boundary."""

import json
import logging
import os
import time
from dataclasses import dataclass
from services.analysis_catalog import AnalysisError
from services.analyst_contract import (
    SemanticSearch,
    ConceptReference,
    ValueReference,
    AnalyticalToolInput,
    AgentClarification,
    DashboardPlan,
    AgentState,
)
from services.semantic_tools import SemanticTools
from services.analytical_query_service import AnalyticalQueries
from services.insight_service import analytical_features
from services.analytical_tool_contract import rejection_issues, invalid_signature

logger = logging.getLogger("ai-analyst-tools")


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


@dataclass
class AgentBudget:
    rounds: int = 6
    operations: int = 8
    db_queries: int = 12
    charts: int = 8
    categories: int = 100
    series: int = 16
    tool_result_chars: int = 6000
    preview_rows: int = 4
    context_chars: int = 48000
    tools_per_round: int = 8
    value_lookups: int = 4
    contract_repairs: int = 2
    supporting_operations: int = 3

    @classmethod
    def from_env(cls):
        bounds = {
            "rounds": (1, 8),
            "operations": (1, 8),
            "db_queries": (1, 16),
            "charts": (1, 8),
            "categories": (2, 100),
            "series": (2, 24),
            "tool_result_chars": (1000, 12000),
            "preview_rows": (0, 8),
            "context_chars": (8000, 96000),
            "tools_per_round": (1, 12),
            "value_lookups": (0, 8),
            "contract_repairs": (0, 2),
            "supporting_operations": (0, 7),
        }
        values = {}
        for key, (low, high) in bounds.items():
            raw = os.getenv("AI_AGENT_" + key.upper())
            if raw is not None:
                values[key] = min(high, max(low, int(raw)))
        return cls(**values)


SYSTEM = """You are a Vietnamese database-aware Data Analyst. Decide meaning from the user's request, then discover current semantic catalog concepts with tools. No catalog is preloaded. Never invent concepts, SQL, physical names, formulas, joins, values, causality or forecasts. Catalog metrics own their aggregation and business filters. Use returned canonical values directly; resolve other dimension references before filtering. Ask a narrow clarification when business meaning is undefined. Preserve all requested parts, limits, population, time and metrics. Interpret dates as structured TimeSpec; the server normalizes dates after your decision using reference_date and timezone. Missing time means all_time. UI constraints are explicit user scope: conflicting scopes require clarification. Queries use logical operators only. Requested analyses take priority over supporting work. Supporting queries must reuse their requested parent's population and time. For analytical rankings, comparisons or explanations, plan a bounded investigation: select relevant breakdowns, historical trends and composition from discovered dimensions and related_subjects. Use supporting operations linked to the requested parent; preserve cohort and time. Choose only views that answer a distinct question, within the operation budget. Never infer causes from an aggregate gap. If the user requests only a single number or table, respect that narrow scope. Proposal mode registers validated queries without executing analytical queries. Finish with active operation references and optional DashboardPlan; every visual, KPI, insight and recommendation must reference validated results/evidence. Different units use separate linked views. A Top N subset cannot establish whole-population composition. Recommendations are cautious evidence-based checks, never invented stock/profit/future demand. Repair only named contract issues without rediscovery. For refinement use server references, replaces and changed_fields; unchanged fields inherit server scope. Keep prior operations unless explicitly replaced or removed. No chain-of-thought or reasoning text; use the tools to express decisions."""

SYSTEM += " Search returns grounded concept summaries; do not describe them again if sufficient. Returned canonical enum values may be used directly; otherwise resolve the reference. Batch independent discoveries/resolutions into one round. Leave a round to run_analysis and finish_analysis; finish may follow registered queries in the same batch."

TOOL_MODELS = {
    "search_semantic_catalog": (
        SemanticSearch,
        "Find current business concept IDs by a short search; paginate if needed.",
    ),
    "describe_semantic_concept": (
        ConceptReference,
        "Read one chosen logical concept, unit, grain, compatible dimensions and rules.",
    ),
    "resolve_dimension_value": (
        ValueReference,
        "Resolve a specific value reference for a chosen safe dimension; bounded read-only lookup.",
    ),
    "run_analysis": (
        AnalyticalToolInput,
        "Validate/register logical analytical operators; execute only outside proposal mode. Returns compact result references and features.",
    ),
    "ask_clarification": (
        AgentClarification,
        "Preserve known logical meaning and name missing fields; choices come from the actual compatible catalog.",
    ),
    "finish_analysis": (
        DashboardPlan,
        "Finish with operation references and evidence-backed dashboard proposals. No raw rows or prose claims without evidence.",
    ),
}


class DataAnalystAgent:
    def __init__(
        self,
        catalog,
        provider,
        executor,
        lookup,
        reference,
        diagnostics,
        budget=None,
        proposal=False,
        previous=None,
    ):
        from services.agent_provider import NativeAgentProvider

        if isinstance(provider, NativeAgentProvider):
            provider.reset()
        self.catalog, self.provider, self.reference, self.diagnostics = (
            catalog,
            provider,
            reference,
            diagnostics,
        )
        self.budget = budget or AgentBudget.from_env()
        self.semantic = SemanticTools(catalog, lookup)
        self.queries = AnalyticalQueries(
            catalog, self.semantic, reference, executor, diagnostics, proposal, previous
        )
        self.queries.enforce_discovery = True
        self.cache = {}
        self.invalid_calls = set()
        self.repair_pending = False
        self.plan = None
        self.proposal = proposal
        self.omitted_support = set()
        diagnostics.update(
            agent_rounds=0,
            semantic_tool_calls=0,
            semantic_cache_hits=0,
            analytical_tool_calls=0,
            analytical_cache_hits=0,
            db_query_count=0,
            value_lookup_count=0,
            cost_rounds=[],
            provider_calls=[],
            provider_status="not_started",
            provider_error_category=None,
            tool_trace=[],
            limitations=[],
            understanding_source="llm_first_native_tools",
            embedding_call_count=0,
            contract_repair_count=0,
            contract_rejection_count=0,
            contract_normalization_count=0,
            contract_normalizations=[],
            agent_contract_status="valid",
            agent_contract_error=None,
            semantic_status="not_started",
            execution_status="not_started",
            result_status="not_started",
            current_round_error=None,
            last_contract_rejection=None,
            terminal_error=None,
            provider_failure=None,
            budget_exhaustion=None,
            semantic_round_count=0,
            analytical_round_count=0,
            duplicate_invalid_call_count=0,
            rounds_to_first_valid_query=None,
            rounds_to_finish=None,
        )

    def tools(self, final_only=False):
        from services.agent_provider import expanded_schema, gemini_tool_schema

        names = [
            "search_semantic_catalog",
            "describe_semantic_concept",
            "ask_clarification",
        ]
        if self.semantic.discovered or self.queries.previous:
            names += ["resolve_dimension_value", "run_analysis", "finish_analysis"]
        if final_only:
            names = ["finish_analysis"]
        return [
            {**tool, "parameters": gemini_tool_schema(tool)}
            for tool in [
            {
                "name": n,
                "description": TOOL_MODELS[n][1],
                "parameters": expanded_schema(TOOL_MODELS[n][0].model_json_schema()),
            }
            for n in names
            ]
        ]

    def record_tool(self, name, result, round_index, cache_hit=False):
        name = name if name in TOOL_MODELS else "unavailable_tool"
        status = result.get("status", "ok")
        if not isinstance(status, str) or status not in {
            "ok",
            "resolved",
            "unknown",
            "ambiguous",
            "validated_proposal",
            "validated_result",
            "finished",
            "rejected",
            "rejected_batch",
            "projection_budget",
            "omitted_supporting",
            "needs_clarification",
        }:
            status = "other"
        event = {
            "round": round_index + 1,
            "tool": name,
            "status": status,
            "cache_hit": cache_hit,
            "registered_queries": len(self.queries.artifacts),
        }
        if result.get("issues"):
            event["issues"] = result["issues"][:8]
            event["repair_attempt"] = self.diagnostics["contract_repair_count"]
        self.diagnostics["tool_trace"].append(event)
        logger.info(
            "Analyst tool round=%s name=%s status=%s cache_hit=%s registered_queries=%s",
            event["round"],
            name,
            status,
            cache_hit,
            event["registered_queries"],
        )

    def projection(self, a):
        if a.result is None:
            return {
                "query_id": a.query.id,
                "status": "validated_proposal",
                "period": a.grounded.period,
                "metrics": [
                    {
                        "id": m,
                        "label": a.grounded.metrics[m]["business_name"],
                        "unit": a.grounded.metrics[m]["unit"],
                    }
                    for m in a.plan.metrics
                ],
                "group_by": a.query.group_by,
                "role": a.query.role,
            }
        features = analytical_features({a.query.id: a})
        result = {
            "query_id": a.query.id,
            "status": "validated_result",
            "rows_count": len(a.result["rows"]),
            "columns": a.result["columns"],
            "period": a.grounded.period,
            "role": a.query.role,
            "reused": a.reused,
            "as_of": a.observed_at,
            "preview": a.result["rows"][: self.budget.preview_rows],
            "features": features[:16],
        }
        while (
            len(compact(result)) > self.budget.tool_result_chars and result["preview"]
        ):
            result["preview"].pop()
        while (
            len(compact(result)) > self.budget.tool_result_chars and result["features"]
        ):
            result["features"].pop()
        result["projection_complete"] = len(result["features"]) == len(features)
        return result

    def clarify(self, arguments):
        from services.analysis_understanding import clarify

        arg = AgentClarification.model_validate(arguments)
        known = arg.known_query or {}
        # Only actual catalog labels cross the public boundary; partial meaning survives.
        subject = arg.subject or known.get("subject")
        if subject and subject not in self.catalog.registry["subjects"]:
            raise AnalysisError(
                "analysis_spec_invalid", "Unknown clarification subject"
            )
        data = {
            "subject": subject,
            "analysis_kind": known.get("operation", ""),
            "metrics": known.get("metrics", []),
            "dimensions": known.get("group_by", []),
            "filters": known.get("filters", []),
            "ranking": known.get("ranking"),
        }
        from services.analysis_contract import Filter, Ranking
        from services.value_grounding_service import dimension_values

        missing = list(arg.missing_fields)
        for field, kind in (("metrics", "metrics"), ("dimensions", "dimensions")):
            raw = data[field]
            if not isinstance(raw, list):
                data[field] = []
                missing.append(field)
            else:
                data[field] = [
                    v
                    for v in raw
                    if isinstance(v, str) and v in self.catalog.registry[kind]
                ]
        if data["ranking"]:
            try:
                data["ranking"] = Ranking.model_validate(data["ranking"]).model_dump(
                    mode="json"
                )
            except ValueError:
                data["ranking"] = None
                missing.append("ranking")
        safe_filters = []
        raw_filters = data["filters"] if isinstance(data["filters"], list) else []
        for raw in raw_filters:
            try:
                f = Filter.model_validate(raw)
            except ValueError:
                missing.append("filters")
                continue
            definition = self.catalog.registry["dimensions"].get(f.dimension)
            if not definition:
                continue
            self.catalog.check_column(definition["table"], definition["column"])
            values = f.value if isinstance(f.value, list) else [f.value]
            allowed = dimension_values(self.catalog, f.dimension)
            if all(
                v in allowed
                or v in self.semantic.resolved.get(f.dimension, set())
                or definition.get("value_grounding", {}).get("mode") == "literal"
                and type(v) in (int, float, bool)
                for v in values
            ):
                safe_filters.append(f.model_dump(mode="json"))
        data["filters"] = safe_filters
        if known.get("time"):
            from services.time_resolution_service import resolve_time

            try:
                scope, assumptions, _ = resolve_time(
                    known["time"], self.reference, self.catalog.registry["timezone"]
                )
                data.update(
                    time_range=scope.model_dump(mode="json"), assumptions=assumptions
                )
            except (ValueError, AnalysisError):
                missing.append("time")
        # The metric ambiguity helper rebuilds choices from this actual subject.
        choices = None
        if arg.reason == "metric_ambiguous" and subject:
            choices = []
            needed = set(data["dimensions"]) | {f["dimension"] for f in data["filters"]}
            for metric in self.catalog.registry["subjects"][subject]["metrics"]:
                try:
                    self.semantic.describe("metric", metric)
                    if not needed <= set(self.catalog.compatible_dimensions(metric)):
                        continue
                except AnalysisError:
                    continue
                meta = self.catalog.registry["metrics"][metric]
                choices.append(
                    {
                        "id": metric,
                        "label": meta["business_name"],
                        "unit": meta["unit"],
                        "followup": "Theo " + meta["business_name"],
                    }
                )
        clarify(
            self.catalog,
            arg.reason,
            data,
            fields=list(dict.fromkeys(missing))[:12],
            choices=choices,
        )

    def finish(self, arguments):
        plan = DashboardPlan.model_validate(arguments)
        plan.active_query_ids = [
            id for id in plan.active_query_ids if id not in self.omitted_support
        ]
        if not plan.active_query_ids:
            raise AnalysisError(
                "dashboard_contract", "No requested operation reference"
            )
        for id in plan.active_query_ids:
            if not self.queries.restore(id):
                raise AnalysisError("dashboard_contract", "Unknown operation reference")
        required = {
            id
            for id, a in self.queries.artifacts.items()
            if a.query.role == "requested"
        }
        previous = set(self.queries.previous)
        replaced = {
            a.query.replaces
            for a in self.queries.artifacts.values()
            if a.query.replaces
        }
        if not set(plan.removed_query_ids) <= previous or set(
            plan.active_query_ids
        ) & set(plan.removed_query_ids):
            raise AnalysisError("patch", "Invalid removed operation reference")
        must_keep = required | (previous - replaced - set(plan.removed_query_ids))
        if not must_keep <= set(plan.active_query_ids):
            raise AnalysisError(
                "dashboard_contract",
                "Finish omitted a requested or unchanged operation",
            )
        self.plan = plan
        self.contract_valid()
        return {"status": "finished"}

    @staticmethod
    def rejection_result(error):
        return {"status": "rejected", "error_category": "invalid_analysis_contract", "issues": rejection_issues(error)}

    def reject(self, call, error):
        category = getattr(error, "category", "")
        if category == "agent_budget":
            self.diagnostics["current_round_error"] = category
            return error, True
        issues = rejection_issues(error)
        self.diagnostics["contract_rejection_count"] += 1
        self.diagnostics.update(agent_contract_status="invalid", agent_contract_error="invalid_analysis_contract", last_contract_rejection={"issues": issues})
        signature = invalid_signature(call["name"], call["arguments"])
        duplicate = signature in self.invalid_calls
        self.diagnostics["duplicate_invalid_call_count"] += int(duplicate)
        self.invalid_calls.add(signature)
        exhausted = self.diagnostics["contract_repair_count"] >= self.budget.contract_repairs
        category = "duplicate_invalid_tool_call" if duplicate else "invalid_analysis_contract"
        self.diagnostics.update(current_round_error=category, agent_contract_error=category)
        self.repair_pending = not (duplicate or exhausted)
        return AnalysisError(category, "Analytical tool contract rejected"), duplicate or exhausted

    def contract_valid(self):
        repaired = self.diagnostics["contract_rejection_count"] or self.diagnostics["contract_normalization_count"]
        self.diagnostics.update(agent_contract_status="repaired" if repaired else "valid", agent_contract_error=None)

    def run(self, prompt, context=None, final_only=False):
        try:
            return self._run(prompt, context, final_only)
        except AnalysisError as error:
            self.diagnostics["terminal_error"] = error.category
            raise
        finally:
            self.diagnostics["value_lookup_count"] = self.semantic.lookup_count
            for role in ("requested", "supporting"):
                self.diagnostics["registered_" + role + "_operations"] = sum(
                    a.query.role == role for a in self.queries.artifacts.values())

    def _run(self, prompt, context=None, final_only=False):
        self.state = AgentState(goal=prompt[:8000])
        self.queries.ui_context = context or {}
        messages = [
            {
                "role": "user",
                "content": compact(
                    {
                        "request": prompt,
                        "mode": (
                            "proposal"
                            if self.proposal
                            else "dashboard" if final_only else "analysis"
                        ),
                        "reference_date": self.reference.isoformat(),
                        "timezone": self.catalog.registry["timezone"],
                        "context": context or {},
                        "budget": {
                            "rounds": 1 if final_only else self.budget.rounds,
                            "tools_per_round": self.budget.tools_per_round,
                            "operations": self.budget.operations,
                            "charts": self.budget.charts,
                            "contract_repairs": self.budget.contract_repairs,
                            "supporting_per_parent": self.budget.supporting_operations,
                        },
                    }
                ),
            }
        ]
        if self.queries.previous:
            messages[0]["content"] = compact(
                {
                    "request": prompt,
                    "reference_date": self.reference.isoformat(),
                    "timezone": self.catalog.registry["timezone"],
                    "server_operations": [
                        {
                            "query": a.query.model_dump(mode="json"),
                            "result_ref": id,
                            "features": self.projection(a).get("features", [])[:4],
                        }
                        for id, a in self.queries.previous.items()
                    ],
                    "known_concepts": [f"{kind}:{id}" for kind, id in sorted(self.semantic.discovered)],
                    "context": context or {},
                    "mode": "dashboard" if final_only else "refinement",
                }
            )
        rounds = 1 if final_only else self.budget.rounds
        terminal_error = None
        current_round_error = None
        for round_index in range(rounds):
            current_round_error = None
            self.diagnostics["current_round_error"] = None
            tools = self.tools(final_only)
            allowed = {t["name"] for t in tools}
            chars = len(compact(messages))
            if chars > self.budget.context_chars:
                terminal_error = AnalysisError("agent_budget", "Agent context budget reached")
                break
            if self.repair_pending:
                self.diagnostics["contract_repair_count"] += 1
                self.repair_pending = False
            cost = {
                "round": round_index + 1,
                "system_chars": len(SYSTEM),
                "tool_schema_chars": len(compact(tools)),
                "history_chars": chars,
                "semantic_context_chars": sum(
                    len(compact(m["result"])) for m in messages
                    if m["role"] == "tool" and m["name"] not in ("run_analysis", "finish_analysis")
                ),
                "tool_result_chars": 0,
                "result_projection_chars": 0,
            }
            started = time.perf_counter()
            try:
                response = self.provider(system=SYSTEM, messages=messages, tools=tools) or {}
            except Exception:
                response = {"calls": None, "attempts": []}
            self.diagnostics["agent_rounds"] += 1
            self.diagnostics["provider_calls"] += [
                {**a, "round": round_index + 1} for a in response.get("attempts", [])
            ]
            cost["latency_ms"] = round((time.perf_counter() - started) * 1000, 2)
            self.diagnostics["cost_rounds"].append(cost)
            calls = response.get("calls")
            if not calls:
                categories = [a.get("error_category") for a in response.get("attempts", [])]
                category = "provider_unavailable"
                if "provider_schema" in categories:
                    category = "provider_schema_invalid"
                elif any(v in categories for v in ("invalid_json", "invalid_tool_response")):
                    category = "provider_invalid_json"
                elif categories and categories[-1] in {
                    "provider_bad_request", "provider_auth", "provider_access_denied",
                    "provider_model_not_found", "provider_rate_limited", "provider_daily_quota",
                    "provider_timeout", "provider_connection",
                }:
                    category = categories[-1]
                if response.get("offline"):
                    category = "provider_offline"
                elif response.get("configuration_missing"):
                    category = "provider_configuration_missing"
                self.diagnostics.update(provider_status="failed", provider_failure=category, provider_error_category=category)
                terminal_error = AnalysisError(category, "Native provider did not return valid tool calls")
                break
            if (
                not isinstance(calls, list) or len(calls) > self.budget.tools_per_round
                or any(
                    not isinstance(c, dict) or set(c) != {"id", "name", "arguments"}
                    or not isinstance(c["arguments"], dict) or not isinstance(c["id"], str)
                    or not isinstance(c["name"], str) for c in calls
                )
                or len({c["id"] for c in calls}) != len(calls)
            ):
                terminal_error = AnalysisError("provider_invalid_tools", "Invalid or oversized native tool batch")
                self.diagnostics.update(provider_status="failed", provider_failure=terminal_error.category, provider_error_category=terminal_error.category)
                break
            self.diagnostics.update(provider_status="success", provider_error_category=None, provider_failure=None)
            self.diagnostics["semantic_round_count"] += int(any(
                c["name"] in ("search_semantic_catalog", "describe_semantic_concept", "resolve_dimension_value") for c in calls))
            self.diagnostics["analytical_round_count"] += int(any(c["name"] == "run_analysis" for c in calls))
            messages.append({"role": "assistant", "calls": calls})

            def deliver(c, result, cache_hit=False):
                result = {**result, "agent_progress": {
                    "rounds_remaining": rounds - round_index - 1,
                    "registered_queries": len(self.queries.artifacts),
                }}
                messages.append({"role": "tool", "id": c["id"], "name": c["name"], "result": result})
                self.record_tool(c["name"], result, round_index, cache_hit)
                cost["tool_result_chars"] += len(compact(result))

            # Semantic/value tools run before analytical batch preparation. This
            # permits resolve + run + finish in one round without executing any
            # analytical SQL before every analytical contract has been checked.
            preflight_failed = False
            for c in calls:
                if c["name"] in ("run_analysis", "finish_analysis", "ask_clarification"):
                    continue
                try:
                    if c["name"] not in allowed:
                        raise AnalysisError("tool", "Tool unavailable in this state")
                    self.diagnostics["semantic_tool_calls"] += 1
                    key = compact([c["name"], c["arguments"]])
                    cache_hit = key in self.cache
                    if cache_hit:
                        self.diagnostics["semantic_cache_hits"] += 1
                        result = self.cache[key]
                    else:
                        if c["name"] == "resolve_dimension_value":
                            dimension = ValueReference.model_validate(c["arguments"]).dimension
                            if ("dimension", dimension) not in self.semantic.discovered:
                                from services.analytical_tool_contract import ToolContractError, issue
                                raise ToolContractError([issue("dimension", "concept_not_discovered")])
                        if c["name"] == "resolve_dimension_value" and self.semantic.lookup_count >= self.budget.value_lookups:
                            raise AnalysisError("agent_budget", "Value lookup budget reached")
                        before = set(self.semantic.discovered)
                        result = self.semantic.invoke(c["name"], c["arguments"])
                        if len(compact(result)) > self.budget.tool_result_chars - 120:
                            # Do not authorize concepts from an undelivered page.
                            self.semantic.discovered = before
                            result = {"status": "projection_budget", "hint": "Request fewer results or a narrower concept"}
                        self.cache[key] = result
                    deliver(c, result, cache_hit)
                except (ValueError, TypeError, KeyError) as exc:
                    current_round_error, stop = self.reject(c, exc)
                    deliver(c, self.rejection_result(exc))
                    preflight_failed = True
                    if stop or getattr(exc, "category", "") == "agent_budget":
                        terminal_error = current_round_error
            prepared = {}
            failed_call = None
            try:
                if preflight_failed:
                    raise current_round_error
                self.queries.pending = {}
                analytical_calls = [c for c in calls if c["name"] == "run_analysis"]
                self.diagnostics["analytical_tool_calls"] += len(analytical_calls)
                for c in sorted(analytical_calls, key=lambda c: c["arguments"].get("role") == "supporting"):
                    failed_call = c
                    if c["name"] not in allowed:
                        raise AnalysisError("tool", "Tool unavailable in this state")
                    prepared[c["id"]] = self.queries.prepare(c["arguments"])
                    rules = self.queries.normalizations
                    if rules:
                        self.diagnostics["contract_normalization_count"] += 1
                        self.diagnostics["contract_normalizations"] = list(dict.fromkeys([*self.diagnostics["contract_normalizations"], *rules]))[:8]
                # IDs must be unique across a batch unless the canonical meaning
                # is identical. pending must never silently overwrite a parent.
                by_id = {}
                for a in prepared.values():
                    if a.query.id in by_id and by_id[a.query.id].query != a.query:
                        raise AnalysisError("query", "Conflicting operation IDs")
                    by_id[a.query.id] = a
                accepted_ids = (set(self.queries.artifacts) | set(self.queries.previous)) - {
                    a.query.replaces for a in prepared.values() if a.query.replaces
                }
                accepted_signatures = set(self.queries.cache)
                support_counts = {}
                for a in self.queries.artifacts.values():
                    if a.query.role == "supporting":
                        support_counts[a.query.parent_id] = support_counts.get(a.query.parent_id, 0) + 1
                new_queries = 0
                for c in sorted(analytical_calls, key=lambda c: prepared[c["id"]].query.role == "supporting"):
                    failed_call = c
                    a = prepared[c["id"]]
                    extra = a.signature not in accepted_signatures
                    support = a.query.role == "supporting"
                    over = (
                        len(accepted_ids | {a.query.id}) > self.budget.operations
                        or (not self.proposal and self.diagnostics["db_query_count"] + new_queries + extra > self.budget.db_queries)
                        or support and a.query.id not in accepted_ids and support_counts.get(a.query.parent_id, 0) >= self.budget.supporting_operations
                    )
                    if over and not support:
                        raise AnalysisError("agent_budget", "Requested operations exceed the configured budget")
                    if over:
                        self.omitted_support.add(a.query.id)
                        self.diagnostics["limitations"].append({"reason": "supporting_budget", "message": "Một phần phân tích hỗ trợ được bỏ qua do giới hạn truy vấn."})
                    else:
                        self.omitted_support.discard(a.query.id)
                        if support and a.query.id not in accepted_ids:
                            support_counts[a.query.parent_id] = support_counts.get(a.query.parent_id, 0) + 1
                        accepted_ids.add(a.query.id)
                        accepted_signatures.add(a.signature)
                        new_queries += extra
            except (ValueError, TypeError, KeyError) as exc:
                if not preflight_failed:
                    current_round_error, stop = self.reject(failed_call or calls[0], exc)
                    if stop or getattr(exc, "category", "") == "agent_budget":
                        terminal_error = current_round_error
                for c in calls:
                    if c["name"] in ("run_analysis", "finish_analysis", "ask_clarification"):
                        result = self.rejection_result(exc) if c is failed_call else {
                            "status": "rejected_batch", "error_category": "invalid_analysis_contract",
                            "issues": [{"path": "batch", "code": "batch_aborted"}],
                        }
                        deliver(c, result)
                if terminal_error:
                    break
                continue
            for c in sorted(calls, key=lambda c: (c["name"] == "finish_analysis", c["arguments"].get("role") == "supporting")):
                name = c["name"]
                if name not in ("run_analysis", "finish_analysis", "ask_clarification"):
                    continue
                try:
                    if name not in allowed:
                        raise AnalysisError("tool", "Tool unavailable in this state")
                    if name == "run_analysis":
                        a = prepared[c["id"]]
                        if a.query.id in self.omitted_support:
                            result = {"status": "omitted_supporting", "reason": "analytical_budget"}
                        else:
                            a = self.queries.run(a)
                            result = self.projection(a)
                            self.contract_valid()
                            if self.diagnostics["rounds_to_first_valid_query"] is None:
                                self.diagnostics["rounds_to_first_valid_query"] = round_index + 1
                            self.diagnostics["semantic_status"] = "grounded"
                            if not self.proposal:
                                self.diagnostics.update(execution_status="passed", result_status="passed")
                        cost["result_projection_chars"] += len(compact(result))
                    elif name == "ask_clarification":
                        self.clarify(c["arguments"])
                    else:
                        result = self.finish(c["arguments"])
                        self.diagnostics["rounds_to_finish"] = round_index + 1
                    deliver(c, result, name == "run_analysis" and a.reused)
                except (ValueError, TypeError, KeyError) as exc:
                    if getattr(exc, "clarification", None):
                        self.diagnostics["semantic_status"] = "unsupported" if exc.category.startswith("unsupported") else "clarification"
                        self.record_tool(name, {"status": "needs_clarification"}, round_index)
                        raise
                    category = getattr(exc, "category", "")
                    if category in ("execution", "result_contract"):
                        terminal_error = exc
                        self.diagnostics.update(
                            execution_status="failed" if category == "execution" else "passed",
                            result_status="failed" if category == "result_contract" else "not_started",
                        )
                        deliver(c, {"status": "rejected", "error_category": category})
                        break
                    current_round_error, stop = self.reject(c, exc)
                    deliver(c, self.rejection_result(exc))
                    if stop or category == "agent_budget":
                        terminal_error = current_round_error
                        break
            if self.plan or terminal_error:
                break
        self.diagnostics["value_lookup_count"] = self.semantic.lookup_count
        if not self.plan:
            terminal_error = terminal_error or current_round_error or AnalysisError("agent_budget", "No finished plan before budget exhausted")
            self.diagnostics["terminal_error"] = terminal_error.category
            if terminal_error.category == "agent_budget":
                self.diagnostics["budget_exhaustion"] = "context_or_rounds_or_operations"
            if self.proposal:
                raise terminal_error
            replaced_ids = {
                a.query.replaces for a in self.queries.artifacts.values()
                if a.query.replaces and a.result is not None
            }
            artifacts = {id: a for id, a in self.queries.previous.items() if id not in replaced_ids}
            artifacts.update({id: a for id, a in self.queries.artifacts.items() if a.result is not None})
            if artifacts:
                self.diagnostics["limitations"].append({
                    "reason": terminal_error.category,
                    "message": "Báo cáo dùng các kết quả đã kiểm chứng; agent chưa hoàn tất toàn bộ kế hoạch.",
                })
                self.plan = DashboardPlan(active_query_ids=list(artifacts))
                for id in artifacts:
                    self.queries.restore(id)
            else:
                raise terminal_error
        active = {id: self.queries.artifacts[id] for id in self.plan.active_query_ids}
        if not self.proposal:
            active = {id: a for id, a in active.items() if a.result is not None}
            if not active:
                raise AnalysisError("execution", "No validated results")
        self.state.resolved_concepts = [
            f"{kind}:{id}" for kind, id in sorted(self.semantic.discovered)
        ]
        self.state.operation_refs = list(active)
        self.state.result_refs = [
            id for id, a in active.items() if a.result is not None
        ]
        self.state.evidence_refs = (
            [e["id"] for e in analytical_features(active)] if not self.proposal else []
        )
        self.state.dashboard = self.plan
        return active, self.plan
