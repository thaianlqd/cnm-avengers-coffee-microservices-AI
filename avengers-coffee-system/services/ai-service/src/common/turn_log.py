import os
import queue
import threading
import json
import re
import hashlib
import logging
import unicodedata
from typing import Dict, Any, Optional, List
from sqlalchemy import text
from src.common.db import get_db_engine

logger = logging.getLogger(__name__)

_log_queue = queue.Queue(maxsize=200)
_worker_thread = None
_db_initialized = False
_db_lock = threading.Lock()
_worker_lock = threading.Lock()
_dropped_logs_count = 0

def _ensure_table():
    global _db_initialized
    if _db_initialized: return
    
    with _db_lock:
        if _db_initialized: return
        try:
            engine = get_db_engine()
            with engine.begin() as conn:
                conn.execute(text('''
                    CREATE TABLE IF NOT EXISTS ai_turn_log (
                        id SERIAL PRIMARY KEY,
                        created_at TIMESTAMP DEFAULT NOW(),
                        session_id_short VARCHAR(50),
                        user_msg TEXT,
                        state_before JSONB,
                        gate_name VARCHAR(100),
                        reply TEXT,
                        tool_calls JSONB,
                        model_name VARCHAR(100),
                        latency_ms INT,
                        conversation_id VARCHAR(100),
                        bot_history JSONB
                    )
                '''))
            _db_initialized = True
        except Exception as e:
            logger.warning(f"Failed to create ai_turn_log table: {e}")

def _remove_accents(s: str) -> str:
    s = s.replace("đ", "d").replace("Đ", "D")
    return "".join(c for c in unicodedata.normalize('NFKD', s) if unicodedata.category(c) != 'Mn')

def _mask_pii(text_str: str, known_pii: Optional[List[str]] = None, last_bot_msg: str = "") -> str:
    """Che SĐT, địa chỉ và thông tin nhạy cảm."""
    if not isinstance(text_str, str): return text_str
    
    # 1. Mask exact known PII
    # Giới hạn đã biết: known_pii chỉ che khi khách gõ ĐÚNG NGUYÊN VĂN chuỗi địa chỉ đã lưu; nếu khách gõ tắt/viết khác thì không bị che.
    if known_pii:
        for pii in known_pii:
            if pii and isinstance(pii, str) and len(pii) > 3:
                safe_pii = re.escape(pii)
                text_str = re.sub(safe_pii, "***", text_str, flags=re.IGNORECASE)

    # 2. Mask entire message if the bot just asked for an address
    if last_bot_msg:
        last_bot_norm = _remove_accents(last_bot_msg).lower()
        if any(kw in last_bot_norm for kw in ["dia chi", "dang o dau", "giao den"]):
            return "***"

    # 3. Mask phone numbers
    # Ensure it only consumes the trailing digit, not trailing space
    text_str = re.sub(r'\b(?:\+?84|0)[-.\s]?(?:\d[-.\s]?){7,8}\d\b', r'***', text_str)
    
    # 4. Che địa chỉ có từ khóa (che luôn phần tên đường phía sau)
    text_str = re.sub(
        r'\b\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)*\s+(đường|phố|ngõ|hẻm|ngách|phường|quận)[^,.\n]*', 
        r'***', 
        text_str, 
        flags=re.IGNORECASE
    )
    
    # 5. Che dòng Địa chỉ giao trong reply
    text_str = re.sub(
        r'Địa chỉ giao:.*?(?=\n|$)', 
        r'Địa chỉ giao: ***', 
        text_str, 
        flags=re.IGNORECASE
    )
    return text_str

def _log_worker():
    global _dropped_logs_count
    while True:
        try:
            item = _log_queue.get()
            if item is None:
                break
            
            _ensure_table()
            
            engine = get_db_engine()
            with engine.begin() as conn:
                conn.execute(text('''
                    INSERT INTO ai_turn_log 
                    (session_id_short, user_msg, state_before, gate_name, reply, tool_calls, model_name, latency_ms, conversation_id, bot_history)
                    VALUES (:s, :u, CAST(:st AS JSONB), :g, :r, CAST(:tc AS JSONB), :m, :l, :c, CAST(:bh AS JSONB))
                '''), item)
            
            if _dropped_logs_count > 0:
                logger.warning(f"ai_turn_log queue recovered. Previously dropped {_dropped_logs_count} logs.")
                _dropped_logs_count = 0
                
        except Exception as e:
            logger.warning(f"Turn log worker error: {e}")
        finally:
            _log_queue.task_done()

def start_worker_if_needed():
    global _worker_thread
    with _worker_lock:
        if _worker_thread is None or not _worker_thread.is_alive():
            try:
                _worker_thread = threading.Thread(target=_log_worker, daemon=True)
                _worker_thread.start()
            except Exception as e:
                logger.warning(f"Failed to start turn log worker: {e}")

def log_turn_async(
    session_id: str,
    user_message: str,
    history: Optional[List[Dict[str, str]]],
    state_before: Dict[str, Any],
    gate_name: str,
    result: Dict[str, Any],
    model_name: Optional[str],
    latency_ms: int,
    known_pii: Optional[List[str]] = None
):
    """
    Retention: Log này lưu lịch sử chi tiết cho shadow/offline evaluation.
    Có thể dọn dẹp các bản ghi cũ hơn 30 ngày.
    """
    if os.getenv("TURN_LOG_ENABLED", "false").lower() != "true":
        return
        
    start_worker_if_needed()
    
    try:
        salt = os.getenv("TURN_LOG_SALT", "")
        parts = session_id.split(":conversation:")
        user_hash = hashlib.md5((parts[0] + salt).encode()).hexdigest()[:8]
        conv_hash = hashlib.md5((parts[1] + salt).encode()).hexdigest()[:8] if len(parts) > 1 else user_hash
        
        last_bot_msg = ""
        bot_history_list = []
        if history:
            assistant_msgs = [h.get("content", "") for h in history if h.get("role") == "assistant"]
            if assistant_msgs:
                last_bot_msg = assistant_msgs[-1]
            for m in assistant_msgs[-2:]:
                bot_history_list.append({"role": "assistant", "content": _mask_pii(m, known_pii)})

        safe_msg = _mask_pii(user_message, known_pii, last_bot_msg)
        safe_reply = _mask_pii(result.get("reply", ""), known_pii)
        
        safe_state = {}
        for k, v in state_before.items():
            if isinstance(v, str): safe_state[k] = _mask_pii(v, known_pii)
            else: safe_state[k] = v
            
        raw_tools = result.get("tool_calls_log") or []
        tool_names = [t.get("tool") for t in raw_tools if isinstance(t, dict) and t.get("tool")]
        
        item = {
            "s": user_hash,
            "u": safe_msg,
            "st": json.dumps(safe_state),
            "g": gate_name,
            "r": safe_reply,
            "tc": json.dumps(tool_names),
            "m": model_name,
            "l": latency_ms,
            "c": conv_hash,
            "bh": json.dumps(bot_history_list)
        }
        
        global _dropped_logs_count
        try:
            _log_queue.put_nowait(item)
        except queue.Full:
            _dropped_logs_count += 1
            
    except Exception as e:
        logger.warning(f"Failed to queue turn log: {e}")
