"""Grounded operator plans, deterministic PostgreSQL, and independent contracts."""

from __future__ import annotations
import math
from datetime import date, datetime
from decimal import Decimal
from copy import deepcopy
import sqlglot
from sqlglot import exp
from services.analysis_catalog import AnalysisError, referenced_columns
from services.analysis_contract import (
    Component,
    Filter,
    QueryPlan,
    Ranking,
    ValidationResult,
    MAX_ANALYTICAL_ROWS,
)
from services.sql_service import (
    validate_read_only_sql,
    validate_ai_query_scope,
    validate_sql_ast_security,
)
from services.metadata_service import is_sensitive_column


def build_plans(grounded, catalog):
    spec = grounded.analysis_spec
    kind = "ranking" if spec.analysis_kind == "comparison" else spec.analysis_kind
    components = spec.components or [
        Component(
            id="main",
            kind=kind,
            metrics=spec.metrics,
            dimensions=spec.dimensions,
            ranking=spec.ranking,
            detail_columns=spec.detail_columns,
        )
    ]
    plans = []
    for comp in components:
        component_subject = catalog.registry["subjects"][comp.subject or spec.subject]
        metrics = comp.metrics or (spec.metrics if comp.kind != "detail" else [])
        if comp.kind == "detail" and (
            comp.metrics or (not spec.components and spec.metrics)
        ):
            raise AnalysisError("plan", "Detail requests cannot aggregate metrics")
        if comp.kind != "detail" and not metrics:
            raise AnalysisError(
                "clarification",
                "Select an explicit metric",
                grounded.subject["metrics"],
            )
        source = (
            component_subject.get("detail_source", component_subject["source"])
            if comp.kind == "detail"
            else grounded.metrics[metrics[0]]["source"]
        )
        if any(grounded.metrics[m]["source"] != source for m in metrics):
            raise AnalysisError(
                "unsupported",
                "Metrics at different fact grains require separate components",
            )
        dimensions = (
            list(comp.detail_columns or component_subject["detail_columns"])
            if comp.kind == "detail"
            else list(comp.dimensions)
        )
        if not dimensions and comp.kind in ("ranking", "distribution"):
            dimensions = [component_subject["default_dimension"]]
        # Labels are not unique entity keys. Add authoritative identities when
        # needed so equal display names do not collapse distinct entities.
        for name in list(dimensions):
            identity = catalog.registry["dimensions"][name].get("identity")
            if identity and identity not in dimensions:
                dimensions.append(identity)
        ranking = comp.ranking or (spec.ranking if comp.kind == "ranking" else None)
        if comp.kind == "ranking" and not ranking:
            raise AnalysisError("plan", "Ranking requires explicit Top N and ordering")
        if ranking:
            if ranking.metric not in metrics:
                raise AnalysisError("plan", "Rank metric must be a selected metric")
            for d in ranking.per_group:
                if d not in dimensions:
                    dimensions.append(d)
        groups = (
            comp.comparison_groups
            if comp.comparison_groups is not None
            else spec.comparison_groups
        ) or [None]
        for group in groups:
            rank = (
                ranking.model_copy(update={"top_n": group.top_n})
                if group and group.top_n and ranking
                else ranking
            )
            filters = (
                list(spec.filters)
                + list(comp.filters)
                + (list(group.filters) if group else [])
            )
            for m in metrics:
                for raw in grounded.metrics[m].get("business_filters", []):
                    f = Filter.model_validate(raw)
                    if any(
                        old.dimension == f.dimension and old != f for old in filters
                    ):
                        raise AnalysisError(
                            "clarification",
                            "Requested filter conflicts with the authoritative metric definition",
                        )
                    if f not in filters:
                        filters.append(f)
            constrained = {}
            for f in filters:
                if f.operator not in ("eq", "in"):
                    continue
                values = set(f.value if f.operator == "in" else [f.value])
                constrained[f.dimension] = (
                    values
                    if f.dimension not in constrained
                    else constrained[f.dimension] & values
                )
                if not constrained[f.dimension]:
                    raise AnalysisError(
                        "clarification",
                        "Conflicting population filters: " + f.dimension,
                    )
            refs = []
            for m in metrics:
                if not set(dimensions + [f.dimension for f in filters]) <= set(
                    grounded.metrics[m]["allowed_dimensions"]
                ):
                    raise AnalysisError(
                        "unsupported_dimension",
                        "Dimensions are incompatible with the selected metric",
                    )
            for d in dimensions + [f.dimension for f in filters]:
                desc = grounded.dimensions.get(d) or catalog.registry["dimensions"].get(
                    d
                )
                if not desc:
                    raise AnalysisError("plan", f"Unknown dimension {d}")
                catalog.check_column(desc["table"], desc["column"])
                refs.append(desc["table"])
            time_columns = {grounded.metrics[m].get("time_column") for m in metrics}
            if len(time_columns) > 1:
                raise AnalysisError(
                    "unsupported", "Selected metrics have incompatible time semantics"
                )
            time_column = (
                next(iter(time_columns))
                if metrics
                else component_subject.get(
                    "detail_time_column", component_subject.get("time_column")
                )
            )
            needs_time = grounded.period["start"] or comp.kind == "trend"
            if needs_time and not time_column:
                raise AnalysisError(
                    "unsupported", "This snapshot metric has no historical time field"
                )
            if time_column:
                refs += [t for t, c in catalog.check_expression(time_column)]
            for m in metrics:
                refs += [
                    t
                    for t, c in catalog.check_expression(
                        grounded.metrics[m]["expression"]
                    )
                ]
                for col in grounded.metrics[m].get("required_non_null", []):
                    refs += [t for t, c in catalog.check_expression(col)]
            joins = []
            reached = {source}
            for table in sorted(set(refs)):
                for edge in catalog.path(source, table):
                    if edge["to_table"] not in reached:
                        joins.append(edge)
                        reached.add(edge["to_table"])
            limit = (
                rank.top_n if rank and not rank.per_group
                else 100 if comp.kind == "detail"
                else MAX_ANALYTICAL_ROWS
            )
            if comp.kind == "aggregate" and not dimensions:
                limit = 1
            elif comp.row_limit is not None and not rank:
                limit = comp.row_limit
            query_id = comp.id + (f"_g{groups.index(group)+1}" if group else "")
            outputs = (
                (["period"] if comp.kind == "trend" else [])
                + dimensions
                + metrics
                + (["rank_position"] if rank and rank.per_group else [])
            )
            orders = (
                [{"field": d, "direction": "ASC"} for d in rank.per_group]
                if rank
                else []
            )
            orders += (
                [{"field": rank.metric, "direction": rank.direction}]
                if rank
                else (
                    [{"field": "period", "direction": "ASC"}]
                    if comp.kind == "trend"
                    else []
                )
            )
            orders += [
                {"field": d, "direction": "ASC"}
                for d in dimensions
                if not rank or d not in rank.per_group
            ]
            if comp.order_by:
                if rank or comp.kind == "trend":
                    raise AnalysisError(
                        "plan", "Ranking and time ordering are authoritative"
                    )
                if any(
                    set(o) != {"field", "direction"}
                    or o["field"] not in outputs
                    or o["direction"] not in ("ASC", "DESC")
                    for o in comp.order_by
                ):
                    raise AnalysisError(
                        "plan", "Ordering requires projected logical fields"
                    )
                orders = list(comp.order_by) + [
                    o
                    for o in orders
                    if o["field"] not in {s["field"] for s in comp.order_by}
                ]
            plans.append(
                QueryPlan(
                    id=query_id,
                    kind=comp.kind,
                    subject=comp.subject or spec.subject,
                    source=source,
                    metrics=metrics,
                    dimensions=dimensions,
                    filters=filters,
                    metric_expressions={
                        m: grounded.metrics[m]["expression"] for m in metrics
                    },
                    group_by=(
                        []
                        if comp.kind == "detail"
                        else (["period"] if comp.kind == "trend" else []) + dimensions
                    ),
                    output_columns=outputs,
                    order_by=orders,
                    ctes=(
                        ["aggregate_rows", "ranked_rows"]
                        if rank and rank.per_group
                        else []
                    ),
                    scope_ref=query_id,
                    joins=joins,
                    time_column=time_column,
                    period=grounded.period,
                    granularity=spec.granularity,
                    ranking=rank,
                    row_limit=limit,
                    group=group.name if group else None,
                    schema_fingerprint=grounded.schema_fingerprint,
                    explicit_limit=comp.row_limit is not None,
                )
            )
    return plans


