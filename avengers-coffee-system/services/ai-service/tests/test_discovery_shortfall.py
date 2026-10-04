"""A requested result count never authorizes widening a matcha cake query."""
from copy import deepcopy
import socket

import pytest
import requests

from test_llm_tool_orchestrator import runtime
from test_checkout_guarded_contract import calls, content
from src.agents.agent_memory import ConversationMemory
from src.function_calling import tools

MESSAGE = 'tôi muốn mua bánh vị matcha ấy bên bạn có không, tôi muốn xem 5 món ấy'
ROWS = [dict(product_id='201', product_name='Mochi Kem Matcha', category='food', final_price=19000),
        dict(product_id='202', product_name='Bánh Trung Thu Matcha', category='food', final_price=99000),
        dict(product_id='203', product_name='Soft Pizza Chà Bông Trứng Cút', category='food', final_price=39000),
        dict(product_id='204', product_name='Mochi Kem Việt Quất', category='food', final_price=19000),
        dict(product_id='205', product_name='Croissant trứng muối', category='food', final_price=45000),
        dict(product_id='206', product_name='Matcha Latte', category='drink', final_price=55000)]


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    def blocked(*args, **kwargs):
        raise AssertionError('No live network in discovery-shortfall tests')
    monkeypatch.setattr(socket.socket, 'connect', blocked)
    monkeypatch.setattr(socket.socket, 'connect_ex', blocked)
    monkeypatch.setattr(socket, 'create_connection', blocked)
    monkeypatch.setattr(socket, 'getaddrinfo', blocked)
    monkeypatch.setattr(requests.sessions.Session, 'request', blocked)


def install_catalog(runtime, monkeypatch, rows=ROWS, respect_filters=True):
    def catalog(args, sid):
        runtime.reads.append(('catalog', deepcopy(args)))
        selected = deepcopy(rows)
        if respect_filters:
            selected = [row for row in selected if args.get('category', 'all') in {'all', row['category']}
                and all(term in row['product_name'].lower() for term in args.get('search_text', '').split())]
        limit = args.get('limit', args.get('top_k', 5))
        return dict(status='ok' if selected else 'not_found', products=selected[:limit])
    for name in ('filter_catalog', 'get_recommendations'):
        monkeypatch.setitem(tools.TOOL_EXECUTORS, name, catalog)


@pytest.mark.parametrize('name,count_field', [('filter_catalog', 'limit'), ('get_recommendations', 'top_k')])
@pytest.mark.parametrize('search', ['', 'bánh', 'matcha'])
def test_five_requested_matcha_cakes_returns_only_two_with_clear_reply(runtime, monkeypatch, name, count_field, search):
    install_catalog(runtime, monkeypatch)
    runtime.provider.steps = [calls((name, dict(category='all', search_text=search, **{count_field: 5}))), content()]
    result = runtime.turn(MESSAGE)
    assert runtime.reads[0][1]['category'] == 'food'
    assert runtime.reads[0][1]['search_text'] == 'matcha'
    assert [row['product_id'] for row in result['ui_payload']['products']] == ['201', '202']
    assert '2 món bánh matcha' in result['reply'] and '5 món' in result['reply']
    assert 'Mochi Kem Matcha' in result['reply'] and 'Bánh Trung Thu Matcha' in result['reply']
    assert all(row['product_name'] not in result['reply'] for row in ROWS[2:])
    assert not runtime.writes
    snapshot = ConversationMemory(runtime.redis).load(runtime.sid)['visible_snapshots']['products']
    assert [row['product_id'] for row in snapshot] == ['201', '202']


def test_second_broad_read_cannot_fill_missing_results_with_other_cakes(runtime, monkeypatch):
    install_catalog(runtime, monkeypatch)
    runtime.provider.steps = [calls(('filter_catalog', dict(category='food', search_text='matcha', limit=5))),
        calls(('filter_catalog', dict(category='food', search_text='', limit=5))), content()]
    result = runtime.turn(MESSAGE)
    assert [row['product_id'] for row in result['ui_payload']['products']] == ['201', '202']
    assert len(runtime.reads) == 1  # Same normalized query uses the existing read cache.
    assert '2 món bánh matcha' in result['reply'] and not runtime.writes


def test_wrong_provider_rows_cannot_become_matcha_cake_cards(runtime, monkeypatch):
    install_catalog(runtime, monkeypatch, respect_filters=False)
    runtime.provider.steps = [calls(('filter_catalog', dict(category='food', search_text='matcha', limit=5))), content()]
    result = runtime.turn(MESSAGE)
    assert [row['product_id'] for row in result['ui_payload']['products']] == ['201', '202']


