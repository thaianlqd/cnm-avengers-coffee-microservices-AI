"""LAN 19: cart quantities, category recommendations and static product facets."""
from copy import deepcopy
import json
import logging
from uuid import uuid4
from unittest.mock import Mock

import pytest
from src.agents import agent_service, knowledge_consultation, order_flow_graph as graph
from src.agents.tier1 import classify_order_intent
from src.common import cart_manager, groq_service
from src.function_calling.tools import cart_tools, product_tools, voucher_tools
from src.rag import rag_service
from test_natural_knowledge_routing import forbid_writes, assert_business_state_unchanged
from test_canonical_conversation_references import options_runtime


@pytest.fixture
def journey(monkeypatch):
    rows = [dict(product_id='synthetic-alpha', product_name='Đồ Uống Alpha', category='drink'),
            dict(product_id='synthetic-beta', product_name='Bánh Beta', category='food'),
            dict(product_id='synthetic-gamma', product_name='Bánh Gamma', category='food')]
    docs = [dict(id='doc-'+p['product_id'], title=p['product_name'], content='Hương vị thanh nhẹ.',
        source='fixture', domain='product_description', entity_type='product', entity_id=p['product_id'],
        tags=[p['product_name']], authority='knowledge', volatility='slow') for p in rows]
    docs.append(dict(id='synthetic-membership', title='Hội viên', content='Hội viên tích điểm theo chính sách.',
        source='fixture', domain='membership', tags=['tích điểm'], authority='knowledge', volatility='slow'))
    monkeypatch.setattr(rag_service, 'load_all_rag_data', lambda: docs)
    service = rag_service.RAGService()
    service.load()
    monkeypatch.setattr(rag_service, 'get_rag_service', lambda: service)
    monkeypatch.setattr(graph, '_load_active_product_targets', lambda: rows)
    monkeypatch.setattr(groq_service, 'groq_chat', lambda *a, **k: None)
    monkeypatch.setattr(agent_service, '_run_agent_impl', lambda *a, **k: pytest.fail('Unexpected model fallback'))
    monkeypatch.setattr(cart_tools, 'is_authenticated_cart_session', lambda _: True)
    monkeypatch.setattr(cart_tools, 'sync_authoritative_cart', lambda s: {**cart_manager.get_cart(s), 'authoritative': True})
    monkeypatch.setattr(cart_tools, 'execute_get_cart_quote', lambda s: dict(status='ok',cart=cart_manager.get_cart(s),quote={}))
    monkeypatch.setattr(product_tools, 'execute_get_recommendations', lambda *a, **k: dict(status='ok',
        products=[dict(r, final_price=30000) for r in rows if k.get('category') in {None, 'all', r['category']}]))
    monkeypatch.setattr(product_tools, 'execute_filter_catalog', lambda *a, **k: dict(status='ok',
        products=[dict(r, final_price=30000) for r in rows]))
    monkeypatch.setattr(product_tools, 'execute_check_price_and_stock', Mock(return_value=dict(status='ok',
        products=[dict(rows[0], final_price=30000)])))
    sid = 'lan19-'+uuid4().hex
    cart_manager.replace_items_from_order_cart(sid, [dict(id=801+i, **r, quantity=1, size='M',
        toppings=['Synthetic topping'], unit_price=30000) for i,r in enumerate(rows[:2])])
    cart_manager.set_checkout_context(sid, flow_stage='CART_REVIEW', last_product_suggestions=rows,
        product_suggestion_snapshots={'food': rows[1:]})
    return sid, rows, service


def trace(caplog):
    return json.loads(next(r.message.split('decision_provenance=',1)[1] for r in reversed(caplog.records)
                          if 'decision_provenance=' in r.message))


@pytest.mark.parametrize('message,index,quantity', [
    ('dòng 2 cho tôi 2 cái nha', 1, 2), ('dòng 2 để 3 cái', 1, 3),
    ('dòng số 1 số lượng 2', 0, 2), ('món trong giỏ số 2 cho 4 phần', 1, 4),
    ('món thứ 2 để 2 cái', 1, 2)])
