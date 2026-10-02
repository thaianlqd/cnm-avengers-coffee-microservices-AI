import pytest

from src.agents.order_flow_graph import _understand, run_order_flow
from src.agents.tier1 import classify_order_intent
from src.common import cart_manager


def _seed(session, rows):
    cart_manager.reset_conversation_draft(session)
    cart_manager.replace_items_from_order_cart(session, rows)
    cart_manager.set_checkout_context(session, flow_stage="CART_REVIEW")


def _install_cart_fakes(monkeypatch, session, option_groups):
    from src.agents import agent_service, order_flow_graph
    from src.function_calling.tools import cart_tools, product_tools

    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(product_tools, "execute_get_product_options", lambda _name: {
        "status": "ok", "options": option_groups,
    })
    monkeypatch.setattr(product_tools, "execute_get_product_insights",
                        lambda *_args, **_kwargs: pytest.fail("product insights reached"))
    monkeypatch.setattr(product_tools, "execute_get_recommendations",
                        lambda *_args, **_kwargs: pytest.fail("recommendations reached"))
    monkeypatch.setattr(agent_service, "_run_agent_impl", lambda *_args, **_kwargs: pytest.fail("generic LLM reached"))
    monkeypatch.setattr(order_flow_graph, "_browse_ask_more", lambda *_args, **_kwargs: pytest.fail("browse route reached"))


@pytest.mark.parametrize("message", [
    "sửa topping thành hạt sen",
    "chỉnh topping món này thành hạt sen",
    "đổi topping sang hạt sen",
    "cập nhật topping hạt sen",
    "cho món này thêm hạt sen",
    "thêm hạt sen vào món trong giỏ",
    "cho ngọt hơn",
    "đổi sang thêm ngọt",
    "bớt đá giúp mình",
    "cho size lớn",
    "chỉnh size lớn, ít đá, thêm ngọt",
])
def test_cart_edit_paraphrases_have_structural_transaction_route(message):
    assert classify_order_intent(message)["intent"] == "EDIT_OPTIONS"


@pytest.mark.parametrize("message", [
    "sửa địa chỉ giao hàng",
    "đổi sang QR",
    "đổi voucher",
    "cập nhật thông tin tài khoản",
    "thêm một Matcha mới",
    "bỏ voucher",
    "xóa địa chỉ này",
    "xem topping của Americano có gì",
])
def test_shared_verbs_use_business_object_and_do_not_become_cart_edit(message):
    assert classify_order_intent(message)["intent"] != "EDIT_OPTIONS"


@pytest.mark.parametrize("message", [
    "Americano Chanh Leo có vị gì?",
    "Americano có topping gì?",
    "gợi ý nước mát",
    "xem thêm bánh",
])
def test_browsing_requires_positive_read_evidence(message):
    assert classify_order_intent(message)["intent"] == "BROWSING"


def test_unknown_and_general_chat_are_distinct_from_browsing():
    assert classify_order_intent("hôm nay trời nóng quá")["intent"] == "GENERAL_CHAT"
    assert classify_order_intent("lorem ipsum khó hiểu")["intent"] == "UNKNOWN"
    assert classify_order_intent("cập nhật đi")["intent"] == "TRANSACTION_AMBIGUOUS"


def test_observed_multifield_edit_updates_unique_authoritative_line_once(monkeypatch):
    session = "observed-systemic-cart-edit"
    _seed(session, [{
        "id": 41, "ma_san_pham": "AM-PF", "ten_san_pham": "Americano Chanh Leo",
        "gia_ban": 59000, "so_luong": 1, "size": "Lớn", "toppings": [],
        "luong_da": "Ít đá", "do_ngot": "Ít ngọt", "loai_sua": "Sữa tươi",
    }])
    _install_cart_fakes(monkeypatch, session, {
        "Kích thước": ["Vừa", "Lớn"],
        "Topping": ["Hạt Sen", "Trái Vải", "Foam Dừa"],
        "Lượng đá": ["Ít đá", "Đá bình thường"],
        "Độ ngọt": ["Ít ngọt", "Thêm ngọt"],
        "Loại sữa": ["Sữa tươi", "Sữa yến mạch"],
    })
    from src.function_calling.tools import cart_tools
    writes = []

    def update(sid, line_id, desired):
        writes.append((line_id, desired))
        rows = [{
            "id": 41, "ma_san_pham": "AM-PF", "ten_san_pham": "Americano Chanh Leo",
            "gia_ban": 59000, "so_luong": 1, **{
                key: desired.get(key) for key in ("size", "toppings", "luong_da", "do_ngot", "loai_sua")
            },
        }]
        cart = cart_manager.replace_items_from_order_cart(sid, rows)
        return {"status": "ok", "cart": cart, "quote": {"subtotal": 59000, "final_total": 59000}}

    monkeypatch.setattr(cart_tools, "execute_update_cart_item", update)
    result = run_order_flow(session, "sửa thành topping hạt sen và trái vải, thêm ngọt cho tôi đi bạn")

    assert len(writes) == 1
    line_id, desired = writes[0]
    assert line_id == "41"
    assert desired["toppings"] == ["Hạt Sen", "Trái Vải"]
    assert desired["do_ngot"] == "Thêm ngọt"
    assert desired["size"] == "Lớn"
    assert desired["luong_da"] == "Ít đá"
    assert desired["loai_sua"] == "Sữa tươi"
    assert "Đã cập nhật tùy chọn" in result["reply"]
    assert [entry["tool"] for entry in result["tool_calls_log"]].count("update_cart_item") == 1
    assert not {"get_product_insights", "get_recommendations"} & {
        entry["tool"] for entry in result["tool_calls_log"]
    }


