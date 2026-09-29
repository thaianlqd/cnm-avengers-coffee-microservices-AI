"""HTTP turn claims, replay, and failure recovery."""
import threading
import time
import uuid
import json
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException
from starlette.requests import Request


def _boundary(monkeypatch, *, fail_save=False, durable=None, fail_durable=False):
    import main
    from src.agents import agent_service
    from src.common import cart_manager, conversation_memory, session_auth

    monkeypatch.setattr(session_auth, 'authorize_session', lambda *_: None)
    monkeypatch.setattr(cart_manager, 'get_pending_action', lambda *_: {'type': 'confirm_address'})
    monkeypatch.setattr(cart_manager, 'get_checkout_prefs', lambda *_: {
        'delivery_type': 'MANG_DI', 'payment_method': 'NGAN_HANG_QR'})
    monkeypatch.setattr(cart_manager, 'get_cart', lambda *_: {'items': []})
    durable_records = {}
    def persist(_session, turn, record):
        if fail_durable:
            raise RuntimeError('injected strict replay write failure')
        durable_records[turn] = record
    monkeypatch.setattr(cart_manager, 'persist_processed_turn_durable', persist)
    monkeypatch.setattr(cart_manager, 'load_durable_processed_turn',
                        lambda _session, turn: durable if durable is not None else durable_records.get(turn))

    responses = {}
    messages = []
    lock = threading.Lock()
    calls = []

    def claim(_conversation, _session, turn, message, product):
        with lock:
            previous = responses.get(turn)
            if previous:
                if previous['_request_message'] != message or previous['_selected_product_id'] != product:
                    return {'status': 'conflict'}
                return {'status': previous.get('_turn_status') if previous.get('_turn_status') in {'in_progress', 'outcome_unknown'} else 'completed',
                        'response': dict(previous)}
            responses[turn] = {'_turn_status': 'in_progress', '_request_message': message,
                               '_selected_product_id': product, '_claimed_at': time.time()}
            return {'status': 'claimed', 'history': list(messages)}

    def mark_unknown(_conversation, _session, turn, phase):
        with lock:
            if responses[turn].get('_turn_status') not in {'in_progress', 'outcome_unknown'}:
                return False
            responses[turn] = {**responses[turn], '_turn_status': 'outcome_unknown',
                               '_failure_phase': phase, '_failed_at': time.time()}
            return True

    failures_left = [1 if fail_save else 0]
    def save_exchange(**kwargs):
        with lock:
            if failures_left[0]:
                failures_left[0] -= 1
                raise RuntimeError('injected completion write failure')
            turn = kwargs['client_message_id']
            if responses[turn].get('_turn_status') not in {'in_progress', 'outcome_unknown'}:
                return
            messages.extend([{'role': 'user', 'content': kwargs['user_message']},
                             {'role': 'assistant', 'content': kwargs['result']['reply']}])
            responses[turn] = {**kwargs['result'], '_request_message': kwargs['user_message'],
                               '_selected_product_id': kwargs['selected_product_id']}

    monkeypatch.setattr(conversation_memory, 'claim_turn', claim)
    monkeypatch.setattr(conversation_memory, 'mark_outcome_unknown', mark_unknown)
    monkeypatch.setattr(conversation_memory, 'save_exchange', save_exchange)
    monkeypatch.setattr(conversation_memory, 'load', lambda *_: {'messages': list(messages)})

    def run_agent(**kwargs):
        calls.append(kwargs['client_message_id'])
        return {'reply': 'Bạn đang ở địa chỉ nào để mình tìm cửa hàng gần nhất?',
                'checkout_payload': None, 'tool_calls_log': [], 'error': None}
    monkeypatch.setattr(agent_service, 'run_agent', run_agent)
    conversation_id = str(uuid.uuid4())
    request = Request({'type': 'http', 'headers': []})
    def send(turn='turn-1', message='cho tôi lấy tại quán và chuyển khoản qr nhé', product=None):
        return main.agent_chat(main.AgentChatRequest(session_id='customer', conversation_id=conversation_id,
                                                    client_message_id=turn, message=message,
                                                    selected_product_id=product), request)
    return send, calls, messages, responses


def test_lost_http_response_replays_same_id_three_times(monkeypatch):
    send, calls, messages, _responses = _boundary(monkeypatch)
    first = send()
    assert send().model_dump() == first.model_dump()
    assert send().model_dump() == first.model_dump()
    assert calls == ['turn-1'] and len(messages) == 2
    send('turn-2')
    assert calls == ['turn-1', 'turn-2'] and len(messages) == 4
    with pytest.raises(HTTPException) as exc:
        send('turn-1', 'different message')
    assert exc.value.status_code == 409 and len(calls) == 2
    with pytest.raises(HTTPException) as product_conflict:
        send('turn-1', product='another-product')
    assert product_conflict.value.status_code == 409 and len(calls) == 2


