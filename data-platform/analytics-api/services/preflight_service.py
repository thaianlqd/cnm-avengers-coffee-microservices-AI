"""Deterministic, advisory request preflight (V3.1 Analyst Workspace).

Runs while the user types, so it must stay cheap and side-effect free:
* zero provider/LLM calls and no semantic repair;
* zero warehouse queries — only the in-memory registry, the last cached
  physical layout (never loaded here) and the cached DataCoverageSnapshot.

It is not a second semantic engine. It reuses the governed request anchors and
time grammar, reports findings (block/warn/info) with deterministic fixes, and
leaves the authoritative decision to the V3.0 backend.
"""
import json
import re
import time
from collections import deque
from datetime import date, datetime, timedelta
from threading import Lock
from zoneinfo import ZoneInfo

from services.analysis_catalog import AnalysisCatalog, CATALOG_PATH, normalize
from services.value_grounding_service import value_text
from services.workspace_service import mission_for, unsupported_concepts, limits as workspace_limits

VERSION = "3.1.0"
_lock = Lock()
_catalog = {"key": None, "value": None}
UI_DAYS = {"today": 1, "7d": 7, "30d": 30}
UI_PERIODS = {"current_month", "previous_month", "current_quarter", "previous_quarter", "current_year", "previous_year"}


# --- In-memory catalog (never introspects) --------------------------------

def overlay_physical(overlay):
    """Layout declared by the governed overlay; used until a warehouse layout is cached."""
    tables = {name: {"qualified_name": name, "object_type": "view",
                     "columns": [{"name": c, "data_type": d.get("type", "text"), "nullable": True} for c, d in t.get("columns", {}).items()],
                     "primary_key": t.get("primary_key", []), "relationships": []}
              for name, t in overlay["silver_tables"].items()}
    return {"table_map": tables, "tables": list(tables.values()), "table_count": len(tables), "refreshed_at": "overlay"}


def preflight_catalog():
    from services.metadata_service import peek_local_metadata
    stamp = CATALOG_PATH.stat().st_mtime_ns
    physical = peek_local_metadata()
    # AnalysisCatalog projects tables by the active principal: the cache must
    # not hand a projection built for one access fingerprint to another (I06).
    from services.access_policy import active_principal
    principal = active_principal.get()
    key = (stamp, id(physical) if physical else None, principal.access_fingerprint if principal else None)
    with _lock:
        if _catalog["key"] == key:
            return _catalog["value"]
    overlay = json.loads(CATALOG_PATH.read_text())
    catalog = AnalysisCatalog(physical if physical and physical.get("table_map") else overlay_physical(overlay), overlay)
    with _lock:
        _catalog.update(key=key, value=catalog)
    return catalog


# --- Text helpers -----------------------------------------------------------

def mapped_text(text):
    """value_text() plus a map from each normalized char to its source index."""
    out, index = [], []
    for i, ch in enumerate(text):
        piece = normalize(ch).replace("_", " ") if ch.strip() else " "
        # Decomposed Vietnamese marks normalize to an empty string. They must
        # not split a word (NFD "tỉnh" and NFC "tỉnh" are the same input).
        for c in piece:
            c = c if re.match(r"\w", c) else " "
            if c == " " and (not out or out[-1] == " "):
                continue
            out.append(c)
            index.append(i)
    while out and out[-1] == " ":
        out.pop()
        index.pop()
    return "".join(out), index


def _clauses(question, index, text_length):
    """Clause spans in NORMALIZED-text coordinates. Boundaries are found in the original question (punctuation and
    conjunctions that open a new analytical ask) and mapped through the normalization index."""
    cuts = [m for m in re.finditer(r"[.;:!?,\n]|\s(?:và|va|rồi|roi|sau đó|sau do|đồng thời|dong thoi)\s", question, re.IGNORECASE)]
    positions = [0]
    for m in cuts:
        positions.append(next((i for i, original in enumerate(index) if original >= m.end()), text_length))
    positions.append(text_length)
    spans = [(a, b) for a, b in zip(positions, positions[1:]) if b > a]
    return spans or [(0, text_length)]


def _span(index, start, end):
    return index[start], index[end - 1] + 1


def _replace(question, span, value):
    start, end = span
    text = (question[:start] + value + question[end:])
    return re.sub(r"\s{2,}", " ", text).strip()


def _mentions(text, phrases):
    from services.request_anchors import _phrase_pattern
    found = []
    for phrase in sorted({value_text(p) for p in phrases if p}, key=len, reverse=True):
        if len(phrase) < 2:
            continue
        for m in _phrase_pattern(phrase).finditer(text):
            if not any(a <= m.start() and m.end() <= b for a, b, _ in found):
                found.append((m.start(), m.end(), phrase))
    return found


REDIRECT_CODES = {"forecast_metric_unsupported", "forecast_cadence_unsupported", "forecast_horizon_exceeded",
                  "forecast_grouped_unsupported", "forecast_scope_unsupported", "risk_signal_required", "trend_range_too_short",
                  "unsupported_predicate", "composition_non_additive", "compare_mixed_units", "cohort_criterion_needed",
                  "association_category_variable", "unrecognized_question", "metric_needed", "analysis_target_missing"}
# Legacy error categories are presentation only; the capability contract owns the decision.
from services.semantic_preflight_contract import decision_from_findings
CODE_ERROR = {"forecast_metric_unsupported":"forecast_unsupported","forecast_cadence_unsupported":"forecast_unsupported","forecast_horizon_exceeded":"forecast_unsupported","forecast_grouped_unsupported":"forecast_unsupported","forecast_scope_unsupported":"forecast_unsupported","guided_contract_invalid":"guided_contract_invalid","unrecognized_question": "unrecognized_question", "metric_needed": "clarification",
    "analysis_target_missing": "clarification", "composition_non_additive": "mission_mismatch",
    "unsupported_predicate": "unsupported_metric", "unsupported_only": "unsupported_metric",
    "unsupported_required": "unsupported_metric", "privacy_blocked": "privacy",
    "compare_mixed_units": "clarification", "cohort_criterion_needed": "clarification",
    "association_category_variable": "clarification", "risk_signal_required": "mission_mismatch",
    "mission_mismatch": "mission_mismatch", "trend_range_too_short": "time_range_invalid",
    "scope_unresolved": "clarification", "scope_conflict": "query_scope"}


def capability_decision(findings):
    return decision_from_findings(findings).decision


