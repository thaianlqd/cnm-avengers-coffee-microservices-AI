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
import unicodedata
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ─── Groq client (lazy init) ──────────────────────────────────────────────────
_groq_client = None


def _get_groq_client():
    global _groq_client
    if _groq_client is not None:
        return _groq_client
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key or api_key == "your_groq_api_key_here":
        return None
    try:
        from groq import Groq
        _groq_client = Groq(api_key=api_key)
        logger.info("[Groq] Client initialized OK")
        return _groq_client
    except Exception as e:
        logger.warning("[Groq] Cannot init client: %s", e)
        return None


def groq_is_available() -> bool:
    return _get_groq_client() is not None


# ─── Chat: Llama-3.3-70b-versatile ───────────────────────────────────────────

GROQ_CHAT_MODEL = "llama-3.3-70b-versatile"   # 30k context, free
GROQ_FAST_MODEL = "llama-3.1-8b-instant"       # ultra-fast fallback


def groq_chat(system_prompt: str, user_prompt: str, max_tokens: int = 512) -> Optional[str]:
    """
    Call Groq Llama chat. Returns reply text or None on failure.
    Tries 70b first, falls back to 8b if rate-limited.
    """
    client = _get_groq_client()
    if client is None:
        return None

    for model in [GROQ_CHAT_MODEL, GROQ_FAST_MODEL]:
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
            logger.info("[Groq] chat OK model=%s tokens=%s", model,
                        getattr(resp.usage, "total_tokens", "?"))
            return reply
        except Exception as e:
            err = str(e)
            if "rate_limit" in err.lower() or "429" in err:
                logger.warning("[Groq] Rate-limited on %s, trying fallback: %s", model, err[:120])
                continue
            logger.error("[Groq] chat error model=%s: %s", model, err[:200])
            return None

    logger.warning("[Groq] All chat models rate-limited")
    return None


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
      "note": "ít đường, thêm trân châu, ít đá..." | null
    }
  ],
  "delivery_type": "DELIVERY" | "PICKUP" | null,
  "branch_hint": "tên chi nhánh nếu khách đề cập" | null,
  "raw_text": "câu gốc"
}

Nếu khách hỏi (menu, giá, khuyến mãi...) thì intent="QUERY", items=[].
Normalize tên: "cf sữa"→"Cà Phê Sữa", "latte"→"Latte", "trà đào"→"Trà Đào".
Với số lượng: "hai ly"→2, "một"→1, "3 cái"→3."""


def groq_extract_order_intent(user_text: str) -> Optional[Dict[str, Any]]:
    """
    Extract order intent + items from natural language using Groq Llama.
    Returns parsed dict or None.
    """
    if not user_text or not user_text.strip():
        return None

    prompt = f'Phân tích câu sau:\n"{user_text.strip()}"'
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
