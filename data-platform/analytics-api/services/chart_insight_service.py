"""V3.2 "Nhận định từ biểu đồ": deterministic, evidence-backed chart insights.

No provider call. Every number comes from the validated result rows of the
chart's own query and carries a row-level evidence reference
("<query_id>:<metric>:<row key>") that verification re-checks. Language is
descriptive: no causal claims; follow-ups are labelled "Điểm nên kiểm tra tiếp".
"""
import math
from datetime import date

from services.insight_service import trend_bucket_coverage, fact_reference

CAUSAL_TERMS = ("do đó", "vì vậy", "nguyên nhân là", "dẫn đến", "gây ra", "bởi vì")
# Version 2 (comparison workspace): multi-series facts name their series, member views state per-member
# facts, ties are reported as ties and a single total is a total. Charts without ``insight_version`` (saved
# before V2) are re-verified with the original wording.
# V3 distinguishes changes in a percentage measure (percentage points) from
# relative percent change, including a single time series. V1/V2 saved wording
# remains reproducible under its recorded version.
INSIGHT_VERSION = 3


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
    named = [d for d in dims if not (d.endswith("_id") and len(dims) > 1)]  # identity codes are not business labels
    for d in named or dims:
        value = row.get(d)
        if value is None:
            parts.append("Chưa ghi nhận"); continue
        labels = catalog.registry["dimensions"].get(d, {}).get("value_labels", {})
        parts.append(str(labels.get(str(value), value)))
    return " / ".join(parts) or "Toàn phạm vi"


