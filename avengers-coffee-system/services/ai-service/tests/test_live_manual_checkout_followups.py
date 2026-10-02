"""LAN 18: canonical pending owners survive natural checkout continuations."""
from copy import deepcopy
import json
import logging
from uuid import uuid4

import pytest

from src.agents import agent_service, order_flow_graph as graph
from src.common import cart_manager
from src.function_calling.tools import branch_tools, cart_tools, voucher_tools
from test_canonical_conversation_references import catalog

REAL_AGENT = agent_service._run_agent_impl


@pytest.fixture
def flow(catalog, monkeypatch):
    sid = 'lan18-' + uuid4().hex
    cart_manager.replace_items_from_order_cart(sid, [
        dict(id=901, ma_san_pham='synthetic-alpha', ten_san_pham='Product Alpha',
             gia_ban=20000, so_luong=1, size='M'),
        dict(id=902, ma_san_pham='synthetic-beta', ten_san_pham='Product Beta',
             gia_ban=30000, so_luong=1, size='L', toppings=['Synthetic topping']),
    ])
    cart_manager.set_checkout_context(sid, flow_stage='CART_REVIEW')
    monkeypatch.setattr(cart_tools, 'is_authenticated_cart_session', lambda _: True)
    monkeypatch.setattr(cart_tools, 'sync_authoritative_cart',
                        lambda s: {**cart_manager.get_cart(s), 'authoritative': True})
    monkeypatch.setattr(cart_tools, 'execute_get_cart_quote',
                        lambda s: dict(status='ok', cart=cart_manager.get_cart(s), quote={}))
    monkeypatch.setattr(voucher_tools, 'execute_get_applicable_vouchers', lambda s: dict(
        status='ok', vouchers=[dict(ma_voucher='SYNTHETIC-A'), dict(ma_voucher='SYNTHETIC-B')]))
    writes = []
    def update(s, line, patch):
        writes.append((line, patch))
        items = deepcopy(cart_manager.get_cart(s)['items'])
        next(item for item in items if str(item['cart_item_id']) == str(line)).update(patch)
        cart_manager.replace_items_from_order_cart(s, items)
        return dict(status='ok')
    monkeypatch.setattr(cart_tools, 'execute_update_cart_item', update)
    monkeypatch.setattr(cart_tools, 'execute_add_to_cart', lambda *a, **k: pytest.fail('Unexpected add'))
    monkeypatch.setattr(cart_tools, 'execute_confirm_checkout', lambda *a, **k: pytest.fail('Auto confirm'))
    return sid, writes


@pytest.fixture
def branches(flow, monkeypatch):
    sid, writes = flow
    candidates = [dict(branch_id=f'synthetic-branch-{i}', branch_name=f'Synthetic branch {i}',
                       address=f'Synthetic address {i}', distance_km=i,
                       availability_status='unavailable' if i == 1 else 'available',
                       unavailable_products=['Product Beta'] if i == 1 else []) for i in range(1, 4)]
    cart_manager.set_checkout_context(sid, checkout_requested=True, delivery_type='MANG_DI',
        payment_method='THANH_TOAN_KHI_NHAN_HANG', location_address='Synthetic retained area',
        last_resolved_location={'value': 'Synthetic retained area'}, location_pending=True,
        address_change_requested=True, branch_candidates=candidates,
        voucher_code='SYNTHETIC-B', discount_amount=1000, voucher_decided=True)
    cart_manager.set_pending_action(sid, 'select_branch', {'count': 3})
    selected = []
    def select(s, branch_id, name, customer_selected=False):
        selected.append((branch_id, customer_selected))
        cart_manager.set_branch(s, branch_id, name)
        return dict(status='ok')
    monkeypatch.setattr(branch_tools, 'execute_set_session_branch', select)
    monkeypatch.setattr(branch_tools, 'execute_find_nearest_branch', lambda *a, **k: pytest.fail('Ordinal geocoded'))
    monkeypatch.setattr('utils.geo.geocode_address', lambda *a, **k: pytest.fail('Ordinal geocoded'))
    summaries = []
    def summary(s):
        summaries.append(s)
        cart_manager.set_pending_action(s, 'confirm_checkout', {})
        return dict(status='require_confirmation', message='Synthetic summary', order_summary={'synthetic': True})
    monkeypatch.setattr(cart_tools, 'execute_request_checkout', summary)
    return sid, candidates, selected, summaries


def understand(sid, message):
    return graph._understand(dict(session_id=sid, user_message=message, history=[],
                                  cart=cart_manager.get_cart(sid)))['intent']


@pytest.mark.parametrize('delivery', ['MANG_DI', 'TAI_CHO'])
@pytest.mark.parametrize('message', ['chi nhánh số 2 đi bạn', 'cửa hàng số 2', '2',
    'chọn cho tôi cửa hàng số 2 á', 'mình chọn chỗ số 2', 'lấy quán thứ hai'])
