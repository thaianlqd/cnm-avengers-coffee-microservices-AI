from copy import deepcopy
import pytest
from hybrid_support import runtime, hybrid, command as c, envelope as e, send, pending
from test_hybrid_product_reference_spaces import grouped, capture
from src.agents.agent_memory import ConversationMemory
from src.agents.hybrid_command_schema import validate_envelope
from src.agents.hybrid_discovery import merge
from src.common import cart_manager
from src.function_calling.tools import TOOL_EXECUTORS


def catalog_rows(rt, drinks=7, food=7):
    rt.products[:] = [{**rt.products[0], 'product_id': f'{g}{i}', 'product_name': f'{g} {i}', 'category': g}
                     for g, count in [('drink', drinks), ('food', food)] for i in range(1, count + 1)]


@pytest.mark.parametrize('args,counts', [({}, [3, 2]), ({'count': 6}, [3, 3]),
    ({'group_counts': {'drink': 2, 'food': 3}}, [2, 3]), ({'count': 2}, [1, 1])])
def test_explicit_multi_group_server_allocation(hybrid, args, counts):
    catalog_rows(hybrid)
    result = send(hybrid, c('DISCOVER_PRODUCTS', scope='all', requested_groups=['drink', 'food'], **args))
    rows = result['ui_payload']['products']
    assert not result['error'] and not hybrid.writes and result['provider_request_count'] == 1
    assert [sum(r['menu_bucket'] == g for r in rows) for g in ('drink', 'food')] == counts
    for group in ('drink', 'food'):
        selected = [r for r in rows if r['menu_bucket'] == group]
        assert [r['display_index'] for r in selected] == list(range(1, len(selected) + 1))
        assert [r['group_display_index'] for r in selected] == [r['display_index'] for r in selected]
        for row in selected:
            assert f"{row['display_index']}. **{row['product_name']}**" in result['reply']
    assert 'nước số 1' in result['reply'] and 'bánh số 1' in result['reply']


def test_sparse_group_redistributes_spare_total_without_losing_available_group(hybrid):
    catalog_rows(hybrid, drinks=1, food=8)
    rows = send(hybrid, c('DISCOVER_PRODUCTS', scope='all', requested_groups=['drink', 'food']))['ui_payload']['products']
    assert [r['menu_bucket'] for r in rows] == ['drink', 'food', 'food', 'food', 'food']


def test_explicit_per_group_limit_does_not_redistribute(hybrid):
    catalog_rows(hybrid, drinks=1, food=8)
    rows = send(hybrid, c('DISCOVER_PRODUCTS', scope='all', requested_groups=['drink', 'food'],
        group_counts={'drink': 3, 'food': 2}))['ui_payload']['products']
    assert len(rows) == 3 and sum(r['menu_bucket'] == 'food' for r in rows) == 2


def test_unavailable_group_is_honest_and_invalidates_old_current_list(hybrid, monkeypatch):
    grouped(hybrid)
    original = TOOL_EXECUTORS['filter_catalog']
    monkeypatch.setitem(TOOL_EXECUTORS, 'filter_catalog', lambda args, sid: {'status': 'business_unavailable'}
        if args['category'] == 'food' else original(args, sid))
    result = send(hybrid, c('DISCOVER_PRODUCTS', scope='all', requested_groups=['drink', 'food']))
    assert result['failure_class'] == 'DISCOVERY_COVERAGE' and 'Chưa xác minh được bánh' in result['reply']
    assert capture(hybrid).product_display_snapshot.collection('food')['rows'] == []
    assert not cart_manager.get_checkout_prefs(hybrid.sid).get('hybrid_discovery_state')


@pytest.mark.parametrize('status', ['ok', 'business_unavailable'])
def test_wrong_group_or_unverified_rows_never_count_as_requested_coverage(hybrid, monkeypatch, status):
    original = TOOL_EXECUTORS['filter_catalog']
    monkeypatch.setitem(TOOL_EXECUTORS, 'filter_catalog', lambda args, sid: {'status': status, 'products': hybrid.products[:1]}
        if args['category'] == 'food' else original(args, sid))
    result = send(hybrid, c('DISCOVER_PRODUCTS', scope='all', requested_groups=['drink', 'food']))
    assert result['failure_class'] == 'DISCOVERY_COVERAGE'
    assert all(r['menu_bucket'] == 'drink' for r in result['ui_payload']['products'])
    assert not capture(hybrid).product_display_snapshot.collection('food')['rows']


def test_empty_refresh_is_empty_while_unrequested_group_survives(hybrid):
    grouped(hybrid)
    hybrid.products[:] = hybrid.products[:2]
    result = send(hybrid, c('DISCOVER_PRODUCTS', scope='food'))
    turn = capture(hybrid)
    assert not result['ui_payload']['products'] and 'Chưa tìm thấy' in result['reply']
    assert turn.product_display_snapshot.collection('food')['rows'] == []
    assert len(turn.product_display_snapshot.collection('drink')['rows']) == 2
    selected = send(hybrid, c('SELECT_PRODUCTS', mode='EXPLICIT', references=[{'kind': 'group_ordinal', 'group': 'drink', 'index': 1}]))
    assert not selected['error'] and pending(hybrid)[0]['product_id'] == '101'
    bad = send(hybrid, c('SELECT_PRODUCTS', mode='EXPLICIT', references=[{'kind': 'group_ordinal', 'group': 'food', 'index': 1}]))
    assert bad['error'] == 'unknown_reference' and bad['provider_request_count'] == 1


