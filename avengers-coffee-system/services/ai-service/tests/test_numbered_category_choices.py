"""Replay the reported bakery ordinal with real Menu category labels."""
from copy import deepcopy

import pytest

from test_llm_tool_orchestrator import runtime
from test_checkout_guarded_contract import gateway
from test_semantic_control import gateway_for, action
from src.agents.agent_memory import ConversationMemory, empty_memory
from src.function_calling import tools
from src.function_calling.tools import product_tools


def menu_rows(runtime):
    rows = [
        dict(product_id='101', product_name='Bánh Trung Thu Cà Phê Lava', category='Bánh Trung Thu',
             parent_category='Bánh & Đồ Ăn', final_price=99000, is_active=True),
        dict(product_id='102', product_name='Bánh Trung Thu Thập Cẩm Bát Bửu', category='Bánh Trung Thu',
             parent_category='Bánh & Đồ Ăn', final_price=119000, is_active=True),
        dict(product_id='103', product_name='Cà Phê Muối Avenger', category='Americano',
             parent_category='Cà Phê', final_price=35000, is_active=True),
        dict(product_id='104', product_name='1 Lít Matcha Latte Tây Bắc', category='Matcha',
             parent_category='Trà', final_price=95000, is_active=True),
    ]
    runtime.products[:] = rows
    return rows


@pytest.mark.parametrize('message', ['cho tôi bánh số 1 đi bạn', 'cho mình bánh số 1 á'])
def test_existing_leaf_category_snapshot_accepts_bakery_ordinal(runtime, message):
    # Old Redis snapshots did not retain parent_category or menu_bucket.
    rows = [{k: v for k, v in row.items() if k != 'parent_category'} for row in menu_rows(runtime)]
    ConversationMemory(runtime.redis).save(runtime.sid, {**empty_memory(),
        'visible_snapshots': {'products': rows}})
    g = gateway_for(runtime, message + ', size M')
    ref = {'namespace': 'PRODUCT', 'kind': 'ordinal', 'scope': 'food', 'index': 1}
    assert g.execute_semantic(action(g, 'add_to_cart', dict(product_id='103', size='M'), reference=ref))['status'] == 'reference_conflict'
    assert not runtime.writes
    assert g.execute_semantic(action(g, 'add_to_cart', dict(size='M'), reference=ref))['status'] == 'ok'
    assert runtime.writes[0][1]['product_id'] == '101'


def test_mixed_recommendations_keep_groups_through_display_memory_and_selection(runtime, monkeypatch):
    rows = menu_rows(runtime)
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'get_recommendations',
        lambda args, sid: dict(status='ok', products=deepcopy(rows)))
    runtime.provider.plan([('get_recommendations', dict(category='all', top_k=4))])
    result = runtime.turn('tôi muốn mua thêm bánh và nước')
    assert '**Bánh & đồ ăn:**' in result['reply'] and '**Đồ uống:**' in result['reply']
    cards = result['ui_payload']['products']
    assert [row['product_id'] for row in cards] == ['101', '102', '103', '104']
    assert [row['menu_bucket'] for row in cards] == ['food', 'food', 'drink', 'drink']
    assert [row['display_index'] for row in cards] == [1, 2, 3, 4]
    assert [row['group_display_index'] for row in cards] == [1, 2, 1, 2]
    assert 'nước số 1' in result['reply']
    saved = ConversationMemory(runtime.redis).load(runtime.sid)['visible_snapshots']['products']
    assert [row['menu_bucket'] for row in saved] == ['food', 'food', 'drink', 'drink']
    assert not runtime.writes and len(runtime.provider.requests) == 2

    # A bakery item with a fixed recipe can be added immediately after choosing it.
    monkeypatch.setattr(product_tools, 'execute_get_product_options', lambda product_id, **kwargs:
        dict(status='ok', product_id=product_id,
             product_name=next(row['product_name'] for row in rows if row['product_id'] == product_id),
             option_groups=[dict(name='Size', values=['M'], required=True)]))
    runtime.provider.plan([('get_product_options', dict(product_id='101')),
                           ('add_to_cart', dict(product_id='101', use_defaults=True))])
    added = runtime.turn('cho tôi bánh số 1 đi bạn')
    assert added['tool_calls_log'][-1]['result']['status'] == 'ok'
    assert runtime.writes[0][1]['product_id'] == '101'
    assert added['error'] is None and len(runtime.provider.requests) == 2
    assert all(request['max_tokens'] == 600 for request in runtime.provider.requests)


@pytest.mark.parametrize('message,product_id,scope,index', [
    ('cho tôi nước số 1 đi bạn', '103', 'drink', 1), ('cho tôi món số 3 đi bạn', '103', None, 3),
    ('cho mình bánh số 2 á', '102', 'food', 2)])
def test_category_and_global_ordinals_resolve_the_displayed_id(runtime, message, product_id, scope, index):
    rows = menu_rows(runtime)
    ConversationMemory(runtime.redis).save(runtime.sid, {**empty_memory(),
        'visible_snapshots': {'products': rows}})
    g = gateway_for(runtime, message + ', size M')
    ref = {'namespace': 'PRODUCT', 'kind': 'ordinal', 'index': index, **({'scope': scope} if scope else {})}
    result = g.execute_semantic(action(g, 'add_to_cart', dict(size='M'), reference=ref))
    assert result['status'] == 'ok'
    assert runtime.writes[0][1]['product_id'] == product_id


def test_default_retry_after_provider_timeout_retains_the_selected_product(runtime, monkeypatch):
    from src.agents import llm_tool_orchestrator
    monkeypatch.setattr(llm_tool_orchestrator, '_legacy_language_control', lambda *a: None)
    runtime.products[0]['product_name'] = 'Cà Phê Sữa Nóng'
    runtime.provider.plan([('get_product_options', dict(product_id='101'))])
    runtime.turn('cho tôi Cà Phê Sữa Nóng đi bạn')
    runtime.provider.steps = [TimeoutError('scripted provider timeout')]
    failed = runtime.turn('theo mặc định đi bạn ơi')
    assert failed['error'] and not runtime.writes
    assert ConversationMemory(runtime.redis).load(runtime.sid)['focus']['product']['product_id'] == '101'
    runtime.provider.plan([('add_to_cart', dict(product_id='101', use_defaults=True))])
    added = runtime.turn('theo mặc định đi bạn ơi')
    assert added['error'] is None and len(runtime.writes) == 1
    assert runtime.writes[0][1]['product_id'] == '101'
    assert runtime.writes[0][1]['toppings'] == []
