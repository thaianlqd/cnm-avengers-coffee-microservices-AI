"""LAN22.4: scripted inference and in-memory authorities; transport is forbidden."""
from copy import deepcopy
import json
import socket
import time

import pytest
import requests
from test_llm_tool_orchestrator import runtime
from src.agents.agent_context import build_context, model_projection, business_state
from src.agents.agent_memory import ConversationMemory, empty_memory
from src.agents.tool_artifacts import ToolArtifacts, model_tool_result
from src.agents.tool_capabilities import CAPABILITIES, READS, WRITES, capabilities_for_context, tool_schemas
from src.agents.tool_policy import GuardedToolGateway
from src.agents.tier1 import classify_confirmation
from src.common import cart_manager, groq_service
from src.function_calling import tools
from src.function_calling.tools import cart_tools, branch_tools, voucher_tools

BRANCH_IDENTITY_READ = branch_tools.branch_identity_available


def forbidden(*args, **kwargs):
    raise AssertionError('No external transport allowed in LAN22.4 regression')


@pytest.fixture(autouse=True)
def offline(runtime, monkeypatch):
    # runtime installs only a scripted Gemini client with a synthetic credential.
    for provider in ('OPENAI', 'GROQ', 'OPENROUTER', 'CEREBRAS'):
        monkeypatch.setenv(provider+'_API_KEY', '')
    for name in ('OpenAIClient', 'OpenRouterClient', '_get_groq_client', '_resolve_chat_model'):
        monkeypatch.setattr(groq_service, name, forbidden)
    monkeypatch.setattr(socket.socket, 'connect', forbidden)
    monkeypatch.setattr(socket.socket, 'connect_ex', forbidden)
    monkeypatch.setattr(socket, 'create_connection', forbidden)
    monkeypatch.setattr(socket, 'getaddrinfo', forbidden)
    monkeypatch.setattr(requests.sessions.Session, 'request', forbidden)
    monkeypatch.setattr(requests, 'post', forbidden)
    monkeypatch.setattr(branch_tools, 'branch_identity_available', lambda *a: True)
    monkeypatch.setattr(cart_tools, 'get_wallet_payment_options', lambda *a: {
        'payment_options': [{'value': 'THANH_TOAN_KHI_NHAN_HANG', 'label': 'Tiền mặt', 'eligible': True}]})
    monkeypatch.setattr(voucher_tools, 'execute_get_applicable_vouchers', lambda s: {
        'status': 'ok', 'vouchers': [{'ma_voucher': 'TEST', 'eligible': True}]})


def setup_checkout(runtime, *, branch=True, summary=True, delivery='TAI_CHO'):
    sid = runtime.sid
    cart_manager.set_checkout_prefs(sid, delivery_type=delivery, payment_method='THANH_TOAN_KHI_NHAN_HANG')
    cart_manager.set_checkout_context(sid, voucher_decided=True, voucher_revalidation_required=None,
        checkout_requested=True, flow_stage='SUMMARY')
    if branch:
        cart_manager.set_branch(sid, 'branch-A', 'Chi nhánh A')
    if summary:
        cart_manager.mark_checkout_summary(sid)
        action = cart_manager.get_checkout_prefs(sid)['checkout_action_id']
        cart_manager.set_pending_action(sid, 'confirm_checkout', {'action_id': action})
    return cart_manager.get_checkout_prefs(sid).get('checkout_action_id')


def gateway(runtime, message='oke xác nhận nhé bạn', filtered=True):
    memory = ConversationMemory(runtime.redis).load(runtime.sid)
    context, _ = build_context(runtime.sid, memory)
    artifacts = ToolArtifacts(memory, message, context)
    artifacts.visible.update(context['visible'])
    artifacts.focus.update(context['focus'])
    allowed = capabilities_for_context(context, entry_action=context['business']['checkout'].get('checkout_action_id'))
    return GuardedToolGateway(runtime.sid, message, context, artifacts, 'offline-turn',
        allowed_capabilities=allowed if filtered else None)


def summary_fake(runtime, monkeypatch):
    calls = []
    def prepare(sid, reuse_summary=False):
        calls.append(reuse_summary)
        cart_manager.mark_checkout_summary(sid, reuse_existing=reuse_summary)
        action = cart_manager.get_checkout_prefs(sid)['checkout_action_id']
        cart_manager.set_pending_action(sid, 'confirm_checkout', {'action_id': action})
        return {'status': 'require_confirmation', 'message': 'Bạn xem bản tóm tắt rồi xác nhận ở lượt tiếp theo nhé.',
            'order_summary': {'action_id': action, 'items': cart_manager.get_cart(sid)['items'], 'final_total': 70000,
                'delivery_address': cart_manager.get_checkout_prefs(sid).get('delivery_address')}}
    monkeypatch.setattr(cart_tools, 'execute_request_checkout', prepare)
    return calls


def successful_confirm(runtime, monkeypatch):
    calls = []
    def confirm(sid, *, action_id):
        calls.append(action_id)
        return {'status': 'ok', 'order_id': 'order-offline-1', 'message': 'Đã tạo đơn. Mã đơn: order-offline-1.'}
    monkeypatch.setattr(cart_tools, 'execute_confirm_checkout', confirm)
    return calls