def finding(level, code, message, fixes=(), **extra):
    return {"level": level, "code": code, "message": message, "fixes": list(fixes), **extra}


# --- Time -------------------------------------------------------------------

def ui_period(time_range, reference, tz):
    from services.analysis_catalog import resolve_period
    from services.analysis_contract import TimeScope
    mode = (time_range or {}).get("mode") or "auto"
    if mode == "custom":
        return {"start": time_range.get("start"), "end": time_range.get("end")}
    if mode in UI_DAYS:
        return {"start": (reference - timedelta(days=UI_DAYS[mode] - 1)).isoformat(), "end": reference.isoformat()}
    if mode in UI_PERIODS:
        resolved = resolve_period(TimeScope(mode=mode, timezone=tz), reference)
        return {"start": resolved["start"], "end": resolved["end"]}
    return None


def coverage_for(coverage, sources):
    facts = (coverage or {}).get("facts", {})
    known = [facts[s] for s in sources if facts.get(s, {}).get("min_date")]
    if known:
        return max(f["min_date"] for f in known), min(f["max_date"] for f in known), [f["label"] for f in known]
    overall = (coverage or {}).get("overall", {})
    return overall.get("min_date"), overall.get("max_date"), []


# --- Main -------------------------------------------------------------------

def _vocabulary_hits(text, phrases):
    return [p for p in phrases if p and re.search(r"(?<!\w)" + re.escape(value_text(p)) + r"(?!\w)", text)]


def _subject_hits(text, registry):
    """A governed subject named in the question ("tin tức", "gift card") is business
    evidence for the interpreter, exactly like a metric or dimension anchor."""
    from services.request_anchors import exact_mentions
    key = tuple((id, subject["business_name"], tuple(subject.get("aliases", [])), subject.get("lifecycle", {}).get("status"))
                for id, subject in sorted(registry["subjects"].items()))
    vocabularies = _SUBJECT_VOCABULARY.get(key)
    if vocabularies is None:
        vocabularies = _SUBJECT_VOCABULARY[key] = (_subject_vocabulary(registry), _subject_vocabulary(registry, accented=True))
        while len(_SUBJECT_VOCABULARY) > 8:
            _SUBJECT_VOCABULARY.pop(next(iter(_SUBJECT_VOCABULARY)))
    folded = value_text(text)
    # A question typed with diacritics is matched with diacritics: the unaccented alias
    # "tra" (for "trà") must not fire on "kiểm tra".
    exact = _accent_text(text)
    hits = exact_mentions(exact, vocabularies[1]) if exact != folded else exact_mentions(folded, vocabularies[0])
    return ["subject:" + a["candidate_ids"][0] for a in hits if len(a["candidate_ids"]) == 1]


_SUBJECT_VOCABULARY = {}


def _accent_text(value):
    import unicodedata
    return re.sub(r"[^\w]+", " ", unicodedata.normalize("NFC", str(value)).casefold().replace("_", " ")).strip()


def _subject_vocabulary(registry, accented=False):
    vocabulary = {}
    for id, subject in registry["subjects"].items():
        if subject.get("lifecycle", {}).get("status") == "deprecated":
            continue
        aliases = [subject["business_name"], *subject.get("aliases", [])]
        spelled = {value_text(a) for a in aliases if _accent_text(a) != value_text(a)}
        for alias in aliases:
            phrase = _accent_text(alias) if accented else value_text(alias)
            if accented and phrase in spelled:
                continue  # unaccented typing convenience of an accented alias
            if len(phrase) >= 3:
                vocabulary.setdefault(phrase, set()).add(id)
    return vocabulary


