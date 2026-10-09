from copy import deepcopy
from datetime import datetime, timezone
import socket
import pytest
from test_llm_tool_orchestrator import runtime
from src.agents import order_management as management
from src.common import cart_manager
from src.function_calling.tools.sales_period import sales_window
from src.agents.tool_capabilities import capabilities_for_context

OID = '924375ec-214d-4fd4-8ac5-a823ce4cb18b'
OTHER = '124375ec-214d-4fd4-8ac5-a823ce4cb18b'


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def blocked(*a, **k):
        pytest.fail('These tests must never use live network or an AI key')
    monkeypatch.setattr(socket, 'create_connection', blocked)
    monkeypatch.setattr(socket.socket, 'connect', blocked)


@pytest.fixture
def service(runtime, monkeypatch):
    order = {'ma_don_hang': OID, 'trang_thai_don_hang': 'MOI_TAO', 'phuong_thuc_thanh_toan': 'VI_DIEN_TU',
        'trang_thai_thanh_toan': 'DA_THANH_TOAN', 'tong_tien': 298000, 'dia_chi_giao_hang': '42 Nguyễn Hữu Tiến',
        'chi_tiet': [dict(id=21, ma_san_pham=114, ten_san_pham='Bánh Trung Thu Matcha', so_luong=2, gia_ban=99000, kich_co='Nhỏ', toppings=[]),
            dict(id=22, ma_san_pham=60, ten_san_pham='Latte Tiramisu', so_luong=1, gia_ban=95000, kich_co='Lớn', toppings=['Xốt Caramel', 'Kem Phô Mai Macchiato'], luong_da='Ít đá', do_ngot='Thêm ngọt')]}
    calls = []
    def request(sid, method, path, payload=None, operation_id=None, mutation=False):
        assert sid == runtime.sid
        calls.append((method, path, deepcopy(payload), operation_id, mutation))
        if method == 'GET':
            return {'status': 'ok', 'order': deepcopy(order), 'revision': 'revision-1'}
        if 'reorder-preview' in path:
            return {'status': 'ok', 'revision': 'revision-1', 'items': deepcopy(order['chi_tiet']), 'subtotal': 293000}
        if payload and payload.get('preview_only'):
            subtotal = sum(row['gia_ban'] * row['so_luong'] for row in payload['items'])
            return {'status': 'ok', 'items': deepcopy(payload['items']), 'subtotal': subtotal,
                'discount_amount': 10000, 'delivery_fee': 15000, 'final_total': subtotal + 5000,
                'original_total': order['tong_tien'], 'payment_method': order['phuong_thuc_thanh_toan'],
                'wallet_charge': subtotal + 5000 - order['tong_tien'] if order['phuong_thuc_thanh_toan'] == 'VI_DIEN_TU' else 0,
                'wallet_shortfall': order.get('wallet_shortfall', 0),
                'delivery_address': payload.get('dia_chi_giao_hang', order['dia_chi_giao_hang']), 'voucher_code': 'USED'}
        return {'status': 'ok', 'order': {**order, 'trang_thai_don_hang': 'DA_HUY' if 'cancel' in path else 'MOI_TAO'}}
    monkeypatch.setattr(management, 'request', request)
    return order, calls


def test_cancel_preview_then_confirm_after_checkout_completion(runtime, service):
    order, calls = service
    cart_manager.set_checkout_context(runtime.sid, checkout_submission={'status': 'completed'})
    runtime.provider.plan([('cancel_order', {'order_id': OID, 'reason': 'Tôi hết tiền'})])
    first = runtime.turn(f'cho tôi huỷ đơn hàng {OID} đi, tôi hết tiền rồi')
    assert 'xác nhận' in first['reply'] and 'huỷ đơn' in first['reply']
    assert not any(row[4] for row in calls)
    runtime.provider.plan([('confirm_order_change', {})])
    result = runtime.turn('xác nhận huỷ')
    assert 'huỷ' in result['reply'] and 'thành công' in result['reply']
    assert calls[-1][4] and calls[-1][2]['reason'] == f'cho tôi huỷ đơn hàng {OID} đi, tôi hết tiền rồi'
    assert calls[-1][2]['expected_revision'] == 'revision-1'
    assert not runtime.provider.requests


