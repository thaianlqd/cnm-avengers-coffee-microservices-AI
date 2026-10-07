"""Named menu identity must precede incidental description mentions."""
from copy import deepcopy
import json
import pytest
from test_semantic_control import compatibility_runtime, runtime, gateway_for, action
from test_provider_outage_presentation import offline
from src.function_calling import tools
from src.function_calling.tools import product_tools
from src.rag import rag_service
from src.common import cart_manager


def step(payload):
    return {'tool_calls': [{'id': 'fixture', 'type': 'function', 'function': {
        'name': 'customer_actions', 'arguments': json.dumps(payload, ensure_ascii=False)}}]}


@pytest.mark.parametrize('query,names', [('cà phê sữa', ['Cà Phê Sữa Đá', 'Cà Phê Sữa Nóng']),
    ('berry tonic', ['Berry Tonic Iced', 'Berry Tonic Warm'])])
def test_named_request_uses_menu_before_description_mentions(runtime, monkeypatch, query, names):
    rows = [dict(runtime.products[i], product_name=name) for i, name in enumerate(names)]
    seen = []
    def catalog(**kwargs):
        seen.append(kwargs)
        return {'status': 'ok', 'products': deepcopy(rows)}
    monkeypatch.setattr(product_tools, 'execute_filter_catalog', catalog)
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'filter_catalog', lambda args, sid: catalog(**args))
    monkeypatch.setattr(rag_service, 'get_rag_service', lambda: pytest.fail('A matching Menu name must precede description mentions'))
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'get_recommendations', lambda args, sid:
        product_tools.execute_get_recommendations(**args))
    g = gateway_for(runtime, 'Một yêu cầu mua món có tên mới')
    runtime.provider.steps = [step({'actions': [action(g, 'get_recommendations', {
        'criteria': 'preferences', 'preference_query': query, 'preference_concepts': [query],
        'search_text': ''}, commitment='SELECTED')]})]
    result = runtime.turn(g.user_message)
    assert result['error'] is None
    assert [r['product_name'] for r in result['ui_payload']['products']] == names
    assert 'Dựa trên mô tả' not in result['reply']
    assert seen[0]['search_text'] == query and not runtime.writes
    assert len(runtime.provider.requests) == 1


def test_zero_argument_menu_read_accepts_omitted_args(runtime, monkeypatch):
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'get_menu_categories', lambda args, sid:
        {'status': 'ok', 'menu_categories': [{'category_id': 'new', 'category_name': 'New category'}]})
    g = gateway_for(runtime, 'à thôi cho tôi xem menu món đi')
    proposal = action(g, 'get_menu_categories', commitment='SELECTED')
    proposal.pop('args')
    runtime.provider.steps = [step({'actions': [proposal]})]
    result = runtime.turn(g.user_message)
    assert result['error'] is None and 'New category' in result['reply']
    assert len(runtime.provider.requests) == 1 and not runtime.writes


def test_corrected_menu_read_completes_protocol_repair(runtime, monkeypatch):
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'get_menu_categories', lambda args, sid:
        {'status': 'ok', 'menu_categories': [{'category_id': 'new', 'category_name': 'New category'}]})
    g = gateway_for(runtime, 'Show the menu please')
    a = action(g, 'get_menu_categories', commitment='QUESTION')
    runtime.provider.steps = [step({'actions': [a], 'extra': 'invalid'}), step({'actions': [a]})]
    result = runtime.turn(g.user_message)
    assert result['error'] is None and 'New category' in result['reply']
    assert len(runtime.provider.requests) == 2 and not runtime.writes


def test_category_browse_omitted_search_does_not_invent_a_filter(runtime):
    g = gateway_for(runtime, 'Browse drinks')
    runtime.provider.steps = [step({'actions': [action(g, 'filter_catalog',
        {'category': 'drink', 'planned_discovery_reads': 1}, commitment='QUESTION')]})]
    result = runtime.turn(g.user_message)
    assert result['error'] is None and result['ui_payload']['products']
    assert len(runtime.provider.requests) == 1 and runtime.reads[0][1]['search_text'] == ''


def test_protocol_empty_quotes_are_not_a_product_name(runtime):
    g = gateway_for(runtime, 'Browse the current category')
    runtime.provider.steps = [step({'actions': [action(g, 'filter_catalog',
        {'category': 'drink', 'search_text': "''", 'planned_discovery_reads': 1}, commitment='QUESTION')]})]
    result = runtime.turn(g.user_message)
    assert result['error'] is None and result['ui_payload']['products']
    assert runtime.reads[0][1]['search_text'] == '' and not runtime.writes


