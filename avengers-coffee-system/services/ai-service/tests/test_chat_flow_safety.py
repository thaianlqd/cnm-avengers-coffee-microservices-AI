import uuid

import jwt
import pytest
from fastapi import HTTPException

from src.agents import agent_service
from src.agents.agent_service import (
    _extract_additional_product_name,
    _future_fulfillment_request,
    _explicit_checkout_choices,
    _is_plain_confirmation,
    _product_review_query,
    _resolve_numbered_product_choices,
)


def test_detailed_product_review_extracts_product_name_without_instruction_words():
    assert _product_review_query("cho tôi đánh giá chi tiết về Bánh Trung Thu Cà Phê Lava nhé") == "Bánh Trung Thu Cà Phê Lava"


def test_product_review_extracts_name_from_conversational_phrasing():
    assert _product_review_query(
        "trước khi mua, đánh giá chi tiết 1 Lít Matcha Latte Tây Bắc giúp tôi"
    ) == "1 Lít Matcha Latte Tây Bắc"
    assert _product_review_query(
        "còn Bánh Trung Thu Cà Phê Lava được khách đánh giá thế nào, nói chi tiết nhé"
    ) == "Bánh Trung Thu Cà Phê Lava"
from src.common import cart_manager
from src.common.inventory_validation import validate_items_at_branch
from src.common.session_auth import authorize_session
from src.function_calling.tools.cart_tools import _normalize_checkout_args, execute_confirm_checkout, execute_request_checkout
from src.function_calling.tools.voucher_tools import execute_apply_voucher


def test_size_variant_is_absolute_price_and_topping_is_surcharge():
    from src.function_calling.tools.cart_tools import _only_size_value, _variant_unit_price

    rows = [
        ("Size", "Vừa", 95000),
        ("Topping", "Trân châu trắng", 10000),
        ("Lượng đá", "Ít đá", 0),
    ]
    assert _variant_unit_price(95000, rows, "Vừa", ["Trân châu trắng"]) == 105000
    assert _variant_unit_price(55000, [("Size", "Nhỏ", 49000)], "Nhỏ", []) == 49000
    assert _only_size_value(rows) == "Vừa"
    assert _only_size_value([("Kích thước", "Nhỏ", 49000), ("Kích thước", "Vừa", 55000)]) is None


def test_legacy_profile_address_repeated_suffix_is_collapsed():
    from src.function_calling.tools.user_tools import _clean_profile_address

    assert _clean_profile_address(
        "42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Thành phố Hồ Chí Minh, "
        "Phường Tây Thạnh, Thành phố Hồ Chí Minh"
    ) == "42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Thành phố Hồ Chí Minh"


def test_first_branch_wording_is_resolved_as_explicit_customer_choice(monkeypatch):
    session = "session-branch-first"
    candidates = [
        {"branch_id": "BR-1", "branch_name": "Cửa hàng Một"},
        {"branch_id": "BR-2", "branch_name": "Cửa hàng Hai"},
    ]
    cart_manager.set_checkout_context(session, branch_candidates=candidates)
    captured = {}

    def fake_set_branch(session_id, branch_id, branch_name, customer_selected=False):
        captured.update({
            "session_id": session_id,
            "branch_id": branch_id,
            "branch_name": branch_name,
            "customer_selected": customer_selected,
        })
        return {"status": "ok", "message": "Đã chọn cửa hàng."}

    monkeypatch.setattr(
        "src.function_calling.tools.branch_tools.execute_set_session_branch",
        fake_set_branch,
    )
    result = agent_service._resolve_pending_branch_choice(
        session,
        "tôi chọn chi nhánh đầu tiên",
        history=[{"role": "assistant", "content": "Các chi nhánh gần bạn:\n1. Cửa hàng Một\n2. Cửa hàng Hai"}],
    )

    assert result["reply"] == "Đã chọn cửa hàng."
    assert captured["branch_id"] == "BR-1"
    assert captured["customer_selected"] is True
    assert not cart_manager.get_checkout_prefs(session).get("branch_candidates")


def test_unavailable_branch_choice_is_blocked_and_candidates_are_kept(monkeypatch):
    session = "session-branch-blocked"
    candidates = [
        {"branch_id": "BR-BLOCKED", "branch_name": "Cửa hàng đang hết món"},
        {"branch_id": "BR-OK", "branch_name": "Cửa hàng còn món"},
    ]
    cart_manager.set_checkout_context(session, branch_candidates=candidates)
    monkeypatch.setattr(
        "src.function_calling.tools.branch_tools.execute_set_session_branch",
        lambda *_args, **_kwargs: {
            "status": "stock_conflict",
            "unavailable_products": ["Bánh Trung Thu Matcha"],
            "message": "Cửa hàng đang hết món Bánh Trung Thu Matcha; vui lòng chọn cửa hàng khác.",
        },
    )

    result = agent_service._resolve_pending_branch_choice(
        session,
        "tôi chọn chi nhánh đầu tiên",
        history=[{"role": "assistant", "content": "Các chi nhánh gần bạn:\n1. Cửa hàng đang hết món\n2. Cửa hàng còn món"}],
    )

    assert "Bánh Trung Thu Matcha" in result["reply"]
    assert cart_manager.get_checkout_prefs(session)["branch_candidates"] == candidates


def test_saved_address_confirmation_with_vietnamese_da_is_not_mistaken_for_ice(monkeypatch):
    session = "session-confirm-saved-address"
    cart_manager.set_checkout_prefs(session, delivery_type="MANG_DI")
    cart_manager.set_checkout_context(
        session,
        suggested_address="42/3 Nguyễn Hữu Tiến, Phường Tây Thạnh, Thành phố Hồ Chí Minh",
    )
    monkeypatch.setattr(
        "src.function_calling.tools.branch_tools.execute_find_nearest_branch",
        lambda **_kwargs: {
            "status": "need_branch_selection",
            "branches": [{
                "ma_chi_nhanh": "BR-1",
                "ten_chi_nhanh": "Cửa hàng Một",
                "dia_chi": "Địa chỉ Một",
                "khoang_cach_km": 0.3,
                "availability_status": "available",
            }],
        },
    )

    result = agent_service._confirm_saved_location(
        session,
        "đúng, dùng địa chỉ đã lưu",
        history=[{
            "role": "assistant",
            "content": "Bạn đang ở địa chỉ đã lưu này hay muốn dùng địa chỉ khác để tìm cửa hàng gần nhất?",
        }],
    )

    assert result is not None
    assert "Cửa hàng Một" in result["reply"]
    assert not cart_manager.get_checkout_prefs(session).get("suggested_address")


