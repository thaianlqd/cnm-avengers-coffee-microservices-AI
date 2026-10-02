"""Final micro regressions for option parsing, quantity, and read retry."""
import copy
import uuid

import pytest

from src.agents import agent_service, order_flow_graph
from src.common import cart_manager
from src.function_calling.tools import cart_tools, product_tools


PRODUCT_ID = "P-MICRO"
PRODUCT_NAME = "Đồ uống cấu hình"

BASE_OPTIONS = {
    "status": "ok",
    "product_id": PRODUCT_ID,
    "product_name": PRODUCT_NAME,
    "options": {
        "Kích thước": ["Vừa"],
        "Topping": ["Hạt Sen", "Trái Vải"],
    },
    "option_groups": [
        {"name": "Kích thước", "values": ["Vừa"], "required": True,
         "multiple": False, "fixed": True},
        {"name": "Topping", "values": ["Hạt Sen", "Trái Vải"], "required": False,
         "multiple": True, "fixed": False},
    ],
}

FULL_OPTIONS = {
    **BASE_OPTIONS,
    "options": {
        "Kích thước": ["Nhỏ", "Lớn"],
        "Topping": ["Hạt Sen", "Trái Vải"],
        "Lượng đá": ["Bình thường", "Ít đá"],
        "Độ ngọt": ["Ít ngọt", "Thêm ngọt"],
    },
    "option_groups": [
        {"name": "Kích thước", "values": ["Nhỏ", "Lớn"], "required": True,
         "multiple": False, "fixed": False, "default_value": "Nhỏ"},
        {"name": "Topping", "values": ["Hạt Sen", "Trái Vải"], "required": False,
         "multiple": True, "fixed": False},
        {"name": "Lượng đá", "values": ["Bình thường", "Ít đá"], "required": False,
         "multiple": False, "fixed": False, "default_value": "Bình thường"},
        {"name": "Độ ngọt", "values": ["Ít ngọt", "Thêm ngọt"], "required": False,
         "multiple": False, "fixed": False, "default_value": "Ít ngọt"},
    ],
}


def _pending(options=BASE_OPTIONS, quantity=1, selected=None):
    session = "micro-options-" + uuid.uuid4().hex
    source = {"product_id": PRODUCT_ID, "product_name": PRODUCT_NAME}
    if quantity is not ...:
        source["quantity"] = quantity
    item = agent_service._pending_option_item(source, copy.deepcopy(options))
    if selected:
        item["selected_options"] = dict(selected)
    cart_manager.set_pending_products(session, [item])
    if quantity is ... or quantity is None or quantity <= 0:
        # Bypass the normal setter's defensive normalization to model a stale
        # or corrupted persisted checkpoint at the write boundary.
        persisted = copy.deepcopy(cart_manager.get_checkout_prefs(session)["pending_products"][0])
        if quantity is ...:
            persisted.pop("quantity", None)
        else:
            persisted["quantity"] = quantity
        cart_manager.set_checkout_context(session, pending_products=[persisted])
    cart_manager.set_pending_action(session, "fill_options", {"count": 1})
    return session


def _forbid_pending_writes(monkeypatch):
    monkeypatch.setattr(
        product_tools, "execute_check_price_and_stock",
        lambda **_kwargs: pytest.fail("invalid configuration reached price lookup"),
    )
    monkeypatch.setattr(
        cart_tools, "execute_add_to_cart",
        lambda **_kwargs: pytest.fail("invalid configuration reached cart write"),
    )


def _capture_pending_write(monkeypatch, session):
    prices, adds = [], []

    def price(**kwargs):
        prices.append(kwargs)
        return {"status": "ok", "products": [{
            "product_id": PRODUCT_ID, "product_name": PRODUCT_NAME, "final_price": 50000,
        }]}

    def add(**kwargs):
        adds.append(kwargs)
        cart = cart_manager.add_item(
            session, kwargs["product_id"], kwargs["product_name"], kwargs["unit_price"],
            quantity=kwargs["quantity"], size=kwargs.get("size"), toppings=kwargs.get("toppings"),
            luong_da=kwargs.get("luong_da"), do_ngot=kwargs.get("do_ngot"),
        )
        return {"status": "ok", "cart": cart}

    monkeypatch.setattr(product_tools, "execute_check_price_and_stock", price)
    monkeypatch.setattr(cart_tools, "execute_add_to_cart", add)
    return prices, adds


