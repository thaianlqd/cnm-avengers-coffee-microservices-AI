import re
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Set, Tuple

from db import get_db_conn


FORBIDDEN_KEYWORDS = {
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE", "GRANT",
    "REVOKE", "COPY", "CALL", "DO", "CREATE", "MERGE", "VACUUM",
    "ANALYZE", "REFRESH", "EXECUTE", "LOCK",
}

SQL_WORDS = {
    "ALL", "AND", "AS", "ASC", "BETWEEN", "BY", "CASE", "CURRENT_DATE",
    "CURRENT_TIMESTAMP", "DESC", "DISTINCT", "ELSE", "END", "EPOCH",
    "FALSE", "FILTER", "FROM", "GROUP", "HAVING", "HOUR", "IN", "INTERVAL",
    "IS", "LIMIT", "NOT", "NULL", "NULLS", "ON", "OR", "ORDER", "OVER",
    "PARTITION", "ROWS", "THEN", "TRUE", "WHEN", "WHERE", "WITH",
}
TABLE_ALIAS_STOP_WORDS = SQL_WORDS | {
    "CROSS", "FULL", "INNER", "JOIN", "LEFT", "OFFSET", "RIGHT", "UNION",
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


def _analysis_sql(sql: str) -> str:
    """Mask values/comments while retaining quoted identifiers for policy checks."""
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
                output.append('"')
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
        elif state == "double":
            if ch == '"':
                if nxt == '"':
                    output.append('"')
                    output.append('"')
                    i += 1
                else:
                    state = "normal"
                    output.append('"')
            else:
                output.append(" " if ch in "(),." else ch)
        elif state == "single":
            output.append(" ")
            if ch == "'":
                if nxt == "'":
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
    return "".join(output)


def _identifier(value: str) -> str:
    return value.strip().strip('"').lower()


def _cte_names(sql: str) -> Set[str]:
    identifier = r'(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)'
    return {
        _identifier(match.group(1))
        for match in re.finditer(rf'(?:\bWITH\b|,)\s*({identifier})\s+AS\s*\(', sql, re.IGNORECASE)
    }


def _table_references(sql: str) -> Tuple[Set[str], Dict[str, str]]:
    identifier = r'(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)'
    pattern = re.compile(
        rf'\b(?:FROM|JOIN)\s+({identifier}(?:\s*\.\s*{identifier})?)'
        rf'(?:\s+(?:AS\s+)?({identifier}))?',
        re.IGNORECASE,
    )
    # Mask EXTRACT(... FROM ...) expressions so scalar FROM is never confused with table FROM
    sql_masked = re.sub(r'(?i)\bEXTRACT\s*\([^)]+\)', lambda m: ' ' * len(m.group(0)), sql)
    ctes = _cte_names(sql)
    tables: Set[str] = set()
    aliases: Dict[str, str] = {}
    for match in pattern.finditer(sql_masked):
        raw_name = re.sub(r'\s+', '', match.group(1))
        parts = [_identifier(part) for part in raw_name.split('.')]
        table = '.'.join(parts)
        alias = _identifier(match.group(2)) if match.group(2) else parts[-1]
        if alias.upper() in TABLE_ALIAS_STOP_WORDS:
            alias = parts[-1]
        if table in ctes:
            aliases[alias] = f"cte:{table}"
            continue
        tables.add(table)
        aliases[alias] = table
        aliases[parts[-1]] = table
    return tables, aliases


def _select_lists(sql: str) -> List[str]:
    """Return every SELECT projection, including projections inside CTEs."""
    lists: List[str] = []
    words = list(re.finditer(r'\b(?:SELECT|FROM)\b', sql, re.IGNORECASE))
    for position, word in enumerate(words):
        if word.group(0).upper() != "SELECT":
            continue
        depth = sql[:word.start()].count("(") - sql[:word.start()].count(")")
        for candidate in words[position + 1:]:
            candidate_depth = sql[:candidate.start()].count("(") - sql[:candidate.start()].count(")")
            if candidate.group(0).upper() == "FROM" and candidate_depth == depth:
                lists.append(sql[word.end():candidate.start()])
                break
    return lists


def _split_projection(projection: str) -> List[str]:
    parts: List[str] = []
    start = 0
    depth = 0
    for index, char in enumerate(projection):
        if char == "(":
            depth += 1
        elif char == ")":
            depth = max(0, depth - 1)
        elif char == "," and depth == 0:
            parts.append(projection[start:index])
            start = index + 1
    parts.append(projection[start:])
    return [part.strip() for part in parts if part.strip()]


def _has_implicit_comma_join(sql: str, allowed_tables: Set[str]) -> bool:
    identifier = r'(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)'
    pattern = re.compile(
        rf'\bFROM\s+({identifier}(?:\s*\.\s*{identifier})?)'
        rf'(?:\s+(?:AS\s+)?({identifier}))?',
        re.IGNORECASE,
    )
    ctes = _cte_names(sql)
    for match in pattern.finditer(sql):
        table = '.'.join(_identifier(part) for part in re.sub(r'\s+', '', match.group(1)).split('.'))
        if table not in allowed_tables and table not in ctes:
            continue
        base_depth = sql[:match.start()].count("(") - sql[:match.start()].count(")")
        alias = _identifier(match.group(2)) if match.group(2) else ""
        index = match.start(2) if alias.upper() in TABLE_ALIAS_STOP_WORDS else match.end()
        depth = base_depth
        while index < len(sql):
            char = sql[index]
            if char == "(":
                depth += 1
            elif char == ")":
                if depth == base_depth:
                    break
                depth -= 1
            elif char == "," and depth == base_depth:
                return True
            if depth == base_depth and re.match(
                r'\b(?:WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|UNION)\b',
                sql[index:],
                re.IGNORECASE,
            ):
                break
            index += 1
    return False




def validate_ai_query_scope(sql: str, allowed_tables: Mapping[str, Set[str]]) -> str:
    """Apply the resolver's table and safe-column policy to AI-authored SQL."""
    clean = validate_read_only_sql(sql)
    analysis = _analysis_sql(clean)
    normalized_policy = {
        _identifier(table): {_identifier(column) for column in columns}
        for table, columns in allowed_tables.items()
    }
    if _has_implicit_comma_join(analysis, set(normalized_policy)):
        raise SqlSafetyError("SQL AI phải dùng JOIN tường minh; không cho phép danh sách bảng phân tách bằng dấu phẩy.")
    referenced_tables, aliases = _table_references(analysis)
    # PostgreSQL's EXTRACT(... FROM alias.column) contains a FROM token that is
    # not a table clause. It is safe to discard only when the qualifier is an
    # alias already bound to an allowlisted physical table.
    expression_sources = {
        table for table in referenced_tables
        if "." in table
        and aliases.get(table.split(".", 1)[0]) in normalized_policy
        and table not in normalized_policy
    }
    referenced_tables -= expression_sources
    unknown_tables = sorted(table for table in referenced_tables if table not in normalized_policy)
    if unknown_tables:
        raise SqlSafetyError(
            "SQL AI tham chiếu bảng ngoài phạm vi semantic resolver: " + ", ".join(unknown_tables)
        )
    if not referenced_tables:
        raise SqlSafetyError("SQL AI phải tham chiếu ít nhất một bảng đã được semantic resolver chọn.")

    safe_columns = set().union(*(normalized_policy[table] for table in referenced_tables))
    output_aliases = {
        _identifier(match.group(1))
        for match in re.finditer(r'\bAS\s+("[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)', analysis, re.IGNORECASE)
    }
    ctes = _cte_names(analysis)
    identifier = r'(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)'

    for select_list in _select_lists(analysis):
        for item in _split_projection(select_list):
            expression = re.sub(rf'\s+AS\s+{identifier}\s*$', '', item, flags=re.IGNORECASE).strip()
            if re.fullmatch(r'\*', expression) or re.search(rf'{identifier}\s*\.\s*\*', expression):
                raise SqlSafetyError("SQL AI không được phép dùng SELECT * hoặc table.*.")

            remainder = expression
            triples = list(re.finditer(rf'({identifier})\s*\.\s*({identifier})\s*\.\s*({identifier})', remainder))
            for match in triples:
                table = f"{_identifier(match.group(1))}.{_identifier(match.group(2))}"
                column = _identifier(match.group(3))
                if table not in normalized_policy or column not in normalized_policy[table]:
                    raise SqlSafetyError(f"Cột '{table}.{column}' không nằm trong allowlist của AI.")
            remainder = re.sub(rf'{identifier}\s*\.\s*{identifier}\s*\.\s*{identifier}', ' ', remainder)

            pairs = list(re.finditer(rf'({identifier})\s*\.\s*({identifier})', remainder))
            for match in pairs:
                qualifier = _identifier(match.group(1))
                column = _identifier(match.group(2))
                table = aliases.get(qualifier)
                if table and table.startswith("cte:"):
                    if column not in output_aliases:
                        raise SqlSafetyError(f"Cột CTE '{qualifier}.{column}' không được khai báo bởi truy vấn con.")
                elif not table or table not in normalized_policy or column not in normalized_policy[table]:
                    raise SqlSafetyError(f"Cột '{qualifier}.{column}' không nằm trong allowlist của AI.")
            remainder = re.sub(rf'{identifier}\s*\.\s*{identifier}', ' ', remainder)
            remainder = re.sub(r'::\s*[A-Za-z_][A-Za-z0-9_]*(?:\s*\[\s*\])?', ' ', remainder)
            remainder = re.sub(rf'\b{identifier}\s*(?=\()', ' ', remainder)
            for match in re.finditer(rf'{identifier}', remainder):
                token = match.group(0)
                normalized = _identifier(token)
                if not normalized:
                    continue
                if normalized.upper() in SQL_WORDS or normalized in ctes or normalized in aliases:
                    continue
                if normalized in safe_columns or normalized in output_aliases:
                    continue
                raise SqlSafetyError(f"Cột '{normalized}' không nằm trong allowlist của AI.")
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
