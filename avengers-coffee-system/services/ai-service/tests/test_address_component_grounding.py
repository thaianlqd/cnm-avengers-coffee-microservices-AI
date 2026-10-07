"""Canonical address components, independent of model wording and map snippets."""
from copy import deepcopy

import pytest

from test_final_location_recovery_hardening import _provider
from test_semantic_control import compatibility_runtime, runtime, gateway_for, action
from test_checkout_guarded_contract import setup_checkout
from src.agents.agent_context import model_projection
from src.common import cart_manager
from src.function_calling.tools import branch_tools
from utils import geo


ADMIN = ', Phường 1, Bình Thạnh, Thành phố Hồ Chí Minh'
PLACE = {'lat': 10.8, 'lng': 106.7, 'address': '40 Đường Diên Hồng',
         'street': 'Đường Diên Hồng', 'ward': 'Phường 1',
         'district': 'Quận Bình Thạnh', 'city': 'Thành phố Hồ Chí Minh'}


@pytest.mark.parametrize('head', ['số 40 đường Diên Hồng', 'SỐ 40 Đường Diên Hồng',
    '40 Diên Hồng', '40 đường Diên Hồng'])
def test_house_and_road_designators_do_not_change_address_identity(monkeypatch, head):
    query = head + ADMIN
    _provider(monkeypatch, [{'ref_id': 'a'}], {'a': deepcopy(PLACE)})
    result = geo.resolve_location(query, 'address')
    assert result.status == 'ok' and (result.lat, result.lng) == (10.8, 106.7)


@pytest.mark.parametrize('number', ['40A', '40/3', 'B12', '40-2'])
def test_house_structure_is_preserved_with_optional_designator(monkeypatch, number):
    place = {**PLACE, 'address': f'{number} Diên Hồng'}
    _provider(monkeypatch, [{'ref_id': 'a'}], {'a': place})
    assert geo.resolve_location(f'số {number} đường Diên Hồng' + ADMIN, 'address').status == 'ok'


@pytest.mark.parametrize('changed', [
    {'address': '41 Đường Diên Hồng'}, {'ward': 'Phường 11'},
    {'district': 'Quận An Phú'}, {'city': 'Thành phố Minh Hải'},
    {'address': '40 Đường Diên Hồng Mới', 'street': 'Đường Diên Hồng Mới'},
    {'street': 'Đường Hoa Ban'},
])
def test_normalization_does_not_accept_wrong_house_street_or_admin(monkeypatch, changed):
    query = 'số 40 đường Diên Hồng' + ADMIN
    # Search echo is never resolved-place proof of street/house/admin identity.
    _provider(monkeypatch, [{'ref_id': 'a', 'display': query}], {'a': {**PLACE, **changed}})
    result = geo.resolve_location(query, 'address')
    assert result.status == 'rejected'
    assert result.rejection_reasons


def test_query_echo_cannot_override_a_different_resolved_street(monkeypatch):
    query = '40 Đường Diên Hồng' + ADMIN
    _provider(monkeypatch, [{'ref_id': 'a', 'display': query}], {'a': {
        **PLACE, 'address': '40 Đường Hoa Ban', 'street': 'Đường Hoa Ban'}})
    assert geo.resolve_location(query, 'address').status == 'rejected'


@pytest.mark.parametrize('number,expected', [('40', 'ok'), ('41', 'rejected')])
def test_structured_provider_house_number_is_authoritative(monkeypatch, number, expected):
    place = {key: value for key, value in PLACE.items() if key != 'address'}
    place['house_number'] = number
    _provider(monkeypatch, [{'ref_id': 'a'}], {'a': place})
    assert geo.resolve_location('số 40 đường Diên Hồng' + ADMIN, 'address').status == expected


