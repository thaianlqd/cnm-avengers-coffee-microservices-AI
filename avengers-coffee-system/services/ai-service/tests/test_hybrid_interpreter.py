import json
import logging
from copy import deepcopy
import pytest
from hybrid_support import runtime, hybrid, command as c, envelope as e, send, pending
from src.common import cart_manager
from src.agents import agent_service, llm_tool_orchestrator, turn_contract


def test_normal_one_request_no_tools_json_mode_and_no_final_synthesis(hybrid, monkeypatch):
    from src.agents.tool_policy import GuardedToolGateway
    for method in ('execute_semantic', 'provider_calls', 'provider_tool_surface', 'tool_surface', 'executors', 'enter_turn_repair'):
        monkeypatch.setattr(GuardedToolGateway, method, lambda *a, **k: pytest.fail('Semantic runtime in Hybrid'))
    monkeypatch.setattr(turn_contract.TurnContract, '__init__', lambda *a, **k: pytest.fail('TurnContract in Hybrid'))
    monkeypatch.setattr(llm_tool_orchestrator, 'run_llm_tool_turn', lambda *a, **k: pytest.fail('Legacy fallback'))
    result = send(hybrid, c('READ_CART'))
    assert result['error'] is None and result['provider_request_count'] == 1
    request = hybrid.provider.requests[0]
    assert 'tools' not in request and 'tool_choice' not in request
    assert request['response_format'] == {'type': 'json_object'}
    assert len(hybrid.provider.requests) == 1


def test_health_default_is_hybrid_without_provider_call(hybrid, monkeypatch):
    import main
    monkeypatch.delenv('AI_AGENT_ARCHITECTURE')
    monkeypatch.setattr(main, 'groq_is_available', lambda: False)
    from src.agents import agent_memory
    monkeypatch.setattr(agent_memory, 'redis_available', lambda: True)
    value = main.health()
    assert value['chat_orchestrator_mode'] == 'hybrid_commerce' and value['agent_architecture'] == 'hybrid'
    assert not hybrid.provider.requests


@pytest.mark.parametrize('bad', ['{broken', json.dumps(e(c('READ_CART', price=1))),
    json.dumps(e(c('UNKNOWN'))), json.dumps(e(c('SELECT_PRODUCTS', mode='EXPLICIT')))])
def test_exact_one_format_repair_then_valid_same_turn(hybrid, bad):
    hybrid.provider.steps = [{'content': bad}, {'content': json.dumps(e(c('READ_CART')))}]
    result = hybrid.turn()
    assert not result['error'] and result['provider_request_count'] == 2
    assert len(hybrid.provider.requests) == 2 and not hybrid.writes
    repair = hybrid.provider.requests[-1]['messages'][-1]['content']
    assert 'INTERPRETER_FORMAT_REPAIR' in repair and 'No tools or new meaning' in repair


def test_second_invalid_fails_closed_without_legacy_or_state_change(hybrid):
    before = deepcopy(cart_manager.get_cart(hybrid.sid))
    hybrid.provider.steps = [{'content': '{broken'}, {'content': '{still broken'}]
    result = hybrid.turn()
    assert result['error'] == 'invalid_json' and len(hybrid.provider.requests) == 2
    assert not hybrid.writes and cart_manager.get_cart(hybrid.sid)['items'] == before['items']


@pytest.mark.parametrize('step', [TimeoutError('offline timeout'), RuntimeError('429 rate limit'), {'content': ''},
    {'tool_calls': [{'id': 'forged', 'function': {'name': 'add_to_cart', 'arguments': '{}'}}]}])
def test_provider_resilience_no_tools_no_writes_budget_bounded(hybrid, step):
    hybrid.provider.steps = [step, {'content': '{broken'}]
    result = hybrid.turn()
    assert result['error'] and result['provider_request_count'] <= 2 and not hybrid.writes


def test_real_fake_transport_failover_plus_bad_json_consumes_total_two(hybrid, monkeypatch):
    from src.common import groq_service
    monkeypatch.setenv('AI_AGENT_FALLBACK_PROVIDERS', 'openai')
    monkeypatch.setenv('OPENAI_API_KEY', 'fixture-only-key')
    monkeypatch.setenv('AI_AGENT_MAX_PROVIDER_ATTEMPTS_PER_ROUND', '2')
    monkeypatch.setattr(groq_service, 'OpenAIClient', lambda *a, **k: hybrid.provider)
    hybrid.provider.steps = [TimeoutError('offline timeout'), {'content': '{broken'}]
    result = hybrid.turn()
    assert result['error'] and len(hybrid.provider.requests) == 2 and result['provider_request_count'] == 2


def test_default_architecture_and_invalid_flag(hybrid, monkeypatch):
    monkeypatch.delenv('AI_AGENT_ARCHITECTURE')
    assert send(hybrid, c('READ_CART'))['architecture'] == 'hybrid'
    monkeypatch.setenv('AI_AGENT_ARCHITECTURE', 'bad')
    with pytest.raises(ValueError, match='AI_AGENT_ARCHITECTURE'):
        hybrid.turn()


def test_social_cannot_assert_provider_business_facts_and_preserves_pending(hybrid):
    send(hybrid, c('SELECT_PRODUCTS', mode='ALL_VISIBLE'))
    before = deepcopy(pending(hybrid))
    hybrid.provider.steps = [{'content': json.dumps(e(kind='social', message='Đã tạo đơn. Tổng là 1đ.'))}]
    result = hybrid.turn('hello')
    assert result['error'] is None and '1đ' not in result['reply'] and 'Đã tạo đơn' not in result['reply']
    assert pending(hybrid) == before and not hybrid.writes


def test_logs_are_sanitized_and_have_grounding_dispatch_workflow(hybrid, caplog):
    caplog.set_level(logging.INFO)
    send(hybrid, c('SELECT_PRODUCTS', mode='ALL_VISIBLE'), text='private customer literal 13579')
    for name in ('HybridInterpretation', 'HybridGrounding', 'HybridDispatch', 'WorkflowTransition', 'HybridTurn'):
        assert name in caplog.text
    events = [r.getMessage() for r in caplog.records if r.getMessage().startswith(('[Hybrid', '[WorkflowTransition]'))]
    assert all('private customer literal' not in r and 'fixture-key' not in r for r in events)
