"""Location intent, branch ownership and replay identity regressions."""
import uuid

import pytest

from src.agents import agent_service, order_flow_graph
from src.agents.location_parser import parse_location
from src.common import cart_manager
from src.function_calling.tools import branch_tools, cart_tools, product_tools


def _session(monkeypatch, delivery_type="MANG_DI", suggested=True):
    session = "location-pass-" + uuid.uuid4().hex
    cart_manager.add_item(session, "P1", "Cà phê", 35000)
    cart_manager.set_checkout_context(session, checkout_requested=True, delivery_type=delivery_type,
        payment_method="THANH_TOAN_KHI_NHAN_HANG", voucher_decided=True,
        suggested_address="42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Quận Tân Phú, Thành phố Hồ Chí Minh" if suggested else None)
    if suggested:
        cart_manager.set_pending_action(session, "confirm_address", {})
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(product_tools, "execute_get_recommendations", lambda **kw: pytest.fail("product recommendation in location turn"))
    monkeypatch.setattr(agent_service, "_run_agent_impl", lambda *a, **k: pytest.fail("free agent in location turn"))
    return session


@pytest.mark.parametrize("message,expected", [
    ("tôi đang ở 87C Tân Thắng, P. Sơn Kỳ, Tân Phú", "87C Tân Thắng, Phường Sơn Kỳ, Tân Phú"),
    ("không, tôi đang ở 71 Đường D9, P. Sơn Kỳ, Q. Tân Phú, TP. Hồ Chí Minh", "71 Đường D9, Phường Sơn Kỳ, Quận Tân Phú, Thành phố Hồ Chí Minh"),
    ("cho tôi địa chỉ quán nào gần phường Tây Thạnh đi", "phường Tây Thạnh"),
])
def test_pickup_new_location_owns_turn(monkeypatch, message, expected):
    session = _session(monkeypatch)
    seen = []
    def find(location, session_id):
        seen.append(location)
        return {"status": "need_branch_selection", "branches": [{"ma_chi_nhanh": "B1", "ten_chi_nhanh": "Chi nhánh 1", "availability_status": "available", "khoang_cach_km": 1}]}
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", find)
    result = order_flow_graph.run_order_flow(session, message)
    assert seen == [expected]
    assert cart_manager.get_checkout_prefs(session)["location_address"] == expected
    assert cart_manager.get_pending_action(session)["type"] == "select_branch"
    assert "Chi nhánh 1" in result["reply"]
    assert not {entry["tool"] for entry in result["tool_calls_log"]} & {"get_recommendations", "get_product_insights", "get_product_options"}


def test_partial_delivery_address_asks_for_missing_fields_without_geocoding(monkeypatch):
    session = _session(monkeypatch, delivery_type="GIAO_TAN_NOI")
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda **kw: pytest.fail("partial delivery geocoded"))
    result = order_flow_graph.run_order_flow(session, "tôi đang ở 87C Tân Thắng, P. Sơn Kỳ, Tân Phú")
    assert "quận/huyện" in result["reply"] and "tỉnh/thành phố" in result["reply"]
    assert cart_manager.get_checkout_prefs(session).get("partial_delivery_address") == "87C Tân Thắng, Phường Sơn Kỳ, Tân Phú"


def test_delivery_missing_locality_can_be_supplied_next_turn(monkeypatch):
    session = _session(monkeypatch, delivery_type="GIAO_TAN_NOI")
    seen = []
    def find(location, session_id):
        seen.append(location)
        return {"status": "ok", "branches": [{"ma_chi_nhanh": "B1", "ten_chi_nhanh": "Chi nhánh 1"}]}
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", find)
    monkeypatch.setattr(branch_tools, "execute_set_session_branch", lambda *args, **kwargs: {"status": "ok", "message": "Đã chọn chi nhánh"})
    monkeypatch.setattr(agent_service, "_advance_checkout_if_ready", lambda sid, result: result)
    first = order_flow_graph.run_order_flow(session, "tôi ở 87C Tân Thắng, P. Sơn Kỳ, Tân Phú")
    assert "quận/huyện" in first["reply"]
    second = order_flow_graph.run_order_flow(session, "Quận Tân Phú, TP.HCM")
    assert seen == ["87C Tân Thắng, Phường Sơn Kỳ, Tân Phú, Quận Tân Phú, Thành phố HCM"]
    assert "Đã chọn chi nhánh" in second["reply"]
    assert not cart_manager.get_checkout_prefs(session).get("partial_delivery_address")


