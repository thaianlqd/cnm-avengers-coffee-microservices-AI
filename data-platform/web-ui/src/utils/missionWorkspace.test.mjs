// V3.2 mission workspace: incident regressions on the UI side (gibberish
// label, mission switch, mission mismatch fix, guided contract invalidation,
// mission-specific controls). Capabilities come from the backend fixture.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { switchMissionDraft, missionControls, buildGuided, guidedActive, workspaceRequestFields, detectedScope,
  depthOptions, defaultSlots, periodOptions, dimensionValues, inspectedGroupDraft, sourceAnalysisPayload } from './missionWorkspace.mjs';
import { preflightView, applyFix } from './preflightPresentation.mjs';

const caps = JSON.parse(readFileSync(new URL('../../../analytics-api/tests/fixtures/capabilities_v31.json', import.meta.url), 'utf8'));

test('A · gibberish is shown as blocked/unrecognized, never "valid"', () => {
  const v = preflightView({ status: 'blocked', state: 'BLOCKED', state_label: 'Chưa nhận ra bài toán phân tích', can_submit: false,
    understood: {}, findings: [{ level: 'block', code: 'unrecognized_question', message: 'Chưa nhận ra nội dung phân tích dữ liệu trong câu hỏi.', fixes: [] }] });
  assert.equal(v.blocked, true); assert.equal(v.tone, 'red');
  assert.equal(v.label, 'Chưa nhận ra bài toán phân tích');
  assert.ok(!JSON.stringify(v).includes('Câu hỏi hợp lệ'));
  // Even an old server response without state never says "hợp lệ".
  assert.ok(!preflightView({ status: 'ok', can_submit: true, understood: {}, findings: [] }).label.includes('hợp lệ'));
  assert.equal(preflightView({ status: 'ok', can_submit: true, understood: {}, findings: [] }).label, 'Có thể gửi để AI diễn giải');
  assert.equal(preflightView({ status: 'ok', state: 'READY_GUIDED', can_submit: true, understood: {}, findings: [] }).tone, 'emerald');
});

test('E · canonical metric chip has no "+N chỉ số cùng tên"', () => {
  const v = preflightView({ status: 'ok', state: 'READY_FOR_AI', can_submit: true, findings: [],
    understood: { metrics: [{ label: 'Doanh thu', canonical: true, alternatives: [], specialized: [{}, {}, {}, {}, {}] }] } });
  assert.equal(v.chips[0].hint, 'chỉ số chuẩn');
  assert.ok(!JSON.stringify(v).includes('cùng tên'));
});

test('B · mission switch never carries the old question; each mission keeps its own draft', () => {
  const compareQ = 'So sánh doanh thu theo tỉnh/thành trong dữ liệu giữa Hồ Chí Minh và Hà Nội tháng 9 năm 2026';
  const toRanking = switchMissionDraft({}, 'compare', 'ranking', { prompt: compareQ, guided: null });
  assert.equal(toRanking.prompt, ''); assert.equal(toRanking.guided, null);
  assert.deepEqual(toRanking.reset, { preflight: true, risk: true, plan: true, report: true, clarification: true });
  const back = switchMissionDraft(toRanking.drafts, 'ranking', 'compare', { prompt: 'Top 5 chi nhánh', guided: null });
  assert.equal(back.prompt, compareQ);
  assert.equal(switchMissionDraft(back.drafts, 'compare', 'ranking', { prompt: compareQ }).prompt, 'Top 5 chi nhánh');
  assert.equal(switchMissionDraft({}, null, 'trend', { prompt: 'câu tự do' }).prompt, '');
});

test('§25 · mission mismatch quick fix switches mission and keeps the question', () => {
  assert.deepEqual(applyFix('So sánh A và B', { kind: 'switch_mission', mission: 'compare' }), { mission: 'compare', question: 'So sánh A và B' });
  assert.deepEqual(applyFix('So sánh A và B', { kind: 'rewrite_for_mission', mission: 'ranking' }), { question: '' });
});

