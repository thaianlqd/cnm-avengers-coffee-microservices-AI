import http = require('node:http');
import https = require('node:https');
import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import { installUpstreamDiagnostics, type BrowseContext } from './upstream-diagnostics';

describe('opt-in upstream transport observation', () => {
  const context = new AsyncLocalStorage<BrowseContext>();
  let server: http.Server;
  let agent: http.Agent;
  let stop = () => {};
  let rows: Array<{ stage: string; value: number; route: string }>;
  let port: number;
  const originalHttp = http.request;
  const originalHttps = https.request;
  beforeEach(async () => {
    rows = [];
    server = http.createServer((req, res) => {
      setTimeout(() => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ path: req.url, complete: [1, 2, 3] })); }, req.url === '/slow' ? 70 : 5);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as any).port;
  });
  afterEach(async () => {
    stop(); agent?.destroy(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    expect(http.request).toBe(originalHttp); expect(https.request).toBe(originalHttps);
  });
  const install = () => {
    stop = installUpstreamDiagnostics(true, () => context.getStore(), (stage, value, route) => rows.push({ stage, value, route }));
  };
  function get(path: string, options: http.RequestOptions = {}, route = 'products') {
    return context.run({ route, started: performance.now() }, () => new Promise<{ body: any; request: http.ClientRequest }>((resolve, reject) => {
      const request = http.request({ host: '127.0.0.1', port, path, agent: false, ...options }, response => {
        let body = ''; response.on('data', chunk => { body += chunk; });
        response.once('end', () => resolve({ body: JSON.parse(body), request }));
      });
      request.once('error', reject); request.end();
    }));
  }
  it('does nothing when disabled, including no context lookups or global patches', async () => {
    const lookup = jest.fn();
    stop = installUpstreamDiagnostics(false, lookup, jest.fn());
    expect(http.request).toBe(originalHttp); expect(https.request).toBe(originalHttps);
    await get('/unchanged'); expect(lookup).not.toHaveBeenCalled();
  });
  it('keeps full response and native caller agent, and measures DNS/connect/headers/end', async () => {
    install();
    agent = new http.Agent({ keepAlive: false });
    const result = await get('/full?not_logged=private-token', { host: 'not-logged.invalid', agent,
      lookup: ((_host: unknown, opts: any, callback: any) => setTimeout(() => callback(null, opts?.all ? [{ address: '127.0.0.1', family: 4 }] : '127.0.0.1', 4), 25)) as any });
    expect(result.body).toEqual({ path: '/full?not_logged=private-token', complete: [1, 2, 3] });
    expect((result.request as http.ClientRequest & { agent?: http.Agent }).agent).toBe(agent);
    expect(rows.find(r => r.stage === 'dns_lookup')!.value).toBeGreaterThanOrEqual(15);
    for (const stage of ['gateway_dispatch', 'socket_wait', 'tcp_connect', 'upstream_connect', 'upstream_ttfb', 'upstream_response_wait', 'upstream_total']) {
      expect(rows.some(r => r.stage === stage && Number.isFinite(r.value) && r.value >= 0)).toBe(true);
    }
    expect(JSON.stringify(rows)).not.toMatch(/private|token|invalid|127|complete/);
  });
  it('exposes an actual Agent queue without bypassing maxSockets, and detects queued socket reuse', async () => {
    install(); agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    const [first, second] = await Promise.all([get('/slow', { agent }), get('/fast', { agent })]);
    expect(first.body.complete).toEqual([1, 2, 3]); expect(second.body.complete).toEqual([1, 2, 3]);
    expect(rows.some(r => r.stage === 'agent_queue_depth' && r.value >= 1)).toBe(true);
    expect(rows.some(r => r.stage === 'socket_wait' && r.value >= 40)).toBe(true);
    expect(rows.filter(r => r.stage === 'socket_new')).toHaveLength(1);
    expect(rows.filter(r => r.stage === 'socket_reused')).toHaveLength(1);
    await get('/idle-reuse', { agent });
    expect(rows.filter(r => r.stage === 'socket_reused')).toHaveLength(2);
    expect(rows.filter(r => r.stage === 'tcp_connect')).toHaveLength(1);
    expect(rows.filter(r => r.stage === 'dns_lookup')).toHaveLength(0); // Direct IP has no fake zero DNS sample.
  });
  it('attributes slow headers using segments of the same request, without logging requests', async () => {
    let clock = 0;
    stop = installUpstreamDiagnostics(true, () => ({ route: 'products', started: 0 }),
      (stage, value, route) => rows.push({ stage, value, route }), () => clock);
    await get('/safe', { host: 'not-logged.invalid', lookup: ((_host: unknown, opts: any, cb: any) => {
      setTimeout(() => { clock = 2000; cb(null, opts?.all ? [{ address: '127.0.0.1', family: 4 }] : '127.0.0.1', 4); }, 5);
    }) as any });
    expect(rows.filter(r => r.stage === 'slow_dns')).toEqual([{ stage: 'slow_dns', value: 1, route: 'products' }]);
    expect(rows.filter(r => r.stage.startsWith('slow_'))).toHaveLength(1);
  });
  it('ignores unrecognized routes and non-GET requests', async () => {
    install(); await get('/ignored', {}, 'secret-token'); await get('/ignored-post', { method: 'POST' });
    expect(rows).toEqual([]);
  });
  it('preserves the original thrown transport error and emits no error message or options', () => {
    install();
    expect(() => context.run({ route: 'branches', started: performance.now() }, () => http.request({ protocol: 'secret-token:' }))).toThrow();
    expect(rows).toEqual([{ stage: 'upstream_error', value: 1, route: 'branches' }]);
  });
  it('records DNS failure numerically while preserving rejection for the caller', async () => {
    install(); const failure = new Error('private-token-not-for-logs');
    await expect(get('/never', { host: 'not-logged.invalid', lookup: ((_host: unknown, _opts: unknown, callback: any) => setTimeout(() => callback(failure), 5)) as any })).rejects.toBe(failure);
    expect(rows.some(r => r.stage === 'dns_error')).toBe(true);
    expect(rows.some(r => r.stage === 'upstream_error')).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/private|token|invalid|never/);
  });
});