def test_pending_add_rejects_comma_separated_valid_and_invalid_toppings(monkeypatch):
    session = _pending()
    _forbid_pending_writes(monkeypatch)

    result = agent_service._complete_pending_products_from_options(
        session, "topping Hạt Sen, Foam Dừa",
    )

    assert "Foam Dừa" in result["reply"]
    prefs = cart_manager.get_checkout_prefs(session)
    assert prefs["pending_action"]["type"] == "fill_options"
    assert prefs["pending_products"][0]["product_id"] == PRODUCT_ID
    assert prefs["pending_products"][0].get("selected_options", {}).get("toppings") in (None, [])
    assert cart_manager.get_cart(session)["is_empty"] is True


def test_pending_add_accepts_comma_separated_valid_toppings(monkeypatch):
    session = _pending()
    prices, adds = _capture_pending_write(monkeypatch, session)

    result = agent_service._complete_pending_products_from_options(
        session, "topping Hạt Sen, Trái Vải",
    )

    assert result["reply"].startswith("Mình đã thêm đủ 1 món")
    assert len(prices) == len(adds) == 1
    assert adds[0]["toppings"] == ["Hạt Sen", "Trái Vải"]


def test_pending_add_comma_preserves_other_groups_but_rejects_invalid_topping(monkeypatch):
    session = _pending(FULL_OPTIONS)
    _forbid_pending_writes(monkeypatch)

    result = agent_service._complete_pending_products_from_options(
        session, "size Lớn, topping Hạt Sen, Foam Dừa, ít đá",
    )

    assert "Foam Dừa" in result["reply"]
    selected = cart_manager.get_checkout_prefs(session)["pending_products"][0]["selected_options"]
    assert selected["size"] == "Lớn" and selected["luong_da"] == "Ít đá"
    assert selected.get("toppings") in (None, [])


def test_pending_add_comma_does_not_absorb_next_option_group(monkeypatch):
    options = copy.deepcopy(FULL_OPTIONS)
    options["options"].pop("Độ ngọt")
    options["option_groups"] = [g for g in options["option_groups"] if g["name"] != "Độ ngọt"]
    session = _pending(options)
    prices, adds = _capture_pending_write(monkeypatch, session)

    agent_service._complete_pending_products_from_options(
        session, "size Lớn, topping Hạt Sen, ít đá",
    )

    assert len(prices) == len(adds) == 1
    assert adds[0]["toppings"] == ["Hạt Sen"]
    assert adds[0]["luong_da"] == "Ít đá"


def test_pending_topping_answer_without_group_name_is_validated_atomically(monkeypatch):
    session = _pending()
    _forbid_pending_writes(monkeypatch)

    result = agent_service._complete_pending_products_from_options(
        session, "Hạt Sen và Foam Dừa",
    )

    assert "Foam Dừa" in result["reply"]
    held = cart_manager.get_checkout_prefs(session)["pending_products"][0]
    assert held["product_id"] == PRODUCT_ID
    assert held.get("selected_options", {}).get("toppings") in (None, [])


def test_pending_topping_implicit_answer_requires_value_list_shape(monkeypatch):
    session = _pending()
    _forbid_pending_writes(monkeypatch)

    result = agent_service._complete_pending_products_from_options(
        session, "Hạt Sen được làm từ gì?",
    )

    assert "mặc định" in result["reply"]
    held = cart_manager.get_checkout_prefs(session)["pending_products"][0]
    assert held.get("selected_options", {}).get("toppings") in (None, [])


def test_ambiguous_value_shared_by_open_groups_is_not_guessed(monkeypatch):
    options = copy.deepcopy(FULL_OPTIONS)
    options["options"].pop("Topping")
    options["option_groups"] = [g for g in options["option_groups"] if g["name"] != "Topping"]
    options["options"]["Độ ngọt"] = ["Bình thường", "Thêm ngọt"]
    for group in options["option_groups"]:
        if group["name"] == "Độ ngọt":
            group["values"] = ["Bình thường", "Thêm ngọt"]
    session = _pending(options, selected={"size": "Lớn"})
    _forbid_pending_writes(monkeypatch)

    result = agent_service._complete_pending_products_from_options(session, "bình thường")

    assert "đá" in result["reply"].lower() and "ngọt" in result["reply"].lower()
    selected = cart_manager.get_checkout_prefs(session)["pending_products"][0]["selected_options"]
    assert "luong_da" not in selected and "do_ngot" not in selected


