"""Profile-first and one-turn checkout location regressions."""
import uuid

import pytest

from src.agents import agent_service, order_flow_graph
from src.agents.location_parser import checkout_location
from src.common import cart_manager
from src.function_calling.tools import branch_tools, cart_tools, user_tools


HOME = "42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Thành phố Hồ Chí Minh"
WORK = "10 Nguyễn Huệ, Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh"


@pytest.fixture
def checkout(monkeypatch):
    session = "profile-location-" + uuid.uuid4().hex
    cart_manager.add_item(session, "P1", "Cà phê", 35000)
    cart_manager.set_checkout_context(session, checkout_requested=True, voucher_decided=True)
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(agent_service, "_advance_checkout_if_ready", lambda sid, result: result)
    monkeypatch.setattr(agent_service, "groq_agent_chat", lambda **kw: pytest.fail("model fallback"))
    return session


@pytest.mark.parametrize("delivery,payment,message,location", [
    ("MANG_DI", "NGAN_HANG_QR", "lấy tại quán và chuyển khoản QR, tôi đang ở Gò Vấp", "Gò Vấp"),
    ("TAI_CHO", "VI_DIEN_TU", "dùng tại chỗ và ví, tôi ở phường Tây Thạnh", "phường Tây Thạnh"),
    ("GIAO_TAN_NOI", "THANH_TOAN_KHI_NHAN_HANG",
     "giao tận nơi và COD, giao tới " + HOME, HOME),
])
def test_same_turn_choice_and_explicit_location_skips_profile(
        checkout, monkeypatch, delivery, payment, message, location):
    monkeypatch.setattr(user_tools, "execute_get_user_profile", lambda sid: pytest.fail("profile prompt"))
    monkeypatch.setattr(cart_tools, "validate_wallet_selection", lambda sid: None)
    seen = []
    def find(location, session_id):
        seen.append(location)
        return {"status": "ok" if delivery == "GIAO_TAN_NOI" else "need_branch_selection",
                "branches": [{"ma_chi_nhanh": "B1", "ten_chi_nhanh": "Quán Một", "availability_status": "available"}]}
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", find)
    monkeypatch.setattr(branch_tools, "execute_set_session_branch", lambda *args, **kw: (
        cart_manager.set_branch(args[0], args[1], args[2]) or {"status": "ok", "message": "Đã chọn cửa hàng"}))
    result = order_flow_graph.run_order_flow(checkout, message)
    prefs = cart_manager.get_checkout_prefs(checkout)
    assert (prefs["delivery_type"], prefs["payment_method"]) == (delivery, payment)
    assert seen == [location]
    if delivery == "GIAO_TAN_NOI":
        assert cart_manager.get_branch(checkout) == "B1"
        assert prefs["delivery_address"] == HOME
        assert (cart_manager.get_pending_action(checkout) or {}).get("type") != "select_branch"
    else:
        assert cart_manager.get_pending_action(checkout)["type"] == "select_branch"
        assert "Quán Một" in result["reply"]
        assert not cart_manager.get_branch(checkout)


@pytest.mark.parametrize("delivery", ["MANG_DI", "TAI_CHO", "GIAO_TAN_NOI"])
def test_profile_prompt_has_fulfillment_specific_zero_and_one_address(checkout, monkeypatch, delivery):
    cart_manager.set_checkout_prefs(checkout, delivery_type=delivery, payment_method="NGAN_HANG_QR")
    monkeypatch.setattr(user_tools, "execute_get_user_profile", lambda sid: {"address_items": []})
    empty = agent_service._run_agent_impl(checkout, "tiếp tục", allow_model_mutations=False)
    assert ("số nhà" in empty["reply"]) == (delivery == "GIAO_TAN_NOI")
    assert cart_manager.get_checkout_prefs(checkout)["location_pending"] is True
    cart_manager.set_checkout_context(checkout, location_pending=None)
    monkeypatch.setattr(user_tools, "execute_get_user_profile", lambda sid: {"address_items": [
        {"label": "Nhà", "full_address": HOME, "is_default": True}]})
    one = agent_service._run_agent_impl(checkout, "tiếp tục", allow_model_mutations=False)
    assert HOME in one["reply"]
    assert cart_manager.get_pending_action(checkout)["type"] == "confirm_address"


