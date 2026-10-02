"""Cart write outcome and pending-state reconciliation regressions."""
from types import SimpleNamespace
import copy

import pytest
import requests

from src.agents import agent_service, order_flow_graph
from src.common import cart_manager, groq_service
from src.function_calling import helpers
from src.function_calling.tools import cart_tools, product_tools


MATCHA = "Matcha thử"
OPTIONS = {
    "status": "ok", "product_id": "11", "product_name": MATCHA,
    "options": {
        "Kích thước": ["Vừa", "Lớn"],
        "Lượng đá": ["Bình thường", "Ít đá"],
        "Topping": ["Hạt Sen"],
    },
    "option_groups": [
        {"name": "Kích thước", "values": ["Vừa", "Lớn"], "required": True,
         "multiple": False, "fixed": False, "default_value": "Vừa"},
        {"name": "Lượng đá", "values": ["Bình thường", "Ít đá"], "required": False,
         "multiple": False, "fixed": False, "default_value": "Bình thường"},
        {"name": "Topping", "values": ["Hạt Sen"], "required": False,
         "multiple": True, "fixed": False, "default_value": []},
    ],
}


class _Rows:
    def __init__(self, one=None, many=None):
        self.one, self.many = one, many or []

    def fetchone(self):
        return self.one

    def fetchall(self):
        return self.many


class _Connection:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, statement, _params=None):
        sql = str(statement)
        if "bien_the_san_pham" in sql:
            return _Rows(many=[])
        return _Rows(one=("", 50000))


class _Response:
    def __init__(self, payload, status_code=201):
        self.payload = payload
        self.status_code = status_code

    def json(self):
        return self.payload


def _authenticated_add(monkeypatch, post):
    monkeypatch.setattr(helpers, "_require_valid_session", lambda _sid: "customer")
    monkeypatch.setattr(helpers, "_get_service_jwt", lambda _uid: "token")
    monkeypatch.setattr(helpers, "_get_engine", lambda: SimpleNamespace(connect=lambda: _Connection()))
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: {
        **cart_manager.get_cart(sid), "authoritative": True, "cart_sync_status": "ok"})
    monkeypatch.setattr(cart_tools.requests, "post", post)


def _envelope(operation_id, *, replayed=False):
    return {
        "cart_id": "user:customer", "cart_version": 1, "user_id": "customer",
        "operation_id": operation_id, "already_processed": replayed,
        "items": [{"id": 1, "product_id": "11", "product_name": MATCHA,
                   "quantity": 1, "unit_price": 50000, "size": "Vừa",
                   "luong_da": "Bình thường", "toppings": []}],
    }


def test_add_cart_read_timeout_replays_same_operation_id(monkeypatch):
    operation_id = "stable-add-operation"
    calls = []

    def post(_url, **kwargs):
        calls.append(copy.deepcopy(kwargs))
        if len(calls) == 1:
            raise requests.exceptions.ReadTimeout("response lost after commit")
        return _Response(_envelope(operation_id, replayed=True))

    _authenticated_add(monkeypatch, post)
    result = cart_tools.execute_add_to_cart(
        "customer:conversation:timeout", "11", MATCHA, 50000,
        size="Vừa", luong_da="Bình thường", operation_id=operation_id,
    )

    assert result["status"] == "ok" and result["already_processed"] is True
    assert len(calls) == 2
    assert {call["headers"]["X-Idempotency-Key"] for call in calls} == {operation_id}
    assert cart_manager.get_cart("customer:conversation:timeout")["item_count"] == 1


def test_add_cart_timeout_returns_outcome_unknown_with_same_operation_id(monkeypatch):
    session = "customer:conversation:unknown-add"
    operation_id = "same-unknown-operation"
    calls = []
    _authenticated_add(monkeypatch, lambda _url, **kwargs: (
        calls.append(copy.deepcopy(kwargs)) or (_ for _ in ()).throw(requests.exceptions.ReadTimeout("slow"))))

    result = cart_tools.execute_add_to_cart(
        session, "11", MATCHA, 50000, size="Vừa",
        luong_da="Bình thường", operation_id=operation_id,
    )

    assert result["status"] == "outcome_unknown"
    assert result["operation_id"] == operation_id
    assert len(calls) == 2
    assert {call["headers"]["X-Idempotency-Key"] for call in calls} == {operation_id}
    assert "chưa xác nhận" in result["message"].lower()


@pytest.mark.parametrize("response,expected", [
    (_Response({"code": "CART_MUTATION_IN_PROGRESS", "message": "processing"}, 409), "outcome_unknown"),
    (_Response({"code": "INVALID_CART_ITEM", "message": "invalid"}, 422), "known_failure"),
])
def test_cart_mutation_http_status_has_structured_outcome(monkeypatch, response, expected):
    monkeypatch.setattr(cart_tools.requests, "post", lambda *_a, **_k: response)
    result = cart_tools._post_add_cart_with_reconciliation(
        "http://order/cart", "http://fallback/cart", {}, {"X-Idempotency-Key": "op"}, "op")
    assert result["status"] == expected
    assert result["operation_id"] == "op"


