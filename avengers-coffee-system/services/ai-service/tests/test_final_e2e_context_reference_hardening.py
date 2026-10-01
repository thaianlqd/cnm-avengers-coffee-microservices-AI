"""Final regressions for typed owners and numbered-reference semantics.

These tests intentionally exercise the real order graph boundaries.  Provider
and service calls are deterministic doubles, while owner/reference routing and
state transitions remain production code.
"""
import uuid

import pytest

from src.agents import agent_service, order_flow_graph
from src.agents.catalog_constraints import extract_catalog_search_text
from src.agents.selection_language import parse_selection_reference
from src.agents.shopping_language import interpret_shopping
from src.common import cart_manager
from src.function_calling.tools import branch_tools, cart_tools, product_tools, user_tools, voucher_tools


PRODUCTS = [
    {"product_id": "P-LONG", "product_name": "1 Lít Matcha Latte Tây Bắc", "category": "drink",
     "final_price": 115000},
    {"product_id": "P-SHORT", "product_name": "Matcha Latte Tây Bắc", "category": "drink",
     "final_price": 65000},
]
CAKES = [
    {"product_id": "P-CAKE-1", "product_name": "Bánh Trung Thu Matcha", "category": "food",
     "final_price": 99000},
    {"product_id": "P-CAKE-2", "product_name": "Bánh Trung Thu Đậu Xanh", "category": "food",
     "final_price": 89000},
]
LOCATION_CANDIDATES = [
    {"provider_ref_id": "poi-1", "normalized_label": "Trường Đại Học Ánh Dương",
     "display_address": "Phường Bình Minh", "lat": 10.1, "lng": 106.1,
     "admin_components": {"ward": "Phường Bình Minh"}, "accepted": True},
    {"provider_ref_id": "poi-2", "normalized_label": "Trung Tâm Sao Mai",
     "display_address": "Phường An Lạc", "lat": 10.2, "lng": 106.2,
     "admin_components": {"ward": "Phường An Lạc"}, "accepted": True},
]


def _session(prefix):
    return f"{prefix}-{uuid.uuid4().hex}"


def _state(session, message, *, intent=None):
    state = {
        "session_id": session,
        "user_message": message,
        "history": [],
        "cart": cart_manager.get_cart(session),
        "cart_sync_status": "ok",
    }
    if intent is not None:
        state["intent"] = intent
    return state


def _seed_cart(session):
    cart_manager.replace_items_from_order_cart(session, [
        {"id": 11, "ma_san_pham": "P1", "ten_san_pham": "Americano",
         "gia_ban": 39000, "so_luong": 1},
        {"id": 12, "ma_san_pham": "P2", "ten_san_pham": "Bánh Matcha",
         "gia_ban": 49000, "so_luong": 1},
    ])


def _quote(session, *, voucher_code=None, discount=0):
    cart = cart_manager.get_cart(session)
    subtotal = sum(float(row["unit_price"]) * int(row["quantity"]) for row in cart["items"])
    return {
        "status": "ok",
        "cart": cart,
        "quote": {
            "items": cart["items"],
            "subtotal": subtotal,
            "voucher_code": voucher_code,
            "discount_amount": discount,
            "final_total": subtotal - discount,
        },
    }


@pytest.mark.parametrize("message,operation", [
    ("bánh số 1 giá bao nhiêu?", "INFO_REFERENCE"),
    ("voucher số 1 giảm bao nhiêu?", "INFO_REFERENCE"),
    ("phương thức thanh toán số 4 là gì?", "INFO_REFERENCE"),
    ("cho tôi bánh số 1", "SELECT_REFERENCE"),
    ("áp voucher số 1", "MUTATE_REFERENCE"),
    ("xóa dòng số 2", "MUTATE_REFERENCE"),
])
def test_shared_reference_parser_carries_operation_semantics(message, operation):
    reference = parse_selection_reference(message)
    assert reference.requested is True
    assert reference.operation_semantics == operation


