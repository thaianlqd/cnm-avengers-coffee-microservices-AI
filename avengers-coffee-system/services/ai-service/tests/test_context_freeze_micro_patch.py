"""Freeze regressions for prior-location fall-through and precise CTA ownership."""
import uuid

import pytest

from src.agents import order_flow_graph
from src.common import cart_manager
from src.function_calling.tools import cart_tools, voucher_tools


def _session(prefix):
    return f"{prefix}-{uuid.uuid4().hex}"


def _sync_local(monkeypatch):
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))


def _seed_prior_location(session):
    cart_manager.add_item(session, "CART-ITEM", "Món trong giỏ", 39000)
    cart_manager.set_checkout_context(
        session, checkout_requested=True, voucher_decided=True,
        delivery_type="MANG_DI", payment_method="THANH_TOAN_KHI_NHAN_HANG",
        last_resolved_location={
            "kind": "area", "raw": "Phường Cũ", "value": "Phường Cũ",
            "source": "explicit_user", "status": "retained", "admin_hints": [],
        },
    )
    cart_manager.set_pending_action(session, "confirm_prior_location_for_checkout", {
        "domain": "CHECKOUT_LOCATION", "action": "REUSE_PRIOR_LOCATION",
        "location": "Phường Cũ", "location_kind": "area", "source": "explicit_user",
    })


def _product():
    return {"product_id": "CANON-1", "product_name": "Cà phê Kiểm Thử", "category": "drink"}


def test_prior_location_supersession_falls_through_product_ordinal(monkeypatch):
    session = _session("prior-product-ordinal")
    product = _product()
    _seed_prior_location(session)
    cart_manager.set_checkout_context(
        session, last_product_suggestions=[product],
        product_suggestion_snapshots={"drink": [product]},
    )
    monkeypatch.setattr(order_flow_graph, "_load_active_product_targets", lambda: [product])

    understood = order_flow_graph._understand({
        "session_id": session, "user_message": "cho tôi món số 1", "history": [],
        "cart": cart_manager.get_cart(session),
    })

    assert understood["intent"]["intent"] == "ADD_ITEM"
    assert understood["intent"]["resolved_products"][0]["product_id"] == "CANON-1"
    assert cart_manager.get_pending_action(session) is None


def test_prior_location_supersession_falls_through_named_product(monkeypatch):
    session = _session("prior-named-product")
    product = _product()
    _seed_prior_location(session)
    monkeypatch.setattr(order_flow_graph, "_load_active_product_targets", lambda: [product])

    understood = order_flow_graph._understand({
        "session_id": session, "user_message": "thêm cho tôi Cà phê Kiểm Thử", "history": [],
        "cart": cart_manager.get_cart(session),
    })

    assert understood["intent"]["intent"] == "ADD_ITEM"
    assert understood["intent"]["resolved_products"][0]["product_id"] == "CANON-1"
    assert cart_manager.get_pending_action(session) is None


def test_prior_location_supersession_preserves_voucher_code(monkeypatch):
    session = _session("prior-voucher-command")
    _seed_prior_location(session)
    _sync_local(monkeypatch)
    seen = []
    monkeypatch.setattr(voucher_tools, "execute_apply_voucher",
                        lambda sid, code: seen.append((sid, code)) or {
                            "status": "ok", "message": f"Đã áp dụng {code}",
                        })

    result = order_flow_graph.run_order_flow(session, "áp mã SAVE10")

    assert seen == [(session, "SAVE10")]
    assert result["tool_calls_log"][0]["tool"] == "apply_voucher"
    assert (cart_manager.get_pending_action(session) or {}).get("type") != "confirm_prior_location_for_checkout"


def test_bare_voucher_ordinal_beats_stale_branch_context_end_to_end(monkeypatch):
    session = _session("voucher-bare-ordinal")
    cart_manager.add_item(session, "P1", "Cà phê", 50000)
    candidates = [{"ma_voucher": "SAVE10", "ten_voucher": "Mã Một"}]
    cart_manager.set_checkout_context(
        session,
        last_branch_discovery_candidates=[{
            "ma_chi_nhanh": "B1", "ten_chi_nhanh": "Cửa hàng Cũ",
            "dia_chi": "Đường Cũ", "context": "read_only_branch_discovery",
        }],
        voucher_offer_pending=True, voucher_candidates=candidates,
        voucher_offer_snapshot=order_flow_graph._voucher_offer_snapshot(session),
    )
    cart_manager.set_pending_action(session, "select_voucher", {"count": 1})
    _sync_local(monkeypatch)
    seen = []
    monkeypatch.setattr(voucher_tools, "execute_apply_voucher",
                        lambda sid, code: seen.append((sid, code)) or {
                            "status": "ok", "message": f"Đã áp dụng {code}",
                        })

    result = order_flow_graph.run_order_flow(session, "1")
    prefs = cart_manager.get_checkout_prefs(session)

    assert seen == [(session, "SAVE10")]
    assert result["tool_calls_log"][0]["tool"] == "apply_voucher"
    assert prefs["voucher_code"] == "SAVE10"
    assert cart_manager.get_branch(session) is None
    assert prefs["last_branch_discovery_candidates"][0]["ma_chi_nhanh"] == "B1"


@pytest.mark.parametrize("pending_type,reply,preserved", [
    (None, "Bạn muốn mình tìm cửa hàng gần đó không?", False),
    ("offer_branch_search", "Bạn muốn mình tìm cửa hàng gần đó không?", True),
    ("select_payment", "Bạn có muốn mình xác nhận đơn không?", False),
    ("confirm_checkout", "Bạn có muốn mình xác nhận đơn không?", True),
    ("fill_options", "Bạn có muốn mình thêm món khác không?", False),
    ("ask_more_items", "Bạn có muốn mình thêm món khác không?", True),
])
def test_cta_requires_precise_matching_owner(monkeypatch, pending_type, reply, preserved):
    session = _session("precise-cta")
    _sync_local(monkeypatch)
    if pending_type:
        cart_manager.set_pending_action(session, pending_type, {})

    rendered = order_flow_graph._render({
        "session_id": session, "user_message": "cho mình biết thông tin", "history": [],
        "cart": cart_manager.get_cart(session),
        "result": {"reply": reply, "checkout_payload": None,
                   "tool_calls_log": [{"tool": "payment_capabilities", "result": {"status": "ok"}}],
                   "error": None},
    })["result"]["reply"]

    assert (rendered == reply) is preserved
    assert (cart_manager.get_pending_action(session) or {}).get("type") == pending_type
