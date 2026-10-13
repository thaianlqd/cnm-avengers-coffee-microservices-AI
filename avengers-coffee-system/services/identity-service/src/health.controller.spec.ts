import { ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Client } from 'pg';
import { HealthController } from './health.controller';

jest.mock('pg', () => ({ Client: jest.fn() }));

describe('Kubernetes health contract', () => {
  let health: HealthController;
  let db: { connect: jest.Mock; query: jest.Mock; end: jest.Mock; on: jest.Mock };
  beforeEach(() => {
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