def test_location_candidate_owner_survives_view_cart_then_selects_provider_candidate(monkeypatch):
    session = _session("location-resume")
    _seed_cart(session)
    cart_manager.set_checkout_context(
        session, checkout_requested=True, voucher_decided=True,
        delivery_type="TAI_CHO", payment_method="THANH_TOAN_KHI_NHAN_HANG",
        location_candidate_snapshot={
            "query": "trường đại học", "kind": "poi", "transactional": True,
            "candidates": LOCATION_CANDIDATES,
        },
    )
    cart_manager.set_pending_action(session, "select_location_candidate", {"count": 2})
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(cart_tools, "execute_get_cart_quote", lambda sid: _quote(sid))
    branch_calls = []
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda **kwargs: branch_calls.append(kwargs) or {
        "status": "need_branch_selection",
        "branches": [{"ma_chi_nhanh": "B1", "ten_chi_nhanh": "Quán Một",
                      "availability_status": "available"}],
        "message": "Bạn chọn cửa hàng.",
    })

    viewed = order_flow_graph.run_order_flow(session, "cho tôi xem giỏ hiện tại")
    assert viewed["tool_calls_log"][0]["tool"] == "get_cart_quote"
    assert (cart_manager.get_pending_action(session) or {}).get("type") == "select_location_candidate"

    selected = order_flow_graph.run_order_flow(session, "tôi ở địa chỉ 1 á")
    assert len(branch_calls) == 1
    assert branch_calls[0]["resolved_location"]["provider_ref_id"] == "poi-1"
    assert branch_calls[0]["resolved_location"]["lat"] == 10.1
    assert "Quán Một" in selected["reply"]
    assert cart_manager.get_checkout_prefs(session).get("location_candidate_snapshot") is None


def test_payment_ordinal_info_does_not_select_or_start_location():
    session = _session("payment-info")
    _seed_cart(session)
    cart_manager.set_checkout_context(session, checkout_requested=True, voucher_decided=True)
    cart_manager.set_pending_action(session, "select_checkout_choices", {})

    understood = order_flow_graph._understand(
        _state(session, "phương thức thanh toán số 4 là gì?"),
    )

    assert understood["intent"]["intent"] == "PAYMENT_INFO"
    assert understood["intent"]["ordinal"] == 4
    prefs = cart_manager.get_checkout_prefs(session)
    assert not prefs.get("payment_method") and not prefs.get("delivery_type")
    assert (cart_manager.get_pending_action(session) or {}).get("type") == "select_checkout_choices"


def test_checkout_choices_gate_location_until_both_are_selected(monkeypatch):
    session = _session("checkout-gate")
    _seed_cart(session)
    cart_manager.set_checkout_context(session, checkout_requested=True, voucher_decided=True)
    cart_manager.set_pending_action(session, "select_checkout_choices", {})
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(cart_tools, "execute_get_cart_quote", lambda sid: _quote(sid))
    monkeypatch.setattr(cart_tools, "get_wallet_payment_options", lambda *_args: {
        "payment_options": [{"code": "VI_DIEN_TU", "label": "Ví Avengers", "enabled": True}],
    })
    monkeypatch.setattr(
        agent_service, "_run_agent_impl",
        lambda *_args, **_kwargs: pytest.fail("location/legacy continuation ran before payment selection"),
    )

    info = order_flow_graph.run_order_flow(session, "phương thức thanh toán số 4 là gì?")
    assert "Tiền mặt (COD)" in info["reply"]
    assert not cart_manager.get_checkout_prefs(session).get("payment_method")

    fulfillment = order_flow_graph.run_order_flow(session, "hình thức nhận hàng số 2")
    prefs = cart_manager.get_checkout_prefs(session)
    assert prefs["delivery_type"] == "MANG_DI"
    assert not prefs.get("payment_method")
    assert (cart_manager.get_pending_action(session) or {}).get("type") == "select_payment"
    assert "Phương thức thanh toán" in fulfillment["reply"]