def test_concurrent_identical_turns_run_graph_once(monkeypatch):
    from src.agents import agent_service
    send, calls, messages, _responses = _boundary(monkeypatch)
    start = threading.Barrier(2)
    original = agent_service.run_agent
    def delayed(**kwargs):
        time.sleep(0.2)  # Keep the first claim in progress while the other arrives.
        return original(**kwargs)
    monkeypatch.setattr(agent_service, 'run_agent', delayed)
    def request():
        start.wait(timeout=2)
        return send().model_dump()
    with ThreadPoolExecutor(max_workers=2) as pool:
        first, second = [future.result(timeout=5) for future in [pool.submit(request), pool.submit(request)]]
    assert first == second
    assert calls == ['turn-1'] and len(messages) == 2


def test_in_progress_turn_rejects_different_payload(monkeypatch):
    from src.agents import agent_service
    send, calls, messages, _responses = _boundary(monkeypatch)
    entered = threading.Event()
    release = threading.Event()
    original = agent_service.run_agent
    def delayed(**kwargs):
        entered.set()
        assert release.wait(timeout=3)
        return original(**kwargs)
    monkeypatch.setattr(agent_service, 'run_agent', delayed)
    with ThreadPoolExecutor(max_workers=1) as pool:
        first = pool.submit(send)
        assert entered.wait(timeout=3)
        with pytest.raises(HTTPException) as exc:
            send(message='different while in progress')
        assert exc.value.status_code == 409
        release.set()
        first.result(timeout=3)
    assert calls == ['turn-1'] and len(messages) == 2


def test_failed_completion_write_recovers_only_from_durable_business_result(monkeypatch):
    import main
    monkeypatch.setattr(main, 'TURN_CLAIM_WAIT_SECONDS', 0)
    result = {'reply': 'Đã xử lý', 'checkout_payload': None, 'tool_calls_log': [], 'error': None}
    durable = {'message': 'cho tôi lấy tại quán và chuyển khoản qr nhé',
               'selected_product_id': None, 'result': result}
    send, calls, messages, _responses = _boundary(monkeypatch, fail_save=True, durable=durable)
    with pytest.raises(HTTPException) as exc:
        send()
    assert exc.value.status_code == 503
    replay = send()
    assert replay.reply == 'Đã xử lý'
    assert calls == ['turn-1'] and len(messages) == 2


def test_failed_completion_without_durable_business_result_never_reruns(monkeypatch):
    import main
    monkeypatch.setattr(main, 'TURN_CLAIM_WAIT_SECONDS', 0)
    send, calls, messages, responses = _boundary(monkeypatch, fail_save=True, fail_durable=True)
    with pytest.raises(HTTPException) as first:
        send()
    with pytest.raises(HTTPException) as second:
        send()
    assert first.value.status_code == second.value.status_code == 503
    assert calls == ['turn-1'] and not messages
    assert responses['turn-1']['_turn_status'] == 'outcome_unknown'


def test_graph_exception_marks_unknown_and_same_id_does_not_rerun(monkeypatch):
    import main
    from src.agents import agent_service
    monkeypatch.setattr(main, 'TURN_CLAIM_WAIT_SECONDS', 0)
    send, _calls, messages, responses = _boundary(monkeypatch, fail_durable=True)
    calls = []
    def failed(**kwargs):
        calls.append(kwargs['client_message_id'])
        raise RuntimeError('injected graph failure')
    monkeypatch.setattr(agent_service, 'run_agent', failed)
    for _ in range(2):
        with pytest.raises(HTTPException) as exc:
            send()
        assert exc.value.status_code == 503
    assert calls == ['turn-1'] and not messages
    assert responses['turn-1']['_turn_status'] == 'outcome_unknown'
    assert responses['turn-1']['_failure_phase'] == 'graph_failed'


def test_graph_exception_recovers_existing_durable_business_result(monkeypatch):
    from src.agents import agent_service
    result = {'reply': 'Đã xử lý', 'checkout_payload': None, 'tool_calls_log': [], 'error': None}
    durable = {'message': 'cho tôi lấy tại quán và chuyển khoản qr nhé',
               'selected_product_id': None, 'result': result}
    send, _calls, messages, responses = _boundary(monkeypatch, durable=durable)
    monkeypatch.setattr(agent_service, 'run_agent', lambda **_: (_ for _ in ()).throw(RuntimeError('late crash')))
    assert send().reply == 'Đã xử lý'
    assert len(messages) == 2
    assert responses['turn-1']['reply'] == 'Đã xử lý'


