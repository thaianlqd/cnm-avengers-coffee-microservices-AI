"""Final owner-precedence regressions; no new conversation domains."""
import uuid

import pytest

from src.agents import agent_service, order_flow_graph
from src.agents.location_parser import normalize, parse_location
from src.common import cart_manager
from src.function_calling.tools import branch_tools, cart_tools


def _session(prefix):
    return f"{prefix}-{uuid.uuid4().hex}"


def _sync_local(monkeypatch):
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))


def _branches(count=2):
    return [{
        "ma_chi_nhanh": f"B{index}", "ten_chi_nhanh": f"Cửa hàng {index}",
        "dia_chi": f"Đường {index}", "availability_status": "available",
        "context": "read_only_branch_discovery",
    } for index in range(1, count + 1)]


def _seed_prior_location_checkout(session):
    cart_manager.add_item(session, "P1", "Cà phê Một", 39000)
    old = {
        "kind": "poi", "raw": "Trường Cũ, Phường Sao Mai",
        "value": "Trường Cũ, Phường Sao Mai", "admin_hints": ["Phường Sao Mai"],
        "source": "explicit_user", "status": "retained",
    }
    cart_manager.set_checkout_context(
        session, checkout_requested=True, voucher_decided=True,
        delivery_type="MANG_DI", payment_method="THANH_TOAN_KHI_NHAN_HANG",
        flow_stage="CHECKOUT", last_resolved_location=old,
    )
    cart_manager.set_pending_action(session, "confirm_prior_location_for_checkout", {
        "domain": "CHECKOUT_LOCATION", "action": "REUSE_PRIOR_LOCATION",
        "location": old["value"], "location_kind": old["kind"],
        "admin_hints": old["admin_hints"], "source": "explicit_user",
    })
    return old


def test_prior_location_owner_yields_to_explicit_fulfillment_change(monkeypatch):
    session = _session("prior-fulfillment")
    old = _seed_prior_location_checkout(session)
    _sync_local(monkeypatch)
    monkeypatch.setattr(agent_service, "_run_agent_impl", lambda *_args, **_kwargs: {
        "reply": "Bạn cho mình địa chỉ giao đầy đủ nhé.",
        "checkout_payload": None, "tool_calls_log": [], "error": None,
    })

    result = order_flow_graph.run_order_flow(session, "giao tận nơi")
    prefs = cart_manager.get_checkout_prefs(session)

    assert "địa chỉ giao đầy đủ" in result["reply"]
    assert prefs["delivery_type"] == "GIAO_TAN_NOI"
    assert (cart_manager.get_pending_action(session) or {}).get("type") != "confirm_prior_location_for_checkout"
    assert not prefs.get("store_location") and not prefs.get("delivery_address")
    assert prefs["last_resolved_location"] == old


def test_prior_location_owner_yields_to_new_checkout_location(monkeypatch):
    session = _session("prior-new-location")
    old = _seed_prior_location_checkout(session)
    _sync_local(monkeypatch)
    calls = []
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch",
                        lambda location, session_id: calls.append((location, session_id)) or {
                            "status": "need_branch_selection", "branches": _branches(),
                        })

    result = order_flow_graph.run_order_flow(session, "tôi đang ở quận 7")

    assert calls and calls[0][1] == session
    assert normalize(calls[0][0]) == "quan 7"
    assert old["value"] not in calls[0][0]
    assert "Cửa hàng 1" in result["reply"]
    assert cart_manager.get_pending_action(session)["type"] == "select_branch"


def test_prior_location_owner_preserves_read_only_payment_side_query():
    session = _session("prior-payment-info")
    _seed_prior_location_checkout(session)
    state = {
        "session_id": session, "user_message": "QR là gì?", "history": [],
        "cart": cart_manager.get_cart(session),
    }

    understood = order_flow_graph._understand(state)

    assert understood["intent"]["intent"] == "PAYMENT_INFO"
    assert cart_manager.get_pending_action(session)["type"] == "confirm_prior_location_for_checkout"


@pytest.mark.parametrize("message,expected", [
    ("có", "PRIOR_LOCATION_REUSE_CONFIRM"),
    ("không", "PRIOR_LOCATION_REUSE_DECLINE"),
])
def test_prior_location_plain_confirm_decline_remains_owned(message, expected):
    session = _session("prior-decision")
    _seed_prior_location_checkout(session)

    understood = order_flow_graph._understand({
        "session_id": session, "user_message": message, "history": [],
        "cart": cart_manager.get_cart(session),
    })

    assert understood["intent"]["intent"] == expected


