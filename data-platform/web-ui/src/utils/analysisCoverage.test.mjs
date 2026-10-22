import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coverageSummary, lensBadge, lensReason } from './analysisCoverage.mjs';

const base = { targets: { core: 4, diagnostic: 2, extended: 0 }, target_total: 6, effective_depth: 'deep', selection_origin: 'explicit' };

test('complete coverage reads as depth + views, no warning', () => {
  const s = coverageSummary({ analysis_coverage: { ...base, status: 'complete', rendered: { core: 4, diagnostic: 2 }, rendered_total: 6, lenses: [] } });
  assert.equal(s.tone, 'ok');
  assert.equal(s.label, 'Phân tích sâu · 6/6 góc nhìn');
  assert.deepEqual(s.roles.map(r => [r.role, r.rendered, r.target]), [['core', 4, 4], ['diagnostic', 2, 2]]);
});

test('honest data limitation is not worded as a wrong number; planning gap is distinct', () => {
  const lenses = [{ id: 'trend', role: 'core', kind: 'trend', status: 'rejected', reason: 'insufficient_periods', question: 'Diễn biến?' }];
  const limited = coverageSummary({ analysis_coverage: { ...base, status: 'limited', gap_kind: 'LIMITED_DATA', rendered: { core: 3, diagnostic: 2 }, rendered_total: 5, lenses } });
  assert.equal(limited.tone, 'limited');
  assert.match(limited.label, /5\/6 góc nhìn · giới hạn dữ liệu/);
  assert.match(limited.missing[0], /chưa đủ từ 2 kỳ/);
  const gap = coverageSummary({ analysis_coverage: { ...base, status: 'partial', gap_kind: 'PLANNING_GAP', rendered: { core: 3 }, rendered_total: 3, lenses: [] } });
  assert.equal(gap.tone, 'gap');
});

test('legacy reports are not evaluated (null), never a 0-chart failure', () => {
  assert.equal(coverageSummary({ charts: [] }), null);
  assert.equal(lensBadge({ chart_type: 'bar' }), null);
  assert.equal(lensBadge({ analysis_lens_role: 'diagnostic' }), 'Chẩn đoán');
  assert.equal(lensReason('unknown_code'), 'chưa đủ điều kiện');
});
