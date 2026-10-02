"""Business boundaries shared by shopping, voucher, and retry turns."""
import uuid

import pytest

from src.agents import order_flow_graph as graph
from src.common import cart_manager
from src.function_calling.tools import cart_tools, product_tools, voucher_tools


@pytest.fixture
def session(monkeypatch):
    sid = "systemic-" + uuid.uuid4().hex
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda key: cart_manager.get_cart(key))
    return sid


@pytest.mark.parametrize("message", [
    "tôi muốn thêm món, bên bạn có bánh mặn không",
    "cho tôi xem thêm bánh mặn",
    "có bánh mặn nào không",
    "muốn mua thêm, xem bánh mặn đi",
])
def test_category_request_never_stages_a_product(session, monkeypatch, message):
    cart_manager.add_item(session, "old", "Món cũ", 30000)
    cart_manager.set_checkout_context(session, voucher_code="OLD", voucher_decided=True)
    cart_manager.set_pending_action(session, "select_voucher", {"count": 1})
    monkeypatch.setattr(graph, "_load_active_product_targets", lambda: [])
    searched = []
    monkeypatch.setattr(graph, "_search_menu_catalog", lambda raw: searched.append(raw) or {
        "reply": "Menu bánh mặn", "checkout_payload": None, "tool_calls_log": [], "error": None,
    })
    monkeypatch.setattr(product_tools, "execute_get_product_options", lambda *_: pytest.fail("fake product lookup"))
    before = list(cart_manager.get_cart(session)["items"])
    result = graph.run_order_flow(session, message)
    assert result["reply"] == "Menu bánh mặn"
    assert searched and cart_manager.get_cart(session)["items"] == before
    prefs = cart_manager.get_checkout_prefs(session)
    assert not prefs.get("pending_products")
    assert prefs["voucher_code"] == "OLD" and prefs["voucher_decided"] is True


@pytest.mark.parametrize("message", ["tôi muốn thêm món", "thêm ABCXYZ", "thêm bánh mặn"])
def test_no_canonical_target_means_no_write_or_ghost(session, monkeypatch, message):
    monkeypatch.setattr(graph, "_load_active_product_targets", lambda: [])
    monkeypatch.setattr(product_tools, "execute_get_product_options", lambda *_: pytest.fail("fake product lookup"))
    monkeypatch.setattr(cart_tools, "execute_add_to_cart", lambda **_: pytest.fail("cart write"))
    monkeypatch.setattr(graph, "_search_menu_catalog", lambda *_: {
        "reply": "Chọn món cụ thể", "checkout_payload": None, "tool_calls_log": [], "error": None,
    })
    graph.run_order_flow(session, message)
    assert cart_manager.get_cart(session)["is_empty"]
    assert not cart_manager.get_checkout_prefs(session).get("pending_products")


def test_pending_store_rejects_products_without_canonical_id(session):
    saved = cart_manager.set_pending_products(session, [
        {"product_name": "món, bên bạn có bánh mặn không"},
        {"product_id": "P1", "product_name": "Butter Croissant"},
    ])
    assert [(item["product_id"], item["product_name"]) for item in saved] == [("P1", "Butter Croissant")]


def test_legacy_ghost_pending_no_longer_locks_shopping(session, monkeypatch):
    cart_manager.set_checkout_context(session, pending_products=[{"product_name": "món giả"}])
    cart_manager.set_pending_action(session, "fill_options", {})
    monkeypatch.setattr(graph, "_load_active_product_targets", lambda: [])
    graph._understand({"session_id": session, "user_message": "tôi muốn thêm món",
                       "history": [], "cart": cart_manager.get_cart(session)})
    assert not cart_manager.get_checkout_prefs(session).get("pending_products")
    assert not cart_manager.get_pending_action(session)


def test_displayed_text_cards_snapshot_and_ordinal_share_one_list(session):
    raw = [
        {"product_id": "1", "product_name": "Cà Phê Muối", "category": "drink", "final_price": 35000},
        {"product_id": "2", "product_name": "Matcha", "category": "drink", "final_price": 40000},
        {"product_id": "1", "product_name": "Cà Phê Muối", "category": "drink", "final_price": 35000},
        {"product_id": "3", "product_name": "Americano Chanh Leo", "category": "drink", "final_price": 39000},
    ]
    state = graph._render({"session_id": session, "result": {"reply": "arbitrary model numbering",
        "tool_calls_log": [{"tool": "get_recommendations", "args": {"category": "drink"},
                            "result": {"status": "ok", "products": raw}}]}})
    result = state["result"]
    displayed = cart_manager.get_checkout_prefs(session)["last_product_suggestions"]
    cards = result["ui_payload"]["products"]
    assert [item["product_id"] for item in displayed] == [item["product_id"] for item in cards] == ["1", "2", "3"]
    for index, item in enumerate(displayed, 1):
        assert f"{index}. {item['product_name']}" in result["reply"]
        assert graph._resolve_suggested_product(session, f"món số {index}")["product_id"] == item["product_id"]


