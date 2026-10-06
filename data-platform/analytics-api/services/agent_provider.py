"""Native function-call transports. Opaque continuation stays request-local here."""

import json
import os
import time
from copy import deepcopy
import requests
from services import llm_service


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


class NativeAgentProvider:
    """One primary/fallback attempt per round; no unbounded model/retry cascade."""

    def __init__(self):
        self.reset()

    def reset(self):
        self.gemini_contents = []
        self.cursor = 0
        self.primary_failed = False
        self.gemini_call_ids = set()

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
                            "parametersJsonSchema": expanded_schema(t["parameters"]),
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

    def __call__(self, *, system, messages, tools):
        attempts = []
        if os.getenv("AI_OFFLINE", "").lower() in ("1", "true", "yes"):
            return {"calls": None, "attempts": [], "offline": True}
        providers = [
            (
                "gemini",
                llm_service.GEMINI_API_KEY,
                llm_service.GEMINI_MODELS[0] if llm_service.GEMINI_MODELS else "",
            ),
            ("groq", llm_service.GROQ_API_KEY, "openai/gpt-oss-120b"),
        ]
        for provider, key, model in providers:
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
                if provider == "gemini":
                    response = requests.post(
                        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                        params={"key": key},
                        json=self._gemini_body(system, messages, tools),
                        timeout=25,
                    )
                else:
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
                    attempt["error_category"] = (
                        "provider_schema"
                        if response.status_code == 400
                        else "provider_http"
                    )
                    raise RuntimeError("transport")
                body = response.json()
                if provider == "gemini":
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
                attempt["status"] = "success"
                attempt["latency_ms"] = round((time.perf_counter() - started) * 1000, 2)
                attempts.append(attempt)
                return {"calls": calls, "attempts": attempts}
            except requests.exceptions.Timeout:
                attempt["error_category"] = "provider_timeout"
            except (ValueError, IndexError, KeyError, TypeError):
                attempt["error_category"] = "invalid_tool_response"
            except Exception:
                attempt.setdefault("error_category", "provider_unavailable")
            attempt["latency_ms"] = round((time.perf_counter() - started) * 1000, 2)
            attempts.append(attempt)
            if provider == "gemini":
                self.primary_failed = True
        return {"calls": None, "attempts": attempts}
