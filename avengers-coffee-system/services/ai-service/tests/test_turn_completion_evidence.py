"""Read evidence cannot stand in for a completed customer change.

Scripted model output exercises the real loop, grounding and state. No live NLU.
"""
from copy import deepcopy
import json

import pytest

from test_semantic_control import compatibility_runtime, runtime, gateway_for, action
from src.common import cart_manager


def tool_step(g, tool, args=None, **fields):
    return {'tool_calls': [{'id': 'proposal', 'type': 'function', 'function': {
        'name': 'customer_actions', 'arguments': json.dumps({'actions': [
            action(g, tool, args, **fields)]}, ensure_ascii=False)}}]}


def final_step(kind, reply='Dạ, tôi đã thiết lập theo mặc định cho bạn rồi nhé.', claims=()):
    return {'content': json.dumps({'response_kind': kind, 'reply': reply,
        'mutation_claims': list(claims), 'evidence_quotes': []}, ensure_ascii=False)}


def stage(runtime, ids=('101',)):
    cart_manager.replace_items_from_order_cart(runtime.sid, [])
    for product_id in ids:
        g = gateway_for(runtime, 'Mình chọn món này')
        runtime.provider.steps = [tool_step(g, 'get_product_options', {'product_id': product_id})]
        result = runtime.turn(g.user_message)
        assert result['error'] is None
    assert not runtime.writes
    runtime.provider.requests.clear()


@pytest.mark.parametrize('message', [
    'theo mặc định cho tôi đi bạn', 'Cứ dùng công thức sẵn của quán nhé',
    'Lấy tùy chọn tiêu chuẩn cho món đang chọn giúp mình',
])
def test_read_then_action_answer_repairs_to_defaults_in_same_turn(runtime, message):
    stage(runtime)
    g = gateway_for(runtime, message)
    runtime.provider.steps = [tool_step(g, 'get_cart', commitment='QUESTION'),
        final_step('action'), tool_step(g, 'add_to_cart', option_intent='DEFAULTS',
            defaults_evidence=message, reference={'namespace': 'PRODUCT', 'kind': 'pending'})]
    result = runtime.turn(message, client_message_id='defaults-completion')
    assert result['error'] is None and len(runtime.provider.requests) == 3
    assert len(runtime.writes) == 1 and runtime.writes[0][0] == 'add'
    assert not cart_manager.get_checkout_prefs(runtime.sid).get('pending_products')
    assert cart_manager.get_cart(runtime.sid)['items'][0]['size'] == 'M'
    assert 'Cà Phê Alpha' in result['reply'] and '×1' in result['reply']
    assert runtime.turn(message, client_message_id='defaults-completion') == result
    assert len(runtime.writes) == 1 and len(runtime.provider.requests) == 3


def test_repeated_cart_read_keeps_one_bounded_pending_dispatch_opportunity(runtime, caplog):
    caplog.set_level('INFO')
    stage(runtime)
    g = gateway_for(runtime, 'Theo công thức mặc định nhé')
    read = tool_step(g, 'get_cart', commitment='QUESTION')
    runtime.provider.steps = [read, deepcopy(read), tool_step(g, 'add_to_cart',
        option_intent='DEFAULTS', defaults_evidence=g.user_message,
        reference={'namespace': 'PRODUCT', 'kind': 'pending'})]
    result = runtime.turn(g.user_message)
    assert result['error'] is None and len(runtime.provider.requests) == 3
    assert runtime.provider.requests[-1].get('tools')
    assert len(runtime.writes) == 1
    metrics = json.loads(next(record.message.split('[LLMToolTurn] ')[1]
        for record in reversed(caplog.records) if record.message.startswith('[LLMToolTurn] ')))
    assert metrics['read_completion_repair_count'] == 1
    assert metrics['same_turn_read_cache_hits'] >= 1


def test_reported_no_tool_repeat_read_and_unstructured_success_can_still_dispatch(runtime):
    stage(runtime)
    drafts = cart_manager.get_checkout_prefs(runtime.sid)['pending_products']
    drafts[0].pop('option_schema', None)
    cart_manager.set_pending_products(runtime.sid, drafts)
    g = gateway_for(runtime, 'theo mặc định cho tôi đi bạn')
    from semantic_scripted_steps import step as typed_step
    prose = {'content': 'Dạ, tôi đã thiết lập theo mặc định cho bạn rồi nhé.'}
    read = typed_step('ask_product_options', {'reference': {'kind': 'id', 'value': '101'}})
    runtime.provider.steps = [prose, read, deepcopy(read),
        typed_step('use_product_defaults', {'commitment': 'SELECTED', 'evidence': g.user_message,
            'reference': {'kind': 'pending'}})]
    result = runtime.turn(g.user_message)
    assert result['error'] is None and len(runtime.provider.requests) == 4
    assert runtime.provider.requests[-1].get('tools')
    assert len(runtime.writes) == 1 and '×1' in result['reply']


