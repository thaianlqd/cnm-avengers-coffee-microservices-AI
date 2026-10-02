"""Reported branch conflict/timeout journey; no real model, HTTP or orders."""
from copy import deepcopy
import json
from types import SimpleNamespace

import pytest
from test_llm_tool_orchestrator import runtime
from test_checkout_guarded_contract import setup_checkout, calls, gateway, summary_fake
from test_final_focus_availability_contract import Engine
from src.agents.agent_memory import ConversationMemory, empty_memory
from src.agents.customer_flow_presentation import checkout_summary
from src.common import cart_manager, inventory_validation, db
from src.function_calling import helpers
from src.function_calling.tools import branch_tools, cart_tools


def branch_rows():
    return [dict(ma_chi_nhanh='D9', ten_chi_nhanh='D9 Tân Phú', availability_status='unavailable',
                 available_products=['Matcha'], unavailable_products=['Bánh Matcha'], unverified_products=[]),
            dict(ma_chi_nhanh='TC', ten_chi_nhanh='Trường Chinh', availability_status='available',
                 available_products=['Matcha', 'Bánh Matcha'], unavailable_products=[], unverified_products=[])]


def test_pickup_location_passes_real_cart_without_committing_address_and_stops_after_one_model_call(runtime, monkeypatch):
    setup_checkout(runtime, branch=False, summary=False, delivery='MANG_DI')
    before = deepcopy(cart_manager.get_cart(runtime.sid))
    seen = []
    def nearest(**kwargs):
        seen.append(kwargs)
        assert kwargs['session_id'] == ''
        assert kwargs['cart_items'] == before['items']
        return dict(status='ok', branches=branch_rows())
    monkeypatch.setattr(branch_tools, 'execute_find_nearest_branch', nearest)
    runtime.provider.steps = [calls(('resolve_location', dict(location='Phường Tây Thạnh', kind='area', for_checkout=False))),
                              RuntimeError('A second model request would fail')]
    result = runtime.turn('à nhầm tôi ở phường Tây Thạnh')
    assert len(runtime.provider.requests) == len(seen) == 1
    assert 'Tạm ngưng:** Bánh Matcha' in result['reply'] and 'Còn bán:** Matcha' in result['reply']
    assert [b['ma_chi_nhanh'] for b in result['ui_payload']['branches']] == ['D9', 'TC']
    assert result['ui_payload']['branches'][0]['availability_status'] == 'unavailable'
    assert not cart_manager.get_checkout_prefs(runtime.sid).get('delivery_address')
    assert not cart_manager.get_cart(runtime.sid).get('branch_id') and not runtime.writes


@pytest.mark.parametrize('unknown', [False, True])
def test_branch_rejection_is_stock_or_read_guidance_never_connection_error_and_keeps_ordinals(runtime, monkeypatch, unknown):
    setup_checkout(runtime, branch=False, summary=False)
    rows = branch_rows()
    # Previously green cards must be refreshed by the independent selection gate.
    rows[0]['availability_status'] = 'available'
    ConversationMemory(runtime.redis).save(runtime.sid, {**empty_memory(), 'visible_snapshots': {'branches': rows}})
    monkeypatch.setattr(helpers, '_get_engine', lambda: None)
    monkeypatch.setattr(inventory_validation, 'validate_cart_at_branch', lambda *a: dict(
        unavailable=[] if unknown else ['Bánh Matcha'], unverified=['Bánh Matcha'] if unknown else [],
        available=['Matcha'], product_statuses=[], is_fully_available=False))
    monkeypatch.setattr(branch_tools, 'execute_set_session_branch', lambda *a, **k: pytest.fail('Blocked branch committed'))
    runtime.provider.steps = [calls(('set_session_branch', {'branch_id': 'D9'})), RuntimeError('No final model call')]
    result = runtime.turn('chọn chi nhánh 1')
    assert len(runtime.provider.requests) == 1 and not runtime.writes
    assert 'kết nối' not in result['reply'].lower()
    assert ('Chưa đọc được tình trạng bán' if unknown else 'Tạm ngưng') in result['reply']
    assert '2. **Trường Chinh**' in result['reply']
    assert [b['display_index'] for b in result['ui_payload']['branches']] == [1, 2]
    assert result['ui_payload']['branches'][0]['availability_status'] == ('unknown' if unknown else 'unavailable')
    assert not cart_manager.get_cart(runtime.sid).get('branch_id')


