import uuid

import pytest

from src.agents.catalog_constraints import parse_catalog_constraints
from src.agents.location_parser import infer_city_from_addresses, parse_location
from src.agents.order_flow_graph import _resolve_cart_line, _understand, _execute, _menu_search_specs, run_order_flow
from src.agents.tier1 import classify_order_intent
from src.common import cart_manager
from src.function_calling.tools import cart_tools, product_tools
from src.agents import agent_service


@pytest.mark.parametrize("message,quantity", [
    ("cho tôi bánh trung thu cà phê lên 2 cái đi", 2),
    ("cho bánh trung thu cà phê thành 2 cái", 2),
    ("bánh lava trong giỏ để 3 cái", 3),
    ("đổi bánh cà phê thành 1 cái", 1),
    ("cho món này còn 2 cái", 2),
])
def test_absolute_quantity_is_cart_mutation(message, quantity):
    assert classify_order_intent(message)["intent"] == "SET_QUANTITY"
    assert classify_order_intent(message)["quantity"] == quantity


def test_named_and_category_cart_target_never_choose_drink_or_focus():
    cart = {"items": [
        {"line_id": "lava", "product_name": "Bánh Trung Thu Cà Phê Lava", "category": "food"},
        {"line_id": "drink", "product_name": "1 Lít Matcha Latte Tây Bắc", "category": "drink"},
    ], "checkout_prefs": {"last_cart_focus": "drink"}}
    for phrase in ("cho tôi bánh trung thu cà phê lên 2 cái đi", "bánh lava trong giỏ để 3 cái",
                   "bánh trong giỏ tăng lên 2 cái"):
        row, error = _resolve_cart_line(cart, phrase)
        assert error is None
        assert row["line_id"] == "lava"
    cart["items"].append({"line_id": "cake2", "product_name": "Bánh Trung Thu Matcha", "category": "food"})
    row, error = _resolve_cart_line(cart, "bánh trong giỏ tăng lên 2 cái")
    assert row is None and "Matcha" in error and "Latte" not in error


@pytest.mark.parametrize("message", [
    "cho tôi món số 1 số lượng 10 cái nhé",
    "cho tôi món ố 1 số lượng 10 cái nhé",
])
def test_recommendation_ordinal_owns_add_and_quantity(message):
    session = "polish-" + uuid.uuid4().hex
    cart_manager.set_checkout_context(session, last_cart_focus="lava", last_product_suggestions=[
        {"product_id": "matcha", "product_name": "Bánh Trung Thu Matcha", "category": "food"},
        {"product_id": "drink", "product_name": "Matcha Latte", "category": "drink"},
    ])
    state = _understand({"session_id": session, "user_message": message, "history": [],
                         "cart": {"items": [{"line_id": "lava", "product_name": "Bánh Trung Thu Cà Phê Lava"}]}})
    assert state["intent"]["intent"] == "ADD_ITEM"
    assert state["intent"]["quantity"] == 10
    assert state["intent"]["resolved_products"][0]["product_id"] == "matcha"


def test_metadata_combines_category_keyword_and_price():
    compound = parse_catalog_constraints("bên bạn có món bánh matcha nào dưới 100k không")
    assert compound["category"] == "food"
    assert compound["search_text"] == "matcha"
    assert compound["max_price"] == 100000
    assert compound["max_price_inclusive"] is False
    assert parse_catalog_constraints("có món matcha nào không")["search_text"] == "matcha"


def test_compound_metadata_query_keeps_all_constraints_and_zero_result(monkeypatch):
    session = "filter-polish-" + uuid.uuid4().hex
    seen = []
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: {"items": [], "is_empty": True})
    monkeypatch.setattr(product_tools, "execute_filter_catalog", lambda **kwargs: seen.append(kwargs) or {
        "status": "not_found", "products": []})
    monkeypatch.setattr(agent_service, "_run_agent_impl", lambda *args, **kwargs: pytest.fail("unexpected RAG fallback"))
    result = run_order_flow(session, "bên bạn có món bánh matcha nào dưới 100k không")
    assert seen[0]["category"] == "food" and seen[0]["search_text"] == "matcha"
    assert seen[0]["max_price"] == 100000 and seen[0]["max_price_inclusive"] is False
    assert "matcha" in result["reply"] and "100.000đ" in result["reply"]
    assert [entry["tool"] for entry in result["tool_calls_log"]] == ["filter_catalog"]


