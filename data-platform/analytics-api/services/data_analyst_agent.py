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
    AnalyticalQuery,
    AgentClarification,
    DashboardPlan,
    AgentState,
)
from services.semantic_tools import SemanticTools
from services.analytical_query_service import AnalyticalQueries
from services.insight_service import analytical_features

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
        }
        values = {}
        for key, (low, high) in bounds.items():
            raw = os.getenv("AI_AGENT_" + key.upper())
            if raw is not None:
                values[key] = min(high, max(low, int(raw)))
        return cls(**values)


SYSTEM = """You are a Vietnamese database-aware Data Analyst. Decide meaning from the user's request, then discover current semantic catalog concepts with tools. No catalog is preloaded. Never invent concepts, SQL, physical names, formulas, joins, values, causality or forecasts. Catalog metrics own their aggregation and business filters. Use returned canonical values directly; resolve other dimension references before filtering. Ask a narrow clarification when business meaning is undefined. Preserve all requested parts, limits, population, time and metrics. Interpret dates as structured TimeSpec; the server normalizes dates after your decision using reference_date and timezone. Missing time means all_time. UI constraints are explicit user scope: conflicting scopes require clarification. Queries use logical operators only. Requested analyses take priority over supporting work. Supporting queries must reuse their requested parent's population and time. Stop when the request is satisfied; no speculative extra queries. Proposal mode registers validated queries without executing analytical queries. Finish with active operation references and optional DashboardPlan; every visual, KPI, insight and recommendation must reference validated results/evidence. Different units use separate linked views. A Top N subset cannot establish whole-population composition. Recommendations are cautious evidence-based checks, never invented stock/profit/future demand. For refinement use server references, replaces and changed_fields; unchanged fields inherit server scope. Keep prior operations unless explicitly replaced or removed. No chain-of-thought or reasoning text; use the tools to express decisions."""

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
        AnalyticalQuery,
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
        self.cache = {}
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
            tool_trace=[],
            limitations=[],
            understanding_source="llm_first_native_tools",
            embedding_call_count=0,
        )

    def tools(self, final_only=False):
        from services.agent_provider import expanded_schema

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
            {
                "name": n,
                "description": TOOL_MODELS[n][1],
                "parameters": expanded_schema(TOOL_MODELS[n][0].model_json_schema()),
            }
            for n in names
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
        return {"status": "finished"}

    def run(self, prompt, context=None, final_only=False):
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
                    "context": context or {},
                    "mode": "dashboard" if final_only else "refinement",
                }
            )
        rounds = 1 if final_only else self.budget.rounds
        last_error = None
        for round_index in range(rounds):
            tools = self.tools(final_only)
            allowed = {t["name"] for t in tools}
            chars = len(compact(messages))
            if chars > self.budget.context_chars:
                last_error = AnalysisError(
                    "agent_budget", "Agent context budget reached"
                )
                break
            cost = {
                "round": round_index + 1,
                "system_chars": len(SYSTEM),
                "tool_schema_chars": len(compact(tools)),
                "history_chars": chars,
                "semantic_context_chars": sum(
                    len(compact(m["result"]))
                    for m in messages
                    if m["role"] == "tool"
                    and m["name"] in TOOL_MODELS
                    and m["name"] not in ("run_analysis", "finish_analysis")
                ),
                "tool_result_chars": 0,
                "result_projection_chars": 0,
            }
            started = time.perf_counter()
            try:
                response = (
                    self.provider(system=SYSTEM, messages=messages, tools=tools) or {}
                )
            except Exception:
                response = {"calls": None, "attempts": []}
            self.diagnostics["agent_rounds"] += 1
            self.diagnostics["provider_calls"] += [
                {**a, "round": round_index + 1} for a in response.get("attempts", [])
            ]
            self.diagnostics["provider_status"] = (
                "success" if response.get("calls") else "failed"
            )
            cost["latency_ms"] = round((time.perf_counter() - started) * 1000, 2)
            self.diagnostics["cost_rounds"].append(cost)
            calls = response.get("calls")
            if not calls:
                categories = [
                    a.get("error_category") for a in response.get("attempts", [])
                ]
                category = (
                    "provider_schema_invalid"
                    if "provider_schema" in categories
                    else (
                        "provider_invalid_json"
                        if any(
                            v in categories
                            for v in ("invalid_json", "invalid_tool_response")
                        )
                        else "provider_unavailable"
                    )
                )
                if response.get("offline"):
                    category = "provider_offline"
                elif response.get("configuration_missing"):
                    category = "provider_configuration_missing"
                elif categories and categories[-1] in {
                    "provider_bad_request",
                    "provider_auth",
                    "provider_access_denied",
                    "provider_model_not_found",
                    "provider_rate_limited",
                    "provider_daily_quota",
                    "provider_timeout",
                    "provider_connection",
                }:
                    category = categories[-1]
                last_error = last_error or AnalysisError(
                    category, "Native provider did not return valid tool calls"
                )
                break
            if (
                not isinstance(calls, list)
                or len(calls) > self.budget.tools_per_round
                or any(
                    not isinstance(c, dict)
                    or set(c) != {"id", "name", "arguments"}
                    or not isinstance(c["arguments"], dict)
                    or not isinstance(c["id"], str)
                    or not isinstance(c["name"], str)
                    for c in calls
                )
                or len({c["id"] for c in calls}) != len(calls)
            ):
                last_error = AnalysisError(
                    "provider_invalid_tools", "Invalid or oversized native tool batch"
                )
                break
            # Validate every query in a batch before any query executes.
            prepared = {}
            try:
                self.queries.pending = {}
                for c in sorted(
                    calls, key=lambda c: c["arguments"].get("role") == "supporting"
                ):
                    if c["name"] not in allowed:
                        raise AnalysisError("tool", "Tool unavailable in this state")
                    if c["name"] == "run_analysis":
                        prepared[c["id"]] = self.queries.prepare(c["arguments"])
                requested = sorted(
                    prepared.values(), key=lambda a: a.query.role == "supporting"
                )
                replaced_ids = {a.query.replaces for a in requested if a.query.replaces}
                accepted_ids = (
                    set(self.queries.artifacts) | set(self.queries.previous)
                ) - replaced_ids
                accepted_signatures = set(self.queries.cache)
                new_queries = 0
                for artifact in requested:
                    extra = artifact.signature not in accepted_signatures
                    over = (
                        len(accepted_ids | {artifact.query.id}) > self.budget.operations
                        or self.diagnostics["db_query_count"] + new_queries + extra
                        > self.budget.db_queries
                    )
                    if over and artifact.query.role == "requested":
                        raise AnalysisError(
                            "agent_budget",
                            "Requested analytical operations exceed the configured budget",
                        )
                    if over:
                        self.omitted_support.add(artifact.query.id)
                        self.diagnostics["limitations"].append(
                            {
                                "reason": "supporting_budget",
                                "message": "Một phần phân tích hỗ trợ được bỏ qua do giới hạn truy vấn.",
                            }
                        )
                    else:
                        accepted_ids.add(artifact.query.id)
                        accepted_signatures.add(artifact.signature)
                        new_queries += extra
            except (ValueError, AnalysisError) as exc:
                last_error = (
                    exc
                    if isinstance(exc, AnalysisError)
                    else AnalysisError(
                        "analysis_spec_invalid", "Invalid tool arguments"
                    )
                )
                messages.append({"role": "assistant", "calls": calls})
                for c in calls:
                    result = {
                        "status": "rejected_batch",
                        "error_category": getattr(
                            last_error, "category", "analysis_spec_invalid"
                        ),
                    }
                    messages.append(
                        {
                            "role": "tool",
                            "id": c["id"],
                            "name": c["name"],
                            "result": result,
                        }
                    )
                    self.record_tool(c["name"], result, round_index)
                    cost["tool_result_chars"] += len(compact(result))
                continue
            messages.append({"role": "assistant", "calls": calls})
            for c in sorted(
                calls,
                key=lambda c: (
                    c["name"] == "finish_analysis",
                    c["arguments"].get("role") == "supporting",
                ),
            ):
                try:
                    cache_hit = False
                    name = c["name"]
                    args = c["arguments"]
                    if name == "run_analysis":
                        self.diagnostics["analytical_tool_calls"] += 1
                        if prepared[c["id"]].query.id in self.omitted_support:
                            result = {
                                "status": "omitted_supporting",
                                "reason": "analytical_budget",
                            }
                        else:
                            a = self.queries.run(prepared[c["id"]])
                            result = self.projection(a)
                        cost["result_projection_chars"] += len(compact(result))
                    elif name == "ask_clarification":
                        self.clarify(args)
                    elif name == "finish_analysis":
                        result = self.finish(args)
                    else:
                        self.diagnostics["semantic_tool_calls"] += 1
                        cachekey = compact([name, args])
                        if cachekey in self.cache:
                            cache_hit = True
                            self.diagnostics["semantic_cache_hits"] += 1
                            result = self.cache[cachekey]
                        else:
                            if (
                                name == "resolve_dimension_value"
                                and self.semantic.lookup_count
                                >= self.budget.value_lookups
                            ):
                                raise AnalysisError(
                                    "agent_budget", "Value lookup budget reached"
                                )
                            result = self.semantic.invoke(name, args)
                            self.cache[cachekey] = result
                    result = {
                        **result,
                        "agent_progress": {
                            "rounds_remaining": rounds - round_index - 1,
                            "registered_queries": len(self.queries.artifacts),
                        },
                    }
                    if len(compact(result)) > self.budget.tool_result_chars:
                        result = {
                            "status": "projection_budget",
                            "reference": args.get("id"),
                            "hint": "Request a narrower concept or fewer results",
                        }
                    messages.append(
                        {"role": "tool", "id": c["id"], "name": name, "result": result}
                    )
                    self.record_tool(name, result, round_index, cache_hit)
                    cost["tool_result_chars"] += len(compact(result))
                    if self.plan:
                        break
                except AnalysisError as exc:
                    self.record_tool(
                        c["name"],
                        {
                            "status": (
                                "needs_clarification"
                                if exc.clarification
                                else "rejected"
                            )
                        },
                        round_index,
                    )
                    if exc.clarification:
                        raise
                    last_error = exc
                    if exc.category in ("execution", "result_contract"):
                        if not any(
                            a.result is not None
                            for a in self.queries.artifacts.values()
                        ):
                            raise
                        break
                    result = {"status": "rejected", "error_category": exc.category}
                    messages.append(
                        {
                            "role": "tool",
                            "id": c["id"],
                            "name": c["name"],
                            "result": result,
                        }
                    )
                    cost["tool_result_chars"] += len(compact(result))
                except (ValueError, TypeError, KeyError):
                    last_error = AnalysisError(
                        "analysis_spec_invalid", "Invalid tool arguments"
                    )
                    self.record_tool(c["name"], {"status": "rejected"}, round_index)
                    messages.append(
                        {
                            "role": "tool",
                            "id": c["id"],
                            "name": c["name"],
                            "result": {
                                "status": "rejected",
                                "error_category": "analysis_spec_invalid",
                            },
                        }
                    )
            if self.plan:
                break
            if last_error and last_error.category in ("execution", "result_contract"):
                break
        self.diagnostics["value_lookup_count"] = self.semantic.lookup_count
        if not self.plan:
            if self.proposal:
                raise last_error or AnalysisError(
                    "agent_budget", "Proposal agent did not finish a valid plan"
                )
            replaced_ids = {
                a.query.replaces
                for a in self.queries.artifacts.values()
                if a.query.replaces and a.result is not None
            }
            artifacts = {
                id: a
                for id, a in self.queries.previous.items()
                if id not in replaced_ids
            }
            artifacts.update(self.queries.artifacts)
            if artifacts and (
                self.proposal or any(a.result is not None for a in artifacts.values())
            ):
                self.diagnostics["limitations"].append(
                    {
                        "reason": getattr(last_error, "category", "agent_budget"),
                        "message": "Báo cáo dùng các kết quả đã kiểm chứng; agent chưa hoàn tất toàn bộ kế hoạch.",
                    }
                )
                self.plan = DashboardPlan(active_query_ids=list(artifacts))
                for id in artifacts:
                    self.queries.restore(id)
            else:
                raise last_error or AnalysisError(
                    "agent_budget",
                    "No valid analytical operation before budget exhausted",
                )
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
