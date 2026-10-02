"""Regressions for browser-found context ownership and resolver ambiguity bugs."""
from types import SimpleNamespace
import uuid

import pytest

from src.agents import order_flow_graph
from src.agents.shopping_language import interpret_shopping
from src.common import cart_manager
from src.function_calling.tools import branch_tools
from utils import geo


MOON_MATCHA = {"product_id": "P-MOON", "product_name": "Bánh Trung Thu Matcha", "category": "food"}
MOCHI_MATCHA = {"product_id": "P-MOCHI", "product_name": "Mochi Kem Matcha", "category": "food"}
MOON_BEAN = {"product_id": "P-BEAN", "product_name": "Bánh Trung Thu Đậu Xanh", "category": "food"}


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
            value = places[params["refid"]]
            if isinstance(value, Exception):
                raise value
            return _Response(value)

    monkeypatch.setattr(geo.httpx, "Client", Client)


def _place(index, *, city="Thành phố Ánh Dương"):
    return {
        "lat": 10.0 + index / 100,
        "lng": 106.0 + index / 100,
        "name": "Công viên Bình Minh",
        "display": f"Công viên Bình Minh — cơ sở {index}, {city}",
        "district": f"Quận {index}",
        "city": city,
    }


def _state(session, message):
    return {
        "session_id": session,
        "user_message": message,
        "history": [],
        "cart": cart_manager.get_cart(session),
        "cart_sync_status": "ok",
    }


def test_selection_language_uses_unique_visible_snapshot_before_family_browse():
    meaning = interpret_shopping(
        "cho tôi bánh trung thu đi", snapshot=[MOON_MATCHA, MOCHI_MATCHA],
    )
    assert meaning.act == "ADD_ITEM"
    assert [row["product_id"] for row in meaning.targets] == ["P-MOON"]
    assert meaning.reference_source == "snapshot_alias"


def test_multiple_visible_family_matches_clarify_without_add_or_browse():
    meaning = interpret_shopping(
        "cho tôi bánh trung thu", snapshot=[MOON_MATCHA, MOON_BEAN],
    )
    assert meaning.act == "AMBIGUOUS"
    assert [row["product_id"] for row in meaning.ambiguity] == ["P-MOON", "P-BEAN"]


@pytest.mark.parametrize("message", [
    "cho tôi xem các loại bánh trung thu",
    "bên bạn có bánh trung thu gì?",
])
def test_explicit_family_browse_remains_read_only(message):
    meaning = interpret_shopping(message, snapshot=[MOON_MATCHA, MOON_BEAN])
    assert meaning.act == "BROWSE_FAMILY"
    assert meaning.read_only is True
    assert meaning.family == "moon_cake"


def test_discourse_prefix_does_not_hide_shopping_interrupt(monkeypatch):
    session = "browser-shopping-interrupt-" + uuid.uuid4().hex
    cart_manager.set_checkout_context(
        session, checkout_requested=True, delivery_type="MANG_DI",
        payment_method="TIEN_MAT", location_pending=True,
    )
    cart_manager.set_pending_action(session, "collect_store_location", {"missing": "locality"})
    monkeypatch.setattr(order_flow_graph, "_load_active_product_targets", lambda: [])

    understood = order_flow_graph._understand(
        _state(session, "à quên nãy tôi quên mua bánh"),
    )

    assert understood["intent"]["intent"] in {"BROWSING", "SHOPPING_CLARIFY", "SHOPPING_GENERIC"}
    assert understood["intent"]["intent"] not in {"PENDING_AMBIGUOUS", "LOCATION_QUERY"}


def test_geo_ambiguous_result_preserves_stable_bounded_candidates(monkeypatch):
    suggestions = [
        {"ref_id": f"p{index}", "name": "Công viên Bình Minh"}
        for index in range(1, 9)
    ]
    places = {f"p{index}": _place(index) for index in range(1, 9)}
    _provider(monkeypatch, suggestions, places)

    result = geo.resolve_location("Công viên Bình Minh", "poi")

    assert result.status == "ambiguous"
    assert 3 <= len(result.candidates) <= 5
    assert [row["provider_ref_id"] for row in result.candidates] == ["p1", "p2", "p3", "p4", "p5"]
    assert all(row["accepted"] is True for row in result.candidates)
    assert all(set(row) >= {"provider_ref_id", "normalized_label", "lat", "lng", "match_basis"}
               for row in result.candidates)


