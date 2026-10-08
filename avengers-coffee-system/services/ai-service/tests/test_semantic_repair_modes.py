"""Repair modes use execution/plan facts, never an utterance classifier."""
import json
import logging
from copy import deepcopy
import pytest
from test_semantic_control import runtime, compatibility_runtime
from test_semantic_dialogue_repairs import final
from test_typed_semantic_journeys import send, ref
from src.agents.tool_artifacts import ToolArtifacts
from src.common import cart_manager


def step(name, value):
    return {'tool_calls': [{'id': 'fixture', 'type': 'function', 'function': {
        'name': 'semantic_' + name, 'arguments': json.dumps(value)}}]}


def metrics(caplog):
    return [json.loads(row.message.split('[LLMToolTurn] ', 1)[1])
        for row in caplog.records if '[LLMToolTurn] ' in row.message][-1]


def test_pre_tool_malformed_business_can_execute_semantic_in_same_turn(runtime, caplog):
    caplog.set_level(logging.INFO)
    runtime.provider.steps = [{'content': '{broken'}, step('interrupt', {'target_domain': 'DISCOVERY'}), step('discover_products', {
        'scope': 'drink', 'product_family': 'Beta', 'planned_discovery_reads': 1})]
    result = runtime.turn('Synthetic family discovery')
    assert result['error'] is None and [p['product_id'] for p in result['ui_payload']['products']] == ['102']
    assert len(runtime.provider.requests) == 3 and len(runtime.reads) == 1 and not runtime.writes
    assert runtime.provider.requests[1]['tools'] and runtime.provider.requests[1]['tool_choice'] == 'auto'
    assert metrics(caplog)['dialogue_format_repair_count'] == 1
    assert 'PRE_TOOL_RESPONSE_REPAIR' in metrics(caplog)['repair_modes']


def test_pre_tool_social_repair_has_no_business_authority(runtime, caplog):
    caplog.set_level(logging.INFO)
    runtime.provider.steps = [{'content': '{broken'}, final()]
    result = runtime.turn('A social fixture')
    assert result['error'] is None and result['reply'] == 'Dạ, chào bạn!'
    assert len(runtime.provider.requests) == 2 and runtime.provider.requests[1]['tools']
    assert not result['tool_calls_log'] and not runtime.reads and not runtime.writes
    assert metrics(caplog)['repair_mode'] == 'PRE_TOOL_RESPONSE_REPAIR'


def test_pre_tool_double_malformed_is_bounded_model_protocol(runtime, caplog):
    caplog.set_level(logging.INFO)
    before = deepcopy(cart_manager.get_cart(runtime.sid)['items'])
    runtime.provider.steps = [{'content': '{broken'}, {'content': 'still broken'}]
    result = runtime.turn('Synthetic purchase fixture')
    assert result['error'] == 'response_evidence_required' and result['error_class'] == 'MODEL_PROTOCOL'
    assert len(runtime.provider.requests) == 2 and metrics(caplog)['dialogue_format_repair_count'] == 1
    assert not runtime.reads and not runtime.writes and cart_manager.get_cart(runtime.sid)['items'] == before
    assert 'lỗi diễn giải' in result['reply']
    assert 'danh mục' not in result['reply'] and 'Bạn nhập thiếu' not in result['reply']


def test_pre_tool_repair_keeps_configuration_tools_for_existing_pending(runtime):
    send(runtime, 'Select Beta', ('SELECT_PRODUCT', {'reference': ref('102')}))
    runtime.provider.steps = [{'content': '{broken'}, step('configure_product', {
        'commitment': 'SELECTED', 'evidence': 'Synthetic size choice', 'size': 'M'})]
    result = runtime.turn('Synthetic size choice')
    assert result['error'] is None and len(runtime.writes) == 1
    assert runtime.writes[0][1]['product_id'] == '102'
    names = {t['function']['name'] for t in runtime.provider.requests[-1]['tools']}
    assert 'semantic_configure_product' in names


