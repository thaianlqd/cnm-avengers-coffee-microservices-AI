"""Global entry, read-only branch ownership, and provider-status regressions."""
from copy import deepcopy
from types import SimpleNamespace
import uuid

import pytest

from src.agents import agent_service, order_flow_graph
from src.agents.location_parser import parse_location
from src.common import cart_manager
from src.function_calling.tools import branch_tools, cart_tools, product_tools
from utils import geo


def _session(prefix="global"):
    return f"{prefix}-{uuid.uuid4().hex}"


def _read_only_runtime(monkeypatch):
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(product_tools, "execute_get_recommendations",
                        lambda **_kwargs: pytest.fail("recommendation route reached"))
    monkeypatch.setattr(product_tools, "execute_get_product_insights",
                        lambda *_args, **_kwargs: pytest.fail("product-insights route reached"))
    monkeypatch.setattr(agent_service, "_run_agent_impl",
                        lambda *_args, **_kwargs: pytest.fail("generic model route reached"))


def _branch_result(name="Cửa hàng Ánh Dương"):
    return {
        "status": "ok",
        "branches": [{
            "ma_chi_nhanh": "B1",
            "ten_chi_nhanh": name,
            "dia_chi": "Đường Một",
            "khoang_cach_km": 1.2,
        }],
    }


def _seed_branch_offer(session, location="Trường Sao Mai, Phường An Bình, Thành phố Minh Hải"):
    fact = {
        "kind": "poi",
        "raw": location,
        "value": location,
        "canonical_label": None,
        "source": "explicit_user",
        "status": "retained",
        "admin_hints": ["Phường An Bình", "Thành phố Minh Hải"],
    }
    cart_manager.set_checkout_context(session, last_resolved_location=fact)
    cart_manager.set_pending_action(session, "offer_branch_search", {
        "domain": "BRANCH_DISCOVERY",
        "action": "FIND_NEAREST_BRANCH",
        "location_kind": "poi",
        "raw_location": location,
        "location": location,
        "source": "explicit_user",
    })
    return fact


def test_outside_checkout_location_offer_is_owned_and_resumes_once(monkeypatch):
    session = _session("observed-location")
    _read_only_runtime(monkeypatch)
    calls = []
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch",
                        lambda location, session_id: calls.append((location, session_id)) or _branch_result())

    before = deepcopy(cart_manager.get_cart(session))
    first = order_flow_graph.run_order_flow(
        session, "tôi đang ở trường đại học công nghiệp, phường gò vấp, tp.hcm")
    prefs = cart_manager.get_checkout_prefs(session)
    pending = cart_manager.get_pending_action(session)

    assert pending and pending["type"] == "offer_branch_search"
    assert pending["params"]["action"] == "FIND_NEAREST_BRANCH"
    assert prefs["last_resolved_location"]["kind"] == "poi"
    assert not calls and "cửa hàng" in first["reply"].lower()
    assert not prefs.get("checkout_requested")
    assert not prefs.get("store_location") and not prefs.get("branch_candidates")

    second = order_flow_graph.run_order_flow(session, "có bạn ơi")
    after = cart_manager.get_checkout_prefs(session)
    assert calls == [(pending["params"]["location"], "")]
    assert "Cửa hàng Ánh Dương" in second["reply"]
    assert cart_manager.get_pending_action(session) is None
    assert after["last_resolved_location"] == prefs["last_resolved_location"]
    assert after["last_branch_discovery_candidates"][0]["ma_chi_nhanh"] == "B1"
    assert not after.get("checkout_requested") and not after.get("branch_candidates")
    assert cart_manager.get_cart(session)["items"] == before["items"]


@pytest.mark.parametrize("message", [
    "có", "có bạn", "oke", "ok", "được", "ừ", "tìm đi", "tìm giúp mình", "okkkk",
])
def test_branch_offer_affirmative_corpus_is_deterministic(monkeypatch, message):
    session = _session("branch-yes")
    _read_only_runtime(monkeypatch)
    fact = _seed_branch_offer(session)
    calls = []
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch",
                        lambda location, session_id: calls.append((location, session_id)) or _branch_result())

    result = order_flow_graph.run_order_flow(session, message)

    assert calls == [(fact["value"], "")]
    assert "Cửa hàng Ánh Dương" in result["reply"]
    assert cart_manager.get_pending_action(session) is None


