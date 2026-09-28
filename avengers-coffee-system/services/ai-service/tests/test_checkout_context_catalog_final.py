import uuid

import pytest

from src.agents import agent_service, order_flow_graph
from src.agents.catalog_constraints import parse_catalog_constraints
from src.agents.checkout_choices import pending_checkout_choice
from src.agents.pending_context import classify_pending_reply
from src.common import cart_manager
from src.function_calling.tools import product_tools


def test_payment_ordinal_owns_reply_even_with_product_recommendations(monkeypatch):
    session = "payment-owner-" + uuid.uuid4().hex
    cart_manager.set_checkout_context(session, checkout_requested=True, voucher_decided=True,
        delivery_type="MANG_DI", last_product_suggestions=[
            {"product_id": "P1", "product_name": "Americano", "category": "drink"},
            {"product_id": "P2", "product_name": "Matcha", "category": "drink"},
        ])
    cart_manager.set_pending_action(session, "select_payment", {"payment_options": [
        "VNPAY", "NGAN_HANG_QR", "VI_DIEN_TU", "THANH_TOAN_KHI_NHAN_HANG"]})
    cart = {"items": [{"line_id": "L1", "product_name": "Matcha"}], "is_empty": False}
    monkeypatch.setattr(product_tools, "execute_get_product_options", lambda *_: pytest.fail("product option lookup"))
    replayed = []
    def continue_checkout(_session, forwarded_message, **_kwargs):
        replayed.append(forwarded_message)
        return {"reply": "Đã ghi nhận thanh toán", "checkout_payload": None, "tool_calls_log": [], "error": None}
    monkeypatch.setattr(agent_service, "_run_agent_impl", continue_checkout)
    state = order_flow_graph._understand({"session_id": session, "user_message": "số 2 ấy bạn ơi", "history": [], "cart": cart})
    assert state["intent"]["checkout_patch"] == {"payment_method": "NGAN_HANG_QR"}
    order_flow_graph._execute(state)
    prefs = cart_manager.get_checkout_prefs(session)
    assert prefs["payment_method"] == "NGAN_HANG_QR"
    assert not prefs.get("pending_products")
    assert replayed == ["lấy tại quán và thanh toán QR ngân hàng"]
    assert pending_checkout_choice("select_payment", "số 5") == {}
    assert pending_checkout_choice("select_fulfillment", "số 2") == {"delivery_type": "MANG_DI"}
    assert pending_checkout_choice("select_checkout_choices", "số 2") == {}
    assert pending_checkout_choice("select_payment", "thêm Americano") is None


def test_invalid_payment_ordinal_reasks_without_product_fallback(monkeypatch):
    session = "payment-invalid-" + uuid.uuid4().hex
    cart_manager.set_checkout_context(session, checkout_requested=True, voucher_decided=True,
        delivery_type="MANG_DI", last_product_suggestions=[
            {"product_id": "P5", "product_name": "Matcha", "category": "drink"}])
    cart_manager.set_pending_action(session, "select_payment", {"payment_options": [
        "VNPAY", "NGAN_HANG_QR", "VI_DIEN_TU", "THANH_TOAN_KHI_NHAN_HANG"]})
    monkeypatch.setattr("src.function_calling.tools.cart_tools.execute_get_cart_quote", lambda _sid: {
        "status": "ok", "quote": {"final_total": 100000}})
    monkeypatch.setattr("src.function_calling.tools.cart_tools.get_wallet_payment_options", lambda *_: {
        "payment_options": [{"balance": 0, "reason": "Số dư chưa đủ"}]})
    state = order_flow_graph._understand({"session_id": session, "user_message": "số 5", "history": [],
        "cart": {"items": [{"line_id": "L1", "product_name": "Matcha"}], "is_empty": False}})
    assert state["intent"]["intent"] == "PENDING_CHECKOUT_CHOICE"
    result = order_flow_graph._execute(state)["result"]
    assert "Phương thức thanh toán" in result["reply"]
    assert not cart_manager.get_checkout_prefs(session).get("pending_products")