def test_product_ordinal_price_info_is_read_only_and_selection_still_adds():
    info_session = _session("product-info")
    cart_manager.set_checkout_context(info_session, last_product_suggestions=CAKES)
    before = cart_manager.get_cart(info_session)["items"]

    info = order_flow_graph._understand(_state(info_session, "bánh số 1 giá bao nhiêu?"))["intent"]
    assert info["intent"] == "PRODUCT_INFO"
    assert info["products"][0]["product_id"] == "P-CAKE-1"
    assert cart_manager.get_cart(info_session)["items"] == before

    add_session = _session("product-select")
    cart_manager.set_checkout_context(add_session, last_product_suggestions=CAKES)
    selected = order_flow_graph._understand(_state(add_session, "cho tôi bánh số 1"))["intent"]
    assert selected["intent"] == "ADD_ITEM"
    assert selected["resolved_products"][0]["product_id"] == "P-CAKE-1"


def test_exact_canonical_product_name_beats_overlapping_containment_match():
    meaning = interpret_shopping("thêm 1 Lít Matcha Latte Tây Bắc cho tôi", active_catalog=PRODUCTS)
    assert meaning.act == "ADD_ITEM"
    assert [row["product_id"] for row in meaning.targets] == ["P-LONG"]


def test_explicit_two_product_request_still_resolves_two_exact_products():
    meaning = interpret_shopping(
        "thêm Bánh Trung Thu Matcha và Bánh Trung Thu Đậu Xanh",
        active_catalog=CAKES,
    )
    assert meaning.act == "ADD_ITEM"
    assert [row["product_id"] for row in meaning.targets] == ["P-CAKE-1", "P-CAKE-2"]


@pytest.mark.parametrize("message,expected_line", [
    ("đổi số lượng dòng số 1 thành 2", "11"),
    ("xóa dòng số 2", "12"),
    ("sửa dòng thứ 2", "12"),
])
def test_explicit_cart_line_namespace_resolves_current_cart_snapshot(message, expected_line):
    session = _session("cart-line")
    _seed_cart(session)
    row, error = order_flow_graph._resolve_cart_line(cart_manager.get_cart(session), message)
    assert error is None
    assert str(row["cart_item_id"]) == expected_line


def test_invalid_cart_line_ordinal_returns_line_specific_clarification():
    session = _session("cart-line-invalid")
    _seed_cart(session)
    row, error = order_flow_graph._resolve_cart_line(
        cart_manager.get_cart(session), "xóa dòng số 9",
    )
    assert row is None
    assert "dòng" in error.lower() and "2" in error


def test_successful_quantity_mutation_clears_only_stale_cart_owner(monkeypatch):
    session = _session("cart-owner-clear")
    _seed_cart(session)
    cart_manager.set_pending_action(session, "edit_cart_item", {
        "operation": "SET_QUANTITY", "cart_item_id": "11", "missing": "retry",
    })
    monkeypatch.setattr(cart_tools, "execute_update_cart_item", lambda sid, line_id, desired: {
        "status": "ok", "cart": cart_manager.get_cart(sid),
        "quote": _quote(sid)["quote"],
    })

    result = order_flow_graph._execute(_state(
        session, "đổi số lượng dòng số 1 thành 2",
        intent={"intent": "SET_QUANTITY", "quantity": 2},
    ))["result"]

    assert result["tool_calls_log"][0]["tool"] == "update_cart_item"
    assert cart_manager.get_pending_action(session) is None
    cart_manager.set_checkout_context(session, flow_stage="CART_REVIEW")
    finished = order_flow_graph._understand(
        _state(session, "tôi đã xong giỏ, không thêm gì nữa"),
    )["intent"]
    assert finished["intent"] == "FINISH_CART"
    voucher = order_flow_graph._understand(
        _state(session, "voucher số 1 giảm bao nhiêu?"),
    )["intent"]
    assert voucher["intent"] == "VOUCHER_INFO"


