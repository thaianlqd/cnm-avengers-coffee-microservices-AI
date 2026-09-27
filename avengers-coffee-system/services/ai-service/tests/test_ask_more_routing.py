"""Shopping context must never turn a generic continuation into a cart write."""
import copy
import json
import uuid

import pytest

from src.agents import agent_service, order_flow_graph as graph
from src.common import cart_manager, groq_service
from src.function_calling.tools import cart_tools, product_tools, voucher_tools


CATALOG = [
    {'product_id': 'A1', 'product_name': 'Americano Classic', 'category': 'drink'},
    {'product_id': 'M1', 'product_name': 'Matcha Latte Đào Dưa Lưới', 'category': 'drink'},
    {'product_id': 'B1', 'product_name': 'Bánh Croissant Bơ', 'category': 'food'},
    {'product_id': 'B2', 'product_name': 'Bánh Tiramisu', 'category': 'food'},
    {'product_id': 'B3', 'product_name': 'Bánh Matcha Hạnh Nhân', 'category': 'food'},
]
DONE = ['vậy đủ rồi', 'thôi thế được', 'không cần thêm gì', 'giỏ này ổn rồi',
        'mình không mua nữa', 'chốt giỏ vậy nhé', 'thế là xong', 'đủ món rồi bạn',
        'ok vậy thôi', 'không thêm món nào nữa']
GENERIC = ['tôi muốn thêm món', 'muốn mua thêm', 'xem thêm đi', 'chọn thêm vài món',
           'tôi muốn mua thêm gì đó', 'cho tôi xem thêm', 'mình muốn lấy thêm đồ',
           'muốn chọn thêm', 'thêm một món nào đó', 'tôi còn muốn mua thêm thứ gì đó',
           'cho tôi cái gì đó', 'tiếp tục mua nhé']
BROWSING = ['bên bạn có bán món gì matcha không', 'có đồ uống matcha nào không',
            'cho xem bánh mặn', 'gợi ý tôi vài món lạnh', 'menu có gì về cà phê',
            'tìm đồ uống ít caffeine', 'xem thực đơn đồ ăn', 'có bánh ngọt nào không?',
            'cho tôi xem thêm trà', 'gợi ý món bán chạy', 'menu đồ uống có gì',
            'tham khảo bánh ăn sáng', 'xem Americano Classic', 'có Americano Classic không?']
CONCRETE = [
    ('thêm Americano Classic', 'A1'), ('lấy bánh số 3', 'B3'),
    ('cho tôi Matcha Latte Đào Dưa Lưới', 'M1'), ('mua Bánh Tiramisu', 'B2'),
    ('chọn nước số 1', 'A1'), ('thêm món số 2', 'M1'),
    ('lấy Bánh Croissant Bơ nhé', 'B1'), ('cho tôi bánh này', 'B3'),
    ('thêm sản phẩm id: A1', 'A1'),
    ('them  AMERICANO   CLASSIC', 'A1'),
]


