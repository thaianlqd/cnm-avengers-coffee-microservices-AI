from src.agents.order_flow_graph import _resolve_suggested_product
from src.common import cart_manager


def test_compound_menu_question_splits_or_branches_and_keeps_one_numbering(monkeypatch):
    from src.agents.order_flow_graph import _resolve_suggested_product, run_order_flow
    from src.function_calling.tools import cart_tools, product_tools

    session = "compound-menu-branches"
    calls = []
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda value: cart_manager.get_cart(value))

    def fake_recommendations(**kwargs):
        calls.append((kwargs.get("category"), kwargs.get("search_text")))
        if kwargs.get("search_text") == "Bánh Mặn":
            products = [{
                "product_id": "F1", "product_name": "Butter Croissant",
                "final_price": 29000, "category": "Bánh Mặn",
            }]
        else:
            products = [{
                "product_id": "F2", "product_name": "Bánh Trung Thu Matcha",
                "final_price": 99000, "category": "Bánh Trung Thu",
            }]
        return {"status": "ok", "products": products}

    monkeypatch.setattr(product_tools, "execute_get_recommendations", fake_recommendations)
    result = run_order_flow(session, "có món bánh mặn hoặc bánh matcha không?")

    assert calls == [("food", "Bánh Mặn"), ("food", "matcha")]
    assert "Butter Croissant" in result["reply"]
    assert "Bánh Trung Thu Matcha" in result["reply"]
    assert [row["product_id"] for row in result["ui_payload"]["products"]] == ["F1", "F2"]
    assert _resolve_suggested_product(session, "cho tôi món số 2 nhé")["product_id"] == "F2"


def test_short_cake_matcha_query_is_food_search_not_exact_product_guess(monkeypatch):
    from src.agents.order_flow_graph import run_order_flow
    from src.function_calling.tools import cart_tools, product_tools

    session = "short-cake-matcha-query"
    calls = []
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda value: cart_manager.get_cart(value))
    monkeypatch.setattr(product_tools, "execute_get_recommendations", lambda **kwargs: (
        calls.append(kwargs) or {
            "status": "ok",
            "products": [{
                "product_id": "F2", "product_name": "Bánh Trung Thu Matcha",
                "final_price": 99000, "category": "Bánh Trung Thu",
            }],
        }
    ))

    result = run_order_flow(session, "bánh matcha")
    assert calls[0]["category"] == "food"
    assert calls[0]["search_text"] == "matcha"
    assert "Bánh Trung Thu Matcha" in result["reply"]


def test_view_cake_menu_uses_food_category_without_free_text_guess(monkeypatch):
    from src.agents.order_flow_graph import run_order_flow
    from src.function_calling.tools import cart_tools, product_tools

    session = "view-cake-menu"
    calls = []
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda value: cart_manager.get_cart(value))
    monkeypatch.setattr(product_tools, "execute_get_recommendations", lambda **kwargs: (
        calls.append(kwargs) or {
            "status": "ok",
            "products": [{
                "product_id": "F1", "product_name": "Butter Croissant",
                "final_price": 29000, "category": "Bánh Mặn",
            }],
        }
    ))

    result = run_order_flow(session, "cho tôi xem menu bánh đi")
    assert calls[0]["category"] == "food"
    assert calls[0]["search_text"] is None
    assert "Butter Croissant" in result["reply"]


def test_broad_buy_cake_and_drink_request_builds_two_catalog_branches(monkeypatch):
    """The opening turn must support later 'nước số N và bánh số N' choices."""
    from src.agents.order_flow_graph import run_order_flow
    from src.function_calling.tools import cart_tools, product_tools

    session = "broad-cake-drink-menu"
    calls = []
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda value: cart_manager.get_cart(value))

    def fake_recommendations(**kwargs):
        category = kwargs["category"]
        calls.append(category)
        return {"status": "ok", "products": [{
            "product_id": category,
            "product_name": "Nước Mát" if category == "drink" else "Bánh Mặn",
            "final_price": 39000,
            "category": "Đồ uống" if category == "drink" else "Bánh Mặn",
        }]}

    monkeypatch.setattr(product_tools, "execute_get_recommendations", fake_recommendations)
    result = run_order_flow(session, "tôi muốn mua bánh và nước")

    assert calls == ["food", "drink"]
    assert [item["product_id"] for item in result["ui_payload"]["products"]] == ["food", "drink"]


def test_latest_recommendation_snapshot_resolves_ordinal_after_other_turns():
    session = "recommendation-memory"
    cart_manager.set_checkout_context(session, last_product_suggestions=[
        {"product_id": "120", "product_name": "Bánh Trung Thu Matcha", "category": "food"},
        {"product_id": "119", "product_name": "Bánh Trung Thu Cà Phê Lava", "category": "food"},
    ])
    assert _resolve_suggested_product(session, "cho tôi thêm bánh số 1 vào giỏ") ["product_name"] == "Bánh Trung Thu Matcha"


