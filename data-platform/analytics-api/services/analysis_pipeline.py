"""Public pipeline facade and safe HTTP failure presentation."""

from services.agent_pipeline import AnalysisPipeline


def safe_failure(error, provider_calls=None, layer_diagnostics=None):
    category = getattr(error, "category", "internal")
    structured = getattr(error, "clarification", None)
    clarification_categories = {
        "clarification",
        "unsupported",
        "session",
        "schema_changed",
        "patch",
        "time_year_missing",
        "time_range_ambiguous",
        "time_range_invalid",
        "granularity_ambiguous",
        "metric_ambiguous",
        "subject_ambiguous",
        "filter_value_ambiguous",
        "filter_value_unknown",
        "ranking_scope_ambiguous",
        "unsupported_metric",
        "unsupported_dimension",
        "forecast_unsupported",
    }
    messages = {
        "approval_required": "Vui lòng lập và xác nhận kế hoạch phân tích trước khi thực thi.",
        "invalid_analysis_contract": "AI đã trả lời nhưng kế hoạch phân tích chưa hợp lệ. Vui lòng thử lập lại kế hoạch.",
        "provider_call_budget_exceeded": "Hệ thống đã chặn lượt gọi AI vượt giới hạn của yêu cầu này. Bạn có thể chủ động lập lại kế hoạch.",
        "one_shot_context_budget_exceeded": "Phạm vi yêu cầu vượt giới hạn ngữ cảnh. Vui lòng thu gọn yêu cầu phân tích.",
        "semantic_manifest_budget_exceeded": "Danh mục phân tích vượt giới hạn ngữ cảnh hiện tại.",
        "context_configuration": "Giới hạn ngữ cảnh trên máy chủ chưa hợp lệ.",
        "provider_policy": "Cấu hình AI chưa đáp ứng giới hạn một lượt gọi cho mỗi yêu cầu. Vui lòng kiểm tra cấu hình máy chủ.",
        "dashboard_contract": "Loại biểu đồ này chưa phù hợp với kết quả hiện tại. Báo cáo đã duyệt được giữ nguyên.",
        "duplicate_invalid_tool_call": "AI lặp lại một kế hoạch chưa hợp lệ; hệ thống đã dừng lượt sửa. Vui lòng lập lại kế hoạch.",
        "analysis_spec_invalid": "Kế hoạch phân tích chưa hợp lệ. Vui lòng lập lại kế hoạch.",
        "execution": "Truy vấn phân tích chưa thực thi thành công. Vui lòng thử lại sau.",
        "result_contract": "Kết quả dữ liệu chưa vượt qua kiểm chứng nên chưa thể tạo báo cáo.",
        "unsupported_metric": "Chỉ số yêu cầu chưa có định nghĩa trong danh mục dữ liệu hiện tại.",
        "unsupported_dimension": "Chiều phân tích yêu cầu chưa được danh mục dữ liệu hỗ trợ.",
        "agent_budget": "Trợ lý chưa hoàn tất kế hoạch trong số lượt xử lý cho phép. Vui lòng thử lại.",
        "provider_unavailable": "Dịch vụ AI hiện chưa khả dụng nên chưa thể lập kế hoạch phân tích. Vui lòng thử lại sau.",
        "provider_offline": "Dịch vụ AI đang ở chế độ offline nên chưa thể lập kế hoạch phân tích.",
        "provider_configuration_missing": "Máy chủ chưa có cấu hình provider AI khả dụng. Vui lòng kiểm tra cấu hình dịch vụ AI.",
        "provider_auth": "Xác thực với dịch vụ AI thất bại. Vui lòng kiểm tra API key trong cấu hình máy chủ.",
        "provider_access_denied": "Nhà cung cấp AI từ chối quyền truy cập. Vui lòng kiểm tra quyền sử dụng dịch vụ AI.",
        "provider_model_not_found": "Model AI được cấu hình chưa khả dụng. Vui lòng kiểm tra cấu hình model trên máy chủ.",
        "provider_rate_limited": "Dịch vụ AI đang vượt giới hạn sử dụng hoặc quota. Vui lòng thử lại sau.",
        "provider_daily_quota": "Model AI đã hết hạn mức theo ngày. Vui lòng chờ quota được cấp lại.",
        "provider_timeout": "Dịch vụ AI phản hồi quá thời gian chờ. Vui lòng thử lại sau.",
        "provider_connection": "Không thể kết nối đến nhà cung cấp AI. Vui lòng kiểm tra kết nối mạng của máy chủ.",
        "provider_schema_invalid": "Nhà cung cấp AI từ chối cấu trúc yêu cầu. Cấu hình tích hợp dịch vụ AI cần được kiểm tra.",
        "provider_bad_request": "Dịch vụ AI từ chối yêu cầu. Máy chủ cần kiểm tra nguyên nhân lỗi từ nhà cung cấp AI.",
        "provider_invalid_json": "Dịch vụ AI trả về dữ liệu chưa hợp lệ. Vui lòng thử lại sau.",
        "privacy": "Yêu cầu có trường dữ liệu nhạy cảm; hệ thống không thể cung cấp trường này.",
        "metadata": "Danh mục dữ liệu hiện chưa sẵn sàng. Vui lòng thử lại sau.",
        "session": "Phiên phân tích đã hết hạn hoặc phiên bản đã thay đổi. Vui lòng đề xuất lại yêu cầu.",
        "schema_changed": "Cấu trúc dữ liệu đã thay đổi. Vui lòng duyệt lại phạm vi phân tích.",
        "unsupported": "Yêu cầu này chưa thể phân tích bằng các chỉ số và quan hệ dữ liệu hiện có.",
        "clarification": "Có một phần phạm vi phân tích cần xác nhận. Vui lòng làm rõ yêu cầu.",
    }
    message = (
        structured["user_message"]
        if structured
        else messages.get(
            category,
            "Hệ thống chưa thể diễn giải hoặc kiểm chứng yêu cầu lúc này. Vui lòng thử lại.",
        )
    )
    if category == "provider_daily_quota" and provider_calls:
        import math

        attempt = provider_calls[-1]
        if isinstance(attempt, dict):
            scopes = attempt.get("quota_scopes", [])
            if isinstance(scopes, list):
                limits = [
                    s["limit"]
                    for s in scopes
                    if isinstance(s, dict)
                    and s.get("unit") == "requests"
                    and s.get("window") == "day"
                    and type(s.get("limit")) is int
                    and 0 < s["limit"] <= 1000000000
                ]
                if limits:
                    message = f"Model AI đã hết hạn mức {min(limits)} yêu cầu/ngày."
            delay = attempt.get("retry_after_seconds")
            if (
                type(delay) in (int, float)
                and math.isfinite(delay)
                and 0 < delay <= 86400
            ):
                hours, minutes = divmod(math.ceil(delay / 60), 60)
                wait = f"{hours} giờ {minutes} phút" if hours else f"{minutes} phút"
                message += f" Thời gian chờ nhà cung cấp báo: khoảng {wait}."
    options = (
        structured.get("choices", [])
        if structured
        else [
            v
            for v in getattr(error, "choices", [])
            if isinstance(v, dict) and v.get("label")
        ]
    )
    return {
        "status": (
            "needs_clarification" if category in clarification_categories else "error"
        ),
        "question": message,
        "message": message,
        "assistant_reply": message,
        "options": options,
        "clarification": structured,
        "interpretation": (
            structured.get("known_interpretation") if structured else None
        ),
        "diagnostics": {
            "provider_status": "failed" if category.startswith("provider_") else "success" if any(a.get("status") == "success" for a in provider_calls or []) else "not_started",
            "provider_error_category": category if category.startswith("provider_") else None,
            "agent_contract_status": "invalid" if category in {"invalid_analysis_contract", "duplicate_invalid_tool_call", "analysis_spec_invalid"} else "valid",
            "agent_contract_error": category if category in {"invalid_analysis_contract", "duplicate_invalid_tool_call", "analysis_spec_invalid"} else None,
            "semantic_status": "unsupported" if category.startswith("unsupported") else "clarification" if category in clarification_categories else "not_started",
            "execution_status": "failed" if category == "execution" else "passed" if category == "result_contract" else "not_started",
            "result_status": "failed" if category == "result_contract" else "not_started",
            **(layer_diagnostics or {}),
            "provider_attempt_count": (layer_diagnostics or {}).get("provider_attempt_count", len(provider_calls or [])),
            "agent_round_count": (layer_diagnostics or {}).get("agent_rounds", 0),
            "repair_round_count": (layer_diagnostics or {}).get("contract_repair_count", 0),
            "terminal_error": category,
            "pipeline_version": (layer_diagnostics or {}).get("pipeline_version", "2.4"),
            "error_category": category,
            "missing_fields": (
                structured.get("missing_fields", []) if structured else []
            ),
            "ambiguity_count": (
                len(structured.get("ambiguous_fields", [])) if structured else 0
            ),
        },
        "charts": [],
    }
