"""Ordered scripted qualification. Run in Docker with --network none; no UI/live providers."""
import json
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
GROUPS = [
    ('registry_progress_metadata', ['test_semantic_progress_registry']),
    ('turn_contract', ['test_turn_contract']),
    ('repair_surface', ['test_turn_repair_surface']),
    ('wrong_valid_matrix', ['test_turn_semantic_drift']),
    ('artifact_quarantine', ['test_turn_semantic_drift'], 'presentation'),
    ('pre_tool_repair', ['test_semantic_repair_modes', 'test_turn_continuity_provider'], 'pre_tool or exact_option or repair_fuzz or healthy_configuration'),
    ('semantic_protocol_repair', ['test_semantic_registry_contract', 'test_turn_continuity_provider']),
    ('post_tool_final_repair', ['test_semantic_repair_modes', 'test_gemini_guarded_continuation']),
    ('safe_interrupt', ['test_turn_continuity_provider', 'test_typed_semantic_journeys'], 'interrupt or change or social'),
    ('compound_plan', ['test_reported_compound_user_turns', 'test_compound_cart_language', 'test_turn_continuity_provider'], 'compound or sibling'),
    ('product_configuration', ['test_product_option_state', 'test_pending_options_routing', 'test_optional_defaults_description_contract', 'test_chatbot_semantic_regressions', 'test_typed_semantic_journeys']),
    ('recommendation', ['test_description_recommendations', 'test_surgical_recommendation_regressions', 'test_compound_discovery_contract', 'test_menu_identity_repairs']),
    ('cart_voucher', ['test_cart_voucher_checkout_flow', 'test_voucher_profile_boundaries', 'test_pending_voucher_natural_negation', 'test_cart_mutation_reconciliation']),
    ('fulfillment_location_payment', ['test_location_checkout_boundary', 'test_reference_identity_repair', 'test_address_component_grounding', 'test_profile_location_hardening', 'test_semantic_state_hardening']),
    ('checkout', ['test_checkout_guarded_contract', 'test_checkout_context_catalog_final', 'test_customer_checkout_presentation']),
    ('order', ['test_order_management_and_sales', 'test_order_edit_dialogue', 'test_recent_order_history', 'test_numbered_order_selection']),
    ('rag_reviews', ['test_rag_v2', 'test_rag_characterization', 'test_displayed_branch_reviews', 'test_natural_knowledge_routing']),
    ('provider_resilience', ['test_provider_resilience', 'test_provider_wait_budget', 'test_provider_retry_recovery', 'test_provider_outage_presentation', 'test_gemini_guarded_continuation']),
    ('full_ai_service', None),
]


def main():
    logdir = Path('/qualificationlogs')
    logdir.mkdir(exist_ok=True)
    results = []
    for index, group in enumerate(GROUPS, 1):
        name, modules, *selection = group
        targets = ['tests'] if modules is None else ['tests/' + module + '.py' for module in modules]
        command = [sys.executable, '-m', 'pytest', *targets, '-q', '--tb=short']
        if selection:
            command += ['-k', selection[0]]
        start = time.monotonic()
        run = subprocess.run(command, cwd=ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        log = logdir / f'{index:02d}-{name}.log'
        log.write_text(run.stdout)
        summaries = [line for line in run.stdout.splitlines() if re.search(r'\d+ (passed|failed|error).* in [\d.]+s', line)]
        summary = summaries[-1] if summaries else 'No pytest summary'
        counts = {kind: int(match.group(1)) if (match := re.search(r'(\d+) ' + (kind[:-1] + 's?' if kind in {'warnings', 'errors'} else kind), summary)) else 0
            for kind in ('passed', 'failed', 'skipped', 'warnings', 'deselected', 'errors')}
        results.append({'order': index, 'group': name, 'command': command, 'exit_code': run.returncode,
            'summary': summary, **counts, 'wall_seconds': round(time.monotonic() - start, 3), 'log': log.name,
            'failing_test_ids': [line[7:].split(' - ')[0] for line in run.stdout.splitlines() if line.startswith('FAILED ')]})
        (ROOT / 'docs' / 'SEMANTIC_TURN_CONTINUITY_QUALIFICATION.json').write_text(json.dumps({
            'LIVE_PROVIDER_REQUESTS': 0, 'container_network': 'none', 'groups': results}, ensure_ascii=False, indent=2) + '\n')
        print(f'{index:02d} {name}: {summary}', flush=True)
        if run.returncode:
            print(run.stdout[-14000:], flush=True)
            return run.returncode
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
