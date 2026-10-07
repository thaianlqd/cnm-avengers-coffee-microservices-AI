"""Regression tests for:
1. Direct addition with quantity > 1 rendering in prompt prefix (Turn 12:06: 'nước số 2 và bánh số 3 2 cái').
2. Compound cart edits with telex typo 'bôtpping' (Turn 12:11: 'bỏ món số 4 cho tôi, món số 3 tăng lên 4 ly đi bạn, còn món số 2 thì bôtpping foam dừa cho tôi').
"""
from copy import deepcopy
import pytest

from test_llm_tool_orchestrator import runtime
from test_checkout_guarded_contract import calls, gateway
from src.agents.cart_edit_evidence import edit_clauses, edit_plan, clause_operation
from src.agents.shopping_language import normalize_shopping
from src.agents.option_state import specific_removed_toppings
from src.common import cart_manager
from src.function_calling.tools import product_tools


def test_telex_typo_botopping_normalization():
    typos = [
        "bôtpping foam dừa cho tôi",
        "botpping foam dừa cho tôi",
        "bopping foam dừa cho tôi",
        "botopping foam dừa cho tôi",
        "botoping foam dừa cho tôi",
    ]
    for typo in typos:
        norm = normalize_shopping(typo)
        assert "bo topping foam dua" in norm, f"Failed for {typo}: got {norm}"


def test_turn_12_11_edit_plan_and_execution(runtime, monkeypatch):
    """
    Test turn 12:11:
    'bỏ món số 4 cho tôi, món số 3 tăng lên 4 ly đi bạn, còn món số 2 thì bôtpping foam dừa cho tôi'
    Cart:
    1. Bánh Trung Thu Matcha x2
    2. Frappe Matcha Tây Bắc x1 (Topping: Hạt Sen, Foam Dừa)
    3. Bạc Xỉu Nóng x1
    4. Cà Phê Đen Nóng x1
    """
    msg = "bỏ món số 4 cho tôi, món số 3 tăng lên 4 ly đi bạn, còn món số 2 thì bôtpping foam dừa cho tôi"
    lines = [
        {"id": 801, "cart_item_id": "801", "display_index": 1, "product_name": "Bánh Trung Thu Matcha", "product_id": "101",
         "quantity": 2, "size": "Nhỏ", "toppings": [], "final_price": 99000},
        {"id": 802, "cart_item_id": "802", "display_index": 2, "product_name": "Frappe Matcha Tây Bắc", "product_id": "102",
         "quantity": 1, "size": "Lớn", "do_ngot": "Ít ngọt", "toppings": ["Hạt Sen", "Foam Dừa"], "final_price": 95000},
        {"id": 803, "cart_item_id": "803", "display_index": 3, "product_name": "Bạc Xỉu Nóng", "product_id": "103",
         "quantity": 1, "size": "Vừa", "toppings": [], "final_price": 39000},
        {"id": 804, "cart_item_id": "804", "display_index": 4, "product_name": "Cà Phê Đen Nóng", "product_id": "104",
         "quantity": 1, "size": "Vừa", "toppings": [], "final_price": 39000},
    ]

    cart_manager.replace_items_from_order_cart(runtime.sid, deepcopy(lines))

    # Test edit clauses and plan extraction
    clauses = edit_clauses(msg, lines)
    assert len(clauses) == 3
    plan = edit_plan(msg, lines)
    assert len(plan) == 3
    assert plan[0]["tool"] == "remove_cart_item" and plan[0]["cart_item_id"] == "804"
    assert plan[1]["tool"] == "update_cart_item" and plan[1]["cart_item_id"] == "803" and plan[1]["fields"] == ["quantity"]
    assert plan[2]["tool"] == "update_cart_item" and plan[2]["cart_item_id"] == "802" and plan[2]["fields"] == ["toppings"]

    # Mock option groups for Frappe Matcha Tây Bắc
    groups = [
        {"name": "Kích thước", "values": ["Nhỏ", "Vừa", "Lớn"], "required": True},
        {"name": "Topping", "values": ["Hạt Sen", "Foam Dừa", "Trái Vải", "Shot Espresso"], "multiple": True},
        {"name": "Độ ngọt", "values": ["Ít ngọt", "Thêm ngọt", "Bình thường"]}
    ]
    monkeypatch.setattr(product_tools, "execute_get_product_options", lambda product_id, **kwargs:
        dict(status="ok", product_id=product_id, product_name="Frappe Matcha Tây Bắc", option_groups=deepcopy(groups)))

    # Dispatch tool calls through GuardedToolGateway
    gw = gateway(runtime, msg)

    # 1. Update món 3: increase to 4
    res3 = gw.dispatch("update_cart_item", {
        "cart_item_id": "803",
        "cart_line_ordinal": 3,
        "desired_state": {"quantity": 4}
    })
    assert res3.get("status") in {"ok", "already_processed"}

    # 2. Update món 2: remove topping Foam Dừa (even if model passed partial or empty values)
    res2 = gw.dispatch("update_cart_item", {
        "cart_item_id": "802",
        "cart_line_ordinal": 2,
        "desired_state": {"toppings": ["Hạt Sen"]}
    })
    assert res2.get("status") in {"ok", "already_processed"}

    # 3. Model calling update_cart_item for món 4 (planned for removal) -> automatically redirects to remove
    res4 = gw.dispatch("update_cart_item", {
        "cart_item_id": "804",
        "cart_line_ordinal": 4,
        "desired_state": {"quantity": 1}
    })
    assert res4.get("status") in {"ok", "already_processed"}

    # Verify final cart state
    items = cart_manager.get_cart(runtime.sid)["items"]
    assert len(items) == 3
    # Món 4 (Cà Phê Đen Nóng) must be removed
    assert not any(r["product_name"] == "Cà Phê Đen Nóng" for r in items)
    # Món 3 (Bạc Xỉu Nóng) must be 4
    bac_xiu = next(r for r in items if r["product_name"] == "Bạc Xỉu Nóng")
    assert bac_xiu["quantity"] == 4
    # Món 2 (Frappe Matcha Tây Bắc) must have Foam Dừa removed, Hạt Sen kept
    frappe = next(r for r in items if r["product_name"] == "Frappe Matcha Tây Bắc")
    assert frappe["toppings"] == ["Hạt Sen"]