def test_branch_owner_precedes_stale_location_and_resumes_summary(branches, delivery, message):
    sid, candidates, selected, summaries = branches
    cart_manager.set_checkout_context(sid, delivery_type=delivery)
    before = deepcopy(cart_manager.get_cart(sid)['items'])
    result = graph.run_order_flow(sid, message, client_message_id='branch-choice')
    graph.run_order_flow(sid, message, client_message_id='branch-choice')
    assert selected == [(candidates[1]['branch_id'], True)]
    assert summaries == [sid] and result['checkout_payload']
    prefs = cart_manager.get_checkout_prefs(sid)
    assert not prefs.get('location_pending') and not prefs.get('address_change_requested')
    assert prefs['location_address'] == 'Synthetic retained area'
    assert prefs['last_resolved_location'] == {'value': 'Synthetic retained area'}
    assert prefs['voucher_code'] == 'SYNTHETIC-B' and prefs['discount_amount'] == 1000
    assert prefs['payment_method'] == 'THANH_TOAN_KHI_NHAN_HANG' and prefs['delivery_type'] == delivery
    assert cart_manager.get_cart(sid)['items'] == before
    assert cart_manager.get_pending_action(sid)['type'] == 'confirm_checkout'


@pytest.mark.parametrize('status,message', [('unavailable', 'chi nhánh số 1'),
    ('unknown', 'chi nhánh số 1'), ('unverified', 'chi nhánh số 1'),
    ('available', 'chi nhánh số 8')])
def test_branch_rejection_retains_owner_then_valid_choice(branches, status, message):
    sid, candidates, selected, summaries = branches
    candidates[0]['availability_status'] = status
    cart_manager.set_checkout_context(sid, branch_candidates=candidates)
    result = graph.run_order_flow(sid, message)
    assert not selected and not summaries and not result.get('checkout_payload')
    assert cart_manager.get_pending_action(sid)['type'] == 'select_branch'
    assert cart_manager.get_checkout_prefs(sid)['branch_candidates'] == candidates
    graph.run_order_flow(sid, 'cửa hàng số 2')
    assert selected == [(candidates[1]['branch_id'], True)]


@pytest.mark.parametrize('message,answer', [('chi nhánh số 2 cách bao xa?', '2 km'),
    ('cửa hàng số 2 ở đâu?', 'Synthetic address 2'),
    ('chi nhánh số 1 còn đủ món không?', 'Product Beta')])
def test_branch_info_is_snapshot_only(branches, message, answer):
    sid, candidates, selected, summaries = branches
    result = graph.run_order_flow(sid, message)
    assert answer in result['reply']
    assert not selected and not summaries and not result['tool_calls_log']
    assert cart_manager.get_pending_action(sid)['type'] == 'select_branch'
    assert cart_manager.get_checkout_prefs(sid)['branch_candidates'] == candidates


@pytest.mark.parametrize('message', ['món số 2', 'voucher số 2', 'thanh toán số 2'])
def test_other_namespace_cannot_select_branch(branches, message):
    sid, _, selected, summaries = branches
    graph.run_order_flow(sid, message)
    assert not selected and not summaries
    assert cart_manager.get_pending_action(sid)['type'] == 'select_branch'


@pytest.mark.parametrize('message', ['cho tôi 2 cái', '2 cái', 'cho tôi 2', 'số lượng 2',
                                   'để 2 phần', 'hai cái'])
def test_cart_target_short_quantity_sets_exact_line_once(flow, message):
    sid, writes = flow
    cart_manager.set_pending_action(sid, 'ask_more_items', {})
    before = deepcopy(cart_manager.get_cart(sid)['items'])
    first = graph.run_order_flow(sid, 'cho tôi Product Beta 2 cái')
    assert 'Product Beta' in first['reply'] and not writes
    owner = cart_manager.get_pending_action(sid)
    assert owner['type'] == 'cart_edit_clarification'
    assert owner['params']['cart_item_id'] == '902'
    graph.run_order_flow(sid, message, client_message_id='quantity-continuation')
    graph.run_order_flow(sid, message, client_message_id='quantity-continuation')
    assert writes == [('902', {'quantity': 2})]
    after = cart_manager.get_cart(sid)['items']
    assert after[0] == before[0] and after[1] == {**before[1], 'quantity': 2}
    assert cart_manager.get_pending_action(sid) is None


@pytest.mark.parametrize('message', ['0 cái', '-2 cái', '2 hay 3 cái'])
def test_cart_target_invalid_quantity_retains_owner(flow, message):
    sid, writes = flow
    graph.run_order_flow(sid, 'cho tôi Product Beta 2 cái')
    before = deepcopy(cart_manager.get_cart(sid)['items'])
    graph.run_order_flow(sid, message)
    assert not writes and cart_manager.get_cart(sid)['items'] == before
    assert cart_manager.get_pending_action(sid)['type'] == 'cart_edit_clarification'


