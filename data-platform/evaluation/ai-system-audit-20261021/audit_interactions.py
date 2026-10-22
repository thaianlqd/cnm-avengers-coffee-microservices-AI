"""Owned test-session interactions only; 0 provider calls, no source writes."""
import http.cookiejar
import json
import os
import sys
import time
from pathlib import Path
import urllib.error
import urllib.request

out = Path(__file__).resolve().parent
base = 'http://127.0.0.1:8501'
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def call(path, body=None):
    request = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None,
        headers={'Content-Type': 'application/json', 'Origin': base})
    try:
        with opener.open(request, timeout=85) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        return {'http_error': error.code, 'detail': json.loads(error.read().decode())}


call('/api/auth/login', {'tai_khoan': os.getenv('DP_AUDIT_USER', 'thaian_DataAnalyst'), 'mat_khau': os.environ['DP_AUDIT_PASSWORD']})
reports = json.loads((out / 'guided-runtime.json').read_text())
report = next(r['report'] for r in reports if r['id'] == 'ranking-guided')
if '--fresh' in sys.argv:
    payload = next(r['payload'] for r in reports if r['id'] == 'ranking-guided')
    request = urllib.request.Request(base + '/api/ai/analysis-jobs', data=json.dumps({**payload, 'refresh': True}).encode(),
        headers={'Content-Type': 'application/json', 'Origin': base, 'Idempotency-Key': 'fresh-audit-' + str(time.time_ns())})
    with opener.open(request, timeout=85) as response:
        job = json.load(response)
    while job['state'] not in {'completed', 'failed', 'needs_input', 'insufficient_data', 'unsupported', 'partial_available'}:
        time.sleep(1)
        job = call('/api/ai/analysis-jobs/' + job['job_id'])
    if job['state'] != 'completed':
        raise SystemExit('Fresh guided report did not complete')
    report = job['result']
session = report['session_id']
rows = []
for feedback in ['dsfdsfsdfsd', 'Chỉ lọc Hà Nội', 'Chỉ tỉnh abcjdsakjd', 'Chỉ lọc Ninh Thuận', 'Đổi biểu đồ sang donut']:
    result = call('/api/ai/refinement-preflight', {'session_id': session, 'current_report': {'revision': report['revision']}, 'feedback': feedback})
    rows.append({'case': 'refinement-preflight', 'feedback': feedback, 'result': result})
    print(json.dumps({'case': feedback, 'can_submit': result.get('can_submit'), 'http_error': result.get('http_error')}, ensure_ascii=False), flush=True)

reconcile = call('/api/ai/sessions/' + session + '/reconcile', {})
rows.append({'case': 'reconcile-before-change', 'result': reconcile})
contract = report['interaction_contract']
entry = next(c for c in contract['charts'] if c['dimension_id'] == 'city')
selection = entry['options'][0]['selection']
payload = {k: contract[k] for k in ['session_id', 'revision', 'catalog_fingerprint', 'access_fingerprint']}
payload.update(filters=[selection], analysis_depth='deep')
changed = call('/api/ai/workspace-revision', payload)
rows.append({'case': 'filter-returned-rare-city', 'selection': selection, 'result': {k: changed.get(k) for k in ['status', 'revision', 'message', 'failure', 'analytical_queries', 'sql_by_query', 'analysis_coverage', 'http_error', 'detail']}})
print(json.dumps({'case': 'filter-returned-rare-city', 'status': changed.get('status'), 'revision': changed.get('revision'), 'error': changed.get('message') or changed.get('detail')}, ensure_ascii=False), flush=True)
if changed.get('revision'):
    stale = call('/api/ai/workspace-revision', payload)
    rows.append({'case': 'stale-revision', 'result': stale})
    geo = call('/api/ai/sessions/' + session + '/geography?revision=' + str(changed['revision']))
    rows.append({'case': 'geography-after-filter', 'result': {k: geo.get(k) for k in ['summary', 'period', 'http_error', 'detail']} | {'provinces': len(geo.get('provinces', []))}})
(out / ('fresh-interactions-runtime.json' if '--fresh' in sys.argv else 'interactions-runtime.json')).write_text(json.dumps(rows, ensure_ascii=False, indent=2))
