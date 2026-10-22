import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleProductSelection, updateProductQuantity, selectionAction, initialChoices, toggleOption, missingChoices, configurationAction } from './customerChoices.js';
import { selectAgentTurn } from '../chat/agentTurn.js';
const coffee = { product_id: '38', product_name: 'Cà Phê Sữa Đá' };
const hot = { product_id: '39', product_name: 'Cà Phê Sữa Nóng' };
const item = { ...coffee, groups: [
  { name: 'Kích thước', field: 'size', required: true, values: ['Lớn', 'Vừa'] },
  { name: 'Topping', field: 'toppings', multiple: true, values: ['Hạt Sen', 'Foam'] },
  { name: 'Lượng đá', field: 'ice', values: ['Ít đá', 'Bình thường'] },
] };
test('selection quantities are independent, bounded and preserved by the batch request', () => {
  let selected = toggleProductSelection(toggleProductSelection([], coffee, 'snapshot'), hot, 'snapshot');
  selected = updateProductQuantity(selected, coffee, 3);
  selected = updateProductQuantity(selected, hot, 2);
  assert.deepEqual(selectionAction(selected).items, [{ product_id:'38',quantity:3 },{ product_id:'39',quantity:2 }]);
  for (const invalid of [0,-1,100,1.5,'2',NaN]) assert.equal(updateProductQuantity(selected, coffee, invalid), selected);
  assert.equal(updateProductQuantity(selected, coffee,99)[0].quantity,99);
});
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
test('optional single choices can be cleared and multi-select stays within the server limit', () => {
  let choices = toggleOption({}, item.groups[2], 'Ít đá');
  choices = toggleOption(choices, item.groups[2], 'Ít đá');
  assert.deepEqual(choices, {});
  const group = { field: 'toppings', multiple: true, values: Array.from({ length: 17 }, (_, i) => `Topping ${i}`) };
  for (const value of group.values) choices = toggleOption(choices, group, value);
  assert.equal(choices.toppings.length, 16);
});
test('retry identity binds every tick and batch member, while key order remains immaterial', () => {
  const request = { text: 'Áp dụng tùy chọn', sessionId: 'customer', conversationId: 'conversation', uiAction: { type: 'configure_products', snapshot: 'same', items: [{ product_id: '38', options: { size: 'Vừa', ice: 'Ít đá' } }] } };
  const first = selectAgentTurn(null, request, () => 'first');
  const reordered = { ...request, uiAction: { items: [{ options: { ice: 'Ít đá', size: 'Vừa' }, product_id: '38' }], snapshot: 'same', type: 'configure_products' } };
  assert.equal(selectAgentTurn(first, reordered, () => 'wrong').id, 'first');
  const different = { ...request, uiAction: { ...request.uiAction, items: [{ product_id: '38', options: { size: 'Lớn' } }] } };
  assert.equal(selectAgentTurn(first, different, () => 'second').id, 'second');
});