def _period_text(value, granularity):
    """Short bucket label by cadence (T01/2027, Q1/2027, 2027, tuần 04/01/2027, 10/01/2027)."""
    text = str(value or "")[:10]
    try:
        d = date.fromisoformat(text)
    except ValueError:
        return text
    if granularity == "month":
        return f"tháng {d.month:02d}/{d.year}"
    if granularity == "quarter":
        return f"quý {(d.month - 1) // 3 + 1}/{d.year}"
    if granularity == "year":
        return f"năm {d.year}"
    if granularity == "week":
        return f"tuần bắt đầu {d.day:02d}/{d.month:02d}/{d.year}"
    return f"ngày {d.day:02d}/{d.month:02d}/{d.year}"


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
    # The executed artifact owns the measure definition it was computed with (a share projection is a
    # percentage, not the catalog's VND measure); plain artifacts carry the catalog definition unchanged.
    meta = (getattr(getattr(artifact, "grounded", None), "metrics", None) or {}).get(metric) or catalog.registry["metrics"].get(metric, {})
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
    if chart.get('value_transform') == 'signed_delta':
        for row in chart.get('data', [])[:4]:
            delta = row['value']
            facts.append(dict(text=f"{row['label']}: thay đổi {fmt(delta, unit)} so với kỳ trước tương đương.",
                value=delta, unit=unit, evidence_ref=f"{qid}:{metric}:driver:{row.get('group')}",
                calc=dict(kind='driver_delta',query_id=qid,query_ids=chart['scope_refs'],metric=metric,
                          dimension=chart['x_field'],group=row.get('group'))))
        return dict(chart_id=chart.get('id'), why_relevant=why,
            what_it_shows='Phân rã thay đổi có dấu giữa hai kỳ; không phải mức doanh thu hiện tại.',
            key_facts=facts, interpretation='Các phần thay đổi đã đối soát với tổng hai kỳ độc lập.',
            caveats=[chart.get('denominator_note','Không suy diễn nhân quả.')],next_checks=[],how_to_read='Thanh âm: giảm; thanh dương: tăng.',
            source=dict(query_id=qid,metric=metric,rows=len(rows),transform='signed_delta'),
            verification_context=dict(chart={k:v for k,v in chart.items() if k != 'insight'},reference=str(reference) if reference else None,mission_id=mission_id))
    if not rows:
        return {"chart_id": chart.get("id"), "why_relevant": why, "what_it_shows": "Không có dữ liệu trong phạm vi đã chọn.",
                "key_facts": [], "interpretation": "", "caveats": ["Phạm vi không có quan sát; giá trị thiếu không được coi là 0."],
                "next_checks": [], "how_to_read": "", "source": {"query_id": qid, "metric": metric, "rows": 0}}
    kind = artifact.plan.kind
    v2 = (chart.get("insight_version") or 1) >= 2
    v3 = (chart.get("insight_version") or 1) >= 3
    difference_unit = 'điểm %' if v3 and unit == '%' else unit
    def difference_text(value):
        return f"{_num(value)} điểm %" if v3 and unit == '%' else fmt(value, unit if unit != '%' else 'điểm %')
    companions = {catalog.registry["dimensions"].get(d, {}).get("identity") for d in dims} - {None}
    shown_dims = [d for d in dims if d not in companions] if v2 else dims  # labels/nouns; evidence keys keep every dim
    granularity_text = artifact.plan.granularity or "month"
    def when(row):
        return _period_text(row.get("period"), granularity_text) if v2 else str(row.get("period"))[:10]
    if v2 and chart.get("view_note"):
        caveats.append(chart["view_note"])
    time_dims = [d for d in dims if d == "period"] or (["period"] if "period" in rows[0] else [])
    if chart.get("chart_type") == "scatter" and len(chart.get("metrics", [])) >= 2:
        mx, my = chart["metrics"][:2]
        if chart.get("pair"):
            pairs = [(d["x"], d["y"]) for d in chart.get("data", [])]
        else:
            pairs = [(r[mx], r[my]) for r in artifact.result["rows"] if isinstance(r.get(mx), (int, float)) and isinstance(r.get(my), (int, float))]
        n = chart['pair']['n'] if chart.get('pair') else len(pairs)
        shows = f"Mỗi điểm là một {chart.get('observation_label', 'đơn vị quan sát').lower()} ({len(pairs)}/{n} điểm hiển thị)."
        if n >= 3:
            if chart.get('pair'):
                r=chart['pair']['r']  # complete-population statistic; verifier independently recomputes both artifacts
            else:
                ax, ay = sum(p[0] for p in pairs) / n, sum(p[1] for p in pairs) / n
                sx = math.sqrt(sum((p[0] - ax) ** 2 for p in pairs)); sy = math.sqrt(sum((p[1] - ay) ** 2 for p in pairs))
                r = sum((p[0] - ax) * (p[1] - ay) for p in pairs) / (sx * sy) if sx and sy else None
            if r is not None:
                strength = "mạnh" if abs(r) >= 0.7 else "vừa" if abs(r) >= 0.4 else "yếu"
                facts.append({"text": f"Hệ số tương quan Pearson r = {_num(r, 2)} (mức {strength}, n = {n}).", "value": round(r, 4),
                              "unit": "", "evidence_ref": f"{qid}:{mx}~{my}:pearson",
                              "calc": ({"kind": "pair_pearson", "query_ids": chart["pair"]["query_ids"], "key": chart["pair"]["key"],
                                        "metrics": [mx, my], "n": n} if chart.get("pair")
                                       else {"kind": "pearson", "query_id": qid, "x": mx, "y": my, "n": n})})
                interpretation = f"Hai chỉ số có xu hướng đi {'cùng' if r > 0 else 'ngược'} chiều ở mức {strength} trong dữ liệu quan sát."
        caveats.append("Tương quan không phải nhân quả; chỉ mô tả quan hệ quan sát được.")
        if n < 10:
            caveats.append(f"Chỉ có {n} quan sát nên hệ số tương quan kém ổn định.")
    elif kind == "trend" or chart.get("x_field") == "period":
        series = sorted(rows, key=lambda r: str(r.get("period")))
        period = dict(artifact.grounded.period or {})
        if reference and (not period.get('end') or str(period['end'])[:10]>reference.isoformat()):
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
        series_dims = [d for d in dims if d != "period"]
        if v2 and len(groups) > 1:
            # Every drawn series is a different population: name it; never let one line stand for the chart.
            ranked = sorted(groups.items(), key=lambda kv: (-sum(x[metric] for x in kv[1]), kv[0]))
            for key, members in ranked[:3]:
                done = [r for r in members if not flags.get(str(r.get("period")))]
                label = _label(members[0], series_dims, catalog)
                if len(done) < 2:
                    continue
                first, last = done[0], done[-1]
                change = last[metric] - first[metric]
                pct = change / abs(first[metric]) * 100 if first[metric] else None
                direction = "tăng" if change > 0 else "giảm" if change < 0 else "không đổi"
                fact = _fact(f"{label}: từ {when(first)} đến kỳ đầy đủ gần nhất {when(last)} {direction} "
                             f"{difference_text(abs(change))}" + (f" ({'+' if pct >= 0 else ''}{_num(pct)}%)" if pct is not None and unit != "%" else "") + ".",
                             change, difference_unit, qid, metric, f"{key}@{str(last['period'])[:10]}")
                fact["calc"] = {"kind": "change", "query_id": qid, "metric": metric, "group_key": key, "dims": series_dims,
                                "first_bucket": str(first["period"])[:10], "last_bucket": str(last["period"])[:10],
                                "direction": direction, "pct": None if pct is None else round(pct, 6)}
                facts.append(fact)
            if not facts:
                caveats.append("Chưa nhóm nào có ít nhất hai kỳ đầy đủ để nêu xu hướng; xem từng điểm trên biểu đồ.")
            directions = {f["calc"]["direction"] for f in facts if f.get("calc")}
            group_prefix = (f"{len(facts)}/{len(groups)} nhóm có đủ kỳ so sánh đều" if v3 and len(facts) < len(groups) else "Các nhóm đều")
            interpretation = (f"{group_prefix} {directions.pop()} giữa kỳ đầu và kỳ đầy đủ gần nhất." if len(directions) == 1
                              else "Các nhóm biến động khác chiều; đọc từng đường riêng.") if directions else ""
            caveats.append("Mỗi đường là một nhóm riêng; không cộng các đường của chỉ số tỷ lệ/trung bình.")
            if len(groups) > 3:
                caveats.append(f"Nhận định nêu 3/{len(groups)} nhóm lớn nhất; xem bảng dữ liệu cho các nhóm còn lại.")
            complete = []
        if len(complete) >= 2:
            first, last = complete[0], complete[-1]
            change = last[metric] - first[metric]
            pct = change / abs(first[metric]) * 100 if first[metric] else None
            direction = "tăng" if change > 0 else "giảm" if change < 0 else "không đổi"
            prefix = (_label(lead[0], series_dims, catalog) + ": ") if v2 and series_dims else ""
            head = (f"{prefix}Từ {when(first)} đến kỳ đầy đủ gần nhất {when(last)}: {direction} " if v2 else
                    f"Từ kỳ {str(first['period'])[:10]} đến kỳ đầy đủ gần nhất {str(last['period'])[:10]}: {direction} ")
            change_fact = _fact(head + (difference_text(abs(change)) if v3 else fmt(abs(change), unit)) + (f" ({'+' if pct >= 0 else ''}{_num(pct)}%)" if pct is not None and unit != "%" else ""),
                               change, difference_unit, qid, metric, f"{lead_key}@{str(last['period'])[:10]}")
            change_fact["calc"] = {"kind": "change", "query_id": qid, "metric": metric, "group_key": lead_key, "dims": [d for d in dims if d != "period"],
                                   "first_bucket": str(first["period"])[:10], "last_bucket": str(last["period"])[:10],
                                   "direction": direction, "pct": None if pct is None else round(pct, 6)}
            facts.append(change_fact)
            interpretation = f"{name} {direction} giữa kỳ đầu và kỳ đầy đủ gần nhất trong phạm vi đã chọn."
        if not (v2 and len(groups) > 1):
            peak = max(complete or lead, key=lambda r: r[metric])
            values = [r[metric] for r in (complete or lead)]
            if v2 and len(values) > 1 and max(values) == min(values):
                facts.append(_fact(f"Mọi kỳ có cùng giá trị {fmt(peak[metric], unit)}; không có kỳ cao nhất riêng.", peak[metric], unit, qid, metric,
                                   f"{lead_key}@{str(peak['period'])[:10]}"))
            else:
                prefix = (_label(lead[0], series_dims, catalog) + ": ") if v2 and series_dims else ""
                facts.append(_fact(f"{prefix}Kỳ cao nhất: {when(peak)} với {fmt(peak[metric], unit)}.", peak[metric], unit, qid, metric,
                                   f"{lead_key}@{str(peak['period'])[:10]}"))
        partial = [p for p, f in flags.items() if f]
        if partial:
            caveats.append(f"{len(partial)} kỳ đầu/cuối chưa đủ ngày (đánh dấu *); không so sánh trực tiếp với kỳ đầy đủ.")
        if len(groups) > 1:
            caveats.append("Đường của mỗi nhóm có quy mô khác nhau; so sánh xu hướng, không cộng dồn giữa các nhóm tỷ lệ.")
    elif v2 and not dims and len(rows) == 1:
        shows = f"Tổng {name.lower()} của phạm vi đang xem."
        facts.append(_fact(f"Tổng {name.lower()}: {fmt(rows[0][metric], unit)}.", rows[0][metric], unit, qid, metric, "all"))
    elif v2 and chart.get("member_axis") in shown_dims and len(shown_dims) == 2:
        # Member comparison over a breakdown: one fact per member, shares inside that member (never across members).
        axis = chart["member_axis"]
        other = [d for d in shown_dims if d != axis]
        members = {}
        for r in rows:
            members.setdefault(str(r.get(axis)), []).append(r)
        shows = f"{name} theo {catalog.registry['dimensions'][other[0]]['business_name'].lower()}, tách riêng {len(members)} đối tượng."
        share_ok = meta.get("additive") and all(r[metric] >= 0 for r in rows)
        for key, group in sorted(members.items(), key=lambda kv: (-sum(x[metric] for x in kv[1]), kv[0]))[:3]:
            ordered = sorted(group, key=lambda r: (-r[metric], _key(r, dims)))
            top = ordered[0]
            ties = [r for r in ordered if r[metric] == top[metric]]
            member_total = sum(r[metric] for r in group)
            pct = top[metric] / member_total * 100 if share_ok and member_total else None
            who = _label(top, [axis], catalog)
            if len(ties) > 1:
                text = (f"{who}: {len(ties)} nhóm đồng hạng cao nhất ({', '.join(_label(r, other, catalog) for r in ties[:4])}) "
                        f"cùng {fmt(top[metric], unit)}.")
            else:
                text = (f"{who}: cao nhất là {_label(top, other, catalog)} với {fmt(top[metric], unit)}"
                        + (f" ({_num(pct)}% của {who})" if pct is not None else "") + ".")
            fact = _fact(text, top[metric], unit, qid, metric, _key(top, dims))
            if pct is not None:
                fact["calc"] = {"kind": "member_share", "query_id": qid, "metric": metric, "dims": list(dims), "axis": axis,
                                "key": _key(top, dims), "member": key, "pct": round(pct, 6)}
            facts.append(fact)
        caveats.append("Tỷ trọng trong nhận định tính trên tổng của từng đối tượng, không trên tổng chung.")
        if meta.get("aggregation_semantics") in {"ratio", "average"}:
            caveats.append("Chỉ số dạng tỷ lệ/trung bình: không cộng giá trị giữa các nhóm.")
    else:
        ordered = sorted(rows, key=lambda r: (-r[metric], _key(r, dims)) if v2 else -r[metric])
        top, bottom = ordered[0], ordered[-1]
        total = sum(r[metric] for r in ordered) if meta.get("additive") else None
        noun = " / ".join(catalog.registry["dimensions"][d]["business_name"].lower() for d in shown_dims) or "nhóm"
        shows = f"{name} của {len(ordered)} {noun}" + (", xếp từ cao đến thấp." if not v3 and len(ordered) > 1 else ".")
        ties = [r for r in ordered if r[metric] == top[metric]] if v2 else [top]
        if v2 and len(ordered) == 1:
            # One observed group is not a ranking: no "highest / 100%" claim.
            facts.append(_fact(f"Chỉ có 1 {noun} có dữ liệu: {_label(top, dims, catalog)} với {fmt(top[metric], unit)}.",
                               top[metric], unit, qid, metric, _key(top, dims)))
            ties = []
        if len(ties) > 1:
            # Equal values are a tie, never a winner chosen by sort order (I4: UUID tiebreak ≠ superiority).
            everyone = len(ties) == len(ordered)
            facts.append({"text": ((f"Tất cả {len(ordered)} {noun} bằng nhau ở {fmt(top[metric], unit)}; không có nhóm cao nhất riêng."
                                   if everyone else f"{len(ties)}/{len(ordered)} {noun} đồng hạng cao nhất với {fmt(top[metric], unit)}"
                                   + f" ({', '.join(_label(r, dims, catalog) for r in ties[:4])}{'…' if len(ties) > 4 else ''}).")),
                          "value": top[metric], "unit": unit, "evidence_ref": f"{qid}:{metric}:tie_group",
                          "calc": {"kind": "tie_group", "query_id": qid, "metric": metric, "value": top[metric], "count": len(ties), "total": len(ordered)}})
            if everyone:
                interpretation = "Không có chênh lệch giữa các nhóm trong phạm vi đang xem."
        if len(ties) == 1 and len(ordered) > 1 or not v2 and len(ties) == 1:
            facts.append(_fact(f"Cao nhất: {_label(top, dims, catalog)} với {fmt(top[metric], unit)}"
                               + (f" ({_num(top[metric] / total * 100)}% tổng)" if total else "") + ".",
                               top[metric], unit, qid, metric, _key(top, dims)))
        if len(ordered) >= 2 and len(ties) < len(ordered):
            second = ordered[1]
            gap = top[metric] - second[metric]
            if len(ordered) == 2:
                pct = gap / abs(second[metric]) * 100 if second[metric] else None
                gap_fact = _fact(f"{_label(top, dims, catalog)} cao hơn {_label(second, dims, catalog)} {difference_text(gap)}"
                                   + (f" ({'+' if pct >= 0 else ''}{_num(pct)}%)" if pct is not None and unit != "%" else "") + " trong phạm vi đã chọn.",
                                   gap, difference_unit, qid, metric, f"{_key(top, dims)}-{_key(second, dims)}")
                gap_fact["calc"] = {"kind": "gap", "query_id": qid, "metric": metric, "dims": list(dims),
                                    "a": _key(top, dims), "b": _key(second, dims), "pct": None if pct is None or unit == "%" else round(pct, 6)}
                facts.append(gap_fact)
            else:
                lows = [r for r in ordered if r[metric] == bottom[metric]] if v2 else [bottom]
                if len(lows) > 1:
                    facts.append({"text": f"{len(lows)}/{len(ordered)} {noun} đồng hạng thấp nhất với {fmt(bottom[metric], unit)}.",
                                  "value": bottom[metric], "unit": unit, "evidence_ref": f"{qid}:{metric}:tie_group_low",
                                  "calc": {"kind": "tie_group", "query_id": qid, "metric": metric, "value": bottom[metric], "count": len(lows), "total": len(ordered)}})
                else:
                    facts.append(_fact(f"Thấp nhất: {_label(bottom, dims, catalog)} với {fmt(bottom[metric], unit)}.",
                                       bottom[metric], unit, qid, metric, _key(bottom, dims)))
        if total and len(ordered) > (3 if v3 else 2):
            share = sum(r[metric] for r in ordered[:3]) / total * 100
            interpretation = f"Ba nhóm dẫn đầu chiếm {_num(share)}% tổng {name.lower()} của phạm vi."
        elif len(ordered) > 1:
            interpretation = f"Chênh lệch giữa nhóm cao nhất và thấp nhất là {fmt(top[metric] - bottom[metric], unit if unit != '%' else 'điểm %')}."
        signal = _risk_signal(catalog, metric)
        if signal and len(ordered) >= 1:
            breach = [r for r in ordered if _breaches(signal, r[metric])]
            facts.append({"text": f"{len(breach)}/{len(ordered)} {noun} vượt ngưỡng {signal['label'].lower()} "
                                  f"({ {'gt': '>', 'gte': '≥', 'lt': '<', 'lte': '≤'}[signal['operator']]} {fmt(signal['threshold'], unit)}).",
                          "value": len(breach), "unit": noun, "evidence_ref": f"{qid}:{metric}:threshold_breaches",
                          "calc": {"kind": "threshold_breaches", "query_id": qid, "metric": metric, "operator": signal["operator"],
                                   "threshold": signal["threshold"], "total": len(ordered)}})
            for r in breach[:2]:
                next_checks.append(f"Kiểm tra {name.lower()} tại {_label(r, dims, catalog)} ({fmt(r[metric], unit)}).")
            caveats.append("Ngưỡng là mặc định hệ thống, có thể cấu hình; trạng thái chỉ so với ngưỡng, không phải điểm rủi ro tổng hợp.")
        if artifact.plan.ranking or chart.get("selection") in {"Top N", "Bottom N"}:
            rank = artifact.plan.ranking
            label = f"{'Bottom' if rank and rank.direction == 'ASC' else 'Top'} {rank.top_n}" if rank else chart.get("selection")
            caveats.append(f"Biểu đồ chỉ gồm tập {'Bottom' if rank and rank.direction == 'ASC' else 'Top'} N được chọn ({label}); "
                           "không đại diện cơ cấu toàn bộ phạm vi.")
        elif chart.get("selection") == "display_subset":
            caveats.append("Biểu đồ chỉ hiển thị một phần nhóm; số liệu phân tích dùng toàn bộ phạm vi.")
        if meta.get("aggregation_semantics") in {"ratio", "average"}:
            caveats.append("Chỉ số dạng tỷ lệ/trung bình: không cộng giá trị giữa các nhóm.")
    if chart.get("grouped_categories"):
        caveats.append(f"{chart['grouped_categories']} nhóm nhỏ được gộp vào “Khác”.")
    if chart.get("scope_note"):
        # I01/G06: the population of this view (ranked cohort vs. whole-scope benchmark) leads the caveats.
        caveats.insert(0, chart["scope_note"])
    read_by_type = {"line": "Trục ngang là thời gian; điểm mờ/dấu * là kỳ chưa đủ ngày.",
                   "area": "Trục ngang là thời gian; điểm mờ/dấu * là kỳ chưa đủ ngày.",
                   "donut": "Mỗi phần là tỷ trọng của nhóm trong tổng phạm vi.",
                   "scatter": "Mỗi điểm là một đơn vị quan sát; trục ngang và dọc là hai chỉ số."}
    if v3:
        read_by_type.update(
            multi_line="Mỗi đường có tên trong chú giải là một nhóm; so sánh cùng kỳ. Ẩn đường chỉ đổi hình vẽ, không đổi số liệu hay nhận định.",
            multiline="Mỗi đường có tên trong chú giải là một nhóm; so sánh cùng kỳ. Ẩn đường chỉ đổi hình vẽ, không đổi số liệu hay nhận định.",
            heatmap="Mỗi ô giao giữa nhãn hàng và cột là một giá trị; đọc đơn vị và thang màu, bấm hoặc rê chuột để xem chi tiết.",
            grouped_bar="Các cột cùng nhóm đặt cạnh nhau để so sánh; màu và chú giải xác định đối tượng, nhãn nêu đơn vị.",
            stacked_100="Mỗi cột là 100% của kỳ/nhóm đang xem; màu là tỷ trọng thành phần, không phải doanh thu tuyệt đối.",
            kpi="Giá trị tổng hợp của phạm vi đang xem; đọc chú thích chế độ và đơn vị.",
            table="Đọc từng hàng theo nhãn nhóm, cột chỉ số và đơn vị; ô thiếu không phải số 0.")
    return {"chart_id": chart.get("id"), "why_relevant": why, "what_it_shows": shows, "key_facts": facts[:4],
            "interpretation": interpretation, "caveats": list(dict.fromkeys(caveats)), "next_checks": next_checks,
            "how_to_read": read_by_type.get(
                chart.get("chart_type"), "Thanh dài hơn là giá trị lớn hơn; nhãn hiển thị đơn vị của chỉ số."),
            "definition": meta.get("business_definition") or meta.get("description"),
            "source": {"query_id": qid, "metric": metric, "rows": len(rows)},
            "verification_context": {"chart": {k:v for k,v in chart.items() if k != "insight"}, "reference": str(reference) if reference else None, "mission_id": mission_id}}


