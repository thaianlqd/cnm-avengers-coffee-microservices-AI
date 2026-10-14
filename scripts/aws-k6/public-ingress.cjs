// Temporary GET allowlist, streaming without caching/compression/body logging.
const http = require('node:http');
const fs = require('node:fs');
const ALLOWED = new Set(['/menu/danh-muc', '/menu/san-pham', '/users/branches/public', '/news?limit=100']);
function createIngress(origin = 'http://127.0.0.1:3000') {
  const counters = { requests: 0, denied: 0, errors: 0, active: 0, peak_active: 0, bytes: 0, routes: {} };
  const agent = new http.Agent({ keepAlive: false }); // Preserve origin transport; no hidden tuning.
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' || !ALLOWED.has(req.url)) {
      counters.denied++; res.writeHead(404); res.end(); return;
    }
    counters.requests++; counters.active++; counters.peak_active = Math.max(counters.peak_active, counters.active);
    const start = performance.now();
    let settled = false;
    const route = counters.routes[req.url] ||= { completed: 0, status: {}, total_ms: 0, max_ms: 0, buckets: [0, 0, 0, 0, 0, 0] };
    const finish = () => {
      if (settled) return; settled = true; counters.active--;
      const ms = performance.now() - start; route.completed++; route.total_ms += ms;
      route.max_ms = Math.max(route.max_ms, ms);
      route.buckets[[50, 100, 250, 500, 1500].findIndex(n => ms <= n) === -1 ? 5 : [50, 100, 250, 500, 1500].findIndex(n => ms <= n)]++;
    };
    res.once('close', finish);
    // Do not forward Authorization, cookies, X-Forwarded-* or arbitrary headers.
    const upstream = http.get(origin + req.url, { agent, headers: {
      'Accept': 'application/json', 'Accept-Encoding': req.headers['accept-encoding'] || 'identity',
    } }, response => {
      route.status[response.statusCode] = (route.status[response.statusCode] || 0) + 1;
      const headers = { ...response.headers, 'cache-control': 'no-store' };
      delete headers.connection; delete headers['keep-alive']; delete headers['transfer-encoding'];
      res.writeHead(response.statusCode, headers);
      response.on('data', b => { counters.bytes += b.length; });
      response.on('error', () => { counters.errors++; res.destroy(); });
      response.pipe(res);
    });
    upstream.setTimeout(12000, () => upstream.destroy());
    upstream.on('error', () => { counters.errors++; if (!res.headersSent) res.writeHead(502); res.end(); });
    res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
  });
  server.counters = counters;
  server.on('close', () => agent.destroy());
  return server;
}
module.exports = { createIngress };
if (require.main === module) {
  const server = createIngress();
  const output = process.env.INGRESS_METRICS;
  const timer = setInterval(() => {
    if (output) fs.appendFileSync(output, JSON.stringify({ observed_at: new Date().toISOString(), ...server.counters,
      cpu: process.cpuUsage(), rss: process.memoryUsage().rss }) + '\n');
  }, 10000);
  server.listen(18080, '127.0.0.1', () => console.log('Read-only public ingress ready on IPv4 port 18080'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { clearInterval(timer); server.close(() => process.exit()); });
}
