"""Deterministic sequential scheduler probes: no sleep and no live transport."""
from copy import deepcopy
from types import SimpleNamespace
import socket

import pytest
import requests

from test_llm_tool_orchestrator import runtime
from src.common import agent_provider_policy as policy, groq_service

PRIMARY = 'gemini-3.5-flash-lite'
SECONDARY = 'gemini-3.1-flash-lite'


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    def blocked(*args, **kwargs):
        raise AssertionError('Live transport forbidden in wait-budget tests')
    for provider in ('GEMINI', 'OPENAI', 'GROQ', 'OPENROUTER', 'CEREBRAS'):
        monkeypatch.setenv(provider + '_API_KEY', '')
    for name in ('AI_AGENT_PROVIDER_TIMEOUT_SECONDS', 'AI_AGENT_PROVIDER_ROUND_TIMEOUT_SECONDS',
                 'AI_AGENT_PROVIDER_TRANSIENT_COOLDOWN_SECONDS'):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(socket.socket, 'connect', blocked)
    monkeypatch.setattr(socket.socket, 'connect_ex', blocked)
    monkeypatch.setattr(socket, 'create_connection', blocked)
    monkeypatch.setattr(requests.sessions.Session, 'request', blocked)
    monkeypatch.setattr(requests, 'post', blocked)
    for name in ('OpenAIClient', 'OpenRouterClient'):
        monkeypatch.setattr(groq_service, name, blocked)


def setup_latency(runtime, monkeypatch, outcomes, *, models=(PRIMARY, SECONDARY)):
    monkeypatch.setenv('GEMINI_API_KEY', 'fixture-key-one,fixture-key-two,fixture-key-three')
    monkeypatch.setenv('AI_AGENT_GEMINI_LITE_MODELS', ','.join(models))
    monkeypatch.setenv('AI_AGENT_GEMINI_STANDARD_MODELS', ','.join(models))
    monkeypatch.setenv('AI_AGENT_ENABLE_MODEL_TIERING', '1')
    monkeypatch.setenv('AI_AGENT_MAX_PROVIDER_ATTEMPTS_PER_ROUND', '4')
    clock, calls, steps = [100.0], [], list(outcomes)
    monkeypatch.setattr(policy.time, 'monotonic', lambda: clock[0])
    def create(**kwargs):
        calls.append(deepcopy(kwargs))
        assert steps, 'Unexpected scripted attempt'
        outcome = steps.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        clock[0] += min(outcome, kwargs['timeout'])
        if outcome > kwargs['timeout']:
            raise requests.exceptions.ReadTimeout('Synthetic stall (not HTTP 429)')
        return groq_service.FakeResponse({'choices': [{'message': {'content': 'fixture response'}}]})
    monkeypatch.setattr(runtime.provider, 'create', create)
    def complete(**overrides):
        metrics = overrides.pop('metrics', {})
        schemas = overrides.pop('schemas', [])
        result = policy.completion([{'role': 'user', 'content': 'fixture request'}], schemas,
            preferred='gemini', explicit_model=None, tier='lite', max_tokens=600, metrics=metrics, **overrides)
        return result, metrics
    return SimpleNamespace(calls=calls, complete=complete, clock=clock, steps=steps)


@pytest.mark.parametrize('latency', [10, 11])
def test_slow_healthy_primary_reply_has_enough_budget(runtime, monkeypatch, latency):
    fake = setup_latency(runtime, monkeypatch, [latency])
    result, metrics = fake.complete()
    assert result[0] is not None and len(fake.calls) == 1
    assert fake.calls[0]['timeout'] == 14 and fake.calls[0]['model'] == PRIMARY
    assert metrics['provider_attempt_count'] == 1 and metrics['provider_failure_count'] == 0
    assert metrics['provider_wait_ms'] == latency * 1000
    assert not runtime.reads and not runtime.writes


def test_permanent_stalls_use_two_models_not_three_keys_and_finish_in_28s(runtime, monkeypatch):
    fake = setup_latency(runtime, monkeypatch, [100, 100])
    result, metrics = fake.complete()
    assert result[0] is None and result[-1] == 'network_timeout'
    assert [call['timeout'] for call in fake.calls] == [14, 14]
    assert [call['model'] for call in fake.calls] == [PRIMARY, SECONDARY]
    assert fake.clock[0] == 128 and metrics['provider_wait_ms'] == 28000
    assert metrics['provider_attempt_count'] == metrics['provider_failure_count'] == 2
    assert metrics['network_timeout_count'] == 2 and metrics['provider_attempts_by_provider'] == {'gemini': 2}
    assert metrics['credential_slots_tried'] == ['gemini:1']
    assert not runtime.reads and not runtime.writes


