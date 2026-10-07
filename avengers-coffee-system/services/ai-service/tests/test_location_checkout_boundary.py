"""Location intent, branch ownership and replay identity regressions."""
import uuid
from types import SimpleNamespace

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


def test_combined_pickup_and_wallet_choice_survives_area_turn(monkeypatch):
    session = 'combined-choice-' + uuid.uuid4().hex
    cart_manager.add_item(session, 'P1', 'Cà phê', 35000)
    cart_manager.set_checkout_context(session, checkout_requested=True, voucher_decided=True)
    monkeypatch.setattr(cart_tools, 'sync_authoritative_cart', lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(cart_tools, 'validate_wallet_selection', lambda sid: None)
    monkeypatch.setattr(agent_service, '_run_agent_impl', lambda *_args, **_kwargs: {
        'reply': 'Mình đã ghi nhận lựa chọn.', 'tool_calls_log': [], 'checkout_payload': None,
    })
    first = order_flow_graph.run_order_flow(session, 'lấy tại quán và thanh toán bằng ví nhé')
    prefs = cart_manager.get_checkout_prefs(session)
    assert prefs['delivery_type'] == 'MANG_DI'
    assert prefs['payment_method'] == 'VI_DIEN_TU'
    assert not first.get('ui_payload', {}).get('payment_options')

    seen = []
    monkeypatch.setattr(branch_tools, 'execute_find_nearest_branch', lambda location, session_id: seen.append(location) or {
        'status': 'need_branch_selection',
        'branches': [{'ma_chi_nhanh': 'B1', 'ten_chi_nhanh': 'Quán Một', 'availability_status': 'available'}],
    })
    second = order_flow_graph.run_order_flow(session, 'tôi ở phường Tây Thạnh')
    assert seen == ['phường Tây Thạnh']
    assert cart_manager.get_checkout_prefs(session)['payment_method'] == 'VI_DIEN_TU'
    assert not second.get('ui_payload', {}).get('payment_options')


def test_partial_delivery_address_asks_for_missing_fields_without_geocoding(monkeypatch):
    session = _session(monkeypatch, delivery_type="GIAO_TAN_NOI")
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda **kw: pytest.fail("partial delivery geocoded"))
    result = order_flow_graph.run_order_flow(session, "tôi đang ở 87C Tân Thắng, P. Sơn Kỳ, Tân Phú")
    assert "quận/huyện" not in result["reply"] and "tỉnh/thành phố" in result["reply"]
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
    assert "tỉnh/thành phố" in first["reply"] and "quận/huyện" not in first["reply"]
    second = order_flow_graph.run_order_flow(session, "Quận Tân Phú, TP.HCM")
    assert seen == ["87C Tân Thắng, Phường Sơn Kỳ, Tân Phú, Quận Tân Phú, Thành phố Hồ Chí Minh"]
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
    from src.agents.location_parser import complete_partial_delivery_address
    current = parse_location("42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Thành phố Hồ Chí Minh")
    assert current.kind == "address" and current.missing == ()
    assert parse_location("42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh").missing == ("tỉnh/thành phố",)
    assert parse_location("42/3 Nguyễn Hữu Tiến, Thành phố Hồ Chí Minh").missing == ("phường/xã",)
    assert parse_location("42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Quận Tân Phú, Thành phố Hồ Chí Minh").missing == ()
    assert parse_location("42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Thành phố Hồ Chí Minh, Phường Tây Thạnh, Thành phố Hồ Chí Minh").value == current.value
    assert parse_location("12/5A Đường 3 Tháng 2, P. 10, Q. 10, TP.HCM").missing == ()
    assert parse_location("12A Đường 3 Tháng 2, P. 10, Q. 10, TP.HCM").kind == "address"
    assert parse_location("71 Đường D9, P. Sơn Kỳ").kind == "address"
    assert parse_location("42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh").kind == "address"
    assert parse_location("chọn tôi địa chỉ số 3 đi").kind == "none"
    assert parse_location("cửa hàng nào gần đây").value == ""
    assert parse_location("Bánh Matcha ở Tân Phú có không?").kind == "none"
    assert parse_location("Cà phê muối ở Tân Phú có không?").kind == "none"
    assert parse_location("lấy tại quán và COD").kind == "none"
    assert complete_partial_delivery_address("42/3 Nguyễn Hữu Tiến, Thành phố Hồ Chí Minh", "nước số 9") is None
    assert complete_partial_delivery_address("42/3 Nguyễn Hữu Tiến, Thành phố Hồ Chí Minh", "thêm bánh") is None
    assert complete_partial_delivery_address("42/3 Nguyễn Hữu Tiến, Thành phố Hồ Chí Minh", "COD") is None
    assert complete_partial_delivery_address("42/3 Nguyễn Hữu Tiến, Thành phố Hồ Chí Minh", "10") is None
    assert complete_partial_delivery_address("42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh", "Tân Phú") is None
    assert parse_location("42/3 Nguyễn Hữu Tiến, Thành phố Hồ Chí Minh, Quận Tân Phú, Phường Tây Thạnh").value == (
        "42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Quận Tân Phú, Thành phố Hồ Chí Minh")


