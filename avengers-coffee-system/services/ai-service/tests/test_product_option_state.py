"""Customer option turns patch durable Menu-backed pending product state."""
import copy
import uuid

import pytest

from src.agents import agent_service, order_flow_graph
from src.agents.option_state import option_schema_from_result, resolve_option_default
from src.common import cart_manager
from src.function_calling.tools import cart_tools, product_tools


DRINK = "Đồ uống thử"
FOOD = "Bánh thử"
DRINK_OPTIONS = {
    "status": "ok", "product_id": "D1", "product_name": DRINK,
    "options": {
        "Kích thước": ["Nhỏ", "Vừa", "Lớn"],
        "Topping": ["Hạt Sen", "Foam Dừa"],
        "Lượng đá": ["Bình thường", "Ít đá"],
        "Độ ngọt": ["Bình thường", "Thêm ngọt"],
    },
    "option_groups": [
        {"name": "Kích thước", "values": ["Nhỏ", "Vừa", "Lớn"], "required": True, "multiple": False, "fixed": False, "default_value": "Nhỏ"},
        {"name": "Topping", "values": ["Hạt Sen", "Foam Dừa"], "required": False, "multiple": True, "fixed": False},
        {"name": "Lượng đá", "values": ["Bình thường", "Ít đá"], "required": False, "multiple": False, "fixed": False, "default_value": "Bình thường"},
        {"name": "Độ ngọt", "values": ["Bình thường", "Thêm ngọt"], "required": False, "multiple": False, "fixed": False, "default_value": "Bình thường"},
    ],
}
FOOD_OPTIONS = {
    "status": "ok", "product_id": "F1", "product_name": FOOD,
    "options": {"Kích thước": ["Nhỏ"]},
    "option_groups": [{"name": "Kích thước", "values": ["Nhỏ"], "required": True, "multiple": False, "fixed": True}],
}


def _setup(monkeypatch, food=False):
    session = "option-state-" + uuid.uuid4().hex
    names = {DRINK: DRINK_OPTIONS, FOOD: FOOD_OPTIONS}
    monkeypatch.setattr(product_tools, "execute_get_product_options", lambda name=None, **_kwargs: names[name])
    price_calls, add_calls = [], []

    def price(product_name_query, **kwargs):
        price_calls.append({"name": product_name_query, **kwargs})
        return {"status": "ok", "products": [{
            "product_id": "D1" if product_name_query == DRINK else "F1",
            "product_name": product_name_query,
            "final_price": (50000 if product_name_query == DRINK else 30000)
                           + (5000 if kwargs.get("toppings") else 0),
        }]}

    def add(**kwargs):
        add_calls.append(kwargs)
        cart = cart_manager.add_item(session, kwargs["product_id"], kwargs["product_name"],
            kwargs["unit_price"], quantity=kwargs["quantity"], size=kwargs["size"],
            toppings=kwargs["toppings"], luong_da=kwargs["luong_da"], do_ngot=kwargs["do_ngot"])
        return {"status": "ok", "cart": cart}

    monkeypatch.setattr(product_tools, "execute_check_price_and_stock", price)
    monkeypatch.setattr(cart_tools, "execute_add_to_cart", add)
    refs = ([{"product_id": "F1", "product_name": FOOD, "quantity": 1}] if food else []) + [
        {"product_id": "D1", "product_name": DRINK, "quantity": 1}]
    prompt = order_flow_graph._prepare_structured_products(session, refs, "same-request")
    assert "theo mặc định" in prompt["reply"]
    pending = cart_manager.get_checkout_prefs(session)["pending_products"]
    assert pending[-1]["option_schema"][0]["required"] is True
    assert pending[-1]["option_schema"][1]["multiple"] is True
    return session, price_calls, add_calls


def _turn(session, message):
    return agent_service._complete_pending_products_from_options(session, message)


def test_immediate_default_uses_menu_values_and_skips_paid_topping(monkeypatch):
    session, prices, adds = _setup(monkeypatch)
    _turn(session, "theo mặc định đi b")
    assert len(adds) == 1
    assert adds[0]["size"] == "Nhỏ" and adds[0]["toppings"] == []
    assert adds[0]["luong_da"] == adds[0]["do_ngot"] == "Bình thường"
    assert prices[0]["size"] == "Nhỏ" and prices[0]["toppings"] == []
    assert not cart_manager.get_checkout_prefs(session).get("pending_products")


def test_size_then_defaults_keeps_customer_size(monkeypatch):
    session, _prices, adds = _setup(monkeypatch)
    reply = _turn(session, "cho tôi size lớn đi")
    assert "mặc định" in reply["reply"] and not adds
    assert cart_manager.get_checkout_prefs(session)["pending_products"][0]["selected_options"]["size"] == "Lớn"
    _turn(session, "theo mặc định đi tôi k cần chọn thêm r mà")
    assert len(adds) == 1 and adds[0]["size"] == "Lớn" and adds[0]["toppings"] == []


