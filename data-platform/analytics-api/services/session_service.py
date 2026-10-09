"""
Session Memory Layer for AI Report Refinement.

Maintains server-side state across report generation and refinement turns,
allowing the LLM to access:
  - The original user prompt
  - All SQL queries executed (with results snapshots)
  - Full conversation history (user feedback + AI responses)
  - Compact data snapshots (top rows, KPIs, chart data)

Storage: Redis with TTL, atomic version checks and distributed locks in production.
In-memory storage is an explicit development/offline option.
"""

import logging
import json
import os
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
    current_sql: Dict[str, str] = field(
        default_factory=dict
    )  # {main, kpi, trend, breakdown}
    current_results_snapshot: Dict[str, Any] = field(default_factory=dict)

    # V2 authoritative analytical state; SQL is an output, not session meaning.
    analysis_spec: Dict[str, Any] = field(default_factory=dict)
    grounded_spec: Dict[str, Any] = field(default_factory=dict)
    query_plans: List[Dict[str, Any]] = field(default_factory=list)
    schema_fingerprint: str = ""
    semantic_intent: Dict[str, Any] = field(default_factory=dict)
    initial_semantic_intent: Dict[str, Any] = field(default_factory=dict)
    semantic_history: List[Dict[str, Any]] = field(default_factory=list)
    intent_fingerprint: str = ""
    plan_fingerprint: str = ""
    resolved_operations: List[Dict[str, Any]] = field(default_factory=list)
    requirement_coverage: List[Dict[str, Any]] = field(default_factory=list)
    feature_bindings: List[Dict[str, Any]] = field(default_factory=list)
    resolver_version: str = ""
    last_result_contract: Dict[str, Any] = field(default_factory=dict)
    proposed_prompt: str = ""
    proposed_request: str = ""
    analysis_lock: Any = field(default_factory=threading.RLock, repr=False)
    approved: bool = False
    diagnostics: Dict[str, Any] = field(default_factory=dict)
    report_response: Dict[str, Any] = field(default_factory=dict)
    # Server artifacts exclude provider continuation and private reasoning.
    agent_artifacts: Dict[str, Any] = field(default_factory=dict, repr=False)
    agent_reference_date: str = ""
    dashboard_plan: Dict[str, Any] = field(default_factory=dict)
    agent_state: Dict[str, Any] = field(default_factory=dict)
    analysis_depth: str = "deep"
    ui_constraints: Dict[str, Any] = field(default_factory=dict)
    contract_version: str = "2.5"
    owner_id: Optional[str] = None
    analysis_components: List[Dict[str, Any]] = field(default_factory=list)
    coverage_origin: str = "execution_only"
    partial_scope: bool = False
    natural_input: bool = False
    analysis_inputs: Dict[str, Any] = field(default_factory=dict)
    input_time_strategy: Dict[str, Any] = field(default_factory=dict)
    module_provenance: Optional[Dict[str, Any]] = None

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
                        f"{k}={v}"
                        for k, v in kpis.items()
                        if v is not None
                        and k not in ("revenue_growth", "orders_growth")
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
            parts.append(
                f"Bảng dữ liệu ({snap.get('row_count', len(rows))} dòng, hiển thị {len(rows)} dòng đầu):"
            )
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
            parts.append(
                f"Biểu đồ '{ch.get('title', '')}' ({ch.get('chart_type', '')}): {ch.get('data_count', 0)} điểm dữ liệu"
            )

        return "\n".join(parts) if parts else "(Không có dữ liệu)"


