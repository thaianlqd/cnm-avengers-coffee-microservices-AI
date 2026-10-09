"""Ordered scripted qualification. Run in Docker with --network none; no UI/live providers."""
import json
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
GROUPS = [
    ('ownership', ['test_goal_ownership_contract', 'test_turn_contract']),
    ('same_domain_interrupt', ['test_goal_ownership_contract'], 'same_domain'),
    ('interrupt_transitions', ['test_goal_ownership_contract', 'test_turn_continuity_provider', 'test_product_display_snapshot'], 'interrupt or cross_domain or genuine'),
    ('prerequisite_roles', ['test_goal_ownership_contract', 'test_semantic_progress_registry'], 'prerequisite or role or primary_after'),
    ('state_dependent_prerequisites', ['test_goal_prerequisite_state']),
    ('frozen_product_snapshot', ['test_product_display_snapshot']),
    ('multi_product_selection', ['test_product_display_snapshot', 'test_typed_semantic_journeys'], 'multi_selection or pending_drafts or multiple or compound'),
    ('repair_and_ordinals', ['test_product_display_snapshot', 'test_turn_continuity_provider', 'test_semantic_registry_contract'], 'repair or ordinal or binds'),
    ('artifact_quarantine', ['test_turn_semantic_drift', 'test_turn_repair_surface', 'test_product_display_snapshot'], 'presentation or quarantine or discovery or escape'),
    ('provider_call_budget', ['test_product_display_snapshot', 'test_turn_continuity_provider'], 'inference or healthy or budget or repair_fuzz'),
    ('semantic_plan', ['test_reported_compound_user_turns', 'test_semantic_registry_contract', 'test_turn_continuity_provider']),
    ('frozen_cart_ordinals', ['test_compound_cart_language', 'test_reported_compound_user_turns', 'test_semantic_registry_contract', 'test_gemini_guarded_continuation'], 'ordinal or compound or sibling or cart'),
    ('product_configuration', ['test_product_option_state', 'test_pending_options_routing', 'test_optional_defaults_description_contract', 'test_chatbot_semantic_regressions', 'test_typed_semantic_journeys']),
    ('recommendation', ['test_description_recommendations', 'test_surgical_recommendation_regressions', 'test_compound_discovery_contract', 'test_menu_identity_repairs']),
    ('payment_location_checkout', ['test_location_checkout_boundary', 'test_reference_identity_repair', 'test_address_component_grounding', 'test_profile_location_hardening', 'test_semantic_state_hardening', 'test_checkout_guarded_contract', 'test_checkout_context_catalog_final', 'test_customer_checkout_presentation', 'test_cart_voucher_checkout_flow', 'test_voucher_profile_boundaries']),
    ('order', ['test_order_management_and_sales', 'test_order_edit_dialogue', 'test_recent_order_history', 'test_numbered_order_selection']),
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
        (ROOT / 'docs' / 'SEMANTIC_GOAL_OWNERSHIP_QUALIFICATION.json').write_text(json.dumps({
            'LIVE_PROVIDER_REQUESTS': 0, 'container_network': 'none', 'groups': results}, ensure_ascii=False, indent=2) + '\n')
        print(f'{index:02d} {name}: {summary}', flush=True)
        if run.returncode:
            print(run.stdout[-14000:], flush=True)
            return run.returncode
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
