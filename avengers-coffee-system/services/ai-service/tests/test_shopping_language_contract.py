"""Golden shopping utterances; no cart or checkout execution in this corpus."""
import pytest

from src.agents import order_flow_graph
from src.agents.shopping_language import interpret_shopping
from src.common import cart_manager
from src.function_calling.tools import cart_tools, product_tools


COFFEE = {"product_id": "salt", "product_name": "Cà Phê Muối Avenger", "category": "drink"}
OTHER = {"product_id": "classic", "product_name": "Americano Classic", "category": "drink"}


@pytest.mark.parametrize("message,category,term", [
    ("menu nước", "drink", None),
    ("menu bánh", "food", None),
    ("tôi muốn mua cà phê", "drink", "cà phê"),
    ("bên bạn bán cà phê gì thế", "drink", "cà phê"),
    ("bên bạn bán cà phê gì vậy nhỉ", "drink", "cà phê"),
    ("bên bạn bán americano gì", "drink", "americano"),
])
def test_known_good_family_catalog_queries(message, category, term):
    specs = order_flow_graph._menu_search_specs(message)
    assert len(specs) == 1
    assert specs[0]["category"] == category
    assert specs[0].get("search_text") == term


@pytest.mark.parametrize("message,quantity", [
    ("cho tôi cà phê muối đi 2 ly nhé b", 2),
    ("cho mình cà phê muối 2 ly", 2),
    ("cà phê muối 2 ly nhé", 2),
    ("2 ly cà phê muối", 2),
    ("làm cho tôi 2 ly cà phê muối", 2),
    ("cho tôi hai ly cà phê muối", 2),
    ("cà phê muối nhé", 1),
])
def test_known_good_snapshot_selection(message, quantity):
    session = f"golden-selection-{message}"
    cart_manager.reset_conversation_draft(session)
    cart_manager.set_checkout_context(session, last_product_suggestions=[COFFEE, OTHER])
    state = order_flow_graph._understand({
        "session_id": session, "user_message": message, "history": [],
        "cart": {"items": [], "is_empty": True},
    })
    assert state["intent"]["intent"] == "ADD_ITEM"
    assert [item["product_id"] for item in state["intent"]["resolved_products"]] == ["salt"]
    assert state["intent"]["quantity"] == quantity


@pytest.mark.parametrize("message", [
    "cà phê muối có ngon không", "giá cà phê muối bao nhiêu",
    "review cà phê muối đi", "không lấy cà phê muối",
])
def test_known_good_non_add(message):
    session = f"golden-non-add-{message}"
    cart_manager.reset_conversation_draft(session)
    cart_manager.set_checkout_context(session, last_product_suggestions=[COFFEE])
    state = order_flow_graph._understand({
        "session_id": session, "user_message": message, "history": [],
        "cart": {"items": [], "is_empty": True},
    })
    assert state["intent"]["intent"] != "ADD_ITEM"


@pytest.mark.parametrize("message,expected", [
    ("món số 1 và món số 8", ["D1", "D8"]),
    ("nước số 1 và nước số 8", ["D1", "D8"]),
    ("nước số 1 và số 8", ["D1", "D8"]),
])
def test_known_good_ordinal_order(message, expected):
    session = f"golden-ordinal-{message}"
    cart_manager.reset_conversation_draft(session)
    products = [{"product_id": f"D{i}", "product_name": f"Nước {i}",
                 "category": "drink", "group_display_index": i} for i in range(1, 9)]
    cart_manager.set_checkout_context(session, last_product_suggestions=products,
                                      product_suggestion_snapshots={"drink": products})
    assert [item["product_id"] for item in order_flow_graph._resolve_structured_references(session, message)] == expected


@pytest.mark.parametrize("message", [
    "bên bạn bán cà phê gì", "bên bạn bán cà phê gì thế",
    "bên bạn bán cà phê gì vậy", "bên bạn bán cà phê gì vậy nhỉ",
    "bên bạn bán cà phê gì ạ", "bên bạn bán cà phê gì nha",
    "bên bạn bán cà phê gì b ơi", "ben ban ban ca phe gi",
    "tôi muốn mua cà phê", "quán có cà phê nào",
])
def test_family_metamorphic_contract(message):
    meaning = interpret_shopping(message, snapshot=[COFFEE, OTHER])
    assert (meaning.act, meaning.category, meaning.family, meaning.read_only) == (
        "BROWSE_FAMILY", "drink", "coffee", True)
    assert meaning.targets == ()


