import * as http from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { Socket, AddressInfo } from 'node:net';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import { ProxyAgents } from './proxy-agents';
import { configureGatewayHttpServer } from './gateway-http-policy';

describe('bounded proxy connection reuse', () => {
  it('preserves the original transport unless explicitly enabled', () => {
    expect(new ProxyAgents({}).forTarget('http://menu-service:3003')).toBeUndefined();
    expect(new ProxyAgents({ GATEWAY_PROXY_KEEP_ALIVE: 'false' }).forTarget('http://menu-service:3003')).toBeUndefined();
  });

  it('separates origins and protocols and bounds pooled sockets', () => {
    const pool = new ProxyAgents({ GATEWAY_PROXY_KEEP_ALIVE: 'true' });
    const agent = pool.forTarget('http://menu-service:3003')!;
    expect(pool.forTarget('http://menu-service:3003/menu')).toBe(agent);
    expect(pool.forTarget('http://identity-service:3001')).not.toBe(agent);
    expect(pool.forTarget('https://example.test')).toBeInstanceOf(HttpsAgent);
    expect(agent.maxSockets).toBe(128);
    expect(agent.maxTotalSockets).toBe(128);
    expect(agent.maxFreeSockets).toBe(16);
    pool.destroy();
  });

  it('retires aged connections only when the completed response returns them', () => {
    let clock = 0;
    const pool = new ProxyAgents({ GATEWAY_PROXY_KEEP_ALIVE: 'true' }, () => clock);
    const agent = pool.forTarget('http://menu-service:3003')!;
    const socket = new Socket();
    expect(agent.keepSocketAlive(socket)).toBe(true);
    clock = 29999;
    expect(agent.keepSocketAlive(socket)).toBe(true);
    clock = 30000;
    expect(agent.keepSocketAlive(socket)).toBe(false);
    socket.destroy(); pool.destroy();
  });

  it('streams full gzip JSON through the actual proxy, reuses upstream connections, and rotates them', async () => {
    let clock = 0;
    const pool = new ProxyAgents({ GATEWAY_PROXY_KEEP_ALIVE: 'true' }, () => clock);
    const body = JSON.stringify({ items: Array.from({ length: 1215 }, (_, id) => ({ id, name: 'synthetic branch' })) });
    const encoded = gzipSync(body);
    let connections = 0;
    const backend = http.createServer((req, res) => {
      // Different requests on one pooled TCP connection keep distinct headers.
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip',
        'X-Synthetic-User': String(req.headers['x-synthetic-user'] || '') });
      res.end(encoded);
    });
    backend.on('connection', () => connections++);
    const listen = (server: http.Server) => new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    await listen(backend);
    const target = `http://127.0.0.1:${(backend.address() as AddressInfo).port}`;
    const app = require('express')();
    const gateway = http.createServer(app);
    const responseHook = configureGatewayHttpServer(gateway, { GATEWAY_MAX_REQUESTS_PER_SOCKET: '2' });
    app.use(createProxyMiddleware({ target, agent: pool.forTarget(target), pathFilter: ['/menu'],
      on: { proxyReq: fixRequestBody, proxyRes: responseHook! }, timeout: 120000, proxyTimeout: 120000 }));
    let frontendConnections = 0;
    gateway.on('connection', () => frontendConnections++);
    await listen(gateway);
    const clientAgent = new http.Agent({ keepAlive: true });
    const url = `http://127.0.0.1:${(gateway.address() as AddressInfo).port}/menu/danh-muc`;
    const read = (identity: string) => new Promise<void>((resolve, reject) => {
      const req = http.get(url, { agent: clientAgent, headers: { 'X-Synthetic-User': identity } }, res => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => {
          try {
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-encoding']).toBe('gzip');
            expect(res.headers['x-synthetic-user']).toBe(identity);
            expect(gunzipSync(Buffer.concat(chunks)).toString()).toBe(body);
            setImmediate(resolve);
          } catch (error) { reject(error); }
        });
      });
      req.on('error', reject);
    });
    try {
      await read('a'); await read('b');
      expect(connections).toBe(1);
      clock = 30001;
      await read('c'); // Request finishes intact, then the aged connection is retired.
      await read('d');
      expect(connections).toBe(2);
      expect(frontendConnections).toBe(2);
    } finally {
      clientAgent.destroy(); pool.destroy();
      await Promise.all([gateway, backend].map(server => new Promise<void>(resolve => server.close(() => resolve()))));
    }
  });
});
