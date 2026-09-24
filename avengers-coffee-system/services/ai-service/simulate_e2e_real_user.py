"""Authenticated HTTP E2E test. Requires E2E_EMAIL and E2E_PASSWORD."""
import json
import os
import re
import sys
import uuid

import requests

API_URL = os.getenv("E2E_API_URL", "http://127.0.0.1:3000").rstrip("/")
EMAIL = os.getenv("E2E_EMAIL", "").strip()
PASSWORD = os.getenv("E2E_PASSWORD", "")


def payload(response):
    response.raise_for_status()
    body = response.json()
    return body.get("data", body) if isinstance(body, dict) else body


def items_from(value):
    if isinstance(value, list):
        return value
    return value.get("items") or value.get("data") or [] if isinstance(value, dict) else []


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    require(EMAIL and PASSWORD, "Thiếu E2E_EMAIL hoặc E2E_PASSWORD.")
    http = requests.Session()
    login = payload(http.post(f"{API_URL}/auth/login", json={
        "email": EMAIL, "password": PASSWORD, "tai_khoan": EMAIL,
        "mat_khau": PASSWORD, "tenDangNhap": EMAIL,
    }, timeout=15))
    token = login.get("accessToken") or login.get("access_token") or login.get("token")
    user = login.get("user") or login.get("nguoi_dung") or {}
    user_id = str(user.get("ma_nguoi_dung") or user.get("id") or login.get("user_id") or "")
    require(token and user_id, "Response đăng nhập thiếu token hoặc UUID khách hàng.")
    http.headers.update({"Authorization": f"Bearer {token}"})
    conversation_id = str(uuid.uuid4())
    print(f"--- E2E user={user_id} conversation={conversation_id} ---")

    payload(http.delete(f"{API_URL}/cart/clear/{user_id}", timeout=15))
    require(not items_from(payload(http.get(f"{API_URL}/cart/{user_id}", timeout=15))), "Không thể làm rỗng giỏ trước test.")
    payload(http.post(f"{API_URL}/ai/agent/conversation/reset", json={
        "session_id": user_id, "conversation_id": conversation_id,
    }, timeout=15))
    history = []

    def chat(message):
        print(f"\n[KHÁCH HÀNG]: {message}")
        result = payload(http.post(f"{API_URL}/ai/agent/chat", json={
            "session_id": user_id,
            "conversation_id": conversation_id,
            "client_message_id": str(uuid.uuid4()),
            "message": message,
            "history": history[-20:],
        }, timeout=60))
        reply = str(result.get("reply") or "")
        print(f"[AI AVENGERS]: {reply}")
        history.extend([{"role": "user", "content": message}, {"role": "assistant", "content": reply}])
        return result

    chat("tôi muốn mua bánh và nước, hãy hiển thị ra các món")
    chat("cho tôi đánh giá chi tiết về Bánh Trung Thu Cà Phê Lava nhé")
    chat("cho tôi bánh số 1 và nước số 1 nhé")
    added = chat("tôi chọn ít đá, ít ngọt, topping trân châu trắng cho món nước nhé")
    require(any(row.get("tool") == "add_to_cart" for row in added.get("tool_calls_log") or []), "Không có thao tác thêm giỏ.")
    cart_after_add = items_from(payload(http.get(f"{API_URL}/cart/{user_id}", timeout=15)))
    require(len(cart_after_add) == 2, f"Giỏ phải có đúng 2 dòng: {cart_after_add}")
    require(all(int(row.get("so_luong") or row.get("quantity") or 0) == 1 for row in cart_after_add), "Mỗi món phải có số lượng 1.")
    persisted_prices = sorted(float(row.get("gia_ban") or row.get("unit_price") or 0) for row in cart_after_add)
    require(
        persisted_prices == [99000.0, 105000.0],
        f"Giá sau tùy chọn phải là bánh 99.000đ và Matcha+topping 105.000đ: {persisted_prices}",
    )
    matcha_line = next(row for row in cart_after_add if "Matcha Latte Tây Bắc" in str(row.get("ten_san_pham") or ""))
    require(
        str(matcha_line.get("size") or matcha_line.get("kich_co") or "") == "Vừa",
        f"Matcha một-size phải được lưu là Vừa: {matcha_line}",
    )

    before_no_more = json.dumps(cart_after_add, sort_keys=True, default=str)
    chat("tôi không thêm gì nữa, cho vào giỏ hàng đi")
    after_no_more = items_from(payload(http.get(f"{API_URL}/cart/{user_id}", timeout=15)))
    require(json.dumps(after_no_more, sort_keys=True, default=str) == before_no_more, "Câu 'không thêm gì nữa' đã thay đổi giỏ.")

    voucher = chat("tôi có mã giảm giá nào không? áp dụng mã tốt nhất cho tôi")
    applied = [row for row in voucher.get("tool_calls_log") or [] if row.get("tool") == "apply_voucher"]
    require(len(applied) == 1, "Mã tốt nhất phải được áp dụng đúng một lần.")
    duplicate = chat("áp dụng mã 1 cho tôi")
    repeated = [row for row in duplicate.get("tool_calls_log") or [] if row.get("tool") == "apply_voucher"]
    require(not repeated or repeated[0].get("result", {}).get("status") == "already_applied", "Voucher bị áp dụng lại.")

    summary = chat("xác nhận lại giỏ hàng và giá cho tôi")
    require("Tổng gốc" in summary.get("reply", "") and "Tổng thanh toán" in summary.get("reply", ""), "Tóm tắt thiếu tổng canonical.")
    chat("tiến hành đặt hàng đi")
    location = chat("tôi muốn lấy tại quán và thanh toán tiền mặt")
    require("địa chỉ" in location.get("reply", "").lower(), "Chatbot không đọc/hỏi địa chỉ hồ sơ.")
    require(
        location.get("reply", "").lower().count("phường tây thạnh") <= 1,
        "Địa chỉ hồ sơ bị lặp phường/thành phố.",
    )
    branches = chat("đúng, dùng địa chỉ đã lưu")
    require(any(row.get("tool") == "find_nearest_branch" for row in branches.get("tool_calls_log") or []), "Không tìm chi nhánh từ địa chỉ đã lưu.")
    checkout = chat("tôi chọn chi nhánh đầu tiên")
    checkout_payload = checkout.get("checkout_payload") or {}
    require(checkout_payload.get("action_id"), "Checkout payload thiếu action_id.")
    require(len(checkout_payload.get("items") or []) == 2, "Checkout payload sai danh sách món.")

    confirmed = chat("đồng ý chốt đơn")
    logs = [row for row in confirmed.get("tool_calls_log") or [] if row.get("tool") == "confirm_checkout"]
    require(logs, "Câu xác nhận không gọi confirm_checkout.")
    result = logs[0].get("result") or {}
    require(result.get("status") in {"success", "already_processed"}, f"Tạo đơn thất bại: {result}")
    order_id = str(result.get("order_id") or "")
    require(order_id, "Tạo đơn thành công nhưng thiếu mã đơn.")
    require(not items_from(payload(http.get(f"{API_URL}/cart/{user_id}", timeout=15))), "Giỏ chưa rỗng sau checkout.")
    orders = payload(http.get(f"{API_URL}/customers/{user_id}/orders?q={order_id}", timeout=20))
    require(order_id in json.dumps(orders, ensure_ascii=False, default=str), "Mã đơn chưa xuất hiện trong lịch sử.")
    require(re.search(re.escape(order_id), confirmed.get("reply", "")), "Chatbot không trả mã đơn.")
    print(f"\n✅ E2E PASS — Mã đơn: {order_id}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"\n❌ E2E FAIL: {exc}", file=sys.stderr)
        raise
