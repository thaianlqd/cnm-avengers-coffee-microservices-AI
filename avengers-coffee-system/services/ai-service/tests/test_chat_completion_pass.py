"""Menu, contextual target, locality and wallet option regressions."""
import uuid
import pytest

from src.agents import agent_service, order_flow_graph
from src.agents.location_parser import parse_location, locality_matches
from src.common import cart_manager
from src.function_calling.tools import branch_tools, cart_tools, product_tools
from utils import geo


def test_balanced_menu_keeps_bucket_and_global_ordinals(monkeypatch):
    assert order_flow_graph._map_db_category_to_bucket('Frappe', 'Đồ uống') == 'drink'
    assert order_flow_graph._map_db_category_to_bucket('Americano') == 'unknown'
    session = 'menu-pass-' + uuid.uuid4().hex
    monkeypatch.setattr(cart_tools, 'sync_authoritative_cart', lambda sid: cart_manager.get_cart(sid))

    def recommendations(category, **_kwargs):
        if category == 'food':
            products = [{'product_id': f'F{i}', 'product_name': f'Bánh {i}', 'category': 'Bánh Mặn', 'final_price': 30000}
                        for i in range(1, 9)]
        else:
            products = [{'product_id': f'D{i}', 'product_name': f'Nước {i}', 'category': 'Americano', 'final_price': 40000}
                        for i in range(1, 7)] + [
                            {'product_id': 'D7', 'product_name': 'Cà Phê Muối Avenger', 'category': 'Americano', 'final_price': 40000},
                            {'product_id': 'D8', 'product_name': 'Frappe Matcha Tây Bắc', 'category': 'Frappe', 'final_price': 40000},
                        ]
        return {'status': 'ok', 'products': products}

    monkeypatch.setattr(product_tools, 'execute_get_recommendations', recommendations)
    result = order_flow_graph.run_order_flow(session, 'tôi muốn mua nước và bánh')
    cards = result['ui_payload']['products']
    snapshot = cart_manager.get_checkout_prefs(session)['last_product_suggestions']
    assert len(cards) == len(snapshot) == 16
    assert [item['product_id'] for item in cards] == [item['product_id'] for item in snapshot]
    assert [item['display_index'] for item in cards] == list(range(1, 17))
    assert [item['menu_bucket'] for item in cards] == ['food'] * 8 + ['drink'] * 8
    assert '9. Nước 1' in result['reply']
    assert '**Bánh & đồ ăn:**' in result['reply'] and '**Đồ uống:**' in result['reply']
    assert next(item for item in cards if item['product_id'] == 'D8')['menu_bucket'] == 'drink'
    assert next(item for item in cards if item['product_id'] == 'D7')['menu_bucket'] == 'drink'
    refs = order_flow_graph._resolve_structured_references(session, 'bánh số 1 và nước số 12')
    assert [item['product_id'] for item in refs] == ['F1', 'D4']


def test_focused_add_requires_reference_and_explicit_product_wins(monkeypatch):
    session = 'focus-pass-' + uuid.uuid4().hex
    cart_manager.set_checkout_context(session, last_product_focus={
        'product_id': 'B1', 'product_name': 'Bánh Trung Thu Matcha', 'category': 'food'})
    monkeypatch.setattr(order_flow_graph, '_load_active_product_targets', lambda: [
        {'product_id': 'D1', 'product_name': 'Americano Classic', 'category': 'drink'}])
    assert order_flow_graph._resolve_focused_add_target(session, 'oke thế cũng được thêm vào giỏ cho tôi luôn đi')['product_id'] == 'B1'
    assert order_flow_graph._resolve_focused_add_target(session, 'lấy luôn món đó')['product_id'] == 'B1'
    assert order_flow_graph._resolve_focused_add_target(session, 'thêm món') is None
    assert order_flow_graph._resolve_focused_add_target(session, 'mua đồ') is None
    refs = order_flow_graph._resolve_ask_more_targets(session, 'thêm Americano Classic')
    assert [item['product_id'] for item in refs] == ['D1']