def test_geo_candidate_snapshot_deduplicates_effective_places(monkeypatch):
    suggestions = [
        {"ref_id": "same-a", "name": "Công viên Bình Minh"},
        {"ref_id": "same-b", "name": "Công viên Bình Minh"},
        {"ref_id": "other", "name": "Công viên Bình Minh"},
    ]
    same = _place(1)
    _provider(monkeypatch, suggestions, {"same-a": same, "same-b": dict(same), "other": _place(2)})

    result = geo.resolve_location("Công viên Bình Minh", "poi")

    assert result.status == "ambiguous"
    assert [row["provider_ref_id"] for row in result.candidates] == ["same-a", "other"]


def test_geo_rejected_name_matches_retain_safe_previews(monkeypatch):
    _provider(monkeypatch, [{"ref_id": "p1", "name": "Công viên Bình Minh"}], {
        "p1": _place(1, city="Thành phố Nam Sơn"),
    })

    result = geo.resolve_location(
        "Công viên Bình Minh, Thành phố Bắc Sơn", "poi", ("Thành phố Bắc Sơn",),
    )

    assert result.status == "rejected"
    assert len(result.candidates) == 1
    assert result.candidates[0]["accepted"] is False
    assert result.candidates[0]["provider_ref_id"] == "p1"


def test_geo_not_found_and_provider_error_have_no_candidate_snapshot(monkeypatch):
    _provider(monkeypatch, [], {})
    missing = geo.resolve_location("Công viên Bình Minh", "poi")
    assert missing.status == "not_found" and not missing.candidates

    _provider(monkeypatch, [{"ref_id": "p1", "name": "Công viên Bình Minh"}], {
        "p1": RuntimeError("detail unavailable"),
    })
    unavailable = geo.resolve_location("Công viên Bình Minh", "poi")
    assert unavailable.status == "provider_error" and not unavailable.candidates


def test_branch_boundary_forwards_provider_candidate_descriptors(monkeypatch):
    candidates = ({
        "provider_ref_id": "p1", "normalized_label": "Công viên Bình Minh — cơ sở 1",
        "display_address": "Quận Một", "lat": 10.1, "lng": 106.1,
        "match_basis": "poi_name", "accepted": True,
    },)
    monkeypatch.setattr(branch_tools, "_check_business_hours", lambda: None)
    class Connection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def execute(self, *_args, **_kwargs):
            pytest.fail("database must not be queried before location selection")

    monkeypatch.setattr(branch_tools, "_get_engine", lambda: SimpleNamespace(connect=Connection))
    monkeypatch.setattr(geo, "resolve_location", lambda *_args, **_kwargs: geo.LocationResolution(
        "ambiguous", match_type="poi", provider_candidate_count=3, candidates=candidates,
    ))

    found = branch_tools.execute_find_nearest_branch("Công viên Bình Minh")

    assert found["status"] == "ambiguous"
    assert found["location_candidates"] == list(candidates)


def test_location_owner_resolves_ordinal_and_exact_label_namespaces():
    session = "browser-location-owner-" + uuid.uuid4().hex
    candidates = [
        {"provider_ref_id": "p1", "normalized_label": "Công viên Sao Mai", "lat": 10.1, "lng": 106.1},
        {"provider_ref_id": "p2", "normalized_label": "Bệnh viện Ánh Dương", "lat": 10.2, "lng": 106.2},
        {"provider_ref_id": "p3", "normalized_label": "Nhà ga Bình Minh", "lat": 10.3, "lng": 106.3},
    ]
    cart_manager.set_checkout_context(session, location_candidate_snapshot={
        "query": "địa điểm cũ", "kind": "poi", "transactional": False, "candidates": candidates,
    })
    cart_manager.set_pending_action(session, "select_location_candidate", {"count": 3})

    ordinal = order_flow_graph._understand(_state(session, "địa điểm số 2"))["intent"]
    assert ordinal["intent"] == "LOCATION_CANDIDATE_SELECT"
    assert ordinal["candidate"]["provider_ref_id"] == "p2"

    exact = order_flow_graph._understand(_state(session, "Bệnh viện Ánh Dương"))["intent"]
    assert exact["intent"] == "LOCATION_CANDIDATE_SELECT"
    assert exact["candidate"]["provider_ref_id"] == "p2"


