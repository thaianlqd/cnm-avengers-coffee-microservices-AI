"""Known no-tool provider failures can recover; uncertain writes stay fenced."""
from copy import deepcopy
import json
import threading
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
import pytest

from test_provider_wait_budget import offline, runtime, setup_latency
from src.common import agent_provider_policy as policy, cart_manager


def test_double_timeout_then_cooldown_has_exact_retry_delay(runtime, monkeypatch):
    fake = setup_latency(runtime, monkeypatch, [100, 100])
    _, first = fake.complete()
    assert first['provider_outage_phase'] == 'inference_failed'
    assert first['retry_after_seconds'] == 16
    fake.clock[0] += 5
    _, second = fake.complete()
    assert second['provider_outage_phase'] == 'cooldown'
    assert second['retry_after_seconds'] == 11
    assert second['provider_attempt_count'] == 0 and len(fake.calls) == 2


@pytest.mark.parametrize('durable_only', [False, True])
def test_known_no_tool_failure_can_retry_same_id_after_cooldown(runtime, monkeypatch, durable_only):
    from src.agents import llm_tool_orchestrator
    monkeypatch.setattr(llm_tool_orchestrator, 'run_llm_tool_turn', runtime.semantic_orchestrator)
    clock = [1000.0]
    monkeypatch.setattr(policy.time, 'monotonic', lambda: clock[0])
    monkeypatch.setattr(policy.time, 'time', lambda: clock[0])
    runtime.provider.steps = [TimeoutError('synthetic provider stall')]
    text, cid = 'Có thức uống nào trong menu hiện tại?', 'retry-known-no-tools'
    failed = runtime.turn(text, client_message_id=cid)
    assert failed['retry_after_seconds'] == 30 and '30 giây' in failed['reply']
    assert runtime.turn(text, client_message_id=cid) == failed
    assert len(runtime.provider.requests) == 1
    if durable_only:
        cart_manager.set_checkout_context(runtime.sid, processed_order_turns={})
    clock[0] += 31
    runtime.provider.plan([('customer_actions', {'actions': [{'tool': 'filter_catalog',
        'commitment': 'QUESTION', 'evidence': text, 'args': {'category': 'drink', 'search_text': '', 'limit': 2,
            'planned_discovery_reads': 1}}]})])
    runtime.provider.steps[-1] = {'content': json.dumps({'response_kind': 'consultation',
        'reply': 'Dạ, mình gửi các thức uống trong Menu.', 'mutation_claims': [], 'evidence_quotes': [],
        'display_product_ids': ['101', '102'], 'display_product_count': 2})}
    recovered = runtime.turn(text, client_message_id=cid)
    assert recovered['error'] is None and recovered['ui_payload']['products'], json.dumps({'logs': recovered['tool_calls_log'], 'feedback': runtime.provider.requests[-1]['messages'][-1]})
    recovered_requests = len(runtime.provider.requests)
    assert 2 <= recovered_requests <= 3 and not runtime.writes
    assert runtime.turn(text, client_message_id=cid) == recovered
    assert len(runtime.provider.requests) == recovered_requests


def test_retry_marker_cannot_unlock_unknown_or_executed_work():
    from src.common.provider_retry import retry_ready
    result = {'error': 'network_timeout', 'tool_calls_log': [], 'checkout_payload': None,
        '_provider_retry': {'no_tool_execution': True, 'retry_at': 10}}
    assert retry_ready(result, now=11)
    assert not retry_ready(result, now=9)
    for override in ({'error': 'outcome_unknown'}, {'_turn_status': 'outcome_unknown'},
        {'tool_calls_log': [{'tool': 'add_to_cart', 'result': {'status': 'ok'}}]},
        {'checkout_payload': {'action_id': 'prepared'}}, {'_provider_retry': None},
        {'_turn_status': 'in_progress'}, {'error': None},
        *({'_provider_retry': {'no_tool_execution': True, 'retry_at': value}}
          for value in (None, True, '10', float('nan'), float('inf'), -1))):
        assert not retry_ready({**result, **override}, now=11)


def test_http_claim_reopens_only_expired_known_no_tool_failure(monkeypatch):
    from src.common import conversation_memory as memory
    retry = {'error': 'network_timeout', 'tool_calls_log': [], 'checkout_payload': None,
        '_provider_retry': {'no_tool_execution': True, 'retry_at': 110},
        '_request_message': 'same', '_selected_product_id': None}
    row = {'session_id': 'customer', 'messages': [], 'state': {}, 'processed_responses': {'T': retry}}
    class Connection:
        def __enter__(self): return self
        def __exit__(self, *_): pass
        def execute(self, sql, params):
            if 'SET processed_responses' in str(sql):
                row['processed_responses'] = json.loads(params['responses'])
            return SimpleNamespace(mappings=lambda: SimpleNamespace(first=lambda: deepcopy(row)))
    monkeypatch.setattr(memory, '_ensure_table', lambda: None)
    monkeypatch.setattr(memory, '_get_engine', lambda: SimpleNamespace(begin=lambda: Connection()))
    clock = [100.0]
    monkeypatch.setattr(memory.time, 'time', lambda: clock[0])
    assert memory.claim_turn('fixture', 'customer', 'T', 'same', None)['status'] == 'completed'
    clock[0] = 111
    assert memory.claim_turn('fixture', 'customer', 'T', 'different', None)['status'] == 'conflict'
    assert memory.claim_turn('fixture', 'customer', 'T', 'same', None)['status'] == 'claimed'
    assert memory.claim_turn('fixture', 'customer', 'T', 'same', None)['status'] == 'in_progress'
    assert memory.claim_turn('fixture', 'customer', 'new', 'same', None)['status'] == 'blocked_by_turn'


