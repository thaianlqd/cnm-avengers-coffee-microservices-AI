"""Contract regressions for recommendation selection and canonical options."""
import pytest

from src.agents import order_flow_graph
from src.common import cart_manager
from src.function_calling.tools import cart_tools, product_tools


def _reset(session):
    cart_manager.reset_conversation_draft(session)
    cart_manager.replace_items_from_order_cart(session, [])


def _drink_snapshot(session, count=8):
    products = [{
        "product_id": f"D{index}", "product_name": f"Nước {index}",
        "category": "drink", "menu_bucket": "drink",
        "display_index": index, "global_display_index": index,
        "group_display_index": index,
    } for index in range(1, count + 1)]
    cart_manager.set_checkout_context(
        session, last_product_suggestions=products,
        product_suggestion_snapshots={"drink": products},
        product_suggestion_mode="flat",
    )
    return products


def test_recommendation_offer_accept_uses_structured_category_without_search_keyword(monkeypatch):
    session = "surgical-offer-structured"
    _reset(session)
    cart_manager.set_pending_action(session, "offer_recommendation", {
        "domain": "PRODUCT_DISCOVERY", "action": "RECOMMEND", "category": "drink",
    })
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    calls = []

    def recommendations(**kwargs):
        calls.append(kwargs)
        return {"status": "ok", "products": [{
            "product_id": "D1", "product_name": "Cà Phê Muối Avenger",
            "category": "Cà Phê", "final_price": 49000,
        }]}

    monkeypatch.setattr(product_tools, "execute_get_recommendations", recommendations)
    result = order_flow_graph.run_order_flow(session, "oke bạn ơi")

    assert len(calls) == 1
    assert calls[0]["category"] == "drink"
    assert calls[0].get("search_text") is None
    assert "Cà Phê Muối Avenger" in result["reply"]
    assert "không tìm thấy" not in result["reply"]


def test_recommendation_offer_accept_does_not_reparse_synthetic_catalog_text(monkeypatch):
    session = "surgical-offer-no-reparse"
    _reset(session)
    cart_manager.set_pending_action(session, "offer_recommendation", {
        "domain": "PRODUCT_DISCOVERY", "action": "RECOMMEND", "category": "food",
    })
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    calls = []
    monkeypatch.setattr(product_tools, "execute_get_recommendations", lambda **kwargs: calls.append(kwargs) or {
        "status": "ok", "products": [{"product_id": "F1", "product_name": "Bánh Cà Phê",
                                         "category": "Bánh Mặn", "final_price": 39000}]})

    result = order_flow_graph.run_order_flow(session, "đượccc")
    assert calls == [{"category": "food", "search_text": None, "top_k": 10}]
    assert "Bánh Cà Phê" in result["reply"]


def test_explicit_menu_water_flow_still_works_after_offer_fix(monkeypatch):
    session = "surgical-explicit-menu"
    _reset(session)
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    calls = []
    monkeypatch.setattr(product_tools, "execute_get_recommendations", lambda **kwargs: calls.append(kwargs) or {
        "status": "ok", "products": [{"product_id": "D1", "product_name": "Americano",
                                         "category": "Cà Phê", "final_price": 39000}]})

    result = order_flow_graph.run_order_flow(session, "menu nước")
    assert calls == [{"category": "drink", "search_text": None, "top_k": 10}]
    assert "Americano" in result["reply"]


@pytest.mark.parametrize("message,expected", [
    ("món số 1 và món số 8", ["D1", "D8"]),
    ("nước số 1 và nước số 8", ["D1", "D8"]),
    ("món 8 với món 1", ["D8", "D1"]),
    ("món số 1 và món số 1", ["D1"]),
])
def test_multi_ordinal_generic_items_resolve_all_visible_indices(message, expected):
    session = "surgical-ordinal-" + str(abs(hash(message)))
    _reset(session)
    _drink_snapshot(session)
    refs = order_flow_graph._resolve_structured_references(session, message)
    assert [item["product_id"] for item in refs] == expected


def test_multi_ordinal_drink_items_resolve_all_visible_indices():
    session = "surgical-drink-ordinals"
    _reset(session)
    _drink_snapshot(session)
    refs = order_flow_graph._resolve_structured_references(session, "nước số 1 và nước số 8 á")
    assert [item["product_id"] for item in refs] == ["D1", "D8"]