@pytest.mark.parametrize("message", ["không", "thôi", "không cần", "để sau"])
def test_branch_offer_negative_corpus_clears_only_offer(monkeypatch, message):
    session = _session("branch-no")
    _read_only_runtime(monkeypatch)
    fact = _seed_branch_offer(session)
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch",
                        lambda *_args, **_kwargs: pytest.fail("decline searched branches"))

    result = order_flow_graph.run_order_flow(session, message)

    assert cart_manager.get_pending_action(session) is None
    assert cart_manager.get_checkout_prefs(session)["last_resolved_location"] == fact
    assert "khi nào" in result["reply"].lower() or "được" in result["reply"].lower()


def test_explicit_product_browse_supersedes_branch_offer(monkeypatch):
    session = _session("branch-supersede")
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    _seed_branch_offer(session)
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch",
                        lambda *_args, **_kwargs: pytest.fail("superseded branch offer executed"))
    monkeypatch.setattr(order_flow_graph, "_search_menu_catalog", lambda *_args, **_kwargs: {
        "reply": "Menu cà phê", "checkout_payload": None, "tool_calls_log": [], "error": None,
    })

    result = order_flow_graph.run_order_flow(session, "thôi, cho tôi xem cà phê")

    assert result["reply"] == "Menu cà phê"
    assert cart_manager.get_pending_action(session) is None


@pytest.mark.parametrize("message,expected", [
    ("tìm cửa hàng gần tôi", "Trường Sao Mai, Phường An Bình, Thành phố Minh Hải"),
    ("quán nào gần chỗ này", "Trường Sao Mai, Phường An Bình, Thành phố Minh Hải"),
    ("có chi nhánh gần trường này không", "Trường Sao Mai, Phường An Bình, Thành phố Minh Hải"),
    ("tìm quán gần Gò Vấp", "Gò Vấp"),
])
def test_direct_branch_discovery_uses_explicit_or_retained_location_read_only(
        monkeypatch, message, expected):
    session = _session("direct-branch")
    _read_only_runtime(monkeypatch)
    _seed_branch_offer(session)
    cart_manager.clear_pending_action(session)
    calls = []
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch",
                        lambda location, session_id: calls.append((location, session_id)) or _branch_result("Quán Một"))

    before = deepcopy(cart_manager.get_cart(session))
    result = order_flow_graph.run_order_flow(session, message)
    prefs = cart_manager.get_checkout_prefs(session)

    assert calls == [(expected, "")]
    assert "Quán Một" in result["reply"]
    assert cart_manager.get_cart(session)["items"] == before["items"]
    assert not prefs.get("checkout_requested") and not prefs.get("branch_candidates")
    assert prefs["last_branch_discovery_candidates"][0]["ma_chi_nhanh"] == "B1"


@pytest.mark.parametrize("pending_type", ["select_voucher", "confirm_checkout"])
def test_primary_pending_survives_read_only_branch_interrupt(monkeypatch, pending_type):
    session = _session("branch-interrupt")
    _read_only_runtime(monkeypatch)
    cart_manager.set_pending_action(session, pending_type, {"owner": "primary"})
    if pending_type == "confirm_checkout":
        cart_manager.set_checkout_context(
            session, summary_fingerprint="summary-1", checkout_requested=True,
            delivery_type="MANG_DI", payment_method="THANH_TOAN_KHI_NHAN_HANG",
            store_location={"value": "Phường Cũ"},
            suggested_address="Phường Cũ", branch_candidates=[{"branch_id": "OLD"}],
        )
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch",
                        lambda location, session_id: _branch_result("Quán Tạm"))

    result = order_flow_graph.run_order_flow(session, "tìm quán gần phường An Bình")

    assert "Quán Tạm" in result["reply"]
    pending = cart_manager.get_pending_action(session)
    assert pending and pending["type"] == pending_type
    prefs = cart_manager.get_checkout_prefs(session)
    if pending_type == "confirm_checkout":
        assert prefs["branch_candidates"] == [{"branch_id": "OLD"}]
        assert prefs["store_location"] == {"value": "Phường Cũ"}
        assert prefs["suggested_address"] == "Phường Cũ"


