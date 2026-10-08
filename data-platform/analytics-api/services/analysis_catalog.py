"""Physical schema + curated business semantics. No guessed tables or joins."""

from __future__ import annotations
import hashlib
import json
import re
import unicodedata
from collections import deque
from copy import deepcopy
from datetime import datetime, date, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
from typing import Any
import sqlglot
from sqlglot import exp
from services.analysis_contract import AnalysisSpec, GroundedAnalysisSpec
from services.metadata_service import is_sensitive_column

CATALOG_PATH = (
    Path(__file__).resolve().parent.parent / "metadata" / "semantic_catalog.json"
)


class AnalysisError(ValueError):
    def __init__(self, category: str, message: str, choices=None, clarification=None):
        super().__init__(message)
        self.category, self.choices = category, choices or []
        self.clarification = clarification


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFD", str(text).lower().replace("đ", "d"))
    return re.sub(
        r"\s+", " ", "".join(c for c in text if unicodedata.category(c) != "Mn")
    ).strip()


def resolve_period(scope, today=None):
    tz = ZoneInfo(scope.timezone)
    now = today or datetime.now(tz).date()
    mode = scope.mode
    start = end = None
    if mode == "custom":
        start, end = scope.start, scope.end
    elif mode != "all_time":
        unit = mode.split("_", 1)[1]
        previous = mode.startswith("previous_")
        if unit == "day":
            start = end = now - timedelta(days=int(previous))
        elif unit == "week":
            start = now - timedelta(days=now.weekday() + 7 * int(previous))
            end = start + timedelta(days=6)
        else:
            width = {"month": 1, "quarter": 3, "year": 12}[unit]
            month = 1 if unit == "year" else ((now.month - 1) // width) * width + 1
            offset = now.year * 12 + month - 1 - width * int(previous)
            start = date(offset // 12, offset % 12 + 1, 1)
            nxt = offset + width
            end = date(nxt // 12, nxt % 12 + 1, 1) - timedelta(days=1)
    return {
        "mode": mode,
        "start": start.isoformat() if start else None,
        "end": end.isoformat() if end else None,
        "end_exclusive": (end + timedelta(days=1)).isoformat() if end else None,
        "timezone": scope.timezone,
    }


def referenced_columns(expression):
    tree = sqlglot.parse_one(expression, read="postgres")
    refs = []
    for col in tree.find_all(exp.Column):
        if not col.db or not col.table:
            raise AnalysisError(
                "metadata", "Registry expressions require fully qualified columns"
            )
        refs.append((col.db + "." + col.table, col.name))
    return refs


class AnalysisCatalog:
    def __init__(self, physical: dict, overlay: dict = None):
        self.overlay = (
            deepcopy(overlay)
            if overlay is not None
            else json.loads(CATALOG_PATH.read_text())
        )
        self.registry = self.overlay["analysis_registry"]
        from services.domain_intelligence_service import validate_profiles
        validate_profiles(self.registry)
        self.tables = {
            n: t
            for n, t in physical.get("table_map", {}).items()
            if n.startswith("silver.")
        }
        structural = {
            n: {
                "columns": sorted(
                    (
                        c["name"],
                        c.get("data_type", ""),
                        c.get("nullable"),
                        bool(c.get("sensitive")),
                        tuple(c.get("enum_values") or []),
                        tuple(c.get("safe_values") or []),
                    )
                    for c in t["columns"]
                ),
                "keys": t.get("primary_key", t.get("primary_keys", [])),
                "unique_keys": t.get("unique_keys", []),
                "relationships": sorted(
                    t.get("relationships", []),
                    key=lambda r: json.dumps(r, sort_keys=True),
                ),
            }
            for n, t in sorted(self.tables.items())
        }
        self.fingerprint = hashlib.sha256(
            json.dumps(
                {"physical": structural, "overlay": self.overlay},
                sort_keys=True,
                ensure_ascii=False,
                default=str,
            ).encode()
        ).hexdigest()
        self.edges = self._relationships()
        self.policy = {
            "tables": {
                n: [
                    c["name"]
                    for c in t["columns"]
                    if not is_sensitive_column(c["name"]) and not c.get("sensitive")
                ]
                for n, t in self.tables.items()
            }
        }

    def check_column(self, table, column):
        if table not in self.tables or column not in {
            c["name"] for c in self.tables[table]["columns"]
        }:
            raise AnalysisError(
                "metadata", f"Unavailable database field: {table}.{column}"
            )
        physical = next(c for c in self.tables[table]["columns"] if c["name"] == column)
        if is_sensitive_column(column) or physical.get("sensitive"):
            raise AnalysisError(
                "privacy", "Sensitive fields are unavailable for AI analysis"
            )

    def check_expression(self, expression):
        refs = referenced_columns(expression)
        for table, col in refs:
            self.check_column(table, col)
        return refs

    def _relationships(self):
        edges, seen = [], set()

        def add(left, right, on, provenance, target_unique, join_type='INNER'):
            if join_type not in {'INNER','LEFT'}:
                raise AnalysisError('metadata','Unsupported curated join type')
            if left not in self.tables or right not in self.tables or not target_unique:
                return
            try:
                refs = self.check_expression(on)
                tree = sqlglot.parse_one(on, read="postgres")
                predicates = (
                    list(tree.flatten()) if isinstance(tree, exp.And) else [tree]
                )
                if not all(isinstance(p, exp.EQ) for p in predicates) or {
                    t for t, c in refs
                } != {
                    left,
                    right,
                }:
                    return
            except (AnalysisError, sqlglot.errors.ParseError):
                return
            on = tree.sql(dialect="postgres")
            key = (left, right, on)
            if key not in seen:
                edges.append(
                    {
                        "from_table": left,
                        "to_table": right,
                        "on": on,
                        "cardinality": "many_to_one",
                        "provenance": provenance,
                        **({'join_type':'LEFT'} if join_type=='LEFT' else {}),
                    }
                )
                seen.add(key)

        for name, t in self.tables.items():
            groups = {}
            for relation in t.get("relationships", []):
                if not relation.get("from_column") or not relation.get("to_column"):
                    continue
                key = (
                    relation["to_table"],
                    relation.get("constraint_name")
                    or relation.get("constraint")
                    or relation["from_column"],
                )
                groups.setdefault(key, []).append(relation)
            for (target, _), relations in groups.items():
                clauses = [
                    f"{name}.{r['from_column']} = {target}.{r['to_column']}"
                    for r in sorted(relations, key=lambda r: r["from_column"])
                ]
                add(name, target, " AND ".join(clauses), "physical_foreign_key", True)
        # Views often lack FK constraints. Curated joins are usable only when
        # their target business key and every column are present physically.
        for name, t in self.overlay.get("silver_tables", {}).items():
            for r in t.get("joins", []):
                target = r["to_table"]
                try:
                    refs = referenced_columns(r["on"])
                except (AnalysisError, sqlglot.errors.ParseError):
                    continue
                pk = (
                    self.overlay["silver_tables"].get(target, {}).get("primary_key", [])
                )
                add(
                    name,
                    target,
                    r["on"],
                    "curated_view_relationship",
                    bool(pk) and {c for n, c in refs if n == target} == set(pk),
                    r.get('join_type','INNER'),
                )
        return sorted(edges, key=lambda e: (e["from_table"], e["to_table"], e["on"]))

    def path(self, source, target):
        if source == target:
            return []
        queue = deque([(source, [], {source})])
        found = []
        shortest = None
        while queue:
            table, path, visited = queue.popleft()
            if shortest is not None and len(path) >= shortest:
                continue
            for edge in self.edges:
                if edge["from_table"] != table or edge["to_table"] in visited:
                    continue
                trail = path + [edge]
                if edge["to_table"] == target:
                    shortest = len(trail)
                    found.append(trail)
                else:
                    queue.append(
                        (edge["to_table"], trail, visited | {edge["to_table"]})
                    )
        if found:
            # Minimum hops first; explicit business joins break physical-role
            # ties. Unresolved equally authoritative alternatives are ambiguous.
            found = [path for path in found if len(path) == min(map(len, found))]
            curated = lambda path: sum(
                e["provenance"] == "curated_view_relationship" for e in path
            )
            best = max(map(curated, found))
            found = [path for path in found if curated(path) == best]
            if len(found) > 1:
                raise AnalysisError(
                    "clarification",
                    "Several equally authoritative join roles are possible; clarify the dimension",
                )
            return found[0]
        raise AnalysisError(
            "unsupported",
            f"No authoritative, fanout-safe join from {source} to {target}",
        )

    def structured_table(self, name):
        physical = self.tables[name]
        overlay = self.overlay["silver_tables"].get(name, {})
        columns = []
        keys = physical.get("primary_key") or overlay.get("primary_key", [])
        for column in physical["columns"]:
            if is_sensitive_column(column["name"]) or column.get("sensitive"):
                continue
            dtype = column.get("data_type", "")
            full = name + "." + column["name"]
            enums = column.get("enum_values") or self.overlay.get("enums", {}).get(
                full, []
            )
            numeric = any(
                word in dtype
                for word in ("int", "numeric", "decimal", "real", "double")
            )
            role = (
                "identifier"
                if column["name"] in keys or column.get("foreign_key")
                else (
                    "timestamp"
                    if "date" in dtype or "timestamp" in dtype
                    else "enum" if enums else "metric" if numeric else "dimension"
                )
            )
            columns.append(
                {
                    "name": column["name"],
                    "data_type": dtype,
                    "role": role,
                    "sensitivity": "safe",
                    "enum_values": enums,
                    "allowed_aggregations": (
                        ["count", "sum", "avg", "min", "max"]
                        if numeric
                        else ["count", "count_distinct"]
                    ),
                }
            )
        return {
            "qualified_name": name,
            "business_name": overlay.get("business_name", name),
            "description": overlay.get("description", physical.get("comment") or ""),
            "analytical_role": overlay.get("analytical_role", "fact"),
            "grain": list(
                {
                    s["grain"]
                    for s in self.registry["subjects"].values()
                    if s["source"] == name
                }
            ),
            "primary_key": keys,
            "source_of_truth": "physical_silver_warehouse",
            "estimated_rows": physical.get("estimated_rows"),
            "columns": columns,
            "relationships": [e for e in self.edges if e["from_table"] == name],
        }

    def compatible_dimensions(self, metric):
        cache = getattr(self, "_dimension_compatibility", None)
        if cache is None:
            cache = self._dimension_compatibility = {}
        if metric in cache:
            return cache[metric]
        definition = self.registry["metrics"][metric]
        allowed = []
        for name, dimension in self.registry["dimensions"].items():
            if (
                definition.get("compatible_dimensions") is not None
                and name not in definition["compatible_dimensions"]
            ):
                continue
            try:
                self.check_column(dimension["table"], dimension["column"])
                self.path(definition["source"], dimension["table"])
                allowed.append(name)
            except AnalysisError:
                pass
        cache[metric] = sorted(allowed)
        return cache[metric]

    def candidates(
        self,
        prompt,
        top_k=4,
        vector_scores=None,
        vector_status="not_requested",
        preferred_subjects=None,
    ):
        from services.value_grounding_service import value_text

        text = value_text(prompt)
        stop = {
            value_text(v)
            for v in self.registry["interpretation"].get("retrieval_stopwords", [])
        }

        def relevance(aliases):
            hits = []
            for alias in set(value_text(a) for a in aliases):
                if len(alias) < 3 or not re.search(
                    r"(?<!\w)" + re.escape(alias) + r"(?!\w)", text
                ):
                    continue
                informative = [
                    word
                    for word in alias.split()
                    if word not in stop and not word.isdigit()
                ]
                if informative:
                    hits.append(len(informative))
            return max(hits, default=0) + min(len(hits), 3) * 0.05

        scores = []
        for sid, subject in self.registry["subjects"].items():
            if subject["source"] not in self.tables:
                continue
            direct = relevance(subject.get("aliases", []) + [subject["business_name"]])
            metric = max(
                (
                    relevance(self.registry["metrics"][m].get("aliases", []))
                    for m in subject["metrics"]
                ),
                default=0,
            )
            family = [subject["source"]] + subject.get("tables", [])
            vector = max(
                ((vector_scores or {}).get(table, 0) for table in family), default=0
            )
            score = direct * 4 + metric * 3 + vector
            if preferred_subjects and sid in preferred_subjects:
                score += 8  # authoritative current session context for refinement
            scores.append((score, sid))
        scores.sort(key=lambda pair: (-pair[0], pair[1]))
        strongest = scores[0][0] if scores else 0
        selected = [
            (score, sid)
            for score, sid in scores
            if score > 0 and score >= strongest * 0.35
        ][: min(top_k, 4)]
        subjects = {
            sid: deepcopy(self.registry["subjects"][sid]) for score, sid in selected
        }
        mids = {m for subject in subjects.values() for m in subject["metrics"]}
        metrics = {}
        for mid in sorted(mids):
            metric = self.registry["metrics"][mid]
            try:
                self.check_expression(metric["expression"])
                if metric.get("time_column"):
                    self.check_expression(metric["time_column"])
            except (AnalysisError, sqlglot.errors.ParseError):
                continue
            metrics[mid] = {
                k: v
                for k, v in metric.items()
                if k not in ("expression", "business_filters", "required_non_null")
            }
            metrics[mid]["allowed_dimensions"] = self.compatible_dimensions(mid)
        dims = {d for metric in metrics.values() for d in metric["allowed_dimensions"]}
        for subject in subjects.values():
            for d in subject.get("detail_columns", []):
                desc = self.registry["dimensions"].get(d)
                if desc:
                    try:
                        self.check_column(desc["table"], desc["column"])
                        self.path(
                            subject.get("detail_source", subject["source"]),
                            desc["table"],
                        )
                        dims.add(d)
                    except AnalysisError:
                        pass
        dimensions = {
            d: {
                k: v
                for k, v in self.registry["dimensions"][d].items()
                if k not in ("table", "column", "expression")
            }
            for d in sorted(dims)
        }
        names = list(
            dict.fromkeys(
                table
                for subject in subjects.values()
                for table in [subject["source"]] + subject.get("tables", [])
                if table in self.tables
            )
        )[:8]
        return {
            "tables": {name: self.structured_table(name) for name in names},
            "subjects": subjects,
            "metrics": metrics,
            "dimensions": dimensions,
            "valid_time_dimensions": {
                m: {"has_time": bool(v.get("time_column")), "grain": v["grain"]}
                for m, v in metrics.items()
            },
            "join_paths": {
                m: {
                    d: [
                        {"from_table": e["from_table"], "to_table": e["to_table"]}
                        for e in self.path(
                            v["source"], self.registry["dimensions"][d]["table"]
                        )
                    ]
                    for d in v["allowed_dimensions"]
                }
                for m, v in metrics.items()
            },
            "evidence": {
                "subject_scores": {sid: round(score, 3) for score, sid in selected},
                "metric_scores": {
                    mid: round(relevance(v.get("aliases", [])), 3)
                    for mid, v in metrics.items()
                },
            },
            "retrieval": {
                "strategy": "staged_subject_metric_dimension_relationship",
                "vector_status": vector_status,
                "fingerprint": self.fingerprint,
            },
        }

    def ground(self, spec: AnalysisSpec, today=None):
        r = self.registry
        if spec.ambiguities:
            choices = (
                r["subjects"].get(spec.subject, {}).get("metrics", list(r["metrics"]))
            )
            raise AnalysisError(
                "clarification",
                "Please clarify the requested metric or scope",
                [
                    {
                        "id": m,
                        "label": r["metrics"][m]["business_name"],
                        "unit": r["metrics"][m]["unit"],
                    }
                    for m in choices
                ],
            )
        if spec.subject not in r["subjects"]:
            raise AnalysisError("unsupported", "Unknown analytical subject")
        subject = deepcopy(r["subjects"][spec.subject])
        mids = set(spec.metrics)
        dims = set(spec.dimensions + spec.detail_columns)
        for c in spec.components:
            mids.update(c.metrics)
            dims.update(c.dimensions + c.detail_columns)
            component_subject = r["subjects"].get(c.subject or spec.subject)
            if not component_subject:
                raise AnalysisError("unsupported", "Unknown component subject")
            if c.kind in ("ranking", "distribution") and not c.dimensions:
                dims.add(component_subject["default_dimension"])
            if c.kind == "detail" and not c.detail_columns:
                dims.update(component_subject["detail_columns"])
            if c.ranking:
                mids.add(c.ranking.metric)
                dims.update(c.ranking.per_group)
        if spec.ranking:
            mids.add(spec.ranking.metric)
            dims.update(spec.ranking.per_group)
        filters = list(spec.filters) + [
            f for g in spec.comparison_groups for f in g.filters
        ]
        filters += [f for c in spec.components for f in c.filters]
        filters += [
            f
            for c in spec.components
            for g in c.comparison_groups or []
            for f in g.filters
        ]
        dims.update(f.dimension for f in filters)
        if (
            spec.analysis_kind in ("ranking", "comparison", "distribution")
            and not spec.dimensions
        ):
            dims.add(subject["default_dimension"])
        if spec.analysis_kind == "detail" and not spec.detail_columns:
            dims.update(subject["detail_columns"])
        metrics = {}
        dimensions = {}
        for mid in mids:
            if mid not in r["metrics"]:
                raise AnalysisError("unsupported", f"Unknown metric: {mid}")
            metric = deepcopy(r["metrics"][mid])
            contexts = {
                c.subject or spec.subject
                for c in spec.components
                if c.kind != "detail" and mid in (c.metrics or spec.metrics)
            } or {spec.subject}
            if not contexts <= set(metric["subjects"]):
                raise AnalysisError(
                    "clarification",
                    f"Metric {mid} is not defined for subject {spec.subject}",
                    subject["metrics"],
                )
            metric["sensitivity"] = "safe"
            metric["allowed_dimensions"] = self.compatible_dimensions(mid)
            self.check_expression(metric["expression"])
            if metric.get("time_column"):
                self.check_expression(metric["time_column"])
            metrics[mid] = metric
            dims.update(f["dimension"] for f in metric.get("business_filters", []))
            for col in metric.get("required_non_null", []):
                self.check_expression(col)
        dims.update(
            r["dimensions"][d]["identity"]
            for d in list(dims)
            if d in r["dimensions"] and r["dimensions"][d].get("identity")
        )
        for dim in dims:
            if dim not in r["dimensions"]:
                raise AnalysisError("unsupported", f"Unknown dimension: {dim}")
            d = deepcopy(r["dimensions"][dim])
            self.check_column(d["table"], d["column"])
            physical = next(
                c
                for c in self.tables[d["table"]]["columns"]
                if c["name"] == d["column"]
            )
            if physical.get("enum_values"):
                d["enum"] = physical["enum_values"]
            dimensions[dim] = d
        for f in filters:
            d = dimensions[f.dimension]
            if d.get("enum"):
                values = f.value if isinstance(f.value, list) else [f.value]
                if any(v not in d["enum"] for v in values):
                    raise AnalysisError(
                        "clarification", f"Unknown value for {f.dimension}", d["enum"]
                    )
        if subject["source"] not in self.tables:
            raise AnalysisError("metadata", "Subject source is unavailable")
        return GroundedAnalysisSpec(
            analysis_spec=spec,
            schema_fingerprint=self.fingerprint,
            metrics=metrics,
            dimensions=dimensions,
            subject=subject,
            relationships=self.edges,
            period=resolve_period(spec.time_range, today),
            retrieval={
                "strategy": "validated_catalog_references",
                "vector_status": "not_requested",
                "fingerprint": self.fingerprint,
            },
        )
