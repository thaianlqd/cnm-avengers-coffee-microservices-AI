// Independent capacity profile; the qualified classroom profile stays unchanged.
import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Trend } from 'k6/metrics';

function integer(name, fallback, minimum, maximum) {
  const value = Number(__ENV[name] || fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer in [${minimum}, ${maximum}]`);
  }
  return value;
}
const vus = integer('CAPACITY_VUS', 1000, 1, 5000);
const ramp = integer('CAPACITY_RAMP_SECONDS', 60, 30, 60);
const hold = integer('CAPACITY_HOLD_SECONDS', 120, 60, 120);
const down = 30;
const think = Number(__ENV.THINK_SECONDS || 3);
if (think !== 3) throw new Error('Capacity comparisons require THINK_SECONDS=3');
const encoding = __ENV.CAPACITY_ACCEPT_ENCODING || '';
if (!['', 'gzip'].includes(encoding)) throw new Error('CAPACITY_ACCEPT_ENCODING must be empty (legacy identity) or gzip');
const base = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
if (!/^http:\/\/(localhost|127\.0\.0\.1):3000$/.test(base)) {
  throw new Error('Capacity harness is qualified only for the local LoadBalancer on port 3000');
}
const routes = [
  ['/menu/danh-muc', 'menu_categories'],
  ['/menu/san-pham', 'menu_products'],
  ['/users/branches/public', 'public_branches'],
  ['/news?page=1&limit=6', 'public_news'],
];
const latency = Object.fromEntries(routes.map(([, name]) => [name, new Trend(`${name}_ms`, true)]));
export const options = {
  stages: [{ duration: `${ramp}s`, target: vus }, { duration: `${hold}s`, target: vus },
    { duration: `${down}s`, target: 0 }],
  gracefulRampDown: '15s',
  gracefulStop: '15s',
  thresholds: {
    http_req_failed: ['rate<0.02'], checks: ['rate>0.98'], http_req_duration: ['p(95)<1500'],
    'http_req_failed{phase:hold}': ['rate<0.02'],
    'checks{phase:hold}': ['rate>0.98'],
    'http_req_duration{phase:hold}': ['p(95)<1500'],
    'http_reqs{phase:hold}': ['count>0'],
  },
  summaryTrendStats: ['avg', 'p(50)', 'p(95)', 'max'],
};
export default function () {
  for (const [path, name] of routes) {
    const elapsed = exec.instance.currentTestRunDuration / 1000;
    const phase = elapsed < ramp ? 'ramp' : elapsed < ramp + hold ? 'hold' : 'down';
    const tags = { name, phase };
    const response = http.get(base + path, { timeout: '10s', tags,
      ...(encoding ? { headers: { 'Accept-Encoding': encoding } } : {}) });
    latency[name].add(response.timings.duration, { phase });
    check(response, {
      [`${name}: HTTP 200`]: r => r.status === 200,
      [`${name}: JSON`]: r => { try { return r.json() !== null; } catch (_) { return false; } },
    }, tags);
  }
  sleep(think);
}
export function handleSummary(data) {
  const passed = Object.values(data.metrics).every(m => Object.values(m.thresholds || {}).every(t => t.ok));
  return {
    stdout: `Capacity ${vus} VUs, encoding=${encoding || 'legacy identity'}, think=3s, ${ramp}/${hold}/${down}s: ${passed ? 'HTTP PASS' : 'HTTP FAIL'}\n` +
      `requests=${data.metrics.http_reqs.values.count}, failed=${data.metrics.http_req_failed.values.rate}, ` +
      `p95=${data.metrics.http_req_duration.values['p(95)']}ms\n`,
    [__ENV.SUMMARY_FILE || '/tmp/k6-capacity.json']: JSON.stringify(data, null, 2),
  };
}
