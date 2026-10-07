"""Offline wire-contract regressions. Every HTTP send is scripted, never forwarded.

The shared runtime replaces cart/DB/Redis/catalog/options/mutations with memory
fakes. offline blocks socket + requests transport and removes provider keys;
wire restores only the real Gemini *serializer*, with requests.post scripted.
"""
from copy import deepcopy
import json
import socket
from types import SimpleNamespace

import pytest
import requests

from test_llm_tool_orchestrator import runtime  # Isolated business-authority fixture.
from src.agents.agent_memory import ConversationMemory, empty_memory
from src.agents.agent_context import build_context
from src.agents.tool_artifacts import ToolArtifacts
from src.agents.tool_capabilities import CAPABILITIES, tool_schemas
from src.agents.tool_policy import GuardedToolGateway
from src.common import agent_provider_policy as policy, cart_manager, groq_service
from src.common.gemini_compat import compatibility_error, inference_messages, request_diagnostics

GEMINI_CLIENT = groq_service.GeminiClient
OPENAI_CLIENT = groq_service.OpenAIClient
MODEL = 'gemini-3.1-flash-lite'
SIGNATURE_A = 'opaque fixture signature A+/= unchanged'
SIGNATURE_B = 'opaque fixture signature B+/= unchanged'


def blocked(*args, **kwargs):
    raise AssertionError('External transport/client forbidden in offline regression')


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    for provider in ('GEMINI', 'OPENAI', 'GROQ', 'OPENROUTER', 'CEREBRAS'):
        monkeypatch.setenv(provider+'_API_KEY', '')
    monkeypatch.setenv('AI_AGENT_FALLBACK_PROVIDERS', 'gemini')
    monkeypatch.setattr(socket.socket, 'connect', blocked)
    monkeypatch.setattr(socket.socket, 'connect_ex', blocked)
    monkeypatch.setattr(socket, 'create_connection', blocked)
    monkeypatch.setattr(requests.sessions.Session, 'request', blocked)
    monkeypatch.setattr(requests, 'post', blocked)
    for name in ('GeminiClient', 'OpenAIClient', 'OpenRouterClient', '_get_groq_client', '_resolve_chat_model'):
        monkeypatch.setattr(groq_service, name, blocked)


class HTTPResponse:
    def __init__(self, status=200, data=None):
        self.status_code, self.data = status, data or {}
        self.ok, self.headers = status == 200, {}
        self.text = json.dumps(self.data)
    def json(self):
        return self.data


def error(message):
    return HTTPResponse(400, {'error': {'message': message, 'status': 'INVALID_ARGUMENT'}})


def tool(name, args, signature=SIGNATURE_A, call_id='fixture-call-A'):
    call = {'id': call_id, 'type': 'function', 'function': {
        'name': name, 'arguments': json.dumps(args, ensure_ascii=False)}}
    if signature:
        call['extra_content'] = {'google': {'thought_signature': signature}}
    return {'tool_calls': [call]}


def envelope(claims=(), ids=None):
    value = {'response_kind': 'action' if claims else 'consultation',
        'reply': 'Đã cập nhật giỏ hàng.' if claims else 'Dạ, đây là các món để bạn chọn.',
        'mutation_claims': list(claims), 'evidence_quotes': []}
    if ids is not None:
        value['display_product_ids'] = ids
    return {'content': json.dumps(value, ensure_ascii=False)}


@pytest.fixture
def wire(offline, runtime, monkeypatch, caplog):
    # All values are synthetic. No dotenv loading, SDK discovery or fallback.
    monkeypatch.setenv('AI_AGENT_PROVIDER', 'gemini')
    monkeypatch.setenv('AI_AGENT_MODEL', MODEL)
    monkeypatch.setenv('GEMINI_API_KEY', 'offline-gemini-one,offline-gemini-two,offline-gemini-three')
    monkeypatch.setenv('AI_AGENT_FALLBACK_PROVIDERS', 'gemini')
    monkeypatch.setenv('AI_AGENT_MAX_PROVIDER_ATTEMPTS_PER_ROUND', '4')
    monkeypatch.setattr(groq_service, 'GeminiClient', GEMINI_CLIENT)
    steps, sent, slots = [], [], []
    def post(url, *, json, headers, timeout):
        assert url in {'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
                       'https://api.openai.com/v1/chat/completions'}
        sent.append(deepcopy(json))
        slots.append(headers['Authorization'])
        assert steps, 'Unexpected HTTP attempt (still fake; never forwarded)'
        step = steps.pop(0)
        if isinstance(step, Exception):
            raise step  # Scripted HTTP failure; never forwarded to a socket.
        if callable(step):
            step = step(json)
        return step if isinstance(step, HTTPResponse) else HTTPResponse(data={
            'choices': [{'message': step}], 'model': MODEL,
            'usage': {'prompt_tokens': 100, 'completion_tokens': 20}})
    monkeypatch.setattr(requests, 'post', post)
    caplog.set_level('INFO')
    return SimpleNamespace(steps=steps, sent=sent, slots=slots, runtime=runtime)


