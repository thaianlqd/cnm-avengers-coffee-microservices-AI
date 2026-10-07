"""
groq_service.py
---------------
Primary AI provider: Groq (Llama-3.3-70b for chat, Whisper-large-v3-turbo for STT)
Fallback: Gemini (existing logic stays in main.py)

Groq free tier: 30 RPM, ~6000 req/day - NO credit card needed
Get key at: https://console.groq.com
"""
import json
import logging
import os
import re
import time
import unicodedata
from typing import Any, Dict, List, Optional
from src.common.gemini_compat import inference_messages, tool_extra_content

logger = logging.getLogger(__name__)

# ─── LLM client (lazy init & round-robin fallback Groq <-> Gemini) ──────────
_llm_clients = []
_active_client_idx = 0
_clients_initialized = False

class FakeFunction:
    def __init__(self, d):
        self.name = d.get("name")
        self.arguments = d.get("arguments")

class FakeToolCall:
    def __init__(self, d):
        self.id = d.get("id")
        self.type = d.get("type", "function")
        self.function = FakeFunction(d.get("function", {}))
        # Opaque inference metadata only; never put it in tool args/artifacts/logs.
        self.gemini_extra_content = tool_extra_content(d.get('extra_content'))


def _continuation_tool_call(call, provider):
    row = {'id': call.id, 'type': 'function', 'function': {
        'name': call.function.name, 'arguments': call.function.arguments}}
    if provider == 'gemini' and getattr(call, 'gemini_extra_content', None):
        row['extra_content'] = tool_extra_content(call.gemini_extra_content)
    return row

class FakeMessage:
    def __init__(self, d):
        self.content = d.get("content")
        self.tool_calls = []
        if d.get("tool_calls"):
            for tc in d.get("tool_calls"):
                self.tool_calls.append(FakeToolCall(tc))

class FakeChoice:
    def __init__(self, d):
        self.message = FakeMessage(d.get("message", {}))

class FakeResponse:
    def __init__(self, d):
        self.choices = [FakeChoice(c) for c in d.get("choices", [])]
        self.usage = d.get("usage") or {}
        self.model = d.get("model")


class ProviderRequestError(RuntimeError):
    """Status/Retry-After survive classification; provider body is never logged."""
    def __init__(self, provider, response):
        super().__init__(f'{provider} request failed (HTTP {response.status_code})')
        self.status_code = response.status_code
        self.headers = response.headers
        self.error_text = response.text


def _request_timeout(seconds):
    """Share the assigned wait across connect/read; no transport-level retry."""
    from urllib3.util import Timeout
    return Timeout(total=seconds, connect=min(3.0, seconds), read=seconds)

class OpenRouterCompletions:
    def __init__(self, api_key):
        self.api_key = api_key
        
    def create(self, model, messages, tools=None, tool_choice="auto", max_tokens=2048, temperature=0.1, response_format=None, timeout=30, allow_fallback=True):
        import requests
        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature
        }
        if response_format:
            payload["response_format"] = response_format
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = tool_choice
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        fallback_models = [
            model,
            "google/gemini-flash-1.5",
            "google/gemini-pro-1.5",
            "openai/gpt-4o-mini",
            "openrouter/auto"
        ]
        
        last_resp = None
        for fallback_model in fallback_models if allow_fallback else [model]:
            payload["model"] = fallback_model
            resp = requests.post("https://openrouter.ai/api/v1/chat/completions", json=payload, headers=headers, timeout=_request_timeout(timeout))
            if resp.ok:
                return FakeResponse(resp.json())
            last_resp = resp
            if resp.status_code != 404 and "No endpoints found" not in resp.text:
                # If it's a real error (like 401 Unauthorized or 402 Payment Required), stop immediately
                break
                
        raise ProviderRequestError('openrouter', last_resp)

class OpenRouterChat:
    def __init__(self, api_key):
        self.completions = OpenRouterCompletions(api_key)

class OpenRouterClient:
    def __init__(self, api_key):
        self.chat = OpenRouterChat(api_key)
        self.base_url = "https://openrouter.ai/api/v1"

class GeminiCompletions:
    def __init__(self, api_key):
        self.api_key = api_key
        
    def create(self, model, messages, tools=None, tool_choice="auto", max_tokens=2048, temperature=0.1, response_format=None, timeout=30):
        import requests
        payload = {
            "model": model,
            "messages": inference_messages(messages, 'gemini'),
            "max_tokens": max_tokens,
            "temperature": temperature
        }
        if response_format:
            payload["response_format"] = response_format
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = tool_choice
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        resp = requests.post("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", json=payload, headers=headers, timeout=_request_timeout(timeout))
        if resp.ok:
            return FakeResponse(resp.json())
        raise ProviderRequestError('gemini', resp)

class GeminiChat:
    def __init__(self, api_key):
        self.completions = GeminiCompletions(api_key)

class GeminiClient:
    def __init__(self, api_key):
        self.chat = GeminiChat(api_key)
        self.base_url = "https://generativelanguage.googleapis.com/v1beta/openai/"

class OpenAICompletions:
    def __init__(self, api_key, base_url='https://api.openai.com/v1'):
        self.api_key = api_key
        self.base_url = base_url
        
    def create(self, model, messages, tools=None, tool_choice="auto", max_tokens=1000, temperature=0.1, response_format=None, timeout=30):
        import requests
        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature
        }
        if response_format:
            payload["response_format"] = response_format
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = tool_choice
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        resp = requests.post(self.base_url.rstrip('/')+'/chat/completions', json=payload, headers=headers, timeout=_request_timeout(timeout))
        if resp.ok:
            return FakeResponse(resp.json())
        raise ProviderRequestError('openai', resp)

class OpenAIChat:
    def __init__(self, api_key, base_url='https://api.openai.com/v1'):
        self.completions = OpenAICompletions(api_key, base_url)

class OpenAIClient:
    def __init__(self, api_key, base_url='https://api.openai.com/v1'):
        self.chat = OpenAIChat(api_key, base_url)
        self.base_url = base_url

