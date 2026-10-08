import json
from copy import deepcopy
import pytest
from hybrid_support import command as c, envelope as e
from src.agents.hybrid_command_schema import validate_envelope, COMMAND_ARGS, NORMALIZATION_AUDIT


@pytest.mark.parametrize('raw', [
    '{broken', '[]', '{"kind":"social","kind":"commands","commands":[],"message":"Hi"}',
    '{"kind":"social","commands":[],"message":NaN}',
    e(c('UNKNOWN')), {'kind': 'commands', 'commands': [{'intent': 'READ_CART'}], 'message': None},
    e({'intent': 'READ_CART', 'args': {}, 'tool': 'get_cart'}), e(c('READ_CART', session_id='forged')),
    e(c('SELECT_PRODUCTS', mode='ALL_VISIBLE', references=[{'kind': 'ordinal', 'index': 1}])),
    e(c('SELECT_PRODUCTS', mode='EXPLICIT')), e(c('SELECT_PRODUCTS', mode='EXPLICIT', references=[])),
    e(c('SELECT_PRODUCTS', mode='EXPLICIT', references=[{'kind': 'ordinal'}])),
    e(c('SELECT_PRODUCTS', mode='EXPLICIT', references=[{'kind': 'ordinal', 'index': 0}])),
    e(c('SELECT_PRODUCTS', mode='EXPLICIT', references=[{'kind': 'ordinal', 'index': True}])),
    e(c('SELECT_PRODUCTS', mode='EXPLICIT', references=[{'kind': 'ordinal', 'index': 1.5}])),
    e(c('SELECT_PRODUCTS', mode='EXPLICIT', references=[{'kind': 'focus', 'value': 'invented'}])),
    e(c('SELECT_PRODUCTS', mode='EXPLICIT', references=[{'kind': 'cart_ordinal', 'index': 1}])),
    e(c('CONFIGURE_PRODUCT')), e(c('CONFIGURE_PRODUCT', reset_options=True, options={'size': 'L'})),
    e(c('CONFIGURE_PRODUCT', options={'price': 1})), e(c('SET_PAYMENT', target={'kind': 'name', 'value': 'QR'}, delivery_type='MANG_DI')),
    e(c('SET_FULFILLMENT', mode='delivery', payment='COD')), e(c('CHOOSE_VOUCHER', best=True, target={'kind': 'ordinal', 'index': 1})),
    e(c('CHOOSE_VOUCHER')), e(c('SKIP_VOUCHER'), c('CHOOSE_VOUCHER', best=True)),
    e(c('CONFIRM_CHECKOUT'), c('READ_CART')), e(c('CONFIRM_ORDER_CHANGE'), c('DISCARD_ORDER_CHANGE')),
    e(*[c('READ_CART') for _ in range(5)]), e(c('EDIT_CART', changes=[{'action': 'REMOVE', 'target': {'kind': 'ordinal', 'index': 1}, 'quantity': 2}])),
    e(c('EDIT_CART', changes=[{'action': 'SET_QUANTITY', 'target': {'kind': 'ordinal', 'index': 1}}])),
    e(c('EDIT_CART', changes=[{'action': 'CONFIGURE', 'target': {'kind': 'ordinal', 'index': 1}, 'options': {}}])),
    e(c('PREPARE_ORDER_CHANGE', target={'kind': 'singleton'}, action='CANCEL', changes=[{'action': 'REMOVE', 'target': {'kind': 'ordinal', 'index': 1}}])),
    e(c('PREPARE_ORDER_CHANGE', target={'kind': 'singleton'}, action='UPDATE')),
    e(c('READ_CART'), kind='social', message='Done'), e(kind='commands'), e(kind='social', message=None),
    e(c('SET_PAYMENT', target={'kind': 'name', 'value': 'QR'}), c('SET_PAYMENT', target={'kind': 'name', 'value': 'COD'})),
    e(c('SELECT_PROFILE_ADDRESS', target={'kind': 'singleton'}), c('PROVIDE_LOCATION', value='Elsewhere', kind='area')),
    e(c('READ_CART'), message='Cart total is 1'), {**e(c('READ_CART')), 'workflow': 'SUMMARY'},
])
def test_closed_interpreter_contract_rejects_unsafe_shapes(raw):
    value, error, _ = validate_envelope(raw)
    assert value is None and error and error['failure_code']


@pytest.mark.parametrize('references', [None, []])
def test_all_visible_first_class_without_synthetic_ordinals(references):
    args = {'mode': 'ALL_VISIBLE'}
    if references is not None:
        args['references'] = references
    parsed, error, _ = validate_envelope(e(c('SELECT_PRODUCTS', **args)))
    assert not error and parsed['commands'][0]['args'] == args


def test_only_lossless_normalization_is_audited():
    raw = json.dumps({'kind': 'commands', 'commands': c('SELECT_PRODUCTS', mode='EXPLICIT',
        references=[{'kind': 'ordinal', 'index': '3'}]), 'message': None})
    value, error, rules = validate_envelope(raw)
    assert not error and value['commands'][0]['args']['references'][0]['index'] == 3
    assert set(rules) == set(NORMALIZATION_AUDIT)
    assert len(COMMAND_ARGS) == 31


def test_compound_explicit_choices_are_allowed_but_final_confirmation_standalone():
    valid = e(c('SET_FULFILLMENT', mode='delivery'), c('SET_PAYMENT', target={'kind': 'name', 'value': 'QR'}))
    assert validate_envelope(valid)[1] is None
