"""Safe business presentation. Raw provider/SQL/validation prose never enters cards."""

def semantic_failure_summary(diagnostics):
    """Render controlled codes with server-owned labels, never provider prose."""
    import json
    from services.analysis_catalog import CATALOG_PATH
    try:
        registry = json.loads(CATALOG_PATH.read_text())['analysis_registry']
    except (OSError, ValueError, KeyError):
        registry = {'metrics': {}, 'dimensions': {}}
    known = []
    for shape in diagnostics.get('interpreted_shapes', [])[:16]:
        for kind, field in (('metrics','metric_ids'),('dimensions','dimension_ids')):
            for id in shape.get(field, []):
                label = registry[kind].get(id, {}).get('business_name')
                if label and label not in known:
                    known.append(label)
    for t in diagnostics.get('request_anchors', {}).get('times', [])[:4]:
        if t.get('kind')=='rolling' and type(t.get('amount')) is int and t.get('unit') in {'day','month'}:
            known.append(f"{t['amount']} {'ngày' if t['unit']=='day' else 'tháng'} gần nhất")
    descriptions = {
        'population_filter_mismatch':'Kế hoạch chưa giữ đúng nhóm đối tượng được yêu cầu; bộ lọc phải áp dụng cho mọi phần phân tích.',
        'invalid_time_shape':'Phần thời gian trong phản hồi AI bị thiếu trường, mâu thuẫn hoặc không hợp lệ.',
        'explicit_metrics_missing':'Chưa đưa đủ chỉ số được yêu cầu vào kế hoạch.',
        'explicit_features_missing':'Chưa đưa đủ phép tính được yêu cầu vào kế hoạch.',
        'granularity_required':'Phần xu hướng chưa xác định được nhịp ngày, tuần hoặc tháng.',
        'explicit_granularity_missing':'Nhịp thời gian của phần xu hướng chưa khớp nhịp được yêu cầu trong câu hỏi.',
        'ranking_metric_required':'Phần xếp hạng chưa xác định được chỉ số dùng để sắp thứ tự.',
        'accepted_requirement_changed':'Lượt phục hồi đã thay đổi phần đã xác nhận; hệ thống đã chặn thay đổi này.',
        'untargeted_field_changed':'Lượt phục hồi đã thay đổi phạm vi ngoài phần cần sửa; hệ thống đã chặn thay đổi này.',
        'explicit_time_missing':'Kế hoạch chưa giữ đúng thời gian trong câu hỏi.',
        'explicit_value_missing':'Kế hoạch còn thiếu điều kiện lọc trong câu hỏi.',
        'explicit_dimensions_missing':'Kế hoạch còn thiếu cách nhóm trong câu hỏi.',
        'grouping_required':'Phần phân tích chưa xác định được cách nhóm dữ liệu.',
        'unknown_semantic_id':'AI chọn một chỉ số hoặc chiều phân tích không có trong danh mục dữ liệu.',
        'invalid_intent_shape':'Một trường trong phản hồi AI chưa đúng cấu trúc dữ liệu được hỗ trợ.',
        'invalid_intent_envelope':'Phản hồi AI chưa có đúng một đề xuất phân tích với cấu trúc hợp lệ.',
        'target_requirement_omitted':'Lượt phục hồi chưa trả lại phần phân tích cần sửa.',
        'detail_aggregate_conflict':'AI chọn xem từng bản ghi cho một phần yêu cầu có SUM/COUNT/AVG. Cần chuyển phần này thành thống kê theo nhóm, giữ nguyên chỉ số và thời gian.',
        'unsupported_definition_omitted':'Kế hoạch chưa khai báo cách xử lý phép tính cần dữ liệu ngoài danh mục. Cần phân biệt yêu cầu tính chỉ số với yêu cầu không được kết luận chỉ số đó.',
        'invalid_feature_metric_targets':'Phép tính bổ sung chưa gắn đúng chỉ số: chỉ được chọn chỉ số thuộc phần yêu cầu, và tỷ trọng không được cộng các giá trị trung bình.',
        'requirement_required':'AI chưa trả lại phần phân tích nào cho câu hỏi.',
        'requirement_meaning_required':'Một phần phân tích chưa có chỉ số, cách nhóm hoặc mục tiêu dữ liệu có thể xử lý.',
    }
    feature_labels={'leader':'món/nhóm dẫn đầu','top_gap':'chênh lệch hạng 1 và hạng 2',
                    'contribution_share':'tỷ trọng trên tổng phạm vi','change':'mức thay đổi',
                    'change_pct':'phần trăm thay đổi'}
    problems=[]
    root=diagnostics.get('root_contract_issues') or diagnostics.get('contract_issues',[])
    for issue in [*root, *diagnostics.get('contract_issues', [])][:16]:
        text=descriptions.get(issue.get('code'))
        if not text:
            text='Một phần diễn giải chưa vượt qua kiểm tra ngữ nghĩa của máy chủ.'
        labels=[registry['metrics'].get(m,{}).get('business_name') if issue.get('field')=='metric_ids'
                else feature_labels.get(m) if issue.get('field')=='derived_features' else None
                for m in issue.get('candidate_ids',[])[:6]]
        labels=[l for l in labels if l]
        if labels and issue.get('code','').startswith('explicit_'):
            text+=' Cần kiểm tra: '+', '.join(labels)+'.'
        if text not in problems:problems.append(text)
    return known[:14],problems[:6]


