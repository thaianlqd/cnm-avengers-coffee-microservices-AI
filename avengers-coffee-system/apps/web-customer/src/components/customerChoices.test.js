import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleProductSelection, selectionAction, initialChoices, toggleOption, missingChoices, configurationAction } from './customerChoices.js';
import { selectAgentTurn } from './agentTurn.js';
const coffee = { product_id: '38', product_name: 'Cà Phê Sữa Đá' };
const hot = { product_id: '39', product_name: 'Cà Phê Sữa Nóng' };
const item = { ...coffee, groups: [
  { name: 'Kích thước', field: 'size', required: true, values: ['Lớn', 'Vừa'] },
  { name: 'Topping', field: 'toppings', multiple: true, values: ['Hạt Sen', 'Foam'] },
  { name: 'Lượng đá', field: 'ice', values: ['Ít đá', 'Bình thường'] },
] };
test('plus queues/removes products and a single batch keeps canonical IDs and quantities', () => {
  let selected = toggleProductSelection([], coffee, 'snapshot');
  selected = toggleProductSelection(selected, hot, 'snapshot');
  assert.deepEqual(selectionAction(selected).items, [{ product_id: '38', quantity: 1 }, { product_id: '39', quantity: 1 }]);
  assert.equal(toggleProductSelection(selected, coffee, 'snapshot').length, 1);
});
test('new catalog replaces stale selection and never combines different ordinal spaces', () => {
  const old = toggleProductSelection([], coffee, 'old');
  assert.equal(toggleProductSelection(old, hot, 'new').length, 1);
  assert.throws(() => selectionAction([...old, { ...hot, snapshot: 'new' }]));
});
test('required size stays unselected; topping supports multi-select with no automatic paid extras', () => {
  let choices = initialChoices(item);
  assert.deepEqual(choices, {});
  assert.deepEqual(missingChoices(item, choices), ['Kích thước']);
  choices = toggleOption(choices, item.groups[0], 'Vừa');
  choices = toggleOption(choices, item.groups[1], 'Hạt Sen');
  choices = toggleOption(choices, item.groups[1], 'Foam');
  choices = toggleOption(choices, item.groups[1], 'Hạt Sen');
  assert.deepEqual(choices.toppings, ['Foam']);
  assert.deepEqual(missingChoices(item, choices), []);
  assert.deepEqual(toggleOption(choices, item.groups[0], 'INVALID'), choices);
});
test('explicit defaults discard unsubmitted drafts; normal submit retains choices and quantity', () => {
  const config = { snapshot: 'options', items: [item] };
  const drafts = { '38': { quantity: 2, choices: { size: 'Vừa', toppings: ['Foam'] } } };
  assert.deepEqual(configurationAction(config, drafts).items[0].options, drafts['38'].choices);
  assert.deepEqual(configurationAction(config, drafts, true).items[0], { product_id: '38', quantity: 2, options: {}, use_defaults: true });
});
test('retry identity binds every tick and batch member, while key order remains immaterial', () => {
  const request = { text: 'Áp dụng tùy chọn', sessionId: 'customer', conversationId: 'conversation', uiAction: { type: 'configure_products', snapshot: 'same', items: [{ product_id: '38', options: { size: 'Vừa', ice: 'Ít đá' } }] } };
  const first = selectAgentTurn(null, request, () => 'first');
  const reordered = { ...request, uiAction: { items: [{ options: { ice: 'Ít đá', size: 'Vừa' }, product_id: '38' }], snapshot: 'same', type: 'configure_products' } };
  assert.equal(selectAgentTurn(first, reordered, () => 'wrong').id, 'first');
  const different = { ...request, uiAction: { ...request.uiAction, items: [{ product_id: '38', options: { size: 'Lớn' } }] } };
  assert.equal(selectAgentTurn(first, different, () => 'second').id, 'second');
});
