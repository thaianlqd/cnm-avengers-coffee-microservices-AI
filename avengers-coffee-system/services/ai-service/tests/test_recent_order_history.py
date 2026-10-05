"""Read owned recent orders without a provider, using a fake database only."""
from copy import deepcopy
from types import SimpleNamespace
import socket

import pytest
import requests

from test_llm_tool_orchestrator import runtime
from test_checkout_guarded_contract import calls, content
from src.agents.order_management import recent_order_read, management_scope
from src.agents.tool_capabilities import capabilities_for_context
from src.common import cart_manager
from src.function_calling.tools import order_tools

MESSAGE = 'cho tôi xem trạng thái 3 đơn gần nhất tôi đặt đi'
ROWS = [dict(ma_don_hang=f'924375ec-214d-4fd4-8ac5-a823ce4cb18{i}',
             tong_tien=99000+i*1000, trang_thai_don_hang=status,
             trang_thai_thanh_toan=payment, ngay_tao=f'2026-10-05T0{i}:00:00+00:00')
        for i, (status, payment) in enumerate([
            ('MOI_TAO', 'CHO_THANH_TOAN'), ('DANG_GIAO', 'DA_THANH_TOAN'),
            ('DA_HUY', 'DA_HOAN_TIEN'), ('HOAN_THANH', 'DA_THANH_TOAN')])]


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    def blocked(*a, **k):
        raise AssertionError('Live transport forbidden in recent order tests')
    monkeypatch.setattr(socket.socket, 'connect', blocked)
    monkeypatch.setattr(socket.socket, 'connect_ex', blocked)
    monkeypatch.setattr(socket, 'create_connection', blocked)
    monkeypatch.setattr(socket, 'getaddrinfo', blocked)
    monkeypatch.setattr(requests.sessions.Session, 'request', blocked)


@pytest.fixture
def history_db(runtime, monkeypatch):
    rows, queries = deepcopy(ROWS), []
    class Database:
        def connect(self): return self
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def execute(self, query, params):
            queries.append((str(query), deepcopy(params)))
            return SimpleNamespace(mappings=lambda: SimpleNamespace(all=lambda: deepcopy(rows[:params['limit']])))
    monkeypatch.setattr(order_tools, '_require_valid_session', lambda sid: 'actual-owner' if sid == runtime.sid else None)
    monkeypatch.setattr(order_tools, '_get_engine', lambda: Database())
    return rows, queries


def test_reported_recent_status_request_reads_owned_orders_without_inference(runtime, history_db):
    before = deepcopy(cart_manager.get_cart(runtime.sid))
    result = runtime.turn(MESSAGE, client_message_id='recent-status')
    assert result == runtime.turn(MESSAGE, client_message_id='recent-status')
    assert result['error'] is None and not runtime.provider.requests and not runtime.writes
    assert [row['tool'] for row in result['tool_calls_log']] == ['get_order_history']
    query, params = history_db[1][0]
    assert params == {'session_id': 'actual-owner', 'limit': 3}
    assert 'ma_nguoi_dung = :session_id' in query and 'ORDER BY ngay_tao DESC' in query
    assert 'trang_thai_thanh_toan' in query and 'LIMIT :limit' in query
    assert '3 đơn gần nhất' in result['reply']
    for row in ROWS[:3]: assert row['ma_don_hang'] in result['reply']
    assert ROWS[3]['ma_don_hang'] not in result['reply']
    for label in ('Mới tạo', 'Đang giao', 'Đã huỷ', 'Chưa thanh toán', 'Đã hoàn tiền', '05/10/2026 07:00'):
        assert label in result['reply']
    assert '1900' not in result['reply'] and 'cskh@' not in result['reply']
    after = deepcopy(cart_manager.get_cart(runtime.sid))
    after['checkout_prefs'].pop('processed_order_turns', None)  # Read receipt, not a cart change.
    assert after == before and len(history_db[1]) == 1


