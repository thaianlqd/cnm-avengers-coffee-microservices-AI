const titles = {
  invalid_analysis_contract: 'Kế hoạch phân tích chưa hợp lệ',
  duplicate_invalid_tool_call: 'AI chưa sửa được kế hoạch phân tích',
  analysis_spec_invalid: 'Kế hoạch phân tích chưa hợp lệ',
  agent_budget: 'Chưa hoàn tất kế hoạch trong giới hạn xử lý',
  execution: 'Truy vấn phân tích gặp lỗi',
  result_contract: 'Kết quả chưa vượt qua kiểm chứng',
  unsupported_metric: 'Chỉ số chưa được hỗ trợ',
  unsupported_dimension: 'Chiều phân tích chưa được hỗ trợ',
  provider_call_budget_exceeded: 'Yêu cầu đã đạt giới hạn lượt AI',
  one_shot_context_budget_exceeded: 'Phạm vi yêu cầu quá lớn',
  dashboard_contract: 'Cách trình bày chưa phù hợp với dữ liệu',
};

export function analysisFailureTitle(response = {}) {
  const category = response.diagnostics?.error_category || response.clarification?.reason || '';
  if (titles[category]) return titles[category];
  if (category.startsWith('provider_')) return 'Dịch vụ AI chưa khả dụng';
  return response.status === 'error' ? 'Chưa thể hoàn tất phân tích' : 'Cần làm rõ một phần yêu cầu';
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
  return [
    { role: 'requested', title: 'Phân tích theo yêu cầu', charts: charts.filter(c => c.role !== 'supporting') },
    { role: 'supporting', title: 'Phân tích hỗ trợ', charts: charts.filter(c => c.role === 'supporting') },
  ].filter(group => group.charts.length);
}

export function analysisChartSpan(chart, index, count) {
  const wide = chart.layout === 'wide' || chart.col_span === 12 ||
    ['line', 'area', 'multi_line', 'heatmap', 'scatter'].includes(chart.chart_type) ||
    count === 1 || (chart.role !== 'supporting' && index === 0);
  return wide ? 'col-span-1 lg:col-span-2' : 'col-span-1';
}