def _get_groq_client():
    global _llm_clients, _clients_initialized, _active_client_idx
    if _clients_initialized:
        if not _llm_clients:
            return None
        return _llm_clients[_active_client_idx]
        
    groq_env = os.getenv("GROQ_API_KEY", "").strip()
    gemini_env = os.getenv("GEMINI_API_KEY", "").strip()
    cerebras_env = os.getenv("CEREBRAS_API_KEY", "").strip()
    openrouter_env = os.getenv("OPENROUTER_API_KEY", "").strip()
    openai_env = os.getenv("OPENAI_API_KEY", "").strip()
    
    _clients_initialized = True
    try:
        from groq import Groq
        # 1. Khởi tạo Groq clients
        keys = [k.strip() for k in groq_env.split(",") if k.strip()]
        for k in keys:
            if k and "your_groq" not in k:
                client = Groq(api_key=k, max_retries=0)
                _llm_clients.append(client)
                
        if gemini_env and "your_gemini" not in gemini_env:
            keys = [k.strip() for k in gemini_env.split(",") if k.strip()]
            for k in keys:
                client = GeminiClient(api_key=k)
                # Put Gemini AT THE FRONT so it's preferred over Groq since Gemini has a massive context window and rate limit
                _llm_clients.insert(0, client)
            
        # 4. Khởi tạo OpenRouter client
        if openrouter_env and "your_openrouter" not in openrouter_env:
            openrouter_client = OpenRouterClient(api_key=openrouter_env)
            # Tạm thời bỏ OpenRouter khỏi fallback list do hết credit (402)
            # _llm_clients.append(openrouter_client)
            
        # 5. Khởi tạo OpenAI client
        if openai_env and "your_openai" not in openai_env:
            keys = [k.strip() for k in openai_env.split(",") if k.strip()]
            for k in keys:
                client = OpenAIClient(api_key=k)
                # Put OpenAI AT THE VERY FRONT since it's the best model and highest rate limit usually
                _llm_clients.insert(0, client)
                
        if _llm_clients:
            logger.info("[LLM] Initialized %d clients for round-robin", len(_llm_clients))
            return _llm_clients[_active_client_idx]
        return None
    except Exception as e:
        logger.warning("[LLM] Cannot init client: %s", e)
        return None

def switch_groq_client():
    global _active_client_idx, _llm_clients, _selected_chat_model
    if len(_llm_clients) > 1:
        _active_client_idx = (_active_client_idx + 1) % len(_llm_clients)
        _selected_chat_model = None # Reset model cache
        base = str(_llm_clients[_active_client_idx].base_url)
        llm_name = "Gemini" if "generativelanguage" in base else "Cerebras" if "cerebras" in base else "OpenRouter" if "openrouter" in base else "Groq"
        logger.warning("[LLM] Rate limited/Error! Switched to LLM Client #%d (%s)", 
                       _active_client_idx + 1, llm_name)

def groq_is_available() -> bool:
    return _get_groq_client() is not None


def _client_provider(client) -> str:
    base = str(getattr(client, "base_url", "")).lower()
    if "generativelanguage" in base:
        return "gemini"
    if "api.openai.com" in base:
        return "openai"
    if "openrouter" in base:
        return "openrouter"
    if "cerebras" in base:
        return "cerebras"
    if "groq" in base:
        return "groq"
    return "unknown"


def _agent_client_sequence(preferred: str):
    """Return a deliberate provider-first chain without changing legacy order."""
    _get_groq_client()  # Lazy initialization of the existing shared clients.
    clients = list(_llm_clients)
    if preferred == "openrouter" and not any(_client_provider(c) == preferred for c in clients):
        key = os.getenv("OPENROUTER_API_KEY", "").strip()
        if key and "your_openrouter" not in key:
            clients.insert(0, OpenRouterClient(key))
    if preferred == "auto":
        return clients
    selected = [client for client in clients if _client_provider(client) == preferred]
    # Compatible providers are outage fallbacks only. An unconfigured preferred
    # provider fails explicitly rather than making quality policy accidental.
    return selected + [client for client in clients if client not in selected] if selected else []

# Danh sách model fallback cứng (dùng khi không gọi được models.list())
GROQ_MODELS_FALLBACK = [
    "llama-3.3-70b-versatile",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
]

# Cache model đã chọn thành công — tránh gọi models.list() lặp đi lặp lại
_selected_chat_model: Optional[str] = None
_banned_models_until: Dict[str, float] = {}

def groq_chat(system_prompt: str, user_prompt: str, max_tokens: int = 512) -> Optional[str]:
    """
    Call Groq Llama chat (simple, no tools). Returns reply text or None on failure.
    Dùng cho các endpoint không cần Agentic (forecast, order-intent extraction...).
    """
    client = _get_groq_client()
    if client is None:
        return None

    model = _resolve_chat_model(client)
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
            max_tokens=max_tokens,
            temperature=0.4,
        )
        reply = (resp.choices[0].message.content or "").strip()
        logger.info("[Groq] chat OK model=%s", model)
        return reply
    except Exception as e:
        err = str(e)
        logger.error("[Groq] chat error model=%s: %s", model, err[:200])
        
    logger.warning("[Groq] Chat failed")
    return None


# ─── Agentic Chat with Function Calling Loop ─────────────────────────────────

