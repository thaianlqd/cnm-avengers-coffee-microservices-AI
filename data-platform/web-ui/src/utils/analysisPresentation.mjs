const titles = {
  provider_timeout: 'Dịch vụ AI chưa phản hồi kịp',
  provider_connection: 'Chưa kết nối được dịch vụ AI',
  provider_rate_limited: 'Dịch vụ AI đang giới hạn lượt gọi',
  provider_auth: 'Dịch vụ AI chưa xác thực được',
  planning_timeout: 'Hệ thống chưa hoàn tất kế hoạch trong thời gian cho phép',
  invalid_analysis_contract: 'Hệ thống chưa hoàn tất diễn giải phân tích',
  semantic_intent_invalid: 'Hệ thống chưa hoàn tất diễn giải phân tích',
  duplicate_invalid_tool_call: 'AI chưa sửa được kế hoạch phân tích',
  analysis_spec_invalid: 'Kế hoạch phân tích chưa hợp lệ',
  agent_budget: 'Chưa hoàn tất kế hoạch trong giới hạn xử lý',
  execution: 'Truy vấn phân tích gặp lỗi',
  result_contract: 'Kết quả chưa vượt qua kiểm chứng',
  unsupported_metric: 'Chỉ số chưa được hỗ trợ',
  unsupported_dimension: 'Chiều phân tích chưa được hỗ trợ',
  provider_call_budget_exceeded: 'Chưa ánh xạ được yêu cầu vào danh mục dữ liệu',
  semantic_resolution_failed: 'Chưa ánh xạ được yêu cầu vào danh mục dữ liệu',
  max_tokens_exceeded: 'Yêu cầu vượt giới hạn độ dài phản hồi AI',
  one_shot_context_budget_exceeded: 'Phạm vi yêu cầu quá lớn',
  dashboard_contract: 'Cách trình bày chưa phù hợp với dữ liệu',
};

// The server's typed failure contract decides retryability. Retry is shown only
// when an unchanged resubmission can plausibly succeed (transient transport);
// deterministic gaps (unsupported, insufficient data, no-progress) never offer it.
function typedRetry(response) {
  if (typeof response.retryable === 'boolean') return response.retryable;
  if (typeof response.failure?.retry_helps === 'boolean') return response.failure.retry_helps;
  return null;
}

export function analysisFailureActions(response = {}) {
  if (response.status === 'proposal_ready' || response.status === 'success') return { edit: false, retry: false };
  const systemError = response.outcome === 'SYSTEM_ERROR' || response.status === 'error';
  const actions = response.issue?.suggested_actions || [];
  const typed = typedRetry(response);
  const retry = typed ?? (systemError && actions.some(a => a.type === 'retry'));
  const edit = typed === null ? !systemError : !retry || actions.some(a => a.type === 'edit_question');
  return { edit, retry };
}

export function analysisFailureTitle(response = {}) {
  const category = response.diagnostics?.error_category || response.clarification?.reason || '';
  if (titles[category]) return titles[category];
  if (response.failure?.guidance?.title) return response.failure.guidance.title;
  if (category.startsWith('provider_') && (!response.analysis_state || response.analysis_state === 'PROVIDER_FAILURE')) return 'Dịch vụ AI chưa khả dụng';
  return response.status === 'error' ? 'Chưa thể hoàn tất phân tích' : 'Cần làm rõ một phần yêu cầu';
}

// Capability states are information, not alarms; system failures are alerts.
export function analysisFailureTone(response = {}) {
  const state = response.analysis_state;
  if (['UNSUPPORTED_CAPABILITY', 'INSUFFICIENT_DATA', 'SUPPORTED_BUT_NEEDS_CLARIFICATION', 'RESTRICTED'].includes(state)) return 'info';
  return response.status === 'error' ? 'alert' : 'info';
}

// Failures after understanding expose a safe reference for operators.
export function analysisFailureReference(response = {}) {
  if (!['EXECUTION_FAILURE', 'SYSTEM_FAILURE'].includes(response.analysis_state)) return null;
  return response.diagnostics?.job_id || response.diagnostics?.request_id || null;
}

// Suggestion chips come from the governed capability registry only.
export function capabilitySuggestions(capabilities, limit = 6) {
  const domains = Array.isArray(capabilities?.domains) ? capabilities.domains : [];
  const seen = new Set();
  const out = [];
  for (const d of domains) {
    const question = Array.isArray(d.example_questions) ? d.example_questions.find(q => typeof q === 'string' && q.trim()) : null;
    if (!question || seen.has(question)) continue;
    seen.add(question);
    out.push({ label: d.label, prompt: question });
    if (out.length >= limit) break;
  }
  return out;
}

export function analysisPlanLabel(chart = {}) {
  return ({ ranking: 'Xếp hạng', trend: 'Xu hướng', aggregate: 'So sánh nhóm',
    distribution: 'Cơ cấu', cross_tab: 'Đối chiếu hai chiều', relationship: 'Liên hệ quan sát', detail: 'Bảng chi tiết',
    horizontal_bar: 'Cột ngang', bar: 'Cột dọc', line: 'Đường', area: 'Miền',
    multi_line: 'Đa đường', donut: 'Cơ cấu tròn', heatmap: 'Ma trận',
    grouped_bar: 'Cột nhóm', stacked_bar: 'Cột chồng', stacked_100: 'Cột chồng 100%', scatter: 'Phân tán',
  })[chart.chart_type] || 'Kiểm chứng sau khi có dữ liệu';
}

export function analysisChartGroups(charts = []) {
  if (charts.some(c => c.domain_label)) {
    const groups = new Map();
    // Requested work leads the story even when a domain has supporting views.
    for (const chart of [...charts.filter(c => c.role !== 'supporting'), ...charts.filter(c => c.role === 'supporting')]) {
      const role = chart.role === 'supporting' ? 'supporting' : 'requested';
      const key = `${chart.domain_id || ''}:${role}:${chart.story_section || ''}`;
      if (!groups.has(key)) groups.set(key, { role: key, title: [chart.domain_label, chart.story_section, role === 'supporting' ? 'Phân tích hỗ trợ' : 'Theo yêu cầu'].filter(Boolean).join(' · '), charts: [] });
      groups.get(key).charts.push(chart);
    }
    return [...groups.values()];
  }
  return [
    { role: 'requested', title: 'Phân tích theo yêu cầu', charts: charts.filter(c => c.role !== 'supporting') },
    { role: 'supporting', title: 'Phân tích hỗ trợ', charts: charts.filter(c => c.role === 'supporting') },
  ].filter(group => group.charts.length);
}

export function analysisChartSpan(chart, index, count) {
  return 'col-span-1';
}