@pytest.fixture(autouse=True)
def isolated_cart(monkeypatch):
    cart_manager._SESSION_CARTS.clear()
    cart_manager._SESSION_LOCKS.clear()
    monkeypatch.setattr(cart_manager, "_load_from_db", lambda _session_id: None)
    monkeypatch.setattr(cart_manager, "_sync_to_db", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        "src.common.inventory_validation.validate_cart_at_branch",
        lambda *_args, **_kwargs: {"unavailable": [], "unverified": []},
    )
    monkeypatch.setattr(
        "src.function_calling.helpers._get_engine",
        lambda: object(),
    )
    yield
    cart_manager._SESSION_CARTS.clear()
    cart_manager._SESSION_LOCKS.clear()


def test_payment_and_delivery_choices_are_remembered_before_products():
    assert _explicit_checkout_choices("Mình trả tiền mặt nha") == {
        "payment_method": "THANH_TOAN_KHI_NHAN_HANG"
    }
    assert _explicit_checkout_choices("Có thanh toán tiền mặt được không?") == {}
    assert _explicit_checkout_choices("Không dùng VNPay, tiền mặt nha") == {
        "payment_method": "THANH_TOAN_KHI_NHAN_HANG"
    }
    assert _explicit_checkout_choices("Không giao tận nơi, mang đi") == {
        "delivery_type": "MANG_DI"
    }
    assert _explicit_checkout_choices("Tôi lấy tại quán và thanh toán tiền mặt") == {
        "payment_method": "THANH_TOAN_KHI_NHAN_HANG",
        "delivery_type": "MANG_DI",
    }


def test_profile_lookup_uses_customer_id_without_conversation_suffix(monkeypatch):
    from src.function_calling.tools import user_tools

    captured = []
    monkeypatch.setattr(user_tools, "_require_valid_session", lambda value: captured.append(value) or None)
    result = user_tools.execute_get_user_profile("user-123:conversation:chat-456")
    assert result["status"] == "unauthorized"
    assert captured == ["user-123"]


def test_checkout_normalization_does_not_silently_default_unknown_values():
    assert _normalize_checkout_args(None, None) == (None, None)
    assert _normalize_checkout_args("khác", "đến quán") == (None, None)
    assert _normalize_checkout_args("tiền mặt", "giao tận nơi") == (
        "THANH_TOAN_KHI_NHAN_HANG",
        "GIAO_TAN_NOI",
    )


def test_explicit_preferences_survive_cart_changes_but_old_summary_does_not():
    session = "session-test"
    cart_manager.set_checkout_prefs(
        session,
        payment_method="THANH_TOAN_KHI_NHAN_HANG",
        delivery_type="GIAO_TAN_NOI",
    )
    cart_manager.add_item(session, "1", "Test coffee", 25000, note="ít đá")

    prefs = cart_manager.get_checkout_prefs(session)
    assert prefs["payment_method"] == "THANH_TOAN_KHI_NHAN_HANG"
    assert prefs["delivery_type"] == "GIAO_TAN_NOI"
    assert "summary_fingerprint" not in prefs

    cart_manager.set_checkout_prefs(session, delivery_address="ADDR-1")
    cart_manager.set_branch(session, "BR-1", "Branch 1")
    cart_manager.mark_checkout_summary(session)
    assert cart_manager.get_checkout_prefs(session)["summary_fingerprint"] == cart_manager.cart_fingerprint(session)

    cart_manager.add_item(session, "1", "Test coffee", 25000, note="không đường")
    prefs = cart_manager.get_checkout_prefs(session)
    assert prefs["payment_method"] == "THANH_TOAN_KHI_NHAN_HANG"
    assert prefs["delivery_address"] == "ADDR-1"
    assert "summary_fingerprint" not in prefs


def test_reset_new_conversation_clears_draft_state_but_preserves_cart_and_preferences():
    session = "session-new-conversation"
    cart_manager.add_item(session, "1", "Cà phê", 25000)
    cart_manager.set_checkout_prefs(
        session,
        payment_method="THANH_TOAN_KHI_NHAN_HANG",
        delivery_type="MANG_DI",
    )
    cart_manager.set_checkout_context(
        session,
        pending_products=[{"product_name": "Bánh cũ", "options": {"groups": {}}}],
        checkout_requested=True,
        branch_candidates=[{"branch_id": "BR-1"}],
        voucher_candidates=[{"ma_voucher": "OLD"}],
        voucher_offer_pending=True,
    )

    cart_manager.reset_conversation_draft(session)

    assert [item["product_name"] for item in cart_manager.get_cart(session)["items"]] == ["Cà phê"]
    prefs = cart_manager.get_checkout_prefs(session)
    assert prefs["payment_method"] == "THANH_TOAN_KHI_NHAN_HANG"
    assert prefs["delivery_type"] == "MANG_DI"
    assert not prefs.get("pending_products")
    assert not prefs.get("checkout_requested")
    assert not prefs.get("branch_candidates")
    assert not prefs.get("voucher_candidates")


def test_new_conversation_state_namespace_does_not_inherit_pending_products():
    from src.agents.agent_service import _conversation_scope_session_id

    old_session = _conversation_scope_session_id("user-1", "conversation-old")
    new_session = _conversation_scope_session_id("user-1", "conversation-new")
    cart_manager.set_pending_products(old_session, [{"product_name": "Bánh cũ"}])

    assert cart_manager.get_checkout_prefs(new_session).get("pending_products") in (None, [])
    assert cart_manager.get_checkout_prefs(old_session)["pending_products"][0]["product_name"] == "Bánh cũ"




def test_empty_cart_never_prepares_checkout_even_if_payment_was_selected():
    session = "session-empty"
    cart_manager.set_checkout_prefs(session, payment_method="THANH_TOAN_KHI_NHAN_HANG")
    result = execute_request_checkout(session, delivery_type="MANG_DI")
    assert result["status"] == "empty_cart"


def test_delivery_checkout_requires_customer_address_and_supported_cod():
    session = "session-delivery"
    cart_manager.add_item(session, "1", "Test coffee", 25000)
    cart_manager.set_branch(session, "BR-1", "Branch 1")

    missing_address = execute_request_checkout(
        session,
        payment_method="COD",
        delivery_type="GIAO_TAN_NOI",
    )
    assert missing_address["status"] == "need_delivery_address"

    assert _normalize_checkout_args("VNPAY", "MANG_DI") == ("VNPAY", "MANG_DI")


def test_confirmation_requires_a_current_server_created_summary():
    result = execute_confirm_checkout("session-no-summary")
    assert result["status"] == "no_pending_checkout"