def _resolve_chat_model(client) -> Optional[str]:
    """
    Lấy model chat phù hợp từ API.
    Tránh gọi models.list() lặp lại mỗi request.
    """
    global _selected_chat_model, _banned_models_until
    
    # Xoá các model đã hết hạn ban
    now = time.time()
    for m in list(_banned_models_until.keys()):
        if now > _banned_models_until[m]:
            del _banned_models_until[m]

    if _selected_chat_model and _selected_chat_model not in _banned_models_until:
        return _selected_chat_model

    # Nếu client hiện tại là Gemini/Cerebras/OpenRouter, ta dùng luôn model cứng tương ứng
    base_url_str = str(getattr(client, "base_url", ""))
    if "generativelanguage" in base_url_str:
        return "gemini-3.6-flash"
    elif "cerebras" in base_url_str:
        return "llama3.1-8b"
    elif "openrouter" in base_url_str:
        return "google/gemini-flash-1.5"
    elif "api.openai.com" in base_url_str:
        return "gpt-4o-mini"

    try:
        models = client.models.list().data
        available_ids = [m.id for m in models]
        logger.info("[Groq] Available models: %s", available_ids)
        for preferred in GROQ_MODELS_FALLBACK:
            if preferred in available_ids and preferred not in _banned_models_until:
                _selected_chat_model = preferred
                logger.info("[Groq] Selected chat model from API: %s", _selected_chat_model)
                return _selected_chat_model
        
        # Nếu không có model nào trong preferred list, ta lấy đại model đầu tiên có chữ gpt hoặc llama
        for av_model in available_ids:
            if av_model not in _banned_models_until and ("gpt" in av_model or "llama" in av_model):
                # Loại trừ các model chuyên biệt không hỗ trợ chat/tool
                if "guard" in av_model.lower() or "whisper" in av_model.lower():
                    continue
                _selected_chat_model = av_model
                logger.info("[Groq] Auto-selected from available: %s", _selected_chat_model)
                return _selected_chat_model

    except Exception as e:
        logger.warning("[Groq] Could not list models: %s", e)

    # Nếu tất cả các model khả dụng đều bị ban, xóa ban để thử lại
    if len(_banned_models_until) > 0:
        logger.warning("[Groq] All preferred models are rate-limited. Clearing bans.")
        _banned_models_until.clear()
        
    _selected_chat_model = "openai/gpt-oss-20b"
    logger.info("[Groq] Fallback chat model: %s", _selected_chat_model)
    return _selected_chat_model

