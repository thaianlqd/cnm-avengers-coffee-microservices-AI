import sys
import os
import queue
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.common.turn_log import _mask_pii, log_turn_async, _log_queue

def test_mask_pii_phone():
    assert _mask_pii("gọi tôi qua số 0912345678 nhé") == "gọi tôi qua số *** nhé"
    assert _mask_pii("sđt 84912345678 nhe") == "sđt *** nhe"
    assert _mask_pii("0912.345.678") == "***"
    assert _mask_pii("091 234 56 78") == "***"
    assert _mask_pii("84 912 345 678") == "***"

def test_mask_pii_address():
    assert _mask_pii("giao đến 12/3A đường Trường Chinh") == "giao đến ***"
    assert _mask_pii("nhà tôi ở 123 phố Tôn Đức Thắng") == "nhà tôi ở ***"
    assert _mask_pii("tôi ở 45 ngõ 15 lê lợi") == "tôi ở ***"
    assert _mask_pii("mang tới số 12 đường Trần Phú, quận Hà Đông nhé") == "mang tới số ***, quận Hà Đông nhé"
    
def test_mask_pii_safe_digits():
    assert _mask_pii("chỉnh bánh số 2 thành 1 cái") == "chỉnh bánh số 2 thành 1 cái"
    assert _mask_pii("cho tôi 3 cái bánh") == "cho tôi 3 cái bánh"

def test_mask_pii_delivery_address():
    text = "Cảm ơn bạn. Địa chỉ giao: 123 Nguyen Trai\nSẽ giao nhanh"
    expected = "Cảm ơn bạn. Địa chỉ giao: ***\nSẽ giao nhanh"
    assert _mask_pii(text) == expected

def test_known_pii():
    assert _mask_pii("giao toi 45 Le Loi nhe", known_pii=["45 Le Loi"]) == "giao toi *** nhe"
    assert _mask_pii("ban toi toa nha Landmark 81", known_pii=["Landmark 81"]) == "ban toi toa nha ***"

def test_bot_asked_address():
    # If bot just asked for address, the whole message is redacted
    assert _mask_pii("toi o so 5 Le Duan", last_bot_msg="Bạn cho mình xin địa chỉ nhé") == "***"
    assert _mask_pii("chung cu The Manor", last_bot_msg="Bạn đang ở đâu ạ?") == "***"
    assert _mask_pii("toa nha Bitexco", last_bot_msg="Mình giao đến đâu?") == "***"

def test_log_queue_full(monkeypatch):
    # Test that queue full doesn't crash
    monkeypatch.setenv("TURN_LOG_ENABLED", "true")
    
    # Ngăn không cho thread background khởi động, tránh gọi DB thật
    import src.common.turn_log as tl
    monkeypatch.setattr(tl, "start_worker_if_needed", lambda: None)

    
    # Fill the queue
    for _ in range(_log_queue.maxsize):
        try:
            _log_queue.put_nowait({"dummy": 1})
        except queue.Full:
            pass
            
    # This should not raise an exception
    log_turn_async(
        session_id="test:conversation:123",
        user_message="test",
        history=[{"role": "assistant", "content": "Ban dia chi"}],
        state_before={"item_count": 1},
        gate_name="llm",
        result={"reply": "ok", "tool_calls_log": [{"tool": "add_to_cart", "args": {}}]},
        model_name=None,
        latency_ms=100,
        known_pii=["dia chi"]
    )

if __name__ == "__main__":
    test_mask_pii_phone()
    test_mask_pii_address()
    test_mask_pii_safe_digits()
    test_mask_pii_delivery_address()
    test_known_pii()
    test_bot_asked_address()
    test_log_queue_full()
    print("All tests passed!")
