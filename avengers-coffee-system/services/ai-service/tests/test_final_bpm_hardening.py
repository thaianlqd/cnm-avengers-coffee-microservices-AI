"""Final BPM clarification, authority and recovery contracts."""
import uuid
from types import SimpleNamespace

import pytest

from src.agents import order_flow_graph
from src.agents.pending_context import classify_pending_reply
from src.agents.tier1 import classify_order_intent
from src.common import cart_manager
from src.function_calling.tools import cart_tools, voucher_tools


@pytest.mark.parametrize("message", [
    "các phương thức thanh toán được hỗ trợ",
    "bên mình thanh toán kiểu gì?",
    "có hỗ trợ COD không?",
    "có thanh toán bằng ví không?",
])
def test_payment_information_is_read_only_without_cart(message):
    session = f"anon-{uuid.uuid4()}:conversation:{uuid.uuid4()}"
    before = cart_manager.get_checkout_prefs(session)
    result = order_flow_graph.run_order_flow(session, message)
    assert "VNPAY" in result["reply"] and "COD" in result["reply"]
    assert cart_manager.get_checkout_prefs(session) == before
    assert cart_manager.get_cart(session)["is_empty"] is True


def test_real_guest_transaction_is_gated_before_cart_mutation(monkeypatch):
    session = f"anon-{uuid.uuid4()}:conversation:{uuid.uuid4()}"
    monkeypatch.setattr(cart_tools, "execute_add_to_cart", lambda **kw: pytest.fail("guest cart write"))
    state = {"session_id": session, "user_message": "thêm Matcha", "history": [],
             "cart": cart_manager.get_cart(session), "intent": {"intent": "ADD_ITEM",
             "resolved_products": [{"product_id": "1", "product_name": "Matcha"}]}}
    result = order_flow_graph._execute(state)["result"]
    assert "đăng nhập" in result["reply"]
    assert result["tool_calls_log"][0]["result"]["status"] == "login_required"
    assert cart_manager.get_cart(session)["is_empty"] is True


def test_ambiguous_payment_keeps_selected_fulfillment_and_current_gate():
    session = "customer:conversation:ambiguous-payment"
    cart_manager.add_item(session, "1", "Matcha", 50000)
    cart_manager.set_checkout_context(session, checkout_requested=True, voucher_decided=True)
    cart_manager.set_checkout_prefs(session, delivery_type="MANG_DI")
    cart_manager.set_pending_action(session, "select_payment", {"payment_options": ["COD", "QR"]})
    state = {"session_id": session, "user_message": "cái bình thường ấy", "history": [],
             "cart": cart_manager.get_cart(session)}
    understood = order_flow_graph._understand(state)
    assert understood["intent"]["intent"] == "PENDING_CHECKOUT_CHOICE"
    result = order_flow_graph._execute(understood)["result"]
    prefs = cart_manager.get_checkout_prefs(session)
    assert prefs["delivery_type"] == "MANG_DI" and not prefs.get("payment_method")
    assert cart_manager.get_pending_action(session)["type"] == "select_payment"
    assert "phương thức" in result["reply"].lower()


def test_payment_information_during_checkout_preserves_pending_selection():
    session = "customer:conversation:payment-info-pending"
    cart_manager.set_checkout_context(session, checkout_requested=True, voucher_decided=True)
    cart_manager.set_checkout_prefs(session, delivery_type="MANG_DI")
    cart_manager.set_pending_action(session, "select_payment", {})
    state = {"session_id": session, "user_message": "bên mình hỗ trợ những cách thanh toán nào?",
             "history": [], "cart": cart_manager.get_cart(session)}
    understood = order_flow_graph._understand(state)
    assert understood["intent"]["intent"] == "PAYMENT_INFO"
    result = order_flow_graph._execute(understood)["result"]
    assert "VNPAY" in result["reply"]
    assert cart_manager.get_checkout_prefs(session)["delivery_type"] == "MANG_DI"
    assert cart_manager.get_pending_action(session)["type"] == "select_payment"