@pytest.mark.parametrize('message', ['giữ nguyên', 'thôi'])
def test_cart_target_keep_or_cancel_is_read_only(flow, message):
    sid, writes = flow
    graph.run_order_flow(sid, 'cho tôi Product Beta 2 cái')
    graph.run_order_flow(sid, message)
    assert not writes and cart_manager.get_pending_action(sid) is None


@pytest.mark.parametrize('message', ['vậy được rồi', 'oke vậy đc rồi', 'thế là được rồi',
    'ổn rồi', 'không thêm nữa', 'không cần thêm gì nữa', 'vậy thôi', 'thế thôi', 'xong rồi'])
def test_natural_completion_opens_voucher_first(flow, message):
    sid, writes = flow
    assert understand(sid, message)['intent'] == 'FINISH_CART'
    result = graph.run_order_flow(sid, message)
    assert not writes and not result.get('checkout_payload')
    assert cart_manager.get_pending_action(sid)['type'] == 'select_voucher'


@pytest.mark.parametrize('owner,message', [('fill_options','ok'), ('select_voucher','ok'),
    ('select_branch','được'), ('cart_edit_clarification','vậy được rồi'),
    ('cart_edit_clarification','không thêm nữa'), ('cart_edit_clarification','ổn rồi'),
    ('cart_edit_clarification','oke vậy đc rồi')])
def test_completion_cannot_override_competing_owner(flow, owner, message):
    sid, _ = flow
    if owner == 'fill_options':
        cart_manager.set_pending_products(sid, [dict(product_id='synthetic-beta', product_name='Product Beta', quantity=1)])
    if owner == 'cart_edit_clarification':
        graph.run_order_flow(sid, 'cho tôi Product Beta 2 cái')
    else:
        cart_manager.set_pending_action(sid, owner, {})
    assert understand(sid, message)['intent'] != 'FINISH_CART'


@pytest.mark.parametrize('status', ['ok', 'error'])
def test_pending_voucher_trace_describes_authorized_apply_even_on_failure(flow, monkeypatch, caplog, status):
    sid, _ = flow
    cart_manager.set_checkout_context(sid, voucher_candidates=[{'ma_voucher':'SYNTHETIC-A'},
        {'ma_voucher':'SYNTHETIC-B'}], voucher_offer_pending=True)
    cart_manager.set_pending_action(sid, 'select_voucher', {})
    writes = []
    monkeypatch.setattr(voucher_tools, 'execute_apply_voucher',
        lambda s, code: writes.append(code) or dict(status=status))
    with caplog.at_level(logging.INFO):
        graph.run_order_flow(sid, '2')
    trace = json.loads(next(r.message.split('decision_provenance=', 1)[1]
        for r in reversed(caplog.records) if 'decision_provenance=' in r.message))
    assert writes == ['SYNTHETIC-B']
    assert trace['semantic_operation'] == 'APPLY_VOUCHER'
    assert trace['reference_namespace'] == 'VOUCHER' and trace['reference_source'] == 'voucher_candidates'
    assert trace['mutation_authorized_by_route']
    assert trace['mutation_evidence_present'] is (status == 'ok')


@pytest.mark.parametrize('message,operation', [('xóa nó', 'REMOVE'), ('đổi size lớn', 'EDIT_OPTIONS')])
def test_cart_target_reuses_exact_line_remove_and_option_pipeline(flow, message, operation):
    sid, _ = flow
    graph.run_order_flow(sid, 'cho tôi Product Beta 2 cái')
    resolved = understand(sid, message)['resolved_pending']
    assert str(resolved['row']['cart_item_id']) == '902' and resolved['operation'] == operation


@pytest.mark.parametrize('message,route', [('xem menu', 'BROWSING'), ('hoàn tất giỏ', 'FINISH_CART'),
    ('tiếp tục đi', 'START_CHECKOUT'), ('áp mã SYNTHETIC-A', 'APPLY_VOUCHER'),
    ('sửa số lượng Product Alpha thành 3', 'SET_QUANTITY'), ('đổi size dòng số 1 thành lớn', 'EDIT_OPTIONS')])
def test_cart_target_explicit_new_command_supersedes(flow, message, route):
    sid, writes = flow
    graph.run_order_flow(sid, 'cho tôi Product Beta 2 cái')
    assert understand(sid, message)['intent'] == route
    assert cart_manager.get_pending_action(sid) is None and not writes


@pytest.mark.parametrize('message', ['vậy được rồi', 'oke vậy đc rồi', 'thế là được rồi', 'vậy thôi'])
def test_completion_under_add_more_owner_still_finishes(flow, message):
    sid, _ = flow
    cart_manager.set_pending_action(sid, 'ask_more_items', {})
    assert understand(sid, message)['intent'] == 'FINISH_CART'
    graph.run_order_flow(sid, message)
    assert cart_manager.get_pending_action(sid)['type'] == 'select_voucher'


