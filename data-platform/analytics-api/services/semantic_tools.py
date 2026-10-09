"""Read-only, projected discovery requested by the model, not sentence routing."""

from difflib import SequenceMatcher
from services.analysis_catalog import AnalysisError, normalize
from services.analyst_contract import SemanticSearch, ConceptReference, ValueReference
from services.value_grounding_service import dimension_values, aliases_for, value_text


class SemanticTools:
    def __init__(self, catalog, lookup):
        self.catalog, self.lookup = catalog, lookup
        self.resolved = {}
        self.discovered = set()
        self.lookup_count = 0

    def related_population(self, parent_subject, subject, parent_metrics, metrics, *, allow_snapshot=False):
        """Explicit context may use a related fact/subset, with the same clock.

        User filters and resolved period are still checked separately. This does
        not authorize reconciliation, shares or causal claims across populations.
        """
        r = self.catalog.registry
        try:
            if not parent_metrics or not metrics:
                return False
            self.catalog.path(r["subjects"][subject]["source"], r["subjects"][parent_subject]["source"])
            clocks = {r["metrics"][m].get("time_column") for m in [*parent_metrics, *metrics]}
            return len(clocks) == 1 or (allow_snapshot and None in clocks
                and r["subjects"][subject]["source"] == r["subjects"][parent_subject]["source"])
        except (AnalysisError, KeyError):
            return False

    def cohort_compatible(self, parent_subject, subject, parent_metrics, metrics):
        """Related facts share scope only through a checked child-to-parent path.

        Metric-owned time and population predicates must agree; different grains
        remain different measurements, never an assumed revenue reconciliation.
        """
        r = self.catalog.registry
        try:
            if subject != parent_subject and not metrics:
                return False
            self.catalog.path(
                r["subjects"][subject]["source"],
                r["subjects"][parent_subject]["source"],
            )
            definitions = [r["metrics"][m] for m in [*parent_metrics, *metrics]]
            import json

            scopes = {
                json.dumps(
                    [
                        m.get("time_column"),
                        m.get("business_filters", []),
                        m.get("required_non_null", []),
                    ],
                    sort_keys=True,
                )
                for m in definitions
            }
            return bool(definitions) and len(scopes) == 1
        except (AnalysisError, KeyError):
            return False

    def related_subjects(self, subject):
        r = self.catalog.registry
        parent = r["subjects"][subject]
        related = []
        for id, candidate in r["subjects"].items():
            if id == subject or candidate["source"] not in self.catalog.tables:
                continue
            metrics = [
                m
                for m in candidate["metrics"]
                if any(
                    self.cohort_compatible(subject, id, [p], [m])
                    for p in parent["metrics"]
                )
            ]
            if metrics:
                available = []
                for metric in metrics:
                    try:
                        self.describe("metric", metric, record=False)
                        available.append(metric)
                    except AnalysisError:
                        continue
                if not available:
                    continue
                related.append(
                    {
                        "id": id,
                        "label": candidate["business_name"],
                        "grain": candidate["grain"],
                        "metrics": available[:4],
                    }
                )
        return related

    def record_projection(self, output):
        """Authorize only IDs in the projection actually delivered to the model."""
        self.discovered.add((output["kind"], output["id"]))
        for field, kind in (("metrics", "metric"), ("subjects", "subject"), ("dimensions", "dimension"), ("project", "dimension")):
            self.discovered.update((kind, id) for id in output.get(field, []))
        if output.get("default_dimension"):
            self.discovered.add(("dimension", output["default_dimension"]))
        for related in output.get("related_subjects", []):
            self.discovered.add(("subject", related["id"]))
            self.discovered.update(("metric", id) for id in related["metrics"])

    def require_query(self, q):
        from services.analytical_tool_contract import ToolContractError, issue

        refs = [("subject", q.subject, "subject")]
        refs += [("metric", m, "metrics") for m in q.metrics]
        refs += [("dimension", d, "group_by") for d in q.group_by]
        refs += [("dimension", d, "project") for d in q.project]
        refs += [("dimension", f.dimension, "filters.dimension") for f in q.filters]
        if q.ranking:
            refs += [("metric", q.ranking.metric, "ranking.metric")]
            refs += [("dimension", d, "ranking.per_group") for d in q.ranking.per_group]
        for sort in q.order_by:
            if sort.field not in ("period", "rank_position"):
                kind = "metric" if sort.field in self.catalog.registry["metrics"] else "dimension"
                refs.append((kind, sort.field, "order_by.field"))
        missing = [issue(path, "concept_not_discovered") for kind, id, path in refs if (kind, id) not in self.discovered]
        if missing:
            raise ToolContractError(list({v["path"]: v for v in missing}.values()))

    def describe(self, kind, id, offset=0, limit=12, record=True):
        r = self.catalog.registry
        value = r[kind + "s"].get(id)
        if not value:
            raise AnalysisError("unsupported_" + kind, "Unknown semantic concept")
        output = {"kind": kind, "id": id, "label": value["business_name"]}
        if kind == "subject":
            if value["source"] not in self.catalog.tables:
                raise AnalysisError("metadata", "Subject unavailable")
            output.update(
                grain=value["grain"],
                metrics=value["metrics"],
                default_dimension=value["default_dimension"],
                project=value.get("detail_columns", []),
                historical=bool(value.get("detail_time_column")),
                related_subjects=self.related_subjects(id),
            )
            available_metrics = []
            for metric in output["metrics"]:
                try:
                    self.describe("metric", metric, record=False)
                    available_metrics.append(metric)
                except AnalysisError:
                    continue
            output["metrics"] = available_metrics
            output["dimensions"] = sorted({d for m in available_metrics for d in self.catalog.compatible_dimensions(m)})
        elif kind == "metric":
            self.catalog.check_expression(value["expression"])
            if value.get("time_column"):
                self.catalog.check_expression(value["time_column"])
            output.update(
                unit=value["unit"],
                grain=value["grain"],
                subjects=value["subjects"],
                dimensions=self.catalog.compatible_dimensions(id),
                additive=value.get("additive", False),
                historical=bool(value.get("time_column")),
                business_filters=value.get("business_filters", []),
            )
        else:
            self.catalog.check_column(value["table"], value["column"])
            output.update(
                identity=value.get("identity"),
                value_mode=value.get("value_grounding", {}).get("mode", "lookup"),
            )
            if output["value_mode"] == "enum":
                values = dimension_values(self.catalog, id)
                output.update(
                    canonical_values=values[:8], values_complete=len(values) <= 8
                )
        pages = {}
        for field in (
            "metrics",
            "project",
            "subjects",
            "dimensions",
            "related_subjects",
        ):
            if field in output:
                values = output[field]
                output[field] = values[offset : offset + limit]
                pages[field] = {
                    "total": len(values),
                    "next_offset": (
                        offset + limit if offset + limit < len(values) else None
                    ),
                }
        if pages:
            output["pages"] = pages
        if kind in ("subject", "metric"):
            # Inline only safe canonical enums on the delivered dimension page.
            # Lookup references still require the bounded resolution tool.
            enums = {}
            for dimension in dict.fromkeys([*output.get("dimensions", []), *([output["default_dimension"]] if output.get("default_dimension") else [])]):
                detail = self.describe("dimension", dimension, record=False)
                if "canonical_values" in detail:
                    enums[dimension] = {"values": detail["canonical_values"], "complete": detail["values_complete"]}
            if enums:
                output["canonical_enums"] = enums
        if kind == "subject":
            output["measures"] = [
                {"id": m, "label": r["metrics"][m]["business_name"], "unit": r["metrics"][m]["unit"], "grain": r["metrics"][m]["grain"], "historical": bool(r["metrics"][m].get("time_column")), "additive": bool(r["metrics"][m].get("additive"))}
                for m in output["metrics"]
            ]
        if record:
            self.record_projection(output)
        return output

    def search(self, arguments):
        arg = SemanticSearch.model_validate(arguments)
        terms = normalize(arg.query).split()
        results = []
        for kind in (
            ("subject", "metric", "dimension") if arg.kind == "all" else (arg.kind,)
        ):
            for id, desc in self.catalog.registry[kind + "s"].items():
                text = normalize(
                    " ".join([id, desc["business_name"], *desc.get("aliases", [])])
                )
                score = sum(term in text for term in terms)
                if not score:
                    continue
                try:
                    # Check actual physical availability; project, never expose SQL.
                    self.describe(kind, id, record=False)
                except AnalysisError:
                    continue
                results.append((score, kind, id, desc))
        results.sort(key=lambda v: (-v[0], v[1], v[2]))
        page = results[arg.offset : arg.offset + arg.limit]
        matches = []
        for _, kind, id, value in page:
            # Reuse a physically checked, bounded business projection. A model
            # can choose subject/metric/dimensions without rediscovering each ID.
            detail = self.describe(kind, id, limit=6, record=False)
            matches.append(detail)
        # Fit the existing result budget by returning fewer matches with a real
        # next_offset, never by hiding a full result behind a projection error.
        import json
        while len(matches) > 1 and len(json.dumps(matches, ensure_ascii=False, separators=(",", ":"))) > 5200:
            matches.pop()
        for detail in matches:
            self.record_projection(detail)
        returned = len(matches)
        return {
            "matches": matches,
            "total": len(results),
            "next_offset": (
                arg.offset + returned
                if arg.offset + returned < len(results)
                else None
            ),
        }

    def resolve(self, arguments, *, allow_lookup=True):
        arg = ValueReference.model_validate(arguments)
        d = self.catalog.registry["dimensions"].get(arg.dimension)
        if not d:
            raise AnalysisError("unsupported_dimension", "Unknown dimension")
        self.catalog.check_column(d["table"], d["column"])
        values = dimension_values(self.catalog, arg.dimension)
        aliases = aliases_for(self.catalog, arg.dimension, values)
        canonical = aliases.get(value_text(arg.reference))
        if canonical is None and values:
            near = [
                (SequenceMatcher(None, value_text(arg.reference), k).ratio(), v)
                for k, v in aliases.items()
            ]
            near.sort(key=lambda p: -p[0])
            candidates = list(dict.fromkeys(v for score, v in near if score >= 0.94))
            if len(candidates) == 1:
                canonical = candidates[0]
        elif (
            canonical is None
            and d.get("value_grounding", {}).get("mode") == "lookup"
            and self.lookup
            and allow_lookup
        ):
            self.lookup_count += 1
            values = list(self.lookup(d["table"], d["column"], arg.reference, limit=8))[
                :8
            ]
            exact = list(dict.fromkeys(v for v in values if value_text(v) == value_text(arg.reference)))
            if len(exact) == 1:
                canonical = exact[0]
        if canonical is not None:
            self.resolved.setdefault(arg.dimension, set()).add(canonical)
        self.discovered.add(("dimension", arg.dimension))
        return {
            "dimension": arg.dimension,
            "value": canonical,
            "status": (
                "resolved"
                if canonical is not None
                else "ambiguous" if len(values) > 1 else "unknown"
            ),
            "choices": (
                [{"label": str(v), "value": v} for v in values[:8]]
                if canonical is None
                else []
            ),
        }

    def invoke(self, name, arguments):
        if name == "search_semantic_catalog":
            return self.search(arguments)
        if name == "describe_semantic_concept":
            arg = ConceptReference.model_validate(arguments)
            return self.describe(arg.kind, arg.id, arg.offset, arg.limit)
        if name == "resolve_dimension_value":
            return self.resolve(arguments)
        raise AnalysisError("tool", "Unsupported semantic tool")