def groq_agent_chat(
    messages: List[Dict[str, Any]],
    tools: Optional[List[Dict[str, Any]]] = None,
    tool_executors: Optional[Dict[str, Any]] = None,
    session_id: str = "",
    max_tool_rounds: int = 10,
    max_tokens: int = 400,
    guarded: bool = False,
    tool_result_formatter=None,
    metrics: Optional[Dict[str, Any]] = None,
    context_char_limit: Optional[int] = None,
    final_response_validator=None,
    agent_provider: Optional[str] = None,
    agent_model: Optional[str] = None,
    tool_surface_provider=None,
    model_context_provider=None,
    context_compactor=None,
    model_tier_provider=None,
    tool_result_projector=None,
    discovery_completion_provider=None,
    final_response_repair_allowed=None,
    final_response_repair_context_provider=None,
    customer_step_response_provider=None,
    repair_progress_provider=None,
    repeated_read_feedback_provider=None,
    semantic_proposal_stager=None,
    semantic_batch_executor=None,
) -> Dict[str, Any]:
    """
    Agentic chat loop với Groq Function Calling.

    Quy trình:
      1. Gửi messages + tools lên Groq.
      2. Nếu Groq trả về tool_calls → gọi hàm Python tương ứng,
         thêm kết quả vào messages, lặp lại.
      3. Nếu Groq trả về content text → kết thúc, trả về text cho user.
      4. Dừng sau max_tool_rounds vòng để tránh vòng lặp vô tận.

    Args:
        messages:       Danh sách messages theo chuẩn OpenAI (system, user, assistant, tool).
        tools:          List JSON Schema của tools (TOOL_SCHEMAS từ function_calling/tools).
        tool_executors: Dict {tool_name: callable(args) -> dict}.
        session_id:     ID phiên chat (dùng cho session state/cart).
        max_tool_rounds: Số vòng tối đa gọi tool trước khi dừng.
        max_tokens:     Token tối đa cho mỗi lần gọi Groq.

    Returns:
        {
          "reply": str,           # Text trả về user (rỗng nếu lỗi)
          "tool_calls_log": list, # Log các tool đã được gọi trong vòng lặp
          "checkout_payload": dict | None,  # Nếu có request_checkout, payload xác nhận đơn
          "error": str | None,
        }
    """
    global _selected_chat_model
    requested_provider = (agent_provider or "").strip().lower()
    if requested_provider and requested_provider not in {"auto", "gemini", "openai", "groq", "openrouter", "cerebras"}:
        return {"reply": "", "tool_calls_log": [], "checkout_payload": None,
                "error": "Unsupported agent provider."}
    agent_clients = _agent_client_sequence(requested_provider) if requested_provider and not guarded else None
    client = None if guarded else ((agent_clients[0] if agent_clients else None) if agent_clients is not None else _get_groq_client())
    if not guarded and client is None:
        return {"reply": "", "tool_calls_log": [], "checkout_payload": None,
                "error": "Configured agent provider unavailable" if requested_provider else "Groq client unavailable"}

    tool_calls_log = []
    checkout_payload = None
    current_messages = list(messages)
    turn_tool_cache = {}
    force_tools_disabled = False
    force_tool_required = False
    required_repair_tool = None
    repeated_tool_result = None
    semantic_repairs = 0
    protocol_repairs = 0
    read_completion_repairs = 0
    final_envelope_repairs = 0
    final_envelope_repair_active = False
    dialogue_format_repairs = 0
    dialogue_format_repair_active = False
    mutation_succeeded = False
    provider_turn_health = {}

    # Resolve model một lần duy nhất cho cả cuộc hội thoại (cached sau lần đầu)
    def model_for(selected_client):
        if agent_model and (not requested_provider or requested_provider == "auto"
                            or _client_provider(selected_client) == requested_provider):
            return agent_model
        return _resolve_chat_model(selected_client)

    model = None if guarded else model_for(client)
    if not guarded and model is None:
        return {
            "reply": "",
            "tool_calls_log": [],
            "checkout_payload": None,
            "error": "No usable Groq chat model found for this API key.",
        }

    for round_idx in range(max_tool_rounds + 2):
        # The extra slot is exclusively one tools-disabled envelope repair.
        if round_idx > max_tool_rounds and not final_envelope_repair_active:
            break
        resp = None
        if guarded and round_idx == max_tool_rounds:
            force_tools_disabled = True
        if not guarded and context_char_limit and sum(len(str(m.get('content') or '')) for m in current_messages) > context_char_limit:
            if guarded and context_compactor:
                current_messages = context_compactor(current_messages)
            if sum(len(str(m.get('content') or '')) for m in current_messages) > context_char_limit:
                return {"reply": "", "tool_calls_log": tool_calls_log, "checkout_payload": checkout_payload,
                        "error": "context_budget_exceeded"}
        
        # ── Retry qua các Client nếu gặp lỗi ──
        success = False
        last_err = ""
        t0 = time.perf_counter()
        protocol_repair_round = bool(provider_turn_health.get('semantic_repair_pending'))
        if guarded:
            from src.common.agent_provider_policy import completion
            if tool_surface_provider:
                tools, tool_executors = tool_surface_provider(force_tools_disabled, required_repair_tool)
            if force_tools_disabled:
                tools, tool_executors = [], {}
            if model_context_provider and not final_envelope_repair_active:
                current_messages[0] = model_context_provider()
            if context_char_limit and sum(len(str(m.get('content') or '')) for m in current_messages) > context_char_limit:
                if context_compactor:
                    current_messages = context_compactor(current_messages)
                if sum(len(str(m.get('content') or '')) for m in current_messages) > context_char_limit:
                    return {'reply': '', 'tool_calls_log': tool_calls_log,
                            'checkout_payload': checkout_payload, 'error': 'context_budget_exceeded'}
            if metrics is not None:
                metrics['exposed_tool_count'] = max(metrics.get('exposed_tool_count', 0), len(tools or []))
                chars = len(json.dumps(tools or [], ensure_ascii=False))
                metrics['tool_schema_chars'] = max(metrics.get('tool_schema_chars', 0), chars)
                metrics.setdefault('tool_schema_chars_by_round', []).append(chars)
                metrics.setdefault('capability_counts_by_round', []).append(len(tools or []))
                metrics['max_exposed_tool_count'] = max(metrics.get('max_exposed_tool_count', 0), len(tools or []))
            tier = model_tier_provider(round_idx, semantic_repairs, mutation_succeeded) if model_tier_provider else 'standard'
            resp, client, model, error = completion(current_messages, tools,
                preferred=requested_provider or 'auto', explicit_model=agent_model, tier=tier,
                max_tokens=max_tokens, required=force_tool_required, metrics=metrics,
                compact_messages=context_compactor, turn_health=provider_turn_health, round_index=round_idx)
            success, last_err = resp is not None, error or ''
        else:
            retry_clients = agent_clients if agent_clients is not None else [None] * max(1, len(_llm_clients))
            for retry_idx, configured_client in enumerate(retry_clients):
                client = configured_client or _get_groq_client()
                if client is None:
                    break
                
                model = model_for(client)
                if model is None:
                    logger.warning("[Groq Agent] Model None for current client, switching...")
                    if agent_clients is None:
                        switch_groq_client()
                    continue
                
                try:
                    t0 = time.perf_counter()
                    kwargs: Dict[str, Any] = {
                        "model": model,
                        "messages": current_messages,
                        "max_tokens": max_tokens,
                        "temperature": 0.35,
                    }
                    if tools and not force_tools_disabled:
                        kwargs["tools"] = tools
                        kwargs["tool_choice"] = "required" if force_tool_required else "auto"
                    if guarded and final_response_validator:
                        kwargs["response_format"] = {"type": "json_object"}
                    if metrics is not None:
                        metrics['provider_attempt_count'] = metrics.get('provider_attempt_count', 0) + 1
    
                    resp = client.chat.completions.create(**kwargs)
                    success = True
                    break # Thành công thì thoát vòng lặp retry
                
                except Exception as e:
                    t1 = time.perf_counter()
                    err = str(e)
                    last_err = err
                    if metrics is not None:
                        metrics['provider_failure_count'] = metrics.get('provider_failure_count', 0) + 1
                        metrics['failed_provider_latency_ms'] = metrics.get('failed_provider_latency_ms', 0) + round((t1-t0)*1000, 2)
                    logger.warning("[Groq Agent] API error round=%d retry=%d (took %.2fs): %s", round_idx, retry_idx, t1 - t0, type(e).__name__ if guarded else err[:120])
                
                    if "413" in err or "too large" in err.lower():
                        if "tokens per minute" in err.lower() or "tpm" in err.lower():
                            # Đôi khi Groq trả 413 cho lỗi vượt quá TPM thay vì 429
                            _banned_models_until[model] = time.time() + 60
                            _selected_chat_model = None
                            logger.warning("[Groq Agent] Model %s TPM limit reached (413), banning for 60s.", model)
                            if agent_clients is None:
                                switch_groq_client()
                            continue
                        
                        logger.warning("[Groq Agent] Payload too large (413). Stripping history to prevent failure.")
                        # Keep only system message (index 0) and the very last message (user_message)
                        if len(current_messages) > 2:
                            current_messages = [current_messages[0], current_messages[-1]]
                            continue # Retry immediately with stripped messages
                        else:
                            return {"reply": "", "tool_calls_log": tool_calls_log, "checkout_payload": checkout_payload, "error": "Context window exceeded."}

                    if "404" in err or "does not exist" in err or "decommissioned" in err:
                        _selected_chat_model = None
                
                    if "429" in err or "rate_limit" in err.lower():
                        _banned_models_until[model] = time.time() + 60
                        _selected_chat_model = None
                        logger.warning("[Groq Agent] Model %s rate limited, banning for 60s.", model)

                    if "400" in err and "tool calling" in err.lower():
                        _banned_models_until[model] = time.time() + 86400  # Ban 1 ngày vì model này không hỗ trợ tool
                        _selected_chat_model = None
                        logger.warning("[Groq Agent] Model %s doesn't support tools, banning for 1 day.", model)
                    
                    if agent_clients is None:
                        switch_groq_client()
                    continue
                
        if not success or not resp:
            # Nếu chạy hết các client mà vẫn lỗi (hoặc mất mạng)
            logger.error("[Groq Agent] All clients failed in round=%d. Last error: %s", round_idx, 'provider_unavailable' if guarded else last_err)
            return {"reply": "" if guarded else "Hệ thống đang quá tải hoặc hết token, vui lòng thử lại sau ít phút.", "tool_calls_log": tool_calls_log, "checkout_payload": checkout_payload,
                    "error": last_err if guarded else ("rate_limit" if ("rate_limit" in last_err.lower() or "429" in last_err or "402" in last_err) else "All LLM clients failed.")}

        choice = resp.choices[0]
        assistant_msg = choice.message
        if metrics is not None:
            usage = getattr(resp, 'usage', None) or {}
            def usage_value(key):
                return usage.get(key, 0) if isinstance(usage, dict) else getattr(usage, key, 0)
            metrics['input_tokens'] = metrics.get('input_tokens', 0) + (usage_value('prompt_tokens') or 0)
            metrics['output_tokens'] = metrics.get('output_tokens', 0) + (usage_value('completion_tokens') or 0)
            from src.agents.agent_memory import safe_text
            metrics.update(model=safe_text(getattr(resp, 'model', None) or model, 128) if guarded else getattr(resp, 'model', None) or model,
                provider=_client_provider(client),
                request_count=metrics.get('request_count', 0)+1)
            metrics['llm_latency_ms'] = metrics.get('llm_latency_ms', 0) + round((time.perf_counter()-t0)*1000, 2)

        # ── Case 1: Groq muốn gọi Tool ────────────────────────────────────
        if assistant_msg.tool_calls:
            required_repair_round = bool(force_tool_required and required_repair_tool)
            force_tool_required = False
            if metrics is not None:
                metrics['tool_round_count'] = metrics.get('tool_round_count', 0) + 1
            if force_tools_disabled:
                message = (repeated_tool_result or {}).get("message") if isinstance(repeated_tool_result, dict) else None
                return {
                    "reply": "" if guarded else str(message or "Mình đã có kết quả tra cứu ở trên nhưng chưa thể diễn đạt thêm lúc này."),
                    "tool_calls_log": tool_calls_log,
                    "checkout_payload": checkout_payload,
                    "error": "repeated_tool_call",
                }
            # Thêm assistant message (chứa tool_calls) vào lịch sử
            current_messages.append({
                "role": "assistant",
                "content": assistant_msg.content or "",
                "tool_calls": [_continuation_tool_call(tc, _client_provider(client))
                               for tc in assistant_msg.tool_calls],
            })

            # Thực thi từng tool call
            repeated_signature = False
            recoverable_write_denial = False
            protocol_repair_requested = False
            successful_required_repair = False
            terminal_success = False
            confirmation_denied_stop = False
            batch_results = None
            if guarded and semantic_batch_executor and any(
                    str(tc.function.name).startswith('semantic_') for tc in assistant_msg.tool_calls):
                # No member executes until the gateway has validated and frozen
                # the entire response, including malformed/unknown siblings.
                if len(assistant_msg.tool_calls) > 16 or len(tool_calls_log) + len(assistant_msg.tool_calls) > max_tool_rounds * 4:
                    return {'reply': '', 'tool_calls_log': tool_calls_log,
                            'checkout_payload': checkout_payload, 'error': 'tool_call_budget_exceeded'}
                batch_results = semantic_batch_executor(assistant_msg.tool_calls)
            for call_index, tc in enumerate(assistant_msg.tool_calls):
                if guarded and len(tool_calls_log) >= max_tool_rounds * 4:
                    return {"reply": "", "tool_calls_log": tool_calls_log,
                            "checkout_payload": checkout_payload, "error": "tool_call_budget_exceeded"}
                tool_name = tc.function.name
                try:
                    import json as _json
                    tool_args_str = tc.function.arguments or "{}"
                    tool_args = _json.loads(tool_args_str)
                except Exception:
                    if guarded:
                        tool_args = None
                    else:
                        tool_args = {}
                    tool_args_str = "{}"

                # Canonical args make whitespace/key order irrelevant. Once a
                # result has been supplied, an identical signature has no new
                # information and gets one final tools-disabled completion.
                canonical_args = _json.dumps(tool_args, ensure_ascii=False, sort_keys=True,
                                             separators=(",", ":"))
                tool_hash = f"{tool_name}|{canonical_args}"
                from src.agents.tool_capabilities import CAPABILITIES
                is_read = tool_name in CAPABILITIES and CAPABILITIES[tool_name].access == 'READ'
                if batch_results is not None:
                    result = batch_results[call_index]
                elif tool_hash in turn_tool_cache and (not guarded or (not is_read and tool_name in (tool_executors or {}))):
                    logger.info("[Groq Agent] Repeated tool signature; forcing final completion: %s", tool_name if guarded else tool_hash)
                    result = turn_tool_cache[tool_hash]
                    repeated_signature = True
                    repeated_tool_result = result
                else:
                    logger.info("[Groq Agent] Tool call round=%d: %s args=%s", round_idx, tool_name,
                                sorted(tool_args) if guarded and isinstance(tool_args, dict) else "invalid" if guarded else tool_args)
                    # Dispatch đến executor. Checkout confirmation is only
                    # available through the server-side pending-action gate.
                    executor = (tool_executors or {}).get(tool_name)
                    if tool_name == "confirm_checkout" and not guarded:
                        result = {
                            "status": "confirmation_required",
                            "message": "Chỉ backend được thực thi đơn sau khi xác nhận khớp bản tóm tắt đang chờ.",
                        }
                    elif guarded and (successful_required_repair or terminal_success or confirmation_denied_stop) and not is_read:
                        result = {'status': 'mutation_tools_locked', 'message': 'The successful operation is complete; compose the response.'}
                    elif guarded and required_repair_tool and tool_name != required_repair_tool and not is_read:
                        result = {'status': 'conflicting_cart_operations', 'active_operation': required_repair_tool,
                                  'message': 'Repair the same denied operation before another write.'}
                    elif executor:
                        if guarded:
                            # No TypeError retry: an exception may happen after
                            # a committed write. Gateway errors must propagate.
                            result = executor(tool_args, session_id)
                        else:
                            try:
                                try:
                                    result = executor(tool_args, session_id)
                                except TypeError:
                                    result = executor(tool_args)
                            except Exception as ex:
                                result = {"status": "error", "message": str(ex)}
                    else:
                        result = ({'status': 'capability_not_available', 'message': 'This capability is not exposed in the current business state.'}
                                  if guarded else {"status": "error", "message": f"Tool '{tool_name}' không tồn tại."})

                    # Lưu vào cache
                    if not guarded or (not is_read and isinstance(result, dict) and not result.get('read_only') and result.get('status') in {
                            'ok', 'success', 'already_processed', 'needs_options', 'require_confirmation'}):
                        turn_tool_cache[tool_hash] = result
                if guarded and isinstance(result, dict):
                    if (protocol_repair_round and (tool_name == 'customer_actions' or batch_results is not None)
                            and result.get('status') == 'ok' and result.get('read_only') is True
                            and result.get('repaired_read_completed') is True
                            and not result.get('selection_continuation_required')
                            and result.get('repaired_action_id') and result.get('remaining_actions') == 0):
                        successful_required_repair = True
                    if result.get('recovery_kind') == 'model_repair':
                        recoverable_write_denial = True
                        protocol_repair_requested = True
                    if result.get('same_turn_read_reused'):
                        repeated_signature, repeated_tool_result = True, result
                    if result.get('status') in {'ok', 'success', 'already_processed', 'require_confirmation'} and not is_read:
                        mutation_succeeded |= result.get('changed') is not False
                        terminal_success |= (tool_name in {'request_checkout', 'confirm_checkout'} or (
                            tool_name in {'resolve_location', 'select_location_candidate'}
                            and result.get('status') == 'require_confirmation' and bool(result.get('order_summary'))))
                    if tool_name == 'confirm_checkout' and result.get('status') not in {'ok', 'success', 'already_processed'}:
                        if result.get('recovery_tool') in {'request_checkout', 'confirm_checkout'}:
                            required_repair_tool = result['recovery_tool']
                            recoverable_write_denial = True
                        else:
                            confirmation_denied_stop = True

                tool_calls_log.append({"tool": tool_name, "args": tool_args, "round": round_idx, "result": result})
                if (guarded and isinstance(result, dict) and result.get("status") in {
                        "unknown_product_reference", "cart_reference_conflict",
                        "pending_quantity_conflict", "cart_quantity_conflict",
                        "checkout_choice_conflict", "voucher_selection_conflict", "conflicting_cart_operations"}):
                    recoverable_write_denial = True
                    if result.get("status") == "conflicting_cart_operations":
                        required_repair_tool = result.get("active_operation") or required_repair_tool or tool_name
                    else:
                        required_repair_tool = tool_name
                if (required_repair_tool and tool_name == required_repair_tool
                        and isinstance(result, dict)
                        and result.get("status") in {"ok", "success", "already_processed"}):
                    if result.get('remaining_cart_edits', 0):
                        required_repair_tool = None
                    else:
                        successful_required_repair = True
                if (guarded and required_repair_tool == 'request_checkout' and tool_name == 'request_checkout'
                        and isinstance(result, dict) and result.get('status') != 'require_confirmation'):
                    # A confirmation recovery gets one summary attempt. Failed
                    # stock/quote/prerequisite reads require customer guidance.
                    confirmation_denied_stop = True

                # Bắt tín hiệu checkout (Guardrail)
                if tool_name == "request_checkout" and isinstance(result, dict):
                    if result.get("status") == "require_confirmation":
                        checkout_payload = result.get("order_summary")

                # Complete projected evidence is separate from the retained full result.
                projected = (tool_result_projector(result, tool_name) if guarded and tool_result_projector
                             else tool_result_formatter(result) if tool_result_formatter else result)
                encoded_result = json.dumps(projected, ensure_ascii=False, separators=(',', ':'))
                if metrics is not None:
                    metrics['tool_result_chars'] = metrics.get('tool_result_chars', 0) + len(encoded_result)
                # Thêm tool result vào messages
                import json as _json
                current_messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "name": tc.function.name,
                    "content": encoded_result,
                })

            if (guarded and customer_step_response_provider and not confirmation_denied_stop
                    and (not required_repair_tool or required_repair_tool == 'customer_actions'
                        and successful_required_repair and not protocol_repair_requested)):
                rendered = customer_step_response_provider()
                if rendered:
                    return {'reply': rendered, 'tool_calls_log': tool_calls_log,
                            'checkout_payload': checkout_payload, 'error': None}
            if (protocol_repair_round and not protocol_repair_requested
                    and not successful_required_repair
                    and not (repair_progress_provider and repair_progress_provider())):
                # A valid but unrelated read does not complete the failed
                # request. A fresh canonical discovery may still require a
                # normal selection/configuration step; the repair count stays
                # unchanged and any second protocol fault is still terminal.
                return {'reply': '', 'tool_calls_log': tool_calls_log, 'checkout_payload': checkout_payload,
                        'error': 'semantic_repair_exhausted'}
            if protocol_repair_requested:
                if protocol_repairs >= 1:
                    return {'reply': '', 'tool_calls_log': tool_calls_log, 'checkout_payload': checkout_payload,
                            'error': 'semantic_repair_exhausted'}
                protocol_repairs += 1
                provider_turn_health['semantic_repair_pending'] = True
                if metrics is not None:
                    metrics['protocol_repair_count'] = protocol_repairs
            else:
                provider_turn_health['semantic_repair_pending'] = False
            if recoverable_write_denial:
                semantic_repairs += 1
            if successful_required_repair or terminal_success or confirmation_denied_stop:
                # Subsequent inference has no executors and cannot replay a write.
                force_tools_disabled = True
                force_tool_required = False
                required_repair_tool = None
                current_messages.append({'role': 'system', 'content':
                    'The operation is complete or requires customer clarification. Answer from its evidence; no more tools.'})
            elif repeated_signature:
                feedback = (repeated_read_feedback_provider() if guarded
                    and repeated_read_feedback_provider and not read_completion_repairs
                    and not mutation_succeeded and not required_repair_round else None)
                if feedback:
                    read_completion_repairs += 1
                    semantic_repairs += 1
                    if metrics is not None:
                        metrics['read_completion_repair_count'] = read_completion_repairs
                # Keep one chance to dispatch an unresolved selection. It uses
                # the existing round budget, and also permits a read-only final
                # answer; a pending draft never grants mutation permission.
                force_tools_disabled = not required_repair_round and not feedback
                force_tool_required = required_repair_round
                current_messages.append({
                    "role": "system",
                    "content": feedback or ("That read has already been performed. Correct the previously denied write using its "
                                "structured recovery fields; do not repeat the read."
                                if required_repair_round else
                                "Use the tool results already provided and answer the user now. Do not request another tool."),
                })
            elif recoverable_write_denial:
                # A safety denial is actionable protocol feedback, not a
                # customer-facing outcome. Require the next response to repair
                # the same write immediately so a prose attempt does not waste
                # a tool-loop round. Exact recovery fields are in the tool
                # result directly above; the gateway still revalidates them.
                force_tool_required = True
                current_messages.append({
                    "role": "system",
                    "content": ("The proposal needs correction using server feedback. "
                                "Retry only failed/unexecuted actions using the structured recovery fields; successful actions are already applied. "
                                "Do not switch operation types and do not answer with prose yet."),
                })
            elif required_repair_tool:
                # A harmless read does not satisfy a pending write repair.
                # Keep the loop constrained until the originally denied
                # operation succeeds or the bounded tool budget is exhausted.
                force_tool_required = True
                current_messages.append({
                    "role": "system",
                    "content": (f"The required {required_repair_tool} correction is still pending. "
                                "Call that operation now using the structured recovery fields; "
                                "do not answer with prose yet."),
                })
            elif discovery_completion_provider and discovery_completion_provider():
                force_tools_disabled = True
                force_tool_required = False
                current_messages.append({'role': 'system', 'content':
                    'The declared discovery plan or complementary ranked reads are complete. '
                    'Synthesize the final JSON and display selection from these batches; no more tools.'})
            # Tiếp tục vòng lặp để Groq đọc kết quả tool
            continue

        # A structured action mistakenly placed in final JSON has no write
        # authority. Journal its intent before the bounded tool-only repair so
        # a corrected first action cannot erase still-pending siblings.
        if guarded and semantic_proposal_stager and not force_tools_disabled:
            staged = semantic_proposal_stager((assistant_msg.content or '').strip())
            if staged:
                if protocol_repairs >= 1:
                    return {'reply': '', 'tool_calls_log': tool_calls_log, 'checkout_payload': checkout_payload,
                            'error': 'semantic_repair_exhausted'}
                protocol_repairs += 1
                if metrics is not None:
                    metrics['protocol_repair_count'] = protocol_repairs
                provider_turn_health['semantic_repair_pending'] = True
                force_tool_required = True
                required_repair_tool = 'customer_actions'
                current_messages.append({'role': 'system', 'content':
                    'Actions in prose were NOT executed. Call customer_actions with ONLY the failed action corrected. '
                    'Server retains siblings. Ignore unverified reply/mutation claims. ' + json.dumps(staged, ensure_ascii=False)})
                continue
        if guarded and provider_turn_health.get('semantic_repair_pending'):
            return {'reply': '', 'tool_calls_log': tool_calls_log, 'checkout_payload': checkout_payload,
                    'error': 'semantic_repair_exhausted'}

        # ── Case 2: Groq trả về text → kết thúc ──────────────────────────
        reply_text = (assistant_msg.content or "").strip()
        issue = final_response_validator(reply_text) if final_response_validator else None
        if issue:
            logger.info('[AgentResponseValidation] round=%d category=%s executed_tool_count=%d',
                round_idx, str(issue).split(':', 1)[0] if str(issue).startswith(('FORMAT_REQUIRED:', 'TOOL_REQUIRED:')) else 'response_contract',
                len(tool_calls_log))
            if (guarded and not tool_calls_log and str(issue).startswith('FORMAT_REQUIRED:')
                    and (not final_response_repair_allowed or final_response_repair_allowed(issue))):
                if dialogue_format_repairs or round_idx >= max_tool_rounds:
                    return {'reply': '', 'tool_calls_log': [], 'checkout_payload': None,
                            'error': 'response_evidence_required'}
                dialogue_format_repairs += 1
                dialogue_format_repair_active = True
                force_tools_disabled, force_tool_required = True, False
                if metrics is not None:
                    metrics['dialogue_format_repair_count'] = dialogue_format_repairs
                current_messages.append({'role': 'system', 'content': issue})
                continue
            if dialogue_format_repair_active:
                # A now-typed business request still needs authority. A format
                # repair neither supplies facts nor closes business intent.
                if str(issue).startswith('TOOL_REQUIRED:') and round_idx < max_tool_rounds:
                    dialogue_format_repair_active = False
                    force_tools_disabled, force_tool_required = False, True
                    current_messages.append({'role': 'system', 'content': issue})
                    continue
                return {'reply': '', 'tool_calls_log': tool_calls_log, 'checkout_payload': checkout_payload,
                        'error': 'response_evidence_required'}
            if (guarded and final_response_repair_allowed and final_response_repair_allowed(issue)):
                if not final_envelope_repairs:
                    final_envelope_repairs = 1
                    final_envelope_repair_active = True
                    force_tools_disabled, force_tool_required, required_repair_tool = True, False, None
                    if metrics is not None:
                        metrics['final_envelope_repair_count'] = 1
                    if final_response_repair_context_provider:
                        current_messages = final_response_repair_context_provider(current_messages)
                    current_messages.append({'role': 'system', 'content': issue})
                    continue
                return {'reply': '', 'tool_calls_log': tool_calls_log, 'checkout_payload': checkout_payload,
                        'error': 'response_evidence_required'}
            if final_envelope_repair_active:
                return {'reply': '', 'tool_calls_log': tool_calls_log, 'checkout_payload': checkout_payload,
                        'error': 'response_evidence_required'}
            if round_idx < max_tool_rounds and not force_tools_disabled:
                semantic_repairs += 1
                force_tool_required = str(issue).startswith('TOOL_REQUIRED:')
                if guarded and mutation_succeeded and not force_tool_required:
                    force_tools_disabled = True  # Envelope/prose repair cannot mutate again.
                current_messages.append({'role': 'system', 'content': issue})
                continue
            return {'reply': '', 'tool_calls_log': tool_calls_log, 'checkout_payload': checkout_payload,
                    'error': 'response_evidence_required'}
        logger.info("[Groq Agent] Final reply after %d tool rounds, len=%d", round_idx, len(reply_text))
        return {
            "reply": reply_text,
            "tool_calls_log": tool_calls_log,
            "checkout_payload": checkout_payload,
            "error": None,
        }

    # Đã hết max_tool_rounds mà chưa có text reply
    logger.warning("[Groq Agent] Max tool rounds (%d) exceeded without text reply", max_tool_rounds)
    return {
        "reply": "" if guarded else "Xin lỗi, mình cần thêm thông tin để hỗ trợ bạn. Bạn có thể nói rõ hơn về yêu cầu không?",
        "tool_calls_log": tool_calls_log,
        "checkout_payload": checkout_payload,
        "error": "max_rounds_exceeded",
    }


