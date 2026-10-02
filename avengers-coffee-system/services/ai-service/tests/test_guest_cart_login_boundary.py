"""Guest cart CRUD and login gates, with scripted inference and no transport."""
from copy import deepcopy
from types import SimpleNamespace
from uuid import uuid4
import pytest
from fastapi import HTTPException

from test_llm_tool_orchestrator import runtime
from src.agents import agent_service
from src.agents.agent_context import build_context, model_projection
from src.agents.agent_memory import ConversationMemory, empty_memory
from src.agents.tool_artifacts import ToolArtifacts
from src.agents.tool_capabilities import capabilities_for_context
from src.agents.tool_policy import GuardedToolGateway
from src.common import cart_manager
from src.common.session_auth import authorize_session, is_guest_session_id
from src.function_calling.tools import cart_tools

@pytest.fixture
def guest(runtime, monkeypatch):
    runtime.sid = f'anon-{uuid4()}:conversation:{uuid4()}'
    monkeypatch.setattr(cart_tools, 'is_authenticated_cart_session', lambda _: False)
    cart_manager.replace_items_from_order_cart(runtime.sid, [])
    ConversationMemory(runtime.redis).save(runtime.sid, {**empty_memory(), 'visible_snapshots': {'products': runtime.products}, 'focus': {'product': runtime.products[0]}})
    runtime.turn = lambda message, **kwargs: agent_service.run_agent(runtime.sid, message, client_message_id=kwargs.pop('client_message_id', uuid4().hex), **kwargs)
    return runtime


def test_guest_can_configure_add_edit_remove_and_get_polite_cart_review(guest):
    guest.provider.plan([('add_to_cart', {'product_id': '101', 'quantity': 2, 'size': 'L', 'toppings': ['Pearl']})])
    result = guest.turn('cho tôi hai ly Alpha size L và Pearl')
    assert [row[0] for row in guest.writes] == ['add']
    assert len(guest.provider.requests) <= 2
    assert '**Giỏ hàng của bạn:**' in result['reply']
    assert cart_manager.get_cart(guest.sid)['items'][0]['quantity'] == 2
    assert not result['ui_payload'].get('login_action')
    line = cart_manager.get_cart(guest.sid)['items'][0]['cart_item_id']
    guest.provider.plan([('update_cart_item', {'cart_item_id': str(line), 'desired_state': {'quantity': 3}})])
    guest.turn('sửa món này thành ba ly')
    assert cart_manager.get_cart(guest.sid)['items'][0]['quantity'] == 3
    guest.provider.plan([('remove_cart_item', {'cart_item_id': str(line)})])
    guest.turn('xóa món này')
    assert [row[0] for row in guest.writes] == ['add', 'update', 'remove']
    assert not cart_manager.get_cart(guest.sid)['items']


def test_guest_checkout_login_gate_stops_without_an_extra_model_request(guest):
    guest.provider.plan([('add_to_cart', {'product_id': '101', 'size': 'M', 'toppings': []})])
    guest.turn('cho tôi Alpha size M')
    before = deepcopy(cart_manager.get_cart(guest.sid)['items'])
    n = len(guest.provider.requests)
    guest.provider.plan([('finish_cart', {})])
    result = guest.turn('dùng voucher rồi đặt hàng giúp tôi')
    assert result['ui_payload']['login_action']['href'] == '/?tab=login'
    assert '**đăng nhập' in result['reply']
    assert len(guest.provider.requests) == n + 1
    assert result['tool_calls_log'][0]['result']['status'] == 'login_required'
    assert cart_manager.get_cart(guest.sid)['items'] == before
    assert not result.get('checkout_payload') and not result['ui_payload'].get('vouchers')


@pytest.mark.parametrize('operation,args', [
    ('apply_voucher', {'voucher_code': 'SAVE'}), ('skip_voucher', {}), ('get_applicable_vouchers', {}),
    ('get_user_profile', {}), ('get_payment_options', {}),
    ('set_checkout_choices', {'delivery_type': 'MANG_DI'}), ('request_checkout', {}), ('confirm_checkout', {}),
])
def test_guest_cannot_bypass_account_gate_with_direct_tool_proposals(guest, operation, args):
    memory = ConversationMemory(guest.redis).load(guest.sid)
    context, _ = build_context(guest.sid, memory)
    g = GuardedToolGateway(guest.sid, 'tiếp tục', context, ToolArtifacts(memory, 'tiếp tục', context), 'turn')
    assert g.dispatch(operation, args)['status'] == 'login_required'
    assert not guest.writes


def test_guest_cart_context_is_authoritative_but_never_authenticates_the_account(guest):
    context, _ = build_context(guest.sid, ConversationMemory(guest.redis).load(guest.sid))
    assert context['business']['cart_verified'] and not context['business']['authenticated']
    assert 'finish_cart' in capabilities_for_context(context)
    model, _ = model_projection(context)
    assert 'guest_session_id' not in model['business']
    assert context['business']['guest_session_id'] not in str(model)


def test_guest_authorization_requires_strong_identity_and_no_account_token():
    owner = f'anon-{uuid4()}'
    assert is_guest_session_id(owner) and authorize_session(owner, None) is None
    for invalid in ['anon-123', owner + ':conversation:abc']:
        with pytest.raises(HTTPException): authorize_session(invalid, None)
    with pytest.raises(HTTPException): authorize_session(owner, 'Bearer account-token')