def validate_plan(plan, grounded, catalog):
    expected = {p.id: p for p in build_plans(grounded, catalog)}
    okay = plan.id in expected and plan.model_dump() == expected[plan.id].model_dump()
    return ValidationResult(
        valid=okay,
        category="plan",
        errors=[] if okay else ["Plan differs from the grounded analysis contract"],
    )


def _literal(value):
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return str(value)
    raise AnalysisError("plan", "Unsupported filter literal")


def _ident(name):
    import re

    if not re.fullmatch(r"[a-z][a-z0-9_]*", name):
        raise AnalysisError("metadata", "Invalid registry identifier")
    return '"' + name + '"'


def compile_sql(plan, grounded, catalog):
    tables = [plan.source] + [j["to_table"] for j in plan.joins]
    aliases = {name: "t" + str(i) for i, name in enumerate(tables)}

    def expression(raw):
        tree = sqlglot.parse_one(raw, read="postgres")
        for col in tree.find_all(exp.Column):
            table = col.db + "." + col.table
            catalog.check_column(table, col.name)
            if table not in aliases:
                raise AnalysisError("plan", "Expression references an unplanned table")
            col.set("db", None)
            col.set("catalog", None)
            col.set("table", exp.to_identifier(aliases[table]))
        return tree.sql(dialect="postgres")

    def dimension(name):
        d = catalog.registry["dimensions"][name]
        raw = d.get("expression") or d["table"] + "." + d["column"]
        return expression(raw)

    columns = []
    groups = []
    if plan.kind == "trend":
        table, column = referenced_columns(plan.time_column)[0]
        dtype = next(
            c.get("data_type", "")
            for c in catalog.tables[table]["columns"]
            if c["name"] == column
        )
        local_time = expression(plan.time_column)
        if "with time zone" in dtype:
            local_time += " AT TIME ZONE " + _literal(plan.period["timezone"])
        period = f"DATE_TRUNC('{plan.granularity}', {local_time})"
        columns.append(period + " AS period")
        groups.append(period)
    for name in plan.dimensions:
        value = dimension(name)
        columns.append(value + " AS " + _ident(name))
        if plan.kind != "detail":
            groups.append(value)
    for name in plan.metrics:
        columns.append(
            expression(grounded.metrics[name]["expression"]) + " AS " + _ident(name)
        )
    if not columns:
        raise AnalysisError("plan", "Query must project explicit fields")
    query = (
        "SELECT "
        + ", ".join(columns)
        + " FROM "
        + plan.source
        + " AS "
        + aliases[plan.source]
    )
    for j in plan.joins:
        query += (
            " JOIN "
            + j["to_table"]
            + " AS "
            + aliases[j["to_table"]]
            + " ON "
            + expression(j["on"])
        )
    predicates = []
    for f in plan.filters:
        left = dimension(f.dimension)
        right = (
            "(" + ", ".join(_literal(v) for v in f.value) + ")"
            if f.operator == "in"
            else _literal(f.value)
        )
        op = {"eq": "=", "in": "IN", "gt": ">", "gte": ">=", "lt": "<", "lte": "<="}[
            f.operator
        ]
        predicates.append(f"{left} {op} {right}")
    if plan.period["start"]:
        col = expression(plan.time_column)
        # Catalog timestamps without time zone represent warehouse local wall
        # time; timestamptz requires explicit timezone conversion for boundaries.
        table, column = referenced_columns(plan.time_column)[0]
        dtype = next(
            c.get("data_type", "")
            for c in catalog.tables[table]["columns"]
            if c["name"] == column
        )
        if "with time zone" in dtype:
            col = f'({col} AT TIME ZONE {_literal(plan.period["timezone"])})'
        predicates += [
            f"{col} >= DATE {_literal(plan.period['start'])}",
            f"{col} < DATE {_literal(plan.period['end_exclusive'])}",
        ]
    for mid in plan.metrics:
        predicates += [
            expression(col) + " IS NOT NULL"
            for col in grounded.metrics[mid].get("required_non_null", [])
        ]
    if predicates:
        query += " WHERE " + " AND ".join("(" + p + ")" for p in predicates)
    if groups:
        query += " GROUP BY " + ", ".join(groups)
    tie = [_ident(d) + " ASC NULLS LAST" for d in plan.dimensions]
    if plan.ranking:
        order = (
            _ident(plan.ranking.metric) + " " + plan.ranking.direction + " NULLS LAST"
        )
        tie = [
            t for t, d in zip(tie, plan.dimensions) if d not in plan.ranking.per_group
        ]
        if plan.ranking.per_group:
            projected = ["period"] if plan.kind == "trend" else []
            projected += plan.dimensions + plan.metrics
            fields = ", ".join(_ident(f) for f in projected)
            partition = ", ".join(_ident(d) for d in plan.ranking.per_group)
            query = (
                f"WITH aggregate_rows AS ({query}), ranked_rows AS (SELECT {fields}, ROW_NUMBER() OVER (PARTITION BY {partition} ORDER BY "
                + ", ".join([order] + tie)
                + f") AS rank_position FROM aggregate_rows) SELECT {fields}, rank_position FROM ranked_rows WHERE rank_position <= {plan.ranking.top_n} ORDER BY "
                + ", ".join(
                    [_ident(d) + " ASC NULLS LAST" for d in plan.ranking.per_group]
                    + [order]
                    + tie
                )
            )
        else:
            query += " ORDER BY " + ", ".join([order] + tie)
    elif plan.kind == "trend":
        query += " ORDER BY period ASC" + (", " + ", ".join(tie) if tie else "")
    elif plan.order_by:
        query += " ORDER BY " + ", ".join(
            _ident(o["field"]) + " " + o["direction"] + " NULLS LAST"
            for o in plan.order_by
        )
    # Fetch one overflow row for non-ranking populations; fail explicitly rather
    # than presenting a truncated cohort as the complete requested population.
    sql_limit = (
        plan.row_limit
        if plan.explicit_limit or plan.ranking and not plan.ranking.per_group
        else plan.row_limit + 1
    )
    return query + " LIMIT " + str(sql_limit)