def test_store_lookup_outside_checkout_is_read_only(monkeypatch):
    session = "store-info-" + uuid.uuid4().hex
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(product_tools, "execute_get_recommendations", lambda **kw: pytest.fail("product recommendation"))
    seen = []
    def find(location, session_id):
        seen.append(location)
        return {"status": "ok", "branches": [{"ten_chi_nhanh": "Quán Tây Thạnh", "dia_chi": "Tây Thạnh", "khoang_cach_km": 2.3}]}
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", find)
    result = order_flow_graph.run_order_flow(session, "tìm quán gần phường Tây Thạnh")
    assert seen == ["phường Tây Thạnh"]
    assert "Quán Tây Thạnh" in result["reply"]
    assert not cart_manager.get_checkout_prefs(session).get("checkout_requested")


def test_structural_address_parser_and_branch_number():
    assert parse_location("12/5A Đường 3 Tháng 2, P. 10, Q. 10, TP.HCM").missing == ()
    assert parse_location("12A Đường 3 Tháng 2, P. 10, Q. 10, TP.HCM").kind == "address"
    assert parse_location("71 Đường D9, P. Sơn Kỳ").kind == "address"
    assert parse_location("42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh").kind == "address"
    assert parse_location("chọn tôi địa chỉ số 3 đi").kind == "none"
    assert parse_location("cửa hàng nào gần đây").value == ""


def test_geocoder_not_found_asks_for_specific_locality(monkeypatch):
    session = _session(monkeypatch)
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda **kw: {
        "status": "not_found", "message": "Không tìm thấy vị trí."})
    result = order_flow_graph.run_order_flow(session, "tôi ở Tây Thạnh")
    assert "bản đồ" in result["reply"]
    assert "quận" in result["reply"] and "tỉnh" in result["reply"]
    assert not cart_manager.get_checkout_prefs(session).get("pending_products")


def test_replay_metadata_does_not_stale_summary_but_business_change_does():
    session = "fingerprint-pass-" + uuid.uuid4().hex
    cart_manager.add_item(session, "P1", "Cà phê", 35000)
    cart_manager.set_checkout_prefs(session, payment_method="THANH_TOAN_KHI_NHAN_HANG", delivery_type="MANG_DI")
    cart_manager.set_branch(session, "B1", "Chi nhánh 1")
    cart_manager.mark_checkout_summary(session)
    original = cart_manager.cart_fingerprint(session)
    cart_manager.set_checkout_context(session, processed_order_turns={"turn-1": {"message": "ok"}},
        last_product_suggestions=[{"product_id": "P1"}], flow_stage="SUMMARY",
        product_suggestion_snapshots={"latest": [{"product_id": "P1"}]})
    assert cart_manager.cart_fingerprint(session) == original
    assert cart_manager.get_checkout_prefs(session)["summary_fingerprint"] == original
    cart_manager.set_checkout_prefs(session, delivery_type="GIAO_TAN_NOI", delivery_address="12 Đường A")
    assert cart_manager.cart_fingerprint(session) != original


def test_mixed_menu_headings_keep_one_global_snapshot(monkeypatch):
    session = "menu-groups-" + uuid.uuid4().hex
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    products = [
        {"product_id": "D1", "product_name": "Nước 1", "category": "drink", "final_price": 20000},
        {"product_id": "F1", "product_name": "Bánh 1", "category": "food", "final_price": 30000},
        {"product_id": "D2", "product_name": "Nước 2", "category": "drink", "final_price": 25000},
    ]
    state = order_flow_graph._render({"session_id": session, "result": {"reply": "original",
        "tool_calls_log": [{"tool": "get_recommendations", "args": {"category": "all", "criteria": "rating"},
                            "result": {"status": "ok", "source": "hot", "products": products}}]}})
    result = state["result"]
    snapshot = cart_manager.get_checkout_prefs(session)["last_product_suggestions"]
    assert [item["product_id"] for item in snapshot] == [item["product_id"] for item in result["ui_payload"]["products"]] == ["F1", "D1", "D2"]
    assert result["reply"].index("Bánh & đồ ăn:") < result["reply"].index("1. Bánh 1") < result["reply"].index("Đồ uống:") < result["reply"].index("2. Nước 1")
    assert "bán chạy thay thế" in result["reply"]
    assert order_flow_graph._resolve_suggested_product(session, "nước số 3")["product_id"] == "D2"