def test_latest_recommendation_snapshot_resolves_explicit_product_name():
    session = "recommendation-name-memory"
    cart_manager.set_checkout_context(session, last_product_suggestions=[
        {"product_id": "120", "product_name": "Bánh Trung Thu Matcha", "category": "food"},
    ])
    assert _resolve_suggested_product(session, "cho thêm Bánh Trung Thu Matcha vào giỏ ấy")["product_id"] == "120"


def test_graph_adds_the_latest_numbered_suggestion_not_a_free_text_guess(monkeypatch):
    from src.agents.order_flow_graph import run_order_flow
    from src.function_calling.tools import cart_tools, product_tools

    session = "recommendation-add-memory"
    cart_manager.add_item(session, "119", "Bánh Trung Thu Cà Phê Lava", 99000)
    cart_manager.set_checkout_context(session, last_product_suggestions=[
        {"product_id": "120", "product_name": "Bánh Trung Thu Matcha", "category": "food"},
        {"product_id": "121", "product_name": "Bánh Trung Thu Đậu Xanh", "category": "food"},
    ])
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda _session: cart_manager.get_cart(_session))
    monkeypatch.setattr(product_tools, "execute_get_product_options", lambda _name: {
        "status": "ok", "product_name": "Bánh Trung Thu Matcha", "options": {},
    })
    monkeypatch.setattr(product_tools, "execute_check_price_and_stock", lambda **_kwargs: {
        "status": "ok", "products": [{"product_id": "120", "product_name": "Bánh Trung Thu Matcha", "final_price": 99000}],
    })
    seen = []

    def fake_add(**kwargs):
        seen.append(kwargs["product_name"])
        cart = cart_manager.add_item(
            session, kwargs["product_id"], kwargs["product_name"], kwargs["unit_price"],
            quantity=kwargs.get("quantity", 1),
        )
        return {"status": "ok", "cart": cart, "persisted_line": cart["items"][-1]}

    monkeypatch.setattr(cart_tools, "execute_add_to_cart", fake_add)

    result = run_order_flow(session, "cho tôi thêm bánh số 1 vào giỏ nhé")
    assert "Bánh Trung Thu Matcha" in result["reply"]
    assert seen == ["Bánh Trung Thu Matcha"]


def test_context_keeps_drink_ordinal_when_follow_up_focus_is_a_pizza():
    from src.agents.order_flow_graph import _contextualize_product_references

    session = "cross-category-context"
    cart_manager.set_checkout_context(session,
        product_suggestion_snapshots={
            "drink": [{"product_name": "1 Lít Matcha Latte Tây Bắc", "category": "drink"}],
            "food": [{"product_name": "Soft Pizza Chà Bông Trứng Cút", "category": "food"}],
        },
        last_product_focus={"product_name": "Soft Pizza Chà Bông Trứng Cút", "category": "food"},
    )
    message, history = _contextualize_product_references(session, "oke cho tôi nước số 1 và bánh này nhé", [])
    # Contextualization may replace a demonstrative with typed focus, but it
    # must never manufacture a numbered assistant-history list for a write.
    assert "Soft Pizza Chà Bông Trứng Cút" in message
    assert history == []


def test_check_price_and_stock_updates_last_product_focus(monkeypatch):
    from src.agents.order_flow_graph import _render
    from src.function_calling.tools import cart_tools

    session = "focus-from-price-check"
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda _session: cart_manager.get_cart(_session))
    logs = [{"tool": "check_price_and_stock", "result": {"status": "ok", "products": [
        {"product_id": "P1", "product_name": "Soft Pizza Chà Bông Trứng Cút", "category": "Bánh Mặn"},
    ]}}]
    _render({"session_id": session, "result": {"tool_calls_log": logs}})
    focus = cart_manager.get_checkout_prefs(session).get("last_product_focus")
    assert focus["product_name"] == "Soft Pizza Chà Bông Trứng Cút"
    assert focus["category"] == "food"


def test_structured_resolver_handles_ordinal_and_demonstrative_directly(monkeypatch):
    from src.agents.order_flow_graph import _resolve_typed_references

    session = "structured-resolver-direct"
    cart_manager.set_active_list_context(
        session, "PRODUCT", mode="GROUPED", groups={
            "DRINK": [{"product_id": "D1", "product_name": "1 Lít Matcha Latte Tây Bắc", "category": "drink"}],
            "FOOD": [{"product_id": "F1", "product_name": "Bánh Trung Thu Cà Phê Lava", "category": "food"}],
        },
    )
    cart_manager.set_focus(session, {
        "domain": "PRODUCT", "entity_id": "F2",
        "label": "Soft Pizza Chà Bông Trứng Cút", "category": "food",
    })
    resolved = _resolve_typed_references(session, "oke vậy cho tôi nước số 1 và bánh này nhé")
    assert resolved["status"] == "resolved"
    assert [item["product_name"] for item in resolved["items"]] == [
        "1 Lít Matcha Latte Tây Bắc", "Soft Pizza Chà Bông Trứng Cút",
    ]