def test_secondary_slow_but_valid_reply_succeeds_after_primary_stall(runtime, monkeypatch):
    fake = setup_latency(runtime, monkeypatch, [100, 11])
    result, metrics = fake.complete()
    assert result[0] is not None and result[2] == SECONDARY and fake.clock[0] == 125
    assert [call['timeout'] for call in fake.calls] == [14, 14]
    assert metrics['fallback_count'] == 1 and metrics['failover_success']


def test_emergency_provider_gets_useful_time_and_same_history(runtime, monkeypatch):
    fake = setup_latency(runtime, monkeypatch, [100, 11])
    monkeypatch.setenv('OPENAI_API_KEY', 'fixture-emergency-key')
    monkeypatch.setenv('AI_AGENT_FALLBACK_PROVIDERS', 'openai')
    monkeypatch.setattr(groq_service, 'OpenAIClient', lambda *a, **k: runtime.provider)
    result, metrics = fake.complete()
    assert result[0] is not None and metrics['provider_attempts_by_provider'] == {'gemini': 1, 'openai': 1}
    assert [call['timeout'] for call in fake.calls] == [14, 14]
    assert [call['model'] for call in fake.calls] == [PRIMARY, 'gpt-4o-mini']
    assert fake.calls[0]['messages'] == fake.calls[1]['messages']
    assert metrics['failover_provider'] == 'openai' and fake.clock[0] == 125
    assert not runtime.writes


@pytest.mark.parametrize('configured,allowed', [(False, True), (True, False)])
def test_ineligible_emergency_does_not_reserve_or_call(runtime, monkeypatch, configured, allowed):
    fake = setup_latency(runtime, monkeypatch, [11], models=(PRIMARY,))
    monkeypatch.setenv('OPENAI_API_KEY', 'fixture-emergency-key' if configured else '')
    monkeypatch.setenv('AI_AGENT_FALLBACK_PROVIDERS', 'openai' if allowed else '')
    result, metrics = fake.complete()
    assert result[0] is not None and fake.calls[0]['timeout'] == 15
    assert metrics['provider_attempts_by_provider'] == {'gemini': 1}


def test_next_turn_skips_stalled_model_across_all_keys_then_expiry_restores(runtime, monkeypatch):
    fake = setup_latency(runtime, monkeypatch, [100, 1, 1, 1, 1])
    fake.complete()
    _, next_metrics = fake.complete()
    assert [call['model'] for call in fake.calls] == [PRIMARY, SECONDARY, SECONDARY]
    assert next_metrics['provider_routes_skipped_cooldown'] == 0
    assert next_metrics['provider_attempt_count'] == 1 and next_metrics['models_tried'] == [SECONDARY]
    fake.clock[0] += 31
    _, retained = fake.complete()
    assert retained['models_tried'] == [SECONDARY]
    fake.clock[0] += 180
    _, restored = fake.complete()
    assert restored['models_tried'] == [PRIMARY]
    assert ("gemini", PRIMARY) not in policy._transient_cooldowns


def test_all_routes_cooling_fail_immediately_without_key_cycling(runtime, monkeypatch):
    fake = setup_latency(runtime, monkeypatch, [100, 100])
    fake.complete()
    clock_before = fake.clock[0]
    result, metrics = fake.complete()
    assert result[-1] == 'network_timeout' and fake.clock[0] == clock_before
    assert metrics['provider_attempt_count'] == 0 and metrics['provider_failure_count'] == 0
    assert metrics['provider_routes_skipped_cooldown'] == 6 and len(fake.calls) == 2


def test_cooling_emergency_is_not_reserved(runtime, monkeypatch):
    fake = setup_latency(runtime, monkeypatch, [11], models=(PRIMARY,))
    monkeypatch.setenv('OPENAI_API_KEY', 'fixture-emergency-key')
    monkeypatch.setenv('AI_AGENT_FALLBACK_PROVIDERS', 'openai')
    policy._transient_cooldowns[('openai', 'gpt-4o-mini')] = (130, 'network_timeout')
    result, _ = fake.complete()
    assert result[0] is not None and fake.calls[0]['timeout'] == 15