def content(reply='Dạ, bạn xem lựa chọn nhé.', claims=(), **fields):
    return {'content': json.dumps({'response_kind': 'action' if claims else 'clarification',
        'reply': reply, 'mutation_claims': list(claims), 'evidence_quotes': [], **fields}, ensure_ascii=False)}


def calls(*operations):
    return {'tool_calls': [{'id': str(i), 'type': 'function', 'function': {
        'name': name, 'arguments': json.dumps(args)}} for i, (name, args) in enumerate(operations)]}


def test_inventory_schema_and_action_projection(runtime):
    action = setup_checkout(runtime)
    g = gateway(runtime)
    assert (len(CAPABILITIES), len(READS), len(WRITES)) == (44, 23, 21)
    params = next(row['function']['parameters'] for row in tool_schemas() if row['function']['name'] == 'confirm_checkout')
    assert params == {'type': 'object', 'properties': {}, 'required': [], 'additionalProperties': False}
    assert action not in model_projection(g.context)[1]
    assert action not in json.dumps(model_tool_result('request_checkout', {
        'status': 'require_confirmation', 'order_summary': {'action_id': action, 'items': []}}))
    assert len(g.tool_surface()[0]) < 33
    assert not g.dispatch('confirm_checkout', {'action_id': action}).get('order_id')


@pytest.mark.parametrize('message', ['oke xác nhận nhé bạn', 'oke xác nhận', 'xác nhận', 'đồng ý chốt đơn', 'đặt luôn'])
def test_explicit_confirmation_classifier(message):
    assert classify_confirmation(message, 'confirm_checkout') == 'YES'


@pytest.mark.parametrize('message', ['chưa', 'đợi chút', 'đổi QR', 'thêm món', 'bỏ món 2', 'chỉnh số lượng', 'oke đổi QR'])
def test_changes_and_negatives_never_confirm(message):
    assert classify_confirmation(message, 'confirm_checkout') != 'YES'


def test_fresh_confirm_server_binding_one_request_and_durable_replay(runtime, monkeypatch, caplog):
    action = setup_checkout(runtime)
    confirmed = successful_confirm(runtime, monkeypatch)
    runtime.provider.steps = [calls(('confirm_checkout', {})), content('Đã tạo đơn. Mã đơn: order-offline-1.', ['confirm_checkout'])]
    caplog.set_level('INFO')
    first = runtime.turn('oke xác nhận nhé bạn', client_message_id='lost-response')
    assert confirmed == [action]
    assert len(runtime.provider.requests) == 1
    assert len(runtime.provider.steps) == 1  # No final synthesis call after a known receipt.
    assert [row['tool'] for row in first['tool_calls_log']] == ['confirm_checkout']
    metrics = json.loads(next(r.message.split('[LLMToolTurn] ', 1)[1] for r in caplog.records if '[LLMToolTurn]' in r.message))
    assert metrics['final_synthesis_source'] == 'server_customer_flow' and metrics['provider_failure_count'] == 0
    # Lose the HTTP response, clear fast process cache, then retry exact identity.
    cart_manager.set_checkout_context(runtime.sid, processed_order_turns={})
    replay = runtime.turn('oke xác nhận nhé bạn', client_message_id='lost-response')
    assert replay == first and confirmed == [action] and len(runtime.provider.requests) == 1
    conflict = runtime.turn('xác nhận', client_message_id='lost-response')
    assert conflict['error'] == 'client_message_id_conflict' and confirmed == [action]


@pytest.mark.parametrize('case,reason', [
    ('none', 'no_prior_action'), ('action', 'action_mismatch'), ('changed_turn', 'state_changed_during_turn'),
    ('explicit', 'not_explicit_confirmation'), ('fingerprint', 'summary_cart_changed'),
    ('expiry', 'summary_expired'), ('pending', 'pending_confirmation_missing'), ('pending_expiry', 'pending_confirmation_missing'),
])
def test_each_confirm_denial_is_structured_and_never_orders(runtime, monkeypatch, case, reason):
    setup_checkout(runtime, summary=case != 'none')
    confirmed = successful_confirm(runtime, monkeypatch)
    g = gateway(runtime, 'đợi chút' if case == 'explicit' else 'xác nhận', filtered=False)
    if case == 'action':
        cart_manager.set_checkout_context(runtime.sid, checkout_action_id='different-action')
    if case == 'changed_turn':
        cart_manager.set_checkout_prefs(runtime.sid, payment_method='NGAN_HANG_QR')
    if case == 'fingerprint':
        cart_manager.set_checkout_context(runtime.sid, summary_fingerprint='old-cart')
    if case == 'expiry':
        cart_manager.set_checkout_context(runtime.sid, checkout_action_expires_at=time.time()-1)
    if case == 'pending':
        cart_manager.clear_pending_action(runtime.sid)
    if case == 'pending_expiry':
        cart_manager.get_checkout_prefs(runtime.sid)  # Replace through the server context API.
        cart_manager.set_checkout_context(runtime.sid, pending_action={'type': 'confirm_checkout', 'expires_at': time.time()-1})
    result = g.dispatch('confirm_checkout', {})
    assert result['status'] == 'confirmation_required' and result['reason'] == reason and not confirmed
    assert result['recovery_tool'] == (None if case == 'explicit' else 'request_checkout')