def test_no_voucher_finish_retry_is_same_turn(session, monkeypatch):
    cart_manager.add_item(session, "P1", "Món đang chọn", 95000)
    cart_manager.set_pending_action(session, "ask_more_items", {})
    monkeypatch.setattr(cart_tools, "execute_get_cart_quote", lambda key: {
        "status": "ok", "cart": cart_manager.get_cart(key),
        "quote": {"subtotal": 95000, "discount_amount": 0, "final_total": 95000},
    })
    calls = []
    monkeypatch.setattr(voucher_tools, "execute_get_applicable_vouchers", lambda *_: calls.append(1) or {
        "status": "no_applicable_voucher", "vouchers": []})
    first = graph.run_order_flow(session, "oke vậy được rồi", client_message_id="finish-1")
    second = graph.run_order_flow(session, "oke vậy được rồi", client_message_id="finish-1")
    prefs = cart_manager.get_checkout_prefs(session)
    assert first == second and len(calls) == 1
    assert "không có mã giảm giá phù hợp" in first["reply"]
    assert prefs["flow_stage"] == "CART_READY" and prefs["voucher_decided"] is True
    assert not prefs.get("checkout_requested")


def test_delivery_address_needs_street_and_full_locality():
    from src.agents.agent_service import _deliverable_address_from_message
    assert _deliverable_address_from_message("gần phường Gò Vấp") is None
    assert _deliverable_address_from_message("123 Nguyễn Trãi, Quận 5") is None
    assert _deliverable_address_from_message("12 Nguyễn Văn Bảo, Phường 4, Quận Gò Vấp, TP.HCM")


def test_area_hint_cannot_start_delivery_geocoding(session, monkeypatch):
    from src.agents import agent_service
    from src.function_calling.tools import branch_tools
    cart_manager.add_item(session, "P1", "Nước", 45000)
    cart_manager.set_checkout_context(session, checkout_requested=True, voucher_decided=True,
        delivery_type="GIAO_TAN_NOI", payment_method="THANH_TOAN_KHI_NHAN_HANG",
        address_change_requested=True)
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda **_: pytest.fail("area geocoded"))
    monkeypatch.setattr(agent_service, "groq_agent_chat", lambda **_: pytest.fail("area sent to model"))
    result = agent_service._run_agent_impl(session, "gần phường Gò Vấp", history=[], allow_model_mutations=False)
    prefs = cart_manager.get_checkout_prefs(session)
    assert "số nhà" in result["reply"]
    assert not prefs.get("delivery_address") and not prefs.get("location_address")


def test_real_cart_change_revalidates_selected_voucher_before_ready(session, monkeypatch):
    cart_manager.add_item(session, "P1", "Nước", 50000)
    cart_manager.set_checkout_context(session, voucher_code="SAVE", voucher_decided=True, discount_amount=10000)
    cart_manager.add_item(session, "P2", "Bánh", 50000)
    prefs = cart_manager.get_checkout_prefs(session)
    assert prefs["voucher_revalidation_required"] and not prefs.get("voucher_decided")
    monkeypatch.setattr(cart_tools, "execute_get_cart_quote", lambda key: {
        "status": "ok", "cart": cart_manager.get_cart(key),
        "quote": {"subtotal": 100000, "discount_amount": 20000, "final_total": 80000},
    })
    checked = []
    def apply(key, code):
        checked.append((key, code))
        cart_manager.set_checkout_context(key, voucher_code=code, discount_amount=20000,
            voucher_decided=True, voucher_revalidation_required=None)
        return {"status": "ok", "voucher_code": code}
    monkeypatch.setattr(voucher_tools, "execute_apply_voucher", apply)
    graph._offer_voucher_gate(session)
    prefs = cart_manager.get_checkout_prefs(session)
    assert checked == [(session, "SAVE")]
    assert prefs["flow_stage"] == "CART_READY" and prefs["discount_amount"] == 20000