def test_multiline_edit_preserves_requested_change_until_line_choice(monkeypatch):
    session = "systemic-multiline-edit"
    _seed(session, [
        {"id": 11, "ma_san_pham": "M", "ten_san_pham": "Matcha", "gia_ban": 45000,
         "so_luong": 1, "size": "M", "toppings": ["Foam Dừa"]},
        {"id": 12, "ma_san_pham": "M", "ten_san_pham": "Matcha", "gia_ban": 50000,
         "so_luong": 1, "size": "L", "toppings": ["Hạt Sen"]},
        {"id": 13, "ma_san_pham": "A", "ten_san_pham": "Americano", "gia_ban": 39000,
         "so_luong": 1, "size": "M"},
    ])
    _install_cart_fakes(monkeypatch, session, {"Topping": ["Foam Dừa", "Hạt Sen", "Trái Vải"]})
    from src.function_calling.tools import cart_tools
    writes = []
    monkeypatch.setattr(cart_tools, "execute_update_cart_item",
                        lambda _sid, line_id, desired: writes.append((line_id, desired)) or {
                            "status": "ok", "cart": cart_manager.get_cart(_sid),
                            "quote": {"subtotal": 134000, "final_total": 134000},
                        })
    monkeypatch.setattr(cart_tools, "execute_get_cart_quote", lambda _sid: {
        "status": "ok", "quote": {"subtotal": 134000, "final_total": 134000},
    })

    first = run_order_flow(session, "sửa topping Matcha thành Trái Vải")
    pending = cart_manager.get_pending_action(session)
    assert writes == []
    assert pending["type"] == "cart_line_choice"
    assert pending["params"]["operation"] == "EDIT_OPTIONS"
    assert "Trái Vải" in pending["params"]["requested_value"]
    assert "1. Matcha (M" in first["reply"] and "2. Matcha (L" in first["reply"]

    second = run_order_flow(session, "dòng 2")
    assert len(writes) == 1
    assert writes[0][0] == "12"
    assert writes[0][1]["toppings"] == ["Trái Vải"]
    assert "Đã cập nhật tùy chọn" in second["reply"]


def test_update_now_resumes_only_a_typed_pending_edit(monkeypatch):
    from src.function_calling.tools import cart_tools

    session = "typed-edit-resume"
    row = {"id": 51, "ma_san_pham": "A", "ten_san_pham": "Americano",
           "gia_ban": 39000, "so_luong": 1, "size": "M"}
    _seed(session, [row])
    _install_cart_fakes(monkeypatch, session, {"Topping": ["Hạt Sen"]})
    writes = []
    monkeypatch.setattr(cart_tools, "execute_update_cart_item",
                        lambda _sid, line_id, desired: writes.append((line_id, desired)) or {
                            "status": "ok", "cart": cart_manager.get_cart(_sid),
                            "quote": {"subtotal": 39000, "final_total": 39000},
                        })

    no_pending = run_order_flow(session, "cập nhật đi")
    assert writes == []
    assert "Bạn muốn đổi" in no_pending["reply"]

    cart_manager.set_pending_action(session, "edit_cart_item", {
        "operation": "EDIT_OPTIONS", "cart_item_id": "51",
        "requested_option_text": "topping Hạt Sen",
        "requested_patch": {"quantity": 1, "size": "M", "toppings": ["Hạt Sen"]},
        "missing": "retry",
    })
    resumed = run_order_flow(session, "cập nhật đi")
    assert len(writes) == 1 and writes[0][0] == "51"
    assert "Đã cập nhật tùy chọn" in resumed["reply"]