@pytest.mark.parametrize('message,operation', [('bỏ qua voucher', 'SKIP_VOUCHER'),
    ('voucher số 2 giảm bao nhiêu?', 'VOUCHER_INFO')])
def test_voucher_skip_and_info_are_not_apply(flow, caplog, message, operation):
    sid, _ = flow
    cart_manager.set_checkout_context(sid, voucher_candidates=[dict(ma_voucher='SYNTHETIC-A'),
        dict(ma_voucher='SYNTHETIC-B')], voucher_offer_pending=True)
    cart_manager.set_pending_action(sid, 'select_voucher', {})
    with caplog.at_level(logging.INFO):
        result = graph.run_order_flow(sid, message)
    trace = json.loads(next(r.message.split('decision_provenance=', 1)[1]
        for r in reversed(caplog.records) if 'decision_provenance=' in r.message))
    assert trace['semantic_operation'] == operation
    assert not trace['mutation_authorized_by_route'] and not trace['mutation_evidence_present']
    assert 'apply_voucher' not in [entry['tool'] for entry in result['tool_calls_log']]


def test_complete_checkout_tail_has_one_voucher_one_branch_no_auto_order(branches, monkeypatch):
    from src.function_calling.tools import user_tools
    sid, candidates, selected, summaries = branches
    before = deepcopy(cart_manager.get_cart(sid)['items'])
    cart_manager.clear_pending_action(sid)
    cart_manager.set_checkout_context(sid, checkout_requested=None, delivery_type=None, payment_method=None,
        location_address=None, last_resolved_location=None, branch_candidates=None, location_pending=None,
        address_change_requested=None, voucher_code=None, voucher_decided=None, flow_stage='CART_REVIEW')
    monkeypatch.setattr(agent_service, '_run_agent_impl', REAL_AGENT)
    monkeypatch.setattr(agent_service, 'groq_agent_chat', lambda **k: pytest.fail('Model must not own checkout tail'))
    monkeypatch.setattr(user_tools, 'execute_get_user_profile', lambda s: dict(status='ok', address_items=[]))
    monkeypatch.setattr(cart_tools, 'get_wallet_payment_options', lambda *a, **k: dict(payment_options=[{}]))
    applies, searches = [], []
    monkeypatch.setattr(voucher_tools, 'execute_apply_voucher',
                        lambda s, code: applies.append(code) or dict(status='ok'))
    def find(location, session_id):
        searches.append(location)
        cart_manager.set_checkout_context(session_id, branch_candidates=candidates)
        return dict(status='need_branch_selection', branches=[dict(
            ma_chi_nhanh=b['branch_id'], ten_chi_nhanh=b['branch_name'], dia_chi=b['address'],
            availability_status=b['availability_status'], unavailable_products=b['unavailable_products'])
            for b in candidates])
    monkeypatch.setattr(branch_tools, 'execute_find_nearest_branch', find)
    graph.run_order_flow(sid, 'oke vậy đc rồi')
    assert cart_manager.get_pending_action(sid)['type'] == 'select_voucher'
    graph.run_order_flow(sid, '2', client_message_id='voucher-once')
    graph.run_order_flow(sid, '2', client_message_id='voucher-once')
    graph.run_order_flow(sid, 'tiếp tục đi')
    assert cart_manager.get_pending_action(sid)['type'] == 'select_checkout_choices'
    graph.run_order_flow(sid, 'mang đi và COD')
    graph.run_order_flow(sid, 'tôi đang ở phường Vườn Mây, tỉnh Mây Xanh')
    assert cart_manager.get_pending_action(sid)['type'] == 'select_branch' and len(searches) == 1
    assert not cart_manager.get_checkout_prefs(sid).get('location_pending')
    graph.run_order_flow(sid, 'chi nhánh số 1')
    assert not selected and cart_manager.get_pending_action(sid)['type'] == 'select_branch'
    result = graph.run_order_flow(sid, 'chi nhánh số 2 đi bạn')
    assert selected == [(candidates[1]['branch_id'], True)] and summaries == [sid]
    assert len(searches) == 1 and applies == ['SYNTHETIC-B']
    assert result['checkout_payload'] and cart_manager.get_pending_action(sid)['type'] == 'confirm_checkout'
    assert cart_manager.get_cart(sid)['items'] == before
    prefs = cart_manager.get_checkout_prefs(sid)
    assert prefs['voucher_code'] == 'SYNTHETIC-B'
    assert prefs['delivery_type'] == 'MANG_DI' and prefs['payment_method'] == 'THANH_TOAN_KHI_NHAN_HANG'
