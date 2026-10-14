// External, browser-compatible transport. Historical profiles remain unchanged.
import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Trend, Counter } from 'k6/metrics';

function integer(name, fallback, low, high) {
  const n = Number(__ENV[name] || fallback);
  if (!Number.isInteger(n) || n < low || n > high) throw Error(`${name} outside ${low}..${high}`);
  return n;
}
const vus = integer('CAPACITY_VUS', 250, 1, 3000);
const ramp = 60;
const hold = integer('CAPACITY_HOLD_SECONDS', 120, 120, 600);
const down = hold === 120 ? 30 : 60;
if (__ENV.THINK_SECONDS && Number(__ENV.THINK_SECONDS) !== 3) throw Error('Think time is fixed at 3s');
const base = (__ENV.BASE_URL || '').replace(/\/$/, '');
if (__ENV.AWS_PRIVATE_CAPACITY === 'true') {
  const match = /^http:\/\/(\d{1,3}(?:\.\d{1,3}){3}):30300$/.exec(base);
  const octets = match ? match[1].split('.').map(Number) : [];
  const privateV4 = octets.length === 4 && octets.every(n => n <= 255) &&
    (octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168));
  if (!privateV4) throw Error('AWS capacity requires an RFC1918 IPv4 target on private NodePort 30300');
} else if (!/^http:\/\/127\.0\.0\.1:13300$/.test(base)) {
  throw Error('3k profile requires the loopback reverse SSH data plane to the real Mac Gateway; Quick Tunnel is forbidden');
}
const routes = [
  ['/menu/danh-muc', 'menu_categories'], ['/menu/san-pham', 'menu_products'],
  ['/users/branches/public', 'public_branches'], ['/news?limit=100', 'public_news'],
];
const latency = Object.fromEntries(routes.map(([, n]) => [n, new Trend(`${n}_ms`, true)]));
const statuses = new Counter('response_statuses');
export const options = {
  scenarios: { browse: { executor: 'ramping-vus', startVUs: 0,
    stages: [{ duration: `${ramp}s`, target: vus }, { duration: `${hold}s`, target: vus },
      { duration: `${down}s`, target: 0 }], gracefulRampDown: '15s', gracefulStop: '15s' } },
  thresholds: {
    http_req_failed: ['rate<0.02'], checks: ['rate>0.98'], http_req_duration: ['p(95)<1500'],
    'http_req_failed{phase:hold}': ['rate<0.02'], 'checks{phase:hold}': ['rate>0.98'],
    'http_req_duration{phase:hold}': ['p(95)<1500'], 'http_reqs{phase:hold}': ['count>0'],
    // Observation-only submetrics avoid a high-volume per-point JSON writer.
    ...Object.fromEntries([0,200,401,403,404,429,500,502,503,504,522,524].map(code => [`response_statuses{status:${code}}`, ['count>=0']])),
    ...Object.fromEntries(routes.map(([,name]) => [`${name}_ms{phase:hold}`, ['p(95)>=0']])),
  },
  summaryTrendStats: ['avg', 'p(50)', 'p(95)', 'p(99)', 'max'],
};

function validFullJson(r, name) {
  try {
    const j = r.json(); // k6 decodes gzip; parse and inspect the complete response.
    const a = Array.isArray(j) ? j : j?.items;
    if (!Array.isArray(a) || !a.length) return false;
    if (name === 'menu_categories') return a.every(v => v.ma_danh_muc != null && typeof v.ten_danh_muc === 'string');
    if (name === 'menu_products') return a.every(v => v.ma_san_pham != null && typeof v.ten_san_pham === 'string' && v.gia_ban != null);
    if (name === 'public_branches') return j.total === a.length && a.every(v => typeof v.ma_chi_nhanh === 'string' && typeof v.ten_chi_nhanh === 'string');
    return j.page === 1 && j.limit === 100 && j.total >= a.length && a.every(v => typeof v.id === 'string' && typeof v.title === 'string' && typeof v.content === 'string');
  } catch (_) { return false; }
}
export default function () {
  for (const [path, name] of routes) {
    const t = exec.instance.currentTestRunDuration / 1000;
    const phase = t < ramp ? 'ramp' : t < ramp + hold ? 'hold' : 'down';
    const tags = { name, phase };
    const r = http.get(base + path, { timeout: '10s', tags,
      headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'User-Agent': 'Avengers-Capacity-3k/1' } });
    statuses.add(1, { ...tags, status: String(r.status) });
    latency[name].add(r.timings.duration, { phase });
    check(r, { [`${name}: HTTP 200`]: v => v.status === 200,
      [`${name}: full JSON contract`]: v => validFullJson(v, name),
      [`${name}: gzip negotiated`]: v => v.headers['Content-Encoding'] === 'gzip' }, tags);
  }
  sleep(3);
}
export function handleSummary(data) {
  const passed = Object.values(data.metrics).every(m => Object.values(m.thresholds || {}).every(t => t.ok));
  return { stdout: `External browser browse ${vus} VUs (${ramp}/${hold}/${down}s): ${passed ? 'HTTP PASS' : 'HTTP FAIL'}\n`,
    [__ENV.SUMMARY_FILE || 'summary.json']: JSON.stringify(data, null, 2) };
}
