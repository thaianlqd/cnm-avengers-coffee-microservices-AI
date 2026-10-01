# LLM tool orchestration for customer ordering

The existing public endpoint and Web payload contract stay in place. The mode is selected before a turn in `agent_service.run_agent`. Normal Compose development/demo startup defaults to `llm_tools`; `legacy` remains an explicit rollback mode. Direct library callers with no deployment configuration retain the legacy fallback for compatibility.

## Actual call paths

Before LAN20: `POST /ai/agent/chat` → authorize session → durable conversation ownership and turn claim → scoped conversation → `run_agent` → `run_order_flow` → deterministic routing/graph → existing tools → canonical UI → completed turn and exchange persistence.

In `llm_tools`: the same HTTP ownership/claim boundary → `run_agent` → `run_llm_tool_turn` → Redis hints + refreshed authoritative state → existing `groq_agent_chat` provider loop → `GuardedToolGateway` → existing service/tool authority → validated response + `ToolArtifacts` UI → durable processed-turn persistence → bounded Redis update.

The gateway is the only executor map supplied to the new loop. It validates strict schemas, injects the server session, checks ownership and prerequisites, and validates canonical options and provider price before cart writes. It does not route Vietnamese phrases. The existing final-confirmation classifier remains a critical business safeguard.

## Modes and rollback

- `legacy`: unchanged deterministic graph.
- `llm_tools`: model chooses capabilities and arguments; guarded tools execute. There is no automatic fallback to the graph after a write.
- `shadow`: one bounded diagnostic proposal round with every executor blocked, no Redis save, no session writes. The legacy graph alone produces the customer response. This is a proposal diagnostic, not a second full tool simulation; it still incurs provider cost.

Normal local activation (AI only):

```sh
docker compose up -d --no-deps --build ai-service
```

Compose defaults to `AI_AGENT_PROVIDER=openai` and `AI_AGENT_MODEL=gpt-4o-mini`. Override both explicitly for another compatible configured provider/model. Rollback uses the same command with `AI_CHAT_ORCHESTRATOR_MODE=legacy`; `shadow` remains available for diagnostics. A rebuild has no source bind mount; always verify runtime source identity after edits.

## Conversation hints and budgets

`agent_memory.py` uses the existing Redis service with a SHA-256 key of the server-scoped customer/conversation ID. Default TTL is 1800 seconds, refreshed on save. Up to eight user/assistant exchanges, sixteen canonical product candidates, five candidates in each other entity namespace and eight tool summaries are retained. Credential fields, JWT/Bearer values and known runtime secret values are redacted. No complete cart or replay record is stored in Redis. Reset removes old/new conversation keys after the existing reset authorization and unresolved-turn checks.

Redis read/write failure is graceful. Existing durable canonical hints remain useful; unknown deictic targets cannot authorize writes. Prices and displayed eligibility are hints only and are revalidated by business tools.

Defaults: `AI_AGENT_RECENT_TURNS=8`, `AI_AGENT_CONTEXT_CHAR_LIMIT=12000`, `AI_AGENT_MEMORY_CHAR_LIMIT=32000`, `AI_AGENT_LOOP_CHAR_LIMIT=24000`, `AI_AGENT_MAX_TOOL_ROUNDS=6`, `AI_AGENT_MAX_OUTPUT_TOKENS=600`. Context trims history and snapshots first. If the full cart cannot fit, it is omitted with an explicit unverified marker, never truncated into a seemingly complete cart. The loop also caps executed calls at four times the round budget and forces a final completion. Response-format/evidence repairs consume the same round budget.

Provider usage, model, context/schema/history/memory size, latency, tool rounds, guardrail result, reference source, mutation evidence and artifact counts are logged without hidden reasoning. The first version exposes the complete safe registry to preserve read interruptions and changes of mind; schema cost is measured rather than hidden.

## Business authority and replay

Menu/options and price providers, Order/cart, voucher, inventory, identity/geo and wallet tools retain authority. No service schema, RAG storage, frontend or Order implementation is rewritten. Tool schemas exclude client-controlled session/user IDs, prices, resolved coordinates and ownership flags.