def test_turn_12_06_direct_added_quantity_in_prefix(runtime, monkeypatch):
    """
    Test turn 12:06:
    User message: 'cho tôi mua nước số 2 và bánh số 3 2 cái đi bạn'
    Drink: Frappe Matcha Tây Bắc (needs options)
    Food: Bánh Trung Thu Matcha (fixed/no options, added directly with quantity 2)
    Prefix must say: '**Bánh Trung Thu Matcha ×2**'
    """
    from src.agents.shopping_turn_control import customer_shopping_control
    from src.agents.product_display import numbered_products
    import json

    msg = "cho tôi mua nước số 2 và bánh số 3 2 cái đi bạn"
    drinks = [
        {"product_id": "201", "product_name": "Frappe Choco Chip", "category": "Frappe", "parent_category": "Đồ uống"},
        {"product_id": "202", "product_name": "Frappe Matcha Tây Bắc", "category": "Frappe", "parent_category": "Đồ uống",
         "option_schema": [
             {"name": "Kích thước", "values": ["Nhỏ", "Vừa", "Lớn"], "required": True},
             {"name": "Topping", "values": ["Hạt Sen", "Foam Dừa"], "multiple": True},
             {"name": "Độ ngọt", "values": ["Ít ngọt", "Thêm ngọt", "Bình thường"]}
         ]},
    ]
    cakes = [
        {"product_id": "301", "product_name": "Bánh Trung Thu Cà Phê Lava", "category": "Bánh Trung Thu", "parent_category": "Bánh & đồ ăn",
         "option_schema": [{"name": "Kích thước", "values": ["Nhỏ"], "required": False, "fixed": True}]},
        {"product_id": "302", "product_name": "Bánh Trung Thu Đậu Xanh", "category": "Bánh Trung Thu", "parent_category": "Bánh & đồ ăn",
         "option_schema": [{"name": "Kích thước", "values": ["Nhỏ"], "required": False, "fixed": True}]},
        {"product_id": "303", "product_name": "Bánh Trung Thu Matcha", "category": "Bánh Trung Thu", "parent_category": "Bánh & đồ ăn",
         "option_schema": [{"name": "Kích thước", "values": ["Nhỏ"], "required": False, "fixed": True}]},
    ]
    all_items = numbered_products(drinks + cakes)
    drink_item = all_items[1]
    cake_item = all_items[4]

    runtime.products = all_items
    gw = gateway(runtime, msg, filtered=False)
    gw.entry_products = all_items
    gw.entry_product_groups = {
        "drink": all_items[:2],
        "food": all_items[2:]
    }

    from src.function_calling import helpers
    from src.function_calling.tools import cart_tools
    monkeypatch.setattr(helpers, "_require_valid_session", lambda _sid: "customer")
    monkeypatch.setattr(cart_tools, "execute_add_to_cart", lambda *args, **kwargs:
        {"status": "ok", "message": "Đã thêm vào giỏ hàng"})
    monkeypatch.setattr(product_tools, "execute_check_price_and_stock", lambda **kwargs:
        {"status": "ok", "products": [{"product_id": "303", "final_price": 99000, "is_active": True}]})
    monkeypatch.setattr(product_tools, "execute_get_product_options", lambda product_id, **kwargs:
        dict(status="ok", product_id=product_id,
             product_name="Frappe Matcha Tây Bắc" if product_id == "202" else "Bánh Trung Thu Matcha",
             option_groups=drink_item["option_schema"] if product_id == "202" else cake_item["option_schema"]))

    ctrl = customer_shopping_control(gw)
    assert ctrl is not None
    assert gw.artifacts.pending_selection_reply is not None
    assert "**Bánh Trung Thu Matcha ×2**" in gw.artifacts.pending_selection_reply
    assert "Frappe Matcha Tây Bắc" in gw.artifacts.pending_selection_reply
