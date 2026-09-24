import os
import pytest

@pytest.fixture(autouse=True)
def disable_turn_log(monkeypatch):
    monkeypatch.setenv("TURN_LOG_ENABLED", "false")

@pytest.fixture(autouse=True)
def mock_postgres_cart_db(monkeypatch):
    """
    Mock the Postgres DB with an in-memory dictionary.
    This avoids connecting to Postgres (which takes time)
    while preserving the exact behavior of _sync_to_db and _load_from_db.
    """
    from src.common import cart_manager
    import time
    
    _MOCK_DB = {}
    
    def fake_sync_to_db(session_id, session):
        _MOCK_DB[session_id] = {
            "branch_id": session.get("branch_id"),
            "branch_name": session.get("branch_name"),
            "cart_items": session.get("items", []), 
            "is_checking_out": session.get("is_checking_out", False),
            "checkout_prefs": session.get("checkout_prefs", {}),
            "last_order_id": session.get("last_order_id"),
        }
        
    def fake_load_from_db(session_id):
        if session_id in _MOCK_DB:
            row = _MOCK_DB[session_id]
            return {
                "branch_id": row.get("branch_id"),
                "branch_name": row.get("branch_name"),
                "items": row.get("cart_items", []),
                "is_checking_out": row.get("is_checking_out", False),
                "checkout_prefs": row.get("checkout_prefs", {}),
                "last_order_id": row.get("last_order_id"),
                "created_at": time.time(),
                "updated_at": time.time(),
            }
        return None

    monkeypatch.setattr(cart_manager, "_sync_to_db", fake_sync_to_db)
    monkeypatch.setattr(cart_manager, "_load_from_db", fake_load_from_db)
    cart_manager._SESSION_CARTS.clear()
