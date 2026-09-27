"""Regression/smoke turns against the real router, with external services stubbed."""
import uuid
from types import SimpleNamespace

import pytest
import requests

from src.agents import agent_service
from src.common import cart_manager
from src.function_calling.tools import cart_tools, voucher_tools

ADDRESS = '42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Thành phố Hồ Chí Minh'


@pytest.fixture
def flow(monkeypatch):
    session = 'checkout-smoke-' + uuid.uuid4().hex
    monkeypatch.setattr(cart_tools, 'sync_authoritative_cart', lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr('src.common.inventory_validation.validate_cart_at_branch', lambda *a, **k: {'unavailable': [], 'unverified': []})
    monkeypatch.setattr('src.function_calling.helpers._get_engine', lambda: object())
    monkeypatch.setattr(agent_service, 'groq_agent_chat', lambda **k: pytest.fail('Checkout must not use generic LLM fallback'))

    def quote(sid, voucher_code=None, include_delivery=False):
        cart = cart_manager.get_cart(sid)
        subtotal = cart['subtotal']
        discount = subtotal * .2 if voucher_code else 0
        fee = 15000 if include_delivery and cart_manager.get_checkout_prefs(sid).get('delivery_type') == 'GIAO_TAN_NOI' else 0
        return {'items': cart['items'], 'subtotal': subtotal, 'discount_amount': discount,
                'voucher_code': voucher_code, 'delivery_fee': fee, 'final_total': subtotal - discount + fee}

    monkeypatch.setattr(cart_tools, '_quote_authoritative_cart', quote)
    monkeypatch.setattr(voucher_tools, 'execute_get_applicable_vouchers', lambda sid: {'status': 'ok', 'vouchers': [{'ma_voucher': 'SAVE20', 'ten_voucher': 'Giảm 20%', 'so_tien_giam_du_kien': 62600}]})

    def apply(sid, code):
        q = quote(sid, code)
        cart_manager.set_checkout_context(sid, voucher_code=code, discount_amount=q['discount_amount'])
        return {'status': 'ok', 'voucher_code': code, 'message': f"Tạm tính: {q['subtotal']:.0f}đ\nVoucher {code}: -{q['discount_amount']:.0f}đ\nThành tiền hiện tại: {q['final_total']:.0f}đ"}

    monkeypatch.setattr(voucher_tools, 'execute_apply_voucher', apply)
    monkeypatch.setattr('src.function_calling.tools.user_tools.execute_get_user_profile', lambda sid: {'default_address': ADDRESS + ', Phường Tây Thạnh, Thành phố Hồ Chí Minh'})
    monkeypatch.setattr('src.function_calling.tools.branch_tools.execute_find_nearest_branch', lambda **k: {'status': 'ok' if cart_manager.get_checkout_prefs(session).get('delivery_type') == 'GIAO_TAN_NOI' else 'need_branch_selection', 'branches': [{'ma_chi_nhanh': 'CN_1', 'ten_chi_nhanh': 'Cửa hàng Một', 'dia_chi': 'Địa chỉ cửa hàng', 'khoang_cach_km': 1, 'availability_status': 'available'}]})

    def branch(sid, branch_id, branch_name, **k):
        cart_manager.set_branch(sid, branch_id, branch_name)
        return {'status': 'ok', 'message': 'Đã chọn cửa hàng.'}
    monkeypatch.setattr('src.function_calling.tools.branch_tools.execute_set_session_branch', branch)
    return session


def turn(session, text):
    return agent_service.run_agent(session, text, history=[])


@pytest.mark.parametrize('text', ['không vậy oke rồi', 'thôi vậy được rồi', 'không thêm nữa', 'giỏ vậy được rồi'])
def test_finishing_cart_only_offers_vouchers(flow, text):
    cart_manager.add_item(flow, '1', 'Nước', 313000)
    result = turn(flow, text)
    prefs = cart_manager.get_checkout_prefs(flow)
    assert 'SAVE20' in result['reply']
    assert not prefs.get('checkout_requested')
    assert not prefs.get('delivery_type') and not prefs.get('payment_method')
    assert not result['checkout_payload']
    assert not any('Phí giao hàng' in result['reply'] for _ in [0])


@pytest.mark.parametrize('text', ['không dùng mã', 'bỏ qua voucher', 'không cần'])
def test_voucher_skip_finishes_cart_and_waits(flow, text):
    cart_manager.add_item(flow, '1', 'Nước', 313000)
    turn(flow, 'không vậy oke rồi')
    result = turn(flow, text)
    assert cart_manager.get_checkout_prefs(flow)['voucher_decided']
    assert 'Giỏ hàng của bạn đã hoàn tất' in result['reply']
    assert not cart_manager.get_checkout_prefs(flow).get('checkout_requested')
    assert not result['checkout_payload']


@pytest.mark.parametrize('mode,choice,expected', [('GIAO_TAN_NOI', 'giao tận nơi và COD', 265400), ('MANG_DI', 'lấy tại quán và COD', 250400), ('TAI_CHO', 'dùng tại chỗ và COD', 250400)])
def test_checkout_smoke_all_fulfillment_modes(flow, monkeypatch, mode, choice, expected):
    cart_manager.add_item(flow, '1', 'Nước', 200000, size='Vừa', toppings=['Hạt sen', 'Foam dừa'], luong_da='Ít đá', do_ngot='Ít ngọt')
    cart_manager.add_item(flow, '2', 'Bánh', 113000)
    turn(flow, 'không vậy oke rồi')
    voucher = turn(flow, 'áp cho tôi mã số 1')
    assert '250400' in voucher['reply'] and 'Phí giao hàng' not in voucher['reply']
    assert not cart_manager.get_checkout_prefs(flow).get('delivery_type')
    assert not cart_manager.get_checkout_prefs(flow).get('payment_method')
    start = turn(flow, 'tiếp tục đi')
    assert 'Hình thức nhận hàng' in start['reply'] and 'Phương thức thanh toán' in start['reply']
    location = turn(flow, choice)
    assert ADDRESS in location['reply']
    summary = turn(flow, 'ok địa chỉ đó đi')
    if mode != 'GIAO_TAN_NOI':
        assert not summary['checkout_payload']
        cart_manager.set_checkout_context(flow, branch_candidates=[{'branch_id': 'CN_1', 'branch_name': 'Cửa hàng Một', 'availability_status': 'available'}])
        summary = turn(flow, 'chọn chi nhánh số 1')
    assert summary['checkout_payload']['final_total'] == expected
    assert summary['checkout_payload']['delivery_fee'] == (15000 if mode == 'GIAO_TAN_NOI' else 0)
    assert summary['checkout_payload']['delivery_address'] == (ADDRESS if mode == 'GIAO_TAN_NOI' else None)
    assert summary['reply'].count('Phường Tây Thạnh') == (1 if mode == 'GIAO_TAN_NOI' else 0)
    assert ('Phí giao hàng' in summary['reply']) == (mode == 'GIAO_TAN_NOI')
    calls = []
    def finalize(**kwargs):
        calls.append(kwargs)
        cart_manager.clear_cart(flow, order_id='ORDER_1')
        return {'status': 'success', 'order_id': 'ORDER_1'}
    monkeypatch.setattr('src.common.checkout_service.finalize_checkout', finalize)
    confirmed = turn(flow, 'oke xác nhận')
    assert 'ORDER_1' in confirmed['reply'] and len(calls) == 1
    assert cart_tools.execute_confirm_checkout(flow, action_id=summary['checkout_payload']['action_id'])['status'] == 'already_processed'
    assert len(calls) == 1


@pytest.mark.parametrize('text', ['oke xác nhận', 'ok xác nhận', 'xác nhận', 'xác nhận chốt đơn', 'đồng ý', 'đồng ý chốt đơn', 'chốt đơn', 'đặt luôn'])
def test_confirmation_phrases(text):
    assert agent_service._is_plain_confirmation(text)


def test_one_explicit_choice_keeps_the_other_missing(flow):
    cart_manager.add_item(flow, '1', 'Nước', 313000)
    turn(flow, 'không thêm nữa')
    turn(flow, 'không cần')
    turn(flow, 'tiếp tục đi')
    result = turn(flow, 'COD')
    prefs = cart_manager.get_checkout_prefs(flow)
    assert prefs['payment_method'] == 'THANH_TOAN_KHI_NHAN_HANG'
    assert not prefs.get('delivery_type')
    assert 'Hình thức nhận hàng' in result['reply']
    assert 'địa chỉ' not in result['reply']


@pytest.mark.parametrize('valid', [True, False])
def test_changed_authoritative_cart_revalidates_selected_voucher(monkeypatch, valid):
    session = 'customer:conversation:changed'
    cart_manager.replace_items_from_order_cart(session, [{'id': 1, 'ma_san_pham': '1', 'ten_san_pham': 'Nước', 'so_luong': 2, 'gia_ban': 100000}], cart_id='user:customer', cart_version=1, user_id='customer')
    cart_manager.set_checkout_context(session, voucher_code='SAVE20', discount_amount=40000, voucher_decided=True)
    monkeypatch.setattr('src.function_calling.helpers._require_valid_session', lambda uid: 'customer')
    monkeypatch.setattr('src.function_calling.helpers._get_service_jwt', lambda uid: 'test-token')
    calls = []
    def request(method, path, token, **kwargs):
        calls.append((method, kwargs.get('json')))
        if method == 'GET':
            data = {'cart_id': 'user:customer', 'cart_version': 2, 'user_id': 'customer', 'items': [{'id': 1, 'ma_san_pham': '1', 'ten_san_pham': 'Nước', 'so_luong': 1, 'gia_ban': 100000}]}
        else:
            if not valid:
                response = requests.Response(); response.status_code = 400
                raise requests.HTTPError(response=response)
            data = {'voucher_code': 'SAVE20', 'discount_amount': 20000}
        return SimpleNamespace(raise_for_status=lambda: None, json=lambda: data)
    monkeypatch.setattr(cart_tools, '_order_service_request', request)
    cart_tools.sync_authoritative_cart(session)
    prefs = cart_manager.get_checkout_prefs(session)
    assert calls[-1] == ('POST', {'voucher_code': 'SAVE20'})
    assert prefs.get('discount_amount', 0) == (20000 if valid else 0)
    assert prefs.get('voucher_code') == ('SAVE20' if valid else None)
    if not valid: assert prefs['voucher_invalidated'] == 'SAVE20'


def test_timeout_retry_reuses_payload_even_after_server_cart_empty(monkeypatch):
    from src.common.checkout_service import finalize_checkout
    sid = 'customer:conversation:timeout'
    action = str(uuid.uuid4())
    cart_manager.add_item(sid, '1', 'Nước', 313000)
    cart_manager.set_branch(sid, 'CN_1', 'Cửa hàng Một')
    cart_manager.set_checkout_prefs(sid, 'THANH_TOAN_KHI_NHAN_HANG', 'GIAO_TAN_NOI', ADDRESS)
    cart_manager.set_checkout_context(sid, checkout_action_id=action, summary_amounts={'final_total': 328000})
    monkeypatch.setattr('src.common.checkout_service._require_valid_session', lambda uid: 'customer')
    monkeypatch.setattr('src.common.checkout_service._get_service_jwt', lambda uid: 'test-token')
    payloads = []
    receipt = {'so_tien': 328000, 'qr_img_url': 'https://payment.test/qr'}
    def post(*args, **kwargs):
        payloads.append(kwargs['json'])
        if len(payloads) == 1: raise requests.Timeout('response lost')
        return SimpleNamespace(status_code=200, json=lambda: {'already_processed': True, 'don_hang': {'ma_don_hang': 'ORDER_1', 'tong_tien': 328000}, 'payment_details': receipt})
    monkeypatch.setattr('src.common.checkout_service.requests.post', post)
    assert finalize_checkout(sid, 'THANH_TOAN_KHI_NHAN_HANG', 'GIAO_TAN_NOI', ADDRESS)['status'] == 'error'
    cart_manager.replace_items_from_order_cart(sid, [], cart_id='user:customer', cart_version=2, user_id='customer')
    monkeypatch.setattr(cart_tools, 'sync_authoritative_cart', lambda session: cart_manager.get_cart(session))
    result = cart_tools.execute_confirm_checkout(sid, action_id=action)
    assert result['status'] == 'already_processed'
    assert payloads[0] == payloads[1]
    assert payloads[1]['checkout_action_id'] == action
    replay = cart_tools.execute_confirm_checkout(sid, action_id=action)
    assert replay['total_price'] == 328000 and replay['payment_details'] == receipt
    assert len(payloads) == 2


def test_menu_two_products_options_then_cart_voucher_checkout_boundary(flow, monkeypatch):
    from src.function_calling.tools import product_tools
    monkeypatch.setattr(product_tools, 'execute_get_recommendations', lambda category, **k: {
        'status': 'ok', 'products': ([{'product_id': 'F1', 'product_name': 'Bánh Cà Phê', 'final_price': 113000}] if category == 'food' else [
            {'product_id': f'D{i}', 'product_name': f'Nước {i}', 'final_price': 200000} for i in range(1, 4)
        ]),
    })
    monkeypatch.setattr(product_tools, 'execute_get_product_options', lambda name: {
        'status': 'ok', 'product_name': name, 'options': ({'Kích thước': ['Vừa'], 'Topping': ['Hạt sen', 'Foam dừa'], 'Lượng đá': ['Ít đá', 'Bình thường'], 'Độ ngọt': ['Ít ngọt', 'Bình thường']} if name.startswith('Nước') else {}),
    })
    monkeypatch.setattr(product_tools, 'execute_check_price_and_stock', lambda product_name_query, **k: {
        'status': 'ok', 'products': [{'product_id': 'F1' if product_name_query.startswith('Bánh') else 'D3', 'product_name': product_name_query, 'final_price': 113000 if product_name_query.startswith('Bánh') else 200000}],
    })
    def add(**kwargs):
        kwargs.pop('operation_id', None)
        cart = cart_manager.add_item(**kwargs)
        return {'status': 'ok', 'cart': cart, 'unit_price': kwargs['unit_price']}
    monkeypatch.setattr(cart_tools, 'execute_add_to_cart', add)
    menu = turn(flow, 'tôi muốn mua nước và bánh')
    selected = agent_service.run_agent(flow, 'cho tôi bánh 1 và nước 3 đi', history=[{'role': 'assistant', 'content': menu['reply']}])
    pending = cart_manager.get_checkout_prefs(flow).get('pending_products')
    assert {item['product_name'] for item in pending} == {'Bánh Cà Phê', 'Nước 3'}
    assert 'Foam dừa' in selected['reply']
    assert not selected['checkout_payload']
    options = turn(flow, 'nước cho tôi topping hạt sen, foam dừa và ít đá, ít ngọt')
    assert not options['checkout_payload']
    cart = cart_manager.get_cart(flow)
    assert {item['product_name'] for item in cart['items']} == {'Bánh Cà Phê', 'Nước 3'}
    assert cart['subtotal'] == 313000
    drink = next(item for item in cart['items'] if item['product_name'] == 'Nước 3')
    assert drink['toppings'] == ['Hạt sen', 'Foam dừa']
    assert drink['luong_da'] == 'Ít đá' and drink['do_ngot'] == 'Ít ngọt'
    closed = turn(flow, 'không vậy oke rồi')
    assert 'SAVE20' in closed['reply']
    prefs = cart_manager.get_checkout_prefs(flow)
    assert not prefs.get('delivery_type') and not prefs.get('payment_method')
    voucher = turn(flow, 'áp cho tôi mã số 1')
    assert '250400' in voucher['reply'] and 'Phí giao hàng' not in voucher['reply']
    turn(flow, 'tiếp tục đi')
    turn(flow, 'giao tận nơi và COD')
    summary = turn(flow, 'ok địa chỉ đó đi')
    assert summary['checkout_payload']['final_total'] == 265400
    calls = []
    def finalize(**kwargs):
        calls.append(kwargs)
        result = {'status': 'success', 'order_id': 'ORDER_SMOKE', 'total_price': 265400}
        cart_manager.clear_cart(flow, order_id='ORDER_SMOKE', checkout_result=result)
        return result
    monkeypatch.setattr('src.common.checkout_service.finalize_checkout', finalize)
    assert 'ORDER_SMOKE' in turn(flow, 'oke xác nhận')['reply']
    replay = cart_tools.execute_confirm_checkout(flow, action_id=summary['checkout_payload']['action_id'])
    assert replay['status'] == 'already_processed' and replay['total_price'] == 265400
    assert len(calls) == 1


@pytest.mark.parametrize('t1', ['true', 'false'])
@pytest.mark.parametrize('text', ['oke xác nhận', 'ok xác nhận', 'xác nhận', 'xác nhận chốt đơn', 'đồng ý', 'đồng ý chốt đơn', 'chốt đơn', 'đặt luôn'])
def test_typed_confirmation_uses_pending_action(flow, monkeypatch, t1, text):
    monkeypatch.setenv('USE_T1_CONFIRM', t1)
    cart_manager.add_item(flow, '1', 'Nước', 313000)
    cart_manager.set_checkout_prefs(flow, 'VNPAY', 'MANG_DI')
    cart_manager.mark_checkout_summary(flow)
    calls = []
    monkeypatch.setattr(cart_tools, 'execute_confirm_checkout', lambda sid: calls.append(sid) or {'status': 'success', 'order_id': 'ORDER_1'})
    result = turn(flow, text)
    assert result['gate'] == 'confirm_checkout' and calls == [flow]


def test_checkout_receipt_honors_zero_server_total(monkeypatch):
    from src.common.checkout_service import finalize_checkout
    sid = 'customer:conversation:zero'
    cart_manager.add_item(sid, '1', 'Nước', 313000)
    cart_manager.set_branch(sid, 'CN_1', 'Cửa hàng Một')
    cart_manager.set_checkout_context(sid, checkout_action_id=str(uuid.uuid4()))
    monkeypatch.setattr('src.common.checkout_service._require_valid_session', lambda uid: 'customer')
    monkeypatch.setattr('src.common.checkout_service._get_service_jwt', lambda uid: 'test-token')
    monkeypatch.setattr('src.common.checkout_service.requests.post', lambda *a, **k: SimpleNamespace(status_code=200, json=lambda: {'don_hang': {'ma_don_hang': 'ORDER_ZERO', 'tong_tien': 0}}))
    result = finalize_checkout(sid, 'THANH_TOAN_KHI_NHAN_HANG', 'MANG_DI')
    assert result['status'] == 'success' and result['total_price'] == 0


@pytest.mark.parametrize('mode,expected', [('GIAO_TAN_NOI', 328000), ('MANG_DI', 313000), ('TAI_CHO', 313000)])
def test_summary_quotes_explicit_tool_arguments(flow, mode, expected):
    cart_manager.add_item(flow, '1', 'Nước', 313000)
    cart_manager.set_branch(flow, 'CN_1', 'Cửa hàng Một')
    cart_manager.set_checkout_context(flow, voucher_decided=True)
    result = cart_tools.execute_request_checkout(flow, 'VNPAY', mode, ADDRESS)
    assert result['status'] == 'require_confirmation'
    assert result['order_summary']['final_total'] == expected