@pytest.mark.parametrize('field', ['payment_method', 'branch', 'voucher', 'delivery_address'])
def test_stale_missing_prerequisites_cannot_confirm_or_refresh(runtime, monkeypatch, field):
    setup_checkout(runtime, delivery='GIAO_TAN_NOI' if field == 'delivery_address' else 'TAI_CHO')
    g = gateway(runtime, filtered=False)
    confirmed = successful_confirm(runtime, monkeypatch)
    if field == 'branch':
        cart_manager.clear_branch(runtime.sid)
    elif field == 'voucher':
        cart_manager.set_checkout_context(runtime.sid, voucher_decided=False)
    elif field == 'payment_method':
        cart_manager.set_checkout_context(runtime.sid, payment_method=None)
    result = g.dispatch('confirm_checkout', {})
    assert field in result['missing'] and result['recovery_tool'] is None and not confirmed
    assert g.tool_surface()[0] == []


@pytest.mark.parametrize('case', ['expired', 'fingerprint', 'pending'])
def test_confirm_denial_refreshes_only_once_and_requires_next_turn(runtime, monkeypatch, case):
    old_action = setup_checkout(runtime)
    if case == 'expired':
        cart_manager.set_checkout_context(runtime.sid, checkout_action_expires_at=time.time()-1)
    elif case == 'fingerprint':
        cart_manager.set_checkout_context(runtime.sid, summary_fingerprint='old')
    else:
        cart_manager.clear_pending_action(runtime.sid)
    refreshed, confirmed = summary_fake(runtime, monkeypatch), successful_confirm(runtime, monkeypatch)
    runtime.provider.steps = [calls(('confirm_checkout', {}), ('set_checkout_choices', {'payment_method': 'NGAN_HANG_QR'})),
        calls(('request_checkout', {}), ('confirm_checkout', {})), content('Bạn xem bản tóm tắt mới rồi xác nhận ở lượt tiếp theo nhé.')]
    result = runtime.turn('xác nhận')
    assert len(refreshed) == 1 and not confirmed and len(runtime.provider.requests) == 3
    assert {r['function']['name'] for r in runtime.provider.requests[1]['tools']} == {'request_checkout'}
    assert not runtime.provider.requests[-1].get('tools')
    assert cart_manager.get_checkout_prefs(runtime.sid)['payment_method'] == 'THANH_TOAN_KHI_NHAN_HANG'
    assert result['checkout_payload']['action_id']
    if case != 'pending':
        assert result['checkout_payload']['action_id'] != old_action
    runtime.provider.steps = [calls(('confirm_checkout', {})), content('Đã tạo đơn. Mã đơn: order-offline-1.', ['confirm_checkout'])]
    runtime.turn('xác nhận')
    assert len(confirmed) == 1


def test_nonexplicit_confirm_denial_stops_without_unrelated_writes(runtime, monkeypatch):
    setup_checkout(runtime)
    confirmed = successful_confirm(runtime, monkeypatch)
    runtime.provider.steps = [calls(('confirm_checkout', {}), ('set_checkout_choices', {'payment_method': 'NGAN_HANG_QR'})),
        content('Bạn xác nhận đặt đơn theo bản tóm tắt này nhé.')]
    result = runtime.turn('đợi chút')
    assert not confirmed and len(runtime.provider.requests) == 2
    assert not runtime.provider.requests[-1].get('tools')
    assert cart_manager.get_checkout_prefs(runtime.sid)['payment_method'] == 'THANH_TOAN_KHI_NHAN_HANG'
    assert result['tool_calls_log'][0]['result']['reason'] == 'not_explicit_confirmation'


def test_current_turn_summary_is_never_confirmable(runtime, monkeypatch):
    setup_checkout(runtime, summary=False)
    g = gateway(runtime, filtered=False)
    refreshed, confirmed = summary_fake(runtime, monkeypatch), successful_confirm(runtime, monkeypatch)
    assert g.dispatch('request_checkout', {})['status'] == 'require_confirmation'
    assert g.dispatch('confirm_checkout', {})['reason'] == 'no_prior_action'
    assert not confirmed and len(refreshed) == 1


def test_noop_choices_branch_voucher_preserve_summary_and_pending(runtime, monkeypatch):
    from src.common import inventory_validation
    from src.function_calling import helpers
    monkeypatch.setattr(helpers, '_get_engine', lambda: None)
    checked = []
    monkeypatch.setattr(inventory_validation, 'validate_cart_at_branch', lambda engine, cart: (
        checked.append(cart['branch_id']) or {'unavailable': [], 'unverified': []}))
    setup_checkout(runtime, summary=False)
    cart_manager.set_checkout_context(runtime.sid, voucher_code='TEST')
    setup_checkout(runtime)
    g = gateway(runtime, filtered=False)
    g.entry_branches.add('branch-A')
    g.artifacts.visible['branches'] = [{'branch_id': 'branch-A', 'branch_name': 'Chi nhánh A', 'availability_status': 'available'}]
    before = deepcopy(cart_manager.get_checkout_prefs(runtime.sid))
    fingerprint = cart_manager.cart_fingerprint(runtime.sid)
    monkeypatch.setattr(branch_tools, 'execute_set_session_branch', forbidden)
    monkeypatch.setattr(voucher_tools, 'execute_apply_voucher', forbidden)
    monkeypatch.setattr(cart_manager, 'set_checkout_prefs', forbidden)
    for name, args in [('set_checkout_choices', {'delivery_type': 'TAI_CHO', 'payment_method': 'THANH_TOAN_KHI_NHAN_HANG'}),
                       ('set_session_branch', {'branch_id': 'branch-A'}), ('apply_voucher', {'voucher_code': ' test '})]:
        result = g.dispatch(name, args)
        assert result['status'] == 'already_processed' and result['changed'] is False
        assert not g.provenance[-1]['mutation_evidence_present']
    assert checked == ['branch-A']
    assert cart_manager.get_checkout_prefs(runtime.sid) == before
    assert cart_manager.cart_fingerprint(runtime.sid) == fingerprint


