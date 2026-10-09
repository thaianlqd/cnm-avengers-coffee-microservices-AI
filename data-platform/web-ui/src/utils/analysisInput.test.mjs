import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildSync } from 'esbuild';
import { analysisInputPayload } from './analysisInput.mjs';
import { analysisChartGroups } from './analysisPresentation.mjs';

function component(relative, name) {
  const directory = mkdtempSync(join(tmpdir(), 'domain-ui-'));
  try {
    const reactPath = dirname(createRequire(import.meta.url).resolve('react'));
    const compiled = buildSync({ entryPoints: [new URL(relative, import.meta.url).pathname], bundle: true, platform: 'node', format: 'cjs', write: false, alias: { react: reactPath }, external: [reactPath, `${reactPath}/*`] });
    const path = join(directory, 'component.cjs'); writeFileSync(path, compiled.outputFiles[0].contents);
    return createRequire(import.meta.url)(path)[name];
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
const Form = component('../components/AnalysisInputForm.tsx', 'AnalysisInputForm');
const Modules = component('../components/AnalysisModules.tsx', 'AnalysisModules');
const Clarification = component('../components/AnalysisClarification.tsx', 'AnalysisClarification');
const Meaning = component('../components/AnalysisMeaning.tsx', 'AnalysisMeaning');
const Summary = component('../components/AnalystDashboardSummary.tsx', 'AnalystPlanningSummary');
const capabilities = { domains: [{ id: 'energy', label: 'Năng lượng' }, { id: 'reviews', label: 'Phản hồi' }], time_presets: [{ id: 'auto', label: 'Tự động' }, { id: 'previous_month', label: 'Tháng trước' }, { id: 'custom', label: 'Tùy chọn' }], scope_types: [{ id: 'region', label: 'Khu vực', values: ['A', 'B'] }] };
const props = { capabilities, prompt: '', context: '', expectation: '', domain: 'auto', time: 'auto', depth: 'deep', start: '', end: '', scope: { mode: 'auto', filters: [] }, disabled: false,
  ...Object.fromEntries(['onPrompt', 'onDomain', 'onTime', 'onDepth', 'onStart', 'onEnd', 'onScope', 'onContext', 'onExpectation', 'onSubmit'].map(key => [key, () => {}])) };
const render = (Component, values) => renderToStaticMarkup(React.createElement(Component, values));

test('exactly four conceptual inputs, optional context/expectation, only question required', () => {
  const html = render(Form, props);
  assert.equal((html.match(/data-analysis-input=/g) || []).length, 4);
  assert.equal((html.match(/required=""/g) || []).length, 1);
  for (const label of ['Câu hỏi phân tích', 'Thời gian', 'Ngữ cảnh phân tích', 'Mong muốn phân tích']) assert.ok(html.includes(label));
  for (const internal of ['metric_refs', 'group_by', 'granularity', 'chart_type', 'population_group', 'analysis-domain', 'analysis-depth', 'analysis-scope']) assert.ok(!html.includes(internal));
});
test('AI selects breadth; optional natural expectation has no selector', () => {
  const html = render(Form, { ...props, expectation: 'Nhiều góc nhìn phù hợp' });
  assert.ok(html.includes('Nhiều góc nhìn phù hợp'));
  for (const mode of ['focused', 'deep', 'comprehensive']) assert.ok(!html.includes(`value="${mode}"`));
});
test('custom dates stay within time without adding conceptual inputs', () => {
  const html = render(Form, { ...props, time: 'custom', start: '2026-09-01', end: '2026-09-30' });
  assert.equal((html.match(/data-analysis-input=/g) || []).length, 4);
  assert.equal((html.match(/type="date"/g) || []).length, 2);
});
test('time presets work without capability network response', () => {
  const html = render(Form, { ...props, capabilities: null });
  for (const mode of ['auto', 'previous_month', 'current_year', 'custom']) assert.ok(html.includes(`value="${mode}"`));
});
test('question-only natural payload omits blank optional fields and engine configuration', () => {
  assert.deepEqual(analysisInputPayload({ question: '  Kiểm tra hoạt động  ' }), { question: 'Kiểm tra hoạt động', time: { mode: 'auto' } });
  assert.deepEqual(analysisInputPayload({ question: 'X', context: '  ', expectation: '' }), { question: 'X', time: { mode: 'auto' } });
});
test('four natural fields and explicit module selection survive approval unchanged', () => {
  const input = analysisInputPayload({ question: 'Câu hỏi', time: 'current_month', context: 'Hai thành phố', expectation: 'Nhiều góc nhìn', moduleId: 'am_123456789012345678901234' });
  assert.deepEqual(input, { question: 'Câu hỏi', time: { mode: 'current_month' }, analysis_context: 'Hai thành phố', analysis_expectation: 'Nhiều góc nhìn', analysis_module_id: 'am_123456789012345678901234' });
  assert.deepEqual({ ...input, session_id: 'approved' }.question, input.question);
});
test('question-only submission has auto constraints and deep default', () => {
  assert.deepEqual(analysisInputPayload({ prompt: '  Kiểm tra hoạt động  ' }), { prompt: 'Kiểm tra hoạt động', domain: 'auto', time_range: { mode: 'auto' }, analysis_scope: { mode: 'auto', filters: [] }, analysis_depth: 'deep' });
});
test('structured domain/time/scope/depth are serialized unchanged', () => {
  const scope = { mode: 'selected', filters: [{ dimension: 'region', operator: 'in', value: ['A', 'B'] }] };
  const payload = analysisInputPayload({ prompt: 'Đánh giá', domain: 'energy', time: 'custom', start: '2026-09-01', end: '2026-09-30', scope, depth: 'comprehensive' });
  assert.deepEqual(payload.analysis_scope, scope); assert.equal(payload.domain, 'energy'); assert.equal(payload.analysis_depth, 'comprehensive');
  assert.deepEqual(payload.time_range, { mode: 'custom', start: '2026-09-01', end: '2026-09-30' });
  const approved = { ...payload, session_id: 'server-session' };
  assert.deepEqual(Object.fromEntries(Object.entries(approved).filter(([key]) => key !== 'session_id')), payload);
});
test('invalid custom time, empty selected population, or empty question cannot submit', () => {
  for (const input of [{ prompt: ' ' }, { prompt: 'X', time: 'custom' }, { prompt: 'X', time: 'custom', start: '2026-10-01', end: '2026-09-01' }, { prompt: 'X', scope: { mode: 'selected', filters: [] } }]) assert.throws(() => analysisInputPayload(input));
});
test('domain dashboard story preserves requested priority and business labels', () => {
  const groups = analysisChartGroups([{ id: 's', domain_id: 'orders', domain_label: 'Bán hàng', story_section: 'Diễn biến', role: 'supporting' }, { id: 'p', domain_id: 'delivery', domain_label: 'Giao hàng', story_section: 'Liên hệ', role: 'requested' }]);
  assert.equal(groups[0].charts[0].id, 'p'); assert.ok(groups[0].title.includes('Giao hàng')); assert.ok(groups[1].title.includes('Phân tích hỗ trợ'));
});
test('proposal groups domains and explains catalog lens without raw semantic IDs', () => {
  const html = render(Meaning, { interpretation: { subject: 'Đánh giá', metrics: [], operations: [{ query_id: 'private_query', domain_id: 'hidden_domain', domain_label: 'Bán hàng', lens_label: 'Tổng quan bán hàng', role: 'requested', metrics: [] }, { query_id: 'other_query', domain_label: 'Giao hàng', role: 'supporting', metrics: [] }] } });
  assert.ok(html.includes('Bán hàng')); assert.ok(html.includes('Tổng quan bán hàng')); assert.ok(html.includes('Giao hàng'));
  assert.ok(!html.includes('private_query')); assert.ok(!html.includes('hidden_domain'));
});
test('comprehensive copy and limited coverage do not promise a quota', () => {
  const html = render(Summary, { diagnostics: { planning_mode: 'one_shot', analysis_depth: 'comprehensive', depth_coverage: { status: 'limited' } } });
  assert.ok(html.includes('6–8')); assert.ok(html.includes('khi dữ liệu cho phép')); assert.ok(html.includes('ít góc nhìn hơn mục tiêu'));
});

test('module save requires approved success, active chip and provenance use business labels', () => {
  const base = { active: { module_id: 'private_id', name: 'Kinh doanh hàng tháng', compatibility: 'ready' }, disabled: false, onSelect() {}, onReport() {}, onEdit() {}, onUpdate() {} };
  const pending = render(Modules, { ...base, report: { status: 'proposal_ready', session_id: 'server' } });
  assert.ok(!pending.includes('Lưu thành bài toán mới'));
  const success = render(Modules, { ...base, report: { status: 'success', session_id: 'server', module_provenance: { name: 'Kinh doanh hàng tháng', mode: 'rerun' }, sql: 'SELECT secret', rows: ['private'] } });
  assert.ok(success.includes('Lưu thành bài toán mới')); assert.ok(success.includes('Bỏ bài toán đang chọn'));
  assert.ok(success.includes('Chạy lại với dữ liệu hiện tại')); assert.ok(!success.includes('SELECT')); assert.ok(!success.includes('private_id'));
});
test('actionable issue renders known meaning, missing choice and explicit snapshot action', () => {
  const html = render(Clarification, { response: { status: 'needs_clarification', issue: { title: 'Chưa có lịch sử', what_is_known: ['Giao hàng'], what_is_missing: ['Chưa có ngày thực hiện chuyến'], suggested_actions: [{ type: 'snapshot', label: 'Xem hiện trạng', followup: 'Phân tích hiện trạng' }] } }, onEdit() {}, onSnapshot() {} });
  for (const text of ['Chưa có lịch sử', 'Giao hàng', 'Chưa có ngày thực hiện chuyến', 'Xem hiện trạng']) assert.ok(html.includes(text));
  assert.ok(!html.includes('group_by'));
});