def test_confirmation_rejects_an_action_from_an_older_summary():
    session = "session-action-id"
    cart_manager.add_item(session, "1", "Test coffee", 25000)
    cart_manager.set_branch(session, "BR-1", "Branch 1")
    cart_manager.set_checkout_prefs(
        session,
        payment_method="THANH_TOAN_KHI_NHAN_HANG",
        delivery_type="MANG_DI",
    )
    first = cart_manager.mark_checkout_summary(session)
    second = cart_manager.mark_checkout_summary(session)

    assert first["checkout_action_id"] != second["checkout_action_id"]
    result = execute_confirm_checkout(session, action_id=first["checkout_action_id"])
    assert result["status"] == "stale_checkout"


def test_checkout_quote_does_not_mutate_cart_or_invalidate_summary(monkeypatch):
    session = "session-quote-snapshot"
    cart_manager.add_item(session, "1", "Matcha", 105000, toppings=["Trân châu trắng"])
    cart_manager.set_branch(session, "BR-1", "Branch 1")
    cart_manager.set_checkout_prefs(
        session,
        payment_method="THANH_TOAN_KHI_NHAN_HANG",
        delivery_type="MANG_DI",
    )
    monkeypatch.setattr(
        "src.function_calling.tools.cart_tools.sync_authoritative_cart",
        lambda _session_id: cart_manager.get_cart(_session_id),
    )
    monkeypatch.setattr(
        "src.function_calling.tools.cart_tools._quote_authoritative_cart",
        lambda *_args, **_kwargs: {
            "items": [{"id": None, "unit_price": 105000, "line_total": 105000}],
            "subtotal": 105000,
            "discount_amount": 0,
            "final_total": 105000,
            "voucher_code": None,
        },
    )

    checkout = execute_request_checkout(session)
    assert checkout["status"] == "require_confirmation"
    assert checkout["order_summary"]["items"][0]["line_total"] == 105000
    assert "line_total" not in cart_manager.get_cart(session)["items"][0]

    cart_manager.replace_items_from_order_cart(session, [{
        "ma_san_pham": "1",
        "ten_san_pham": "Matcha",
        "gia_ban": 105000,
        "so_luong": 1,
        "size": None,
        "toppings": ["Trân châu trắng"],
    }])
    assert cart_manager.get_checkout_prefs(session).get("summary_fingerprint")


def test_applying_same_voucher_is_idempotent(monkeypatch):
    session = "session-voucher-idempotent"
    cart_manager.add_item(session, "1", "Coffee", 100000)
    cart_manager.set_checkout_context(session, voucher_code="SAVE10", discount_amount=10000)
    monkeypatch.setattr(
        "src.function_calling.tools.voucher_tools.requests.post",
        lambda *_args, **_kwargs: pytest.fail("same voucher must not be validated twice"),
    )

    result = execute_apply_voucher(session, "save10")
    assert result["status"] == "already_applied"
    assert result["final_total"] == 90000


def test_confirmation_phrase_must_be_plain_and_unambiguous():
    assert _is_plain_confirmation("Đồng ý")
    assert _is_plain_confirmation("OK!")
    assert _is_plain_confirmation("xác nhận đặt hàng")
    assert _is_plain_confirmation("Đồng ý chốt đơn đi")
    assert _is_plain_confirmation("oke ổn rồi chốt đi")
    assert _is_plain_confirmation("ừ chốt đơn luôn nhé")
    assert not _is_plain_confirmation("Ok nhưng đổi sang mang đi")
    assert not _is_plain_confirmation("Đồng ý, đừng đặt vội")
    assert not _is_plain_confirmation("Chốt đơn chưa?")


def test_resolves_food_and_drink_ordinals_without_dropping_second_item():
    history = [{
        "role": "assistant",
        "content": (
            "Nước: 1. 1 Lít Matcha Latte Tây Bắc 2. Bạc Xỉu "
            "Bánh: 1. Bánh Trung Thu Cà Phê Lava 2. Bánh Chuối Phủ Hạt "
            "Bạn muốn chọn món nào?"
        ),
    }]
    assert _resolve_numbered_product_choices("nước số 1 và bánh số 1 đi", history) == [
        {"category": "drink", "number": 1, "product_name": "1 Lít Matcha Latte Tây Bắc"},
        {"category": "food", "number": 1, "product_name": "Bánh Trung Thu Cà Phê Lava"},
    ]
    assert _resolve_numbered_product_choices("nước số 1 và bánh thứ 2 nhé", history) == [
        {"category": "drink", "number": 1, "product_name": "1 Lít Matcha Latte Tây Bắc"},
        {"category": "food", "number": 2, "product_name": "Bánh Chuối Phủ Hạt"},
    ]


def test_numbered_choice_uses_earlier_menu_after_an_intervening_review():
    history = [
        {
            "role": "assistant",
            "content": (
                "**Bánh:**\n1. Bánh Trung Thu Cà Phê Lava - 99.000đ\n"
                "2. Bánh Chuối Phủ Hạt - 39.000đ\n\n"
                "**Nước:**\n1. 1 Lít Matcha Latte Tây Bắc - 95.000đ\n"
                "2. Bạc Xỉu - 39.000đ"
            ),
        },
        {"role": "user", "content": "đánh giá bánh số 1"},
        {"role": "assistant", "content": "Món này hiện chưa có đánh giá nào trên hệ thống."},
    ]

    assert _resolve_numbered_product_choices("cho tôi bánh số 1 và nước số 1 nhé", history) == [
        {"category": "drink", "number": 1, "product_name": "1 Lít Matcha Latte Tây Bắc"},
        {"category": "food", "number": 1, "product_name": "Bánh Trung Thu Cà Phê Lava"},
    ]


def test_numbered_choice_accepts_nuoc_uong_heading_after_reviews():
    history = [
        {
            "role": "assistant",
            "content": (
                "**Nước uống:**\n1. 1 Lít Matcha Latte Tây Bắc - 95.000đ\n"
                "2. Bạc Xỉu - 39.000đ\n\n"
                "**Bánh:**\n1. Bánh Trung Thu Cà Phê Lava - 99.000đ\n"
                "2. Bánh Trung Thu Thập Cẩm Bát Bửu - 119.000đ"
            ),
        },
        {"role": "assistant", "content": "Món nước hiện chưa có đánh giá nào."},
        {"role": "assistant", "content": "Món bánh hiện chưa có đánh giá nào."},
    ]
    assert _resolve_numbered_product_choices(
        "oke vậy lấy cho tôi nước số 1 và bánh số 1 trong danh sách ban đầu nhé",
        history,
    ) == [
        {"category": "drink", "number": 1, "product_name": "1 Lít Matcha Latte Tây Bắc"},
        {"category": "food", "number": 1, "product_name": "Bánh Trung Thu Cà Phê Lava"},
    ]


