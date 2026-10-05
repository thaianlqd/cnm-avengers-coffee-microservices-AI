"""Order ordinals bind to the displayed history, with fake providers/services."""
from copy import deepcopy

import pytest

from test_llm_tool_orchestrator import runtime
from test_order_management_and_sales import service, OID, OTHER
from test_recent_order_history import offline
from src.agents.agent_memory import ConversationMemory
from src.agents.order_management import order_reference, literal_order_selection, restore_history_snapshot, prepare
from src.common import cart_manager, groq_service
from src.function_calling import tools

MESSAGE = 'cho tôi xem trạng thái 3 đơn gần nhất tôi đặt đi'


@pytest.fixture
def displayed(runtime, monkeypatch):
    rows = [dict(ma_don_hang=identity, trang_thai_don_hang='MOI_TAO',
                 phuong_thuc_thanh_toan='VI_DIEN_TU',
                 trang_thai_thanh_toan='DA_THANH_TOAN', tong_tien=298000)
            for identity in (OID, OTHER, '6361ffc1-10bd-4a4f-81c1-0a6c89fa561d')]
    def history(args, sid):
        runtime.reads.append(('history', deepcopy(args)))
        return {'status': 'ok' if rows else 'not_found', 'orders': deepcopy(rows[:args.get('limit', 5)]),
                'message': 'Bạn chưa có đơn hàng nào trong lịch sử.' if not rows else ''}
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'get_order_history', history)
    runtime.turn(MESSAGE)
    return rows


def forbid_inference(monkeypatch):
    def forbidden(*args, **kwargs): raise AssertionError('Literal selection must not call the provider')
    monkeypatch.setattr(groq_service, 'groq_agent_chat', forbidden)


def test_reported_cancelled_order_explains_rejection_without_provider(runtime, service, displayed, monkeypatch):
    service[0]['trang_thai_don_hang'] = 'DA_HUY'
    before = deepcopy(cart_manager.get_cart(runtime.sid)['items'])
    forbid_inference(monkeypatch)
    for _ in range(2):
        result = runtime.turn('cho tôi sửa đơn số 1 đi bạn')
        assert 'đã huỷ' in result['reply'] and 'không thể sửa' in result['reply']
        assert result['error'] is None and 'chưa xác minh' not in result['reply']
        assert result['tool_calls_log'][0]['args']['order_id'] == OID
    assert all(c[0] == 'GET' and c[1].endswith(OID) for c in service[1])
    assert not runtime.provider.requests and not runtime.writes
    assert len(runtime.reads) == 1 and cart_manager.get_cart(runtime.sid)['items'] == before
    assert not cart_manager.get_checkout_prefs(runtime.sid).get('order_management_action')


def test_new_cod_selection_opens_edits_and_keeps_followup_target(runtime, service, displayed):
    first = runtime.turn('cho tôi sửa đơn số 1 đi bạn')
    assert 'muốn sửa món' in first['reply']
    assert cart_manager.get_checkout_prefs(runtime.sid)['order_management_focus']['order_id'] == OID
    runtime.provider.plan([('update_order', {'order_id': OID,
        'changes': [{'order_line_id': 21, 'quantity': 3}]})])
    result = runtime.turn('bánh thành 3 cái nhé')
    assert '397.000đ' in result['reply'] and 'xác nhận sửa đơn' in result['reply']
    assert not any(c[4] for c in service[1])


def test_second_number_overrides_old_focus_without_refetching_history(runtime, service, displayed):
    runtime.turn('sửa đơn số 1 đi')
    displayed.reverse()  # A later backend sort must not change the visible selection.
    result = runtime.turn('cho tôi sửa đơn số 2 đi bạn')
    assert result['tool_calls_log'][0]['args']['order_id'] == OTHER
    assert service[1][-1][1].endswith(OTHER) and len(runtime.reads) == 1
    assert cart_manager.get_checkout_prefs(runtime.sid)['order_management_focus']['order_id'] == OTHER


def test_inferred_complex_patch_cannot_redirect_the_order_number(runtime, service, displayed):
    runtime.provider.plan([('update_order', {'order_id': OTHER, 'changes': [{'order_line_id': 21, 'quantity': 3}]})])
    result = runtime.turn('sửa đơn số 1, bánh thành 3 cái')
    assert result['tool_calls_log'][0]['result']['status'] == 'order_target_mismatch'
    assert not service[1]


@pytest.mark.parametrize('tool,verb', [('cancel_order', 'huỷ'), ('reorder_order', 'đặt lại')])
def test_numbered_cancel_and_reorder_only_prepare_preview(runtime, service, displayed, tool, verb):
    result = runtime.turn(f'cho tôi {verb} đơn số 1 đi bạn')
    assert result['tool_calls_log'][0]['tool'] == tool
    assert result['tool_calls_log'][0]['result']['status'] == 'require_confirmation'
    assert not any(c[4] for c in service[1]) and not runtime.provider.requests


