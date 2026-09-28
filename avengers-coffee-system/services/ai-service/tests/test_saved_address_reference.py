"""Saved-address references never become literal map-provider queries."""
import logging
import uuid

import pytest

from src.agents import agent_service, order_flow_graph
from src.agents.location_parser import parse_location
from src.common import cart_manager
from src.function_calling.tools import branch_tools, cart_tools
from utils import geo


SAVED = "42/3 nguyễn hữu tiến, Phường Tây Thạnh, Thành phố Hồ Chí Minh"
NEW = "10 Nguyễn Huệ, Phường Bến Nghé, Quận 1, Thành phố Hồ Chí Minh"


def _checkout(monkeypatch, delivery="MANG_DI", saved=True):
    session = "saved-reference-" + uuid.uuid4().hex
    cart_manager.add_item(session, "P1", "Matcha", 35000)
    cart_manager.set_checkout_context(session, checkout_requested=True, voucher_decided=True,
        delivery_type=delivery, payment_method="NGAN_HANG_QR",
        suggested_address=SAVED if saved else None)
    if saved:
        cart_manager.set_pending_action(session, "confirm_address", {})
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(agent_service, "_run_agent_impl", lambda *_a, **_k: pytest.fail("free-agent fallback"))
    return session


@pytest.mark.parametrize("phrase", [
    "tôi đang ở địa chỉ đó", "ý là tôi đang ở địa chỉ trong hồ sơ ấy",
    "địa chỉ đó đi", "đúng rồi, địa chỉ đã lưu",
])
@pytest.mark.parametrize("delivery", ["MANG_DI", "TAI_CHO"])
def test_saved_reference_geocodes_canonical_address_and_waits_for_branch(monkeypatch, phrase, delivery):
    session = _checkout(monkeypatch, delivery)
    seen = []
    def find(location, session_id):
        seen.append(location)
        return {"status": "need_branch_selection", "branches": [
            {"ma_chi_nhanh": f"B{i}", "ten_chi_nhanh": f"Quán {i}",
             "availability_status": "available", "khoang_cach_km": i} for i in range(1, 4)]}
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", find)
    result = order_flow_graph.run_order_flow(session, phrase)
    assert seen == [SAVED]
    assert "Quán 1" in result["reply"] and "Quán 3" in result["reply"]
    assert cart_manager.get_pending_action(session)["type"] == "select_branch"
    assert not cart_manager.get_cart(session).get("branch_id")


def test_saved_reference_survives_temporary_provider_failure(monkeypatch):
    session = _checkout(monkeypatch)
    seen = []
    def find(location, session_id):
        seen.append(location)
        return ({"status": "error", "message": "Bản đồ tạm thời chưa sẵn sàng"} if len(seen) == 1 else
                {"status": "need_branch_selection", "branches": [
                    {"ma_chi_nhanh": "B1", "ten_chi_nhanh": "Quán Một", "availability_status": "available"}]})
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", find)
    first = order_flow_graph.run_order_flow(session, "tôi đang ở địa chỉ đó")
    assert "tạm thời" in first["reply"]
    assert cart_manager.get_checkout_prefs(session)["suggested_address"] == SAVED
    second = order_flow_graph.run_order_flow(session, "địa chỉ đó đi")
    assert seen == [SAVED, SAVED]
    assert "Quán Một" in second["reply"]


def test_saved_reference_survives_expired_pending_action(monkeypatch):
    session = _checkout(monkeypatch)
    cart_manager.clear_pending_action(session)
    seen = []
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda location, session_id: seen.append(location) or {
        "status": "need_branch_selection", "branches": [
            {"ma_chi_nhanh": "B1", "ten_chi_nhanh": "Quán Một", "availability_status": "available"}]})
    order_flow_graph.run_order_flow(session, "tôi đang ở địa chỉ đó")
    assert seen == [SAVED]
    assert cart_manager.get_pending_action(session)["type"] == "select_branch"


def test_rejection_and_information_do_not_geocode(monkeypatch):
    session = _checkout(monkeypatch)
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda **_kw: pytest.fail("placeholder geocoded"))
    info = order_flow_graph.run_order_flow(session, "địa chỉ trong hồ sơ của tôi là gì?")
    assert SAVED in info["reply"]
    assert cart_manager.get_pending_action(session)["type"] == "confirm_address"
    short_question = order_flow_graph.run_order_flow(session, "địa chỉ đã lưu của tôi?")
    assert SAVED in short_question["reply"]
    assert cart_manager.get_pending_action(session)["type"] == "confirm_address"
    rejected = order_flow_graph.run_order_flow(session, "không, tôi ở chỗ khác")
    assert "khu vực hoặc địa chỉ mới" in rejected["reply"]
    prefs = cart_manager.get_checkout_prefs(session)
    assert prefs.get("address_change_requested") and not prefs.get("suggested_address")
    assert not prefs.get("address_confirmed")


