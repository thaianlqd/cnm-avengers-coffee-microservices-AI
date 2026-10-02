"""Identity memory is distinct from business state and mutation authority."""
from copy import deepcopy
import json
import logging
from unittest.mock import Mock
from uuid import uuid4

import pytest
from src.agents import agent_service, knowledge_consultation, order_flow_graph
from src.agents.selection_language import parse_selection_reference
from src.common import cart_manager, groq_service
from src.function_calling.tools import cart_tools, product_tools
from src.rag import rag_service
from test_natural_knowledge_routing import forbid_writes


@pytest.fixture
def catalog(monkeypatch):
    rows = [dict(product_id=f'ref-{i}', product_name=name, category='drink')
            for i, name in enumerate(('Trà Vườn', 'Cacao Đồi', 'Nước Cam', 'Trà Suối'), 1)]
    docs = [dict(id='doc-'+p['product_id'], title=p['product_name'], content='Hương vị thanh nhẹ.',
                 source='fixture', domain='product_description', entity_type='product',
                 entity_id=p['product_id'], tags=[p['product_name']], authority='knowledge', volatility='slow') for p in rows]
    monkeypatch.setattr(rag_service, 'load_all_rag_data', lambda: docs)
    service = rag_service.RAGService()
    service.load()
    monkeypatch.setattr(rag_service, 'get_rag_service', lambda: service)
    monkeypatch.setattr(order_flow_graph, '_load_active_product_targets', lambda: rows)
    monkeypatch.setattr(groq_service, 'groq_chat', lambda *a, **k: None)
    monkeypatch.setattr(cart_tools, 'sync_authoritative_cart', lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(agent_service, '_run_agent_impl', Mock(side_effect=AssertionError('model fallback')))
    return rows, service


def session(rows, owner=None):
    sid = 'canonical-'+uuid4().hex
    cart_manager.get_cart(sid)
    cart_manager.set_checkout_context(sid, last_product_suggestions=rows, quote={'total': 17}, voucher_code='KEEP')
    if owner:
        if owner == 'fill_options':
            cart_manager.set_pending_products(sid, [dict(rows[0], quantity=2,
                option_schema=[{'name': 'Kích thước', 'values': ['Nhỏ', 'Lớn'], 'required': True}], selected_options={'size': 'Lớn'})])
        cart_manager.set_pending_action(sid, owner, {'token': 'original'})
    return sid


def business_state(sid):
    state = deepcopy(cart_manager._SESSION_CARTS[sid])
    state.pop('updated_at', None)
    state['checkout_prefs'].pop('last_product_focus', None)
    return state


@pytest.mark.parametrize('owner', [None, 'fill_options', 'select_voucher'])
@pytest.mark.parametrize('query,index,source', [('Cacao Đồi vị sao?', 1, 'explicit_product_name'),
    ('món số 2 vị sao?', 1, 'product_snapshot_ordinal'), ('vị sao?', 0, 'selected_product_id')])
def test_consultation_identity_preserves_business_state(catalog, monkeypatch, caplog, owner, query, index, source):
    rows, _ = catalog
    sid = session(rows, owner)
    before = business_state(sid)
    forbid_writes(monkeypatch)
    with caplog.at_level(logging.INFO):
        result = order_flow_graph.run_order_flow(sid, query, selected_product_id=rows[0]['product_id'] if query == 'vị sao?' else None)
    assert business_state(sid) == before
    assert cart_manager.get_checkout_prefs(sid)['last_product_focus'] == rows[index]
    assert result['route_owner'] == 'knowledge' and '_canonical_reference' not in result
    assert '_canonical_reference' not in result['tool_calls_log'][0]['result']
    trace = [json.loads(r.message.split('decision_provenance=', 1)[1]) for r in caplog.records if 'decision_provenance=' in r.message][-1]
    assert trace['reference_source'] == ('pending_products' if owner == 'fill_options' and query == 'vị sao?' else source) and trace['resolved_product_ids'] == [rows[index]['product_id']]
    assert trace['active_pending_type'] == owner
    assert not trace['mutation_allowed'] and not trace['mutation_evidence_present']


def test_consultation_itself_is_observational(catalog, monkeypatch):
    rows, _ = catalog
    sid = session(rows)
    before = deepcopy(cart_manager._SESSION_CARTS[sid])
    forbid_writes(monkeypatch)
    result = knowledge_consultation.try_knowledge_consultation(sid, 'Cacao Đồi vị sao?')
    assert result['_canonical_reference']['product']['product_id'] == rows[1]['product_id']
    assert cart_manager._SESSION_CARTS[sid] == before


@pytest.mark.parametrize('insufficient', [False, True])
def test_identity_survives_grounding_then_review_price_inventory(catalog, monkeypatch, insufficient):
    rows, service = catalog
    sid = session(rows)
    if insufficient:
        monkeypatch.setattr(service, 'lookup', lambda *a, **k: {'status': 'not_found', 'results': []})
    forbid_writes(monkeypatch)
    before = business_state(sid)
    result = order_flow_graph.run_order_flow(sid, 'món số 2 vị sao?')
    if insufficient:
        assert 'chưa có đủ' in result['reply'] and 'thanh nhẹ' not in result['reply']
    review = Mock(return_value={'status': 'ok', 'message': 'Chưa có đánh giá.'})
    price = Mock(return_value={'status': 'ok', 'products': [dict(rows[1], final_price=47000)]})
    monkeypatch.setattr(product_tools, 'execute_get_product_insights', review)
    monkeypatch.setattr(product_tools, 'execute_check_price_and_stock', price)
    reviewed = order_flow_graph.run_order_flow(sid, 'món đó review sao?')
    assert [r['tool'] for r in reviewed['tool_calls_log']] == ['get_product_insights']
    review.assert_called_once_with(rows[1]['product_name'])
    priced = order_flow_graph.run_order_flow(sid, 'giá bn?', history=[{'role': 'assistant', 'content': reviewed['reply']}])
    assert [r['tool'] for r in priced['tool_calls_log']] == ['check_price_and_stock']
    assert '47.000đ' in priced['reply'] and 'đánh giá' not in priced['reply']
    stocked = order_flow_graph.run_order_flow(sid, 'còn hàng k?')
    assert [r['tool'] for r in stocked['tool_calls_log']] == ['check_price_and_stock']
    assert price.call_args.kwargs['product_name_query'] == rows[1]['product_name']
    assert business_state(sid) == before


@pytest.mark.parametrize('query', ['Trà Không Tồn Tại vị sao?', 'món này Trà Không Tồn Tại vị sao?', 'Trà Vườn và Cacao Đồi vị sao?'])
def test_unknown_or_multiple_does_not_reuse_focus(catalog, monkeypatch, query):
    rows, _ = catalog
    sid = session(rows)
    cart_manager.set_checkout_context(sid, last_product_focus=rows[2])
    before = deepcopy(cart_manager._SESSION_CARTS[sid])
    forbid_writes(monkeypatch)
    result = order_flow_graph.run_order_flow(sid, query)
    assert result['tool_calls_log'][0]['result']['status'] == 'not_found'
    assert cart_manager._SESSION_CARTS[sid] == before


def test_explicit_identity_overrides_old_focus_and_hint(catalog, monkeypatch):
    rows, _ = catalog
    sid = session(rows)
    cart_manager.set_checkout_context(sid, last_product_focus=rows[0])
    forbid_writes(monkeypatch)
    order_flow_graph.run_order_flow(sid, 'Cacao Đồi vị sao?', selected_product_id=rows[2]['product_id'])
    assert cart_manager.get_checkout_prefs(sid)['last_product_focus'] == rows[1]


def test_visible_list_cannot_guess_focus(catalog, monkeypatch):
    rows, _ = catalog
    sid = session(rows)
    forbid_writes(monkeypatch)
    result = order_flow_graph.run_order_flow(sid, 'món này vị sao?')
    assert result['tool_calls_log'][0]['result']['status'] == 'not_found'
    assert not cart_manager.get_checkout_prefs(sid).get('last_product_focus')


@pytest.mark.parametrize('message,indices', [('lấy số 1 với số 2', [0, 1]), ('chọn 1 và 3', [0, 2]),
    ('cho mình số 2, số 4', [1, 3]), ('món 1 với 2', [0, 1]), ('chọn 3 và 1', [2, 0]), ('lấy số 2 với số 2', [1])])
def test_shared_ordinals_resolve_exact_order(catalog, message, indices):
    rows, _ = catalog
    sid = session(rows)
    assert parse_selection_reference(message, active_namespace='PRODUCT', allow_multiple=True).operation_semantics == 'SELECT_REFERENCE'
    resolved, invalid, count = order_flow_graph._resolve_product_ordinals(sid, message)
    assert count and not invalid
    assert [r['product_id'] for r in resolved] == [rows[i]['product_id'] for i in indices]


@pytest.mark.parametrize('message', ['voucher số 2', 'thanh toán số 2', 'chi nhánh số 2', 'địa điểm số 2',
    'dòng số 2', 'hình thức nhận hàng số 2', 'chọn 42/3 Nguyễn Hữu Tiến', 'lấy số 1 với voucher số 2',
    'món số 1 và thanh toán số 2', 'không lấy số 1 với số 2'])
def test_namespace_and_negative_safety(catalog, message):
    rows, _ = catalog
    assert order_flow_graph._resolve_product_ordinals(session(rows), message) == ([], [], 0)


@pytest.mark.parametrize('owner', ['select_voucher', 'select_payment', 'select_checkout_choices', 'select_branch',
    'select_location_candidate', 'cart_line_choice', 'fill_options'])
def test_bare_reference_cannot_steal_pending_owner(catalog, owner):
    rows, _ = catalog
    assert order_flow_graph._resolve_product_ordinals(session(rows, owner), 'lấy số 1 với số 2') == ([], [], 0)


def options_runtime(monkeypatch, rows):
    calls = []
    def options(name=None, **kwargs):
        row = next(r for r in rows if r['product_id'] == kwargs['product_id'])
        return dict(status='ok', **row, options={'Kích thước': ['Nhỏ', 'Lớn']}, option_groups=[
            {'name': 'Kích thước', 'values': ['Nhỏ', 'Lớn'], 'required': True, 'fixed': False, 'default_value': 'Nhỏ'}])
    monkeypatch.setattr(product_tools, 'execute_get_product_options', options)
    def price(product_name_query, **kwargs):
        row = next(r for r in rows if r['product_name'] == product_name_query)
        return {'status': 'ok', 'products': [dict(row, final_price=47000)]}
    monkeypatch.setattr(product_tools, 'execute_check_price_and_stock', price)
    def add(**kwargs):
        calls.append(kwargs)
        cart = cart_manager.add_item(kwargs['session_id'], kwargs['product_id'], kwargs['product_name'], kwargs['unit_price'],
                                     quantity=kwargs['quantity'], size=kwargs['size'])
        return {'status': 'ok', 'cart': cart}
    monkeypatch.setattr(cart_tools, 'execute_add_to_cart', add)
    return calls


@pytest.mark.parametrize('multi', [False, True])
def test_selection_stages_then_defaults_adds_exactly_once(catalog, monkeypatch, caplog, multi):
    rows, _ = catalog
    sid = session(rows)
    adds = options_runtime(monkeypatch, rows)
    if not multi:
        order_flow_graph.run_order_flow(sid, 'Cacao Đồi vị sao?')
    with caplog.at_level(logging.INFO):
        selected = order_flow_graph.run_order_flow(sid, 'lấy số 1 với số 2' if multi else 'thêm món này')
    ids = [rows[0]['product_id'], rows[1]['product_id']] if multi else [rows[1]['product_id']]
    assert [r['product_id'] for r in cart_manager.get_checkout_prefs(sid)['pending_products']] == ids
    assert cart_manager.get_pending_action(sid)['type'] == 'fill_options'
    assert not adds and not cart_manager.get_cart(sid)['items']
    assert [r['tool'] for r in selected['tool_calls_log']] == ['get_product_options'] * len(ids)
    if multi:
        assert not cart_manager.get_checkout_prefs(sid).get('last_product_focus')
    monkeypatch.setattr(order_flow_graph, '_load_active_product_targets', Mock(side_effect=AssertionError('defaults re-ran search')))
    message = '2 món vừa chọn lấy mặc định nha' if multi else 'mặc định hết'
    turn_id = uuid4().hex
    completed = order_flow_graph.run_order_flow(sid, message, client_message_id=turn_id)
    order_flow_graph.run_order_flow(sid, message, client_message_id=turn_id)
    assert [r['product_id'] for r in adds] == ids
    assert [r['product_id'] for r in cart_manager.get_cart(sid)['items']] == ids
    assert not cart_manager.get_checkout_prefs(sid).get('pending_products')
    assert sum(r['tool'] == 'add_to_cart' for r in completed['tool_calls_log']) == len(ids)
    if multi:
        assert not cart_manager.get_checkout_prefs(sid).get('last_product_focus')
        trace = [json.loads(r.message.split('decision_provenance=', 1)[1]) for r in caplog.records if 'decision_provenance=' in r.message][-1]
        assert trace['resolved_product_ids'] == ids and trace['reference_source'] == 'product_snapshot_ordinal'
        assert trace['mutation_allowed'] and not trace['mutation_evidence_present']


@pytest.mark.parametrize('message', ['lấy số 1 với số 9', 'chọn 0 và 2'])
def test_out_of_range_cannot_prepare_or_write(catalog, monkeypatch, message):
    rows, _ = catalog
    sid = session(rows)
    monkeypatch.setattr(product_tools, 'execute_get_product_options', Mock(side_effect=AssertionError('options')))
    forbid_writes(monkeypatch)
    result = order_flow_graph.run_order_flow(sid, message)
    assert 'số' in result['reply'] and not result.get('checkout_payload')
    assert not cart_manager.get_cart(sid)['items']


def test_longer_explicit_name_is_not_captured_by_old_focus(catalog, monkeypatch):
    rows, _ = catalog
    sid = session(rows)
    cart_manager.set_checkout_context(sid, last_product_focus=rows[0])
    longer = dict(rows[0], product_id='ref-long', product_name=rows[0]['product_name']+' Đặc Biệt')
    monkeypatch.setattr(order_flow_graph, '_load_active_product_targets', lambda: rows+[longer])
    forbid_writes(monkeypatch)
    order_flow_graph.run_order_flow(sid, longer['product_name']+' vị sao?')
    assert cart_manager.get_checkout_prefs(sid)['last_product_focus'] == longer


def test_ambiguous_catalog_alias_cannot_reuse_single_visible_focus(catalog, monkeypatch):
    rows, _ = catalog
    candidates = [dict(rows[0], product_id='alias-1', product_name='Trà Hoa Vườn'),
                  dict(rows[1], product_id='alias-2', product_name='Trà Hoa Suối')]
    sid = session([candidates[0]])
    cart_manager.set_checkout_context(sid, last_product_focus=candidates[0])
    monkeypatch.setattr(order_flow_graph, '_load_active_product_targets', lambda: candidates)
    before = deepcopy(cart_manager._SESSION_CARTS[sid])
    forbid_writes(monkeypatch)
    result = order_flow_graph.run_order_flow(sid, 'Trà Hoa vị sao?')
    assert result['tool_calls_log'][0]['result']['status'] == 'not_found'
    assert cart_manager._SESSION_CARTS[sid] == before


@pytest.mark.parametrize('query', ['Trà Không Tồn Tại giá bn?', 'món này Trà Không Tồn Tại review sao?'])
def test_unknown_business_read_cannot_use_focus_or_model_prose(catalog, monkeypatch, query):
    rows, _ = catalog
    sid = session(rows)
    cart_manager.set_checkout_context(sid, last_product_focus=rows[0])
    forbid_writes(monkeypatch)
    monkeypatch.setattr(product_tools, 'execute_check_price_and_stock', Mock(side_effect=AssertionError('unknown identity')))
    monkeypatch.setattr(product_tools, 'execute_get_product_insights', Mock(side_effect=AssertionError('unknown identity')))
    result = order_flow_graph.run_order_flow(sid, query)
    assert not result['tool_calls_log'] and not result.get('checkout_payload')
    assert 'món nào' in result['reply']


def test_fixed_default_multi_add_has_no_arbitrary_single_focus(catalog, monkeypatch):
    rows, _ = catalog
    sid = session(rows)
    adds = options_runtime(monkeypatch, rows)
    def fixed(name=None, **kwargs):
        row = next(r for r in rows if r['product_id'] == kwargs['product_id'])
        return dict(status='ok', **row, options={'Kích thước': ['Nhỏ']}, option_groups=[
            {'name': 'Kích thước', 'values': ['Nhỏ'], 'required': True, 'fixed': True}])
    monkeypatch.setattr(product_tools, 'execute_get_product_options', fixed)
    order_flow_graph.run_order_flow(sid, 'chọn 3 và 1')
    assert [r['product_id'] for r in adds] == [rows[2]['product_id'], rows[0]['product_id']]
    assert not cart_manager.get_checkout_prefs(sid).get('last_product_focus')


def test_logging_failure_cannot_change_consultation(catalog, monkeypatch):
    rows, _ = catalog
    sid = session(rows)
    monkeypatch.setattr(order_flow_graph.logger, 'info', Mock(side_effect=RuntimeError('logging unavailable')))
    result = order_flow_graph.run_order_flow(sid, 'Cacao Đồi vị sao?')
    assert result['route_owner'] == 'knowledge'
    assert cart_manager.get_checkout_prefs(sid)['last_product_focus'] == rows[1]
