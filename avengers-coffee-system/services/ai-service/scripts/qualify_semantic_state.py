"""Sequential real-model qualification against isolated business/geo authorities.

Run only after offline gates, with --live. The transport counts ALL outbound
attempts across turns, repairs and routes. No real cart/order/geo writes occur.
"""
import argparse
from copy import deepcopy
import json
import logging
import os
from pathlib import Path
import sys
import time
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tests'))
import pytest
import requests
from sqlalchemy.engine import Engine
from scripts.qualification_transport import QualificationTransport
from src.common import cart_manager, groq_service
from src.agents.agent_memory import ConversationMemory
from src.agents.confirmed_destination import from_candidate
from src.function_calling import tools, helpers
from src.function_calling.tools import cart_tools, product_tools, branch_tools
from src.rag import rag_service
from test_llm_tool_orchestrator import runtime
from test_semantic_control import gateway_for, action
from test_description_recommendations import doc
from conftest import mock_postgres_cart_db

ADDRESS = '17 Đường Hoa, Phường 3, Quận 7, Thành phố Hồ Chí Minh'
CANDIDATE = {'display_address': ADDRESS, 'normalized_label': 'Nhà ở đường Hoa',
    'candidate_id': 'fixture-map-1', 'provider_ref_id': 'fixture-provider-1', 'lat': 10.75, 'lng': 106.7}

CASES = [
    ('taste', 'Giữa trưa oi bức, tìm giúp mình nước thanh mát mà ngọt nhẹ thôi nha.', 'preferences'),
    ('ordinal', 'Lấy giúp mình thức uống thứ hai trong những món bạn đang giới thiệu.', 'product selection'),
    ('configuration', 'Ly đang chờ đó cỡ L, bớt đá với bớt ngọt giùm mình.', 'product configuration'),
    ('multi_add', 'Mình lấy Cà Phê Alpha và Cà Phê Beta, cả hai theo công thức mặc định của quán.', 'two default adds'),
    ('compound', 'Xóa dòng giỏ thứ hai nhé; chiếc bánh ở dòng thứ ba sửa thành ba cái.', 'remove original 2, quantity original 3'),
    ('three_edits', 'Phần thứ ba lấy hai cái, bỏ phần thứ hai, ly đầu đổi số lượng thành hai nhé.', 'three frozen cart edits'),
    ('delivery_only', 'Nhờ quán giao giúp mình tới chợ Phú Nhuận nha.', 'delivery and location, no payment'),
    ('address_followup', 'Chỗ mình nhắc ở thành phố Hồ Chí Minh nhé, bổ sung vào địa chỉ đang chờ giúp mình.', 'complete retained address'),
    ('candidate', 'Địa điểm đầu tiên trên bản đồ đúng nơi mình sẽ nhận hàng nha.', 'select candidate 1, no payment'),
    ('candidate_payment', 'Dùng địa điểm thứ nhất trên bản đồ; mình chọn thanh toán COD nhé.', 'candidate 1 and explicit payment'),
    ('fulfillment_payment', 'Mình sẽ lấy tại quán, tiền trả bằng QR ngân hàng nhé.', 'pickup and explicit QR'),
    ('payment_question', 'Phương thức VNPAY hoạt động ra sao, có cần tài khoản riêng không?', 'read-only payment question'),
    ('payment_negation', 'Chưa chọn COD đâu nhé, mình muốn xem những cách trả tiền trước.', 'no payment mutation'),
    ('review', 'Cho mình xem lại toàn bộ đơn cùng địa điểm nhận và cách trả tiền nhé.', 'authoritative summary'),
    ('confirmation', 'Mình đồng ý đặt đúng đơn vừa được tóm tắt ở lượt trước, tiến hành giúp mình.', 'later-turn final confirmation'),
]