def test_resolves_natural_banh_thi_so_two_wording():
    history = [{
        "role": "assistant",
        "content": (
            "Đồ uống:\n1. 1 Lít Matcha Latte Tây Bắc\n2. Bạc Xỉu\n"
            "Món bánh:\n1. Bánh Trung Thu Cà Phê Lava\n2. Bánh Trung Thu Thập Cẩm Bát Bửu"
        ),
    }]
    assert _resolve_numbered_product_choices(
        "cho tôi nước số 1 nhé còn bánh thì số 2 cho tôi, đánh giá của khách về 2 sản phẩm này như nào",
        history,
    ) == [
        {"category": "drink", "number": 1, "product_name": "1 Lít Matcha Latte Tây Bắc"},
        {"category": "food", "number": 2, "product_name": "Bánh Trung Thu Thập Cẩm Bát Bửu"},
    ]


def test_resolves_duplicate_ordinals_under_specific_vietnamese_headings():
    history = [{
        "role": "assistant",
        "content": (
            "Trà trái cây:\n"
            "1. 1 Lít Matcha Latte Tây Bắc\n"
            "2. 1 Lít Matcha Latte Tây Bắc Sữa Yến Mạch\n\n"
            "Món bánh:\n"
            "1. Bánh Trung Thu Cà Phê Lava\n"
            "2. Bánh Trung Thu Thập Cẩm Bát Bửu\n\n"
            "Bạn muốn chọn món nào từ danh sách trên?"
        ),
    }]
    assert _resolve_numbered_product_choices(
        "cho tôi nước số 1 và bánh thì thứ 2 đi", history
    ) == [
        {"category": "drink", "number": 1, "product_name": "1 Lít Matcha Latte Tây Bắc"},
        {"category": "food", "number": 2, "product_name": "Bánh Trung Thu Thập Cẩm Bát Bửu"},
    ]


def test_review_request_for_two_products_infers_same_ordinal_in_other_category():
    history = [{
        "role": "assistant",
        "content": (
            "Đồ uống:\n1. 1 Lít Matcha Latte Tây Bắc\n2. Bạc Xỉu\n"
            "Món bánh:\n1. Bánh Trung Thu Cà Phê Lava\n2. Bánh Trung Thu Thập Cẩm Bát Bửu"
        ),
    }]
    assert _resolve_numbered_product_choices(
        "cho tôi nước số 1 nhé, đánh giá của khách về 2 sản phẩm này như nào",
        history,
    ) == [
        {"category": "drink", "number": 1, "product_name": "1 Lít Matcha Latte Tây Bắc"},
        {"category": "food", "number": 1, "product_name": "Bánh Trung Thu Cà Phê Lava"},
    ]


def test_extracts_product_added_after_checkout_preview():
    assert _extract_additional_product_name(
        "à tôi muốn mua thêm Bánh Trung Thu Matcha nữa"
    ) == "Bánh Trung Thu Matcha"
    assert _extract_additional_product_name("thêm topping hạt sen") is None


def test_future_dine_in_time_is_not_silently_discarded(monkeypatch):
    assert _future_fulfillment_request("2 tiếng nữa tôi qua") == "2 tieng nua"
    monkeypatch.setattr(
        agent_service,
        "groq_agent_chat",
        lambda **_kwargs: pytest.fail("unsupported scheduling must be handled before the model"),
    )

    result = agent_service.run_agent(
        "session-future-dine-in",
        "tôi muốn dùng tại chỗ, 2 tiếng nữa tôi qua",
        history=[],
    )

    assert "chưa hỗ trợ đặt giờ hoặc giữ bàn" in result["reply"]


def test_additional_no_option_product_is_written_before_bot_claims_success(monkeypatch):
    session = "session-additional-product"
    cart_manager.add_item(session, "1", "Bánh cũ", 119000)
    cart_manager.set_branch(session, "BR-1", "Cửa hàng 1")
    cart_manager.set_checkout_prefs(
        session,
        payment_method="THANH_TOAN_KHI_NHAN_HANG",
        delivery_type="TAI_CHO",
    )
    cart_manager.mark_checkout_summary(session)

    monkeypatch.setattr(
        "src.function_calling.tools.product_tools.execute_get_product_options",
        lambda _name: {
            "status": "ok",
            "product_name": "Bánh Trung Thu Matcha",
            "message": "Sản phẩm Bánh Trung Thu Matcha không có tùy chọn nào. Cứ đặt mặc định.",
        },
    )
    monkeypatch.setattr(
        "src.function_calling.tools.product_tools.execute_check_price_and_stock",
        lambda *_args, **_kwargs: {
            "status": "ok",
            "products": [{
                "product_id": "2",
                "product_name": "Bánh Trung Thu Matcha",
                "final_price": 99000,
                "in_stock": True,
            }],
        },
    )

    def fake_add(**kwargs):
        cart = cart_manager.add_item(
            kwargs["session_id"], kwargs["product_id"], kwargs["product_name"], kwargs["unit_price"]
        )
        return {"status": "ok", "cart": cart}

    monkeypatch.setattr("src.function_calling.tools.cart_tools.execute_add_to_cart", fake_add)
    monkeypatch.setattr(
        agent_service,
        "groq_agent_chat",
        lambda **_kwargs: pytest.fail("explicit additional product must be handled deterministically"),
    )

    result = agent_service.run_agent(
        session_id=session,
        user_message="à tôi muốn mua thêm Bánh Trung Thu Matcha nữa",
        history=[],
    )

    assert result["tool_calls_log"][-1]["tool"] == "add_to_cart"
    assert [item["product_name"] for item in cart_manager.get_cart(session)["items"]] == [
        "Bánh cũ", "Bánh Trung Thu Matcha"
    ]
    assert "summary_fingerprint" not in cart_manager.get_checkout_prefs(session)


def test_checkout_rechecks_inventory_and_blocks_suspended_stock(monkeypatch):
    session = "session-stock-refresh"
    cart_manager.add_item(session, "1", "Bánh Matcha", 99000)
    cart_manager.set_branch(session, "BR-1", "Cửa hàng 1")
    cart_manager.set_checkout_prefs(
        session,
        payment_method="THANH_TOAN_KHI_NHAN_HANG",
        delivery_type="TAI_CHO",
    )
    monkeypatch.setattr(
        "src.common.inventory_validation.validate_cart_at_branch",
        lambda *_args, **_kwargs: {"unavailable": ["Bánh Matcha"], "unverified": []},
    )

    result = execute_request_checkout(session)

    assert result["status"] == "stock_conflict"
    assert "Bánh Matcha" in result["message"]