def test_graph_routes_no_more_customization_to_pending_option_completion(monkeypatch):
    session, _prices, adds = _setup(monkeypatch)
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    first = order_flow_graph.run_order_flow(session, "cho tôi size lớn đi")
    assert "mặc định" in first["reply"] and not adds
    final = order_flow_graph.run_order_flow(session, "không cần chọn thêm")
    assert "đã thêm đủ 1 món" in final["reply"]
    assert len(adds) == 1 and adds[0]["size"] == "Lớn"


def test_graph_recognizes_canonical_option_value_without_group_keyword(monkeypatch):
    session = "option-value-" + uuid.uuid4().hex
    result = copy.deepcopy(DRINK_OPTIONS)
    result["options"]["Loại sữa"] = ["Tươi", "Yến Mạch"]
    result["option_groups"].append({"name": "Loại sữa", "values": ["Tươi", "Yến Mạch"],
                                    "required": False, "multiple": False, "fixed": False})
    cart_manager.set_pending_products(session, [agent_service._pending_option_item(
        {"product_id": "D1", "product_name": DRINK}, result)])
    cart_manager.set_pending_action(session, "fill_options", {})
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    reply = order_flow_graph.run_order_flow(session, "Yến Mạch")
    assert "Còn cần chọn" in reply["reply"]
    selected = cart_manager.get_checkout_prefs(session)["pending_products"][0]["selected_options"]
    assert selected["loai_sua"] == "Yến Mạch"


@pytest.mark.parametrize("turns", [
    ["Lớn đi bạn", "topping hạt sen đi", "ít đá, thêm ngọt"],
    ["topping hạt sen", "ít đá, thêm ngọt, size lớn"],
])
def test_options_accumulate_in_either_turn_order(monkeypatch, turns):
    session, prices, adds = _setup(monkeypatch)
    for turn in turns:
        _turn(session, turn)
    assert len(adds) == 1
    assert {key: adds[0][key] for key in ("size", "toppings", "luong_da", "do_ngot")} == {
        "size": "Lớn", "toppings": ["Hạt Sen"], "luong_da": "Ít đá", "do_ngot": "Thêm ngọt"}
    assert prices[0]["toppings"] == ["Hạt Sen"] and prices[0]["size"] == "Lớn"
    assert adds[0]["unit_price"] == 55000


def test_no_topping_and_explicit_size_change(monkeypatch):
    session, _prices, adds = _setup(monkeypatch)
    _turn(session, "size lớn")
    _turn(session, "đổi size vừa")
    assert cart_manager.get_checkout_prefs(session)["pending_products"][0]["selected_options"]["size"] == "Vừa"
    _turn(session, "ít đá, thêm ngọt, không topping")
    assert len(adds) == 1 and adds[0]["size"] == "Vừa" and adds[0]["toppings"] == []


def test_unknown_option_is_not_silently_replaced_by_default(monkeypatch):
    session, _prices, adds = _setup(monkeypatch)
    reply = _turn(session, "size XXL theo mặc định")
    assert "chưa khớp menu" in reply["reply"] and not adds
    assert "size" not in cart_manager.get_checkout_prefs(session)["pending_products"][0]["selected_options"]
    _turn(session, "size lớn theo mặc định")
    assert len(adds) == 1 and adds[0]["size"] == "Lớn"


def test_clear_and_additive_topping_patch(monkeypatch):
    session, _prices, adds = _setup(monkeypatch)
    _turn(session, "topping hạt sen")
    _turn(session, "thêm foam dừa nữa")
    selected = cart_manager.get_checkout_prefs(session)["pending_products"][0]["selected_options"]
    assert selected["toppings"] == ["Hạt Sen", "Foam Dừa"]
    _turn(session, "bỏ topping")
    selected = cart_manager.get_checkout_prefs(session)["pending_products"][0]["selected_options"]
    assert selected["toppings"] == [] and not adds
    _turn(session, "theo mặc định")
    assert adds[0]["toppings"] == []


def test_two_products_add_once_and_replay_does_not_duplicate(monkeypatch):
    session, _prices, adds = _setup(monkeypatch, food=True)
    assert len(cart_manager.get_checkout_prefs(session)["pending_products"]) == 2
    _turn(session, "theo mặc định")
    assert [entry["product_id"] for entry in adds] == ["F1", "D1"]
    assert [entry["operation_id"] for entry in adds] == ["same-request:add_cart_line:0", "same-request:add_cart_line:1"]
    assert _turn(session, "theo mặc định") is None
    assert len(adds) == 2


def test_schema_preserves_metadata_and_old_session_does_not_require_every_group():
    schema = option_schema_from_result(DRINK_OPTIONS)
    assert schema[0]["values"] == ["Nhỏ", "Vừa", "Lớn"]
    assert schema[0]["required"] and not schema[0]["multiple"] and not schema[0]["fixed"]
    assert not schema[1]["required"] and schema[1]["multiple"]
    legacy = option_schema_from_result({"options": {"Kích thước": ["Nhỏ", "Lớn"], "Topping": ["Hạt Sen", "Foam Dừa"]}})
    assert legacy[0]["required"] and not legacy[1]["required"]
    assert resolve_option_default({"name": "Topping", "values": ["Hạt Sen"], "multiple": True, "required": True}) is None