def authority_fixture(mp, name):
    mock_postgres_cart_db.__wrapped__(mp)
    rt = runtime.__wrapped__(mp)
    mp.setenv('TURN_LOG_ENABLED', 'false')
    def blocked(*args, **kwargs):
        raise RuntimeError('qualification external business authority blocked')
    mp.setattr(helpers, '_get_engine', blocked)
    mp.setattr(product_tools, '_get_engine', blocked)
    mp.setattr(branch_tools, '_get_engine', blocked)
    # Block aliases already imported elsewhere and every SQLAlchemy connection.
    for module_name, module in list(sys.modules.items()):
        if module_name.startswith(('src.', 'utils.')) and hasattr(module, '_get_engine'):
            mp.setattr(module, '_get_engine', blocked)
    mp.setattr(Engine, 'connect', blocked)
    mp.setattr(Engine, 'begin', blocked)
    real_request = requests.Session.request
    def isolated_request(session, method, url, **kwargs):
        if url != 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions':
            return blocked()
        return real_request(session, method, url, **kwargs)
    mp.setattr(requests.Session, 'request', isolated_request)
    mp.setattr(requests, 'get', blocked)
    def options(product_id=None, **kwargs):
        row = next(p for p in rt.products if p['product_id'] == product_id)
        return {'status': 'ok', **row, 'option_groups': [
            {'name': 'Size', 'values': ['M', 'L'], 'required': True},
            {'name': 'Lượng đá', 'values': ['Ít đá', 'Bình thường'], 'required': False},
            {'name': 'Độ ngọt', 'values': ['Ít ngọt', 'Bình thường', 'Thêm ngọt'], 'required': False},
            {'name': 'Topping', 'values': ['Pearl', 'Foam'], 'multiple': True, 'required': False}]}
    mp.setattr(product_tools, 'execute_get_product_options', options)
    from src.agents.checkout_choices import PAYMENT_OPTIONS, PAYMENT_LABELS
    payments = [{'code': c, 'label': label, 'enabled': True} for c, label in zip(PAYMENT_OPTIONS, PAYMENT_LABELS)]
    mp.setattr(cart_tools, 'get_wallet_payment_options', lambda *a, **k: {'payment_options': deepcopy(payments)})
    mp.setitem(tools.TOOL_EXECUTORS, 'get_user_profile', lambda *a: {'status': 'ok',
        'default_address': '12 Đường Mây, Phường 4, Quận 8, Thành phố Hồ Chí Minh'})
    def nearest(**kwargs):
        candidate = kwargs.get('resolved_location') or {**CANDIDATE, 'display_address': kwargs['location']}
        return {'status': 'ok', 'resolved_location': candidate, 'branches': [
            {'ma_chi_nhanh': 'fixture-branch', 'ten_chi_nhanh': 'Quán kiểm định', 'availability_status': 'available'}]}
    def select(sid, bid, label, **kwargs):
        cart_manager.set_branch(sid, bid, label)
        return {'status': 'ok', 'branch_id': bid, 'branch_name': label}
    mp.setattr(branch_tools, 'execute_find_nearest_branch', nearest)
    mp.setattr(branch_tools, 'execute_set_session_branch', select)
    def summary(sid, **kwargs):
        c, p = cart_manager.get_cart(sid), cart_manager.get_checkout_prefs(sid)
        amounts = {'final_total': sum(r['quantity'] * r['unit_price'] for r in c['items'])}
        cart_manager.set_checkout_context(sid, summary_amounts=amounts)
        p = cart_manager.mark_checkout_summary(sid)
        cart_manager.set_pending_action(sid, 'confirm_checkout', {})
        return {'status': 'require_confirmation', 'message': 'Bạn xem lại đơn và xác nhận ở lượt tiếp theo nhé.',
            'order_summary': {**{k: p.get(k) for k in ('delivery_type', 'payment_method', 'delivery_address')},
                'branch_id': c['branch_id'], 'branch_name': c['branch_name'], 'items': c['items'],
                'action_id': p['checkout_action_id'], **amounts}}
    mp.setattr(cart_tools, 'execute_request_checkout', summary)
    mp.setattr(cart_tools, 'execute_confirm_checkout', lambda sid, **kwargs: (
        rt.writes.append(('confirm', kwargs)) or {'status': 'ok', 'order_id': 'fixture-order', 'message': 'Đã tạo đơn kiểm định.'}))
    cart_manager.set_checkout_context(rt.sid, voucher_decided=True)
    if name in {'taste', 'multi_add'}:
        cart_manager.replace_items_from_order_cart(rt.sid, [])
    if name == 'configuration':
        g = gateway_for(rt, 'Mình chọn Cà Phê Alpha')
        g.execute_semantic(action(g, 'get_product_options', {'product_id': '101'}))
    if name in {'compound', 'three_edits'}:
        rt.products.append({'product_id': '104', 'product_name': 'Cake Delta', 'category': 'food', 'final_price': 60000})
        rows = [dict(id=800+i, **p, quantity=1, size='M', unit_price=p['final_price'])
            for i, p in enumerate([rt.products[0], rt.products[2], rt.products[3]])]
        cart_manager.replace_items_from_order_cart(rt.sid, rows)
    if name in {'address_followup', 'candidate', 'candidate_payment', 'review', 'confirmation'}:
        cart_manager.set_checkout_prefs(rt.sid, delivery_type='GIAO_TAN_NOI')
        cart_manager.set_checkout_context(rt.sid, checkout_requested=True, voucher_decided=True)
    if name == 'address_followup':
        cart_manager.set_checkout_context(rt.sid, partial_delivery_address='17 Đường Hoa, Phường 3, Quận 7')
    if name in {'candidate', 'candidate_payment'}:
        cart_manager.set_checkout_context(rt.sid, location_candidate_snapshot={
            'snapshot_id': 'fixture-snapshot', 'kind': 'address', 'transactional': True,
            'candidates': [CANDIDATE, {**CANDIDATE, 'candidate_id': 'fixture-map-2', 'lat': 10.76}]})
        cart_manager.set_pending_action(rt.sid, 'select_location_candidate', {'count': 2})
    if name in {'review', 'confirmation'}:
        destination = from_candidate(CANDIDATE)
        cart_manager.set_checkout_prefs(rt.sid, delivery_address=ADDRESS, payment_method='THANH_TOAN_KHI_NHAN_HANG')
        cart_manager.set_checkout_context(rt.sid, address_confirmed=True, confirmed_destination=destination,
            branch_destination_fingerprint=destination['fingerprint'], location_state='LOCATION_READY')
        cart_manager.set_branch(rt.sid, 'fixture-branch', 'Quán kiểm định')
        if name == 'confirmation':
            summary(rt.sid)
            memory = ConversationMemory(rt.redis).load(rt.sid)
            memory['recent_turns'] = [{'role': 'assistant', 'content': 'Đơn gồm Cà Phê Alpha và Cà Phê Beta, giao tới '+ADDRESS+', thanh toán COD. Bạn xác nhận đặt đơn nhé?'}]
            ConversationMemory(rt.redis).save(rt.sid, memory)
    descriptions = [doc('101', 'Đồ uống thanh mát, mát lạnh giải khát, hương trái cây với vị ngọt nhẹ.'),
        doc('102', 'Cà phê vị đắng rõ và phục vụ nóng.'), doc('103', 'Bánh bơ mềm.')]
    mp.setattr(rag_service, 'load_all_rag_data', lambda: descriptions)
    rag = rag_service.RAGService()
    rag.load()
    mp.setattr(rag_service, 'get_rag_service', lambda: rag)
    mp.setattr(product_tools, 'execute_filter_catalog', lambda **k: {'status': 'ok', 'products': [
        p for p in rt.products if p['product_id'] in k.get('product_ids', []) and k.get('category', 'all') in {'all', p['category']}]})
    mp.setitem(tools.TOOL_EXECUTORS, 'get_recommendations', lambda args, sid: product_tools.execute_get_recommendations(**args))
    return rt