@pytest.mark.parametrize("message", [
    "không, tôi ở " + NEW,
    "không phải địa chỉ đó, tôi ở " + NEW,
])
def test_explicit_new_full_address_overrides_saved_reference(monkeypatch, message):
    session = _checkout(monkeypatch)
    seen = []
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda location, session_id: seen.append(location) or {
        "status": "need_branch_selection", "branches": [
            {"ma_chi_nhanh": "B1", "ten_chi_nhanh": "Quán Một", "availability_status": "available"}]})
    result = order_flow_graph.run_order_flow(session, message)
    assert seen == [NEW]
    assert "Quán Một" in result["reply"]


def test_delivery_saved_address_asks_only_for_missing_district(monkeypatch):
    session = _checkout(monkeypatch, delivery="GIAO_TAN_NOI")
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda **_kw: pytest.fail("incomplete delivery address geocoded"))
    result = order_flow_graph.run_order_flow(session, "giao địa chỉ đó")
    assert "quận/huyện" in result["reply"]
    assert "số nhà" not in result["reply"]
    assert cart_manager.get_checkout_prefs(session)["suggested_address"] == SAVED
    assert not cart_manager.get_checkout_prefs(session).get("address_confirmed")


def test_complete_saved_delivery_address_uses_canonical_value(monkeypatch):
    session = _checkout(monkeypatch, delivery="GIAO_TAN_NOI")
    cart_manager.set_checkout_context(session, suggested_address=NEW)
    seen = []
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda location, session_id: seen.append(location) or {
        "status": "ok", "branches": [{"ma_chi_nhanh": "B1", "ten_chi_nhanh": "Quán Một"}]})
    def select(sid, branch_id, branch_name, **_kwargs):
        cart_manager.set_branch(sid, branch_id, branch_name)
        return {"status": "ok", "message": "Đã chọn cửa hàng"}
    monkeypatch.setattr(branch_tools, "execute_set_session_branch", select)
    monkeypatch.setattr(agent_service, "_advance_checkout_if_ready", lambda _sid, result: result)
    order_flow_graph.run_order_flow(session, "dùng địa chỉ đã lưu")
    prefs = cart_manager.get_checkout_prefs(session)
    assert seen == [NEW]
    assert prefs["delivery_address"] == NEW and prefs["address_confirmed"] is True


@pytest.mark.parametrize("placeholder", [
    "địa chỉ đó", "địa chỉ này", "địa chỉ đã lưu", "địa chỉ trong hồ sơ", "ở đó", "chỗ đó",
])
def test_deictic_placeholder_is_never_a_literal_area(monkeypatch, placeholder):
    assert parse_location(placeholder).kind == "reference"
    session = _checkout(monkeypatch, saved=False)
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda **_kw: pytest.fail("placeholder geocoded"))
    result = order_flow_graph.run_order_flow(session, placeholder)
    assert "chưa có địa chỉ nào đang được tham chiếu" in result["reply"]


def test_geo_layer_blocks_placeholder_and_does_not_log_credential(monkeypatch, caplog):
    monkeypatch.setenv("VIETMAP_API_KEY", "SECRET_VALUE")
    class Client:
        def __init__(self, **_kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *_args): return None
        def get(self, *_args, **_kwargs):
            raise RuntimeError("https://provider/search?apikey=SECRET_VALUE&text=abc")
    monkeypatch.setattr(geo.httpx, "Client", Client)
    with caplog.at_level(logging.INFO):
        assert geo.geocode_address("địa chỉ đó") is None
        assert geo.geocode_address(NEW) is None
        logging.getLogger("httpx").info("https://provider/search?apikey=SECRET_VALUE&text=abc")
    assert "SECRET_VALUE" not in caplog.text
    assert logging.getLogger("httpx").getEffectiveLevel() >= logging.WARNING


def test_branch_tool_rejects_deictic_input_before_database_or_geocoder(monkeypatch):
    monkeypatch.setattr(branch_tools, "_get_engine", lambda: pytest.fail("placeholder reached database"))
    assert branch_tools.execute_find_nearest_branch(location="địa chỉ đó")["status"] == "need_location"
