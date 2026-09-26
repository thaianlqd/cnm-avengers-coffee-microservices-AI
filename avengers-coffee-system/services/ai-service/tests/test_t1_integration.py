import os
import pytest
from unittest.mock import patch
from src.agents.agent_service import _run_agent_impl
from src.common import cart_manager

@pytest.fixture
def t1_env_off(monkeypatch):
    monkeypatch.setenv("USE_T1_CONFIRM", "false")

@pytest.fixture
def t1_env_on(monkeypatch):
    monkeypatch.setenv("USE_T1_CONFIRM", "true")

def test_t1_integration_off(t1_env_off):
    # Cờ tắt: Hành vi y hệt trước đây
    session_id = "test-t1-off"
    
    # Giả lập đang ở màn hình checkout
    cart_manager.set_checkout_prefs(session_id, delivery_type="GIAO_TAN_NOI")
    # Set fingerprint explicitly to trigger checkout branch
    session = cart_manager._get_or_create_session(session_id)
    session["checkout_prefs"]["summary_fingerprint"] = "xyz"
    cart_manager._touch(session_id, session, sync_db=False)
    
    # "oke" sẽ chạy qua _is_plain_confirmation (trả về True)
    with patch("src.function_calling.tools.cart_tools.execute_confirm_checkout") as mock_checkout:
        mock_checkout.return_value = {"status": "success", "order_id": "123"}
        res = _run_agent_impl(session_id, "oke", history=[])
        assert res.get("gate") == "confirm_checkout"
        assert mock_checkout.called

def test_t1_integration_on_bug_fix(t1_env_on):
    # Cờ BẬT: "chốt luôn nha" giữa lúc đang fill_options KHÔNG bị hiểu nhầm thành xác nhận
    session_id = "test-t1-on-bug"
    
    # Giả lập đang ở màn hình checkout nhưng có pending_action là fill_options
    cart_manager.set_checkout_prefs(session_id, delivery_type="GIAO_TAN_NOI")
    session = cart_manager._get_or_create_session(session_id)
    session["checkout_prefs"]["summary_fingerprint"] = "xyz"
    cart_manager._touch(session_id, session, sync_db=False)
    cart_manager.set_pending_action(session_id, "fill_options", {})
    
    with patch("src.agents.agent_service.groq_agent_chat") as mock_groq:
        # Giả lập groq fallback
        mock_groq.return_value = '{"reply": "LLM response", "tool_calls": []}'
        res = _run_agent_impl(session_id, "chốt luôn nha", history=[])
        # Nếu T1 hoạt động đúng, nó sẽ trả NONE, không đi vào nhánh confirm_checkout
        assert res.get("gate") not in ["confirm_checkout", "confirm_checkout_ambiguous"]

def test_t1_integration_on_ambiguous_cancel(t1_env_on):
    # Cờ BẬT: AMBIGUOUS dẫn tới hỏi lại, không tự thực thi hủy
    session_id = "test-t1-on-ambig-cancel"
    history = [{"role": "assistant", "content": "Ban xac nhan huy don hang 123 khong?"}]
    
    with patch("src.function_calling.tools.order_tools.execute_cancel_order") as mock_cancel:
        res = _run_agent_impl(session_id, "hủy", history=history)
        
        assert res.get("gate") == "confirm_cancel_ambiguous"
        assert "xác nhận hủy đơn hay không" in res.get("reply", "")
        # Đảm bảo không gọi tool hủy
        assert not mock_cancel.called

def test_t1_integration_on_ambiguous_checkout(t1_env_on):
    # Cờ BẬT: AMBIGUOUS checkout
    session_id = "test-t1-on-ambig-checkout"
    cart_manager.set_checkout_prefs(session_id, delivery_type="GIAO_TAN_NOI")
    session = cart_manager._get_or_create_session(session_id)
    session["checkout_prefs"]["summary_fingerprint"] = "xyz"
    cart_manager._touch(session_id, session, sync_db=False)
    
    with patch("src.function_calling.tools.cart_tools.execute_confirm_checkout") as mock_checkout:
        res = _run_agent_impl(session_id, "đúng", history=[])
        assert res.get("gate") == "confirm_checkout_ambiguous"
        assert "xác nhận chốt đơn hay không" in res.get("reply", "")
        assert not mock_checkout.called

