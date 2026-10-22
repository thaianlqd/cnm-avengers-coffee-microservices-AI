import assert from 'node:assert/strict';
import { test } from 'node:test';
import { savedV33Fields, reopenSavedReport, V33_SAVED_FIELDS, savedReportOwnership } from './reportPersistence.mjs';

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

test('P6 save/reopen retains depth, filters, drill and immutable policy/catalog/snapshot identity', () => {
  const report={analysis_breadth:'comprehensive',revision:4,session_id:'s',
    interaction_state:{filters:[{dimension_id:'entity_id',operator:'eq',values:[{type:'string',value:'id-1'}]}],
      drill_path:[{selection:{dimension_id:'parent'},target_dimension_id:'child'}]},
    interaction_contract:{revision:4,catalog_fingerprint:'catalog-old',access_fingerprint:'scope-old',snapshot_fingerprint:'snapshot-old'},
    provenance:{registry_fingerprint:'registry-old',data_epoch:{fingerprint:'epoch-old'}},
    verification:{snapshot:{reference_date:'2026-08-15',metric_definitions:{weighted:'old definition'}}}};
  const restored=reopenSavedReport(JSON.parse(JSON.stringify(savedV33Fields(report))));
  for(const key of Object.keys(report))assert.deepEqual(restored[key],report[key]);
});


test('legacy ownership is disclosed without publishing raw actor IDs or unverified claims', () => {
  assert.deepEqual(savedReportOwnership({ created_by: 'account:' + 'a'.repeat(64) }), { owned: true, label: 'Báo cáo cá nhân' });
  for (const report of [{}, { created_by: 'client-spoof' }, { owner_type: 'legacy' }]) {
    assert.equal(savedReportOwnership(report).owned, false);
    assert.match(savedReportOwnership(report).label, /chỉ đọc, chưa xác minh/);
  }
});
