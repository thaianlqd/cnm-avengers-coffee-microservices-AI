"""A numbered branch reply is a choice, not a new geocoding location."""
import uuid

import pytest

from src.agents import agent_service, order_flow_graph
from src.common import cart_manager
from src.function_calling.tools import branch_tools, cart_tools


HCM_ADDRESS = "42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Thành phố Hồ Chí Minh"


@pytest.fixture
def branch_selection(monkeypatch):
    session = "branch-address-" + uuid.uuid4().hex
    candidates = [{"branch_id": f"HCM-{index}", "branch_name": f"Cửa hàng {index}",
                   "availability_status": "available"} for index in range(1, 6)]
    cart_manager.add_item(session, "P1", "Cà phê", 35000)
    cart_manager.set_checkout_context(session, checkout_requested=True, delivery_type="MANG_DI",
        payment_method="THANH_TOAN_KHI_NHAN_HANG", location_address=HCM_ADDRESS,
        address_confirmed=True, suggested_address=None, branch_candidates=candidates,
        voucher_decided=True)
    cart_manager.set_pending_action(session, "select_branch", {"count": 5})
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(agent_service, "_advance_checkout_if_ready", lambda sid, result: result)
    calls = []
    def set_branch(sid, branch_id, branch_name, customer_selected=False):
        calls.append((branch_id, customer_selected))
        cart_manager.set_branch(sid, branch_id, branch_name)
        return {"status": "ok", "message": f"Đã chọn {branch_name}"}
    monkeypatch.setattr(branch_tools, "execute_set_session_branch", set_branch)
    return session, candidates, calls


@pytest.mark.parametrize("message,index", [
    ("chọn tôi địa chỉ số 3 đi", 3),
    ("lấy cửa hàng thứ 2", 2),
    ("chọn số 3", 3),
    ("chi nhánh thứ 3", 3),
    ("lấy chỗ thứ ba", 3),
    ("cửa hàng số 5", 5),
    ("chọn địa chỉ số 1", 1),
    ("lấy quán 4", 4),
])
@pytest.mark.parametrize("delivery_type", ["MANG_DI", "TAI_CHO"])
def test_branch_ordinal_precedes_address_detection(branch_selection, monkeypatch, message, index, delivery_type):
    session, candidates, calls = branch_selection
    cart_manager.set_checkout_context(session, delivery_type=delivery_type)
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda **kwargs: pytest.fail("Must not geocode a branch choice"))
    monkeypatch.setattr("utils.geo.geocode_address", lambda address: pytest.fail("VietMap must not receive an ordinal"))
    result = order_flow_graph.run_order_flow(session, message)
    assert calls == [(candidates[index - 1]["branch_id"], True)]
    assert "Đã chọn" in result["reply"]
    prefs = cart_manager.get_checkout_prefs(session)
    assert prefs["location_address"] == HCM_ADDRESS
    assert prefs.get("suggested_address") is None
    assert cart_manager.get_pending_action(session) is None


@pytest.mark.parametrize("message,address", [
    ("tôi đang ở 123 Nguyễn Trãi, Quận 5", "123 Nguyễn Trãi, Quận 5"),
    ("đổi địa chỉ sang 20 Lê Lợi, Quận 1", "20 Lê Lợi, Quận 1"),
    ("tôi ở 123 Nguyễn Trãi", "123 Nguyễn Trãi"),
])
def test_literal_address_replaces_old_candidates_then_geocodes(branch_selection, monkeypatch, message, address):
    session, old_candidates, calls = branch_selection
    locations = []
    def find(location, session_id):
        assert session_id == session
        assert not cart_manager.get_checkout_prefs(session).get("branch_candidates")
        locations.append(location)
        new_candidates = [{**row, "branch_id": f"NEW-{index}"} for index, row in enumerate(old_candidates, 1)]
        cart_manager.set_checkout_context(session, branch_candidates=new_candidates)
        return {"status": "need_branch_selection", "branches": [
            {"ma_chi_nhanh": row["branch_id"], "ten_chi_nhanh": row["branch_name"],
             "availability_status": "available"} for row in new_candidates]}
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", find)
    result = order_flow_graph.run_order_flow(session, message)
    assert locations == [address], result
    assert calls == []
    prefs = cart_manager.get_checkout_prefs(session)
    assert prefs["location_address"] == address
    assert prefs.get("suggested_address") is None
    assert prefs["branch_candidates"][0]["branch_id"] == "NEW-1"
    assert cart_manager.get_pending_action(session)["type"] == "select_branch"
    assert "Các cửa hàng gần bạn" in result["reply"]


@pytest.mark.parametrize("message", ["chọn số 8", "chọn địa chỉ số 8 đi", "địa chỉ 8 đi nhé"])
def test_invalid_ordinal_asks_for_valid_range_without_geocoding(branch_selection, monkeypatch, message):
    session, candidates, calls = branch_selection
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda **kwargs: pytest.fail("No new address"))
    result = order_flow_graph.run_order_flow(session, message)
    assert "Cửa hàng 1" in result["reply"] and "Cửa hàng 5" in result["reply"]
    assert "chọn số hoặc tên cửa hàng" in result["reply"]
    assert calls == []
    assert cart_manager.get_checkout_prefs(session)["branch_candidates"] == candidates
    assert cart_manager.get_checkout_prefs(session)["location_address"] == HCM_ADDRESS
    assert cart_manager.get_pending_action(session)["type"] == "select_branch"


def test_ambiguous_branch_reference_replays_candidates_without_mutation(branch_selection, monkeypatch):
    session, candidates, calls = branch_selection
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda **kwargs: pytest.fail("No geocoding"))
    result = order_flow_graph.run_order_flow(session, "lấy chỗ kia đi")
    assert calls == []
    assert "Cửa hàng 1" in result["reply"] and "Cửa hàng 5" in result["reply"]
    assert cart_manager.get_checkout_prefs(session)["branch_candidates"] == candidates
    assert cart_manager.get_pending_action(session)["type"] == "select_branch"


def test_direct_agent_entrypoint_resolves_branch_before_location_stage(branch_selection, monkeypatch):
    session, candidates, calls = branch_selection
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda **kwargs: pytest.fail("Must not geocode a branch choice"))
    result = agent_service._run_agent_impl(session, "chọn tôi địa chỉ số 3 đi", history=[], allow_model_mutations=False)
    assert calls == [(candidates[2]["branch_id"], True)]
    assert "Đã chọn" in result["reply"]
    assert cart_manager.get_checkout_prefs(session)["location_address"] == HCM_ADDRESS
