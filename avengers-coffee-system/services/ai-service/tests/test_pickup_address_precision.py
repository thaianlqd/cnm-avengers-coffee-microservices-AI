"""Reported pickup address replay; all network and provider calls are fake."""
from copy import deepcopy
import socket

import pytest

from test_llm_tool_orchestrator import runtime
from test_checkout_guarded_contract import gateway
from src.agents.customer_flow_presentation import branch_choices, location_choices
from src.common import cart_manager
from src.function_calling.tools import branch_tools
from utils import geo

ADDRESS = '42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Thành phố Hồ Chí Minh'


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail('This regression must never call a real provider or use a real key')
    monkeypatch.setattr(socket.socket, 'connect', forbidden)
    monkeypatch.setattr(socket.socket, 'connect_ex', forbidden)
    monkeypatch.setattr(socket, 'getaddrinfo', forbidden)
    monkeypatch.setattr(geo.httpx.Client, 'get', forbidden)
    monkeypatch.setenv('VIETMAP_API_KEY', 'fixture-map-key')


def rejected_candidates():
    return geo.LocationResolution('rejected', match_type='address', candidates=tuple(
        dict(normalized_label=f'{number} Nguyễn Hữu Tiến',
             display_address=f'{number} Đường Nguyễn Hữu Tiến, Phường Tây Thạnh, Thành phố Hồ Chí Minh',
             admin_components=dict(ward='Phường Tây Thạnh', city='Thành phố Hồ Chí Minh'),
             lat=10.80 + i * 0.0001, lng=106.62, match_basis='address', accepted=False)
        for i, number in enumerate(['42/14', '42/16', '42'])))


@pytest.fixture
def branch_authority(monkeypatch):
    rows = [dict(ma_chi_nhanh='B1', ten_chi_nhanh='Quán Tây Thạnh',
                 dia_chi='Nguyễn Hữu Tiến, Phường Tây Thạnh', vi_do=10.801, kinh_do=106.62)]
    class Query:
        def mappings(self): return self
        def all(self): return deepcopy(rows)
    class Connection:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def execute(self, *args, **kwargs): return Query()
    class Engine:
        def connect(self): return Connection()
    monkeypatch.setattr(branch_tools, '_get_engine', lambda: Engine())
    monkeypatch.setattr(branch_tools, '_check_business_hours', lambda: None)
    monkeypatch.setattr(branch_tools, 'availability_for_branches', lambda engine, ids, items, schema:
        {bid: dict(is_fully_available=True, available=['Cà Phê Alpha'], unavailable=[],
                   unverified=[], product_statuses=[]) for bid in ids})
    seen = []
    monkeypatch.setattr(geo, 'resolve_location', lambda *args, **kwargs:
        seen.append(args) or rejected_candidates())
    return seen


@pytest.mark.parametrize('delivery', ['MANG_DI', 'TAI_CHO'])
def test_pickup_can_rank_nearby_branches_without_changing_saved_house(runtime, branch_authority, delivery):
    cart_manager.set_checkout_prefs(runtime.sid, delivery_type=delivery)
    result = branch_tools.execute_find_nearest_branch(ADDRESS, runtime.sid)
    assert result['status'] == 'need_branch_selection'
    assert result['normalized_location'] == ADDRESS
    assert len(branch_authority) == 1
    assert result['branches'][0]['distance_estimated'] is True
    assert result['branches'][0]['distance_basis'] == 'street_area_estimate'
    assert result['location_basis'] == 'street_area_estimate'
    assert not result.get('location_candidates')
    prefs = cart_manager.get_checkout_prefs(runtime.sid)
    assert not prefs.get('address_confirmed') and not prefs.get('delivery_address')
    reply = branch_choices(result)
    assert ADDRESS in reply and 'ước tính' in reply and 'địa chỉ giao' not in reply


def test_delivery_still_rejects_other_house_numbers(runtime, branch_authority):
    cart_manager.set_checkout_prefs(runtime.sid, delivery_type='GIAO_TAN_NOI')
    result = branch_tools.execute_find_nearest_branch(ADDRESS, runtime.sid)
    assert result['status'] == 'rejected' and not result.get('branches')
    assert len(branch_authority) == 1
    assert not cart_manager.get_checkout_prefs(runtime.sid).get('address_confirmed')


