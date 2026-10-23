import { dbPoolIdleTimeoutMs } from './db-pool.config';

describe('database pool idle lifetime', () => {
  it('preserves the default independently of readiness timeout', () => {
    const prior = process.env.DB_POOL_IDLE_TIMEOUT_MS;
    delete process.env.DB_POOL_IDLE_TIMEOUT_MS;
    try { expect(dbPoolIdleTimeoutMs()).toBe(5000); }
    finally { if (prior !== undefined) process.env.DB_POOL_IDLE_TIMEOUT_MS = prior; }
  });
  it.each(['1000', '5000', '30000', '60000'])('accepts bounded milliseconds %s', value => {
    expect(dbPoolIdleTimeoutMs(value)).toBe(Number(value));
  });
  it.each(['', '0', '-1', '999', '60001', '1.5', '30000ms', ' 30000', 'NaN', 'Infinity', '1e4', '9007199254740993'])('rejects invalid override %s', value => {
    expect(() => dbPoolIdleTimeoutMs(value)).toThrow('DB_POOL_IDLE_TIMEOUT_MS');
  });
});