def browsing(wire):
    cart_manager.replace_items_from_order_cart(wire.runtime.sid, [])
    ConversationMemory(wire.runtime.redis).save(wire.runtime.sid, empty_memory())


def turn_metrics(caplog):
    return json.loads(next(record.message.split('[LLMToolTurn] ', 1)[1]
        for record in reversed(caplog.records) if '[LLMToolTurn] ' in record.message))


@pytest.mark.parametrize('another_tool', [False, True])
def test_real_serializer_preserves_signed_continuation_and_dynamic_surface(wire, caplog, another_tool):
    browsing(wire)
    wire.steps.append(tool('filter_catalog', {'search_text': '', 'limit': 2}))
    if another_tool:
        wire.steps.append(tool('get_product_options', {'product_id': '101'}, SIGNATURE_B, 'fixture-call-B'))
    wire.steps.append(envelope(ids=['101', '102']))
    result = wire.runtime.turn('Cho xem menu.')
    assert result['error'] is None
    assert len(wire.runtime.reads) == 1 and not wire.runtime.writes
    assert len(wire.sent[0]['tools']) == 8 and len(wire.sent[1]['tools']) == 12
    added = {r['function']['name'] for r in wire.sent[1]['tools']} - {r['function']['name'] for r in wire.sent[0]['tools']}
    assert added == {'get_product_options', 'check_price_and_stock', 'get_product_description', 'add_to_cart'}
    for payload in wire.sent[1:]:
        calls = [c for m in payload['messages'] for c in m.get('tool_calls', [])]
        responses = [m for m in payload['messages'] if m['role'] == 'tool']
        assert calls[0]['extra_content']['google']['thought_signature'] == SIGNATURE_A
        assert [c['id'] for c in calls] == [r['tool_call_id'] for r in responses]
        assert all(isinstance(r['content'], str) for r in responses)
    if another_tool:
        assert calls[1]['extra_content']['google']['thought_signature'] == SIGNATURE_B
    metrics = turn_metrics(caplog)
    assert metrics['final_synthesis_source'] == 'server_product_facts'
    assert metrics['provider_failure_count'] == 0
    assert metrics['request_count'] == 2 + another_tool
    assert SIGNATURE_A not in caplog.text and SIGNATURE_B not in caplog.text
    assert SIGNATURE_A not in json.dumps(result) and SIGNATURE_A not in json.dumps(wire.runtime.redis.data)
    assert all('response_format' not in p for p in wire.sent if p.get('tools'))


def test_recognized_format_retry_preserves_read_result_and_one_key(wire, caplog):
    browsing(wire)
    wire.steps.extend([tool('filter_catalog', {'search_text': '', 'limit': 2, 'planned_discovery_reads': 1}),
        error('response_format is not supported with tools'), envelope(ids=['101', '102'])])
    result = wire.runtime.turn('Cho xem menu.')
    assert result['error'] is None and len(wire.runtime.reads) == 1
    original, retry = wire.sent[1:]
    assert original['messages'] == retry['messages'] and not original.get('tools') and not retry.get('tools')
    assert original.get('tool_choice') == retry.get('tool_choice')
    assert 'response_format' in original and 'response_format' not in retry
    assert wire.slots[1] == wire.slots[2]
    metrics = turn_metrics(caplog)
    assert metrics['compatibility_retry_count'] == 1
    assert metrics['provider_attempt_count'] == 3 and metrics['request_count'] == 2
    assert metrics['provider_failure_count'] == 1 and metrics['fallback_count'] == 0
    assert metrics['final_synthesis_source'] == 'server_product_facts'
    assert metrics['provider_request_shapes'][1]['request_shape_fingerprint'] != metrics['provider_request_shapes'][2]['request_shape_fingerprint']