def test_t1_integration_fill_options_lifecycle(t1_env_on):
    session_id = "test-t1-fill-options"
    cart_manager.clear_pending_action(session_id)
    cart_manager.set_pending_products(session_id, [])
    
    # Bước 1: Khách yêu cầu món số 1
    with patch("src.function_calling.tools.product_tools.execute_get_product_options") as mock_options:
        mock_options.return_value = {
            "status": "ok",
            "product_name": "Cà Phê Sữa",
            "options": {"Size": ["Vừa", "Lớn"], "Đá": ["Bình thường", "Ít đá"]}
        }
        with patch("src.agents.agent_service._resolve_numbered_product_choices") as mock_resolve:
            mock_resolve.return_value = [{"product_name": "Cà Phê Sữa", "category": "drink"}]
            # Cần mock _parse_option_groups nếu nó có parse
            _run_agent_impl(session_id, "món số 1", history=[{"role": "assistant", "content": "1. Cà Phê Sữa"}])
            
            mock_resolve.assert_called_once()
            pending = cart_manager.get_pending_action(session_id)
            assert pending is not None, "pending_action must be set"
            assert pending["type"] == "fill_options"
            
    # Bước 2: Khách cung cấp thông tin tùy chọn
    with patch("src.function_calling.tools.cart_tools.execute_add_to_cart") as mock_add, \
         patch("src.function_calling.tools.product_tools.execute_check_price_and_stock") as mock_price:
        
        mock_price.return_value = {
            "status": "ok",
            "products": [{"product_id": "P1", "product_name": "Cà Phê Sữa", "final_price": 30000}]
        }
        mock_add.return_value = {"status": "ok", "cart": {"items": [{"product_name": "Cà Phê Sữa"}]}}
        
        # trigger hoàn tất options
        _run_agent_impl(session_id, "size vừa ít đá", history=[])
        
        mock_add.assert_called_once()
        pending_after = cart_manager.get_pending_action(session_id)
        assert pending_after is not None and pending_after["type"] == "ask_more_items", "pending_action must transition to ask_more_items after completing options"

def test_t1_integration_select_branch_lifecycle(t1_env_on):
    session_id = "test-t1-select-branch"
    cart_manager._SESSION_CARTS.clear()
    
    cart_manager.set_checkout_prefs(session_id, delivery_type="MANG_DI")
    cart_manager.set_checkout_context(session_id, suggested_address="123 Duong A")
    
    with patch("src.common.cart_manager.get_cart") as mock_get_cart, \
         patch("src.function_calling.tools.branch_tools.execute_find_nearest_branch") as mock_find:
         
        mock_get_cart.return_value = {"is_empty": False, "branch_id": None, "branch_name": None, "total_price": 30000, "items": [{"product_name": "Cafe", "unit_price": 30000, "quantity": 1, "size": None}]}
        mock_find.return_value = {
            "status": "need_branch_selection",
            "branches": [
                {"ma_chi_nhanh": "B1", "ten_chi_nhanh": "CN 1", "khoang_cach_km": 1.0},
                {"ma_chi_nhanh": "B2", "ten_chi_nhanh": "CN 2", "khoang_cach_km": 2.0}
            ]
        }
        
        _run_agent_impl(session_id, "đúng rồi", history=[{"role": "assistant", "content": "Bạn có muốn giao đến địa chỉ đã lưu này không?"}])
        
        mock_find.assert_called_once()
        pending = cart_manager.get_pending_action(session_id)
        assert pending is not None, "pending_action must be set"
        assert pending["type"] == "select_branch"
        assert pending["params"]["count"] == 2
        
    with patch("src.common.cart_manager.get_cart") as mock_get_cart, \
         patch("src.function_calling.tools.branch_tools.execute_set_session_branch") as mock_set:
         
        mock_get_cart.return_value = {"is_empty": False, "branch_id": None, "branch_name": None, "total_price": 30000, "items": [{"product_name": "Cafe", "unit_price": 30000, "quantity": 1, "size": None}]}
        mock_set.return_value = {"status": "ok", "message": "Đã ghi nhận"}
        
        cart_manager.set_checkout_context(
            session_id,
            branch_candidates=[
                {"branch_id": "B1", "branch_name": "CN 1", "khoang_cach_km": 1.0},
                {"branch_id": "B2", "branch_name": "CN 2", "khoang_cach_km": 2.0}
            ]
        )
        _run_agent_impl(session_id, "cửa hàng số 1", history=[{"role": "assistant", "content": "chọn cửa hàng số mấy"}])
        
        mock_set.assert_called_once()
        pending_after = cart_manager.get_pending_action(session_id)
        assert pending_after is None, "pending_action must be cleared"
        