# ─── STT: Whisper-large-v3-turbo (Vietnamese support) ────────────────────────

GROQ_STT_MODEL = "whisper-large-v3-turbo"


def groq_transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm",
                           language: str = "vi") -> Optional[str]:
    """
    Transcribe audio using Groq Whisper. Supports Vietnamese (vi) and 99+ langs.
    audio_bytes: raw bytes from expo-av or MediaRecorder
    filename:    hint for format detection (audio.webm / audio.m4a / audio.wav)
    Returns transcript text or None.
    """
    client = _get_groq_client()
    if client is None:
        logger.warning("[Groq] STT skipped: no client")
        return None
    try:
        transcript = client.audio.transcriptions.create(
            model=GROQ_STT_MODEL,
            file=(filename, audio_bytes),
            language=language,
            response_format="text",
        )
        text = str(transcript).strip() if transcript else ""
        logger.info("[Groq] STT OK len=%d", len(text))
        return text
    except Exception as e:
        logger.error("[Groq] STT error: %s", str(e)[:200])
        return None


# ─── Order Intent Extraction ──────────────────────────────────────────────────

_ORDER_SYSTEM_PROMPT = """Bạn là AI đặt đồ uống cho chuỗi cà phê Avengers Coffee.
Nhiệm vụ: Phân tích tin nhắn khách và trả về JSON đúng schema dưới đây.

QUAN TRỌNG: Chỉ trả về JSON hợp lệ, KHÔNG kèm text khác, KHÔNG markdown fence.

Schema:
{
  "intent": "ORDER" | "QUERY" | "OTHER",
  "items": [
    {
      "product_name": "tên sản phẩm normalize (vd: Cà Phê Sữa Đá)",
      "quantity": 1,
      "size": "S" | "M" | "L" | null,
      "note": "ít đường, thêm trân châu, ít đá, thanh toán tiền mặt..." | null
    }
  ],
  "delivery_type": "DELIVERY" | "PICKUP" | null,
  "payment_method": "TIEN_MAT" | "VNPAY" | "ZALOPAY" | "THANH_TOAN_KHI_NHAN_HANG" | null,
  "branch_hint": "tên chi nhánh nếu khách đề cập" | null,
  "raw_text": "câu gốc"
}

Quy tắc CỰC KỲ QUAN TRỌNG:
1. Trả về intent="ORDER" KHI VÀ CHỈ KHI khách có lệnh chốt đơn dứt khoát (ví dụ: "chốt đơn", "tiến hành đặt hàng", "đặt ngay", "oke đặt đi"). Nếu trả về intent="ORDER", bạn PHẢI dựa vào LỊCH SỬ CHAT để lấy đúng tên món, size, đá đường, thanh toán mà khách đã chọn trước đó.
2. Trả về intent="QUERY" nếu khách đang hỏi menu, nói muốn mua gì đó nhưng chưa nói lệnh chốt đơn rõ ràng (ví dụ: "cho tôi cà phê", "tôi lấy 1 đen đá", "cho mình đặt 1 trà sữa"). intent="QUERY" sẽ nhường lại cho Tư vấn viên AI trả lời và tiếp tục hỏi khách chọn size, hình thức thanh toán.
3. Normalize tên: "cf sữa"→"Cà Phê Sữa", "latte"→"Latte". Với số lượng: "hai ly"→2.
"""


