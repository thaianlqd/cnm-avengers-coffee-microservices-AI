import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forecastMethodLabel, forecastSummary } from './forecastPresentation.mjs';

test('forecast provenance is labelled, numbers pass through unchanged', () => {
  const s = forecastSummary({ metric_label: 'Số đơn', metric_unit: 'đơn', unit: 'month', horizon: 1, method: 'naive',
    history: { start: '2026-01-01', end: '2026-09-01', periods: 9 },
    backtest: { mae: 372.33, improvement_vs_naive_pct: 0 },
    forecast: [{ period: '2026-10-01', value: 4089, lower_80: 3550.39, upper_80: 4627.61, kind: 'in_progress' },
               { period: '2026-11-01', value: 4089, lower_80: 3400, upper_80: 4700, kind: 'future' }],
    limitations: ['x'] });
  assert.equal(s.title, 'Dự báo Số đơn 1 tháng tới');
  assert.match(s.quality, /không tốt hơn/);
  assert.deepEqual(s.rows.map(r => [r.label, r.value]), [['Kỳ đang diễn ra', 4089], ['Dự báo', 4089]]);
  assert.match(s.history, /9 kỳ đã hoàn tất/);
});

test('method labels cover every server method family', () => {
  for (const m of ['naive', 'seasonal_naive', 'moving_average_7', 'ses_0.3', 'holt_0.8_0.1']) assert.notEqual(forecastMethodLabel(m), 'Phương pháp thống kê');
});

test('unavailable forecast explains missing history instead of showing numbers', () => {
  const s = forecastSummary({ metric_label: 'Doanh thu', unit: 'month', horizon: 3, status: 'insufficient_history', required_periods: 6, available_periods: 4 });
  assert.match(s.unavailable, /cần ít nhất 6 tháng.*hiện có 4/);
  assert.deepEqual(s.rows, []);
  assert.match(forecastSummary({ unit: 'month', horizon: 1, status: 'insufficient_history', history_end: '2024-12-01' }).unavailable, /2024-12-01/);
  assert.equal(forecastSummary({ status: 'ok', forecast: [] }).unavailable, '');
});