def test_voucher_revalidation_and_branch_stock_failures_are_not_noops(runtime, monkeypatch):
    from src.common import inventory_validation
    from src.function_calling import helpers
    setup_checkout(runtime)
    cart_manager.set_checkout_context(runtime.sid, voucher_code='TEST')
    cart_manager.set_checkout_context(runtime.sid, voucher_revalidation_required=True)
    g = gateway(runtime, filtered=False)
    applied = []
    monkeypatch.setattr(voucher_tools, 'execute_apply_voucher', lambda *a: applied.append(a) or {'status': 'ok'})
    assert g.dispatch('apply_voucher', {'voucher_code': 'TEST'})['status'] == 'ok' and len(applied) == 1
    g.entry_branches.add('branch-A')
    g.artifacts.visible['branches'] = [{'branch_id': 'branch-A', 'availability_status': 'available'}]
    monkeypatch.setattr(helpers, '_get_engine', lambda: None)
    monkeypatch.setattr(inventory_validation, 'validate_cart_at_branch', lambda *a: {'unavailable': ['101'], 'unverified': [], 'available': [],
        'product_statuses': [], 'is_fully_available': False})
    assert g.dispatch('set_session_branch', {'branch_id': 'branch-A'})['status'] == 'branch_unavailable_or_unknown'


@pytest.mark.parametrize('kind,branch,address,authenticated,expected', [
    (None, False, False, True, False), ('TAI_CHO', False, False, True, True),
    ('MANG_DI', False, False, True, True), ('TAI_CHO', True, False, True, False),
    ('GIAO_TAN_NOI', True, False, True, True), ('GIAO_TAN_NOI', True, True, True, False),
    ('TAI_CHO', False, False, False, False),
])
def test_profile_surface_is_checkout_state_scoped(runtime, kind, branch, address, authenticated, expected):
    state = business_state(runtime.sid)
    state.update(authenticated=authenticated)
    state['checkout'] = {'delivery_type': kind, 'delivery_address': 'Actual address' if address else None, 'address_confirmed': address}
    state['cart']['branch_id'] = 'branch-A' if branch else None
    allowed = capabilities_for_context({'business': state})
    assert ('get_user_profile' in allowed) == expected and len(allowed) < 33
    assert 'find_nearest_branch' not in allowed if authenticated else True
    state['cart']['items'] = []
    assert 'get_user_profile' not in capabilities_for_context({'business': state})


@pytest.mark.parametrize('kind', ['TAI_CHO', 'MANG_DI', 'GIAO_TAN_NOI'])
def test_profile_literal_address_to_canonical_location_bridge(runtime, monkeypatch, kind):
    from src.agents import order_flow_graph
    setup_checkout(runtime, branch=False, summary=False, delivery=kind)
    address = '12 Đường A, Phường B, Thành phố C'
    profile = {'status': 'ok', 'default_address': address, 'name': 'Private name', 'email': 'private@example.test',
        'phone': 'private phone', 'address_items': [{'label': 'Nhà', 'full_address': address, 'is_default': True, 'private_id': 99}]}
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'get_user_profile', lambda args, sid: deepcopy(profile))
    seen = []
    def authority(state):
        seen.append(deepcopy(state))
        assert state['user_message'] == address and state['location_override'].value == address
        assert state['force_read_only_location'] == (kind != 'GIAO_TAN_NOI')
        if kind == 'GIAO_TAN_NOI':
            # Canonical geo/inventory adapter owns promotion, never profile tool.
            cart_manager.set_checkout_prefs(runtime.sid, delivery_address=address)
            cart_manager.set_checkout_context(runtime.sid, address_confirmed=True)
            cart_manager.set_branch(runtime.sid, 'branch-compatible', 'Chi nhánh tương thích')
        return {'reply': 'Đây là chi nhánh gần địa chỉ này.', 'tool_calls_log': [{'tool': 'find_nearest_branch',
            'result': {'status': 'ok', 'branches': [{'branch_id': 'branch-near', 'branch_name': 'Chi nhánh gần', 'availability_status': 'available'}]}}]}
    monkeypatch.setattr(order_flow_graph, '_handle_location_request', authority)
    monkeypatch.setattr(order_flow_graph, '_persist_branch_candidates_from_result', lambda *a: None)
    runtime.provider.steps = [calls(('get_user_profile', {})),
        calls(('resolve_location', {'location': address, 'kind': 'address', 'for_checkout': True})),
        content('Bạn chọn chi nhánh phù hợp nhé.' if kind != 'GIAO_TAN_NOI' else 'Địa chỉ đã được kiểm tra.')]
    result = runtime.turn('Dùng địa chỉ đã lưu trong hồ sơ nhé')
    assert len(seen) == 1 and len(runtime.provider.requests) == 2
    model_profile = json.loads(runtime.provider.requests[1]['messages'][-1]['content'])
    assert set(model_profile) == {'status', 'default_address', 'address_items'}
    assert set(model_profile['address_items'][0]) == {'label', 'full_address', 'is_default'}
    assert result['tool_calls_log'][0]['result']['email'] == 'private@example.test'  # Full internal result retained.
    prefs = cart_manager.get_checkout_prefs(runtime.sid)
    if kind != 'GIAO_TAN_NOI':
        assert not prefs.get('delivery_address') and not prefs.get('address_confirmed')
        assert not cart_manager.get_cart(runtime.sid).get('branch_id')
        assert result['ui_payload']['branches'][0]['branch_id'] == 'branch-near'
    else:
        assert prefs['address_confirmed'] and cart_manager.get_cart(runtime.sid)['branch_id'] == 'branch-compatible'


