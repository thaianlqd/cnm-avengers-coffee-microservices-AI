import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const routeLatency = {
  menu_categories: new Trend('menu_categories_ms', true),
  menu_products: new Trend('menu_products_ms', true),
  public_branches: new Trend('public_branches_ms', true),
  public_news: new Trend('public_news_ms', true),
};

const base = (__ENV.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const profile = __ENV.PROFILE || 'moderate';
function positive(name, fallback) {
  const value = Number(__ENV[name] || fallback);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}
const stages = profile === 'smoke'
  ? [{ duration: __ENV.SMOKE_DURATION || '20s', target: positive('SMOKE_VUS', 2) }]
  : [
      { duration: '20s', target: positive('WARMUP_VUS', 20) },
      { duration: '30s', target: positive('STEP1_VUS', 50) },
      { duration: '40s', target: positive('STEP2_VUS', 100) },
      { duration: '60s', target: positive('STEP3_VUS', 200) },
      ...(__ENV.STEP4_VUS ? [{ duration: '30s', target: positive('STEP4_VUS', 300) }] : []),
      { duration: '30s', target: 0 },
    ];
if (!['smoke', 'moderate'].includes(profile)) throw new Error('PROFILE must be smoke or moderate');

export const options = {
  stages,
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<1500'],
    checks: ['rate>0.98'],
  },
  summaryTrendStats: ['avg', 'p(50)', 'p(95)', 'max'],
};

function read(path, name) {
  const response = http.get(`${base}${path}`, { timeout: '10s', tags: { name } });
  routeLatency[name].add(response.timings.duration);
  check(response, {
    [`${name}: HTTP 200`]: (r) => r.status === 200,
    [`${name}: JSON`]: (r) => {
      try { return r.json() !== null; } catch (_) { return false; }
    },
  });
}

export default function () {
  // Actual public gateway routes; all requests are read-only and avoid providers/payment.
  read('/menu/danh-muc', 'menu_categories');
  read('/menu/san-pham', 'menu_products');
  read('/users/branches/public', 'public_branches');
  read('/news?page=1&limit=6', 'public_news');
  sleep(Number(__ENV.THINK_SECONDS || 1));
}

export function handleSummary(data) {
  const failed = data.metrics.http_req_failed.values.rate;
  const p95 = data.metrics.http_req_duration.values['p(95)'];
  const checks = data.metrics.checks.values.rate;
  const summary = `Customer browse (${profile})\nRequests: ${data.metrics.http_reqs.values.count}\n` +
    `Failed: ${(failed * 100).toFixed(2)}%; checks passed: ${(checks * 100).toFixed(2)}%; p95: ${p95.toFixed(1)} ms\n` +
    `Threshold result: ${failed < 0.02 && p95 < 1500 && checks > 0.98 ? 'PASS' : 'FAIL'}\n` +
    'HPA proof requires observed kubectl replica/metrics output; HTTP success alone is not scaling evidence.\n';
  return { stdout: summary, ...(__ENV.SUMMARY_FILE ? { [__ENV.SUMMARY_FILE]: JSON.stringify(data, null, 2) } : {}) };
}
