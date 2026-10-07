import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

function load(entry) {
  const output = buildSync({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react'] }).outputFiles[0].text;
  const module = { exports: {} }; vm.runInNewContext(output, { module, exports: module.exports, require: createRequire(import.meta.url), console, setTimeout, clearTimeout }); return module.exports;
}
const { AnalysisQualityScore } = load('src/components/AnalysisQualityScore.tsx');
const { AnalystDashboard } = load('src/components/AnalystDashboardSummary.tsx');
const q = { score: 94, status: 'verified', version: '2.7.1', completed: [{ id: 'a', label: 'Sản phẩm đã kiểm chứng', evidence_refs: ['a:qty:scalar'] }], missing: [], unverified: [{ id: 'cause', label: 'Chưa xác minh nguyên nhân.' }], limitations: [{ id: 'topn', label: 'Top N chưa phải toàn bộ.' }], components: [{ id: 'coverage', label: 'Phạm vi yêu cầu', score: 30, max_score: 30, status: 'passed', summary: 'Đã thực hiện 1/1.' }], suggested_next_actions: [] };
const render = (assessment) => renderToStaticMarkup(React.createElement(AnalysisQualityScore, { assessment }));
test('verified score is accessible, linked, and not presented as AI probability', () => {
  const html = render(q); assert.match(html, /94\/100/); assert.match(html, /role="progressbar"/); assert.match(html, /aria-valuenow="94"/); assert.match(html, /không phải xác suất AI trả lời đúng/); assert.match(html, /#evidence-a%3Aqty%3Ascalar/); assert.match(html, /Chưa thể xác minh/);
});
test('legacy and failed reports have no numeric score or empty progress bar', () => {
  for (const assessment of [undefined, { status: 'not_scored', score: null, reason: 'Chưa đủ metadata' }]) {
    const html = render(assessment); assert.match(html, /Chưa chấm/); assert.doesNotMatch(html, /role="progressbar"|NaN|undefined|0\/100/);
  }
});
test('partial reports expose missing work and next actions without hiding limits', () => {
  const html = render({ ...q, score: 64, status: 'partially_verified', missing: [{ id: 'm', label: 'Chưa có lịch sử shipper.' }], suggested_next_actions: [{ id: 'h', label: 'Bổ sung lịch sử giao hàng.', action: 'add_history' }] });
  assert.match(html, /64\/100/); assert.match(html, /Chưa thực hiện/); assert.match(html, /Bổ sung lịch sử giao hàng/); assert.match(html, /Giới hạn dữ liệu/);
});
test('backend text is escaped and evidence links are encoded', () => {
  const html = render({ ...q, completed: [{ id: 'unsafe', label: '<script>alert(1)</script>', evidence_refs: ['" onclick="evil'] }] });
  assert.doesNotMatch(html, /<script>|onclick="evil/); assert.match(html, /&lt;script&gt;/);
});
test('verification appears below views and before expandable tables on desktop and mobile layout', () => {
  const html = renderToStaticMarkup(React.createElement(AnalystDashboard, { report: { charts: [], quality_assessment: q, result_sets: { a: { rows: [{ qty: 1 }], columns: ['qty'] } } } }));
  assert.ok(html.indexOf('data-dashboard-grid') < html.indexOf('data-analysis-quality'));
  assert.ok(html.indexOf('data-analysis-quality') < html.indexOf('Bảng dữ liệu'));
  assert.match(html, /grid-cols-1 lg:grid-cols-2/); assert.match(html, /grid-cols-1 md:grid-cols-2/);
});
