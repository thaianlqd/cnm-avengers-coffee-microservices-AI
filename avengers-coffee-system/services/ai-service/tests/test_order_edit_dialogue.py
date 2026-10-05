"""Reported followup, replacement and quantity edit journeys, entirely offline."""
from copy import deepcopy
import pytest
from test_llm_tool_orchestrator import runtime
from test_order_management_and_sales import service, OID
from src.common import cart_manager, groq_service
from src.agents.order_edit_dialogue import accepts
from src.function_calling.tools import product_tools


@pytest.fixture
def guided(runtime, service, monkeypatch):
    def forbidden(*a, **kw): raise AssertionError('Guided order edit must not call a model')
    monkeypatch.setattr(groq_service, 'groq_agent_chat', forbidden)
    def catalog(**kw):
        assert kw['search_text'] in {'mochi kem matcha', 'matcha'}
        return {'status': 'ok', 'products': [dict(product_id='115', product_name='Mochi Kem Matcha', base_price=19000),
            dict(product_id='114', product_name='Bánh Trung Thu Matcha', base_price=99000)]}
    monkeypatch.setattr(product_tools, 'execute_filter_catalog', catalog)
    original = __import__('src.agents.order_management', fromlist=['request']).request
    def request(sid, method, path, payload=None, operation_id=None, mutation=False):
        # Fake the authoritative Menu reprice, not the client-supplied price.
        if payload and payload.get('preview_only'):
            payload = deepcopy(payload)
            for row in payload['items']:
                if str(row['ma_san_pham']) == '115':
                    row.update(gia_ban=150000, ten_san_pham='Mochi Kem Matcha', kich_co='Vừa', toppings=[])
        return original(sid, method, path, payload, operation_id, mutation)
    monkeypatch.setattr(__import__('src.agents.order_management', fromlist=['request']), 'request', request)
    runtime.turn(f'#{OID} cho tôi sửa đơn này')
    return runtime, service


def test_reported_followup_lists_owned_items_without_provider(guided):
    runtime, (_, calls) = guided
    result = runtime.turn('tôi muốn đổi món')
    assert 'Bánh Trung Thu Matcha' in result['reply'] and 'Latte Tiramisu' in result['reply']
    assert result['error'] is None and 'chưa xác minh' not in result['reply']
    assert all(c[0] == 'GET' for c in calls)
    assert not runtime.provider.requests and not runtime.writes


def test_choose_line_name_preview_then_confirm_is_complete_without_provider(guided):
    runtime, (_, calls) = guided
    runtime.turn('tôi muốn đổi món')
    result = runtime.turn('món số 1')
    assert 'sang món nào' in result['reply']
    result = runtime.turn('Mochi Kem Matcha')
    assert 'xác nhận sửa đơn' in result['reply'] and 'Mochi Kem Matcha' in result['reply']
    preview = next(c[2] for c in calls if c[2] and c[2].get('preview_only'))
    assert preview['items'][0]['ma_san_pham'] == '115' and preview['items'][0]['so_luong'] == 2
    assert preview['items'][1]['toppings'] == ['Xốt Caramel', 'Kem Phô Mai Macchiato']
    assert not any(c[4] for c in calls)
    runtime.turn('xác nhận sửa đơn')
    assert calls[-1][4] and calls[-1][2]['expected_total'] == 400000
    assert not runtime.provider.requests and not runtime.writes


def test_direct_replacement_and_partial_candidate_selection_use_separate_numbering(guided):
    runtime, (_, calls) = guided
    runtime.turn('tôi muốn đổi món')
    result = runtime.turn('đổi món số 2 thành matcha')
    assert 'Mochi Kem Matcha' in result['reply'] and 'Bánh Trung Thu Matcha' in result['reply']
    runtime.turn('món số 1')
    preview = next(c[2] for c in calls if c[2] and c[2].get('preview_only'))
    assert str(preview['items'][1]['ma_san_pham']) == '115'
    assert preview['items'][0]['ma_san_pham'] == 114
    assert not any(c[4] for c in calls)


def test_quantity_edits_reprice_and_only_confirm_commits(guided):
    runtime, (_, calls) = guided
    runtime.turn('tôi muốn sửa số lượng')
    result = runtime.turn('món số 1 thành 3 cái')
    assert '397.000đ' in result['reply']
    assert not any(c[4] for c in calls)
    runtime.turn('đồng ý sửa đơn')
    assert calls[-1][4]


def test_ordinals_are_not_invented_before_showing_owned_order_items(guided):
    runtime, (_, calls) = guided
    result = runtime.turn('đổi món số 1 thành Mochi Kem Matcha')
    assert 'danh sách' in result['reply'] and all(c[0] == 'GET' for c in calls)