@pytest.mark.parametrize("message", ["tiếp tục", "tiếp đi", "tiếp tục nhé", "vậy tiếp tục", "được rồi tiếp tục", "qua bước tiếp theo"])
def test_continue_closes_ask_more_cart_only(message):
    session = "continue-cart-" + uuid.uuid4().hex
    cart_manager.set_pending_action(session, "ask_more_items", {})
    state = order_flow_graph._understand({"session_id": session, "user_message": message, "history": [],
        "cart": {"items": [{"line_id": "L1", "product_name": "Matcha"}], "is_empty": False}})
    assert state["intent"]["intent"] == "FINISH_CART"


@pytest.mark.parametrize("message", [
    "cho tôi lấy tại quán và thanh toán qua mã QR nhé", "trả bằng QR", "quét mã QR để thanh toán",
    "chuyển khoản QR", "chuyển khoản ngân hàng", "thanh toán bằng QR",
])
def test_positive_qr_phrases(message):
    assert agent_service._explicit_checkout_choices(message)["payment_method"] == "NGAN_HANG_QR"


@pytest.mark.parametrize("message", ["không dùng QR", "không thanh toán QR", "QR có được không?", "bên bạn có QR không?", "nếu dùng QR thì sao?"])
def test_qr_questions_and_negation_do_not_select(message):
    assert agent_service._explicit_checkout_choices(message).get("payment_method") is None


def test_combined_checkout_phrase_stores_both_in_one_patch():
    assert agent_service._explicit_checkout_choices("cho tôi lấy tại quán và thanh toán qua mã QR nhé") == {
        "delivery_type": "MANG_DI", "payment_method": "NGAN_HANG_QR"}


@pytest.mark.parametrize("message,expected", [
    ("tôi muốn mua các sp dưới 30.000", {"max_price": 30000, "sellable_scope": "normal"}),
    ("tôi muốn mua bánh matcha dưới 100k", {"category": "food", "search_text": "matcha", "max_price": 100000}),
    ("cà phê dưới 50k", {"category": "drink", "search_text": "cà phê", "max_price": 50000}),
    ("trà khoảng 60k", {"category": "drink", "search_text": "trà", "approx_price": 60000}),
    ("bánh matcha", {"category": "food", "search_text": "matcha"}),
    ("americano dưới 70k", {"category": "drink", "search_text": "americano", "max_price": 70000}),
    ("topping matcha dưới 20k", {"sellable_scope": "topping", "search_text": "matcha"}),
])
def test_catalog_verb_and_direct_metadata_precedence(message, expected):
    parsed = parse_catalog_constraints(message)
    assert parsed is not None
    assert all(parsed[key] == value for key, value in expected.items())
    assert parse_catalog_constraints("mua Americano Classic") is None
    assert parse_catalog_constraints("mua món số 2") is None


def test_accent_insensitive_catalog_search_uses_existing_menu_rows(monkeypatch):
    rows = [
        {"product_id": "1", "product_name": "Cà Phê Muối Avenger", "category": "Cà Phê", "parent_category": "Cà Phê", "final_price": 35000},
        {"product_id": "2", "product_name": "Bánh Trung Thu Matcha", "category": "Bánh", "parent_category": "Bánh & Đồ Ăn", "final_price": 65000},
        {"product_id": "3", "product_name": "Bánh Cà Phê", "category": "Bánh", "parent_category": "Bánh & Đồ Ăn", "final_price": 50000},
    ]
    class Result:
        def mappings(self): return self
        def all(self): return rows
    class Connection:
        def __enter__(self): return self
        def __exit__(self, *_): return None
        def execute(self, *_): return Result()
    class Engine:
        def connect(self): return Connection()
    monkeypatch.setattr(product_tools, "_get_engine", lambda: Engine())
    coffee = product_tools.execute_filter_catalog(search_text="ca phe muoi")
    cake = product_tools.execute_filter_catalog(category="food", search_text="banh matcha")
    assert [row["product_id"] for row in coffee["products"]] == ["1"]
    assert [row["product_id"] for row in cake["products"]] == ["2"]
