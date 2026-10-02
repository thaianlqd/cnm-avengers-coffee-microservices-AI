"""Global numbered-selection and cross-owner state contract regressions."""
from types import SimpleNamespace
import uuid

import pytest

from src.agents import agent_service, order_flow_graph
from src.agents.selection_language import parse_selection_reference
from src.agents.shopping_language import interpret_shopping
from src.common import cart_manager
from src.function_calling.tools import branch_tools, cart_tools, voucher_tools
from utils import geo


PRODUCTS = [
    {"product_id": "P1", "product_name": "Americano Chanh Leo", "category": "drink"},
    {"product_id": "P2", "product_name": "Matcha Kem", "category": "drink"},
]
LOCATION_CANDIDATES = [
    {"provider_ref_id": "L1", "normalized_label": "Thư viện Ánh Dương",
     "display_address": "Phường Bình Minh", "lat": 10.1, "lng": 106.1,
     "admin_components": {"ward": "Phường Bình Minh"}, "match_basis": "poi_name", "accepted": True},
    {"provider_ref_id": "L2", "normalized_label": "Trung tâm Sao Mai",
     "display_address": "Phường An Lạc", "lat": 10.2, "lng": 106.2,
     "admin_components": {"ward": "Phường An Lạc"}, "match_basis": "poi_name", "accepted": True},
]


def _session(prefix="selection"):
    return f"{prefix}-{uuid.uuid4().hex}"


def _state(session, message):
    return {
        "session_id": session, "user_message": message, "history": [],
        "cart": cart_manager.get_cart(session), "cart_sync_status": "ok",
    }


def _seed_location_owner(session, *, transactional=True):
    cart_manager.set_checkout_context(session, location_candidate_snapshot={
        "query": "địa điểm", "kind": "poi", "transactional": transactional,
        "candidates": LOCATION_CANDIDATES,
    })
    cart_manager.set_pending_action(session, "select_location_candidate", {"count": 2})


@pytest.mark.parametrize("message", [
    "1", "số 1", "số một", "thứ nhất", "cái đầu tiên",
    "địa điểm 1 á", "tôi ở địa chỉ 1 á", "cho tôi địa điểm đầu tiên nha",
    "chỗ đầu tiên",
])
def test_shared_selection_language_understands_natural_location_ordinals(message):
    reference = parse_selection_reference(message, active_namespace="LOCATION_CANDIDATE")
    assert reference.requested is True
    assert reference.ordinals == (1,)
    assert reference.namespace in {None, "LOCATION_CANDIDATE"}


@pytest.mark.parametrize("message", [
    "140 Lê Trọng Tấn", "42/3 Nguyễn Hữu Tiến", "đơn 12345",
    "giá 99.000", "2 ly Americano", "size 2", "tăng số lượng lên 2",
    "voucher giảm 20%",
])
def test_shared_selection_language_rejects_non_ordinal_numbers(message):
    reference = parse_selection_reference(message, active_namespace="LOCATION_CANDIDATE")
    assert reference.requested is False
    assert reference.ordinals == ()


def test_shared_selection_language_preserves_namespace_and_product_multi_select():
    location = parse_selection_reference("địa điểm số 2", active_namespace="PRODUCT")
    assert location.namespace == "LOCATION_CANDIDATE" and location.ordinals == (2,)

    products = parse_selection_reference("bánh số 2 và số 8", allow_multiple=True)
    assert products.namespace == "PRODUCT"
    assert products.ordinals == (2, 8)

    payment = parse_selection_reference("phương thức thanh toán số 2")
    fulfillment = parse_selection_reference("hình thức nhận hàng thứ nhất")
    assert payment.namespace == "PAYMENT" and payment.ordinals == (2,)
    assert fulfillment.namespace == "FULFILLMENT" and fulfillment.ordinals == (1,)


