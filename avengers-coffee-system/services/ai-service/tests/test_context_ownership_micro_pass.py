"""Final context-ownership micro-pass regressions."""
from copy import deepcopy
import uuid

import pytest

from src.agents import agent_service, order_flow_graph
from src.common import cart_manager
from src.function_calling.tools import branch_tools, cart_tools, product_tools


def _session(prefix):
    return f"{prefix}-{uuid.uuid4().hex}"


def _sync_local(monkeypatch):
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))


@pytest.mark.parametrize("reply", [
    "Mình có thể tìm cửa hàng gần bạn nếu bạn muốn.",
    "Có cần mình tìm chi nhánh gần nhất không?",
    "Nếu muốn mình có thể gợi ý vài món.",
    "Mình có thể giúp bạn tiếp tục thanh toán nếu cần.",
])
@pytest.mark.parametrize("with_read_only_log", [False, True])
def test_orphan_cta_guard_is_wording_and_read_only_log_safe(monkeypatch, reply, with_read_only_log):
    session = _session("orphan-cta")
    _sync_local(monkeypatch)
    logs = ([{"tool": "payment_capabilities", "result": {"status": "ok"}}]
            if with_read_only_log else [])
    state = {
        "session_id": session,
        "user_message": "cho mình biết thông tin nhé",
        "cart": cart_manager.get_cart(session),
        "result": {"reply": reply, "tool_calls_log": logs,
                   "checkout_payload": None, "error": None},
    }

    rendered = order_flow_graph._render(state)["result"]["reply"]

    assert rendered and rendered != reply
    assert cart_manager.get_pending_action(session) is None
    assert not any(fragment in rendered.lower() for fragment in (
        "nếu bạn muốn", "có cần mình", "nếu muốn mình", "nếu cần",
    ))


def test_owned_deterministic_cta_is_not_rewritten(monkeypatch):
    session = _session("owned-cta")
    _sync_local(monkeypatch)
    cart_manager.set_pending_action(session, "offer_branch_search", {
        "domain": "BRANCH_DISCOVERY", "action": "FIND_NEAREST_BRANCH",
        "location": "Phường An Bình", "location_kind": "area",
    })
    reply = "Bạn có muốn mình tìm cửa hàng gần đó không?"

    rendered = order_flow_graph._render({
        "session_id": session, "user_message": "tôi ở phường An Bình",
        "cart": cart_manager.get_cart(session),
        "result": {"reply": reply, "tool_calls_log": [],
                   "checkout_payload": None, "error": None},
    })["result"]["reply"]

    assert rendered == reply
    assert cart_manager.get_pending_action(session)["type"] == "offer_branch_search"


@pytest.mark.parametrize("message", [
    "địa chỉ của tôi ở quận Gò Vấp",
    "tôi đang ở quận 7",
    "tôi ở quận này",
    "phường X, quận Y",
    "dia chi toi o quan 7",
])
def test_district_location_is_not_direct_branch_discovery(monkeypatch, message):
    session = _session("district-location")
    _sync_local(monkeypatch)
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch",
                        lambda *_args, **_kwargs: pytest.fail("district statement searched branches"))
    monkeypatch.setattr(agent_service, "_run_agent_impl",
                        lambda *_args, **_kwargs: pytest.fail("district statement reached model"))

    result = order_flow_graph.run_order_flow(session, message)
    prefs = cart_manager.get_checkout_prefs(session)

    assert prefs.get("last_resolved_location"), result
    assert cart_manager.get_pending_action(session)["type"] == "offer_branch_search"
    assert not prefs.get("last_branch_discovery_candidates")