def test_dinein_choices_payment_bad_json_fallback_is_actionable(runtime):
    cart_manager.set_checkout_context(runtime.sid, voucher_decided=True)
    runtime.provider.steps = [calls(('set_checkout_choices', {'delivery_type': 'TAI_CHO'}), ('get_payment_options', {})),
        {'content': 'bad JSON'}, {'content': 'bad JSON'}]
    result = runtime.turn('Dùng tại quán nhé')
    assert 'đã ghi nhận' in result['reply'].lower() and 'thanh toán' in result['reply'] and 'chi nhánh' in result['reply']
    assert result['ui_payload']['payment_options'][0]['value'] == 'THANH_TOAN_KHI_NHAN_HANG'
    assert 'chưa xác minh' not in result['reply']


def test_dinein_cash_missing_branch_fallback_does_not_summarize(runtime, caplog):
    setup_checkout(runtime, branch=False, summary=False)
    runtime.provider.steps = [calls(('set_checkout_choices', {'delivery_type': 'TAI_CHO', 'payment_method': 'THANH_TOAN_KHI_NHAN_HANG'})),
        content('Đã tạo đơn.', ['confirm_checkout'])]
    caplog.set_level('INFO')
    result = runtime.turn('Tại chỗ, tiền mặt')
    assert 'chi nhánh' in result['reply'] and not result['checkout_payload'] and 'chưa xác minh' not in result['reply']
    assert any('mutation_claim_mismatch' in r.message for r in caplog.records)


@pytest.mark.parametrize('selection,count', [(['103', '101'], 2), (['103', '101', '102'], 2)])
def test_compound_total_budget_repairs_oversized_selection(runtime, selection, count):
    runtime.provider.steps = [calls(('filter_catalog', {'search_text': '', 'sort_by': 'price_desc', 'limit': 2}),
        ('filter_catalog', {'search_text': '', 'sort_by': 'price_asc', 'limit': 2})),
        content('Đây là hai món.', display_product_ids=selection, display_product_count=count)]
    if len(selection) != count:
        runtime.provider.steps.append(content('Đây là hai món.', display_product_ids=['103', '101'], display_product_count=2))
    result = runtime.turn('Cho tôi 2 ly đắt nhất và rẻ nhất')
    assert [row['product_id'] for row in result['ui_payload']['products']] == ['103', '101']
    assert not runtime.writes and len(runtime.reads) == 2


def test_distinct_ids_same_name_survive_and_duplicate_id_deduplicates(runtime):
    artifacts = ToolArtifacts(empty_memory())
    rows = [{'product_id': 'a', 'product_name': 'Same name', 'final_price': 1},
            {'product_id': 'b', 'product_name': 'Same name', 'final_price': 2}]
    artifacts.collect('filter_catalog', {}, {'status': 'ok', 'products': rows})
    artifacts.collect('filter_catalog', {}, {'status': 'ok', 'products': [rows[0]]})
    assert list(artifacts.product_candidates) == ['a', 'b']
    assert artifacts.ui['products'] == []  # Discovery candidates await final presentation selection.
    raw = content('Hai món có mã khác nhau.', display_product_ids=['a', 'b'], display_product_count=2)['content']
    assert artifacts.response_issue(raw) is None
    artifacts.validate_reply(raw)
    assert len(artifacts.ui['products']) == 2


def test_unresolved_compound_count_returns_clarification_without_overdisplay(runtime):
    runtime.provider.steps = [calls(('filter_catalog', {'search_text': '', 'sort_by': 'price_desc', 'limit': 2}),
        ('filter_catalog', {'search_text': '', 'sort_by': 'price_asc', 'limit': 2}))]
    runtime.provider.steps.extend([content('Danh sách món.')] * 6)
    result = runtime.turn('Hai ly đắt và rẻ')
    assert not result['ui_payload']['products'] and 'bao nhiêu' in result['reply']


