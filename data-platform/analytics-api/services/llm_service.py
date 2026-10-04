import json
import logging
import os
import time
from typing import Any, Dict, Optional

import requests

from db import GEMINI_API_KEY, GROQ_API_KEY


logger = logging.getLogger("ai-provider-router")
PROVIDER_FAILURE_COOLDOWN_SECONDS = int(os.getenv("AI_PROVIDER_FAILURE_COOLDOWN_SECONDS", "60"))
_unavailable_until = {"gemini": 0.0, "groq": 0.0}
GEMINI_MODELS = tuple(
    model.strip()
    for model in os.getenv(
        "GEMINI_MODELS",
        "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.8-flash",
    ).split(",")
    if model.strip()
)


def _parse_json(raw_text: str) -> Optional[Dict[str, Any]]:
    text = (raw_text or "").strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    try:
        parsed = json.loads(text.strip())
        return parsed if isinstance(parsed, dict) else None
    except (TypeError, json.JSONDecodeError):
        return None


def call_gemini(prompt: str, system_instruction: str = "") -> Optional[Dict[str, Any]]:
    if not GEMINI_API_KEY or time.monotonic() < _unavailable_until["gemini"]:
        return None
    for model in GEMINI_MODELS:
        for attempt in range(2):
            started = time.perf_counter()
            try:
                logger.info("📡 [AI-LLM] Calling Gemini model=%s (prompt_chars=%d)...", model, len(prompt))
                response = requests.post(
                    f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                    params={"key": GEMINI_API_KEY},
                    json={
                        "systemInstruction": {"parts": [{"text": system_instruction}]},
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"},
                    },
                    timeout=25,
                )
                if response.status_code == 503 and attempt == 0:
                    time.sleep(0.5)
                    continue
                if response.ok:
                    raw = response.json()["candidates"][0]["content"]["parts"][0]["text"]
                    data = _parse_json(raw)
                    if data is not None:
                        _unavailable_until["gemini"] = 0.0
                        latency = round((time.perf_counter() - started) * 1000)
                        logger.info("✅ [AI-LLM] Gemini succeeded: model=%s (latency=%dms)", model, latency)
                        return {
                            "data": data,
                            "provider": "gemini",
                            "model": model,
                            "latency_ms": latency,
                        }
                    logger.warning("Gemini returned malformed JSON model=%s", model)
                else:
                    logger.warning("Gemini request failed model=%s status=%s", model, response.status_code)
                    if response.status_code in (404, 400):
                        break
            except Exception as exc:
                logger.warning("Gemini unavailable model=%s error=%s", model, type(exc).__name__)
    _unavailable_until["gemini"] = time.monotonic() + PROVIDER_FAILURE_COOLDOWN_SECONDS
    return None


def call_groq(prompt: str, system_instruction: str = "") -> Optional[Dict[str, Any]]:
    if not GROQ_API_KEY or time.monotonic() < _unavailable_until["groq"]:
        return None
    models = ("qwen/qwen3.8-27b", "openai/gpt-oss-120b", "openai/gpt-oss-20b")
    has_server_error = False
    for model in models:
        started = time.perf_counter()
        try:
            response = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system_instruction},
                        {"role": "user", "content": prompt},
                    ],
                    "response_format": {"type": "json_object"},
                    "max_tokens": 3500,
                    "temperature": 0.1,
                },
                timeout=25,
            )
            if response.ok:
                data = _parse_json(response.json()["choices"][0]["message"]["content"])
                if data is not None:
                    _unavailable_until["groq"] = 0.0
                    return {
                        "data": data,
                        "provider": "groq",
                        "model": model,
                        "latency_ms": round((time.perf_counter() - started) * 1000),
                    }
                logger.warning("Groq returned malformed JSON model=%s", model)
            else:
                logger.warning("Groq request failed model=%s status=%s", model, response.status_code)
                if response.status_code >= 500:
                    has_server_error = True
        except Exception as exc:
            has_server_error = True
            logger.warning("Groq unavailable model=%s error=%s", model, type(exc).__name__)
    if has_server_error:
        _unavailable_until["groq"] = time.monotonic() + PROVIDER_FAILURE_COOLDOWN_SECONDS
    return None


def call_llm(prompt: str, system_instruction: str = "") -> Optional[Dict[str, Any]]:
    """Gemini is primary. Groq is used only when Gemini has no valid JSON response."""
    return call_gemini(prompt, system_instruction) or call_groq(prompt, system_instruction)


def provider_configuration() -> Dict[str, Dict[str, bool]]:
    return {
        "gemini": {"configured": bool(GEMINI_API_KEY)},
        "groq": {"configured": bool(GROQ_API_KEY)},
    }