def test_same_turn_discovery_cannot_auto_select_branch_or_loop(runtime, monkeypatch):
    setup_checkout(runtime, branch=False, summary=False)
    monkeypatch.setattr(branch_tools, 'execute_find_nearest_branch', lambda **kwargs: dict(status='ok', branches=branch_rows()))
    g = gateway(runtime, 'tìm quán gần phường Tây Thạnh', filtered=False)
    g.dispatch('find_nearest_branch', {'location': 'Phường Tây Thạnh'})
    denied = g.dispatch('set_session_branch', {'branch_id': 'TC'})
    assert denied['status'] == 'customer_branch_selection_required'
    rendered = json.loads(g.artifacts.completed_customer_step())
    assert '2. **Trường Chinh**' in rendered['reply'] and not cart_manager.get_cart(runtime.sid).get('branch_id')



def test_summary_and_real_success_status_render_without_extra_synthesis_or_duplicate_order(runtime, monkeypatch):
    setup_checkout(runtime, summary=False, delivery='MANG_DI')
    prepared = summary_fake(runtime, monkeypatch)
    original = cart_tools.execute_request_checkout
    def summary(sid, **kwargs):
        result = original(sid, **kwargs)
        result['order_summary'].update(branch_name='Chi nhánh A', delivery_type='MANG_DI',
            payment_method='THANH_TOAN_KHI_NHAN_HANG', total_price=70000, voucher_code=None)
        return result
    monkeypatch.setattr(cart_tools, 'execute_request_checkout', summary)
    runtime.provider.steps = [calls(('request_checkout', {})), RuntimeError('No extra model call')]
    offered = runtime.turn('cho tôi xem lại đơn')
    assert len(prepared) == len(runtime.provider.requests) == 1
    assert '- **Thanh toán:** Tiền mặt (COD)' in offered['reply']
    assert '- **Hình thức nhận:** Lấy tại quán' in offered['reply'] and offered['checkout_payload']['action_id']
    created = []
    def confirm(sid, *, action_id):
        created.append(action_id)
        result = dict(status='success', order_id='offline-receipt', payment_method='THANH_TOAN_KHI_NHAN_HANG',
                      total_price=70000, message='Dạ, đơn hàng đã được tạo ạ.')
        cart_manager.clear_cart(sid, order_id=result['order_id'], checkout_result=result)
        return result
    monkeypatch.setattr(cart_tools, 'execute_confirm_checkout', confirm)
    runtime.provider.requests.clear()
    runtime.provider.steps = [calls(('confirm_checkout', {})), RuntimeError('Final synthesis unavailable')]
    receipt = runtime.turn('xác nhận đặt đơn', client_message_id='one-order')
    assert len(created) == len(runtime.provider.requests) == 1
    assert 'offline-receipt' in receipt['reply'] and 'Thanh toán:** Tiền mặt (COD)' in receipt['reply']
    assert not receipt['checkout_payload'] and not receipt['ui_payload']['branches']
    assert runtime.turn('xác nhận đặt đơn', client_message_id='one-order') == receipt
    assert len(created) == len(runtime.provider.requests) == 1


def test_delivery_summary_renders_all_authoritative_amounts_and_options():
    summary = dict(branch_name='Quán A', delivery_type='GIAO_TAN_NOI', payment_method='NGAN_HANG_QR',
        delivery_address='42 Đường A', total_price=79000, discount_amount=7900, voucher_code='SAVE10',
        delivery_fee=15000, final_total=86100, items=[dict(product_name='Caramel', quantity=1,
            unit_price=79000, size='Lớn', luong_da='Ít đá', do_ngot='Ít ngọt', loai_sua='Sữa tươi', toppings=[])])
    reply = checkout_summary(summary)
    assert all(value in reply for value in ('**Caramel**', 'Sữa: Sữa tươi', '42 Đường A', 'Giao tận nơi',
        'Chuyển khoản QR', '**SAVE10**', '**79.000đ**', '**-7.900đ**', '**15.000đ**', '**Tổng thanh toán: 86.100đ**'))
    assert 'Phí giao hàng sẽ được kiểm tra' not in reply


