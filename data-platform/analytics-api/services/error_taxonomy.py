"""Typed analysis failures: one category → error type, analysis state, retryability.

Internal categories stay stable for existing callers. This table is the single
authority for what the user can do next; a failure is retryable only when an
unchanged resubmission can plausibly succeed (transient provider transport).
"""

class AnalysisError(ValueError):
    """Stable failure contract; legacy catalog imports re-export this identity."""
    def __init__(self, category: str, message: str, choices=None, clarification=None):
        super().__init__(message)
        self.category, self.choices = category, choices or []
        self.clarification = clarification


class ResolutionIssues(AnalysisError):
    def __init__(self, issues):
        super().__init__("semantic_intent_invalid", "Semantic interpretation needs targeted recovery")
        self.issues = issues


# error_type, analysis_state, retryable
_TYPES = {
    "unsupported_metric": ("UNSUPPORTED_CAPABILITY", "UNSUPPORTED_CAPABILITY", False),
    "unsupported_dimension": ("UNSUPPORTED_CAPABILITY", "UNSUPPORTED_CAPABILITY", False),
    "unsupported": ("UNSUPPORTED_CAPABILITY", "UNSUPPORTED_CAPABILITY", False),
    "non_additive_total": ("UNSUPPORTED_CAPABILITY", "UNSUPPORTED_CAPABILITY", False),
    "driver_unsupported": ("UNSUPPORTED_CAPABILITY", "UNSUPPORTED_CAPABILITY", False),
    "unsupported_domain": ("UNSUPPORTED_CAPABILITY", "UNSUPPORTED_CAPABILITY", False),
    "domain_lens_invalid": ("UNSUPPORTED_CAPABILITY", "UNSUPPORTED_CAPABILITY", False),
    "not_analytical_request": ("OUT_OF_SCOPE", "UNSUPPORTED_CAPABILITY", False),
    "forecast_unsupported": ("FORECAST_UNAVAILABLE", "UNSUPPORTED_CAPABILITY", False),
    "forecast_horizon_invalid": ("FORECAST_UNAVAILABLE", "UNSUPPORTED_CAPABILITY", False),
    "forecast_insufficient_history": ("FORECAST_INSUFFICIENT_HISTORY", "INSUFFICIENT_DATA", False),
    "forecast_execution": ("FORECAST_EXECUTION_FAILED", "EXECUTION_FAILURE", False),
    "insufficient_data": ("INSUFFICIENT_DATA", "INSUFFICIENT_DATA", False),
    "historical_metric_unavailable": ("INSUFFICIENT_DATA", "INSUFFICIENT_DATA", False),
    "visualization_unavailable": ("INSUFFICIENT_DATA", "INSUFFICIENT_DATA", False),
    "privacy": ("RESTRICTED_REQUEST", "RESTRICTED", False),
    "module_privacy": ("RESTRICTED_REQUEST", "RESTRICTED", False),
    "provider_unavailable": ("PROVIDER_UNAVAILABLE", "PROVIDER_FAILURE", True),
    "provider_connection": ("PROVIDER_UNAVAILABLE", "PROVIDER_FAILURE", True),
    "provider_http": ("PROVIDER_UNAVAILABLE", "PROVIDER_FAILURE", True),
    "provider_offline": ("PROVIDER_UNAVAILABLE", "PROVIDER_FAILURE", False),
    "provider_configuration_missing": ("PROVIDER_UNAVAILABLE", "PROVIDER_FAILURE", False),
    "provider_model_not_found": ("PROVIDER_UNAVAILABLE", "PROVIDER_FAILURE", False),
    "provider_schema_invalid": ("PROVIDER_UNAVAILABLE", "PROVIDER_FAILURE", False),
    "provider_bad_request": ("PROVIDER_UNAVAILABLE", "PROVIDER_FAILURE", False),
    "provider_policy": ("PROVIDER_UNAVAILABLE", "PROVIDER_FAILURE", False),
    "provider_forbidden": ("PROVIDER_UNAVAILABLE", "PROVIDER_FAILURE", False),
    "provider_auth": ("PROVIDER_AUTH_ERROR", "PROVIDER_FAILURE", False),
    "provider_access_denied": ("PROVIDER_AUTH_ERROR", "PROVIDER_FAILURE", False),
    "provider_timeout": ("PROVIDER_TIMEOUT", "PROVIDER_FAILURE", True),
    "provider_rate_limited": ("PROVIDER_RATE_LIMITED", "PROVIDER_FAILURE", True),
    "provider_daily_quota": ("PROVIDER_RATE_LIMITED", "PROVIDER_FAILURE", False),
    "provider_invalid_json": ("PROVIDER_INVALID_RESPONSE", "PROVIDER_FAILURE", False),
    "max_tokens_exceeded": ("PROVIDER_INVALID_RESPONSE", "PROVIDER_FAILURE", False),
    # The transport retried internally (e.g. on 503); a fresh submission can succeed.
    "provider_transport_nested": ("PROVIDER_UNAVAILABLE", "PROVIDER_FAILURE", True),
    # A spent provider allowance means bounded semantic repair made no usable
    # progress. It is never a provider connectivity/configuration problem.
    "provider_call_budget_exceeded": ("SEMANTIC_RESOLUTION_FAILED", "UNDERSTANDING_FAILURE", False),
    "semantic_resolution_failed": ("SEMANTIC_RESOLUTION_FAILED", "UNDERSTANDING_FAILURE", False),
    "agent_budget": ("SEMANTIC_RESOLUTION_FAILED", "UNDERSTANDING_FAILURE", False),
    "semantic_intent_invalid": ("SEMANTIC_CONTRACT_INVALID", "UNDERSTANDING_FAILURE", False),
    "invalid_analysis_contract": ("SEMANTIC_CONTRACT_INVALID", "UNDERSTANDING_FAILURE", False),
    "analysis_spec_invalid": ("SEMANTIC_CONTRACT_INVALID", "UNDERSTANDING_FAILURE", False),
    "duplicate_invalid_tool_call": ("SEMANTIC_CONTRACT_INVALID", "UNDERSTANDING_FAILURE", False),
    "resolver_internal": ("QUERY_COMPILATION_FAILED", "EXECUTION_FAILURE", False),
    "dry_run_failed": ("QUERY_COMPILATION_FAILED", "EXECUTION_FAILURE", False),
    "plan": ("QUERY_COMPILATION_FAILED", "EXECUTION_FAILURE", False),
    "execution": ("QUERY_EXECUTION_FAILED", "EXECUTION_FAILURE", False),
    "query_timeout": ("QUERY_TIMEOUT", "EXECUTION_FAILURE", False),
    "data_health": ("SOURCE_UNAVAILABLE", "EXECUTION_FAILURE", False),
    "result_contract": ("RESULT_VALIDATION_FAILED", "EXECUTION_FAILURE", False),
    "quality_verification": ("RESULT_VALIDATION_FAILED", "EXECUTION_FAILURE", False),
    "job_busy": ("CAPACITY_BUSY", "SYSTEM_FAILURE", True),
    # V3.2: deterministic prechecks and protected semantic contracts.
    "unrecognized_question": ("UNRECOGNIZED_QUESTION", "UNSUPPORTED_CAPABILITY", False),
    "mission_mismatch": ("MISSION_MISMATCH", "SUPPORTED_BUT_NEEDS_CLARIFICATION", False),
    "guided_contract_invalid": ("GUIDED_CONTRACT_INVALID", "SUPPORTED_BUT_NEEDS_CLARIFICATION", False),
    "semantic_contract_drift": ("SEMANTIC_CONTRACT_DRIFT", "UNDERSTANDING_FAILURE", False),
    "analysis_mission_unknown": ("GUIDED_CONTRACT_INVALID", "SUPPORTED_BUT_NEEDS_CLARIFICATION", False),
}
_AMBIGUOUS = {
    "clarification", "blueprint_ambiguous", "capacity_requires_choice", "requested_scope_too_large", "query_scope",
    "time_year_missing", "time_range_ambiguous", "time_range_invalid", "granularity_ambiguous", "metric_ambiguous",
    "subject_ambiguous", "filter_value_ambiguous", "filter_value_unknown", "ranking_scope_ambiguous",
}
_REVIEW = {"schema_changed", "stale_approval", "module_needs_review", "session", "approval_required", "patch"}