@pytest.mark.parametrize('message,count,category', [
    ('opaque unknown complaint private-body-marker', 1, 'unknown_incompatible_request'),
    ('Function call is missing a thought_signature private-body-marker', 1, 'tool_continuation_incompatible'),
    ('Invalid tools parameters additionalProperties private-body-marker', 1, 'tool_schema_incompatible'),
    ('response_format not supported private-body-marker', 1, 'response_format_incompatible'),
])
def test_400_stops_without_rotating_all_accounts_or_unbounded_retry(wire, caplog, message, count, category):
    wire.steps.extend([error(message), error(message)])
    metrics, health = {}, {}
    response, _, _, reason = policy.completion([{'role': 'user', 'content': 'private-user-marker'}],
        tool_schemas({'filter_catalog'}), preferred='gemini', explicit_model=MODEL, tier='lite',
        max_tokens=100, metrics=metrics, turn_health=health)
    assert response is None and reason == 'incompatible_request'
    assert len(wire.sent) == count and len(set(wire.slots)) == 1
    assert metrics['compatibility_retry_count'] == count - 1
    assert metrics['provider_error_category'] == category
    assert 'private-body-marker' not in caplog.text and 'private-user-marker' not in caplog.text
    assert 'offline-gemini-' not in caplog.text
    sent_count = len(wire.sent)
    # Same failed normalized structure is fenced without any HTTP/key attempts.
    policy.completion([{'role': 'user', 'content': 'different private text'}],
        tool_schemas({'filter_catalog'}), preferred='gemini', explicit_model=MODEL, tier='lite',
        max_tokens=100, turn_health=health)
    assert len(wire.sent) == sent_count


def test_retry_respects_attempt_budget(wire, monkeypatch):
    monkeypatch.setenv('AI_AGENT_MAX_PROVIDER_ATTEMPTS_PER_ROUND', '1')
    wire.steps.append(error('response_format not supported'))
    metrics = {}
    policy.completion([{'role': 'user', 'content': 'x'}], [], preferred='gemini',
        explicit_model=MODEL, tier='lite', max_tokens=100, metrics=metrics)
    assert len(wire.sent) == 1 and metrics['compatibility_retry_count'] == 0


@pytest.mark.parametrize('failed_final', [False, True])
def test_repaired_write_then_tools_disabled_retry_never_replays_mutation(wire, caplog, failed_final):
    wire.steps.extend([
        tool('update_cart_item', {'cart_item_id': '801', 'cart_line_ordinal': 1, 'desired_state': {'quantity': 2}}),
        tool('update_cart_item', {'cart_item_id': '800', 'cart_line_ordinal': 1, 'desired_state': {'quantity': 2}}, SIGNATURE_B, 'fixture-call-B'),
        error('response_format not supported')])
    wire.steps.append(tool('remove_cart_item', {'cart_item_id': '800'}) if failed_final else envelope(['update_cart_item']))
    result = wire.runtime.turn('Sửa món thứ 1 thành 2 ly.')
    assert len(wire.runtime.writes) == 1 and wire.runtime.writes[0][0] == 'update'
    assert wire.runtime.writes[0][1] == '800'
    repair_writes = {r['function']['name'] for r in wire.sent[1]['tools'] if CAPABILITIES[r['function']['name']].access != 'READ'}
    assert repair_writes == {'update_cart_item'}
    assert all('tools' not in p and 'tool_choice' not in p for p in wire.sent[2:])
    assert wire.sent[2]['messages'] == wire.sent[3]['messages']
    metrics = turn_metrics(caplog)
    assert metrics['compatibility_retry_count'] == 1
    assert metrics['provider_attempt_count'] == 4 and metrics['request_count'] == 3
    assert metrics['final_synthesis_source'] == 'server_customer_flow'
    if failed_final:
        assert result['error'] == 'repeated_tool_call'


