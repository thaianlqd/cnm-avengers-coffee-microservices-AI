import { HealthController } from './health.controller';

describe('Gateway health', () => {
  it('reports process availability without requesting upstreams', () => {
    const health = new HealthController();
    expect(health.live()).toEqual({ status: 'ok' });
    expect(health.ready()).toEqual({ status: 'ok' });
    health.beforeApplicationShutdown();
    expect(() => health.ready()).toThrow();
    expect(health.live()).toEqual({ status: 'ok' });
  });
});