@pytest.fixture
def shopping(monkeypatch):
    sid = 'ask-more-' + uuid.uuid4().hex
    cart_manager.add_item(sid, 'old', 'Món đã chọn', 30000)
    cart_manager.set_checkout_context(sid,
        last_product_suggestions=copy.deepcopy(CATALOG),
        product_suggestion_snapshots={'drink': CATALOG[:2], 'food': CATALOG[2:]},
        product_suggestion_mode='grouped', last_product_focus=CATALOG[-1])
    cart_manager.set_pending_action(sid, 'ask_more_items', {})
    monkeypatch.setattr(graph, '_load_active_product_targets', lambda: copy.deepcopy(CATALOG))
    monkeypatch.setattr(cart_tools, 'sync_authoritative_cart', lambda s: cart_manager.get_cart(s))
    monkeypatch.setattr(cart_tools, 'execute_get_cart_quote', lambda s: {
        'status': 'ok', 'cart': cart_manager.get_cart(s),
        'quote': {'subtotal': cart_manager.get_cart(s)['total_price'], 'discount_amount': 0,
                  'final_total': cart_manager.get_cart(s)['total_price']},
    })
    monkeypatch.setattr(voucher_tools, 'execute_get_applicable_vouchers', lambda s: {
        'status': 'ok', 'vouchers': [{'ma_voucher': 'SAVE', 'ten_voucher': 'Ưu đãi'}],
    })
    monkeypatch.setattr(groq_service, 'groq_chat', lambda *a, **k: pytest.fail('Clear semantics need no fallback'))
    monkeypatch.setattr(cart_tools, 'execute_add_to_cart', lambda **k: pytest.fail('Unexpected cart write'))
    monkeypatch.setattr(product_tools, 'execute_check_price_and_stock', lambda **k: pytest.fail('Generic exact-price lookup'))
    monkeypatch.setattr(agent_service, '_run_agent_impl', lambda *a, **k: pytest.fail('Unsafe legacy fallthrough'))
    return sid


def understand(sid, message):
    return graph._understand({'session_id': sid, 'user_message': message, 'history': [],
                             'cart': cart_manager.get_cart(sid)})


def cart_contents(sid):
    return copy.deepcopy({key: value for key, value in cart_manager.get_cart(sid).items()
                          if key != 'checkout_prefs'})


def turn(sid, message):
    return graph.run_order_flow(sid, message)


@pytest.mark.parametrize('message', DONE)
def test_done_enters_existing_voucher_gate(shopping, message):
    assert understand(shopping, message)['intent']['pending_decision'] == 'DONE'
    result = turn(shopping, message)
    assert cart_manager.get_pending_action(shopping)['type'] == 'select_voucher'
    assert cart_manager.get_checkout_prefs(shopping)['voucher_offer_pending']
    assert 'SAVE' in result['reply'] and result['checkout_payload'] is None


@pytest.mark.parametrize('message', GENERIC)
def test_generic_continuation_has_no_target_price_or_mutation(shopping, message):
    before = cart_contents(shopping)
    state = understand(shopping, message)
    assert state['intent']['pending_decision'] == 'WANT_MORE_GENERIC'
    assert not state['intent']['resolved_products']
    result = turn(shopping, message)
    assert cart_contents(shopping) == before
    assert cart_manager.get_pending_action(shopping) is None
    assert cart_manager.get_checkout_prefs(shopping)['flow_stage'] == 'BROWSING'
    assert result['tool_calls_log'] == [] and result['checkout_payload'] is None


@pytest.mark.parametrize('message', BROWSING)
def test_browsing_preserves_cart_and_routes_original_message(shopping, monkeypatch, message):
    before = cart_contents(shopping)
    routed = []
    def search(raw):
        routed.append(raw)
        return {'reply': 'Danh sách món trong menu', 'checkout_payload': None, 'tool_calls_log': [], 'error': None}
    monkeypatch.setattr(graph, '_search_menu_catalog', search)
    assert understand(shopping, message)['intent']['pending_decision'] == 'BROWSING_REQUEST'
    turn(shopping, message)
    assert routed == [message]
    assert cart_contents(shopping) == before
    assert cart_manager.get_pending_action(shopping) is None


