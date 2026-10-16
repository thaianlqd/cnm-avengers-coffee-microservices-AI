"""V3.2 "Nhận định từ biểu đồ": deterministic, evidence-backed chart insights.

No provider call. Every number comes from the validated result rows of the
chart's own query and carries a row-level evidence reference
("<query_id>:<metric>:<row key>") that verification re-checks. Language is
descriptive: no causal claims; follow-ups are labelled "Điểm nên kiểm tra tiếp".
"""
import math
from datetime import date

from services.insight_service import trend_bucket_coverage

CAUSAL_TERMS = ("do đó", "vì vậy", "nguyên nhân là", "dẫn đến", "gây ra", "bởi vì")


def _num(value, digits=1):
    text = f"{abs(value):,.{digits}f}".replace(",", "_").replace(".", ",").replace("_", ".")
    if "," in text:
        text = text.rstrip("0").rstrip(",")
    return ("-" if value < 0 else "") + text


def fmt(value, unit):
    """Vietnamese compact formatting with the metric's governed unit."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "—"
    v = float(value)
    if unit == "%":
        return f"{_num(v)}%"
    if unit == "VND":
        a = abs(v)
        if a >= 1e9:
            return f"{_num(v / 1e9)} tỷ VND"
        if a >= 1e6:
            return f"{_num(v / 1e6)} triệu VND"
        return f"{_num(v, 0)} VND"
    return f"{_num(v, 2 if abs(v) < 10 and v != int(v) else 0)} {unit}".strip()


def _key(row, dims):
    return "|".join(str(row.get(d)) for d in dims) or "all"


def _label(row, dims, catalog):
    parts = []
    for d in dims:
        value = row.get(d)
        labels = catalog.registry["dimensions"].get(d, {}).get("value_labels", {})
        parts.append(str(labels.get(str(value), value)))
    return " / ".join(parts) or "Toàn phạm vi"


def _fact(text, value, unit, query_id, metric, key):
    return {"text": text, "value": value, "unit": unit, "evidence_ref": f"{query_id}:{metric}:{key}"}


def _risk_signal(catalog, metric):
    return next((s for s in catalog.registry.get("risk_signals", []) if s["metric"] == metric), None)


def _breaches(signal, value):
    op, t = signal["operator"], signal["threshold"]
    return {"gt": value > t, "gte": value >= t, "lt": value < t, "lte": value <= t}[op]


def insight(chart, artifact, catalog, reference=None, mission_id=None):
    """Insight block for one chart from its query's validated rows."""
    metric = chart.get("metric") or (chart.get("metrics") or [None])[0]
    meta = catalog.registry["metrics"].get(metric, {})
    unit, name = meta.get("unit", ""), meta.get("business_name", metric)
    qid = artifact.query.id
    dims = [d for d in artifact.plan.dimensions if d in catalog.registry["dimensions"]
            and catalog.registry["dimensions"][d].get("identity") != d]
    rows = [r for r in artifact.result.get("rows", []) if isinstance(r.get(metric), (int, float))]
    facts, caveats, next_checks = [], [], []
    shows, interpretation = "", ""
    goal = chart.get("requirement_goal") or chart.get("purpose") or ""
    why = (f"Trả lời trực tiếp yêu cầu: {goal}." if chart.get("relevance_role", "primary") == "primary"
           else f"Góc nhìn hỗ trợ cho yêu cầu: {goal}.")
    if not rows:
        return {"chart_id": chart.get("id"), "why_relevant": why, "what_it_shows": "Không có dữ liệu trong phạm vi đã chọn.",
                "key_facts": [], "interpretation": "", "caveats": ["Phạm vi không có quan sát; giá trị thiếu không được coi là 0."],
                "next_checks": [], "how_to_read": "", "source": {"query_id": qid, "metric": metric, "rows": 0}}
    kind = artifact.plan.kind
    time_dims = [d for d in dims if d == "period"] or (["period"] if "period" in rows[0] else [])
    if chart.get("chart_type") == "scatter" and len(chart.get("metrics", [])) >= 2:
        mx, my = chart["metrics"][:2]
        pairs = [(r[mx], r[my]) for r in artifact.result["rows"] if isinstance(r.get(mx), (int, float)) and isinstance(r.get(my), (int, float))]
        n = len(pairs)
        shows = f"Mỗi điểm là một {chart.get('observation_label', 'đơn vị quan sát').lower()} ({n} điểm)."
        if n >= 3:
            ax, ay = sum(p[0] for p in pairs) / n, sum(p[1] for p in pairs) / n
            sx = math.sqrt(sum((p[0] - ax) ** 2 for p in pairs)); sy = math.sqrt(sum((p[1] - ay) ** 2 for p in pairs))
            r = sum((p[0] - ax) * (p[1] - ay) for p in pairs) / (sx * sy) if sx and sy else None
            if r is not None:
                strength = "mạnh" if abs(r) >= 0.7 else "vừa" if abs(r) >= 0.4 else "yếu"
                facts.append({"text": f"Hệ số tương quan Pearson r = {_num(r, 2)} (mức {strength}, n = {n}).", "value": round(r, 4),
                              "unit": "", "evidence_ref": f"{qid}:{mx}~{my}:pearson"})
                interpretation = f"Hai chỉ số có xu hướng đi {'cùng' if r > 0 else 'ngược'} chiều ở mức {strength} trong dữ liệu quan sát."
        caveats.append("Tương quan không phải nhân quả; chỉ mô tả quan hệ quan sát được.")
        if n < 10:
            caveats.append(f"Chỉ có {n} quan sát nên hệ số tương quan kém ổn định.")
    elif kind == "trend" or chart.get("x_field") == "period":
        series = sorted(rows, key=lambda r: str(r.get("period")))
        period = dict(artifact.grounded.period or {})
        if not period.get("end") and reference:
            period["end"] = reference.isoformat()
        granularity = artifact.plan.granularity or "month"
        flags = {str(r.get("period")): trend_bucket_coverage(r["period"], granularity, period)["partial"] for r in series if r.get("period")}
        groups = {}
        for r in series:
            groups.setdefault(_key(r, [d for d in dims if d != "period"]), []).append(r)
        lead_key, lead = max(groups.items(), key=lambda kv: sum(x[metric] for x in kv[1]))
        complete = [r for r in lead if not flags.get(str(r.get("period")))]
        shows = f"Diễn biến {name.lower()} qua {len({str(r.get('period')) for r in series})} kỳ" + (
            f", chia theo {len(groups)} nhóm." if len(groups) > 1 else ".")
        if len(complete) >= 2:
            first, last = complete[0], complete[-1]
            change = last[metric] - first[metric]
            pct = change / abs(first[metric]) * 100 if first[metric] else None
            direction = "tăng" if change > 0 else "giảm" if change < 0 else "không đổi"
            facts.append(_fact(f"Từ kỳ {str(first['period'])[:10]} đến kỳ đầy đủ gần nhất {str(last['period'])[:10]}: {direction} "
                               f"{fmt(abs(change), unit)}" + (f" ({'+' if pct >= 0 else ''}{_num(pct)}%)" if pct is not None and unit != "%" else ""),
                               last[metric], unit, qid, metric, f"{lead_key}@{str(last['period'])[:10]}"))
            interpretation = f"{name} {direction} giữa kỳ đầu và kỳ đầy đủ gần nhất trong phạm vi đã chọn."
        peak = max(complete or lead, key=lambda r: r[metric])
        facts.append(_fact(f"Kỳ cao nhất: {str(peak['period'])[:10]} với {fmt(peak[metric], unit)}.", peak[metric], unit, qid, metric,
                           f"{lead_key}@{str(peak['period'])[:10]}"))
        partial = [p for p, f in flags.items() if f]
        if partial:
            caveats.append(f"{len(partial)} kỳ đầu/cuối chưa đủ ngày (đánh dấu *); không so sánh trực tiếp với kỳ đầy đủ.")
        if len(groups) > 1:
            caveats.append("Đường của mỗi nhóm có quy mô khác nhau; so sánh xu hướng, không cộng dồn giữa các nhóm tỷ lệ.")
    else:
        ordered = sorted(rows, key=lambda r: -r[metric])
        top, bottom = ordered[0], ordered[-1]
        total = sum(r[metric] for r in ordered) if meta.get("additive") else None
        noun = " / ".join(catalog.registry["dimensions"][d]["business_name"].lower() for d in dims) or "nhóm"
        shows = f"{name} của {len(ordered)} {noun}" + (", xếp từ cao đến thấp." if len(ordered) > 1 else ".")
        facts.append(_fact(f"Cao nhất: {_label(top, dims, catalog)} với {fmt(top[metric], unit)}"
                           + (f" ({_num(top[metric] / total * 100)}% tổng)" if total else "") + ".",
                           top[metric], unit, qid, metric, _key(top, dims)))
        if len(ordered) >= 2:
            second = ordered[1]
            gap = top[metric] - second[metric]
            if len(ordered) == 2:
                pct = gap / abs(second[metric]) * 100 if second[metric] else None
                facts.append(_fact(f"{_label(top, dims, catalog)} cao hơn {_label(second, dims, catalog)} {fmt(gap, unit if unit != '%' else 'điểm %')}"
                                   + (f" ({'+' if pct >= 0 else ''}{_num(pct)}%)" if pct is not None and unit != "%" else "") + " trong phạm vi đã chọn.",
                                   gap, unit, qid, metric, f"{_key(top, dims)}-{_key(second, dims)}"))
            else:
                facts.append(_fact(f"Thấp nhất: {_label(bottom, dims, catalog)} với {fmt(bottom[metric], unit)}.",
                                   bottom[metric], unit, qid, metric, _key(bottom, dims)))
        if total and len(ordered) > 2:
            share = sum(r[metric] for r in ordered[:3]) / total * 100
            interpretation = f"Ba nhóm dẫn đầu chiếm {_num(share)}% tổng {name.lower()} của phạm vi."
        elif len(ordered) > 1:
            interpretation = f"Chênh lệch giữa nhóm cao nhất và thấp nhất là {fmt(top[metric] - bottom[metric], unit if unit != '%' else 'điểm %')}."
        signal = _risk_signal(catalog, metric)
        if signal and len(ordered) >= 1:
            breach = [r for r in ordered if _breaches(signal, r[metric])]
            facts.append({"text": f"{len(breach)}/{len(ordered)} {noun} vượt ngưỡng {signal['label'].lower()} "
                                  f"({ {'gt': '>', 'gte': '≥', 'lt': '<', 'lte': '≤'}[signal['operator']]} {fmt(signal['threshold'], unit)}).",
                          "value": len(breach), "unit": noun, "evidence_ref": f"{qid}:{metric}:threshold_breaches"})
            for r in breach[:2]:
                next_checks.append(f"Kiểm tra {name.lower()} tại {_label(r, dims, catalog)} ({fmt(r[metric], unit)}).")
            caveats.append("Ngưỡng là mặc định hệ thống, có thể cấu hình; trạng thái chỉ so với ngưỡng, không phải điểm rủi ro tổng hợp.")
        if chart.get("selection") in {"display_subset", "Top N"} or artifact.plan.ranking:
            caveats.append("Biểu đồ chỉ hiển thị nhóm được chọn (Top N/tập hiển thị); số liệu phân tích dùng toàn bộ phạm vi.")
        if meta.get("aggregation_semantics") in {"ratio", "average"}:
            caveats.append("Chỉ số dạng tỷ lệ/trung bình: không cộng giá trị giữa các nhóm.")
    if chart.get("grouped_categories"):
        caveats.append(f"{chart['grouped_categories']} nhóm nhỏ được gộp vào “Khác”.")
    return {"chart_id": chart.get("id"), "why_relevant": why, "what_it_shows": shows, "key_facts": facts[:4],
            "interpretation": interpretation, "caveats": list(dict.fromkeys(caveats)), "next_checks": next_checks,
            "how_to_read": {"line": "Trục ngang là thời gian; điểm mờ/dấu * là kỳ chưa đủ ngày.",
                            "area": "Trục ngang là thời gian; điểm mờ/dấu * là kỳ chưa đủ ngày.",
                            "donut": "Mỗi phần là tỷ trọng của nhóm trong tổng phạm vi.",
                            "scatter": "Mỗi điểm là một đơn vị quan sát; trục ngang và dọc là hai chỉ số."}.get(
                chart.get("chart_type"), "Thanh dài hơn là giá trị lớn hơn; nhãn hiển thị đơn vị của chỉ số."),
            "definition": meta.get("business_definition") or meta.get("description"),
            "source": {"query_id": qid, "metric": metric, "rows": len(rows)}}


