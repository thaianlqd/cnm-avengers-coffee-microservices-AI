"""The pre-V2 sparse baseline and existing pending ownership contract."""
from copy import deepcopy

from src.agents import order_flow_graph
from src.common import cart_manager
from src.rag import rag_service


def test_sparse_baseline_load_search_and_absence(monkeypatch):
    monkeypatch.setattr(rag_service, "load_all_rag_data", lambda: [{
        "id": "policy", "title": "Chính sách bảo mật", "content": "Bảo vệ dữ liệu cá nhân",
        "source": "test", "domain": "privacy", "volatility": "static",
        "authority": "knowledge",
    }])
    service = rag_service.RAGService()
    service.load()
    assert service.is_loaded
    assert service.search("chinh sach bao mat")[0]["id"] == "policy"
    assert service.search("quasar astrophysics") == []


def test_existing_option_owner_receives_next_answer(monkeypatch):
    session = "rag-characterization"
    cart_manager.set_pending_products(session, [{"product_id": "p1", "product_name": "Trà",
                                              "quantity": 1}])
    cart_manager.set_pending_action(session, "fill_options", {})
    before = deepcopy(cart_manager.get_checkout_prefs(session))
    state = order_flow_graph._understand({"session_id": session, "user_message": "size L đi bạn", "history": []})
    assert state["intent"]["intent"] == "FILL_OPTIONS"
    assert cart_manager.get_checkout_prefs(session) == before