def test_structured_resolver_does_not_map_on_category_mismatch():
    from src.agents.order_flow_graph import _resolve_structured_references

    session = "mismatch-no-map"
    cart_manager.set_checkout_context(
        session,
        last_product_focus={"product_id": "F1", "product_name": "Bánh Trung Thu", "category": "food"},
    )
    assert _resolve_structured_references(session, "cho tôi nước này") is None


def test_structured_resolver_falls_back_to_none_when_state_missing():
    from src.agents.order_flow_graph import _resolve_structured_references

    assert _resolve_structured_references("no-state-at-all", "cho tôi nước số 1 và bánh này") is None


def test_latest_mixed_search_list_wins_over_stale_food_numbering():
    from src.agents.order_flow_graph import _resolve_structured_references

    session = "latest-mixed-numbering"
    cart_manager.set_checkout_context(
        session,
        product_suggestion_snapshots={
            "food": [
                {"product_id": "119", "product_name": "Bánh Trung Thu Cà Phê Lava", "category": "food"},
                {"product_id": "122", "product_name": "Bánh Trung Thu Bát Bửu", "category": "food"},
                {"product_id": "22", "product_name": "Bánh Chuối", "category": "food"},
            ],
        },
        last_product_suggestions=[
            {"product_id": "61", "product_name": "1 Lít Matcha Latte Tây Bắc", "category": "drink"},
            {"product_id": "62", "product_name": "1 Lít Matcha Latte Yến Mạch", "category": "drink"},
            {"product_id": "120", "product_name": "Bánh Trung Thu Matcha", "category": "food"},
            {"product_id": "63", "product_name": "Coco Matcha Foam", "category": "drink"},
        ],
    )

    resolved = _resolve_structured_references(session, "cho tôi bánh số 3 số lượng 2 cái nhé")
    assert resolved and resolved[0]["product_id"] == "120"


def test_latest_combined_catalog_resolves_drink_and_cake_ordinals_together():
    """A mixed reply has one visible numbering namespace for both families."""
    from src.agents.order_flow_graph import _resolve_structured_references

    session = "combined-menu-two-ordinals"
    cart_manager.set_checkout_context(session, last_product_suggestions=[
        {"product_id": "D1", "product_name": "Nước Một", "category": "drink"},
        {"product_id": "F2", "product_name": "Bánh Hai", "category": "food"},
    ])

    resolved = _resolve_structured_references(session, "cho tôi nước số 1 và bánh số 2 đi")
    assert [item["product_id"] for item in resolved or []] == ["D1", "F2"]


def test_legacy_flat_snapshot_still_resolves_numbered_cake_by_name():
    from src.agents.order_flow_graph import _resolve_structured_references

    session = "legacy-flat-mixed-numbering"
    cart_manager.set_checkout_context(
        session,
        product_suggestion_snapshots={
            "food": [{"product_id": "119", "product_name": "Bánh Trung Thu Cà Phê Lava", "category": "food"}],
        },
        last_product_suggestions=[
            {"product_id": "61", "product_name": "1 Lít Matcha Latte Tây Bắc", "category": "all"},
            {"product_id": "62", "product_name": "1 Lít Matcha Latte Yến Mạch", "category": "all"},
            {"product_id": "120", "product_name": "Bánh Trung Thu Matcha", "category": "all"},
        ],
    )

    resolved = _resolve_structured_references(session, "lấy bánh số 3")
    assert resolved and resolved[0]["product_id"] == "120"


def test_structured_resolver_keeps_all_exact_products_when_cart_is_empty(monkeypatch):
    from src.agents.order_flow_graph import run_order_flow
    from src.agents import agent_service
    from src.function_calling.tools import cart_tools, product_tools

    session = "structured-empty-cart"
    cart_manager.set_checkout_context(
        session,
        product_suggestion_snapshots={
            "drink": [{"product_id": "D1", "product_name": "Nước Một", "category": "drink"}],
            "food": [{"product_id": "F1", "product_name": "Bánh Cũ", "category": "food"}],
        },
        last_product_focus={"product_id": "F2", "product_name": "Soft Pizza", "category": "food"},
    )
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda _session: cart_manager.get_cart(_session))
    monkeypatch.setattr(agent_service, "_handle_additional_product", lambda _session, _name: None)
    monkeypatch.setattr(product_tools, "execute_get_product_options", lambda name: {
        "status": "ok",
        "product_name": name,
        "options": {"Kích thước": ["Nhỏ", "Lớn"]},
    })

    result = run_order_flow(session, "cho tôi nước số 1 và bánh này")
    pending = cart_manager.get_checkout_prefs(session).get("pending_products") or []
    assert [item["product_name"] for item in pending] == ["Nước Một", "Soft Pizza"]
    assert "Nước Một" in result["reply"]
    assert "Soft Pizza" in result["reply"]
