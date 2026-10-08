"""Ordered migration qualification. Run inside a --network none container.

This runner invokes pytest only, never loads environment files or live providers.
Failures stop the migration before the build. Existing tests are retained.
"""
import subprocess
import sys

SCHEMA = 'tests/test_hybrid_command_schema.py'
INTERPRETER = 'tests/test_hybrid_interpreter.py'
COMMERCE = 'tests/test_hybrid_commerce.py'
JOURNEYS = 'tests/test_hybrid_journeys.py'
GROUPS = [
    ('hybrid command schema', [SCHEMA]),
    ('interpreter parsing', [INTERPRETER, '-k', 'normal_one or default_architecture or social or logs or health']),
    ('interpreter repair', [INTERPRETER, '-k', 'format_repair or second_invalid']),
    ('ALL_VISIBLE', [COMMERCE, '-k', 'all_visible or same_turn_discovery']),
    ('explicit product refs', [COMMERCE, '-k', 'explicit_product or unsafe_selection or literal_product or exact_live']),
    ('frozen product snapshot', [COMMERCE, '-k', 'product_snapshot or preflight_all']),
    ('pending product configuration', [COMMERCE, '-k', 'pending or menu_option or menu_defaults or select_then or configure_commands']),
    ('compound cart', [COMMERCE, '-k', 'compound_cart or cart_business_failure or cart_configuration']),
    ('frozen cart snapshot', [COMMERCE, '-k', 'cart_invalid or compound_cart']),
    ('voucher', [COMMERCE, '-k', 'voucher']),
    ('fulfillment', [COMMERCE, '-k', 'fulfillment']),
    ('location', [JOURNEYS, '-k', 'saved_address or stale_candidate or partial_address']),
    ('branch', [JOURNEYS, '-k', 'pickup_dine_in']),
    ('payment', [COMMERCE, '-k', 'payment or wallet']),
    ('checkout', [COMMERCE, '-k', 'checkout or payment_change']),
    ('confirmation', [COMMERCE, '-k', 'confirm or replay or client_message']),
    ('order management', [COMMERCE, JOURNEYS, '-k', 'order_detail or order_update or order_history or order_reorder']),
    ('interruptions', [JOURNEYS, '-k', 'rag_authority']),
    ('UI fast path', [COMMERCE, '-k', 'ui_fast']),
    ('provider resilience', [INTERPRETER, '-k', 'resilience or failover']),
    ('RAG boundaries', [JOURNEYS, '-k', 'rag_authority']),
    ('legacy safety regression', ['tests/test_llm_tool_orchestrator.py', 'tests/test_semantic_control.py',
        'tests/test_cart_mutation_reconciliation.py', 'tests/test_order_management_and_sales.py',
        'tests/test_location_checkout_boundary.py', 'tests/test_provider_resilience.py']),
    ('full end-to-end hybrid journey', [JOURNEYS, '-k', 'complete_hybrid']),
    ('long context-stability journey', [JOURNEYS, '-k', 'long_25']),
    ('complete ai-service suite', ['tests']),
]

if __name__ == '__main__':
    for index, (name, args) in enumerate(GROUPS, 1):
        print(f'GROUP {index:02d}/25: {name}', flush=True)
        result = subprocess.run([sys.executable, '-m', 'pytest', '-q', *args])
        if result.returncode:
            raise SystemExit(result.returncode)
    print('OFFLINE_QUALIFICATION = PASS; LIVE_PROVIDER_REQUESTS = 0', flush=True)