def test_direct_cart_line_quantity_and_remove_each_write_exactly_once(monkeypatch):
    session = _session("cart-line-writes")
    _seed_cart(session)
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(cart_tools, "execute_get_cart_quote", lambda sid: _quote(sid))
    updates = []
    removals = []
    monkeypatch.setattr(cart_tools, "execute_update_cart_item", lambda sid, line_id, desired: updates.append(
        (line_id, desired)
    ) or {"status": "ok", "cart": cart_manager.get_cart(sid), "quote": _quote(sid)["quote"]})
    monkeypatch.setattr(cart_tools, "execute_remove_cart_item", lambda sid, line_id: removals.append(
        line_id
    ) or {"status": "ok", "message": "Đã xoá dòng món."})

    changed = order_flow_graph.run_order_flow(session, "đổi số lượng dòng số 1 thành 2")
    removed = order_flow_graph.run_order_flow(session, "xóa dòng số 2")

    assert updates == [("11", {"quantity": 2})]
    assert removals == ["12"]
    assert [entry["tool"] for entry in changed["tool_calls_log"]] == ["update_cart_item"]
    assert [entry["tool"] for entry in removed["tool_calls_log"]] == ["remove_cart_item"]


def test_voucher_ordinal_info_preserves_owner_and_never_applies():
    session = _session("voucher-info")
    _seed_cart(session)
    cart_manager.set_checkout_context(session, voucher_candidates=[{
        "ma_voucher": "SAVE10", "ten_voucher": "Giảm mười nghìn",
        "so_tien_giam_du_kien": 10000,
    }], voucher_offer_pending=True)
    cart_manager.set_pending_action(session, "select_voucher", {"count": 1})

    understood = order_flow_graph._understand(
        _state(session, "voucher số 1 giảm bao nhiêu?"),
    )

    assert understood["intent"]["intent"] == "VOUCHER_INFO"
    assert understood["intent"]["ordinal"] == 1
    assert (cart_manager.get_pending_action(session) or {}).get("type") == "select_voucher"
    assert not cart_manager.get_checkout_prefs(session).get("voucher_code")


def test_successful_remove_voucher_keeps_voucher_specific_response(monkeypatch):
    session = _session("voucher-remove")
    _seed_cart(session)
    cart_manager.set_checkout_context(session, voucher_code="SAVE10", discount_amount=10000)
    monkeypatch.setattr(voucher_tools, "execute_remove_voucher", lambda _sid: {
        "status": "ok", "quote": _quote(session)["quote"],
        "message": "Đã bỏ mã giảm giá và xác minh lại tổng tiền của giỏ hàng.",
    })
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))

    executed = order_flow_graph._execute(_state(
        session, "bỏ mã giảm giá đó đi", intent={"intent": "REMOVE_VOUCHER"},
    ))
    rendered = order_flow_graph._render(executed)["result"]

    assert "bỏ mã giảm giá" in rendered["reply"].lower()
    assert "Tổng thanh toán" in rendered["reply"]
    assert "Yêu cầu sửa giỏ" not in rendered["reply"]


def test_read_only_cart_voucher_summary_has_totals_and_zero_write_tools(monkeypatch):
    session = _session("readonly-summary")
    _seed_cart(session)
    cart_manager.set_checkout_context(session, voucher_code="SAVE10", discount_amount=10000,
                                      voucher_invalidated="OLD10")
    monkeypatch.setattr(cart_tools, "execute_get_cart_quote", lambda sid: _quote(
        sid, voucher_code="SAVE10", discount=10000,
    ))
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))

    understood = order_flow_graph._understand(
        _state(session, "xác nhận lại toàn bộ giỏ, mã giảm giá và tổng tiền cho tôi"),
    )
    rendered = order_flow_graph._render(order_flow_graph._execute(understood))["result"]

    assert "Americano" in rendered["reply"] and "SAVE10" in rendered["reply"]
    assert "Tổng gốc" in rendered["reply"] and "Tổng thanh toán" in rendered["reply"]
    write_tools = {"add_to_cart", "update_cart_item", "remove_cart_item", "clear_cart",
                   "apply_voucher", "remove_voucher", "confirm_checkout"}
    assert not write_tools.intersection(entry["tool"] for entry in rendered["tool_calls_log"])


