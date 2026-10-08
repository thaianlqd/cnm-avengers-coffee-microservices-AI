"""Replay sanitized structural fixtures through the production offline loop."""
import json
from pathlib import Path
import pytest
from test_semantic_control import runtime, compatibility_runtime
from test_product_display_snapshot import five
from src.common import cart_manager
from src.agents.semantic_protocol import NORMALIZATION_RULES

FIXTURES = json.loads((Path(__file__).parent/'fixtures/semantic_provider_shapes.json').read_text())


@pytest.mark.parametrize('fixture', FIXTURES, ids=lambda f: f['fixture_id'])
def test_replay_provider_structure(five, fixture, caplog):
    caplog.set_level('INFO')
    five.provider.steps = fixture['argument_shape'].copy()
    expected = fixture['expected_server_behavior']
    result = five.turn('Synthetic current semantic choice')
    assert result['error'] == expected['error']
    if expected['error']:
        assert result['failure_class'] in {'PROVIDER_ENVELOPE_PROTOCOL', 'SEMANTIC_WIRE_PROTOCOL', 'SEMANTIC_GROUNDING', 'BUSINESS_POLICY'}
        assert result['failure_code'] and 'failure_json_pointer' in result
    assert len(five.provider.requests) == expected['requests']
    assert [p['product_id'] for p in cart_manager.get_checkout_prefs(five.sid).get('pending_products', [])] == expected['selected_ids']
    assert not five.writes
    events = [json.loads(r.message.split('[SemanticProtocolValidation] ', 1)[1])
        for r in caplog.records if '[SemanticProtocolValidation] ' in r.message]
    assert events
    if fixture['observed_failure_code']:
        assert any(e['failure_code'] == fixture['observed_failure_code'] for e in events)
    observed = {rule for e in events for rule in e['normalization_rules']}
    assert set(fixture['normalization_rules_applied']) <= observed <= NORMALIZATION_RULES.keys()
    assert '_turn_authorization_id' not in json.dumps(result.get('ui_payload'))


def test_normalizer_audit_has_exact_documented_rules():
    assert set(NORMALIZATION_RULES) == {'json_object', 'canonical_integer', 'selection_singleton'}
    observed = {rule for f in FIXTURES for rule in f['normalization_rules_applied']}
    assert observed == set(NORMALIZATION_RULES)
    report = (Path(__file__).parents[1]/'docs/SEMANTIC_PROVIDER_PROTOCOL_FINAL_GATE.md').read_text()
    assert all('| ' + name + ' |' in report for name in NORMALIZATION_RULES)