@pytest.mark.parametrize('street,expected', [('3 Tháng 2', 'ok'), ('4 Tháng 2', 'rejected')])
def test_numbers_in_street_names_are_not_discarded_as_house_numbers(monkeypatch, street, expected):
    place = {**PLACE, 'address': '12 Đường ' + street, 'street': street}
    _provider(monkeypatch, [{'ref_id': 'a'}], {'a': place})
    assert geo.resolve_location('số 12 đường 3 Tháng 2' + ADMIN, 'address').status == expected


def test_rejected_house_keeps_relevant_provider_preview(monkeypatch):
    _provider(monkeypatch, [{'ref_id': 'a'}], {'a': {**PLACE, 'address': '42 Đường Diên Hồng'}})
    result = geo.resolve_location('số 40 đường Diên Hồng' + ADMIN, 'address')
    assert result.status == 'rejected' and len(result.candidates) == 1
    assert result.candidates[0]['accepted'] is False
    assert '42' in result.candidates[0]['display_address']


@pytest.mark.parametrize('model_uses_full_address', [False, True])
def test_missing_city_followup_reaches_real_geo_validator_without_repeating_address(
        runtime, monkeypatch, model_uses_full_address):
    setup_checkout(runtime, branch=False, summary=False, delivery='GIAO_TAN_NOI')
    _provider(monkeypatch, [{'ref_id': 'a'}, {'ref_id': 'b'}], {
        'a': {**PLACE, 'name': '40 Diên Hồng'},
        'b': {**PLACE, 'name': 'Cửa hàng tại 40 Diên Hồng'}})
    seen = []
    def nearest(location=None, **kwargs):
        seen.append(location)
        resolution = geo.resolve_location(location, 'address')
        return {'status': resolution.status, 'normalized_location': location,
                'location_candidates': list(resolution.candidates)}
    monkeypatch.setattr(branch_tools, 'execute_find_nearest_branch', nearest)
    partial = 'số 40 đường Diên Hồng, phường 1, Bình Thạnh'
    g = gateway_for(runtime, 'Giao đến ' + partial + ' giúp tôi')
    runtime.provider.plan([('customer_actions', {'actions': [action(g, 'resolve_location',
        {'location': partial, 'kind': 'address', 'for_checkout': True})]})])
    first = runtime.turn(g.user_message)
    assert 'tỉnh/thành phố' in first['reply'] and not seen
    assert cart_manager.get_checkout_prefs(runtime.sid)['partial_delivery_address']
    g = gateway_for(runtime, 'thành phố hồ chí minh ấy bạn')
    location = partial + ', Thành phố Hồ Chí Minh' if model_uses_full_address else 'Thành phố Hồ Chí Minh'
    runtime.provider.plan([('customer_actions', {'actions': [action(g, 'resolve_location',
        {'location': location, 'kind': 'address' if model_uses_full_address else 'area', 'for_checkout': True})]})])
    second = runtime.turn(g.user_message, client_message_id='city-followup')
    assert second['error'] is None and len(seen) == 1
    assert all(value in seen[0] for value in ('40', 'Diên Hồng', 'Bình Thạnh', 'Hồ Chí Minh'))
    assert len(second['ui_payload']['location_candidates']) == 2
    assert not cart_manager.get_checkout_prefs(runtime.sid).get('address_confirmed')
    assert runtime.turn(g.user_message, client_message_id='city-followup') == second and len(seen) == 1
    assert not runtime.writes


def test_partial_delivery_address_survives_model_history_compaction(runtime):
    partial = '12 Đường Hoa Ban, Phường An Bình'
    cart_manager.set_checkout_context(runtime.sid, delivery_type='GIAO_TAN_NOI',
        checkout_requested=True, partial_delivery_address=partial)
    g = gateway_for(runtime, 'Mình bổ sung thành phố nhé')
    view, _ = model_projection({**g.context, 'recent': [{'role': 'user', 'content': 'x' * 20000}]})
    assert view['business']['checkout']['partial_delivery_address'] == partial
    assert 'LOCATION' in view['business']['next_step']
