// V3.2 report UI: chart insights (H), separate verification view (I/J) and
// honest verification language. Components are compiled with esbuild and
// rendered server-side, like the other workspace tests.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildSync } from 'esbuild';
import { mergeReconciliation, numericRows, rankingRows, verificationMetrics } from './verificationPresentation.mjs';

function component(relative, name) {
  const directory = mkdtempSync(join(tmpdir(), 'report-ui-'));
  try {
    const reactPath = dirname(createRequire(import.meta.url).resolve('react'));
    const compiled = buildSync({ entryPoints: [new URL(relative, import.meta.url).pathname], bundle: true, platform: 'node', format: 'cjs', write: false, alias: { react: reactPath }, external: [reactPath, `${reactPath}/*`] });
    const path = join(directory, 'component.cjs'); writeFileSync(path, compiled.outputFiles[0].contents);
    return createRequire(import.meta.url)(path)[name];
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));

const insight = { chart_id: 'visual_1', why_relevant: 'Trả lời trực tiếp yêu cầu: So sánh doanh thu giữa Hồ Chí Minh và Hà Nội.',
  what_it_shows: 'Doanh thu của 2 thành phố.', interpretation: 'Chênh lệch giữa nhóm cao nhất và thấp nhất là 61,4 triệu VND.',
  key_facts: [{ text: 'Hồ Chí Minh cao hơn Hà Nội 61,4 triệu VND (+60,5%) trong phạm vi đã chọn.', evidence_ref: 'q1:revenue:Hồ Chí Minh-Hà Nội' }],
  caveats: ['Kỳ cuối chưa đủ ngày (đánh dấu *).'], next_checks: ['Kiểm tra doanh thu tại Hà Nội (101,5 triệu VND).'] };
const verification = { version: '3.2.0', status: 'verified', independent_oracle: null, independent_oracle_label: 'Chưa đo đối chiếu độc lập',
  internal_completeness_label: 'Mức hoàn tất kiểm chứng nội bộ (không phải độ chính xác AI)',
  metrics: [{ id: 'numeric_reconciliation', label: 'Đối chiếu số liệu độc lập', passed: 0, total: 0 }, { id: 'ranking_reconciliation', label: 'Đối chiếu xếp hạng', passed: 0, total: 0 },
    { id: 'requirement_coverage', label: 'Yêu cầu được đáp ứng', passed: 1, total: 1 }, { id: 'grounded_claims', label: 'Nhận định có bằng chứng', passed: 3, total: 3 },
    { id: 'chart_relevance', label: 'Biểu đồ đúng yêu cầu', passed: 2, total: 2 }],
  numeric: [], ranking: [], trend: [], forecast_backtest: [], grounding: { chart_numeric_claims: 3, chart_numeric_matched: 3, narrative_claims: 0, narrative_claims_with_evidence: 0, unsupported_claims: [], causal_language: [] },
  chart_relevance: { total: 2, passed: 2, charts: [] }, snapshot: { registry_fingerprint: 'abcdef1234567890', reference_date: '2026-10-16' }, methodology: ['Không dùng AI để chấm AI.'] };

test('H · every chart card renders "Nhận định từ biểu đồ" with why/facts/caveats/next checks', () => {
  const { ChartInsight } = { ChartInsight: component('../components/report/ChartInsight.tsx', 'ChartInsight') };
  const html = render(ChartInsight, { insight });
  for (const text of ['Nhận định từ biểu đồ', 'Vì sao có biểu đồ này', '+60,5%', 'Lưu ý', 'Điểm nên kiểm tra tiếp']) assert.ok(html.includes(text), text);
  assert.ok(html.includes('data-insight-fact="q1:revenue:Hồ Chí Minh-Hà Nội"'));
  assert.equal(render(ChartInsight, {}), '');
  const Views = component('../components/AnalystDashboardSummary.tsx', 'AnalystViews');
  const card = render(Views, { compact: true, charts: [{ id: 'visual_1', chart_type: 'bar', title: 'Doanh thu theo thành phố', requirement_id: 'r1', requirement_goal: 'So sánh', relevance_role: 'primary',
    data: [{ label: 'Hồ Chí Minh', value: 162.9 }, { label: 'Hà Nội', value: 101.5 }], insight }] });
  assert.ok(card.includes('data-chart-insight')); assert.ok(card.includes('Nguồn &amp; phạm vi'));
});

