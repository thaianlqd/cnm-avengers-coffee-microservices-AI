from src.agents.order_flow_graph import (
    run_order_flow, _resolve_cart_line, _update_cart_focus_after_add,
    _store_cart_line_choice, _resolve_pending_cart_line,
)
from src.common import cart_manager


def _seed_variants(session: str):
    cart_manager.replace_items_from_order_cart(session, [
        {
            "id": 101,
            "ma_san_pham": "P1",
            "ten_san_pham": "Trà Sữa",
            "gia_ban": 39000,
            "so_luong": 1,
            "size": "M",
        },
        {
            "id": 102,
            "ma_san_pham": "P1",
            "ten_san_pham": "Trà Sữa",
            "gia_ban": 45000,
            "so_luong": 1,
            "size": "L",
        },
    ])


def test_last_cart_focus_set_after_adding_item(monkeypatch):
    from src.function_calling.tools import cart_tools

    session = "focus-after-add"
    cart_manager.replace_items_from_order_cart(session, [{
        "id": 77,
        "ma_san_pham": "P1",
        "ten_san_pham": "Bánh Trung Thu",
        "gia_ban": 99000,
        "so_luong": 1,
    }])
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda _session: cart_manager.get_cart(_session))
    _update_cart_focus_after_add(session)
    assert cart_manager.get_checkout_prefs(session).get("last_cart_focus") == "77"


def test_resolve_cart_line_requires_variant_choice_even_when_family_was_focused():
    session = "multi-variant-focus"
    _seed_variants(session)
    cart = cart_manager.get_cart(session)

    item, error = _resolve_cart_line(cart, "đổi topping trà sữa")
    assert item is None and error is not None

    cart_manager.set_checkout_context(session, last_cart_focus="102")
    item, error = _resolve_cart_line(cart_manager.get_cart(session), "đổi topping trà sữa")
    assert item is None
    assert "nhiều biến thể" in error

    item, error = _resolve_cart_line(cart_manager.get_cart(session), "đổi topping món này")
    assert error is None and str(item["cart_item_id"]) == "102"


def test_ambiguous_cart_operation_keeps_typed_line_snapshot_and_resumes_by_ordinal():
    session = "typed-cart-line-choice"
    _seed_variants(session)
    cart = cart_manager.get_cart(session)
    candidates = [row for row in cart["items"] if row["product_name"] == "Trà Sữa"]
    prompt = _store_cart_line_choice(session, "SET_QUANTITY", 3, candidates)
    pending = cart_manager.get_pending_action(session)

    assert "1. Trà Sữa (M)" in prompt and "2. Trà Sữa (L)" in prompt
    assert pending["params"]["operation"] == "SET_QUANTITY"
    assert pending["params"]["requested_value"] == 3
    assert pending["params"]["candidate_line_ids"] == ["101", "102"]
    resumed = _resolve_pending_cart_line(session, "dòng số 2", cart)
    assert resumed["operation"] == "SET_QUANTITY"
    assert resumed["requested_value"] == 3
    assert str(resumed["row"]["cart_item_id"]) == "102"


def test_cart_family_disambiguation_lists_only_matching_variants():
    session = "cart-family-candidates"
    _seed_variants(session)
    cart_manager.replace_items_from_order_cart(session, [
        *cart_manager.get_cart(session)["items"],
        {"id": 103, "ma_san_pham": "P2", "ten_san_pham": "Bánh Matcha", "gia_ban": 49000, "so_luong": 1},
    ])
    cart = cart_manager.get_cart(session)
    item, error = _resolve_cart_line(cart, "xóa trà sữa")
    assert item is None and "Bánh Matcha" not in error


def test_edit_options_intent_asks_which_change_not_silent_llm_fallback(monkeypatch):
    from src.function_calling.tools import cart_tools

    session = "edit-options-flow"
    cart_manager.replace_items_from_order_cart(session, [{
        "id": 88,
        "ma_san_pham": "P1",
        "ten_san_pham": "Trà Sữa",
        "gia_ban": 39000,
        "so_luong": 1,
        "size": "M",
    }])
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda _session: cart_manager.get_cart(_session))
    result = run_order_flow(session, "đổi topping trà sữa")
    assert "Bạn muốn đổi gì cho Trà Sữa" in result["reply"]
    assert [row["tool"] for row in result.get("tool_calls_log") or []] == ["get_product_options"]
    assert cart_manager.get_checkout_prefs(session).get("last_cart_focus") == "88"


