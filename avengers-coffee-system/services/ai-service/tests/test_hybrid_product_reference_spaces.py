"""Reference-space invariants through frozen snapshots and the guarded entry point."""
from copy import deepcopy
import json
import pytest
from hybrid_support import runtime, hybrid, command as c, envelope as e, send, visible, pending, no_cart
from src.agents.agent_context import build_context
from src.agents.agent_memory import ConversationMemory, snapshot
from src.agents.hybrid_command_schema import validate_envelope
from src.agents.hybrid_workflow import TurnContext, GroundingError, ground
from src.agents.product_display import numbered_products
from src.agents.product_collections import publication
from src.common import cart_manager


def grouped(rt):
    rows = numbered_products(rt.products, grouped=True)
    groups = {'products': snapshot('products', rows), **{g + '_products': snapshot('products',
        [r for r in rows if r['menu_bucket'] == g]) for g in ('drink', 'food')}}
    memory = ConversationMemory(rt.redis).load(rt.sid)
    memory['visible_snapshots'].update(groups)
    memory['product_display'] = publication({}, groups, ['drink', 'food'], 'fixture')
    ConversationMemory(rt.redis).save(rt.sid, memory)
    return rows


def capture(rt):
    return TurnContext.capture(build_context(rt.sid, ConversationMemory(rt.redis).load(rt.sid), project=False)[0])


@pytest.mark.parametrize('ref', [
    {'kind': 'group_ordinal', 'index': 1}, {'kind': 'group_ordinal', 'group': 'cart', 'index': 1},
    {'kind': 'group_ordinal', 'group': 'drink', 'index': True},
    {'kind': 'group_ordinal', 'group': 'drink', 'index': 1.5},
    {'kind': 'group_ordinal', 'group': 'food', 'index': 0},
    {'kind': 'group_ordinal', 'group': 'food', 'index': 1, 'value': '101'},
    {'kind': 'ordinal', 'group': 'food', 'index': 1},
    {'kind': 'focus', 'group': 'drink'}, {'kind': 'name', 'value': 'Cake', 'group': 'food'},
    {'kind': 'group_ordinal', 'group': 'food', 'index': 1, 'product_id': '103'},
])
def test_scoped_shape_is_closed(ref):
    assert validate_envelope(e(c('SELECT_PRODUCTS', mode='EXPLICIT', references=[ref])))[1]


@pytest.mark.parametrize('intent,args', [
    ('SET_PAYMENT', {}), ('SELECT_BRANCH', {}), ('SELECT_PROFILE_ADDRESS', {}),
    ('SELECT_LOCATION_CANDIDATE', {}), ('CHOOSE_VOUCHER', {}), ('READ_ORDER', {}),
    ('CONFIGURE_PRODUCT', {'options': {'size': 'L'}}),
])
def test_product_group_ref_cannot_enter_other_domains(intent, args):
    assert validate_envelope(e(c(intent, target={'kind': 'group_ordinal', 'group': 'drink', 'index': 1}, **args)))[1]


@pytest.mark.parametrize('group,index,key', [('drink', 1, '101'), ('drink', 2, '102'), ('food', 1, '103')])
def test_scoped_reference_grounds_only_its_frozen_group(hybrid, group, index, key):
    grouped(hybrid)
    turn = capture(hybrid)
    assert ground(turn, 'products', {'kind': 'group_ordinal', 'group': group, 'index': index})['product_id'] == key
    model = json.dumps(turn.model_context(), ensure_ascii=False)
    assert 'product_id' not in model and '"101"' not in model
    assert turn.product_display_snapshot.collection(group)['generation'] == 1


def test_exact_drink_one_food_one_quantity_attachment(hybrid):
    no_cart(hybrid); grouped(hybrid)
    result = send(hybrid, c('SELECT_PRODUCTS', mode='EXPLICIT', references=[
        {'kind': 'group_ordinal', 'group': 'drink', 'index': 1},
        {'kind': 'group_ordinal', 'group': 'food', 'index': 1, 'quantity': 2}]),
        text='cho tôi nước số 1 và bánh số 1 2 cái')
    assert not result['error'] and result['provider_request_count'] == 1
    assert [(r['product_id'], r['quantity']) for r in pending(hybrid)] == [('101', 1), ('103', 2)]
    assert not hybrid.writes


def test_deep_immutability_and_collection_fingerprint(hybrid):
    grouped(hybrid)
    turn = capture(hybrid)
    rows = turn.product_display_snapshot.collection('food')['rows']; rows[0]['product_id'] = 'forged'
    visible(hybrid, food_products=[])
    assert ground(turn, 'products', {'kind': 'group_ordinal', 'group': 'food', 'index': 1})['product_id'] == '103'
    # An externally corrupted/truncated persisted list cannot use valid metadata.
    broken = capture(hybrid)
    assert not broken.product_display_snapshot.collection('food')['valid']
    with pytest.raises(GroundingError):
        ground(broken, 'products', {'kind': 'group_ordinal', 'group': 'food', 'index': 1})