def assess(name, before, after, writes, result):
    prefs, items = after['checkout_prefs'], {str(r['cart_item_id']): r for r in after['items']}
    checks = []
    if name in {'payment_question', 'payment_negation'}:
        checks.append(not writes and prefs.get('payment_method') == before['checkout_prefs'].get('payment_method'))
    if name in {'delivery_only', 'address_followup', 'candidate'}:
        checks.append(prefs.get('payment_method') is None)
    if name in {'candidate', 'candidate_payment', 'review'}:
        checks.append(prefs.get('delivery_address') == ADDRESS)
        checks.append((prefs.get('confirmed_destination') or {}).get('lat') == CANDIDATE['lat'])
    if name == 'compound':
        checks.append('801' not in items and items.get('802', {}).get('quantity') == 3)
    if name == 'three_edits':
        checks.append('801' not in items and items.get('802', {}).get('quantity') == 2 and items.get('800', {}).get('quantity') == 2)
    if name == 'multi_add':
        checks.append(len([w for w in writes if w[0] == 'add']) == 2)
    if name == 'configuration':
        checks.append(any(w[0] == 'add' and w[1].get('size') == 'L' and w[1].get('luong_da') == 'Ít đá'
            and w[1].get('do_ngot') == 'Ít ngọt' and not w[1].get('toppings') for w in writes))
    if name == 'candidate_payment':
        checks.append(prefs.get('payment_method') == 'THANH_TOAN_KHI_NHAN_HANG')
    if name == 'fulfillment_payment':
        checks.append(prefs.get('delivery_type') == 'MANG_DI' and prefs.get('payment_method') == 'NGAN_HANG_QR')
    if name == 'review':
        checks.append((result.get('checkout_payload') or {}).get('delivery_address') == ADDRESS)
    if name == 'confirmation':
        checks.append([w[0] for w in writes] == ['confirm'])
    if name == 'taste':
        checks.append([p['product_id'] for p in result['ui_payload']['products']] == ['101'] and not writes)
    if name == 'ordinal':
        checks.append(any(p['product_id'] == '102' for p in prefs.get('pending_products') or []) and not writes)
    return all(checks) and result.get('error') is None