def chart_insights(charts, artifacts, catalog, reference=None, mission_id=None):
    out = []
    for chart in charts:
        chart["insight_version"] = INSIGHT_VERSION
        ref = (chart.get("scope_refs") or [chart.get("scope_ref")])[0]
        artifact = artifacts.get(ref)
        if artifact:
            block = insight(chart, artifact, catalog, reference, mission_id)
            chart["insight"] = block
            out.append(block)
    return out


def _num_ok(a, b, tolerance):
    return isinstance(a, (int, float)) and isinstance(b, (int, float)) and abs(a - b) <= tolerance * max(1, abs(b))


def _row(rows, dims, key, bucket=None):
    found = [r for r in rows if _key(r, dims) == key and (bucket is None or str(r.get("period"))[:10] == bucket)]
    return found[0] if len(found) == 1 else None  # ambiguous or missing keys can never be confirmed


def recompute(calc, artifacts):
    """Independently recompute a derived statistic from the referenced artifact rows (None = cannot)."""
    if calc.get('kind') == 'driver_delta':
        ids=calc.get('query_ids',[])
        if len(ids)<2 or any(q not in artifacts for q in ids[:2]): return None
        dim,metric=calc['dimension'],calc['metric']
        values=[]
        for q in ids[:2]:
            found=[r for r in artifacts[q].result['rows'] if r.get(dim)==calc.get('group')]
            if len(found)>1: return None
            values.append(found[0].get(metric) if found else 0)
        if not all(type(v) in (int,float) and math.isfinite(v) for v in values): return None
        return {'value':values[0]-values[1]}
    if calc.get("kind") == "pair_pearson":
        from services.insight_service import paired_observations
        qa, qb = (artifacts.get(q) for q in calc.get("query_ids", [])[:2])
        if qa is None or qb is None:
            return None
        res = paired_observations(qa.result.get("rows", []), qb.result.get("rows", []), calc["key"], *calc["metrics"])
        return None if res["status"] != "ok" else {"value": res["r"], "n": res["n"]}
    artifact = artifacts.get(calc.get("query_id"))
    if artifact is None:
        return None
    rows = artifact.result.get("rows", [])
    kind = calc.get("kind")
    if kind == "pearson":
        pairs = [(r[calc["x"]], r[calc["y"]]) for r in rows
                 if all(isinstance(r.get(c), (int, float)) and not isinstance(r.get(c), bool) and math.isfinite(r[c]) for c in (calc["x"], calc["y"]))]
        n = len(pairs)
        if n < 3:
            return None
        ax, ay = sum(p[0] for p in pairs) / n, sum(p[1] for p in pairs) / n
        sx = math.sqrt(sum((p[0] - ax) ** 2 for p in pairs)); sy = math.sqrt(sum((p[1] - ay) ** 2 for p in pairs))
        if not sx or not sy:
            return None
        return {"value": round(sum((p[0] - ax) * (p[1] - ay) for p in pairs) / (sx * sy), 4), "n": n}
    metric, dims = calc.get("metric"), calc.get("dims", [])
    if kind == "gap":
        a, b = _row(rows, dims, calc["a"]), _row(rows, dims, calc["b"])
        if not a or not b or not all(isinstance(r.get(metric), (int, float)) for r in (a, b)):
            return None
        gap = a[metric] - b[metric]
        return {"value": gap, "pct": None if calc.get("pct") is None or not b[metric] else round(gap / abs(b[metric]) * 100, 6)}
    if kind == "change":
        first = _row(rows, dims, calc["group_key"], calc["first_bucket"])
        last = _row(rows, dims, calc["group_key"], calc["last_bucket"])
        if not first or not last or not all(isinstance(r.get(metric), (int, float)) for r in (first, last)):
            return None
        change = last[metric] - first[metric]
        direction = "tăng" if change > 0 else "giảm" if change < 0 else "không đổi"
        return {"value": change, "direction": direction,
                "pct": None if calc.get("pct") is None or not first[metric] else round(change / abs(first[metric]) * 100, 6)}
    if kind == "tie_group":
        values = [r[metric] for r in rows if isinstance(r.get(metric), (int, float))]
        # The fact states the tied value (metric unit); the tie size and population are re-counted from the rows.
        count = sum(1 for v in values if v == calc["value"])
        return {"value": calc["value"] if count else None, "count": count, "total": len(values)}
    if kind == "member_share":
        row = _row(rows, dims, calc["key"])
        group = [r for r in rows if str(r.get(calc["axis"])) == calc["member"] and isinstance(r.get(metric), (int, float))]
        total = sum(r[metric] for r in group)
        if not row or not isinstance(row.get(metric), (int, float)) or str(row.get(calc["axis"])) != calc["member"] or not total:
            return None
        return {"value": row[metric], "pct": round(row[metric] / total * 100, 6)}
    if kind == "threshold_breaches":
        op, t = calc["operator"], calc["threshold"]
        values = [r[metric] for r in rows if isinstance(r.get(metric), (int, float))]
        hit = {"gt": lambda v: v > t, "gte": lambda v: v >= t, "lt": lambda v: v < t, "lte": lambda v: v <= t}[op]
        return {"value": sum(1 for v in values if hit(v)), "total": len(values)}
    return None