def test_strict_replay_write_failure_with_completed_conversation_is_success(monkeypatch):
    send, calls, messages, _responses = _boundary(monkeypatch, fail_durable=True)
    first = send()
    assert send().model_dump() == first.model_dump()
    assert calls == ['turn-1'] and len(messages) == 2


def test_stale_claim_becomes_outcome_unknown_without_rerunning(monkeypatch):
    import main
    from src.common import conversation_memory
    monkeypatch.setattr(main, 'TURN_CLAIM_WAIT_SECONDS', 0)
    send, calls, messages, responses = _boundary(monkeypatch, fail_durable=True)
    responses['turn-1'] = {'_turn_status': 'in_progress',
        '_request_message': 'cho tôi lấy tại quán và chuyển khoản qr nhé',
        '_selected_product_id': None, '_claimed_at': time.time() - conversation_memory.STALE_CLAIM_SECONDS - 1}
    with pytest.raises(HTTPException) as first:
        send()
    with pytest.raises(HTTPException) as second:
        send()
    assert first.value.status_code == second.value.status_code == 503
    assert responses['turn-1']['_turn_status'] == 'outcome_unknown'
    assert responses['turn-1']['_failure_phase'] == 'stale_claim'
    assert not calls and not messages


def test_strict_business_replay_write_requires_transaction_ack(monkeypatch):
    from src.common import cart_manager
    transactions = []
    class Connection:
        def __enter__(self): return self
        def __exit__(self, kind, *_):
            if kind is None:
                transactions.append('committed')
        def execute(self, sql, params):
            assert 'ON CONFLICT (session_id)' in str(sql)
            assert params['turn_id'] == 'T'
            assert json.loads(params['record'])['result']['reply'] == 'done'
            transactions.append('written')
    class Engine:
        def begin(self): return Connection()
    monkeypatch.setattr(cart_manager, '_ensure_table_exists', lambda *_: None)
    monkeypatch.setattr(cart_manager, 'get_db_engine', lambda: Engine())
    record = {'message': 'same', 'selected_product_id': None, 'result': {'reply': 'done'}}
    cart_manager.persist_processed_turn_durable('session', 'T', record)
    assert transactions == ['written', 'committed']

    class FailedEngine:
        def begin(self): raise RuntimeError('database unavailable')
    monkeypatch.setattr(cart_manager, 'get_db_engine', lambda: FailedEngine())
    with pytest.raises(RuntimeError, match='database unavailable'):
        cart_manager.persist_processed_turn_durable('session', 'T', record)


def test_response_retention_uses_timestamps_and_preserves_unresolved(monkeypatch):
    from src.common import conversation_memory
    previous = {'recent': {'reply': 'recent', '_completed_at': 1000}}
    previous.update({f'old-{index}': {'reply': 'old', '_completed_at': index + 1}
                     for index in range(48, -1, -1)})
    previous['unknown'] = {'_turn_status': 'outcome_unknown', '_claimed_at': 1}
    previous['running'] = {'_turn_status': 'in_progress', '_claimed_at': 2}
    previous['current'] = {'_turn_status': 'in_progress', '_request_message': 'same',
                           '_selected_product_id': None, '_claimed_at': 1001}
    row = {'session_id': 'customer', 'messages': [], 'state': {}, 'processed_responses': previous}
    class Result:
        def mappings(self): return self
        def first(self): return dict(row)
    class Connection:
        def __enter__(self): return self
        def __exit__(self, *_): pass
        def execute(self, sql, params):
            if 'INSERT INTO' in str(sql):
                row['processed_responses'] = json.loads(params['responses'])
                row['messages'] = json.loads(params['messages'])
            return Result()
    class Engine:
        def begin(self): return Connection()
    monkeypatch.setattr(conversation_memory, '_ensure_table', lambda: None)
    monkeypatch.setattr(conversation_memory, '_get_engine', lambda: Engine())
    conversation_memory.save_exchange('conversation', 'customer', 'same', {'reply': 'new'},
                                      client_message_id='current')
    remaining = row['processed_responses']
    assert len(remaining) == 50
    assert {'recent', 'unknown', 'running', 'current'} <= set(remaining)
    assert 'old-0' not in remaining and 'old-48' in remaining
    assert len(row['messages']) == 2


