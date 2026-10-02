"""Replay the reported customer journey against guarded tools, without live services."""
from copy import deepcopy
import json

import pytest

from test_llm_tool_orchestrator import runtime
from test_checkout_guarded_contract import calls, content, gateway
from src.agents.agent_memory import ConversationMemory, empty_memory
from src.agents.agent_context import build_context, model_projection
from src.agents.tool_artifacts import model_tool_result, ToolArtifacts
from src.common import cart_manager
from src.function_calling.tools import cart_tools, product_tools, voucher_tools, knowledge_tools


@pytest.fixture
def shop(runtime, monkeypatch):
    cart_manager.replace_items_from_order_cart(runtime.sid, [])
    product = dict(product_id='101', product_name='Caramel Macchiato Đá', final_price=75000)
    groups = [
        dict(name='Kích thước', values=['Lớn', 'Nhỏ', 'Vừa'], required=True),
        dict(name='Lượng đá', values=['Ít đá', 'Đá riêng', 'Bình thường']),
        dict(name='Độ ngọt', values=['Ít ngọt', 'Thêm ngọt', 'Không ngọt', 'Bình thường']),
        dict(name='Loại sữa', values=['Sữa Tươi - CMD', 'Sữa Yến Mạch - CMD']),
        dict(name='Topping', values=['Foam Caramel', 'Hạt Sen'], multiple=True, required=False),
    ]
    monkeypatch.setattr(product_tools, 'execute_get_product_options', lambda **kw:
        dict(status='ok', **product, option_groups=deepcopy(groups)))
    monkeypatch.setattr(product_tools, 'execute_check_price_and_stock', lambda **kw:
        dict(status='ok', products=[dict(product, final_price=79000 + (10000 if kw.get('toppings') else 0))]))
    vouchers = [dict(ma_voucher=f'SAVE{i}', ten_voucher=f'Ưu đãi {i}', so_tien_giam_du_kien=8000-i*100)
                for i in range(1, 19)]
    monkeypatch.setattr(voucher_tools, 'execute_get_applicable_vouchers', lambda s:
        dict(status='ok', vouchers=deepcopy(vouchers)))
    def apply(sid, code):
        discount = next(row['so_tien_giam_du_kien'] for row in vouchers if row['ma_voucher'] == code)
        cart_manager.set_checkout_context(sid, voucher_code=code, discount_amount=discount,
            voucher_decided=True, voucher_revalidation_required=None)
        return dict(status='ok', voucher_code=code, so_tien_giam=discount)
    monkeypatch.setattr(voucher_tools, 'execute_apply_voucher', apply)
    def quote(sid):
        cart = cart_manager.get_cart(sid)
        prefs = cart_manager.get_checkout_prefs(sid)
        discount = prefs.get('discount_amount') or 0
        return dict(status='ok' if cart['items'] else 'empty_cart', cart=cart,
            quote=dict(items=cart['items'], subtotal=cart['total_price'],
                discount_amount=discount, voucher_code=prefs.get('voucher_code'),
                final_total=cart['total_price']-discount))
    monkeypatch.setattr(cart_tools, 'execute_get_cart_quote', quote)
    monkeypatch.setattr(cart_tools, 'get_wallet_payment_options', lambda *a:
        dict(payment_options=[dict(code='VNPAY', label='VNPAY', enabled=True),
            dict(code='NGAN_HANG_QR', label='Chuyển khoản QR', enabled=True),
            dict(code='THANH_TOAN_KHI_NHAN_HANG', label='Tiền mặt (COD)', enabled=True),
            dict(code='VI_DIEN_TU', label='Ví Avengers', enabled=True, balance=940000)]))
    ConversationMemory(runtime.redis).save(runtime.sid, {**empty_memory(),
        'visible_snapshots': {'products': [product]}, 'focus': {'product': product}})
    runtime.config = dict(product_id='101', size='Lớn', luong_da='Ít đá',
        do_ngot='Ít ngọt', loai_sua='Sữa Tươi - CMD')
    runtime.vouchers = vouchers
    return runtime


def send(shop, message, *operations, **kwargs):
    shop.provider.steps = [calls(*operations), content('Đã xong.', **kwargs)]
    return shop.turn(message)


def add_drink(shop):
    return send(shop, 'size lớn, ít đá, ít ngọt, sữa tươi, không topping',
        ('add_to_cart', {**shop.config, 'toppings': []}), mutation_claims=['add_to_cart'])