@pytest.mark.parametrize("message", ["-2 ly", "0 ly"])
def test_pending_invalid_quantity_precedes_multi_product_target_ambiguity(monkeypatch, message):
    session = _pending()
    prefs = cart_manager.get_checkout_prefs(session)
    second = copy.deepcopy(prefs["pending_products"][0])
    second.update({"product_id": "P-SECOND", "product_name": "Món thứ hai"})
    cart_manager.set_pending_products(session, [prefs["pending_products"][0], second])
    cart_manager.set_pending_action(session, "fill_options", {"count": 2})
    _forbid_pending_writes(monkeypatch)

    result = agent_service._complete_pending_products_from_options(session, message)

    assert "lớn hơn 0" in result["reply"]
    assert "món nào" not in result["reply"]
    assert [row["quantity"] for row in cart_manager.get_checkout_prefs(session)["pending_products"]] == [1, 1]


def test_valid_quantity_still_requires_multi_product_target(monkeypatch):
    session = _pending()
    prefs = cart_manager.get_checkout_prefs(session)
    second = copy.deepcopy(prefs["pending_products"][0])
    second.update({"product_id": "P-SECOND", "product_name": "Món thứ hai"})
    cart_manager.set_pending_products(session, [prefs["pending_products"][0], second])
    _forbid_pending_writes(monkeypatch)

    result = agent_service._complete_pending_products_from_options(session, "2 ly")

    assert "món nào" in result["reply"]
    assert [row["quantity"] for row in cart_manager.get_checkout_prefs(session)["pending_products"]] == [1, 1]


def test_each_product_quantity_keeps_existing_safe_behavior(monkeypatch):
    session = _pending()
    prefs = cart_manager.get_checkout_prefs(session)
    second = copy.deepcopy(prefs["pending_products"][0])
    second.update({"product_id": "P-SECOND", "product_name": "Món thứ hai"})
    cart_manager.set_pending_products(session, [prefs["pending_products"][0], second])
    monkeypatch.setattr(product_tools, "execute_check_price_and_stock", lambda **_kwargs: {
        "status": "error", "products": [],
    })
    monkeypatch.setattr(cart_tools, "execute_add_to_cart", lambda **_kwargs: pytest.fail("price failed"))

    agent_service._complete_pending_products_from_options(session, "mỗi món 2 ly theo mặc định")

    assert [row["quantity"] for row in cart_manager.get_checkout_prefs(session)["pending_products"]] == [2, 2]


@pytest.mark.parametrize("quantity", [0, -2])
def test_write_boundary_rejects_corrupted_non_positive_quantity(monkeypatch, quantity):
    session = _pending(quantity=quantity)
    _forbid_pending_writes(monkeypatch)

    result = agent_service._complete_pending_products_from_options(session, "theo mặc định")

    assert "lớn hơn 0" in result["reply"]
    assert cart_manager.get_checkout_prefs(session)["pending_products"][0]["quantity"] == quantity


def test_missing_pending_quantity_still_defaults_to_one(monkeypatch):
    session = _pending(quantity=...)
    prices, adds = _capture_pending_write(monkeypatch, session)

    agent_service._complete_pending_products_from_options(session, "theo mặc định")

    assert prices[0]["quantity"] == 1 and adds[0]["quantity"] == 1


def _seed_edit_cart(session):
    cart_manager.replace_items_from_order_cart(session, [{
        "id": 71, "ma_san_pham": PRODUCT_ID, "ten_san_pham": PRODUCT_NAME,
        "gia_ban": 50000, "so_luong": 1, "size": "Lớn", "toppings": [],
        "do_ngot": "Ít ngọt",
    }])


