/** Preserve the normal pool default; reject unsafe or malformed overrides. */
export function dbPoolIdleTimeoutMs(value = process.env.DB_POOL_IDLE_TIMEOUT_MS): number {
  if (value === undefined) return 5000;
  if (!/^\d+$/.test(value)) throw new Error('DB_POOL_IDLE_TIMEOUT_MS must be an integer between 1000 and 60000');
  const timeout = Number(value);
  if (!Number.isSafeInteger(timeout) || timeout < 1000 || timeout > 60000) {
    throw new Error('DB_POOL_IDLE_TIMEOUT_MS must be an integer between 1000 and 60000');
  }
  return timeout;
}
