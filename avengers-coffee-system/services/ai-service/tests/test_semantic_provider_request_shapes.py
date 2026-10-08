"""Provider capability projection, fake transports only."""
from dataclasses import replace
from types import SimpleNamespace
import pytest
from src.common import agent_provider_policy as policy, groq_service

SCHEMAS = [{'type': 'function', 'function': {'name': 'semantic_select_products',
    'parameters': {'type': 'object', 'properties': {}, 'additionalProperties': False}}}]


@pytest.mark.parametrize('provider', sorted(policy.PROVIDER_CAPABILITIES))
def test_one_tool_repair_request_payload(provider, monkeypatch):
    sent = []
    def create(**kwargs):
        sent.append(kwargs)
        return groq_service.FakeResponse({'choices': [{'message': {'content': '{}'}}]})
    fake = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    monkeypatch.setattr(policy, 'credentials', lambda _: ['synthetic-offline-only'])
    for name in ('GeminiClient', 'OpenAIClient', 'OpenRouterClient'):
        monkeypatch.setattr(groq_service, name, lambda *a, **k: fake)
    import groq
    monkeypatch.setattr(groq, 'Groq', lambda *a, **k: fake)
    monkeypatch.setattr(policy, '_cooldowns', {})
    monkeypatch.setattr(policy, '_transient_cooldowns', {})
    monkeypatch.setattr(policy, '_invalid_credentials', set())
    monkeypatch.setenv('AI_AGENT_FALLBACK_PROVIDERS', '')
    metrics = {}
    response, _, _, error = policy.completion([{'role': 'user', 'content': 'Synthetic'}], SCHEMAS,
        preferred=provider, explicit_model='synthetic-model', tier='standard', max_tokens=100,
        required=True, metrics=metrics, turn_health={'request_reason': 'semantic_wire_repair'})
    assert response and error is None and len(sent) == 1
    caps = policy.PROVIDER_CAPABILITIES[provider]
    expected = {'type': 'function', 'function': {'name': 'semantic_select_products'}} if caps.supports_named_tool_choice else 'auto'
    assert sent[0]['tool_choice'] == expected
    shape = metrics['provider_request_shapes'][0]
    assert shape['tool_choice_forced'] == caps.supports_named_tool_choice
    assert shape['request_reason'] == 'semantic_wire_repair'
    assert bool(sent[0].get('response_format')) == caps.supports_response_format_with_tools
    assert 'gemini_semantic_repair_auto' not in str(metrics)


def test_required_only_capability_is_explicit(monkeypatch):
    monkeypatch.setitem(policy.PROVIDER_CAPABILITIES, 'openai', replace(
        policy.PROVIDER_CAPABILITIES['openai'], supports_named_tool_choice=False))
    assert policy.tool_choice_for('openai', SCHEMAS, True) == ('required', 'required_forced')


def test_named_choice_diagnostics_are_content_free():
    from src.common.gemini_compat import request_diagnostics
    value = request_diagnostics({'tool_choice': {'type': 'function', 'function': {'name': 'private'}}, 'messages': [], 'tools': []})
    assert value['tool_choice'] == 'named_function'
    assert 'private' not in str(value)
