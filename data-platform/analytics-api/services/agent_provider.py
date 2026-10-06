"""Native function-call transports. Opaque continuation stays request-local here."""

import json
import logging
import os
import re
import time
from collections import deque
from copy import deepcopy
import requests
from services import llm_service

logger = logging.getLogger("ai-native-provider")


def http_failure(response):
    """Classify transport failures without retaining provider prose or credentials."""
    status = response.status_code
    category = {
        400: "provider_bad_request",
        401: "provider_auth",
        403: "provider_access_denied",
        404: "provider_model_not_found",
        429: "provider_rate_limited",
    }.get(status, "provider_http")
    failure = {"http_status": status, "error_category": category}
    # Inspect prose only locally for fixed classifications. Never publish the
    # message, metadata, URL, credentials or arbitrary provider-controlled text.
    try:
        body = response.json()
    except (ValueError, TypeError):
        body = None
    # Google's OpenAI-compatible endpoint can wrap errors in an array.
    if isinstance(body, list):
        body = next(
            (
                item
                for item in body[:3]
                if isinstance(item, dict) and isinstance(item.get("error"), dict)
            ),
            None,
        )
    error = body.get("error") if isinstance(body, dict) else None
    if not isinstance(error, dict):
        return failure
    provider_status = error.get("status")
    if isinstance(provider_status, str) and provider_status in {
        "INVALID_ARGUMENT",
        "UNAUTHENTICATED",
        "PERMISSION_DENIED",
        "NOT_FOUND",
        "RESOURCE_EXHAUSTED",
        "UNAVAILABLE",
        "INTERNAL",
    }:
        failure["provider_error_status"] = provider_status
    message = error.get("message", "")
    message = message.lower() if isinstance(message, str) else ""
    details = error.get("details", [])
    details = details if isinstance(details, list) else []
    reasons = {
        d.get("reason")
        for d in details
        if isinstance(d, dict) and isinstance(d.get("reason"), str)
    }
    if reasons & {"API_KEY_INVALID", "API_KEY_EXPIRED"} or (
        status == 400
        and ("api key not valid" in message or "api key expired" in message)
    ):
        failure.update(error_category="provider_auth", error_reason="api_key_invalid")
    elif (
        status == 400
        and "model" in message
        and ("not found" in message or "not supported for generatecontent" in message)
    ):
        failure.update(
            error_category="provider_model_not_found", error_reason="model_unavailable"
        )
    elif (
        status == 400
        and "properties" in message
        and ("non-empty" in message or "non empty" in message or "empty" in message)
    ):
        failure.update(
            error_category="provider_schema", error_reason="tool_object_properties"
        )
    elif status == 400 and (
        "function_response" in message
        or "functionresponse" in message
        or "thought signature" in message
    ):
        failure.update(
            error_category="provider_schema", error_reason="tool_continuation_invalid"
        )
    elif status == 400 and (
        "function_declarations" in message
        or "functiondeclarations" in message
        or "parametersjsonschema" in message
    ):
        failure.update(
            error_category="provider_schema", error_reason="tool_schema_invalid"
        )
    elif status == 429:
        failure["error_reason"] = "quota_or_rate_limit"
        scopes = []
        for detail in details[:10]:
            if not isinstance(detail, dict):
                continue
            delay = detail.get("retryDelay")
            if isinstance(delay, str) and re.fullmatch(
                r"[0-9]{1,6}(?:\.[0-9]{1,9})?s", delay
            ):
                failure["retry_after_seconds"] = min(float(delay[:-1]), 86400)
            violations = detail.get("violations", [])
            if not isinstance(violations, list):
                continue
            for violation in violations[:10]:
                if not isinstance(violation, dict):
                    continue
                quota = violation.get("quotaId", "")
                metric = violation.get("quotaMetric", "")
                if not isinstance(quota, str) or not isinstance(metric, str):
                    continue
                name = (quota + metric).lower()
                scope = {
                    "unit": (
                        "tokens"
                        if "token" in name
                        else "requests" if "request" in name else "other"
                    ),
                    "window": (
                        "day"
                        if "perday" in quota.lower()
                        else "minute" if "perminute" in quota.lower() else "other"
                    ),
                }
                limit = violation.get("quotaValue")
                if type(limit) is int and 0 <= limit <= 1000000000:
                    scope["limit"] = limit
                elif isinstance(limit, str) and re.fullmatch(r"[0-9]{1,10}", limit):
                    scope["limit"] = min(int(limit), 1000000000)
                if scope not in scopes:
                    scopes.append(scope)
        headers = getattr(response, "headers", {})
        retry = headers.get("Retry-After") if hasattr(headers, "get") else None
        if isinstance(retry, str) and re.fullmatch(r"[0-9]{1,6}", retry):
            failure["retry_after_seconds"] = max(
                failure.get("retry_after_seconds", 0), min(int(retry), 86400)
            )
        if scopes:
            failure["quota_scopes"] = scopes
        if any(scope["window"] == "day" for scope in scopes):
            failure.update(
                error_category="provider_daily_quota", error_reason="daily_quota"
            )
    if status == 400:
        keywords = [
            word
            for word in (
                "parametersJsonSchema",
                "additionalProperties",
                "anyOf",
                "known_query",
                "functionCall",
                "functionResponse",
                "thoughtSignature",
            )
            if word.lower() in message
        ]
        if keywords:
            failure["schema_keywords"] = keywords
    return failure


