import pytest

from src.agents import agent_service, order_flow_graph
from src.agents.location_parser import checkout_location, merge_store_location
from src.agents.order_flow_graph import _resolve_cart_option_update, _understand, run_order_flow
from src.agents.tier1 import classify_order_intent
from src.common import cart_manager


def _reset(session):
    cart_manager.reset_conversation_draft(session)
    cart_manager.replace_items_from_order_cart(session, [])


def test_hot_weather_offer_persists_typed_recommendation_expectation(monkeypatch):
    from src.function_calling.tools import cart_tools

    session = "owned-recommendation-offer"
    _reset(session)
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(agent_service, "_run_agent_impl", lambda *_args, **_kwargs: {
        "reply": "Bạn có muốn mình gợi ý đồ uống không?", "checkout_payload": None,
        "tool_calls_log": [], "error": None,
    })

    result = run_order_flow(session, "hôm nay trời nóng quá")
    pending = cart_manager.get_pending_action(session)
    assert "gợi ý" in result["reply"].lower()
    assert pending["type"] == "offer_recommendation"
    assert pending["params"]["category"] == "drink"


@pytest.mark.parametrize("reply", ["oke", "được", "gợi ý đi", "dạ được", "ừ xem thử"])
def test_short_affirmation_uses_stored_recommendation_category(monkeypatch, reply):
    from src.function_calling.tools import cart_tools, product_tools

    session = "owned-recommendation-accept-" + str(abs(hash(reply)))
    _reset(session)
    cart_manager.set_pending_action(session, "offer_recommendation", {
        "domain": "PRODUCT_DISCOVERY", "action": "RECOMMEND", "category": "drink",
    })
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    calls = []
    monkeypatch.setattr(product_tools, "execute_get_recommendations", lambda **kwargs: calls.append(kwargs) or {
        "status": "ok", "products": [{"product_id": "D1", "product_name": "Danh sách nước",
                                          "category": "Cà Phê", "final_price": 39000}],
    })
    monkeypatch.setattr(agent_service, "_run_agent_impl",
                        lambda *_args, **_kwargs: pytest.fail("generic LLM must not own offer reply"))

    result = run_order_flow(session, reply)
    assert "Danh sách nước" in result["reply"]
    assert calls == [{"category": "drink", "search_text": None, "top_k": 10}]
    assert cart_manager.get_pending_action(session) is None


def test_option_turn_merges_quantity_before_single_idempotent_add(monkeypatch):
    from src.function_calling.tools import cart_tools, product_tools

    session = "owned-option-quantity"
    _reset(session)
    cart_manager.set_pending_products(session, [{
        "product_id": "A1", "product_name": "Americano Chanh Leo", "quantity": 1,
        "operation_id": "stable-add-A1", "mutation_status": "not_started",
        "options": {"groups": {"Kích thước": ["Vừa", "Lớn"]}},
        "option_schema": [{"name": "Kích thước", "field": "size", "values": ["Vừa", "Lớn"],
                           "required": True, "default": "Vừa"}],
    }])
    cart_manager.set_pending_action(session, "fill_options", {"count": 1})
    monkeypatch.setattr(product_tools, "execute_check_price_and_stock", lambda **kwargs: {
        "status": "ok", "products": [{"product_id": "A1", "product_name": "Americano Chanh Leo",
                                        "final_price": 49000}],
    })
    writes = []
    monkeypatch.setattr(cart_tools, "execute_add_to_cart",
                        lambda **kwargs: writes.append(kwargs) or {"status": "ok", "persisted_line": {"id": 1}})

    agent_service._complete_pending_products_from_options(session, "theo mặc định cho tôi đi, cho tôi 2 ly nhé")
    assert len(writes) == 1
    assert writes[0]["quantity"] == 2
    assert writes[0]["operation_id"] == "stable-add-A1"