def test_edit_options_follow_up_patches_the_focused_cart_line(monkeypatch):
    from src.function_calling.tools import cart_tools, product_tools

    session = "edit-options-follow-up"
    cart_manager.replace_items_from_order_cart(session, [{
        "id": 89,
        "ma_san_pham": "P1",
        "ten_san_pham": "Trà Sữa",
        "gia_ban": 39000,
        "so_luong": 1,
        "size": "M",
        "toppings": ["Hạt Sen"],
    }])
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda _session: cart_manager.get_cart(_session))
    monkeypatch.setattr(product_tools, "execute_get_product_options", lambda _name: {
        "status": "ok",
        "options": {"Topping": ["Hạt Sen", "Trân châu trắng"]},
    })
    changed = []

    def fake_update(_session, line_id, desired):
        changed.append((line_id, desired))
        return {
            "status": "ok",
            "cart": cart_manager.get_cart(_session),
            "quote": {"subtotal": 39000, "discount_amount": 0, "final_total": 39000},
        }

    monkeypatch.setattr(cart_tools, "execute_update_cart_item", fake_update)
    first = run_order_flow(session, "đổi topping trà sữa")
    assert "Bạn muốn đổi gì" in first["reply"]
    second = run_order_flow(session, "trân châu trắng nhé")

    assert changed[0][0] == "89"
    assert changed[0][1]["toppings"] == ["Trân châu trắng"]
    assert "Đã cập nhật tùy chọn" in second["reply"]
    assert cart_manager.get_pending_action(session) is None


def test_remove_item_natural_phrasing_not_sent_to_llm():
    from src.agents.tier1 import classify_order_intent

    assert classify_order_intent("không lấy sp đó nữa", None)["intent"] == "REMOVE_ITEM"
    assert classify_order_intent("bỏ cái này đi", None)["intent"] == "REMOVE_ITEM"
    assert classify_order_intent("thôi món đó", None)["intent"] == "REMOVE_ITEM"


def test_remove_item_phrasing_false_positive_guard():
    from src.agents.tier1 import classify_order_intent

    harmless = [
        "thôi để lát mình chọn sau",
        "không lấy địa chỉ đó nữa",
        "bỏ qua voucher đi",
        "thôi không cần tư vấn nữa",
        "để tôi suy nghĩ thêm",
    ]
    assert all(classify_order_intent(message, None)["intent"] != "REMOVE_ITEM" for message in harmless)


