"""Regression coverage for V5 structured conversational state.

These tests intentionally exercise state/resolution helpers directly: they do
not need an LLM, assistant prose, or a live Order Service to decide a write.
"""
from src.agents import agent_service
from src.agents.order_flow_graph import _dispatch_pending_yes_no, _resolve_typed_references, run_order_flow
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


def test_yes_no_dispatcher_uses_durable_action_not_the_word_alone():
    session = "v5-confirmation-dispatch"
    cart_manager.set_pending_interaction(
        session, kind="YES_NO", domain="CART", action="ASK_MORE_ITEMS", data={},
    )
    result = _dispatch_pending_yes_no(session, {"is_empty": False}, "ừ")
    assert result["reply"].startswith("Được, bạn muốn xem thêm")
    assert cart_manager.get_pending_interaction(session) is None

    cart_manager.set_pending_interaction(
        session, kind="YES_NO", domain="CART", action="CLEAR_CART", data={},
    )
    clear = _dispatch_pending_yes_no(session, {"is_empty": False}, "ừ ừ")
    assert clear["_confirmed_clear_cart"] is True
    # The dispatcher authorizes the stored action only; the write remains in
    # the cart mutation node and cannot be triggered by a generic YES alone.
    assert cart_manager.get_pending_interaction(session)["action"] == "CLEAR_CART"


def test_clear_cart_yes_executes_exactly_once(monkeypatch):
    session = "v5-clear-cart-once"
    cart_manager.add_item(session, "P1", "Matcha", 49000)
    cart_manager.set_pending_interaction(
        session, kind="YES_NO", domain="CART", action="CLEAR_CART", data={},
    )
    calls = []

    def clear_once(_session_id):
        calls.append(_session_id)
        return {"status": "ok", "message": "Đã xoá giỏ."}

    monkeypatch.setattr("src.function_calling.tools.cart_tools.execute_clear_cart", clear_once)
    monkeypatch.setattr(agent_service, "groq_agent_chat", lambda **_kwargs: {
        "reply": "Bạn muốn làm gì tiếp?", "tool_calls_log": [], "error": None,
    })
    run_order_flow(session, "ừ", client_message_id="clear-confirm-1")
    run_order_flow(session, "ừ", client_message_id="clear-confirm-2")
    assert calls == [session]


def test_yes_no_address_no_checkout_and_material_payment_change(monkeypatch):
    address_session = "v5-address-confirm"
    cart_manager.set_pending_interaction(
        address_session, kind="YES_NO", domain="ADDRESS", action="CONFIRM_ADDRESS",
        context_id="address:1", data={"address_snapshot": "123 Đường A"},
    )
    # Use an explicit helper so the assertion captures the dispatcher argument.
    def confirm_address(session_id, _message, confirmed=False):
        if confirmed:
            confirmed_calls.append(session_id)
        return {"reply": "Đã xác nhận"}

    confirmed_calls = []
    monkeypatch.setattr(agent_service, "_confirm_saved_location", confirm_address)
    monkeypatch.setattr(agent_service, "_advance_checkout_if_ready", lambda _session_id, result: result)
    result = _dispatch_pending_yes_no(address_session, {"is_empty": False}, "ừ ừ")
    assert result["reply"] == "Đã xác nhận"
    assert confirmed_calls == [address_session]

    checkout_session = "v5-checkout-no"
    cart_manager.set_pending_interaction(
        checkout_session, kind="YES_NO", domain="CHECKOUT", action="CONFIRM_CHECKOUT",
        context_id="action:1", data={"action_id": "action:1"},
    )
    monkeypatch.setattr(
        "src.function_calling.tools.cart_tools.execute_confirm_checkout",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("NO must not create an order")),
    )
    declined = _dispatch_pending_yes_no(checkout_session, {"is_empty": False}, "không")
    assert "chưa đặt đơn" in declined["reply"]
    assert cart_manager.get_pending_interaction(checkout_session) is None

    change_session = "v5-checkout-payment-change"
    cart_manager.set_checkout_context(
        change_session, checkout_action_id="action:old", checkout_quote_id="quote:old",
        checkout_action_expires_at="2099-01-01T00:00:00+00:00",
    )
    cart_manager.set_pending_interaction(
        change_session, kind="YES_NO", domain="CHECKOUT", action="CONFIRM_CHECKOUT",
        context_id="action:old", data={"action_id": "action:old"},
    )
    assert _dispatch_pending_yes_no(change_session, {"is_empty": False}, "oke nhưng đổi sang QR") is None
    prefs = cart_manager.get_checkout_prefs(change_session)
    assert prefs.get("checkout_action_id") is None
    assert prefs.get("checkout_quote_id") is None
    assert cart_manager.get_pending_interaction(change_session) is None