def actionable_issue(error, message, clarification=None, diagnostics=None):
    code = getattr(error, "business_category", None) or getattr(error, "category", "internal")
    category = "SYSTEM_UNAVAILABLE"
    if code in {"capacity_requires_choice", "blueprint_ambiguous", "clarification", "not_analytical_request", "filter_value_unknown", "filter_value_ambiguous", "subject_ambiguous", "metric_ambiguous", "granularity_ambiguous"}:
        category = "NEEDS_CLARIFICATION"
    elif code == "historical_metric_unavailable": category = "HISTORICAL_DATA_UNAVAILABLE"
    elif code in {"insufficient_data", "visualization_unavailable"}: category = "INSUFFICIENT_DATA"
    elif code in {"query_scope", "unsupported_domain"}: category = "SCOPE_CONFLICT"
    elif code.startswith("time_"): category = "TIME_CONFLICT"
    elif code == "unsupported_metric": category = "METRIC_UNAVAILABLE"
    elif code == "requested_scope_too_large": category = "REQUESTED_SCOPE_TOO_LARGE"
    elif code in {"one_shot_context_budget_exceeded", "semantic_manifest_budget_exceeded", "context_configuration"}: category = "PLANNING_CAPACITY"
    elif code in {"module_needs_review", "schema_changed", "stale_approval"}: category = "PLAN_REVIEW_REQUIRED"
    elif code in {"invalid_analysis_contract", "analysis_spec_invalid", "semantic_intent_invalid"}: category = "SEMANTIC_INTERPRETATION_ERROR"
    elif code.startswith("unsupported") or code in {"forecast_unsupported", "privacy", "module_privacy", "domain_lens_invalid"}: category = "UNSUPPORTED_ANALYSIS"
    titles = {
        "NEEDS_CLARIFICATION": "Cần thêm một lựa chọn", "HISTORICAL_DATA_UNAVAILABLE": "Chưa có dữ liệu lịch sử",
        "INSUFFICIENT_DATA": "Chưa đủ dữ liệu để phân tích", "SCOPE_CONFLICT": "Cần xác nhận phạm vi",
        "TIME_CONFLICT": "Cần xác nhận thời gian", "METRIC_UNAVAILABLE": "Chỉ số chưa khả dụng",
        "REQUESTED_SCOPE_TOO_LARGE": "Cần chia nhỏ bài toán",
        "PLANNING_CAPACITY": "Chưa thể chuẩn bị đầy đủ ngữ cảnh phân tích",
        "UNSUPPORTED_ANALYSIS": "Phân tích chưa được hỗ trợ", "SYSTEM_UNAVAILABLE": "Chưa thể hoàn tất phân tích",
        "SEMANTIC_INTERPRETATION_ERROR": "Hệ thống chưa hoàn tất diễn giải phân tích",
        "PLAN_REVIEW_REQUIRED": "Cần duyệt lại kế hoạch hiện tại",
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
    if category not in {"SYSTEM_UNAVAILABLE", "SEMANTIC_INTERPRETATION_ERROR", "PLANNING_CAPACITY"}:
        actions.append({"type": "edit_question", "label": "Chỉnh câu hỏi", "followup": None})
    if category in {"SYSTEM_UNAVAILABLE", "SEMANTIC_INTERPRETATION_ERROR", "PLANNING_CAPACITY"}:
        actions.append({"type": "retry", "label": "Lập lại kế hoạch", "followup": None})
    missing = {"metrics": "Chọn chỉ số để đánh giá.", "group_by": "Chọn cách nhóm kết quả.", "granularity": "Chọn nhịp thời gian.", "ranking": "Chọn số lượng kết quả xếp hạng."}.get(getattr(error, "missing", None), message)
    result={"category": category, "title": titles[category], "what_is_known": known,
            "what_is_missing": [missing], "suggested_actions": actions}
    if category=='NEEDS_CLARIFICATION':
        fields=getattr(error,'missing_fields',[])
        labels={'metric_ids':'Chưa rõ chỉ số muốn xem: doanh thu, số đơn, số lượng bán hay giá trị đơn trung bình.',
                'dimension_ids':'Chưa rõ đối tượng hoặc cách nhóm: sản phẩm, chi nhánh, khách hàng hay voucher.',
                'time':'Chưa rõ kỳ thời gian cần phân tích; hãy nêu khoảng ngày hoặc số ngày gần nhất.',
                'filters':'Chưa xác định được giá trị lọc; hãy nêu tên hoặc mã trong dữ liệu.',
                'analysis_goal':'Chưa có mục tiêu phân tích dữ liệu; hãy nêu điều bạn muốn tìm hiểu.',
                'ranking':'Chưa rõ xếp hạng theo chỉ số nào và lấy bao nhiêu kết quả.',
                'granularity':'Chưa rõ nhịp xu hướng: theo ngày, tuần hay tháng.'}
        if not fields:
            fields={'metric_ambiguous':['metric_ids'],'subject_ambiguous':['dimension_ids'],
                    'granularity_ambiguous':['granularity'],'filter_value_unknown':['filters'],
                    'not_analytical_request':['analysis_goal']}.get(code,[])
        if not fields and code=='clarification':
            # No provider prose is shown; expose the missing business choices
            # even when an older provider omits the controlled field names.
            fields=['analysis_goal','metric_ids']
        if code=='not_analytical_request':
            result['title']='Chưa có câu hỏi phân tích dữ liệu'
            fields=['analysis_goal']
        details=[labels[f] for f in fields if f in labels]
        if details:
            result['what_is_missing']=details
            result['resolution_guidance']='Ví dụ: Doanh thu và số đơn theo chi nhánh trong 30 ngày gần nhất. Nếu không chọn thời gian, hệ thống dùng toàn bộ dữ liệu.'
        if diagnostics:
            understood,_=semantic_failure_summary(diagnostics)
            if understood:result['what_is_known']=understood
    if diagnostics and category in {'SEMANTIC_INTERPRETATION_ERROR','SYSTEM_UNAVAILABLE'}:
        understood,problems=semantic_failure_summary(diagnostics)
        result['what_is_known']=understood or known
        if category=='SEMANTIC_INTERPRETATION_ERROR':
            result['what_is_missing']=problems or [missing]
            result['resolution_guidance']='Giữ nguyên câu hỏi. Máy chủ cần sửa phần diễn giải được nêu ở trên; hệ thống chưa chạy các truy vấn báo cáo của lượt này.'
        elif code.startswith('provider_'):
            result['what_is_missing']=[message]
            result['resolution_guidance']='Giữ nguyên câu hỏi. Cần khôi phục kết nối hoặc cấu hình dịch vụ AI trước khi lập kế hoạch.'
            if code=='provider_timeout':
                result['resolution_guidance']='Giữ nguyên câu hỏi. Dịch vụ AI chưa trả lời trong thời gian cho phép; cần kiểm tra độ trễ dịch vụ trước khi chạy lại.'
            if problems:result['what_is_missing']+=problems
        count=diagnostics.get('provider_call_count')
        if type(count) is int and count>0:
            result['recovery_summary']=f'Đã thực hiện {count} lượt gọi AI trong lần yêu cầu này.'
    return result