def test_bot_cannot_claim_cart_add_without_successful_write(monkeypatch):
    monkeypatch.setattr(
        agent_service,
        "groq_agent_chat",
        lambda **_kwargs: {
            "reply": "Mình đã thêm Bánh Matcha vào giỏ.",
            "checkout_payload": None,
            "tool_calls_log": [],
            "error": None,
        },
    )

    result = agent_service.run_agent("session-false-add", "xử lý món đó giúp tôi", history=[])

    assert "chưa ghi được" in result["reply"].lower()


def test_non_purchase_question_does_not_expose_add_to_cart_tool(monkeypatch):
    captured = {}

    def fake_agent(**kwargs):
        captured["tool_names"] = {
            tool["function"]["name"] for tool in kwargs["tools"]
        }
        return {"reply": "Món này có vị cà phê.", "checkout_payload": None, "tool_calls_log": [], "error": None}

    monkeypatch.setattr(agent_service, "groq_agent_chat", fake_agent)
    monkeypatch.setattr(
        "src.function_calling.tools.cart_tools.sync_authoritative_cart",
        lambda _session_id: cart_manager.get_cart(_session_id),
    )

    agent_service.run_agent("session-read-only", "món này có vị thế nào?", history=[])

    assert "add_to_cart" not in captured["tool_names"]


def test_exact_cart_regression_browsing_matcha_never_replays_add_to_cart(monkeypatch):
    """TC-A: a read-only Matcha browse cannot mutate the Order Service cart.

    The fake below is intentionally an Order Service boundary, not a mocked
    `cart_manager` writer. `sync_authoritative_cart` only mirrors its rows,
    and the assertion is over the server rows and mutation count.
    """
    from src.agents.order_flow_graph import run_order_flow
    from src.function_calling.tools import cart_tools, product_tools

    session = "customer-42:conversation:cart-regression"
    server_rows = []
    mutation_calls = []
    server_version = [0]
    catalog = {
        "D1": {"product_id": "D1", "product_name": "Nước Một", "final_price": 31000, "category": "Đồ uống"},
        "D2": {"product_id": "D2", "product_name": "Nước Hai", "final_price": 39000, "category": "Đồ uống"},
        "F1": {"product_id": "F1", "product_name": "Bánh Một", "final_price": 29000, "category": "Bánh"},
        "M1": {"product_id": "M1", "product_name": "Matcha Latte", "final_price": 55000, "category": "Đồ uống"},
    }

    def order_service_get(_session):
        mirrored = cart_manager.replace_items_from_order_cart(
            session,
            list(server_rows),
            cart_id="user:customer-42",
            cart_version=server_version[0],
            user_id="customer-42",
        )
        return {**mirrored, "authoritative": True, "cart_sync_status": "ok"}

    def order_service_add(**kwargs):
        operation_id = kwargs.get("operation_id")
        assert operation_id  # graph must inject a stable server-side identity.
        mutation_calls.append(operation_id)
        product = catalog[kwargs["product_id"]]
        row = {
            "id": len(server_rows) + 1,
            "ma_san_pham": product["product_id"],
            "ten_san_pham": product["product_name"],
            "gia_ban": product["final_price"],
            "so_luong": kwargs["quantity"],
            "size": kwargs.get("size") or "Nhỏ",
            "toppings": kwargs.get("toppings") or [],
        }
        server_rows.append(row)
        server_version[0] += 1
        return {"status": "ok", "persisted_line": row, "cart": order_service_get(session)}

    def recommendations(**kwargs):
        if kwargs.get("search_text") == "matcha":
            return {"status": "ok", "products": [catalog["M1"]]}
        if kwargs["category"] == "drink":
            return {"status": "ok", "products": [catalog["D1"], catalog["D2"]]}
        return {"status": "ok", "products": [catalog["F1"]]}

    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", order_service_get)
    monkeypatch.setattr(cart_tools, "execute_add_to_cart", order_service_add)
    monkeypatch.setattr(product_tools, "execute_get_recommendations", recommendations)
    monkeypatch.setattr(product_tools, "execute_get_product_options", lambda _name: {
        "status": "ok", "options": {"Kích thước": ["Nhỏ"]},
    })
    monkeypatch.setattr(product_tools, "execute_check_price_and_stock", lambda **kwargs: {
        "status": "ok",
        "products": [next(product for product in catalog.values() if product["product_name"] == kwargs["product_name_query"])],
    })

    run_order_flow(session, "tôi muốn mua bánh và nước", client_message_id="menu-turn")
    added = run_order_flow(
        session,
        "thêm nước số 2 với bánh số 1",
        client_message_id="selection-turn",
    )
    assert [row["ma_san_pham"] for row in server_rows] == ["D2", "F1"]
    assert [row["so_luong"] for row in server_rows] == [1, 1]
    assert len(mutation_calls) == 2
    assert mutation_calls[0].endswith(":add_cart_line:0")
    assert mutation_calls[1].endswith(":add_cart_line:1")
    assert len([entry for entry in added["tool_calls_log"] if entry["tool"] == "add_to_cart"]) == 2
    assert server_version[0] == 2
    assert cart_manager.get_cart(session)["cart_version"] == 2

    fingerprint_before = tuple((row["id"], row["ma_san_pham"], row["so_luong"]) for row in server_rows)
    browsed = run_order_flow(session, "xem các sản phẩm về Matcha", client_message_id="matcha-turn-0")
    for turn in range(1, 20):
        run_order_flow(session, "xem các sản phẩm về Matcha", client_message_id=f"matcha-turn-{turn}")
    fingerprint_after = tuple((row["id"], row["ma_san_pham"], row["so_luong"]) for row in server_rows)

    assert fingerprint_after == fingerprint_before
    assert len(mutation_calls) == 2
    assert server_version[0] == 2
    assert cart_manager.get_cart(session)["cart_version"] == 2
    assert not any(entry["tool"] == "add_to_cart" for entry in browsed["tool_calls_log"])
    assert next(row for row in server_rows if row["ma_san_pham"] == "F1")["so_luong"] == 1


def test_product_review_question_is_routed_to_product_insights(monkeypatch):
    monkeypatch.setattr(
        "src.function_calling.tools.cart_tools.sync_authoritative_cart",
        lambda _session_id: cart_manager.get_cart(_session_id),
    )
    monkeypatch.setattr(
        "src.function_calling.tools.product_tools.execute_get_product_insights",
        lambda name: {"status": "ok", "message": f"Đánh giá thật của {name}: 4.8 sao"},
    )
    monkeypatch.setattr(
        agent_service,
        "groq_agent_chat",
        lambda **_kwargs: pytest.fail("product reviews must use deterministic product insights routing"),
    )

    result = agent_service.run_agent(
        "session-product-review",
        "đánh giá của sản phẩm Americano Mơ thế nào?",
        history=[],
    )

    assert result["tool_calls_log"][0]["tool"] == "get_product_insights"
    assert result["tool_calls_log"][0]["args"]["product_name"] == "Americano Mơ"
    assert "Americano Mơ" in result["reply"]