def validate_sql(sql, plan, grounded, catalog):
    try:
        verdict = validate_plan(plan, grounded, catalog)
        if not verdict.valid:
            return verdict
        statements = sqlglot.parse(sql, read="postgres")
        if len(statements) != 1 or not isinstance(statements[0], exp.Select):
            raise AnalysisError("security", "Only one SELECT/CTE is allowed")
        tree = statements[0]
        expected = sqlglot.parse_one(
            compile_sql(plan, grounded, catalog), read="postgres"
        )
        # AST equality includes every predicate/OR, join, projected expression,
        # GROUP/HAVING, ORDER, LIMIT, CTE and window partition. Strict equality
        # deliberately rejects unverifiable equivalent rewrites.
        if tree != expected:
            errors = []
            for node, label in (
                (exp.Limit, "limit"),
                (exp.Where, "filters/time"),
                (exp.Order, "ordering"),
                (exp.Group, "grouping"),
                (exp.Join, "joins"),
                (exp.Window, "per-group ranking"),
                (exp.AggFunc, "metric aggregation"),
            ):
                if [n.sql(dialect="postgres") for n in tree.find_all(node)] != [
                    n.sql(dialect="postgres") for n in expected.find_all(node)
                ]:
                    errors.append(label + " differs from AnalysisSpec")
            return ValidationResult(
                valid=False,
                category="sql_semantics",
                errors=errors or ["Projection/source differs from AnalysisSpec"],
            )
        validate_read_only_sql(sql)
        # Preserve the existing scope checks. They remain an independent guard.
        policy = {
            t: set(catalog.policy["tables"][t])
            for t in [plan.source] + [j["to_table"] for j in plan.joins]
        }
        validate_ai_query_scope(sql, policy)
        validate_sql_ast_security(sql, policy)
        # Exact canonical AST references originate from check_column() in every
        # clause, including WHERE/HAVING/JOIN and CTE/window expressions.
        for col in tree.find_all(exp.Column):
            if is_sensitive_column(col.name):
                raise AnalysisError("privacy", "Sensitive SQL field")
        return ValidationResult(valid=True, category="sql_semantics")
    except Exception as exc:
        return ValidationResult(
            valid=False,
            category=getattr(exc, "category", "security"),
            errors=["SQL rejected by " + type(exc).__name__],
        )


