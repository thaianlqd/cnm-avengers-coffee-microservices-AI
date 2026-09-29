"""Regression/smoke turns against the real router, with external services stubbed."""
import uuid
from types import SimpleNamespace

import pytest
import requests

from src.agents import agent_service
from src.common import cart_manager
from src.function_calling.tools import cart_tools, voucher_tools

ADDRESS = '42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Quận Tân Phú, Thành phố Hồ Chí Minh'
CURRENT_ADDRESS = '42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Thành phố Hồ Chí Minh'


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
    monkeypatch.setattr('src.function_calling.tools.user_tools.execute_get_user_profile', lambda sid: {'default_address': ADDRESS})
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


def test_exact_cart_continue_to_qr_checkout_context(flow, monkeypatch):
    cart_manager.add_item(flow, '1', 'Matcha', 100000)
    cart_manager.set_pending_action(flow, 'ask_more_items', {})
    voucher = turn(flow, 'tiếp tục')
    assert 'SAVE20' in voucher['reply']
    assert cart_manager.get_pending_action(flow)['type'] == 'select_voucher'
    turn(flow, 'áp mã số 1')
    choices = turn(flow, 'tiếp tục')
    assert 'Hình thức nhận hàng' in choices['reply']
    assert cart_manager.get_pending_action(flow)['type'] == 'select_checkout_choices'
    location = turn(flow, 'cho tôi lấy tại quán và thanh toán qua mã QR nhé')
    prefs = cart_manager.get_checkout_prefs(flow)
    assert prefs['delivery_type'] == 'MANG_DI'
    assert prefs['payment_method'] == 'NGAN_HANG_QR'
    assert not prefs.get('pending_products')
    assert ADDRESS in location['reply']
    turn(flow, 'ok địa chỉ đó đi')
    cart_manager.set_checkout_context(flow, branch_candidates=[{
        'branch_id': 'CN_1', 'branch_name': 'Cửa hàng Một', 'availability_status': 'available'}])
    summary = turn(flow, 'cửa hàng 1 đi')
    assert summary['checkout_payload']['payment_method'] == 'NGAN_HANG_QR'
    assert 'SAVE20' in summary['reply']
    assert 'QR' in summary['reply']
    assert 'mã QR' in summary['reply']
    assert cart_manager.get_pending_action(flow)['type'] == 'confirm_checkout'
    continued = turn(flow, 'tiếp tục')
    assert continued['checkout_payload'], continued
    assert continued['checkout_payload']['action_id'] == summary['checkout_payload']['action_id']
    assert 'Tóm tắt đơn hàng' in continued['reply']
    calls = []
    def finalize(**kwargs):
        calls.append(kwargs)
        cart_manager.clear_cart(flow, order_id='ORDER_QR')
        return {'status': 'success', 'order_id': 'ORDER_QR', 'payment_details': {
            'ma_don_hang': 'ORDER_QR', 'so_tien': 80000, 'ma_tham_chieu': 'QR-ORDER_QR',
            'qr_img_url': 'https://example.test/qr.png', 'qr_fallback_url': 'https://example.test/qr-fallback'}}
    monkeypatch.setattr('src.common.checkout_service.finalize_checkout', finalize)
    assert len(calls) == 0
    confirmed = turn(flow, 'xác nhận')
    assert len(calls) == 1 and calls[0]['payment_method'] == 'NGAN_HANG_QR'
    assert confirmed['tool_calls_log'][0]['result']['payment_details']['ma_tham_chieu'] == 'QR-ORDER_QR'


def test_delivery_saved_address_without_district_reaches_summary(flow, monkeypatch):
    from src.function_calling.tools import user_tools
    monkeypatch.setattr(user_tools, 'execute_get_user_profile',
                        lambda _sid: {'default_address': CURRENT_ADDRESS})
    cart_manager.add_item(flow, '1', 'Nước', 194000)
    turn(flow, 'không thêm nữa')
    turn(flow, 'áp mã số 1')
    turn(flow, 'tiếp tục')
    prompt = turn(flow, 'giao tận nơi và COD cho tôi')
    assert CURRENT_ADDRESS in prompt['reply']
    summary = turn(flow, 'oke địa chỉ đấy luôn đi')
    prefs = cart_manager.get_checkout_prefs(flow)
    assert prefs['delivery_address'] == CURRENT_ADDRESS and prefs['address_confirmed'] is True
    assert cart_manager.get_branch(flow) == 'CN_1'
    assert summary['checkout_payload'] and summary['checkout_payload']['delivery_address'] == CURRENT_ADDRESS
    assert 'quận/huyện' not in summary['reply']