def main(output, budget=24, cases=None):
    if not 1 <= budget <= 24:
        raise ValueError('qualification budget must be 1..24')
    by_name = {row[0]: row for row in CASES}
    selected_cases = [by_name[name] for name in cases] if cases else CASES
    original_env = {k: v for k, v in os.environ.items() if k.startswith(('GEMINI_', 'AI_AGENT_'))}
    real_client, real_post = groq_service.GeminiClient, requests.post
    if not original_env.get('GEMINI_API_KEY') and not original_env.get('GEMINI_API_KEYS'):
        raise RuntimeError('configured Gemini credentials unavailable')
    transport = QualificationTransport(real_post, budget=budget)
    report = {'business_authority': 'isolated in-memory fixtures; NO real cart/order/geo writes', 'budget': budget, 'cases': [], 'attempts': transport.attempts}
    for name, message, expected in selected_cases:
        if transport.stopped or len(transport.attempts) >= budget:
            report['stop_reason'] = 'repeated_provider_errors' if transport.stopped else 'budget_exhausted'
            break
        with pytest.MonkeyPatch.context() as mp:
            rt = authority_fixture(mp, name)
            for key, value in original_env.items():
                mp.setenv(key, value)
            mp.setenv('AI_AGENT_PROVIDER', 'gemini')
            mp.setenv('AI_AGENT_FALLBACK_PROVIDERS', '')
            mp.setenv('AI_AGENT_MAX_PROVIDER_ATTEMPTS_PER_ROUND', '2')
            mp.setattr(groq_service, 'GeminiClient', real_client)
            mp.setattr(requests, 'post', transport.post)
            before = deepcopy(cart_manager.get_cart(rt.sid))
            start_count, started = len(transport.attempts), time.monotonic()
            result = rt.semantic_orchestrator(rt.sid, message, client_message_id=uuid4().hex)
            after = deepcopy(cart_manager.get_cart(rt.sid))
            report['cases'].append({'case': name, 'user_message': message, 'expected_facets': expected,
                'provider_requests': len(transport.attempts)-start_count,
                'protocol_repairs': sum(r['result'].get('recovery_kind') == 'model_repair' for r in result['tool_calls_log']),
                'latency_ms': round((time.monotonic()-started)*1000, 2), 'executed_writes': rt.writes,
                'tool_results': result['tool_calls_log'], 'final_authoritative_state': after,
                'reply': result['reply'], 'error': result.get('error'),
                'passed': assess(name, before, after, rt.writes, result)})
            Path(output).write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str)+'\n')
            print(json.dumps({'case': name, 'passed': report['cases'][-1]['passed'],
                'calls': len(transport.attempts)-start_count, 'total_calls': len(transport.attempts)}, ensure_ascii=False), flush=True)
    Path(output).write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str)+'\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--live', action='store_true', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--budget', type=int, default=24)
    parser.add_argument('--cases', help='Comma-separated known case names, in qualification priority order')
    args = parser.parse_args()
    logging.basicConfig(level=logging.WARNING)
    main(args.output, budget=args.budget, cases=args.cases.split(',') if args.cases else None)
