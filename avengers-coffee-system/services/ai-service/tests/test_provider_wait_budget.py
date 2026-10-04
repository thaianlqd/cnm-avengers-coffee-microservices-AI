"""Simulated latency exercises wait limits without sleeping or calling a provider."""
from copy import deepcopy
import socket

import pytest
import requests

from test_llm_tool_orchestrator import runtime
from src.common import agent_provider_policy as policy, groq_service


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    def blocked(*args, **kwargs):
        raise AssertionError('Live transport forbidden in wait-budget tests')
    for provider in ('GEMINI', 'OPENAI', 'GROQ', 'OPENROUTER', 'CEREBRAS'):
        monkeypatch.setenv(provider + '_API_KEY', '')
    monkeypatch.setattr(socket.socket, 'connect', blocked)
    monkeypatch.setattr(socket.socket, 'connect_ex', blocked)
    monkeypatch.setattr(socket, 'create_connection', blocked)
    monkeypatch.setattr(requests.sessions.Session, 'request', blocked)


def setup_latency(runtime, monkeypatch, latencies):
    monkeypatch.setenv('GEMINI_API_KEY', 'fixture-key-one,fixture-key-two,fixture-key-three')
    monkeypatch.setenv('AI_AGENT_MAX_PROVIDER_ATTEMPTS_PER_ROUND', '4')
    clock, calls = [100.0], []
    monkeypatch.setattr(policy.time, 'monotonic', lambda: clock[0])
    def create(**kwargs):
        calls.append(deepcopy(kwargs))
        latency = latencies[len(calls) - 1]
        clock[0] += min(latency, kwargs['timeout'])
        if latency > kwargs['timeout']:
            raise requests.exceptions.ReadTimeout('Synthetic slow response')
        return groq_service.FakeResponse({'choices': [{'message': {'content': 'fixture response'}}]})
    monkeypatch.setattr(runtime.provider, 'create', create)
    def complete():
        metrics = {}
        result = policy.completion([{'role': 'user', 'content': 'fixture request'}], [],
            preferred='gemini', explicit_model='test-model', tier='lite', max_tokens=600, metrics=metrics)
        return result, metrics
    return calls, complete


@pytest.mark.parametrize('wait,round_wait,succeeds', [(8, 12, False), (30, 45, True)])
def test_ten_second_reply_reproduces_old_cutoff_and_succeeds_with_longer_wait(runtime, monkeypatch, wait, round_wait, succeeds):
    monkeypatch.setenv('AI_AGENT_PROVIDER_TIMEOUT_SECONDS', str(wait))
    monkeypatch.setenv('AI_AGENT_PROVIDER_ROUND_TIMEOUT_SECONDS', str(round_wait))
    calls, complete = setup_latency(runtime, monkeypatch, [10, 10])
    result, metrics = complete()
    assert (result[0] is not None) is succeeds
    assert len(calls) == (1 if succeeds else 2)
    assert all(call['model'] == 'test-model' and call['max_tokens'] == 600 for call in calls)
    if not succeeds:
        assert [call['timeout'] for call in calls] == [8, 4]
        assert metrics['provider_error_type'] == 'ReadTimeout'
    assert not runtime.reads and not runtime.writes


def test_default_wait_accepts_slow_reply_in_one_attempt(runtime, monkeypatch):
    monkeypatch.delenv('AI_AGENT_PROVIDER_TIMEOUT_SECONDS', raising=False)
    monkeypatch.delenv('AI_AGENT_PROVIDER_ROUND_TIMEOUT_SECONDS', raising=False)
    calls, complete = setup_latency(runtime, monkeypatch, [15])
    result, metrics = complete()
    assert result[0] is not None and len(calls) == 1
    assert calls[0]['timeout'] == 30
    assert metrics['provider_attempt_count'] == 1


def test_permanent_stall_still_stops_at_the_round_deadline(runtime, monkeypatch):
    monkeypatch.setenv('AI_AGENT_PROVIDER_TIMEOUT_SECONDS', '30')
    monkeypatch.setenv('AI_AGENT_PROVIDER_ROUND_TIMEOUT_SECONDS', '45')
    calls, complete = setup_latency(runtime, monkeypatch, [100, 100])
    result, metrics = complete()
    assert result[0] is None and result[-1] == 'network_timeout'
    assert [call['timeout'] for call in calls] == [30, 15]
    assert metrics['provider_attempt_count'] == 2
    assert not runtime.reads and not runtime.writes


def test_explicit_small_wait_and_attempt_budget_remain_respected(runtime, monkeypatch):
    monkeypatch.setenv('AI_AGENT_PROVIDER_TIMEOUT_SECONDS', '3')
    monkeypatch.setenv('AI_AGENT_PROVIDER_ROUND_TIMEOUT_SECONDS', '10')
    calls, complete = setup_latency(runtime, monkeypatch, [100])
    monkeypatch.setenv('AI_AGENT_MAX_PROVIDER_ATTEMPTS_PER_ROUND', '1')
    result, metrics = complete()
    assert result[0] is None and len(calls) == 1
    assert calls[0]['timeout'] == 3
    assert metrics['provider_attempt_count'] == 1


def test_next_turn_advances_after_two_timeouts(runtime, monkeypatch):
    monkeypatch.setenv('AI_AGENT_PROVIDER_TIMEOUT_SECONDS', '8')
    monkeypatch.setenv('AI_AGENT_PROVIDER_ROUND_TIMEOUT_SECONDS', '12')
    calls, complete = setup_latency(runtime, monkeypatch, [100, 100, 100, 100])
    _, first = complete()
    _, second = complete()
    assert first['credential_slots_tried'] == ['gemini:1', 'gemini:2']
    assert second['credential_slots_tried'] == ['gemini:3', 'gemini:1']
    assert [call['timeout'] for call in calls] == [8, 4, 8, 4]


def test_configured_backup_has_time_within_existing_round_budget(runtime, monkeypatch):
    monkeypatch.setenv('AI_AGENT_PROVIDER_TIMEOUT_SECONDS', '8')
    monkeypatch.setenv('AI_AGENT_PROVIDER_ROUND_TIMEOUT_SECONDS', '12')
    calls, complete = setup_latency(runtime, monkeypatch, [100, 3])
    monkeypatch.setenv('OPENAI_API_KEY', 'fixture-backup-key')
    monkeypatch.setenv('AI_AGENT_FALLBACK_PROVIDERS', 'openai')
    monkeypatch.setattr(groq_service, 'OpenAIClient', lambda *args, **kwargs: runtime.provider)
    result, metrics = complete()
    assert result[0] is not None
    assert metrics['credential_slots_tried'] == ['gemini:1', 'openai:1']
    assert [call['timeout'] for call in calls] == [8, 4]
    assert all(call['max_tokens'] == 600 for call in calls)
    assert len(calls) == 2 and not runtime.writes