def run(question, time_range=None, analysis_scope=None, analysis_mission=None, reference=None, catalog=None, coverage=None,
        input_mode=None, guided_contract=None, input_lookup=None, integrity_text=None, analysis_depth=None,
        grounded_scope_filters=()):
    from services.request_anchors import request_anchors
    from services.time_resolution_service import parse_time, resolve_time
    from services import data_coverage_service
    from services import mission_contract_service as missions
    from services.semantic_preflight_contract import canonical_anchor, contract_from_preflight, alias_policy, POLICY_VERSION
    started = time.perf_counter()
    catalog = catalog or preflight_catalog()
    coverage = coverage if coverage is not None else data_coverage_service.peek()
    r = catalog.registry
    ws = r.get("workspace", {})
    tz = r["timezone"]
    reference = reference or datetime.now(ZoneInfo(tz)).date()
    question = question or ""
    findings = []
    limit = workspace_limits(r, {})
    maximum = limit["max_question_chars"]
    text, index = mapped_text(question)
    mission = mission_for(r, analysis_mission)

    # --- Structural / safety blocks (the only hard blocks) ---
    if not question.strip():
        findings.append(finding("block", "structurally_invalid_input", "Hãy nhập câu hỏi phân tích."))
    if maximum and len(question) > maximum:
        findings.append(finding("block", "question_too_long",
                                f"Câu hỏi dài {len(question):,} ký tự, vượt giới hạn {maximum:,} ký tự của hệ thống.".replace(",", "."),
                                [{"label": f"Rút gọn còn {maximum:,} ký tự".replace(",", "."), "kind": "truncate", "max_chars": maximum}],
                                length=len(question), max_chars=maximum))
    period_ui = (time_range or {}).get("mode") == "custom"
    if period_ui:
        start, end = time_range.get("start"), time_range.get("end")
        if not start or not end or str(start) > str(end):
            findings.append(finding("block", "structurally_invalid_input", "Khoảng thời gian tùy chọn chưa hợp lệ (cần từ ngày ≤ đến ngày)."))
    scope = analysis_scope or {}
    if scope.get("mode") == "selected":
        if not scope.get("filters"):
            findings.append(finding("block", "structurally_invalid_input", "Đã chọn phạm vi cụ thể nhưng chưa chọn giá trị."))
        for f in scope.get("filters") or []:
            d = r["dimensions"].get(f.get("dimension"))
            if not d or not d.get("scope_selectable"):
                findings.append(finding("block", "structurally_invalid_input", "Phạm vi này không được hỗ trợ cho phân tích."))
    for concept in ws.get("sensitive_request_concepts", []):
        hit = _mentions(text, concept["aliases"])
        if hit:
            findings.append(finding("block", "privacy_blocked", concept["message"],
                                    [{"label": "Phân tích ở mức tổng hợp (ví dụ theo chi nhánh hoặc phân khúc)", "kind": "advice"}],
                                    concept=concept["id"], phrases=[question[slice(*_span(index, a, b))] for a, b, _ in hit]))
    for clarification in r.get('scope_clarifications',[]):
        if _mentions(text,clarification['aliases']):
            findings.append(finding('block','scope_unresolved' if clarification['state']=='needs_clarification' else 'scope_unsupported',clarification['message']))
    blocked_length = any(f["code"] == "question_too_long" for f in findings)

    understood = {"metrics": [], "dimensions": [], "filters": [], "time": None, "forecast": None,
                  "mission": {"id": mission["id"], "label": mission["label"]} if mission else None, "unsupported": []}
    anchors = {"metrics": [], "dimensions": [], "values": [], "rankings": [], "granularities": []}
    periods, forecast_requested = [], False
    if question.strip() and not blocked_length:
        anchors = request_anchors(question, catalog, {"required_filters": scope.get("filters") or []})
        from services.access_policy import authorize_meaning
        authorize_meaning(question,catalog,analysis_scope=analysis_scope,anchors=anchors)
        if anchors["scope_resolution"]["state"] == "needs_clarification":
            findings.append(finding("block", "scope_conflict", anchors["scope_resolution"]["message"]))
        metrics = r["metrics"]
        # One entry per mentioned phrase. A governed canonical alias anchors its
        # owner (V3.2); otherwise the metric whose label IS the phrase is
        # primary. Specialized siblings are listed, not presented as equals.
        mentions, ambiguous, canonical_mentions = [], [], []
        for a in anchors["metrics"]:
            owner = canonical_anchor(a, r)
            exact = [m for m in a["candidate_ids"] if value_text(metrics[m]["business_name"]) == a["phrase"]]
            primary = owner or (exact or a["candidate_ids"])[0]
            if any(primary == p for p, _ in mentions):
                continue
            mentions.append((primary, a))
            if owner and len(a["candidate_ids"]) > 1:
                canonical_mentions.append((primary, a))
            elif len(a["candidate_ids"]) > 1:
                ambiguous.append((primary, a))
        metric_ids = [p for p, _ in mentions]
        canonical_ids = {p for p, _ in canonical_mentions}
        understood["metrics"] = [{"id": m, "label": metrics[m]["business_name"], "unit": metrics[m]["unit"],
                                  "historical": bool(metrics[m].get("time_column")),
                                  "forecastable": bool((metrics[m].get("forecast") or {}).get("forecastable")),
                                  "canonical": m in canonical_ids,
                                  # Same-name candidates only for genuinely ambiguous phrases.
                                  "alternatives": [] if m in canonical_ids else
                                      [{"id": c, "label": metrics[c]["business_name"]} for c in a["candidate_ids"] if c != m],
                                  "specialized": [{"id": c, "label": metrics[c]["business_name"]} for c in a["candidate_ids"] if c != m]
                                      if m in canonical_ids else []}
                                 for m, a in mentions]
        for primary, a in canonical_mentions:
            phrase = question[slice(*_span(index, a["start"], a["end"]))]
            findings.append(finding("info", "canonical_metric",
                f"“{phrase}” được hiểu là {metrics[primary]['business_name'].lower()} (chỉ số chuẩn). "
                "Chỉ số chuyên biệt như " + ", ".join(metrics[c]["business_name"].lower() for c in a["candidate_ids"] if c != primary)[:160]
                + " chỉ dùng khi bạn nêu rõ.", metric=primary))
        dims = list(dict.fromkeys(d for a in anchors["dimensions"] for d in a["candidate_ids"]))
        understood["dimensions"] = [{"id": d, "label": r["dimensions"][d]["business_name"]} for d in dims]
        labels = lambda d, v: r["dimensions"][d].get("value_labels", {}).get(str(v), v)
        understood["filters"] = [{"dimension": v["dimension"], "label": r["dimensions"][v["dimension"]]["business_name"],
                                  "value": v["value"], "display": labels(v["dimension"], v["value"])} for v in anchors["values"]]
        for primary, a in ambiguous:
            phrase = question[slice(*_span(index, a["start"], a["end"]))]
            findings.append(finding("info", "ambiguous_metric",
                                    f"“{phrase}” được hiểu là {metrics[primary]['business_name'].lower()}; còn {len(a['candidate_ids']) - 1} chỉ số cùng tên, AI chọn theo ngữ cảnh.",
                                    candidates=[{"id": m, "label": metrics[m]["business_name"]} for m in a["candidate_ids"]]))

        # --- Unsupported concepts (governed) ---
        from services.request_anchors import capability_is_constraint
        for id, concept in unsupported_concepts(r).items():
            hits = _mentions(text, concept["aliases"])
            hits=[h for h in hits if not capability_is_constraint(text,h[0])]
            if not hits:
                continue
            nearest = [{"id": m, "label": metrics[m]["business_name"]} for m in concept["nearest_metrics"]]
            span = _span(index, hits[0][0], hits[0][1])
            understood["unsupported"].append({"id": id, "phrase": question[slice(*span)]})
            findings.append(finding("block", "unsupported_concept",
                                    f"“{question[slice(*span)]}” chưa có định nghĩa được quản trị. {concept.get('limitation', '')}".strip(),
                                    [{"label": f"Thay bằng {n['label'].lower()}", "kind": "replace_question",
                                      "question": _replace(question, span, n["label"].lower())} for n in nearest[:3]],
                                    concept=id, nearest=nearest))

        # --- Time ---
        parsed = parse_time(question, r["interpretation"], tz, reference)["recognized_time_parts"]
        periods = []
        for part in parsed:
            try:
                periods.append(resolve_time(part, reference, tz)[2])
            except (ValueError, TypeError):
                continue
        explicit = ui_period(time_range, reference, tz)
        period, source = (periods[0], "question") if periods else (explicit, "control") if explicit else (None, "default")
        if period and period.get("start"):
            understood["time"] = {"source": source, "start": period["start"], "end": period["end"]}
        else:
            understood["time"] = {"source": "default", "start": None, "end": None,
                                  "label": "Theo câu hỏi; nếu câu hỏi không nêu thời gian, hệ thống dùng toàn bộ dữ liệu hiện có."}
        sources = list(dict.fromkeys(metrics[m]["source"] for m in metric_ids))
        for source in sources:
            state=(((coverage or {}).get('data_health') or {}).get('views') or {}).get(source,{})
            if state.get('status')=='blocked':
                findings.append(finding('block','required_source_blocked',
                    'Nguồn dữ liệu cần thiết đang bị chặn do lỗi tải, schema hoặc chất lượng; vui lòng thử lại sau khi nguồn được xử lý.',
                    source=source,reasons=state.get('reasons',[])))
        low, high, facts = coverage_for(coverage, sources)
        for source in sources:
            observed=((coverage or {}).get('facts') or {}).get(source)
            if observed and (observed.get('stale') or observed.get('completeness','unknown')!='complete'):
                findings.append(finding('info','source_coverage_unknown',
                    f"{observed['label']}: dữ liệu quan sát đến {observed.get('max_date') or 'chưa rõ'}; độ đầy đủ nguồn chưa được chứng minh.",
                    source=source,completeness=observed.get('completeness','unknown')))

        if period and period.get("start") and low and high:
            start, end = str(period["start"])[:10], str(period["end"])[:10]
            scope_label = ", ".join(facts) if facts else "kho dữ liệu"
            if end < low or start > high:
                fixes = [{"label": f"Dùng toàn bộ dữ liệu ({low} → {high})", "kind": "set_time",
                          "time": {"mode": "custom", "start": low, "end": high}}]
                year = re.search(r"(?<!\d)" + start[:4] + r"(?!\d)", question)
                if year and start[:4] != high[:4]:
                    fixes.insert(0, {"label": f"Đổi thành năm {high[:4]}", "kind": "replace_question",
                                     "question": _replace(question, year.span(), high[:4])})
                findings.append(finding("warn", "time_outside_data",
                                        f"Khoảng {start} → {end} nằm ngoài dữ liệu hiện có ({scope_label}: {low} → {high}).", fixes,
                                        coverage={"min_date": low, "max_date": high}))
            elif start < low or end > high:
                findings.append(finding("info", "time_partially_covered",
                                        f"Dữ liệu chỉ có {max(start, low)} → {min(end, high)} trong khoảng đã hỏi ({scope_label}).",
                                        coverage={"min_date": low, "max_date": high}))

        # --- Forecast ---
        terms = [value_text(t) for t in r["interpretation"].get("forecast_terms", [])]
        forecast_requested = any(re.search(r"(?<!\w)" + re.escape(t) + r"(?!\w)", text) for t in terms if t)
        if forecast_requested:
            grammar = ws.get("forecast_horizon_grammar")
            match = re.search(grammar, text) if grammar else None
            amount = int(match.group("amount")) if match else None
            unit = ws.get("forecast_unit_aliases", {}).get(match.group("unit")) if match else None
            understood["forecast"] = {"requested": True, "horizon": amount, "unit": unit}
            cadence_labels = ws.get("forecast_cadence_labels", {})
            forecastable = [m for m, d in metrics.items() if (d.get("forecast") or {}).get("forecastable")]
            order = list(metrics)
            for primary, phrase in mentions:
                usable = [c for c in phrase["candidate_ids"] if (metrics[c].get("forecast") or {}).get("forecastable")]
                m = primary if primary in usable else (usable[0] if usable else primary)
                spec = metrics[m].get("forecast") or {}
                label = metrics[m]["business_name"]
                if not spec.get("forecastable"):
                    span = _span(index, phrase["start"], phrase["end"])
                    same_domain = sorted(forecastable, key=lambda f: (not set(metrics[f]["subjects"]) & set(metrics[m]["subjects"]), order.index(f)))
                    findings.append(finding("block", "forecast_metric_unsupported",
                        f"{label} chưa được khai báo là chỉ số dự báo được. Chỉ số dự báo được: "
                        + ", ".join(metrics[f]["business_name"] for f in forecastable) + ".",
                        [{"label": f"Dự báo {metrics[f]['business_name'].lower()}", "kind": "replace_question",
                          "question": _replace(question, span, metrics[f]["business_name"].lower())} for f in same_domain[:3]],
                        metric=m))
                    continue
                understood["forecast"]["max_horizon"] = spec["max_horizon"]
                if unit and unit not in spec["cadences"]:
                    best = "month" if "month" in spec["cadences"] else spec["cadences"][-1]
                    n = spec["max_horizon"][best]
                    findings.append(finding("block", "forecast_cadence_unsupported",
                        f"Dự báo {label.lower()} hỗ trợ theo {', '.join(cadence_labels.get(c, c) for c in spec['cadences'])}.",
                        [{"label": f"Đổi thành {n} {cadence_labels.get(best, best)}", "kind": "replace_question",
                          "question": _replace(question, _span(index, match.start(), match.end()), f"{n} {cadence_labels.get(best, best)} tới")}]
                        if match else [], metric=m))
                elif unit and amount and amount > spec["max_horizon"][unit]:
                    n = spec["max_horizon"][unit]
                    findings.append(finding("block", "forecast_horizon_exceeded",
                        f"Tầm dự báo tối đa của {label.lower()} là {n} {cadence_labels.get(unit, unit)} (đã hỏi {amount}). "
                        "Hãy chọn tầm dự báo trong giới hạn.",
                        [{"label": f"Đổi thành {n} {cadence_labels.get(unit, unit)}", "kind": "replace_question",
                          "question": _replace(question, _span(index, match.start(), match.end()), f"{n} {cadence_labels.get(unit, unit)} tới")}],
                        metric=m, requested=amount, maximum=n, unit=unit))
                allowed = set(spec.get("allowed_dimensions", []))
                markers = [value_text(x) for x in ws.get("grouping_markers", ["theo"])]
                for a in anchors["dimensions"]:
                    if set(a["candidate_ids"]) <= allowed:
                        continue
                    before = text[:a["start"]].rstrip()
                    marker = next((mk for mk in sorted(markers, key=len, reverse=True) if before.endswith(mk)), None)
                    if not marker:
                        continue
                    span = _span(index, len(before) - len(marker), a["end"])
                    dim = r["dimensions"][a["candidate_ids"][0]]["business_name"]
                    findings.append(finding("block", "forecast_grouped_unsupported",
                        f"Chưa hỗ trợ dự báo theo từng {dim.lower()}; dự báo được tính cho toàn phạm vi đã lọc.",
                        [{"label": f"Bỏ “{question[slice(*span)]}”", "kind": "replace_question", "question": _replace(question, span, "")},
                         {"label": f"Chọn một {dim.lower()} trong Phạm vi", "kind": "advice"}], metric=m, dimension=a["candidate_ids"][0]))
                    break
                scope_filters_selected = (analysis_scope or {}).get("mode") == "selected" and (analysis_scope or {}).get("filters")
                if understood["filters"] or scope_filters_selected:
                    # The forecast engine has no scoped series: never suggest a branch-filtered forecast as a valid fix.
                    findings.append(finding("block", "forecast_scope_unsupported",
                        "Dự báo hiện chỉ tính cho toàn phạm vi dữ liệu, chưa hỗ trợ lọc theo chi nhánh/thành phố/loại cửa hàng.",
                        [{"label": "Dự báo toàn phạm vi (bỏ bộ lọc)", "kind": "advice"}], metric=m))
                fact = (coverage or {}).get("facts", {}).get(metrics[m]["source"], {})
                freshness = (coverage or {}).get("freshness", {})
                if fact.get("max_date") and (date.fromisoformat(fact["max_date"]) < reference - timedelta(days=2) or freshness.get("stale")):
                    findings.append(finding("warn", "forecast_data_stale",
                        f"Dữ liệu {fact.get('label', '').lower()} mới đến {fact['max_date']} (cập nhật theo đợt); dự báo bắt đầu từ kỳ hoàn tất gần nhất, "
                        "các ngày chưa đồng bộ không được coi là doanh số bằng 0.", metric=m, max_date=fact["max_date"]))
        elif mission and mission["id"] == "forecast":
            findings.append(finding("info", "mission_hint_only",
                                    "Đã chọn nhiệm vụ Dự báo nhưng câu hỏi chưa yêu cầu dự báo; hệ thống phân tích theo câu hỏi thực tế."))

        # --- Snapshot metrics cannot have history ---
        wants_history = bool(periods or anchors.get("granularities") or forecast_requested
                             or (mission and mission["id"] in {"trend", "forecast"}))
        for m in metric_ids:
            if not metrics[m].get("time_column") and wants_history:
                findings.append(finding("warn", "snapshot_metric_trend",
                    f"{metrics[m]['business_name']} là chỉ số hiện trạng (ảnh chụp), không có lịch sử theo thời gian; "
                    "hệ thống chỉ trả giá trị hiện tại.", [{"label": "Bỏ mốc thời gian / xu hướng", "kind": "advice"}], metric=m))
        if periods and metric_ids and not any(metrics[m].get("time_column") for m in metric_ids):
            # I10: every requested metric is a snapshot, so the explicit period cannot be
            # honoured; execution would stop with historical_metric_unavailable after an AI call.
            findings.append(finding("block", "snapshot_metric_period",
                "Các chỉ số được hỏi là dữ liệu hiện trạng, không có lịch sử theo kỳ. Bỏ mốc thời gian (Toàn bộ thời gian) "
                "hoặc chọn chỉ số có lịch sử.", [{"label": "Bỏ mốc thời gian", "kind": "advice"}]))
        if wants_history and not metric_ids:
            # A subject named without a metric ("tồn kho theo tháng") whose
            # active metrics are all snapshots has no history either.
            from services.request_anchors import exact_mentions
            vocabulary = {}
            for s, d in r["subjects"].items():
                active = [m for m in d.get("metrics", []) if m in metrics and not metrics[m].get("component_only")
                          and metrics[m].get("lifecycle", {}).get("status") != "deprecated"]
                if active and not any(metrics[m].get("time_column") for m in active):
                    for a in [d["business_name"], *d.get("aliases", [])]:
                        vocabulary.setdefault(value_text(a), set()).add(s)
            for s in dict.fromkeys(next(iter(a["candidate_ids"])) for a in exact_mentions(value_text(question), vocabulary)
                                   if len(a["candidate_ids"]) == 1):
                findings.append(finding("warn", "snapshot_metric_trend",
                    f"{r['subjects'][s]['business_name']} chỉ có số liệu hiện trạng (ảnh chụp), không có lịch sử theo thời gian; "
                    "hệ thống chỉ trả giá trị hiện tại.", [{"label": "Bỏ mốc thời gian / xu hướng", "kind": "advice"}], subject=s))

        # --- A cadence needs at least two full buckets inside the requested window ---
        cadence_days = {"week": 7, "month": 28, "quarter": 90, "year": 365}
        # Only an explicit cadence phrase ("theo tuần"); a bare "tháng 9" is a date, not a cadence.
        grans = {g for g, phrase in ws.get("granularity_phrases", {}).items()
                 if g in cadence_days and _mentions(text, [value_text(phrase)])}
        if input_mode == "guided" and guided_contract and guided_contract.get("granularity") in cadence_days:
            grans.add(guided_contract["granularity"])
        if grans and period and period.get("start") and period.get("end"):
            span = (date.fromisoformat(str(period["end"])[:10]) - date.fromisoformat(str(period["start"])[:10])).days + 1
            for g in sorted(grans):
                if span < 2 * cadence_days[g]:
                    wider = (date.fromisoformat(str(period["end"])[:10]) - timedelta(days=cadence_days[g] * 8 - 1)).isoformat()
                    findings.append(finding("block", "trend_range_too_short",
                        f"Khoảng {str(period['start'])[:10]} → {str(period['end'])[:10]} ({span} ngày) quá ngắn để vẽ xu hướng {ws.get('granularity_phrases', {}).get(g, g)}; cần ít nhất 2 kỳ đầy đủ.",
                        [{"label": f"Mở rộng thành 8 kỳ gần nhất (từ {wider})", "kind": "set_time",
                          "time": {"mode": "custom", "start": wider, "end": str(period["end"])[:10]}},
                         {"label": "Bỏ yêu cầu xu hướng, xem giá trị của khoảng này", "kind": "advice"}],
                        granularity=g, days=span, minimum_days=2 * cadence_days[g]))

        # --- Breadth ---
        goals = len({tuple(a["candidate_ids"]) for a in anchors["metrics"]}) + len(understood["unsupported"])
        if limit.get("max_requirements") and goals > limit["max_requirements"]:
            findings.append(finding("warn", "too_many_goals",
                f"Câu hỏi có {goals} mục tiêu chỉ số; hệ thống lập tối đa {limit['max_requirements']} yêu cầu mỗi lần. Nên tách thành nhiều câu hỏi.",
                [{"label": "Tách câu hỏi", "kind": "advice"}], goals=goals, maximum=limit["max_requirements"]))
        if not metric_ids and not understood["unsupported"]:
            findings.append(finding("info", "no_metric_detected",
                "Chưa nhận ra chỉ số cụ thể trong câu hỏi; AI sẽ diễn giải ý định (tối đa một lượt), hoặc chọn chỉ số trong “Hỏi được gì?”."))
        if mission and mission.get("caveat"):
            findings.append(finding("info", "mission_caveat", mission["caveat"]))

    # --- V3.2 honest recognition, mission semantics and guided contracts ---
    inferred, guided, state = None, None, None
    recognition = {"business": [], "analytical": []}
    if question.strip() and not blocked_length:
        missions_by_id = {m["id"]: m for m in r.get("analysis_missions", [])}
        signals = missions.mission_signals(text, r)
        inferred = missions.infer_mission(text, r)
        business = [*(m["id"] for m in understood["metrics"]), *(d["id"] for d in understood["dimensions"]),
                    *(f["dimension"] for f in understood["filters"]), *(u["id"] for u in understood["unsupported"]),
                    *(f["concept"] for f in findings if f["code"] == "privacy_blocked"),
                    *_vocabulary_hits(text, ws.get("business_signal_vocabulary", [])),
                    *_subject_hits(question, r),
                    *(["overview"] if "overview" in signals else [])]
        analytical = [*(["time"] if periods else []), *(["granularity"] if anchors.get("granularities") else []),
                      *(["ranking"] if anchors.get("rankings") else []), *(["forecast"] if forecast_requested else []),
                      *sorted(m for m in signals if m != "overview")]
        recognition = {"business": sorted(set(map(str, business))), "analytical": sorted(set(analytical))}
        vague = _vocabulary_hits(text, ws.get("vague_quality_terms", []))
        # A greeting is not analytical evidence even when diacritic-folding makes "bạn" look like "bán":
        # only structured anchors (metric/dimension/value/unsupported concept) or analytical operators count then.
        if _vocabulary_hits(text, ws.get("greeting_vocabulary", [])):
            structured = [*(m["id"] for m in understood["metrics"]), *(d["id"] for d in understood["dimensions"]),
                          *(f["dimension"] for f in understood["filters"]), *(u["id"] for u in understood["unsupported"])]
            if not structured and not analytical:
                business = []
        if not business and not analytical:
            findings.append(finding("block", "unrecognized_question", "Chưa nhận ra nội dung phân tích dữ liệu trong câu hỏi.",
                                    [{"label": "Mở “Hỏi được gì?” để chọn chỉ số", "kind": "advice"}]))
            state = "BLOCKED"
        elif not business or set(business)<={'overview'}:
            missing = (mission or {}).get("input_contract", {}).get("required") or ["metric"]
            findings.append(finding("block", "analysis_target_missing",
                "Cần nêu chỉ số hoặc đối tượng cần phân tích (ví dụ doanh thu, số đơn, tỷ lệ hủy đơn).",
                [{"label": "Chọn chỉ số trong “Hỏi được gì?”", "kind": "advice"}], missing=[s for s in missing if s != "time"]))
            state = "NEEDS_INPUT"
        elif not understood['metrics'] and not understood['unsupported'] and (
                ('compare' in signals and not understood['filters']) or
                (set(map(value_text,business))<={'hoat dong','van hanh'} and not understood['dimensions'] and not understood['filters']
                 and (mission or {}).get('id')!='risk_watch') or
                (not understood['dimensions'] and not understood['filters'] and not analytical and any(
                    re.fullmatch(r'\s*'+re.escape(value_text(subject))+r'\s+'+re.escape(value_text(suffix))+r'\s*[?!.]*',text)
                    for subject in ws.get('business_signal_vocabulary',[]) for suffix in ws.get('generic_question_suffixes',[])))):
            findings.append(finding('block','metric_needed',
                'Cần chọn chỉ số và đối tượng cụ thể để phân tích; với so sánh, hãy nêu rõ các nhóm cần đối chiếu.',
                [{'label':'Chọn chỉ số trong “Hỏi được gì?”','kind':'advice'}],missing=['metric']))
            state='NEEDS_INPUT'
        elif understood["unsupported"] and not understood["metrics"]:
            # Only an ungoverned concept was asked for: AI cannot answer it, so never spend a call.
            concept = next(f for f in findings if f["code"] == "unsupported_concept")
            findings.append(finding("block", "unsupported_only",
                "Câu hỏi chỉ nêu khái niệm chưa có định nghĩa được quản trị; hãy chọn một chỉ số gần nhất để phân tích.",
                concept["fixes"], nearest=concept.get("nearest", []), missing=["metric"]))
            state = "NEEDS_INPUT"
        elif vague and not understood["metrics"] and not understood["unsupported"]:
            dims = [d["id"] for d in understood["dimensions"]]
            options = [m for p in r["domain_intelligence"]["profiles"].values() for l in p["analytical_lenses"]
                       if not dims or set(dims) & set(l["dimension_refs"]) for m in l["metric_refs"] if m in r["metrics"]]
            options = list(dict.fromkeys(options))[:3]
            findings.append(finding("block", "metric_needed",
                f"“{vague[0]}” cần một tiêu chí đo lường. Hãy chọn chỉ số dùng để đánh giá.",
                [{"label": f"Theo {r['metrics'][m]['business_name'].lower()}", "kind": "replace_question",
                  "question": f"{question.rstrip(' ?')} theo {r['metrics'][m]['business_name'].lower()}"} for m in options],
                missing=["metric"]))
            state = "NEEDS_INPUT"
        if mission and missions.mission_mismatch(mission["id"], inferred, r):
            target = missions_by_id[inferred["id"]]
            findings.append(finding("block", "mission_mismatch",
                f"Câu hỏi là bài toán “{target['label']}”, nhưng nhiệm vụ đang chọn là “{mission['label']}”.",
                [{"label": f"Chuyển sang {target['label']}", "kind": "switch_mission", "mission": target["id"]},
                 {"label": f"Viết lại câu hỏi cho {mission['label']}", "kind": "rewrite_for_mission", "mission": mission["id"]}],
                selected=mission["id"], inferred=inferred["id"]))
            state = state or "NEEDS_INPUT"
        if ((mission and mission['id']=='risk_watch') or (not mission and inferred and inferred['id']=='risk_watch')) and understood['metrics']:
            risk_metrics = {s["metric"] for s in r.get("risk_signals", [])} | {s["observation_metric"] for s in r.get("risk_signals", []) if s.get("observation_metric")}
            if not any(m["id"] in risk_metrics for m in understood["metrics"]):
                findings.append(finding("block", "risk_signal_required",
                    "Doanh thu, số đơn hoặc giá trị đơn trung bình không phải tín hiệu rủi ro được quản trị; hãy xem ở Tổng quan hoặc Xu hướng.",
                    [{"label": f"Chuyển sang {missions_by_id[t]['label']}", "kind": "switch_mission", "mission": t} for t in ("overview", "trend") if t in missions_by_id],
                    metrics=[m["id"] for m in understood["metrics"]]))
                state = state or "NEEDS_INPUT"
            elif mission and any(m['id'] not in risk_metrics for m in understood['metrics']):
                findings.append(finding('block','risk_mixed_roles',
                    'Yêu cầu gồm tín hiệu rủi ro và chỉ số kinh doanh. Chuyển sang Câu hỏi tự do để giữ đủ cả hai phần phân tích.',
                    [{'label':'Phân tích đầy đủ trong Câu hỏi tự do','kind':'switch_mission','mission':None}]))
                state=state or 'NEEDS_INPUT'
        # --- V3.3 deterministic capability gates (governed vocabulary + metric metadata; no question-text blacklist) ---
        for cid, concept in unsupported_concepts(r).items():
            hits = _mentions(text, concept.get("predicate_aliases", []))
            hits = [h for h in hits if not re.search(r"\b(?:khong|dung)\s+(?:xet|loc|tinh|lay)(?:\s+(?:cac|nhung|chi nhanh))*\s*$", text[max(0,h[0]-80):h[0]])]
            if hits:
                span = _span(index, hits[0][0], hits[0][1])
                findings.append(finding("block", "unsupported_predicate",
                    f"Điều kiện “{question[slice(*span)]}” cần dữ liệu chi phí/lợi nhuận mà kho chưa có. {concept.get('limitation', '')}".strip(),
                    [{"label": "Bỏ điều kiện này và xem theo chỉ số có sẵn", "kind": "replace_question", "question": _replace(question, span, "")},
                     *[{"label": f"Dùng {r['metrics'][m]['business_name'].lower()} thay thế", "kind": "advice"} for m in concept.get("nearest_metrics", [])[:2]]],
                    concept=cid))
                state = state or "NEEDS_INPUT"
                break
        # Constraints are judged clause by clause: a composition word binds only the metrics of ITS clause.
        by_id = {m["id"]: m for m in understood["metrics"]}
        for cs, ce in _clauses(question, index, len(text)):
            ctext = text[cs:ce]
            csig = missions.mission_signals(ctext, r)
            cmetrics = [by_id[p] for p, a in mentions if cs <= a["start"] < ce and p in by_id]
            cdims = [d for d in understood["dimensions"] if any(cs <= a["start"] < ce and d["id"] in a["candidate_ids"] for a in anchors["dimensions"])]
            non_additive = [m for m in cmetrics if r["metrics"][m["id"]].get("aggregation_semantics") in ("ratio", "average")]
            if "composition" in csig and non_additive:
                findings.append(finding("block", "composition_non_additive",
                    f"{non_additive[0]['label']} là tỷ lệ/trung bình nên không cộng thành cơ cấu; hãy so sánh giữa các nhóm.",
                    [{"label": f"Chuyển sang {missions_by_id['compare']['label']}", "kind": "switch_mission", "mission": "compare"}],
                    metrics=[m["id"] for m in non_additive]))
                state = state or "NEEDS_INPUT"
            # Different metrics bound to different entities ("doanh thu HCM so với tỷ lệ hủy Hà Nội") have no common gap;
            # several metrics compared side by side over the same groups ("so sánh A, B, C theo chi nhánh") are fine.
            marks = sorted([(a["start"], "m", p) for p, a in mentions if cs <= a["start"] < ce and p in by_id] +
                           [(text.find(value_text(f["display"]), cs, ce), "v", f["value"]) for f in understood["filters"]
                            if text.find(value_text(f["display"]), cs, ce) >= 0])
            pairs, last_metric = [], None
            for _, kind, ref in marks:
                if kind == "m":
                    last_metric = ref
                elif last_metric is not None:
                    pairs.append((last_metric, ref)); last_metric = None
            entity_mixed = any(a[0] != b[0] and a[1] != b[1] and by_id[a[0]]["unit"] != by_id[b[0]]["unit"]
                               for i, a in enumerate(pairs) for b in pairs[i + 1:])
            if "compare" in csig and entity_mixed:
                findings.append(finding("block", "compare_mixed_units",
                    "Hai chỉ số có đơn vị khác nhau nên không có chênh lệch chung; hãy chọn một chỉ số để so sánh hai nhóm, hoặc xem riêng từng chỉ số.",
                    [{"label": f"So sánh riêng {m['label'].lower()}", "kind": "advice"} for m in cmetrics[:2]],
                    metrics=[m["id"] for m in cmetrics]))
                state = state or "NEEDS_INPUT"
            cvague = _vocabulary_hits(ctext, ws.get("vague_quality_terms", []))
            crank = bool(anchors.get("rankings"))
            if "compare" in csig and cvague and not crank and len(cmetrics) <= 1:
                findings.append(finding("block", "cohort_criterion_needed",
                    f"“{cvague[0]}” cần tiêu chí đo lường và số lượng nhóm (N) để xác định nhóm so sánh.",
                    [{"label": "Nêu rõ: Top 3 theo doanh thu", "kind": "advice"}], term=cvague[0]))
                state = state or "NEEDS_INPUT"
            if "relationship" in csig and len(cmetrics) == 1 and cdims:
                findings.append(finding("block", "association_category_variable",
                    f"“{cdims[0]['label']}” là biến phân loại, không tính hệ số tương quan được; hãy so sánh chỉ số theo từng {cdims[0]['label'].lower()} hoặc chọn hai chỉ số số học.",
                    [{"label": f"Chuyển sang {missions_by_id['compare']['label']}", "kind": "switch_mission", "mission": "compare"}],
                    dimension=cdims[0]["id"]))
                state = state or "NEEDS_INPUT"
        understood["inferred_mission"] = ({"id": inferred["id"], "label": missions_by_id[inferred["id"]]["label"]}
                                          if inferred and inferred.get("id") else None)
    if input_mode == "guided" and guided_contract is not None and not blocked_length:
        try:
            slots = missions.validate_guided(catalog, (mission or {}).get("id"), guided_contract,
                                             scope_filters=(analysis_scope or {}).get("filters") or [])
            missions.check_metric_clocks(catalog, slots, time_range)
            guided = {"source": "builder", "slots": slots}
            findings=[f for f in findings if f['code'] not in {'unrecognized_question','no_metric_detected','analysis_target_missing','metric_needed'}]
        except missions.GuidedContractError as error:
            findings=[f for f in findings if f['code'] not in {'unrecognized_question','no_metric_detected'}]
            findings.append(finding("block", "guided_contract_invalid", str(error),
                                    field=error.field))
    from services.input_integrity_service import validate as validate_input, validate_structured_scope
    input_validation = validate_input(question if integrity_text is None else integrity_text, catalog,
        anchors=anchors if integrity_text is None else None, lookup=input_lookup,
        context={'time':time_range, 'scope':analysis_scope, 'mission':analysis_mission,
                 'input_mode':input_mode, 'guided_contract':guided_contract, 'analysis_depth':analysis_depth,
                 'mode':'refinement' if integrity_text is not None else 'question'}) if not blocked_length else None
    if input_validation:
        validate_structured_scope(analysis_scope, catalog, input_validation, lookup=input_lookup,
                                  grounded_filters=grounded_scope_filters)
    if input_validation and not input_validation['can_submit']:
        findings.extend(input_validation['findings'])
        state = state or 'NEEDS_INPUT'
    unique = {}
    for f in findings:
        unique.setdefault((f["code"], f["message"]), f)
    findings = sorted(unique.values(), key=lambda f: {"block": 0, "warn": 1, "info": 2}[f["level"]])
    blocked = any(f["level"] == "block" for f in findings)
    if blocked:
        # "AI sẽ diễn giải" is false advice once the request cannot be sent.
        findings = [f for f in findings if f["code"] != "no_metric_detected"]
    if not guided and not blocked and question.strip() and not blocked_length:
        guided = auto_guided(understood, anchors, findings, mission, inferred, r)
    if blocked:
        state = state or "BLOCKED"
    elif guided:
        state = "READY_GUIDED"
    else:
        state = "READY_FOR_AI"
    labels = ws.get("preflight_states", {})
    label_key = ("MISMATCH" if any(f["code"] == "mission_mismatch" for f in findings)
                 else "UNRECOGNIZED" if any(f["code"] == "unrecognized_question" for f in findings) else state)
    contract = contract_from_preflight(understood, anchors, r, (mission or {}).get("id"), inferred)
    return {"version": "3.2.0", "status": "blocked" if blocked else "warning" if any(f["level"] == "warn" for f in findings) else "ok",
            "state": state, "state_label": labels.get(label_key, label_key), "can_submit": not blocked,
            "capability": decision_from_findings(findings, catalog_fingerprint=catalog.fingerprint,
                interpretation_required=state == "READY_FOR_AI").model_dump(mode="json"),
            "scope_resolution": anchors.get("scope_resolution", {"state":"unspecified","filters":[]}),
            "understood": understood, "findings": findings, "recognition": recognition,
            "input_validation": input_validation,
            "guided_contract": guided, "semantic_contract": contract,
            "provider_calls": 0, "warehouse_queries": 0,
            "lookup_queries": (input_validation or {}).get('lookup_queries', 0),
            "coverage_status": (coverage or {}).get("status", "not_loaded"),
            "registry_fingerprint": catalog.registry_fingerprint,
            "elapsed_ms": round((time.perf_counter() - started) * 1000, 2)}