def test_location_owner_rejects_invalid_ordinal_in_its_own_namespace():
    session = "browser-location-invalid-" + uuid.uuid4().hex
    cart_manager.set_checkout_context(session, location_candidate_snapshot={
        "query": "địa điểm cũ", "kind": "poi", "transactional": False,
        "candidates": [{"provider_ref_id": "p1", "normalized_label": "Địa điểm Một"}],
    })
    cart_manager.set_pending_action(session, "select_location_candidate", {"count": 1})

    intent = order_flow_graph._understand(_state(session, "địa điểm số 9"))["intent"]

    assert intent["intent"] == "LOCATION_CANDIDATE_INVALID"
    assert intent["ordinal"] == 9


def test_new_explicit_location_supersedes_old_candidate_snapshot():
    session = "browser-location-replace-" + uuid.uuid4().hex
    cart_manager.set_checkout_context(session, location_candidate_snapshot={
        "query": "địa điểm cũ", "kind": "poi", "transactional": False,
        "candidates": [{"provider_ref_id": "p1", "normalized_label": "Địa điểm Cũ"}],
    })
    cart_manager.set_pending_action(session, "select_location_candidate", {"count": 1})

    intent = order_flow_graph._understand(
        _state(session, "không, tôi đang ở Bệnh viện Ánh Dương"),
    )["intent"]

    assert intent["intent"] == "LOCATION_QUERY"
    prefs = cart_manager.get_checkout_prefs(session)
    assert prefs.get("location_candidate_snapshot") is None
    assert (cart_manager.get_pending_action(session) or {}).get("type") != "select_location_candidate"


def test_location_candidate_owner_yields_to_shopping_and_payment_info(monkeypatch):
    session = "browser-location-yield-" + uuid.uuid4().hex
    cart_manager.set_checkout_context(session, location_candidate_snapshot={
        "query": "Công viên Bình Minh", "kind": "poi", "transactional": True,
        "candidates": [{"provider_ref_id": "p1", "normalized_label": "Công viên Bình Minh"}],
    }, last_product_suggestions=[MOON_MATCHA])
    cart_manager.set_pending_action(session, "select_location_candidate", {"count": 1})
    monkeypatch.setattr(order_flow_graph, "_load_active_product_targets", lambda: [MOON_MATCHA])

    shopping = order_flow_graph._understand(_state(session, "thêm cho tôi Bánh Trung Thu Matcha"))["intent"]
    assert shopping["intent"] == "ADD_ITEM"
    assert (cart_manager.get_pending_action(session) or {}).get("type") != "select_location_candidate"

    cart_manager.set_pending_action(session, "select_location_candidate", {"count": 1})
    payment = order_flow_graph._understand(_state(session, "QR là gì?"))["intent"]
    assert payment["intent"] == "PAYMENT_INFO"
    assert (cart_manager.get_pending_action(session) or {}).get("type") == "select_location_candidate"


def test_reset_clears_location_candidate_context():
    session = "browser-location-reset-" + uuid.uuid4().hex
    cart_manager.set_checkout_context(session, location_candidate_snapshot={"candidates": [{"provider_ref_id": "p1"}]})
    cart_manager.set_pending_action(session, "select_location_candidate", {"count": 1})

    prefs = cart_manager.reset_conversation_draft(session)

    assert "location_candidate_snapshot" not in prefs
    assert cart_manager.get_pending_action(session) is None