def verify_insights(insights, artifacts, tolerance=1e-6, catalog=None):
    """Grounding check. Row facts must match their referenced row; derived facts must be recomputed
    from the artifact rows (value, direction, percentage, counts) - an existing evidence id alone proves nothing."""
    total = matched = 0
    unsupported = []
    for block in insights:
        canonical_facts=None
        ctx=block.get('verification_context')
        if ctx:
            if catalog is None:
                from services.preflight_service import preflight_catalog
                catalog=preflight_catalog()
            chart=ctx['chart'];artifact=artifacts.get((chart.get('scope_refs') or [chart.get('scope_ref')])[0])
            if artifact:
                from datetime import date
                expected=insight(chart,artifact,catalog,date.fromisoformat(ctx['reference']) if ctx.get('reference') else None,ctx.get('mission_id'))
                canonical_facts=expected['key_facts']
        for fact in block.get("key_facts", []):
            total += 1
            ref = fact.get("evidence_ref") or ""
            if canonical_facts is not None and fact not in canonical_facts:
                unsupported.append(ref);continue
            qid=ref.split(':',1)[0]
            metric=ref.split(':')[1] if ':' in ref else ''
            if fact.get('unit') is not None and not fact.get('calc') and qid in artifacts:
                if fact['unit']!=artifacts[qid].grounded.metrics.get(metric,{}).get('unit',''):
                    unsupported.append(ref);continue
            calc = fact.get("calc")
            if calc:
                got = recompute(calc, artifacts)
                ok = got is not None and _num_ok(fact.get("value"), got["value"], tolerance)
                if ok and "direction" in calc:
                    ok = got["direction"] == calc["direction"]
                if ok and calc.get("pct") is not None:
                    ok = _num_ok(calc["pct"], got.get("pct"), 1e-4)
                if ok and calc.get("kind") in {"pearson", "pair_pearson"}:
                    ok = got["n"] == calc.get("n")
                if ok and calc.get("kind") in {"threshold_breaches", "tie_group"}:
                    ok = got["total"] == calc.get("total")
                if ok and calc.get("kind") == "tie_group":
                    ok = got["count"] == calc.get("count")
                if ok:
                    matched += 1
                else:
                    unsupported.append(ref)
                continue
            parts = ref.split(":", 2)
            if len(parts) != 3 or parts[0] not in artifacts:
                unsupported.append(ref); continue
            qid, metric, key = parts
            if "~" in metric or key in {"threshold_breaches"}:
                unsupported.append(ref); continue  # derived statistics without a typed calc cannot be confirmed
            rows = artifacts[qid].result.get("rows", [])
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


