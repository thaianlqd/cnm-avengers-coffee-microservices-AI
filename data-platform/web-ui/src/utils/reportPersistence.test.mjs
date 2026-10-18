import assert from 'node:assert/strict';
import { test } from 'node:test';
import { savedV33Fields, reopenSavedReport, V33_SAVED_FIELDS } from './reportPersistence.mjs';

test('save keeps conclusion, caveats, forecasts, verification and view coverage; reopen restores them verbatim', () => {
  const report = { title: 'x', conclusion: { answer: 'A', findings: [{ statement: 's', evidence_id: 'e1' }], caveats: ['c'], actions: ['a'] },
    forecasts: [{ requirement_id: 'r1', status: 'ok' }], verification: { status: 'verified', metrics: [] },
    view_coverage: [{ kind: 'scalar', status: 'satisfied' }], short_answer: ['t'], analysis_mission: 'overview', secret_extra: 'dropped' };
  const kept = savedV33Fields(report);
  assert.deepEqual(Object.keys(kept).sort(), ['analysis_mission', 'conclusion', 'forecasts', 'short_answer', 'verification', 'view_coverage']);
  const reopened = reopenSavedReport(JSON.parse(JSON.stringify(kept)));
  assert.deepEqual(reopened.conclusion, report.conclusion);
  assert.deepEqual(reopened.verification, report.verification);
  assert.equal(reopened.secret_extra, undefined);
});

test('a legacy saved report without V3.3 fields reopens without inventing a conclusion or verification', () => {
  const reopened = reopenSavedReport({ title: 'cũ', quality_assessment: { status: 'verified', score: 80 } });
  assert.equal(reopened.conclusion, undefined);
  assert.equal(reopened.verification, undefined);
  assert.ok(V33_SAVED_FIELDS.includes('conclusion'));
});