test('C · each mission exposes only its governed controls', () => {
  const ids = m => missionControls(caps, m).map(c => c.id);
  assert.deepEqual(ids('compare'), ['metric', 'dimension', 'group_a', 'group_b', 'time', 'scope']);
  assert.deepEqual(ids('ranking'), ['direction', 'n', 'metric', 'dimension', 'time', 'scope']);
  assert.deepEqual(ids('trend'), ['metric', 'granularity', 'time', 'scope']);
  assert.deepEqual(ids('forecast'), ['metric', 'horizon', 'cadence', 'scope']);
  assert.deepEqual(ids('risk_watch'), ['signals', 'time', 'scope']);
  assert.deepEqual(ids('relationship'), ['metric', 'metric_b', 'dimension', 'time']);
  assert.ok(!ids('risk_watch').includes('metric'));  // Risk Watch never offers a generic product metric
});

test('F · guided forecast builds canonical IDs, not text for AI to rediscover', () => {
  const g = buildGuided(caps, 'forecast', { ...defaultSlots(caps, 'forecast'), metric: 'revenue', horizon: 3, cadence: 'month' });
  assert.equal(g.ready, true);
  assert.deepEqual(g.contract, { metric: 'revenue', horizon: 3, cadence: 'month' });
  assert.equal(g.question, 'Dự báo doanh thu 3 tháng tới');
  assert.deepEqual(workspaceRequestFields({ ...g, mission: 'forecast' }, g.question),
    { input_mode: 'guided', guided_contract: { metric: 'revenue', horizon: 3, cadence: 'month' }, allow_deterministic_upgrade: true });
});

test('§10 · editing the generated question invalidates the guided contract', () => {
  const g = buildGuided(caps, 'forecast', { ...defaultSlots(caps, 'forecast'), metric: 'revenue', horizon: 3, cadence: 'month' });
  assert.equal(guidedActive(g, g.question), true);
  assert.equal(guidedActive(g, g.question + ' theo chi nhánh'), false);
  assert.equal(workspaceRequestFields(g, 'Dự báo doanh thu 3 tháng tới theo chi nhánh').input_mode, 'free_text');
});

test('compare cannot submit until A and B are valid and different', () => {
  const base = { ...defaultSlots(caps, 'compare'), metric: 'revenue', dimension: 'city' };
  assert.equal(buildGuided(caps, 'compare', base).ready, false);
  assert.equal(buildGuided(caps, 'compare', { ...base, group_a: 'Hà Nội', group_b: 'Hà Nội' }).ready, false);
  const ok = buildGuided(caps, 'compare', { ...base, group_a: 'Hồ Chí Minh', group_b: 'Hà Nội', period: '2026-09' });
  assert.equal(ok.ready, true);
  assert.deepEqual(ok.time, { mode: 'custom', start: '2026-09-01', end: '2026-09-30' });
  assert.match(ok.question, /^So sánh doanh thu theo tỉnh\/thành trong dữ liệu giữa Hồ Chí Minh và Hà Nội tháng 9 năm 2026$/);
  assert.ok(dimensionValues(caps, 'store_type').every(v => v.value && v.label));
  assert.ok(periodOptions(caps).some(p => p.id === 'all_time'));
});

test('scope is recognized from the question; depth options explain their budget', () => {
  assert.equal(detectedScope(null).summary, 'Toàn hệ thống (chưa nêu phạm vi trong câu hỏi)');
  const d = detectedScope({ understood: { filters: [{ label: 'Loại điểm bán', display: 'Kiosk vệ tinh' }], dimensions: [] } });
  assert.equal(d.summary, 'Loại điểm bán: Kiosk vệ tinh');
  const depths = depthOptions(caps);
  assert.deepEqual(depths.map(x => x.id), ['focused', 'deep', 'comprehensive']);
  assert.ok(depths.every(x => x.description && x.description.length > 20));
  // FINAL 2026-10-19: one governed policy — 4 core / +2 diagnostic / +2 extended views (focused also plans core lenses).
  assert.deepEqual(depths.map(x => Object.values(x.view_targets).reduce((a, b) => a + b, 0)), [4, 6, 8]);
  assert.ok(depths.every(x => /góc nhìn/.test(x.description)));
  assert.ok(depths[2].max_supporting_operations > depths[1].max_supporting_operations - 1);
  assert.ok(depths[2].max_segment_dimensions > depths[1].max_segment_dimensions);
});