@pytest.mark.parametrize("message,quantity", [
    ("cho tôi cà phê muối", 1), ("cà phê muối nhé", 1),
    ("cà phê muối 2 ly", 2), ("2 ly cà phê muối", 2),
    ("cho tôi 2 ly cà phê muối", 2), ("cho tôi cà phê muối 2 ly", 2),
    ("hai ly cà phê muối", 2), ("cho toi ca phe muoi 2 ly", 2),
])
def test_product_quantity_metamorphic_contract(message, quantity):
    meaning = interpret_shopping(message, snapshot=[COFFEE, OTHER])
    assert meaning.act == "ADD_ITEM"
    assert [row["product_id"] for row in meaning.targets] == ["salt"]
    assert meaning.quantity == quantity
    assert meaning.reference_source == "snapshot_alias"


@pytest.mark.parametrize("message,act", [
    ("cà phê muối ngon không", "PRODUCT_INFO"),
    ("giá cà phê muối bao nhiêu", "PRODUCT_INFO"),
    ("review cà phê muối đi", "PRODUCT_INFO"),
    ("cà phê muối có topping gì", "PRODUCT_INFO"),
    ("cà phê muối có size nào", "PRODUCT_INFO"),
    ("không lấy cà phê muối", "NEGATE_PRODUCT"),
    ("không mua cà phê muối", "NEGATE_PRODUCT"),
    ("đừng thêm cà phê muối", "NEGATE_PRODUCT"),
])
def test_read_only_and_negation_win_over_target(message, act):
    meaning = interpret_shopping(message, snapshot=[COFFEE])
    assert meaning.act == act
    assert meaning.read_only
    assert meaning.targets[0]["product_id"] == "salt"


def test_ambiguous_alias_never_selects_first_candidate():
    second = {"product_id": "salt-special", "product_name": "Cà Phê Muối Đặc Biệt", "category": "drink"}
    meaning = interpret_shopping("cho tôi cà phê muối", snapshot=[COFFEE, second])
    assert meaning.act == "AMBIGUOUS"
    assert meaning.targets == ()
    assert [row["product_id"] for row in meaning.ambiguity] == ["salt", "salt-special"]


def test_family_collision_blocks_single_visible_product_alias():
    meaning = interpret_shopping("mua cà phê", snapshot=[COFFEE])
    assert meaning.act == "BROWSE_FAMILY"
    assert meaning.targets == ()


def test_short_unique_alias_uses_canonical_snapshot_identity():
    product = {"product_id": "chanh", "product_name": "Americano Chanh Leo", "category": "drink"}
    meaning = interpret_shopping("cho tôi Americano Chanh", snapshot=[product])
    assert meaning.act == "ADD_ITEM"
    assert meaning.targets == (product,)
    assert meaning.reference_source == "snapshot_alias"


def test_active_catalog_alias_needs_uniqueness():
    meaning = interpret_shopping("cho tôi cà phê muối", active_catalog=[COFFEE, OTHER])
    assert meaning.act == "ADD_ITEM"
    assert meaning.targets == (COFFEE,)
    assert meaning.reference_source == "catalog_alias"


@pytest.mark.parametrize("suffix", ["", " thế", " vậy nhỉ", " b ơi", " bạn ơi", " ạ", " nha"])
def test_family_catalog_search_does_not_include_speech_particles(suffix):
    assert order_flow_graph._menu_search_specs("bên bạn bán cà phê gì" + suffix) == [
        {"category": "drink", "label": "Cà phê", "search_text": "cà phê"}]


@pytest.mark.parametrize("message,act", [
    ("cho tôi cà phê rồng", "UNKNOWN"),
    ("món đó", "UNKNOWN"),
    ("tôi thích Cà Phê Muối Avenger", "PRODUCT_INFO"),
    ("thanh toán", "NOT_APPLICABLE"),
    ("áp voucher SAVE", "NOT_APPLICABLE"),
    ("sửa topping", "NOT_APPLICABLE"),
    ("xóa món", "NOT_APPLICABLE"),
])
def test_non_add_and_business_owner_boundaries(message, act):
    meaning = interpret_shopping(message, snapshot=[COFFEE])
    assert meaning.act == act
    assert meaning.read_only


