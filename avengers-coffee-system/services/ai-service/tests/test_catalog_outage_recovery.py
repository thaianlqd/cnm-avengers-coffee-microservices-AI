"""Provider failures recover simple browsing through fake Menu, never writes."""
from copy import deepcopy

import pytest

from test_llm_tool_orchestrator import runtime
from test_provider_outage_presentation import offline, ServiceUnavailable
from test_discovery_shortfall import MESSAGE, ROWS, install_catalog
from src.common import cart_manager
from src.function_calling import tools


@pytest.mark.parametrize('failure', [TimeoutError('synthetic'), ServiceUnavailable('synthetic')])
def test_reported_browse_recovers_two_matching_cakes(runtime, monkeypatch, failure):
    before = deepcopy(cart_manager.get_cart(runtime.sid)['items'])
    install_catalog(runtime, monkeypatch)
    runtime.provider.steps = [failure]
    result = runtime.turn(MESSAGE, client_message_id='browse-outage')
    replay = runtime.turn(MESSAGE, client_message_id='browse-outage')
    assert result == replay and result['error'] is None
    assert [row['product_id'] for row in result['ui_payload']['products']] == ['201', '202']
    assert '2 món bánh matcha' in result['reply'] and '5 món' in result['reply']
    assert len(runtime.provider.requests) == 1 and len(runtime.reads) == 1
    assert not runtime.writes and cart_manager.get_cart(runtime.sid)['items'] == before


def test_zero_matches_is_verified_menu_result(runtime, monkeypatch):
    install_catalog(runtime, monkeypatch, rows=ROWS[2:])
    runtime.provider.steps = [TimeoutError('synthetic')]
    result = runtime.turn(MESSAGE)
    assert result['error'] is None and not result['ui_payload']['products']
    assert 'chưa tìm thấy' in result['reply'].lower() and not runtime.writes


def test_failed_menu_read_keeps_outage_message(runtime, monkeypatch):
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'filter_catalog', lambda *args: {'status': 'error'})
    runtime.provider.steps = [TimeoutError('synthetic')]
    result = runtime.turn(MESSAGE)
    assert result['error'] == 'network_timeout'
    assert 'AI đang tạm thời không phản hồi' in result['reply']
    assert not result['ui_payload']['products'] and not runtime.writes


@pytest.mark.parametrize('message', [
    'xóa món 1 rồi tôi muốn xem 5 bánh matcha',
    'hoàn tất giỏ rồi xem 5 bánh matcha',
    'theo mặc định rồi tôi muốn xem 5 bánh matcha',
    'cho tôi bánh số 2 rồi xem 5 bánh matcha',
    'xem 5 bánh matcha có nguyên liệu gì?',
    'xem 5 bánh matcha dưới 50000',
    'xem 5 bánh matcha rẻ nhất',
    'xem 5 bánh matcha và nước matcha',
    'thêm bánh mochi vào giỏ rồi xem 5 bánh matcha',
    'xem 5 bánh matcha không đường',
    'xem 5 bánh matcha chay',
    'tôi không muốn mua bánh matcha, xem 5 món nhé',
])
def test_complex_requests_do_not_trigger_simple_browse_recovery(runtime, message):
    runtime.provider.steps = [TimeoutError('synthetic')]
    result = runtime.turn(message)
    assert result['error'] == 'network_timeout'
    assert not result['tool_calls_log'] and not runtime.reads and not runtime.writes


def test_selected_card_does_not_become_a_browse_recovery(runtime):
    runtime.provider.steps = [TimeoutError('synthetic')]
    result = runtime.turn(MESSAGE, selected_product_id='101')
    assert result['error'] == 'network_timeout'
    assert not any(row['tool'] == 'filter_catalog' for row in result['tool_calls_log'])
    assert not runtime.writes