def test_numbered_product_reviews_do_not_select_or_add_products(monkeypatch):
    history = [{
        "role": "assistant",
        "content": (
            "Nước:\n1. 1 Lít Matcha Latte Tây Bắc\n2. Bạc Xỉu\n"
            "Bánh:\n1. Bánh Trung Thu Cà Phê Lava\n2. Bánh Chuối Phủ Hạt"
        ),
    }]
    monkeypatch.setattr(
        "src.function_calling.tools.cart_tools.sync_authoritative_cart",
        lambda _session_id: cart_manager.get_cart(_session_id),
    )
    monkeypatch.setattr(
        "src.function_calling.tools.product_tools.execute_get_product_insights",
        lambda name: {"status": "ok", "message": f"{name} được 4.8 sao"},
    )

    result = agent_service.run_agent(
        "session-numbered-reviews",
        "cho tôi xem đánh giá của sp nước 1 và bánh 1 đi",
        history=history,
    )

    assert [entry["args"]["product_name"] for entry in result["tool_calls_log"]] == [
        "1 Lít Matcha Latte Tây Bắc",
        "Bánh Trung Thu Cà Phê Lava",
    ]
    assert cart_manager.get_cart("session-numbered-reviews")["is_empty"]
    assert not cart_manager.get_checkout_prefs("session-numbered-reviews").get("pending_products")


def test_combined_numbered_order_and_review_keeps_both_products_and_shows_options(monkeypatch):
    history = [{
        "role": "assistant",
        "content": (
            "Đồ uống:\n1. 1 Lít Matcha Latte Tây Bắc\n2. Bạc Xỉu\n"
            "Món bánh:\n1. Bánh Trung Thu Cà Phê Lava\n2. Bánh Trung Thu Thập Cẩm Bát Bửu"
        ),
    }]
    monkeypatch.setattr(
        "src.function_calling.tools.cart_tools.sync_authoritative_cart",
        lambda _session_id: cart_manager.get_cart(_session_id),
    )
    monkeypatch.setattr(
        "src.function_calling.tools.product_tools.execute_get_product_insights",
        lambda name: {"status": "ok", "message": f"{name}: 4 sao"},
    )
    monkeypatch.setattr(
        "src.function_calling.tools.product_tools.execute_get_product_options",
        lambda name: {
            "status": "ok",
            "product_name": name,
            "options": {"Kích thước": ["Vừa"], "Topping": ["Hạt Sen", "Sữa Yến Mạch"], "Lượng đá": ["Ít đá", "Đá riêng"], "Độ ngọt": ["Ít ngọt", "Không ngọt"]},
            "message": "Các tùy chọn là: ...",
        },
    )

    result = agent_service.run_agent(
        "session-combined-review-order",
        "cho tôi nước số 1 nhé còn bánh thì số 2 cho tôi, đánh giá của khách về 2 sản phẩm này như nào",
        history=history,
    )

    assert len([entry for entry in result["tool_calls_log"] if entry["tool"] == "get_product_insights"]) == 2
    assert "Lượng đá: Ít đá, Đá riêng" in result["reply"]
    assert "Bánh Trung Thu Thập Cẩm Bát Bửu" in result["reply"]
    pending = cart_manager.get_checkout_prefs("session-combined-review-order")["pending_products"]
    assert [item["product_name"] for item in pending] == [
        "1 Lít Matcha Latte Tây Bắc", "Bánh Trung Thu Thập Cẩm Bát Bửu"
    ]


def test_numbered_voucher_choice_never_falls_through_to_product_parser(monkeypatch):
    session = "session-numbered-voucher"
    cart_manager.set_checkout_context(
        session,
        voucher_offer_pending=True,
        voucher_candidates=[
            {"ma_voucher": "FIRST10", "ten_voucher": "Mã một"},
            {"ma_voucher": "SECOND20", "ten_voucher": "Mã hai"},
        ],
    )
    monkeypatch.setattr(
        "src.function_calling.tools.cart_tools.sync_authoritative_cart",
        lambda _session_id: cart_manager.get_cart(_session_id),
    )
    monkeypatch.setattr(
        "src.function_calling.tools.voucher_tools.execute_apply_voucher",
        lambda _session_id, code: {"status": "ok", "voucher_code": code, "message": f"Đã áp dụng {code}"},
    )
    monkeypatch.setattr(
        agent_service,
        "groq_agent_chat",
        lambda **_kwargs: pytest.fail("voucher ordinal must be resolved before the model/product parser"),
    )

    result = agent_service.run_agent(session, "cho tôi áp dụng mã số 2", history=[])

    assert result["tool_calls_log"][0]["tool"] == "apply_voucher"
    assert result["tool_calls_log"][0]["args"]["voucher_code"] == "SECOND20"


def test_best_voucher_is_selected_once_and_prompts_both_checkout_choices(monkeypatch):
    session = "session-best-voucher"
    cart_manager.add_item(session, "1", "Coffee", 100000)
    cart_manager.set_checkout_context(
        session,
        voucher_offer_pending=True,
        voucher_candidates=[
            {"ma_voucher": "BEST50", "ten_voucher": "Tốt nhất", "so_tien_giam_du_kien": 50000},
            {"ma_voucher": "LESS20", "ten_voucher": "Ít hơn", "so_tien_giam_du_kien": 20000},
        ],
    )
    monkeypatch.setattr(
        "src.function_calling.tools.cart_tools.sync_authoritative_cart",
        lambda _session_id: cart_manager.get_cart(_session_id),
    )
    monkeypatch.setattr(
        "src.function_calling.tools.voucher_tools.execute_apply_voucher",
        lambda _session_id, code: {"status": "ok", "voucher_code": code, "message": f"Đã áp dụng {code}"},
    )

    result = agent_service.run_agent(session, "áp dụng mã tốt nhất cho tôi", history=[])
    apply_logs = [entry for entry in result["tool_calls_log"] if entry.get("tool") == "apply_voucher"]
    assert len(apply_logs) == 1
    assert apply_logs[0]["args"]["voucher_code"] == "BEST50"
    assert "Hình thức nhận hàng" in result["reply"]
    assert "Phương thức thanh toán" not in result["reply"]
    assert "hình thức nhận hàng số mấy" in result["reply"]
    assert not cart_manager.get_checkout_prefs(session).get("pending_products")


