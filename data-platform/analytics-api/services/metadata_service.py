import os
import re
import threading
import time
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

import psycopg2
import psycopg2.extras

from db import get_db_conn


LOCAL_TTL_SECONDS = int(os.getenv("METADATA_LOCAL_TTL_SECONDS", "600"))
SOURCE_TTL_SECONDS = int(os.getenv("METADATA_SOURCE_TTL_SECONDS", "2700"))
SOURCE_SCHEMAS = [
    item.strip()
    for item in os.getenv("SOURCE_METADATA_SCHEMAS", "orders,identity,menu,inventory,news,ai").split(",")
    if item.strip()
]

_cache: Dict[str, Dict[str, Any]] = {}
_lock = threading.RLock()

PII_EXACT = {
    "email", "guest_email", "phone", "guest_phone", "so_dien_thoai",
    "customer_phone", "ho_ten", "ten_khach_hang", "customer_name",
    "dia_chi", "dia_chi_day_du", "dia_chi_giao_hang", "delivery_address",
    "mat_khau", "mat_khau_hash", "password", "password_hash", "auth_pass",
    "access_token", "refresh_token", "token", "secret", "session_id",
    "reset_password_code_hash", "ma_tham_chieu", "du_lieu_tho",
}
PII_FRAGMENTS = ("password", "token", "secret", "email", "phone", "dien_thoai", "dia_chi")


def is_sensitive_column(name: str) -> bool:
    normalized = (name or "").lower()
    return normalized in PII_EXACT or any(fragment in normalized for fragment in PII_FRAGMENTS)


def sql_references_sensitive_columns(sql: str) -> bool:
    lowered = (sql or "").lower()
    return any(re.search(rf'(?<![a-z0-9_])"?{re.escape(name)}"?(?![a-z0-9_])', lowered) for name in PII_EXACT)


def _sanitize_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: _sanitize_value(nested)
            for key, nested in value.items()
            if not is_sensitive_column(str(key))
        }
    if isinstance(value, list):
        return [_sanitize_value(item) for item in value]
    return value


