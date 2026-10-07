import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildSync } from 'esbuild';
import { analysisPlanLabel } from './analysisPresentation.mjs';

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
const { AnalystDashboardSummary, AnalystOptionalNarrative, AnalystReportReady, AnalystEvidence, AnalystViews, AnalystResultTable, AnalystPlanningSummary } = compile('../components/AnalystDashboardSummary.tsx');

test('large population chart discloses display subset and complete analytical coverage', () => {
  const html = renderToStaticMarkup(React.createElement(AnalystViews, { charts: [{
    id: 'preview', chart_type: 'bar', title: 'Doanh thu theo nhóm', role: 'requested',
    selection: 'display_subset', displayed_count: 20, population_count: 416,
    data: [{ label: 'Nhóm A', value: 100 }],
  }] }));
  assert.ok(html.includes('20/416'));
  assert.ok(html.includes('số liệu phân tích dùng đầy đủ các nhóm'));
  assert.ok(!html.includes('Tập Top N được chọn'));
});
const { AnalysisClarification } = compile('../components/AnalysisClarification.tsx');
const { AnalysisMeaning } = compile('../components/AnalysisMeaning.tsx');
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));

test('proposal types describe ranking and detail without promising a trend', () => {
  assert.equal(analysisPlanLabel({ chart_type: 'ranking' }), 'Xếp hạng');
  assert.equal(analysisPlanLabel({ chart_type: 'detail' }), 'Bảng chi tiết');
  assert.equal(analysisPlanLabel({ chart_type: 'private_unknown_id' }), 'Kiểm chứng sau khi có dữ liệu');
});

test('single-operation trend displays the chosen weekly observation grain', () => {
  const html = render(AnalysisMeaning, { interpretation: { subject: 'Doanh thu', analysis_kind: 'trend', granularity: 'week', metrics: [{ label: 'Doanh thu', unit: 'VND' }], time_range: { start: '2026-09-07', end: '2026-10-06' } } });
  assert.ok(html.includes('Theo tuần')); assert.ok(html.includes('2026-09-07')); assert.ok(html.includes('VND'));
});

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
  assert.ok(source.includes('<AnalystViews charts={rep.charts || []}')); assert.ok(source.includes('<AnalystOptionalNarrative report={rep} />'));
  assert.ok(!source.includes('KPI tăng trưởng, so sánh danh mục, cơ cấu'));
});