def test_edit_patches_preserve_other_lines_and_all_toppings(runtime, service):
    _, calls = service
    runtime.provider.plan([('update_order', {'order_id': OID, 'changes': [{'order_line_id': 21, 'quantity': 3}], 'note': 'Gọi trước khi giao'})])
    result = runtime.turn(f'sửa đơn {OID}, bánh thành 3 cái và gọi trước khi giao')
    preview = next(c[2] for c in calls if c[2] and c[2].get('preview_only'))
    assert preview['items'][0]['so_luong'] == 3
    assert preview['items'][1]['toppings'] == ['Xốt Caramel', 'Kem Phô Mai Macchiato']
    assert preview['items'][1]['luong_da'] == 'Ít đá'
    assert preview['items'][1]['do_ngot'] == 'Thêm ngọt'
    assert '397.000đ' in result['reply'] and '15.000đ' in result['reply']
    assert not any(c[4] for c in calls)
    runtime.provider.plan([('confirm_order_change', {})])
    runtime.turn('đồng ý sửa đơn')
    assert calls[-1][2]['expected_total'] == 397000


@pytest.mark.parametrize('status,method,kind', [
    ('DANG_CHUAN_BI', 'VI_DIEN_TU', 'cancel_order'),
    ('HOAN_THANH', 'VI_DIEN_TU', 'cancel_order'),
    ('DANG_CHUAN_BI', 'THANH_TOAN_KHI_NHAN_HANG', 'cancel_order'),
    ('DANG_CHUAN_BI', 'THANH_TOAN_KHI_NHAN_HANG', 'update_order'),
    ('MOI_TAO', 'NGAN_HANG_QR', 'update_order'),
])
def test_service_policy_before_preview(runtime, service, status, method, kind):
    order, calls = service
    order.update(trang_thai_don_hang=status, phuong_thuc_thanh_toan=method)
    runtime.provider.plan([(kind, {'order_id': OID})])
    result = runtime.turn(f'{"huỷ" if kind == "cancel_order" else "sửa"} đơn {OID}')
    assert result['tool_calls_log'][0]['result']['status'] == 'rejected'
    assert len(calls) == 1 and not any(c[4] for c in calls)


def test_confirmed_order_still_cancellable(runtime, service):
    order, _ = service
    order['trang_thai_don_hang'] = 'DA_XAC_NHAN'
    runtime.provider.plan([('cancel_order', {'order_id': OID})])
    assert runtime.turn(f'huỷ đơn {OID}')['tool_calls_log'][0]['result']['status'] == 'require_confirmation'


@pytest.mark.parametrize('reply', ['không huỷ', 'ok nhưng đổi thành 3 cái', 'xác nhận sửa đơn', 'đồng ý hủy đơn ' + OTHER, 'đồng ý?'])
def test_confirmation_never_accepts_decline_new_edits_wrong_action_or_target(runtime, service, reply):
    _, calls = service
    management.prepare(runtime.sid, 'cancel_order', {'order_id': OID}, 'previous')
    action = deepcopy(cart_manager.get_checkout_prefs(runtime.sid)['order_management_action'])
    assert management.confirm(runtime.sid, reply, 'now', action)['status'] == 'confirmation_required'
    assert not any(c[4] for c in calls)


def test_confirmation_requires_prior_turn_and_expires(runtime, service):
    management.prepare(runtime.sid, 'cancel_order', {'order_id': OID}, 'previous')
    action = deepcopy(cart_manager.get_checkout_prefs(runtime.sid)['order_management_action'])
    assert management.confirm(runtime.sid, 'đồng ý', 'previous', action)['status'] == 'preview_required'
    action['expires_at'] = 0
    cart_manager.set_checkout_context(runtime.sid, order_management_action=action)
    assert management.confirm(runtime.sid, 'đồng ý', 'now', action)['status'] == 'preview_expired'