def test_unfamiliar_category_keyword_never_broadens_to_full_food_menu():
    specs = _menu_search_specs("có bánh kem dừa nào không")
    assert specs == [{"category": "food", "label": "Menu bánh và đồ ăn", "search_text": "kem dừa"}]
    assert _menu_search_specs("xem menu bánh đi")[0].get("search_text") is None


def test_location_particles_and_data_driven_city():
    assert parse_location("không, tôi đang ở phường gò vấp á").value == "phường gò vấp"
    assert parse_location("phường gò vấp, TP hồ chí minh á bạn").value == "phường gò vấp, Thành phố hồ chí minh"
    city, ambiguous = infer_city_from_addresses("phường gò vấp", [
        "1 Đường A, Phường Gò Vấp, TP Hồ Chí Minh", "2 Đường B, Phường Gò Vấp, Thành phố Hồ Chí Minh"])
    assert city and not ambiguous
    city, ambiguous = infer_city_from_addresses("phường An Bình", [
        "Phường An Bình, TP Một", "Phường An Bình, TP Hai"])
    assert city is None and ambiguous


def test_wallet_gate_refetches_and_blocks_insufficient(monkeypatch):
    balances = [500000, 900000]
    monkeypatch.setattr(cart_tools, "execute_get_cart_quote", lambda sid: {
        "status": "ok", "quote": {"final_total": 884000}})
    def options(sid, total):
        balance = balances.pop(0)
        return {"payment_options": [{"code": "VI_DIEN_TU", "enabled": balance >= total, "balance": balance}]}
    monkeypatch.setattr(cart_tools, "get_wallet_payment_options", options)
    rejected = cart_tools.validate_wallet_selection("user")
    assert "500.000đ" in rejected["reply"] and "384.000đ" in rejected["reply"]
    assert cart_tools.validate_wallet_selection("user") is None
    monkeypatch.setattr(cart_tools, "execute_get_cart_quote", lambda sid: {"status": "ok", "quote": {}})
    assert "Chưa xác minh" in cart_tools.validate_wallet_selection("user")["reply"]


@pytest.mark.parametrize("message", ["thanh toán bằng ví", "Tôi chọn Ví Avengers"])
def test_typed_and_button_wallet_selection_do_not_store_insufficient_payment(monkeypatch, message):
    session = "wallet-polish-" + uuid.uuid4().hex
    cart_manager.set_checkout_context(session, checkout_requested=True, voucher_decided=True)
    cart = {"items": [{"line_id": "line", "product_name": "Cà phê"}], "is_empty": False}
    monkeypatch.setattr(cart_tools, "validate_wallet_selection", lambda sid: {
        "reply": "Ví Avengers hiện có 500.000đ; cần 884.000đ; thiếu 384.000đ",
        "checkout_payload": None, "tool_calls_log": [], "error": None})
    state = _understand({"session_id": session, "user_message": message, "history": [], "cart": cart})
    result = _execute(state)["result"]
    assert "thiếu 384.000đ" in result["reply"]
    assert cart_manager.get_checkout_prefs(session).get("payment_method") is None


@pytest.mark.parametrize("message", ["bánh trung thu cà phê", "còn bánh lava thì sao"])
def test_unique_cart_name_without_action_asks_operation(message):
    session = "cart-name-" + uuid.uuid4().hex
    cart = {"items": [{"line_id": "lava", "product_name": "Bánh Trung Thu Cà Phê Lava"}], "is_empty": False}
    state = _understand({"session_id": session, "user_message": message, "history": [], "cart": cart})
    assert state["intent"]["intent"] == "CART_TARGET_CLARIFY"
    assert "sửa số lượng" in _execute(state)["result"]["reply"]


def test_unique_keyword_cart_name_without_action_asks_operation():
    session = "cart-keyword-" + uuid.uuid4().hex
    cart = {"items": [{"line_id": "matcha", "product_name": "1 Lít Matcha Latte Tây Bắc"}], "is_empty": False}
    state = _understand({"session_id": session, "user_message": "món matcha trong giỏ", "history": [], "cart": cart})
    assert state["intent"]["intent"] == "CART_TARGET_CLARIFY"


def test_shared_cart_keyword_remains_ambiguous():
    cart = {"items": [
        {"line_id": "cake", "product_name": "Bánh Trung Thu Matcha"},
        {"line_id": "drink", "product_name": "Matcha Latte"},
    ], "checkout_prefs": {"last_cart_focus": "drink"}}
    row, error = _resolve_cart_line(cart, "món matcha trong giỏ đổi thành 2 cái")
    assert row is None and "Bánh Trung Thu Matcha" in error and "Matcha Latte" in error
