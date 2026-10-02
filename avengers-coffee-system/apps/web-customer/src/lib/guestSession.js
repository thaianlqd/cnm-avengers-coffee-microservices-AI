export const GUEST_CART_KEY = 'avengers_guest_cart_id';
export const GUEST_MERGE_KEY = 'avengers_guest_cart_merge';
export const isGuestSessionId = value => /^anon-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
export const accountId = user => user?.ma_nguoi_dung || user?.maNguoiDung || user?.id || null;

export function newSecureId(cryptoApi = globalThis.crypto) {
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  if (!cryptoApi?.getRandomValues) throw new Error('Secure sessions require Web Crypto');
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getGuestSessionId(storage = localStorage, cryptoApi = globalThis.crypto) {
  const existing = storage.getItem(GUEST_CART_KEY);
  if (isGuestSessionId(existing)) return existing;
  const created = `anon-${newSecureId(cryptoApi)}`;
  storage.setItem(GUEST_CART_KEY, created);
  return created;
}

export const cartRequestConfig = owner => isGuestSessionId(owner) ? { guestSessionId: owner } : {};
export const chatStorageKey = (key, owner) => `${key}:${owner}`;

export async function mergeGuestCartOnLogin({ guestId, userId, storage, post, newId = newSecureId }) {
  if (!isGuestSessionId(guestId) || !userId || isGuestSessionId(userId)) return null;
  let pending;
  try { pending = JSON.parse(storage.getItem(GUEST_MERGE_KEY) || 'null'); } catch { /* use a new operation */ }
  if (pending && pending.userId !== userId) {
    throw new Error('Giỏ khách đang chờ đồng bộ với tài khoản trước. Hãy đăng nhập tài khoản đó để kiểm tra lại.');
  }
  if (!pending || pending.guestId !== guestId) pending = { guestId, userId, operationId: newId() };
  storage.setItem(GUEST_MERGE_KEY, JSON.stringify(pending));
  // Keep this operation on network failure. A retry after a committed merge
  // observes the same result instead of adding the source quantities again.
  const response = await post('/cart/merge-guest', { guest_session_id: guestId }, {
    headers: { 'X-Guest-Session-Id': guestId, 'X-Idempotency-Key': pending.operationId },
  });
  storage.removeItem(GUEST_MERGE_KEY);
  return response.data || response;
}