def test_explicit_saved_address_rereference_performs_fresh_profile_lookup(monkeypatch):
    session = _session("saved-rereference")
    _seed_cart(session)
    cart_manager.set_checkout_context(
        session, checkout_requested=True, voucher_decided=True,
        delivery_type="GIAO_TAN_NOI", payment_method="THANH_TOAN_KHI_NHAN_HANG",
        address_change_requested=True, suggested_address=None,
    )
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    profile_calls = []
    saved = "42 Đường Bình Minh, Phường An Lạc, Thành phố Ánh Dương"
    monkeypatch.setattr(user_tools, "execute_get_user_profile", lambda sid: profile_calls.append(sid) or {
        "status": "ok", "default_address": saved,
        "address_items": [{"label": "Nhà", "full_address": saved, "is_default": True}],
    })
    branch_calls = []
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda **kwargs: branch_calls.append(kwargs) or {
        "status": "need_branch_selection",
        "branches": [{"ma_chi_nhanh": "B1", "ten_chi_nhanh": "Quán Một",
                      "availability_status": "available"}],
    })

    result = order_flow_graph.run_order_flow(session, "giao đến địa chỉ đã lưu của tôi")

    assert profile_calls == [session]
    assert branch_calls and branch_calls[0]["location"] == saved
    assert any(entry["tool"] == "get_user_profile" for entry in result["tool_calls_log"])


def test_natural_family_browse_drops_commerce_scaffolding_but_keeps_qualifier():
    generic = interpret_shopping("cho tôi xem các loại bánh đang bán")
    assert generic.act == "BROWSE_FAMILY"
    assert generic.category == "food" and generic.search_text is None
    assert extract_catalog_search_text("cho tôi xem các loại bánh đang bán") == ""

    qualified = interpret_shopping("bên bạn có bánh matcha gì")
    assert qualified.act == "BROWSE_FAMILY"
    assert qualified.category == "food" and qualified.search_text == "matcha"