def test_select_one_short_acknowledgements_reprompt_without_selection():
    session = "v5-select-one-short-reply"
    cart_manager.set_pending_interaction(
        session, kind="SELECT_ONE", domain="VOUCHER", action="SELECT_VOUCHER", data={},
    )
    state = {
        "session_id": session, "user_message": "oke", "cart": {"is_empty": False},
        "intent": {"intent": "UNKNOWN"}, "history": [],
    }
    from src.agents.order_flow_graph import _resolve_pending_interaction
    resolved = _resolve_pending_interaction(state)
    assert "chọn rõ mã số mấy" in resolved["result"]["reply"]
    assert cart_manager.get_pending_interaction(session)["action"] == "SELECT_VOUCHER"


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


def test_twelve_read_only_detours_preserve_resume_task_and_pending_id():
    session = "v5-long-resume-detour"
    pending = cart_manager.set_pending_products(session, [{
        "product_id": "M1", "product_name": "Matcha Latte", "quantity": 1,
        "selected_options": {"do_ngot": "50%"}, "missing_options": ["Kích thước"],
        "options": {"groups": {"Kích thước": ["Nhỏ", "Vừa", "Lớn"]}},
    }])
    cart_manager.set_pending_interaction(
        session, kind="FILL_FIELDS", domain="PRODUCT", action="FILL_OPTIONS",
        context_id=pending[0]["pending_id"], data={"pending_id": pending[0]["pending_id"]},
    )
    for turn in range(12):
        assert _complete_pending_products_from_options(
            session, f"Bánh Tiramisu câu hỏi đọc-only số {turn}?",
        ) is None
    prefs = cart_manager.get_checkout_prefs(session)
    assert prefs["pending_products"][0]["pending_id"] == pending[0]["pending_id"]
    assert prefs["resume_task"]["product_id"] == "M1"
    assert prefs["resume_task"]["selected_values"] == {"do_ngot": "50%"}


def test_pending_draft_removal_uses_stable_id_not_similar_name():
    session = "v5-stable-pending-removal"
    pending = cart_manager.set_pending_products(session, [
        {"product_id": "P1", "product_name": "Matcha Latte"},
        {"product_id": "P2", "product_name": "Matcha Latte Dâu"},
    ])
    cart_manager.mark_pending_product_added(session, pending_id=pending[0]["pending_id"])
    remaining = cart_manager.get_checkout_prefs(session)["pending_products"]
    assert [item["product_id"] for item in remaining] == ["P2"]


def test_multi_product_option_reply_binds_each_explicit_product_clause(monkeypatch):
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
    assert cold_brew["selected_options"]["size"] == "Vừa"


def test_second_pending_product_never_consumes_first_products_option_clause(monkeypatch):
    session = "v5-option-clause-second-product"
    pending = cart_manager.set_pending_products(session, [
        {
            "product_id": "M1", "product_name": "Matcha Latte",
            "options": {"groups": {"Kích thước": ["Nhỏ", "Vừa", "Lớn"], "Topping": ["Cheese foam", "Trân châu"]}},
        },
        {
            "product_id": "C1", "product_name": "Cold Brew",
            "options": {"groups": {"Kích thước": ["Nhỏ", "Vừa", "Lớn"], "Topping": ["Cheese foam", "Trân châu"]}},
        },
    ])
    # The active task deliberately points to the second product: this was the
    # previous boundary bug where Cold Brew read Matcha's earlier clause.
    cart_manager.set_pending_interaction(
        session, kind="FILL_FIELDS", domain="PRODUCT", action="FILL_OPTIONS",
        context_id=pending[1]["pending_id"], data={"pending_id": pending[1]["pending_id"]},
    )
    monkeypatch.setattr(
        "src.function_calling.tools.product_tools.execute_check_price_and_stock",
        lambda **_kwargs: {"status": "error", "products": []},
    )

    _complete_pending_products_from_options(
        session, "Matcha Latte size lớn thêm cheese foam, Cold Brew size vừa thêm trân châu",
    )

    stored = cart_manager.get_checkout_prefs(session)["pending_products"]
    matcha = next(item for item in stored if item["product_id"] == "M1")
    cold_brew = next(item for item in stored if item["product_id"] == "C1")
    assert matcha["selected_options"] == {"size": "Lớn", "toppings": ["Cheese foam"]}
    assert cold_brew["selected_options"] == {"size": "Vừa", "toppings": ["Trân châu"]}