def validate_results(result, plan, grounded, catalog):
    errors = []
    rows = result.get("rows", [])
    fields = (
        plan.dimensions
        + plan.metrics
        + (["period"] if plan.kind == "trend" else [])
        + (["rank_position"] if plan.ranking and plan.ranking.per_group else [])
    )
    if result.get("truncated") or len(rows) > plan.row_limit:
        errors.append("Result population exceeds the supported row contract")
    if set(result.get("columns", fields)) != set(fields):
        errors.append("Result columns differ from the planned projection")
    if any(set(row) != set(fields) for row in rows):
        errors.append("Result row fields differ from the planned projection")
    for row in rows:
        if any(is_sensitive_column(k) for k in row):
            errors.append("Sensitive result field")
        for m in plan.metrics:
            value = row.get(m)
            if value is None:
                continue  # SQL aggregate over an empty cohort is NULL, never a fabricated zero.
            if (
                isinstance(value, bool)
                or not isinstance(value, (int, float, Decimal))
                or not math.isfinite(float(value))
            ):
                errors.append("Metric must be finite numeric: " + m)
            elif grounded.metrics[m].get("non_negative") and value < 0:
                errors.append("Negative metric: " + m)
        for f in plan.filters:
            if f.dimension not in row:
                continue
            value = row[f.dimension]
            try:
                okay = {
                    "eq": lambda: value == f.value,
                    "in": lambda: value in f.value,
                    "gt": lambda: value > f.value,
                    "gte": lambda: value >= f.value,
                    "lt": lambda: value < f.value,
                    "lte": lambda: value <= f.value,
                }[f.operator]()
            except TypeError:
                okay = False
            if not okay:
                errors.append("Returned dimension violates filter: " + f.dimension)
        if plan.period["start"]:
            for dimension in plan.dimensions:
                definition = catalog.registry["dimensions"][dimension]
                if (
                    (definition.get("expression") or definition["table"] + "." + definition["column"]) != plan.time_column
                    or row.get(dimension) is None
                ):
                    continue
                try:
                    raw = row[dimension]
                    value = (
                        raw
                        if isinstance(raw, (date, datetime))
                        else datetime.fromisoformat(str(raw))
                    )
                    if isinstance(value, datetime):
                        if value.tzinfo:
                            from zoneinfo import ZoneInfo

                            value = value.astimezone(ZoneInfo(plan.period["timezone"]))
                        value = value.date()
                    if (
                        not date.fromisoformat(plan.period["start"])
                        <= value
                        <= date.fromisoformat(plan.period["end"])
                    ):
                        errors.append("Detail timestamp outside requested period")
                except (ValueError, TypeError):
                    errors.append("Invalid detail timestamp")
        if plan.kind == "trend":
            try:
                value = row["period"]
                value = (
                    value.date()
                    if isinstance(value, datetime)
                    else (
                        date.fromisoformat(str(value)[:10])
                        if not isinstance(value, date)
                        else value
                    )
                )
                if plan.period["start"]:
                    start = date.fromisoformat(plan.period["start"])
                    # The bucket label can precede a custom range (month/week).
                    from services.analysis_catalog import resolve_period
                    from services.analysis_contract import TimeScope

                    mode = "current_" + plan.granularity
                    bucket_start = date.fromisoformat(
                        resolve_period(TimeScope(mode=mode), start)["start"]
                    )
                    if (
                        not bucket_start
                        <= value
                        <= date.fromisoformat(plan.period["end"])
                    ):
                        errors.append("Time bucket outside requested period")
            except (KeyError, ValueError, TypeError):
                errors.append("Invalid time bucket")
    if plan.ranking:
        batches = {}
        for row in rows:
            key = tuple(str(row.get(d)) for d in plan.ranking.per_group)
            batches.setdefault(key, []).append(row)
        for batch in batches.values():
            if len(batch) > plan.ranking.top_n:
                errors.append("Top N exceeded")
            values = [r.get(plan.ranking.metric) for r in batch]
            finite = [
                float(v)
                for v in values
                if isinstance(v, (int, float, Decimal))
                and not isinstance(v, bool)
                and math.isfinite(float(v))
            ]
            if len(finite) != sum(v is not None for v in values) or finite != sorted(
                finite, reverse=plan.ranking.direction == "DESC"
            ):
                errors.append("Metric ordering violates ranking")
            if any(v is None for v in values) and values != [
                v for v in values if v is not None
            ] + [None] * values.count(None):
                errors.append("NULL ordering violates ranking")
            if plan.ranking.per_group and [
                r.get("rank_position") for r in batch
            ] != list(range(1, len(batch) + 1)):
                errors.append("Invalid per-group rank positions")
    if plan.kind == "trend":
        values = [str(r.get("period")) for r in rows]
        if values != sorted(values):
            errors.append("Time buckets must be ascending")
    if not plan.ranking and plan.kind != "trend" and plan.order_by:
        # Numeric ordering is independently observable. Text collation belongs
        # to PostgreSQL; its exact ORDER clause is already bound by AST equality.
        for previous, current in zip(rows, rows[1:]):
            for order in plan.order_by:
                left, right = previous.get(order["field"]), current.get(order["field"])
                if left == right:
                    continue
                if left is None and right is not None:
                    errors.append("NULL ordering violates requested ordering")
                elif (
                    right is not None
                    and isinstance(left, (int, float, Decimal))
                    and isinstance(right, (int, float, Decimal))
                ):
                    if left > right if order["direction"] == "ASC" else left < right:
                        errors.append("Numeric ordering violates requested ordering")
                break
    # One row per grouping grain. Duplicate group tuples reveal fanout or a
    # malformed fixture/result even when row count is within Top N.
    if plan.kind != "detail":
        dims = plan.dimensions + (["period"] if plan.kind == "trend" else [])
        keys = [tuple(str(r.get(d)) for d in dims) for r in rows]
        if len(keys) != len(set(keys)):
            errors.append("Duplicate analytical grain")
    return ValidationResult(
        valid=not errors, category="result_contract", errors=list(dict.fromkeys(errors))
    )