@pytest.mark.parametrize('budget,expected', [(1, [15]), (2, [14, 14]), (4, [14, 14])])
def test_attempt_budget_never_expands_into_key_hops(runtime, monkeypatch, budget, expected):
    fake = setup_latency(runtime, monkeypatch, [100] * len(expected))
    monkeypatch.setenv('AI_AGENT_MAX_PROVIDER_ATTEMPTS_PER_ROUND', str(budget))
    result, metrics = fake.complete()
    assert result[0] is None and [call['timeout'] for call in fake.calls] == expected
    assert metrics['provider_attempt_count'] == len(expected) <= budget
    assert metrics['provider_wait_ms'] <= metrics['round_wait_budget_ms']


def test_old_explicit_30_45_values_are_safely_clamped_without_editing_env(runtime, monkeypatch):
    fake = setup_latency(runtime, monkeypatch, [100, 100])
    monkeypatch.setenv('AI_AGENT_PROVIDER_TIMEOUT_SECONDS', '30')
    monkeypatch.setenv('AI_AGENT_PROVIDER_ROUND_TIMEOUT_SECONDS', '45')
    _, metrics = fake.complete()
    assert [call['timeout'] for call in fake.calls] == [15, 15]
    assert metrics['provider_wait_ms'] == metrics['round_wait_budget_ms'] == 30000


def test_short_explicit_deadline_never_assigns_more_than_remaining(runtime, monkeypatch):
    fake = setup_latency(runtime, monkeypatch, [100, 100])
    monkeypatch.setenv('AI_AGENT_PROVIDER_TIMEOUT_SECONDS', '3')
    monkeypatch.setenv('AI_AGENT_PROVIDER_ROUND_TIMEOUT_SECONDS', '5')
    _, metrics = fake.complete()
    assert [call['timeout'] for call in fake.calls] == [2.5, 2.5]
    assert metrics['provider_wait_ms'] == 5000


def test_many_routes_do_not_starve_11_second_primary(runtime, monkeypatch):
    fake = setup_latency(runtime, monkeypatch, [11])
    monkeypatch.setenv('AI_AGENT_GEMINI_LITE_MODELS', PRIMARY+','+SECONDARY+',third-fixture-model')
    monkeypatch.setenv('OPENAI_API_KEY', 'fixture-emergency-key')
    monkeypatch.setenv('AI_AGENT_FALLBACK_PROVIDERS', 'openai')
    result, _ = fake.complete()
    assert result[0] is not None and fake.calls[0]['timeout'] == 14


def test_deadline_rejects_late_transport_response_without_starting_more_inference(runtime, monkeypatch):
    fake = setup_latency(runtime, monkeypatch, [], models=(PRIMARY,))
    def late(**kwargs):
        fake.clock[0] += 31
        return groq_service.FakeResponse({'choices': [{'message': {'content': 'late'}}]})
    monkeypatch.setattr(runtime.provider, 'create', late)
    result, metrics = fake.complete()
    assert result[0] is None and metrics['provider_attempt_count'] == 1
    assert result[-1] == 'network_timeout' and metrics['round_deadline_remaining_ms'] == 0


@pytest.mark.parametrize('configured,actual', [('0', 5), ('999', 60), ('invalid', 30)])
def test_transient_cooldown_configuration_is_short_bounded_and_temporary(runtime, monkeypatch, configured, actual):
    fake = setup_latency(runtime, monkeypatch, [100, 1], models=(PRIMARY,))
    monkeypatch.setenv('AI_AGENT_PROVIDER_TRANSIENT_COOLDOWN_SECONDS', configured)
    fake.complete()
    assert policy._transient_cooldowns[('gemini', PRIMARY)][0] == fake.clock[0] + actual
    before = fake.clock[0]
    skipped, metrics = fake.complete()
    assert skipped[0] is None and metrics['provider_attempt_count'] == 0 and fake.clock[0] == before
    fake.clock[0] += actual
    recovered, metrics = fake.complete()
    assert recovered[0] is not None and metrics['provider_attempt_count'] == 1
