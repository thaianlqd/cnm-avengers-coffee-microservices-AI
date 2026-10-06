"""Test literal branch selection and delivery type detection when branches are visible."""
import pytest
from src.agents.shopping_turn_control import resolve_branch_choice, customer_shopping_control
from src.agents.customer_flow_presentation import customer_flow_reply
from src.common import cart_manager
from src.agents.agent_memory import ConversationMemory
from test_checkout_guarded_contract import gateway
from test_llm_tool_orchestrator import runtime

BRANCHES = [
    {
        'display_index': 1,
        'branch_id': 'CN01',
        'branch_name': 'Highlands Coffee D9 Tân Phú',
        'address': '71 Đường D9, Phường Tây Thạnh, Quận Tân Phú, TP.HCM'
    },
    {
        'display_index': 2,
        'branch_id': 'CN02',
        'branch_name': 'Highlands Coffee 425 Nguyen Oanh HCM',
        'address': '425 Nguyễn Oanh, Phường Gò Vấp, TP.HCM'
    },
    {
        'display_index': 3,
        'branch_id': 'CN03',
        'branch_name': 'Highlands Coffee 18E Phan Van Tri Go Vap',
        'address': '18E Phan Văn Trị, Phường Gò Vấp, TP. HCM'
    }
]


def test_resolve_branch_choice_phrases():
    b, inv = resolve_branch_choice('chi nhánh 1 đi bạn tôi muốn đặt trước', BRANCHES)
    assert b and b['branch_id'] == 'CN01' and not inv

    b, inv = resolve_branch_choice('à cho tôi chọn địa chỉ 1 đi tôi muốn tí lấy hàng tại quán á', BRANCHES)
    assert b and b['branch_id'] == 'CN01' and not inv

    b, inv = resolve_branch_choice('quán số 1 đi bạn ơi', BRANCHES)
    assert b and b['branch_id'] == 'CN01' and not inv

    b, inv = resolve_branch_choice('chi nhánh 2', BRANCHES)
    assert b and b['branch_id'] == 'CN02' and not inv

    # Info query - should NOT match
    b, inv = resolve_branch_choice('quán 1 có chỗ để xe không?', BRANCHES)
    assert b is None and not inv

    # Invalid ordinal
    b, inv = resolve_branch_choice('quán số 9', BRANCHES)
    assert b is None and inv is True


def test_customer_shopping_control_selects_branch_without_fulfillment(runtime, monkeypatch):
    """When customer chooses branch without specifying takeaway or dine-in, do not force delivery_type."""
    from src.function_calling.tools import branch_tools, cart_tools
    monkeypatch.setattr(cart_tools, 'is_authenticated_cart_session', lambda sid: True)
    monkeypatch.setattr(branch_tools, '_get_engine', lambda: None)
    monkeypatch.setattr(branch_tools, 'branch_identity_available', lambda engine, bid: True)
    monkeypatch.setattr(branch_tools, 'execute_set_session_branch', lambda sid, bid, bname, customer_selected=True: {
        'status': 'ok', 'branch_id': bid, 'branch_name': bname, 'message': 'ok'
    })

    cart_manager.replace_items_from_order_cart(runtime.sid, [])

    cm = ConversationMemory(runtime.redis)
    data = cm.load(runtime.sid)
    data['visible_snapshots']['branches'] = list(BRANCHES)
    cm.save(runtime.sid, data)

    gw = gateway(runtime, 'chi nhánh 1 đi bạn tôi muốn đặt trước')

    result = customer_shopping_control(gw)
    assert result == {'reply': None, 'error': None}

    # Verify delivery_type is NOT forced to MANG_DI
    prefs = cart_manager.get_checkout_prefs(runtime.sid)
    assert prefs.get('delivery_type') is None

    # Verify branch was set
    last_call = gw.artifacts.logs[-1]
    assert last_call['tool'] == 'set_session_branch'
    assert last_call['args']['branch_id'] == 'CN01'

    # Verify customer_flow_reply asks customer to choose takeaway or dine-in
    reply = customer_flow_reply(gw.artifacts.logs, gw.context['business'])
    assert 'Highlands Coffee D9 Tân Phú' in reply
    assert 'đến lấy tại quán (mang đi)' in reply
    assert 'dùng tại chỗ' in reply
    assert 'menu' in reply


