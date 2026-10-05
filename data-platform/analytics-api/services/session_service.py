"""
Session Memory Layer for AI Report Refinement.

Maintains server-side state across report generation and refinement turns,
allowing the LLM to access:
  - The original user prompt
  - All SQL queries executed (with results snapshots)
  - Full conversation history (user feedback + AI responses)
  - Compact data snapshots (top rows, KPIs, chart data)

Storage: In-memory dict with TTL-based auto-cleanup.
For production with multiple replicas, swap _sessions dict with Redis.
"""

import logging
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger("ai-session")

SESSION_TTL_SECONDS = 7200  # 2 hours
MAX_SESSIONS = 500
MAX_CONVERSATION_TURNS = 20
MAX_SNAPSHOT_ROWS = 15


@dataclass
class ConversationTurn:
    """A single turn in the refinement conversation."""
    role: str  # "user" | "assistant"
    content: str
    sql_changes: Optional[Dict[str, str]] = None  # SQL that was executed/changed
    result_snapshot: Optional[Dict[str, Any]] = None  # Compact results after this turn
    timestamp: str = ""

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.now().astimezone().isoformat()


@dataclass
class ReportSession:
    """Server-side session state for an AI report generation + refinement flow."""
    session_id: str
    original_prompt: str
    domain: str = "auto"
    time_label: str = ""

    # Current state
    current_sql: Dict[str, str] = field(default_factory=dict)  # {main, kpi, trend, breakdown}
    current_results_snapshot: Dict[str, Any] = field(default_factory=dict)

    # Full conversation history
    conversation_turns: List[ConversationTurn] = field(default_factory=list)

    # Metadata
    title: str = ""
    description: str = ""
    revision: int = 1
    created_at: str = ""
    last_updated: str = ""

    def __post_init__(self):
        now = datetime.now().astimezone().isoformat()
        if not self.created_at:
            self.created_at = now
        if not self.last_updated:
            self.last_updated = now

    def add_turn(
        self,
        role: str,
        content: str,
        sql_changes: Optional[Dict[str, str]] = None,
        result_snapshot: Optional[Dict[str, Any]] = None,
    ):
        """Add a conversation turn, keeping history bounded."""
        turn = ConversationTurn(
            role=role,
            content=content,
            sql_changes=sql_changes,
            result_snapshot=result_snapshot,
        )
        self.conversation_turns.append(turn)
        # Keep bounded
        if len(self.conversation_turns) > MAX_CONVERSATION_TURNS:
            self.conversation_turns = self.conversation_turns[-MAX_CONVERSATION_TURNS:]
        self.last_updated = datetime.now().astimezone().isoformat()

    def update_state(
        self,
        sql_used: Dict[str, str],
        normalized_results: Dict[str, Any],
        title: str = "",
        description: str = "",
    ):
        """Update current SQL and results state after a generation or refinement."""
        self.current_sql = dict(sql_used)
        self.current_results_snapshot = _compact_snapshot(normalized_results)
        if title:
            self.title = title
        if description:
            self.description = description
        self.last_updated = datetime.now().astimezone().isoformat()

    def formatted_history(self, max_turns: int = 10) -> str:
        """Format conversation history for LLM prompt injection."""
        recent = self.conversation_turns[-max_turns:]
        if not recent:
            return "(Đây là lượt đầu tiên, chưa có lịch sử)"

        lines = []
        for i, turn in enumerate(recent, 1):
            role_label = "👤 Người dùng" if turn.role == "user" else "🤖 Trợ lý AI"
            lines.append(f"[Lượt {i}] {role_label}: {turn.content}")
            if turn.sql_changes:
                changed_keys = [k for k, v in turn.sql_changes.items() if v]
                if changed_keys:
                    lines.append(f"   → SQL đã thay đổi: {', '.join(changed_keys)}")
            if turn.result_snapshot:
                kpis = turn.result_snapshot.get("kpis", {})
                row_count = turn.result_snapshot.get("row_count", 0)
                if kpis:
                    kpi_str = ", ".join(
                        f"{k}={v}" for k, v in kpis.items()
                        if v is not None and k not in ("revenue_growth", "orders_growth")
                    )
                    lines.append(f"   → KPI sau thay đổi: {kpi_str} | {row_count} dòng")
        return "\n".join(lines)

    def get_data_context_for_llm(self) -> str:
        """Build compact data context string for LLM prompt injection."""
        snap = self.current_results_snapshot
        if not snap:
            return "(Chưa có dữ liệu kết quả)"

        parts = []

        # KPIs
        kpis = snap.get("kpis", {})
        if kpis:
            kpi_items = []
            for k, v in kpis.items():
                if v is not None and k not in ("revenue_growth", "orders_growth"):
                    kpi_items.append(f"{k}: {v}")
            if kpi_items:
                parts.append("KPI: " + " | ".join(kpi_items))

        # Table rows (compact)
        rows = snap.get("table_rows", [])
        if rows:
            parts.append(f"Bảng dữ liệu ({snap.get('row_count', len(rows))} dòng, hiển thị {len(rows)} dòng đầu):")
            # Show column headers + first few rows
            if rows:
                cols = list(rows[0].keys())
                parts.append("  Cột: " + " | ".join(cols))
                for i, row in enumerate(rows[:8]):
                    vals = [str(row.get(c, ""))[:30] for c in cols]
                    parts.append(f"  [{i+1}] " + " | ".join(vals))
                if len(rows) > 8:
                    parts.append(f"  ... (còn {len(rows) - 8} dòng nữa)")

        # Charts summary
        charts = snap.get("charts_summary", [])
        for ch in charts[:3]:
            parts.append(f"Biểu đồ '{ch.get('title', '')}' ({ch.get('chart_type', '')}): {ch.get('data_count', 0)} điểm dữ liệu")

        return "\n".join(parts) if parts else "(Không có dữ liệu)"