@pytest.mark.parametrize("pending_type", ["select_voucher", "confirm_checkout"])
def test_product_info_interrupt_preserves_primary_pending(monkeypatch, pending_type):
    session = _session("product-interrupt")
    if pending_type == "confirm_checkout":
        cart_manager.set_checkout_context(session, summary_fingerprint="summary-1", checkout_requested=True)
    cart_manager.set_pending_action(session, pending_type, {"owner": "primary"})
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(order_flow_graph, "_search_menu_catalog", lambda *_args, **_kwargs: {
        "reply": "Cà phê Sao Mai giá 39.000đ.", "checkout_payload": None,
        "tool_calls_log": [], "error": None,
    })

    result = order_flow_graph.run_order_flow(session, "cà phê Sao Mai giá bao nhiêu?")

    assert "39.000" in result["reply"]
    assert cart_manager.get_pending_action(session)["type"] == pending_type
    if pending_type == "confirm_checkout":
        assert cart_manager.get_checkout_prefs(session)["checkout_requested"] is True
    assert not any(row.get("tool") == "confirm_checkout" for row in result.get("tool_calls_log") or [])


def test_generic_model_branch_offer_is_neutralized_without_owner(monkeypatch):
    session = _session("cta-guard")
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    state = {
        "session_id": session,
        "user_message": "hello",
        "cart": cart_manager.get_cart(session),
        "result": {
            "reply": "Mình đã ghi nhận. Bạn có muốn mình tìm cửa hàng gần bạn không?",
            "tool_calls_log": [], "checkout_payload": None, "error": None,
        },
    }

    rendered = order_flow_graph._render(state)["result"]["reply"]

    assert "có muốn" not in rendered.lower()
    assert cart_manager.get_pending_action(session) is None


def test_voucher_info_is_safe_from_a_fresh_empty_conversation(monkeypatch):
    session = _session("voucher-info")
    _read_only_runtime(monkeypatch)

    result = order_flow_graph.run_order_flow(session, "bên bạn có voucher gì?")

    assert "phụ thuộc" in result["reply"].lower()
    assert cart_manager.get_cart(session)["is_empty"] is True
    assert cart_manager.get_pending_action(session) is None
    assert not result.get("tool_calls_log")


def test_fill_options_owner_survives_unrelated_general_chat(monkeypatch):
    session = _session("fill-options-interrupt")
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    cart_manager.set_pending_products(session, [{
        "product_id": "P1", "product_name": "Món Một", "quantity": 1,
        "option_schema": [{"group": "Kích thước", "values": ["Vừa", "Lớn"]}],
    }])
    cart_manager.set_pending_action(session, "fill_options", {"count": 1})

    result = order_flow_graph.run_order_flow(session, "hello, hôm nay bạn khỏe không?")

    assert result["reply"]
    assert cart_manager.get_pending_action(session)["type"] == "fill_options"
    assert cart_manager.get_checkout_prefs(session)["pending_products"][0]["product_id"] == "P1"


def test_reset_clears_read_only_location_and_branch_discovery_context():
    session = _session("reset-location")
    _seed_branch_offer(session)
    cart_manager.set_checkout_context(session, last_branch_discovery_candidates=[{"ma_chi_nhanh": "B1"}])

    prefs = cart_manager.reset_conversation_draft(session)

    assert not prefs.get("last_resolved_location")
    assert not prefs.get("last_branch_discovery_candidates")
    assert cart_manager.get_pending_action(session) is None


class _Response:
    def __init__(self, data=None, error=None):
        self._data = data
        self._error = error

    def raise_for_status(self):
        if self._error:
            raise self._error

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
            return _Response(error=value) if isinstance(value, Exception) else _Response(value)

    monkeypatch.setattr(geo.httpx, "Client", Client)