def test_cannot_edit_line_from_another_order_or_empty_order(runtime, service):
    assert management.prepare(runtime.sid, 'update_order', {'order_id': OID, 'changes': [{'order_line_id': 999, 'quantity': 3}]}, 'turn')['status'] == 'invalid_order_line'
    assert management.prepare(runtime.sid, 'update_order', {'order_id': OID, 'changes': [{'order_line_id': 21, 'quantity': 0}, {'order_line_id': 22, 'quantity': 0}]}, 'turn')['status'] == 'empty_order'


def test_reorder_preview_then_atomic_append_with_bound_price_and_replay_id(runtime, service):
    _, calls = service
    cart_manager.set_checkout_context(runtime.sid, checkout_submission={'status': 'completed'})
    runtime.provider.plan([('reorder_order', {'order_id': OID})])
    first = runtime.turn(f'đặt lại đơn {OID}')
    assert 'Xốt Caramel, Kem Phô Mai Macchiato' in first['reply'] and 'thêm vào giỏ' in first['reply']
    assert not any(c[4] for c in calls)
    runtime.provider.plan([('confirm_order_change', {})])
    runtime.turn('xác nhận đặt lại', client_message_id='reorder-once')
    runtime.turn('xác nhận đặt lại', client_message_id='reorder-once')
    writes = [c for c in calls if c[4]]
    assert len(writes) == 1 and writes[0][1] == '/cart/{uid}/reorder'
    assert writes[0][2]['expected_subtotal'] == 293000 and writes[0][3].startswith('ai:reorder:')


def test_model_cannot_change_explicit_customer_order_id(runtime, service):
    runtime.provider.plan([('cancel_order', {'order_id': OTHER})])
    result = runtime.turn(f'bạn có huỷ đơn {OID} được không?')
    assert result['tool_calls_log'][0]['result']['status'] == 'order_target_mismatch'
    assert not service[1]


def test_existing_order_edit_cannot_mutate_current_cart_namespace(runtime):
    runtime.provider.plan([('update_cart_item', {'cart_item_id': '800', 'desired_state': {'quantity': 2}})])
    result = runtime.turn(f'sửa đơn {OID}, món 1 thành 2 cái')
    assert result['tool_calls_log'][0]['result']['status'] == 'existing_order_tools_required'
    assert not runtime.writes


def test_edit_without_changes_remembers_target_for_followup(runtime, service):
    runtime.provider.plan([('update_order', {'order_id': OID})])
    first = runtime.turn(f'sửa đơn {OID} giúp tôi')
    assert 'muốn sửa' in first['reply'] and not any(c[4] for c in service[1])
    runtime.provider.plan([('get_order_details', {'order_id': OID}),
        ('update_order', {'order_id': OID, 'changes': [{'order_line_id': 21, 'quantity': 3}]})])
    result = runtime.turn('bánh thành 3 cái nhé')
    assert '397.000đ' in result['reply']
    assert cart_manager.get_checkout_prefs(runtime.sid).get('order_management_focus') is None
    assert not any(c[4] for c in service[1])


def test_edit_focus_cannot_target_different_order_and_can_be_declined(runtime, service):
    management.prepare(runtime.sid, 'update_order', {'order_id': OID}, 'previous')
    runtime.provider.plan([('update_order', {'order_id': OTHER, 'changes': [{'order_line_id': 21, 'quantity': 3}]})])
    result = runtime.turn('bánh thành 3 cái nhé')
    assert result['tool_calls_log'][0]['result']['status'] == 'order_target_mismatch'
    runtime.provider.plan([('discard_order_change', {})])
    assert 'chưa bị thay đổi' in runtime.turn('thôi không sửa nữa')['reply']
    assert cart_manager.get_checkout_prefs(runtime.sid).get('order_management_focus') is None