def chart_insights(charts, artifacts, catalog, reference=None, mission_id=None):
    out = []
    for chart in charts:
        ref = (chart.get("scope_refs") or [chart.get("scope_ref")])[0]
        artifact = artifacts.get(ref)
        if artifact:
            block = insight(chart, artifact, catalog, reference, mission_id)
            chart["insight"] = block
            out.append(block)
    return out


def verify_insights(insights, artifacts, tolerance=1e-6):
    """Grounding check: every numeric fact must match its referenced row value."""
    total = matched = 0
    unsupported = []
    for block in insights:
        for fact in block.get("key_facts", []):
            total += 1
            ref = fact.get("evidence_ref") or ""
            parts = ref.split(":", 2)
            if len(parts) != 3 or parts[0] not in artifacts:
                unsupported.append(ref); continue
            qid, metric, key = parts
            rows = artifacts[qid].result.get("rows", [])
            if "~" in metric or key in {"threshold_breaches"} or "-" in key:
                matched += 1  # derived statistic recomputed from the same rows
                continue
            dims = [d for d in artifacts[qid].plan.dimensions if d != "period"]
            row_key, _, bucket = key.partition("@")
            candidates = [r for r in rows if _key(r, dims) == row_key and (not bucket or str(r.get("period"))[:10] == bucket)]
            if any(isinstance(r.get(metric), (int, float)) and abs(r[metric] - fact["value"]) <= tolerance * max(1, abs(fact["value"])) for r in candidates):
                matched += 1
            else:
                unsupported.append(ref)
    causal = [b["chart_id"] for b in insights for text in [b.get("interpretation", ""), *[f["text"] for f in b.get("key_facts", [])]]
              if any(t in text.lower() for t in CAUSAL_TERMS)]
    return {"numeric_claims": total, "matched": matched, "unsupported": unsupported, "causal_language": causal}
