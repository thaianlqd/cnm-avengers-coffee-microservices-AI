import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { getGuestSessionId, isGuestSessionId, chatStorageKey, cartRequestConfig, mergeGuestCartOnLogin, GUEST_MERGE_KEY } from './guestSession.js';
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
test('cart and chat share a strong guest identity across reloads', () => {
  const store = storage();
  const cartOwner = getGuestSessionId(store, webcrypto);
  assert.ok(isGuestSessionId(cartOwner));
  assert.equal(getGuestSessionId(store, webcrypto), cartOwner);
  assert.deepEqual(cartRequestConfig(cartOwner), { guestSessionId: cartOwner });
  assert.deepEqual(cartRequestConfig('account'), {});
  assert.notEqual(chatStorageKey('chat', cartOwner), chatStorageKey('chat', 'account'));
});
test('insecure legacy guest identifiers are replaced and Web Crypto is required', () => {
  const store = storage(); store.setItem('avengers_guest_cart_id', 'anon-123');
  assert.ok(isGuestSessionId(getGuestSessionId(store, webcrypto)));
  assert.throws(() => getGuestSessionId(storage(), {}), /Web Crypto/);
});
test('merge sends source capability with the account request and leaves guest id stable', async () => {
  const store = storage(), guestId = getGuestSessionId(store, webcrypto);
  const result = await mergeGuestCartOnLogin({ guestId, userId: 'account', storage: store, newId: () => 'op-1', post: async (path, body, config) => {
    assert.equal(path, '/cart/merge-guest'); assert.equal(body.guest_session_id, guestId);
    assert.equal(config.headers['X-Guest-Session-Id'], guestId);
    assert.equal(config.headers['X-Idempotency-Key'], 'op-1');
    assert.equal(config.guestSessionId, undefined); // account JWT must be retained on handoff
    return { data: { user_id: 'account', items: [{ quantity: 2 }] } };
  } });
  assert.equal(result.items[0].quantity, 2); assert.equal(store.getItem(GUEST_MERGE_KEY), null);
  assert.equal(getGuestSessionId(store, webcrypto), guestId);
});
test('response loss preserves handoff identity; reload retries the same operation without duplicate quantity', async () => {
  const store = storage(), guestId = getGuestSessionId(store, webcrypto), seen = new Set();
  let quantity = 1, requests = 0;
  const post = async (_path, _body, config) => {
    const op = config.headers['X-Idempotency-Key'];
    if (!seen.has(op)) { quantity += 2; seen.add(op); }
    requests++;
    if (requests === 1) throw new Error('response lost');
    return { data: { items: [{ quantity }] } };
  };
  const options = { guestId, userId: 'account', storage: store, newId: () => 'stable-op', post };
  await assert.rejects(mergeGuestCartOnLogin(options), /lost/);
  assert.ok(store.getItem(GUEST_MERGE_KEY));
  const result = await mergeGuestCartOnLogin({ ...options, newId: () => { throw Error('must reuse operation'); } });
  assert.equal(result.items[0].quantity, 3); assert.equal(seen.size, 1);
  assert.equal(store.getItem(GUEST_MERGE_KEY), null);
});
test('failed handoff cannot be silently replayed against a different account', async () => {
  const store = storage(), guestId = getGuestSessionId(store, webcrypto);
  await assert.rejects(mergeGuestCartOnLogin({ guestId, userId: 'a', storage: store, newId: () => 'op', post: async () => { throw Error('offline'); } }));
  await assert.rejects(mergeGuestCartOnLogin({ guestId, userId: 'b', storage: store, post: async () => { assert.fail('wrong account'); } }), /tài khoản trước/);
  assert.ok(store.getItem(GUEST_MERGE_KEY));
});
