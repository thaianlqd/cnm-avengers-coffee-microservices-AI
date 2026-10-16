"""V3.2 mission input contracts and deterministic guided intents.

A mission is no longer presentation metadata only: each governed mission
declares (in the registry) the analytical slots it needs. The UI renders its
controls from these contracts, and a fully guided request is turned into a
semantic intent here WITHOUT any provider call. Every field the browser sends is
re-validated against the registry; nothing is trusted because the UI chose it.

Both paths (guided contract, free-text AI interpretation) converge on the same
AnalysisIntentEnvelope before resolution, SQL compilation and execution.
"""
from services.analysis_catalog import AnalysisError
from services.value_grounding_service import value_text

SLOT_IDS = ("metric", "metric_b", "dimension", "group_a", "group_b", "n", "direction",
            "granularity", "horizon", "cadence", "time", "scope", "signals")
TIME_SLOTS = {"period", "history", "none"}


class GuidedContractError(AnalysisError):
    """A guided field failed registry validation (never retried, never sent to AI)."""

    def __init__(self, field, message):
        super().__init__("guided_contract_invalid", message)
        self.field = field


def validate_contracts(registry):
    """Registry validation for mission input contracts. Raises ValueError."""
    for mission in registry.get("analysis_missions", []):
        contract = mission.get("input_contract")
        if contract is None:
            continue
        slots = set(contract.get("required", [])) | set(contract.get("optional", []))
        if not slots <= set(SLOT_IDS) or set(contract.get("required", [])) & set(contract.get("optional", [])):
            raise ValueError("Mission input contract slots invalid")
        if contract.get("time_control", "period") not in TIME_SLOTS:
            raise ValueError("Mission time control invalid")
        if not set(contract.get("accepts_intents", [mission["id"]])) <= {m["id"] for m in registry["analysis_missions"]}:
            raise ValueError("Mission accepted intents invalid")
        if not all(isinstance(p, str) and p.strip() for p in contract.get("intent_vocabulary", [])):
            raise ValueError("Mission intent vocabulary invalid")


def contracts(registry):
    """UI-facing contract per mission (registry data, no separate UI catalog)."""
    out = {}
    for mission in registry.get("analysis_missions", []):
        c = mission.get("input_contract") or {}
        out[mission["id"]] = {
            "required": list(c.get("required", [])), "optional": list(c.get("optional", [])),
            "time_control": c.get("time_control", "period"),
            "max_scope_filters": c.get("max_scope_filters", 2),
            "chart_roles": list(c.get("chart_roles", [])), "evidence_roles": list(c.get("evidence_roles", [])),
            "depth": bool(c.get("depth", True)),
            "accepts_intents": list(c.get("accepts_intents", [mission["id"]])),
        }
    return out


# --- Mission intent from language (deterministic, governed vocabulary) ------

def mission_signals(text, registry):
    """Missions whose governed operator vocabulary occurs in the normalized text."""
    import re
    hits = {}
    for mission in registry.get("analysis_missions", []):
        for phrase in (mission.get("input_contract") or {}).get("intent_vocabulary", []):
            p = value_text(phrase)
            if p and re.search(r"(?<!\w)" + re.escape(p) + r"(?!\w)", text):
                hits.setdefault(mission["id"], []).append(phrase)
    return hits


def infer_mission(text, registry):
    """High-confidence intended mission, or None when absent/ambiguous.

    Only explicit operator vocabulary counts; a metric or time phrase alone never
    selects a mission. Several competing missions -> no confident inference.
    """
    hits = mission_signals(text, registry)
    # Forecast vocabulary subsumes trend wording ("xu hướng dự báo").
    if "forecast" in hits:
        return {"id": "forecast", "confidence": "high", "matched": hits["forecast"]}
    strong = {m: v for m, v in hits.items() if m != "overview"}
    if len(strong) == 1:
        id, matched = next(iter(strong.items()))
        return {"id": id, "confidence": "high", "matched": matched}
    if not strong and "overview" in hits:
        return {"id": "overview", "confidence": "high", "matched": hits["overview"]}
    if strong:
        return {"id": None, "confidence": "ambiguous", "matched": sorted(strong)}
    return None


