"""Regression coverage for V5 structured conversational state.

These tests intentionally exercise state/resolution helpers directly: they do
not need an LLM, assistant prose, or a live Order Service to decide a write.
"""
from src.agents.order_flow_graph import _resolve_typed_references
from src.agents.agent_service import _complete_pending_products_from_options, _run_agent_impl
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


def test_old_assistant_numbering_cannot_stage_a_cart_write(monkeypatch):
    session = "v5-history-is-not-write-authority"
    monkeypatch.setattr(
        "src.function_calling.tools.cart_tools.sync_authoritative_cart",
        lambda session_id: cart_manager.get_cart(session_id),
    )
    monkeypatch.setattr(
        "src.agents.agent_service._resolve_numbered_product_choices",
        lambda *_args: [{"product_name": "Món chỉ có trong history", "category": "drink"}],
    )
    version_before = cart_manager.get_cart(session).get("cart_version")
    reply = _run_agent_impl(session, "thêm số 1", history=[{"role": "assistant", "content": "1. Món cũ"}])
    assert "ngữ cảnh chọn món an toàn" in reply["reply"]
    assert not cart_manager.get_checkout_prefs(session).get("pending_products")
    assert cart_manager.get_cart(session).get("cart_version") == version_before


def test_read_only_detour_does_not_consume_other_product_draft():
    session = "v5-option-detour"
    pending = cart_manager.set_pending_products(session, [{
        "product_id": "M1", "product_name": "Matcha Latte",
        "options": {"groups": {"Kích thước": ["Nhỏ", "Vừa", "Lớn"]}},
    }])
    cart_manager.set_pending_interaction(
        session, kind="FILL_FIELDS", domain="PRODUCT", action="FILL_OPTIONS",
        context_id=pending[0]["pending_id"], data={"pending_id": pending[0]["pending_id"]},
    )
    assert _complete_pending_products_from_options(session, "Bánh Tiramisu có size lớn không?") is None
    stored = cart_manager.get_checkout_prefs(session)["pending_products"][0]
    assert stored["pending_id"] == pending[0]["pending_id"]
    assert stored["selected_options"] == {}


def test_pending_draft_removal_uses_stable_id_not_similar_name():
    session = "v5-stable-pending-removal"
    pending = cart_manager.set_pending_products(session, [
        {"product_id": "P1", "product_name": "Matcha Latte"},
        {"product_id": "P2", "product_name": "Matcha Latte Dâu"},
    ])
    cart_manager.mark_pending_product_added(session, pending_id=pending[0]["pending_id"])
    remaining = cart_manager.get_checkout_prefs(session)["pending_products"]
    assert [item["product_id"] for item in remaining] == ["P2"]


def test_multi_product_option_reply_is_scoped_to_active_pending_draft(monkeypatch):
    session = "v5-option-clause-scope"
    pending = cart_manager.set_pending_products(session, [
        {"product_id": "M1", "product_name": "Matcha Latte", "options": {"groups": {"Kích thước": ["Nhỏ", "Vừa", "Lớn"]}}},
        {"product_id": "C1", "product_name": "Cold Brew", "options": {"groups": {"Kích thước": ["Nhỏ", "Vừa", "Lớn"]}}},
    ])
    cart_manager.set_pending_interaction(
        session, kind="FILL_FIELDS", domain="PRODUCT", action="FILL_OPTIONS",
        context_id=pending[0]["pending_id"], data={"pending_id": pending[0]["pending_id"]},
    )
    # Stop before a cart write: this regression asserts option binding only.
    monkeypatch.setattr(
        "src.function_calling.tools.product_tools.execute_check_price_and_stock",
        lambda **_kwargs: {"status": "error", "products": []},
    )
    _complete_pending_products_from_options(session, "Matcha Latte size lớn, Cold Brew size vừa")
    stored = cart_manager.get_checkout_prefs(session)["pending_products"]
    matcha = next(item for item in stored if item["product_id"] == "M1")
    cold_brew = next(item for item in stored if item["product_id"] == "C1")
    assert matcha["selected_options"]["size"] == "Lớn"
    assert cold_brew["selected_options"] == {}