def test_cart_reference_and_quantity_compose_once(journey, monkeypatch, caplog, message, index, quantity):
    sid, _, _ = journey
    before = deepcopy(cart_manager.get_cart(sid)['items'])
    writes=[]
    def update(s, line, patch):
        writes.append((line,patch))
        items=deepcopy(cart_manager.get_cart(s)['items'])
        next(r for r in items if str(r['cart_item_id'])==str(line)).update(patch)
        cart_manager.replace_items_from_order_cart(s, items)
        return dict(status='ok',cart=cart_manager.get_cart(s),quote={})
    monkeypatch.setattr(cart_tools, 'execute_update_cart_item', update)
    monkeypatch.setattr(cart_tools, 'execute_add_to_cart', lambda *a, **k: pytest.fail('Absolute quantity added a product'))
    monkeypatch.setattr(graph, '_search_menu_catalog', lambda *a, **k: pytest.fail('Quantity browsed catalog'))
    assert classify_order_intent(message)['intent']=='SET_QUANTITY'
    with caplog.at_level(logging.INFO):
        graph.run_order_flow(sid,message,client_message_id='quantity-once')
        graph.run_order_flow(sid,message,client_message_id='quantity-once')
    assert writes==[(str(before[index]['cart_item_id']),{'quantity':quantity})]
    expected=deepcopy(before); expected[index]['quantity']=quantity
    assert cart_manager.get_cart(sid)['items']==expected
    decision=trace(caplog)
    assert decision['semantic_operation']=='SET_QUANTITY' and decision['reference_namespace']=='CART_LINE'
    assert decision['mutation_authorized_by_route'] and decision['mutation_evidence_present']


@pytest.mark.parametrize('message', ['dòng 2 cho 0 cái','dòng 2 cho -2 cái','dòng số 9 cho 2 cái',
                                   'dòng 2 cho 2 cái hay 3 cái','dòng 2 cho 1.5 cái'])
def test_invalid_cart_quantity_or_reference_never_writes(journey, monkeypatch, message):
    sid, _, _=journey
    before=deepcopy(cart_manager.get_cart(sid)['items'])
    monkeypatch.setattr(cart_tools,'execute_update_cart_item',lambda *a, **k: pytest.fail('Invalid write'))
    result=graph.run_order_flow(sid,message)
    assert cart_manager.get_cart(sid)['items']==before and not result.get('checkout_payload')


@pytest.mark.parametrize('message', ['voucher số 2 cho 2 cái','chi nhánh số 2 cho 2 cái',
    'thanh toán số 2 cho 2 cái','địa chỉ số 2 cho 2 cái','bánh số 2 lấy 2 cái'])
def test_other_namespace_never_becomes_cart_quantity(message):
    assert classify_order_intent(message)['intent']!='SET_QUANTITY'


@pytest.mark.parametrize('message', ['có bánh gì ngon không?','có nước nào dễ uống không?',
    'gợi ý bánh ngon đi','có đồ uống nào mát không?','cho xem bánh ngon','có món nào dễ ăn không?',
    'cho tôi thêm bánh nữa, có gì dễ ăn không?','có cà phê nào ngon không?'])
@pytest.mark.parametrize('focused', [False, True])
def test_generic_recommendation_is_catalog_before_rag(journey, monkeypatch, caplog, message, focused):
    sid, rows, _=journey
    if focused: cart_manager.set_checkout_context(sid,last_product_focus=rows[0])
    before=deepcopy(cart_manager._SESSION_CARTS[sid])
    forbid_writes(monkeypatch)
    monkeypatch.setattr(knowledge_consultation,'execute_search_knowledge_base',lambda *a, **k: pytest.fail('Generic category queried RAG'))
    with caplog.at_level(logging.INFO): result=graph.run_order_flow(sid,message)
    assert result['ui_payload']['products']
    assert any(t['tool'] in {'get_recommendations','filter_catalog'} for t in result['tool_calls_log'])
    assert not trace(caplog)['mutation_authorized_by_route']
    assert trace(caplog)['authority_owner']=='catalog'
    assert cart_manager.get_cart(sid)['items']==before['items']