def test_reported_journey_options_cart_all_vouchers_best_code_and_checkout_choices(shop, monkeypatch):
    options = send(shop, 'cho tôi caramel đá đi', ('get_product_options', {'product_id': '101'}))
    assert '**Caramel Macchiato Đá**' in options['reply']
    assert 'Foam Caramel' in options['reply'] and 'Hạt Sen' in options['reply']
    added = send(shop, 'size lớn, ít đá, ít ngọt, sữa tươi nhé', ('add_to_cart', shop.config),
        mutation_claims=['add_to_cart'])
    assert added['tool_calls_log'][0]['result']['status'] == 'ok'
    assert shop.writes[0][1]['toppings'] == []
    assert len(shop.writes) == 1 and shop.writes[0][1]['size'] == 'Lớn'
    assert shop.writes[0][1]['loai_sua'] == 'Sữa Tươi - CMD'
    assert '79.000đ' in added['reply'] and 'sửa tùy chọn/số lượng' in added['reply']
    assert 'Phương thức thanh toán' not in added['reply']
    offered = send(shop, 'oke tiến hành thanh toán đi', ('finish_cart', {}), mutation_claims=['finish_cart'])
    assert len(offered['ui_payload']['vouchers']) == 18
    assert 'SAVE18' in offered['reply'] and '7.900đ' in offered['reply']
    assert not offered['ui_payload'].get('payment_options')
    memory = ConversationMemory(shop.redis).load(shop.sid)
    assert len(memory['visible_snapshots']['vouchers']) == 18
    context, _ = build_context(shop.sid, memory)
    assert len(model_projection(context)[0]['visible']['vouchers']) == 18
    monkeypatch.setattr(knowledge_tools, 'execute_search_knowledge_base', lambda **kw:
        dict(status='ok', results=[dict(id='policy', content='Khách chọn sản phẩm rồi chọn voucher.', domain='ordering_policy')]))
    # The accidental policy read in the user's log cannot erase a completed voucher step.
    shop.provider.steps = [calls(('apply_voucher', {'voucher_code': 'SAVE1'})),
        calls(('search_knowledge_base', {'query': 'quy trình đặt hàng', 'domain': 'ordering_policy'})),
        content('Theo tài liệu hiện có: Khách chọn sản phẩm rồi chọn voucher.', mutation_claims=['apply_voucher'])]
    applied = shop.turn('chọn mã tốt nhất đi bạn', client_message_id='apply-once')
    assert 'đã áp dụng mã **SAVE1**' in applied['reply']
    assert '71.100đ' in applied['reply'] and '7.900đ' in applied['reply']
    assert 'Caramel Macchiato Đá' in applied['reply'] and 'Size: Lớn' in applied['reply']
    assert all(label in applied['reply'] for label in ('Giao tận nơi', 'Lấy tại quán', 'Dùng tại chỗ', 'VNPAY', 'Chuyển khoản QR', 'Tiền mặt (COD)', 'Ví Avengers'))
    assert len(applied['ui_payload']['payment_options']) == 4
    assert len(applied['ui_payload']['fulfillment_options']) == 3
    assert not applied['checkout_payload'] and not applied['ui_payload']['vouchers']
    prefs = cart_manager.get_checkout_prefs(shop.sid)
    assert prefs['flow_stage'] == 'CART_READY' and not prefs.get('voucher_offer_pending')
    assert not cart_manager.get_pending_action(shop.sid)
    assert shop.turn('chọn mã tốt nhất đi bạn', client_message_id='apply-once') == applied


def test_partial_options_survive_three_turns_while_required_size_is_missing(shop):
    first = send(shop, 'ít đá nhé', ('add_to_cart', {'product_id': '101', 'luong_da': 'Ít đá'}))
    assert first['tool_calls_log'][0]['result']['missing'] == ['size']
    send(shop, 'ít ngọt và thêm foam caramel', ('add_to_cart', {'product_id': '101', 'do_ngot': 'Ít ngọt', 'toppings': ['Foam Caramel']}))
    third = send(shop, 'size lớn và sữa tươi nhé', ('add_to_cart', {'product_id': '101', 'size': 'Lớn', 'loai_sua': 'Sữa Tươi - CMD'}), mutation_claims=['add_to_cart'])
    assert third['tool_calls_log'][0]['result']['status'] == 'ok'
    assert len(shop.writes) == 1 and shop.writes[0][1]['unit_price'] == 89000
    assert shop.writes[0][1]['size'] == 'Lớn' and shop.writes[0][1]['luong_da'] == 'Ít đá'


def test_single_optional_topping_never_auto_selected(shop, monkeypatch):
    original = product_tools.execute_get_product_options
    def options(**kw):
        result = original(**kw)
        result['option_groups'][-1]['values'] = ['Foam Caramel']
        return result
    monkeypatch.setattr(product_tools, 'execute_get_product_options', options)
    result = send(shop, 'size lớn, ít đá, ít ngọt, sữa tươi', ('add_to_cart', shop.config))
    assert result['tool_calls_log'][0]['result']['status'] == 'ok'
    assert shop.writes[0][1]['toppings'] == [] and shop.writes[0][1]['unit_price'] == 79000