def test_zero_matching_cakes_has_no_unrelated_cards_and_offers_alternative(runtime, monkeypatch):
    install_catalog(runtime, monkeypatch, rows=ROWS[2:])
    runtime.provider.steps = [calls(('filter_catalog', dict(category='food', search_text='', limit=5))), content()]
    result = runtime.turn(MESSAGE)
    assert not result['ui_payload']['products'] and not runtime.writes
    assert 'chưa tìm thấy' in result['reply'].lower() and 'bánh matcha' in result['reply']
    assert 'loại bánh khác' in result['reply']


def test_enough_matching_cakes_has_no_false_shortfall(runtime, monkeypatch):
    rows = [dict(ROWS[0], product_id=str(301+i), product_name=f'Bánh Matcha {i}') for i in range(5)]
    install_catalog(runtime, monkeypatch, rows=rows)
    runtime.provider.steps = [calls(('filter_catalog', dict(category='food', search_text='', limit=5))), content()]
    result = runtime.turn(MESSAGE)
    assert len(result['ui_payload']['products']) == 5 and 'chưa đủ' not in result['reply']


def test_model_small_limit_is_corrected_to_requested_count(runtime, monkeypatch):
    install_catalog(runtime, monkeypatch)
    runtime.provider.steps = [calls(('filter_catalog', dict(category='food', search_text='matcha', limit=1))), content()]
    result = runtime.turn(MESSAGE)
    assert runtime.reads[0][1]['limit'] == 5
    assert len(result['ui_payload']['products']) == 2


def test_explicit_alternative_request_can_browse_other_cakes(runtime, monkeypatch):
    install_catalog(runtime, monkeypatch)
    runtime.provider.steps = [calls(('filter_catalog', dict(category='food', search_text='', limit=5))), content()]
    result = runtime.turn('cho tôi xem 5 món bánh bất kỳ nhé')
    assert len(result['ui_payload']['products']) == 5
    assert '2 món bánh matcha' not in result['reply']


def test_model_subset_cannot_hide_available_matches_when_customer_requested_five(runtime, monkeypatch):
    install_catalog(runtime, monkeypatch)
    runtime.provider.steps = [calls(('filter_catalog', dict(category='food', search_text='matcha', limit=5))),
        content(display_product_ids=['201'], display_product_count=1)]
    result = runtime.turn(MESSAGE)
    assert [row['product_id'] for row in result['ui_payload']['products']] == ['201', '202']
    assert '2 món bánh matcha' in result['reply']


def test_catalog_error_is_not_presented_as_zero_matching_cakes(runtime, monkeypatch):
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'filter_catalog', lambda *args:
        dict(status='error', message='Chưa thể tra cứu menu lúc này.'))
    runtime.provider.steps = [calls(('filter_catalog', dict(category='food', search_text='matcha', limit=5))), content()]
    result = runtime.turn(MESSAGE)
    assert not result['ui_payload']['products']
    assert 'chưa tìm thấy' not in result['reply'].lower() and 'chưa đủ' not in result['reply'].lower()


def test_specific_matcha_cake_family_is_not_widened_to_mochi(runtime, monkeypatch):
    install_catalog(runtime, monkeypatch, respect_filters=False)
    runtime.provider.steps = [calls(('filter_catalog', dict(category='food', search_text='matcha', limit=5))), content()]
    result = runtime.turn('cho tôi xem 5 món bánh trung thu matcha')
    assert runtime.reads[0][1]['search_text'] == 'banh trung thu matcha'
    assert [row['product_id'] for row in result['ui_payload']['products']] == ['202']
    assert '1 món bánh trung thu matcha' in result['reply']


def test_drink_and_cake_comparison_keeps_independent_scopes(runtime, monkeypatch):
    install_catalog(runtime, monkeypatch)
    runtime.provider.steps = [calls(
        ('filter_catalog', dict(category='food', search_text='matcha', limit=5)),
        ('filter_catalog', dict(category='drink', search_text='matcha', limit=5))),
        content(display_product_ids=['201', '202', '206'], display_product_count=3)]
    result = runtime.turn('cho tôi xem nước matcha và bánh matcha')
    assert [row['product_id'] for row in result['ui_payload']['products']] == ['201', '202', '206']
    assert 'chưa đủ' not in result['reply']
