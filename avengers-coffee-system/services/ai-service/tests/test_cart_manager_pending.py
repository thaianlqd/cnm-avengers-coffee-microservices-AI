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
