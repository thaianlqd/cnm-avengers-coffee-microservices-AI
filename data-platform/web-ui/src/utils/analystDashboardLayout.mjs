const palette = ['#2563eb', '#0d9488', '#7c3aed', '#d97706', '#db2777', '#0891b2'];
export function chartAccent(chart = {}) {
  const key = `${chart.metric || chart.query_id || ''}:${chart.x_field || ''}:${chart.story_section || chart.purpose || chart.chart_type || ''}`;
  const hash = [...key].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0);
  return palette[hash % palette.length];
}
export function conciseChartTitle(chart = {}) {
  const parts = String(chart.title || chart.lens_label || 'Phân tích dữ liệu').split(' — ');
  return /^Top \d+$/.test(parts[0]) && parts[1] ? `${parts[0]} · ${parts[1]}` : parts[0];
}
export function categoryColor(label, index = 0) {
  const colors = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#ea580c', '#4f46e5'];
  return colors[index % colors.length];
}
export function compositionData(data = [], noun = 'nhóm') {
  const sorted = [...data].sort((a, b) => b.value - a.value || String(a.label).localeCompare(String(b.label)));
  if (sorted.length <= 8) return { data: sorted, grouped_categories: 0 };
  const tail = sorted.slice(6);
  return { data: [...sorted.slice(0, 6).map((r, i) => ({ ...r, color: categoryColor(r.label, i) })), { label: `Khác (${tail.length} ${noun})`, value: tail.reduce((sum, r) => sum + r.value, 0), color: '#94a3b8' }], grouped_categories: tail.length, population_count: data.length };
}
export function bucketCoverage(label, granularity, period = {}) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(label))) return null;
  const start = new Date(String(label).slice(0, 10) + 'T00:00:00Z'), next = new Date(start);
  if (granularity === 'day') next.setUTCDate(next.getUTCDate() + 1);
  else if (granularity === 'week') next.setUTCDate(next.getUTCDate() + 7);
  else if (['month', 'quarter', 'year'].includes(granularity)) next.setUTCMonth(next.getUTCMonth() + ({ month: 1, quarter: 3, year: 12 }[granularity]));
  else return null;
  const end = new Date(next.getTime() - 86400000).toISOString().slice(0, 10), begin = start.toISOString().slice(0, 10);
  return { start: begin, end, partial: Boolean((period.start && begin < period.start) || (period.end && end > period.end)) };
}
export function presentationChart(chart, report = {}) {
  const op = (report.analysis_explanation || []).find(o => o.query_id === (chart.query_id || chart.scope_ref));
  let out = { ...chart, granularity: chart.granularity || op?.granularity, period: chart.period || op?.period };
  const e = (report.evidence || []).find(e => e.scope_ref === chart.scope_ref && e.metric === chart.metric && e.feature === 'concentration' && e.scope?.selection === 'complete' && !Object.keys(e.scope?.partition || {}).length);
  // Older reports may contain a bar for a complete composition. Evidence must
  // certify the full total; never reinterpret a Top N or a display subset.
  const rows = chart.data || [], total = rows.reduce((sum, r) => sum + r.value, 0);
  if (['bar', 'horizontal_bar'].includes(chart.chart_type) && chart.selection === 'complete' && e && rows.length >= 2 && rows.every(r => Number.isFinite(r.value) && r.value >= 0) && Math.abs(total - e.values.total) < 1e-6) {
    out = { ...out, chart_type: 'donut', ...compositionData(rows, chart.x_field === 'category' ? 'danh mục' : 'nhóm'), purpose: 'Cơ cấu trong phạm vi đã chọn' };
  }
  if (['line', 'area', 'multi_line'].includes(chart.chart_type) && rows.some(r => bucketCoverage(r.label, out.granularity, out.period)?.partial)) {
    out.time_note = '* Kỳ đầu hoặc cuối chưa đủ ngày trong phạm vi đã chọn. Chỉ so sánh biến động khi có ít nhất hai kỳ đầy đủ; biểu đồ vẫn giữ mọi kỳ.';
  }
  return out;
}
export function dashboardCharts(charts = [], report = {}) {
  const seen = new Set(), unique = [];
  for (const c of charts) {
    const p = (report.query_plans || []).find(p => p.id === (c.query_id || c.scope_ref));
    const metrics = c.metrics || [c.metric];
    const legacyKey = p && metrics.every(m => p.metric_expressions?.[m]) ? JSON.stringify([
      p.source, p.joins, metrics.map(m => p.metric_expressions[m]), p.dimensions,
      p.filters, p.time_column, p.period, p.granularity, p.ranking, p.row_limit, p.explicit_limit,
      c.x_field, c.series_field, ['donut', 'stacked_100'].includes(c.chart_type) ? 'share' : 'raw',
    ]) : null;
    const key = c.semantic_view_key || legacyKey;
    // Equivalence comes from validated server semantics, never matching values.
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    unique.push(presentationChart(c, report));
  }
  const order = { ranking: 0, comparison: 1, distribution: 2, trend: 3, relationship: 4 };
  const sectionOrder = { 'So sánh và xếp hạng': 0, 'Quy mô và đối chiếu': 1, 'Cơ cấu đóng góp': 2, 'Diễn biến theo thời gian': 3 };
  unique.sort((a, b) => Number(a.role === 'supporting') - Number(b.role === 'supporting') || (order[a.purpose] ?? sectionOrder[a.story_section] ?? 4) - (order[b.purpose] ?? sectionOrder[b.story_section] ?? 4));
  return { charts: unique, duplicateCount: charts.length - unique.length };
}
export function dashboardHighlights(report = {}) {
  const preferred = [], scopes = new Set();
  for (const e of report.evidence || []) {
    if (scopes.has(e.scope_ref)) continue;
    const op = (report.analysis_explanation || []).find(o => o.query_id === e.scope_ref);
    const label = op?.metrics?.find(m => m.id === e.metric)?.label || 'Giá trị';
    const trend = e.feature === 'change' ? trendComparison(report, e) : null;
    const info = e.feature === 'leader' ? { label: label + ' · hạng 1', value: e.values.value, sub_text: e.values.entity }
      : e.feature === 'group_comparison' ? { label: label + ' cao nhất', value: e.values.largest_value, sub_text: e.values.largest }
      : e.feature === 'concentration' ? { label: 'Tổng ' + label.toLowerCase(), value: e.values.total, sub_text: 'Toàn bộ danh mục trong phạm vi' }
      : trend ? { label: 'Biến động ' + label.toLowerCase(), value: trend.change_pct, unit: '%', sub_text: `${trend.first_period.slice(0, 10)} → ${trend.last_period.slice(0, 10)}${trend.excluded_partial_buckets ? ' · kỳ đầy đủ' : ''}` } : null;
    if (info && Number.isFinite(info.value)) { scopes.add(e.scope_ref); preferred.push({ unit: e.unit, evidence_id: e.id, scope_ref: e.scope_ref, feature: e.feature, ...info }); }
  }
  if (preferred.length) {
    const scopeOrder = new Map();
    for (const id of [...(report.analysis_explanation || []).map(o => o.query_id), ...dashboardCharts(report.charts || [], report).charts.map(c => c.scope_ref || c.query_id)]) {
      if (!scopeOrder.has(id)) scopeOrder.set(id, scopeOrder.size);
    }
    const ordered = preferred.sort((a,b) => (scopeOrder.get(a.scope_ref) ?? 999) - (scopeOrder.get(b.scope_ref) ?? 999));
    const cards = ordered.slice(0, 4), trend = ordered.find(c => c.feature === 'change');
    if (trend && !cards.includes(trend)) cards[3] = trend;
    return cards;
  }
  const cards = (report.kpi_cards || []).filter(c => Number.isFinite(c.value));
  if (cards.length) return cards.slice(0, 4);
  const used = new Set();
  return (report.evidence || []).filter(e => e.feature === 'group_comparison' && Number.isFinite(e.values?.largest_value)).flatMap(e => {
    const chart = (report.charts || []).find(c => c.scope_ref === e.scope_ref && c.metric === e.metric);
    const key = chart?.semantic_view_key || `${e.scope_ref}:${e.metric}`;
    if (used.has(key)) return [];
    used.add(key);
    const op = (report.analysis_explanation || []).find(o => o.query_id === e.scope_ref);
    const label = op?.metrics?.find(m => m.id === e.metric)?.label || (chart ? conciseChartTitle(chart) : 'Giá trị quan sát');
    return [{ label: `${label} cao nhất`, value: e.values.largest_value, unit: e.unit,
      sub_text: e.values.largest, evidence_id: e.id, scope_ref: e.scope_ref }];
  }).slice(0, 4);
}
export function trendComparison(report, evidence) {
  const values = evidence.values || {};
  if (values.comparison_basis) return values.comparable === false ? null : values;
  const chart = (report.charts || []).find(c => c.scope_ref === evidence.scope_ref && c.metric === evidence.metric && ['line', 'area'].includes(c.chart_type));
  const op = (report.analysis_explanation || []).find(o => o.query_id === evidence.scope_ref);
  if (!chart) return values;
  const rows = chart.data || [], granularity = chart.granularity || op?.granularity;
  const coverage = rows.map(r => bucketCoverage(r.label, granularity, chart.period || op?.period || evidence.scope?.period));
  const excluded = coverage.filter(c => c?.partial).length;
  if (!excluded) return values;
  const full = rows.filter((r, i) => coverage[i] && !coverage[i].partial && Number.isFinite(r.value));
  if (full.length < 2) return null;
  const first = full[0], last = full[full.length - 1], change = last.value - first.value;
  return { ...values, first: first.value, last: last.value, first_period: first.label, last_period: last.label, change, change_pct: first.value ? change / Math.abs(first.value) * 100 : null, excluded_partial_buckets: excluded };
}
export function dashboardFindings(report = {}) {
  const seen = new Set(), scopes = new Set();
  const findings = (report.key_findings || []).flatMap(f => {
    const e = (report.evidence || []).find(e => e.id === f.evidence_id);
    const op = (report.analysis_explanation || []).find(o => o.query_id === e?.scope_ref);
    const label = op?.metrics?.find(m => m.id === e?.metric)?.label || 'Giá trị';
    const trend = e?.feature === 'change' ? trendComparison(report, e) : null;
    if (e?.feature === 'change' && !trend) return [];
    const text = trend
      ? `${label}: ${trend.first.toLocaleString('vi-VN')} → ${trend.last.toLocaleString('vi-VN')} ${e.unit}${trend.change_pct == null ? '' : ` (${trend.change_pct.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%)`}, từ kỳ ${trend.first_period.slice(0, 10)} đến ${trend.last_period.slice(0, 10)}${trend.excluded_partial_buckets ? '; chỉ đối chiếu kỳ đầy đủ' : ''}.`
      : e?.feature === 'group_comparison'
      ? `${businessCategory(e.values.largest)}: ${label.toLowerCase()} cao nhất (${e.values.largest_value.toLocaleString('vi-VN')} ${e.unit}).`
      : e?.feature === 'concentration'
      ? `${businessCategory(e.values.largest)} chiếm ${e.values.largest_share_pct.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}% ${label.toLowerCase()} trong phạm vi.`
      : typeof f === 'string' ? f : f.finding || f.comment || f.note;
    if (!text || seen.has(text)) return [];
    seen.add(text); return [{ text, evidence_id: f.evidence_id || f.evidence_refs?.[0], scope_ref: e?.scope_ref }];
  });
  const first = [], extra = [];
  for (const finding of findings) {
    if (finding.scope_ref && scopes.has(finding.scope_ref)) extra.push(finding);
    else { first.push(finding); if (finding.scope_ref) scopes.add(finding.scope_ref); }
  }
  return [...first, ...extra].slice(0, 6);
}
export function initialChartType(chart = {}) {
  const rows = chart.data || [];
  return chart.chart_type === 'bar' && (rows.length > 8 || rows.some(r => String(r.label).length > 18))
    ? 'horizontal_bar' : chart.chart_type;
}
export function businessCategory(value) {
  const labels = { HOAN_THANH: 'Hoàn thành', DA_HUY: 'Đã hủy', DANG_GIAO: 'Đang giao', DANG_XU_LY: 'Đang xử lý', CHO_XAC_NHAN: 'Chờ xác nhận', DUNG_TAI_CHO: 'Dùng tại chỗ', MANG_DI: 'Mang đi', GIAO_HANG: 'Giao hàng', THANH_CONG: 'Thành công', THAT_BAI: 'Thất bại', CHO_THANH_TOAN: 'Chờ thanh toán' };
  const payments = { THANH_TOAN_KHI_NHAN_HANG: 'Thanh toán khi nhận hàng', VI_DIEN_TU: 'Ví điện tử', NGAN_HANG_QR: 'QR ngân hàng', THE_NGAN_HANG: 'Thẻ ngân hàng', CHUYEN_KHOAN: 'Chuyển khoản', TIEN_MAT: 'Tiền mặt', GIAO_TAN_NOI: 'Giao tận nơi', DA_THANH_TOAN: 'Đã thanh toán', CHO_THU_TIEN: 'Chờ thu tiền' };
  return labels[value] || payments[value] || String(value ?? 'Chưa xác định');
}

export function chartExplanation(chart = {}) {
  const title = conciseChartTitle(chart).replace(/^Top \d+ · /, '').toLowerCase();
  const dimension = (chart.x_label || 'nhóm').toLowerCase();
  const type = chart.chart_type;
  if (chart.selection === 'Top N') return `Xếp hạng theo ${title}; chiều dài thanh thể hiện giá trị của từng ${dimension} trong tập Top N.`;
  if (type === 'donut') return `Cơ cấu ${title} theo ${dimension}; tỷ trọng tính trên toàn bộ ${chart.population_count || chart.data?.length || ''} nhóm trong phạm vi đã chọn.`;
  if (['line', 'area', 'multi_line'].includes(type)) {
    const interval = { day: 'ngày', week: 'tuần', month: 'tháng', quarter: 'quý', year: 'năm' }[chart.granularity] || 'kỳ';
    const partial = (chart.data || []).some(r => bucketCoverage(r.label, chart.granularity, chart.period)?.partial);
    return `Diễn biến ${title}${type === 'multi_line' ? ' theo từng nhóm' : ''}; ${partial ? `điểm rỗng là ${interval} chưa đủ ngày, biến động chỉ đối chiếu kỳ đầy đủ` : `mỗi điểm là một ${interval} quan sát`}.`;
  }
  if (type === 'scatter') return `Mỗi điểm là một ${(chart.observation_label || 'quan sát').toLowerCase()}, ghép cặp ${(chart.x_label || '').toLowerCase()} và ${(chart.y_label || '').toLowerCase()}; mối liên hệ không khẳng định nguyên nhân.`;
  if (type === 'heatmap') return `So sánh ${title} theo ${dimension} và ${(chart.series_label || 'nhóm').toLowerCase()}; màu đậm hơn thể hiện giá trị cao hơn.`;
  if (type === 'stacked_100') return `Tỷ trọng từng nhóm trong mỗi ${dimension}; tổng các thành phần của mỗi cột bằng 100%.`;
  if (type === 'stacked_bar') return `Các phần màu thể hiện đóng góp của từng nhóm vào ${title} theo ${dimension}.`;
  if (type === 'grouped_bar') return `Đối chiếu các chỉ số cùng đơn vị theo ${dimension}; mỗi màu tương ứng một chỉ số hoặc nhóm trong chú giải.`;
  return `So sánh ${title} theo ${dimension}${chart.selection === 'display_subset' ? `, hiển thị ${chart.displayed_count}/${chart.population_count} nhóm có giá trị cao nhất` : ''}; ${type === 'bar' ? 'cột cao' : 'thanh dài'} hơn thể hiện giá trị lớn hơn.`;
}
