"""Failure classes, bounded repairs, SDK retry ownership; every send is scripted."""
from copy import deepcopy
import hashlib
from types import SimpleNamespace

import pytest
import requests

from test_provider_wait_budget import offline, runtime, setup_latency, PRIMARY, SECONDARY
from src.common import agent_provider_policy as policy, groq_service


def error(status, text='private provider body', headers=None):
    response = SimpleNamespace(status_code=status, text=text, headers=headers or {})
    return groq_service.ProviderRequestError('gemini', response)


@pytest.mark.parametrize('exc,expected', [
    (requests.exceptions.ReadTimeout('read failed 429 quota'), 'network_timeout'),
    (requests.exceptions.ConnectTimeout('connect failed 503'), 'network_timeout'),
    (requests.exceptions.ConnectionError('connection failed'), 'network_timeout'),
    (error(429), 'rate_limit'), (error(503, 'quota backend failed'), 'provider_transient'),
    (error(503, 'model_not_found backend failed'), 'provider_transient'),
    (error(429, 'model_not_found in quota service'), 'rate_limit'),
    (error(401), 'invalid_credential'), (error(403), 'account_restricted'),
    (error(404), 'model_not_found'), (error(400), 'incompatible_request'),
    (error(400, 'maximum context length exceeded'), 'context_length'),
    (error(413, 'input token count too large'), 'context_length'),
    (error(413, 'tokens per minute exhausted'), 'rate_limit'),
    (ValueError('empty response'), 'provider_error'),
])
def test_error_classes_stay_distinct_without_leaking_bodies(exc, expected):
    assert policy.classify(exc)[0] == expected


def test_503_cools_model_across_keys_and_recovers_after_expiry(runtime, monkeypatch):
    fake = setup_latency(runtime, monkeypatch, [error(503), 1, 1, 1, 1])
    result, first = fake.complete()
    assert result[0] is not None and first['provider_transient_count'] == 1
    assert first['provider_error_category'] == 'provider_transient'
    fake.complete()
    assert [c['model'] for c in fake.calls] == [PRIMARY, SECONDARY, SECONDARY]
    fake.clock[0] += 31
    fake.complete()
    assert fake.calls[-1]['model'] == SECONDARY
    fake.clock[0] += 180
    fake.complete()
    assert fake.calls[-1]['model'] == PRIMARY


def test_retry_after_is_credential_cooldown_not_transient_and_does_not_sleep(runtime, monkeypatch):
    fake = setup_latency(runtime, monkeypatch, [error(429, headers={'Retry-After': '42'}), 1, 1, 1])
    _, metrics = fake.complete()
    assert metrics['retry_reason'] == metrics['provider_error_category'] == 'rate_limit'
    assert metrics['network_timeout_count'] == 0 and not policy._transient_cooldowns
    key = ('gemini', hashlib.sha256(b'fixture-key-one').hexdigest(), PRIMARY)
    assert policy._cooldowns[key] == 142
    assert metrics['credential_slots_tried'] == ['gemini:1', 'gemini:2']
    policy._next_slot['gemini'] = 0
    _, second = fake.complete()
    assert second['provider_routes_skipped_cooldown'] == 1 and second['credential_slots_tried'] == ['gemini:2']
    fake.clock[0] += 43
    policy._next_slot['gemini'] = 0
    _, restored = fake.complete()
    assert restored['credential_slots_tried'] == ['gemini:1'] and key not in policy._cooldowns


def test_429_emergency_is_allowed_only_by_explicit_configuration(runtime, monkeypatch):
    fake = setup_latency(runtime, monkeypatch, [error(429, headers={'Retry-After': '42'}), 11], models=(PRIMARY,))
    monkeypatch.setenv('GEMINI_API_KEY', 'fixture-key-one')
    monkeypatch.setenv('OPENAI_API_KEY', 'fixture-emergency-key')
    monkeypatch.setenv('AI_AGENT_FALLBACK_PROVIDERS', 'openai')
    monkeypatch.setattr(groq_service, 'OpenAIClient', lambda *a, **k: runtime.provider)
    result, metrics = fake.complete()
    assert result[0] is not None and metrics['provider_attempts_by_provider'] == {'gemini': 1, 'openai': 1}
    assert metrics['provider_wait_ms'] == 11000 and metrics['network_timeout_count'] == 0


def test_invalid_key_can_rotate_without_banning_other_keys_or_model(runtime, monkeypatch):
    fake = setup_latency(runtime, monkeypatch, [error(401), 1, 1])
    _, metrics = fake.complete()
    assert metrics['credential_slots_tried'] == ['gemini:1', 'gemini:2']
    assert not policy._transient_cooldowns and not policy._cooldowns
    policy._next_slot['gemini'] = 0
    _, second = fake.complete()
    assert second['credential_slots_tried'] == ['gemini:2']