def test_multiple_pending_unscoped_option_requires_clarification():
    session = "v5-option-unscoped-ambiguous"
    pending = cart_manager.set_pending_products(session, [
        {"product_id": "M1", "product_name": "Matcha", "options": {"groups": {"Kích thước": ["Nhỏ", "Vừa"]}}},
        {"product_id": "C1", "product_name": "Cold Brew", "options": {"groups": {"Kích thước": ["Nhỏ", "Vừa"]}}},
    ])
    cart_manager.set_pending_interaction(
        session, kind="FILL_FIELDS", domain="PRODUCT", action="FILL_OPTIONS",
        context_id=pending[0]["pending_id"], data={"pending_id": pending[0]["pending_id"]},
    )
    result = _complete_pending_products_from_options(session, "size vừa")
    assert "nói rõ" in result["reply"]
    assert all(not item["selected_options"] for item in cart_manager.get_checkout_prefs(session)["pending_products"])


def test_successful_first_add_preserves_second_products_explicit_size(monkeypatch):
    """Both named clauses are durable before the first backend ADD succeeds."""
    session = "v5-options-successful-first-add"
    pending = cart_manager.set_pending_products(session, [
        {"product_id": "M1", "product_name": "Matcha Latte", "options": {"groups": {"Kích thước": ["Nhỏ", "Vừa", "Lớn"]}}},
        {"product_id": "C1", "product_name": "Cold Brew", "options": {"groups": {"Kích thước": ["Nhỏ", "Vừa", "Lớn"]}}},
    ])
    cart_manager.set_pending_interaction(
        session, kind="FILL_FIELDS", domain="PRODUCT", action="FILL_OPTIONS",
        context_id=pending[0]["pending_id"], data={"pending_id": pending[0]["pending_id"]},
    )
    monkeypatch.setattr(
        "src.function_calling.tools.product_tools.execute_check_price_and_stock",
        lambda **kwargs: {"status": "ok", "products": [{
            "product_id": kwargs["product_name_query"],
            "product_name": kwargs["product_name_query"], "final_price": 49000,
        }]},
    )
    added = []
    monkeypatch.setattr(
        "src.function_calling.tools.cart_tools.execute_add_to_cart",
        lambda **kwargs: added.append(kwargs) or {"status": "ok"},
    )

    result = _complete_pending_products_from_options(
        session, "Matcha Latte size lớn, Cold Brew size vừa",
    )

    assert added and added[0]["product_name"] == "Matcha Latte"
    assert added[0]["size"] == "Lớn"
    remaining = cart_manager.get_checkout_prefs(session)["pending_products"]
    assert [row["product_id"] for row in remaining] == ["C1"]
    assert remaining[0]["selected_options"]["size"] == "Vừa"
    interaction = cart_manager.get_pending_interaction(session)
    assert interaction["action"] == "FILL_OPTIONS"
    assert interaction["data"]["pending_id"] == remaining[0]["pending_id"]


def test_successful_first_add_preserves_second_products_explicit_toppings(monkeypatch):
    session = "v5-toppings-successful-first-add"
    pending = cart_manager.set_pending_products(session, [
        {"product_id": "M1", "product_name": "Matcha Latte", "options": {"groups": {"Topping": ["Cheese foam", "Trân châu"]}}},
        {"product_id": "C1", "product_name": "Cold Brew", "options": {"groups": {"Topping": ["Cheese foam", "Trân châu"]}}},
    ])
    cart_manager.set_pending_interaction(
        session, kind="FILL_FIELDS", domain="PRODUCT", action="FILL_OPTIONS",
        context_id=pending[0]["pending_id"], data={"pending_id": pending[0]["pending_id"]},
    )
    monkeypatch.setattr(
        "src.function_calling.tools.product_tools.execute_check_price_and_stock",
        lambda **kwargs: {"status": "ok", "products": [{
            "product_id": kwargs["product_name_query"],
            "product_name": kwargs["product_name_query"], "final_price": 49000,
        }]},
    )
    monkeypatch.setattr("src.function_calling.tools.cart_tools.execute_add_to_cart", lambda **_kwargs: {"status": "ok"})

    _complete_pending_products_from_options(
        session, "Matcha Latte thêm cheese foam, Cold Brew thêm trân châu",
    )

    remaining = cart_manager.get_checkout_prefs(session)["pending_products"]
    assert remaining[0]["product_id"] == "C1"
    assert remaining[0]["selected_options"]["toppings"] == ["Trân châu"]