@pytest.mark.parametrize("choice,expected", [("1", HOME), ("Công ty", WORK), ("địa chỉ mặc định", HOME)])
def test_multiple_profile_addresses_select_without_private_fields(checkout, monkeypatch, choice, expected):
    cart_manager.set_checkout_prefs(checkout, delivery_type="MANG_DI", payment_method="NGAN_HANG_QR")
    monkeypatch.setattr(user_tools, "execute_get_user_profile", lambda sid: {"address_items": [
        {"label": "Công ty", "full_address": WORK, "email": "secret@example.test", "phone": "0123456789"},
        {"label": "Nhà", "full_address": HOME, "is_default": True, "email": "secret@example.test"}]})
    prompt = agent_service._run_agent_impl(checkout, "tiếp tục", allow_model_mutations=False)
    assert prompt["reply"].index(HOME) < prompt["reply"].index(WORK)
    candidates = cart_manager.get_checkout_prefs(checkout)["profile_address_candidates"]
    assert len(candidates) == 2 and candidates[0]["full_address"] == HOME
    assert all(set(item) == {"label", "full_address", "is_default"} for item in candidates)
    seen = []
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda location, session_id: seen.append(location) or {
        "status": "need_branch_selection", "branches": [{"ma_chi_nhanh": "B1", "ten_chi_nhanh": "Quán Một"}]})
    order_flow_graph.run_order_flow(checkout, choice)
    assert seen == [expected]
    assert cart_manager.get_pending_action(checkout)["type"] == "select_branch"
    assert not cart_manager.get_checkout_prefs(checkout).get("profile_address_candidates")


def test_multiple_profile_delivery_selection_auto_sets_branch(checkout, monkeypatch):
    cart_manager.set_checkout_prefs(checkout, delivery_type="GIAO_TAN_NOI", payment_method="NGAN_HANG_QR")
    monkeypatch.setattr(user_tools, "execute_get_user_profile", lambda sid: {"address_items": [
        {"label": "Nhà", "full_address": HOME, "is_default": True},
        {"label": "Công ty", "full_address": WORK}]})
    agent_service._run_agent_impl(checkout, "tiếp tục", allow_model_mutations=False)
    seen = []
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda location, session_id: seen.append(location) or {
        "status": "ok", "branches": [{"ma_chi_nhanh": "B1", "ten_chi_nhanh": "Quán Một"}]})
    def set_branch(session_id, branch_id, branch_name, **kw):
        cart_manager.set_branch(session_id, branch_id, branch_name)
        return {"status": "ok", "message": "Đã chọn cửa hàng"}
    monkeypatch.setattr(branch_tools, "execute_set_session_branch", set_branch)
    order_flow_graph.run_order_flow(checkout, "Công ty")
    assert seen == [WORK]
    assert cart_manager.get_checkout_prefs(checkout)["delivery_address"] == WORK
    assert cart_manager.get_branch(checkout) == "B1"
    assert (cart_manager.get_pending_action(checkout) or {}).get("type") != "select_branch"


@pytest.mark.parametrize("delivery", ["MANG_DI", "TAI_CHO", "GIAO_TAN_NOI"])
def test_other_address_clears_candidates_and_asks_for_correct_location(checkout, monkeypatch, delivery):
    cart_manager.set_checkout_prefs(checkout, delivery_type=delivery, payment_method="NGAN_HANG_QR")
    monkeypatch.setattr(user_tools, "execute_get_user_profile", lambda sid: {"address_items": [
        {"label": "Nhà", "full_address": HOME, "is_default": True},
        {"label": "Công ty", "full_address": WORK}]})
    agent_service._run_agent_impl(checkout, "tiếp tục", allow_model_mutations=False)
    other = order_flow_graph.run_order_flow(checkout, "địa chỉ khác")
    assert ("số nhà" in other["reply"]) == (delivery == "GIAO_TAN_NOI")
    prefs = cart_manager.get_checkout_prefs(checkout)
    assert not prefs.get("profile_address_candidates") and prefs["location_pending"] is True


@pytest.mark.parametrize("delivery", ["MANG_DI", "TAI_CHO"])
@pytest.mark.parametrize("area", ["Gò Vấp", "Tân Phú", "Tây Thạnh"])
def test_bare_area_only_during_location_wait(checkout, monkeypatch, delivery, area):
    cart_manager.set_checkout_prefs(checkout, delivery_type=delivery, payment_method="NGAN_HANG_QR")
    cart_manager.set_checkout_context(checkout, location_pending=True)
    seen = []
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda location, session_id: seen.append(location) or {
        "status": "need_branch_selection", "branches": [{"ma_chi_nhanh": "B1", "ten_chi_nhanh": "Quán Một"}]})
    order_flow_graph.run_order_flow(checkout, area)
    assert seen == [area]
    assert cart_manager.get_pending_action(checkout)["type"] == "select_branch"
    assert checkout_location("Matcha Latte", delivery, True).kind == "none"
    assert checkout_location("thêm bánh", delivery, True).kind == "none"
    assert checkout_location("nước số 10", delivery, True).kind == "none"
