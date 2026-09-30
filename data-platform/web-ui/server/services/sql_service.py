import re
import time
from dataclasses import dataclass
from typing import Any, Dict, List

from db import get_db_conn


FORBIDDEN_KEYWORDS = {
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE", "GRANT",
    "REVOKE", "COPY", "CALL", "DO", "CREATE", "MERGE", "VACUUM",
    "ANALYZE", "REFRESH", "EXECUTE", "LOCK",
}


class SqlSafetyError(ValueError):
    pass


@dataclass
class QueryExecutionError(Exception):
    message: str
    sqlstate: str | None = None

    def __str__(self) -> str:
        return self.message


def _mask_literals_and_comments(sql: str) -> str:
    output: List[str] = []
    i = 0
    state = "normal"
    dollar_tag = ""
    while i < len(sql):
        ch = sql[i]
        nxt = sql[i + 1] if i + 1 < len(sql) else ""
        if state == "normal":
            if ch == "'":
                state = "single"
                output.append(" ")
            elif ch == '"':
                state = "double"
                output.append(" ")
            elif ch == "-" and nxt == "-":
                state = "line_comment"
                output.extend("  ")
                i += 1
            elif ch == "/" and nxt == "*":
                state = "block_comment"
                output.extend("  ")
                i += 1
            elif ch == "$":
                match = re.match(r"\$[A-Za-z_0-9]*\$", sql[i:])
                if match:
                    dollar_tag = match.group(0)
                    state = "dollar"
                    output.extend(" " * len(dollar_tag))
                    i += len(dollar_tag) - 1
                else:
                    output.append(ch)
            else:
                output.append(ch)
        elif state == "single":
            output.append(" ")
            if ch == "'":
                if nxt == "'":
                    output.append(" ")
                    i += 1
                else:
                    state = "normal"
        elif state == "double":
            output.append(" ")
            if ch == '"':
                if nxt == '"':
                    output.append(" ")
                    i += 1
                else:
                    state = "normal"
        elif state == "line_comment":
            output.append("\n" if ch == "\n" else " ")
            if ch == "\n":
                state = "normal"
        elif state == "block_comment":
            output.append(" ")
            if ch == "*" and nxt == "/":
                output.append(" ")
                i += 1
                state = "normal"
        elif state == "dollar":
            if sql.startswith(dollar_tag, i):
                output.extend(" " * len(dollar_tag))
                i += len(dollar_tag) - 1
                state = "normal"
            else:
                output.append(" ")
        i += 1
    if state in {"single", "double", "block_comment", "dollar"}:
        raise SqlSafetyError("Câu lệnh SQL chứa chuỗi hoặc chú thích chưa đóng.")
    return "".join(output)


def validate_read_only_sql(sql: str) -> str:
    clean = (sql or "").strip()
    if not clean:
        raise SqlSafetyError("Câu lệnh SQL không được để trống.")
    masked = _mask_literals_and_comments(clean)
    semicolons = [idx for idx, char in enumerate(masked) if char == ";"]
    if semicolons:
        if len(semicolons) > 1 or masked[semicolons[0] + 1:].strip():
            raise SqlSafetyError("Chỉ được phép thực thi một câu lệnh SQL.")
        clean = clean[:semicolons[0]].rstrip()
        masked = masked[:semicolons[0]]

    upper = masked.upper().strip()
    if not re.match(r"^(SELECT|WITH)\b", upper):
        raise SqlSafetyError("Chỉ cho phép truy vấn SELECT hoặc WITH ... SELECT chỉ đọc.")
    for keyword in FORBIDDEN_KEYWORDS:
        if re.search(rf"\b{keyword}\b", upper):
            raise SqlSafetyError(f"Không được phép chứa thao tác '{keyword}'.")
    if re.search(r"\bFOR\s+(UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE)\b", upper):
        raise SqlSafetyError("Không cho phép khóa bản ghi trong truy vấn phân tích.")
    if re.search(r"\bSELECT\s+.+?\bINTO\b", upper, flags=re.DOTALL):
        raise SqlSafetyError("SELECT INTO không được phép.")
    if upper.startswith("WITH") and not re.search(r"\bSELECT\b", upper):
        raise SqlSafetyError("CTE phải kết thúc bằng một truy vấn SELECT.")
    return clean


def execute_read_only(sql: str, row_limit: int = 500, timeout_ms: int = 12000) -> Dict[str, Any]:
    safe_sql = validate_read_only_sql(sql)
    conn = get_db_conn()
    started = time.perf_counter()
    try:
        with conn.cursor() as cur:
            cur.execute("SET TRANSACTION READ ONLY")
            cur.execute("SET LOCAL statement_timeout = %s", (int(timeout_ms),))
            cur.execute("SET LOCAL search_path TO gold, orders, menu, identity, inventory, analytics, public")
            cur.execute(safe_sql)
            rows = cur.fetchmany(row_limit + 1) if cur.description else []
            truncated = len(rows) > row_limit
            rows = rows[:row_limit]
            columns = [description[0] for description in cur.description] if cur.description else []
            return {
                "columns": columns,
                "rows": [dict(row) for row in rows],
                "count": len(rows),
                "truncated": truncated,
                "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                "sql": safe_sql,
            }
    except SqlSafetyError:
        raise
    except Exception as exc:
        sqlstate = getattr(exc, "pgcode", None)
        raise QueryExecutionError(str(exc).strip(), sqlstate) from exc
    finally:
        conn.rollback()
        conn.close()