def test_menu_option_tool_exposes_ordered_default_and_required_metadata(monkeypatch):
    class Rows:
        def __init__(self, one=None, many=None):
            self.one, self.many = one, many
        def fetchone(self):
            return self.one
        def fetchall(self):
            return self.many

    class Connection:
        def __enter__(self):
            return self
        def __exit__(self, *_args):
            return None
        def execute(self, query, _params):
            if "FROM menu.san_pham" in str(query):
                # Web consumes the first key from the same Menu JSON option source.
                return Rows(one=("D1", DRINK, {"Kích thước": {"Vừa": 50000, "Nhỏ": 45000}},
                                 {"Vừa": 50000, "Nhỏ": 45000}, None, None, None, None))
            return Rows(many=[("Kích thước", "Nhỏ"), ("Kích thước", "Vừa"),
                              ("Topping", "Hạt Sen"), ("Topping", "Foam Dừa")])

    class Engine:
        def connect(self):
            return Connection()

    monkeypatch.setattr(product_tools, "_get_engine", lambda: Engine())
    result = product_tools.execute_get_product_options(DRINK)
    assert result["status"] == "ok" and result["options"]["Kích thước"] == ["Nhỏ", "Vừa"]
    size, topping = result["option_groups"]
    assert size["required"] and not size["multiple"] and not size["fixed"]
    assert size["default_value"] == "Vừa"
    assert not topping["required"] and topping["multiple"] and not topping["fixed"]
    assert topping["default_value"] == []


def test_required_group_without_canonical_value_stays_unresolved():
    schema = option_schema_from_result({"option_groups": [
        {"name": "Kích thước", "values": [], "required": True, "multiple": False}]})
    assert len(schema) == 1 and "default_value" not in schema[0]


def test_price_lookup_uses_all_accumulated_variant_values(monkeypatch):
    class Rows:
        def __init__(self, rows):
            self.rows = rows
        def mappings(self):
            return self
        def all(self):
            return self.rows
        def fetchall(self):
            return self.rows

    class Connection:
        def __enter__(self):
            return self
        def __exit__(self, *_args):
            return None
        def execute(self, query, _params):
            if "FROM menu.san_pham sp" in str(query):
                return Rows([{"product_id": "D1", "ten_san_pham": DRINK, "gia_ban": 50000,
                              "trang_thai": True, "category": "Đồ uống", "parent_category": "Đồ uống"}])
            return Rows([("Kích thước", "Lớn", 60000), ("Topping", "Hạt Sen", 5000),
                         ("Lượng đá", "Ít đá", 0), ("Độ ngọt", "Thêm ngọt", 1000)])

    class Engine:
        def connect(self):
            return Connection()

    monkeypatch.setattr(product_tools, "_get_engine", lambda: Engine())
    result = product_tools.execute_check_price_and_stock(DRINK, size="Lớn",
        toppings=["Hạt Sen"], luong_da="Ít đá", do_ngot="Thêm ngọt")
    assert result["status"] == "ok"
    assert result["products"][0]["final_price"] == 66000
    assert result["products"][0]["size_surcharge"] == 10000


def test_toppig_typo_and_drink_defaults():
    from src.agents.option_state import validate_explicit_multi_value_group, resolve_option_default
    group = {"name": "Topping", "values": ["Hạt Sen", "Trái Vải"], "multiple": True, "required": False}
    schema = [
        {"name": "Kích thước", "values": ["Lớn", "Nhỏ", "Vừa"], "required": True, "multiple": False},
        group,
        {"name": "Lượng đá", "values": ["Ít đá", "Đá riêng", "Bình thường"], "required": False, "multiple": False},
        {"name": "Độ ngọt", "values": ["Ít ngọt", "Thêm ngọt", "Bình thường"], "required": False, "multiple": False},
    ]

    # Verify 'toppig' typo matches
    ev = validate_explicit_multi_value_group(
        "cho toi size lon toppig hat sen va trai vai, it da va them ngot nhe",
        group, schema
    )
    assert ev is not None
    assert ev["valid_values"] == ["Hạt Sen", "Trái Vải"]

    # Verify standard defaults
    product_data = {
        "sizes": {"Lớn": 75000, "Nhỏ": 59000, "Vừa": 65000},
        "gia_ban": 65000.0,
        "luong_da": {"Ít đá": 0, "Đá riêng": 0, "Bình thường": 0},
        "do_ngot": {"Ít ngọt": 0, "Thêm ngọt": 0, "Bình thường": 0},
    }
    assert resolve_option_default(schema[0], product_data) == "Vừa"
    assert resolve_option_default(schema[2], product_data) == "Bình thường"
    assert resolve_option_default(schema[3], product_data) == "Bình thường"

