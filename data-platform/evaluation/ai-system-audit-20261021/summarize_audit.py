"""Aggregate receipts without treating transport/HTTP completion as correctness."""
import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def read(name):
    return json.loads((ROOT / name).read_text())


modules = read('offline-modules/modules.json')
rechecks = read('offline-rechecks/modules.json')
finished = [row for row in modules if 'tests' in row]
corpus_fix = next(row for row in rechecks if row['module'] == 'tests.test_business_coverage_corpus')
capacity = [row for row in rechecks if '.CapacityTests.' in row['module']]
effective = [corpus_fix if row['module'] == corpus_fix['module'] else row for row in finished] + capacity
guided = read('guided-runtime.json')
presets = read('dashboards-runtime.json')
live = read('live-runtime.json')
canary_path = ROOT / 'live-canary-after-isolation.json'
canary = read(canary_path.name) if canary_path.exists() else []
replay_path = ROOT / 'live-after-isolation.json'
replay = read(replay_path.name) if replay_path.exists() else []
responsive_campaign = canary + replay
inventory = read('dashboard-inventory.json')
registry = json.loads((ROOT.parents[1] / 'analytics-api/metadata/semantic_catalog.json').read_text())['analysis_registry']
advertised = {row['id'] for row in inventory['dashboards']}
summary = {
    'audit_status': 'DIAGNOSED_AND_PLANNED_NOT_PRODUCT_ACCEPTANCE',
    'product_changes_by_this_audit': False,
    'offline_backend': {
        'modules_attempted': len(modules),
        'monolithic_attempt_exit_codes': [137, 137],
        'module_completed_before_rechecks': len(finished),
        'capacity_methods_completed_separately': len(capacity),
        'tests_run_deduplicated': sum(row['tests'] for row in effective),
        'failures': sum(row['failures'] for row in effective),
        'errors_including_subtests': sum(row['errors'] for row in effective),
        'unresolved_checks': [{k: row[k] for k in ['module', 'returncode', 'failed_ids', 'error_ids']} for row in effective if row['returncode'] != 0],
        'monolithic_qualified': False,
        'note': 'Subtest errors are not distinct test-method counts; no derived overall accuracy percentage.',
    },
    'offline_frontend': {'unit_tests': 222, 'pass': 222, 'typecheck_exit_code': 0,
        'full_browser_qualification_in_this_audit': False},
    'preflight': {'cases': len(read('preflight-runtime.json')),
        'observed_states': dict(Counter(row['preflight'].get('state', 'http_error') for row in read('preflight-runtime.json')))},
    'guided': {'cases': len(guided), 'domain_representatives': sum(row['id'].startswith('domain-') for row in guided),
        'observed_states': dict(Counter(row['job'].get('state') or 'http_' + str(row['job'].get('http_error')) for row in guided)),
        'provider_calls': sum(row['job'].get('provider_call_count') or 0 for row in guided)},
    'presets': {'registry_declarations': len(registry['workspace']['dashboard_templates']),
        'advertised_in_session': len(advertised), 'executed': len(presets),
        'not_advertised': [item['id'] for item in registry['workspace']['dashboard_templates'] if item['id'] not in advertised],
        'observed_job_states': dict(Counter(row['job'].get('state') or 'http_error' for row in presets)),
        'quality_statuses_are_internal_checks_only': dict(Counter((row['report'].get('quality_assessment') or {}).get('status') for row in presets)),
        'provider_calls': sum(row['job'].get('provider_call_count') or 0 for row in presets),
        'relevance_independently_qualified_for_every_filter_period_role': False},
    'gemini_campaign': {'cases': len(live), 'states': dict(Counter(row['job'].get('state') or 'http_' + str(row['job'].get('http_error')) for row in live)),
        'logical_calls': sum(row['job'].get('provider_call_count') or 0 for row in live),
        'physical_sends': sum(row['job'].get('physical_http') or 0 for row in live),
        'semantic_accuracy_measured': False, 'token_usage_and_billing_measured': False},
    'gemini_canary_after_isolation': [{
        'case': row['id'], 'state': row['job'].get('state'), 'error': row['diagnostics'].get('terminal_error'),
        'logical_calls': row['job'].get('provider_call_count'), 'physical_sends': row['job'].get('physical_http'),
    } for row in canary],
    'gemini_responsive_replay': {
        'cases': len(responsive_campaign),
        'states': dict(Counter(row['job'].get('state') or 'http_' + str(row['job'].get('http_error')) for row in responsive_campaign)),
        'logical_calls': sum(row['job'].get('provider_call_count') or 0 for row in responsive_campaign),
        'physical_sends': sum(row['job'].get('physical_http') or 0 for row in responsive_campaign),
        'returned_input_tokens': sum(row['diagnostics'].get('input_tokens') or 0 for row in responsive_campaign),
        'returned_output_tokens': sum(row['diagnostics'].get('output_tokens') or 0 for row in responsive_campaign),
        'whole_report_relevance_accuracy_measured': False,
        'note': 'Responsive replay is a separate condition; the earlier timeouts remain in the campaign ledger. Completed is not a correctness assertion.'},
    'gemini_total_recorded_physical_sends': sum(row['job'].get('physical_http') or 0 for row in live + responsive_campaign),
    'planned_acceptance_cases': {'cases': len(read('acceptance-matrix.json')['cases']),
        'reserved_structural_holdouts': sum(row['holdout'] for row in read('acceptance-matrix.json')['cases']),
        'executed_against_fixed_product': False},
}
(ROOT / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
manifest = {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(ROOT.rglob('*')) if path.is_file() and path.name not in {'sha256.json'} and '__pycache__' not in str(path)}
(ROOT / 'sha256.json').write_text(json.dumps(manifest, indent=2))
print(json.dumps({'backend_tests': summary['offline_backend']['tests_run_deduplicated'],
    'failures': summary['offline_backend']['failures'], 'errors': summary['offline_backend']['errors_including_subtests'],
    'preset_count': len(presets), 'initial_campaign_sends': summary['gemini_campaign']['physical_sends'],
    'responsive_replay': summary['gemini_responsive_replay'],
    'all_campaign_sends': summary['gemini_total_recorded_physical_sends'],
    'canary': summary['gemini_canary_after_isolation']}, ensure_ascii=False))
