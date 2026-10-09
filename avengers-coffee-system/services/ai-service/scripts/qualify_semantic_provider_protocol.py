"""Ordered offline qualification. Run in Docker --network none, without provider keys."""
import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

GROUPS = [
    ('registry', ['test_semantic_registry_contract', 'test_semantic_progress_registry']),
    ('diagnostics', ['test_semantic_protocol_diagnostics']),
    ('normalization', ['test_semantic_provider_protocol'], ['-k', 'normaliz']),
    ('turn_authorization', ['test_semantic_provider_protocol'], ['-k', 'authorization or replay or adversarial or unadvertised']),
    ('selection_batch', ['test_semantic_provider_protocol']),
    ('product_snapshot', ['test_product_display_snapshot']),
    ('goal_ownership', ['test_goal_ownership_contract']),
    ('prerequisites', ['test_goal_prerequisite_state']),
    ('repair_modes', ['test_semantic_repair_modes', 'test_turn_repair_surface', 'test_turn_continuity_provider']),
    ('provider_request_shapes', ['test_semantic_provider_request_shapes', 'test_gemini_guarded_continuation']),
    ('provider_shape_fixtures', ['test_semantic_provider_fixtures']),
    ('product_configuration', ['test_product_option_state', 'test_cart_manager_pending', 'test_typed_semantic_journeys']),
    ('cart', ['test_cart_contract_v5', 'test_cart_line_context', 'test_mixed_cart_presentation']),
    ('compound_cart', ['test_compound_cart_language', 'test_reported_compound_user_turns']),
    ('voucher', ['test_voucher_profile_boundaries', 'test_pending_voucher_natural_negation', 'test_cart_voucher_checkout_flow']),
    ('fulfillment', ['test_checkout_guarded_contract', 'test_location_checkout_boundary']),
    ('location', ['test_profile_location_hardening', 'test_final_location_recovery_hardening', 'test_address_component_grounding']),
    ('payment', ['test_checkout_context_catalog_final', 'test_reported_checkout_followups']),
    ('checkout_confirmation', ['test_customer_checkout_presentation', 'test_live_manual_checkout_followups', 'test_turn_completion_evidence']),
    ('order', ['test_order_management_and_sales', 'test_order_edit_dialogue', 'test_numbered_order_selection', 'test_recent_order_history']),
    ('rag_recommendation', ['test_rag_characterization', 'test_rag_v2', 'test_description_recommendations', 'test_recommendation_memory', 'test_surgical_recommendation_regressions']),
    ('provider_resilience', ['test_provider_resilience', 'test_provider_wait_budget', 'test_provider_retry_recovery', 'test_cart_mutation_reconciliation']),
    ('full_suite', None),
]


def run(output):
    output.mkdir(parents=True, exist_ok=True)
    results = []
    for number, group in enumerate(GROUPS, 1):
        name, modules, *extra = group
        selection = ['tests'] if modules is None else ['tests/' + module + '.py' for module in modules]
        command = [sys.executable, '-m', 'pytest', '-q', *selection, *(extra[0] if extra else [])]
        started = time.monotonic()
        proc = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        elapsed = round(time.monotonic() - started, 2)
        (output / f'{number:02d}_{name}.log').write_text(proc.stdout)
        summaries = [line for line in proc.stdout.splitlines() if re.search(r'\d+ (?:passed|failed|skipped|error)', line)]
        summary = summaries[-1] if summaries else 'No pytest summary'
        counts = {key: sum(int(n) for n in re.findall(r'(\d+) ' + ('warnings?' if key == 'warnings' else key) + r'\b', summary))
            for key in ('passed', 'failed', 'skipped', 'warnings', 'deselected', 'error')}
        row = {'number': number, 'group': name, 'command': command, 'exit_code': proc.returncode,
            'wall_seconds': elapsed, 'summary': summary,
            'pytest_seconds': float(re.search(r'in ([0-9.]+)s', summary)[1]) if re.search(r'in ([0-9.]+)s', summary) else None, **counts,
            'failing_test_ids': [line for line in proc.stdout.splitlines() if line.startswith(('FAILED ', 'ERROR '))]}
        results.append(row)
        (output / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
        print(json.dumps(row), flush=True)
        if proc.returncode:
            return proc.returncode
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    sys.exit(run(parser.parse_args().output))