def short_answer(charts, limit=3):
    """1–3 distinct factual sentences from primary charts; a two-group chart answers with its gap."""
    out = []
    for chart in charts:
        if chart.get("relevance_role", "primary") != "primary":
            continue
        facts = (chart.get("insight") or {}).get("key_facts", [])
        pick = next((f for f in facts if " cao hơn " in f["text"]), facts[0] if facts else None)
        if pick and pick["text"] not in out:
            out.append(pick["text"])
    return out[:limit]


def gap_label(a, b):
    return f"Chênh lệch: {a} − {b}"


def pct_gap_label(a, b):
    return f"{a} so với {b} (%)"


def compare_cards(charts, artifacts, catalog, mission_id, evidence=None):
    """Compare mission KPI strip (§15): A, B, absolute gap, percentage gap — from verified rows only."""
    if mission_id != "compare":
        return []
    for chart in charts:
        artifact = artifacts.get((chart.get("scope_refs") or [chart.get("scope_ref")])[0])
        if not artifact or chart.get("relevance_role") != "primary" or artifact.plan.kind == "trend" or not artifact.plan.dimensions:
            continue
        metric = artifact.plan.metrics[0]
        rows = [r for r in artifact.result["rows"] if r.get(metric) is not None]
        if len(rows) != 2:
            continue
        dims = artifact.plan.dimensions
        a, b = sorted(rows, key=lambda r: -r[metric])
        unit = catalog.registry["metrics"][metric].get("unit")
        qid = artifact.query.id
        cards = [{"label": _label(r, dims, catalog), "value": r[metric], "unit": unit, "metric": metric, "scope_ref": qid,
                  "evidence_ref": f"{qid}:{metric}:{_key(r, dims)}"} for r in (a, b)]
        gap = a[metric] - b[metric]
        # Name the pair and the baseline (B.6.2): "−21,9%" without who-vs-whom is not an answer.
        cards.append({"label": "Chênh lệch tuyệt đối", "sub_text": gap_label(cards[0]["label"], cards[1]["label"]), "value": gap, "unit": "điểm %" if unit == "%" else unit, "metric": metric,
                      "scope_ref": qid, "evidence_ref": f"{qid}:{metric}:{_key(a, dims)}-{_key(b, dims)}"})
        if unit != "%" and b[metric]:
            cards.append({"label": "Chênh lệch %", "sub_text": pct_gap_label(cards[0]["label"], cards[1]["label"]), "value": gap / abs(b[metric]) * 100, "unit": "%", "metric": metric,
                          "scope_ref": qid, "evidence_ref": f"{qid}:{metric}:{_key(a, dims)}-{_key(b, dims)}"})
        if evidence is not None:
            fact = next((e for e in evidence if e['scope_ref'] == qid and e['metric'] == metric
                         and e['feature'] == 'group_comparison' and e['values']['observed_groups'] == 2
                         and e['values']['largest_value'] == a[metric] and e['values']['smallest_value'] == b[metric]), None)
            if fact is None:
                continue
            for card, field in zip(cards, ('largest_value', 'smallest_value', 'gap', 'relative_gap_pct')):
                card.update(evidence_id=fact['id'], value_field=field)
        return cards
    return []