@pytest.mark.parametrize('message', ['món này có gì hay?','món này có gì đặc biệt?',
    'mô tả món này đi','vị món này sao?','món này uống thế nào?',
    'món này có đặc điểm gì?','món này có điểm nổi bật gì?','Đồ Uống Alpha ngon không?'])
@pytest.mark.parametrize('context', ['focus','selected'])
def test_static_product_facet_is_filtered_read_only_rag(journey, monkeypatch, caplog, message, context):
    sid, rows, _=journey
    if context=='focus': cart_manager.set_checkout_context(sid,last_product_focus=rows[0])
    before=deepcopy(cart_manager._SESSION_CARTS[sid])
    forbid_writes(monkeypatch)
    monkeypatch.setattr(product_tools,'execute_check_price_and_stock',lambda *a, **k: pytest.fail('Static facet fetched price'))
    with caplog.at_level(logging.INFO):
        result=graph.run_order_flow(sid,message,selected_product_id=rows[0]['product_id'] if context=='selected' else None)
    assert result['route_owner']=='knowledge'
    evidence=result['tool_calls_log'][0]['result']
    assert evidence['status']=='ok' and {d['entity_id'] for d in evidence['results']}=={rows[0]['product_id']}
    assert trace(caplog)['authority_owner']=='rag' and trace(caplog)['semantic_operation']=='PRODUCT_DESCRIPTION'
    assert not trace(caplog)['mutation_authorized_by_route']
    assert_business_state_unchanged(sid,before)


@pytest.mark.parametrize('message', ['giá bao nhiêu?','bao nhiêu tiền?','giá món này?','còn hàng không?'])
def test_dynamic_product_queries_never_use_rag(journey, monkeypatch, message):
    sid, rows, _=journey
    cart_manager.set_checkout_context(sid,last_product_focus=rows[0])
    forbid_writes(monkeypatch)
    monkeypatch.setattr(knowledge_consultation,'execute_search_knowledge_base',lambda *a, **k: pytest.fail('Dynamic RAG query'))
    result=graph.run_order_flow(sid,message)
    assert any(t['tool']=='check_price_and_stock' for t in result['tool_calls_log'])


@pytest.mark.parametrize('message,owner', [('voucher số 2','select_voucher'),
    ('chi nhánh số 2','select_branch'), ('thanh toán số 2','select_checkout_choices'),
    ('địa chỉ số 2','select_location_candidate'), ('bánh số 2',None)])
def test_active_namespace_with_all_snapshots_cannot_edit_cart(journey, message, owner):
    sid, rows, _=journey
    cart_manager.set_checkout_context(sid,voucher_candidates=[{'ma_voucher':'SYNTHETIC-A'}, {'ma_voucher':'SYNTHETIC-B'}],
        branch_candidates=[dict(branch_id=f'synthetic-branch-{i}',branch_name=f'Synthetic branch {i}') for i in (1,2)])
    if owner: cart_manager.set_pending_action(sid,owner,{})
    result=graph._understand(dict(session_id=sid,user_message=message,history=[],cart=cart_manager.get_cart(sid)))
    assert result['intent']['intent'] not in {'SET_QUANTITY','PENDING_CART_LINE'}
    assert [r['quantity'] for r in cart_manager.get_cart(sid)['items']]==[1,1]