@pytest.mark.parametrize("message", [
    "1", "số 1", "địa điểm 1 á", "tôi ở địa chỉ 1 á", "cái đầu tiên",
])
def test_location_candidate_owner_consumes_shared_natural_ordinal(message):
    session = _session("location-natural")
    _seed_location_owner(session)

    intent = order_flow_graph._understand(_state(session, message))["intent"]

    assert intent["intent"] == "LOCATION_CANDIDATE_SELECT"
    assert intent["candidate"]["provider_ref_id"] == "L1"


def test_location_namespace_mismatch_routes_product_not_location(monkeypatch):
    session = _session("location-mismatch")
    _seed_location_owner(session)
    cart_manager.set_checkout_context(session, last_product_suggestions=PRODUCTS)
    monkeypatch.setattr(order_flow_graph, "_load_active_product_targets", lambda: PRODUCTS)

    intent = order_flow_graph._understand(_state(session, "cho tôi món số 1"))["intent"]

    assert intent["intent"] == "ADD_ITEM"
    assert intent["resolved_products"][0]["product_id"] == "P1"


def test_invalid_location_ordinal_preserves_owner_and_mutates_nothing():
    session = _session("location-invalid")
    _seed_location_owner(session)
    before = cart_manager.get_cart(session)

    intent = order_flow_graph._understand(_state(session, "địa điểm số 9 á"))["intent"]
    result = order_flow_graph._execute({**_state(session, "địa điểm số 9 á"), "intent": intent})["result"]

    assert intent["intent"] == "LOCATION_CANDIDATE_INVALID"
    assert "2 lựa chọn" in result["reply"]
    assert (cart_manager.get_pending_action(session) or {}).get("type") == "select_location_candidate"
    assert cart_manager.get_cart(session)["items"] == before["items"]
    assert result["tool_calls_log"] == []


def test_location_owner_yields_to_fulfillment_and_invalidates_pickup_state(monkeypatch):
    session = _session("location-fulfillment")
    cart_manager.add_item(session, "P1", "Americano", 39000)
    cart_manager.set_checkout_context(
        session, checkout_requested=True, voucher_decided=True, flow_stage="CHECKOUT",
        delivery_type="TAI_CHO", payment_method="THANH_TOAN_KHI_NHAN_HANG",
        store_location={"kind": "poi", "value": "Thư viện Ánh Dương"},
        branch_candidates=[{"branch_id": "B1"}], summary_fingerprint="old-summary",
        checkout_action_id="old-action",
    )
    cart_manager.set_branch(session, "B1", "Quán Một")
    _seed_location_owner(session)
    monkeypatch.setattr(cart_tools, "is_authenticated_cart_session", lambda _sid: False)

    understood = order_flow_graph._understand(_state(session, "thôi giao tận nơi đi"))
    assert understood["intent"]["intent"] == "SELECT_FULFILLMENT"
    executed = order_flow_graph._execute(understood)["result"]
    prefs = cart_manager.get_checkout_prefs(session)

    assert prefs["delivery_type"] == "GIAO_TAN_NOI"
    assert prefs.get("location_candidate_snapshot") is None
    assert prefs.get("selected_location_candidate") is None
    assert prefs.get("store_location") is None and prefs.get("branch_candidates") is None
    assert cart_manager.get_branch(session) is None
    assert prefs.get("summary_fingerprint") is None and prefs.get("checkout_action_id") is None
    assert prefs["payment_method"] == "THANH_TOAN_KHI_NHAN_HANG"
    assert "số nhà" in executed["reply"] and "phường/xã" in executed["reply"]
    assert (cart_manager.get_pending_action(session) or {}).get("type") != "select_location_candidate"