DERIVED_ANSWER_FEATURES = {"driver_delta", "driver_status", "pair_status"}
LENS_ROLE_ORDER = {"core": 0, "diagnostic": 1, "extended": 2}


def lens_findings(charts, limit=4):
    """FINAL P4: one verified fact per analytical lens (core first), so the conclusion synthesizes the views the report
    actually shows. Facts come from the deterministic chart insight of the full artifact; no new number is computed."""
    out, seen = [], set()
    ordered = sorted((c for c in charts if c.get("analysis_lens_id")),
                     key=lambda c: (LENS_ROLE_ORDER.get(c.get("analysis_lens_role"), 3), c.get("id") or ""))
    for chart in ordered:
        insight = chart.get("insight") or {}
        facts = insight.get("key_facts") or []
        text = facts[0]["text"] if facts else insight.get("interpretation")
        if not text or text in seen:
            continue
        seen.add(text)
        out.append({"statement": text, "evidence_id": None, "chart_id": chart.get("id"), "lens_id": chart.get("analysis_lens_id"),
                    "lens_role": chart.get("analysis_lens_role"), "question": chart.get("analysis_lens_question")})
        if len(out) >= limit:
            break
    return out


def _forecast_sentences(forecasts, cadence_labels):
    """Forward-looking answer, history/horizon/backtest kept apart; interval shown only when computed."""
    answers, findings, caveats = [], [], []
    for f in forecasts or []:
        label = str(f.get("metric_label", "chỉ số")).lower()
        unit = f.get("metric_unit", "")
        if f.get("status") != "ok":
            answers.append(f"Chưa dự báo được {label}: lịch sử chưa đủ kỳ hợp lệ (cần {f.get('required_periods')}, có {f.get('available_periods')}).")
            continue
        points = [p for p in f.get("forecast", []) if p.get("value") is not None and p.get("kind", "future") == "future"]
        if not points:
            continue
        cadence = cadence_labels.get(f.get("unit"), f.get("unit"))
        last = points[-1]
        total = sum(p["value"] for p in points)
        head = f"Dự báo {label} {f.get('horizon')} {cadence} tới: kỳ cuối {fmt(last['value'], unit)}"
        if last.get("lower_80") is not None and last.get("upper_80") is not None:
            head += f" (khoảng 80%: {fmt(last['lower_80'], unit)} – {fmt(last['upper_80'], unit)})"
        if unit in {"VND", "đơn", "chuyến"} and len(points) > 1:
            head += f"; tổng các kỳ dự báo {fmt(total, unit)}"
        sentence = head + "."
        answers.append(sentence)
        findings.append({"statement": sentence, "forecast_ref": f.get("requirement_id"), "evidence_id": None})
        bt = f.get("backtest") or {}
        if bt.get("smape_pct") is not None:
            sentence_bt = (f"Kiểm tra lùi {bt.get('folds')} lần trên {bt.get('evaluated_points')} điểm: sMAPE {fmt(bt['smape_pct'], '%')}"
                           + (f", tốt hơn đường cơ sở naive {fmt(bt['improvement_vs_naive_pct'], '%')}" if bt.get("improvement_vs_naive_pct") is not None else "")
                           + "; đây là sai số đã quan sát, không phải bảo đảm cho tương lai.")
            findings.append({"statement": sentence_bt, "forecast_ref": f.get("requirement_id"), "evidence_id": None})
        caveats.append(f.get("interval") or "")
        caveats.extend(f.get("limitations") or [])
    return answers, findings, caveats