def test_failed_final_read_uses_observable_factual_fallback(wire, caplog):
    browsing(wire)
    wire.steps.extend([tool('filter_catalog', {'search_text': '', 'limit': 2}), error('opaque complaint')])
    result = wire.runtime.turn('Cho xem menu.')
    assert result['error'] == 'incompatible_request' and len(result['ui_payload']['products']) == 2
    assert len(wire.runtime.reads) == 1 and not wire.runtime.writes
    assert turn_metrics(caplog)['final_synthesis_source'] == 'server_factual_fallback'


def test_gateway_strict_arguments_unchanged(wire):
    context, _ = build_context(wire.runtime.sid, empty_memory())
    artifacts = ToolArtifacts(empty_memory(), 'Synthetic request', context)
    gateway = GuardedToolGateway(wire.runtime.sid, 'Synthetic request', context, artifacts,
        client_message_id='fixture-turn', allowed_capabilities={'add_to_cart'})
    for invalid in ({'product_id': '101', 'quantity': True}, {'product_id': '101', 'quantity': 0},
                    {'product_id': '101', 'unknown_field': 'x'}, {'product_id': '101', 'toppings': ['x'] * 17}):
        assert gateway.dispatch('add_to_cart', invalid)['status'] == 'invalid_arguments'
    assert not wire.runtime.writes and not wire.sent


def test_other_provider_payload_and_canonical_history_are_unchanged(wire):
    message = tool('filter_catalog', {'search_text': ''})
    response = groq_service.FakeResponse({'choices': [{'message': message}]})
    internal = [{'role': 'assistant', 'content': '', 'tool_calls': [groq_service._continuation_tool_call(response.choices[0].message.tool_calls[0], 'gemini')]}]
    original = deepcopy(internal)
    wire.steps.append(envelope())
    OPENAI_CLIENT('offline-openai').chat.completions.create(model='fixture-model',
        messages=inference_messages(internal, 'openai'), tools=tool_schemas({'filter_catalog'}),
        tool_choice='required', response_format={'type': 'json_object'})
    assert internal == original
    assert 'extra_content' not in wire.sent[0]['messages'][0]['tool_calls'][0]
    assert wire.sent[0]['response_format'] == {'type': 'json_object'} and wire.sent[0]['tool_choice'] == 'required'


def test_diagnostics_exclude_contents_ids_arguments_and_signatures():
    messages = [{'role': 'user', 'content': 'private-content-A'},
        {'role': 'assistant', 'content': '', **tool('filter_catalog', {'search_text': 'private-argument-A'})},
        {'role': 'tool', 'tool_call_id': 'fixture-call-A', 'name': 'filter_catalog', 'content': 'private-result-A'}]
    kwargs = {'messages': messages, 'tools': tool_schemas({'filter_catalog'}),
        'tool_choice': 'auto', 'response_format': {'type': 'json_object'}}
    shape = request_diagnostics(kwargs)
    assert shape['thought_signature_count'] == 1 and shape['tool_result_ids_match']
    rendered = json.dumps(shape)
    assert all(value not in rendered for value in ('private-', 'fixture-call-A', SIGNATURE_A))
    changed = deepcopy(kwargs)
    changed['messages'][0]['content'] = 'private-content-B'
    changed['messages'][1]['tool_calls'][0]['function']['arguments'] = '{"search_text":"private-argument-B"}'
    changed['messages'][1]['tool_calls'][0]['extra_content']['google']['thought_signature'] = SIGNATURE_B
    changed['messages'][2]['content'] = 'private-result-B'
    assert request_diagnostics(changed) == shape
    changed.pop('response_format')
    assert request_diagnostics(changed)['request_shape_fingerprint'] != shape['request_shape_fingerprint']


@pytest.mark.parametrize('message,category,field', [
    ('response_format is unsupported', 'response_format_incompatible', 'response_format'),
    ("Function calling with a response mime type: 'application/json' is unsupported", 'response_format_incompatible', 'response_format'),
    ('Tool use with responseMimeType application/json is not supported', 'response_format_incompatible', 'response_format'),
    ('tool_choice is invalid', 'tool_choice_incompatible', 'tool_choice'),
    ('Invalid additionalProperties in parameters', 'tool_schema_incompatible', 'parameters'),
    ('Invalid tool_call_id', 'tool_message_incompatible', 'tool_call_id'),
    ('Missing thought_signature', 'tool_continuation_incompatible', 'tool_calls'),
    ('Unknown private complaint', 'unknown_incompatible_request', None),
])
def test_safe_error_categories(message, category, field):
    exc = groq_service.ProviderRequestError('gemini', error(message))
    assert policy.classify(exc)[0] == 'incompatible_request'
    assert compatibility_error(exc) == (category, field)
    assert message not in str(exc)