def test_account_restricted_is_turn_local_separate_from_transient(runtime, monkeypatch):
    fake = setup_latency(runtime, monkeypatch, [error(403), 1, 1])
    health = {}
    _, metrics = fake.complete(turn_health=health)
    assert health['restricted_accounts'] and metrics['provider_error_category'] == 'account_restricted'
    assert not policy._transient_cooldowns
    policy._next_slot['gemini'] = 0
    _, second = fake.complete(turn_health=health)
    assert second['credential_slots_tried'] == ['gemini:2']


@pytest.mark.parametrize('failure,expected', [(error(404), 'model_not_found'),
    (error(400, 'invalid tools parameters'), 'tool_schema_incompatible'), (ValueError('empty'), 'provider_error')])
def test_noncredential_failures_change_model_not_key(runtime, monkeypatch, failure, expected):
    fake = setup_latency(runtime, monkeypatch, [failure, 1])
    _, metrics = fake.complete(schemas=[{'type': 'function', 'function': {'name': 'fixture_tool',
        'parameters': {'type': 'object', 'properties': {}}}}])
    assert metrics['models_tried'] == [PRIMARY, SECONDARY]
    assert metrics['credential_slots_tried'] == ['gemini:1'] and metrics['provider_error_category'] == expected
    assert not policy._transient_cooldowns


@pytest.mark.parametrize('budget,attempts', [(1, 1), (4, 2)])
def test_400_format_downgrade_is_same_route_bounded(runtime, monkeypatch, budget, attempts):
    fake = setup_latency(runtime, monkeypatch, [error(400, 'response_format unsupported'), 1], models=(PRIMARY,))
    monkeypatch.setenv('AI_AGENT_MAX_PROVIDER_ATTEMPTS_PER_ROUND', str(budget))
    _, metrics = fake.complete()
    assert metrics['provider_attempt_count'] == attempts
    assert metrics['compatibility_retry_count'] == attempts - 1 and metrics.get('fallback_count', 0) == 0
    assert not metrics.get('failover_success')  # A format correction is not a provider/model/key failover.
    assert metrics['credential_slots_tried'] == ['gemini:1']
    if attempts == 2:
        assert fake.calls[0]['messages'] == fake.calls[1]['messages']
        assert 'response_format' in fake.calls[0] and 'response_format' not in fake.calls[1]


def test_context_compaction_once_preserves_pairs_and_budget(runtime, monkeypatch):
    fake = setup_latency(runtime, monkeypatch, [error(413), error(413)], models=(PRIMARY,))
    compacted = []
    def compact(messages):
        compacted.append(deepcopy(messages))
        return [{'role': 'system', 'content': 'compact trusted state'}, *messages]
    result, metrics = fake.complete(compact_messages=compact)
    assert result[-1] == 'context_length' and metrics['context_compaction_count'] == 1
    assert metrics['provider_attempt_count'] == 2 and len(compacted) == 1
    assert fake.calls[1]['messages'][1:] == fake.calls[0]['messages']
    assert metrics['credential_slots_tried'] == ['gemini:1'] and not policy._transient_cooldowns


def test_no_implicit_provider_when_fallback_env_missing(runtime, monkeypatch):
    fake = setup_latency(runtime, monkeypatch, [100], models=(PRIMARY,))
    monkeypatch.delenv('AI_AGENT_FALLBACK_PROVIDERS', raising=False)
    monkeypatch.setenv('OPENAI_API_KEY', 'fixture-emergency-key')
    _, metrics = fake.complete()
    assert metrics['provider_attempts_by_provider'] == {'gemini': 1}


def test_groq_sdk_has_no_hidden_retry(runtime, monkeypatch):
    fake = setup_latency(runtime, monkeypatch, [100, 11])
    monkeypatch.setenv('GROQ_API_KEY', 'fixture-groq-key')
    monkeypatch.setenv('AI_AGENT_FALLBACK_PROVIDERS', 'groq')
    constructor = []
    import groq
    def sdk(**kwargs):
        constructor.append(kwargs)
        return runtime.provider
    monkeypatch.setattr(groq, 'Groq', sdk)
    _, metrics = fake.complete()
    assert constructor == [{'api_key': 'fixture-groq-key', 'max_retries': 0}]
    assert metrics['provider_attempt_count'] == 2 and metrics['provider_attempts_by_provider'] == {'gemini': 1, 'groq': 1}