def _edit_options_result():
    return {
        "status": "ok", "product_id": PRODUCT_ID, "product_name": PRODUCT_NAME,
        "options": {
            "Topping": ["Hạt Sen", "Trái Vải"],
            "Độ ngọt": ["Ít ngọt", "Thêm ngọt"],
        },
    }


@pytest.mark.parametrize("message", [
    "thêm topping Hạt Sen, Foam Dừa",
    "đổi topping thành Hạt Sen, Foam Dừa, thêm ngọt",
])
def test_cart_edit_rejects_comma_separated_valid_and_invalid_toppings(monkeypatch, message):
    session = "micro-edit-invalid-" + uuid.uuid4().hex
    _seed_edit_cart(session)
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(product_tools, "execute_get_product_options", lambda *_args, **_kwargs: _edit_options_result())
    monkeypatch.setattr(
        cart_tools, "execute_update_cart_item",
        lambda *_args, **_kwargs: pytest.fail("invalid comma topping reached PATCH"),
    )

    result = order_flow_graph.run_order_flow(session, message)

    assert "Foam Dừa" in result["reply"] and "Giỏ hàng chưa thay đổi" in result["reply"]
    assert not any(row["tool"] == "update_cart_item" for row in result["tool_calls_log"])


def test_cart_edit_accepts_comma_separated_valid_toppings(monkeypatch):
    session = "micro-edit-valid-" + uuid.uuid4().hex
    _seed_edit_cart(session)
    writes = []
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(product_tools, "execute_get_product_options", lambda *_args, **_kwargs: _edit_options_result())
    monkeypatch.setattr(cart_tools, "execute_update_cart_item", lambda sid, line, desired: writes.append(desired) or {
        "status": "ok", "cart": cart_manager.get_cart(sid),
        "quote": {"subtotal": 50000, "discount_amount": 0, "final_total": 50000},
    })

    order_flow_graph.run_order_flow(session, "đổi topping thành Hạt Sen, Trái Vải")

    assert len(writes) == 1 and writes[0]["toppings"] == ["Hạt Sen", "Trái Vải"]


def test_cart_edit_comma_does_not_absorb_sweetness_clause(monkeypatch):
    session = "micro-edit-sweet-" + uuid.uuid4().hex
    _seed_edit_cart(session)
    writes = []
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(product_tools, "execute_get_product_options", lambda *_args, **_kwargs: _edit_options_result())
    monkeypatch.setattr(cart_tools, "execute_update_cart_item", lambda sid, line, desired: writes.append(desired) or {
        "status": "ok", "cart": cart_manager.get_cart(sid),
        "quote": {"subtotal": 50000, "discount_amount": 0, "final_total": 50000},
    })

    order_flow_graph.run_order_flow(session, "đổi topping thành Hạt Sen, thêm ngọt")

    assert len(writes) == 1
    assert writes[0]["toppings"] == ["Hạt Sen"] and writes[0]["do_ngot"] == "Thêm ngọt"


def test_option_metadata_failure_can_retry_same_canonical_product_next_turn(monkeypatch):
    session = "micro-option-retry-" + uuid.uuid4().hex
    calls = []

    def options(product_name="", product_id=None):
        calls.append((str(product_name), str(product_id or "")))
        if len(calls) == 1:
            return {"status": "error", "message": "provider unavailable"}
        return copy.deepcopy(BASE_OPTIONS)

    monkeypatch.setattr(product_tools, "execute_get_product_options", options)
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(
        agent_service, "_run_agent_impl",
        lambda *_args, **_kwargs: pytest.fail("retry fell through to generic model"),
    )

    first = order_flow_graph._prepare_structured_products(
        session, [{"product_id": PRODUCT_ID, "product_name": PRODUCT_NAME, "quantity": 1}],
    )
    second = order_flow_graph.run_order_flow(session, "thử lại đi")

    assert first["error"] == "option_metadata_unavailable"
    assert calls == [(PRODUCT_NAME, PRODUCT_ID), (PRODUCT_NAME, PRODUCT_ID)]
    assert "Topping" in second["reply"]
    prefs = cart_manager.get_checkout_prefs(session)
    assert prefs["pending_action"]["type"] == "fill_options"
    assert prefs["pending_products"][0]["product_id"] == PRODUCT_ID
    assert cart_manager.get_cart(session)["is_empty"] is True