GUIDANCE = {
    'SOURCE_UNAVAILABLE': ('Nguồn dữ liệu chưa sẵn sàng', 'Nguồn bắt buộc đang thiếu hoặc bị chặn; chưa chạy truy vấn.', 'check_source'),
    "UNSUPPORTED_CAPABILITY": ("Chỉ số hoặc phép phân tích chưa được hỗ trợ",
        "Hiện dữ liệu phân tích chưa hỗ trợ yêu cầu này.", "choose_supported_capability"),
    "OUT_OF_SCOPE": ("Ngoài phạm vi phân tích dữ liệu",
        "Trợ lý chỉ trả lời câu hỏi phân tích dữ liệu kinh doanh của hệ thống.", "edit_question"),
    "FORECAST_UNAVAILABLE": ("Chưa hỗ trợ dự báo cho yêu cầu này",
        "Chỉ số hoặc tầm dự báo này chưa được khai báo là có thể dự báo.", "choose_supported_capability"),
    "FORECAST_INSUFFICIENT_HISTORY": ("Chưa đủ lịch sử để dự báo",
        "Chưa đủ dữ liệu lịch sử để thực hiện dự báo này.", "change_scope"),
    "INSUFFICIENT_DATA": ("Chưa đủ dữ liệu để phân tích",
        "Chưa đủ dữ liệu trong phạm vi yêu cầu để thực hiện phân tích này.", "change_scope"),
    "AMBIGUOUS_REQUEST": ("Cần thêm một lựa chọn", "Yêu cầu có nhiều cách hiểu cho kết quả khác nhau.", "answer_clarification"),
    "RESTRICTED_REQUEST": ("Yêu cầu chạm dữ liệu bị hạn chế",
        "Yêu cầu có trường dữ liệu nhạy cảm nên không thể cung cấp.", "edit_question"),
    "PROVIDER_UNAVAILABLE": ("Dịch vụ AI chưa khả dụng", "Chưa kết nối được tới dịch vụ AI hoặc dịch vụ AI chưa được cấu hình.", "retry_later"),
    "PROVIDER_AUTH_ERROR": ("Dịch vụ AI chưa xác thực được", "Cấu hình xác thực dịch vụ AI trên máy chủ cần được kiểm tra.", "contact_admin"),
    "PROVIDER_TIMEOUT": ("Dịch vụ AI phản hồi quá chậm", "Dịch vụ AI hiện phản hồi quá chậm.", "retry"),
    "PROVIDER_RATE_LIMITED": ("Dịch vụ AI đang giới hạn lượt gọi", "Dịch vụ AI đang giới hạn lượt gọi hoặc hết hạn mức.", "retry_later"),
    "PROVIDER_INVALID_RESPONSE": ("Dịch vụ AI trả về dữ liệu không hợp lệ",
        "Phản hồi của dịch vụ AI không đúng cấu trúc sau lượt khôi phục cho phép.", "edit_question"),
    "SEMANTIC_RESOLUTION_FAILED": ("Chưa ánh xạ được yêu cầu vào danh mục dữ liệu",
        "Hệ thống đã dừng vì các lượt diễn giải không tiến triển; gửi lại nguyên câu sẽ không giúp ích.", "edit_question"),
    "SEMANTIC_CONTRACT_INVALID": ("Hệ thống chưa hoàn tất diễn giải phân tích",
        "Diễn giải của AI chưa vượt qua kiểm tra ngữ nghĩa của máy chủ.", "edit_question"),
    "QUERY_COMPILATION_FAILED": ("Đã hiểu yêu cầu nhưng chưa lập được truy vấn",
        "Đã hiểu yêu cầu nhưng không thể lập truy vấn dữ liệu an toàn.", "report_reference"),
    "QUERY_EXECUTION_FAILED": ("Đã hiểu yêu cầu nhưng truy vấn chưa hoàn thành",
        "Đã hiểu yêu cầu nhưng không thể hoàn thành truy vấn dữ liệu.", "report_reference"),
    "QUERY_TIMEOUT": ("Truy vấn dữ liệu quá thời gian", "Truy vấn vượt giới hạn thời gian thực thi.", "change_scope"),
    "RESULT_VALIDATION_FAILED": ("Kết quả chưa vượt qua kiểm chứng", "Kết quả dữ liệu chưa vượt qua kiểm chứng nên không được công bố.", "report_reference"),
    "FORECAST_EXECUTION_FAILED": ("Chưa tính được dự báo", "Dữ liệu hợp lệ nhưng phép dự báo chưa thực thi thành công.", "report_reference"),
    "PLAN_REVIEW_REQUIRED": ("Cần lập lại kế hoạch", "Dữ liệu hoặc phiên phân tích đã thay đổi.", "replan"),
    "CAPACITY_BUSY": ("Hệ thống đang bận", "Hệ thống đang xử lý tối đa số tác vụ đồng thời.", "retry_later"),
    "INTERNAL_ERROR": ("Lỗi xử lý của hệ thống", "Máy chủ gặp lỗi xử lý; chưa có kết quả phân tích.", "report_reference"),
    "UNRECOGNIZED_QUESTION": ("Chưa nhận ra bài toán phân tích",
        "Chưa nhận ra nội dung phân tích dữ liệu trong câu hỏi.", "edit_question"),
    "MISSION_MISMATCH": ("Yêu cầu chưa phù hợp với nhiệm vụ đang chọn",
        "Câu hỏi thuộc một nhiệm vụ phân tích khác với nhiệm vụ đang chọn.", "switch_mission"),
    "GUIDED_CONTRACT_INVALID": ("Cấu hình phân tích chưa hợp lệ",
        "Lựa chọn chỉ số, chiều hoặc phạm vi chưa khớp danh mục được quản trị.", "edit_selection"),
    "SEMANTIC_CONTRACT_DRIFT": ("Diễn giải chưa khớp danh mục dữ liệu",
        "Diễn giải của AI khác với chỉ số đã nhận diện chắc chắn trong câu hỏi; hệ thống không tự đoán.", "edit_question"),
}