@pytest.mark.parametrize('status,method', [('DANG_CHUAN_BI', 'THANH_TOAN_KHI_NHAN_HANG'),
                                       ('MOI_TAO', 'VI_DIEN_TU')])
def test_numbered_selection_preserves_current_edit_rules(runtime, service, displayed, status, method):
    service[0].update(trang_thai_don_hang=status, phuong_thuc_thanh_toan=method, trang_thai_thanh_toan='CHO_THANH_TOAN')
    result = runtime.turn('sửa đơn số 1 đi bạn')
    assert result['tool_calls_log'][0]['result']['status'] == 'rejected' and result['reply']
    assert not any(c[4] for c in service[1])


@pytest.mark.parametrize('number', [0, 4, 99])
def test_out_of_range_number_asks_for_reference_without_provider(runtime, service, displayed, monkeypatch, number):
    forbid_inference(monkeypatch)
    result = runtime.turn(f'sửa đơn số {number} đi bạn')
    assert 'chưa xác định' in result['reply'] and 'mã đơn' in result['reply']
    assert not result['tool_calls_log'] and not service[1] and not runtime.writes


def test_no_displayed_history_never_uses_cart_or_product_number(runtime, service, monkeypatch):
    forbid_inference(monkeypatch)
    result = runtime.turn('sửa đơn số 1 đi bạn')
    assert 'chưa xác định' in result['reply'] and not service[1] and not runtime.writes


def test_new_history_replaces_previous_numbering_and_empty_list_clears_it(runtime, service, displayed):
    displayed.reverse()
    runtime.turn(MESSAGE)
    result = runtime.turn('sửa đơn số 1 đi bạn')
    assert result['tool_calls_log'][0]['args']['order_id'] == displayed[0]['ma_don_hang']
    displayed.clear()
    runtime.turn(MESSAGE)
    result = runtime.turn('sửa đơn số 1 đi bạn')
    assert 'chưa xác định' in result['reply']


def test_existing_pre_fix_display_can_restore_only_verified_receipt(runtime, service, displayed, monkeypatch):
    memory = ConversationMemory(runtime.redis).load(runtime.sid)
    memory['visible_snapshots'].pop('orders')
    ConversationMemory(runtime.redis).save(runtime.sid, memory)
    forbid_inference(monkeypatch)
    result = runtime.turn('cho tôi sửa đơn số 1 đi bạn')
    assert result['tool_calls_log'][0]['args']['order_id'] == OID
    assert 'muốn sửa' in result['reply']


def test_internal_history_read_does_not_replace_the_displayed_numbering(runtime, service, displayed):
    displayed.reverse()
    runtime.provider.plan([('get_order_history', {'limit': 3}), ('cancel_order', {'order_id': OID})])
    result = runtime.turn(f'bạn có huỷ đơn {OID} được không?')
    assert 'xác nhận' in result['reply']
    orders = ConversationMemory(runtime.redis).load(runtime.sid)['visible_snapshots']['orders']
    assert orders[0]['order_id'] == OID
    assert runtime.turn('sửa đơn số 1 đi bạn')['tool_calls_log'][0]['args']['order_id'] == OID


def test_prose_and_other_conversation_receipts_cannot_restore_numbering():
    memory = {'recent_turns': [{'role': 'assistant', 'content': f'1. Đơn {OID}'}]}
    prefs = {'processed_order_turns': {'other': {'result': {'reply': 'a different conversation reply',
        'tool_calls_log': [{'tool': 'get_order_history', 'args': {'limit': 1}, 'result': {
            'status': 'ok', 'orders': [{'ma_don_hang': OID}]}}]}}}}
    restore_history_snapshot(memory, prefs)
    assert not memory.get('visible_snapshots', {}).get('orders')


def test_new_failed_history_does_not_restore_older_success(runtime, displayed):
    memory = ConversationMemory(runtime.redis).load(runtime.sid)
    memory['visible_snapshots']['orders'] = []
    memory['recent_turns'].append({'role': 'assistant', 'content': 'history unavailable'})
    prefs = deepcopy(cart_manager.get_checkout_prefs(runtime.sid))
    prefs['processed_order_turns']['new'] = {'result': {'reply': 'history unavailable',
        'tool_calls_log': [{'tool': 'get_order_history', 'result': {'status': 'error'}}]}}
    restore_history_snapshot(memory, prefs)
    assert not memory['visible_snapshots']['orders']


def test_snapshot_survives_memory_roundtrip_above_five_and_focus_is_preserved():
    rows = [{'order_id': OID, 'display_index': n} for n in range(1, 21)]
    bounded = ConversationMemory.bounded({'visible_snapshots': {'orders': rows}, 'focus': {'order': {'order_id': OID}}})
    assert len(bounded['visible_snapshots']['orders']) == 20
    assert bounded['focus']['order']['order_id'] == OID