def test_location_owner_allows_payment_change_but_preserves_location_context(monkeypatch):
    session = _session("location-payment")
    cart_manager.add_item(session, "P1", "Americano", 39000)
    cart_manager.set_checkout_context(
        session, checkout_requested=True, voucher_decided=True,
        delivery_type="TAI_CHO", payment_method="THANH_TOAN_KHI_NHAN_HANG",
    )
    _seed_location_owner(session)
    monkeypatch.setattr(agent_service, "_run_agent_impl", lambda *_args, **_kwargs: {
        "reply": "Mình đã ghi nhận QR.", "checkout_payload": None,
        "tool_calls_log": [], "error": None,
    })

    understood = order_flow_graph._understand(_state(session, "thanh toán QR đi"))
    assert understood["intent"]["intent"] == "SELECT_PAYMENT"
    order_flow_graph._execute(understood)

    prefs = cart_manager.get_checkout_prefs(session)
    assert prefs["payment_method"] == "NGAN_HANG_QR"
    assert prefs["location_candidate_snapshot"]["candidates"][0]["provider_ref_id"] == "L1"
    assert (cart_manager.get_pending_action(session) or {}).get("type") == "select_location_candidate"


@pytest.mark.parametrize("message,expected", [
    ("QR là gì?", "PAYMENT_INFO"),
    ("cho tôi xem giỏ", "VIEW_CART"),
])
def test_read_only_interrupt_preserves_location_owner(message, expected):
    session = _session("location-read")
    _seed_location_owner(session)

    intent = order_flow_graph._understand(_state(session, message))["intent"]

    assert intent["intent"] == expected
    assert (cart_manager.get_pending_action(session) or {}).get("type") == "select_location_candidate"
    assert cart_manager.get_checkout_prefs(session).get("location_candidate_snapshot")


def test_shopping_scope_clarification_consumes_shared_ordinals():
    session = _session("shopping-scope")
    cart_manager.set_pending_action(session, "shopping_scope_clarification", {
        "candidate_products": PRODUCTS, "family": "americano",
        "search_text": "americano", "label": "Americano",
    })

    for message in ("1", "số 1", "món 1", "món số 1", "lấy cái đầu tiên"):
        cart_manager.set_pending_action(session, "shopping_scope_clarification", {
            "candidate_products": PRODUCTS, "family": "americano",
            "search_text": "americano", "label": "Americano",
        })
        intent = order_flow_graph._understand(_state(session, message))["intent"]
        assert intent["intent"] == "ADD_ITEM", message
        assert intent["resolved_products"][0]["product_id"] == "P1"


def test_one_token_visible_family_selection_precedes_catalog_browse():
    unique = interpret_shopping("cho tôi americano đi", snapshot=PRODUCTS)
    assert unique.act == "ADD_ITEM"
    assert [row["product_id"] for row in unique.targets] == ["P1"]

    multiple = interpret_shopping("cho tôi americano đi", snapshot=[
        PRODUCTS[0], {"product_id": "P3", "product_name": "Americano Mơ", "category": "drink"},
    ])
    assert multiple.act == "AMBIGUOUS"

    browse = interpret_shopping("xem các loại americano", snapshot=PRODUCTS)
    assert browse.act == "BROWSE_FAMILY"