def test_long_cart_conversation_add_more_then_change_quantity_and_topping(monkeypatch):
    from src.function_calling.tools import cart_tools, product_tools

    session = "long-cart-conversation"

    def replace(rows):
        return cart_manager.replace_items_from_order_cart(session, rows)

    replace([
        {"id": 1, "ma_san_pham": "119", "ten_san_pham": "Bánh Trung Thu Cà Phê Lava", "gia_ban": 99000, "so_luong": 1, "size": "Nhỏ"},
        {"id": 2, "ma_san_pham": "201", "ten_san_pham": "1 Lít Matcha Latte Tây Bắc", "gia_ban": 105000, "so_luong": 1, "size": "Vừa", "toppings": ["Trân châu trắng"]},
    ])
    cart_manager.set_checkout_context(session, product_suggestion_snapshots={
        "food": [
            {"product_id": "119", "product_name": "Bánh Trung Thu Cà Phê Lava", "category": "food"},
            {"product_id": "122", "product_name": "Bánh Trung Thu Thập Cẩm Bát Bửu", "category": "food"},
            {"product_id": "121", "product_name": "Bánh Trung Thu Đậu Xanh", "category": "food"},
            {"product_id": "120", "product_name": "Bánh Trung Thu Matcha", "category": "food"},
        ],
    })
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda _session: cart_manager.get_cart(_session))

    monkeypatch.setattr(product_tools, "execute_get_product_options", lambda _name: {
        "status": "ok", "product_name": "Bánh Trung Thu Matcha", "options": {"Kích thước": ["Nhỏ"]},
    })
    monkeypatch.setattr(product_tools, "execute_check_price_and_stock", lambda **_kwargs: {
        "status": "ok", "products": [{
            "product_id": "120", "product_name": "Bánh Trung Thu Matcha", "final_price": 99000,
        }],
    })

    def fake_add(**kwargs):
        assert kwargs["product_name"] == "Bánh Trung Thu Matcha"
        cart = replace([
            {"id": 1, "ma_san_pham": "119", "ten_san_pham": "Bánh Trung Thu Cà Phê Lava", "gia_ban": 99000, "so_luong": 1, "size": "Nhỏ"},
            {"id": 2, "ma_san_pham": "201", "ten_san_pham": "1 Lít Matcha Latte Tây Bắc", "gia_ban": 105000, "so_luong": 1, "size": "Vừa", "toppings": ["Trân châu trắng"]},
            {"id": 3, "ma_san_pham": "120", "ten_san_pham": "Bánh Trung Thu Matcha", "gia_ban": 99000, "so_luong": 1, "size": "Nhỏ"},
        ])
        return {
            "status": "ok", "persisted_line": {"id": 3}, "cart": cart,
        }

    monkeypatch.setattr(cart_tools, "execute_add_to_cart", fake_add)
    added = run_order_flow(session, "cho tôi thêm bánh số 4 vào giỏ nhé")
    assert "Bánh Trung Thu Matcha" in added["reply"]
    assert cart_manager.get_checkout_prefs(session).get("last_cart_focus") == "3"

    def current_server_rows():
        return [
            {
                "id": row["cart_item_id"],
                "ma_san_pham": row["product_id"],
                "ten_san_pham": row["product_name"],
                "gia_ban": row["unit_price"],
                "so_luong": row["quantity"],
                "size": row.get("size"),
                "toppings": row.get("toppings") or [],
                "luong_da": row.get("luong_da"),
                "do_ngot": row.get("do_ngot"),
                "loai_sua": row.get("loai_sua"),
            }
            for row in cart_manager.get_cart(session)["items"]
        ]

    def fake_update(_session, line_id, desired):
        rows = current_server_rows()
        target = next(row for row in rows if str(row["id"]) == str(line_id))
        if "quantity" in desired:
            target["so_luong"] = desired["quantity"]
        for key in ("size", "toppings", "luong_da", "do_ngot", "loai_sua"):
            if key in desired:
                target[key] = desired[key]
        cart = replace(rows)
        subtotal = sum(float(row["gia_ban"]) * int(row["so_luong"]) for row in rows)
        return {"status": "ok", "cart": cart, "quote": {"subtotal": subtotal, "discount_amount": 0, "final_total": subtotal}}

    monkeypatch.setattr(cart_tools, "execute_update_cart_item", fake_update)
    quantity = run_order_flow(session, "cho số lượng Bánh Trung Thu Matcha trong giỏ về 2")
    assert any(row["tool"] == "update_cart_item" for row in quantity["tool_calls_log"])
    assert next(row for row in cart_manager.get_cart(session)["items"] if row["cart_item_id"] == 3)["quantity"] == 2

    monkeypatch.setattr(product_tools, "execute_get_product_options", lambda _name: {
        "status": "ok",
        "options": {"Topping": ["Trân châu trắng", "Hạt Sen", "Foam Dừa"]},
    })
    ask = run_order_flow(session, "đổi topping của 1 Lít Matcha Latte Tây Bắc trong giỏ")
    assert "Bạn muốn đổi gì" in ask["reply"]
    changed = run_order_flow(session, "đổi thành Hạt Sen và Foam Dừa")
    assert any(row["tool"] == "update_cart_item" for row in changed["tool_calls_log"])
    drink = next(row for row in cart_manager.get_cart(session)["items"] if row["cart_item_id"] == 2)
    assert set(drink["toppings"]) == {"Hạt Sen", "Foam Dừa"}
    assert len(cart_manager.get_cart(session)["items"]) == 3


