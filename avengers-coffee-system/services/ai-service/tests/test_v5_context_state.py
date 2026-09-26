"""Regression coverage for V5 structured conversational state.

These tests intentionally exercise state/resolution helpers directly: they do
not need an LLM, assistant prose, or a live Order Service to decide a write.
"""
from src.agents.order_flow_graph import _resolve_typed_references
from src.agents.tier1 import classify_confirmation
from src.common import cart_manager


def _product(product_id, label, category):
    return {"entity_id": product_id, "product_id": product_id, "label": label,
            "product_name": label, "category": category}


def test_grouped_product_ordinals_resolve_by_namespace_not_history():
    session = "v5-grouped-ordinals"
    cart_manager.set_active_list_context(
        session, "PRODUCT", mode="GROUPED", groups={
            "DRINK": [_product("D1", "Matcha Latte", "drink"), _product("D2", "Cold Brew", "drink")],
            "FOOD": [_product("F1", "Bánh Tiramisu", "food")],
        },
    )
    resolved = _resolve_typed_references(session, "thêm nước số 2 và bánh số 1")
    assert resolved["status"] == "resolved"
    assert [item["product_id"] for item in resolved["items"]] == ["D2", "F1"]


def test_plain_grouped_ordinal_is_ambiguous_and_never_resolves():
    session = "v5-ambiguous-plain-ordinal"
    cart_manager.set_active_list_context(
        session, "PRODUCT", mode="GROUPED", groups={
            "DRINK": [_product("D1", "Matcha Latte", "drink")],
            "FOOD": [_product("F1", "Bánh Tiramisu", "food")],
        },
    )
    resolved = _resolve_typed_references(session, "thêm số 1")
    assert resolved["status"] == "ambiguous"
    assert {item["product_id"] for item in resolved["items"]} == {"D1", "F1"}


def test_new_active_list_replaces_old_implicit_ordinal_context():
    session = "v5-active-list-replaces"
    cart_manager.set_active_list_context(session, "PRODUCT", items=[_product("OLD", "Bánh cũ", "food")])
    cart_manager.set_active_list_context(session, "PRODUCT", items=[_product("NEW", "Matcha mới", "drink")])
    resolved = _resolve_typed_references(session, "thêm số 1")
    assert resolved["status"] == "resolved"
    assert resolved["items"][0]["product_id"] == "NEW"


def test_product_draft_survives_list_detour_and_has_stable_identity():
    session = "v5-resume-after-detour"
    cart_manager.set_active_list_context(session, "PRODUCT", items=[_product("M1", "Matcha Latte", "drink")])
    pending = cart_manager.set_pending_products(session, [{
        "product_id": "M1", "product_name": "Matcha Latte", "quantity": 1,
        "selected_options": {"do_ngot": "50%"}, "missing_options": ["Kích thước"],
    }])
    cart_manager.set_active_list_context(session, "PRODUCT", items=[_product("C1", "Bánh Tiramisu", "food")])
    prefs = cart_manager.get_checkout_prefs(session)
    assert prefs["pending_products"][0]["pending_id"] == pending[0]["pending_id"]
    assert prefs["resume_task"]["product_id"] == "M1"
    assert prefs["resume_task"]["selected_values"] == {"do_ngot": "50%"}


def test_confirmation_words_are_gated_by_yes_no_interaction_type():
    assert classify_confirmation("ừ ừ", "YES_NO") == "YES"
    assert classify_confirmation("được đó", "YES_NO") == "YES"
    assert classify_confirmation("đúng rồi", "YES_NO") == "YES"
    assert classify_confirmation("oke", "select_voucher") == "NONE"
    assert classify_confirmation("oke nhưng đổi sang QR", "YES_NO") == "NONE"
    assert classify_confirmation("không thêm nữa", "YES_NO") == "NO"