def _compact_snapshot(normalized_results: Dict[str, Any]) -> Dict[str, Any]:
    """Create a compact snapshot of query results for session storage."""
    table_rows = normalized_results.get("table_rows", [])
    return {
        "kpis": normalized_results.get("kpis", {}),
        "table_rows": table_rows[:MAX_SNAPSHOT_ROWS],
        "table_columns": normalized_results.get("table_columns", []),
        "row_count": normalized_results.get("row_counts", {}).get(
            "main", len(table_rows)
        ),
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
    expired = [sid for sid, ts in _timestamps.items() if now - ts > SESSION_TTL_SECONDS]
    for sid in expired:
        _sessions.pop(sid, None)
        _timestamps.pop(sid, None)
    if expired:
        logger.info("🧹 [SESSION] Cleaned up %d expired sessions", len(expired))


def create_session(
    original_prompt: str,
    domain: str = "auto",
    time_label: str = "",
    owner_id: Optional[str] = None,
) -> ReportSession:
    """Create a new report session and return it."""
    from services.provider_budget import check_request_deadline
    check_request_deadline()
    if storage() is not None:
        session = ReportSession(session_id=str(uuid.uuid4()), original_prompt=original_prompt, domain=domain, time_label=time_label, owner_id=owner_id)
        storage().save(session, create=True)
        session.analysis_lock = storage().session_lock(session.session_id, session._storage_version)
        return session
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
            owner_id=owner_id,
        )
        _sessions[session_id] = session
        _timestamps[session_id] = time.monotonic()
        logger.info("🆕 [SESSION] Created session %s", session_id[:8])
        return session


def get_session(session_id: str) -> Optional[ReportSession]:
    """Retrieve a session by ID, refreshing its TTL."""
    if storage() is not None:
        return storage().get(session_id)
    with _lock:
        _cleanup_expired()
        session = _sessions.get(session_id)
        if session:
            _timestamps[session_id] = time.monotonic()
        return session


def delete_session(session_id: str):
    """Explicitly remove a session."""
    if storage() is not None:
        storage().delete(session_id)
        return
    with _lock:
        _sessions.pop(session_id, None)
        _timestamps.pop(session_id, None)


def session_stats() -> Dict[str, Any]:
    """Return session store statistics for monitoring."""
    if storage() is not None:
        return {"storage":"redis", "multi_replica":True,"max_sessions":MAX_SESSIONS,"ttl_seconds":SESSION_TTL_SECONDS}
    with _lock:
        return {
            "active_sessions": len(_sessions),
            "max_sessions": MAX_SESSIONS,
            "ttl_seconds": SESSION_TTL_SECONDS,
            "storage": "memory", "multi_replica": False,
        }


def encode_session(session):
    """JSON only: no pickle, provider continuation or serialized locks."""
    from dataclasses import fields, asdict
    data = {f.name:getattr(session,f.name) for f in fields(session) if f.name not in {"analysis_lock","agent_artifacts","conversation_turns"}}
    data["conversation_turns"] = [asdict(t) for t in session.conversation_turns[-MAX_CONVERSATION_TURNS:]]
    from services.result_artifact_store import artifact_store, fingerprint
    from services.analytical_capacity_planner import AnalyticalCapacityContract
    data['agent_artifacts'] = {}
    for id,a in session.agent_artifacts.items():
        if a.result is not None and not a.result_ref:
            a.result_ref = artifact_store().put(a.result, query_fingerprint=a.signature,
                plan_fingerprint=fingerprint(a.plan.model_dump(mode='json')), schema_fingerprint=a.plan.schema_fingerprint,
                provenance=dict(dimensions=a.plan.dimensions, time=a.plan.period))
        data['agent_artifacts'][id] = dict(query=a.query.model_dump(mode='json'), grounded=a.grounded.model_dump(mode='json'),
            plan=a.plan.model_dump(mode='json'), sql=a.sql, signature=a.signature, result=None,
            result_ref=a.result_ref, capacity=a.capacity, contract=a.contract, reused=a.reused, observed_at=a.observed_at)
    # Migrate old result-heavy sessions on their next save. No huge inline fallback.
    if data.get('report_response', {}).get('result_sets'):
        from services.analysis_response_service import session_report_summary
        data['report_response'] = session_report_summary(data['report_response'])
    body = json.dumps(data,ensure_ascii=False,separators=(",", ":"),default=str)
    if len(body.encode()) > AnalyticalCapacityContract.from_env().session_bytes:
        from services.analysis_catalog import AnalysisError
        raise AnalysisError("session_capacity","Server session exceeds bounded storage size")
    return body


def decode_session(body):
    from services.analysis_contract import GroundedAnalysisSpec, QueryPlan
    from services.analyst_contract import AnalyticalQuery
    from services.analytical_query_service import AnalysisArtifact
    data = json.loads(body)
    artifacts = data.pop("agent_artifacts",{})
    turns = data.pop("conversation_turns",[])
    session = ReportSession(**data)
    session.conversation_turns = [ConversationTurn(**t) for t in turns]
    session.agent_artifacts = {id:AnalysisArtifact(query=AnalyticalQuery.model_validate(a.pop("query")),
        grounded=GroundedAnalysisSpec.model_validate(a.pop("grounded")),plan=QueryPlan.model_validate(a.pop("plan")),**a) for id,a in artifacts.items()}
    return session


