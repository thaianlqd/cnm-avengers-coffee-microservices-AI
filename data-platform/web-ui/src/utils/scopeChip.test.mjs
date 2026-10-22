import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeChip } from './analystDashboardLayout.mjs';

test('I01 scope chip names the cohort or the whole-scope benchmark', () => {
  assert.deepEqual(scopeChip({ population_scope: 'ranked_cohort', cohort_label: 'Bottom 5' }), { tone: 'cohort', text: 'Trong Bottom 5' });
  assert.equal(scopeChip({ population_scope: 'scope_benchmark', cohort_label: 'Top 3' }).text, 'Toàn phạm vi · không riêng Top 3');
  assert.equal(scopeChip({}), null);
});