def test_inventory_requires_a_row_and_enough_quantity():
    class FakeResult:
        def __init__(self, row):
            self.row = row

        def fetchone(self):
            return self.row

    class FakeConnection:
        def __init__(self, rows):
            self.rows = rows

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, _statement, params):
            return FakeResult(self.rows.get(params["product_id"]))

    class FakeEngine:
        def __init__(self, rows):
            self.rows = rows

        def connect(self):
            return FakeConnection(self.rows)

    result = validate_items_at_branch(
        FakeEngine({1: (1, True)}),
        "BR-1",
        [
            {"product_id": "1", "product_name": "Cà phê", "quantity": 2},
            {"product_id": "2", "product_name": "Bánh", "quantity": 1},
        ],
    )

    # Missing rows inherit normal menu availability; the explicit row still
    # blocks because one unit cannot satisfy quantity two.
    assert result == {"unavailable": ["Cà phê"], "unverified": []}


def test_branch_selection_rejects_unknown_inventory_until_stock_is_confirmed(monkeypatch):
    from src.function_calling.tools import branch_tools

    cart_manager.add_item("session-unknown-branch", "2", "Bánh", 30000)
    monkeypatch.setattr(branch_tools, "_get_engine", lambda: object())
    monkeypatch.setattr(branch_tools, "_clean_dict", lambda value: value)

    class FakeResult:
        def fetchone(self):
            return ("BR-1", "Chi nhánh 1")

    class FakeConnection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, *_args, **_kwargs):
            return FakeResult()

    class FakeEngine:
        def connect(self):
            return FakeConnection()

    monkeypatch.setattr(branch_tools, "_get_engine", lambda: FakeEngine())
    monkeypatch.setattr(
        branch_tools,
        "validate_cart_at_branch",
        lambda *_args, **_kwargs: {"unavailable": [], "unverified": ["Bánh"]},
    )

    result = branch_tools.execute_set_session_branch(
        "session-unknown-branch", "BR-1", "Chi nhánh 1", customer_selected=True
    )
    assert result["status"] == "stock_conflict"
    assert "Bánh" in result["unavailable_products"]


def test_nearby_branches_with_unknown_inventory_are_explained_but_not_selectable(monkeypatch):
    from src.function_calling.tools import branch_tools

    session = "session-nearby-unknown"
    cart_manager.add_item(session, "2", "Bánh", 30000)
    cart_manager.set_checkout_prefs(session, delivery_type="MANG_DI")
    monkeypatch.setattr(branch_tools, "_check_business_hours", lambda: None)
    monkeypatch.setattr(branch_tools, "_get_engine", lambda: object())
    monkeypatch.setattr("utils.geo.geocode_address", lambda _address: (10.0, 106.0))
    monkeypatch.setattr("utils.geo.haversine_distance", lambda *_coords: 1.0)

    class FakeResult:
        def mappings(self):
            return self

        def all(self):
            return [{
                "ma_chi_nhanh": "BR-1", "ten_chi_nhanh": "Chi nhánh 1",
                "dia_chi": "Địa chỉ 1", "vi_do": 10.0, "kinh_do": 106.0,
                "loai": "CHI_NHANH_CHINH", "avg_rating": 4.5, "total_reviews": 5,
            }]

    class FakeConnection:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def execute(self, *_args, **_kwargs):
            return FakeResult()

    class FakeEngine:
        def connect(self):
            return FakeConnection()

    monkeypatch.setattr(branch_tools, "_get_engine", lambda: FakeEngine())
    monkeypatch.setattr(
        branch_tools,
        "validate_cart_at_branch",
        lambda *_args, **_kwargs: {"unavailable": [], "unverified": ["Bánh"]},
    )

    result = branch_tools.execute_find_nearest_branch("địa chỉ test", session_id=session)
    assert result["status"] == "need_branch_selection"
    assert result["branches"][0]["availability_status"] == "unknown"
    assert cart_manager.get_checkout_prefs(session).get("branch_candidates")


def test_pickup_lists_five_nearest_and_marks_d9_matcha_unavailable(monkeypatch):
    from src.function_calling.tools import branch_tools

    session = "pickup-five-with-d9-conflict"
    cart_manager.add_item(session, "120", "Bánh Trung Thu Matcha", 99000)
    cart_manager.set_checkout_prefs(session, delivery_type="MANG_DI")
    monkeypatch.setattr(branch_tools, "_check_business_hours", lambda: None)
    monkeypatch.setattr("utils.geo.geocode_address", lambda _address: (0.0, 0.0))
    monkeypatch.setattr("utils.geo.haversine_distance", lambda _a, _b, lat, _lon: float(lat))

    rows = [
        {
            "ma_chi_nhanh": "HC_HCM_D9_TAN_PHU_704" if index == 1 else f"BR-{index}",
            "ten_chi_nhanh": "Highlands Coffee D9 Tân Phú" if index == 1 else f"Chi nhánh {index}",
            "dia_chi": f"Địa chỉ {index}", "vi_do": float(index), "kinh_do": 0.0,
            "loai": "CHI_NHANH_CHINH", "avg_rating": 4.5, "total_reviews": 1,
        }
        for index in range(1, 7)
    ]

    class FakeResult:
        def mappings(self): return self
        def all(self): return rows

    class FakeConnection:
        def __enter__(self): return self
        def __exit__(self, *_args): return False
        def execute(self, *_args, **_kwargs): return FakeResult()

    class FakeEngine:
        def connect(self): return FakeConnection()

    monkeypatch.setattr(branch_tools, "_get_engine", lambda: FakeEngine())

    def fake_validate(_engine, cart, _schema):
        if cart.get("branch_id") == "HC_HCM_D9_TAN_PHU_704":
            return {"unavailable": ["Bánh Trung Thu Matcha"], "unverified": []}
        return {"unavailable": [], "unverified": []}

    monkeypatch.setattr(branch_tools, "validate_cart_at_branch", fake_validate)
    result = branch_tools.execute_find_nearest_branch("42/3 Nguyễn Hữu Tiến", session_id=session)

    assert result["status"] == "need_branch_selection"
    assert len(result["branches"]) == 5
    assert result["branches"][0]["ten_chi_nhanh"] == "Highlands Coffee D9 Tân Phú"
    assert result["branches"][0]["availability_status"] == "unavailable"
    assert result["branches"][0]["unavailable_products"] == ["Bánh Trung Thu Matcha"]
    assert all(row["availability_status"] == "available" for row in result["branches"][1:])
    assert len(cart_manager.get_checkout_prefs(session)["branch_candidates"]) == 5


