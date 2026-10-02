"""Regression contracts for order-to-checkout exception recovery."""
import uuid

import pytest

from src.agents import agent_service, order_flow_graph
from src.agents.option_state import pending_product_quantity
from src.common import cart_manager
from src.function_calling.tools import cart_tools, product_tools


DRINK = "Americano Phúc Bồn Tử"
DRINK_ID = "AM-PBT"
OPTIONS = {
    "status": "ok",
    "product_id": DRINK_ID,
    "product_name": DRINK,
    "options": {
        "Kích thước": ["Nhỏ", "Vừa", "Lớn"],
        "Topping": ["Hạt Sen", "Trái Vải"],
        "Lượng đá": ["Bình thường", "Ít đá"],
    },
    "option_groups": [
        {"name": "Kích thước", "values": ["Nhỏ", "Vừa", "Lớn"],
         "required": True, "multiple": False, "default_value": "Nhỏ"},
        {"name": "Topping", "values": ["Hạt Sen", "Trái Vải"],
         "required": False, "multiple": True},
        {"name": "Lượng đá", "values": ["Bình thường", "Ít đá"],
         "required": False, "multiple": False, "default_value": "Bình thường"},
    ],
}


def _pending_session() -> str:
    session = "exception-recovery-" + uuid.uuid4().hex
    item = agent_service._pending_option_item(
        {"product_id": DRINK_ID, "product_name": DRINK, "quantity": 1}, OPTIONS,
    )
    cart_manager.set_pending_products(session, [item])
    cart_manager.set_pending_action(session, "fill_options", {"count": 1})
    return session


def test_pending_add_rejects_valid_and_invalid_toppings_as_one_atomic_group(monkeypatch):
    session = _pending_session()
    monkeypatch.setattr(
        product_tools,
        "execute_check_price_and_stock",
        lambda **_kwargs: pytest.fail("invalid option request reached price lookup"),
    )
    monkeypatch.setattr(
        cart_tools,
        "execute_add_to_cart",
        lambda **_kwargs: pytest.fail("invalid option request reached cart write"),
    )

    result = agent_service._complete_pending_products_from_options(
        session, "size Lớn, ít đá, thêm topping Hạt Sen và Foam Dừa",
    )

    assert "Foam Dừa" in result["reply"]
    assert "Hạt Sen" in result["reply"] and "Trái Vải" in result["reply"]
    pending = cart_manager.get_checkout_prefs(session)["pending_products"]
    selected = pending[0]["selected_options"]
    assert selected["size"] == "Lớn" and selected["luong_da"] == "Ít đá"
    assert selected.get("toppings") in (None, [])
    assert cart_manager.get_cart(session)["is_empty"] is True


def test_corrected_topping_reuses_preserved_draft_and_operation_identity(monkeypatch):
    session = _pending_session()
    price_calls, add_calls = [], []

    def price(**kwargs):
        price_calls.append(kwargs)
        return {"status": "ok", "products": [{
            "product_id": DRINK_ID, "product_name": DRINK, "final_price": 75000,
        }]}

    def add(**kwargs):
        add_calls.append(kwargs)
        cart = cart_manager.add_item(
            session, kwargs["product_id"], kwargs["product_name"], kwargs["unit_price"],
            quantity=kwargs["quantity"], size=kwargs["size"], toppings=kwargs["toppings"],
            luong_da=kwargs["luong_da"],
        )
        return {"status": "ok", "cart": cart}

    monkeypatch.setattr(product_tools, "execute_check_price_and_stock", price)
    monkeypatch.setattr(cart_tools, "execute_add_to_cart", add)

    first = agent_service._complete_pending_products_from_options(
        session, "size Lớn, ít đá, topping Hạt Sen và Foam Dừa",
    )
    held = cart_manager.get_checkout_prefs(session)["pending_products"][0]
    operation_id = held["operation_id"]
    assert "Foam Dừa" in first["reply"] and not price_calls and not add_calls

    second = agent_service._complete_pending_products_from_options(session, "topping Trái Vải")

    assert second["reply"].startswith("Mình đã thêm đủ 1 món")
    assert len(price_calls) == len(add_calls) == 1
    assert add_calls[0]["operation_id"] == operation_id
    assert add_calls[0]["size"] == "Lớn" and add_calls[0]["luong_da"] == "Ít đá"
    assert add_calls[0]["toppings"] == ["Trái Vải"]


@pytest.mark.parametrize("message", [
    "0 ly theo mặc định",
    "-2 ly theo mặc định",
    "số lượng nhiều theo mặc định",
])
def test_pending_add_rejects_non_positive_quantity_without_normalizing_to_one(monkeypatch, message):
    session = _pending_session()
    monkeypatch.setattr(
        product_tools,
        "execute_check_price_and_stock",
        lambda **_kwargs: pytest.fail("invalid quantity reached price lookup"),
    )
    monkeypatch.setattr(
        cart_tools,
        "execute_add_to_cart",
        lambda **_kwargs: pytest.fail("invalid quantity reached cart write"),
    )

    result = agent_service._complete_pending_products_from_options(session, message)

    assert "lớn hơn 0" in result["reply"]
    assert cart_manager.get_checkout_prefs(session)["pending_products"][0]["quantity"] == 1
    assert cart_manager.get_cart(session)["is_empty"] is True


