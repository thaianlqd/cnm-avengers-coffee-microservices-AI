from copy import deepcopy
import pytest
from hybrid_support import runtime, hybrid, command as c, send, no_cart, pending
from src.agents.customer_ui_actions import product_snapshot, configuration_payload, validate_action
from src.common import cart_manager

def select(rt, ids=None, turn_id='ui-select'):
    no_cart(rt)
    return rt.turn('Chọn các món để thêm vào giỏ', client_message_id=turn_id, ui_action={
        'type': 'select_products', 'snapshot': product_snapshot(rt.products),
        'items': [{'product_id': value, 'quantity': 1} for value in (ids or ['101', '102'])],
    })

def configure(rt, payload, items, turn_id='ui-configure'):
    return rt.turn('Áp dụng các tùy chọn đã chọn và thêm các món vào giỏ', client_message_id=turn_id,
        ui_action={'type': 'configure_products', 'snapshot': payload['snapshot'], 'items': items})

def test_ui_multi_select_never_calls_provider_and_publishes_menu_options(hybrid):
    result = select(hybrid)
    assert not result['error'] and not hybrid.provider.requests and not hybrid.writes
    config = result['ui_payload']['product_configuration']
    assert [row['product_id'] for row in config['items']] == ['101', '102']
    assert config['snapshot'] and all(row['groups'] for row in config['items'])
    assert not result['checkout_payload']

def test_ui_defaults_for_two_products_writes_exactly_once_with_no_provider(hybrid):
    result = select(hybrid)
    config = result['ui_payload']['product_configuration']
    items = [{'product_id': row['product_id'], 'options': {}, 'use_defaults': True} for row in config['items']]
    result = configure(hybrid, config, items)
    assert not result['error'] and not hybrid.provider.requests
    assert len(hybrid.writes) == 2 and not pending(hybrid)
    assert all(not row[1].get('toppings') for row in hybrid.writes)
    assert not result['checkout_payload']
    assert configure(hybrid, config, items) == result
    assert len(hybrid.writes) == 2

def test_ui_exact_tick_choices_quantity_and_optional_empty_toppings(hybrid):
    result = select(hybrid, ['101'])
    config = result['ui_payload']['product_configuration']
    result = configure(hybrid, config, [{'product_id': '101', 'quantity': 3, 'options': {'size': 'L', 'toppings': []}}])
    assert not result['error'] and len(hybrid.writes) == 1
    assert hybrid.writes[0][1]['size'] == 'L' and hybrid.writes[0][1]['quantity'] == 3
    assert hybrid.writes[0][1]['toppings'] == [] and not hybrid.provider.requests

@pytest.mark.parametrize('bad', [
    {'product_id': '101', 'options': {'size': 'FAKE'}},
    {'product_id': '101', 'options': {}},
    {'product_id': '101', 'options': {'size': 'M', 'toppings': ['FAKE']}},
])
def test_ui_invalid_or_missing_options_reject_before_any_batch_write(hybrid, bad):
    config = select(hybrid)['ui_payload']['product_configuration']
    result = configure(hybrid, config, [{'product_id': '102', 'use_defaults': True, 'options': {}}, bad])
    assert result['error'] in {'ui_option_not_allowed', 'ui_required_option_missing'}
    assert not hybrid.writes and not hybrid.provider.requests and len(pending(hybrid)) == 2

def test_ui_stale_pending_snapshot_and_wrong_product_fail_without_writes(hybrid):
    config = select(hybrid)['ui_payload']['product_configuration']
    wrong = configure(hybrid, config, [{'product_id': '999', 'use_defaults': True}], 'wrong-id')
    assert wrong['error'] == 'ui_product_not_visible' and not hybrid.writes
    stale = deepcopy(config); stale['snapshot'] = 'stale'
    result = configure(hybrid, stale, [{'product_id': '101', 'use_defaults': True}], 'stale-options')
    assert result['error'] == 'ui_snapshot_stale' and not hybrid.writes and not hybrid.provider.requests

def test_ui_action_changes_cannot_reuse_a_completed_turn_id(hybrid):
    config = select(hybrid)['ui_payload']['product_configuration']
    configure(hybrid, config, [{'product_id': '101', 'use_defaults': True}])
    before = len(hybrid.writes)
    result = configure(hybrid, config, [{'product_id': '102', 'use_defaults': True}])
    assert result['error'] == 'client_message_id_conflict' and len(hybrid.writes) == before

def test_configuration_contract_never_exposes_private_state(hybrid):
    rows = [{**row, 'private_token': 'SECRET'} for row in pending(hybrid)]
    assert 'SECRET' not in str(configuration_payload(rows))


def test_published_grouped_cards_snapshot_round_trips_without_provider_selection(hybrid):
    result = send(hybrid, c('DISCOVER_PRODUCTS', scope='all', requested_groups=['drink', 'food']))
    payload = result['ui_payload']
    before = len(hybrid.provider.requests)
    result = hybrid.turn('Chọn nước và bánh đã tick', ui_action={
        'type': 'select_products', 'snapshot': payload['product_selection_snapshot'],
        'items': [{'product_id': row['product_id']} for row in payload['products']],
    })
    assert not result['error'] and len(hybrid.provider.requests) == before
    assert {row['product_id'] for row in result['ui_payload']['product_configuration']['items']} == {'101', '102', '103'}


def test_more_than_four_explicit_configurations_do_not_relax_model_command_limit(hybrid):
    from hybrid_support import visible
    from src.agents.hybrid_command_schema import validate_envelope
    hybrid.products.extend([{**hybrid.products[0], 'product_id': str(i), 'product_name': f'Extra Coffee {i}'} for i in [104, 105]])
    visible(hybrid, products=hybrid.products)
    config = select(hybrid, [row['product_id'] for row in hybrid.products])['ui_payload']['product_configuration']
    result = configure(hybrid, config, [{'product_id': row['product_id'], 'use_defaults': True, 'options': {}} for row in config['items']])
    assert not result['error'] and len(hybrid.writes) == 5 and not hybrid.provider.requests
    value, error, _ = validate_envelope({'kind': 'commands', 'message': None, 'commands': [c('READ_CART')] * 5})
    assert value is None and error

@pytest.mark.parametrize('action', [
    {'type': 'confirm_checkout', 'snapshot': 'x', 'items': [{'product_id': '101'}]},
    {'type': 'select_products', 'snapshot': 'x', 'items': [{'product_id': '101', 'quantity': True}]},
    {'type': 'select_products', 'snapshot': 'x', 'items': [{'product_id': '101'}, {'product_id': '101'}]},
    {'type': 'configure_products', 'snapshot': 'x', 'items': [{'product_id': '101', 'options': {'price': 1}}]},
])
def test_ui_actions_cannot_invent_prices_or_checkout_authority(action):
    with pytest.raises(ValueError): validate_action(action)
