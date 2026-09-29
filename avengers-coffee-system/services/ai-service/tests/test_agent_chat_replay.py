"""The HTTP chat boundary must replay completed turns without appending history."""
import uuid

import pytest
from fastapi import HTTPException
from starlette.requests import Request


def test_lost_http_response_replays_same_id_three_times(monkeypatch):
    from main import AgentChatRequest, agent_chat
    from src.agents import agent_service
    from src.common import cart_manager, conversation_memory, session_auth

    monkeypatch.setattr(session_auth, 'authorize_session', lambda *_: None)
    monkeypatch.setattr(cart_manager, 'get_pending_action', lambda *_: {'type': 'confirm_address'})
    monkeypatch.setattr(cart_manager, 'get_checkout_prefs', lambda *_: {
        'delivery_type': 'MANG_DI', 'payment_method': 'NGAN_HANG_QR'})
    monkeypatch.setattr(cart_manager, 'get_cart', lambda *_: {'items': []})

    cache = {}
    messages = []
    calls = []
    monkeypatch.setattr(conversation_memory, 'get_cached_response',
                        lambda _conversation, _session, turn: dict(cache[turn]) if turn in cache else None)
    monkeypatch.setattr(conversation_memory, 'load',
                        lambda *_: {'messages': list(messages)})
    def save_exchange(**kwargs):
        messages.extend([{'role': 'user', 'content': kwargs['user_message']},
                         {'role': 'assistant', 'content': kwargs['result']['reply']}])
        cache[kwargs['client_message_id']] = {
            **kwargs['result'], '_request_message': kwargs['user_message'],
            '_selected_product_id': kwargs['selected_product_id']}
    monkeypatch.setattr(conversation_memory, 'save_exchange', save_exchange)
    def run_agent(**kwargs):
        calls.append(kwargs['client_message_id'])
        return {'reply': 'Bạn đang ở địa chỉ nào để mình tìm cửa hàng gần nhất?',
                'checkout_payload': None, 'tool_calls_log': [], 'error': None}
    monkeypatch.setattr(agent_service, 'run_agent', run_agent)

    conversation_id = str(uuid.uuid4())
    request = Request({'type': 'http', 'headers': []})
    message = 'cho tôi lấy tại quán và chuyển khoản qr nhé'
    def send(turn):
        return agent_chat(AgentChatRequest(session_id='customer', conversation_id=conversation_id,
                                          client_message_id=turn, message=message), request)
    first = send('turn-1')
    assert send('turn-1').model_dump() == first.model_dump()
    assert send('turn-1').model_dump() == first.model_dump()
    assert calls == ['turn-1']
    assert len(messages) == 2
    send('turn-2')
    assert calls == ['turn-1', 'turn-2']
    assert len(messages) == 4


def test_cache_unavailable_does_not_run_graph(monkeypatch):
    from main import AgentChatRequest, agent_chat
    from src.agents import agent_service
    from src.common import conversation_memory, session_auth

    monkeypatch.setattr(session_auth, 'authorize_session', lambda *_: None)
    def unavailable(*_):
        raise RuntimeError('storage unavailable')
    monkeypatch.setattr(conversation_memory, 'get_cached_response', unavailable)
    monkeypatch.setattr(agent_service, 'run_agent', lambda **_: pytest.fail('graph ran without replay check'))
    with pytest.raises(HTTPException) as exc:
        agent_chat(AgentChatRequest(session_id='customer', conversation_id=str(uuid.uuid4()),
                                    client_message_id='turn-1', message='pickup'),
                   Request({'type': 'http', 'headers': []}))
    assert exc.value.status_code == 503
