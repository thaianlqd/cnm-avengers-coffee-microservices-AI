import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Client } from 'pg';
import { HealthController, dbProbeConnectionTimeoutMs } from './health.controller';

jest.mock('pg', () => ({ Client: jest.fn() }));

describe('Kubernetes health contract', () => {
  let health: HealthController;
  let db: { connect: jest.Mock; query: jest.Mock; end: jest.Mock; on: jest.Mock };
  const priorTimeout = process.env.DB_PROBE_CONNECTION_TIMEOUT_MS;
  afterAll(() => {
    if (priorTimeout === undefined) delete process.env.DB_PROBE_CONNECTION_TIMEOUT_MS;
    else process.env.DB_PROBE_CONNECTION_TIMEOUT_MS = priorTimeout;
  });
  beforeEach(() => {
    delete process.env.DB_PROBE_CONNECTION_TIMEOUT_MS;
    (Client as unknown as jest.Mock).mockClear();
    delete process.env.SOCKET_REDIS_ENABLED;
    db = { connect: jest.fn().mockResolvedValue(undefined), query: jest.fn().mockResolvedValue({}),
      end: jest.fn().mockResolvedValue(undefined), on: jest.fn() };
    (Client as unknown as jest.Mock).mockImplementation(() => db);
    health = new HealthController({ isInitialized: true } as DataSource);
  });
  it('keeps liveness successful when a dependency fails', async () => {
    db.connect.mockRejectedValue(new Error('connection containing credentials'));
    await expect(health.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(health.live()).toEqual({ status: 'ok' });
    expect(db.end).toHaveBeenCalled();
  });
  it('only probes read-only SQL and bounds connection/query time', async () => {
    await expect(health.ready()).resolves.toEqual({ status: 'ok' });
    expect(db.query).toHaveBeenCalledWith('SELECT 1');
    expect(Client).toHaveBeenCalledWith(expect.objectContaining({ connectionTimeoutMillis: 1000, query_timeout: 1000 }));
  });
  it('allows measured AWS connection time without widening query timeout', async () => {
    process.env.DB_PROBE_CONNECTION_TIMEOUT_MS = '2000';
    await expect(health.ready()).resolves.toEqual({ status: 'ok' });
    expect(Client).toHaveBeenLastCalledWith(expect.objectContaining({ connectionTimeoutMillis: 2000, query_timeout: 1000 }));
    expect(db.query).toHaveBeenCalledWith('SELECT 1');
  });
  it('rejects invalid or excessive connection budgets', () => {
    for (const value of ['', '999', '2001', '10000', '1500.5', 'NaN', 'Infinity']) {
      expect(dbProbeConnectionTimeoutMs(value)).toBe(1000);
    }
    expect(dbProbeConnectionTimeoutMs('1500')).toBe(1500);
  });
  it('rejects readiness while draining without changing liveness', async () => {
    health.beforeApplicationShutdown();
    await expect(health.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(health.live()).toEqual({ status: 'ok' });
    expect(db.connect).not.toHaveBeenCalled();
  });
  it('rejects an uninitialized application DB', async () => {
    health = new HealthController({ isInitialized: false } as DataSource);
    await expect(health.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(db.connect).not.toHaveBeenCalled();
  });
});
