# Current chat/cart flow audit (Phase 0)

Audit date: 2026-09-26. This document records the local, uncommitted runtime
path as inspected; it does not replace or reset any existing work.

## Runtime path

`POST /ai/agent/chat` in `services/ai-service/main.py` authenticates the
session, scopes the working session as `<user>:conversation:<conversation>`,
loads request-level response deduplication from `conversation_memory`, and
calls `agent_service.run_agent`.

`run_agent` currently routes unconditionally to
`order_flow_graph.run_order_flow`. If LangGraph is unavailable, that function
falls back to `_run_agent_impl(..., allow_model_mutations=False)`. The graph's
normal path is `sync_cart -> understand_turn -> execute_action ->
render_response`; the free-form legacy model path is also invoked with model
write tools removed. There is no environment feature flag selecting a second
write-capable orchestrator.

For authenticated sessions, `cart_tools._customer_session_id` strips the
conversation suffix and `sync_authoritative_cart` reads `GET /cart/:userId`,
then uses `cart_manager.replace_items_from_order_cart` as a *replacement*
mirror. Cart writes currently use `POST /cart`, `PATCH /cart/:lineId`, and
`DELETE /cart/:lineId` in Order Service. The web customer cart also calls
Order Service.

## Writers/readers and duplicate risks

* Order Service `CartService` owns persisted `orders.gio_hang` rows and
  calculates product price from menu data.
* `cart_manager` still has legacy local `add_item`, `remove_item`, and
  `clear_cart` functions. Authenticated `execute_add_to_cart` does not use
  its local writer, but guest/local compatibility paths and old tests do.
* `pending_products`, product suggestion snapshots, branch candidates, and
  voucher candidates are conversation working state in `cart_manager`.
* `client_message_id` deduplicates an HTTP response in `conversation_memory`,
  but did not yet deduplicate a cart business operation. A retry after the
  write reaches Order Service could therefore increment a line twice.
* `execute_get_cart` currently falls back to the mirror after an authenticated
  Order Service read failure. That mirror must be labelled stale, never
  represented as confirmed data.

## Phase-0 decision

The graph's deterministic paths are retained. No broad LangGraph refactor is
required for the cart fix. The next changes add an operation identity at the
graph/tool boundary and persistent Order Service idempotency before changing
any larger state model.