@pytest.mark.parametrize("message,expected", [
    ("xóa 1 Lít Matcha Latte Tây Bắc", "REMOVE_ITEM"),
    ("bỏ Bánh Trung Thu Matcha", "REMOVE_ITEM"),
    ("không lấy Trà Sữa nữa", "REMOVE_ITEM"),
    ("bỏ qua voucher", "SELECT_VOUCHER"),
])
def test_natural_cart_remove_keeps_false_positive_guards(message, expected):
    assert classify_order_intent(message)["intent"] == expected


@pytest.mark.parametrize("message,decision", [
    ("dạ", "CONFIRM"),
    ("dạ vâng ạ, chốt giúp mình", "CONFIRM"),
    ("dạ nhưng đổi địa chỉ", "CHANGE"),
    ("ok nhưng đổi QR", "CHANGE"),
    ("được nếu sửa topping", "AMBIGUOUS"),
    ("khoan đã", "REJECT"),
    ("chắc được", "AMBIGUOUS"),
    ("ok đúng chưa?", "AMBIGUOUS"),
])
def test_confirmation_grammar_prioritizes_change_question_and_uncertainty(message, decision):
    assert classify_pending_reply(message, "confirm_checkout") == decision


def test_explicit_voucher_code_does_not_depend_on_displayed_candidates(monkeypatch):
    session = "customer:conversation:manual-voucher"
    cart_manager.add_item(session, "1", "Matcha", 50000)
    cart_manager.set_checkout_context(session, voucher_candidates=[{"ma_voucher": "TOP4"}],
                                      voucher_offer_pending=True)
    seen = []
    monkeypatch.setattr(voucher_tools, "execute_apply_voucher", lambda sid, code: seen.append(code) or {
        "status": "ok", "message": f"Đã áp {code}"})
    state = {"session_id": session, "user_message": "áp mã AVENGERS50", "history": [],
             "cart": cart_manager.get_cart(session),
             "intent": {"intent": "APPLY_VOUCHER", "voucher_code": "AVENGERS50"}}
    result = order_flow_graph._execute(state)["result"]
    assert seen == ["AVENGERS50"]
    assert "AVENGERS50" in result["reply"]


@pytest.mark.parametrize("message,intent,code", [
    ("áp mã AVENGERS50", "APPLY_VOUCHER", "AVENGERS50"),
    ("áp ABC20", "APPLY_VOUCHER", "ABC20"),
    ("đổi sang mã ABC20", "REPLACE_VOUCHER", "ABC20"),
    ("bỏ mã đang dùng", "REMOVE_VOUCHER", None),
    ("không dùng voucher nữa", "REMOVE_VOUCHER", None),
])
def test_voucher_action_parser_uses_action_object_and_exact_code(message, intent, code):
    parsed = order_flow_graph._voucher_command(message)
    assert parsed["intent"] == intent
    assert parsed.get("voucher_code") == code


def test_remove_voucher_authoritative_failure_preserves_current_state(monkeypatch):
    session = "customer:conversation:remove-voucher-failure"
    cart_manager.set_checkout_context(session, voucher_code="SAVE20", discount_amount=20000)
    cart_manager.set_checkout_context(session, summary_fingerprint="summary", checkout_action_id=str(uuid.uuid4()))
    monkeypatch.setattr(cart_tools, "is_authenticated_cart_session", lambda sid: True)
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: (_ for _ in ()).throw(RuntimeError("down")))
    result = voucher_tools.execute_remove_voucher(session)
    prefs = cart_manager.get_checkout_prefs(session)
    assert result["status"] == "error"
    assert prefs["voucher_code"] == "SAVE20" and prefs["discount_amount"] == 20000
    assert prefs["summary_fingerprint"] == "summary" and prefs.get("checkout_action_id")


def test_replace_voucher_authoritative_failure_preserves_previous_code(monkeypatch):
    session = "customer:conversation:replace-voucher-failure"
    cart_manager.set_checkout_context(session, voucher_code="SAVE20", discount_amount=20000,
                                      voucher_decided=True)
    monkeypatch.setattr(cart_tools, "is_authenticated_cart_session", lambda sid: True)
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: (_ for _ in ()).throw(RuntimeError("down")))
    result = voucher_tools.execute_apply_voucher(session, "ABC20")
    prefs = cart_manager.get_checkout_prefs(session)
    assert result["status"] == "error"
    assert prefs["voucher_code"] == "SAVE20" and prefs["discount_amount"] == 20000