def test_pending_quantity_namespace_rejects_ambiguous_multi_product_and_ordinals():
    from src.agents.option_state import pending_product_quantity

    assert pending_product_quantity("cho 2 cái", 2) == (2, True)
    assert pending_product_quantity("mỗi món 2 cái", 2) == (2, False)
    assert pending_product_quantity("chi nhánh số 2", 1) == (None, False)
    assert pending_product_quantity("voucher số 2", 1) == (None, False)
    assert pending_product_quantity("42/3 Nguyễn Hữu Tiến", 1) == (None, False)
    assert classify_order_intent("món số 4, cho tôi 2 ly")["quantity"] == 2


def test_pickup_admin_components_survive_comma():
    parsed = checkout_location("phường Gò Vấp, TP Hồ Chí Minh", "MANG_DI", True)
    assert parsed.kind == "area"
    assert "Gò Vấp" in parsed.value
    assert "Hồ Chí Minh" in parsed.value


def test_explicit_pickup_location_is_not_labelled_as_saved_address(monkeypatch):
    from src.function_calling.tools import branch_tools

    session = "owned-location-provenance"
    _reset(session)
    cart_manager.set_checkout_prefs(session, "NGAN_HANG_QR", "MANG_DI")
    cart_manager.set_checkout_context(session, suggested_address="Phường Gò Vấp, Thành phố Hồ Chí Minh",
                                      location_source="explicit_user")
    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", lambda **_kwargs: {
        "status": "need_branch_selection", "branches": [{
            "ma_chi_nhanh": "GV1", "ten_chi_nhanh": "Cửa hàng Gò Vấp",
            "dia_chi": "Quận Gò Vấp, Thành phố Hồ Chí Minh", "availability_status": "available",
        }],
    })

    result = agent_service._confirm_saved_location(session, "đúng địa chỉ đó")
    assert "địa chỉ đã lưu" not in result["reply"].lower()
    assert "khu vực bạn vừa cung cấp" in result["reply"].lower()


def test_pickup_location_fragments_merge_before_branch_search(monkeypatch):
    from src.function_calling.tools import branch_tools

    session = "owned-location-merge"
    _reset(session)
    cart_manager.set_checkout_prefs(session, "NGAN_HANG_QR", "MANG_DI")
    cart_manager.set_checkout_context(session, checkout_requested=True, location_pending=True)
    calls = []

    def find(**kwargs):
        calls.append(kwargs["location"])
        if "Hồ Chí Minh" not in kwargs["location"]:
            return {"status": "need_city", "normalized_location": kwargs["location"],
                    "message": "Mình đã giữ Gò Vấp; bạn cho mình thêm tỉnh/thành phố nhé."}
        return {"status": "need_branch_selection", "normalized_location": kwargs["location"],
                "branches": [{"ma_chi_nhanh": "GV1", "ten_chi_nhanh": "Gò Vấp",
                              "dia_chi": kwargs["location"], "availability_status": "available"}]}

    monkeypatch.setattr(branch_tools, "execute_find_nearest_branch", find)
    first = order_flow_graph._handle_location_request({
        "session_id": session, "user_message": "không, tôi đang ở phường Gò Vấp", "history": [],
    })
    partial = cart_manager.get_checkout_prefs(session)["store_location"]
    assert partial["locality"] == "phường Gò Vấp"
    assert partial["status"] == "partial"
    assert "đã giữ Gò Vấp" in first["reply"]

    second = order_flow_graph._handle_location_request({
        "session_id": session, "user_message": "thành phố HCM ấy bạn ơi", "history": [],
    })
    merged = cart_manager.get_checkout_prefs(session)["store_location"]
    assert merged["status"] == "complete"
    assert "Gò Vấp" in calls[-1] and "Hồ Chí Minh" in calls[-1]
    assert "địa chỉ đã lưu" not in second["reply"].lower()