def mission_mismatch(selected, inferred, registry):
    """True when a selected mission tab cannot carry the question's explicit intent."""
    if not selected or not inferred or inferred.get("confidence") != "high" or not inferred.get("id"):
        return False
    mission = next((m for m in registry.get("analysis_missions", []) if m["id"] == selected), None)
    if not mission:
        return False
    accepts = (mission.get("input_contract") or {}).get("accepts_intents", [selected])
    return inferred["id"] not in accepts


# --- Guided contract validation ----------------------------------------------

def _metric(registry, id, field="metric"):
    if not isinstance(id, str) or id not in registry["metrics"]:
        raise GuidedContractError(field, "Chỉ số không có trong danh mục được quản trị.")
    return registry["metrics"][id]


def _dimension_compatible(catalog, metric, dimension, field="dimension"):
    if dimension not in catalog.registry["dimensions"]:
        raise GuidedContractError(field, "Chiều phân tích không có trong danh mục.")
    if dimension not in catalog.compatible_dimensions(metric):
        raise GuidedContractError(field, "Chiều phân tích không tương thích với chỉ số đã chọn.")


def _relationship_pairs(registry):
    pairs = set()
    for profile in registry["domain_intelligence"]["profiles"].values():
        for lens in profile.get("analytical_lenses", []):
            blueprint = lens.get("blueprint") or {}
            if "relationship" in blueprint.get("allowed_operations", []) or blueprint.get("default_operation") == "relationship":
                grain = tuple(blueprint.get("default_grouping") or [])
                metrics = [m for m in lens.get("metric_refs", []) if m in registry["metrics"]]
                for a in metrics:
                    for b in metrics:
                        if a != b:
                            pairs.add((a, b, grain))
    return pairs


def validate_guided(catalog, mission_id, contract, *, scope_filters=()):
    """Normalized guided slots for a mission, or GuidedContractError.

    The registry owns metric existence, mission eligibility, dimension
    compatibility, forecastability, horizons, ranking bounds and relationship
    grains. Group values are grounded later by the same filter grounding as AI
    intents (never trusted as raw SQL literals).
    """
    r = catalog.registry
    mission = next((m for m in r.get("analysis_missions", []) if m["id"] == mission_id), None)
    if not mission:
        raise GuidedContractError("mission", "Nhiệm vụ phân tích không hợp lệ.")
    spec = mission.get("input_contract") or {}
    data = {k: v for k, v in dict(contract or {}).items() if v not in (None, "", [])}
    for slot in spec.get("required", []):
        if slot in {"time", "scope"}:
            continue
        key = {"group_a": "group_a", "group_b": "group_b"}.get(slot, slot)
        if key not in data:
            raise GuidedContractError(slot, "Thiếu thông tin bắt buộc của nhiệm vụ.")
    allowed = set(spec.get("required", [])) | set(spec.get("optional", []))
    extra = {k for k in data if k not in allowed}
    if extra:
        raise GuidedContractError(sorted(extra)[0], "Trường này không thuộc nhiệm vụ đã chọn.")
    need = mission.get("metric_requirements", {})
    out = {"mission": mission_id}
    if "metric" in data:
        metric = _metric(r, data["metric"])
        if need.get("historical") and not metric.get("time_column"):
            raise GuidedContractError("metric", "Chỉ số hiện trạng không có lịch sử theo thời gian.")
        if need.get("forecastable") and not (metric.get("forecast") or {}).get("forecastable"):
            raise GuidedContractError("metric", "Chỉ số này chưa được khai báo là dự báo được.")
        if need.get("additive") and not metric.get("additive"):
            raise GuidedContractError("metric", "Cơ cấu chỉ áp dụng cho chỉ số cộng được.")
        out["metric"] = data["metric"]
    if "dimension" in data:
        _dimension_compatible(catalog, data["metric"], data["dimension"])
        if r["dimensions"][data["dimension"]].get("identity") == data["dimension"]:
            raise GuidedContractError("dimension", "Không phân tích theo mã định danh.")
        out["dimension"] = data["dimension"]
    if mission_id == "compare":
        a, b = data["group_a"], data["group_b"]
        if value_text(str(a)) == value_text(str(b)):
            raise GuidedContractError("group_b", "Hai nhóm so sánh phải khác nhau.")
        if len(str(a)) > 120 or len(str(b)) > 120:
            raise GuidedContractError("group_a", "Giá trị nhóm quá dài.")
        out.update(group_a=a, group_b=b)
    if "n" in data:
        maximum = r.get("workspace", {}).get("limits", {}).get("max_ranking_n") or 50
        if not isinstance(data["n"], int) or not 1 <= data["n"] <= maximum:
            raise GuidedContractError("n", f"Số nhóm xếp hạng phải từ 1 đến {maximum}.")
        out["n"] = data["n"]
    if "direction" in data:
        if data["direction"] not in {"top", "bottom"}:
            raise GuidedContractError("direction", "Chiều xếp hạng không hợp lệ.")
        out["direction"] = data["direction"]
    if "granularity" in data:
        if data["granularity"] not in r.get("granularity_aliases", {}):
            raise GuidedContractError("granularity", "Chu kỳ thời gian không hợp lệ.")
        out["granularity"] = data["granularity"]
    if mission_id == "forecast":
        f = r["metrics"][data["metric"]]["forecast"]
        cadence, horizon = data["cadence"], data["horizon"]
        if cadence not in f["cadences"]:
            raise GuidedContractError("cadence", "Chỉ số này không hỗ trợ dự báo theo chu kỳ đã chọn.")
        if not isinstance(horizon, int) or not 1 <= horizon <= f["max_horizon"][cadence]:
            raise GuidedContractError("horizon", f"Tầm dự báo tối đa là {f['max_horizon'][cadence]} kỳ.")
        allowed_dims = set(f.get("allowed_dimensions", []))
        if len(scope_filters) > 1 or any(sf.get("dimension") not in allowed_dims for sf in scope_filters):
            raise GuidedContractError("scope", "Dự báo chỉ hỗ trợ một phạm vi lọc đã khai báo.")
        out.update(cadence=cadence, horizon=horizon)
    if mission_id == "relationship":
        _metric(r, data["metric_b"], "metric_b")
        if data["metric_b"] == data["metric"]:
            raise GuidedContractError("metric_b", "Cần hai chỉ số khác nhau.")
        grain = (data["dimension"],)
        if (data["metric"], data["metric_b"], grain) not in _relationship_pairs(r):
            raise GuidedContractError("metric_b", "Hai chỉ số không có cùng đơn vị quan sát được quản trị.")
        out["metric_b"] = data["metric_b"]
    if mission_id == "risk_watch":
        known = {s["id"] for s in r.get("risk_signals", [])}
        signals = data.get("signals") or sorted(known)
        if not isinstance(signals, list) or not set(signals) <= known:
            raise GuidedContractError("signals", "Tín hiệu rủi ro không có trong danh mục.")
        out["signals"] = [s for s in (x["id"] for x in r["risk_signals"]) if s in signals]
    maximum = spec.get("max_scope_filters", 2)
    if len(scope_filters) > maximum:
        raise GuidedContractError("scope", "Phạm vi lọc vượt giới hạn của nhiệm vụ.")
    return out