def test_saved_address_rejection_cannot_resurrect_after_ambiguous_new_poi(monkeypatch):
    session = "browser-saved-address-" + uuid.uuid4().hex
    candidate = {
        "provider_ref_id": "poi-1", "normalized_label": "Công viên Bình Minh",
        "display_address": "Quận Ánh Dương", "lat": 10.1, "lng": 106.1,
        "match_basis": "poi_name", "accepted": True,
    }
    cart_manager.set_checkout_context(
        session, checkout_requested=True, delivery_type="MANG_DI",
        payment_method="TIEN_MAT", suggested_address="12 Đường Cũ, Phường Cũ",
        profile_address_candidates=[{"full_address": "12 Đường Cũ, Phường Cũ"}],
        location_source="profile_saved",
    )
    cart_manager.set_pending_action(session, "confirm_address", {})
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda **_kwargs: {
        "status": "ambiguous", "normalized_location": "Công viên Bình Minh",
        "location_candidates": [candidate], "message": "Bạn chọn địa điểm số mấy?",
    })

    result = order_flow_graph._handle_location_request(
        _state(session, "không tôi đang ở Công viên Bình Minh"),
    )
    prefs = cart_manager.get_checkout_prefs(session)

    assert result["reply"] == "Bạn chọn địa điểm số mấy?"
    assert prefs.get("suggested_address") is None
    assert prefs.get("profile_address_candidates") is None
    assert prefs.get("location_source") == "explicit_user"
    assert prefs.get("store_location", {}).get("value")
    assert (cart_manager.get_pending_action(session) or {}).get("type") == "select_location_candidate"
    assert prefs["location_candidate_snapshot"]["candidates"][0]["provider_ref_id"] == "poi-1"

    interrupted = order_flow_graph._understand(
        _state(session, "à quên tôi muốn xem bánh"),
    )
    assert interrupted["intent"]["intent"] == "BROWSING"
    assert cart_manager.get_checkout_prefs(session).get("suggested_address") is None


def test_selected_location_candidate_calls_branch_lookup_once_with_provider_identity(monkeypatch):
    session = "browser-location-select-" + uuid.uuid4().hex
    candidate = {
        "provider_ref_id": "poi-2", "normalized_label": "Bệnh viện Ánh Dương",
        "display_address": "Quận Bình Minh", "lat": 10.2, "lng": 106.2,
        "match_basis": "poi_name", "accepted": True,
    }
    cart_manager.set_checkout_context(session, location_candidate_snapshot={
        "query": "Bệnh viện", "kind": "poi", "transactional": False,
        "candidates": [candidate],
    })
    cart_manager.set_pending_action(session, "select_location_candidate", {"count": 1})
    calls = []

    def find_branch(**kwargs):
        calls.append(kwargs)
        return {"status": "ok", "branches": [], "message": "Đã tìm theo địa điểm chính xác."}

    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", find_branch)
    understood = order_flow_graph._understand(_state(session, "số 1"))
    executed = order_flow_graph._execute(understood)

    assert executed["result"]["reply"] == "Đã tìm theo địa điểm chính xác."
    assert len(calls) == 1
    assert calls[0]["resolved_location"]["provider_ref_id"] == "poi-2"
    prefs = cart_manager.get_checkout_prefs(session)
    assert prefs.get("location_candidate_snapshot") is None
    assert prefs.get("selected_location_candidate") is None
    assert cart_manager.get_pending_action(session) is None


def test_shopping_scope_clarification_has_typed_followups():
    session = "browser-shopping-scope-" + uuid.uuid4().hex
    state = _state(session, "cho tôi bánh trung thu")
    clarified = order_flow_graph._execute({**state, "intent": {
        "intent": "SHOPPING_CLARIFY", "candidate_products": [MOON_MATCHA, MOON_BEAN],
        "family": "moon_cake", "search_text": "Bánh Trung Thu", "label": "Bánh Trung Thu",
    }})
    assert "xem thêm menu" in clarified["result"]["reply"]
    assert (cart_manager.get_pending_action(session) or {}).get("type") == "shopping_scope_clarification"

    browse = order_flow_graph._understand(_state(session, "xem thêm"))["intent"]
    assert browse["intent"] == "BROWSING"
    assert "Bánh Trung Thu" in browse["category_query"]

    order_flow_graph._execute({**state, "intent": {
        "intent": "SHOPPING_CLARIFY", "candidate_products": [MOON_MATCHA, MOON_BEAN],
        "family": "moon_cake", "search_text": "Bánh Trung Thu", "label": "Bánh Trung Thu",
    }})
    selected = order_flow_graph._understand(
        _state(session, "lấy Bánh Trung Thu Matcha vừa xem"),
    )["intent"]
    assert selected["intent"] == "ADD_ITEM"
    assert selected["resolved_products"][0]["product_id"] == "P-MOON"