def test_customer_shopping_control_selects_standalone_fulfillment(runtime, monkeypatch):
    """After selecting branch, customer can say 'lấy tại quán' or 'dùng tại chỗ'."""
    cart_manager.replace_items_from_order_cart(runtime.sid, [])
    cart_manager.set_branch(runtime.sid, 'CN01', 'Highlands Coffee D9 Tân Phú')

    gw1 = gateway(runtime, 'lấy tại quán đi bạn')
    res1 = customer_shopping_control(gw1)
    assert res1 and 'đến lấy tại quán (mang đi)' in res1['reply']
    prefs1 = cart_manager.get_checkout_prefs(runtime.sid)
    assert prefs1.get('delivery_type') == 'MANG_DI'

    gw2 = gateway(runtime, 'mình dùng tại chỗ nha')
    res2 = customer_shopping_control(gw2)
    assert res2 and 'dùng tại chỗ' in res2['reply']
    prefs2 = cart_manager.get_checkout_prefs(runtime.sid)
    assert prefs2.get('delivery_type') == 'TAI_CHO'


def test_customer_shopping_control_selects_branch_with_explicit_takeaway(runtime, monkeypatch):
    from src.function_calling.tools import branch_tools, cart_tools
    monkeypatch.setattr(cart_tools, 'is_authenticated_cart_session', lambda sid: True)
    monkeypatch.setattr(branch_tools, '_get_engine', lambda: None)
    monkeypatch.setattr(branch_tools, 'branch_identity_available', lambda engine, bid: True)
    monkeypatch.setattr(branch_tools, 'execute_set_session_branch', lambda sid, bid, bname, customer_selected=True: {
        'status': 'ok', 'branch_id': bid, 'branch_name': bname, 'message': 'ok'
    })

    cart_manager.replace_items_from_order_cart(runtime.sid, [])

    cm = ConversationMemory(runtime.redis)
    data = cm.load(runtime.sid)
    data['visible_snapshots']['branches'] = list(BRANCHES)
    cm.save(runtime.sid, data)

    gw = gateway(runtime, 'à cho tôi chọn địa chỉ 1 đi tôi muốn tí lấy hàng tại quán á')

    result = customer_shopping_control(gw)
    assert result == {'reply': None, 'error': None}

    prefs = cart_manager.get_checkout_prefs(runtime.sid)
    assert prefs.get('delivery_type') == 'MANG_DI'

    reply = customer_flow_reply(gw.artifacts.logs, gw.context['business'])
    assert 'Highlands Coffee D9 Tân Phú' in reply
    assert 'đến lấy tại quán' in reply
    assert 'menu' in reply


def test_customer_shopping_control_selects_branch_with_explicit_dine_in(runtime, monkeypatch):
    from src.function_calling.tools import branch_tools, cart_tools
    monkeypatch.setattr(cart_tools, 'is_authenticated_cart_session', lambda sid: True)
    monkeypatch.setattr(branch_tools, '_get_engine', lambda: None)
    monkeypatch.setattr(branch_tools, 'branch_identity_available', lambda engine, bid: True)
    monkeypatch.setattr(branch_tools, 'execute_set_session_branch', lambda sid, bid, bname, customer_selected=True: {
        'status': 'ok', 'branch_id': bid, 'branch_name': bname, 'message': 'ok'
    })

    cm = ConversationMemory(runtime.redis)
    data = cm.load(runtime.sid)
    data['visible_snapshots']['branches'] = list(BRANCHES)
    cm.save(runtime.sid, data)

    gw = gateway(runtime, 'tôi muốn ngồi lại uống tại quán ở chi nhánh 2')

    result = customer_shopping_control(gw)
    assert result == {'reply': None, 'error': None}

    prefs = cart_manager.get_checkout_prefs(runtime.sid)
    assert prefs.get('delivery_type') == 'TAI_CHO'

    reply = customer_flow_reply(gw.artifacts.logs, gw.context['business'])
    assert 'Highlands Coffee 425 Nguyen Oanh HCM' in reply
    assert 'dùng tại chỗ' in reply