def test_bulk_availability_uses_two_reads_for_twelve_branches_and_preserves_failure_semantics():
    engine = Engine({901: True, 902: False}, [])
    execute = engine.execute
    queries = []
    def read(statement, params):
        queries.append((str(statement), params))
        return execute(statement, params)
    engine.execute = read
    items = [dict(product_id='901', product_name='Alpha'), dict(product_id='902', product_name='Beta')]
    result = inventory_validation.availability_for_branches(engine, [f'B{i}' for i in range(12)], items)
    assert len(queries) == 2 and all(r['available'] == ['Alpha'] and r['unavailable'] == ['Beta'] for r in result.values())
    engine.inventory = None
    failed = inventory_validation.availability_for_branches(engine, ['B0'], items)['B0']
    assert failed['unavailable'] == ['Beta'] and failed['unverified'] == ['Alpha'] and not failed['available']
    missing = inventory_validation.availability_at_branch(engine, '', items)
    assert not missing['is_fully_available']


def test_sellability_change_between_selection_gate_and_branch_adapter_refreshes_cards(runtime, monkeypatch):
    setup_checkout(runtime, branch=False, summary=False)
    rows = branch_rows()
    rows[0]['availability_status'] = 'available'
    ConversationMemory(runtime.redis).save(runtime.sid, {**empty_memory(), 'visible_snapshots': {'branches': rows}})
    monkeypatch.setattr(helpers, '_get_engine', lambda: None)
    monkeypatch.setattr(inventory_validation, 'validate_cart_at_branch', lambda *a: dict(unavailable=[], unverified=[]))
    monkeypatch.setattr(branch_tools, 'execute_set_session_branch', lambda *a, **k: dict(status='stock_conflict',
        available_products=['Matcha'], unavailable_products=['Bánh Matcha'], unverified_products=[]))
    runtime.provider.steps = [calls(('set_session_branch', {'branch_id': 'D9'})), RuntimeError('No synthesis after stock denial')]
    result = runtime.turn('chọn chi nhánh 1')
    assert len(runtime.provider.requests) == 1
    assert 'Tạm ngưng:** Bánh Matcha' in result['reply']
    assert result['ui_payload']['branches'][0]['availability_status'] == 'unavailable'
    assert not cart_manager.get_cart(runtime.sid).get('branch_id')


def test_delivery_stock_conflict_retains_authoritative_branch_cards_without_claiming_summary():
    from src.agents.tool_artifacts import ToolArtifacts
    artifacts = ToolArtifacts(empty_memory())
    artifacts.collect('resolve_location', {}, dict(status='stock_conflict', branches=branch_rows()[:1],
        message='Dạ, chưa có quán gần địa chỉ này đủ các món trong giỏ.'))
    rendered = json.loads(artifacts.completed_customer_step())
    assert 'Tạm ngưng:** Bánh Matcha' in rendered['reply']
    assert artifacts.ui['branches'][0]['availability_status'] == 'unavailable' and not artifacts.checkout


def test_engine_pool_reused_without_caching_business_data(monkeypatch):
    created = []
    monkeypatch.setattr(db, 'create_engine', lambda *a, **kw: created.append(kw) or object())
    db._pooled_engine.cache_clear()
    try:
        first = db.get_db_engine()
        assert db.get_db_engine() is first and len(created) == 1
        monkeypatch.setenv('DB_HOST', 'another-offline-host')
        assert db.get_db_engine() is not first and len(created) == 2
        assert created[0]['pool_pre_ping'] is True
    finally:
        db._pooled_engine.cache_clear()

@pytest.mark.parametrize('phrase', ['xác nhận đặt đơn', 'oke xác nhận đặt đơn nhé bạn'])
def test_confirmation_words_in_summary_question_are_accepted(phrase):
    from src.agents.tier1 import classify_confirmation
    assert classify_confirmation(phrase, 'confirm_checkout') == 'YES'


@pytest.mark.parametrize('phrase', ['chưa xác nhận đặt đơn', 'không xác nhận đặt đơn', 'xác nhận đặt đơn nhưng đổi QR', 'đặt đơn thêm món'])
def test_confirmation_negatives_and_changes_remain_blocked(phrase):
    from src.agents.tier1 import classify_confirmation
    assert classify_confirmation(phrase, 'confirm_checkout') != 'YES'