def groq_extract_order_intent(user_text: str, history: str = "") -> Optional[Dict[str, Any]]:
    """
    Extract order intent + items from natural language using Groq Llama.
    Returns parsed dict or None.
    """
    if not user_text or not user_text.strip():
        return None

    prompt = f'Lịch sử chat:\n{history}\n\nTin nhắn hiện tại của khách:\n"{user_text.strip()}"'
    raw = groq_chat(
        system_prompt=_ORDER_SYSTEM_PROMPT,
        user_prompt=prompt,
        max_tokens=400,
    )
    if not raw:
        return None

    # Strip markdown fences (```json ... ```)
    cleaned = re.sub(r"```(?:json)?|```", "", raw).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Extract first {...} block from response
        m = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if m:
            try:
                return json.loads(m.group())
            except Exception:
                pass

    logger.warning("[Groq] Cannot parse order intent JSON from: %s", raw[:200])
    return None


# ─── Product Fuzzy Matching ───────────────────────────────────────────────────

def _norm_text(text: str) -> str:
    """Unicode normalize + lowercase + remove diacritics."""
    nfd = unicodedata.normalize("NFD", str(text).lower())
    stripped = "".join(c for c in nfd if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", stripped).strip()


def match_products_to_db(
    intent_items: List[Dict[str, Any]],
    db_products: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Fuzzy-match AI-extracted item names to real DB products.
    Uses word-overlap score. Returns enriched list.
    """
    results = []
    for item in intent_items:
        raw_name = _norm_text(item.get("product_name", ""))
        raw_words = set(raw_name.split())
        best_product = None
        best_score = 0

        for p in db_products:
            p_name = _norm_text(p.get("ten_san_pham", ""))
            p_words = set(p_name.split())
            overlap = len(raw_words & p_words)
            # Bonus: substring match
            if raw_name in p_name or p_name in raw_name:
                overlap += 2
            if overlap > best_score:
                best_score = overlap
                best_product = p

        qty = max(1, int(item.get("quantity") or 1))
        price = float(best_product["gia_ban"]) if best_product and best_score > 0 else 0.0
        results.append({
            "requested_name": item.get("product_name"),
            "quantity":       qty,
            "size":           item.get("size"),
            "note":           item.get("note"),
            "matched":        best_score > 0,
            "product_id":     str(best_product["ma_san_pham"]) if best_product and best_score > 0 else None,
            "product_name":   str(best_product["ten_san_pham"]) if best_product and best_score > 0 else item.get("product_name"),
            "price":          price,
            "subtotal":       price * qty,
            "image_url":      str(best_product.get("hinh_anh_url") or "") if best_product else "",
        })
    return results