def expanded_schema(schema):
    definitions = schema.get("$defs", {})

    def expand(value):
        if isinstance(value, list):
            return [expand(v) for v in value]
        if not isinstance(value, dict):
            return value
        if "$ref" in value:
            return expand(definitions[value["$ref"].split("/")[-1]])
        return {
            k: expand(v)
            for k, v in value.items()
            if k not in ("$defs", "title", "default")
        }

    return expand(schema)


def gemini_tool_schema(tool):
    """Declare complete tool shapes; keep permissive clarification parsing local.

    Pydantic's Any filter value and dict clarification draft otherwise become
    schemas with no type / no object properties. Gemini's function declarations
    need these shapes before it can select even an unrelated semantic tool.
    Execution still validates the original contracts and catalog on the server.
    """
    schema = expanded_schema(tool["parameters"])
    if tool["name"] == "run_analysis":
        # Inference instructions and server omission handling have distinct roles.
        # Request complete meaning even though the boundary can safely recover
        # redundant fields or merge a partial refinement on the server.
        schema["required"] = ["id", "subject", "operation", "metrics", "group_by", "filters", "time", "role"]
        descriptions = {
            "operation": "Choose explicitly. ranking requires ranking; trend requires granularity.",
            "subject": "Discovered business subject ID. Refinement may inherit unchanged fields with replaces.",
            "metrics": "Discovered metric IDs; required for aggregation, empty for detail.",
            "group_by": "Discovered dimensions; explicit grouping for ranking/distribution/cross_tab/relationship; [] for scalar.",
            "filters": "Grounded dimension constraints; [] when none. Preserve UI and parent scope.",
            "time": "Structured calendar meaning; use relative/all_time when no period was requested.",
            "role": "requested or supporting; supporting requires parent_id and a distinct purpose.",
            "ranking": "Required for ranking. Select metric and top_n (1–100); DESC is the default.",
            "granularity": "Required for trend. Select day/week/month/quarter/year explicitly.",
            "changed_fields": "Refinement: only explicitly changed fields; each must be supplied. Others inherit replaces.",
        }
        for field, description in descriptions.items():
            schema["properties"][field]["description"] = description
        for field in ("subject", "operation"):
            shape = schema["properties"][field]
            if "anyOf" in shape:
                schema["properties"][field] = {**next(s for s in shape["anyOf"] if s.get("type") != "null"), "description": shape["description"]}
    if tool["name"] == "ask_clarification":
        from services.analyst_contract import AnalyticalQuery

        draft = expanded_schema(AnalyticalQuery.model_json_schema())
        # Only meaning consumed by clarify(); do not send execution, chart or
        # refinement fields in the initial tool round.
        draft["properties"] = {
            k: v
            for k, v in draft["properties"].items()
            if k
            in {
                "subject",
                "operation",
                "metrics",
                "group_by",
                "filters",
                "ranking",
                "time",
            }
        }

        # A draft is intentionally partial, including partially formed nested
        # fields. The existing clarification parser preserves valid meaning.
        def partial(value):
            if isinstance(value, list):
                return [partial(v) for v in value]
            if not isinstance(value, dict):
                return value
            return {k: partial(v) for k, v in value.items() if k != "required"}

        schema["properties"]["known_query"] = {
            "anyOf": [partial(draft), {"type": "null"}]
        }

    def declare_values(value):
        if isinstance(value, list):
            return [declare_values(v) for v in value]
        if not isinstance(value, dict):
            return value
        value = {k: declare_values(v) for k, v in value.items()}
        props = value.get("properties", {})
        if (
            value.get("type") == "object"
            and {"dimension", "operator", "value"} <= props.keys()
        ):
            scalar = [{"type": t} for t in ("string", "number", "boolean")]
            props["value"] = {
                "anyOf": [
                    *scalar,
                    {
                        "type": "array",
                        "items": {"anyOf": deepcopy(scalar)},
                        "minItems": 1,
                        "maxItems": 100,
                    },
                ]
            }
        return value

    def inference_shape(value):
        # Transport schemas describe meaning. Pydantic/catalog validation owns
        # regex, lengths, numeric bounds and extra-field rejection on the server.
        # Do not forward validation-only JSON Schema dialect keywords through
        # Google's OpenAI-to-function-declaration conversion.
        allowed = {
            "type",
            "properties",
            "required",
            "enum",
            "items",
            "anyOf",
            "nullable",
            "description",
        }
        output = {}
        for key, child in value.items():
            if key not in allowed:
                continue
            if key == "properties":
                output[key] = {name: inference_shape(s) for name, s in child.items()}
            elif key == "items":
                output[key] = inference_shape(child)
            elif key == "anyOf":
                output[key] = [inference_shape(s) for s in child]
            else:
                output[key] = deepcopy(child)
        if "const" in value:
            output["enum"] = [value["const"]]
        if value.get("format") == "date":
            output["description"] = "ISO date (YYYY-MM-DD)."
        return output

    return inference_shape(declare_values(schema))


