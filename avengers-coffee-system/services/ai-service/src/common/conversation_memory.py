"""Durable server-side memory and request deduplication for AI chat."""

import json
import os
import threading
import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy import text

from src.function_calling.helpers import _get_engine


_INIT_LOCK = threading.Lock()
_INITIALIZED = False


def _schema() -> str:
    value = os.getenv("AI_SCHEMA", "ai").strip()
    return value if value.replace("_", "").isalnum() else "ai"


def _ensure_table() -> None:
    global _INITIALIZED
    if _INITIALIZED:
        return
    with _INIT_LOCK:
        if _INITIALIZED:
            return
        schema = _schema()
        engine = _get_engine()
        with engine.begin() as conn:
            conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
            conn.execute(text(f'''
                CREATE TABLE IF NOT EXISTS "{schema}".chat_ai_conversation (
                    conversation_id UUID PRIMARY KEY,
                    session_id VARCHAR(160) NOT NULL,
                    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
                    state JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                    processed_responses JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            '''))
            conn.execute(text(f'''
                CREATE INDEX IF NOT EXISTS idx_chat_ai_conversation_session
                ON "{schema}".chat_ai_conversation(session_id, updated_at DESC)
            '''))
        _INITIALIZED = True


def normalize_conversation_id(value: Optional[str]) -> str:
    if value:
        try:
            return str(uuid.UUID(str(value)))
        except (ValueError, TypeError):
            pass
    return str(uuid.uuid4())


def load(conversation_id: str, session_id: str) -> Dict[str, Any]:
    _ensure_table()
    schema = _schema()
    engine = _get_engine()
    with engine.begin() as conn:
        row = conn.execute(text(f'''
            SELECT session_id, messages, state, processed_responses
            FROM "{schema}".chat_ai_conversation
            WHERE conversation_id = :conversation_id
            FOR UPDATE
        '''), {"conversation_id": conversation_id}).mappings().first()
        if row and str(row["session_id"]) != str(session_id):
            raise PermissionError("Conversation does not belong to this session")
        if not row:
            conn.execute(text(f'''
                INSERT INTO "{schema}".chat_ai_conversation
                    (conversation_id, session_id)
                VALUES (:conversation_id, :session_id)
            '''), {"conversation_id": conversation_id, "session_id": session_id})
            return {"messages": [], "state": {}, "processed_responses": {}}
        return {
            "messages": list(row["messages"] or []),
            "state": dict(row["state"] or {}),
            "processed_responses": dict(row["processed_responses"] or {}),
        }


def get_cached_response(conversation_id: str, session_id: str, client_message_id: Optional[str]) -> Optional[Dict[str, Any]]:
    if not client_message_id:
        return None
    record = load(conversation_id, session_id)
    cached = record["processed_responses"].get(str(client_message_id))
    return dict(cached) if isinstance(cached, dict) else None


def save_exchange(
    conversation_id: str,
    session_id: str,
    user_message: str,
    result: Dict[str, Any],
    client_message_id: Optional[str] = None,
    state: Optional[Dict[str, Any]] = None,
    response_session_id: Optional[str] = None,
) -> None:
    _ensure_table()
    schema = _schema()
    engine = _get_engine()
    with engine.begin() as conn:
        row = conn.execute(text(f'''
            SELECT session_id, messages, processed_responses
            FROM "{schema}".chat_ai_conversation
            WHERE conversation_id = :conversation_id
            FOR UPDATE
        '''), {"conversation_id": conversation_id}).mappings().first()
        if row and str(row["session_id"]) != str(session_id):
            raise PermissionError("Conversation does not belong to this session")
        messages: List[Dict[str, str]] = list(row["messages"] or []) if row else []
        messages.extend([
            {"role": "user", "content": str(user_message)},
            {"role": "assistant", "content": str(result.get("reply") or "")},
        ])
        messages = messages[-100:]
        responses = dict(row["processed_responses"] or {}) if row else {}
        if client_message_id:
            cached_result = dict(result)
            cached_result["_response_session_id"] = response_session_id or session_id
            responses[str(client_message_id)] = cached_result
            if len(responses) > 50:
                for key in list(responses)[:-50]:
                    responses.pop(key, None)
        params = {
            "conversation_id": conversation_id,
            "session_id": session_id,
            "messages": json.dumps(messages, ensure_ascii=False),
            "state": json.dumps(state or {}, ensure_ascii=False, default=str),
            "responses": json.dumps(responses, ensure_ascii=False, default=str),
        }
        conn.execute(text(f'''
            INSERT INTO "{schema}".chat_ai_conversation
                (conversation_id, session_id, messages, state, processed_responses, updated_at)
            VALUES (:conversation_id, :session_id, CAST(:messages AS jsonb), CAST(:state AS jsonb), CAST(:responses AS jsonb), NOW())
            ON CONFLICT (conversation_id) DO UPDATE SET
                messages = EXCLUDED.messages,
                state = EXCLUDED.state,
                processed_responses = EXCLUDED.processed_responses,
                updated_at = NOW()
        '''), params)
