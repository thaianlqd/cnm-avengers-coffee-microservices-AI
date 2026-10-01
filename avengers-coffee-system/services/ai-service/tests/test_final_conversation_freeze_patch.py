"""Final contract regressions for read-only interrupts and ordinal ownership."""
import uuid

import pytest

from src.agents import agent_service, order_flow_graph
from src.common import cart_manager
from src.function_calling.tools import cart_tools, product_tools


PRODUCT = {
    "product_id": "P-SYNTH-1",
    "product_name": "Đồ Uống Mẫu",
    "category": "drink",
    "final_price": 42000,
}


def _session(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex}"


def _state(session: str, message: str, *, intent=None):
    state = {
        "session_id": session,
        "user_message": message,
        "history": [],
        "cart": cart_manager.get_cart(session),
    }
    if intent is not None:
        state["intent"] = intent
    return state


def _sync_local(monkeypatch):
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: cart_manager.get_cart(sid))
    monkeypatch.setattr(cart_tools, "is_authenticated_cart_session", lambda _sid: False)


def _seed_pending_options(session: str):
    groups = [
        {"name": "Kích thước", "values": ["Vừa", "Lớn"], "required": True,
         "multiple": False, "default_value": "Vừa"},
        {"name": "Lượng đá", "values": ["Bình thường", "Ít đá"], "required": False,
         "multiple": False, "default_value": "Bình thường"},
        {"name": "Độ ngọt", "values": ["Bình thường", "Ít ngọt"], "required": False,
         "multiple": False, "default_value": "Bình thường"},
        {"name": "Topping", "values": ["Hạt Mẫu"], "required": False,
         "multiple": True, "default_values": []},
    ]
    cart_manager.set_pending_products(session, [{
        "product_id": PRODUCT["product_id"],
        "product_name": PRODUCT["product_name"],
        "category": PRODUCT["category"],
        "quantity": 1,
        "options": {"groups": {row["name"]: row["values"] for row in groups}},
        "option_schema": groups,
        "selected_options": {"Lượng đá": "Ít đá"},
    }])
    cart_manager.set_pending_action(session, "fill_options", {"count": 1})


def _pending_snapshot(session: str):
    prefs = cart_manager.get_checkout_prefs(session)
    return prefs.get("pending_action"), prefs.get("pending_products")


def _option_write_stubs(monkeypatch, writes):
    monkeypatch.setattr(product_tools, "execute_check_price_and_stock", lambda **_kwargs: {
        "status": "ok", "products": [PRODUCT],
    })
    monkeypatch.setattr(cart_tools, "execute_add_to_cart", lambda **kwargs: writes.append(kwargs) or {
        "status": "ok", "cart": {"items": [], "total_price": 42000},
    })


def test_fill_options_review_interrupt_is_read_only_and_resumable(monkeypatch):
    session = _session("options-review")
    _seed_pending_options(session)
    _sync_local(monkeypatch)
    before = _pending_snapshot(session)
    writes = []
    _option_write_stubs(monkeypatch, writes)
    monkeypatch.setattr(product_tools, "execute_get_product_insights", lambda name: {
        "status": "ok", "product_name": name,
        "message": f"{name} hiện chưa có đánh giá trên hệ thống.",
    })

    review = order_flow_graph.run_order_flow(session, "món này được khách đánh giá thế nào?")

    assert "chưa có đánh giá" in review["reply"]
    assert [row["tool"] for row in review["tool_calls_log"]] == ["get_product_insights"]
    assert writes == []
    assert _pending_snapshot(session) == before

    order_flow_graph.run_order_flow(session, "size lớn, ít đá, ít ngọt, không topping")
    assert len(writes) == 1
    assert writes[0]["product_id"] == PRODUCT["product_id"]


