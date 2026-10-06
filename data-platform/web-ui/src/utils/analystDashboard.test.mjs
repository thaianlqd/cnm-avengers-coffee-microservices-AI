import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildSync } from 'esbuild';

function compile(relative) {
  const directory = mkdtempSync(join(tmpdir(), 'analyst-ui-'));
  try {
    const reactPath = dirname(createRequire(import.meta.url).resolve('react'));
    const result = buildSync({ entryPoints: [new URL(relative, import.meta.url).pathname], bundle: true, platform: 'node', format: 'cjs', write: false, alias: { react: reactPath }, external: [reactPath, `${reactPath}/*`] });
    const artifact = join(directory, 'component.cjs'); writeFileSync(artifact, result.outputFiles[0].contents);
    return createRequire(import.meta.url)(artifact);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
const { AnalystChart, SeriesLineChart, HeatmapChart } = compile('../components/Charts.tsx');
const { AnalystDashboardSummary, AnalystOptionalNarrative, AnalystReportReady, AnalystEvidence } = compile('../components/AnalystDashboardSummary.tsx');
const { AnalysisMeaning } = compile('../components/AnalysisMeaning.tsx');
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));

for (const type of ['grouped_bar', 'stacked_bar', 'stacked_100']) {
  test(`${type} displays actual series labels, values and semantic unit`, () => {
    const html = render(AnalystChart, { chart: { chart_type: type, unit: type === 'stacked_100' ? '%' : 'sản phẩm', data: [{ label: 'Bánh', series_1: 10, series_2: 20 }], series: [{ key: 'series_1', label: 'Nhóm A' }, { key: 'series_2', label: 'Nhóm B' }] } });
    assert.ok(html.includes('Nhóm A')); assert.ok(html.includes('Nhóm B')); assert.ok(html.includes(type === 'stacked_100' ? '%' : 'sản phẩm'));
  });
}
test('scatter labels separate units and preserves negative observations', () => {
  const html = render(AnalystChart, { chart: { chart_type: 'scatter', unit: 'lượt', y_unit: 'điểm', x_label: 'Chuyến giao', y_label: 'Đánh giá', data: [{ label: 'A', x: -2, y: 3 }, { label: 'B', x: 4, y: 5 }] } });
  for (const value of ['Chuyến giao', 'Đánh giá', '-2 lượt', 'điểm', 'liên hệ quan sát']) assert.ok(html.includes(value));
});
test('signed trend and missing observations remain separate segments', () => {
  const html = render(SeriesLineChart, { data: [{ label: 'Kỳ 1', s: -10 }, { label: 'Kỳ 2' }, { label: 'Kỳ 3', s: 5 }], series: [{ key: 's', label: 'Chênh lệch' }], unit: 'VND' });
  assert.ok(html.includes('-10 VND')); assert.equal((html.match(/<circle/g) || []).length, 2); assert.ok(!html.includes('L '));
});
test('prototype-like heatmap categories remain safe and missing cells show dash', () => {
  const html = render(HeatmapChart, { data: [{ x: '__proto__', y: 'constructor', value: 10 }, { x: 'B', y: 'A', value: 20 }] });
  assert.ok(html.includes('__proto__')); assert.ok(html.includes('constructor')); assert.ok(html.includes('—'));
  assert.equal({}.polluted, undefined);
});
test('multi-operation proposal shows business labels and each population period', () => {
  const html = render(AnalysisMeaning, { interpretation: { subject: 'Sản phẩm', analysis_kind: 'composite', metrics: [], operations: [
    { id: 'Phần 1', query_id: 'hidden_one', role: 'requested', subject: 'Sản phẩm', kind: 'ranking', metrics: [{ label: 'Số lượng sản phẩm bán', unit: 'sản phẩm' }], filters: [{ dimension: 'Thành phố', value: 'Hà Nội' }], time_range: { start: '2026-09-01', end: '2026-09-30' }, ranking: { metric: 'Số lượng sản phẩm bán', top_n: 5 } },
    { id: 'Phần 2', query_id: 'hidden_two', role: 'supporting', subject: 'Sản phẩm', kind: 'aggregate', metrics: [], filters: [], time_range: {} },
  ] } });
  for (const label of ['Theo yêu cầu', 'Phân tích hỗ trợ', 'Hà Nội', '2026-09-01', 'Top 5', 'sản phẩm']) assert.ok(html.includes(label));
  assert.ok(!html.includes('hidden_one')); assert.ok(!html.includes('hidden_two'));
});
test('dashboard copy follows actual plan and records omitted views', () => {
  const html = render(AnalystDashboardSummary, { report: { dashboard_description: '6 biểu đồ và 3 bảng', dashboard_plan: { requested_chart_count: 5, supporting_chart_count: 1, omitted_visuals: [{ reason: 'chart_budget' }] } } });
  assert.ok(html.includes('6 biểu đồ')); assert.ok(html.includes('5 biểu đồ theo yêu cầu')); assert.ok(html.includes('1 biểu đồ hỗ trợ')); assert.ok(!html.includes('tăng trưởng')); assert.ok(!html.includes('chart_budget'));
});
test('empty optional narrative renders no section or filler', () => {
  assert.equal(render(AnalystOptionalNarrative, { report: { conclusions: [], recommendations: [] } }), '');
  const html = render(AnalystOptionalNarrative, { report: { conclusions: ['Có bằng chứng'], recommendations: [] } });
  assert.ok(html.includes('Có bằng chứng')); assert.ok(!html.includes('Khuyến nghị'));
});
test('only a successful report may show the ready banner', () => {
  for (const report of [null, { status: 'error' }, { status: 'needs_clarification' }, { status: 'proposal_ready' }]) {
    assert.equal(render(AnalystReportReady, { report, onOpen: () => {} }), '');
  }
  assert.ok(render(AnalystReportReady, { report: { status: 'success', title: 'Kết quả đã kiểm chứng' }, onOpen: () => {} }).includes('Kết quả đã kiểm chứng'));
});
test('AnalyticsView wires actual dashboard components and no static scope claim', () => {
  const source = readFileSync(new URL('../views/AnalyticsView.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('<AnalystChart chart={chart} />')); assert.ok(source.includes('<AnalystOptionalNarrative report={rep} />'));
  assert.ok(!source.includes('KPI tăng trưởng, so sánh danh mục, cơ cấu'));
});


test('analysis evidence exposes scope, sources and calculation references safely', () => {
  const html = render(AnalystEvidence, { report: {
    analysis_explanation: [{ query_id: 'main', subject: 'Doanh thu', objective: 'Đối chiếu quy mô', role: 'requested', data_sources: ['Đơn hàng'], metrics: [{ label: 'Doanh thu', unit: 'VND', business_filters: [] }], dimensions: ['Thành phố'], filters: [{ label: 'Thành phố', value: ['Hà Nội', 'Hồ Chí Minh'] }], period: { start: '2026-07-01', end: '2026-09-30', timezone: 'Asia/Ho_Chi_Minh' }, rows_returned: 2, selection: 'complete', evidence_refs: ['main:gap'], visuals: [{ id: 'v1', reason: 'So sánh các nhóm cùng đơn vị' }] }],
    evidence: [{ id: 'main:gap', statement: 'Chênh lệch quan sát', scope_ref: 'main', unit: 'VND', values: { gap: 20 } }]
  } });
  for (const value of ['Đơn hàng', 'Hà Nội', 'Hồ Chí Minh', '2026-07-01', '2 dòng', 'Bằng chứng 1', 'So sánh các nhóm cùng đơn vị', 'main%3Agap', '20']) assert.ok(html.includes(value), value);
  assert.equal(render(AnalystEvidence, { report: {} }), '');
  const proposal = render(AnalystEvidence, { report: { analysis_explanation: [{ query_id: 'x', subject: '<script>', objective: 'Kiểm tra', metrics: [], period: {}, rows_returned: null }] } });
  assert.ok(proposal.includes('Kế hoạch chưa chạy truy vấn')); assert.ok(!proposal.includes('<script>'));
});
test('large bar axes use readable scales while exact values stay in tooltips', () => {
  const html = render(AnalystChart, { chart: { chart_type: 'bar', unit: 'VND', title: 'Doanh thu', data: [{ label: 'A', value: 1554792000 }, { label: 'B', value: 916533000 }] } });
  assert.ok(html.includes('tỷ')); assert.ok(html.includes('1.554.792.000')); assert.ok(html.includes('916.533.000'));
});