def test_invalid_confirm_schema_repairs_only_confirm_then_stops(runtime, monkeypatch):
    action = setup_checkout(runtime)
    confirmed = successful_confirm(runtime, monkeypatch)
    runtime.provider.steps = [calls(('confirm_checkout', {'action_id': 'model-guessed'}),
        ('set_checkout_choices', {'payment_method': 'NGAN_HANG_QR'})), calls(('confirm_checkout', {})),
        content('Đã tạo đơn. Mã đơn: order-offline-1.', ['confirm_checkout'])]
    runtime.turn('xác nhận')
    assert confirmed == [action] and len(runtime.provider.requests) == 3
    assert {r['function']['name'] for r in runtime.provider.requests[1]['tools']} == {'confirm_checkout'}
    assert cart_manager.get_checkout_prefs(runtime.sid)['payment_method'] == 'THANH_TOAN_KHI_NHAN_HANG'
    assert not runtime.provider.requests[-1].get('tools')


def test_failed_summary_recovery_stops_after_one_attempt(runtime, monkeypatch):
    setup_checkout(runtime)
    cart_manager.set_checkout_context(runtime.sid, summary_fingerprint='old')
    attempted = []
    monkeypatch.setattr(cart_tools, 'execute_request_checkout', lambda *a, **k: attempted.append(a) or {
        'status': 'stock_unverified', 'message': 'Chưa xác minh được tồn kho nên chưa thể chốt đơn.'})
    runtime.provider.steps = [calls(('confirm_checkout', {})), calls(('request_checkout', {})),
        content('Chưa xác minh được tồn kho nên chưa thể chốt đơn.')]
    runtime.turn('xác nhận')
    assert len(attempted) == 1 and not runtime.provider.requests[-1].get('tools')


def test_real_pickup_location_bridge_and_later_branch_summary(runtime, monkeypatch):
    from src.common import inventory_validation
    from src.function_calling import helpers
    setup_checkout(runtime, branch=False, summary=False)
    address = '12 Đường A, Phường B, Thành phố Hồ Chí Minh'
    geo = []
    branch = {'ma_chi_nhanh': 'branch-near', 'ten_chi_nhanh': 'Chi nhánh gần',
              'availability_status': 'available', 'dia_chi': 'Địa chỉ cửa hàng'}
    def nearest(**kwargs):
        geo.append(kwargs)
        assert kwargs['location'] == address and kwargs['session_id'] == ''
        return {'status': 'ok', 'branches': [branch], 'normalized_location': address}
    monkeypatch.setattr(branch_tools, 'execute_find_nearest_branch', nearest)
    runtime.provider.steps = [calls(('resolve_location', {'location': address, 'kind': 'address', 'for_checkout': True})),
        content('Bạn chọn chi nhánh gần nhé.')]
    lookup = runtime.turn('Tìm chi nhánh gần địa chỉ đã cung cấp')
    assert lookup['ui_payload']['branches'][0]['ma_chi_nhanh'] == 'branch-near'
    assert not cart_manager.get_checkout_prefs(runtime.sid).get('delivery_address')
    assert not cart_manager.get_cart(runtime.sid).get('branch_id')
    changed = []
    monkeypatch.setattr(helpers, '_get_engine', lambda: None)
    monkeypatch.setattr(inventory_validation, 'validate_cart_at_branch', lambda *a: {'unavailable': [], 'unverified': []})
    def select(sid, bid, name, customer_selected):
        assert customer_selected
        changed.append(bid)
        cart_manager.set_branch(sid, bid, name)
        return {'status': 'ok', 'message': 'Đã chọn chi nhánh.'}
    monkeypatch.setattr(branch_tools, 'execute_set_session_branch', select)
    summaries = summary_fake(runtime, monkeypatch)
    runtime.provider.requests.clear()
    runtime.provider.steps = [calls(('set_session_branch', {'branch_id': 'branch-near'})),
        calls(('request_checkout', {})), content('Bạn xem và xác nhận bản tóm tắt nhé.')]
    result = runtime.turn('Chọn chi nhánh 1')
    assert changed == ['branch-near'] and not summaries and len(geo) == 1
    assert not result['checkout_payload'] and len(runtime.provider.requests) == 1
    runtime.provider.steps = [calls(('request_checkout', {}))]
    summary = runtime.turn('Xem bản tóm tắt đơn')
    assert summary['checkout_payload']['action_id'] and len(summaries) == 1
    assert len(runtime.provider.requests) == 2