def test_edit_focus_expires_and_does_not_capture_new_shopping_requests(runtime, service):
    management.prepare(runtime.sid, 'update_order', {'order_id': OID}, 'previous')
    prefs = cart_manager.get_checkout_prefs(runtime.sid)
    assert not management.management_scope('tôi muốn mua cà phê nóng', prefs)
    assert not management.active_edit_focus('sửa giỏ hàng nhé', prefs)
    prefs['order_management_focus']['expires_at'] = 0
    assert not management.management_scope('bánh thành 3 cái nhé', prefs)


def test_order_tools_scoped_to_order_requests_only(runtime):
    from src.agents.agent_context import business_state
    ctx = {'business': business_state(runtime.sid), 'visible': {}}
    assert 'cancel_order' not in capabilities_for_context(ctx)
    assert 'cancel_order' in capabilities_for_context({**ctx, 'order_management': True})
    cancel = capabilities_for_context({**ctx, 'order_management': True, 'order_management_kind': 'cancel_order'})
    assert 'cancel_order' in cancel and 'update_order' not in cancel and 'reorder_order' not in cancel


@pytest.mark.parametrize('message', [f'không huỷ đơn {OID}', f'cho tôi huỷ đơn {OID} được không?',
    f'huỷ đơn {OID} và đặt lại đơn {OTHER}', 'huỷ đơn giúp tôi', f'nếu được thì huỷ đơn {OID}',
    f'đừng huỷ đơn {OID}'])
def test_direct_order_control_never_guesses_targets_or_questions(message):
    assert management.customer_order_tool(message, {}) is None


def test_literal_cancel_works_even_if_provider_would_reject_request(runtime, service, monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail('Literal cancellation/confirmation must not call inference')
    from src.common import groq_service
    monkeypatch.setattr(groq_service, 'groq_agent_chat', forbidden)
    first = runtime.turn(f'cho tôi huỷ đơn hàng {OID} đi, tôi hết tiền rò')
    assert 'xác nhận' in first['reply'] and not any(c[4] for c in service[1])
    assert 'chưa bị thay đổi' in runtime.turn('không huỷ')['reply']
    assert not any(c[4] for c in service[1])


def test_confirmation_can_include_original_order_id_without_losing_hyphens():
    action = {'kind': 'cancel_order', 'order_id': OID}
    assert management.confirmation_allowed(f'xác nhận huỷ đơn {OID.upper()}', action)
    assert not management.confirmation_allowed(f'xác nhận huỷ đơn {OTHER}', action)


def test_owned_service_request_never_uses_model_user_id(monkeypatch):
    seen = []
    monkeypatch.setattr(management, '_require_valid_session', lambda sid: 'actual-owner')
    monkeypatch.setattr(management, '_get_service_jwt', lambda uid: 'test-only-token')
    class Response:
        status_code, ok = 200, True
        def json(self): return {'order': {'ma_nguoi_dung': 'actual-owner'}}
    monkeypatch.setattr(management.requests, 'request', lambda method, url, **kw: seen.append((url, kw)) or Response())
    management.request('bound-session', 'GET', '/customers/{uid}/orders/' + OID)
    assert '/customers/actual-owner/' in seen[0][0]
    assert seen[0][1]['headers']['Authorization'] == 'Bearer test-only-token'
    monkeypatch.setattr(management, '_require_valid_session', lambda sid: None)
    assert management.request('guest', 'PATCH', '/customers/{uid}/orders/' + OID)['status'] == 'login_required'
    assert len(seen) == 1


def test_confirmation_rejection_does_not_announce_success(runtime, service, monkeypatch):
    management.prepare(runtime.sid, 'cancel_order', {'order_id': OID}, 'previous')
    original = management.request
    monkeypatch.setattr(management, 'request', lambda *a, **kw: {'status': 'rejected', 'message': 'Đơn đã chuyển sang chuẩn bị, không thể huỷ.'} if kw.get('mutation') else original(*a, **kw))
    runtime.provider.plan([('confirm_order_change', {})])
    result = runtime.turn('xác nhận huỷ')
    assert 'không thể huỷ' in result['reply'] and 'thành công' not in result['reply']


@pytest.mark.parametrize('period,anchor,start,end', [
    ('day', '2026-10-03', '2026-10-02T17:00:00+00:00', '2026-10-03T17:00:00+00:00'),
    ('week', '2026-01-01', '2025-12-28T17:00:00+00:00', '2026-01-04T17:00:00+00:00'),
    ('month', '2026-09-18', '2026-08-31T17:00:00+00:00', '2026-09-30T17:00:00+00:00'),
    ('year', '2025-02-18', '2024-12-31T17:00:00+00:00', '2025-12-31T17:00:00+00:00'),
])
def test_vietnam_calendar_windows(period, anchor, start, end):
    bounds = sales_window(period, anchor, datetime(2026, 10, 4, 8, tzinfo=timezone.utc))
    assert [b.astimezone(timezone.utc).isoformat() for b in bounds] == [start, end]


def test_sales_ranking_renders_real_quantities(runtime, monkeypatch):
    from src.function_calling import tools
    rows = [{**p, 'sold_count': count, 'order_count': 2} for p, count in zip(runtime.products, [8, 5, 2])]
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'filter_catalog', lambda args, sid: {'status': 'ok', 'products': rows[:2], 'ranking': 'completed_paid_quantity', 'period': 'week'})
    runtime.provider.plan([('filter_catalog', {'search_text': '', 'sort_by': 'sold_desc', 'period': 'week', 'limit': 2})])
    result = runtime.turn('xem 2 món bán chạy nhất tuần này')
    assert [p['sold_count'] for p in result['ui_payload']['products']] == [8, 5]
    assert 'tuần' in result['reply'] and '8' in result['reply'] and 'đã hoàn thành' in result['reply']
    assert not runtime.writes


