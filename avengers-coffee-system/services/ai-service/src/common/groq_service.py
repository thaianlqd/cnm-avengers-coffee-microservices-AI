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

class OpenRouterCompletions:
    def __init__(self, api_key):
        self.api_key = api_key
        
    def create(self, model, messages, tools=None, tool_choice="auto", max_tokens=2048, temperature=0.1):
        import requests
        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature
        }
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
        for fallback_model in fallback_models:
            payload["model"] = fallback_model
            resp = requests.post("https://openrouter.ai/api/v1/chat/completions", json=payload, headers=headers)
            if resp.ok:
                return FakeResponse(resp.json())
            last_resp = resp
            if resp.status_code != 404 and "No endpoints found" not in resp.text:
                # If it's a real error (like 401 Unauthorized or 402 Payment Required), stop immediately
                break
                
        raise Exception(f"OpenRouter API error {last_resp.status_code}: {last_resp.text}")

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
        
    def create(self, model, messages, tools=None, tool_choice="auto", max_tokens=2048, temperature=0.1):
        import requests
        payload = {
            "model": "gemini-3.6-flash",
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = tool_choice
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        resp = requests.post("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", json=payload, headers=headers)
        if resp.ok:
            return FakeResponse(resp.json())
        raise Exception(f"Gemini API error {resp.status_code}: {resp.text}")

class GeminiChat:
    def __init__(self, api_key):
        self.completions = GeminiCompletions(api_key)

class GeminiClient:
    def __init__(self, api_key):
        self.chat = GeminiChat(api_key)
        self.base_url = "https://generativelanguage.googleapis.com/v1beta/openai/"

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

# Danh sách model fallback cứng (dùng khi không gọi được models.list())
GROQ_MODELS_FALLBACK = [
    "llama-3.3-70b-versatile",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.8-27b",
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

    try:
        models = client.models.list().data
        available_ids = [m.id for m in models]
        logger.info("[Groq] Available models: %s", available_ids)
        for preferred in GROQ_MODELS_FALLBACK:
            if preferred in available_ids and preferred not in _banned_models_until:
                _selected_chat_model = preferred
                logger.info("[Groq] Selected chat model from API: %s", _selected_chat_model)
                return _selected_chat_model
        
        # Nếu không có model nào trong preferred list, ta lấy đại model đầu tiên có chữ gpt hoặc qwen hoặc llama
        for av_model in available_ids:
            if av_model not in _banned_models_until and ("gpt" in av_model or "qwen" in av_model or "llama" in av_model):
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
    max_tool_rounds: int = 3,
    max_tokens: int = 400,
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
    client = _get_groq_client()
    if client is None:
        return {"reply": "", "tool_calls_log": [], "checkout_payload": None, "error": "Groq client unavailable"}

    tool_calls_log = []
    checkout_payload = None
    current_messages = list(messages)
    turn_tool_cache = {}

    # Resolve model một lần duy nhất cho cả cuộc hội thoại (cached sau lần đầu)
    model = _resolve_chat_model(client)
    if model is None:
        return {
            "reply": "",
            "tool_calls_log": [],
            "checkout_payload": None,
            "error": "No usable Groq chat model found for this API key.",
        }

    for round_idx in range(max_tool_rounds + 1):
        resp = None
        
        # ── Retry qua các Client nếu gặp lỗi ──
        success = False
        last_err = ""
        for retry_idx in range(len(_llm_clients)):
            client = _get_groq_client()
            if client is None:
                break
                
            model = _resolve_chat_model(client)
            if model is None:
                logger.warning("[Groq Agent] Model None for current client, switching...")
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
                if tools:
                    kwargs["tools"] = tools
                    kwargs["tool_choice"] = "auto"
    
                resp = client.chat.completions.create(**kwargs)
                success = True
                break # Thành công thì thoát vòng lặp retry
                
            except Exception as e:
                t1 = time.perf_counter()
                err = str(e)
                last_err = err
                logger.warning("[Groq Agent] API error round=%d retry=%d (took %.2fs): %s", round_idx, retry_idx, t1 - t0, err[:120])
                
                if "413" in err or "too large" in err.lower():
                    logger.warning("[Groq Agent] Payload too large (413). Stripping history to prevent failure.")
                    # Keep only system message (index 0) and the very last message (user_message)
                    if len(current_messages) > 2:
                        current_messages = [current_messages[0], current_messages[-1]]
                        continue # Retry immediately with stripped messages
                    else:
                        return {"reply": "", "tool_calls_log": tool_calls_log, "checkout_payload": checkout_payload, "error": "Context window exceeded."}

                if "404" in err or "does not exist" in err or "decommissioned" in err:
                    global _selected_chat_model
                    _selected_chat_model = None
                
                if "429" in err or "rate_limit" in err.lower():
                    _banned_models_until[model] = time.time() + 60
                    _selected_chat_model = None
                    logger.warning("[Groq Agent] Model %s rate limited, banning for 60s.", model)

                if "400" in err and "tool calling" in err.lower():
                    _banned_models_until[model] = time.time() + 86400  # Ban 1 ngày vì model này không hỗ trợ tool
                    _selected_chat_model = None
                    logger.warning("[Groq Agent] Model %s doesn't support tools, banning for 1 day.", model)
                    
                switch_groq_client()
                continue
                
        if not success or not resp:
            # Nếu chạy hết các client mà vẫn lỗi (hoặc mất mạng)
            logger.error("[Groq Agent] All clients failed in round=%d. Last error: %s", round_idx, last_err)
            return {"reply": "Hệ thống đang quá tải hoặc hết token, vui lòng thử lại sau ít phút.", "tool_calls_log": tool_calls_log, "checkout_payload": checkout_payload,
                    "error": "rate_limit" if ("rate_limit" in last_err.lower() or "429" in last_err or "402" in last_err) else "All LLM clients failed."}

        choice = resp.choices[0]
        assistant_msg = choice.message

        # ── Case 1: Groq muốn gọi Tool ────────────────────────────────────
        if assistant_msg.tool_calls:
            # Thêm assistant message (chứa tool_calls) vào lịch sử
            current_messages.append({
                "role": "assistant",
                "content": assistant_msg.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in assistant_msg.tool_calls
                ],
            })

            # Thực thi từng tool call
            for tc in assistant_msg.tool_calls:
                tool_name = tc.function.name
                try:
                    import json as _json
                    tool_args_str = tc.function.arguments or "{}"
                    tool_args = _json.loads(tool_args_str)
                except Exception:
                    tool_args_str = "{}"
                    tool_args = {}

                # Chống lặp tool: kiểm tra hash cache
                tool_hash = f"{tool_name}_{tool_args_str}"
                if tool_hash in turn_tool_cache:
                    logger.info("[Groq Agent] Cache Hit! Trả ngay kết quả tool đã gọi: %s", tool_hash)
                    result = turn_tool_cache[tool_hash]
                else:
                    logger.info("[Groq Agent] Tool call round=%d: %s args=%s", round_idx, tool_name, tool_args)
                    
                    # Dispatch đến executor
                    executor = (tool_executors or {}).get(tool_name)
                    if executor:
                        try:
                            try:
                                result = executor(tool_args, session_id)
                            except TypeError:
                                result = executor(tool_args)
                        except Exception as ex:
                            result = {"status": "error", "message": str(ex)}
                    else:
                        result = {"status": "error", "message": f"Tool '{tool_name}' không tồn tại."}
                    
                    # Lưu vào cache
                    turn_tool_cache[tool_hash] = result

                tool_calls_log.append({"tool": tool_name, "args": tool_args, "round": round_idx, "result": result})

                # Bắt tín hiệu checkout (Guardrail)
                if tool_name == "request_checkout" and isinstance(result, dict):
                    if result.get("status") == "require_confirmation":
                        checkout_payload = result.get("order_summary")

                # Thêm tool result vào messages
                import json as _json
                current_messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "name": tc.function.name,
                    "content": _json.dumps(result, ensure_ascii=False),
                })

            # Tiếp tục vòng lặp để Groq đọc kết quả tool
            continue

        # ── Case 2: Groq trả về text → kết thúc ──────────────────────────
        reply_text = (assistant_msg.content or "").strip()
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
        "reply": "Xin lỗi, mình cần thêm thông tin để hỗ trợ bạn. Bạn có thể nói rõ hơn về yêu cầu không?",
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