def _compact_snapshot(normalized_results: Dict[str, Any]) -> Dict[str, Any]:
    """Create a compact snapshot of query results for session storage."""
    table_rows = normalized_results.get("table_rows", [])
    return {
        "kpis": normalized_results.get("kpis", {}),
        "table_rows": table_rows[:MAX_SNAPSHOT_ROWS],
        "table_columns": normalized_results.get("table_columns", []),
        "row_count": normalized_results.get("row_counts", {}).get("main", len(table_rows)),
        "trend_count": len(normalized_results.get("trend", [])),
        "breakdown_count": len(normalized_results.get("breakdown", [])),
        "charts_summary": [],  # populated externally if needed
    }


# ── Session Store (Thread-safe In-Memory) ──

_sessions: Dict[str, ReportSession] = {}
_timestamps: Dict[str, float] = {}  # session_id -> last access monotonic time
_lock = threading.Lock()


def _cleanup_expired():
    """Remove sessions older than TTL. Called periodically."""
    now = time.monotonic()
    expired = [
        sid for sid, ts in _timestamps.items()
        if now - ts > SESSION_TTL_SECONDS
    ]
    for sid in expired:
        _sessions.pop(sid, None)
        _timestamps.pop(sid, None)
    if expired:
        logger.info("🧹 [SESSION] Cleaned up %d expired sessions", len(expired))


def create_session(
    original_prompt: str,
    domain: str = "auto",
    time_label: str = "",
) -> ReportSession:
    """Create a new report session and return it."""
    with _lock:
        # Periodic cleanup
        if len(_sessions) > MAX_SESSIONS * 0.8:
            _cleanup_expired()
        # Enforce hard cap
        if len(_sessions) >= MAX_SESSIONS:
            oldest_sid = min(_timestamps, key=_timestamps.get)
            _sessions.pop(oldest_sid, None)
            _timestamps.pop(oldest_sid, None)

        session_id = str(uuid.uuid4())
        session = ReportSession(
            session_id=session_id,
            original_prompt=original_prompt,
            domain=domain,
            time_label=time_label,
        )
        _sessions[session_id] = session
        _timestamps[session_id] = time.monotonic()
        logger.info("🆕 [SESSION] Created session %s for prompt: '%s'", session_id[:8], original_prompt[:60])
        return session


def get_session(session_id: str) -> Optional[ReportSession]:
    """Retrieve a session by ID, refreshing its TTL."""
    with _lock:
        session = _sessions.get(session_id)
        if session:
            _timestamps[session_id] = time.monotonic()
        return session


def delete_session(session_id: str):
    """Explicitly remove a session."""
    with _lock:
        _sessions.pop(session_id, None)
        _timestamps.pop(session_id, None)


def session_stats() -> Dict[str, Any]:
    """Return session store statistics for monitoring."""
    with _lock:
        return {
            "active_sessions": len(_sessions),
            "max_sessions": MAX_SESSIONS,
            "ttl_seconds": SESSION_TTL_SECONDS,
        }
