"""Inventory-wide deterministic preset audit; never calls external providers."""
import http.cookiejar
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request
import uuid

OUT = Path(__file__).resolve().parent
BASE = 'http://127.0.0.1:8501'
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def call(path, body=None, key=None):
    headers = {'Origin': BASE, 'Content-Type': 'application/json'}
    if key:
        headers['Idempotency-Key'] = key
    request = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    try:
        with opener.open(request, timeout=85) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raw = error.read().decode()
        try:
            detail = json.loads(raw)
        except ValueError:
            detail = raw[:500]
        return {'http_error': error.code, 'detail': detail}


auth = call('/api/auth/login', {'tai_khoan': os.getenv('DP_AUDIT_USER', 'thaian_DataAnalyst'), 'mat_khau': os.environ['DP_AUDIT_PASSWORD']})
if auth.get('http_error'):
    raise SystemExit('Local login failed')
inventory = call('/api/ai/dashboards')
(OUT / 'dashboard-inventory.json').write_text(json.dumps(inventory, ensure_ascii=False, indent=2))
items = inventory.get('dashboards', [])
if not items:
    raise SystemExit('No dashboard inventory returned')
records = []
for item in items:
    payload = {'dashboard_id': item['id'], 'dashboard_version': item['version'], 'time': {'mode': 'all_time'}, 'reference_date': '2026-10-21', 'analysis_depth': 'deep'}
    started = time.monotonic()
    job = call('/api/ai/analysis-jobs', payload, 'preset-audit-' + uuid.uuid4().hex)
    while job.get('job_id') and job.get('state') not in {'completed', 'needs_input', 'partial_available', 'insufficient_data', 'unsupported', 'failed', 'cancelled'} and time.monotonic() - started < 110:
        time.sleep(1)
        job = call('/api/ai/analysis-jobs/' + job['job_id'])
    report = job.get('result') or {}
    diagnostics = report.get('diagnostics') or {}
    records.append({'id': item['id'], 'title': item.get('title'), 'advertised_status': {k: item.get(k) for k in ['status', 'availability', 'readiness', 'data_status', 'source_readiness', 'time_filter_enabled']},
        'payload': payload, 'job': {k: job.get(k) for k in ['job_id', 'state', 'physical_http', 'provider_call_count', 'http_error', 'detail']},
        'report': {k: report.get(k) for k in ['status', 'message', 'session_id', 'revision', 'analysis_coverage', 'analytical_queries', 'sql_by_query', 'quality_assessment', 'quality_limitations', 'source_completeness']},
        'diagnostics': {k: diagnostics.get(k) for k in ['request_id', 'terminal_error', 'error_category', 'failure_stage', 'db_query_count', 'execution_status', 'result_status']},
        'charts': [{k: chart.get(k) for k in ['title', 'query_id', 'x_field', 'metrics', 'selection']} | {'rows': len(chart.get('data', []))} for chart in report.get('charts', [])],
        'elapsed_seconds': round(time.monotonic() - started, 3)})
    (OUT / 'dashboards-runtime.json').write_text(json.dumps(records, ensure_ascii=False, indent=2))
    print(json.dumps({'id': item['id'], 'state': job.get('state'), 'http_error': job.get('http_error'), 'error': diagnostics.get('terminal_error'), 'charts': len(report.get('charts', [])), 'provider_calls': job.get('provider_call_count')}, ensure_ascii=False), flush=True)
    if job.get('provider_call_count') or job.get('physical_http'):
        raise SystemExit('Unexpected provider ledger in deterministic dashboard path; stopped')