def test_real_delivery_ambiguous_candidate_bridge_preserves_summary_and_coordinates(runtime, monkeypatch):
    setup_checkout(runtime, branch=False, summary=False, delivery='GIAO_TAN_NOI')
    address = '12 Đường A, Phường B, Thành phố Hồ Chí Minh'
    candidate = {'normalized_label': address, 'display_address': address, 'lat': 10.1, 'lng': 106.1}
    geo, selected = [], []
    def nearest(**kwargs):
        geo.append(kwargs)
        if not kwargs.get('resolved_location'):
            return {'status': 'ambiguous', 'location_candidates': [candidate], 'message': 'Bạn chọn địa điểm nhé.'}
        assert kwargs['resolved_location']['lat'] == 10.1 and kwargs['resolved_location']['lng'] == 106.1
        return {'status': 'ok', 'normalized_location': address, 'branches': [
            {'ma_chi_nhanh': 'compatible', 'ten_chi_nhanh': 'Cửa hàng tương thích', 'availability_status': 'available'}]}
    def select(sid, bid, name, customer_selected):
        selected.append(bid)
        cart_manager.set_branch(sid, bid, name)
        return {'status': 'ok', 'message': 'Đã chọn cửa hàng phục vụ.'}
    monkeypatch.setattr(branch_tools, 'execute_find_nearest_branch', nearest)
    monkeypatch.setattr(branch_tools, 'execute_set_session_branch', select)
    summaries = summary_fake(runtime, monkeypatch)
    runtime.provider.steps = [calls(('resolve_location', {'location': address, 'kind': 'address', 'for_checkout': True})),
        content('Bạn chọn địa điểm nhé.')]
    lookup = runtime.turn('Giao tới địa chỉ này')
    assert not cart_manager.get_checkout_prefs(runtime.sid).get('address_confirmed') and not selected
    candidate_id = lookup['ui_payload']['location_candidates'][0]['candidate_id']
    runtime.provider.requests.clear()
    runtime.provider.steps = [calls(('select_location_candidate', {'candidate_id': candidate_id})),
        content('Bạn xem bản tóm tắt và xác nhận ở lượt sau nhé.')]
    result = runtime.turn('Chọn địa điểm 1')
    assert len(geo) == 2 and selected == ['compatible'] and len(summaries) == 1
    assert cart_manager.get_checkout_prefs(runtime.sid)['address_confirmed']
    assert result['checkout_payload']['action_id']
    assert len(runtime.provider.requests) == 1  # Coordinates and summary are already authoritative.
    from src.agents.tool_artifacts import model_tool_result
    projected = model_tool_result('select_location_candidate', result['tool_calls_log'][-1]['result'])
    assert 'action_id' not in projected['order_summary']


def test_missing_branch_with_unavailable_confirm_proposal_has_precise_fallback(runtime):
    setup_checkout(runtime, branch=False, summary=False)
    runtime.provider.steps = [calls(('confirm_checkout', {})), {'content': 'bad JSON'}]
    result = runtime.turn('xác nhận')
    assert 'chi nhánh' in result['reply'] and 'chưa xác minh' not in result['reply']


def test_summary_rag_interruption_preserves_prior_action(runtime, monkeypatch):
    from src.function_calling.tools import knowledge_tools
    setup_checkout(runtime)
    before = deepcopy(cart_manager.get_checkout_prefs(runtime.sid))
    doc = {'id': 'knowledge-fixture', 'content': 'Hương vị dịu và thơm.', 'domain': 'product_description',
           'entity_type': 'product', 'entity_id': '101'}
    monkeypatch.setattr(knowledge_tools, 'execute_search_knowledge_base', lambda **kw: {'status': 'ok', 'results': [doc]})
    runtime.provider.steps = [calls(('search_knowledge_base', {'query': 'Hương vị món này',
        'domain': 'product_description', 'entity_type': 'product', 'entity_id': '101'})),
        content('Theo tài liệu, hương vị dịu và thơm.', evidence_quotes=[{'document_id': doc['id'], 'quote': doc['content']}])]
    result = runtime.turn('Món này có hương vị thế nào?')
    assert 'hương vị dịu' in result['reply'].lower() and not runtime.writes
    after = cart_manager.get_checkout_prefs(runtime.sid)
    for key in ('summary_fingerprint', 'checkout_action_id', 'pending_action'):
        assert after[key] == before[key]


def test_real_payment_change_before_confirm_invalidates_summary(runtime):
    setup_checkout(runtime)
    g = gateway(runtime, 'Đổi sang chuyển khoản QR')
    result = g.dispatch('set_checkout_choices', {'payment_method': 'NGAN_HANG_QR'})
    assert result['status'] == 'ok' and result['changed']
    prefs = cart_manager.get_checkout_prefs(runtime.sid)
    assert prefs['payment_method'] == 'NGAN_HANG_QR' and not prefs.get('checkout_action_id')
    assert not prefs.get('summary_fingerprint') and not cart_manager.get_pending_action(runtime.sid)


def test_cart_change_before_confirm_keeps_edit_available_and_invalidates(runtime):
    setup_checkout(runtime)
    g = gateway(runtime, 'Chỉnh số lượng món 1 thành 2')
    result = g.dispatch('update_cart_item', {'cart_item_id': '800', 'cart_line_ordinal': 1, 'desired_state': {'quantity': 2}})
    assert result['status'] == 'ok' and len(runtime.writes) == 1
    prefs = cart_manager.get_checkout_prefs(runtime.sid)
    assert not prefs.get('checkout_action_id') and not prefs.get('summary_fingerprint')


@pytest.mark.parametrize('eligibility', ['ineligible', 'unverified', 'discount_changed'])
def test_same_voucher_never_skips_authoritative_eligibility(runtime, monkeypatch, eligibility):
    setup_checkout(runtime, summary=False)
    cart_manager.set_checkout_context(runtime.sid, voucher_code='TEST', discount_amount=1000)
    setup_checkout(runtime)
    g = gateway(runtime, filtered=False)
    applied = []
    monkeypatch.setattr(voucher_tools, 'execute_apply_voucher', lambda *a: applied.append(a) or {'status': 'ok'})
    monkeypatch.setattr(voucher_tools, 'execute_get_applicable_vouchers', lambda s: {
        'status': 'error' if eligibility == 'unverified' else 'ok',
        'vouchers': [] if eligibility == 'ineligible' else [{'ma_voucher': 'TEST', 'so_tien_giam_du_kien': 2000}]})
    result = g.dispatch('apply_voucher', {'voucher_code': 'TEST'})
    assert len(applied) == (1 if eligibility == 'discount_changed' else 0)
    assert result['status'] == ('ok' if eligibility == 'discount_changed' else 'voucher_not_eligible')