def test_pending_multi_product_options_are_remembered_and_added_together(monkeypatch):
    session = "session-complete-pending"
    cart_manager.set_pending_products(session, [
        {"product_name": "Matcha", "category": "drink", "quantity": 1, "options": {"groups": {
            "Kích thước": ["Vừa"], "Topping": ["Hạt Sen", "Sữa Yến Mạch"], "Lượng đá": ["Ít đá", "Đá riêng"],
        }}},
        {"product_name": "Bánh Bát Bửu", "category": "food", "quantity": 1, "options": {"groups": {}}},
    ])
    monkeypatch.setattr(
        "src.function_calling.tools.product_tools.execute_check_price_and_stock",
        lambda product_name_query, **_kwargs: {"status": "ok", "products": [{"product_id": "8" if product_name_query == "Matcha" else "9", "product_name": product_name_query, "final_price": 100000 if product_name_query == "Matcha" else 99000}]},
    )

    def fake_add(**kwargs):
        cart = cart_manager.add_item(
            session, kwargs["product_id"], kwargs["product_name"], kwargs["unit_price"],
            size=kwargs.get("size"), toppings=kwargs.get("toppings"), luong_da=kwargs.get("luong_da"),
        )
        return {"status": "ok", "unit_price": kwargs["unit_price"], "cart": cart}

    monkeypatch.setattr("src.function_calling.tools.cart_tools.execute_add_to_cart", fake_add)

    first_reply = agent_service._complete_pending_products_from_options(session, "topping hạt sen và sữa yến mạch")
    assert first_reply["tool_calls_log"] == []
    assert len(cart_manager.get_checkout_prefs(session)["pending_products"]) == 2

    final_reply = agent_service._complete_pending_products_from_options(session, "ít đá và theo mặc định")
    assert final_reply["reply"].startswith("Mình đã thêm đủ 2 món")
    assert cart_manager.get_checkout_prefs(session).get("pending_products") == []
    assert [item["product_name"] for item in cart_manager.get_cart(session)["items"]] == ["Matcha", "Bánh Bát Bửu"]


def test_pending_checkout_confirmation_does_not_depend_on_frontend_history(monkeypatch):
    session = "session-confirm"
    cart_manager.add_item(session, "1", "Test coffee", 25000)
    cart_manager.set_branch(session, "BR-1", "Branch 1")
    cart_manager.set_checkout_prefs(
        session,
        payment_method="THANH_TOAN_KHI_NHAN_HANG",
        delivery_type="MANG_DI",
    )
    cart_manager.mark_checkout_summary(session)

    monkeypatch.setattr(
        "src.function_calling.tools.cart_tools.execute_confirm_checkout",
        lambda _session_id: {"status": "success", "order_id": "ORDER-1"},
    )
    monkeypatch.setattr(
        agent_service,
        "groq_agent_chat",
        lambda **_kwargs: pytest.fail("confirmation must not fall back to the model"),
    )

    result = agent_service.run_agent(
        session_id=session,
        user_message="xác nhận đặt hàng",
        history=[],
    )
    assert result["tool_calls_log"][0]["tool"] == "confirm_checkout"
    assert "ORDER-1" in result["reply"]


def test_authenticated_session_must_belong_to_token_subject(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "unit-test-secret")
    owner = str(uuid.uuid4())
    token = jwt.encode({"sub": owner}, "unit-test-secret", algorithm="HS256")

    assert authorize_session(owner, f"Bearer {token}") == owner
    with pytest.raises(HTTPException) as error:
        authorize_session(str(uuid.uuid4()), f"Bearer {token}")
    assert error.value.status_code == 403


def test_guest_session_id_must_be_random_uuid_format():
    guest_session = f"anon-{uuid.uuid4()}"
    assert authorize_session(guest_session, None) is None
    with pytest.raises(HTTPException) as error:
        authorize_session("anon-123-weak", None)
    assert error.value.status_code == 400


def test_flat_numbered_recommendation_parsing():
    history = [{
        "role": "assistant",
        "content": (
            "Mình có một số gợi ý món nước ngon cho bạn:\n\n"
            "1. Lít Matcha Latte Tây Bắc\n"
            "2. Lít Matcha Latte Tây Bắc Sữa Yến Mạch\n"
            "3. Bạc Xỉu\n"
            "4. Bạc Xỉu Caramel Muối\n"
            "5. Bạc Xỉu Foam Dừa\n\n"
            "Bạn muốn chọn món nào?"
        ),
    }]
    resolved = _resolve_numbered_product_choices("cho tôi nước số 1 đi với thêm 1 món bánh nữa nhé", history)
    assert resolved == [
        {"category": "drink", "number": 1, "product_name": "Lít Matcha Latte Tây Bắc"},
    ]


def test_drink_choice_with_cake_request_does_not_trigger_stale_branch(monkeypatch):
    session = "session-no-branch-hijack"
    history = [{
        "role": "assistant",
        "content": (
            "Mình có một số gợi ý món nước ngon cho bạn:\n\n"
            "1. Lít Matcha Latte Tây Bắc\n"
            "2. Bạc Xỉu\n\n"
            "Bạn muốn chọn món nào?"
        ),
    }]
    # Stale branch candidates lingering from a previous turn
    cart_manager.set_checkout_context(session, branch_candidates=[
        {"branch_id": "CN1", "branch_name": "Highlands Coffee D9 Tân Phú"}
    ])
    cart_manager.set_active_list_context(session, "PRODUCT", items=[
        {"entity_id": "D1", "product_id": "D1", "label": "Lít Matcha Latte Tây Bắc",
         "product_name": "Lít Matcha Latte Tây Bắc", "category": "drink"},
        {"entity_id": "D2", "product_id": "D2", "label": "Bạc Xỉu",
         "product_name": "Bạc Xỉu", "category": "drink"},
    ])

    monkeypatch.setattr(
        "src.function_calling.tools.product_tools.execute_get_product_options",
        lambda _name: {
            "status": "ok",
            "product_name": "Lít Matcha Latte Tây Bắc",
            "message": "Các tùy chọn là: Kích thước: [Vừa, Lớn]",
        },
    )
    monkeypatch.setattr(
        "src.function_calling.tools.product_tools.execute_get_recommendations",
        lambda **_kwargs: {
            "status": "ok",
            "recommendations": "Bánh Trung Thu Cà Phê Lava, Bánh Chuối Phủ Hạt",
        },
    )

    res = agent_service.run_agent(
        session_id=session,
        user_message="cho tôi nước số 1 đi với thêm 1 món bánh nữa nhé",
        history=history,
    )

    assert "Highlands Coffee D9 Tân Phú" not in res["reply"]
    assert "Đã ghi nhận chi nhánh" not in res["reply"]
    assert "Lít Matcha Latte Tây Bắc" in res["reply"]
    # The cake request is not a canonical product selection; it must not be
    # guessed or staged from assistant history while the selected drink waits
    # for its required size.
    assert "Bánh Trung Thu Cà Phê Lava" not in res["reply"]
