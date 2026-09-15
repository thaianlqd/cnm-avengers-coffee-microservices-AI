"""
guardrails.py
-------------
Phase 3: AI Guardrails — Bảo vệ hệ thống AI khỏi các hành vi không mong muốn.

Bao gồm 3 lớp bảo vệ:
  Lớp 1 — Input Filter:   Phát hiện prompt injection, yêu cầu giảm giá phi lý,
                           nội dung độc hại trước khi gửi lên LLM.
  Lớp 2 — Output Validator: Kiểm tra reply có hợp lệ không, không chứa cam kết
                             nguy hiểm hay thông tin nhạy cảm.
  Lớp 3 — Business Rules:  Validate dữ liệu đơn hàng (đã có trong cart_manager
                           và execute_request_checkout — không cần thêm).
"""
import logging
import re
import time
import unicodedata
from collections import defaultdict
from typing import Optional, Tuple

logger = logging.getLogger(__name__)


# ─── Text normalization helper ────────────────────────────────────────────────

def _norm(text: str) -> str:
    """Bỏ dấu + lowercase để match pattern tiếng Việt không phân biệt dấu."""
    nfd = unicodedata.normalize("NFD", text.lower())
    no_accent = "".join(c for c in nfd if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", no_accent).strip()


# ─── LỚP 1: INPUT FILTER ─────────────────────────────────────────────────────

# Prompt injection patterns (tiếng Anh + tiếng Việt)
_INJECTION_PATTERNS = [
    r"ignore\s+(previous|all|your)\s+instructions?",
    r"forget\s+(you\s+are|everything|your\s+role)",
    r"act\s+as\s+(dan|jailbreak|evil|unrestricted)",
    r"you\s+are\s+now\s+",
    r"pretend\s+(you\s+are|to\s+be)",
    r"new\s+instructions?:",
    r"system\s+prompt",
    r"reveal\s+(your\s+)?(api\s+key|secret|password|token|prompt)",
    r"print\s+(your\s+)?(system\s+prompt|instructions)",
    r"bỏ\s+qua\s+(hướng\s+dẫn|quy\s+tắc|lệnh)",
    r"giả\s+vờ\s+bạn\s+là",
    r"quên\s+(đi\s+)?(bạn\s+là|vai\s+trò|nhiệm\s+vụ)",
    r"lệnh\s+mới",
    r"hướng\s+dẫn\s+mới",
]

# Yêu cầu giảm giá phi lý / đòi đồ miễn phí
_PRICE_MANIPULATION_PATTERNS = [
    r"(cho|tặng|biếu|give)\s+(tôi|mình|em|anh|chị|me)\s+(đồ\s+)?miễn\s+phí",
    r"không\s+(tính|thu|lấy)\s+tiền",
    r"(bán|bán cho|bán bằng)\s+giá\s+(0|không)",
    r"giảm\s+giá\s+(100|90|80|70|60|50)\s*%",
    r"free\s+(đi|đồ|nước|cà\s+phê)",
    r"khỏi\s+trả\s+tiền",
    r"(đừng|không\s+cần)\s+(tính|thu)\s+tiền",
    r"hack\s+(giá|hệ\s+thống)",
    r"bypass\s+payment",
    r"(inject|sql|drop\s+table|select\s+\*)",
]

# Nội dung độc hại / chửi bậy (pattern đơn giản, chỉ bắt các trường hợp rõ ràng)
_HARMFUL_PATTERNS = [
    r"\b(fuck|shit|ass|bitch|dick|cunt)\b",
    r"đ[uù]t|đ[íi]t|lồn|cặc|buồi|chịch|đ[eề]o|mẹ\s*ki[eê]p",
    r"(giết|đánh|đập|bạo\s+lực|đe\s+dọa)\s+(bạn|tôi|mày|mình|nhân\s+viên)",
    r"khủng\s+bố|đánh\s+bom",
]

# Bộ đếm request để rate limit đơn giản (in-memory, reset khi restart)
_rate_limit_store: dict = defaultdict(lambda: {"count": 0, "window_start": 0.0})
_RATE_LIMIT_MAX = 30       # requests per window
_RATE_LIMIT_WINDOW = 60.0  # seconds


def check_input(message: str, session_id: str = "") -> Tuple[bool, Optional[str]]:
    """
    Lớp 1 — Input Filter. Kiểm tra message của khách trước khi gửi lên LLM.

    Args:
        message:    Tin nhắn của khách hàng.
        session_id: ID phiên để rate limit.

    Returns:
        (is_safe, block_reason)
        - is_safe=True  → an toàn, tiếp tục xử lý bình thường.
        - is_safe=False → bị chặn, block_reason là lý do.
    """
    if not message or not message.strip():
        return False, "empty_message"

    msg_norm = _norm(message)

    # 1. Rate limiting
    if session_id:
        now = time.time()
        entry = _rate_limit_store[session_id]
        if now - entry["window_start"] > _RATE_LIMIT_WINDOW:
            entry["count"] = 0
            entry["window_start"] = now
        entry["count"] += 1
        if entry["count"] > _RATE_LIMIT_MAX:
            logger.warning("[Guardrails] Rate limit exceeded for session=%s", session_id)
            return False, "rate_limit"

    # 2. Prompt injection
    for pattern in _INJECTION_PATTERNS:
        if re.search(pattern, msg_norm, re.IGNORECASE):
            logger.warning("[Guardrails] Prompt injection detected: session=%s pattern=%s", session_id, pattern)
            return False, "prompt_injection"

    # 3. Yêu cầu giảm giá phi lý / đòi free
    for pattern in _PRICE_MANIPULATION_PATTERNS:
        if re.search(pattern, msg_norm, re.IGNORECASE):
            logger.warning("[Guardrails] Price manipulation detected: session=%s", session_id)
            return False, "price_manipulation"

    # 4. Nội dung độc hại
    for pattern in _HARMFUL_PATTERNS:
        if re.search(pattern, message, re.IGNORECASE):  # Dùng message gốc để bắt ký tự đặc biệt
            logger.warning("[Guardrails] Harmful content detected: session=%s", session_id)
            return False, "harmful_content"

    return True, None


# ─── LỚP 2: OUTPUT VALIDATOR ──────────────────────────────────────────────────

# Pattern phát hiện AI đang cam kết điều ngoài phạm vi
_UNSAFE_OUTPUT_PATTERNS = [
    r"(tôi\s+sẽ\s+)?(hoàn\s+tiền|refund)\s+(ngay|cho\s+bạn\s+ngay)",
    r"bạn\s+(sẽ\s+)?được\s+giảm\s+giá\s+\d+\s*%",
    r"(tôi\s+)?(xác\s+nhận|đảm\s+bảo)\s+(giá|giảm\s+giá)",
    r"miễn\s+phí\s+(hoàn\s+toàn|tất\s+cả)",
    r"api[_\s]?key\s*[:=]\s*\S+",    # Lộ API key
    r"password\s*[:=]\s*\S+",         # Lộ password
    r"(gsk|sk-ant|AIza)\w{10,}",      # Pattern API key thật
]

_SAFE_FALLBACK_REPLY = (
    "Xin lỗi, mình không thể xử lý yêu cầu này. "
    "Bạn có thể liên hệ trực tiếp với nhân viên tại quán để được hỗ trợ tốt hơn nhé!"
)


def check_output(reply: str) -> Tuple[str, bool]:
    """
    Lớp 2 — Output Validator. Kiểm tra reply của LLM trước khi trả về client.

    Args:
        reply: Câu trả lời do LLM sinh ra.

    Returns:
        (safe_reply, was_modified)
        - safe_reply: Reply đã được kiểm tra/thay thế nếu cần.
        - was_modified: True nếu reply bị thay đổi.
    """
    if not reply:
        return reply, False

    reply_norm = _norm(reply)

    for pattern in _UNSAFE_OUTPUT_PATTERNS:
        if re.search(pattern, reply_norm, re.IGNORECASE) or re.search(pattern, reply, re.IGNORECASE):
            logger.warning("[Guardrails] Unsafe output detected, replacing with safe fallback.")
            return _SAFE_FALLBACK_REPLY, True

    return reply, False


# ─── SAFE REPLIES cho từng loại vi phạm ──────────────────────────────────────

_BLOCK_MESSAGES = {
    "prompt_injection": (
        "Xin lỗi, mình không thể thực hiện yêu cầu này. "
        "Mình ở đây để giúp bạn đặt đồ uống tại Avengers Coffee. "
        "Bạn muốn xem menu hay đặt món gì không?"
    ),
    "price_manipulation": (
        "Giá tại Avengers Coffee là giá niêm yết cố định. "
        "Các chương trình khuyến mãi được thông báo chính thức qua app và website. "
        "Bạn muốn xem các món đang có khuyến mãi không?"
    ),
    "harmful_content": (
        "Mình không thể phản hồi nội dung này. "
        "Bạn cần hỗ trợ đặt đồ uống thì mình luôn sẵn sàng giúp nhé!"
    ),
    "rate_limit": (
        "Bạn đã gửi quá nhiều tin nhắn trong một thời gian ngắn. "
        "Vui lòng đợi vài giây rồi thử lại nhé!"
    ),
    "empty_message": (
        "Mình chưa nhận được tin nhắn của bạn. Bạn muốn hỏi gì không?"
    ),
}


def get_block_reply(reason: str) -> str:
    """Trả về câu trả lời an toàn tương ứng với lý do bị chặn."""
    return _BLOCK_MESSAGES.get(reason, _SAFE_FALLBACK_REPLY)