def test_geo_dedupe_to_one_effective_candidate_is_not_ambiguous(monkeypatch):
    monkeypatch.setenv("VIETMAP_API_KEY", "test-only")
    suggestions = [
        {"ref_id": "same-1", "name": "Thư viện Ánh Dương"},
        {"ref_id": "same-2", "name": "Thư viện Ánh Dương"},
    ]
    place = {"lat": 10.1, "lng": 106.1, "name": "Thư viện Ánh Dương",
             "display": "Thư viện Ánh Dương, Phường Bình Minh"}

    class Response:
        def __init__(self, data):
            self.data = data

        def raise_for_status(self):
            return None

        def json(self):
            return self.data

    class Client:
        def __init__(self, **_kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def get(self, url, _params=None, **kwargs):
            params = _params or kwargs.get("params") or {}
            return Response(suggestions if "/search/" in url else place)

    monkeypatch.setattr(geo.httpx, "Client", Client)
    result = geo.resolve_location("Thư viện Ánh Dương", "poi")

    assert result.status == "ok"
    assert result.provider_candidate_count == 2
    assert result.provider_ref_id == "same-1"
    assert (result.lat, result.lng) == (10.1, 106.1)


@pytest.mark.parametrize("status,vouchers,expected", [
    ("no_applicable_voucher", [], "không có mã giảm giá"),
    ("ok", [{"ma_voucher": "SAVE10", "ten_voucher": "Ưu đãi hiện tại",
             "so_tien_giam_du_kien": 10000}], "SAVE10"),
    ("error", [], "chưa thể kiểm tra"),
])
def test_voucher_info_uses_authoritative_current_cart_and_preserves_ready_stage(
    monkeypatch, status, vouchers, expected,
):
    session = _session("voucher-info")
    cart_manager.add_item(session, "P1", "Americano", 39000)
    cart_manager.set_checkout_context(
        session, flow_stage="CART_READY", voucher_decided=True,
        payment_method="THANH_TOAN_KHI_NHAN_HANG",
    )
    apply_calls = []
    monkeypatch.setattr(voucher_tools, "execute_get_applicable_vouchers", lambda _sid: {
        "status": status, "vouchers": vouchers,
        "message": "Chưa thể kiểm tra voucher lúc này." if status == "error" else "provider result",
    })
    monkeypatch.setattr(voucher_tools, "execute_apply_voucher",
                        lambda *_args, **_kwargs: apply_calls.append(True) or pytest.fail("voucher auto-applied"))

    result = order_flow_graph._execute({
        **_state(session, "có mã giảm giá ko bạn"), "intent": {"intent": "VOUCHER_INFO"},
    })["result"]

    assert expected.lower() in result["reply"].lower()
    assert "khi bạn hoàn tất giỏ" not in result["reply"].lower()
    assert cart_manager.get_checkout_prefs(session)["flow_stage"] == "CART_READY"
    assert cart_manager.get_cart(session)["items"]
    assert apply_calls == []


@pytest.mark.parametrize("message", [
    "hoàn tất", "hoàn tất đi", "hoàn tất giỏ", "hoàn tất giỏ hàng á b",
    "xong rồi", "vậy được rồi", "oke vậy được rồi", "oke vậy hoàn tất đi", "thế là xong",
    "chốt phần giỏ",
])
def test_cart_ready_stage_understands_natural_idempotent_finish(message):
    session = _session("finish-ready")
    cart_manager.add_item(session, "P1", "Americano", 39000)
    cart_manager.set_checkout_context(session, flow_stage="CART_READY", voucher_decided=True)

    intent = order_flow_graph._understand(_state(session, message))["intent"]

    assert intent["intent"] == "FINISH_CART"


def test_finish_cart_outside_cart_context_does_not_become_business_mutation():
    session = _session("finish-empty")
    intent = order_flow_graph._understand(_state(session, "vậy được rồi"))["intent"]
    assert intent["intent"] != "FINISH_CART"


def test_finish_cart_is_idempotent_once_cart_is_ready(monkeypatch):
    session = _session("finish-idempotent")
    cart_manager.add_item(session, "P1", "Americano", 39000)
    cart_manager.set_checkout_context(session, flow_stage="CART_READY", voucher_decided=True)
    quote = {
        "status": "ok", "cart": cart_manager.get_cart(session),
        "quote": {"subtotal": 39000, "discount_amount": 0, "final_total": 39000},
    }
    monkeypatch.setattr(cart_tools, "execute_get_cart_quote", lambda _sid: quote)
    monkeypatch.setattr(voucher_tools, "execute_get_applicable_vouchers",
                        lambda _sid: pytest.fail("voucher gate must not reopen"))
    before = cart_manager.get_cart(session)["items"]

    for message in ("hoàn tất", "vậy được rồi"):
        state = _state(session, message)
        intent = order_flow_graph._understand(state)["intent"]
        result = order_flow_graph._execute({**state, "intent": intent})["result"]
        assert "tiếp tục" in result["reply"].lower()

    assert cart_manager.get_cart(session)["items"] == before
    assert cart_manager.get_checkout_prefs(session)["flow_stage"] == "CART_READY"