@pytest.mark.parametrize("message", [
    "tìm quán gần tôi",
    "quán nào gần đây?",
    "có cửa hàng gần đây không?",
    "tìm chi nhánh gần trường này",
    "tim quan gan day",
])
def test_store_discovery_positive_grammar_still_routes_read_only(monkeypatch, message):
    session = _session("store-positive")
    _sync_local(monkeypatch)
    cart_manager.set_checkout_context(session, last_resolved_location={
        "kind": "area", "raw": "Phường An Bình", "value": "Phường An Bình",
        "source": "explicit_user", "status": "retained", "admin_hints": [],
    })
    seen = []
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch",
                        lambda location, session_id: seen.append((location, session_id)) or {
                            "status": "ok", "branches": [{
                                "ma_chi_nhanh": "B1", "ten_chi_nhanh": "Cửa hàng Một",
                                "dia_chi": "Đường Một",
                            }],
                        })
    monkeypatch.setattr(agent_service, "_run_agent_impl",
                        lambda *_args, **_kwargs: pytest.fail("branch request reached model"))

    result = order_flow_graph.run_order_flow(session, message)

    assert seen == [("Phường An Bình", "")]
    assert "Cửa hàng Một" in result["reply"]
    assert not cart_manager.get_checkout_prefs(session).get("checkout_requested")


def _branch_candidates(count=3):
    return [{
        "ma_chi_nhanh": f"B{index}", "ten_chi_nhanh": f"Cửa hàng {index}",
        "dia_chi": f"Đường {index}", "khoang_cach_km": float(index),
        "context": "read_only_branch_discovery",
    } for index in range(1, count + 1)]


def test_read_only_branch_ordinal_returns_detail_without_transaction_mutation(monkeypatch):
    session = _session("branch-ordinal")
    _sync_local(monkeypatch)
    cart_manager.set_checkout_context(session, last_branch_discovery_candidates=_branch_candidates())
    before_cart = deepcopy(cart_manager.get_cart(session))

    result = order_flow_graph.run_order_flow(session, "cửa hàng số 1")
    prefs = cart_manager.get_checkout_prefs(session)

    assert "Cửa hàng 1" in result["reply"] and "Đường 1" in result["reply"]
    assert prefs["last_branch_focus"]["ma_chi_nhanh"] == "B1"
    assert not prefs.get("checkout_requested") and not prefs.get("branch_candidates")
    assert cart_manager.get_branch(session) is None
    assert cart_manager.get_cart(session)["items"] == before_cart["items"]


def test_invalid_read_only_branch_ordinal_is_branch_specific(monkeypatch):
    session = _session("branch-invalid")
    _sync_local(monkeypatch)
    cart_manager.set_checkout_context(session, last_branch_discovery_candidates=_branch_candidates())

    result = order_flow_graph.run_order_flow(session, "cửa hàng số 8")

    assert "3 cửa hàng" in result["reply"] and "số 8" in result["reply"]
    assert cart_manager.get_branch(session) is None


def test_product_and_read_only_branch_ordinal_namespaces_do_not_collide(monkeypatch):
    session = _session("ordinal-namespaces")
    product = {"product_id": "P1", "product_name": "Cà phê Một", "category": "drink"}
    cart_manager.set_checkout_context(
        session, last_branch_discovery_candidates=_branch_candidates(),
        last_product_suggestions=[product], product_suggestion_snapshots={"drink": [product]},
    )
    monkeypatch.setattr(order_flow_graph, "_load_active_product_targets", lambda: [product])
    base = {"session_id": session, "history": [], "cart": {"items": [], "is_empty": True}}

    product_turn = order_flow_graph._understand({**base, "user_message": "món số 1"})
    branch_turn = order_flow_graph._understand({**base, "user_message": "cửa hàng số 1"})
    bare_turn = order_flow_graph._understand({**base, "user_message": "số 1"})

    assert product_turn["intent"]["intent"] == "ADD_ITEM"
    assert branch_turn["intent"]["intent"] == "READ_ONLY_BRANCH_FOLLOWUP"
    assert bare_turn["intent"]["intent"] == "ORDINAL_CONTEXT_CLARIFY"


def _seed_pickup_checkout(session):
    cart_manager.add_item(session, "P1", "Cà phê Một", 39000)
    fact = {
        "kind": "poi", "raw": "Trường Sao Mai, Phường An Bình",
        "value": "Trường Sao Mai, Phường An Bình", "canonical_label": None,
        "admin_hints": ["Phường An Bình"], "source": "explicit_user", "status": "retained",
    }
    cart_manager.set_checkout_context(
        session, checkout_requested=True, voucher_decided=True, payment_method="THANH_TOAN_KHI_NHAN_HANG",
        flow_stage="CHECKOUT", last_resolved_location=fact,
    )
    return fact