def test_generic_model_transaction_promise_is_not_surfaced(monkeypatch):
    from src.agents import agent_service
    from src.function_calling.tools import cart_tools

    session = "false-transaction-promise"
    _seed(session, [])
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(agent_service, "_run_agent_impl", lambda *_args, **_kwargs: {
        "reply": "Mình sẽ cập nhật món trong giỏ hàng nhé.",
        "checkout_payload": None, "tool_calls_log": [], "error": None,
    })
    result = run_order_flow(session, "hôm nay trời nóng quá")
    assert result["reply"] != "Mình sẽ cập nhật món trong giỏ hàng nhé."
    assert "Yêu cầu sửa giỏ chưa được ghi" in result["reply"]


def test_failed_edit_keeps_typed_retry_and_never_claims_success(monkeypatch):
    session = "failed-edit-retry"
    _seed(session, [{"id": 61, "ma_san_pham": "A", "ten_san_pham": "Americano",
                     "gia_ban": 39000, "so_luong": 1, "size": "M"}])
    _install_cart_fakes(monkeypatch, session, {"Topping": ["Hạt Sen"]})
    from src.function_calling.tools import cart_tools
    monkeypatch.setattr(cart_tools, "execute_update_cart_item", lambda *_args, **_kwargs: {
        "status": "error", "message": "Order Service tạm thời không cập nhật được.",
    })

    result = run_order_flow(session, "sửa topping thành Hạt Sen")
    assert "Đã cập nhật" not in result["reply"]
    assert cart_manager.get_pending_action(session)["params"]["missing"] == "retry"


def test_invalid_option_value_does_not_write_and_keeps_exact_target(monkeypatch):
    session = "invalid-option-edit"
    _seed(session, [{"id": 71, "ma_san_pham": "A", "ten_san_pham": "Americano",
                     "gia_ban": 39000, "so_luong": 1, "size": "M"}])
    _install_cart_fakes(monkeypatch, session, {"Topping": ["Hạt Sen", "Trái Vải"]})
    from src.function_calling.tools import cart_tools
    monkeypatch.setattr(cart_tools, "execute_update_cart_item",
                        lambda *_args, **_kwargs: pytest.fail("invalid option must not write"))

    result = run_order_flow(session, "sửa topping thành kim cương")
    pending = cart_manager.get_pending_action(session)
    assert pending["type"] == "edit_cart_item"
    assert pending["params"]["cart_item_id"] == "71"
    assert "Hạt Sen" in result["reply"] and "Trái Vải" in result["reply"]
    assert not any(entry["tool"] == "update_cart_item" for entry in result["tool_calls_log"])


def test_mixed_valid_and_invalid_toppings_reject_the_entire_cart_patch(monkeypatch):
    session = "mixed-invalid-topping-edit"
    _seed(session, [{"id": 72, "ma_san_pham": "A", "ten_san_pham": "Americano Phúc Bồn Tử",
                     "gia_ban": 75000, "so_luong": 1, "size": "Lớn", "toppings": []}])
    _install_cart_fakes(monkeypatch, session, {"Topping": ["Hạt Sen", "Trái Vải"]})
    from src.function_calling.tools import cart_tools
    monkeypatch.setattr(cart_tools, "execute_update_cart_item",
                        lambda *_args, **_kwargs: pytest.fail("mixed invalid topping must not write"))

    result = run_order_flow(session, "món nước tôi muốn thêm topping hạt sen và foam dừa")

    assert "foam dừa" in result["reply"].lower()
    assert "Giỏ hàng chưa thay đổi" in result["reply"]
    assert cart_manager.get_cart(session)["items"][0].get("toppings") == []
    assert not any(entry["tool"] == "update_cart_item" for entry in result["tool_calls_log"])


def test_pending_edit_survives_read_only_turn_but_explicit_other_action_supersedes_it():
    session = "pending-edit-precedence"
    _seed(session, [{"id": 81, "ma_san_pham": "A", "ten_san_pham": "Americano",
                     "gia_ban": 39000, "so_luong": 1, "size": "M"}])
    cart_manager.set_pending_action(session, "edit_cart_item", {
        "operation": "EDIT_OPTIONS", "cart_item_id": "81", "missing": "option",
    })
    state = {"session_id": session, "user_message": "xem menu nước", "history": [],
             "cart": cart_manager.get_cart(session)}
    assert _understand(state)["intent"]["intent"] == "BROWSING"
    assert cart_manager.get_pending_action(session)["type"] == "edit_cart_item"

    state["user_message"] = "đổi sang QR"
    assert _understand(state)["intent"]["intent"] == "SELECT_PAYMENT"
    assert cart_manager.get_pending_action(session) is None