def test_missing_args_never_infers_a_write_or_overwrites_conflict(runtime):
    g = gateway_for(runtime, 'A new request')
    a = action(g, 'remove_cart_item')
    a.pop('args')
    result = g.customer_actions({'actions': [a]})
    assert result['recovery_kind'] == 'model_repair' and not runtime.writes


def test_change_from_taste_to_named_family_replaces_previous_cards(runtime, monkeypatch):
    g = gateway_for(runtime, 'Gợi ý theo vị rồi mình sẽ chọn')
    runtime.provider.steps = [step({'actions': [action(g, 'get_recommendations', {
        'criteria': 'preferences', 'category': 'food', 'preference_query': 'ngọt, mềm',
        'preference_concepts': ['ngọt', 'mềm']}, commitment='QUESTION')]})]
    first = runtime.turn(g.user_message)
    assert first['ui_payload']['products']
    rows = [dict(runtime.products[0], product_name='Cà Phê Sữa Đá'),
            dict(runtime.products[1], product_name='Cà Phê Sữa Nóng')]
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'filter_catalog', lambda args, sid:
        {'status': 'ok', 'products': deepcopy(rows)})
    g = gateway_for(runtime, 'à thôi cho tôi mua cà phê sữa đi')
    runtime.provider.steps = [step({'actions': [action(g, 'get_recommendations', {
        'criteria': 'preferences', 'preference_query': 'cà phê sữa',
        'preference_concepts': ['cà phê sữa'], 'search_text': ''}, commitment='SELECTED')]})]
    result = runtime.turn(g.user_message)
    assert [r['product_name'] for r in result['ui_payload']['products']] == [r['product_name'] for r in rows]
    assert not cart_manager.get_checkout_prefs(runtime.sid).get('pending_products') and not runtime.writes


def test_single_named_purchase_still_needs_explicit_option_selection(runtime, monkeypatch):
    row = runtime.products[0]
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'filter_catalog', lambda args, sid:
        {'status': 'ok', 'products': [deepcopy(row)]})
    g = gateway_for(runtime, 'Chọn tên món này')
    runtime.provider.steps = [step({'actions': [action(g, 'get_recommendations', {
        'criteria': 'preferences', 'preference_query': row['product_name'],
        'preference_concepts': [row['product_name']]}, commitment='SELECTED')]}),
        step({'actions': [action(g, 'get_product_options', {'product_id': row['product_id']}, commitment='SELECTED')]})]
    result = runtime.turn(g.user_message)
    assert result['error'] is None and len(runtime.provider.requests) == 2
    assert cart_manager.get_checkout_prefs(runtime.sid)['pending_products'][0]['product_id'] == row['product_id']
    assert not runtime.writes


def test_flat_selected_tool_argument_is_normalized_but_conflict_is_denied(runtime):
    g = gateway_for(runtime, 'Browse drinks')
    a = action(g, 'filter_catalog', {'planned_discovery_reads': 1}, commitment='QUESTION')
    a['category'] = 'drink'
    result = g.customer_actions({'actions': [a]})
    assert result['remaining_actions'] == 0 and runtime.reads[0][1]['category'] == 'drink'
    g = gateway_for(runtime, 'Browse again')
    a['args']['category'] = 'food'
    before = len(runtime.reads)
    denied = g.customer_actions({'actions': [a]})
    assert denied['recovery_kind'] == 'model_repair' and len(runtime.reads) == before


def test_corrected_empty_catalog_read_finishes_without_false_protocol_error(runtime, monkeypatch):
    monkeypatch.setitem(tools.TOOL_EXECUTORS, 'filter_catalog', lambda args, sid:
        {'status': 'not_found', 'products': [], 'message': 'Không có món khớp bộ lọc.'})
    g = gateway_for(runtime, 'Find this family')
    good = action(g, 'filter_catalog', {'search_text': 'absent', 'category': 'drink'}, commitment='QUESTION')
    runtime.provider.steps = [step({'actions': [good], 'invalid': True}), step({'actions': [good]}),
        {'content': json.dumps({'response_kind': 'consultation', 'reply': 'Không có món khớp bộ lọc.',
                              'mutation_claims': [], 'evidence_quotes': []})}]
    result = runtime.turn(g.user_message)
    assert result['error'] is None and not result['ui_payload']['products'] and not runtime.writes
