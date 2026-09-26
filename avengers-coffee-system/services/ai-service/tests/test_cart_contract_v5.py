"""Batch-1/2 regression coverage for versioned, authoritative cart mutations."""

import pytest

from src.common import cart_manager
from src.function_calling import helpers
from src.function_calling.tools import cart_tools


class _Response:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


def _cart(version, items):
    return {
        "cart_id": "user:customer-v5",
        "cart_version": version,
        "user_id": "customer-v5",
        "items": items,
        "item_count": sum(item["quantity"] for item in items),
        "subtotal": sum(item["unit_price"] * item["quantity"] for item in items),
    }


def _line(line_id, product_id, name, quantity, price, **options):
    return {
        "line_id": line_id,
        "product_id": product_id,
        "product_name": name,
        "quantity": quantity,
        "unit_price": price,
        "line_total": quantity * price,
        "size": options.get("size", "Nhỏ"),
        "toppings": options.get("toppings", []),
        "luong_da": options.get("luong_da", ""),
        "do_ngot": options.get("do_ngot", ""),
        "loai_sua": options.get("loai_sua", ""),
        "custom_attributes": options.get("custom_attributes", {}),
        "configuration_signature": options.get("configuration_signature", f"sig-{line_id}"),
    }


def _authenticated_order_service(monkeypatch, current_payload):
    monkeypatch.setattr(helpers, "_require_valid_session", lambda value: "customer-v5" if value == "customer-v5" else None)
    monkeypatch.setattr(helpers, "_get_service_jwt", lambda _user_id: "test-token")
    monkeypatch.setattr(
        cart_tools,
        "_order_service_request",
        lambda method, path, token, **_kwargs: _Response(current_payload["value"]),
    )


def test_authoritative_sync_replaces_versioned_snapshot_and_sees_web_change(monkeypatch):
    current = {"value": _cart(1, [_line(11, 101, "Nước", 2, 31000)])}
    _authenticated_order_service(monkeypatch, current)
    session = "customer-v5:conversation:one"

    first = cart_tools.sync_authoritative_cart(session)
    assert first["authoritative"] is True
    assert first["cart_id"] == "user:customer-v5"
    assert first["cart_version"] == 1
    assert first["item_count"] == 2
    assert first["subtotal"] == 62000
    assert first["items"][0]["line_id"] == 11

    # This represents a mutation made from the web Order Service endpoint.
    current["value"] = _cart(2, [
        _line(11, 101, "Nước", 2, 31000),
        _line(12, 202, "Bánh", 1, 29000),
    ])
    refreshed = cart_tools.sync_authoritative_cart(session)
    assert refreshed["cart_version"] == 2
    assert [(item["line_id"], item["quantity"]) for item in refreshed["items"]] == [(11, 2), (12, 1)]
    assert refreshed["subtotal"] == 91000


def test_new_conversation_reads_same_backend_cart_without_local_merge(monkeypatch):
    current = {"value": _cart(7, [_line(31, 303, "Matcha", 1, 55000)])}
    _authenticated_order_service(monkeypatch, current)

    first = cart_tools.sync_authoritative_cart("customer-v5:conversation:old")
    second = cart_tools.sync_authoritative_cart("customer-v5:conversation:new")

    assert first["cart_version"] == second["cart_version"] == 7
    assert first["items"] == second["items"]
    assert cart_manager.get_cart("customer-v5:conversation:new")["authoritative"] is True


def test_authenticated_read_and_write_do_not_use_stale_mirror_when_order_service_unavailable(monkeypatch):
    from src.agents.order_flow_graph import run_order_flow

    session = "customer-v5:conversation:offline"
    cart_manager.add_item(session, "old", "Bản sao cũ", 10000)
    monkeypatch.setattr(helpers, "_require_valid_session", lambda value: "customer-v5" if value == "customer-v5" else None)
    monkeypatch.setattr(cart_tools, "is_authenticated_cart_session", lambda _session: True)
    monkeypatch.setattr(cart_tools, "sync_authoritative_cart", lambda _session: (_ for _ in ()).throw(RuntimeError("offline")))
    monkeypatch.setattr(cart_tools, "execute_add_to_cart", lambda **_kwargs: pytest.fail("write must be blocked before a local fallback"))

    result = run_order_flow(session, "thêm Matcha vào giỏ", client_message_id="offline-add")
    assert result["tool_calls_log"] == [{
        "tool": "blocked_mutation",
        "result": {"status": "blocked", "reason": "authoritative_cart_unavailable", "intent": "ADD_ITEM"},
    }]
    assert cart_manager.get_cart(session)["items"][0]["product_name"] == "Bản sao cũ"

    unavailable = cart_tools.execute_get_cart(session)
    assert unavailable["status"] == "unavailable"
    assert "cart" not in unavailable


def test_ai_line_mutations_send_stable_operation_ids_and_replace_authoritative_mirror(monkeypatch):
    session = "customer-v5:conversation:mutations"
    current = {"value": _cart(10, [
        _line(41, 501, "Cake", 1, 29000),
        _line(42, 502, "Matcha", 1, 55000),
    ])}
    calls = []
    monkeypatch.setattr(helpers, "_require_valid_session", lambda value: "customer-v5" if value == "customer-v5" else None)
    monkeypatch.setattr(helpers, "_get_service_jwt", lambda _user_id: "test-token")

    def request(method, path, token, **kwargs):
        calls.append((method, path, kwargs.get("headers") or {}, kwargs.get("json")))
        if method == "PATCH" and path == "/cart/41":
            current["value"] = _cart(11, [_line(41, 501, "Cake", 2, 29000), _line(42, 502, "Matcha", 1, 55000)])
        elif method == "DELETE" and path == "/cart/41":
            current["value"] = _cart(12, [_line(42, 502, "Matcha", 1, 55000)])
        elif method == "DELETE" and path == "/cart/clear/customer-v5":
            current["value"] = _cart(13, [])
        return _Response(current["value"])

    monkeypatch.setattr(cart_tools, "_order_service_request", request)
    with cart_tools.mutation_operation_context(session, "turn-update"):
        updated = cart_tools.execute_update_cart_item(session, "41", {"quantity": 2})
    with cart_tools.mutation_operation_context(session, "turn-remove"):
        removed = cart_tools.execute_remove_cart_item(session, "41")
    with cart_tools.mutation_operation_context(session, "turn-clear"):
        cleared = cart_tools.execute_clear_cart(session)

    assert [updated["cart_version"], removed["cart_version"], cleared["cart_version"]] == [11, 12, 13]
    assert cart_manager.get_cart(session)["cart_version"] == 13
    assert cart_manager.get_cart(session)["items"] == []
    writes = [call for call in calls if call[0] in {"PATCH", "DELETE"}]
    assert writes[0][2]["X-Idempotency-Key"].endswith(":update_cart_line:0")
    assert writes[1][2]["X-Idempotency-Key"].endswith(":remove_cart_line:0")
    assert writes[2][2]["X-Idempotency-Key"].endswith(":clear_cart:0")
    assert writes[0][2]["X-Cart-User-Id"] == "customer-v5"
    assert writes[1][2]["X-Cart-User-Id"] == "customer-v5"