@pytest.mark.parametrize('kind', ['consultation', 'action', None])
def test_read_only_false_success_never_reaches_customer(runtime, kind):
    stage(runtime)
    g = gateway_for(runtime, 'Cho vào giỏ chưa bạn')
    read = tool_step(g, 'get_cart', commitment='QUESTION')
    # Repeated reads eventually disable tools; unsupported action completion
    # must fall back truthfully even when the model omits mutation_claims/kind.
    runtime.provider.steps = [read, deepcopy(read), deepcopy(read), final_step(kind)]
    result = runtime.turn(g.user_message)
    assert len(runtime.provider.requests) == 4 and not runtime.writes
    assert 'đã thiết lập' not in result['reply']
    assert 'chưa vào giỏ' in result['reply'] and 'Cà Phê Alpha' in result['reply']
    assert cart_manager.get_checkout_prefs(runtime.sid)['pending_products'][0]['product_id'] == '101'


def test_actual_cart_question_displays_committed_and_pending_without_mutation(runtime):
    stage(runtime)
    g = gateway_for(runtime, 'Giỏ hàng có món nào rồi?')
    runtime.provider.steps = [tool_step(g, 'get_cart', commitment='QUESTION'),
        final_step('consultation', 'Giỏ trống, bạn chọn món gì?')]
    result = runtime.turn(g.user_message)
    assert result['error'] is None and len(runtime.provider.requests) == 2
    assert 'Giỏ hiện chưa có món nào' in result['reply']
    assert 'chưa vào giỏ' in result['reply'] and 'Cà Phê Alpha' in result['reply']
    assert 'M, L' in result['reply'] and not runtime.writes


@pytest.mark.parametrize('kind', ['consultation', None])
def test_mislabeled_success_after_single_read_is_rendered_from_state(runtime, kind):
    stage(runtime)
    g = gateway_for(runtime, 'Theo mặc định giúp mình')
    runtime.provider.steps = [tool_step(g, 'get_cart', commitment='QUESTION'), final_step(kind)]
    result = runtime.turn(g.user_message)
    assert len(runtime.provider.requests) == 2 and not runtime.writes
    assert 'đã thiết lập' not in result['reply'] and 'chưa vào giỏ' in result['reply']


def test_read_feedback_does_not_force_a_write_for_a_real_cart_question(runtime):
    stage(runtime)
    g = gateway_for(runtime, 'Giỏ có gì rồi?')
    read = tool_step(g, 'get_cart', commitment='QUESTION')
    runtime.provider.steps = [read, deepcopy(read), final_step('consultation', 'Giỏ trống.')]
    result = runtime.turn(g.user_message)
    assert result['error'] is None and len(runtime.provider.requests) == 3
    assert runtime.provider.requests[-1]['tool_choice'] == 'auto'
    assert not runtime.writes and 'chưa vào giỏ' in result['reply']


def test_noop_business_action_is_still_executed_evidence(runtime):
    g = gateway_for(runtime, 'Giữ hình thức mang đi nhé')
    g.artifacts.collect('set_checkout_choices', {}, {'status': 'ok', 'changed': False})
    assert g.artifacts.response_issue(final_step('action')['content']) is None


def test_multi_pending_cart_read_never_defaults_or_discards_any_draft(runtime):
    stage(runtime, ('101', '102'))
    g = gateway_for(runtime, 'Xem giỏ giúp mình')
    before = deepcopy(cart_manager.get_checkout_prefs(runtime.sid)['pending_products'])
    runtime.provider.steps = [tool_step(g, 'get_cart', commitment='QUESTION'), final_step('consultation')]
    result = runtime.turn(g.user_message)
    assert all(name in result['reply'] for name in ('Cà Phê Alpha', 'Cà Phê Beta'))
    assert not runtime.writes
    assert cart_manager.get_checkout_prefs(runtime.sid)['pending_products'] == before


@pytest.mark.parametrize('kind,message', [
    ('social', 'Cảm ơn bạn nhé'), ('social', 'Tôi chưa muốn đặt nữa'),
])
def test_social_or_interruption_does_not_force_pending_cart_write(runtime, kind, message):
    stage(runtime)
    runtime.provider.steps = [final_step(kind, 'Dạ bạn nhé.')]
    result = runtime.turn(message)
    assert result['error'] is None and result['reply'] == 'Dạ bạn nhé.'
    assert len(runtime.provider.requests) == 1 and not runtime.writes


def test_action_completion_evidence_is_generic_not_product_phrase_specific(runtime):
    g = gateway_for(runtime, 'Chuyển sang mang đi nhé')
    runtime.provider.steps = [tool_step(g, 'get_cart', commitment='QUESTION'),
        final_step('action', 'Đã ghi nhận mang đi.'),
        tool_step(g, 'set_fulfillment_choice', {'delivery_type': 'MANG_DI'}, facet='fulfillment')]
    result = runtime.turn(g.user_message)
    assert result['error'] is None and len(runtime.provider.requests) == 3
    assert cart_manager.get_checkout_prefs(runtime.sid)['delivery_type'] == 'MANG_DI'


def test_read_projection_exposes_draft_separate_from_committed_cart(runtime):
    stage(runtime)
    g = gateway_for(runtime, 'Đọc giỏ thôi')
    result = g.customer_actions({'actions': [action(g, 'get_cart', commitment='QUESTION')]})
    projected = result['results'][0]['result']
    assert not projected['cart']['items']
    assert projected['pending_products'][0]['product_id'] == '101'
    assert 'option_schema' not in projected['pending_products'][0]
    assert projected['completion']['mutated'] is False
    assert projected['completion']['pending_configuration'] is True