def build_conclusion(short_answer, narrative, evidence, caveats, follow_ups, forecasts=None, chart_caveats=(),
                     unanswered=(), cadence_labels=None, lens_facts=()):
    """V3.3 conclusion artifact: (1) direct answer to ALL requested parts, (2) findings with typed references,
    (3) caveats from data/scope/period/method/forecast, (4) readable actions.

    Built only from already-verified facts: a finding is kept only when its evidence id exists (or it
    is a forecast finding that points at the report's own forecast)."""
    known = {e.get("id"): e for e in evidence or []}
    f_answers, f_findings, f_caveats = _forecast_sentences(forecasts, cadence_labels or {})
    # Statements that ARE the answer to an association/driver question come first (they carry typed provenance).
    derived = [e for e in evidence or [] if e.get("feature") in DERIVED_ANSWER_FEATURES and e.get("statement")]
    d_findings = [{"statement": e["statement"], "evidence_id": e["id"], **fact_reference(e)} for e in derived][:3]
    findings = d_findings + [{"statement": f["finding"], "evidence_id": f["evidence_id"], **fact_reference(known[f['evidence_id']])}
                for f in (narrative or {}).get("key_findings", []) if f.get("evidence_id") in known][:3] + f_findings[:3]
    present = {f["statement"] for f in findings}
    view_findings = [f for f in lens_facts if f["statement"] not in present]  # each bound to a verified chart, not evidence
    answers = list(dict.fromkeys([*(f["statement"] for f in d_findings), *f_answers, *(short_answer or [])]))
    if not answers and (narrative or {}).get("executive_summary"):
        answers = [narrative["executive_summary"]]
    for goal in unanswered:
        answers.append(f"Chưa trả lời được phần: {goal}.")
    actions = []
    for r in (narrative or {}).get("recommendations", []):
        text = r.get("text") if isinstance(r, dict) else r
        if isinstance(text, str) and text.strip():
            actions.append(text.strip())  # the readable sentence, never the action enum or a dict repr
    actions = list(dict.fromkeys(actions)) or [q for q in (follow_ups or []) if isinstance(q, str)]
    all_caveats = [*caveats, *chart_caveats, *f_caveats]
    synthesis = [*answers[:2], *(f["statement"] for f in lens_facts[:3])] if lens_facts else []
    return {"version": "3.4" if lens_facts else "3.3", "answer": " ".join(answers), "answers": answers, "findings": findings,
            **({"synthesis": synthesis, "view_findings": view_findings} if synthesis else {}),
            "caveats": list(dict.fromkeys(c for c in all_caveats if isinstance(c, str) and c.strip())),
            "actions": actions[:3],
            "evidence_ids": [f["evidence_id"] for f in findings if f.get("evidence_id")],
            "unanswered": list(unanswered)}