@pytest.mark.parametrize("partial,follow_up,expected", [
    ("42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh", "Hồ Chí Minh",
     "42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Thành phố Hồ Chí Minh"),
    ("42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh", "TP.HCM",
     "42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Thành phố Hồ Chí Minh"),
    ("42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh", "Thành phố Hồ Chí Minh",
     "42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Thành phố Hồ Chí Minh"),
    ("42/3 Nguyễn Hữu Tiến, Thành phố Hồ Chí Minh", "Tây Thạnh",
     "42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Thành phố Hồ Chí Minh"),
    ("42/3 Nguyễn Hữu Tiến, Thành phố Hồ Chí Minh", "Phường Tây Thạnh",
     "42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Thành phố Hồ Chí Minh"),
    ("42/3 Nguyễn Hữu Tiến, Thành phố Hồ Chí Minh", "tây thạnh",
     "42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Thành phố Hồ Chí Minh"),
    ("42/3 Nguyễn Hữu Tiến, Thành phố Hồ Chí Minh", "phường tây thạnh",
     "42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Thành phố Hồ Chí Minh"),
    ("42/3 Nguyễn Hữu Tiến, Quận Tân Phú, Thành phố Hồ Chí Minh", "tây thạnh",
     "42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Quận Tân Phú, Thành phố Hồ Chí Minh"),
])
def test_missing_single_delivery_field_accepts_short_follow_up(monkeypatch, partial, follow_up, expected):
    session = _session(monkeypatch, delivery_type="GIAO_TAN_NOI")
    cart_manager.set_checkout_context(session, partial_delivery_address=partial)
    seen = []
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda location, session_id: seen.append(location) or {
        "status": "ok", "branches": [{"ma_chi_nhanh": "B1", "ten_chi_nhanh": "Quán Một"}]})
    monkeypatch.setattr(branch_tools, "execute_set_session_branch", lambda *args, **kwargs: {"status": "ok", "message": "Đã chọn"})
    monkeypatch.setattr(agent_service, "_advance_checkout_if_ready", lambda _sid, result: result)
    order_flow_graph.run_order_flow(session, follow_up)
    assert seen == [expected]
    assert cart_manager.get_checkout_prefs(session)["delivery_address"] == expected


def test_geocoder_not_found_asks_for_specific_locality(monkeypatch):
    session = _session(monkeypatch)
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda **kw: {
        "status": "not_found", "message": "Không tìm thấy vị trí."})
    result = order_flow_graph.run_order_flow(session, "tôi ở Tây Thạnh")
    assert "bản đồ" in result["reply"]
    assert "phường/quận" in result["reply"] and "tỉnh" in result["reply"]
    assert "số nhà" not in result["reply"] and "tên đường" not in result["reply"]
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


def test_failed_delivery_geocode_never_confirms_or_reuses_old_summary(monkeypatch):
    session = _session(monkeypatch, delivery_type="GIAO_TAN_NOI")
    cart_manager.set_branch(session, "OLD", "Cửa hàng cũ")
    cart_manager.set_checkout_prefs(session, delivery_address="12 Đường Cũ")
    cart_manager.set_checkout_context(session, address_confirmed=True, voucher_code="SAVE20")
    cart_manager.mark_checkout_summary(session)
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda **kw: {"status": "not_found"})
    result = order_flow_graph.run_order_flow(session,
        "giao tới 999 XYZABC, Phường X, Quận Y, Thành phố Hồ Chí Minh")
    prefs = cart_manager.get_checkout_prefs(session)
    assert "bản đồ" in result["reply"] and "số nhà" in result["reply"]
    assert prefs.get("address_confirmed") is not True
    assert not prefs.get("delivery_address") and not cart_manager.get_cart(session).get("branch_id")
    assert not prefs.get("summary_fingerprint") and not result.get("checkout_payload")
    assert prefs.get("voucher_code") == "SAVE20"