def _trend_cadence(period):
    from datetime import date
    if period and period.get("start") and period.get("end"):
        days = (date.fromisoformat(str(period["end"])[:10]) - date.fromisoformat(str(period["start"])[:10])).days + 1
        return "day" if days <= 14 else "week" if days <= 92 else "month"
    return "month"


def guided_intent(catalog, slots, period=None):
    """Deterministic semantic intent for validated guided slots (0 provider calls).

    `period` is the authoritative UI window ({start,end} or None = all data).
    Scope filters arrive separately as UI-required filters and are enforced by
    the existing population checks; they are not copied here.
    """
    r = catalog.registry
    mission = slots["mission"]
    time = {"kind": "range", "start": str(period["start"]), "end": str(period["end"])} if period and period.get("start") else None
    label = lambda m: r["metrics"][m]["business_name"]
    reqs = []
    base = lambda **kw: {k: v for k, v in {"time": time, **kw}.items() if v is not None}
    if mission == "overview":
        m = slots["metric"]
        reqs.append(base(id="r1", goal=f"{label(m)} toàn phạm vi", metric_ids=[m], analysis_kind="aggregate",
                         derived_features=["scalar"]))
        if r["metrics"][m].get("time_column"):
            reqs.append(base(id="r2", goal=f"Diễn biến {label(m).lower()}", metric_ids=[m], analysis_kind="trend",
                             granularity=_trend_cadence(period)))
        if slots.get("dimension"):
            reqs.append(base(id="r3", goal=f"{label(m)} theo {r['dimensions'][slots['dimension']]['business_name'].lower()}",
                             metric_ids=[m], dimension_ids=[slots["dimension"]], analysis_kind="aggregate"))
    elif mission == "compare":
        m, d = slots["metric"], slots["dimension"]
        reqs.append(base(id="r1", goal=f"So sánh {label(m).lower()} giữa {slots['group_a']} và {slots['group_b']}",
                         metric_ids=[m], dimension_ids=[d], analysis_kind="comparison", derived_features=["group_gap"],
                         filters=[{"dimension": d, "operator": "in", "value": [slots["group_a"], slots["group_b"]]}]))
    elif mission == "ranking":
        m, d = slots["metric"], slots["dimension"]
        reqs.append(base(id="r1", goal=f"{'Top' if slots.get('direction', 'top') == 'top' else 'Bottom'} {slots['n']} theo {label(m).lower()}",
                         metric_ids=[m], dimension_ids=[d], analysis_kind="ranking",
                         ranking={"direction": slots.get("direction", "top"), "limit": slots["n"], "metric_id": m}))
    elif mission == "trend":
        m = slots["metric"]
        reqs.append(base(id="r1", goal=f"Xu hướng {label(m).lower()}", metric_ids=[m], analysis_kind="trend",
                         granularity=slots["granularity"]))
    elif mission == "composition":
        m, d = slots["metric"], slots["dimension"]
        reqs.append(base(id="r1", goal=f"Cơ cấu {label(m).lower()}", metric_ids=[m], dimension_ids=[d],
                         analysis_kind="distribution", derived_features=["contribution_share"],
                         feature_metrics={"contribution_share": [m]}))
    elif mission == "forecast":
        m = slots["metric"]
        # Forecast history is the governed full history; the horizon is the future.
        reqs.append({"id": "r1", "goal": f"Dự báo {label(m).lower()}", "metric_ids": [m],
                     "forecast": {"horizon": slots["horizon"], "unit": slots["cadence"]}})
    elif mission == "relationship":
        reqs.append(base(id="r1", goal=f"Quan hệ giữa {label(slots['metric']).lower()} và {label(slots['metric_b']).lower()}",
                         metric_ids=[slots["metric"], slots["metric_b"]], dimension_ids=[slots["dimension"]],
                         analysis_kind="relationship"))
    elif mission == "risk_watch":
        signals = {s["id"]: s for s in r.get("risk_signals", [])}
        for i, sid in enumerate(slots.get("signals", []), start=1):
            metric = signals[sid]["metric"]
            dims = [d for d in ("store",) if d in catalog.compatible_dimensions(metric)]
            reqs.append(base(id=f"r{i}", goal=signals[sid]["label"], metric_ids=[metric], dimension_ids=dims,
                             analysis_kind="aggregate"))
    else:
        raise GuidedContractError("mission", "Nhiệm vụ chưa hỗ trợ chế độ có hướng dẫn.")
    return {"decision": "analyze", "requirements": reqs}