test('J · report tab shows the short answer first; verification is a separate tab', () => {
  const Dashboard = component('../components/AnalystDashboardSummary.tsx', 'AnalystDashboard');
  const report = { session_id: 's1', short_answer: ['Hồ Chí Minh cao hơn Hà Nội 61,4 triệu VND (+60,5%) trong phạm vi đã chọn.'], verification, charts: [], quality_assessment: { status: 'verified', score: 86.8, score_method: { id: 'verification_evidence_v3', unmeasured_points: 10 } } };
  const main = render(Dashboard, { report });
  assert.ok(main.indexOf('Trả lời ngắn') < main.indexOf('Các góc nhìn phân tích'));
  for (const label of ['Báo cáo', 'Kiểm chứng &amp; nguồn', 'Dữ liệu / SQL', 'Lưu &amp; xuất']) assert.ok(main.includes(label), label);
  assert.ok(!main.includes('86,8/100')); assert.ok(!main.includes('data-verification-panel'));
  const tab = render(Dashboard, { report, initialTab: 'verification' });
  assert.ok(tab.includes('data-verification-panel')); assert.ok(tab.includes('Chưa đo đối chiếu độc lập'));
  assert.ok(tab.includes('Chạy đối chiếu độc lập (0 lượt AI)'));
  assert.ok(tab.includes('Mức hoàn tất kiểm chứng nội bộ (không phải độ chính xác AI)'));
});

test('I · no blended "AI accuracy"; internal score is labelled as completeness', () => {
  const Panel = component('../components/report/VerificationPanel.tsx', 'VerificationPanel');
  const html = render(Panel, { report: { verification, quality_assessment: { status: 'verified', score: 86.8, score_method: { id: 'verification_evidence_v3', unmeasured_points: 10, interpretation: 'x' } } } });
  assert.ok(!/Độ chính xác AI|AI accuracy|Xác suất trả lời đúng: \d/.test(html));
  assert.ok(html.includes('không gộp chúng thành một “độ chính xác AI”'));
  const Quality = component('../components/AnalysisQualityScore.tsx', 'AnalysisQualityScore');
  const q = render(Quality, { assessment: { status: 'verified', score: 86.8, score_method: { id: 'verification_evidence_v3', unmeasured_points: 10, interpretation: 'x' } } });
  assert.ok(q.includes('Mức hoàn tất kiểm chứng')); assert.ok(!q.includes('Điểm kiểm chứng tổng')); assert.ok(!q.includes('Kiểm chứng &amp; độ chính xác'));
});

test('on-demand oracle merges into separate metrics and shows mismatches honestly', () => {
  const oracle = { independent_oracle: { matched: 1, eligible: 2, accuracy_pct: 50 }, numeric: [
    { label: 'Tổng doanh thu', status: 'matched', expected_value: 100, reported_value: 100, absolute_error: 0 },
    { label: 'Tổng số đơn', status: 'mismatch', expected_value: 10, reported_value: 11, absolute_error: 1 }],
    ranking: [{ status: 'matched', k: 2, precision: 1, jaccard: 1, order_agreement: true, kendall_tau: null }, { status: 'not_measured', reason: 'population_over_oracle_limit' }] };
  const merged = mergeReconciliation(verification, oracle);
  const metrics = Object.fromEntries(verificationMetrics(merged).map(m => [m.id, m]));
  assert.equal(metrics.numeric_reconciliation.text, '1/2'); assert.equal(metrics.numeric_reconciliation.tone, 'amber');
  assert.equal(metrics.ranking_reconciliation.text, '1/1');
  assert.equal(merged.independent_oracle_label, '50% trên 2 phép đối chiếu số liệu');
  assert.deepEqual(numericRows(merged).map(r => r.status), ['Khớp', 'Lệch']);
  assert.deepEqual(rankingRows(merged).map(r => r.status), ['Khớp', 'Chưa đo']);
  assert.equal(mergeReconciliation(verification, null).independent_oracle_label, 'Chưa đo đối chiếu độc lập');
});