# V3.2 user-facing failure stage: the UI text must match where it failed.
_STAGES = {
    'SOURCE_UNAVAILABLE': 'PRECHECK_FAILURE',
    "UNRECOGNIZED_QUESTION": "PRECHECK_FAILURE", "MISSION_MISMATCH": "PRECHECK_FAILURE",
    "RESTRICTED_REQUEST": "PRECHECK_FAILURE", "GUIDED_CONTRACT_INVALID": "SEMANTIC_CONTRACT_FAILURE",
    "PROVIDER_RATE_LIMITED": "PROVIDER_QUOTA_FAILURE",
    "PROVIDER_UNAVAILABLE": "PROVIDER_TRANSPORT_FAILURE", "PROVIDER_TIMEOUT": "PROVIDER_TRANSPORT_FAILURE",
    "PROVIDER_AUTH_ERROR": "PROVIDER_TRANSPORT_FAILURE", "PROVIDER_INVALID_RESPONSE": "SEMANTIC_INTERPRETATION_FAILURE",
    "SEMANTIC_RESOLUTION_FAILED": "SEMANTIC_INTERPRETATION_FAILURE", "SEMANTIC_CONTRACT_INVALID": "SEMANTIC_CONTRACT_FAILURE",
    "SEMANTIC_CONTRACT_DRIFT": "SEMANTIC_CONTRACT_FAILURE", "QUERY_COMPILATION_FAILED": "QUERY_COMPILATION_FAILURE",
    "QUERY_EXECUTION_FAILED": "QUERY_EXECUTION_FAILURE", "QUERY_TIMEOUT": "QUERY_EXECUTION_FAILURE",
    "RESULT_VALIDATION_FAILED": "RESULT_VALIDATION_FAILURE", "FORECAST_EXECUTION_FAILED": "FORECAST_FAILURE",
    "FORECAST_INSUFFICIENT_HISTORY": "FORECAST_FAILURE", "FORECAST_UNAVAILABLE": "SEMANTIC_CONTRACT_FAILURE",
}