@pytest.mark.parametrize('message', ['không sửa đơn số 1', 'sửa đơn số 1 được không?',
    'nếu được thì huỷ đơn số 1', 'sửa đơn số 1 và huỷ đơn số 2', 'sửa đơn số 1, bánh thành 2 cái'])
def test_direct_selection_does_not_parse_questions_negation_or_changes(message):
    assert literal_order_selection(message) is None


def test_ordinal_and_uuid_disagreement_cannot_select_a_target():
    result = order_reference(f'sửa đơn số 1 mã {OTHER}', [{'order_id': OID, 'display_index': 1}])
    assert result['status'] == 'ambiguous'


@pytest.mark.parametrize('message', ['vậy cho tôi sửa đơn số 2 đi bạn', 'thế thì sửa đơn số 2 nhé', 'vậy thì giúp tôi sửa đơn số hai đi'])
@pytest.mark.parametrize('method,paid,expected', [('THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN', 'needs_order_changes'),
    ('VI_DIEN_TU', 'DA_THANH_TOAN', 'needs_order_changes'), ('NGAN_HANG_QR', 'DA_THANH_TOAN', 'rejected')])
def test_reported_second_order_followup_never_calls_provider(runtime, service, displayed, monkeypatch, message, method, paid, expected):
    runtime.turn('sửa đơn số 1 đi')
    service[0].update(trang_thai_don_hang='DA_XAC_NHAN', phuong_thuc_thanh_toan=method, trang_thai_thanh_toan=paid)
    forbid_inference(monkeypatch)
    result = runtime.turn(message)
    assert result['error'] is None and 'chưa xác minh' not in result['reply']
    assert result['tool_calls_log'][0]['args']['order_id'] == OTHER
    assert result['tool_calls_log'][0]['result']['status'] == expected
    if expected == 'rejected': assert 'QR/cổng thanh toán' in result['reply']
    assert not runtime.provider.requests and not any(c[4] for c in service[1])


def test_switching_to_locked_second_order_abandons_old_edit_confirmation(runtime, service, displayed, monkeypatch):
    prepare(runtime.sid, 'update_order', {'order_id': OID, 'changes': [{'order_line_id': 21, 'quantity': 3}]}, 'earlier')
    assert cart_manager.get_checkout_prefs(runtime.sid)['order_management_action']['order_id'] == OID
    service[0].update(trang_thai_don_hang='DA_XAC_NHAN', phuong_thuc_thanh_toan='NGAN_HANG_QR', trang_thai_thanh_toan='DA_THANH_TOAN')
    forbid_inference(monkeypatch)
    result = runtime.turn('vậy cho tôi sửa đơn số 2 đi bạn')
    assert result['tool_calls_log'][0]['result']['status'] == 'rejected'
    assert cart_manager.get_checkout_prefs(runtime.sid).get('order_management_action') is None
    assert not any(c[4] for c in service[1])


@pytest.mark.parametrize('message', [f'#{OTHER} cho tôi sửa đơn này', f'#{OTHER.upper()} cho tôi sửa đơn này',
    f'{OTHER} cho tôi sửa đơn này đi bạn', f'cho tôi sửa đơn {OTHER} đi bạn', f'vậy cho tôi sửa đơn này {OTHER} nhé'])
@pytest.mark.parametrize('method,paid,status', [('THANH_TOAN_KHI_NHAN_HANG', 'CHO_THANH_TOAN', 'needs_order_changes'),
    ('VI_DIEN_TU', 'DA_THANH_TOAN', 'needs_order_changes'), ('NGAN_HANG_QR', 'DA_THANH_TOAN', 'rejected')])
def test_reported_uuid_selection_in_any_position_needs_no_history_or_provider(runtime, service, monkeypatch, message, method, paid, status):
    service[0].update(trang_thai_don_hang='DA_XAC_NHAN', phuong_thuc_thanh_toan=method, trang_thai_thanh_toan=paid)
    forbid_inference(monkeypatch)
    result = runtime.turn(message)
    assert result['error'] is None and result['tool_calls_log'][0]['args']['order_id'] == OTHER
    assert result['tool_calls_log'][0]['result']['status'] == status
    assert service[1][-1][0] == 'GET' and service[1][-1][1].endswith(OTHER)
    assert not runtime.provider.requests and not any(c[4] for c in service[1])


@pytest.mark.parametrize('message', [f'{OTHER} không sửa đơn này', f'{OTHER} cho tôi sửa đơn này được không?',
    f'{OTHER} nếu được thì sửa đơn này', f'{OTHER} cho tôi sửa đơn này, tăng bánh thành 3 cái',
    f'{OTHER} cho tôi sửa đơn này và {OID}', f'cho tôi xem đơn {OTHER}', f'xác nhận sửa đơn {OTHER}'])
def test_uuid_selector_never_guesses_questions_conditions_changes_or_confirmations(message):
    from src.agents.order_management import literal_order_id_selection
    assert literal_order_id_selection(message) is None
