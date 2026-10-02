import time
from src.common.cart_manager import (
    set_pending_action,
    get_pending_action,
    clear_pending_action,
    cart_fingerprint,
    reset_conversation_draft,
    get_cart,
    set_checkout_prefs
)
from src.common import cart_manager

def test_set_get_clear_pending_action():
    session_id = "test-pending-session-1"
    
    # Init cart
    get_cart(session_id)
    
    # Initially None
    assert get_pending_action(session_id) is None
    
    # Set and Get
    set_pending_action(session_id, "clear_cart", {"param1": 123})
    pending = get_pending_action(session_id)
    assert pending is not None
    assert pending["type"] == "clear_cart"
    assert pending["params"]["param1"] == 123
    assert "expires_at" in pending
    
    # Clear
    clear_pending_action(session_id)
    assert get_pending_action(session_id) is None

def test_pending_action_ttl_expiry(monkeypatch):
    session_id = "test-pending-session-2"
    get_cart(session_id)
    
    # Set normally
    set_pending_action(session_id, "test", {})
    
    # Fast forward time 6 minutes (360 seconds)
    real_time = time.time
    monkeypatch.setattr(time, "time", lambda: real_time() + 360)
    
    # Should be None and cleaned up
    assert get_pending_action(session_id) is None

def test_cart_fingerprint_ignores_pending_action():
    session_id = "test-pending-session-3"
    get_cart(session_id)
    set_checkout_prefs(session_id, delivery_type="GIAO_TAN_NOI")
    
    # Baseline fingerprint
    fp1 = cart_fingerprint(session_id)
    
    # Set pending action
    set_pending_action(session_id, "some_action", {})
    fp2 = cart_fingerprint(session_id)
    
    # Fingerprint should not change
    assert fp1 == fp2

def test_reset_conversation_draft_clears_pending_action():
    session_id = "test-pending-session-4"
    get_cart(session_id)
    
    set_pending_action(session_id, "clear_cart", {})
    assert get_pending_action(session_id) is not None
    
    reset_conversation_draft(session_id)
    
    assert get_pending_action(session_id) is None


def test_reset_conversation_draft_clears_product_reference_but_keeps_business_choices():
    session_id = "test-pending-reference-reset"
    cart_manager.set_checkout_context(session_id, pending_product_reference=["food"],
        pending_products=[{"product_id": "D10", "product_name": "Nước 10"}],
        delivery_type="GIAO_TAN_NOI", payment_method="COD")
    remaining = reset_conversation_draft(session_id)
    assert "pending_product_reference" not in remaining
    assert "pending_products" not in remaining
    assert remaining["delivery_type"] == "GIAO_TAN_NOI"
    assert remaining["payment_method"] == "COD"


def test_reset_conversation_draft_clears_location_and_summary_without_emptying_cart():
    session_id = "test-location-draft-reset"
    cart_manager.add_item(session_id, "P1", "Cà phê", 35000)
    draft = {
        "profile_address_candidates": [{"label": "Nhà", "full_address": "42 Nguyễn Huệ"}],
        "partial_delivery_address": "42 Nguyễn Huệ",
        "branch_candidates": [{"ma_chi_nhanh": "B1"}],
        "suggested_address": "42 Nguyễn Huệ",
        "address_change_requested": True,
        "location_pending": True,
        "last_product_focus": {"product_id": "P1"},
        "summary_amounts": {"total": 35000},
        "checkout_action_expires_at": 123,
    }
    cart_manager.set_checkout_context(session_id, **draft)
    cart_manager.set_pending_action(session_id, "select_profile_address", {})
    remaining = reset_conversation_draft(session_id)
    assert not set(draft) & set(remaining)
    assert "pending_action" not in remaining
    assert len(cart_manager.get_cart(session_id)["items"]) == 1