class NativeAgentProvider:
    """One transport attempt by default; legacy retries require explicit test policy."""

    def __init__(self, *, legacy_policy=False):
        self.legacy_policy = legacy_policy
        self.reset()

    def reset(self):
        from services.provider_budget import ProviderBudget

        self.default_budget = ProviderBudget() if not self.legacy_policy else None
        self.gemini_contents = []
        self.cursor = 0
        self.primary_failed = False
        self.gemini_call_ids = set()
        self.gemini_model = None
        self.gemini_api_style = os.getenv("GEMINI_API_STYLE", "native").strip().lower()
        self.gemini_compat_calls = {}

    def _gemini_body(self, system, messages, tools):
        for message in messages[self.cursor :]:
            if message["role"] == "assistant":
                # Exact original signed parts already appended from the response.
                continue
            if message["role"] == "tool":
                part = {
                    "functionResponse": {
                        "name": message["name"],
                        "response": message["result"],
                    }
                }
                if message.get("id") in self.gemini_call_ids:
                    part["functionResponse"]["id"] = message["id"]
                if (
                    self.gemini_contents
                    and self.gemini_contents[-1]["role"] == "user"
                    and "functionResponse" in self.gemini_contents[-1]["parts"][0]
                ):
                    self.gemini_contents[-1]["parts"].append(part)
                else:
                    self.gemini_contents.append({"role": "user", "parts": [part]})
            else:
                self.gemini_contents.append(
                    {"role": "user", "parts": [{"text": message["content"]}]}
                )
        self.cursor = len(messages)
        return {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": deepcopy(self.gemini_contents),
            "tools": [
                {
                    "functionDeclarations": [
                        {
                            "name": t["name"],
                            "description": t["description"],
                            "parametersJsonSchema": gemini_tool_schema(t),
                        }
                        for t in tools
                    ]
                }
            ],
            "toolConfig": {"functionCallingConfig": {"mode": "ANY"}},
            "generationConfig": {"temperature": 0, "maxOutputTokens": 3500},
        }

    @staticmethod
    def _groq_messages(system, messages):
        output = [{"role": "system", "content": system}]
        for message in messages:
            if message["role"] == "assistant":
                output.append(
                    {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {
                                "id": c["id"],
                                "type": "function",
                                "function": {
                                    "name": c["name"],
                                    "arguments": json.dumps(
                                        c["arguments"], ensure_ascii=False
                                    ),
                                },
                            }
                            for c in message["calls"]
                        ],
                    }
                )
            elif message["role"] == "tool":
                output.append(
                    {
                        "role": "tool",
                        "tool_call_id": message["id"],
                        "name": message["name"],
                        "content": json.dumps(message["result"], ensure_ascii=False),
                    }
                )
            else:
                output.append({"role": "user", "content": message["content"]})
        return output

    def _gemini_compat_body(self, system, messages, tools, model):
        history = self._groq_messages(system, messages)
        for row in history:
            for call in row.get("tool_calls", []):
                original = self.gemini_compat_calls.get(call["id"])
                if original:
                    # Replay the exact argument string and Google's opaque
                    # signature. Neither enters normalized calls or Groq history.
                    call.clear()
                    call.update(deepcopy(original))
        return {
            "model": model,
            "messages": history,
            "tools": [
                {
                    "type": "function",
                    "function": {
                        "name": t["name"],
                        "description": t["description"],
                        "parameters": gemini_tool_schema(t),
                    },
                }
                for t in tools
            ],
            "tool_choice": "required",
            "temperature": 0,
            "max_tokens": 3500,
        }

    def _remember_gemini_compat_calls(self, raw):
        for call in raw:
            saved = {
                "id": call["id"],
                "type": "function",
                "function": {
                    "name": call["function"]["name"],
                    "arguments": call["function"]["arguments"],
                },
            }
            extra = call.get("extra_content")
            google = extra.get("google") if isinstance(extra, dict) else None
            signature = (
                google.get("thought_signature") if isinstance(google, dict) else None
            )
            if isinstance(signature, str) and signature:
                saved["extra_content"] = {"google": {"thought_signature": signature}}
            self.gemini_compat_calls[call["id"]] = saved

    def __call__(self, *, system, messages, tools, call_budget=None):
        from services.provider_budget import ProviderBudget

        if not self.legacy_policy:
            call_budget = call_budget or self.default_budget
        attempts = []
        if os.getenv("AI_OFFLINE", "").lower() in ("1", "true", "yes"):
            return {"calls": None, "attempts": [], "offline": True}
        if self.gemini_api_style not in {"native", "openai"}:
            return {"calls": None, "attempts": [], "configuration_missing": True}
        # Production selects the first configured Gemini model only. Explicit
        # legacy transport retains its old model selection for migration tests.
        gemini_models = (
            [self.gemini_model]
            if self.gemini_model
            else list(dict.fromkeys(llm_service.GEMINI_MODELS))[:3 if self.legacy_policy else 1]
        )
        providers = deque(
            ("gemini", llm_service.GEMINI_API_KEY, m, i)
            for i, m in enumerate(gemini_models)
        )
        if self.legacy_policy and os.getenv("AI_AGENT_GROQ_FALLBACK", "1").lower() in ("1", "true", "yes"):
            providers.append(
                ("groq", llm_service.GROQ_API_KEY, "openai/gpt-oss-120b", 0)
            )
        transient_retried = False
        while providers:
            provider, key, model, index = providers.popleft()
            if not key or not model or (provider == "gemini" and self.primary_failed):
                continue
            started = time.perf_counter()
            attempt = {
                "provider": provider,
                "model": model,
                "status": "failed",
                "tokens": {"input": None, "output": None},
            }
            try:
                if provider == "gemini" and self.gemini_api_style == "openai":
                    payload = self._gemini_compat_body(system, messages, tools, model)
                    attempt["api_style"] = "openai"
                    attempt["tool_schema_chars"] = len(
                        json.dumps(
                            payload["tools"], ensure_ascii=False, separators=(",", ":")
                        )
                    )
                    if call_budget:
                        call_budget.consume(len(json.dumps(payload, ensure_ascii=False, separators=(",", ":"))))
                    response = requests.post(
                        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
                        headers={
                            "Authorization": f"Bearer {key.strip()}",
                            "Content-Type": "application/json",
                        },
                        json=payload,
                        timeout=25,
                    )
                elif provider == "gemini":
                    attempt["api_style"] = "native"
                    payload = self._gemini_body(system, messages, tools)
                    attempt["tool_schema_chars"] = len(
                        json.dumps(
                            payload["tools"], ensure_ascii=False, separators=(",", ":")
                        )
                    )
                    if call_budget:
                        call_budget.consume(len(json.dumps(payload, ensure_ascii=False, separators=(",", ":"))))
                    response = requests.post(
                        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                        params={"key": key},
                        json=payload,
                        timeout=25,
                    )
                else:
                    if call_budget:
                        call_budget.consume()
                    response = requests.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers={"Authorization": f"Bearer {key}"},
                        json={
                            "model": model,
                            "messages": self._groq_messages(system, messages),
                            "tools": [
                                {
                                    "type": "function",
                                    "function": {
                                        "name": t["name"],
                                        "description": t["description"],
                                        "parameters": expanded_schema(t["parameters"]),
                                    },
                                }
                                for t in tools
                            ],
                            "tool_choice": "required",
                            "temperature": 0,
                            "max_tokens": 3500,
                        },
                        timeout=25,
                    )
                if not response.ok:
                    attempt.update(http_failure(response))
                    raise RuntimeError("transport")
                body = response.json()
                if provider == "gemini" and self.gemini_api_style == "native":
                    parts = body["candidates"][0]["content"]["parts"]
                    calls = [
                        {
                            "id": part["functionCall"].get("id")
                            or f"gemini_{len(messages)}_{i}",
                            "name": part["functionCall"]["name"],
                            "arguments": part["functionCall"].get("args", {}),
                        }
                        for i, part in enumerate(parts)
                        if "functionCall" in part
                    ]
                    # Preserve signed function-call parts verbatim, never thought text.
                    signed = [deepcopy(p) for p in parts if "functionCall" in p]
                    self.gemini_call_ids.update(
                        p["functionCall"]["id"]
                        for p in signed
                        if p["functionCall"].get("id")
                    )
                    if calls:
                        self.gemini_contents.append({"role": "model", "parts": signed})
                    usage = body.get("usageMetadata", {})
                    attempt["tokens"] = {
                        "input": usage.get("promptTokenCount"),
                        "output": usage.get("candidatesTokenCount"),
                    }
                else:
                    raw = body["choices"][0]["message"].get("tool_calls", [])
                    calls = [
                        {
                            "id": c["id"],
                            "name": c["function"]["name"],
                            "arguments": json.loads(c["function"]["arguments"]),
                        }
                        for c in raw
                    ]
                    usage = body.get("usage", {})
                    attempt["tokens"] = {
                        "input": usage.get("prompt_tokens"),
                        "output": usage.get("completion_tokens"),
                    }
                if not calls or any(
                    not isinstance(c["arguments"], dict) for c in calls
                ):
                    raise ValueError("invalid native calls")
                if provider == "gemini" and self.gemini_api_style == "openai":
                    self._remember_gemini_compat_calls(raw)
                attempt["status"] = "success"
                if provider == "gemini":
                    self.gemini_model = model
                attempt["latency_ms"] = round((time.perf_counter() - started) * 1000, 2)
                attempts.append(attempt)
                return {"calls": calls, "attempts": attempts}
            except requests.exceptions.Timeout:
                attempt["error_category"] = "provider_timeout"
            except requests.exceptions.ConnectionError:
                attempt["error_category"] = "provider_connection"
            except (ValueError, IndexError, KeyError, TypeError) as exc:
                if getattr(exc, "category", None) in {"provider_call_budget_exceeded", "one_shot_context_budget_exceeded"}:
                    raise
                attempt["error_category"] = "invalid_tool_response"
            except Exception as exc:
                if getattr(exc, "category", None) in {"provider_call_budget_exceeded", "one_shot_context_budget_exceeded"}:
                    raise
                attempt.setdefault("error_category", "provider_unavailable")
            attempt["latency_ms"] = round((time.perf_counter() - started) * 1000, 2)
            attempts.append(attempt)
            logger.warning(
                "Native provider failed provider=%s model=%s http_status=%s category=%s reason=%s provider_status=%s schema_keywords=%s latency_ms=%s quota_scopes=%s retry_after_seconds=%s",
                provider,
                model,
                attempt.get("http_status"),
                attempt["error_category"],
                attempt.get("error_reason"),
                attempt.get("provider_error_status"),
                attempt.get("schema_keywords", []),
                attempt["latency_ms"],
                attempt.get("quota_scopes", []),
                attempt.get("retry_after_seconds"),
            )
            if not self.legacy_policy:
                break
            if provider == "gemini":
                if attempt.get("http_status") == 503 and not transient_retried:
                    # Retry the same signed continuation once. No model hop,
                    # recursive retry, new agent round or analytical execution.
                    transient_retried = True
                    providers.appendleft((provider, key, model, index))
                    time.sleep(0.5)
                    continue
                retry_configured_model = (
                    attempt["error_category"]
                    in {"provider_model_not_found", "provider_daily_quota"}
                    and not self.gemini_model
                    and index + 1 < len(gemini_models)
                )
                self.primary_failed = not retry_configured_model
        return {
            "calls": None,
            "attempts": attempts,
            "configuration_missing": not attempts,
        }
