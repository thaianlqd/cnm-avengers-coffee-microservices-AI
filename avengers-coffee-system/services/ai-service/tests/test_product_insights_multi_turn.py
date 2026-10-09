import json
import pytest
from test_llm_tool_orchestrator import runtime


def content(reply, claims=(), **fields):
    return {'content': json.dumps({'response_kind': 'consultation' if not claims else 'action',
        'reply': reply, 'mutation_claims': list(claims), 'evidence_quotes': [], **fields}, ensure_ascii=False)}


def calls(*operations):
    return {'tool_calls': [{'id': str(i), 'type': 'function', 'function': {
        'name': name, 'arguments': json.dumps(args)}} for i, (name, args) in enumerate(operations)]}


def test_product_insights_not_blocked_by_mutation_claim_mismatch(runtime):
    runtime.provider.steps = [
        calls(
            ('get_product_insights', {'product_name': 'Cà Phê Alpha'}),
            ('get_product_insights', {'product_name': 'Cà Phê Beta'})
        ),
        content(
            'Dạ, món Cà Phê Alpha được đánh giá 4.4/5 sao từ 32 khách hàng đã đặt và có nhận xét thơm ngon. '
            'Còn Cà Phê Beta được đánh giá 4.1/5 sao từ 25 lượt đã đặt ạ.'
        )
    ]
    result = runtime.turn('cho tôi xem đánh giá của món số 1 và 2 đi bạn')
    assert 'Cà Phê Alpha' in result['reply']
    assert 'Cà Phê Beta' in result['reply']
    assert 'Chưa thể thực hiện' not in result['reply']


def test_product_insights_allowed_even_without_prior_product_context(runtime):
    from src.agents.tool_capabilities import capabilities_for_context
    context = {'business': {'authenticated': True, 'cart': {'items': []}, 'checkout': {}}, 'visible': {}}
    allowed = capabilities_for_context(context)
    assert 'get_product_insights' in allowed


def test_product_insights_ordinal_resolution(runtime):
    runtime.provider.steps = [
        calls(
            ('get_product_insights', {'product_name': '1'}),
            ('get_product_insights', {'product_name': 'món 2'})
        ),
        content(
            'Dạ, món Cà Phê Alpha (món 1) được đánh giá 4.4/5 sao. '
            'Còn Cà Phê Beta (món 2) được đánh giá 4.1/5 sao ạ.'
        )
    ]
    result = runtime.turn('đánh giá của khách hàng về món số 1 và 2 như nào')
    assert 'Cà Phê Alpha' in result['reply']
    assert 'Cà Phê Beta' in result['reply']
    assert len(result['tool_calls_log']) == 2
    assert result['tool_calls_log'][0]['result']['product_name'] == 'Cà Phê Alpha'
    assert result['tool_calls_log'][1]['result']['product_name'] == 'Cà Phê Beta'


def test_compound_review_and_flavor_query(runtime):
    # Customer asks about BOTH reviews AND flavor/description
    runtime.provider.steps = [
        calls(
            ('get_product_insights', {'product_name': '3'}),
            ('get_product_description', {'product_id': '3'})
        ),
        content(
            'Dạ, món 3 (Cà Phê Sữa) có đánh giá 4.2/5 sao, hương vị đậm đà kết hợp sữa đặc ngọt béo rất hài hòa ạ.'
        )
    ]
    from src.common import cart_manager
    cart_manager.replace_items_from_order_cart(runtime.sid, [])
    result = runtime.turn('cho tôi xem đánh giá của món 3 và 4 đi bạn với hương vị 2 món này như nào nhỉ')
    assert 'Chưa thể thực hiện yêu cầu này an toàn' not in result['reply']
    desc_call = next((c for c in result['tool_calls_log'] if c['tool'] == 'get_product_description'), None)
    assert desc_call is not None
    assert desc_call['result']['status'] != 'wrong_authority'
    assert desc_call['result']['status'] != 'wrong_authority'