def test_fill_options_price_interrupt_is_read_only_and_resumable(monkeypatch):
    session = _session("options-price")
    _seed_pending_options(session)
    _sync_local(monkeypatch)
    before = _pending_snapshot(session)
    writes = []
    _option_write_stubs(monkeypatch, writes)

    price = order_flow_graph.run_order_flow(session, "món này giá bao nhiêu? tôi chỉ hỏi giá")

    assert "42.000đ" in price["reply"]
    assert writes == []
    assert _pending_snapshot(session) == before

    order_flow_graph.run_order_flow(session, "size lớn, ít đá, ít ngọt, không topping")
    assert len(writes) == 1


def test_fill_options_strong_cart_supersession_is_unchanged():
    session = _session("options-supersession")
    _seed_pending_options(session)
    intent = order_flow_graph._understand(_state(session, "xóa toàn bộ giỏ hàng"))["intent"]
    assert intent["intent"] == "CLEAR_CART"


def _render_visible_products(session: str, products):
    return order_flow_graph._render({
        **_state(session, "cho tôi xem đúng món này với giá hiện tại"),
        "result": {
            "reply": "Thông tin giá hiện tại.",
            "checkout_payload": None,
            "tool_calls_log": [{
                "tool": "check_price_and_stock",
                "args": {"product_name_query": products[0]["product_name"]},
                "result": {"status": "ok", "products": products},
            }],
            "error": None,
        },
    })["result"]


def test_single_visible_product_snapshot_supports_ordinal_info(monkeypatch):
    session = _session("single-visible-info")
    _sync_local(monkeypatch)
    rendered = _render_visible_products(session, [dict(PRODUCT)])
    assert [row["product_id"] for row in rendered["ui_payload"]["products"]] == [PRODUCT["product_id"]]

    understood = order_flow_graph._understand(_state(session, "món số 1 giá bao nhiêu? tôi chưa thêm"))
    assert understood["intent"]["intent"] == "PRODUCT_INFO"
    assert understood["intent"]["products"][0]["product_id"] == PRODUCT["product_id"]
    assert cart_manager.get_cart(session)["is_empty"]


def test_single_visible_product_snapshot_supports_canonical_selection(monkeypatch):
    session = _session("single-visible-select")
    _sync_local(monkeypatch)
    _render_visible_products(session, [dict(PRODUCT)])

    understood = order_flow_graph._understand(_state(session, "cho tôi món số 1"))
    assert understood["intent"]["intent"] == "ADD_ITEM"
    assert understood["intent"]["resolved_products"][0]["product_id"] == PRODUCT["product_id"]


def test_new_visible_product_snapshot_supersedes_old_snapshot(monkeypatch):
    session = _session("visible-supersession")
    _sync_local(monkeypatch)
    _render_visible_products(session, [dict(PRODUCT)])
    replacement = {**PRODUCT, "product_id": "P-SYNTH-2", "product_name": "Bánh Mẫu"}
    _render_visible_products(session, [replacement])

    understood = order_flow_graph._understand(_state(session, "món số 1 giá bao nhiêu?"))
    assert understood["intent"]["products"][0]["product_id"] == "P-SYNTH-2"


@pytest.mark.parametrize("message", [
    "không lấy tại quán nữa, đổi sang giao tận nơi",
    "bỏ lấy tại quán, chọn giao tận nơi",
    "đổi từ lấy tại quán sang giao tận nơi",
    "thay lấy tại quán bằng giao tận nơi",
    "không phải lấy tại quán, mà giao tận nơi",
])
def test_negated_fulfillment_replacement_is_not_a_conflict(message):
    assert agent_service._checkout_choice_conflict(message) is None
    assert agent_service._explicit_checkout_choices(message)["delivery_type"] == "GIAO_TAN_NOI"


