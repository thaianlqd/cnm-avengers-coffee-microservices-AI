import time
import pytest
from src.agents.tier1 import (
    normalize_confirmation_text,
    classify_confirmation,
    is_pending_expired
)

@pytest.mark.parametrize("text, pending_type, expected", [
    # 1. Câu ví dụ trong bối cảnh (foreign -> NONE)
    ("oke xác nhận", "confirm_checkout", "YES"),
    ("chỉnh số lượng 1 cái", "confirm_checkout", "NONE"),
    ("chỉnh số lượng 1 cái", "ask_more_items", "NONE"),
    ("chốt luôn nha", "confirm_checkout", "YES"), # chốt + luôn + nha (YES+FILLER)
    ("chốt luôn nha", "ask_more_items", "YES"),
    ("cho tôi bớt nước đá", "confirm_checkout", "NONE"),
    ("cho tôi bớt nước đá", "fill_options", "NONE"),
    # 2. "huy" đơn độc
    ("hủy", "confirm_cancel", "AMBIGUOUS"),
    ("hủy nha", "confirm_cancel", "AMBIGUOUS"),
    ("huỷ luôn đi", "ask_more_items", "AMBIGUOUS"),
    ("huy", "confirm_checkout", "NO"),
    ("huy luon di", "confirm_checkout", "NO"),
    ("huy banh", "confirm_checkout", "NONE"), # "banh" is foreign
    ("huy banh", "confirm_cancel", "NONE"),
    
    # 3. "dung" đơn độc
    ("đúng", "confirm_checkout", "YES"),
    ("đúng rồi", "confirm_checkout", "YES"),
    ("đúng vậy", "confirm_checkout", "NONE"), # "vay" is foreign
    ("dung nha", "ask_more_items", "YES"),
    
    # 4. YES + filler ghép
    ("oke nha", "confirm_checkout", "YES"),
    ("đồng ý luôn", "ask_more_items", "YES"),
    ("ok di", "confirm_checkout", "YES"),
    ("yes nha", "ask_more_items", "YES"),
    
    # 5. NO + filler ghép
    ("không nha", "confirm_checkout", "NO"),
    ("thôi nha", "ask_more_items", "NO"),
    ("ko di", "confirm_checkout", "NO"),
    
    # 6. Có cả YES và NO cùng lúc
    ("oke nha không", "confirm_checkout", "NONE"),
    ("không chốt nha", "confirm_checkout", "NONE"),
    ("thôi đồng ý", "ask_more_items", "NONE"),
    
    # 7. Câu YES nhưng pending_type là select_branch/select_voucher/fill_options
    ("oke", "select_branch", "NONE"),
    ("chốt luôn", "select_voucher", "NONE"),
    ("chốt luôn nha", "fill_options", "NONE"),
    ("chốt luôn nha", "select_branch", "NONE"),
    ("chốt luôn nha", "select_voucher", "NONE"),
    ("xác nhận", "fill_options", "NONE"),
    ("không nha", "select_branch", "NO"), # NO is valid for select_branch if user wants to decline
    ("không", "select_voucher", "NO"),
    
    # 8. pending=None + "oke" -> NONE
    ("oke", None, "NONE"),
    ("xác nhận nha", None, "NONE"),
    ("không", None, "NONE"),
    ("không nha", None, "NONE"),
    ("hủy", None, "NONE"),
    ("hủy nha", None, "NONE"),
    ("đúng", None, "NONE"),
    ("đúng rồi", None, "NONE"),
    
    # 9. Từ ngoài tập hoàn toàn
    ("mình muốn mua", "confirm_checkout", "NONE"),
    ("hello", "ask_more_items", "NONE"),
    ("ok toi biet roi", "confirm_checkout", "NONE"), # "toi", "biet" are foreign
    
    # 10. Gộp chữ lặp và cụm từ đặc biệt
    ("okeeee nha", "confirm_checkout", "YES"), # okee -> oke -> YES
    ("đồồng ýý", "confirm_checkout", "YES"), # đồồng ýý -> doong yy -> dong y -> dongy -> YES
    ("chốt đơn", "confirm_checkout", "YES"), # chot don -> chotdon -> YES (since pending="confirm_checkout")
    ("đặt hàng luôn", "confirm_checkout", "YES"), # dat hang -> dathang -> YES
    ("hết rồi", "ask_more_items", "NO"), # het roi -> hetroi -> NO
    ("xong rồi nha", "ask_more_items", "NO"), # xong roi -> xongroi -> NO
    
    # 11. Các từ bị giới hạn theo context
    ("chốt đơn", "ask_more_items", "NONE"), # "chotdon" is foreign for ask_more_items
    ("hết rồi", "confirm_checkout", "NONE"), # "hetroi" is foreign for confirm_checkout
    
    # 12. Dấu câu, emoji, cách trống
    ("  oke!!!  ", "confirm_checkout", "YES"),
    ("không, cảm ơn", "ask_more_items", "NONE"), # "cam", "on" are foreign
])
def test_classify_confirmation(text, pending_type, expected):
    assert classify_confirmation(text, pending_type) == expected

def test_is_pending_expired():
    t_now = 1000.0
    # expires_at in future
    assert is_pending_expired(t_now + 300, now=t_now) == False
    # expires_at in past
    assert is_pending_expired(t_now - 10, now=t_now) == True
    # expires_at exactly now
    assert is_pending_expired(t_now, now=t_now) == True
