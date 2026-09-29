"""HTTP turn claims, replay, and failure recovery."""
import threading
import time
import uuid
import json
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException
from starlette.requests import Request


def _boundary(monkeypatch, *, fail_save=False, durable=None):
    import main
    from src.agents import agent_service
    from src.common import cart_manager, conversation_memory, session_auth

    monkeypatch.setattr(session_auth, 'authorize_session', lambda *_: None)
    monkeypatch.setattr(cart_manager, 'get_pending_action', lambda *_: {'type': 'confirm_address'})
    monkeypatch.setattr(cart_manager, 'get_checkout_prefs', lambda *_: {
        'delivery_type': 'MANG_DI', 'payment_method': 'NGAN_HANG_QR'})
    monkeypatch.setattr(cart_manager, 'get_cart', lambda *_: {'items': []})
    monkeypatch.setattr(cart_manager, 'load_durable_processed_turn', lambda *_: durable)

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
                return {'status': 'in_progress' if previous.get('_turn_status') == 'in_progress' else 'completed',
                        'response': dict(previous)}
            responses[turn] = {'_turn_status': 'in_progress', '_request_message': message,
                               '_selected_product_id': product}
            return {'status': 'claimed', 'history': list(messages)}

    failures_left = [1 if fail_save else 0]
    def save_exchange(**kwargs):
        with lock:
            if failures_left[0]:
                failures_left[0] -= 1
                raise RuntimeError('injected completion write failure')
            turn = kwargs['client_message_id']
            if responses[turn].get('_turn_status') != 'in_progress':
                return
            messages.extend([{'role': 'user', 'content': kwargs['user_message']},
                             {'role': 'assistant', 'content': kwargs['result']['reply']}])
            responses[turn] = {**kwargs['result'], '_request_message': kwargs['user_message'],
                               '_selected_product_id': kwargs['selected_product_id']}

    monkeypatch.setattr(conversation_memory, 'claim_turn', claim)
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
    send, calls, messages, _responses = _boundary(monkeypatch, fail_save=True, durable=None)
    with pytest.raises(HTTPException) as first:
        send()
    with pytest.raises(HTTPException) as second:
        send()
    assert first.value.status_code == second.value.status_code == 503
    assert calls == ['turn-1'] and not messages


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