def test_saved_address_number_passes_pickup_purpose_through_read_only_adapter(runtime, branch_authority):
    cart_manager.set_checkout_prefs(runtime.sid, delivery_type='MANG_DI', payment_method='THANH_TOAN_KHI_NHAN_HANG')
    cart_manager.set_checkout_context(runtime.sid, checkout_requested=True,
        profile_location_offer=dict(address=ADDRESS, addresses=[dict(full_address=ADDRESS)], purpose='nearby_branches'))
    result = gateway(runtime, 'tôi đang ở địa chỉ số 1').dispatch('resolve_location',
        dict(location=ADDRESS, kind='address', for_checkout=True))
    assert result['status'] == 'ok' and result['branches']
    assert result['normalized_location'] == ADDRESS
    assert result['location_purpose'] == 'nearby_branches'
    assert len(branch_authority) == 1
    assert not cart_manager.get_cart(runtime.sid).get('branch_id')
    assert not cart_manager.get_checkout_prefs(runtime.sid).get('address_confirmed')


def test_scripted_chat_renders_nearby_branches_in_the_same_turn(runtime, branch_authority):
    cart_manager.set_checkout_prefs(runtime.sid, delivery_type='MANG_DI', payment_method='THANH_TOAN_KHI_NHAN_HANG')
    cart_manager.set_checkout_context(runtime.sid, checkout_requested=True,
        profile_location_offer=dict(address=ADDRESS, addresses=[dict(full_address=ADDRESS)], purpose='nearby_branches'))
    runtime.provider.plan([('resolve_location', dict(location=ADDRESS, kind='address', for_checkout=True))])
    result = runtime.turn('tôi đang ở địa chỉ số 1')
    assert result['error'] is None and result['ui_payload']['branches']
    assert ADDRESS in result['reply'] and 'ước tính' in result['reply']
    assert 'địa chỉ giao' not in result['reply']
    assert len(runtime.provider.requests) == 1 and len(branch_authority) == 1
    assert runtime.provider.requests[0]['max_tokens'] == 600
    assert not runtime.writes and not cart_manager.get_cart(runtime.sid).get('branch_id')


@pytest.mark.parametrize('field,value', [('ward', 'Phường Tây Thạnh Đông'), ('city', 'Thành phố Cần Thơ')])
def test_pickup_does_not_approximate_a_different_area(runtime, branch_authority, monkeypatch, field, value):
    resolution = rejected_candidates()
    candidates = deepcopy(resolution.candidates)
    for row in candidates:
        row['admin_components'][field] = value
    monkeypatch.setattr(geo, 'resolve_location', lambda *args, **kwargs:
        geo.LocationResolution('rejected', match_type='address', candidates=candidates))
    cart_manager.set_checkout_prefs(runtime.sid, delivery_type='MANG_DI')
    result = branch_tools.execute_find_nearest_branch(ADDRESS, runtime.sid)
    assert result['status'] == 'rejected' and not result.get('branches')


def test_pickup_location_prompt_does_not_claim_delivery_address():
    reply = location_choices(dict(status='rejected', normalized_location=ADDRESS,
        location_purpose='nearby_branches', location_candidates=list(rejected_candidates().candidates)))
    assert 'địa chỉ giao' not in reply and 'tìm quán' in reply


@pytest.mark.parametrize('change', ['different_street', 'spread', 'invalid_coordinate'])
def test_unrelated_or_unusable_candidates_do_not_create_a_nearby_origin(change):
    candidates = deepcopy(rejected_candidates().candidates)
    for i, row in enumerate(candidates):
        if change == 'different_street':
            row['display_address'] = row['display_address'].replace('Nguyễn Hữu Tiến', 'Nguyễn Hữu Tiến Đông')
        elif change == 'spread':
            row['lat'] = 10.8 + i * 0.2
        else:
            row['lat'] = float('nan')
    resolution = geo.LocationResolution('rejected', match_type='address', candidates=candidates)
    assert geo.nearby_address_origin(ADDRESS, resolution) is None


def test_company_address_prefix_can_supply_a_street_estimate():
    candidates = deepcopy(rejected_candidates().candidates)
    for row in candidates:
        row['display_address'] = 'Công Ty Rồng Tiến ' + row['display_address']
    result = geo.nearby_address_origin(ADDRESS,
        geo.LocationResolution('rejected', match_type='address', candidates=candidates))
    assert result and result.resolution_basis == 'street_area_estimate'
