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
const Meaning = component('../components/AnalysisMeaning.tsx', 'AnalysisMeaning');
const Summary = component('../components/AnalystDashboardSummary.tsx', 'AnalystPlanningSummary');
const capabilities = { domains: [{ id: 'energy', label: 'Năng lượng' }, { id: 'reviews', label: 'Phản hồi' }], time_presets: [{ id: 'auto', label: 'Tự động' }, { id: 'previous_month', label: 'Tháng trước' }, { id: 'custom', label: 'Tùy chọn' }], scope_types: [{ id: 'region', label: 'Khu vực', values: ['A', 'B'] }] };
const props = { capabilities, prompt: '', domain: 'auto', time: 'auto', depth: 'deep', start: '', end: '', scope: { mode: 'auto', filters: [] }, disabled: false,
  ...Object.fromEntries(['onPrompt', 'onDomain', 'onTime', 'onDepth', 'onStart', 'onEnd', 'onScope', 'onSubmit'].map(key => [key, () => {}])) };
const render = (Component, values) => renderToStaticMarkup(React.createElement(Component, values));

test('exactly five conceptual inputs and only question required', () => {
  const html = render(Form, props);
  assert.equal((html.match(/data-analysis-input=/g) || []).length, 5);
  assert.equal((html.match(/required=""/g) || []).length, 1);
  for (const label of ['Câu hỏi phân tích', 'Miền dữ liệu', 'Thời gian', 'Phạm vi phân tích', 'Độ sâu phân tích']) assert.ok(html.includes(label));
  for (const internal of ['metric_refs', 'group_by', 'granularity', 'chart_type', 'population_group']) assert.ok(!html.includes(internal));
});
test('catalog additions appear without a fixed domain option list', () => {
  const html = render(Form, props);
  assert.ok(html.includes('Năng lượng')); assert.ok(html.includes('Phản hồi'));
  assert.ok(!html.includes('Sản phẩm &amp; Thực đơn'));
  const source = readFileSync(new URL('../components/AnalysisInputForm.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('p.capabilities?.domains'));
});
test('all three depth modes are available and deep is selected', () => {
  const html = render(Form, props);
  for (const mode of ['focused', 'deep', 'comprehensive']) assert.ok(html.includes(`value="${mode}"`));
  assert.ok(html.includes('value="deep" selected=""'));
});
test('custom dates are nested within time, without adding a sixth conceptual input', () => {
  const html = render(Form, { ...props, time: 'custom', start: '2026-09-01', end: '2026-09-30' });
  assert.equal((html.match(/data-analysis-input=/g) || []).length, 5);
  assert.equal((html.match(/type="date"/g) || []).length, 2);
  assert.ok(html.includes('2026-09-01')); assert.ok(html.includes('2026-09-30'));
});
test('scope has business labels and existing canonical values', () => {
  const html = render(Form, { ...props, scope: { mode: 'selected', filters: [{ dimension: 'region', operator: 'in', value: ['A', 'B'] }] } });
  assert.ok(html.includes('Khu vực: A, B')); assert.ok(!html.includes('region: A'));
  assert.equal((html.match(/data-analysis-input=/g) || []).length, 5);
});
test('unavailable catalog still supports automatic choices', () => {
  const html = render(Form, { ...props, capabilities: null });
  assert.ok(html.includes('Danh mục chưa sẵn sàng')); assert.ok(html.includes('Tự động'));
  assert.ok(!html.includes('value="energy"'));
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