def guided_question(catalog, slots):
    """Human-readable echo of the guided contract (display only)."""
    r = catalog.registry
    m = lambda id: r["metrics"][id]["business_name"].lower()
    d = lambda id: r["dimensions"][id]["business_name"].lower()
    mission = slots["mission"]
    if mission == "compare":
        return f"So sánh {m(slots['metric'])} theo {d(slots['dimension'])} giữa {slots['group_a']} và {slots['group_b']}"
    if mission == "ranking":
        return f"{'Top' if slots.get('direction', 'top') == 'top' else 'Bottom'} {slots['n']} {d(slots['dimension'])} theo {m(slots['metric'])}"
    if mission == "trend":
        return f"Xu hướng {m(slots['metric'])} {r['workspace']['granularity_phrases'].get(slots['granularity'], '')}".strip()
    if mission == "forecast":
        return f"Dự báo {m(slots['metric'])} {slots['horizon']} {r['workspace']['forecast_cadence_labels'].get(slots['cadence'], slots['cadence'])} tới"
    if mission == "composition":
        return f"Cơ cấu {m(slots['metric'])} theo {d(slots['dimension'])}"
    if mission == "relationship":
        return f"Liên hệ giữa {m(slots['metric'])} và {m(slots['metric_b'])} theo {d(slots['dimension'])}"
    if mission == "risk_watch":
        return "Kiểm tra rủi ro vận hành"
    return f"Tình hình {m(slots['metric'])}"
