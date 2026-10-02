"""Four narrow shopping-language boundaries added before production changes."""
import uuid

import pytest

from src.agents import order_flow_graph as graph
from src.agents.shopping_language import interpret_shopping
from src.common import cart_manager
from src.function_calling.tools import cart_tools


COFFEE = {"product_id": "salt", "product_name": "Cà Phê Muối Avenger", "category": "drink"}
BEEF = {"product_id": "beef", "product_name": "Bánh Mì Bò", "category": "food"}


def _session(snapshot=()):
    session = "shopping-micro-" + uuid.uuid4().hex
    cart_manager.reset_conversation_draft(session)
    cart_manager.replace_items_from_order_cart(session, [])
    cart_manager.set_checkout_context(session, last_product_suggestions=list(snapshot))
    return session


def _understand(session, message):
    return graph._understand({"session_id": session, "user_message": message,
                              "history": [], "cart": cart_manager.get_cart(session)})["intent"]


@pytest.mark.parametrize("message,expected", [
    ("cho tôi bánh mì bò", "ADD_ITEM"),
    ("bánh mì bò có ngon không", "PRODUCT_INFO"),
    ("bỏ món đó", "NOT_APPLICABLE"),
    ("không lấy cà phê muối", "NEGATE_PRODUCT"),
    ("đừng thêm cà phê muối", "NEGATE_PRODUCT"),
])
def test_bo_negation_requires_action_context(message, expected):
    meaning = interpret_shopping(message, snapshot=[BEEF, COFFEE])
    assert meaning.act == expected
    if expected == "ADD_ITEM":
        assert meaning.targets == (BEEF,)
    else:
        assert meaning.read_only


def test_beef_product_name_with_normalized_bo_is_not_negation():
    product = {"product_id": "pepper-beef", "product_name": "Bò Sốt Tiêu", "category": "food"}
    meaning = interpret_shopping("cho tôi bò sốt tiêu", snapshot=[product])
    assert meaning.act == "ADD_ITEM"
    assert meaning.targets == (product,)


def test_beef_product_reaches_existing_add_selection_boundary():
    intent = _understand(_session([BEEF]), "cho tôi bánh mì bò")
    assert intent["intent"] == "ADD_ITEM"
    assert [row["product_id"] for row in intent["resolved_products"]] == ["beef"]


@pytest.mark.parametrize("message,expected", [
    ("đặt hàng cà phê muối", "ADD_ITEM"),
    ("tôi muốn đặt hàng Cà Phê Muối Avenger", "ADD_ITEM"),
    ("đặt hàng", "NOT_APPLICABLE"),
    ("chốt đơn", "NOT_APPLICABLE"),
    ("đặt đơn này", "NOT_APPLICABLE"),
    ("đặt hàng cà phê", "BROWSE_FAMILY"),
])
def test_order_phrase_owner_depends_on_entity(message, expected):
    meaning = interpret_shopping(message, snapshot=[COFFEE])
    assert meaning.act == expected
    if expected == "ADD_ITEM":
        assert meaning.targets == (COFFEE,)
    if expected == "BROWSE_FAMILY":
        assert meaning.family == "coffee"
        assert meaning.targets == ()


def test_order_phrase_with_ambiguous_product_never_selects_first():
    second = {"product_id": "salt2", "product_name": "Cà Phê Muối Đặc Biệt", "category": "drink"}
    meaning = interpret_shopping("đặt hàng cà phê muối", snapshot=[COFFEE, second])
    assert meaning.act == "AMBIGUOUS"
    assert meaning.targets == ()
    assert len(meaning.ambiguity) == 2


@pytest.mark.parametrize("message", ["đặt hàng cà phê muối", "tôi muốn đặt hàng Cà Phê Muối Avenger"])
def test_order_phrase_with_unique_snapshot_product_enters_existing_add_flow(message):
    intent = _understand(_session([COFFEE]), message)
    assert intent["intent"] == "ADD_ITEM"
    assert [row["product_id"] for row in intent["resolved_products"]] == ["salt"]


def test_order_phrase_with_only_family_opens_family_menu():
    intent = _understand(_session([COFFEE]), "đặt hàng cà phê")
    assert intent["intent"] == "BROWSING"
    assert intent.get("resolved_products") in (None, [])


def test_order_phrase_with_ambiguous_snapshot_product_clarifies_without_write():
    second = {"product_id": "salt2", "product_name": "Cà Phê Muối Đặc Biệt", "category": "drink"}
    intent = _understand(_session([COFFEE, second]), "đặt hàng cà phê muối")
    assert intent["intent"] == "SHOPPING_CLARIFY"
    assert intent.get("resolved_products") in (None, [])