def test_unknown_claim_can_complete_later_without_duplicate_history(monkeypatch):
    from src.common import conversation_memory
    row = {'session_id': 'customer', 'messages': [], 'state': {}, 'processed_responses': {
        'T': {'_turn_status': 'in_progress', '_request_message': 'same',
              '_selected_product_id': None, '_claimed_at': 1}}}
    class Result:
        def mappings(self): return self
        def first(self): return dict(row)
    class Connection:
        def __enter__(self): return self
        def __exit__(self, *_): pass
        def execute(self, sql, params):
            if 'SET processed_responses' in str(sql) or 'INSERT INTO' in str(sql):
                row['processed_responses'] = json.loads(params['responses'])
            if 'INSERT INTO' in str(sql):
                row['messages'] = json.loads(params['messages'])
            return Result()
    class Engine:
        def begin(self): return Connection()
    monkeypatch.setattr(conversation_memory, '_ensure_table', lambda: None)
    monkeypatch.setattr(conversation_memory, '_get_engine', lambda: Engine())
    assert conversation_memory.mark_outcome_unknown('conversation', 'customer', 'T', 'graph_failed')
    unknown = row['processed_responses']['T']
    assert unknown['_turn_status'] == 'outcome_unknown' and unknown['_failed_at']
    conversation_memory.save_exchange('conversation', 'customer', 'same', {'reply': 'done'},
                                      client_message_id='T')
    conversation_memory.save_exchange('conversation', 'customer', 'same', {'reply': 'done'},
                                      client_message_id='T')
    assert len(row['messages']) == 2
    assert row['processed_responses']['T']['reply'] == 'done'
    assert not conversation_memory.mark_outcome_unknown('conversation', 'customer', 'T', 'stale_claim')


def test_cache_unavailable_does_not_run_graph(monkeypatch):
    from src.agents import agent_service
    from src.common import conversation_memory
    send, calls, _messages, _responses = _boundary(monkeypatch)
    monkeypatch.setattr(conversation_memory, 'claim_turn', lambda *_: (_ for _ in ()).throw(RuntimeError('DB unavailable')))
    monkeypatch.setattr(agent_service, 'run_agent', lambda **_: pytest.fail('graph ran without claim'))
    with pytest.raises(HTTPException) as exc:
        send()
    assert exc.value.status_code == 503 and not calls


def test_database_claim_serializes_simultaneous_requests(monkeypatch):
    from src.common import conversation_memory

    lock = threading.Lock()
    record = {'session_id': 'customer', 'messages': [], 'processed_responses': {}}
    class Result:
        def mappings(self): return self
        def first(self): return dict(record)
    class Connection:
        def __enter__(self):
            lock.acquire()
            return self
        def __exit__(self, *_): lock.release()
        def execute(self, statement, params):
            sql = str(statement)
            if 'SET processed_responses' in sql:
                record['processed_responses'] = json.loads(params['responses'])
            return Result()
    class Engine:
        def begin(self): return Connection()
    monkeypatch.setattr(conversation_memory, '_ensure_table', lambda: None)
    monkeypatch.setattr(conversation_memory, '_get_engine', lambda: Engine())
    barrier = threading.Barrier(2)
    conversation_id = str(uuid.uuid4())
    def claim():
        barrier.wait(timeout=2)
        return conversation_memory.claim_turn(conversation_id, 'customer', 'T', 'same', None)['status']
    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = [future.result(timeout=3) for future in [pool.submit(claim), pool.submit(claim)]]
    assert sorted(statuses) == ['claimed', 'in_progress']
    assert len(record['processed_responses']) == 1


def test_recovery_does_not_trust_ram_only_business_cache(monkeypatch):
    from src.common import cart_manager
    session = 'ram-only-' + uuid.uuid4().hex
    cart_manager.set_checkout_context(session, processed_order_turns={
        'T': {'message': 'same', 'selected_product_id': None, 'result': {'reply': 'done'}}})
    class Result:
        def mappings(self): return self
        def first(self): return None
    class Connection:
        def __enter__(self): return self
        def __exit__(self, *_): pass
        def execute(self, *_args, **_kwargs): return Result()
    class Engine:
        def connect(self): return Connection()
    monkeypatch.setattr(cart_manager, 'get_db_engine', lambda: Engine())
    monkeypatch.setattr(cart_manager, '_ensure_table_exists', lambda *_: None)
    assert cart_manager.get_checkout_prefs(session)['processed_order_turns']['T']['result']['reply'] == 'done'
    assert cart_manager.load_durable_processed_turn(session, 'T') is None