@pytest.mark.parametrize("correction,expected", [
    ("không, Tân Phú cơ", "Tân Phú"),
    ("đổi sang Bình Thạnh", "Bình Thạnh"),
])
def test_pickup_location_correction_replaces_only_locality(correction, expected):
    previous = merge_store_location(None, "phường Gò Vấp, TP HCM")
    corrected = merge_store_location(previous, correction)
    assert corrected["locality"] == expected
    assert corrected["city"] == "Thành phố Hồ Chí Minh"
    assert corrected["status"] == "complete"


def test_generic_model_cannot_create_unowned_actionable_offer(monkeypatch):
    from src.function_calling.tools import cart_tools

    session = "unowned-generic-offer"
    _reset(session)
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(agent_service, "_run_agent_impl", lambda *_args, **_kwargs: {
        "reply": "Chào bạn.\nBạn có muốn mình gợi ý đồ uống không?",
        "checkout_payload": None, "tool_calls_log": [], "error": None,
    })

    result = run_order_flow(session, "xin chào")
    assert "có muốn" not in result["reply"].lower()
    assert "yêu cầu mình" in result["reply"].lower()
    assert cart_manager.get_pending_action(session) is None


def test_cart_option_actions_are_scoped_per_group(monkeypatch):
    from src.function_calling.tools import product_tools

    monkeypatch.setattr(product_tools, "execute_get_product_options", lambda _name: {
        "status": "ok", "options": {
            "Topping": ["Foam Dừa", "Hạt Sen", "Trái Vải"],
            "Độ ngọt": ["Ít ngọt", "Thêm ngọt"],
        },
    })
    item = {"product_id": "A1", "product_name": "Americano", "quantity": 2,
            "toppings": ["Foam Dừa"], "do_ngot": "Ít ngọt"}
    desired, _ = _resolve_cart_option_update(
        item, "đổi topping thành Hạt Sen và Trái Vải, thêm ngọt"
    )
    assert desired["toppings"] == ["Hạt Sen", "Trái Vải"]
    assert desired["do_ngot"] == "Thêm ngọt"
    assert desired["quantity"] == 2


def test_remove_specific_topping_preserves_other_values(monkeypatch):
    from src.function_calling.tools import product_tools

    monkeypatch.setattr(product_tools, "execute_get_product_options", lambda _name: {
        "status": "ok", "options": {"Topping": ["Hạt Sen", "Trái Vải"]},
    })
    item = {"product_id": "A1", "product_name": "Americano", "quantity": 1,
            "toppings": ["Hạt Sen", "Trái Vải"]}
    desired, _ = _resolve_cart_option_update(item, "bỏ topping Hạt Sen")
    assert desired["toppings"] == ["Trái Vải"]
    cleared, _ = _resolve_cart_option_update(item, "bỏ topping")
    assert cleared["toppings"] == []


def test_polite_explicit_cart_edit_is_not_read_only_browsing():
    assert classify_order_intent("sửa topping thành Hạt Sen được không?")["intent"] == "EDIT_OPTIONS"


@pytest.mark.parametrize("message,slot", [
    ("COD nhưng dùng QR", "payment"),
    ("lấy tại quán nhưng giao tận nơi", "fulfillment"),
])
def test_conflicting_checkout_slots_are_typed_and_do_not_mutate(message, slot):
    from src.agents.agent_service import _checkout_choice_conflict

    session = "checkout-conflict-" + slot
    _reset(session)
    cart_manager.set_checkout_context(session, checkout_requested=True)
    cart_manager.set_pending_action(session, "select_checkout_choices", {})
    state = _understand({"session_id": session, "user_message": message, "history": [],
                         "cart": cart_manager.get_cart(session)})
    assert _checkout_choice_conflict(message) == slot
    assert state["intent"] == {"intent": "CHECKOUT_CHOICE_CONFLICT", "slot": slot}
    prefs = cart_manager.get_checkout_prefs(session)
    assert not prefs.get("delivery_type") and not prefs.get("payment_method")