def test_browser_like_offer_family_then_canonical_add_preparation(monkeypatch):
    session = "golden-browser-like-shopping"
    cart_manager.reset_conversation_draft(session)
    cart_manager.replace_items_from_order_cart(session, [])
    cart_manager.set_pending_action(session, "offer_recommendation", {
        "domain": "PRODUCT_DISCOVERY", "action": "RECOMMEND", "category": "drink"})
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    calls = []
    monkeypatch.setattr(product_tools, "execute_get_recommendations",
                        lambda **kwargs: calls.append(kwargs) or {
                            "status": "ok", "products": [{**COFFEE, "final_price": 35000},
                                                         {**OTHER, "final_price": 55000}]})
    monkeypatch.setattr(product_tools, "execute_get_product_options",
                        lambda _name=None, **kwargs: {
                            "status": "ok", "product_id": kwargs.get("product_id"),
                            "product_name": COFFEE["product_name"],
                            "options": {"Kích thước": ["Vừa", "Lớn"]}})
    monkeypatch.setattr(cart_tools, "execute_add_to_cart",
                        lambda **_kwargs: pytest.fail("option preparation must own the next step"))

    offer = order_flow_graph.run_order_flow(session, "oke bạn")
    assert COFFEE["product_name"] in offer["reply"]
    family = order_flow_graph.run_order_flow(session, "bên bạn bán cà phê gì vậy nhỉ")
    assert COFFEE["product_name"] in family["reply"]
    assert calls[-1] == {"category": "drink", "search_text": "cà phê", "top_k": 8}
    selected = order_flow_graph.run_order_flow(session, "cho tôi cà phê muối 2 ly nhé")
    assert COFFEE["product_name"] in selected["reply"]
    pending = cart_manager.get_checkout_prefs(session).get("pending_products") or []
    assert len(pending) == 1 and pending[0]["product_id"] == "salt"
    assert pending[0]["quantity"] == 2


def test_ambiguous_alias_clarifies_without_cart_write(monkeypatch):
    session = "golden-ambiguous-no-write"
    cart_manager.reset_conversation_draft(session)
    cart_manager.replace_items_from_order_cart(session, [])
    second = {"product_id": "salt-special", "product_name": "Cà Phê Muối Đặc Biệt", "category": "drink"}
    cart_manager.set_checkout_context(session, last_product_suggestions=[COFFEE, second])
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(cart_tools, "execute_add_to_cart",
                        lambda **_kwargs: pytest.fail("ambiguous alias reached cart write"))
    result = order_flow_graph.run_order_flow(session, "cho tôi cà phê muối")
    assert COFFEE["product_name"] in result["reply"]
    assert second["product_name"] in result["reply"]
    assert not cart_manager.get_cart(session)["items"]


def test_catalog_only_ambiguous_alias_uses_one_identity_read(monkeypatch):
    session = "golden-catalog-ambiguous"
    cart_manager.reset_conversation_draft(session)
    cart_manager.replace_items_from_order_cart(session, [])
    second = {"product_id": "salt-special", "product_name": "Cà Phê Muối Đặc Biệt", "category": "drink"}
    reads = []
    monkeypatch.setattr(order_flow_graph, "_load_active_product_targets",
                        lambda: reads.append(1) or [COFFEE, second])
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(cart_tools, "execute_add_to_cart",
                        lambda **_kwargs: pytest.fail("catalog ambiguity reached cart write"))
    result = order_flow_graph.run_order_flow(session, "cho tôi cà phê muối")
    assert COFFEE["product_name"] in result["reply"]
    assert second["product_name"] in result["reply"]
    assert reads == [1]


def test_negated_ordinal_does_not_prepare_an_add(monkeypatch):
    session = "golden-negated-ordinal"
    cart_manager.reset_conversation_draft(session)
    cart_manager.replace_items_from_order_cart(session, [])
    cart_manager.set_checkout_context(session, last_product_suggestions=[COFFEE])
    monkeypatch.setattr(product_tools, "execute_get_product_options",
                        lambda *_args, **_kwargs: pytest.fail("negated ordinal reached option preparation"))
    state = order_flow_graph._understand({
        "session_id": session, "user_message": "không lấy món số 1", "history": [],
        "cart": {"items": [], "is_empty": True},
    })
    assert state["intent"]["intent"] != "ADD_ITEM"


def test_unknown_named_product_asks_for_clarification(monkeypatch):
    session = "golden-unknown-product"
    cart_manager.reset_conversation_draft(session)
    cart_manager.set_checkout_context(session, last_product_suggestions=[COFFEE])
    monkeypatch.setattr(order_flow_graph, "_load_active_product_targets", lambda: [COFFEE])
    state = order_flow_graph._understand({
        "session_id": session, "user_message": "cho tôi cà phê rồng", "history": [],
        "cart": {"items": [], "is_empty": True},
    })
    assert state["intent"]["intent"] == "SHOPPING_CLARIFY"


def test_unavailable_catalog_identity_is_not_reported_as_unknown_product(monkeypatch):
    session = "golden-catalog-unavailable"
    cart_manager.reset_conversation_draft(session)
    cart_manager.replace_items_from_order_cart(session, [])
    monkeypatch.setattr(order_flow_graph, "_load_active_product_targets",
                        lambda: order_flow_graph._UnavailableProductTargets())
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(cart_tools, "execute_add_to_cart",
                        lambda **_kwargs: pytest.fail("catalog failure reached cart write"))
    result = order_flow_graph.run_order_flow(session, "cho tôi cà phê muối")
    assert "chưa tra được danh mục" in result["reply"]
    assert not cart_manager.get_cart(session)["items"]