def test_reported_pickup_qr_choice_and_three_lost_response_retries(flow, monkeypatch):
    cart_manager.add_item(flow, '1', 'Nước', 194000)
    turn(flow, 'không thêm nữa')
    turn(flow, 'áp mã số 1')
    turn(flow, 'tiếp tục')
    assert cart_manager.get_pending_action(flow)['type'] == 'select_checkout_choices'

    profile_calls = []
    from src.function_calling.tools import user_tools
    original_profile = user_tools.execute_get_user_profile
    def profile(session):
        profile_calls.append(session)
        return original_profile(session)
    monkeypatch.setattr(user_tools, 'execute_get_user_profile', profile)

    message = 'cho tôi lấy tại quán và chuyển khoản qr nhé'
    first = agent_service.run_agent(flow, message, client_message_id='lost-turn')
    prefs = cart_manager.get_checkout_prefs(flow)
    assert (prefs['delivery_type'], prefs['payment_method']) == ('MANG_DI', 'NGAN_HANG_QR')
    assert ADDRESS in first['reply']
    assert 'Bạn cho mình biết lựa chọn' not in first['reply']
    assert cart_manager.get_pending_action(flow)['type'] == 'confirm_address'
    for _ in range(2):
        assert agent_service.run_agent(flow, message, client_message_id='lost-turn') == first
    assert len(profile_calls) == 1
    assert len(cart_manager.get_checkout_prefs(flow)['processed_order_turns']) == 1
    assert cart_manager.get_pending_action(flow)['type'] == 'confirm_address'

    # Identical text with a new ID is a new turn, never a text-based replay.
    agent_service.run_agent(flow, message, client_message_id='new-turn')
    assert 'new-turn' in cart_manager.get_checkout_prefs(flow)['processed_order_turns']
    branch_choice = turn(flow, 'ok địa chỉ đó đi')
    assert cart_manager.get_pending_action(flow)['type'] == 'select_branch'
    assert 'cửa hàng' in branch_choice['reply'].lower()


@pytest.mark.parametrize('choices', [
    ('cho tôi lấy tại quán', 'chuyển khoản qr nhé'),
    ('chuyển khoản qr nhé', 'cho tôi lấy tại quán'),
])
def test_checkout_choices_merge_across_turns(flow, choices):
    cart_manager.add_item(flow, '1', 'Nước', 194000)
    turn(flow, 'không thêm nữa')
    turn(flow, 'bỏ qua voucher')
    turn(flow, 'tiếp tục')
    first = turn(flow, choices[0])
    prefs = cart_manager.get_checkout_prefs(flow)
    assert bool(prefs.get('delivery_type')) != bool(prefs.get('payment_method'))
    assert 'Hình thức nhận hàng' in first['reply'] or 'Phương thức thanh toán' in first['reply']
    second = turn(flow, choices[1])
    prefs = cart_manager.get_checkout_prefs(flow)
    assert (prefs['delivery_type'], prefs['payment_method']) == ('MANG_DI', 'NGAN_HANG_QR')
    assert ADDRESS in second['reply']


def test_payment_prompt_ordinal_cannot_open_old_matcha_options(flow, monkeypatch):
    from src.function_calling.tools import product_tools
    cart_manager.add_item(flow, '1', 'Matcha', 100000)
    turn(flow, 'không thêm nữa')
    turn(flow, 'bỏ qua voucher')
    turn(flow, 'tiếp tục')
    payment_prompt = turn(flow, 'lấy tại quán')
    assert 'Phương thức thanh toán' in payment_prompt['reply']
    assert cart_manager.get_pending_action(flow)['type'] == 'select_payment'
    cart_manager.set_checkout_context(flow, last_product_suggestions=[
        {'product_id': 'P1', 'product_name': 'Americano', 'category': 'drink'},
        {'product_id': 'P2', 'product_name': 'Bánh Trung Thu Matcha', 'category': 'food'}])
    monkeypatch.setattr(product_tools, 'execute_get_product_options',
                        lambda *_: pytest.fail('checkout ordinal requested product options'))
    chosen = turn(flow, 'số 2 ấy bạn ơi')
    prefs = cart_manager.get_checkout_prefs(flow)
    assert prefs['payment_method'] == 'NGAN_HANG_QR'
    assert not prefs.get('pending_products')
    assert ADDRESS in chosen['reply']