@pytest.mark.parametrize('rogue_write', [False, True])
def test_post_write_final_only_repair_locks_tools_and_receipt(runtime, monkeypatch, caplog, rogue_write):
    caplog.set_level(logging.INFO)
    send(runtime, 'Select Beta', ('SELECT_PRODUCT', {'reference': ref('102')}))
    # Exercise inference finalization even when deterministic rendering could
    # already finish this step. Production still keeps that early safe return.
    monkeypatch.setattr(ToolArtifacts, 'completed_customer_step', lambda self, **kwargs: None)
    proposal = {'commitment': 'SELECTED', 'evidence': 'Synthetic size choice', 'size': 'M'}
    corrected = final('consultation', 'Dạ, đã thêm món vào giỏ.')
    corrected['content'] = json.dumps({'response_kind': 'consultation', 'reply': 'Dạ, đã thêm món vào giỏ.',
        'mutation_claims': ['add_to_cart'], 'evidence_quotes': []})
    runtime.provider.steps = [step('configure_product', proposal), {'content': '{broken'},
        step('configure_product', proposal) if rogue_write else corrected]
    result = runtime.turn('Synthetic size choice', client_message_id='repair-once')
    request_count = len(runtime.provider.requests)
    replay = runtime.turn('Synthetic size choice', client_message_id='repair-once')
    assert result == replay and len(runtime.provider.requests) == request_count
    assert len(runtime.writes) == 1 and runtime.writes[0][1]['product_id'] == '102'
    assert not runtime.provider.requests[-1].get('tools')
    assert metrics(caplog)['final_envelope_repair_count'] == 1
    assert metrics(caplog)['repair_mode'] == 'POST_TOOL_FINAL_ENVELOPE_REPAIR'
    assert len([r for r in result['tool_calls_log'] if r['tool'] == 'add_to_cart' and r['result']['status'] == 'ok']) == 1
    assert any(p['product_id'] == '102' for p in result['ui_payload']['cart']['items'])
    assert result['error'] == ('repeated_tool_call' if rogue_write else None)


def test_post_read_final_only_repair_reuses_authoritative_result(runtime, monkeypatch, caplog):
    caplog.set_level(logging.INFO)
    monkeypatch.setattr(ToolArtifacts, 'completed_customer_step', lambda self, **kwargs: None)
    runtime.provider.steps = [step('ask_product_price', {'reference': ref('101')}),
        {'content': '{broken'}, final('consultation', 'Mình gửi thông tin giá đã xác minh.')]
    result = runtime.turn('Synthetic price question')
    assert result['error'] is None
    assert len(runtime.provider.requests) == 3 and not runtime.provider.requests[-1].get('tools')
    assert len(runtime.reads) == 1 and runtime.reads[0][0] == 'price' and not runtime.writes
    assert metrics(caplog)['repair_mode'] == 'POST_TOOL_FINAL_ENVELOPE_REPAIR'
    assert len(result['tool_calls_log']) == 1 and result['tool_calls_log'][0]['result']['status'] == 'ok'


def test_semantic_protocol_mode_restricts_same_operation(runtime, caplog):
    caplog.set_level(logging.INFO)
    runtime.provider.steps = [step('discover_products', {'product_family': 'Beta'}),
        step('discover_products', {'scope': 'drink', 'product_family': 'Beta', 'planned_discovery_reads': 1})]
    result = runtime.turn('Synthetic family discovery')
    assert result['error'] is None and len(runtime.reads) == 1 and not runtime.writes
    assert len(runtime.provider.requests) == 2
    assert {t['function']['name'] for t in runtime.provider.requests[1]['tools']} == {'semantic_discover_products'}
    assert metrics(caplog)['protocol_repair_count'] == 1
    assert metrics(caplog)['repair_mode'] == 'SEMANTIC_PROTOCOL_REPAIR'
