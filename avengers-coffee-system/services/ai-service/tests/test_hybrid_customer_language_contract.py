"""Corpus labels are executable contract fixtures, NOT model accuracy evidence."""
import json
from pathlib import Path
import pytest
from scripts.qualify_hybrid_customer_language import context_for, ground_product_refs, score
from src.agents.hybrid_command_schema import validate_envelope
from src.agents.hybrid_workflow import ground
from src.agents.hybrid_reference_repair import at

CORPUS = json.loads((Path(__file__).parent / 'fixtures/hybrid_customer_language_cases.json').read_text())


@pytest.mark.parametrize('case', CORPUS['cases'], ids=lambda c: c['case_id'] + '-' + c['category'])
def test_labeled_vietnamese_meaning_is_valid_and_groundable(case):
    value, error, _ = validate_envelope(case['expected'])
    assert not error, error
    turn = context_for(CORPUS, case)
    assert all(row['result'] == 'grounded' for row in ground_product_refs(turn, value))
    for expected in case['expected_groundings']:
        row = ground(turn, expected['domain'], at(value, expected['path']))
        assert row['product_id'] == expected['canonical_key']
    assert score(value, value)['intent_match']
    assert 'product_id' not in json.dumps(turn.model_context(), ensure_ascii=False)


def test_corpus_covers_required_semantic_dimensions():
    required = {'single_ordinal', 'group_ordinal', 'plain_ambiguous_ordinal', 'multiple_groups',
        'quantity_attachment', 'all_visible', 'pronouns_deictics', 'corrections', 'discovery_refinement',
        'cart_references', 'pending_references', 'voucher_references', 'payment_references',
        'order_references', 'checkout_confirmation', 'social', 'clarification'}
    assert required <= {case['category'] for case in CORPUS['cases']}
    assert CORPUS['LIVE_PROVIDER_REQUESTS'] == 0 and CORPUS['live_semantic_accuracy'] == 'NOT MEASURED'


def test_metric_separates_namespace_quantity_and_intent():
    expected = CORPUS['cases'][0]['expected']
    changed = json.loads(json.dumps(expected))
    changed['commands'][0]['args']['references'][1]['group'] = 'drink'
    changed['commands'][0]['args']['references'][1]['quantity'] = 1
    result = score(expected, changed)
    assert result['intent_match'] and not result['namespace_match'] and not result['quantity_match']
