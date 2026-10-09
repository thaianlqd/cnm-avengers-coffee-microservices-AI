"""Public pipeline facade and safe HTTP failure presentation."""

from services.agent_pipeline import AnalysisPipeline


def safe_failure(error, provider_calls=None, layer_diagnostics=None):
    category = getattr(error, "category", "internal")
    structured = getattr(error, "clarification", None)
    clarification_categories = {
        'capacity_requires_choice',
        "clarification",
        "not_analytical_request",
        "blueprint_ambiguous",
        "insufficient_data",
        "visualization_unavailable",
        "module_needs_review",
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
        "unsupported_domain",
        "query_scope",
        "requested_scope_too_large",
        "historical_metric_unavailable",
        "forecast_unsupported",
    }
    messages = {
        'job_busy': 'Hệ thống đang xử lý tối đa số bài toán đồng thời. Vui lòng thử lại sau; chưa có lượt gọi AI cho yêu cầu này.',
        'job_storage': 'Kho trạng thái tác vụ chưa sẵn sàng. Hệ thống không tự gửi lại AI khi chưa xác định trạng thái trước đó.',
        'job_not_found': 'Không tìm thấy tác vụ thuộc trình duyệt này hoặc tác vụ đã hết hạn.',
        'job_expired': 'Tác vụ đã hết hạn; hệ thống không tự chạy lại và tiêu thêm lượt gọi AI.',
        'job_timeout': 'Tác vụ chưa hoàn tất trong giới hạn thời gian. Xem mã tác vụ để kiểm tra phần xử lý chưa hoàn tất.',
        'job_cancelled': 'Tác vụ đã dừng. Kết quả xử lý sau khi dừng không được công bố.',
        'idempotency_conflict': 'Mã tác vụ đã gắn với một câu hỏi khác. Hãy bắt đầu câu hỏi mới.',
        'invalid_job_key': 'Yêu cầu chưa có mã tác vụ hợp lệ.',
        'resolver_internal': 'Máy chủ gặp lỗi xử lý kế hoạch phân tích. Câu hỏi được giữ nguyên; hệ thống chưa chạy truy vấn báo cáo. Cần kiểm tra lỗi bộ phân giải trên máy chủ.',
        'planning_timeout': 'Hệ thống chưa hoàn tất lập kế hoạch trong giới hạn 30 giây. Đây là lỗi xử lý hoặc thời gian phản hồi của hệ thống; câu hỏi được giữ nguyên và chưa cần bổ sung thông tin.',
        'capacity_requires_choice': 'Phạm vi và nhịp thời gian yêu cầu vượt dung lượng thực thi. Chọn khoảng thời gian ngắn hơn, ít nhóm hơn hoặc nhịp tuần/tháng; hệ thống chưa thay đổi yêu cầu của bạn.',
        'artifact_store_unavailable': 'Kho kết quả phân tích chưa sẵn sàng. Dữ liệu lớn chưa được lưu vào phiên; cần khôi phục kho kết quả.',
        'artifact_expired': 'Kết quả phân tích đã hết hạn lưu trữ. Hãy làm mới báo cáo để lấy dữ liệu hiện tại.',
        'artifact_integrity': 'Nguồn gốc hoặc nội dung kết quả lưu trữ không khớp. Hệ thống đã chặn kết quả; cần kiểm tra kho và làm mới báo cáo.',
        'artifact_capacity': 'Kết quả vượt dung lượng kho phân tích. Cần chọn phạm vi hoặc cấu trúc tổng hợp nhỏ hơn.',
        'response_capacity': 'Metadata báo cáo vượt dung lượng phản hồi. Cần giảm phần trình bày; hệ thống chưa thay đổi số liệu nghiệp vụ.',
        'session_capacity': 'Trạng thái điều khiển phiên vượt dung lượng lưu trữ. Cần kiểm tra kích thước kế hoạch hoặc lịch sử phiên; dữ liệu kết quả được lưu riêng.',
        'capacity_configuration': 'Cấu hình dung lượng phân tích trên máy chủ chưa hợp lệ.',
        'dry_run_failed': 'Kế hoạch hợp lệ nhưng truy vấn chưa qua kiểm tra PostgreSQL trước thực thi. Cần kiểm tra danh mục và kết nối cơ sở dữ liệu.',
        "blueprint_ambiguous": "Phần phân tích này cần thêm một lựa chọn nghiệp vụ. Hãy chọn từ các phương án dữ liệu hiện có.",
        "insufficient_data": "Phạm vi yêu cầu chưa có dữ liệu. Bạn có thể kiểm tra thời gian hoặc phạm vi và lập lại kế hoạch.",
        "visualization_unavailable": "Dữ liệu hiện có chưa đủ để tạo biểu đồ phù hợp. Bạn có thể chọn phạm vi rộng hơn hoặc một cách nhóm khác.",
        "module_needs_review": "Danh mục dữ liệu của bài toán đã thay đổi. Hãy cập nhật và duyệt lại bài toán trước khi chạy.",
        "module_privacy": "Bài toán có phạm vi hoặc nội dung nhạy cảm không phù hợp để lưu. Hãy chọn phạm vi tổng hợp.",
        "module_storage": "Kho lưu bài toán chưa sẵn sàng. Vui lòng thử lại sau.",
        "historical_metric_unavailable": "Một chỉ số yêu cầu chỉ có dữ liệu hiện trạng, chưa có lịch sử theo kỳ. Vui lòng chọn toàn bộ thời gian để xem hiện trạng hoặc thu gọn phần yêu cầu lịch sử.",
        "requested_scope_too_large": "Yêu cầu có hơn 8 phần phân tích. Vui lòng thu gọn hoặc tách thành các câu hỏi nhỏ hơn; hệ thống chưa bỏ bớt phần bạn yêu cầu.",
        "unsupported_domain": "Miền dữ liệu đã chọn chưa khả dụng. Vui lòng chọn lại miền từ danh mục hiện tại.",
        "query_scope": "Kế hoạch không khớp phạm vi bạn đã chọn. Vui lòng kiểm tra và lập lại kế hoạch.",
        "domain_metadata_invalid": "Danh mục miền dữ liệu chưa hợp lệ. Vui lòng kiểm tra metadata trên máy chủ.",
        "approval_required": "Vui lòng lập và xác nhận kế hoạch phân tích trước khi thực thi.",
        "invalid_analysis_contract": "AI đã trả lời nhưng kế hoạch phân tích chưa hợp lệ. Vui lòng thử lập lại kế hoạch.",
        "provider_call_budget_exceeded": "Hệ thống đã chặn lượt gọi AI vượt giới hạn của yêu cầu này. Bạn có thể chủ động lập lại kế hoạch.",
        "one_shot_context_budget_exceeded": "Hệ thống chưa chuẩn bị được đầy đủ ngữ cảnh dữ liệu để lập kế hoạch. Vui lòng thử lại.",
        "semantic_manifest_budget_exceeded": "Hệ thống chưa chuẩn bị được đầy đủ danh mục dữ liệu trong dung lượng lập kế hoạch hiện tại.",
        "context_configuration": "Giới hạn ngữ cảnh trên máy chủ chưa hợp lệ.",
        "provider_policy": "Cấu hình AI chưa đáp ứng giới hạn số lượt gọi cho mỗi yêu cầu. Vui lòng kiểm tra cấu hình máy chủ.",
        "dashboard_contract": "Loại biểu đồ này chưa phù hợp với kết quả hiện tại. Báo cáo đã duyệt được giữ nguyên.",
        "duplicate_invalid_tool_call": "AI lặp lại một kế hoạch chưa hợp lệ; hệ thống đã dừng lượt sửa. Vui lòng lập lại kế hoạch.",
        "analysis_spec_invalid": "Kế hoạch phân tích chưa hợp lệ. Vui lòng lập lại kế hoạch.",
        "execution": "Truy vấn phân tích chưa thực thi thành công. Vui lòng thử lại sau.",
        "quality_verification": "Nguồn gốc hoặc phạm vi báo cáo chưa vượt qua kiểm chứng độc lập. Hệ thống chưa tạo báo cáo hoàn chỉnh.",
        "result_contract": "Kết quả dữ liệu chưa vượt qua kiểm chứng nên chưa thể tạo báo cáo.",
        "unsupported_metric": "Chỉ số yêu cầu chưa có định nghĩa trong danh mục dữ liệu hiện tại.",
        "forecast_unsupported": "Dữ liệu và phương pháp hiện có chưa hỗ trợ dự báo. Bạn có thể yêu cầu xu hướng quan sát của các kỳ đã có dữ liệu.",
        "metric_ambiguous": "Cần chọn chỉ số đánh giá, chẳng hạn doanh thu, số đơn hoặc điểm đánh giá theo dữ liệu khả dụng.",
        "filter_value_unknown": "Giá trị lọc chưa có trong dữ liệu. Hãy kiểm tra tên thành phố, chi nhánh hoặc đối tượng trong phạm vi yêu cầu.",
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
        "provider_timeout": "Dịch vụ AI chưa phản hồi trong thời gian cho phép. Câu hỏi của bạn đã được nhận diện cục bộ nhưng chưa thể hoàn tất diễn giải.",
        "provider_connection": "Máy chủ chưa kết nối được tới nhà cung cấp AI.",
        "provider_schema_invalid": "Nhà cung cấp AI từ chối cấu trúc yêu cầu. Cấu hình tích hợp dịch vụ AI cần được kiểm tra.",
        "provider_bad_request": "Dịch vụ AI từ chối yêu cầu. Máy chủ cần kiểm tra nguyên nhân lỗi từ nhà cung cấp AI.",
        "provider_invalid_json": "Dịch vụ AI trả về dữ liệu chưa hợp lệ. Vui lòng thử lại sau.",
        "privacy": "Yêu cầu có trường dữ liệu nhạy cảm; hệ thống không thể cung cấp trường này.",
        "metadata": "Danh mục dữ liệu hiện chưa sẵn sàng. Vui lòng thử lại sau.",
        "session": "Phiên phân tích đã hết hạn hoặc phiên bản đã thay đổi. Vui lòng đề xuất lại yêu cầu.",
        "schema_changed": "Cấu trúc dữ liệu đã thay đổi. Vui lòng duyệt lại phạm vi phân tích.",
        "unsupported": "Yêu cầu này chưa thể phân tích bằng các chỉ số và quan hệ dữ liệu hiện có.",
        "clarification": "Có một phần phạm vi phân tích cần xác nhận. Vui lòng làm rõ yêu cầu.",
        "not_analytical_request": "Chưa có yêu cầu phân tích dữ liệu trong nội dung bạn nhập. Hãy nêu điều muốn tìm hiểu, ví dụ: Doanh thu theo chi nhánh trong 30 ngày gần nhất.",
        "semantic_intent_invalid": "Hệ thống chưa hoàn tất diễn giải sau các lượt phục hồi nội bộ. Yêu cầu của bạn được giữ nguyên; đây là lỗi xử lý của hệ thống.",
        "stale_approval": "Kế hoạch hoặc phiên bản đã thay đổi. Vui lòng duyệt lại đề xuất hiện tại.",
        "session_storage": "Kho phiên phân tích chưa sẵn sàng. Hệ thống chưa thực thi kế hoạch.",
    }
    message = (
        structured["user_message"]
        if structured
        else messages.get(
            category,
            "Hệ thống chưa thể diễn giải hoặc kiểm chứng yêu cầu lúc này. Vui lòng thử lại.",
        )
    )
    if category == 'capacity_requires_choice' and getattr(error, 'estimated_rows', None):
        message = f"Yêu cầu tạo khoảng {error.estimated_rows:,} nhóm kết quả. " + message
    population_overflow = category == "result_contract" and getattr(error, "result_issues", None) == ["population_limit"]
    if population_overflow:
        message = "Phạm vi có quá nhiều nhóm kết quả để phân tích trong một lượt. Hãy thu gọn thời gian, phạm vi hoặc yêu cầu Top N; hệ thống chưa cắt bớt dữ liệu để tạo báo cáo."
    if category == "invalid_analysis_contract" and any(i.get("code") == "scope_conflict" for i in getattr(error, "issues", [])):
        message = "Kế hoạch AI không khớp miền dữ liệu, thời gian hoặc phạm vi bạn đã chọn. Vui lòng lập lại kế hoạch với cùng lựa chọn."
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
    from services.analysis_issue_service import actionable_issue
    issue = actionable_issue(error, message, structured, layer_diagnostics)
    from services.analysis_quality_service import not_scored
    outcome = ('INSUFFICIENT_DATA' if issue['category'] in {'HISTORICAL_DATA_UNAVAILABLE', 'INSUFFICIENT_DATA'}
               else 'UNSUPPORTED' if issue['category'] in {'METRIC_UNAVAILABLE', 'UNSUPPORTED_ANALYSIS'}
               else 'NEEDS_INPUT' if issue['category'] in {'NEEDS_CLARIFICATION', 'SCOPE_CONFLICT', 'TIME_CONFLICT', 'REQUESTED_SCOPE_TOO_LARGE'}
               else 'SYSTEM_ERROR')
    stages = {'planning_timeout':'PLANNING_DEADLINE', 'capacity_requires_choice':'CAPACITY_PLANNING', 'capacity_configuration':'CAPACITY_PLANNING',
              'artifact_store_unavailable':'ARTIFACT_PERSISTENCE', 'artifact_expired':'ARTIFACT_PERSISTENCE',
              'artifact_integrity':'ARTIFACT_PERSISTENCE', 'artifact_capacity':'ARTIFACT_PERSISTENCE',
              'dry_run_failed':'DRY_RUN', 'response_capacity':'RESPONSE_SERIALIZATION',
              'session_capacity':'SESSION_PERSISTENCE', 'session_storage':'SESSION_PERSISTENCE',
              'result_contract':'RESULT_VALIDATION', 'execution':'SQL_EXECUTION',
              'quality_verification':'QUALITY_VERIFICATION', 'dashboard_contract':'DASHBOARD_PLANNING',
              'semantic_intent_invalid':'SEMANTIC_INTENT', 'provider_invalid_json':'PROVIDER_FORMAT'}
    stage = (layer_diagnostics or {}).get('failure_stage') or stages.get(category) or (
        'PROVIDER_TRANSPORT' if category.startswith('provider_') else 'PLAN_VALIDATION')
    actions = {'capacity_requires_choice':'ask_scope_or_granularity_choice',
               'artifact_store_unavailable':'restore_storage_without_semantic_retry',
               'artifact_expired':'refresh_approved_query', 'artifact_integrity':'reject_artifact_and_refresh',
               'artifact_capacity':'ask_smaller_artifact_scope', 'dry_run_failed':'inspect_plan_and_datasource',
               'response_capacity':'reduce_presentation_only', 'session_capacity':'reduce_control_state',
               'session_storage':'restore_session_storage', 'capacity_configuration':'repair_server_configuration',
               'execution':'inspect_datasource_without_semantic_retry', 'result_contract':'inspect_full_result_contract'}
    known = {k:v for k,v in (layer_diagnostics or {}).items() if k in {
        'request_anchor_verification','semantic_status','execution_status','result_status'} and v is not None}
    known['provider_attempt_count'] = len(provider_calls or [])
    if structured and structured.get('known_interpretation'):
        known['interpretation'] = structured['known_interpretation']
    return {
        "outcome": outcome,
        "quality_assessment": not_scored(message),
        "issue": issue,
        "status": (
            "needs_clarification" if category in clarification_categories or population_overflow else "error"
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
            "failure_stage": stage,
            "provider_attempt_count": (layer_diagnostics or {}).get("provider_attempt_count", len(provider_calls or [])),
            "agent_round_count": (layer_diagnostics or {}).get("agent_rounds", 0),
            "repair_round_count": (layer_diagnostics or {}).get("contract_repair_count", 0),
            "terminal_error": category,
            "pipeline_version": (layer_diagnostics or {}).get("pipeline_version", "2.7"),
            "error_category": category,
            "missing_fields": (
                structured.get("missing_fields", []) if structured else []
            ),
            "ambiguity_count": (
                len(structured.get("ambiguous_fields", [])) if structured else 0
            ),
        },
        "charts": [],
        'failure': dict(stage=stage, code=category, user_impact=outcome,
            what_is_known=known, what_failed=category,
            retry_helps=category in {'provider_timeout','provider_connection','provider_http','provider_rate_limited'},
            needs_user_input=outcome=='NEEDS_INPUT', recommended_server_action=actions.get(category,
                'request_clarification' if outcome=='NEEDS_INPUT' else 'inspect_failed_stage')),
    }
