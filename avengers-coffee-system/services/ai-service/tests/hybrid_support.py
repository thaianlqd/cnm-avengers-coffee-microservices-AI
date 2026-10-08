"""Offline Hybrid fixtures. Every transport is scripted; no live keys/network."""
from copy import deepcopy
import json
import socket
import pytest
from test_llm_tool_orchestrator import runtime
from src.agents.agent_memory import ConversationMemory, empty_memory
from src.common import cart_manager
from src.function_calling.tools import TOOL_EXECUTORS, cart_tools, voucher_tools


def command(intent, **args):
    return {'intent': intent, 'args': args}


def envelope(*commands, kind='commands', message=None):
    return {'kind': kind, 'commands': list(commands), 'message': message}


def send(rt, *commands, text='Scripted customer meaning', **kwargs):
    rt.provider.steps = [{'content': json.dumps(envelope(*commands), ensure_ascii=False)}]
    return rt.turn(text, **kwargs)


def visible(rt, **domains):
    memory = ConversationMemory(rt.redis).load(rt.sid)
    memory['visible_snapshots'].update(deepcopy(domains))
    ConversationMemory(rt.redis).save(rt.sid, memory)


@pytest.fixture
def hybrid(runtime, monkeypatch):
    monkeypatch.setenv('AI_AGENT_ARCHITECTURE', 'hybrid')
    monkeypatch.setattr(socket.socket, 'connect', lambda *a, **k: pytest.fail('Live network forbidden'))
    monkeypatch.setattr(socket, 'create_connection', lambda *a, **k: pytest.fail('Live network forbidden'))
    monkeypatch.setitem(TOOL_EXECUTORS, 'get_user_profile', lambda a, s: {'status': 'ok', 'address_items': []})
    from src.agents.checkout_choices import PAYMENT_OPTIONS, PAYMENT_LABELS
    monkeypatch.setattr(cart_tools, 'get_wallet_payment_options', lambda s, amount=None: {
        'payment_options': [{'code': code, 'label': label, 'enabled': True} for code, label in zip(PAYMENT_OPTIONS, PAYMENT_LABELS)]})
    monkeypatch.setattr(cart_tools, 'validate_wallet_selection', lambda s: None)
    vouchers = [{'ma_voucher': 'SMALL', 'ten_voucher': 'Ưu đãi nhỏ', 'so_tien_giam_du_kien': 1000},
                {'ma_voucher': 'BEST', 'ten_voucher': 'Ưu đãi lớn', 'so_tien_giam_du_kien': 9000}]
    def listed(s):
        return {'status': 'ok', 'vouchers': deepcopy(vouchers)}
    monkeypatch.setattr(voucher_tools, 'execute_get_applicable_vouchers', listed)
    monkeypatch.setitem(TOOL_EXECUTORS, 'get_applicable_vouchers', lambda a, s: listed(s))
    def apply(s, code):
        runtime.writes.append(('voucher', code))
        cart_manager.set_checkout_context(s, voucher_code=code, voucher_decided=True,
            voucher_revalidation_required=None,
            discount_amount=next(v['so_tien_giam_du_kien'] for v in vouchers if v['ma_voucher'] == code))
        return {'status': 'ok', 'voucher_code': code}
    monkeypatch.setattr(voucher_tools, 'execute_apply_voucher', apply)
    def remove(s):
        runtime.writes.append(('remove_voucher',))
        cart_manager.set_checkout_context(s, voucher_code=None, voucher_decided=False)
        return {'status': 'ok'}
    monkeypatch.setattr(voucher_tools, 'execute_remove_voucher', remove)
    runtime.vouchers = vouchers
    return runtime


def no_cart(rt):
    cart_manager.replace_items_from_order_cart(rt.sid, [])


def pending(rt):
    return cart_manager.get_checkout_prefs(rt.sid).get('pending_products') or []