def test_native_mime_error_retries_format_once_without_replaying_mutations(wire, caplog):
    browsing(wire)
    wire.steps.extend([tool('filter_catalog', {'search_text': '', 'limit': 2, 'planned_discovery_reads': 1}),
        error("Function calling with a response mime type: 'application/json' is unsupported"), envelope(ids=['101', '102'])])
    result = wire.runtime.turn('Cho xem menu.')
    assert result['error'] is None and len(wire.runtime.reads) == 1
    assert wire.sent[1]['messages'] == wire.sent[2]['messages']
    assert wire.sent[1]['max_tokens'] == wire.sent[2]['max_tokens']
    assert 'response_format' in wire.sent[1] and 'response_format' not in wire.sent[2]
    assert wire.slots[-1] == wire.slots[-2] and not wire.runtime.writes


def test_semantic_repair_uses_auto_same_key_and_signed_history(wire, monkeypatch, caplog):
    from src.agents import llm_tool_orchestrator
    monkeypatch.setattr(llm_tool_orchestrator, 'run_llm_tool_turn', wire.runtime.semantic_orchestrator)
    message = 'Lấy món Alpha cỡ L nhé'
    proposal = {'commitment': 'SELECTED', 'args': {'product_id': '101', 'size': 'L'},
        'option_intent': 'CONFIGURE', 'evidence': message}
    wire.steps.extend([tool('customer_actions', {'actions': [proposal]}),
        tool('customer_actions', {'actions': [{**proposal, 'tool': 'add_to_cart'}]}, SIGNATURE_B)])
    result = wire.runtime.turn(message)
    assert result['error'] is None and len(wire.runtime.writes) == 1
    assert len(wire.sent) == 2 and len(set(wire.slots)) == 1
    assert all(payload['tool_choice'] == 'auto' and 'response_format' not in payload for payload in wire.sent)
    prior_call = wire.sent[1]['messages'][2]['tool_calls'][0]
    assert prior_call['extra_content']['google']['thought_signature'] == SIGNATURE_A
    assert turn_metrics(caplog)['protocol_repair_count'] == 1
    assert SIGNATURE_A not in caplog.text and SIGNATURE_A not in json.dumps(result)


def test_actions_in_final_json_are_unexecuted_until_tool_repair_and_siblings_survive(wire, monkeypatch, caplog):
    from src.agents import llm_tool_orchestrator
    monkeypatch.setattr(llm_tool_orchestrator, 'run_llm_tool_turn', wire.runtime.semantic_orchestrator)
    message = 'Bỏ dòng thứ hai; ly đầu lấy ba phần.'
    remove = {'tool': 'remove_cart_item', 'args': {}, 'commitment': 'AFFIRMED',
        'evidence': 'Bỏ dòng thứ hai', 'reference': {'namespace': 'CART_LINE', 'kind': 'ordinal', 'index': 2}}
    update = {'tool': 'update_cart_item', 'args': {'desired_state': {'quantity': 3}},
        'commitment': 'AFFIRMED', 'evidence': 'ly đầu lấy ba phần',
        'reference': {'namespace': 'CART_LINE', 'kind': 'ordinal', 'index': 1}}
    misplaced = {'reply': 'Đã xong', 'mutation_claims': ['remove_cart_item', 'update_cart_item'],
        'response_kind': 'action', 'evidence_quotes': [], 'actions': [remove, update]}
    def corrected(payload):
        assert not wire.runtime.writes  # The prose claim had no authority.
        assert 'server retains' in json.dumps(payload['messages'], ensure_ascii=False).lower()
        return tool('customer_actions', {'actions': [remove]})
    wire.steps.extend([{'content': '```json\n' + json.dumps(misplaced, ensure_ascii=False) + '\n```'}, corrected])
    result = wire.runtime.turn(message)
    assert result['error'] is None and len(wire.sent) == 2
    assert len(wire.runtime.writes) == 2
    assert cart_manager.get_cart(wire.runtime.sid)['items'][0]['quantity'] == 3
    assert turn_metrics(caplog)['protocol_repair_count'] == 1


