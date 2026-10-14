#!/usr/bin/env node
// Two one-VU synthetic requests. No application/database/provider endpoint.
const http = require('node:http');
const { gzipSync } = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const output = '/tmp/avengers-k8s-capacity';
fs.mkdirSync(output, { recursive: true });
const script = path.join(output, 'encoding-probe.js');
fs.writeFileSync(script, `import http from 'k6/http';
import { Trend, Rate } from 'k6/metrics';
const bytes = new Trend('decoded_bytes'); const json = new Rate('json_ok');
export const options = { vus: 1, iterations: 1 };
export default function () {
 const r = http.get(__ENV.DIAGNOSTIC_URL, { timeout: '5s', headers: __ENV.DIAGNOSTIC_ENCODING ? {'Accept-Encoding': __ENV.DIAGNOSTIC_ENCODING} : {} });
 bytes.add(r.body.length); json.add(r.status === 200 && r.json().synthetic.length > 700000);
}
export function handleSummary(data) { return { stdout: JSON.stringify({received_bytes:data.metrics.data_received.values.count, decoded_bytes:data.metrics.decoded_bytes.values.avg, json_ok:data.metrics.json_ok.values.rate}) }; }
`);
const body = Buffer.from(JSON.stringify({ synthetic: 'x'.repeat(718432) }));
const compressed = gzipSync(body);
const requests = [];
const server = http.createServer((req, res) => {
  const accepted = req.headers['accept-encoding'] || '';
  const gzip = accepted.includes('gzip');
  const data = gzip ? compressed : body;
  requests.push({ accept_encoding: accepted, response_encoding: gzip ? 'gzip' : 'identity', wire_body_bytes: data.length });
  res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': data.length,
    ...(gzip ? { 'Content-Encoding': 'gzip' } : {}) });
  res.end(data);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const records = [];
  try {
    for (const mode of ['', 'gzip']) {
      const child = spawn(process.env.K6_BIN || path.join(root, '.tools/k6/0.57.0/k6'), ['run', '--quiet', script],
        { env: { ...process.env, DIAGNOSTIC_URL: `http://127.0.0.1:${server.address().port}/`, DIAGNOSTIC_ENCODING: mode }, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = ''; child.stdout.on('data', b => stdout += b);
      child.stderr.resume();
      const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
      if (code) throw Error('Synthetic k6 diagnostic failed');
      records.push({ mode: mode || 'default', ...requests[requests.length - 1], ...JSON.parse(stdout) });
    }
    const result = { observed_at: new Date().toISOString(), purpose: 'HTTP encoding diagnostic only; synthetic loopback fixture, not capacity evidence', records };
    fs.writeFileSync(path.join(output, 'encoding-diagnostic.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(() => { console.error('HTTP encoding diagnostic failed (no payload logged)'); process.exitCode = 1; });
