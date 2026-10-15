import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmedCart } from './cartReconciliation.js';
const cart = (version, owner = 'alice') => ({ user_id: owner, cart_version: version, items: [{ id: 'line', so_luong: version, gia_ban: 45000 }] });
test('publishes server prices and quantities from direct and nested responses', () => {
  assert.deepEqual(confirmedCart(cart(3), 'alice', cart(2)), cart(3));
  assert.deepEqual(confirmedCart({ cart: cart(4) }, 'alice', cart(3)), cart(4));
});
test('late writes never roll back a newer confirmed cart', () => {
  assert.deepEqual(confirmedCart(cart(2), 'alice', cart(4)), cart(4));
});
test('wrong owner and partial legacy responses require a scoped refetch', () => {
  for (const response of [cart(3, 'bob'), { items: [] }, { user_id: 'alice', items: [], cart_version: NaN }, null]) assert.equal(confirmedCart(response, 'alice', cart(2)), null);
});
test('confirmed clear response empties cart and remains versioned', () => {
  const empty = { ...cart(5), items: [] };
  assert.deepEqual(confirmedCart(empty, 'alice', cart(4)), empty);
});
