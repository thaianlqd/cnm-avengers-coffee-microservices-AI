"""False-positive/negative checks for the authenticated E2E harness."""
import pytest

from simulate_e2e_real_user import (
    extract_confirm_order_id,
    require_price_result,
    require_review_result,
)


ORDER_ID = "b92f650f-f938-41ad-8c7f-1b111625ae3f"


@pytest.mark.parametrize("result", [
    {"status": "success", "order_id": ORDER_ID},
    {"status": "success", "orderId": ORDER_ID},
    {"status": "success", "ma_don_hang": ORDER_ID},
    {"status": "success", "data": {"order": {"orderId": ORDER_ID}}},
])
def test_order_id_prefers_known_confirm_contract_fields(result):
    confirmed = {
        "reply": "Đặt hàng thành công.",
        "tool_calls_log": [{"tool": "confirm_checkout", "result": result}],
    }
    assert extract_confirm_order_id(confirmed) == ORDER_ID


def test_success_reply_order_id_fallback_is_phrase_scoped():
    confirmed = {
        "reply": f"Đặt hàng thành công! Mã đơn hàng của bạn là: {ORDER_ID}",
        "tool_calls_log": [{"tool": "confirm_checkout", "result": {"status": "success"}}],
    }
    assert extract_confirm_order_id(confirmed) == ORDER_ID


@pytest.mark.parametrize("confirmed", [
    {"reply": f"Mã phiên: {ORDER_ID}", "tool_calls_log": [
        {"tool": "confirm_checkout", "result": {"status": "success"}},
    ]},
    {"reply": f"Mã đơn hàng: {ORDER_ID}", "tool_calls_log": [
        {"tool": "confirm_checkout", "result": {"status": "error"}},
    ]},
    {"reply": f"Mã đơn hàng: {ORDER_ID}", "tool_calls_log": []},
])
def test_order_id_never_comes_from_arbitrary_or_unsuccessful_uuid(confirmed):
    assert extract_confirm_order_id(confirmed) == ""


def test_review_assertion_requires_review_semantics_not_only_zero_mutation():
    with pytest.raises(AssertionError):
        require_review_result({"reply": "Bạn chọn size trước nhé.", "tool_calls_log": []})
    require_review_result({
        "reply": "Món này hiện chưa có đánh giá trên hệ thống.",
        "tool_calls_log": [{"tool": "get_product_insights", "result": {"status": "ok"}}],
    })


def test_price_assertion_requires_authoritative_price_not_only_zero_mutation():
    with pytest.raises(AssertionError):
        require_price_result({"reply": "Bạn chọn tùy chọn trước nhé.", "tool_calls_log": []})
    require_price_result({
        "reply": "Đồ Uống Mẫu có giá hiện tại 42.000đ.",
        "tool_calls_log": [],
    })


@pytest.mark.parametrize("tool", ["add_to_cart", "update_cart_item", "confirm_checkout"])
def test_review_and_price_assertions_reject_mutation_evidence(tool):
    result = {
        "reply": "Món hiện chưa có đánh giá. Giá hiện tại 42.000đ.",
        "tool_calls_log": [{"tool": tool, "result": {"status": "ok"}}],
    }
    with pytest.raises(AssertionError):
        require_review_result(result)
    with pytest.raises(AssertionError):
        require_price_result(result)