def test_remove_voucher_success_requotes_and_invalidates_summary(monkeypatch):
    session = "customer:conversation:remove-voucher-ok"
    cart_manager.set_checkout_context(session, voucher_code="SAVE20", discount_amount=20000)
    cart_manager.set_checkout_context(session, summary_fingerprint="summary", summary_amounts={"final_total": 30000},
                                      checkout_action_id=str(uuid.uuid4()))
    monkeypatch.setattr(cart_tools, "is_authenticated_cart_session", lambda sid: True)
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(cart_tools, "_quote_authoritative_cart", lambda sid, code=None: {
        "subtotal": 50000, "discount_amount": 0, "final_total": 50000})
    result = voucher_tools.execute_remove_voucher(session)
    prefs = cart_manager.get_checkout_prefs(session)
    assert result["status"] == "ok" and result["quote"]["final_total"] == 50000
    assert not prefs.get("voucher_code") and not prefs.get("discount_amount")
    assert not prefs.get("summary_fingerprint") and not prefs.get("checkout_action_id")


def test_finalize_checkout_missing_action_releases_local_lock(monkeypatch):
    from src.common.checkout_service import finalize_checkout
    session = "customer:conversation:missing-action"
    cart_manager.add_item(session, "1", "Matcha", 50000)
    cart_manager.set_branch(session, "B1", "Quán Một")
    monkeypatch.setattr("src.common.checkout_service._require_valid_session", lambda uid: "customer")
    monkeypatch.setattr("src.common.checkout_service._get_service_jwt", lambda uid: "token")
    result = finalize_checkout(session, "THANH_TOAN_KHI_NHAN_HANG", "MANG_DI")
    assert result["status"] == "no_pending_checkout"
    assert cart_manager.get_cart(session)["is_checking_out"] is False


def test_structured_total_conflict_clears_only_stale_checkout_state(monkeypatch):
    from src.common.checkout_service import finalize_checkout
    session = "customer:conversation:structured-conflict"
    cart_manager.add_item(session, "1", "Matcha", 50000)
    cart_manager.set_branch(session, "B1", "Quán Một")
    cart_manager.set_checkout_context(session, checkout_action_id=str(uuid.uuid4()),
                                      summary_fingerprint="summary", summary_amounts={"final_total": 50000},
                                      voucher_code="SAVE20", discount_amount=10000)
    monkeypatch.setattr("src.common.checkout_service._require_valid_session", lambda uid: "customer")
    monkeypatch.setattr("src.common.checkout_service._get_service_jwt", lambda uid: "token")
    response = SimpleNamespace(status_code=409, text="localized text may change",
        json=lambda: {"code": "CHECKOUT_TOTAL_CHANGED", "message": "Tổng đã đổi", "checkout_not_created": True})
    monkeypatch.setattr("src.common.checkout_service.requests.post", lambda *a, **k: response)
    result = finalize_checkout(session, "THANH_TOAN_KHI_NHAN_HANG", "MANG_DI")
    prefs = cart_manager.get_checkout_prefs(session)
    assert result["status"] == "checkout_conflict" and result["code"] == "CHECKOUT_TOTAL_CHANGED"
    assert not prefs.get("checkout_submission") and not prefs.get("summary_fingerprint")
    assert not prefs.get("checkout_action_id") and not prefs.get("summary_amounts")
    assert prefs["voucher_code"] == "SAVE20" and prefs["discount_amount"] == 10000


def test_committed_cart_mutation_envelope_updates_mirror_without_get():
    session = "customer:conversation:mutation-envelope"
    cart = cart_tools._mirror_mutation_envelope(session, {
        "cart_id": "user:customer", "cart_version": 7, "user_id": "customer",
        "items": [{"id": 12, "product_id": "1", "product_name": "Matcha",
                   "quantity": 2, "unit_price": 50000, "line_total": 100000}],
    }, "customer")
    assert cart["cart_version"] == 7 and cart["items"][0]["quantity"] == 2
    assert cart_manager.get_cart(session)["cart_version"] == 7