def test_decreasing_order_price_never_creates_confirmation(runtime, service):
    result = management.prepare(runtime.sid, 'update_order', {'order_id': OID,
        'changes': [{'order_line_id': 21, 'quantity': 1}]}, 'preview-turn')
    assert result['status'] == 'rejected' and 'bằng hoặc cao hơn' in result['message']
    assert not cart_manager.get_checkout_prefs(runtime.sid).get('order_management_action')
    assert not any(c[4] for c in service[1])


def test_wallet_edit_quote_binds_revision_total_and_difference(runtime, service):
    order, calls = service
    order.update(phuong_thuc_thanh_toan='VI_DIEN_TU', trang_thai_thanh_toan='DA_THANH_TOAN', trang_thai_don_hang='DA_XAC_NHAN')
    result = management.prepare(runtime.sid, 'update_order', {'order_id': OID,
        'changes': [{'order_line_id': 21, 'quantity': 3}]}, 'preview-turn')
    assert result['status'] == 'require_confirmation'
    assert 'Tổng cũ: **298.000đ**' in result['message'] and 'trừ thêm **99.000đ**' in result['message']
    action = deepcopy(cart_manager.get_checkout_prefs(runtime.sid)['order_management_action'])
    management.confirm(runtime.sid, 'xác nhận sửa đơn', 'next-turn', action)
    assert calls[-1][4] and calls[-1][2]['expected_revision'] == 'revision-1'
    assert calls[-1][2]['expected_total'] == 397000


def test_wallet_shortfall_requires_topup_and_new_quote_without_commit(runtime, service):
    order, calls = service
    order.update(phuong_thuc_thanh_toan='VI_DIEN_TU', trang_thai_thanh_toan='DA_THANH_TOAN', wallet_shortfall=89000)
    result = management.prepare(runtime.sid, 'update_order', {'order_id': OID,
        'changes': [{'order_line_id': 21, 'quantity': 3}]}, 'preview-turn')
    assert 'nạp thêm' in result['message'] and '89.000đ' in result['message']
    action = deepcopy(cart_manager.get_checkout_prefs(runtime.sid)['order_management_action'])
    result = management.confirm(runtime.sid, 'xác nhận sửa đơn', 'next-turn', action)
    assert result['status'] == 'insufficient_wallet' and 'xem lại thay đổi' in result['message']
    assert not any(c[4] for c in calls)
