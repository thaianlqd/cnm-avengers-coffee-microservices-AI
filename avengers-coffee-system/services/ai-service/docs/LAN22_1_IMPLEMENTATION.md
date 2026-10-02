# LAN22.1 implementation and static review

Starting branch: `branch_thaian`. HEAD: `e2bd8bbe2c6ac4a6075fa6ea61f9a8a604440194` (`sua chatbot lan 22`). Starting working tree was clean.

Tracked changes: `src/agents/tool_capabilities.py`, one paragraph in `docs/LLM_TOOL_ORCHESTRATOR.md`, and this report. Ignored root `.env` has four local agent-setting changes. Committed Compose/example/provider tier defaults are unchanged. No business service, business tool, gateway handler, executor, RAG internals, system prompt, Redis implementation or test was changed.

## Inventory and exposure

Backend inventory remains **19 READ + 14 WRITE = 33**, before and after. The full schema builder and gateway handler/executor mappings remain intact. The default ordering selector no longer publishes `get_user_profile`, `get_order_history`, `get_order_details`, `track_order_status`, `get_top_rated_stores` or `get_store_reviews`, including when authentication or branch context exists. Those capabilities remain registered for separately designed secondary contexts/direct-library use; this pass does not implement a secondary intent router.

The only policy is `capabilities_for_context`. The existing gateway uses its selected set for published schemas, executor maps and write revalidation; hidden proposals still fail validation. The selector receives canonical server/business state and no customer-language input. Product context requires a canonical product ID from candidates, focus, selected ID, staged product or cart. Discovery can establish that context for the next inference round.

Product-specific options/reviews/price are gated on that context. `get_product_description` is published for product-focused browsing or staged products; during non-staged cart/checkout, `search_knowledge_base` provides the same approved product taste/description/ingredient authority with canonical entity references. Existing RAG grounding/allergen restrictions are untouched.

`get_applicable_vouchers` is published at the voucher gate/revalidation or after a voucher decision, keeping later voucher changes reachable. `get_payment_options` is published when voucher decision/checkout choices have established checkout progress. Quote reads remain available with a nonempty cart. Draft cart edit and choice writes remain available at voucher, payment and summary stages. `request_checkout` now requires voucher decision without revalidation, no staged/unresolved product, a supported fulfillment type, branch, payment, and a confirmed address for delivery. The handler independently checks prerequisites again.

## Representative static surfaces

These sets are derived by reading selector branches, **without executing the selector, fixtures, tests, providers or business authorities**. Counts apply to the stated representative state, not all states within a stage. Canonical snapshots, a currently applied voucher, explicit early checkout choices or unresolved product state can add/remove capabilities.

Set abbreviations below expand to these exact capability names:

* **B (4)**: `filter_catalog`, `get_recommendations`, `search_knowledge_base`, `get_cart`.
* **P (3)**: `get_product_options`, `get_product_insights`, `check_price_and_stock`.
* **C (8 reads)**: B + P + `get_cart_quote`.
* **E (5 writes)**: `resolve_location`, `add_to_cart`, `update_cart_item`, `remove_cart_item`, `set_checkout_choices`.

All cart examples below are authenticated, authoritatively verified, contain canonical product/line IDs and have no checkout submission. Unless stated otherwise there are no staged products, current voucher code, or unrelated visible voucher/branch/location candidates. All confirmation examples require a current prior-turn action and fresh fingerprint/expiry.