def test_summary_client_message_replay_metadata_does_not_stale_confirm(flow, monkeypatch):
    cart_manager.add_item(flow, '1', 'Nước', 313000)
    turn(flow, 'không vậy oke rồi')
    turn(flow, 'bỏ qua voucher')
    turn(flow, 'tiếp tục đi')
    turn(flow, 'lấy tại quán và COD')
    turn(flow, 'ok địa chỉ đó đi')
    cart_manager.set_checkout_context(flow, branch_candidates=[{
        'branch_id': 'CN_1', 'branch_name': 'Cửa hàng Một', 'availability_status': 'available'}])
    summary = agent_service.run_agent(flow, 'chọn chi nhánh số 1', client_message_id='summary-turn')
    assert summary['checkout_payload']['final_total'] == 313000
    prefs = cart_manager.get_checkout_prefs(flow)
    assert prefs['processed_order_turns']['summary-turn']['message'] == 'chọn chi nhánh số 1'
    assert prefs['summary_fingerprint'] == cart_manager.cart_fingerprint(flow)
    monkeypatch.setattr('src.common.checkout_service.finalize_checkout', lambda **kwargs: {
        'status': 'success', 'order_id': 'ORDER_REPLAY'})
    confirmed = turn(flow, 'oke xác nhận')
    assert 'ORDER_REPLAY' in confirmed['reply']


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