@pytest.mark.parametrize('skip', [False, True])
def test_skip_or_no_eligible_vouchers_opens_receiving_choices(shop, monkeypatch, skip):
    add_drink(shop)
    if not skip:
        monkeypatch.setattr(voucher_tools, 'execute_get_applicable_vouchers', lambda s:
            dict(status='no_applicable_voucher', vouchers=[]))
    result = send(shop, 'hoàn tất giỏ', ('finish_cart', {}), mutation_claims=['finish_cart'])
    if skip:
        result = send(shop, 'bỏ qua mã', ('skip_voucher', {}), mutation_claims=['skip_voucher'])
    assert 'Hình thức nhận hàng' in result['reply'] and 'Phương thức thanh toán' in result['reply']
    assert result['conversation_state'] == 'CART_READY'
    assert not result['checkout_payload']


def test_quote_failure_after_apply_preserves_write_without_claiming_verified_total(shop, monkeypatch):
    add_drink(shop)
    send(shop, 'hoàn tất giỏ', ('finish_cart', {}), mutation_claims=['finish_cart'])
    monkeypatch.setattr(cart_tools, 'execute_get_cart_quote', lambda s: dict(status='error', message='quote unavailable'))
    result = send(shop, 'chọn SAVE1', ('apply_voucher', {'voucher_code': 'SAVE1'}), mutation_claims=['apply_voucher'])
    assert result['tool_calls_log'][0]['result']['status'] == 'ok'
    assert 'chưa xác minh được tổng tiền' in result['reply']
    assert 'Tổng sau giảm giá' not in result['reply'] and '71.100đ' not in result['reply']
    assert not result['ui_payload'].get('payment_options') and not result['checkout_payload']


def test_all_vouchers_remain_visible_and_projected_and_later_offer_replaces_stale_codes(shop):
    artifacts = ToolArtifacts(empty_memory())
    artifacts.collect('get_applicable_vouchers', {}, dict(status='ok', vouchers=shop.vouchers))
    projection = model_tool_result('get_applicable_vouchers', dict(status='ok', vouchers=shop.vouchers), artifacts)
    assert len(projection['vouchers']) == 18
    assert projection['vouchers'][-1]['display_index'] == 18
    artifacts.collect('get_applicable_vouchers', {}, dict(status='ok', vouchers=shop.vouchers[-2:]))
    assert [row['ma_voucher'] for row in artifacts.ui['vouchers']] == ['SAVE17', 'SAVE18']


def test_unrequested_defaults_are_denied(shop):
    result = send(shop, 'size lớn nhé', ('add_to_cart', {'product_id': '101', 'size': 'Lớn', 'use_defaults': True}))
    assert result['tool_calls_log'][0]['result']['status'] == 'defaults_not_authorized'
    assert not shop.writes


def test_best_voucher_requires_largest_fresh_saving_and_repairs_wrong_proposal(shop):
    add_drink(shop)
    send(shop, 'hoàn tất giỏ', ('finish_cart', {}), mutation_claims=['finish_cart'])
    shop.provider.steps = [calls(('apply_voucher', {'voucher_code': 'SAVE18'})),
        calls(('apply_voucher', {'voucher_code': 'SAVE1'})),
        content('Đã áp mã.', mutation_claims=['apply_voucher'])]
    result = shop.turn('chọn mã tốt nhất đi bạn')
    assert result['tool_calls_log'][0]['result']['status'] == 'voucher_selection_conflict'
    assert result['tool_calls_log'][0]['result']['expected_voucher_code'] == 'SAVE1'
    assert result['tool_calls_log'][1]['result']['status'] == 'ok'
    assert cart_manager.get_checkout_prefs(shop.sid)['voucher_code'] == 'SAVE1'
    assert '71.100đ' in result['reply']


def test_voucher_message_cannot_auto_select_fulfillment_or_payment(shop):
    add_drink(shop)
    send(shop, 'hoàn tất giỏ', ('finish_cart', {}), mutation_claims=['finish_cart'])
    send(shop, 'chọn SAVE1', ('apply_voucher', {'voucher_code': 'SAVE1'}), mutation_claims=['apply_voucher'])
    g = gateway(shop, 'chọn mã tốt nhất đi bạn')
    result = g.dispatch('set_checkout_choices', {'delivery_type': 'GIAO_TAN_NOI', 'payment_method': 'VNPAY'})
    assert result['status'] == 'checkout_choice_not_selected'
    prefs = cart_manager.get_checkout_prefs(shop.sid)
    assert not prefs.get('delivery_type') and not prefs.get('payment_method')
