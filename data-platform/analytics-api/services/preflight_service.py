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
    key = (stamp, id(physical) if physical else None)
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
        for c in piece or " ":
            c = c if re.match(r"\w", c) else " "
            if c == " " and (not out or out[-1] == " "):
                continue
            out.append(c)
            index.append(i)
    while out and out[-1] == " ":
        out.pop()
        index.pop()
    return "".join(out), index


def _span(index, start, end):
    return index[start], index[end - 1] + 1


def _replace(question, span, value):
    start, end = span
    text = (question[:start] + value + question[end:])
    return re.sub(r"\s{2,}", " ", text).strip()


def _mentions(text, phrases):
    found = []
    for phrase in sorted({value_text(p) for p in phrases if p}, key=len, reverse=True):
        if len(phrase) < 2:
            continue
        for m in re.finditer(r"(?<!\w)" + re.escape(phrase) + r"(?!\w)", text):
            if not any(a <= m.start() and m.end() <= b for a, b, _ in found):
                found.append((m.start(), m.end(), phrase))
    return found


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
        return min(f["min_date"] for f in known), max(f["max_date"] for f in known), [f["label"] for f in known]
    overall = (coverage or {}).get("overall", {})
    return overall.get("min_date"), overall.get("max_date"), []


# --- Main -------------------------------------------------------------------

def run(question, time_range=None, analysis_scope=None, analysis_mission=None, reference=None, catalog=None, coverage=None):
    from services.request_anchors import request_anchors
    from services.time_resolution_service import parse_time, resolve_time
    from services import data_coverage_service
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
    blocked_length = any(f["code"] == "question_too_long" for f in findings)

    understood = {"metrics": [], "dimensions": [], "filters": [], "time": None, "forecast": None,
                  "mission": {"id": mission["id"], "label": mission["label"]} if mission else None, "unsupported": []}
    if question.strip() and not blocked_length:
        anchors = request_anchors(question, catalog, {})
        metrics = r["metrics"]
        # One entry per mentioned phrase: the governed metric whose label is the
        # phrase itself is primary; other candidates stay visible alternatives.
        mentions, ambiguous = [], []
        for a in anchors["metrics"]:
            exact = [m for m in a["candidate_ids"] if value_text(metrics[m]["business_name"]) == a["phrase"]]
            primary = (exact or a["candidate_ids"])[0]
            if any(primary == p for p, _ in mentions):
                continue
            mentions.append((primary, a))
            if len(a["candidate_ids"]) > 1:
                ambiguous.append((primary, a))
        metric_ids = [p for p, _ in mentions]
        understood["metrics"] = [{"id": m, "label": metrics[m]["business_name"], "unit": metrics[m]["unit"],
                                  "historical": bool(metrics[m].get("time_column")),
                                  "forecastable": bool((metrics[m].get("forecast") or {}).get("forecastable")),
                                  "alternatives": [{"id": c, "label": metrics[c]["business_name"]} for c in a["candidate_ids"] if c != m]}
                                 for m, a in mentions]
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
        constrained = {tuple(a["candidate_ids"]) for a in anchors.get("capability_constraints", [])}
        for id, concept in unsupported_concepts(r).items():
            hits = _mentions(text, concept["aliases"])
            if not hits or (id,) in constrained:
                continue
            nearest = [{"id": m, "label": metrics[m]["business_name"]} for m in concept["nearest_metrics"]]
            span = _span(index, hits[0][0], hits[0][1])
            understood["unsupported"].append({"id": id, "phrase": question[slice(*span)]})
            findings.append(finding("warn", "unsupported_concept",
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
        low, high, facts = coverage_for(coverage, sources)
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
                    findings.append(finding("warn", "forecast_metric_unsupported",
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
                    findings.append(finding("warn", "forecast_cadence_unsupported",
                        f"Dự báo {label.lower()} hỗ trợ theo {', '.join(cadence_labels.get(c, c) for c in spec['cadences'])}.",
                        [{"label": f"Đổi thành {n} {cadence_labels.get(best, best)}", "kind": "replace_question",
                          "question": _replace(question, _span(index, match.start(), match.end()), f"{n} {cadence_labels.get(best, best)} tới")}]
                        if match else [], metric=m))
                elif unit and amount and amount > spec["max_horizon"][unit]:
                    n = spec["max_horizon"][unit]
                    findings.append(finding("warn", "forecast_horizon_exceeded",
                        f"Tầm dự báo tối đa của {label.lower()} là {n} {cadence_labels.get(unit, unit)} (đã hỏi {amount}). "
                        "Backend sẽ từ chối tầm vượt giới hạn trước khi gọi AI sửa.",
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
                    findings.append(finding("warn", "forecast_grouped_unsupported",
                        f"Chưa hỗ trợ dự báo theo từng {dim.lower()}; dự báo được tính cho toàn phạm vi đã lọc.",
                        [{"label": f"Bỏ “{question[slice(*span)]}”", "kind": "replace_question", "question": _replace(question, span, "")},
                         {"label": f"Chọn một {dim.lower()} trong Phạm vi", "kind": "advice"}], metric=m, dimension=a["candidate_ids"][0]))
                    break
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

    unique = {}
    for f in findings:
        unique.setdefault((f["code"], f["message"]), f)
    findings = sorted(unique.values(), key=lambda f: {"block": 0, "warn": 1, "info": 2}[f["level"]])
    blocked = any(f["level"] == "block" for f in findings)
    return {"version": VERSION, "status": "blocked" if blocked else "warning" if any(f["level"] == "warn" for f in findings) else "ok",
            "can_submit": not blocked, "understood": understood, "findings": findings,
            "provider_calls": 0, "warehouse_queries": 0,
            "coverage_status": (coverage or {}).get("status", "not_loaded"),
            "registry_fingerprint": catalog.registry_fingerprint,
            "elapsed_ms": round((time.perf_counter() - started) * 1000, 2)}


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