def sanitize_result_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Defense in depth before query evidence crosses the LLM boundary."""
    return [_sanitize_value(row) for row in rows]


def _source_configured() -> bool:
    return bool(os.getenv("SOURCE_DB_HOST") and os.getenv("SOURCE_DB_USER") and os.getenv("SOURCE_DB_PASSWORD"))


def _source_conn():
    if not _source_configured():
        raise RuntimeError("Source metadata connection is not configured")
    return psycopg2.connect(
        host=os.environ["SOURCE_DB_HOST"],
        port=int(os.getenv("SOURCE_DB_PORT", "6543")),
        user=os.environ["SOURCE_DB_USER"],
        password=os.environ["SOURCE_DB_PASSWORD"],
        dbname=os.getenv("SOURCE_DB_NAME", "postgres"),
        sslmode=os.getenv("SOURCE_DB_SSLMODE", "require"),
        connect_timeout=10,
        cursor_factory=psycopg2.extras.RealDictCursor,
        options="-c statement_timeout=30000 -c default_transaction_read_only=on",
    )


def _introspect(connection_factory: Callable[[], Any], schemas: Optional[List[str]] = None) -> Dict[str, Any]:
    params: List[Any] = []
    schema_filter = ""
    if schemas:
        schema_filter = "AND n.nspname = ANY(%s)"
        params.append(schemas)
    else:
        schema_filter = "AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%%'"

    with connection_factory() as conn:
        conn.set_session(readonly=True, autocommit=False)
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT n.nspname AS schema_name, c.relname AS object_name,
                       CASE c.relkind WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized_view'
                            WHEN 'p' THEN 'partitioned_table' ELSE 'table' END AS object_type,
                       GREATEST(COALESCE(st.n_live_tup, c.reltuples)::bigint, 0) AS estimated_rows,
                       obj_description(c.oid, 'pg_class') AS comment,
                       CASE WHEN c.relkind IN ('v', 'm') THEN pg_get_viewdef(c.oid, true) END AS view_definition
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                LEFT JOIN pg_stat_all_tables st ON st.relid = c.oid
                WHERE c.relkind IN ('r', 'p', 'v', 'm') {schema_filter}
                ORDER BY n.nspname, c.relname
                """,
                params,
            )
            objects = [dict(row) for row in cur.fetchall()]

            cur.execute(
                f"""
                SELECT n.nspname AS schema_name, c.relname AS object_name,
                       a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS data_type,
                       NOT a.attnotnull AS nullable, a.attnum AS ordinal_position,
                       col_description(c.oid, a.attnum) AS comment
                FROM pg_attribute a
                JOIN pg_class c ON c.oid = a.attrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relkind IN ('r', 'p', 'v', 'm') AND a.attnum > 0 AND NOT a.attisdropped
                  {schema_filter}
                ORDER BY n.nspname, c.relname, a.attnum
                """,
                params,
            )
            columns = [dict(row) for row in cur.fetchall()]

            cur.execute(
                f"""
                SELECT ns.nspname AS schema_name, cls.relname AS object_name,
                       con.contype, att.attname AS column_name, keys.ordinality AS position
                FROM pg_constraint con
                JOIN pg_class cls ON cls.oid = con.conrelid
                JOIN pg_namespace ns ON ns.oid = cls.relnamespace
                JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS keys(attnum, ordinality) ON true
                JOIN pg_attribute att ON att.attrelid = cls.oid AND att.attnum = keys.attnum
                WHERE con.contype IN ('p', 'u') {schema_filter.replace('n.nspname', 'ns.nspname')}
                ORDER BY ns.nspname, cls.relname, con.contype, keys.ordinality
                """,
                params,
            )
            key_rows = [dict(row) for row in cur.fetchall()]

            cur.execute(
                f"""
                SELECT src_ns.nspname AS from_schema, src.relname AS from_table,
                       src_att.attname AS from_column, dst_ns.nspname AS to_schema,
                       dst.relname AS to_table, dst_att.attname AS to_column,
                       con.conname AS constraint_name
                FROM pg_constraint con
                JOIN pg_class src ON src.oid = con.conrelid
                JOIN pg_namespace src_ns ON src_ns.oid = src.relnamespace
                JOIN pg_class dst ON dst.oid = con.confrelid
                JOIN pg_namespace dst_ns ON dst_ns.oid = dst.relnamespace
                JOIN LATERAL generate_subscripts(con.conkey, 1) AS s(i) ON true
                JOIN pg_attribute src_att ON src_att.attrelid = src.oid AND src_att.attnum = con.conkey[s.i]
                JOIN pg_attribute dst_att ON dst_att.attrelid = dst.oid AND dst_att.attnum = con.confkey[s.i]
                WHERE con.contype = 'f' {schema_filter.replace('n.nspname', 'src_ns.nspname')}
                ORDER BY src_ns.nspname, src.relname, con.conname, s.i
                """,
                params,
            )
            foreign_keys = [dict(row) for row in cur.fetchall()]

            cur.execute(
                f"""
                SELECT n.nspname AS schema_name, t.relname AS object_name,
                       i.relname AS index_name, pg_get_indexdef(ix.indexrelid) AS definition
                FROM pg_index ix
                JOIN pg_class t ON t.oid = ix.indrelid
                JOIN pg_class i ON i.oid = ix.indexrelid
                JOIN pg_namespace n ON n.oid = t.relnamespace
                WHERE true {schema_filter}
                ORDER BY n.nspname, t.relname, i.relname
                """,
                params,
            )
            indexes = [dict(row) for row in cur.fetchall()]

        conn.rollback()

    by_name: Dict[str, Dict[str, Any]] = {}
    for row in objects:
        qualified = f"{row['schema_name']}.{row['object_name']}"
        by_name[qualified] = {
            "schema": row["schema_name"],
            "table": row["object_name"],
            "qualified_name": qualified,
            "object_type": row["object_type"],
            "estimated_rows": int(row.get("estimated_rows") or 0),
            "comment": row.get("comment"),
            "view_definition": row.get("view_definition"),
            "columns": [],
            "primary_key": [],
            "unique_keys": [],
            "relationships": [],
            "indexes": [],
        }
    for row in columns:
        target = by_name.get(f"{row['schema_name']}.{row['object_name']}")
        if target is not None:
            target["columns"].append({
                "name": row["column_name"],
                "data_type": row["data_type"],
                "nullable": bool(row["nullable"]),
                "primary_key": False,
                "foreign_key": None,
                "sensitive": is_sensitive_column(row["column_name"]),
                "comment": row.get("comment"),
            })
    for row in key_rows:
        target = by_name.get(f"{row['schema_name']}.{row['object_name']}")
        if target is None:
            continue
        key = "primary_key" if row["contype"] == "p" else "unique_keys"
        target[key].append(row["column_name"])
        if row["contype"] == "p":
            for column in target["columns"]:
                if column["name"] == row["column_name"]:
                    column["primary_key"] = True
    for row in foreign_keys:
        source = by_name.get(f"{row['from_schema']}.{row['from_table']}")
        if source is None:
            continue
        relation = {
            "from_column": row["from_column"],
            "to_table": f"{row['to_schema']}.{row['to_table']}",
            "to_column": row["to_column"],
            "source": "physical",
            "constraint": row["constraint_name"],
        }
        source["relationships"].append(relation)
        for column in source["columns"]:
            if column["name"] == row["from_column"]:
                column["foreign_key"] = {
                    "table": relation["to_table"], "column": relation["to_column"], "source": "physical"
                }
    for row in indexes:
        target = by_name.get(f"{row['schema_name']}.{row['object_name']}")
        if target is not None:
            target["indexes"].append({"name": row["index_name"], "definition": row["definition"]})

    return {
        "refreshed_at": datetime.now(timezone.utc).isoformat(),
        "tables": list(by_name.values()),
        "table_map": by_name,
        "table_count": len(by_name),
    }


