describe('bounded capacity diagnostics', () => {
  afterEach(() => { jest.useRealTimers(); jest.resetModules(); delete process.env.CAPACITY_DIAGNOSTICS; });
  it('is disabled by default and allocates no interval', () => {
    jest.useFakeTimers();
    const d = require('./capacity-diagnostics');
    expect(d.diagnosticEnabled).toBe(false);
    d.startDiagnostics({ once: jest.fn() });
    expect(jest.getTimerCount()).toBe(0);
  });
  it('uses a fixed route vocabulary and emits only interval aggregates', async () => {
    process.env.CAPACITY_DIAGNOSTICS = 'true'; jest.useFakeTimers();
    const d = require('./capacity-diagnostics');
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    let close: () => void = () => {};
    d.startDiagnostics({ once: (_: string, cb: () => void) => { close = cb; } });
    expect(d.routeName('/users/secret?token=private')).toBeUndefined();
    const listeners: Record<string, () => void> = {};
    d.diagnosticMiddleware({ method: 'GET', originalUrl: '/menu/san-pham?private=value' },
      { once: (name: string, cb: () => void) => { listeners[name] = cb; } }, () => { d.record('cache_hit', 1); d.record('unknown', 1); });
    listeners.finish();
    expect(log).not.toHaveBeenCalled();
    jest.advanceTimersByTime(30000);
    const output = JSON.parse(log.mock.calls[0][0]);
    expect(output.metrics['products:cache_hit'].count).toBe(1);
    expect(output.metrics['products:request'].count).toBe(1);
    expect(JSON.stringify(output)).not.toMatch(/private|unknown|token/);
    jest.advanceTimersByTime(30000);
    expect(JSON.parse(log.mock.calls[1][0]).metrics).toEqual({});
    close(); expect(jest.getTimerCount()).toBe(0); log.mockRestore();
  });
});