def test_t1_integration_select_branch_clear_on_delivery_change(t1_env_on):
    session_id = "test-t1-select-branch-clear"
    cart_manager._SESSION_CARTS.clear()
    
    cart_manager.set_checkout_prefs(session_id, delivery_type="MANG_DI")
    cart_manager.set_pending_action(session_id, "select_branch", {"count": 2})
    
    with patch("src.agents.agent_service.groq_agent_chat") as mock_groq:
        mock_groq.return_value = {"reply": "Đã cập nhật phương thức giao hàng.", "tool_calls_log": [], "error": None}
        _run_agent_impl(session_id, "thôi giao tận nơi đi", history=[])
    
    pending_after = cart_manager.get_pending_action(session_id)
    assert pending_after is None, "pending_action must be cleared when delivery type changes"

def test_t1_integration_select_voucher_lifecycle(t1_env_on):
    session_id = "test-t1-select-voucher"
    cart_manager._SESSION_CARTS.clear()
    
    cart_manager.set_checkout_context(session_id, voucher_decided=False)
    
    with patch("src.common.cart_manager.get_cart") as mock_get_cart, \
         patch("src.function_calling.tools.voucher_tools.execute_get_applicable_vouchers") as mock_get_vouchers, \
         patch("src.agents.agent_service.groq_agent_chat") as mock_groq:
         
        mock_get_cart.return_value = {"is_empty": False, "total_price": 30000, "items": [{"product_name": "Cafe", "unit_price": 30000, "quantity": 1, "size": None}], "branch_name": None, "branch_id": None}
        mock_get_vouchers.return_value = {
            "status": "ok",
            "vouchers": [
                {"ma_voucher": "V1", "ten_voucher": "Giảm 10k", "so_tien_giam_du_kien": 10000},
            ]
        }
        
        mock_groq.return_value = {"reply": "LLM response", "tool_calls_log": [], "error": None}
        _run_agent_impl(session_id, "không thêm gì nữa", history=[])
        
        mock_get_vouchers.assert_called_once()
        pending = cart_manager.get_pending_action(session_id)
        assert pending is not None, "pending_action must be set"
        assert pending["type"] == "select_voucher"
        assert pending["params"]["count"] == 1
        
    with patch("src.common.cart_manager.get_cart") as mock_get_cart, \
         patch("src.function_calling.tools.voucher_tools.execute_apply_voucher") as mock_apply:
         
        mock_get_cart.return_value = {"is_empty": False, "total_price": 30000, "items": [{"product_name": "Cafe", "unit_price": 30000, "quantity": 1, "size": None}], "branch_name": None, "branch_id": None}
        mock_apply.return_value = {"status": "ok", "message": "Đã áp dụng"}
        
        cart_manager.set_checkout_context(
            session_id,
            voucher_offer_pending=True,
            voucher_candidates=[
                {"ma_voucher": "V1", "ten_voucher": "Giảm 10k"}
            ]
        )
        _run_agent_impl(session_id, "mã số 1", history=[{"role": "assistant", "content": "chọn mã nào"}])
        
        mock_apply.assert_called_once()
        pending_after = cart_manager.get_pending_action(session_id)
        assert pending_after is None, "pending_action must be cleared"

def test_t1_integration_select_voucher_clear_when_none_found_early(t1_env_on):
    session_id = "test-t1-select-voucher-clear-early"
    cart_manager._SESSION_CARTS.clear()
    
    cart_manager.set_checkout_prefs(session_id, delivery_type="MANG_DI")
    cart_manager.set_checkout_context(session_id, voucher_decided=False)
    cart_manager.set_pending_action(session_id, "select_voucher", {"count": 1})
    
    with patch("src.common.cart_manager.get_cart") as mock_get_cart, \
         patch("src.function_calling.tools.voucher_tools.execute_get_applicable_vouchers") as mock_get_vouchers, \
         patch("src.agents.agent_service.groq_agent_chat") as mock_groq:
         
        mock_get_cart.return_value = {"is_empty": False, "total_price": 30000, "items": [{"product_name": "Cafe", "unit_price": 30000, "quantity": 1, "size": None}], "branch_name": None, "branch_id": None}
        mock_get_vouchers.return_value = {
            "status": "ok",
            "vouchers": []
        }
        
        mock_groq.return_value = {"reply": "LLM response", "tool_calls_log": [], "error": None}
        result = _run_agent_impl(session_id, "không thêm gì nữa", history=[])
        
        mock_get_vouchers.assert_called()
        pending = cart_manager.get_pending_action(session_id)
        assert pending is None, "pending_action must be cleared when no vouchers found"
        assert "Hiện không có mã giảm giá phù hợp" in result.get("reply", ""), "Must return text from no_more_items block (line 1346/1376)"