def test_cart_mutation_connect_timeout_is_known_unavailable(monkeypatch):
    calls = []
    monkeypatch.setattr(cart_tools.requests, "post", lambda *_a, **_k: (
        calls.append(1) or (_ for _ in ()).throw(requests.exceptions.ConnectTimeout("no connection"))))
    result = cart_tools._post_add_cart_with_reconciliation(
        "http://order/cart", "http://fallback/cart", {}, {"X-Idempotency-Key": "op"}, "op")
    assert result["status"] == "unavailable"
    assert len(calls) == 1


def _pending_matcha(session):
    item = agent_service._pending_option_item(
        {"product_id": "11", "product_name": MATCHA, "quantity": 1}, OPTIONS)
    item["operation_id"] = "pending-add-operation"
    cart_manager.set_pending_products(session, [item])
    cart_manager.set_pending_action(session, "fill_options", {"count": 1})


def test_add_cart_timeout_preserves_reconciliation_state(monkeypatch):
    session = "customer:conversation:pending-unknown"
    _pending_matcha(session)
    monkeypatch.setattr(product_tools, "execute_check_price_and_stock", lambda **_kwargs: {
        "status": "ok", "products": [{"product_id": "11", "product_name": MATCHA,
                                        "final_price": 50000}]})
    operations = []
    monkeypatch.setattr(cart_tools, "execute_add_to_cart", lambda **kwargs: (
        operations.append(kwargs["operation_id"]) or {
            "status": "outcome_unknown", "operation_id": kwargs["operation_id"],
            "message": "unknown"}))

    result = agent_service._complete_pending_products_from_options(session, "theo mặc định")
    prefs = cart_manager.get_checkout_prefs(session)
    assert operations == ["pending-add-operation"]
    assert prefs["pending_products"][0]["operation_id"] == "pending-add-operation"
    assert prefs["pending_products"][0]["mutation_status"] == "outcome_unknown"
    assert prefs["pending_action"]["type"] == "fill_options"
    assert "chưa xác nhận" in result["reply"].lower()


def test_fill_options_action_without_products_is_repaired_before_routing():
    session = "customer:conversation:empty-fill-options"
    cart_manager.set_pending_action(session, "fill_options", {})
    state = {"session_id": session, "user_message": "xem menu", "history": [],
             "cart": cart_manager.get_cart(session)}
    order_flow_graph._understand(state)
    assert cart_manager.get_pending_action(session) is None


@pytest.mark.parametrize("follow_up", ["ý tôi là theo mặc định đi", "oke"])
def test_next_turn_after_cart_timeout_reconciles_pending_add(monkeypatch, follow_up):
    session = "customer:conversation:resume-add"
    _pending_matcha(session)
    monkeypatch.setattr(product_tools, "execute_check_price_and_stock", lambda **_kwargs: {
        "status": "ok", "products": [{"product_id": "11", "product_name": MATCHA,
                                        "final_price": 50000}]})
    calls = []

    def add(**kwargs):
        calls.append(kwargs["operation_id"])
        if len(calls) == 1:
            return {"status": "outcome_unknown", "operation_id": kwargs["operation_id"],
                    "message": "unknown"}
        cart = cart_manager.add_item(session, "11", MATCHA, 50000, size=kwargs["size"],
                                     luong_da=kwargs["luong_da"])
        return {"status": "ok", "operation_id": kwargs["operation_id"],
                "already_processed": True, "cart": cart}

    monkeypatch.setattr(cart_tools, "execute_add_to_cart", add)
    first = agent_service._complete_pending_products_from_options(session, "theo mặc định")
    pending = cart_manager.get_checkout_prefs(session)["pending_products"][0]
    assert pending["mutation_status"] == "outcome_unknown"
    assert cart_manager.get_pending_action(session)["type"] == "fill_options"
    assert "chưa xác nhận" in first["reply"].lower()

    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda sid: {
        **cart_manager.get_cart(sid), "authoritative": True, "cart_sync_status": "ok"})
    monkeypatch.setattr(order_flow_graph, "_browse_ask_more", lambda *_a, **_k: pytest.fail("generic LLM reached"))
    second = order_flow_graph.run_order_flow(session, follow_up)

    assert calls == ["pending-add-operation", "pending-add-operation"]
    assert cart_manager.get_cart(session)["item_count"] == 1
    assert not cart_manager.get_checkout_prefs(session).get("pending_products")
    assert cart_manager.get_pending_action(session)["type"] == "ask_more_items"
    assert "đã thêm" in second["reply"].lower()