test('V3.3: semantic edits invalidate plan/report and reset clears all active state', async () => {
  const { invalidationFor, isCurrentEpoch, resetActive } = await import('./missionWorkspace.mjs');
  for (const k of ['mission', 'prompt', 'guided', 'time', 'start', 'end', 'scope', 'depth']) assert.equal(invalidationFor({ [k]: 1 }).invalidate, true, k);
  assert.equal(invalidationFor({}).invalidate, false);
  assert.equal(isCurrentEpoch(3, 3), true); assert.equal(isCurrentEpoch(3, 4), false);
  const s = resetActive(5);
  assert.equal(s.epoch, 6); assert.equal(s.plan, null); assert.equal(s.report, null); assert.equal(s.step, 1); assert.deepEqual(s.versions, []);
});

test('V3.3: a clarification choice edits the question deterministically (no auto-submit concatenation)', async () => {
  const { applyClarificationChoice } = await import('./missionWorkspace.mjs');
  assert.equal(applyClarificationChoice('Top 5 chi nhánh tháng 9?', 'Theo Doanh thu'), 'Top 5 chi nhánh tháng 9, theo Doanh thu');
  assert.equal(applyClarificationChoice('Top 5 chi nhánh tháng 9, theo doanh thu', 'Theo Doanh thu'), 'Top 5 chi nhánh tháng 9, theo doanh thu');
  assert.equal(applyClarificationChoice('', 'Theo Doanh thu'), 'Theo Doanh thu');
  assert.equal(applyClarificationChoice('Doanh thu.', ''), 'Doanh thu');
});


test('artifact group action retains exact typed scope and original period, with no client totals', () => {
  const metric = caps.metrics.find(m => m.id === 'revenue');
  const chart = { metric: 'revenue', query_id: 'q1' };
  const row = { value: 999, entity_ref: { query_id: 'q1', filters: { city: 'Hà Nội' } } };
  const report = { session_id: 'owned-session', revision: 3,
    analytical_queries: [{ id: 'q1', metrics: ['revenue'], group_by: ['city'], filters: [{ dimension: 'city', operator: 'in', value: ['Hà Nội', 'Hồ Chí Minh'] }] }],
    analysis_explanation: [{ query_id: 'q1', period: { start: '2026-09-01', end: '2026-09-30' } }],
    result_sets: { q1: { artifact_ref: { artifact_id: 'immutable-artifact' }, rows: [{ revenue: 999 }] } } };
  const before = JSON.stringify(report);
  const draft = inspectedGroupDraft(report, chart, row, caps);
  assert.deepEqual(draft.scope, { mode: 'selected', filters: [{ dimension: 'city', operator: 'eq', value: 'Hà Nội' }] });
  assert.deepEqual(draft.time, { mode: 'custom', start: '2026-09-01', end: '2026-09-30' });
  assert.deepEqual(workspaceRequestFields(draft.guided, draft.question).guided_contract, { metric: 'revenue' });
  assert.equal(draft.source.artifact_id, 'immutable-artifact');
  assert.deepEqual(draft.source.filters,{city:'Hà Nội'});
  const input={question:draft.question,guided:draft.guided,scope:draft.scope,time:draft.time};
  assert.deepEqual(sourceAnalysisPayload(draft,input).source_analysis,draft.source);
  for (const change of [{question:'Câu hỏi khác'},{guided:{contract:{metric:'order_count'}}},
      {scope:{mode:'all',filters:[]}},{time:{...draft.time,start:'2026-08-01'}},{moduleId:'different-module'}]) {
    assert.deepEqual(sourceAnalysisPayload(draft,{...input,...change}),{});
  }
  assert.ok(draft.question.includes(metric.label.toLocaleLowerCase('vi-VN')));
  assert.ok(!JSON.stringify(draft).includes('999'));
  assert.equal(JSON.stringify(report), before);
  for (const invalid of [null, 'Đà Nẵng']) {
    assert.equal(inspectedGroupDraft(report, chart, { entity_ref: { query_id: 'q1', filters: { city: invalid } } }, caps), null);
  }
  assert.equal(inspectedGroupDraft(report, { ...chart, query_id: 'other' }, row, caps), null);
  assert.equal(inspectedGroupDraft({ ...report, analysis_explanation: [] }, chart, row, caps), null);
  assert.equal(inspectedGroupDraft({ ...report, analysis_explanation: [{ query_id: 'q1', period: { start: '2026-02-30', end: '2026-09-30' } }] }, chart, row, caps), null);
});