def _cached(name: str, ttl: int, loader: Callable[[], Dict[str, Any]], force: bool = False) -> Dict[str, Any]:
    now = time.monotonic()
    with _lock:
        entry = _cache.get(name)
        if entry and not force and now - entry["loaded_at"] < ttl:
            return entry["value"]
    try:
        value = loader()
    except Exception:
        with _lock:
            entry = _cache.get(name)
            if entry:
                return entry["value"]
        raise
    with _lock:
        _cache[name] = {"loaded_at": now, "value": value}
    return value


def get_local_metadata(force: bool = False) -> Dict[str, Any]:
    meta = _cached("local", LOCAL_TTL_SECONDS, lambda: _introspect(get_db_conn), force)
    table_map = meta.get("table_map", {})
    # Self-healing: If silver views are missing but source tables exist, initialize views and refresh cache
    if "silver.don_hang" not in table_map and "orders.don_hang" in table_map:
        try:
            from db import init_warehouse_views
            if init_warehouse_views():
                meta = _cached("local", LOCAL_TTL_SECONDS, lambda: _introspect(get_db_conn), force=True)
        except Exception:
            pass
    return meta


def get_source_metadata(force: bool = False) -> Dict[str, Any]:
    return _cached("source", SOURCE_TTL_SECONDS, lambda: _introspect(_source_conn, SOURCE_SCHEMAS), force)


def get_combined_metadata(include_source: bool = True) -> Dict[str, Any]:
    local = get_local_metadata()
    combined = deepcopy(local)
    source = None
    source_error = None
    if include_source and _source_configured():
        try:
            source = get_source_metadata()
        except Exception as exc:
            source_error = type(exc).__name__

    # The warehouse is authoritative for queryable objects. Source metadata only
    # enriches relationships that data-sync did not preserve.
    table_map = combined["table_map"]
    recovered = []
    if source:
        for source_table in source["tables"]:
            local_table = table_map.get(source_table["qualified_name"])
            if not local_table:
                continue
            existing = {
                (rel["from_column"], rel["to_table"], rel["to_column"])
                for rel in local_table["relationships"]
            }
            for relation in source_table["relationships"]:
                key = (relation["from_column"], relation["to_table"], relation["to_column"])
                if key not in existing:
                    enriched = {**relation, "source": "source_physical"}
                    local_table["relationships"].append(enriched)
                    recovered.append({"table": source_table["qualified_name"], **enriched})

    return {**combined, "source_ready": source is not None, "source_error": source_error, "recovered_relationships": recovered}


def cache_status() -> Dict[str, Any]:
    with _lock:
        local = _cache.get("local")
        source = _cache.get("source")
    return {
        "local_ready": bool(local),
        "source_ready": bool(source),
        "last_refresh": local["value"].get("refreshed_at") if local else None,
        "tables": local["value"].get("table_count", 0) if local else 0,
        "source_configured": _source_configured(),
    }