def test_multi_ordinal_preserves_requested_order():
    session = "surgical-ordinal-order"
    _reset(session)
    _drink_snapshot(session)
    refs = order_flow_graph._resolve_structured_references(session, "món 8 với món 1")
    assert [item["product_id"] for item in refs] == ["D8", "D1"]


def test_multi_ordinal_duplicate_reference_is_deduplicated():
    session = "surgical-ordinal-deduplicate"
    _reset(session)
    _drink_snapshot(session)
    refs = order_flow_graph._resolve_structured_references(session, "món số 1 và món số 1")
    assert [item["product_id"] for item in refs] == ["D1"]


def test_multi_ordinal_invalid_index_does_not_partially_write(monkeypatch):
    session = "surgical-invalid-ordinal"
    _reset(session)
    _drink_snapshot(session)
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(product_tools, "execute_get_product_options",
                        lambda *_args, **_kwargs: pytest.fail("invalid batch reached option lookup"))
    monkeypatch.setattr(cart_tools, "execute_add_to_cart",
                        lambda **_kwargs: pytest.fail("invalid batch wrote cart"))

    result = order_flow_graph.run_order_flow(session, "cho tôi món số 1 và món số 99 đi bạn")
    assert "99" in result["reply"]
    assert not cart_manager.get_checkout_prefs(session).get("pending_products")
    assert len(cart_manager.get_checkout_prefs(session)["last_product_suggestions"]) == 8


class _Rows:
    def __init__(self, one=None, many=None):
        self.one = one
        self.many = many or []
    def fetchone(self):
        return self.one
    def fetchall(self):
        return self.many


def test_option_lookup_cannot_drift_to_similar_product_name(monkeypatch):
    queries = []

    class Connection:
        def __enter__(self): return self
        def __exit__(self, *_args): return None
        def execute(self, query, params):
            queries.append((str(query), dict(params)))
            if "FROM menu.san_pham" in str(query):
                assert params == {"product_id": "P1"}
                return _Rows(one=("P1", "Coffee X", None, None, None, None, None, None))
            assert params == {"pid": "P1"}
            return _Rows(many=[("Kích thước", "Vừa"), ("Kích thước", "Lớn")])
    class Engine:
        def connect(self): return Connection()

    monkeypatch.setattr(product_tools, "_get_engine", lambda: Engine())
    result = product_tools.execute_get_product_options(product_id="P1", product_name="Coffee X")
    assert result["status"] == "ok"
    assert result["product_id"] == "P1"
    assert "ma_san_pham::text = :product_id" in queries[0][0]


def test_prepare_products_loads_options_by_canonical_product_id(monkeypatch):
    session = "surgical-canonical-prepare"
    _reset(session)
    seen = []

    class Connection:
        def __enter__(self): return self
        def __exit__(self, *_args): return None
        def execute(self, query, params):
            seen.append(dict(params))
            if "FROM menu.san_pham" in str(query):
                return _Rows(one=("P1", "Coffee X", None, None, None, None, None, None))
            return _Rows(many=[("Kích thước", "Vừa"), ("Kích thước", "Lớn")])
    class Engine:
        def connect(self): return Connection()

    monkeypatch.setattr(product_tools, "_get_engine", lambda: Engine())
    result = order_flow_graph._prepare_structured_products(
        session, [{"product_id": "P1", "product_name": "Coffee X", "category": "drink"}])
    assert result.get("error") is None
    assert seen[0] == {"product_id": "P1"}
    assert cart_manager.get_checkout_prefs(session)["pending_products"][0]["product_id"] == "P1"


