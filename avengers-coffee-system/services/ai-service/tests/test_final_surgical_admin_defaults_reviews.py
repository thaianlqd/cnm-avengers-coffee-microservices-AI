"""Focused regressions for admin specificity, field defaults and read-only reviews."""
import uuid

import pytest

from src.agents import agent_service, order_flow_graph
from src.agents.location_parser import merge_store_location, parse_location
from src.common import cart_manager
from src.function_calling.tools import cart_tools, product_tools
from utils import geo


def _session(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex}"


class _Response:
    def __init__(self, data):
        self.data = data

    def raise_for_status(self):
        return None

    def json(self):
        return self.data


def _provider(monkeypatch, search_rows, details):
    class Client:
        def __init__(self, **_kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def get(self, url, params):
            if "/search/" in url:
                return _Response(search_rows)
            value = details[params["refid"]]
            if isinstance(value, Exception):
                raise value
            return _Response(value)

    monkeypatch.setenv("VIETMAP_API_KEY", "test-only")
    monkeypatch.setattr(geo.httpx, "Client", Client)


def _option_result():
    groups = [
        {"name": "Kích thước", "values": ["Vừa", "Lớn"], "required": True,
         "multiple": False, "default_value": "Vừa"},
        {"name": "Lượng đá", "values": ["Bình thường", "Ít đá"], "required": False,
         "multiple": False, "default_value": "Bình thường"},
        {"name": "Độ ngọt", "values": ["Bình thường", "Ít ngọt"], "required": False,
         "multiple": False, "default_value": "Bình thường"},
        {"name": "Topping", "values": ["Hạt mẫu"], "required": False,
         "multiple": True, "default_values": []},
    ]
    return {
        "status": "ok", "product_id": "P1", "product_name": "Đồ Uống Mẫu",
        "options": {row["name"]: row["values"] for row in groups},
        "option_groups": groups,
    }


def _seed_pending_options(session: str):
    option_result = _option_result()
    cart_manager.set_pending_products(session, [{
        "product_id": "P1", "product_name": "Đồ Uống Mẫu", "category": "drink",
        "quantity": 1, "options": {"groups": option_result["options"]},
        "option_schema": option_result["option_groups"],
    }])
    cart_manager.set_pending_action(session, "fill_options", {"count": 1})


def test_area_parser_preserves_typed_ward_and_city_constraints():
    parsed = parse_location("phường Alpha, thành phố Beta")
    assert parsed.kind == "area"
    assert parsed.admin_hints == ("phường Alpha", "thành phố Beta")


def test_rejecting_old_address_keeps_new_specific_admin_area():
    merged = merge_store_location(
        None,
        "không dùng địa chỉ cũ, tôi đang ở phường Alpha, thành phố Beta",
    )
    assert merged["locality"] == "phường Alpha"
    assert merged["city"] == "thành phố Beta"
    assert merged["value"] == "phường Alpha, thành phố Beta"


@pytest.mark.parametrize(
    "query,correct_detail,wrong_detail",
    [
        ("phường Alpha, thành phố Beta",
         {"ward": "Phường Alpha", "city": "Thành phố Beta"},
         {"ward": "Phường Gamma", "city": "Thành phố Beta"}),
        ("quận Alpha, thành phố Beta",
         {"district": "Quận Alpha", "city": "Thành phố Beta"},
         {"district": "Quận Gamma", "city": "Thành phố Beta"}),
    ],
)
def test_admin_resolution_requires_every_constraint_at_its_level(
    monkeypatch, query, correct_detail, wrong_detail,
):
    search = [{"ref_id": "wrong", "display": query}]
    _provider(monkeypatch, search, {
        "wrong": {"lat": 10.1, "lng": 106.1, "display": query, **wrong_detail},
    })
    rejected = geo.resolve_location(query, "area")
    assert rejected.status == "rejected"
    assert rejected.lat is None and rejected.lng is None

    _provider(monkeypatch, [{"ref_id": "right", "display": query}], {
        "right": {"lat": 10.2, "lng": 106.2, "display": query, **correct_detail},
    })
    accepted = geo.resolve_location(query, "area")
    assert accepted.status == "ok"
    assert accepted.administrative_components


def test_admin_resolution_never_uses_search_snippet_over_place_detail(monkeypatch):
    query = "phường Alpha, thành phố Beta"
    _provider(monkeypatch, [{"ref_id": "mismatch", "display": query}], {
        "mismatch": {
            "lat": 10.1, "lng": 106.1,
            "display": "Phường Gamma, Thành phố Beta",
            "ward": "Phường Gamma", "city": "Thành phố Beta",
        },
    })
    assert geo.resolve_location(query, "area").status == "rejected"


def test_admin_resolution_keeps_ambiguity_and_provider_error_distinct(monkeypatch):
    query = "phường Alpha, thành phố Beta"
    search = [{"ref_id": "one", "display": query}, {"ref_id": "two", "display": query}]
    details = {
        "one": {"lat": 10.1, "lng": 106.1, "name": "Điểm Một",
                "ward": "Phường Alpha", "city": "Thành phố Beta"},
        "two": {"lat": 10.2, "lng": 106.2, "name": "Điểm Hai",
                "ward": "Phường Alpha", "city": "Thành phố Beta"},
    }
    _provider(monkeypatch, search, details)
    assert geo.resolve_location(query, "area").status == "ambiguous"

    _provider(monkeypatch, [{"ref_id": "broken", "display": query}], {
        "broken": RuntimeError("provider unavailable"),
    })
    assert geo.resolve_location(query, "area").status == "provider_error"


def test_admin_initialism_equivalence_is_generic_and_data_backed():
    assert geo._name_equivalent("AB", "Alpha Beta")
    assert not geo._name_equivalent("AB", "Alpha Gamma")


@pytest.mark.parametrize("field_phrase", ["size mặc định", "kích thước mặc định"])
def test_field_scoped_size_default_completes_pending_add_once(monkeypatch, field_phrase):
    session = _session("field-default-add")
    _seed_pending_options(session)
    monkeypatch.setattr(product_tools, "execute_check_price_and_stock", lambda **_kwargs: {
        "status": "ok", "products": [{
            "product_id": "P1", "product_name": "Đồ Uống Mẫu", "final_price": 42000,
        }],
    })
    writes = []
    monkeypatch.setattr(cart_tools, "execute_add_to_cart", lambda **kwargs: writes.append(kwargs) or {
        "status": "ok", "cart": {"items": [], "total_price": 42000},
    })

    result = agent_service._complete_pending_products_from_options(
        session, f"{field_phrase}, ít đá, ít ngọt, không topping",
    )

    assert len(writes) == 1
    assert writes[0]["size"] == "Vừa"
    assert writes[0]["luong_da"] == "Ít đá"
    assert writes[0]["do_ngot"] == "Ít ngọt"
    assert writes[0]["toppings"] == []
    assert not cart_manager.get_checkout_prefs(session).get("pending_products")
    assert "đã thêm" in result["reply"].lower()


def test_whole_message_defaults_remain_supported(monkeypatch):
    session = _session("global-default-add")
    _seed_pending_options(session)
    monkeypatch.setattr(product_tools, "execute_check_price_and_stock", lambda **_kwargs: {
        "status": "ok", "products": [{
            "product_id": "P1", "product_name": "Đồ Uống Mẫu", "final_price": 42000,
        }],
    })
    writes = []
    monkeypatch.setattr(cart_tools, "execute_add_to_cart", lambda **kwargs: writes.append(kwargs) or {
        "status": "ok", "cart": {"items": [], "total_price": 42000},
    })
    agent_service._complete_pending_products_from_options(session, "theo mặc định")
    assert len(writes) == 1
    assert writes[0]["size"] == "Vừa"
    assert writes[0]["luong_da"] == "Bình thường"
    assert writes[0]["do_ngot"] == "Bình thường"


def test_field_scoped_default_updates_existing_line_exactly_once(monkeypatch):
    session = _session("field-default-edit")
    cart_manager.replace_items_from_order_cart(session, [{
        "id": 11, "ma_san_pham": "P1", "ten_san_pham": "Đồ Uống Mẫu",
        "gia_ban": 42000, "so_luong": 1, "kich_thuoc": "Lớn",
    }])
    monkeypatch.setattr(product_tools, "execute_get_product_options", lambda *_args, **_kwargs: _option_result())
    desired, result = order_flow_graph._resolve_cart_option_update(
        cart_manager.get_cart(session)["items"][0], "đổi size mặc định",
    )
    assert result["status"] == "ok"
    assert desired["size"] == "Vừa"


def test_field_scoped_default_edit_performs_one_patch(monkeypatch):
    session = _session("field-default-patch")
    cart_manager.replace_items_from_order_cart(session, [{
        "id": 11, "ma_san_pham": "P1", "ten_san_pham": "Đồ Uống Mẫu",
        "gia_ban": 42000, "so_luong": 1, "kich_thuoc": "Lớn",
    }])
    monkeypatch.setattr(product_tools, "execute_get_product_options", lambda *_args, **_kwargs: _option_result())
    writes = []
    monkeypatch.setattr(cart_tools, "execute_update_cart_item", lambda sid, line_id, desired: writes.append(
        (sid, line_id, desired)
    ) or {"status": "ok", "cart": cart_manager.get_cart(sid), "quote": {
        "items": [], "subtotal": 42000, "discount_amount": 0, "final_total": 42000,
    }})

    executed = order_flow_graph._execute({
        "session_id": session,
        "user_message": "đổi size mặc định của Đồ Uống Mẫu",
        "history": [],
        "cart": cart_manager.get_cart(session),
        "intent": {"intent": "EDIT_OPTIONS"},
    })["result"]

    assert len(writes) == 1
    assert writes[0][1] == "11"
    assert writes[0][2]["size"] == "Vừa"
    assert [entry["tool"] for entry in executed["tool_calls_log"]].count("update_cart_item") == 1


def test_field_default_mixed_with_invalid_topping_is_atomic(monkeypatch):
    session = _session("field-default-atomic")
    _seed_pending_options(session)
    monkeypatch.setattr(product_tools, "execute_check_price_and_stock", lambda **_kwargs: pytest.fail(
        "invalid pending options must not reach price or cart writes"
    ))
    monkeypatch.setattr(cart_tools, "execute_add_to_cart", lambda **_kwargs: pytest.fail(
        "invalid pending options must not add a partial configuration"
    ))

    result = agent_service._complete_pending_products_from_options(
        session, "size mặc định, topping Hạt mẫu và topping Không Tồn Tại",
    )

    assert "chưa khớp menu" in result["reply"]
    assert (cart_manager.get_pending_action(session) or {}).get("type") == "fill_options"
    assert cart_manager.get_cart(session)["is_empty"]


def test_review_is_authoritative_read_only_and_not_price(monkeypatch):
    session = _session("review-read-only")
    product = {"product_id": "P1", "product_name": "Đồ Uống Mẫu",
               "category": "drink", "final_price": 42000}
    cart_manager.set_checkout_context(session, last_product_suggestions=[product])
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(order_flow_graph, "_load_active_product_targets", lambda: [product])
    monkeypatch.setattr(product_tools, "execute_get_product_insights", lambda name: {
        "status": "ok", "product_name": name,
        "message": f"Món {name} hiện chưa có đánh giá nào trên hệ thống.",
    })

    result = order_flow_graph.run_order_flow(session, "Đồ Uống Mẫu được khách đánh giá thế nào?")

    assert [entry["tool"] for entry in result["tool_calls_log"]] == ["get_product_insights"]
    assert "chưa có đánh giá" in result["reply"]
    assert "42.000" not in result["reply"]
    assert cart_manager.get_cart(session)["is_empty"]


def test_price_info_remains_price_and_never_calls_reviews(monkeypatch):
    session = _session("price-read-only")
    product = {"product_id": "P1", "product_name": "Đồ Uống Mẫu",
               "category": "drink", "final_price": 42000}
    cart_manager.set_checkout_context(session, last_product_suggestions=[product])
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(order_flow_graph, "_load_active_product_targets", lambda: [product])
    monkeypatch.setattr(product_tools, "execute_get_product_insights", lambda _name: pytest.fail(
        "a price question must not query reviews"
    ))

    result = order_flow_graph.run_order_flow(session, "Đồ Uống Mẫu giá bao nhiêu?")

    assert "42.000đ" in result["reply"]
    assert not result["tool_calls_log"]
    assert cart_manager.get_cart(session)["is_empty"]


def test_review_interrupt_preserves_fill_options_and_next_turn_resumes(monkeypatch):
    session = _session("review-fill-options")
    _seed_pending_options(session)
    product = {"product_id": "P1", "product_name": "Đồ Uống Mẫu",
               "category": "drink", "final_price": 42000}
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(order_flow_graph, "_load_active_product_targets", lambda: [product])
    monkeypatch.setattr(product_tools, "execute_get_product_insights", lambda name: {
        "status": "ok", "product_name": name,
        "message": f"Món {name} được đánh giá từ dữ liệu đã xác minh.",
    })
    monkeypatch.setattr(product_tools, "execute_check_price_and_stock", lambda **_kwargs: {
        "status": "ok", "products": [{
            "product_id": "P1", "product_name": "Đồ Uống Mẫu", "final_price": 42000,
        }],
    })
    writes = []
    monkeypatch.setattr(cart_tools, "execute_add_to_cart", lambda **kwargs: writes.append(kwargs) or {
        "status": "ok", "cart": {"items": [], "total_price": 42000},
    })

    review = order_flow_graph.run_order_flow(
        session, "Đồ Uống Mẫu được khách đánh giá sao, nói đúng dữ liệu nhé?",
    )
    assert [entry["tool"] for entry in review["tool_calls_log"]] == ["get_product_insights"]
    assert writes == []
    assert (cart_manager.get_pending_action(session) or {}).get("type") == "fill_options"

    order_flow_graph.run_order_flow(
        session, "size mặc định, ít đá, ít ngọt, không topping",
    )
    assert len(writes) == 1
    assert cart_manager.get_checkout_prefs(session).get("pending_products") == []
