import sys
import os
import uuid
import time
import json
sys.path.insert(0, os.path.abspath("."))
from src.agents import agent_service
from src.common import cart_manager

def simulate_chat():
    session_id = f"test-e2e-{uuid.uuid4().hex[:8]}"
    print(f"--- Bắt đầu phiên chat: {session_id} ---")
    
    history = []
    
    def send_message(msg):
        print(f"\n[KHÁCH HÀNG]: {msg}")
        result = agent_service.run_agent(session_id, msg, history=history)
        reply = result.get("reply", "")
        print(f"[AI AVENGERS]: {reply}")
        
        # Add to history
        history.append({"role": "user", "content": msg})
        history.append({"role": "assistant", "content": reply})
        return reply

    # 1. Hỏi chat là tôi muốn mua bánh và nước, hỏi đánh giá chi tiết
    send_message("tôi muốn mua bánh và nước, hãy hiển thị ra các món. Sau đó cho tôi đánh giá chi tiết về 1 món bánh nổi bật nhé")
    
    # 2. Khách chọn món bánh và nước (số 1 và số 1)
    send_message("cho tôi bánh số 1 và nước số 1 nhé")
    
    # 3. Chọn tuỳ chọn (ví dụ món nước cần topping)
    send_message("tôi chọn ít đá, ít ngọt, topping trân châu trắng cho món nước nhé")
    
    # 4. Hỏi có muốn thêm gì không -> không thêm, gợi ý mã KM
    send_message("tôi không thêm gì nữa, cho vào giỏ hàng đi")
    
    # 5. Áp mã KM
    print("\n--- [HỆ THỐNG]: Giả lập apply voucher UP_DM_PCPD ---")
    session = cart_manager._get_or_create_session(session_id)
    prefs = session.get("checkout_prefs") or {}
    prefs["voucher_code"] = "UP_DM_PCPD"
    session["checkout_prefs"] = prefs
    cart_manager._sync_to_db(session_id, session)
    
    # 6. Gửi xác nhận giỏ hàng
    send_message("tôi đã áp mã giảm giá, xác nhận lại giỏ hàng và giá cho tôi")
    
    # 7. Tiến hành đặt hàng - hỏi hình thức thanh toán, nhận hàng
    send_message("tiến hành đặt hàng đi. Thanh toán tiền mặt, lấy tại quán")
    
    # 8. Chọn chi nhánh
    send_message("tôi chọn chi nhánh đầu tiên bạn vừa gợi ý")
    
    # 9. Chốt đơn
    send_message("xác nhận đặt hàng")

if __name__ == "__main__":
    simulate_chat()