def test_pending_quantity_parser_exposes_zero_and_negative_values_for_validation():
    assert pending_product_quantity("0 ly", 1) == (0, False)
    assert pending_product_quantity("-2 ly", 1) == (-2, False)


def test_new_add_rejects_zero_quantity_before_product_preparation(monkeypatch):
    session = "invalid-new-add-" + uuid.uuid4().hex
    monkeypatch.setattr(
        order_flow_graph,
        "_prepare_structured_products",
        lambda *_args, **_kwargs: pytest.fail("invalid quantity reached product preparation"),
    )
    state = {
        "session_id": session,
        "user_message": "thêm 0 ly Americano",
        "history": [],
        "cart": cart_manager.get_cart(session),
        "intent": {"intent": "ADD_ITEM", "quantity": 0, "resolved_products": [
            {"product_id": DRINK_ID, "product_name": DRINK},
        ]},
    }

    result = order_flow_graph._execute(state)["result"]

    assert "lớn hơn 0" in result["reply"] and result["tool_calls_log"] == []
    assert cart_manager.get_cart(session)["is_empty"] is True


def test_cart_quantity_update_rejects_zero_before_business_write(monkeypatch):
    session = "invalid-cart-quantity-" + uuid.uuid4().hex
    cart_manager.add_item(session, DRINK_ID, DRINK, 75000)
    monkeypatch.setattr(
        cart_tools,
        "execute_update_cart_item",
        lambda *_args, **_kwargs: pytest.fail("invalid quantity reached cart write"),
    )
    state = {
        "session_id": session,
        "user_message": "đổi số lượng về 0",
        "history": [],
        "cart": cart_manager.get_cart(session),
        "intent": {"intent": "SET_QUANTITY", "quantity": 0},
    }

    result = order_flow_graph._execute(state)["result"]

    assert "lớn hơn 0" in result["reply"] and result["tool_calls_log"] == []
    assert cart_manager.get_cart(session)["items"][0]["quantity"] == 1


def test_cart_edit_option_lookup_uses_authoritative_product_id(monkeypatch):
    calls = []

    def options(*args, **kwargs):
        calls.append((args, kwargs))
        return {**OPTIONS, "options": {"Topping": ["Hạt Sen", "Trái Vải"]}}

    monkeypatch.setattr(product_tools, "execute_get_product_options", options)
    desired, _result = order_flow_graph._resolve_cart_option_update(
        {"product_id": DRINK_ID, "product_name": DRINK, "quantity": 1, "toppings": []},
        "thêm topping Hạt Sen",
    )

    assert len(calls) == 1 and calls[0][1] == {}
    assert calls[0][0] == (DRINK,)
    assert getattr(calls[0][0][0], "product_id") == DRINK_ID
    assert desired["product_id"] == DRINK_ID and desired["toppings"] == ["Hạt Sen"]


def test_cart_edit_rejects_option_result_for_a_different_product_id(monkeypatch):
    monkeypatch.setattr(product_tools, "execute_get_product_options", lambda *_args, **_kwargs: {
        "status": "ok", "product_id": "SIMILAR-NAME-ID", "product_name": DRINK,
        "options": {"Topping": ["Hạt Sen"]},
    })

    desired, result = order_flow_graph._resolve_cart_option_update(
        {"product_id": DRINK_ID, "product_name": DRINK, "quantity": 1, "toppings": []},
        "thêm topping Hạt Sen",
    )

    assert desired == {}
    reply = order_flow_graph._option_validation_reply(
        {"product_id": DRINK_ID, "product_name": DRINK}, result,
    )
    assert reply and "chưa thay đổi" in reply


def test_canonical_product_option_technical_failure_does_not_claim_product_invalid(monkeypatch):
    session = "option-unavailable-" + uuid.uuid4().hex
    monkeypatch.setattr(product_tools, "execute_get_product_options", lambda *_args, **_kwargs: {
        "status": "error", "message": "database unavailable",
    })

    result = order_flow_graph._prepare_structured_products(
        session, [{"product_id": DRINK_ID, "product_name": DRINK, "quantity": 1}],
    )

    assert result["error"] == "option_metadata_unavailable"
    assert "đã xác định đúng món" in result["reply"]
    assert "thử lại" in result["reply"] and "chọn lại món" not in result["reply"]
    assert cart_manager.get_checkout_prefs(session)["last_product_focus"]["product_id"] == DRINK_ID
    assert cart_manager.get_cart(session)["is_empty"] is True