def test_ambiguous_order_phrase_does_not_write_cart(monkeypatch):
    second = {"product_id": "salt2", "product_name": "Cà Phê Muối Đặc Biệt", "category": "drink"}
    session = _session([COFFEE, second])
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(cart_tools, "execute_add_to_cart",
                        lambda **_kwargs: pytest.fail("ambiguous order phrase reached cart write"))
    result = graph.run_order_flow(session, "đặt hàng cà phê muối")
    assert COFFEE["product_name"] in result["reply"]
    assert second["product_name"] in result["reply"]
    assert cart_manager.get_cart(session)["items"] == []


@pytest.mark.parametrize("message,expected", [
    ("bên bạn có cà phê với trà gì", [("drink", "cà phê"), ("drink", "trà")]),
    ("cho xem cà phê và trà", [("drink", "cà phê"), ("drink", "trà")]),
    ("quán có cà phê hoặc trà không", [("drink", "cà phê"), ("drink", "trà")]),
    ("cho tôi xem bánh và nước", [("food", None), ("drink", None)]),
    ("bánh mặn hoặc bánh matcha", [("food", "Bánh Mặn"), ("food", "matcha")]),
    ("matcha với americano", [("all", "matcha"), ("drink", "americano")]),
    ("cà phê và cà phê", [("drink", "cà phê")]),
])
def test_compound_families_are_clean_ordered_and_deduplicated(message, expected):
    specs = graph._menu_search_specs(message)
    assert [(row["category"], row.get("search_text")) for row in specs] == expected


def test_conjunction_inside_canonical_product_name_is_not_family_split():
    product = {"product_id": "blend", "product_name": "Cà Phê Với Trà", "category": "drink"}
    meaning = interpret_shopping("cho tôi Cà Phê Với Trà", snapshot=[product])
    assert meaning.act == "ADD_ITEM"
    assert meaning.targets == (product,)
    intent = _understand(_session([product]), "cho tôi Cà Phê Với Trà")
    assert intent["intent"] == "ADD_ITEM"
    assert [row["product_id"] for row in intent["resolved_products"]] == ["blend"]


def test_compound_family_browsing_never_adds_to_cart(monkeypatch):
    from src.function_calling.tools import product_tools

    session = _session()
    calls = []
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(cart_tools, "execute_add_to_cart",
                        lambda **_kwargs: pytest.fail("family browse reached cart write"))
    monkeypatch.setattr(product_tools, "execute_get_recommendations",
                        lambda **kwargs: calls.append(kwargs) or {"status": "ok", "products": []})
    graph.run_order_flow(session, "bên bạn có cà phê với trà gì")
    assert [(row["category"], row["search_text"]) for row in calls] == [
        ("drink", "cà phê"), ("drink", "trà")]
    assert cart_manager.get_cart(session)["items"] == []


@pytest.mark.parametrize("message,quantity,valid", [
    ("cà phê muối", 1, True),
    ("cà phê muối 2 ly", 2, True),
    ("0 ly cà phê muối", 0, False),
    ("-2 ly cà phê muối", -2, False),
])
def test_explicit_invalid_quantity_is_not_rewritten_as_one(message, quantity, valid):
    meaning = interpret_shopping(message, snapshot=[COFFEE])
    assert meaning.quantity == quantity
    assert meaning.quantity_valid is valid


@pytest.mark.parametrize("message", ["0 ly cà phê muối", "-2 ly cà phê muối"])
def test_existing_business_guard_blocks_invalid_quantity_without_cart_write(monkeypatch, message):
    session = _session([COFFEE])
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(cart_tools, "execute_add_to_cart",
                        lambda **_kwargs: pytest.fail("invalid quantity reached cart write"))
    result = graph.run_order_flow(session, message)
    assert "Giỏ hàng chưa thay đổi" in result["reply"]
    assert cart_manager.get_cart(session)["items"] == []


def test_bare_order_phrase_keeps_empty_cart_precondition(monkeypatch):
    session = _session([COFFEE])
    assert _understand(session, "đặt hàng")["intent"] in {"FINISH_CART", "START_CHECKOUT"}
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(cart_tools, "execute_add_to_cart",
                        lambda **_kwargs: pytest.fail("bare checkout phrase reached cart add"))
    result = graph.run_order_flow(session, "đặt hàng")
    assert "giỏ" in result["reply"].lower()
    assert cart_manager.get_cart(session)["items"] == []


def test_order_summary_phrase_remains_owned_by_pending_checkout():
    session = _session([COFFEE])
    cart_manager.set_checkout_context(session, summary_fingerprint="summary-test")
    cart_manager.set_pending_action(session, "confirm_checkout", {})
    intent = _understand(session, "đặt đơn này")
    assert intent["intent"] != "ADD_ITEM"
