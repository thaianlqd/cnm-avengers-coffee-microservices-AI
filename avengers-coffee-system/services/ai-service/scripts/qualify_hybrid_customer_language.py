"""Labeled meaning qualification, offline by default. NEVER executes commerce.

Run from ai-service: python scripts/qualify_hybrid_customer_language.py
Future opt-in provider run: add --live --output /tmp/language-results.json
Live output contains customer utterances from the synthetic corpus only.
Business first-click/repair recovery still require the manual conversation script.
"""
from pathlib import Path
import argparse
import json
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.agents.hybrid_command_schema import validate_envelope
from src.agents.hybrid_workflow import TurnContext, ground, identity, GroundingError
from src.agents.product_display import numbered_products
from src.agents.product_collections import publication

CORPUS = Path(__file__).resolve().parents[1] / 'tests/fixtures/hybrid_customer_language_cases.json'


def context_for(corpus, case):
    variant = case['context']
    all_rows = numbered_products(corpus['catalog'], grouped=True)
    drinks = [r for r in all_rows if r['menu_bucket'] == 'drink']
    foods = [r for r in all_rows if r['menu_bucket'] == 'food']
    rows = all_rows
    if variant in {'drink_only', 'empty_food'}:
        rows, foods = numbered_products(drinks), []
        drinks = rows
    elif variant == 'retained':
        rows = numbered_products(foods)
        foods = rows
    elif variant == 'two_visible':
        rows = numbered_products([drinks[0], foods[0]], grouped=True)
        drinks, foods = rows[:1], rows[1:]
    visible = {'products': rows, 'drink_products': drinks, 'food_products': foods,
        'vouchers': [{'ma_voucher': 'EVAL1', 'ten_voucher': 'Ưu đãi 1'}, {'ma_voucher': 'EVAL2', 'ten_voucher': 'Ưu đãi 2'}],
        'payment_options': [{'code': 'COD', 'label': 'Tiền mặt'}, {'code': 'VNPAY', 'label': 'VNPAY'}],
        'branches': [{'branch_id': 'eval-B1', 'branch_name': 'Cửa hàng 1'}, {'branch_id': 'eval-B2', 'branch_name': 'Cửa hàng 2'}],
        'location_candidates': [{'candidate_id': 'eval-L1', 'normalized_label': 'Địa điểm 1'}, {'candidate_id': 'eval-L2', 'normalized_label': 'Địa điểm 2'}],
        'profile_addresses': [{'address_id': 'eval-A1', 'full_address': 'Địa chỉ mẫu 1'}],
        'orders': [{'order_id': 'eval-O1'}, {'order_id': 'eval-O2'}] if variant == 'orders' else []}
    checkout = {'last_created_order_id': 'eval-O1'} if variant == 'orders' else {}
    if variant == 'checkout_summary':
        checkout.update(checkout_action_id='eval-summary', voucher_decided=True, delivery_type='TAI_CHO', payment_method='COD')
    state = {'checkout': checkout, 'cart': {'items': [dict(row, cart_item_id=f'eval-C{i}', display_index=i, quantity=1)
        for i, row in enumerate(drinks[:2], 1)]}, 'pending_products': [dict(row, selection_index=i, quantity=1)
        for i, row in enumerate(drinks[:2], 1)] if variant == 'pending' else [],
        'discovery_state': {'scope': 'drink', 'query': 'cà phê', 'max_price': 70000, 'count': 5,
            'basis': 'sales', 'period': 'week'} if variant == 'browse' else {}}
    focus = {'product': foods[0]} if variant == 'focus_food' else {'order': {'order_id': 'eval-O1'}} if variant == 'orders' else {}
    return TurnContext.capture({'business': state, 'visible': visible, 'focus': focus,
        'product_display': publication({}, visible, ['drink', 'food'], 'language_corpus', checkout.get('last_created_order_id'))})


def references(value):
    if isinstance(value, dict):
        if value.get('kind') in {'ordinal', 'group_ordinal', 'cart_ordinal', 'pending_ordinal', 'name', 'focus', 'singleton', 'last_created', 'id'}:
            yield value
        else:
            for child in value.values():
                yield from references(child)
    elif isinstance(value, list):
        for child in value:
            yield from references(child)


def score(expected, actual):
    expected = expected or {}
    actual = actual or {}
    wanted = [c['intent'] for c in expected.get('commands', [])]
    got = [c['intent'] for c in actual.get('commands', [])]
    er, ar = list(references(expected)), list(references(actual))
    return {'intent_match': expected.get('kind') == actual.get('kind') and wanted == got,
        'namespace_match': [(r['kind'], r.get('group')) for r in er] == [(r['kind'], r.get('group')) for r in ar],
        'quantity_match': [r.get('quantity', 1) for r in er] == [r.get('quantity', 1) for r in ar],
        'compound_coverage': set(wanted) <= set(got), 'exact_meaning_match': expected == actual}


def ground_product_refs(turn, value):
    """Diagnostic only, no lookup, executors, state persistence or business writes."""
    outcomes = []
    for command in (value or {}).get('commands', []):
        if command['intent'] == 'SELECT_PRODUCTS':
            refs = command['args'].get('references', [])
        elif command['intent'] in {'READ_PRODUCT_INFO', 'ASK_KNOWLEDGE'}:
            refs = [command['args']['target']] if command['args'].get('target') else []
        else:
            continue
        for ref in refs:
            try:
                outcomes.append({'result': 'grounded', 'canonical_key': identity('products', ground(turn, 'products', ref))})
            except GroundingError as exc:
                outcomes.append({'result': exc.code})
    return outcomes


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true', help='Explicitly enable real provider requests; never commerce tools')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    corpus = json.loads(CORPUS.read_text())
    results, provider_requests = [], 0
    for case in corpus['cases']:
        value, error, _ = validate_envelope(case['expected'])
        if error:
            raise ValueError((case['case_id'], error))
        turn = context_for(corpus, case)
        if args.live:
            from src.agents.hybrid_semantic_interpreter import interpret
            value, error, requests = interpret(turn, case['text'], 'manual-language-eval', case['case_id'])
            provider_requests += requests
        results.append({'case_id': case['case_id'], 'category': case['category'], 'error': error,
            **score(case['expected'], value), 'grounding': ground_product_refs(turn, value),
            'provider_requests': requests if args.live else 0, 'business_write_count': 0})
    report = {'mode': 'live_meaning_only' if args.live else 'offline_contract_only',
        'LIVE_PROVIDER_REQUESTS': provider_requests, 'live_semantic_accuracy': 'MEASURED ON SYNTHETIC CORPUS ONLY' if args.live else 'NOT MEASURED',
        'case_count': len(results), 'first_click_success_rate': None, 'repair_recovery_rate': None,
        'business_qualification': 'NOT RUN; use the manual conversation script', 'results': results}
    if args.live:
        for metric, key in [('intent_accuracy', 'intent_match'), ('reference_namespace_accuracy', 'namespace_match'),
            ('quantity_attachment_accuracy', 'quantity_match'), ('compound_command_coverage', 'compound_coverage')]:
            report[metric] = sum(row[key] for row in results) / len(results)
        outcomes = [item for row in results for item in row['grounding']]
        report['grounding_success_rate'] = sum(r['result'] == 'grounded' for r in outcomes) / len(outcomes) if outcomes else None
        report['clarification_precision'] = None  # Requires review of equivalent necessary clarifications.
    encoded = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(encoded + '\n')
    else:
        print(encoded)


if __name__ == '__main__':
    main()