def test_pickup_to_delivery_clears_only_incompatible_state_and_keeps_cod(monkeypatch):
    session = _session("pickup-delivery")
    cart_manager.add_item(session, PRODUCT["product_id"], PRODUCT["product_name"], 42000)
    cart_manager.set_checkout_context(
        session,
        checkout_requested=True,
        voucher_decided=True,
        voucher_code="SYNTH",
        delivery_type="MANG_DI",
        payment_method="THANH_TOAN_KHI_NHAN_HANG",
        store_location={"kind": "area", "value": "Phường Mẫu"},
        branch_candidates=[{"branch_id": "B-SYNTH-1"}],
        location_candidate_snapshot={"candidates": [{"provider_ref_id": "LOC-SYNTH-1"}]},
        selected_location_candidate={"provider_ref_id": "LOC-SYNTH-1"},
        summary_fingerprint="old-summary",
        checkout_action_id="old-action",
    )
    cart_manager.set_branch(session, "B-SYNTH-1", "Cửa Hàng Mẫu")
    cart_manager.set_pending_action(session, "select_location_candidate", {"count": 1})
    _sync_local(monkeypatch)

    result = order_flow_graph.run_order_flow(
        session,
        "thôi không lấy tại quán nữa, đổi sang giao tận nơi và vẫn thanh toán COD",
    )
    prefs = cart_manager.get_checkout_prefs(session)

    assert prefs["delivery_type"] == "GIAO_TAN_NOI"
    assert prefs["payment_method"] == "THANH_TOAN_KHI_NHAN_HANG"
    assert prefs["voucher_code"] == "SYNTH"
    assert prefs.get("store_location") is None
    assert prefs.get("location_candidate_snapshot") is None
    assert prefs.get("selected_location_candidate") is None
    assert prefs.get("branch_candidates") is None
    assert prefs.get("summary_fingerprint") is None and prefs.get("checkout_action_id") is None
    assert cart_manager.get_branch(session) is None
    assert "địa chỉ giao" in result["reply"].lower()
    assert result.get("checkout_payload") is None


@pytest.mark.parametrize("target,expected", [
    ("lấy tại quán", "MANG_DI"),
    ("dùng tại chỗ", "TAI_CHO"),
])
def test_reverse_delivery_correction_remains_safe(target, expected):
    message = f"không giao tận nơi nữa, đổi sang {target}"
    assert agent_service._checkout_choice_conflict(message) is None
    assert agent_service._explicit_checkout_choices(message)["delivery_type"] == expected


def test_two_affirmative_fulfillment_values_still_conflict():
    assert agent_service._checkout_choice_conflict("giao tận nơi và lấy tại quán") == "fulfillment"


def _seed_branch_owner(session: str):
    candidates = [
        {"branch_id": "B-SYNTH-1", "branch_name": "Cửa Hàng Một",
         "address": "1 Đường Mẫu", "distance_km": 1.25,
         "availability_status": "available"},
        {"branch_id": "B-SYNTH-2", "branch_name": "Cửa Hàng Hai",
         "address": "2 Đường Mẫu", "distance_km": 2.5,
         "availability_status": "available"},
    ]
    cart_manager.add_item(session, PRODUCT["product_id"], PRODUCT["product_name"], 42000)
    cart_manager.set_checkout_context(
        session,
        checkout_requested=True,
        voucher_decided=True,
        delivery_type="MANG_DI",
        payment_method="THANH_TOAN_KHI_NHAN_HANG",
        branch_candidates=candidates,
    )
    cart_manager.set_pending_action(session, "select_branch", {"count": len(candidates)})
    return candidates


@pytest.mark.parametrize("message,expected_name", [
    ("cửa hàng số 1 ở đâu và cách tôi bao xa? tôi chưa chọn nhé", "Cửa Hàng Một"),
    ("chi nhánh số 2 cách tôi bao xa?", "Cửa Hàng Hai"),
])
def test_branch_ordinal_info_is_read_only_and_preserves_owner(monkeypatch, message, expected_name):
    session = _session("branch-info")
    candidates = _seed_branch_owner(session)
    _sync_local(monkeypatch)

    result = order_flow_graph.run_order_flow(session, message)
    prefs = cart_manager.get_checkout_prefs(session)

    assert expected_name in result["reply"] and "km" in result["reply"]
    assert result.get("checkout_payload") is None
    assert prefs.get("checkout_action_id") is None
    assert cart_manager.get_branch(session) is None
    assert prefs["branch_candidates"] == candidates
    assert (cart_manager.get_pending_action(session) or {}).get("type") == "select_branch"


