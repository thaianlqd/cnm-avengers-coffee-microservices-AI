"""Durable server-side memory and request deduplication for AI chat."""

import json
import os
import threading
import time
import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy import text

from src.function_calling.helpers import _get_engine


_INIT_LOCK = threading.Lock()
_INITIALIZED = False
IN_PROGRESS = "in_progress"
OUTCOME_UNKNOWN = "outcome_unknown"
UNRESOLVED_STATUSES = {IN_PROGRESS, OUTCOME_UNKNOWN}
STALE_CLAIM_SECONDS = 30.0


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
    return dict(cached) if isinstance(cached, dict) and cached.get("_turn_status") not in UNRESOLVED_STATUSES else None


def claim_turn(conversation_id: str, session_id: str, client_message_id: str,
               message: str, selected_product_id: Optional[str]) -> Dict[str, Any]:
    """Atomically reserve one logical turn in the existing conversation row."""
    _ensure_table()
    schema = _schema()
    with _get_engine().begin() as conn:
        conn.execute(text(f'''
            INSERT INTO "{schema}".chat_ai_conversation (conversation_id, session_id)
            VALUES (:conversation_id, :session_id) ON CONFLICT (conversation_id) DO NOTHING
        '''), {"conversation_id": conversation_id, "session_id": session_id})
        row = conn.execute(text(f'''
            SELECT session_id, messages, state, processed_responses
            FROM "{schema}".chat_ai_conversation
            WHERE conversation_id = :conversation_id FOR UPDATE
        '''), {"conversation_id": conversation_id}).mappings().first()
        if str(row["session_id"]) != str(session_id):
            raise PermissionError("Conversation does not belong to this session")
        responses = dict(row["processed_responses"] or {})
        previous = responses.get(str(client_message_id))
        if previous:
            if (previous.get("_request_message") != message or
                    previous.get("_selected_product_id") != selected_product_id):
                return {"status": "conflict"}
            return {"status": previous.get("_turn_status") if previous.get("_turn_status") in UNRESOLVED_STATUSES else "completed",
                    "response": dict(previous)}
        blocking = next(((turn_id, record) for turn_id, record in responses.items()
                         if isinstance(record, dict) and record.get("_turn_status") in UNRESOLVED_STATUSES), None)
        if blocking:
            turn_id, record = blocking
            return {"status": "blocked_by_turn", "blocking_turn_id": turn_id,
                    "blocking_status": record["_turn_status"]}
        responses[str(client_message_id)] = {
            "_turn_status": IN_PROGRESS, "_request_message": message,
            "_selected_product_id": selected_product_id, "_claimed_at": time.time(),
        }
        conn.execute(text(f'''
            UPDATE "{schema}".chat_ai_conversation
            SET processed_responses = CAST(:responses AS jsonb), updated_at = NOW()
            WHERE conversation_id = :conversation_id
        '''), {"conversation_id": conversation_id,
               "responses": json.dumps(responses, ensure_ascii=False)})
        return {"status": "claimed", "history": list(row["messages"] or [])}


def unresolved_turn(conversation_id: str, session_id: str) -> Optional[Dict[str, str]]:
    """Inspect the old conversation before a reset can change its identity."""
    record = load(conversation_id, session_id)
    for turn_id, response in record["processed_responses"].items():
        if isinstance(response, dict) and response.get("_turn_status") in UNRESOLVED_STATUSES:
            return {"turn_id": turn_id, "status": response["_turn_status"]}
    return None


def mark_outcome_unknown(conversation_id: str, session_id: str, client_message_id: str,
                         phase: str) -> bool:
    """Record a failed or stale claimed turn without releasing its identity."""
    _ensure_table()
    schema = _schema()
    with _get_engine().begin() as conn:
        row = conn.execute(text(f'''
            SELECT session_id, processed_responses FROM "{schema}".chat_ai_conversation
            WHERE conversation_id = :conversation_id FOR UPDATE
        '''), {"conversation_id": conversation_id}).mappings().first()
        if not row or str(row["session_id"]) != str(session_id):
            raise PermissionError("Conversation does not belong to this session")
        responses = dict(row["processed_responses"] or {})
        previous = responses.get(str(client_message_id))
        if not isinstance(previous, dict) or previous.get("_turn_status") not in UNRESOLVED_STATUSES:
            return False
        responses[str(client_message_id)] = {**previous, "_turn_status": OUTCOME_UNKNOWN,
                                             "_failed_at": previous.get("_failed_at") or time.time(),
                                             "_failure_phase": previous.get("_failure_phase") or phase}
        conn.execute(text(f'''
            UPDATE "{schema}".chat_ai_conversation
            SET processed_responses = CAST(:responses AS jsonb), updated_at = NOW()
            WHERE conversation_id = :conversation_id
        '''), {"conversation_id": conversation_id,
               "responses": json.dumps(responses, ensure_ascii=False)})
        return True


def save_exchange(
    conversation_id: str,
    session_id: str,
    user_message: str,
    result: Dict[str, Any],
    client_message_id: Optional[str] = None,
    state: Optional[Dict[str, Any]] = None,
    response_session_id: Optional[str] = None,
    selected_product_id: Optional[str] = None,
) -> None:
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
        messages: List[Dict[str, str]] = list(row["messages"] or []) if row else []
        messages.extend([
            {"role": "user", "content": str(user_message)},
            {"role": "assistant", "content": str(result.get("reply") or "")},
        ])
        messages = messages[-100:]
        responses = dict(row["processed_responses"] or {}) if row else {}
        if client_message_id:
            previous = responses.get(str(client_message_id))
            if previous and previous.get("_turn_status") not in UNRESOLVED_STATUSES:
                if (previous.get("_request_message") != user_message or
                        previous.get("_selected_product_id") != selected_product_id):
                    raise ValueError("client_message_id_conflict")
                return  # A competing recovery already committed this exchange.
            cached_result = dict(result)
            cached_result["_response_session_id"] = response_session_id or session_id
            cached_result["_request_message"] = user_message
            cached_result["_selected_product_id"] = selected_product_id
            cached_result["_completed_at"] = time.time()
            responses[str(client_message_id)] = cached_result
            if len(responses) > 50:
                completed = sorted(
                    (key for key, value in responses.items()
                     if key != str(client_message_id) and isinstance(value, dict)
                     and value.get("_turn_status") not in UNRESOLVED_STATUSES),
                    key=lambda key: (float(responses[key].get("_completed_at") or responses[key].get("_claimed_at") or 0), key),
                )
                for key in completed[:max(0, len(responses) - 50)]:
                    responses.pop(key, None)
        params = {
            "conversation_id": conversation_id,
            "session_id": session_id,
            "messages": json.dumps(messages, ensure_ascii=False),
            "state": json.dumps(state if state is not None else dict(row["state"] or {}) if row else {}, ensure_ascii=False, default=str),
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