def test_t1_integration_select_voucher_clear_when_none_found_before_checkout(t1_env_on):
    session_id = "test-t1-select-voucher-clear-before-checkout"
    cart_manager._SESSION_CARTS.clear()
    
    cart_manager.set_checkout_prefs(session_id, delivery_type="MANG_DI")
    cart_manager.set_checkout_context(session_id, voucher_decided=False)
    cart_manager.set_pending_action(session_id, "select_voucher", {"count": 1})
    
    with patch("src.common.cart_manager.get_cart") as mock_get_cart, \
         patch("src.function_calling.tools.voucher_tools.execute_get_applicable_vouchers") as mock_get_vouchers, \
         patch("src.agents.agent_service.groq_agent_chat") as mock_groq:
         
        mock_get_cart.return_value = {"is_empty": False, "total_price": 30000, "items": [{"product_name": "Cafe", "unit_price": 30000, "quantity": 1, "size": None}], "branch_id": "B1", "branch_name": "CN 1"}
        mock_get_vouchers.return_value = {
            "status": "ok",
            "vouchers": []
        }
        mock_groq.return_value = {"reply": "Mình đã lưu đơn", "tool_calls_log": [], "error": None}
        
        result = _run_agent_impl(session_id, "chốt đơn đi", history=[])
        
        mock_get_vouchers.assert_called_once()
        pending = cart_manager.get_pending_action(session_id)
        assert pending is None, "pending_action must be cleared when no vouchers found before checkout"
        assert "phương thức thanh toán nhé" in result.get("reply", ""), "Must return missing_prompt from _is_plain_confirmation block (line 1407/1447)"

def test_t1_integration_ask_more_items_lifecycle(t1_env_on):
    session_id = "test-t1-ask-more-items"
    cart_manager._SESSION_CARTS.clear()
    
    # 1. SET pending action directly
    from src.function_calling.tools.cart_tools import execute_add_to_cart
    execute_add_to_cart(session_id, "Cafe", None, 1, 60000)
    cart_manager.set_pending_action(session_id, "ask_more_items", {})
    
    pending = cart_manager.get_pending_action(session_id)
    assert pending is not None
    assert pending["type"] == "ask_more_items"
    
    # 2. CLEAR qua LLM add_to_cart thành công
    with patch("src.agents.agent_service.groq_agent_chat") as mock_groq, \
         patch("src.function_calling.tools.cart_tools.execute_add_to_cart") as mock_add2:
        mock_add2.return_value = {"status": "ok", "cart": {"total_price": 60000, "items": []}}
        mock_groq.return_value = {
            "reply": "mình đã thêm món",
            "tool_calls_log": [{"tool": "add_to_cart", "result": {"status": "ok", "cart": {"total_price": 60000, "items": []}}, "args": {"product_name": "Cake", "quantity": 1}}],
            "error": None
        }
        res = _run_agent_impl(session_id, "thêm cafe", history=[])
        assert cart_manager.get_pending_action(session_id) is None, "Phải clear khi add_to_cart qua LLM thành công"
        
    # 3. SET lại và CLEAR qua no_more_items
    cart_manager.set_pending_action(session_id, "ask_more_items", {})
    with patch("src.agents.agent_service.groq_agent_chat") as mock_groq:
        mock_groq.return_value = {"reply": "LLM text", "tool_calls_log": [], "error": None}
        res2 = _run_agent_impl(session_id, "không thêm gì nữa", history=[])
        assert cart_manager.get_pending_action(session_id) is None, "Phải clear khi khách từ chối thêm món"
        
    # 4. SET lại và CLEAR qua checkout
    cart_manager.set_pending_action(session_id, "ask_more_items", {})
    with patch("src.agents.agent_service.groq_agent_chat") as mock_groq:
        mock_groq.return_value = {"reply": "LLM text", "tool_calls_log": [], "error": None}
        _run_agent_impl(session_id, "chốt đơn đi", history=[])
        assert cart_manager.get_pending_action(session_id) is None, "Phải clear khi khách chốt đơn"