| Representative state | Count | Exact exposed set (expand B/P/C/E above) | Why writes are exposed |
| --- | ---: | --- | --- |
| Guest browsing, empty cart/no product | 5 | B + `find_nearest_branch` | None; read-only discovery/location consultation. |
| Authenticated browsing, empty cart/no product | 6 | B + `find_nearest_branch`, `resolve_location` | Resolve supports literal read-only location consultation; `for_checkout=true` still fails without its handler prerequisites. |
| Product-focused shopping, empty cart | 11 | B + P + `get_product_description`, `find_nearest_branch`, `resolve_location`, `add_to_cart` | Canonical product and verified authenticated draft allow add/staging; resolve retains location consultation. |
| Nonempty cart, SHOPPING/CART_REVIEW, no checkout choices | 14 | C + E + `finish_cart` | Exact line edit/remove, canonical add and mutable choices; finish is the legal immediate voucher transition; resolve can consult locations. |
| Cart editing with a staged product, SHOPPING | 15 | C + E + `get_product_description`, `discard_pending_product` | Options completion/add and exact staged discard are legal; finish is hidden until all unresolved products are complete/discarded. |
| Voucher decision, VOUCHER/select_voucher, canonical voucher candidates, no checkout choices | 16 | C + E + `get_applicable_vouchers`, `skip_voucher`, `apply_voucher` | Active gate permits explicit skip or revalidated eligible candidate application; draft cart/choice interruptions remain legal. Without visible vouchers, apply is absent (15). |
| Pickup/dine-in branch selection, CART_READY, voucher skipped, canonical branches, no selected branch/payment | 17 | C + E + `get_applicable_vouchers`, `get_payment_options`, `ask_branch`, `set_session_branch` | Canonical branch selection is relevant to pickup/dine-in; gateway also requires prior-turn candidates and compatible stock. Summary is hidden until branch/payment exist. |
| Delivery/location, CART_READY, voucher skipped, canonical location candidates, no selected branch/payment | 16 | C + E + `get_applicable_vouchers`, `get_payment_options`, `select_location_candidate` | Literal resolution/canonical candidate selection are legal; immutable coordinates/address and completeness checks remain in the gateway. Summary is not ready. |
| Checkout ready, delivery, CART_READY, voucher skipped, branch/address confirmed/payment present | 16 | C + E + `get_applicable_vouchers`, `get_payment_options`, `request_checkout` | All summary prerequisites are present; request can render canonical confirmation UI. Draft cart/payment/fulfillment changes stay legal and invalidate summaries. |
| Summary/fresh final confirmation, delivery, same ready choices and prior-turn action | 17 | C + E + `get_applicable_vouchers`, `get_payment_options`, `request_checkout`, `confirm_checkout` | Request can re-render; confirm requires the entry action, freshness and pending expiry. Handler still independently requires explicit current confirmation, fingerprint/action/expiry and idempotency. |
| Repair of update_cart_item in that summary state | 11 | C + `get_applicable_vouchers`, `get_payment_options`, `update_cart_item` | Only the same operation remains writable; all unrelated writes, including confirm/request, are removed. |
| Final synthesis, any state | 0 | Empty set | No tools or executors; provider fallback cannot execute a mutation. |

LAN22's documented baseline was approximately guest 9, authenticated browsing 15, shopping 23, voucher 24 and checkout/confirmation 26–27. Representative LAN22.1 surfaces above are 5, 6, 11–15, 16 and 16–17. Guest browsing with product context is 9. Pickup summaries add `ask_branch`, and visible compatible branch candidates add `set_session_branch`; canonical voucher candidates add `apply_voucher`, an active code adds `remove_voucher`, and location candidates add `select_location_candidate`. Simultaneous optional namespaces can therefore exceed the representative counts. The voucher example is above the suggested 8–14 range because all three cart-change tools, checkout choice changes, geo consultation, fresh quote, and product consultation remain reachable. Targets are not runtime acceptance claims or hard-coded caps.

## Continuity and safety review