def test_retry_marker_survives_durable_sanitization():
    from src.agents.order_flow_graph import _sanitize_replay_result
    result = {'reply': 'temporary', 'error': 'network_timeout', 'tool_calls_log': [],
        '_provider_retry': {'no_tool_execution': True, 'retry_at': 110}, 'retry_after_seconds': 30}
    compact = _sanitize_replay_result(result)
    assert compact['_provider_retry'] == result['_provider_retry']
    assert compact['retry_after_seconds'] == 30


def test_expired_retry_claim_serializes_concurrent_requests(monkeypatch):
    from src.common import conversation_memory as memory
    lock = threading.Lock()
    row = {'session_id': 'customer', 'messages': [], 'processed_responses': {'T': {
        '_request_message': 'same', '_selected_product_id': None, 'error': 'network_timeout',
        '_provider_retry': {'no_tool_execution': True, 'retry_at': 10}}}}
    class Connection:
        def __enter__(self):
            lock.acquire()
            return self
        def __exit__(self, *_): lock.release()
        def execute(self, sql, params):
            if 'SET processed_responses' in str(sql):
                row['processed_responses'] = json.loads(params['responses'])
            return SimpleNamespace(mappings=lambda: SimpleNamespace(first=lambda: deepcopy(row)))
    monkeypatch.setattr(memory, '_ensure_table', lambda: None)
    monkeypatch.setattr(memory, '_get_engine', lambda: SimpleNamespace(begin=lambda: Connection()))
    monkeypatch.setattr(memory.time, 'time', lambda: 11)
    barrier = threading.Barrier(2)
    def claim():
        barrier.wait(timeout=2)
        return memory.claim_turn('fixture', 'customer', 'T', 'same', None)['status']
    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = [future.result(timeout=3) for future in [pool.submit(claim), pool.submit(claim)]]
    assert sorted(statuses) == ['claimed', 'in_progress']


def test_inflight_retry_cannot_recover_old_no_tool_failure(monkeypatch):
    import main
    from fastapi import HTTPException
    from test_agent_chat_replay import _boundary
    failure = {'message': 'same', 'selected_product_id': None, 'result': {
        'reply': 'old outage', 'error': 'network_timeout',
        '_provider_retry': {'no_tool_execution': True, 'retry_at': 10}}}
    send, calls, messages, responses = _boundary(monkeypatch, durable=failure)
    monkeypatch.setattr(main, 'TURN_CLAIM_WAIT_SECONDS', 0)
    responses['turn-1'] = {'_turn_status': 'in_progress', '_request_message': 'same',
                           '_selected_product_id': None, '_claimed_at': main.time()}
    with pytest.raises(HTTPException) as exc:
        send(message='same')
    assert exc.value.status_code == 503
    assert exc.value.detail['code'] == 'TURN_IN_PROGRESS'
    assert not calls and not messages and responses['turn-1']['_turn_status'] == 'in_progress'


def test_http_reply_exposes_delay_but_not_private_retry_proof(monkeypatch):
    from test_agent_chat_replay import _boundary
    from src.agents import agent_service
    send, _, _, _ = _boundary(monkeypatch)
    monkeypatch.setattr(agent_service, 'run_agent', lambda **_: {
        'reply': 'Bạn đợi khoảng 30 giây.', 'error': 'network_timeout', 'retry_after_seconds': 30,
        '_provider_retry': {'no_tool_execution': True, 'retry_at': 110}})
    first = send().model_dump()
    assert first['retry_after_seconds'] == 30 and '_provider_retry' not in first
    assert send().model_dump() == first


def test_http_wait_can_acquire_expired_retry_claim(monkeypatch):
    from test_agent_chat_replay import _boundary
    from src.common import conversation_memory
    send, calls, _, responses = _boundary(monkeypatch)
    responses['turn-1'] = {'_turn_status': 'in_progress'}
    claims = iter([{'status': 'in_progress', 'response': {'_claimed_at': 10}},
                   {'status': 'claimed', 'history': []}])
    monkeypatch.setattr(conversation_memory, 'claim_turn', lambda *_: next(claims))
    assert send().error is None and calls == ['turn-1']


def test_new_no_tool_failure_still_reconciles_lost_completion_write(monkeypatch):
    import main
    from fastapi import HTTPException
    from test_agent_chat_replay import _boundary
    from src.agents import agent_service
    send, _, messages, responses = _boundary(monkeypatch, fail_save=True)
    monkeypatch.setattr(main, 'TURN_CLAIM_WAIT_SECONDS', 0)
    calls = []
    failure = {'reply': 'temporary', 'error': 'network_timeout', 'retry_after_seconds': 30,
               '_provider_retry': {'no_tool_execution': True, 'retry_at': main.time() + 30}}
    def run(**_):
        calls.append(1)
        return deepcopy(failure)
    monkeypatch.setattr(agent_service, 'run_agent', run)
    with pytest.raises(HTTPException): send()
    assert responses['turn-1']['_turn_status'] == 'outcome_unknown'
    assert send().error == 'network_timeout'
    assert calls == [1] and len(messages) == 2
    assert '_turn_status' not in responses['turn-1']


# Historical migration probes use the private offline adapter explicitly.
from test_semantic_control import private_migration_loop
pytestmark = pytest.mark.usefixtures("private_migration_loop")