@pytest.mark.parametrize('message,pid', CONCRETE)
def test_concrete_add_uses_resolver_evidence_and_existing_options(shopping, monkeypatch, message, pid):
    state = understand(shopping, message)
    assert state['intent']['pending_decision'] == 'CONCRETE_ADD'
    refs = state['intent']['resolved_products']
    assert len(refs) == 1 and refs[0]['product_id'] == pid
    calls = []
    monkeypatch.setattr(product_tools, 'execute_get_product_options', lambda name: {
        'status': 'ok', 'product_name': name, 'options': {},
    })
    def price(product_name_query, **kwargs):
        ref = next(p for p in CATALOG if p['product_name'] == product_name_query)
        calls.append(('price', ref['product_id']))
        return {'status': 'ok', 'products': [{**ref, 'final_price': 45000}]}
    def add(session_id, **kwargs):
        calls.append(('add', kwargs['product_id']))
        cart_manager.add_item(session_id, kwargs['product_id'], kwargs['product_name'], kwargs['unit_price'], quantity=kwargs['quantity'])
        return {'status': 'ok', 'cart': cart_manager.get_cart(session_id)}
    monkeypatch.setattr(product_tools, 'execute_check_price_and_stock', price)
    monkeypatch.setattr(cart_tools, 'execute_add_to_cart', add)
    result = turn(shopping, message)
    assert calls == [('price', pid), ('add', pid)]
    assert any(row['product_id'] == pid for row in cart_manager.get_cart(shopping)['items'])
    assert any(log['tool'] == 'add_to_cart' for log in result['tool_calls_log'])


@pytest.mark.parametrize('output', ['DONE', 'WANT_MORE_GENERIC', 'BROWSING_REQUEST', 'AMBIGUOUS', 'CONCRETE_ADD'])
def test_novel_semantic_paraphrase_routes_enum_but_cannot_invent_target(shopping, monkeypatch, output):
    raw = 'Mình còn hứng khám phá hương vị mới.'
    calls = []
    def classify(system, user, **kwargs):
        calls.append(json.loads(user))
        return json.dumps({'intent': output})
    monkeypatch.setattr(groq_service, 'groq_chat', classify)
    monkeypatch.setattr(graph, '_search_menu_catalog', lambda message: {
        'reply': 'Menu hiện tại', 'tool_calls_log': [], 'checkout_payload': None, 'error': None,
    })
    before = cart_contents(shopping)
    result = turn(shopping, raw)
    assert cart_contents(shopping) == before
    assert calls == [{'pending_context': 'ask_more_items', 'answer': raw, 'evidence': {
        'has_resolved_product_target': False, 'has_resolved_ordinal': False, 'looks_like_catalog_query': False,
    }}]
    pending = cart_manager.get_pending_action(shopping)
    if output == 'DONE':
        assert pending['type'] == 'select_voucher'
    elif output == 'AMBIGUOUS':
        assert pending['type'] == 'ask_more_items'
    else:
        assert pending is None
        assert cart_manager.get_checkout_prefs(shopping)['flow_stage'] == 'BROWSING'
    assert result['checkout_payload'] is None


@pytest.mark.parametrize('raw', ['thêm món', 'mua đồ', 'lấy cái gì đó', 'cho tôi sản phẩm không tồn tại',
                               'thêm Americano', 'lấy bánh số 99', 'lấy nước số 1 và bánh số 99'])
def test_even_model_concrete_enum_cannot_bypass_failed_resolution(shopping, monkeypatch, raw):
    monkeypatch.setattr(groq_service, 'groq_chat', lambda *a, **k: '{"intent":"CONCRETE_ADD"}')
    before = cart_contents(shopping)
    intent = understand(shopping, raw)['intent']
    assert intent['intent'] != 'ADD_ITEM' and not intent['resolved_products']
    turn(shopping, raw)
    assert cart_contents(shopping) == before


def test_catalog_match_works_without_suggestion_and_requires_full_canonical_name(shopping):
    cart_manager.set_checkout_context(shopping, last_product_suggestions=[], product_suggestion_snapshots={}, last_product_focus=None)
    assert graph._resolve_ask_more_targets(shopping, 'thêm Americano Classic') == [CATALOG[0]]
    assert graph._resolve_ask_more_targets(shopping, 'lấy sản phẩm id: M1') == [CATALOG[1]]
    assert graph._resolve_ask_more_targets(shopping, 'thêm Americano') == []
    assert graph._resolve_ask_more_targets(shopping, 'thêm Americano Classical') == []