def test_successful_delivery_confirms_only_after_branch_resolution(monkeypatch):
    session = _session(monkeypatch, delivery_type="GIAO_TAN_NOI")
    address = "999 Nguyễn Trãi, Phường 1, Quận 5, Thành phố Hồ Chí Minh"
    calls = []
    def find(location, session_id):
        calls.append(("geocode", location))
        assert cart_manager.get_checkout_prefs(session).get("address_confirmed") is not True
        return {"status": "ok", "branches": [{"ma_chi_nhanh": "B1", "ten_chi_nhanh": "Cửa hàng Một"}]}
    def select(session_id, branch_id, branch_name, **kwargs):
        calls.append(("branch", branch_id))
        assert cart_manager.get_checkout_prefs(session).get("address_confirmed") is not True
        cart_manager.set_branch(session_id, branch_id, branch_name)
        return {"status": "ok", "message": "Đã chọn cửa hàng"}
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", find)
    monkeypatch.setattr(branch_tools, "execute_set_session_branch", select)
    monkeypatch.setattr(agent_service, "_advance_checkout_if_ready", lambda sid, result: result)
    result = order_flow_graph.run_order_flow(session, "giao tới " + address)
    assert calls == [("geocode", address), ("branch", "B1")]
    prefs = cart_manager.get_checkout_prefs(session)
    assert prefs["address_confirmed"] is True and prefs["delivery_address"] == address
    assert cart_manager.get_cart(session)["branch_id"] == "B1"
    assert "Đã chọn" in result["reply"]


def test_delivery_branch_rejection_leaves_address_unconfirmed(monkeypatch):
    session = _session(monkeypatch, delivery_type="GIAO_TAN_NOI")
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda **kw: {
        "status": "ok", "branches": [{"ma_chi_nhanh": "B1", "ten_chi_nhanh": "Cửa hàng Một"}]})
    monkeypatch.setattr(branch_tools, "execute_set_session_branch", lambda *a, **k: {
        "status": "stock_conflict", "message": "Cửa hàng không đủ món"})
    result = order_flow_graph.run_order_flow(session,
        "giao tới 999 Nguyễn Trãi, Phường 1, Quận 5, Thành phố Hồ Chí Minh")
    prefs = cart_manager.get_checkout_prefs(session)
    assert "không đủ món" in result["reply"]
    assert prefs.get("address_confirmed") is not True and not prefs.get("delivery_address")
    assert not cart_manager.get_cart(session).get("branch_id") and not result.get("checkout_payload")


def test_in_flight_checkout_cannot_change_location(monkeypatch):
    session = _session(monkeypatch, delivery_type="GIAO_TAN_NOI")
    cart_manager.set_checkout_context(session, checkout_submission={"action_id": "already-sent"})
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda **kw: pytest.fail("re-geocoded in-flight order"))
    result = order_flow_graph.run_order_flow(session,
        "giao tới 999 Nguyễn Trãi, Phường 1, Quận 5, Thành phố Hồ Chí Minh")
    assert "đang được gửi xử lý" in result["reply"]
    assert cart_manager.get_checkout_prefs(session).get("checkout_submission")
    assert not cart_manager.get_checkout_prefs(session).get("address_confirmed")


def test_multi_product_list_requires_explicit_focus_for_demonstrative_review(monkeypatch):
    session = "focus-list-" + uuid.uuid4().hex
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(agent_service, "_run_agent_impl", lambda *a, **k: pytest.fail("unresolved review reached model"))
    monkeypatch.setattr(product_tools, "execute_get_product_insights", lambda *a, **k: pytest.fail("guessed product review"))
    products = [{"product_id": str(n), "product_name": f"Món {n}",
                 "category": "food" if n < 3 else "drink", "final_price": 20000} for n in range(1, 5)]
    order_flow_graph._render({"session_id": session, "result": {"reply": "list", "tool_calls_log": [
        {"tool": "get_recommendations", "args": {"category": "all"}, "result": {"status": "ok", "products": products}}]}})
    prefs = cart_manager.get_checkout_prefs(session)
    assert [row["product_id"] for row in prefs["last_product_suggestions"]] == ["1", "2", "3", "4"]
    assert not prefs.get("last_product_focus")
    result = order_flow_graph.run_order_flow(session, "món đó được đánh giá thế nào?")
    assert "món nào" in result["reply"] and not result["tool_calls_log"]
    assert order_flow_graph._resolve_suggested_product(session, "nước số 4")["product_id"] == "4"


def test_single_product_recommendation_establishes_focus(monkeypatch):
    session = "focus-one-" + uuid.uuid4().hex
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    product = {"product_id": "P1", "product_name": "Bánh Matcha", "category": "food", "final_price": 30000}
    order_flow_graph._render({"session_id": session, "result": {"reply": "one", "tool_calls_log": [
        {"tool": "get_recommendations", "args": {"category": "food"}, "result": {"status": "ok", "products": [product]}}]}})
    assert cart_manager.get_checkout_prefs(session)["last_product_focus"]["product_id"] == "P1"


