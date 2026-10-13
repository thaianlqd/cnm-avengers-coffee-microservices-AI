#!/usr/bin/env node
// Only public GETs; persist sizes/counts/digests, never response data or secrets.
const http = require('node:http');
const { gunzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const routes = ['/menu/danh-muc', '/menu/san-pham', '/users/branches/public', '/news?page=1&limit=6'];
const get = (route, encoding) => new Promise((resolve, reject) => {
  const req = http.get('http://localhost:3000' + route, { headers: { 'Accept-Encoding': encoding } }, res => {
    const chunks = [];
    res.on('data', b => chunks.push(b));
    res.on('error', reject);
    res.on('end', () => {
      try {
        if (res.statusCode !== 200) throw Error('Public GET not ready');
        const wire = Buffer.concat(chunks);
        const decoded = res.headers['content-encoding'] === 'gzip' ? gunzipSync(wire) : wire;
        const json = JSON.parse(decoded);
        const list = Array.isArray(json) ? json : json.items || json.data;
        resolve({ request_encoding: encoding, response_encoding: res.headers['content-encoding'] || 'identity',
          wire_body_bytes: wire.length, decoded_bytes: decoded.length,
          item_count: Array.isArray(list) ? list.length : null, total: json.total || null,
          decoded_sha256: createHash('sha256').update(decoded).digest('hex') });
      } catch (error) { reject(error); }
    });
  });
  req.setTimeout(10000, () => req.destroy(Error('Public GET timeout')));
  req.on('error', reject);
});
(async () => {
  const result = { observed_at: new Date().toISOString(), routes: [] };
  for (const route of routes) {
    const identity = await get(route, 'identity');
    const gzip = await get(route, 'gzip');
    result.routes.push({ route, identity, gzip, same_full_json: identity.decoded_sha256 === gzip.decoded_sha256 });
    if (identity.decoded_sha256 !== gzip.decoded_sha256 || gzip.response_encoding !== 'gzip') throw Error('Encoding contract mismatch');
  }
  fs.mkdirSync('/tmp/avengers-k8s-capacity', { recursive: true });
  fs.writeFileSync('/tmp/avengers-k8s-capacity/public-encoding.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})().catch(() => { console.error('Public encoding validation failed (payload redacted)'); process.exitCode = 1; });
