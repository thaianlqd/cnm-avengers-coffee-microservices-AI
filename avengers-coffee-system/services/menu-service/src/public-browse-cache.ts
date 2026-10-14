import { gzipSync } from 'node:zlib';
import type { Request, Response } from 'express';
/** Small, bounded public-read cache only for the explicit read-only demo.
 * Every miss/refresh uses the real query; no synthetic response or private data.
 */
export class PublicBrowseCache {
  private responses = new Map<string, { expires: number; body: Buffer; gzip: Buffer }>();
  private responsePending = new Map<string, Promise<{ expires: number; body: Buffer; gzip: Buffer }>>();

  /** Serialize/compress only on refresh, never per public HTTP request. */
  async respond<T>(key: string, load: () => Promise<T>, req: Request, res: Response): Promise<void> {
    const configured = Number(process.env.PUBLIC_BROWSE_CACHE_TTL_MS || 0);
    const ttl = process.env.K8S_DEMO_READ_ONLY === 'true' && Number.isFinite(configured)
      ? Math.max(0, Math.min(configured, 5000)) : 0;
    if (!ttl) { res.json(await load()); return; }
    let entry = this.responses.get(key);
    if (!entry || entry.expires <= Date.now()) {
      let pending = this.responsePending.get(key);
      if (!pending) {
        pending = Promise.resolve().then(load).then(value => {
          const body = Buffer.from(JSON.stringify(value));
          const result = { expires: Date.now() + ttl, body, gzip: gzipSync(body) };
          if (this.responses.size >= 16 && !this.responses.has(key)) {
            this.responses.delete(this.responses.keys().next().value!);
          }
          this.responses.set(key, result);
          return result;
        }).finally(() => { this.responsePending.delete(key); });
        this.responsePending.set(key, pending);
      }
      entry = await pending;
    }
    res.type('application/json');
    res.vary('Accept-Encoding');
    res.setHeader('Cache-Control', 'no-store');
    if (req.acceptsEncodings('gzip')) {
      res.setHeader('Content-Encoding', 'gzip');
      res.end(entry.gzip);
    } else {
      res.end(entry.body);
    }
  }

}