@pytest.mark.parametrize('after_write', [False, True])
def test_network_failover_preserves_canonical_results_strips_only_google_metadata_and_never_replays(wire, monkeypatch, caplog, after_write):
    from src.agents import llm_tool_orchestrator
    monkeypatch.setattr(llm_tool_orchestrator, '_legacy_language_control', lambda *a: None)
    monkeypatch.setenv('OPENAI_API_KEY', 'offline-emergency-openai')
    monkeypatch.setenv('AI_AGENT_FALLBACK_PROVIDERS', 'openai')
    monkeypatch.setattr(groq_service, 'OpenAIClient', OPENAI_CLIENT)
    if after_write:
        message = 'Sửa món thứ 1 thành 2 ly.'
        wire.steps.append(tool('update_cart_item', {'cart_item_id': '800', 'cart_line_ordinal': 1,
            'desired_state': {'quantity': 2}}, call_id='committed-write-call'))
    else:
        browsing(wire)
        message = 'Cho xem menu.'
        wire.steps.append(tool('filter_catalog', {'search_text': '', 'limit': 2}))
    wire.steps.extend([requests.exceptions.ReadTimeout('scripted timeout'),
                      envelope(['update_cart_item'] if after_write else (), ids=None if after_write else ['101', '102'])])
    result = wire.runtime.turn(message, client_message_id='cross-provider-replay')
    replay = wire.runtime.turn(message, client_message_id='cross-provider-replay')
    assert result == replay and result['error'] is None and len(wire.sent) == 3
    gemini_final, alternate = wire.sent[1:]
    assert alternate['messages'] == inference_messages(gemini_final['messages'], 'openai')
    assert any(c.get('extra_content') for m in gemini_final['messages'] for c in m.get('tool_calls', []))
    assert all('extra_content' not in c for m in alternate['messages'] for c in m.get('tool_calls', []))
    calls = [c for m in alternate['messages'] for c in m.get('tool_calls', [])]
    results = [m for m in alternate['messages'] if m['role'] == 'tool']
    assert [c['id'] for c in calls] == [r['tool_call_id'] for r in results]
    assert results == [m for m in gemini_final['messages'] if m['role'] == 'tool']
    assert len(wire.runtime.writes) == int(after_write)
    if after_write:
        assert cart_manager.get_cart(wire.runtime.sid)['items'][0]['quantity'] == 2
        assert 'AI đang tạm thời không phản hồi' not in result['reply']
    metrics = turn_metrics(caplog)
    assert metrics['provider_attempt_count'] == 3 and metrics['provider_failure_count'] == 1
    assert metrics['request_count'] == 2 and metrics['fallback_count'] == 1
    assert metrics['provider_attempts_by_provider'] == {'gemini': 2, 'openai': 1}
    assert metrics['failover_success'] and metrics['failover_provider'] == 'openai'
    assert SIGNATURE_A not in caplog.text and 'offline-emergency-openai' not in caplog.text


def test_before_tool_network_failover_does_not_execute_business_tools(wire, monkeypatch, caplog):
    monkeypatch.setenv('OPENAI_API_KEY', 'offline-emergency-openai')
    monkeypatch.setenv('AI_AGENT_FALLBACK_PROVIDERS', 'openai')
    monkeypatch.setattr(groq_service, 'OpenAIClient', OPENAI_CLIENT)
    wire.steps.extend([requests.exceptions.ReadTimeout('scripted timeout'), {'content': json.dumps({
        'response_kind': 'social', 'reply': 'Xin chào bạn!', 'mutation_claims': [], 'evidence_quotes': []})}])
    result = wire.runtime.turn('Xin chào bạn', client_message_id='before-tool-failover')
    assert result['error'] is None and not wire.runtime.reads and not wire.runtime.writes
    assert len(wire.sent) == 2 and wire.sent[0]['messages'] == wire.sent[1]['messages']
    assert turn_metrics(caplog)['provider_attempts_by_provider'] == {'gemini': 1, 'openai': 1}
