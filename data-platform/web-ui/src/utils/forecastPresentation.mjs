// Presentation of server-computed forecasts. Numbers are never derived here;
// the UI only labels provenance (method, history, backtest) and periods.
const methodLabels = {
  naive: 'Giữ mức kỳ gần nhất (naive)',
  seasonal_naive: 'Lặp lại chu kỳ mùa vụ gần nhất',
};

export function forecastMethodLabel(method = '') {
  if (methodLabels[method]) return methodLabels[method];
  if (method.startsWith('moving_average_')) return `Trung bình trượt ${method.split('_').pop()} kỳ`;
  if (method.startsWith('ses_')) return 'Làm mượt hàm mũ đơn';
  if (method.startsWith('holt_')) return 'Làm mượt hàm mũ có xu hướng (Holt)';
  return 'Phương pháp thống kê';
}

const unitLabels = { day: 'ngày', week: 'tuần', month: 'tháng' };

function unavailableMessage(forecast) {
  const unit = unitLabels[forecast.unit] || 'kỳ';
  if (forecast.history_end) return `Chưa dự báo được: lịch sử đã chọn kết thúc ở ${forecast.history_end}, trước kỳ hoàn tất gần nhất. Hãy chọn khoảng thời gian kéo tới hiện tại.`;
  if (forecast.required_periods) return `Chưa đủ lịch sử để dự báo: cần ít nhất ${forecast.required_periods} ${unit} đã hoàn tất, hiện có ${forecast.available_periods ?? 0}.`;
  return 'Chưa đủ lịch sử có hoạt động để dự báo chỉ số này.';
}

export function forecastSummary(forecast = {}) {
  const unavailable = forecast.status && forecast.status !== 'ok' ? unavailableMessage(forecast) : '';
  const backtest = forecast.backtest || {};
  const improvement = backtest.improvement_vs_naive_pct;
  return {
    title: `Dự báo ${forecast.metric_label || ''} ${forecast.horizon || ''} ${unitLabels[forecast.unit] || ''} tới`.replace(/\s+/g, ' ').trim(),
    method: forecastMethodLabel(forecast.method),
    history: forecast.history ? `${forecast.history.start} → ${forecast.history.end} (${forecast.history.periods} kỳ đã hoàn tất)` : '',
    quality: typeof backtest.mae === 'number'
      ? `Sai số tuyệt đối trung bình khi kiểm tra lùi: ${backtest.mae.toLocaleString('vi-VN')} ${forecast.metric_unit || ''}`.trim()
        + (typeof improvement === 'number' ? ` · so với naive: ${improvement > 0 ? 'tốt hơn ' + improvement + '%' : 'không tốt hơn'}` : '')
      : 'Chưa có kiểm tra lùi',
    rows: (forecast.forecast || []).map(p => ({ ...p, label: p.kind === 'in_progress' ? 'Kỳ đang diễn ra' : 'Dự báo' })),
    limitations: forecast.limitations || [],
    interval: forecast.interval || '',
    unavailable,
  };
}

/** Chart input straight from the server artifact (history_points + forecast). */
export function forecastChartData(forecast = {}) {
  return { history: (forecast.history_points || []).map(p => ({ period: p.period, value: p.value })),
    forecast: (forecast.forecast || []).map(p => ({ period: p.period, value: p.value, lower_80: p.lower_80, upper_80: p.upper_80, kind: p.kind })) };
}

/** Batch freshness disclosure: stale input must never look like a sales collapse. */
export function forecastFreshness(forecast = {}, coverage) {
  const end = forecast.history?.end, inProgress = (forecast.forecast || []).filter(p => p.kind === 'in_progress').length;
  const notes = [];
  if (inProgress) notes.push(`${inProgress} kỳ gần nhất chưa hoàn tất hoặc chưa đồng bộ được dự báo (đánh dấu “Kỳ đang diễn ra”), không tính là doanh số bằng 0.`);
  if (coverage?.freshness?.stale) notes.push('Dữ liệu cập nhật theo đợt đang trễ so với hiện tại; hãy kiểm tra lần đồng bộ gần nhất trước khi dùng dự báo.');
  if (end) notes.unshift(`Lịch sử đã kiểm chứng đến kỳ ${end}.`);
  return notes;
}