def test_authoritative_cart_change_does_not_orphan_fill_options():
    session = "customer:conversation:external-cart-change"
    _pending_matcha(session)
    cart_manager.set_checkout_context(session, summary_fingerprint="old", checkout_action_id="old-action",
                                      summary_amounts={"final_total": 50000}, voucher_code="SAVE20",
                                      discount_amount=10000, voucher_decided=True)
    cart_manager.replace_items_from_order_cart(session, [{
        "id": 8, "product_id": "22", "product_name": "Cake", "quantity": 1,
        "unit_price": 30000,
    }], cart_id="user:customer", cart_version=2, user_id="customer")

    prefs = cart_manager.get_checkout_prefs(session)
    assert prefs["pending_products"][0]["product_name"] == MATCHA
    assert prefs["pending_action"]["type"] == "fill_options"
    assert cart_manager.get_cart(session)["items"][0]["product_name"] == "Cake"
    assert not prefs.get("summary_fingerprint") and not prefs.get("checkout_action_id")
    assert not prefs.get("summary_amounts") and prefs["voucher_revalidation_required"] is True


def test_existing_different_configuration_does_not_resolve_unknown_add():
    session = "customer:conversation:exact-config"
    _pending_matcha(session)
    pending = cart_manager.get_checkout_prefs(session)["pending_products"][0]
    pending.update({"selected_options": {"size": "Lớn", "luong_da": "Ít đá", "toppings": []},
                    "mutation_status": "outcome_unknown"})
    cart_manager.set_pending_products(session, [pending])
    cart_manager.replace_items_from_order_cart(session, [{
        "id": 1, "product_id": "11", "product_name": MATCHA, "quantity": 1,
        "unit_price": 50000, "size": "Vừa", "luong_da": "Bình thường", "toppings": [],
    }], cart_id="user:customer", cart_version=1, user_id="customer")
    prefs = cart_manager.get_checkout_prefs(session)
    assert prefs["pending_products"][0]["mutation_status"] == "outcome_unknown"
    assert prefs["pending_products"][0]["selected_options"]["size"] == "Lớn"
    assert prefs["pending_action"]["type"] == "fill_options"


def _tool_call(call_id, product_name, *, reverse=False):
    args = ({"unused": 1, "product_name": product_name} if reverse
            else {"product_name": product_name, "unused": 1})
    return SimpleNamespace(id=call_id, function=SimpleNamespace(
        name="get_product_insights", arguments=groq_service.json.dumps(args)))


def _agent_response(*, tool_call=None, content=""):
    message = SimpleNamespace(content=content, tool_calls=[tool_call] if tool_call else [])
    return SimpleNamespace(choices=[SimpleNamespace(message=message)])


def test_repeated_identical_cached_tool_call_does_not_exhaust_rounds(monkeypatch):
    responses = iter([
        _agent_response(tool_call=_tool_call("one", "Matcha")),
        _agent_response(tool_call=_tool_call("two", "Matcha", reverse=True)),
        _agent_response(content="Matcha có vị trà dịu."),
    ])
    completion_kwargs = []
    def create(**kwargs):
        completion_kwargs.append(kwargs)
        return next(responses)
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    monkeypatch.setattr(groq_service, "_llm_clients", [client])
    monkeypatch.setattr(groq_service, "_get_groq_client", lambda: client)
    monkeypatch.setattr(groq_service, "_resolve_chat_model", lambda _client: "test-model")
    executions = []
    result = groq_service.groq_agent_chat(
        [{"role": "user", "content": "Matcha thế nào?"}],
        tools=[{"type": "function", "function": {"name": "get_product_insights"}}],
        tool_executors={"get_product_insights": lambda args: executions.append(args) or {
            "status": "ok", "message": "Có vị trà dịu"}}, max_tool_rounds=5,
    )
    assert len(executions) == 1
    assert result["reply"] == "Matcha có vị trà dịu."
    assert result["error"] is None
    assert "tools" in completion_kwargs[0] and "tools" in completion_kwargs[1]
    assert "tools" not in completion_kwargs[2]


def test_tool_loop_guard_allows_same_tool_with_different_arguments(monkeypatch):
    responses = iter([
        _agent_response(tool_call=_tool_call("one", "Matcha")),
        _agent_response(tool_call=_tool_call("two", "Americano")),
        _agent_response(content="Mình đã so sánh hai món."),
    ])
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(
        create=lambda **_kwargs: next(responses))))
    monkeypatch.setattr(groq_service, "_llm_clients", [client])
    monkeypatch.setattr(groq_service, "_get_groq_client", lambda: client)
    monkeypatch.setattr(groq_service, "_resolve_chat_model", lambda _client: "test-model")
    executions = []
    result = groq_service.groq_agent_chat(
        [{"role": "user", "content": "So sánh"}],
        tools=[{"type": "function", "function": {"name": "get_product_insights"}}],
        tool_executors={"get_product_insights": lambda args: executions.append(args) or {"status": "ok"}},
        max_tool_rounds=5,
    )
    assert [entry["product_name"] for entry in executions] == ["Matcha", "Americano"]
    assert result["reply"] == "Mình đã so sánh hai món."
