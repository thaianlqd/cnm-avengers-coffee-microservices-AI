"""Final location semantics and conversational recovery regressions."""
from copy import deepcopy
from types import SimpleNamespace
import uuid

import pytest

from src.agents import agent_service
from src.agents.location_parser import checkout_location, merge_store_location, parse_location
from src.agents.order_flow_graph import run_order_flow
from src.common import cart_manager
from src.function_calling.tools import branch_tools, cart_tools, product_tools
from utils import geo


class _Response:
    def __init__(self, data):
        self._data = data

    def raise_for_status(self):
        return None

    def json(self):
        return self._data


def _provider(monkeypatch, candidates, places):
    monkeypatch.setenv("VIETMAP_API_KEY", "test-only")

    class Client:
        def __init__(self, **_kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def get(self, url, params):
            if "/search/" in url:
                return _Response(candidates)
            return _Response(places[params["refid"]])

    monkeypatch.setattr(geo.httpx, "Client", Client)


def _seed_edit(monkeypatch, session):
    cart_manager.replace_items_from_order_cart(session, [{
        "id": 71,
        "ma_san_pham": "A",
        "ten_san_pham": "Americano",
        "gia_ban": 39000,
        "so_luong": 1,
        "size": "M",
        "luong_da": "Bình thường",
    }])
    cart_manager.set_checkout_context(
        session,
        flow_stage="CART_REVIEW",
        voucher_code="KEEP20",
        voucher_decided=True,
        payment_method="NGAN_HANG_QR",
        delivery_type="MANG_DI",
    )
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(product_tools, "execute_get_product_options", lambda _name: {
        "status": "ok",
        "options": {"Lượng đá": ["Ít đá", "Đá riêng", "Bình thường"]},
    })
    monkeypatch.setattr(product_tools, "execute_get_product_insights",
                        lambda *_args, **_kwargs: pytest.fail("product insights reached"))
    monkeypatch.setattr(product_tools, "execute_get_recommendations",
                        lambda *_args, **_kwargs: pytest.fail("recommendations reached"))
    monkeypatch.setattr(agent_service, "_run_agent_impl",
                        lambda *_args, **_kwargs: pytest.fail("generic LLM reached"))


def _seed_checkout_choices(monkeypatch, *, delivery_type=None, payment_method=None):
    session = "choice-recovery-" + uuid.uuid4().hex
    cart_manager.add_item(session, "P1", "Cà phê", 39000)
    cart_manager.set_checkout_context(
        session,
        checkout_requested=True,
        voucher_decided=True,
        flow_stage="CHECKOUT",
        delivery_type=delivery_type,
        payment_method=payment_method,
    )
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(cart_tools, "execute_get_cart_quote", lambda _sid: {
        "status": "ok", "quote": {"final_total": 39000},
    })
    monkeypatch.setattr(cart_tools, "get_wallet_payment_options", lambda _sid, _total: {
        "payment_options": [{"code": "VI_DIEN_TU", "label": "Ví Avengers", "balance": 100000}],
    })
    return session


# Characterization: these contracts were green before the production patch.
def test_existing_location_contract_characterization():
    assert parse_location("phường Gò Vấp").kind == "area"
    assert parse_location("phường Tây Thạnh, quận Tân Phú, TP. Hồ Chí Minh").kind == "area"
    assert parse_location("địa chỉ đó").kind == "reference"
    assert parse_location("Matcha Latte").kind == "none"
    assert checkout_location("thêm bánh", "MANG_DI", True).kind == "none"
    assert checkout_location("chuyển khoản QR", "MANG_DI", True).kind == "none"
    assert checkout_location("đá riêng", "MANG_DI", True).kind == "none"
    assert parse_location("cửa hàng số 1").kind != "address"


def test_existing_partial_store_location_merge_characterization():
    first = merge_store_location(None, "phường Gò Vấp")
    assert first["locality"] == "phường Gò Vấp" and first["status"] == "partial"
    second = merge_store_location(first, "TP HCM")
    assert second["locality"] == "phường Gò Vấp"
    assert second["city"] and second["status"] == "complete"


def test_poi_parser_is_semantically_distinct_from_admin_area():
    parsed = parse_location("tôi đang ở trường đại học công nghiệp tp hcm")
    assert parsed.kind == "poi"
    assert parsed.value.startswith("trường đại học")
    assert parsed.admin_hints
    assert parse_location("phường Gò Vấp").kind == "area"


def test_pickup_and_dine_in_accept_poi_but_delivery_does_not():
    message = "tôi đang ở bệnh viện đa khoa Ánh Dương"
    assert checkout_location(message, "MANG_DI", True).kind == "poi"
    assert checkout_location(message, "TAI_CHO", True).kind == "poi"
    assert checkout_location(message, "GIAO_TAN_NOI", True).kind != "address"


def test_poi_store_state_never_overloads_administrative_locality():
    state = merge_store_location(None, "Công viên Bình Minh")
    assert state["kind"] == "poi" and state["raw"] == "Công viên Bình Minh"
    assert not state.get("locality")
    with_city = merge_store_location(state, "TP ABC")
    assert with_city["kind"] == "poi" and not with_city.get("locality")
    assert "Thành phố ABC" in with_city["value"]
    inline = merge_store_location(None, "Trường Đại học Sao Mai TP ABC")
    assert inline["kind"] == "poi" and inline["value"].count("ABC") == 1


def test_poi_resolves_unique_provider_candidate(monkeypatch):
    _provider(monkeypatch, [{"ref_id": "p1", "name": "Trường Đại học Công nghiệp TP HCM"}], {
        "p1": {"lat": 10.82, "lng": 106.68, "name": "Trường Đại học Công nghiệp TP HCM",
               "city": "Hồ Chí Minh", "display": "Trường Đại học Công nghiệp TP HCM, Hồ Chí Minh"},
    })
    parsed = parse_location("tôi đang ở trường đại học công nghiệp tp hcm")
    result = geo.resolve_location(parsed.value, parsed.kind, parsed.admin_hints)
    assert result.status == "ok" and result.match_type == "poi"
    assert (result.lat, result.lng) == (10.82, 106.68)
    assert result.provider_candidate_count == 1 and result.rejected_candidate_count == 0


def test_poi_without_admin_suffix_resolves_when_unique(monkeypatch):
    _provider(monkeypatch, [{"ref_id": "p1", "name": "Bệnh viện Đa khoa Ánh Dương"}], {
        "p1": {"lat": 16.05, "lng": 108.2, "name": "Bệnh viện Đa khoa Ánh Dương",
               "city": "Thành phố Biển Đông"},
    })
    result = geo.resolve_location("Bệnh viện Đa khoa Ánh Dương", "poi")
    assert result.status == "ok" and result.resolution_basis == "provider_place"


def test_two_same_name_pois_are_ambiguous_without_admin_evidence(monkeypatch):
    _provider(monkeypatch, [
        {"ref_id": "p1", "name": "Công viên Bình Minh"},
        {"ref_id": "p2", "name": "Công viên Bình Minh"},
    ], {
        "p1": {"lat": 10.0, "lng": 106.0, "name": "Công viên Bình Minh", "city": "Thành phố An Hải"},
        "p2": {"lat": 16.0, "lng": 108.0, "name": "Công viên Bình Minh", "city": "Thành phố Bình Hải"},
    })
    result = geo.resolve_location("Công viên Bình Minh", "poi")
    assert result.status == "ambiguous"
    assert result.provider_candidate_count == 2 and result.rejected_candidate_count == 0


def test_provider_candidates_rejected_by_explicit_city_are_not_not_found(monkeypatch):
    _provider(monkeypatch, [{"ref_id": "p1", "name": "Nhà ga Bình Minh"}], {
        "p1": {"lat": 10.0, "lng": 106.0, "name": "Nhà ga Bình Minh", "city": "Thành phố Nam Sơn"},
    })
    result = geo.resolve_location("Nhà ga Bình Minh, Thành phố Bắc Sơn", "poi",
                                  ("Thành phố Bắc Sơn",))
    assert result.status == "rejected"
    assert result.provider_candidate_count == result.rejected_candidate_count == 1


def test_provider_zero_candidates_and_provider_error_are_distinct(monkeypatch):
    _provider(monkeypatch, [], {})
    empty = geo.resolve_location("Công viên Bình Minh", "poi")
    assert empty.status == "not_found" and empty.provider_candidate_count == 0

    monkeypatch.setenv("VIETMAP_API_KEY", "test-only")

    class BrokenClient:
        def __init__(self, **_kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def get(self, *_args, **_kwargs):
            raise RuntimeError("provider unavailable")

    monkeypatch.setattr(geo.httpx, "Client", BrokenClient)
    unavailable = geo.resolve_location("Công viên Bình Minh", "poi")
    assert unavailable.status == "provider_error"


def test_natural_address_components_are_confirmed_by_provider(monkeypatch):
    address = "12 Nguyễn Văn Bảo, Hạnh Thông, Hồ Chí Minh"
    _provider(monkeypatch, [{"ref_id": "a1", "display": address}], {
        "a1": {"lat": 10.83, "lng": 106.68, "address": "12 Nguyễn Văn Bảo",
               "street": "Nguyễn Văn Bảo", "ward": "Hạnh Thông", "city": "Hồ Chí Minh",
               "formatted_address": "12 Nguyễn Văn Bảo, Phường Hạnh Thông, Thành phố Hồ Chí Minh"},
    })
    result = geo.resolve_location(address, "address")
    assert result.status == "ok" and result.match_type == "address"


def test_natural_address_unconfirmed_component_is_rejected(monkeypatch):
    address = "12 Nguyễn Văn Bảo, Hạnh Thông, Hồ Chí Minh"
    _provider(monkeypatch, [{"ref_id": "a1", "display": address}], {
        "a1": {"lat": 10.83, "lng": 106.68, "street": "Nguyễn Văn Bảo",
               "ward": "Tây Thạnh", "city": "Hồ Chí Minh"},
    })
    result = geo.resolve_location(address, "address")
    assert result.status == "rejected"


def test_generic_admin_initialism_requires_unique_provider_evidence(monkeypatch):
    query = "Trường Đại học Sao Mai, TP ABC"
    _provider(monkeypatch, [{"ref_id": "p1", "name": "Trường Đại học Sao Mai"}], {
        "p1": {"lat": 1.0, "lng": 2.0, "name": "Trường Đại học Sao Mai", "city": "An Bình Cát"},
    })
    unique = geo.resolve_location(query, "poi", ("TP ABC",))
    assert unique.status == "ok"

    _provider(monkeypatch, [
        {"ref_id": "p1", "name": "Trường Đại học Sao Mai"},
        {"ref_id": "p2", "name": "Trường Đại học Sao Mai"},
    ], {
        "p1": {"lat": 1.0, "lng": 2.0, "name": "Trường Đại học Sao Mai", "city": "An Bình Cát"},
        "p2": {"lat": 3.0, "lng": 4.0, "name": "Trường Đại học Sao Mai", "city": "An Bắc Cường"},
    })
    ambiguous = geo.resolve_location(query, "poi", ("TP ABC",))
    assert ambiguous.status == "ambiguous"


def test_poi_branch_search_uses_resolved_coordinate_and_never_locality_slot(monkeypatch):
    session = "poi-branch-" + uuid.uuid4().hex
    cart_manager.set_checkout_context(session, delivery_type="MANG_DI")
    rows = [{"ma_chi_nhanh": "B1", "ten_chi_nhanh": "Quán Một", "dia_chi": "Đường Một",
             "vi_do": 10.81, "kinh_do": 106.69}]

    class Query:
        def mappings(self):
            return self

        def all(self):
            return rows

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def execute(self, _sql):
            return Query()

    class Engine:
        def connect(self):
            return Connection()

    monkeypatch.setattr(branch_tools, "_get_engine", lambda: Engine())
    monkeypatch.setattr(branch_tools, "_check_business_hours", lambda: None)
    monkeypatch.setattr(branch_tools, "validate_cart_at_branch",
                        lambda *_args: {"unavailable": [], "unverified": []})
    monkeypatch.setattr(geo, "resolve_location", lambda *_args, **_kwargs: SimpleNamespace(
        status="ok", lat=10.82, lng=106.68, normalized_label="Trường Đại học Sao Mai",
        match_type="poi", resolution_basis="provider_place",
    ))

    result = branch_tools.execute_find_nearest_branch(
        location="Trường Đại học Sao Mai", session_id=session,
    )
    assert result["status"] == "need_branch_selection"
    assert result["branches"][0]["distance_basis"] == "poi_resolved"


def test_ambiguous_poi_does_not_write_branch_selection_state(monkeypatch):
    session = "poi-ambiguous-" + uuid.uuid4().hex
    cart_manager.set_checkout_context(session, delivery_type="MANG_DI")

    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def execute(self, _sql):
            pytest.fail("ambiguous POI must not query or select branches")

    class Engine:
        def connect(self):
            return Connection()

    monkeypatch.setattr(branch_tools, "_get_engine", lambda: Engine())
    monkeypatch.setattr(branch_tools, "_check_business_hours", lambda: None)
    monkeypatch.setattr(geo, "resolve_location", lambda *_args, **_kwargs: SimpleNamespace(
        status="ambiguous", lat=None, lng=None, normalized_label=None,
        match_type="poi", resolution_basis=None,
    ))
    result = branch_tools.execute_find_nearest_branch(location="Công viên Bình Minh", session_id=session)
    assert result["status"] == "ambiguous"
    prefs = cart_manager.get_checkout_prefs(session)
    assert not prefs.get("branch_candidates") and cart_manager.get_branch(session) is None


@pytest.mark.parametrize("message", [
    "à vậy được rồi",
    "vậy thôi",
    "thôi giữ vậy đi",
    "được rồi bạn",
    "không chỉnh nữa",
])
def test_invalid_cart_edit_can_keep_current_without_mutation(monkeypatch, message):
    session = "edit-cancel-" + uuid.uuid4().hex
    _seed_edit(monkeypatch, session)
    writes = []
    monkeypatch.setattr(cart_tools, "execute_update_cart_item",
                        lambda *_args, **_kwargs: writes.append((_args, _kwargs)) or {})

    invalid = run_order_flow(session, "chỉnh thành đá nhiều nhiều đi")
    before = deepcopy(cart_manager.get_cart(session)["items"])
    assert not writes and "Ít đá" in invalid["reply"]
    pending = cart_manager.get_pending_action(session)
    assert pending["type"] == "edit_cart_item"
    assert pending["params"]["clarification_type"] == "invalid_option"

    kept = run_order_flow(session, message)
    prefs = cart_manager.get_checkout_prefs(session)
    assert not writes and cart_manager.get_cart(session)["items"] == before
    assert cart_manager.get_pending_action(session) is None
    assert prefs["voucher_code"] == "KEEP20"
    assert prefs["payment_method"] == "NGAN_HANG_QR" and prefs["delivery_type"] == "MANG_DI"
    assert prefs["flow_stage"] == "CART_REVIEW"
    assert "giữ" in kept["reply"].lower() and "hoàn tất giỏ" in kept["reply"].lower()


def test_invalid_cart_edit_correction_writes_exactly_once(monkeypatch):
    session = "edit-correct-" + uuid.uuid4().hex
    _seed_edit(monkeypatch, session)
    writes = []

    def update(sid, line_id, desired):
        writes.append((line_id, desired))
        return {"status": "ok", "cart": cart_manager.get_cart(sid),
                "quote": {"subtotal": 39000, "final_total": 39000}}

    monkeypatch.setattr(cart_tools, "execute_update_cart_item", update)
    run_order_flow(session, "chỉnh thành đá nhiều nhiều đi")
    corrected = run_order_flow(session, "ít đá")
    assert len(writes) == 1 and writes[0][0] == "71"
    assert writes[0][1]["luong_da"] == "Ít đá"
    assert "Đã cập nhật tùy chọn" in corrected["reply"]


def test_checkout_continuation_without_number_reasks_both_lists(monkeypatch):
    session = _seed_checkout_choices(monkeypatch)
    result = run_order_flow(session, "tiếp tục đi bạn")
    assert "số bạn chọn" not in result["reply"]
    assert "Hình thức nhận hàng" in result["reply"] and "Phương thức thanh toán" in result["reply"]
    prefs = cart_manager.get_checkout_prefs(session)
    assert not prefs.get("delivery_type") and not prefs.get("payment_method")


def test_checkout_continuation_reasks_only_missing_payment(monkeypatch):
    session = _seed_checkout_choices(monkeypatch, delivery_type="MANG_DI")
    result = run_order_flow(session, "oke rồi")
    assert "số bạn chọn" not in result["reply"]
    assert "Hình thức nhận hàng" not in result["reply"] and "Phương thức thanh toán" in result["reply"]
    assert not cart_manager.get_checkout_prefs(session).get("payment_method")


def test_actual_invalid_or_ambiguous_checkout_ordinal_keeps_numeric_wording(monkeypatch):
    payment = _seed_checkout_choices(monkeypatch, delivery_type="MANG_DI")
    invalid = run_order_flow(payment, "số 9")
    assert "số" in invalid["reply"].lower() and "không hợp lệ" in invalid["reply"].lower()
    assert not cart_manager.get_checkout_prefs(payment).get("payment_method")

    both = _seed_checkout_choices(monkeypatch)
    ambiguous = run_order_flow(both, "số 2")
    assert "số" in ambiguous["reply"].lower() and "danh sách" in ambiguous["reply"].lower()
    prefs = cart_manager.get_checkout_prefs(both)
    assert not prefs.get("delivery_type") and not prefs.get("payment_method")