def test_real_transcript_add_two_matcha_cakes_does_not_increment_bat_buu(monkeypatch):
    from src.function_calling.tools import cart_tools, product_tools

    session = "transcript-add-matcha-two"
    cart_manager.replace_items_from_order_cart(session, [
        {"id": 1, "ma_san_pham": "201", "ten_san_pham": "1 Lít Matcha Latte Tây Bắc", "gia_ban": 115000, "so_luong": 1, "size": "Vừa"},
        {"id": 2, "ma_san_pham": "122", "ten_san_pham": "Bánh Trung Thu Thập Cẩm Bát Bửu", "gia_ban": 119000, "so_luong": 1, "size": "Nhỏ"},
    ])
    cart_manager.set_checkout_context(session, product_suggestion_snapshots={
        "food": [{"product_id": "120", "product_name": "Bánh Trung Thu Matcha", "category": "food"}],
    })
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda _session: cart_manager.get_cart(_session))
    monkeypatch.setattr(product_tools, "execute_get_product_options", lambda _name: {
        "status": "ok", "product_name": "Bánh Trung Thu Matcha", "options": {"Kích thước": ["Nhỏ"]},
    })
    monkeypatch.setattr(product_tools, "execute_check_price_and_stock", lambda **_kwargs: {
        "status": "ok",
        "products": [{
            "product_id": "120", "product_name": "Bánh Trung Thu Matcha",
            "final_price": 99000, "category": "Bánh Trung Thu", "in_stock": True,
        }],
    })

    def fake_add(**kwargs):
        cart = cart_manager.add_item(
            session,
            kwargs["product_id"],
            kwargs["product_name"],
            kwargs["unit_price"],
            quantity=kwargs.get("quantity", 1),
            size=kwargs.get("size"),
        )
        persisted = next(row for row in cart["items"] if row["product_id"] == "120")
        return {"status": "ok", "cart": cart, "persisted_line": persisted}

    monkeypatch.setattr(cart_tools, "execute_add_to_cart", fake_add)

    lookup = run_order_flow(session, "ở đây có bánh trung thu matcha không bạn")
    assert "Món chưa được thêm vào giỏ" in lookup["reply"]
    assert cart_manager.get_checkout_prefs(session)["last_product_focus"]["product_id"] == "120"

    added = run_order_flow(session, "oke thêm cho tôi đi số lượng 2 cái nhé")
    rows = {row["product_id"]: row for row in cart_manager.get_cart(session)["items"]}
    assert rows["122"]["quantity"] == 1
    assert rows["120"]["quantity"] == 2
    assert any(row["tool"] == "add_to_cart" and row["result"]["status"] == "ok" for row in added["tool_calls_log"])
    assert "Bánh Trung Thu Matcha x2" in added["reply"]


def test_real_transcript_banh_so_three_adds_latest_matcha_not_existing_lava(monkeypatch):
    from src.function_calling.tools import cart_tools, product_tools

    session = "transcript-latest-matcha-number-three"
    cart_manager.replace_items_from_order_cart(session, [
        {"id": 1, "ma_san_pham": "119", "ten_san_pham": "Bánh Trung Thu Cà Phê Lava", "gia_ban": 99000, "so_luong": 1, "size": "Nhỏ"},
        {"id": 2, "ma_san_pham": "61", "ten_san_pham": "1 Lít Matcha Latte Tây Bắc", "gia_ban": 115000, "so_luong": 1, "size": "Vừa"},
    ])
    cart_manager.set_checkout_context(
        session,
        product_suggestion_snapshots={
            "food": [{"product_id": "119", "product_name": "Bánh Trung Thu Cà Phê Lava", "category": "food"}],
        },
        last_product_suggestions=[
            {"product_id": "61", "product_name": "1 Lít Matcha Latte Tây Bắc", "category": "drink"},
            {"product_id": "62", "product_name": "1 Lít Matcha Latte Yến Mạch", "category": "drink"},
            {"product_id": "120", "product_name": "Bánh Trung Thu Matcha", "category": "food"},
        ],
    )
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda _session: cart_manager.get_cart(_session))
    monkeypatch.setattr(product_tools, "execute_get_product_options", lambda _name: {
        "status": "ok", "product_name": "Bánh Trung Thu Matcha", "options": {"Kích thước": ["Nhỏ"]},
    })
    monkeypatch.setattr(product_tools, "execute_check_price_and_stock", lambda **_kwargs: {
        "status": "ok", "products": [{
            "product_id": "120", "product_name": "Bánh Trung Thu Matcha", "final_price": 99000,
        }],
    })

    def fake_add(**kwargs):
        cart = cart_manager.add_item(
            session, kwargs["product_id"], kwargs["product_name"], kwargs["unit_price"],
            quantity=kwargs.get("quantity", 1), size=kwargs.get("size"),
        )
        persisted = next(row for row in cart["items"] if row["product_id"] == "120")
        return {"status": "ok", "cart": cart, "persisted_line": persisted}

    monkeypatch.setattr(cart_tools, "execute_add_to_cart", fake_add)
    result = run_order_flow(session, "cho tôi bánh số 3 số lượng 2 cái nhé")

    rows = {row["product_id"]: row for row in cart_manager.get_cart(session)["items"]}
    assert rows["119"]["quantity"] == 1
    assert rows["120"]["quantity"] == 2
    assert "Bánh Trung Thu Matcha x2" in result["reply"]