def test_pickup_offers_typed_prior_location_reuse_without_silent_promotion(monkeypatch):
    session = _session("prior-location-offer")
    fact = _seed_pickup_checkout(session)
    _sync_local(monkeypatch)
    monkeypatch.setattr(agent_service, "_run_agent_impl",
                        lambda *_args, **_kwargs: pytest.fail("reuse offer reached legacy model"))

    result = order_flow_graph.run_order_flow(session, "lấy tại quán")
    prefs = cart_manager.get_checkout_prefs(session)
    pending = cart_manager.get_pending_action(session)

    assert pending and pending["type"] == "confirm_prior_location_for_checkout"
    assert pending["params"]["location"] == fact["value"]
    assert fact["value"] in result["reply"]
    assert not prefs.get("store_location") and not prefs.get("location_address")
    assert cart_manager.get_branch(session) is None


def test_confirm_prior_location_uses_existing_transactional_location_path(monkeypatch):
    session = _session("prior-location-confirm")
    fact = _seed_pickup_checkout(session)
    cart_manager.set_checkout_context(session, delivery_type="MANG_DI")
    cart_manager.set_pending_action(session, "confirm_prior_location_for_checkout", {
        "domain": "CHECKOUT_LOCATION", "action": "REUSE_PRIOR_LOCATION",
        "location": fact["value"], "location_kind": fact["kind"],
        "admin_hints": fact["admin_hints"], "source": "explicit_user",
    })
    _sync_local(monkeypatch)
    calls = []
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch",
                        lambda location, session_id: calls.append((location, session_id)) or {
                            "status": "need_branch_selection", "branches": _branch_candidates(2),
                        })
    monkeypatch.setattr(branch_tools, "execute_set_session_branch",
                        lambda *_args, **_kwargs: pytest.fail("reuse directly selected a branch"))

    result = order_flow_graph.run_order_flow(session, "có")
    prefs = cart_manager.get_checkout_prefs(session)

    assert calls == [(fact["value"], session)]
    assert "Cửa hàng 1" in result["reply"]
    assert prefs.get("store_location") and prefs.get("branch_candidates")
    assert cart_manager.get_pending_action(session)["type"] == "select_branch"
    assert cart_manager.get_branch(session) is None


def test_reject_prior_location_returns_to_normal_pickup_collection(monkeypatch):
    session = _session("prior-location-reject")
    fact = _seed_pickup_checkout(session)
    cart_manager.set_checkout_context(session, delivery_type="TAI_CHO")
    cart_manager.set_pending_action(session, "confirm_prior_location_for_checkout", {
        "domain": "CHECKOUT_LOCATION", "action": "REUSE_PRIOR_LOCATION",
        "location": fact["value"], "location_kind": fact["kind"],
        "source": "explicit_user",
    })
    _sync_local(monkeypatch)
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch",
                        lambda *_args, **_kwargs: pytest.fail("rejected location searched branches"))

    result = order_flow_graph.run_order_flow(session, "không, tôi ở chỗ khác")
    prefs = cart_manager.get_checkout_prefs(session)

    assert cart_manager.get_pending_action(session) is None
    assert prefs.get("location_pending") is True
    assert not prefs.get("store_location") and cart_manager.get_branch(session) is None
    assert prefs["last_resolved_location"] == fact
    assert "khu vực" in result["reply"].lower() or "vị trí" in result["reply"].lower()


def test_delivery_never_reuses_prior_poi_or_area(monkeypatch):
    session = _session("prior-location-delivery")
    _seed_pickup_checkout(session)
    _sync_local(monkeypatch)
    monkeypatch.setattr(agent_service, "_run_agent_impl", lambda *_args, **_kwargs: {
        "reply": "Bạn cho mình địa chỉ giao đầy đủ nhé.",
        "checkout_payload": None, "tool_calls_log": [], "error": None,
    })

    result = order_flow_graph.run_order_flow(session, "giao tận nơi")
    prefs = cart_manager.get_checkout_prefs(session)

    assert "địa chỉ giao đầy đủ" in result["reply"]
    assert (cart_manager.get_pending_action(session) or {}).get("type") != "confirm_prior_location_for_checkout"
    assert not prefs.get("store_location") and not prefs.get("delivery_address")

