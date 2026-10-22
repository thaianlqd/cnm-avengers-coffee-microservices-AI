"""Read-only HTTP audit; authentication comes from the operator environment.

Run from repository root. Never changes provider policy, saves reports, triggers
sync, or modifies source data. Live mode is explicitly opt-in.
"""
import argparse
import http.cookiejar
import json
import os
from pathlib import Path
import time
import urllib.error
import urllib.request
import uuid

OUT = Path(__file__).resolve().parent
SEPT = {'mode': 'custom', 'start': '2026-09-01', 'end': '2026-09-30'}
HCM = {'mode': 'selected', 'filters': [{'dimension': 'city', 'operator': 'in', 'value': ['Hồ Chí Minh']}]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('group', choices=['preflight', 'guided', 'live'])
    parser.add_argument('--allow-provider', action='store_true')
    parser.add_argument('--case', help='Run one existing case ID; does not introduce a new prompt')
    parser.add_argument('--exclude-case', help='Skip an existing case already measured in a canary')
    parser.add_argument('--receipt-name', help='Separate receipt stem to preserve the baseline campaign')
    parser.add_argument('--semantic-evidence', action='store_true', help='Retain approved campaign result/fact scope evidence for independent review')
    parser.add_argument('--refresh', action='store_true', help='Use the existing runtime refresh action to measure a fresh provider interpretation')
    parser.add_argument('--physical-spent', type=int, default=0, help='Already measured sends in this same bounded campaign')
    parser.add_argument('--physical-limit', type=int, default=48, help='Actual campaign ceiling, at most48; reserved allowance is not measured sends')
    args = parser.parse_args()
    if not 0 <= args.physical_spent <= args.physical_limit <= 48:
        raise SystemExit('Campaign physical sends must be within 0..48')
    governed_metrics = json.loads((OUT.parents[1] / 'analytics-api/metadata/semantic_catalog.json').read_text())['analysis_registry']['metrics'] if args.semantic_evidence else {}
    if args.group == 'live' and not args.allow_provider:
        raise SystemExit('Live tests require --allow-provider and user authorization')
    base = os.getenv('DP_AUDIT_BASE', 'http://127.0.0.1:8501')
    if base not in {'http://127.0.0.1:8501', 'http://localhost:8501'}:
        raise SystemExit('Audit target must be the local Data Platform')
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def call(path, payload=None, key=None):
        headers = {'Content-Type': 'application/json', 'Origin': base}
        if key:
            headers['Idempotency-Key'] = key
        request = urllib.request.Request(base + path, data=json.dumps(payload).encode() if payload is not None else None, headers=headers)
        try:
            with opener.open(request, timeout=85) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            return {'http_error': error.code, 'detail': json.loads(error.read().decode())}

    auth = call('/api/auth/login', {'tai_khoan': os.getenv('DP_AUDIT_USER', 'thaian_DataAnalyst'), 'mat_khau': os.environ['DP_AUDIT_PASSWORD']})
    if auth.get('http_error'):
        raise SystemExit('Local audit login failed')
    cap = call('/api/ai/capabilities')
    cases = []

    def add(identity, question, mission=None, contract=None, **options):
        payload = {'question': question, 'reference_date': '2026-10-21', 'time': SEPT, **options}
        if mission:
            payload['analysis_mission'] = mission
        if contract is not None:
            payload.update(input_mode='guided', guided_contract=contract)
        cases.append((identity, payload))

    missions = [
        ('overview', 'Tình hình doanh thu tháng 9 năm 2026', {'metric': 'revenue'}),
        ('compare', 'So sánh doanh thu theo tỉnh/thành giữa Hồ Chí Minh và Hà Nội tháng 9 năm 2026', {'metric': 'revenue', 'dimension': 'city', 'group_a': 'Hồ Chí Minh', 'group_b': 'Hà Nội'}),
        ('ranking', 'Bottom 5 tỉnh/thành trong dữ liệu theo doanh thu tháng 9 năm 2026', {'metric': 'revenue', 'dimension': 'city', 'n': 5, 'direction': 'bottom'}),
        ('trend', 'Xu hướng doanh thu theo tuần tháng 9 năm 2026', {'metric': 'revenue', 'granularity': 'week'}),
        ('composition', 'Cơ cấu doanh thu theo phương thức thanh toán tháng 9 năm 2026', {'metric': 'revenue', 'dimension': 'payment_method'}),
        ('forecast', 'Dự báo doanh thu 3 tháng tới', {'metric': 'revenue', 'horizon': 3, 'cadence': 'month'}),
        ('relationship', 'Liên hệ giữa tổng chuyến giao và điểm hồ sơ tài xế theo mã tài xế tháng 9 năm 2026', {'metric': 'total_deliveries', 'metric_b': 'driver_rating', 'dimension': 'driver_id'}),
    ]
    for mission, question, contract in missions:
        add(mission + '-guided', question, mission, contract, **({'time': {'mode': 'all_time'}} if mission == 'forecast' else {}))

    if args.group == 'guided':
        for domain in cap['domains']:
            metric = domain['metrics'][1] if domain['id'] == 'products' else domain['metrics'][0]
            period = SEPT if metric['historical'] else {'mode': 'all_time'}
            question = 'Tình hình ' + metric['label'].lower() + (' tháng 9 năm 2026' if metric['historical'] else ' hiện tại')
            add('domain-' + domain['id'], question, 'overview', {'metric': metric['id']}, time=period, analysis_depth='focused')
    elif args.group == 'preflight':
        add('risk-free-scoped', 'Kiểm tra rủi ro vận hành tháng 9 năm 2026 của thành phố hồ chí minh', 'risk_watch')
        add('risk-guided', 'Kiểm tra rủi ro vận hành tháng 9 năm 2026', 'risk_watch', {'signals': [s['id'] for s in cap['risk_signals']]}, analysis_scope=HCM)
        add('risk-in-ranking-tab', 'Kiểm tra rủi ro vận hành tháng 9 năm 2026', 'ranking')
        add('compare-in-ranking-tab', 'So sánh doanh thu Hồ Chí Minh và Hà Nội tháng 9 năm 2026', 'ranking')
        add('unknown-city', 'Phân tích doanh thu tỉnh abcjdsakjd tháng 9 năm 2026')
        add('unknown-city-risk', 'Kiểm tra rủi ro vận hành tỉnh abcjdsakjd tháng 9 năm 2026', 'risk_watch')
        add('gibberish', 'dsfdsfsdfsd')
        add('profit-unavailable', 'Lợi nhuận theo chi nhánh tháng 9 năm 2026')
        add('pii', 'Cho tôi số điện thoại khách hàng mua nhiều nhất')
        add('write-request', 'Xóa dữ liệu đơn hàng tháng 9 năm 2026')
        add('ambiguous-best', 'Cửa hàng nào tốt nhất?')
        add('negative-n', 'Top -5 tỉnh theo doanh thu tháng 9 năm 2026', 'ranking')
        add('bad-calendar', 'Doanh thu ngày 31/02/2026')
        add('conflicting-date', 'Doanh thu tháng 8 năm 2026')
        add('snapshot-history', 'Xu hướng vị trí tạm ngưng bán theo ngày tháng 9 năm 2026', 'trend')
        add('multi-two', missions[2][1], 'ranking', missions[2][2], analysis_scope={'mode': 'selected', 'filters': [{'dimension': 'city', 'operator': 'in', 'value': ['Hồ Chí Minh', 'Hà Nội']}]})
        add('rare-five', missions[2][1], 'ranking', missions[2][2], analysis_scope={'mode': 'selected', 'filters': [{'dimension': 'city', 'operator': 'in', 'value': ['Ninh Thuận', 'Sóc Trăng', 'Bạc Liêu', 'Trà Vinh', 'Quảng Trị']}]})
        add('secondary-unknown', 'Doanh thu tháng 9 năm 2026', analysis_context='Chỉ tỉnh abcjdsakjd')
        add('no-accent', 'doanh thu theo chi nhanh tai HCM thang 9 nam 2026')
        add('english', 'Top 5 cities by revenue in September 2026')
        add('too-long', 'Doanh thu ' + 'a ' * 4100)
    else:
        cases = []
        live = [
            ('risk-edited', 'Kiểm tra rủi ro vận hành tháng 9 năm 2026 của thành phố hồ chí minh', 'risk_watch', {}),
            ('risk-explicit-scope', 'Kiểm tra rủi ro vận hành tháng 9 năm 2026', 'risk_watch', {'analysis_scope': HCM}),
            ('risk-followup', 'Top 5 chi nhánh có tỷ lệ hủy đơn cao nhất', 'ranking', {'analysis_scope': HCM}),
            ('overview-scoped', 'Tình hình doanh thu tháng 9 năm 2026 tại Hồ Chí Minh', 'overview', {}),
            ('compare', missions[1][1], 'compare', {}),
            ('bottom-five', missions[2][1], 'ranking', {}),
            ('trend-scoped', 'Xu hướng doanh thu theo tuần tháng 9 năm 2026 tại Hồ Chí Minh', 'trend', {}),
            ('composition', missions[4][1], 'overview', {}),
            ('forecast', missions[5][1], 'forecast', {'time': {'mode': 'auto'}}),
            ('relationship', missions[6][1], None, {}),
            ('multi-clause', 'Top 5 tỉnh doanh thu thấp nhất tháng 9 năm 2026; phân tích chi nhánh và phương thức thanh toán chỉ trong 5 tỉnh này', None, {}),
            ('casual', 'tháng 9 năm 2026 ở HCM bán được bao nhiêu?', None, {}),
        ]
        for identity, question, mission, options in live:
            add(identity, question, mission, input_mode='free_text', allow_deterministic_upgrade=False, analysis_depth='deep', **options)

    if args.case:
        cases = [(identity, payload) for identity, payload in cases if identity == args.case]
        if not cases:
            raise SystemExit('Unknown case ID')
    if args.exclude_case:
        cases = [(identity, payload) for identity, payload in cases if identity != args.exclude_case]
    if args.refresh:
        for _, payload in cases:
            payload['refresh'] = True
    receipt = args.receipt_name or args.group + '-runtime'
    if not receipt.replace('-', '').replace('_', '').isalnum():
        raise SystemExit('Receipt name must be a simple filename stem')
    ledger = []
    for identity, payload in cases:
        used = args.physical_spent + sum(x.get('job', {}).get('physical_http') or 0 for x in ledger)
        if args.group == 'live' and used + 3 > args.physical_limit:
            raise SystemExit('Insufficient campaign allowance for the existing three-send job ceiling')
        started = time.time()
        preflight = call('/api/ai/preflight', {k: v for k, v in payload.items() if k not in {'allow_deterministic_upgrade', 'refresh'}})
        record = {'id': identity, 'payload': payload, 'preflight': preflight}
        if args.group != 'preflight':
            # Keep the production input gate and all existing provider budgets intact.
            job = call('/api/ai/analysis-jobs', payload, 'system-audit-' + uuid.uuid4().hex)
            while job.get('job_id') and job.get('state') not in {'completed', 'needs_input', 'partial_available', 'insufficient_data', 'unsupported', 'failed', 'cancelled'} and time.time() - started < 110:
                time.sleep(1)
                job = call('/api/ai/analysis-jobs/' + job['job_id'])
            report = job.get('result') or {}
            diag = report.get('diagnostics') or {}
            record['job'] = {k: job.get(k) for k in ['job_id', 'state', 'provider_call_count', 'physical_http', 'stage_timings_ms', 'http_error', 'detail']}
            record['report'] = {k: report.get(k) for k in ['status', 'outcome', 'message', 'title', 'session_id', 'revision', 'analysis_mission', 'analysis_coverage', 'analytical_queries', 'sql_by_query', 'quality_limitations', 'failure', 'interaction_contract', 'source_completeness']}
            record['diagnostics'] = {k: diag.get(k) for k in ['request_id', 'input_policy_version', 'terminal_error', 'error_category', 'failure_code', 'failure_stage', 'contract_issues', 'provider_call_count', 'provider_physical_attempts', 'input_tokens', 'output_tokens', 'db_query_count', 'execution_status', 'result_status', 'guided_contract_used', 'preflight_state', 'data_epoch']}
            record['provider_attempts'] = [{k: a.get(k) for k in ['provider', 'model', 'http_status', 'error_category', 'latency_ms', 'tokens']} for a in diag.get('provider_calls', [])]
            record['charts'] = [{k: c.get(k) for k in ['id', 'title', 'query_id', 'metrics', 'x_field', 'selection', 'analysis_lens_role', 'ranking_direction']} | {'displayed_rows': len(c.get('data', []))} for c in report.get('charts', [])]
            record['result_summary'] = {key: {'rows': len(value.get('rows', [])), 'metric_totals': {m: sum(row.get(m) or 0 for row in value.get('rows', []) if isinstance(row.get(m), (int, float))) for m in (report.get('result_contracts', {}).get(key, {}).get('metrics') or []) if isinstance(m, str)}} for key, value in report.get('result_sets', {}).items()}
            if args.semantic_evidence:
                for summary in record['result_summary'].values():
                    non_additive = [m for m in summary['metric_totals'] if not governed_metrics.get(m, {}).get('additive')]
                    summary['not_summed_metrics'] = non_additive
                    for metric in non_additive:
                        summary['metric_totals'].pop(metric)
                record['semantic_evidence'] = {k: report.get(k) for k in (
                    'query_plans', 'result_sets', 'result_contracts', 'evidence', 'kpi_cards',
                    'key_findings', 'short_answer', 'executive_summary', 'conclusion',
                    'quality_assessment', 'answer_requirements', 'resolved_requirement_coverage', 'semantic_intent', 'provenance', 'goal_provenance')}
                record['semantic_evidence']['charts'] = [{k: chart.get(k) for k in (
                    'id', 'title', 'query_id', 'scope_ref', 'scope_refs', 'metrics', 'selection',
                    'population_scope', 'scope_note', 'insight', 'analysis_lens_role', 'ranking_direction')}
                    for chart in report.get('charts', [])]
                record['diagnostics']['interpreted_shapes'] = diag.get('interpreted_shapes')
                record['diagnostics']['draft_shapes'] = diag.get('draft_shapes')
                record['diagnostics']['root_contract_issues'] = diag.get('root_contract_issues')
                record['diagnostics']['semantic_issue_history'] = diag.get('semantic_issue_history')
                record['diagnostics']['guided_source'] = diag.get('guided_source')
        record['elapsed_seconds'] = round(time.time() - started, 3)
        ledger.append(record)
        (OUT / (receipt + '.json')).write_text(json.dumps(ledger, ensure_ascii=False, indent=2))
        print(json.dumps({'id': identity, 'preflight': preflight.get('state'), 'state': record.get('job', {}).get('state'), 'http_error': record.get('job', {}).get('http_error'), 'provider_calls': record.get('job', {}).get('provider_call_count'), 'error': record.get('diagnostics', {}).get('terminal_error')}, ensure_ascii=False), flush=True)
        if args.group == 'live' and args.physical_spent + sum(row.get('job', {}).get('physical_http') or 0 for row in ledger) >= args.physical_limit:
            raise SystemExit('Audit campaign reached 48 physical provider sends; review receipts before more testing')
        time.sleep(.25)


if __name__ == '__main__':
    main()