@pytest.mark.parametrize("message", ["1", "số 1", "thứ 1"])
def test_voucher_pending_beats_stale_bare_branch_ordinal(message):
    session = _session("voucher-over-branch")
    cart_manager.set_checkout_context(
        session, last_branch_discovery_candidates=_branches(),
        voucher_offer_pending=True,
        voucher_candidates=[{"ma_voucher": "SAVE10", "ten_voucher": "Mã Một"}],
    )
    cart_manager.set_pending_action(session, "select_voucher", {"count": 1})

    understood = order_flow_graph._understand({
        "session_id": session, "user_message": message, "history": [],
        "cart": cart_manager.get_cart(session),
    })

    assert understood["intent"]["intent"] != "READ_ONLY_BRANCH_FOLLOWUP"
    assert cart_manager.get_pending_action(session)["type"] == "select_voucher"


def test_product_pending_beats_stale_bare_branch_ordinal():
    session = _session("product-over-branch")
    product = {"product_id": "P1", "product_name": "Cà phê Một", "category": "drink"}
    cart_manager.set_checkout_context(
        session, last_branch_discovery_candidates=_branches(),
        last_product_suggestions=[product], product_suggestion_snapshots={"drink": [product]},
    )
    cart_manager.set_pending_action(session, "ask_more_items", {})

    understood = order_flow_graph._understand({
        "session_id": session, "user_message": "số 1", "history": [],
        "cart": cart_manager.get_cart(session),
    })

    assert understood["intent"]["intent"] != "READ_ONLY_BRANCH_FOLLOWUP"
    assert cart_manager.get_pending_action(session)["type"] == "ask_more_items"


def test_unowned_bare_branch_ordinal_still_resolves_read_only():
    session = _session("bare-branch")
    cart_manager.set_checkout_context(session, last_branch_discovery_candidates=_branches())

    understood = order_flow_graph._understand({
        "session_id": session, "user_message": "số 1", "history": [],
        "cart": cart_manager.get_cart(session),
    })

    assert understood["intent"]["intent"] == "READ_ONLY_BRANCH_FOLLOWUP"


def test_explicit_branch_ordinal_interrupt_preserves_voucher_owner():
    session = _session("explicit-branch-side-query")
    cart_manager.set_checkout_context(session, last_branch_discovery_candidates=_branches())
    cart_manager.set_pending_action(session, "select_voucher", {"count": 2})

    understood = order_flow_graph._understand({
        "session_id": session, "user_message": "cửa hàng số 1", "history": [],
        "cart": cart_manager.get_cart(session),
    })

    assert understood["intent"]["intent"] == "READ_ONLY_BRANCH_FOLLOWUP"
    assert cart_manager.get_pending_action(session)["type"] == "select_voucher"


@pytest.mark.parametrize("pending_type,reply", [
    ("select_voucher", "Bạn có muốn mình tìm cửa hàng gần đây không?"),
    ("confirm_checkout", "Nếu muốn mình có thể gợi ý món."),
])
@pytest.mark.parametrize("with_read_only_log", [False, True])
def test_cta_guard_neutralizes_mismatched_owner(monkeypatch, pending_type, reply, with_read_only_log):
    session = _session("cta-mismatch")
    _sync_local(monkeypatch)
    cart_manager.set_pending_action(session, pending_type, {})
    logs = ([{"tool": "payment_capabilities", "result": {"status": "ok"}}]
            if with_read_only_log else [])

    rendered = order_flow_graph._render({
        "session_id": session, "user_message": "cho mình biết thông tin",
        "cart": cart_manager.get_cart(session),
        "result": {"reply": reply, "tool_calls_log": logs,
                   "checkout_payload": None, "error": None},
    })["result"]["reply"]

    assert rendered != reply
    assert cart_manager.get_pending_action(session)["type"] == pending_type


@pytest.mark.parametrize("pending_type,reply", [
    ("offer_branch_search", "Bạn có muốn mình tìm cửa hàng gần đó không?"),
    ("offer_recommendation", "Bạn có muốn mình gợi ý vài món không?"),
])
def test_cta_guard_preserves_matching_owner(monkeypatch, pending_type, reply):
    session = _session("cta-match")
    _sync_local(monkeypatch)
    cart_manager.set_pending_action(session, pending_type, {})

    rendered = order_flow_graph._render({
        "session_id": session, "user_message": "thông tin",
        "cart": cart_manager.get_cart(session),
        "result": {"reply": reply, "tool_calls_log": [],
                   "checkout_payload": None, "error": None},
    })["result"]["reply"]

    assert rendered == reply
    assert cart_manager.get_pending_action(session)["type"] == pending_type


@pytest.mark.parametrize("message,expected", [
    ("địa chỉ của tôi ở quận An Bình", "quan an binh"),
    ("địa chỉ của mình là phường Sao Mai", "phuong sao mai"),
    ("dia chi toi o quan 7", "quan 7"),
])
def test_location_parser_strips_symmetric_conversation_prefix(message, expected):
    parsed = parse_location(message)

    assert parsed.kind == "area"
    assert normalize(parsed.value) == expected
    assert "dia chi" not in normalize(parsed.value)