test('risk visuals use the governed threshold with traffic-light tones, focusable rows', () => {
  const Chart = component('../components/Charts.tsx', 'AnalystChart');
  const riskTone = component('../components/Charts.tsx', 'riskTone');
  const threshold = { value: 8, operator: 'gt', margin: 2, label: 'tỷ lệ hủy đơn cao', symbol: '>' };
  assert.equal(riskTone(9, threshold), 'red'); assert.equal(riskTone(7, threshold), 'amber'); assert.equal(riskTone(3, threshold), 'green');
  assert.equal(riskTone(3, null), null);
  const html = render(Chart, { chart: { chart_type: 'bar', unit: '%', risk_threshold: threshold, data: [{ label: 'Kiosk A', value: 12 }, { label: 'Kiosk B', value: 2 }] } });
  assert.ok(html.includes('data-risk-threshold')); assert.ok(html.includes('data-risk-tone="red"')); assert.ok(html.includes('data-risk-tone="green"'));
  assert.ok(html.includes('vượt ngưỡng')); assert.ok(html.includes('tabindex="0"'));
});

test('Risk Watch summary: status, highest-risk entities and deterministic drill-downs', async () => {
  const { riskSummary } = await import('./workspacePresentation.mjs');
  const result = { signals: [
    { id: 'c', label: 'Tỷ lệ hủy đơn cao', metric_label: 'Tỷ lệ hủy đơn', unit: '%', status: 'green', bad_direction: 'above', historical: true,
      breakdown: { dimension_label: 'Chi nhánh', groups_in_breach: 2, worst: [{ group: 'Kiosk A', value: 12.5 }, { group: 'Kiosk B', value: 9 }] } },
    { id: 'd', label: 'Tỷ lệ giao thành công thấp', metric_label: 'Tỷ lệ giao thành công', unit: '%', status: 'green', breakdown: { groups_in_breach: 0, worst: [] } }] };
  const s = riskSummary(result);
  assert.equal(s.headline, 'Toàn phạm vi trong ngưỡng nhưng có nhóm vượt ngưỡng');
  assert.deepEqual(s.entities.map(e => e.label), ['Kiosk A', 'Kiosk B']);
  assert.deepEqual(s.followUps.map(f => f.mission), ['ranking', 'trend']);
  assert.ok(!s.followUps.some(f => /doanh thu|sản phẩm/i.test(f.text)));  // never generic sales charts
  const Table = component('../components/workspace/RiskSignalTable.tsx', 'RiskSignalTable');
  const html = render(Table, { result, onAsk: () => {} });
  assert.ok(html.includes('data-risk-summary')); assert.ok(html.includes('Điểm nên kiểm tra tiếp'));
});

test('failure card tells the user at which stage it failed (§117), without internals', async () => {
  const { analysisFailureStage } = await import('./analysisPresentation.mjs');
  assert.equal(analysisFailureStage({ analysis_stage: 'PROVIDER_QUOTA_FAILURE' }), 'Hạn mức dịch vụ AI');
  assert.equal(analysisFailureStage({ failure: { analysis_stage: 'SEMANTIC_CONTRACT_FAILURE' } }), 'Đối chiếu danh mục dữ liệu');
  assert.equal(analysisFailureStage({}), null);
  const Card = component('../components/AnalysisClarification.tsx', 'AnalysisClarification');
  const html = render(Card, { response: { status: 'error', analysis_stage: 'PRECHECK_FAILURE', message: 'x' } });
  assert.ok(html.includes('Giai đoạn: Kiểm tra trước khi gửi'));
});