def test_branch_select_after_info_uses_same_snapshot_and_can_quote(monkeypatch):
    session = _session("branch-info-select")
    candidates = _seed_branch_owner(session)
    _sync_local(monkeypatch)

    info = order_flow_graph.run_order_flow(session, "cửa hàng số 1 ở đâu? tôi chưa chọn")
    assert info.get("checkout_payload") is None

    def resolve(sid, message, history=None):
        assert sid == session and "chọn" in message
        assert cart_manager.get_checkout_prefs(sid)["branch_candidates"] == candidates
        cart_manager.set_branch(sid, candidates[0]["branch_id"], candidates[0]["branch_name"])
        cart_manager.clear_pending_action(sid)
        return {"status": "ok", "branch_id": candidates[0]["branch_id"]}

    def advance(sid, _resolved):
        cart_manager.set_checkout_context(sid, checkout_action_id="synthetic-action")
        return {"reply": "Tóm tắt cuối cùng.", "checkout_payload": {
            "action_id": "synthetic-action",
        }, "tool_calls_log": [], "error": None}

    monkeypatch.setattr(agent_service, "_resolve_pending_branch_choice", resolve)
    monkeypatch.setattr(agent_service, "_advance_checkout_if_ready", advance)

    selected = order_flow_graph.run_order_flow(session, "tôi chọn chi nhánh số 1")
    assert selected["checkout_payload"]["action_id"] == "synthetic-action"
    assert cart_manager.get_branch(session) == candidates[0]["branch_id"]


def test_invalid_branch_info_ordinal_is_specific_and_read_only(monkeypatch):
    session = _session("branch-invalid-info")
    _seed_branch_owner(session)
    _sync_local(monkeypatch)

    result = order_flow_graph.run_order_flow(session, "cửa hàng số 9 ở đâu?")

    assert "2 cửa hàng" in result["reply"] and "số 9" in result["reply"]
    assert result.get("checkout_payload") is None
    assert cart_manager.get_branch(session) is None
    assert (cart_manager.get_pending_action(session) or {}).get("type") == "select_branch"


def test_explicit_branch_select_semantics_remains_transactional():
    session = _session("branch-select")
    _seed_branch_owner(session)
    understood = order_flow_graph._understand(_state(session, "tôi chọn chi nhánh số 1"))
    assert understood["intent"]["intent"] == "PENDING_BRANCH"


def test_explicit_namespaces_win_when_product_and_branch_snapshots_coexist():
    session = _session("cross-namespace")
    candidates = _seed_branch_owner(session)
    cart_manager.set_checkout_context(
        session,
        last_product_suggestions=[PRODUCT],
        product_suggestion_snapshots={"drink": [PRODUCT]},
        last_branch_discovery_candidates=candidates,
    )

    product = order_flow_graph._understand(_state(session, "món số 1 giá bao nhiêu?"))["intent"]
    branch = order_flow_graph._understand(_state(session, "cửa hàng số 1 ở đâu?"))["intent"]
    assert product["intent"] == "PRODUCT_INFO"
    assert branch["intent"] == "READ_ONLY_BRANCH_FOLLOWUP"


def test_branch_info_can_never_create_order_or_action_id(monkeypatch):
    session = _session("branch-order-safety")
    _seed_branch_owner(session)
    _sync_local(monkeypatch)
    monkeypatch.setattr(cart_tools, "execute_confirm_checkout", lambda *_args, **_kwargs: pytest.fail(
        "read-only branch information must never create an order"
    ))

    result = order_flow_graph.run_order_flow(session, "cửa hàng số 1 thế nào? tôi chưa chọn")
    assert result.get("checkout_payload") is None
    assert cart_manager.get_checkout_prefs(session).get("checkout_action_id") is None
    assert not any(row.get("tool") == "confirm_checkout" for row in result.get("tool_calls_log") or [])
