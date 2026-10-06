"""Cached, physically checked business index. No question routing or SQL output."""

import json
import os
from collections import OrderedDict
from copy import deepcopy
from threading import Lock
from services.analysis_catalog import AnalysisError
from services.value_grounding_service import dimension_values

_cache = OrderedDict()
_lock = Lock()
AGGREGATION_CODES = {"sum": "s", "average": "a", "count": "c", "conditional_count": "f", "distinct_count": "d", "catalog_defined": "x"}
DIRECTION_CODES = {"higher_better": "h", "lower_better": "l", "neutral": "n", "contextual": "c"}


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


def char_limit(name, default, maximum):
    try:
        return min(maximum, max(1000, int(os.getenv(name, str(default)))))
    except ValueError:
        raise AnalysisError("context_configuration", "Invalid context allowance") from None


def build_manifest(catalog, max_chars=None, subject_priority=()):
    maximum = max_chars if max_chars is not None else char_limit("DATA_ANALYST_SEMANTIC_MANIFEST_MAX_CHARS", 10000, 20000)
    key = (catalog.fingerprint, maximum, tuple(subject_priority))
    with _lock:
        if key in _cache:
            _cache.move_to_end(key)
            return deepcopy(_cache[key]), True
    r = catalog.registry
    dims, metrics, subjects = {}, {}, {}
    for id, d in sorted(r["dimensions"].items()):
        try:
            catalog.check_column(d["table"], d["column"])
            if d.get("expression"):
                catalog.check_expression(d["expression"])
        except AnalysisError:
            continue
        column = next(c for c in catalog.tables[d["table"]]["columns"] if c["name"] == d["column"])
        dtype = column.get("data_type", "text").lower()
        dtype = "number" if any(t in dtype for t in ("int", "numeric", "decimal", "float", "double")) else "date" if "date" in dtype or "timestamp" in dtype else "category"
        dims[id] = [id, d["business_name"], dtype, d.get("value_grounding", {}).get("mode", "lookup")]
    for id, m in sorted(r["metrics"].items()):
        try:
            if m["source"] not in catalog.tables:
                continue
            catalog.check_expression(m["expression"])
            for expression in [m.get("time_column"), *m.get("required_non_null", [])]:
                if expression:
                    catalog.check_expression(expression)
            if any(f["dimension"] not in dims for f in m.get("business_filters", [])):
                continue
            allowed = [d for d in catalog.compatible_dimensions(id) if d in dims]
        except (ValueError, KeyError):
            continue
        # Population groups encode compatibility without transmitting predicates or tables.
        scope = compact([m.get("time_column"), m.get("business_filters", []), m.get("required_non_null", [])])
        metrics[id] = (m, allowed, scope)
    for id, s in sorted(r["subjects"].items()):
        if s["source"] not in catalog.tables:
            continue
        details = []
        for d in s.get("detail_columns", []):
            if d not in dims:
                continue
            try:
                catalog.path(s.get("detail_source", s["source"]), r["dimensions"][d]["table"])
                details.append(d)
            except AnalysisError:
                pass
        mids = [m for m in s["metrics"] if m in metrics]
        if mids or details:
            subjects[id] = [id, s["business_name"], s["grain"], mids, s["default_dimension"] if s["default_dimension"] in dims else None, details, bool(s.get("detail_time_column"))]

    def project(ids, enrich=True):
        selected = [subjects[id] for id in ids]
        mids = sorted({m for s in selected for m in s[3]})
        dids = sorted({d for s in selected for d in [*s[5], *([s[4]] if s[4] else [])]} | {d for m in mids for d in metrics[m][1]})
        sets, scopes, rows = [], [], []
        for id in mids:
            m, allowed, scope = metrics[id]
            if allowed not in sets:
                sets.append(allowed)
            if scope not in scopes:
                scopes.append(scope)
            rows.append([id, m["business_name"], m["unit"], m["grain"], [s for s in m["subjects"] if s in ids], bool(m.get("additive")), bool(m.get("time_column")), sets.index(allowed), scopes.index(scope), AGGREGATION_CODES.get(m.get("aggregation_semantics"), "x"), DIRECTION_CODES.get(m.get("quality_direction"), "c")])
        value = {"columns": {
            "subjects": "id,label,grain,metrics,default_dimension,detail_fields,historical_detail",
            "metrics": "id,label,unit,grain,subjects,additive,historical,dimension_set,population_group,aggregation,quality_direction",
            "dimensions": "id,label,type,value_mode"},
            "subjects": selected, "metrics": rows, "dimensions": [dims[d] for d in dids], "dimension_sets": sets,
            "complete": len(ids) == len(subjects), "omitted_subject_count": len(subjects) - len(ids)}
        value["codes"] = {"aggregation": {v: k for k, v in AGGREGATION_CODES.items()}, "quality_direction": {v: k for k, v in DIRECTION_CODES.items()}}
        if enrich:
            enums, aliases = {}, {}
            for d in dids:
                values = dimension_values(catalog, d)
                if values and len(values) <= 8:
                    enums[d] = values
                    chosen = [(a, v) for a, v in sorted(r["dimensions"][d].get("value_aliases", {}).items()) if v in values][:3]
                    if chosen:
                        aliases[d] = dict(chosen)
            value.update(enums=enums, value_aliases=aliases)
        # Directional business links are checked child-to-parent paths, not join instructions.
        links = []
        for a in ids:
            for b in ids:
                if a == b:
                    continue
                try:
                    catalog.path(r["subjects"][a]["source"], r["subjects"][b]["source"])
                except AnalysisError:
                    continue
                if {metrics[m][2] for m in subjects[a][3]} & {metrics[m][2] for m in subjects[b][3]}:
                    links.append([a, b])
        if links:
            value["related_subjects"] = links
        # Related-population context is separate from same-cohort links. Only
        # physically checked child-to-parent paths and matching business clocks.
        context_links = []
        for parent in ids:
            for child in ids:
                parent_clocks = {metrics[m][0].get("time_column") for m in subjects[parent][3]}
                child_clocks = {metrics[m][0].get("time_column") for m in subjects[child][3]}
                if not parent_clocks & child_clocks or parent == child:
                    continue
                try:
                    catalog.path(r["subjects"][child]["source"], r["subjects"][parent]["source"])
                except AnalysisError:
                    continue
                if [child, parent] not in links:
                    context_links.append([parent, child])
        if context_links:
            value["context_subjects"] = context_links
        return value

    ids = list(dict.fromkeys([s for s in subject_priority if s in subjects] + list(subjects)))
    value = project(ids)
    if len(compact(value)) > maximum:
        value = project(ids, enrich=False)
    # Scale with deterministic whole-subject shards. Never truncate a JSON item,
    # authorize omitted IDs, or choose a shard by interpreting the user question.
    while len(compact(value)) > maximum and len(ids) > 1:
        ids.pop()
        value = project(ids, enrich=False)
    if not ids or len(compact(value)) > maximum:
        raise AnalysisError("semantic_manifest_budget_exceeded", "Business index exceeds allowance")
    with _lock:
        _cache[key] = deepcopy(value)
        while len(_cache) > 16:
            _cache.popitem(last=False)
    return value, False


def manifest_references(manifest):
    return {(kind, row[0]) for kind in ("subject", "metric", "dimension") for row in manifest[kind + "s"]}


def provider_manifest(manifest):
    """Remove compiler-owned grain and redundant metric-to-subject membership.

    Subject rows already contain metric IDs. SQL grain remains authoritative in
    the server catalog and never becomes a model supplied field.
    """
    value = deepcopy(manifest)
    value["subjects"] = [[s[0], s[1], *s[3:]] for s in manifest["subjects"]]
    value["metrics"] = [[m[0], m[1], m[2], *m[5:]] for m in manifest["metrics"]]
    value["columns"]["subjects"] = "id,label,metrics,default_dimension,detail_fields,historical_detail"
    value["columns"]["metrics"] = "id,label,unit,additive,historical,dimension_set,population_group,aggregation,quality_direction"
    return value