def test_plain_ordinal_ambiguity_never_picks_group(hybrid):
    grouped(hybrid)
    with pytest.raises(GroundingError, match='ambiguous_reference'):
        ground(capture(hybrid), 'products', {'kind': 'ordinal', 'index': 1})
    # The interpreter can require clarification without any mutation/repair.
    hybrid.provider.steps = [{'content': json.dumps(e(kind='clarification', message='Nước hay bánh?'))}]
    result = hybrid.turn('lấy số 1')
    assert not result['error'] and not hybrid.writes and not pending(hybrid)


def test_legacy_global_numbers_stay_global(hybrid):
    assert ground(capture(hybrid), 'products', {'kind': 'ordinal', 'index': 3})['product_id'] == '103'


def test_truly_duplicate_scoped_product_rejected_without_repair(hybrid):
    grouped(hybrid)
    result = send(hybrid, c('SELECT_PRODUCTS', mode='EXPLICIT', references=[
        {'kind': 'group_ordinal', 'group': 'food', 'index': 1},
        {'kind': 'group_ordinal', 'group': 'food', 'index': 1}]))
    assert result['error'] == 'duplicate_selection' and result['provider_request_count'] == 1
    assert not pending(hybrid) and not hybrid.writes


def test_grouped_all_visible_is_exact_global_not_retained_union(hybrid):
    grouped(hybrid)
    # Food-only current view retains prior drinks but ALL_VISIBLE takes only food.
    send(hybrid, c('DISCOVER_PRODUCTS', scope='food'))
    result = send(hybrid, c('SELECT_PRODUCTS', mode='ALL_VISIBLE'))
    assert not result['error'] and [r['product_id'] for r in pending(hybrid)] == ['103']


def test_grouped_click_is_zero_inference(hybrid):
    grouped(hybrid)
    result = hybrid.turn('Chọn món', selected_product_id='103')
    assert not result['error'] and result['provider_request_count'] == 0 and not hybrid.provider.requests
    assert [r['product_id'] for r in pending(hybrid)] == ['103']


@pytest.mark.parametrize('click', [False, True])
def test_other_menu_groups_do_not_break_exact_display_selection(hybrid, click):
    hybrid.products.append({**hybrid.products[0], 'product_id': '104', 'product_name': 'Another Menu item', 'category': 'unknown'})
    send(hybrid, c('DISCOVER_PRODUCTS', scope='all', count=4))
    before = len(hybrid.provider.requests)
    result = hybrid.turn('Chọn món', selected_product_id='104') if click else send(hybrid, c('SELECT_PRODUCTS', mode='ALL_VISIBLE'))
    assert not result['error']
    assert [r['product_id'] for r in pending(hybrid)] == (['104'] if click else ['101', '104', '102', '103'])
    assert len(hybrid.provider.requests) - before == (0 if click else 1)


def test_later_group_discovery_cannot_create_entry_reference(hybrid):
    visible(hybrid, products=hybrid.products[:2], food_products=[])
    result = send(hybrid, c('DISCOVER_PRODUCTS', scope='food'), c('SELECT_PRODUCTS', mode='EXPLICIT', references=[
        {'kind': 'group_ordinal', 'group': 'food', 'index': 1}]))
    assert result['error'] == 'unknown_reference' and not pending(hybrid) and not hybrid.reads and not hybrid.writes


def test_cart_and_pending_namespaces_are_unchanged_with_grouped_display(hybrid):
    grouped(hybrid)
    before = deepcopy(cart_manager.get_cart(hybrid.sid)['items'])
    send(hybrid, c('EDIT_CART', changes=[{'action': 'SET_QUANTITY', 'target': {'kind': 'cart_ordinal', 'index': 2}, 'quantity': 3}]))
    assert hybrid.writes[0][0:3] == ('update', '801', {'quantity': 3})
    assert cart_manager.get_cart(hybrid.sid)['items'][0] == before[0]
    send(hybrid, c('SELECT_PRODUCTS', mode='EXPLICIT', references=[{'kind': 'group_ordinal', 'group': 'food', 'index': 1}]))
    result = send(hybrid, c('CONFIGURE_PRODUCT', target={'kind': 'pending_ordinal', 'index': 1}, options={'size': 'M'}))
    assert not result['error'] and hybrid.writes[-1][1]['product_id'] == '103'