def test_valid_dine_in_cod_flow_consumes_poi_candidate_and_confirms_once(monkeypatch):
    """A valid upstream state reaches a quote and creates exactly one order."""
    session = _session("valid-poi-e2e")
    product = {"product_id": "P1", "product_name": "Americano", "category": "drink",
               "final_price": 39000}
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    cart_manager.set_checkout_context(session, last_product_suggestions=[product])
    monkeypatch.setattr(product_tools, "execute_get_product_options", lambda *_args, **_kwargs: {
        "status": "ok", "product_id": "P1", "product_name": "Americano", "options": {},
    })
    monkeypatch.setattr(product_tools, "execute_check_price_and_stock", lambda **_kwargs: {
        "status": "ok", "products": [product],
    })

    add_calls = []
    def add(**kwargs):
        kwargs.pop("operation_id", None)
        add_calls.append(dict(kwargs))
        cart = cart_manager.add_item(**kwargs)
        return {"status": "ok", "cart": cart, "unit_price": kwargs["unit_price"]}
    monkeypatch.setattr(cart_tools, "execute_add_to_cart", add)

    monkeypatch.setattr(voucher_tools, "execute_get_applicable_vouchers", lambda _sid: {
        "status": "ok", "vouchers": [{"ma_voucher": "SAVE10", "ten_voucher": "Giảm 10.000đ",
                                        "so_tien_giam_du_kien": 10000}],
    })
    def quote(sid, voucher_code=None, include_delivery=False):
        cart = cart_manager.get_cart(sid)
        return {"items": cart["items"], "subtotal": cart["subtotal"],
                "discount_amount": 0, "voucher_code": voucher_code,
                "delivery_fee": 0, "final_total": cart["subtotal"]}
    monkeypatch.setattr(cart_tools, "_quote_authoritative_cart", quote)
    monkeypatch.setattr(cart_tools, "execute_get_cart_quote", lambda sid: {
        "status": "ok", "cart": cart_manager.get_cart(sid), "quote": quote(sid),
    })
    monkeypatch.setattr(user_tools, "execute_get_user_profile", lambda _sid: {
        "status": "ok", "default_address": "12 Đường Cũ, Phường Cũ, Thành phố Ánh Dương",
    })
    monkeypatch.setattr("src.common.inventory_validation.validate_cart_at_branch",
                        lambda *_args, **_kwargs: {"unavailable": [], "unverified": []})
    monkeypatch.setattr("src.function_calling.helpers._get_engine", lambda: object())
    monkeypatch.setattr(agent_service, "groq_agent_chat",
                        lambda **_kwargs: pytest.fail("valid deterministic flow reached generic LLM"))

    branch_calls = []
    def find_branch(**kwargs):
        branch_calls.append(kwargs)
        if kwargs.get("resolved_location"):
            branches = [{"ma_chi_nhanh": "B1", "ten_chi_nhanh": "Quán Một",
                         "dia_chi": "1 Đường Mới", "availability_status": "available"}]
            return {"status": "need_branch_selection", "branches": branches,
                    "message": "Bạn chọn cửa hàng số mấy?"}
        return {"status": "ambiguous", "location_candidates": LOCATION_CANDIDATES,
                "message": "Mình tìm thấy nhiều địa điểm; bạn chọn số nhé."}
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", find_branch)

    def set_branch(sid, branch_id, branch_name, **_kwargs):
        cart_manager.set_branch(sid, branch_id, branch_name)
        return {"status": "ok", "message": "Đã chọn cửa hàng."}
    monkeypatch.setattr(branch_tools, "execute_set_session_branch", set_branch)

    created = []
    def finalize(**kwargs):
        created.append(kwargs)
        result = {"status": "success", "order_id": "ORDER-POI-1", "total_price": 39000}
        cart_manager.clear_cart(session, order_id="ORDER-POI-1", checkout_result=result)
        return result
    monkeypatch.setattr("src.common.checkout_service.finalize_checkout", finalize)

    added = order_flow_graph.run_order_flow(session, "cho tôi món số 1")
    assert add_calls and any(entry["tool"] == "add_to_cart" for entry in added["tool_calls_log"])
    order_flow_graph.run_order_flow(session, "tôi đã xong giỏ, không thêm gì nữa")
    order_flow_graph.run_order_flow(session, "bỏ qua voucher")
    order_flow_graph.run_order_flow(session, "tiếp tục")
    saved_offer = order_flow_graph.run_order_flow(session, "dùng tại chỗ và tiền mặt COD")
    assert "12 Đường Cũ" in saved_offer["reply"]

    candidates = order_flow_graph.run_order_flow(session, "không, tôi đang ở trường đại học Ánh Dương")
    assert "chọn số" in candidates["reply"]
    assert (cart_manager.get_pending_action(session) or {}).get("type") == "select_location_candidate"

    branches = order_flow_graph.run_order_flow(session, "tôi ở địa chỉ 1 á")
    assert branch_calls[-1]["resolved_location"]["provider_ref_id"] == "poi-1"
    assert "Quán Một" in branches["reply"]
    assert (cart_manager.get_pending_action(session) or {}).get("type") == "select_branch"

    summary = order_flow_graph.run_order_flow(session, "cửa hàng số 1")
    assert summary["checkout_payload"], summary
    assert summary["checkout_payload"]["action_id"]
    assert created == []
    confirmed = order_flow_graph.run_order_flow(session, "oke xác nhận")
    assert confirmed["tool_calls_log"][0]["tool"] == "confirm_checkout"
    assert confirmed["tool_calls_log"][0]["result"]["order_id"] == "ORDER-POI-1"
    assert len(created) == 1
