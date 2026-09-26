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
    def authoritative_cart():
        return items_from(payload(http.get(f"{API_URL}/cart/{user_id}", timeout=15)))

    def start_conversation(label):
        conversation_id = str(uuid.uuid4())
        print(f"\n\n=== {label} | conversation={conversation_id} ===")
        payload(http.delete(f"{API_URL}/cart/clear/{user_id}", timeout=15))
        require(not authoritative_cart(), f"Không thể làm rỗng giỏ trước {label}.")
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
                "history": history[-30:],
            }, timeout=75))
            reply = str(result.get("reply") or "")
            print(f"[AI AVENGERS]: {reply}")
            history.extend([{"role": "user", "content": message}, {"role": "assistant", "content": reply}])
            return result

        return chat

    def issue_test_voucher():
        internal_token = os.getenv("INTERNAL_SERVICE_TOKEN", "avengers-internal-token")
        issued = payload(http.post(
            f"{API_URL}/promotions/internal/phat-hanh",
            json={"user_id": user_id},
            headers={"x-internal-token": internal_token},
            timeout=20,
        ))
        item = issued.get("item") or issued
        code = str(item.get("ma_khuyen_mai") or "").upper()
        require(code, f"Không phát hành được voucher test còn hạn: {issued}")
        print(f"[FIXTURE] Voucher cá nhân còn hạn: {code}")
        return code

    def prepare_cart(chat, exploratory=False):
        if exploratory:
            hot = chat("hôm nay trời nóng quá, tôi đang khát")
            require(any(word in hot.get("reply", "").lower() for word in ("nước", "đồ uống", "mát", "giải khát")), "Câu trời nóng không được hiểu là nhu cầu đồ uống.")

        menu = chat("tôi muốn mua cả nước và bánh, gợi ý rõ từng nhóm cho tôi")
        menu_reply = menu.get("reply", "").lower()
        require("bánh" in menu_reply and ("nước" in menu_reply or "đồ uống" in menu_reply), "Không hiển thị đủ nhóm nước và bánh.")
        cards = (menu.get("ui_payload") or {}).get("products") or []
        require(any("Bánh" in str(row.get("product_name") or "") for row in cards), "UI payload thiếu card bánh.")
        require(any("Matcha" in str(row.get("product_name") or "") or "Xỉu" in str(row.get("product_name") or "") for row in cards), "UI payload thiếu card nước.")

        # Ask two detailed review turns before the final purchase decision.
        review_drink = chat("trước khi mua, đánh giá chi tiết 1 Lít Matcha Latte Tây Bắc giúp tôi")
        require("Matcha Latte Tây Bắc" in review_drink.get("reply", ""), "Đánh giá món nước bị mất tham chiếu.")
        review_cake = chat("còn Bánh Trung Thu Cà Phê Lava được khách đánh giá thế nào, nói chi tiết nhé")
        require("Bánh Trung Thu Cà Phê Lava" in review_cake.get("reply", ""), "Đánh giá món bánh bị mất tham chiếu.")

        selected = chat("oke vậy lấy cho tôi nước số 1 và bánh số 1 trong danh sách ban đầu nhé")
        require("Kích thước" in selected.get("reply", "") and "Topping" in selected.get("reply", ""), "Không hỏi tùy chọn cho món nước.")
        added = chat("nước size vừa, ít đá, ít ngọt, topping trân châu trắng; bánh dùng mặc định nhé")
        require(sum(row.get("tool") == "add_to_cart" for row in added.get("tool_calls_log") or []) == 2, "Hai món đầu không được ghi đúng hai lần.")
        first_cart = authoritative_cart()
        require(len(first_cart) == 2 and all(int(row.get("so_luong") or 0) == 1 for row in first_cart), f"Giỏ đầu phải đúng hai dòng x1: {first_cart}")

        matcha = chat("ngoài món đang có, bên bạn còn những món nào về matcha? hiển thị đúng các món đó nhé")
        require("matcha" in matcha.get("reply", "").lower(), "Tìm kiếm Matcha không trả món Matcha.")
        add_two = chat("thêm Bánh Trung Thu Matcha vào giỏ, số lượng 2 cái nhé")
        require(any(row.get("tool") == "add_to_cart" and row.get("result", {}).get("status") == "ok" for row in add_two.get("tool_calls_log") or []), "Không ghi Bánh Trung Thu Matcha vào giỏ.")
        with_matcha = authoritative_cart()
        matcha_cake = next((row for row in with_matcha if row.get("ten_san_pham") == "Bánh Trung Thu Matcha"), None)
        require(matcha_cake and int(matcha_cake.get("so_luong") or 0) == 2, f"Bánh Trung Thu Matcha không đúng x2: {with_matcha}")

        removed = chat("xóa riêng Bánh Trung Thu Cà Phê Lava khỏi giỏ, giữ các món còn lại")
        require(any(row.get("tool") == "remove_cart_item" and row.get("result", {}).get("status") == "ok" for row in removed.get("tool_calls_log") or []), "Không xóa đúng dòng bánh Lava.")
        ask_edit = chat("đổi tùy chọn của 1 Lít Matcha Latte Tây Bắc trong giỏ giúp tôi")
        edit_prompt = ask_edit.get("reply", "").lower()
        require("1 lít matcha latte tây bắc" in edit_prompt and ("muốn đổi gì" in edit_prompt or "muốn thay đổi" in edit_prompt), "Không khóa đúng dòng nước để sửa.")
        changed = chat("đổi topping thành Hạt Sen và Foam Dừa, thêm ngọt, vẫn ít đá nhé")
        require(any(row.get("tool") == "update_cart_item" and row.get("result", {}).get("status") == "ok" for row in changed.get("tool_calls_log") or []), "Không PATCH tùy chọn món nước.")

        final_cart = authoritative_cart()
        require(len(final_cart) == 2, f"Sau xóa/sửa phải còn đúng hai dòng: {final_cart}")
        require(not any(row.get("ten_san_pham") == "Bánh Trung Thu Cà Phê Lava" for row in final_cart), "Bánh Lava vẫn còn sau khi xóa.")
        drink = next(row for row in final_cart if row.get("ten_san_pham") == "1 Lít Matcha Latte Tây Bắc")
        require(set(drink.get("toppings") or []) == {"Hạt Sen", "Foam Dừa"}, f"Topping sửa không khớp server: {drink}")
        require(str(drink.get("do_ngot") or "") == "Thêm ngọt" and str(drink.get("luong_da") or "") == "Ít đá", f"Đá/ngọt sửa không khớp: {drink}")
        return final_cart

    def apply_voucher(chat, expected_code, cart_before):
        before = json.dumps(cart_before, sort_keys=True, default=str)
        offered = chat("tôi đã xong giỏ, không thêm gì nữa")
        require(expected_code in offered.get("reply", ""), f"Voucher còn hạn {expected_code} không được gợi ý trước checkout.")
        require("Hình thức nhận hàng" not in offered.get("reply", ""), "Đã nhảy sang nhận hàng trước khi quyết định voucher.")
        # The fixture creates this real eligible code.  Naming it keeps a
        # previous failed-run fixture from changing which equally-good code is
        # selected, while the preceding offered list still validates ranking.
        applied = chat(f"áp dụng mã {expected_code} cho tôi")
        logs = [row for row in applied.get("tool_calls_log") or [] if row.get("tool") == "apply_voucher"]
        require(len(logs) == 1 and logs[0].get("result", {}).get("status") in {"ok", "already_applied"}, f"Không áp voucher đúng một lần: {logs}")
        code = str(logs[0].get("result", {}).get("voucher_code") or "").upper()
        require(code == expected_code, f"Áp nhầm voucher: expected={expected_code}, actual={code}")
        require(json.dumps(authoritative_cart(), sort_keys=True, default=str) == before, "Áp voucher đã làm thay đổi dòng/số lượng giỏ.")
        summary = chat("xác nhận lại toàn bộ giỏ, mã giảm giá và tổng tiền cho tôi")
        require(expected_code in summary.get("reply", "") and "Tổng gốc" in summary.get("reply", "") and "Tổng thanh toán" in summary.get("reply", ""), "Quote sau voucher không canonical.")
        return summary

    def checkout_and_confirm(chat, mode):
        mode_text = {
            "GIAO_TAN_NOI": "giao tận nơi và thanh toán COD",
            "MANG_DI": "lấy tại quán và thanh toán COD",
            "TAI_CHO": "dùng tại chỗ và thanh toán tiền mặt",
        }[mode]
        step = chat(f"tôi chọn {mode_text}")
        require("địa chỉ" in step.get("reply", "").lower(), f"{mode} không đọc/hỏi địa chỉ hồ sơ.")
        location = chat("đúng rồi, tôi đang ở địa chỉ đã lưu đó")
        require(any(row.get("tool") == "find_nearest_branch" for row in location.get("tool_calls_log") or []), f"{mode} không tìm cửa hàng theo địa chỉ.")

        checkout = location
        if mode in {"MANG_DI", "TAI_CHO"}:
            branches = (location.get("ui_payload") or {}).get("branches") or []
            require(len(branches) == 5, f"{mode} phải trả đúng 5 cửa hàng gần nhất: {branches}")
            d9_index = next((index for index, row in enumerate(branches, 1) if "D9 Tân Phú" in str(row.get("ten_chi_nhanh") or row.get("branch_name") or "")), None)
            if d9_index:
                d9 = branches[d9_index - 1]
                require(d9.get("availability_status") == "unavailable" and "Bánh Trung Thu Matcha" in (d9.get("unavailable_products") or []), f"D9 không báo đúng món thiếu: {d9}")
                blocked = chat(f"tôi vẫn thử chọn chi nhánh số {d9_index}")
                require(not blocked.get("checkout_payload") and "Bánh Trung Thu Matcha" in blocked.get("reply", ""), "Chi nhánh thiếu Matcha vẫn được chọn.")
            available_index = next((index for index, row in enumerate(branches, 1) if row.get("availability_status") == "available"), None)
            require(available_index, f"{mode} không có cửa hàng đủ giỏ trong 5 nơi gần nhất.")
            checkout = chat(f"tôi chọn chi nhánh số {available_index}")
        else:
            chosen_logs = [row for row in location.get("tool_calls_log") or [] if row.get("tool") == "set_session_branch"]
            require(chosen_logs and "D9 Tân Phú" not in str(chosen_logs[-1].get("result", {}).get("branch_name") or ""), "Giao tận nơi đã chọn D9 đang thiếu Matcha.")

        checkout_payload = checkout.get("checkout_payload") or {}
        require(checkout_payload.get("action_id"), f"{mode} thiếu checkout action_id: {checkout}")
        require(checkout_payload.get("voucher_code"), f"{mode} summary làm mất voucher.")
        confirmed = chat("đồng ý chốt đơn")
        confirm_logs = [row for row in confirmed.get("tool_calls_log") or [] if row.get("tool") == "confirm_checkout"]
        require(confirm_logs, f"{mode} không gọi confirm_checkout.")
        result = confirm_logs[0].get("result") or {}
        require(result.get("status") in {"success", "already_processed"}, f"{mode} tạo đơn thất bại: {result}")
        order_id = str(result.get("order_id") or "")
        require(order_id and re.search(re.escape(order_id), confirmed.get("reply", "")), f"{mode} không trả mã đơn.")
        require(not authoritative_cart(), f"{mode} chưa xóa giỏ sau khi tạo đơn.")
        orders = payload(http.get(f"{API_URL}/customers/{user_id}/orders?q={order_id}", timeout=20))
        require(order_id in json.dumps(orders, ensure_ascii=False, default=str), f"{mode} mã đơn chưa có trong lịch sử.")
        print(f"\n✅ {mode} PASS — Mã đơn: {order_id}")
        return order_id

    created_orders = []
    # Run all three fulfillment flows by default.  A focused recovery can set
    # E2E_MODES, for example `E2E_MODES=TAI_CHO`, without editing this test.
    valid_modes = {"GIAO_TAN_NOI", "MANG_DI", "TAI_CHO"}
    raw_modes = os.getenv("E2E_MODES", "GIAO_TAN_NOI,MANG_DI,TAI_CHO")
    modes = [mode.strip().upper() for mode in raw_modes.split(",") if mode.strip()]
    require(modes and all(mode in valid_modes for mode in modes), f"E2E_MODES không hợp lệ: {raw_modes}")
    for index, mode in enumerate(modes, 1):
        chat = start_conversation(f"KỊCH BẢN {index}/{len(modes)} — {mode}")
        cart = prepare_cart(chat, exploratory=index == 1)
        voucher_code = issue_test_voucher()
        apply_voucher(chat, voucher_code, cart)
        created_orders.append(checkout_and_confirm(chat, mode))

    all_orders = payload(http.get(f"{API_URL}/customers/{user_id}/orders", timeout=20))
    serialized = json.dumps(all_orders, ensure_ascii=False, default=str)
    require(all(order_id in serialized for order_id in created_orders), f"Lịch sử không chứa đủ các đơn: {created_orders}")
    require(len(set(created_orders)) == len(modes), f"Các luồng khôi phục không tạo mã đơn riêng: {created_orders}")
    print("\n🎉 E2E recovery PASS — " + ", ".join(created_orders))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"\n❌ E2E FAIL: {exc}", file=sys.stderr)
        raise