@pytest.mark.parametrize("message,area", [
    ("có quán ở Tây Thạnh không?", "Tây Thạnh"),
    ("Highlands ở Tân Phú có không?", "Tân Phú"),
    ("quán ở Sơn Kỳ", "Sơn Kỳ"),
    ("có cửa hàng khu Tân Phú không?", "Tân Phú"),
    ("chi nhánh bên Gò Vấp có không?", "Gò Vấp"),
    ("tìm quán Tây Thạnh", "Tây Thạnh"),
])
def test_branch_query_outside_checkout_never_browses_products(monkeypatch, message, area):
    session = "branch-semantic-" + uuid.uuid4().hex
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(product_tools, "execute_get_recommendations", lambda **kw: pytest.fail("product recommendation"))
    monkeypatch.setattr(product_tools, "execute_get_product_insights", lambda *a, **k: pytest.fail("product insight"))
    monkeypatch.setattr(agent_service, "_run_agent_impl", lambda *a, **k: pytest.fail("free agent"))
    seen = []
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda **kw: seen.append(kw) or {
        "status": "not_found", "message": "Không tìm thấy vị trí"})
    before = cart_manager.cart_fingerprint(session)
    result = order_flow_graph.run_order_flow(session, message)
    assert seen == [{"location": area, "session_id": ""}]
    assert "bản đồ" in result["reply"]
    assert cart_manager.cart_fingerprint(session) == before
    assert not cart_manager.get_checkout_prefs(session).get("checkout_requested")


def test_replay_cache_keeps_ui_effects_without_large_tool_or_cart_payload(monkeypatch):
    session = "replay-compact-" + uuid.uuid4().hex
    calls = []
    original = {"reply": "Đã thêm món", "checkout_payload": None, "error": None,
        "tool_calls_log": [
            {"tool": "get_recommendations", "result": {"products": [{"blob": "x" * 10000}]}},
            {"tool": "add_to_cart", "result": {"status": "ok", "cart": {"items": ["x" * 10000]}}}],
        "ui_payload": {"cart": {"items": ["x" * 10000], "checkout_prefs": {}},
            "products": [{"product_id": "P1", "product_name": "Bánh", "final_price": 30000, "debug": "x" * 10000}]}}
    monkeypatch.setattr(order_flow_graph, "_GRAPH", SimpleNamespace(invoke=lambda _: calls.append(1) or {"result": original}))
    first = order_flow_graph.run_order_flow(session, "thêm bánh", client_message_id="same-turn")
    second = order_flow_graph.run_order_flow(session, "thêm bánh", client_message_id="same-turn")
    stored = cart_manager.get_checkout_prefs(session)["processed_order_turns"]["same-turn"]
    assert first == second and calls == [1]
    assert first["tool_calls_log"] == [{"tool": "add_to_cart", "result": {"status": "ok"}}]
    assert first["ui_payload"]["products"] == [{"product_id": "P1", "product_name": "Bánh", "final_price": 30000}]
    assert "items" not in first["ui_payload"]["cart"]
    assert "x" * 100 not in str(stored) and len(str(stored)) < 1000
    assert order_flow_graph.run_order_flow(session, "tin khác", client_message_id="same-turn")["error"] == "client_message_id_conflict"


@pytest.mark.parametrize("change", ["payment", "fulfillment", "delivery_address", "branch", "voucher", "cart_line"])
def test_fingerprint_tracks_only_order_affecting_changes(change):
    session = "fingerprint-fields-" + uuid.uuid4().hex
    cart_manager.add_item(session, "P1", "Bánh", 30000)
    cart_manager.set_checkout_prefs(session, payment_method="COD", delivery_type="GIAO_TAN_NOI",
                                    delivery_address="12 Đường A")
    cart_manager.set_branch(session, "B1", "Cửa hàng Một")
    cart_manager.mark_checkout_summary(session)
    original = cart_manager.cart_fingerprint(session)
    cart_manager.set_checkout_context(session, processed_order_turns={"turn": {"message": "ok"}},
                                      product_suggestion_snapshots={"food": [{"product_id": "P1"}]},
                                      last_product_suggestions=[{"product_id": "P1"}], flow_stage="SUMMARY")
    assert cart_manager.cart_fingerprint(session) == original
    assert cart_manager.get_checkout_prefs(session)["summary_fingerprint"] == original
    if change == "payment":
        cart_manager.set_checkout_prefs(session, payment_method="VNPAY")
    elif change == "fulfillment":
        cart_manager.set_checkout_prefs(session, delivery_type="MANG_DI")
    elif change == "delivery_address":
        cart_manager.set_checkout_prefs(session, delivery_address="20 Đường B")
    elif change == "branch":
        cart_manager.set_branch(session, "B2", "Cửa hàng Hai")
    elif change == "voucher":
        cart_manager.set_checkout_context(session, voucher_code="SAVE20", discount_amount=5000)
    else:
        cart_manager.add_item(session, "P2", "Nước", 25000)
    assert cart_manager.cart_fingerprint(session) != original