def auto_guided(understood, anchors, findings, mission, inferred, registry):
    """Free text whose every required field is deterministically known (V3.2 §74).

    Only forecast and single-metric trends qualify; any warning, filter,
    ambiguity or extra grouping keeps the request on the AI path.
    """
    target = (mission or {}).get("id") or (inferred or {}).get("id")
    if (inferred or {}).get("id") and target != inferred["id"]:
        return None
    ms = understood["metrics"]
    if target == "risk_watch" and (mission or {}).get("id") == "risk_watch":
        # Default Risk Watch = every governed signal, deterministic (0 AI calls).
        risk_metrics = {s["metric"] for s in registry.get("risk_signals", [])}
        # "của thành phố Hồ Chí Minh" names a scope, not a grouping axis.
        scoped = {f["dimension"] for f in understood["filters"]}
        if all(m["id"] in risk_metrics for m in ms) and all(d["id"] in scoped for d in understood["dimensions"]):
            return {"source": "auto_upgrade", "slots": {"mission": "risk_watch",
                    "signals": [s["id"] for s in registry.get("risk_signals", [])
                                if not ms or s["metric"] in {m["id"] for m in ms}]},
                    # Scope named in the question is grounded by Risk Watch itself.
                    "question_filters": understood["filters"]}
        return None
    if any(f["level"] == "warn" for f in findings) or understood["filters"] or understood["unsupported"]:
        return None
    if len(ms) != 1 or ms[0]["alternatives"] or len(anchors.get("metrics", [])) != 1:
        return None
    metric = ms[0]["id"]
    if target == "forecast":
        f = understood.get("forecast") or {}
        spec = (registry["metrics"][metric].get("forecast") or {})
        if (not f.get("requested") or not f.get("horizon") or f.get("unit") not in spec.get("cadences", [])
                or understood["dimensions"] or f["horizon"] > spec["max_horizon"][f["unit"]]):
            return None
        return {"source": "auto_upgrade", "slots": {"mission": "forecast", "metric": metric,
                                                    "horizon": f["horizon"], "cadence": f["unit"]}}
    if target == "trend":
        cadences = {g for a in anchors.get("granularities", []) for g in a["candidate_ids"]}
        if (len(cadences) != 1 or understood["dimensions"] or not registry["metrics"][metric].get("time_column")
                or (understood.get("time") or {}).get("source") != "question"):
            return None
        return {"source": "auto_upgrade", "slots": {"mission": "trend", "metric": metric, "granularity": next(iter(cadences))},
                "time": {"start": understood["time"]["start"], "end": understood["time"]["end"]}}
    return None


class RateLimiter:
    """Small in-process sliding window per caller key; preflight is cheap but frequent."""

    def __init__(self, requests=40, window_seconds=10, max_keys=4096):
        self.requests, self.window, self.max_keys = requests, window_seconds, max_keys
        self.hits = {}
        self.lock = Lock()

    def allow(self, key, now=None):
        now = time.monotonic() if now is None else now
        with self.lock:
            queue = self.hits.setdefault(key, deque())
            while queue and queue[0] <= now - self.window:
                queue.popleft()
            if len(queue) >= self.requests:
                return False
            queue.append(now)
            if len(self.hits) > self.max_keys:
                for stale in [k for k, q in self.hits.items() if not q or q[-1] <= now - self.window]:
                    self.hits.pop(stale, None)
            return True
