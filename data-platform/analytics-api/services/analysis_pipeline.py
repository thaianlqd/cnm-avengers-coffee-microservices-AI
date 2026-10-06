"""Public pipeline facade and safe HTTP failure presentation."""

from services.agent_pipeline import AnalysisPipeline


def safe_failure(error):
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
            "pipeline_version": "2.2",
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
