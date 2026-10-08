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
test('legacy weighted score is hidden, with evidence and unmeasured accuracy visible', () => {
  const html = render(q); assert.doesNotMatch(html, /94\/100|role="progressbar"/); assert.match(html, /Qua kiểm tra nội bộ/); assert.match(html, /không phải xác suất AI trả lời đúng/); assert.match(html, /#evidence-a%3Aqty%3Ascalar/); assert.match(html, /Chưa thể xác minh/); assert.match(html, /Độ chính xác đối chứng: Chưa đo/);
});
test('legacy and failed reports have no numeric score or empty progress bar', () => {
  for (const assessment of [undefined, { status: 'not_scored', score: null, reason: 'Chưa đủ metadata' }]) {
    const html = render(assessment); assert.match(html, /Chưa kiểm chứng/); assert.doesNotMatch(html, /role="progressbar"|NaN|undefined|0\/100/);
  }
});
test('partial reports expose missing work and next actions without hiding limits', () => {
  const html = render({ ...q, score: 64, status: 'partially_verified', missing: [{ id: 'm', label: 'Chưa có lịch sử shipper.' }], suggested_next_actions: [{ id: 'h', label: 'Bổ sung lịch sử giao hàng.', action: 'add_history' }] });
  assert.doesNotMatch(html, /64\/100/); assert.match(html, /Còn phần chưa đạt/); assert.match(html, /Chưa thực hiện/); assert.match(html, /Bổ sung lịch sử giao hàng/); assert.match(html, /Giới hạn dữ liệu/);
});
test('observed check counts stay separate from unmeasured accuracy and probability', () => {
  const html = render({ ...q, score: null, measurement_mode: 'evidence_checks', verification_checks: [
    { id:'claims',label:'Bằng chứng',passed:7,total:10,status:'partial',summary:'3 phát biểu chưa khớp.' },
    { id:'visual',label:'Biểu đồ',passed:0,total:0,status:'not_applicable',summary:'Không cần biểu đồ.' }
  ] });
  assert.match(html, /7\/10 đạt/); assert.match(html, /3 phát biểu chưa khớp/); assert.match(html, /Không áp dụng/);
  assert.match(html, /Độ chính xác đối chứng: Chưa đo/); assert.match(html, /Chưa hiệu chuẩn/);
  assert.doesNotMatch(html, /100\/100|70%|0\/0/);
});
test('versioned verification score shows formula and unearned independent points', () => {
  const html=render({ ...q,score:90,version:'2.8.2',score_method:{id:'verification_evidence_v1',formula:'90 × kiểm tra + 10 × đối chứng',unmeasured_points:10,interpretation:'Chỉ số kiểm chứng, không phải xác suất đúng.'},score_breakdown:[{id:'independent_reference',label:'Đối chứng độc lập',earned_points:0,possible_points:10,status:'not_measured'}] });
  assert.match(html,/90\/100/);assert.match(html,/aria-valuenow="90"/);
  assert.match(html,/Công thức và phân bổ điểm/);assert.match(html,/10 điểm đối chứng độc lập chưa được xác minh/);
  assert.match(html,/Đối chứng độc lập · Chưa đo/);assert.match(html,/Độ chính xác đối chứng: Chưa đo/);
  assert.doesNotMatch(html,/100\/100/);
});
test('fractional verification failures remain visible and errors never show a fake zero', () => {
  const assessment={ ...q,status:'partially_verified',score:89.8,score_method:{id:'verification_evidence_v1',unmeasured_points:10} };
  assert.match(render(assessment),/89,8\/100/);
  for(const score of [null,NaN,101,-1])assert.doesNotMatch(render({...assessment,score}),/role="progressbar"/);
  assert.doesNotMatch(render({...assessment,status:'not_scored',score:0}),/0\/100|role="progressbar"/);
});
test('only independently referenced accuracy is shown with sample count and source', () => {
  const html=render({ ...q, accuracy_assessment:{status:'measured',accuracy_pct:50,matched_count:2,reference_count:4,reference_source:'Fixture độc lập'} });
  assert.match(html,/Độ chính xác đối chứng: 50%/); assert.match(html,/2\/4 kết quả khớp đối chứng: Fixture độc lập/);
  assert.match(html,/Xác suất trả lời đúng: Chưa hiệu chuẩn/);
  const missingSource=render({ ...q, accuracy_assessment:{status:'measured',accuracy_pct:100,matched_count:4,reference_count:4} });
  assert.match(missingSource,/Độ chính xác đối chứng: Chưa đo/);
});
test('backend text is escaped and evidence links are encoded', () => {
  const html = render({ ...q, completed: [{ id: 'unsafe', label: '<script>alert(1)</script>', evidence_refs: ['" onclick="evil'] }] });
  assert.doesNotMatch(html, /<script>|onclick="evil/); assert.match(html, /&lt;script&gt;/);
});
test('verification appears below views and before expandable tables on desktop and mobile layout', () => {
  const html = renderToStaticMarkup(React.createElement(AnalystDashboard, { report: { charts: [], quality_assessment: q, result_sets: { a: { rows: [{ qty: 1 }], columns: ['qty'] } } } }));
  assert.ok(html.indexOf('data-dashboard-grid') < html.indexOf('data-analysis-quality'));
  assert.ok(html.indexOf('data-analysis-quality') < html.indexOf('Bảng dữ liệu'));
  assert.match(html, /grid-cols-1 lg:grid-cols-6/); assert.match(html, /grid-cols-1 md:grid-cols-2/);
});