def test_guest_transport_uses_exact_owner_across_conversations_and_never_account_uuid(monkeypatch):
    owner = f'anon-{uuid4()}'
    calls = []
    payload = {'cart_id': f'user:{owner}', 'user_id': owner, 'cart_version': 3,
        'items': [{'line_id': 31, 'product_id': 70, 'product_name': 'Matcha', 'quantity': 2, 'unit_price': 65000, 'toppings': ['Pearl']}]}
    def transport(method, path, token, **kwargs):
        calls.append((method, path, kwargs))
        return SimpleNamespace(raise_for_status=lambda: None, json=lambda: deepcopy(payload))
    monkeypatch.setattr(cart_tools, '_order_service_request', transport)
    first = cart_tools.sync_authoritative_cart(owner + ':conversation:old')
    second = cart_tools.sync_authoritative_cart(owner + ':conversation:new')
    assert first['authoritative'] and second['items'] == first['items']
    assert not cart_tools.is_authenticated_cart_session(owner)
    assert all(path == f'/cart/{owner}' for _, path, _ in calls)
    assert cart_tools.execute_update_cart_item(owner + ':conversation:new', '31', {'quantity': 3}, 'update') ['status'] == 'ok'
    assert any(method == 'PATCH' and args['headers']['X-Cart-User-Id'] == owner for method, _, args in calls)
    assert cart_tools.execute_remove_cart_item(owner, '31', 'remove')['status'] == 'ok'
    assert calls[-1][0] == 'DELETE' and calls[-1][2]['headers']['X-Cart-User-Id'] == owner
    before = len(calls)
    with pytest.raises(ValueError): cart_tools._quote_authoritative_cart(owner, 'SAVE')
    with pytest.raises(ValueError): cart_tools._quote_authoritative_cart(owner, include_delivery=True)
    assert len(calls) == before


def test_guest_cart_read_failure_does_not_fall_back_to_an_unverified_local_cart(monkeypatch):
    owner = f'anon-{uuid4()}'
    def failure(*a, **k): raise RuntimeError('Order service offline')
    monkeypatch.setattr(cart_tools, '_order_service_request', failure)
    assert cart_tools.execute_get_cart(owner)['status'] == 'unavailable'


@pytest.mark.parametrize('operation', ['execute_get_applicable_vouchers', 'execute_apply_voucher', 'execute_remove_voucher'])
def test_legacy_voucher_executor_also_blocks_guests_before_any_external_read(operation, monkeypatch):
    from src.function_calling.tools import voucher_tools
    def forbidden(*a, **k): pytest.fail('Guest voucher gate must not call cart or voucher service')
    monkeypatch.setattr(cart_tools, 'sync_authoritative_cart', forbidden)
    owner = f'anon-{uuid4()}:conversation:one'
    args = [owner, 'SAVE'] if operation == 'execute_apply_voucher' else [owner]
    assert getattr(voucher_tools, operation)(*args)['status'] == 'login_required'


def test_guest_http_checkout_is_rejected_before_an_order_executor(monkeypatch):
    import main
    from starlette.requests import Request
    def forbidden(*a, **k): pytest.fail('Guest HTTP checkout must never execute an order')
    monkeypatch.setattr(cart_tools, 'execute_confirm_checkout', forbidden)
    body = main.CheckoutRequest(session_id=f'anon-{uuid4()}')
    with pytest.raises(HTTPException) as denied:
        main.api_cart_checkout(body, Request({'type': 'http', 'headers': []}))
    assert denied.value.status_code == 403 and denied.value.detail['code'] == 'LOGIN_REQUIRED'


def test_guest_http_reset_uses_guest_owned_conversation_and_preserves_cart(guest, monkeypatch):
    import main
    from starlette.requests import Request
    from src.common import conversation_memory
    owner, old_id = guest.sid.split(':conversation:')
    new_id = str(uuid4())
    reads = []
    monkeypatch.setattr(conversation_memory, 'unresolved_turn', lambda conv, uid: reads.append((conv, uid)) or None)
    monkeypatch.setattr(conversation_memory, 'load', lambda conv, uid: reads.append((conv, uid)) or {'messages': []})
    def forbidden(*a, **k): pytest.fail('Reset must never clear or merge the guest cart')
    monkeypatch.setattr(cart_tools, '_order_service_request', forbidden)
    before = deepcopy(cart_manager.get_cart(guest.sid)['items'])
    result = main.reset_agent_conversation(main.AgentConversationResetRequest(session_id=owner,
        conversation_id=new_id, previous_conversation_id=old_id), Request({'type': 'http', 'headers': []}))
    assert result['cart_preserved'] and result['conversation_id'] == new_id
    assert reads == [(old_id, owner), (new_id, owner)]
    assert cart_manager.get_cart(guest.sid)['items'] == before


def test_guest_http_cart_reads_persisted_owner_instead_of_an_empty_local_draft(monkeypatch):
    import main
    from starlette.requests import Request
    owner, conv = f'anon-{uuid4()}', str(uuid4())
    reads = []
    monkeypatch.setattr(cart_tools, 'sync_authoritative_cart', lambda scoped: reads.append(scoped) or {'authoritative': True, 'cart_version': 7})
    result = main.get_agent_cart(owner, Request({'type': 'http', 'headers': []}), conv)
    assert result == {'authoritative': True, 'cart_version': 7}
    assert reads == [f'{owner}:conversation:{conv}']
