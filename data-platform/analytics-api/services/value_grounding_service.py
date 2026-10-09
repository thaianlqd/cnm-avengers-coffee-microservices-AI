"""Bounded safe categorical evidence; aliases never invent canonical values."""

from __future__ import annotations
import re
from difflib import SequenceMatcher
from services.analysis_catalog import normalize, AnalysisError


def value_text(value):
    return re.sub(r"[^\w]+", " ", normalize(value).replace("_", " ")).strip()


def dimension_values(catalog, name):
    dimension = catalog.registry["dimensions"].get(name, {})
    try:
        catalog.check_column(dimension["table"], dimension["column"])
    except (KeyError, AnalysisError):
        return []
    column = next(
        c
        for c in catalog.tables[dimension["table"]]["columns"]
        if c["name"] == dimension["column"]
    )
    # Physical enum/explicit bounded safe catalog is authoritative when supplied.
    values = (
        column.get("enum_values")
        or column.get("safe_values")
        or dimension.get("enum")
        or catalog.overlay.get("enums", {}).get(
            dimension["table"] + "." + dimension["column"], []
        )
    )
    if not isinstance(values, list) or len(values) > 64:
        return []
    return list(
        dict.fromkeys(
            v for v in values if type(v) in (str, int, bool) and len(str(v)) <= 100
        )
    )


def aliases_for(catalog, name, values):
    d = catalog.registry["dimensions"][name]
    allowed = set(values)
    # Qualified labels such as "Thành phố Hồ Chí Minh" carry the same value
    # as the catalog's "Hồ Chí Minh". This uses only catalog labels, not the
    # user sentence or a business-specific router. Collisions stay ambiguous.
    pairs = [(value_text(v), v) for v in values]
    pairs += [(value_text(d["business_name"] + " " + str(v)), v) for v in values]
    pairs += [(value_text(k), v) for k, v in d.get("value_aliases", {}).items() if v in allowed]
    candidates = {}
    for alias, value in pairs:
        candidates.setdefault(alias, set()).add(value)
    return {alias: next(iter(found)) for alias, found in candidates.items() if len(found) == 1}


def value_hints(prompt, catalog, dimensions=None, lookup=None):
    text = value_text(prompt)
    tokens = text.split()
    names = list(
        dimensions if dimensions is not None else catalog.registry["dimensions"]
    )
    recognized, candidates, ambiguities, positions = [], {}, [], []
    for name in names:
        values = dimension_values(catalog, name)
        d = catalog.registry["dimensions"].get(name, {})
        if not d:
            continue
        # High cardinality names: only a quoted entity reference adjacent to a
        # dimension label triggers bounded search, never a full distinct dump.
        if lookup and d.get("value_grounding", {}).get("mode") == "lookup":
            for quoted in re.finditer(r'["“]([^"”]{2,80})["”]', prompt):
                before = value_text(
                    prompt[max(0, quoted.start() - 50) : quoted.start()]
                )
                if any(
                    re.search(r"(?<!\w)" + re.escape(value_text(a)) + r"(?!\w)", before)
                    for a in d.get("aliases", [])
                ):
                    catalog.check_column(d["table"], d["column"])
                    found = lookup(d["table"], d["column"], quoted.group(1), limit=8)
                    values = list(dict.fromkeys(values + list(found)))[:64]
        if not values:
            continue
        aliases = aliases_for(catalog, name, values)
        matches = []
        for alias, value in aliases.items():
            if not alias:
                continue
            if re.search(r"(?<!\w)" + re.escape(alias) + r"(?!\w)", text):
                matches.append((1.0, value, "exact_alias", alias))
                continue
            # Generic lexical tolerance, bounded windows, no city/typo branches.
            if len(alias) < 6:
                continue
            width = len(alias.split())
            for start in range(len(tokens)):
                phrase = " ".join(tokens[start : start + width])
                similarity = SequenceMatcher(None, alias, phrase).ratio()
                if similarity >= 0.94:
                    matches.append((similarity, value, "fuzzy", phrase))
        # Resolve each textual mention separately, preserving comparisons.
        mentions = {}
        for score, value, method, mention in matches:
            mentions.setdefault(mention, []).append((score, value, method))
        selected = []
        for mention, batch in mentions.items():
            batch.sort(key=lambda row: -row[0])
            strongest = batch[0]
            competing = [
                row
                for row in batch
                if row[1] != strongest[1] and strongest[0] - row[0] < 0.06
            ]
            if competing:
                ambiguities.append(
                    {
                        "dimension": name,
                        "values": list(
                            dict.fromkeys(
                                [strongest[1]] + [row[1] for row in competing]
                            )
                        )[:8],
                    }
                )
                continue
            selected.append(strongest)
            for match in re.finditer(r"(?<!\w)" + re.escape(mention) + r"(?!\w)", text):
                position = {
                    "dimension": name,
                    "value": strongest[1],
                    "start": match.start(),
                    "end": match.end(),
                }
                if position not in positions:
                    positions.append(position)
        for score, value, method in selected:
            item = {"dimension": name, "value": value}
            if item not in recognized:
                recognized.append(item)
        # Low-cardinality enums fit a small bounded catalog; high-cardinality
        # values include only actual searched/mentioned candidates.
        candidates[name] = {
            "label": d["business_name"],
            "values": values[:32],
            "complete": len(values) <= 32,
            "matches": [
                {"value": v, "method": m, "score": round(s, 3)}
                for s, v, m in set(selected)
            ],
        }
    return {
        "recognized_values": recognized,
        "value_candidates": candidates,
        "value_ambiguities": ambiguities,
        "value_mentions": positions,
    }


def canonical_filter(catalog, dimension, value, prompt, evidence, lookup=None):
    d = catalog.registry["dimensions"].get(dimension)
    if not d:
        raise AnalysisError(
            "unsupported_dimension", "Chiều phân tích này chưa được hỗ trợ."
        )
    catalog.check_column(d["table"], d["column"])
    mentioned = [
        m["value"] for m in evidence["recognized_values"] if m["dimension"] == dimension
    ]
    aliases = aliases_for(catalog, dimension, dimension_values(catalog, dimension))
    canonical = aliases.get(value_text(value), value)
    if canonical in mentioned:
        return canonical
    literal = bool(
        re.search(
            r"(?<!\w)" + re.escape(value_text(value)) + r"(?!\w)", value_text(prompt)
        )
    )
    values = dimension_values(catalog, dimension)
    if values or d.get("enum"):
        # Being present in the sentence is insufficient to invent a DB enum.
        raise AnalysisError(
            "filter_value_unknown",
            f"Chưa tìm thấy giá trị phù hợp cho {d['business_name']}.",
            [{"label": str(v)} for v in values[:8]],
        )
    if literal and lookup and d.get("value_grounding", {}).get("mode") == "lookup":
        found = list(lookup(d["table"], d["column"], str(value), limit=8))
        exact = [v for v in found if value_text(v) == value_text(value)]
        if len(exact) == 1:
            return exact[0]
        raise AnalysisError(
            "filter_value_unknown",
            f"Chưa tìm thấy giá trị phù hợp cho {d['business_name']}.",
            [{"label": str(v)} for v in found[:8]],
        )
    # Numeric thresholds and explicitly declared free scalar fields remain
    # usable; entity names never fall back to unchecked text.
    if literal and (
        type(value) in (int, float, bool)
        or d.get("value_grounding", {}).get("mode") == "literal"
    ):
        return value
    raise AnalysisError(
        "filter_value_unknown", f"Cần xác nhận giá trị cho {d['business_name']}."
    )