def test_openrouter_hidden_model_fallback_disabled(runtime, monkeypatch):
    fake = setup_latency(runtime, monkeypatch, [100, 11])
    monkeypatch.setenv('OPENROUTER_API_KEY', 'fixture-router-key')
    monkeypatch.setenv('AI_AGENT_FALLBACK_PROVIDERS', 'openrouter')
    monkeypatch.setattr(groq_service, 'OpenRouterClient', lambda *a, **k: runtime.provider)
    _, metrics = fake.complete()
    assert fake.calls[1]['allow_fallback'] is False
    assert metrics['provider_attempts_by_provider'] == {'gemini': 1, 'openrouter': 1}


def test_success_clears_transient_health_from_an_inflight_route(runtime, monkeypatch):
    fake = setup_latency(runtime, monkeypatch, [1], models=(PRIMARY,))
    create = runtime.provider.create
    def in_flight(**kwargs):
        policy._transient_cooldowns[('gemini', PRIMARY)] = (130, 'network_timeout')
        return create(**kwargs)
    monkeypatch.setattr(runtime.provider, 'create', in_flight)
    result, _ = fake.complete()
    assert result[0] is not None and ('gemini', PRIMARY) not in policy._transient_cooldowns


def test_safe_telemetry_is_content_free_exact_and_skips_are_not_attempts(runtime, monkeypatch, caplog):
    fake = setup_latency(runtime, monkeypatch, [error(503, 'private-error-body'), 1])
    caplog.set_level('INFO')
    _, metrics = fake.complete()
    assert metrics['provider_attempt_count'] == sum(metrics['provider_attempts_by_provider'].values()) == 2
    assert metrics['provider_failure_count'] == 1 and len(metrics['provider_request_shapes']) == 2
    assert metrics['provider_routes_skipped_cooldown'] == 2
    assert metrics['provider_route_selected']['model'] == SECONDARY
    rendered = caplog.text + str(metrics)
    assert all(marker not in rendered for marker in ('private-error-body', 'fixture-key', 'fixture request', 'Authorization'))
    assert metrics['provider_request_shapes'][0]['round_deadline_remaining_ms'] == 28000
    assert metrics['provider_request_shapes'][0]['timeout_seconds'] == 14


def test_custom_transport_budget_shares_connect_and_read_without_retries():
    timeout = groq_service._request_timeout(14)
    assert timeout.total == 14 and timeout.connect_timeout == 3
    timeout.start_connect()
    assert 0 < timeout.read_timeout <= 14


def test_rate_limited_keys_cannot_consume_reserved_emergency_attempt(runtime, monkeypatch):
    fake = setup_latency(runtime, monkeypatch, [error(429), error(429), error(429), 11])
    monkeypatch.setenv('GEMINI_API_KEY', 'fixture-key-one,fixture-key-two,fixture-key-three,fixture-key-four')
    monkeypatch.setenv('OPENAI_API_KEY', 'fixture-emergency-key')
    monkeypatch.setenv('AI_AGENT_FALLBACK_PROVIDERS', 'openai')
    monkeypatch.setattr(groq_service, 'OpenAIClient', lambda *a, **k: runtime.provider)
    result, metrics = fake.complete()
    assert result[0] is not None and metrics['provider_attempt_count'] == 4
    assert metrics['provider_attempts_by_provider'] == {'gemini': 3, 'openai': 1}
    assert fake.calls[-1]['timeout'] >= 11


@pytest.mark.parametrize('failure,compaction', [(error(400, 'response_format unsupported'), False),
    (error(413), True)])
def test_internal_repairs_share_last_reserved_emergency_send(runtime, monkeypatch, failure, compaction):
    fake = setup_latency(runtime, monkeypatch, [failure, 11], models=(PRIMARY,))
    monkeypatch.setenv('AI_AGENT_MAX_PROVIDER_ATTEMPTS_PER_ROUND', '2')
    monkeypatch.setenv('OPENAI_API_KEY', 'fixture-emergency-key')
    monkeypatch.setenv('AI_AGENT_FALLBACK_PROVIDERS', 'openai')
    monkeypatch.setattr(groq_service, 'OpenAIClient', lambda *a, **k: runtime.provider)
    result, metrics = fake.complete(compact_messages=lambda rows: [{'role': 'system', 'content': 'compact'}, *rows])
    assert result[0] is not None and metrics['provider_attempts_by_provider'] == {'gemini': 1, 'openai': 1}
    assert metrics['compatibility_retry_count'] == 0
    assert metrics.get('context_compaction_count', 0) == int(compaction)
    assert fake.calls[1]['messages'][-1] == fake.calls[0]['messages'][-1]
