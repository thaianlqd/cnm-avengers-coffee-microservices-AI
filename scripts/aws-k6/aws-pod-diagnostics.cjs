// Read-only isolated SQL + loopback public GET; output contains only timings/counts.
const { Pool } = require('pg');
const { performance: timing } = require('node:perf_hooks');
const port = Number(process.argv[2]);
const route = process.argv[3];
const allowed = new Map([[3001, '/users/branches/public'], [3003, '/menu/san-pham'], [3006, '/news?limit=100']]);
if (process.env.K8S_DEMO_READ_ONLY !== 'true' || process.env.K8S_DB_MODE !== 'existing' || allowed.get(port) !== route) process.exit(1);
const pool = new Pool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
  max: 1, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000, query_timeout: 5000 });
let connections = 0;
let iteration = 0;
pool.on('connect', () => { connections++; });
pool.on('error', () => { console.log(JSON.stringify({ at: new Date().toISOString(), pool_error: true })); });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const end = Date.now() + 360000;
  while (Date.now() < end) {
    const tick = timing.now();
    const row = { at: new Date().toISOString(), port, route, isolated_sql: true };
    let client;
    try {
      let t = timing.now(); client = await pool.connect(); row.acquire_ms = timing.now() - t;
      t = timing.now(); await client.query('SELECT 1'); row.query_ms = timing.now() - t;
      row.connections_created = connections;
      if (iteration++ % 3 === 0) {
        const activity = await client.query('SELECT state, count(*)::int AS n FROM pg_stat_activity GROUP BY state');
        row.activity_counts = activity.rows.map(v => ({ state: v.state, count: v.n }));
      }
    } catch (error) {
      row.sql_failed = true;
      row.error_code = /^[A-Z0-9_]{1,24}$/.test(String(error.code)) ? String(error.code) : 'REDACTED';
    } finally { if (client) client.release(!!row.sql_failed); }
    try {
      const t = timing.now();
      const response = await fetch(`http://127.0.0.1:${port}${route}`, { headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip' }, signal: AbortSignal.timeout(10000) });
      const body = await response.arrayBuffer();
      row.http_ms = timing.now() - t; row.status = response.status; row.decoded_bytes = body.byteLength;
      row.gzip = response.headers.get('content-encoding') === 'gzip';
    } catch (_) { row.http_failed = true; }
    console.log(JSON.stringify(row));
    await sleep(Math.max(0, 5000 - (timing.now() - tick)));
  }
  await pool.end();
})().catch(() => { process.exitCode = 1; });