def test_browser_like_offer_explicit_menu_and_multi_selection_use_canonical_ids(monkeypatch):
    session = "surgical-browser-like-selection"
    _reset(session)
    cart_manager.set_pending_action(session, "offer_recommendation", {
        "domain": "PRODUCT_DISCOVERY", "action": "RECOMMEND", "category": "drink",
    })
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    products = [{"product_id": f"D{i}", "product_name": f"Nước {i}",
                 "category": "Cà Phê", "final_price": 30000 + i * 1000}
                for i in range(1, 9)]
    provider_calls = []
    monkeypatch.setattr(product_tools, "execute_get_recommendations",
                        lambda **kwargs: provider_calls.append(kwargs) or {
                            "status": "ok", "products": products})
    option_ids = []

    class Connection:
        def __enter__(self): return self
        def __exit__(self, *_args): return None
        def execute(self, query, params):
            if "FROM menu.san_pham" in str(query):
                option_ids.append(params["product_id"])
                item = next(row for row in products if row["product_id"] == params["product_id"])
                return _Rows(one=(item["product_id"], item["product_name"],
                                  None, None, None, None, None, None))
            return _Rows(many=[("Kích thước", "Vừa"), ("Kích thước", "Lớn")])
    class Engine:
        def connect(self): return Connection()
    monkeypatch.setattr(product_tools, "_get_engine", lambda: Engine())
    monkeypatch.setattr(cart_tools, "execute_add_to_cart",
                        lambda **_kwargs: pytest.fail("products with open options must remain pending"))

    accepted = order_flow_graph.run_order_flow(session, "oke bạn ơi")
    assert "Nước 8" in accepted["reply"]
    explicit = order_flow_graph.run_order_flow(session, "menu nước đi bạn")
    assert "Nước 8" in explicit["reply"]
    selected = order_flow_graph.run_order_flow(session, "cho tôi nước số 4 và số 5 nhé")

    assert provider_calls == [
        {"category": "drink", "search_text": None, "top_k": 10},
        {"category": "drink", "search_text": None, "top_k": 10},
    ]
    assert option_ids == ["D4", "D5"]
    pending = cart_manager.get_checkout_prefs(session)["pending_products"]
    assert [item["product_id"] for item in pending] == ["D4", "D5"]
    assert "Nước 4" in selected["reply"] and "Nước 5" in selected["reply"]


def test_admin_level_exact_match_does_not_confuse_ward_and_district():
    from src.agents.location_parser import locality_matches
    assert not locality_matches("Đường Một, Phường 1, Thành phố Hồ Chí Minh", "Quận 1")
    assert locality_matches("Đường Một, Quận 1, Thành phố Hồ Chí Minh", "Quận 1")


def test_branch_ranking_prefers_exact_locality_using_real_branch_tool(monkeypatch):
    from src.function_calling.tools import branch_tools
    from utils import geo

    session = "surgical-real-branch-ranking"
    _reset(session)
    cart_manager.set_checkout_context(session, delivery_type="MANG_DI")
    rows = [
        {"ma_chi_nhanh": "GV1", "ten_chi_nhanh": "Gò Vấp A",
         "dia_chi": "Quang Trung, Quận Gò Vấp, Thành phố Hồ Chí Minh",
         "vi_do": 10.83, "kinh_do": 106.67},
        {"ma_chi_nhanh": "GV2", "ten_chi_nhanh": "Gò Vấp B",
         "dia_chi": "Phan Văn Trị, Quận Gò Vấp, Thành phố Hồ Chí Minh",
         "vi_do": 10.82, "kinh_do": 106.68},
        {"ma_chi_nhanh": "Q1", "ten_chi_nhanh": "Quận 1",
         "dia_chi": "Nguyễn Huệ, Quận 1, Thành phố Hồ Chí Minh",
         "vi_do": 10.77, "kinh_do": 106.70},
    ]
    class Query:
        def mappings(self): return self
        def all(self): return rows
    class Connection:
        def __enter__(self): return self
        def __exit__(self, *_args): return None
        def execute(self, _query): return Query()
    class Engine:
        def connect(self): return Connection()
    monkeypatch.setattr(branch_tools, "_get_engine", lambda: Engine())
    monkeypatch.setattr(branch_tools, "_check_business_hours", lambda: None)
    monkeypatch.setattr(branch_tools, "validate_cart_at_branch",
                        lambda *_args: {"unavailable": [], "unverified": []})
    monkeypatch.setattr(geo, "geocode_address", lambda _location: (10.77, 106.70))

    result = branch_tools.execute_find_nearest_branch(
        location="Quận Gò Vấp, Thành phố Hồ Chí Minh", session_id=session)
    ranked = [row["ma_chi_nhanh"] for row in result["branches"]]
    assert set(ranked[:2]) == {"GV1", "GV2"}
    assert ranked.index("Q1") > ranked.index("GV1") and ranked.index("Q1") > ranked.index("GV2")
