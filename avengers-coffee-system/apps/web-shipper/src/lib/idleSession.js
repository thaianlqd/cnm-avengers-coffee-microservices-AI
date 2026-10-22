export const SHIPPER_IDLE_MS = 30 * 60 * 1000
const ACTIVITY_KEY = 'shipper_last_activity'

export function touchShipperSession() {
  localStorage.setItem(ACTIVITY_KEY, String(Date.now()))
}

export function shipperSessionExpired() {
  const last = Number(localStorage.getItem(ACTIVITY_KEY))
  return !Number.isFinite(last) || last <= 0 || last > Date.now() || Date.now() - last >= SHIPPER_IDLE_MS
}

export function clearShipperSession() {
  for (const key of ['shipper_data', 'shipper_token', ACTIVITY_KEY]) localStorage.removeItem(key)
}
