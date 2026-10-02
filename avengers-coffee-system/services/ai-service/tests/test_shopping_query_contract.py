"""End-to-end contract from shopping meaning to the visible catalog snapshot."""
import uuid

import pytest

from src.agents import order_flow_graph as graph
from src.agents.shopping_language import interpret_shopping
from src.common import cart_manager
from src.function_calling.tools import cart_tools, product_tools


COFFEE = {"product_id": "salt", "product_name": "Cà Phê Muối Avenger",
          "category": "drink", "final_price": 35000}


def _reset(prefix="query-contract"):
    session = prefix + "-" + uuid.uuid4().hex
    cart_manager.reset_conversation_draft(session)
    cart_manager.replace_items_from_order_cart(session, [])
    return session


@pytest.mark.parametrize("message", [
    "bên bạn có cà phê gì",
    "hello bên bạn có cà phê gì",
    "hello, tôi muốn mua cà phê bên bạn có những loại nào nhỉ",
    "hi b ơi bên bạn có cà phê gì",
    "xin chào, quán có cà phê nào vậy",
    "alo, có cà phê gì không",
    "xin chào hiện bên bạn có bán cà phê k nhỉ",
    "chào bạn, hiện tại quán có cà phê gì ko",
    "bây giờ bên mình có cà phê nào vậy",
])
def test_greeting_wrappers_keep_one_canonical_coffee_query_plan(message):
    meaning = interpret_shopping(message)
    assert meaning.act == "BROWSE_FAMILY"
    assert meaning.family == "coffee"
    plan = graph._catalog_query_plan(message)
    assert plan["read_only"] is True
    assert [(row["category"], row["family"], row.get("search_text"))
            for row in plan["specs"]] == [("drink", "coffee", "cà phê")]


@pytest.mark.parametrize("message", [
    "hello tôi muốn mua cà phê bên bạn có những loại nào nhỉ",
    "xin chào hiện bên bạn có bán cà phê k nhỉ",
])
def test_real_greeting_regression_calls_provider_with_business_data_only(monkeypatch, message):
    session = _reset("greeting-coffee")
    calls = []
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(cart_tools, "execute_add_to_cart",
                        lambda **_kwargs: pytest.fail("family browse reached cart write"))
    monkeypatch.setattr(product_tools, "execute_get_recommendations",
                        lambda **kwargs: calls.append(kwargs) or {
                            "status": "ok", "products": [COFFEE]})

    result = graph.run_order_flow(session, message)

    assert calls == [{"category": "drink", "search_text": "cà phê", "top_k": 8}]
    assert all("hello" not in str(call.get("search_text") or "").lower() for call in calls)
    assert COFFEE["product_name"] in result["reply"]
    assert cart_manager.get_cart(session)["items"] == []


@pytest.mark.parametrize("message,expected", [
    ("alo b ơi, có trà gì không", ("drink", "tea", "trà")),
    ("ê bạn, cho mình xem americano với", ("drink", "americano", "americano")),
])
def test_resolved_family_plan_uses_only_canonical_business_text(message, expected):
    plan = graph._catalog_query_plan(message)
    assert [(row["category"], row["family"], row["search_text"])
            for row in plan["specs"]] == [expected]


def _products(prefix, count):
    return [{"product_id": f"{prefix}{index}", "product_name": f"{prefix}{index}",
             "category": "Cà Phê" if prefix == "C" else "Trà",
             "final_price": 30000 + index}
            for index in range(1, count + 1)]


def test_same_drink_bucket_cannot_starve_second_family(monkeypatch):
    calls = []

    def provider(**kwargs):
        calls.append(kwargs)
        rows = _products("C", 8) if kwargs["search_text"] == "cà phê" else _products("T", 8)
        return {"status": "ok", "products": rows}

    monkeypatch.setattr(product_tools, "execute_get_recommendations", provider)
    result = graph._search_menu_catalog("bên bạn có cà phê với trà gì")

    assert [(call["category"], call["search_text"]) for call in calls] == [
        ("drink", "cà phê"), ("drink", "trà")]
    assert [row["product_id"] for row in result["displayed_products"]] == [
        *[f"C{i}" for i in range(1, 9)], *[f"T{i}" for i in range(1, 9)]]


