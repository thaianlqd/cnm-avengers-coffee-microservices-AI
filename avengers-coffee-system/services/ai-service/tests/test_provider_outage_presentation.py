"""Provider outages use a clear message without changing inference or business writes."""
from copy import deepcopy
import socket

import pytest
import requests

from test_llm_tool_orchestrator import runtime
from src.common import cart_manager


class ServiceUnavailable(Exception):
    status_code = 503


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    def blocked(*args, **kwargs):
        raise AssertionError('Live network forbidden in offline outage tests')
    for provider in ('GEMINI', 'OPENAI', 'GROQ', 'OPENROUTER', 'CEREBRAS'):
        monkeypatch.setenv(provider + '_API_KEY', '')
    monkeypatch.setattr(socket.socket, 'connect', blocked)
    monkeypatch.setattr(socket.socket, 'connect_ex', blocked)
    monkeypatch.setattr(socket, 'create_connection', blocked)
    monkeypatch.setattr(requests.sessions.Session, 'request', blocked)


@pytest.mark.parametrize('failure,category', [
    (TimeoutError('synthetic timeout'), 'network_timeout'),
    (ServiceUnavailable('synthetic service unavailable'), 'provider_transient'),
])
def test_outage_before_any_tool_explains_failure_without_changing_cart(runtime, failure, category):
    before = deepcopy(cart_manager.get_cart(runtime.sid)['items'])
    runtime.provider.steps = [failure]
    result = runtime.turn('hello tôi muốn mua cà phê nóng')
    assert result['error'] == category
    assert 'AI đang tạm thời không phản hồi' in result['reply']
    assert 'chưa xác minh' not in result['reply']
    assert not result['tool_calls_log'] and not result['ui_payload']['products']
    assert not runtime.reads and not runtime.writes
    assert cart_manager.get_cart(runtime.sid)['items'] == before
    assert len(runtime.provider.requests) == 1  # Existing attempt budget remains in force.


def test_new_message_after_outage_can_use_the_normal_discovery_flow(runtime):
    runtime.provider.steps = [TimeoutError('synthetic timeout')]
    message = 'hello tôi muốn mua cà phê nóng'
    runtime.turn(message)
    runtime.provider.plan([('filter_catalog', {'category': 'drink', 'search_text': 'cà phê', 'limit': 2})])
    result = runtime.turn(message)
    assert result['ui_payload']['products']
    assert 'AI đang tạm thời không phản hồi' not in result['reply']
    assert len(runtime.reads) == 1 and not runtime.writes


def test_outage_after_a_write_keeps_verified_result_and_replay_does_not_repeat_it(runtime, monkeypatch):
    from src.agents import llm_tool_orchestrator
    monkeypatch.setattr(llm_tool_orchestrator, '_legacy_language_control', lambda *a: None)
    runtime.provider.plan([('update_cart_item', {
        'cart_item_id': '800', 'cart_line_ordinal': 1, 'desired_state': {'quantity': 2},
    })])
    runtime.provider.steps[-1] = TimeoutError('synthetic timeout after write')
    result = runtime.turn('món 1 thì 2 ly nhé', client_message_id='outage-after-write')
    replay = runtime.turn('món 1 thì 2 ly nhé', client_message_id='outage-after-write')
    assert result == replay and len(runtime.writes) == 1
    assert cart_manager.get_cart(runtime.sid)['items'][0]['quantity'] == 2
    assert 'AI đang tạm thời không phản hồi' not in result['reply']


def test_other_unverified_outcomes_keep_the_existing_fallback(runtime, monkeypatch):
    from src.common import groq_service
    monkeypatch.setattr(groq_service, 'groq_agent_chat', lambda **kwargs: {
        'reply': '', 'error': 'context_budget_exceeded', 'tool_calls_log': [], 'checkout_payload': None,
    })
    result = runtime.turn('hello tôi muốn mua cà phê nóng')
    assert 'chưa xác minh' in result['reply']
    assert 'AI đang tạm thời không phản hồi' not in result['reply']
    assert not runtime.provider.requests and not runtime.writes
