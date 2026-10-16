"""Cached data coverage/freshness snapshot (V3.1 Analyst Workspace).

The snapshot is refreshed outside the preflight hot path (capabilities request
or an explicit refresh) through a bounded read-only connection. ``peek`` never
performs I/O, so typing-time preflight cannot query the warehouse.
"""
import logging
import time
from copy import deepcopy
from datetime import date, datetime, timezone
from threading import Lock

from services.analysis_catalog import referenced_columns

TTL_SECONDS = 60
_lock = Lock()
_snapshot = None  # {"value": dict, "expires": monotonic}
logger = logging.getLogger("ai-analytics")


def fact_clocks(registry, tables):
    """Governed (subject -> table, time column) for complete historical facts."""
    clocks = {}
    for id, subject in registry["subjects"].items():
        column = subject.get("time_column")
        if not column or tables.get(subject["source"], {}).get("source_scope") != "FULL_FACT":
            continue
        table, name = referenced_columns(column)[0]
        clocks.setdefault((table, name), {"table": table, "column": name, "subjects": []})["subjects"].append(id)
    return sorted(clocks.values(), key=lambda c: (c["table"], c["column"]))


def _iso(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat() if value.tzinfo is None else value.astimezone(timezone.utc).date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)[:10]


def _stamp(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).astimezone(timezone.utc).isoformat()
    return str(value)


def build_snapshot(rows, sync, overlay, now=None):
    """Pure assembly from observed bounds; testable without a warehouse."""
    registry, tables = overlay["analysis_registry"], overlay["silver_tables"]
    now = now or datetime.now(timezone.utc)
    stale_hours = registry.get("workspace", {}).get("freshness", {}).get("stale_after_hours", 48)
    facts = {}
    for clock in fact_clocks(registry, tables):
        bounds = rows.get(clock["table"] + "." + clock["column"]) or {}
        label = tables[clock["table"]].get("business_name", clock["table"])
        facts[clock["table"]] = {"label": label, "subjects": clock["subjects"],
                                 "min_date": _iso(bounds.get("min")), "max_date": _iso(bounds.get("max")),
                                 "rows": bounds.get("rows")}
    known = [f for f in facts.values() if f["min_date"] and f["max_date"]]
    overall = {"min_date": min((f["min_date"] for f in known), default=None),
               "max_date": max((f["max_date"] for f in known), default=None)}
    last_sync = (sync or {}).get("finished_at")
    max_data = overall["max_date"]
    lag_hours = None
    if last_sync:
        moment = last_sync if isinstance(last_sync, datetime) else datetime.fromisoformat(str(last_sync))
        moment = moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)
        lag_hours = round((now - moment).total_seconds() / 3600, 1)
    # Batch data is stale when the newest observed business day is far behind
    # today, even if the sync job itself ran recently (source stopped producing).
    data_lag_hours = None
    if max_data:
        data_lag_hours = round((now - datetime.fromisoformat(max_data).replace(tzinfo=timezone.utc)).total_seconds() / 3600, 1)
    stale = bool(data_lag_hours is not None and data_lag_hours > stale_hours + 24 or lag_hours is not None and lag_hours > stale_hours)
    return {"status": "ready" if known else "unavailable", "overall": overall, "facts": facts,
            "freshness": {"mode": "batch", "label": "Cập nhật theo đợt", "last_sync": _stamp(last_sync),
                          "last_sync_status": (sync or {}).get("status"), "max_data_timestamp": max_data,
                          "sync_lag_hours": lag_hours, "data_lag_hours": data_lag_hours,
                          "stale_after_hours": stale_hours, "stale": stale},
            "observed_at": now.isoformat()}


def _query(connection, overlay):
    from psycopg2 import sql
    registry, tables = overlay["analysis_registry"], overlay["silver_tables"]
    rows = {}
    with connection.cursor() as cur:
        for clock in fact_clocks(registry, tables):
            schema, name = clock["table"].split(".")
            try:
                cur.execute(sql.SQL("SELECT MIN({c}) AS min, MAX({c}) AS max FROM {s}.{t}").format(
                    c=sql.Identifier(clock["column"]), s=sql.Identifier(schema), t=sql.Identifier(name)))
                rows[clock["table"] + "." + clock["column"]] = dict(cur.fetchone())
            except Exception:
                connection.rollback()
                logger.warning("[DataCoverage] bound unavailable table=%s", clock["table"])
        sync = None
        try:
            cur.execute("SELECT finished_at, status FROM public.sync_history WHERE status = 'success' "
                        "AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1")
            found = cur.fetchone()
            sync = dict(found) if found else None
        except Exception:
            connection.rollback()
    return rows, sync


def refresh(overlay=None, connection_factory=None):
    """Bounded read-only refresh (never called by preflight)."""
    global _snapshot
    from services.analysis_catalog import CATALOG_PATH
    import json
    overlay = overlay or json.loads(CATALOG_PATH.read_text())
    if connection_factory is None:
        from services.readiness_service import warehouse_connection
        connection_factory = warehouse_connection
    conn = connection_factory()
    try:
        rows, sync = _query(conn, overlay)
    finally:
        try:
            conn.rollback()
            conn.close()
        except Exception:
            pass
    value = build_snapshot(rows, sync, overlay)
    with _lock:
        _snapshot = {"value": value, "expires": time.monotonic() + TTL_SECONDS}
    return deepcopy(value)


def peek():
    """Last snapshot or None. Pure memory read: safe for the typing hot path."""
    with _lock:
        return deepcopy(_snapshot["value"]) if _snapshot else None


def current(overlay=None, connection_factory=None):
    """Cached snapshot, refreshed when older than the TTL (not for preflight)."""
    with _lock:
        cached = _snapshot
    if cached and cached["expires"] > time.monotonic():
        return deepcopy(cached["value"])
    try:
        return refresh(overlay, connection_factory)
    except Exception:
        logger.warning("[DataCoverage] refresh unavailable")
        return deepcopy(cached["value"]) if cached else {"status": "unavailable", "overall": {"min_date": None, "max_date": None},
            "facts": {}, "freshness": {"mode": "batch", "label": "Cập nhật theo đợt", "last_sync": None, "stale": None}}


def set_snapshot(value, ttl=TTL_SECONDS):
    """Test/bootstrap hook: install a snapshot without I/O."""
    global _snapshot
    with _lock:
        _snapshot = None if value is None else {"value": deepcopy(value), "expires": time.monotonic() + ttl}


_refresher = None


def start_background_refresh(interval=None):
    """Daemon refresher started by the server (never by request handlers)."""
    global _refresher
    import os
    import threading
    seconds = interval if interval is not None else int(os.getenv("DATA_ANALYST_COVERAGE_REFRESH_SECONDS", str(TTL_SECONDS)))
    if seconds <= 0 or (_refresher and _refresher.is_alive()):
        return None

    def loop():
        while True:
            try:
                refresh()
            except Exception:
                logger.warning("[DataCoverage] background refresh unavailable")
            time.sleep(seconds)

    _refresher = threading.Thread(target=loop, name="data-coverage-refresh", daemon=True)
    _refresher.start()
    return _refresher