def analysis_stage(error_type):
    """Coarse V3.2 stage for one typed failure (PRECHECK … FORECAST)."""
    return _STAGES.get(error_type, "SYSTEM_FAILURE")


def classify(category, diagnostics=None):
    """Return the typed contract for one internal failure category."""
    category = category or "internal"
    if category in _TYPES:
        error_type, state, retryable = _TYPES[category]
    elif category in _AMBIGUOUS:
        error_type, state, retryable = "AMBIGUOUS_REQUEST", "SUPPORTED_BUT_NEEDS_CLARIFICATION", False
    elif category in _REVIEW:
        error_type, state, retryable = "PLAN_REVIEW_REQUIRED", "SUPPORTED_BUT_NEEDS_CLARIFICATION", False
    elif category == "planning_timeout":
        # The shared deadline is mostly provider latency when the provider was
        # still answering; otherwise it is server-side processing time.
        d = diagnostics or {}
        provider_ms = d.get("provider_ms") or sum(d.get(k, 0) or 0 for k in ("provider_primary_ms", "provider_repair_ms"))
        budget = d.get("planning_budget_ms") or 28000
        provider_bound = isinstance(provider_ms, (int, float)) and provider_ms >= budget / 2
        error_type, state, retryable = (("PROVIDER_TIMEOUT", "PROVIDER_FAILURE", True) if provider_bound
                                        else ("INTERNAL_ERROR", "SYSTEM_FAILURE", False))
    elif category.startswith("provider_"):
        error_type, state, retryable = "PROVIDER_UNAVAILABLE", "PROVIDER_FAILURE", False
    else:
        error_type, state, retryable = "INTERNAL_ERROR", "SYSTEM_FAILURE", False
    title, description, next_action = GUIDANCE[error_type]
    return {"error_type": error_type, "analysis_state": state, "retryable": retryable,
            "title": title, "description": description, "next_action": next_action}


def is_provider_transport(category):
    """True only for genuine provider transport/configuration failures."""
    return classify(category)["analysis_state"] == "PROVIDER_FAILURE" and category not in {
        "provider_invalid_json", "max_tokens_exceeded"}
