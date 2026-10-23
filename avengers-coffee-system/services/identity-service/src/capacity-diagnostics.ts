import { AsyncLocalStorage } from 'node:async_hooks';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import type { Request, Response, NextFunction } from 'express';

// Fixed route/stage vocabulary. No URLs, SQL, bodies, headers or identities emitted.
export const diagnosticEnabled = process.env.CAPACITY_DIAGNOSTICS === 'true';
const context = new AsyncLocalStorage<string>();
const bounds = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 1500, 2500, 5000, 10000, Infinity];
const rows = new Map<string, { count: number; sum: number; max: number; buckets: number[] }>();
const stages = new Set(['request', 'upstream_headers', 'upstream_body', 'cache_hit', 'cache_refresh', 'cache_coalesced', 'cache_wait', 'load', 'serialize', 'gzip', 'identity_bytes', 'gzip_bytes', 'db_acquire', 'db_query', 'db_connect', 'db_error']);
export function record(stage: string, value: number, route = context.getStore()) {
  if (!diagnosticEnabled || !route || !stages.has(stage) || !Number.isFinite(value) || value < 0) return;
  const key = `${route}:${stage}`;
  let row = rows.get(key);
  if (!row) { if (rows.size >= 80) return; row = { count: 0, sum: 0, max: 0, buckets: bounds.map(() => 0) }; rows.set(key, row); }
  row.count++; row.sum += value; row.max = Math.max(row.max, value);
  row.buckets[bounds.findIndex(b => value <= b)]++;
}
export function routeName(url: string): string | undefined {
  const path = url.split('?')[0];
  return ({ '/menu/danh-muc': 'categories', '/menu/san-pham': 'products', '/users/branches/public': 'branches', '/news': 'news' } as Record<string, string>)[path];
}
export async function timed<T>(stage: string, load: () => Promise<T>): Promise<T> {
  if (!diagnosticEnabled) return load();
  const start = performance.now();
  try { return await load(); } finally { record(stage, performance.now() - start); }
}
export function diagnosticMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!diagnosticEnabled) { next(); return; }
  const route = routeName(req.originalUrl || req.url);
  if (!route || req.method !== 'GET') { next(); return; }
  const start = performance.now();
  res.once('finish', () => record('request', performance.now() - start, route));
  context.run(route, next);
}
export function startDiagnostics(server: { once: (event: string, cb: () => void) => unknown }) {
  if (!diagnosticEnabled) return;
  const loop = monitorEventLoopDelay({ resolution: 20 }); loop.enable();
  const timer = setInterval(() => {
    console.log(JSON.stringify({ kind: 'capacity_diagnostics', at: new Date().toISOString(), interval_ms: 30000,
      bounds_ms: bounds.map(b => Number.isFinite(b) ? b : 'Inf'), metrics: Object.fromEntries(rows),
      event_loop_ms: { p50: loop.percentile(50) / 1e6, p95: loop.percentile(95) / 1e6, p99: loop.percentile(99) / 1e6, max: loop.max / 1e6 } }));
    rows.clear(); loop.reset();
  }, 30000); timer.unref();
  server.once('close', () => { clearInterval(timer); loop.disable(); });
}