@pytest.mark.parametrize('message', ['món này có gì hay?','Bánh Chưa Xác Minh có gì hay?'])
def test_unresolved_description_never_guesses_a_product_or_returns_price(journey, monkeypatch, message):
    sid, _, _=journey
    forbid_writes(monkeypatch)
    monkeypatch.setattr(product_tools,'execute_check_price_and_stock',lambda *a, **k: pytest.fail('Description fetched price'))
    result=graph.run_order_flow(sid,message)
    assert result['route_owner']=='knowledge' and result['tool_calls_log'][0]['result']['status']=='not_found'


def test_concrete_food_description_and_missing_evidence_remain_strict(journey, monkeypatch):
    sid, rows, service=journey
    forbid_writes(monkeypatch)
    result=graph.run_order_flow(sid,rows[1]['product_name']+' ngon không?')
    assert result['route_owner']=='knowledge'
    assert {d['entity_id'] for d in result['tool_calls_log'][0]['result']['results']}=={rows[1]['product_id']}
    remaining_docs=[dict(d) for d in service._index.docs if d['domain']=='membership']
    monkeypatch.setattr(rag_service,'load_all_rag_data',lambda: remaining_docs)
    assert service.load()['status']=='ok'
    result=graph.run_order_flow(sid,'món này có gì hay?')
    assert result['tool_calls_log'][0]['result']['status']=='not_found'
    assert 'chưa có đủ thông tin' in result['reply']


def test_recommend_options_add_second_product_quantity_then_finish(journey, monkeypatch):
    sid, rows, _=journey
    cart_manager.replace_items_from_order_cart(sid,[])
    adds=options_runtime(monkeypatch,rows)
    draft_add=cart_tools.execute_add_to_cart
    def authoritative_add(**kwargs):
        result=draft_add(**kwargs)
        items=deepcopy(cart_manager.get_cart(sid)['items'])
        for i,row in enumerate(items):
            row['cart_item_id']=row['line_id']=801+i
        cart_manager.replace_items_from_order_cart(sid,items)
        return {**result,'cart':cart_manager.get_cart(sid)}
    monkeypatch.setattr(cart_tools,'execute_add_to_cart',authoritative_add)
    writes=[]
    def update(s,line,patch):
        writes.append((line,patch))
        items=deepcopy(cart_manager.get_cart(s)['items'])
        next(r for r in items if str(r['cart_item_id'])==line).update(patch)
        cart_manager.replace_items_from_order_cart(s,items)
        return dict(status='ok',cart=cart_manager.get_cart(s),quote={})
    monkeypatch.setattr(cart_tools,'execute_update_cart_item',update)
    monkeypatch.setattr(voucher_tools,'execute_get_applicable_vouchers',lambda s: dict(status='ok',vouchers=[dict(ma_voucher='SYNTHETIC-A')]))
    rec=graph.run_order_flow(sid,'gợi ý đồ uống mát đi')
    assert rec['ui_payload']['products'] and not adds
    for i in (0,1):
        selected=graph.run_order_flow(sid,'lấy món này đi',selected_product_id=rows[i]['product_id'])
        assert cart_manager.get_pending_action(sid)['type']=='fill_options'
        graph.run_order_flow(sid,'mặc định hết',client_message_id=f'defaults-{i}')
        graph.run_order_flow(sid,'mặc định hết',client_message_id=f'defaults-{i}')
    assert [r['product_id'] for r in adds]==[r['product_id'] for r in rows[:2]]
    before=deepcopy(cart_manager.get_cart(sid)['items'])
    graph.run_order_flow(sid,'dòng 2 cho tôi 2 cái nha',client_message_id='flow-quantity')
    graph.run_order_flow(sid,'dòng 2 cho tôi 2 cái nha',client_message_id='flow-quantity')
    assert writes==[('802',{'quantity':2})]
    assert cart_manager.get_cart(sid)['items'][0]==before[0]
    finished=graph.run_order_flow(sid,'oke vậy đc rồi')
    assert cart_manager.get_pending_action(sid)['type']=='select_voucher'
    assert not finished.get('checkout_payload') and len(adds)==2