test('natural fields replace depth configuration and approval reuses submitted input', () => {
  const source = readFileSync(new URL('../views/AnalyticsView.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('question: prompt, context: aiAnalysisContext, expectation: aiAnalysisExpectation'));
  assert.ok(source.includes('body: JSON.stringify(submittedInput)'));
  assert.ok(source.includes('aiPlan?.submittedInput || aiInput(promptToSend)'));
  const form = readFileSync(new URL('../components/AnalysisInputForm.tsx', import.meta.url), 'utf8');
  assert.ok(form.includes('Mong muốn phân tích')); assert.ok(!form.includes('Độ sâu phân tích'));
});

test('deep planning and related population evidence explain their actual scope', () => {
  const summary = render(AnalystPlanningSummary, { diagnostics: { planning_mode: 'one_shot', analysis_depth: 'deep', requested_operation_count: 1, supporting_operation_count: 5 } });
  assert.ok(summary.includes('5–6')); assert.ok(summary.includes('5 phần hỗ trợ'));
  const html = render(AnalystEvidence, { report: { analysis_explanation: [{query_id:'internal', subject:'Khuyến mãi', objective:'Cơ cấu', role:'supporting', population_note:'Giữ nguyên bộ lọc; tập đơn có khuyến mãi được đo riêng.', metrics:[{label:'Chi tiêu', unit:'VND', historical:false, population_requirements:['Khuyến mãi có giá trị']}]}] } });
  assert.ok(html.includes('tập đơn có khuyến mãi được đo riêng'));
  assert.ok(html.includes('không thể suy ra diễn biến quá khứ'));
  assert.ok(html.includes('Khuyến mãi có giá trị')); assert.ok(!html.includes('internal'));
});

test('seven views render requested first, with responsive widths and distinct units', () => {
  const charts = Array.from({ length: 7 }, (_, i) => ({
    id: `private_query_${i}`, title: `Biểu đồ ${i}`, purpose: 'Đối chiếu dữ liệu',
    role: i < 3 ? 'requested' : 'supporting', chart_type: i === 2 ? 'line' : 'bar',
    unit: i === 1 ? 'VND' : 'sản phẩm', selection: i === 0 ? 'Top N' : 'complete',
    data: [{ label: 'A', value: 2 }],
  })).reverse();
  const html = render(AnalystViews, { charts });
  assert.equal((html.match(/<article/g) || []).length, 7);
  assert.ok(html.indexOf('Phân tích theo yêu cầu') < html.indexOf('Phân tích hỗ trợ'));
  assert.ok(html.includes('grid-cols-1 lg:grid-cols-2'));
  assert.ok(html.includes('lg:col-span-2'));
  for (const label of ['VND', 'sản phẩm', 'Tập Top N']) assert.ok(html.includes(label));
  assert.ok(!html.includes('private_query_'));
});

test('result table paginates full rows and renders business labels safely', () => {
  const html = render(AnalystResultTable, { result: { role: 'supporting',
    columns: ['internal_metric_id'], column_labels: { internal_metric_id: 'Doanh thu' },
    rows: Array.from({ length: 31 }, (_, i) => ({ internal_metric_id: i === 0 ? '<script>' : `row ${i}` })),
  } });
  assert.equal((html.match(/<tr/g) || []).length, 16);
  for (const label of ['Doanh thu', 'Kết quả hỗ trợ', '31 dòng', 'Trang 1/3', 'Trang sau', '&lt;script&gt;']) assert.ok(html.includes(label));
  assert.ok(!html.includes('row 15')); assert.ok(!html.includes('internal_metric_id')); assert.ok(!html.includes('<script>'));
});

for (const [category, title] of [
  ['invalid_analysis_contract', 'Kế hoạch phân tích chưa hợp lệ'],
  ['duplicate_invalid_tool_call', 'AI chưa sửa được kế hoạch phân tích'],
  ['agent_budget', 'Chưa hoàn tất kế hoạch'],
  ['provider_auth', 'Dịch vụ AI chưa khả dụng'],
  ['execution', 'Truy vấn phân tích gặp lỗi'],
  ['result_contract', 'Kết quả chưa vượt qua kiểm chứng'],
]) test(`failure UI attributes ${category} to its actual layer`, () => {
  const html = render(AnalysisClarification, { response: { status: 'error', diagnostics: { error_category: category }, message: 'Có thể chỉnh sửa yêu cầu.' } });
  assert.ok(html.includes(title)); assert.ok(html.includes('role="alert"'));
  assert.ok(!html.includes(category)); assert.ok(!html.includes('sẵn sàng'));
});

test('area adds real observed segments while gaps remain separate', () => {
  const chart = { chart_type: 'area', unit: 'VND', data: [{ label: '1', value: 10 }, { label: '2', value: 20 }, { label: '3' }, { label: '4', value: 30 }] };
  const area = render(AnalystChart, { chart });
  const line = render(AnalystChart, { chart: { ...chart, chart_type: 'line' } });
  assert.equal((area.match(/opacity=".12"/g) || []).length, 2);
  assert.ok(!line.includes('opacity=".12"'));
  assert.equal((area.match(/<circle/g) || []).length, 3);
});


test('analysis evidence exposes scope, sources and calculation references safely', () => {
  const html = render(AnalystEvidence, { report: {
    analysis_explanation: [{ query_id: 'main', subject: 'Doanh thu', objective: 'Đối chiếu quy mô', role: 'requested', data_sources: ['Đơn hàng'], metrics: [{ label: 'Doanh thu', unit: 'VND', business_filters: [] }], dimensions: ['Thành phố'], filters: [{ label: 'Thành phố', value: ['Hà Nội', 'Hồ Chí Minh'] }], period: { start: '2026-07-01', end: '2026-09-30', timezone: 'Asia/Ho_Chi_Minh' }, rows_returned: 2, selection: 'complete', evidence_refs: ['main:gap'], visuals: [{ id: 'v1', reason: 'So sánh các nhóm cùng đơn vị' }] }],
    evidence: [{ id: 'main:gap', statement: 'Chênh lệch quan sát', scope_ref: 'main', unit: 'VND', values: { gap: 20 } }]
  } });
  for (const value of ['Đơn hàng', 'Hà Nội', 'Hồ Chí Minh', '2026-07-01', '2 dòng', 'Tra cứu 1 phép tính', 'So sánh các nhóm cùng đơn vị', 'main%3Agap', '20']) assert.ok(html.includes(value), value);
  assert.equal(render(AnalystEvidence, { report: {} }), '');
  const proposal = render(AnalystEvidence, { report: { analysis_explanation: [{ query_id: 'x', subject: '<script>', objective: 'Kiểm tra', metrics: [], period: {}, rows_returned: null }] } });
  assert.ok(proposal.includes('Kế hoạch chưa chạy truy vấn')); assert.ok(!proposal.includes('<script>'));
});
test('large bar axes use readable scales while exact values stay in tooltips', () => {
  const html = render(AnalystChart, { chart: { chart_type: 'bar', unit: 'VND', title: 'Doanh thu', data: [{ label: 'A', value: 1554792000 }, { label: 'B', value: 916533000 }] } });
  assert.ok(html.includes('tỷ')); assert.ok(html.includes('1.554.792.000')); assert.ok(html.includes('916.533.000'));
});


test('one-shot proposal distinguishes mandatory, optional and omitted work', () => {
  const html = render(AnalystPlanningSummary, { diagnostics: { planning_mode: 'one_shot', requested_operation_count: 2, supporting_operation_count: 3, omitted_supporting_operation_count: 1, tool_trace: ['INTERNAL_TRACE'] } });
  for (const text of ['AI đã lập kế hoạch', '2 phần theo yêu cầu', '3 phần hỗ trợ', '1 phần hỗ trợ đã được bỏ qua']) assert.ok(html.includes(text));
  assert.ok(!html.includes('INTERNAL_TRACE')); assert.ok(!html.includes('vòng'));
});

test('manual retry renders only on errors and never invokes itself', () => {
  let calls = 0;
  const props = { response: { status: 'error', diagnostics: { error_category: 'invalid_analysis_contract' } }, onRetry: () => calls++ };
  assert.ok(render(AnalysisClarification, props).includes('Thử lập lại kế hoạch')); assert.equal(calls, 0);
  assert.ok(!render(AnalysisClarification, { ...props, response: { status: 'needs_clarification' } }).includes('Thử lập lại kế hoạch'));
});

test('chart presentation controls keep Top N caution and are disabled during refinement', () => {
  const html = render(AnalystViews, { charts: [{ id: 'v1', chart_type: 'horizontal_bar', title: 'Top 5', selection: 'Top N', data: [{ label: 'A', value: 10 }], unit: 'sản phẩm' }], onChartTypeChange: () => {}, editing: true });
  for (const text of ['Cách trình bày', 'disabled=""', 'Cột ngang', 'Cột dọc', 'không phải cơ cấu toàn bộ']) assert.ok(html.includes(text));
});

test('refinement wire sends revision and explicit visual action without full history', () => {
  const source = readFileSync(new URL('../views/AnalyticsView.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('current_report: { revision: repToRefine.revision }'));
  assert.ok(source.includes('visual_changes: visualChanges || []'));
  assert.ok(!source.includes('conversation_history:'));
  assert.ok(source.includes('if (planningInFlight.current) return'));
});

test('one-shot guard failures have safe business headings', () => {
  for (const [category, heading] of [['provider_call_budget_exceeded', 'Yêu cầu đã đạt giới hạn lượt AI'], ['one_shot_context_budget_exceeded', 'Phạm vi yêu cầu quá lớn'], ['dashboard_contract', 'Cách trình bày chưa phù hợp với dữ liệu']]) {
    const html = render(AnalysisClarification, { response: { status: 'error', diagnostics: { error_category: category } } });
    assert.ok(html.includes(heading)); assert.ok(!html.includes(category));
  }
});

test('large evidence collections are collapsed and bounded to one page', () => {
  const evidence = Array.from({ length: 1200 }, (_, i) => ({ id: `calc-${i}`, scope_ref: 'main', statement: `Calcul ${i}`, unit: 'VND', values: { value: i } }));
  const html = render(AnalystEvidence, { report: { analysis_explanation: [{ query_id: 'main', subject: 'Doanh thu', evidence_refs: evidence.map(e => e.id) }], evidence } });
  assert.ok(!html.includes('open=""'));
  assert.equal((html.match(/id="evidence-/g) || []).length, 8);
  assert.ok(html.includes('Trang 1/150')); assert.ok(html.includes('Tìm bằng chứng'));
  assert.ok(!html.includes('Bằng chứng 1199')); assert.ok(!html.includes('Calcul 8<'));
});

test('dashboard opens with up to eight charts and keeps all result tables in disclosure', () => {
  const { AnalystDashboard } = compile('../components/AnalystDashboardSummary.tsx');
  const html = render(AnalystDashboard, { report: { charts: Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, title: `Chart ${i}`, chart_type: 'bar', data: [{ label: 'A', value: i }] })), result_sets: { all: { columns: ['value'], rows: [{ value: 1 }] } } } });
  assert.equal((html.match(/<article/g) || []).length, 8);
  assert.ok(html.includes('Xem thêm 1 biểu đồ')); assert.ok(html.includes('Bảng dữ liệu')); assert.ok(html.includes('Diễn giải đầy đủ'));
  assert.ok(!html.includes('open=""'));
});

test('long category labels get a bounded horizontal view and zero stays zero', () => {
  const html = render(AnalystViews, { charts: [{ title: 'Doanh thu — Kỳ đo dài', chart_type: 'bar', data: Array.from({ length: 20 }, (_, i) => ({ label: `Tên chi nhánh rất dài ${i}`, value: i })) }] });
  assert.ok(html.includes('Nhóm tiếp theo')); assert.ok(html.includes('1–10/20'));
  assert.ok(html.includes('width:0%')); assert.match(html, /<h5[^>]*>Doanh thu<\/h5>/);
  assert.ok(!html.includes('Tên chi nhánh rất dài 10'));
});

test('compact dashboard uses one two-column grid across different story sections', () => {
  const charts = ['So sánh và xếp hạng', 'Quy mô và đối chiếu', 'Cơ cấu đóng góp', 'Diễn biến theo thời gian'].map((story_section, i) => ({ id: 'c' + i, domain_label: 'Sản phẩm', domain_id: 'products', story_section, chart_type: i === 3 ? 'multi_line' : 'bar', title: 'Góc nhìn ' + i, data: [] }));
  const html = render(AnalystViews, { charts, compact: true });
  assert.equal((html.match(/data-dashboard-grid/g) || []).length, 1);
  assert.equal((html.match(/<article/g) || []).length, 4);
  assert.ok(!html.includes('lg:col-span-2'));
  assert.ok(html.includes('lg:grid-cols-2'));
});

test('time axes use five short labels, with full dates retained for tooltips', () => {
  const html = render(SeriesLineChart, { data: Array.from({ length: 14 }, (_, i) => ({ label: `2026-09-${String(i + 1).padStart(2, '0')}T00:00:00`, s: i })), series: [{ key: 's', label: 'Sản lượng', color: '#2563eb' }] });
  assert.equal((html.match(/y="278"/g) || []).length, 5);
  assert.ok(html.includes('01/09')); assert.ok(html.includes('14/09'));
  assert.ok(html.includes('<title>2026-09-14T00:00:00'));
});

test('top ten shows all ten observations with multiple bar colors', () => {
  const html = render(AnalystChart, { chart: { chart_type: 'horizontal_bar', selection: 'Top N', data: Array.from({ length: 10 }, (_, i) => ({ label: 'Món ' + i, value: 10 - i })) } });
  assert.ok(html.includes('Món 9')); assert.ok(!html.includes('Nhóm tiếp theo'));
  for (const color of ['#2563eb', '#059669', '#d97706']) assert.ok(html.includes(color));
});

test('clipped weekly buckets are marked and disclose the actual selected dates', () => {
  const html = render(AnalystChart, { chart: { chart_type: 'area', granularity: 'week', period: { start: '2026-07-01', end: '2026-09-30' }, data: [{ label: '2026-06-29T00:00:00', value: 624 }, { label: '2026-09-28T00:00:00', value: 274 }] } });
  assert.ok(html.includes('29/06*')); assert.ok(html.includes('28/09*'));
  assert.ok(html.includes('2026-07-01 → 2026-07-05'));
  assert.ok(html.includes('2026-09-28 → 2026-09-30'));
  assert.equal((html.match(/fill="white"/g) || []).length, 2);
});