Writes require authentication, a client turn ID, current verified cart where applicable, exact canonical target and relevant business prerequisites. Explicit cart ordinals/names are independently checked against the proposed line. A denied write must be repaired as the same operation; a different cart mutation is rejected. Once a required repair succeeds, the provider receives a tools-disabled completion round so it cannot mutate another target while composing prose. Stable operation IDs use existing mutation context and Order reconciliation. Repeated signatures within a turn execute once. Durable HTTP claims and processed-turn records handle retries/concurrency; Redis is not an idempotency store. Unknown write outcomes propagate to the HTTP reconciliation boundary, with no TypeError executor retry or graph fallback.

Branch commitment requires a candidate shown before the current turn plus fresh cart availability verification. Location candidates retain provider coordinates; selected full delivery addresses are promoted through the existing deterministic location adapter without geocoding again. An updated product cannot also be added in the same turn. Incomplete product selections are draft state until valid options and provider price are resolved.

Checkout requires a nonempty current cart, no incomplete products, completed voucher choice, valid fulfillment/payment, compatible branch and confirmed delivery address where needed. Confirmation requires a prior-turn action matching the current session, pending owner, expiry and cart fingerprint, plus explicit final confirmation in the current message. Rendering/reusing a summary never creates an order.

## RAG and public response

RAG retains its existing static/slow knowledge filters and canonical product resolution. Dynamic price, stock, voucher, payment and order data belong to their services. Unknown/missing evidence stays insufficient. Ingredient/allergen safeguards remain strict. Retrieved instructions are untrusted.

The model returns an internal envelope; only validated natural text is public. Normal static knowledge may use a natural paraphrase only when the response cites the complete approved evidence and visibly overlaps it. Ingredient/allergen and failed-grounding cases retain conservative evidence text. Compound price responses append actual provider facts. Unsupported currency claims, tool names, protocol JSON and unsupported mutation claims fall back to tool facts. A pending final summary must be re-rendered through `request_checkout`; cart lines plus a quote cannot substitute for its canonical confirmation UI. The server generates cards, cart and checkout artifacts. Replay/authentication internals are stripped recursively from public results.

## Scope and capability audit

This is the customer ordering BPM only. `tool_capabilities.py` records each capability's access/risk, authoritative owner, preconditions, result type and allowed stages. `ANY` means natural access across customer stages subject to handler prerequisites, not unrestricted mutation. Reads remain interruptible. All old executors are audited. Completed-order cancellation/rewriting and permanent preference inference are deliberately excluded from the new ordering registry; legacy mode retains those old tools.

The legacy graph, tier1, shopping/selection/pending parsers remain for rollback, regression and narrowly reused transaction helpers. No cleanup/removal is part of this migration.

## Verification

New tests use a scripted OpenAI-compatible provider through the actual existing loop and gateway. Real Redis integration is opt-in and touches a random test key only:

```sh
python -m pytest -q tests/test_llm_tool_orchestrator.py tests/test_guarded_tool_gateway.py tests/test_agent_redis_memory.py
AI_AGENT_REDIS_INTEGRATION=1 python -m pytest -q tests/test_agent_redis_integration.py
python -m pytest -q tests
```

Real configured-model simulations use isolated business fixtures and semantic trace assertions; they do not substitute for authenticated E2E. The external customer-journey harness remains unchanged. Missing E2E credentials block only authenticated acceptance. No customer order is created by isolated demos.

The product-description capability is a small guarded adapter to the existing knowledge tool; its descriptive name makes the distinction from customer-review ratings visible to the model. Reviews resolve canonical focus through current candidates or an exact catalog match. Model display selections may choose/reorder IDs only from current tool-produced product rows; the server still owns every card field. Native JSON mode is forwarded through the existing provider wrappers, consistent with [OpenAI JSON mode](https://developers.openai.com/api/docs/guides/structured-outputs), [Gemini compatibility](https://ai.google.dev/gemini-api/docs/openai) and [Groq API format controls](https://console.groq.com/docs/api-reference). Redis uses [redis-py](https://redis.io/docs/latest/develop/clients/redis-py/connect/) with short connection/socket timeouts.
