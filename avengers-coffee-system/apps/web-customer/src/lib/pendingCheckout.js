export const PENDING_CART_KEY = 'pending_cart_items';
export const CHECKOUT_DRAFT_KEY = 'avengers_checkout_draft';

export function savePendingCheckout({ cart, guestId, draft, local = localStorage, session = sessionStorage }) {
  // Snapshot every server row, including variants and custom attributes. The
  // idempotent server merge remains the only writer when signing in.
  try { local.setItem(PENDING_CART_KEY, JSON.stringify({ guestId, items: cart, savedAt: Date.now() })); } catch { /* Server cart remains available. */ }
  try { session.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(draft)); } catch { /* Keep navigation available. */ }
  try { session.setItem('post_login_redirect', 'cart'); } catch { /* URL also carries the return destination. */ }
}

export function checkoutDraft(storage = sessionStorage) {
  try {
    const draft = JSON.parse(storage.getItem(CHECKOUT_DRAFT_KEY) || 'null');
    return draft && typeof draft === 'object' && !Array.isArray(draft) ? draft : {};
  } catch { return {}; }
}

export function clearPendingCheckout(local = localStorage, session = sessionStorage) {
  try { local.removeItem(PENDING_CART_KEY); session.removeItem(CHECKOUT_DRAFT_KEY); } catch { /* Storage may be disabled. */ }
}