def test_semantic_concrete_requires_and_passes_real_resolver_evidence(shopping, monkeypatch):
    raw = 'Một Americano Classic sẽ hợp với buổi sáng của mình.'
    captured = []
    def classify(system, user, **kwargs):
        captured.append(json.loads(user))
        return '{"intent":"CONCRETE_ADD"}'
    def prepare(sid, refs, operation_base):
        assert sid == shopping and refs[0]['product_id'] == 'A1'
        assert operation_base
        return {'reply': 'Bạn chọn tùy chọn cho Americano Classic nhé.', 'tool_calls_log': [], 'checkout_payload': None, 'error': None}
    monkeypatch.setattr(groq_service, 'groq_chat', classify)
    monkeypatch.setattr(graph, '_prepare_structured_products', prepare)
    result = graph.run_order_flow(shopping, raw, client_message_id='semantic-concrete')
    assert 'Americano Classic' in result['reply']
    assert captured[0]['evidence'] == {
        'has_resolved_product_target': True, 'has_resolved_ordinal': False, 'looks_like_catalog_query': False,
    }


def test_concrete_target_still_requires_authoritative_cart_before_execution(shopping, monkeypatch):
    monkeypatch.setattr(cart_tools, 'is_authenticated_cart_session', lambda sid: True)
    monkeypatch.setattr(graph, '_prepare_structured_products', lambda *a, **k: pytest.fail('Unavailable cart cannot mutate'))
    state = understand(shopping, 'thêm Americano Classic')
    state['cart']['authoritative'] = False
    result = graph._execute(state)['result']
    assert result['tool_calls_log'][0]['result']['reason'] == 'authoritative_cart_unavailable'


@pytest.mark.parametrize('verb', ['thêm', 'mua', 'lấy', 'chọn', 'cho tôi'])
@pytest.mark.parametrize('noun', ['món', 'đồ', 'thứ gì đó', 'món nào đó', 'cái gì đó'])
def test_generic_nouns_never_supply_product_evidence(shopping, monkeypatch, verb, noun):
    monkeypatch.setattr(groq_service, 'groq_chat', lambda *a, **k: '{"intent":"CONCRETE_ADD"}')
    raw = f'{verb} {noun}'
    before = cart_contents(shopping)
    intent = understand(shopping, raw)['intent']
    assert intent['intent'] != 'ADD_ITEM' and not intent['resolved_products']
    turn(shopping, raw)
    assert cart_contents(shopping) == before


def test_browsing_fallback_provider_can_only_execute_catalog_reads(shopping, monkeypatch):
    raw = 'gợi ý tôi vài món lạnh'
    monkeypatch.setattr(graph, '_search_menu_catalog', lambda message: None)
    monkeypatch.setattr(agent_service, '_build_messages', lambda **kwargs: [{'role': 'user', 'content': kwargs['user_message']}])
    def provider(**kwargs):
        names = {schema['function']['name'] for schema in kwargs['tools']}
        assert names == {'get_recommendations', 'get_product_insights'}
        assert set(kwargs['tool_executors']) == names
        assert kwargs['messages'][0]['content'] == raw
        return {'reply': 'Bạn có thể xem các món lạnh trong menu.', 'tool_calls_log': [], 'checkout_payload': None, 'error': None}
    monkeypatch.setattr(agent_service, 'groq_agent_chat', provider)
    before = cart_contents(shopping)
    assert 'món lạnh' in turn(shopping, raw)['reply']
    assert cart_contents(shopping) == before


@pytest.mark.parametrize('raw,expected', [('xem giỏ hàng', 'VIEW_CART'), ('xoá món này', 'REMOVE_ITEM'),
                                         ('xoá giỏ hàng', 'CLEAR_CART'), ('đổi size món này', 'EDIT_OPTIONS'),
                                         ('món này số lượng 2', 'SET_QUANTITY')])
def test_pending_context_does_not_swallow_explicit_cart_intents(shopping, raw, expected):
    assert understand(shopping, raw)['intent']['intent'] == expected