def test_refreshed_group_replaces_prior_generation(hybrid):
    grouped(hybrid)
    old = capture(hybrid).product_display_snapshot.collection('drink')
    hybrid.products[0] = {**hybrid.products[0], 'product_id': 'new', 'product_name': 'New drink'}
    send(hybrid, c('DISCOVER_PRODUCTS', scope='drink'))
    current = capture(hybrid).product_display_snapshot.collection('drink')
    assert current['generation'] > old['generation']
    assert current['fingerprint'] != old['fingerprint'] and current['rows'][0]['product_id'] == 'new'
    selected = send(hybrid, c('SELECT_PRODUCTS', mode='EXPLICIT', references=[{'kind': 'group_ordinal', 'group': 'drink', 'index': 1}]))
    assert not selected['error'] and pending(hybrid)[0]['product_id'] == 'new'


def test_browse_delta_preserves_omissions_and_only_clears_requested_fields(hybrid):
    first = {'scope': 'drink', 'query': 'Cà Phê', 'count': 2, 'max_price': 90000, 'basis': 'sales', 'period': 'week'}
    send(hybrid, c('DISCOVER_PRODUCTS', **first))
    send(hybrid, c('REFINE_DISCOVERY', set={'basis': 'price', 'direction': 'ascending'}))
    state = cart_manager.get_checkout_prefs(hybrid.sid)['hybrid_discovery_state']
    assert state == {**first, 'basis': 'price', 'direction': 'ascending'}
    send(hybrid, c('REFINE_DISCOVERY', clear=['max_price'], add_groups=['food']))
    state = cart_manager.get_checkout_prefs(hybrid.sid)['hybrid_discovery_state']
    assert state['requested_groups'] == ['drink', 'food'] and state['query'] == 'Cà Phê' and 'max_price' not in state
    send(hybrid, c('REFINE_DISCOVERY', remove_groups=['food'], set={'count': 3}))
    state = cart_manager.get_checkout_prefs(hybrid.sid)['hybrid_discovery_state']
    assert state['scope'] == 'drink' and state['count'] == 3 and not hybrid.writes


def test_delta_is_not_business_authority_and_requires_prior_browse():
    assert merge({}, {'set': {'count': 2}})[1] == 'discovery_state_required'
    original = {'scope': 'all', 'requested_groups': ['drink', 'food'], 'max_price': 90000}
    merged, error = merge(original, {'set': {'scope': 'drink'}})
    assert not error and merged == {'scope': 'drink', 'max_price': 90000} and original['scope'] == 'all'


@pytest.mark.parametrize('intent,args', [
    ('DISCOVER_PRODUCTS', {'scope': 'all', 'requested_groups': ['drink', 'food'], 'count': 1}),
    ('DISCOVER_PRODUCTS', {'scope': 'drink', 'requested_groups': ['food']}),
    ('DISCOVER_PRODUCTS', {'scope': 'all', 'requested_groups': ['drink', 'food'], 'group_counts': {'drink': 2}}),
    ('DISCOVER_PRODUCTS', {'scope': 'all', 'requested_groups': ['drink', 'drink']}),
    ('REFINE_DISCOVERY', {'set': {'payment_method': 'QR'}}),
    ('REFINE_DISCOVERY', {'set': {'max_price': 10}, 'clear': ['max_price']}),
    ('REFINE_DISCOVERY', {'add_groups': ['food'], 'remove_groups': ['food']}),
    ('REFINE_DISCOVERY', {'set': {}}),
])
def test_discovery_contract_rejects_conflicting_or_authoritative_fields(intent, args):
    assert validate_envelope(e(c(intent, **args)))[1]


def test_durable_display_recovers_after_memory_eviction_and_new_order_resets(hybrid):
    send(hybrid, c('DISCOVER_PRODUCTS', scope='all', requested_groups=['drink', 'food']))
    expected = capture(hybrid).product_display_snapshot.collections_context()
    ConversationMemory(hybrid.redis).reset(hybrid.sid)
    assert capture(hybrid).product_display_snapshot.collections_context() == expected
    cart_manager.set_checkout_context(hybrid.sid, completed_order_id='new-order')
    turn = capture(hybrid)
    assert not turn.rows('products') and all(not rows for rows in turn.product_display_snapshot.collections_context().values())


def test_explicit_conversation_reset_clears_browse_hints_and_preserves_real_cart(hybrid):
    before = deepcopy(cart_manager.get_cart(hybrid.sid)['items'])
    send(hybrid, c('DISCOVER_PRODUCTS', scope='all', requested_groups=['drink', 'food']))
    remaining = cart_manager.reset_conversation_draft(hybrid.sid)
    ConversationMemory(hybrid.redis).reset(hybrid.sid)  # Existing HTTP reset does both.
    assert not set(remaining) & {'hybrid_product_display', 'hybrid_discovery_state', 'last_product_suggestions'}
    assert not capture(hybrid).rows('products')
    assert cart_manager.get_cart(hybrid.sid)['items'] == before