def test_out_of_range_and_current_policy_are_enforced(guided):
    runtime, (order, calls) = guided
    runtime.turn('tôi muốn đổi món')
    assert 'không có trong đơn' in runtime.turn('món số 9')['reply']
    order.update(phuong_thuc_thanh_toan='NGAN_HANG_QR', trang_thai_thanh_toan='DA_THANH_TOAN')
    assert 'QR' in runtime.turn('đổi món số 1 thành Mochi Kem Matcha')['reply']
    assert not any(c[4] for c in calls)


@pytest.mark.parametrize('message', ['không muốn đổi món', 'đổi món được không?', 'đổi món số 1 và huỷ đơn',
    'sửa giỏ hàng', 'món số 1 thành 3 cái và ghi chú khác', 'đổi món nếu rẻ hơn'])
def test_ambiguous_or_mixed_language_is_not_a_literal_edit(message):
    assert not accepts(message, {'kind': 'update_order', 'edit_stage': 'select_line'})


def test_current_revision_change_resets_shown_line_references(guided, monkeypatch):
    runtime, (_, calls) = guided
    runtime.turn('tôi muốn đổi món')
    from src.agents import order_management as management
    original = management.request
    def request(*a, **kw):
        result = original(*a, **kw)
        if a[1] == 'GET': result['revision'] = 'revision-2'
        return result
    monkeypatch.setattr(management, 'request', request)
    result = runtime.turn('đổi món số 1 thành Mochi Kem Matcha')
    assert 'Đơn đã thay đổi' in result['reply']
    assert all(c[0] == 'GET' for c in calls)
    assert not cart_manager.get_checkout_prefs(runtime.sid).get('order_management_action')


def test_smaller_quantity_cannot_reduce_original_total(guided):
    runtime, (_, calls) = guided
    runtime.turn('tôi muốn đổi món')
    result = runtime.turn('món số 1 thành 1 cái')
    assert 'bằng hoặc cao hơn' in result['reply']
    assert not cart_manager.get_checkout_prefs(runtime.sid).get('order_management_action')
    assert not any(c[4] for c in calls)


def test_wallet_missing_difference_asks_for_topup_without_mutation(guided):
    runtime, (order, calls) = guided
    order.update(phuong_thuc_thanh_toan='VI_DIEN_TU', trang_thai_thanh_toan='DA_THANH_TOAN', wallet_shortfall=99000)
    runtime.turn('tôi muốn đổi món')
    result = runtime.turn('món số 1 thành 3 cái')
    assert 'trừ thêm **99.000đ**' in result['reply']
    assert 'thiếu **99.000đ**' in result['reply']
    result = runtime.turn('xác nhận sửa đơn')
    assert 'nạp thêm' in result['reply'] and not any(c[4] for c in calls)


@pytest.mark.parametrize('message', ['Cà Phê Đen Đá', 'cho tôi đổi sang Cà Phê Đen Đá nhé', 'Bạc Xỉu Nóng'])
def test_drink_names_are_literal_replacements_not_option_commands(message):
    assert accepts(message, {'kind': 'update_order', 'edit_stage': 'replacement_name'})


def test_view_order_then_swap_request_and_option_modification(runtime, service, monkeypatch):
    def catalog(**kw):
        return {'status': 'ok', 'products': [dict(product_id='115', product_name='Mochi Kem Matcha', base_price=19000),
            dict(product_id='114', product_name='Bánh Trung Thu Matcha', base_price=99000)]}
    monkeypatch.setattr(product_tools, 'execute_filter_catalog', catalog)
    _, calls = service

    # Turn 1: Model calls get_order_details
    runtime.provider.plan([('get_order_details', {'order_id': OID})])
    r1 = runtime.turn(f'{OID} => tôi muốn xem đơn này')
    assert 'chi tiết đơn hàng' in r1['reply'].lower()

    # Guided flows for Turn 2 and 3 must not call LLM
    def forbidden(*a, **kw): raise AssertionError('Guided flow must not call LLM')
    monkeypatch.setattr(groq_service, 'groq_agent_chat', forbidden)

    # Turn 2: Request swap item 2 for another item
    r2 = runtime.turn('tôi muốn bỏ món số 2 để đổi qua món khác')
    assert 'bằng hoặc cao hơn' in r2['reply']
    assert 'đổi sang món nào' in r2['reply']

    # Turn 3: Option modification
    r3 = runtime.turn('tôi muốn đá riêng ấy bạn')
    assert 'xác nhận sửa đơn' in r3['reply'].lower() or 'xem trước' in r3['reply'].lower()
    assert 'Đá riêng' in r3['reply']

