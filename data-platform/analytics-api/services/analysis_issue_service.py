"""Safe business presentation. Raw provider/SQL/validation prose never enters cards."""

def actionable_issue(error, message, clarification=None):
    code = getattr(error, "business_category", None) or getattr(error, "category", "internal")
    category = "SYSTEM_UNAVAILABLE"
    if code in {"blueprint_ambiguous", "clarification", "filter_value_unknown", "filter_value_ambiguous", "subject_ambiguous", "metric_ambiguous", "granularity_ambiguous"}:
        category = "NEEDS_CLARIFICATION"
    elif code == "historical_metric_unavailable": category = "HISTORICAL_DATA_UNAVAILABLE"
    elif code in {"insufficient_data", "visualization_unavailable"}: category = "INSUFFICIENT_DATA"
    elif code in {"query_scope", "unsupported_domain"}: category = "SCOPE_CONFLICT"
    elif code.startswith("time_"): category = "TIME_CONFLICT"
    elif code == "unsupported_metric": category = "METRIC_UNAVAILABLE"
    elif code == "requested_scope_too_large": category = "REQUESTED_SCOPE_TOO_LARGE"
    elif code in {"one_shot_context_budget_exceeded", "semantic_manifest_budget_exceeded", "context_configuration"}: category = "PLANNING_CAPACITY"
    elif code in {"invalid_analysis_contract", "analysis_spec_invalid", "module_needs_review", "schema_changed"}: category = "PLAN_FAILED"
    elif code.startswith("unsupported") or code in {"forecast_unsupported", "privacy", "module_privacy", "domain_lens_invalid"}: category = "UNSUPPORTED_ANALYSIS"
    titles = {
        "NEEDS_CLARIFICATION": "Cần thêm một lựa chọn", "HISTORICAL_DATA_UNAVAILABLE": "Chưa có dữ liệu lịch sử",
        "INSUFFICIENT_DATA": "Chưa đủ dữ liệu để phân tích", "SCOPE_CONFLICT": "Cần xác nhận phạm vi",
        "TIME_CONFLICT": "Cần xác nhận thời gian", "METRIC_UNAVAILABLE": "Chỉ số chưa khả dụng",
        "REQUESTED_SCOPE_TOO_LARGE": "Cần chia nhỏ bài toán", "PLAN_FAILED": "Cần cập nhật kế hoạch",
        "PLANNING_CAPACITY": "Chưa thể chuẩn bị đầy đủ ngữ cảnh phân tích",
        "UNSUPPORTED_ANALYSIS": "Phân tích chưa được hỗ trợ", "SYSTEM_UNAVAILABLE": "Chưa thể hoàn tất phân tích",
    }
    known = getattr(error, "known", [])
    if clarification and clarification.get("known_interpretation"):
        meaning = clarification["known_interpretation"]
        if isinstance(meaning, dict):
            known = [str(meaning[k]) for k in ("subject", "analysis_kind") if isinstance(meaning.get(k), str)]
    choices = getattr(error, "choices", []) or (clarification or {}).get("choices", [])
    actions = [{"type": "snapshot" if c.get("time_override") else "followup", "label": c["label"], "followup": c["followup"]}
               for c in choices[:8] if isinstance(c, dict) and isinstance(c.get("label"), str) and isinstance(c.get("followup"), str)]
    actions += [{"type":"select_module", "label":c["label"], "module_id":c["module_id"]} for c in choices[:8] if isinstance(c,dict) and isinstance(c.get("label"),str) and isinstance(c.get("module_id"),str)]
    if code in {"module_needs_review", "schema_changed"}:
        actions.append({"type": "update_module", "label": "Cập nhật bài toán", "followup": None})
    actions.append({"type": "edit_question", "label": "Chỉnh câu hỏi", "followup": None})
    if category in {"SYSTEM_UNAVAILABLE", "PLAN_FAILED", "PLANNING_CAPACITY"}:
        actions.append({"type": "retry", "label": "Lập lại kế hoạch", "followup": None})
    missing = {"metrics": "Chọn chỉ số để đánh giá.", "group_by": "Chọn cách nhóm kết quả.", "granularity": "Chọn nhịp thời gian.", "ranking": "Chọn số lượng kết quả xếp hạng."}.get(getattr(error, "missing", None), message)
    return {"category": category, "title": titles[category], "what_is_known": known,
            "what_is_missing": [missing], "suggested_actions": actions}