def test_short_named_quantity_correction_updates_only_lava(monkeypatch):
    from src.function_calling.tools import cart_tools

    session = "transcript-correct-lava-one"
    cart_manager.replace_items_from_order_cart(session, [
        {"id": 1, "ma_san_pham": "119", "ten_san_pham": "Bánh Trung Thu Cà Phê Lava", "gia_ban": 99000, "so_luong": 2, "size": "Nhỏ"},
        {"id": 2, "ma_san_pham": "120", "ten_san_pham": "Bánh Trung Thu Matcha", "gia_ban": 99000, "so_luong": 2, "size": "Nhỏ"},
    ])
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda _session: cart_manager.get_cart(_session))

    def fake_update(_session, line_id, desired):
        rows = []
        for row in cart_manager.get_cart(session)["items"]:
            rows.append({
                "id": row["cart_item_id"], "ma_san_pham": row["product_id"],
                "ten_san_pham": row["product_name"], "gia_ban": row["unit_price"],
                "so_luong": desired["quantity"] if str(row["cart_item_id"]) == str(line_id) else row["quantity"],
                "size": row.get("size"),
            })
        cart = cart_manager.replace_items_from_order_cart(session, rows)
        subtotal = sum(row["unit_price"] * row["quantity"] for row in cart["items"])
        return {"status": "ok", "cart": cart, "quote": {"subtotal": subtotal, "final_total": subtotal}}

    monkeypatch.setattr(cart_tools, "execute_update_cart_item", fake_update)
    result = run_order_flow(session, "cho tôi bánh trung thu cà phê 1 cái thôi")

    rows = {row["product_id"]: row for row in cart_manager.get_cart(session)["items"]}
    assert rows["119"]["quantity"] == 1
    assert rows["120"]["quantity"] == 2
    assert result["tool_calls_log"][0]["tool"] == "update_cart_item"


def test_finish_cart_always_offers_voucher_before_checkout_choices(monkeypatch):
    from src.function_calling.tools import cart_tools, voucher_tools

    session = "voucher-hard-gate"
    cart_manager.replace_items_from_order_cart(session, [{
        "id": 1, "ma_san_pham": "120", "ten_san_pham": "Bánh Trung Thu Matcha",
        "gia_ban": 99000, "so_luong": 1, "size": "Nhỏ",
    }])
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda _session: cart_manager.get_cart(_session))
    monkeypatch.setattr(voucher_tools, "execute_get_applicable_vouchers", lambda _session: {
        "status": "ok",
        "vouchers": [{"ma_voucher": "BEST10", "ten_voucher": "Giảm tốt nhất", "so_tien_giam_du_kien": 10000}],
    })

    result = run_order_flow(session, "tiến hành đặt hàng đi")
    assert result["conversation_state"] == "VOUCHER"
    assert "BEST10" in result["reply"]
    assert "Hình thức nhận hàng" not in result["reply"]
    assert "Phương thức thanh toán" not in result["reply"]


def test_voucher_question_never_falls_into_product_price_parser(monkeypatch):
    from src.function_calling.tools import cart_tools, voucher_tools

    session = "voucher-not-product-price"
    cart_manager.replace_items_from_order_cart(session, [{
        "id": 1, "ma_san_pham": "120", "ten_san_pham": "Bánh Trung Thu Matcha",
        "gia_ban": 99000, "so_luong": 2,
    }])
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda _session: cart_manager.get_cart(_session))
    monkeypatch.setattr(voucher_tools, "execute_get_applicable_vouchers", lambda _session: {
        "status": "ok", "vouchers": [],
        "ineligible": [{"ma_voucher": "OLD", "reason": "Mã đã hết hạn"}],
    })

    result = run_order_flow(session, "tôi có mã giảm giá nào không? áp dụng mã tốt nhất cho tôi")
    assert "không có mã còn hạn" in result["reply"].lower()
    assert "sản phẩm" not in result["reply"].lower()
    assert result["tool_calls_log"][0]["tool"] == "get_applicable_vouchers"


def test_read_only_model_claim_cannot_fake_an_add(monkeypatch):
    from src.agents import agent_service
    from src.function_calling.tools import cart_tools

    session = "guard-fake-add-claim"
    cart_manager.replace_items_from_order_cart(session, [{
        "id": 2, "ma_san_pham": "122", "ten_san_pham": "Bánh Bát Bửu",
        "gia_ban": 119000, "so_luong": 1,
    }])
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda _session: cart_manager.get_cart(_session))
    monkeypatch.setattr(agent_service, "_run_agent_impl", lambda *_args, **_kwargs: {
        "reply": "Mình sẽ thêm 2 Bánh Matcha vào giỏ. Giỏ hàng hiện tại sẽ là 317.000đ.",
        "checkout_payload": None,
        "tool_calls_log": [{"tool": "check_price_and_stock", "result": {"status": "ok", "products": []}}],
        "error": None,
    })

    result = run_order_flow(session, "làm như vậy nhé")
    assert not any(entry.get("tool") == "add_to_cart" for entry in result["tool_calls_log"])
    assert len(cart_manager.get_cart(session)["items"]) == 1