@pytest.mark.parametrize('message,count', [
    (MESSAGE, 3), ('xem ba đơn hàng gần nhất của tôi nhé', 3),
    ('cho tôi xem lịch sử đơn hàng', 5), ('kiểm tra đơn mới nhất tôi đặt', 1),
    ('cho tôi xem trạng thái 10 đơn gần đây', 10),
])
def test_read_language_and_capabilities(message, count):
    assert management_scope(message, {})
    read = recent_order_read(message)
    assert read == ('get_order_history', {'limit': count})
    allowed = capabilities_for_context({'business': {'authenticated': True},
        'order_management': True, 'recent_order_read': read})
    assert {'get_order_history', 'get_order_details', 'track_order_status'} <= allowed
    assert not {'cancel_order', 'update_order', 'reorder_order'} & allowed


@pytest.mark.parametrize('message', [
    'không xem 3 đơn gần nhất', 'huỷ đơn gần nhất', 'đặt lại đơn gần nhất',
    'xem 3 đơn gần nhất rồi huỷ đơn số 1', 'xem 3 đơn gần nhất và mua thêm bánh',
    'xem 3 đơn gần nhất đã huỷ', 'xem 3 đơn gần nhất trong tuần này',
    'xem 21 đơn gần nhất', 'xem 0 đơn gần nhất', 'xem 3 món bánh gần nhất',
    'nếu xem được thì huỷ đơn gần nhất',
])
def test_mutations_filters_or_invalid_counts_do_not_become_simple_reads(message):
    assert recent_order_read(message) is None


def test_fewer_owned_orders_reports_actual_count(runtime, history_db):
    del history_db[0][2:]
    result = runtime.turn(MESSAGE)
    assert '2 đơn' in result['reply'] and 'chưa đủ 3' in result['reply']
    assert 'Đã huỷ' not in result['reply'] and not runtime.writes


def test_empty_owned_history_is_not_a_service_failure(runtime, history_db):
    history_db[0].clear()
    result = runtime.turn(MESSAGE)
    assert 'chưa có đơn hàng' in result['reply'] and 'Hotline' not in result['reply']


def test_database_failure_uses_verified_failure_message(runtime, history_db, monkeypatch):
    def unavailable(): raise RuntimeError('synthetic unavailable database')
    monkeypatch.setattr(order_tools, '_get_engine', unavailable)
    result = runtime.turn(MESSAGE)
    assert result['tool_calls_log'][0]['result']['status'] == 'error'
    assert 'Lỗi khi lấy lịch sử' in result['reply'] and 'Hotline' not in result['reply']
    assert not runtime.provider.requests and not runtime.writes


def test_guest_is_asked_to_log_in_without_database_or_inference(runtime, history_db, monkeypatch):
    from src.function_calling.tools import cart_tools
    monkeypatch.setattr(cart_tools, 'is_authenticated_cart_session', lambda sid: False)
    monkeypatch.setattr(order_tools, '_require_valid_session', lambda sid: None)
    result = runtime.turn(MESSAGE)
    assert 'đăng nhập' in result['reply'] and not history_db[1]
    assert not runtime.provider.requests and not runtime.writes


def test_read_history_preserves_pending_edit_preview(runtime, history_db):
    preview = {'kind': 'cancel_order', 'order_id': ROWS[0]['ma_don_hang'],
               'created_turn_id': 'earlier', 'expires_at': 9999999999}
    cart_manager.set_checkout_context(runtime.sid, order_management_action=preview)
    result = runtime.turn(MESSAGE)
    assert '3 đơn gần nhất' in result['reply'] and not runtime.writes
    assert cart_manager.get_checkout_prefs(runtime.sid)['order_management_action'] == preview


def test_llm_history_read_honors_limit_and_cannot_replace_facts_with_hotline(runtime, history_db):
    runtime.provider.steps = [calls(('get_order_history', {'limit': 2})),
        content('Bạn gọi Hotline nhé.')]
    result = runtime.turn('kiểm tra các đơn hàng của tôi')
    assert '2 đơn gần nhất' in result['reply'] and 'Hotline' not in result['reply']
    assert history_db[1][0][1]['limit'] == 2 and not runtime.writes


@pytest.mark.parametrize('limit', [0, 21, True, '3'])
def test_executor_rejects_invalid_count_before_database(runtime, history_db, limit):
    assert order_tools.execute_get_order_history(runtime.sid, limit)['status'] == 'invalid_arguments'
    assert not history_db[1]