def test_area_question_parses_only_locality():
    parsed = parse_location('tôi đang ở phường gò vấp, có địa chỉ nào gần đó ko')
    assert parsed.kind == 'area' and parsed.value.lower() == 'phường gò vấp'
    assert parse_location('tìm quán gần phường Tây Thạnh').kind == 'branch_query'
    assert parse_location('giao tới Gò Vấp').kind != 'address'


def test_locality_components_do_not_match_longer_names():
    assert locality_matches('Đường 1, Phường An Phú, Quận Thủ Đức', 'P. An Phu')
    assert not locality_matches('Đường 1, Phường An Phú Đông', 'phường An Phú')
    assert locality_matches('Highlands D9 Tân Phú, Quận Tân Phú', 'Q. Tan Phu')
    assert not locality_matches('Phường Tân Phú Trung', 'Tân Phú')


def test_card_selection_uses_catalog_identity_and_asks_for_choices(monkeypatch):
    session = 'card-options-' + uuid.uuid4().hex
    monkeypatch.setattr(cart_tools, 'sync_authoritative_cart', lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(order_flow_graph, '_load_active_product_targets', lambda: [
        {'product_id': '7', 'product_name': 'Frappe Matcha', 'category': 'drink'}])
    monkeypatch.setattr(product_tools, 'execute_get_product_options', lambda _name=None, **_kwargs: {
        'status': 'ok', 'product_id': '7', 'product_name': 'Frappe Matcha',
        'options': {'Size': ['Vừa'], 'Đá': ['Ít', 'Nhiều'], 'Đường': ['Ít', 'Nhiều'], 'Topping': ['Không', 'Trân châu']},
    })
    mutations = []
    monkeypatch.setattr(cart_tools, 'execute_add_to_cart', lambda **kwargs: mutations.append(kwargs))
    result = order_flow_graph.run_order_flow(session, 'Thêm tên sai vào giỏ',
        client_message_id='card-7', selected_product_id='7')
    assert 'Đá' in result['reply'] and 'Topping' in result['reply']
    assert not mutations
    assert cart_manager.get_checkout_prefs(session)['pending_products'][0]['product_id'] == '7'


def test_card_selection_without_choices_uses_same_safe_add_path(monkeypatch):
    session = 'card-fixed-' + uuid.uuid4().hex
    monkeypatch.setattr(cart_tools, 'sync_authoritative_cart', lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(order_flow_graph, '_load_active_product_targets', lambda: [
        {'product_id': '8', 'product_name': 'Bánh Matcha', 'category': 'food'}])
    monkeypatch.setattr(product_tools, 'execute_get_product_options', lambda _name=None, **_kwargs: {
        'status': 'ok', 'product_id': '8', 'product_name': 'Bánh Matcha', 'options': {},
    })
    monkeypatch.setattr(product_tools, 'execute_check_price_and_stock', lambda **_kwargs: {
        'status': 'ok', 'products': [{'product_id': '8', 'product_name': 'Bánh Matcha',
                                   'final_price': 49000, 'in_stock': True}],
    })
    mutations = []
    def add(**kwargs):
        mutations.append(kwargs)
        return {'status': 'ok', 'cart': {'total_price': 49000, 'branch_name': None},
                'persisted_line': {'product_id': '8', 'product_name': 'Bánh Matcha'}}
    monkeypatch.setattr(cart_tools, 'execute_add_to_cart', add)
    order_flow_graph.run_order_flow(session, 'Thêm món sai vào giỏ',
        client_message_id='card-8', selected_product_id='8')
    assert len(mutations) == 1 and mutations[0]['product_id'] == '8'


@pytest.mark.parametrize('coords', [(10.8, 106.7), None])
def test_pickup_area_prioritizes_exact_locality_and_supplements_nearby(monkeypatch, coords):
    session = 'branch-area-' + uuid.uuid4().hex
    cart_manager.set_checkout_context(session, delivery_type='MANG_DI')
    rows = [
        {'ma_chi_nhanh': 'GV1', 'ten_chi_nhanh': 'Quang Trung', 'dia_chi': 'Quang Trung, Quận Gò Vấp', 'vi_do': 10.8, 'kinh_do': 106.7},
        {'ma_chi_nhanh': 'GV2', 'ten_chi_nhanh': 'Phạm Văn Chiêu', 'dia_chi': 'Phạm Văn Chiêu, Gò Vấp', 'vi_do': 10.8, 'kinh_do': 106.7},
        {'ma_chi_nhanh': 'TD1', 'ten_chi_nhanh': 'Thủ Đức', 'dia_chi': 'Trần Não, Thủ Đức', 'vi_do': 10.8, 'kinh_do': 106.7},
    ]
    class Query:
        def mappings(self): return self
        def all(self): return rows
    class Connection:
        def __enter__(self): return self
        def __exit__(self, *_args): pass
        def execute(self, _sql): return Query()
    class Engine:
        def connect(self): return Connection()
    monkeypatch.setattr(branch_tools, '_get_engine', lambda: Engine())
    monkeypatch.setattr(branch_tools, '_check_business_hours', lambda: None)
    monkeypatch.setattr(branch_tools, 'validate_cart_at_branch', lambda *_args: {'unavailable': [], 'unverified': []})
    monkeypatch.setattr(geo, 'resolve_location', lambda *a: geo.LocationResolution('ok', lat=coords[0], lng=coords[1]) if coords else geo.LocationResolution('provider_error'))
    result = branch_tools.execute_find_nearest_branch(location='phường Gò Vấp', session_id=session)
    if coords is None:
        assert result['status'] == 'provider_error'
        assert not result.get('branches')  # Never invent a map origin on provider failure.
        return
    assert result['status'] == 'need_branch_selection'
    assert [item['ma_chi_nhanh'] for item in result['branches']] == ['GV2', 'GV1', 'TD1']
    assert all(item['khoang_cach_km'] == 0 for item in result['branches'])
    expected_basis = 'geocoded_user' if coords else 'area_centroid'
    assert all(item['distance_basis'] == expected_basis for item in result['branches'])
    assert all(item['distance_estimated'] is (coords is None) for item in result['branches'])
    if coords is None:
        assert 'ước tính theo khu vực' in result['message']
    else:
        assert 'vị trí đã xác định' in result['message']
    assert len(cart_manager.get_checkout_prefs(session)['branch_candidates']) == 3


def test_pickup_without_area_asks_for_area_instead_of_saved_delivery_address(monkeypatch):
    session = 'pickup-no-area-' + uuid.uuid4().hex
    cart_manager.set_checkout_context(session, delivery_type='MANG_DI')
    class Connection:
        def __enter__(self): return self
        def __exit__(self, *_args): pass
        def execute(self, *_args): pytest.fail('saved delivery address must not be loaded')
    class Engine:
        def connect(self): return Connection()
    monkeypatch.setattr(branch_tools, '_get_engine', lambda: Engine())
    monkeypatch.setattr(branch_tools, '_check_business_hours', lambda: None)
    result = branch_tools.execute_find_nearest_branch(session_id=session)
    assert result['status'] == 'need_location'
    assert 'khu vực/phường/quận' in result['message']


def test_new_go_vap_area_owns_checkout_turn_not_saved_address_or_products(monkeypatch):
    session = 'go-vap-turn-' + uuid.uuid4().hex
    cart_manager.add_item(session, 'P1', 'Cà phê', 35000)
    cart_manager.set_checkout_context(session, checkout_requested=True, delivery_type='MANG_DI',
        payment_method='THANH_TOAN_KHI_NHAN_HANG', voucher_decided=True,
        suggested_address='42/3 Nguyễn Hữu Tiến, Quận Tân Phú')
    monkeypatch.setattr(cart_tools, 'sync_authoritative_cart', lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(product_tools, 'execute_get_recommendations', lambda **_kw: (_ for _ in ()).throw(AssertionError('product lookup')))
    locations = []
    def find(location, session_id):
        locations.append(location)
        return {'status': 'need_branch_selection', 'branches': [
            {'ma_chi_nhanh': 'GV1', 'ten_chi_nhanh': 'Quang Trung', 'dia_chi': 'Quận Gò Vấp', 'availability_status': 'available'}]}
    monkeypatch.setattr(branch_tools, 'execute_find_nearest_branch', find)
    result = order_flow_graph.run_order_flow(session, 'tôi đang ở phường gò vấp, có địa chỉ nào gần đó ko')
    assert locations == ['phường gò vấp']
    assert 'Quang Trung' in result['reply']
    assert cart_manager.get_checkout_prefs(session)['location_address'] == 'phường gò vấp'


def test_geocoder_rejects_wrong_district_even_if_first_result(monkeypatch):
    monkeypatch.setenv('VIETMAP_API_KEY', 'test-only')
    class Response:
        def __init__(self, data): self.data = data
        def raise_for_status(self): pass
        def json(self): return self.data
    class Client:
        def __init__(self, **_kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *_args): pass
        def get(self, url, params):
            if '/search/' in url:
                return Response([{'ref_id': 'bad', 'display': 'Thủ Đức, Hồ Chí Minh'},
                                 {'ref_id': 'good', 'display': 'Gò Vấp, Hồ Chí Minh'}])
            return Response({'lat': 10.8, 'lng': 106.7, 'district': 'Thủ Đức' if params['refid'] == 'bad' else 'Gò Vấp'})
    monkeypatch.setattr(geo.httpx, 'Client', Client)
    assert geo.geocode_address('Gò Vấp') == (10.8, 106.7)
    class WrongOnly(Client):
        def get(self, url, params):
            if '/search/' in url:
                return Response([{'ref_id': 'bad', 'display': 'Thủ Đức, Hồ Chí Minh'}])
            return Response({'lat': 10.8, 'lng': 106.7, 'district': 'Thủ Đức'})
    monkeypatch.setattr(geo.httpx, 'Client', WrongOnly)
    assert geo.geocode_address('Gò Vấp') is None


def test_wallet_payment_resolution_and_authoritative_eligibility(monkeypatch):
    assert agent_service._explicit_checkout_choices('thanh toán bằng ví')['payment_method'] == 'VI_DIEN_TU'
    assert agent_service._explicit_checkout_choices('cho tôi dùng ví điện tử')['payment_method'] == 'VI_DIEN_TU'
    session = 'wallet-pass-' + uuid.uuid4().hex
    monkeypatch.setattr('src.function_calling.helpers._require_valid_session', lambda _sid: 'customer-uuid')
    monkeypatch.setattr('src.function_calling.helpers._get_service_jwt', lambda _uid: 'test-token')
    class Response:
        def raise_for_status(self): pass
        def json(self): return {'wallet': {'balance': '2063000'}}
    monkeypatch.setattr(cart_tools, '_order_service_request', lambda *_args, **_kwargs: Response())
    options = cart_tools.get_wallet_payment_options(session, 269600)
    assert options['payment_options'][-1]['enabled'] is True
    assert options['wallet_balance'] == 2063000
    assert cart_tools.get_wallet_payment_options(session, 3000000)['payment_options'][-1]['insufficient'] is True


def test_wallet_quote_rechecks_balance_before_summary(monkeypatch):
    session = 'wallet-quote-' + uuid.uuid4().hex
    cart_manager.add_item(session, 'P1', 'Nước', 269600)
    cart_manager.set_branch(session, 'CN1', 'Quán Một')
    cart_manager.set_checkout_prefs(session, payment_method='VI_DIEN_TU', delivery_type='MANG_DI')
    cart_manager.set_checkout_context(session, voucher_decided=True)
    monkeypatch.setattr(cart_tools, 'sync_authoritative_cart', lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(cart_tools, '_quote_authoritative_cart', lambda *_args, **_kwargs: {
        'items': [], 'subtotal': 269600, 'discount_amount': 0, 'delivery_fee': 0, 'final_total': 269600})
    monkeypatch.setattr('src.common.inventory_validation.validate_cart_at_branch',
                        lambda *_args: {'unavailable': [], 'unverified': []})
    monkeypatch.setattr('src.function_calling.helpers._get_engine', lambda: object())
    monkeypatch.setattr(cart_tools, 'get_wallet_payment_options', lambda _sid, total=None: {
        'payment_options': [{'code': 'VI_DIEN_TU', 'label': 'Ví Avengers', 'balance': 100,
                             'enabled': False, 'insufficient': True, 'reason': 'Số dư không đủ'}]})
    result = cart_tools.execute_request_checkout(session)
    assert result['status'] == 'insufficient_wallet'
    assert 'phương thức thanh toán khác' in result['message']
    assert not cart_manager.get_checkout_prefs(session).get('summary_fingerprint')