@pytest.mark.parametrize('guard,status', [('cart', 'authoritative_cart_unavailable'),
    ('authentication', 'authentication_or_turn_required'), ('turn', 'authentication_or_turn_required')])
def test_confirm_authority_authentication_and_identity_guards_remain(runtime, monkeypatch, guard, status):
    setup_checkout(runtime)
    g = gateway(runtime, filtered=False)
    confirmed = successful_confirm(runtime, monkeypatch)
    if guard == 'cart':
        monkeypatch.setattr(cart_tools, 'sync_authoritative_cart', lambda s: {**cart_manager.get_cart(s), 'authoritative': False})
    elif guard == 'authentication':
        monkeypatch.setattr(cart_tools, 'is_authenticated_cart_session', lambda s: False)
    else:
        g.client_message_id = None
    assert g.dispatch('confirm_checkout', {})['status'] == status and not confirmed


def test_same_branch_with_inactive_identity_is_not_satisfied(runtime, monkeypatch):
    from src.common import inventory_validation
    from src.function_calling import helpers
    setup_checkout(runtime)
    g = gateway(runtime, filtered=False)
    g.entry_branches.add('branch-A')
    g.artifacts.visible['branches'] = [{'branch_id': 'branch-A', 'availability_status': 'available'}]
    monkeypatch.setattr(helpers, '_get_engine', lambda: None)
    monkeypatch.setattr(inventory_validation, 'validate_cart_at_branch', lambda *a: {'unavailable': [], 'unverified': []})
    monkeypatch.setattr(branch_tools, 'branch_identity_available', lambda *a: False)
    assert g.dispatch('set_session_branch', {'branch_id': 'branch-A'})['status'] == 'branch_unavailable_or_unknown'


@pytest.mark.parametrize('rows,expected', [([('ACTIVE',)], True), ([('INACTIVE',)], False),
    ([None, ('kiosk-A',)], True), ([None, None], False), ([RuntimeError('identity unavailable')], False)])
def test_noop_identity_read_requires_active_exact_branch_or_existing_kiosk(rows, expected):
    class Identity:
        def connect(self): return self
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def execute(self, query, params):
            assert 'ILIKE' not in str(query) and params == {'bid': 'exact-id'}
            return self
        def fetchone(self):
            value = rows.pop(0)
            if isinstance(value, Exception): raise value
            return value
    assert BRANCH_IDENTITY_READ(Identity(), 'exact-id') == expected


def test_failed_read_interruption_preserves_knowledge_insufficiency_fallback(runtime):
    setup_checkout(runtime, branch=False, summary=False)
    g = gateway(runtime)
    g.artifacts.collect('search_knowledge_base', {}, {'status': 'not_found', 'results': [],
        'message': 'Tài liệu hiện có chưa đủ thông tin về hương vị món này.'})
    assert 'hương vị' in g.artifacts.factual_fallback()
    assert 'chi nhánh' not in g.artifacts.factual_fallback()


def test_failed_summary_recovery_fallback_uses_actual_blocker(runtime):
    setup_checkout(runtime)
    g = gateway(runtime)
    g.artifacts.collect('confirm_checkout', {}, {'status': 'confirmation_required',
        'message': 'Bản tóm tắt cần được làm mới.'})
    g.artifacts.collect('request_checkout', {}, {'status': 'stock_unverified',
        'message': 'Chưa xác minh được tồn kho nên chưa thể chốt đơn.'})
    assert 'tồn kho' in g.artifacts.factual_fallback()


def test_total_display_selection_can_use_either_read_beyond_initial_ui_budget(runtime):
    artifacts = ToolArtifacts(empty_memory())
    rows = [{'product_id': str(i), 'product_name': 'Canonical candidate', 'final_price': i + 1} for i in range(32)]
    for direction, group in zip(('price_asc', 'price_desc'), (rows[:16], rows[16:])):
        artifacts.collect('filter_catalog', {'sort_by': direction, 'limit': 16}, {'status': 'ok', 'products': group})
    assert len(artifacts.product_candidates) == 32 and artifacts.ui['products'] == []
    raw = content('Đây là hai món.', display_product_ids=['0', '31'], display_product_count=2)['content']
    assert artifacts.response_issue(raw) is None
    artifacts.validate_reply(raw)
    assert [row['product_id'] for row in artifacts.ui['products']] == ['0', '31']


@pytest.fixture(autouse=True)
def exercise_scripted_gateway_without_language_shortcuts(monkeypatch):
    # This module qualifies explicit provider proposals and gateway denials.
    # The legacy phrase router must not preempt the proposal under test;
    # production semantic mode never executes that router either.
    from src.agents import llm_tool_orchestrator
    monkeypatch.setattr(llm_tool_orchestrator, '_legacy_language_control', lambda *a: None)
