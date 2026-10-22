import test from 'node:test';
import assert from 'node:assert/strict';
import { hubPublishDraft, canPublishToHub, isHubProblem } from './hubProblems.mjs';

test('suggestion prefills a known group and keeps an unknown one as a new group', () => {
  const known = hubPublishDraft({ suggested_title: 'Giao hàng', suggested_category: 'Vận hành', categories: ['Kinh doanh', 'Vận hành'], suggested_description: 'Theo dõi' });
  assert.deepEqual(known, { title: 'Giao hàng', category: 'Vận hành', newCategory: '', description: 'Theo dõi' });
  const unknown = hubPublishDraft({ suggested_title: 'X', suggested_category: 'Marketing', categories: ['Kinh doanh'] });
  assert.equal(unknown.category, '__new'); assert.equal(unknown.newCategory, 'Marketing');
});

test('only verified saved reports can be published, never a hub problem itself', () => {
  assert.equal(canPublishToHub({ category: 'ai_module', module_config: { semantic_intent: { requirements: [{ id: 'a' }] } } }), true);
  assert.equal(canPublishToHub({ category: 'sales', module_config: null }), false);
  assert.equal(canPublishToHub({ category: 'hub_problem', module_config: { semantic_intent: { requirements: [{}] } } }), false);
  assert.equal(isHubProblem({ category: 'hub_problem' }), true);
});