@pytest.mark.parametrize('option_message,expected_toppings,expected_sweetness', [
    ('nước cho tôi topping hạt sen, foam dừa và ít đá, ít ngọt', ['Hạt sen', 'Foam dừa'], 'Ít ngọt'),
    ('thêm topping hạt sen, foam dừa và ít đá, ít ngọt cho nước nhé', ['Hạt sen', 'Foam dừa'], 'Ít ngọt'),
    ('lấy size vừa, topping hạt sen, foam dừa, ít đá, ít ngọt', ['Hạt sen', 'Foam dừa'], 'Ít ngọt'),
    ('cho tôi topping hạt sen và sữa yến mạch, ít đá và thêm ngọt cho tôi nhé', ['Hạt sen', 'Sữa yến mạch'], 'Thêm ngọt'),
])
def test_menu_two_products_options_then_cart_voucher_checkout_boundary(flow, monkeypatch, option_message, expected_toppings, expected_sweetness):
    from src.function_calling.tools import product_tools
    monkeypatch.setattr(product_tools, 'execute_get_recommendations', lambda category, **k: {
        'status': 'ok', 'products': ([{'product_id': 'F1', 'product_name': 'Bánh Cà Phê', 'final_price': 113000}] if category == 'food' else [
            {'product_id': f'D{i}', 'product_name': f'Nước {i}', 'final_price': 200000} for i in range(1, 4)
        ]),
    })
    monkeypatch.setattr(product_tools, 'execute_get_product_options', lambda name: {
        'status': 'ok', 'product_name': name, 'options': ({'Kích thước': ['Vừa'], 'Topping': ['Hạt sen', 'Foam dừa', 'Sữa yến mạch'], 'Lượng đá': ['Ít đá', 'Bình thường'], 'Độ ngọt': ['Ít ngọt', 'Thêm ngọt', 'Bình thường']} if name.startswith('Nước') else {}),
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
    selected = agent_service.run_agent(flow, 'cho tôi bánh 1 và nước 4 đi', history=[{'role': 'assistant', 'content': menu['reply']}])
    pending = cart_manager.get_checkout_prefs(flow).get('pending_products')
    assert {item['product_name'] for item in pending} == {'Bánh Cà Phê', 'Nước 3'}
    assert 'Foam dừa' in selected['reply']
    assert not selected['checkout_payload']
    options = turn(flow, option_message)
    assert not options['checkout_payload']
    cart = cart_manager.get_cart(flow)
    assert {item['product_name'] for item in cart['items']} == {'Bánh Cà Phê', 'Nước 3'}
    assert cart['subtotal'] == 313000
    drink = next(item for item in cart['items'] if item['product_name'] == 'Nước 3')
    assert drink['toppings'] == expected_toppings
    assert drink['luong_da'] == 'Ít đá' and drink['do_ngot'] == expected_sweetness
    assert not cart_manager.get_checkout_prefs(flow).get('pending_products')
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


def test_owned_conversation_runs_recommendation_quantity_edit_and_pickup_to_summary(flow, monkeypatch):
    """One controlled transcript proves state ownership across the whole BPM."""
    from src.function_calling.tools import branch_tools, product_tools

    original_read_path = agent_service._run_agent_impl
    def controlled_read_path(session_id, message, *args, **kwargs):
        if 'trời nóng' in message:
            return {'reply': 'Trời nóng thật.', 'checkout_payload': None,
                    'tool_calls_log': [], 'error': None}
        return original_read_path(session_id, message, *args, **kwargs)
    monkeypatch.setattr(agent_service, '_run_agent_impl', controlled_read_path)

    drinks = [
        {'product_id': f'D{i}', 'product_name': f'Nước {i}', 'final_price': 40000 + i * 1000,
         'category': 'Americano'} for i in range(1, 4)
    ] + [{'product_id': 'D4', 'product_name': 'Americano Chanh Leo', 'final_price': 49000,
          'category': 'Americano'}]
    cake = {'product_id': 'F1', 'product_name': 'Bánh Cà Phê', 'final_price': 39000,
            'category': 'Bánh Mặn'}
    monkeypatch.setattr(product_tools, 'execute_get_recommendations', lambda category, **_k: {
        'status': 'ok', 'products': [cake] if category == 'food' else drinks})

    def options(name):
        return ({'status': 'ok', 'product_id': 'D4', 'product_name': name, 'options': {
            'Kích thước': ['Vừa', 'Lớn'], 'Topping': ['Hạt Sen', 'Trái Vải'],
            'Lượng đá': ['Ít đá', 'Bình thường'], 'Độ ngọt': ['Ít ngọt', 'Thêm ngọt'],
        }} if name == 'Americano Chanh Leo' else
                {'status': 'ok', 'product_id': 'F1', 'product_name': name, 'options': {}})
    monkeypatch.setattr(product_tools, 'execute_get_product_options', options)
    monkeypatch.setattr(product_tools, 'execute_check_price_and_stock', lambda product_name_query, **_k: {
        'status': 'ok', 'products': [cake if product_name_query == 'Bánh Cà Phê' else drinks[-1]]})

    adds = []
    def add(**kwargs):
        kwargs.pop('operation_id', None)
        adds.append(dict(kwargs))
        cart = cart_manager.add_item(**kwargs)
        persisted = next(item for item in cart['items'] if item['product_id'] == kwargs['product_id'])
        return {'status': 'ok', 'cart': cart, 'persisted_line': persisted,
                'unit_price': kwargs['unit_price']}
    monkeypatch.setattr(cart_tools, 'execute_add_to_cart', add)

    edits = []
    monkeypatch.setattr(cart_tools, 'execute_update_cart_item',
                        lambda sid, line, desired, **_k: edits.append((line, desired)) or {
                            'status': 'ok', 'cart': cart_manager.get_cart(sid),
                            'quote': {'subtotal': cart_manager.get_cart(sid)['subtotal'],
                                      'discount_amount': 0,
                                      'final_total': cart_manager.get_cart(sid)['subtotal']}})

    offered = turn(flow, 'hôm nay trời nóng quá')
    assert 'gợi ý' in offered['reply'].lower()
    assert cart_manager.get_pending_action(flow)['type'] == 'offer_recommendation'
    recommended = turn(flow, 'oke')
    assert '4. Americano Chanh Leo' in recommended['reply']
    selected = turn(flow, 'món số 4 đi bạn')
    pending_selection = cart_manager.get_pending_action(flow)
    assert pending_selection and pending_selection['type'] == 'fill_options', selected
    completed = turn(flow, 'theo mặc định, cho tôi 2 ly nhé')
    assert len(adds) == 1 and adds[0]['product_id'] == 'D4' and adds[0]['quantity'] == 2

    turn(flow, 'đổi topping thành Hạt Sen và Trái Vải, thêm ngọt')
    assert edits and edits[-1][1]['quantity'] == 2
    assert edits[-1][1]['toppings'] == ['Hạt Sen', 'Trái Vải']
    assert edits[-1][1]['do_ngot'] == 'Thêm ngọt'

    turn(flow, 'cho xem bánh đi')
    turn(flow, 'món số 1')
    assert [call['product_id'] for call in adds] == ['D4', 'F1']

    finished = turn(flow, 'không thêm nữa')
    assert cart_manager.get_pending_action(flow)['type'] == 'select_voucher', finished
    voucher = turn(flow, 'áp mã số 1')
    continued = turn(flow, 'tiếp tục')
    checkout_pending = cart_manager.get_pending_action(flow)
    assert checkout_pending and checkout_pending['type'] == 'select_checkout_choices', (voucher, continued)

    branch_locations = []
    def find_branch(location, session_id):
        branch_locations.append(location)
        if 'Hồ Chí Minh' not in location:
            return {'status': 'need_city', 'normalized_location': location,
                    'message': 'Mình đã giữ Gò Vấp; bạn cho mình thêm tỉnh/thành phố nhé.'}
        candidates = [{'branch_id': 'GV1', 'branch_name': 'Cửa hàng Gò Vấp',
                       'ma_chi_nhanh': 'GV1', 'ten_chi_nhanh': 'Cửa hàng Gò Vấp',
                       'dia_chi': 'Quang Trung, Quận Gò Vấp, Thành phố Hồ Chí Minh',
                       'availability_status': 'available'}]
        cart_manager.set_checkout_context(session_id, branch_candidates=candidates)
        return {'status': 'need_branch_selection', 'normalized_location': location,
                'location_basis': 'exact_locality', 'branches': candidates}
    monkeypatch.setattr(branch_tools, 'execute_find_nearest_branch', find_branch)

    partial = turn(flow, 'lấy tại quán và QR, tôi đang ở phường Gò Vấp')
    assert 'đã giữ Gò Vấp' in partial['reply']
    choices = cart_manager.get_checkout_prefs(flow)
    assert (choices['delivery_type'], choices['payment_method']) == ('MANG_DI', 'NGAN_HANG_QR')
    candidates = turn(flow, 'TP HCM ấy bạn ơi')
    assert 'Cửa hàng Gò Vấp' in candidates['reply']
    assert 'Gò Vấp' in branch_locations[-1] and 'Hồ Chí Minh' in branch_locations[-1]
    summary = turn(flow, 'cửa hàng số 1')
    assert summary['checkout_payload']
    assert summary['checkout_payload']['payment_method'] == 'NGAN_HANG_QR'
    assert cart_manager.get_pending_action(flow)['type'] == 'confirm_checkout'


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
    cart_manager.set_checkout_context(flow, voucher_decided=True, address_confirmed=True)
    result = cart_tools.execute_request_checkout(flow, 'VNPAY', mode, ADDRESS)
    assert result['status'] == 'require_confirmation'
    assert result['order_summary']['final_total'] == expected


@pytest.mark.parametrize('message', ['vậy oke rồi', 'thế được rồi', 'ừ thế nhé'])
def test_pending_done_persists_real_voucher_gate(flow, message):
    cart_manager.add_item(flow, '1', 'Nước', 308000)
    cart_manager.set_pending_action(flow, 'ask_more_items', {})
    result = turn(flow, message)
    prefs = cart_manager.get_checkout_prefs(flow)
    assert 'SAVE20' in result['reply']
    assert prefs['voucher_offer_pending']
    assert prefs['voucher_candidates'][0]['ma_voucher'] == 'SAVE20'
    assert cart_manager.get_pending_action(flow)['type'] == 'select_voucher'
    assert not prefs.get('checkout_requested')


@pytest.mark.parametrize('message', ['áp cho tôi mã số 1 đi', 'lấy mã đầu tiên', 'dùng voucher thứ nhất'])
def test_pending_voucher_applies_snapshot_first_try(flow, monkeypatch, message):
    cart_manager.add_item(flow, '1', 'Nước', 308000)
    cart_manager.set_checkout_context(flow, voucher_offer_pending=True, voucher_candidates=[
        {'ma_voucher': 'KS20_A', 'ten_voucher': 'Mã A'}, {'ma_voucher': 'KS20_B', 'ten_voucher': 'Mã B'},
    ])
    cart_manager.set_pending_action(flow, 'select_voucher', {'count': 2})
    monkeypatch.setattr(voucher_tools, 'execute_get_applicable_vouchers', lambda *a: pytest.fail('Must reuse the displayed snapshot'))
    result = turn(flow, message)
    prefs = cart_manager.get_checkout_prefs(flow)
    assert result['tool_calls_log'][0]['args']['voucher_code'] == 'KS20_A'
    assert prefs['voucher_code'] == 'KS20_A' and prefs['voucher_decided']
    assert not prefs.get('voucher_offer_pending')
    assert prefs['flow_stage'] == 'CART_READY'
    assert not cart_manager.get_pending_action(flow)
    assert '246400' in result['reply']


def test_changed_cart_revalidates_voucher_list(flow, monkeypatch):
    from src.agents.order_flow_graph import _offer_voucher_gate
    cart_manager.add_item(flow, '1', 'Nước', 308000)
    _offer_voucher_gate(flow)
    cart_manager.add_item(flow, '2', 'Bánh', 10000)
    listed = []
    monkeypatch.setattr(voucher_tools, 'execute_get_applicable_vouchers', lambda *a: listed.append(True) or {
        'status': 'ok', 'vouchers': [{'ma_voucher': 'NEW', 'ten_voucher': 'Mã mới'}],
    })
    result = turn(flow, 'áp mã số 1')
    assert listed == [True]
    assert 'NEW' in result['reply']
    assert not any(row['tool'] == 'apply_voucher' for row in result['tool_calls_log'])


def test_address_confirmation_builds_only_authoritative_final_summary(flow, monkeypatch):
    cart_manager.add_item(flow, '1', 'Nước', 308000)
    turn(flow, 'không thêm nữa')
    turn(flow, 'áp mã số 1')
    turn(flow, 'tiếp tục')
    turn(flow, 'giao tận nơi và COD')
    assert cart_manager.get_pending_action(flow)['type'] == 'confirm_address'
    quote = cart_tools._quote_authoritative_cart
    calls = []
    def tracked_quote(sid, code=None, **kwargs):
        calls.append((code, kwargs))
        return quote(sid, code, **kwargs)
    monkeypatch.setattr(cart_tools, '_quote_authoritative_cart', tracked_quote)
    result = turn(flow, 'oke giao đến địa chỉ đó cho tôi đi')
    prefs = cart_manager.get_checkout_prefs(flow)
    assert prefs['address_confirmed'] and prefs['delivery_address'] == ADDRESS
    assert calls == [('SAVE20', {'include_delivery': True})]
    assert result['checkout_payload']['final_total'] == 261400
    assert result['checkout_payload']['delivery_fee'] == 15000
    assert prefs['summary_fingerprint'] == cart_manager.cart_fingerprint(flow)
    assert cart_manager.get_pending_action(flow)['type'] == 'confirm_checkout'


def test_natural_confirmation_timeout_reuses_same_checkout_action(flow, monkeypatch):
    from src.common.checkout_service import finalize_checkout
    cart_manager.add_item(flow, '1', 'Nước', 308000)
    cart_manager.set_branch(flow, 'CN_1', 'Cửa hàng Một')
    cart_manager.set_checkout_prefs(flow, 'VNPAY', 'MANG_DI')
    cart_manager.set_checkout_context(flow, voucher_decided=True)
    summary = cart_tools.execute_request_checkout(flow)
    assert summary['status'] == 'require_confirmation'
    monkeypatch.setattr('src.common.checkout_service._require_valid_session', lambda uid: 'customer')
    monkeypatch.setattr('src.common.checkout_service._get_service_jwt', lambda uid: 'test-token')
    monkeypatch.setattr('src.function_calling.tools.user_tools.execute_get_user_profile', lambda *a: pytest.fail('No exploratory tools on confirm'))
    monkeypatch.setattr('src.function_calling.tools.branch_tools.execute_find_nearest_branch', lambda **k: pytest.fail('No exploratory tools on confirm'))
    payloads = []
    def post(*a, **k):
        payloads.append(k['json'])
        if len(payloads) == 1:
            raise requests.Timeout('response lost after server created order')
        return SimpleNamespace(status_code=200, json=lambda: {'already_processed': True,
            'don_hang': {'ma_don_hang': 'ORDER_RETRY', 'tong_tien': 308000}})
    monkeypatch.setattr('src.common.checkout_service.requests.post', post)
    first = turn(flow, 'oke ổn rồi đồng ý nhé')
    assert first['tool_calls_log'][0]['result']['status'] == 'error'
    assert cart_manager.get_checkout_prefs(flow)['checkout_submission']
    # Server cart is already emptied, but the persisted submission survives.
    cart_manager.replace_items_from_order_cart(flow, [], cart_id='user:customer', cart_version=2, user_id='customer')
    retry = turn(flow, 'đồng ý')
    assert 'ORDER_RETRY' in retry['reply']
    assert payloads[0] == payloads[1]
    assert payloads[0]['checkout_action_id'] == summary['order_summary']['action_id']
    assert 'ORDER_RETRY' in turn(flow, 'đồng ý')['reply']
    assert len(payloads) == 2


@pytest.mark.parametrize('pending', ['ask_more_items', 'select_voucher', 'confirm_address', 'select_branch', 'confirm_checkout', 'fill_options'])
def test_ambiguous_pending_context_never_enters_free_agent(flow, monkeypatch, pending):
    from src.common import groq_service
    monkeypatch.setattr(groq_service, 'groq_chat', lambda *a, **k: '{"intent":"AMBIGUOUS"}')
    cart_manager.add_item(flow, '1', 'Nước', 308000)
    cart_manager.set_pending_action(flow, pending, {})
    result = turn(flow, 'hmm...')
    assert result['reply'] and not result['checkout_payload']
    assert not result['tool_calls_log']


def test_quote_failure_cannot_create_checkout_summary(flow, monkeypatch):
    cart_manager.add_item(flow, '1', 'Nước', 308000)
    cart_manager.set_branch(flow, 'CN_1', 'Cửa hàng Một')
    cart_manager.set_checkout_prefs(flow, 'VNPAY', 'GIAO_TAN_NOI', ADDRESS)
    cart_manager.set_checkout_context(flow, address_confirmed=True, voucher_decided=True)
    monkeypatch.setattr(cart_tools, '_quote_authoritative_cart', lambda *a, **k: (_ for _ in ()).throw(requests.HTTPError('503')))
    result = cart_tools.execute_request_checkout(flow)
    assert result['status'] == 'quote_error'
    assert not cart_manager.get_checkout_prefs(flow).get('summary_fingerprint')
    assert (cart_manager.get_pending_action(flow) or {}).get('type') != 'confirm_checkout'


def test_free_agent_cannot_render_a_fake_checkout_summary(flow, monkeypatch):
    cart_manager.add_item(flow, '1', 'Nước', 308000)
    monkeypatch.setattr(agent_service, '_build_messages', lambda **k: [])
    def free_agent(**kwargs):
        assert all(schema['function']['name'] != 'get_applicable_vouchers' for schema in kwargs['tools'])
        return {'reply': 'Tóm tắt đơn hàng: Tổng thanh toán 1đ. Bạn có đồng ý với đơn hàng này không?',
                'tool_calls_log': [], 'checkout_payload': None, 'error': None}
    monkeypatch.setattr(agent_service, 'groq_agent_chat', free_agent)
    result = agent_service._run_agent_impl(flow, 'cho tôi lời khuyên', history=[], allow_model_mutations=False)
    assert 'Tổng thanh toán 1đ' not in result['reply']
    assert 'SAVE20' in result['reply']
    assert cart_manager.get_pending_action(flow)['type'] == 'select_voucher'
    assert not cart_manager.get_checkout_prefs(flow).get('summary_fingerprint')


def test_voucher_pending_state_survives_session_reload(flow):
    cart_manager.add_item(flow, '1', 'Nước', 308000)
    cart_manager.set_pending_action(flow, 'ask_more_items', {})
    turn(flow, 'vậy oke rồi')
    cart_manager._SESSION_CARTS.pop(flow)
    assert cart_manager.get_pending_action(flow)['type'] == 'select_voucher'
    assert cart_manager.get_checkout_prefs(flow)['voucher_candidates'][0]['ma_voucher'] == 'SAVE20'
    cart_manager.clear_pending_action(flow)
    cart_manager._SESSION_CARTS.pop(flow)
    assert not cart_manager.get_pending_action(flow)