* Browse → canonical discovery → product tools/add: artifact candidates unlock the next surface; IDs/options/prices still come from providers.
* Voucher/payment → product consultation: B and P persist for canonical products; approved RAG remains available without changing the pending decision.
* Checkout → cart/payment change: add/edit/remove and choice tools persist while the draft is mutable; existing handlers invalidate summary action/fingerprint.
* Nearest branch before checkout: `find_nearest_branch` is available for browsing/guests; authenticated cart turns use `resolve_location` with `for_checkout=false` for read-only consultation.
* Shopping → checkout: `finish_cart` stays available before the voucher transition. Once voucher, fulfillment, location/branch and payment prerequisites exist, `request_checkout` becomes available. Revalidation exposes finish again; an unresolved product blocks it.
* Later voucher changes: decided carts can read eligible candidates and apply a newly chosen canonical voucher; an active voucher can be removed. Eligibility is refreshed by the handler.
* Repair/final synthesis: same-write filtering and tools-disabled synthesis logic are unchanged. No provider fallback or mutation retry logic was modified.

Gateway cart refresh, schemas, canonical ID/ordinal/quantity/option checks, provider price/stock/voucher truth, branch/location/payment validation, final confirmation/fingerprint/action/expiry, operation IDs/idempotency/reconciliation and write fences are unchanged. Final confirmation exposure additionally requires an authenticated mutable draft. No language keywords, regex routing, demo entities, counts or utterances were added to production policy. Existing safety parsing is unchanged. Static inspection cannot establish real semantic quality; that remains for the user's manual testing.

## Local manual-test provider

Ignored root `.env` only:

```dotenv
AI_CHAT_ORCHESTRATOR_MODE=llm_tools
AI_AGENT_PROVIDER=gemini
AI_AGENT_MODEL=gemini-3.6-flash
AI_AGENT_FALLBACK_PROVIDERS=gemini
```

Explicit `AI_AGENT_MODEL` already overrides all tier pools for the chosen provider. `provider_order` deduplicates primary Gemini plus Gemini fallback to Gemini alone. Existing multi-account rotation continues; no keys were removed/changed/displayed. OpenAI credentials and committed tier/default architecture are preserved.

**Flash Lite exact API ID is not yet qualified for this guarded tool path; using the lowest already-configured Gemini candidate.** `gemini-3.6-flash` is the existing guarded default, Standard pool and local Standard setting. LAN21 reports one real authoritative read with it, but explicitly no Gemini matrix pass. Consequently this is a configured-compatible candidate, not a claimed full text/tools/JSON qualification or a verified price comparison.

The repository also contains `gemini-3.1-flash-lite` in `data-platform/web-ui/server/services/llm_service.py`, using native `generateContent` JSON without native tool calling or the guarded OpenAI-compatible endpoint. That configuration does not establish the required compatibility. The old `test_gemini_openai.py` names `gemini-1.5-flash` for plain chat, without tools/JSON or recorded success. Neither is sufficient evidence to replace the guarded candidate. No ID was guessed, UI label converted, online documentation queried, model list called, or provider request made.

Before manual chat consumes quota, the user should verify rebuilt service startup shows `agent_provider=gemini` and explicit `agent_model=gemini-3.6-flash`. Compose still defaults provider to OpenAI when the local override is absent. This task did not build/start Docker or query health/chat endpoints.

## Verification and working tree

Performed: source inspection; starting branch/HEAD/status; `.env` ignore/untracked verification; `git diff` review; `git diff --check`; no-import/no-execution syntax compilation of the changed Python file; AST-only before/after inventory and selector input/hardcoding inspection; tracked-diff/new-report secret audit against local credential values and credential-shaped strings. No imported application modules or executed selector states were used for the table.

Deliberately not run: pytest/npm/Jest/Playwright/E2E/regression/provider matrix/benchmarks; Gemini/OpenAI/Groq/OpenRouter/Cerebras or model-list API requests; Docker build/start/qualification; Redis integration; health/chat requests. No runtime acceptance or token/latency measurements are claimed.

Expected final `git status --short`: two modified tracked files (`tool_capabilities.py`, `LLM_TOOL_ORCHESTRATOR.md`) and this new report. `.env` stays ignored/untracked; no staged changes. **NO COMMIT PERFORMED. NO PUSH PERFORMED.**