def test_one_place_detail_failure_does_not_abort_later_valid_candidate(monkeypatch):
    _provider(monkeypatch, [
        {"ref_id": "bad", "name": "Công viên Sao Mai"},
        {"ref_id": "good", "name": "Công viên Sao Mai"},
    ], {
        "bad": RuntimeError("detail unavailable"),
        "good": {"lat": 10.0, "lng": 106.0, "name": "Công viên Sao Mai",
                 "city": "Thành phố Minh Hải"},
    })

    result = geo.resolve_location("Công viên Sao Mai", "poi")

    assert result.status == "ok"
    assert result.candidate_error_count == 1
    assert (result.lat, result.lng) == (10.0, 106.0)


def test_all_place_detail_failures_are_provider_error(monkeypatch):
    _provider(monkeypatch, [{"ref_id": "a"}, {"ref_id": "b"}], {
        "a": RuntimeError("detail unavailable"),
        "b": TimeoutError("detail timed out"),
    })

    result = geo.resolve_location("Công viên Sao Mai", "poi")

    assert result.status == "provider_error"
    assert result.candidate_error_count == 2


@pytest.mark.parametrize("provider_number,expected", [("12", "ok"), ("42", "rejected")])
def test_address_house_number_must_match_provider_evidence(monkeypatch, provider_number, expected):
    query = "12 Đường Hoa Ban, Phường An Bình, Thành phố Minh Hải"
    _provider(monkeypatch, [{"ref_id": "a1", "display": query}], {
        "a1": {
            "lat": 10.0, "lng": 106.0,
            "address": f"{provider_number} Đường Hoa Ban",
            "street": "Đường Hoa Ban", "ward": "Phường An Bình",
            "city": "Thành phố Minh Hải",
            "formatted_address": f"{provider_number} Đường Hoa Ban, Phường An Bình, Thành phố Minh Hải",
        },
    })

    assert geo.resolve_location(query, "address").status == expected


def test_no_comma_admin_hints_are_extracted_and_validated_independently(monkeypatch):
    parsed = parse_location("trường Sao Mai quận An Phú TP Minh Hải")
    assert parsed.kind == "poi"
    assert parsed.admin_hints == ("quận An Phú", "Thành phố Minh Hải")
    _provider(monkeypatch, [{"ref_id": "p1", "name": "Trường Sao Mai"}], {
        "p1": {"lat": 10.0, "lng": 106.0, "name": "Trường Sao Mai",
               "district": "Quận An Phú", "city": "Thành phố Minh Hải"},
    })
    assert geo.resolve_location(parsed.value, parsed.kind, parsed.admin_hints).status == "ok"


def _catalog_provider(statuses):
    products = {
        "cà phê": [{"product_id": "C1", "product_name": "Cà phê Một", "final_price": 39000}],
        "trà": [{"product_id": "T1", "product_name": "Trà Một", "final_price": 35000}],
    }

    def provider(**kwargs):
        key = kwargs["search_text"]
        status = statuses[key]
        return {"status": status, "products": products[key] if status == "ok" else []}

    return provider


@pytest.mark.parametrize("statuses,expected_status,missing,unavailable", [
    ({"cà phê": "ok", "trà": "error"}, "ok", [], ["Trà"]),
    ({"cà phê": "not_found", "trà": "error"}, "partial_failure", ["Cà phê"], ["Trà"]),
    ({"cà phê": "error", "trà": "error"}, "error", [], ["Cà phê", "Trà"]),
    ({"cà phê": "not_found", "trà": "not_found"}, "not_found", ["Cà phê", "Trà"], []),
])
def test_catalog_preserves_not_found_vs_provider_error(
        monkeypatch, statuses, expected_status, missing, unavailable):
    monkeypatch.setattr(product_tools, "execute_get_recommendations", _catalog_provider(statuses))

    result = order_flow_graph._search_menu_catalog("bên bạn có cà phê với trà gì")

    assert result["catalog_status"] == expected_status
    assert result.get("missing_menu_groups", []) == missing
    assert result.get("unavailable_menu_groups", []) == unavailable
    if unavailable:
        assert "chưa tra cứu được" in result["reply"].lower()
    if missing:
        assert "chưa tìm thấy" in result["reply"].lower()