class RedisSessionStore:
    """TTL + bounded capacity + compare-and-set; distributed locks are transient."""
    # Atomic creation/update/capacity. Logical revision and storage version are
    # distinct: a proposal save need not bump the user-visible report revision.
    SCRIPT = """
local prior = redis.call('GET', KEYS[1])
if prior then
 local p = cjson.decode(prior)
 if tonumber(p.version) ~= tonumber(ARGV[1]) then return -1 end
 if p.owner ~= cjson.null and p.owner ~= ARGV[4] then return -2 end
else
 if tonumber(ARGV[1]) ~= 0 then return -1 end
 redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ARGV[5])
 if redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[6]) then return -3 end
end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
redis.call('ZADD', KEYS[2], tonumber(ARGV[5])+tonumber(ARGV[3]), KEYS[1])
return 1
"""
    def __init__(self, client):
        self.client = client
    def key(self,id):
        # Redis cluster hash tag keeps CAS/capacity keys in the same slot.
        return "analyst:{sessions}:"+id
    def session_lock(self,id,version):
        store = self
        class Guard:
            def __enter__(self):
                from services.analysis_catalog import AnalysisError
                self.lock = store.client.lock(store.key(id)+":lock",timeout=600,blocking_timeout=5)
                self.lock.__enter__()
                try:
                    raw = store.client.get(store.key(id))
                    if not raw or json.loads(raw)["version"] != version:
                        raise AnalysisError("stale_approval","Session changed before lock acquisition")
                except Exception:
                    self.lock.__exit__(None,None,None)
                    raise
                return self
            def __exit__(self,*args):
                return self.lock.__exit__(*args)
        return Guard()
    def save(self,session,create=False):
        from services.analysis_catalog import AnalysisError
        expected = 0 if create else getattr(session,"_storage_version",0)
        body = json.dumps({"version":expected+1,"owner":session.owner_id,"session":encode_session(session)},ensure_ascii=False)
        try:
            result = self.client.eval(self.SCRIPT,2,self.key(session.session_id),"analyst:{sessions}:index",expected,body,
                SESSION_TTL_SECONDS,session.owner_id or "",int(time.time()),MAX_SESSIONS)
        except Exception:
            raise AnalysisError("session_storage","Durable session storage unavailable") from None
        if result != 1:
            raise AnalysisError("stale_approval" if result in {-1,-2} else "session_capacity","Atomic session update rejected")
        session._storage_version = expected+1
    def get(self,id):
        from services.analysis_catalog import AnalysisError
        try:
            raw = self.client.get(self.key(id))
        except Exception:
            raise AnalysisError("session_storage","Durable session storage unavailable") from None
        if not raw:
            return None
        data = json.loads(raw)
        session = decode_session(data["session"])
        session._storage_version=data["version"]
        session.analysis_lock=self.session_lock(id,session._storage_version)
        return session
    def delete(self,id):
        self.client.delete(self.key(id))
        self.client.zrem("analyst:{sessions}:index",self.key(id))


_durable_store = None


def storage():
    global _durable_store
    from services.analysis_catalog import AnalysisError
    mode = os.getenv("DATA_ANALYST_SESSION_STORE","memory")
    if mode == "memory":
        if os.getenv("DATA_ANALYST_ENV","development") == "production":
            raise AnalysisError("session_storage","Production requires durable session storage")
        return None
    if mode != "redis":
        raise AnalysisError("session_storage","Unknown session storage policy")
    if _durable_store is None:
        try:
            import redis
            url = os.getenv("DATA_ANALYST_REDIS_URL", "")
            if not url:
                raise ValueError("Missing URL")
            _durable_store = RedisSessionStore(redis.Redis.from_url(url,decode_responses=True,socket_connect_timeout=2,socket_timeout=3))
        except Exception:
            raise AnalysisError("session_storage","Redis session configuration unavailable") from None
    return _durable_store


def save_session(session):
    from services.provider_budget import check_request_deadline
    check_request_deadline()
    if storage() is not None:
        storage().save(session)