def test_cross_group_dedup_keeps_later_group_useful_results(monkeypatch):
    coffee = [
        {"product_id": "P1", "product_name": "P1", "final_price": 1},
        {"product_id": "SHARED", "product_name": "Shared", "final_price": 2},
        {"product_id": "P2", "product_name": "P2", "final_price": 3},
    ]
    tea = [
        {"product_id": "SHARED", "product_name": "Shared", "final_price": 2},
        {"product_id": "T1", "product_name": "T1", "final_price": 4},
        {"product_id": "T2", "product_name": "T2", "final_price": 5},
    ]
    monkeypatch.setattr(product_tools, "execute_get_recommendations", lambda **kwargs: {
        "status": "ok", "products": coffee if kwargs["search_text"] == "cà phê" else tea})

    result = graph._search_menu_catalog("bên bạn có cà phê với trà gì")
    assert [row["product_id"] for row in result["displayed_products"]] == [
        "P1", "SHARED", "P2", "T1", "T2"]


def test_partial_missing_family_returns_success_and_names_missing_group(monkeypatch):
    monkeypatch.setattr(product_tools, "execute_get_recommendations", lambda **kwargs: (
        {"status": "ok", "products": _products("C", 2)}
        if kwargs["search_text"] == "cà phê" else {"status": "not_found", "products": []}))

    result = graph._search_menu_catalog("bên bạn có cà phê với trà gì")
    assert result["missing_menu_groups"] == ["Trà"]
    assert [row["product_id"] for row in result["displayed_products"]] == ["C1", "C2"]
    assert "Chưa tìm thấy kết quả riêng cho: Trà." in result["reply"]


def test_compound_render_snapshot_and_next_ordinal_are_identical(monkeypatch):
    session = _reset("compound-snapshot")
    calls = []
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(cart_tools, "execute_add_to_cart",
                        lambda **_kwargs: pytest.fail("catalog browse reached cart write"))

    def provider(**kwargs):
        calls.append(kwargs)
        return {"status": "ok", "products": (
            _products("C", 2) if kwargs["search_text"] == "cà phê" else _products("T", 2))}

    monkeypatch.setattr(product_tools, "execute_get_recommendations", provider)
    result = graph.run_order_flow(session, "bên bạn có cà phê với trà gì")
    visible = [row["product_id"] for row in result["ui_payload"]["products"]]
    snapshot = [row["product_id"] for row in
                cart_manager.get_checkout_prefs(session)["last_product_suggestions"]]

    assert visible == snapshot == ["C1", "C2", "T1", "T2"]
    assert graph._resolve_suggested_product(session, "món số 3")["product_id"] == "T1"


def test_recommendations_use_recursive_authoritative_category_path(monkeypatch):
    queries = []

    class Rows:
        def __init__(self, rows): self.rows = rows
        def mappings(self): return self
        def all(self): return self.rows

    class Connection:
        def __enter__(self): return self
        def __exit__(self, *_args): return None
        def execute(self, query, _params):
            sql = str(query)
            queries.append(sql)
            if "AS product_id" in sql:
                return Rows([{"product_id": "A1", "product_name": "Americano Classic",
                              "final_price": 55000, "hinh_anh_url": None,
                              "category": "Americano", "parent_category": "Cà Phê"}])
            return Rows([{"ten_san_pham": "Americano Classic"}])

    class Engine:
        def connect(self): return Connection()

    monkeypatch.setattr(product_tools, "_get_engine", lambda: Engine())
    result = product_tools.execute_get_recommendations(
        category="drink", search_text="cà phê", top_k=8)

    assert result["status"] == "ok"
    assert result["products"][0]["product_id"] == "A1"
    assert all("WITH RECURSIVE ancestors" in sql and "category_paths" in sql for sql in queries)


def test_greeting_contrasts_do_not_change_business_owner():
    session = _reset("greeting-contrast")
    cart_manager.set_checkout_context(session, last_product_suggestions=[COFFEE])

    add = graph._understand({"session_id": session,
        "user_message": "hello cho tôi cà phê muối 2 ly", "history": [],
        "cart": cart_manager.get_cart(session)})["intent"]
    info = interpret_shopping("hello cà phê muối ngon không", snapshot=[COFFEE])
    checkout = graph._understand({"session_id": session, "user_message": "hello đặt hàng",
        "history": [], "cart": cart_manager.get_cart(session)})["intent"]
    edit = interpret_shopping("hello sửa topping món trong giỏ", snapshot=[COFFEE])

    assert add["intent"] == "ADD_ITEM" and add["quantity"] == 2
    assert add["resolved_products"][0]["product_id"] == "salt"
    assert info.act == "PRODUCT_INFO" and info.read_only
    assert checkout["intent"] in {"FINISH_CART", "START_CHECKOUT"}
    assert edit.act == "NOT_APPLICABLE"
