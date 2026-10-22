export const CUSTOMER_IDLE_MS = 30 * 60 * 1000;
const KEY = 'customerLastActivityAt';

export function markCustomerActivity() {
  localStorage.setItem(KEY, String(Date.now()));
}

export function customerSessionExpired() {
  const timestamp = Number(localStorage.getItem(KEY));
  return !Number.isFinite(timestamp) || timestamp <= 0 || timestamp > Date.now()
    || Date.now() - timestamp >= CUSTOMER_IDLE_MS;
}

export function clearCustomerActivity() {
  localStorage.removeItem(KEY);
}
